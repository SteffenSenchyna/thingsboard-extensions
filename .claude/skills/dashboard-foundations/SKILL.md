---
name: dashboard-foundations
description: "Structural foundations for generating a ThingsBoard dashboard JSON: the envelope/state-assembly templates, the global entityAliases model, aliasing principles, currentCustomer scoping, state-switching, userRequirements application, and UUID conventions. Preloaded into dashboard-generator; not invoked directly."
user-invocable: false
---

# Dashboard Foundations

Preloaded reference for the dashboard-generator agent. Holds everything that is true of *every* dashboard regardless of which widgets it uses. Concrete per-widget / per-alias / per-action templates are NOT here — the agent pulls those on demand from the `widget-*`, `alias-*`, and `action-*` catalog skills.

## Available catalog skills (pull on demand)

Widgets: connect-real-devices, header-card, info-card, navigation-widget, state-switcher, action-button, horizontal-value-card, battery-level, signal-strength, simple-gauge, progress-bar, value-chart-card, chart, range-chart, state-chart, bar-chart, pie-chart, entity-table, alarm-table, alarm-count, outdoor-map, indoor-map, html-container (custom HTML path only — see "Custom HTML path" below).

Aliases: state-entity, asset-type, device-type, entity-type, customers-by-group-name, customer-entities, asset-search-query, device-search-query, relations-query, single-entity.

Actions: drill-down, change-state, create-entity-dialog, edit-entity-dialog, delete-entity-dialog, change-owner-dialog, create-map-entity-dialog.

**Which alias type fits each state context** (multi-root root state, single-root root state, detail state, relation-based traversal, alarm-propagation scope) is documented in `@/Users/steffensenchyna/.thingsboard/resources/prompts/solutions/dashboard/resources/state-datasource/dashboard-state-datasource-capabilities.md`. Its datasource type names map to catalog skills 1:1 (`stateEntity` → `alias-state-entity`, `deviceSearchQuery` → `alias-device-search-query`, …) with two exceptions: `customersByProfile` is implemented by the `customers-by-group-name` catalog skill (this pipeline models customer collections as customer groups), and `entityName` has no catalog template — prefer `entity-type` or a profile-typed alias (`device-type` / `asset-type`).

**Which action type a widget ability maps to** (per widget group: table / map / button), which widget classes support actions at all, and when two widgets may share one action are documented in `@/Users/steffensenchyna/.thingsboard/resources/prompts/solutions/dashboard/resources/state-actions/dashboard-state-actions-capabilities.md`. Its action type names map to catalog skills 1:1 (`drillDown` → `action-drill-down`, `createMapEntityDialog` → `action-create-map-entity-dialog`, …). The Permissions-gating section below decides whether a slot is emitted at all; the actions capability doc decides which action type fills an emitted slot.

## Custom HTML path — the htmlContainer widget

The `htmlContainer` widget (`widget-html-container` catalog skill) is the dashboard's open canvas — it fills its area with whatever HTML/CSS/JS you write, so it stretches to fit almost any idea. Its range:

- **Free-form and pixel-precise layout** — hero headers, overview banners, split panels, overlapping or overlaid elements.
- **Composition** — several dashboard states (and the stock ThingsBoard widgets inside them) stitched into one view: tabbed panels, master–detail, slide-over drawers, summary screens.
- **Custom navigation** — a bespoke tab bar, sidebar, breadcrumb, or button group driving which state is shown.
- **Control panels** — buttons, sliders, and forms that send RPC or write attributes back to devices.
- **Third-party visuals** — charting, mapping, 3D, diagram, or drag-and-drop libraries loaded from a CDN.
- **Branded chrome and bespoke designs** — custom typography, color systems, card compositions, reusable header/footer blocks.
- **Live status strips and analytics** — custom KPI bars and panels driven by subscriptions or REST polling.

These are starting points, not boundaries — anything expressible in HTML/CSS/JS with the widget's `ctx` APIs is in scope, and the patterns combine freely.

**Generation is craft, not slot-filling.** Treat building a dashboard as design work where the full palette is yours to use as the result demands: stock widgets, from-scratch htmlContainer widgets, embedded states, composition, and custom code — mixed however serves the best dashboard. Nothing here limits you to one tool or one shape; reach for whatever expresses the idea most faithfully. The rules that follow are technique for wielding that palette well — don't rebuild what stock widgets already give you, validate data keys, states, and permissions — not a cage on what you may create.

It is the pipeline's escape hatch from the widget grid. Reach for it when the user wants **custom logic or interaction** a stock widget doesn't offer (bespoke controls, RPC panels, drag-and-drop, custom forms, client-side computation); when a **design or layout can't be reached with the default implementation** — free-form / overlaid / composite arrangements, a structure the dashboard grid system can't express, or **runtime interaction the locked grid can't give** (end-user resizing, moving, dragging, or freely positioning content; overlays or drawers floating over the dashboard; resizable splitters); when the user asks for a **special, branded, or modern custom-designed view**; or when **no stock widget fits the need** — the container is fully configurable, so it can be built to spec rather than forcing an ill-fitting stock widget. Outside those, stock catalog widgets remain the default. Concretely, the plan includes an htmlContainer when one of these triggers fires:

1. **Explicit ask** — `userRequirements` (or the use-case text itself) requests custom HTML, free-form layout, a specific composite experience (tabs-in-one-widget, slide-over drawer, master-detail split, kanban), or a third-party visualization library. An explicit ask wins even when a stock widget could cover the use case.
2. **Visual upgrade ask** — `userRequirements` asks for a noticeably prettier / branded / custom-designed view beyond what stock widget styling fields can express (custom typography, hero headers, card compositions, bespoke color systems). A preference the stock styling fields already cover — a single color, a theme, a chart palette — stays on stock widgets. **A dark theme / dark mode is handled separately and additively** — whatever widget mix the dashboard ends up with (stock widgets, htmlContainers, or both), a dark request also adds dashboard-wide dark CSS (`settings.dashboardCss`) so the stock widgets go dark alongside any htmlContainer. See "Dark mode" below; it is not an either/or with the Custom HTML path.
3. **Gap-filler** — a use case no stock widget can express: custom input forms beyond the stock entity dialogs (`action-create-entity-dialog` / `action-edit-entity-dialog`), arbitrary RPC control panels, drag-and-drop interactions, pixel-precise overlays, embedded external content, multi-state composition in one widget. Before invoking this trigger, sweep the catalog list above and confirm no stock widget covers the use case (e.g. "devices on a floor plan" is `indoor-map`, not a gap).
4. **Grid-bound limitation** — the requirement depends on runtime behavior the dashboard grid structurally cannot provide: end-user **resizing, moving, dragging, or freely positioning** content at view time, overlapping or overlaid panels, an overlay / drawer floating over the dashboard, a draggable splitter, or pixel-tracked / live-animated layout. Stock widgets occupy fixed grid cells the viewer cannot resize, move, or drag once the dashboard is saved — so when the design hinges on any of these, no stock widget can deliver it and the htmlContainer is the only path.

