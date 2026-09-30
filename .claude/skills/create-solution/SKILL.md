---
name: create-solution
description: "Designs and generates a complete ThingsBoard IoT solution end-to-end from a plain-language request, via the tb CLI in local mode — device and asset profiles, entities, relations, customers/users/roles, calculated fields, alarms, demo telemetry, and role-based dashboards — pausing at review gates before it generates. Use when the user asks to create, build, generate, or scaffold a NEW IoT solution, system, platform, monitoring setup, demo, or use case (e.g. 'create a smart house solution', 'build a fleet tracking system', 'set up warehouse monitoring', 'generate an IoT demo for solar inverters'). Do NOT use for a single entity or a small targeted add/fix (use the standalone-* skills), or to change a solution that already exists (use update-solution)."
user-invocable: true
---

# Create ThingsBoard IoT Solution

Orchestrator for designing and generating a full IoT solution. All design and all `tb` calls go through sub-skills. The five top-level steps, the approval gates, and shared patterns are defined once in **Pipeline Config** below; each Step section references that block instead of redefining anything.

## Pipeline Config

Single source of truth for the orchestrator's policy. Every step references this block instead of redefining patterns inline.

### Generation steps

The catalog of top-level step subjects that may appear as `TaskCreate` items in Step 1. The actual set chosen for a run is decided by the rules in **Step 1 → Show the plan** — not every run uses every entry.

- **Kickoff** (exactly one per run):
  - `Consult user`
  - `Consult user (skipped — autonomous mode)`
- `Design solution architecture` — profiles, relations, customers, users, roles, CFs, alarms.
- **Generation task** — pick the smallest accurate subject covering what Step 3 will produce. Examples: `Create entities, calculated fields, alarms, and demo telemetry`, `Create calculated field(s)`, `Add alarm rule(s)`, `Add telemetry key(s) on existing profile(s)`, `Add device(s)`. Combinations: name the dominant artifact types, e.g. `Create calculated field(s) and alarm rule(s)`.
- `Build extension` (only when `extension-enabled = true`).
- `Design dashboards` (one per IAM role).
- `Create dashboards` (all in parallel).

Each task represents one discrete step the user is told about; sub-skills emit plain-text narration for their substeps. Mark each task `in_progress` when entering its step and `completed` when leaving — this rule applies everywhere and is not repeated per step.

### Approval gates

The orchestrator pauses for user input at **exactly three points**:

- **After Step 2** — the designed solution architecture (entity hierarchy + tables + CFs + alarms). Blocks until approved.
- **After Step 3** — entities/CFs/alarms have been generated. Defaults toward continuing; the user can choose to pause and inspect files.
- **After Step 4** — the designed dashboard use cases per role. Blocks until approved.

No other step pauses. For Steps 2 and 4, the sub-skill always designs silently and writes its file — Step 2 writes `architecture-overview.md`, Step 4 writes `dashboards.json`; neither has approval logic of its own. The orchestrator reads the file, renders a structured presentation (diagram or grouped sections — never a raw dump), and owns the gate. On revision, re-invoke the same sub-skill with `revise=true`, re-read the updated file, re-emit the `[paused]` marker, ask again, loop until approved.

**Sub-skill return → presentation → gate is one continuous turn.** When a design sub-skill prints its summary line (`design saved to …` / `dashboards design saved to …`), the same assistant turn continues straight through reading the file, rendering the presentation, and asking the gate's `AskUserQuestion`. The run waits for the user only at the three gates above and at 1b interview questions — every other transition flows automatically.

In `mode=autonomous`, skip the pause at all three gates: print a one-line `[auto]` summary (Steps 2 and 4) or simply continue (Step 3).

## Extension-enabled flag

Carry a second run-wide boolean `extension-enabled ∈ {true, false}` (default `false`). Like `mode`, it can flip at any step and is passed into downstream sub-skills.

**Explicit triggers** (no auto-detection — only these flip the flag to `true`):

- Literal words anywhere in user input: `extension`, `custom backend`, `Java`, `Spring`, `scheduled job`, `/api/extension`.
- Phrases: `add an extension`, `build me an extension`, `extend ThingsBoard`.
- The user invokes `/create-extension`.

If none of these appear, leave the flag `false` and never bring up extensions beyond the one inform-line in Step 1b. Heuristic signal-scanning is forbidden.

