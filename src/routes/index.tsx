import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, ShieldCheck, Cpu, Code2, BarChart3, GitBranch, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "VitalSync — Intelligent Patient Monitoring" },
      {
        name: "description",
        content:
          "End-to-end IoT to dashboard pipeline for healthcare with DSL alert rules, EDA, and project management artifacts.",
      },
      { property: "og:title", content: "VitalSync — Intelligent Patient Monitoring" },
      {
        property: "og:description",
        content: "Simulated IoT vitals, edge processing, DSL rule engine, and live alerts.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen" style={{ background: "var(--gradient-hero)" }}>
      <header className="px-6 py-5 flex items-center justify-between max-w-7xl mx-auto">
        <Link to="/" className="flex items-center gap-2">
          <div
            className="size-9 rounded-lg flex items-center justify-center"
            style={{ background: "var(--gradient-primary)" }}
          >
            <Activity className="size-5 text-primary-foreground" />
          </div>
          <span className="font-semibold text-lg">VitalSync</span>
        </Link>
        <div className="flex gap-2">
          <Button variant="ghost" asChild>
            <Link to="/auth">Sign in</Link>
          </Button>
          <Button asChild>
            <Link to="/dashboard">
              Open dashboard <ArrowRight className="size-4 ml-1" />
            </Link>
          </Button>
        </div>
      </header>

      <section className="max-w-5xl mx-auto px-6 pt-16 pb-20 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-6">
          <span className="size-1.5 rounded-full bg-primary animate-pulse" />
          Live IoT pipeline · Edge → Cloud → Dashboard
        </div>
        <h1
          className="text-5xl md:text-6xl font-bold tracking-tight mb-5"
          style={{
            backgroundImage: "var(--gradient-primary)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          Intelligent patient monitoring,
          <br />
          end to end.
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
          Simulated IoT devices stream vitals through edge preprocessing into the cloud, where a
          custom DSL rule engine triggers alerts in real time. Built with security, analytics, and
          project management baked in.
        </p>
        <div className="flex justify-center gap-3">
          <Button size="lg" asChild>
            <Link to="/auth">Get started</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link to="/pm">View project plan</Link>
          </Button>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-24 grid md:grid-cols-3 gap-5">
        {[
          {
            icon: Cpu,
            title: "IoT + Edge processing",
            desc: "5 simulated patients, smoothing & noise filtering at the edge before cloud ingest.",
          },
          {
            icon: Code2,
            title: "DSL rule engine",
            desc: "Write rules like IF heart_rate > 120 AND spo2 < 92 THEN ALERT CRITICAL — tokenized, parsed, evaluated live.",
          },
          {
            icon: ShieldCheck,
            title: "Security built-in",
            desc: "Role-based access, SHA-256 hashed identifiers, AES-GCM encrypted PII, RLS in the database.",
          },
          {
            icon: BarChart3,
            title: "Exploratory analytics",
            desc: "Time-series, correlations, IQR outliers, and anomaly insights across patient populations.",
          },
          {
            icon: Activity,
            title: "Live dashboard",
            desc: "Real-time vitals grid, per-patient detail charts, and an alerts panel with acknowledgement.",
          },
          {
            icon: GitBranch,
            title: "Project artifacts",
            desc: "WBS, Gantt timeline, and Earned Value Analysis (CPI/SPI) bundled into the app.",
          },
        ].map((f, i) => (
          <div
            key={i}
            className="p-6 rounded-xl bg-card border"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <div className="size-10 rounded-lg flex items-center justify-center mb-4 bg-primary/10 text-primary">
              <f.icon className="size-5" />
            </div>
            <h3 className="font-semibold mb-1">{f.title}</h3>
            <p className="text-sm text-muted-foreground">{f.desc}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
