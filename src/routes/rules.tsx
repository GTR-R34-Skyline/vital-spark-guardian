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
import { validate, parseRule } from "@/lib/dsl/parser";
import { tokenize } from "@/lib/dsl/lexer";
import { evaluateRule } from "@/lib/dsl/evaluator";
import { Code2, Trash2, CheckCircle2, XCircle, Play } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/rules")({
  head: () => ({ meta: [{ title: "Rules (DSL) — VitalSync" }] }),
  component: () => <RequireAuth admin><AppShell><RulesPage /></AppShell></RequireAuth>,
});

interface Rule { id: string; name: string; source: string; enabled: boolean; severity_default: string }

function RulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [name, setName] = useState("");
  const [source, setSource] = useState("IF heart_rate > 120 AND spo2 < 92 THEN ALERT CRITICAL");
  const [testHr, setTestHr] = useState(125);
  const [testSpo2, setTestSpo2] = useState(89);
  const [testTemp, setTestTemp] = useState(37.4);

  async function load() {
    const { data } = await supabase.from("rules").select("*").order("created_at", { ascending: false });
    setRules((data ?? []) as Rule[]);
  }
  useEffect(() => { load(); }, []);

  const validation = validate(source);
  const tokens = (() => { try { return tokenize(source); } catch { return []; } })();
  const evalResult = (() => {
    if (!validation.ok) return null;
    try { return evaluateRule(parseRule(source), { hr: testHr, spo2: testSpo2, temp: testTemp }); }
    catch { return null; }
  })();

  async function saveRule() {
    if (!validation.ok) { toast.error(`Syntax error: ${validation.error}`); return; }
    if (!name.trim()) { toast.error("Name required"); return; }
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("rules").insert({
      name, source,
      compiled_ast: validation.ast as never,
      enabled: true,
      severity_default: validation.ast.level,
      created_by: user?.id,
    });
    if (error) toast.error(error.message);
    else { toast.success("Rule saved"); setName(""); load(); }
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
    <div className="p-6 max-w-6xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Code2 className="size-6 text-primary" /> Rule DSL</h1>
        <p className="text-sm text-muted-foreground">
          Grammar: <code className="text-xs bg-muted px-1.5 py-0.5 rounded">IF &lt;cond&gt; [AND|OR &lt;cond&gt;]* THEN ALERT &lt;LEVEL&gt;</code>
          {" "}— Fields: <code>heart_rate / hr</code>, <code>spo2</code>, <code>temperature / temp</code>. Levels: INFO, WARNING, CRITICAL.
        </p>
      </header>

      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader><CardTitle>New rule</CardTitle><CardDescription>Live tokenization, parsing and evaluation.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div><Label>Name</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Tachycardia + Hypoxia" /></div>
            <div>
              <Label>DSL source</Label>
              <Textarea value={source} onChange={e => setSource(e.target.value)} className="font-mono text-sm" rows={3} />
            </div>
            <div className={`text-xs flex items-center gap-1 ${validation.ok ? "text-success" : "text-destructive"}`}>
              {validation.ok ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
              {validation.ok ? `Valid · level ${validation.ast.level}` : `Parse error at pos ${validation.pos}: ${validation.error}`}
            </div>
            <Button onClick={saveRule} disabled={!validation.ok}>Save rule</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Compiler internals</CardTitle><CardDescription>Tokens (lexer) & AST (parser).</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <div className="text-xs font-medium mb-1 text-muted-foreground">Tokens</div>
              <div className="flex flex-wrap gap-1">
                {tokens.map((t, i) => (
                  <span key={i} className="text-xs px-1.5 py-0.5 rounded bg-muted font-mono">
                    {t.type}{t.value && t.type !== t.value ? `:${t.value}` : ""}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium mb-1 text-muted-foreground">AST</div>
              <pre className="text-xs bg-muted rounded p-2 overflow-auto max-h-32">{validation.ok ? JSON.stringify(validation.ast, null, 2) : "—"}</pre>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader><CardTitle className="flex items-center gap-2"><Play className="size-4" /> Test against sample reading</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div><Label>HR</Label><Input type="number" value={testHr} onChange={e => setTestHr(+e.target.value)} /></div>
          <div><Label>SpO₂</Label><Input type="number" value={testSpo2} onChange={e => setTestSpo2(+e.target.value)} /></div>
          <div><Label>Temp</Label><Input type="number" step="0.1" value={testTemp} onChange={e => setTestTemp(+e.target.value)} /></div>
          <div>
            {evalResult ? (
              <Badge variant={(evalResult.triggered ? (evalResult.level === "CRITICAL" ? "destructive" : "secondary") : "outline") as never} className="text-sm">
                {evalResult.triggered ? `🔥 Triggers ${evalResult.level}` : "Does not trigger"}
              </Badge>
            ) : <Badge variant="outline">Fix syntax to test</Badge>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Saved rules ({rules.length})</CardTitle></CardHeader>
        <CardContent>
          {rules.length === 0 ? <p className="text-sm text-muted-foreground">No rules yet.</p> : (
            <ul className="divide-y">
              {rules.map(r => (
                <li key={r.id} className="py-3 flex items-center gap-3">
                  <Switch checked={r.enabled} onCheckedChange={() => toggle(r)} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{r.name} <Badge variant="outline" className="ml-2 text-[10px]">{r.severity_default}</Badge></div>
                    <code className="text-xs text-muted-foreground block truncate">{r.source}</code>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => remove(r.id)}><Trash2 className="size-4 text-destructive" /></Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
