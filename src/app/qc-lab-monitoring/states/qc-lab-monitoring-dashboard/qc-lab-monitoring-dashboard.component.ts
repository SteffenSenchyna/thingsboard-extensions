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

import { AfterViewInit, ChangeDetectorRef, Component, DestroyRef, ElementRef, HostListener, Input, OnDestroy, OnInit, ViewChild } from "@angular/core";
import { CommonModule } from "@angular/common";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { WidgetSubscriptionOptions } from "@core/public-api";
import { SharedModule } from "@shared/public-api";
import {
  AlarmSearchStatus,
  AliasFilterType,
  AttributeScope,
  DataKeyType,
  Datasource,
  DatasourceType,
  Direction,
  EntityDataQuery,
  EntityFilter,
  EntityKeyType,
  EntityType,
  RealtimeWindowType,
  TimewindowType,
  widgetType,
} from "@shared/public-api";
import { forkJoin } from "rxjs";
import type { AlarmService } from "@core/http/alarm.service";
import { DataTableAction, DataTableCellDirective, DataTableColumn, DataTableComponent } from "../../../components/shared/data-table/data-table.component";
import { ThemeToggleComponent } from "../../../components/shared/theme-toggle/theme-toggle.component";
import { SidebarLayoutComponent } from "../../../components/shared/sidebar-layout/sidebar-layout.component";
import { FilterSectionComponent } from "../../../components/shared/filter-section/filter-section.component";
import { FilterListComponent, FilterListOption } from "../../../components/shared/filter-list/filter-list.component";
import { keepsSidePanelOpen } from "../../../components/shared/detail-panel/side-panel-outside-click";
import { EntityDetailPanelComponent } from "../../../components/shared/entity-detail-panel/entity-detail-panel.component";
import { SegmentOption, SegmentedControlComponent } from "../../../components/shared/segmented-control/segmented-control.component";
import { MetricChartCardComponent, MetricChartSection } from "../../../components/shared/metric-chart-card/metric-chart-card.component";
import { LineChartThreshold } from "../../../components/shared/line-chart/line-chart.component";
import { LorawanSignalCardComponent } from "../../../components/shared/lorawan-signal-card/lorawan-signal-card.component";
import {
  AttributeSelect,
  DeviceSettingControl,
  DeviceSettingObject,
  DeviceSettingObjectCard,
  DeviceSettingsCardComponent,
} from "../../../components/shared/device-settings-card/device-settings-card.component";
import { injectCss } from "../../../components/shared/cdn-loader";
import { CardComponent } from "../../../components/shared/card/card.component";
import { ConfirmDialogComponent } from "../../../components/shared/confirm-dialog/confirm-dialog.component";
import { DateRangePickerComponent, TbDateRange } from "../../../components/shared/date-range-picker/date-range-picker.component";
import { formatDateTime } from "../../../components/shared/time-format";
import { StatusPillComponent } from "../../../components/shared/status-pill/status-pill.component";
import { HeaderIconButtonComponent } from "../../../components/shared/header-icon-button/header-icon-button.component";
import { AlarmListComponent } from "../../../components/shared/alarm-list/alarm-list.component";
import { WidgetContext } from "@home/models/widget-component.models";

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

/** One alarm row in the Alarms list. */
interface AlarmRow {
  id: string;
  createdTime: number;
  originatorName: string;
  /** Originator device id — used to tally active alarms per device. */
  originatorId: string;
  type: string;
  severity: string;
  acknowledged: boolean;
  cleared: boolean;
  /** Alarm `details.data` (shown after the date in the detail panel's Alarms tab). */
  detailsData: string;
  /** Precomputed visible text, used by the base table's search filter. */
  searchText: string;
}

