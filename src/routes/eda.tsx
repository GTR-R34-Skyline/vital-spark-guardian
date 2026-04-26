import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell, RequireAuth } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
} from "recharts";
import { BarChart3 } from "lucide-react";

export const Route = createFileRoute("/eda")({
  head: () => ({ meta: [{ title: "Analytics — VitalSync" }] }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <EdaPage />
      </AppShell>
    </RequireAuth>
  ),
});

interface Vital {
  patient_id: string;
  ts: string;
  hr: number;
  spo2: number;
  temp: number;
  smoothed_hr: number;
  smoothed_spo2: number;
  smoothed_temp: number;
  is_anomaly: boolean;
}

function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n === 0) return 0;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0,
    dx = 0,
    dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx,
      b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  return dx === 0 || dy === 0 ? 0 : num / Math.sqrt(dx * dy);
}

function iqrOutliers(values: number[]) {
  if (values.length < 4) return { lo: -Infinity, hi: Infinity };
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  return { lo: q1 - 1.5 * iqr, hi: q3 + 1.5 * iqr };
}

function EdaPage() {
  const [vitals, setVitals] = useState<Vital[]>([]);
  const [patients, setPatients] = useState<{ id: string; display_label: string }[]>([]);

  useEffect(() => {
    const load = async () => {
      const { data: pts } = await supabase
        .from("patients")
        .select("id, display_label")
        .order("display_label");
      const { data: vits } = await supabase
        .from("vitals")
        .select("*")
        .order("ts", { ascending: false })
        .limit(800);
      setPatients((pts ?? []) as never);
      setVitals(((vits ?? []) as Vital[]).reverse());
    };
    load();
    const it = setInterval(load, 10000);
    return () => clearInterval(it);
  }, []);

  const stats = useMemo(() => {
    const hr = vitals.map((v) => Number(v.smoothed_hr));
    const spo2 = vitals.map((v) => Number(v.smoothed_spo2));
    const temp = vitals.map((v) => Number(v.smoothed_temp));
    const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
    const std = (a: number[]) => {
      const m = mean(a);
      return a.length ? Math.sqrt(mean(a.map((x) => (x - m) ** 2))) : 0;
    };
    const anomalyRate = vitals.length
      ? vitals.filter((v) => v.is_anomaly).length / vitals.length
      : 0;
    return {
      n: vitals.length,
      hr: { mean: mean(hr), std: std(hr) },
      spo2: { mean: mean(spo2), std: std(spo2) },
      temp: { mean: mean(temp), std: std(temp) },
      anomalyRate,
      corr: {
        hr_spo2: pearson(hr, spo2),
        hr_temp: pearson(hr, temp),
        spo2_temp: pearson(spo2, temp),
      },
    };
  }, [vitals]);

  const timeSeries = useMemo(() => {
    // sample to ~80 points
    const stride = Math.max(1, Math.floor(vitals.length / 80));
    return vitals
      .filter((_, i) => i % stride === 0)
      .map((v) => ({
        t: new Date(v.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        HR: +Number(v.smoothed_hr).toFixed(1),
        SpO2: +Number(v.smoothed_spo2).toFixed(1),
        Temp: +Number(v.smoothed_temp).toFixed(2),
      }));
  }, [vitals]);

  const hrOutliers = useMemo(() => {
    const hr = vitals.map((v) => Number(v.smoothed_hr));
    const { lo, hi } = iqrOutliers(hr);
    return vitals
      .map((v, i) => ({
        idx: i,
        hr: Number(v.smoothed_hr),
        outlier: Number(v.smoothed_hr) < lo || Number(v.smoothed_hr) > hi,
      }))
      .filter((p) => p.outlier)
      .slice(-50);
  }, [vitals]);

  const perPatient = useMemo(() => {
    const grouped = new Map<string, Vital[]>();
    for (const v of vitals) {
      if (!grouped.has(v.patient_id)) grouped.set(v.patient_id, []);
      grouped.get(v.patient_id)!.push(v);
    }
    const avg = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
    return patients.map((p) => {
      const rows = grouped.get(p.id) ?? [];
      const hr = rows.map((r) => Number(r.smoothed_hr));
      const spo2 = rows.map((r) => Number(r.smoothed_spo2));
      const temp = rows.map((r) => Number(r.smoothed_temp));
      const trend = (() => {
        if (hr.length < 6) return "stable";
        const half = Math.floor(hr.length / 2);
        const d = avg(hr.slice(half)) - avg(hr.slice(0, half));
        if (d > 1.2) return "increasing";
        if (d < -1.2) return "decreasing";
        return "stable";
      })();
      return {
        id: p.id,
        label: p.display_label,
        hrAvg: avg(hr),
        hrMin: hr.length ? Math.min(...hr) : 0,
        hrMax: hr.length ? Math.max(...hr) : 0,
        spo2Avg: avg(spo2),
        spo2Min: spo2.length ? Math.min(...spo2) : 0,
        spo2Max: spo2.length ? Math.max(...spo2) : 0,
        tempAvg: avg(temp),
        tempMin: temp.length ? Math.min(...temp) : 0,
        tempMax: temp.length ? Math.max(...temp) : 0,
        trend,
      };
    });
  }, [patients, vitals]);

  const corrMatrix = [
    ["", "HR", "SpO₂", "Temp"],
    ["HR", "1.00", stats.corr.hr_spo2.toFixed(2), stats.corr.hr_temp.toFixed(2)],
    ["SpO₂", stats.corr.hr_spo2.toFixed(2), "1.00", stats.corr.spo2_temp.toFixed(2)],
    ["Temp", stats.corr.hr_temp.toFixed(2), stats.corr.spo2_temp.toFixed(2), "1.00"],
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart3 className="size-6 text-primary" /> Exploratory Analytics
        </h1>
        <p className="text-sm text-muted-foreground">
          {stats.n} readings across {patients.length} patients
        </p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="HR (avg ± std)"
          value={`${stats.hr.mean.toFixed(1)} ± ${stats.hr.std.toFixed(1)}`}
          unit="bpm"
        />
        <StatCard
          title="SpO₂ (avg ± std)"
          value={`${stats.spo2.mean.toFixed(1)} ± ${stats.spo2.std.toFixed(1)}`}
          unit="%"
        />
        <StatCard
          title="Temp (avg ± std)"
          value={`${stats.temp.mean.toFixed(2)} ± ${stats.temp.std.toFixed(2)}`}
          unit="°C"
        />
        <StatCard title="Anomaly rate" value={`${(stats.anomalyRate * 100).toFixed(1)}`} unit="%" />
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Time-series (smoothed)</CardTitle>
          <CardDescription>Population-wide trends over time.</CardDescription>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={timeSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="t" tick={{ fontSize: 10 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
              <Tooltip
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="HR"
                stroke="var(--color-chart-1)"
                dot={false}
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="SpO2"
                stroke="var(--color-chart-2)"
                dot={false}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="Temp"
                stroke="var(--color-chart-4)"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Correlation matrix</CardTitle>
            <CardDescription>Pearson r across smoothed vitals.</CardDescription>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <tbody>
                {corrMatrix.map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => {
                      const isHeader = i === 0 || j === 0;
                      const num = parseFloat(cell);
                      const intensity = !isHeader && !isNaN(num) ? Math.abs(num) : 0;
                      return (
                        <td
                          key={j}
                          className={`px-3 py-2 text-center font-medium border ${isHeader ? "bg-muted/50" : ""}`}
                          style={
                            !isHeader && !isNaN(num)
                              ? {
                                  background: `color-mix(in oklab, var(--color-primary) ${intensity * 35}%, var(--color-card))`,
                                }
                              : {}
                          }
                        >
                          {cell}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>HR outliers (IQR rule)</CardTitle>
            <CardDescription>Values beyond Q1 − 1.5·IQR or Q3 + 1.5·IQR.</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            {hrOutliers.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                No outliers detected yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="idx" tick={{ fontSize: 10 }} name="reading" />
                  <YAxis dataKey="hr" tick={{ fontSize: 10 }} name="HR" />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Scatter data={hrOutliers} fill="var(--color-destructive)" />
                </ScatterChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Insights</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1.5 text-muted-foreground">
          <p>
            · Average HR is {stats.hr.mean.toFixed(0)} bpm with std {stats.hr.std.toFixed(1)} —{" "}
            {stats.hr.std > 12
              ? "high variability across population."
              : "stable across population."}
          </p>
          <p>
            · SpO₂ averaging {stats.spo2.mean.toFixed(1)}% —{" "}
            {stats.spo2.mean < 94
              ? "concerning, multiple patients may need oxygen support."
              : "within healthy range."}
          </p>
          <p>
            · HR↔SpO₂ correlation r={stats.corr.hr_spo2.toFixed(2)} —{" "}
            {Math.abs(stats.corr.hr_spo2) > 0.3
              ? "notable negative coupling typical of distress events."
              : "weak coupling overall."}
          </p>
          <p>
            · {(stats.anomalyRate * 100).toFixed(1)}% of readings flagged anomalous by edge filter +
            ML score.
          </p>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Per-patient moving insights</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {perPatient.map((p) => (
            <div key={p.id} className="rounded-md border bg-muted/20 p-3">
              <div className="font-medium">{p.label}</div>
              <div className="text-muted-foreground">
                HR avg/min/max: {p.hrAvg.toFixed(1)} / {p.hrMin.toFixed(1)} / {p.hrMax.toFixed(1)} · SpO₂
                avg/min/max: {p.spo2Avg.toFixed(1)} / {p.spo2Min.toFixed(1)} / {p.spo2Max.toFixed(1)} · Temp
                avg/min/max: {p.tempAvg.toFixed(2)} / {p.tempMin.toFixed(2)} / {p.tempMax.toFixed(2)} · Trend:{" "}
                {p.trend}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ title, value, unit }: { title: string; value: string; unit: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="text-xs text-muted-foreground">{title}</div>
        <div className="text-2xl font-semibold tabular-nums">
          {value}
          <span className="text-xs font-normal text-muted-foreground ml-1">{unit}</span>
        </div>
      </CardContent>
    </Card>
  );
}
