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

## Documentation in Obsidian — every change of logic is written up

The Obsidian vault (`/Users/steffensenchyna/Documents/Gitlab/obsidian`,
outside this repo) documents what's built. Every change of logic or
behaviour is written into its notes **in the same task** (never left as a
follow-up): the dashboards' behaviour, and everything on the ThingsBoard side
(rule chains, calculated fields, alarm rules, attributes and time-series
keys, event codes, a gateway's or a PLC's configuration). A purely visual
change (a colour, a spacing) goes in only where a note already describes
that look.

- **Where:** the note covering the area.
  - An app: its folder, `Projects/<App>/` (`Fuel`, `Asphalt`, `Marine`,
    `Water-Metering`, `In-Transit`, …).
  - The platform (access, the organization, the entity hierarchy, an
    integration): `Thingsboard/`.
  - ESF units: `Eurotech/`. ChirpStack: `Chirpstack/`.

  Update the note that already covers the area. Make a new note only when
  none does, in that folder, and link it with `[[…]]` from the notes it
  relates to.
- **What:** what is true now, and why. Name the rule chains and calculated
  fields and say what they do. Give the keys, the codes and their meaning,
  and the decisions with their reasons. Say what isn't done or verified yet
  (deployed, uploaded, proven on a real device). Edit the note in place, not
  as a log appended to its end. A change that leaves older data meaning
  something else (a code reassigned, a key renamed, a feature removed) gets
  a dated callout (`>[!warning] … (16 November 2026)`).
- **How:** in the vault's own format.
  - The frontmatter (`aliases`, `tags`, `title`, `date created`,
    `date modified`): bump `date modified`.
  - Headings, tables, `[[wiki links]]` (`[[Pump Events#Event Codes]]`) and
    callouts (`>[!note]`, `>[!warning]`, `>[!success]`).
  - A callout is short: its title and a line or two at most. It is never a
    paragraph, a list or a test's log. The detail goes in the note's body,
    as prose, a list or a table under its heading. A callout never sits
    inside a numbered list, where it breaks the numbering.
  - Absolute dates, never "today".
  - Never a secret: no token, password or webhook URL.
- **A note that is a spec** (the Fuel "Pump Events" note: the event codes):
  the code follows it, and the note changes with the code. If the two
  disagree, say so; never quietly settle it either way.
- Name the notes changed in the reply that reports the work.

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
  (a page's sections in its scrolling column — the gateway page's Settings:
  General, Logs, Storage, gRPC server, Statistics, Other — ThingsBoard's
  own General configuration's tabs, `GATEWAY_CONFIG_SECTIONS`, by name as
  the ESF views' groups, no icons) is pinned instead
  (`dashboard.tb-sticky-tabs`: on the dashboard's background, covering the
  gap under it) and the column's scrollbar starts under it while it shows
  (`dashboard.tb-scrollbar-under-tabs`, plus any padding above it — a
  panel's body: `card.$card-stack-gap`; the group's height
  `form.$tab-group-height`). A gateway's panel's Settings tab is its
  identity card alone (name, label, site, applications, note); its
  configuration is its page's. Only the tab group stays: the search box
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
  one a `tb-filter-section` + searchable `tb-filter-list`, each headed in the
  plural ("Sites", "Statuses", "Product lines" — what its options are) — each option counted
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
  option; given `options.sites`, the Sites tree in the Markets' place —
  Access › Users' Users and Groups lists: the plants a scope covers, a
  regional (or tenant) one everywhere, each option counting an item once a branch,
  `countSiteTreeOnce`), never the two sections written out again. A Settings
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
  the filters beside it are the list shown's. On a phone the group is atop
  the page instead, over its list — not in the filters'
  sheet: every page's lists switch so there (Access › Users' Users | Groups,
  `tb-access-settings`' own, its `sectionChange` the same pick; the fuel
  Codes page's Users | Vehicles and Activity's Pumps | Codes; QC Lab's
  Devices page's Temperature | Ambience; Asphalt's Devices page's Tanks |
  Burners — its Burners then no sheet, `[hasSidebar]`). A new page of
  several lists does the same.
  Never re-declare these per dashboard.
- **Colours:** the tokens come with that frame (`styles/_theme.scss`). Never
  redeclare `--c-*` tokens locally or hard-code a hex where a token exists.
  The neutral surfaces and lines are Supabase's dashboard's, light and dark:
  the page's canvas (`--c-bg-neutral-min`), a card a step off it
  (`--c-bg-neutral-extralight`), the control fills (`--c-bg-neutral-light`,
  `-extralight-hover`) and the borders (`--c-border-neutral-light` a card's
  edge, `-normal` a field's) — its translucent fills and borders laid over the
  card as solid colours, the cards and what sits on them given the brand
  blue's hue (on light the cards white, their fills and lines faintly
  tinted; a darker, muted navy on dark — the card `#11161f`); the light canvas
  stays Supabase's, the dark one a blue-black (`#0a0c10`); the brand blue and
  the status scale are ours. The
  canvas is also ThingsBoard's own loading pages' (`theme.$canvas-light` /
  `$canvas-dark` in `white-labeling/custom-css.scss`); its side nav and top
  bar are a card's surface (the card's edge between them and the page). A
  button group's track (`tb-segmented-control`, and the rail's tooltips and
  page menus, its look) is `--c-bg-track` / `--c-border-track`, a hovered
  button `--c-bg-track-hover` / `--c-border-track-hover`: the grey control
  fill on light (white buttons); on dark a deeper navy than the card
  (`#141b2c`), its picked button the canvas, a hovered one a darker navy
  with a lighter outline; the picked button flat (no shadow), in both
  themes. A brand-tinted fill — an icon badge's tile, an active icon button,
  the section menu's active item, a selected row, the ground of a ranked
  line's day bars (`SummaryRow.trend`) — is the brand tint in both
  themes (`light-dark(--c-bg-brand-semilight | -light, --c-bg-brand-extralight)`),
  never the grey control fill on dark.
  A brand accent on a surface — a focus border, a checked control, an active
  icon or link, a spinner — is `var(--c-brand-accent)` (the full brand blue in
  light mode, the lighter tint in dark), never `--c-icon-brand-light` alone
  or a `light-dark()` pair of its own.
- **Spacing / shape:** `card.$card-radius`, `card.$card-stack-gap` (gap between
  cards stacked in panels / sidebars), `form.*`, `button.*` (incl.
  `button.$link-hover-color`; `button.tb-trailing-dots` after a running action's label — every running action's animation, never a spinner: a Manage card's, `tb-manage-action [busy] busyLabel="Activating"`, and a table's, `tb-table-link [busy] busyLabel="Installing"` (its `progress` after the dots: "Deleting... 2 / 4")), `tooltip.*`, `motion.*` (`$expand-duration` —
  the open/close speed of cards, settings sections, the filter sidebar and
  detail panels) from `components/shared/styles/`.
- **Form width or full width — by the content, never by the page:** a
  form, a facts card (label / value rows), a note (`tb-callout`) and a
  single command box are at the form width (`card.tb-form-width`:
  `$narrow-page-width`, left-aligned) — they read a line at a time; a
  table, a log and a chart take the full width — their width is
  information; a view's tabs sit at its top left, each its text's width
  (the charts' picker look, `tb-timeframe-picker` — the ESF views'
  Device, Software, Security), never stretched across. A page mixing both sizes each
  block, never the whole page. **The ESF views are the exception, the
  user's pick: their tables too at the form width** (the Security view's
  Certificates and SSL tables, Software's, Snapshots', the Network view's
  interfaces and firewall rules) and the command's output (in the gateway
  RPC results' reply look, `styles/_reply.scss`). **But the Drivers and
  assets view, the user's pick: every block across the view** (its
  tables, notes, a driver's settings — `tb-gm-esf-settings [wide]` — and an
  asset's), so an asset's channels' table has room; still wider, it
  scrolls sideways in its card. The shared pieces carry it, so a new view needs no CSS of
  its own: the ESF views' `esf.view` (`_esf.scss`) caps its cards, facts,
  notes, tables and placeholders (`ev-form` any other block), `tb-gm-esf-settings`' fixed set is a form and its
  firewall card at the form width; the ESF section itself is full width
  (`gm-esf`).