**When the flag is `true`** (set here, or flipped mid-run — acknowledge a mid-run flip in one line), `Read` `references/extensions.md` and follow it. It owns the mid-run routing table (what to re-run depending on which step the run already reached), the Build-extension step (3.5), and the Step 5 widget-JS wiring. When the flag stays `false`, ignore that file entirely.

### Mode variable
Carry a single `mode ∈ {interactive, autonomous}` through the whole run. Decided in Step 1a (asked before anything else) and reused at all three gates above.

**Autonomous triggers in the original request** skip Step 1a's mode question and set `mode=autonomous`: `auto`, `autonomous`, `no interview`, `just build it`, `just do it`, `yolo`, `no approval`, `skip questions`.

**Mid-run switch.** If the user later says `just continue`, `stop asking`, `skip approvals`, or `yolo`, flip `mode` to `autonomous` for the rest of the run — acknowledge in one line, resume from the current step.

### Scale variable

Carry a run-wide `scale ∈ {single-target, prototype, production-scale}` (default `prototype`) through the whole run. It controls how many entities of each profile the demo includes:

- `single-target` — exactly one of each profile. For requests targeting a single physical thing (e.g. "monitor my one solar inverter").
- `prototype` — 1–5 entities per profile, pattern-driven; pick the smallest count that lets dashboards, metrics, and relations actually demonstrate the pattern (a fleet-tracking demo may want the upper end for a usable map; a simple sensor solution may want one or two). **This is the default when the user doesn't specify and doesn't choose otherwise.**
- `production-scale` — counts the user explicitly states. The orchestrator carries the stated per-profile counts forward verbatim.

