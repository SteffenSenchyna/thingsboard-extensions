---
name: pull-solution
description: "Pull (fetch) entities from the active ThingsBoard instance into a local solution via the tb CLI. Use when the user asks to pull, fetch, import, grab, refresh, or re-sync something from their instance/server — a whole solution, a group of related entities, a single entity, or a solution that already exists locally and needs re-syncing (e.g. 'pull temperature and humidity sensor from my instance', 'fetch my Pump-42', 'grab everything under the HQ building', 'import my existing devices into <solution>', 'pull my warehouse-monitoring solution', 'refresh <solution> from the instance')."
user-invocable: true
---

# Pull entities from a ThingsBoard instance

Fetch already-existing entities off the active instance into a local solution. The skill turns a natural-language ask ("pull the temperature and humidity sensor") into a matched set of instance entities, previews the **whole connected graph** that would be fetched, asks the user **once** whether the batch is correct, then pulls it with `tb pull`.

**This skill is pull-only.** Writing the entity files under `solutions/<slug>/` is the whole job — it ends there.

## Two modes

Decide which one the request is at the start of Step 1 — they share the same pull mechanism but differ in how the batch is found.

- **Discover mode** (default) — the entities live on the instance but are *not* tracked locally yet. Find them by name/description, preview their connected graph, confirm, pull. Steps 1–5 below.
- **Refresh mode** — the request names a solution that **already exists** under `solutions/<slug>/`. Re-sync the tracked entities from the instance *and* detect entities that were added to this solution on the instance since the last pull, offering to bring them in too. See **Refresh mode** below.

## Core principle

A ThingsBoard entity is connected to others in several ways, and `tb pull` only follows **relations** automatically:

- **Relations** (directional From/To links like `Contains`) and **embedded data** (attributes, calculated fields, alarm rules) — `tb pull <type> <uuid>...` follows these server-side. You get them for free.
- **Profile reference** (`deviceProfileId` / `assetProfileId`) and **ownership** (`ownerId` → customer) — `tb pull` does **not** materialize these, but the pulled entity file carries the IDs, so the reach-check resolves and pulls them.
- **Group membership** — the discoverer now reports it directly: each entity row carries a `groups` array (the groups it belongs to). So a matched entity's containing groups are **known** (verified, not guessed) — include them, and pulling a group then brings its members via the reach-check. `tb pull` itself won't materialize an entity's groups, so the skill adds them explicitly.
- **Group permissions (IAM)** — a group permission ties a **role** + a **user group** to an entity group. These govern access and are required for a pushable slice. Query them with `tb entity-group list-permissions <group-id>` (read side) and pull the roles + user groups they reference — see the reach-check's **IAM completion** step. Never guess these links.