- **Page frame:** every dashboard is `tb-nav-rail` (`[ctx]="ctx"` — expanded
  or collapsed, the toggle first at its foot: expanded a list, each
  entry's icon where it stands collapsed and its name, the page shown on
  the brand tint, its icon and name in the accent, an app's pages folding open under it on a line — with the
  collapsible cards' motion (a grid row 0fr → 1fr, the shared expand timing) — (its
  row's click — its chevron at the row's end; the page shown's app open
  to start; collapsed, an app's click opens its first page), no bubbles — its
  pages and second group scrolling on their own when taller than the room
  above the foot, which stays put, a divider over it once they reach it
  (less room left between them than the divider takes, or scrolling; its
  scrollbar the dashboard's themed one with the filters column's gutter,
  `theme.tb-scrollbar-gutter`); an entry hovered — collapsed or expanded,
  an app's page too — a faint wash of the strong text colour, its icon
  and name in it, white on dark (`rail.$entry-hover-bg` / `-color`;
  ThingsBoard's own side nav keeps its grey) — 212px
  (`rail.$expanded-width`), its width easing (`nr-wide`) — the list look
  (`nr-expanded`) kept until it has eased shut, an app's pages folding in
  step, so nothing jumps; a click on the toggle never brings its bubble
  back until the pointer leaves; collapsed its icons — the
  user's pick on every dashboard, the rail's own: read from and saved in
  their settings, `navRailExpanded`, and this browser's for the next
  start; it marks its width on the dashboard root, `--tb-rail-width` —
  what's placed past the rail, the toasts, follows it; a phone's drawer
  always its list) (its pages, with the
  alarms (a click opens their panel, another closes it) — and, on a dashboard with a Settings page, Settings — as the
  rail's second group, right under its pages after a divider
  (`bottomItems`); at the rail's foot, top to bottom, the development
  switch (`footItems`), the theme toggle, Send feedback (`foot` items of
  `dashboardRailItems`) and Account (Home's — everyone's: a user's Settings
  page is its Account section alone) at its bottom edge. The theme toggle is a tenant administrator's alone, on every rail
  (`dashboardRailItems(dark, alarms, { settings?, themeToggle: isTenantAdmin(ctx) })`, for development) — everyone else
  picks the theme in Settings › Account (Home's rail, everyone's); a dashboard with a Settings page has it in the toggle's place (Home's rail also
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
  tables, panels and forms"). The exception, the user's pick: the gateway
  page's Logs keeps its search, source and CSV export in the logs table's
  title row, before its level group and window picker (the export after
  them), at the pickers' compact height (`tb-search-box [compact]`,
  `tb-select [compact]`); on a phone they're in the filters' sheet. A title
  row's controls wrap onto a second line, right-aligned, when the row is too
  narrow (`tb-widget-header`, `tb-data-table`'s `dt-header-actions`).
- **Phone layout:** every dashboard's root carries `tbDashboardRoot`
  (`components/shared/dashboard/dashboard-root.directive.ts`): narrower than
  600px (`PHONE_MAX_WIDTH`), or a phone on its side (under 960 × 480), by
  the root's own size (the widget's, so a nested app goes by its own), it
  carries `tb-phone`, and the shared frame lays out for a phone — the root a
  column the whole height, framed by a phone's 8px edge (`rail.$phone-edge`
  — the frame's `--tb-frame-padding`; a side panel's and a sheet's sides the
  same), a title bar across its top (`tb-nav-rail`'s, 52px): the menu button
  at its start, the page shown by name right after it (18px, medium —
  never a heavy bold) (`phoneTitle`: the rail entry's label, an app's page with its app muted
  after it — no page writes a phone title of its own), and its buttons at
  its end: those the pieces under it put there (`PHONE_TITLE_ACTIONS`,
  `dashboard/phone-title-actions.ts` — a `tb-sidebar-layout`'s filters
  sheet, an app nested in Home's too), then one for each entry marked
  `phoneTitleButton` — the alarms, their count on it (`dashboardRailItems`',
  Home's) — every one raised (`--c-tooltip-rich-bg` / `-border`, a 36px
  rounded square, the brand accent glyph); out of sight under an open
  sheet; **no navbar** — the rail is a drawer from the left, the menu
  button's: its list look (the expanded rail's, `nr-expanded`, whatever the
  user's pick — each entry's icon and name, an app's pages folding open
  under it, the groups the rail's, its foot at its foot — but the
  development switch and the theme toggle, `NavRailItem.phoneHidden`: a
  phone's theme is Settings › Account's — and but the entries with a
  title-bar button, the alarms (`phoneTitleButton`: the button in their
  place); no expand toggle),
  on the window over a scrim, `min(280px, 85%)` wide, its right corners
  rounded; a page picked closes it (an app's row only folds its pages), as
  do a tap on the scrim, Escape and a swipe left — anywhere on it, a move
  more across than up or down (that's its list's scroll): it follows the
  finger, closing past a quarter of its width or with a flick; **the filter sidebar a sheet**
  (`tb-sidebar-layout`: no column beside the content — its button in the
  title bar, beside the alarms', opens the sidebar in a `tb-bottom-sheet
  from="right"`, "Filters", a panel from the right edge swiped right to
  close: its search, filters, view
  switch and section menu at the sheet's width, a Settings page's menu over
  its filters, "Customize columns" in the filters' place while open; a
  section or a view picked closes it, a filter doesn't — so a phone view
  never clears its filters, and what only a wide screen can show (QC Lab's
  Time Machine switches) is left out of the sheet, `*ngIf="!phone"`); a
  table of more than two columns QC Lab's condensed table (`tb-data-table`'s
  `phoneCompact`: two columns under their headings — the row's name with a
  muted line under it, its "sub" values and its "meta" ones after their
  headings, a rule between two, a "note" on a line of its own; the row's key
  values right-aligned in the second ("trail", a rule between two — its
  heading `phoneHeader`); still a table, its headings sorting by the name and
  the first key value, never a list of cards or stacked labelled values);
  each column's place its `phone` role, `DataTableColumn.phone`: "title",
  "sub", "meta", "note", "trail" or "hide" — a column given none isn't on a
  phone (the row's panel has it). Every table's columns give theirs, a new
  table's too: a phone shows a row's few telling facts. QC Lab and the
  gateway's logs keep their own condensed views. The table's `thead` /
  `tbody` are Material's own elements, outside the component's style scope
  (`::ng-deep`), and ThingsBoard fixes a `.mat-mdc-row`'s height (52px):
  never a row laid out as a grid or flex box — its content outgrows the
  fixed height and the rows overlap);
  **a page one scroll, no scrollbar anywhere**: the dashboard's main column
  is the page's one scroll (the frame's — not a root holding a nested app,
  `tb-has-nested`, whose app's main column scrolls), what's in it at its
  content's height — nothing shrinks to fit — its end clear of a phone's
  home indicator; every page's own scroll box (whatever
  scrolls a page on a wider screen: its host, its body, a view —
  `dashboard.tb-dashboard-view`, `tb-settings-page`) flows instead,
  `@include rail.tb-phone-page-flow` (its overflow, shrink and min-height
  from the phone root's `--tb-page-*`) — a new page's scroll box takes it
  too; a table filling a page is as tall as its rows (`tb-data-table`'s
  `phoneFlow`: what's above it, then its title and column headings, then
  its rows — the headings scroll with the page, never sticking over it) and one endless list — 50 rows, 50 more as the page's
  end nears, no page controls, its footer's links ("Create new | Manage")
  after the last row — never a table squeezed under what's above it, never
  a scroll inside a scroll; and no scrollbar shows anywhere in a phone's
  dashboard (the frame's `.tb-phone` rule) — it scrolls by touch; a side
  panel a panel from the right edge (`tb-detail-panel`, every detail panel:
  on the window — a nested app's covers Home's title too — its height, its
  width but a 56px sliver at the left (`panel.$phone-panel-inset`, the
  page showing there, the panels' trail a column of its tabs in it, on the
  panel's edge as on a wider screen, 12px off the screen's edge — one unit
  with the panel: it moves as the panel is dragged and slides out with it,
  `--tb-panel-shift` on the roots), its left corners rounded, no grab
  handle, over a scrim — over the rail's whole layer,
  `panel.$phone-sheet-z`, its title bar's buttons sitting where a panel's
  close button is; the title bar stepping aside while any sheet is open — `markSheetOpen`, the roots' `tb-sheet-open`
  (`dashboard-root.directive.ts`); closed with a swipe right — anywhere on
  it, a move more across than up or down (that's its body's scroll), not
  over something scrolled sideways, nor started on a chart or a heat map
  (a move across scrubs it) or a slider (it slides it) — `OWN_SWIPE`;
  `data-tb-own-swipe` marks any other piece that takes the move: it follows the finger, closing past a
  quarter of its width or with a flick, a short drag springing back — a
  tap on the scrim, its close button or Escape; a panel's own content
  never handles that swipe); the alarms a panel from the right edge, as on a wider screen
  (`tb-alarm-panel` in `tb-bottom-sheet from="right"`: the window's height,
  its width but a 56px sliver at the left — `panel.$phone-panel-inset` — its
  left corners rounded, no grab handle;
  swiped right — anywhere on it, a move more across than up or down, which
  is its list's scroll — it follows the finger and closes past a quarter of
  its width or with a flick; a tap on the scrim, its close button or Escape
  too; `tb-bottom-sheet`'s default — a sheet from the bottom, swiped down —
  for one that rises); the toasts across the top; the calendar
  one month, its quick ranges under it, across the screen's top (on the
  window, the phone's edge round it, no taller than `svh` — not under its
  field); and ThingsBoard's own top bar (its
  menu, the page's name, its bell and user menu) and its dashboard
  toolbar's row hidden — the extension's global stylesheet
  (`src/app/scss/style.scss`, `tb-root:has(.tb-phone)`), so the dashboard
  takes the screen; there too, a phone's touches (`.tb-phone`): no tap
  flash, no double-tap zoom, no hover ring left lit by a tap (a field's
  ring on hover under `@media (hover: hover)`, its focus ring the
  keyboard's, `:focus-visible` — the date field's, `form.tb-field-button`), and its fields at the dashboards' own text size
  — iOS's zoom as a field takes the focus (under 16px) held off by the
  viewport's `maximum-scale=1`, set on an iPhone or iPad as a root first
  lays out for a phone (`tbDashboardRoot`'s `holdFieldZoom`; a pinch still
  zooms there), never by enlarging the fields; a dialog
  (`tb-ext-dialog`) the screen but its edge; Settings › Account's Manage card has "Sign out"
  (ThingsBoard's own `AuthService.logout`) for it; the page's `theme-color`
  is the dashboards' canvas in the user's theme (set with the theme's mark,
  `paintSiteTheme`), so a phone's browser bar runs on from the dashboard —
  and so is the page's own background (`html` and `body`, while a phone's
  dashboard shows: the global stylesheet's `html:has(.tb-phone)`): Brave on
  iOS 26 ignores `theme-color`, running the page under its glass status bar
  in WebKit's under-page colour, the body's over the html's. A shared piece keys its phone styles on
  `:host-context(.tb-phone)` and its behaviour on the directive
  (`inject(DashboardRootDirective, { optional: true })`: `phone`, `changes`)
  or `isPhoneLayout(el)` — never a media query on the window, never a phone
  variant of one dashboard. A dashboard's own phone view, in its component
  (`@ViewChild(DashboardRootDirective)`): QC Lab shows its list alone (the
  Time Machine's cards need a wider screen). ThingsBoard lays a dashboard out for mobile under
  960px: every extension dashboard's layout has `mobileAutoFillHeight` on, so
  its one widget fills the screen there — a new one needs it too.
- **Standalone or nested:** every dashboard runs as its own widget or inside
  the Home dashboard, whose rail opens them in place (Home, Entities — its
  Devices, Assets, Device profiles and Asset profiles pages, tenant
  administrators' — Gateways, a divider,
  QC Lab, Marine, Fuel, Asphalt, Aria — a user's rail shows only the apps running
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
  group; an app with a mark of its own shows it in its icon's place —
  `NavRailItem.logo`, an SVG's markup drawn as a mask in the icon's colour,
  muted, hovered and lit as an icon is: Aria's, `ARIA_LOGO_SVG`). No second nav column: every app's pages are its menu in
  Home's rail (`nestedPages` — Fuel's, Marine's, QC Lab's Devices and
  Reports, Asphalt's Devices and Reports), and a page holding several
  lists switches them with the button group atop its sidebar, on its own
  and nested alike (QC Lab's Devices: Temperature | Ambience; Asphalt's
  Devices: Tanks | Burners; Fuel's Activity: Pumps | Codes — the user's
  pick, 19 November 2026). It takes the host's theme, reads the widget settings
  the host passes (`dashboardWidgetSettings`: Home's CARTO key; else its defaults), keeps a Settings page only for
  sections of its own (`nestedSettingsSections` — the shared ones are on
  Home's), and writes its URL state with its app (`nestedUrlParams`),
  ignoring another app's (`ownsUrlState`). A new dashboard does the same.
- **Home's page follows the viewer's scope** (`scopeOf`, from the sites,
  markets and product lines they can see): a plant, a market, a product line
  or everything. A scope gets its own card first (its title "Plant · …",
  "Market · GVA", what it holds), then Devices, Active alarms, By app; the
  ranked cards break down a level under it (`SCOPE_DIMENSIONS` — a plant's by
  device type, a market's by site and product line, …), the devices from
  their stored `site` / `market` / `productLine`; beside them a scope's Top
  alarms (its five most frequent active alarm types). Home is in the Fuel
  Reports page's look: "By app" a split (`SummaryCard.composition` and its
  lines, as Fuel's fuel types — no doughnut); "Devices by …" and "Top
  alarms" ranked lines (each its share, its bar — a device count's bar in
  online / offline parts, `SummaryRow.shareParts`, named in the line's bubble over its bar — `tbTipAnchor`), never a bar chart of
  their own; the alarms a figures strip at the page's top (`tb-stat-grid
  [headline]`: the last 30 days against the 30 before — its chip red when
  more, green when fewer, `change.tone` — its trend; today, per day,
  busiest day, days with alarms) and, after the cards, "Alarms by
  day and hour" — the Fuel Reports page's
  dispenses' map (`tb-hour-heatmap`): the last 30 days' alarms, every status,
  by their start's weekday and hour (a tenant administrator's from
  `/api/v2/alarms`, the 30 days cut into six slices read side by side, each
  in pages — `ALARM_SLICES`: the server takes ~3–4 ms an alarm it returns,
  so one read of a month's took seconds; anyone else's device by device —
  the alarm query the server refuses them), read again every 10 minutes.
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
  table of every profile, titled as the rail names its page with its icon,
  its search in its corner (`tb-data-table [compactHeader]`, as every table
  without a filters column; `PROFILE_PAGE`) (`/api/deviceProfiles`, read in full — a
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
  entity query a kind. ThingsBoard refuses a customer's user a profile's
  attributes (and its list) whatever their role, so a tenant administrator's
  dashboard mirrors every icon — `profileIcons` (`PROFILE_ICONS_MIRROR_KEY`:
  each kind's profiles with an icon, id, name, icon) on every Application
  asset, shared with each access group whose plants run the app — written
  where it differs, as the dashboard starts and after a profile's icon is
  saved or deleted (`syncMirror`); anyone else reads the icons there (none
  there yet: the kind's default shows).
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
  A device that manages others (a fuel station's PLC, its pumps' alarms
  propagated to it) passes them, `tb-alarm-list [memberIds] memberLabel`:
  their alarms follow its own, each type once, "Pumps" muted after it — a
  pick saved for each member, shown as their picks together.
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
  number; `[readonly]` in a table's cell: the picked ones, only shown — on a
  phone compact, the four fitting a panel's row). The **"Alarm
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
  quoted words, and nothing that reads like SQL — "(1 to 30; unset or not a
  number: 3)" was refused — the instance's AWS firewall reads such text as an
  injection and refuses the request that carries it, a bare nginx 403.)
- **Feedback:** the rail's "Send feedback" (`dashboardRailItems`, at the
  foot after the theme toggle — `FEEDBACK_RAIL_ID`: `feedbackOf(ctx).show()`) opens
  `tb-feedback-dialog [ctx] [notices]` (in every dashboard root; a nested
  app's `*ngIf="!host"` — Home's shows): Bug | Idea | Other and the words
  (a `tb-ext-confirm-dialog [form]`: its box focused in the tap that opens
  it — a phone's keyboard comes up only for that — and on a phone the
  dialog at the screen's top, the keyboard under it; on a wider screen
  near the dashboard's top, as every confirm dialog),
  a bug with a screenshot of the dashboard root behind the dialog (taken
  as it opens; on a phone at send time, under "Sending…" — drawing the
  page holds a phone's browser, and typing would stall — once its keyboard
  is down and the page back at the screen's height (`settled`), its fonts
  fetched as the dialog opens, `prepareFonts`, and Send waiting up to 30 s
  for it). Every screenshot (`captureScreen`) is kept light: its text fonts'
  Latin part alone, the icons' font as its fill axis alone (~0.5 MB, not
  the page's ~5.4 MB variable one — Google's `icon_names` cut-down is served
  as a download Safari's fetch refuses), nothing past the window's right or
  bottom edge copied; drawn again once if the first comes out blank; an SVG
  shape's CSS paint written onto it as attributes for the copy
  (`paintSvgShapes` — Safari's copy keeps no CSS on SVG shapes: black).
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
  (FuelUser / FuelVehicle) at its **places**, picked with the plant tree a
  user's form picks plants with (`plantTreeOptions`, `organization.models.ts`
  — "All plants" › each market › its Fuel plants, `tb-filter-list
  [treeToggle] [field]`; the create, import and Settings forms alike): a
  market whose every Fuel plant is ticked is a place — its own list, its
  sites to come too (every plant ticked: every market's) — any other plant
  ticked is one (`placesOfPlants`, as a user's plants make default groups;
  `CodePlace`). Each place links it (`FuelUser` / `FuelVehicle`) and holds its
  slot in its `userCodes` / `vehicleCodes` server list; a market's code entry
  a place (`MarketNode.codes`, `siteId` "" for the market's own). The backend carries them
  down: the Market's "Push fuel codes to sites" (over `Contains`:
  `marketUserCodes` / `marketVehicleCodes` on each site), the Site's "Push
  fuel codes to PLC" (over `FuelPLC`, never `Contains`: the market's codes,
  then the site's, each once, to its PLC), the PLC's own fields to the gateway — so a
  dashboard writes only its places' lists. A dispense reaches the code's
  asset by its name (the FuelPump Transactions chain: `USR-<code>`), wherever
  it's placed; a report names a code by its number. Room for a pick is the
  fullest station's of its places (`placesRoom` — a moved code's own slots
  not counted). Access groups take a code where it
  works (`SITE_WIDE_RELATIONS`, `access.models.ts`: its market's sites the Fuel
  app runs at — a plant's group too): at their sync, as it's assigned
  (`AccessStore.joinCoveringGroups`) and as it moves (joining its new
  plants' groups, leaving those covering none of them —
  `leaveCoveringGroups`). Only an **active** code holds a slot: a
  code's server attribute `codeStatus` (active — none — / disabled; an
  older "suspended" or "expired" reads as disabled); Disable takes it out of
  its lists (its slots freed, its asset and keypad code kept) and Enable
  puts it back where there's room. Codes don't expire: no expiry date, no
  expiry chain. An active user code's Manage has Reset PIN: at each station
  of its places (`atPlaces`) its PLC gets the code — read back with `get`
  before the flag goes up: gateway 3.8 reports an all-digit string write as
  failed ("'int' object has no attribute 'encode'") while the PLC takes it,
  so what the PLC holds counts — then the flag — the
  gateway's OPC UA connector's reserved `set` RPC, by the keys it maps to the
  PLC's tags as attributes (`pinResetUserKey` `delUserPin` → `GVL.sDelUserPin`,
  `pinResetRequestKey` `delUserPinRequest` → `GVL.xDelUserPin`: true, the PLC
  clears it once done; refused while it's still up). The flag's RPC is
  persistent, carrying `PinResetInfo`: once the PLC has taken it the **"Fuel
  PIN Reset" rule chain** (from the FuelPLC profile's Fuel Device Lifecycle,
  on RPC Successful — a gateway's reply with an `error` is no success) logs a
  `code_pin_reset` event on the station's market (its stored `market`) — the
  dashboard never logs it itself. Every
  change is a `code_*` event on each of its markets — the same event at the
  same time on each (`logCodeEvents`), naming its places
  (`placesText`: "all sites in GEA", "GEA and Richmond Lab (4R20)") and
  shown once in a list of several markets (`codeChangeKey`) — (assigned,
  edited, disabled, enabled, revoked — a deleted code's; older suspended,
  resumed and expired events still show in the history). The Codes page's flow is
  the Settings tables': its table — a row a code (`toAccessCodeRows`), the
  code in full, its copy button copying it; its last dispense ("Last used",
  "Never": its asset's latest `fuelVolume` point — one entity query over
  the code assets as a Codes page first shows, the page waiting for it;
  read again 2 s after a pump's change); its Attention ("Doesn't fit at
  2 stations" — generic, how many, no bubble: the panel's note names
  them — a station at a site it works at whose list the backend built
  it into, the PLC's server list, but sent full without it, the shared list
  cut at the PLC's capacity — the site's own codes come last, so they're the
  ones cut; not while that list loads: `codeMisfits`, `codeAttention`; over the code's panel, on every tab, a warning
  `tb-callout` titled as the pill — which stations, that it won't work at
  their pumps, what to do — in a `tb-fold`, through `tb-entity-detail-panel`'s
  `panel-note` slot, the note over an entity's tabs — a fold there takes
  `margin-top: 0`: a closed fold's pull would drag the first card into the
  body's padding (and a fold never shrinks, `flex-shrink: 0` — in the
  panel's fixed-height body it would be squeezed under the cards); its "View where it's
  assigned" (and its Insights' Assigned count) opening a `tb-ext-dialog`
  filling the dashboard, the code's tree in a card on the help drawings'
  dotted canvas (`diagram.tb-docs-canvas`), the legend under it — the
  canvas moved as a map's (the shared `PanZoom`,
  `components/shared/pan-zoom/`, and `diagram.tb-map-canvas` /
  `tb-map-layer` / `tb-map-controls` — every pannable drawing's, the ESF
  Wire graph's too): a drag pans, the wheel, a pinch or a double
  click zoom about the pointer (0.2–2.5) — but a drawing in a page that
  scrolls, the Wire graph, zooms by its buttons alone (`buttonZoom`: the
  wheel scrolls the page past it, no pinch or double-click zoom, the
  user's pick) — the dots moving and scaling with
  it (the view a transform on the laid-out tree — its measured offsets
  stay as laid out); its controls at its top left, the map's look: the
  flip (left to right — lit, an active icon button, while on; the user's
  pick, kept in their settings, `fuelCodeMapHorizontal`), Show all (the
  whole tree centred, never past 1:1 — what it shows on opening, and again
  as the tree changes until the viewer moves it), zoom in, zoom out —
  `tb-fuel-code-map` (`codeMapOf`: top down or left to right, the code › its markets › a
  layer of each market's sites — those it works at lit, the rest dimmed —
  › each lit site's stations, every node its own dashed box named over it,
  filled with a faint tint of its border's colour (solid over the canvas);
  a drawing, not text — the arrow cursor, nothing selectable
  (a market's and a site's with an info icon's bubble), "Assigned" on its
  own places, dotted arrows from each node to its children — an SVG
  layer drawn from the boxes' measured layout offsets (rounded elbows, one
  dash pattern a path — dots, a hair-long dash's round caps — ending at its
  arrowhead marker's base, the head running on to the tip, so no dot shows past it;
  again on every resize), never CSS borders, which don't line up; a station
  whose table, read back, holds the code in the brand accent; full in red —
  its box too, and its connector: red, a red arrowhead, a ✕ in a red ring
  over it; the arrows that reach (a market, a site it works at, a station
  holding it) flow — their dots moving on toward their heads, all started
  together (a dash offset's animation) — the still ones (red, dimmed, not
  loaded yet) under them, masked out where a flowing one runs (a shared
  stem shows the flow alone);
  not loaded yet grey — no bubble on a station, the legend under the tree
  says which; built again as the code refreshes)); its markets and sites by their
  codes ("All sites": its markets' own lists); its sidebar's Sites filter
  the shared site tree (a code passing where it works — placed at the site
  or at its market, `AccessCodeRow.siteIds`; a branch counting a code
  once) — with "Create new |
  Manage | Import" at its foot, Manage's "Delete (n)"; a row opens the
  code's panel (`tb-entity-detail-panel`, its icon its asset profile's, a
  stop on the dashboard's trail), laid out as QC Lab's device panel —
  Insights, then Settings, no Alarms (a code has none): Insights (first
  what it is, `tb-detail-rows` in a card — Type, Added, Added by, Last
  used, and Assigned: the sites it works at, a `tb-table-count` whose click
  opens the Assignment tree, a warning icon before it in the note's orange
  while it has an Attention flag (the flag in its `tbTip`); then `tb-fuel-code-activity` — its Usage card, a chart card with its own
  1W | 1M | 3M picker (1W to start — every pump of its places is read over
  it, a busy pump's week of events ~300 KB; a pump's read is reused for 2
  minutes, `EVENT_CACHE_MS`, so the next code of the scope or one opened
  after the Activity page comes at once): its use at its places' pumps — its litres a day (a week
  over 3M, `tb-bar-chart`, `chartWindow`; no figures over it — its facts
  card has its last use), then its activity: its latest 10
  events — its use and its changes — a `tb-event-list` with no search,
  newest first, "View full activity" at its foot (`moreLabel`: the Activity
  page's Pumps over the panel's window, its User or Vehicle filter on the
  code alone — its changes a switch away on Codes — the filters that would
  hide its rows cleared)) and Settings
  (`tb-fuel-code-form` — the code in full in a `tb-copy-box`; holder,
  plants (the plant tree: a move links and takes a slot at each new
  place first, then frees each old one);
  Manage: Disable / Enable, Delete; `tb-form-actions`). "Create new" and
  "Import" are panels of their form alone (Details: the plant tree first —
  the Codes page's Sites filter's sites ticked, else none); the import's preview a
  `tb-detail-table` grouped by what becomes of each line. The pumps' events
  and the codes' changes are the dashboard's Activity page (its rail's, after
  Stations and Codes — a page of its own, never a tab of theirs): "Pumps |
  Codes" atop its sidebar, each list with its search, CSV export and columns
  under the page's one window (`tb-timeframe-picker`, its custom range) — the
  Pumps list filtered by its Events, the Stations page's product line
  and site picks and its Pump filter (each station › its pumps), the
  Codes list by its Type and the Codes page's sites (a change passing when
  its market holds a site picked), both by one User and
  Vehicle pick (each list's sections, the codes in its rows by holder:
  "Jane Doe (1234)" — a row passes with its user or its vehicle code
  picked). A panel's "View full activity" opens the Pumps list on its
  entity (a station's: its pumps picked; a code's: the code picked). An older link to Stations' or Codes' Activity tab opens it there
  (`MOVED_VIEWS`).
- **Fuel totals:** never total a pump's events in the page (a busy pump has
  more than one read returns) — read what the **"Fuel Daily Totals" rule
  chain** stores on each pump (every 2 minutes, from its `event` time
  series): a point a quarter-hour, `fuelQtrLitres` / `fuelQtrDispenses` /
  `fuelQtrDenied` (denials and timeouts) — a stop with litres counted as a
  dispense — and a point a day at its
  midnight (America/Edmonton), `fuelDay*` — the Stations page's cards'
  "today" (`PumpRow.today`; its three cards, in the Reports page's look:
  Stations — its stations by state, a split bar in its lines' marks'
  colours (offline the neutral mark's grey, `--c-icon-neutral-light`; a
  state with none draws no part), and Needs attention; Dispensing today; Top stations today,
  ranked lines with their share — `buildStationSummary`); the Reports page sums the quarters by the hour (by the
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
  its dispense sizes, its weekday × hour map, by shift, and "vs last"
  columns (a pill — more fuel red, less green, about the same neutral, as
  the strip's chip, "New" blue; the Denials table's reason the Activity
  page's pill)
  (no pump availability: a pump has no online / offline state —
  it reports only when something happens; the PumpConnectivity field is
  gone, its old events left out of Activity); a long window's totals read in parts (ThingsBoard
  refuses an aggregated read past 700 intervals — `TS_MAX_INTERVALS`), its
  events a page at a time back to its start (`readReportEvents`, at most
  `REPORT_EVENT_PAGES` a pump — past that, a note says from when the
  event figures run) — and so does a station's
  panel (`readPumpTotals`). That panel is laid out as QC Lab's device
  panel: Insights — its Station card (`tb-detail-card`, the shared facts
  card's label / value rows, one column: pumps, last dispense, then each
  list's codes as the Stations table's cell — its icon and count
  (`tb-table-count`, a link to the Codes page on the station's codes, the
  panel closing), "/ its capacity", its sync mark — then ⟲, repush; no sync
  rows of their own. The sync mark (`codeSyncMark`, its icon in its tone,
  named in its `tbTip`): Synced while its PLC's table, read back as
  `plcUserCodes` / `plcVehicleCodes`, holds the list it was sent; Loading,
  Not synced, Offline, Unknown — `plcCodeSync`, `PLC_CODE_SYNC_META`), then one
  chart card, `tb-fuel-station-totals` ("Fuel dispensed": its picker, bound
  two-way to the station's window, `stationTimeframe`; the window's figures
  — fuel dispensed, average dispense; then two bar charts, a divider
  between them as a metric chart card's: the litres, a pump a stacked
  segment, and the dispenses, the denials stacked on them in the status
  scale's red (`--c-bg-error-normal`, not a palette slot), no figures, its
  legend naming them — by the hour over 1D, by the day over 1W / 1M,
  `chartWindow`), then its pumps (`tb-fuel-station-pumps`: a block a
  pump, nothing in it opening anything — the station manages its pumps —
  its name and fuel type, its state's pill (the worst of an overload trip,
  a full event buffer, events stalled, a release under way; else OK), its
  fuel today / this month / this year against its limits, its dispenses
  today, its last dispense, its PLC's overload trip and event
  buffer for it (`overloadTrip`, `eventBufferFull`), its latest report
  (`lastActivityTime`) — its PLC flags as pills, OK green, Tripped / Full
  red; its events held at the PLC only in its state's pill (no row of
  their own) — a pump everywhere named by its
  `pumpLabel`, its panel's Label, else the device's label, else its name; a
  change followed live — the pumps' subscription watches every key the card
  shows, the flags and the period totals too, but its latest report (the
  PLC's heartbeat would reload every pump every 30 s)) and
  its Activity card (its pumps' latest 10 events over the window, a
  `tb-event-list` with no search — each its pump and litres beside its
  time, its user and vehicle (by their holders' names) on a line under it,
  `EventListItem.sub` — "View full activity" at its foot) —
  Alarms (`alarmsTab`, `tb-alarm-list`: its PLC's and its pumps', each row
  naming its device after its time — `[showOriginator]`, "P01" — and its
  message whole, never cut (`event-row`'s `-message`) — every
  pump alarm rule propagates over `FuelPump`, so ThingsBoard lists a pump's
  alarm on its station's PLC (and its site) too; the shared alarm reads
  keep each alarm once, `uniqueAlarms`; its Notifications its PLC's alarms,
  then its pumps' — `[memberIds]`, "Pumps", a pick saved for each pump) and
  Settings (its PLC, its site, its pumps — the device settings card; "Create new"
  under them adds a pump; its Manage card a stalled pump's "Release events
  · P01"). The pump's own panel is no longer opened from the station (an
  older link or a trail's stop still opens it). The Stations table — a row a station, its PLC
  (a pump shows only under the PLC that links it, `FuelPump`) — has "Create
  new" at its foot: a "New station" panel (`tb-fuel-add-station-form`,
  Details alone) — its plant (every plant of the Organization), its number
  and its pumps (a section each: number, fuel type; "Create new" adds one),
  each device named after the plant, product-site-plc-# / -pump-#
  (`plantDevicePrefix`: its product line's code and its own, "agg-3h32"),
  the PLC "PLC01", a pump "P01". The PLC is linked from the plant (`FuelPLC`)
  and placed there (`placeDevice`: Site —Contains→ device, the backend
  derives its location), each pump from the PLC and the plant (`FuelPump`)
  and placed there too (a station's "Add pump" the same); any failure
  deletes what was made. The "Application Sites" chain then makes the plant a
  Fuel site. Who took the fuel (a
  user's, a vehicle's litres) still comes from the dispense events; their
  litres also as `fuelVolume`, a point a dispense.
- **Fuel pump events:** a pump's events drain from its PLC a frame at a
  time — its gateway reports `eventArray` + `eventReady` (on change), the
  ParseTransaction calculated field (FuelPump profile) parses a ready frame,
  the "FuelPump Transactions" chain logs it (`event`, `ackEventId` /
  `ackEventTs`) and acks it (shared `eventArrayRead=false`, which the gateway
  writes to the PLC's `xPumpxArrayRead`); unacked, the PLC holds that frame
  and every one after it. Its event codes are the Obsidian "Pump Events"
  note's, each type's label, icon, tone and Activity filter `EVENT_META`
  (Dispense, Denied — the denials and a timeout, the only ones a denial
  figure counts — Error — an odometer or hours entry — and Stopped — an
  emergency stop, code 8, or an overload trip, code 9: at any point of a
  fueling, with whatever the PLC had then — any of the user, vehicle,
  odometer, hours and litres, a blank or 0 cell not given; with litres the
  stop row is that fueling's only record, so it carries a dispense's
  transaction keys and counts as one everywhere — its litres and the
  dispense count: the daily totals, Reports, a code's Usage, the limits —
  `isFueling` / `hasFuelingDetails`; the press or trip itself an alarm,
  see "Fuel alarms"); a new code goes into
  ParseTransaction, `EVENT_META` and the note together. **A frame is logged and acked once:** the field
  emits every ready frame and dedupes nothing (its own output never reaches
  its arguments); the chain takes an event message one at a time a pump (a
  checkpoint into the SequentialByOriginator queue) and, before any fork,
  drops one whose key — `<ackEventId>@<ackEventTs>` — the pump's server
  attribute `loggedEventFrame` holds, else marks it there first (the PLC's
  counter reset: a lower id, another time — a new frame). Never re-run the
  field over a window. Each pump also reads the PLC's heartbeat
  (`GVL.xHeartbeat` → client `heartbeat`, every 30 s — every fuel
  gateway's connector maps it on each pump), so an idle pump keeps
  reporting and its session stays open (ThingsBoard closes a gateway's
  device after 600 s without data and drops what it's sent). A frame held
  5 min since its last report — the later of `eventReady`'s and
  `eventArray`'s times (each on change; a drain still moving reports each
  frame's array), **never the pump's `lastActivityTime`**, which the
  heartbeat keeps fresh (`EVENT_STALL_MS`, `pumpEventsStalled`,
  `eventArrayKey`) — is the Stations table's "Events
  stalled"; the **"Fuel Event Release" chain** (a sweep every 30 s) releases
  it by the same measure, one step a sweep: its session closed — its gateway's
  OPC UA connectors re-sent unchanged, so the gateway reloads them and
  reconnects its devices; logged — acked again once no frame report has
  come for 30 s; not logged — its `eventArray` saved again 1 ms on, so the field runs
  and the chain logs and acks it. 90 s for the PLC to move on, 4 steps a
  frame, then it gives up (again an hour on, or on request); each step
  logged on the pump (time series `eventHeal`), its state the server
  attributes `eventHealFrame` / `eventHealStep` / `eventHealAt` /
  `eventHealTries`. While a pump is stalled its panel's Settings tab has a
  Manage card, "Release events" (confirmed; the server attribute
  `eventReleaseRequest` — the sweep takes it, a given-up frame tried again),
  "Releasing" while asked or while the chain is on a step, how it went a
  toast (`checkReleaseWatch`, from its `eventHeal`).
- **Fuel alarms** are alarm rules (ALARM calculated fields) on the device
  profiles, never raised by the dashboard (the Obsidian "Fuel Alarms" note
  lists them). The PLC's own flags are read by the gateway's OPC UA
  connector as on-change time series: the station's `emergencyStopOk`
  (`GVL.EmgStopOk`, on its PLC's device — one a station) and each pump's
  `overloadTrip` / `eventBufferFull` (`GVL.xPumpxOloadTrip` /
  `GVL.xPumpxEventBufferFull`) — every fuel gateway's connector needs them.
  FuelPLC:
  - "Emergency stop": `emergencyStopOk` false (Critical), cleared when true;
  - "Station offline": `active` false 15 min (Major), 60 min (Critical);
  - "Codes not synced": a list as sent (shared) unlike the PLC's table
    (client `plc…Codes`, the dashboard's comparison) for 15 min (Minor),
    60 min (Major); quiet while offline;
  - "PIN reset stuck": `delUserPinRequest` up 5 min (Minor).
  Both of the first two leave out a station that never connected
  (`lastConnectTime`: the SIM stations). FuelPump:
  - "Overload trip": `overloadTrip` true (Major), cleared when false;
  - "Event buffer full": `eventBufferFull` true (Critical), cleared when
    false;
  - "Events stalled": `eventReady` true 15 min (Major), or the release
    given up (Critical);
  - "Repeated failed attempts": 3 events in a row without fuel — denied,
    error, timeout — (Warning), 6 (Major); a dispense clears it.
  They reach the dashboard by the usual paths: the Alarms tabs, the bell,
  a station's Attention, Alarm Routing to the site's Google Chat, Alarm Chat
  — its sweep publishes a profile's rules as each device's `alarmRules`.
  A new fuel alarm is a rule there too.
- **Asphalt tank charts** (a tank panel's Metrics card): each on a steady
  scale, never auto-scaled to its readings (a tonne's jitter on 668 t
  filled the plot — the user's pick, 20 November 2026): Level 0–100%,
  Temperature 100–200 °C, Tonnage from 0 t (`MetricChartSection.yMin` /
  `yMax`: a baseline the axis grows past for a reading or a threshold
  outside it).
- **Asphalt inventory (the Asphalt Reports page — a page of its own, as
  Fuel's: Asphalt's rail and, nested, its menu in Home's rail,
  `nestedPages` Devices — Tanks | Burners, the button group atop its
  sidebar — and Reports):** never a tank's raw
  readings summed in the page — each tank's `tonnage` averaged a bucket
  with ThingsBoard's own `AVG` (`inventoryInterval`: 10 minutes up to 3
  days — the day tank cycles within the hour — 30 up to two weeks, an hour
  up to 93 days, a day past that; a long window read in parts,
  `TS_MAX_INTERVALS`), and the window before's the same way (its "vs
  last"), in tonnes alone (the tanks' volumes are in different units).
  Each tank's books are `tankLedger` (`components/asphalt-reports/
  asphalt-reports.models.ts`): a change booked once the level has moved by
  the tank's dead band from the last booked level (`moveBand`: 0.5% of its
  full tonnage — its tonnage now ÷ its level — at least 5 t; a big tank's
  sensor wanders ~20 t and comes back), a rise a fill (received), a fall a
  draw (dispensed — the page's word for it, never "used": the user's pick,
  20 November 2026), steps one way close together one movement, what's left
  under the band settled at the window's end — so opening + received −
  dispensed = closing, a tank's, a slot's and the window's (checked on real
  1D, 1W and 1M readings). A transfer between tanks is a draw from one and
  a fill of the other — not matched up (the products don't tell one), the
  figures' notes say so. The page is the Fuel Reports page's pieces
  (`tb-asphalt-reports`, `buildAsphaltReport`, `inventoryInsights`): the
  window picker (custom range: `tb-date-range-picker` in the root), its
  own Products and Sites filters (rebuilt from what's read), insights, the
  figures strip (On hand now, its change since the first day and its
  course — its chip green when it rose, red when it fell, `change.tone`;
  Received, Dispensed, Dispensed a day, Days of supply, Lowest, Tanks
  reporting), By product / On hand by tank / Dispensed by tank (/ by site),
  On hand over time a line a product (its axis from 0 t), Received and dispensed a slot (a plain
  bar chart — every bar in full, no pill on now's, every slot labelled;
  the user's pick) beside This period vs last, then Days, Tanks and
  Movements folded. **A movement's times are its raw readings', never the
  buckets'** (the user's pick — the buckets made every duration a whole
  30 minutes): once the window's averages are in, each movement's raw
  readings are read over its span (`movementWindows`: a bucket either
  side, never into the tank's next movement; four at a time), its start
  the last reading before the level left its old level and its end the
  first from which it stays at its new one (`refineMovement`: within a
  quarter of the dead band, 3% of the move, 0.5 t); one whose readings
  show no step (a slow drift booked once it passed the band — Tank 04's
  16 t a week) isn't listed, its tonnes still in the books; the Movements
  section and the insights wireframed until they're checked.
- **QC Lab compliance (the QC Lab Reports page — `tb-qc-lab-reports`,
  `components/qc-lab-reports/`, `buildQcReport`, `qcInsights`; a page of
  its own, QC Lab's rail and its menu in Home's):** how well each device
  kept to its range — **a device, never a channel, is what's counted**
  (the user's pick): its channels together (`deviceFigures` — a probe's
  two, an ambience sensor's temperature and humidity), its time out of
  range the time any of them was out, overlaps counted once (each
  channel's `lowSpans` / `highSpans`, merged a device, `mergeSpans`), its
  time in range its share of the time they stood for — every time figure,
  the strip, the days, the chart and the cards, its devices' added up.
  Each reading against the range its own threshold alarm is set to
  (`channelRange`: a probe channel's shared `temperatureChnNAlarmConfig`,
  an ambience sensor's server `temperatureAlarmConfig` /
  `humidityAlarmConfig`: `outside` in range between min and max, `below`
  from min up, `above` up to max, `between` anywhere but between them;
  off or incomplete: no range, left out of the time in range; a device
  showing °F has its thresholds in °F) — from its raw readings, each
  device read over the window and the one before, six at a time (a probe
  reports hourly, and again as it crosses a limit). A reading stands for
  the time until the next one, at most 2 h (`MAX_HOLD_MS`; a longer
  silence is no data); an excursion (a channel's) runs from its first
  reading out to the first back in — the readings' own times — and ends
  only once back in range for 15 minutes (`EXCURSION_SETTLE_MS`: a probe
  flickering at 25.0 °C is one excursion, not dozens; its time out still
  the time out). The page is the Asphalt Reports page's pieces: the
  window, Types (probes, ambience) and Sites; insights across the devices
  — never a channel by channel breakdown, a short line each, none the
  strip shows (`qcInsights`): the devices out of range now (the one out
  longest named, as the card), those with no readings, those out of range
  a day or more (past a day's window), the lowest site under 95% in range
  (only where the viewer sees more than one — most see one site), mostly
  too cold or too warm (three quarters of the time out), the quarter of
  the day half the excursions start in;
  the strip (Time in range — its change against the period before as a
  percentage of it, the Fuel Reports pill's "+0.1% vs previous period",
  never points; success up / error down — Excursions, Out of range,
  Longest, Always in range "/ n devices", Devices reporting, Without a
  range — the devices with a reading whose alarm is off); Out of range by
  device, Excursions by device (how often each went out: a probe sitting
  at its limit), Out of range now (each device out at its latest reading,
  once — its channel out the longest — how long and the reading, the
  longest first; a past window's "Out of range at the end") — no Ranges
  card, no Time in range by site card (the user's picks); Hours out of
  range a slot (too cold / too warm, a plain stacked bar chart) beside
  This period vs last; the temperature channels' Highest / Average /
  Lowest an hour, the lower and upper limits drawn — each the one most of
  them use (one tank at 23–25 °C never hides the others' 21 °C); Days,
  Devices (a row a device, never a channel's) and Excursions folded. A
  channel set to "None" counts when it sent readings (a row without the
  attribute says "None").
- **Fuel limits:** litres per day, month and year on a vehicle code, a user
  code, a pump, a site or a market, Mountain time.
  - Limits are server attributes `fuelLimitDay` / `fuelLimitMonth` /
    `fuelLimitYear` (0 or unset: none) and `fuelLimitWarnPercent`
    (default 80).
  - Use is time series `fuelUsedDay` / `fuelUsedMonth` / `fuelUsedYear`,
    kept by calculated fields, never summed in the page: a code's and a
    pump's from their dispenses' `fuelVolume` (ENTITY_AGGREGATION, 0 as each
    period starts), a site's its pumps' (over `FuelPump`), a market's its
    sites' (over `Contains`).
  - Alarms "Daily fuel limit", "Monthly fuel limit", "Yearly fuel limit"
    (ALARM rules on the five profiles — FuelVehicle, FuelUser, FuelPump,
    Site, Market; a pump's posted to its site's Google Chat as any
    device's): Warning from the warn %, Major from
    100 %, Critical from 120 %; cleared under the warn % — a new period, or
    the limit raised (`fuelLimitBand`, `FUEL_PERIOD_META` mirror it).
  - The limits (`tb-fuel-limits-fields`, `[scale]` code / pump / site / market:
    its sliders' ranges) are one of QC Lab's settings cards, built of the
    shared setting pieces (see "Settings cards"), "Fuel limits" with no
    info icon: "Warn at" (%) first, then a period a `tb-setting-object`,
    its switch heading it ("Daily limit") folding open its litres
    (`tb-setting-field` "Litres", a `tb-slider-stepper`), a
    `tb-setting-divider` before each. A code's are on its Settings form,
    saved with its Apply; its Insights' card shows each period's use
    against them (`fuelUseRows`).
  - Markets, sites and pumps: Settings › Fuel limits
    (`tb-fuel-limits-settings`, `FUEL_LIMITS_SECTION`; nested in Home its
    app's own page, no column — Home's rail its menu, `hasSidebar`). The
    table starts at the highest level the viewer can read: each market they
    can read, its Fuel sites under it, each site's pumps under it — a
    folding tree, a panel's grouped list's look (`treeParentKey` +
    `[treeCollapsible]`: + / −, "(n)", tree lines, folded to start) — (the
    pumps by their stored `site`; named by
    their pump label and station, "P01 · PLC02" — a site's stations each
    have a P01 — the device name in the bubble), a Fuel site whose
    market isn't theirs at the top. Each period's use against its limit, a
    pill when near, over or well over. A row opens its panel
    (`tb-fuel-limits-form`; a pump's subtitled with its site, its limits
    saved on the device).
- **Charts:** `tb-line-chart` / `tb-metric-chart-card` / `tb-bar-chart` /
  `tb-trend-chart` — a bar chart over time is a plain one (the user's pick,
  19 November 2026): every bar in full, every slot labelled, no bar
  standing out for now — never `tb-bar-chart [highlight]` (now's bars in
  full, the others dimmed, a pill on top) or `[axisEnds]` (its ends alone
  labelled), which no page uses (the Fuel and Asphalt Reports pages'
  charts dropped them) — series coloured by the chart palette tokens
  (`var(--c-chart-1)` … `--c-chart-5`, in that fixed order, never hex — on
  dark one tonal family on the navy card, an even softened chroma, checked
  with the dataviz validator against the card;
  `paletteCharts` colours a card's series one after another across its
  charts) — except a status split, in the status marks' colours: online / offline
  devices (Home's ranked lines' bars, `SummaryRow.shareParts`) `var(--c-bg-success-normal)` and the Offline pill's
  grey, `var(--c-text-pill-neutral)` — one
  shared tooltip (`chart-tooltip.ts` — every chart's the Fuel Reports
  page's look: a surface a step above the card, `--c-tooltip-rich-bg` /
  `-text` — white on light, a navy step over the navy card on dark (`#172034`, its edge `#2a3550`) — a
  hairline of its text colour round it, 6px corners, compact (12px text,
  tight padding, as wide as its content); drawn on the page (`appendTo:
  "body"`, its colours resolved from the chart), so no panel, card or table
  clips it — the line, bar and trend charts keep it over their plot
  (`confine`), flipping inward near an edge; its content laid out
  by `chartTooltipHtml` — what's hovered as its title (`tb-bar-chart
  [tooltipTitles]`: "Tue, Nov 10"), a row a series — a bar in its colour
  down its left, its name muted, its value right-aligned; a line chart's
  every series at its reading nearest the hovered time (within its reach),
  never ECharts' own pick, which lists only the series with the very nearest
  reading (an hour average stored a second after its rate went missing) —
  its title the pointer's own time: the hover line follows the pointer,
  never snapping to a reading (the x axis' `axisPointer.snap: false` —
  snapped, it hopped and eased from reading to reading, a stutter, each
  chart of a group at its own reading's time), its text redrawn as the
  pointer moves (ECharts redraws only when the nearest reading changes:
  its cached content, `_lastDataByCoordSys`, dropped on each move), and the
  box kept with it, no glide (`transitionDuration: 0`, every chart's) — a
  synced chart's box beside its line, at its first series' reading then
  (`placeRelayed`), never pinned to one height — a hairline and
  the stack's Total — the line, bar, trend and doughnut charts all through
  it; hidden as the pointer leaves the chart, `hideChartTooltipOnLeave` —
  ECharts' own hiding can miss a quick exit, a doughnut's tooltip left up —
  and, a finger never leaving, on a touch anywhere else and as the chart
  goes out of sight: its tab switched, or scrolled away after a touch; a
  mouse's click elsewhere keeps a time picked elsewhere on it).
  One look for every chart: no per-chart tooltip look. Every chart's ECharts
  runs outside Angular's zone (`zone.runOutsideAngular` at `echarts.init` —
  `tb-line-chart`, `tb-bar-chart`, `tb-donut-chart`, `tb-trend-chart`; a new
  chart the same) — its pointer moves and animation frames, run on every
  chart of a synced group, would otherwise run the whole dashboard's change
  detection each move and drop frames; what a hover changes on screen the
  chart redraws itself (`detectChanges`), and its `hoverTime` re-enters the
  zone only where a page listens (`tb-metric-chart-card`'s `onChartHover`,
  `hoverTime.observed`: Marine's map; `tb-bar-chart`'s `categoryHover`, the
  Fuel Reports strip — only as the bar under the pointer changes). A report page's insights: `tb-insight-list`
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
  its change against the previous period as a chip — neutral, or in the
  status scale where the page says which way is good, `change.tone`: the
  Fuel Reports page's fuel down green, up red — its trend over the
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
  over a window as one thin bar (in a table cell): `tb-run-strip`; a bar
  chart's slots with no data at all
  (`tb-bar-chart [gaps]`: a striped grey bar the plot's height, "No data" — never a zero), the slot hovered
  (`(categoryHover)` — the Fuel Reports page's strip reads for it), its
  ticks compact from a thousand ("1.2k"); an alarm's limit a threshold
  line (`tb-line-chart [thresholds]`, `MetricChartSection.thresholds`: a
  dashed line in the Major orange, `LINE_CHART_THRESHOLD_COLOR`, captioned
  with its value — a threshold alarm's limits while it's on, by its
  condition, `thresholdAlarmLines`: QC Lab's probes' and ambience sensors',
  an Asphalt tank's level and temperature), the y axis
  always reaching it, a baseline range or not, and its label always room
  over the plot (the plot starts 10px lower while a captioned line is
  drawn, `THRESHOLD_LABEL_ROOM_PX` — a line at the plot's top had its
  label cut by the chart's edge); a comparison line (the period
  before) `LineChartSeries.dashed`; a reference line (an average of the line
  it follows — Aria's Hour average) `dotted` (`MetricChartKey.dotted`: round
  dots, over the line and its fill, no area) — drawn only on the windows
  where it adds something (`MetricChartKey.timeframes`: the Hour average on
  1D and 3D, where the line it follows is finer than an hour); a chart's axis held at a
  floor (`MetricChartSection.yFloor`, `tb-line-chart [yFloor]`: never under
  it whatever the readings — Aria's Rate at 0; `yMin` is only a baseline the
  data can pass); a device's state over the window as a thin bar right
  under a chart's plot, over its time labels (`MetricChartSection.stateStrip`
  → `tb-line-chart [strip]`, `line-chart/chart-strip.ts`: its string key read
  apart, never averaged — each report holding `staleAfterMs`, a silence
  hatched "Offline" — no data, not a state, so the quietest thing in the bar:
  a solid neutral fill a step above the track (the Offline pill's grey at
  16% over the card), soft 1.5px "/" stripes (its grey at 42%, every 5px —
  a pattern, never a colour alone), no outline (the bar's own rounded ends
  frame it, as every state); each run's bubble its state and how
  long it lasted, "Producing · 1h 23m" (`formatDuration`, `time-format.ts`), never its times — the state card's
  runs (`tb-state-timeline`, a panel's State card) the same — its runs placed on the chart's own time axis, so they
  line up with the lines; the picked time a line across it — Aria's Time
  Machine cards: the rate over the belt's state); a chart key's stored averages
  by window (`MetricChartKey.nameByTimeframe` — a custom range the shortest
  named window at least as long as it), its raw readings (`fallbackName`)
  where they have none — the whole window, or before a first point well
  into it; a `tb-metric-chart-card`'s plots wireframed until its lines are
  drawn — "No data" only once a quick read (a point a plotted key over the
  window, `probeEmpty`) finds nothing; never a timer showing "No data"
  before slow lines, nor ThingsBoard's own `dataLoading` (it comes with the
  first reply, often before the time series); `loadTimeoutMs` (30 s) only
  when that quick read fails; a card's history kept a couple of minutes once
  read — the chart card's lines and state bars, the state card's reports —
  module wide (`RecentReads`, `recent-reads.ts`, `RECENT_READ_MS`: by device,
  window and charts), so a panel closed and opened again on the device shows
  them at once and its subscription brings them up to date (the read never
  skipped, only the wait; never a history read ahead for every row); a line denser than the plot (minute
  readings over a day) drawn averaged, its readings in time buckets about
  3px of the plot wide (`bucketByTime`: a whole step — 1, 2, 5, 10, 15, 20,
  30 minutes, an hour … — each bucket one point at its readings' mean time
  and value, an empty one none, so a gap stays a gap; bucketed again as the
  chart's width changes by a fifth), never every reading (ECharts' LTTB
  sampling keeps every spike: a jagged band) — its tooltip and readings the
  buckets' averages; a whole split into parts on a summary
  card, one bar under its title (`SummaryCard.composition`), a ranked
  line's course (`SummaryRow.trend`, small bars) and its move since the
  period before (`rankChange`); how fresh a strip's figure is
  (`StatHeadline.note`, "As of 10:32 PM"); a
  settings-style section menu: `tb-section-nav` (a group or an entry may
  show a logo in its icon's place — `logo`, an SVG's markup drawn as a mask
  in the icon's colour, lit with it).
- **A time picked elsewhere on a chart** (`tb-line-chart [pointerTime]`,
  passed through `tb-metric-chart-card`): its axis line there, a dot on each
  line at its reading then (an 8px dot in the line's colour, no ring — a
  hovered point is the same, in both themes, never ECharts' white-filled
  hollow circle) (the nearest within a quarter-hour, or twice the
  series' spacing) and the readings at its title row's end — the time muted,
  each value after a dot in its series' colour ("4:16 AM ● 21.4 °C ● 20.9 °C";
  no title: the plot's top-right corner) — no tooltip box; hovered itself, its
  own tooltip instead. Its move is its own (not passed on to its `syncGroup`:
  each chart is given the time). A hover on one chart of a `syncGroup` shows
  on each of the others at the hovered time, placed on its own plot
  (`placeRelayed`): ECharts' connect relays the hovered chart's reading by
  its index, which a chart of fewer readings doesn't have — it hid its line
  and tooltip. A long, scrolling list of cards sharing one
  `syncGroup` is `[syncTooltips]="false"`: only the chart under the pointer
  shows its box, the others the hovered time as a picked one (a box drawn on
  the page for a chart scrolled out of view would float over what's there).
  `[hoverable]="false"`: the pointer over the chart moves nothing (no hover
  line, tooltip or readings, nothing synced) — its time set from elsewhere
  alone. A list of cards' charts are all alike, `[inlineReadout]="true"`: never a
  box — the chart hovered too shows its line, dots and readings — and live,
  nothing hovered or picked, each series' latest reading in the title row
  (its time muted before them; no dots) — QC Lab's Time Machine cards.
  A card of the host's own holds the charts without theirs:
  `tb-metric-chart-card [shell]="false"`.
- **Time Machine** (`tb-time-machine`, `components/shared/time-machine/`, as
  UniFi's): a column at the main column's left, beside the table or cards, on
  the page's canvas (`--c-bg-neutral-min`, a card's edge and corners round
  it; what blends with it, the canvas too) —
  "Last 24h (n Events)" ("Last 7d" …) and its zoom (− slider +: 0.02 to 8 px a
  minute — a day starts at 5, a week at 0.5, a month at 0.1), then a vertical
  axis of the window (`span`), newest at the top, a
  labelled tick every 10 minutes (wider zoomed out, up to two days) and small ones between,
  in 12-hour time (a midnight's the date); its track sections, each a rounded
  bar with a 2px gap where one ends and the next begins — not yet (above now)
  the empty-value colour, up a brand tint, down (`spans`) hatched in that
  tint, its stripes the Offline pill's grey mixed into it (part of the
  timeline) — those overlapping or touching one run (its edges on whole
  pixels, its `tbTip` the charts' rich look, as close marks' — a row each
  device, its bar the Offline pill's grey — at
  the middle of what shows of it), its stripes a
  whole-pixel 45° tile anchored to the track (fine lines, ~1.4px), so every
  stripe is alike and they run on from one run to the next; every bubble in
  it (a mark's, a run's, the zoom's, Live) opens to the right
  (`tbTipPlacement="right"`); its events (`events`: `TimeMachineEvent`
  — an alarm's mark in its severity's tone, `alarmEvents`; a device going
  offline grey, `cloud_off`; coming back online — its next reading ending
  the stretch — green, a cloud, "Online") a dot each on the track at its own time (a plain 8px circle, no
  ring) in its mark's colour — the status scale's itself, the icon's (several
  close together: the worst's, as their one icon) — and a tile beside it in the status pills' tints, its icon in
  that colour too (the alarm filter's severity bars' — `tb-severity-bar`), marks
  closer than a tile one (its worst tone, its count on a badge in the tile's
  own tint and edge, its number in the icon's colour), named in their `tbTip`
  bubble — the charts' rich tooltip (`TipRich`, `chartTooltipHtml`), no
  time or date in it: its device with the device's site by its label and
  code its title (`TimeMachineEvent.subject`, `timeMachineSubject`: "RMC
  Tank 10 · Richmond Lab (4R20)"), then a row an event, newest first — a
  bar in its tone down its left (an alarm's severity, the status scale's;
  offline the Offline pill's grey, online green) and what happened, muted
  (its alarm's type, "Offline", "Online"); marks of several devices no title, each row its device
  on the right; and the marker — a line fixed near the
  axis' top (`PLAYHEAD_PX`), its pill "LIVE" or the time under it ("4:16:16
  AM"): scrolling the axis scrubs it (the scroll's top is now — live — the
  axis under it newest first, room under its oldest time to bring it up), as
  do a drag of the pill (down: back in time), a click on the axis or a mark
  (that time brought up to the marker) and ↑ / ↓ (Shift: ten minutes; Home:
  live — a scrub only moves the pill's time, never lays the axis out again,
  and each event shows once); the clock moving on keeps the picked time under it — back with the
  arrow button at its foot (the axis glides to its top). The picked time is `[(time)]` (`null`: live):
  the dashboard passes it to its charts' `pointerTime`, and back at LIVE they
  hover as ever. Its events are read as `time-machine.models.ts` does —
  `readAlarmsInWindow` (a tenant administrator's `/api/v2/alarms`, a
  page at a time, kept to its devices, each alarm once — an alarm raised
  meanwhile shifts the pages; anyone else's device by device), and a
  device's offline stretches from its readings' gaps (`readReadingTimes`, one
  REST read a device — past a day, its readings counted a bucket, ThingsBoard's
  COUNT: a week's an hour, a month's two hours, an empty bucket offline —
  `offlineStretches`) — never a multi-entity time-series
  subscription; again every few minutes while it's on, the alarms raised
  meanwhile from the page's live subscription — all of it
  `TimeMachineEvents` (`time-machine-events.ts`: a page's devices, the
  window; the devices read only grow, so narrowing and widening the list
  reads nothing again). An offline stretch is its "Offline" mark (always)
  and a hatched run on the track — the run a page's choice:
  `tb-time-machine-view [offlineSpans]` (`TimeMachineEvents.setOfflineSpans`),
  on by default (QC Lab's); `[offlineSpans]="false"` keeps the marks and
  their bubbles but draws no hatched runs (Aria's belt scales, quiet all
  night when their belts stop).
  **A page's Time Machine view is the shared pieces, never built again**
  (QC Lab's is the example): `TimeMachineState` (`time-machine-state.ts`,
  made in `ngOnInit`, `settingsPrefix` its user settings' keys' — QC Lab's
  "qcLab"; `restore(settings)` from the page's `readUserSettings`) holds its
  switch, its view switches, its window and the picked time (`tm.time` —
  the page's device panel's Metrics card's `pointerTime` too);
  `tb-time-machine-switches [machine]` under the sidebar's search and
  window picker, over its filters (`*ngIf="!phone"`; `(switched)` — QC Lab's ends its table's Manage) —
  "Time Machine", then while it's on "Large charts" (two cards a row — one
  when the view is narrower than two 360px cards — their charts 320px,
  `tb-metric-chart-card [chartHeight]`) and "Alarms on top" (the devices
  with alarms active at the picked time first — live, now's — worst
  severity first, then the most; the rest in the page's order), all
  `tb-ext-switch [labelFirst]` rows, a divider under them, a page's own
  switches projected after them; `tb-time-machine-picker [machine]` under
  the search box while it's on (the switches under it) — the cards' window, the fuel Activity page's
  picker (`tb-timeframe-picker [fullWidth] [customRange]`,
  `TB_WINDOW_TIMEFRAME_OPTIONS`, its calendar the dashboard's
  `tb-date-picker-host`): the timeline spans it, read afresh, back to live —
  a range read as history (`tb-metric-chart-card [range]`, a fixed window;
  two weeks binned by the hour, a month by the day) and the timeline's
  `[end]` its end (its header the dates, "Nov 10 – Nov 14", its top that end,
  nothing moving, read once); and `tb-time-machine-view` in the list's place
  (`*ngIf="tm.on && !phone"`; `[devices]` — a `TimeMachineDevice` each: its
  name, `detail`, `site`, `charts`, `readingKeys`, `reportInterval` —
  `[alarms]` the live subscription's, `[loading]` the devices' first read,
  `(deviceOpen)`): the timeline beside a card a device shown
  (`tb-time-machine-card`, in the page's order — QC Lab's the table's filters
  and search, by name — its name opening its panel, its state's pill beside
  it when the page gives one (`TimeMachineDevice.status`: live, its list's
  pill; at a picked time its state bar's state then, `stateRunsChange`,
  `stripRunAt` — Aria's Producing / Blackbelt / Stopped / Offline), its
  detail (QC Lab's IMEI) and its site by label and code ("Richmond Lab (4R20)"), its alarm
  count — those active at the picked time (raised by then, not yet cleared:
  `DashboardAlarm.clearTs`, `alarmsActiveAt`), live now's, named in its
  `tbTip` an alarm a line, worst first ("Channel 1 Temperature Alarm ·
  Critical · Today 9:42 AM") — no readings in its header (its charts' title
  rows have them), its chart(s) over the window (a page's charts built
  afresh are kept while their content holds), every card's charts one
  `syncGroup`), a card's charts made as it scrolls into view, its charts not
  hoverable (`[hoverable]="false"`: the bar alone scrubs them); the view
  gone, every chart back to live. **The "Time Machine" switch is never
  saved** — off on every load (a reload, a new visit, an app opened from
  Home: nothing in the URL, local storage or the host's state brings it
  back); "Large charts", "Alarms on top" and the window are kept in the
  user's settings (`<prefix>LargeCharts`, `<prefix>AlarmsFirst`,
  `<prefix>Timeframe`, `<prefix>Range` — QC Lab's `qcLabLargeCharts`, …; an
  older `qcLabMetricsView` is no longer read).
- **ESF units** (Eurotech ESF — Eclipse Kura): the ThingsBoard IoT Gateway
  runs on the ESF unit (Docker, host networking), so the unit is the
  gateway's own device. Its ESF connector (a Request connector,
  `integrations/esf/request-connector.json` = `ESF_CONNECTOR_CONFIG`) points
  at the unit's own REST API (`https://127.0.0.1`) and makes no device; the
  dashboard's calls are connector RPCs to the gateway's device
  (`request_<call>`, `esfRpc`: the gateway hands them to its first Request
  connector, which makes the HTTP call the params give — the URL, method,
  headers and timeouts from the connector's own `serverSideRpc` entry, the
  body as `params.body`). The calls are one catalog, `ESF_CALLS`
  (`models/esf.models.ts`, by the REST permission each needs — the connector
  file is generated from it); `EsfClient` (`models/esf-api.models.ts`, with
  a tolerant parser per API) sends them. **The unit's twin** (reported
  state, as Kapua keeps a Kura unit's: `models/esf-twin.models.ts`): the
  connector's `mapping` polls the unit locally into the gateway device's
  client attributes, a value sent only when it changed (ON_CHANGE, again
  daily) — through the gateway's reserved device name
  `currentThingsBoardGateway` (its own device; the gateway also connects one
  stray device of that name for the tenant): each component's settings
  `esf.cfg.<pid>` (a minute; passwords as ESF gives them, "placeholder") and
  definition `esf.def.<pid>` (an hour), `esf.components` (the pids — what's
  there now), `esf.snapshots`, `esf.cloud.endpoints` / `.pubsub` (with each
  connection's state), `esf.bundles`, `esf.props.framework` / `.kura`
  (`ESF_TWIN_POLLS`; `node scripts/esf-connector.mjs` writes them into the
  connector file; a list ESF gives in another order each read is sent every
  poll — never map one that's large). `EsfClient.call` answers the reads the
  twin covers from it (`ESF_TWIN_READS`, in ESF's own reply shapes — no view
  knows), when the gateway's connector carries the polls
  (`esfTwinEnabled`): at once, and while the gateway is offline; a value not
  reported yet goes to the unit, and every read does for 5.5 minutes after a
  change is sent (`ESF_TWIN_SETTLE_MS` — kept in this browser for the
  gateway, local storage `tbEsfLiveUntil:<gateway id>`, so a reload or
  another tab in that time still reads from the unit, never the twin's
  older copy: a Wire graph applied, then the page reloaded, showed the old
  graph). Live, always: network status (it
  changes on every read), the position, the components with their
  factories, the containers and images, the replies that are a bare list
  (packages, users, keystores, permissions — the connector converts a list
  item by item), the system packages, and every action. Desired state through shared
  attributes (a rule chain's persistent RPC, for an offline unit) is the
  next step, not built. The gateway page's menu is
  Overview, then two groups by their logos (`SectionNavItem.logo`,
  `models/brand-logos.ts`): ThingsBoard — the gateway's Connectors, Logs,
  RPC, Statistics, Alarms, Settings — and ESF (always there), the unit's
  views, each a section of the page (`esf-<view>` in the URL — an older
  `esf` link opens Configuration), in the menu Status, then Device, then the
  rest (`ESF_VIEWS` — the order the others are read ahead in too; Status the
  default), shown by `tb-gm-esf [view]`
  (`gateway-management/components/esf/`) — or, with no ESF connector, "Add
  ESF connector" (only once the gateway's connectors are read,
  `connectorsReadFor`: a placeholder card meanwhile, never that state's
  blip on a reload) (the add-connector panel started from the template, the
  connector form's `[preset]`). The views — Configuration, Snapshots (`tb-gm-esf-snapshots`: the unit's
  snapshots, newest first, "Take snapshot", a row's Rollback — confirmed;
  from ESF 7.6.3 a rollback needs `kura.admin`, ESF's 403 says so), Network
  (the interfaces' status — read with the network configuration, an
  interface it disables (IPv4 and IPv6 Disabled) "Disabled" as in ESF's
  console — a row opens that interface's settings in the
  dashboard's side panel, `tb-gm-esf-interface` (starting from that read), laid out as ESF's own
  console's Network page: the panel's tabs by the interface's type — IPv4,
  IPv6, then Wireless, 802.1x, DHCPv4 & NAT (Wi-Fi), Cellular, GPS, Antenna
  (a modem) or DHCPv4 & NAT (any other but the loopback), Advanced,
  Hardware (its status, read only) — each tab's fields in the console's
  order with its labels, choices and rules: a field greyed out where it
  doesn't apply, a tab that doesn't apply saying when it does, a change
  carrying what the console's does (IPv4 Disabled → Using DHCP, not LAN →
  Router Mode Off); the tabs `models/esf-interface-tabs.models.ts`, checked
  against ESF 7.6.2's console and Kura's web UI source, the form
  `esf-interface-form.models.ts` (`IfForm`: values as text, read from and
  written to `net.interface.<id>.…` with the console's conversions — a
  subnet mask for a prefix, a list one a line for its commas — only the
  changed settings sent); the configuration read once for the gateway; then
  the firewall — one card, IPv4 | IPv6 in its title row, the network
  configuration left out, `[hidePids]`),
  Cloud connections (as ESF's Cloud Connections page: one table — each
  connection, then its publishers and subscribers, each marked by its
  type's icon (a cloud, an arrow up, an arrow down — the column's `iconOf`)
  — Service PID, Type, Status (Disconnected in red, as ESF's), Factory (its
  name — `esfFactoryName` — its PID in the cell's bubble, the user's pick;
  the creation form's picker the name over the PID, `esfFactoryOptions`);
  a row opens its settings in the dashboard's side panel,
  `tb-gm-esf-cloud-panel` — a connection's a tab a stack component,
  CloudService / DataService / MqttDataTransport / …, read ahead: the
  stacks, then every component's settings, one at a time while the unit
  is quiet (`EsfClient.idle$`), kept for the panel (`EsfCloudOpen.configs`
  — a row opens on them at once, reading only what's missing), read again
  after a refresh or a change; under the
  component's own tab its Manage card, a connection's Connect / Disconnect
  and its Delete, a publisher's / subscriber's Delete; "Create
  new" a connection or a publisher / subscriber from the unit's factories,
  its PID checked against the factory's pattern; Manage's "Delete (n)",
  confirmed — `models/esf-cloud.models.ts`), Software (its tabs across its top — the charts' picker look, each its
  text's width —
  Packages | Bundles | Containers | Images | System packages, one section
  shown at a time, the system packages read when their tab first opens;
  Packages its "Install a package" card over its table — Source URL | File
  (`tb-button-group`): a URL ESF fetches (a path on the unit sent as a
  `file:` one), or a `.dp` of this computer's (`tb-file-field`; its
  manifest read in the browser — its name and version under the field, a
  bundle or a non-package refused before anything is sent — at most 32 MB,
  `ESF_UPLOAD_MAX_BYTES`) with the command service's password: ESF's own
  upload is a multipart POST the gateway's Request connector can't carry
  (it sends a body as text), so the file goes through Command v1 —
  `EsfPackageUpload` (`models/esf-upload.models.ts`): a folder of its own
  under /tmp, then the file in 64 KB pieces (`ESF_UPLOAD_PIECE_BYTES` —
  87 KB as base64: far under the MQTT limit even if the connector echoes a
  failed request whole into its error reply and log), each a one-file
  stored zip as `zipBytes`, which ESF unzips into the working directory
  before running the command in a shell — `dd … seek=<n> conv=notrunc`,
  so a piece sent again (a timeout's one retry) changes nothing — its size
  and SHA-256 checked, then `_install` from its `file:` URL; ESF moves the
  file into its packages folder, so the file gone is the install done
  (waited for up to 2 minutes, `ESF_UPLOAD_INSTALL_WAIT_MS`), the folder
  removed after, whatever happened (but while ESF may still be installing
  from it). Install's running words "Uploading... 3 / 12", "Checking...",
  "Installing..."; Cancel beside it until ESF is asked; a wrong password
  (ESF's 400) or the service off (503) said plainly; Bundles every row
  on one page, `[paginated]="false"`, the user's pick; Containers and
  Images only while ESF's Container Orchestration is on — found off, it's
  checked again as the view shows again (`[shown]`) or either tab is
  picked, so turning it on in Configuration brings them without a reload;
  each a Refresh at its foot; a container's "Framework managed" — ESF's
  console's — Yes when ESF runs it, a Container Instance component of its
  name (`esfComponentFactories`, `pidsWithFactory`: the inventory's
  containers don't say), No when started outside it, the gateway's own),
  Status (as ESF's
  Status page — `tb-gm-esf-status`: Cloud Services, the Cellular / Ethernet
  / Wireless Settings an interface each, Position Status — the position read
  only with a GNSS lock (`esfPositionLocked` first: without one ESF answers
  the position 500, an ERROR line in the gateway's log at every load) —
  Tamper Detection Status — a unit without a tamper detection service
  (`tamper/v1/list` 404: dev-inf-gw-01, dev-nb-gw-03) remembered in this
  browser by the gateway's id, not asked again, its card saying so with
  "Check again"; a refusal's status read from gateway 3.8.6's error text
  too, "Not Found (code: 404)", `esfUnwrap`), Device (as ESF's Device page — `tb-gm-esf-system`, its tabs across its
  top in the charts' picker look, `tb-timeframe-picker` sized to their text: Profile | Framework properties | ESF properties |
  Security; the Profile its Device,
  Hardware, Software and Java Information from the framework properties,
  the cards stacked, each value beside its label, the client id and the
  serial number in copy boxes; the framework's and ESF's
  properties a Name | Value table each, searchable, every row on one page
  (`[paginated]="false"`, the user's pick: the view scrolls) — ESF's arrive wrapped in
  one `kuraProperties` object, `parseEsfProperties` opens it; Security; an
  older `esf-system` link opens it),
  Security (as ESF's Security page — `tb-gm-esf-security`, its tabs across
  its top in the charts' picker look, sized to their text — always the same
  seven, `ESF_SECURITY_TABS`, shown at once, nothing read for them (the
  user's pick: every unit's ESF has them); what each holds is the unit's,
  wireframed until its components are read (an instances table's rows, a
  settings tab's card), a tab it has nothing of saying so: Certificates — every keystore's certificates and keys,
  read only, searchable, a Refresh, the keystore by its name (a class-named
  one's words, "Crypto Service", its PID in the bubble and searched; one
  named by hand, "SSLKeystore", as it is) — ESF failing the whole read
  (one keystore it can't open fails it for all, 500: a PKCS11 module whose
  library isn't on the unit), each keystore read apart
  (`esfKeystoreEntriesOf`, the unit's keystore instances and ESF's
  CryptoService), the others listed and a warning naming the unread ones,
  "Open Keystores" (Keystores v1 `esfKeystoreEntries`,
  `rest.keystores` on the gateway's ESF user: refused, a callout says
  which permission) — then SSL and Keystores, a factory's instances as
  ESF lists them (a table — Service PID, Factory by name, its PID in the
  bubble — a row opening its settings in the side panel: `componentOpen`,
  the gateway page's ESF component panel, `EsfComponentOpen`, the shared
  settings form inside — laid out by hand, `esf-layouts.models.ts` by the
  definition's id (an SSL manager: Keystores — its keystore and truststore
  picks — TLS — Protocol TLSv1.2 | TLSv1.3 | JVM default, Verify hostname,
  Cipher suites one a line — and Revocation check, its switch folding open
  Mode, OCSP first | CRLs first | CRLs only, and Soft fail; a filesystem
  keystore: Keystore — path, password, Randomize password — and CRL
  management, its switch folding open the CRL URLs one a line, "Update
  every" and "Check every" each a number beside its unit's select, the
  store path, Verify CRLs; a PKCS11 keystore: PKCS11 module — library
  path, PIN, Slot, Slot list index — Provider — enabled and disabled
  mechanisms one a line (saved space-separated, `separator`), attributes —
  and the same CRL management, its empty store path a file in ESF's
  security folder): `EsfForm` names and arranges ESF's own
  settings into `cards` — a layout's label, note, options, button group,
  one-a-line list (saved with its separator), a number's unit setting beside it —
  a setting a layout doesn't place (a newer ESF's) in an "Other settings"
  card, never hidden; "Create new | Manage" — ESF's New / Delete:
  a new instance's form in the side panel, `tb-gm-esf-instance-create`
  (its factory — the unit's that make them, `esfFactoryComponents` — and
  its PID, checked: `esfInstancePidError`), made with its defaults and a
  snapshot (`esfCreateFactoryComponent`), the panel then on its settings;
  Manage's "Delete (n)" confirmed, `esfDeleteFactoryComponents`, a
  snapshot taken; its table there even with no instance yet), then HTTP service, Web console, Network threats
  (flooding protection, Fail2ban) and Tamper detection, each its
  components' settings in place, `tb-gm-esf-settings picker="fixed"
  [components]` (several — flooding protection and Fail2ban, the tamper
  detection services — one form: a card each, one under another, one
  Apply for all of them, one update and one snapshot, `esfUpdateManyRequest`),
  each tab made when first opened — `esf-security.models.ts`:
  `esfSecuritySections`, each tab's components by pid or factory from
  `esfComponentFactories`; the Configuration list leaves them out,
  `esfSecurityPids`),
  Users (as ESF's Identities page: a table, a row opening the user in the
  dashboard's side panel — `tb-gm-esf-user`: a new one's name, its
  Password (authentication and a change at next login as checkboxes, a new
  password and its confirmation), its Permissions ticked (`tb-filter-list [field]`), its
  Delete card — "Create new" a new one there, Manage's "Delete (n)"),
  Command, Drivers and assets (as ESF's Drivers and Assets page,
  `tb-gm-esf-assets`, Configuration v2 — `esf-drivers.models.ts`: a driver
  an instance of a driver factory, `…driver.modbus`, `…opcua`, an asset of
  the Wire asset factory naming its `driver.pid`; an older `esf-assets`
  link opens it): one table, each driver by its kind ("Modbus", "OPC UA" —
  `esfDriverTypeName`, its factory PID in the bubble) with its assets under
  it (`treeParentKey`: each its channels' count and description; an asset
  whose driver the unit hasn't at the top, "Asset · no driver"); a row
  picked shows it under the table, as ESF's page does (named over it,
  "modbus · Modbus driver"; the table itself hugging its rows,
  `[fitPageSize]`): a driver its settings (the shared form,
  `picker="fixed"`); an asset `tb-gm-esf-asset-editor` — its channels'
  table (Configuration) or its values' (Data), each the shared
  `tb-data-table` at the form width (wider than that, it scrolls sideways
  in its card), Configuration | Data in the table's header corner
  (`dt-header-actions`; the values' table takes it projected,
  `[data-header]`). Configuration: a row a channel, a column a setting —
  the ones its driver gives its channels, so they change with the driver:
  every channel's, `+enabled` … `+listen`, then its driver's — drawn by
  the table's `tbDataTableCell="*"` (the template for every column without
  its own: these are only known at run time) — Enabled first, then the
  name, then the rest (as ESF's console) — each cell its control,
  `tb-gm-esf-cell` (checkbox, compact floating select or number box,
  the cell text box), each column given a least width — its control's (a
  select's longest option, a number's five digits and unit, measured) or its
  header's, whichever is wider (`leastWidth` → `DataTableColumn.minWidth`):
  a control takes its cell's width, so no control carries a least width of
  its own; headers `esfChannelLabel`; fewer columns to start — `DEFAULT_HIDDEN`: scale,
  offset, unit, a listen's details — "Columns (n/m)" at its foot folding
  open a card of a box a column, "Default columns", the pick kept by
  driver kind this session; "Create new" at its foot adding a row (its
  name editable until applied, `esfChannelNameError`; its settings from
  ESF's defaults, their shape an existing channel's — this asset's first,
  or, it has none, another asset's of a driver of the same kind; neither:
  it says why); a row's click picks it (lit — the tint and a brand-accent
  bar down its left edge, the control grid's pick) and Delete beside Create new
  (off until one is) takes it out — a new one dropped, one the asset has
  off the grid and deleted in the draft: Apply sends each of its settings
  with a null value, which ESF's configuration update drops (Kura's
  `DTOUtil` keeps the null, its dictionary leaves it out — an update merges
  with what the asset has, so a setting left out stays; tried on
  dev-inf-gw-01, 19 November 2026: a channel deleted, the other kept), then its own settings (the laid-out form, one Asset card:
  its description, then Timestamps — a radio row, each option explained —
  and the emit switches — its channels
  and its driver left out, `EsfLayout.exclude`: ESF doesn't let an asset's
  driver change, so it's only named, over the asset), one "Apply changes"
  for all of it (the changed
  settings, `EsfForm.changes`, and each new channel whole under its name,
  `EsfForm.values` — ESF adds a channel it's sent whole). Data: as ESF's —
  each channel's name, mode, value type, value as read, a box to type a
  writable one's (checked by its type); "Read" (and when), "Write" every
  value typed in one request (the Assets REST API, `tb-gm-esf-asset-data`).
  "Create new" a driver (its kind) or an asset
  (its driver — made with its `driver.pid`, `esfCreateAssetRequest`) in
  the side panel's create form (Driver | Asset, `EsfComponentOpen.drivers`),
  the new one then picked; Manage's
  "Delete (n)" confirmed (an asset of a driver deleted named), Refresh. An
  asset's settings run 5–6 KB a channel (measured: OPC UA 6.2, J1939 6.0
  — rmx-61016-gw-01's mixer, 27 channels, a 167,253-byte reply — GPIO 4.8,
  Modbus 4.7): one past `ESF_ASSET_READ_MAX_CHANNELS` (30 — under the
  limit even at 8 KB a channel) is never read whole (nor a channel
  added past it) — the table counts its channels with the Assets REST API,
  its Configuration says why (ThingsBoard's MQTT limit, 262,144 bytes on ours, would close the
  gateway's session), Wire graph (the graph drawn, a component's settings
  under it — see below) — each made
  when it's first opened, the others read ahead in the background one at a
  time once the unit is quiet (`EsfClient.idle$`), and kept: switching back,
  or back from the gateway's other sections, shows a view at once, nothing
  read again (its Refresh or an action does; another gateway lets them go);
  a destructive action confirmed in the dashboard's dialog (`EsfConfirm`);
  **a change done — applied, made, deleted, connected, rolled back, written,
  installed — toasts "Settings applied" and nothing else, in every ESF view
  and panel (never what or how many); a failure toasts ESF's reason**. The Configuration view is `tb-gm-esf-settings`
  (`components/esf-settings/`, its `[api]` Configuration v2 or Network
  Configuration v1): one of the unit's components picked (Configuration's
  dozens — less those another ESF view shows, read from the unit with the
  list: the Network view's (the network configuration v1 API's components)
  the Cloud connections view's (each connection, its stack, its
  publishers / subscribers), the Security view's, the Drivers and
  assets view's (`esfDriverAssetPids`) and the Wire graph view's (the Wire
  Graph Service and its graph's components) — `[hideShownElsewhere]`; a refused read
  leaves nothing out; "Open in Configuration" still opens any — in a
  Services list on the right, outside the form (the form at
  `card.$narrow-page-width`, as every form, the list's 260px beside it;
  the user's pick) — a
  `tb-card` sticky while the settings scroll, as tall as the page's
  scrolling area (`--es-nav-max`, measured), its search, a `tb-section-nav`
  of each service by name and icon (`esfServiceName`: its class's words
  apart, an instance named by hand its pid; `esfServiceIcon`; a product's
  mark in its place, `esfServiceLogo`: Ansible's for the Ansible services,
  Docker's for the container services and each Container Instance, told
  by its factory from the cached `componentFactories()`), the one
  picked lit — its settings to its left; a phone: a searchable select over
  them, each by name over its pid; Network's firewalls,
  `[picker]="'buttons'"`, the firewall card alone — IPv4 | IPv6 in its title
  row), its settings a form built from ESF's own
  definition (`EsfForm`, `models/esf-form.models.ts`, each field a
  `tb-gm-esf-field` — the interface panel's too; a setting ESF lists twice
  shown once; a one-value setting's default read as ESF makes a component
  with it — Kura's `StringUtil.splitValues`, its first value: a backslash
  keeps the character after it (`\,` a comma, `\\` a backslash, `\n` an
  `n`), an unescaped comma ends it, unescaped whitespace at its ends —
  line breaks too — dropped (`metatypeDefault`: a new component's form
  starts from it — a GraalVM™ filter's default script is no JavaScript
  until it's read so);
  each labelled by its name — never a dotted id: where ESF
  gives only the id ("clock.ntp.host", "Broker-url"), it's written out in
  ESF's own names' title case ("RTC File Name"), less the leading parts
  repeating the component's name, the card's title ("NTP Host", "Broker
  URL") — `esfSettingLabel`, `esf-notes.models.ts`: `ESF_WORDS` its
  acronyms and abbreviations ("QoS", "IPv4", "hwclock" → "Hardware Clock",
  the service names' too), a device's name kept ("eth0", "3-1.1"), a Wire
  asset's channel before a "·", `CURATED_LABELS` the few that still say
  little (Fail2Ban's "Protect SSH", flooding's "Protect IPv4"); two that
  would read alike, in full; a setting naming another of the unit's
  services — an OSGi reference's target, its id "<Reference>.target", its
  value "(kura.service.pid=SSLKeystore)": the SSL manager's keystores, the
  HTTP service's keystore, a transport's or the console's SSL manager, a
  log manager's or the diagnostics' cloud publishers — a select of the
  unit's services of that type, its value the filter naming the one
  picked (`esf-targets.models.ts`: the type from the reference's name — a
  publisher, a subscriber, a keystore of any kind, a data transport, else
  its name — matched against each component's factory class from
  `pidsWithFactory`, read once a gateway and shared,
  `EsfClient.componentFactories`, the Security view forgetting it as it
  reads its tables again; a class-named service by its name over its pid,
  one named by hand by its pid over its factory's name; the one set now
  kept, "Not on this unit", if missing; any other filter, or the services
  unread, stays text)) (a GraalVM™ script — a Filter Component's `script`,
  a Conditional Component's `condition`, `esfScriptKindOf` — ThingsBoard's
  script editor, `tb-js-func` (JavaScript highlighting, its worker's syntax
  marks, Tidy — js-beautify — inside its box at its top right, no full
  screen; in a `tb-resize-box`, 640px to start (`startHeight`, down to 240),
  its height dragged at its foot — the box's grip held at the edge of what
  scrolls round it scrolls on, the box following; its label, brackets,
  undefined check and own validation off — ESF's own default script sets an
  implicit global; its worker told ESF's style is fine: no semicolons,
  `new Array()` / `new Object()`, `map['key']` — JSHint's `asi`, W009,
  W010, W069 —
  and the checks' marks put in its gutter beside the worker's —
  `tbScriptEditor [marks]`, `code-editor/script-editor.directive.ts`),
  ESF's completions alone (`tbScriptEditor [completers]` — Ace's snippets
  and its words of the text out; `ESF_SCRIPT_COMPLETER`, by what's before
  the word: after `input.` the envelope's methods, after `logger.` slf4j's,
  after any other `.` a record's, a TypedValue's and an array's, elsewhere
  ESF's bindings and helpers, the DataType names, the script's own names
  and JavaScript's words), dressed as
  the forms' code editor
  (`code-editor.tb-script-editor`, the JSON editor's look — the gutter's
  colour only, never the background shorthand, which wiped Ace's mark on
  the active line; the selected text's other occurrences (Ace marks the
  selection's own too) a hairline of the accent, no fill — never Ace's
  near-white box, which left the light text unreadable under the
  selection; the bracket matching the caret's a faint tint of the
  brand accent with a hairline of it on the character's own cell, never
  Ace's grey box a pixel up and left of it; the worker's errors left out, `[ownSyntax]` — its
  guesses, "Missing ';' before statement" — ours in their place), and at
  its card's top its status — the card's only note: no info icons in it,
  its title's or its settings' — a title alone, always there, so nothing moves
  (`EsfForm.scriptStatus`: "No problems", else the worst issue and its line,
  "Syntax error on line 21" — no text, no bubble; every issue marked in the
  gutter, one without a line on line 1; checked once a value;
  `esfScriptIssues`,
  `models/esf-script.models.ts`, from Kura's `EngineProvider`: a syntax
  error — its line and a plain message: a quote never closed, a bracket out
  of place, else the first line the browser's parse fails at for a reason
  other than the end ("Unexpected "bbbbb" after "getType())"" — what
  and where alone, never a guess at the cause) — a top-level `let` / `const` / `class` — the context is kept across
  runs, so the second run fails "already declared" — a `let` / `const`
  `output`, output as one record, a helper ESF doesn't bind, Java class
  access, `exit` / `quit`, a `logger` method slf4j hasn't — errors, which
  hold Apply; output never started anew, emitting nothing, `console` —
  warnings; a carriage return alone a line break, as ESF's own script
  has them) (a Regex Filter's pattern, `regex.filter` — a Java regular
  expression matched whole against each property's name; one Java can't
  compile and ESF filters nothing, passing every envelope through — is
  checked as Java's `Pattern` reads it, `esfJavaRegexError`
  (`models/esf-regex.models.ts`: its escapes, its classes — nested, a `]`
  first one the character itself, a range in order — its `{n,m}`, its
  group names and flags read as Java does, then its groups and repeats by
  the browser's parser on the pattern reduced to them; checked against
  Java 17's `Pattern.compile`, a `\p{…}` property's name aside): what's
  wrong under the field in plain words, "A ( never closed", "A { that
  isn't a repetition like {2} …", and Apply held; empty is ESF's default,
  allowed — and, in the Wire graph, one that matches none of the
  properties reaching it warned of under it in the warning tone, Apply not
  held (`EsfForm.warningOf`, `form.tb-form-fields`' `-warning` line:
  "Matches none of the properties it receives: TIMER" — its RETAIN would
  emit empty records, its REMOVE take nothing out): what reaches it is
  `esfWirePropertiesInto` (`esf-wires.models.ts`), only where every source
  wired into it is known — a Timer's `TIMER`, an asset's (`esfAssetEmits`,
  Kura's `WireAsset`: each channel it reads by its name, with
  `_timestamp`, `_unit`, `_error`, and `assetName`, `assetTimestamp` —
  its channels from the Assets REST API, read with its editor), a FIFO's
  what reaches it; any other source, or nothing wired, says nothing — and
  matched by the pattern as the browser's (`esfJavaRegexToJs`, whole as
  Java's `matches()`; an inline flag for the whole pattern, a possessive
  repeat greedy — never matching less than Java's, so it never warns of
  one that matches; Java's own classes, `\p{…}`, comments mode: no
  warning)) (true / false a checkbox with its name beside it — see "True
  / false in a form" — a select of its options,
  a number in its bounds, its unit inside its box (`esfUnit`, `esf-notes.models.ts`: the cloud stack's known ones by id — keep-alive and timeouts in s, store capacity in messages, max payload in bytes — else the first its name or description gives; the label then without its "(seconds)"), text, a password left empty — "Unchanged" — a
  list as comma-separated values; its description in the label's info
  bubble, short — `esfShortNote`, `models/esf-notes.models.ts`: none where
  it only says the setting's name again or its default; else a line written
  for it (`CURATED`, by a phrase of ESF's text) or the first of its opening
  sentences that says something, its filler cut (`REWRITES`: "Specifies
  the", "If set to true,", "(default: …)", "see … for details"), 120
  characters at most, ended at a clause — never cut with "…"; the
  interface and firewall forms' hand-written notes the same, a field
  whose name says it having none), "Apply changes" sending only
  the changed settings with a snapshot taken (`takeSnapshot`). A firewall
  component (`FirewallConfigurationService`, its IPv6 twin) shows its rules
  as `tb-gm-esf-firewall` (`components/esf-firewall/`): one card, its title
  row's pickers (`tb-timeframe-picker`'s look) — the firewall, IPv4 | IPv6
  (`[components]`), then Open ports | Port forwarding | NAT — over a table
  of the rules picked; "Create new", or a row, opens the rule's form in the
  dashboard's side panel (`tb-gm-esf-firewall-rule`, `EsfFirewallRuleOpen`
  up through the views — ESF's entry forms: its field names and help, its
  checks, a permitted or an unpermitted interface), its "Add" / "Save"
  putting it in the draft; Manage's "Delete (n)" takes rules out — all
  changing the form's draft (Kura's rule strings,
  `models/esf-firewall.models.ts`), sent with its "Apply changes". The
  **Wire graph** is its own ESF view (`esf-wires`, `tb-gm-esf-wires`,
  `components/esf/esf-wires/`, last in the menu): the Wire Graph Service
  (`org.eclipse.kura.wire.graph.WireGraphService`, its one setting
  `WireGraph` — Kura's JSON of the Wire components, their ports and
  composer positions, and the wires, `models/esf-wires.models.ts`) drawn
  as `tb-gm-esf-wire-graph` (`components/esf-wire-graph/`):
  each component a box (its mark by what it does, `esfWireIcon`: a Timer's
  clock, a store's database, a query's search, the math components' signs,
  a GraalVM™ filter's `code`, a Conditional's fork) where ESF's Wires
  composer placed it — ESF's
  drawing at ESF's own size (`WIRE_SCALE` 1, from Kura's
  `wires_composer.js`: a box 120 × 40 at its place, its top left, corners
  6; ports each in the middle of its share of a side; every move on a grid
  of 20): our box 120 × 40 (its mark, name and kind compact), the places,
  the canvas' dots and a drag's snap ESF's grid (`WIRE_GRID` — `PanZoom`'s
  `grid`), fitted never past 1:1 as ESF's, so a graph shows on its canvas
  as ESF shows it and a box snapped here lands on ESF's grid
  (`layoutWireGraph`) — its icon
  and name, its factory's name under it (`pidsWithFactory`), its input
  ports on its left, its outputs on its right, filled in the brand accent
  (a port's name beside it; no bubble on a box) —
  each wire from an output port to an input port as ESF's composer draws
  it (JointJS's metro router, rounded — `wireRoute`, measured on ESF's
  composer, every size ESF's × `WIRE_SCALE`): from the output port, its
  first bend 25 from the port's centre, at 45° to the receiver's row,
  straight into the input port (its last bend 29 from the centre); with less room across than down, at
  45° across all of it, then straight up or down, then a square turn into
  the port; back to a box on its left, along a lane between or under the
  boxes; taken round the boxes in its way, as the metro router steers
  round the composer's other components — none of its stretches within
  `WIRE_CLEARANCE` (8) of a box but its own two, out of and into their
  ports, else along a lane `WIRE_DETOUR` (20) above or below what's in its
  way, at 45° out to it and back, the shorter that's clear (`routeAround`
  — a wire to a box further along a row never runs through the boxes
  between, its line past their arrowheads and out of their far sides);
  its bends rounded at 10, 4 thick (`WIRE_WIDTH`, set on each path);
  the ports filled dots, 10 across (`WIRE_PORT_RADIUS` — smaller than
  ESF's 9, which drew large on our boxes; each centred on the box's outer
  edge — placed from inside its border, so the border's width taken back,
  `$box-border`, else every arrow tip falls a pixel short; the wires from and to their
  edges, their bends where ESF's are), centred on the box's sides; the
  neutral slate (`--c-text-neutral-semilight`), its arrowhead the same
  slate, ESF's sharp filled triangle, no outline (`WIRE_HEAD` long — the line stops at its base, its
  tip on the receiver's port) — the one picked in the brand accent; on the
  map canvas (the shared `PanZoom`, as the fuel code's Assignment tree;
  ESF's canvas' proportions, 1292 × 872, 480–900px tall, a phone's 420 —
  `esf.wire-canvas-size`; its first read wireframed in the view's own
  shape: the graph's card, its canvas at that size with a few boxes, the
  palette's list beside it; zoomed by its buttons alone, `buttonZoom` —
  the wheel scrolls the page),
  its controls Show all, zoom in, zoom out; its title with no info icon;
  Download | Refresh | Delete component | Delete graph in the card's title
  row (Delete component — "Delete wire" while a wire is picked — off until
  a box or a wire is) (`tb-collapsible-card`'s `[card-actions]`,
  the graph's `[wg-actions]`), the draft's Cancel | Apply changes at its
  bottom right in the same links' look (`[wg-foot]`) — the one Cancel |
  Apply for everything, the graph and every component's settings edited
  under it (no buttons of their own: `tb-gm-esf-settings [draft]`,
  `tb-gm-esf-asset-editor [embedded]`), as ESF's composer applies a graph
  and its components together: the graph put when it's changed, then the
  settings in one update (`esfUpdateManyRequest`) — off until something's
  edited, "Applying..." with the running dots while it's sent
  (`button.tb-trailing-dots`; Delete graph's "Deleting..." the same) — no
  counts. A box's click lights it (the
  brand tint) and shows that component's settings under the graph, as ESF's
  console does — every component's settings read once as the graph is
  shown, one at a time, the one picked first (`preloadSettings`: a
  click reads nothing), kept as forms (`unitForms`) while another is
  picked; an asset the unit has as the Drivers and assets view shows it
  (`tb-gm-esf-asset-editor [embedded]`: its channels' table,
  Configuration | Data, then its own settings; its driver's kind, the
  templates and its channels' count read with the rest; each asset's
  editor kept, hidden while another is picked) — a click on the canvas
  itself (not a pan's end) lets it go — `tb-gm-esf-settings picker="fixed" [wide]` on its pid,
  across the view (the user's pick, as the graph — its notes too), titled
  "Timer · OPC_Timer" (its kind's name, then its pid), its own Apply.
  Edited as ESF's Wires composer (WIRE-V1, `rest.wires.admin` — the
  gateway's ESF user needs it; without it the kinds' read is refused and
  the graph stays read only, saying why): the palette beside the graph
  ("Wire components", 260px) — the kinds by their ports (`esfWireFactories`,
  then `esfWireDefinitions` six at a time — the gateway's reply unwrapped,
  `esfObject`; Emitters, Receivers, Emitters and receivers — `esfWireRole`,
  each kind by ESF's palette name, "H2 DB Store (Deprecated)",
  `esfWireKindName`, and its group's arrow, `ESF_WIRE_ROLE_ICONS`; the
  WireAsset kind too) and the unit's assets not in the graph — as tall as
  the graph's card, its list scrolling (`tb-collapsible-card [fill]
  [scroll]`, absolute in its stretched grid cell); a kind dragged onto the
  canvas (as ThingsBoard's rule chain editor's nodes — native drag and
  drop, `WIRE_DRAG_TYPE`; the canvas lit while it's over it; the box
  centred on the drop, on the grid, the view kept — `componentDrop`) or
  clicked asks its component's name in the dashboard's dialog (the page's ESF confirm,
  `EsfConfirm.content` — the view's template — `form`, `confirmDisabled`,
  Enter adding it: `closed`) (a pid: letters, digits, `_ - .`; unique) — a
  WireAsset its driver too, a select of the unit's drivers (made with its
  `driver.pid`) — then puts it where it was dropped (clicked: right of the
  rightmost box), picked: its
  settings under the graph at once, as ESF's composer shows them, from its
  kind's definition (`componentOCD`, each setting at its default —
  `esfNewWireConfig`; a WireAsset's by the asset layout), edited before
  Apply (`tb-gm-esf-settings [draft]`: no Apply of its own), what's changed
  sent with the graph (`esfWireUpdateBody`'s settings); on the canvas a box
  dragged moves in steps of the canvas' grid, on its dots, as ESF's
  composer's boxes snap (`PAN_ZOOM_GRID`; the layout's origin on the grid
  too; its place mapped back to the composer's, `wireLayoutToGraph`; the
  layout's spread kept while edited — `layoutKey` lays out afresh — and the
  view held still: an edit laid out with another origin, a box past the
  left or top edge, moves the view the other way, `PanZoom.offset`, never
  re-centred); a drag from an output port to another box's input port
  draws a wire (`addEsfWire`; the wire — solid, as every wire — following
  the pointer, snapped to the grid, pulled onto an input port near it — let
  go there, it's made — the targets lit; let go elsewhere, or Escape, drops
  it); what's picked, a box or a wire (a wire's click), the title row's
  Delete component takes out of the draft — a box once confirmed (the
  dashboard's dialog, saying what applying does to it: deleted from the
  unit, an asset only leaving the graph, ESF keeping it, a new one never
  made), a wire at once — Delete / Backspace the same; a wire hovered
  lightens and shows a ✕ halfway along it (ESF's composer's remove tool —
  halfway, as wires fanning out of one port share their start), its click
  deleting the wire at once. Every edit is a
  draft: "Apply changes" puts it in one call (`esfWireUpdate`, `PUT
  …/wire/v1/graph/snapshot`, all or nothing — `esfWireUpdateBody`: the Wire
  Graph Service's `WireGraph` and each new component by its
  `service.factoryPid`, ESF making it with its defaults; components already
  there never sent: merged, not replaced — and never a password ESF only
  gave as "placeholder"; ESF answers an empty body and takes a snapshot).
  **ESF deletes every component the put graph no longer holds — but an
  asset**, which stays in Drivers and assets with its channels — the box's
  Delete component said so as it was confirmed, so Apply asks nothing
  again (the user's pick: no second confirm). Applied, the graph is
  read again quietly (`load({ keep })`): the view as the viewer has it —
  its place, its zoom, what's picked, never laid out or fitted afresh — the
  forms kept, what they hold now their saved state (`EsfForm.markSaved`),
  a new component's form one of the unit's; only what's missing read (the
  components new to the unit) and the assets whose edits went (their
  editors read again). Refresh and another gateway read it all afresh.
  Cancel goes back to the unit's; Download (the graph and its components'
  settings, `{ configs }`, read one at a time — never one RPC near the MQTT
  limit) and Delete graph (confirmed: `esfWireDeleteGraph`, its components
  deleted — whether ESF keeps its assets there too isn't tried) under it.
  Tried on dev-inf-gw-01 (18 November 2026): the kinds read (15, three
  batches ≤ 10 KB), a Timer and a Logger made and wired, then taken out
  (deleted); a WireAsset made with its driver (`modbus`), then taken out —
  kept on the unit, deleted by hand — the unit's graph as before.
  Configuration leaves out the Wire Graph Service and the graph's
  components (`[hideShownElsewhere]`), unless the graph can't be read —
  then the service stays, its `WireGraph` text the field to fix it in (the
  same drawing shows there when it does open, "Open in Configuration").
  Never read every configuration at once through an RPC (its reply must
  fit ThingsBoard's MQTT payload limit): the component list, then one
  component — the twin's poll reads them whole on the unit itself, each
  component then its own attribute.
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
  `tb-filter-list` (its list capped at 280px; while it hides rows, an
  expand button at its footer's right — Select all, Reset, then it — opens
  it: in a sidebar's `tb-filter-sections` the other filters hide (the
  "Hide empty filters" box too; its own section's heading stays — the list
  marks its way up, `data-tbfss-chain`, filter-sections.component.scss
  hides the rest) and the list takes its content's height, up to what the
  filters column holds — shortened by as much as the column would overflow,
  scrolling inside past that, refitted as the column resizes (`fitOpenList`)
  — and the button again brings them back; elsewhere (a form's plants) it
  shows whole, the column scrolling instead — on a phone always whole, no
  button: no scroll inside the sheet's),
  `tb-check-filter` (a short checkbox group with a heading),
  `tb-filter-section` (divider + folding heading around any sidebar filter),
  `tb-collapsible-section` (a folding section inside a card; a settings
  card's sections that always show — a station's pumps, "Pump 1" — are
  `tb-setting-section`, its heading fixed; `form.tb-section-divider` between
  them), the Organization's product lines /
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
  whole list overflows a script's 100k input); deleting, a group's user
  group goes first and its entity groups only once it's gone — both at
  once raced, ThingsBoard refusing the user group, "Unable to delete
  non-existent group permission"; the chain doesn't prune the owner's
  `accessBlocks` index of them — harmless, the next index write does), made when the item is created (which moves it
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
  it), then "Plants", a `tb-filter-list` tree in the form's card (`plantTreeOptions`, the fuel code forms' too) ("Search",
  `[treeToggle]="true"`, no counts): "All plants" › each market by its name
  › its plants (`siteOptionLabel` · their product line's code: "Richmond Lab
  (4R20) · RMX"; plants with no market under "No market") — plant ids only,
  a parent's box ticking or clearing its plants — and under it, in the
  hint's style, how many are ticked ("9 of 32 plants selected"); editing,
  its "Access groups" (the hand-made groups whose scope's plants are all
  ticked); adding, its "Sign-in" (`tb-button-group`: Google — the default:
  the account activated as it's made, `AccessStore.activateAccount` (its
  activation token, a random password no one is given, as ThingsBoard
  activates the users its Google sign-in makes — Google sign-in never
  activates an account, and ThingsBoard renews a session only for an
  activated one) — or Password: the activation email, else its link). A
  never-activated user's panel offers Activate (the same), and "Log in as
  user" for any user the viewer may impersonate, activated or not — a
  Tenant scope user too (PE lets a tenant administrator log in as another
  tenant administrator or tenant user), never themself — (as ThingsBoard's
  own Users page); the tables show such a user "Not
  activated", never "Disabled" (ThingsBoard keeps a new account off until
  it's activated). The picks become default groups of the role
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
  login, activation and sign-in read from their own record (the listings
  can carry older ones — an account activated still listed "not activated");
  a group's Members tab only shows its users — a view-only
  `tb-detail-table`, by role; the group form picks a scope with the shared
  `tb-access-scope-picker` and shows under the level what it may do,
  `tb-access-level-actions` (a role's actions; `[editable]` in the role
  form); **every user lands on the default home (Home), full screen, its
  toolbar shown, written at creation and sync, with no "Opens on"** (a user
  whose record still hides the toolbar is rewritten at "Sync all") — no user, group or role picks
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
  "1D | 1W | 1M" picker for every chart and table — a page's sidebar window
  `TB_WINDOW_TIMEFRAME_OPTIONS`, 1D | 3D | 1W | 2W | 1M: the fuel Activity and
  Reports pages', QC Lab's cards; `customRange` adds a
  calendar segment that opens `tb-date-range-picker`, placed in the dashboard
  root, or the dashboard's `tb-date-picker-host` — `findDatePickerHost(anchor).toggle(…)`), `tb-time-machine` and a page's Time Machine view — `TimeMachineState`, `tb-time-machine-switches`, `tb-time-machine-picker`, `tb-time-machine-view` (see "Time Machine"), …) instead of re-building
  them in a dashboard.
- **Product line, market, site / plant columns:** in every table, each by
  its asset name (its code: "RMX", "4R20"), its label in the dashboards'
  bubble on hover (`tooltipKey` / `tooltipOf` on the column; empty when
  the label is the code), sorting by the code, both searchable. A list
  (a user's plants) past three shows its first three by code and how many
  more ("4B01, 4B02, 4B04 +7"), the whole list in the bubble, each by its
  label and code (searched with the cell).
  In every filter box, a market and a product line show by their name too
  ("GVA", "RMX"); a site by its label with its code ("Richmond Lab (4R20)"),
  and a list grouped by site the same — its group rows and its rows'
  values (`siteLocationLabel`; "Richmond Lab (4R20) (12)"); a picker's (every product line select, a tag picker) product line by its own
  name alone ("AAT" — never the lines above it, `productLineOptions`).
  Every sidebar's Site filter is the user form's plant tree, built by
  `siteFilterTree` (`organization.models.ts`; `countSiteTree` recounts it,
  `siteTreeIds` its sites): `tb-filter-section heading="Site"` around
  `tb-filter-list [treeToggle]="true"` ("No sites"; its "Tree grouping"
  off to start — its sites flat by name; a form's plant tree, `[field]`,
  starts grouped) — "All sites" › each market › its plants, "Richmond Lab (4R20)" (no product line: its Product
  line filter has them) — a plant counting its rows under the other
  filters, a market and the root the sum of theirs (rows at several sites
  — a user's plants — once a branch: `countSiteTreeOnce`); it picks site ids alone
  (a market's box: its sites). Never a Market filter beside it, nor a site
  list or Market › Site tree of a page's own (the Gateways page's, QC
  Lab's, the fuel dashboard's Stations, Codes, Activity and Reports pages',
  Aria's, Asphalt's Tanks and Reports pages'; QC Lab
  groups its sites by the market its devices store). A site's market and product line are its relations, which the
  `OrganizationStore` reads only once asked (`org.wantSiteLinks()`, before
  `loadAll()` — in the background, the page not waiting); the tree is built
  once they and the market and product line lists are in, never every plant
  under "No market" first.
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
- **Tables:** a column's custom cell is `<ng-template tbDataTableCell="key"
  let-row>`; `tbDataTableCell="*"` renders every column without its own,
  `let-column="column"` saying which — for columns only known at run time
  (an ESF asset's channel settings), never a table of a page's own for
  them. **A table whose cells hold controls** (a select, a number box, a
  text box) is `[controlCells]="true"`: its cells' sides 6px (the
  controls' boxes set the columns apart; the table's outer edges 16px), and
  each such column has a `minWidth` (its cell's 12px of padding included,
  22px at the table's edge — its header then stays on one line), since a
  control takes its cell's width and would otherwise be squeezed to
  nothing in a table wider than its card (which scrolls sideways instead);
  no wash over a hovered row (its controls have their own hover) and the
  row picked (`selectedKey`) its tint and a brand-accent bar down its left
  edge, so a pick never reads as a hover left behind — its tint kept under
  the pointer (a table with `[rowHover]="false"` never clears a picked or
  checked row: the click that picks one leaves the pointer on it); a
  checkbox in a cell centred on its row (`tb-ext-checkbox`'s host a flex
  box — no line of text round its box, which sat it 3px high); the controls
  compact (`tb-select [compact] [floating]`, `tb-number-box [compact]`), a
  text box `form.tb-cell-text-input` (the text input at the compact
  height, red-edged while `.invalid`), a row's icon button
  `form.tb-field-button(16px, form.$compact-control-height)`. Every `tb-data-table` shares one row style — rows at least 40px
  with 6px vertical cell padding (`$row-height` / `$cell-padding-y` in
  `data-table.component.scss`) and 13px text (`table.$table-text-size` in
  `styles/_table.scss` — custom cell templates use it too). There is
  deliberately no per-table row-height input; change the shared values instead.
  A `truncate` / `maxWidth` column's value cut with "…" shows whole in the
  `tbTip` bubble while cut (`tbTipIfCut`) — or what the row's `cutTipKey`
  holds, built with the rows: the fuel Activity page's Description its
  event laid out to read, a `TipRich` (`activityTip`: what happened as its
  title — "Dispense", "Unknown user" — then a line a fact: Pump, User,
  Vehicle, Litres, Odometer, Hours) — a `tooltipKey` / `tooltipOf`
  column's in it while hovered; drawn on the page, never clipped by the
  table, a panel or the window's edge; never a CSS bubble in the cell.
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
  group's rows come with its summary row, never split across pages). A tree
  table (`treeParentKey`) that folds is `[treeCollapsible]="true"`, drawn as
  that grouping: a parent row's + / − before its first cell, the count of
  the rows right under it "(n)", folded to start (the rows opened kept as
  the rows refresh; a search shows what it finds opened), its rows on tree
  lines a step in a level — the toggle folds, the row's click is the row's
  (it's an entity of its own: Settings › Fuel limits' markets and sites);
  never a tree of a table's own. Access › Users' Groups list: the switch atop its
  filters groups by scope (the store's `groupSimilar`, a `SavedToggle` kept
  in the user's settings): a summary row is named after the scope
  (`scopeShortName` — its default groups' name before the level), its
  members summed, its scope's type shown, "Created on" a dash.
- **Unapplied edits warn before they're lost** (`components/shared/dashboard/
  unsaved-changes.ts`): a page holding edits not applied yet registers
  them (`registerUnsaved({ dirty, ask })` — `ask(proceed)` its own themed
  dialog, "Leave without applying?"); what moves the page away asks first
  (`guardLeave(proceed)`: the rail's pages and its second group's — not the
  alarms, the theme or Send feedback, which open over the page — the
  gateway page's back button, another gateway); closing or reloading the
  tab gets the browser's own warning (`beforeunload`). The ESF Wire graph
  view's draft is the first; a new page with a draft of its own does the
  same.
- **Shared dashboard code** (`components/shared/dashboard/`): the alarms
  (`subscribeActiveAlarms`, `clearDashboardAlarm`, `countAlarmsByOriginator`,
  `alarmSeverityTone` / `alarmSeverityRank`, the `DashboardAlarm` type), the user's saved settings and the rail's second
  group (`readUserSettings`, `saveUserSettings` — a save runs to its end even
  if the dashboard goes meanwhile, so a switch flipped right before leaving is
  kept — `dashboardRailItems`), the
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
  root, `[ctx]="ctx"`: under each device's name, its stored `site` by its
  label and code, "Richmond Lab (4R20)" (`siteLocationLabel`; the Site
  assets read once, `loadNamedAssets`) — read by the panel, once per
  originator; a dashboard sets no sub-label of its own);
  a row's alarm / error count is `tb-count-mark`; a details panel's Alarms
  tab (its button group's bell) is `alarmsTab(alarms)` (`dashboard-alarms.ts`
  — its badge the active alarms it lists), never written by hand. A site's Google Chat
  space is its `googleChatUrl` server attribute — set in Organization › Sites'
  panel (the masked "Google Chat webhook" card, read only as the panel opens,
  never with the list). The Alarm Routing chain (from Root: created and
  cleared alarms — a cleared one its "Alarm Cleared" card, and to Alarm
  Chat's subscribers too) posts alarms there:
  - a Site's own;
  - a device's (or anything's) at the site its `site` attribute names;
  - anything without a `site` (a vehicle or user code, a market): each parent
    Site with a webhook, and for a parent Market — or a market's own alarm —
    each of that market's Fuel sites (`applications` holding "Fuel") with a
    webhook, each site once.
  A card — a site's or a user's (Alarm Chat) — is subtitled with the
  originator's display name: its label, else its name.
  A masked field (`tb-secret-box`) is a text field masked by CSS — its text
  transparent under a drawn dot a character (a `1ch` pattern: never the
  browser's `-webkit-text-security`, large on an iPhone) — never a
  password field, and marked for password managers to ignore
  (`data-1p-ignore`, …) — a webhook isn't a sign-in.
- **Long-standing critical alarms by email (a site's "Alarm watchdog"):**
  - **The site's settings:** two server attributes on the site.
    - `criticalAlarmEmail`: true is on; false or unset sends nothing.
    - `criticalAlarmEmailDays`: how many days a critical alarm stays active before the first email, and the time
      between reminders. It runs 1 to 30, and unset or not a number means 3 (`WATCHDOG_DAYS`).
  - **Where they're set:** the "Notifications" card of Organization › Sites' panel (`tb-asset-form`, a titled
    `tb-collapsible-card`), first in the card, above the Google Chat webhook. "Alarm watchdog" is a
    `tb-ext-checkbox` (a value of the form, see "True / false in a form") heading a `tb-setting-object`, its bubble
    "Alerts managers of stale critical alarms", and its "Threshold" (`tb-number-box`, its unit "days" in the box —
    "day" at 1) folds open under it while it's ticked. Both are read with the webhook as the panel opens, wait for
    that read, and are saved with the form's Apply, written only when changed (`saveSiteWatchdog`). A new site sets
    them too.
  - **The "Critical Alarm Email" rule chain** runs on its own generator, every 15 minutes:
    - it reads the Sites switched on, with their days;
    - then the CRITICAL alarms still active on the devices whose stored `site` is one of their codes (never their
      relations);
    - it emails an alarm whose start (`startTs`) is more than the site's days ago, and again every further so many
      days while it stays active and critical.
  - **Who gets it:** the site's managers only, the members of the access groups with the Manager role (`level`
    "manager") whose plant scope (`additionalInfo.access.scope.siteIds`) holds the site. That's its default
    "<plant> · Managers" group, and a hand-made plant group of that role too. Never a regional, market or
    product-line group's members. Scopes are read from the group's own definition (an unsynced group has no scope
    attributes).
  - **One email an alarm per address:** each group's members are read apart and gathered by a Deduplication node
    (strategy ALL, 15 s — a chain can't loop), so every address gets one email an alarm (letter case aside). The
    window stays far shorter than the sweep, or the next sweep reads the alarms before the last one recorded its
    sends and emails again.
  - **The email** is the Airflow reports' frame (`dags/common/report_email.py`: the bordered card, ASCII only,
    inline styles), one a recipient, from the tenant's mail server:
    - its icon (a bell with a clock badge, red, an inline `cid:` image — the to-email node's `images` metadata);
    - the heading "Critical alarm active for N days";
    - an alarm card (a border, no fill): the alarm with a red Critical pill, its device · site, then a timeline —
      Started; on a reminder, "Previous email" (the record's last send, passed as `p`); "Active for …", this email;
      "Next reminder", the site's days on (`r`);
    - then "Open the dashboard": Home opened on the device's app, when one application alone lists its profile and
      Home holds that app (the chain's one read of the Site and Application assets maps profiles to applications;
      the due alarm carries it as `ap`; Home's URL state `{ app }` as `writeDashboardUrlState` writes it, built
      in the chain's script from `HOME_APP_APPLICATIONS`' pairs). Otherwise it opens Home itself.
  - **The record of sends** is kept on the device: its server attribute `criticalAlarmEmailed`
    (`{ <alarm id>: <last emailed> }`, its alarms no longer active and critical dropped as it's rewritten).
    - A new alarm emails again.
    - An alarm with no site-level manager is not recorded, so a manager added later gets it at the next sweep.
  - A new rule for these emails goes into the chain, never into a dashboard.
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
  (the fuel station's totals card). A dashboard of several pages
  holds each page's first showing the same way — its first page under the
  logo (the app's first load), each later one in its wireframes
  (`FirstLoads` by page, the pieces' `[wireframe]` bound to it — the fuel
  dashboard's `pageLoading` / `pageWireframe` / `pageReads`: Stations waits
  on the alarms too, Activity on its window, Reports on
  its totals and dispenses; its sidebar's filters a `tb-skeleton-card
  kind="filters"` meanwhile, its tab group, search and pickers staying), and
  a detail panel's Insights its own first reads, each
  entity opened — wireframes in its cards' places, `tb-skeleton-card`
  (`components/shared/skeleton-card/`: the card's shell, shimmering bars in
  its shape — `figures`, `chart`, `list`), never a spinner over the tab;
  the cards made all at once when they're in (`*ngIf … else`, never filled
  in one by one — the fuel station's and code's). Read only what the page shown needs
  at start (the fuel Stations page: no events at all — its cards read the
  pumps' stored day totals — not the Activity page's week of every pump's).
- **Selects:** a `tb-select` with nothing picked shows a blank box
  (`SELECT_EMPTY`, "", its default placeholder; the icon picker and an empty
  date field too) — never a placeholder of its own ("Select a market"), never
  dashes; a bulk edit's ("Edit (n)") "leave each as it is" is blank as well.
  An empty value that means something is an option with its label ("None",
  "Home", "Tenant (no customer)"). A `tb-select` in
  something that scrolls or clips (a table's cell — an ESF asset's channels
  grid) is `[floating]="true"`: its panel on the window (fixed) under the
  box, above it when there's no room below, the box's own width, any
  scroll or resize closing it — never cut by its container.
- **Choosing a control** — by the choice, never by habit (the guide every
  form follows; a form built from a definition — the ESF interface,
  settings and firewall rule forms — decides a pick per field with
  `pickControl` / `fitsButtonGroup`, `button-group.component.ts`):
  - a switch (`tb-ext-switch`) — an on / off that acts at once or opens
    more fields (see "True / false in a form");
  - a checkbox (`tb-ext-checkbox`) — a true / false of a form, sent with
    its Apply;
  - a button group (`tb-button-group`) — a pick among 2–4 short, fixed
    options, all visible, one click (`fitsButtonGroup`: each 14
    characters at most, 36 in all; five or more — an ESF Wi-Fi's Wireless
    Security, the user's pick — a select): a scale, a system and its units
    (a tank's Metric | Imperial, mm | cm | m, L | mm³ | cm³ | m³), Using
    DHCP | Manually, TCP | UDP — a "Custom" last, opening its field;
  - a radio group (`tb-radio-group`) — a few modes whose consequences
    need a sentence each, an info icon an option (a tank sensor's
    Remaining space | Fill height — the first adds its gap field) — on
    one row where it fits at its usual width, else one option a line
    (`[column]`: an ESF interface's IPv4 / IPv6 Status, each mode with ESF
    console's own explanation, `STATUS_INFO`; its IPv6 Configure and
    Privacy); **never a wrapping row** (a wrapped label reads as the next
    circle's, the order is lost). **Radios only where buttons won't do:**
    2–4 short options are a button group even when each needs explaining
    (Router Mode, Wireless Mode, Address Generation Mode, GPS Mode) — their
    notes the label's info icon, an option a line, "EUI64: from the
    hardware address …" (`pickNote`); a radio group is for longer options
    that each need a sentence. A definition's pick decides by
    `pickControl` (`IfOption.info` the options' notes). **A form across
    its page** (`wide` — the ESF Drivers and assets view's: a driver's
    settings, `tb-gm-esf-settings [wide]`, an asset's, `tb-gm-esf-field
    [wide]`): 2–5 options too long for a button group but that one row of
    radios fits (`fitsWideRadioRow`, ~840px) are that row, explained or not
    — the room the form has, used (a Modbus driver's Parity, Stop Bits,
    write modes; an asset's Timestamps, each option's note its info icon);
  - an option or a table cell naming a long id (an ESF factory's PID) — a
    readable name, the id as a muted line under it, wrapping, never cut
    (`TbSelectOption.note`, the search matching it; in a table, the name
    alone, the id in the cell's bubble — the cloud table's Factory column): "Raw MQTT Subscriber" over
    `org.eclipse.kura.cloudconnection.raw.mqtt…` — never the id alone, cut
    with "…";
  - a select (`tb-select`) — more options, longer labels, or a list from
    data (networks, sites, channels, an ESF interface's Band), searchable
    past about ten;
  - a number (`tb-number-box`) — its unit inside the box ("s", "dBm",
    "bytes"), never in its label ("Lease Time (s)"): an ESF interface's
    lease times, MTU, WAN priority, retries (`IfField` `kind: "number"`,
    `unit`, `min` / `max` — its value still text, as the form's others);
    allowed values with gaps are its `[ranges]` (an MTU's 0, then 576–1500;
    a modem's reset timeout 0, then 2 and up), the steppers and the arrow
    keys skipping them — up from 0 is 576, never 1;
  - a bounded number (a sensible floor and ceiling) — a slider beside its
    number box (`tb-slider-stepper`): QC Lab's report intervals, a fuel
    limit, an ESF interface's DHCP lease times (1 minute to 1 day, a
    minute a step — `IfField.slider`; its `[ranges]`, if any, snap a gap's
    value to the nearer edge); an unbounded one (a WAN priority, retries)
    and an MTU (the user's pick: its box, its `[ranges]` skipping 1–575)
    the number box alone;
  - chips (`tb-tag-picker`) — several picks of things;
  - a field's note that says what its options or special values mean (an
    ESF form's info icon — the interface, firewall rule and settings
    forms' hand-written notes, `CURATED` in `esf-notes.models.ts`) — one
    a line ("\n" in its `tbTip`): "SLAAC: from the network's prefix" /
    "DHCPv6: from a server", "On: …" / "Off: …", "0: never" — never
    several run together with semicolons;
  - a value worked out from others (a tank's capacity) — a line of text,
    `tb-setting-note` ("Holds 846,026.65 gal"), never a field-shaped box;
  - `tb-segmented-control` — switching what's shown (a page's lists, a
    panel's sections), never a form's value.
- **True / false in a form:** a value sent with the form's button (a
  setting among others — "Apply changes", "Create", "Save": an ESF
  setting, a device profile's "Mobile", a new user's "Send activation
  email") is a
  `tb-ext-checkbox`, the setting's name its label, right before it: a
  checkbox says "a value of this form"; its note the `info` input, or — a
  `tbTip` bubble — an info icon right after it (`form.tb-check-field`
  around both: the ESF forms'). A `tb-ext-switch` says "this happens now",
  so it's only for a flip that acts at once (a connector's Enabled in the
  Connectors card, a filter column's view switches — Matrix, Tree
  grouping) or one heading the section it folds open (`[heading]`: a
  connector's Remote logging, the gateway's report strategy; a true / false
  whose true shows more fields is always this switch, never a checkbox —
  the gateway's Statistics, Custom statistics, Check device inactivity —
  its note an info icon right after it, `tb-info-icon`) — never a
  plain setting of a draft, and never at a row's far end from its name.
  Never a Yes | No pair of buttons for one (`tb-button-group` is a pick
  among named options: Google | Password).
- **A device's Settings form opens from its row, nothing read on the
  click:** `tb-device-settings-card` takes what the table's query already
  holds (name, label, note, attribute values); its one extra read, the
  device's groups, a page reads ahead with its rows — `deviceGroupNames`
  in the background after its table loads, a few at a time, each device
  once — and passes in, `[groupNames]` (Aria's scales); none passed, the
  card reads them itself as the device changes.
- **Settings cards** (QC Lab's: Calibration, Alarm reporting, Threshold
  alarm — every card of `tb-device-settings-card` — and every Settings tab
  and panel form laid out as them: the fuel app's station, pump and code
  Settings, its New station, New pump, Create code, Import and fuel limits
  panels) are a `tb-card` / `tb-collapsible-card` (its `info`) around the
  shared setting pieces (`components/shared/setting-object/`,
  `SETTING_PIECES` for a component's imports): `tb-setting-stack` (the
  card's body, the form's field gap), `tb-setting-section [heading]` (its
  settings under the shared section heading — "Pump 2" — anything at the
  heading's end `[section-action]`, a pump's "Remove"), `tb-setting-object`
  (a setting: its switch `[gate]` — `tb-ext-switch [heading]` — anything
  beside it `[gate-extra]`, its fields folding open while `[open]`;
  `[gated]="false"` its plain `label`), `tb-setting-field` (a muted label —
  `inputId` its `<label for>` — its `info` an info icon's `tbTip` bubble,
  over its control; a native `input` / `textarea` given the forms' text
  box; under it its `hint`, or its `error` in the hint's place, the box
  red-edged), `tb-setting-note` (a short muted line, its icon before it —
  "Creates agg-3h32-pump-01, shown as P01."; `icon=""` none),
  `tb-setting-checks` (checkboxes two a row), `tb-setting-row` (short
  fields side by side; `[even]` — equal columns: two selects, a tank's
  height and diameter) and `tb-setting-divider` (the rule between two); a
  worked-out value shown read only (a tank's capacity, an RPC's method) is
  the forms' dashed box, `form.tb-readout`; a number is `tb-number-box`
  (its unit inside the box, up / down chevrons — a tank's height, a port),
  or `tb-slider-stepper` where a slider helps (a threshold) — never a
  native `type="number"` input with the browser's spinner;
  its buttons `tb-form-actions`. A panel form keeps `form.tb-panel-form`
  for its host and its stack of cards alone. Never a card's own field,
  label, hint, heading or divider classes.
- **A numeric threshold alarm** (a reading against limits — a probe's
  channel, an ambience sensor's temperature or humidity, a tank's level or
  temperature; a new one the same, the user's pick, 20 November 2026) is
  one JSON attribute a measurement, the Milesight TS302's shape —
  `{ enable, condition, thresholdMin, thresholdMax }` — its card QC Lab's
  "Threshold alarm" (`tb-device-settings-card [objectCards]`, "Triggers an
  alarm when the reading crosses the configured min/max thresholds."), each
  measurement `thresholdAlarmObject(key, label, range, scope)`
  (`device-settings-card/threshold-alarm.ts`): its switch heading it, then
  Condition, Below | Above | Between | Outside (Above to start), then the
  limits it reads — Min threshold for Below / Between / Outside, Max for
  Above / Between / Outside (`DeviceSettingControl.showWhen`: the other
  hides, keeping its value), sliders in the range given (`defaultValue`:
  where a limit starts). Never flat threshold attributes or a card of a
  dashboard's own. Below raises under the min, Above over the max, Outside
  either, Between from the min to the max (inclusive) — `thresholdBreached`,
  and the alarm rule reading it the same (an ALARM calculated field on the
  profile, a TBEL condition over the attribute and the reading — the
  AsphaltTank "Level" / "Temperature" rules' script — clearing when it no
  longer holds); off, missing, or without the limit its condition needs: no
  alarm. Its chart lines `thresholdAlarmLines`, a table's words
  `thresholdAlarmText` ("Above 95%", "Off").
- **Forms:** a form's stylesheet takes its classes from the shared set —
  `@include form.tb-panel-form("xx");` (a side panel's form: host, `.xx`,
  `.xx-fields`, `.xx-field`, `.xx-label`, `.xx-input`, `.xx-hint` /
  `.xx-error`, `.xx-actions`, `.xx-cancel`, `.xx-submit`) or
  `form.tb-form-fields("xx")` / `form.tb-form-actions("xx")` — and only adds
  what is particular to it. A disabled field (a setting that doesn't
  apply — an ESF interface's Gateway on a LAN) is dimmed and out of reach:
  no text to select, no caret, a textarea not resizable (the shared
  `:disabled` of `form.tb-text-input`, `tb-number-box`, `tb-secret-box`:
  `user-select: none` and `caret-color: transparent` — Chrome still puts a
  click's caret in a disabled input's text and draws it blinking; never
  `pointer-events: none`, which lets the click through to the row behind
  and leaves a caret there); never only dimmed. A tree of picks in a form (a user's plants) is
  `tb-filter-list [field]="true"`: a field's fill, as the form's selects,
  not the card's. Also shared: `form.tb-pane-title`,
  `form.tb-field-button` (an icon button beside a field, in the field's own
  box — a fuel code's "Generate", **a row's delete** (a gateway statistics
  command's, a template's field row): every button beside a field is styled
  as the inputs, never a round or bare icon button there),
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
  (orange), `status.$caution` (yellow — the Warning alarm severity alone),
  `status.$minor` (amber), `status.$major` (orange), `status.$error` (red)
  from `styles/_status.scss`, i.e. the `--c-bg-<status>-normal` tokens.
  Never another token family (`text-*`, `icon-*`) for these colours. **No
  status mark is yellow but the Warning alarm severity's**, in either theme
  (too faint on light for a state): the warning tone — a state that needs a
  look, "Updating", "Not synced" — is the orange, its status tokens
  (`--c-bg-warning-normal`, `-extralight`, `--c-border-warning-light`) the
  major's own (`_theme.scss`), so every pill, mark, toast, tile and insight
  card of the tone follows; never a yellow of a piece's own. Alarm
  severities are the ramp after green, yellow to red — warning → caution
  (its own yellow, `#f6d32b` light / `#fedd4d` dark — so it never reads as a
  minor one), minor → minor, major → major, critical → error
  (`alarmSeverityTone`, `tb-severity-bar`; Home's Active alarms marks) —
  light to heavy; a scale mirroring them (a fuel limit's "Near limit") the
  same; green is OK alone.
  On dark a pill's fill and edge are its colour over the card (14% / 40%),
  never a near-black tint.
  Setting a CSS custom property from one needs interpolation —
  `--x: #{status.$error};` — a bare `status.$error` is emitted as literal text.
- **Pills (`tb-status-pill`):** the status tones (`success`, `warning`,
  `caution`, `minor`, `major`, `error`) take their text colour from that scale — a
  warning pill the orange, as a major one, on its tint
  (`--c-bg-warning-extralight`, its edge `--c-border-warning-light`: the
  major's — the Fuel Reports page's insight cards, the map's pill and the
  Time Machine's tiles the same), but on light an amber pill's text a deep
  ochre of it (`--c-text-minor-pill`), a caution pill's too
  (`--c-text-caution-pill`); neutral uses
  `--c-text-pill-neutral` (#7887a1 light / #94a3bd dark), brand `--c-text-brand-normal` (light mode). Set it
  once per tone in `status-pill.component.scss`, never per usage.
- **Times:** 12-hour clock with AM/PM in the viewer's browser time zone —
  format with `components/shared/time-format.ts` (`formatClockTime`,
  `formatDateTime`, …; `TB_DATE_AT_TIME` for the Angular `date` pipe), never
  `HH:mm` or a hand-built `getHours()` string.
- **Confirmations:** use `tb-ext-confirm-dialog` (placed in the dashboard root —
  near its top, 96px down, every one alike, never the middle of its
  height), never `ctx.dialogs.confirm` — ThingsBoard's dialog opens in its own overlay
  outside the dashboard, so it ignores the dashboard's light/dark theme.
- **A toast's words are generic:** what happened, never the device or
  gateway it happened on (the page shown says which) — "Settings applied",
  "Wire graph applied", "Snapshot taken", "Gateway saved", "Site saved",
  "User created", "Couldn't save the site: …" — never "… on
  dev-inf-gw-01", "agg-3a12-gw-01's site saved" (the user's pick). A
  thing on it may be named where it says which of several (a package
  installed, the users deleted).
- **Toasts:** use `tb-ext-toasts` (placed in the dashboard root — they show at
  its top-left corner, past the rail, over everything of the dashboard's —
  its side panels and its dialogs too (z-index 3100, dialogs 3000) — in every dashboard — an app opened inside
  Home, `[nested]="!!host"`: at its own edge, Home's rail being outside it; call it via
  `@ViewChild("toasts", { static: true })` — `toasts.success(…)`, `warn`,
  `error`, `info`), never `ctx.show*Toast`, which opens ThingsBoard's own toast
  in its overlay and ignores the theme. A write sent quietly (`QUIET_REQUEST`:
  ThingsBoard shows nothing) never fails silently — its error is a toast with
  ThingsBoard's reason (`apiMessage`: "You don't have permission to perform
  this operation!" for a user who may only look); a shared piece that saves
  takes the dashboard's toasts, `[notices]="toasts"` (`tb-device-settings-card`,
  `tb-alarm-list`).
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
  search and its Scope / Product line / Sites filters narrow the rows, Role
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
  panel open — on the canvas's fill (`tb-nav-rail`'s host), so the scrim
  never shows through it: the rail stays undimmed, plainly clickable.
- **Side panels slide only at the ends:** the first panel slides in and the
  last one out; a panel opening as another closes swaps in place at once —
  `tb-detail-panel` settles every panel whose `open` changed in one pass
  together (`queueMove`), so never animate a panel change yourself. A
  `dismissible` panel's scrim passes a click on a clickable table row on to
  the row (`clickableRowUnder`: the row opens in the panel's place — on a
  trail, as its next stop — and looks hovered under the pointer,
  `.dt-row-hover`); any other click-off, and a row of a table in Manage,
  does nothing — a click-off never closes a panel, only its close button or
  Escape — or a move to another page:
  - **What counts as a move:** the rail's lit entry changing — a rail click, an app's own page, a Settings section,
    Back / Forward.
  - **What happens:** every side panel open in that dashboard closes, the alarms' too, as its close button closes it.
    `tb-nav-rail` tells `tb-detail-panel` through `DASHBOARD_PAGE_MOVES` (`dashboard/page-moves.ts`), once its
    change check is through.
  - **What doesn't count:** a list switched within a page (Users | Groups) lights no other entry and closes nothing.
  - **A new page:** gets this for free, as long as the rail lights it.

  A wheel over the scrim scrolls what's under it (`scrollBoxUnder`:
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
    Manage" (a phone: no Manage — checking rows for a bulk edit or delete is
    a wider screen's), then the table's own links (`tb-table-link`: "Sync all",
    "Import"); **a table action while it runs** is `tb-table-link [busy]
    busyLabel="Installing"` — its running wording and three dots fading in
    after it (the Manage card's), its `progress` after them ("Deleting... 2 /
    4"), in full colour and not pressable meanwhile — never a spinner; managing, "Edit (n) | Delete (n) | Select all (n) | Done" —
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
    there's something to submit) — inside the form, its last element, so
    they sit under its last card at its right edge; never given a width
    class of their own (`card.tb-form-width` on them made a 760px bar that
    their `margin-left: auto` pushed to the view's far edge); a name field's checks are `nameValidators`
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
  else it says, a rule before each — never wider than the panel: its values
  cut with "…", each in full in the bubble while cut (`tbTipIfCut`), or — a
  dispense's details, `EventListItem.wrap` — all together on a line of their
  own under the time when they don't fit beside it; who it was (a station's
  dispense: its user and vehicle) on a muted line of its own under the
  time's, `EventListItem.sub`; a market
  there by its code, its name the bubble's (`EventListPart.tip`) — the table's own search in its header
  (its search icon, as the other tables'), 20 a page, newest first. Both lists draw their rows with `event-row.tb-event-row-classes`
  (`styles/_event-row.scss`); change the row there, for both.
- **A detail panel's facts** (label / value rows in a card — a feedback
  item's page and browser, its sender, a fuel code's facts, an Aria belt
  scale's readings, a device's gateways, an ESF unit's Profile cards) are
  one card, `tb-detail-card` (`components/shared/detail-rows/`: the card
  shell around `tb-detail-rows`, its `tb-detail-row`s projected; `title` —
  a heading, the titled card's look, its `info` an info icon after it; none:
  the plain card; `[wireframe]` — a list card's placeholders in its place
  while its first read is out, `wireframeRows` of them), never
  `tb-card` + `tb-detail-rows` written out again (`tb-detail-rows` alone
  only inside a card that holds more than its rows — an error callout in
  its place, actions under it; a card of several things' facts is
  `tb-detail-block`s, see "A detail panel's tabs"). A row is
  `tb-detail-row label="…"` (the label muted at the left, the value at the
  right; `info` — a note on what the fact is, an info icon after the
  label, its text in the `tbTip` bubble; `stacked` — the label over a
  block of text; `divider` — a line above the row) — never a
  `tb-stat-grid` of loose figures for what a thing is now; a pick among a few short
  options in a card or form is `tb-button-group` (outlined boxes, the picked
  one brand blue — the settings card's: QC Lab's time zone, a feedback
  item's status), never a hand-made row of buttons.
- **A detail panel's tabs — the standard** (the reference: the fuel
  station's panel — Insights — and a QC Lab temperature probe's — Insights
  and Settings). Every detail panel is built of these shared pieces, in
  this order — a new dashboard's from the start, an existing one's brought
  to it whenever it's touched — with no card, head, meter, divider, block
  or tab list of a dashboard's own (its stylesheet holds its column and
  what's truly its own; a look to change, change it in the shared piece):
  - **Header:** `tb-entity-detail-panel` — its profile's icon on the tile
    (`[icon]`, `profileIconsOf`), its name, a subtitle (its site by label
    and code, its label or its id), its state's `tb-status-pill
    size="md"` in `header-actions` ("Online"; a device whose settings go
    down by downlink: "Synced" / "Queued (n)") — or, where it has a page
    of its own, the button to it instead ("Details →": a gateway's, a
    vessel's): **a header with a Details button shows no state's pill** —
    then the close button.
  - **Tabs:** icons only, in this order — `INSIGHTS_TAB`, `alarmsTab(…)`
    (the bell, its badge), `HISTORY_TAB` (only a device that replays its
    log), `SETTINGS_TAB` (`entity-detail-panel.component.ts`); a tab of the
    entity's own goes between Insights and Alarms (a pump's "Access codes").
    A panel of a form alone ("New tank", "New station", an import) has
    `DETAILS_TAB`, its name "New …".
  - **Insights:** a column of cards (`card.tb-card-stack`), top to bottom:
    1. *What it is now* — `tb-figure-card` (`components/shared/figure-card/`:
       its title, its value at the right in its tone — the status scale's
       or the strong text — a meter under them (`meter`, the chart blue or
       its tone), figures projected (`tb-stat-grid`), a muted foot —
       `foot`, `footEnd` or a projected `[figure-foot]` link: a battery, a
       tank's level, a vessel's position) or a titled `tb-detail-card` (the
       station's "Station": its pumps, last dispense, its codes).
    2. *Its charts* — every chart card of the panel on one window
       (`[(timeframe)]`, its `tb-timeframe-picker` 1D | 1W | 1M right under
       the card's title): `tb-state-timeline` for its state's runs,
       `tb-metric-chart-card` for time series read from ThingsBoard (its
       lines filled under with a fading tint of their colour,
       `MetricChartSection.fill` — Asphalt's, Aria's, the Signal card's),
       `tb-lorawan-signal-card` for a LoRaWAN device's RSSI and SNR, or the
       page's own bars in a `tb-collapsible-card` — the picker
       (`card.tb-chart-card-picker`), the window's figures (`tb-stat-grid`),
       `tb-bar-chart`s parted by `card.tb-chart-card-divider` (the
       station's "Fuel dispensed"). A belt scale's panel (Aria's, Marine's)
       is the exception, the user's pick: its cards always the last 24
       hours, no picker, the Metrics heading fixed — longer windows are its
       Time Machine's. A gateway's cards are its last day too (its Errors
       bars are read for it alone).
       An entity's own page (a gateway's Overview, behind its panel's
       "Details →") is one cohesive page of the same shared cards, laid
       out for its width — two a row, **a row's cards one height**
       (`gm-overview`: `align-items: stretch`, the cards `[fill]` —
       `tb-collapsible-card`'s, `tb-detail-card`'s), a full-width one
       `gm-span`: its state over the day (`tb-state-timeline`); a
       summary strip (`tb-stat-grid [headline]`: its devices online as
       the headline, then its connectors, errors over the day, uptime,
       messages); its charts side by side, each one chart of one height,
       no picker (the gateway's errors bars beside its CPU / memory /
       disk as one chart, `gatewayPageCharts`); its details (a titled
       `tb-detail-card`: version, profile, its site and applications,
       when it last connected) beside what it holds (its connectors —
       the panel's card, one `ng-template` both use); then its devices'
       table. No set-up card; never cards of mismatched heights side by
       side.
    3. *What it holds* — a titled card (`tb-collapsible-card
       [collapsible]="false"`, "Pumps") of `tb-detail-block`s
       (`detail-rows/`: a member each — its name, a muted note after it, its
       state's pill in `block-actions`, then its `tb-detail-row`s; a rule
       between two; no heading: the rows alone — an ESF unit's cloud
       connections). Nothing in it opens anything when the panel manages
       its members; members that open a panel or dialog of their own (a
       gateway's connectors) are a list card's rows instead, each opening
       it, "Create new" under them.
    4. *Its latest happenings* — `tb-event-list title="Activity"
       [searchable]="false"`: its latest 10 over the charts' window, each
       its numbers beside its time and who on a line under it
       (`EventListItem.sub`), "View full activity" at its foot.
    Until its first reads are in: a `tb-skeleton-card` in each card's
    place, every card made at once (`*ngIf … else`), never filled in one by
    one.
  - **Alarms:** `<div alarms>` around `tb-alarm-list [ctx] [deviceId]
    [notices]` (a device managing others: `[memberIds]` and
    `[showOriginator]`).
  - **Settings:** `tb-device-settings-card` — its identity card (the name
    in a `tb-copy-box`, label, note, its groups; the page's own fields
    projected `[identity]`, a station's Site), then its cards (sensor
    channels, device settings, `objectCards` — alarm reporting, threshold
    and mutation alarms) built of the setting pieces (see "Settings
    cards"), a page's own cards under them, built of the same pieces (the
    tank's set-up, `tb-asphalt-tank-form`; the station's "Pumps": a
    `tb-setting-section` a pump, `tb-setting-divider` between), one Apply /
    Cancel for all of it (`tb-form-actions`).
  - **History** (a device that replays its log): one card — what it does,
    its `tb-date-field mode="range"`, its button.
- **Help with drawings** (the Organization, Applications and Access › Users (its Users and Groups lists) / Roles tables' "?" beside their title — a table's
  `dt-title-actions` slot, the compact header's — `tb-organization-help
  [kind]`, the store's `help`: how the table's items fit in the organization,
  nothing else, written for whoever
  administers it — what relates to what, no subtitle, no intro line, no backend terms (rule chains,
  relations, attributes), no examples, never addressing the reader (no
  "you" / "your"), the entities named as code — lower case, each
  bullet's first mention of one — no caption: a
  `tb-ext-dialog [fit]` in the dashboard root (at its top, as tall as its
  content, as every info dialog — a dialog of panes or editors fills the dashboard), one `tb-collapsible-card` (no icon),
  its text — the tables' 13px, every element sized in the component, as
  ThingsBoard sizes paragraphs of its own — beside its drawing) draws in the
  ThingsBoard docs' look —
  `diagram.tb-docs-diagram` (`styles/_diagram.scss`) in the app's colours:
  a group a chart palette slot (`.dg-c1` … `.dg-c5`, the brand blue first) or
  `.dg-neutral` (a chip in a coloured group in its colour, `.dg-chip-hued`),
  the entity the help describes a filled node out of any
  group (`.dg-filled`) — drawn more than once (a product line and its sub
  product line), its filled nodes share a group — a dotted
  canvas on the field surface (`diagram.tb-docs-canvas`: every drawing's
  ground, a CSS-laid one's too — the fuel code's Assignment tree), dashed tinted groups
  with a pill-like name tag, cards with a tinted icon tile, chips outlined as
  fields, connectors in their parent's colour; Inter,
  `loadDocsDiagramFont`), inline SVG in their units (a 720-wide canvas).
- **A note set apart** (a warning above a list, a caveat in a panel) is
  `tb-callout [type] title="…"` — the look of the Obsidian notes' callouts:
  a bar in the callout's colour down its left edge, that colour at 10% as
  its background, a bold coloured title after its icon, the text under it in
  the normal colour; its colour the dashboards' own for the kind (note / info:
  the brand accent; success: the status scale's green, question and
  warning its orange, error its red — no yellow; quote: grey). Never a
  hand-made tinted box.
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
- **Date fields** (a history request's range) are
  `tb-date-field` (`components/shared/date-field/`), never a native
  `type="date"` input: the form's input box with a calendar icon and the
  date picked, a form control — `mode="day"` ("YYYY-MM-DD", "" none — a
  native date input's value; `future`, `min`) or `mode="range"`
  (`TbDateRange`). Nothing picked shows a blank box, as a select, or what the
  empty value means (`placeholder="Never"`). It opens the dashboards' one
  calendar, `tb-date-range-picker` (a range, or `mode="day"`: one month, a
  day), through `tb-date-picker-host` — placed in the dashboard root of
  every dashboard with a date field, so no side panel clips it.
- **File fields** (a package to upload) are `tb-file-field`
  (`components/shared/file-field/`), never the browser's own file input
  (its "Choose file" / "No file chosen" can't be themed): the form's input
  box with a file icon, the file's name and its size muted after it
  (`fileSizeText`), a click opening the browser's picker (`accept`), a file
  dropped on it picked too (the brand ring while one is dragged over); a
  form control, its value the `File` (null none); nothing picked a blank
  box, as a select.
- **Number fields** use the shared number box, whenever the value is a number (a count, days, a limit, a port,
  a threshold): `tb-number-box` (`components/shared/number-box/`).
  - **What it is:** the forms' text box with the value, an optional muted `unit` after it, and up / down chevrons
    stepping by `step` within `min` / `max`. It's a form control, its value a number or null while empty, and the
    form's validators judge a typed value. Its error border is `[invalid]`; `inputId` serves a `<label for>`.
    Password managers leave it alone (autofill off, `data-1p-ignore` and the others' marks, as `tb-secret-box`).
  - **Never a native `<input type="number">`:** not in a panel form (a site's watchdog Threshold), not in a settings card
    (`tb-setting-field` around it — the device settings card's `number` kind), not in a dialog.
  - **A number with a slider** is `tb-slider-stepper`, the slider with the same box.
  - **Not yet converted:** the old TS302 sensor widget's Material form (`sensors/`) keeps its `matInput` boxes.
- **Links out to other sites** (the Eclipse Marketplace, a gateway guide)
  never animate: ThingsBoard's own link look — a `border-bottom` in its
  blue sliding in on hover and focus — is off in every dashboard of ours
  (the global stylesheet, `[tbdashboardroot] a[href]`), and our own
  `button.tb-link-underline` shows its underline at once. An action that
  only opens a page beside a page's own actions is a `tb-table-link`
  (`window.open(url, "_blank", "noopener")`): "Install | Eclipse
  Marketplace".
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
- **No `:has()` rule whose subject could be any element, nor one hanging
  on `:empty` / `:not(:has(…))`** (`*:has(> x)`, `.a:has(> .b:empty):not(:has(…))`):
  the browser then re-matches it on every DOM change anywhere on the page, and a
  chart tooltip — ECharts writes its HTML and measures it on each pointer
  move, a box a chart of a synced group — forced ~10 ms of style
  recalculation a box (Aria's three Metrics charts: 77 ms frames; with the
  two rules gone, 16). Set a class from the component instead
  (`tb-data-table`'s `dt-footer-hidden`, the column picker's
  `tb-column-picker-parent`); a `:has()` on a classed subject keyed on a class
  (`html:has(.tb-phone)`) measured harmless. Measure in the user's browser,
  not a static page: the page's own stylesheets are the cost.
- **A shared component's icon colour is set as a descendant of its box**
  (`.tbs-trigger .tbs-chevron`, `.cb-box .cb-check`, `.nb-step mat-icon`,
  `.tp-box .tp-chevron`), never on the icon's class alone: ThingsBoard
  paints every icon in a table's cell near-black (`.tb-default
  .mat-mdc-cell .mat-icon`, three classes), so a control put in a table
  (an ESF asset's channels grid) showed its chevron, check and arrows
  black. A new control's icons the same.
- Elements a component creates in code (`document.createElementNS`, an SVG
  drawn from measured places) get none of its encapsulated styles — a class
  alone leaves the browser's defaults (SVG: a black fill): set their look
  inline (`el.style.stroke = "var(--c-brand-accent)"`). A static preview of
  the compiled CSS won't show this (it has no encapsulation).
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
    shared mixins. Tooltips have two looks. A plain one — a one-line label
    (`tbTip`, a marker's name, an icon button's) — is the bubble: navy with
    white text in light mode, slate in dark (`--c-tooltip-bg` / `-text`,
    `styles/_theme.scss`). A rich one — a title, rows, a total: every chart's
    (`chartTooltipStyle`, the calendar's `chartTooltipCss` — the Fuel Reports
    page's look: a hairline round it, a bar in a row's colour down its left),
    the Time Machine's marks and runs (`tbTip` given a `TipRich`) and
    ThingsBoard's notification popover, in the white-labeling — is a card:
    a surface a step above the card it pops out of, the modal shadow
    (`--c-tooltip-rich-bg` / `-text` / `-border`). The plain bubble:
    `tooltip.tb-tooltip-bubble(<placement>)` on the hidden rule and
    `tooltip.tb-tooltip-bubble-shown` on the hover rule give the whole thing
    (look, caret, pop); a bubble of its own takes `tooltip.tb-tooltip-surface`
    (the fill, the text, the lift) and a caret in `var(--c-tooltip-bg)` — never
    a colour pair of its own. **A tooltip must never be cut off:** every
    new tooltip on a button, a toggle, a mark or a box is the `tbTip`
    directive (`components/shared/tip/`: `<button tbTip="Export CSV">`) —
    the same bubble, drawn at the top of the page (in the document's body,
    fixed, themed from where its element sits), centred above the element,
    under it when there's no room (or preferring under it,
    `tbTipPlacement="below"` — a control at a widget's top; the tab group's
    options' tooltips are `tbTip`, its `tooltipPosition` the side they
    prefer) — or beside it, centred on it, to its right
    (`tbTipPlacement="right"`: a narrow column's — the Time Machine's — its
    caret on its left edge; its left when there's no room), kept inside the window
    — always on the part of the element in view (a tall one scrolled half out
    of its column: the middle of what shows), following what shows as its
    column scrolls under the resting pointer (the Time Machine scrubbed with
    the wheel; any other scroll closes it); a label on one
    line, a longer note wrapping at 320px, its lines balanced and the bubble
    as wide as its widest line (`fitToLines` — no blank strip on its right;
    `tip-bubble.component.scss`); a list an item a line ("\n" in its text, kept —
    never commas); given a `TipRich` (`{ title, rows }` — `ChartTooltipRow`s,
    a swatch's `var(--c-…)` resolved where the element sits) instead of text,
    the charts' rich tooltip (`chartTooltipHtml` in the rich surface, no
    caret), placed and kept up the same — a list of things that happened (the
    Time Machine's marks and runs), never a "\n" list of its own; a finger
    has no hover: a tap on something that only says what it is (an info icon,
    a mark, a cut value) shows its bubble until a touch elsewhere or a few
    seconds — a tap on a control (a button, a link, a field, a table's
    clickable row) never does; pressed
    (clicked), it goes down and stays down until the pointer leaves —
    the focus the press gives the element never brings it back, and one up
    already never pops again (no flicker on a button group's click). Never a CSS
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
