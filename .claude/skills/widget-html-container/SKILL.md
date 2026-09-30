---
name: widget-html-container
description: "Renderable TB JSON template + authoring guide for the htmlContainer widget (system.html_container) — fully custom HTML/CSS/JS content, free-form layout, embedded dashboard states (which can host stock ThingsBoard widgets or another custom htmlContainer — only states are embeddable, not individual widgets), CDN libraries. Pulled on-demand by dashboard-generator when the custom-HTML path is active (userRequirements ask for custom/branded/prettier design, or no stock widget expresses the use case). Placeholders: <widgetUuid>, <Title>, <PLAIN|ANGULAR>, <html>, <css>, <js>."
user-invocable: false
---

# htmlContainer widget

Fully custom, self-contained content: you author the HTML (or Angular template), CSS, and JavaScript yourself. Unlike every other catalog widget this is NOT a fill-in-the-placeholders template — the `settings.html/css/js` fields hold content you write for the specific use case.

**Data path — custom subscription only.** ThingsBoard offers two ways to feed data into a widget: the widget's configured **datasources**, or a **custom subscription** created in code. **Static widgets do not support datasources** — and the htmlContainer is a static widget (`type: "static"`). So the only way to get data into the container's own content is a custom subscription created in `settings.js` (`ctx.subscriptionApi`, see **Live data** below); `config.datasources` stays `[]` and is ignored. (This applies to the container's own DOM. Stock widgets placed in **embedded states** are ordinary, non-static widgets — they keep their normal datasources and resolve data the usual way; the custom-subscription rule is only about the container itself.)

**No data-widget lifecycle — this is the failure that wastes the most time.** Because the container is static, the data-widget hooks never run: `config.datasources` is dead, and so is the widget's `onInit` / `onDataUpdated` path (`ctx.data` and `ctx.datasources` stay empty). Do **not** try to feed the container by populating `config.datasources` and writing a `self.onDataUpdate` / `onInit` handler, and **never flip the widget `type` away from `"static"`** (e.g. to `"latest"`) to force those hooks — that is always the wrong fix and breaks other things. There is also no implicit `self`: the JS body is bound to `this` (see **JS contract**), so write `this.…` — or alias it once at the top with `const self = this;` if you prefer the name. Every value the container shows comes from a `ctx.subscriptionApi` subscription you create in the JS — data keys via **Live data**, alarms via **Alarm data**.

## Embed what stock widgets cover; build what they don't

Route every piece of content by one test: *can a stock widget express it?*

- **A stock widget covers it → embed, don't rebuild.** "Custom content" does not mean hand-building visuals the platform already provides. When the container needs a chart, gauge, table, map, alarm list, or value card, render it by putting that stock ThingsBoard widget in a dashboard **state** and **embedding the state** (`<tb-dashboard-state>`, ANGULAR mode) — not by reimplementing it in custom JS. Need a temperature chart? Put a stock `chart` in a state and embed it. Need a device list, KPI card, alarm table, or map? Same.
- **No stock widget covers it → build it freely.** Hand-written rendering (a custom subscription feeding your own DOM, a CDN chart/diagram library, drag-and-drop, a bespoke control/RPC panel, client-side computation, a custom-designed visual) is exactly what this widget exists for — the kanban and ECharts-heatmap examples are this case. This is not a fallback or a last resort; when the requirement exceeds stock widgets, building custom is the right move, and the container is fully configurable to whatever the requirement needs.

**Only dashboard states are embeddable — there is no way to embed an individual widget — but a state may hold *any* widget, a stock widget or a from-scratch htmlContainer.** So custom logic you build for one need is reusable, not single-use: place that htmlContainer on its own **general-purpose state** and embed that state (combining states) wherever the logic is needed — including inside another htmlContainer. A composite container's embedded states can therefore hold custom htmlContainer widgets, not only stock ones. "Don't rebuild" is only about stock visuals the platform already provides; it never restricts a composite container to stock widgets.

The custom subscription (`ctx.subscriptionApi`, below) serves the build-it case and the frame's own logic (selection, filters, navigation). See **Composition** for the embedding mechanics.

This SKILL.md is the complete authoring reference for the widget. The patterns it describes ship as runnable dashboard JSON under `.claude/examples/widgets/html-container/` (table at the bottom) — those examples are the ground truth for field shapes and API usage.

**Before authoring, `Read` the nearest-matching example** from the table at the bottom — copy its structure and adapt. Precedence when sources disagree: the examples are ground truth for **field shapes and API usage patterns**; the envelope template below is authoritative for the **config field set** (an example may omit optional keys like `actions`); and the **pre-save checklist wins over example omissions** — when an example skips a checklist item (e.g. it acquires a subscription without registering teardown), add the missing piece while adapting. Normalize the widget-level `sizeX/sizeY/row/col` to your planned layout values — exported examples may carry stale widget-level sizes; foundations requires widget and layout entries to be identical.

## Envelope template

```json
{
  "id": "<widgetUuid>",
  "type": "static",
  "typeFullFqn": "system.html_container",
  "sizeX": <N>, "sizeY": <N>, "row": <N>, "col": <N>,
  "config": {
    "datasources": [],
    "showTitle": false,
    "backgroundColor": "rgba(255, 255, 255, 0)",
    "color": "rgba(0, 0, 0, 0.87)",
    "padding": "0",
    "title": "<Title>",
    "dropShadow": false,
    "enableFullscreen": <true|false — decide, see note>,
    "enableDataExport": <true|false — decide, see note>,
    "widgetStyle": {},
    "widgetCss": "",
    "pageSize": 1024,
    "noDataDisplayMessage": "",
    "configMode": "basic",
    "settings": {
      "type": "<PLAIN|ANGULAR>",
      "html": "<html — the template markup>",
      "css": "<css — styles scoped to the widget content (other widgets unaffected); template class names available>",
      "js": "<js — body of the widget function, see JS contract>",
      "resources": []
    },
    "actions": {}
  }
}
```

- `enableFullscreen` / `enableDataExport` are **a deliberate choice for this widget** — they only do something meaningful for chart / time-series and alarm content (a fullscreen view and a CSV/data export of plotted series). Set **both `true`** only when the container's primary content is a chart / time-series visualization (e.g. a CDN charting library like the ECharts heatmap, or a custom analytics panel of plotted series) where viewing fullscreen and exporting the data are useful. For everything else — control/RPC panels, kanban, tab frames, master–detail layouts, forms, embedded-state composition — set **both `false`** (there is nothing to expand or export). When unsure, default to `false`.
- `datasources` stays `[]` and `type` stays `"static"` — data wiring lives in `settings.js`.
- The transparent card defaults (`backgroundColor: "rgba(255, 255, 255, 0)"`, `padding: "0"`, `showTitle: false`) let the template own its background, radius, and spacing — every example does this.
- `settings.resources` lists external CDN scripts/styles in dependency order: `[{"url": "https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js", "isModule": false}]`. Keep `[]` when the JS uses only platform APIs. (ThingsBoard JavaScript modules from the platform Resource library can also be reused from the JS to share code across widgets.)
- In JSON string values use real newlines inside `html`/`css`/`js`, never doubled escapes.

## Configuration fields

The widget editor exposes a **Plain HTML / Angular** toggle, four content fields, and an **Actions** section. In the saved JSON they live under `config.settings` (and `config.actions`):

| Field | Holds |
|---|---|
| **Resources** (`settings.resources`) | External JS/CSS from a CDN, or uploaded ThingsBoard extension modules. Loaded **before** your JS runs; list in dependency order. |
| **CSS** (`settings.css`) | Styles, scoped to the widget content (other widgets unaffected); the template's class names are available here. **Scoping caveat:** TB prepends a per-widget selector to every rule, so an ancestor selector like `.tb-dashboard-page.dark .x` written here never matches. For dark/light theming that must flip with the dashboard, use **CSS custom properties** (`var(--token)`) defined at page level — see `dashboard-dark-mode` ("htmlContainer in dark mode"). |
| **HTML** (`settings.html`) | The markup. PLAIN → rendered as-is; ANGULAR → compiled as an Angular template (labelled *Angular HTML template* in the editor). |
| **JavaScript** (`settings.js`) | The widget logic — the body of the widget function (see JS contract). |

**Match the dashboard's one theme — never invent a per-container palette.** A dashboard has a single visual theme (see `dashboard-foundations` "One theme per dashboard"); the most common way a dashboard ends up with some widgets dark and some light is each htmlContainer hand-authoring its own colors. Before authoring `settings.css`, determine the dashboard theme and use **its** surface/text/border/accent colors — the same palette every other container and the stock widgets use. Author against the shared theme tokens (`var(--token)` defined in `dashboardCss`) so the container matches and flips with the rest; never hardcode a light scheme into one container and a different (or dark) scheme into another. This applies to **every** painted surface in the container, including secondary chrome — map legends, tooltips, popovers, overlays, badges, headers — which is exactly where a stray `background: #fff` slips a light patch into a dark dashboard. When editing an existing dashboard, detect the active theme first (`configuration.settings.dashboardCss` present ⇒ dark) and conform to it.

## Mode choice — PLAIN vs ANGULAR

| Pick | When |
|---|---|
| `"ANGULAR"` | The template needs Angular bindings (`{{ }}`, `*ngFor`, `*ngIf`), Angular Material components (`mat-table`, `mat-drawer`, …), or embedded dashboard states (`<tb-dashboard-state>`). |
| `"PLAIN"` | Self-contained DOM the JS builds/queries directly (`container.querySelector`, `innerHTML`) — CDN-library visuals, kanban boards, custom analytics panels. |

## JS contract

`settings.js` is the **body** of a function the widget provides — `f(ctx, container)` in PLAIN mode, `f(ctx)` in ANGULAR mode. It runs once after the template renders, **bound to the widget instance as `this`** (both modes). Resources from `settings.resources` are loaded **before** it runs, so their globals are already defined.

- `ctx` — the standard widget context: `ctx.subscriptionApi`, `ctx.detectChanges()`, `ctx.registerDestroyCallback()`, `ctx.stateController`, `ctx.aliasController`, `ctx.http`, `ctx.attributeService`, `ctx.actionsApi`.
- `container` — PLAIN mode only: the widget's content element, a raw DOM node (`<div class="tb-absolute-fill">`) wrapping the rendered template; query it with `container.querySelector(...)` and build DOM with `innerHTML`/`appendChild` — escape untrusted strings (device names, attribute values) before interpolating into `innerHTML`. In ANGULAR mode reach the root element via `ctx.$container[0]`, or `event.currentTarget.closest(...)` from a handler.

**ANGULAR binding rules:** the template binds to the widget instance (`this`) — **never `ctx.$scope`** (binding to `ctx.$scope` is the most common failure: the template renders literal `{{ }}` and empty rows). Expose every template-referenced value and handler by assigning to `this` (`this.devices = []`, `this.select = (d) => {…}`); define handlers as **arrow functions** so `this` is preserved; call `ctx.detectChanges()` after changing any template-bound value (especially inside subscription callbacks); set `this.ctx = ctx` when the template uses `<tb-dashboard-state [ctx]="ctx" …>`. Keep state the template never reads in ordinary local variables, not on `this`.

## Live data — custom subscription

```javascript
const subOpts = {
  type: 'latest', // or 'timeseries' for history
  datasources: [{
    type: 'entity',
    // PREFER an inline entity filter (most robust — nothing to resolve at runtime):
    entityFilter: { type: 'deviceType', deviceTypes: ['<profileName>'], deviceNameFilter: '', resolveMultiple: true },
    // …or a LITERAL entityAliasId string copied from the dashboard's entityAliases map
    //   (use this only for state-driven aliases — stateEntity / relationsQuery — that an
    //    inline filter can't express). Do NOT resolve ids via ctx.aliasController at top level
    //    (see note below — it is unavailable when this JS runs and the subscription silently never starts).
    // Subscribe to telemetry/attribute keys only. The entity's display NAME needs
    // NO dataKey — read it from entry.datasource.entityName (always a plain string).
    // Do NOT add { type: 'entityField', name: 'name' }: in a custom subscription that
    // key delivers the entity metadata OBJECT, which renders as [object Object].
    dataKeys: [
      { type: 'timeseries', name: '<key>', settings: {} },
      { type: 'attribute', name: '<key>', settings: {} }
    ]
  }],
  callbacks: {
    onDataUpdated: (subscription) => {
      // subscription.data: flat array, one entry per datasource × dataKey.
      // Each entry carries its datasource (entityId/entityType/entityName), its dataKey,
      // and a data array of [ts, value] pairs; latest = entry.data[entry.data.length - 1][1].
      // GROUP by entry.datasource.entityId and READ by entry.dataKey.name —
      // positional indexing by row produces empty/garbled tables.
      // entry.datasource.entityId IS the UUID string — use it directly as the group
      //   key; never entry.datasource.entityId.id (undefined → every entity collapses
      //   into one bucket and rows vanish).
      // entry.data[i][1] is a PRIMITIVE (number/string) — not a wrapped
      //   { longValue/doubleValue/strValue } object (that is the REST KvEntry shape,
      //   not the subscription shape). Use it as-is; Number(obj) would give NaN.
      // entry.datasource.entityName is the display name string — never derive the name
      //   from an entityField dataKey (see dataKeys note above).
      ctx.detectChanges(); // ANGULAR mode, after updating this.* values
    },
    onDataUpdateError: (subscription, e) => console.error(e)
  }
};
ctx.subscriptionApi.createSubscription(subOpts, true).subscribe((subscription) => {
  this.subscriptionId = subscription.id; // keep to remove on re-subscribe
});
```

- **`createSubscription(options, true)` returns a lazy Observable** — the subscription never starts until you call `.subscribe()` on it. The `true` second arg starts it immediately once subscribed.
- The canonical mapping from `subscription.data` to a model array:

  ```javascript
  this.devices = (subscription.data || []).map((entry) => {
    const ds = entry.datasource;
    const last = entry.data && entry.data.length ? entry.data[entry.data.length - 1] : null;
    return { entityId: ds.entityId, entityType: ds.entityType, name: ds.entityName, lastValue: last ? last[1] : '—' };
  });
  ```

  With multiple dataKeys, group entries by `entry.datasource.entityId` and pick each value by `entry.dataKey.name`.
- **Read the three subscription fields by their true shape** — getting any of these wrong produces empty rows or `[object Object]` even though the subscription delivers data:
  - `entry.datasource.entityId` is the **UUID string** — use it directly as the group key. `entry.datasource.entityId.id` is `undefined`, so every entity collapses into one bucket and rows go missing.
  - `entry.datasource.entityName` is the **display-name string** — read the name from here. Do **not** add an `{ type: 'entityField', name: 'name' }` dataKey: in a custom subscription it returns the entity metadata object, which renders as `[object Object]`.
  - `entry.data[i][1]` is a **primitive** (number/string), the value of the `[ts, value]` pair. It is **not** a REST-style `{ longValue, doubleValue, strValue }` wrapper — that shape only appears on the REST `KvEntry` API, never in subscription data. Use it as-is.
- For history, set `type: 'timeseries'` with either `useDashboardTimewindow: true` or your own `timeWindowConfig` — fixed window: `{selectedTab: 1, history: {historyType: 1, fixedTimewindow: {startTimeMs, endTimeMs}}, aggregation: {type: 'NONE', limit: 50000}}` (see the custom-timewindow example); realtime: `{selectedTab: 0, realtime: {realtimeType: 1, quickInterval: 'CURRENT_QUARTER', interval: <ms>}, aggregation: {type: 'AVG'}}`.
- **Valid `type` values are `'latest'`, `'timeseries'`, and `'alarm'` (alarm data — see below). There is no `'latestValues'`** or any other variant — an invalid type means the callback never fires and the widget stays silently empty. Use `'latest'` for the most recent value of a timeseries or attribute key, including calculated-field outputs stored with `saveLatest: true`; `'timeseries'` for history.
- **`onDataUpdated` is valid ONLY inside the subscription's `callbacks` object — never as a widget method.** `callbacks.onDataUpdated` (shown above) is the subscription callback and is correct/required. Writing `self.onDataUpdated = function(){…}` or `this.onInit = …` is the **data-widget lifecycle**, which is dead for a `static` widget — those handlers never fire and the widget stays empty. If you catch yourself assigning `onDataUpdated`/`onInit`/`onDataUpdate` onto `this`/`self`, that is the bug: move the logic into the subscription's `callbacks.onDataUpdated` at top level.
- **Resolve entities by inline `entityFilter` or a literal `entityAliasId` string — NOT by `ctx.aliasController.getEntityAliases()`.** At the top level where this JS runs, `aliasController` lookups are unreliable (often resolve to `undefined`), so the subscription is built with a missing datasource and silently never delivers data — a failure that looks identical to "no data on the widget." Use an inline `entityFilter` (mirrors the alias's filter: `deviceType`, `assetType`, `relationsQuery`, …) for the common cases. When you genuinely need a state-driven alias (`stateEntity`/`relationsQuery` keyed off the selected entity), set `datasources[].entityAliasId` to the **literal alias UUID string** from the dashboard's `entityAliases` map (the generator created that map, so the id is known) — do not look it up at runtime. Never hardcode an *entity* UUID in the filter — that drifts when the entity is recreated.
- `entityFilter` shapes mirror the alias filters (`deviceType`, `assetType`, …). Every `dataKeys.name` must exist on the targeted profile (in the `entityProfiles` input, projected from the overview) — the same alias-owns-keys discipline as stock widgets, enforced in the JS instead of the config.
- **Never bake generation-time constants into the JS — derive everything from the live subscription.** The generator runs in local mode where entity UUIDs, coordinates, and other per-entity values are all at hand, so it is tempting to embed them as JS constants. Do not: **a UUID assigned locally is not the UUID the widget sees at runtime.** `tb push` can match an existing instance entity by name and keep *that* entity's id, so the subscription delivers instance ids that differ from the local files — a `const DATA = { '<local-uuid>': {…} }` lookup keyed on those ids misses every row (counts read 0, markers never place, lookups return `undefined`). Concretely:
  - **No hardcoded entity UUIDs in JS** (lookup-map keys, marker ids, `if (id === '…')`). Group and join on values the subscription actually returns.
  - **No hardcoded per-entity data** like `latitude`/`longitude`/labels. Add them as `attribute` (or `timeseries`) dataKeys and read them from the subscription — create markers/render values only once that data arrives.
  - **Correlate two separately-resolved datasources by a stable shared key**, never by UUID equality across aliases: match on `entry.datasource.entityName` (or a shared attribute), or model the link as a **relation** and resolve it with a `relationsQuery` alias. Two aliases resolving "the same" entity do not guarantee matching ids in the data.
- Re-subscribing (e.g. range change): `ctx.subscriptionApi.removeSubscription(id)` first.

**Cleanup is mandatory.** The JS re-runs on every widget reload (dashboard navigation, edit/view switch, layout change) — anything not released leaks or piles up. Register teardown for everything acquired:

```javascript
ctx.registerDestroyCallback(() => {
  // data subscriptions: ctx.subscriptionApi.removeSubscription(id)
  // rxjs subscriptions (e.g. stateChanged.subscribe(...)): sub.unsubscribe()
  // plus: disconnect observers, clear setInterval/setTimeout timers,
  // abort in-flight requests, destroy chart/plugin instances
});
```

The callback runs exactly once, just before the widget is destroyed; register several if needed — they run in registration order.

## CDN visual libraries (charts, maps) — sizing and re-measure

A library that measures its container on init (ECharts, Leaflet, …) renders blank or wrong-sized when the widget is created **inside a dashboard state that isn't visible yet** — it sees a `0×0` box and never re-measures on its own. Maps especially: a hand-built Leaflet map shows grey tiles or nothing.

**Prefer the stock map widget first.** For a markers/polygons map, embedding the stock `outdoorMap`/`indoorMap` in a state (see **Composition**) handles sizing, tiles, clustering, and drill-down for you — only hand-build a CDN map when the requirement genuinely exceeds the stock widget. The same "embed what stock widgets cover" test applies to charts.

When you do hand-build a CDN visual, wire up all three or it renders blank:

- **Give the container an explicit pixel height** (`height: 500px; min-height: 500px`), not `height: 100%` — a percentage height collapses to `0` until the state is laid out, and the library inits at `0×0`.
- **Re-measure after init and on resize.** Call the library's re-measure hook — Leaflet `map.invalidateSize()`, ECharts `chart.resize()` — once shortly after init (so it picks up the real size after the state transition completes) **and** from a `ResizeObserver` on the element (the heatmap example does this for ECharts). Release the observer in `registerDestroyCallback`.
- **Guard against double-init.** The JS re-runs on every widget reload (state re-visit, edit/view switch); if the instance already exists, re-measure instead of constructing a second one — and destroy the old instance in the cleanup callback.

## Alarm data — alarm subscription (counts and lists)

Alarms do **not** come through a data subscription — a `dataKeys` entry of `type: 'alarmCount'` on a normal `createSubscription` never populates. Alarm counts and lists use a dedicated **alarm subscription**: subscription `type: 'alarm'`, an `alarmSource` (not `datasources`), and an explicit `subscribeForAlarms` call after it starts.

```javascript
const alarmSource = {
  type: 'entity',
  entityAliasId: '<aliasId from entityAliases>', // prefer an alias; inline entityFilter also works
  dataKeys: [
    { type: 'alarm', name: 'createdTime' },
    { type: 'alarm', name: 'originator' },
    { type: 'alarm', name: 'type' },
    { type: 'alarm', name: 'severity' },
    { type: 'alarm', name: 'status' }
  ]
};
const alarmPageLink = {
  page: 0,
  pageSize: 100,
  statusList: ['ACTIVE'],       // [] = all statuses
  severityList: ['CRITICAL'],   // [] = all severities
  typeList: [],                 // [] = all alarm types
  sortOrder: { key: { type: 'ALARM_FIELD', key: 'createdTime' }, direction: 'DESC' }
};
const alarmSubOpts = {
  type: 'alarm',                // the SUBSCRIPTION type — the key is `type`, not `widgetType`
  alarmSource,                  // alarm subscriptions use alarmSource, never datasources
  useDashboardTimewindow: true,
  callbacks: {
    onDataUpdated: () => {
      const page = this.critSub && this.critSub.alarms;  // the alarm page object
      this.critCount = page ? page.totalElements : 0;     // total across ALL matching entities
      ctx.detectChanges();
    }
  }
};
ctx.subscriptionApi.createSubscription(alarmSubOpts, true).subscribe((subscription) => {
  this.critSub = subscription;
  subscription.subscribeForAlarms(alarmPageLink, null);   // REQUIRED — without it no alarm data arrives
});
```

- **`type: 'alarm'`** is the subscription type (the option key is `type`, not `widgetType`). `alarmSource` replaces `datasources`; its `dataKeys` are `type: 'alarm'` referencing alarm fields (`createdTime`, `originator`, `type`, `severity`, `status`).
- **Call `subscription.subscribeForAlarms(pageLink, null)`** after the subscription starts — the count and list stay empty without it. The second arg is extra query params (`null` = defaults).
- **Read the count from `subscription.alarms.totalElements`**, not `subscription.data`. `subscription.alarms.data` is the current page of `AlarmInfo` objects; `totalElements` already aggregates across every matching entity, so never sum per-entity entries or index `[0]`.
- **Filter with `statusList` / `severityList` / `typeList`** (empty array = all). Use one subscription per distinct filter — e.g. one `CRITICAL`, one `WARNING`.
- **Reference an `entityAliasId`** from the dashboard's `entityAliases` rather than a hardcoded UUID — same rule as data subscriptions.
- **Store each alarm subscription on `this`** and release it in `registerDestroyCallback` (`ctx.subscriptionApi.removeSubscription(sub.id)`).

## Composition — show ThingsBoard states and stock widgets inside the container (ANGULAR)

An Angular htmlContainer can host the rest of the platform: it embeds whole **dashboard states**, and through them any **stock ThingsBoard widget** (charts, gauges, entity/alarm tables, maps, value cards). This is what turns the container into a frame around regular dashboard content — a branded shell, a tabbed multi-view panel, a master–detail or slide-over layout — instead of a from-scratch UI. Both work the same way: through `<tb-dashboard-state>`.

**Embed a state.** `<tb-dashboard-state [ctx]="ctx" stateId="<stateId>" [syncParentStateParams]="true"></tb-dashboard-state>` renders a whole dashboard state inside the widget. Use the static `stateId="..."` form for a fixed region, or the property binding `[stateId]="stateId"` when the JS swaps the embedded state dynamically (tabs).

**Show a widget — stock or custom.** There is no per-widget embed component — to surface any widget (a `chart`, `entityTable`, `simpleGauge`, `outdoorMap`, `alarmTable`, … or a from-scratch htmlContainer holding custom logic) inside the container, place it in a dashboard **state** and embed that state. A state may hold a single widget or a full layout; the state's widgets keep their own datasources/aliases and render exactly as they would on a normal state. So "put a temperature chart and an alarm table in my custom panel" means: build a state holding those two stock widgets and embed it with `<tb-dashboard-state>`. The same applies to a custom widget — build the bespoke logic once in an htmlContainer on its own state, then embed that state here to reuse it. The container owns layout, styling, and navigation; the embedded state's widgets own the data rendering.

Pair embedding with:

- **Pass the selected entity** to the embedded state: `ctx.stateController.updateState(null, {entityId: {entityType, id}, entityName})` — `null` stateId stays on the current state and merges params; the embedded state's `stateEntity` aliases resolve from it. Read current params with `ctx.stateController.getStateParams()`; navigate **forward/into** another state with `ctx.stateController.openState(stateId, params)`. To go **back**, use `ctx.stateController.navigatePrevState(0)` — `openState`/`updateState` push a new breadcrumb and must never be used for "back" (see Embedding pitfall 5).
- **Tab/sub-view selection** that survives deep links: write the choice into state params (`ctx.stateController.updateState(null, {subState})`) and react via `ctx.stateController.dashboardCtrl.dashboardCtx.stateChanged.subscribe(...)` — an rxjs subscription, release it in the destroy callback. See the composite-tabs example.
- Every `stateId` the template or JS references must exist in the dashboard's `states` map, populated with the stock widgets that state shows — each bound to its own alias (the `stateEntity` alias for detail states fed by `[syncParentStateParams]="true"`). The widgets inside those embedded states are validated by the normal per-widget checks (alias-owns-keys, drill-down kind-match), not by this widget's JS subscription checklist.
- **Angular Material is available** across ThingsBoard: `mat-table`, `mat-drawer`, `mat-expansion-panel`, `mat-progress-bar`, `mat-datepicker`, … Use the flex-based `<mat-table>` form and size its columns with `.mat-column-<name> { flex: …; }` in the CSS (see the slide-over-drawer example).

### Embedding pitfalls — these bite every time, get them right up front

These are the failures that cause the most rework with composite containers (tabbed views, master-detail, slide-over panels, custom sidebar/tab shells). Build them in from the start:

1. **Tab switching — use the `*ngIf`-per-tab pattern; do not rely on a single dynamic `[stateId]` binding.** A single `<tb-dashboard-state [stateId]="stateId">` whose `stateId` you reassign **frequently fails to switch** — the component reads `stateId` on creation and may ignore later input changes, so the view stays stuck on whatever it first rendered (often a state restored from the URL). The robust, always-works pattern is **one `<tb-dashboard-state>` per tab with a STATIC `stateId` literal, shown via `*ngIf`** — toggling `*ngIf` destroys and recreates the component, so each tab always initializes fresh:
   ```html
   <tb-dashboard-state *ngIf="activeTab === 'overview'" [ctx]="ctx" stateId="overview-view"   [syncParentStateParams]="true"></tb-dashboard-state>
   <tb-dashboard-state *ngIf="activeTab === 'map'"      [ctx]="ctx" stateId="map-view"        [syncParentStateParams]="true"></tb-dashboard-state>
   <tb-dashboard-state *ngIf="activeTab === 'stats'"    [ctx]="ctx" stateId="statistics-view" [syncParentStateParams]="true"></tb-dashboard-state>
   ```
   ```javascript
   this.activeTab = 'overview';                 // explicit default so a fresh open lands somewhere
   this.selectTab = (id) => { this.activeTab = id; ctx.detectChanges(); };  // flip directly — no stateChanged roundtrip needed to switch
   ```
   `selectTab` sets `activeTab` and calls `detectChanges()` directly — that alone switches the tab. Do **not** depend on `ctx.stateController.updateState(null,{param})` → `stateChanged` → flip-binding as the switching mechanism: `updateState` with a param-only change does not reliably fire `stateChanged` in all builds, so tabs go dead. (You may *additionally* write the choice to state params for deep-link/back-forward support and read it back on init — `this.activeTab = (ctx.stateController.getStateParams()||{}).activeTab || 'overview';` — but the direct `activeTab` flip is what actually changes the view.) Use a **distinct param key per container** (`activeTab` for root tabs, `detailTab` for a detail panel) so nested containers don't collide.

2. **The selected entity does NOT auto-flow into embedded sub-states — re-publish it.** `[syncParentStateParams]="true"` reads from the **current** state params; a drill-down that opened this container set the entity once, but embedded `stateEntity`-bound sub-states only resolve it if it is present in params **now**. On init, re-publish it, and **preserve it on every tab switch** (the `updateState` in step 1 merges params, so include it):
   ```javascript
   const p = ctx.stateController.getStateParams() || {};
   if (p.selectedSensor) ctx.stateController.updateState(null, { selectedSensor: p.selectedSensor, detailTab: this.detailTab });
   ```
   Forget this and the embedded detail widgets render empty even though the marker/table click "worked."

3. **For small detail content, prefer a direct subscription over embedding a `stateEntity`-bound stock widget.** Embedding a whole state just to show a few values (status badge, battery %, a couple of controls) is fragile — the `stateEntity` alias must resolve through the embed chain, and when it doesn't the panel is silently blank. The container already has the selected entity id; read the values directly with `ctx.subscriptionApi` (see Live data) and render them in your own DOM. Reserve embedded states for genuinely reusable, multi-widget views (a full chart panel, a map).

4. **Interactive chrome over an embedded map needs its own stacking context.** A header/tab bar drawn above an embedded `outdoorMap`/`system.map` will be unclickable — Leaflet's panes carry high z-index and swallow the clicks. Give the chrome `position: relative; z-index: 500; pointer-events: auto;` in the container CSS so it sits above the map layer.

5. **A "Back" button MUST pop the breadcrumb with `navigatePrevState`, never `openState`/`updateState` to a target.** Navigating "back" by opening a specific state (`ctx.stateController.openState('building', …)` / `updateState`/`openDashboardState`) **pushes a new entry onto the breadcrumb stack** — so Building→Floor then "Back" gives Building→Floor→Building, and it keeps growing on every round-trip. To actually go back, pop the stack:
   ```javascript
   this.goBack = () => ctx.stateController.navigatePrevState(0);  // 0 = the FIRST/initial state (returns to overview)
   ```
   `navigatePrevState(index)` takes the **absolute breadcrumb level** to return to (not a "go back N" offset): `0` is the first/initial state, the deepest is `length − 1`. For a typical 2-level root→detail dashboard, `navigatePrevState(0)` returns to the overview; to step back exactly one level in a deeper trail, pass the parent's index (`currentLevel − 1`). Use `openState`/`updateState` only to go **forward/into** a state (and `updateState(null, {...})` to merge params on the current state), never to return to one already in the trail. This is a **general navigation principle** (applies to any back control on any widget, stock or custom) — see dashboard-foundations "Back navigation".

6. **Every embedded `<tb-dashboard-state [ctx]="ctx">` needs `this.ctx = ctx` set in the JS — miss it and the container crashes on load.** The `[ctx]="ctx"` binding reads a `ctx` property off the widget instance (`this.ctx`) and passes it down as the embedded state's input — the JS function argument `ctx` is **not** auto-exposed to the template. If the JS only assigns the tab/selection state and handlers (`this.activeTab`, `this.selectTab`, …) but never `this.ctx = ctx`, the binding hands the embed `undefined`. `<tb-dashboard-state>` reads `ctx.stateController` immediately on init, so it throws **`Cannot read properties of undefined (reading 'stateController')`**. With an `*ngIf`-per-region shell (tabs, or a sidebar switching Monitoring/Devices/Alarms) the component is recreated on every switch, so the crash fires on initial load *and* every time a region changes. Fix — assign it once at the very top of the JS, before anything else the template binds:
   ```javascript
   this.ctx = ctx;   // REQUIRED whenever the template contains <tb-dashboard-state [ctx]="ctx" ...>
   ```
   This is the same rule stated in **JS contract → ANGULAR binding rules**; it earns its own pitfall because it is a hand-written-shell contract (not exercised by any stock widget) and the error message points at `tb-dashboard-state` internals, not at the missing assignment.

## Writes, RPC, and platform calls

- **REST calls:** `ctx.http` (Angular `HttpClient` — `.get/.post/.put/.delete(...).subscribe(...)`) with auth already handled — no `fetch`, no manual JWT.
- **RPC to a device:** `ctx.http.post('/api/rpc/twoway/' + entityId, {method, params}).subscribe({error, complete})` (or `/api/rpc/oneway/`). (`ctx.controlApi` needs a configured target device, which an htmlContainer doesn't have — it sends nothing here.)
- **Attribute write-back:** `ctx.attributeService.saveEntityAttributes({id, entityType}, 'SERVER_SCOPE', [{key, value}]).subscribe()` — see the kanban example.
- **Configured widget actions:** actions in `config.actions` have a source — *Widget header button* (a button TB adds to the widget header bar) or *JavaScript* (a named action your code triggers from any element you build): `ctx.actionsApi.invokeAction(event, '<actionName>', additionalParams?)`. `additionalParams` is an optional object handed to the action — a custom-function action reads it as its `additionalParams`; for navigation/state actions it merges into the target state params (e.g. pass the clicked entity).

**Permission gating still applies** (`dashboardRole.permissions`): render RPC buttons, write-back interactions (drag-to-update, forms), and create/delete controls only for roles whose permissions allow the operation — for `R` roles the content is read-only.

## Pre-save checklist (run for every htmlContainer widget)

| Check | Rule |
|---|---|
| Keys exist | Every `dataKeys.name` in the JS exists on the targeted profile (in the `entityProfiles` input, projected from the overview — a CF output is a key annotated `(derived: …)`). A pure-composition container whose JS creates no subscription passes this vacuously — the embedded states' widgets carry their own keys. |
| States exist | Every `stateId` in `<tb-dashboard-state>` / JS exists in the dashboard `states` map. |
| Mode matches template | Angular syntax (`{{ }}`, `*ngFor`, `mat-*`, `<tb-dashboard-state>`) ⇒ `settings.type: "ANGULAR"`. |
| Bindings exposed | ANGULAR: every template-referenced symbol is assigned to `this`; handlers are arrow functions; `ctx.detectChanges()` follows every bound-value update. |
| Subscription started | Every `createSubscription(...)` call has `.subscribe()` on its result (lazy Observable). |
| Subscription type valid | Every `createSubscription` uses `'latest'`, `'timeseries'`, or `'alarm'` — never `'latestValues'` or another invented type. |
| No data-widget lifecycle | The container never relies on `config.datasources`, `onInit`, the widget's `onDataUpdated`, or `ctx.data`; widget `type` stays `"static"`. Every displayed value comes from a `ctx.subscriptionApi` subscription. |
| Alarm data path | Alarm counts/lists use an alarm subscription (`type: 'alarm'` + `alarmSource` + `subscribeForAlarms`), reading `subscription.alarms.totalElements` — not a data subscription with `alarmCount`. |
| Alias over UUID | Each subscription references an `entityAliasId` from `entityAliases` when one exists, not a hardcoded entity UUID. |
| Cleanup registered | `ctx.registerDestroyCallback` releases subscriptions, observers, timers, plugin instances. |
| CDN globals | Libraries from `settings.resources` are accessed as `window.<global>`. |
| Permission gating | Write/RPC controls match the role's permission level. |
| Fullscreen/export deliberate | `enableFullscreen`/`enableDataExport` set `true` only when the container's primary content is a chart / time-series visualization; `false` otherwise. |
| Content non-empty | `settings.html` and `settings.js` are non-empty (never ship a blank container). |
| Tab switching wired | If tabs swap embedded `<tb-dashboard-state>`: one component per tab with a STATIC `stateId` + `*ngIf="activeTab===…"`, `activeTab` flipped directly in `selectTab` (not a dynamic `[stateId]` binding, not a `stateChanged`-only roundtrip) (pitfall 1). |
| ctx exposed to embeds | If the template contains `<tb-dashboard-state [ctx]="ctx" …>`: the JS assigns `this.ctx = ctx` at the top, before the embed binds. Miss it and the embed receives `undefined` and throws `Cannot read properties of undefined (reading 'stateController')` on load and every `*ngIf` re-create (pitfall 6). |
| Subscriptions wired | Every value the container shows comes from a top-level `ctx.subscriptionApi.createSubscription` with `callbacks.onDataUpdated` — no `self.onDataUpdated`/`onInit`, no `config.datasources` reliance, no `aliasController` lookup. |
| Subscription field shapes | Entities keyed by `entry.datasource.entityId` (the UUID string, never `.entityId.id`); display name from `entry.datasource.entityName` (never an `entityField:'name'` dataKey); values read from `entry.data[i][1]` as primitives (never unwrapped as `{longValue}`). |
| No baked-in constants | The JS hardcodes no entity UUIDs and no per-entity data (lat/lon, labels) — all of it comes from subscription dataKeys; cross-datasource joins match on `entityName`/shared attribute/relation, not on captured UUIDs. |
| CDN visual sized & re-measured | A hand-built CDN map/chart has an explicit pixel height, calls the library re-measure hook (`invalidateSize()`/`resize()`) after init and from a `ResizeObserver`, guards against double-init, and destroys the instance in cleanup. Stock map widget preferred where it fits. |
| Theme matches the dashboard | The container uses the dashboard's single theme palette (the shared `var(--token)` set) for every painted surface incl. secondary chrome — no one-off or opposite-theme colors. On an edit, the active theme was detected (`dashboardCss` present ⇒ dark) and matched. |
| Entity propagated | If embedded sub-states use a `stateEntity` alias: the selected entity is re-published into state params on init and preserved on tab switches (pitfall 2). |
| Map chrome clickable | Interactive chrome drawn over an embedded map has `position: relative; z-index; pointer-events: auto` (pitfall 4). |
| Back navigation pops | Any "Back" control uses `ctx.stateController.navigatePrevState(0)`, never `openState`/`updateState` to a target (pitfall 5). |

## Common Mistakes

| Mistake | Consequence / fix |
|---|---|
| Binding template data to `ctx.$scope` | The most common failure: template renders literal `{{ }}` and empty rows. Bind to `this`. |
| `settings.type: "PLAIN"` with Angular syntax in the template | Bindings render as literal text. Switch to `ANGULAR`. |
| Using `container` in ANGULAR mode | Not passed — bind through `this`; root element via `ctx.$container[0]` or `event.currentTarget.closest(...)`. |
| Plain `function` declarations for template handlers | Loses `this`; template calls break. Use arrow functions. |
| Missing `ctx.detectChanges()` after subscription updates | Template shows stale values until an unrelated change triggers rendering. |
| Not calling `.subscribe()` on `createSubscription(...)` | The Observable is lazy — the subscription never starts, `onDataUpdated` never fires. |
| Positional indexing into `subscription.data` | Empty/garbled tables. Group entries by `entry.datasource.entityId`, read by `entry.dataKey.name`. |
| `entry.datasource.entityId.id` as the group key | `.id` is `undefined` — `entityId` is already the UUID string. Every entity collapses into one bucket and rows vanish. Use `entry.datasource.entityId` directly. |
| `{ type: 'entityField', name: 'name' }` dataKey to get the display name | In a custom subscription that key delivers the entity metadata object → renders as `[object Object]`. Drop the key; read the name from `entry.datasource.entityName`. |
| Unwrapping `entry.data[i][1]` as `{ longValue/doubleValue/strValue }` | Subscription values are bare primitives; the wrapper shape is REST `KvEntry` only. The unwrap returns `undefined`. Use `entry.data[i][1]` as-is. |
| Baking local-file entity UUIDs into a JS lookup map / `if (id === '…')` | `tb push` can match an instance entity by name and keep *its* id, so runtime ids differ from local files — every lookup misses (counts 0, markers absent). Key on subscription values, never on captured UUIDs. |
| Hardcoding per-entity data (lat/lon, labels) as JS constants | Drifts and is wrong against the instance. Add it as an `attribute`/`timeseries` dataKey and read it from the subscription; render only once it arrives. |
| Joining two datasources by UUID equality across aliases | Separately-resolved aliases don't guarantee matching ids. Correlate by `entry.datasource.entityName`, a shared attribute, or a `relationsQuery` relation. |
| CDN map/chart with `height: 100%` inside a not-yet-visible state | Library inits at `0×0` and never re-measures → blank map / grey tiles. Use an explicit pixel height + `invalidateSize()`/`resize()` after init and from a `ResizeObserver`. |
| Hand-building a Leaflet map when the stock map widget fits | Reinvents sizing/tiles/drill-down. Embed the stock `outdoorMap`/`indoorMap` in a state unless the requirement truly exceeds it. |
| Authoring a container's colors independently of the dashboard theme | Containers drift into different palettes → some widgets light, some dark, looks broken. Use the dashboard's one theme/`var(--token)` palette in every container (see `dashboard-foundations` "One theme per dashboard"). |
| A stray `background: #fff` on secondary chrome (legend, tooltip, badge) in a dark dashboard | A light patch on a dark page. Theme **every** painted surface, not just the main card — use the theme token there too. |
| Drag/mouse tracking dies over an embedded state | The embedded widgets swallow `mousemove`. Track on `window` and add a `pointer-events: none` dragging class to the panes (see the master-detail example). |
| Tab click does nothing / one embedded state shows always | A single dynamic `<tb-dashboard-state [stateId]="stateId">` doesn't react to binding changes, and `updateState`→`stateChanged` may not fire on param-only changes. Use one `<tb-dashboard-state>` per tab with a STATIC `stateId` + `*ngIf="activeTab===…"`, and flip `activeTab` directly in `selectTab` (pitfall 1). |
| `<tb-dashboard-state [ctx]="ctx">` while the JS never sets `this.ctx = ctx` | The binding hands the embed `undefined`, and it throws `Cannot read properties of undefined (reading 'stateController')` on load and every `*ngIf` re-create (tab/sidebar switch). The JS argument `ctx` is not auto-exposed to the template — assign `this.ctx = ctx` at the top of the JS (pitfall 6). |
| `self.onDataUpdated`/`self.onInit` defined on the widget | Data-widget lifecycle — dead for `static` widgets, so it never fires. Put the logic in the subscription's `callbacks.onDataUpdated` at top level instead. |
| Building the subscription datasource from `ctx.aliasController.getEntityAliases()` | Unreliable at top-level run → datasource undefined → subscription silently never delivers. Use an inline `entityFilter`, or a literal `entityAliasId` string for state-driven aliases. |
| "Back" button keeps adding breadcrumbs (Building→Floor→Building→…) | The back handler uses `openState`/`updateState`/`openDashboardState`, which push a new state. Use `ctx.stateController.navigatePrevState(0)` to pop (pitfall 5). |
| Embedded detail panel renders blank after a marker/row click | The selected entity isn't in current state params. Re-publish it via `updateState` on init and preserve it on every tab switch (pitfall 2). |
| Header/tabs unclickable above an embedded map | Leaflet panes' z-index swallow clicks. Give the chrome `position: relative; z-index: 500; pointer-events: auto` (pitfall 4). |
| Shipping empty `settings.html`/`js` (or empty `markers`/`polygons` on an embedded map state) | A blank widget/map renders. Author real content; verify non-empty before saving. |
| `<table mat-table>` with `<td>`/`<tr>` | HTML parser foster-parents `<ng-container>` out of the table and column defs break. Use the flex-based `<mat-table>`/`<mat-cell>` form. |
| Bare CDN global (`echarts`, `Sortable`) | Editor linter flags it / undefined at runtime. Use `window.echarts`, `window.Sortable`. |
| `ctx.controlApi` for RPC | Sends nothing (no widget target device). Use `ctx.http.post('/api/rpc/twoway/<id>', …)`. |
| Filling `config.datasources` (with or without an `onDataUpdate`/`onInit` handler) | The widget is static and ignores it — the data-widget lifecycle never fires. All data wiring lives in a `ctx.subscriptionApi` subscription in the JS. |
| Flipping widget `type` off `"static"` to make `onDataUpdate` fire | Wrong fix; `type` stays `"static"`. The data path is the custom subscription, always. |
| `self` used but never defined | `self` is undefined — the JS body is bound to `this`, and there is no `onInit`/`onDataUpdate` lifecycle. Use `this`, or alias once with `const self = this;`. |
| Subscription `type: 'latestValues'` (or any invented type) | Not valid — the callback never fires and the widget stays empty. Use `'latest'`, `'timeseries'`, or `'alarm'`. |
| Alarm count via `dataKey.type: 'alarmCount'` on a data subscription | Never populates. Use an alarm subscription: `type: 'alarm'` + `alarmSource` + `subscribeForAlarms`, read `subscription.alarms.totalElements`. |
| Hardcoding an entity UUID in `entityFilter`/`alarmSource` when a dashboard alias exists | Fragile — drifts when the entity is recreated. Use `entityAliasId` from `entityAliases`. |
| Skipping `registerDestroyCallback` | Subscriptions/timers/observers leak across dashboard navigation and edit/view switches. |

## Examples (read the nearest match before authoring)

All under `.claude/examples/widgets/html-container/` — each is a complete dashboard JSON whose htmlContainer widget demonstrates the pattern:

| File | Mode | Pattern |
|---|---|---|
| `composite-tabs-angular.json` | ANGULAR | Custom tab bar swapping embedded `<tb-dashboard-state>` views; selection persisted in state params (deep-link/back-safe). |
| `master-detail-split-angular.json` | ANGULAR | Device list + detail pane with a live-draggable divider; detail embeds a state for the selected device. |
| `slide-over-drawer-angular.json` | ANGULAR | `mat-table` list; row click opens a ~70%-wide `mat-drawer` over the dashboard with custom cards, two RPC buttons (`ctx.http`), and two embedded states. |
| `kanban-cdn-library-plain.json` | PLAIN | Kanban board via SortableJS from CDN; drag between columns persists a status attribute (`ctx.attributeService`). |
| `heatmap-cdn-library-plain.json` | PLAIN | Custom ECharts visualization from CDN over live telemetry. |
| `custom-timewindow-analytics-plain.json` | PLAIN | Interactive analytics panel: own date-range + working-hours inputs driving a fixed-window `timeseries` subscription, KPIs, click-to-drill chart. |

---
