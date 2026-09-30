---
name: commit-step
description: "Refresh solutions/<slug>/README.md and create a git commit after a generation step. Required system step for every solution-generation flow — invoke after each logical step (entities, calculated fields/alarms, dashboards, extension build, revisions) so documentation stays in sync with files and history stays clean. Sub-skill: not user-invocable; orchestrators call it."
user-invocable: false
---

# Commit Step

Captures the current state of a solution after a generation step. Refreshes `solutions/<slug>/README.md` from the files on disk, then stages and commits `solutions/<slug>/`. This is the canonical finalization for **every** generation flow — orchestrators that skip it leave the README stale and the history coarse.

## When to call this

Invoke from any solution-generation orchestrator after each logical step has finished writing files:

- After the solution design is approved (Step 2 in `create-solution`) — design files only, no validation precedes it
- After entities + attributes + emulators + CFs + alarms are saved (Step 3 in `create-solution`)
- After an extension is built (Step 3.5 in `create-solution`)
- After dashboards are saved (Step 5 in `create-solution`)
- After any revision that touches saved files

Run **after** `tb validate <slug>` (when the orchestrator validates) — a broken solution should not be committed. Run **before** the push notice — the commit is part of "the step is done".

## Inputs

- `solution` — solution slug (e.g. `temperature-sensors`)
- `step` — short descriptor of what just completed, used verbatim as the commit subject (e.g. `Add device profile and 3 temperature sensors`, `Add calculated fields and alarm rules`, `Add dashboards`, `Build extension`, `Revise: replace CoffeeMachine profile`)

## Step 1 — Refresh `solutions/<slug>/README.md`

Rebuild the README from the current files on disk. Overwrite it entirely on each invocation — do not attempt to merge with prior content. Sources:

- `solutions/<slug>/**/*.json` — saved entity files (device profiles, devices, customers, users, dashboards, …)
- Each entity file's embedded `relations`, `attributes`, `calculatedFields`, and alarm rules
- `solutions/<slug>/design/architecture-overview.md` if present — for the introductory description

The README must contain:

### 1. One-paragraph overview

Pulled from `architecture-overview.md` when available, otherwise a one-line statement of what the solution is.

### 2. Entity hierarchy

Indented tree showing parent-child relationships derived from each entity's `relations` array (containment types: `Contains`, `[Parent]Has[Child]`) and from `deviceProfileId` / `assetProfileId` assignments. Entities with no incoming containment relation go under a flat `Standalone` section.

```
Customer: Acme Corp
  Asset: Factory Floor
    Device: Temperature Sensor 01 [profile: Temperature Sensor Profile]
    Device: Temperature Sensor 02 [profile: Temperature Sensor Profile]
```

### 3. Entity table

A markdown table listing every entity:

```markdown
| Type | Name | Profile | Notes |
|------|------|---------|-------|
| Device Profile | Temperature Sensor Profile | — | DEFAULT transport |
| Device | Temperature Sensor 01 | Temperature Sensor Profile | attrs: location, firmware; CF: average_temp |
```

The Notes column records: attributes (`attrs: …`), calculated field names (`CF: …`), alarm rule names (`alarm: …`), transport type for device profiles, `assignedTo` role for dashboards, and any other notable config.

Use the `Write` tool to overwrite `solutions/<slug>/README.md`.

## Step 2 — Stage and commit

```bash
git add solutions/<slug>/
```

Check whether anything is actually staged. If the step was a no-op (nothing new on disk), there's nothing to commit — print one line and return:

```bash
if git diff --cached --quiet -- solutions/<slug>/; then
  echo "commit-step: no changes to commit for <slug>"
  exit 0
fi
```

Otherwise commit with the `step` input verbatim as the subject — no body, no footers:

```bash
git commit -m "<step>"
```

If the commit fails (pre-commit hook, etc.), surface the error verbatim and stop. Do not retry, do not amend, do not `--no-verify`.

## What this skill does NOT do

- Does **not** push.
- Does **not** run `tb validate` — the orchestrator owns validation and must run it before invoking this skill.
- Does **not** commit anything outside `solutions/<slug>/`.
- Does **not** touch task files selectively — `git add solutions/<slug>/` already includes `tasks/reprocessing/`, emulator task files, and `design/`.
- Does **not** open a PR or push to a remote — that's the user's call.
