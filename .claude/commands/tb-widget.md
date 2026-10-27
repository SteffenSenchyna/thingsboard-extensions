# ThingsBoard Extension Widget Skill

Use this skill when the user asks to create, add, or build a new ThingsBoard extension widget component.

Follow these patterns exactly — they are derived from the working examples in `src/app/components/examples/`.

---

## The Widget Lifecycle Contract

ThingsBoard calls methods on the component by name via `ctx.$scope`. Every widget component **must**:

1. Assign itself to `ctx.$scope` in `ngOnInit` so ThingsBoard can call lifecycle methods
2. Implement `onDataUpdated()` — called by ThingsBoard whenever subscription data changes
3. Call `this.ctx.detectChanges()` at the end of `onDataUpdated()`

Optional lifecycle methods ThingsBoard will call if they exist:
- `onInit()` — called after the widget container is ready (use for DOM-dependent setup like reading border-radius)
- `onLatestDataUpdated()` — for latest-value widgets with separate latest data keys
- `onEditModeChanged()` — when the user toggles dashboard edit mode
- `onDestroy()` — cleanup (charts, subscriptions)

---

## Minimal Widget Component

```typescript
import { Component, Input, OnInit } from '@angular/core';
import { WidgetContext } from '@home/models/widget-component.models';
import { formatValue } from '@core/public-api';

@Component({
  selector: 'tb-my-widget',
  templateUrl: './my-widget.component.html',
  styleUrls: ['./my-widget.component.scss']
})
export class MyWidgetComponent implements OnInit {
  @Input() ctx: WidgetContext;

  values: { [key: string]: string } = {};

  ngOnInit(): void {
    this.ctx.$scope.myWidget = this;  // name must match what you register in widget JSON
  }

  public onDataUpdated(): void {
    for (const key of this.ctx.data) {
      if (key.data.length) {
        this.values[key.dataKey.label] = formatValue(
          key.data[0][1],
          key.dataKey.decimals ?? this.ctx.decimals,
          key.dataKey.units ?? this.ctx.units,
          false
        );
      }
    }
    this.ctx.detectChanges();
  }
}
```

Key points:
- `ctx.data` is an array; each entry has `.dataKey` (label, name, color, decimals, units, settings) and `.data` (array of `[timestamp, value]` tuples)
- `key.data[0][1]` is the latest value; `key.data[0][0]` is the timestamp
- Always prefer per-dataKey decimals/units with fallback to `ctx.decimals` / `ctx.units`
- Use `ctx.datasources[0].entityName` for the entity label

---

## Value Formatting

Two approaches — use `ValueFormatProcessor` when you need to reuse the formatter (e.g., for chart axes), use `formatValue` for one-off formatting:

```typescript
// One-off
import { formatValue } from '@core/public-api';
formatValue(value, decimals, units, false);  // false = don't append units symbol inline

// Reusable formatter (caches unit conversion logic)
import { ValueFormatProcessor } from '@shared/public-api';
const formatter = ValueFormatProcessor.fromSettings(this.ctx.$injector, {
  units: this.ctx.units,
  decimals: this.ctx.decimals
});
formatter.format(value); // returns formatted string
```

Cache `ValueFormatProcessor` instances in a `Map<string, ValueFormatProcessor>` keyed by dataKey label when iterating — see `example-table.component.ts` for the pattern.

---

## Widget Settings (Custom Config)

Widgets with custom settings follow a two-layer pattern:

### 1. Define the settings interface and defaults in the component file

```typescript
interface MyWidgetSettings {
  columnHeight: number;
  valueColor: ColorSettings;
  valueFont: Font;
}

export const myWidgetDefaultSettings: MyWidgetSettings = {
  columnHeight: 60,
  valueColor: constantColor('#212121'),
  valueFont: { family: 'Roboto', size: 30, sizeUnit: 'px', style: 'normal', weight: '500', lineHeight: '100%' }
};
```

### 2. Consume settings in ngOnInit

```typescript
import { ColorProcessor, ColorSettings, ComponentStyle, Font, constantColor, textStyle } from '@shared/public-api';

ngOnInit(): void {
  this.ctx.$scope.myWidget = this;
  const settings: MyWidgetSettings = { ...myWidgetDefaultSettings, ...this.ctx.settings };
  this.valueColor = ColorProcessor.fromSettings(settings.valueColor);
  this.valueStyle = textStyle(settings.valueFont);
}
```

### 3. Settings config component (Basic Config)

Extends `BasicWidgetConfigComponent` for the widget's configuration panel in the ThingsBoard UI:

```typescript
import { BasicWidgetConfigComponent } from '@home/components/public-api';
import { Store } from '@ngrx/store';
import { AppState } from '@core/public-api';
import { WidgetConfigComponent } from '@home/components/widget/widget-config.component';
import { WidgetConfigComponentData } from '@home/models/widget-component.models';

@Component({ selector: 'tb-my-widget-basic-config', templateUrl: '...' })
export class MyWidgetBasicConfigComponent extends BasicWidgetConfigComponent {
  configForm: FormGroup;

  constructor(
    protected store: Store<AppState>,
    protected widgetConfigComponent: WidgetConfigComponent,
    private fb: FormBuilder
  ) { super(store, widgetConfigComponent); }

  protected configForm(): FormGroup { return this.configForm; }

  protected onConfigSet(configData: WidgetConfigComponentData): void {
    this.configForm = this.fb.group({
      datasources: [configData.config.datasources],
      columns: [configData.config.datasources?.[0]?.dataKeys ?? []],
      actions: [configData.config.actions || {}]
    });
  }

  protected prepareOutputConfig(config: any): WidgetConfigComponentData {
    this.widgetConfig.config.datasources = config.datasources;
    this.widgetConfig.config.actions = config.actions;
    if (config.datasources?.[0]) {
      this.widgetConfig.config.datasources[0].dataKeys = config.columns;
    }
    return this.widgetConfig;
  }
}
```

### 4. Advanced/Settings config component

Extends `WidgetSettingsComponent` for the "Advanced" tab settings:

```typescript
import { WidgetSettingsComponent } from '@home/components/public-api';

@Component({ selector: 'tb-my-widget-advanced-config', templateUrl: '...' })
export class MyWidgetAdvancedConfigComponent extends WidgetSettingsComponent {
  form: FormGroup;

  protected settingsForm(): FormGroup { return this.form; }

  protected defaultSettings(): MyWidgetSettings { return myWidgetDefaultSettings; }

  protected onSettingsSet(settings: MyWidgetSettings): void {
    this.form = this.fb.group({
      columnHeight: [settings.columnHeight],
      valueColor: [settings.valueColor],
      valueFont: [settings.valueFont]
    });
  }

  protected prepareOutputSettings(settings: any): MyWidgetSettings {
    return settings;
  }
}
```

---

## Custom Subscription

When you need to subscribe to a different dataset than what the user configured (e.g., filter by entity attribute):

```typescript
import { WidgetSubscriptionOptions, formatValue } from '@core/public-api';
import {
  AliasFilterType, BooleanOperation, DataKeyType, Datasource, DatasourceType,
  EntityKeyType, EntityKeyValueType, EntityType, FilterPredicateType, widgetType
} from '@shared/public-api';

ngOnInit(): void {
  const datasources: Datasource[] = [{
    type: DatasourceType.entity,
    dataKeys: [{ name: 'temperature', label: 'Temperature', type: DataKeyType.attribute, decimals: 0, settings: {} }],
    entityFilter: { type: AliasFilterType.entityType, entityType: EntityType.DEVICE },
    keyFilters: [{
      key: { key: 'active', type: EntityKeyType.ATTRIBUTE },
      predicate: { type: FilterPredicateType.BOOLEAN, operation: BooleanOperation.EQUAL, value: { defaultValue: true } },
      valueType: EntityKeyValueType.BOOLEAN
    }]
  }];

  const options: WidgetSubscriptionOptions = {
    type: widgetType.latest,
    datasources,
    callbacks: { onDataUpdated: () => this.onDataUpdated() }
  };

  this.ctx.subscriptionApi.createSubscription(options, true).subscribe(sub => {
    this.ctx.defaultSubscription = sub;
    this.ctx.data = sub.data;
    this.ctx.datasources = sub.datasources;
  });
}
```

