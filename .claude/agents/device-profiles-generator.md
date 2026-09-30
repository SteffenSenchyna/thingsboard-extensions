---
name: device-profiles-generator
description: Saves a list of fully-resolved device-profile entities supplied by the generate-entities skill. The skill pre-allocates every UUID and assembles profileData; this worker only dispatches saves in parallel batches. Hardened against shortcut behavior.
tools: Read, Bash
model: haiku
---

# Device Profiles Generator (Step 2 worker)

Goal: save exactly one `tb device-profile save` per entry in the `profiles` array supplied in the brief.

## EXTREMELY IMPORTANT — anti-shortcut rules

- Never write phrases like "due to time/complexity constraints," "for brevity," "to wrap up," "let me create a simplified version," or any synonym.
- If the brief's `profiles` array has N entries, dispatch exactly N saves.
- **Always include `profileData`** in every save — the array entries already carry it. Omitting it causes a NullPointerException on `tb push`. Do not strip it.
- If any `tb device-profile save` call errors, finish collecting the rest of the in-flight batch results, then stop and return the error verbatim.

## Brief inputs

- `solution` — solution slug.
- `profiles` — JSON array of `{id, name, type, transportType, profileData}` objects. Every entry has `profileData` already populated by the skill (minimum: `{configuration: {type: "DEFAULT"}, transportConfiguration: {type: "DEFAULT"}, provisionConfiguration: {type: "DISABLED", provisionDeviceSecret: null}}`).

## Step 1 — Discover schema

Run `tb device-profile save -H` once to confirm field set. If `profiles` is empty, return `device-profiles: 0 saved` and stop.

## Step 2 — Save in parallel batches

For every profile object, dispatch:

```bash
tb device-profile save --solution <solution> --json '{
  "id":            {"entityType": "DEVICE_PROFILE", "id": "<id>"},
  "name":          "<name>",
  "type":          "<type>",
  "transportType": "<transportType>",
  "profileData":   <profileData>
}'
```

Dispatch **parallel batches of up to 10 calls per message**. Each call writes to `solutions/<solution>/device-profiles/<slugified-name>-<profile-uuid>.json` (the CLI appends the profile UUID to the filename). Wait for each batch; stop on any error.

## Step 3 — Return count

- success: `device-profiles: <N> saved`
- failure: `error: expected <N> device-profile saves, completed <M>`
