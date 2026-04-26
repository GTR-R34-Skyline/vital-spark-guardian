import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { AppShell, RequireAuth } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { ensureSeedData } from "@/lib/seed";
import { runSimulationCycle, PatientBaseline } from "@/lib/simulator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Heart,
  Wind,
  Thermometer,
  Play,
  Pause,
  AlertTriangle,
  CheckCheck,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { aesDecrypt } from "@/lib/crypto";
import { ResponsiveContainer, LineChart, Line } from "recharts";
import { cn } from "@/lib/utils";

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
  latest?: LatestVital;
  history?: LatestVital[];
}

interface AlertRow {
  id: string;
  patient_id: string;
  level: string;
  message: string;
  ts: string;
  acknowledged_at: string | null;
}

function vitalStatus(v?: LatestVital) {
  if (!v) return { color: "text-muted-foreground", label: "—" };
  if (
    v.is_anomaly ||
    v.smoothed_spo2 < 92 ||
    v.smoothed_hr > 110 ||
    v.smoothed_hr < 50 ||
    v.smoothed_temp > 38
  )
    return { color: "text-destructive", label: "Critical" };
  if (v.anomaly_score > 0.3) return { color: "text-warning", label: "Watch" };
  return { color: "text-success", label: "Stable" };
}

function DashboardPage() {
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [running, setRunning] = useState(true);
  const [stats, setStats] = useState({ inserted: 0, alerts: 0, cycles: 0 });

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
      .limit(20);

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
        encrypted_name: p.encrypted_name,
        display_name: name,
        latest: latestByPatient.get(p.id),
        history: historyByPatient.get(p.id),
      });
    }
    setPatients(rows);
    setAlerts((alrts ?? []) as AlertRow[]);
  }, []);

  useEffect(() => {
    (async () => {
      await ensureSeedData();
      await refresh();
    })();
  }, [refresh]);

  useEffect(() => {
    if (!running || patients.length === 0) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const baselines: PatientBaseline[] = patients.map((p) => ({
          id: p.id,
          display_label: p.display_label,
          baseline_hr: p.baseline_hr,
          baseline_spo2: p.baseline_spo2,
          baseline_temp: p.baseline_temp,
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
      }
    };
    const id = setInterval(tick, 5000);
    tick();
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [running, patients.length, refresh, patients]);

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

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Live Patient Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Simulated IoT → Edge → Cloud pipeline · {patients.length} patients
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
        </div>
      </header>

      <div className="grid lg:grid-cols-3 gap-6 mb-8">
        {patients.map((p) => {
          const v = p.latest;
          const s = vitalStatus(v);
          const historyData = p.history?.map((h, i) => ({
            time: i,
            hr: h.smoothed_hr,
            spo2: h.smoothed_spo2,
            temp: h.smoothed_temp,
          })) || [];

          return (
            <Link key={p.id} to="/patients/$id" params={{ id: p.id }} className="block group">
              <Card
                className="transition-all duration-300 bg-card/60 backdrop-blur-md border border-border/40 group-hover:-translate-y-1 group-hover:border-primary/30 relative overflow-hidden h-full rounded-2xl"
                style={{ boxShadow: "var(--shadow-card)" }}
              >
                {/* Status indicator bar at top */}
                <div className={cn("absolute top-0 left-0 right-0 h-1", 
                  s.label === 'Critical' ? 'bg-destructive' : s.label === 'Watch' ? 'bg-warning' : 'bg-success/60'
                )} />
                <CardHeader className="pb-2 pt-5 flex-row items-center justify-between space-y-0">
                  <div>
                    <CardTitle className="text-lg font-bold tracking-tight">{p.display_label}</CardTitle>
                    <p className="text-sm font-medium text-muted-foreground/80">{p.display_name}</p>
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
                  {/* Sparkline */}
                  <div className="h-12 w-full mt-2 -ml-2 -mr-2 px-2 opacity-60 group-hover:opacity-100 transition-opacity">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={historyData}>
                        <Line type="monotone" dataKey="hr" stroke="var(--color-chart-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

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
          {alerts.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
                <CheckCheck className="size-6 text-muted-foreground/50" />
              </div>
              <p>No alerts yet — monitoring is active.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border/40">
              {alerts.map((a) => {
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
                          {p?.display_name ?? "Unknown"}
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
                      <Button size="sm" variant={isCritical ? "default" : "outline"} onClick={() => ackAlert(a.id)} className="shrink-0 shadow-sm">
                        Acknowledge
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
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
    <div className="rounded-xl bg-muted/40 p-3 pt-2.5 border border-border/30">
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
