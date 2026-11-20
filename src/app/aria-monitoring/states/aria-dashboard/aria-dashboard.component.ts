///
/// Copyright © 2016-2025 The Thingsboard Authors
///
/// Licensed under the Apache License, Version 2.0 (the "License");
/// you may not use this file except in compliance with the License.
/// You may obtain a copy of the License at
///
///     http://www.apache.org/licenses/LICENSE-2.0
///
/// Unless required by applicable law or agreed to in writing, software
/// distributed under the License is distributed on an "AS IS" BASIS,
/// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
/// See the License for the specific language governing permissions and
/// limitations under the License.
///

import { ChangeDetectorRef, Component, DestroyRef, Input, OnDestroy, OnInit, ViewChild } from "@angular/core";
import { CommonModule } from "@angular/common";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { from } from "rxjs";
import { map, mergeMap } from "rxjs/operators";
import type { AlarmService } from "@core/http/alarm.service";
import { AliasFilterType, EntityDataQuery, EntityFilter, EntityKeyType, SharedModule } from "@shared/public-api";
import { WidgetContext } from "@home/models/widget-component.models";
import { injectCss } from "../../../components/shared/cdn-loader";
import { CountMarkComponent } from "../../../components/shared/count-mark/count-mark.component";
import { DashboardAlarm, alarmsTab, clearDashboardAlarm, countAlarmsByOriginator, subscribeActiveAlarms } from "../../../components/shared/dashboard/dashboard-alarms";
import { DashboardTheme, dashboardRailItems, isTenantAdmin, readUserSettings, saveUserSettings } from "../../../components/shared/dashboard/dashboard-preferences";
import { DashboardHost, NestedDashboard, dashboardWidgetSettings } from "../../../components/shared/dashboard/nested-dashboard";
import { byNamePageLink, removeSubscriptions, subscribeLatestChanges } from "../../../components/shared/dashboard/dashboard-subscriptions";
import { SavedTableSort, TableColumnChoice, sidebarWidth } from "../../../components/shared/dashboard/table-columns";
import { DashboardRootDirective } from "../../../components/shared/dashboard/dashboard-root.directive";
import { DashboardLoadingComponent, FirstLoad } from "../../../components/shared/dashboard-loading/dashboard-loading.component";
import { formatWhen, relativeTime } from "../../../components/shared/time-format";
import { QUIET_REQUEST, fmtNumber, parseDescription, parseNumber } from "../../../components/shared/value-utils";
import { OWNER_ENTITY_FIELDS, ownerCustomer } from "../../../components/shared/entity-owner";
import { AlarmListComponent, AlarmListItem } from "../../../components/shared/alarm-list/alarm-list.component";
import { AlarmPanelComponent } from "../../../components/shared/alarm-panel/alarm-panel.component";
import { CheckFilterComponent } from "../../../components/shared/check-filter/check-filter.component";
import { ColumnPickerComponent } from "../../../components/shared/column-picker/column-picker.component";
import { DataTableCellDirective, DataTableColumn, DataTableComponent } from "../../../components/shared/data-table/data-table.component";
import { tableManageOf } from "../../../components/shared/data-table/table-manage";
import { DetailCardComponent, DetailRowComponent } from "../../../components/shared/detail-rows/detail-rows.component";
import { AttributeSelect, DeviceSettingsCardComponent, deviceGroupNames } from "../../../components/shared/device-settings-card/device-settings-card.component";
import { EntityDetailPanelComponent, INSIGHTS_TAB, SETTINGS_TAB } from "../../../components/shared/entity-detail-panel/entity-detail-panel.component";
import { FilterListComponent, FilterListOption } from "../../../components/shared/filter-list/filter-list.component";
import { FilterSectionComponent } from "../../../components/shared/filter-section/filter-section.component";
import { FilterSectionsComponent } from "../../../components/shared/filter-sections/filter-sections.component";
import { MetricChartCardComponent, MetricChartSection, paletteCharts } from "../../../components/shared/metric-chart-card/metric-chart-card.component";
import { NavRailComponent, NavRailItem } from "../../../components/shared/nav-rail/nav-rail.component";
import { SearchBoxComponent } from "../../../components/shared/search-box/search-box.component";
import { SegmentOption } from "../../../components/shared/segmented-control/segmented-control.component";
import { SidebarLayoutComponent } from "../../../components/shared/sidebar-layout/sidebar-layout.component";
import { DatePickerHostComponent } from "../../../components/shared/date-field/date-picker-host.component";
import { TimeMachineState } from "../../../components/shared/time-machine/time-machine-state";
import { TimeMachineDevice } from "../../../components/shared/time-machine/time-machine-events";
import { TimeMachineViewComponent } from "../../../components/shared/time-machine/time-machine-view/time-machine-view.component";
import { TimeMachineSwitchesComponent } from "../../../components/shared/time-machine/time-machine-switches/time-machine-switches.component";
import { TimeMachinePickerComponent } from "../../../components/shared/time-machine/time-machine-picker/time-machine-picker.component";
import { StateTimelineComponent, StateTimelineState } from "../../../components/shared/state-timeline/state-timeline.component";
import { StatusPillComponent } from "../../../components/shared/status-pill/status-pill.component";
import { TableLinksComponent } from "../../../components/shared/table-links/table-links.component";
import { ToastsComponent } from "../../../components/shared/toasts/toasts.component";
import { FeedbackDialogComponent } from "../../../components/shared/feedback/feedback-dialog/feedback-dialog.component";
import { FEEDBACK_RAIL_ID, feedbackOf } from "../../../components/shared/feedback/feedback.models";
import { ProfileIcons, profileIconsOf } from "../../../components/shared/profile-icons/profile-icons";
import { NamedAsset, loadOrganizationNames } from "../../../components/shared/organization/site-locations";
import { siteFilterTree, siteTreeIds } from "../../../components/shared/organization/organization.models";
import {
  AriaDashboardSettings,
  NO_SCALE_MODEL,
  SCALE_CONDITIONS,
  SCALE_CONDITION_META,
  SCALE_MODELS,
  SCALE_MODEL_KEY,
  ScaleCondition,
  ScaleRow,
  ariaDashboardDefaultSettings,
  scaleAveragedKey,
  scaleCondition,
  scaleConditionPill,
  scaleModel,
} from "../../models/aria-monitoring.models";

