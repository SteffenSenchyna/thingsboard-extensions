---
name: standalone-target-resolver
description: "Shared preamble for the standalone-* skills: resolves the target entity to a local solution file. Scans local solutions by name/type, asks the one consent-first refresh question when found locally, looks the entity up on the instance and pulls a minimal set (entity + profile) into an auto scratch solution when not. On discover-keys=true also recovers live telemetry/attribute keys from the instance (profile targets via one representative instance). Returns slug, workdir, parent file path, entity/profile ids, pulled_this_run, and ts_keys/attr_keys. Sub-skill: not user-invocable; the standalone-* skills call it."
user-invocable: false
---

# Standalone Target Resolver

Resolves one target entity to a local solution file so a `standalone-*` skill can work on it. Owns the locate → (optional) refresh → (optional) minimal pull sequence in one place; every `standalone-*` skill invokes this first and receives the same output contract.

Callers working on several targets (related entities, a multi-entity dashboard, a batch of instances) invoke this once per distinct target: the first resolution decides `slug`, subsequent calls pass `solution=<slug>`, and the §3 refresh question is asked on the first local match only — the caller carries that answer to the rest of the set.

## Input contract

The caller supplies:

- `target` — the entity as the user described it (name, and type when stated: device, asset, customer, user, device-profile, asset-profile, entity-group, dashboard).
- `solution` (optional) — a solution name the user explicitly mentioned.
- `mode` — `create` (a new artifact will be added under/to this target, or the target itself is new) or `edit` (the target must already exist).
- `discover-keys` (optional, default false) — when true, recover the target's live telemetry/attribute keys from the instance before returning (§5). Callers that classify keys (calculated fields, alarms, dashboards) pass true; plain entity create/edit leaves it off.

## Steps

### 1. Local mode

```bash
tb config mode local
```

Idempotent — run it every time.

### 2. Local scan

Search local solution files for the target by name. Entity files live under per-type directories:

cwd is the project root by contract — the glob below resolves against it.

```bash
grep -rl "\"name\": \"<target-name>\"" solutions/*/devices/ solutions/*/assets/ solutions/*/customers/ solutions/*/users/ solutions/*/device-profiles/ solutions/*/asset-profiles/ solutions/*/entity-groups/ solutions/*/dashboards/ 2>/dev/null
```

Customers and dashboards store their name under `"title"` — match that instead; for users, also match `"email"`. When the user named a `solution`, restrict the glob to `solutions/<solution>/`.

Route on the match count:

- **Exactly one file** → §3 (refresh gate).
- **Multiple files** → `AskUserQuestion` listing each candidate as `"<entity name> (<type>) in <solution>"`; the chosen one proceeds to §3.
- **No file** → §4 (instance lookup).

### 3. Found locally → consent-first refresh gate

Set `slug` and `workdir` from the matched path. Ask once via `AskUserQuestion`:

- `question`: `"If you've deployed this and edited it via the ThingsBoard UI, I can refresh first. Refresh <entity-name> from the instance?"`
- `header`: `"Refresh"`
- `options`: `No — use local state` (default) · `Yes — refresh this entity`

**No** → `pulled_this_run=false`, go to §5.

**Yes** → pull the minimal set by UUID — the entity and its profile, never the whole solution. Read `id.id` and the profile reference (`deviceProfileId.id` / `assetProfileId.id`) from the matched file, then: (local files are EntityExportData-wrapped; the ids live on the wrapped entity object)

```bash
# <type>/<profile-type> are tb pull subcommands — lowercase, hyphenated (device, device-profile, asset-profile, …)
tb pull <type> <entity-uuid> --solution <slug>
tb pull <profile-type> <profile-uuid> --solution <slug>   # when the entity has a profile reference
```

- Exit 0 → announce `"Refreshed <entity-name> from the instance."`, set `pulled_this_run=true`, go to §5.
- HTTP 404 / "pushed yet?" → report `"<entity-name> was never pushed — nothing to refresh."`, `pulled_this_run=false`, continue with local state.
- Dirty-git error → `AskUserQuestion`: `Refresh and overwrite local edits` (re-run with `--force`) · `Keep local edits — skip refresh`.
- Any other error → surface it verbatim and continue with local state, noting the refresh was skipped.

