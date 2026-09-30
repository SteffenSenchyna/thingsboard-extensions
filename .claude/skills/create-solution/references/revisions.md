# Revisions

Loaded by `create-solution` when the user picks `Revise` at any gate, or asks to change something after a step's task is `completed`.

1. Move the affected task back to `in_progress`.
2. Re-invoke the corresponding sub-skill with `revise=true`:
   - **Step 2** — `design-solution-architecture` with `revise=true` and the change described in the brief. The skill edits the single `architecture-overview.md` in place (adjusting the affected profile / key / metric / alarm / role / relation / Demo Entities row and any dependent edits) while preserving untouched content. Re-read the updated overview, re-emit the `[paused]` marker, ask again, loop until approved.
   - **Step 4** — `design-dashboards` with `revise=true`. The Step 5 re-generation that follows uses `mode=create` (all dashboards in a fresh build are new).
   - Steps 3 and 5 are generation, not design — revisions go back to Step 2 (the source of truth) or Step 4.
3. Re-read the updated file(s), re-emit the `[paused]` marker, and re-ask the gate's `AskUserQuestion`. Loop until approved.
4. If the revision invalidates a downstream step (e.g. removing a profile used by a CF, alarm, or dashboard), flag it and ask whether to also re-run that step.
5. If Step 3's push notice was already printed and the revision touches entities/CFs/alarms, tell the user they should re-push after the revision — re-print the push notice. Same for dashboards (Step 5).
6. After re-generation produces new files, invoke `Skill` `commit-step` with `solution=<slug>, step="Revise: <short summary>"` (per **Pipeline Config → Finalization pattern**) so the README and history reflect the revised state.
7. On re-approval, mark the task `completed` again and resume.

## Late extension opt-in (after Step 5)

If the user flips `extension-enabled` to `true` AFTER Step 5 already completed (i.e. dashboards have been generated):

1. Run Step 3.5 (Build extension) to materialise `<project_root>/extension/` and the requested endpoints.
2. Re-invoke `design-dashboards` with `extension-only=true` so it overlays `widgetActions` onto the existing `<workdir>/design/dashboards.json` without regenerating other use cases.
3. Re-run Step 5 (dispatch the `dashboard-generator` agent) ONLY for the dashboards whose `widgetActions` reference the new endpoints — leave untouched dashboards alone. This re-generation owns the wiring; do not ask the user to paste snippets manually.
4. Re-validate with `tb validate <slug>`. On success, invoke `Skill` `commit-step` with `solution=<slug>, step="Revise: wire extension widgetActions into dashboards"` (per **Pipeline Config → Finalization pattern**), then print the Step 5 push notice once.