---

## ECharts Time-Series Widget

```typescript
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, DataZoomComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { ECharts } from '@home/components/widget/lib/chart/echarts-widget.models';
import { calculateAxisSize, measureAxisNameSize } from '@home/components/public-api';

// In ngOnInit — register echarts components ONCE
echarts.use([TooltipComponent, GridComponent, DataZoomComponent, LineChart, SVGRenderer]);

// In ngAfterViewInit — init chart
this.myChart = echarts.init(this.containerEl.nativeElement, null, { renderer: 'svg' });

// In onDataUpdated — push data to chart
const seriesData = this.ctx.data.map(key => ({
  data: key.data.map(([ts, val]) => ({ name: ts, value: [ts, this.valueFormatter.format(val)] }))
}));
this.option.series = seriesData;
this.myChart.setOption(this.option);

// ResizeObserver pattern
this.shapeResize$ = new ResizeObserver(() => this.myChart.resize());
this.shapeResize$.observe(this.containerEl.nativeElement);

// X-axis time window update
xAxis.min = this.ctx.defaultSubscription.timeWindow.minTime;
xAxis.max = this.ctx.defaultSubscription.timeWindow.maxTime;

// Dynamic axis offset (prevents label clipping)
const leftOffset = calculateAxisSize(this.myChart, 'yAxis', 'yAxis');
const leftNameSize = measureAxisNameSize(this.myChart, 'yAxis', 'yAxis', yAxisName);
this.option.grid[0].left = leftOffset + leftNameSize;
this.myChart.setOption(this.option, { replaceMerge: ['yAxis', 'xAxis', 'grid'], lazyUpdate: true });
```

Use `Renderer2` (not `innerHTML`) for building tooltip DOM elements to avoid XSS. Sanitize any user-controlled strings with `DomSanitizer.sanitize(SecurityContext.HTML, str)`.

---

## Module Registration

Add the component to `ExamplesModule` (or the relevant feature module):

```typescript
// examples.module.ts
@NgModule({
  declarations: [..., MyWidgetComponent, MyWidgetBasicConfigComponent],
  imports: [CommonModule, SharedModule, HomeComponentsModule, BasicWidgetConfigModule, WidgetConfigComponentsModule],
  exports: [..., MyWidgetComponent, MyWidgetBasicConfigComponent]
})
export class ExamplesModule {}
```

And export from the module's `public-api.ts`:
```typescript
export * from './my-widget/my-widget.component';
```

---

## ThingsBoard Widget Type JSON (what goes in the TB UI)

The widget component class name must match the `$scope` key you set in `ngOnInit`. In the ThingsBoard widget bundle JSON:

```json
{
  "controllerScript": "self.onInit = function() { ... }",
  "settingsSchema": "...",
  "dataKeySettingsSchema": "..."
}
```

The `ctx.$scope.myWidget = this` line is what connects your Angular component to ThingsBoard's controller script. The scope key (`myWidget`) must match how ThingsBoard invokes lifecycle methods (`self.ctx.$scope.myWidget.onDataUpdated()`).

---

## Dark Mode Support

ThingsBoard emits a `toggle-dark-mode` broadcast event whenever the user switches themes. To detect the current mode and react to changes, inject `broadcastService` via the widget controller script's `$injector`.

### Detecting dark mode

Check whether `.tb-dashboard-page` has the `dark` CSS class:

```javascript
const isDark = document.querySelector('.tb-dashboard-page')?.classList.contains('dark');
```

### Listening for theme changes (controller script / JS widget)

```javascript
self.onInit = function() {
  let broadcastService = self.ctx.$scope.$injector.get(
    self.ctx.servicesMap.get('broadcastService')
  );

  broadcastService.on('toggle-dark-mode', () => {
    let isDark = document.querySelector('.tb-dashboard-page')
      ?.classList.contains('dark');

    if (isDark) {
      // apply dark colors
      option.series[0].detail.rich.label.color = 'rgba(255,255,255,0.87)';
      option.series[0].detail.rich.value.color = '#FFF';
    } else {
      // apply light colors
      option.series[0].detail.rich.label.color = '#424242';
      option.series[0].detail.rich.value.color = '#171717';
    }

    chart.setOption(option);
  });
};
```

### Preferred approach: CSS custom properties

Avoid hardcoding colors for dark/light entirely by using ThingsBoard's CSS custom properties, which update automatically on theme change:

```scss
color: var(--tb-primary-500);
background: var(--tb-primary-bg);
```

Use `broadcastService` only when you need to imperatively update a non-CSS target (e.g., an ECharts `option` object).

### Listening from an Angular component

If you need to respond to dark mode inside an Angular component (not a controller script), inject `BroadcastService` via the widget's injector:

```typescript
import { BroadcastService } from '@core/public-api';

ngOnInit(): void {
  this.ctx.$scope.myWidget = this;
  const broadcastService = this.ctx.$injector.get(BroadcastService);
  broadcastService.on('toggle-dark-mode', () => {
    this.isDark = document.querySelector('.tb-dashboard-page')
      ?.classList.contains('dark') ?? false;
    this.updateColors();
    this.ctx.detectChanges();
  });
}
```

---

## Widget Types

Choose the right type before building — it determines what data ThingsBoard provides and which lifecycle methods fire.

| Type | Use when | Data shape |
|---|---|---|
| **Latest Values** | Showing current state: sensor cards, KPI tiles, status indicators | `data[i].data` = single `[ts, value]` pair |
| **Time-Series** | Visualizing history: charts, heatmaps, trend analysis | `data[i].data` = many `[ts, value]` pairs, sorted ascending |
| **RPC / Control** | Sending commands to devices: buttons, setpoints, toggles | No data subscription; uses `controlApi` |
| **Alarm** | Displaying or acting on alarms: tables, severity badges | Alarm objects via `defaultSubscription.alarms.data` |
| **Static** | Content independent of devices: info panels, navigation menus | No subscription at all |

Set `typeParameters()` in the widget controller script to communicate constraints back to ThingsBoard:

```javascript
self.typeParameters = function() {
  return {
    maxDataKeys: 1,                      // limit keys user can add
    datasourcesOptional: true,           // static widget — no datasource required
    dataKeysOptional: true,
    ignoreDataUpdateOnIntervalTick: true // don't re-call onDataUpdated on time ticks
  };
};
```

---

## Latest Values vs Time-Series Data Model

**Latest Values** — `data[i].data` always has exactly one element:
```javascript
// [timestamp_ms, value_as_string]
const [ts, raw] = self.ctx.data[0].data[0];
const value = parseFloat(raw); // values arrive as strings — always parseFloat before math
```

**Time-Series** — `data[i].data` has N elements sorted ascending by timestamp:
```javascript
// Latest value is the last element
const latest = self.ctx.data[0].data[self.ctx.data[0].data.length - 1];
// Full series for charting
self.ctx.data[0].data.forEach(([ts, val]) => { /* ... */ });
```

`onDataUpdated` fires both when new telemetry arrives **and** when the dashboard time window changes — always rebuild from the full dataset, don't append.

**Data key roles** — instead of matching keys by name, assign semantic roles via the Data key settings form so the widget is resilient to key renaming:

```javascript
function findByRole(role) {
  return self.ctx.data.find(d => d.dataKey.settings?.role === role);
}
const valueKey = findByRole('value');
const maxKey   = findByRole('max');
```

**Hijacking the widget title panel** (place it inside your layout):

```javascript
self.onInit = function() {
  self.ctx.$scope.title$ = self.ctx.dashboardWidget.title$;
  self.ctx.dashboardWidget.showTitle = false; // hide the default header
};
```
```html
<div class="my-title-area">{{ title$ | async }}</div>
```

---

## RPC Control Widget

RPC widgets send commands to devices. They don't subscribe to data by default (though you can add data keys and implement `onDataUpdated` too).

