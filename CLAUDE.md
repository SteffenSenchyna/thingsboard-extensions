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

# ThingsBoard's own side nav as the dashboards' rail: compile
# white-labeling/custom-css.scss (from styles/_rail.scss + _theme.scss) and
# save it as the tenant's white-labeling Custom CSS
yarn upload:white-label
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

- **Frame styles:** a dashboard's stylesheet includes the shared page frame
  once — `@include dashboard.tb-dashboard-frame(".xx-dashboard", ".xx-main");`
  (`components/shared/styles/_dashboard.scss`): the host (font, the light
  colour tokens, themed scrollbars), the root (rail | main column, the dark
  tokens under `.dark`) and the main column's 16px frame. Its sidebar slot and
  its views use `dashboard.tb-dashboard-sidebar` / `dashboard.tb-dashboard-view`;
  the links at the sidebar's foot ("Clear filters", "Customize columns")
  `dashboard.tb-dashboard-sidebar-links`. A sidebar with a column picker is
  `dashboard.tb-dashboard-sidebar-columns` (a row) around a
  `dashboard.tb-dashboard-filters` column.
- **Table filters, sorting and columns** (as the gateway and fuel dashboards):
  the search box, then the filters inside a `tb-filter-sections` (no "All …"
  option — "Select all" is it; an item covering every value, a regional
  group, passes any pick) ("Hide empty
  filters" at their top, on by default: options with nothing in them
  hide — a snapshot taken while no other filter has picks, so it follows the
  data as it loads and holds as filters are picked, an option then greyed at
  0, never hidden) — a short list a `tb-check-filter`, a long
  one a `tb-filter-section` + searchable `tb-filter-list` — each option counted
  under the *other* filters, and "Clear filters" at the sidebar's foot. Tables
  are `[sortable]="true"`, a computed column given a `sortValue`, the sort kept
  in the user's settings (a default until they pick one). "Customize columns"
  is `tb-column-picker` beside the filters with a `TableColumnChoice`
  (`components/shared/dashboard/table-columns.ts`: the pick, its defaults, kept
  in the user's settings) and the sidebar's `[width]` from `sidebarWidth()`.
  A shared Settings table (Organization › Sites, Access › Groups / Users)
  keeps its pick in its store (`SavedColumnChoice`) — and every Settings
  table (Organization's, Applications, Access) its sort, `SavedTableSort`
  (read as its page shows, saved with each header click; the picker marks
  it) — the link and the picker
  in its filters column (`tb-site-filters`, `tb-access-filters`), the sidebar
  `settingsSidebarWidth(true, store.columnPickerOpen)`.
  Never re-declare these per dashboard.
- **Colours:** the tokens come with that frame (`styles/_theme.scss`). Never
  redeclare `--c-*` tokens locally or hard-code a hex where a token exists.
  A brand accent on a surface — a focus border, a checked control, an active
  icon or link, a spinner — is `var(--c-brand-accent)` (the full brand blue in
  light mode, the lighter tint in dark), never `--c-icon-brand-light` alone
  or a `light-dark()` pair of its own.
- **Spacing / shape:** `card.$card-radius`, `card.$card-stack-gap` (gap between
  cards stacked in panels / sidebars), `form.*`, `button.*` (incl.
  `button.$link-hover-color`; `button.tb-inline-spinner` beside a link whose action runs — "Deleting… 2 / 4"), `tooltip.*`, `motion.*` (`$expand-duration` —
  the open/close speed of cards, settings sections, the filter sidebar and
  detail panels) from `components/shared/styles/`.
- **Page frame:** every dashboard is `tb-nav-rail` (its pages, with the
  alarms and the theme toggle as the rail's second group, right under its
  pages after a divider (`bottomItems`) — or, on a dashboard
  with a Settings page, Settings in the toggle's place:
  `dashboardRailItems(dark, alarms, { settings: true, themeToggle: isTenantAdmin(ctx) })` (a tenant administrator keeps the toggle under Settings, for development; Home's rail also
  has its foot, `[footItems]="dashboardRailFootItems(…)"` — the `code` icon at the rail's bottom edge, lit on "Home
  Development", opening the other version on the same page), the theme then its
  Settings page's Account section, `tb-account-settings` — with the user's
  profile, as ThingsBoard's Profile page) beside a main column
  with a 16px frame; a dashboard with filters wraps the column in
  `tb-sidebar-layout` with `[collapseToggle]="true"` (the sidebar's edge tab —
  no top bar). A table's search is a `tb-search-box` in the sidebar feeding
  the table's `search` input (the table itself `[showHeader]="false"`); table
  actions go in the table's `dt-footer` slot as text links (`button.tb-text-link`).
- **Standalone or nested:** every dashboard runs as its own widget or inside
  the Home dashboard, whose rail opens them in place (Home, Entities — its
  Devices and Assets pages, tenant administrators' — Gateways, a divider,
  Marine, Fuel, QC Lab, Asphalt — a user's rail shows only the apps whose
  Application asset they can read, `NESTED_APP_APPLICATION`; Gateways, tenant
  administrators'; the rail shows the way, the user's access still decides
  what an app shows). Nested (`@Input() host`,
  `components/shared/dashboard/nested-dashboard.ts`) it shows no rail of its
  own — it implements `NestedDashboard` (`railActive`,
  `selectRailPage`, `onResize`) and attaches to the host; its pages (a static
  `nestedPages` on the component) are the menu beside its app's icon in
  Home's rail (`NavRailItem.children`: on hover, in the tooltip's place — a
  page picked opens the app on it; `NavRailItem.divider` starts the apps'
  group). No second nav column; an app with views only (QC Lab, Asphalt)
  shows them as the button group atop its sidebar. It takes the host's theme, reads the widget settings
  the host passes (`dashboardWidgetSettings`: Home's CARTO key; else its defaults), keeps a Settings page only for
  sections of its own (`nestedSettingsSections` — the shared ones are on
  Home's), and writes its URL state with its app (`nestedUrlParams`),
  ignoring another app's (`ownsUrlState`). A new dashboard does the same.
- **Device counts by the hierarchy:** never walk the relations to count —
  read what the calculated fields store (`components/shared/organization/
  hierarchy-counts.ts`, `loadHierarchyCounts`): `devices` / `devicesOnline` on
  sites, markets and trucks, a product line's own as `lineDevices` /
  `lineDevicesOnline` (ThingsBoard never re-runs a calculated field for its own
  output, so a line can't sum its sub lines'), kept by "Hierarchy device
  counts" (asset profiles), "Created device counts" and "Mark created devices"
  (`hasCreator`: a gateway-created device counts once, through its gateway) on
  the gateway profiles.
- **Where a device is:** never walk the relations to place a row — read the
  device's server attributes `site` / `market` / `productLine` (codes; their
  labels from `loadOrganizationNames`, `components/shared/organization/
  site-locations.ts`, `LOCATION_KEYS`). The backend keeps them: the "Device
  Site Attributes" rule chain (Root and every device profile's chain route
  relation events to it) re-derives an entity's from its parents when a
  relation is added or removed and stores each site's / market's / product
  line's own code (`siteCode`, `marketCode`, `lineCode`) on create / rename;
  the "Propagate …" calculated fields (Market, ProductLine, Site, RMX Truck,
  the gateways' "Mark created devices") carry a rename or a move down. A
  filter's counts are the table's own rows under the other filters (in the
  page, from rows already loaded) — not the stored totals.
- **Fuel codes:** a user / vehicle code is its `USR-` / `VEH-` asset
  (FuelUser / FuelVehicle) in one scope — a market (every Fuel site of it) or
  one site — linked from it by `FuelUser` / `FuelVehicle`, its slot in that
  scope's `userCodes` / `vehicleCodes` server list. The backend carries them
  down: the Market's "Push fuel codes to sites" (over `Contains`:
  `marketUserCodes` / `marketVehicleCodes` on each site), the Site's "Push
  fuel codes to PLC" (over `FuelPLC`, never `Contains`: the market's codes,
  then the site's, to its PLC), the PLC's own fields to the gateway — so a
  dashboard writes only the scope's list. Access groups take a code where it
  works (`SITE_WIDE_RELATIONS`, `access.models.ts`: its market's sites the Fuel
  app runs at — a plant's group too): at their sync, and as it's assigned
  (`AccessStore.joinCoveringGroups`).
- **Charts:** `tb-line-chart` / `tb-metric-chart-card` / `tb-bar-chart` /
  `tb-trend-chart`, series coloured by the chart palette tokens
  (`var(--c-chart-1)` … `--c-chart-5`, in that fixed order, never hex), one
  shared tooltip (`chart-tooltip.ts`). Key figures: `tb-stat-grid`; summary
  rows: `tb-summary-cards`; a count per day over the last year (GitHub-style
  calendar, one blue ramp, with its figures): `tb-calendar-heatmap`; a
  settings-style section menu: `tb-section-nav`.
- **UI pieces:** use the shared components (`tb-data-table`, `tb-status-pill`,
  `tb-header-icon-button`, `tb-alarm-list`,
  `tb-entity-detail-panel`, `tb-icon-badge` (an icon on the panel header's
  rounded tile — a panel's header, "sm" beside a detail's value: a group's
  scope type, its level), `tb-segmented-control`, `tb-split-toggle`,
  `tb-radio-group` (a single choice whose options need explaining — round
  options, each with an info tooltip; an access scope's type and a level are
  selects beside their `tb-icon-badge`),
  `tb-filter-list`, `tb-check-filter` (a short checkbox group with a heading),
  `tb-filter-section` (divider + folding heading around any sidebar filter),
  `tb-collapsible-section` (a folding section inside a card — a station's pumps;
  `form.tb-section-divider` between them), the Organization's product lines /
  markets / sites (`OrganizationStore` + `tb-organization-settings` on the
  Settings page + `tb-organization-panels` in the dashboard root —
  `components/shared/organization/`; a product line may have a parent product
  line — any depth, the parent `Contains` it (Manage's "Edit (n)" sets several
  lines' parent), shown as `tb-data-table`'s tree (`treeParentKey`: a round dot a
  level before a child's name — "·", "· ·" — no lines or collapsing), its scope covering its sub
  lines' sites: `lineWithin`, `productLineOptions`; others follow its edits
  with `org.follow(…)`), the applications (`ApplicationStore` +
  `tb-application-settings` + `tb-application-panels` —
  `components/shared/applications/`; a dashboard applying them to devices
  passes `memberRelation`; one with an Organization passes `siteRelation` and
  sets `apps.org`, giving the panel a Sites tab — where the app runs, a
  market → sites tree, an Application → site relation each; an application
  names its device / asset profiles and its dashboards, what access to it
  covers), the Access (`AccessStore` + `tb-access-settings` (Groups / Users)
  + `tb-access-panels` — `components/shared/access/`: an access group is a
  user group of the access owner ("WCAN") with a scope (product line and / or
  market, or one plant — named with its product line and market), apps, a
  level and a home dashboard in its additional info; regional and every
  product line, market and site has three default groups (`auto`, a level
  each — named by a market's / product line's name, its code, and a plant's
  label: "Market · GVA (RMX) · Viewers", "Product line · RMX · Operators",
  "Plant · Richmond Lab · Managers" — `defaultGroupName`, and the chain's
  "Default groups" / "Groups to rename" the same), made when the item is created (which moves it
  to the owner), renamed with it and deleted with it by the **"Access
  Lifecycle" rule chain** (from the Root chain's Entity Created / Updated /
  Deleted; REST calls with the `tbApi` secret) — wherever the item changed, so
  a dashboard never makes or deletes them itself; a default group syncs when
  first joined or with "Sync all" ("Add default groups (n)" makes any missing; Manage's "Edit (n)" edits several
  groups' access at once — "Add" / "Remove" boxes for the apps and the other
  dashboards (`tb-tag-picker [asSelect]`), the level and "Opens on" as
  selects — each left empty (dashes) keeps every group's own, `applyBulkGroups`);
  the Groups and Users pages have a filters column beside the Settings menu
  (`tb-access-filters [page]`, the store's `groupFilter` / `userFilter`; the
  sidebar `settingsSidebarWidth(true)`; Organization › Sites has its own,
  `tb-site-filters` — product line tree, market — on the `OrganizationStore`'s
  `siteFilter`; both columns styled by `dashboard.tb-settings-filters`): search, "View default groups (n)"
  (Groups — the default groups hidden until checked), scope, product line,
  market, apps (Groups), level — level first, the product lines as their tree
  (`tb-filter-list` nests to any depth; a `selectable` parent picks itself
  too) — and both tables show the scope a column per level (scope, product
  line, market, plant) and the level; a sync marks the default groups and its own entity groups
  `autoGenerated` (server attribute; the entity groups also
  `additionalInfo.autoGenerated`, so lists of a device's groups drop them —
  `isAutoGeneratedGroup`); saving / "Sync all" turns it into entity groups and group
  permissions, and writes the scope onto the user group as server attributes
  (`scopeType`, `productLine`, `market`, `plants`, `level`, `applications`, …
  — for filters); a user has a scope too (the same attributes on the user,
  `scopeAttributes`) and a level, joins their scope's default group of that
  level when created (others added after) — one default group a user: joining
  another (a group's Members tab) moves them, taking its scope and level, and
  the Access Lifecycle chain's "Added to Group" branch takes them out of any
  other and only groups within the scope
  (`scopeWithin`); both forms pick a scope with the shared
  `tb-access-scope-picker`; where a user opens is their own "Opens on" if
  the user form sets one (their additional info's `homeOverride`, over their
  groups'), else comes from their broadest group with a start app or a home
  dashboard ("Opens on"): a start app is one
  of Home's apps (`components/shared/dashboard/home-apps.ts`, `HOME_START_APPS`)
  — the user's home is then Home and Home opens the app (their additional
  info's `homeStartApp`, read as Home loads with no place in its URL); a home
  dashboard is only for an app Home doesn't open (In-Transit, Aria); none of
  their groups sets one — Home, opening on their app if their groups open just
  one (Home's rail shows one app: `homeApp`; the store's `onlyHomeApp`); the default home — WCAN's customer home dashboard, else the tenant's:
  Home — is shared once, not per group: "Sync all" puts it in the
  "Access · Home" dashboard group (its owner's) with Viewer for the owner's
  "All" users, so no one lands on a home they can't open; a sync names each
  step that failed — the toast the first, the console every one),
  `tb-ext-confirm-dialog`, `tb-timeframe-picker` (the
  "1D | 1W | 1M" picker for every chart and table; `customRange` adds a
  calendar segment that opens `tb-date-range-picker`, placed in the dashboard
  root), …) instead of re-building
  them in a dashboard.
- **Product line, market, site / plant columns:** in every table, each by
  its asset name (its code: "RMX", "4R20"), its label in the dashboards'
  bubble on hover (`tooltipKey` / `tooltipOf` on the column; empty when
  the label is the code), sorting by the code, both searchable.
  In every filter box, a market and a product line show by their name too
  ("GVA", "RMX"); a site by its label with its code ("Richmond Lab (4R20)");
  a picker's product line after the lines above it, they by their labels, it
  by its name ("Building Materials › ACM › AAT" — `productLineLabel`).
- **A list too long to hold** (the tenant's assets — tens of thousands of
  tickets): `tb-data-table` server paging — `[serverTotal]` (the count of
  all), `[serverPage]`, `(pageChange)` / `(sortChange)`, the rows one page
  fetched with an entity query's `pageLink` (its `textSearch`, its
  `sortOrder`); the page's filters counted with `/api/entitiesQuery/count`.
  Home's Devices and Assets pages (`home/components/entity-manager/`, one
  component, `[kind]`; tenant administrators') are the example.
- **Tables:** every `tb-data-table` shares one row style — rows at least 40px
  with 6px vertical cell padding (`$row-height` / `$cell-padding-y` in
  `data-table.component.scss`) and 13px text (`table.$table-text-size` in
  `styles/_table.scss` — custom cell templates use it too). There is
  deliberately no per-table row-height input; change the shared values instead.
  Every settings table is paginated with `[fitPageSize]="true"` (a page of
  20 rows at most — `DT_FIT_PAGE_ROWS`, one size for every settings table; a tree table (`treeParentKey`, the product lines) shows all its rows; a table with more than one page keeps a full
  page's height on every page; one that fits on a page shows no page
  controls), never `[paginated]="false"`.
- **Shared dashboard code** (`components/shared/dashboard/`): the alarms
  (`subscribeActiveAlarms`, `clearDashboardAlarm`, `countAlarmsByOriginator`,
  the `DashboardAlarm` type), the user's saved settings and the rail's second
  group (`readUserSettings`, `saveUserSettings`, `dashboardRailItems`), the
  theme (`DashboardTheme`: light / dark / system — the device's setting,
  followed live — made in `ngOnInit`, restored from the user's settings,
  `.dark` bound to its `dark`; the rail's toggle is `toggle()`, the Account
  section `set()`), the page kept in the URL so a reload lands on it
  (`writeDashboardUrlState` on each move — a page pushes, a tab / section
  replaces — `readDashboardUrlState` at start, `watchDashboardUrlState` for
  Back / Forward), and the live refresh of a table
  (`subscribeLatestChanges`, `removeSubscriptions`, `byNamePageLink`). Parsing /
  formatting helpers are in `components/shared/value-utils.ts` (`parseNumber`,
  `parseObject`, `parseBool`, `parseDescription`, `fmtNumber`, `apiMessage`,
  `QUIET_REQUEST`) and `time-format.ts` (`formatWhen`, `relativeTime`). Never
  copy these into a dashboard or its models.
- **Alarms:** the alarms side panel is `tb-alarm-panel` (in the dashboard
  root, `[ctx]="ctx"`: under each device's name, its stored `site` — read by
  the panel, once per originator; a dashboard sets no sub-label of its own);
  a row's alarm / error count is `tb-count-mark`. A site's Google Chat
  space is its `googleChatUrl` server attribute — set in Organization › Sites'
  panel (the masked "Google Chat webhook" card, read only as the panel opens,
  never with the list); the Alarm Routing chain posts the site's alarms there.
- **Loading page:** every dashboard shows `tb-dashboard-loading` (last in its
  root, `[loading]="pageLoading"`) until its first load is in — `pageLoading`
  from a `FirstLoad` (`firstLoad.pending(this.xLoading, …)`), so a reload
  never brings it back; it gives up after `DASHBOARD_LOADING_MAX_MS`. Each
  Settings component (Organization, Applications, Access, Account, an app's
  own) shows it too, `[section]="true"` over itself (host `position:
  relative`), once per section — `FirstLoads.pending(section, …)`.
- **Selects:** a `tb-select` with nothing picked shows dashes, "---------"
  (`SELECT_EMPTY`, its default placeholder) — never a placeholder of its own
  ("Select a market"); a bulk edit's "leave each as it is" reads the same.
  An empty value that means something is an option with its label ("None",
  "Home", "Tenant (no customer)").
- **Forms:** a form's stylesheet takes its classes from the shared set —
  `@include form.tb-panel-form("xx");` (a side panel's form: host, `.xx`,
  `.xx-fields`, `.xx-field`, `.xx-label`, `.xx-input`, `.xx-hint` /
  `.xx-error`, `.xx-actions`, `.xx-cancel`, `.xx-submit`) or
  `form.tb-form-fields("xx")` / `form.tb-form-actions("xx")` — and only adds
  what is particular to it. Also shared: `form.tb-pane-title`,
  `form.tb-section-note`, `form.tb-code-chip`, a card's sections
  (`form.tb-field-section` + `form.tb-section-heading`, `form.tb-section-divider`
  between them — a device's channels, a station's pumps), `form.tb-info-line`
  (an inline editor's note with an info icon), `card.tb-figure-head` /
  `tb-figure-title` / `tb-figure-foot`, `card.tb-meter-track` /
  `tb-meter-fill`, `badge.tb-count-badge`, `table.tb-cell-title`,
  `table.tb-cell-meta-classes`, `table.tb-table-footer-links`.
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
- **Toasts:** use `tb-ext-toasts` (placed in the dashboard root; call it via
  `@ViewChild("toasts", { static: true })` — `toasts.success(…)`, `warn`,
  `error`, `info`), never `ctx.show*Toast`, which opens ThingsBoard's own toast
  in its overlay and ignores the theme.
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
    shared mixins. Every tooltip has one look — the bubble: navy with white text
    in light mode, slate in dark (`--c-tooltip-bg` / `-text`, `styles/_theme.scss`):
    `tooltip.tb-tooltip-bubble(<placement>)` on the hidden rule and
    `tooltip.tb-tooltip-bubble-shown` on the hover rule give the whole thing
    (look, caret, pop); a bubble of its own takes `tooltip.tb-tooltip-surface`
    (the fill, the text, the lift) and a caret in `var(--c-tooltip-bg)` — never
    a colour pair of its own. The rail is the exception: its tooltips and its
    page menus are the button group's look (`tb-segmented-control`'s track and buttons). Otherwise, the pop on the hidden
    rule (origin = the edge facing the button) and the shown mixin on the hover rule:
    ```scss
    @use "…/components/shared/styles/tooltip";
    .my-tooltip { opacity: 0; visibility: hidden; @include tooltip.tb-tooltip-pop(top center); }
    .host:hover .my-tooltip { opacity: 1; visibility: visible; @include tooltip.tb-tooltip-shown; }
    ```
  - To add a show delay later, set both `TB_TOOLTIP_SHOW_DELAY_MS` and
    `$tooltip-show-delay` (`styles/_tooltip.scss`) together.
