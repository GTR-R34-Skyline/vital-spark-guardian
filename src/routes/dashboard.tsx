import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { AppShell, RequireAuth } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { ensureSeedData } from "@/lib/seed";
import { runSimulationCycle, PatientBaseline } from "@/lib/simulator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Heart, Wind, Thermometer, Play, Pause, AlertTriangle, CheckCheck, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { aesDecrypt } from "@/lib/crypto";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — VitalSync" }] }),
  component: () => <RequireAuth><AppShell><DashboardPage /></AppShell></RequireAuth>,
});

interface LatestVital {
  patient_id: string;
  hr: number; spo2: number; temp: number;
  smoothed_hr: number; smoothed_spo2: number; smoothed_temp: number;
  is_anomaly: boolean; anomaly_score: number;
  ts: string;
}

interface PatientRow extends PatientBaseline {
  encrypted_name: string;
  display_name?: string;
  latest?: LatestVital;
}

interface AlertRow {
  id: string; patient_id: string; level: string; message: string; ts: string; acknowledged_at: string | null;
}

function vitalStatus(v?: LatestVital) {
  if (!v) return { color: "text-muted-foreground", label: "—" };
  if (v.is_anomaly || v.smoothed_spo2 < 92 || v.smoothed_hr > 110 || v.smoothed_hr < 50 || v.smoothed_temp > 38)
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
    const { data: vits } = await supabase.from("vitals").select("*").order("ts", { ascending: false }).limit(200);
    const { data: alrts } = await supabase.from("alerts").select("*").order("ts", { ascending: false }).limit(20);

    const latestByPatient = new Map<string, LatestVital>();
    for (const v of vits ?? []) if (!latestByPatient.has(v.patient_id)) latestByPatient.set(v.patient_id, v as LatestVital);

    const rows: PatientRow[] = [];
    for (const p of pts ?? []) {
      const name = await aesDecrypt(p.encrypted_name);
      rows.push({
        id: p.id, display_label: p.display_label,
        baseline_hr: Number(p.baseline_hr), baseline_spo2: Number(p.baseline_spo2), baseline_temp: Number(p.baseline_temp),
        encrypted_name: p.encrypted_name, display_name: name,
        latest: latestByPatient.get(p.id),
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
        const baselines: PatientBaseline[] = patients.map(p => ({
          id: p.id, display_label: p.display_label,
          baseline_hr: p.baseline_hr, baseline_spo2: p.baseline_spo2, baseline_temp: p.baseline_temp,
        }));
        const res = await runSimulationCycle(baselines);
        if (cancelled) return;
        setStats(s => ({ inserted: s.inserted + res.inserted, alerts: s.alerts + res.alerts, cycles: s.cycles + 1 }));
        if (res.alerts > 0) toast.warning(`${res.alerts} new alert${res.alerts > 1 ? "s" : ""}`);
        await refresh();
      } catch (e) {
        console.error(e);
      }
    };
    const id = setInterval(tick, 5000);
    tick();
    return () => { cancelled = true; clearInterval(id); };
  }, [running, patients.length, refresh, patients]);

  async function ackAlert(id: string) {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("alerts").update({ acknowledged_by: user?.id, acknowledged_at: new Date().toISOString() }).eq("id", id);
    refresh();
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Live Patient Dashboard</h1>
          <p className="text-sm text-muted-foreground">Simulated IoT → Edge → Cloud pipeline · {patients.length} patients</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{stats.cycles} cycles · {stats.inserted} readings</Badge>
          <Button size="sm" variant={running ? "secondary" : "default"} onClick={() => setRunning(r => !r)}>
            {running ? <><Pause className="size-4 mr-1" /> Pause</> : <><Play className="size-4 mr-1" /> Resume</>}
          </Button>
        </div>
      </header>

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        {patients.map(p => {
          const v = p.latest;
          const s = vitalStatus(v);
          return (
            <Link key={p.id} to="/patients/$id" params={{ id: p.id }} className="block">
              <Card className="hover:shadow-md transition-shadow" style={{ boxShadow: "var(--shadow-card)" }}>
                <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
                  <div>
                    <CardTitle className="text-base">{p.display_label}</CardTitle>
                    <p className="text-xs text-muted-foreground">{p.display_name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${s.color}`}>● {s.label}</span>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </div>
                </CardHeader>
                <CardContent className="grid grid-cols-3 gap-3">
                  <Vital icon={Heart} label="HR" value={v?.smoothed_hr} unit="bpm" />
                  <Vital icon={Wind} label="SpO₂" value={v?.smoothed_spo2} unit="%" />
                  <Vital icon={Thermometer} label="Temp" value={v?.smoothed_temp} unit="°C" />
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="size-5 text-warning" /> Recent Alerts</CardTitle></CardHeader>
        <CardContent>
          {alerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No alerts yet — simulator is running, alerts will appear when rules trigger.</p>
          ) : (
            <ul className="divide-y">
              {alerts.map(a => {
                const p = patients.find(x => x.id === a.patient_id);
                const lvl = a.level === "CRITICAL" ? "destructive" : a.level === "WARNING" ? "secondary" : "outline";
                return (
                  <li key={a.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Badge variant={lvl as never}>{a.level}</Badge>
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{p?.display_label ?? "Patient"} — {a.message}</div>
                        <div className="text-xs text-muted-foreground">{new Date(a.ts).toLocaleTimeString()}</div>
                      </div>
                    </div>
                    {a.acknowledged_at ? (
                      <Badge variant="outline" className="gap-1"><CheckCheck className="size-3" /> Ack</Badge>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => ackAlert(a.id)}>Acknowledge</Button>
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

function Vital({ icon: Icon, label, value, unit }: { icon: React.ComponentType<{ className?: string }>; label: string; value?: number; unit: string }) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1"><Icon className="size-3" /> {label}</div>
      <div className="text-xl font-semibold tabular-nums">{value !== undefined ? value.toFixed(1) : "—"}<span className="text-xs font-normal text-muted-foreground ml-1">{unit}</span></div>
    </div>
  );
}
