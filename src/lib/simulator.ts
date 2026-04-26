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
}

interface PatientState {
  hr: number;
  spo2: number;
  temp: number;
  hrWindow: number[];
  spo2Window: number[];
  tempWindow: number[];
  anomalyTimer: number;
}

const states = new Map<string, PatientState>();
const WINDOW = 5;

function rand(min: number, max: number) { return Math.random() * (max - min) + min; }
function clamp(v: number, min: number, max: number) { return Math.min(max, Math.max(min, v)); }

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
  const m = avg(a); return Math.sqrt(avg(a.map(x => (x - m) ** 2)));
};

// Noise filter — physiologically impossible values are dropped.
function isPhysiologicallyValid(hr: number, spo2: number, temp: number) {
  return hr > 20 && hr < 250 && spo2 > 50 && spo2 <= 100 && temp > 30 && temp < 45;
}

export function tickPatient(p: PatientBaseline) {
  let s = states.get(p.id);
  if (!s) {
    s = {
      hr: p.baseline_hr,
      spo2: p.baseline_spo2,
      temp: p.baseline_temp,
      hrWindow: [], spo2Window: [], tempWindow: [],
      anomalyTimer: Math.floor(rand(8, 20)),
    };
    states.set(p.id, s);
  }

  // Inject anomaly periodically
  let anomalyBoost = { hr: 0, spo2: 0, temp: 0 };
  s.anomalyTimer--;
  if (s.anomalyTimer <= 0) {
    const kind = Math.floor(rand(0, 3));
    if (kind === 0) anomalyBoost.hr = rand(35, 55);    // tachycardia
    else if (kind === 1) anomalyBoost.spo2 = -rand(8, 14); // hypoxia
    else anomalyBoost.temp = rand(1.8, 2.8);              // fever
    s.anomalyTimer = Math.floor(rand(15, 35));
  }

  const rawHr = nextValue(s.hr + anomalyBoost.hr, p.baseline_hr, 3, 30, 220);
  const rawSpo2 = nextValue(s.spo2 + anomalyBoost.spo2, p.baseline_spo2, 0.6, 70, 100);
  const rawTemp = nextValue(s.temp + anomalyBoost.temp, p.baseline_temp, 0.15, 34, 42);

  // Edge: noise filter
  if (!isPhysiologicallyValid(rawHr, rawSpo2, rawTemp)) {
    return null;
  }

  s.hr = rawHr; s.spo2 = rawSpo2; s.temp = rawTemp;
  s.hrWindow = pushWindow(s.hrWindow, rawHr);
  s.spo2Window = pushWindow(s.spo2Window, rawSpo2);
  s.tempWindow = pushWindow(s.tempWindow, rawTemp);

  const smoothedHr = avg(s.hrWindow);
  const smoothedSpo2 = avg(s.spo2Window);
  const smoothedTemp = avg(s.tempWindow);

  // Edge anomaly: combined z-score-ish surrogate (Isolation-Forest-lite)
  const hrZ = s.hrWindow.length > 1 ? Math.abs(rawHr - smoothedHr) / (std(s.hrWindow) + 0.5) : 0;
  const spo2Z = s.spo2Window.length > 1 ? Math.abs(rawSpo2 - smoothedSpo2) / (std(s.spo2Window) + 0.3) : 0;
  const tempZ = s.tempWindow.length > 1 ? Math.abs(rawTemp - smoothedTemp) / (std(s.tempWindow) + 0.1) : 0;
  const anomalyScore = Math.min(1, (hrZ + spo2Z + tempZ) / 9);

  const thresholdAnomaly =
    smoothedHr > 110 || smoothedHr < 50 ||
    smoothedSpo2 < 92 ||
    smoothedTemp > 38.0 || smoothedTemp < 35.5;

  return {
    patient_id: p.id,
    hr: +rawHr.toFixed(1), spo2: +rawSpo2.toFixed(1), temp: +rawTemp.toFixed(2),
    smoothed_hr: +smoothedHr.toFixed(1), smoothed_spo2: +smoothedSpo2.toFixed(1), smoothed_temp: +smoothedTemp.toFixed(2),
    is_anomaly: thresholdAnomaly || anomalyScore > 0.5,
    anomaly_score: +anomalyScore.toFixed(3),
  };
}

export async function runSimulationCycle(patients: PatientBaseline[]) {
  const readings = patients.map(tickPatient).filter(Boolean) as NonNullable<ReturnType<typeof tickPatient>>[];
  if (readings.length === 0) return { inserted: 0, alerts: 0 };

  const { error: insertError } = await supabase.from("vitals").insert(readings);
  if (insertError) throw insertError;

  // Rule engine evaluation
  const { data: rules } = await supabase.from("rules").select("id, name, source, enabled").eq("enabled", true);
  let alertCount = 0;
  if (rules && rules.length > 0) {
    const compiled = rules
      .map(r => {
        try { return { id: r.id, name: r.name, ast: parseRule(r.source) as RuleAST }; }
        catch { return null; }
      })
      .filter(Boolean) as { id: string; name: string; ast: RuleAST }[];

    const newAlerts: { patient_id: string; rule_id: string; level: string; message: string }[] = [];
    for (const r of readings) {
      for (const rule of compiled) {
        const res = evaluateRule(rule.ast, { hr: r.smoothed_hr, spo2: r.smoothed_spo2, temp: r.smoothed_temp });
        if (res.triggered) {
          newAlerts.push({
            patient_id: r.patient_id,
            rule_id: rule.id,
            level: res.level!,
            message: `${rule.name} (HR ${r.smoothed_hr}, SpO2 ${r.smoothed_spo2}, T ${r.smoothed_temp})`,
          });
        }
      }
    }
    if (newAlerts.length > 0) {
      await supabase.from("alerts").insert(newAlerts);
      alertCount = newAlerts.length;
    }
  }
  return { inserted: readings.length, alerts: alertCount };
}
