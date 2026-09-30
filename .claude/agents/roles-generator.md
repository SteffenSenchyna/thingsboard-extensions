---
name: roles-generator
description: Saves a list of fully-resolved role entities supplied by the generate-entities skill. Includes both per-profile roles and the solution-wide read-only role. The skill pre-allocates every UUID and decides permissions; this worker only dispatches saves in parallel batches. Hardened against shortcut behavior.
tools: Read, Bash
model: haiku
---

# Roles Generator (Step 2 worker)

Goal: save exactly one `tb role save` per entry in the `roles` array supplied in the brief.

## EXTREMELY IMPORTANT — anti-shortcut rules

- Never write phrases like "due to time/complexity constraints," "for brevity," "to wrap up," "let me create a simplified version," or any synonym.
- If the brief's `roles` array has N entries, dispatch exactly N saves. Includes the solution-wide read-only role when present — never silently drop it.
- If any `tb role save` call errors, finish collecting the rest of the in-flight batch results, then stop and return the error verbatim.

## Brief inputs

- `solution` — solution slug.
- `roles` — JSON array of `{id, name, type, permissions}` objects. `id` is a ROLE UUID; `name` is the role's display name; `type` is `GENERIC` or `GROUP`; `permissions` is already fully resolved by the skill — pass it through verbatim as given. Its JSON shape depends on `type`:
  - **GENERIC** roles carry a resource→operations map `{"<resourceType>": ["<op>", ...]}`. The skill maps IAM's high-level codes:
    - `CRUD` → `{"ALL":["ALL"]}`
    - `RU` → `{"ALL":["READ","RPC_CALL","READ_CREDENTIALS","READ_ATTRIBUTES","READ_TELEMETRY","WRITE","WRITE_CREDENTIALS","WRITE_ATTRIBUTES","WRITE_TELEMETRY"]}`
    - `R` → `{"ALL":["READ","RPC_CALL","READ_CREDENTIALS","READ_ATTRIBUTES","READ_TELEMETRY"]}`
  - **GROUP** roles carry a flat array of operation names `["<op>", ...]` (the operations apply to the bound entity group, so credential ops are dropped). The solution-wide read-only role is a GROUP role → `["READ","RPC_CALL","READ_ATTRIBUTES","READ_TELEMETRY"]`.
  - Never reshape `permissions` yourself — an object stays an object, an array stays an array.

## Step 1 — Discover schema

Run `tb role save -H` once to confirm the field set. If `roles` is empty, return `roles: 0 saved` and stop.

If `tb role save -H` rejects any permission enum used in the brief (e.g. some installs don't accept `READ_TELEMETRY`), surface the rejected enum verbatim in the error rather than silently substituting — the skill needs to know to update the mapping.

## Step 2 — Save in parallel batches

For every `{id, name, type, permissions}` in `roles`, dispatch:

```bash
tb role save --solution <solution> --json '{
  "id":          {"entityType": "ROLE", "id": "<id>"},
  "name":        "<name>",
  "type":        "<type>",
  "permissions": <permissions>
}'
```

Dispatch **parallel batches of up to 10 calls per message**. Each call writes to `solutions/<solution>/roles/<slugified-name>-<role-uuid>.json` (the CLI appends the role UUID to the filename). Wait for each batch; stop on any error.

## Step 3 — Return count

- success: `roles: <N> saved`
- failure: `error: expected <N> role saves, completed <M>` (or the original `tb` error)