/** The sidebar's filters column (the column picker beside it while open: `sidebarWidth`). */
const ARIA_FILTERS_WIDTH = 300;
/** The scales' live refresh: a change read again at most this often (each scale reports about once a minute). */
const ARIA_REFRESH_MS = 5000;
/** The state card: a report trusted this long (a scale reports its state each minute) — past it, a gap where the scale fell silent. */
const ARIA_STATE_STALE_MS = 5 * 60 * 1000;
/** The scales' groups read at a time (in the background after the table loads). */
const ARIA_GROUP_READS = 6;
/** The table's default sort: by name (the user's own kept in their settings). */
const ARIA_DEFAULT_SORT = { key: "name", direction: "asc" as const };
/** The Time Machine's keys in the user's settings: `ariaLargeCharts`, `ariaAlarmsFirst`, `ariaTimeframe`, `ariaRange`. */
const TIME_MACHINE_SETTINGS = "aria";
/** A scale reports once a minute: the Time Machine's offline stretches past three missed reports (at least half an hour). */
const ARIA_REPORT_MS = 60 * 1000;

/**
 * Aria: aggregate production — the plants' conveyor belt scales (the
 * "BeltScale" profile: Loadrite C2880 / Beltway integrators read over Modbus
 * by each plant's gateway), as a dashboard of the extension's shared pieces.
 *
 * - Rail (standalone): Scales; the alarms, Send feedback (and a tenant
 *   administrator's theme toggle) at its foot. Nested in Home: no rail of its
 *   own — Aria is an entry of Home's rail, by its own mark.
 * - Sidebar: the table's search, a Statuses filter (producing, running
 *   empty, stopped, offline) and the Sites tree (each market › its plants),
 *   "Clear filters" and "Customize columns" at its foot.
 * - Scales: one row a scale — its belt (the device's label), its plant, its
 *   state, its rate and the hour's average rate (t/h), its speed, load and
 *   running total, its active alarms. A row opens its panel: Insights (its
 *   figures and its charts — rate, speed, load), Alarms and Settings (the
 *   shared device settings card: name, label, note).
 */
@Component({
  selector: "tb-aria-dashboard",
  templateUrl: "./aria-dashboard.component.html",
  styleUrls: ["./aria-dashboard.component.scss"],
  standalone: true,
  imports: [
    CommonModule,
    SharedModule,
    AlarmListComponent,
    AlarmPanelComponent,
    DetailCardComponent,
    CheckFilterComponent,
    ColumnPickerComponent,
    CountMarkComponent,
    DashboardLoadingComponent,
    DashboardRootDirective,
    DataTableCellDirective,
    DataTableComponent,
    DetailRowComponent,
    DeviceSettingsCardComponent,
    EntityDetailPanelComponent,
    FeedbackDialogComponent,
    FilterListComponent,
    FilterSectionComponent,
    FilterSectionsComponent,
    MetricChartCardComponent,
    NavRailComponent,
    SearchBoxComponent,
    SidebarLayoutComponent,
    DatePickerHostComponent,
    TimeMachineViewComponent,
    TimeMachineSwitchesComponent,
    TimeMachinePickerComponent,
    StateTimelineComponent,
    StatusPillComponent,
    TableLinksComponent,
    ToastsComponent,
  ],
})
export class AriaDashboardComponent implements OnInit, OnDestroy, NestedDashboard {
  /** Nested in Home, Aria's pages beside its entry in Home's rail: one page — no menu, its entry opens it. */
  static readonly nestedPages: NavRailItem[] = [];

  @Input() ctx!: WidgetContext;
  /** Opened inside the Home dashboard (one of its apps): no rail of its own, Home's theme (nested-dashboard.ts). */
  @Input() host: DashboardHost | null = null;

  settings: AriaDashboardSettings = ariaDashboardDefaultSettings;
  /** The light / dark theme: the user's pick, or the system's (shared with the other dashboards). */
  theme!: DashboardTheme;
  get darkMode(): boolean {
    return !!this.theme?.dark;
  }

  // -- layout -----------------------------------------------------------------

  /** The rail's pages (standalone): Scales, by the belt scales' profile icon. */
  pages: NavRailItem[] = [{ id: "scales", label: "Scales", icon: "conveyor_belt" }];
  readonly page = "scales";
  sidebarOpen = true;
  columnPickerOpen = false;

  // -- scales + filters -------------------------------------------------------

  /** Every scale, unfiltered. */
  scales: ScaleRow[] = [];
  scalesLoading = true;
  /** The scales the Statuses and Sites filters pass (the table's rows: its search narrows them further). */
  tableRows: ScaleRow[] = [];
  scaleSearchTerms: string[] = [];
  scaleSearchText = "";
  scaleSearch: string[] = [];
  /** The Statuses filter (none checked = all), counted under the Sites filter. */
  selectedConditions: ScaleCondition[] = [];
  conditionOptions: FilterListOption[] = [];
  /** The Models filter (none checked = all): Beltway, Loadrite, Not set — counted under the other filters. */
  selectedModels: string[] = [];
  modelOptions: FilterListOption[] = [];
  /** The Sites filter (site codes; none checked = all): the shared site tree — each market › its plants. */
  selectedSites: string[] = [];
  siteFilterOptions: FilterListOption[] = [];

