# docs-diagram skill

An Agent Skill that draws relation diagrams in the look of this repo's "Help with drawings" (the "?" dialogs beside
the Organization, Applications and Access tables). `SKILL.md` is what Claude reads; this file is for people.

This folder is the single source of truth. In this repo, Claude Code already loads it as a project skill.

## Use it in every Claude Code project

Link the folder into your user skills, from the repo's main checkout (not a worktree, which is deleted with its
session):

```bash
ln -s "$(git rev-parse --show-toplevel)/.claude/skills/docs-diagram" ~/.claude/skills/docs-diagram
```

The link follows whatever branch the main checkout has checked out, so a rebuild there reaches every project at
once. Remove it with `rm ~/.claude/skills/docs-diagram` (that deletes the link, not the folder).

## Use it on claude.ai

1. Build the zip: `yarn build:diagram-skill` writes `dist/docs-diagram-skill.zip` (the folder at the zip's root).
2. On claude.ai: **Settings › Capabilities**, turn on code execution, then under **Skills** upload the zip.
3. After a design change, rebuild and upload the new zip in its place.

## Keeping it in step with the dashboards

The look lives in the repo's SCSS; the skill only carries a compiled copy. After changing any of these, run
`yarn build:diagram-skill` and commit what it regenerates:

| Source in `src/app/components/shared/` | Becomes |
| --- | --- |
| `styles/_diagram.scss` (the `tb-docs-diagram` mixin) | `assets/docs-diagram.css` — the drawing |
| `styles/_theme.scss` (the `--c-*` tokens) | the light and dark fallback values in that CSS |
| `organization/organization-help/organization-help.component.scss` | `.dg-section` / `.dg-text` / `.dg-figure` (text beside a drawing) |
| `styles/_card.scss`, `styles/_dashboard.scss` | `.dg-panel`, `.dg-page` (the examples' card and page) |
| `organization/organization-help/organization-help.component.html` + `.ts` | `assets/examples/*.html` (the seven drawings, their headings and text) |

The build (`scripts/build-diagram-skill.mjs`) also writes `dist/docs-diagram-compare.html`: every spec in
`assets/specs/` rendered by the generator beside the dashboard drawing it reproduces (`"reproduces"`), in light and
dark. Open it after a change to the generator or the styles.

Hand-written, not generated: `SKILL.md`, this README, `scripts/render.mjs`, `scripts/inter-metrics.mjs`,
`assets/specs/`. The generator's geometry (card 144 × 55, group padding, tag and chip sizes, the 720-wide canvas, the
three columns) mirrors the dashboard drawings' units; if those drawings change shape, change the constants at the top
of `render.mjs` to match.

`scripts/inter-metrics.mjs` holds Inter's advance widths (500 and 600 weights), measured in a browser with canvas
`measureText`; they reproduce the dashboard drawings' tag and chip widths to within 0.2 px.
