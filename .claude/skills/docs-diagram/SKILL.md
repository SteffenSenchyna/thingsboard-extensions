---
name: docs-diagram
description: >-
  Draw relation diagrams — how entities or things relate (what groups, holds, feeds, opens or is scoped to what) —
  in the look of the ThingsBoard Extensions dashboards' "Help with drawings" (the ThingsBoard docs' diagrams in the
  dashboards' colours): a dotted canvas, dashed tinted groups with a name tag, cards with an icon tile, chips,
  connectors in their source's colour. Use it whenever someone asks to explain or draw how things fit together — a
  data model, an access model, a hierarchy, an entity's relations, a "how does X relate to Y" help text — or asks
  for a diagram "like the help dialogs" / "in our docs style". A JSON spec goes in; a standalone HTML page, an SVG
  file or an inline SVG for an artifact comes out, laid out automatically.
---

# docs-diagram

Relation diagrams in one fixed look. Describe the drawing as a small JSON spec (rows of groups and cards, links
between them); `scripts/render.mjs` measures, places and routes everything, so every drawing comes out consistent.
Never hand-place coordinates: change the spec and render again.

Paths below are relative to this skill's folder (in Claude Code, the base directory shown when the skill loads).
Node 18+ is the only requirement; the script has no dependencies.

## Steps

1. **Decide what the drawing says** before drawing: the one entity it describes, the kinds of things around it,
   and the relations — each a verb ("runs at", "scoped to", "member of"). Keep it to what relates to what; 3–10 boxes
   and 3–10 links read best.
2. **Write the spec** (reference below; the seven in `assets/specs/` are complete worked examples). Save it next
   to the output, e.g. `drawing.json`.
3. **Render**:
   ```bash
   node scripts/render.mjs drawing.json -o drawing.html     # a page: the drawing, or its text beside it
   node scripts/render.mjs drawing.json -o drawing.svg      # a standalone SVG file
   node scripts/render.mjs drawing.json --format fragment   # inline SVG on stdout, for an artifact / existing page
   ```
   Add `--theme light` or `--theme dark` to pin a theme; otherwise the viewer's preference applies.
4. **Fix every warning** it prints (boxes overlapping in a row, a connector crossing a box, no room for a label, a
   label too long for a card, an unknown id) by changing the spec, and render again.
5. **Look at it** in a browser in both themes (`drawing.html?theme=dark`) before handing it over.

## The look (keep it)

- **Canvas**: 720 units wide, dotted, on the field surface; Inter for text, Material Symbols Rounded for icons.
- **Groups** hold several of one kind of thing: dashed, tinted in their colour, the name on a tag across the top
  border — sentence case, usually a plural ("Sites", "Access groups") or a short phrase ("Scope · one of").
- **Colours**: a group (or a loose card) takes a palette slot — `c1` brand blue, `c2` teal, `c3` purple, `c4` pink,
  `c5` sky — or `neutral` grey for what feeds the rest (profiles, devices, users, roles, plain values). One colour per
  kind of entity, the same kind the same colour in every drawing of a set. The dashboards' own:
  site `c1`, market `c2`, application `c3`, access / access groups `c4`, product line `c5`; users, roles, profiles,
  gateways, devices `neutral`.
- **The entity the drawing describes** is a filled card (`"filled": true`) standing on its own, out of any group,
  usually in the middle column. Drawn twice (a product line and its sub product line), its filled cards share a group.
- **Cards**: an icon and a short label (1–3 words, sentence case — "Access group", "Device profiles"). A label too
  long for one line wraps to two; longer than that, shorten it.
