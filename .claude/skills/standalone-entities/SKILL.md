---
name: standalone-entities
description: "Create or edit one or several plain entities — devices, assets, customers, users, device/asset profiles, or entity groups — without solution design files. Use when the user wants targeted entities ('create one test device', '2 devices for the water-pump profile', 'rename my customer Acme', 'add a user for the east site'). Route targeted entity asks here directly — ask the standalone-vs-solution gate once only when scope is ambiguous. Creates a missing profile alongside new devices/assets; offers attributes + emulators for devices. Do NOT use for calculated fields, alarm rules, or dashboards (dedicated standalone-* skills exist) and not for designed multi-entity systems (create-solution / update-solution)."
user-invocable: true
---

# Standalone Entities

Creates or edits one or several plain entities, fast. Follows the project CLAUDE.md "Single-entity generation flow" reference (`-H` schema → UUID → `tb <type> save --json`), applied per entity, inside a solution directory chosen by the resolver.

Covered types: device, asset, customer, user, device-profile, asset-profile, entity-group.

## Flow

### 1. Resolve the target(s)

`Skill standalone-target-resolver` with `mode=create` for new entities / `mode=edit` for changes to existing ones. Resolve once per distinct target:

- **N new instances of one profile** ("2 devices for the water-pump profile") → resolve the **profile** once (`mode=edit` — it must exist, locally or on the instance); the instances are then created against it. One resolution covers the whole batch.
- **Several unrelated entities** → one resolution each; the **first** decides `slug`, pass `solution=<slug>` to the rest so everything lands in one solution. The resolver's refresh gate fires once per locally-found target — ask on the first local match only and carry that answer to the rest.

Receive per target: `slug`, `workdir`, and — in edit mode — `parent_file` + `entity_id`/`entity_type`.

### 2. Create mode

1. **Solution exists**: when the resolver returned a fresh slug (new target, nothing pulled), run `tb solution new <slug>` first — skip if the directory already exists.
2. **Schema**: `tb <type> save -H` (once per type per session — one read covers the whole batch).
3. **Profile first** when new devices/assets name a profile that doesn't exist locally or on the instance: generate the profile UUID, save the profile, then reference it from every instance.
4. **Generate all UUIDs upfront**, one per entity, and give batch instances distinct realistic names (`Pump-43`, `Pump-44`, … — continue the user's naming pattern when one exists):

```bash
PROFILE_ID=$(python3 -c "import uuid; print(uuid.uuid4())")
tb device-profile save --solution <slug> --json "{\"id\": {\"entityType\": \"DEVICE_PROFILE\", \"id\": \"$PROFILE_ID\"}, \"name\": \"<profile-name>\", \"type\": \"DEFAULT\", \"transportType\": \"DEFAULT\", \"provisionType\": \"DISABLED\", \"profileData\": {\"configuration\": {\"type\": \"DEFAULT\"}, \"transportConfiguration\": {\"type\": \"DEFAULT\"}, \"provisionConfiguration\": {\"type\": \"DISABLED\", \"provisionDeviceSecret\": null}}}"
for NAME in <name-1> <name-2>; do
  ENTITY_ID=$(python3 -c "import uuid; print(uuid.uuid4())")
  tb device save --solution <slug> --json "{\"id\": {\"entityType\": \"DEVICE\", \"id\": \"$ENTITY_ID\"}, \"name\": \"$NAME\", \"deviceProfileId\": {\"entityType\": \"DEVICE_PROFILE\", \"id\": \"$PROFILE_ID\"}}"
done
```

- **A device profile needs more than `id` + `name`.** Include `type: "DEFAULT"`, `transportType: "DEFAULT"`, `provisionType: "DISABLED"`, and the `profileData` block shown above. Saving just `{id, name, description}` validates locally but **fails on `tb push`** with `DataValidationException: Device profile type should be specified!`. (Asset profiles, by contrast, are fine with just `id` + `name`.)
- (When the profile already exists — resolved in §1 — skip the profile save and use its `profile_id`.)

5. **Devices — one optional extras question for the whole batch** (`AskUserQuestion`, multiSelect): `Server attributes` (then `tb attributes save DEVICE <uuid> --solution <slug> --json '<values>'` per device, varied realistic values) · `Demo telemetry emulators` (then `tb emulator add --entity-type DEVICE --entity-id <uuid> --solution <slug> --days 7 --json '<telemetry-profiles>'` per device, per the project CLAUDE.md emulator reference). Ask once; apply the answer to every device created this run. Skip the question entirely when the user already said what they want.
6. **Users** get realistic synthetic identities: human first/last name and `<first>.<last>-<slug>-<n>@<slug-themed>.com`.

### 3. Edit mode

Per entity being edited:

1. Read `parent_file`'s entity JSON.
2. Apply exactly the requested field changes — keep `id` and every untouched field byte-for-byte.
3. Save with the same `tb <type> save --solution <slug> --json '<full-updated-json>'`.

### 4. Finalize

1. `tb validate <slug>` — surface any failure verbatim.
2. `Skill commit-step` with `solution=<slug>`, `step="Standalone: <created|updated> <N> <type>(s) <names>"`.
3. Report every entity with its ID, where they live, and — when emulator tasks were added — that deployment needs `tb push <slug> --run-tasks`. Close with: "Help us make the CLI better — share quick feedback anytime with `tb feedback`."

## Common mistakes

- Inventing UUIDs by hand — always `python3 -c "import uuid; print(uuid.uuid4())"`, one fresh UUID per entity.
- Writing JSON files directly — every save goes through `tb <type> save --json`.
- Regenerating the id (or dropping fields) when editing — load the existing JSON and change only what was asked.
- Resolving the profile once per instance in a batch — one profile resolution covers all its new instances.
- Asking the extras question per device — ask once for the batch.
- Placeholder emails on `@thingsboard.io` / `@thingsboard.com` — synthetic users get solution-themed domains.
