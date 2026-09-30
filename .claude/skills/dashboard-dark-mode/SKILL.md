---
name: dashboard-dark-mode
description: "Use when a generated dashboard must render in a dark theme / dark mode so that EVERY widget — the stock catalog widgets, not only custom htmlContainers — comes out dark instead of the default white. Pulled on-demand by dashboard-generator when userRequirements asks for a dark dashboard. Covers the dashboard-wide CSS mechanism (settings.dashboardCss), the dark-gray palette, and the optional light/dark toggle button."
user-invocable: false
---

# Dashboard dark mode

Dark mode has **two parts** that must BOTH be applied — the page CSS alone is not enough:

1. **Page CSS** — one block in `configuration.settings.dashboardCss` paints the dark canvas + widget surfaces and recolors all text, tables, charts, inputs, the toolbar, and any htmlContainer.
2. **Per-widget config adjustments** — some widgets carry colors in `config.settings` the page CSS can't reach, so two fixes are applied per widget:
   - **Transparent background** — modern widgets (charts, gauges, value cards) paint their own opaque white `background` over the dark surface, so without this they stay white.
   - **Light text color** — a few widgets hardcode near-black text (`#000000DE`) in value/label/title color fields, invisible on dark. Flip those to the light equivalent.

Skip the background fix → "the page went dark but the widgets are still white." Skip the text fix → "some widget text is invisible." See "Per-widget adjustments" below.

