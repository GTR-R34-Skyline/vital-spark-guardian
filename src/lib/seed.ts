import { supabase } from "@/integrations/supabase/client";
import { sha256, aesEncrypt } from "@/lib/crypto";
import { parseRule } from "@/lib/dsl/parser";

const DEFAULT_PATIENTS = [
  { ext: "P-001", name: "Alice Carter", hr: 78, spo2: 97, temp: 36.7 },
  { ext: "P-002", name: "Bashir Khan", hr: 72, spo2: 98, temp: 36.6 },
  { ext: "P-003", name: "Chen Wei", hr: 85, spo2: 96, temp: 37.0 },
  { ext: "P-004", name: "Diana Lopez", hr: 68, spo2: 99, temp: 36.5 },
  { ext: "P-005", name: "Eitan Rosen", hr: 90, spo2: 95, temp: 37.1 },
];

const DEFAULT_RULES = [
  {
    name: "Tachycardia + Hypoxia",
    source: "IF heart_rate > 110 AND spo2 < 93 THEN ALERT CRITICAL",
    severity: "CRITICAL",
  },
  { name: "Severe Hypoxia", source: "IF spo2 < 90 THEN ALERT CRITICAL", severity: "CRITICAL" },
  { name: "Bradycardia", source: "IF heart_rate < 50 THEN ALERT WARNING", severity: "WARNING" },
  { name: "Fever", source: "IF temperature > 38.5 THEN ALERT WARNING", severity: "WARNING" },
];

export async function ensureSeedData() {
  const { data: existing } = await supabase.from("patients").select("id").limit(1);
  if (!existing || existing.length === 0) {
    for (const p of DEFAULT_PATIENTS) {
      const hashed = await sha256(p.ext);
      const encrypted = await aesEncrypt(p.name);
      await supabase.from("patients").insert({
        hashed_external_id: hashed,
        encrypted_name: encrypted,
        display_label: p.ext,
        baseline_hr: p.hr,
        baseline_spo2: p.spo2,
        baseline_temp: p.temp,
      });
    }
  }

  const { data: rules } = await supabase.from("rules").select("id").limit(1);
  if (!rules || rules.length === 0) {
    for (const r of DEFAULT_RULES) {
      try {
        const ast = parseRule(r.source);
        await supabase.from("rules").insert({
          name: r.name,
          source: r.source,
          compiled_ast: ast as never,
          enabled: true,
          severity_default: r.severity,
        });
      } catch {
        /* ignore */
      }
    }
  }
}