```javascript
self.onInit = function() {
  // One-way: fire and forget
  self.ctx.$scope.sendOneway = function() {
    self.ctx.controlApi.sendOneWayCommand('turnOn', {}, 5000)
      .subscribe(
        () => { self.ctx.$scope.status = 'sent'; self.ctx.controlApi.completedCommand(); },
        (err) => { self.ctx.$scope.error = err.error?.message; self.ctx.controlApi.completedCommand(); }
      );
  };

  // Two-way: wait for device response
  self.ctx.$scope.sendTwoway = function(value) {
    self.ctx.controlApi.sendTwoWayCommand('setTemp', { value }, 5000)
      .subscribe(
        (response) => { self.ctx.$scope.response = response; self.ctx.controlApi.completedCommand(); },
        (err)      => { self.ctx.$scope.error = err.error?.message; self.ctx.controlApi.completedCommand(); }
      );
  };
};
```

Always call `completedCommand()` in both success and error paths — it resets the internal execution state.

| Method | Signature | Returns |
|---|---|---|
| `sendOneWayCommand` | `(method, params, timeoutMs)` | Observable (completes on send) |
| `sendTwoWayCommand` | `(method, params, timeoutMs)` | Observable with device response payload |
| `completedCommand` | `()` | void |

---

## Alarm Widget

Alarm widgets subscribe to alarm data rather than telemetry.

```javascript
self.onInit = function() {
  const pageLink = self.ctx.pageLink(10); // page size
  self.ctx.defaultSubscription.subscribeForAlarms(pageLink, null);
  self.ctx.$scope.alarmSource = self.ctx.defaultSubscription.alarmSource;
};

self.onDataUpdated = function() {
  self.ctx.$scope.alarms = self.ctx.defaultSubscription.alarms.data;
  self.ctx.detectChanges();
};
```

**Alarm object properties:**

| Property | Type | Notes |
|---|---|---|
| `id.id` | string | Unique alarm ID |
| `type` | string | e.g. `"High Temperature"` |
| `severity` | string | `CRITICAL`, `MAJOR`, `MINOR`, `WARNING`, `INDETERMINATE` |
| `status` | string | `ACTIVE_UNACK`, `ACTIVE_ACK`, `CLEARED_UNACK`, `CLEARED_ACK` |
| `createdTime` | number | ms timestamp |
| `ackTs` | number | 0 if not acknowledged |
| `clearTs` | number | 0 if not cleared |
| `originatorName` | string | Source entity display name |

**Acknowledging / clearing alarms:**

```javascript
const alarmService = self.ctx.$scope.$injector.get(self.ctx.servicesMap.get('alarmService'));

self.ctx.$scope.ackAlarm = function(alarm) {
  alarmService.ackAlarm(alarm.id.id).subscribe(() => {
    alarm.status = 'ACTIVE_ACK';
    alarm.ackTs = Date.now();
    self.ctx.detectChanges();
  });
};

self.ctx.$scope.clearAlarm = function(alarm) {
  alarmService.clearAlarm(alarm.id.id).subscribe(() => {
    alarm.status = 'CLEARED_ACK';
    alarm.clearTs = Date.now();
    self.ctx.detectChanges();
  });
};
```

Enable server-side pagination by returning `hasDataPageLink: true` from `typeParameters()`.

---

## Static Widget

Static widgets have no datasource. Declare this in `typeParameters`:

```javascript
self.typeParameters = function() {
  return { datasourcesOptional: true, dataKeysOptional: true };
};

self.onInit = function() {
  // read settings, bind to scope, manipulate DOM — onDataUpdated never fires
  const title = self.ctx.settings.title || 'Default Title';
  self.ctx.$scope.title = title;
};
```

**Dashboard state navigation:**

```javascript
// Navigate to a state
self.ctx.stateController.openState('deviceDetails', { entityId: id }, false);

// Read current state and params
const currentState = self.ctx.stateController.getStateId();
const params = self.ctx.stateController.getStateParams();
const subState = params['subState']; // restore active tab on load
```

**Sub-state / tab navigation via actions:**

```javascript
// Actions tab in widget editor defines named actions — retrieve them:
const actions = self.ctx.actionsApi.getActionDescriptors('elementClick');

self.ctx.$scope.selectTab = function(tabName) {
  const action = actions.find(a => a.name === tabName);
  if (action) {
    self.ctx.stateController.updateStateParams({ subState: tabName });
    self.ctx.actionsApi.handleWidgetAction({}, action, null, null, null, tabName);
  }
};
```

The `action.name` must exactly match the **Action name** set in the widget's Actions tab.

---

## Custom Subscription — Full Reference

Expand on the basic pattern already documented above:

**Always unsubscribe before creating a new one** to prevent resource leaks:

```javascript
if (self.ctx.$scope.customSubscription) {
  self.ctx.$scope.customSubscription.unsubscribe();
}
self.ctx.subscriptionApi.createSubscription(options, true).subscribe(sub => {
  self.ctx.$scope.customSubscription = sub;
  self.ctx.defaultSubscription = sub;
  self.ctx.data = sub.data;
  sub.update(); // required to trigger initial data load
});
```

**Entity filter types:**

| Filter type | Use |
|---|---|
| `singleEntity` | One specific device/asset by ID |
| `entityList` | Multiple IDs of the same entity type |
| `entityName` | Name-prefix match |
| `deviceType` / `assetType` | All entities of a given profile |
| `relationsQuery` | Graph traversal — entities related to another |

**Key filter value types:** `STRING`, `NUMERIC`, `BOOLEAN`, `DATE_TIME`, `COMPLEX` (AND/OR of others).

```javascript
keyFilters: [{
  key: { type: 'TIME_SERIES', key: 'temperature' },
  valueType: 'NUMERIC',
  predicate: {
    type: 'NUMERIC',
    operation: 'GREATER',       // EQUAL, NOT_EQUAL, GREATER, LESS, GREATER_OR_EQUAL, LESS_OR_EQUAL
    value: { defaultValue: 30, dynamicValue: null }
  }
}]
```

**Available callbacks:**

```javascript
callbacks: {
  onDataUpdated:       () => { /* new time-series data */ },
  onLatestDataUpdated: () => { /* latest values updated */ },
  onDataUpdateError:   (sub, err) => { /* handle error */ },
  dataLoading:         (loading) => { self.ctx.$scope.loading = loading; }
}
```

**Post-processing** (transform values client-side):

```javascript
const options = {
  type: widgetType.timeseries,
  datasources,
  usePostProcessing: true,
  // postProcessingFunction is set per-dataKey in dataKey.postFuncBody
};
```

---

## Widget Patterns

### CRUD Entity Table

Wrap `<tb-entities-table-widget>` for server-side-paginated entity management:

```html
<tb-entities-table-widget [ctx]="ctx"></tb-entities-table-widget>
```

Enable pagination in `typeParameters`:
```javascript
self.typeParameters = function() { return { hasDataPageLink: true }; };
```

Action sources available for entity tables:
- `actionCellButton` — per-row button
- `rowClick` / `rowDoubleClick` — row selection
- `cellClick` — individual cell click

### Navigation & State

```javascript
// Breadcrumb — reconstruct from state history
const stateId  = self.ctx.stateController.getStateId();
const params   = self.ctx.stateController.getStateParams();

// Navigate forward
self.ctx.stateController.openState('details', { entityId: id, entityName: name }, false);

// Navigate back
self.ctx.stateController.navigatePrevState(false);
```

### Service Injection Pattern

Inject any ThingsBoard service by name:

```javascript
const $injector      = self.ctx.$scope.$injector;
const deviceService  = $injector.get(self.ctx.servicesMap.get('deviceService'));
const assetService   = $injector.get(self.ctx.servicesMap.get('assetService'));
const alarmService   = $injector.get(self.ctx.servicesMap.get('alarmService'));
const entityService  = $injector.get(self.ctx.servicesMap.get('entityService'));
const attributeService = $injector.get(self.ctx.servicesMap.get('attributeService'));
const broadcastService = $injector.get(self.ctx.servicesMap.get('broadcastService'));
```

