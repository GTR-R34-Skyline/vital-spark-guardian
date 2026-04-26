// IoT simulator + edge processor (runs in-browser, simulating distributed devices).
// Generates realistic time-series with drift + occasional anomalies, smooths via
// moving average, filters noise, computes a simple statistical anomaly score, and
// inserts processed readings into the database.

import { supabase } from "@/integrations/supabase/client";
import { parseRule, RuleAST } from "@/lib/dsl/parser";
import { evaluateRule } from "@/lib/dsl/evaluator";

export interface PatientBaseline {
  id: string;
  display_label: string;
  baseline_hr: number;
  baseline_spo2: number;
  baseline_temp: number;
  monitoring_status?: string;
  is_discharged?: boolean;
}

interface PatientState {
  hr: number;
  spo2: number;
  temp: number;
  hrWindow: number[];
  spo2Window: number[];
  tempWindow: number[];
  anomalyTimer: number;
  status: MonitoringStatus;
  statusSince: number;
  criticalStartedAt?: number;
  stableStartedAt?: number;
}

const states = new Map<string, PatientState>();
const WINDOW = 5;
const TREND_WINDOW = 8;
const SAFE = {
  hrMin: 60,
  hrMax: 100,
  spo2Min: 95,
  tempMin: 36,
  tempMax: 37.6,
};
const CRITICAL_RULE = {
  hr: 120,
  spo2: 85,
  temp: 40,
};
const nowMs = () => Date.now();

export type MonitoringStatus =
  | "ACTIVE"
  | "WARNING"
  | "CRITICAL"
  | "RECOVERING"
  | "RECOVERED"
  | "DECEASED";

interface AlertInsert {
  patient_id: string;
  rule_id: string | null;
  level: "INFO" | "WARNING" | "CRITICAL";
  message: string;
  action?: string;
}

interface Reading {
  patient_id: string;
  hr: number;
  spo2: number;
  temp: number;
  smoothed_hr: number;
  smoothed_spo2: number;
  smoothed_temp: number;
  is_anomaly: boolean;
  anomaly_score: number;
  trend_hr: "increasing" | "decreasing" | "stable";
  trend_spo2: "increasing" | "decreasing" | "stable";
  trend_temp: "increasing" | "decreasing" | "stable";
}

interface StatusUpdate {
  id: string;
  monitoring_status: MonitoringStatus;
  status_since: string;
  is_discharged?: boolean;
}

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}
function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function nextValue(current: number, baseline: number, drift: number, min: number, max: number) {
  // gentle pull toward baseline + noise
  const pull = (baseline - current) * 0.08;
  const noise = rand(-drift, drift);
  return clamp(current + pull + noise, min, max);
}

function pushWindow(arr: number[], v: number): number[] {
  const next = [...arr, v];
  if (next.length > WINDOW) next.shift();
  return next;
}
const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
const std = (a: number[]) => {
  const m = avg(a);
  return Math.sqrt(avg(a.map((x) => (x - m) ** 2)));
};

// Noise filter — physiologically impossible values are dropped.
function isPhysiologicallyValid(hr: number, spo2: number, temp: number) {
  return hr > 20 && hr < 250 && spo2 > 50 && spo2 <= 100 && temp > 30 && temp < 45;
}

