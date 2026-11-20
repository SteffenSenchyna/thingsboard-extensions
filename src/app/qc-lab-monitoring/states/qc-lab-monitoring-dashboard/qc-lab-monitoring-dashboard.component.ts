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

import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  Input,
  OnDestroy,
  OnInit,
  ViewChild,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { SharedModule } from "@shared/public-api";
import {
  AggregationType,
  AliasFilterType,
  AttributeScope,
  EntityDataQuery,
  EntityFilter,
  EntityKeyType,
  EntityType,
} from "@shared/public-api";
import { Observable, forkJoin, from, of } from "rxjs";
import { catchError, map, mergeMap, toArray } from "rxjs/operators";
import type { AlarmService } from "@core/http/alarm.service";
import { CopyBoxComponent } from "../../../components/shared/copy-box/copy-box.component";
import { CountMarkComponent } from "../../../components/shared/count-mark/count-mark.component";
import { DashboardAlarm, alarmsTab, clearDashboardAlarm, subscribeActiveAlarms } from "../../../components/shared/dashboard/dashboard-alarms";
import { dashboardRailItems, isTenantAdmin, DashboardTheme, readUserSettings } from "../../../components/shared/dashboard/dashboard-preferences";
import { DashboardHost, NestedDashboard, nestedUrlParams, ownsUrlState } from "../../../components/shared/dashboard/nested-dashboard";
import { readDashboardUrlState, watchDashboardUrlState, writeDashboardUrlState } from "../../../components/shared/dashboard/dashboard-url-state";
import { DashboardRootDirective } from "../../../components/shared/dashboard/dashboard-root.directive";
import { byNamePageLink, removeSubscriptions, subscribeLatestChanges } from "../../../components/shared/dashboard/dashboard-subscriptions";
import { TableLinksComponent } from "../../../components/shared/table-links/table-links.component";
import { tableManageOf } from "../../../components/shared/data-table/table-manage";
import { DataTableCellDirective, DataTableColumn, DataTableComponent } from "../../../components/shared/data-table/data-table.component";
import { SidebarLayoutComponent } from "../../../components/shared/sidebar-layout/sidebar-layout.component";
import { NavRailComponent, NavRailItem } from "../../../components/shared/nav-rail/nav-rail.component";
import { ToastsComponent } from "../../../components/shared/toasts/toasts.component";
import { FeedbackDialogComponent } from "../../../components/shared/feedback/feedback-dialog/feedback-dialog.component";
import { FEEDBACK_RAIL_ID, feedbackOf } from "../../../components/shared/feedback/feedback.models";
import { DashboardLoadingComponent, FirstLoad } from "../../../components/shared/dashboard-loading/dashboard-loading.component";
import { SearchBoxComponent } from "../../../components/shared/search-box/search-box.component";
import { FilterSectionComponent } from "../../../components/shared/filter-section/filter-section.component";
import { FilterSectionsComponent } from "../../../components/shared/filter-sections/filter-sections.component";
import { FilterListComponent, FilterListOption } from "../../../components/shared/filter-list/filter-list.component";
import { LOCATION_KEYS, NamedAsset, loadOrganizationNames } from "../../../components/shared/organization/site-locations";
import { siteFilterTree, siteTreeIds } from "../../../components/shared/organization/organization.models";
import { keepsSidePanelOpen } from "../../../components/shared/detail-panel/side-panel-outside-click";
import { EntityDetailPanelComponent, HISTORY_TAB, INSIGHTS_TAB, SETTINGS_TAB } from "../../../components/shared/entity-detail-panel/entity-detail-panel.component";
import { SegmentOption, SegmentedControlComponent } from "../../../components/shared/segmented-control/segmented-control.component";
import { TB_CUSTOM_TIMEFRAME, TB_WINDOW_TIMEFRAMES, TB_WINDOW_TIMEFRAME_OPTIONS, TimeframePickerComponent } from "../../../components/shared/timeframe-picker/timeframe-picker.component";
import { CheckFilterComponent } from "../../../components/shared/check-filter/check-filter.component";
import type { TrendPoint } from "../../../components/shared/trend-chart/trend-chart.component";
import { QcLabReportsComponent } from "../../components/qc-lab-reports/qc-lab-reports.component";
import { QcReport, ReportChannel, buildQcReport, channelRange } from "../../components/qc-lab-reports/qc-lab-reports.models";
import { MetricChartCardComponent, MetricChartSection } from "../../../components/shared/metric-chart-card/metric-chart-card.component";
import { LineChartThreshold } from "../../../components/shared/line-chart/line-chart.component";
import { LorawanSignalCardComponent } from "../../../components/shared/lorawan-signal-card/lorawan-signal-card.component";
import { FigureCardComponent } from "../../../components/shared/figure-card/figure-card.component";
import {
  AttributeSelect,
  DeviceSettingControl,
  DeviceSettingObject,
  DeviceSettingObjectCard,
  DeviceSettingsCardComponent,
} from "../../../components/shared/device-settings-card/device-settings-card.component";
import { ThresholdAlarmRange, thresholdAlarmLines, thresholdAlarmObject } from "../../../components/shared/device-settings-card/threshold-alarm";
import { injectCss } from "../../../components/shared/cdn-loader";
import { CardComponent } from "../../../components/shared/card/card.component";
import { ConfirmDialogComponent } from "../../../components/shared/confirm-dialog/confirm-dialog.component";
import { TbDateRange } from "../../../components/shared/date-range-picker/date-range-picker.component";
import { DateFieldComponent } from "../../../components/shared/date-field/date-field.component";
import { DatePickerHostComponent, findDatePickerHost } from "../../../components/shared/date-field/date-picker-host.component";
import { formatDateTime, relativeTime } from "../../../components/shared/time-format";
import { StatusPillComponent } from "../../../components/shared/status-pill/status-pill.component";
import { AlarmListComponent } from "../../../components/shared/alarm-list/alarm-list.component";
import { AlarmPanelComponent } from "../../../components/shared/alarm-panel/alarm-panel.component";
import { WidgetContext } from "@home/models/widget-component.models";
import { QUIET_REQUEST, apiMessage, parseDescription, parseNumber } from "../../../components/shared/value-utils";
import { ProfileIcons, profileIconsOf } from "../../../components/shared/profile-icons/profile-icons";
import { TimeMachineState } from "../../../components/shared/time-machine/time-machine-state";
import { TimeMachineDevice } from "../../../components/shared/time-machine/time-machine-events";
import { TimeMachineViewComponent } from "../../../components/shared/time-machine/time-machine-view/time-machine-view.component";
import { TimeMachineSwitchesComponent } from "../../../components/shared/time-machine/time-machine-switches/time-machine-switches.component";
import { TimeMachinePickerComponent } from "../../../components/shared/time-machine/time-machine-picker/time-machine-picker.component";

/** The user settings' prefix of its Time Machine view's switches and window (`qcLabLargeCharts`, `qcLabAlarmsFirst`, `qcLabTimeframe`,
 *  `qcLabRange`) — the "Time Machine" switch itself is never saved. */
const TIME_MACHINE_SETTINGS = "qcLab";

/**
 * Its pages: the devices (Temperature | Ambience, a button group atop the sidebar) and the Reports page — its own rail's, and
 * nested, QC Lab's menu in Home's rail.
 */
const QC_PAGES: NavRailItem[] = [
  { id: "devices", label: "Devices", icon: "device_thermostat" },
  { id: "reports", label: "Reports", icon: "analytics" },
];
const MINUTE = 60_000;
/** Which History form a draft belongs to: the device panel's tab or the bulk editor's. */
type HistoryScope = "device" | "bulk";

/** One History form's in-progress state. */
interface HistoryDraft {
  /** Replay range (epoch ms), or null until picked. */
  range: TbDateRange | null;
  sending: boolean;
  /** When the last request was queued (this session), epoch ms. */
  sentAt: number | null;
}

/** What a device is: a two-channel temperature probe (TS302) or an ambience
 *  sensor (temperature + humidity). Drives its table cell and detail panel. */
type DeviceKind = "probe" | "ambience";
/** A page: the devices' tables (Temperature | Ambience), or the Reports page. */
type QcPage = "devices" | "reports";

/** One device row in the Devices list. */
interface DeviceRow {
  deviceId: string;
  name: string;
  label: string;
  /** Device profile / type — picks the hardware version's settings wiring. */
  type: string;
  /** Probe (TS302) or ambience sensor — see {@link DeviceKind}. */
  kind: DeviceKind;
  /** Where it is (the location filters, the Site column) — its stored `site` / `market` attributes (codes, "" for none):
   *  the site's code as its filter id, its label; the market's code. */
  siteId: string;
  site: string;
  /** The Site column: the site by its name (its code), its label for the bubble ("" when it's the code). */
  siteCode: string;
  siteLabel: string;
  marketId: string;
  /** Ambience sensors: latest temperature ("21.4 °C") and humidity ("54 %"), or "—". */
  temperature: string;
  humidity: string;
  /** Ambience sensors: the calculated `temperatureAlarm` / `humidityAlarm`
   *  booleans — colour that reading red while true. */
  temperatureAlarm: boolean;
  humidityAlarm: boolean;
  /** Raw readings (null when missing) — what the table columns sort by. */
  chn1Value: number | null;
  chn2Value: number | null;
  temperatureValue: number | null;
  humidityValue: number | null;
  /** The condensed Readings column's sort value: channel 1, or the ambience temperature. */
  readingValue: number | null;
  alarmCount: number;
  /** Whether a "Channel N Threshold" alarm is active — colours that channel's value. */
  chn1Alarm: boolean;
  chn2Alarm: boolean;
  /** Latest channel temperatures, preformatted with the °C unit (or "—"). */
  tempChn1: string;
  tempChn2: string;
  /** Latest battery level (%), or null when unavailable. */
  battery: number | null;
  /** Timestamp (ms) of the latest battery reading, or null. */
  batteryTs: number | null;
  // Settings-tab data, pre-fetched here so the panel needs no per-click query.
  /** Raw device name (Hostname). */
  deviceName: string;
  /** Raw device label (Name/Alias). */
  deviceLabel: string;
  /** Device description (Note). */
  description: string;
  /** Sensor-channel server attributes. */
  sensorChannel1: string;
  sensorChannel2: string;
  /** Raw SHARED_SCOPE device-setting values, keyed by attribute key. */
  deviceSettings: Record<string, string>;
  /** Raw SHARED_SCOPE JSON-object attributes (calibration, alarms), by key. */
  objectValues: Record<string, unknown>;
  /** SERVER attr: true once all queued config downlinks have been acked. */
  syncState: boolean;
  /** SERVER attr: number of config downlinks queued but not yet acked. */
  downlinkQueue: number;
}

