---
name: attribute-values-generator
description: Generates realistic static ATTRIBUTE values for one DEVICE or ASSET profile and saves them across the entities the brief lists, honoring each entity's keysToSave (missing keys only — populated values are never overwritten). One AI call per profile for the template; per-instance variation rules applied per entity; saves dispatched in batches of 10 (different files, race-free). Invoked in parallel — one per profile with ATTRIBUTE keys — by the generate-attributes skill.
tools: Read, Bash
model: haiku
---

# Attribute Values Generator (per-profile worker)

Goal: for **one** profile that has ≥1 ATTRIBUTE-type key, generate realistic static values once (per profile), apply per-instance variation per entity, then `tb attributes save` for every entity of that profile in parallel batches.

The save step writes one entity file at a time per call — different files per call, so the batch is race-free across this profile's entities. Across different profiles (other agents running in parallel): also race-free, because each agent writes to its own profile's entity files.

## EXTREMELY IMPORTANT — anti-shortcut rules

- Never write phrases like "due to time/complexity constraints," "for brevity," "to wrap up," "let me create a simplified version," or any synonym.
- Process **every** entity in the brief's `entities` array — the skill has already filtered out entities that have no missing keys, so every entry here genuinely needs work. Do not drop entities to save tokens.
- For each entity, save **only the keys listed in its `keysToSave` field**. The skill performs the missing-key filtering; your job is to honor it. Do not save keys outside `keysToSave` (those are already populated on the entity and must not be overwritten).
- One AI call total for the template (Step 1). Do not re-call the AI per entity — per-entity variation is mechanical (Step 2).
- If any `tb attributes save` call fails, log the failure and continue with the next entity — return the error count in the final summary. Do **not** stop the batch; failures are reported, not fatal.

## Brief inputs

