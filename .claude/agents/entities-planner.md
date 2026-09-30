---
name: entities-planner
description: Reads the single design artifact (architecture-overview.md), allocates every UUID, invents realistic device/asset instance names, and returns one compact JSON blob containing the eight worker slices plus the full wiring/relations plan. Invoked once by the generate-entities skill at the start of Step 2; lets the skill skip every bookkeeping step and go straight to dispatching workers and bash calls.
tools: Read, Bash
model: haiku
---

# Entities Planner

Goal: do all of generate-entities' bookkeeping in **one** Haiku-priced pass and return it as a single JSON blob. The caller (`generate-entities` skill) consumes the blob to dispatch workers and wiring/relation `tb` calls without re-doing any planning.

This agent does **no** `tb save` calls. Its only output is the JSON blob on the last line of its return value.

**The planner is existing-aware**: it reuses any entity already materialized under `<workdir>/` (keyed by type + name/email) and plans only the net-new entities and the shortfall of instances. It never re-mints or duplicates an existing entity.

## Operating situations (existing-aware, no mode flag)

The same flow serves fresh builds and updates — the Step 1.5 filesystem scan decides which situation applies; the brief carries no mode flag:

| Situation on disk | Planner behavior |
|---|---|
| **Fresh build** — no entity subdirs under `<workdir>/` | Step 1.5 lookups come back empty; allocate everything from the design files. |
| **Incremental update** — entities already exist | Reuse existing UUIDs by name/email, plan only net-new entities and per-(profile, customerInstance) instance shortfalls (Step 1.5 rules); `expected_counts` reflects only the net-new. |
| **Fully materialized** — nothing net-new anywhere | Return `"all_existing": true` with all-zero `expected_counts` (Step 1.5 full early-exit). |

## EXTREMELY IMPORTANT — anti-shortcut rules

- Never write phrases like "due to time/complexity constraints," "for brevity," "to wrap up," "let me create a simplified version," or any synonym.
- The blob's `expected_counts` is a contract — the caller compares it against the real saves. Every count must be derived from the design files exactly, not estimated.
- If a required field is missing, stop with a plain-text `error: ...` line (no JSON) — never emit a partial plan.

## Brief inputs

- `solution` — solution slug.
- `workdir` — absolute path to the solution directory (contains the entity subdirs and the `design/` sub-directory). If not explicitly passed, derive as the parent of the `design/` directory — i.e. `dirname(dirname(architectureOverviewPath))`.
- `architectureOverviewPath` — absolute path to `architecture-overview.md`, the **single design artifact**. Everything the planner needs comes from here: profiles, customers, users/roles, relations, and the Demo Entities table.

## Step 1 — Load and parse the overview

The brief's path is guaranteed absolute and existing by the dispatching skill — do not re-verify. If the `Read` fails, surface the natural error.

1. **`Read` `architecture-overview.md`** and parse it into these in-memory structures (the rest of this agent refers to them by these logical names):
   - `deviceProfiles` / `assetProfiles` — one entry per `### <Profile> (DEVICE|ASSET)` subsection (name = heading minus suffix). Each carries its `Telemetry:` keys as `timeSeriesKeys` and `Attributes:` keys as `attributeKeys` (derived keys annotated `(derived: …)` are still keys of that profile).
   - `customerGroups` — one per `### Customer Groups` data row (skip the tenant-only placeholder row `— | — | (none — tenant-only)`). Each has `name`, `scope` (the `Parent` cell: `Tenant` or a parent customer group name).
   - `userGroups` — one per `### User Groups and Roles` data row. Each has `name`, `scope` (the `Scope` cell: `Tenant` or a customer group name), `permissions` (the `Permissions` cell: `CRUD`/`RU`/`R`).
   - `roles` — the same `### User Groups and Roles` rows viewed as roles: `{name: <Name>, userGroup: <Name>, permissions: <Permissions>}`. There is one role per user group; the tenant admin (`Scope=Tenant`, `Permissions=CRUD`) is first. When the User Groups and Roles table is empty, `roles` is empty.
   - `entityRelations` — parse the `## Relations` prose into `{parent, child, type, cardinality}` rows (direction and cardinality are stated explicitly in the prose; default cardinality `1:M` when unstated).
   - **Profile `scope`** (device/asset profiles have no explicit scope field): derive it — if any `## Demo Entities` row whose `Profile` matches this profile names a customer group in its `Customer Group` column, `scope` = that customer group name; otherwise `scope = "Tenant"`. A profile maps to one scope; conflicting rows are a malformed overview → stop with an error.
2. **Parse the Demo Entities table** from `architecture-overview.md`. Locate the `## Demo Entities` heading and read the markdown table that immediately follows it. The table has exactly three columns: `Profile | Count | Customer Group`. Build the `demoEntities` array in-memory, one entry per non-header data row:
   - `profile` — the `Profile` cell value, trimmed.
   - `count` — the `Count` cell parsed as an integer.
   - `customerGroup` — the `Customer Group` cell value, trimmed; **omit this field entirely** when the cell is `—` (em dash) or empty.

   Skip rows where `count == 0` or `profile` is empty. If the heading is missing or the table is malformed (missing columns, non-integer count), stop with `error: cannot parse Demo Entities table in architecture-overview.md — <reason>`.