@Component({
  selector: "tb-qc-lab-monitoring-dashboard",
  templateUrl: "./qc-lab-monitoring-dashboard.component.html",
  styleUrls: ["./qc-lab-monitoring-dashboard.component.scss"],
  standalone: true,
  imports: [
    CommonModule,
    SharedModule,
    SegmentedControlComponent,
    DataTableComponent,
    TableLinksComponent,
    DataTableCellDirective,
    CopyBoxComponent,
    SidebarLayoutComponent,
    DashboardRootDirective,
    DashboardLoadingComponent,
    ToastsComponent,
    FeedbackDialogComponent,
    NavRailComponent,
    SearchBoxComponent,
    FilterSectionComponent,
    FilterSectionsComponent,
    FilterListComponent,
    EntityDetailPanelComponent,
    MetricChartCardComponent,
    LorawanSignalCardComponent,
    FigureCardComponent,
    DeviceSettingsCardComponent,
    StatusPillComponent,
    AlarmListComponent,
    AlarmPanelComponent,
    CardComponent,
    ConfirmDialogComponent,
    DateFieldComponent,
    DatePickerHostComponent,
    CountMarkComponent,
    TimeMachineViewComponent,
    TimeMachineSwitchesComponent,
    TimeMachinePickerComponent,
    TimeframePickerComponent,
    CheckFilterComponent,
    QcLabReportsComponent,
  ],
})
export class QcLabMonitoringDashboardComponent implements OnInit, AfterViewInit, OnDestroy, NestedDashboard {
  @Input() ctx: WidgetContext;
  /** Opened inside the Home dashboard (one of its apps): no rail of its own, Home's theme (nested-dashboard.ts). */
  @Input() host: DashboardHost | null = null;

  /** Two-channel temperature probes (device profile names). */
  private readonly probeTypes = ["Milesight-TS302", "Milesight-TS302-V2"];
  /** Ambience sensors — temperature + humidity (device profile names). */
  private readonly ambienceTypes = ["Milesight-AM102", "Milesight-EM320-TH"];
  /** Device types listed by this dashboard (== device profile names). */
  readonly deviceTypes = [...this.probeTypes, ...this.ambienceTypes];

  // -- views + sidebar filter --------------------------------------------------
  /** Nested in Home: its pages, QC Lab's menu in Home's rail (as Fuel's and Asphalt's). */
  static readonly nestedPages: NavRailItem[] = QC_PAGES;
  /** The rail's pages: the devices, then the Reports page. */
  readonly pages: NavRailItem[] = QC_PAGES;
  /** The page shown: the devices' tables, or the Reports page. */
  page: QcPage = "devices";
  /** The Devices page's list: Temperature | Ambience, the button group atop its sidebar (a phone: atop the page). */
  view: DeviceKind = "probe";
  readonly viewOptions: SegmentOption[] = [
    { id: "probe", label: "Temperature", icon: "device_thermostat", tooltip: "Temperature" },
    { id: "ambience", label: "Ambience", icon: "humidity_percentage", tooltip: "Ambience" },
  ];
  /** Whether the filter sidebar is shown (its edge tab). */
  sidebarOpen = true;
  /** The device table's search (the sidebar box): its chips and text, and both together for the table. */
  deviceSearchTerms: string[] = [];
  deviceSearchText = "";
  deviceSearch: string[] = [];

  // -- the Time Machine view (the shared tb-time-machine-view) ---------------------
  /**
   * Its "Time Machine" switch — the view (a card a device, the window's timeline beside them) in the table's place; never saved: off
   * on every load — "Large charts", "Alarms on top", the window (kept in the user's settings) and the picked time (every chart's
   * pointer: the cards', the device panel's). Made in ngOnInit.
   */
  tm!: TimeMachineState;
  /**
   * The devices shown: the active view's kind, the location filters and the search (the table's own search, done here for the
   * cards) — the Time Machine's cards, and whose events it shows. A field (see {@link tableRows}).
   */
  shownRows: DeviceRow[] = [];
  /** Their cards: each device with its charts (its kind's, with its own alarm thresholds) and what shows it reporting. */
  tmDevices: TimeMachineDevice[] = [];

  /** Rail foot: the alarms (badge = the active count) and the light/dark toggle (icon follows the theme). */
  get railBottomItems(): NavRailItem[] {
    return dashboardRailItems(this.darkMode, this.activeAlarmCount, { themeToggle: isTenantAdmin(this.ctx) });
  }

  onRailBottomClick(id: string): void {
    if (id === "alarms") {
      this.alarmDialogOpen = !this.alarmDialogOpen; // a second click closes it
    } else if (id === FEEDBACK_RAIL_ID) {
      feedbackOf(this.ctx).show("QC Lab");
    } else if (id === "theme") {
      this.toggleTheme();
    }
  }
  /** The Organization's sites by code — their labels for the devices' stored location (read once). */
  private siteByCode = new Map<string, NamedAsset>();
  /** The Site filter (site codes; none checked = all): the shared site tree — each market › its sites (`siteFilterTree`). */
  selectedSites: string[] = [];
  siteFilterOptions: FilterListOption[] = [];
  /** Devices (of both kinds) passing the location filters — what the alarms
   *  panel and header badge cover. */
  scopedRows: DeviceRow[] = [];
  /**
   * Rows the active view's table shows: its kind of device, location-filtered.
   * A field, not a getter: the table resets and re-measures on every new `rows`
   * reference, so a fresh array per change-detection pass loops forever.
   */
  tableRows: DeviceRow[] = [];

  /** The light / dark theme: the user's pick, or the system's (shared with the other dashboards). */
  theme!: DashboardTheme;
  get darkMode(): boolean {
    return !!this.theme?.dark;
  }
  // Each view's table: wide screens get one column per field (like the fuel
  // tables); narrow ones the condensed Device + Readings pair. The Device
  // column shows the device's profile icon before its name.
  readonly probeColumns: DataTableColumn[] = [
    { key: "name", header: "Device", iconOf: (r) => this.deviceIcon(r["type"]) },
    { key: "imei", phone: "hide", header: "IMEI", sortKey: "label" },
    { key: "site", phone: "sub", header: "Site", sortKey: "siteCode", tooltipKey: "siteLabel" },
    { key: "chn1", phone: "meta", header: "Channel 1", sortKey: "chn1Value" },
    { key: "chn2", phone: "meta", header: "Channel 2", sortKey: "chn2Value" },
    { key: "battery", phone: "meta", header: "Battery" },
    { key: "alarmCount", phone: "trail", header: "Alarms" },
  ];
  readonly ambienceColumns: DataTableColumn[] = [
    { key: "name", header: "Device", iconOf: (r) => this.deviceIcon(r["type"]) },
    { key: "imei", phone: "hide", header: "IMEI", sortKey: "label" },
    { key: "site", phone: "sub", header: "Site", sortKey: "siteCode", tooltipKey: "siteLabel" },
    { key: "temperature", phone: "meta", header: "Temperature", sortKey: "temperatureValue" },
    { key: "humidity", phone: "meta", header: "Humidity", sortKey: "humidityValue" },
    { key: "battery", phone: "meta", header: "Battery" },
    { key: "alarmCount", phone: "trail", header: "Alarms" },
  ];
  readonly compactColumns: DataTableColumn[] = [
    { key: "name", header: "Device", iconOf: (r) => this.deviceIcon(r["type"]) },
    // Probe: both channel temperatures; ambience: temperature + humidity.
    { key: "readings", header: "Readings", align: "right", sortKey: "readingValue" },
  ];
  /** Content area narrower than {@link compactBreakpoint} — condensed table. */
  compact = false;
  /** Content width (px) below which the table switches to the condensed layout. */
  private readonly compactBreakpoint = 760;
  @ViewChild("content") private contentEl?: ElementRef<HTMLElement>;
  /** The root's phone layout (tbDashboardRoot): on a phone, the list alone (its search and filters in the sidebar's sheet) — no Time Machine. */
  @ViewChild(DashboardRootDirective, { static: true }) private root?: DashboardRootDirective;
  /** The dashboard's toasts (in its root): a request that fails says why there. */
  @ViewChild("toasts", { static: true }) private toasts?: ToastsComponent;
  private contentObserver?: ResizeObserver;

  get probeTableColumns(): DataTableColumn[] {
    return this.compact ? this.compactColumns : this.probeColumns;
  }

  get ambienceTableColumns(): DataTableColumn[] {
    return this.compact ? this.compactColumns : this.ambienceColumns;
  }
  devicesRows: DeviceRow[] = [];
  devicesLoading = false;
  /** The devices' first read is in: the Time Machine view's placeholder cards until then (not on every live reload after). */
  devicesLoaded = false;
  /** Currently selected device shown in the detail panel (null when closed). */
  selectedDevice: DeviceRow | null = null;
  /** Whether the right-side device detail panel is open. */
  detailOpen = false;
  // tb-metric-chart-card owning its own timeseries subscription/cache/spinner.
  /** Window shared by the Insights tab's chart cards (Metrics + Signal) — bound
   *  two-way on both, so picking a window on either mirrors to the other. */
  insightsTimeframe = "1D";
  metricsCharts: MetricChartSection[] = [
    {
      chartTitle: "Temperature",
      unit: "°C",
      // Baseline range; the axis grows past it when readings/thresholds fall outside.
      yMin: 18,
      yMax: 28,
      keys: [
        { name: "temperatureChn1", label: "Channel 1", color: "var(--c-chart-1)" },
        { name: "temperatureChn2", label: "Channel 2", color: "var(--c-chart-2)" },
      ],
    },
  ];
  /** Insights charts for an ambience sensor (its own telemetry keys). */
  ambienceCharts: MetricChartSection[] = [
    {
      chartTitle: "Temperature",
      unit: "°C",
      yMin: 18,
      yMax: 28,
      fill: true,
      keys: [{ name: "temperature", label: "Temperature", color: "var(--c-chart-1)" }],
    },
    {
      chartTitle: "Humidity",
      unit: "%",
      yMin: 0,
      yMax: 100,
      fill: true,
      keys: [{ name: "humidity", label: "Humidity", color: "var(--c-chart-2)" }],
    },
  ];
  /** Stable map of the selected device's channel attributes for the settings card. */
  sensorChannelValues: Record<string, string> = {};
  // Settings tab: device settings mapped to SHARED_SCOPE attributes.
  readonly deviceSettingControls: DeviceSettingControl[] = [
    {
      kind: "toggle",
      key: "historyEnable",
      label: "History",
      info: "Stores readings locally so data survives network outages (needed for historical-data requests).",
    },
    {
      kind: "segmented",
      key: "temperatureUnitDisplay",
      label: "Temperature unit",
      options: [
        { value: "celsius", label: "°C" },
        { value: "fahrenheit", label: "°F" },
      ],
    },
    {
      kind: "segmented",
      key: "timeDisplay",
      label: "Time format",
      options: [
        { value: "12_hour", label: "12H" },
        { value: "24_hour", label: "24H" },
      ],
    },
    {
      kind: "slider",
      key: "reportInterval",
      label: "Report interval",
      min: 1,
      max: 1440,
      step: 1,
      unit: "min",
      info: "Interval for transmitting data to the network server.",
    },
    {
      kind: "slider",
      key: "retransmitInterval",
      label: "Retransmission interval",
      min: 30,
      max: 1200,
      step: 10,
      unit: "s",
      info: "Interval between resent data packets.",
    },
    {
      kind: "buttons",
      key: "timeZone",
      label: "Time zone",
      options: [
        { value: "UTC-7", label: "UTC-7", tooltip: "Vancouver" },
        { value: "UTC-6", label: "UTC-6", tooltip: "Edmonton" },
      ],
    },
  ];
  /** Stable map of the selected device's SHARED_SCOPE settings for the settings card. */
  deviceSettingsValues: Record<string, string | number | boolean> = {};