The variable is set once — in Step 1a from the original-request pre-scan (when counts are explicit), or in 1b via the Scale interview question (when they aren't). On skip or in `mode=autonomous` without a pre-scan match, `scale` falls through to `prototype`.

**Propagation via User Requirements.** Scale is a cross-cutting user requirement. The architecture skill records the resolved value as a bullet under `## User Requirements` in `architecture-overview.md` — phrased like other entries in that section (e.g. **Scale — small working prototype, 1–5 entities per profile (user stated via interview). Affects:** Demo Entities counts, emulator instance fan-out, dashboard density). The inline design pass and all downstream consumers (`entities-planner`, `generate-calculated-fields`, `generate-alarms`, `device-emulator-generator`, `attribute-values-generator`, `dashboard-generator`) read `## User Requirements` from the overview and treat it as overriding their built-in defaults — no new plumbing is needed.

### Decision-making rule

Whenever a design choice is ambiguous and the user hasn't given an explicit signal (or skipped the interview / switched to autonomous), **pick the sensible default silently and move on**. Do not list assumptions, do not flag judgment calls, do not pause to ask. The user sees every result at its gate and can correct any wrong default in one reply. Applies to every sub-skill — `design-solution-architecture`, `design-dashboards`.

### Question UI

Any question with a fixed set of options — the mode question, the three approval gates, and option-based interview questions — MUST be asked via the `AskUserQuestion` tool so the user gets clickable buttons. Do **not** print `(1) … (2) …` or `(a) … (b) … (c) …` choices as plain text. Open-ended questions with no preset options (e.g. "what's being monitored?") stay as plain text since `AskUserQuestion` requires at least 2 options. The "Other" option that `AskUserQuestion` adds automatically lets users type custom feedback.

### Finalization pattern (README + commit)

After every step that writes files to `solutions/<slug>/` — Step 2 (once the design is approved), Step 3, Step 3.5, Step 5, and any revision — invoke `Skill` `commit-step` with `solution=<slug>` and a short `step` descriptor used verbatim as the commit subject. This refreshes the README from disk and creates a checkpoint commit. For the generation steps (3, 3.5, 5) always run **after** `tb validate <slug>` passes (a broken solution must not be committed) and **before** the push notice (the commit is part of "the step is done"). Step 2 writes design files only — commit right after the approval gate, no validation needed. If the sub-skill reports `no changes to commit`, that's fine — proceed. If it errors, surface verbatim and stop.

### Push notice pattern

Applies to Steps 3 and 5. After generation completes, `tb validate <slug>` passes, and `commit-step` has captured the checkpoint, print one line telling the user how to deploy, then continue immediately to the next step. Do NOT pause, do NOT wait for confirmation, do NOT run `tb push` yourself.

````
Generated <what>. To deploy, run `tb push <slug>`. Add `--run-tasks` to also generate demo telemetry and backfill calculated fields.

Help us make the CLI better — share quick feedback anytime with `tb feedback`.
````

If `tb validate <slug>` reported errors, do **not** print the notice — surface the errors and stop.

## Step 1 — Consultation

### 1.0 Resume-to-continue (local only)

Run `pwd` before the 1a approval-mode question. **Only if** the path contains `solutions/<slug>`, or the user explicitly named an existing solution, a prior create run may be resumable — `Read` `references/resume-to-continue.md` and follow it (it detects how far the interrupted build got and continues at the right step, or routes to `update-solution`). Otherwise (a fresh build — the common case) skip straight to 1a.

### 1a. Approval mode (if not already forced autonomous)

**Ask this question first, alone in its own message, before doing anything else — including reading capability docs or creating tasks.** Do not batch it with interview questions, the plan, or other content — the mode answer determines what happens next.

Emit `[paused] waiting: approval mode`, then call `AskUserQuestion` (per **Pipeline Config → Question UI**):

- `question`: `"How do you want to approve the design?"`
- `header`: `"Approval mode"`
- `options`:
  - `Approve at each step` — `"I'll stop after the architecture design and after the dashboard design and wait for your approval before continuing."`
  - `Build everything now` — `"I'll show you each design result but won't stop. You can switch to this anytime by saying 'just continue' or 'stop asking'."`

Map: `Approve at each step` → `mode=interactive`; `Build everything now` → `mode=autonomous`. Default if ambiguous or skipped: **interactive**.

### Evaluate `extension-enabled` from the original request

Before 1a runs, scan the original user request for the explicit triggers listed in the **Extension-enabled flag** section above (literal words `extension`, `custom backend`, `Java`, `Spring`, `scheduled job`, `/api/extension`; phrases like `add an extension`, `build me an extension`, `extend ThingsBoard`; invocation of `/create-extension`). Set `extension-enabled = true` if any are present, else `false`. This single pass owns the initial value of the run-wide flag — do not heuristically re-scan later turns; rely on the user to say one of the trigger phrases to flip it. Acknowledge in one line **only** when the flag flipped to `true`, e.g.:

> Got it — extension wiring is on. I'll plan an extension surface as part of the design.

When the flag is already `true` here, downstream steps skip the extension inform-line entirely (1b) and route per `references/extensions.md`.

### Evaluate `scale` from the original request

Also before 1a runs, scan the original user request for explicit per-entity counts — phrases like `3 sensors`, `200 turbines`, `monitor 50 vehicles`, `10-machine demo`, `our fleet of 40 trucks`. If found, set `scale = production-scale` and remember the stated counts; they flow into the architecture phase via the `## User Requirements` section.

If no explicit count is present, leave `scale` unset. The interview (1b) will ask the user; on skip — or in `mode=autonomous` without a pre-scan match — `scale` falls through to `prototype`.

Do not heuristically re-scan later turns; rely on the user's interview answer (or a mid-run instruction) to change `scale`.

### Show the plan

Build the task list with `TaskCreate` ONCE after Step 1c (slug derivation). By then mode, scale, and extension-enabled are all locked in.

Compose the task list from the catalog in **Pipeline Config → Generation steps**, in order. Skip every entry that doesn't apply:

1. **Kickoff** — always exactly one. Pick the one that fits the run shape:
   - `Consult user` (interactive)
   - `Consult user (skipped — autonomous mode)` — marked `completed` immediately (autonomous)
2. **`Design solution architecture`** — always include for a fresh build.
3. **Generation task** — include only when at least one Step 3 generator will produce non-empty output. Pick the smallest accurate subject from the catalog:
   - Full breadth → `Create entities, calculated fields, alarms, and demo telemetry`.
   - Single category → e.g. `Create calculated field(s)`, `Add alarm rule(s)`, `Add telemetry/attribute key(s) on existing profile(s)`, `Add device(s)`.
   - Combinations → list the dominant artifact types, e.g. `Create calculated field(s) and alarm rule(s)`.
4. **`Build extension`** — only when `extension-enabled = true`.
5. **`Design dashboards`** and **`Create dashboards`** — include when the user did not say "no dashboards".

After choosing the set, dispatch all `TaskCreate` calls in a **single message** so the user sees the full roadmap at once. Then run the remaining steps, marking each task `in_progress` on entry and `completed` on exit (per the **Pipeline Config → Generation steps** rule).

In `mode = autonomous`, the same rules apply — the task list is honest about what will run; only the *pauses* are skipped.

### 1b. Domain interview

Before any question — **only when `extension-enabled == false`** — print this inform-line verbatim (it's an information line, not a prompt — do not wait for a reply):

> Heads up: if you need backend logic ThingsBoard can't express natively (e.g. role/user profiles with default dashboards, cross-customer aggregation, custom widget actions, custom validation on entity changes), say **add an extension** at any point and I'll wire one in.

Skip the inform-line entirely when `extension-enabled == true` — the user has already opted in, and the line would be redundant and confusing.

Otherwise print the line **once per run**. In autonomous mode (where 1b is otherwise skipped), still print this exact line once at the top of the run when `extension-enabled == false` — informational, no pause.

In `mode=autonomous`, skip 1b entirely — the original request is the only consultation input; the design pass infers the rest from the rulebook it reads.

In `mode=interactive`, run the domain interview — `Read` `references/interview.md` and follow it (targeted questions ≤3 per message via `AskUserQuestion`, a Skip option on every batch, Scale asked only when still unset; any skip trigger ends the interview early and flips the run to autonomous).

### 1c. Consolidate

Derive a kebab-case `slug` by slugifying the solution domain (e.g. `coffee-machine-monitoring`). The user can always override the auto-derived slug by passing `--solution <name>` in their original request.

Create the solution directory now, before any design phase begins. Run cwd MUST be the project root for the entire skill and every sub-skill it dispatches — never `cd` into the solution dir; `tb` commands target it via `--solution <slug>`.

```bash
tb config mode local
tb solution new <slug>
workdir="$(realpath solutions/<slug>)"
mkdir -p "$workdir/design"
```

`workdir` is the absolute path to the solution dir, passed verbatim as input to Step 2 and every subsequent phase. Sub-skills must use it verbatim — do not re-derive from `slug` or cwd.

The design phases write artifacts under `<workdir>/design/`: Step 2 emits a single `architecture-overview.md` (the only design artifact), plus `extension-design.json` when extensions are enabled; Step 4 emits `dashboards.json`. The `design/` subdirectory is ignored by `tb push`.

## Step 2 — Solution design

Invoke `Skill` `design-solution-architecture` with args: `slug`, `workdir`, `mode=autonomous`, `extension-enabled=<true|false>`. The skill designs the solution **inline in one pass** and writes a single `<workdir>/design/architecture-overview.md` — the only design artifact — plus `<workdir>/design/extension-design.json` when extensions are enabled. When extensions are enabled, the extension's custom roles are folded into the overview's User Groups and Roles table.

### Present the solution design

Read `<workdir>/design/architecture-overview.md` (the single source). When `extension-enabled=true`, also read `<workdir>/design/extension-design.json`.

1. **Entity hierarchy (indented tree)** — render a plain-text indented tree inside a fenced code block. Customer groups are outer containers; their owned user groups and entity profiles nest inside. Asset-to-asset and asset-to-device containment relations nest further. Non-containment relations render as inline arrows under the source entry.

    Rules:
    - **Root.** `Tenant` is always the root.
    - **Tenant-level children:** tenant-admin user groups (every `### User Groups and Roles` row with `Permissions = CRUD` and `Scope = Tenant`), then customer groups if the `### Customer Groups` table has real rows; otherwise the top-level entity profiles (those that never appear as `child` in a containment relation in the `## Relations` prose).
    - **Inside each customer group block:** customer-scope user groups, then the entity profiles the customer owns. Nest containment relations (`Contains`, `[Parent]Has[Child]`) from `## Relations` as further children.
    - **Multi-customer replication.** When multiple customer groups exist, repeat the inner subtree under each one — that's intentional, not a duplication bug.
    - **Non-containment relations.** Render under the source entry indented one level with `↓ <type>` pointing at the target profile.
    - **Box-drawing.** Use `├─`, `└─`, `│` for tree edges; `↓` for relation arrows.
    - **Profile annotations.** Mark entity profiles with `(DEVICE)` / `(ASSET)`; mark user groups with their permission level (`CRUD` / `RU` / `R`) from the User Groups and Roles table.

    Example (multi-customer, one device profile per customer):

    ````
    Tenant
    ├─ User: CoffeeMachineAdministrator (CRUD)
    │
    ├─ Customer Group: CafeOwner
    │  ├─ User: CoffeeMachineOperator (RU)
    │  │   ↓ Operates
    │  └─ Device Profile: CoffeeMachine (DEVICE)
    │
    └─ Customer Group: ChainHQ
       ├─ User: ChainSupervisor (R)
       └─ Device Profile: CoffeeMachine (DEVICE)
    ````

2. **Profiles** — list each `### <Profile>` subsection with its `Telemetry:` and `Attributes:` keys.
3. **Customers and users** — read from the `### Customer Groups` and `### User Groups and Roles` tables. `customerMode` is derived: `customer-hierarchy` if the Customer Groups table has real rows, else `tenant-only`.
4. **Roles** — list each `### User Groups and Roles` row as a role: `Name`, `Scope` (its user group), `Permissions`, `Description`.
5. **Calculated fields** — from the `## Metrics` bullets, grouped by owning profile. For each: name, type, inputs, output, calculation summary.
6. **Alarms** — from the `## Alarms` bullets, grouped by owning profile. For each: severity entries and clear condition.
7. **(when `extension-enabled=true`) Extension surface** — conditional sub-section. Omit entirely when `extension-enabled=false` and renumber Warnings to 7. Read `<workdir>/design/extension-design.json`. Render three sub-sections:
    - **Endpoints** — list each entry as `<METHOD> <path> [<auth>] — <purpose>`.
    - **Scheduled tasks** — list each `scheduledTasks` entry; skip the sub-section when the array is empty.
    - **Custom roles** — list `entityDependencies.customRoles`. These names should also appear in the Roles block (4) — flag any mismatch as a warning.
8. **Warnings** — if the overview flags any caveats (e.g. a note under a profile that live keys couldn't be recovered, or a clamped cadence), list each.

### Approval gate

Defined in **Pipeline Config → Approval gates** (blocks until approved).

If `mode=interactive`:
- Emit `[paused] waiting: approval of solution design`
- Call `AskUserQuestion` (per **Pipeline Config → Question UI**):
  - `question`: `"Please check the design summary above and the full files saved under <workdir>/design/. Does the design look right — profiles, relations, customers, users, roles, calculated fields, alarms<EXT>? Anything to add, remove, or change before I start generating?"** Replace `<EXT>` with `, extension surface` when `extension-enabled=true`, else with the empty string."`
  - `header`: `"Design approval"`
  - `options`:
    - `Approve and continue` — `"Start generating entities, calculated fields, and alarms."`
    - `Revise` — `"I want to change something — I'll describe what."`
- On `Revise` (or "Other" custom feedback), see **Revisions** at the bottom.

If `mode=autonomous`:
- Print `[auto] solution design: <P> profiles, <R> relations, <ROLE> roles, <CF> calculated fields, <AL> alarms` and proceed.

Where the counts are read from the overview: `<P>` = number of `### <Profile> (DEVICE|ASSET)` subsections, `<R>` = number of parent–child links in `## Relations`, `<ROLE>` = rows in `### User Groups and Roles`, `<CF>` = bullets under `## Metrics`, `<AL>` = bullets under `## Alarms`.

### Checkpoint

Once the design is approved (or the `[auto]` summary printed in autonomous mode), invoke `Skill` `commit-step` with `solution=<slug>, step="Design solution architecture"` (per **Pipeline Config → Finalization pattern**) so the approved design files under `<workdir>/design/` are committed before generation begins. No `tb validate` here — only design files exist at this point. Then advance to Step 3.

## Step 3 — Generate entities, CFs, and alarms

### Sub-skill calls

Each sub-skill orchestrates its own parallelism internally and reads its inputs from `<workdir>/design/`. Briefs are minimal — `solution=<slug>, workdir=<workdir>` for most; `reprocess-calculated-fields` takes `solution=<slug>, mode=local` (no `workdir`).

1. `Skill` `generate-entities` with `solution=<slug>, workdir=$workdir` — materializes profiles, devices, assets, customers, users, roles, entity groups, and structural relations. Wait for it to return before the parallel batch.

2. **In parallel** (single assistant message), dispatch whichever apply. Skip any whose precondition is unmet; if all four are unmet, skip the batch entirely.
   - `Skill` `generate-attributes` with `solution=<slug>, workdir=$workdir` — only when at least one profile in the overview has an `Attributes:` key.
   - `Skill` `generate-emulators` with `solution=<slug>, workdir=$workdir` — only when the overview has at least one `(DEVICE)` profile with non-empty `Telemetry:`.
   - `Skill` `generate-calculated-fields` with `solution=<slug>, workdir=$workdir` — only when the overview's `## Metrics` section has at least one bullet.
   - `Skill` `generate-alarms` with `solution=<slug>, workdir=$workdir` — only when the overview's `## Alarms` section has at least one bullet.
3. If step 2's `generate-calculated-fields` ran, `Skill` `reprocess-calculated-fields` with `solution=<slug>, mode=local`. **Local mode only** — writes task files; no server call. Must run **after** step 2 has fully completed because `cf-reprocess-generator` scans saved CF files under `solutions/<slug>/**`.

If any sub-skill errors, stop and report. Wait for all dispatches in step 2 to finish before deciding whether to run step 3.

### Validate, checkpoint, notify

Run `tb validate <slug>`. On error, surface the output verbatim and stop. On success, invoke `Skill` `commit-step` with `solution=<slug>, step="Add entities, calculated fields, and alarms"` (per **Pipeline Config → Finalization pattern**), then print the push notice from **Pipeline Config → Push notice pattern**.

### Approval gate

Defined in **Pipeline Config → Approval gates** (defaults toward continuing).

If `mode=interactive`:
- Emit `[paused] waiting: continue to dashboard design`
- Call `AskUserQuestion` (per **Pipeline Config → Question UI**):
  - `question`: `"Entities, calculated fields, and alarms have been generated and saved under <workdir>/. Continue to dashboard design?"`
  - `header`: `"Continue?"`
  - `options`:
    - `Continue to dashboards` — `"Looks good — go ahead with the dashboard design."`
    - `Pause to inspect files` — `"Wait — I want to check the generated files first."`
- On `Continue to dashboards`, advance to Step 4.
- On `Pause to inspect files` (or custom feedback requesting changes), see **Revisions** at the bottom.

If `mode=autonomous`:
- Do not pause. Advance to Step 3.5 (when extensions are enabled) or Step 4.

## Step 3.5 — Build extension (only when `extension-enabled=true`)

If `extension-enabled` is `false`, skip this step entirely and advance to Step 4. Otherwise follow the **Step 3.5 — Build extension** section of `references/extensions.md` (invoke `create-extension`, checkpoint, push notice), then advance to Step 4.

## Step 4 — Design dashboards

Invoke `Skill` `design-dashboards` with `workdir` + `extension-enabled=<true|false>`. It reads `<workdir>/design/architecture-overview.md` (plus `<workdir>/design/extension-design.json` and `<project_root>/extension/README.md` when `extension-enabled=true`) and writes `<workdir>/design/dashboards.json` — no JSON dump in conversation. (Empty `dashboards` array if the original request said `no dashboards` or equivalent — the final dashboard-creation step becomes a no-op in that case.) When `extension-enabled=true`, dashboards may carry an optional `widgetActions` array wiring buttons to extension endpoints.

### Present dashboards

Read `<workdir>/design/dashboards.json` and render, for each dashboard: `name`, `assignedTo`, `overview`, and use cases grouped by category (Entity Overview, Entity Management, Monitoring & Statistics, Alarm Handling, Navigation). Do **not** print raw JSON — point the user to the file path.

### Approval gate

Defined in **Pipeline Config → Approval gates** (blocks until approved).

If `mode=interactive`:
- Emit `[paused] waiting: approval of dashboard use cases`
- Call `AskUserQuestion` (per **Pipeline Config → Question UI**):
  - `question`: `"Please check the summary above and the full design saved to <workdir>/design/dashboards.json. Do these use cases cover what each role needs?"`
  - `header`: `"Dashboard approval"`
  - `options`:
    - `Approve and create dashboards` — `"Looks good — go ahead and build the dashboards."`
    - `Revise` — `"I want to change something — I'll describe what."`
- On `Revise` (or custom feedback), see **Revisions** at the bottom.

If `mode=autonomous`:
- Print `[auto] dashboards: <name1>, <name2>, ...` and proceed.

## Step 5 — Create dashboards

Read `<workdir>/design/dashboards.json`. If its `dashboards` array is empty, this step is a no-op — proceed to wrap-up.

Every dashboard in a greenfield run is new — all dispatches use `mode=create` (the default).

### Extension-aware widget JS (only when `widgetActions` is non-empty)

When any dashboard's `dashboards.json` entry has a non-empty `widgetActions` array, first resolve the extension edition + widget-JS snippet per the **Step 5 — Extension-aware widget JS** section of `references/extensions.md`, and pass the resulting `extensionEdition` + `widgetJsSnippetPath` in that dashboard's brief below.

When `widgetActions` is empty for a dashboard, pass `extensionEdition=""` and no `widgetJsSnippetPath` in that dashboard's brief.

Also read `<workdir>/design/architecture-overview.md` to build the per-dashboard briefs — everything the briefs need is in the overview:
- **role object** for each dashboard's `assignedTo` — the matching `### User Groups and Roles` row → `{name, userGroup: <Scope>, permissions: <Permissions>}`.
- **entityRelations** — parse the `## Relations` prose into `{parent, child, type, cardinality}` rows.
- **entityProfiles** — one per `### <Profile>` subsection, projecting `{name, entityType, timeSeriesKeys: <Telemetry: keys>, attributeKeys: <Attributes: keys>}` (include derived keys).

Dispatch one `Agent` with `subagent_type=dashboard-generator` per dashboard, **all in a single message** so they run in parallel. For each dashboard, build the brief from its entry in `dashboards.json`:

- `solution` — the run-wide `<slug>`
- `dashboardName` — `dashboards[i].name`
- `overview` — `dashboards[i].overview`
- `useCases` — flatten `dashboards[i].useCases` (the five-category object) into a single string array
- `dashboardRole` — the `### User Groups and Roles` row (as a role `{name, userGroup, permissions}`) whose name matches `dashboards[i].assignedTo`
- `entityRelations` — the `## Relations` prose parsed into `{parent, child, type, cardinality}` rows
- `entityProfiles` — projected list described above
- `demoRequirements` — optional; pass through any relevant counts/requirements if present in `architecture-overview.md`'s Demo Entities table
- `userRequirements` — `dashboards[i].userRequirements` when present in `dashboards.json`; omit the field otherwise
- `extensionEdition` — the edition resolved above (`PE` / `PaaS`), or `""` when `widgetActions` is empty.
- `widgetJsSnippetPath` — the snippet path resolved above, or omitted when `widgetActions` is empty.
- `widgetActions` — `dashboards[i].widgetActions` when non-empty; omit otherwise.

Wait for all to finish; if any error, surface them together before continuing.

Run `tb validate <slug>`. On error, surface the output verbatim and stop. On success, invoke `Skill` `commit-step` with `solution=<slug>, step="Add dashboards"` (per **Pipeline Config → Finalization pattern**), then print the push notice from **Pipeline Config → Push notice pattern**.

## Wrap-up

`tb validate <slug>` already ran before each push notice — no final validation needed. The wrap-up covers the same ground as the manual "Report what was created" guidance in `CLAUDE.md` (entity counts, where files live, validation status), minus the push reminder which the per-step push notices already delivered.

Print one concise summary containing:

- **Counts of what was created**, grouped by type: device profiles, asset profiles, devices, assets, customers, users, roles, calculated fields, alarms, dashboards (omit zero-count types).
- **Solution directory path** (`<workdir>`) so the user knows where to inspect the files.
- **Validation status** — "Validation passed" (since the run could only reach wrap-up if every per-step `tb validate <slug>` passed) plus any warnings surfaced earlier in the run.
- **Extension surface** (only when `extension-enabled=true`): one line noting the extension lives at `<project_root>/extension/` and is built with `tb extension build` / run with `tb extension run`.

Use a single short narrative paragraph rather than bullets. Template:

````
Created <slug> solution: <N> device profile(s), <N> device(s), <N> dashboard(s)<… other non-zero types>. Validation passed. Review files in <workdir>.
````

Do **not** remind the user to run `tb push` — the per-step push notices (Step 3, Step 5) already delivered that. Repeating it here is noise. The exception is when the run ended early due to an error, in which case there is no wrap-up at all.

## Revisions

When the user picks `Revise` at any gate, asks to change something after a step's task is `completed`, or opts into an extension after Step 5 — `Read` `references/revisions.md` and follow it. It covers the revise loop per step (re-invoke the sub-skill with `revise=true`, re-present, re-approve), downstream-invalidation handling, re-push notices, checkpoint commits, and the late-extension-opt-in sequence.
