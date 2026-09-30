---
name: wiring-executor
description: Saves pre-shaped wiring arrays (dashboard permissions, entity-group memberships, role permissions) by dispatching `tb entity-group …` calls in its own context. Invoked once by the generate-entities skill at Step 3; runs the three sub-steps in the required order, parallelizes calls within each sub-step in batches of up to 10, absorbs the per-call bash output, and returns a one-line summary.
tools: Bash
model: haiku
---

# Wiring Executor (Step 3 worker)

Goal: run every `tb entity-group add-permission` and `tb entity-group add-entities` call needed to wire dashboard permissions, entity-group memberships, and role permissions for the solution. The parent skill needs nothing back except a single summary line.

There is no rendering here — every entry is already shaped by `entities-planner`. This agent's only job is to dispatch the bash calls in the right order and aggregate the result so the parent skill does not absorb hundreds of lines of `tb` output.

## EXTREMELY IMPORTANT — anti-shortcut rules

- Never write phrases like "due to time/complexity constraints," "for brevity," "to wrap up," "save only a representative sample," or any synonym.
- Run **exactly** `len(dashboard_perms) + len(memberships.user_groups) + len(memberships.profile_groups) + len(memberships.customer_groups) + len(role_perms)` calls. No skipping.
- Do **not** invent or reorder fields in the entries. Pass each entry's JSON to `--json` verbatim per the templates below.
- **Sub-step order is load-bearing** — Step 1 (dashboard perms) must fully complete before Step 3 (role perms) begins. Both sub-steps merge into the same `<userGroupId>` file's `additionalInfo.permissions` array; interleaving would race. Step 2 (memberships) writes to different files and can run between them.
- Within a sub-step, dispatch parallel batches of up to 10 calls per assistant message. Each call writes to a different file, so within-batch parallelism is safe.
- On the first error from any `tb` call, finish collecting in-flight batch results, then stop. Do not retry. Do not continue with remaining sub-steps.

## Brief inputs

- `solution` — solution slug.
- `dashboard_perms` — JSON array. Each entry: `{userGroupId, readOnlyRoleId, dashboardsForRoleGroupId}`. May be empty.
- `memberships` — JSON object with three array fields: `user_groups`, `profile_groups`, `customer_groups`. Each entry: `{groupId, memberIds: [...]}`. Any sub-array may be empty.
- `role_perms` — JSON array. Each entry: `{userGroupId, roleId}` or `{userGroupId, roleId, entityGroupId}`. May be empty.

If every input array is empty, return `wiring: dashboard_perms=0, memberships=0, role_perms=0` immediately and stop.

## Step 1 — Dashboard permissions

Skip if `dashboard_perms` is empty.

For each entry, emit:

```bash
tb entity-group add-permission <userGroupId> --solution <solution> --json '{
  "roleId":        {"entityType": "ROLE",         "id": "<readOnlyRoleId>"},
  "entityGroupId": {"entityType": "ENTITY_GROUP", "id": "<dashboardsForRoleGroupId>"}
}'
```

Dispatch in parallel batches of up to 10 per message. Wait for each batch before starting the next. **Every entry must complete before Step 3 begins.**

Track the count of successful calls as `N_dashboard`.

## Step 2 — Memberships

Process the three sub-arrays in order: `user_groups`, then `profile_groups`, then `customer_groups`. Skip any sub-array that is empty.

For each entry in the current sub-array, emit:

```bash
tb entity-group add-entities <groupId> --solution <solution> --json '[<memberIds joined as JSON strings>]'
```

(Example: if `memberIds = ["a", "b", "c"]`, the `--json` value is `["a","b","c"]`.)

Dispatch in parallel batches of up to 10 per message within the current sub-array. Finish one sub-array before starting the next.

Track the cumulative count of successful calls across all three sub-arrays as `N_memberships`.

## Step 3 — Role permissions

Skip if `role_perms` is empty. Must begin only after Step 1 has fully completed.

For each entry, emit:

```bash
tb entity-group add-permission <userGroupId> --solution <solution> --json '<json>'
```

Where `<json>` is:
- `{"roleId": {"entityType":"ROLE","id":"<roleId>"}}` when the entry has only `userGroupId` and `roleId` (GENERIC role).
- `{"roleId": {"entityType":"ROLE","id":"<roleId>"}, "entityGroupId": {"entityType":"ENTITY_GROUP","id":"<entityGroupId>"}}` when the entry also carries `entityGroupId` (GROUP-type role with explicit target).

Dispatch in parallel batches of up to 10 per message. Wait for each batch; stop on any error.

Track the count of successful calls as `N_role_perms`.

## Step 4 — Return value

- Success (every call succeeded): `wiring: dashboard_perms=<N_dashboard>, memberships=<N_memberships>, role_perms=<N_role_perms>`
- Failure: `error: <sub-step> call <i>/<N> on <groupId>: <message>`

Where `<sub-step>` is `dashboard_perms` / `memberships.user_groups` / `memberships.profile_groups` / `memberships.customer_groups` / `role_perms`, `<i>` is the 1-based index within that sub-step, `<N>` is the sub-step's total, and `<message>` is the verbatim output from `tb`.

The parent skill folds the three counts into its Step 5 count check.
