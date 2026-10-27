# Dashboard layout

How the pieces compose into a dashboard, so a new one looks like the three that exist.

## The root

A dashboard is one Angular component whose host carries a root class (`qc-dashboard`, `fm-dashboard`, `wm-dashboard`) and includes the tokens:

```scss
:host { @include theme.tb-tts-light-tokens; }
.my-dashboard.dark { @include theme.tb-tts-dark-tokens; }
:host ::ng-deep { @include theme.tb-themed-scrollbars; }
```

The root is `position: relative`, filled with `c-bg-neutral-min`, padded 16px on top and 24px on the sides and bottom, set in Roboto and `c-text-neutral-heavy`. Overlays (`tb-detail-panel`, `tb-ext-confirm-dialog`, `tb-date-range-picker`) position against it, so they fit the dashboard's height rather than the viewport and inherit its theme.

## Top bar

A single row: the view switcher (`tb-tab-bar` or a `tb-segmented-control` in view-switcher mode) on the left, header controls on the right at 40px: `tb-header-icon-button`s (filters, alarms with a count badge), a `tb-timeframe-selector` where the whole dashboard shares a window, and `tb-theme-toggle` last. Controls are 12px apart.

## Sidebar and main

`tb-sidebar-layout` splits the body: a 300px sidebar that slides closed (width to 0 over 0.25s) and a main column, 16px apart. The sidebar stacks `tb-filter-section`s 10px apart, each a divider, an 11px heading with a collapse chevron, and its filter: a `tb-filter-list` (search, selected chips, checkbox or radio rows, "Select all / Reset" footer) or a `tb-check-filter` (a short checkbox group). Everything in the sidebar lines up on the 8px filter inset.

The main column stacks cards 10px apart: `tb-data-table`s for the entity lists, `tb-trend-chart` and `tb-metric-chart-card` for telemetry, `tb-map-card` for locations, each a card with the shared 8px radius and hairline border.

## Detail panel

Clicking a row opens `tb-entity-detail-panel` from the right (386px): an icon badge, the entity's name and id, a status pill, a full-width segmented control switching Insights / Alarms / Settings, and a body that stacks cards 10px apart. Settings is a `tb-device-settings-card`: an identity card, collapsible cards of attribute selects and device settings, gated object cards (a heading switch revealing its fields behind a left rule), and a floating Cancel / Apply changes pair that appears only once the form is dirty.

## Bulk actions

Selecting several rows (`multiSelect`) shows a bulk bar above the table: a `c-bg-neutral-light` strip with a `c-border-neutral-normal` border, the count on the left and a primary button on the right. Bulk editing opens the same settings panel with tri-state checkboxes and a "Disable" box beside each gate switch.

## Theming

The theme toggle flips the root's `.dark` class. Nothing else changes: every component reads tokens, so there is no per-component dark variant to maintain. When adding a colour, add it to both token sets in `_theme.scss`, light first.