- **Chips** are values or parts, not things: a group of chips (the scopes a role applies to, a role's actions), or
  one short note under a card (`"chip"`). In a coloured group they take its colour.
- **Connectors** run from the source to the target, in the source's colour, an open chevron where they arrive.
  A label is a short verb phrase in sentence case ("Runs at", "Scoped to", "Given to"); not every link needs one.

## Writing the text beside a drawing

When the drawing explains something (a help dialog, a doc page), the text is a short bullet list beside it
(`"text"` in the spec), written for whoever administers the thing:

- how the items fit together, nothing else — what relates to what;
- no subtitle, no intro line, no caption under the drawing;
- no backend terms (rule chains, relations, attributes, tables, APIs);
- no examples;
- never address the reader — no "you" / "your";
- entities named as code, lower case, at each bullet's first mention of one: `` `sites` ``, `` `access groups` ``.

## Spec reference

```json
{
  "title": "Markets",
  "panel": "Hierarchy",
  "alt": "A market holds its sites; users and access groups scoped to a market reach every site in it",
  "text": ["`markets` group the `sites` by region. Every site belongs to one market."],
  "rows": [
    { "items": [
      { "card": "market", "label": "Market", "icon": "storefront", "color": "c2", "filled": true, "col": 1 },
      { "group": "access", "name": "Access", "color": "c4", "col": 2, "layout": "column", "cards": [
        { "id": "user", "label": "User", "icon": "person" },
        { "id": "access-group", "label": "Access group", "icon": "groups" } ] }
    ] },
    { "items": [
      { "group": "sites", "name": "Sites", "color": "c1", "cards": [
        { "id": "site-1", "label": "Site", "icon": "factory" },
        { "id": "site-2", "label": "Site", "icon": "factory" } ] }
    ] }
  ],
  "links": [
    { "from": "access", "to": "market", "label": "Scoped to" },
    { "from": "market", "to": "sites" }
  ]
}
```

| Field | Meaning |
| --- | --- |
| `alt` | The drawing's accessible description: one sentence saying what relates to what. Always set it. |
| `title` | The HTML page's title and heading. |
| `text` | Bullets shown beside the drawing (HTML output); `` `code` `` and `**bold**` allowed. |
| `panel` | The card title over text and drawing (the dashboards use "Hierarchy"). |
| `rows` | Top to bottom. Each `{ "items": [...], "align": "center" \| "top", "gap": 44 }` (or just the items array). Items in a row are centred on it by default; `gap` is the space above the row. |
| `links` | `{ "from": id, "to": id, "label"? }`. Any group, loose card or card in a group can be an end. |

**Items** sit on three columns — `"col": 0` left, `1` centre, `2` right; fractions such as `0.5` sit between
(a wide item is kept on the canvas). Without `col`, one item centres, two take `0.5` and `1.5`, three take `0, 1, 2`.

- A **group**: `{ "group": id, "name": "Sites", "color": "c1", "cards": [...] }` — cards side by side, or
  `"layout": "column"` to stack them; or `"chips": ["Regional", "Market", ...]` (two columns, `"chipColumns"` to
  change). Its size comes from what it holds.
- A **loose card**: `{ "card": id, "label": "Site", "icon": "factory", "color": "c1", "filled": true }`.
- A **card in a group**: `{ "id": id, "label": "...", "icon": "...", "filled"?: true, "chip"?: "a note under it" }`
  (it takes the group's colour).

**Icons** are Material Symbols names: `factory`, `storefront`, `category`, `account_tree`, `apps`, `person`,
`groups`, `badge`, `dashboard`, `menu`, `memory`, `inventory_2`, `sensors`, `router`, `local_gas_station`,
`local_shipping`, `notifications`, `receipt_long`, `bar_chart`, … (any name from fonts.google.com/icons).

**Routing** (automatic): a link between neighbouring rows goes straight when the smaller box's middle faces the
other box, else it bends through the gap between the rows; within a row it runs side to side. Links from one box
fan out from a shared trunk, or from separate points when labelled; arrivals at one box never share a point.
So: put linked boxes in neighbouring rows or side by side, the described entity in the middle; a link that skips a
row or jumps over a box crosses things (the script warns) — reorder the rows or move the box to another column.

## Output formats

- **HTML page** (`-o x.html`): standalone; fonts from Google Fonts; with `text`, the text sits beside the drawing in
  a card (under it on a narrow screen). `?theme=dark` / `?theme=light` in the URL forces a theme.
- **SVG file** (`-o x.svg`): styles and the dotted canvas inside, fonts by `@import`. Opened directly or inlined it
  renders fully; as an `<img>` the browser blocks the fonts and the icons show as words — use HTML or inline SVG
  there.
- **Inline, in an artifact or an existing page** (`--format fragment`): paste the `<div class="dg-canvas">…</div>`
  where the drawing goes, the whole of `assets/docs-diagram.css` once in a `<style>`, and the fonts link once:
  `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@500;600&family=Roboto:wght@400;500;700&family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20,400,0,0&display=block">`.
  The CSS follows `data-theme="light|dark"` on `<html>` and `prefers-color-scheme`; a `.dg-light` / `.dg-dark` class
  on any element around a drawing pins it. A page that defines the `--c-*` theme tokens (ThingsBoard) colours it
  with its own. For text beside it, reuse the page structure of `assets/examples/*.html`
  (`dg-panel` › `dg-section` › `dg-text` + `dg-figure`).

## Files

- `scripts/render.mjs` — the generator (CLI, or `import { render, svg, page } from ".../render.mjs"`).
- `scripts/inter-metrics.mjs` — Inter's glyph widths, so text is measured without a browser.
- `assets/docs-diagram.css` — the look, as plain CSS with light and dark fallbacks for every token.
- `assets/specs/*.json` — specs reproducing the dashboards' seven help drawings: worked examples to copy from.
- `assets/examples/*.html` — the dashboards' own seven drawings and their text, standalone: the reference look.

`assets/docs-diagram.css` and `assets/examples/` are generated from the ThingsBoard Extensions repo's SCSS
(`yarn build:diagram-skill`); never edit them by hand — change the repo's styles and rebuild.
