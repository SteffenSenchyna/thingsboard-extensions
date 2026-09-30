---
name: update-solution
description: "Modify an existing ThingsBoard solution via CLI — add a calculated field, alarm rule, dashboard widget, device/asset type, role/user, or change a threshold. Use when the user asks to add to / extend / change / modify an existing solution, or any request that touches entities already present locally or on the instance. Locates the target (local, then instance), refreshes only with consent, and applies the change surgically without regenerating untouched artifacts. Do NOT use to build a brand-new solution (use create-solution), to finish an interrupted build (use create-solution's resume), or for a targeted standalone ask — one or a few artifacts on known targets, no design implied — where the routing gate chose the standalone path (use the matching standalone-* skill)."
user-invocable: true
---

# Update ThingsBoard IoT Solution

Thin orchestrator for modifying an existing IoT solution. All design and all `tb` calls go through dedicated sub-skills. The run has three phases:

- **Phase 1 — Locate & decide.** The entry point: is the solution local, on the instance, or nowhere? Yields one situation.
- **Phase 2 — Resolve to a baseline.** Per situation, end at *a local solution with a clean `baseline_ref`* — refreshing or importing only with explicit consent.
- **Phase 3 — Apply the change.** Identical for every surviving path: classify → plan → generate only what changed → validate → commit.

## Setup

Run once, before Phase 1.

- `tb config mode local` (idempotent) — all solution work is local-mode only.
- `Read` `@/Users/steffensenchyna/.thingsboard/resources/prompts/solutions/solution-ba/resources/solution-capabilities.md` — platform-wide IoT capabilities that stay in conversation for the whole run: indoor/outdoor positioning rules, customer-hierarchy guidance, metric-type overview, alarm-pattern overview, solution-description structure. Phase 3 leans on it everywhere — classifying the ask (3.1), folding changes into the design (3.3), and judging dashboard impact (3.6) all need to know what the platform can express.

### Mode variable

Carry a single `mode ∈ {interactive, autonomous}` through the whole run, decided once here and reused at every gate (refresh consent, plan approval, reprocess, dashboard impact). In autonomous mode all gates collapse to logged `[auto]` decisions with the defaults named at each gate.

**Autonomous triggers in the original request** set `mode=autonomous`: `auto`, `autonomous`, `no interview`, `just build it`, `just do it`, `yolo`, `no approval`, `skip questions`.

**Mid-run switch.** If the user later says `just continue`, `stop asking`, `skip approvals`, or `yolo`, flip `mode` to `autonomous` for the rest of the run — acknowledge in one line, resume from the current step.

### Slug derivation

Derive `<slug>` from the solution the user named. If the request does not name a solution explicitly, scan `solutions/*/` for the most-recently-updated directory whose name/domain overlaps the request and ask the user to confirm. If `solutions/` is absent or empty, there are no local solutions — skip the scan; Phase 1 detection will resolve to NOT_LOCAL.

### Question UI

Any question with a fixed set of options MUST be asked via the `AskUserQuestion` tool so the user gets clickable buttons. Do **not** print `(1) … (2) …` or `(a) … (b) … (c) …` choices as plain text. Open-ended questions with no preset options stay as plain text since `AskUserQuestion` requires at least 2 options. The "Other" option that `AskUserQuestion` adds automatically lets users type custom feedback.

### Task tracking

Create tasks with `TaskCreate` once at the start of the run (after `<slug>` is confirmed), covering the steps that will actually run. Mark each task `in_progress` on entry and `completed` on exit — this rule applies everywhere and is not repeated per step.

| Task subject | Covers |
|---|---|
| `Locate and refresh solution` | Phase 1 + Phase 2 — locate, optional refresh/import, baseline |
| `Plan update` | Phase 3.1–3.2 — classify the ask, present the plan, approval gate |
| `Apply changes` | Phase 3.3–3.6 — design revise, generators, reprocess/emulator, dashboard impact |
| `Validate and commit` | Phase 3.7 — `tb validate`, `commit-step`, push notice |

## Phase 1 — Locate & decide

The entry point. Determine which of three situations (local, instance-only, nothing) this run is in, then resolve it in Phase 2. **Every pull is consent-gated — never pull or refresh without an explicit "yes".**

### Local detection

```bash
# cwd is project root by contract; <slug> derived from the user's named target.
# No solutions/ dir (fresh `tb init`, no solution yet) → definitively no local solution.
if [ ! -d solutions ]; then
  echo "NOT_LOCAL"
else
  workdir="$(realpath "solutions/<slug>" 2>/dev/null)"
  if [ -d "$workdir" ]; then echo "LOCAL"; else echo "NOT_LOCAL"; fi
fi
```

### Decision tree

