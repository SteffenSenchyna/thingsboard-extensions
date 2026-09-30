# Extensions

Loaded by `create-solution` whenever `extension-enabled=true` (set from the original-request scan in Step 1a, or flipped mid-run). Covers the mid-run routing table, the Build-extension step (3.5), and the Step 5 widget-JS wiring. When the flag is `false`, none of this applies.

## Mid-run flip routing

When the flag flips to `true` partway through a run, acknowledge in one line, then route by where the run already is:

| Trigger point | Behavior |
|---|---|
| **Before Step 2 begins** | `design-solution-architecture` runs with `extension-enabled=true`; it writes `extension-design.json` and folds the extension's custom roles into the overview's User Groups and Roles table. |
| **After Step 2 approved** | Re-invoke `design-solution-architecture` with `revise=true` and an extension brief; it writes `extension-design.json` and folds the custom roles into the overview's User Groups and Roles; re-present, re-approve, then proceed. |
| **After Step 3 (entities generated)** | Re-invoke `design-solution-architecture` with `revise=true` + extension brief so `extension-design.json` exists and the new custom roles are in the overview before Step 3.5 references them; then run Step 3.5 (Build extension). |
| **After Step 4 (dashboards designed)** | Run Step 3.5 (Build extension); then re-invoke `design-dashboards` with `extension-only=true` so widget actions overlay onto the already-approved use cases (everything else preserved). |
| **After Step 5 (dashboards generated)** | Run Step 3.5 (extension-design + build extension), then re-invoke `design-dashboards` with `extension-only=true` to overlay `widgetActions` onto the existing `<workdir>/design/dashboards.json`, then re-run Step 5 (dispatch `dashboard-generator`) for the affected dashboards (those whose `widgetActions` reference the new endpoints). No paste-snippets-manually footgun — the re-generation owns the wiring. |

## Step 3.5 — Build extension

Runs after Step 3 (and before Step 4) whenever `extension-enabled=true`:

1. Resolve the project root from `workdir`:

   ```bash
   project_root="$(dirname "$(dirname "$workdir")")"
   ```

   (`workdir` is `<project-root>/solutions/<slug>`; two `dirname` walks back to the project root.)

2. Invoke `Skill` `create-extension` with:
    - `workdir=$project_root` — the sub-skill operates on the project root, not the solution dir.
    - `brief=$workdir/design/extension-design.json` — absolute path to the design file from Step 2.
    - `invoked-by-create-solution=true` — suppresses the sub-skill's after-return dashboard-wiring offer; this orchestrator owns dashboards.

3. The `create-extension` skill ensures `<project_root>/extension/` is unpacked (running `tb extension new` if missing), resolves the edition, and dispatches the `extension-builder` agent against the brief. Wait for the sub-skill to return.

4. Surface the sub-skill's compact summary verbatim. On error, surface the error verbatim and stop — do not print the push notice and do not advance.

5. Invoke `Skill` `commit-step` with `solution=<slug>, step="Build extension"` (per **Pipeline Config → Finalization pattern**). Note: the extension lives at `<project_root>/extension/`, not under `solutions/<slug>/`, so the sub-skill's commit will likely be a no-op for the solution dir — that's fine; the orchestrator's contract is to call `commit-step` after every step regardless. The extension's own files are committed by the user / their workflow.

6. Print one push notice (followed by an immediate advance — do NOT pause):

   ```
   Generated extension feature(s). Build with `tb extension build`, run with `tb extension run`. When ready to publish, run `tb extension push --image-name <registry-target>` (e.g. `myuser/<extension-name>`).
   ```

Advance to Step 4.

## Step 5 — Extension-aware widget JS (when `widgetActions` is non-empty)

Before dispatching any `dashboard-generator` agent, read the edition from `<project_root>/extension/pom.xml` for every dashboard whose `dashboards.json` entry has a non-empty `widgetActions` array. Resolve the project root first:

```bash
project_root="$(dirname "$(dirname "$workdir")")"
PROJECT_ROOT="$project_root" python3 -c "import os; from pathlib import Path; from thingsboard_cli.core.extension_starter_unpacker import parse_pom_artifact_id, edition_from_artifact_id; print(edition_from_artifact_id(parse_pom_artifact_id(Path(os.environ['PROJECT_ROOT']) / 'extension' / 'pom.xml')) or '')"
```

Map the resolved edition to the widget JS snippet, and pass it as each affected dashboard's `widgetJsSnippetPath` + `extensionEdition` in the Step 5 brief:

- `PE` → `examples/widgets/on-premise-button.js`
- `PaaS` → `examples/widgets/cloud-button.js`

If the resolution returns an empty string (no `pom.xml` yet) while `widgetActions` is non-empty, stop and report — `widgetActions` cannot be wired without a built extension to point at.
