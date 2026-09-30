---
name: standalone-alarm-rules
description: "Create, edit, or fix one or several alarm rules on existing devices, assets, or profiles — without solution design files. Use when the user wants targeted alarms ('add a high-temperature alarm to my sensor', 'add overheat + low-battery alarms to my pumps', 'change the threshold of the OverheatAlarm', 'fix my OverheatAlarm — it never fires', 'why does my OverheatAlarm never fire?'). Route targeted alarm asks here directly — ask the standalone-vs-solution gate once only when scope is ambiguous. Resolves each parent via standalone-target-resolver and renders every rule via alarm-rule-foundations standalone mode. Do NOT use when the user wants full solution treatment (update-solution / create-solution)."
user-invocable: true
---

# Standalone Alarm Rules

Creates or edits one or several alarm rules on existing entities, fast: no design files, no solution-wide machinery. The generation core is `alarm-rule-foundations` standalone mode — applied once per rule; this skill supplies the specs and the parent context around it.

## Flow

```
1. load foundations → 2. resolve parent(s) → 3. spec interview (the set) → 4. edit/fix: locate existing rules, diagnose → 5. per rule: render/validate/save → 6. finalize
```

### 1. Load the foundations — FIRST action

Before asking the user any question (including "what exactly doesn't work?") and before reading any rule JSON: invoke `Skill alarm-rule-foundations`, then load its required-reading batch in one parallel shot — `tb alarm-rule save -H`, the alarm data model, and the alarm-rules reference. Add the TBEL reference as soon as a Script-mode condition appears (in the request, or in the existing rule once §2 resolves it — complete the batch at that point). The references drive the interview questions, the key classification, the diagnosis, and the render — asked-first questions without them are guesses.

### 2. Resolve the parent(s)

`Skill standalone-target-resolver` once per distinct parent the alarms attach to, with `target` = that entity, `mode=edit` (the parent must exist; the alarms may be new), `discover-keys=true`. Receive per parent: `slug`, `workdir`, `parent_file`, `entity_id`/`entity_type`, `profile_id`/`profile_type`, `pulled_this_run`, and the live `ts_keys`/`attr_keys`.

The **first** resolution decides `slug`; pass `solution=<slug>` to every subsequent resolution so all parents land in one solution. The resolver's refresh gate fires once per locally-found parent — ask on the first local match only and carry that answer to the rest.

### 3. Spec interview

Cover the whole alarm set in one `AskUserQuestion` round at most, asking only what the request didn't state:

- **Per alarm: name and trigger** — which keys, which thresholds/conditions, which severity (or severity ladder).
- **Per alarm: clear condition** — when the alarm clears (default: the inverse of the create condition).
- **Attach point per alarm** — profile vs this instance, same defaulting rule as `standalone-calculated-fields`: follow the user's phrasing, ask only when ambiguous.
- **Propagation** — only when the user mentioned parent/related entities.

Classify each condition key as time-series vs attribute from the resolver's live `ts_keys`/`attr_keys` — the authoritative source — and offer those keys as interview options. When key discovery came back empty, fall back to the pulled profile/entity file or the user's description, per the foundations' standalone-mode rule.

### 4. Edit / fix mode — reuse the existing ids

Alarm rules are stored in the parent's `calculatedFields` array with the `ALARM` discriminator. For every rule being edited, find the entry by name, keep its `id`, and apply the requested change to the spec. When a named alarm is absent, list the alarms that ARE present on that parent and ask the user to pick or abort.

**Fix intent ("my alarm never fires / never clears / fires constantly") adds a diagnosis step before re-rendering.** When the parent exists locally, lean toward answering the refresh gate with **Yes** — the live (possibly UI-edited) version is the one that's broken. The §1 reading batch (TBEL included when any existing condition is Script-mode) is the authority this walk checks against; the list below is the distilled checklist. Walk the existing rule JSON against the known failure classes, in this order:

1. **Key mismatches** — every condition key exists in the live `ts_keys`/`attr_keys` with the right argument type (a typo'd key or an attribute/time-series misclassification makes a condition never evaluate true).
2. **Structure violations** — both `type` fields present and matching (`ALARM`), `createRules` a severity-keyed map (uppercase enum severities, no typos), `clearCondition`/`propagate` at the top level rather than inside a severity entry.
3. **Condition logic** — thresholds and operators against the symptom: "never fires" → condition unreachable (wrong operator direction, threshold outside the key's real value range — compare with the sample values from key discovery); "fires constantly" → clear condition missing or unreachable; "never clears" → `clearCondition` absent or contradicting the create rule.
4. **Schedule** — when 1–3 are clean, check any schedule block actually covers the times the user expects.

Name the diagnosis to the user in one line before fixing, then re-render via §5 with the fix applied. When the user asked only WHY it's broken, present the diagnosis and pause — `AskUserQuestion` whether to apply the fix; on yes continue, on no stop after reporting. When nothing in the JSON explains the symptom, ask for the symptom details or the alarm's event history instead of guessing.

### 5. Render, validate, save — per rule

For each alarm rule, follow the foundations' standalone mode with the §1 reading batch: render, run the pre-save self-validation walk, then:

```bash
tb alarm-rule save --solution <slug> --json '<rendered-alarm-rule-json>'
```

The §1 batch covers the whole set; render and save each rule on top of that shared reading.

### 6. Finalize

1. `tb validate <slug>` — surface any failure verbatim.
2. `Skill commit-step` with `solution=<slug>`, `step="Standalone: <created|updated> <N> alarm rule(s) on <parent(s)>"`.
3. Report every rule created/changed and where it lives. Alarm rules evaluate live events — there is no reprocessing task and no `--run-tasks` requirement for these changes alone. Close with: "Help us make the CLI better — share quick feedback anytime with `tb feedback`."

## Common mistakes

- Interviewing, resolving, or diagnosing before §1's foundations load — the references drive the questions and the walk; load first, ask second.
- Creating reprocessing tasks for the alarms — alarm-rule CFs are excluded by the global rules.
- Generating a fresh UUID when editing — each existing rule's `id` is kept.
- Borrowing the calculated-field schema — `tb alarm-rule save -H` is the only schema source here.
- Re-reading the references for every rule in the set — one reading batch covers them all.
