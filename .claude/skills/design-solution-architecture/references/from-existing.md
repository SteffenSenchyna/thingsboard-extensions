# From-existing (Extract mode + Additions)

Loaded by `design-solution-architecture` when `from-existing=true`. The architecture-overview template and per-section authoring rules in the skill body still govern how each section is shaped; this file covers only the reverse-engineering pass and the optional fold-in of requested additions.

## Extract mode — reverse-engineer from pulled entities

When `from-existing=true`, do NOT draft from interview context. The pulled entity files under `<workdir>/` are the source of truth; write the overview to mirror them faithfully. Preserve the byte-accuracy the idempotent re-push depends on — never invent entities, keys, relations, roles, or alarms that aren't present.

1. **Profiles.** Scan `<workdir>/device-profiles/*.json` and `<workdir>/asset-profiles/*.json` → one `### <Profile> (DEVICE|ASSET)` per file (name ← entity `name`).
2. **Live telemetry-key recovery.** ThingsBoard telemetry is schemaless — a profile's keys live in the timeseries store, not the JSON. For each profile, pick one representative instance (a file under `devices/`/`assets/` whose `deviceProfileId.id`/`assetProfileId.id` matches the profile) and query its live keys:

   ```bash
   tb telemetry keys --entity-type DEVICE --entity-id <instance-uuid> \
     --include-timeseries --include-attributes --include-samples
   ```

   Use `--entity-type ASSET` for asset profiles. Time-series keys → the profile's `Telemetry:` list (infer dataType/units/min/max from the sample); attribute keys → `Attributes:` (unioned with `attributes.SERVER_SCOPE`/`SHARED_SCOPE` observed across instances). Best-effort: if the query errors (entity not on the instance) or returns nothing, fall back to keys observed in the pulled instance JSON and add a note under the profile that live keys could not be recovered. One representative instance per profile is enough.
3. **Customers & users / roles.** Scan `customers/`, `users/`, `roles/`, `entity-groups/` → the Customer Groups and User Groups and Roles tables (with Permissions derived from each role's assignment: CRUD/RU/R).
4. **Relations.** Collect embedded `relations` arrays from pulled entity files → the `## Relations` prose (direction, type, cardinality). Note any relation whose target is missing locally.
5. **Metrics & Alarms.** Read embedded `calculatedFields` arrays on the pulled profiles. Entries with `type == "ALARM"` → `## Alarms` bullets; all other entries → `## Metrics` bullets (annotate their output keys as `(derived: …)` in the owning profile).
6. **Demo Entities.** One row per profile with the count of instances actually pulled.

Emit narration: `▸ architecture overview reverse-engineered`.

## Applying requested additions

If the user asked (in this conversation) to add net-new artifacts on top of the imported solution, apply them after the extract pass above: add the new profile subsections / keys / metric bullets / alarm bullets / roles / Demo Entities rows exactly as a fresh design would (per the skill body's overview contract), leaving the extracted entries byte-accurate. The extracted entries must stay faithful to the instance for idempotency; the requested additions are the only net-new content. If the user asked for nothing new, the extract result is the final design.
