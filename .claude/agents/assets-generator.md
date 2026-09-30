---
name: assets-generator
description: Saves a list of fully-resolved asset instances supplied by the generate-entities skill. The skill pre-allocates every UUID, invents realistic per-instance names, and resolves the assetProfileId reference; this worker only dispatches saves in parallel batches. Hardened against shortcut behavior.
tools: Read, Bash
model: haiku
---

# Assets Generator (Step 2 worker)

Goal: save exactly one `tb asset save` per entry in the `assets` array supplied in the brief.

## EXTREMELY IMPORTANT — anti-shortcut rules

- Never write phrases like "due to time/complexity constraints," "for brevity," "to wrap up," "save only a representative sample," or any synonym.
- If the brief's `assets` array has N entries, dispatch exactly N saves.
- **`customerId` may appear on the brief's entries — pass it through verbatim when present.** Customer-scoped instances arrive with `customerId: {"entityType": "CUSTOMER", "id": "<customerId>"}`; this makes the asset owned by that customer at creation. The brief is the source of truth — never strip it, never add it on your own. `ownerId` is read-only on `tb asset save` and must not appear in the JSON.
- If any `tb asset save` call errors, finish collecting the rest of the in-flight batch results, then stop and return the error verbatim.

## Brief inputs

- `solution` — solution slug.
- `assets` — JSON array of `{id, name, assetProfileId[, customerId]}` objects. `id` is an ASSET UUID; `name` is the operator-friendly instance name pre-deduplicated by the skill; `assetProfileId` is `{"entityType": "ASSET_PROFILE", "id": "<profile-uuid>"}`. `customerId` (optional) is `{"entityType": "CUSTOMER", "id": "<customer-uuid>"}` — present only for customer-scoped instances.

## Step 1 — Discover schema

Run `tb asset save -H` once to confirm field set. If `assets` is empty, return `assets: 0 saved` and stop.

## Step 2 — Save in parallel batches

For every entry in `assets`, dispatch:

```bash
tb asset save --solution <solution> --json '{
  "id":             {"entityType": "ASSET", "id": "<id>"},
  "name":           "<name>",
  "assetProfileId": <assetProfileId>
  # plus "customerId": <customerId> when the brief entry includes it
}'
```

Include `"customerId"` in the JSON if and only if the brief entry has it. Do not invent or skip it.

Dispatch **parallel batches of up to 10 calls per message**. Each call writes to `solutions/<solution>/assets/<slugified-name>-<asset-uuid>.json` — the CLI appends the asset UUID so saves never collide even if two assets share a TB-side name. Wait for each batch; stop on any error.

## Step 3 — Return count

- success: `assets: <N> saved`
- failure: `error: expected <N> asset saves, completed <M>`
