---
name: design-solution-architecture
description: "Designs a complete ThingsBoard IoT solution architecture in one pass and writes it as the single design artifact, architecture-overview.md — device and asset profiles with telemetry and attribute keys, relations, customers, users and roles, calculated fields, and alarms. Use when create-solution or update-solution needs the architecture designed from the interview context, reverse-engineered from pulled instance entities (from-existing mode), or revised (revise mode). Produces the machine-readable overview that the entity, calculated-field, alarm, emulator, and dashboard generators all read."
user-invocable: false
---

# Design Solution Architecture

Designs a complete ThingsBoard IoT solution architecture and writes it as the single design artifact, `<workdir>/design/architecture-overview.md` — device and asset profiles with their keys, relations, customers, users and roles, calculated fields, and alarms.

Write the overview **full**: state every fact needed to generate the solution explicitly in the markdown — CF type per metric, alarm severity/condition, relation cardinality, role permissions, per-key telemetry-vs-attribute classification, and the complete key set including derived keys.

## User and design needs override defaults

The defaults, counts, structural patterns, and limits in this skill are **recommendations**, not hard gates. Override them when either:

- The user explicitly asks for something that exceeds or contradicts the default (more demo entities per profile, more customers per customer group, more dashboards per role, more use cases per dashboard, a different structural pattern), **or**
- The solution's own pattern coherently needs more — e.g. a fleet-tracking demo needs ~20 vehicles for a meaningful map; a multi-floor building needs one asset per floor; a parent–child hierarchy needs enough children to demonstrate aggregation; a multi-tenant SaaS demo needs several customer instances per customer group.

In both cases, scale the design up (or down) to fit. No silent capping, no pushback.

Exceptions: safety-critical invariants the downstream generators depend on (byte-for-byte name matching, customer-pairing alignment). Defaults still apply when the user is silent and the pattern doesn't demand more.

## Inputs from the orchestrator

Invoked by two orchestrators: `create-solution` (fresh design) and `update-solution` (which drives the `from-existing` and `revise` modes). The inputs below come from whichever one called this skill.

- `slug` — used for narration; not written into the overview.
- `workdir` — absolute path to the solution dir, created by the orchestrator (`create-solution` Step 1c, or `update-solution` after `pull-solution` materialized the graph). Treat as opaque — do not re-derive from `slug` or cwd.
- `mode` (optional, `interactive` | `autonomous`) — informational pass-through. This skill designs silently and never pauses; the orchestrator owns every gate.
- `revise` (optional bool, default `false`) — selects **Revise** mode (see **Modes**).
- `from-existing` (optional bool, default `false`) — selects **Extract** mode (see **Modes**).
- `extension-enabled` (optional bool, default `false`) — when `true`, run the **Extension add-on** (see below); its custom roles fold into the roles as first-class user groups.

These flags only *route*; the actual content (what to design, what to add, what to change) is read from the conversation this skill runs in — it is never passed in.

## Modes

The run is in exactly one mode, chosen by the flags — the mode sets the **source** the overview is written from. Everything after (read the capability docs, write the overview to the contract) is shared across all three.

- **Fresh** (default — neither flag set) — write the overview from the interview context in the conversation.
- **Extract** (`from-existing=true`) — the solution was pulled from the instance; write the overview from those entity files (with live telemetry-key recovery), then apply any net-new the user asked for in the conversation. `Read` `references/from-existing.md` and follow it.
- **Revise** (`revise=true`) — an approved overview already exists; edit it in place for the change the user asked for. `Read` `references/revision-flow.md` and follow it.