  /** The table's columns; each one's place on a phone (`phone`). */
  readonly scaleColumns: DataTableColumn[] = [
    { key: "name", header: "Scale", emphasis: "strong", phone: "title", iconOf: (r) => this.deviceIcon(r["type"]) },
    { key: "siteCode", header: "Site", nowrap: true, phone: "sub", tooltipKey: "siteLabel" },
    { key: "model", header: "Model", nowrap: true, phone: "meta" },
    { key: "condition", header: "Status", phone: "trail", sortValue: (r) => SCALE_CONDITION_META[r["condition"] as ScaleCondition].rank },
    { key: "rate", header: "Rate", align: "right", phone: "trail", sortValue: (r) => r["rate"] ?? -1 },
    { key: "hourRate", header: "Hour average", align: "right", phone: "hide", sortValue: (r) => r["hourRate"] ?? -1 },
    { key: "speed", header: "Speed", align: "right", phone: "hide", sortValue: (r) => r["speed"] ?? -1 },
    { key: "load", header: "Load", align: "right", phone: "hide", sortValue: (r) => r["load"] ?? -1 },
    { key: "total", header: "Total", align: "right", phone: "hide", sortValue: (r) => r["total"] ?? -1 },
    { key: "deviceName", header: "Device", emphasis: "muted", nowrap: true, phone: "hide" },
    { key: "lastUpdateTs", header: "Last seen", nowrap: true, phone: "hide", sortValue: (r) => r["lastUpdateTs"] ?? 0 },
    { key: "alarmCount", header: "Alarms", phone: "sub", sortValue: (r) => this.alarmCount(r) },
  ];
  /** "Customize columns": the columns shown — the user's pick, kept in their settings (all but the device's name to start). */
  readonly columnChoice = new TableColumnChoice(
    this.scaleColumns,
    this.scaleColumns.map((c) => c.key).filter((k) => k !== "deviceName"),
    "ariaScaleColumns"
  );
  /** The table's sort, kept in the user's settings (by name until they pick one). */
  scaleSort!: SavedTableSort;
  readonly conditionMeta = SCALE_CONDITION_META;

  // -- alarms -------------------------------------------------------------------

  alarmsLoading = true;
  alarmPanelOpen = false;
  /** Active alarms of the scales shown (the rail's badge, the alarms panel). */
  panelAlarms: AlarmListItem[] = [];
  /** Active alarms of the scale open (its panel's Alarms tab). */
  detailAlarms: AlarmListItem[] = [];
  /** Active alarms a scale, by device id (the table's Alarms column). */
  private alarmCounts = new Map<string, number>();

  // -- the scale's panel ----------------------------------------------------------

  selectedScale: ScaleRow | null = null;
  detailOpen = false;
  detailTab = "insights";
  /** Its charts: the rate with the hour's average (t/h), the speed, the load — the chart palette in order. */
  metricsCharts: MetricChartSection[] = [];
  /** A Time Machine card's: the rate alone, the belt's state as a bar under it (the same array for every card). */
  timeMachineCharts: MetricChartSection[] = [];
  /** The state card's runs, coloured as the table's pills: producing green, blackbelt orange, stopped red. */
  readonly stateTimelineStates: StateTimelineState[] = [
    { id: "producing", label: SCALE_CONDITION_META.producing.label, color: "var(--c-bg-success-normal)" },
    { id: "blackBelt", label: SCALE_CONDITION_META.blackBelt.label, color: "var(--c-bg-major-normal)" },
    { id: "stopped", label: SCALE_CONDITION_META.stopped.label, color: "var(--c-bg-error-normal)" },
  ];
  readonly stateStaleMs = ARIA_STATE_STALE_MS;
  /**
   * The Settings tab's Scale card (the device settings card's own select card, as QC Lab's Sensor channels — saved with its Apply):
   * its model, a select of Beltway | Loadrite (blank until picked) — the scale's `scaleModel` server attribute.
   */
  readonly scaleSelects: AttributeSelect[] = [
    { key: SCALE_MODEL_KEY, label: "Model", options: SCALE_MODELS.map((m) => ({ value: m, label: m })) },
  ];
  /** The open scale's values for the Scale card (its model) — replaced only as they change, so a live refresh never resets it. */
  scaleCardValues: Record<string, string> = {};
  /** A reported state ("producing", "blackBelt", "stopped") as the card's run — any other value a gap. */
  readonly stateTimelineId = (raw: string): string | null => {
    const condition = scaleCondition(null, raw);
    return condition === "unknown" ? null : condition;
  };

  // -- Manage: the model of many scales at once ----------------------------------------

  /** Managing: the rows take checkboxes ("Edit (n) | Select all (n) | Done"). */
  managing = false;
  /** The scales checked. */
  checkedScaleIds: string[] = [];
  /** The bulk editor: open, its content mounted (from open until its slide-out ends), its scales and heading fixed at open. */
  bulkOpen = false;
  bulkRendered = false;
  bulkScaleIds: string[] = [];
  bulkName = "";
  readonly bulkTabs: SegmentOption[] = [{ id: "settings", label: "Settings", icon: "settings", tooltip: "Settings" }];

