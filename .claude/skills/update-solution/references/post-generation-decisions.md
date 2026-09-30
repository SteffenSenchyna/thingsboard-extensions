# Post-generation decisions (reprocess, emulators, dashboards)

Loaded by `update-solution` Phase 3 after the generators run (3.4). Builds the change set once, then routes the reprocess/emulator decisions (3.5) and the dashboard impact (3.6). When done, return to the body's **3.7 Validate, checkpoint, notify**.

## 3.5 Reprocess and emulator decisions

### Build the change set

Determine **what changed** once, from two sources — no in-file array:

1. **Change *type*** from 3.1's classification (CF, telemetry/attribute key, profile, role/user, etc.).
2. **Concrete names** from a diff of `architecture-overview.md` against `baseline_ref`: `git diff <baseline_ref> -- <workdir>/design/architecture-overview.md`. Because the overview writes each named artifact on its own line (one `## Metrics` bullet per CF, one `## Alarms` bullet per alarm, one `### <Profile>` subsection per profile, one `### User Groups and Roles` row per role/user, one Telemetry/Attributes key per line), the **added lines** (`+` in the diff) recover this run's net-new artifacts by name. Cross-check against the generators' own existing-aware output (they report what they actually saved this run) so the change set matches what materialized.

Change-set fields, from the added lines of the diff:

- `telKeys` — net-new keys added under a profile's `Telemetry:` sub-list.
- `attrKeys` — net-new keys added under a profile's `Attributes:` sub-list.
- `cfs` — net-new `## Metrics` bullets (by CF name).
- `alarms` — net-new `## Alarms` bullets (by alarm name).
- `profiles` — net-new `### <Profile>` subsections; `roles` / `users` — net-new `### User Groups and Roles` rows.

### Route on the change set

| Condition | Ask |
|---|---|
| `telKeys` non-empty (new TIMESERIES keys on profiles already on the instance) | **Two questions** — emulator first, then reprocess. |
| `cfs` non-empty AND `telKeys` empty | **Single question** — reprocess only. |
| Neither | No prompt — proceed to 3.6. |

#### Emulator question (when new keys were added)

Emit `[paused] waiting: emulator update`, then call `AskUserQuestion`:

- `question`: `"You added new telemetry key(s): <keys>. Regenerate the demo emulator tasks for the affected device(s) so they emit the new keys too?"`
- `header`: `"Emulator update"`
- `options`:
  - `Yes — regenerate emulators` — re-dispatch `Skill generate-emulators` with `import-emulator-opt-in=true, devices=[<affected device names>]`. It regenerates (overwrites) only the listed devices' emulator task files so they emit the new keys too.
  - `No — leave emulators alone` — log `"Emulator tasks unchanged; new keys will only appear when real devices report them."` and continue.

#### Reprocess question (when new keys OR new CFs were added)

After the emulator question (or directly, in the no-new-keys case), emit `[paused] waiting: CF reprocess decision`, then call `AskUserQuestion`:

- `question`: `"Reprocess calculated field(s) over historical telemetry so back-data is filled in?"` *(only new CFs)* OR `"Reprocess any calculated fields that depend on the new key(s) so their history is recomputed?"` *(new keys)*
- `header`: `"CF reprocess"`
- `options`:
  - `Yes — reprocess` — invoke `Skill reprocess-calculated-fields` with `solution=<slug>, mode=local, nameFilter=[<affected CF names>]` (the new ones, or every CF whose `arguments` reference one of the new keys). Writes task files only; nothing runs server-side until `tb push --run-tasks`. Re-queuing a CF that already has a task is safe — the task file is overwritten, never duplicated.
  - `No — skip reprocessing` — log `"No reprocessing tasks generated; CFs will compute forward from new telemetry only."` and continue.

#### Autonomous defaults

`mode=autonomous` → emulator question default **Yes**, reprocess question default **Yes**. Each logged as one `[auto]` line.

## 3.6 Dashboard impact

Use the change set from 3.5: new `profiles`/`roles`/`users` → **High**; net-new `cfs`/`attrKeys`/`telKeys` with no new profile/role/user → **Maybe**; alarms-only → **None**; an explicit "add a widget" op → **Direct**.

