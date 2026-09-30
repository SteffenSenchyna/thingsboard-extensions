---
name: standalone-calculated-fields
description: "Create, edit, or fix one or several calculated fields — including a CF chain — on existing devices, assets, or profiles, without solution design files. Use when the user wants targeted CFs ('add a calculated field to my Pump-42', 'a chain of CFs on my device and its parent asset', 'change the expression of EfficiencyIndex', 'fix my EfficiencyIndex CF — it returns null', 'my CF on the Ira device does not work — why?'). Route targeted CF asks here directly — ask the standalone-vs-solution gate once only when scope is ambiguous. Resolves each parent via standalone-target-resolver, renders every CF via calculated-field-foundations standalone mode, saves, and adds reprocessing tasks (ordered for chains) when the rules call for them. Do NOT use when the user wants full solution treatment (update-solution / create-solution)."
user-invocable: true
---

# Standalone Calculated Fields

Creates or edits one or several calculated fields on existing entities, fast: no design files, no solution-wide machinery. The generation core is `calculated-field-foundations` standalone mode — applied once per CF; this skill supplies the specs, the parent context, and the cross-CF ordering around it.

## Flow

```
1. load foundations → 2. resolve parent(s) → 3. spec interview (the set) → 4. edit/fix: locate existing CFs, diagnose → 5. per CF: render/validate/save → 6. reprocess tasks (ordered) → 7. finalize
```

### 1. Load the foundations — FIRST action

Before asking the user any question (including "what exactly doesn't work?") and before reading any CF JSON: invoke `Skill calculated-field-foundations`. Its subtype catalog and `needsTbel` rule shape everything that follows. Then load the required-reading batch in one parallel shot: `tb calculated-field save -H` and the top-level reference always; the per-type reference(s) and TBEL as soon as each CF's subtype is known (from the request, or from the existing CF once §2 resolves it — complete the batch at that point). The references drive the interview questions, the key classification, the diagnosis, and the render — asked-first questions without them are guesses.

### 2. Resolve the parent(s)

`Skill standalone-target-resolver` once per distinct parent the CFs attach to (one device, or a device and its related asset, …), with `target` = that entity, `mode=edit` (the parent must exist; the CFs may be new), `discover-keys=true`. Receive per parent: `slug`, `workdir`, `parent_file`, `entity_id`/`entity_type`, `profile_id`/`profile_type`, `pulled_this_run`, and the live `ts_keys`/`attr_keys`.

The **first** resolution decides `slug`; pass `solution=<slug>` to every subsequent resolution so all parents land in one solution. The resolver's refresh gate fires once per locally-found parent — ask on the first local match only and carry that answer to the rest.

### 3. Spec interview

Cover the whole CF set in one `AskUserQuestion` round at most, asking only what the request didn't state:

- **What each CF computes** — expression / aggregation / script intent, input keys, output key name.
- **Attach point per CF** — profile (applies to every entity of the type) vs this instance only. Default to what the user's phrasing implies ("my Pump-42" → instance; "all pumps" → profile); ask only when genuinely ambiguous.
- **Dependencies** — when one CF reads another CF's output key, record the dependency edge; it drives save order and reprocess `--order` (§6). A CF can also read keys from a related entity's parent/child (e.g. `RELATED_ENTITIES_AGGREGATION`, `PROPAGATION`) — that is what multiple resolved parents are for.
- **Backfill window** — for CFs that qualify for reprocessing (see §6), default to the last 30 days; honor any window the user stated.

Classify each input key as time-series vs attribute from the resolver's live `ts_keys`/`attr_keys` — the authoritative source — and offer those keys as interview options. A chained CF's input that is another CF's output classifies as time-series with that output key. When key discovery came back empty, fall back to the pulled profile/entity file (telemetry config, `attributes` block) or the user's description, per the foundations' standalone-mode rule.

### 4. Edit / fix mode — reuse the existing ids

For every CF the user is changing: read its parent's `calculatedFields` array, find the entry by name, and keep its `id` in the re-rendered JSON. When a named CF is absent, list the CFs that ARE present on that parent and ask the user to pick or abort.

