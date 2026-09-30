---
name: design-dashboards
description: "Designs and maintains <workdir>/design/dashboards.json — dashboard use cases per IAM role against the approved entity + metric model. Four modes: Create (one dashboard per role from the design files), Extract (reverse-engineer entries from dashboards pulled from the instance, from-existing=true), Revise (targeted changes / partial regeneration, revise=true), and Extension overlay (widgetActions only, extension-only=true)."
user-invocable: false
---

# Design Dashboards

Act as a dashboard business analyst expert for ThingsBoard IoT solutions: analyze the solution structure and generate a dashboard use case overview for each IAM role.

Goal: decide **what each dashboard lets users do** — the use cases, grouped by category — and write the list to `<workdir>/design/dashboards.json`. Widget classes, state names, and layouts are decided later by the `dashboard-generator` agent (create-solution Step 5).

The orchestrator owns user interaction and approval — this skill designs silently and writes the JSON file. Keep the JSON contents out of the conversation. Emit a short lowercase line before each substep so the user sees work happening (e.g. `▸ deriving one dashboard per role`).

## Permission levels

- CRUD: full control — use cases include create, view, edit, and delete operations.
- RU: partial control — use cases include view and edit operations only.
- R: read-only — use cases include view and monitor operations only.

## Operating modes

The orchestrator's flags select exactly one mode:

| Mode | Signal | Source of truth | Output behavior |
|---|---|---|---|
| **Create** | no mode flag | The single design artifact (architecture-overview.md) | Write `dashboards.json` from scratch — one dashboard per IAM role |
| **Extract** (reverse-engineering) | `from-existing=true` | Pulled dashboards under `<workdir>/dashboards/` (+ the `additions` brief) | Mirror the existing dashboards faithfully; fold `additions` in with per-dashboard `added` bookkeeping |
| **Revise** (design update) | `revise=true` | Existing `design/dashboards.json` + the brief (and optional `regen-targets`) | Apply targeted changes only; preserve untouched entries verbatim |
| **Extension overlay** | `extension-only=true` | Existing `design/dashboards.json` + `extension-design.json` | Overlay `widgetActions` only; every other field preserved verbatim |

**Precedence:** `extension-only=true` wins over every other flag. Otherwise `revise=true` wins over `from-existing=true` (an update run that pulled first revises the just-extracted design — `from-existing` then only signals that the baseline mirrors instance state). `extension-enabled` is **not** a mode — it is an orthogonal flag that any design-producing mode honors by proposing `widgetActions` (see Step 2.5).

## Inputs from the orchestrator