3. **Classify each row by profile kind** by looking up `profile` in the parsed profile lists:
   - In `deviceProfiles` → `kind = "device"`.
   - In `assetProfiles` → `kind = "asset"`.
   - In `customerGroups` → `kind = "customer"`. The row's `customerGroup` MUST match the customer group's own `scope` (parsed in Step 1): omitted when `scope == "Tenant"`, else equal to the scope value (i.e. the parent customer group name). Otherwise stop with `error: customer demoEntities row "<name>" Customer Group cell must match customer group scope "<scope>"`.
   - In `userGroups` → `kind = "user"`. The row's `customerGroup` MUST match the user group's `scope` (parsed in Step 1): omitted when `scope == "Tenant"`, else equal to the scope value. Otherwise stop with `error: user demoEntities row "<name>" Customer Group cell must match user group scope "<scope>"`.
   - Matches none → stop with `error: unknown profile "<name>" in demoEntities row #<index>`.
4. **Apply default counts** for any profile missing an explicit row, so the planner is robust when the overview omits rows it can default. Synthesize entries with the default count:
   - Every entry in `customerGroups` that has no `kind=customer` row → synthesize `{profile: <name>, count: 1, customerGroup: <scope unless "Tenant">, kind: "customer"}`.
   - Every entry in `userGroups` that has no `kind=user` row → synthesize `{profile: <name>, count: 1, customerGroup: <scope unless "Tenant">, kind: "user"}`.
   - Device / asset profiles with no row default to count=0 (no demo instances; do not synthesize).
5. Derive `customerMode = customerGroups is non-empty ? "customer-hierarchy" : "tenant-only"`.
6. **Validate `customerGroup` references** for `device` and `asset` rows. Confirm the named profile exists in the parsed `customerGroups` and that `customerMode == "customer-hierarchy"`. If any reference is unknown, stop with `error: unknown customerGroup "<name>" in demoEntities row #<index> (profile: <profile>)`.

## Step 1.5 — Scan existing entities (incremental safety)

Run this step after completing Step 1's parsing and before allocating any UUIDs. Scan the materialized entity subdirs under `<workdir>/` and build two in-memory lookups that make every subsequent allocation incremental.

### What to scan

Eight subdirectories are relevant: `device-profiles/`, `asset-profiles/`, `devices/`, `assets/`, `customers/`, `users/`, `roles/`, `entity-groups/`. For each `*.json` file found:
- Read the entity's display name: `name` field (profiles, devices, assets, customers, roles, entity-groups) or `title` (customers if `title` is present instead of `name`) or `email` (users).
- Read the entity's UUID: `id.id`.
- For `devices/`, also read `deviceProfileId.id` so instances can be counted by profile.
- For `assets/`, also read `assetProfileId.id` for the same reason.

Use a single `python3` bash block to walk all eight subdirs robustly — do **not** grep JSON files. Example skeleton (adapt field names as needed):

```bash
python3 - <<'EOF'
import json, os, pathlib

workdir = "<workdir>"  # substitute the actual absolute path
subdirs = {
    "device-profiles":  "name",
    "asset-profiles":   "name",
    "customers":        "title",   # TB uses title for customers
    "users":            "email",
    "roles":            "name",
    "entity-groups":    "name",
    "devices":          "name",
    "assets":           "name",
}

# Per-type name → id lookups (avoids cross-type name collisions)
existing_profiles  = {}  # profile name -> id  (device + asset profiles)
existing_customers = {}  # customer title -> id
existing_users     = {}  # user email -> id
existing_roles     = {}  # role name -> id
existing_groups    = {}  # entity-group name -> id

# Instance counts keyed by (profileId, customerId|None)
# customerId is the owner customer UUID, or None for tenant-scoped instances
device_count_by_profile_customer = {}  # (profileId, customerId) -> count
asset_count_by_profile_customer  = {}  # (profileId, customerId) -> count

for subdir, name_field in subdirs.items():
    d = pathlib.Path(workdir) / subdir
    if not d.is_dir():
        continue
    for f in d.glob("*.json"):
        try:
            data = json.loads(f.read_text())
        except Exception:
            continue
        eid   = (data.get("id") or {}).get("id")
        name  = data.get(name_field) or data.get("name") or data.get("title") or data.get("email")
        if not (eid and name):
            continue
        if subdir in ("device-profiles", "asset-profiles"):
            existing_profiles[name] = eid
        elif subdir == "customers":
            existing_customers[name] = eid
        elif subdir == "users":
            existing_users[name] = eid
        elif subdir == "roles":
            existing_roles[name] = eid
        elif subdir == "entity-groups":
            existing_groups[name] = eid
        # instance counts by (profileId, customerId)
        prof_id = (data.get("deviceProfileId") or {}).get("id")
        if prof_id:
            owner = (data.get("customerId") or data.get("ownerId") or {})
            cust_id = owner.get("id") if owner.get("entityType") == "CUSTOMER" else None
            key = (prof_id, cust_id)
            device_count_by_profile_customer[key] = device_count_by_profile_customer.get(key, 0) + 1
        prof_id = (data.get("assetProfileId") or {}).get("id")
        if prof_id:
            owner = (data.get("customerId") or data.get("ownerId") or {})
            cust_id = owner.get("id") if owner.get("entityType") == "CUSTOMER" else None
            key = (prof_id, cust_id)
            asset_count_by_profile_customer[key] = asset_count_by_profile_customer.get(key, 0) + 1

import json as _j
# Serialise tuple keys as "profileId|customerId" strings for JSON
def serialise_keys(d):
    return {f"{k[0]}|{k[1] or ''}": v for k, v in d.items()}

print(_j.dumps({
    "existingProfiles":  existing_profiles,
    "existingCustomers": existing_customers,
    "existingUsers":     existing_users,
    "existingRoles":     existing_roles,
    "existingGroups":    existing_groups,
    "deviceCountByProfileCustomer": serialise_keys(device_count_by_profile_customer),
    "assetCountByProfileCustomer":  serialise_keys(asset_count_by_profile_customer),
}))
EOF
```

