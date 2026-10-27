# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Angular library that extends the [ThingsBoard](https://thingsboard.io) IoT platform with custom widgets and sensor configuration components. It compiles to a JavaScript extension module deployed into a running ThingsBoard instance.

## Commands

```bash
# Development server (compiles SCSS first, then serves on port 5000)
yarn start

# Development with Tailscale tunnel for remote access
yarn dev

# Build the library and move output to target/generated-resources/
yarn build

# Build, then upload to ThingsBoard via 1Password-authenticated Python script
yarn upload

# Compile SCSS through PostCSS pipeline only
yarn build:scss

# Lint
yarn lint
```

**Important:** The build requires `OP_SERVICE_ACCOUNT_TOKEN` in `.env` for the `upload` command (1Password service account for retrieving ThingsBoard credentials).

The build allocates 8GB of Node memory (`--max_old_space_size=8048`) — this is intentional for handling Angular's compilation of the large library.

## Architecture

### How This Integrates with ThingsBoard

ThingsBoard loads this library as a JS_MODULE EXTENSION resource. `yarn build` compiles to `dist/widget-extension-build/` (`src/ng-package.build.json`) and `install.js` moves the bundle to `target/generated-resources/`. ThingsBoard's UI then loads this module, which registers custom widget components.

The dev server (`yarn start` / `yarn dev`, usually left running) compiles to a **separate** folder, `dist/widget-extension/` (`src/ng-package.json`), and serves the bundle straight from disk there. Keep the two apart: a build that writes to or moves files out of `dist/widget-extension/` leaves the running dev server with nothing to serve. For quick checks, prefer the no-emit type check / lint over a full build.

### Path Aliases (tsconfig.json)

All ThingsBoard source imports resolve through path aliases pointing to `node_modules/thingsboard`:
- `@app/*`, `@core/*`, `@shared/*`, `@modules/*`, `@home/*` → ThingsBoard source
- `widget-extension*` → `dist/widget-extension/*`

This means you can import ThingsBoard internals directly — the build resolves them against the `thingsboard` npm package (pinned to GitHub release/4.2.0).

### Module Structure

**`ThingsboardExtensionWidgetsModule`** — root module, aggregates all sub-modules, registers i18n translations, and dynamically injects shared SCSS (namespaced as `tb-extension-css` to avoid ThingsBoard conflicts).

**`ExamplesModule`** — reference widget implementations demonstrating cards, tables, charts, and action widgets. These are working examples of how to wire up ThingsBoard widget lifecycle APIs.

**`SensorsModule`** — TS302 temperature sensor configuration widget. Standalone Angular component with reactive forms, three tabs (General, Calibration, Alarm), syncing against ThingsBoard device server attributes.

### Styling System

Tailwind is configured to avoid conflicting with ThingsBoard's own CSS classes:
1. `load-tb-classes.js` (PostCSS plugin) extracts all class names from ThingsBoard's `styles.css`
2. The extracted names become a Tailwind blocklist (`dist/tbClasses.json`)
3. PostCSS pipeline: `load-tb-classes.js` → `tailwindcss` → `autoprefixer`
4. Source: `src/app/scss/style.scss` → compiled to `src/app/scss/style.comp.scss`

Tailwind's `preflight`, `filter`, `transform`, `blur`, and `borderRadius` core plugins are disabled to prevent ThingsBoard style collisions. All custom styles scope under `.tb-default`.

### One look across every dashboard — no per-dashboard overrides

All dashboards (QC Lab, fuel management, water metering, new ones) must look
and behave the same, so a design change made for one propagates to all. Change
the **shared source**, never one dashboard:

- **Colours:** every dashboard root includes the shared tokens —
  `@include theme.tb-tts-light-tokens;` on `:host` and
  `@include theme.tb-tts-dark-tokens;` under its `.dark` class
  (`components/shared/styles/_theme.scss`), plus
  `:host ::ng-deep { @include theme.tb-themed-scrollbars; }`. Never redeclare
  `--c-*` tokens locally or hard-code a hex where a token exists.
- **Spacing / shape:** `card.$card-radius`, `card.$card-stack-gap` (gap between
  cards stacked in panels / sidebars), `form.*`, `button.*` (incl.
  `button.$link-hover-color`), `tooltip.*`, `motion.*` (`$expand-duration` —
  the open/close speed of cards, settings sections, the filter sidebar and
  detail panels) from `components/shared/styles/`.
- **UI pieces:** use the shared components (`tb-data-table`, `tb-status-pill`,
  `tb-header-icon-button`, `tb-theme-toggle`, `tb-alarm-list`,
  `tb-entity-detail-panel`, `tb-segmented-control`, `tb-split-toggle`,
  `tb-filter-list`, `tb-check-filter` (a short checkbox group with a heading),
  `tb-filter-section` (divider + folding heading around any sidebar filter),
  `tb-ext-confirm-dialog`, `tb-timeframe-picker` (the
  "1D | 1W | 1M" picker for every chart and table; `customRange` adds a
  calendar segment that opens `tb-date-range-picker`, placed in the dashboard
  root), …) instead of re-building
  them in a dashboard.
