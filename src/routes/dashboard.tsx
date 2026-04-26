import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell, RequireAuth } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { runSimulationCycle, PatientBaseline } from "@/lib/simulator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Activity,
  AlertCircle,
  Heart,
  Plus,
  Wind,
  Thermometer,
  Play,
  Pause,
  AlertTriangle,
  ShieldCheck,
  CheckCheck,
  UserMinus,
} from "lucide-react";
import { toast } from "sonner";
import { aesDecrypt, aesEncrypt, sha256 } from "@/lib/crypto";
import { ResponsiveContainer, LineChart, Line } from "recharts";
import { cn } from "@/lib/utils";
import { parseRule } from "@/lib/dsl/parser";
import { evaluateRule } from "@/lib/dsl/evaluator";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — VitalSync" }] }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <DashboardPage />
      </AppShell>
    </RequireAuth>
  ),
});

interface LatestVital {
  patient_id: string;
  hr: number;
  spo2: number;
  temp: number;
  smoothed_hr: number;
  smoothed_spo2: number;
  smoothed_temp: number;
  is_anomaly: boolean;
  anomaly_score: number;
  ts: string;
}

interface PatientRow extends PatientBaseline {
  encrypted_name: string;
  display_name?: string;
  age?: number | null;
  monitoring_status?: string;
  is_discharged?: boolean;
  latest?: LatestVital;
  history?: LatestVital[];
}

interface AlertRow {
  id: string;
  patient_id: string;
  level: string;
  message: string;
  ts: string;
  action?: string | null;
  acknowledged_at: string | null;
}

interface DashboardRule {
  id: string;
  source: string;
  name: string;
}

function vitalStatus(v?: LatestVital, status?: string) {
  if (status === "DECEASED") return { color: "text-destructive", label: "DECEASED" };
  if (status === "RECOVERED") return { color: "text-success", label: "RECOVERED" };
  if (status === "RECOVERING") return { color: "text-success", label: "RECOVERING" };
  if (status === "CRITICAL") return { color: "text-destructive", label: "Critical" };
  if (status === "WARNING") return { color: "text-warning", label: "Watch" };
  if (!v) return { color: "text-muted-foreground", label: "—" };
  if (v.is_anomaly || v.smoothed_spo2 < 92 || v.smoothed_hr > 110 || v.smoothed_hr < 50 || v.smoothed_temp > 38)
    return { color: "text-destructive", label: "Critical" };
  if (v.anomaly_score > 0.3) return { color: "text-warning", label: "Watch" };
  return { color: "text-success", label: "Stable" };
}

function trendDirection(values: number[]) {
  if (values.length < 6) return "stable";
  const half = Math.floor(values.length / 2);
  const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
  const delta = avg(values.slice(half)) - avg(values.slice(0, half));
  if (delta > 1.2) return "increasing";
  if (delta < -1.2) return "decreasing";
  return "stable";
}

function riskScore(v?: LatestVital) {
  if (!v) return 0;
  const raw = (v.smoothed_hr + v.smoothed_temp * 10 - v.smoothed_spo2) / 3.2;
  return Math.max(0, Math.min(100, raw));
}