export function tickPatient(p: PatientBaseline) {
  if (p.is_discharged) return null;
  let s = states.get(p.id);
  if (!s) {
    s = {
      hr: p.baseline_hr,
      spo2: p.baseline_spo2,
      temp: p.baseline_temp,
      hrWindow: [],
      spo2Window: [],
      tempWindow: [],
      anomalyTimer: Math.floor(rand(8, 20)),
      status: (p.monitoring_status as MonitoringStatus) ?? "ACTIVE",
      statusSince: nowMs(),
    };
    states.set(p.id, s);
  }
  if (s.status === "DECEASED") return null;

  // Inject anomaly periodically; recovered/recovering patients are less spiky.
  const anomalyBoost = { hr: 0, spo2: 0, temp: 0 };
  s.anomalyTimer--;
  if (s.anomalyTimer <= 0) {
    const kind = Math.floor(rand(0, 3));
    const softened = s.status === "RECOVERING" || s.status === "RECOVERED";
    if (kind === 0) anomalyBoost.hr = softened ? rand(8, 18) : rand(35, 55);
    else if (kind === 1) anomalyBoost.spo2 = softened ? -rand(1, 3) : -rand(8, 14);
    else anomalyBoost.temp = softened ? rand(0.2, 0.6) : rand(1.8, 2.8);
    s.anomalyTimer = softened ? Math.floor(rand(30, 60)) : Math.floor(rand(15, 35));
  }

  // Status-aware generation bias.
  const hrBaseline =
    s.status === "CRITICAL" ? 122 : s.status === "RECOVERING" || s.status === "RECOVERED" ? 82 : p.baseline_hr;
  const spo2Baseline =
    s.status === "CRITICAL" ? 88 : s.status === "RECOVERING" || s.status === "RECOVERED" ? 97 : p.baseline_spo2;
  const tempBaseline =
    s.status === "CRITICAL" ? 39.2 : s.status === "RECOVERING" || s.status === "RECOVERED" ? 36.8 : p.baseline_temp;
  const hrDrift = s.status === "RECOVERED" ? 1.5 : 3;
  const spo2Drift = s.status === "RECOVERED" ? 0.3 : 0.6;
  const tempDrift = s.status === "RECOVERED" ? 0.08 : 0.15;

  const rawHr = nextValue(s.hr + anomalyBoost.hr, hrBaseline, hrDrift, 30, 220);
  const rawSpo2 = nextValue(s.spo2 + anomalyBoost.spo2, spo2Baseline, spo2Drift, 70, 100);
  const rawTemp = nextValue(s.temp + anomalyBoost.temp, tempBaseline, tempDrift, 34, 42);

  // Edge: noise filter
  if (!isPhysiologicallyValid(rawHr, rawSpo2, rawTemp)) {
    return null;
  }

  s.hr = rawHr;
  s.spo2 = rawSpo2;
  s.temp = rawTemp;
  s.hrWindow = pushWindow(s.hrWindow, rawHr);
  s.spo2Window = pushWindow(s.spo2Window, rawSpo2);
  s.tempWindow = pushWindow(s.tempWindow, rawTemp);

  const smoothedHr = avg(s.hrWindow);
  const smoothedSpo2 = avg(s.spo2Window);
  const smoothedTemp = avg(s.tempWindow);

  // Edge anomaly: combined z-score-ish surrogate (Isolation-Forest-lite)
  const hrZ = s.hrWindow.length > 1 ? Math.abs(rawHr - smoothedHr) / (std(s.hrWindow) + 0.5) : 0;
  const spo2Z =
    s.spo2Window.length > 1 ? Math.abs(rawSpo2 - smoothedSpo2) / (std(s.spo2Window) + 0.3) : 0;
  const tempZ =
    s.tempWindow.length > 1 ? Math.abs(rawTemp - smoothedTemp) / (std(s.tempWindow) + 0.1) : 0;
  const anomalyScore = Math.min(1, (hrZ + spo2Z + tempZ) / 9);

  const thresholdAnomaly =
    smoothedHr > 110 ||
    smoothedHr < 50 ||
    smoothedSpo2 < 92 ||
    smoothedTemp > 38.0 ||
    smoothedTemp < 35.5;

  const trend = (window: number[]) => {
    if (window.length < TREND_WINDOW) return "stable" as const;
    const half = Math.floor(window.length / 2);
    const first = avg(window.slice(0, half));
    const second = avg(window.slice(half));
    const delta = second - first;
    if (delta > 1.8) return "increasing" as const;
    if (delta < -1.8) return "decreasing" as const;
    return "stable" as const;
  };

  return {
    patient_id: p.id,
    hr: +rawHr.toFixed(1),
    spo2: +rawSpo2.toFixed(1),
    temp: +rawTemp.toFixed(2),
    smoothed_hr: +smoothedHr.toFixed(1),
    smoothed_spo2: +smoothedSpo2.toFixed(1),
    smoothed_temp: +smoothedTemp.toFixed(2),
    is_anomaly: thresholdAnomaly || anomalyScore > 0.5,
    anomaly_score: +anomalyScore.toFixed(3),
    trend_hr: trend(s.hrWindow),
    trend_spo2: trend(s.spo2Window),
    trend_temp: trend(s.tempWindow),
  };
}