- **Tables:** every `tb-data-table` shares one row style — rows at least 40px
  with 6px vertical cell padding (`$row-height` / `$cell-padding-y` in
  `data-table.component.scss`) and 13px text (`table.$table-text-size` in
  `styles/_table.scss` — custom cell templates use it too). There is
  deliberately no per-table row-height input; change the shared values instead.
- **Status colours:** one scale for every status mark — alarm severity bars,
  status pills, event pills: `status.$success` (green), `status.$warning`
  (yellow), `status.$major` (orange), `status.$error` (red) from
  `styles/_status.scss`, i.e. the `--c-bg-<status>-normal` tokens. Never another
  token family (`text-*`, `icon-*`) for these colours. Alarm severities map
  critical → error, major → major, minor → warning, warning → success.
  Setting a CSS custom property from one needs interpolation —
  `--x: #{status.$error};` — a bare `status.$error` is emitted as literal text.
- **Pills (`tb-status-pill`):** the status tones (`success`, `warning`,
  `major`, `error`) take their text colour from that scale; neutral uses
  `--c-text-pill-neutral` (#7887a1 light / #94a3bd dark), brand `--c-text-brand-normal` (light mode). Set it
  once per tone in `status-pill.component.scss`, never per usage.
- **Times:** 12-hour clock with AM/PM in the viewer's browser time zone —
  format with `components/shared/time-format.ts` (`formatClockTime`,
  `formatDateTime`, …; `TB_DATE_AT_TIME` for the Angular `date` pipe), never
  `HH:mm` or a hand-built `getHours()` string.
- **Confirmations:** use `tb-ext-confirm-dialog` (placed in the dashboard root),
  never `ctx.dialogs.confirm` — ThingsBoard's dialog opens in its own overlay
  outside the dashboard, so it ignores the dashboard's light/dark theme.
- Don't add dashboard-only size/colour/timing knobs (CSS variables or inputs a
  single dashboard sets). If a shared piece should look different, change it
  for everyone.
- Material Symbols Rounded icons: add the dashboard root class to the selector
  list in `src/app/scss/style.scss`.

### Component Conventions

- Component selector prefix: `tb-` (enforced by ESLint). Dashboards import
  ThingsBoard's `SharedModule`, so a selector that ThingsBoard already uses
  clashes at runtime ("NG0300: Multiple components match node with tagname …").
  Use `tb-ext-` for those (`tb-ext-checkbox`, `tb-ext-switch`,
  `tb-ext-confirm-dialog`), and check a new selector against ThingsBoard's
  (`grep -rn '"tb-<name>"' node_modules/thingsboard/src/app`) before using it.
- New components should use `standalone: true`
- Reactive forms via `FormBuilder`
- RxJS subscriptions use `takeUntilDestroyed()`
- Barrel exports through `public-api.ts` files per module
- **NEVER let a component show the browser's native `title` tooltip.** Any
  component that exposes a `@Input() title` (or is ever used with a static
  `title="…"` attribute) MUST strip the reflected attribute from its host:
  ```ts
  @HostBinding("attr.title") readonly hostTitle: string | null = null;
  ```
  Otherwise the browser renders its own tooltip ("Metrics", "Signal", …) on
  hover. Applies to every card/widget/chart component — verify there is no
  native hover tooltip anywhere before considering a widget done.
- **Tooltips show instantly with a tiny pop-in animation** (and hide with a
  quick fade), in all dashboards. Timing is central — no per-dashboard setting:
  - `matTooltip`: `provideTbTooltipDefaults()` (`components/shared/tooltip-defaults.ts`)
    is registered once on `ThingsboardExtensionWidgetsModule`, so every widget
    gets it (Material animates its own pop-in). Don't set `matTooltipShowDelay`
    per usage.
  - Custom CSS tooltips (hover-revealed `*-tooltip` / `*-tip` elements) use the
    shared mixins — the pop on the hidden rule (origin = the edge facing the
    button) and the shown mixin on the hover rule:
    ```scss
    @use "…/components/shared/styles/tooltip";
    .my-tooltip { opacity: 0; visibility: hidden; @include tooltip.tb-tooltip-pop(top center); }
    .host:hover .my-tooltip { opacity: 1; visibility: visible; @include tooltip.tb-tooltip-shown; }
    ```
  - To add a show delay later, set both `TB_TOOLTIP_SHOW_DELAY_MS` and
    `$tooltip-show-delay` (`styles/_tooltip.scss`) together.
