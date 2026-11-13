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
# the logo spinner once a dashboard has marked the user's theme (before it, a
# plain dark page) — its still parts a mask, its arc drawn and animated by each
# spinner, so each starts from the beginning — from logo-spinner.svg:
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
  `dashboard.tb-dashboard-filters` column (its scrollbar a little room off
  the filters: a wider gutter, the thumb kept to its right). A sidebar's
  button tab group (Pumps | Codes, Users | Groups, a nested app's views)
  stands on top, outside the filters' scroll — the filters a
  `tb-dashboard-filters` column under it, in a
  `dashboard.tb-dashboard-filters-column` (Fuel's; `tb-settings-filters`'
  `filters-top`) or a `tb-dashboard-sidebar` (QC Lab's, Asphalt's) — so it
  keeps the column's full width whether or not a scrollbar shows, and the
  scrollbar starts under it. One heading a column it can't stand outside of
  (a panel tab's sections — the gateway's Settings, in the panel's
  scrolling body) is pinned instead (`dashboard.tb-sticky-tabs`: on the
  dashboard's background, covering the gap under it) and the body's
  scrollbar starts under it while that tab shows
  (`dashboard.tb-scrollbar-under-tabs(card.$card-stack-gap)`, the group's
  height `form.$tab-group-height`). Only the tab group stays: the search box
  and the window picker under it scroll with the filters, and a page
  without a tab group (Fuel's Stations, Reports) scrolls from the top. A
  new page or panel with a tab group does the same.
- **Table filters, sorting and columns** (as the gateway and fuel dashboards):
  the search box, then the filters inside a `tb-filter-sections` (no "All …"
  option — "Select all" is it; an item covering every value, a regional
  group, passes any pick) ("Hide empty
  filters" at their top, on by default: options with nothing in them
  hide — a snapshot taken while no other filter has picks, so it follows the
  data as it loads and holds as filters are picked, an option then greyed at
  0, never hidden) — a short list a `tb-check-filter`, a long
  one a `tb-filter-section` + searchable `tb-filter-list` — each option counted
  under the *other* filters (a list of thousands of events — the fuel
  Activity page's Pumps — prints none, `[showCounts]="false"`: the counts
  still grey an option out and hide empty ones), and "Clear filters" at the sidebar's foot. Tables
  are `[sortable]="true"`, a computed column given a `sortValue`, the sort kept
  in the user's settings (a default until they pick one). "Customize columns"
  is `tb-column-picker` beside the filters with a `TableColumnChoice`
  (`components/shared/dashboard/table-columns.ts`: the pick, its defaults, kept
  in the user's settings) and the sidebar's `[width]` from `sidebarWidth()`.
  A shared Settings table (Organization › Sites, Access › Users' two lists)
  keeps its pick in its store (`SavedColumnChoice`) — and every Settings
  table (Organization's, Applications, Access) its sort, `SavedTableSort`
  (read as its page shows, saved with each header click; the picker marks
  it) — the link and the picker
  in its filters column (`tb-site-filters`, `tb-access-filters`). A filter
  column's Product line and Market (Organization › Sites, the Access pages,
  Settings › Feedback) are `tb-org-filters` (`organization/org-filters/`:
  both sections and their lists, the options from `orgFilterOptions` — the
  lines' tree, the markets by name — never a "No product line" / "No market"
  option), never the two sections written out again. A Settings
  page's sidebar is `tb-settings-sidebar` (the section menu — none on Home,
  whose rail is it — and the section's filters beside it), its width
  `settingsSidebarWidth(section, withMenu, org, access)` (a column without a
  menu: the layout's 17px before its divider added, `SIDEBAR_LAYOUT_INSET`).
  A page holding several lists (Access › Users: Users | Groups) switches
  them with the button group atop its filters column, as the fuel Codes
  page's — `tb-segmented-control [showActiveLabel] [fullWidth]`, in
  `tb-settings-filters`' `filters-top` slot; each list a section of its own,
  the others' `shownOn` the page (`SectionNavItem`: no entry in the menu or
  the rail, the page's entry lit — `sectionEntryOf`, `sectionEntries`), so
  the pick is the URL's section (the entry rewritten, `sectionChange` of
  `tb-settings-sidebar`), an older link to a list opens the page on it, and
  the filters beside it are the list shown's.
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
  alarms — and, on a dashboard with a Settings page, Settings — as the
  rail's second group, right under its pages after a divider
  (`bottomItems`); at the rail's foot, top to bottom, the development
  switch (`footItems`), the theme toggle, Send feedback (`foot` items of
  `dashboardRailItems`) and Account (Home's — everyone's: a user's Settings
  page is its Account section alone) at its bottom edge. A dashboard with a Settings page has no toggle:
  `dashboardRailItems(dark, alarms, { settings: true, themeToggle: isTenantAdmin(ctx) })` (a tenant administrator keeps it, for development; Home's rail also
  has the development switch, `[footItems]="dashboardRailFootItems(…)"` — the `code_blocks` icon, first at the foot, lit on "Home
  Development", opening the other version on the same page), the theme then its
  Settings page's Account section, `tb-account-settings` — with the user's
  profile, as ThingsBoard's Profile page; Home's rail is its own: Home, the
  Alarms right under it, Entities, Gateways, the apps after a divider and —
  a tenant administrator's — the Settings page's sections after another
  (`settingsRailItems`: Applications, Organization and Access with their
  pages as an app's menu), the development switch, the theme toggle, Send
  feedback and Account at its foot; its
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
  Devices, Assets, Device profiles and Asset profiles pages, tenant
  administrators' — Gateways, a divider,
  QC Lab, Marine, Fuel, Asphalt — a user's rail shows only the apps running
  at a site they can read (the Site assets' `applications` server attribute,
  one entity query — `NESTED_APP_APPLICATION`); Gateways, tenant
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
- **Profiles** (Home's Entities menu: Device profiles, Asset profiles —
  `home/components/profile-manager/`, one component, `[kind]`; tenant
  administrators'), as ThingsBoard's own Profiles pages: no sidebar — a
  table of every profile (`/api/deviceProfiles`, read in full — a
  tenant has few: name with its icon, description, its Devices / Assets — a
  count a profile, `/api/entitiesQuery/count` by its name, opening its panel
  on that tab — created; every column sorting, the sort kept in the user's
  settings, `SavedTableSort`), "Create new | Manage" (Delete (n)); a row opens its
  `tb-entity-detail-panel`: the Details form (`tb-profile-form`: name, icon,
  a device profile's "Mobile" (its devices are vehicles — the tenant's
  `mobileProfiles`, saved with it, under its new name when renamed),
  description, default rule chain, queue, default dashboard, image — one of
  the gallery's) with its Manage card (Set as default, Delete — the default
  named in the panel's subtitle, no column), then its Devices / Assets tab (a
  `tb-detail-table` of the first 1 000 by name, grouped by their stored
  `site`, named by its label and code — a note says when it's cut short; a row opens that device's /
  asset's Details panel, `tb-entity-panel`, the Devices and Assets pages'
  own — the next stop on the page's own `PanelTrail`, its `tb-panel-trail`
  beside its panels). A save keeps
  everything else the profile holds — a device profile's transport, alarm
  rules and provisioning stay ThingsBoard's own page's to edit. ThingsBoard
  refuses to delete the default profile or one in use: its reason is the
  toast's.
- **A device or an asset shows by its profile's icon** — everywhere: a detail
  panel's header (`tb-entity-detail-panel [icon]`, `tb-icon-badge`), a
  table's name column (`DataTableColumn.iconOf`), a card, a map marker, a
  panel-trail stop (`PanelStop.icon` as a getter — icons come in later);
  a panel for a new one, the profile it'll be made with. Beside a name in a
  list — a table's rows, a card's rows — only while the rows' icons differ:
  an app whose devices share one profile (QC Lab, Fuel, Marine, Asphalt)
  shows none there (`tb-data-table` drops an `iconOf` column's icons by
  itself; a card's rows leave theirs out); the gateway dashboard's tables
  show none at all (no `iconOf`: a gateway's devices name their profile in
  a column). Read it with
  `profileIconsOf(ctx).of(kind, profileName)` (`components/shared/
  profile-icons/profile-icons.ts`: one per widget — the nested apps share
  Home's; a device's / asset's `type` names its profile; `ofId` by id) and
  repaint on its `changes`; a profile without one shows its kind's
  (`DEFAULT_PROFILE_ICON`: a device's "sensors", an asset's "category"). Never
  an icon a dashboard picks for a kind of device or asset. The icon is the
  profile's `icon` server attribute (`PROFILE_ICON_KEY`, a Material Symbols
  Rounded name), set with the profile form's `tb-icon-picker` — a profile has
  no additional info, and a save drops any key ThingsBoard doesn't know (in
  its JSON or its profile data). A tenant administrator's are read in one
  entity query a kind; anyone else's a profile at a time (a customer user's
  entity query over profiles finds none), which takes `READ_ATTRIBUTES` on
  `DEVICE_PROFILE` / `ASSET_PROFILE` — the access groups' generic roles grant
  it (`ROLES` in `access-store.ts`, grown at the next sync); refused, the
  kind's default shows.
- **Where a device is:** never walk the relations to place a row — read the
  device's server attributes `site` / `market` / `productLine` (codes; their
  labels from `loadOrganizationNames`, `components/shared/organization/
  site-locations.ts`, `LOCATION_KEYS`). The backend keeps them: the "Device
  Site Attributes" rule chain (Root and every device profile's chain route
  relation events to it) re-derives an entity's from its parents when a
  relation is added or removed and stores each site's / market's / product
  line's own code (`siteCode`, `marketCode`, `lineCode`) on create / rename;
  the "Propagate …" calculated fields (Market, ProductLine, Site, RMX Truck,
  the gateways' "Mark created devices" — every key, "" when the gateway has
  none) carry a rename or a move down. A device a gateway created also
  stores `gateway` (its creator's name — what it follows), kept by the same
  chain with the location its gateway gives. A
  filter's counts are the table's own rows under the other filters (in the
  page, from rows already loaded) — not the stored totals. Always the
  *server* attributes (`SERVER_ATTRIBUTE`): ChirpStack writes client
  attributes of the same names ("site: R20"), which an entity query's
  any-scope `ATTRIBUTE` key can return instead.
- **Device names:** a device is named `<product line>-<place>-<type>-<number>`
  — the place a Site's code ("agg-3b30-scale-01") or a vehicle's number
  ("rmx-61080-gw-01", see "Mobile devices"); a LoRaWAN sensor is named by
  its DevEUI and carries that name as its `deviceName` client attribute. The
  **"Device Naming" rule chain** (a sweep every 5 minutes — device events go
  to a chain per profile) reads the Sites and the vehicles first, then each
  name (trimmed) and stores its parts as server attributes: `nameSite`
  ("3B30" — a Site's code, or a code that's neither), `nameAsset` ("61080" —
  a vehicle's number; `nameSite` then ""), `nameLine` ("AGG") and `nameType`
  (the type code's category — "gw" → "Gateway": one code covers several
  profiles, so it never sets the profile). A device with no site yet, not
  created by a gateway, whose `nameSite` is a Site is placed there (Site
  —Contains→ device; the Device Site Attributes chain derives the rest); one
  that has a site is never moved, a vehicle's gateway never placed by its
  name (its site is the vehicle's) — Access › Health lists the devices at
  another site than their name says (a name whose code is a Site's), or
  named for a place that isn't one; a device a gateway created (`hasCreator`:
  named by the gateway's config, placed where the gateway is) and a test
  device (the "DEV" line, `TEST_NAME_LINES`) are left out of both.
- **Mobile devices:** a vehicle (an RMX truck, a tugboat) is a device of a
  mobile profile — the tenant's server attribute `mobileProfiles` (`["RMX
  Truck", "Tugboat"]`) — created by its own gateway and named by its number
  in that gateway's config ("61080"); its gateway is named for it
  (`<line>-<number>-gw-<nn>`). It goes where its gateway is: the gateway
  sits at the site the vehicle is at (Site —Contains→ gateway), "Mark
  created devices" carries that to the vehicle — a vehicle moves when its
  gateway's site does. Its link is ThingsBoard's Created relation (stored as
  the vehicle's `gateway`), which a replacement gateway doesn't remake — it
  only updates `additionalInfo.lastConnectedGateway`. A device a gateway
  created is never renamed from the dashboards (the gateway would make a
  new one under the old name). The RMX Truck *assets* are the tickets' side,
  not the place model. In a dashboard, read and change all this with
  `components/shared/organization/device-places.ts` — the keys
  (`NAME_KEYS`, `GATEWAY_KEY`, `DEVICE_PLACE_KEYS`), `devicePlaceOf`,
  `loadMobileProfiles` / `saveMobileProfiles`, `readDeviceContext` and
  `deviceNoteOf` (a device panel's), `placeDevice` (a device put at a site —
  the Gateways dashboard's Site picker too: the relations only, never the
  attributes), `relinkGateway`, `renamedFor`.
- **Access without a sync:** a device or asset that appears or moves with
  nobody at a screen joins and leaves its access entity groups by the
  **"Access Membership" rule chain** — hooked after the Device Site
  Attributes chain's "Save its location", and for a device, after it, for
  each device it created (a gateway's: they follow it) — for entities at a
  site (a truck asset's, a ticket's: still the sync's). It reads two indexes the sync
  writes (`AccessStore.writeAccessIndex`, after any group syncs or is
  deleted): each site's `accessGroups` (the groups covering it, their device
  / asset entity groups under "*" — a group takes every profile) and
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
  `tb-severity-boxes mode="many"`: all lit to start — every severity, saved
  as none named — each on or off by itself; the lit ones tell them, the last
  put out turns both toggles off; the Account table lights all for none
  named too) —
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
- **Feedback:** the rail's "Send feedback" (`dashboardRailItems`, at the
  foot after the theme toggle — `FEEDBACK_RAIL_ID`: `feedbackOf(ctx).show()`) opens
  `tb-feedback-dialog [ctx] [notices]` (in every dashboard root; a nested
  app's `*ngIf="!host"` — Home's shows): Bug | Idea | Other and the words,
  a bug with a screenshot of the dashboard root behind the dialog
  (`captureScreen`, `components/shared/feedback/` — html-to-image, bundled,
  its patch keeps scrolled panes' scroll) — made at send time a WebP (else
  JPEG) as large as the record's room allows (`encodeShot`: ThingsBoard
  refuses a user whose additional info is past ~100 000 characters,
  `RECORD_MAX_CHARS`).
  The page's address goes without credentials (`safeUrl`: a dashboard opened
  from a link keeps the user's sign-in tokens in it).
  It travels in the user's own record (`feedbackOutbox`: the item base64 —
  the firewall refuses free text that reads like an injection — and the
  screenshot), saved and taken out again at once; the **"Feedback" rule
  chain** (Root's Entity Updated) takes it out with a JSON path, adds the
  sender (`feedbackFrom`, `feedbackEmail`: the user's, not the item's) and
  posts it as time series of the tenant's "Feedback" asset — no script node
  ever sees it (a screenshot is past a script's 100 000 characters). Home's
  Settings › Feedback (`FeedbackStore`, `tb-feedback-settings`,
  `tb-feedback-panels`) lists them, with a filters column as Sites'
  (`tb-feedback-filters` in `tb-settings-sidebar`: status, type, the app it
  was sent from — the item's `app`, `feedbackOf(ctx).show(app)` — and the
  sender's product line and market, their scope's `productLineId` /
  `marketId`); a status (New / Reviewed / Done) is the
  asset's `feedbackReview`; the New ones' count is the badge on Settings ›
  Feedback in Home's rail (loaded as Home starts, live on the asset's `feedback`). The item names the build: `install.js` stamps
  `yarn build`'s bundle (`appBuild`; the dev bundle: "development").
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
  resumed, expired, revoked — a deleted code's). The Codes page's flow is
  the Settings tables': its table (the code in full, its copy button
  copying it; market and site by their codes) with "Create new |
  Manage | Import" at its foot, Manage's "Delete (n)"; a row opens the
  code's panel (`tb-entity-detail-panel`, its icon its asset profile's, a
  stop on the dashboard's trail), laid out as QC Lab's device panel —
  Insights, then Settings, no Alarms (a code has none): Insights
  (`tb-fuel-code-activity` — its Usage card, a chart card with its own
  1W | 1M | 3M picker (1W to start — every pump of its scope is read over
  it, a busy pump's week of events ~300 KB; a pump's read is reused for 2
  minutes, `EVENT_CACHE_MS`, so the next code of the scope or one opened
  after the Activity page comes at once): its use at its scope's pumps — dispenses, litres,
  denials, its last dispense, `tb-stat-grid` — and its litres a day (a week
  over 3M, `tb-bar-chart`, `chartWindow`), then its activity: its latest 10
  events — its use and its changes — a `tb-event-list` with no search,
  newest first, "View full activity" at its foot (`moreLabel`: the Activity
  page's Pumps over the panel's window, its User or Vehicle filter on the
  code alone — its changes a switch away on Codes — the filters that would
  hide its rows cleared)) and Settings
  (`tb-fuel-code-form` — the code in full in a `tb-copy-box`; holder,
  expiry; what it is in `tb-detail-rows`; Manage: Suspend / Resume, Delete;
  `tb-form-actions`). "Create new" and
  "Import" are panels of their form alone (Details); the import's preview a
  `tb-detail-table` grouped by what becomes of each line. The pumps' events
  and the codes' changes are the dashboard's Activity page (its rail's, after
  Stations and Codes — a page of its own, never a tab of theirs): "Pumps |
  Codes" atop its sidebar, each list with its search, CSV export and columns
  under the page's one window (`tb-timeframe-picker`, its custom range) — the
  Pumps list filtered by its Events, the Stations page's product line,
  market and site picks and its Pump filter (each station › its pumps), the
  Codes list by its Type and the Codes page's markets, both by one User and
  Vehicle pick (each list's sections, the codes in its rows by holder:
  "Jane Doe (1234)" — a row passes with its user or its vehicle code
  picked). A panel's "View full activity" opens the Pumps list on its
  entity (a station's: its pumps picked; a code's: the code picked). An older link to Stations' or Codes' Activity tab opens it there
  (`MOVED_VIEWS`).
- **Fuel totals:** never total a pump's events in the page (a busy pump has
  more than one read returns) — read what the **"Fuel Daily Totals" rule
  chain** stores on each pump (every 2 minutes, from its `event` time
  series): a point a quarter-hour, `fuelQtrLitres` / `fuelQtrDispenses` /
  `fuelQtrDenied` (denials and timeouts), and a point a day at its
  midnight (America/Edmonton), `fuelDay*` — the Stations cards' "today"
  (`PumpRow.today`); the Reports page sums the quarters by the hour (by the
  day past `REPORT_HOURLY_MAX_DAYS`) with ThingsBoard's own `SUM`
  (`buildFuelReport`, `fuel-reports.models.ts`) — and its previous window,
  the same window shifted back by its days (`previousReportWindow`: the
  same days, to the same time — today so far against yesterday to now's
  time), as one sum each of litres, dispenses and denials: its figures
  strip's "vs previous period" and its "This period vs last" card beside
  the daily chart (`tb-stat-grid` figures, each its change as the `note`
  and the previous window's figure as its `caption`, "Yesterday to 2:15
  PM: 1,234 L"); under its charts, its folded sections, ARIA's look —
  Days (a day's window: Hours — those with anything in them), Pumps,
  Users, Vehicles (the code lists picked), Denials: a report page's
  details, each a flat heading with its count (`tb-collapsible-card [flat]
  [expanded]="false" [count]` — "Days 6") over a sortable fit-size
  `tb-data-table` (no header, its figures right-aligned, sorting by the
  numbers behind them), folded to start; its volumes in litres or US
  gallons (the sidebar's Units, `ReportUnit` — converted once, as the
  report is built), with its running total against the period before's,
  its dispense sizes, its weekday × hour map, by shift, the pumps'
  availability (their PumpConnectivity `online` / `offline` events) and
  "vs last" columns — and so does a station's
  panel (`readPumpTotals`). That panel is laid out as QC Lab's device
  panel: Insights — its figures and readiness (`tb-stat-grid`: pumps, last
  dispense, codes against capacity, the transfer pills), then two chart
  cards, `tb-fuel-station-totals` (Fuel dispensed — a pump a stacked
  segment — and Dispenses — the denials stacked on them: the window's
  figures over its bars, by the hour over 1D, by the day over 1W / 1M —
  `chartWindow`), each with its own picker bound two-way to one window
  (`stationTimeframe`), then its pumps (a row opens the pump's panel) and
  its Activity card (its pumps' latest 10 events over the window, a
  `tb-event-list` with no search, "View full activity" at its foot) —
  Alarms (`alarmsTab`, `tb-alarm-list`: its PLC's and its pumps') and
  Settings (its PLC, its site, its pumps — the device settings card). Who took the fuel (a
  user's, a vehicle's litres) still comes from the dispense events; their
  litres also as `fuelVolume`, a point a dispense.
- **Charts:** `tb-line-chart` / `tb-metric-chart-card` / `tb-bar-chart` /
  `tb-trend-chart` — a bar chart by the day or the hour whose window holds
  now marks it (`tb-bar-chart [highlight]`: today's / this hour's bars in
  full, the others dimmed, its value — its stack's total — in a pill on top,
  the chart palette's first colour; the Fuel Reports page's) — series coloured by the chart palette tokens
  (`var(--c-chart-1)` … `--c-chart-5`, in that fixed order, never hex;
  `paletteCharts` colours a card's series one after another across its
  charts) — except a status split, in the status marks' colours: online / offline
  devices (Home's bars) `var(--c-bg-success-normal)` and the Offline pill's
  grey, `var(--c-text-pill-neutral)` — one
  shared tooltip (`chart-tooltip.ts` — the tooltip bubble, as a map's marker
  label; a bar chart's content laid out by `chartTooltipHtml` — the slot in full,
  muted (`tb-bar-chart [tooltipTitles]`: "Tue, Nov 10"), a row a series —
  its swatch, name, value right-aligned — a hairline and the stack's Total); the Fuel Reports page's charts
  take the accent look (`tooltipLook="accent"`: a hairline round the bubble,
  a bar in the series' colour down each row's left, names muted) — on trial
  there alone, at the user's ask. A report page's insights: `tb-insight-list`
  (`components/shared/insight-list/`, above its figures) — what stands out,
  a short plain sentence a card, its icon in its tone (the status scale; just
  so: the brand accent), worked out by the page's own fixed rules over what
  it has read (never a model — the Fuel Reports page's `fuelInsights`:
  denials up and where and why, a pump idle, a few vehicles or users taking
  most of the fuel, one station most of it, the night's share, the busiest
  weekday), warnings first, four at most, a card's `target` opening its
  folded section and scrolling to it; nothing standing out, one card saying
  so (so the strip never pops in or out), placeholders while read. Key figures: `tb-stat-grid` (a figure's muted `note` after its
  value — "Thu, Nov 5"); a report page's figures strip: `tb-stat-grid
  [headline]` — a card of its own, the headline figure at its left (large,
  its change against the previous period as a chip, its trend over the
  window as a line along its foot), the other figures in `columns` beside
  it, a hairline between every cell, the headline over them when narrow
  (the Fuel Reports page's: fuel dispensed, then dispenses, denials, best
  day, pumps dispensing); summary
  rows: `tb-summary-cards` — a ranked list ("Top …", "By …": a report's top
  sites, users, vehicles, its stations) is a card of ranked lines, each its
  `share` as a thin bar under it (the list's largest a full one) and its
  share of the whole muted before its value (`meta`: "23%"), never a
  horizontal bar chart of its own; a card whose lines are still read is
  `wireframe`d alone (its title shown, placeholders for its lines — never a
  "Loading…" line); a count per day over the last year (GitHub-style
  calendar, one blue ramp, with its figures): `tb-calendar-heatmap`; when
  in the week (the days by the hours): `tb-hour-heatmap` — both the heat
  maps' ramp, `heat.tb-heat-levels` (`styles/_heat.scss`); a thing's states
  over a window as one thin bar (a pump's online / offline runs, in a table
  cell): `tb-run-strip`; a bar chart's slots with no data at all
  (`tb-bar-chart [gaps]`: a striped grey bar the plot's height, "No data" — never a zero), its
  ends alone labelled over time (`[axisEnds]`), the slot hovered
  (`(categoryHover)` — the Fuel Reports page's strip reads for it), its
  ticks compact from a thousand ("1.2k"); a comparison line (the period
  before) `LineChartSeries.dashed`; a whole split into parts on a summary
  card, one bar under its title (`SummaryCard.composition`), a ranked
  line's course (`SummaryRow.trend`, small bars) and its move since the
  period before (`rankChange`); how fresh a strip's figure is
  (`StatHeadline.note`, "As of 10:32 PM"); a
  settings-style section menu: `tb-section-nav`.
- **UI pieces:** use the shared components (`tb-data-table`, `tb-status-pill`,
  `tb-table-count` (a count in a table cell — its icon and the number; with
  its `(open)` bound, a link to what it counts, brand blue while there's any:
  a group's Members, a role's Members, an Organization item's
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
  whose own scope is the item, `loadItemUsers`; a product line's or a
  market's, everyone whose scope reaches it — scoped to it (a line: or to a
  line above or under it), to one of its plants, or to a wider scope
  holding any of its sites (a market, a product line, regional): a user
  spanning several lines or markets counts under each (`usersWithin`, the
  store's `usersOf` — its Users tab names each one's scope, but for the
  item's own) — a count opening the item's
  panel on its Users tab, as a group's Members — and Sites' Devices (the
  stored `devices` count) the same, opening its tab. No settings table has a
  Groups column (Organization's, Access › Roles, Access › Users: the groups
  are the access model's own detail — a panel's Groups tab still lists
  them); a product line may have a parent product
  line — any depth, the parent `Contains` it (Manage's "Edit (n)" sets several
  lines' parent), shown as `tb-data-table`'s tree (`treeParentKey`: a round dot a
  level before a child's name — "·", "· ·" — no lines or collapsing), its scope covering its sub
  lines' sites: `lineWithin`, `productLineOptions`; others follow its edits
  with `org.follow(…)`), the applications (`ApplicationStore` +
  `tb-application-settings` + `tb-application-panels` —
  `components/shared/applications/`; a dashboard applying them to devices
  passes `memberRelation`; one with an Organization passes `siteRelation` and
  sets `apps.org`, giving the panel a Sites tab — where the app runs (an
  Application → site relation each, the "Application Sites" chain's — see
  "A site's applications"), a view-only
  `tb-detail-table` grouped by market ("GVA (5)", + / −) whose site row
  opens the site's panel, the trail's next stop; an application
  names its device / asset profiles (where it runs; a market's fuel codes
  apply at its sites) and its dashboards), the Access (`AccessStore` +
  `tb-access-settings` (Users — its Users and Groups lists — Roles, Health) + `tb-access-panels` —
  `components/shared/access/`: **access is by sites alone** — a group's
  scope takes every device and asset at its sites, no profile left out;
  applications grant nothing, nobody picks apps for a group or a role (older
  `appIds` / a role's `appIds` / `runningApps` still parse, ignored); a
  group's apps are those running at one of its scope's sites (`groupApps`,
  `appsRunningIn`): their Application assets and `dashboardIds` are shared
  with it at its sync;
  an access group is a
  user group of the access owner ("WCAN") with a scope (product line and / or
  market, or one plant — named with its product line and market), a
  role (its `level`: the role's id) and its other dashboards in its additional
  info; a **role** (Access › Roles, `tb-access-role-form`; the roles a JSON
  list on the access owner, server attribute `accessRoles` — none stored:
  Viewer, Operator, Manager, `BUILT_IN_ROLES`, their ids kept) is a template:
  its actions (the grid, `ACCESS_ACTION_ROWS` — `setPermissions` grants them)
  and where it applies — regional, every / some / no
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
  a dashboard never makes or deletes them itself, and no one deletes one by
  hand (no Delete on its panel; Manage's "Delete (n)" leaves them out, the
  toast says why — `askDeleteGroups`; only a role's own cleanup of the empty
  ones it no longer applies to, confirmed, removes them); a default group syncs when
  first joined or with "Sync all" ("Add default groups (n)" makes any missing; the Groups table's Manage has no
  "Edit (n)" — a group's access is edited on its own form);
  Access is three pages, Users, Roles and Health — the Users page holding
  the users and the access groups, two lists switched by "Users | Groups"
  atop its filters (`tb-access-filters (pageChange)`; the sections
  `accessUsers` / `accessGroups`, the groups' shown on the Users page — a
  switch reloads nothing, `accessListSwitch`); each list but Health has a
  filters column beside the Settings menu, the list shown's
  (`tb-access-filters [page]`, the store's `groupFilter` / `userFilter` /
  `roleFilter` — Roles: Applies to, Permissions (`actions`, the actions grid's
  rows), `rolePasses`; the
  sidebar `tb-settings-sidebar`; Organization › Sites has its own,
  `tb-site-filters` — product line tree, market — on the `OrganizationStore`'s
  `siteFilter`; both columns are `tb-settings-filters` around their own filters): search, "View default groups (n)"
  (Groups — the default groups hidden until checked), scope, product line,
  market, level — level first, the product lines as their tree
  (`tb-filter-list` nests to any depth; a `selectable` parent picks itself
  too) — and both tables show the scope a column per level (scope, product
  line, market, plant) and the level; a sync marks the default groups and its own entity groups
  `autoGenerated` (server attribute; the entity groups also
  `additionalInfo.autoGenerated`, so lists of a device's groups drop them —
  `isAutoGeneratedGroup`); saving / "Sync all" turns it into entity groups and group
  permissions, and writes the scope onto the user group as server attributes
  (`scopeType`, `productLine`, `market`, `plants`, `level`, `applications` —
  the apps running in its scope, …
  — for filters); a user is given **one role and the plants they have
  access to** — the user form (`tb-access-user-form`, add and edit): "Role"
  (the roles' select, its `tb-icon-badge`, `tb-access-level-actions` under
  it), then "Plants", a `tb-filter-list` tree in the form's card ("Search",
  `[treeToggle]="true"`, no counts): "All plants" › each market by its name
  › its plants (`siteOptionLabel` · their product line's code: "Richmond Lab
  (4R20) · RMX"; plants with no market under "No market") — plant ids only,
  a parent's box ticking or clearing its plants — and under it, in the
  hint's style, how many are ticked ("9 of 32 plants selected"); editing,
  its "Access groups" (the hand-made groups whose scope's plants are all
  ticked). The picks become default groups of the role
  (`plantPickScopes` — each the broadest the role applies to: every plant
  ticked, the regional one; all of a market's plants, the market's (no
  product line); each other plant, its own — so a plant or market added
  later comes with a regional or market group; `AccessStore.picksGroups`
  finds or makes and syncs each, `groupFor`): a new user is made in all of
  them at once (`POST /api/user`'s `entityGroupIds`, comma-separated), an
  edit diffs them against the default groups the user is in now (any role)
  — the new ones joined, the rest left; their hand-made groups stay the
  picker's — and the edit form reads the picks back from those default
  groups (`userPlants` — each group's scope's sites, `plantsOfGroups`:
  regional every plant, a market its plants (of its product line, if it
  names one), a product line its plants and its sub lines', a plant itself;
  the role their level, the broadest when mixed — `userLevel`). **A user can
  be in several default groups**: nothing moves them out of one when they
  join another (the Access Lifecycle chain's one-default-group "Added to
  Group" branch is disconnected since 2026-11-12; the store's `setMembers`
  just adds, the members' scope attributes following). The user's scope attributes (the same keys as a group's,
  `scopeAttributes` / `saveUserScope`, and `level`) are their one default
  group's scope, else a plant scope listing every plant ticked
  (`plantsScope`, "3 plants" — the Users table and its filters show its
  plants' product lines and markets). Or, the Users list's Tenant scope (a
  tenant administrator's view: the user form's "Access" select above the
  rest, Plants | Tenant — `TENANT_SCOPE_TYPE`, users only), a tenant-level
  user of ThingsBoard, their role one of the two default tenant user groups
  (Tenant Administrators / Tenant Users — `TENANT_ROLE_GROUP_NAMES`), the
  tenant's other user groups their access groups (added after, as the owner's
  users'), kept out of the owner's groups, checks and syncs — an existing
  user picking it (or leaving it) moves between the owner and the tenant
  (`AccessStore.moveUser`: ThingsBoard's change of owner, the new side's
  groups — the plants' default groups, back to the owner — their scope
  attributes saved or removed; never the viewer's own); a user's last
  login read from their own record (the listings can carry an older one);
  a group's Members tab only shows its users — a view-only
  `tb-detail-table`, by role; the group form picks a scope with the shared
  `tb-access-scope-picker` and shows under the level what it may do,
  `tb-access-level-actions` (a role's actions; `[editable]` in the role
  form); **every user lands on the default home (Home), full screen, written
  at creation and sync, with no "Opens on"** — no user, group or role picks
  where anyone opens (`AccessStore.applyHomes`: a new user's record, a user
  edited, joining a group or moved to the owner, every user at "Sync all" — written
  only where it differs, `homeInfo`; Home opens on its Home page, an app
  from the rail — but a user (not a tenant administrator) whose plants run
  one app of Home's (Gateways aside) opens straight on it when the URL names
  no place (`applyRailApps`, once the apps are known; the URL replaced, Home
  still in the rail); older `startApp` / `homeDashboardId` on groups and
  roles and a user's `homeStartApp` / `homeOverride` still parse, ignored,
  dropped on the next save — `OLD_HOME_KEYS`; Settings › Account has no home
  dashboard field); the default home — WCAN's customer home dashboard, else the tenant's:
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
  ("GVA", "RMX"); a site by its label with its code ("Richmond Lab (4R20)"),
  and a list grouped by site the same — its group rows and its rows'
  values (`siteLocationLabel`; "Richmond Lab (4R20) (12)"); a picker's (every product line select, a tag picker) product line by its own
  name alone ("AAT" — never the lines above it, `productLineOptions`).
- **A list too long to hold** (the tenant's assets — tens of thousands of
  tickets): `tb-data-table` server paging — `[serverTotal]` (the count of
  all), `[serverPage]`, `(pageChange)` / `(sortChange)`, the rows one page
  fetched with an entity query's `pageLink` (its `textSearch`, its
  `sortOrder`); the page's filters counted with `/api/entitiesQuery/count`.
  Home's Devices and Assets pages (`home/components/entity-manager/`, one
  component, `[kind]`; tenant administrators') are the example — a row's
  panel, as a profile's, is Details alone (`tb-entity-panel`
  (`entity-manager/`) — the form, `tb-entity-details-form`: name, label,
  profile, owner, a device's Site (always there — "Loading…" while read, as
  the others; saved with `placeDevice`; locked, showing the site it's at,
  when it isn't its own: a gateway's device, one in a truck or a room),
  description; a device's gateways (`tb-detail-rows`: Gateway, Served by, a
  gateway's Vehicle — each a link, the next stop on the trail); its Manage
  card's Delete — reading its own pickers; any page opening a device's or an
  asset's details uses it, on a `PanelTrail` — what it read of each kept,
  so a stop opened again shows at once; a first one's form starts from the
  row it was opened from — its profile, owner's title, site: every opener
  passes them — a field no row knows saying "Loading…", never a value it
  might not have, as the tenant or "None"). What its place's read adds folds
  open (`tb-fold`), never popping in. Over the form, a device's
  note (`tb-callout`, `deviceNoteOf`): its name or gateway disagreeing with
  where it is — "Rename to …" / "Move to …" fill the form (its Apply saves),
  "Follow …" moves its Created relation (`relinkGateway`, confirmed).
- **Tables:** every `tb-data-table` shares one row style — rows at least 40px
  with 6px vertical cell padding (`$row-height` / `$cell-padding-y` in
  `data-table.component.scss`) and 13px text (`table.$table-text-size` in
  `styles/_table.scss` — custom cell templates use it too). There is
  deliberately no per-table row-height input; change the shared values instead.
  Every settings table (and the Entities pages': Devices, Assets, the
  profiles) is `[fillPage]="true"`: its card fills the page's height (the
  height left under what's above it, `dashboard.tb-settings-page`'s column —
  `tb-settings-page-table`), 100 rows a page (`DT_PAGE_ROWS`) scrolling
  inside it under the sticky column headers, the page controls only past one
  page; a tree table (`treeParentKey`, the product lines) shows all its rows;
  never `[paginated]="false"`. A panel's list (`tb-detail-table`,
  `tb-event-list`) — and a settings table of a few fixed rows (Access ›
  Health) — is `[fitPageSize]="true"` instead: 20 rows a page
  (`DT_FIT_PAGE_ROWS`), the card hugging its rows. Similarity grouping (as UniFi's)
  is the table's `groupKey`: rows sharing a value fold into a summary row of
  their own (`groupSummary`: its cells — a dash where the rows differ, sums),
  folded to start — a + / − toggle, its count "(n)" (`groupCountColumn`),
  opened its rows under it on tree lines, their `groupSharedColumns` blank;
  paged by its top-level rows (100 a page, as every settings table — an open
  group's rows come with its summary row, never split across pages). Access › Users' Groups list: the switch atop its
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
  A masked field (`tb-secret-box`) is a text field masked by CSS, never a
  password field, and marked for password managers to ignore
  (`data-1p-ignore`, …) — a webhook isn't a sign-in.
- **Loading page — the logo between apps, wireframes within one:** every
  dashboard shows `tb-dashboard-loading` (last in its root,
  `[loading]="pageLoading"`) until its first load is in — an app's first
  load (Home's own, an app opened from Home's rail), the only place the logo
  spins — `pageLoading` from a `FirstLoad` (`firstLoad.pending(this.xLoading,
  …)`), so a reload never brings it back; it gives up after
  `DASHBOARD_LOADING_MAX_MS`. **The launch** (a widget's first loading page
  — the page the URL opens it on) is one steady screen: over the whole
  dashboard, its rail too (`.dl-launch`, over `$rail-z`), the logo at once
  at the window's centre (fixed: nothing above the widget has a transform)
  — where ThingsBoard's own loaders draw theirs once the theme is marked:
  the white-labeling's `$page-covers` (a dashboard's, its layout's and its
  only widget's loader, on the loading page's background — `yarn
  upload:white-label`), so the logo never re-centres beside ThingsBoard's
  menu and toolbar. Before a dashboard has marked the user's theme (a page
  loaded afresh) ThingsBoard's loaders — its start-up loader too — draw no
  logo, a plain dark page: they can't know the user's theme, and the
  device's setting may not be it; the logo comes with the dashboard's own
  loader, in the user's theme. Nothing pops in beside it, and the page
  comes in whole as it fades.
  Home's waits on the app the URL opens it on (`NestedDashboard.pageLoading`
  — every nested app's; Home's `launch` `FirstLoad`), so it's one logo, not
  Home's and then the app's, each in its own box — and every launch waits on
  each loading page of the first view, a section's too (Home opening on its
  Entities or Settings page: the section's wireframe stays under the logo;
  `loadingNow` / `launches` in `dashboard-loading.component.ts`). After the launch (an app
  opened from the rail) the logo covers the app's area under the rail,
  easing in a moment on (a quick load shows no logo). The launch is
  module-wide (Home's and its app share it) and starts again with a new
  widget (all loading pages gone). Its spinner is the app's logo,
  `tb-logo-spinner` (the circuit tree and its ring still, an accent arc
  bouncing between the two sides of the ring's slit — growing round from one
  to the other, drawing in to it, growing back — all of it the brand accent,
  the ring a faint tint of it; 96px, no text). Within an app, everything
  loading is a **wireframe** (`styles/_skeleton.scss`: placeholders in the
  empty-value colour, a shimmer passing over them, none with reduced
  motion), never a spinner or a "Loading…" line: a loading table's rows
  (`tb-data-table`: with `loading` and no rows, or `[wireframe]`), a chart's
  plot (`tb-bar-chart` — columns or rows — and `tb-line-chart`, loading and
  empty, or `[wireframe]`), summary cards (`tb-summary-cards [wireframe]`:
  each card's shell, its title, ring and lines), a card
  (`tb-skeleton-card`: `figures`, `chart`, `list`, `table`, and a sidebar's
  `filters`), and a section within the app — a Settings component
  (Organization, Applications, Access, Account, an app's own), an Entities
  page — `tb-dashboard-loading [section]="true"` over itself (host
  `position: relative`), once per section (`FirstLoads.pending(section,
  …)`): its content's wireframe, `wireframe="table"` (a table's card
  filling it, the default) or `"form"` (a form's cards: Account, Asphalt's
  settings) — or, best, the section's own pieces in place at their own size
  with `wireframe="none"` (drawing nothing, only telling the launch): the
  Entities pages (their table's `[wireframe]`, their filters'
  `tb-skeleton-card kind="filters"`), Access › Health (its table's rows, as
  many as it has checks — `[wireframeRowCount]` — the card at its size).
  **No page shows until everything it shows is in:** its loader's
  `pending(…)` takes every read the page's first view needs — its list and
  what's read for its rows after it (a user's last login from their own
  record, an item's Users count, the access groups behind a site's Groups
  count) — never a value shown and then replaced ("Never" turning into a
  date, "…" into a count). A read that can fail ends as empty (`catchError`),
  so the loader isn't left waiting; after the first view, a reload keeps
  what it already had and the rows follow — a card read again for another
  window (its picker): its bars stay on show, its sums wireframed meanwhile
  (`tb-stat-grid [wireframe]`: a placeholder in each value's place, never a
  stale sum or "…"), then the window, its sums and its bars change together
  (the fuel station's totals cards, a code's Usage). A dashboard of several pages
  holds each page's first showing the same way — its first page under the
  logo (the app's first load), each later one in its wireframes
  (`FirstLoads` by page, the pieces' `[wireframe]` bound to it — the fuel
  dashboard's `pageLoading` / `pageWireframe` / `pageReads`: Stations waits
  on today's events and the alarms too, Activity on its window, Reports on
  its totals and dispenses; its sidebar's filters a `tb-skeleton-card
  kind="filters"` meanwhile, its tab group, search and pickers staying), and
  a detail panel's Insights its own first reads, each
  entity opened — wireframes in its cards' places, `tb-skeleton-card`
  (`components/shared/skeleton-card/`: the card's shell, shimmering bars in
  its shape — `figures`, `chart`, `list`), never a spinner over the tab;
  the cards made all at once when they're in (`*ngIf … else`, never filled
  in one by one — the fuel station's and code's). Read only what the page shown needs
  at start (the fuel Stations page: today's events, not the Activity
  page's week of every pump's).
- **Selects:** a `tb-select` with nothing picked shows dashes, "---------"
  (`SELECT_EMPTY`, its default placeholder) — never a placeholder of its own
  ("Select a market"); a bulk edit's ("Edit (n)") "leave each as it is" is
  blank, no dashes.
  An empty value that means something is an option with its label ("None",
  "Home", "Tenant (no customer)").
- **Forms:** a form's stylesheet takes its classes from the shared set —
  `@include form.tb-panel-form("xx");` (a side panel's form: host, `.xx`,
  `.xx-fields`, `.xx-field`, `.xx-label`, `.xx-input`, `.xx-hint` /
  `.xx-error`, `.xx-actions`, `.xx-cancel`, `.xx-submit`) or
  `form.tb-form-fields("xx")` / `form.tb-form-actions("xx")` — and only adds
  what is particular to it. A tree of picks in a form (a user's plants) is
  `tb-filter-list [field]="true"`: a field's fill, as the form's selects,
  not the card's. Also shared: `form.tb-pane-title`,
  `form.tb-section-note`, `form.tb-code-chip`, a card's sections
  (`form.tb-field-section` + `form.tb-section-heading`, `form.tb-section-divider`
  between them — a device's channels, a station's pumps), `form.tb-info-line`
  (an inline editor's note with an info icon), `card.tb-figure-head` /
  `tb-figure-title` / `tb-figure-foot`, `card.tb-meter-track` /
  `tb-meter-fill`, `badge.tb-count-badge`, `table.tb-cell-title`,
  `table.tb-cell-meta-classes`, `table.tb-table-footer-links`,
  `table.tb-cell-icon-text` (a cell's icon before its text — the Settings
  tables' scopes and levels, `iconOf`'s profile icons; its icon styled as a
  descendant, or ThingsBoard's mat-icon colour turns it near-black in dark mode).
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
  `syncPending`): a new site, a site whose market or product line
  changed — the groups
  covering those sites sync once the rule chain has had a moment (edits in a
  row gather into one sync); a new market's or product line's own groups
  too. "Sync all" is the repair button, not a step. The Organization tells
  it (`org.follow` — `changed`); never sync from a dashboard.
- **A site's applications** follow its devices: an app runs at a plant with
  a device of one of its `deviceProfiles`. The **"Application Sites" rule
  chain** (every 5 minutes) keeps the Application → Site `Contains`
  relations (`ApplicationStore.sites` — what runs where) and each Site's
  `applications` server attribute (its apps' names, sorted: `["Fuel", "QC
  Lab"]`); no form sets them. An application's Sites tab lists where it runs
  (view only), a row opening the site. A new plant is one form: name,
  product line, market — its default groups and their sync follow.
- **An Organization item's panel** is its hub: its form, then Users and, a
  site's, Devices (those stored at it) — each a `tb-detail-table`, grouped:
  Users by role (a user's from the `AccessStore`, `userRoleOf` — without it,
  one list), Devices by profile. No Groups tab: the groups are the access
  model's own detail (Access › Users' Groups list shows them). Every row opens what it
  is in place, on the page shown — the next stop on the dashboard's trail,
  the item the stop before it: a user's panel; a device's, its Details panel
  (`tb-organization-panels (deviceOpen)` → the dashboard root's
  `tb-entity-panel [trail]`, the Devices page's own). Unbound, the device
  rows open nothing.
- **Access › Users' Groups list as a matrix** (the "Matrix" switch atop its filters,
  `store.groupMatrix`) is the Groups table itself, never a table of its own:
  the same `tb-data-table`, its rows the scope items (named as the
  similarity grouping's rows, with the list's scope columns and cells), a
  count column a role (`accessMatrixColumns` — the item's default group of
  the role, its members; none there: a dash), the list's footer without
  Manage, its own saved sort (`groupMatrixSort`). A count opens the group on
  its Members tab, a row the item's panel. The page's
  search and its Scope / Product line / Market filters narrow the rows, Role
  the columns; the filters it doesn't use hide while it's on. A second view
  of a table is a mode of that table — its columns and rows swapped — not
  another component.
- **Side panels that lead to each other share a trail** (`PanelTrail` +
  `tb-panel-trail`, `components/shared/panel-trail/` — as UniFi's): a plant's
  panel, a user from its Users tab, a device from its Devices tab — each a tab
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
  `styles/_panel.scss` — the rail above it and its scrim (`$rail-z`, under
  the toasts and dialogs), so the rail's page menus stay reachable with a
  panel open.
- **Side panels slide only at the ends:** the first panel slides in and the
  last one out; a panel opening as another closes swaps in place at once —
  `tb-detail-panel` settles every panel whose `open` changed in one pass
  together (`queueMove`), so never animate a panel change yourself. A
  `dismissible` panel's scrim passes a click on a clickable table row on to
  the row (`clickableRowUnder`: the row opens in the panel's place — on a
  trail, as its next stop — and looks hovered under the pointer,
  `.dt-row-hover`); any other click-off, and a row of a table in Manage,
  does nothing — a click-off never closes a panel, only its close button or
  Escape. A wheel over the scrim scrolls what's under it (`scrollBoxUnder`:
  the nearest box there that can scroll — a table's rows, the page), so the
  table still scrolls with a panel open. A panel's name wraps to a second
  line rather than being cut ("…" only past two).
- **Access › Health** (`store.health`, the third Access page — no filters
  column): a row a check over what's loaded — orphaned groups, groups of a
  removed role, users with more than one role (their default groups of
  different levels), users without a scope or in no group,
  default groups to add / not synced / no role applies to, sites without
  links, applications that run nowhere, the devices' names and gateways
  (another site than the name says, a place that isn't one, a gateway named
  for a vehicle it doesn't serve, a device following another gateway than
  the one serving it — "Link to their gateway" — a device linked to both a
  site and a gateway (a gateway's that a Site links to too: "Unlink from
  their site" — the Sites'
  devices one multi-root entity query, never a walk a device), vehicles
  without their own gateway, names off the convention, no site or market;
  a fix that changes relations confirmed first, `healthFixConfirm`) — its failing
  items in its panel (`tb-detail-table`, titled with what its items are —
  "Devices", "Groups", `itemsTitle` / `itemsIcon` — as a side panel's tab
  names its list: an item's name, what's wrong with it muted after it,
  `AccessHealthItem.details` — "named 3D64" — grouped by what the items
  share, `AccessHealthItem.group`; a row opens the item — a device, the dashboard's device panel,
  `tb-access-panels (deviceOpen)`, Home's `tb-entity-panel` on the trail), a
  `fix` where one action settles it. A new rule the access model must keep
  gets a check there.
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
    bound; none on the row: a dash), `iconOf` (an icon before the value — a
    device's / asset's profile icon) — no cell template or page class for
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
  and devices, a group's members, a role's groups and users, an
  application's sites: a tab of its panel) is `tb-detail-table`: a search box ("Search"), then a compact
  list in a card titled with what its rows are, its tab's name (`title`:
  "Users", "Groups", "Devices", "Members", "Sites" — the table's compact
  header) — the shared table with no column headings, a row an entry: its
  name bold, then its other columns' values muted after it ("Jane Doe |
  jane@… | Viewer", a rule between two, an empty one left out) — on one line
  while they fit, the values wrapping under the name past that, each whole,
  never cut with "…" — its count (`countKey`,
  a `tb-table-count`) at the row's end; 20 rows a page, view only, in the order given; `clickable` rows open
  what they are (none stays lit after — what it opened takes the panel's place), `resetKey` (the entity) empties the search; `groupKey`
  folds the rows sharing a value into a row named by it — the tables'
  similarity grouping: its count "(n)", + / −, folded to start, a click on
  it opening or folding it; a row under it leaves that value off its line,
  and rows all sharing one value stay one list. Every Settings
  panel's list groups: an application's sites by market; an Organization
  item's users and groups by role, a site's devices by profile; an access
  group's members by role; a role's groups and users by their scope's type
  ("Plant (40)"); a Health check's devices by what they share
  (`AccessHealthItem.group` — the gateway and site they follow, the site
  they're at, the gateway serving them, their profile), each row its name
  and its own short detail ("named 3D64"); the other checks' items stay one
  list (named only, of one kind). A new list groups by what splits it most
  usefully — and keeps a row's own values few and short: the panel is narrow,
  a value cut to "…" says nothing. A panel is
  narrow: never columns side by side in one — what a row says goes in its
  entry, on its one line (a user's: the name — the email when they have
  none — then where they are and their role; the email is searched, never
  shown, everywhere).
- **A panel's list of happenings** (a fuel code's activity: its dispenses,
  denials and changes) is `tb-event-list` (`components/shared/event-list/`),
  not a `tb-detail-table`: the alarm list's rows — what happened over a
  muted line of its mark (an icon in its status tone), its time and what
  else it says, a rule before each — the table's own search in its header
  (its search icon, as the other tables'), 20 a page, newest first. Both lists draw their rows with `event-row.tb-event-row-classes`
  (`styles/_event-row.scss`); change the row there, for both.
- **A detail panel's facts** (label / value rows in a card — a feedback
  item's page and browser, its sender) are `tb-detail-rows` of
  `tb-detail-row label="…"` (`components/shared/detail-rows/`: the label
  muted at the left, the value at the right; `stacked` — the label over a
  block of text; `divider` — a line above the row); a pick among a few short
  options in a card or form is `tb-button-group` (outlined boxes, the picked
  one brand blue — the settings card's: QC Lab's time zone, a feedback
  item's status), never a hand-made row of buttons.
- **Help with drawings** (the Organization, Applications and Access › Users (its Users and Groups lists) / Roles tables' "?" beside their title — a table's
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
- **Icon fields** (a profile's icon) are `tb-icon-picker`
  (`components/shared/icon-picker/`), laid out as the scope forms' pickers
  (`form.tb-icon-detail`): the icon picked on its `tb-icon-badge` tile ("sm"),
  then a box like a select's (the icon's name, its border, its chevron) that
  opens on a search ("Search") over a grid of the Material Symbols Rounded
  icons — the icons alone, no names under them (each named in the bubble on
  hover), drawn as the grid scrolls — "Default" first when the field has one
  (`[defaultIcon]`, the value ""). The icons are every one of the font's
  (`material-symbols.ts`, bundled — made by `make-material-symbols.py` from
  Google Fonts' icon metadata; run it again for new icons), never
  ThingsBoard's own list (`/assets/metadata/material-icons.json`: the older
  Material Icons set, ~2 000 icons short — `humidity_indoor`), which only
  lends its search words to the icons it has.
- **Date fields** (a code's expiry, a history request's range) are
  `tb-date-field` (`components/shared/date-field/`), never a native
  `type="date"` input: the form's input box with a calendar icon and the
  date picked, a form control — `mode="day"` ("YYYY-MM-DD", "" none — a
  native date input's value; `future`, `min`) or `mode="range"`
  (`TbDateRange`). Nothing picked shows dashes, as a select, or what the
  empty value means (`placeholder="Never"`). It opens the dashboards' one
  calendar, `tb-date-range-picker` (a range, or `mode="day"`: one month, a
  day), through `tb-date-picker-host` — placed in the dashboard root of
  every dashboard with a date field, so no side panel clips it.
- **Plain labels:** a search box (and a picker's search) says "Search", a
  table's create link "Create new", a delete action "Delete" — never "Search
  roles", "Add tank", "Delete gateway"; no info tooltips or helper text on
  buttons, search boxes or inputs (an action that can't run says why in a
  toast when clicked). A field that does need a note (the site's Google
  Chat webhook) gets an info icon beside its label, its text in the `tbTip`
  bubble (`form.tb-label-info`) — never helper text under the field.
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
