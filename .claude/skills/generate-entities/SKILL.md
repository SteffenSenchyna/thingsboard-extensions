---
name: generate-entities
description: "Orchestrates entity materialization. Dispatches the entities-planner Haiku agent (does all the bookkeeping — UUIDs, names, slices, wiring plan), then dispatches 8 worker subagents in parallel to render and save customers / roles / entity-groups / profiles / devices / assets / users, then dispatches wiring-executor and relations-generator Haiku agents in parallel to own the wiring/relations bash loops."
user-invocable: false
---

# Generate Entities

Thin dispatcher: main Claude dispatches the `entities-planner` Haiku agent which does **all** the bookkeeping (load files, allocate UUIDs, invent names, build the 8 worker slices, build the wiring + relations plan). Main Claude then dispatches 8 worker subagents in parallel with their pre-computed slices, then dispatches `wiring-executor` and `relations-generator` Haiku agents in parallel — those two own all of the wiring/relations `tb` bash loops in their own contexts. Main does **no** UUID allocation, **no** slice building, **no** name generation, **no** bash iteration — that's all in Haiku.

## Inputs from the orchestrator

- `solution` — solution slug.
- `workdir` — absolute path to the solution directory, created and verified by `/create-solution` Step 1c. Treat as **opaque** — do not re-derive from `solution`, do not re-verify. Must contain `design/architecture-overview.md` (the single design artifact).

## Existing-aware by design (no mode flag)

This skill has one flow for both fresh builds and updates — the planner's filesystem scan decides what is net-new, so callers (`create-solution` Step 3, `update-solution` §3.4) dispatch it identically with no mode flag:

| Situation on disk | Behavior |
|---|---|
| **Fresh build** — no entity files under `<workdir>/` | Planner allocates everything; full materialization. |
| **Incremental update** — some entities already exist | Planner reuses existing UUIDs by (type + name/email), slices in **only** net-new entities and the per-bucket shortfall of instances; existing files are never re-emitted or overwritten. |
| **Fully materialized** — nothing net-new | Planner returns `"all_existing": true`; the skill prints `No entity changes required.` and returns without dispatching workers. |

**Backstop:** the planner's scan is the primary incremental-safety mechanism, and each worker adds a second layer — before writing any entity file, it checks whether the target path under `<workdir>/` already exists on disk and skips silently rather than overwrite. This catches any edge case where the planner's scan and a worker's write race on the same file.

## Step 1 — Dispatch the planner

1. `tb config mode local` (idempotent).
2. Use the `Agent` tool with `subagent_type=entities-planner` and `description="plan entities"`. Brief:
   - `solution`: the slug
   - `workdir`: `<workdir>` (the absolute solution directory path)
   - `architectureOverviewPath`: `<workdir>/design/architecture-overview.md`

The planner returns one of:
- Success: a single-line JSON blob `{"workers": {...}, "wiring": {...}, "expected_counts": {...}, "customerMode": "..."}`.
- Failure: a single-line `error: <description>`.

If the return value parses as JSON, treat it as the plan and continue. If parsing fails, surface the planner's text verbatim and stop.

**Early-exit:** if the blob carries `"all_existing": true` (every worker slice empty, all entities already on disk), print `No entity changes required.` and return immediately — skip Steps 2–5.

### Step 2 — Dispatch 8 worker subagents in parallel

In **one assistant message**, emit one `Agent` tool call per non-empty worker slice. Skip workers whose slice is empty (e.g. no `users-generator` if `workers.users` is empty; no `customers-generator` if `customerMode == "tenant-only"`).

Each Agent call must include a short `description` (3–5 words) such as `description="generate <type>"` (e.g. `"generate customers"`, `"generate roles"`, `"generate device profiles"`).

| Slice key in plan       | Worker (`subagent_type`)      | Brief field name |
|-------------------------|-------------------------------|------------------|
| `workers.customers`     | `customers-generator`         | `customers`      |
| `workers.roles`         | `roles-generator`             | `roles`          |
| `workers.entity_groups` | `entity-groups-generator`     | `groups`         |
| `workers.device_profiles`| `device-profiles-generator`  | `profiles`       |
| `workers.asset_profiles`| `asset-profiles-generator`    | `profiles`       |
| `workers.devices`       | `devices-generator`           | `devices`        |
| `workers.assets`        | `assets-generator`            | `assets`         |
| `workers.users`         | `users-generator`             | `users`          |

Each Agent call brief contains:
- `solution`: the slug
- The slice array as inline JSON (under the named field above).

Each worker returns `<type>: <N> saved` or `error: <message>`.

**Wait for every dispatched worker to return.** If any worker errored, surface its output verbatim and stop. Cross-check each worker's `<N>` against the corresponding entry in `expected_counts` — short count = stop.

### Step 3 — Dispatch wiring + relations in parallel

In **one assistant message**, emit one `Agent` tool call per non-empty workload. Main Claude does **no** bash iteration here — both agents own their loops internally.

**3a. `wiring-executor`** — owns dashboard perms, memberships, and role perms. Skip the dispatch if `wiring.dashboard_perms`, every sub-array of `wiring.memberships` (`user_groups`, `profile_groups`, `customer_groups`), and `wiring.role_perms` are all empty.

Use the `Agent` tool with `subagent_type=wiring-executor` and `description="execute wiring"`. Brief:

- `solution`: the slug
- `dashboard_perms`: `wiring.dashboard_perms` (inline JSON array)
- `memberships`: `wiring.memberships` (inline JSON object with `user_groups`, `profile_groups`, `customer_groups`)
- `role_perms`: `wiring.role_perms` (inline JSON array)

The agent runs the three sub-steps **in this order — dashboard perms, then memberships, then role perms** — because dashboard perms and role perms both merge into the same user-group file's `additionalInfo.permissions` array and would race if interleaved. Within each sub-step the agent dispatches its `tb entity-group …` calls in parallel batches of up to 10 per message.

Returns one of:
- Success: `wiring: dashboard_perms=<N1>, memberships=<N2>, role_perms=<N3>`
- Failure: `error: <description>`

**3b. `relations-generator`** — owns the `tb relation save` loop. Skip if `wiring.relations` is empty.

Use the `Agent` tool with `subagent_type=relations-generator` and `description="generate relations"`. Brief:

- `solution`: the slug
- `relations`: `wiring.relations` (inline JSON array)

Each entry is already shaped as the full `--json` body (`{from, to, type, typeGroup}`); the agent iterates and saves sequentially. Returns one of:

- Success: `relations: <N> saved`
- Failure: `error: relation <i>/<N> from <fromType>:<fromId> to <toType>:<toId>: <message>`

**Wait for both dispatches to return.** If either errored, surface its output verbatim and stop. Parse the counts and fold them into the Step 5 check.

### Step 4 — `tb validate <solution>`

Run once. Surface any errors verbatim.

### Step 5 — Verify counts

Compare actual counts against `expected_counts` from the plan blob:
- Step 2 worker return lines → `customers`, `roles`, `entity_groups`, `device_profiles`, `asset_profiles`, `devices`, `assets`, `users`
- `wiring-executor` return → `dashboard_perms`, `memberships`, `role_perms`
- `relations-generator` return → `relations`

If any actual is less than expected, stop and return `error: expected <X> <type>, completed <Y>`.

Print **one summary line** and return (counts are this run's net-new saves — existing entities were reused by id and are not counted):

```
entities: <P> profiles, <D> devices, <A> assets, <C> customers, <U> users, <R> roles, <REL> relations (net-new only; existing reused by id; validate=<ok|errors>)
```

(On the early-exit path the line is `No entity changes required.` instead.)