function lifecycleFromReading(
  patientId: string,
  reading: Reading,
): { status?: MonitoringStatus; update?: StatusUpdate; alerts: AlertInsert[] } {
  const s = states.get(patientId);
  if (!s) return { alerts: [] };
  const now = nowMs();

  const inCriticalRange =
    reading.smoothed_hr > CRITICAL_RULE.hr ||
    reading.smoothed_spo2 < CRITICAL_RULE.spo2 ||
    reading.smoothed_temp > CRITICAL_RULE.temp;

  const inWarningRange =
    reading.smoothed_hr > 110 ||
    reading.smoothed_hr < 55 ||
    reading.smoothed_spo2 < 92 ||
    reading.smoothed_temp > 38.4;

  const safe =
    reading.smoothed_hr >= SAFE.hrMin &&
    reading.smoothed_hr <= SAFE.hrMax &&
    reading.smoothed_spo2 >= SAFE.spo2Min &&
    reading.smoothed_temp >= SAFE.tempMin &&
    reading.smoothed_temp <= SAFE.tempMax;

  if (inCriticalRange) {
    s.criticalStartedAt ??= now;
  } else {
    s.criticalStartedAt = undefined;
  }
  if (safe) {
    s.stableStartedAt ??= now;
  } else {
    s.stableStartedAt = undefined;
  }

  let nextStatus = s.status;
  const alerts: AlertInsert[] = [];

  if (s.criticalStartedAt && now - s.criticalStartedAt > 30000) {
    nextStatus = "DECEASED";
    alerts.push({
      patient_id: patientId,
      rule_id: null,
      level: "CRITICAL",
      message: "Critical condition persisted beyond 30 seconds. Patient marked DECEASED.",
    });
  } else if (s.criticalStartedAt && now - s.criticalStartedAt > 15000) {
    nextStatus = "CRITICAL";
  } else if (s.stableStartedAt && now - s.stableStartedAt > 40000) {
    if (s.status !== "RECOVERED") {
      alerts.push({
        patient_id: patientId,
        rule_id: null,
        level: "INFO",
        message: "Patient is stable and ready for discharge.",
        action: "Suggest discharge",
      });
    }
    nextStatus = "RECOVERED";
  } else if (s.stableStartedAt && now - s.stableStartedAt > 20000) {
    nextStatus = "RECOVERING";
  } else if (inWarningRange) {
    nextStatus = "WARNING";
  } else {
    nextStatus = "ACTIVE";
  }

  if (nextStatus !== s.status) {
    s.status = nextStatus;
    s.statusSince = now;
    return {
      status: nextStatus,
      alerts,
      update: {
        id: patientId,
        monitoring_status: nextStatus,
        status_since: new Date(now).toISOString(),
      },
    };
  }
  return { alerts };
}

export async function runSimulationCycle(patients: PatientBaseline[]) {
  const readings = patients.map(tickPatient).filter(Boolean) as NonNullable<
    ReturnType<typeof tickPatient>
  >[];
  if (readings.length === 0) return { inserted: 0, alerts: 0 };

  const dbReadings = readings.map(({ trend_hr, trend_spo2, trend_temp, ...dbRow }) => dbRow);
  const { error: insertError } = await supabase.from("vitals").insert(dbReadings);
  if (insertError) throw insertError;

  // Rule engine evaluation
  const { data: rules } = await supabase
    .from("rules")
    .select("id, name, source, enabled")
    .eq("enabled", true);
  let alertCount = 0;
  const newAlerts: AlertInsert[] = [];
  if (rules && rules.length > 0) {
    const compiled = rules
      .map((r) => {
        try {
          return { id: r.id, name: r.name, ast: parseRule(r.source) as RuleAST };
        } catch {
          return null;
        }
      })
      .filter(Boolean) as { id: string; name: string; ast: RuleAST }[];

    for (const r of readings) {
      for (const rule of compiled) {
        const res = evaluateRule(rule.ast, {
          hr: r.smoothed_hr,
          spo2: r.smoothed_spo2,
          temp: r.smoothed_temp,
        });
        if (res.triggered) {
          newAlerts.push({
            patient_id: r.patient_id,
            rule_id: rule.id,
            level: res.level!,
            message: `${rule.name} (HR ${r.smoothed_hr}, SpO2 ${r.smoothed_spo2}, T ${r.smoothed_temp})`,
          });
        }
      }

      // Trend alerts (hybrid with threshold checks)
      if (r.trend_hr === "increasing" && r.smoothed_hr > 95) {
        newAlerts.push({
          patient_id: r.patient_id,
          rule_id: null,
          level: "WARNING",
          message: "Rising Heart Rate Trend",
        });
      }
      if (r.trend_spo2 === "decreasing" && r.smoothed_spo2 < 95) {
        newAlerts.push({
          patient_id: r.patient_id,
          rule_id: null,
          level: "WARNING",
          message: "Dropping Oxygen Level",
        });
      }
    }

  }

  const patientUpdates: StatusUpdate[] = [];
  for (const r of readings as Reading[]) {
    const lifecycle = lifecycleFromReading(r.patient_id, r);
    if (lifecycle.update) patientUpdates.push(lifecycle.update);
    newAlerts.push(...lifecycle.alerts);
  }

  if (patientUpdates.length > 0) {
    await Promise.all(
      patientUpdates.map((u) =>
        supabase
          .from("patients")
          .update({
            monitoring_status: u.monitoring_status,
            status_since: u.status_since,
          })
          .eq("id", u.id),
      ),
    );
  }

  if (newAlerts.length > 0) {
    await supabase.from("alerts").insert(newAlerts);
    alertCount = newAlerts.length;
  }
  return { inserted: readings.length, alerts: alertCount };
}
