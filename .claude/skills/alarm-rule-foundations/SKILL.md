---
name: alarm-rule-foundations
description: "Foundations for rendering one ThingsBoard alarm rule into TB wire-format JSON and saving it via `tb alarm-rule save`: reference reading map, schema discipline, rendering rules (both `type` fields with the ALARM discriminator, severity-keyed createRules map, top-level clearCondition/propagate), and the pre-save self-validation walk. Preloaded into the alarm-generator agent for solution builds; also the reference to follow when generating a single alarm rule outside the solution pipeline."
user-invocable: false
---

# Alarm Rule Foundations

Reference for rendering **one** ThingsBoard alarm rule into TB wire-format JSON and saving it. Holds everything that is true of every alarm rule regardless of who renders it. The caller supplies the spec — the alarm name, the per-severity create rules, optional clear condition and propagation, which profile or entity it attaches to, how each condition key classifies (time-series vs attribute) — and may layer domain policies (e.g. telemetry-cadence floors) on top of the self-validation walk below.

General alarm documentation — the alarm data model (severity escalation, status, lifecycle, propagation, assignment) and the full alarm-rule configuration (arguments, condition modes, schedules, `clearCondition`, `propagate`, JSON shape, worked examples) — is documented in `@/Users/steffensenchyna/.thingsboard/resources/prompts/ai-assistant/skills/alarms/SKILL.md` and `@/Users/steffensenchyna/.thingsboard/resources/prompts/ai-assistant/skills/alarms/references/alarm-rules.md`; the reading batch below loads both before every render. This file adds the rendering layer on top of them: the `tb` CLI save path, the both-`type`-fields rule, the distilled validation gotchas, and the pre-save self-validation walk.

Used two ways:

- **Solution pipeline** — preloaded into the `alarm-generator` agent, which adds the solution-specific layer: brief contract, design-entry translation rules, telemetry-cadence floors, entity-profiles key resolution, and the already-exists backstop.
- **Standalone** — when a single alarm rule is generated outside a solution build (e.g. one alarm on an existing device, no design files), follow this file directly: classify each condition key from the target profile or the user's description, then render → self-validate → save as specified here.

## Required reading before rendering

Load in a single parallel batch:

1. `tb alarm-rule save -H` — authoritative schema for required vs optional fields, condition type discriminators, severity enum, clear conditions, propagation flags.
2. `Read` `/Users/steffensenchyna/.thingsboard/resources/prompts/ai-assistant/skills/alarms/SKILL.md` — alarm data model overview (severity escalation, status, lifecycle, propagation, assignment).
3. `Read` `/Users/steffensenchyna/.thingsboard/resources/prompts/ai-assistant/skills/alarms/references/alarm-rules.md` — full alarm-rule reference: arguments, condition modes (Simple filters vs Script/TBEL), schedules, `clearCondition`, `propagate`, debug, JSON shape, worked examples.
4. **TBEL reference — load only when any condition uses Script mode** (`expression.type == "TBEL"` in the spec, or the spec describes script-like logic that filters cannot express). Read `/Users/steffensenchyna/.thingsboard/resources/prompts/tbel/tbel-reference.md` for the language itself. Skip this read when every condition is Simple-mode (filter-based) — TBEL is not used and the file is large.

Treat the references as authoritative; if they contradict something you remember, the references win.

## Schema discipline

**Strictly follow the JSON schema returned by `tb alarm-rule save -H`.** That schema is the only source of truth for field names, value types, nested object shapes (especially the per-severity `createRules` map, the `condition` structure, the `clearCondition` block, and the propagation flags), and required vs optional fields. Do not invent fields. Do not borrow shapes from sibling commands (e.g. `tb calculated-field save -H` is irrelevant here). Do not guess at enum values for severity or condition type — use exactly the values the schema declares. Every field you emit must match the schema exactly, every required field must be present, and every field type must match what the schema declares.

If any required field is missing from the spec or the schema rejects your translation, stop with an error rather than guessing.

## Rendering rules

- **Both `type` fields are required and must match (when the rendered shape carries them).** If the schema returned by `tb alarm-rule save -H` carries `type` at the entity level (top-level root) AND `configuration.type` at the config level, emit both — set to the same value (`ALARM` for an alarm rule, which is stored as a calculated field with the `ALARM` discriminator). Never emit one without the other; never let the two values diverge.
- **`createRules` is a map keyed by severity.** Keys are uppercase severity strings from the enum the `-H` schema declares (`CRITICAL | MAJOR | MINOR | WARNING | INDETERMINATE` — no typos, no custom severities); values are the condition structures.
- **`clearCondition` and `propagate` apply across all severities** — emit them once at the top level, not per-severity.

## Pre-save self-validation walk

Validate the rendered JSON locally against the schema returned by `tb alarm-rule save -H`. The check is local to this one alarm — do **not** run `tb validate <solution>`; that has the wrong scope (solution-wide) and surfaces failures that aren't this render's to fix.

Walk the rendered JSON and confirm every item below. The host document may append domain-specific checks (e.g. telemetry-cadence floors, key-exists-on-profile). If any check fails, stop and return an error naming the specific check that failed, the field path, and expected vs got. Do **not** attempt a fix; surface the bug so the caller sees it.

- **Both `type` fields are present and match (when the schema carries them).** If the rendered shape includes a top-level `type` AND a `configuration.type`, both MUST be present and equal (alarm rules are stored as calculated fields with the `ALARM` discriminator — both levels must agree).
- **`createRules` is a map, not an array.** Keys are uppercase severity strings from the `-H` enum; every value is a condition structure matching the schema.
- **`clearCondition` and `propagate` sit at the top level**, not inside any per-severity entry.

If all checks pass, save. Server-side validation still runs on `tb alarm-rule save` — this self-check just prevents obvious malformed JSON from reaching the server.

## Save

```bash
tb alarm-rule save --solution <solution> --json '<rendered-alarm-rule-json>'
```

If the save errors, return the error verbatim. Do not retry.
