# Instance import (NOT_LOCAL branch)

Loaded by `update-solution` Phase 2 when Phase 1 detection returns `NOT_LOCAL` (no local `solutions/<slug>/`). Resolves to a local solution + clean `baseline_ref`, then returns to the body's **Convergence**. Every pull here is consent-gated.

## Instance discovery

No slug, no tracked files — **do not** run `tb pull --solution <name>` with a guessed slug (fails with "Unknown solution"). Invoke `Skill pull-solution` with the user's request as search terms. It matches by name / profile / type, previews the connected graph, and owns the single batch-confirmation gate (this *is* consent-to-pull). Route:

- **Found AND confirmed** → `instance-only`; graph now under `solutions/<slug>/` → §2c.
- **Found BUT declined** → §2d, declined variant.
- **Nothing found** → §2d, none-found variant.

## 2c. `instance-only` → import & reverse-engineer

`pull-solution` already materialized the graph. Reverse-engineer a design from it:

```bash
workdir="$(realpath solutions/<slug>)"
mkdir -p "$workdir/design"
```

Invoke `Skill design-solution-architecture` with `slug=<slug>, workdir=<workdir>, mode=autonomous, from-existing=true`. Pure extract — **do not pass `additions`** (the change is applied later in Phase 3, so the extract stays a byte-faithful mirror).

Checkpoint: `Skill commit-step` with `solution=<slug>, step="Design: reverse-engineered <slug> from instance entities"`. Record `baseline_ref = git rev-parse HEAD`, set `pulled_this_run=true`. Present the gate below.

### Reverse-engineered design gate

Runs only here. Read `<workdir>/design/architecture-overview.md` (the single design artifact) and present a structured summary: indented entity-hierarchy tree, profiles (telemetry/attributes), customers & users, roles, calculated fields, alarms, plus any caveats noted in the overview. Point at `<workdir>/design/architecture-overview.md`.

Label every entry `[imported]` or `[new]` from git. At this gate nothing is applied yet, so all are `[imported]`. (After a revise, derive `[new]` by diffing `design/` against `baseline_ref` — entries present now but absent in `git show <baseline_ref>:solutions/<slug>/design/<file>`.) Legend above the tree:

```
Legend: [imported] = entity already on your instance · [new] = added in this run
```

`mode=interactive`:
- Emit `[paused] waiting: approval of reverse-engineered design`
- `AskUserQuestion`: question `"This is the design I reverse-engineered from your instance entities. Does it look right before I apply your change?"`, header `"Design approval"`, options `Approve and continue` · `Revise the design`.
- On `Revise the design` (or "Other"), re-invoke `Skill design-solution-architecture` with `revise=true, from-existing=true` and the change brief, re-read, re-present, loop until approved.

`mode=autonomous` → print `[auto] reverse-engineered design: <P> profiles, <ROLE> roles, <CF> calculated fields, <AL> alarms` and proceed.

After approval, go to **Convergence** (back in the skill body).

## 2d. `nothing` → build from scratch

Never silently create. Surface the matching message, then offer `create-solution`:

- **Declined**: `"You declined pulling, and nothing matches locally — I suggest building this from scratch."`
- **None-found**: `"No matching entities found locally or on your instance — let's build this from scratch."`

Ends the run.