  // Metric charts (Insights tab) — each card is a self-contained
  /** Stable map of the selected device's object-attribute values for the settings card. */
  objectValues: Record<string, unknown> = {};
  /** Whether the Devices table shows its multi-select checkbox column. */
  selectMode = false;
  /** Device IDs checked in the table's multi-select column. */
  selectedDeviceIds: string[] = [];
  /** Bulk editor content mounted — from open until its slide-out ends. */
  bulkPanelRendered = false;
  /** Bulk editor heading ("4 devices"), fixed at open so it doesn't read
   *  "0 devices" while sliding out after a save clears the selection. */
  bulkPanelName = "";
  /** Whether the bulk-settings panel (right sidebar) is open. */
  bulkEditOpen = false;
  /** The bulk panel reuses the entity detail panel with a single Settings tab. */
  readonly bulkTabs: SegmentOption[] = [
    SETTINGS_TAB,
    HISTORY_TAB,
  ];

  // Settings tab: SHARED_SCOPE JSON-object attributes (Calibration + Alarms).
  alarmsRows: DashboardAlarm[] = [];
  alarmsLoading = false;
  /** Whether the alarms side panel is open. */
  alarmDialogOpen = false;
  /** Alarms of the listed devices, named by device display name (alarms panel —
   *  the shared tb-alarm-list groups them per device and filters by severity). */
  panelAlarms: DashboardAlarm[] = [];
  /** The selected device's alarms (detail panel's Alarms tab). */
  detailAlarms: DashboardAlarm[] = [];
  /** Cards for the single-device panel — reporting variant per selected device.
   *  Assigned in the constructor: the card-definition fields live further down
   *  the class, so a field initializer here would read them as undefined. */
  detailObjectCards: DeviceSettingObjectCard[] = [];
  /** Active-alarm tally per device (resolved from the alarm subscription). */
  private deviceAlarmCount = new Map<string, number>();
  /** Per-device active "Channel N Threshold" alarm flags (colours the temp value). */
  private deviceChannelAlarms = new Map<string, { chn1: boolean; chn2: boolean }>();
  /** The device table, so its selection can be cleared when the panel closes. */
  @ViewChild("deviceTable") private deviceTable?: DataTableComponent;
  // Settings tab: sensor-channel dropdowns mapped to SERVER_SCOPE attributes.
  private readonly channelOptions = [
    { value: "temperatureProbe", label: "Temperature probe" },
    { value: "contactSwitch", label: "Contact switch" },
    { value: "none", label: "None" },
  ];
  readonly sensorChannelSelects: AttributeSelect[] = [
    { key: "sensorChannel1", label: "Channel 1", options: this.channelOptions },
    { key: "sensorChannel2", label: "Channel 2", options: this.channelOptions },
  ];
  // Temperature fields show °C/°F based on the Temperature unit button group.
  private readonly tempUnitFrom = { key: "temperatureUnitDisplay", map: { celsius: "°C", fahrenheit: "°F" } };
  // Calibration: temperatureChnNCalibrationSettings = {enable, calibrationValue}.
  private readonly calibrationFields: DeviceSettingControl[] = [
    { kind: "toggle", key: "enable", label: "Enable" },
    { kind: "slider", key: "calibrationValue", label: "Calibration value", min: -10, max: 10, step: 1, unitFrom: this.tempUnitFrom },
  ];
  // Threshold alarm: temperatureChnNAlarmConfig = {enable, alarmReleaseEnable,
  // condition, thresholdMin, thresholdMax, alarmReportingTimes, alarmReportingInterval}.
  // The per-channel card edits the threshold fields; the reporting fields live
  // Mutation alarm: temperatureChnNMutationAlarmConfig = {enable, mutation}.
  private readonly mutationFields: DeviceSettingControl[] = [
    { kind: "toggle", key: "enable", label: "Enable" },
    { kind: "slider", key: "mutation", label: "Mutation value", min: 0, max: 20, step: 1, unitFrom: this.tempUnitFrom },
  ];
  // Alarm reporting: the release/reporting sub-fields of temperatureChnNAlarmConfig,
  // in the shared "Alarm reporting" card below (written to both channels).
  // The shared threshold alarm's settings: its switch, Condition, and the limit(s) the condition reads.
  private readonly thresholdRange: ThresholdAlarmRange = { min: -40, max: 80, unitFrom: this.tempUnitFrom };
  // Two hardware versions store the alarm-reporting settings differently:
  //  - Milesight-TS302 (V1): inside each channel's temperatureChnNAlarmConfig
  //    ({alarmReleaseEnable, alarmReportingTimes, alarmReportingInterval}).
  //  - Milesight-TS302-V2: globally, as a flat alarmReleaseEnable attribute
  // edited once and applied to both channels' configs (values shown from channel 1).
  private readonly alarmReportingFields: DeviceSettingControl[] = [
    {
      kind: "toggle",
      key: "alarmReleaseEnable",
      label: "Alarm release",
      info: "Send a release message to clear the alarm when the reading returns within the thresholds.",
    },
    {
      kind: "slider",
      key: "alarmReportingTimes",
      label: "Reporting times",
      min: 1,
      max: 5,
      step: 1,
      info: "How many alarm packets are sent each time the alarm triggers.",
    },
    {
      kind: "slider",
      key: "alarmReportingInterval",
      label: "Reporting interval",
      min: 1,
      max: 10,
      step: 1,
      unit: "min",
      info: "Interval between alarm reports while the alarm condition persists.",
    },
  ];
  //    plus alarmConfig = {alarmCounts, alarmInterval}.
  private readonly v2Type = "Milesight-TS302-V2";
  private readonly v1Type = "Milesight-TS302";
  /** V2 alarm reporting: same UI, bound to the global attributes natively. */
  private readonly alarmReportingFieldsV2: DeviceSettingControl[] = [
    { ...this.alarmReportingFields[0], flatKey: "alarmReleaseEnable" },
    { ...this.alarmReportingFields[1], key: "alarmCounts" },
    { ...this.alarmReportingFields[2], key: "alarmInterval" },
  ];
  /**
   * Bulk alarm reporting: one set of controls, routed per hardware version on
   * save — V1 devices get the values inside both channel configs, V2 devices
   * get the global alarmConfig (renamed fields) + flat alarmReleaseEnable.
   */
  private readonly bulkReportingCard: DeviceSettingObjectCard = {
    title: "Alarm reporting",
    flatFields: true,
    groups: [
      {
        objects: [
          {
            key: "temperatureChn1AlarmConfig",
            label: "",
            fields: this.alarmReportingFields,
            targets: [
              { key: "temperatureChn1AlarmConfig", deviceTypes: [this.v1Type] },
              { key: "temperatureChn2AlarmConfig", deviceTypes: [this.v1Type] },
              {
                key: "alarmConfig",
                deviceTypes: [this.v2Type],
                fieldMap: { alarmReportingTimes: "alarmCounts", alarmReportingInterval: "alarmInterval" },
                omitFields: ["alarmReleaseEnable"],
              },
              { key: "alarmReleaseEnable", flatField: "alarmReleaseEnable", deviceTypes: [this.v2Type] },
            ],
          },
        ],
      },
    ],
  };
  /** Cards for the bulk editor — reporting routed per device on save.
   *  Assigned in the constructor (see detailObjectCards). */
  bulkObjectCards: DeviceSettingObjectCard[] = [];
  private readonly calibrationCard: DeviceSettingObjectCard = {
    title: "Calibration",
    info: "Adds a fixed offset to each channel's temperature reading.",
    flatFields: true,
    groups: [
      {
        objects: [{ key: "temperatureChn1CalibrationSettings", label: "Channel 1", gateKey: "enable", fields: this.calibrationFields }],
      },
      {
        objects: [{ key: "temperatureChn2CalibrationSettings", label: "Channel 2", gateKey: "enable", fields: this.calibrationFields }],
      },
    ],
  };
  private readonly thresholdCard: DeviceSettingObjectCard = {
    title: "Threshold alarm",
    info: "Triggers an alarm when the reading crosses the configured min/max thresholds.",
    flatFields: true,
    groups: [
      {
        objects: [thresholdAlarmObject("temperatureChn1AlarmConfig", "Channel 1", this.thresholdRange)],
      },
      {
        objects: [thresholdAlarmObject("temperatureChn2AlarmConfig", "Channel 2", this.thresholdRange)],
      },
    ],
  };
  private readonly mutationCard: DeviceSettingObjectCard = {
    title: "Mutation alarm",
    info: "Triggers an alarm when the reading changes by more than the set amount between samples.",
    flatFields: true,
    groups: [
      {
        objects: [{ key: "temperatureChn1MutationAlarmConfig", label: "Channel 1", gateKey: "enable", fields: this.mutationFields }],
      },
      {
        objects: [{ key: "temperatureChn2MutationAlarmConfig", label: "Channel 2", gateKey: "enable", fields: this.mutationFields }],
      },
    ],
  };
  private alarmService: AlarmService;
  private alarmsSubscription: any;
  private devicesSubscription: any;
  // without re-querying on every individual message.
  private devicesRefreshTimer?: any;
  /** 1s ticker (runs only while the panel is open) so "Updated Xs ago" counts up. */
  private clockTimer?: any;

  // -- History: historical-data request (device panel tab + bulk editor tab) --
  /** One draft per form — the device panel's History tab and the bulk editor's. */
  historyDrafts: Record<HistoryScope, HistoryDraft> = {
    device: { range: null, sending: false, sentAt: null },
    bulk: { range: null, sending: false, sentAt: null },
  };
  /** Confirm-dialog gate in front of sending a request. */
  historyConfirmOpen = false;
  historyConfirmScope: HistoryScope = "device";

  constructor(private cd: ChangeDetectorRef, private destroyRef: DestroyRef) {
    // Built here (not as field initializers) so they're independent of the
    // card-definition fields' declaration order — the constructor always runs
    // after every field initializer.
    this.detailObjectCards = this.cardsWithReporting(this.reportingCard("v1"));
    this.bulkObjectCards = this.cardsWithReporting(this.bulkReportingCard);
  }

  /** The device profiles' icons (shared, one per widget) — set in ngOnInit. */
  private icons!: ProfileIcons;

  /** A device's icon: its profile's (its `type` names it) — the devices' default until it's known. */
  deviceIcon(type: string | null | undefined): string {
    return this.icons.of("device", type);
  }

