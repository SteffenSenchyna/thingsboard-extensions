# Local path (LOCAL branch)

Loaded by `update-solution` Phase 2 when Phase 1 detection returns `LOCAL` (the solution exists under `solutions/<slug>/`). Resolves to a clean `baseline_ref`, then returns to the body's **Convergence**.

## 2a. Consent-first refresh gate

The solution is already local — proceed on local state by default. No probe, no network call. Emit `[paused] waiting: refresh decision` and `AskUserQuestion`:

- `question`: `"If you've deployed <slug> and changed anything via the ThingsBoard UI, I can refresh local files first. Refresh from instance?"`
- `header`: `"Refresh"`
- `options`: `No — use local state` (default; set `pulled_this_run=false`, go to §2b) · `Yes — refresh from instance` (run the Refresh delegation below)

`mode=autonomous` → default **No — use local state**, log `[auto] refresh skipped — using local state`, go to §2b.

### Refresh delegation

Runs only on an explicit **Yes**. Run `tb pull --solution <slug>` and handle:

- **Exit 0** → log `"Refreshed N entities from instance."`, set `pulled_this_run=true`.
- **`External ids not found … pushed yet?` or HTTP 404** → report `"<slug> was never pushed — nothing to refresh."`, set `pulled_this_run=false`, continue on local state.
- **Dirty-git error** → emit `[paused] waiting: dirty-tree decision`, `AskUserQuestion`: `Refresh and overwrite local edits` (re-run with `--force`) · `Keep local edits — skip refresh` (warn, continue) · `Abort` (`"Aborted. Commit or stash local edits and re-run."`). `mode=autonomous` → default **Keep local edits — skip refresh** + warning.
- **HTTP 403** → surface "Profile lacks VERSION_CONTROL READ permission" and stop.
- **Any other error** → surface as a warning, set `pulled_this_run=false`, continue on local state.

After any successful pull, checkpoint: `Skill commit-step` with `solution=<slug>, step="Fetch: <N> entities from instance into <slug>"`. Go to §2b.

## 2b. Half-built guard

Guard against a half-built solution (prior create run wrote `design/` but never generated entities):

```bash
workdir="<absolute-path-to-solutions/slug>"
has_entities="false"
for d in devices assets device-profiles asset-profiles customers users roles entity-groups dashboards rule-chains; do
  if [ -d "$workdir/$d" ] && compgen -G "$workdir/$d/*.json" > /dev/null; then
    has_entities="true"; break
  fi
done
has_design="true"; [ -f "$workdir/design/architecture-overview.md" ] || has_design="false"
echo "entities=$has_entities design=$has_design"
```

If `entities=false` and `design=true`, the prior build was interrupted — silently invoke `Skill create-solution`, which resumes from the local design and generates the missing entities. When it returns, continue to **Baseline**. Otherwise go straight to **Baseline**.

## Baseline

Set `baseline_ref = git rev-parse HEAD`. If the working tree is dirty, run `commit-step` first so the baseline is clean. Return to **Convergence** (back in the skill body).
