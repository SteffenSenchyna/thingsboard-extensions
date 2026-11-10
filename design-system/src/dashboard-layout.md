# Dashboard layout

How the pieces compose into a dashboard, so a new one looks like the three that exist.

## The root

A dashboard is one Angular component whose template starts with a root element (`qc-dashboard`, `fm-dashboard`, `wm-dashboard`) and whose stylesheet includes the shared page frame once, naming that root and its main column:

```scss
@use "…/components/shared/styles/dashboard";
@include dashboard.tb-dashboard-frame(".my-dashboard", ".my-main");
```

The frame gives the host the font, the light tokens and the themed scrollbars, puts the dark tokens under the root's `.dark` class, and lays the root out as the icon rail beside the main column. The root is `position: relative`, filled with `c-bg-neutral-min`, never scrolls itself and has no padding of its own: the main column carries a 16px frame on every side, set in Roboto and `c-text-neutral-heavy`. Overlays (`tb-detail-panel`, `tb-ext-confirm-dialog`, `tb-date-range-picker`) position against it, so they fit the dashboard's height rather than the viewport and inherit its theme.

## Icon rail

There is no top bar. `tb-nav-rail` runs the full height on the left edge: its items are the dashboard's pages, and its two bottom items are the alarms (with a count badge, opening `tb-alarm-panel`) and the light / dark toggle. A page that needs a window uses a `tb-timeframe-picker` on its chart or table; a table's search is a `tb-search-box` in the sidebar.

## Sidebar and main

`tb-sidebar-layout` splits the body: a 300px sidebar that slides closed (width to 0 over 0.25s) and a main column, 16px apart. The sidebar stacks `tb-filter-section`s 10px apart, each a divider, an 11px heading with a collapse chevron, and its filter: a `tb-filter-list` (search, selected chips, checkbox or radio rows, "Select all / Reset" footer) or a `tb-check-filter` (a short checkbox group). Everything in the sidebar lines up on the 8px filter inset.

The main column stacks cards 10px apart: `tb-data-table`s for the entity lists, `tb-trend-chart` and `tb-metric-chart-card` for telemetry, `tb-map-card` for locations, each a card with the shared 8px radius and hairline border.

## Detail panel

Clicking a row opens `tb-entity-detail-panel` from the right (386px): an icon badge, the entity's name and id, a status pill, a full-width segmented control switching Insights / Alarms / Settings, and a body that stacks cards 10px apart. Settings is a `tb-device-settings-card`: an identity card, collapsible cards of attribute selects and device settings, gated object cards (a heading switch revealing its fields behind a left rule), and a floating Cancel / Apply changes pair that appears only once the form is dirty.

## Bulk actions

Selecting several rows (`multiSelect`) shows a bulk bar above the table: a `c-bg-neutral-light` strip with a `c-border-neutral-normal` border, the count on the left and a primary button on the right. Bulk editing opens the same settings panel with tri-state checkboxes and a "Disable" box beside each gate switch.

## Theming

The rail's light / dark item flips the root's `.dark` class. Nothing else changes: every component reads tokens, so there is no per-component dark variant to maintain. When adding a colour, add it to both token sets in `_theme.scss`, light first.