**Pulled-dashboards guard.** First check `<workdir>/dashboards/` for already-pulled or previously generated dashboard files. If non-empty, apply the impact rules against those existing dashboards.

Classify against the existing `<workdir>/design/dashboards.json` (if any):

| Condition | Impact | Action |
|---|---|---|
| `alarms` non-empty AND nothing else net-new | **None** | Log `"Alarms added; existing dashboards render them automatically."` Skip dashboard updates. |
| No new profiles/roles/users AND any of `cfs / attrKeys / telKeys` non-empty | **Maybe** | Ask `AskUserQuestion`: `"You added new key(s): <keys>. Should they be shown on the dashboards?"` — Yes → `Skill design-dashboards` with `revise=true, regen-targets=<dashboards that reference the key or the affected profile>`; then update-in-place on those only. No → skip. Derive `regen-targets` by matching dashboard entries whose `assignedTo` role owns a profile that includes the new key(s)/affected profile. |
| `profiles` OR `roles` OR `users` non-empty | **High** | Present the two-way choice (High-impact section below). |
| Direct widget request (operation = "Add widget to dashboard") | **Direct** | `Skill design-dashboards` with `revise=true, regen-targets=[<the named dashboard>]` and the widget request as the change brief; then update-in-place on the named dashboard only. |
| No dashboards on disk AND original request mentioned `dashboard` | n/a | Design and build dashboards: `Skill design-dashboards` then update-in-place dispatch. |
| No dashboards on disk AND original request did NOT mention `dashboard` | n/a | Ask `AskUserQuestion`: `"There are no dashboards in this solution yet. Would you like me to design them?"` — Yes → design + build. No → skip. `mode=autonomous` → default **Yes**, log `[auto] no dashboards found; designing them.` |

`mode=autonomous` → Maybe/High questions become silent decisions with logged `[auto]` lines (see below).

### High-impact dashboard choice

**Fallback when `dashboards.json` doesn't exist.** If `<workdir>/design/dashboards.json` does not exist when a High-impact change triggers this section, treat it as a fresh design: invoke `Skill design-dashboards` WITHOUT `revise=true`, then create via update-in-place dispatch as if all dashboards were newly created (`mode=create`, no `existingDashboardPath`).

When impact is **High** (new profile/role/user) and `dashboards.json` exists, emit `[paused] waiting: dashboard update strategy`, then call `AskUserQuestion`:

- `question`: `"You added a new <profile/role/user>. How should the existing dashboards be updated?"`
- `header`: `"Dashboard update"`
- `options`:
  - `Update existing dashboards in place` — `Skill design-dashboards` with `revise=true` and the new entity as `additions`; dispatch the dashboard agent(s) in `mode=update` with `existingDashboardPath=<the existing file>` and `changedUseCases=<the added entries>`.
  - `Fully regenerate the dashboard` — `Skill design-dashboards` with `revise=true` and the new entity as `additions`; dispatch in `mode=create` (discards the existing view — only when the user explicitly picks this).
  - `Add a brand-new dashboard` — `Skill design-dashboards` with `revise=true` and a brief requesting a new per-role dashboard; dispatch the new dashboard agent in `mode=create`.

`mode=autonomous` → default **Update existing dashboards in place** (safe, non-destructive). Log as one `[auto]` line.

### Update-in-place dispatch

For any dashboard being updated (Maybe impact, High in-place choice, or Direct widget request): dispatch one agent with `subagent_type=dashboard-generator` per affected dashboard, passing `mode=update`, `existingDashboardPath=<workdir>/dashboards/<file>`, and `changedUseCases=<the added/changed use cases from design-dashboards>`.

Source `changedUseCases` from the affected `<workdir>/design/dashboards.json` entry's per-dashboard `added` field. If the dashboard is in `mode=update` because the user explicitly asked to change it (no `added` entry), pass the user's request as a one-element `changedUseCases`.

Leave untouched dashboards byte-for-byte. Wait for all agents to finish; if any error, surface them together before continuing. Then return to the body's **3.7 Validate, checkpoint, notify**.