  /** Whether the selected device has a pending (queued) settings downlink. */
  get settingsQueued(): boolean {
    return this.selectedDevice?.syncState === false;
  }

  /** Tabs for the single-device detail panel — the Alarms (bell) tab carries a
   *  live count badge of the selected device's active alarms. */
  get detailTabs(): SegmentOption[] {
    if (this.selectedDevice?.kind === "ambience") {
      // No channel settings or history replay on ambience sensors.
      return [
        INSIGHTS_TAB,
        alarmsTab(this.selectedDevice.alarmCount ?? 0),
        SETTINGS_TAB,
      ];
    }
    return [
      INSIGHTS_TAB,
      alarmsTab(this.selectedDevice?.alarmCount ?? 0),
      HISTORY_TAB,
      SETTINGS_TAB,
    ];
  }


  /** Current downlinkQueue per device id (from the live table subscription), so the
   *  bulk form can increment each device's queue accurately. */
  get deviceQueues(): Record<string, number> {
    return this.devicesRows.reduce((acc, r) => {
      acc[r.deviceId] = r.downlinkQueue;
      return acc;
    }, {} as Record<string, number>);
  }

  /** Device type per id — the bulk editor routes alarm-reporting saves by it. */
  get deviceTypesById(): Record<string, string> {
    return this.devicesRows.reduce((acc, r) => {
      acc[r.deviceId] = r.type;
      return acc;
    }, {} as Record<string, string>);
  }

  /** Number of active alarms (drives the header badge) — every alarm of a device
   *  the Devices table shows, regardless of the severity filter. */
  get activeAlarmCount(): number {
    return this.scopedAlarms.length;
  }

  /** Alarms belonging to the location-filtered devices (both views). */
  private get scopedAlarms(): DashboardAlarm[] {
    const ids = new Set(this.scopedRows.map((r) => r.deviceId));
    return this.alarmsRows.filter((a) => ids.has(a.originatorId));
  }

  /** All SHARED_SCOPE object/flat attribute keys the settings cards can read
   *  (for prefetch), across both hardware versions — deduped. */
  private get objectAttributeKeys(): string[] {
    const cards = [...this.cardsWithReporting(this.reportingCard("v1")), this.reportingCard("v2")];
    const keys = cards.flatMap((c) => c.groups.flatMap((g) => g.objects.flatMap((o) => [o.key, ...(o.fields.map((f) => f.flatKey).filter(Boolean) as string[])])));
    return [...new Set(keys)];
  }

  /** Entity filter selecting the configured device type(s). */
  private get deviceFilter(): EntityFilter {
    return {
      type: AliasFilterType.deviceType,
      deviceTypes: this.deviceTypes,
      deviceNameFilter: "",
    };
  }

  /** Open the detail panel for a clicked device row. */
  onDeviceRowClick(row: Record<string, any>): void {
    if (this.detailOpen && this.selectedDevice?.deviceId === (row as DeviceRow).deviceId) {
      this.closeDetail(); // the highlighted row again: close, like any click off the panel
      return;
    }
    this.selectedDevice = row as DeviceRow;
    this.detailOpen = true;
    this.resetHistoryRequest("device"); // the tab's draft belongs to one device
    this.syncSettingsInputs();
    this.applyDetailAlarms();
    this.startClock();
  }

  /**
   * The probes table's Manage (`tb-table-links`, the standard footer): "Manage" checks rows — "Edit (n)" opens the bulk editor
   * for the checked devices, "Select all (n)" covers the rows passing the search, "Done" ends it.
   */
  readonly manage = tableManageOf({
    managing: () => this.selectMode,
    selectedCount: () => this.selectedDeviceIds.length,
    allChecked: () => this.deviceTable?.allFilteredChecked ?? false,
    count: () => this.deviceTable?.checkableCount ?? this.tableRows.length,
    start: () => this.startManage(),
    end: () => this.endManage(),
    toggleAll: () => this.toggleSelectAll(),
  });

  /** Manage: the rows take checkboxes (the open device's panel closes, as every table's Manage). */
  private startManage(): void {
    this.selectMode = true;
    if (this.detailOpen) {
      this.closeDetail();
    }
  }

  /** Done: the checks go, the bulk panel closes. */
  private endManage(): void {
    this.selectMode = false;
    this.clearDeviceSelection();
    this.bulkEditOpen = false;
  }

  /** Track the checked device rows for bulk editing. */
  onDeviceSelectionChange(rows: Record<string, any>[]): void {
    this.selectedDeviceIds = rows.map((r) => r["deviceId"] as string);
  }

  /** "Select all (n)": every row passing the search checked — all checked already: none. */
  toggleSelectAll(): void {
    if (this.deviceTable?.allFilteredChecked) {
      this.deviceTable.clearChecked();
    } else {
      this.deviceTable?.checkAll(true);
    }
  }

  /** Open the bulk-settings panel for the checked devices. */
  openBulkEdit(): void {
    if (this.selectedDeviceIds.length) {
      this.resetHistoryRequest("bulk"); // a fresh draft per bulk session
      this.bulkPanelRendered = true;
      this.bulkPanelName = `${this.selectedDeviceIds.length} devices`;
      this.bulkEditOpen = true;
    }
  }

  /** Close the bulk-settings panel without clearing the selection. */
  closeBulkEdit(): void {
    this.bulkEditOpen = false;
  }

  /** After a bulk save: close the panel, exit select mode, refresh. */
  onBulkSaved(): void {
    this.bulkEditOpen = false;
    this.selectMode = false;
    this.clearDeviceSelection();
    this.loadDevices();
  }

  /** Clear the multi-select checkboxes (and the tracked ids). */
  clearDeviceSelection(): void {
    this.deviceTable?.clearChecked();
    this.selectedDeviceIds = [];
  }

  /** Close the detail panel and clear the row highlight (the chart cards tear
   *  down their own subscriptions when removed from the DOM). */
  closeDetail(): void {
    // Starts the slide-out; the device's data is cleared once the panel has
    // gone (onDetailAfterClosed), so its content doesn't blank mid-slide.
    this.detailOpen = false;
    this.stopClock();
    this.deviceTable?.clearSelection();
  }

  /** The device panel finished sliding out — drop the closed device's data
   *  (unless another device was opened meanwhile). */
  onDetailAfterClosed(): void {
    if (this.detailOpen) {
      return;
    }
    this.selectedDevice = null;
    this.detailAlarms = [];
    this.sensorChannelValues = {};
    this.deviceSettingsValues = {};
    this.objectValues = {};
    this.resetHistoryRequest("device");
  }

  /** The bulk editor finished sliding out — unmount its form (a fresh one on
   *  the next open), unless it was reopened meanwhile. */
  onBulkAfterClosed(): void {
    if (!this.bulkEditOpen) {
      this.bulkPanelRendered = false;
    }
  }

  // -- History: historical-data request ---------------------------------------

  /** Drop a form's in-progress state (device switched / its panel left). */
  private resetHistoryRequest(scope: HistoryScope): void {
    this.historyDrafts[scope] = { range: null, sending: false, sentAt: null };
    if (this.historyConfirmScope === scope) {
      this.historyConfirmOpen = false;
    }
  }

  /** A form's chosen range as text, e.g. "Sep 30 at 1:05 PM – Oct 2 at 9:00 AM" (the confirm's; "" none). */
  historyRangeLabel(scope: HistoryScope): string {
    const r = this.historyDrafts[scope].range;
    return r ? `${formatDateTime(r.start)} – ${formatDateTime(r.end)}` : "";
  }

  /** A form's "last queued" note, e.g. "Request queued Oct 8 at 2:14 PM". */
  historySentLabel(scope: HistoryScope): string {
    const at = this.historyDrafts[scope].sentAt;
    return at ? `Request queued ${formatDateTime(at)}` : "";
  }

  openHistoryConfirm(scope: HistoryScope): void {
    this.historyConfirmScope = scope;
    this.historyConfirmOpen = true;
  }

  get historyConfirmMessage(): string {
    const label = this.historyRangeLabel(this.historyConfirmScope);
    if (this.historyConfirmScope === "bulk") {
      const n = this.selectedDeviceIds.length;
      return `${n} selected device${n === 1 ? "" : "s"} will re-send the readings logged between ${label}. Each request is delivered on that device's next check-in.`;
    }
    const name = this.selectedDevice?.name ?? "The device";
    return `${name} will re-send the readings it logged between ${label}. The request is delivered on its next check-in.`;
  }

  /** The devices a form's request goes to. */
  private historyTargets(scope: HistoryScope): DeviceRow[] {
    if (scope === "bulk") {
      return this.devicesRows.filter((r) => this.selectedDeviceIds.includes(r.deviceId));
    }
    return this.selectedDevice ? [this.selectedDevice] : [];
  }