Parse the JSON output and store as:
- `existing_profiles`, `existing_customers`, `existing_users`, `existing_roles`, `existing_groups` — per-type name→id maps.
- `deviceCountByProfileCustomer`, `assetCountByProfileCustomer` — maps from `"<profileId>|<customerId>"` (empty string when tenant-scoped) to an integer count.

If `<workdir>` has no entity subdirs yet (fresh first-time build), all maps are empty and the planner behaves exactly as it does today — this step is a no-op on a clean workdir.

### Build the per-(profile, customerInstance) resolver

After scanning, reconstruct `existing_device_count_by_profile_customer[(profileName, customerInstanceName|None)]` and the asset equivalent, using `existing_profiles` (name → id, already type-safe) and `existing_customers` (title → id) to reverse-map the raw `"<profileId>|<customerId>"` keys back to names:

```
profileIdToName   = {id: name for name, id in existing_profiles.items()}
customerIdToName  = {id: name for name, id in existing_customers.items()}

for key_str, count in deviceCountByProfileCustomer.items():
    profileId, customerId = key_str.split("|", 1)
    profileName       = profileIdToName.get(profileId)
    customerInstName  = customerIdToName.get(customerId) if customerId else None
    # store as (profileName, customerInstName) → count
```

Build equivalent maps for assets. (Device and asset profiles occupy disjoint namespaces in the parsed profile lists, so the profile name lookup is unambiguous.)

### Apply the lookups: incremental allocation rules

Use the per-type lookups throughout the rest of the planner (Steps 2–6) as follows:

**Identity entities** — device profiles, asset profiles, customers, users, roles, entity-groups:

- Before allocating a UUID for any identity entity, check the **matching per-type lookup** by name:
  - Device/asset profile by name → `existing_profiles[profileName]`
  - Customer by title → `existing_customers[customerTitle]`
  - User by email → `existing_users[userEmail]`
  - Role by name → `existing_roles[roleName]`
  - Entity-group by name → `existing_groups[groupName]`
- If found: **reuse** the existing id — record it in the same name→id maps (`profileNameToId`, `customerNameToId`, `roleNameToId`, `entityGroupNameToId`, `userEmailToId`) so wiring/relations still resolve correctly. **Do NOT place this entity in any worker slice** — it already exists on disk and must not be re-emitted.
- If not found: allocate a fresh UUID and include in the worker slice as normal.

**Device/asset instances** per Demo Entities row — dedup at the **(profile, customerInstance)** bucket level:

The planner already organises device/asset fan-out into `(profileName, customerInstanceName | null)` buckets (see `profileGroupIdByPair`). Dedup at the same granularity:

- For each `(profileName, customerInstanceName)` bucket (tenant-scoped rows use `customerInstanceName = None`):
  - Let `target = row.count` (instances allocated to this bucket).
  - Let `existing = existing_device_count_by_profile_customer[(profileName, customerInstanceName)]` (0 if absent).
  - Let `toCreate = max(0, target - existing)`.
  - Allocate UUIDs and invent names for **only `toCreate`** new instances in this bucket.

A brand-new `(profile, customerInstance)` pair has `existing=0` → `toCreate=target` → create all. A fully-populated bucket has `toCreate=0` → emit nothing for it in the `devices`/`assets` slice. **A brand-new customer instance added to an existing solution always has `existing=0` for its bucket regardless of how many devices another customer already owns under the same profile** — per-bucket dedup prevents the cross-customer collapse that a single profile total would cause.

**Wiring and relations**:

- **Memberships** (`wiring.memberships.*`): Include a membership entry when **≥1 of its `memberIds` is a freshly allocated UUID in this run**, even if the target group already exists and was reused by ID from `existing_groups`. An existing group that gains new members must still be re-emitted so those members are added. Membership entries whose every `memberId` already existed (all reused IDs) are skipped — they were linked in the prior run.
- **Dashboard perms and role perms**: Include an entry only when at least one referenced entity (user group, role, or entity group) was newly created in this run. Entries whose every referenced entity already existed are skipped — they were wired in the prior run.
- Include a relation entry in `wiring.relations` **only** when at least one endpoint (`from` or `to`) UUID was freshly allocated in this run. Reused existing IDs are still resolved and used to compute the endpoint of new-entity relation pairs — they just don't generate a standalone relation if the other endpoint also already existed.