From an Angular component: `this.ctx.$injector.get(ServiceClass)`.

---

## Advanced Patterns

### Timewindow Management

```javascript
// Jump to a specific absolute range
self.ctx.timewindowFunctions.onUpdateTimewindow(startMs, endMs);

// Example: show yesterday
const start = moment().subtract(1, 'day').startOf('day').valueOf();
const end   = moment().startOf('day').valueOf();
self.ctx.timewindowFunctions.onUpdateTimewindow(start, end);
```

### Widget-to-Widget Communication (Broadcast)

```javascript
// Send an event from widget A (typically via a widget action)
broadcastService.broadcast('my-event', { payload: 123 });

// Receive in widget B
broadcastService.on('my-event', (event, data) => {
  self.ctx.$scope.received = data.payload;
  self.ctx.detectChanges();
});
```

### Report / PDF Export Integration

Signal when the widget has finished rendering so PDF export captures complete content:

```javascript
self.onInit = function() {
  const reportService = self.ctx.$scope.$injector.get(
    self.ctx.servicesMap.get('reportService')
  );
  reportService.reportCallback = () => new Promise(resolve => {
    // resolve after data loads and chart renders
    self.ctx.$scope.onReadyForExport = resolve;
  });
};
// Call self.ctx.$scope.onReadyForExport() once the widget is fully rendered
```

### Debugging

- `console.log(self.ctx)` in any lifecycle method — output appears in DevTools Console
- Insert `debugger;` to pause execution; find widget code under `(no domain)` in DevTools Sources
- Network tab shows telemetry WebSocket frames and REST calls made by subscriptions

---

## Widget API Reference

### ctx (WidgetContext) — All Properties

| Property | Type | Description |
|---|---|---|
| `ctx.data` | `DatasourceData[]` | Array of data objects, one per data key. Updated on each refresh. |
| `ctx.datasources` | `Datasource[]` | Configured datasources with entity info and data keys. |
| `ctx.settings` | `object` | Widget settings defined by the settings schema. |
| `ctx.units` | `string` | Units configured on the widget level. |
| `ctx.decimals` | `number` | Decimal precision configured on the widget level. |
| `ctx.defaultSubscription` | `IWidgetSubscription` | Active data subscription — contains timewindow config, alarm data, legend data. |
| `ctx.widget` | `Widget` | Widget configuration object (config, layout, datasources). |
| `ctx.dashboardWidget` | `DashboardWidget` | Dashboard-level wrapper — title, visibility, styles. Set `showTitle = false` to hide default header. |
| `ctx.widgetConfig` | `WidgetConfig` | Shorthand for `ctx.widget.config` — title, colors, fonts, margins. |
| `ctx.$container` | `jQuery` | jQuery reference to the widget's root DOM element. |
| `ctx.$widgetElement` | `jQuery` | jQuery reference to the inner widget element (used for reading computed styles like `borderRadius`). |
| `ctx.$scope` | `object` | Angular scope for template bindings. Set properties here to expose them in HTML templates. |
| `ctx.$scope.$injector` | `Injector` | Angular dependency injector for accessing platform services. |
| `ctx.$scope.fb` | `FormBuilder` | Angular Reactive Forms builder. |
| `ctx.$injector` | `Injector` | Direct injector reference (same as `ctx.$scope.$injector`). |
| `ctx.servicesMap` | `Map<string,string>` | Maps service names to injection tokens. Use with `$injector.get()`. |
| `ctx.controlApi` | `RpcApi` | RPC command API (Control widgets only). |
| `ctx.subscriptionApi` | `SubscriptionApi` | API for creating and managing custom data subscriptions. |
| `ctx.actionsApi` | `ActionsApi` | API for triggering and reading configured widget actions. |
| `ctx.timewindowFunctions` | `TimewindowFunctions` | Functions to manipulate the widget's time window. |
| `ctx.stateController` | `StateController` | Dashboard state controller for navigation and URL state. |
| `ctx.dashboard` | `DashboardCtx` | Dashboard context (edit mode, white-labeling, etc.). |
| `ctx.detectChanges()` | `function` | Triggers Angular change detection. Always call after modifying `$scope` properties. |

---

### Lifecycle Methods — Full Reference

| Method | When it fires | Notes |
|---|---|---|
| `onInit()` | Once on widget load | Inject services, read settings, set up scope variables |
| `onDataUpdated()` | Every time subscription data changes | Always call `detectChanges()` at the end |
| `onLatestDataUpdated()` | Latest-value keys update separately from time-series | Used when `hasAdditionalLatestDataKeys: true` |
| `onResize()` | Widget container changes size | Call `chart.resize()` here |
| `onEditModeChanged()` | Dashboard enters/exits edit mode | |
| `onMobileModeChanged()` | Dashboard switches desktop ↔ mobile layout | |
| `onDestroy()` | Widget removed | Disconnect ResizeObservers, clear charts, unsubscribe |

---

### typeParameters() — All Fields

```javascript
self.typeParameters = function() {
  return {
    maxDatasources: -1,                  // -1 = unlimited
    singleEntity: false,                 // restrict to one entity
    maxDataKeys: -1,                     // -1 = unlimited per datasource
    dataKeysOptional: false,             // allow widget with no data keys
    datasourcesOptional: false,          // allow widget with no datasource (static widgets)
    hasDataPageLink: false,              // enable server-side pagination
    warnOnPageDataOverflow: true,        // show warning when data exceeds page size
    ignoreDataUpdateOnIntervalTick: false, // skip onDataUpdated on timer ticks (not new data)
    embedTitlePanel: false,              // expose widgetTitlePanel TemplateRef in HTML
    embedActionsPanel: false,            // expose widgetActionsPanel TemplateRef in HTML
    hasAdditionalLatestDataKeys: false,  // allow separate latest-value keys alongside time-series
    previewWidth: '100%',               // widget preview size in editor
    previewHeight: '100%',
    defaultDataKeysFunction: null,       // () => DataKey[] — pre-populate keys for new instances
    dataKeySettingsFunction: null        // () => schema — per-key settings schema
  };
};
```

---

### actionSources() — Declaring Clickable Regions

```javascript
self.actionSources = function() {
  return {
    'rowClick': {
      name: 'widget-action.row-click',  // i18n key shown in the Actions dialog
      multiple: false                    // only one action per source
    },
    'actionCellButton': {
      name: 'widget-action.action-cell-button',
      multiple: true,                   // multiple actions allowed
      hasShowCondition: true            // each action can have a show/hide condition
    }
  };
};
```

Triggering a declared action:

```javascript
const descriptors = self.ctx.actionsApi.getActionDescriptors('rowClick');
if (descriptors.length) {
  self.ctx.actionsApi.handleWidgetAction(
    $event,           // DOM event or null
    descriptors[0],   // action descriptor
    entityId,         // { entityType: 'DEVICE', id: '...' }
    entityName        // string
  );
}
```

---

### ctx.defaultSubscription Properties

| Property | Type | Description |
|---|---|---|
| `data` | `DatasourceData[]` | Same reference as `ctx.data` |
| `datasources` | `Datasource[]` | Same reference as `ctx.datasources` |
| `timeWindowConfig` | `object` | Current time window configuration |
| `timeWindow` | `object` | Resolved time window with `minTime` / `maxTime` ms values |
| `legendData` | `object` | Legend entries and visibility state (for charts) |
| `alarms` | `PageData<AlarmInfo>` | Alarm page data (alarm widgets only): `.data[]`, `.totalElements`, `.totalPages` |
| `firstDatasource` | `Datasource` | Shorthand for `datasources[0]` |
| `update()` | `function` | Force a data refresh |
| `subscribeForAlarms(pageLink, null)` | `function` | Activate alarm subscription (alarm widgets only) |
| `unsubscribe()` | `function` | Tear down the subscription — always call before replacing |

---

### Data Structures

