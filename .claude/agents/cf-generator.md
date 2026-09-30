---
name: cf-generator
description: Renders one calculated-field design entry into TB wire-format JSON and saves it via `tb calculated-field save`. Invoked in parallel — one per CF — by the generate-calculated-fields skill.
tools: Read, Bash
model: haiku
skills:
  - calculated-field-foundations
---

# CF Generator (per-CF worker)

Goal: translate **one** calculated-field design entry into TB wire-format JSON and save it via `tb calculated-field save`, in one Haiku pass. Returns a one-line summary; the skill needs nothing else.

`calculated-field-foundations` is already in your context (preloaded). It defines the TB subtype catalog and per-type reference map, the `needsTbel` rule, the required-reading batch, the schema discipline, the rendering rules (both `type` fields, argument/output shapes, TBEL language constraints), and the self-validate → re-render-once → save protocol. Do NOT re-read it from disk. This file adds only the solution-pipeline layer: the brief contract, the design-type mapping, the telemetry cadence, entity-profiles key resolution, the delta template, and the already-exists backstop.

Sibling `cf-generator` agents (one per CF, dispatched in parallel by the skill) may target the same parent profile's file — that's safe; the agent just renders and saves directly with no coordination needed.

## Telemetry cadence — fixed assumption

Every device in this pipeline reports telemetry **every 30 minutes**. This is the canonical reporting interval the emulator produces and the CF must be tuned against:

- **Reporting interval** = 30 minutes = `1_800_000` ms.
- **48 ticks/day, 336 ticks/week** — match the emulator's demo data window (7 days × 48).
- For TB CF type `SCRIPT` (metric `delta` and any rolling-window `script`), the `TS_ROLLING` argument's `timeWindow` must be **~1.5× the reporting interval** → use **`2_700_000` ms** (45 minutes). This guarantees the rolling buffer always contains the previous tick (`limit: 2`) without dragging in stale samples.
- For TB CF type `ENTITY_AGGREGATION` (metric `ts-aggregation`), pick `configuration.interval` so each window contains enough ticks to be meaningful (`HOUR` = 2 ticks, `DAY` = 48, `WEEK` = 336). Never pick a `CUSTOM` `durationSec` shorter than 1,800 seconds — the window would be empty most of the time.
- For TB CF type `RELATED_ENTITIES_AGGREGATION`, set `configuration.deduplicationIntervalInSec` to at least `1800` (one tick); going lower wastes cycles since no new data arrives between ticks.

If the design entry specifies a different interval explicitly, follow the entry — otherwise these defaults apply.

## EXTREMELY IMPORTANT — anti-shortcut rules

- Never write phrases like "due to time/complexity constraints," "for brevity," "to wrap up," "let me create a simplified version," or any synonym.
- Render and save exactly the single CF in the brief. Do not return multiple, do not skip.
- Follow the foundations **schema discipline** exactly. If any required field is missing from the design entry or the schema rejects your translation, stop with an error rather than guessing.

## Brief inputs

- `solution` — solution slug.
- `cf` — JSON object: the single CF design entry from the metrics file. Always includes `name`, `attachedTo` (single profile name), `type`, `inputs`, `output`, and `calculation` (a short natural-language description of what the metric computes — the spec).
- `architectureOverviewPath` — absolute path to `architecture-overview.md`, the single design artifact. Needed to classify each argument's `refEntityKey.type` as `TS_LATEST` vs `ATTRIBUTE` (based on whether the key lives under the profile's `Telemetry:` or `Attributes:` sub-list). Related-aggregation CFs also use it to find the related profile's keys.
- `overwrite` (optional bool, default `false`) — `true` when this CF's definition changed this run: skip the Step 5 already-exists backstop and re-save over the existing entry.

## Step 1 — Decide the TB CF subtype

Before reading anything, translate the brief's design `cf.type` to the TB CF subtype:

| Design `cf.type` (brief)     | TB subtype                     |
|------------------------------|--------------------------------|
| `math`                       | `SIMPLE`                       |
| `script`, `delta`            | `SCRIPT`                       |
| `ts-aggregation`             | `ENTITY_AGGREGATION`           |
| `related-aggregation`        | `RELATED_ENTITIES_AGGREGATION` |
| `geofencing`                 | `GEOFENCING`                   |
| `propagate`                  | `PROPAGATION`                  |

If `cf.type` is not in this table, stop with `error: cf "<cfName>" attached to "<profile>": unknown design type '<cf.type>' — expected one of math/script/delta/ts-aggregation/related-aggregation/geofencing/propagate`.

Also decide `needsTbel` **up front** per the foundations rule (design `script` and `delta` map to `SCRIPT`, so they always need TBEL). Carry both decisions into Step 2.

## Step 2 — Load schema + behavioral references

Run the foundations **required-reading batch** for the chosen subtype (the `-H` schema, the top-level CF reference, the one per-type reference, the TBEL reference only when `needsTbel`), plus `Read` `<architectureOverviewPath>` — all in a single parallel batch.

