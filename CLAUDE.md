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
# save it as the tenant's white-labeling Custom CSS (also compiles the login
# page's, white-labeling/login-css.scss → target/white-labeling/login.css: the
# system's login white-labeling, saved by its administrator; both share the
# corners, white-labeling/_shapes.scss; ThingsBoard's own loading spinners are
# the logo spinner, a mask made from logo-spinner.svg —
# white-labeling/make-spinner-mask.py → _spinner.scss, again after it changes)
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
  in its filters column (`tb-site-filters`, `tb-access-filters`). A Settings
  page's sidebar is `tb-settings-sidebar` (the section menu — none on Home,
  whose rail is it — and the section's filters beside it), its width
  `settingsSidebarWidth(section, withMenu, org, access)` (a column without a
  menu: the layout's 17px before its divider added, `SIDEBAR_LAYOUT_INSET`).
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
  has its foot, `[footItems]="dashboardRailFootItems(…)"` — the `code_blocks` icon at the rail's bottom edge, lit on "Home
  Development", opening the other version on the same page), the theme then its
  Settings page's Account section, `tb-account-settings` — with the user's
  profile, as ThingsBoard's Profile page; Home's rail is its own: Home, the
  Alarms right under it, Entities, Gateways, the apps after a divider and —
  a tenant administrator's — the Settings page's sections after another
  (`settingsRailItems`: Applications, Organization and Access with their
  pages as an app's menu, Account), the theme toggle its second group; its
  Settings page has no section menu — the rail is it — only an Access page's
  or Sites' filters as its sidebar, `.tb-settings-filters-alone`) beside a main column
  with a 16px frame; a dashboard with filters wraps the column in
  `tb-sidebar-layout` with `[collapseToggle]="true"` (the sidebar's edge tab —
  no top bar). A table's search is a `tb-search-box` in the sidebar feeding
  the table's `search` input (the table itself `[showHeader]="false"`); table
  actions go in the table's `dt-footer` slot as `tb-table-links` (see "Settings
  tables, panels and forms").
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
- **Home's page follows the viewer's scope** (`scopeOf`, from the sites,
  markets and product lines they can see): a plant, a market, a product line
  or everything. A scope gets its own card first (its title "Plant · …",
  "Market · GVA", what it holds), then Devices, Active alarms, By app; the charts
  break down a level under it (`SCOPE_DIMENSIONS` — a plant's by device
  type, a market's by site and product line, …), the devices from their
  stored `site` / `market` / `productLine`; beside them a scope's Top alarms
  (its five most frequent active alarm types).
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
  page, from rows already loaded) — not the stored totals. Always the
  *server* attributes (`SERVER_ATTRIBUTE`): ChirpStack writes client
  attributes of the same names ("site: R20"), which an entity query's
  any-scope `ATTRIBUTE` key can return instead.
- **Device names:** a device is named `<product line>-<site>-<type>-<number>`
  ("agg-3b30-scale-01"); a LoRaWAN sensor is named by its DevEUI and carries
  that name as its `deviceName` client attribute. The **"Device Naming" rule
  chain** (a sweep every 5 minutes — device events go to a chain per profile)
  reads it and stores its parts as server attributes: `nameSite` ("3B30"),
  `nameLine` ("AGG") and `nameType` (the type code's category — "gw" →
  "Gateway": one code covers several profiles, so it never sets the profile).
  A device with no site yet whose `nameSite` is a Site is placed there (Site
  —Contains→ device; the Device Site Attributes chain derives the rest); one
  that has a site is never moved — Access › Health lists the devices at
  another site than their name says, or named for a site that isn't one.
- **Access without a sync:** a device or asset that appears or moves with
  nobody at a screen joins and leaves its access entity groups by the
  **"Access Membership" rule chain** — hooked after the Device Site
  Attributes chain's "Save its location" — for entities at a site (a
  truck's, a ticket's: still the sync's). It reads two indexes the sync
  writes (`AccessStore.writeAccessIndex`, after any group syncs or is
  deleted): each site's `accessGroups` (the groups covering it, their device
  / asset entity groups by the profile they take, "*" for every profile) and
  the access owner's `accessBlocks` (every access entity group — what an
  entity may be taken out of). No index: it does nothing. Which groups cover
  what stays the sync's rule — change it there, never in the chain.
