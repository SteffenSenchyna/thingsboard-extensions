---
name: generate-emulators
description: "Orchestrates emulator-task generation. Groups devices by profile, filters to devices without an emulator task (or regenerates the named ones when import-emulator-opt-in=true), dispatches one device-emulator-generator Haiku subagent per profile in parallel. Each worker handles its profile's strategy selection + full strategy JSON + parallel `tb emulator add` calls across its devices. The skill aggregates results."
user-invocable: false
---

# Generate Emulators

Inline orchestrator. Builds the per-profile device list, filters it per the existing-aware rules below, then dispatches one `device-emulator-generator` subagent per profile in parallel. Each worker does Stage 1 (strategy selection), Stage 2 (full strategy JSON per key, plus per-device SEQUENCE overrides), and Stage 3 (parallel `tb emulator add` across its devices). All emulator task files write to different paths (`solutions/<solution>/tasks/emulators/<device-uuid>.json`), so saves never race — within a worker or across workers.

## Inputs

- `solution` — solution slug
- `workdir` — absolute path to solution directory (treat as opaque — do not re-derive)
- `import-emulator-opt-in` (optional bool, default `false`) — regeneration switch. When `true`, the devices in scope get their emulator task files **regenerated (overwritten)** even if a task file already exists — used by `update-solution` §3.5 after new telemetry keys were added so the tasks emit the new keys too.
- `devices` (optional, string array, only meaningful with `import-emulator-opt-in=true`) — device names that restrict the regeneration scope. When present, only these devices are processed; when absent, all devices are in scope.

## Existing-aware by design

One flow serves fresh builds and updates — Step 1.5 filters the device list against the task files already on disk:

| Situation | Behavior |
|---|---|
| **Fresh build** — no task files under `tasks/emulators/` | Every device gets an emulator task file. |
| **Incremental update** — some devices already have task files | Only devices **without** a task file get one; existing task files are never touched. |
| **Regenerate after a key change** — `import-emulator-opt-in=true` (+ optional `devices` scope) | The in-scope devices' task files are regenerated and overwritten so they emit the new keys; out-of-scope devices are untouched. |
| **Fully covered** — every device already has a task file, no opt-in | Print `No emulator changes required.` and return without dispatching. |

(Server-side idempotency is separate and unchanged: emulator tasks skip devices that already have data on the emulated keys at `tb push --run-tasks` time, so task files are safe in prod.)

## Design artifact

`<workdir>/design/architecture-overview.md` is the single design artifact and the sole source for the workers (profile keys, relations, alarm thresholds, derived-key exclusion, and GPS/User-Requirements context all live there). `workdir` is created and verified by `/create-solution` Step 1c — do not re-verify. Same for the prerequisite that `entities-generator` ran first (so `devices/` and `device-profiles/` exist).

## EXTREMELY IMPORTANT — anti-shortcut rules

- Never write phrases like "due to time/complexity constraints," "for brevity," "to wrap up," "let me create a simplified version," or any synonym.
- Dispatch one worker per **non-empty** profile group surviving Step 1.5. Skip profiles with zero surviving devices, but never skip a profile that has surviving devices.
- If any worker subagent returns an error, surface the error verbatim and stop — do not continue dispatching to other profiles or claim partial success.

## Step 1 — Build device list grouped by profile

Read the device-profile and device files that `entities-generator` materialized earlier in the pipeline:

- `Read` every `<workdir>/device-profiles/*.json` → build a map `profileId → profileName` from each file's `entity.id.id` → `entity.name`.
- `Read` every `<workdir>/devices/*.json` → for each, extract `entity.id.id`, `entity.name`, `entity.deviceProfileId.id`; resolve `profileName` via the map above; record as `{id, name, profileName}`.

Group the device records by `profileName`. Drop profiles with zero devices.

If the resulting map is empty, stop with: "No devices found in solution — generate-emulators cannot run before entities-generator has materialized devices." (Note: assets and customers are intentionally ignored — `tb emulator add` accepts `--entity-type DEVICE` only.)

## Step 1.5 — Filter the device list (existing-aware)

Apply the rules from the table above to every device record:

- **`import-emulator-opt-in=true`** → keep only the devices named in the `devices` input (all devices when the input is absent), **regardless** of whether a task file exists — their task files are intentionally regenerated.
- **Otherwise** → drop every device whose task file `<workdir>/tasks/emulators/<device-uuid>.json` already exists on disk (it was generated by a prior run; leave it untouched).

Re-group the survivors by `profileName` and drop profile groups that became empty. If **no device survives**, print `No emulator changes required.` and return — skip Steps 2–3.

## Step 2 — Dispatch one worker per profile in parallel

In **one assistant message**, emit one `Agent` tool call per surviving profile group. Subagent type: `device-emulator-generator`, `description="generate device emulators"`. Each call's brief:

- `solution`: the solution slug
- `profile`: the profile name (string)
- `devices`: the array of `{id, name}` records grouped to this profile **after the Step 1.5 filter** (inline JSON)
- `architectureOverviewPath`: `<workdir>/design/architecture-overview.md` — the single source for profile keys, relations (spatial anchor), alarm thresholds, derived-key exclusion, and GPS/User-Requirements context

The worker saves a task file for exactly the devices in its brief — `tb emulator add` writes (or overwrites) `tasks/emulators/<device-uuid>.json`, which is precisely the intended behavior for both the fresh and the regenerate paths.

Wait for every worker to return. Each worker returns a block:

```
device <uuid> (<name>): <N> keys emulated  [profile: <profile-name>]
device <uuid> (<name>): ERROR — <tb error message>
profile <profile>: <D> devices, <K> total key assignments, <E> errors
```

(One `device:` line per device + one `profile:` totals line.)

If any worker errored on dispatch (the Agent call itself failed) or returned a final-line error count > 0, surface every error verbatim and stop. Do not advance.

## Step 3 — Aggregate worker results

Print every worker's block verbatim, in order, then a global totals line (counts cover this run's generated/regenerated task files only — devices filtered out in Step 1.5 are not included):

```
total: <D> devices, <K> total key assignments, <E> errors
```

Where `<D>`, `<K>`, `<E>` are the sums across all profile blocks.

If `<E> > 0`, append:

```
errors logged above; resolve before pushing with `tb push <solution> --run-tasks`.
```

If `<E> == 0`, append:

```
emulator task files queued; `tb push <solution> --run-tasks` deploys the solution and generates demo telemetry.
emulator task files are idempotent — they skip devices that already have data on the emulated keys, so this push is safe in prod.
```