**Core principle:** to make the stock widgets dark you do NOT style each one individually and you do NOT convert them into htmlContainers. You set the page CSS once, then make two small `config.settings` fixes per widget (transparent background + light text where it's hardcoded dark). The stock widgets stay stock. The same CSS also covers any htmlContainer, and even darkens outdoor-map tiles via a CSS filter (see "Maps" below).

## When this applies

- `userRequirements` asks for a "dark dashboard", "dark mode", "dark theme", "night mode", or names a dark palette for the whole view.

Apply this **independently of the widget mix**. The Custom HTML path decision is unchanged — the design may still include an htmlContainer (for custom layout, a composite view, a branded header, etc.) and that's fine. The bug this skill fixes is the *inconsistent* result: a dark htmlContainer sitting next to stock widgets that stayed white. `settings.dashboardCss` is the page-wide layer that turns the **stock** widgets dark too, so the whole dashboard — stock widgets and htmlContainers alike — comes out dark together. Set it whenever dark mode is requested, whether or not the dashboard also has an htmlContainer.

## Two modes

| The user asked for… | Mode | What you emit |
|---|---|---|
| "dark dashboard" / "dark theme" (no switch mentioned) | **Dark by default** | `settings.dashboardCss` with selectors rooted at `.tb-dashboard-page` — dark on load, no extra widget, no JS. |
| an explicit **light/dark toggle / switch** | **Toggle** | the same CSS but rooted at `.tb-dashboard-page.dark`, **plus** one toggle button widget whose custom action flips the `dark` class. Loads light; user clicks to go dark. |

Pick the mode from what the user actually said. When in doubt, dark-by-default.

## The CSS block (dark-gray palette)

**Do not hand-write the CSS — `Read` the canonical block from `dark-mode.css` in this skill directory and copy it verbatim.** It was lifted from a real, working dark dashboard, so every selector is verified against ThingsBoard's actual rendered DOM. It already covers, in one block:

- the canvas + every widget **surface** (the two rules that carry all stock widgets);
- **chart & gauge** text — axis/series/gauge labels are SVG, recolored via `svg tspan { fill }`, `.tb-latest-chart-shape svg text`, and the flot / time-series / latest-chart **legend** selectors (so charts darken from CSS alone — no per-widget color settings needed);
- the full **table widget** — header/row/cell colors and borders, sticky cells, sort arrow, divider, input placeholders (all vendor prefixes), checkbox outlines, action/paginator icons including disabled states;
- **inputs/selects** (filled line-ripple, outlined notched outline, select arrow);
- **markdown / info cards** (`.tb-markdown-view` titles, params, subtitles);
- the **powered-by footer**.

Palette: canvas `#1E1F21`, widget surface `#2A2C2F`, main text `#FFFFFF`, secondary text `#94969C`, borders `rgba(255,255,255,0.2)`. (These are the defaults — if the user names their own dark colors, use theirs instead.)

### Scoping — substitute the dark root per mode

The file is written in **toggle form**: every dark rule is rooted at `.tb-dashboard-page.dark` (a leading group of base rules — border-radius, cursors — has no `.dark` and is left untouched in both modes).

- **Toggle mode →** copy the file verbatim (keep `.tb-dashboard-page.dark`).
- **Dark-by-default mode →** replace every `.tb-dashboard-page.dark` with `.tb-dashboard-page` so the rules apply on load; emit no toggle widget.

Keep `!important` everywhere (TB's own theme out-specifies the dark rules otherwise) and never drop the root prefix (it scopes the CSS to this dashboard page).

### Putting it in the dashboard JSON

`settings.dashboardCss` is a single string — the whole file's contents (sans the comment header is fine to keep or drop) with the root substituted per mode and newlines as `\n`. Add it to the envelope `settings` object alongside the existing fields; `dashboardCss` is the ONLY field you add to `settings`, leave every other field exactly as the foundations envelope specifies.

```json
"settings": {
  "stateControllerId": "entity",
  "showTitle": false,
  "showDashboardsSelect": true,
  "showEntitiesSelect": true,
  "showDashboardTimewindow": true,
  "showDashboardExport": true,
  "toolbarAlwaysOpen": true,
  "dashboardCss": "<contents of dark-mode.css, root-substituted, \\n-joined>"
}
```

## Per-widget adjustments (required)

Two `config.settings` fixes per widget, applied whenever dark mode is active. The page CSS can't reach these because they're values the widget paints itself.

### 2a. Transparent background

The catalog widget templates do not set a `background`, so each generated widget falls back to ThingsBoard's default opaque white — which covers the dark page surface. For every stock widget in the dashboard, set a **transparent** `background` in its `config.settings` so the dark `.tb-widget` surface shows through:

```json
"background": {
  "type": "color",
  "imageUrl": null,
  "color": "#FFFFFF00",
  "overlay": { "enabled": false, "color": "rgba(255,255,255,0.72)", "blur": 3 }
}
```

The color is any RGB with alpha `00` (fully transparent) — `#FFFFFF00` or `#00000000`, both verified in the real dark dashboard. This is what turns the **opaque-painting** widgets (charts, gauges, value/aggregation cards, pie) dark; the **DOM** widgets (entity/alarm tables, info/markdown cards) don't paint a background and ignore the field harmlessly — so applying it to every stock widget's `config.settings` is safe and is the simplest correct rule.

Apply it whenever dark mode is active, in **both** modes (dark-by-default and toggle). In toggle mode the page is light until the `dark` class is added, and a transparent widget over the light `.tb-widget` still reads white — so transparency is correct for both light and dark states of the toggle.

(Buttons/header cards style their fill via `settings.appearance.backgroundColor`, a different field — leave those unless the user asks; the transparent `background` rule is only about letting the page surface through.)

### 2b. Flip near-black text to light (fixes invisible text)

A few catalog widgets hardcode **near-black** text color (`#000000DE` = `rgba(0,0,0,0.87)`) in their value/label/title fields. On the dark surface that text is invisible. When dark mode is active, set each such field to the light equivalent **`#FFFFFF`** (the palette's primary text):

| Widget | `config.settings` field(s) holding `#000000DE` |
|---|---|
| `horizontalValueCard` | `labelColor.color`, `valueColor.color` |
| `simpleGauge` | the value `color`, `titleFont.color` |
| `progressBar` | `titleColor` |

The rule generalizes: **any** widget config field that sets a near-black text color (`#000000DE`, `#000000`, `#212121`, `rgba(0,0,0,…)`) for value/label/title text → flip to `#FFFFFF`. Leave **intentional** colors alone — dataKey series colors (`var(--tb-primary-500)`), status/range colors (greens/reds), and accent colors stay as-is; they're meant to be colored and read fine on dark. Markdown/info-card body text is already handled by the `.tb-markdown-view` rules in the CSS, so its template colors need no change.

## Toggle button (toggle mode only)

The flip is a single jQuery call (`$` is available in the TB dashboard runtime) that toggles the `dark` class on `.tb-dashboard-page`. Use the verified custom-action body shape from the real dark dashboard — note it lives in the `click` array and keys the id as `id` (not `uuid`):

```json
"actions": {
  "click": [{
    "name": "dark-mode-switch",
    "icon": "dark_mode",
    "useShowWidgetActionFunction": null,
    "showWidgetActionFunction": "return true;",
    "type": "custom",
    "customFunction": "$('.tb-dashboard-page').toggleClass('dark');",
    "openInSeparateDialog": false,
    "openInPopover": false,
    "id": "<fresh-uuid>"
  }]
}
```

In toggle mode every dark CSS rule is rooted at `.tb-dashboard-page.dark`, so the page loads light and the first click adds the `dark` class to reveal the dark theme.

### Put the toggle on EVERY navigable state, not just root

`.dark` lives on `.tb-dashboard-page`, the page element that persists across drill-downs — so once toggled, the choice **stays** as the user navigates. But each dashboard state shows only its own widgets, so a toggle placed only on the root state vanishes the moment the user drills into a detail/child state. Place a toggle control in the header zone (`row: 0`) of **every state the user can reach** (root + every drill-down / detail / switcher / child state) so the switch is always available. You are replicating the control on each state; they all flip the same page-level class.

Widget choice by state type (the control is the same `toggleClass('dark')` custom action either way):

- **collection / standardDetail / switcherDetail** → an `actionButton` (template above), small header-zone slot. Mind the `switcherDetail` "≤1 actionButton" rule — if the state already uses its actionButton, host the toggle in a minimal `htmlContainer` button instead.
- **overview / statistics** (these forbid `actionButton`) → a minimal `htmlContainer` button (an htmlContainer is permitted in any state type) running the same `toggleClass('dark')` on click.

Keep it small and in `row: 0`, and don't break the state's row budget or the header-zone rules.

See "htmlContainer in dark mode" below — the container needs its own handling and must flip too.

## htmlContainer in dark mode — use CSS custom properties

This is the part that bites repeatedly. An htmlContainer paints its **own** colors in `settings.css` (e.g. `.tabs { background:#eef1f6 }`, `.tab { color:#5b6472 }`, `border:#e6eaf0`), and ThingsBoard **scopes that CSS** by prepending a unique per-widget selector to every rule. That scoping is why the obvious approaches fail:

- A `.tb-dashboard-page:not(.dark) .my-class { … }` (or `.dark`) rule written **inside the widget's `settings.css`** becomes `[widget-scope] .tb-dashboard-page:not(.dark) .my-class` — which requires `.tb-dashboard-page` to be *inside* the widget, but it's an *ancestor*. It never matches. **Ancestor selectors do not work in widget CSS.**
- The page-level `dashboardCss` can't restyle the container's custom elements by selector either — the container's own scoped rules win.

**The reliable mechanism is CSS custom properties (theme tokens).** Custom properties are *inherited* — they cascade **down** the DOM through the widget scope boundary, so a `var(--token)` inside scoped widget CSS reads whatever value the nearest ancestor (`​.tb-dashboard-page`) currently defines. Toggling `.dark` swaps the token values at the page level, and every widget using them repaints automatically — no ancestor selectors, no per-widget JS, no `!important` battles.

**Step 1 — define the theme tokens in `dashboardCss`** (page-level, outside any widget scope), one set per theme. Put the dark values on `.tb-dashboard-page` and the light overrides on `.tb-dashboard-page:not(.dark)`:

```css
.tb-dashboard-page {            /* dark defaults */
  --fleet-canvas: #1E1F21; --fleet-card: #2A2C2F;
  --fleet-text: #FFFFFF; --fleet-text-dim: #94969C;
  --fleet-border: rgba(255,255,255,0.2); --fleet-accent: #4fc3f7;
}
.tb-dashboard-page:not(.dark) { /* light overrides */
  --fleet-canvas: #f5f7fa; --fleet-card: #ffffff;
  --fleet-text: rgba(0,0,0,0.87); --fleet-text-dim: #546e7a;
  --fleet-border: rgba(0,0,0,0.12); --fleet-accent: #1976d2;
}
```

**Step 2 — author every htmlContainer's `settings.css` with `var(--token)`** instead of hardcoded colors, and the config-level `color` too:

```css
.fleet-root { background: var(--fleet-canvas); color: var(--fleet-text); }
.tabs  { background: var(--fleet-card); border: 1px solid var(--fleet-border); }
.tab   { color: var(--fleet-text-dim); }
.tab.is-active { color: var(--fleet-accent); }
```

No `:not(.dark)`/`.dark` override blocks in the widget CSS at all — the tokens carry both themes. The existing toggle (`$('.tb-dashboard-page').toggleClass('dark')`) is unchanged; no JS in the container is needed for theming.

**Dark-by-default** (no toggle): you can still use tokens, or simply author the container directly in the dark-gray palette and flip its config `color` to `#FFFFFF` — there's no light state to preserve.

**Choose token names by role, not by color** (`--fleet-card`, not `--fleet-gray`), so the same token holds the dark value in one theme and the light value in the other. Define a token for every distinct surface/text/border/accent the container uses; if some hardcoded color has no token, that element won't flip.

(Fallback — only for **non-color** theme differences a variable can't express, e.g. swapping an image `src` or a layout: read `document.querySelector('.tb-dashboard-page').classList.contains('dark')` in `settings.js`, apply a local class to the container root, and re-sync on change with a `MutationObserver` on the page element's `class`, released in `registerDestroyCallback`. For colors, always prefer tokens.)

## Maps

`outdoorMap` tiles are external Leaflet imagery, so they don't pick up the surface colors — but the canonical CSS handles them too, by inverting the tiles with a CSS `filter` (already in `dark-mode.css`):

```css
<root> .tb-widget-container > .tb-widget img.leaflet-tile { filter: invert(1) saturate(0) brightness(2); }
```

This produces a clean **black / grayscale** dark map — no tile-provider change and no per-widget map settings needed. If you want a dark map in a different tint instead of black, adjust the filter (e.g. append `hue-rotate(180deg)` or `sepia()` and tune `brightness`). `indoorMap` floor-plan images are user-supplied and left untouched. Everything else is covered by the surface CSS + transparent backgrounds above.

## Pre-save checklist

- [ ] CSS was copied from `dark-mode.css` (verified against a real dashboard), not hand-written.
- [ ] `settings.dashboardCss` is present and is a single JSON string; all other `settings` fields are unchanged from the foundations envelope.
- [ ] **Every stock widget has a transparent `config.settings.background` (`color` alpha `00`)** — without this the widgets stay white on the dark page.
- [ ] **Near-black text colors (`#000000DE` etc.) flipped to `#FFFFFF`** on the affected widgets (`horizontalValueCard`, `simpleGauge`, `progressBar`, and any other widget that hardcodes dark value/label/title text) — without this that text is invisible. Intentional series/status/accent colors left unchanged.
- [ ] Root selector substituted for the chosen mode: `.tb-dashboard-page` (dark-by-default) or `.tb-dashboard-page.dark` (toggle). No unprefixed dark rules leaking onto other dashboards.
- [ ] Dark-by-default: no toggle widget, and no `.dark` in any dark rule.
- [ ] Toggle mode: a toggle control in `row: 0` of **every navigable state** (root + all drill-down/detail/child states), each running the verified `toggleClass('dark')` action; every dark rule rooted at `.tb-dashboard-page.dark`.
- [ ] htmlContainer present + toggle: theme tokens (`--*`) defined in `dashboardCss` on `.tb-dashboard-page` (dark) and `.tb-dashboard-page:not(.dark)` (light); the container's `settings.css` and config `color` use `var(--token)` — NO hardcoded colors, NO `.dark`/`:not(.dark)` ancestor selectors in widget CSS. Dark-by-default may instead author the container dark + config `color` light. No widget excluded.
- [ ] `!important` kept on the dark rules.
- [ ] You did NOT convert stock widgets into htmlContainers, set per-widget dark colors, swap map tile providers, or hand-style each widget to fake dark mode.

## Common mistakes

| Mistake | Fix |
|---|---|
| Page went dark but the widgets stayed white | You set `dashboardCss` but skipped 2a — set each widget's `config.settings.background` to a transparent color (alpha `00`) so the dark surface shows. |
| Some widget text is invisible on dark | A widget hardcodes near-black text (`#000000DE`). Flip its value/label/title color field to `#FFFFFF` (step 2b) — affects `horizontalValueCard`, `simpleGauge`, `progressBar`, etc. |
| Building an htmlContainer to get a dark look, leaving stock widgets white | Dark mode is `settings.dashboardCss` + transparent widget backgrounds. Keep stock widgets stock. |
| Setting per-widget dark colors (chart series, gauge fonts, `widgetStyle`) | Unnecessary — the canonical CSS darkens chart/gauge SVG text and legends. One block covers all widgets and stays consistent. |
| Dropping `!important` | TB's built-in theme wins on specificity; the dark rules won't apply without it. |
| Swapping the map's tile provider to darken it | Not needed — the canonical CSS inverts Leaflet tiles with a `filter`. Adjust the filter if you want a tint other than black. |
| Toggle button only on the root state | It disappears on drill-down. Replicate the toggle in `row: 0` of every navigable state; `.dark` persists on the page, so the choice carries across states. |
| htmlContainer stays light while everything else darkens (toggle) | Its `settings.css` is widget-scoped. Define theme tokens in `dashboardCss` and use `var(--token)` in the container's CSS — the tokens inherit through the scope boundary and flip with `.dark`. See "htmlContainer in dark mode". |
| `.tb-dashboard-page:not(.dark) .my-class` written inside a widget's `settings.css` | Widget CSS is scoped, so the page class lands outside the scope and the selector never matches. Use `var(--token)` driven by tokens defined in `dashboardCss`, not ancestor selectors. |
| Adding a toggle when the user only said "dark theme" | Default to dark-on-load (no toggle). Add the toggle only when a switch was explicitly requested. |
