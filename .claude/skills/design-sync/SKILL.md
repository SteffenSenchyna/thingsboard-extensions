---
name: design-sync
description: Rebuild the ThingsBoard Extensions design system from this repository and publish it to its Claude Design System artifact. Use when the user runs /design-sync or asks to sync, refresh or republish the design system after changing shared components, tokens or styles.
---

# design-sync

Keeps the published design system (a Design System artifact at
`https://claude.ai/artifact/UQpiXTqaRqn1QSswnumCkd`) in step with the code in
`src/app/components/shared/`. The producer lives in `design-system/`
(see its README for what is generated from where).

## Steps

1. If the user changed a shared component, token or style partial since the last
   sync, first bring the producer up to date as `design-system/README.md`
   describes (a new `card(...)` in `cards_a.py` / `cards_b.py`, the CSS port in
   `design-system/src/bundle.css`, a usage note in `tokens.py`). Say what you
   updated. Do not skip this: the build only regenerates what the producer knows.
2. Build:

   ```bash
   python3 design-system/build.py
   ```

   It prints the file count and the git ref, and writes
   `design-system/out/project/` plus `design-system/out/files.json`, a
   ready-made map of every file except the index.
3. Publish with the Artifact tool in ONE call: `url` the artifact link above,
   `root` the absolute path of `design-system/out`, `file_path` the absolute
   path of `design-system/out/project/design-system.json`, `files` the object in
   `design-system/out/files.json` (read it with `cat`). If the publish is refused
   because this session has not read the artifact yet, do
   `Artifact read` with that url first and publish again. Never pass
   `type_url`, `capabilities` or `contract`.
4. Check the page in the built-in browser: the Components view should render
   every card, and the top of the page should say it is synced from code. Report
   the git ref that was published.

## Rules

- The artifact is read-only on its page (`"editing": "code"` in the index).
  A person who wants to edit it on the page instead must say so: then publish the
  index once without `editing`, and warn that the next sync would replace page
  edits.
- Each sync replaces every generated file. Files the build does not produce are
  left as they are; remove one by sending `"project/<path>": null` in `files`.
- Never commit `design-system/out/`.
