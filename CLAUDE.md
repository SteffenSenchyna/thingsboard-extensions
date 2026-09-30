# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This repo wears **two hats**, and almost every request belongs to exactly one of
them:

| Hat | What it is | Where the rules live |
| --- | --- | --- |
| **A — Extension library** | The Angular library in `src/` that compiles to a ThingsBoard JS_MODULE extension (custom widgets, dashboards, shared components, SCSS). Work is TypeScript/HTML/SCSS edits, `yarn` builds, `yarn lint`. | [Part A](#part-a--angular-extension-library) |
| **B — ThingsBoard entities via `tb`** | ThingsBoard *content* — devices, assets, profiles, customers/users/roles, calculated fields, alarm rules, dashboards, emulators — authored as local JSON through the `thingsboard-cli` (`tb`) and deployed with `tb push`. | [Part B](#part-b--thingsboard-entities-via-the-tb-cli) |

**Pick the hat first.** Signals:

- "widget", "component", "SCSS", "dashboard state component", a path under
  `src/app/...`, `yarn build`, "tb-data-table", "dark mode tokens" → **Part A**.
- "device", "asset", "profile", "calculated field", "alarm rule", "customer",
  "user", "role", "emulator", "solution", "pull/fetch from my instance",
  "dashboard JSON", `tb …` → **Part B**, and route through its skills instead of
  hand-writing JSON.

A ThingsBoard *dashboard* can mean either: a dashboard **JSON** with stock or
`htmlContainer` widgets is Part B; an Angular dashboard component in
`src/app/<domain>/states/...` is Part A. If the request could be read either
way, ask which one before generating anything.

The skill and agent catalog for Part B is indexed at the
[end of this file](#skill--agent-catalog).

---

# Part A — Angular extension library

## Project Overview

This is an Angular library that extends the [ThingsBoard](https://thingsboard.io) IoT platform with custom widgets and sensor configuration components. It compiles to a JavaScript extension module deployed into a running ThingsBoard instance.

## Commands

```bash
# Development server (compiles SCSS first, then serves on port 5000)
yarn start

# Development with Tailscale tunnel for remote access
yarn dev

# Build the library and move output to target/generated-resources/
yarn build

# Build, then upload to ThingsBoard via 1Password-authenticated Python script
yarn upload

# Compile SCSS through PostCSS pipeline only
yarn build:scss

# Lint
yarn lint
```

**Important:** The build requires `OP_SERVICE_ACCOUNT_TOKEN` in `.env` for the `upload` command (1Password service account for retrieving ThingsBoard credentials).

The build allocates 8GB of Node memory (`--max_old_space_size=8048`) — this is intentional for handling Angular's compilation of the large library.

## Architecture

### How This Integrates with ThingsBoard

ThingsBoard loads this library as a JS_MODULE EXTENSION resource. `yarn build` compiles to `dist/widget-extension-build/` (`src/ng-package.build.json`) and `install.js` moves the bundle to `target/generated-resources/`. ThingsBoard's UI then loads this module, which registers custom widget components.

The dev server (`yarn start` / `yarn dev`, usually left running) compiles to a **separate** folder, `dist/widget-extension/` (`src/ng-package.json`), and serves the bundle straight from disk there. Keep the two apart: a build that writes to or moves files out of `dist/widget-extension/` leaves the running dev server with nothing to serve. For quick checks, prefer the no-emit type check / lint over a full build.

### Path Aliases (tsconfig.json)

All ThingsBoard source imports resolve through path aliases pointing to `node_modules/thingsboard`:
- `@app/*`, `@core/*`, `@shared/*`, `@modules/*`, `@home/*` → ThingsBoard source
- `widget-extension*` → `dist/widget-extension/*`

This means you can import ThingsBoard internals directly — the build resolves them against the `thingsboard` npm package (pinned to GitHub release/4.2.0).

### Module Structure

**`ThingsboardExtensionWidgetsModule`** — root module, aggregates all sub-modules, registers i18n translations, and dynamically injects shared SCSS (namespaced as `tb-extension-css` to avoid ThingsBoard conflicts).

**`ExamplesModule`** — reference widget implementations demonstrating cards, tables, charts, and action widgets. These are working examples of how to wire up ThingsBoard widget lifecycle APIs.

**`SensorsModule`** — TS302 temperature sensor configuration widget. Standalone Angular component with reactive forms, three tabs (General, Calibration, Alarm), syncing against ThingsBoard device server attributes.

### Styling System

Tailwind is configured to avoid conflicting with ThingsBoard's own CSS classes:
1. `load-tb-classes.js` (PostCSS plugin) extracts all class names from ThingsBoard's `styles.css`
2. The extracted names become a Tailwind blocklist (`dist/tbClasses.json`)
3. PostCSS pipeline: `load-tb-classes.js` → `tailwindcss` → `autoprefixer`
4. Source: `src/app/scss/style.scss` → compiled to `src/app/scss/style.comp.scss`

Tailwind's `preflight`, `filter`, `transform`, `blur`, and `borderRadius` core plugins are disabled to prevent ThingsBoard style collisions. All custom styles scope under `.tb-default`.

### One look across every dashboard — no per-dashboard overrides

All dashboards (QC Lab, fuel management, water metering, new ones) must look
and behave the same, so a design change made for one propagates to all. Change
the **shared source**, never one dashboard:

- **Colours:** every dashboard root includes the shared tokens —
  `@include theme.tb-tts-light-tokens;` on `:host` and
  `@include theme.tb-tts-dark-tokens;` under its `.dark` class
  (`components/shared/styles/_theme.scss`), plus
  `:host ::ng-deep { @include theme.tb-themed-scrollbars; }`. Never redeclare
  `--c-*` tokens locally or hard-code a hex where a token exists.
- **Spacing / shape:** `card.$card-radius`, `card.$card-stack-gap` (gap between
  cards stacked in panels / sidebars), `form.*`, `button.*` (incl.
  `button.$link-hover-color`), `tooltip.*` from `components/shared/styles/`.
- **UI pieces:** use the shared components (`tb-data-table`, `tb-status-pill`,
  `tb-header-icon-button`, `tb-theme-toggle`, `tb-alarm-list`,
  `tb-entity-detail-panel`, `tb-segmented-control`, `tb-split-toggle`,
  `tb-filter-list`, `tb-check-filter` (a short checkbox group with a heading),
  `tb-filter-section` (divider + folding heading around any sidebar filter),
  `tb-ext-confirm-dialog`, `tb-timeframe-picker` (the
  "1D | 1W | 1M" picker for every chart and table), …) instead of re-building
  them in a dashboard.
- **Tables:** every `tb-data-table` shares one row style — rows at least 40px
  with 6px vertical cell padding (`$row-height` / `$cell-padding-y` in
  `data-table.component.scss`) and 13px text (`table.$table-text-size` in
  `styles/_table.scss` — custom cell templates use it too). There is
  deliberately no per-table row-height input; change the shared values instead.
- **Times:** 12-hour clock with AM/PM in the viewer's browser time zone —
  format with `components/shared/time-format.ts` (`formatClockTime`,
  `formatDateTime`, …; `TB_DATE_AT_TIME` for the Angular `date` pipe), never
  `HH:mm` or a hand-built `getHours()` string.
- **Confirmations:** use `tb-ext-confirm-dialog` (placed in the dashboard root),
  never `ctx.dialogs.confirm` — ThingsBoard's dialog opens in its own overlay
  outside the dashboard, so it ignores the dashboard's light/dark theme.
- Don't add dashboard-only size/colour/timing knobs (CSS variables or inputs a
  single dashboard sets). If a shared piece should look different, change it
  for everyone.
- Material Symbols Rounded icons: add the dashboard root class to the selector
  list in `src/app/scss/style.scss`.

### Component Conventions

- Component selector prefix: `tb-` (enforced by ESLint). Dashboards import
  ThingsBoard's `SharedModule`, so a selector that ThingsBoard already uses
  clashes at runtime ("NG0300: Multiple components match node with tagname …").
  Use `tb-ext-` for those (`tb-ext-checkbox`, `tb-ext-switch`,
  `tb-ext-confirm-dialog`), and check a new selector against ThingsBoard's
  (`grep -rn '"tb-<name>"' node_modules/thingsboard/src/app`) before using it.
- New components should use `standalone: true`
- Reactive forms via `FormBuilder`
- RxJS subscriptions use `takeUntilDestroyed()`
- Barrel exports through `public-api.ts` files per module
- **NEVER let a component show the browser's native `title` tooltip.** Any
  component that exposes a `@Input() title` (or is ever used with a static
  `title="…"` attribute) MUST strip the reflected attribute from its host:
  ```ts
  @HostBinding("attr.title") readonly hostTitle: string | null = null;
  ```
  Otherwise the browser renders its own tooltip ("Metrics", "Signal", …) on
  hover. Applies to every card/widget/chart component — verify there is no
  native hover tooltip anywhere before considering a widget done.
- **Tooltips show instantly with a tiny pop-in animation** (and hide with a
  quick fade), in all dashboards. Timing is central — no per-dashboard setting:
  - `matTooltip`: `provideTbTooltipDefaults()` (`components/shared/tooltip-defaults.ts`)
    is registered once on `ThingsboardExtensionWidgetsModule`, so every widget
    gets it (Material animates its own pop-in). Don't set `matTooltipShowDelay`
    per usage.
  - Custom CSS tooltips (hover-revealed `*-tooltip` / `*-tip` elements) use the
    shared mixins — the pop on the hidden rule (origin = the edge facing the
    button) and the shown mixin on the hover rule:
    ```scss
    @use "…/components/shared/styles/tooltip";
    .my-tooltip { opacity: 0; visibility: hidden; @include tooltip.tb-tooltip-pop(top center); }
    .host:hover .my-tooltip { opacity: 1; visibility: visible; @include tooltip.tb-tooltip-shown; }
    ```
  - To add a show delay later, set both `TB_TOOLTIP_SHOW_DELAY_MS` and
    `$tooltip-show-delay` (`styles/_tooltip.scss`) together.

---

# Part B — ThingsBoard entities via the `tb` CLI

Everything from here to the [catalog](#skill--agent-catalog) governs work done
through `thingsboard-cli` (`tb`): it creates and manages ThingsBoard entities
(devices, assets, profiles, dashboards, rule chains, …) as local JSON files,
deployed to an instance with `tb push`. **None of it applies to Part A work** —
a widget SCSS change never needs a routing gate, a mode check, or the feedback
one-liner.

`tb` resolves its project from a `thingsboard.json` at the project root. This
repo does not have one yet, so `tb` work currently targets the project at
`~/tb-cli` (`solutions/<slug>/…` there). If ThingsBoard entity JSON should live
in *this* repo instead, `tb init` has to run here first — ask before running it,
and never assume which project a `--solution <name>` refers to.

This part is the **reference for entity-level operations** (schemas, JSON
shapes, IDs, embedded data, reprocessing, emulators, debugging). It does **not**
orchestrate solution creation — see the routing rules below for when to defer to
a skill instead.

## ThingsBoard entity concepts

Before working with entities — especially fetching/pulling them from an instance — read the `thingsboard-concepts` skill to understand how ThingsBoard entities are structured and connected: tenants, customers, devices, assets, device/asset profiles, attributes and time series, ownership, and relations. Knowing that entities connect through profiles, group membership, and ownership — not only through relations — is essential to fetching a complete set of entities.

## Constraints

- **Local mode only** — always verify local mode is active before creating entities: `tb config mode local`. All entity creation must go through `tb <entity> save --json` commands — never write JSON files directly.
- **Never `cd` into solution directories** — always use `--solution <name>` to target a solution. Do not use `cd` to change into solution directories.
- **Never push** — never run `tb push`. The user decides when to deploy. Running `tb validate` is safe (dry-run) and should be run after creating entities.
- **Never modify profiles** — never run `tb config set`, `tb config add`, `tb config use`, or `tb config remove`. Authentication is the user's responsibility.
- **`tb feedback` is allowed** — running `tb feedback` (to record user feedback, see below) is safe and expected; it is not a config or push command.

## Feedback

Two separate things — do both.

### 1. Always end a completed generation with a feedback invitation

Whenever you finish generating anything — a single entity, a standalone artifact (`standalone-*`), or a full solution (`create-solution` / `update-solution`) — the **last line of your final message MUST be**, verbatim:

> Help us make the CLI better — share quick feedback anytime with `tb feedback`.

This is a passive one-liner (not a question); print it in the same turn the generation finishes, after any deploy/`tb push` notice. Do not skip it, and do not print it when you did not generate anything.

### 2. Follow the feedback hook

A feedback hook (Claude Code `UserPromptSubmit` / Antigravity `PreInvocation`) runs `tb feedback --hook` automatically on **every** message. When a feedback ask is due (the user generated something, or skipped a real-terminal push prompt — and it's been ≥4h since the last ask), the hook injects a reminder telling you to ask. **You never track timing yourself; just obey the reminder when it appears.**

When you see that reminder, **before** handling the request, ask **one** `AskUserQuestion` (`header: "Feedback"`, options **Yes** · **Partly** · **No** · **Skip**):

> "Did you achieve the result you expected? Tell us what to improve in your own words — your feedback shapes what we build next."

The user clicks an option, or picks the auto-provided **"Other"** field to write a comment (the only free-text path — capture whatever they write). Then **record it yourself** (never make the user run the command):

- **Yes / Partly / No** → `tb feedback --outcome <yes|partly|no> [--message "<their comment>"] [--feature "<a feature idea>"] --source push-followup`
- **Skip** (or no answer) → `tb feedback --dismiss`

Then continue with the request. Ask at most once per reminder; do not ask when no reminder is present. Feedback is anonymous and honors the analytics opt-out (the hook stays silent when analytics is off).

<!-- The question wording and the `tb feedback --outcome … --source push-followup` / `--dismiss`
     command spec above mirror `_HOOK_REMINDER` in src/thingsboard_cli/core/feedback.py.
     Keep the two in sync when either changes. -->

## Routing: solution skill vs. direct entity generation

Decide the path before you generate anything. Going off-path and hand-building what should have been a solution is much more expensive to undo than a short clarifying question.

### First decide intent: fetch vs. targeted vs. build vs. update

Route by **intent**, then by existence/completeness. Check the paths **in this order** — the first match wins:

1. **Fetch / pull / import / grab / refresh** existing entities (no build or change implied) → `Skill pull-solution` (see rule below — unchanged).
2. **Targeted ask** — the request names a **specific artifact or a small targeted set** to build, add, edit, fix, or **diagnose**: "add a calculated field to my Pump-42", "fix my EfficiencyIndex CF", "fix my OverheatAlarm", "2 devices for the water-pump profile", "a dashboard showing my Pump-42", "add a humidity gauge to the pump dashboard" — and equally diagnostic questions about a specific artifact: "I have a calculated field on my Ira device but it does not work — why?", "why does my OverheatAlarm never fire?". A diagnostic question IS a fix-intent ask: the standalone skill diagnoses first and applies the fix only after the user confirms. → Run the **standalone-vs-solution gate** below BEFORE calling any skill (diagnostic phrasing already decides — skip the gate, invoke the skill directly). Do NOT invoke `update-solution` or `create-solution` for a targeted ask until the gate (or unambiguous phrasing) has decided. This path matches even when the named entities already exist locally or on the instance — touching existing entities does not by itself make the ask solution-scoped.
3. **Build / create / generate a NEW solution from scratch** → `Skill create-solution`.
4. **Continue / finish / resume generation** of a solution whose prior build was interrupted → `Skill create-solution` (its local resume-to-continue detects which steps completed and runs only the remaining ones; it does not refresh from the instance).
5. **Add to / extend / change / modify a solution** — the ask is phrased at solution scope ("add 5 more devices to `<solution>`", "add a new sensor type to `<solution>`", "extend `<solution>` with …", "change the alarms on `<solution>`") or implies redesigning multiple artifact kinds together → first tool call MUST be `Skill update-solution`. It locates the target (local, then instance), refreshes only with consent, and applies the change surgically; if nothing exists to update, it hands back to `create-solution`.

The create/update line is **intent + completeness**, not merely "does it exist": finishing an unfinished build is `create-solution`; surgically changing a finished solution is `update-solution`.

### Targeted entity ask: the standalone-vs-solution gate

This is path 2's decision point — for a targeted ask it runs **before any skill is invoked**. When the request names a **specific artifact or a small targeted set** to build, add, edit, or fix — one or a few calculated fields (including a CF chain), alarm rules, devices/assets/customers/users/profiles/entity groups (e.g. "2 devices for the water-pump profile"), a standalone dashboard to create over existing entities, or a dashboard tweak — on known or named targets, with **no solution design implied** (no new profile + relations + IAM + dashboard set to design together), ask once via `AskUserQuestion` before routing:

- `question`: `"Just these item(s), or full solution treatment (design context, related entities kept in one place)?"`
- `header`: `"Scope"`
- `options`: `Just these items` · `Full solution treatment`

Route the answer:

- **Just these items** → the matching standalone-* skill: `standalone-calculated-fields`, `standalone-alarm-rules`, `standalone-dashboard`, or `standalone-entities` (devices, assets, customers, users, profiles, entity groups).
- **Full solution treatment** → `update-solution` (existing target) or `create-solution` (new system), per the rules above.

**Skip the question when the phrasing already decides:** "just the CFs, nothing else" / "only these two alarms" / "fix my OverheatAlarm" → standalone path directly; "and design alarms + a dashboard around it" or anything implying a system → solution path directly. Asks that need design work (new profiles with relations/IAM, role-based dashboard sets, anything phrased as a system/setup/scenario) never see the gate — they route per the rules above. The fetch/pull rule still takes precedence over this gate for pure fetch requests.

**The gate applies whenever the work begins — including mid-conversation.** When an ad-hoc investigation or Q&A turns into create/edit/fix work ("yes, fix it"), invoke the matching standalone-* skill at that moment. Never hand-roll `tb … save` calls, mode switches, or scratch solutions inline — the skill owns the resolver, key discovery, foundations rendering, validation, and commit flow.

**A follow-up change to a dashboard you generated or pushed earlier in this same conversation is still an edit — route it.** Immediately after the `dashboard-generator` agent runs and the dashboard is saved/pushed, the JSON is fresh in your context and it is tempting to "just tweak it" inline. Don't: a follow-up dashboard change ("make that gauge a chart", "add a humidity widget", "fix the alias") routes through `standalone-dashboard` (or `update-solution` for a solution dashboard) → `dashboard-generator` in **update mode**, exactly as a cold-start edit would. Having just built the dashboard, or holding its JSON in context, is **not** a license to hand-edit the dashboard JSON — alias-owns-keys, `typeFullFqn`, widget templates, and the validation walk only get applied through the agent, and hand-edits silently reintroduce the inaccuracies the agent exists to prevent.

---

**When the user wants to FETCH / PULL / IMPORT / GRAB / REFRESH entities that already exist on their instance into local files — with no build or design implied — your very first tool call MUST be `Skill pull-solution`.** Triggers: "fetch my temperature and humidity sensor", "pull my Pump-42 from the instance", "import my existing devices", "grab everything under the HQ building", "refresh my `<solution>` from the instance". `pull-solution` dispatches the discoverer, matches the request across name/profile/type, previews the connected graph, asks **once** to confirm the batch, and pulls it. It never creates new entities or designs anything.

**Do NOT answer a fetch request with ad-hoc `tb device list` calls, and do NOT offer to create entities or build a solution** — that is the wrong intent and the failure mode this rule exists to prevent. Hand the request to `pull-solution` and let it own discovery, matching, and the confirmation gate.

This rule **takes precedence** over the `create-solution` and `update-solution` routing below for pure fetch/pull/import requests.

### Otherwise: build or update path

**Use the `create-solution` skill when the request involves any of:**

- **Any large or non-trivial NEW system.** If the request describes building a new system, platform, product, or anything that needs more than one or two entities working together from scratch, route it to `create-solution`. Default to "this is a solution" whenever the scope is ambiguous and no existing solution is named.
- **Multiple related entities** — e.g. a new asset and its devices, devices that share a new profile, anything phrased as a "system", "setup", "scenario", "demo", or new use case.
- **A dashboard on a NEW solution** — Dashboards have a complex JSON structure and depend on an entity + metric model; never hand-build dashboard JSON outside a skill. (A dashboard *change* on an existing solution routes to `update-solution`; a small standalone dashboard over **existing** entities — "a dashboard showing my Pump-42 temperature" — routes through the gate to `standalone-dashboard`, which resolves the entities, recovers their live keys, and builds its design context ad-hoc.)
- **Calculations or alarms on a NEW device/asset** — these need profile and design context to be meaningful and reprocessable.
- **Continuing / finishing an interrupted build** — if a prior create run was interrupted and the solution is only partially built, route here; `create-solution` resumes from where it left off using only local state.

**Use the `update-solution` skill when the request involves any of:**

- **Adding to or modifying an existing solution** — "add 5 more devices to `<solution>`", "add a new sensor type to `<solution>`", "extend `<solution>` with …", "change the alarms on `<solution>`". `update-solution` locates the solution (local, then instance), reuses existing IDs, profile names, and design decisions, and applies the change surgically. It never regenerates untouched artifacts.
- **Changing a dashboard on an existing solution** — adding a widget, changing a chart, adjusting layout. Routing here (not `create-solution`) preserves the existing dashboard content.
- **Instance-import** — building a solution around entities that already live on the instance (the import, reverse-engineering, and fold-in work lives in `update-solution`).
- **Any request that touches entities already present** locally or on the instance.

**Direct entity generation (using this file's command reference inline) is superseded by the standalone-* skills.** A targeted ask that passes the gate above as "Just these items" routes to `standalone-entities` / `standalone-calculated-fields` / `standalone-alarm-rules` / `standalone-dashboard` — those skills own the standalone flow (resolver, scratch solution, schema discipline). The "Single-entity generation flow" and command sections below remain as the reference those skills follow.

## Discovering Commands and Schemas

Use `tb --help` and `tb <group> --help` to discover available commands and entity types.

Before creating any entity type for the first time, run the `-H` flag to learn its JSON schema:

```bash
tb device-profile save -H   # Shows JSON schema, required fields, read-only fields
tb device save -H            # Same for devices
```

Run `-H` once per entity type per session — no need to repeat for the same type.

## Single-entity generation flow

Once the user has confirmed they want a standalone entity (not a solution), follow these steps:

1. **Verify local mode:** `tb config mode local`.
2. **Discover the schema** with `tb <entity-type> save -H`.
3. **Generate the UUID** and save the entity with `tb <entity-type> save --json '<json-with-id>'`.
4. **Report** what was created and the entity ID.

## JSON Input Format

All `--json` input accepts **plain entity JSON** — the entity object itself, not a wrapper. Local mode automatically wraps it in EntityExportData format when saving to files.

```json
{
  "id": {"entityType": "DEVICE", "id": "<uuid>"},
  "name": "My Device",
  "type": "sensor",
  "deviceProfileId": {"entityType": "DEVICE_PROFILE", "id": "<profile-uuid>"}
}
```

Required fields: `id` and `name`/`title`/`email` (depending on entity type).

## ID Generation and Cross-References

Generate UUIDs programmatically — do not invent them by hand:
```bash
python3 -c "import uuid; print(uuid.uuid4())"
```

Generate all UUIDs you need upfront before building JSON, and store them in shell variables:
```bash
PROFILE_ID=$(python3 -c "import uuid; print(uuid.uuid4())")
DEVICE_ID=$(python3 -c "import uuid; print(uuid.uuid4())")
```

Then reference them in `--json` arguments:
```bash
tb device-profile save --solution my-solution --json "{\"id\": {\"entityType\": \"DEVICE_PROFILE\", \"id\": \"$PROFILE_ID\"}, \"name\": \"My Profile\", ...}"
tb device save --solution my-solution --json "{\"id\": {\"entityType\": \"DEVICE\", \"id\": \"$DEVICE_ID\"}, \"deviceProfileId\": {\"entityType\": \"DEVICE_PROFILE\", \"id\": \"$PROFILE_ID\"}, ...}"
```

## Embedded Data (Attributes, Calculated Fields, Alarm Rules, Relations)

Some data types are embedded directly in parent entity files rather than saved as standalone files. In local mode, these commands find the parent entity file and merge the data into it. **Always run `-H` to get the exact JSON schema before using these commands.**

> Note: calculated fields and alarm rules route through a skill, never by hand here — `standalone-calculated-fields` / `standalone-alarm-rules` when the gate chose the standalone path, `create-solution` for a new solution, `update-solution` for solution-level changes.

**Attributes** — merged into entity file under `attributes.<SCOPE>`:
```bash
tb attributes save DEVICE <entity-id> --solution <name> --json '{"location": "warehouse-A", "firmware": "v2.1"}'
```
Use `--scope SHARED_SCOPE` for shared attributes (default is `SERVER_SCOPE`).

**Calculated fields** — embedded in parent entity's `calculatedFields` array. Run `tb calculated-field save -H` for the full schema (types: SIMPLE, SCRIPT, ALARM, GEOFENCING, etc.):
```bash
tb calculated-field save --solution <name> --json '<calculated-field-json>'
```

**Alarm rules** — embedded in parent entity's `calculatedFields` array. Run `tb alarm-rule save -H` for the full schema:
```bash
tb alarm-rule save --solution <name> --json '<alarm-rule-json>'
```

**Relations** — embedded in the "from" entity's `relations` array:
```bash
tb relation save --solution <name> --json '{"from": {"entityType": "ASSET", "id": "<asset-uuid>"}, "to": {"entityType": "DEVICE", "id": "<device-uuid>"}, "type": "Contains", "typeGroup": "COMMON"}'
```

## Calculated Field Reprocessing

When a calculated field needs to backfill historical data (e.g., after changing its expression or adding it to an entity with existing telemetry), create a reprocessing task. This saves a task file locally; the actual reprocessing runs on the server during `tb push --run-tasks`.

### When to add reprocessing

Add a reprocessing task for **every** calculated field you create — regardless of CF type (`math`, `script`, `ts-aggregation`, `related-aggregation`, `delta`, `propagate`, `geofencing`, etc.). The only CFs to skip are the ones covered by the exclusion rule below.

**Set `--entity-type` / `--entity-id` to where the CF is attached** — the task targets the entity the CF was saved against, because the server looks the CF up by attachment, not by inheritance. **Do not** point a profile-CF task at one of its instances; the lookup will return nothing.

- CF on a device profile → `--entity-type DEVICE_PROFILE --entity-id <device-profile-uuid>`. **One task per CF**; the server fans out across every device using that profile during reprocess.
- CF on an asset profile → `--entity-type ASSET_PROFILE --entity-id <asset-profile-uuid>`. **One task per CF.**
- CF on a specific device or asset → `--entity-type DEVICE` / `ASSET` with the instance UUID. One task per instance.

**Do not create reprocessing tasks for CFs that:**
- have `type == "ALARM"` — alarm-rule CFs evaluate live events; reprocessing them is a no-op (no historical alarms get re-fired), or
- have `output.type == "ATTRIBUTE"` — attribute outputs aren't backfilled per timestamp, or
- have **only** attribute-typed arguments (every argument's `refEntityKey.type == "ATTRIBUTE"`) — there is no telemetry window to walk.

Any one of these conditions is enough to skip; reprocessing has nothing meaningful to recompute in those cases.

### How to add reprocessing

After saving a calculated field, create a reprocessing task by specifying the entity the CF is attached to (profile or instance — see the rule above) and the CF name:

```bash
# Profile-attached CF (one task per CF — server fans out to all instances)
tb calculated-field reprocess \
  --entity-type DEVICE_PROFILE \
  --entity-id <device-profile-uuid> \
  --name "<calculated-field-name>" \
  --start-ts <start-timestamp-ms> \
  --end-ts <end-timestamp-ms> \
  --order 100 \
  --solution <solution-name>

# Instance-attached CF (one task per device/asset)
tb calculated-field reprocess \
  --entity-type DEVICE \
  --entity-id <device-uuid> \
  --name "<calculated-field-name>" \
  --start-ts <start-timestamp-ms> \
  --end-ts <end-timestamp-ms> \
  --order 100 \
  --solution <solution-name>
```

This saves a task file to `solutions/<name>/tasks/reprocessing/`. The file persists across pushes — reprocessing runs every time `tb push --run-tasks` is used.

### Reprocess ordering

`--order` controls execution sequence (default `100`, lower runs first). Use it when one CF reads another CF's output: assign the dependency a lower order so it runs first. Example — CF B reads CF A:

```bash
tb calculated-field reprocess --entity-type DEVICE --entity-id <id> --name "A" --start-ts <s> --end-ts <e> --order 10 --solution <name>
tb calculated-field reprocess --entity-type DEVICE --entity-id <id> --name "B" --start-ts <s> --end-ts <e> --order 20 --solution <name>
```

### What to tell the user

When you create calculated fields with reprocessing tasks, remind the user:
- Deploy with `tb push <solution-name> --run-tasks` (not just `tb push`)
- The `--run-tasks` flag triggers CF reprocessing after the solution import
- Without `--run-tasks`, the task files are ignored and CFs won't backfill historical data

## Telemetry Emulators

When a solution's devices need demo telemetry so dashboards render meaningfully, define a telemetry emulator. Emulators are local-only task definitions that run during `tb push --run-tasks` and generate synthetic historical data on the target server.

### When to add an emulator

Add an emulator when you push a solution to a fresh dev/test instance and want the dashboards to be populated immediately. Emulators automatically skip devices that already have telemetry on the emulated keys, so the same task file is safe to keep when pushing to prod (where real devices report).

### How to add an emulator

After saving a device, define its telemetry profile and persist it as a task file:

```bash
tb emulator add \
  --entity-type DEVICE \
  --entity-id <device-uuid> \
  --solution <solution-name> \
  --days 7 \
  --json '{"telemetryProfiles":[
    {"key":"temperature","valueStrategy":{"type":"NATURAL","minStartValue":18,"maxStartValue":22,"minLowValue":18,"maxLowValue":19,"minHighValue":24,"maxHighValue":26,"minIncrement":0.1,"maxIncrement":0.5,"minDecrement":0.1,"maxDecrement":0.5}},
    {"key":"humidity","valueStrategy":{"type":"CONSTANT","value":45}}
  ]}'
```

The available `valueStrategy.type` values are: `CONSTANT`, `COUNTER`, `NATURAL`, `EVENT`, `SEQUENCE`, `COMPOSITE`, `SCHEDULE`, `INCREMENT`, `DECREMENT`. Field names mirror the ThingsBoard AI server emulator definitions exactly.

### What to tell the user

- Deploy with `tb push <solution-name> --run-tasks`
- Emulators skip devices that already have data on the emulated keys (safe to push to prod where real devices report)
- Use `tb push <name> --run-tasks --force-emulators --yes` to regenerate: this DELETES the existing values for the emulated keys on the target before posting fresh data
- Inspect with `tb emulator list`; remove with `tb emulator delete --entity-type DEVICE --entity-id <uuid> -y`

## Debugging Unclear Errors

When a `tb` command fails with an error message that doesn't make the cause obvious — e.g. low-level deserialization errors, opaque "Type definition error" messages, empty/short server responses, or anything that doesn't pinpoint the offending entity — re-run the same command with `--debug` (or set `TB_DEBUG=1`) to see the full request/response.

```bash
tb validate <solution-name> --debug
TB_DEBUG=1 tb push <solution-name>
```

What `--debug` adds:
- Outgoing request URL, headers (sensitive values redacted), and body
- Response status, reason, and full body — including server fields like `errorCode`, `timestamp`, and `path` that the normal error panel hides

Use it before guessing at fixes: the request body shows exactly what was sent, which usually reveals which entity file is malformed (missing `entityType`, wrong shape, unknown discriminator, etc.). Do **not** paste debug output into commits or PRs unless you've reviewed it for tokens or other sensitive data.

---

# Skill & agent catalog

Everything below lives in `.claude/` in this repo (copied from the `tb-cli`
project, so keep the two in sync when either changes). **Invoke skills by name
through the `Skill` tool — never inline their contents by hand**, and never
hand-build entity or dashboard JSON that a skill owns.

## Part A skills

| Skill | Use it for |
| --- | --- |
| `tb-widget` (`.claude/commands/tb-widget.md`) | Building or changing a widget in this Angular library — the widget lifecycle APIs, `ctx` wiring, module registration, and the shared-component/SCSS conventions from Part A. |
| `chirpstack` (user-level skill) | ChirpStack v4 LoRaWAN MQTT events, uplink/downlink payloads, decoding Milesight sensors (e.g. TS302). |

## Part B — orchestrators (the entry points)

| Skill | Use it for |
| --- | --- |
| `create-solution` | A **new** solution/system/demo end-to-end, or resuming an interrupted build. |
| `update-solution` | Adding to / changing an **existing** solution, and instance-import. |
| `pull-solution` | Fetch / pull / import / grab / refresh entities that already exist on the instance. |
| `standalone-entities` | One or a few devices, assets, customers, users, profiles, entity groups. |
| `standalone-calculated-fields` | One or a few calculated fields (incl. chains) — create, edit, diagnose, fix. |
| `standalone-alarm-rules` | One or a few alarm rules — create, edit, diagnose, fix. |
| `standalone-dashboard` | One dashboard JSON — create or targeted edit. |
| `reprocess-calculated-fields` | Backfill/recompute CFs on a deployed solution. |
| `create-extension` | A backend extension feature (REST controller / scheduled task) under `<project>/extension/`. |

## Part B — design, foundations, references

`design-solution-architecture`, `design-dashboards`, `dashboard-foundations`,
`dashboard-dark-mode`, `calculated-field-foundations`,
`alarm-rule-foundations`, `thingsboard-concepts`,
`standalone-target-resolver` (sub-skill), `commit-step` (sub-skill).

Read `thingsboard-concepts` before reasoning about profiles, ownership,
attributes vs. time series, or relations — especially before a pull.

## Part B — generation fan-out (called by orchestrators, not by you directly)

`generate-entities`, `generate-calculated-fields`, `generate-alarms`,
`generate-attributes`, `generate-emulators`.

## Part B — dashboard template catalog (pulled on demand by `dashboard-generator`)

- **Widgets:** `widget-action-button`, `widget-alarm-count`,
  `widget-alarm-table`, `widget-bar-chart`, `widget-battery-level`,
  `widget-chart`, `widget-connect-real-devices`, `widget-entity-table`,
  `widget-header-card`, `widget-horizontal-value-card`,
  `widget-html-container`, `widget-indoor-map`, `widget-info-card`,
  `widget-navigation-widget`, `widget-outdoor-map`, `widget-pie-chart`,
  `widget-progress-bar`, `widget-range-chart`, `widget-signal-strength`,
  `widget-simple-gauge`, `widget-state-chart`, `widget-state-switcher`,
  `widget-value-chart-card`.
- **Entity aliases:** `alias-single-entity`, `alias-state-entity`,
  `alias-entity-type`, `alias-device-type`, `alias-asset-type`,
  `alias-device-search-query`, `alias-asset-search-query`,
  `alias-relations-query`, `alias-customer-entities`,
  `alias-customers-by-group-name`.
- **Widget actions:** `action-drill-down`, `action-change-state`,
  `action-create-entity-dialog`, `action-edit-entity-dialog`,
  `action-delete-entity-dialog`, `action-change-owner-dialog`,
  `action-create-map-entity-dialog`.

## Agents (`.claude/agents/`)

Dispatched **by the skills above**, not directly:

- **Dashboards:** `dashboard-generator` (sonnet; create + surgical update).
- **Entities:** `entities-planner`, `devices-generator`, `assets-generator`,
  `device-profiles-generator`, `asset-profiles-generator`,
  `customers-generator`, `users-generator`, `roles-generator`,
  `entity-groups-generator`, `relations-generator`, `wiring-executor`.
- **Data & logic:** `cf-generator`, `cf-reprocess-generator`,
  `alarm-generator`, `attribute-values-generator`,
  `device-emulator-generator`.
- **Instance / build:** `instance-entity-discoverer`, `extension-builder`.

## Examples (`.claude/examples/`)

Reference JSON — read them when a template's shape is unclear, don't copy them
wholesale:

- `examples/dashboards/` — `building_systems_administration`,
  `coffee_machine_administration`, `facility_operations_dashboard`,
  `composite_html_container_dashboard`.
- `examples/widgets/html-container/` — `composite-tabs-angular`,
  `master-detail-split-angular`, `slide-over-drawer-angular`,
  `custom-timewindow-analytics-plain`, `heatmap-cdn-library-plain`,
  `kanban-cdn-library-plain`.