**DatasourceData:**
```typescript
{
  dataKey: {
    name: string;        // raw key name (e.g. 'temperature')
    label: string;       // display label
    type: 'timeseries' | 'attribute' | 'entityField';
    units: string;       // may be empty string
    decimals: number;    // may be null — always fall back to ctx.decimals
    color: string;       // configured series color
    settings: object;    // values from the Data key settings form
  };
  data: [number, string][];  // [timestamp_ms, value_as_string]
  datasource: Datasource;
}
```

**Datasource:**
```typescript
{
  type: 'entity' | 'function';
  entity: { id: { entityType: string; id: string }; name: string };
  entityId: string;
  entityName: string;
  entityType: string;
  dataKeys: DataKey[];
}
```

**AlarmInfo:**
```typescript
{
  id: { id: string; entityType: 'ALARM' };
  type: string;
  severity: 'CRITICAL' | 'MAJOR' | 'MINOR' | 'WARNING' | 'INDETERMINATE';
  status: 'ACTIVE_UNACK' | 'ACTIVE_ACK' | 'CLEARED_UNACK' | 'CLEARED_ACK';
  createdTime: number;   // ms
  startTs: number;
  endTs: number;
  ackTs: number;         // 0 if not acknowledged
  clearTs: number;       // 0 if not cleared
  originator: { entityType: string; id: string };
  originatorName: string;
  details: object;       // custom JSON payload
}
```

---

### Settings Schema Field Types

Define the widget configuration form in the **Settings form** tab using a JSON array of field definitions.

**Base field shape:**
```json
{
  "id": "fieldId",
  "name": "Display Label",
  "group": "Optional Group Name",
  "type": "text",
  "default": "default value",
  "required": false,
  "condition": "return model.someToggle == true;"
}
```

**Complete type reference:**

| `type` | Renders | Value type | Special properties |
|---|---|---|---|
| `text` | Single-line input | `string` | — |
| `number` | Number input | `number` | — |
| `password` | Masked input | `string` | — |
| `textarea` | Multi-line input | `string` | `rows` |
| `switch` | Toggle | `boolean` | — |
| `select` | Dropdown | `string` | `items: [{value, label}]` |
| `radios` | Radio group | `string` | `direction: "row"/"column"`, `items` |
| `datetime` | Date/time picker | `number` (ms) | `dateTimeType: "date"/"time"/"datetime"`, `allowClear` |
| `color` | Color picker | `string` hex | — |
| `color_settings` | Advanced color picker | `object` | Modes: constant, range, function |
| `font` | Font picker | `object` | `{size, sizeUnit, family, weight, style, lineHeight}` |
| `units` | Units selector | `string` | — |
| `icon` | Icon picker | `string` | — |
| `cssSize` | Size + unit input | `string` | — |
| `json` | JSON editor | `object` | — |
| `html` | HTML editor | `string` | — |
| `css` | CSS editor | `string` | — |
| `javascript` | JS editor | `string` | — |
| `markdown` | Markdown editor | `string` | — |
| `fieldset` | Collapsible group | — | Wraps child fields |
| `array` | Repeatable list | `array` | `items: [field, ...]` defines sub-fields |
| `htmlSection` | Static HTML block | — | `html` property for rendered content |

**`array` type example:**
```json
{
  "id": "thresholds",
  "name": "Thresholds",
  "type": "array",
  "items": [
    { "id": "label", "name": "Label", "type": "text" },
    { "id": "value", "name": "Value", "type": "number", "default": 0 },
    { "id": "color", "name": "Color", "type": "color", "default": "#f44336" }
  ]
}
```
Access in widget: `self.ctx.settings.thresholds` → array of `{ label, value, color }` objects.

**`color_settings` value shape:**
```json
{
  "type": "constant",
  "color": "#000",
  "rangeList": {
    "range": [
      { "from": 0,  "to": 20, "color": "#2196f3" },
      { "from": 20, "to": 30, "color": "#4caf50" },
      { "from": 30, "to": null, "color": "#f44336" }
    ]
  },
  "colorFunction": "if (value > 30) return 'red'; return 'green';"
}
```

**Conditional field visibility:**
```json
[
  { "id": "showIcon", "type": "switch", "default": true },
  { "id": "icon",     "type": "icon",   "condition": "return model.showIcon == true;" }
]
```

---

### Services Reference

Inject any service via `$injector.get(ctx.servicesMap.get('serviceName'))`.

| Service name | Description |
|---|---|
| `utils` | Utility functions (`deepClone`, etc.) |
| `attributeService` | Read/write entity attributes |
| `entityRelationService` | Query and manage entity relations |
| `deviceService` | Device CRUD |
| `assetService` | Asset CRUD |
| `customerService` | Customer CRUD |
| `userService` | User CRUD |
| `alarmService` | Alarm operations (ack, clear, query) |
| `entityService` | Generic entity operations |
| `broadcastService` | Inter-widget broadcast events |
| `translate` | i18n translation |
| `entityGroupService` | Entity group operations (PE only) |

**Read attributes:**
```javascript
attributeService.getEntityAttributes(
  { entityType: 'DEVICE', id: deviceId },
  'SERVER_SCOPE',
  ['firmware', 'model']
).subscribe(attrs => {
  // attrs = [{ key, lastUpdateTs, value }, ...]
});
```

**Save attributes:**
```javascript
attributeService.saveEntityAttributes(
  { entityType: 'DEVICE', id: deviceId },
  'SERVER_SCOPE',
  [{ key: 'firmware', value: '2.0' }]
).subscribe(() => { /* done */ });
```

**Query relations:**
```javascript
relationService.findInfoByQuery({
  filters: [{ relationType: 'Contains', entityTypes: [] }],
  parameters: {
    rootId: entityId,
    rootType: 'ASSET',
    direction: 'FROM',
    maxLevel: 1
  }
}).subscribe(relations => {
  // relations = [{ from, to, fromName, toName, type }, ...]
});
```

---

## Common Imports Reference

| What | Import path |
|---|---|
| `WidgetContext` | `@home/models/widget-component.models` |
| `formatValue`, `isDefinedAndNotNull`, `isNumeric` | `@core/public-api` or `@core/utils` |
| `ValueFormatProcessor`, `DataKey`, `ColorProcessor`, `ColorSettings`, `Font`, `ComponentStyle`, `constantColor`, `textStyle`, `iconStyle`, `backgroundStyle`, `overlayStyle` | `@shared/public-api` |
| `BasicWidgetConfigComponent`, `HomeComponentsModule`, `WidgetConfigComponentsModule` | `@home/components/public-api` |
| `WidgetConfigComponent` | `@home/components/widget/widget-config.component` |
| `AppState` | `@core/public-api` |
| `Store` | `@ngrx/store` |
| `ECharts` | `@home/components/widget/lib/chart/echarts-widget.models` |
| `TbTimeSeriesChart` | `@home/components/widget/lib/chart/time-series-chart` |
| `BroadcastService` | `@core/public-api` |
| `WidgetSubscriptionOptions`, `formatValue`, `isDefinedAndNotNull`, `isNumeric` | `@core/public-api` |
| `AliasFilterType`, `DatasourceType`, `DataKeyType`, `EntityKeyType`, `EntityKeyValueType`, `EntityType`, `FilterPredicateType`, `widgetType` | `@shared/public-api` |

---

## Reference: Multi-Widget Bundle as a Full Dashboard