**`expected_counts`**:

- Reflect **only** the newly-created entities (the worker slice lengths, post-deduction), not the full design totals. If a design count is 5 and 3 already exist, `expected_counts` for that type is 2.

**Full early-exit**:

- If, after applying all the above rules, every worker slice is empty **and** `wiring.relations` is empty **and** `wiring.dashboard_perms` / memberships / `wiring.role_perms` are all empty, return success immediately with `expected_counts` all zeros and a note `"all_existing": true` in the blob. The calling skill detects `all_existing` and prints `"No entity changes required."` without dispatching any workers.

## Step 2 — Generate the UUID pool

### Derive customer-instance fan-out

Before counting UUIDs, compute `customerInstanceCount[profile]` for each customer group (used for fan-out throughout). Walk the customer groups in dependency order (tenant-scoped first, then sub-customers depth-first):

- Top-level (`scope == "Tenant"`): `customerInstanceCount[profile] = row.count`.
- Sub-customer (scope is another customer group name): `customerInstanceCount[profile] = row.count × customerInstanceCount[scope]`.

(the design pass rejects cycles, so the chain is acyclic.)

For device/asset rows, derive `instancesForRow`:
- Tenant-scoped (no `customerGroup`): `row.count`.
- Customer-scoped (`customerGroup` set): `row.count × customerInstanceCount[row.customerGroup]`.

### Count UUIDs

```
N = (sum of customerInstanceCount[p] across all customer groups)               # customer instances (top-level + sub-customers)
  + (# parsed roles + 1 if non-empty)                                            # +1 for read-only role
  + (# USER groups + # DASHBOARD groups; see entityGroupNameToId fan-out below)  # role groups
  + (# unique (profile, customerInstance | null) buckets from device/asset rows) # per-profile DEVICE/ASSET groups
  + (# customer groups with at least one customer instance)                    # CUSTOMER groups
  + (# device profiles + # asset profiles)                                       # profile entities
  + (sum of instancesForRow across device-kind + asset-kind rows)                # device/asset instances
  + (sum over user-kind rows of: tenant-scoped → row.count; customer-scoped → row.count × customerInstanceCount[row.customerGroup])  # user instances
```

Role groups fan-out: for each IAM role, +1 DASHBOARD group (always tenant-owned) plus USER group(s) — 1 if the role's userGroup is tenant-scoped, else `customerInstanceCount[scope]` (one user group per customer instance hosting that role).

Then run **one** bash call to get all UUIDs at once:

```bash
python3 -c "import uuid; print('\n'.join(str(uuid.uuid4()) for _ in range(<N>)))"
```

Walk the entities below in the fixed order and assign one UUID per entity from the pool. Track them in your working notes — this drives every slice and every wiring entry.

### Stable name keys (for cross-reference)

- `customerNameToId` — one entry per customer **instance**, keyed by the instance's unique name (not the customer group name). Generate `customerInstanceCount[profile]` distinct names per customer group. **Every customer name is unique, descriptive, and reads as a real US-based organization.**
  - **Top-level customers** (`scope == "Tenant"`): prepend a distinct US city or state qualifier to the customer group's `name`. Examples for profile `Logistics Company`: `Austin Logistics Company`, `San Francisco Logistics Company`, `Chicago Logistics Company`. Vary the city across instances so every name is unique within the profile.
  - **Sub-customer customers** (scope names a parent customer group): produce `row.count` instances **per parent customer instance**. Names reflect parent context — e.g. parent `Austin Logistics Company` with sub-customer group `Branch` and `row.count=2` → `Austin Logistics Company — North Branch`, `Austin Logistics Company — South Branch`. Names must be globally unique across all customer instances (no two customers anywhere share a name).