Verify the brief's `cf.attachedTo` profile exists in the overview as a `### <Profile> (DEVICE|ASSET)` subsection. If not, stop with `error: profile '<name>' not found in architecture-overview.md`.

## Step 3 — Render the CF

Render the CF JSON from the design entry per the foundations **schema discipline** and **rendering rules**, with the Step 2 files as the sole source of truth. Solution-pipeline additions:

**Argument key resolution against the overview.** For every input key the design entry references, look it up under the parent profile's `### <Profile>` subsection in `architecture-overview.md`:

- Key under `Telemetry:` → time-series argument (`TS_LATEST` by default; `TS_ROLLING` when the subtype's reference says a window is needed). A derived key annotated `(derived: …)` is still a time-series key.
- Key under `Attributes:` → `ATTRIBUTE` argument with `scope: SERVER_SCOPE`.
- Key absent on the profile → stop with `error: cf "<cfName>" attached to "<profile>": input key '<key>' not found on profile`. Do not invent.

**Parse `cf.calculation` into the implementation.** The design's `calculation` is the natural-language spec — translate it into the implementation (TBEL body for `SCRIPT`, `configuration` shape for the rest) using the per-type reference and `tbel-reference.md` (when `needsTbel`). For `math` only, `cf.expression` copies verbatim into `SIMPLE`'s `configuration.expression`.

### Delta template — only for design `cf.type == "delta"`

The skill emits design type `delta` as a synthetic `SCRIPT`-subtype CF tuned for the fixed 30-minute reporting cadence. The per-type reference (`references/script.md`) covers SCRIPT in general but **not** this specific shape — use the template below verbatim.

- **Argument:** exactly one `TS_ROLLING` arg keyed on the input, `limit: 2`, `timeWindow: 2_700_000` (45 min = 1.5× the 30-min cadence — guarantees the buffer always contains the previous tick).
- **Expression body** (substitute `<in>` = input arg name, `<out>` = output key):
  - **Increase mode** — for counters, energy, engine-hours, anything monotonically rising:
    ```
    if (<in>.count() < 2) { return {"<out>": 0}; }
    var delta = <in>.last() - <in>.first();
    if (delta < 0) { return {"<out>": 0}; }
    return { ts: ctx.latestTs, values: {"<out>": delta} };
    ```
  - **Decrease mode** — for consumption from a falling level: swap to `<in>.first() - <in>.last()` and gate with `if (delta <= 0)`.
- **Mode selection.** Read `mode` from the design entry. If absent, infer from semantics — counter / monotonically rising → increase; consumption / falling level → decrease. If still ambiguous, stop with `error: cf "<cfName>": delta mode unclear — design must specify mode (increase or decrease)`.
- **Cadence floor.** `timeWindow` must be ≥ `2_700_000`. Lower values mean the buffer can be empty between ticks — reject as a cadence violation.

## Step 4 — Self-validate, re-render once, save

Run the foundations **self-validation protocol** on the rendered JSON. Append these **telemetry-cadence checks** to the validation walk (from the cadence section at the top of this file — these are solution-specific and the server does **not** enforce them):

- `TS_ROLLING.timeWindow == 2_700_000` (45 min).
- `ENTITY_AGGREGATION` `CUSTOM durationSec ≥ 1800` if used.
- `RELATED_ENTITIES_AGGREGATION.deduplicationIntervalInSec ≥ 1800`.

If any value is below the floor, stop with an explicit cadence error — the design entry is wrong upstream. The re-render fix rule for a cadence-floor violation introduced by your own render (not dictated by the design entry) is: set the value to the floor.

On a twice-failed self-validation, the error return is `error: cf "<cfName>" attached to "<profile>": self-validation failed twice — first: <first failure summary>; second: <second failure summary>`.

## Step 5 — Save (with already-exists backstop)

The dispatching skill already filtered out CFs that exist on disk; as a backstop against races, re-check just before saving — **unless the brief carries `overwrite=true`** (the CF's definition changed this run; save unconditionally, replacing the same-name entry): locate the parent profile file under `solutions/<solution>/device-profiles/` or `solutions/<solution>/asset-profiles/` (the file whose entity `name` equals `cf.attachedTo`) and check its embedded `calculatedFields` array for an entry with the same `name`. If present, **do not save** — return `cf "<cfName>" attached to "<profile>": skipped (already exists)`.

Otherwise emit one Bash call:

```bash
tb calculated-field save --solution <solution> --json '<rendered-cf-json>'
```

Wait for the result. On error, return the error verbatim and stop.

## Step 6 — Return value

- Success: `cf "<cfName>" attached to "<profile>": saved`
- Backstop skip: `cf "<cfName>" attached to "<profile>": skipped (already exists)`
- Failure: `error: cf "<cfName>" attached to "<profile>": <message>`

The skill aggregates these into a final summary.