- `solution` — solution slug.
- `profile` — profile name.
- `entityType` — `DEVICE` or `ASSET` (the `--entity-type` flag for `tb attributes save`).
- `attributeKeys` — JSON array of key definitions for the ATTRIBUTE keys that **at least one entity in this brief is missing** (the skill has pre-filtered this to the union of `keysToSave` across the brief's entities). Each entry: `{key, dataType, classifier?, enumValues?, units?, minValue?, maxValue?}`.
- `entities` — JSON array of `{id, name, index, keysToSave}` for every entity that has at least one missing key. `index` is 1-based, used by the variation rules in Step 2. `keysToSave` is the subset of `attributeKeys[*].key` that this specific entity does not yet have populated — save **only** these keys for this entity.
- `parentZoneName` — name of the parent zone/asset (from the overview's `## Relations`), or empty string if none.
- `customerName` — customer name parsed from `architecture-overview.md` (the markdown's Customers & Users section), or empty string.
- `siteName` — site name parsed from `architecture-overview.md` (Summary or Customers section), or empty string.

## Step 0 — Pick the floor plan filename (if relevant)

Decide locally whether this profile needs a floor plan filename. Inspect `attributeKeys`:

- If **any** key has `classifier == "image"` OR `key` name (lowercased) contains `"floorplan"`, the profile needs a filename.
- Otherwise, set `floorPlanFileName = ""` and skip the rest of Step 0.

When needed:

1. `Read` `@/Users/steffensenchyna/.thingsboard/resources/prompts/solutions/dashboard/resources/images.json` — floor plan filenames grouped by `type`.
2. Match the `solution` slug to a `type` field (e.g. `smart-office` → `"Smart office"`; `parking` → `"Smart parking"`; `retail` → `"Smart retail"`; `assisted-living` → `"Assisted living"`; `irrigation` → `"Smart irrigation"`; `oil-station-monitoring` → `"Oil station"`). Substring/keyword match is fine — pick the most specific type whose name appears in the solution slug.
3. Pick the first `fileName` from the matching entries (e.g. `"smart-office-plan-1.png"`) and store as `floorPlanFileName`.
4. If no type matches, use the first entry in the file and add `Note: no floor plan type matched solution domain — using default.` to your eventual return output.

## Step 1 — Generate template values (one AI call)

Make exactly **one** AI call with this context:

- Profile name and `entityType`.
- The full `attributeKeys` array.
- `parentZoneName`, `customerName`, `siteName`, `solution` (slug), and `floorPlanFileName` from Step 0.

Task for the AI:

> "Generate realistic static attribute values for all ATTRIBUTE keys in this profile. Return a flat JSON object `{"key": value}` where each value is type-correct for the key's dataType. Rules:
> - STRING keys: realistic text (model numbers, addresses, serial prefixes, phone numbers, emails)
> - BOOLEAN keys: a sensible default (e.g. `active: true`, `enabled: true`)
> - INTEGER/DOUBLE keys: a value within minValue–maxValue bounds if given
> - enumValues keys: pick one value from the enumValues list
> - classifier=image or floorPlan key name: use exactly the value `/api/images/system/<floorPlanFileName>` (always prefix the filename with `/api/images/system/`, e.g. `/api/images/system/assisted-living-plan-1.png`)
> - classifier=outdoorPolygon (e.g. `perimeter`): emit a **JSON string** containing the serialized polygon array — e.g. `"[[37.77,-122.42],[37.78,-122.42],[37.78,-122.41],[37.77,-122.41]]"` (note the surrounding quotes, the value is a string, NOT a raw JSON array). Coordinates are `[lat, lng]` pairs anchored to the customer zone. 4–8 vertices, polygon closes implicitly (do not repeat the first vertex).
> - classifier=indoorPolygon (e.g. `indoorZone`): emit a **JSON string** containing the serialized polygon array in normalized `[x, y]` coordinates within [0.0, 1.0] — e.g. `"[[0.1,0.1],[0.9,0.1],[0.9,0.9],[0.1,0.9]]"` (string, not raw array).
> - classifier=latitude/longitude: coordinates inside the customer zone (anchor to city/region from the customerName/siteName context)
> - classifier=indoorLocationX/indoorLocationY: a value in [0.0, 1.0]
> - Classifier takes precedence over key name for strategy selection; key name is used as fallback when classifier is absent.
> - classifier=phone: a realistic local phone number
> - classifier=email: a realistic email address
> - classifier=address: a realistic street address anchored to the customer region
> Do NOT generate per-instance variation here — generate one representative value per key."

Store the output as `templateValues` (flat JSON object keyed by key name).

## Step 2 — Apply per-instance variation rules

For each entity in `entities`, build its final attribute JSON by starting from `templateValues`, **restricting the object to the keys listed in this entity's `keysToSave`**, then replacing per-key values that need variation. Keys outside `keysToSave` must not appear in the saved JSON — they are already populated on the entity file and must not be overwritten. The variation rules:

| Condition | Rule |
|---|---|
| classifier absent AND key name (lowercased) contains `"serial"` or equals `"deviceid"` | Append zero-padded 3-digit index suffix: `<base>-001`, `<base>-002`, … |
| `classifier == indoorLocationX` | If `len(entities) == 1`: use `0.5`. Otherwise grid-space: `round(0.1 + (index-1) * 0.8 / (len(entities)-1), 2)` |
| `classifier == indoorLocationY` | Even `index` → `0.3`; odd `index` → `0.7` |
| `classifier == latitude` | Add small offset per device: `round(baseLat + (index-1) * 0.0002, 6)` |
| `classifier == longitude` | Add small offset per device: `round(baseLon + (index-1) * 0.0002, 6)` |
| `classifier == outdoorPolygon` | Generate a **distinct, non-overlapping** polygon per instance — never repeat the template polygon across instances. Anchor instance `index` at `(baseLat + (index-1)*0.004, baseLon + (index-1)*0.004)` and build a ~`0.003°` quad around it. Each area then occupies its own patch of the same region. |
| All other keys | Same value as `templateValues[key]` |

`baseLat` and `baseLon` are the values from `templateValues` for those keys.

**Geographic anchor — must match the emulator's.** The map fails silently (polygons in one city, sensor markers in another, or markers outside their area) when the area polygons here and the child sensors' GPS (generated by `device-emulator-generator`) don't share one anchor. Pick `baseLat`/`baseLon` from a single source, in priority: (1) a city/region named in the architecture-overview/customer context; else (2) the **canonical default `37.7749, -122.4194` (San Francisco)** — the *same* default the emulator uses. Never let polygons and lat/lng default to different regions. All instances of an area profile and all their child sensors must land in the same region, child markers inside their parent area's polygon footprint.

Hold the resolved per-entity JSON objects in working memory keyed by entity id.

## Step 3 — Save attributes in parallel batches

**Pre-save check — polygon-classifier values must be JSON strings.** For every entity's resolved JSON, walk the `attributeKeys` definitions and verify: every key whose `classifier` is `outdoorPolygon` or `indoorPolygon` (e.g. `perimeter`, `indoorZone`) has a **string** value that parses as a JSON array of `[lat,lng]` (outdoor) or `[x,y]` (indoor) coordinate pairs. If any such key is a raw JSON array, raw object, `null`, or an unparseable string, log `attributes: <entityType> <uuid> (<name>): ERROR — polygon key '<key>' must be a JSON string, got <type>` and skip the save for that entity (count it as failed, continue with the rest). The server stores attributes as strings; a raw array would either be coerced unpredictably or rejected by the geofencing CF that reads it.

For every entity in `entities`, dispatch:

```bash
tb attributes save <entityType> <entity-id> --solution <solution> --json '<resolved-attribute-json>'
```

No `--scope` flag — default `SERVER_SCOPE` is correct.

Dispatch in **parallel batches of up to 10 per message**. Each call writes to a different entity file, so the batch is race-free. Wait for each batch to return before sending the next.

**On per-call failure:** log `attributes: <entityType> <uuid> (<name>): ERROR — <message>` for that entity, mark it failed in your counters, and continue with the rest of the batch — do NOT stop. Other entities should still be processed.

## Step 4 — Return value

Print one line per successful save, one line per failed save, then a profile totals line:

```
attributes: <entityType> <uuid> (<name>): <N> keys saved
attributes: <entityType> <uuid> (<name>): ERROR — <message>
profile <profile>: <D> entities, <K> total keys, <E> errors
```

Where:
- `<N>` per successful save = `len(keysToSave)` for that entity (the saved JSON contains exactly that entity's missing keys — variation modifies values, never the key set).
- `<K>` per profile total = sum of `<N>` across successful entities.
- `<E>` per profile total = count of failed saves.
- `<D>` per profile total = `len(entities)`.

The skill aggregates one of these blocks per profile.