Source: [`thingsboard/gateway-management-extensions`](https://github.com/thingsboard/gateway-management-extensions) (Apache 2.0). Official ThingsBoard example demonstrating how a single widget-extension JS bundle can power an entire dashboard experience.

### Pattern

A single ng-packagr build produces one `gateway-management-extension.js` that **registers 7 distinct standalone widget components** (statistics, RPC, form, configuration, logs, command, connectors). The ThingsBoard dashboard composes them by placing each selector as a separate widget — all bound to the same `device` entity. Inside each widget, multi-view navigation uses `mat-tab-group` + `tb-toggle-select` + `@if` blocks — **never Angular Router**. Cross-widget state flows through device attributes (`CLIENT_SCOPE` / `SHARED_SCOPE`) rather than an in-app store.

**Key takeaway:** "Whole dashboard in one widget" is really **"whole dashboard from one JS bundle that exposes many widgets."** Don't try to cram a full app into one widget slot — split the UX into focused widget components, ship them in one bundle, and let dashboard layout compose them.

### Folder structure

```
src/app/
  public-api.ts                          # re-exports gateway/public-api
  scss/
  gateway/
    gateway-extension.module.ts          # NgModule registering all widgets
    public-api.ts
    assets/
      connector-default-configs/         # JSON templates per protocol
      locale/                            # i18n bundles (15+ languages)
    shared/
      abstract/ components/ datasources/
      directives/ models/ pipes/
      public-api.ts
    states/                              # one folder per "page" widget
      gateway-configuration/
        components/ models/ services/
        gateway-configuration.component.{ts,html,scss}
        public-api.ts
      gateway-connectors/
      gateway-statistics/
      gateway-service-rpc/
      gateway-remote-shell/
      gateway-form/
      gateway-logs/
      device-gateway-command/
    styles/
```

Each "state" folder is effectively a feature module with its own `components/ models/ services/ public-api.ts`.

### Entry module — registering many widgets in one bundle

```typescript
@NgModule({
  imports: [
    CommonModule, SharedModule, TranslateModule,
    GatewayStatisticsComponent, GatewayServiceRPCComponent,
    GatewayFormComponent, GatewayConfigurationComponent,
    GatewayLogsComponent, DeviceGatewayCommandComponent,
    GatewayConnectorComponent,
  ],
})
export class GatewayExtensionModule {
  constructor(translate: TranslateService) {
    addGatewayLocale();
    translate.onLangChange.subscribe(/* dynamic locale loading */);
    addLibraryStyles('tb-gateway-css');  // namespaced CSS injection
  }
}
```

### Widget component shape — `@Input() ctx + device`, injected TB services

```typescript
@Component({
  selector: 'tb-gateway-connector',
  standalone: true,
  templateUrl: './gateway-connectors.component.html',
  imports: [CommonModule, SharedModule, MqttBasicConfigComponent,
            OpcUaBasicConfigComponent, ModbusBasicConfigComponent /*...*/],
  providers: [{ provide: ErrorStateMatcher, useClass: ForceErrorStateMatcher }],
})
export class GatewayConnectorComponent extends PageComponent {
  @Input() ctx: WidgetContext;
  @Input() device: EntityId;
  @ViewChild(MatSort) sort: MatSort;

  constructor(
    private attributeService: AttributeService,
    private telemetryWsService: TelemetryWebsocketService,
    private dialogService: DialogService,
    private dialog: MatDialog,
    private translate: TranslateService,
    private store: Store<AppState>,
  ) { super(store); }
}
```

Note: `@Input() ctx: WidgetContext` and `@Input() device: EntityId` are the standard contract — ThingsBoard injects both when it mounts the component as a widget.

### Internal navigation — no Router, just toggles + `@if`

```html
<mat-toolbar color="primary">
  <span>{{ 'gateway.configuration' | translate }}</span>
  <tb-toggle-select [(ngModel)]="mode">
    <tb-toggle-option [value]="ConfigurationMode.BASIC">Basic</tb-toggle-option>
    <tb-toggle-option [value]="ConfigurationMode.ADVANCED">Advanced</tb-toggle-option>
  </tb-toggle-select>
</mat-toolbar>

@if (mode === ConfigurationMode.BASIC) {
  <tb-gateway-basic-configuration [formControl]="basicConfig"/>
}
@if (mode === ConfigurationMode.ADVANCED) {
  <tb-gateway-advanced-configuration [formControl]="advancedConfig"/>
}
```

Multi-view inside one widget is achieved with `mat-tab-group`, `tb-toggle-select`, and conditional `@if` rendering. Sub-views are nested standalone components that bind via `[formControl]` (ControlValueAccessor pattern).

### ThingsBoard APIs leaned on heavily

- **`AttributeService.getEntityAttributes` / `saveEntityAttributes`** with `AttributeScope.CLIENT_SCOPE` and `SHARED_SCOPE` — the cross-widget state bus
- **`TelemetryWebsocketService`** — live telemetry subscriptions
- **`DialogService`**, **`UtilsService`**, **`PageLink`**
- **`DeviceService`** — server-side RPC for device control
- Components extend **`PageComponent`** to get `Store<AppState>` access
- **`addLibraryStyles(namespace)`** to scope injected CSS (avoid colliding with ThingsBoard)
- **`TranslateService.onLangChange`** for runtime i18n switching

### Angular patterns to notice

- Every widget is a **standalone component** with its own `imports[]`
- **`@ngrx/store`** with `Store<AppState>` for cross-cutting state (auth, theme)
- Reactive forms with nested `FormGroup`s + **`ControlValueAccessor` sub-forms** — child components expose themselves as form controls so the parent can bind `[formControl]`
- **`MatTableDataSource` + `MatSort`** for data tables (not custom)
- Custom **`ErrorStateMatcher`s** and dedicated pipes (`ReportStrategyVersionPipe`, `LatestVersionConfigPipe`)
- Static **JSON asset templates** per protocol (`assets/connector-default-configs/*.json`) shipped inside the library
- **Locale JSON bundles** dynamically loaded on `onLangChange`
- Build output via **ng-packagr** library mode (`angular.json` projectType=library, `ng-package.json`)
- Version-aware feature gating via util classes (`GatewayConnectorVersionMappingUtil`)

### When to copy this pattern

Use this approach when:
- The UX needs **multiple distinct widget surfaces** that share one entity (e.g. config + live data + logs + RPC controls for the same device)
- You want **dashboard authors** to compose layout (rather than locking it inside one widget)
- You need shared models/services across widgets but want each widget independently placeable

Avoid this approach when:
- A single small widget is enough — the multi-widget bundle adds ng-packagr complexity and a flatter folder layout would be clearer
- The views must be tightly linked navigationally (in that case, use `mat-tab-group` inside a single widget)

---

## Canonical Source Reference (ThingsBoard `ui-ngx` v4.4.0)

The definitions below are extracted **verbatim from the ThingsBoard frontend source** — they are the ground truth that the path aliases (`@home/*`, `@core/*`, `@shared/*`) resolve to. When the hand-written tables earlier in this doc disagree with this section, **trust this section**.

### Source file map

| What | Source file | Resolves via |
|---|---|---|
| `WidgetContext` class, `WidgetTypeInstance` (lifecycle), `WidgetInfo`, `IDynamicWidgetComponent`, `WidgetHeaderAction`, `WidgetAction` | `src/app/modules/home/models/widget-component.models.ts` | `@home/models/widget-component.models` |
| `IWidgetSubscription`, `WidgetSubscriptionApi`, `RpcApi`, `WidgetActionsApi`, `TimewindowFunctions`, `IStateController`, `IAliasController`, `WidgetSubscriptionOptions`, `WidgetSubscriptionCallbacks`, `SubscriptionInfo` | `src/app/core/api/widget-api.models.ts` | `@core/api/widget-api.models` |
| `widgetType`, `Widget`, `WidgetConfig`, `WidgetTypeParameters`, `WidgetTypeDescriptor`, `DataKey`, `Datasource`, `DatasourceType`, `DatasourceData`, `LegendData`, `WidgetActionType`, `WidgetActionSource`, `WidgetActionDescriptor` | `src/app/shared/models/widget.models.ts` | `@shared/models/widget.models` or `@shared/public-api` |

Path aliases (from `tsconfig.json`): `@app/*`→`src/app/*`, `@core/*`→`src/app/core/*`, `@modules/*`→`src/app/modules/*`, `@home/*`→`src/app/modules/home/*`, `@shared/*`→`src/app/shared/*`.

### `widgetType` enum (the 5 widget kinds)

```typescript
enum widgetType {
  timeseries = 'timeseries',  // default fqn: system.time_series_chart
  latest     = 'latest',      // default fqn: system.cards.attributes_card
  rpc        = 'rpc',         // default fqn: system.gpio_widgets.basic_gpio_control
  alarm      = 'alarm',       // default fqn: system.alarm_widgets.alarms_table
  static     = 'static'       // default fqn: system.cards.html_card
}
```

Widget type FQNs are prefixed `system.` (built-in) or `tenant.` (custom): `fullWidgetTypeFqn()` = `(tenantId is null ? 'system' : 'tenant') + '.' + fqn`.

### Lifecycle contract — `WidgetTypeInstance` (authoritative)

```typescript
interface WidgetTypeInstance {
  // Config-form hooks (return dynamic form definitions)
  getSettingsForm?: () => FormProperty[];
  getDataKeySettingsForm?: () => FormProperty[];
  getLatestDataKeySettingsForm?: () => FormProperty[];
  typeParameters?: () => WidgetTypeParameters;
  useCustomDatasources?: () => boolean;
  actionSources?: () => {[actionSourceId: string]: WidgetActionSource};

  // Lifecycle callbacks — all optional, all zero-arg, all void
  onInit?: () => void;
  onDataUpdated?: () => void;
  onLatestDataUpdated?: () => void;
  onResize?: () => void;
  onEditModeChanged?: () => void;
  onMobileModeChanged?: () => void;
  onDestroy?: () => void;
}
```

These are assigned by name onto `ctx.$scope`. There is **no `onActionSources` callback** — it's `actionSources` (no `on` prefix), same for `typeParameters`, `getSettingsForm`, etc.

### `WidgetContext` — authoritative member list

`WidgetContext` is a **class**, constructed with `(dashboard, dashboardWidget, widget, parentDashboard?, popoverComponent?)`.

**Getters (computed, read-only):**
```typescript
get stateController(): IStateController
get aliasController(): IAliasController
get dashboardTimewindow(): Timewindow
get widgetConfig(): WidgetConfig        // === widget.config
get settings(): any                     // === widget.config.settings
get units(): TbUnit                     // === widget.config.units || ''
get decimals(): number                  // === widget.config.decimals ?? 2  ← default is 2, not null
get currentUser(): AuthUser
get dashboardPageElement(): HTMLElement
get dashboardContentElement(): HTMLElement
```

**Injected platform services (all are live `WidgetContext` properties):**
```
authService, deviceService, assetService, entityViewService, edgeService,
customerService, dashboardService, userService, attributeService,
entityRelationService, entityService, dialogs (DialogService), customDialog,
resourceService, userSettingsService, utilsService, telemetryWsService,
unitService, http (HttpClient), translate (TranslateService), router,
renderer (Renderer2), sanitizer (DomSanitizer), date (DatePipe),
imagePipe, milliSecondsToTimeString
```
Note: the service is `ctx.dialogs` (not `ctx.dialogService`), and `ctx.utilsService` (not `ctx.utils` — `ctx.utils` is the `IWidgetUtils` helper bundle below).

**State / data members:**
```typescript
inited: boolean; destroyed: boolean;
subscriptions: {[id: string]: IWidgetSubscription};
defaultSubscription: IWidgetSubscription;
datasources?: Datasource[];
data?: DatasourceData[];
latestData?: DatasourceData[];
hiddenData?: {data: DataSet}[];
timeWindow?: WidgetTimewindow;
width: number; height: number;
isEdit: boolean; isPreview: boolean; isMobile: boolean;
$widgetElement: JQuery; $container: JQuery; $containerParent: JQuery;
$scope: IDynamicWidgetComponent;
$injector?: Injector;
servicesMap?: Map<string, Type<any>>;
ngZone?: NgZone;
store?: Store<AppState>;
widgetNamespace?: string; widgetCssClass?: string;
embedTitlePanel?: boolean; embedActionsPanel?: boolean; overflowVisible?: boolean;
hideTitlePanel: boolean;
widgetTitle?: string; widgetTitleTooltip?: string;
customHeaderActions?: WidgetHeaderAction[];
widgetActions?: WidgetAction[];
activeEntityInfo?: SubscriptionEntityInfo;
```

**Helper API bundles attached to ctx:**
```typescript
ctx.timewindowFunctions: TimewindowFunctions   // onUpdateTimewindow / onResetTimewindow
ctx.controlApi: RpcApi                          // sendOneWayCommand / sendTwoWayCommand / completedCommand
ctx.utils: IWidgetUtils                         // formatValue, getEntityDetailsPageURL
ctx.httpUtils: IWidgetHttpUtils                 // defaultHttpOptions, etc.
ctx.subscriptionApi?: WidgetSubscriptionApi     // createSubscription / removeSubscription
ctx.actionsApi?: WidgetActionsApi
ctx.rxjs                                        // { ...RxJS, ...RxJSOperators } — RxJS bundled in
```

**Methods:**
```typescript
detectChanges(updateWidgetParams = false): void
detectContainerChanges(): void
updateWidgetParams(): void
updateParamsFromData(detectChanges = false): void
updateAliases(aliasIds?: string[]): void
reset(): void
destroy(): void
closeDialog(resultData = null): void
showSuccessToast(message, duration=1000, vPos='bottom', hPos='left', target='dashboardRoot', modern=false)
showInfoToast(message, vPos='bottom', hPos='left', target='dashboardRoot', modern=false)
showWarnToast(...)  showErrorToast(...)  showToast(type, message, duration, ...)  hideToast(target?)
pageLink(pageSize, page=0, textSearch=null, sortOrder=null): PageLink
timePageLink(startTime, endTime, pageSize, page=0, textSearch=null, sortOrder=null): TimePageLink
alarmQuery(entityId, pageLink, searchStatus, status, fetchOriginator, assigneeId): AlarmQuery
```

### `WidgetTypeParameters` — every field (authoritative)

```typescript
interface WidgetTypeParameters {
  useCustomDatasources?: boolean;
  maxDatasources?: number;                 // -1 = unlimited
  maxDataKeys?: number;                    // -1 = unlimited
  datasourcesOptional?: boolean;
  dataKeysOptional?: boolean;
  stateData?: boolean;
  hasDataPageLink?: boolean;
  singleEntity?: boolean;
  hasAdditionalLatestDataKeys?: boolean;
  warnOnPageDataOverflow?: boolean;
  ignoreDataUpdateOnIntervalTick?: boolean;
  processNoDataByWidget?: boolean;
  previewWidth?: string;
  previewHeight?: string;
  embedTitlePanel?: boolean;
  embedActionsPanel?: boolean;
  overflowVisible?: boolean;
  hideDataTab?: boolean;
  hideDataSettings?: boolean;
  defaultDataKeysFunction?: (configComponent: any, configData: any) => DataKey[];
  defaultLatestDataKeysFunction?: (configComponent: any, configData: any) => DataKey[];
  dataKeySettingsFunction?: DataKeySettingsFunction;
  displayRpcMessageToast?: boolean;
  targetDeviceOptional?: boolean;
  supportsUnitConversion?: boolean;
  additionalWidgetActionTypes?: WidgetActionType[];
}
```

Note: `defaultDataKeysFunction` takes `(configComponent, configData)` — not zero-arg as the earlier hand-written table implied.

### `IWidgetSubscription` — key members (authoritative)

```typescript
interface IWidgetSubscription {
  options: WidgetSubscriptionOptions;
  id: string;
  init$: Observable<IWidgetSubscription>;
  ctx: WidgetSubscriptionContext;
  type: widgetType;
  callbacks: WidgetSubscriptionCallbacks;
  loadingData: boolean;
  useDashboardTimewindow: boolean;
  legendData: LegendData;
  readonly firstDatasource?: Datasource;
  datasources?: Datasource[];
  data?: DatasourceData[];
  latestData?: DatasourceData[];
  timeWindowConfig?: Timewindow;
  timeWindow?: WidgetTimewindow;            // resolved minTime/maxTime
  comparisonEnabled?: boolean;
  alarms?: PageData<AlarmData>;
  alarmSource?: Datasource;
  targetEntityId?: EntityId;
  rpcEnabled?: boolean;
  executingRpcRequest?: boolean;
  rpcErrorText?: string;
  persistentRequests?: PageData<PersistentRpc>;

  getFirstEntityInfo(): SubscriptionEntityInfo;
  onUpdateTimewindow(startTimeMs, endTimeMs, interval?): void;
  onResetTimewindow(): void;
  updateTimewindowConfig(newTimewindow: Timewindow): void;
  sendOneWayCommand(method, params?, timeout?, persistent?, persistentPollingInterval?, retries?, additionalInfo?, requestUUID?): Observable<any>;
  sendTwoWayCommand(method, params?, timeout?, persistent?, persistentPollingInterval?, retries?, additionalInfo?, requestUUID?): Observable<any>;
  clearRpcError(): void;
  subscribe(): void;
  subscribeAllForPaginatedData(pageLink: EntityDataPageLink, keyFilters: KeyFilter[]): void;
  subscribeForPaginatedData(datasourceIndex, pageLink, keyFilters): Observable<any>;
  subscribeForAlarms(pageLink: AlarmDataPageLink, keyFilters: KeyFilter[]): void;
  isDataResolved(): boolean;
  update(): void;
  destroy(): void;
  [key: string]: any;
}
```

### Helper API interfaces (authoritative signatures)

```typescript
interface TimewindowFunctions {
  onUpdateTimewindow: (startTimeMs: number, endTimeMs: number, interval?: number) => void;
  onResetTimewindow: () => void;
}

interface RpcApi {  // === ctx.controlApi
  sendOneWayCommand: (method, params?, timeout?, persistent?, persistentPollingInterval?, retries?, additionalInfo?, requestUUID?) => Observable<any>;
  sendTwoWayCommand: (method, params?, timeout?, persistent?, persistentPollingInterval?, retries?, additionalInfo?, requestUUID?) => Observable<any>;
  completedCommand: () => void;
}

interface WidgetSubscriptionApi {  // === ctx.subscriptionApi
  createSubscription: (options: WidgetSubscriptionOptions, subscribe?: boolean) => Observable<IWidgetSubscription>;
  createSubscriptionFromInfo: (type, subscriptionsInfo, options, useDefaultComponents, subscribe) => Observable<IWidgetSubscription>;
  removeSubscription: (id: string) => void;
}

interface WidgetActionsApi {  // === ctx.actionsApi
  actionDescriptorsBySourceId: {[sourceId: string]: WidgetActionDescriptor[]};
  getActionDescriptors: (actionSourceId: string) => WidgetActionDescriptor[];
  handleWidgetAction: ($event, descriptor, entityId?, entityName?, additionalParams?, entityLabel?) => void;
  onWidgetAction: ($event: Event, action: WidgetAction) => void;
  elementClick / cardClick / click: ($event: Event) => void;
  getActiveEntityInfo: () => SubscriptionEntityInfo;
  openDashboardStateInSeparateDialog: (targetDashboardStateId, params?, dialogTitle?, hideToolbar?, width?, height?) => MatDialogRef<any>;
  openDashboardStateInPopover: ($event, targetDashboardStateId, params?, hideToolbar?, placement?, hideOnClickOutside?, width?, height?, style?) => void;
  placeMapItem: (action: PlaceMapItemActionData) => void;
}
```

### `WidgetActionType` enum

```typescript
enum WidgetActionType {
  doNothing, openDashboardState, updateDashboardState, openDashboard,
  custom, customPretty, mobileAction, openURL, placeMapItem
}
```

### `WidgetActionSource` + built-in source

```typescript
interface WidgetActionSource {
  name: string;        // i18n key
  value: string;
  multiple: boolean;
  hasShowCondition?: boolean;
}
// Built-in (always available): headerButton
//   { name: 'widget-action.header-button', value: 'headerButton', multiple: true, hasShowCondition: true }
```

### Data structures (authoritative)

```typescript
interface DataKey extends KeyInfo {  // KeyInfo gives: name, label, color, units, decimals, funcBody, postFuncBody
  type: DataKeyType;          // 'timeseries' | 'attribute' | 'entityField' | 'function' | ...
  pattern?: string;
  settings?: any;             // values from the Data key settings form
  usePostProcessing?: boolean;
  hidden?: boolean;
  inLegend?: boolean;
  isAdditional?: boolean;     // true for latest-data keys
  origDataKeyIndex?: number;
}

enum DatasourceType { function='function', device='device', entity='entity', entityCount='entityCount', alarmCount='alarmCount' }

interface Datasource {
  type?: DatasourceType;
  name?: string;
  dataKeys?: DataKey[];
  latestDataKeys?: DataKey[];     // additional latest keys (timeseries widgets)
  entityType?: EntityType;
  entityId?: string;
  entityName?: string;
  entityLabel?: string;
  deviceId?: string;
  entityAliasId?: string;
  filterId?: string;
  entity?: BaseData<EntityId>;
  pageLink?: EntityDataPageLink;  // present when hasDataPageLink
  keyFilters?: KeyFilter[];
  entityFilter?: EntityFilter;
  alarmFilterConfig?: AlarmFilterConfig;
  [key: string]: any;
}

interface DatasourceData extends DataSetHolder {  // DataSetHolder gives: data: DataSet ([ts, value][])
  datasource: Datasource;
  dataKey: DataKey;
}

interface LegendData {
  keys: { dataKey: DataKey; dataIndex: number; valueFormat: ValueFormatProcessor }[];
  data: { min; max; avg; total; latest: string; hidden: boolean }[];
}
```

### `WidgetConfig` — the widget-level config object (`ctx.widgetConfig`)

```typescript
interface WidgetConfig {
  configMode?: WidgetConfigMode;       // 'basic' | 'advanced'
  title?: string; titleFont?: Font; titleColor?: string; titleIcon?: string;
  showTitle?: boolean; showTitleIcon?: boolean; iconColor?: string; iconSize?: string;
  titleTooltip?: string; dropShadow?: boolean; enableFullscreen?: boolean;
  useDashboardTimewindow?: boolean; displayTimewindow?: boolean;
  timewindow?: Timewindow; timewindowStyle?: TimewindowStyle;
  resizable?: boolean; preserveAspectRatio?: boolean;
  desktopHide?: boolean; mobileHide?: boolean; mobileHeight?: number; mobileOrder?: number;
  color?: string; backgroundColor?: string; padding?: string; margin?: string; borderRadius?: string;
  widgetStyle?: ComponentStyle; widgetCss?: string; titleStyle?: ComponentStyle;
  units?: TbUnit; decimals?: number; noDataDisplayMessage?: string; pageSize?: number;
  actions?: {[actionSourceId: string]: WidgetActionDescriptor[]};
  settings?: WidgetSettings;           // ← ctx.settings
  alarmSource?: Datasource; alarmFilterConfig?: AlarmFilterConfig;
  datasources?: Datasource[]; targetDevice?: TargetDevice;
  [key: string]: any;
}
```

### `Widget` — the placed widget instance

```typescript
interface Widget {
  id?: string;
  typeFullFqn: string;   // e.g. 'system.cards.value_card' or 'tenant.my_widget'
  type: widgetType;
  typeId?: WidgetTypeId;
  sizeX: number; sizeY: number; row: number; col: number;
  config: WidgetConfig;
}
```

### Verifying against the live source

The repo is checked out at `/Users/steffensenchyna/Documents/Developer/thingsboard/ui-ngx` (v4.4.0). To re-confirm any signature:

```bash
# Find any exported type
grep -rn "export interface WidgetContext\|export class WidgetContext" src/app
# The three reference files
src/app/modules/home/models/widget-component.models.ts   # WidgetContext, lifecycle
src/app/core/api/widget-api.models.ts                    # subscription/RPC/action APIs
src/app/shared/models/widget.models.ts                   # widgetType, configs, data structures
```

Built-in widget implementations (study these as working examples) live under `src/app/modules/home/components/widget/lib/` — e.g. `cards/`, `chart/`, `rpc/`, `alarm/`, `maps/`.