**Fix intent ("my CF returns null / wrong values / errors") adds a diagnosis step before re-rendering.** When the parent exists locally, lean toward answering the refresh gate with **Yes** — the live (possibly UI-edited) version is the one that's broken. The §1 reading batch (keyed to the *existing* CF's subtype, TBEL included when it embeds a script) is the authority this walk checks against; the list below is the distilled checklist. Walk the existing CF JSON against the known failure classes, in this order:

1. **Key mismatches** — every argument's key exists in the live `ts_keys`/`attr_keys`, with the right `refEntityKey.type` (a telemetry key declared `ATTRIBUTE` or vice versa, a typo'd key, a missing `scope` on an attribute arg).
2. **Rendering-rule violations** — the foundations' self-validation walk applied to the *existing* JSON: both `type` fields present and matching, no foreign subtype fields, per-argument-type field rules (`TS_ROLLING` only on `SCRIPT`, no `defaultValue` on rolling args), output shape gotchas.
3. **TBEL violations** (script-bearing CFs) — 3+-arg `Math.max`/`Math.min`, `let`/`const`/arrow functions/template literals/destructuring, multi-variable `var` lines, `undefined` instead of `null`.
4. **Logic** — only when 1–3 are clean, compare the expression/script against what the user says it should compute.

Name the diagnosis to the user in one line before fixing. When the user asked only WHY it's broken, present the diagnosis and pause — `AskUserQuestion` whether to apply the fix; on yes continue with the flow below, on no stop after reporting. When nothing in the JSON explains the symptom, ask for the error message or symptom details instead of guessing. Then re-render via §5 with the fix applied, and in §6 create a reprocessing task covering the period the CF was broken (ask, or default to the CF's full intended window) — the fix only corrects history if it is reprocessed.

### 5. Render, validate, save — per CF, dependency order

Process CFs in dependency order (a CF that feeds another renders and saves first). For each CF, follow the foundations' standalone mode with the §1 reading batch: render, self-validate, re-render once on failure, then:

```bash
tb calculated-field save --solution <slug> --json '<rendered-cf-json>'
```

The §1 batch covers the whole set; load an extra per-type reference only when a CF's subtype wasn't known at §1 time.

### 6. Reprocessing tasks

Apply the global reprocessing rules (project CLAUDE.md): create a task for every CF **except** `type == "ALARM"`, `output.type == "ATTRIBUTE"`, or all-attribute arguments. Target the attachment entity (profile task for profile-attached, instance task otherwise). For chains, assign ascending `--order` along the dependency edges — the CF that feeds another gets the lower order so it backfills first:

```bash
# ATTACH_TYPE: DEVICE_PROFILE / ASSET_PROFILE for profile-attached CFs; DEVICE / ASSET for instance-attached
tb calculated-field reprocess --entity-type <ATTACH_TYPE> --entity-id <attach-uuid> \
  --name "<cf-A-feeds-B>" --start-ts <window-start-ms> --end-ts <now-ms> --order 10 --solution <slug>
tb calculated-field reprocess --entity-type <ATTACH_TYPE> --entity-id <attach-uuid> \
  --name "<cf-B-reads-A>" --start-ts <window-start-ms> --end-ts <now-ms> --order 20 --solution <slug>
```

Independent CFs keep the default `--order 100`.

### 7. Finalize

1. `tb validate <slug>` — surface any failure verbatim.
2. `Skill commit-step` with `solution=<slug>`, `step="Standalone: <created|updated> <N> calculated field(s) on <parent(s)>"`.
3. Report: every CF created/changed, where each lives, the dependency order when chained, and — when reprocess tasks exist — that deployment needs `tb push <slug> --run-tasks`. Close with: "Help us make the CLI better — share quick feedback anytime with `tb feedback`."

## Common mistakes

- Interviewing, resolving, or diagnosing before §1's foundations load — the references drive the questions and the walk; load first, ask second.
- Running the full `update-solution` machinery for a targeted CF ask — the routing gate already decided this is the standalone path.
- Generating a fresh UUID when editing — each existing CF's `id` is kept.
- Saving a dependent CF before the CF it reads — process and reprocess in dependency order.
- Giving chained CFs the same reprocess `--order` — the upstream CF needs the lower number.
- Running `tb validate` before the saves, or skipping it after.
- Creating a reprocess task for an excluded CF (ALARM / attribute output / attribute-only args).