  /**
   * The scales table's Manage (`tb-table-links`, the standard footer — none on a phone): "Manage" checks rows (the open scale's
   * panel closes), "Edit (n)" opens the bulk editor for the checked scales, "Select all (n)" covers the rows passing the search,
   * "Done" ends it.
   */
  readonly manage = tableManageOf({
    managing: () => this.managing,
    selectedCount: () => this.checkedScaleIds.length,
    allChecked: () => this.scaleTable?.allFilteredChecked ?? false,
    count: () => this.scaleTable?.checkableCount ?? this.tableRows.length,
    start: () => this.startManage(),
    end: () => this.endManage(),
    toggleAll: () => this.toggleAllScales(),
  });

  // -- the Time Machine view (the shared tb-time-machine-view) ---------------------------

  /**
   * Its "Time Machine" switch — the view (a card a scale, the window's timeline beside them) in the table's place; never saved: off on
   * every load — "Large charts", "Alarms on top", the window (kept in the user's settings) and the picked time (every chart's pointer:
   * the cards', the scale panel's Metrics). Made in ngOnInit.
   */
  tm!: TimeMachineState;
  /** The scales shown: the filters' and the table's search (done here for the cards) — the Time Machine's cards, whose events it shows. */
  shownScales: ScaleRow[] = [];
  /** Their cards: each scale with its rate chart over its belt's state, and the readings that show it reporting. */
  tmDevices: TimeMachineDevice[] = [];

  @ViewChild("toasts", { static: true }) toasts!: ToastsComponent;
  @ViewChild("scaleTable") private scaleTable?: DataTableComponent;
  /** The dashboard's root: whether it's laid out for a phone. */
  @ViewChild(DashboardRootDirective, { static: true }) private root?: DashboardRootDirective;

  private alarmService!: AlarmService;
  /** Every active alarm of the scales (the Time Machine's live alarms too). */
  allAlarms: DashboardAlarm[] = [];
  private alarmsSubscription: any;
  private scalesSubscription: any;
  private refreshTimer?: ReturnType<typeof setTimeout>;
  /** Each scale's groups (the Settings form's "Groups"), read with the table, by device id. */
  private scaleGroups = new Map<string, string[]>();
  private groupsReading = false;
  /** The Organization's sites by code — a scale's site by its label; null until read. */
  private siteByCode: Map<string, NamedAsset> | null = null;
  /** The device profiles' icons (shared, one per widget) — set in ngOnInit. */
  private icons!: ProfileIcons;

  constructor(
    private cd: ChangeDetectorRef,
    private destroyRef: DestroyRef
  ) {}

  // -- view getters -------------------------------------------------------------

  /** A scale's icon: its profile's (its `type` names it) — the devices' default until it's known. */
  deviceIcon(type: string | null | undefined): string {
    return this.icons.of("device", type);
  }

  /** Laid out for a phone (the root's `tb-phone`). */
  get phone(): boolean {
    return !!this.root?.phone;
  }

  /** The rail's second group: the alarms (their count), then Send feedback — and a tenant administrator's theme toggle. */
  get railBottomItems(): NavRailItem[] {
    return dashboardRailItems(this.darkMode, this.panelAlarms.length, { themeToggle: isTenantAdmin(this.ctx) });
  }

  get detailTabs(): SegmentOption[] {
    return [INSIGHTS_TAB, alarmsTab(this.detailAlarms), SETTINGS_TAB];
  }

  /** The row lit: the scale open while its panel shows. */
  get highlightedScaleId(): string | null {
    return this.detailOpen ? (this.selectedScale?.deviceId ?? null) : null;
  }

  /** The column picker beside the filters (a wider screen's: a phone's sheet has the filters alone). */
  get columnPickerShown(): boolean {
    return this.columnPickerOpen && !this.phone;
  }

  get sidebarWidth(): number {
    return sidebarWidth(ARIA_FILTERS_WIDTH, this.columnPickerShown);
  }

  /** The search or a filter narrows the table ("Clear filters" enables). */
  get hasFilters(): boolean {
    return !!(this.scaleSearchTerms.length || this.scaleSearchText || this.selectedConditions.length || this.selectedModels.length || this.selectedSites.length);
  }

  fmt(v: number | null, decimals = 0): string {
    return fmtNumber(v, decimals);
  }

  /** A scale's active alarms (the table's Alarms column). */
  alarmCount(row: Record<string, any>): number {
    return this.alarmCounts.get(row["deviceId"]) ?? 0;
  }

  /** "5m ago" — a scale's latest reading. */
  lastReading(ts: number | null): string {
    return ts ? relativeTime(ts) : "Never";
  }

  /** "Today 1:48 PM" — when that reading came. */
  readingTime(ts: number): string {
    return formatWhen(ts);
  }

  // -- lifecycle ----------------------------------------------------------------

  /** The loading page while the dashboard first loads (tb-dashboard-loading) — a later reload never brings it back. */
  private readonly firstLoad = new FirstLoad();
  get pageLoading(): boolean {
    return this.firstLoad.pending(this.scalesLoading, this.siteByCode === null, this.alarmsLoading);
  }

