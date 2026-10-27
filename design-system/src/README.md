The shared look of every ThingsBoard dashboard built from the `thingsboard-extensions` library: QC Lab monitoring, fuel management, water metering and whatever comes next. One rule governs all of it: **change the shared source, never one dashboard.** A design change made for one dashboard propagates to all because every dashboard reads the same `--c-*` tokens, the same SCSS partials under `components/shared/styles/` and the same `tb-*` components.

Dashboards are quiet, data-dense tools. White page, bordered cards on a faint grey surface, one brand blue for everything interactive, four status colours that mean exactly one thing each, no shadows worth noticing in light mode and no decoration anywhere. The vocabulary comes from The Things Stack console; the composition from a UniFi-style sidebar-and-cards layout.

## Content fundamentals

- Write labels as short noun phrases in sentence case: "Name (Label)", "Select all", "Apply changes", "No alarms". Never Title Case, never trailing punctuation.
- Button text is a verb phrase: "Apply changes", "Clear", "Cancel", "Reset". The destructive one is honest ("Clear alarm"), never "OK".
- Empty states are one short line with a muted icon above it: "No alarms", "No locations", "No matches", "No data". Loading states end in an ellipsis: "Loading alarms…".
- Counts ride inside the label in parentheses: "Selected (3)", "Markets (12)".
- Times are always a 12-hour clock with AM/PM in the viewer's browser zone, formatted by `time-format.ts` (`formatClockTime`, `formatDateTime`, `TB_DATE_AT_TIME` = "MMM d 'at' h:mm a"). Never `HH:mm`, never a hand-built hour string.
- Units follow the value with a space and the muted colour: "27 °C", "-92 dBm". Chart captions name the quantity and the explanation lives in an info icon, not the title ("RSSI" + "Received signal strength (dBm). Closer to 0 is stronger.").
- No emoji anywhere. Icons are Material Symbols glyphs and only where they carry meaning.

## Colour

Every colour is a `--c-*` custom property declared by `theme.tb-tts-light-tokens` on the dashboard root and overridden by `theme.tb-tts-dark-tokens` under its `.dark` class, so nested components theme together. Never redeclare a `--c-*` token locally and never hard-code a hex where a token exists. The few `light-dark()` and `color-mix()` expressions in the components are the only places two tokens combine.

**Surfaces.** The page is `c-bg-neutral-min` (white / black). Cards sit on it in `c-bg-neutral-extralight` with a `c-border-neutral-light` border. Boxed controls (inputs, selects, button groups, copy boxes, filter boxes) use the page colour `c-bg-neutral-min` with a `c-border-neutral-normal` border, so a control reads one step crisper than the card it sits in. The detail panel, confirm dialog and date-range picker are page-coloured too.

**Text.** `c-text-neutral-heavy` for everything primary, `c-text-neutral-semilight` for secondary copy (dialog messages, tab labels), `c-text-neutral-light` for muted labels, subtitles, column headers and empty states, `c-text-neutral-extralight` for placeholders only. In dark mode `c-text-neutral-light` is the safe muted tone; `c-icon-neutral-light` does not flip the same way, so never use an icon token for text.