/** One device row in the Devices list. */
interface DeviceRow {
  deviceId: string;
  name: string;
  label: string;
  /** Device profile / type — picks the hardware version's settings wiring. */
  type: string;
  /** Probe (TS302) or ambience sensor — see {@link DeviceKind}. */
  kind: DeviceKind;
  /** Owning customer's title ("" when the tenant owns it) — the Customers filter. */
  owner: string;
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
    DataTableComponent,
    DataTableCellDirective,
    ThemeToggleComponent,
    SidebarLayoutComponent,
    SegmentedControlComponent,
    FilterSectionComponent,
    FilterListComponent,
    EntityDetailPanelComponent,
    MetricChartCardComponent,
    LorawanSignalCardComponent,
    DeviceSettingsCardComponent,
    StatusPillComponent,
    HeaderIconButtonComponent,
    AlarmListComponent,
    CardComponent,
    ConfirmDialogComponent,
    DateRangePickerComponent,
  ],
})
export class QcLabMonitoringDashboardComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() ctx: WidgetContext;

  /** Two-channel temperature probes (device profile names). */
  private readonly probeTypes = ["Milesight-TS302", "Milesight-TS302-V2"];
  /** Ambience sensors — temperature + humidity (device profile names). */
  private readonly ambienceTypes = ["Milesight-AM102", "Milesight-EM320-TH"];
  /** Device types listed by this dashboard (== device profile names). */
  readonly deviceTypes = [...this.probeTypes, ...this.ambienceTypes];

  // -- views + sidebar filter --------------------------------------------------
  /** Sidebar view switcher: one dedicated table per kind of device. */
  readonly views: SegmentOption[] = [
    { id: "probe", label: "Temperature", icon: "device_thermostat", tooltip: "Temperature" },
    { id: "ambience", label: "Ambience", icon: "humidity_percentage", tooltip: "Ambience" },
  ];
  view: DeviceKind = "probe";
  /** Whether the filter sidebar is shown (top-bar toggle). */
  sidebarOpen = true;
  /** Customers filter (owner titles); none checked = all. */
  customerFilter: string[] = [];
  customersListExpanded = false;
  customerOptions: FilterListOption[] = [];
  /** Devices (of both kinds) passing the Customers filter — what the alarms
   *  panel and header badge cover. */
  customerRows: DeviceRow[] = [];
  /**
   * Rows the active view's table shows: its kind of device, customer-filtered.
   * A field, not a getter: the table resets and re-measures on every new `rows`
   * reference, so a fresh array per change-detection pass loops forever.
   */
  tableRows: DeviceRow[] = [];

  /** Light/dark theme toggle (persisted per-user server-side, shared across dashboards). */
  darkMode = false;
  // Each view's table: wide screens get one column per field (like the fuel
  // tables); narrow ones the condensed Device + Readings pair.
  readonly probeColumns: DataTableColumn[] = [
    { key: "name", header: "Device" },
    { key: "owner", header: "Customer" },
    { key: "chn1", header: "Channel 1", sortKey: "chn1Value" },
    { key: "chn2", header: "Channel 2", sortKey: "chn2Value" },
    { key: "battery", header: "Battery" },
    { key: "alarmCount", header: "Alarms" },
  ];
  readonly ambienceColumns: DataTableColumn[] = [
    { key: "name", header: "Device" },
    { key: "owner", header: "Customer" },
    { key: "temperature", header: "Temperature", sortKey: "temperatureValue" },
    { key: "humidity", header: "Humidity", sortKey: "humidityValue" },
    { key: "battery", header: "Battery" },
    { key: "alarmCount", header: "Alarms" },
  ];
  readonly compactColumns: DataTableColumn[] = [
    { key: "name", header: "Device" },
    // Probe: both channel temperatures; ambience: temperature + humidity.
    { key: "readings", header: "Readings", align: "right", sortKey: "readingValue" },
  ];
  /** Content area narrower than {@link compactBreakpoint} — condensed table. */
  compact = false;
  /** Content width (px) below which the table switches to the condensed layout. */
  private readonly compactBreakpoint = 760;
  @ViewChild("content") private contentEl?: ElementRef<HTMLElement>;
  private contentObserver?: ResizeObserver;

  get probeTableColumns(): DataTableColumn[] {
    return this.compact ? this.compactColumns : this.probeColumns;
  }

  get ambienceTableColumns(): DataTableColumn[] {
    return this.compact ? this.compactColumns : this.ambienceColumns;
  }
  devicesRows: DeviceRow[] = [];
  devicesLoading = false;
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
        { name: "temperatureChn1", label: "Channel 1", color: "#1e5dff" },
        { name: "temperatureChn2", label: "Channel 2", color: "#a855f7" },
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
      keys: [{ name: "temperature", label: "Temperature", color: "#1e5dff" }],
    },
    {
      chartTitle: "Humidity",
      unit: "%",
      yMin: 0,
      yMax: 100,
      fill: true,
      keys: [{ name: "humidity", label: "Humidity", color: "#0ea5e9" }],
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
    { id: "settings", label: "Settings", icon: "settings", tooltip: "Settings" },
    { id: "history", label: "History", icon: "history", tooltip: "History" },
  ];

  // Settings tab: SHARED_SCOPE JSON-object attributes (Calibration + Alarms).
  alarmsRows: AlarmRow[] = [];
  alarmsLoading = false;
  /** Whether the alarms side panel is open. */
  alarmDialogOpen = false;
  /** Single-tab config for the alarms panel (the lone pill is hidden). */
  readonly alarmPanelTabs: SegmentOption[] = [{ id: "alarms", label: "Alarms", icon: "notifications", tooltip: "Alarms" }];
  /** Alarms of the listed devices, named by device display name (alarms panel —
   *  the shared tb-alarm-list groups them per device and filters by severity). */
  panelAlarms: AlarmRow[] = [];
  /** The selected device's alarms (detail panel's Alarms tab). */
  detailAlarms: AlarmRow[] = [];
  /** Cards for the single-device panel — reporting variant per selected device.
   *  Assigned in the constructor: the card-definition fields live further down
   *  the class, so a field initializer here would read them as undefined. */
  detailObjectCards: DeviceSettingObjectCard[] = [];
  private readonly themeSettingKey = "darkMode";
  /** Colour of the temperature chart's alarm-threshold lines — the Major alarm
   *  severity orange (#f66716 light / #ff8a45 dark), resolved by the chart. */
  private readonly thresholdLineColor = "var(--c-bg-major-normal)";
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
  private readonly thresholdFields: DeviceSettingControl[] = [
    { kind: "toggle", key: "enable", label: "Enable" },
    {
      kind: "buttons",
      key: "condition",
      label: "Condition",
      options: [
        { value: "below", label: "Below" },
        { value: "above", label: "Above" },
        { value: "between", label: "Between" },
        { value: "outside", label: "Outside" },
      ],
    },
    { kind: "slider", key: "thresholdMin", label: "Min threshold", min: -40, max: 80, step: 1, unitFrom: this.tempUnitFrom },
    { kind: "slider", key: "thresholdMax", label: "Max threshold", min: -40, max: 80, step: 1, unitFrom: this.tempUnitFrom },
  ];
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
        objects: [{ key: "temperatureChn1AlarmConfig", label: "Channel 1", gateKey: "enable", fields: this.thresholdFields }],
      },
      {
        objects: [{ key: "temperatureChn2AlarmConfig", label: "Channel 2", gateKey: "enable", fields: this.thresholdFields }],
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
  /** The shared range calendar (one tb-date-range-picker in the root). */
  historyPickerOpen = false;
  historyPickerAnchor: HTMLElement | null = null;
  /** Which form's draft the open calendar edits. */
  historyPickerScope: HistoryScope = "device";
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
        { id: "insights", label: "Insights", icon: "bar_chart", tooltip: "Insights" },
        { id: "alarms", label: "Alarms", icon: "notifications", tooltip: "Alarms", badge: this.selectedDevice.alarmCount ?? 0 },
        { id: "settings", label: "Settings", icon: "settings", tooltip: "Settings" },
      ];
    }
    return [
      { id: "insights", label: "Insights", icon: "bar_chart", tooltip: "Insights" },
      { id: "alarms", label: "Alarms", icon: "notifications", tooltip: "Alarms", badge: this.selectedDevice?.alarmCount ?? 0 },
      { id: "history", label: "History", icon: "history", tooltip: "History" },
      { id: "settings", label: "Settings", icon: "settings", tooltip: "Settings" },
    ];
  }

  /** Header action(s) on the Devices table — a toggle for the select checkboxes. */
  get devicesActions(): DataTableAction[] {
    return [{ id: "select", icon: "checklist", tooltip: this.selectMode ? "Exit select" : "Select", active: this.selectMode }];
  }

  /** Whether every device is selected (drives the bulk bar's "Select all" box). */
  get allDevicesSelected(): boolean {
    return this.tableRows.length > 0 && this.selectedDeviceIds.length === this.tableRows.length;
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

  /** Alarms belonging to the customer-filtered devices (both views). */
  private get scopedAlarms(): AlarmRow[] {
    const ids = new Set(this.customerRows.map((r) => r.deviceId));
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

  /** Toggle the checkbox column from the Devices table header action. */
  onDeviceAction(id: string): void {
    if (id === "select") {
      this.selectMode = !this.selectMode;
      if (!this.selectMode) {
        // Leaving select mode: drop the selection and close the bulk panel.
        this.clearDeviceSelection();
        this.bulkEditOpen = false;
      }
    }
  }

  /** Track the checked device rows for bulk editing. */
  onDeviceSelectionChange(rows: Record<string, any>[]): void {
    this.selectedDeviceIds = rows.map((r) => r["deviceId"] as string);
  }

  /** Bulk bar "Select all": check all devices, or clear when already all checked. */
  toggleSelectAll(): void {
    this.deviceTable?.checkAll(!this.allDevicesSelected);
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
    if (this.historyPickerScope === scope) {
      this.historyPickerOpen = false;
    }
    if (this.historyConfirmScope === scope) {
      this.historyConfirmOpen = false;
    }
  }

  /** Toggle the range calendar, anchored to a History form's range field. */
  toggleHistoryPicker(anchor: HTMLElement, scope: HistoryScope): void {
    if (this.historyPickerOpen && this.historyPickerScope === scope) {
      this.historyPickerOpen = false;
      return;
    }
    this.historyPickerScope = scope;
    this.historyPickerAnchor = anchor;
    this.historyPickerOpen = true;
  }

  onHistoryRangeApplied(range: TbDateRange): void {
    this.historyDrafts[this.historyPickerScope].range = range;
    this.historyPickerOpen = false;
  }

  /** A form's chosen range as text, e.g. "Sep 30 at 1:05 PM – Oct 2 at 9:00 AM". */
  historyRangeLabel(scope: HistoryScope): string {
    const r = this.historyDrafts[scope].range;
    return r ? `${formatDateTime(r.start)} – ${formatDateTime(r.end)}` : "Select a time range";
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
    const cfg = { ignoreLoading: true, ignoreErrors: true };
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
        error: () => {
          draft.sending = false;
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
    if (!this.detailOpen || keepsSidePanelOpen(event.target)) {
      return;
    }
    this.closeDetail();
    this.cd.detectChanges();
  }

  ngOnInit(): void {
    this.ctx.$scope.qcLabMonitoringDashboardComponent = this;
    // Load the Material Symbols Rounded variable font so all dashboard icons use
    // the rounded variant.
    injectCss("tb-ext-material-symbols-rounded", "https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200");
    this.alarmService = this.ctx.$injector.get(this.ctx.servicesMap.get("alarmService")) as AlarmService;
    this.loadUserPreferences();

    this.subscribeAlarms();
    this.loadDevices(); // initial render
    this.subscribeDevices(); // live updates when temperatures / attributes change
  }

  ngOnDestroy(): void {
    if (this.alarmsSubscription) {
      this.ctx.subscriptionApi.removeSubscription(this.alarmsSubscription.id);
    }
    if (this.devicesSubscription) {
      this.ctx.subscriptionApi.removeSubscription(this.devicesSubscription.id);
    }
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

  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
  }

  /** Switch the sidebar view (probes / ambience). Select mode and the open
   *  panel belong to the previous view's table, so both are closed. */
  selectView(id: string): void {
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

  onCustomerFilterChange(ids: string[]): void {
    this.customerFilter = ids;
    this.applyDeviceFilters();
  }

  /**
   * Rebuild the Customers options and the filtered rows from the loaded devices.
   * Customer counts are for the active view's kind of device, so each shows what
   * checking it would add to the table.
   */
  private applyDeviceFilters(): void {
    const byCustomer = (r: DeviceRow) => !this.customerFilter.length || this.customerFilter.includes(r.owner);
    const counts = new Map<string, number>();
    for (const r of this.devicesRows.filter((d) => d.kind === this.view)) {
      counts.set(r.owner, (counts.get(r.owner) ?? 0) + 1);
    }
    const owners = [...new Set(this.devicesRows.map((r) => r.owner))].sort((a, b) => (a || "~").localeCompare(b || "~"));
    this.customerOptions = owners.map((o) => ({ id: o, label: o || "Unassigned", count: counts.get(o) ?? 0 }));
    // Drop a filtered-out customer that no longer owns any device.
    this.customerFilter = this.customerFilter.filter((c) => owners.includes(c));
    this.customerRows = this.devicesRows.filter(byCustomer);
    this.tableRows = this.customerRows.filter((r) => r.kind === this.view);
    // Keep the bulk selection to what's still listed.
    const listed = new Set(this.tableRows.map((r) => r.deviceId));
    this.selectedDeviceIds = this.selectedDeviceIds.filter((id) => listed.has(id));
    // The open panel's device was filtered out — close it.
    if (this.detailOpen && this.selectedDevice && !listed.has(this.selectedDevice.deviceId)) {
      this.closeDetail();
    }
    this.applyAlarmFilter();
  }

  toggleTheme(): void {
    this.darkMode = !this.darkMode;
    this.cd.detectChanges();
    // Persist to the logged-in user's settings (merged server-side).
    this.ctx.userSettingsService
      .putUserSettings({ [this.themeSettingKey]: this.darkMode } as any)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe();
  }

  /** Clear an alarm from either alarm list (the shared tb-alarm-list emits it). */
  clearAlarm(alarm: { id: string; cleared: boolean }): void {
    if (alarm.cleared) {
      return;
    }
    alarm.cleared = true;
    this.alarmService
      .clearAlarm(alarm.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ error: () => (alarm.cleared = false) });
  }

  /** Load every device of type Milesight-TS302 into the Devices table. */
  /** Reload the Devices table (also called after a device's settings are saved). */
  loadDevices(): void {
    this.devicesLoading = true;
    const deviceQuery: EntityDataQuery = {
      entityFilter: this.deviceFilter,
      pageLink: {
        pageSize: 1024,
        page: 0,
        sortOrder: { key: { type: EntityKeyType.ENTITY_FIELD, key: "name" }, direction: Direction.ASC },
      },
      entityFields: [
        { type: EntityKeyType.ENTITY_FIELD, key: "name" },
        { type: EntityKeyType.ENTITY_FIELD, key: "label" },
        // Device type/profile — picks the hardware version's settings wiring.
        { type: EntityKeyType.ENTITY_FIELD, key: "type" },
        // Owning customer's title — the sidebar Customers filter.
        { type: EntityKeyType.ENTITY_FIELD, key: "ownerName" },
        { type: EntityKeyType.ENTITY_FIELD, key: "ownerType" },
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
        // Settings → Device settings + object attributes (shared), pre-fetched here.
        ...this.deviceSettingControls.map((c) => ({ type: EntityKeyType.SHARED_ATTRIBUTE, key: c.key })),
        ...this.objectAttributeKeys.map((key) => ({ type: EntityKeyType.SHARED_ATTRIBUTE, key })),
      ],
    };

    const cfg = { ignoreLoading: true, ignoreErrors: true };
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
                owner: fields["ownerType"]?.value === "CUSTOMER" ? fields["ownerName"]?.value ?? "" : "",
                temperature: this.formatTemp(ts["temperature"]?.value),
                humidity: this.formatHumidity(ts["humidity"]?.value),
                // Booleans arrive stringified ("true" / "false").
                temperatureAlarm: String(ts["temperatureAlarm"]?.value) === "true",
                humidityAlarm: String(ts["humidityAlarm"]?.value) === "true",
                chn1Value: this.toNumber(ts["temperatureChn1"]?.value),
                chn2Value: this.toNumber(ts["temperatureChn2"]?.value),
                temperatureValue: this.toNumber(ts["temperature"]?.value),
                humidityValue: this.toNumber(ts["humidity"]?.value),
                readingValue: this.toNumber(
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
                description: this.parseDescription(fields["additionalInfo"]?.value),
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
          this.refreshSelectedDevice();
          // Rebuild the filters + visible rows; that also re-scopes the alarm panel
          // (devices may arrive after the alarms).
          this.applyDeviceFilters();
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
  relativeTime(ts: number | null): string {
    if (!ts) {
      return "—";
    }
    // Clamp to 0 — device clocks can run slightly ahead (or, with unsynced RTCs,
    // well ahead) of the browser, which would otherwise read as a negative age.
    const secs = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (secs === 0) {
      return "just now";
    }
    if (secs < 60) {
      return `${secs}s ago`;
    }
    const mins = Math.floor(secs / 60);
    if (mins < 60) {
      return `${mins}m ago`;
    }
    const hours = Math.floor(mins / 60);
    if (hours < 24) {
      return `${hours}h ago`;
    }
    return `${Math.floor(hours / 24)}d ago`;
  }

  /** "Critical" from "CRITICAL" (alarm search text). */
  private severityLabel(severity: string): string {
    if (!severity) {
      return "";
    }
    return severity.charAt(0) + severity.slice(1).toLowerCase();
  }

  // Ambience sensors' threshold alarms: SERVER_SCOPE JSON objects
  // `temperatureAlarmConfig` / `humidityAlarmConfig` = {enable, condition,
  // thresholdMin, thresholdMax}, evaluated in ThingsBoard (no downlink).
  /** The ambience alarm-config attribute keys (SERVER_SCOPE). */
  private readonly ambienceAlarmKeys = ["temperatureAlarmConfig", "humidityAlarmConfig"];
  private ambienceThresholdFields(min: number, max: number, unit: string): DeviceSettingControl[] {
    return [
      { kind: "toggle", key: "enable", label: "Enable" },
      {
        kind: "buttons",
        key: "condition",
        label: "Condition",
        options: [
          { value: "below", label: "Below" },
          { value: "above", label: "Above" },
          { value: "between", label: "Between" },
          { value: "outside", label: "Outside" },
        ],
      },
      { kind: "slider", key: "thresholdMin", label: "Min threshold", min, max, step: 1, unit },
      { kind: "slider", key: "thresholdMax", label: "Max threshold", min, max, step: 1, unit },
    ];
  }
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
          objects: [
            {
              key: "temperatureAlarmConfig",
              label: "Temperature",
              gateKey: "enable",
              scope: "server",
              fields: this.ambienceThresholdFields(-40, 80, "°C"),
            },
          ],
        },
        {
          objects: [
            {
              key: "humidityAlarmConfig",
              label: "Humidity",
              gateKey: "enable",
              scope: "server",
              fields: this.ambienceThresholdFields(0, 100, "%"),
            },
          ],
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
        const thresholds = this.buildThresholds([this.ambienceAlarmKeys[i]], section.unit ?? "");
        return JSON.stringify(section.thresholds ?? []) === JSON.stringify(thresholds) ? section : { ...section, thresholds };
      });
      if (next.some((section, i) => section !== this.ambienceCharts[i])) {
        this.ambienceCharts = next;
      }
      return;
    }
    const thresholds = this.buildThresholds(["temperatureChn1AlarmConfig", "temperatureChn2AlarmConfig"], this.tempUnit());
    const section = this.metricsCharts[0];
    if (JSON.stringify(section.thresholds ?? []) === JSON.stringify(thresholds)) {
      return;
    }
    this.metricsCharts = [{ ...section, thresholds }, ...this.metricsCharts.slice(1)];
  }

  /**
   * Threshold lines for a chart: min/max from each enabled alarm-config object
   * in `keys`, filtered by its condition (below → min only, above → max only)
   * and deduped so identical thresholds draw once. Each line is captioned with
   * its own value and `unit`.
   */
  private buildThresholds(keys: string[], unit: string): LineChartThreshold[] {
    const out: LineChartThreshold[] = [];
    const seen = new Set<number>();
    for (const key of keys) {
      // Object attributes arrive stringified — parse before reading fields, and
      // treat the stringified "true" as enabled (same coercion as the settings card).
      const cfg = this.parseObjectAttribute(this.objectValues[key]);
      if (cfg["enable"] !== true && cfg["enable"] !== "true") {
        continue;
      }
      const condition = String(cfg["condition"] ?? "").toLowerCase();
      const values: unknown[] = [];
      if (condition !== "above") {
        values.push(cfg["thresholdMin"]);
      }
      if (condition !== "below") {
        values.push(cfg["thresholdMax"]);
      }
      for (const raw of values) {
        const n = Number(raw);
        if (raw == null || raw === "" || !isFinite(n) || seen.has(n)) {
          continue;
        }
        seen.add(n);
        out.push({ value: n, color: this.thresholdLineColor, label: unit ? `${n} ${unit}` : `${n}` });
      }
    }
    return out;
  }

  /** Display unit (°C/°F) from the selected device's `temperatureUnitDisplay`. */
  private tempUnit(): string {
    const raw = String(this.deviceSettingsValues[this.tempUnitFrom.key] ?? "").toLowerCase();
    return (this.tempUnitFrom.map as Record<string, string>)[raw] ?? "";
  }

  /** An object attribute's value as an object (it arrives JSON-stringified). */
  private parseObjectAttribute(raw: unknown): Record<string, any> {
    if (raw == null || raw === "") {
      return {};
    }
    if (typeof raw === "object") {
      return raw as Record<string, any>;
    }
    try {
      return JSON.parse(String(raw)) ?? {};
    } catch {
      return {};
    }
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
    this.ctx.userSettingsService
      .loadUserSettings()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((settings: any) => {
        this.darkMode = !!settings?.[this.themeSettingKey];
        this.cd.detectChanges();
      });
  }

  /**
   * The alarms panel's list: every alarm of a device the Devices table lists,
   * titled with the device's display name (label || name) — tb-alarm-list
   * groups them per device and handles the severity filter.
   */
  private applyAlarmFilter(): void {
    const names = new Map(this.devicesRows.map((d) => [d.deviceId, d.name]));
    this.panelAlarms = this.scopedAlarms.map((a) => ({ ...a, originatorName: names.get(a.originatorId) || a.originatorName || "Unknown device" }));
  }

  /**
   * Live "latest" subscription over the device set's channel temperatures and
   * attributes. Whenever a value changes, reload the table so it always
   * reflects the latest values without a page refresh. The initial emission is
   * skipped — the explicit loadDevices() in ngOnInit covers the first render.
   */
  private subscribeDevices(): void {
    const datasources: Datasource[] = [
      {
        type: DatasourceType.entity,
        name: "devices",
        entityFilter: this.deviceFilter,
        dataKeys: [
          { name: "temperatureChn1", label: "temperatureChn1", type: DataKeyType.timeseries, settings: {} },
          { name: "temperatureChn2", label: "temperatureChn2", type: DataKeyType.timeseries, settings: {} },
          { name: "temperature", label: "temperature", type: DataKeyType.timeseries, settings: {} },
          { name: "humidity", label: "humidity", type: DataKeyType.timeseries, settings: {} },
          { name: "temperatureAlarm", label: "temperatureAlarm", type: DataKeyType.timeseries, settings: {} },
          { name: "humidityAlarm", label: "humidityAlarm", type: DataKeyType.timeseries, settings: {} },
          { name: "battery", label: "battery", type: DataKeyType.timeseries, settings: {} },
          { name: "sensorChannel1", label: "sensorChannel1", type: DataKeyType.attribute, settings: {} },
          { name: "sensorChannel2", label: "sensorChannel2", type: DataKeyType.attribute, settings: {} },
          { name: "syncState", label: "syncState", type: DataKeyType.attribute, settings: {} },
          { name: "downlinkQueue", label: "downlinkQueue", type: DataKeyType.attribute, settings: {} },
          ...this.ambienceAlarmKeys.map((key) => ({ name: key, label: key, type: DataKeyType.attribute, settings: {} })),
          // SHARED_SCOPE device settings + object attributes — refresh on change.
          ...[...this.deviceSettingControls.map((c) => c.key), ...this.objectAttributeKeys].map((key) => ({
            name: key,
            label: key,
            type: DataKeyType.attribute,
            settings: {},
          })),
        ],
      },
    ];

    let firstEmission = true;
    const options: WidgetSubscriptionOptions = {
      type: widgetType.latest,
      datasources,
      callbacks: {
        onDataUpdated: () => {
          if (firstEmission) {
            firstEmission = false;
            return;
          }
          // Debounce: reload shortly after the last change so a burst of telemetry
          // coalesces into one re-query, but values still update near-instantly.
          clearTimeout(this.devicesRefreshTimer);
          this.devicesRefreshTimer = setTimeout(() => this.loadDevices(), 300);
        },
      },
    };

    this.ctx.subscriptionApi
      .createSubscription(options, true)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((subscription) => {
        this.devicesSubscription = subscription;
      });
  }

  /**
   * Live alarm subscription over the device set. Alarm subscriptions do not
   * auto-start, so subscribeForAlarms() must be called explicitly.
   */
  private subscribeAlarms(): void {
    this.alarmsLoading = true;
    const alarmSource: Datasource = {
      type: DatasourceType.entity,
      name: "alarms",
      entityFilter: this.deviceFilter,
      dataKeys: [
        { name: "createdTime", label: "createdTime", type: DataKeyType.alarm, settings: {} },
        { name: "type", label: "type", type: DataKeyType.alarm, settings: {} },
        { name: "severity", label: "severity", type: DataKeyType.alarm, settings: {} },
      ],
    };

    // A REALTIME timewindow (not history) so the alarm subscription streams live
    // updates — new alarms appear and cleared/acked ones drop out without a manual
    // refresh. The wide window still surfaces alarms of any age for these devices.
    const tenYearsMs = 10 * 365 * 24 * 60 * 60 * 1000;
    const options: WidgetSubscriptionOptions = {
      type: widgetType.alarm,
      alarmSource,
      useDashboardTimewindow: false,
      timeWindowConfig: {
        selectedTab: TimewindowType.REALTIME,
        realtime: { realtimeType: RealtimeWindowType.LAST_INTERVAL, timewindowMs: tenYearsMs },
      },
      callbacks: {
        onDataUpdated: (subscription) => this.onAlarmsSubscriptionUpdated(subscription),
      },
    };

    this.ctx.subscriptionApi
      .createSubscription(options, false)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((subscription) => {
        this.alarmsSubscription = subscription;
        subscription.subscribeForAlarms(
          {
            pageSize: 1024,
            page: 0,
            sortOrder: { key: { type: EntityKeyType.ALARM_FIELD, key: "createdTime" }, direction: Direction.DESC },
            searchPropagatedAlarms: true,
            typeList: [],
            statusList: [AlarmSearchStatus.ACTIVE], // active (uncleared) alarms only
            severityList: [],
          },
          null
        );
      });
  }

  private onAlarmsSubscriptionUpdated(subscription: any): void {
    const alarms = subscription?.alarms?.data ?? [];
    this.alarmsRows = alarms.map((a: any) => {
      const originatorName = a.originatorDisplayName || a.originatorLabel || a.originatorName || "";
      const rawData = a.details?.data;
      const detailsData = rawData == null ? "" : typeof rawData === "object" ? JSON.stringify(rawData) : String(rawData);
      return {
        id: a.id?.id ?? a.id,
        createdTime: a.createdTime,
        originatorName,
        originatorId: a.originator?.id ?? a.originatorId ?? "",
        type: a.type,
        severity: a.severity,
        acknowledged: !!(a.acknowledged ?? a.ackTs > 0),
        cleared: !!(a.cleared ?? a.clearTs > 0),
        detailsData,
        searchText: `${originatorName} ${a.type} ${this.severityLabel(a.severity)} ${new Date(a.createdTime).toLocaleString()}`,
      };
    });
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
    this.customerRows = this.customerRows.map((v) => fresh.get(v.deviceId) ?? v);
    this.tableRows = this.tableRows.map((v) => fresh.get(v.deviceId) ?? v);
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

  /** A raw telemetry value as a number, or null when missing / not numeric. */
  private toNumber(raw: any): number | null {
    if (raw === "" || raw == null) {
      return null;
    }
    const n = Number(raw);
    return isFinite(n) ? n : null;
  }

  /** Format a raw humidity value to a whole percent ("54 %"); "—" when not numeric. */
  private formatHumidity(raw: any): string {
    if (raw === "" || raw == null) {
      return "—";
    }
    const n = Number(raw);
    return isFinite(n) ? `${Math.round(n)} %` : "—";
  }

  /** Extract the description from the device's additionalInfo (JSON string). */
  private parseDescription(raw: any): string {
    if (!raw) {
      return "";
    }
    try {
      return JSON.parse(raw)?.description ?? "";
    } catch {
      return "";
    }
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
