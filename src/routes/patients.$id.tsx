import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell, RequireAuth } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Heart, Wind, Thermometer } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { aesDecrypt } from "@/lib/crypto";

export const Route = createFileRoute("/patients/$id")({
  head: () => ({ meta: [{ title: "Patient detail — VitalSync" }] }),
  component: () => <RequireAuth><AppShell><PatientDetail /></AppShell></RequireAuth>,
});

function PatientDetail() {
  const { id } = Route.useParams();
  const [patient, setPatient] = useState<{ display_label: string; display_name: string; baseline_hr: number; baseline_spo2: number; baseline_temp: number } | null>(null);
  const [vitals, setVitals] = useState<{ ts: string; smoothed_hr: number; smoothed_spo2: number; smoothed_temp: number; is_anomaly: boolean }[]>([]);
  const [alerts, setAlerts] = useState<{ id: string; level: string; message: string; ts: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data: p } = await supabase.from("patients").select("*").eq("id", id).maybeSingle();
      if (p && !cancelled) {
        const name = await aesDecrypt(p.encrypted_name);
        setPatient({ display_label: p.display_label, display_name: name, baseline_hr: Number(p.baseline_hr), baseline_spo2: Number(p.baseline_spo2), baseline_temp: Number(p.baseline_temp) });
      }
      const { data: v } = await supabase.from("vitals").select("ts, smoothed_hr, smoothed_spo2, smoothed_temp, is_anomaly").eq("patient_id", id).order("ts", { ascending: false }).limit(60);
      if (!cancelled) setVitals(((v ?? []) as never[]).reverse());
      const { data: a } = await supabase.from("alerts").select("id, level, message, ts").eq("patient_id", id).order("ts", { ascending: false }).limit(20);
      if (!cancelled) setAlerts((a ?? []) as never);
    };
    load();
    const it = setInterval(load, 5000);
    return () => { cancelled = true; clearInterval(it); };
  }, [id]);

  const chartData = vitals.map(v => ({
    t: new Date(v.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    HR: v.smoothed_hr, SpO2: v.smoothed_spo2, Temp: v.smoothed_temp,
  }));

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <Button variant="ghost" size="sm" asChild className="mb-3"><Link to="/dashboard"><ArrowLeft className="size-4 mr-1" /> Back to dashboard</Link></Button>
      <header className="mb-6">
        <h1 className="text-2xl font-bold">{patient?.display_label ?? "Patient"} <span className="text-muted-foreground text-base font-normal">· {patient?.display_name}</span></h1>
        {patient && <p className="text-xs text-muted-foreground">Baselines: HR {patient.baseline_hr} · SpO₂ {patient.baseline_spo2} · Temp {patient.baseline_temp}°C</p>}
      </header>

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <ChartCard title="Heart rate" icon={Heart} dataKey="HR" data={chartData} color="var(--color-chart-1)" />
        <ChartCard title="SpO₂" icon={Wind} dataKey="SpO2" data={chartData} color="var(--color-chart-2)" />
        <ChartCard title="Temperature" icon={Thermometer} dataKey="Temp" data={chartData} color="var(--color-chart-4)" />
      </div>

      <Card>
        <CardHeader><CardTitle>Alert history</CardTitle></CardHeader>
        <CardContent>
          {alerts.length === 0 ? <p className="text-sm text-muted-foreground">None.</p> : (
            <ul className="divide-y">
              {alerts.map(a => (
                <li key={a.id} className="py-2 flex items-center gap-3">
                  <Badge variant={(a.level === "CRITICAL" ? "destructive" : "secondary") as never}>{a.level}</Badge>
                  <div className="flex-1 text-sm">{a.message}</div>
                  <div className="text-xs text-muted-foreground">{new Date(a.ts).toLocaleString()}</div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ChartCard({ title, icon: Icon, dataKey, data, color }: { title: string; icon: React.ComponentType<{ className?: string }>; dataKey: string; data: { t: string; [k: string]: string | number }[]; color: string }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Icon className="size-4" /> {title}</CardTitle></CardHeader>
      <CardContent className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="t" tick={{ fontSize: 10 }} hide />
            <YAxis tick={{ fontSize: 10 }} domain={["auto", "auto"]} />
            <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }} />
            <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