- **Alarms per day:** never read a year of alarms (or ThingsBoard's API
  usage) to count them — read what the backend keeps, the server attribute
  `alarmsPerDay` (`{"2026-11-10": 12, …}`: a year, each day in Mountain
  time, a day without alarms left out) on every site, market, product line
  (its sub lines' included), region (the markets it Contains) and the tenant
  (every device's) — `components/shared/organization/alarms-per-day.ts`
  (`viewerAlarmsPerDaySource`: a tenant administrator's the tenant's, a
  user's their scope's; `loadAlarmsPerDay`). The **"Alarms Per Day" rule
  chain** keeps it: its own generator, every 5 minutes, counts today's and
  yesterday's device alarms again by the devices' stored location and merges
  them in.
- **A user's own alarm notifications (Google Chat, email):** a user keeps, on
  their own profile (its additional info — the one record every user may
  edit, with `PROFILE` on the access groups' generic role), `googleChatUrl`
  (their space's webhook: Settings › Account, masked) and `alarmChat` —
  `{ <device id>: { <alarm type>: { severities, chat, email } } }`: the
  severities that tell them — any of them; none named: every severity — and
  where (older entries still
  read: a severity alone means Google Chat from it up; `severity`, from it up) (`components/shared/alarm-chat/`: the keys, the parsers,
  `ownProfileOf(ctx)` — the user's record, one copy a widget, its saves one
  at a time through `SerialQueue`; a user's record is saved with
  `saveUserRecord`, never ThingsBoard's `userService.saveUser`). A device's
  Alarms tab is `tb-alarm-list [ctx] [deviceId] [notices]`: a picker on top
  ("Alarms | Notifications", the timeframe picker's look) switches between
  the alarms and `tb-alarm-subscriptions` — the device's alarms (its server
  attribute `alarmRules`), each with two round toggles (the bell: Google
  Chat; the envelope: email) and, once told somewhere, the alarm's own
  severities as boxes folding open under it (`tb-fold` around
  `tb-severity-boxes mode="many"`: none lit until picked, each on or off by
  itself; the lit ones tell them) —
  a form as the panels' others: the picks are a draft until "Apply changes"
  (`tb-form-actions`, shown while something changed; Cancel puts them back).
  The bell on with no webhook on the user's profile folds a warning
  `tb-callout` open above the list, its link opening Settings › Account
  (`openAccountSettings(ctx)`, `dashboard-url-state.ts`: the place written
  into the URL, which the dashboard — Home, for a nested app — follows).
  Everything a user has set shows in one table on Settings › Account
  (`tb-alarm-notifications`: device, alarm, where and severities — the
  form's own toggles and boxes, only shown); a row opens that device's form in the side panel
  (`tb-alarm-notification-panel [ctx] [notices]`, in the dashboard root of a
  dashboard with an Account page; `notificationPanelOf(ctx).show(…)`). The
  round toggle is `tb-round-toggle` (`[readonly]`: a table's mark), named
  with `tbTip`. Severities everywhere are
  `tb-severity-bar` (the 1–4 segment bar) and `tb-severity-boxes` (the row of
  boxes — an alarm list's filter: one; a notification's severities: any
  number; `[readonly]` in a table's cell: the picked ones, only shown). The **"Alarm
  Chat" rule chain** does the rest: every 10 minutes it publishes each
  profile's alarm rules on its devices (`alarmRules` — a user can't read a
  profile's rules); a user saved (Root's Entity Updated), it copies their
  changed `alarmChat` onto the devices (`alarmChat_<user id>`); an alarm of a
  device (from the Alarm Routing chain's switch), it tells each user who
  asked for that type at that severity — a card to their
  Google Chat, an email to their account's address, or both — while they can
  still read the device (asked as them). Never read alarm rules or other
  users for this in a dashboard; a new device panel passes its device to
  `tb-alarm-list`. (A rule-chain script's comments: no apostrophes near
  quoted words — the instance's AWS firewall reads some such text as an
  injection and refuses the request that carries it.)
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
  (`AccessStore.joinCoveringGroups`). Only an **active** code holds a slot: a
  code's server attributes `codeStatus` (active — none — / suspended /
  expired) and `expiresAt` (ms; none: never); Suspend takes it out of its
  list (its slot freed, its asset and keypad code kept) and Resume puts it
  back where there's room; past its `expiresAt` the **"Fuel Code Expiry"
  rule chain** (every 5 minutes) takes it out and marks it expired. Every
  change is a `code_*` event on its market (assigned, edited, suspended,
  resumed, expired, revoked). A code opens its panel from the Codes table
  (its use at its scope's pumps, its changes; holder and expiry, Suspend /
  Resume, Revoke); its digits show masked (`maskCode`) until shown there.
- **Fuel totals:** never total a pump's events in the page (a busy pump has
  more than one read returns) — read what the **"Fuel Daily Totals" rule
  chain** stores on each pump (every 2 minutes, from its `event` time
  series): a point a quarter-hour, `fuelQtrLitres` / `fuelQtrDispenses` /
  `fuelQtrDenied` (denials and timeouts), and a point a day at its
  midnight (America/Edmonton), `fuelDay*` — the Stations cards' "today"
  (`PumpRow.today`); the Reports page sums the quarters by the hour (by the
  day past `REPORT_HOURLY_MAX_DAYS`) with ThingsBoard's own `SUM`
  (`buildFuelReport`, `fuel-reports.models.ts`). Who took the fuel (a
  user's, a vehicle's litres) still comes from the dispense events; their
  litres also as `fuelVolume`, a point a dispense.
- **Charts:** `tb-line-chart` / `tb-metric-chart-card` / `tb-bar-chart` /
  `tb-trend-chart`, series coloured by the chart palette tokens
  (`var(--c-chart-1)` … `--c-chart-5`, in that fixed order, never hex), one
  shared tooltip (`chart-tooltip.ts` — the tooltip bubble, as a map's marker
  label). Key figures: `tb-stat-grid`; summary
  rows: `tb-summary-cards`; a count per day over the last year (GitHub-style
  calendar, one blue ramp, with its figures): `tb-calendar-heatmap`; a
  settings-style section menu: `tb-section-nav`.
- **UI pieces:** use the shared components (`tb-data-table`, `tb-status-pill`,
  `tb-table-count` (a count in a table cell — its icon and the number; with
  its `(open)` bound, a link to what it counts, brand blue while there's any:
  a group's Members, a role's Groups and Members, an Organization item's
  Users; else plain, a summary row's sum),
  `tb-header-icon-button`, `tb-alarm-list`,
  `tb-entity-detail-panel`, `tb-manage-card` (a Settings detail panel's
  "Manage" card, under its form's last card: a `tb-manage-action` row an
  action, the delete last in red — an Organization item's, an application's,
  an access group's a plain "Delete"; a user's, their account's actions),
  `tb-icon-badge` (an icon on the panel header's
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
  `components/shared/organization/`; each table's Users column — the users
  whose own scope is the item, `loadItemUsers` — a count opening the item's
  panel on its Users tab, as a group's Members; a product line may have a parent product
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
  + `tb-access-panels` — `components/shared/access/`: an access group's applications are what it's granted: a default group
  with none opens none (its apps are granted to it — Applications on its
  form or bulk edit), a hand-made one with none every app that runs at one
  of its scope's sites (or isn't tied to sites) — `groupApps`; its devices
  and assets are its apps' profiles', its Application assets Home's rail;
  an access group is a
  user group of the access owner ("WCAN") with a scope (product line and / or
  market, or one plant — named with its product line and market), apps, a
  role (its `level`: the role's id) and a home dashboard in its additional
  info; a **role** (Access › Roles, `tb-access-role-form`; the roles a JSON
  list on the access owner, server attribute `accessRoles` — none stored:
  Viewer, Operator, Manager, `BUILT_IN_ROLES`, their ids kept) is a template:
  its actions (the grid, `ACCESS_ACTION_ROWS` — `setPermissions` grants them),
  the apps and "Opens on" its groups take when they set none of their own
  (`store.effective` — `runningApps`: with them, the apps that run at one of
  the group's scope's sites, worked out at each sync), and where it applies — regional, every / some / no
  product line, market, plant (`roleAppliesTo`); saving one applies it
  (`applyRole`: its missing default groups made, the empty ones where it no
  longer applies deleted after a confirm — those with members stay — renamed
  and synced when its name or access changed); a role in use (a group with
  members, a hand-made group, a user's own) can't be deleted; a `default`
  role (set in `accessRoles` only, never by the form — the three to start
  are unless it says otherwise) shows locked: neither edited nor deleted; every item a
  role applies to has a default group of it (`auto`, a role
  each — named without their scope's type, a market / product line by its
  name (its code), a plant by its label: "GVA (RMX) · Viewers", "RMX ·
  Operators", "Richmond Lab · Managers" — `defaultGroupName` with the role's
  group name, `plural`; the chain's "Default groups" / "Groups to rename" the
  same, reading `accessRoles` with a customer-attributes node — a new item
  gets a group of each role applying to every item of its kind; the chain's delete
  and rename branches take WCAN's groups one at a time (a split array: the
  whole list overflows a script's 100k input)), made when the item is created (which moves it
  to the owner), renamed with it and deleted with it by the **"Access
  Lifecycle" rule chain** (from the Root chain's Entity Created / Updated /
  Deleted; REST calls with the `tbApi` secret) — wherever the item changed, so
  a dashboard never makes or deletes them itself; a default group syncs when
  first joined or with "Sync all" ("Add default groups (n)" makes any missing; Manage's "Edit (n)" edits several
  groups' access at once — "Add" / "Remove" boxes for the apps and the other
  dashboards (`tb-tag-picker`), the level and "Opens on" as
  selects — each left empty (dashes) keeps every group's own, `applyBulkGroups`);
  the Groups, Users and Roles pages have a filters column beside the Settings menu
  (`tb-access-filters [page]`, the store's `groupFilter` / `userFilter` /
  `roleFilter` — Roles: Applies to, Permissions (`actions`, the actions grid's
  rows), Applications, `rolePasses`; the
  sidebar `tb-settings-sidebar`; Organization › Sites has its own,
  `tb-site-filters` — product line tree, market — on the `OrganizationStore`'s
  `siteFilter`; both columns are `tb-settings-filters` around their own filters): search, "View default groups (n)"
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
  level when created (others added after; a group's Members tab only shows
  its users — a view-only `tb-detail-table`) — one default group a user: joining
  another moves them, taking its scope and level, and
  the Access Lifecycle chain's "Added to Group" branch takes them out of any
  other and only groups within the scope
  (`scopeWithin`); both forms pick a scope with the shared
  `tb-access-scope-picker` and show under the level what it may do,
  `tb-access-level-actions` (a role's actions; `[editable]` in the role
  form); where a user opens is their own "Opens on" if
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
  controls), never `[paginated]="false"`. Similarity grouping (as UniFi's)
  is the table's `groupKey`: rows sharing a value fold into a summary row of
  their own (`groupSummary`: its cells — a dash where the rows differ, sums),
  folded to start — a + / − toggle, its count "(n)" (`groupCountColumn`),
  opened its rows under it on tree lines, their `groupSharedColumns` blank;
  paged by its top-level rows (20 a page, as every settings table — an open
  group's rows come with its summary row, never split across pages). Access › Groups' switch atop its
  filters groups by scope (the store's `groupSimilar`, a `SavedToggle` kept
  in the user's settings): a summary row is named after the scope
  (`scopeShortName` — its default groups' name before the level), its
  members summed, its scope's type shown, "Created on" a dash.
- **Shared dashboard code** (`components/shared/dashboard/`): the alarms
  (`subscribeActiveAlarms`, `clearDashboardAlarm`, `countAlarmsByOriginator`,
  `alarmSeverityTone` / `alarmSeverityRank`, the `DashboardAlarm` type), the user's saved settings and the rail's second
  group (`readUserSettings`, `saveUserSettings`, `dashboardRailItems`), the
  theme (`DashboardTheme`: light / dark / system — the device's setting,
  followed live — made in `ngOnInit`, started in the theme last shown in
  this browser (local storage, so a reload doesn't flash the system's),
  restored from the user's settings,
  `.dark` bound to its `dark`; the rail's toggle is `toggle()`, the Account
  section `set()`; both, and the restore, mark it on ThingsBoard's app root,
  `tb-root[data-tb-theme]` — kept as the user moves on to ThingsBoard's own
  pages, where the white-labeling's custom CSS keeps its side nav, top bar
  and menus in it), the page kept in the URL so a reload lands on it
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
  a row's alarm / error count is `tb-count-mark`; a details panel's Alarms
  tab (its button group's bell) is `alarmsTab(alarms)` (`dashboard-alarms.ts`
  — its badge the active alarms it lists), never written by hand. A site's Google Chat
  space is its `googleChatUrl` server attribute — set in Organization › Sites'
  panel (the masked "Google Chat webhook" card, read only as the panel opens,
  never with the list); the Alarm Routing chain posts the site's alarms there.
- **Loading page:** every dashboard shows `tb-dashboard-loading` (last in its
  root, `[loading]="pageLoading"`) until its first load is in — `pageLoading`
  from a `FirstLoad` (`firstLoad.pending(this.xLoading, …)`), so a reload
  never brings it back; it gives up after `DASHBOARD_LOADING_MAX_MS`. Its
  spinner is the app's logo, `tb-logo-spinner` (the circuit tree and its ring
  still, an accent arc bouncing between the two sides of the ring's slit —
  growing round from one to the other, drawing in to it, growing back — all
  of it the brand accent, the ring a faint tint of it; 96px, no text — a
  small spinner, a
  table's or a link's, stays a plain ring). Each
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
  critical → error, major → major, minor → warning, warning → success
  (`alarmSeverityTone`).
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
- **Toasts:** use `tb-ext-toasts` (placed in the dashboard root — they show at
  its top-left corner, past the rail, in every dashboard; call it via
  `@ViewChild("toasts", { static: true })` — `toasts.success(…)`, `warn`,
  `error`, `info`), never `ctx.show*Toast`, which opens ThingsBoard's own toast
  in its overlay and ignores the theme.
- **Access syncs by itself after an edit** (`AccessStore.settle` →
  `syncPending`): a new site, a site whose market, product line or
  applications changed, an application's Sites tab applied — the groups
  covering those sites sync once the rule chain has had a moment (edits in a
  row gather into one sync); a new market's or product line's own groups
  too. "Sync all" is the repair button, not a step. The Organization and the
  Applications tell it (`org.follow` — `changed` — and `apps.follow`:
  `sitesChanged`); never sync from a dashboard.
- **A site's applications** are set from either side: an application's Sites
  tab, or the site's own form ("Applications" — `OrganizationStore.siteApps`,
  the `ApplicationStore`'s `setSiteApps`). A new plant is one form: name,
  product line, market, applications — its default groups, their apps (the
  roles' "apps running in scope") and their sync follow.
- **An Organization item's panel** is its hub: its form, then Users, Groups
  (the access groups reaching it — a site's: every group covering it;
  `OrganizationStore.access`, the `AccessStore`) and, a site's, Devices (those
  stored at it) — each a `tb-detail-table`.
- **Access › Groups as a matrix** (the "Matrix" switch atop its filters,
  `store.groupMatrix`) is the Groups table itself, never a table of its own:
  the same `tb-data-table`, its rows the scope items (named as the
  similarity grouping's rows, with the list's scope columns and cells), a
  count column a role (`accessMatrixColumns` — the item's default group of
  the role, its members; none there: a dash), the list's footer without
  Manage, its own saved sort (`groupMatrixSort`). A count opens the group on
  its Members tab, a row the item's panel on its Groups tab. The page's
  search and its Scope / Product line / Market filters narrow the rows, Role
  the columns; the filters it doesn't use hide while it's on. A second view
  of a table is a mode of that table — its columns and rows swapped — not
  another component.
- **Side panels that lead to each other share a trail** (`PanelTrail` +
  `tb-panel-trail`, `components/shared/panel-trail/` — as UniFi's): a plant's
  panel, a group from its Groups tab, a member from the group — each a tab
  on a strip on the open panel's left edge (its icon, "Kind · name" in the
  bubble, a × to drop it), the open one lit; a tab opens its panel again on
  the tab it was left on. The strip shows from the second stop on; a panel
  opened from a table starts a new trail, closing the panel ends it. The
  dashboard's `AccessStore` owns the trail and hands it to the Organization
  and the applications (`org.trail`, `apps.trail`); `tb-access-panels` shows
  the strip. A store joins (`trail.join(this, close)`) and — first thing as
  a panel opens, before it closes anything — calls `trail.visit(this, stop)`
  for an entity's panel or `trail.reset(this)` for a blank form / bulk edit
  (the trail closes the other stores' panels: never close another store's
  panel by hand); its panel's `(activeTabChange)` goes to the store's
  `noteTab`. A new panel that can be reached from another one joins the
  same way — never a back button or a breadcrumb of its own (the fuel
  dashboard's station, pump and code panels do: `access.trail.join(this, …)`,
  a `PanelStop` each, `onPanelTab`). The panel's
  box (`$panel-width`, its z-indexes, edge line, shadow) is
  `styles/_panel.scss`.
- **Side panels slide only at the ends:** the first panel slides in and the
  last one out; a panel opening as another closes swaps in place at once —
  `tb-detail-panel` settles every panel whose `open` changed in one pass
  together (`queueMove`), so never animate a panel change yourself. A
  `dismissible` panel's scrim passes a click on a clickable table row on to
  the row (`clickableRowUnder`: the row opens in the panel's place — on a
  trail, as its next stop — and looks hovered under the pointer,
  `.dt-row-hover`); any other click-off, and a row of a table in Manage,
  closes the panel.
- **Access › Health** (`store.health`, the fourth Access page — no filters
  column): a row a check over what's loaded — orphaned groups, groups of a
  removed role, users in several default groups or outside their own,
  default groups to add / not synced / with no apps / no role applies to,
  sites without links or apps — its failing items in its panel
  (`tb-detail-table`, a row opens the item), a `fix` where one action settles
  it. A new rule the access model must keep gets a check there.
- **Settings tables, panels and forms** — one set of pieces, never rebuilt
  per page:
  - a table's footer is `tb-table-links` in `dt-footer`: "Create new |
    Manage", then the table's own links (`tb-table-link`: "Sync all",
    "Import"); managing, "Edit (n) | Delete (n) | Select all (n) | Done" —
    its state a `TableManage` (`data-table/table-manage.ts`: `[multiSelect]=
    "manage.managing"`, `(selectionChange)="manage.onSelection($event)"`), or
    `tableManageOf(…)` for a table keeping its own (server-paged: `[pageOnly]`);
  - a table's common cells are its columns' options — `emphasis: "strong"`
    (the row's name) / `"muted"`, `nowrap`, `pills` (a list, a pill each),
    `count` (a `tb-table-count`, a link while the table's `(countOpen)` is
    bound; none on the row: a dash) — no cell template or page class for
    them; a count with a rule of its own is `tb-table-count` in a template;
  - a Settings page's stylesheet is `dashboard.tb-settings-page("xx")` (the
    page, `.xx-content`, `.xx-note`, `.xx-error`);
  - a filters column is `tb-settings-filters` (the search, the page's own
    filters projected, "Clear filters" / "Customize columns", the picker);
  - a detail panel's tab is `tb-panel-tab tab-content [shown]="tab === '…'"`
    (kept in the DOM while hidden); its lone Delete is `tb-delete-card`;
  - a form's buttons are `tb-form-actions` (Cancel / submit, shown while
    there's something to submit); a name field's checks are `nameValidators`
    / `nameErrorOf` (`form-utils.ts`: required, tidy spaces, unique).
- **A detail panel's list** (what an entity holds — a plant's users, groups
  and devices, a group's members, a role's groups and users: a tab of its
  panel) is `tb-detail-table`: a search box ("Search"), then a compact
  list, as the gateway's Logs and the alarm list — the shared table with no
  column headings, a row an entry: its name bold over a muted meta line of
  its other columns' values ("Viewer | …", a divider between two, an empty
  one left out), its count (`countKey`, a `tb-table-count`) at the row's
  end; 20 rows a page, view only, in the order given; `clickable` rows open
  what they are, `resetKey` (the entity) empties the search. A panel is
  narrow: never columns side by side in one — what a row says goes in its
  entry (a user's: the name over the email, everywhere).
- **Help with drawings** (the Organization, Applications and Access › Groups / Users / Roles tables' "?" beside their title — a table's
  `dt-title-actions` slot, the compact header's — `tb-organization-help
  [kind]`, the store's `help`: how the table's items fit in the organization,
  nothing else, written for whoever
  administers it — what relates to what, no subtitle, no intro line, no backend terms (rule chains,
  relations, attributes), no examples, never addressing the reader (no
  "you" / "your"), the entities named as code — lower case, each
  bullet's first mention of one — no caption: a
  `tb-ext-dialog` in the dashboard root, one `tb-collapsible-card` (no icon),
  its text — the tables' 13px, every element sized in the component, as
  ThingsBoard sizes paragraphs of its own — beside its drawing) draws in the
  ThingsBoard docs' look —
  `diagram.tb-docs-diagram` (`styles/_diagram.scss`) in the app's colours:
  a group a chart palette slot (`.dg-c1` … `.dg-c5`, the brand blue first) or
  `.dg-neutral` (a chip in a coloured group in its colour, `.dg-chip-hued`),
  the entity the help describes a filled node out of any
  group (`.dg-filled`) — drawn more than once (a product line and its sub
  product line), its filled nodes share a group — a dotted
  canvas on the field surface, dashed tinted groups
  with a pill-like name tag, cards with a tinted icon tile, chips outlined as
  fields, connectors in their parent's colour; Inter,
  `loadDocsDiagramFont`), inline SVG in their units (a 720-wide canvas).
- **A note set apart** (a warning above a list, a caveat in a panel) is
  `tb-callout [type] title="…"` — the look of the Obsidian notes' callouts:
  a bar in the callout's colour down its left edge, that colour at 10% as
  its background, a bold coloured title after its icon, the text under it in
  the normal colour; its colour the dashboards' own for the kind (note / info:
  the brand accent; success, question, warning, error: the status scale's
  green, yellow, orange, red; quote: grey). Never a hand-made tinted box.
- **Multi-pick fields** (applications, groups, profiles, dashboards) are
  `tb-tag-picker`: one look, a searchable select — the picks as chips in the
  box, a chevron, "None" when empty; no "Edit (n)" link.
- **Plain labels:** a search box (and a picker's search) says "Search", a
  table's create link "Create new", a delete action "Delete" — never "Search
  roles", "Add tank", "Delete gateway"; no info tooltips or helper text on
  buttons, search boxes or inputs (an action that can't run says why in a
  toast when clicked).
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
    a colour pair of its own. **A tooltip must never be cut off:** every
    new tooltip on a button, a toggle, a mark or a box is the `tbTip`
    directive (`components/shared/tip/`: `<button tbTip="Export CSV">`) —
    the same bubble, drawn at the top of the page (in the document's body,
    fixed, themed from where its element sits), centred above the element,
    under it when there's no room, kept inside the window. Never a CSS
    bubble of the component's own inside something that may clip (a card, a
    table, a panel's body — a card's first row, a panel's top), and never a
    Material tooltip in its place; an existing CSS bubble found cut moves to
    `tbTip`. The rail is the exception: its tooltips and its
    page menus are the button group's look (`tb-segmented-control`'s track and buttons). Otherwise, the pop on the hidden
    rule (origin = the edge facing the button) and the shown mixin on the hover rule:
    ```scss
    @use "…/components/shared/styles/tooltip";
    .my-tooltip { opacity: 0; visibility: hidden; @include tooltip.tb-tooltip-pop(top center); }
    .host:hover .my-tooltip { opacity: 1; visibility: visible; @include tooltip.tb-tooltip-shown; }
    ```
  - To add a show delay later, set both `TB_TOOLTIP_SHOW_DELAY_MS` and
    `$tooltip-show-delay` (`styles/_tooltip.scss`) together.