```
Is the solution present locally (solutions/<slug>/)?
│
├─ LOCAL → references/local-path.md (refresh gate → half-built guard → baseline) → Convergence
│
└─ NOT_LOCAL → references/instance-import.md → `instance-only` (import + reverse-engineer → Convergence)
                                             or `nothing` (offer create-solution → ends run)
```

## Phase 2 — Resolve to a baseline

Each situation ends at a local solution + a clean `baseline_ref` for Phase 3 to diff against. Resolve only the section Phase 1 selected.

Phase 2 is a router — follow the one reference for the branch Phase 1 selected; each resolves to a local solution + clean `baseline_ref` and returns here, to **Convergence**.

### LOCAL branch

The solution is already local. `Read` `references/local-path.md` and follow it — the consent-first refresh gate (§2a, refresh only on an explicit "yes"), the half-built guard (§2b, resume via `create-solution` if `design/` exists but no entities), and the baseline.

### NOT_LOCAL branch

The solution isn't local. `Read` `references/instance-import.md` and follow it — it discovers the solution on the instance (consent-gated via `pull-solution`) and then either imports + reverse-engineers a design (`instance-only` → committed `baseline_ref` + approved design gate) or offers `create-solution` when nothing matches. On the `instance-only` success path it returns here, to **Convergence**; the nothing-found/declined path ends the run.

### Convergence

Every surviving path now has a local solution + clean `baseline_ref`. Proceed to Phase 3.

**Instance-only guard:** Phase 3 must not begin until the instance-import path (`references/instance-import.md` §2c) has (1) committed the reverse-engineered design (`baseline_ref` = that commit, not the raw fetch) and (2) had its design gate approved. 3.3 revises the design the import produced; it never extracts it.

## Phase 3 — Apply the change

Identical for every situation that reached Convergence.

### 3.1 Classify the ask (operation→action map)

The deterministic core. Each parsed operation maps to fixed actions:

| Operation | Design stage revised | Generator(s) | Reprocess | Dashboard impact |
|---|---|---|---|---|
| Add calculated field | `metrics` | `generate-calculated-fields` | Yes* | Maybe (new output key) |
| Add alarm rule | `alarms` | `generate-alarms` | No | None (dashboards render alarms already) |
| Add attribute / telemetry key | `entity-profiles` | `generate-attributes` (+`generate-emulators` for tel keys) | If a CF reads the key | Maybe |
| Add new device/asset **type** | `entity-profiles` (+`relations`/`iam` if needed) | `generate-entities`, `generate-emulators`, `generate-attributes` | If profile has CFs | High |
| Add device/asset **instance** | `entity-profiles` Demo Entities | `generate-entities`, `generate-emulators` | — | Low/None |
| Add widget to dashboard | `dashboards` (`regen-targets`) | Phase 3.6 update-in-place | — | direct surgical edit |
| Add role / user | `iam` | `generate-entities` | — | High |
| Change CF expr / alarm threshold | `metrics` / `alarms` | regenerate that one artifact | Re-reprocess the CF | — |
| **Any other** | nearest stage; **ask once if genuinely ambiguous**, else sensible default | matching generator | per rules | per impact rule |

\* Skip reprocess for `ALARM`-type, `ATTRIBUTE`-output, or attribute-only-argument CFs (the exclusion rule from CLAUDE.md).

The map is extensible: an unrecognized operation maps to the nearest design stage + generator; if genuinely ambiguous, ask the user once. **Whenever a design choice is ambiguous and the user hasn't given an explicit signal, pick the sensible default silently and move on.**

**Extension changes are deferred for v1.** Adding/altering a backend extension on an existing solution cascades through the extension trigger-point table and dashboard widget-action wiring. For v1, recognize the request, state it's not yet a first-class update operation, and point the user at `create-solution`'s extension flow.

### 3.2 Present the plan (approval gate)

Render the plan as structured plain text first — do **not** cram it into the `AskUserQuestion` question string:

- **Operations parsed** — one line per operation (e.g. "Add calculated field `EfficiencyIndex` → attached to `TurbineProfile`").
- **What each changes and where** — which profile, dashboard, or design file is affected.
- **What is preserved** — "Everything else is preserved — existing IDs, untouched files, and dashboard views are left byte-for-byte."

`mode=interactive`:
- Emit `[paused] waiting: approval of planned change`
- `AskUserQuestion`: question `"Does this plan look right?"`, header `"Approve update"`, options `Approve and apply` · `Revise the plan`.
- On `Revise the plan` (or "Other"), re-classify per 3.1, re-render, re-ask, loop until approved.

`mode=autonomous` → print `[auto] update plan: <brief summary of operations>` and proceed.

### 3.3 Fold the change into the design

