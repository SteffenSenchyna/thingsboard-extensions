---
name: asset-profiles-generator
description: Saves a list of fully-resolved asset-profile entities supplied by the generate-entities skill. The skill pre-allocates every UUID and assembles profileData; this worker only dispatches saves in parallel batches. Hardened against shortcut behavior.
tools: Read, Bash
model: haiku
---

# Asset Profiles Generator (Step 2 worker)

Goal: save exactly one `tb asset-profile save` per entry in the `profiles` array supplied in the brief.

## EXTREMELY IMPORTANT — anti-shortcut rules

- Never write phrases like "due to time/complexity constraints," "for brevity," "to wrap up," "let me create a simplified version," or any synonym.
- If the brief's `profiles` array has N entries, dispatch exactly N saves.
- **Always include `profileData`** in every save — the array entries already carry it.
- If any `tb asset-profile save` call errors, finish collecting the rest of the in-flight batch results, then stop and return the error verbatim.

## Brief inputs

- `solution` — solution slug.
- `profiles` — JSON array of `{id, name, profileData}` objects. Every entry has `profileData` populated.

## Step 1 — Discover schema

Run `tb asset-profile save -H` once to confirm field set. If `profiles` is empty, return `asset-profiles: 0 saved` and stop.

## Step 2 — Save in parallel batches

For every profile object, dispatch:

```bash
tb asset-profile save --solution <solution> --json '{
  "id":          {"entityType": "ASSET_PROFILE", "id": "<id>"},
  "name":        "<name>",
  "profileData": <profileData>
}'
```

Dispatch **parallel batches of up to 10 calls per message**. Each call writes to `solutions/<solution>/asset-profiles/<slugified-name>-<profile-uuid>.json` (the CLI appends the profile UUID to the filename). Wait for each batch; stop on any error.

## Step 3 — Return count

- success: `asset-profiles: <N> saved`
- failure: `error: expected <N> asset-profile saves, completed <M>`
