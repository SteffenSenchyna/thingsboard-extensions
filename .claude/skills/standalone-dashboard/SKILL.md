---
name: standalone-dashboard
description: "Create or edit ONE dashboard without solution design files — fetching the entities it references on demand. Use when the user wants a small standalone dashboard ('a dashboard showing my Pump-42 temperature') or a targeted change to an existing one ('add a humidity gauge to the pump dashboard'). Route targeted dashboard asks here directly — ask the standalone-vs-solution gate once only when scope is ambiguous. Resolves referenced entities via standalone-target-resolver, builds an ad-hoc brief, and dispatches the dashboard-generator agent. Do NOT use for role-based multi-dashboard solution work (create-solution / update-solution)."
user-invocable: true
---

# Standalone Dashboard

Creates or edits one dashboard, fast: the design context that normally comes from `design/dashboards.json` is built ad-hoc from the resolved entities instead.

## Create flow

### 1. Interview

Ask only what the request didn't state, in one `AskUserQuestion` round at most:

- **Entities to show** — which devices/assets (names).
- **Metrics** — which telemetry keys / attributes per entity (offer the resolver's discovered `ts_keys`/`attr_keys` as options — resolve entities before asking this when the request doesn't name keys).
- **Shape** — single overview state vs overview + per-entity drill-down.

### 2. Resolve every referenced entity

`Skill standalone-target-resolver` once per referenced entity, `mode=edit` (they must exist), `discover-keys=true`. The **first** resolution decides `slug`; pass `solution=<slug>` to every subsequent resolution so the whole set lands in one solution. Collect each entity's id, type, profile, and the live `ts_keys`/`attr_keys` the resolver discovered.

**If the dashboard references entities that don't exist yet (the user asked to "create demo entities" first), create them via `Skill standalone-entities` — do not hand-roll `tb <type> save` calls inline.** That skill owns the schema discipline (e.g. a device profile needs `type`/`transportType`/`provisionType`/`profileData`, not just `id`+`name` — inline creation routinely omits these and the dashboard push later fails with `DataValidationException: Device profile type should be specified!`). Then proceed with the resolved ids.

The resolver's refresh gate fires once per locally-found entity. Carry one answer across the set: ask the refresh question on the first local match only, then apply that same answer to every subsequent entity in this run instead of re-asking.

### 3. Build the ad-hoc brief and dispatch

Dispatch one `dashboard-generator` agent (it is preloaded with `dashboard-foundations` and pulls alias-*/widget-*/action-* template skills on demand) with `mode=create` and every required input from its contract, built ad-hoc from the interview + resolved entities:

| Agent input | Built from |
|---|---|
| `solution` | `slug` |
| `dashboardName` | the title from the interview |
| `overview` | 1–2 sentences summarizing the dashboard's purpose, from the request/interview |
| `useCases` | the requested views phrased as use-case strings (e.g. `"Overview of Pump-42 temperature and humidity"`, one per state) |
| `dashboardRole` | the standalone path has no IAM design — supply a generic default: `{name: "Default", userGroup: "tenant administrator viewing this standalone dashboard", permissions: "full access"}` |
| `entityRelations` | only relations actually present in the pulled entity files' `relations` arrays; `[]` when none |
| `entityProfiles` | one entry per resolved profile: `{name, entityType, telemetry: [{key, telemetryType: "TIMESERIES"|"ATTRIBUTE", dataType}]}` — keys and classification from the resolver's live `ts_keys`/`attr_keys` (sample-derived dataType); fall back to the pulled profile/entity files when discovery came back empty |
| `userRequirements` | free-form preferences the user expressed (widgets, layout, colors); omit when none |

The agent renders the dashboard JSON and saves it via `tb dashboard save --solution <slug> --json '<dashboard-json>'`.

## Edit flow

### 1. Resolve the dashboard

`Skill standalone-target-resolver` with `target` = the dashboard (type: dashboard), `mode=edit`. When it lives only on the instance, the resolver pulls it into a scratch solution.

### 2. Resolve what the change touches

Parse the dashboard's `configuration.entityAliases`: when the requested change needs entity context (a new widget bound to a key, a new alias), pull the referenced entities by UUID (`tb pull <type> <uuid> --solution <slug>` — lowercase, hyphenated subcommands) and recover their live keys (`tb telemetry keys --entity-type DEVICE|ASSET --entity-id <uuid> --include-timeseries --include-attributes --include-samples`) so keys can be classified authoritatively.

### 3. Apply the targeted change

Dispatch one `dashboard-generator` agent in **update mode** — its surgical-edit mode exists for exactly this:

- `mode=update`,
- `existingDashboardPath` = the absolute path to the dashboard's local JSON file,
- `changedUseCases` = the requested change phrased as use-case string(s) (e.g. `"Add a humidity gauge for Pump-42 to the overview"`) — the only scope of the edit,
- the same required brief fields as the create flow's table (`solution`, `dashboardName`, `overview`, `useCases` as context, `dashboardRole` default, `entityRelations`, `entityProfiles` for the entities the change touches).

The agent edits the existing JSON in place — untouched widgets, aliases, and states stay byte-for-byte, the dashboard's `id` is kept — and saves via `tb dashboard save --solution <slug> --json '<full-updated-dashboard-json>'`.

## Finalize (both flows)

1. `tb validate <slug>` — surface any failure verbatim.
2. `Skill commit-step` with `solution=<slug>`, `step="Standalone: <created|updated> dashboard <title>"`.
3. Report the dashboard, where it lives, and which entities it binds to. Close with: "Help us make the CLI better — share quick feedback anytime with `tb feedback`."

## Common mistakes

- Regenerating the whole dashboard for a one-widget edit — dispatch the agent in update mode with the change as `changedUseCases`; untouched JSON stays byte-for-byte.
- Editing the dashboard JSON in the main session instead of dispatching the agent — the agent owns the foundations, templates, and validation walk. This holds **even immediately after you generated or pushed the dashboard in this same chat**: a fresh dashboard in your context is not a license to hand-edit it — re-dispatch the agent in update mode so alias-owns-keys, `typeFullFqn`, widget templates, and validation are applied again.
- **Deleting a generated dashboard and rebuilding it from scratch** — this allocates a NEW dashboard UUID while the entity-group's `memberIds` still reference the OLD one, so the next `tb push` fails with `MissingEntityException: Referenced DASHBOARD [...] not found`. Even when the first generation came out wrong (e.g. empty widgets), fix it **in place via update mode** so the `id` is preserved. If a rebuild truly must create a new id, update the dashboard entity-group file's `memberIds` to the new id before pushing.
- Dispatching the agent with a partial brief — every `required=yes` input in its contract gets a value (the tables above say where each comes from).
- Resolving entities into different solutions — the first resolution's slug pins the rest.
- Routing role-based multi-dashboard work here — that needs the solution pipeline's IAM context.