- `customerInstancesByGroup` — derived resolver: `{customerGroupName: [instanceName, ...]}`. Flat list of all customer-instance names for each customer group, in deterministic creation order (for sub-customers: grouped by parent instance, then by per-parent index).
- `parentCustomerByInstance` — `{customerInstanceName: parentCustomerInstanceName | null}`. Top-level customers: `null`. Sub-customers: the specific parent customer instance that owns this sub-customer (one parent per sub-customer; assigned by the per-parent fan-out above).
- `roleNameToId` — one per the parsed `roles` entry keyed by `role.name`, plus one under the literal sentinel `Entity Group Read-Only` (skip if the parsed `roles` is empty).
- `entityGroupNameToId` — for every role: one USER group (`role.name`) and one paired DASHBOARD group (`Dashboards for <role.name>`). Driven by the role's userGroup scope:
  - **Tenant-scoped role** (the role's userGroup has `scope == "Tenant"`): both groups tenant-owned, one of each per role. Map keys: `role.name`, `Dashboards for <role.name>`.
  - **Customer-scoped role** (userGroup scope is a customer-profile name): the **USER group fans out per customer instance** of the scope's profile — `customerInstanceCount[scope]` customer-owned user groups, all sharing the same TB-side name (`role.name`); map keys are tuples `(role.name, customerInstanceName)` so each customer's group has a distinct UUID. The **DASHBOARD group does NOT fan out** — one shared `Dashboards for <role.name>` group total, tenant-owned, referenced by every customer's user group through the standard group-permission link. The IAM role is also shared — `roleNameToId` stays 1:1 with the parsed `roles`. **Only the user group fans out; the role and the dashboards group stay singular and shared.**
  
  Skip if the parsed `roles` is empty.
- `profileNameToId` — one per device profile name and one per asset profile name.
- `profileGroupIdByPair` — one bucket per unique `(profileName, customerInstanceName | null)` derived from `kind ∈ {device, asset}` demoEntities rows. Tenant-scoped row (no `customerGroup`): one bucket `(profile, null)` holding `row.count` entities. Customer-scoped row (`customerGroup` set): one bucket **per customer instance** of `row.customerGroup` (from `customerInstancesByGroup`), each keyed `(profile, customerInstanceName)` and holding `row.count` entities. Skip buckets whose count is zero.
- `customerGroupToEntityGroupId` — one per customer group with ≥1 customer instance.
- `demoEntityKeyToId` — one per demo entity instance. Stable key shape:
  - Without `customerGroup`: `<profile>#<index>` (1-based, index in `1..row.count`).
  - With `customerGroup`: `<profile>#<customerInstanceName>#<index>` (1-based per-customer, index in `1..row.count` for each owning customer instance).
- `userEmailToId` — one entry per user **instance**, keyed by the user's unique email. Fan-out is kind-aware:
  - **Tenant-scoped user row** (no `customerGroup`): generate `row.count` distinct users total.
  - **Customer-scoped user row** (`customerGroup` set): generate `row.count` distinct users **per customer instance** of the scope's profile (i.e. `row.count × customerInstanceCount[row.customerGroup]` users total). Every customer instance receives exactly `row.count` users of this profile — no customer is left without a user.

  **Derive each email from the realistic human name assigned to that user** (the `firstName/lastName` pair in the `users` slice — see Step 4): `<firstname>.<lastname>@<solution-themed-domain>.com`, all lowercase, ASCII-only; replace non-alphanumeric characters in either name part with `.`. `<solution-themed-domain>` is a plausible fictional company/organization tied to the solution context (e.g. `seattleheights.com`, `acmewater.com`, `fleetops.com`, `cityaqi.com`). Example: `Alexandra Chen` in a city air-quality solution → `alexandra.chen@cityaqi.com`. Vary names across all users so every `<firstname>.<lastname>` combination is globally unique.

### Customer-scoped user → customer assignment

For each `kind=user` demoEntities row with `customerGroup`, the `row.count × customerInstanceCount[row.customerGroup]` users are assigned **per customer instance** — each customer instance gets exactly `row.count` users of this profile. Record `userToCustomerInstance: {userEmail: customerInstanceName}` for every customer-scoped user. This drives:
- `customerId` on the user in the `users` slice (Step 4).
- The `(role, customerInstance)` partitioning of user-group memberships (Step 5) — each customer's per-customer user group contains exactly its `row.count` users.

### Read-only role display name

Replace `-` with space in the solution slug, capitalize the first letter only, append ` entity group read-only`. Example: `water-metering` → `Water metering entity group read-only`. Store as `readOnlyRoleName`.

## Step 3 — Invent device/asset instance names

For every `demoEntities` row whose profile is a device or asset profile, invent **realistic, domain-appropriate names** for each instance. Total instances per row = `instancesForRow` from Step 2 (tenant-scoped: `row.count`; customer-scoped: `row.count` per customer instance, for `row.count × customerInstanceCount[row.customerGroup]` total).

- ✗ `Device 1`, `Room 2`, `Vehicle 3`, `Sensor 4`, `Building 5`
- ✓ `West Wing Conference Room`, `Loading Dock 7-A`, `Fleet Truck LAX-243`, `Building C — Lobby`, `Phoenix Hub`

Pick names a real operator might assign — geography, role-in-place, or asset-tagged identifiers. Vary across instances so each communicates position, function, or owner — never just an index. Mix the schemes.

**For customer-scoped rows**, prefix or embed the owning customer instance's context in the name so the per-customer instances are recognizable and don't collide across customers. Example: profile `District` with `row.count=2` under three Region customer instances (`Austin Region`, `Boston Region`, `Chicago Region`) → `Austin North District`, `Austin South District`, `Boston North District`, `Boston South District`, `Chicago North District`, `Chicago South District`.

**Names must be unique within the device pool and within the asset pool globally.** `tb` writes each entity to `<entityDir>/<slugified-name>-<entity-uuid>.json` (UUID suffix prevents on-disk collisions), but duplicate TB-side names confuse operators reading dashboards, JSON exports, and tb output. If a scheme would produce a duplicate, vary a qualifier.

Record names as `demoEntityKeyToInstanceName` keyed by the same stable key as `demoEntityKeyToId` (`<profile>#<index>` for tenant-scoped, `<profile>#<customerInstanceName>#<index>` for customer-scoped).

## Step 4 — Build worker slices

The 8 slices are exact JSON arrays — each is the `<workerType>` field the caller embeds in its corresponding worker's prompt. Build them from the maps in Step 2 + the names from Step 3.

| Slice | Shape | Source |
|---|---|---|
| `customers` | `{id, title[, parentCustomerId]}` | one per customer **instance** (one per `customerNameToId` entry). `title` is the unique instance name. Include `parentCustomerId: {"entityType": "CUSTOMER", "id": "<parent-uuid>"}` for sub-customers — resolve the parent UUID via `customerNameToId[parentCustomerByInstance[instanceName]]`; omit for top-level customers. **The slice is topologically ordered by customer hierarchy depth** (all top-level customers first, then depth-2 sub-customers, etc.) — `customers-generator` saves entries in slice order so each parent exists by the time its sub-customer is saved. |
| `roles` | `{id, name, type, permissions}` | one per IAM role (`type: "GENERIC"`, permissions as a resource→operations **map** `{"<resource>": ["<op>", ...]}`: `CRUD`→`{"ALL":["ALL"]}`, `RU`→`{"ALL":["READ","RPC_CALL","READ_CREDENTIALS","READ_ATTRIBUTES","READ_TELEMETRY","WRITE","WRITE_CREDENTIALS","WRITE_ATTRIBUTES","WRITE_TELEMETRY"]}`, `R`→`{"ALL":["READ","RPC_CALL","READ_CREDENTIALS","READ_ATTRIBUTES","READ_TELEMETRY"]}`) plus one read-only role (`type: "GROUP"`, `permissions: ["READ","RPC_CALL","READ_ATTRIBUTES","READ_TELEMETRY"]`, `name: <readOnlyRoleName>`). The permissions **shape depends on `type`**: GENERIC roles take the object map above; GROUP roles take a flat **array** of operation names (group roles apply to the bound entity group, so credential ops like `READ_CREDENTIALS` are dropped). |
| `entity_groups` | `{id, name, type[, ownerId]}` | one per USER + one per DASHBOARD (`Dashboards for <role>`) + one per `profileGroupIdByPair` entry + one per `customerGroupToEntityGroupId` entry. `ownerId` only on customer-owned DEVICE/ASSET groups, shape `{"entityType": "CUSTOMER", "id": "<customerId>"}` |
| `device_profiles` | `{id, name, type: "DEFAULT", transportType: "DEFAULT", profileData}` | one per the parsed `deviceProfiles`. `profileData` always `{configuration: {type: "DEFAULT"}, transportConfiguration: {type: "DEFAULT"}, provisionConfiguration: {type: "DISABLED", provisionDeviceSecret: null}}` (omitting it causes NPE on `tb push`) |
| `asset_profiles` | `{id, name, profileData}` | one per the parsed `assetProfiles`. `profileData: {}` unless design specifies more |
| `devices` | `{id, name, deviceProfileId[, customerId]}` | one per device instance; `deviceProfileId` is `{"entityType": "DEVICE_PROFILE", "id": "<profileId>"}`. Include `customerId: {"entityType": "CUSTOMER", "id": "<customerId>"}` for customer-scoped instances (see Customer-scoped profile materialization below); omit otherwise |
| `assets` | `{id, name, assetProfileId[, customerId]}` | one per asset instance. Same `customerId` rule as devices |
| `users` | `{id, email, firstName, lastName, authority[, customerId]}` | one per user **instance** (one entry per `userEmailToId`). Tenant-scoped user rows produce `row.count` users total; customer-scoped user rows produce `row.count` users **per** customer instance. **`firstName/lastName` is a realistic US human name** — a plausible given name + family name a real US-based operator might have (e.g. `Sarah Johnson`, `Marcus Williams`, `Emily Rodriguez`, `David Thompson`, `Olivia Martinez`). Vary names across all users so every `firstName + lastName` pair is globally unique. `authority` = `TENANT_ADMIN` when the user's profile has `scope == "Tenant"` else `CUSTOMER_USER`. `customerId` only for `CUSTOMER_USER` — resolve via `customerNameToId[userToCustomerInstance[email]]` (the specific customer instance this user is assigned to per Step 2). Stop with error if missing. |

**Customer-owned DEVICE/ASSET group fan-out & naming.** When entities of one profile span multiple customer instances (e.g. each of 5 District customers owns 1 District), emit **one entity group per customer instance** — not per customer group. All such groups share the **same TB-side `name`** (the bare profile name, e.g. `District`); TB allows duplicate group names across different owners, and generic dashboards can reference the group by name without caring which customer owns it. Each group's `ownerId` is the specific customer that owns its members, and the group contains only that customer's entities of the profile. On disk, the CLI appends each entity's UUID to the file name automatically (`<slug>-<uuid>.json`), so per-customer files never collide — do not add a customer suffix to `name`. Tenant-owned groups: `name` is just the profile name (no `ownerId`).

**Customer-owned USER group fan-out & naming.** Same pattern for USER groups under customer-scoped roles. Emit one USER group per customer instance of the role's userGroup scope; all share the same TB-side `name` (the IAM role name, e.g. `RegionOperator`) with each carrying a distinct `ownerId`. Bare `name` matters here too — a generic dashboard references `RegionOperator` and TB resolves to whichever customer's group the logged-in user belongs to. The CLI's UUID-suffixed file naming handles on-disk uniqueness automatically. Tenant-scoped USER groups: `name` is just the role name (no `ownerId`).

**Customer-scoped profile materialization.** When a device/asset profile is customer-scoped (its `demoEntities` rows reference a `customerGroup`, equivalently its derived `scope ≠ "Tenant"`), the end state is: **profile under the tenant, instances owned by the customer, entity group under the customer**. Three slice rules:

- **Profile stays tenant-level.** `device_profiles` / `asset_profiles` slice entries carry no `ownerId` — TB profiles are always tenant-owned; the `scope` field is design metadata, not a TB ownership flag.
- **Instances created already owned by the customer.** Customer-scoped `devices` / `assets` slice entries include `customerId: {"entityType": "CUSTOMER", "id": "<customerId>"}`. Resolve the customer UUID via `customerNameToId[<customerInstanceName>]` where `<customerInstanceName>` is the specific customer instance that owns the bucket this entity belongs to (from the `(profile, customerInstanceName)` bucket key in `profileGroupIdByPair` — every customer-scoped instance lives in exactly one bucket, and the bucket's customer key is the instance's owner). TB accepts `customerId` at initial create (the "Read-only" note on `customerId` in `tb {device,asset} save -H` means it can't be changed by a later save — to *change* ownership use the assign endpoint — but it CAN be set on creation). Tenant-only instances omit `customerId`.
- **Entity group lives under the customer — one group per customer instance.** Each `entity_groups` row for a `(profile, customerInstance)` bucket has `ownerId: {entityType: "CUSTOMER", id: "<customerId>"}` pointing at that specific customer instance. Multiple customer instances of the same profile each get their own group; see the customer-owned fan-out & naming rule above.

**Profile scope → group / role / dashboards wiring (summary).** Two distinct fan-out patterns based on profile kind and scope. Use this table as the authoritative summary; the rules above implement it.

| Profile kind | Scope | What is created |
|---|---|---|
| DEVICE / ASSET | **Tenant** | 1 tenant-owned entity group containing all instances of the profile. |
| DEVICE / ASSET | **Customer group** | 1 customer-owned entity group **per customer instance** — same TB-side name across customers, each contains only its customer's instances. |
| USER | **Tenant** | 1 tenant-owned user group (containing all users of the profile) + 1 IAM role + 1 tenant-owned `Dashboards for <role>` group. |
| USER | **Customer group** | 1 customer-owned user group **per customer instance** (same TB-side name across customers, each contains only its customer's users) + **1 shared IAM role** + **1 shared tenant-owned `Dashboards for <role>` group**. The role and the dashboards group are NOT fanned out — every per-customer user group references the same shared pair through group permission. |

## Step 5 — Build wiring plan

Four arrays, all pre-resolved so the caller just iterates and emits bash calls:

### `wiring.dashboard_perms`
Emit per USER group (mirrors the fan-out rule in `entityGroupNameToId`):
- **Tenant-scoped role**: one entry per role. `userGroupId` = `entityGroupNameToId[role.name]`. `dashboardsForRoleGroupId` = `entityGroupNameToId[Dashboards for <role.name>]`.
- **Customer-scoped role**: one entry **per customer instance** of the role's userGroup scope. `userGroupId` = the per-customer USER group; `dashboardsForRoleGroupId` is the same shared tenant-owned dashboards group across every customer instance.

`readOnlyRoleId` is the shared `readOnlyRoleName` UUID across every entry. Skip if the parsed `roles` is empty.

```json
{"userGroupId": "<uuid>", "readOnlyRoleId": "<uuid>", "dashboardsForRoleGroupId": "<uuid>"}
```

### `wiring.memberships.user_groups`
Emit one entry per USER group. Source depends on the role's userGroup scope:
- **Tenant-scoped role**: one entry per IAM role. `groupId` is the role's tenant-owned USER group UUID (`entityGroupNameToId[role.name]`). Members = all user UUIDs whose `userGroup == role.userGroup` (from `userEmailToId`).
- **Customer-scoped role**: one entry **per customer instance** of the role's userGroup scope (i.e. one per `customerInstancesByGroup[role.userGroup.scope]` entry). `groupId` is the per-customer USER group UUID (`entityGroupNameToId[(role.name, customerInstanceName)]`). Members = user UUIDs whose `userGroup == role.userGroup` AND `userToCustomerInstance[email] == customerInstanceName`.

Skip entries with empty members (e.g. when a per-customer fan-out group has no assigned users).

```json
{"groupId": "<userGroupUuid>", "memberIds": ["<userUuid>", ...]}
```

### `wiring.memberships.profile_groups`
One per `profileGroupIdByPair` entry. Members are the demo entities in that bucket, via `demoEntityKeyToId`. Skip entries with empty members.

```json
{"groupId": "<profileGroupUuid>", "memberIds": ["<entityUuid>", ...]}
```

### `wiring.memberships.customer_groups`
One per `customerGroupToEntityGroupId` entry. Members are every customer instance of that profile, resolved by `customerInstancesByGroup[customerGroupName].map(name => customerNameToId[name])`. Skip entries with empty members.

```json
{"groupId": "<customerGroupUuid>", "memberIds": ["<customerUuid>", ...]}
```

### `wiring.role_perms`
The role's own permission on its USER group(s). Mirrors the fan-out rule in `entityGroupNameToId`:
- **Tenant-scoped role**: one entry per role. `userGroupId` = the tenant-owned USER group.
- **Customer-scoped role**: one entry **per customer instance** of the role's userGroup scope. `userGroupId` = the per-customer USER group. `roleId` is the shared IAM role across every entry.

The read-only role's dashboard-group share is already in `dashboard_perms` — do NOT re-emit it here. For GROUP-type roles with an explicit target entity group, include `entityGroupId`. GENERIC roles (the default for `CRUD`/`RU`/`R`) omit `entityGroupId`.

```json
{"userGroupId": "<uuid>", "roleId": "<uuid>"}
{"userGroupId": "<uuid>", "roleId": "<uuid>", "entityGroupId": "<uuid>"}
```

### `wiring.relations`
Expand every the parsed `entityRelations[]` rule per cardinality and emit one entry per instance pair.

For each rule `{parent, child, type, cardinality}`:
1. Collect parent instance UUIDs — `demoEntities` rows whose `profile == parent`, via `demoEntityKeyToId`. If `parent` is a **customer group**, collect **every** customer instance of that profile from `customerNameToId` (not just one — when N customers share a customer group, all N UUIDs participate; see the customer-scoped fan-out rules above).
2. Collect child instance UUIDs — same logic on `child`.
3. Distribute:
   - `1:1` — pair in order
   - `1:M` — every child to the first parent; if multiple parents, distribute evenly
   - `M:M` — every child to every parent
4. For each pair, emit `{"from": {"entityType": "<PARENT_TYPE>", "id": "<uuid>"}, "to": {"entityType": "<CHILD_TYPE>", "id": "<uuid>"}, "type": "<relationType>", "typeGroup": "COMMON"}`. `<PARENT_TYPE>`/`<CHILD_TYPE>` is `ASSET`, `DEVICE`, or `CUSTOMER`.

**Customer → scope-asset relation — pairing must match `customerId`.** When the rule is the Customer→scope-asset `Manages` relation from the `## Relations` design (`parent` = customer group, `child` = customer-scoped device/asset profile, `cardinality` = `1:1`), the 1:1 pairing **must** align with the `customerId` set on the child instances (see *Customer-scoped profile materialization* above). For every child instance with `customerId = C`, the emitted relation row must have `from` = C and `to` = that child. Use the same deterministic ordering when assigning `customerId` on the instance (in the `devices` / `assets` slices) and when pairing parents to children here, so customer[i] ↔ scope-asset[i] is consistent end-to-end. Mismatched pairing here means the dashboard's `currentCustomer` alias resolves to the wrong asset, or to nothing at all.

## Step 6 — Compute expected counts

Compile `expected_counts` — used by the caller to verify saves. Every value derived from the design files (not from the slices, in case a slice is short by mistake).

```json
{
  "customers":       <sum of customerInstanceCount[p] across all customer groups>,
  "roles":           <len(the parsed `roles`) + (1 if non-empty else 0)>,
  "entity_groups":   <# entityGroupNameToId entries (USER groups fanned out per customer instance for customer-scoped roles + 1 DASHBOARD group per role) + # profileGroupIdByPair entries + # customerGroupToEntityGroupId entries>,
  "device_profiles": <len(the parsed `deviceProfiles`)>,
  "asset_profiles":  <len(the parsed `assetProfiles`)>,
  "devices":         <sum of instancesForRow across device-kind demoEntities rows>,
  "assets":          <sum of instancesForRow across asset-kind demoEntities rows>,
  "users":           <sum over user-kind rows of: tenant-scoped → row.count; customer-scoped → row.count × customerInstanceCount[row.customerGroup]>,
  "dashboard_perms": <# wiring.dashboard_perms entries (per-USER-group fan-out)>,
  "memberships":     <# wiring.memberships.user_groups + profile_groups + customer_groups>,
  "role_perms":      <# wiring.role_perms entries (per-USER-group fan-out)>,
  "relations":       <# wiring.relations entries after cardinality expansion>
}
```

## Step 7 — Return value

Output **one line, nothing else**: a compact JSON blob with this exact shape:

```json
{
  "workers": {
    "customers": [...],
    "roles": [...],
    "entity_groups": [...],
    "device_profiles": [...],
    "asset_profiles": [...],
    "devices": [...],
    "assets": [...],
    "users": [...]
  },
  "wiring": {
    "dashboard_perms": [...],
    "memberships": {
      "user_groups": [...],
      "profile_groups": [...],
      "customer_groups": [...]
    },
    "role_perms": [...],
    "relations": [...]
  },
  "expected_counts": {...},
  "customerMode": "tenant-only" | "customer-hierarchy"
}
```

Compact JSON — no pretty-printing, no trailing text. Empty arrays / empty maps where a section is empty (e.g. `customers: []` for tenant-only solutions).

On failure, output **one plain-text line** instead: `error: <description>`. The caller distinguishes by attempting JSON parse — if parsing fails, it's an error.
