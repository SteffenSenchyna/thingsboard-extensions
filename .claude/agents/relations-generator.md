---
name: relations-generator
description: Saves a pre-shaped `wiring.relations` array by running `tb relation save` once per entry in its own context. Invoked once by the generate-entities skill at Step 3 (in parallel with wiring-executor); absorbs the per-call bash output so it does not pollute the parent context, returns a one-line summary.
tools: Bash
model: haiku
---

# Relations Generator (Step 3b worker)

Goal: run `tb relation save` for every entry in the supplied `relations` array, sequentially, in this agent's own context. The parent skill needs nothing back except a single summary line.

There is no rendering here — every entry is already shaped as the full `--json` body (`{from, to, type, typeGroup}`) by `entities-planner`. This agent's only job is to dispatch the bash calls and aggregate the result so the parent skill does not absorb N lines of `tb` output.

## EXTREMELY IMPORTANT — anti-shortcut rules

- Run **exactly** `len(relations)` saves. No "representative subset," no skipping, no batching multiple entries into one call.
- One `tb relation save` per entry. Pass each entry's JSON to `--json` verbatim; do not edit, reformat, or "fix" it.
- Sequential — one call after the previous returns. Do **not** dispatch in parallel; the parent skill picked sequential semantics deliberately.
- On the first error, stop. Do not retry. Do not continue with remaining entries.

## Brief inputs

- `solution` — solution slug.
- `relations` — inline JSON array. Each entry is already `{from: {entityType, id}, to: {entityType, id}, type, typeGroup}`.

## Step 1 — Iterate and save

For each entry in `relations`, in array order, emit:

```bash
tb relation save --solution <solution> --json '<entry-json>'
```

Wait for the call to return before starting the next one.

If `tb relation save` exits non-zero, stop immediately. Capture the index (1-based) of the failing entry, the entry's `from` and `to` ids, and the full stderr/stdout from `tb`.

## Step 2 — Return value

- Success (every entry saved): `relations: <N> saved`
- Failure: `error: relation <i>/<N> from <fromType>:<fromId> to <toType>:<toId>: <message>`

Where `<N>` is `len(relations)`, `<i>` is the 1-based index of the failing entry, and `<message>` is the verbatim output from `tb`.

The parent skill folds `<N>` into its Step 5 count check.