  ngOnInit(): void {
    if (!this.host) {
      this.ctx.$scope.ariaDashboardComponent = this;
    }
    this.theme = this.host?.theme ?? new DashboardTheme(this.ctx, this.destroyRef, () => this.cd.detectChanges());
    // A phone or not: the column picker (a wider screen's) and the table's look.
    this.root?.changes.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.cd.detectChanges());
    this.settings = { ...ariaDashboardDefaultSettings, ...dashboardWidgetSettings<AriaDashboardSettings>(this.ctx, this.host) };
    injectCss("tb-ext-material-symbols-rounded", "https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200");
    this.alarmService = this.ctx.$injector.get(this.ctx.servicesMap.get("alarmService")) as AlarmService;
    // The profiles' icons coming in: the rail's page, the table's rows and the panel's header show them.
    this.icons = profileIconsOf(this.ctx);
    this.tm = new TimeMachineState(this.ctx, this.destroyRef, { settingsPrefix: TIME_MACHINE_SETTINGS, changed: () => this.cd.detectChanges() });
    this.icons.changes.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.pages = [{ ...this.pages[0], icon: this.deviceIcon(this.settings.scaleDeviceTypes[0]) }];
      this.cd.detectChanges();
    });
    this.scaleSort = new SavedTableSort(
      "ariaScaleSort",
      () => this.scaleColumns.map((c) => c.key),
      this.ctx,
      this.destroyRef,
      () => this.cd.detectChanges(),
      ARIA_DEFAULT_SORT
    );
    this.scaleSort.load();
    this.metricsCharts = paletteCharts([
      {
        chartTitle: "Rate",
        unit: "t/h",
        // Its floor 0: a scale idling a little under it (its tare drifting) never takes the axis below it.
        yMin: 0,
        yFloor: 0,
        fill: true,
        keys: [
          { ...scaleAveragedKey(this.settings.rateKey), label: "Rate", color: "" },
          // Only where the Rate line is finer than an hour: on 1W / 2W it is the hourly average itself, on 1M the daily one.
          { name: this.settings.hourRateKey, label: "Hour average", color: "", dotted: true, timeframes: ["1D", "3D"] },
        ],
      },
      { chartTitle: "Speed", yMin: 0, fill: true, showLegend: false, keys: [{ ...scaleAveragedKey(this.settings.speedKey), label: "Speed", color: "" }] },
      { chartTitle: "Load", yMin: 0, fill: true, showLegend: false, keys: [{ ...scaleAveragedKey(this.settings.loadKey), label: "Load", color: "" }] },
    ]);
    // The Time Machine's cards: the rate alone — no dotted hour average, no legend — the belt's state under it: producing,
    // blackbelt, stopped as the table's pills, a stretch with no report for 5 minutes hatched as offline.
    this.timeMachineCharts = [
      {
        ...this.metricsCharts[0],
        keys: this.metricsCharts[0].keys.filter((k) => !k.dotted),
        showLegend: false,
        stateStrip: {
          key: this.settings.stateKey,
          // Its pills' tones and icons too: the card's pill at a picked time.
          states: this.stateTimelineStates.map((s) => ({ ...s, tone: scaleConditionPill(s.id).tone, icon: scaleConditionPill(s.id).icon })),
          resolve: this.stateTimelineId,
          staleAfterMs: ARIA_STATE_STALE_MS,
          gapLabel: SCALE_CONDITION_META.offline.label,
          gapIcon: SCALE_CONDITION_META.offline.icon,
        },
      },
    ];
    this.applyFilters(); // the filters' options before the scales arrive
    this.loadUserPreferences();
    this.loadNames();
    this.loadScales();
    this.subscribeScales();
    this.subscribeAlarms();
    this.host?.attach(this);
  }

  ngOnDestroy(): void {
    this.host?.attach(null);
    removeSubscriptions(this.ctx, this.alarmsSubscription, this.scalesSubscription);
    clearTimeout(this.refreshTimer);
  }

  /** ThingsBoard hook — data comes from the custom subscriptions; just re-render. */
  onDataUpdated(): void {
    this.ctx.detectChanges();
  }

  onResize(): void {
    this.cd.detectChanges();
  }

  // -- nested in the Home dashboard ------------------------------------------------

  get railActive(): string {
    return this.page;
  }

  /** One page: whatever Home's rail picks (its id unused), it's Scales. */
  selectRailPage(): void {
    this.cd.detectChanges();
  }

  // -- rail ---------------------------------------------------------------------------

  onRailBottomClick(id: string): void {
    if (id === "alarms") {
      this.alarmPanelOpen = !this.alarmPanelOpen; // a second click closes it
    } else if (id === FEEDBACK_RAIL_ID) {
      feedbackOf(this.ctx).show("Aria");
    } else if (id === "theme") {
      this.theme.toggle();
    }
  }

  // -- sidebar ------------------------------------------------------------------------

  onConditionsChange(ids: string[]): void {
    this.selectedConditions = ids as ScaleCondition[];
    this.applyFilters();
  }

  onModelsChange(ids: string[]): void {
    this.selectedModels = ids;
    this.applyFilters();
  }

  onSitesChange(ids: string[]): void {
    this.selectedSites = ids;
    this.applyFilters();
  }

  /** "Clear filters": the search and every filter. */
  clearFilters(): void {
    this.scaleSearchTerms = [];
    this.scaleSearchText = "";
    this.scaleSearch = [];
    this.selectedConditions = [];
    this.selectedModels = [];
    this.selectedSites = [];
    this.applyFilters();
  }

  /** "Customize columns": the pick shown at once and kept in the user's settings. */
  onColumnsChange(keys: string[]): void {
    this.columnChoice.set(keys);
    saveUserSettings(this.ctx, this.destroyRef, this.columnChoice.settingsFor(keys));
  }

  // -- table + panel ------------------------------------------------------------------

  /** A row: its scale's panel — or, the scale already open, the panel closes. */
  onScaleRowClick(row: Record<string, any>): void {
    const scale = row as ScaleRow;
    if (this.detailOpen && this.selectedScale?.deviceId === scale.deviceId) {
      this.closeDetail();
      return;
    }
    this.selectedScale = scale;
    this.scaleCardValues = { [SCALE_MODEL_KEY]: scale.model };
    this.detailOpen = true;
    this.applyAlarmScope();
  }

  private startManage(): void {
    this.managing = true;
    this.checkedScaleIds = [];
    if (this.detailOpen) {
      this.closeDetail();
    }
  }

  /** Done: the checks go, the bulk editor closes. */
  private endManage(): void {
    this.managing = false;
    this.checkedScaleIds = [];
    this.scaleTable?.clearChecked();
    this.bulkOpen = false;
  }

  /** "Select all (n)": every row passing the search checked — all checked already: none. */
  private toggleAllScales(): void {
    const table = this.scaleTable;
    if (!table) {
      return;
    }
    if (table.allFilteredChecked) {
      table.clearChecked();
    } else {
      table.checkAll(true);
    }
  }

  /** The table's checks (while managing). */
  onScaleSelection(rows: Record<string, any>[]): void {
    if (this.managing) {
      this.checkedScaleIds = rows.map((r) => r["deviceId"] as string);
    }
  }

  /** "Edit (n)": the bulk editor for the checked scales — the Scale card's model, blank (each left as it is) until picked. */
  openBulkEdit(): void {
    if (!this.checkedScaleIds.length) {
      return;
    }
    this.bulkScaleIds = [...this.checkedScaleIds];
    this.bulkName = `${this.bulkScaleIds.length} ${this.bulkScaleIds.length === 1 ? "scale" : "scales"}`;
    this.bulkRendered = true;
    this.bulkOpen = true;
  }

  /** Saved: the model written on each checked scale — Manage ends, the scales read again (the Model column, the Models filter). */
  onBulkSaved(): void {
    this.toasts.success(`${this.bulkName} saved`);
    this.endManage();
    this.loadScales();
  }

  /** The bulk editor finished sliding out: its form unmounted (a fresh one on the next open), unless it was opened again. */
  onBulkAfterClosed(): void {
    if (!this.bulkOpen) {
      this.bulkRendered = false;
    }
  }

  closeDetail(): void {
    this.detailOpen = false;
    this.selectedScale = null;
    this.detailAlarms = [];
  }

  /** The settings card saved (name, label, note): read the scales again. */
  onSettingsSaved(): void {
    this.toasts.success("Scale saved");
    this.loadScales();
  }

  clearAlarm(alarm: AlarmListItem): void {
    clearDashboardAlarm(this.alarmService, this.destroyRef, alarm, {
      // The lists hold copies of the subscription's alarms: mark the source too.
      also: [this.allAlarms.find((a) => a.id === alarm.id)],
      onError: () => {
        this.applyAlarmScope();
        this.cd.detectChanges();
      },
    });
    this.applyAlarmScope();
  }

  // -- data: scales ---------------------------------------------------------------------

  private get scaleFilter(): EntityFilter {
    return { type: AliasFilterType.deviceType, deviceTypes: this.settings.scaleDeviceTypes, deviceNameFilter: "" } as EntityFilter;
  }

  /** The time series a scale shows. */
  private get readingKeys(): string[] {
    const s = this.settings;
    return [s.rateKey, s.hourRateKey, s.speedKey, s.loadKey, s.totalKey, s.stateKey];
  }

  /** Every scale (one entity query): its identity, where it is (its stored codes), whether it's active, its latest readings. */
  loadScales(): void {
    const server = (key: string) => ({ type: EntityKeyType.SERVER_ATTRIBUTE, key });
    const query: EntityDataQuery = {
      entityFilter: this.scaleFilter,
      pageLink: byNamePageLink(),
      entityFields: [
        { type: EntityKeyType.ENTITY_FIELD, key: "name" },
        { type: EntityKeyType.ENTITY_FIELD, key: "label" },
        { type: EntityKeyType.ENTITY_FIELD, key: "type" },
        { type: EntityKeyType.ENTITY_FIELD, key: "additionalInfo" },
        ...OWNER_ENTITY_FIELDS,
      ],
      // Always the server attributes: a client attribute of the same name could come back instead.
      latestValues: [server("active"), server("site"), server("market"), server(SCALE_MODEL_KEY), ...this.readingKeys.map((key) => ({ type: EntityKeyType.TIME_SERIES, key }))],
    };
    this.ctx.entityService
      .findEntityDataByQuery(query, QUIET_REQUEST)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this.scales = page.data.map((d) => this.toScaleRow(d));
          this.scalesLoading = false;
          this.applyFilters();
          this.refreshSelectedScale();
          this.cd.detectChanges();
          this.loadScaleGroups();
        },
        error: () => {
          this.scalesLoading = false;
          this.applyFilters();
          this.cd.detectChanges();
        },
      });
  }

  /** A scale's groups as read with the table (the Settings form's "Groups", shown at once) — null until read: the form reads them. */
  scaleGroupsOf(deviceId: string): string[] | null {
    return this.scaleGroups.get(deviceId) ?? null;
  }

  /**
   * The scales' groups, read after the table loads — in the background, a few at a time, each scale once (a scale that appears
   * later on its next load) — so a scale's Settings form has them when its row is clicked, nothing read then.
   */
  private loadScaleGroups(): void {
    const unread = this.scales.map((r) => r.deviceId).filter((id) => !this.scaleGroups.has(id));
    if (this.groupsReading || !unread.length) {
      return;
    }
    this.groupsReading = true;
    from(unread)
      .pipe(
        mergeMap((id) => deviceGroupNames(this.ctx, id).pipe(map((names) => [id, names] as const)), ARIA_GROUP_READS),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: ([id, names]) => this.scaleGroups.set(id, names),
        complete: () => {
          this.groupsReading = false;
          this.cd.detectChanges();
        },
      });
  }

  private toScaleRow(d: any): ScaleRow {
    const s = this.settings;
    const fields = d.latest?.[EntityKeyType.ENTITY_FIELD] ?? {};
    const server = d.latest?.[EntityKeyType.SERVER_ATTRIBUTE] ?? {};
    const ts = d.latest?.[EntityKeyType.TIME_SERIES] ?? {};
    const num = (key: string) => parseNumber(ts[key]?.value);
    const deviceName = String(fields["name"]?.value ?? "");
    const deviceLabel = String(fields["label"]?.value ?? "");
    const siteCode = String(server["site"]?.value ?? "");
    const lastUpdateTs = this.readingKeys.map((k) => Number(ts[k]?.ts) || 0).reduce((a, b) => Math.max(a, b), 0) || null;
    return {
      deviceId: d.entityId.id,
      name: deviceLabel || deviceName,
      deviceName,
      deviceLabel,
      description: parseDescription(fields["additionalInfo"]?.value),
      type: String(fields["type"]?.value ?? ""),
      owner: ownerCustomer(fields),
      ...this.locate(siteCode),
      marketId: String(server["market"]?.value ?? ""),
      model: scaleModel(server[SCALE_MODEL_KEY]?.value),
      condition: scaleCondition(server["active"]?.value, ts[s.stateKey]?.value),
      rate: num(s.rateKey),
      hourRate: num(s.hourRateKey),
      speed: num(s.speedKey),
      load: num(s.loadKey),
      total: num(s.totalKey),
      lastUpdateTs,
    };
  }

  /** A scale's site, from its stored code: the code, and its label for the bubble ("" when it's the code). */
  private locate(siteCode: string): Pick<ScaleRow, "siteId" | "siteCode" | "siteLabel"> {
    const label = siteCode ? (this.siteByCode?.get(siteCode)?.name ?? "") : "";
    return { siteId: siteCode, siteCode, siteLabel: label !== siteCode ? label : "" };
  }

  /** The Organization's markets and sites, once — the rows' sites by their labels, the Sites tree by its plants' names. */
  private loadNames(): void {
    loadOrganizationNames(this.ctx)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (names) => {
          this.siteByCode = new Map(names.sites.map((x) => [x.code, x]));
          this.scales = this.scales.map((r) => ({ ...r, ...this.locate(r.siteCode) }));
          this.applyFilters();
          this.cd.detectChanges();
        },
        error: () => {
          this.siteByCode = new Map();
          this.cd.detectChanges();
        },
      });
  }

  /** Live: a change of a scale's readings or its `active` reads them all again — at most every few seconds. */
  private subscribeScales(): void {
    subscribeLatestChanges(
      this.ctx,
      this.destroyRef,
      { entityFilter: this.scaleFilter, attributes: ["active", SCALE_MODEL_KEY], timeseries: this.readingKeys },
      () => {
        if (!this.refreshTimer) {
          this.refreshTimer = setTimeout(() => {
            this.refreshTimer = undefined;
            this.loadScales();
          }, ARIA_REFRESH_MS);
        }
      },
      (subscription) => (this.scalesSubscription = subscription)
    );
  }

  /** The open panel follows its reloaded scale (and closes should it be gone). */
  private refreshSelectedScale(): void {
    if (!this.selectedScale) {
      return;
    }
    const fresh = this.scales.find((r) => r.deviceId === this.selectedScale!.deviceId) ?? null;
    if (fresh) {
      if (fresh.model !== this.selectedScale.model) {
        this.scaleCardValues = { [SCALE_MODEL_KEY]: fresh.model };
      }
      this.selectedScale = fresh;
    } else {
      this.closeDetail();
    }
  }

  // -- filters ------------------------------------------------------------------------

  /**
   * The Statuses, Models and Sites filters over the scales — each option counted under the other filters — then the table's rows and the
   * alarms in scope. The Sites tree: the shared site tree (`siteFilterTree` — "All sites" › each market › its plants) of the
   * plants the scales are at, each under the market its scales store.
   */
  private applyFilters(): void {
    const conditions = new Set(this.selectedConditions);
    const models = new Set(this.selectedModels);
    const byCondition = (r: ScaleRow) => !conditions.size || conditions.has(r.condition);
    const byModel = (r: ScaleRow) => !models.size || models.has(r.model || NO_SCALE_MODEL);
    const bySite = (r: ScaleRow) => !this.selectedSites.length || this.selectedSites.includes(r.siteId);

    const forConditions = this.scales.filter((r) => byModel(r) && bySite(r));
    this.conditionOptions = SCALE_CONDITIONS.map((c) => ({
      id: c,
      label: SCALE_CONDITION_META[c].label,
      count: forConditions.filter((r) => r.condition === c).length,
    }));
    const forModels = this.scales.filter((r) => byCondition(r) && bySite(r));
    this.modelOptions = [...SCALE_MODELS, NO_SCALE_MODEL].map((m) => ({
      id: m,
      label: m === NO_SCALE_MODEL ? "Not set" : m,
      count: forModels.filter((r) => (r.model || NO_SCALE_MODEL) === m).length,
    }));

    const siteMarket = new Map<string, string>();
    for (const r of this.scales) {
      if (r.siteId && !siteMarket.get(r.siteId)) {
        siteMarket.set(r.siteId, r.marketId);
      }
    }
    const sites = [...siteMarket].map(([code, marketId]) => ({ id: code, name: code, label: this.siteByCode?.get(code)?.name ?? code, marketId }));
    const markets = [...new Set([...siteMarket.values()].filter(Boolean))].map((code) => ({ id: code, name: code }));
    const atSite = new Map<string, number>();
    this.scales.filter((r) => byCondition(r) && byModel(r)).forEach((r) => r.siteId && atSite.set(r.siteId, (atSite.get(r.siteId) ?? 0) + 1));
    this.siteFilterOptions = siteFilterTree(sites, markets, (code) => atSite.get(code) ?? 0);
    // A pick of a site no longer listed drops out.
    const listed = siteTreeIds(this.siteFilterOptions);
    if (!this.scalesLoading && this.selectedSites.some((id) => !listed.has(id))) {
      this.selectedSites = this.selectedSites.filter((id) => listed.has(id));
    }

    this.tableRows = this.scales.filter((r) => byCondition(r) && byModel(r) && bySite(r));
    this.applyShownScales();
    // Managing: a checked scale the filters now hide drops out.
    if (this.managing) {
      const shown = new Set(this.tableRows.map((r) => r.deviceId));
      this.checkedScaleIds = this.checkedScaleIds.filter((id) => shown.has(id));
    }
    this.applyAlarmScope();
  }

  // -- the Time Machine view ----------------------------------------------------------------

  /** The "Time Machine" switch on: its cards in the table's place — the table's Manage ends (the cards have none). */
  onTimeMachineSwitched(on: boolean): void {
    if (on && this.managing) {
      this.endManage();
    }
  }

  /** The Time Machine view in the table's place: its switch on — never on a phone (its switch not shown there). */
  get timeMachineShown(): boolean {
    return this.tm.on && !this.phone;
  }

  /** The sidebar's search: the table's (it searches itself), the Time Machine's cards' here. */
  onSearchChange(terms: string[]): void {
    this.scaleSearch = terms;
    this.applyShownScales();
  }

  /** A card's name: its scale's panel, as a table row's click. */
  openTimeMachineDevice(device: TimeMachineDevice): void {
    const scale = this.shownScales.find((r) => r.deviceId === device.id);
    if (scale && !(this.detailOpen && this.selectedScale?.deviceId === scale.deviceId)) {
      this.onScaleRowClick(scale);
    }
  }

  /**
   * The scales shown (the filters' rows, searched as the table searches — every term in the label, the device name, the site or the
   * model), and the Time Machine's cards for them.
   */
  private applyShownScales(): void {
    const terms = this.scaleSearch.map((t) => t.trim().toLowerCase()).filter(Boolean);
    this.shownScales = terms.length
      ? this.tableRows.filter((r) => {
          const text = `${r.name} ${r.deviceName} ${r.siteCode} ${r.siteLabel} ${r.model}`.toLowerCase();
          return terms.every((t) => text.includes(t));
        })
      : this.tableRows;
    this.tmDevices = this.shownScales.map((r) => this.timeMachineDevice(r));
  }

  /**
   * A scale's Time Machine card: its belt's name, its device name and its site ("Jaw Discharge #2 · agg-3b30-scale-01 · Richmond Lab
   * (4R20)"); its state's pill beside its name (the table's, now — at a picked time, its state bar's then); its rate (with the
   * hour's average) and the belt's state as a bar under it — producing, blackbelt, stopped or offline; reporting while its readings
   * come in, once a minute.
   */
  private timeMachineDevice(r: ScaleRow): TimeMachineDevice {
    return {
      id: r.deviceId,
      name: r.name,
      detail: r.deviceName,
      site: r.siteCode ? (r.siteLabel ? `${r.siteLabel} (${r.siteCode})` : r.siteCode) : "",
      charts: this.timeMachineCharts,
      readingKeys: this.readingKeys,
      reportInterval: ARIA_REPORT_MS,
      status: scaleConditionPill(r.condition),
    };
  }

  // -- data: alarms ---------------------------------------------------------------------

  /** The scales' active alarms, live. */
  private subscribeAlarms(): void {
    subscribeActiveAlarms(this.ctx, this.destroyRef, {
      entityFilter: this.scaleFilter,
      onSubscribed: (subscription) => (this.alarmsSubscription = subscription),
      onUpdated: (alarms) => {
        this.allAlarms = alarms;
        this.alarmsLoading = false;
        this.applyAlarmScope();
        this.cd.detectChanges();
      },
    });
  }

  /** The alarms of the scales shown (named by their belts), of the scale open, and each row's count. */
  private applyAlarmScope(): void {
    this.alarmCounts = countAlarmsByOriginator(this.allAlarms);
    const names = new Map(this.tableRows.map((r) => [r.deviceId, r.name]));
    this.panelAlarms = this.allAlarms.filter((a) => names.has(a.originatorId)).map((a) => ({ ...a, originatorName: names.get(a.originatorId) ?? a.originatorName }));
    const id = this.selectedScale?.deviceId;
    this.detailAlarms = id ? this.allAlarms.filter((a) => a.originatorId === id) : [];
  }

  // -- misc ---------------------------------------------------------------------------

  /** The user's settings: the theme, the columns picked, the Time Machine's view switches and window. */
  private loadUserPreferences(): void {
    readUserSettings(this.ctx, this.destroyRef, (settings) => {
      this.theme.restore(settings);
      this.columnChoice.restore(settings);
      // The Time Machine's "Large charts", "Alarms on top" and window as the user left them — its switch is never saved: off on
      // every load.
      this.tm.restore(settings);
      this.cd.detectChanges();
    });
  }
}