So the real fetch set is bigger than the relation graph: for every matched device/asset/dashboard/user, also pull its **profile**, its **owning customer**, the **groups it belongs to** (from the discoverer's `groups` array), and any **sibling entities** the ask covers. The skill resolves these explicitly (Step 2 + the reach-check in Step 5) — never fetch by following relations alone, and never *guess* an entity's group (use the `groups` array). See the `thingsboard-concepts` skill for the entity model.

`tb pull ... --dry-run` prints the planned writes without touching disk — that is how the skill previews the assembled batch before committing.

```
related entities = (dry-run planned writes) − (the anchors the user matched)
```

## When to use

- "pull / fetch / import / grab `<thing>` from my instance / server"
- A single named entity that already exists: "pull my Pump-42", "fetch the HQ building asset"
- A descriptive slice: "pull the temperature and humidity sensors", "everything under the warehouse customer"
- Re-syncing a solution that already exists locally: "pull / refresh my warehouse-monitoring solution" → **Refresh mode**

## The one gate

This skill pauses the user **exactly once**: the batch-confirmation gate (Step 4 in Discover mode; the new-entities gate in Refresh mode, which fires only when the instance has entities not yet tracked locally). Every other step runs without stopping. Do not ask per-entity questions, do not ask separate "which candidate" and "confirm pull" questions — fold candidate disambiguation into the single batch presentation. The only extra prompt allowed is the zero-match fallback in Step 2 (ask for an exact name or UUID) and the error prompts (dirty-git / missing-id) shared by both modes.

## Invoked by create-solution

`create-solution`'s instance-import path delegates discovery + pull to this skill instead of inlining them. When invoked that way:

- **Inputs passed in:** the user's request (for terms/breadth), `mode=<interactive|autonomous>`, and optionally a pre-derived `slug`. If no slug is given, this skill owns slug derivation (Step 3) — deriving from the anchors and creating `solutions/<slug>/`.
- **No phrase?** That's the no-terms case in Step 2 — propose a batch, don't make the user pick.
- **Mode passes straight through** to the Step 4 gate: `interactive` confirms the batch, `autonomous` skips it exactly as Step 4 describes.
- **On return:** the entities are materialized under `solutions/<slug>/` and the resolved `slug` is known. `create-solution` continues from there with reverse-engineering (its Step 1f) and fold-in (1g) — this skill does not do those.

## Steps

### 1. Preflight and intent

1. Ensure local mode: `tb config mode local`.

   **Mode check first.** If the request names a solution that already exists under `solutions/<slug>/` (the user said "pull/refresh my `<slug>` solution", or cwd is inside one and they asked to re-sync it, and they did *not* name specific new entities to add), this is **Refresh mode** — jump to that section. Otherwise continue with Discover mode below.

2. Resolve the target solution slug, in order:
   - `--solution <name>` in the request, or a solution the user named → use it.
   - cwd is inside a `solutions/<slug>/` → use `<slug>`.
   - Otherwise leave it **undecided** — derive it after matching (Step 3) and only ask if derivation fails.
3. Parse the request into **search terms** and a **breadth signal**:
   - Search terms: entity names ("Pump-42"), profile/type words ("temperature", "humidity", "sensor"), container names ("HQ building", "warehouse customer").
   - Breadth: *targeted* (named entity or descriptive slice) vs *whole-solution* ("everything under X", "my whole X setup"). Breadth only changes how widely you match in Step 3 — the mechanism is identical.

### 2. Discover and match

1. Dispatch the `instance-entity-discoverer` agent (as a subagent) with `profile=<active>, limit=50`. It enumerates the **whole instance across every owner** — tenant devices/assets/**dashboards**/**users**/**roles**/**rule chains**/customers, plus entity groups (`groupType` = `DEVICE`/`ASSET`/`DASHBOARD`/`USER`) for the tenant **and each customer** — and returns rows grouped by type (`DEVICE`, `ASSET`, `DASHBOARD`, `USER`, `ROLE`, `RULE_CHAIN`, `CUSTOMER`, `ENTITY_GROUP`) as `{name, id, profile?, owner?, groupType?, roleType?}`. Do not hand-roll `tb device list | grep` — and do not invent `tb` flags (`--customer-id` and friends don't exist); the discoverer is the discovery path.

   **Dashboards, users, and roles count too.** Existing dashboards, users, roles, and their groups are part of the instance and must show up in the fetch — they are **not** connected to devices by relations, so they only appear if matched/anchored explicitly. Roles especially are easy to forget but are load-bearing — a pulled system that references a role missing locally won't push. Include matching dashboards, users, roles, and groups in the batch the same way as devices/assets; the gate preview must list them.

   **Customer-owned entities are first-class now:** the list commands include customer- and sub-customer-owned entities by default, so a device/asset/dashboard/user owned by a customer appears **directly** in its `DEVICE`/`ASSET`/`DASHBOARD`/`USER` rows with `owner` set to that customer. Match and anchor them like any other entity — no need to go through a group to find them. (Customer-owned **groups** still come from the discoverer's per-customer group enumeration; pulling a group is just an efficient way to grab all its members at once.) If the user reports a missing entity, check you didn't restrict to tenant scope — never improvise raw `tb` commands to hunt for it.
2. Match the search terms against the rows, case-insensitive, across **name, profile name, entity type, owner, and entity-group name** — not just exact device names. "temperature and humidity sensors" should match every device whose **profile** is a temperature/humidity sensor profile (tenant- **or** customer-owned — both are in the rows now) plus any entity group named for it. **Match exhaustively across all owners** — if two sensors fit and one is owned by a customer, both must be anchors; never stop at the first hit. When a group fits the ask, matching the **group** is a convenient anchor since pulling it grabs all members in one shot — but you can equally anchor a customer-owned entity directly by its own row.

   **Group matching is uniform across all group types — this is where it's easy to slip.** When a name matches a `DEVICE` group, check the discoverer's `ENTITY_GROUP` rows for a same-named or equally-relevant **`DASHBOARD`, `ASSET`, and `USER`** group (any owner) and **match those too**. Never match the device group "Temperature & Humidity" while silently skipping the dashboard group "Temperature & Humidity" — that's the usual reason a dashboard group goes missing. Likewise a matching **dashboard**, **user**, or **role** is an anchor in its own right. Dashboards, dashboard groups, users, user groups, and roles are **never** "pulled automatically because they're connected" (they have no relation/profile/owner link to a device) — they enter the batch **only** by matching, so when one is in the fetch it's a **Direct match**.

   **Roles are first-class anchors — never defer them.** The discoverer already returns every `ROLE` on the instance. If the batch contains **any** user group (whether matched directly or pulled because a customer is in the batch), anchor **every role** from the discoverer's `ROLE` rows whose owner is in the batch (tenant roles when tenant-scoped users are in; customer-owned roles when that customer is in). Pulling roles is not the reach-check's job — by the time Step 5 runs, the discoverer has already told you which roles exist, so anchor them in Step 2. The Step 5 IAM completion is a **safety net** for roles the discoverer missed (e.g. shared/inherited roles), not the primary mechanism.
   - For *whole-solution* breadth, match the named container (customer/asset) and anchor on it.
   - For *whole-system* breadth ("fetch my whole system", "return everything", "the entire setup") → anchor on **every** discovered entity group across **all** owners (tenant + each customer) — `DEVICE`, `ASSET`, `DASHBOARD`, **and `USER`** groups — plus all tenant-scope devices/assets/dashboards/users, **all roles**, **all rule chains**, and the customers themselves. That's how you pull a complete multi-customer system — dashboards, users, roles, and rule chains included — not just tenant entities.
3. Collect matches into an anchor list of `(entityType, id, name)` tuples, then **expand each anchor to its full footprint** so the fetch is complete (per **Core principle**):
   - its **profile** — `deviceProfileId` / `assetProfileId` (resolve to a `DEVICE_PROFILE` / `ASSET_PROFILE` anchor),
   - the **groups it belongs to** — straight from the anchor row's `groups` array (this is how a matched dashboard's containing dashboard group, or a matched device's group, comes along — verified, not guessed),
   - its **owning customer** (`ownerId` / `owner`, when not the tenant).

   **Customer brings its whole contents.** When a customer ends up in the batch — whether matched directly or pulled because it owns a matched entity — also anchor **every discovered entity whose `owner` is that customer**: its devices, assets, dashboards, **and users**, plus their groups. A customer that's part of the solution carries everything it owns; the discoverer already tagged every row with `owner`, so this is just a filter over the rows you already have — no extra calls, no IAM traversal. (This is how a customer's users come along — they aren't matched by the search terms and ownership of the customer record alone wouldn't bring them.)

   The profile/owner IDs may not be in the discoverer rows; that's fine — the dry-run in Step 3 surfaces them and the Step 5 reach-check pulls them. The `groups` array, though, is right there in each row — use it; do not guess which group an entity is in. The point is to *intend* the full footprint, not just the bare entity.
   - **Many matches** → keep them all as anchors; the user vets the full set at the Step 4 gate. Do not ask a separate "which one?" question.
   - **No usable search terms** (a vague ask like "build around my existing setup", or `create-solution` delegating with no phrase) → don't make the user pick. **Propose** a batch: if the discoverer returned a dominant container (a single Customer or top-level Asset), anchor on it and let its subtree come via the graph; otherwise propose the full discovered set. Present that proposal at the Step 4 gate for approve/suggest.
   - **Zero matches** (terms were given but matched nothing) → this is the one allowed extra prompt. Tell the user what you searched for and ask (plain text, or `AskUserQuestion` if you can offer candidates): `"Nothing on the instance matched '<terms>'. Give me the exact name or the entity UUID and I'll pull it."` Then stop until they answer.

### 3. Derive the slug (if still undecided) and preview the graph

1. If the slug is still undecided after Step 1:
   - One anchor that is a Customer or top-level Asset → slugify its name.
   - All anchors share one common container → slugify that container.
   - Otherwise ask once (plain text): `"What should I name the local solution to pull these into?"`
   - Create it: `tb solution new <slug>` (skip if it already exists).
2. Preview the batch with a **dry-run pull**, grouped by anchor type, one call per type (parallel where possible):
   ```bash
   tb pull device <uuid1> <uuid2> ... --solution <slug> --dry-run
   tb pull asset  <uuid3> ...        --solution <slug> --dry-run
   tb pull customer <uuid4> ...      --solution <slug> --dry-run
   ...
   ```
3. Parse the planned writes. Split them into **Direct matches** (the anchors) and **Related** (everything else the fetch brings — profiles, entity groups, owning customers, parent assets, relation-linked entities, embedded CFs/alarms). **Check the footprint is complete:** every matched device/asset must have its `DEVICE_PROFILE`/`ASSET_PROFILE`, its groups, and its owner present in the planned writes. If any are missing (the bare `tb pull` didn't bring them — profiles and group/owner references are not relations), they'll be caught and pulled by the Step 5 reach-check; note them so the gate preview reflects the true set.

### 4. Confirm the whole batch — the one gate

Render the full batch as a grouped, scannable list (Rich table or indented tree), **two clearly-labelled sections**:

```
Direct matches (3)
  DEVICE   TempHumSensor-1   profile=TempHumiditySensor
  DEVICE   TempHumSensor-2   profile=TempHumiditySensor
  ...
Related — pulled automatically because they're connected (4)
  DEVICE_PROFILE  TempHumiditySensor
  ASSET           Room-A          (parent)
  CUSTOMER        Acme Corp       (owner)
  ...
```

Truncate UUIDs to the first 8 chars in the display. Then emit `[paused] waiting: pull confirmation` and call `AskUserQuestion`:
- `question`: `"I'll pull these <N> entities into solutions/<slug>/ — <M> you asked for plus <K> related ones they're connected to. Pulling an entity always brings its connected graph, so the related ones come along. Is this the right set?"`
- `header`: `"Pull batch"`
- `options`:
  - `Pull all <N>` — `"Fetch the whole batch shown above."`
  - `Adjust the matches` — `"The direct matches are wrong or incomplete — let me re-specify which entities to pull."`
  - `Cancel` — `"Don't pull anything."`

Map: `Pull all` → Step 5. `Adjust` → take the user's correction, return to Step 2's matching (or accept explicit names/UUIDs), re-run the dry-run, re-present this gate. `Cancel` → stop with one line, nothing written.

**In `mode = autonomous`** (user said "just pull it", "no questions", "yolo"): skip the gate. Print one `[auto] pulling <N> entities (<M> matched + <K> related)` line and go to Step 5.

### 5. Pull for real

Re-run the same `tb pull` calls **without** `--dry-run`:
```bash
tb pull device <uuid1> <uuid2> ... --solution <slug>
tb pull asset  <uuid3> ...        --solution <slug>
```
Error handling (surface the CLI message verbatim; these are the only other prompts allowed):
- **Dirty-git** (local files have uncommitted changes that would be overwritten) → `AskUserQuestion`: `Refresh anyway (--force)` / `Cancel`. Never auto-`--force`.
- **404** (an entity no longer exists) → surface the missing IDs verbatim and stop.
- **403** → surface "profile lacks VERSION_CONTROL READ permission" and stop.

**Reach check.** After the first pass, scan the materialized files under `solutions/<slug>/` for **every kind of dangling reference**, not just relations — because profiles, groups, and owners are references, not relations, and the first pass won't have brought them:

- each device/asset's `deviceProfileId` / `assetProfileId` → pull the missing `device-profile` / `asset-profile`,
- each **device/asset profile's `defaultRuleChainId`** (and any other `ruleChainId` field on a profile) → pull the missing `rule-chain`,
- the **groups each matched entity belongs to** (from the discoverer's `groups` array, Step 2.3) → pull any `entity-group` not yet local,
- each pulled **entity-group's `memberIds`** → pull every member entity not yet local (group → members),
- each entity's `ownerId` (when a customer) → pull the missing `customer`,
- any relation `from`/`to` pointing at an entity not present locally → pull it.

**IAM completion (group permissions).** Run **both** directions — forward and inverse — for every group in the batch. They surface different bindings and each one alone is incomplete.

1. **Forward view** — for each **entity group (DEVICE/ASSET/DASHBOARD) in the batch**:
   ```bash
   tb entity-group list-permissions <entity-group-uuid> --format json
   ```
2. **Inverse view (mandatory) — for each USER group in the batch**:
   ```bash
   tb entity-group list-permissions <user-group-uuid> --user --format json
   ```
   This is the only way to see roles bound to a user group via permissions on *other* groups. Forgetting it is the canonical failure mode — Customer Administrator / Customer User roles attach this way and are invisible to the forward view.

Each returned permission carries a `roleId`, a `userGroupId`, and the entity group it applies to. Pull any **role** and any **USER group** that isn't local yet — **one UUID per `tb pull` call** (the CLI silently drops extra positional args on some entity types, so `tb pull role <id1> <id2>` can fail to pull the second; always loop one ID at a time, parallel calls are fine):
```bash
tb pull role <roleId> --solution <slug>
tb pull entity-group <userGroupId> --solution <slug>
```
This captures the role ↔ entity-group ↔ user-group governance so the pulled slice is permission-complete and pushable — `tb push` fails if a group permission references a role or user group that's missing. Don't guess these links — read them from the command.

Collect all missing `(entityType, id)` tuples and run a second batch of `tb pull <type> <uuid>` calls for them. Repeat once more if that batch surfaces new references (a third hop); beyond that, log the still-missing IDs and continue.

Then run `tb validate <slug>` (dry-run, safe). On success, report concisely: counts by type pulled, the solution path, validation status. Pulling is the whole job — stop after the report.

## Refresh mode

The solution already exists under `solutions/<slug>/`. Re-sync its tracked entities from the instance, and detect entities that were added to the solution on the instance since the last pull — offering to bring those in too.

1. Ensure local mode and confirm `<slug>` resolves to an existing `solutions/<slug>/`.
2. **One dry-run does both jobs** — `tb pull --solution <slug> --dry-run`. The bare form collects every locally-tracked entity, asks the server to export them with their relations, and prints a table whose **Action** column tells you what each planned write is:
   - `OVERWRITE` / `RENAME` → an entity already tracked locally that will be refreshed.
   - `CREATE` → an entity connected to this solution on the instance that has **no local file yet** — i.e. added since the last pull.
3. **If there are no `CREATE` rows** → nothing new to decide. Run the real refresh straight away: `tb pull --solution <slug>`. No gate.
4. **If there are `CREATE` rows** → the one gate. Present the new entities (type + name + 8-char ID), then emit `[paused] waiting: new-entity confirmation` and call `AskUserQuestion`:
   - `question`: `"Refreshing <slug> re-syncs <U> tracked entities. The instance also has <K> new entit(y/ies) connected to this solution that aren't local yet: <list>. A refresh pulls these in too — go ahead?"`
   - `header`: `"New entities"`
   - `options`:
     - `Refresh and pull the <K> new` — `"Re-sync tracked entities and add the new ones."`
     - `Cancel` — `"Leave the local solution as-is."`

   `tb pull` follows relations server-side, so the new connected entities arrive together with the refresh — there is no refresh-without-them. Surface that in the question wording (as above) so the choice is honest.

   **In `mode = autonomous`**: skip the gate, print `[auto] refreshing <slug>: <U> updated, <K> new` and proceed.
5. Run the real refresh: `tb pull --solution <slug>` (same dirty-git / 404 / 403 handling as Discover mode's pull step). Then `tb validate <slug>` and report: entities updated, new entities pulled, solution path, validation status.

## Quick reference

| Want | Do |
|---|---|
| Find what matches the phrase | `instance-entity-discoverer`, then match on name + profile + group + type, exhaustively |
| Pull an entity's profile / groups / owner | Profile + owner resolve from `deviceProfileId`/`assetProfileId`/`ownerId`; the entity's **groups come from the discoverer's `groups` array** on the row — include them, don't guess (reach-check, Step 5) |
| Pull every device of a category at once | Match the entity group and pull it — group members come embedded |
| Preview the assembled batch | `tb pull <type> <uuid>... --solution <slug> --dry-run` |
| Related entities for the gate | dry-run planned writes − anchors |
| Pull for real | same call without `--dry-run` |
| Refresh an already-local solution | Refresh mode: `tb pull --solution <slug> --dry-run`, read the Action column |
| Spot entities newly added to a local solution | `CREATE` rows in the refresh dry-run |

## Common mistakes

| Mistake | Fix |
|---|---|
| Asking per-entity, or a separate "which candidate?" then "confirm pull?" | One batch gate. Fold disambiguation into the Step 4 presentation. |
| `tb device list \| grep` to find matches | Use the `instance-entity-discoverer` agent; match across name, profile, group, and type. |
| Matching only exact device names | "temperature and humidity sensor" usually names a **profile/group** — match those, and match **all** fitting devices, not just the first. |
| Fetching by relations alone | Profiles, group membership, and ownership are **not** relations. Pull each matched entity's profile, groups, and owner too (reach-check). |
| Missing a customer-owned device | The list commands include customer entities by default (each row has an `owner`); a customer-owned device appears directly. If one's missing, make sure discovery didn't run with `--tenant-only`. |
| Guessing `tb` flags/subcommands when something's missing (`--customer-id`, `list-members`, …) | Those don't exist and produce a wall of errors. Re-run the discoverer (it covers all owners), or check `<cmd> -h` once — never fire invented commands. |
| Pulling before previewing | Always `--dry-run` first so the gate shows the real assembled batch. |
| Promising "matches only, skip the related ones" | `tb pull` always follows relations server-side. The related graph comes with the anchors; the user vets it at the gate or narrows the anchors. |
| Skipping roles because "they're system/built-in" | The discoverer lists every ROLE — anchor them in Step 2 whenever a matching user group or customer is in the batch. Never declare a failed `tb pull role` "system-managed" without re-running it in isolation. |
| Batching multiple UUIDs into `tb pull role <id1> <id2>` | Run one UUID per call. The CLI can silently drop extras; loop instead, parallel calls are fine. |
| Running only the forward `list-permissions` view | Always also run `--user` inverse view per user group in the batch. Customer Administrator / Customer User role bindings only appear there. |
| Reverse-engineering / designing / pushing after the pull | Out of scope. Pull-only. Stop after the report. |
| Inventing UUIDs or hand-writing JSON files | Never. Pull by real server UUID via `tb pull`. |
| Refresh mode: running the discoverer or matching | Skip it — the tracked local files already define the entity set. The dry-run finds the new ones. |
| Refresh mode: pulling without checking for new entities first | Always `--dry-run` first and read the Action column, so `CREATE` rows surface before you write. |