function DashboardPage() {
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [rules, setRules] = useState<DashboardRule[]>([]);
  const [running, setRunning] = useState(true);
  const [maskNames, setMaskNames] = useState(false);
  const [newRule, setNewRule] = useState("IF hr > 110 THEN ALERT WARNING");
  const [newPatient, setNewPatient] = useState({
    name: "",
    age: "",
    hr: "78",
    spo2: "97",
    temp: "36.8",
  });
  const [stats, setStats] = useState({ inserted: 0, alerts: 0, cycles: 0 });
  const alertsRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const { data: pts } = await supabase.from("patients").select("*").order("display_label");
    const { data: vits } = await supabase
      .from("vitals")
      .select("*")
      .order("ts", { ascending: false })
      .limit(200);
    const { data: alrts } = await supabase
      .from("alerts")
      .select("*")
      .order("ts", { ascending: false })
      .limit(80);
    const { data: savedRules } = await supabase
      .from("rules")
      .select("id, name, source, enabled")
      .eq("enabled", true)
      .order("created_at", { ascending: false });

    const latestByPatient = new Map<string, LatestVital>();
    const historyByPatient = new Map<string, LatestVital[]>();
    for (const v of vits ?? []) {
      if (!latestByPatient.has(v.patient_id)) latestByPatient.set(v.patient_id, v as LatestVital);
      if (!historyByPatient.has(v.patient_id)) historyByPatient.set(v.patient_id, []);
      historyByPatient.get(v.patient_id)!.unshift(v as LatestVital); // oldest first for charts
    }

    const rows: PatientRow[] = [];
    for (const p of pts ?? []) {
      const name = await aesDecrypt(p.encrypted_name);
      rows.push({
        id: p.id,
        display_label: p.display_label,
        baseline_hr: Number(p.baseline_hr),
        baseline_spo2: Number(p.baseline_spo2),
        baseline_temp: Number(p.baseline_temp),
        age: p.age,
        monitoring_status: p.monitoring_status,
        is_discharged: p.is_discharged,
        encrypted_name: p.encrypted_name,
        display_name: name,
        latest: latestByPatient.get(p.id),
        history: historyByPatient.get(p.id),
      });
    }
    requestAnimationFrame(() => {
      setPatients(rows);
      setAlerts((alrts ?? []) as AlertRow[]);
      setRules(
        ((savedRules ?? []) as { id: string; name: string; source: string }[]).map((r) => ({
          id: r.id,
          name: r.name,
          source: r.source,
        })),
      );
    });
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
    })();
  }, [refresh]);

  useEffect(() => {
    if (!running || patients.length === 0) return;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const baselines: PatientBaseline[] = patients
          .filter((p) => !p.is_discharged && p.monitoring_status !== "DECEASED")
          .map((p) => ({
            id: p.id,
            display_label: p.display_label,
            baseline_hr: p.baseline_hr,
            baseline_spo2: p.baseline_spo2,
            baseline_temp: p.baseline_temp,
            monitoring_status: p.monitoring_status,
            is_discharged: p.is_discharged,
          }));
        const res = await runSimulationCycle(baselines);
        if (cancelled) return;
        setStats((s) => ({
          inserted: s.inserted + res.inserted,
          alerts: s.alerts + res.alerts,
          cycles: s.cycles + 1,
        }));
        if (res.alerts > 0) toast.warning(`${res.alerts} new alert${res.alerts > 1 ? "s" : ""}`);
        await refresh();
      } catch (e) {
        console.error(e);
        toast.error(`Simulation failed: ${(e as Error).message}`);
      } finally {
        if (!cancelled) timeoutId = setTimeout(tick, 4000);
      }
    };
    tick();
    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [running, patients.length, refresh, patients]);

  useEffect(() => {
    if (!alertsRef.current) return;
    alertsRef.current.scrollTop = 0;
  }, [alerts]);

  async function ackAlert(id: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase
      .from("alerts")
      .update({ acknowledged_by: user?.id, acknowledged_at: new Date().toISOString() })
      .eq("id", id);
    refresh();
  }

  async function addRule() {
    try {
      parseRule(newRule);
      await supabase.from("rules").insert({
        name: `Dashboard Rule ${new Date().toLocaleTimeString()}`,
        source: newRule,
        enabled: true,
        severity_default: "WARNING",
      });
      toast.success("Rule added to live engine");
      setNewRule("IF hr > 110 THEN ALERT WARNING");
      refresh();
    } catch (error) {
      toast.error(`Invalid rule: ${(error as Error).message}`);
    }
  }

  async function addPatient() {
    if (!newPatient.name.trim()) {
      toast.error("Patient name is required");
      return;
    }
    const { data: all } = await supabase.from("patients").select("display_label");
    let next = 1;
    for (const p of all ?? []) {
      const num = Number(String(p.display_label).replace("P-", ""));
      if (!Number.isNaN(num)) next = Math.max(next, num + 1);
    }
    const display = `P-${String(next).padStart(3, "0")}`;
    const encrypted = await aesEncrypt(newPatient.name.trim());
    const hashed = await sha256(display);
    const { error } = await supabase.from("patients").insert({
      display_label: display,
      encrypted_name: encrypted,
      hashed_external_id: hashed,
      age: newPatient.age ? Number(newPatient.age) : null,
      baseline_hr: Number(newPatient.hr),
      baseline_spo2: Number(newPatient.spo2),
      baseline_temp: Number(newPatient.temp),
      monitoring_status: "ACTIVE",
    });
    if (error) {
      toast.error(`Failed to add patient: ${error.message}`);
      return;
    }
    setNewPatient({ name: "", age: "", hr: "78", spo2: "97", temp: "36.8" });
    toast.success(`${display} added`);
    refresh();
  }

  async function dischargePatient(id: string) {
    await supabase
      .from("patients")
      .update({
        is_discharged: true,
        discharged_at: new Date().toISOString(),
        monitoring_status: "DISCHARGED",
      } as never)
      .eq("id", id);
    toast.success("Patient discharged");
    refresh();
  }

  const activePatients = useMemo(() => patients.filter((p) => !p.is_discharged), [patients]);
  const dischargedPatients = useMemo(() => patients.filter((p) => p.is_discharged), [patients]);
  const patientInsights = useMemo(
    () =>
      activePatients.map((p) => {
        const history = p.history ?? [];
        const avg = (values: number[]) => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0);
        const hrVals = history.map((h) => h.smoothed_hr);
        const spo2Vals = history.map((h) => h.smoothed_spo2);
        const tempVals = history.map((h) => h.smoothed_temp);
        return {
          id: p.id,
          hrAvg: avg(hrVals),
          hrMin: hrVals.length ? Math.min(...hrVals) : 0,
          hrMax: hrVals.length ? Math.max(...hrVals) : 0,
          spo2Avg: avg(spo2Vals),
          tempAvg: avg(tempVals),
          trend: trendDirection(hrVals.slice(-10)),
          risk: riskScore(p.latest),
        };
      }),
    [activePatients],
  );

  const alertsSorted = useMemo(
    () =>
      [...alerts].sort((a, b) => {
        const levelRank = { CRITICAL: 3, WARNING: 2, INFO: 1 } as Record<string, number>;
        if (new Date(a.ts).getTime() !== new Date(b.ts).getTime())
          return new Date(b.ts).getTime() - new Date(a.ts).getTime();
        return (levelRank[b.level] ?? 0) - (levelRank[a.level] ?? 0);
      }),
    [alerts],
  );

  const customRuleAlerts = useMemo(() => {
    const recent = activePatients.map((p) => p.latest).filter(Boolean) as LatestVital[];
    return recent.flatMap((v) =>
      rules.flatMap((r) => {
        try {
          const out = evaluateRule(parseRule(r.source), {
            hr: v.smoothed_hr,
            spo2: v.smoothed_spo2,
            temp: v.smoothed_temp,
          });
          return out.triggered ? [{ patient_id: v.patient_id, message: r.name, level: out.level }] : [];
        } catch {
          return [];
        }
      }),
    );
  }, [activePatients, rules]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Live Patient Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Simulated IoT → Edge → Cloud pipeline · Encrypted Data Stream · {activePatients.length} active
            patients
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">
            {stats.cycles} cycles · {stats.inserted} readings
          </Badge>
          <Button
            size="sm"
            variant={running ? "secondary" : "default"}
            onClick={() => setRunning((r) => !r)}
          >
            {running ? (
              <>
                <Pause className="size-4 mr-1" /> Pause
              </>
            ) : (
              <>
                <Play className="size-4 mr-1" /> Resume
              </>
            )}
          </Button>
          <div className="flex items-center gap-2 pl-2">
            <ShieldCheck className="size-4 text-primary" />
            <Label className="text-xs">Mask names</Label>
            <Switch checked={maskNames} onCheckedChange={setMaskNames} />
          </div>
        </div>
      </header>

      <div className="grid lg:grid-cols-3 gap-6 mb-8">
        <Card className="lg:col-span-3 border-dashed border-primary/40">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Plus className="size-4" /> Add Patient
            </CardTitle>
          </CardHeader>
          <CardContent className="grid md:grid-cols-6 gap-3">
            <Input
              placeholder="Name"
              value={newPatient.name}
              onChange={(e) => setNewPatient((s) => ({ ...s, name: e.target.value }))}
            />
            <Input
              placeholder="Age (optional)"
              value={newPatient.age}
              onChange={(e) => setNewPatient((s) => ({ ...s, age: e.target.value }))}
            />
            <Input
              placeholder="HR"
              value={newPatient.hr}
              onChange={(e) => setNewPatient((s) => ({ ...s, hr: e.target.value }))}
            />
            <Input
              placeholder="SpO2"
              value={newPatient.spo2}
              onChange={(e) => setNewPatient((s) => ({ ...s, spo2: e.target.value }))}
            />
            <Input
              placeholder="Temp"
              value={newPatient.temp}
              onChange={(e) => setNewPatient((s) => ({ ...s, temp: e.target.value }))}
            />
            <Button onClick={addPatient}>Add Patient</Button>
          </CardContent>
        </Card>

        {activePatients.map((p) => {
          const v = p.latest;
          const s = vitalStatus(v, p.monitoring_status);
          const historyData = p.history?.map((h, i) => ({
            time: i,
            hr: h.smoothed_hr,
            spo2: h.smoothed_spo2,
            temp: h.smoothed_temp,
          })) || [];

          return (
            <Link key={p.id} to="/patients/$id" params={{ id: p.id }} className="block group">
              <Card
                className={cn(
                  "transition-all duration-500 bg-card/60 backdrop-blur-md border border-border/40 group-hover:-translate-y-1 group-hover:border-primary/30 relative overflow-hidden h-full rounded-2xl",
                  p.monitoring_status === "DECEASED" && "bg-destructive/20 border-destructive",
                )}
                style={{ boxShadow: "var(--shadow-card)" }}
              >
                {/* Status indicator bar at top */}
                <div className={cn("absolute top-0 left-0 right-0 h-1", 
                  s.label === 'Critical' ? 'bg-destructive' : s.label === 'Watch' ? 'bg-warning' : 'bg-success/60'
                )} />
                <CardHeader className="pb-2 pt-5 flex-row items-center justify-between space-y-0">
                  <div>
                    <CardTitle className="text-lg font-bold tracking-tight">{p.display_label}</CardTitle>
                    <p className="text-sm font-medium text-muted-foreground/80">
                      {maskNames ? "********" : p.display_name}
                      {p.age ? ` · ${p.age}y` : ""}
                    </p>
                  </div>
                  <Badge variant={s.label === 'Critical' ? 'destructive' : s.label === 'Watch' ? 'secondary' : 'default'} className={cn(
                    "bg-opacity-10",
                    s.label === 'Stable' && "bg-success/15 text-success hover:bg-success/20 shadow-none border-transparent",
                    s.label === 'Watch' && "bg-warning/15 text-warning hover:bg-warning/20 shadow-none border-transparent"
                  )}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current mr-1.5 animate-pulse" />
                    {s.label}
                  </Badge>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <Vital icon={Heart} label="HR" value={v?.smoothed_hr} unit="bpm" />
                    <Vital icon={Wind} label="SpO₂" value={v?.smoothed_spo2} unit="%" />
                    <Vital icon={Thermometer} label="Temp" value={v?.smoothed_temp} unit="°C" />
                  </div>
                  <div className="text-xs font-medium mb-2">
                    Risk:{" "}
                    <span
                      className={cn(
                        riskScore(v) > 70 ? "text-destructive" : riskScore(v) > 45 ? "text-warning" : "text-success",
                      )}
                    >
                      {riskScore(v).toFixed(0)}%
                    </span>
                  </div>
                  {/* Sparkline */}
                  <div className="h-12 w-full mt-2 -ml-2 -mr-2 px-2 opacity-60 group-hover:opacity-100 transition-opacity">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={historyData}>
                        <Line type="monotone" dataKey="hr" stroke="var(--color-chart-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 w-full"
                    onClick={(e) => {
                      e.preventDefault();
                      dischargePatient(p.id);
                    }}
                  >
                    <UserMinus className="size-4 mr-1" /> Discharge
                  </Button>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="size-5 text-primary" /> EDA Insights
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {patientInsights.map((i) => {
              const patient = activePatients.find((p) => p.id === i.id);
              return (
                <div key={i.id} className="p-3 rounded-lg border bg-muted/20">
                  <div className="font-medium mb-1">{patient?.display_label}</div>
                  <div className="text-muted-foreground">
                    Avg HR {i.hrAvg.toFixed(1)} (min {i.hrMin.toFixed(1)} / max {i.hrMax.toFixed(1)}) · Avg SpO₂{" "}
                    {i.spo2Avg.toFixed(1)} · Avg Temp {i.tempAvg.toFixed(1)} · Trend {i.trend}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Rules Panel</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input value={newRule} onChange={(e) => setNewRule(e.target.value)} />
            <Button className="w-full" onClick={addRule}>
              Add Rule
            </Button>
            <div className="text-xs text-muted-foreground">
              Examples: `IF hr &gt; 110 THEN ALERT WARNING`, `IF spo2 &lt; 92 THEN ALERT CRITICAL`
            </div>
            {customRuleAlerts.slice(0, 4).map((r, idx) => (
              <div key={`${r.patient_id}-${idx}`} className="text-xs p-2 rounded border bg-warning/10">
                {r.message} on {activePatients.find((p) => p.id === r.patient_id)?.display_label}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {dischargedPatients.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Discharged Patients</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {dischargedPatients.map((p) => p.display_label).join(", ")}
          </CardContent>
        </Card>
      )}

      <Card className="border-border/40 shadow-elegant bg-card/40 backdrop-blur-sm rounded-2xl">
        <CardHeader className="border-b border-border/40 bg-muted/10 pb-4 pt-5">
          <CardTitle className="flex items-center gap-2 text-lg">
            <div className="p-1.5 rounded-md bg-warning/20">
              <AlertTriangle className="size-5 text-warning" />
            </div>
            Recent Alerts
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {alertsSorted.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
                <CheckCheck className="size-6 text-muted-foreground/50" />
              </div>
              <p>No alerts yet — monitoring is active.</p>
            </div>
          ) : (
            <div ref={alertsRef} className="max-h-[360px] overflow-y-auto">
              <ul className="divide-y divide-border/40">
                {alertsSorted.map((a) => {
                const p = patients.find((x) => x.id === a.patient_id);
                const isCritical = a.level === "CRITICAL";
                return (
                  <li key={a.id} className={cn("p-4 flex items-center justify-between gap-4 transition-colors hover:bg-muted/30", !a.acknowledged_at && isCritical && "bg-destructive/5")}>
                    <div className="flex items-start gap-4 min-w-0">
                      <div className="mt-0.5">
                        <Badge variant={isCritical ? 'destructive' : 'secondary'} className={cn(
                          "uppercase tracking-wider text-[10px] pb-1",
                          isCritical ? "shadow-[0_0_12px_var(--color-destructive)] shadow-destructive/50" : ""
                        )}>
                          {a.level}
                        </Badge>
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate text-foreground flex items-center gap-2">
                          {p?.display_label ?? "Patient"}
                          <span className="text-muted-foreground/50">—</span>
                          {maskNames ? "********" : (p?.display_name ?? "Unknown")}
                        </div>
                        <div className="text-sm font-medium text-muted-foreground/80 mt-0.5">
                          {a.message}
                        </div>
                        <div className="text-xs text-muted-foreground/60 mt-1 flex items-center gap-1.5">
                          {new Date(a.ts).toLocaleDateString()} at {new Date(a.ts).toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                    {a.acknowledged_at ? (
                      <div className="flex items-center gap-1.5 text-xs font-medium text-success/70 bg-success/10 px-2 py-1 rounded-md shrink-0">
                        <CheckCheck className="size-3.5" /> Acknowledged
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        {a.action === "Suggest discharge" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => p && dischargePatient(p.id)}
                            className="shrink-0"
                          >
                            Quick Discharge
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant={isCritical ? "default" : "outline"}
                          onClick={() => ackAlert(a.id)}
                          className="shrink-0 shadow-sm"
                        >
                          Dismiss
                        </Button>
                      </div>
                    )}
                  </li>
                );
                })}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Vital({
  icon: Icon,
  label,
  value,
  unit,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value?: number;
  unit: string;
}) {
  return (
    <div className="rounded-xl bg-muted/40 p-3 pt-2.5 border border-border/30 transition-colors duration-500">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground/80 mb-1 uppercase tracking-wider">
        <Icon className="size-3.5" /> {label}
      </div>
      <div className="text-xl font-bold tabular-nums tracking-tight">
        {value !== undefined ? value.toFixed(1) : "—"}
        <span className="text-xs font-medium text-muted-foreground ml-1">{unit}</span>
      </div>
    </div>
  );
}
