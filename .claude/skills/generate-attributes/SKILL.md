---
name: generate-attributes
description: "Saves realistic static ATTRIBUTE-type key values onto already-created devices and assets. Scans the solution's device/asset files, then dispatches one attribute-values-generator subagent per profile in parallel — each worker invents per-instance values and calls `tb attributes save`. Run after `generate-entities` completes."
user-invocable: false
---

# Generate Attributes

Thin dispatcher. The skill does the scanning + per-profile context extraction; one `attribute-values-generator` subagent per profile (in parallel) does the AI call for template values, per-instance variation, and the actual `tb attributes save` calls.

## Inputs from the orchestrator

- `solution` — solution slug.
- `workdir` — absolute path to the solution directory. Treat as **opaque** — do not re-derive from `solution`. Must contain `design/architecture-overview.md` (the single design artifact).

## Existing-aware by design (no mode flag)

One flow serves fresh builds and updates — Step 2.5 diffs each entity's already-populated attribute keys against its profile's definitions, so callers (`create-solution` Step 3, `update-solution` §3.4) dispatch this skill identically with no mode flag:

| Situation on disk | Behavior |
|---|---|
| **Fresh build** — entities carry no `SERVER_SCOPE` values yet | Every profile attribute key is dispatched for every entity. |
| **Incremental update** — some keys already populated (entities pulled from the instance, or a new key folded into an existing profile) | Step 2.5 dispatches only each entity's missing keys (`profileKeys - existingKeys`); values already present are never overwritten. |
| **Fully populated** — no entity is missing any key | Print the skipped-profile lines and the zero totals line; return without dispatching. |

The per-entity `keysToSave` contract carries this through to the worker: `attribute-values-generator` saves **only** the keys listed for each entity, never the full profile set.

## Step 1 — Check for ATTRIBUTE keys

Read `$workdir/design/architecture-overview.md`.

For each `### <Profile> (DEVICE|ASSET)` subsection, read its `Attributes:` sub-list — these are the profile's ATTRIBUTE keys (the agent's `attributeKeys` brief input), each with the `dataType`/`units`/range/enum stated on its line.

If **no profile** has any `Attributes:` keys, skip the rest of the skill (print nothing, return to caller).

## Step 2 — Build the entity list (one scan)

In a single parallel batch, `Read` everything the dispatch needs:

- All `solutions/<solution>/device-profiles/*.json` → map `profileId → profileName` from each file's `entity.id.id` and `entity.name`.
- All `solutions/<solution>/asset-profiles/*.json` → same map for asset profiles.
- All `solutions/<solution>/devices/*.json` → for each: `entity.id.id`, `entity.name`, `entity.deviceProfileId.id`, **and the full `entity.attributes.SERVER_SCOPE` object (defaulting to `{}` when absent)**; resolve `profileName` via the device-profile map; record `{entityType: "DEVICE", id, name, profileName, existingKeys}` where `existingKeys` is the set of keys already present in `SERVER_SCOPE`.
- All `solutions/<solution>/assets/*.json` → same for assets, including `existingKeys`.
- `$workdir/design/architecture-overview.md` — parent zone/asset names (the `## Relations` prose links where the profile is the child); customer name + site context for the AI prompt anchoring (the **Customers & Users → Customer Groups** table: `customerName` = the `Name` cell of the first data row, empty string if only the `(none — tenant-only)` placeholder; plus any geographic/site hint from the Summary section).

If `solutions/<solution>/devices/` and `solutions/<solution>/assets/` are both empty or missing, stop and report: "No entities found in solution — generate-attributes cannot run."

For each profile with ATTRIBUTE keys, group the discovered entities by `profileName` and assign each entity a 1-based `index` in discovery order. Extract `parentZoneName` (the parent in `entityRelations` for this profile, or empty string), `customerName`, and `siteName` from the loaded design files.

## Step 2.5 — Filter to missing keys only

This step implements the existing-aware contract above — it is what makes the skill safe to run after `pull-solution` (which embeds existing attributes server-side) and after a partial re-design that folds a new attribute key into an existing profile. The skill must never overwrite values already present on entities.

For each profile with ATTRIBUTE keys:

1. Let `profileKeys` = the set of attribute key names from the profile's `attributeKeys` definitions.
2. For each entity grouped under this profile, compute `keysToSave = profileKeys - existingKeys` (set difference — keys defined on the profile that are NOT already populated on this entity's file).
3. **Drop** every entity whose `keysToSave` is empty.
4. After the per-entity filter, if **no entity remains** for this profile, drop the profile from the dispatch list entirely (log `profile <profile>: skipped — all entities already populated` once in the final summary).
5. Otherwise, compute `attributeKeysFiltered` = the union of `keysToSave` across the surviving entities, intersected with the profile's `attributeKeys` definitions (preserves each key's `dataType`, `classifier`, `enumValues`, `units`, `minValue`, `maxValue`). This is what the agent receives — the AI template call only needs to invent values for keys that at least one entity is missing.

If every profile is dropped at step 4, print the skipped-profile lines and the totals line (`attributes total: 0 entities, 0 total keys, 0 errors`), then return without dispatching any agents.

## Step 3 — Dispatch one agent per profile in parallel

In **one assistant message**, emit one `Agent` tool call per **surviving** profile from Step 2.5 (≥1 entity with ≥1 missing key). Subagent type: `attribute-values-generator`, `description="generate attribute values"`. Each brief contains:

- `solution`: the slug
- `profile`: profile name
- `entityType`: `DEVICE` or `ASSET`
- `attributeKeys`: `attributeKeysFiltered` from Step 2.5 (only keys at least one surviving entity is missing — inline JSON array of `{key, dataType, classifier, enumValues, units, minValue, maxValue}`)
- `entities`: the surviving entity list with per-entity missing keys (inline JSON array — `{id, name, index, keysToSave}` where `keysToSave` is the entity's missing-key list from Step 2.5)
- `parentZoneName`: string (or empty)
- `customerName`: string (or empty)
- `siteName`: string (or empty)

The agent picks the floor plan filename itself (only if its `attributeKeys` includes an image/floorPlan key) — the skill does not.

Wait for every agent to return. Each returns a block:

```
attributes: <entityType> <uuid> (<name>): <N> keys saved
attributes: <entityType> <uuid> (<name>): ERROR — <message>
profile <profile>: <D> entities, <K> total keys, <E> errors
```

## Step 4 — Aggregate

Print every agent's block verbatim, then a global totals line and return (counts are this run's net-new key saves — values already on disk were filtered out in Step 2.5):

```
attributes total: <E> entities, <K> total keys, <Err> errors (net-new only)
```

Where `<E>`, `<K>`, `<Err>` are sums across all profile blocks.

If `<Err> > 0`, append: `attribute errors logged above.`
