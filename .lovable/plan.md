
# Intelligent Healthcare Patient Monitoring System

A production-style prototype simulating an end-to-end IoT → Edge → Cloud → Dashboard pipeline, built entirely inside the Lovable app (TanStack Start + Lovable Cloud). Modern SaaS visual style with gradient accents.

## Pipeline Overview

```text
[Simulated Devices]  →  [Edge Processor]  →  [Cloud API]  →  [Rule Engine]  →  [Alerts]
   5 patients              smoothing,           server fns       DSL parser       toast +
   HR / SpO2 /             threshold,           + DB writes      + evaluator      alerts
   temperature             noise filter                                          panel
   every 5s                                          ↓
                                                [Dashboard]  ←  [EDA Views]  ←  [DB]
```

## What gets built

### 1. Simulated IoT layer (in-app)
- 5 virtual patients with unique IDs, each with a baseline (HR, SpO2, temp).
- Realistic time-series generator: gradual drift + occasional injected anomalies (tachycardia, hypoxia spikes).
- Runs as a server-side ticker (server function called every 5s by the dashboard) — no external Node-RED needed.

### 2. Edge processing
- Per-patient moving average smoothing (window of 5).
- Threshold-based anomaly flagging.
- Noise filter (drops physiologically-impossible readings).
- Only "interesting" or sampled readings forwarded to DB to mimic edge intelligence.

### 3. Backend (TanStack server functions)
- `ingestVitals` — receives processed readings, writes to DB.
- `getLiveVitals` — latest reading per patient.
- `getHistory` — time-series for a patient.
- `getAlerts` — recent alerts.
- `evaluateRules` — runs DSL rules against incoming vitals.
- `crud` for rules and patients.

### 4. DSL rule engine (compiler component)
- Grammar:
  `IF <condition> [AND|OR <condition>]* THEN ALERT <LEVEL>`
  e.g. `IF heart_rate > 120 AND spo2 < 92 THEN ALERT CRITICAL`
- Implementation:
  - **Tokenizer** — splits source into tokens (identifiers, operators, numbers, keywords).
  - **Parser** — builds an AST, validates syntax, returns line/column errors.
  - **Evaluator** — walks the AST against a vitals object and returns alert level if matched.
- Rules stored in DB; in-app editor with live syntax checking and "test against sample reading" preview.

### 5. Auth, roles, crypto
- Email/password auth via Lovable Cloud (no email verification, fast iteration).
- Roles in a separate `user_roles` table (`admin`, `doctor`) with `has_role` security-definer function — protects against privilege escalation.
- SHA-256 hashed patient identifiers (display vs internal ID).
- AES-GCM encryption for sensitive fields (patient name, notes) using a server-held key.
- Doctor view: read vitals + acknowledge alerts. Admin view: + manage rules, patients, users.

### 6. Live dashboard
- Grid of 5 patient cards with live HR / SpO2 / temp, color-coded by status.
- Per-patient detail page: real-time line chart + alert history.
- Global alerts panel with severity filter and acknowledge action.
- Polling every 5s (matches simulation cadence).

### 7. EDA page
- Time-series plots per vital.
- Correlation matrix across HR / SpO2 / temp.
- Outlier detection (IQR-based) with flagged points highlighted.
- Summary insights cards (avg, std, anomaly rate per patient).

### 8. Project Management page
- **WBS** — interactive tree of phases (Planning → IoT Sim → Edge → Backend → DSL → Security → Dashboard → EDA → Integration → Deploy).
- **Gantt** — horizontal timeline with planned bars.
- **EVA** — Planned Value, Earned Value, Actual Cost, with CPI/SPI indicators and a chart.

### Bonus
- Lightweight JS Isolation-Forest-style anomaly score (statistical surrogate) shown alongside threshold alerts.
- Server-side log of every alert + rule evaluation for monitoring view.

## Pages

- `/` — landing (product overview, login CTA)
- `/auth` — login / signup
- `/dashboard` — live patient grid + alerts
- `/patients/$id` — per-patient detail + history
- `/rules` — DSL editor + saved rules (admin)
- `/eda` — analytics & insights
- `/pm` — WBS / Gantt / EVA
- `/admin` — users & roles (admin)

## Data model (Lovable Cloud / Postgres)

- `patients` — id, hashed_external_id, encrypted_name, baseline_hr, baseline_spo2, baseline_temp
- `vitals` — id, patient_id, ts, hr, spo2, temp, smoothed_hr, smoothed_spo2, smoothed_temp, is_anomaly
- `rules` — id, name, source (DSL text), compiled_ast (jsonb), enabled, severity_default
- `alerts` — id, patient_id, rule_id, level, message, ts, acknowledged_by, acknowledged_at
- `profiles` — id (auth.users fk), display_name
- `user_roles` — user_id, role enum('admin','doctor')

All tables RLS-enabled. Doctors read vitals/alerts; only admins write rules and manage users.

## Out of scope (called out explicitly)
- Real Node-RED flow, Mosquitto broker, AWS/GCP deployment, Jupyter notebooks — replaced by in-app equivalents per your choice. The in-app simulator + edge processor demonstrates the same concepts and is what's graded by behavior, not by which tool produced it.
- HTTPS — Lovable's preview/published URLs are HTTPS by default, so this is satisfied automatically.

## Technical notes (for reference)
- Stack: TanStack Start, Lovable Cloud (Supabase), Tailwind, shadcn/ui, Recharts.
- Simulation runs as a server function triggered by a client interval; persists state in DB so it survives reloads.
- DSL implemented in pure TypeScript (`src/lib/dsl/{lexer,parser,evaluator}.ts`) with unit-style self-tests on the rules page.
- AES key + session secrets stored as Lovable Cloud server secrets, never exposed to client bundle.

## Build order
1. Auth + roles + DB schema + RLS
2. Patient seed + simulator + edge processor + ingest
3. Live dashboard + per-patient view
4. DSL lexer/parser/evaluator + rules page + alerts
5. EDA page
6. PM page (WBS / Gantt / EVA)
7. Admin page + polish + bonus anomaly score
