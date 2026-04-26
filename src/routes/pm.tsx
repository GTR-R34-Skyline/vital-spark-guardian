import { createFileRoute } from "@tanstack/react-router";
import { AppShell, RequireAuth } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { ListChecks, GanttChart, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/pm")({
  head: () => ({ meta: [{ title: "Project Plan — VitalSync" }] }),
  component: () => <RequireAuth><AppShell><PmPage /></AppShell></RequireAuth>,
});

const wbs = [
  { phase: "1. Planning & Requirements", tasks: ["Stakeholder needs", "Use cases", "Tech selection"] },
  { phase: "2. IoT Simulation Layer",    tasks: ["Patient model", "Time-series generator", "Anomaly injection"] },
  { phase: "3. Edge Processing",          tasks: ["Moving avg smoothing", "Threshold detection", "Noise filter"] },
  { phase: "4. Backend & Database",       tasks: ["Schema + RLS", "REST/server functions", "Ingestion endpoint"] },
  { phase: "5. DSL Compiler",             tasks: ["Lexer", "Parser → AST", "Evaluator + integration"] },
  { phase: "6. Security",                 tasks: ["Auth + roles", "SHA-256 hashing", "AES-GCM encryption"] },
  { phase: "7. Dashboard",                tasks: ["Live grid", "Patient detail", "Alerts panel"] },
  { phase: "8. EDA & Insights",           tasks: ["Time-series", "Correlation", "Outliers"] },
  { phase: "9. Integration Test",         tasks: ["End-to-end run", "Performance check"] },
  { phase: "10. Deploy & Docs",           tasks: ["Cloud publish", "User guide"] },
];

const gantt = [
  { phase: "Planning",  start: 0,  duration: 2 },
  { phase: "IoT Sim",   start: 2,  duration: 3 },
  { phase: "Edge",      start: 4,  duration: 2 },
  { phase: "Backend",   start: 5,  duration: 4 },
  { phase: "DSL",       start: 7,  duration: 4 },
  { phase: "Security",  start: 9,  duration: 3 },
  { phase: "Dashboard", start: 11, duration: 4 },
  { phase: "EDA",       start: 14, duration: 3 },
  { phase: "Integration", start: 16, duration: 2 },
  { phase: "Deploy",    start: 17, duration: 2 },
];

// EVA: weeks 1–10, planned vs earned vs actual cost (in person-days)
const eva = [
  { week: "W1", PV: 5,  EV: 5,  AC: 5 },
  { week: "W2", PV: 12, EV: 11, AC: 13 },
  { week: "W3", PV: 20, EV: 19, AC: 22 },
  { week: "W4", PV: 30, EV: 28, AC: 31 },
  { week: "W5", PV: 42, EV: 40, AC: 44 },
  { week: "W6", PV: 55, EV: 53, AC: 56 },
  { week: "W7", PV: 68, EV: 66, AC: 69 },
  { week: "W8", PV: 80, EV: 78, AC: 82 },
  { week: "W9", PV: 92, EV: 89, AC: 93 },
  { week: "W10", PV: 100, EV: 96, AC: 102 },
];
const last = eva[eva.length - 1];
const CPI = last.EV / last.AC;
const SPI = last.EV / last.PV;

function PmPage() {
  const totalWeeks = Math.max(...gantt.map(g => g.start + g.duration));

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2"><ListChecks className="size-6 text-primary" /> Project Management</h1>
        <p className="text-sm text-muted-foreground">Work Breakdown Structure · Gantt timeline · Earned Value Analysis</p>
      </header>

      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader><CardTitle>Work Breakdown Structure</CardTitle><CardDescription>10 phases, decomposed into deliverables.</CardDescription></CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm">
              {wbs.map(p => (
                <li key={p.phase}>
                  <div className="font-medium">{p.phase}</div>
                  <ul className="ml-5 list-disc text-muted-foreground">
                    {p.tasks.map(t => <li key={t}>{t}</li>)}
                  </ul>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><GanttChart className="size-5" /> Gantt timeline</CardTitle><CardDescription>{totalWeeks} weeks.</CardDescription></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {gantt.map(g => (
                  <div key={g.phase} className="grid grid-cols-[120px_1fr] items-center gap-2 text-xs">
                    <span className="text-muted-foreground">{g.phase}</span>
                    <div className="relative h-6 bg-muted rounded">
                      <div
                        className="absolute h-6 rounded"
                        style={{
                          left: `${(g.start / totalWeeks) * 100}%`,
                          width: `${(g.duration / totalWeeks) * 100}%`,
                          background: "var(--gradient-primary)",
                        }}
                      />
                    </div>
                  </div>
                ))}
                <div className="grid grid-cols-[120px_1fr] gap-2 text-[10px] text-muted-foreground pt-1">
                  <span />
                  <div className="flex justify-between">
                    {Array.from({ length: totalWeeks + 1 }).map((_, i) => <span key={i}>W{i}</span>)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="size-5" /> EVA snapshot</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-3 gap-3">
              <div><div className="text-xs text-muted-foreground">CPI (cost)</div><div className="text-2xl font-semibold tabular-nums">{CPI.toFixed(2)}</div><Badge variant={(CPI >= 1 ? "default" : "destructive") as never} className="text-[10px] mt-1">{CPI >= 1 ? "On budget" : "Over budget"}</Badge></div>
              <div><div className="text-xs text-muted-foreground">SPI (schedule)</div><div className="text-2xl font-semibold tabular-nums">{SPI.toFixed(2)}</div><Badge variant={(SPI >= 1 ? "default" : "secondary") as never} className="text-[10px] mt-1">{SPI >= 1 ? "On schedule" : "Slight slip"}</Badge></div>
              <div><div className="text-xs text-muted-foreground">% complete</div><div className="text-2xl font-semibold tabular-nums">{last.EV}%</div></div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Earned Value Analysis</CardTitle><CardDescription>Planned Value (PV), Earned Value (EV), Actual Cost (AC) over the project.</CardDescription></CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={eva}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="PV" fill="var(--color-chart-2)" name="Planned Value" />
              <Bar dataKey="EV" fill="var(--color-chart-1)" name="Earned Value" />
              <Bar dataKey="AC" fill="var(--color-chart-5)" name="Actual Cost" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