- `workdir` — absolute path to the solution directory, created and verified in Step 1c of `/create-solution`. Treat this value as **opaque** — use it verbatim, do not re-derive it from cwd, do not run `realpath solutions/<slug>` yourself. Read the approved design from the single artifact `<workdir>/design/architecture-overview.md`. Write the design JSON to `<workdir>/design/dashboards.json` so the dashboard-creation step (create-solution Step 5, which dispatches the `dashboard-generator` agent) reads it directly from disk; the file is the only source of truth.
- `revise` (optional bool) — selects Revise mode. The brief then also carries the change description (the orchestrator's `additions` / changed use cases).
- `regen-targets=[<names>]` (optional, only with `revise=true`) — restricts Revise mode to the listed dashboards; every other entry is left untouched.
- `from-existing` (optional bool) — selects Extract mode. The solution already has dashboards pulled from the instance under `<workdir>/dashboards/`. **Design from those, don't invent fresh ones.** Used by `create-solution` Step 4 for instance-import / resume when dashboards were present.
- `additions` (optional string, meaningful with `from-existing=true` or `revise=true`) — dashboard changes the user asked for, or changes implied by entities added this run (a new telemetry key, profile, role, or alarm to surface). In Extract mode it folds into the reverse-engineered design; in Revise mode it is the change brief. Either way the affected use cases are recorded in the per-dashboard `added` field.
- `extension-enabled` (optional bool, default `false`) — when `true`, also read `<workdir>/design/extension-design.json` and `<project_root>/extension/README.md` (Step 2.5), and propose `widgetActions` on dashboards whose role permissions warrant POSTing to extension endpoints.
- `extension-only` (optional bool, default `false`) — selects Extension-overlay mode.

## Step 1 — Verify workdir (every mode)

Before touching disk, verify the orchestrator-supplied `workdir`:

```bash
[[ "$workdir" = /* ]] || { echo "Error: workdir '$workdir' must be an absolute path (received from /create-solution Step 1c)"; exit 1; }
[ -f "$workdir/design/architecture-overview.md" ]                || { echo "Error: '$workdir/design/architecture-overview.md' missing — design-solution-architecture did not write it; aborting"; exit 1; }
if [ "$extension_enabled" = "true" ]; then
  [ -f "$workdir/design/extension-design.json" ] || { echo "Error: '$workdir/design/extension-design.json' missing — extension-enabled=true but the extension-design stage did not write it; aborting"; exit 1; }
fi
```

Then the mode-specific precondition:

- **Revise** and **Extension overlay** — the baseline design must exist:

  ```bash
  [ -f "$workdir/design/dashboards.json" ] || { echo "Error: '$workdir/design/dashboards.json' missing — nothing to revise/overlay; run a design pass first"; exit 1; }
  ```

- **Extract** — no extra check; the mode's discover step scans `<workdir>/dashboards/` and falls through to Create mode when nothing was pulled.

If any check fails, stop the skill — do **not** create directories yourself, do **not** fall back to deriving a path from a slug. A failed check is an upstream bug to surface, not to paper over.

## Step 2 — Read the overview capability doc (every mode)

Single file read — every mode writes or validates use cases against its categories, so it is required reading regardless of mode:

- `@/Users/steffensenchyna/.thingsboard/resources/prompts/solutions/dashboard/resources/ba-overview/ba-dashboard-overview-capabilities.md` — use-case categories (Entity Overview, Entity Management, Monitoring & Statistics, Alarm Handling, Navigation) and the shape of a dashboard overview.

## Step 2.5 — Read the extension surface (when `extension-enabled=true`; always in Extension-overlay mode)

Skip this step when `extension-enabled=false` and the mode is not Extension overlay.

Otherwise:

1. Resolve the project root: `project_root="$(dirname "$(dirname "$workdir")")"`.
2. Read `<workdir>/design/extension-design.json` for the full endpoint contract (request/response shapes, custom roles, dashboards referenced by name).
3. Read `<project_root>/extension/README.md` if it exists. The README is the authoritative surface of what the built extension actually exposes; parse its `## Features` section to enumerate endpoints by feature, method, path, auth, and return summary. Use the deterministic helper at `src/thingsboard_cli/core/extension_manifest.py::parse_file`:

   ```bash
   PROJECT_ROOT="$project_root" python3 -c "import os, json; from pathlib import Path; from thingsboard_cli.core.extension_manifest import parse_file; m = parse_file(Path(os.environ['PROJECT_ROOT']) / 'extension' / 'README.md'); print(json.dumps([{'slug': f.slug, 'endpoints': [{'method': e.method, 'path': e.path, 'auth': e.auth, 'returns': e.returns} for e in f.endpoints]} for f in m.features]))"
   ```

   (Pass `$project_root` through an env var to avoid shell quoting bugs when the path contains spaces.) If the README does not exist yet (the extension hasn't been built — e.g. design ran before `create-solution` Step 3.5), rely on `extension-design.json` alone.

4. When proposing use cases for a role, include `widgetActions` in that dashboard's entry — but only for roles whose permissions warrant the action (e.g. a viewer role without CRUD on the target resource does not get a "create profile" button). Each action references a single extension endpoint by its path.

## Use-case design rules (every mode that writes or changes a use case)

These rules bind every use case this skill produces — all of Create mode, the `additions` folded in Extract mode, and the changed/added use cases in Revise mode.

**RU permission scope.** RU's "edit" covers updates to both **configuration attributes** (thresholds, names, static settings) and **operational shared/server attributes** (setpoints, toggles, commanded state — e.g. `plugState`, `targetTemperature`). It does **not** cover RPC commands or writes to telemetry keys — those require write permission on the device.

**Floor plan per navigation state.** When a state has indoor positioning, it uses the **focal entity's** floor plan — never the parent's or a deeper descendant's. Direct children render as markers on it. At each navigation level, the floor plan switches to that level's entity: Home state shows Home's floor plan with Room markers; Room state shows Room's floor plan with device markers.

**Use-case depth test — the mental replacement check.** A right-sized use case names the entity and the data/action, never the widget class, state name, size, or layout. Test it: mentally strip words like *table*, *card*, *chart*, *map*, *sizeX=12*, *column*, *row*. If the use case still reads, it's at the right level. If it falls apart without them, you've smuggled widget decisions in — rewrite with plain-English data and user action instead.

### Entity-kind correctness rules (HARD RULES — applied to every use case)

These three rules prevent a class of bug where a use case names entity X but the keys it shows live on entity Y. When the dashboard generator renders such a use case, it produces a widget whose datasource resolves to X but whose data keys belong to Y — empty columns at best, broken drill-downs at worst. Phrase every use case so X and Y are the same entity, or the relation between them is explicit in the use case.

#### Rule 1 — Customer-as-container

A **customer group** in a customer-scoped solution is typically a **container**, not a data entity. The customer record carries no domain telemetry/metric/alarm keys — those live on the customer's scope-asset(s) (reached via the `Manages` relation in `## Relations`, 1:1 or 1:M). Apply this rule per role:

- **Customer-level role** (role's userGroup has `scope = <customerGroupName>`): the dashboard entry point is the **scope-asset**, not the customer collection. The customer is implicit (`currentCustomer`); do not generate "list customers", "view customer details", or any use case whose primary entity is a customer. Per the `Customer-Level Role` rule in `ba-dashboard-overview-capabilities.md`.

- **Tenant-level role** that legitimately needs cross-customer browsing: pick **one** of two patterns, never mix them. Pattern choice is driven by the role's permissions, not by how much info the customer carries:
  - **Pattern (b) — customer-list → customer-detail → asset-detail.** **Default for CRUD and RU roles** (admins / managers who need to manage entities across the hierarchy). The root state lists customers with customer-owned keys only (title, address, contract, etc. — never telemetry that lives on the scope-asset). Row-click drills to a customer-detail state that shows:
    - The customer's own attributes (always — even if sparse, the customer-detail state exists to anchor the hierarchy).
    - A list of the scope-asset(s) owned by that customer (filtered by the customer-as-state-entity).
    - For CRUD roles: a "Create asset under this customer" action button on the asset list (uses `addEntity` dialog with the customer pre-selected as owner).
    - For CRUD roles on customer keys: edit / delete actions on the customer's own attributes.
    Row-click on a scope-asset drills further to the asset-detail state, passing the asset UUID. Two-step navigation: customer-list → customer-detail → asset-detail. This pattern reflects how an admin actually works — they need a place to *create* assets under a specific customer and to *manage* the customer record itself; the customer-detail state is that anchor even when its own data is sparse.
  - **Pattern (a) — list scope-assets with an owner column.** **For R (read-only) tenant-level roles** that need a flat operational view across customers without management actions. List the scope-asset directly at root, add a column derived from the asset → owning customer relation showing the customer's name, and (when the role has RU or CRUD on the asset's ownership) an optional row action to reassign the owner. Drill-down passes the scope-asset's UUID to the asset-detail state. Skips the customer-detail intermediate — fine for view-only flows because there's nothing to manage on the customer side.

  Picking the pattern: start from the role's permissions. CRUD/RU → pattern (b). R → pattern (a). When uncertain, default to pattern (b) — admins skipping the customer layer feels broken because they lose the natural place to create / edit / delete entities under a customer.

#### Rule 2 — Use-case entity check (every bullet, before finalizing)

For each use case bullet:

1. Identify every entity profile name mentioned.
2. Identify every telemetry / metric / alarm key mentioned (cross-reference each profile's `Telemetry:`/`Attributes:` sub-lists and the `## Metrics` / `## Alarms` bullets' owning profiles).
3. For each key, confirm the use case names an entity that **owns** that key. If the named entity is a parent/customer and the key lives on a child/scope-asset, the bullet is wrong — rewrite to either:
   - Replace the entity with the one that owns the key (e.g. "Display Districts (one per District Operator customer) with current AQI" instead of "Display District Operators with current AQI"), or
   - Make the relation traversal explicit ("For each District Operator, show the AQI of the District it manages" — but only when you really want a customer row and the AQI is a related column, which then forces pattern (b) from Rule 1).

**Canonical anti-example (from a real failing dashboard):** a "District Operators" widget in the tenant-admin City AQI dashboard, datasource alias resolving to CUSTOMER entities (the District Operator customer group), `dataKeys = ["title", "avgDistrictAqi", "districtAqiCategory"]` — but `avgDistrictAqi` and `districtAqiCategory` live on the District ASSET, not on the customer. The rendered widget showed customer names with empty AQI columns, and the row-click passed a customer UUID into a `district-detail` state that expected an asset UUID — every alias in the detail state broke. The fix: switch the alias to `"All Districts"` (asset), add a column derived from the District→Customer owner relation, and let the row-click pass the District UUID (pattern (a) above).

#### Rule 3 — Navigation explicitness

Every navigation / drill-down use case must:
- Name the **source entity kind** (what the user clicks on) — e.g. "from the Districts list" or "from a Customer row".
- Name the **target entity kind** the detail state is built around — e.g. "drill into a District to see its sensors".
- The source kind and target kind must match. The drill-down's `setEntityId` will pass the source row's UUID; the target state's primary alias must accept that kind.

If the user benefit calls for navigating across kinds (e.g. customer → asset), express it as two hops: customer-list → customer-detail (kind-matched) → asset-detail (kind-matched). Never write a single use case like "drill from customer X to asset Y details" — that's a kind mismatch by construction.

## Mode: Create — design from the approved entity + metric model

### C1 — Set dashboard scope

Default: one dashboard per IAM role. This is a recommendation, not a hard rule — produce more dashboards for a role when the user explicitly asks for it, or when the role's responsibilities cover distinct workflows that a single dashboard would crowd (e.g. an operator role overseeing both fleet ops and maintenance may warrant separate dashboards).

Write `{"dashboards": []}` to `<workdir>/design/dashboards.json` and return immediately when the original solution request explicitly says `no dashboards`, `skip dashboards`, `without dashboards`, or equivalent.

### C2 — Read the design

`Read` `<workdir>/design/architecture-overview.md` — the single design artifact — and parse its sections:

- **H1 title + `## Summary`** — the solution title and summary for dashboard naming and overview prose.
- **`### <Profile> (DEVICE|ASSET)` subsections** — telemetry/attribute keys (from each profile's `Telemetry:`/`Attributes:` sub-lists, including derived keys annotated `(derived: …)`) that monitoring and overview use cases may reference.
- **`### Customer Groups` / `### User Groups and Roles` tables** — customer/user context (drives multi-tenant nuances).
- **`## Relations` prose** — parent/child structure for navigation use cases.
- **`### User Groups and Roles` rows as roles** — the role list this skill iterates over, each with its `Permissions` (CRUD/RU/R, drives management-action gating).
- **`## Metrics` bullets** — calculated-field definitions (semantic context: which metric produces which output, on which profile). The output keys also appear in their owning profile's key sub-list annotated `(derived: …)` — there is no separate `addedProfileKeys` list.
- **`## Alarms` bullets** — alarm rules available for alarm-handling use cases.

Customer mode is derived locally: `customerMode = (the ### Customer Groups table has real rows) ? "customer-hierarchy" : "tenant-only"`.

### C3 — Derive one dashboard per role

For each `### User Groups and Roles` role, build a `dashboardOverview`:

- `name` — dashboard title
- `assignedTo` — role name
- `overview` — 1–2 sentences on what this dashboard is for
- `useCases` — grouped by the five categories above
- `userRequirements` (optional) — concise natural-language summary of any dashboard preferences the user stated in the original solution request or in conversation messages (widget types, layout, styling, colors, specific visualizations). HIGH PRIORITY — overrides default generation decisions. Omit the field when no preferences apply to this dashboard.

Ground every use case in what actually exists in the overview: monitoring only for telemetry keys that exist under a profile's `Telemetry:`/`Attributes:` sub-lists (raw or metric-derived — derived keys are in the same sub-lists, annotated `(derived: …)`), alarm handling only for alarms that exist, management actions only for operations the role's permissions allow (CRUD/RU/R). Every use case must pass the **Use-case design rules** above.

Then write the file per **Output format** below.

## Mode: Extract — reverse-engineer from existing dashboards

The user already has dashboards on the instance, pulled under `<workdir>/dashboards/`. **Design from those — follow the existing dashboards; do not invent one per role and do not recreate them.** This mirrors how `design-solution-architecture` reverse-engineers existing entities.

1. **Discover** the pulled dashboards: scan `<workdir>/dashboards/*.json`. If there are none, `from-existing` has nothing to reverse-engineer — fall through to Create mode (C1–C3, one dashboard per role).
2. **Read context.** `Read` the overview (as in C2) in the same batch as the pulled dashboard files — `additions` grounding and role resolution need them.
3. **Reverse-engineer one design entry per existing dashboard.** For each pulled dashboard file, read it and derive its design entry faithfully — do not redesign it:
   - `name` ← the dashboard's title (verbatim).
   - `assignedTo` ← the role it serves (from its assignment / owning customer; if not resolvable, the closest `### User Groups and Roles` role, else leave the existing assignment).
   - `overview` ← a 1–2 sentence summary of what the dashboard already does.
   - `useCases` ← derived from the dashboard's actual states and widgets, grouped into the five categories — describe what the dashboard *already lets users do*, not an idealized redesign.
   - Mark these as imported (they are **not** listed in `added`).
4. **Apply `additions`** (when non-empty) onto this reverse-engineered set — never by starting over:
   - A change to an existing dashboard (surface a new key/alarm, adjust a use case) → fold the new/changed use case(s) into that dashboard's `useCases`, **and** record those same changed/added use-case strings in **that dashboard entry's own `added: [string]` field**. `added` is per-dashboard (a field on the dashboard object), not a top-level array — `create-solution` Step 5 forwards each dashboard's `added` to the update agent verbatim as `changedUseCases`, so it must contain the exact use-case text to implement, scoped to that dashboard.
   - A **new** dashboard → add one **only when the user explicitly asked for a new dashboard**. Otherwise prefer extending an existing dashboard. A genuinely new dashboard records its full initial `useCases` list in its own `added` field (it is entirely new this run).
   - Entity-driven changes (a profile/role/key added this run) → surface them on the dashboard(s) whose role already covers that area, as a change to the existing entry — not a new dashboard.
   - Every added/changed use case must pass the **Use-case design rules** above.
5. **Do not add a dashboard for a role that doesn't already have one** unless `additions` explicitly calls for it. Following the existing set is the point.
6. Write the merged set per **Output format** below, then return.

`create-solution`'s Step 2 labels each dashboard `[imported]` (reverse-engineered, empty `added`) or `[new]` (non-empty `added` — added/changed this run), exactly as it does for entities.

## Mode: Revise — targeted design update

Used when `dashboards.json` already exists and the run changes it (a new key to surface, a widget request, a new role's dashboard). The existing file is the baseline; most entries must survive untouched.

### R1 — Read mode inputs

`Read` in one batch: the existing `<workdir>/design/dashboards.json` (the baseline) plus the overview (as in C2) — changed use cases must be grounded in the current entity/metric/alarm model.

### R2 — Apply the delta

- **Scope.** When `regen-targets=[<names>]` was passed, regenerate only the listed dashboards; every other entry is left untouched. Without `regen-targets`, change only the dashboards the brief names or implies.
- For each affected dashboard, fold the change into its `useCases` **and** record the specific changed/added use-case string(s) in that dashboard entry's own `added: [string]` field — the same per-dashboard `added` contract as Extract mode. This is what the orchestrator forwards to the update agent as `changedUseCases`; without it the update would have no scoped delta and would fall back to guessing. Dashboards not affected keep their existing `added` (or none).
- **Preserve every untouched dashboard verbatim** — never reword, reorder, or drop an entry the change doesn't affect.
- Every changed/added use case must pass the **Use-case design rules** above.
- Write the file per **Output format** below.

## Mode: Extension overlay — widgetActions only

Runs when `extension-only=true`. Do **NOT** regenerate the design. The existing `<workdir>/design/dashboards.json` is the authoritative source of `name`, `assignedTo`, `overview`, `useCases`, and `userRequirements` for every dashboard — those fields are preserved verbatim. This is the only path that mutates `dashboards.json` in overlay form.

1. Step 2.5 already read `extension-design.json` (required — stop with a clear error if missing), the extension README when present, and resolved the project root.
2. Parse the overview's `### User Groups and Roles` rows to resolve each existing dashboard's `assignedTo` role to its permission set.
3. Read the existing `<workdir>/design/dashboards.json` into memory. Iterate each dashboard:
   - Determine the candidate endpoints from `extension-design.json` whose purpose maps to actions the dashboard's role permissions warrant (CRUD/RU/R — same gating rule as Step 2.5). A viewer role without CRUD on the target resource does **not** get a "create" button.
   - For each warranted endpoint, build a `widgetActions` entry `{endpoint, label, inputSchema}` and add (or merge with) the dashboard's existing `widgetActions` array. Do **not** duplicate an entry that already references the same endpoint.
   - Leave dashboards with no warranted action unchanged (do not introduce an empty `widgetActions` array — omit the field entirely).
4. **Preserve every other field verbatim** on every dashboard: `name`, `assignedTo`, `overview`, `useCases`, `userRequirements`. Only `widgetActions` may be added or extended.
5. Write the updated object back to `<workdir>/design/dashboards.json` using the `Write` tool.
6. Print one confirmation line and return immediately — the Output-format write and Return summary below are owned by the other modes:

   ```
   dashboards design updated at <workdir>/design/dashboards.json: widgetActions overlaid on <N> dashboards
   ```

## Output format (Create, Extract, and Revise modes)

Build the JSON object with the structure shown below and write it to `<workdir>/design/dashboards.json` using the `Write` tool. In Revise mode this overwrites the existing file. The on-disk file is the only authoritative artifact — keep the JSON contents out of the conversation.

````markdown
```json
{
  "dashboards": [
    {
      "name": "Facility Operations",
      "assignedTo": "FacilityManager",
      "overview": "Monitor all rooms in the building, track temperature and humidity, and handle environmental alarms.",
      "useCases": {
        "entityOverview": ["View all rooms in the building with current temperature and humidity"],
        "entityManagement": [],
        "monitoringStatistics": ["Compare average temperature across rooms over the last 24 hours"],
        "alarmHandling": ["View and acknowledge HighTemperature alarms"],
        "navigation": ["Drill into a room to see its sensor detail"]
      },
      "userRequirements": "Use a dark theme with a building floor-plan map on the root state.",
      "widgetActions": [
        {
          "endpoint": "/api/extension/user-profiles",
          "label": "Create profile",
          "inputSchema": {
            "name": "string",
            "defaultDashboardName": "string",
            "roleNames": "string[]"
          }
        }
      ]
    }
  ]
}
```
````

`widgetActions` is optional. Include it only when `extension-enabled=true` AND the role's permissions warrant the action. Omit the field entirely when the array would be empty.

`added` is optional and per-dashboard: a `[string]` field listing the exact use case(s) added or changed for that dashboard **this run** (set by Extract and Revise modes). Omit it on fresh full designs and on dashboards untouched this run. `create-solution` Step 2 uses its presence for `[new]`/`[imported]` labelling, and Step 5 forwards it to the update agent as `changedUseCases`.

## Rules

- Output: One dashboard definition per IAM role, each with `name`, `assignedTo`, `overview`, `useCases`, and optionally `userRequirements`. Written to `<workdir>/design/dashboards.json`; do not print the JSON to the conversation.
- User Requirements: Consolidate dashboard preferences from the user's original solution request and any subsequent conversation messages (widget types, layout, styling, colors, specific visualizations) into a concise natural-language summary on the relevant dashboard's `userRequirements` field. User requirements have HIGH PRIORITY — they override default generation decisions. If no preferences apply, omit the field.
- Permission application: Map each role's permission level to use-case verbs per **Permission levels** above (CRUD → create/view/edit/delete; RU → view/edit; R → view/monitor only).
- Default to one dashboard per IAM role; use the exact role name for `assignedTo`. Generate additional dashboards for a role only when the user explicitly asks, or when the role's distinct workflows cannot fit a single dashboard — in either case, give each dashboard a distinct, descriptive name and reuse the same `assignedTo` role.
- Analyze entity attribute keys and telemetry keys to determine which visualizations and use cases are applicable for each entity.
- Use whether the `### Customer Groups` table has real rows to identify the solution type (multi-root vs single-root) — it drives `customerMode`.
- Use cases describe WHAT the user can do, not HOW it is implemented (apply the mental replacement check above).
- Each dashboard targets ~10 use cases as a default — this is a recommendation, not a hard cap. Go above when the user explicitly asks for more or when the role's responsibilities genuinely require more use cases to cover the workflow. Stay below when there's nothing meaningful left to add.
- Follow the solution types, navigation hierarchy, use case structure, visualization support, and ability description patterns defined in `ba-dashboard-overview-capabilities.md`.
- IMPORTANT: In JSON string values, use real newline characters for line breaks, never the literal escape sequence `\n` doubled (`\\n`).
- `widgetActions.inputSchema`: when a field carries a TB entity reference (dashboard, customer, role, device, asset), use the entity NAME (or stable slug) as the value type — never a UUID. The extension resolves names to UUIDs at request time. UUIDs would break across `tb push` targets (dev/test/prod each have their own).
- Extension-overlay mode: do NOT regenerate `useCases`, `overview`, `name`, `assignedTo`, or `userRequirements` on existing dashboards. Read the existing `dashboards.json`, set or extend each dashboard's `widgetActions` array as needed, and write the file back. Dashboards whose role doesn't warrant any new action are written back unchanged.

## Resources

The resources that you must use:

- `ba-dashboard-overview-capabilities.md` — Solution types, navigation hierarchy, use case categories, visualization support, and ability description patterns (read once in Step 2, every mode).
- `<workdir>/design/architecture-overview.md` — the single design artifact read in C2 / Extract step 2 / R1 as the authoritative source for entities, profiles, telemetry, relations, roles, computed metrics, and alarms.

## Return

After the design file is written (by Create, Extract, the no-dashboards short-circuit, or the Extension overlay), print one summary line (the Extension overlay prints its own confirmation line instead):

```
dashboards design saved to <workdir>/design/dashboards.json: <N> dashboard(s)
```

(Or `0 dashboards` if C1 short-circuited.)

**Continue in the same turn.** This skill runs inline in the invoking orchestrator's conversation — the summary line is mid-step narration, and the flow continues within the SAME assistant turn: read `dashboards.json`, render the per-dashboard presentation, and run the approval gate (`/create-solution` Step 4 owns both), or proceed directly with the orchestrator's next step on paths without a gate (e.g. extension overlays). The gate's `AskUserQuestion` is the first and only point where the run waits for the user after this skill completes.
