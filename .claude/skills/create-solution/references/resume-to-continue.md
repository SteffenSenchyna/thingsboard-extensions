# Resume-to-continue (local only)

Loaded by `create-solution` Step 1.0 when the run may be continuing an interrupted local build. Runs before the 1a approval-mode question.

Infer `<workdir>` from the user's cwd (inside a `solutions/<slug>/`) or an explicitly named existing solution. Run `pwd` to capture the current working directory; if its path contains `solutions/<slug>`, that `<slug>` is the candidate. Otherwise use a solution the user named explicitly. If none, drop through to 1a normally (fresh build).

When a `<workdir>` is inferred, detect how far a prior **interrupted create run** got — purely from local files, with no instance refresh (refreshing is `update-solution`'s job):

- `design/` present but entity subdirs empty → design done, generation not started → continue at Step 3.
- entity subdirs present but `design/dashboards.json` absent and dashboards requested → continue at Step 4.
- everything present → nothing to continue; tell the user the build looks complete and, if they want to *change* it, point them at `update-solution`.

This step only ever **continues a never-finished local build**. It does not refresh from the instance, reverse-engineer, or fold in net-new modifications — those are `update-solution`. If the user's intent is to modify a finished solution, stop and route to `update-solution`.
