---
name: generate-alarms
description: "Expands attachedTo fanout, filters to net-new (alarm, profile) pairs, then dispatches one alarm-generator Haiku subagent per pair in parallel. Each agent renders its alarm rule and saves it via `tb alarm-rule save`. The tb CLI applies a file-level lock during the read-modify-write on the parent profile's file, so concurrent saves from siblings targeting the same profile serialize at the lock — no race, no corruption. The skill only filters, dispatches, and aggregates."
user-invocable: false
---

# Generate Alarms

Thin orchestrator. Expands `attachedTo` fanout (string or array) into individual (alarm, profile) pairs, filters out pairs already saved on disk, then dispatches one `alarm-generator` subagent **per remaining pair** in parallel — every alarm-profile combination renders and saves concurrently in its own Haiku instance. The file-level lock inside `tb` makes concurrent writes to the same parent profile safe, so no separate save phase is needed.

## Inputs from the orchestrator

- `solution` — solution slug.
- `workdir` — absolute path to the solution directory, created and verified by `/create-solution` Step 1c. Treat as **opaque** — do not re-derive from `solution`, do not re-verify. Must contain `design/architecture-overview.md` (the single design artifact).
- `changed` (optional, string array) — names of alarms whose **definition changed this run** (e.g. a threshold edited via `update-solution`). Every (alarm, profile) pair of a listed alarm bypasses the Step 1.5 net-new filter and is re-saved over the existing entry. Omit for fresh builds and pure additions.

## Existing-aware by design (no mode flag)

One flow serves fresh builds and updates — Step 1.5 filters the expanded pairs against what is already saved on disk, so callers (`create-solution` Step 3, `update-solution` §3.4) dispatch this skill identically with no mode flag:

| Situation on disk | Behavior |
|---|---|
| **Fresh build** — no alarm rules embedded on any parent file | Dispatch one agent per expanded (alarm, profile) pair. |
| **Incremental update** — some pairs already saved | Dispatch only the net-new pairs (an alarm fanned across profiles may exist on some and be net-new on a freshly added one); existing entries are left byte-for-byte. |
| **Changed definition** — alarm exists but its design entry changed this run | The caller names it in `changed`; all its pairs stay in the dispatch list with `overwrite=true` and are re-saved over the existing entries. |
| **Fully materialized** — every pair already saved, none changed | Print `No alarm-rule changes required.` and return without dispatching. |

**Backstop:** each `alarm-generator` re-checks the parent file just before saving and returns `skipped (already exists)` rather than overwrite — unless its brief carries `overwrite=true`. This catches any race between the Step 1.5 filter and the worker's save.

## EXTREMELY IMPORTANT — anti-shortcut rules

- Dispatch exactly one agent per **net-new or changed** (alarm, profile) pair from Step 1.5 — no "representative subset," no skipping within that set.
- If any agent returns an error, surface every agent's output verbatim and stop. Do not advance to validation.

## Step 1 — Parse the Alarms section + expand fanout

1. `Read` `$workdir/design/architecture-overview.md`.
2. Parse the `## Alarms` section — one bullet per alarm, each of the form `` `<AlarmName>` on `<Profile>`[, `<Profile2>`, …] — <severity>: <condition>[; <severity2>: <condition2>]; **clear:** <clear condition>. `` Build one alarm entry per bullet: `{name, attachedTo: <Profile or list of profiles named in the bullet>, createRules: [{severity, condition} in descending order], clearCondition, propagate}`. If the `## Alarms` section is absent or empty, return `alarms: 0 rules across 0 profiles (validate=skipped)` and stop.
3. **Expand fanout.** For each alarm entry that names multiple profiles, emit one logical (alarm, profile) pair per profile. For a single-profile alarm, emit one pair. The same `name`/`createRules`/`clearCondition`/`propagate` repeats across the pairs — only the resolved profile differs.

## Step 1.5 — Filter to net-new pairs

For each expanded (alarm, profile) pair, locate the parent profile file under `<workdir>/device-profiles/` or `<workdir>/asset-profiles/` (the file whose entity `name` equals the pair's profile) and check its embedded `calculatedFields` array for an `ALARM`-type entry with the same alarm name. Use one `python3` bash block to walk both dirs — do not grep JSON.

- Alarm name listed in the `changed` input → **keep all its pairs in the dispatch list** regardless of disk state, and mark their briefs `overwrite=true` (the definition changed this run and must be re-saved).
- Pair already present on its parent (and not in `changed`) → **drop it from the dispatch list** (it was saved by a prior run; never re-emit or overwrite).
- Parent file not found on disk → keep the pair in the list; the worker will surface the real error on save (a missing parent is an upstream `generate-entities` bug to surface, not to mask here).

If the dispatch list ends up empty, print `No alarm-rule changes required.` and return — skip Steps 2–4.

Expected save count: the length of the Step 1.5 dispatch list.

## Step 2 — Dispatch one alarm-generator per pair in parallel

In **one assistant message**, emit one `Agent` tool call per pair in the Step 1.5 dispatch list. Subagent type: `alarm-generator`, `description="generate alarm rule"`. Each brief:

- `solution`: the slug
- `profile`: the single target profile name (string)
- `alarm`: the single parsed alarm entry (inline JSON: `{name, createRules, clearCondition, propagate}`)
- `architectureOverviewPath`: `$workdir/design/architecture-overview.md`
- `overwrite`: `true` — **only** for pairs marked changed in Step 1.5; omit otherwise.

For very large solutions (say, more than ~40 pairs), split the dispatch across successive messages — but **do not** group pairs into the same brief. The whole point is one generator per pair for maximum parallelism within each message.

Wait for every agent to return. Each returns one of:

- `alarm "<alarmName>" attached to "<profile>": saved` — success.
- `alarm "<alarmName>" attached to "<profile>": skipped (already exists)` — backstop skip; counts as success.
- `error: alarm "<alarmName>" attached to "<profile>": <message>` — render or save failure.

## Step 3 — Aggregate

If any agent returned an error, surface every agent's output verbatim and stop. Do not advance to Step 4.

If all succeeded, count the `saved` + `skipped` returns and check against the expected save count from Step 1.5. If short, stop with `error: expected <X> alarm saves, completed <Y>`.

## Step 4 — Validate

`tb validate <solution>`. Surface any errors verbatim.

## Return value

Print **one summary line** and return (counts are this run's net-new/changed saves — pairs already on disk were filtered out in Step 1.5):

```
alarms: <N> rules across <P> profiles (net-new only; validate=<ok|errors>)
```

Where `<N>` is the count of successful `alarm-generator` saves and `<P>` is the number of distinct profiles touched. (On the nothing-to-do paths the line is `alarms: 0 rules across 0 profiles (validate=skipped)` or `No alarm-rule changes required.` as described above.)