**This decision is mandatory, not optional.** When a trigger fires and a stock widget structurally cannot deliver the requirement, you MUST plan an htmlContainer — do not approximate it with the nearest stock widget and silently drop the capability the user asked for. That silent drop (settling for a stock widget that "almost" works and quietly losing the resize/overlay/custom-design the user wanted) is the exact failure this rule exists to prevent. When none of the triggers fire, do not plan an htmlContainer — a use case a stock widget covers is rendered with that stock widget.

**The decision is also live during generation, per widget.** It is not frozen at planning time. If you reach for a stock widget for a slot and then find the logic that slot needs exceeds what the stock widget can express, replace just that widget with an htmlContainer in place. The replacement keeps the same grid slot and stays in the same **general state alongside the surrounding stock widgets** — an htmlContainer is not restricted to standing alone on its own state. Swapping one slot does not turn the state into a composite container or a custom takeover; the other stock widgets are untouched.

**Partial gaps still trigger it — reuse stock widgets inside.** When only part of the goal exceeds stock widgets (the data is mostly standard, but the layout, interaction, or design is not), still use the htmlContainer — as a **parent** that hosts the reusable stock widgets via embedded `<tb-dashboard-state>` regions and supplies custom code only for the part that exceeds them. Decide that split yourself: which pieces become embedded states (stock widgets) and which become the custom frame / logic. Don't drop the htmlContainer just because some content could be a stock widget, and don't rebuild those stock pieces by hand.

**Three ways to configure it.** Once chosen, the container scales to the need — pick the shape that matches the requirement:

1. **As a single from-scratch widget** — one bespoke visual or control occupying a normal grid cell alongside stock widgets (a custom gauge, a branded KPI card, an RPC panel). Sized like any other widget; its `settings.html/css/js` build just that one element. This is also the shape for a mid-generation swap: when a stock widget you reached for can't carry its slot's logic, drop the htmlContainer into that same slot and leave the surrounding stock widgets in place.
2. **As a whole from-scratch view** — the container owns an entire state's area (typically full-width, `sizeX: 24`) and lays out a complete custom screen itself, top to bottom.
3. **As a placement host for ThingsBoard states** — the container's job is layout and navigation only; it embeds `<tb-dashboard-state>` regions and the states do the rendering. Those states are configured however a state can be — stock widgets, from-scratch widgets, or a mix — so this is how stock widgets and existing dashboard content appear inside the container. Prefer this whenever the content is standard data: the container frames and navigates, the states render (see "Decompose before authoring" below).

**Full freedom once triggered.** An htmlContainer may take over as much structure as the triggering requirement needs — up to composing several dashboard states inside one widget (`<tb-dashboard-state>`), owning navigation with a custom tab bar or drawer, or replacing a state's entire widget set with one container. Scope the takeover to the triggering requirement: a request for one branded KPI strip restyles that strip; it does not replace the state's widget set. When a composite container owns navigation between several states, host it in the root state (typically full-width, `sizeX: 24`); the embedded states remain regular non-root states with their own layouts and widgets, rendered inside the container instead of being navigated to. Accordingly, these rules are **exempted for htmlContainer widgets only**:

- State-content restrictions: an htmlContainer may appear in any state type, including `statistics` (chart-only rule) and `overview`, and in any row (header-zone rule).
- `switcherDetail` navigationWidget-only switching: an ANGULAR htmlContainer may own sub-view switching *inside itself* (its own tabs + embedded states, selection persisted in state params). When the plan replaces a planned `switcherDetail` with a composite htmlContainer, the stock `navigationWidget`/`stateSwitcher` pair is omitted rather than mixed with it — one switching mechanism per state, never both.
- Alias-owns-keys at config level: the widget's `config.datasources` is `[]`; its data wiring lives in `settings.js`.

Every rule not listed above still applies: layout grid placement (`sizeX/sizeY/row/col`, row coverage, no overlaps), UUID conventions, widget↔layout sync, permission gating, and the envelope/state assembly.

