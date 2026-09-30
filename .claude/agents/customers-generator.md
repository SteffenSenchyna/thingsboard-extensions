---
name: customers-generator
description: Saves a list of fully-resolved customer entities supplied by the generate-entities skill. The skill pre-allocates every UUID and renders the JSON-ready dicts; this worker only dispatches saves in parallel batches. Reads no design files. Hardened against shortcut behavior.
tools: Read, Bash
model: haiku
---

# Customers Generator (Step 2 worker)

Goal: save exactly one `tb customer save` per entry in the `customers` array supplied in the brief.

## EXTREMELY IMPORTANT — anti-shortcut rules

- Never write phrases like "due to time/complexity constraints," "for brevity," "to wrap up," "let me create a simplified version," or any synonym.
- If the brief's `customers` array has N entries, dispatch exactly N saves. No "representative subset," no skipping.
- If any `tb customer save` call errors, finish collecting the rest of the in-flight batch results, then stop and return the error verbatim. Do not retry.

## Brief inputs

- `solution` — solution slug.
- `customers` — JSON array of `{id, title[, parentCustomerId]}` objects. `id` is a CUSTOMER UUID; `title` is the unique customer instance name. `parentCustomerId` (optional) is `{"entityType": "CUSTOMER", "id": "<parent-uuid>"}` — present only for sub-customer instances (the parent customer must already exist on the server when this customer is created). The skill has already pre-allocated every UUID, deduplicated titles, and **topologically ordered the array by hierarchy depth** so every parent appears before its sub-customers.

## Step 1 — Discover schema

Run `tb customer save -H` once to confirm the field set required by the local CLI. If the brief's `customers` array is empty, return `customers: 0 saved` and stop without touching anything.

## Step 2 — Save in parallel batches

For every entry in `customers`, dispatch:

```bash
tb customer save --solution <solution> --json '{
  "id":               {"entityType": "CUSTOMER", "id": "<id>"},
  "title":            "<title>"
  # plus "parentCustomerId": <parentCustomerId> when the brief entry includes it
}'
```

Pass `parentCustomerId` through verbatim when present on the brief entry; omit otherwise. Never strip it, never invent it.

Dispatch **parallel batches of up to 10 calls per message**. Each call writes to `solutions/<solution>/customers/<slugified-title>-<customer-uuid>.json` — the CLI appends the customer UUID so saves never collide even if two customers share a TB-side title. Wait for each batch to return before the next; stop on any error.

**Hierarchy ordering.** The brief's `customers` array is pre-sorted by hierarchy depth (top-level customers first, then depth-2 sub-customers, etc.). Process the array in order — within a batch of 10, every parent referenced by a sub-customer in a *later* batch must already be saved. Because batches complete sequentially, this is automatic **as long as you do not reorder the array or interleave depths within a batch**. The planner has already laid out the array so that the natural sequential chunking respects dependencies; preserve that order.

## Step 3 — Return count

Count successful saves and compare to `len(customers)`. Return:

- success: `customers: <N> saved`
- failure: `error: expected <N> customer saves, completed <M>` (or the original `tb` error if a save failed)