Apply the change on top of the frozen `baseline_ref` from Phase 2. Sum up what to add or change into an `additions` brief — drawn from the operations classified in 3.1 and the plan approved in 3.2, naming the concrete artifact(s) (e.g. "add calculated field `EfficiencyIndex` to `TurbineProfile`"). Then make one `Skill design-solution-architecture` call with `revise=true, additions=<brief>`. It edits the single `architecture-overview.md` in place — adding/adjusting the affected profile / key / metric / alarm / role / relation / Demo Entities row and any dependent edits — while preserving untouched content. Never rewrites the overview from scratch. To find what this run changed, diff the working tree against `baseline_ref` (`git diff <baseline_ref> -- <workdir>/design/architecture-overview.md`).

Pass `from-existing=true` **only** when this run pulled or refreshed (`pulled_this_run=true`) or the solution was originally an instance-import. Omit it for locally-built solutions that were never pulled.

Dashboards are handled separately via `Skill design-dashboards` in 3.6 — the `design-solution-architecture` revise never touches `dashboards.json`.

### 3.4 Run only the affected generators

**Always use the `generate-*` skills — never hand-create entities with raw `tb` CLI commands.** Calling `tb device-profile save`, `tb device save`, `tb asset save`, etc. directly bypasses the existing-aware planner, risks re-minting UUIDs, and can duplicate entities. Every entity materialization MUST go through the appropriate `generate-*` skill.

Dispatching `generate-entities` on a solution that already has entities is safe: the `entities-planner` scans every entity file on disk under `<workdir>/`, matches by name → id, and slices in **only** net-new entities — existing entities are reused by their UUIDs and never re-emitted. So adding a new device TYPE just means folding the new profile subsection and its new Demo Entities row into `design/architecture-overview.md` (3.3), then dispatching `generate-entities` normally.

Dispatch only the generators named in the 3.1 row. Call convention: `solution=<slug>, workdir=<workdir>` for most; `reprocess-calculated-fields` takes `solution=<slug>, mode=local`.

**Changed (not added) artifacts need the `changed` input.** The `generate-calculated-fields` and `generate-alarms` skills are existing-aware: they skip any CF/alarm already saved on disk (matched by name). For a "Change CF expr / alarm threshold" operation the edited artifact already exists, so a plain dispatch would skip it. Pass `changed=[<names>]` — the artifact names from the 3.1 classification / 3.3 design diff — so the skill re-saves those entries over the existing ones instead of filtering them out.

Wait for all dispatched generators to finish. If any errors, stop and report.

### 3.5–3.6 Post-generation decisions

After the generators return, `Read` `references/post-generation-decisions.md` and follow it — it builds the change set (diff of `architecture-overview.md` vs `baseline_ref`), runs the reprocess/emulator questions (3.5), and applies the dashboard impact (3.6, incl. the high-impact choice and update-in-place dispatch). Then continue to 3.7.

### 3.7 Validate, checkpoint, notify

Run `tb validate <slug>`. On validation error, surface the output verbatim and stop — do **not** proceed to checkpoint or push notice.

On success, invoke `Skill commit-step` with `solution=<slug>` and `step="Update: <short summary>"` (refresh the README from disk and create a checkpoint commit). If it reports `no changes to commit`, that's fine — proceed. If it errors, surface verbatim and stop.

Then print one line telling the user how to deploy. Include the `--run-tasks` sentence **only** when at least one reprocess or emulator task file was written in 3.5; otherwise omit it.

````
Updated <what>. To deploy, run `tb push <slug>`.

Help us make the CLI better — share quick feedback anytime with `tb feedback`.
````

(When task files were written in 3.5, append: `Add --run-tasks to also generate demo telemetry and backfill calculated fields.`)

Do NOT pause, do NOT wait for confirmation, do NOT run `tb push` yourself.

## Preservation guarantees

The anti-regeneration contracts for every run:

1. **Reuse, never reinvent IDs** — existing UUIDs, names, profile assignments are looked up, never re-minted.
2. **Never regenerate an unchanged artifact** — existing-aware generators materialize only net-new entities (matched by id against what's on disk), and the only entries treated as changed this run are those the overview diff against `baseline_ref` shows as net-new. Untouched files are left byte-for-byte.
3. **Dashboards edited in place by default** — `mode=update` + `existingDashboardPath` + `changedUseCases` delta; everything outside the delta preserved verbatim. An existing dashboard is rebuilt from scratch (`mode=create`) **only** when the user explicitly chooses "Fully regenerate the dashboard" at the High-impact gate.
4. **Design revise edits in place** — adjusts only the affected lines of `architecture-overview.md`, never rewrites it from scratch.
5. **Refresh only with consent** — per the Phase 1 decision tree and the Phase 2 consent gates.