### 4. Not local → instance lookup

Look the target up on the instance. When the type is stated, query that type; when not, try device first, then asset, then the remaining types:

```bash
tb <type> list --text-search "<target-name>" 2>&1
```

The flag is a case-insensitive substring match server-side; pick the exact-name match from the result.

- **One match** → confirm with the user in one line ("Found `Pump-42` (device, profile `water-pump`) on the instance — using it."), then pull the minimal set into a scratch solution:

```bash
# slug = kebab-case of the entity name, e.g. pump-42
tb solution new <slug>   # skip if it already exists
tb pull <type> <entity-uuid> --solution <slug>
tb pull <profile-type> <profile-uuid> --solution <slug>
```

  Announce: `"Pulled <entity-name> + its profile into solutions/<slug>/."` Set `pulled_this_run=true`.

- **Multiple matches** → `AskUserQuestion`:
  - `question`: `"Several entities match <target-name> — which one did you mean?"`
  - `header`: `"Which entity"`
  - `options`: one per candidate, label `"<name> (<type>)"`, description naming the profile when known.
- **No match** →
  - `mode=create` → the target is new. Derive `slug` from the entity name (or use the caller-supplied `solution`); the calling skill creates the entity there (running `tb solution new <slug>` first when the directory doesn't exist). `pulled_this_run=false`. Go to §5.
  - `mode=edit` → stop with: `"<target-name> was found neither locally nor on the instance — nothing to edit."` Suggest `pull-solution` when the user believes the entity exists in a larger connected graph (e.g. owned by a customer).

### 5. Key discovery and output contract

**Key discovery — only when the caller passed `discover-keys=true`.** ThingsBoard telemetry is schemaless: timeseries keys live in the timeseries store, not in the profile or device JSON, so they are read back from the instance rather than derived from the pulled files. This is a read-only query — it changes no local files, so no consent gate applies. Pick the entity to query:

- **Target is a device/asset instance** → query it directly with `entity_id`.
- **Target is a device/asset profile** → query one representative instance of that profile (instances of a profile share its schema; one is enough). Prefer a local file under `solutions/<slug>/devices/` (or `assets/`) whose `deviceProfileId.id` / `assetProfileId.id` equals the profile's `id.id`; otherwise list instances on the server and take the first:

```bash
tb device list --type "<profile-name>" 2>&1   # or: tb asset list --type "<profile-name>"
```

Then query the keys it actually reports:

```bash
tb telemetry keys --entity-type DEVICE --entity-id <instance-uuid> \
  --include-timeseries --include-attributes --include-samples
```

Use `--entity-type ASSET` for assets. The result is the **authoritative** key set: timeseries keys → `ts_keys` (with sample-derived dataType), attribute keys → `attr_keys`. The query is **best-effort**: when it errors (entity never pushed) or returns no keys (never reported), return empty lists and note that keys could not be recovered live — the caller falls back to the pulled profile config and the user's description.

**Output contract.** Return to the caller:

| Field | Value |
|---|---|
| `slug` | solution name (existing or scratch) |
| `workdir` | `solutions/<slug>/` |
| `parent_file` | path to the target entity's JSON file (absent only in the create-new-target case) |
| `entity_id` / `entity_type` | from the file's `id` block (absent for create-new-target) |
| `profile_id` / `profile_type` | from the profile reference, when the entity has one |
| `pulled_this_run` | whether any pull happened in this resolution |
| `ts_keys` / `attr_keys` | live timeseries/attribute keys (with sample-derived dataType) — only when `discover-keys=true`; empty when recovery failed |

## Common mistakes

- Pulling the whole solution (`tb pull --solution <slug>`) during the refresh gate — the gate pulls only the entity + profile by UUID.
- Dispatching `pull-solution` for the instance lookup — that skill pulls connected graphs; this resolver is deliberately minimal.
- Guessing when multiple candidates match — always ask.
- Re-fetching when the user answered "No — use local state".
- Querying every instance of a profile for key discovery — one representative instance is enough.
- Treating a failed key discovery as a hard error — it is best-effort; return empty lists and let the caller fall back.
