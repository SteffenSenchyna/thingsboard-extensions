---
name: generate-calculated-fields
description: "Dispatches one cf-generator Haiku subagent per net-new calculated field in parallel. Each agent renders its CF and saves it via `tb calculated-field save`. The tb CLI applies a file-level lock during the read-modify-write on the parent profile's file, so concurrent saves from siblings targeting the same profile serialize at the lock — no race, no corruption. The skill only filters, dispatches, and aggregates."
user-invocable: false
---

# Generate Calculated Fields

Thin orchestrator. Dispatches one `cf-generator` subagent **per net-new calculated field** in parallel — every CF renders and saves concurrently in its own Haiku instance. The file-level lock inside `tb` makes concurrent writes to the same parent profile safe, so no separate save phase is needed.

## Inputs from the orchestrator

- `solution` — solution slug.
- `workdir` — absolute path to the solution directory, created and verified by `/create-solution` Step 1c. Treat as **opaque** — do not re-derive from `solution`, do not re-verify. Must contain `design/architecture-overview.md` (the single design artifact).
- `changed` (optional, string array) — names of CFs whose **definition changed this run** (e.g. an expression or window edited via `update-solution`). Listed CFs bypass the Step 1.5 net-new filter and are re-saved over the existing entry. Omit for fresh builds and pure additions.

## Existing-aware by design (no mode flag)

One flow serves fresh builds and updates — Step 1.5 filters the design's CFs against what is already saved on disk, so callers (`create-solution` Step 3, `update-solution` §3.4) dispatch this skill identically with no mode flag:

| Situation on disk | Behavior |
|---|---|
| **Fresh build** — no CFs embedded on any parent file | Dispatch one agent per design CF. |
| **Incremental update** — some CFs already saved | Dispatch only the net-new CFs (matched by `attachedTo` + `name`); existing CFs are left byte-for-byte. |
| **Changed definition** — CF exists but its design entry changed this run | The caller names it in `changed`; it stays in the dispatch list with `overwrite=true` and is re-saved over the existing entry. |
| **Fully materialized** — every design CF already saved, none changed | Print `No calculated-field changes required.` and return without dispatching. |

**Backstop:** each `cf-generator` re-checks the parent file just before saving and returns `skipped (already exists)` rather than overwrite — unless its brief carries `overwrite=true`. This catches any race between the Step 1.5 filter and the worker's save.

## EXTREMELY IMPORTANT — anti-shortcut rules

- Dispatch exactly one agent per **net-new** CF from Step 1.5 — no "representative subset," no skipping within the net-new set.
- If any agent returns an error, surface every agent's output verbatim and stop. Do not advance to validation.

## Step 1 — Parse the Metrics section

1. `Read` `$workdir/design/architecture-overview.md`.
2. Parse the `## Metrics` section — one bullet per calculated field, each of the form `` `<CFName>` on `<Profile>` — **type:** <type>; **inputs:** <key(s)>; **output:** <key>; **calculation:** <NL description>. `` Build one CF entry per bullet: `{name, attachedTo: <Profile>, type, inputs, output, calculation}`.
3. If the `## Metrics` section is absent or empty, return `calculatedFields: 0 fields (validate=skipped)` and stop.

## Step 1.5 — Filter to net-new CFs

For each parsed CF entry, locate the parent profile file under `<workdir>/device-profiles/` or `<workdir>/asset-profiles/` (the file whose entity `name` equals the CF's `attachedTo`) and check its embedded `calculatedFields` array for an entry with the same `name`. Use one `python3` bash block to walk both dirs — do not grep JSON.

- CF name listed in the `changed` input → **keep it in the dispatch list** regardless of disk state, and mark its brief `overwrite=true` (its definition changed this run and must be re-saved).
- CF already present on its parent (and not in `changed`) → **drop it from the dispatch list** (it was saved by a prior run; never re-emit or overwrite).
- Parent file not found on disk → keep the CF in the list; the worker will surface the real error on save (a missing parent is an upstream `generate-entities` bug to surface, not to mask here).

If the dispatch list ends up empty, print `No calculated-field changes required.` and return — skip Steps 2–4.

## Step 2 — Dispatch one cf-generator per net-new CF in parallel

In **one assistant message**, emit one `Agent` tool call per entry in the Step 1.5 dispatch list. Subagent type: `cf-generator`, `description="generate calculated field"`. Each brief:

- `solution`: the slug
- `cf`: the single parsed CF entry (inline JSON: `{name, attachedTo, type, inputs, output, calculation}`)
- `architectureOverviewPath`: `$workdir/design/architecture-overview.md`
- `overwrite`: `true` — **only** for CFs marked changed in Step 1.5; omit otherwise.

For very large solutions (say, more than ~40 CFs), split the dispatch across successive messages — but **do not** group CFs into the same brief. The whole point is one generator per CF for maximum parallelism within each message.

Wait for every agent to return. Each returns one of:

- `cf "<cfName>" attached to "<profile>": saved` — success.
- `cf "<cfName>" attached to "<profile>": skipped (already exists)` — backstop skip; counts as success.
- `error: cf "<cfName>" attached to "<profile>": <message>` — render or save failure.

## Step 3 — Aggregate

If any agent returned an error, surface every agent's output verbatim and stop. Do not advance to Step 4.

If all succeeded, count the `saved` + `skipped` returns and check against the Step 1.5 dispatch-list length. If short, stop with `error: expected <X> CF saves, completed <Y>`.

## Step 4 — Validate

`tb validate <solution>`. Surface any errors verbatim.

## Return value

Print **one summary line** and return (counts are this run's net-new saves — CFs already on disk were filtered out in Step 1.5):

```
calculatedFields: <N> fields across <P> profiles (net-new only; validate=<ok|errors>)
```

Where `<N>` is the count of successful `cf-generator` saves and `<P>` is the number of distinct profiles touched (count of unique `attached to "<profile>"` strings in the agent returns). (On the nothing-to-do paths the line is `calculatedFields: 0 fields (validate=skipped)` or `No calculated-field changes required.` as described above.)
