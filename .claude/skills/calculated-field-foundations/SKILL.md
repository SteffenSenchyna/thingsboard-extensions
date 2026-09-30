---
name: calculated-field-foundations
description: "Foundations for rendering one ThingsBoard calculated field into TB wire-format JSON and saving it via `tb calculated-field save`: TB subtype catalog with per-type reference map, the needsTbel rule, required-reading batch, schema discipline, rendering rules (both `type` fields, argument/output shapes, TBEL language constraints), and the self-validate → re-render-once → save protocol. Preloaded into the cf-generator agent for solution builds; also the reference to follow when generating a single calculated field outside the solution pipeline."
user-invocable: false
---

# Calculated Field Foundations

Reference for rendering **one** ThingsBoard calculated field into TB wire-format JSON and saving it. Holds everything that is true of every CF regardless of who renders it. The caller supplies the spec — what to compute, which profile or entity it attaches to, how each input key classifies (time-series vs attribute) — and may layer domain policies (e.g. telemetry-cadence floors) on top of the self-validation walk below.

General CF documentation — host-entity selection, the argument JSON shape with its source and type tables, output types and strategy flags, type-selection guidance, and best practices (rounding, `defaultValue`, argument naming, output-type choice) — is documented in `@/Users/steffensenchyna/.thingsboard/resources/prompts/ai-assistant/skills/calculated-fields/SKILL.md`; the reading batch below loads it before every render. This file adds the rendering layer on top of it: the `tb` CLI save path, the both-`type`-fields rule, the distilled validation gotchas, the TBEL language constraints, and the self-validate → re-render-once → save protocol. The subtype map and `needsTbel` rule are carried here (from that reference's "CF types" and "TBEL in CFs" sections) so the reading batch can be composed up front in one parallel shot.

Used two ways:

- **Solution pipeline** — preloaded into the `cf-generator` agent, which adds the solution-specific layer: brief contract, design-type mapping, telemetry cadence, entity-profiles key resolution, the delta template, and the already-exists backstop.
- **Standalone** — when a single CF is generated outside a solution build (e.g. one CF on an existing device, no design files), follow this file directly: classify each input key from the target profile or the user's description, then render → self-validate → save as specified here.

## TB CF subtypes

| TB subtype                     | Computes                                            | Per-type reference        |
|--------------------------------|-----------------------------------------------------|---------------------------|
| `SIMPLE`                       | one arithmetic expression over latest values        | `simple.md`               |
| `SCRIPT`                       | TBEL script over latest / rolling-window arguments  | `script.md`               |
| `ENTITY_AGGREGATION`           | time-window aggregation of the entity's own telemetry | `ts-aggregation.md`     |
| `RELATED_ENTITIES_AGGREGATION` | aggregation across related entities                 | `related-aggregation.md`  |
| `GEOFENCING`                   | zone entry/exit evaluation against coordinates      | `geofencing.md`           |
| `PROPAGATION`                  | propagate values to related entities                | `propagation.md`          |

Per-type references live at `/Users/steffensenchyna/.thingsboard/resources/prompts/ai-assistant/skills/calculated-fields/references/<file>`.

### When TBEL applies (`needsTbel`)

Decide **up front** whether the CF will embed TBEL. TBEL applies when:

- TB subtype is `SCRIPT`; **or**
- TB subtype is `RELATED_ENTITIES_AGGREGATION` and the spec carries a `filter` or a function-typed metric input (`AggFunctionInput`); **or**
- TB subtype is `PROPAGATION` and the spec sets `applyExpressionToResolvedArguments: true`.

TBEL does **not** apply for `SIMPLE`, `ENTITY_AGGREGATION`, `GEOFENCING`, or bare `PROPAGATION`. Carry the boolean `needsTbel` into the reading batch.

## Required reading before rendering

Load in a single parallel batch, picking files based on the chosen subtype. Picking the right subtype up front avoids loading every per-type reference, keeps context tight, and prevents subtype bleed (the most common rendering failure):

1. `tb calculated-field save -H` — authoritative schema (required vs optional fields, type discriminators, nested config shapes) for every CF sub-type.
2. `Read` `/Users/steffensenchyna/.thingsboard/resources/prompts/ai-assistant/skills/calculated-fields/SKILL.md` — top-level reference: argument JSON shape with source/type tables, output type/strategy, rounding rules, `defaultValue` rules, host-selection guidance, best practices. Skip its "Tools" section — the save path here is `tb calculated-field save`.
3. `Read` the per-type reference chosen from the subtype table. Read **only** this one — do not load other subtypes' references.
4. If `needsTbel == true`: `Read` `/Users/steffensenchyna/.thingsboard/resources/prompts/tbel/tbel-reference.md`. Otherwise omit this file entirely — TBEL is not used and the file is large.

## Schema discipline

**Strictly follow the JSON schema returned by `tb calculated-field save -H`.** That schema is the only source of truth for field names, value types, nested object shapes, type discriminators, and required vs optional fields. Do not invent fields. Do not borrow field names from sibling CF subtypes that don't apply (`SIMPLE` shape ≠ `SCRIPT` shape ≠ `RELATED_ENTITIES_AGGREGATION` shape — never mix them). Do not guess at discriminator values. Every field you emit must match the schema exactly, every required field must be present, and every field type must match what the schema declares.

If any required field is missing from the spec or the schema rejects your translation, stop with an error rather than guessing.

## Rendering rules

**Both `type` fields are required and must match.** Emit `type` at the **entity level** (top-level CF root) AND `configuration.type` at the **config level** — both set to the same TB subtype string (`SIMPLE | SCRIPT | PROPAGATION | GEOFENCING | ENTITY_AGGREGATION | RELATED_ENTITIES_AGGREGATION`). Never emit one without the other; never let the two values diverge. The server rejects a CF missing either field, and downstream processing breaks silently when they disagree. (The top-level reference's save-shape example shows only `configuration.type` — the `tb` schema additionally requires the entity-level `type`.)

**Argument shapes.** For each entry in `configuration.arguments`:

- `refEntityKey.type` is one of `TS_LATEST` / `TS_ROLLING` / `ATTRIBUTE`.
- `TS_ROLLING` args carry `limit` and `timeWindow`; never `defaultValue`. `TS_ROLLING` is legal **only** when `configuration.type == SCRIPT`.
- `TS_LATEST` / `ATTRIBUTE` args carry neither `limit` nor `timeWindow`.
- `ATTRIBUTE` args carry a `scope`; on an asset-profile parent it must be `"SERVER_SCOPE"`.

**Output shape gotchas.** For `SCRIPT`, `output.name` is absent (keys come from the script's return). For `ATTRIBUTE` output on an asset-profile parent, `output.scope == "SERVER_SCOPE"`.

**TBEL standard library constraints — required for every TBEL script.** TBEL is based on MVEL, not JavaScript. The following rules MUST hold in every script emitted; a script that violates any of them throws at runtime on the server:

- **`Math.max` / `Math.min` take exactly 2 arguments.** TBEL only binds the 2-argument forms. Calling them with 3+ arguments throws `unable to resolve method: java.lang.Math.max(Double, Double, Double) [arglength=3]`. Chain pairwise:
  ```
  var result = Math.max(Math.max(a, b), c);                       // 3 values
  var result = Math.max(Math.max(Math.max(a, b), c), d);          // 4 values
  ```
  Same rule for `Math.min`. Every other `Math` method (`Math.round`, `Math.abs`, `Math.sqrt`, `Math.pow`, `Math.floor`, `Math.ceil`, `Math.log`, …) works normally.
- **No ES6+ syntax.** Use `var` only — no `let`, no `const`. Use named functions or inline blocks — no arrow functions (`=>`). Use string concatenation with `+` — no template literals (backtick strings). Read members by name or index — no destructuring (`var {a, b} = obj`) or spread (`...`).
- **One `var` per line.** `var a, b, c = 0;` is a syntax error. Declare each variable on its own line: `var a = 0; var b = 0; var c = 0;`.
- **`null`, not `undefined`.** TBEL has no `undefined`. Absent values are `null`; check with `!= null` (or use the null-safe `?.` operator).

## Self-validation protocol (validate → re-render once → save)

After rendering, validate the JSON locally against the schema returned by `tb calculated-field save -H`. The check is local to this one CF — do **not** run `tb validate <solution>`; that has the wrong scope (solution-wide) and surfaces failures that aren't this render's to fix.

Walk the rendered JSON and confirm every item below. The host document may append domain-specific checks (e.g. telemetry-cadence floors) to this walk. If any check fails, **capture** the specific failure(s) — which check tripped, the field path, expected vs got — and proceed to the re-render step. Do not save a known-bad JSON. If every check passes on the first try, save directly.

This walk is **not** a re-statement of the schema — the server already enforces required fields, unknown fields, and missing extras. Focus only on the failure modes the re-render can actually fix:

- **Both `type` fields are present and match.** The rendered JSON MUST carry `type` at the **entity level** AND `configuration.type` at the **config level** — same enum, same value. Either field missing, or the two values disagreeing, is a hard validation failure.
- **Type discriminator matches subtype shape.** `configuration.type` is one of `SIMPLE | SCRIPT | PROPAGATION | GEOFENCING | ENTITY_AGGREGATION | RELATED_ENTITIES_AGGREGATION`, and the rest of `configuration` matches that subtype — no fields from a different subtype leaked in. This is the #1 rendering failure; catching it locally lets the retry rebuild without burning a server roundtrip.
- **Per-argument-type fields.** Every entry in `configuration.arguments` satisfies the **Argument shapes** rules above.
- **Output shape gotchas.** The output satisfies the **Output shape gotchas** rules above.
- **TBEL standard library constraints** (only when the rendered CF embeds a TBEL script). Re-read each script string and confirm: no `Math.max`/`Math.min` call has 3+ arguments; no `let`/`const`/arrow function/template literal/destructuring/spread appears; every `var` declares a single variable; no `undefined` token appears (use `null`). Any violation is a hard self-validation failure — re-render with the specific violation as a constraint.

### Re-render once on failure

Only reached if the walk caught at least one failure. Re-do the render using the captured failure(s) as explicit constraints on the new render:

- **Missing entity-level `type` or `configuration.type`** → set the absent field to the subtype the spec dictates. Both fields are required.
- **Entity-level `type` and `configuration.type` disagree** → reset both to the subtype the spec dictates. They must match exactly.
- **Extra / foreign field** (a field from a different subtype leaked in) → remove it.
- **Wrong type-discriminator value** (e.g. `configuration.type`, `refEntityKey.type`, `output.type`) → correct it to the value the spec dictates.
- **Per-argument-type field violation** (e.g. `defaultValue` on `TS_ROLLING`, or `limit`/`timeWindow` on `TS_LATEST` / `ATTRIBUTE`) → rebuild the offending argument with **only** the legal fields for its `refEntityKey.type`.
- **`TS_ROLLING` on a non-SCRIPT subtype** → either drop the rolling window (downgrading to `TS_LATEST`) when the spec doesn't actually need rolling, or stop and error if the spec genuinely requires a rolling arg on a non-SCRIPT subtype (that's an upstream bug).
- **Host-appended check violation** → apply the fix rule the host document specifies for it.

After re-rendering, run the **full walk again** on the new JSON.

- If the re-rendered JSON passes, save.
- If the re-rendered JSON still fails, stop and return an error naming both failures: `self-validation failed twice — first: <first failure summary>; second: <second failure summary>`.

**Exactly one** re-render attempt. If both renders fail, surface the error — do not loop further.

## Save

```bash
tb calculated-field save --solution <solution> --json '<rendered-cf-json>'
```

Server-side validation still runs on save — the self-validation walk just prevents obvious malformed JSON from reaching the server. If the save errors, return the error verbatim. Do not retry.