**Replacement validation — the safety net moves into the content.** For every htmlContainer in the plan, run the pre-save checklist in `widget-html-container` instead of Check 1 of the pre-write validation below. Its core checks mirror the same discipline: every data key referenced in the JS subscription must exist on the targeted profile (in the `entityProfiles` input, projected from the overview) (alias-owns-keys, enforced in JS), every referenced `stateId` must exist in the dashboard `states` map (drill-down kind-match's analog), cleanup must be registered, and write/RPC controls must respect `dashboardRole.permissions`.

In the C1/U2 plan, an htmlContainer widget entry replaces `aliasRef`/`keys` with a `contentSpec`: `{mode: "PLAIN"|"ANGULAR", pattern: "<nearest example pattern>", dataNeeds: [{profile, keys, latest|timeseries}], embeddedStateIds: [...], interactions: "<writes/RPC/navigation>"}`. `dataNeeds` is `[]` for a pure-composition container (tabs/drawer over embedded states) — the embedded states' widgets carry their own data and are validated by the normal checks.

**Decompose before authoring — embed what stock widgets cover, build what they don't.** When planning the `contentSpec`, split the container into a custom **frame** and the **content** it shows, then route each piece of content by one test: *can a stock widget express it?*

- **Yes → embed it.** Any standard visualization (chart, gauge, table, map, alarm list, value card) belongs in an **embedded state's stock widget** — design that state and list it in `embeddedStateIds` — not re-implemented in hand-written JS. The preference to embed exists for one reason: don't rebuild what the platform already provides.
- **No → build it.** For logic or visuals no stock widget expresses (a CDN chart/diagram library, drag-and-drop, a bespoke control/RPC panel, client-side computation, a custom-designed visual), write it yourself — a custom subscription feeding the container's own DOM (`dataNeeds`) plus the frame's own logic (selection, filters, navigation). This is the widget's purpose, not a fallback; configure it however the requirement needs and don't force-fit a stock widget onto something it can't deliver.

A composite container that only frames standard data is mostly `embeddedStateIds` with a small or empty `dataNeeds`; one whose whole point is custom logic is mostly hand-written. Both are correct — the split follows the content, not a fixed ratio. Validate the `contentSpec` against the checklist above before authoring any HTML/CSS/JS.

**A custom widget is itself an embeddable state — reuse it by combining states.** Only states are embeddable (never an individual widget), but an embedded state may hold *any* widget — a stock widget or a from-scratch htmlContainer. So when you build custom logic no stock widget covers, you are not limited to inlining it: place that htmlContainer on its own **general-purpose state** and surface it wherever it's needed by embedding that state. A composite container's `embeddedStateIds` may therefore point at states holding custom htmlContainer widgets, not only stock ones — list a custom-widget state in `embeddedStateIds` exactly as you would a stock-widget state. The embed-what's-standard rule is only about not rebuilding stock visuals by hand; it never means a composite container may embed stock widgets alone.

**Composite-container example.** One of the Step-1 reference dashboards the agent reads, `composite_html_container_dashboard.json`, is the canonical full-dashboard shape for showing ThingsBoard states and stock widgets inside a custom container: its root state holds one Angular htmlContainer that owns a tab bar and embeds dashboard states via `<tb-dashboard-state>`, while the tabbed views are ordinary non-root states populated with stock catalog widgets, each bound to its own alias. The structure it encodes — also the rules a composite htmlContainer must satisfy:

- The **root** state holds only the htmlContainer (full-width, `sizeX: 24`); it owns navigation. The views are regular non-root states.
- Every `stateId` the container's JS references exists in the `states` map and is populated with stock widgets; nothing about those states is special, so they pass the normal per-widget validation (alias-owns-keys, drill-down kind-match) — only the container takes the htmlContainer path.
- The widgets inside the embedded states reference normal aliases from the global `entityAliases` map; a detail-style embedded state binds its widgets to a `stateEntity` alias and receives the selected entity through `[syncParentStateParams]="true"` + `ctx.stateController.updateState(null, {entityId, entityName})`.
- The container's own `config.datasources` is `[]`; all its data wiring lives in `settings.js`.

The narrower per-interaction examples (master–detail split, slide-over drawer, kanban, ECharts heatmap, custom-timewindow analytics) are listed in `widget-html-container` — read the nearest match there for the JS/CSS detail of a specific interaction.

---


## One theme per dashboard — never mix light and dark

A dashboard has **one** visual theme, chosen once and applied to every widget on every state. The recurring failure is a dashboard where some widgets render dark and others light — it looks broken, not designed. It happens because theme gets decided **per widget or per generation pass** instead of once for the whole dashboard: each htmlContainer is hand-authored with its own background/text colors, and they drift apart from each other and from the stock widgets.

Make theme a single up-front decision and enforce it everywhere:

- **Decide light or dark once, before authoring any widget** — from `userRequirements` (a dark request → dark; otherwise light). It is a dashboard-level property, never a per-widget choice.
- **Every htmlContainer shares that one palette.** Do not let each container invent a one-off color scheme. They must all use the same surface/text/border/accent colors so containers match each other *and* the stock widgets. The robust way to guarantee this is the shared theme tokens (`var(--token)` defined once in `dashboardCss`) from `dashboard-dark-mode` — define the token set once and author every container against it. A light dashboard is the same discipline: pick one light palette and use it in every container; don't mix `#ffffff` cards in one widget with a differently-toned light scheme in the next, and never drop a dark panel into an otherwise-light dashboard.
- **Stock widgets must sit in the same theme as the containers.** A dark dashboard means `dashboardCss` + transparent widget backgrounds so the stock widgets go dark too (see "Dark mode"); a light dashboard means default stock widgets next to light containers. Never a dark container beside a default-light stock widget, or vice versa.
- **Match the existing theme on every later edit or addition.** When adding or editing a widget on a dashboard that already exists, detect the theme first — `configuration.settings.dashboardCss` present ⇒ dark; otherwise inspect the existing containers' palette — and author the new/edited widget to match. A widget added in the other theme is the most common way a previously-consistent dashboard becomes mixed.

## Dark mode

When `userRequirements` asks for a dark dashboard / dark mode / dark theme / night mode, pull the `dashboard-dark-mode` skill on demand. Dark mode has **two parts** and both are required: (1) set `configuration.settings.dashboardCss` — one CSS block recolors the whole page (canvas, widget surfaces, text, tables, charts, toolbar, htmlContainers); and (2) make per-widget `config.settings` fixes on every stock widget — a transparent `background` (color alpha `00`), because modern widgets paint their own opaque white background over the dark surface; and flip any hardcoded near-black text color (`#000000DE`) in value/label/title fields to light (`#FFFFFF`) so it stays visible. CSS alone darkens the page but leaves widgets white and some text invisible — the skill covers both steps.

This is **additive and orthogonal to the Custom HTML path** — it does not change which widgets the dashboard uses. Plan widgets exactly as you otherwise would (stock widgets by default; htmlContainers when their own triggers fire). Then, because dark mode was requested, also add `dashboardCss`. This closes the exact gap that makes a dark htmlContainer sit next to white stock widgets: the page CSS turns the stock widgets dark so the result is uniform.

`dashboard-dark-mode` covers both modes (dark-by-default vs. an explicit light/dark toggle button), the dark-gray palette, the CSS block, and the toggle widget. Pull it during template-filling whenever a dark request is present.

---


## Aliasing principles (apply to every datasource, every state)

These rules apply across all dashboards, not just customer-scoped ones — customer→asset is one common instance. Violating them produces empty tables, broken drill-downs, and widgets showing the wrong entity's data.

### Entity display-name field by kind

The human-readable identifier field differs by entity kind. When a widget renders an entity's "name" column, an action references the entity by label, or a detail state shows the entity's identifier, use the right field for the kind — TB rejects unknown keys silently (the column or label simply stays empty):

| Kind | Display-name field |
|---|---|
| DEVICE | `name` |
| ASSET | `name` |
| ENTITY_GROUP | `name` |
| ROLE | `name` |
| CUSTOMER | `title` (NOT `name` — TB rejects `name` on customer; `name` is read-only and duplicated from `title` for backward compat) |
| USER | `email` (primary identifier); `firstName` + `lastName` for human display |

Most failures come from CUSTOMER: a widget pointed at a customer alias with `dataKeys: [{name: "name"}]` shows blank cells because the customer record doesn't carry a writeable `name` key — use `title` instead. Same for `inputSchema` fields on actions, drill-down labels, and any place a "what to display" choice references the entity itself rather than a telemetry/attribute key.

### `resolveMultiple` must match the alias's actual cardinality

Set `resolveMultiple: true` whenever the alias **can return more than one entity** at runtime — even if a particular state of the data currently has one. Set it to `false` only when the alias is truly 1:1 (a single specific entity, a 1:1 relation, the logged-in user, etc.). Pick the value from the alias's semantics, not from the widget rendering it: a single-entity card pulled from a multi-entity alias still needs `resolveMultiple: true` so the alias resolves at all.

Rule of thumb by filter type:

| Filter type | Default | Why |
|---|---|---|
| `assetType`, `deviceType` (tenant-wide collection) | `true` | Collections by type are inherently multi-entity. |
| `entitiesByGroupName` | `true` | A group contains multiple members. |
| `entityList` (more than one entry) | `true` | Multiple entries by construction. |
| `assetSearchQuery` / `deviceSearchQuery` / `relationsQuery` with `fetchLastLevelOnly: true` and a 1:M / M:M relation | `true` | The relation can yield many leaves. |
| `assetSearchQuery` / `deviceSearchQuery` / `relationsQuery` for a 1:1 relation (e.g. the scope-asset from `currentCustomer` via 1:1 `Manages`) | `false` | Documented 1:1 — exactly one entity. |
| `singleEntity` | `false` | One specific entity by construction. |
| `stateEntity` | `false` | One UUID passed via `stateEntityParamName`. |
| `entityList` with a single entry | `false` | Effectively a `singleEntity`. |

When unsure (e.g. a `Manages` relation that's 1:1 today but could be 1:M tomorrow), prefer `true` — it's the safer default. `resolveMultiple: false` against an alias that returns N entities silently truncates to one, which looks like "the widget is empty / missing rows" to the user with no error in the console.

### Alias must resolve to the entity that owns the keys you're rendering

Every TB entity type (DEVICE, ASSET, CUSTOMER, USER) has its own telemetry / attribute / calculated-field keys. The alias backing a widget must resolve to the entity that **actually carries** the keys the widget renders — picking the wrong entity yields empty columns, empty gauges, and empty chart series.

Hard rules:

- **Pick the data entity from the widget's keys first**, then build the alias to resolve to that entity. Don't pick the alias first and discover its target doesn't carry the right keys.
- **CUSTOMER and USER are rarely data entities.** Neither carries domain telemetry / attributes — those live on the assets and devices the customer owns or the user is associated with. CUSTOMER and USER aliases are valid only as navigation pickers (tenant-admin browsing across customers) or as relation roots that walk down to the actual data entity. If you want "the customer's data" or "the user's data", that almost always means "the data on the asset/device they own / are associated with" — alias accordingly via a relation query.

### Drill-down must pass the entity the next state is built around

A row-click action navigates to a detail state designed around a specific entity kind (its profile keys, its child aliases). The drill-down's `setEntityId` passes the row's entity ID into the state param. If the row is a *different kind* of entity than the detail state expects, every alias in the detail state breaks — child aliases try to walk from the wrong root and resolve to nothing.

Hard rule: the entities in the **originating collection** must be of the **same kind** the detail state's primary alias resolves to. "District detail" → rows are Districts. "Device detail" → rows are Devices. If your collection's alias is resolving to an upstream relative (a parent Customer, a containing Building, etc.) instead of the kind the detail state expects, fix the collection alias — don't try to compensate in the detail state.

### Multi-hop navigation: two-step vs. single-alias deep walk

When the entities you need to surface are multiple relation hops from the alias root (e.g. `Customer --Manages--> District --Contains--> Sensor`, `Building --Contains--> Floor --Contains--> Room`, `Fleet --Has--> Vehicle --Reports--> Sensor`), pick one pattern — don't mix them on the same alias.

1. **Two-step navigation (preferred for collection → detail flows).** Root state lists the intermediate entity via a relation query with `maxLevel: 1`. Drill-down passes that intermediate entity's UUID to a detail state via the appropriate `stateEntityParamName`. The detail state's child aliases walk one hop further. Use this when the user benefits from seeing the intermediate level as its own page (e.g. picking a District before drilling into its sensors).
2. **Single-alias deep walk (`maxLevel ≥ 2`).** Skip the intermediate state by walking from the alias root all the way to the leaf entity in one alias, raising `maxLevel` to cover the chain length. TB filters only the **leaf-level** relation type (per `common-datasource-capabilities.md`), so this works cleanly when the structure is linear and the relation chain unambiguous — typically when intermediate levels have a single child profile. If the chain branches or relation types diverge confusingly, prefer pattern 1.

These rules combine with the `currentCustomer` section above as one common case: when the alias root is the logged-in customer, the data entity is the scope-Asset (not the Customer), the drill-down passes the scope-Asset (not the Customer), and Customer-to-leaf entities use one of the two multi-hop patterns above.

### Pre-write validation checklist (MANDATORY — run after building, before writing the JSON)

`htmlContainer` widgets are exempt from Check 1 only — their data wiring lives in `settings.js`, validated by the pre-save checklist in `widget-html-container` (see "Custom HTML path" above). Every other check applies to them unchanged.

Before calling `Write` to emit the dashboard JSON, walk the in-memory dashboard and run these three checks. Each must pass for every state, widget, and action. **Loud-fail with a specific error** that names the offending state / widget / action / key — do **not** silently fix one half of the dashboard (e.g. renaming the detail state's alias) while leaving the source widget pointing at the wrong entity kind. The fix must come from re-planning, not from local patching.

**Check 1 — Data-entity alignment per widget.** For every widget that renders telemetry / metric / alarm keys, resolve its datasource alias to the entity profile it ultimately points at (follow `assetType` / `deviceType` / `entitiesByGroupName` filters to the profile; follow `assetSearchQuery` / `deviceSearchQuery` / `relationsQuery` to the leaf profile via `assetTypes` / `deviceTypes` / leaf relation). Cross-reference each `dataKey.name` against the `entityProfiles` input (projected from the overview):

- The key must appear on that profile's `Telemetry:` or `Attributes:` sub-list in the overview, OR be a calculated-field output (a key annotated `(derived: …)` on that profile, defined by a `## Metrics` bullet whose owner is that profile).
- If the alias resolves to a CUSTOMER and any data key is not a built-in customer field (`title`, `address`, `city`, `country`, `email`, `phone`, etc.) **and** is not present on the customer group's attributes, that's the Customer-as-container violation. Stop with:

  `error: widget <widget-id> in state <state-id> uses alias "<alias-name>" (CUSTOMER kind) but renders key "<key>" that lives on <owner-profile> (ASSET/DEVICE). Customer is a container; either list <owner-profile> directly (pattern a) or restructure as customer-detail → asset-detail (pattern b). See design-dashboards entity-kind correctness rules.`

- For CUSTOMER aliases specifically, if a data key is literally `"name"` (a common mistake — `name` is the display field for DEVICE / ASSET / ROLE but for CUSTOMER the display field is `"title"`), stop with:

  `error: widget <widget-id> in state <state-id> uses CUSTOMER alias "<alias-name>" with dataKey "name". CUSTOMER's display-name field is "title", not "name". Replace the dataKey with "title".`

**Check 2 — Drill-down kind match per action.** For every action of type `drillDown` (or `openDashboardState` with `setEntityId: true`), determine:

- **Source kind**: the entity profile the originating widget's datasource alias resolves to (same resolution as Check 1).
- **Target kind**: the entity profile the target state's primary alias resolves to (the alias whose filter uses `stateEntityParamName` matching the action's `stateEntityParamName`).

The two kinds must match. The action passes the source row's UUID via `setEntityId`; if the target state's alias expects a different kind, every datasource and child alias in the target state breaks. Stop with:

  `error: drill-down from widget <widget-id> in state <source-state-id> to state <target-state-id> passes <source-kind> UUID via "<stateEntityParamName>" but the target state's primary alias expects <target-kind>. Source-list kind must match target-detail-state kind. See design-dashboards Rule 3 (Navigation explicitness).`

**Check 3 — Customer-level role entry point.** If `dashboardRole.userGroup.scope` is a customer group name (i.e. customer-level role), the root state's primary datasource alias must NOT resolve to a CUSTOMER kind. The root must open on the scope-asset (or its children) via `currentCustomer`. Per `ba-dashboard-overview-capabilities.md` Customer-Level Role and the `currentCustomer` section above. Stop with:

  `error: root state of customer-level dashboard for role "<role-name>" resolves to CUSTOMER kind via alias "<alias-name>". Customer is implicit (currentCustomer); root must open on the scope-asset reached via the Manages relation.`

**Check 4 — `currentCustomer` aliases use the `CURRENT_CUSTOMER` fallback type.** For every alias with `stateEntityParamName: "currentCustomer"` (and `rootStateEntity: true`), `defaultStateEntity` MUST be `{"entityType": "CURRENT_CUSTOMER", "id": "<real-customer-uuid>"}`. The `CURRENT_CUSTOMER` entity type tells TB to substitute the logged-in customer at runtime; the `id` is just the tenant-preview fallback. Two failure modes to catch:

- `defaultStateEntity.entityType == "CUSTOMER"` — locks the fallback to one specific customer at runtime, so every customer user sees that one customer's data instead of their own. Stop with:

  `error: alias "<alias-name>" uses stateEntityParamName="currentCustomer" but defaultStateEntity.entityType is "CUSTOMER" (locked to customer <uuid>). Must be "CURRENT_CUSTOMER" so TB resolves to the logged-in customer at runtime — the UUID becomes the tenant-preview fallback only.`

- `defaultStateEntity == null` — tenant preview renders blank. Stop with:

  `error: alias "<alias-name>" uses stateEntityParamName="currentCustomer" but defaultStateEntity is null. Set it to {"entityType": "CURRENT_CUSTOMER", "id": "<real-customer-uuid>"} so tenant-admin preview renders against the fallback UUID while customer-user sessions get the runtime currentCustomer.`

**Check 5 — `resolveMultiple` matches alias cardinality.** For every alias whose filter is inherently multi-entity, verify `resolveMultiple == true`. A `false` value silently truncates the result to one entity, breaking tables, maps, and any widget that expects a collection.

Fail when `resolveMultiple == false` AND the filter is one of:
- `assetType`, `deviceType` — tenant-wide collections by type.
- `entitiesByGroupName` — a group's members.
- `entityList` with more than one entry.
- `assetSearchQuery` / `deviceSearchQuery` / `relationsQuery` where the resolved leaf relation in the overview's `## Relations` has cardinality `1:M` or `M:M`, OR where the alias does not document a 1:1 relation explicitly.

Stop with:

  `error: alias "<alias-name>" has resolveMultiple=false but filter type "<filter-type>" is inherently multi-entity (or the underlying relation is not 1:1). resolveMultiple=false truncates the result to one entity, silently breaking the widget. Set resolveMultiple=true, or change the filter to a 1:1 shape (singleEntity / stateEntity / 1:1 relation query) if the alias really must return one entity.`

This check is the most common source of "the widget renders only one row when I expected the whole list" bugs — the alias works, the data exists, the filter is correct, but `resolveMultiple` silently caps the result.

These checks are cheap (a single pass over the in-memory state tree) and catch the entire class of "rendered the wrong entity's data" / "drill-down broke the detail state" bugs at the latest sensible moment, before they hit disk.

---


## Scoping to the current customer — `currentCustomer` root alias

When `dashboardRole.userGroup` is a customer-scoped controller (the scoped-controller pattern from `design-solution-architecture`: one Customer owns one scope-Asset and one controller User), the dashboard's root alias must resolve to the logged-in user's customer — never to a fixed UUID, never to a tenant-wide list. Use the reserved `currentCustomer` token in `assetSearchQuery` / `deviceSearchQuery` / `relationsQuery` aliases (reserved root-entity values are documented in `@/Users/steffensenchyna/.thingsboard/resources/prompts/solutions/dashboard/resources/state-datasource/common-datasource-capabilities.md`).

Example — root alias that fetches the District asset the current customer owns:

```json
{
  "id": "<aliasUuid>",
  "alias": "Current District",
  "filter": {
    "type": "assetSearchQuery",
    "resolveMultiple": false,
    "rootStateEntity": true,
    "stateEntityParamName": "currentCustomer",
    "rootEntity": null,
    "defaultStateEntity": { "entityType": "CURRENT_CUSTOMER", "id": "<fallback-customer-uuid>" },
    "direction": "FROM",
    "maxLevel": 1,
    "fetchLastLevelOnly": false,
    "relationType": "Manages",
    "assetTypes": ["District"]
  }
}
```

Key bits:
- `stateEntityParamName` is the literal string `"currentCustomer"` — the reserved token TB resolves to the logged-in user's customer at runtime.
- **`defaultStateEntity` must be `{"entityType": "CURRENT_CUSTOMER", "id": "<fallback-customer-uuid>"}`** — the special `CURRENT_CUSTOMER` entity type tells TB to use the logged-in customer's UUID at runtime; the `id` is only the fallback rendered when no customer is bound to the session (e.g. a tenant admin opening the dashboard for review). Pick the `id` from the customer-scoped customers of this dashboard (e.g. the first customer instance in `customerNameToId` whose profile matches the dashboard's scope). This single shape gives both runtime behaviors: customer-user sessions see their own data, tenant preview sees populated sample data.
- **Do not** use `{"entityType": "CUSTOMER", "id": "..."}` here — that locks the fallback to one specific customer regardless of who is logged in, so every customer user ends up seeing the hardcoded customer's data. Never leave `defaultStateEntity` as `null` either — that leaves tenant preview blank.

The same `stateEntityParamName: "currentCustomer"` + concrete `defaultStateEntity` pattern applies to `deviceSearchQuery` and `relationsQuery`. Omit `spec.entityId` on the root state — the scope-asset's UUID is resolved at runtime via the relation traversal. For tenant-scoped roles, use the standard tenant-wide aliases (`assetType`, `deviceType`) instead — `currentCustomer` is not appropriate there.

---


## State switching mechanism (switcherDetail states)

Sub-state switching inside a `switcherDetail` container is driven by exactly one widget pair, and no others:

- **`navigationWidget`** — the only widget allowed to change `subStateId`. Each one is a tab button targeting a single sibling sub-state; its `click` action runs the `custom` JS that sets `params.subStateId` and calls `widgetContext.stateController.updateState(...)`. One navigationWidget per sibling sub-state, all in the header row (`row: 0`) of the `switcherDetail`.
- **`stateSwitcher`** — a passive container, at `{ row: 1, col: 0, sizeX: 24, sizeY: 14 }`. It binds to the `stateEntity` alias and renders whichever sub-state the current `subStateId` points at. Its content updates because `subStateId` changed, not because anything was clicked on the container itself.

**The two are a pair — never add one without the other.** navigationWidgets are the *trigger* (they set `subStateId`); the stateSwitcher is the *renderer* (the only widget that displays the selected sub-state). A `switcherDetail` with nav tabs but no stateSwitcher is the most common switcher bug: clicking a tab changes the param but nothing on screen updates, so the tabs look dead. Whenever a `switcherDetail` has any navigationWidget, it MUST also contain **exactly one** stateSwitcher (`defaultSubStateId` = the first nav tab's `stateId`). Treat "add the nav tabs" and "add the stateSwitcher" as a single inseparable step.

Hard rules:

- Sub-state switching inside a `switcherDetail` is **exclusively** the navigationWidget's responsibility. Do not wire `updateDashboardState`, `openDashboardState`, or custom click functions onto any other widget class to switch sub-states.
- The `stateSwitcher` is a renderer, not an interactive widget — its `actions` map MUST be `{}`. Do not attach `click`, `rowClick`, or any other action slot.
- Do not use `actionButton` with a state-changing action to switch sub-states. If a user-facing control needs to switch sub-states, it MUST be a `navigationWidget`.
- Top-level state navigation (e.g. collection → standardDetail → switcherDetail) still uses `drillDown` / `openDashboardState` from `rowClick` / `tagActions` per the `action-*` catalog skills — those move between distinct dashboard states, not between sub-states inside a switcher. The rule above does not apply there.

Pre-write check (run alongside the validation checklist above): for every `switcherDetail` state, verify that (a) **if the state has any `navigationWidget`, it also has exactly one `stateSwitcher`** (this is the most-forgotten one — nav tabs with no renderer), (b) every widget targeting `subStateId` is a `navigationWidget`, (c) the `stateSwitcher`'s `config.actions` is `{}`, and (d) no other widget in the state has an action of type `updateDashboardState`. Loud-fail with whichever applies:

  `error: state <state-id> (switcherDetail) has <N> navigationWidget(s) but no stateSwitcher — the tabs set subStateId but nothing renders the sub-state. Add exactly one stateSwitcher (see "State switching mechanism").`

  `error: state <state-id> (switcherDetail) has widget <widget-id> (class <widget-class>) attempting to switch sub-states. Sub-state switching is navigationWidget-only — see "State switching mechanism".`

This split keeps the switcher predictable: navigationWidget owns the *trigger*, stateSwitcher owns the *render*. Treat any future "I need a different switching trigger" requirement as a design change, not a per-widget shortcut.

---


## Back navigation — pop the breadcrumb, never re-open the parent state

This applies to **any** "Back" / "Return" control, on any widget — a stock `actionButton`/`navigationWidget` with a custom action, an htmlContainer button, anything that takes the user back up the navigation trail.

ThingsBoard tracks visited states as a breadcrumb stack. Going "back" by **opening the parent state** — `drillDown`, `openDashboardState`, or `ctx.stateController.openState('<parent>', …)` / `updateState` to a target — **pushes a new entry** onto that stack instead of popping it. So Building → Floor, then "Back", yields Building → Floor → Building, and the trail keeps growing on every round-trip.

A back control MUST pop the stack instead:

```javascript
// custom action body / htmlContainer handler
ctx.stateController.navigatePrevState(index);   // index = ABSOLUTE breadcrumb level to return to
```

**`index` is the absolute position in the breadcrumb, not a "go back N" offset.** `0` is the **first/initial** state in the trail; the deepest level is `breadcrumbLength − 1`. So:
- **Return to the start / overview** (the common case for a 2-level root → detail dashboard): `navigatePrevState(0)`.
- **Step back exactly one level** from a deeper trail: pass the **parent's** index — `currentLevel − 1` (e.g. in a 3-deep trail Building→Floor→Room where Room is level 2, go back to Floor with `navigatePrevState(1)`; to Building with `navigatePrevState(0)`).

(`widgetContext.stateController.navigatePrevState(index)` in a stock-widget custom-action function — same API.) Use `drillDown` / `openDashboardState` / `openState` only to move **forward/into** a state, never to return to one already in the trail. The htmlContainer specifics are in `widget-html-container` (embedding pitfall 5).

When the `userRequirements` input is present, treat it as **higher priority than the defaults in this file**. The user has stated specific preferences for this dashboard — widget types, layout, colors, styling, visualizations — and those preferences override the generic rules below.

Use it at every decision point where this file gives you a default:

| Default in this file | When `userRequirements` overrides |
|---|---|
| State type / root state choice (overview vs collection vs standardDetail) | The user named a specific landing experience ("dark-themed floor-plan map on the root state", "single-page operator view", etc.). |
| Widget class for a given use case (e.g. `valueChartCard` for latest value + trend) | The user named a specific widget ("use a gauge", "pie chart instead of bar chart", "indoor map"). |
| Widget arrangement (placement hierarchy: cards → map/table → alarms/charts) | The user described a layout ("map at the top", "two cards side by side", "alarm table on the right"). |
| Colors, icons, marker styles, theme | The user named a color, palette, or theme. Apply to `widgetStyle`, marker `color`, chart series colors, etc. |
| Tooltip patterns and label content | The user named what to surface ("show only name and status", "include the address line"). |

Apply only what the user actually stated. Do **not** invent extra preferences. If `userRequirements` is empty or absent, follow the file's defaults unchanged.

**Every explicitly-named feature is a first-pass deliverable — do not ship a stripped version and wait to be asked again.** When `userRequirements` enumerates concrete interaction features or a quality bar — a drag-to-resize / draggable splitter, a full-calendar / schedule editor, a mat-drawer or mat-tab layout, named widgets, a "wow-effect"/presentation-quality design — treat each as required output of the **first** generation, not optional polish to add in a later round. Build the htmlContainer(s) that deliver them up front (the Custom HTML triggers above already make this mandatory). Producing a plain, minimal dashboard that omits the asked-for interactions and design — then layering them in only after the user complains — is a failure mode: it wastes round-trips and risks shipping the wrong thing for a deadline. Scan `userRequirements` for the full feature list before planning and account for every item in the plan.

When `userRequirements` conflicts with a hard rule (permission gating, schema field shape, alias resolution, the row-budget caps from `dashboard-state-layout-capabilities.md`), the hard rule wins — those rules exist so the dashboard JSON renders at all. Do not break schema or permissions to satisfy a styling preference. In that case, honour the spirit of the user's request as closely as the rules allow.

---


## UUID conventions

```bash
python3 -c "import uuid; [print(uuid.uuid4()) for _ in range(60)]"
```

Assign one UUID to each:
- The dashboard itself (`dashboard_uuid`)
- Every widget across all states (`{widgetName}_uuid`)
- Every unique datasource/alias (`{datasourceId}_alias_uuid`)
- Every action body (one per action, inline in the state spec)
- One `stateSwitcherUuid` per `switcherDetail` state (for the auto-injected stateSwitcher widget)
- One `stateSwitcherAliasUuid` per `switcherDetail` state — this is the UUID of that state's `stateEntity` alias (already assigned above as an alias UUID; just reference it here)

---


## Dashboard envelope & state structure

### Building state specs and entityAliases

For each state, produce a state spec object with ALL UUIDs pre-filled:

```json
{
  "stateId": "<kebab-case id>",
  "stateName": "<Human Name>",
  "stateType": "collection | standardDetail | switcherDetail | overview | statistics",
  "root": true | false,
  "autoFillHeight": true,
  "entityId": "<UUID of the specific entity this state focuses on — set when root:true and stateType is a detail/switcher (no parent passing an entity via param), or when any alias must use singleEntity. Omit for all other states.>",
  "entityProfiles": "<array of full profile objects from the entityProfiles input that are relevant to this state — include the primary profile plus any child profiles whose entities appear as related entities in this state>",
  "stateSwitcherUuid": "<pre-assigned uuid — only for switcherDetail states>",
  "stateSwitcherAliasUuid": "<uuid of the stateEntity alias — only for switcherDetail states>",
  "widgets": [
    {
      "class": "<widgetClass>",
      "uuid": "<widget-uuid>",
      "sizeX": N, "sizeY": N, "row": N, "col": N,
      "aliasUuid": "<alias-uuid>",
      "imageSourceAliasUuid": "<alias uuid of parent entity with floor plan — only for indoorMap>",
      "stateId": "<target sibling state id — only for navigationWidget>",
      "title": "<optional>",
      "keys": [ { "name": "<key>", "label": "<Label>", "type": "timeseries|attribute|entityField", "units": "<optional>", "decimals": N } ],
      "actions": {
        "rowClick":         { "type": "drillDown",             "uuid": "<action-uuid>", "targetStateId": "<id>", "stateEntityParamName": "<param>" },
        "headerButton":     { "type": "createEntityDialog",    "uuid": "<action-uuid>", "dialogTitle": "<title>", "entityType": "ASSET|DEVICE|CUSTOMER", "entitySubType": "<profile>", "entityOwner": "<stateParam or empty>", "targetEntityGroups": ["<profile>"] },
        "actionCellButton": [
          { "type": "editEntityDialog",    "uuid": "<action-uuid>" },
          { "type": "deleteEntityDialog",  "uuid": "<action-uuid>" },
          { "type": "changeOwnerDialog",   "uuid": "<action-uuid>" }  // optional — only when entity can be reassigned to a different customer
        ],
        "click":     { "type": "drillDown | createEntityDialog | editEntityDialog | deleteEntityDialog | custom", "uuid": "<action-uuid>", "targetStateId": "<id — for drillDown>" },
        "tagActions": [ { "type": "drillDown", "uuid": "<action-uuid>", "targetStateId": "<id>", "stateEntityParamName": "<param>" } ]
      }
      // Only include action slots that apply to this widget's class. Omit unused slots entirely.
    }
  ],
  "entityAliases": {
    "<aliasUuid>": { "id": "<aliasUuid>", "alias": "<Human Name>", "filter": { ... } }
  }
}
```

The **top-level `entityAliases` map** (a merged map of all aliases across all states, deduplicated by UUID) is accumulated incrementally in Step 4a as you generate each state. This is used during final assembly.

Set `autoFillHeight: false` for `switcherDetail` states.

---


### Assembling the dashboard envelope

```json
{
  "id": { "entityType": "DASHBOARD", "id": "<dashboard_uuid>" },
  "title": "<dashboardName>",
  "configuration": {
    "settings": {
      "stateControllerId": "entity",
      "showTitle": false,
      "showDashboardsSelect": true,
      "showEntitiesSelect": true,
      "showDashboardTimewindow": true,
      "showDashboardExport": true,
      "toolbarAlwaysOpen": true
    },
    "timewindow": {
      "selectedTab": 1,
      "history": { "historyType": 0, "timewindowMs": 604800000 },
      "aggregation": { "type": "NONE" }
    },
    "filters": {},
    "entityAliases": "<top-level entityAliases map accumulated across all states>",
    "widgets": "<merge all per-state widgets generated in Step 4: { ...state1.widgets, ...state2.widgets, ...stateN.widgets }>",
    "states":  "<merge all per-state stateLayout entries generated in Step 4: { ...state1.stateLayout, ...state2.stateLayout, ...stateN.stateLayout }>"
  }
}
```

Emit `settings` and `timewindow` verbatim — do not add, remove, or rename any field. **One exception:** when a dark theme was requested (see "Dark mode"), add the single field `settings.dashboardCss` with the dark CSS string from `dashboard-dark-mode`. No other field may be added.

**Post-assembly invariant checks:**
1. Every widgetUuid in `states[*].layouts.main.widgets` exists in top-level `widgets`.
2. Every `entityAliasId` in widget datasources exists in `entityAliases`.
3. Every `targetDashboardStateId` in actions exists in `states`.
4. Row coverage — for each state, verify that widgets use the full row budget (no partial rows; total rows match the state type budget from the layout capability file).

(UUID uniqueness is guaranteed by construction — main agent assigned all IDs.)

---


### State body & layout

### State body

```json
"<stateId>": {
  "id": "<stateId>",
  "name": "<Human State Name>",
  "root": <true for the state with id "root", false for all others>,
  "layouts": {
    "main": {
      "widgets": {
        "<widgetUuid>": { "sizeX": N, "sizeY": N, "row": N, "col": N }
      },
      "gridSettings": {
        "layoutType": "default",
        "backgroundColor": "#EEEEEE",
        "columns": "24",
        "margin": 10,
        "outerMargin": true,
        "backgroundSizeMode": "100%",
        "marginBetweenWidgets": "10",
        "applyMarginToSides": "true",
        "autoFillHeight": "true",
        "mobileAutoFillHeight": "false",
        "mobileRowHeight": "70"
      }
    }
  }
}
```

**`switcherDetail` states only:** set `autoFillHeight: "false"` and include only the header-row widgets
(headerCard, navigationWidget, connectRealDevices, actionButton) plus the auto-generated `stateSwitcher`
widget at `{ row: 1, col: 0, sizeX: 24, sizeY: 14 }`.

**Position invariant:** every widget UUID in `states[sid].layouts.main.widgets` must appear
in the top-level `widgets` map. The `sizeX`, `sizeY`, `row`, `col` values must be **identical**
in both places.

---


## Filling a widget from the plan

### Widget object outer shape

**All fields shown in a widget's `config` template (in its `widget-*` catalog skill) are required.** Do not omit any field that appears in the template. The only exceptions are fields explicitly annotated as optional (e.g. `units`, `decimals`, `minValue`, `maxValue` — omit these only when the entity profile does not define them for the key).

Every widget body wraps its `config` in this outer shape. `type` and `typeFullFqn` come from the widget's own `widget-*` catalog skill (each lists them at the top); never invent these values:

```json
{
  "id": "<widgetUuid>",
  "type": "<from the widget's catalog skill>",
  "typeFullFqn": "<from the widget's catalog skill>",
  "sizeX": N, "sizeY": N, "row": N, "col": N,
  "config": { ... }
}
```

For each state designed in Step 3, generate the full `{ widgets, stateLayout }` output **in this agent's context** — do not dispatch subagents.

**For each state, work through these sub-steps:**

### Build entityAliases for the state

Using the `alias-*` catalog skills (pull each alias type you need), produce the `entityAliases` map for the state. Key by `aliasUuid`; `id` inside each object must equal its map key.

Also accumulate every alias into the **top-level entityAliases map** (deduplicated by UUID) — needed for final assembly.

### Generate each widget's config

For each widget in the state spec:

1. Pull the matching `widget-<name>` catalog skill for the widget's `class`.
2. Copy the template from that skill exactly — do not omit any required field.
3. Substitute the pre-assigned UUIDs, aliasUuids, keys, and actions from the state spec.
4. For each action slot, pull the matching `action-<name>` catalog skill and fill the body.
5. Emit the completed widget object under the `widgets` map, keyed by the widget's UUID.

Use the example dashboard JSONs (read in Step 1) as the primary reference for field shapes. When a catalog skill's template is ambiguous about a field value or nesting, look at how the same widget class appears in the examples and match it exactly.

### Build the stateLayout entry

Emit the `stateLayout` entry per the **State body & layout** section above. `autoFillHeight` in `gridSettings` is `"false"` for `switcherDetail` states, `"true"` for all others.

For `switcherDetail` states: after generating the header-row widgets, auto-inject the `stateSwitcher` widget at `{ row: 1, col: 0, sizeX: 24, sizeY: 14 }` using `stateSwitcherUuid` and `stateSwitcherAliasUuid` from the state spec.

### Per-state validation checklist

Before moving to the next state, verify:

| Check | Rule |
|-------|------|
| Widget ↔ layout sync | Every UUID in `stateLayout.<stateId>.layouts.main.widgets` exists in `widgets` map with identical `sizeX`, `sizeY`, `row`, `col`. |
| Alias cross-references | Every `entityAliasId` in any datasource is a key in the state's `entityAliases`. |
| Alias `id` field | Inside each alias object, `id` equals the map key. |
| Row budget | Total rows used equals the budget for `stateType` (see layout capability). |
| Full row coverage | Every row's `sizeX` values sum to 24. Exception: switcherDetail partial header. |
| No overlaps | No two widgets share any grid cell. |
| Placement hierarchy | Cards at top → map/table → alarm/charts. |
| Header zone only | `headerCard`, `navigationWidget`, `actionButton`, `connectRealDevices` appear only at `row: 0`. |
| htmlContainer checklist | Every `htmlContainer` passes the pre-save checklist in `widget-html-container` (keys exist on profile, stateIds exist, mode matches template, bindings exposed, cleanup registered, permission gating). State-content rows below exempt `htmlContainer` per the Custom HTML path. |
| switcherDetail body | Exactly one `stateSwitcher` is present at `{ row: 1, col: 0, sizeX: 24, sizeY: 14 }` (REQUIRED whenever the state has navigationWidget tabs — without it the tabs do nothing), and no other body widgets. |
| typeFullFqn | Must match the typeFullFqn in the matching `widget-*` catalog skill exactly. |
| alarmTable datasource | Alarm data goes into `alarmSource`, not `datasources`. `datasources` must be `[]`. |
| alarmCount datasource | Uses `"type": "alarmCount"` with `dataKeys: [{name:"count", type:"count"}]`. |
| statistics state | Contains only chart widgets (`chart`, `rangeChart`, `stateChart`, `pieChart`) — plus `htmlContainer` when the Custom HTML path is active. |
| pieChart multi-entity label | When a `pieChart` uses a multi-entity datasource with a single `dataKey`, that key's `label` must be `"${entityName}"` — otherwise every slice gets the same hard-coded label. |
| overview state | No `headerCard`, no `navigationWidget`, no `actionButton`, no chart widgets. `htmlContainer` permitted when the Custom HTML path is active. |

Repeat these sub-steps for every state before proceeding to final assembly.

---


## Entity alias structure

`entityAliases` is a map keyed by `aliasUuid`. Each value has `id`, `alias`, and `filter`.
`id` inside the object **must equal** the map key.

**Using `spec.entityId` in aliases:**

| Situation | How to use `entityId` |
|-----------|----------------------|
| `singleEntity` alias | Set `singleEntity.id` to `spec.entityId` |
| Root detail/switcher state (`spec.root: true`, no `spec.stateEntityParamName`) | Set `rootStateEntity: false` and `rootEntity: { entityType: "...", id: spec.entityId }` in `assetSearchQuery`, `deviceSearchQuery`, and `relationsQuery` aliases instead of using `stateEntityParamName` |
| Sibling/detail state alias using `assetSearchQuery`, `deviceSearchQuery`, or `relationsQuery` with `rootStateEntity: true`, when the dashboard's root state is a fixed single entity (i.e., the root uses a `singleEntity` alias) | Also set `defaultStateEntity: { entityType: "...", id: "<root-entity-uuid>" }` — the **same UUID** used by the root's `singleEntity.id`. Mirrors the singleEntity rule so the alias resolves before any drill-down populates the state param. Example: a "House" root with sibling states for rooms — each room alias's `defaultStateEntity` is the house's UUID. |
| Any other state | Use `stateEntityParamName` from the spec; `entityId` is absent and `defaultStateEntity: null` |

## Action bodies

Actions are embedded inside widget `config.actions` slots. Each action body gets a fresh UUID.

## Icons

All widget icon names must come from `@/Users/steffensenchyna/.thingsboard/resources/prompts/solutions/dashboard/resources/icons.json`. Read the file once and pick the most semantically appropriate icon from the category that matches the widget's domain (e.g. "HVAC Control" for temperature, "Water Metering" for water sensors). Never invent icon names.

---

## Using `spec.entityProfiles` for widget keys

Before configuring any widget's `dataKeys`, look up the key definition in `spec.entityProfiles`. Use the profile metadata to set the following fields correctly — never invent or guess values for keys that are defined in the profiles:

| Profile field | Widget field | Notes |
|---|---|---|
| `telemetryType: "TIMESERIES"` | `type: "timeseries"` | |
| `telemetryType: "ATTRIBUTE"` | `type: "attribute"` | |
| `units` | `units` on dataKey and on config | Omit both when absent in profile |
| `dataType: "double"` | `decimals: 1` | Default for floating-point |
| `dataType: "integer"` | `decimals: 0` | |
| `dataType: "enum"` | widget type: `stateChart` | Use `enumValues` to build the `states` array in settings |
| `minValue` / `maxValue` | `minValue` / `maxValue` in gauge/progressBar settings | Omit when absent in profile |
| `classifier: "indoorLocationX"` | `xKey` on indoorMap marker layer | Key name for horizontal position |
| `classifier: "indoorLocationY"` | `yKey` on indoorMap marker layer | Key name for vertical position |
| `classifier: "image"` | `imageSource.entityKey` on indoorMap | Key name for the floor plan attribute |

Only include keys from `spec.entityProfiles` in datasources — do not add keys that are absent from the profiles.

---

## Permissions gating — when to emit CRUD actions and `allowRepositioning`

The assigned user's permission level is `dashboardRole.permissions`: one of `CRUD`, `RU`, or `R`. Use it to gate which action slots a widget emits, and whether map markers/polygons/circles can be repositioned. **A viewer role must not see create/edit/delete buttons or be able to drag markers.**

Create/edit/delete entity actions live on `entityTable` and map widgets only — do not wire `createEntityDialog` / `editEntityDialog` / `deleteEntityDialog` onto generic `actionButton` widgets or any other widget class. Each of `entityTable` and the map widgets independently gets its own CRUD actions when the role allows; one does not require the other on the same state. When both happen to share a state, each gets its full action set targeting the same entity type/profile.

| Permission | `entityTable` action slots | Map widget marker actions | Map widget layer edit | Map widget `mapActionButtons` |
|---|---|---|---|---|
| `CRUD` | `rowClick` (drillDown), `headerButton` (createEntityDialog), `actionCellButton` (editEntityDialog + deleteEntityDialog) | `tagActions` drillDown in tooltip, plus marker tooltip actions for edit/delete where applicable | `allowRepositioning: true` with `edit.enabledActions: ["add", "move", "remove"]` on every marker/polygon/circle layer | `mapActionButtons: [<placeMapItem action body>]` |
| `RU` | `rowClick` (drillDown), `actionCellButton` (editEntityDialog only — no create, no delete) | `tagActions` drillDown; no create/delete | `allowRepositioning: true` with `edit.enabledActions: ["add", "move", "remove"]` | omit |
| `R` | `rowClick` (drillDown) only — omit `headerButton` and `actionCellButton` entirely | `tagActions` drillDown only — no edit/delete actions in marker tooltips | `allowRepositioning: false` (the field defaults to omitted/false) | omit |

Apply this gate **per widget**, every time you generate one of these widget classes. If the rule says "omit," do not emit the slot at all — empty action arrays are also not allowed for slots the user can't access.

`fitMapBounds` stays `true` for `R`; for `RU` and `CRUD` it follows the existing rule (`true` unless any layer has `allowRepositioning: true`).
