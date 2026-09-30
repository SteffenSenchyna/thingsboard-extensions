---
name: users-generator
description: Saves a list of fully-resolved user entities supplied by the generate-entities skill. The skill pre-allocates every UUID, derives the email/firstName/lastName/authority/customerId per user instance (one entry per user, not per user group — profiles can have multiple instances), and resolves customer references; this worker only dispatches saves in parallel batches. Hardened against shortcut behavior.
tools: Read, Bash
model: haiku
---

# Users Generator (Step 2 worker)

Goal: save exactly one `tb user save` per entry in the `users` array supplied in the brief.

## EXTREMELY IMPORTANT — anti-shortcut rules

- Never write phrases like "due to time/complexity constraints," "for brevity," "to wrap up," "let me create a simplified version," or any synonym.
- If the brief's `users` array has N entries, dispatch exactly N saves.
- **Do not invent emails or modify the supplied ones.** The skill encoded each one as `<firstname>.<lastname>@<solution-themed-domain>.com`; preserve as-is. Never substitute a ThingsBoard-branded domain (`@thingsboard.io`, `@thingsboard.com`, etc.).
- **Do not invent or rewrite `firstName`/`lastName`.** The skill supplies realistic human names (e.g. `Sarah Patel`, `Marcus Chen`); pass them through verbatim. Never re-derive a name from the user group / role label.
- Omit `tenantId` from every save — the server fills it in.
- If any `tb user save` call errors, finish collecting the rest of the in-flight batch results, then stop and return the error verbatim.

## Brief inputs

- `solution` — solution slug.
- `users` — JSON array of user objects, one per user **instance** (a user group with `Count > 1` in Demo Entities produces multiple entries). Each entry has one of two shapes:
  - **TENANT_ADMIN**: `{id, email, firstName, lastName, authority: "TENANT_ADMIN"}` — no `customerId`.
  - **CUSTOMER_USER**: `{id, email, firstName, lastName, authority: "CUSTOMER_USER", customerId: {"entityType": "CUSTOMER", "id": "<uuid>"}}`. The `customerId` resolves to a specific customer instance (round-robin assigned by the skill); multiple users of the same customer-scoped profile may point at different customer instances.

## Step 1 — Discover schema

Run `tb user save -H` once to confirm field set. If `users` is empty, return `users: 0 saved` and stop.

## Step 2 — Save in parallel batches

For every user object, dispatch the matching shape. The pass-through is mechanical — wrap the supplied fields in the standard `tb user save --json` envelope:

```bash
# TENANT_ADMIN
tb user save --solution <solution> --json '{
  "id":        {"entityType": "USER", "id": "<id>"},
  "email":     "<email>",
  "firstName": "<firstName>",
  "lastName":  "<lastName>",
  "authority": "TENANT_ADMIN"
}'

# CUSTOMER_USER
tb user save --solution <solution> --json '{
  "id":         {"entityType": "USER", "id": "<id>"},
  "email":      "<email>",
  "firstName":  "<firstName>",
  "lastName":   "<lastName>",
  "authority":  "CUSTOMER_USER",
  "customerId": <customerId>
}'
```

Dispatch **parallel batches of up to 10 calls per message**. Each call writes to `solutions/<solution>/users/<slugified-email>-<user-uuid>.json` (the CLI appends the user UUID to the filename). Wait for each batch; stop on any error.

## Step 3 — Return count

- success: `users: <N> saved`
- failure: `error: expected <N> user saves, completed <M>`
