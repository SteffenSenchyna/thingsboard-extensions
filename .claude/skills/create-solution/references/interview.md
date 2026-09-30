# Domain interview (interactive mode only)

Loaded by `create-solution` Step 1b when `mode=interactive`. (Autonomous runs skip the interview entirely and infer from the original request.)

**Before asking anything:** ensure the Step 1b extension inform-line has been printed — if it hasn't, print it now, then continue.

Ask targeted questions — at most 3 per message. Option-based questions go through `AskUserQuestion` (per **Pipeline Config → Question UI**); the only open-ended question is plain text. Include a `Skip — you decide` option in every `AskUserQuestion` call; the user can also reply `skip` in chat.

Introduce the skip option on the first batch:

> "You can answer these, or reply **skip** at any time and I'll decide everything from your original request using the platform rulebook."

Question templates:

- **Domain & entities** (plain text) — what's being monitored or controlled? Open-ended; examples: sensors, meters, gateways, vehicles, machines.
- **Hierarchy** (`AskUserQuestion`, `header: "Hierarchy"`):
  - `Standalone devices only`
  - `Devices inside a container asset` — building / floor / fleet / site / vehicle
  - `Skip — you decide`
- **Customers & users** (`AskUserQuestion`, `header: "Customers"`) — load-bearing; always ask when the request doesn't make it obvious:
  - `Tenant-only` — one installation I own / one organization managing everything
  - `Customer-hierarchy` — platform serving multiple independent customers / tenants / sites
  - `Skip — you decide`
- **Scale** (`AskUserQuestion`, `header: "Scale"`) — **ask only when `scale` is still unset** after the pre-scan in Step 1a. How many entities should the demo include?
  - `Small working prototype` — 1–5 entities per profile, all features wired, enough to demonstrate the pattern end-to-end. *(recommended default)*
  - `Single instance per profile` — exactly one of each profile. For monitoring a specific physical thing.
  - `Production scale` — I'll specify counts (follow up with a plain-text question asking for per-profile counts).
  - `Skip — you decide` — defaults to small working prototype.

  Maps to: `Small working prototype` → `scale=prototype`; `Single instance per profile` → `scale=single-target`; `Production scale` → `scale=production-scale` (ask counts as plain text, capture them into conversation context so the architecture skill can put them in the `## User Requirements` and `## Demo Entities` sections).
- **Alarms & metrics** (`AskUserQuestion`, `header: "Alarms & metrics"`) — any specific derived values or thresholds to track?
  - `Yes — I'll describe` (the user then replies in chat with the details)
  - `No / propose sensible defaults`
  - `Skip — you decide`

Telemetry and attributes are usually obvious from the entities themselves — ask only if genuinely unclear.

Rules:
- Infer what you can from the domain; skip obvious questions.
- The Scale question is asked only when the Step 1a pre-scan didn't set `scale` from an explicit count in the original request. If the user picks `Production scale`, follow up in plain text to gather per-profile counts; the architecture skill records these in `## User Requirements` and `## Demo Entities` of `architecture-overview.md`.
- Emit `[paused] waiting: your answers on <short topic>` before each question batch.
- **Skip triggers** — any of `skip`, `skip interview`, `you decide`, `doesn't matter`, `I don't know`, plus the run-wide autonomous triggers from **Pipeline Config → Mode variable**. Any of these ends the interview immediately: switch to `mode=autonomous` for the rest of the run and infer every remaining decision.
