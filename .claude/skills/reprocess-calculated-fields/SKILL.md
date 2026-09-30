---
name: reprocess-calculated-fields
description: "Backfill historical data for calculated fields in a deployed solution. Use when the user asks to reprocess calculated fields, backfill a metric, or recompute aggregations after deploying a solution to ThingsBoard. Run after `tb push <slug>` — the entities must already exist in ThingsBoard."
user-invocable: true
---

# Reprocess Calculated Fields

Thin shim. Dispatches the `cf-reprocess-generator` Haiku agent which discovers calculated fields in the solution, applies the eligibility filter, and queues `tb calculated-field reprocess` calls in parallel batches.

## Operating modes

The `mode` input selects exactly one mode; the generator handles both internally:

| Mode | Signal | Behavior |
|---|---|---|
| **Local** | `mode=local` (default) | Writes task files under `solutions/<slug>/tasks/reprocessing/`; they execute on `tb push <slug> --run-tasks`. |
| **Remote** | `mode=remote` | Calls the server immediately per CF (`--remote`), returning a `Job` per call. |

**Idempotent re-queue (local mode).** The CLI writes each task to a deterministic filename (`<entity-id-prefix>-<slugified-cf-name>.json`) and **overwrites** an existing task for the same entity + CF name. Re-running this skill for a CF that already has a queued task replaces the task (fresh window, fresh order) — it never duplicates. So callers re-queue freely after a CF change; no skip filter is needed.

## Inputs

- `solution` — the deployed solution slug. Ask the user if not given.
- `mode` — `local` (default) or `remote` (see Operating modes above).
- Optional `nameFilter` — a single CF name, a **list of CF names** (e.g. the affected CFs from `update-solution` §3.5), or a substring. Only matching CFs are reprocessed.
- Optional `entityTypeFilter` / `entityIdFilter` to narrow the scope to one attachment.
- Optional `startTs` / `endTs` (ms) — time window. Default: last 7 days.

## Run

Use the `Agent` tool with `subagent_type=cf-reprocess-generator` and `description="reprocess calculated fields"`. Pass the brief verbatim:

- `solution`: the solution slug
- `mode`: `local` or `remote`
- `nameFilter` / `entityTypeFilter` / `entityIdFilter` if supplied
- `startTs` / `endTs` if supplied (otherwise the agent defaults to last 7 days)

Print the agent's return value verbatim.

## Why a subagent (not inline)

CF discovery scans every entity file under `solutions/<solution>/**` (potentially hundreds of files) and inspects each file's `calculatedFields` array. Doing that in the main context costs significant input tokens that the orchestrator doesn't need. Pushing it into a Haiku subagent keeps the file reads out of main and returns only the one-line summary.

This also means: when called in parallel with `generate-emulators` from `create-solution` Step 3 substep 4, main Claude dispatches one Agent call for this skill (one subagent) plus N Agent calls for `generate-emulators` (one per device profile) — all in the same message. Every subagent runs concurrently as a separate Claude instance.

## Note on `tb push`

Queued tasks (local mode) run when the solution is deployed with `--run-tasks`:

```bash
tb push <slug> --run-tasks
```

Do not run `tb push` from this skill.