**Brand.** `c-bg-brand-normal` (#1e5dff) is the one interactive blue: primary buttons, checked boxes and switches, the slider fill, radio dots, the selected timeframe label, info icons, links, map markers, the chart line. Its hover is `c-bg-brand-normal-hover`. The lighter `c-icon-brand-light` is the focus and hover ring of boxed controls and the dark-mode brand icon colour. Brand tints (`c-bg-brand-semilight` light, `c-bg-neutral-light` dark) back icon badges and active header buttons; `c-bg-brand-light` backs a selected table row.

**Interaction states** are derived from the neutral ramp: `c-bg-hover-row` washes a hovered table row, `c-bg-hover-control` fills a hovered icon button, and the row wash is deliberately lighter so a hovered button still reads as a circle on a hovered row. Ghost buttons, header buttons and segments hover to `c-bg-neutral-light` in light mode and `c-bg-neutral-extralight-hover` in dark.

**Status is one scale.** Every status mark, whether an alarm severity bar, a status pill or an event chip, uses the `--c-bg-<status>-normal` tokens through `status.$success`, `status.$warning`, `status.$major` and `status.$error`:

| Meaning | Token | Light | Dark |
| --- | --- | --- | --- |
| success, warning-severity alarm | `c-bg-success-normal` | #39cc64 | #58e160 |
| warning, minor-severity alarm | `c-bg-warning-normal` | #ffb73f | #fc6 |
| major-severity alarm | `c-bg-major-normal` | #f66716 | #ff8a45 |
| error, critical alarm | `c-bg-error-normal` | #ff3b30 | #ff3b30 |

Alarm severities map critical → error, major → major, minor → warning, warning → success. Never reach for `text-*` or `icon-*` tokens for these colours. Setting a CSS custom property from one needs interpolation (`--x: #{status.$error};`). Status is never carried by hue alone: a severity bar has 1 to 4 filled segments, a pill has a word, an alarm count has a bell.

**Contrast.** `c-text-neutral-heavy` on `c-bg-neutral-min` is 14.6:1 light and 18.1:1 dark; `c-text-neutral-semilight` is 6.0:1 light and 10.8:1 dark; tooltip pills are 14.6:1 light and 8.2:1 dark. Some pairs from the source miss 4.5:1 and stay exact, flagged here rather than re-tinted:

| Pair | Light | Dark |
| --- | --- | --- |
| `c-text-neutral-light` on `c-bg-neutral-min` / card | 3.6:1 / 3.5:1 | 5.8:1 / 5.2:1 |
| success pill, `c-bg-success-normal` on `c-bg-success-extralight` | 2.0:1 | 11.3:1 |
| warning pill, `c-bg-warning-normal` on `c-bg-warning-extralight` | 1.6:1 | 13.1:1 |
| major pill, `c-bg-major-normal` on `c-bg-major-extralight` | 2.8:1 | 7.6:1 |
| error pill, `c-bg-error-normal` on `c-bg-error-extralight` | 3.3:1 | 5.3:1 |
| white on `c-bg-error-normal` (danger button, badges) | 3.5:1 | 3.5:1 |

The muted colour is therefore for labels, captions and secondary metadata only, never for the one piece of text that carries a value. Status pills always carry a word and sit beside a severity bar, an icon or a count, so the colour is reinforcement, not the message; in light mode the neutral and brand pills (7.2:1 dark, 4.7:1 light) are the readable ones.

## Typography

Roboto, falling back to Helvetica Neue, everywhere (`sans`). It is ThingsBoard's own face and loads with the host, so no font files ship with this library. Copy-box values are `mono`. The one exception is the date-range picker's start/end boxes, set in Inter with tabular digits (`field`), which that component loads from Google Fonts itself.

The scale is small and flat:

- `widget-title` 16/600 for widget headers, panel titles and dialog headings; `card-title` 14/700 for collapsible cards and compact table titles; `panel-name` 15/600 for an entity's name.
- `nav` 14/500 for tabs, segments and the timeframe selector; `body` 14/400 for dialog copy.
- `control` 13/400 is the workhorse: every input, select, option, checkbox label, filter row, calendar day and table cell (`table.$table-text-size`). `label` is the same size in `c-text-neutral-light` above a control. `button` is 13/600 with an 18px line.
- `table-header` 12/500 uppercase with 0.06em tracking; `pill` 12/600; `section-title` 12/700 muted; `filter-heading` 11/600; `badge` 10/700 white on red.

Weight carries hierarchy, not size: a card title is bold at 14px while its content is regular at 13px. Never go above 16px in a dashboard widget.

## Spacing and shape

Everything sits on a 16px gutter (`card-padding`) and cards stack 10px apart (`card-stack-gap`), in sidebars, panels and main columns alike. The dashboard root pads 16px on top and 24px on the sides and bottom; the sidebar is 300px wide with a 16px gap and a hairline on its right edge.

Forms stack fields 18px apart (`field-gap`) with a 6px label gap, and every boxed control is 36px tall (`control-height`) with 12px side padding. Secondary controls (button group, split toggle, icon buttons, filter bars, date boxes) are 32px; header-row controls (header icon buttons, theme toggle, segmented control, timeframe selector) are 40px. Tables keep rows at least 40px with 6px vertical cell padding; there is no per-table row height.

Radii are few: 8px (`radius-card`) for every card and every boxed control, 6px (`radius-segment`) for the pill inside a segmented control and for tags, 4px for checkboxes, 10px for tooltip pills and the select panel, 12px for the timeframe menu and chips, 999px for status pills, switches and badges, and a full circle for icon buttons, radios and markers.

## Borders and elevation

Light mode draws edges with `c-border-neutral-light` hairlines and almost no shadow; the shared buttons are deliberately flat. Dark mode steps the same edges up to `c-border-neutral-normal` because shadows vanish on a dark ground. The few shadows are named: `shadow-box-modal-normal` on tooltip pills, the select panel, the map layers panel, the date-range picker and the confirm dialog; `shadow-box-panel-normal` on map controls; a 1px/3px lift on the selected segment; and the detail panel's left shadow, soft in light (`shadow-panel-light`) and heavier in dark (`shadow-panel-dark`).

## Motion

Opening and closing is one timing for every piece: `motion.$expand-duration` 0.25s with `motion.$expand-easing` ease, applied as `transition: grid-template-rows` on collapsible card bodies and gated settings sections, as a width transition on the filter sidebar and as a slide on the detail panel. Hover and focus colour changes take 0.1s; the switch thumb takes 0.35s.

Tooltips show instantly (`$tooltip-show-delay` 0s, `TB_TOOLTIP_SHOW_DELAY_MS` 0) with a tiny pop: scale 0.9 to 1 over 0.16s on `cubic-bezier(0.34, 1.4, 0.64, 1)`, growing from the edge that faces the control, and fade out in 0.1s. `matTooltip` gets this from `provideTbTooltipDefaults()`, registered once on the root module; custom CSS tooltips use `tooltip.tb-tooltip-pop(origin)` on the hidden rule and `tooltip.tb-tooltip-shown` on the hover rule. Never set a show delay per usage.

Dropdowns pop in over 0.09s to 0.16s; the confirm dialog scales from 0.97 over 0.14s. Nothing else animates.

## Iconography

Material Symbols Rounded, filled (`"FILL" 1, "wght" 400, "GRAD" 0, "opsz" 24`), loaded at runtime from Google Fonts by each dashboard component and applied to `mat-icon` under the dashboard root classes listed in `src/app/scss/style.scss`. Add a new dashboard's root class to that selector list; never load a second icon set. Icon sizes are 14px in pills and chips, 16px in buttons and small controls, 18px beside titles, 20px in icon buttons and header controls, 22px in the entity badge, 28 to 40px in empty states. Icons take `c-icon-neutral-light` at rest, `c-text-neutral-heavy` on hover and the brand tint when active; an empty-state icon uses `c-text-neutral-light` so it flips in dark mode.

There is no logo in the library. The system's name is set in plain type.

## Components

Use the shared pieces instead of rebuilding them in a dashboard: `tb-card` and `tb-collapsible-card` for surfaces, `tb-widget-header` for titled widgets, `tb-data-table` for every table, `tb-status-pill` for every status word, `tb-header-icon-button`, `tb-theme-toggle`, `tb-segmented-control`, `tb-split-toggle`, `tb-tab-bar` and `tb-timeframe-picker` for navigation and switching, `tb-ext-checkbox`, `tb-ext-switch`, `tb-select`, `tb-button-group`, `tb-slider-stepper` and `tb-copy-box` for forms, `tb-filter-list`, `tb-check-filter`, `tb-filter-section` and `tb-filter-chips` for sidebars, `tb-alarm-list`, `tb-line-chart`, `tb-trend-chart`, `tb-metric-chart-card`, `tb-lorawan-signal-card` and `tb-map-card` for data, `tb-detail-panel`, `tb-entity-detail-panel`, `tb-sidebar-layout`, `tb-ext-confirm-dialog` and `tb-date-range-picker` for layout and overlays.

Rules that apply to every component:

- Selector prefix `tb-`; where ThingsBoard already owns the name use `tb-ext-` (`tb-ext-checkbox`, `tb-ext-switch`, `tb-ext-confirm-dialog`) to avoid an NG0300 clash. Check a new name with `grep -rn '"tb-<name>"' node_modules/thingsboard/src/app`.
- Standalone components, reactive forms, `takeUntilDestroyed()`.
- No component ever shows the browser's native `title` tooltip: any `@Input() title` strips the reflected attribute with `@HostBinding("attr.title") readonly hostTitle = null`.
- Confirmations use `tb-ext-confirm-dialog` inside the dashboard root, never `ctx.dialogs.confirm`, because ThingsBoard's dialog opens outside the themed root.
- No dashboard-only size, colour or timing knobs. If a shared piece should look different, change it for everyone.

The previews in this system are static HTML renditions of the Angular components, styled by `components/bundle.css`, a hand port of the component SCSS. The live components are the Angular ones in `src/app/components/shared/`; consume them from `public-api.ts`.
