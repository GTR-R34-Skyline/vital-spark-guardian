import { createFileRoute } from "@tanstack/react-router";
import { AppShell, RequireAuth } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { ListChecks, GanttChart, TrendingUp, CheckCircle2, Clock, CircleDashed } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/pm")({
  head: () => ({ meta: [{ title: "Project Plan — VitalSync" }] }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <PmPage />
      </AppShell>
    </RequireAuth>
  ),
});

const wbs = [
  {
    phase: "1. Planning & Requirements",
    tasks: ["Stakeholder needs", "Use cases", "Tech selection"],
    status: 'complete'
  },
  {
    phase: "2. IoT Simulation Layer",
    tasks: ["Patient model", "Time-series generator", "Anomaly injection"],
    status: 'complete'
  },
  {
    phase: "3. Edge Processing",
    tasks: ["Moving avg smoothing", "Threshold detection", "Noise filter"],
    status: 'complete'
  },
  {
    phase: "4. Backend & Database",
    tasks: ["Schema + RLS", "REST/server functions", "Ingestion endpoint"],
    status: 'complete'
  },
  { phase: "5. DSL Compiler", tasks: ["Lexer", "Parser → AST", "Evaluator + integration"], status: 'complete' },
  { phase: "6. Security", tasks: ["Auth + roles", "SHA-256 hashing", "AES-GCM encryption"], status: 'complete' },
  { phase: "7. Dashboard", tasks: ["Live grid", "Patient detail", "Alerts panel"], status: 'in-progress' },
  { phase: "8. EDA & Insights", tasks: ["Time-series", "Correlation", "Outliers"], status: 'pending' },
  { phase: "9. Integration Test", tasks: ["End-to-end run", "Performance check"], status: 'pending' },
  { phase: "10. Deploy & Docs", tasks: ["Cloud publish", "User guide"], status: 'pending' },
];

const gantt = [
  { phase: "Planning", start: 0, duration: 2 },
  { phase: "IoT Sim", start: 2, duration: 3 },
  { phase: "Edge", start: 4, duration: 2 },
  { phase: "Backend", start: 5, duration: 4 },
  { phase: "DSL", start: 7, duration: 4 },
  { phase: "Security", start: 9, duration: 3 },
  { phase: "Dashboard", start: 11, duration: 4 },
  { phase: "EDA", start: 14, duration: 3 },
  { phase: "Integration", start: 16, duration: 2 },
  { phase: "Deploy", start: 17, duration: 2 },
];

