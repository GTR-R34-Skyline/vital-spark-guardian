import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell, RequireAuth } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { validate, parseRule } from "@/lib/dsl/parser";
import { tokenize } from "@/lib/dsl/lexer";
import { evaluateRule } from "@/lib/dsl/evaluator";
import { Code2, Trash2, CheckCircle2, XCircle, Play, Database, Bug, Settings2, Activity } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/rules")({
  head: () => ({ meta: [{ title: "Rules (DSL) — VitalSync" }] }),
  component: () => (
    <RequireAuth admin>
      <AppShell>
        <RulesPage />
      </AppShell>
    </RequireAuth>
  ),
});

interface Rule {
  id: string;
  name: string;
  source: string;
  enabled: boolean;
  severity_default: string;
}

function ASTNode({ node, isRoot = true }: { node: any, isRoot?: boolean }) {
  if (!node) return null;
  if (typeof node !== "object") return <span className="text-foreground font-semibold">{String(node)}</span>;
  return (
    <ul className={cn("space-y-1", !isRoot && "pl-4 border-l border-border/60 ml-1.5 mt-1")}>
      {Object.entries(node).map(([key, val]) => (
        <li key={key} className="text-xs font-mono">
          <span className="text-muted-foreground/80 mr-1.5">{key}:</span>
          <ASTNode node={val} isRoot={false} />
        </li>
      ))}
    </ul>
  );
}

function RulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [name, setName] = useState("");
  const [source, setSource] = useState("IF heart_rate > 120 AND spo2 < 92 THEN ALERT CRITICAL");
  const [testHr, setTestHr] = useState(125);
  const [testSpo2, setTestSpo2] = useState(89);
  const [testTemp, setTestTemp] = useState(37.4);
  const [isLiveTesting, setIsLiveTesting] = useState(false);

  async function testWithLive() {
    setIsLiveTesting(true);
    try {
      const { data } = await supabase.from("vitals").select("*").order("ts", { ascending: false }).limit(1);
      if (data && data.length > 0) {
        setTestHr(Math.round(data[0].smoothed_hr * 10) / 10);
        setTestSpo2(Math.round(data[0].smoothed_spo2 * 10) / 10);
        setTestTemp(Math.round(data[0].smoothed_temp * 10) / 10);
        toast.success("Loaded the absolute latest patient live vitals.");
      } else {
        toast.error("No live data available.");
      }
    } finally {
      setIsLiveTesting(false);
    }
  }

  async function load() {
    const { data } = await supabase
      .from("rules")
      .select("*")
      .order("created_at", { ascending: false });
    setRules((data ?? []) as Rule[]);
  }
  useEffect(() => {
    load();
  }, []);

  const validation = validate(source);
  const tokens = (() => {
    try {
      return tokenize(source);
    } catch {
      return [];
    }
  })();
  const evalResult = (() => {
    if (!validation.ok) return null;
    try {
      return evaluateRule(parseRule(source), { hr: testHr, spo2: testSpo2, temp: testTemp });
    } catch {
      return null;
    }
  })();

  async function saveRule() {
    if (!validation.ok) {
      toast.error(`Syntax error: ${validation.error}`);
      return;
    }
    if (!name.trim()) {
      toast.error("Name required");
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("rules").insert({
      name,
      source,
      compiled_ast: validation.ast as never,
      enabled: true,
      severity_default: validation.ast.level,
      created_by: user?.id,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Rule saved");
      setName("");
      load();
    }
  }

  async function toggle(r: Rule) {
    await supabase.from("rules").update({ enabled: !r.enabled }).eq("id", r.id);
    load();
  }
  async function remove(id: string) {
    await supabase.from("rules").delete().eq("id", id);
    load();
  }

  return (
    <div className="p-6 max-w-5xl mx-auto pb-20">
      <header className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2 text-foreground tracking-tight">
          <Code2 className="size-6 text-primary" /> Rules Engine (DSL)
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Draft and evaluate domain-specific medical alerting rules dynamically. Use <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">heart_rate / hr</code>, <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">spo2</code>, <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">temperature / temp</code>.
        </p>
      </header>

      <div className="space-y-6">
        <Card className="shadow-sm border-border/50">
          <CardHeader className="pb-3 border-b border-border/30 bg-muted/5">
            <CardTitle className="text-lg">Rule Editor</CardTitle>
            <CardDescription>Develop conditions using the custom medical DSL.</CardDescription>
          </CardHeader>
          <CardContent className="pt-5 space-y-4">
            <div className="grid md:grid-cols-[1fr_2fr] gap-6">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Rule Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Critical Tachycardia + Hypoxia"
                  className="bg-background"
                />
                
                <div className="pt-4">
                  <Button onClick={saveRule} disabled={!validation.ok} className="w-full">
                    Save New Rule
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex justify-between">
                  <span>DSL Source Code</span>
                </Label>
                <div className="relative group rounded-md border border-input bg-zinc-950 dark:bg-zinc-900 overflow-hidden focus-within:ring-1 focus-within:ring-ring">
                  <div className="flex bg-zinc-900 dark:bg-zinc-800/80 px-3 py-1.5 border-b border-zinc-800">
                     <div className="flex gap-1.5 opacity-50">
                       <div className="size-2.5 rounded-full bg-destructive"></div>
                       <div className="size-2.5 rounded-full bg-warning"></div>
                       <div className="size-2.5 rounded-full bg-success"></div>
                     </div>
                  </div>
                  <Textarea
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    className="font-mono text-sm border-0 focus-visible:ring-0 resize-none leading-relaxed bg-transparent text-zinc-100 min-h-[120px] p-4 placeholder:text-zinc-600"
                    placeholder="IF heart_rate > 100 THEN ALERT WARNING"
                  />
                </div>
                
                {/* Inline Parser Status */}
                <div
                  className={cn(
                    "text-xs flex items-center gap-1.5 px-3 py-2 rounded-md font-medium border",
                    validation.ok ? "bg-success/5 text-success border-success/20" : "bg-destructive/5 text-destructive border-destructive/20"
                  )}
                >
                  {validation.ok ? (
                    <><CheckCircle2 className="size-4" /> Syntactically Valid (Severity: {validation.ast.level})</>
                  ) : (
                    <><XCircle className="size-4" /> Error at position {validation.pos}: {validation.error}</>
                  )}
                </div>
              </div>
            </div>

            {/* Compiler Insights Accordion */}
            <Accordion type="single" collapsible className="w-full pt-2">
              <AccordionItem value="compiler" className="border-border/30">
                <AccordionTrigger className="text-xs hover:no-underline hover:text-primary text-muted-foreground/80 py-2">
                  <span className="flex items-center gap-2"><Bug className="size-3.5" /> Compiler Insights / AST Viewer</span>
                </AccordionTrigger>
                <AccordionContent className="pt-2">
                  <div className="grid md:grid-cols-2 gap-4 bg-muted/20 p-4 rounded-md border border-border/40">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wider mb-2 text-muted-foreground">Tokens List</div>
                      <div className="flex flex-wrap gap-1.5">
                        {tokens.map((t, i) => (
                          <span key={i} className="text-xs px-2 py-0.5 rounded bg-background border border-border/50 text-muted-foreground font-mono shadow-sm">
                            <span className="text-primary font-bold">{t.type}</span>
                            {t.value && t.type !== t.value ? <span className="opacity-70 ml-1">'{t.value}'</span> : ""}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wider mb-2 text-muted-foreground">Parsed AST Tree</div>
                      <div className="text-xs bg-background border border-border/50 rounded-md p-3 overflow-auto max-h-48 shadow-sm">
                        {validation.ok ? <ASTNode node={validation.ast} /> : <span className="text-muted-foreground italic">Fix syntax to parse AST.</span>}
                      </div>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>

        {/* Rule Testing Simulator */}
        <Card className="shadow-sm border-border/50 bg-primary/5">
          <CardHeader className="pb-3 border-b border-primary/10">
            <div className="flex justify-between items-center">
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="size-5 text-primary" /> Simulator Sandbox
              </CardTitle>
              <Button size="sm" variant="outline" className="bg-background h-8" onClick={testWithLive} disabled={isLiveTesting}>
                <Database className="size-3.5 mr-1.5" /> Pull Live Vitals
              </Button>
            </div>
            <CardDescription>Test the rule currently in the editor interactively.</CardDescription>
          </CardHeader>
          <CardContent className="pt-5 flex flex-col md:flex-row gap-8 items-center">
            
            <div className="flex-1 w-full space-y-6">
              <div className="space-y-3">
                <div className="flex justify-between"><Label className="font-semibold">Heart Rate (HR)</Label> <span className="text-sm font-mono">{testHr} bpm</span></div>
                <Slider value={[testHr]} onValueChange={([v]) => setTestHr(v)} max={220} min={30} step={1} />
              </div>
              <div className="space-y-3">
                <div className="flex justify-between"><Label className="font-semibold">SpO₂</Label> <span className="text-sm font-mono">{testSpo2} %</span></div>
                <Slider value={[testSpo2]} onValueChange={([v]) => setTestSpo2(v)} max={100} min={60} step={1} />
              </div>
              <div className="space-y-3">
                <div className="flex justify-between"><Label className="font-semibold">Temperature</Label> <span className="text-sm font-mono">{testTemp} °C</span></div>
                <Slider value={[testTemp]} onValueChange={([v]) => setTestTemp(v)} max={42} min={32} step={0.1} />
              </div>
            </div>

            <div className="w-full md:w-64 flex flex-col items-center justify-center p-6 bg-background rounded-xl border border-border/50 shadow-sm shrink-0 min-h-32 text-center">
              <div className="text-xs uppercase font-bold tracking-wider text-muted-foreground mb-3">Evaluation Result</div>
              {evalResult ? (
                evalResult.triggered ? (
                  <Badge variant={evalResult.level === "CRITICAL" ? "destructive" : "secondary"} className={cn("px-4 py-2 text-sm shadow-sm", evalResult.level === "CRITICAL" && "animate-pulse")}>
                    🔥 Triggered: {evalResult.level}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="px-4 py-2 text-sm bg-success/10 text-success border-success/30">
                    <CheckCircle2 className="size-4 mr-1.5" /> Stable
                  </Badge>
                )
              ) : (
                <div className="text-muted-foreground/60 text-sm italic">Rule contains errors.</div>
              )}
            </div>

          </CardContent>
        </Card>

        {/* Saved Rules List */}
        <Card className="shadow-sm border-border/50">
          <CardHeader className="pb-3 border-b border-border/30 bg-muted/5">
            <CardTitle className="text-lg">Saved Rules Registry ({rules.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {rules.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">No active rules deployed to the engine yet.</div>
            ) : (
              <ul className="divide-y divide-border/40">
                {rules.map((r) => (
                  <li key={r.id} className={cn("p-4 flex items-start sm:items-center gap-4 transition-colors hover:bg-muted/30", !r.enabled && "opacity-60 grayscale")}>
                    <Switch checked={r.enabled} onCheckedChange={() => toggle(r)} className="mt-1 sm:mt-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-1">
                        <span className="font-semibold text-sm text-foreground">{r.name}</span>
                        <Badge variant="outline" className={cn(
                          "text-[10px] w-fit",
                          r.severity_default === "CRITICAL" && "border-destructive/30 text-destructive bg-destructive/5"
                        )}>
                          {r.severity_default}
                        </Badge>
                      </div>
                      <code className="text-xs text-muted-foreground block font-mono bg-muted/40 p-1.5 rounded">{r.source}</code>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => remove(r.id)} className="hover:bg-destructive/10 hover:text-destructive shrink-0">
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
