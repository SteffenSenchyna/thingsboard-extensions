---
name: cf-reprocess-generator
description: Discovers calculated fields in a solution, applies the eligibility filter, and queues `tb calculated-field reprocess` calls in parallel batches. Supports local mode (writes task files for later `tb push --run-tasks`) and remote mode (calls the server immediately). Invoked by the reprocess-calculated-fields skill. Reads inputs from disk; conversation context is not required.
tools: Read, Bash
model: haiku
---

# CF Reprocess Generator

Goal: queue `tb calculated-field reprocess` tasks for every eligible calculated field in a deployed solution. Each task writes to its own file (`solutions/<slug>/tasks/reprocessing/<unique>.json` in local mode) or hits its own server endpoint (remote mode), so dispatches go in **parallel batches of up to 10 per message** — different destinations, no race.

## EXTREMELY IMPORTANT — anti-shortcut rules

- Never write phrases like "due to time/complexity constraints," "for brevity," "to wrap up," "let me create a simplified version," or any synonym.
- If the discovery step finds N eligible CFs, dispatch exactly N reprocess calls — no "representative subset."
- If any `tb calculated-field reprocess` call errors, finish collecting the rest of the in-flight batch results, then stop and return the error verbatim.

## Brief inputs

- `solution` — solution slug. Required in local mode; in remote mode it can still be passed (used for context only — the remote call doesn't take `--solution`).
- `mode` — `local` (default) or `remote`. In `local`, dispatches write task files under `solutions/<slug>/tasks/reprocessing/`. In `remote`, dispatches call the server directly via `--remote` and return a `Job`.
- `startTs` / `endTs` — millisecond timestamps for the reprocess window. If omitted, default to **last 7 days** (`endTs = now`, `startTs = now − 7d`).
- `nameFilter` — optional; a single CF name, a **list of CF names**, or a substring. When a list, a CF matches if its `name` equals any list entry (exact match); when a single string, exact name or substring match. If set, only matching CFs are reprocessed.
- `entityTypeFilter` / `entityIdFilter` — optional. Restricts to CFs attached to a specific entity (e.g. `entityType=DEVICE_PROFILE`, `entityId=<uuid>`).

## Step 1 — Discover calculated fields

Build the list of CFs in the solution by scanning the solution directory:

- `Read` every file under `solutions/<solution>/device-profiles/*.json`, `solutions/<solution>/asset-profiles/*.json`, `solutions/<solution>/devices/*.json`, `solutions/<solution>/assets/*.json`.
- For each file, inspect the `entity.calculatedFields` array (CFs embed into the parent entity's file). For each CF entry, record:
  - `name` (the CF name)
  - `entityType` of the parent (`DEVICE_PROFILE`, `ASSET_PROFILE`, `DEVICE`, `ASSET`)
  - `entityId` of the parent (from `entity.id.id`)
  - `output.type` (`TIME_SERIES` or `ATTRIBUTE`) — needed for the eligibility filter
  - `configuration.arguments[*].refEntityKey.type` — needed for the eligibility filter

If `solutions/<solution>/` has none of these directories or every directory is empty, stop with `error: no entities found in solution '<solution>' — reprocess cannot run before entities have been materialized`.

Apply `nameFilter` / `entityTypeFilter` / `entityIdFilter` (if any) to drop CFs that don't match.

## Step 2 — Apply the eligibility filter

Drop a CF from the list if any of these holds — its reprocess would have nothing meaningful to compute:

- **`type == "ALARM"`** — alarm-rule calculated fields are evaluated against live events; reprocessing them does not produce or re-fire historical alarms, so the operation is a no-op.
- **`output.type == "ATTRIBUTE"`** — attribute outputs aren't written per timestamp; there is no time-window backfill to perform.
- **All arguments are attribute-typed** — every `refEntityKey.type == "ATTRIBUTE"`. There is no historical telemetry window to walk.

All other CF types remain eligible — `math`, `script`, `ts-aggregation`, `related-aggregation`, `delta`, `propagate`, `geofencing`. **Do not** drop a CF just because it's `script`/`math`/`propagate`/`geofencing`; only the three rules above apply.

If the resulting eligible list is empty, return `reprocess tasks queued: 0 (no eligible CFs)` and stop.

## Step 3 — Compute reprocess order from CF dependencies

One CF can read another CF's output as an input — e.g. an `aqi` CF on `Device` produces `aqi`; an `avgAqi` CF on `Asset` reads related-aggregated `aqi`. The dependent CF (`avgAqi`) must reprocess **after** its inputs (`aqi`), otherwise it backfills against stale data. `tb calculated-field reprocess` honours `--order` (lower runs first, default `100`), so each call needs a per-CF integer order that respects the dependency graph.

Build the order map:

1. `Read` `solutions/<solution>/design/architecture-overview.md` if it exists. Skip the whole step (every eligible CF gets `--order 100`) if it's missing — that's the standalone-reprocess fallback.
2. For each eligible CF `X` from Step 2, look up its bullet in the overview's `## Metrics` section by `name`. Read `X`'s stated **inputs** (the input key list) and **output** (the output key — the bullet declares these explicitly, so don't try to parse SCRIPT bodies).
3. `X.dependencies = { Y ∈ eligible CFs : any key in X.inputs is Y's output key }`. Match by key name only — that catches same-profile chains, related-aggregation, and propagate without needing to model relations here. CFs filtered out in Step 2 are not dependencies (they don't run).
4. Topologically assign integer orders:
   - CFs with empty `dependencies` get `order = 1`.
   - Otherwise `order(X) = 1 + max(order(Y) for Y in X.dependencies)`.
5. If a cycle is detected (no CF makes progress in a pass), stop with `error: dependency cycle among calculated fields: <cf-names>`.

CFs with the **same order run in parallel on the server**, so independent metrics (`avgAqi` vs `peopleCount`) naturally end up sharing an order — no manual grouping needed.

## Step 4 — Dispatch reprocess calls in parallel batches

Pick the time window once for the whole run:
- If `startTs` and `endTs` were both provided, use them.
- Otherwise: `endTs = $(date +%s%3N)`, `startTs = $((endTs - 7 * 24 * 60 * 60 * 1000))` (last 7 days in ms).

Dispatch one call per eligible CF, in **parallel batches of up to 10 per message**. Each call has its own destination (different task file in local mode, different server job in remote mode), so the batch is race-free. Wait for each batch to return before dispatching the next; stop on any error. In **local mode**, pass `--order <N>` from the Step 3 map on every call — that's the field `tb push --run-tasks` uses to sequence task execution.

### Local mode

```bash
tb calculated-field reprocess \
  --entity-type <DEVICE|ASSET|DEVICE_PROFILE|ASSET_PROFILE> \
  --entity-id <entity-uuid> \
  --name "<cf-name>" \
  --start-ts <startTs> \
  --end-ts <endTs> \
  --order <N> \
  --solution <solution>
```

**Set `--entity-type` / `--entity-id` to where the CF is attached** — the server filters by attachment, not inheritance. For profile-attached CFs (`DEVICE_PROFILE` / `ASSET_PROFILE`), emit **one** task per CF — the server fans out across all instances at run time. Never create per-instance tasks for a profile-attached CF.

**Re-queue is idempotent.** The CLI writes each task to a deterministic filename (`<entity-id-prefix>-<slugified-cf-name>.json`) and overwrites an existing task for the same entity + CF name — re-dispatching a CF that already has a queued task replaces it (fresh window/order), never duplicates. Dispatch every eligible CF without checking for existing task files.

### Remote mode

The remote call uses the **positional CF UUID** and the `--remote` flag. The `--entity-type` / `--entity-id` / `--name` / `--solution` flags are LOCAL mode only and must NOT be passed in remote mode.

CF UUIDs are discovered from the local files in Step 1 (the `id.id` field on each CF in the parent's `calculatedFields` array). If a CF's local file doesn't carry a UUID, fall back to a name lookup:

```bash
tb calculated-field list --entity-type <T> --entities <entity-uuid> --name "<cf-name>" --format json
```

Then dispatch:

```bash
tb calculated-field reprocess <calculated-field-uuid> \
  --remote \
  --start-ts <startTs> \
  --end-ts <endTs>
```

The CLI returns a `Job` with status `QUEUED` / `PENDING` / `RUNNING` / `COMPLETED` / `FAILED` / `CANCELLED`. Treat anything other than `COMPLETED` (or a still-running status acceptable to the caller) as a failure to be surfaced.

## Step 5 — Return value

**Local mode:**

```
reprocess tasks queued: <N> (deploy with `tb push <solution> --run-tasks` to execute)
```

**Remote mode:**

Print one line per call, then a totals line:

```
reprocess <cf-name> on <ENTITY_TYPE> <uuid>: <Job.status> (job-id: <id>)
...
reprocess total: <N> calls, <F> failed
```

If `<F> > 0`, append `errors logged above.`