// EVA: weeks 1–10, planned vs earned vs actual cost (in person-days)
const eva = [
  { week: "W1", PV: 5, EV: 5, AC: 5 },
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
  const totalWeeks = Math.max(...gantt.map((g) => g.start + g.duration));

  return (
    <div className="p-6 max-w-7xl mx-auto pb-20">
      <header className="mb-6 border-b border-border/40 pb-4">
        <h1 className="text-2xl font-bold flex items-center gap-2 text-foreground tracking-tight">
          <ListChecks className="size-6 text-primary" /> Project Management
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Work Breakdown Structure · Interactive Gantt Timeline · Earned Value Analysis
        </p>
      </header>

      <div className="grid lg:grid-cols-[1fr_1.5fr] gap-6 mb-6">
        
        {/* Work Breakdown Structure */}
        <Card className="shadow-sm border-border/50 h-fit bg-card/60 backdrop-blur-sm">
          <CardHeader className="pb-3 border-b border-border/30 bg-muted/5">
            <CardTitle className="text-lg">Work Breakdown Structure (WBS)</CardTitle>
            <CardDescription>Decomposed hierarchical deliverable tasks.</CardDescription>
          </CardHeader>
          <CardContent className="pt-4 px-4">
            <Accordion type="multiple" defaultValue={["7. Dashboard"]} className="w-full">
              {wbs.map((p) => (
                <AccordionItem key={p.phase} value={p.phase} className="border-border/40">
                  <AccordionTrigger className="text-sm font-semibold hover:no-underline py-3 px-2 rounded-md hover:bg-muted/30 transition-colors">
                    <div className="flex items-center justify-between w-full pr-4">
                      <span className="text-left">{p.phase}</span>
                      <div onClick={(e) => e.stopPropagation()}>
                        {p.status === 'complete' && <CheckCircle2 className="size-4 text-success" />}
                        {p.status === 'in-progress' && <Clock className="size-4 text-primary animate-pulse" />}
                        {p.status === 'pending' && <CircleDashed className="size-4 text-muted-foreground/50" />}
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4">
                    <ul className="pl-6 space-y-2.5 border-l-2 border-border/40 ml-4 mt-2">
                      {p.tasks.map((t, idx) => (
                        <li key={t} className="text-sm flex items-center justify-between group">
                          <span className={cn(
                            "transition-colors",
                            p.status === 'complete' ? "text-muted-foreground line-through" : "text-foreground group-hover:text-primary"
                          )}>
                            {t}
                          </span>
                          {p.status === 'in-progress' && idx === 0 && <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary">Active</Badge>}
                        </li>
                      ))}
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>

        {/* Right Column: Gantt & EVA Metrics */}
        <div className="space-y-6">
          <Card className="shadow-sm border-border/50 overflow-hidden">
            <CardHeader className="pb-4 border-b border-border/30 bg-muted/5">
              <CardTitle className="flex items-center gap-2 text-lg">
                <GanttChart className="size-5" /> Gantt Timeline
              </CardTitle>
              <CardDescription>Project schedule across {totalWeeks} weeks.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 relative">
              {/* Timeline Horizontal Layout */}
              <div className="relative pl-[100px] pb-6">
                
                {/* Vertical Gridlines */}
                <div className="absolute top-0 bottom-6 left-[100px] right-0 flex justify-between pointer-events-none">
                  {Array.from({ length: totalWeeks + 1 }).map((_, i) => (
                    <div key={i} className="h-full border-l border-border/30 border-dashed relative">
                      {/* Week Labels */}
                      <span className="absolute -bottom-6 -translate-x-1/2 text-[10px] font-medium text-muted-foreground/70">W{i}</span>
                    </div>
                  ))}
                </div>

                <div className="space-y-4 relative z-10 w-full">
                  {gantt.map((g, idx) => {
                    const isPhaseActive = idx === 6; // Example static active marker for Dashboard
                    const isPhaseDone = idx < 6;
                    
                    return (
                      <div key={g.phase} className="relative h-6 flex items-center">
                        <span className="absolute -left-[100px] w-[90px] text-xs font-medium text-muted-foreground text-right truncate">
                          {g.phase}
                        </span>
                        
                        {/* Empty Track representing standard row UI */}
                        <div className="w-full h-1.5 bg-border/20 rounded-full" />
                        
                        {/* Actual Task Duration Bar */}
                        <div
                          className={cn(
                            "absolute h-5 rounded-md flex items-center shadow-sm",
                            isPhaseDone ? "bg-muted-foreground/20" : isPhaseActive ? "bg-primary" : "bg-primary/40 border border-border/50"
                          )}
                          style={{
                            left: `${(g.start / totalWeeks) * 100}%`,
                            width: `${(g.duration / totalWeeks) * 100}%`,
                            top: "50%",
                            transform: "translateY(-50%)"
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-border/50 bg-primary/5">
            <CardHeader className="pb-3 border-b border-primary/10">
              <CardTitle className="flex items-center gap-2 text-lg">
                <TrendingUp className="size-5 text-primary" /> Performance Metrics (EVA)
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-6 pt-5">
              <div className="space-y-1">
                <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">CPI (Cost)</div>
                <div className="text-3xl font-bold tabular-nums tracking-tighter text-foreground">{CPI.toFixed(2)}</div>
                <div className="pt-1 text-sm font-medium">
                   {CPI >= 1 ? <span className="text-success flex items-center gap-1"><CheckCircle2 className="size-3.5" /> Under Budget</span> : <span className="text-destructive flex items-center gap-1">Over Budget</span>}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">SPI (Schedule)</div>
                <div className="text-3xl font-bold tabular-nums tracking-tighter text-foreground">{SPI.toFixed(2)}</div>
                <div className="pt-1 text-sm font-medium">
                   {SPI >= 1 ? <span className="text-success flex items-center gap-1"><CheckCircle2 className="size-3.5" /> On Schedule</span> : <span className="text-warning flex items-center gap-1">Behind Schedule</span>}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Completion</div>
                <div className="text-3xl font-bold tabular-nums tracking-tighter text-foreground">{last.EV}%</div>
                <div className="pt-1 text-sm font-medium text-muted-foreground">
                   Earned Value Ratio
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Earned Value Time-series Chart */}
      <Card className="shadow-sm border-border/50">
        <CardHeader className="pb-4 border-b border-border/30 bg-muted/5">
          <CardTitle className="text-lg">Earned Value Analysis Trajectory</CardTitle>
          <CardDescription>
            Tracking Planned Value (PV), Earned Value (EV), and Actual Cost (AC) linearly.
          </CardDescription>
        </CardHeader>
        <CardContent className="h-80 pt-6">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={eva} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" className="opacity-50" />
              <XAxis dataKey="week" tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }} axisLine={false} tickLine={false} dy={10} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{
                  background: "var(--color-background)",
                  border: "1px solid var(--color-border)",
                  borderRadius: '0.5rem',
                  fontSize: 12,
                  boxShadow: "var(--shadow-elegant)"
                }}
                cursor={{ fill: 'var(--color-muted)', opacity: 0.2 }}
              />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: '20px' }} iconType="circle" />
              <Bar dataKey="PV" fill="var(--color-secondary)" name="Planned Value" radius={[2, 2, 0, 0]} />
              <Bar dataKey="EV" fill="var(--color-primary)" name="Earned Value" radius={[2, 2, 0, 0]} />
              <Bar dataKey="AC" fill="var(--color-chart-5)" name="Actual Cost" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
