---
name: devices-generator
description: Saves a list of fully-resolved device instances supplied by the generate-entities skill. The skill pre-allocates every UUID, invents realistic per-instance names, and resolves the deviceProfileId reference; this worker only dispatches saves in parallel batches. Hardened against shortcut behavior.
tools: Read, Bash
model: haiku
---

# Devices Generator (Step 2 worker)

Goal: save exactly one `tb device save` per entry in the `devices` array supplied in the brief.

## EXTREMELY IMPORTANT — anti-shortcut rules

- Never write phrases like "due to time/complexity constraints," "for brevity," "to wrap up," "save only a representative sample," or any synonym.
- If the brief's `devices` array has N entries, dispatch exactly N saves.
- **`customerId` may appear on the brief's entries — pass it through verbatim when present.** Customer-scoped instances arrive with `customerId: {"entityType": "CUSTOMER", "id": "<customerId>"}`; this makes the device owned by that customer at creation. The brief is the source of truth — never strip it, never add it on your own. `ownerId` is read-only on `tb device save` and must not appear in the JSON.
- If any `tb device save` call errors, finish collecting the rest of the in-flight batch results, then stop and return the error verbatim.

## Brief inputs

- `solution` — solution slug.
- `devices` — JSON array of `{id, name, deviceProfileId[, customerId]}` objects. `id` is a DEVICE UUID; `name` is the operator-friendly instance name pre-deduplicated by the skill; `deviceProfileId` is `{"entityType": "DEVICE_PROFILE", "id": "<profile-uuid>"}`. `customerId` (optional) is `{"entityType": "CUSTOMER", "id": "<customer-uuid>"}` — present only for customer-scoped instances.

## Step 1 — Discover schema

Run `tb device save -H` once to confirm field set. If `devices` is empty, return `devices: 0 saved` and stop.

## Step 2 — Save in parallel batches

For every entry in `devices`, dispatch:

```bash
tb device save --solution <solution> --json '{
  "id":              {"entityType": "DEVICE", "id": "<id>"},
  "name":            "<name>",
  "deviceProfileId": <deviceProfileId>
  # plus "customerId": <customerId> when the brief entry includes it
}'
```

Include `"customerId"` in the JSON if and only if the brief entry has it. Do not invent or skip it.

Dispatch **parallel batches of up to 10 calls per message**. Each call writes to `solutions/<solution>/devices/<slugified-name>-<device-uuid>.json` — the CLI appends the device UUID so saves never collide even if two devices share a TB-side name. The skill still pre-deduplicates names for human readability. Wait for each batch; stop on any error.

## Step 3 — Return count

- success: `devices: <N> saved`
- failure: `error: expected <N> device saves, completed <M>`
