# Design system producer

Builds the **ThingsBoard Extensions** design system (a Claude Design System
artifact, https://claude.ai/artifact/UQpiXTqaRqn1QSswnumCkd) from this
repository, so the published system follows the code.

```bash
python3 design-system/build.py
```

writes a complete artifact file tree to `design-system/out/project/` (ignored
by git). Publishing it is done from Claude Code with the `/design-sync` skill
in `.claude/skills/design-sync`, which runs the build and sends every file to
the artifact. The artifact's page is read-only ("synced from code"): change the
code here and sync again, never edit the page.

## What is generated from where

| Output | Source |
| --- | --- |
| `tokens.json` colours and shadows | `src/app/components/shared/styles/_theme.scss`, parsed by `tokens.py` (both theme mixins, source order, exact values; the two `color-mix()` hovers are resolved to hex in `tokens.py`) |
| `tokens.json` usage notes, spacing, radius, opacity, type scale | `tokens.py` (hand-maintained; the values come from the other `styles/_*.scss` partials and the component SCSS) |
| `tokens.css` | compiled from `tokens.json` by `build.py` |
| `README.md`, `dashboard-layout.md` | `src/` (the brand book, hand-written) |
| `components/bundle.css` | `src/bundle.css`: a hand port of the component SCSS to plain CSS, class names as in the components |
| `components/<Comp>/README.md` + `preview.html` | `cards_a.py`, `cards_b.py`: one `card(...)` call per shared component |
| `components/Cover/preview.html` | `src/Cover/preview.html` |
| `design-system.json` | `build.py` (title, `editing: "code"`, `lastChange` with the git ref) |

## Keeping it current

- **New or changed token in `_theme.scss`:** nothing to do beyond the sync;
  add a usage note in `tokens.py` `USAGE` if the generic one is not enough.
- **Changed spacing, radius, motion or type value in `styles/_*.scss`:** update
  the matching entry in `tokens.py` and the README's prose if it quotes it.
- **Changed component styling:** port the change into `src/bundle.css` and,
  if the markup changed, into the card's body in `cards_a.py` / `cards_b.py`.
- **New shared component:** add a `card("Name", "Group", height, readme, body)`
  entry, port its SCSS into `src/bundle.css`, and add its name to the
  `@ds-bundle` header in `src/bundle.js`.
- **Renamed system:** change `TITLE` in `build.py` and the cover's name.