(`extension-enabled=true` is not a mode — it's an add-on that layers onto whichever mode; see **Extension add-on** below.)

## Read the capability docs

Before writing, `Read` all of these in one batch. Skip only those already in context from earlier in this session (a same-session revise already has them). These are authoritative for the rules summarized inline below; read them for depth.

- **Solution capabilities** — `@/Users/steffensenchyna/.thingsboard/resources/prompts/solutions/solution-ba/resources/solution-capabilities.md` (metric-type overview, alarm patterns, indoor/outdoor positioning, customer-hierarchy guidance, solution-description structure).
- **Profiles** — `@/Users/steffensenchyna/.thingsboard/resources/prompts/solutions/solution-entities/resources/entity-profiles/entity-profiles.md` (TIMESERIES vs ATTRIBUTE, dataType, classifier, Telemetry Value Constraints min/max inference, Reserved Entity Fields) and `@/Users/steffensenchyna/.thingsboard/resources/prompts/solutions/solution-entities/resources/entity-profiles/entity-profile-planner-rules.md` (ambiguous cases: asset attributes, indoor positioning, customer hierarchy).
- **Relations** — `@/Users/steffensenchyna/.thingsboard/resources/prompts/solutions/solution-entities/resources/relations/entity-relations.md` (no self / no user-to-user, distinct-types rule, geofence-zone special case, cardinality defaults) and `@/Users/steffensenchyna/.thingsboard/resources/prompts/solutions/solution-entities/resources/relations/entity-relations-generation.md` (when to skip relations, tenant-only user visualization).

## The architecture overview

Write `<workdir>/design/architecture-overview.md` from your mode's source (above) as one markdown document following the template below. Section **headings** and **order** are fixed (downstream readers match H1/H2/H3 literally); section **contents** follow the per-section rules. This template and its per-section rules are the shared contract every mode shapes the overview to.

### Template

```markdown
# <Solution Name>

## Summary

<2–4 sentences describing what the solution does. May extend the user's stated scope with inferred context but must not contradict it.>

## User Requirements

<One bullet per cross-cutting parameter the user specified (timings, thresholds, intervals, severities, demo durations). Phrase each as: **scope** — **value** (user stated). **Affects:** which downstream stages must honor it. When the user stated nothing cross-cutting, write `_(none — defaults apply)_`.>

## Device & Asset Profiles

### <Profile Name 1> (DEVICE | ASSET)

Telemetry:
- <key> — <dataType>, <units>, <min>–<max>[, enum: v1|v2|…][ (derived: <CFName>)]

Attributes:
- <key> — <dataType>[, <units>][, allowed: …]

### <Profile Name 2> (DEVICE | ASSET)

<…>

## Customers & Users

<One short paragraph: tenant-only vs customer hierarchy, plus sub-customer depth if used.>

### Customer Groups

| Name | Parent | Description |
|---|---|---|
| <exact customer group name> | Tenant \| <parent customer group name> | <one-line role/purpose> |

### User Groups and Roles

| Name | Scope | Permissions | Description |
|---|---|---|---|
| <exact user group name> | Tenant \| <customer group name> | CRUD \| RU \| R | <one-line role/purpose> |

## Relations

<Prose covering every structural parent-child link with direction and cardinality (1:1, 1:M, M:M). Be explicit about which side is parent and which is child.>

## Metrics

- `<CFName>` on `<Profile>` — **type:** <math|script|ts-aggregation|related-aggregation|propagate|geofencing|delta>; **inputs:** <key(s)>; **output:** <key>; **calculation:** <short natural-language description of what it computes>.

## Alarms

- `<AlarmName>` on `<Profile>` — <severity>: <condition with explicit thresholds>[; <severity2>: <condition2>]; **clear:** <clear condition>.

## Demo Entities

| Profile | Count | Customer Group |
|---|---|---|
| <exact profile name> | <N> | <customer group name or —> |
```

### Per-section authoring rules

**Headings.** Keep every H1 / H2 / H3 heading exactly as shown. Order is fixed. Downstream consumers match these literally.

**Summary.** 2–4 sentences. May extend the user's scope with inferred context; must not contradict it.

**User Requirements.** One bullet per cross-cutting parameter the user explicitly stated — timings (telemetry frequency, alarm windows, demo span, schedule cadence), thresholds, severities, retention spans, units. Format: **scope — value (user stated). Affects:** downstream stages. This section is the contract downstream stages read and respect; it **overrides** every documented default here. If the user stated nothing cross-cutting, write `_(none — defaults apply)_`. Do not invent requirements.

**Device & Asset Profiles** (folds in `entity-profiles.md` + planner rules). One `### <Profile Name> (DEVICE | ASSET)` subsection per profile; the H3 suffix decides device vs asset (apply the device-vs-asset rule). The profile name (heading minus suffix) is canonical — every other reference matches it byte-for-byte.

- Group each profile's keys under **`Telemetry:`** (TIMESERIES) and **`Attributes:`** sub-lists — this classification is load-bearing (CF argument scope, attribute generation, alarm key resolution) and must be explicit. Apply the TIMESERIES-vs-ATTRIBUTE, `dataType`, and `classifier` rules from `entity-profiles.md`; infer `min`/`max` via its Telemetry Value Constraints when unstated. For asset keys with no clear signal, prefer Attributes — assets are typically configured, not instrumented. For enum keys, list allowed values.
- **List the complete key set in one pass, including derived (calculated-field output) keys.** A derived key appears in its owning profile's `Telemetry:` (or `Attributes:`) list annotated `(derived: <CFName>)` so emulators know to skip it and downstream stages see the final key set. Raw keys carry no annotation.
- **Exclude Reserved Entity Fields** (`name`, `label`, `email`, `address`, …) — the platform owns them on the entity record.
- **Indoor-position cascade.** If a child profile carries indoor-position keys (`xPos`/`yPos`, `positionX`/`positionY`, analogues), add a floor-plan attribute (`floorPlan`, `facilityPlan`, …) to the parent container profile.

**Customers & Users.**

- The paragraph states tenant-only vs customer-hierarchy in one sentence; mention sub-customer depth if used.
- **Customer Groups** table: `Parent` is `Tenant` for top-level, or the exact name of another customer group for sub-customers (chains allowed, cycles not). For tenant-only solutions, a single row `— | — | (none — tenant-only)`.
- **User Groups and Roles** table — each row is a user group with its IAM role; `entities-planner` reads this table directly, so there is no separate roles artifact. Rules:
  - **One role per user group** — no merging or splitting. The role's name and its `userGroup` both match the row's `Name`.
  - `Scope` is `Tenant` or the exact customer group name.
  - `Permissions` is exactly one of `CRUD` / `RU` / `R`: tenant-level administrator → `CRUD`; customer-level operational roles (manager, supervisor, dispatcher, operator) → typically `RU`; view-only roles (viewer, observer, reader) → `R`; prefer `RU` over `R` when uncertain.
  - **Exactly one** row is a tenant-level administrator (`Scope = Tenant`, `Permissions = CRUD`), typically named `solutionAdministrator` or similar.
  - `Description` is 1–2 human-readable sentences on who uses the role and its access level — do not reference devices, assets, dashboards, or other features.

**Relations** (folds in `entity-relations.md` + generation rules). Prose, one statement per structural parent–child link. State direction (which side is parent) and cardinality explicitly.

- **Cardinality** defaults to `1:M` unless the relationship is explicitly singular (`1:1`).
- **Distinct types.** When a parent has multiple distinct child profiles, name each link distinctly (`BuildingHasEnergyMeter` + `BuildingHasWaterMeter`, not two `Has`). Geofence zones split by type use `[Parent]To[Child]` form (`FleetToAllowedZone`). A parent with a **single** child profile may use a plain `Contains` / `[Parent]Has[Child]` — the distinct-naming rule applies only when a parent has multiple distinct child profiles.
- **No self-relations, no user-to-user, no user→device/asset** when the solution uses customer hierarchy. **Tenant-only user visualization:** when there are no customer groups, state USER→top-level DEVICE/ASSET links per `entity-relations-generation.md`.
- **Customer → scope-asset (required).** For every device/asset profile that is customer-scoped (owned by a customer per the Demo Entities table), state a `Manages` link: parent = the customer group, child = the scoped profile, cardinality `1:1` (the dashboard `currentCustomer` alias walks this at runtime). Disambiguate to `[CustomerGroup]Manages[Profile]` when one customer manages multiple distinct scoped profiles.
- **Skip-structural escape hatch.** If the solution is "no hierarchy / single device / directly owned by tenant," omit structural relations (the tenant-only user-visualization rule still applies).
- Only structural, persistent parent–child links belong here — a transient "vehicle currently inside zone" is a geofencing metric, not a relation.

**Metrics** (folds in the per-type metric docs). One bullet per calculated field, leading with the CF name in backticks. State **type**, **inputs**, **output** key, and a natural-language **calculation** — enough for `cf-generator` to render the implementation.

- **Type selection by intent:** "average/min/max/sum over a window" → `ts-aggregation`; "rate / consumption since last reading" → `delta`; "rollup from child entities" → `related-aggregation` (1:N) or `propagate` (1:1 child); expression / "if x then y" → `math` (pure expression) or `script`; "in/out of zone" → `geofencing`.
- **Telemetry cadence floors** (devices report every 30 min, 7 days demo = 48 ticks/day, 336/week): `ts-aggregation` windows ≥ 30 min (prefer HOUR/DAY/WEEK); `delta`/rolling windows use 45 min; `related-aggregation` dedup ≥ 30 min. If a user requirement or bullet implies a shorter window, raise it to the nearest valid value and note it in the bullet.
- **One operation per metric.** Never combine counters, never embed an aggregation inside a delta. Chain instead (`delta → ts-aggregation` for cumulative counters; `math/script → ts-aggregation → related-aggregation` for compute-then-rollup). `related-aggregation` walks direct children only — chain one metric per level for multi-level rollups.
- **1:1 vs 1:N:** for a 1:1 child relationship use `propagate` on the child; for 1:N use `related-aggregation` on the parent.
- Every input key a metric references must already exist on the target profile (raw) or be the output of an earlier metric. If a metric introduces a new raw input or an output key, make sure that key appears in the owning profile's key list (outputs annotated `(derived: <CFName>)`).

**Alarms** (folds in `alarm-capabilities.md`). One bullet per alarm, leading with the alarm name in backticks. State severity level(s) with explicit condition thresholds and a clear condition.

- Condition keys must exist on the target profile (raw or derived). Reference only: static values (`temperature > 30`), source-entity attributes (`speed > maxSpeedLimit`), or customer attributes — **never** parent-entity attributes.
- **Multi-severity:** list severities in descending order (CRITICAL → MAJOR → MINOR → WARNING → INDETERMINATE), each with its own threshold.
- **Clear condition** with hysteresis (e.g. `temperature <= 25` clears `> 28`/`> 35`); infer a value below the lowest trigger when unstated.
- **Cross-profile shorthand:** when the same alarm applies to several profiles (e.g. `LowBattery` on every battery device), name all owning profiles in the bullet — `generate-alarms` fans it out into one rule per profile. Do not duplicate the bullet.
- **Duration-alarm cadence floors:** never phrase a duration alarm below 30 min (offline/inactivity ≥ 60 min). "K consecutive readings" = K × 30 min. Raise sub-floor durations to the nearest valid value and note it.
- Set propagation when the alarm should propagate up a relation.

**Demo Entities.** The single source of truth for instance counts across ALL profile kinds — DEVICE, ASSET, CUSTOMER, and user groups all appear. `entities-planner` parses this table.

- `Profile` matches a profile name byte-for-byte (a `### <Profile>` heading, or a `### Customer Groups` / `### User Groups and Roles` table Name).
- `Count` defaults: DEVICE/ASSET 1–5 (pick the smallest count that demonstrates the pattern); CUSTOMER 1; USER 1. Override per the "User and design needs override defaults" rule.
- `Customer Group` column: exact customer group name for customer-scoped rows; `—` for tenant-scoped. For CUSTOMER rows it must match the customer group's `Parent` (`—` when Parent = Tenant); for USER rows it must match the profile's `Scope`.
- Customer-scoped Count is **per customer instance** (a `District | 5 | DistrictCustomer` with DistrictCustomer Count 3 → 15 districts total). Tenant-scoped DEVICE/ASSET Count is the **literal total**, distributed across structural parents by the relation (`Van | 9 | —` with `Fleet | 3` → 9 vans total, 3 per fleet via the 1:M relation). Tenant-scoped USER Count is the literal total.

Author the Demo Entities table early — it is the canonical demo-dataset source and the rest of the document must not contradict it.

Emit narration: `▸ architecture overview written`.

## Extension add-on (only when `extension-enabled=true`)

Orthogonal to the mode — after the overview is written (fresh, extract, or revise), `Read` `references/extension-design.md` and follow it: design the extension surface, write `extension-design.json`, and fold its custom roles into the User Groups and Roles table.

## Return

Print one summary line, then continue in the same turn (the orchestrator's approval gate reads the overview and presents it):

```
design saved to <workdir>/design/architecture-overview.md[ + extension-design.json]
```

Include `+ extension-design.json` only when `extension-enabled=true`.