  /**
   * Write each target device's history-request SHARED_SCOPE attribute —
   * V1 (TS302): `fetchHistory`, V2: `retrievalHistoricalDataByTimeRange`, both
   * `{startTime, endTime}` in epoch seconds — with the same queue bookkeeping
   * as a settings save (the attribute triggers a config downlink): bump
   * `downlinkQueue` and flag `syncState` false; the rule chain clears them on
   * the ChirpStack txack.
   */
  onHistoryConfirmed(): void {
    const scope = this.historyConfirmScope;
    const draft = this.historyDrafts[scope];
    const targets = this.historyTargets(scope);
    const range = draft.range;
    this.historyConfirmOpen = false;
    if (!targets.length || !range || draft.sending) {
      return;
    }
    draft.sending = true;
    const value = { startTime: Math.floor(range.start / 1000), endTime: Math.floor(range.end / 1000) };
    const cfg = QUIET_REQUEST;
    const calls = targets.flatMap((device) => {
      const key = device.type === this.v2Type ? "retrievalHistoricalDataByTimeRange" : "fetchHistory";
      const entityId = { entityType: EntityType.DEVICE, id: device.deviceId };
      return [
        this.ctx.attributeService.saveEntityAttributes(entityId, AttributeScope.SHARED_SCOPE, [{ key, value }], cfg),
        this.ctx.attributeService.saveEntityAttributes(
          entityId,
          AttributeScope.SERVER_SCOPE,
          [
            { key: "downlinkQueue", value: (device.downlinkQueue || 0) + 1 },
            { key: "syncState", value: false },
          ],
          cfg,
        ),
      ];
    });
    forkJoin(calls)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          draft.sending = false;
          draft.sentAt = Date.now();
          this.loadDevices(); // refresh the Queued pills / queue counts
          this.cd.detectChanges();
        },
        error: (err) => {
          draft.sending = false;
          // Sent quietly (ThingsBoard shows nothing): its reason here — "You don't have permission…" for a user who may only look.
          this.toasts?.error(`Couldn't send the history request${apiMessage(err)}`);
          this.cd.detectChanges();
        },
      });
  }

  /**
   * Close the detail panel on a click outside it — anywhere but the panel
   * itself, a clickable device row (that switches the panel) or an overlay; see
   * {@link keepsSidePanelOpen}.
   */
  @HostListener("document:pointerdown", ["$event"])
  onDocumentPointerDown(event: Event): void {
    // (Nor a Time Machine card's name — it switches the panel, as a row — or the timeline: its marker moves the panel's charts' pointer.)
    if (!this.detailOpen || keepsSidePanelOpen(event.target)) {
      return;
    }
    this.closeDetail();
    this.cd.detectChanges();
  }

  /** The loading page while the dashboard first loads (tb-dashboard-loading) — a later reload never brings it back. */
  private readonly firstLoad = new FirstLoad();
  get pageLoading(): boolean {
    return this.firstLoad.pending(this.devicesLoading);
  }

  ngOnInit(): void {
    if (!this.host) {
      this.ctx.$scope.qcLabMonitoringDashboardComponent = this;
    }
    this.theme = this.host?.theme ?? new DashboardTheme(this.ctx, this.destroyRef, () => this.cd.detectChanges());
    // Load the Material Symbols Rounded variable font so all dashboard icons use
    // the rounded variant.
    injectCss("tb-ext-material-symbols-rounded", "https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200");
    this.alarmService = this.ctx.$injector.get(this.ctx.servicesMap.get("alarmService")) as AlarmService;
    // The profiles' icons coming in: the tables' rows and the device panel's header show them.
    this.icons = profileIconsOf(this.ctx);
    this.icons.changes.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.cd.detectChanges());
    this.tm = new TimeMachineState(this.ctx, this.destroyRef, { settingsPrefix: TIME_MACHINE_SETTINGS, changed: () => this.cd.detectChanges() });
    this.loadUserPreferences();

    this.subscribeAlarms();
    this.loadNames(); // the location codes' labels
    this.loadDevices(); // initial render
    this.subscribeDevices(); // live updates when temperatures / attributes change
    // The URL's dashboard state: the page (and the Devices page's list) named there shows — a reload stays on it — and every change
    // to it (the browser's Back / Forward, a pasted link) is followed.
    watchDashboardUrlState(this.ctx, this.destroyRef, (state) => this.applyUrlState(state));
    this.applyUrlState();
    this.host?.attach(this);
  }

  ngOnDestroy(): void {
    this.host?.attach(null);
    removeSubscriptions(this.ctx, this.alarmsSubscription, this.devicesSubscription);
    clearTimeout(this.devicesRefreshTimer);
    this.contentObserver?.disconnect();
    this.stopClock();
  }
  // Debounce the table refresh: coalesce a burst of telemetry into a single
  // re-query shortly after the last change, so values update near-instantly

  ngAfterViewInit(): void {
    // Pick the table layout from the content area's width (not the window):
    // the widget may be any size, and the filter sidebar takes space too.
    const el = this.contentEl?.nativeElement;
    if (el && typeof ResizeObserver !== "undefined") {
      this.contentObserver = new ResizeObserver(([entry]) => {
        const compact = entry.contentRect.width < this.compactBreakpoint;
        if (compact !== this.compact) {
          this.compact = compact;
          this.cd.detectChanges();
        }
      });
      this.contentObserver.observe(el);
    }
    this.root?.changes.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.onPhoneChange());
    this.cd.detectChanges();
  }

  /**
   * Called by ThingsBoard whenever subscription data changes. This dashboard
   * sources its own data via custom subscriptions (devices + alarms), so there
   * is no widget datasource to react to — just keep the view in sync.
   */
  onDataUpdated(): void {
    this.ctx.detectChanges();
  }

  /** Called by ThingsBoard when the widget is resized. Nothing to re-measure here. */
  onResize(): void {
    this.cd.detectChanges();
  }


  // -- nested in the Home dashboard: its pages are QC Lab's menu in Home's rail (its lists the Devices page's button group) --

  get railActive(): string {
    return this.page;
  }

  selectRailPage(id: string): void {
    this.selectPage(id);
    this.cd.detectChanges();
  }

  /** A rail page (or an older link's list id): a new entry in the URL. */
  selectPage(id: string): void {
    this.showPage(id);
    this.writeUrlState();
  }

  /** The Devices page's list (Temperature | Ambience), kept in the URL (rewriting the entry). */
  selectView(id: string): void {
    this.showView(id);
    this.writeUrlState(true);
  }

  /**
   * A page: the devices' tables (back on the list it last showed) or the Reports page (its window read once the devices are in). A
   * list's own id (an older link's "probe" / "ambience") opens the Devices page on it.
   */
  private showPage(id: string): void {
    if (id === "reports") {
      if (this.detailOpen) {
        this.closeDetail();
      }
      if (this.selectMode) {
        this.endManage();
      }
      this.page = "reports";
      this.ensureReport();
      return;
    }
    this.page = "devices";
    if (id === "probe" || id === "ambience") {
      this.showView(id);
    }
  }

  /** Switch the sidebar view (probes / ambience). Select mode and the open
   *  panel belong to the previous view's table, so both are closed. */
  private showView(id: string): void {
    if (id === this.view) {
      return;
    }
    this.view = id as DeviceKind;
    if (this.selectMode) {
      this.selectMode = false;
      this.bulkEditOpen = false;
      this.clearDeviceSelection();
    }
    if (this.detailOpen) {
      this.closeDetail();
    }
    this.applyDeviceFilters();
  }

  // -- the URL's dashboard state -----------------------------------------------------

  /**
   * Where the dashboard is, into the URL (`writeDashboardUrlState`; nested, with its app's id): the Reports page, or the Devices
   * page's list — nothing for its first, Temperature. `replace` rewrites the current history entry (a list) instead of adding one (a
   * page).
   */
  private writeUrlState(replace = false): void {
    const params = this.page === "reports" ? { page: "reports" } : this.view === "probe" ? {} : { page: "devices", view: this.view };
    writeDashboardUrlState(this.ctx, nestedUrlParams(this.host, params), replace);
  }

  /** Follow the URL's state (at start, and as it changes): its page and the Devices page's list show — none named, Temperature. */
  private applyUrlState(state?: string | null): void {
    const params = readDashboardUrlState(this.ctx, state);
    if (!ownsUrlState(this.host, params)) {
      return; // nested, and the URL is another app's (or Home's own page)
    }
    const page: QcPage = params["page"] === "reports" ? "reports" : "devices";
    const view: DeviceKind = params["view"] === "ambience" ? "ambience" : "probe";
    if (page === "devices" && view !== this.view) {
      this.showView(view);
    }
    if (page !== this.page) {
      this.showPage(page);
    }
    if (state !== undefined) {
      this.cd.detectChanges(); // a change after start (at start, the first render follows)
    }
  }

  onSitesChange(ids: string[]): void {
    this.selectedSites = ids;
    this.applyDeviceFilters();
  }

  /** The sidebar's search: the table's (it searches itself), the Time Machine's cards' here. */
  onSearchChange(terms: string[]): void {
    this.deviceSearch = terms;
    this.applyShownRows();
  }

  // -- the Time Machine view ---------------------------------------------------------

  /** The "Time Machine" switch on: its cards in the table's place — the table's Manage ends (the cards have none). */
  onTimeMachineSwitched(on: boolean): void {
    if (on && this.selectMode) {
      this.endManage();
    }
  }

  /** Laid out for a phone (the root's `tb-phone`): the list alone. */
  get phone(): boolean {
    return !!this.root?.phone;
  }

  /** The Time Machine view in the list's place: its switch on — never on a phone, too narrow for a timeline beside cards (its switch
   *  not shown there; the view's reads stop with it). */
  get timeMachineShown(): boolean {
    return this.tm.on && !this.phone;
  }

  /** A phone or not: on a phone the list alone (the search and the filters kept: the sidebar's sheet has them); back on a wider
   *  screen, the switch's view again. */
  private onPhoneChange(): void {
    this.cd.detectChanges();
  }

  /** A card's site: its label, the code in brackets ("Richmond Lab (4R20)") — the code alone without a label. */
  siteText(row: DeviceRow): string {
    return row.siteLabel ? `${row.siteLabel} (${row.siteCode})` : row.siteCode || "—";
  }

  /**
   * The shown devices (the view's, located, searched — as the table's search: every term in the name, the IMEI or the site), and
   * the Time Machine's cards for them.
   */
  private applyShownRows(): void {
    const terms = this.deviceSearch.map((t) => t.trim().toLowerCase()).filter(Boolean);
    this.shownRows = terms.length
      ? this.tableRows.filter((r) => {
          const text = `${r.name} ${r.label} ${r.site}`.toLowerCase();
          return terms.every((t) => text.includes(t));
        })
      : this.tableRows;
    this.tmDevices = this.shownRows.map((row) => this.timeMachineDevice(row));
  }

  /**
   * A device's Time Machine card: its name, its IMEI and its site; its kind's charts with its own alarm thresholds (the view keeps
   * them while they hold); reporting while its readings or every uplink's `rssi` come in (a probe with no channel set still reports),
   * every `reportInterval` minutes.
   */
  private timeMachineDevice(row: DeviceRow): TimeMachineDevice {
    const ambience = row.kind === "ambience";
    const sections = ambience ? this.ambienceCharts : this.metricsCharts;
    const thresholds = ambience
      ? this.ambienceAlarmKeys.map((key, i) => this.buildThresholds(row.objectValues, [key], sections[i]?.unit ?? ""))
      : [this.buildThresholds(row.objectValues, ["temperatureChn1AlarmConfig", "temperatureChn2AlarmConfig"], this.tempUnit(row.deviceSettings))];
    const minutes = parseNumber(row.deviceSettings["reportInterval"]);
    return {
      id: row.deviceId,
      name: row.name,
      detail: row.label,
      site: row.siteCode ? this.siteText(row) : "",
      charts: sections.map((section, i) => ({ ...section, thresholds: thresholds[i] ?? [] })),
      readingKeys: [...(ambience ? ["temperature", "humidity"] : ["temperatureChn1", "temperatureChn2"]), "battery", "rssi"],
      reportInterval: minutes ? minutes * MINUTE : undefined,
    };
  }

  /** A card's name: its device's panel, as a table row's click. */
  openTimeMachineDevice(device: TimeMachineDevice): void {
    const row = this.shownRows.find((r) => r.deviceId === device.id);
    if (row) {
      this.onDeviceRowClick(row);
    }
  }

  /** The search or a location filter narrows the table ("Clear filters" enables). */
  get hasFilters(): boolean {
    return !!(this.deviceSearchTerms.length || this.deviceSearchText || this.selectedSites.length);
  }

  /** "Clear filters": the search and the location filters. */
  clearFilters(): void {
    this.deviceSearchTerms = [];
    this.deviceSearchText = "";
    this.deviceSearch = [];
    this.selectedSites = [];
    this.applyDeviceFilters();
  }

  /** The Site filter on a device: at a site picked (none: any). */
  private locationPasses(r: DeviceRow): boolean {
    return !this.selectedSites.length || this.selectedSites.includes(r.siteId);
  }

  /**
   * Rebuild the Site filter and the filtered rows from the loaded devices:
   * the shared site tree (`siteFilterTree` — "All sites" › each market › its
   * sites, the Gateways page's) of the sites the dashboard's devices are at,
   * each under the market its devices name (their stored codes — no relation
   * walk), a site by its label and code; each counted by the active view's
   * kind of device at it, a market by its sites'.
   */
  private applyDeviceFilters(): void {
    const kindRows = this.devicesRows.filter((d) => d.kind === this.view);
    const siteMarket = new Map<string, string>();
    for (const r of this.devicesRows) {
      if (r.siteId && !siteMarket.get(r.siteId)) {
        siteMarket.set(r.siteId, r.marketId);
      }
    }
    const sites = [...siteMarket].map(([code, marketId]) => ({ id: code, name: code, label: this.siteByCode.get(code)?.name ?? code, marketId }));
    const markets = [...new Set([...siteMarket.values()].filter(Boolean))].map((code) => ({ id: code, name: code }));
    const atSite = new Map<string, number>();
    kindRows.forEach((r) => r.siteId && atSite.set(r.siteId, (atSite.get(r.siteId) ?? 0) + 1));
    this.siteFilterOptions = siteFilterTree(sites, markets, (code) => atSite.get(code) ?? 0);
    // A pick of a site no longer listed drops out (the same array while none does).
    const listed = siteTreeIds(this.siteFilterOptions);
    if (!this.devicesLoading && this.selectedSites.some((id) => !listed.has(id))) {
      this.selectedSites = this.selectedSites.filter((id) => listed.has(id));
    }
    this.scopedRows = this.devicesRows.filter((r) => this.locationPasses(r));
    this.tableRows = this.scopedRows.filter((r) => r.kind === this.view);
    // Keep the bulk selection to what's still listed.
    const shown = new Set(this.tableRows.map((r) => r.deviceId));
    this.selectedDeviceIds = this.selectedDeviceIds.filter((id) => shown.has(id));
    // The open panel's device was filtered out — close it.
    if (this.detailOpen && this.selectedDevice && !shown.has(this.selectedDevice.deviceId)) {
      this.closeDetail();
    }
    this.applyAlarmFilter();
    this.applyShownRows();
  }

  /** A device's location, from its stored `site` / `market` attributes (codes): the site by its code, its label for the bubble. */
  private locate(siteCode: string, marketCode: string): Pick<DeviceRow, "siteId" | "site" | "siteCode" | "siteLabel" | "marketId"> {
    const site = siteCode ? this.siteByCode.get(siteCode) : undefined;
    const name = site?.name ?? siteCode;
    return { siteId: siteCode, site: name, siteCode, siteLabel: name !== siteCode ? name : "", marketId: marketCode };
  }

  /** The Organization's markets and sites, once — the rows' location codes then show by their labels. */
  private loadNames(): void {
    loadOrganizationNames(this.ctx)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((names) => {
        this.siteByCode = new Map(names.sites.map((x) => [x.code, x]));
        this.devicesRows = this.devicesRows.map((r) => ({ ...r, ...this.locate(r.siteCode, r.marketId) }));
        this.applyDeviceFilters();
        this.cd.detectChanges();
      });
  }

  toggleTheme(): void {
    this.theme.toggle();
  }

  // -- reports ------------------------------------------------------------------------

  /** The Reports page's window (its sidebar picker: 1D … 1M, or a range from its calendar). */
  reportTimeframe = "1W";
  reportRange: TbDateRange | null = null;
  readonly reportTimeframeOptions = TB_WINDOW_TIMEFRAME_OPTIONS;
  /** The Reports page's own Types and Sites filters (none checked = all): the report again from what's read. */
  reportKinds: DeviceKind[] = [];
  reportKindOptions: FilterListOption[] = [];
  reportSites: string[] = [];
  reportSiteOptions: FilterListOption[] = [];
  /** The report — built from {@link reportReadings} for the devices in its filters. */
  report: QcReport = buildQcReport({ start: Date.now(), end: Date.now(), toNow: true, days: 7, channels: [], loading: true });
  /** The window's readings (and the window before's) are being read: the page's wireframes. */
  reportLoading = true;
  /** The window read last (its start, days and end): a change reads again. */
  private reportKey = "";
  /** Each device's raw readings over the window and the window before, by key. */
  private reportReadings = new Map<string, { cur: Record<string, TrendPoint[]>; prev: Record<string, TrendPoint[]> }>();
  private reportReadAt: number | undefined;

  /** The Reports page's window, in days (a calendar range's span, else the picker's). */
  get reportDays(): number {
    if (this.reportTimeframe === TB_CUSTOM_TIMEFRAME && this.reportRange) {
      return Math.max(1, Math.round((this.reportRange.end - this.reportRange.start) / (24 * 3600 * 1000)));
    }
    const tf = TB_WINDOW_TIMEFRAMES.find((t) => t.id === this.reportTimeframe) ?? TB_WINDOW_TIMEFRAMES[2];
    return Math.round(tf.ms / (24 * 3600 * 1000));
  }

  /** The window: its first day's local midnight, how many days (a preset's — today and the days before it — or a range's), its end. */
  private get reportWindow(): { start: number; end: number; days: number } {
    const days = this.reportDays;
    const custom = this.reportTimeframe === TB_CUSTOM_TIMEFRAME ? this.reportRange : null;
    const first = new Date(custom ? custom.start : Date.now());
    first.setHours(0, 0, 0, 0);
    if (!custom) {
      first.setDate(first.getDate() - (days - 1));
    }
    return { start: first.getTime(), end: custom ? custom.end : Date.now(), days };
  }

  private get reportWindowKey(): string {
    const w = this.reportWindow;
    return `${w.start}|${w.days}|${this.reportTimeframe === TB_CUSTOM_TIMEFRAME ? w.end : "now"}`;
  }

  onReportTimeframe(id: string): void {
    this.reportTimeframe = id;
    this.reportRange = null;
    this.loadReport();
  }

  /** The picker's calendar: the dashboard's (`tb-date-picker-host`) under it — its click again closes it. */
  openReportRange(anchor: HTMLElement): void {
    findDatePickerHost(anchor)?.toggle(this, {
      anchor,
      mode: "range",
      range: this.reportRange,
      future: false,
      min: null,
      applied: (range) => {
        this.reportTimeframe = TB_CUSTOM_TIMEFRAME;
        this.reportRange = range;
        this.loadReport();
        this.cd.detectChanges();
      },
    });
  }

  onReportKindsChange(ids: string[]): void {
    this.reportKinds = ids as DeviceKind[];
    this.buildReport();
  }

  onReportSitesChange(ids: string[]): void {
    this.reportSites = ids;
    this.buildReport();
  }

  /** The Reports page shown: its window read, unless it's the one read already (and once the devices are in). */
  private ensureReport(): void {
    if (this.page === "reports" && this.devicesLoaded && this.reportWindowKey !== this.reportKey) {
      this.loadReport();
    }
  }

  /**
   * Read the Reports page's window: each device's raw readings — a probe's two channels, an ambience sensor's temperature and
   * humidity — over it and over the window before (the same days, to the same time), six devices at a time; the report built once
   * they're all in.
   */
  private loadReport(): void {
    if (!this.devicesLoaded) {
      return; // read once the devices are in (ensureReport)
    }
    const w = this.reportWindow;
    const key = this.reportWindowKey;
    this.reportKey = key;
    this.reportLoading = true;
    this.reportReadings = new Map();
    this.buildReport();
    const back = (ts: number) => {
      const d = new Date(ts);
      d.setDate(d.getDate() - Math.max(1, w.days));
      return d.getTime();
    };
    const end = Math.min(w.end, Date.now());
    from(this.devicesRows)
      .pipe(
        mergeMap(
          (r) => {
            const keys = r.kind === "ambience" ? ["temperature", "humidity"] : ["temperatureChn1", "temperatureChn2"];
            return forkJoin([this.readRaw(r.deviceId, keys, w.start, end), this.readRaw(r.deviceId, keys, back(w.start), back(end))]).pipe(
              map(([cur, prev]) => [r.deviceId, { cur, prev }] as const)
            );
          },
          6
        ),
        toArray(),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((list) => {
        if (this.reportKey !== key) {
          return; // another window was asked for meanwhile
        }
        this.reportReadings = new Map(list);
        this.reportReadAt = Date.now();
        this.reportLoading = false;
        this.buildReport();
        this.cd.detectChanges();
      });
  }

  /** A device's raw readings of `keys` over [start, end], by key, oldest first (none where the read fails). */
  private readRaw(deviceId: string, keys: string[], start: number, end: number): Observable<Record<string, TrendPoint[]>> {
    const id = { entityType: EntityType.DEVICE, id: deviceId };
    return this.ctx.attributeService.getEntityTimeseries(id, keys, start, end, 20000, AggregationType.NONE, undefined, undefined, undefined, QUIET_REQUEST).pipe(
      map((data: any) =>
        Object.fromEntries(
          keys.map((k) => [
            k,
            ((data?.[k] ?? []) as { ts: number; value: unknown }[])
              .map((pt) => ({ ts: Number(pt.ts), value: Number(pt.value) }))
              .filter((pt) => Number.isFinite(pt.ts) && Number.isFinite(pt.value) && pt.value === pt.value)
              .sort((a, b) => a.ts - b.ts),
          ])
        )
      ),
      catchError(() => of(Object.fromEntries(keys.map((k) => [k, [] as TrendPoint[]]))))
    );
  }

  /** The report from what's read for the window, for the devices in its Types and Sites filters (none checked: every device). */
  private buildReport(): void {
    const kinds = new Set(this.reportKinds);
    const sites = new Set(this.reportSites);
    const byKind = (r: DeviceRow) => !kinds.size || kinds.has(r.kind);
    const bySite = (r: DeviceRow) => !sites.size || sites.has(r.siteId);
    // The Types filter, each counted under the Sites filter; the Sites tree, each site counted under the Types filter.
    const forKinds = this.devicesRows.filter(bySite);
    this.reportKindOptions = [
      { id: "probe", label: "Temperature probes", count: forKinds.filter((r) => r.kind === "probe").length },
      { id: "ambience", label: "Ambience sensors", count: forKinds.filter((r) => r.kind === "ambience").length },
    ];
    const siteMarket = new Map<string, string>();
    for (const r of this.devicesRows) {
      if (r.siteId && !siteMarket.get(r.siteId)) {
        siteMarket.set(r.siteId, r.marketId);
      }
    }
    const treeSites = [...siteMarket].map(([code, marketId]) => ({ id: code, name: code, label: this.siteByCode.get(code)?.name ?? code, marketId }));
    const markets = [...new Set([...siteMarket.values()].filter(Boolean))].map((code) => ({ id: code, name: code }));
    const atSite = new Map<string, number>();
    this.devicesRows.filter(byKind).forEach((r) => r.siteId && atSite.set(r.siteId, (atSite.get(r.siteId) ?? 0) + 1));
    this.reportSiteOptions = siteFilterTree(treeSites, markets, (code) => atSite.get(code) ?? 0);
    const listed = siteTreeIds(this.reportSiteOptions);
    if (this.devicesLoaded && this.reportSites.some((id) => !listed.has(id))) {
      this.reportSites = this.reportSites.filter((id) => listed.has(id));
    }
    const w = this.reportWindow;
    this.report = buildQcReport({
      start: w.start,
      end: w.end,
      toNow: this.reportTimeframe !== TB_CUSTOM_TIMEFRAME,
      days: w.days,
      channels: this.devicesRows.filter((r) => byKind(r) && bySite(r)).flatMap((r) => this.reportChannelsOf(r)),
      loading: this.reportLoading,
      readAt: this.reportReadAt,
    });
  }

  /**
   * A device's channels in the report: a probe's two (but a contact switch's, and one set to "None" that sent no readings — a row
   * without the attribute says "None"), each its threshold alarm's range; an ambience sensor's temperature and humidity, each its
   * own alarm's. A device showing °F has its thresholds in °F.
   */
  private reportChannelsOf(r: DeviceRow): ReportChannel[] {
    const read = this.reportReadings.get(r.deviceId);
    const fahrenheit = String(r.deviceSettings[this.tempUnitFrom.key] ?? "").toLowerCase() === "fahrenheit";
    const site = r.siteCode ? (r.siteLabel ? `${r.siteLabel} (${r.siteCode})` : r.siteCode) : "";
    const channel = (key: string, label: string, quantity: "temperature" | "humidity", configKey: string): ReportChannel => ({
      id: `${r.deviceId}|${key}`,
      deviceId: r.deviceId,
      device: r.name,
      channel: label,
      site,
      siteId: r.siteId,
      ambience: r.kind === "ambience",
      quantity,
      unit: quantity === "humidity" ? "%" : "°C",
      range: channelRange(r.objectValues[configKey], quantity === "temperature" && fahrenheit),
      points: read?.cur[key] ?? [],
      previousPoints: read?.prev[key] ?? [],
    });
    if (r.kind === "ambience") {
      return [channel("temperature", "Temperature", "temperature", "temperatureAlarmConfig"), channel("humidity", "Humidity", "humidity", "humidityAlarmConfig")];
    }
    return ([1, 2] as const)
      .filter((n) => {
        const set = String(n === 1 ? r.sensorChannel1 : r.sensorChannel2);
        return set !== "contactSwitch" && (set !== "none" || !!read?.cur[`temperatureChn${n}`]?.length);
      })
      .map((n) => channel(`temperatureChn${n}`, `Channel ${n}`, "temperature", `temperatureChn${n}AlarmConfig`));
  }

  /** Clear an alarm from either alarm list (the shared tb-alarm-list emits it). */
  clearAlarm(alarm: { id: string; cleared: boolean }): void {
    clearDashboardAlarm(this.alarmService, this.destroyRef, alarm);
  }

  /** Load every device of type Milesight-TS302 into the Devices table. */
  /** Reload the Devices table (also called after a device's settings are saved). */
  loadDevices(): void {
    this.devicesLoading = true;
    const deviceQuery: EntityDataQuery = {
      entityFilter: this.deviceFilter,
      pageLink: byNamePageLink(),
      entityFields: [
        { type: EntityKeyType.ENTITY_FIELD, key: "name" },
        { type: EntityKeyType.ENTITY_FIELD, key: "label" },
        // Device type/profile — picks the hardware version's settings wiring.
        { type: EntityKeyType.ENTITY_FIELD, key: "type" },
        // additionalInfo (JSON) carries the device description (Settings → Note).
        { type: EntityKeyType.ENTITY_FIELD, key: "additionalInfo" },
      ],
      latestValues: [
        // Latest channel temperatures shown in the table.
        { type: EntityKeyType.TIME_SERIES, key: "temperatureChn1" },
        { type: EntityKeyType.TIME_SERIES, key: "temperatureChn2" },
        // Ambience sensors' readings.
        { type: EntityKeyType.TIME_SERIES, key: "temperature" },
        { type: EntityKeyType.TIME_SERIES, key: "humidity" },
        // Ambience alarm flags (calculated fields on the ambience profiles).
        { type: EntityKeyType.TIME_SERIES, key: "temperatureAlarm" },
        { type: EntityKeyType.TIME_SERIES, key: "humidityAlarm" },
        // Latest battery level shown in the detail panel.
        { type: EntityKeyType.TIME_SERIES, key: "battery" },
        // Settings → Sensor channels (server attributes), pre-fetched here.
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: "sensorChannel1" },
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: "sensorChannel2" },
        // Settings sync state (server attr derived by the calculated field).
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: "syncState" },
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: "downlinkQueue" },
        // Ambience sensors' alarm configs (SERVER_SCOPE JSON objects).
        ...this.ambienceAlarmKeys.map((key) => ({ type: EntityKeyType.SERVER_ATTRIBUTE, key })),
        // Where it is: the codes the backend keeps (site-locations.ts) — no relation walk here.
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: LOCATION_KEYS.site },
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: LOCATION_KEYS.market },
        // Settings → Device settings + object attributes (shared), pre-fetched here.
        ...this.deviceSettingControls.map((c) => ({ type: EntityKeyType.SHARED_ATTRIBUTE, key: c.key })),
        ...this.objectAttributeKeys.map((key) => ({ type: EntityKeyType.SHARED_ATTRIBUTE, key })),
      ],
    };

    const cfg = QUIET_REQUEST;
    this.ctx.entityService
      .findEntityDataByQuery(deviceQuery, cfg)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (devicesPage) => {
          this.devicesRows = devicesPage.data
            .map((d) => {
              const fields = d.latest?.[EntityKeyType.ENTITY_FIELD] ?? {};
              const ts = d.latest?.[EntityKeyType.TIME_SERIES] ?? {};
              const attrs = d.latest?.[EntityKeyType.SERVER_ATTRIBUTE] ?? {};
              const shared = d.latest?.[EntityKeyType.SHARED_ATTRIBUTE] ?? {};
              const deviceId = d.entityId.id;
              const name = fields["name"]?.value ?? "";
              const label = fields["label"]?.value ?? "";
              const batt = ts["battery"];
              const type = fields["type"]?.value ?? "";
              return {
                deviceId,
                name: label || name || "Unknown device",
                label: name,
                type,
                kind: (this.ambienceTypes.includes(type) ? "ambience" : "probe") as DeviceKind,
                ...this.locate(String(attrs[LOCATION_KEYS.site]?.value ?? ""), String(attrs[LOCATION_KEYS.market]?.value ?? "")),
                temperature: this.formatTemp(ts["temperature"]?.value),
                humidity: this.formatHumidity(ts["humidity"]?.value),
                // Booleans arrive stringified ("true" / "false").
                temperatureAlarm: String(ts["temperatureAlarm"]?.value) === "true",
                humidityAlarm: String(ts["humidityAlarm"]?.value) === "true",
                chn1Value: parseNumber(ts["temperatureChn1"]?.value),
                chn2Value: parseNumber(ts["temperatureChn2"]?.value),
                temperatureValue: parseNumber(ts["temperature"]?.value),
                humidityValue: parseNumber(ts["humidity"]?.value),
                readingValue: parseNumber(
                  this.ambienceTypes.includes(type) ? ts["temperature"]?.value : ts["temperatureChn1"]?.value,
                ),
                alarmCount: this.deviceAlarmCount.get(deviceId) ?? 0,
                chn1Alarm: this.deviceChannelAlarms.get(deviceId)?.chn1 ?? false,
                chn2Alarm: this.deviceChannelAlarms.get(deviceId)?.chn2 ?? false,
                tempChn1: this.formatTemp(ts["temperatureChn1"]?.value),
                tempChn2: this.formatTemp(ts["temperatureChn2"]?.value),
                battery: this.parseBattery(batt?.value),
                batteryTs: batt?.ts ?? null,
                deviceName: name,
                deviceLabel: label,
                description: parseDescription(fields["additionalInfo"]?.value),
                sensorChannel1: attrs["sensorChannel1"]?.value ?? "none",
                sensorChannel2: attrs["sensorChannel2"]?.value ?? "none",
                // Absent syncState = nothing ever queued -> treat as synced (true).
                // Value arrives stringified ("false"/"true"); only "false" = queued.
                syncState: String(attrs["syncState"]?.value ?? "true") !== "false",
                downlinkQueue: Number(attrs["downlinkQueue"]?.value ?? 0),
                deviceSettings: this.deviceSettingControls.reduce((acc, c) => {
                  acc[c.key] = shared[c.key]?.value ?? "";
                  return acc;
                }, {} as Record<string, string>),
                objectValues: {
                  ...this.objectAttributeKeys.reduce((acc, key) => {
                    acc[key] = shared[key]?.value ?? null;
                    return acc;
                  }, {} as Record<string, unknown>),
                  // Ambience alarm configs live in SERVER_SCOPE.
                  ...this.ambienceAlarmKeys.reduce((acc, key) => {
                    acc[key] = attrs[key]?.value ?? null;
                    return acc;
                  }, {} as Record<string, unknown>),
                },
              };
            })
            .sort((a, b) => a.name.localeCompare(b.name));
          this.devicesLoading = false;
          this.devicesLoaded = true;
          this.refreshSelectedDevice();
          // Rebuild the filters + visible rows; that also re-scopes the alarm panel
          // (devices may arrive after the alarms).
          this.applyDeviceFilters();
          this.ensureReport(); // the Reports page shown first: its window read once the devices are in
          this.cd.detectChanges();
        },
        error: () => {
          this.devicesLoading = false;
          this.cd.detectChanges();
        },
      });
  }

  // -- alarm popup ------------------------------------------------------------

  /** Live "x ago" string for a past timestamp (ms): seconds → minutes → hours →
   *  days. Re-evaluated every second by the panel clock while open. */
  /** "5m ago" — the shared wording (the battery card's "Updated …" line). */
  readonly relativeTime = relativeTime;

  // Ambience sensors' threshold alarms: SERVER_SCOPE JSON objects
  // `temperatureAlarmConfig` / `humidityAlarmConfig` = {enable, condition,
  // thresholdMin, thresholdMax}, evaluated in ThingsBoard (no downlink).
  /** The ambience alarm-config attribute keys (SERVER_SCOPE). */
  private readonly ambienceAlarmKeys = ["temperatureAlarmConfig", "humidityAlarmConfig"];
  /** Settings-tab cards for an ambience sensor. */
  get ambienceObjectCards(): DeviceSettingObjectCard[] {
    return this.ambienceCards;
  }
  private readonly ambienceCards: DeviceSettingObjectCard[] = [
    {
      title: "Threshold alarm",
      info: "Triggers an alarm when the reading crosses the configured min/max thresholds.",
      flatFields: true,
      groups: [
        {
          objects: [thresholdAlarmObject("temperatureAlarmConfig", "Temperature", { min: -40, max: 80, unit: "°C" }, "server")],
        },
        {
          objects: [thresholdAlarmObject("humidityAlarmConfig", "Humidity", { min: 0, max: 100, unit: "%" }, "server")],
        },
      ],
    },
  ];

  /** Alarm reporting card per hardware version (single-device panel). */
  private reportingCard(version: "v1" | "v2"): DeviceSettingObjectCard {
    const object: DeviceSettingObject =
      version === "v2"
        ? { key: "alarmConfig", label: "", fields: this.alarmReportingFieldsV2 }
        : {
            key: "temperatureChn1AlarmConfig",
            label: "",
            mirrorKeys: ["temperatureChn2AlarmConfig"],
            fields: this.alarmReportingFields,
          };
    return { title: "Alarm reporting", flatFields: true, groups: [{ objects: [object] }] };
  }

  private cardsWithReporting(reporting: DeviceSettingObjectCard): DeviceSettingObjectCard[] {
    return [this.calibrationCard, reporting, this.thresholdCard, this.mutationCard];
  }

  // -- data -------------------------------------------------------------------

  /** Keep the settings card's attribute-values maps in sync with the selection. */
  private syncSettingsInputs(): void {
    const d = this.selectedDevice;
    this.sensorChannelValues = d ? { sensorChannel1: d.sensorChannel1, sensorChannel2: d.sensorChannel2 } : {};
    this.deviceSettingsValues = d ? { ...d.deviceSettings } : {};
    this.objectValues = d ? { ...d.objectValues } : {};
    // Swap the Alarm reporting card to match the selected device's hardware
    // version (only rebuild on an actual change, to avoid form re-populates).
    const version = d?.type === this.v2Type ? "v2" : "v1";
    const wanted = this.cardsWithReporting(this.reportingCard(version));
    if (this.detailObjectCards[1]?.groups[0]?.objects[0]?.key !== wanted[1].groups[0].objects[0].key) {
      this.detailObjectCards = wanted;
    }
    this.syncChartThresholds();
  }

  /**
   * Redraw the temperature chart's threshold lines from the selected device's
   * "Threshold alarm" configs. Only rebuilds the section when the lines actually
   * change, so live attribute updates don't force a chart re-render.
   */
  private syncChartThresholds(): void {
    if (this.selectedDevice?.kind === "ambience") {
      // Temperature chart ← temperatureAlarmConfig, humidity chart ← humidityAlarmConfig.
      const next = this.ambienceCharts.map((section, i) => {
        const thresholds = this.buildThresholds(this.objectValues, [this.ambienceAlarmKeys[i]], section.unit ?? "");
        return JSON.stringify(section.thresholds ?? []) === JSON.stringify(thresholds) ? section : { ...section, thresholds };
      });
      if (next.some((section, i) => section !== this.ambienceCharts[i])) {
        this.ambienceCharts = next;
      }
      return;
    }
    const thresholds = this.buildThresholds(this.objectValues, ["temperatureChn1AlarmConfig", "temperatureChn2AlarmConfig"], this.tempUnit());
    const section = this.metricsCharts[0];
    if (JSON.stringify(section.thresholds ?? []) === JSON.stringify(thresholds)) {
      return;
    }
    this.metricsCharts = [{ ...section, thresholds }, ...this.metricsCharts.slice(1)];
  }

  /** A chart's threshold lines: the shared threshold alarm's, from each of `keys`' configs (of a device's `attrs`). */
  private buildThresholds(attrs: Record<string, unknown>, keys: string[], unit: string): LineChartThreshold[] {
    return thresholdAlarmLines(keys.map((key) => attrs[key]), unit);
  }

  /** Display unit (°C/°F) from a device's `temperatureUnitDisplay` — the selected device's unless given. */
  private tempUnit(settings: Record<string, unknown> = this.deviceSettingsValues): string {
    const raw = String(settings[this.tempUnitFrom.key] ?? "").toLowerCase();
    return (this.tempUnitFrom.map as Record<string, string>)[raw] ?? "";
  }

  /** Tick once a second so the "Updated Xs ago" label counts up live. */
  private startClock(): void {
    if (this.clockTimer) {
      return;
    }
    this.clockTimer = setInterval(() => this.cd.detectChanges(), 1000);
  }

  private stopClock(): void {
    clearInterval(this.clockTimer);
    this.clockTimer = undefined;
  }

  /** Rebuild the Alarms-tab list: the selected device's alarms (the list filters by severity itself). */
  private applyDetailAlarms(): void {
    const id = this.selectedDevice?.deviceId;
    this.detailAlarms = id ? this.alarmsRows.filter((a) => a.originatorId === id) : [];
  }

  private loadUserPreferences(): void {
    readUserSettings(this.ctx, this.destroyRef, (settings) => {
      this.theme.restore(settings);
      // The Time Machine's "Large charts", "Alarms on top" and window as the user left them (unless picked meanwhile) — its switch
      // is never saved: off on every load.
      this.tm.restore(settings);
      this.cd.detectChanges();
    });
  }

  /**
   * The alarms panel's list: every alarm of a device the Devices table lists,
   * titled with the device's display name (label || name) over its site —
   * tb-alarm-list groups them per device and handles the severity filter.
   */
  private applyAlarmFilter(): void {
    const devices = new Map(this.devicesRows.map((d) => [d.deviceId, d]));
    this.panelAlarms = this.scopedAlarms.map((a) => {
      const d = devices.get(a.originatorId);
      return { ...a, originatorName: d?.name || a.originatorName || "Unknown device" };
    });
  }

  /**
   * Live "latest" subscription over the device set's channel temperatures and
   * attributes. Whenever a value changes, reload the table so it always
   * reflects the latest values without a page refresh. The initial emission is
   * skipped — the explicit loadDevices() in ngOnInit covers the first render.
   */
  private subscribeDevices(): void {
    subscribeLatestChanges(
      this.ctx,
      this.destroyRef,
      {
        entityFilter: this.deviceFilter,
        timeseries: ["temperatureChn1", "temperatureChn2", "temperature", "humidity", "temperatureAlarm", "humidityAlarm", "battery"],
        attributes: [
          "sensorChannel1",
          "sensorChannel2",
          "syncState",
          "downlinkQueue",
          // A device moved (its stored location) — the filters and the Site column follow.
          LOCATION_KEYS.site,
          LOCATION_KEYS.market,
          ...this.ambienceAlarmKeys,
          // SHARED_SCOPE device settings + object attributes — refresh on change.
          ...this.deviceSettingControls.map((c) => c.key),
          ...this.objectAttributeKeys,
        ],
      },
      () => {
        // Debounce: reload shortly after the last change so a burst of telemetry
        // coalesces into one re-query, but values still update near-instantly.
        clearTimeout(this.devicesRefreshTimer);
        this.devicesRefreshTimer = setTimeout(() => this.loadDevices(), 300);
      },
      (subscription) => (this.devicesSubscription = subscription)
    );
  }

  /**
   * Live alarm subscription over the device set. Alarm subscriptions do not
   * auto-start, so subscribeForAlarms() must be called explicitly.
   */
  private subscribeAlarms(): void {
    this.alarmsLoading = true;
    subscribeActiveAlarms(this.ctx, this.destroyRef, {
      entityFilter: this.deviceFilter,
      onSubscribed: (subscription) => (this.alarmsSubscription = subscription),
      onUpdated: (alarms) => this.onAlarmsSubscriptionUpdated(alarms),
    });
  }

  private onAlarmsSubscriptionUpdated(alarms: DashboardAlarm[]): void {
    this.alarmsRows = alarms;
    this.alarmsLoading = false;
    this.applyAlarmCounts(); // refresh the per-device active-alarm tallies
    this.applyAlarmFilter(); // refresh the alarms panel's list
    this.applyDetailAlarms(); // refresh the detail panel's Alarms-tab list
    this.cd.detectChanges();
  }

  /** Recompute the active-alarm count per device and inject it into the device rows. */
  private applyAlarmCounts(): void {
    const counts = new Map<string, number>();
    const chan = new Map<string, { chn1: boolean; chn2: boolean }>();
    for (const a of this.alarmsRows) {
      if (!a.originatorId) {
        continue;
      }
      counts.set(a.originatorId, (counts.get(a.originatorId) ?? 0) + 1);
      // "Channel 1/2 Temperature[ Alarm]" → flag that channel for this device.
      if (a.type.includes("Temperature")) {
        const flags = chan.get(a.originatorId) ?? { chn1: false, chn2: false };
        if (a.type.includes("Channel 1")) {
          flags.chn1 = true;
        }
        if (a.type.includes("Channel 2")) {
          flags.chn2 = true;
        }
        chan.set(a.originatorId, flags);
      }
    }
    this.deviceAlarmCount = counts;
    this.deviceChannelAlarms = chan;
    this.devicesRows = this.devicesRows.map((r) => ({
      ...r,
      alarmCount: counts.get(r.deviceId) ?? 0,
      chn1Alarm: chan.get(r.deviceId)?.chn1 ?? false,
      chn2Alarm: chan.get(r.deviceId)?.chn2 ?? false,
    }));
    // Re-point the filtered lists at the refreshed rows (same membership).
    const fresh = new Map(this.devicesRows.map((r) => [r.deviceId, r]));
    this.scopedRows = this.scopedRows.map((v) => fresh.get(v.deviceId) ?? v);
    this.tableRows = this.tableRows.map((v) => fresh.get(v.deviceId) ?? v);
    this.applyShownRows();
    this.refreshSelectedDevice();
  }

  /** Re-point the detail panel at the refreshed row object so it shows live values. */
  private refreshSelectedDevice(): void {
    if (this.selectedDevice) {
      const updated = this.devicesRows.find((r) => r.deviceId === this.selectedDevice!.deviceId);
      if (updated) {
        this.selectedDevice = updated;
        this.syncSettingsInputs();
      }
    }
  }

  // -- severity helpers (shared with the alarm cell template) -----------------

  /** Format a raw temperature value to one decimal with the °C unit; "—" when not numeric. */
  private formatTemp(raw: any): string {
    if (raw === "" || raw == null) {
      return "—";
    }
    const n = Number(raw);
    return isFinite(n) ? `${n.toFixed(1)} °C` : "—";
  }

  /** Format a raw humidity value to a whole percent ("54 %"); "—" when not numeric. */
  private formatHumidity(raw: any): string {
    if (raw === "" || raw == null) {
      return "—";
    }
    const n = Number(raw);
    return isFinite(n) ? `${Math.round(n)} %` : "—";
  }

  /** Parse a raw battery value to a rounded percentage (0–100), or null. */
  private parseBattery(raw: any): number | null {
    if (raw === "" || raw == null) {
      return null;
    }
    const n = Number(raw);
    if (!isFinite(n)) {
      return null;
    }
    return Math.max(0, Math.min(100, Math.round(n)));
  }
}
