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
import {
  AliasFilterType,
  AttributeScope,
  EntityDataQuery,
  EntityFilter,
  EntityKeyType,
  EntityType,
  SharedModule,
} from "@shared/public-api";
import type { AlarmService } from "@core/http/alarm.service";
import { WidgetContext } from "@home/models/widget-component.models";
import { DataTableCellDirective, DataTableColumn, DataTableComponent, DataTableSort } from "../../../components/shared/data-table/data-table.component";
import { CountMarkComponent } from "../../../components/shared/count-mark/count-mark.component";
import { DashboardAlarm, alarmsTab, clearDashboardAlarm, subscribeActiveAlarms } from "../../../components/shared/dashboard/dashboard-alarms";
import { dashboardRailItems, isTenantAdmin, DashboardTheme, readUserSettings, saveUserSettings } from "../../../components/shared/dashboard/dashboard-preferences";
import { DashboardHost, NestedDashboard, dashboardWidgetSettings, nestedUrlParams, ownsUrlState } from "../../../components/shared/dashboard/nested-dashboard";
import { readDashboardUrlState, writeDashboardUrlState } from "../../../components/shared/dashboard/dashboard-url-state";
import { TableColumnChoice, sidebarWidth } from "../../../components/shared/dashboard/table-columns";
import { SidebarLayoutComponent } from "../../../components/shared/sidebar-layout/sidebar-layout.component";
import { SearchBoxComponent } from "../../../components/shared/search-box/search-box.component";
import { FilterSectionsComponent } from "../../../components/shared/filter-sections/filter-sections.component";
import { CheckFilterComponent } from "../../../components/shared/check-filter/check-filter.component";
import { FilterListOption } from "../../../components/shared/filter-list/filter-list.component";
import { ColumnPickerComponent } from "../../../components/shared/column-picker/column-picker.component";
import { IconBadgeComponent } from "../../../components/shared/icon-badge/icon-badge.component";
import { byNamePageLink, removeSubscriptions, subscribeLatestChanges } from "../../../components/shared/dashboard/dashboard-subscriptions";
import { NavRailComponent, NavRailItem } from "../../../components/shared/nav-rail/nav-rail.component";
import { DashboardRootDirective } from "../../../components/shared/dashboard/dashboard-root.directive";
import { ToastsComponent } from "../../../components/shared/toasts/toasts.component";
import { FeedbackDialogComponent } from "../../../components/shared/feedback/feedback-dialog/feedback-dialog.component";
import { FEEDBACK_RAIL_ID, feedbackOf } from "../../../components/shared/feedback/feedback.models";
import { DashboardLoadingComponent, FirstLoad } from "../../../components/shared/dashboard-loading/dashboard-loading.component";
import { StatGridComponent, StatItem } from "../../../components/shared/stat-grid/stat-grid.component";
import { EntityDetailPanelComponent, INSIGHTS_TAB } from "../../../components/shared/entity-detail-panel/entity-detail-panel.component";
import { SegmentOption, SegmentedControlComponent } from "../../../components/shared/segmented-control/segmented-control.component";
import { CHART_PALETTE, MetricChartCardComponent, MetricChartSection, paletteCharts } from "../../../components/shared/metric-chart-card/metric-chart-card.component";
import { FigureCardComponent } from "../../../components/shared/figure-card/figure-card.component";
import { MapBounds, MapCardComponent, MapControl, MapLocation, MapLocationMove, MapTrack, MapTrackSample, MapType, MapTrip } from "../../../components/shared/map-card/map-card.component";
import { TimeframePickerComponent } from "../../../components/shared/timeframe-picker/timeframe-picker.component";
import { HeaderIconButtonComponent } from "../../../components/shared/header-icon-button/header-icon-button.component";
import { StatusPillComponent, StatusPillTone } from "../../../components/shared/status-pill/status-pill.component";
import { AlarmListComponent } from "../../../components/shared/alarm-list/alarm-list.component";
import { AlarmPanelComponent } from "../../../components/shared/alarm-panel/alarm-panel.component";
import { injectCss } from "../../../components/shared/cdn-loader";
import { StateTimelineComponent, StateTimelineState } from "../../../components/shared/state-timeline/state-timeline.component";
import { ProfileIcons, ProfileKind, profileIconsOf } from "../../../components/shared/profile-icons/profile-icons";
import { formatDateTime, relativeTime } from "../../../components/shared/time-format";
import { QUIET_REQUEST, fmtNumber, parseNumber } from "../../../components/shared/value-utils";

/** Sidebar views: the Vessels table, the fleet map, or one vessel's details page (opened from the table). */
type MarineView = "vessels" | "map" | "vessel";

/** AIS navigational status as reported: the ITU-R M.1371 code (0–15) or its text label; null = never reported. */
type NavStatus = number | string | null;

/** Engine telemetry metrics (one timeseries key each, per engine). */
type EngineMetric =
  | "engineSpeed"
  | "percentLoad"
  | "coolantTemperature"
  | "engineOilTemperature"
  | "intercoolerTemperature"
  | "fuelDeliveryPressure"
  | "engineOilPressure"
  | "boostPressure"
  | "intakeManifoldTemperature"
  | "rightExhaustGasTemperature"
  | "leftExhaustGasTemperature"
  | "batteryPotential"
  | "transmissionOilPressure"
  | "transmissionOilTemperature"
  | "fuelRate"
  | "fuelFilterDifferentialPressure"
  | "oilFilterDifferentialPressure"
  | "tripAverageFuelRate"
  | "totalEngineHours"
  | "totalFuelUsed"
  | "totalIdleHours"
  | "totalIdleFuelUsed";

/** Latest readings of one engine, as numbers (null when missing). */
type EngineReading = Record<EngineMetric, number | null> & {
  /** Engine index (0-based) and its display label ("Port" / "Starboard"). */
  index: number;
  label: string;
  /** Newest timestamp among its readings (ms), or null. */
  ts: number | null;
};

/** One vessel row in the Vessels table. */
interface VesselRow {
  deviceId: string;
  /** Display name (label || name). */
  name: string;
  /** The device's real name — the panel's sub-label when a label is shown as the title. */
  deviceName: string;
  /** The device's profile (its `type`): its icon in the table, on the map and in the panel. */
  profile: string;
  /** Call sign (server attribute), shown in the name cell's meta line. */
  callSign: string;
  /** Home port (server attribute) — the Vessels sidebar's filter; "" = unassigned (no option of its own). */
  homePort: string;
  engineCount: number;
  engines: EngineReading[];
  /** The AIS navigational status code the vessel reports (not whether the device is active). */
  status: NavStatus;
  /** AIS: speed over ground (kn), course over ground (°), true heading (°), position. */
  speed: number | null;
  course: number | null;
  heading: number | null;
  lat: number | null;
  lng: number | null;
  /** Maximum static draught (m) from the AIS static data — a client attribute set by the bridge. */
  draught: number | null;
  /** AIS destination (free text set by the crew) and ETA (ms), both from the static data. */
  destination: string;
  eta: number | null;
  /** Actual time of departure (ms) — the `atd` telemetry, entered per trip. */
  atd: number | null;
  /** Newest telemetry timestamp of any key (ms), or null. */
  lastSeen: number | null;
  alarmCount: number;
  /** Active alarm types mention coolant / oil pressure — color those values red. */
  coolantAlarm: boolean;
  oilPressureAlarm: boolean;
  // Sort values for the table (first engine, or the max across engines).
  engineSpeedValue: number | null;
  loadValue: number | null;
  coolantValue: number | null;
  oilPressureValue: number | null;
  fuelRateValue: number | null;
  engineHoursValue: number | null;
}

/** Telemetry / attribute keys the dashboard reads — overridable from the widget settings. */
interface MarineKeys {
  latitude: string;
  longitude: string;
  speed: string;
  course: string;
  heading: string;
  navStatus: string;
  /** Client attribute: maximum static draught (m). */
  draught: string;
  /** Client attributes: AIS destination text and ETA ("MM-DD HH:MM", UTC). */
  destination: string;
  eta: string;
  /** Timeseries: actual time of departure ("MM-DD HH:MM" or "YYYY-MM-DD HH:MM", local time). */
  atd: string;
  callSign: string;
  homePort: string;
  engineCount: string;
  /** Base timeseries key per engine metric (engine 1). */
  engine: Record<EngineMetric, string>;
  /** Per-engine key suffixes: engine 1 uses the bare key, engine 2 `<key><suffix>`. */
  engineSuffixes: string[];
}

const DEFAULT_KEYS: MarineKeys = {
  latitude: "latitude",
  longitude: "longitude",
  speed: "sog",
  course: "cog",
  heading: "heading",
  navStatus: "navStatus",
  draught: "maxDraught",
  destination: "destination",
  eta: "eta",
  atd: "atd",
  callSign: "callSign",
  homePort: "homePort",
  engineCount: "engineCount",
  engine: {
    engineSpeed: "engSpeed",
    percentLoad: "engPercentLoad",
    coolantTemperature: "engCoolantTemp",
    engineOilTemperature: "engOilTemp",
    intercoolerTemperature: "engAftercoolerTemp",
    fuelDeliveryPressure: "engFuelPress",
    engineOilPressure: "engOilPress",
    boostPressure: "engBoostPress",
    intakeManifoldTemperature: "engIntakeManifoldTemp",
    rightExhaustGasTemperature: "engExhaustTempRight",
    leftExhaustGasTemperature: "engExhaustTempLeft",
    batteryPotential: "batteryVoltage",
    transmissionOilPressure: "transOilPress",
    transmissionOilTemperature: "transOilTemp",
    fuelRate: "engFuelRate",
    fuelFilterDifferentialPressure: "engFuelFilterDiffPress",
    oilFilterDifferentialPressure: "engOilFilterDiffPress",
    tripAverageFuelRate: "engTripAvgFuelRate",
    totalEngineHours: "engTotalHours",
    totalFuelUsed: "engTotalFuelUsed",
    totalIdleHours: "engTotalIdleHours",
    totalIdleFuelUsed: "engTotalIdleFuel",
  },
  engineSuffixes: ["", "2"],
};

const ENGINE_METRICS = Object.keys(DEFAULT_KEYS.engine) as EngineMetric[];

/** Belt scale telemetry read for the popup / panel (`speed` = belt speed on some scales). */
const SCALE_TS_KEYS = ["state", "rate", "rateUnit", "weightUnit", "distanceUnit", "beltSpeed", "speed"];

const ENGINE_LABELS = ["Port", "Starboard", "Centre"];

/** Belt scale (barge loader) state — from its `state` telemetry key. */
type ScaleState = "stopped" | "blackBelt" | "producing";

/** The three scale states in bar order, with pill tone / label. */
const SCALE_STATES: { id: ScaleState; label: string; tone: StatusPillTone; icon: string }[] = [
  { id: "stopped", label: "Stopped", tone: "error", icon: "stop_circle" },
  { id: "blackBelt", label: "Black belt", tone: "warning", icon: "pause_circle" },
  { id: "producing", label: "Producing", tone: "success", icon: "play_circle" },
];

/** One belt scale (barge loader) plotted on the map. */
interface ScaleRow {
  deviceId: string;
  /** Display name (label || name). */
  name: string;
  deviceName: string;
  /** The device's profile (its `type`): its icon on the map and in the panel. */
  profile: string;
  lat: number;
  lng: number;
  state: ScaleState | null;
  /** Latest rate and its unit label ("t/hr"). */
  rate: number | null;
  rateUnit: string;
  beltSpeed: number | null;
  /** Belt speed unit from the scale's distance units: m/s (metric) or ft/min (imperial). */
  speedUnit: string;
  /** Newest telemetry timestamp (ms), or null. */
  lastSeen: number | null;
}

interface StatusMeta {
  label: string;
  tone: StatusPillTone;
  icon: string;
}

/** AIS navigational status codes 0–15 → pill label / tone / icon (one scale: the pill tones). */
const NAV_STATUS_META: Record<number, StatusMeta> = {
  0: { label: "Under way", tone: "success", icon: "navigation" },
  1: { label: "At anchor", tone: "brand", icon: "anchor" },
  2: { label: "Not under command", tone: "error", icon: "error" },
  3: { label: "Restricted manoeuvrability", tone: "warning", icon: "report" },
  4: { label: "Constrained by draught", tone: "warning", icon: "water" },
  5: { label: "Moored", tone: "brand", icon: "anchor" },
  6: { label: "Aground", tone: "error", icon: "warning" },
  7: { label: "Fishing", tone: "neutral", icon: "phishing" },
  8: { label: "Under way sailing", tone: "success", icon: "sailing" },
  9: { label: "Reserved (9)", tone: "neutral", icon: "help" },
  10: { label: "Reserved (10)", tone: "neutral", icon: "help" },
  11: { label: "Towing astern", tone: "success", icon: "link" },
  12: { label: "Pushing ahead / towing alongside", tone: "success", icon: "link" },
  13: { label: "Reserved (13)", tone: "neutral", icon: "help" },
  14: { label: "AIS-SART", tone: "error", icon: "sos" },
  15: { label: "Not defined", tone: "neutral", icon: "help" },
};
/** An AIS ETA further out than this is a stale transponder entry, not a forecast. */
const ETA_MAX_DAYS_AHEAD = 30;
/**
 * Development switch: when on, every vessel's trip bar shows 50% (ETA and
 * arrival detection are bypassed) so the bar can be seen without live trips.
 * Turn off before release.
 */
const TRIP_PROGRESS_DEV_MODE = true;
const TRIP_PROGRESS_DEV_VALUE = 0.5;

const NAV_STATUS_UNKNOWN: StatusMeta = { label: "No status", tone: "neutral", icon: "help" };

/** The pill text colour per tone — so a timeline run matches the pill that names the same state. */
const TONE_COLOR: Record<StatusPillTone, string> = {
  success: "var(--c-bg-success-normal)",
  warning: "var(--c-bg-warning-normal)",
  caution: "var(--c-bg-caution-normal)",
  minor: "var(--c-bg-minor-normal)",
  major: "var(--c-bg-major-normal)",
  error: "var(--c-bg-error-normal)",
  brand: "var(--c-brand-accent)",
  neutral: "var(--c-text-pill-neutral)",
  sky: "var(--c-bg-sky-normal)",
};

/** Letters only, lower case — "Under way using engine" and "under-way (using engine)" compare equal. */
const normalizeStatusLabel = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

/** Text labels → code: the table's own labels, the long ITU wordings and the Tugboat NavStatusText calculated field's labels. */
const NAV_STATUS_BY_LABEL: Record<string, number> = Object.fromEntries([
  ...Object.entries(NAV_STATUS_META).map(([code, m]) => [normalizeStatusLabel(m.label), Number(code)]),
  ...Object.entries({
    "under way using engine": 0,
    "underway using engine": 0,
    "restricted maneuverability": 3,
    "constrained by her draught": 4,
    "constrained by draft": 4,
    "engaged in fishing": 7,
    "reserved (hsc)": 9,
    "reserved (wig)": 10,
    "power-driven vessel towing astern": 11,
    "power-driven vessel pushing ahead or towing alongside": 12,
    "pushing ahead or towing alongside": 12,
    "towing": 12,
    "ais-sart is active": 14,
    "ais sart": 14,
    "ais-sart / mob / epirb active": 14,
    "undefined": 15,
    "not defined (default)": 15,
  }).map(([label, code]) => [normalizeStatusLabel(label), code]),
]);

/** The Vessels sidebar's filters column (the gateway and fuel dashboards' width). */
const SIDEBAR_WIDTH = 300;

/** The Vessels table's sort until the user picks one. */
const DEFAULT_VESSEL_SORT: DataTableSort = { key: "name", direction: "asc" };

/** The rail's views. */
const MARINE_VIEWS: NavRailItem[] = [
  { id: "vessels", label: "Vessels", icon: "directions_boat" },
  { id: "map", label: "Map", icon: "map" },
];

/**
 * Marine fleet dashboard — tugboats with GPS + J1939-style engine telemetry.
 *
 * The rail's pages — the Vessels table (the default) and the fleet map, the
 * view kept in the URL — with the alarms (their panel), the theme toggle and
 * Send feedback in its second group. The Vessels table has the dashboards'
 * sidebar: its search, Status and Home port filters, "Clear filters" and
 * "Customize columns" (the pick and the sort kept in the user's settings). A
 * row (or a marker) opens the vessel's detail panel: position, per-engine
 * totals and the engine metric charts; its "Details" the vessel's page.
 *
 * The map also plots ports: every Port asset (`portAssetTypes`, default
 * ["Port"]) and the Site assets (`siteAssetTypes`, default ["Site"]) whose
 * `port` server attribute (`portAttribute`) is true, at their latitude /
 * longitude server attributes — and barge loaders: devices of
 * `bargeLoaderDeviceTypes` (default ["BeltScale"]) whose `bargeScale` server
 * attribute (`bargeLoaderAttribute`) is true, at their latest latitude /
 * longitude telemetry (or server attributes). Every pin — a vessel's, a port's,
 * a barge loader's — is its profile's icon. `homeBounds` ([[S, W], [N, E]]) is the view
 * shown before any marker arrives — by default Vancouver's ports up to Texada
 * Island.
 *
 * Widget settings (all optional): `deviceTypes` (default ["Tugboat"]),
 * `keys` (partial {@link MarineKeys}) and
 * `cartoApiKey` (CARTO base maps key for the un-watermarked roadmap tiles).
 */
@Component({
  selector: "tb-marine-dashboard",
  templateUrl: "./marine-dashboard.component.html",
  styleUrls: ["./marine-dashboard.component.scss"],
  standalone: true,
  imports: [
    CommonModule,
    SharedModule,
    DataTableComponent,
    DataTableCellDirective,
    DashboardLoadingComponent,
    ToastsComponent,
    FeedbackDialogComponent,
    NavRailComponent,
    DashboardRootDirective,
    StatGridComponent,
    SegmentedControlComponent,
    EntityDetailPanelComponent,
    MetricChartCardComponent,
    FigureCardComponent,
    MapCardComponent,
    StatusPillComponent,
    TimeframePickerComponent,
    HeaderIconButtonComponent,
    AlarmListComponent,
    AlarmPanelComponent,
    StateTimelineComponent,
    CountMarkComponent,
    SidebarLayoutComponent,
    SearchBoxComponent,
    FilterSectionsComponent,
    CheckFilterComponent,
    ColumnPickerComponent,
    IconBadgeComponent,
  ],
})
export class MarineDashboardComponent implements OnInit, OnDestroy, NestedDashboard {
  @Input() ctx: WidgetContext;
  /** Opened inside the Home dashboard (one of its apps): no rail of its own, Home's theme (nested-dashboard.ts). */
  @Input() host: DashboardHost | null = null;

  // -- views (icon rail on the left; the Vessels table opens first) -----------
  readonly views = MARINE_VIEWS;
  /** Nested in the Home dashboard: its views — the menu beside its app in Home's rail. */
  static readonly nestedPages: NavRailItem[] = MARINE_VIEWS;
  view: MarineView = "vessels";
  /** The rail entry to ring: the vessel page belongs to the Vessels view. */
  get railActive(): string {
    return this.view === "vessel" ? "vessels" : this.view;
  }
  /** Nested in the Home dashboard: a view picked from the menu beside its app in Home's rail. */
  selectRailPage(id: string): void {
    this.selectView(id);
    this.cd.detectChanges();
  }
  /** The light / dark theme: the user's pick, or the system's (shared with the other dashboards). */
  theme!: DashboardTheme;
  get darkMode(): boolean {
    return !!this.theme?.dark;
  }
  mapType: MapType = "roadmap";
  /** CARTO basemaps key from the widget settings (`cartoApiKey`); "" = keyless tiles. */
  cartoApiKey = "";
  // -- vessels table ----------------------------------------------------------
  readonly vesselColumns: DataTableColumn[] = [
    { key: "name", phone: "title", header: "Vessel", iconOf: (r) => this.deviceIcon(r["profile"]) },
    { key: "status", phone: "sub", header: "Status" },
    { key: "speed", phone: "trail", phoneHeader: "Speed | Engine", header: "Speed", sortKey: "speed" },
    { key: "engineSpeed", phone: "trail", header: "Engine speed", sortKey: "engineSpeedValue" },
    { key: "load", phone: "hide", header: "Load", sortKey: "loadValue" },
    { key: "coolant", phone: "hide", header: "Coolant", sortKey: "coolantValue" },
    { key: "oilPressure", phone: "hide", header: "Oil pressure", sortKey: "oilPressureValue" },
    { key: "fuelRate", phone: "hide", header: "Fuel rate", sortKey: "fuelRateValue" },
    { key: "engineHours", phone: "hide", header: "Engine hours", align: "right", sortKey: "engineHoursValue" },
    { key: "alarmCount", phone: "sub", header: "Alarms", align: "right" },
  ];
  /** "Customize columns": the columns the user picked (every one until they pick), kept in their settings. */
  readonly vesselColumnChoice = new TableColumnChoice(this.vesselColumns, this.vesselColumns.map((c) => c.key), "marineVesselColumns");
  /** The table's sort: the user's pick, kept in their settings (by name until they pick one). */
  vesselSort: DataTableSort | null = DEFAULT_VESSEL_SORT;
  private readonly sortSettingKey = "marineVesselSort";
  /** Every vessel of the configured device types — the map and the alarms. */
  vesselsRows: VesselRow[] = [];
  /** Vessels passing the sidebar's search-free filters (Status, Home port) — the table (its search on top). */
  tableRows: VesselRow[] = [];

  // -- the Vessels sidebar (the gateway and fuel dashboards'): search, filters, "Clear filters", "Customize columns" --
  sidebarOpen = true;
  columnPickerOpen = false;
  vesselSearchTerms: string[] = [];
  vesselSearchText = "";
  vesselSearch: string[] = [];
  /** Status: the AIS statuses the vessels report (`statusId`), each counted under the other filters. */
  statusOptions: FilterListOption[] = [];
  selectedStatuses: string[] = [];
  /** Home port: the ports the vessels name — none for a vessel without one. */
  portOptions: FilterListOption[] = [];
  selectedPorts: string[] = [];
  vesselsLoading = false;
  mapLocations: MapLocation[] = [];
  /** "Show on map" in the vessel panel: switch to the map, centred on the vessel with its popup open. */
  showVesselOnMap(vessel: VesselRow): void {
    this.closeDetail();
    this.selectView("map");
    this.mapCard?.focusLocation(vessel.deviceId);
  }

  // -- detail panel -----------------------------------------------------------
  selectedVessel: VesselRow | null = null;
  detailOpen = false;
  /** Selected engine index in the panel (0 = Port / only engine). */
  selectedEngine = 0;
  /** One window shared by every chart card in the panel. */
  insightsTimeframe = "1D";
  /** Chart cards for the selected engine (rebuilt when the engine changes). */
  chartCards: { title: string; charts: MetricChartSection[] }[] = [];
  /** The same charts one per card for the details page (the card is titled by the chart). */
  pageChartCards: { title: string; charts: MetricChartSection[] }[] = [];
  detailAlarms: DashboardAlarm[] = [];
  // -- vessel details page ----------------------------------------------------
  /** The vessel's route over the page's window (latitude / longitude history), oldest first. */
  routeTracks: MapTrack[] = [];
  /** The vessel's current position — the one marker on the route map. */
  routeLocations: MapLocation[] = [];
  routeLoading = false;
  /** The time hovered on any page chart: the other charts show their axis line there, the route map the vessel's fix. */
  pageHoverTime: number | null = null;
  /** The tab the details page was opened from — where its back button returns to. */
  private pageReturnView: "vessels" | "map" = "vessels";

  /** A chart hover on the page: mirror it on the other charts and slide the vessel to where it was then. */
  onPageChartHover(ts: number | null): void {
    if (ts === this.pageHoverTime) {
      return;
    }
    this.pageHoverTime = ts;
    this.routeMap?.highlightTrackTime(ts);
  }
  /** Window of the route map and the engine charts on the page. */
  private readonly routeWindowMs: Record<string, number> = {
    "1D": 24 * 60 * 60 * 1000,
    "1W": 7 * 24 * 60 * 60 * 1000,
    "1M": 30 * 24 * 60 * 60 * 1000,
  };
  private routeRequest = 0;
  /**
   * Dashboard state of the details page (`vesselStateId`, default "vessel").
   * When the dashboard defines that state the page opens there, with the
   * vessel as the state entity; otherwise the vessel is kept in the current
   * state's params. Either way a reload lands back on the page.
   */
  private vesselStateId = "vessel";
  /**
   * `fleet` (default): the map, the table and the panels. `vessel`: this widget
   * is placed in the details-page state, so it shows only the page for the
   * state entity, scoped to that one device (no fleet loads). Picked by the
   * `mode` setting, else by being in the details-page state.
   */
  mode: "fleet" | "vessel" = "fleet";
  /** A vessel named by the dashboard state before the vessels have loaded. */
  private pendingStateVesselId: string | null = null;
  /** Set while this component itself pushes the dashboard state (its echo is ignored). */
  private pushingState = false;
  // -- alarms -----------------------------------------------------------------
  alarmsRows: DashboardAlarm[] = [];
  alarmsLoading = false;
  alarmPanelOpen = false;
  /** Alarms of the filtered vessels, named by vessel (tb-alarm-list groups them). */
  panelAlarms: DashboardAlarm[] = [];
  /** Ports: Port assets, and Site assets flagged with the `port` server attribute — slate pins. */
  portLocations: MapLocation[] = [];
  /** Barge loaders: BeltScale devices flagged with the `bargeScale` server attribute — slate pins. */
  bargeLoaderLocations: MapLocation[] = [];
  scaleRows: ScaleRow[] = [];
  /** The belt scale shown in its own detail panel (null when closed). */
  selectedScale: ScaleRow | null = null;
  scaleDetailOpen = false;
  scaleDetailAlarms: DashboardAlarm[] = [];
  /** Belt card: Speed over Rate, divided; built per scale in openScaleDetail (units from its own settings). */
  scaleCharts: MetricChartSection[] = [];
  /** Timeline colours: the shared status scale (error / warning / success tokens). */
  readonly scaleTimelineStates: StateTimelineState[] = [
    { id: "stopped", label: "Stopped", color: "var(--c-bg-error-normal)" },
    { id: "blackBelt", label: "Black belt", color: "var(--c-bg-warning-normal)" },
    { id: "producing", label: "Producing", color: "var(--c-bg-success-normal)" },
  ];
  /**
   * First-render gate: the markers are published once every source has
   * answered its first query (or the grace timer fires), so boats, ports and
   * loaders appear together and the initial fit covers all of them. The full
   * vessel query carries dozens of engine keys and is the slow one, so a light
   * positions-only query stands in for it until it lands.
   */
  private mapSourcesReady = { vessels: false, ports: false, loaders: false };
  private mapGateOpen = false;
  private mapGateTimer?: any;
  /** Vessel markers from the quick positions query (name + position only). */
  private vesselPreview: MapLocation[] = [];
  vesselsLoadedOnce = false;
  /** Home area of the map: the view before any marker arrives (Vancouver ports to Texada Island). */
  homeBounds: MapBounds = [
    [49.0, -125.0],
    [49.85, -122.6],
  ];
  private readonly mapSettingKey = "marineMapType";
  @ViewChild("mapCard") private mapCard?: MapCardComponent;
  /** The details page's route map (present while the page is shown). */
  @ViewChild("routeMap") private routeMap?: MapCardComponent;
  private alarmCounts = new Map<string, number>();
  private alarmFlags = new Map<string, { coolant: boolean; oil: boolean }>();
  private keys: MarineKeys = DEFAULT_KEYS;
  private deviceTypes = ["Tugboat"];
  private siteAssetTypes = ["Site"];
  /** Asset types that are ports outright, without needing the `port` attribute. */
  private portAssetTypes = ["Port"];
  /** Device types of the barge loaders plotted on the map. */
  private bargeLoaderDeviceTypes = ["BeltScale"];
  private bargeLoaderAttribute = "bargeScale";
  private portAttribute = "port";
  private alarmService: AlarmService;
  private alarmsSubscription: any;
  private vesselsSubscription: any;
  private sitesSubscription: any;
  private bargeLoadersSubscription: any;
  private vesselsRefreshTimer?: any;
  private clockTimer?: any;
  /** Every device and asset profile's icon (the widget's; Home's, nested) — set in ngOnInit. */
  private icons!: ProfileIcons;
  /** Each map pin's entity (a vessel, a port, a scale) by its profile: the pin is that profile's icon. */
  private readonly pinProfiles = new Map<string, { kind: ProfileKind; profile: string }>();

  constructor(private cd: ChangeDetectorRef, private destroyRef: DestroyRef) {}

  /** A device's icon: its profile's (its `type` names it) — the devices' default until it's known. */
  deviceIcon(profile: string | null | undefined): string {
    return this.icons.of("device", profile);
  }

  /** The vessels' icon before a vessel is known (its details page loading, a map pin's fallback): the first vessel profile's. */
  get vesselsIcon(): string {
    return this.deviceIcon(this.deviceTypes[0]);
  }

  /** The rail's second group: the alarms (their count), then at its foot the theme toggle and Send feedback. */
  get railBottomItems(): NavRailItem[] {
    return dashboardRailItems(this.darkMode, this.activeAlarmCount, { themeToggle: isTenantAdmin(this.ctx) });
  }

  /** Map control stack: reposition the sites' and scales' pins (the alarms are the rail's). */
  get mapControls(): MapControl[] {
    return [
      { id: "reposition", icon: "edit_location_alt", tooltip: this.repositionMode ? "Done repositioning" : "Reposition sites and scales", active: this.repositionMode },
    ];
  }

  /** Reposition mode: site and scale pins can be dragged; a drop saves their latitude / longitude attributes. */
  repositionMode = false;
  /** Entity type behind each fixed marker id, for the attribute save. */
  private fixedEntityTypes = new Map<string, EntityType>();

  get scaleDetailTabs(): SegmentOption[] {
    return [
      INSIGHTS_TAB,
      alarmsTab(this.scaleDetailAlarms),
    ];
  }

  /** Scale panel sub-label: the real device name under a label title. */
  get scaleDetailSubtitle(): string {
    const sc = this.selectedScale;
    return sc && sc.deviceName && sc.deviceName !== sc.name ? sc.deviceName : "";
  }

  scaleMeta(state: ScaleState | null): { label: string; tone: StatusPillTone; icon: string } {
    return SCALE_STATES.find((m) => m.id === state) ?? { label: "Unknown", tone: "neutral", icon: "help" };
  }

  get detailTabs(): SegmentOption[] {
    return [
      INSIGHTS_TAB,
      alarmsTab(this.detailAlarms),
    ];
  }

  // -- derived ----------------------------------------------------------------

  /** Port | Starboard pills for a multi-engine vessel (hidden for one engine). */
  get engineOptions(): SegmentOption[] {
    return (this.selectedVessel?.engines ?? []).map((e) => ({ id: String(e.index), label: e.label }));
  }

  get selectedEngineReading(): EngineReading | null {
    return this.selectedVessel?.engines[this.selectedEngine] ?? this.selectedVessel?.engines[0] ?? null;
  }

  /** The vessel panel's Position figures (the shared stat grid). */
  get positionStats(): StatItem[] {
    const v = this.selectedVessel;
    if (!v) {
      return [];
    }
    return [
      { label: "Speed over ground", info: "Speed relative to the seabed", value: this.fmt(v.speed, 1), unit: "kn" },
      { label: "Course over ground", info: "Direction of travel over the seabed", value: this.fmtHeading(v.course) },
      { label: "Heading", info: "Direction the bow points. Differs from course in current or wind", value: this.fmtHeading(v.heading) },
      { label: "Draught", info: "How deep the hull sits below the waterline at maximum load", value: this.fmt(v.draught, 1), unit: "m" },
      { label: "Latitude", value: this.fmtCoord(v.lat, "lat") },
      { label: "Longitude", value: this.fmtCoord(v.lng, "lng") },
    ];
  }

  /** The selected engine's lifetime counters (the shared stat grid). */
  get totalsStats(): StatItem[] {
    const e = this.selectedEngineReading;
    if (!e) {
      return [];
    }
    return [
      { label: "Total engine hours", value: this.fmt(e.totalEngineHours), unit: "h" },
      { label: "Total fuel used", value: this.fmt(e.totalFuelUsed), unit: "L" },
      { label: "Total idle hours", value: this.fmt(e.totalIdleHours), unit: "h" },
      { label: "Total idle fuel used", value: this.fmt(e.totalIdleFuelUsed), unit: "L" },
    ];
  }

  /** Idle share of the selected engine's hours (0–100), or null. */
  get idleShare(): number | null {
    const e = this.selectedEngineReading;
    if (!e || e.totalEngineHours == null || e.totalIdleHours == null || e.totalEngineHours <= 0) {
      return null;
    }
    return Math.round((e.totalIdleHours / e.totalEngineHours) * 100);
  }

  get activeAlarmCount(): number {
    return this.scopedAlarms.length;
  }

  /** Panel sub-label: the real device name under a label title; nothing when the title is the name itself. */
  get detailSubtitle(): string {
    const v = this.selectedVessel;
    return v && v.deviceName && v.deviceName !== v.name ? v.deviceName : "";
  }

  /** The vessels' active alarms (every vessel's: the table's filters narrow the table alone). */
  private get scopedAlarms(): DashboardAlarm[] {
    const ids = new Set(this.vesselsRows.map((r) => r.deviceId));
    return this.alarmsRows.filter((a) => ids.has(a.originatorId));
  }

  private get deviceFilter(): EntityFilter {
    const only = this.mode === "vessel" ? this.stateVesselId() : null;
    if (only) {
      return { type: AliasFilterType.entityList, entityType: EntityType.DEVICE, entityList: [only] } as EntityFilter;
    }
    return { type: AliasFilterType.deviceType, deviceTypes: this.deviceTypes, deviceNameFilter: "" };
  }

  /** Every per-engine timeseries key (all metrics × all engine suffixes). */
  private get engineTsKeys(): string[] {
    return this.keys.engineSuffixes.flatMap((s) => ENGINE_METRICS.map((m) => this.keys.engine[m] + s));
  }

  private get siteFilter(): EntityFilter {
    return { type: AliasFilterType.assetType, assetTypes: [...this.portAssetTypes, ...this.siteAssetTypes], assetNameFilter: "" } as EntityFilter;
  }

  private get bargeLoaderFilter(): EntityFilter {
    return { type: AliasFilterType.deviceType, deviceTypes: this.bargeLoaderDeviceTypes, deviceNameFilter: "" };
  }

  // -- map ------------------------------------------------------------------

  onMapControl(id: string): void {
    if (id === "reposition") {
      this.repositionMode = !this.repositionMode;
    }
  }

  /** A site / scale pin was dropped: save the new position as its server attributes. */
  onMapLocationMoved(move: MapLocationMove): void {
    const id = move.location.id;
    const entityType = id ? this.fixedEntityTypes.get(id) : undefined;
    if (!id || !entityType) {
      return;
    }
    const lat = Math.round(move.lat * 1e6) / 1e6;
    const lng = Math.round(move.lng * 1e6) / 1e6;
    this.ctx.attributeService
      .saveEntityAttributes(
        { entityType, id },
        AttributeScope.SERVER_SCOPE,
        [
          { key: this.keys.latitude, value: lat },
          { key: this.keys.longitude, value: lng },
        ],
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        // The attribute subscriptions reload the markers; move this one now so it doesn't snap back meanwhile.
        next: () => {
          this.portLocations = this.portLocations.map((l) => (l.id === id ? { ...l, lat, lng } : l));
          this.bargeLoaderLocations = this.bargeLoaderLocations.map((l) => (l.id === id ? { ...l, lat, lng } : l));
          this.scaleRows = this.scaleRows.map((r) => (r.deviceId === id ? { ...r, lat, lng } : r));
          this.updateMapLocations();
          this.cd.detectChanges();
        },
        error: () => {
          this.updateMapLocations(); // snap back to the stored position
          this.cd.detectChanges();
        },
      });
  }

  /** AIS status timeline: one state per code, coloured like its pill. */
  readonly navStatusTimelineStates: StateTimelineState[] = Object.entries(NAV_STATUS_META).map(([code, m]) => ({
    id: code,
    label: m.label,
    color: TONE_COLOR[m.tone],
  }));

  /** Timeline value → state id: the AIS code as a string, whether stored as a code or a label. */
  readonly navStatusId = (raw: NavStatus): string | null => {
    const code = this.navStatusCode(raw);
    return code == null ? null : String(code);
  };

  get navStatusKey(): string {
    return this.keys.navStatus;
  }

  /** The AIS code (0–15) behind a stored status, or null when unknown. */
  navStatusCode(status: NavStatus): number | null {
    if (status == null || status === "") {
      return null;
    }
    const code = typeof status === "number" ? status : Number(status);
    if (isFinite(code)) {
      return NAV_STATUS_META[code] ? code : null;
    }
    return NAV_STATUS_BY_LABEL[normalizeStatusLabel(String(status))] ?? null;
  }

  /** Pill for an AIS navigational status — a code or a text label; an unknown
   *  label is shown as-is (neutral), an unreported status as "No status". */
  statusMeta(status: NavStatus): StatusMeta {
    if (status == null || status === "") {
      return NAV_STATUS_UNKNOWN;
    }
    const code = typeof status === "number" ? status : Number(status);
    if (isFinite(code)) {
      return NAV_STATUS_META[code] ?? { label: `Status ${code}`, tone: "neutral", icon: "help" };
    }
    const byLabel = NAV_STATUS_BY_LABEL[normalizeStatusLabel(String(status))];
    return byLabel != null ? NAV_STATUS_META[byLabel] : { label: String(status), tone: "neutral", icon: "help" };
  }

  /**
   * The loading page while the dashboard first loads (tb-dashboard-loading) — a later reload never brings it back: the map's
   * markers (the map opened first), the vessels (the table, a vessel's page) and the alarms (the rail's count, the table's Alarms column).
   */
  private readonly firstLoad = new FirstLoad();
  get pageLoading(): boolean {
    return this.firstLoad.pending(this.view === "map" && !this.mapGateOpen, this.view !== "map" && this.vesselsLoading, this.alarmsLoading);
  }

  ngOnInit(): void {
    if (!this.host) {
      this.ctx.$scope.marineDashboardComponent = this;
    }
    this.theme =
      this.host?.theme ??
      new DashboardTheme(this.ctx, this.destroyRef, () => {
        // The `.dark` class on the DOM first: the chart re-reads the theme's tokens (getComputedStyle) after.
        this.cd.detectChanges();
        this.mapCard?.invalidateSize();
      });
    injectCss("tb-ext-material-symbols-rounded", "https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200");
    this.applySettings();
    this.alarmService = this.ctx.$injector.get(this.ctx.servicesMap.get("alarmService")) as AlarmService;
    // The profiles' icons coming in: the table's rows, the panels' headers and the map's pins show them.
    this.icons = profileIconsOf(this.ctx);
    this.icons.changes.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.updateMapLocations();
      this.cd.detectChanges();
    });
    this.loadUserPreferences();
    if (this.mode === "fleet" && this.ctx.stateController.getStateId() === this.vesselStateId) {
      this.mode = "vessel";
    }
    this.syncFromDashboardState(true);
    this.ctx.stateController
      .stateChanged()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((state) => {
        // Nested: only a state naming its app (another app's is Home's to follow). The change's own state string: the controller
        // reports it before taking it.
        const params = readDashboardUrlState(this.ctx, state);
        if (!this.pushingState && ownsUrlState(this.host, params)) {
          this.syncFromDashboardState(false, params); // browser back / forward, or a link into the page
          this.cd.detectChanges();
        }
      });
    this.subscribeAlarms();
    this.host?.attach(this);
    if (this.mode === "vessel") {
      // The details page only: the one device the state names, nothing fleet-wide.
      this.view = "vessel";
      this.startClock();
      this.loadVessels();
      this.subscribeVessels();
      return;
    }
    this.loadVesselPositions(); // quick: markers first
    this.loadVessels();
    this.subscribeVessels();
    this.loadSites();
    this.subscribeSites();
    this.loadBargeLoaders();
    this.subscribeBargeLoaders();
    // Grace period: whatever has loaded by then is shown, so one slow source
    // can't hold the map empty.
    this.mapGateTimer = setTimeout(() => this.openMapGate(), 2500);
  }

  ngOnDestroy(): void {
    this.host?.attach(null);
    removeSubscriptions(this.ctx, this.alarmsSubscription, this.vesselsSubscription, this.sitesSubscription, this.bargeLoadersSubscription);
    clearTimeout(this.vesselsRefreshTimer);
    clearTimeout(this.mapGateTimer);
    this.stopClock();
  }

  /** ThingsBoard hooks — data comes from our own subscriptions, so just re-render. */
  onDataUpdated(): void {
    this.ctx.detectChanges();
  }

  // -- views ------------------------------------------------------------------

  onResize(): void {
    this.mapCard?.invalidateSize();
    this.cd.detectChanges();
  }

  /** A view (the rail's, a "Show on map", the page's back button); `write`: a new entry in the URL — the URL's own move doesn't write. */
  selectView(id: string, write = true): void {
    if (id === this.view) {
      return;
    }
    if (this.view === "vessel") {
      // Leaving the details page (back button or the rail): drop its route state.
      this.routeRequest++; // a route answer still in flight is ignored
      this.routeTracks = [];
      this.routeLocations = [];
      this.routeLoading = false;
      this.stopClock();
    }
    this.view = id as MarineView;
    if (this.view === "map") {
      // The map was hidden (display:none): flush the DOM change and re-measure
      // synchronously, before the first paint, so the markers and their labels
      // don't flash at the hidden-state geometry.
      this.cd.detectChanges();
      this.mapCard?.invalidateSize();
      // Coming back to the map always shows the whole fleet again (instantly,
      // so a "Show on map" focus that follows isn't fighting an animation).
      this.mapCard?.recenter(false);
    }
    if (write && this.view !== "vessel") {
      this.writeViewState();
    }
  }

  /** The view into the URL (a reload lands on it): the map by name, the Vessels table (the default) none — nested, with its app. */
  private writeViewState(): void {
    if (this.mode !== "fleet") {
      return;
    }
    writeDashboardUrlState(this.ctx, nestedUrlParams(this.host, this.view === "map" ? { [this.tabParam]: "map" } : {}));
  }

  // -- the Vessels sidebar ----------------------------------------------------

  /** A vessel's Status option: its AIS code — "none" unreported, its own label when it's no code's. */
  private statusId(r: VesselRow): string {
    const code = this.navStatusCode(r.status);
    return code != null ? String(code) : r.status == null || r.status === "" ? "none" : `label:${r.status}`;
  }

  onStatusesChange(ids: string[]): void {
    this.selectedStatuses = ids;
    this.applyFilters();
  }

  onPortsChange(ids: string[]): void {
    this.selectedPorts = ids;
    this.applyFilters();
  }

  /** Any of the table's filters in use (the search, Status, Home port). */
  get hasVesselFilters(): boolean {
    return !!(this.vesselSearchTerms.length || this.vesselSearchText || this.selectedStatuses.length || this.selectedPorts.length);
  }

  clearVesselFilters(): void {
    this.vesselSearchTerms = [];
    this.vesselSearchText = "";
    this.vesselSearch = [];
    this.selectedStatuses = [];
    this.selectedPorts = [];
    this.applyFilters();
  }

  /** The picker is in the sidebar: on the Vessels table, while open. */
  get columnPickerShown(): boolean {
    return this.view === "vessels" && this.columnPickerOpen;
  }

  /** The sidebar's width: the filters column, plus the column picker and the gap to it while that's open. */
  get sidebarWidth(): number {
    return sidebarWidth(SIDEBAR_WIDTH, this.columnPickerShown);
  }

  /** A header click: the sort shown at once and kept in the user's settings. */
  onVesselSortChange(sort: DataTableSort | null): void {
    this.vesselSort = sort;
    saveUserSettings(this.ctx, this.destroyRef, { [this.sortSettingKey]: sort });
  }

  /** The picker's choice: shown at once and kept in the user's settings. */
  onVesselColumnsChange(keys: string[]): void {
    this.vesselColumnChoice.set(keys);
    saveUserSettings(this.ctx, this.destroyRef, this.vesselColumnChoice.settingsFor(keys));
  }

  // -- rail ---------------------------------------------------------------------

  /** The rail's second group: the alarms (their panel), the theme toggle, Send feedback. */
  onRailBottomClick(id: string): void {
    if (id === "alarms") {
      this.alarmPanelOpen = !this.alarmPanelOpen; // a second click closes it
    } else if (id === FEEDBACK_RAIL_ID) {
      feedbackOf(this.ctx).show("Marine");
    } else if (id === "theme") {
      this.toggleTheme();
    }
  }

  toggleTheme(): void {
    this.theme.toggle();
  }

  onMapTypeChange(type: MapType): void {
    this.mapType = type;
    saveUserSettings(this.ctx, this.destroyRef, { [this.mapSettingKey]: type });
  }

  // -- detail panel -----------------------------------------------------------

  /** A row opens its vessel's panel (only its close button or Escape closes it). */
  onVesselRowClick(row: Record<string, any>): void {
    this.openDetail(row as VesselRow);
  }

  openDetail(vessel: VesselRow): void {
    this.closeScaleDetail(); // one panel at a time
    this.selectedVessel = vessel;
    this.selectedEngine = 0;
    this.detailOpen = true;
    this.rebuildChartCards();
    this.applyDetailAlarms();
    this.startClock();
  }

  closeDetail(): void {
    this.detailOpen = false;
    if (this.view !== "vessel") {
      this.stopClock();
    }
  }

  // -- vessel details page ----------------------------------------------------

  /**
   * Open the full-page details of one vessel: its route history and every
   * engine chart. The vessel goes into the dashboard state too (`pushState`),
   * so the URL names it and a reload reopens the page.
   */
  openVesselPage(vessel: VesselRow, pushState = true): void {
    if (this.view === "vessels" || this.view === "map") {
      this.pageReturnView = this.view;
    }
    if (pushState && this.mode === "fleet" && this.hasVesselState) {
      // The page lives in its own dashboard state: go there, this widget stays
      // as it is. The tab goes into this state's params first, so the widget
      // that comes back here (a fresh instance) reopens on it.
      this.closeDetail();
      this.rememberTabInState();
      this.pushVesselState(vessel);
      return;
    }
    this.closeDetail();
    this.closeScaleDetail();
    this.selectedVessel = vessel;
    this.selectedEngine = 0;
    this.rebuildChartCards();
    this.applyDetailAlarms();
    this.startClock();
    this.view = "vessel";
    this.refreshRouteMarker();
    this.loadRoute();
    if (pushState) {
      this.pushVesselState(vessel);
    }
    this.cd.detectChanges();
  }

  /** Back to the tab the page was opened from (and out of the vessel state — the URL keeps that tab). */
  closeVesselPage(): void {
    if (this.mode === "fleet") {
      this.selectView(this.pageReturnView, false);
    }
    this.pushVesselState(null);
  }

  /** The URL's key for the fleet's view (the map; none — the Vessels table), kept across the details-page state too. */
  private readonly tabParam = "view";

  private rememberTabInState(): void {
    const sc = this.ctx.stateController;
    this.pushingState = true;
    try {
      sc.updateState(undefined, { ...sc.getStateParams(), [this.tabParam]: this.pageReturnView });
    } finally {
      this.pushingState = false;
    }
  }

  /** The tab the state params name (the view written into the URL, or {@link rememberTabInState}'s; an older link's `marineTab`), if any. */
  private tabFromState(params: Record<string, any> = this.ctx.stateController.getStateParams() ?? {}): "vessels" | "map" | null {
    const tab = params[this.tabParam] ?? params["marineTab"];
    return tab === "vessels" || tab === "map" ? tab : null;
  }

  // -- dashboard state --------------------------------------------------------

  /** Whether the dashboard defines the details-page state. */
  private get hasVesselState(): boolean {
    return !!(this.ctx.stateController as any)?.states?.[this.vesselStateId];
  }

  /** The vessel the dashboard state names, when it is in the vessel state or carries a device entity. */
  private stateVesselId(params: Record<string, any> = this.ctx.stateController.getStateParams() ?? {}): string | null {
    const sc = this.ctx.stateController;
    const entity = params["entityId"];
    const inVesselState = sc.getStateId() === this.vesselStateId;
    return entity?.id && (inVesselState || entity.entityType === EntityType.DEVICE) ? entity.id : null;
  }

  /** Put the vessel into the dashboard state, or take it out (`null`). */
  private pushVesselState(vessel: VesselRow | null): void {
    const sc = this.ctx.stateController;
    this.pushingState = true;
    try {
      if (vessel) {
        const params = { entityId: { entityType: EntityType.DEVICE, id: vessel.deviceId }, entityName: vessel.deviceName, entityLabel: vessel.name };
        if (this.hasVesselState && sc.getStateId() !== this.vesselStateId) {
          sc.openState(this.vesselStateId, params);
        } else {
          sc.updateState(undefined, { ...sc.getStateParams(), ...params });
        }
      } else if (sc.getStateId() === this.vesselStateId) {
        if (sc.getStateIndex() > 0) {
          sc.navigatePrevState(sc.getStateIndex() - 1);
        } else {
          const states = (sc as any).states ?? {};
          const root = Object.keys(states).find((id) => states[id].root) ?? Object.keys(states)[0];
          if (root && root !== this.vesselStateId) {
            sc.openState(root);
          }
        }
      } else {
        const { entityId, entityName, entityLabel, ...rest } = sc.getStateParams() ?? {};
        if (entityId || entityName || entityLabel) {
          sc.updateState(undefined, rest);
        }
      }
    } finally {
      this.pushingState = false;
    }
  }

  /** Open (or leave) the details page — and show the view — to match the dashboard state (a change's own params). */
  private syncFromDashboardState(initial = false, params?: Record<string, any>): void {
    const id = this.stateVesselId(params);
    if (!id) {
      this.pendingStateVesselId = null;
      if (this.mode === "fleet") {
        const tab = this.tabFromState(params);
        if (this.view === "vessel") {
          this.selectView(tab ?? this.pageReturnView, false); // back out of the page (browser back)
        } else if (initial) {
          this.view = tab ?? this.view; // a reload, or a fresh widget after the details-page state: on the view the URL names
        } else {
          this.selectView(tab ?? "vessels", false); // Back / Forward between the views
        }
      }
      return;
    }
    if (this.view === "vessel" && this.selectedVessel?.deviceId === id) {
      return;
    }
    if (this.mode === "fleet" && this.hasVesselState) {
      return; // the details-page state has its own widget for it
    }
    this.pendingStateVesselId = id;
    this.openPendingStateVessel();
  }

  /** The page for the vessel the state names, once the vessels are loaded. */
  private openPendingStateVessel(): void {
    const id = this.pendingStateVesselId;
    if (!id || !this.vesselsLoadedOnce) {
      return;
    }
    const vessel = this.vesselsRows.find((r) => r.deviceId === id);
    this.pendingStateVesselId = null;
    if (vessel) {
      this.openVesselPage(vessel, false);
    }
  }

  /** The page's picker: one window for the route and the charts. */
  onPageTimeframe(tf: string): void {
    if (tf === this.insightsTimeframe) {
      return;
    }
    this.insightsTimeframe = tf;
    this.loadRoute();
  }

  /**
   * The route: latitude / longitude history over the window, read once per
   * window (the live marker shows where the vessel is now). Points are paired
   * by timestamp — the AIS bridge writes both keys in one message.
   */
  private loadRoute(): void {
    const vessel = this.selectedVessel;
    if (!vessel) {
      return;
    }
    const request = ++this.routeRequest;
    const end = Date.now();
    const start = end - (this.routeWindowMs[this.insightsTimeframe] ?? this.routeWindowMs["1D"]);
    const k = this.keys;
    this.routeLoading = true;
    this.ctx.http
      .get<Record<string, { ts: number; value: any }[]>>(`/api/plugins/telemetry/DEVICE/${vessel.deviceId}/values/timeseries`, {
        params: {
          keys: [k.latitude, k.longitude, k.heading, k.speed, k.course, k.navStatus].join(","),
          startTs: String(start),
          endTs: String(end),
          limit: "50000",
          agg: "NONE",
          orderBy: "ASC",
        },
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          if (request !== this.routeRequest) {
            return;
          }
          const byTs = (key: string) => new Map((data[key] ?? []).map((p) => [p.ts, p.value]));
          const lngByTs = byTs(k.longitude);
          const headingByTs = byTs(k.heading);
          const speedByTs = byTs(k.speed);
          const courseByTs = byTs(k.course);
          const statusByTs = byTs(k.navStatus);
          const points: [number, number][] = [];
          const times: number[] = [];
          const headings: (number | null)[] = [];
          const samples: MapTrackSample[] = [];
          for (const p of data[k.latitude] ?? []) {
            const lat = parseNumber(p.value);
            const lng = parseNumber(lngByTs.get(p.ts));
            if (lat != null && lng != null) {
              points.push([lat, lng]);
              times.push(p.ts);
              const h = parseNumber(headingByTs.get(p.ts));
              const heading = h != null && h >= 0 && h < 360 ? h : null; // AIS 511 = not available
              headings.push(heading);
              samples.push(
                this.routeSample(parseNumber(speedByTs.get(p.ts)), parseNumber(courseByTs.get(p.ts)), heading, this.toNavStatus(statusByTs.get(p.ts))),
              );
            }
          }
          const keep = this.thinRouteIndices(points.length);
          this.routeTracks =
            points.length > 1
              ? [
                  {
                    id: vessel.deviceId,
                    points: keep.map((i) => points[i]),
                    times: keep.map((i) => times[i]),
                    headings: keep.map((i) => headings[i]),
                    samples: keep.map((i) => samples[i]),
                  },
                ]
              : [];
          this.routeLoading = false;
          this.cd.detectChanges();
        },
        error: () => {
          if (request === this.routeRequest) {
            this.routeTracks = [];
            this.routeLoading = false;
            this.cd.detectChanges();
          }
        },
      });
  }

  /** The popup content for one fix of the route: the readings and the AIS status then. */
  private routeSample(speed: number | null, course: number | null, heading: number | null, status: NavStatus): MapTrackSample {
    const meta = this.statusMeta(status);
    return {
      status: { label: meta.label, tone: meta.tone, icon: meta.icon },
      details: [
        { label: "Speed", value: speed != null ? `${this.fmt(speed, 1)} kn` : "—" },
        { label: "Course", value: course != null ? `${Math.round(course)}°` : "—" },
        { label: "Heading", value: heading != null ? `${Math.round(heading)}°` : "—" },
      ],
    };
  }

  /** Keep a month of one-a-minute fixes drawable: the indices of at most ~4000 points, evenly thinned (ends kept). */
  private thinRouteIndices(count: number): number[] {
    const max = 4000;
    if (count <= max) {
      return Array.from({ length: count }, (_, i) => i);
    }
    const step = count / max;
    const out: number[] = [];
    for (let i = 0; i < count; i += step) {
      out.push(Math.floor(i));
    }
    if (out[out.length - 1] !== count - 1) {
      out.push(count - 1);
    }
    return out;
  }

  /** The route map's marker: the selected vessel where it is now (restyled in place on every update). */
  private refreshRouteMarker(): void {
    if (this.view !== "vessel" || !this.selectedVessel) {
      return;
    }
    const r = this.selectedVessel;
    if (r.lat == null || r.lng == null) {
      this.routeLocations = [];
      return;
    }
    const meta = this.statusMeta(r.status);
    const loc: MapLocation = {
      id: r.deviceId,
      name: r.name,
      lat: r.lat,
      lng: r.lng,
      headingArrow: true, // a dot with an arrow turned to the heading, at the end of the route
      status: { label: meta.label, tone: meta.tone, icon: meta.icon },
      heading: r.heading ?? undefined,
      details: [
        { label: "Speed", value: r.speed != null ? `${this.fmt(r.speed, 1)} kn` : "—" },
        { label: "Course", value: r.course != null ? `${Math.round(r.course)}°` : "—" },
      ],
      subtitle: `Updated ${this.relativeTime(r.lastSeen)}`,
    };
    const prev = this.routeLocations[0];
    if (!prev || prev.lat !== loc.lat || prev.lng !== loc.lng || prev.heading !== loc.heading || prev.status?.label !== loc.status?.label || prev.subtitle !== loc.subtitle || prev.details?.[0].value !== loc.details?.[0].value) {
      this.routeLocations = [loc];
      // A fresh fix extends the drawn route without re-reading the history.
      const track = this.routeTracks[0];
      const last = track?.points[track.points.length - 1];
      if (track && last && (last[0] !== loc.lat || last[1] !== loc.lng)) {
        this.routeTracks = [
          {
            ...track,
            points: [...track.points, [loc.lat, loc.lng]],
            times: track.times ? [...track.times, r.lastSeen ?? Date.now()] : undefined,
            headings: track.headings ? [...track.headings, r.heading ?? null] : undefined,
            samples: track.samples ? [...track.samples, this.routeSample(r.speed, r.course, r.heading, r.status)] : undefined,
          },
        ];
      }
    }
  }

  onDetailAfterClosed(): void {
    if (this.view === "vessel") {
      return; // the panel closed to make way for the details page, which keeps the vessel
    }
    this.selectedVessel = null;
    this.detailAlarms = [];
  }

  openScaleDetail(scale: ScaleRow): void {
    this.closeDetail();
    this.selectedScale = scale;
    this.scaleCharts = [
      { chartTitle: "Speed", unit: scale.speedUnit, fill: true, showLegend: false, keys: [{ name: "beltSpeed", fallbackName: "speed", label: "Speed", color: "var(--c-chart-1)" }] },
      { chartTitle: "Rate", unit: scale.rateUnit, fill: true, showLegend: false, keys: [{ name: "rate", label: "Rate", color: "var(--c-chart-2)" }] },
    ];
    this.scaleDetailOpen = true;
    this.applyDetailAlarms();
    this.startClock();
  }

  closeScaleDetail(): void {
    if (this.scaleDetailOpen) {
      this.scaleDetailOpen = false;
      this.stopClock();
    }
  }

  onScaleDetailAfterClosed(): void {
    this.selectedScale = null;
    this.scaleDetailAlarms = [];
  }

  selectEngine(id: string): void {
    this.selectedEngine = Number(id) || 0;
    this.rebuildChartCards();
  }

  clearAlarm(alarm: { id: string; cleared: boolean }): void {
    clearDashboardAlarm(this.alarmService, this.destroyRef, alarm);
  }

  // -- formatting helpers (templates) -----------------------------------------

  /** "1,480" / "84.5" with thousands separators, or "—" (the shared helper). */
  readonly fmt = fmtNumber;

  /** 33°58.2′ S style coordinate. */
  fmtCoord(value: number | null, axis: "lat" | "lng"): string {
    if (value == null) {
      return "—";
    }
    const abs = Math.abs(value);
    const deg = Math.floor(abs);
    const min = ((abs - deg) * 60).toFixed(1);
    const hemi = axis === "lat" ? (value < 0 ? "S" : "N") : value < 0 ? "W" : "E";
    return `${deg}°${min}′ ${hemi}`;
  }

  /** "214° SW" compass heading. */
  fmtHeading(value: number | null): string {
    return value == null ? "—" : `${Math.round(value)}° ${this.compassPoint(value)}`;
  }

  /** Nearest of the eight compass points ("SW") for a heading in degrees. */
  compassPoint(value: number): string {
    const points = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    return points[Math.round((((value % 360) + 360) % 360) / 45) % 8];
  }

  /** "5m ago" — the shared wording (the template's "Updated …" lines). */
  readonly relativeTime = relativeTime;

  // -- data: vessels ----------------------------------------------------------

  loadVessels(): void {
    this.vesselsLoading = true;
    const k = this.keys;
    const query: EntityDataQuery = {
      entityFilter: this.deviceFilter,
      pageLink: byNamePageLink(),
      entityFields: [
        { type: EntityKeyType.ENTITY_FIELD, key: "name" },
        { type: EntityKeyType.ENTITY_FIELD, key: "label" },
        { type: EntityKeyType.ENTITY_FIELD, key: "type" },
      ],
      latestValues: [
        ...[k.latitude, k.longitude, k.speed, k.course, k.heading, k.navStatus, k.atd, ...this.engineTsKeys].map((key) => ({ type: EntityKeyType.TIME_SERIES, key })),
        ...[k.callSign, k.homePort, k.engineCount].map((key) => ({ type: EntityKeyType.SERVER_ATTRIBUTE, key })),
        ...[k.draught, k.destination, k.eta].map((key) => ({ type: EntityKeyType.CLIENT_ATTRIBUTE, key })),
      ],
    };

    this.ctx.entityService
      .findEntityDataByQuery(query, QUIET_REQUEST)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this.vesselsRows = page.data.map((d) => this.toVesselRow(d)).sort((a, b) => a.name.localeCompare(b.name));
          this.vesselsLoading = false;
          this.vesselsLoadedOnce = true;
          this.sourceReady("vessels");
          this.refreshSelectedVessel();
          this.applyFilters();
          this.openPendingStateVessel();
          this.cd.detectChanges();
        },
        error: () => {
          this.vesselsLoading = false;
          this.sourceReady("vessels");
          this.cd.detectChanges();
        },
      });
  }

  onMapLocationAction(loc: MapLocation): void {
    const vessel = this.vesselsRows.find((r) => r.deviceId === loc.id);
    if (vessel) {
      this.openDetail(vessel);
      return;
    }
    const scale = this.scaleRows.find((r) => r.deviceId === loc.id);
    if (scale) {
      this.openScaleDetail(scale);
    }
  }

  private applySettings(): void {
    const s = dashboardWidgetSettings<Record<string, unknown>>(this.ctx, this.host) as {
      deviceTypes?: string[];
      siteAssetTypes?: string[];
      portAssetTypes?: string[];
      bargeLoaderDeviceTypes?: string[];
      bargeLoaderAttribute?: string;
      portAttribute?: string;
      homeBounds?: MapBounds;
      keys?: Partial<MarineKeys>;
      cartoApiKey?: string;
      vesselStateId?: string;
      mode?: "fleet" | "vessel";
    };
    if (typeof s.cartoApiKey === "string") {
      this.cartoApiKey = s.cartoApiKey.trim();
    }
    if (typeof s.vesselStateId === "string" && s.vesselStateId.trim()) {
      this.vesselStateId = s.vesselStateId.trim();
    }
    if (s.mode === "fleet" || s.mode === "vessel") {
      this.mode = s.mode;
    }
    if (Array.isArray(s.deviceTypes) && s.deviceTypes.length) {
      this.deviceTypes = s.deviceTypes;
    }
    if (Array.isArray(s.siteAssetTypes) && s.siteAssetTypes.length) {
      this.siteAssetTypes = s.siteAssetTypes;
    }
    if (Array.isArray(s.portAssetTypes)) {
      this.portAssetTypes = s.portAssetTypes;
    }
    if (Array.isArray(s.bargeLoaderDeviceTypes) && s.bargeLoaderDeviceTypes.length) {
      this.bargeLoaderDeviceTypes = s.bargeLoaderDeviceTypes;
    }
    if (typeof s.bargeLoaderAttribute === "string" && s.bargeLoaderAttribute.trim()) {
      this.bargeLoaderAttribute = s.bargeLoaderAttribute.trim();
    }
    if (typeof s.portAttribute === "string" && s.portAttribute.trim()) {
      this.portAttribute = s.portAttribute.trim();
    }
    if (Array.isArray(s.homeBounds) && s.homeBounds.length === 2 && s.homeBounds.every((p) => Array.isArray(p) && p.length === 2 && p.every((n) => isFinite(n)))) {
      this.homeBounds = s.homeBounds;
    }
    if (s.keys) {
      this.keys = { ...DEFAULT_KEYS, ...s.keys, engine: { ...DEFAULT_KEYS.engine, ...(s.keys.engine ?? {}) } };
    }
  }

  private toVesselRow(d: any): VesselRow {
    const k = this.keys;
    const fields = d.latest?.[EntityKeyType.ENTITY_FIELD] ?? {};
    const ts = d.latest?.[EntityKeyType.TIME_SERIES] ?? {};
    const attrs = d.latest?.[EntityKeyType.SERVER_ATTRIBUTE] ?? {};
    const clientAttrs = d.latest?.[EntityKeyType.CLIENT_ATTRIBUTE] ?? {};
    const deviceId: string = d.entityId.id;
    const name = fields["name"]?.value ?? "";
    const label = fields["label"]?.value ?? "";
    const engineCount = Math.max(1, Math.min(k.engineSuffixes.length, Number(attrs[k.engineCount]?.value) || 1));

    const engines: EngineReading[] = [];
    for (let i = 0; i < engineCount; i++) {
      const suffix = k.engineSuffixes[i] ?? "";
      const reading = { index: i, label: engineCount > 1 ? ENGINE_LABELS[i] ?? `Engine ${i + 1}` : "Engine", ts: null } as EngineReading;
      for (const m of ENGINE_METRICS) {
        const point = ts[k.engine[m] + suffix];
        reading[m] = parseNumber(point?.value);
        if (point?.ts && (reading.ts == null || point.ts > reading.ts)) {
          reading.ts = point.ts;
        }
      }
      engines.push(reading);
    }

    const speed = parseNumber(ts[k.speed]?.value);
    const lastSeen = [ts[k.speed]?.ts, ts[k.latitude]?.ts, ...engines.map((e) => e.ts)].filter((t): t is number => !!t).reduce((a, b) => Math.max(a, b), 0) || null;
    const maxOf = (m: EngineMetric) =>
      engines
        .map((e) => e[m])
        .filter((v): v is number => v != null)
        .reduce((a, b) => Math.max(a, b), -Infinity);
    const sortValue = (m: EngineMetric) => (engines.some((e) => e[m] != null) ? maxOf(m) : null);
    const flags = this.alarmFlags.get(deviceId);

    return {
      deviceId,
      name: label || name || "Unknown vessel",
      deviceName: name,
      profile: fields["type"]?.value ?? "",
      callSign: attrs[k.callSign]?.value ?? "",
      homePort: attrs[k.homePort]?.value ?? "",
      engineCount,
      engines,
      status: this.toNavStatus(ts[k.navStatus]?.value),
      speed,
      course: parseNumber(ts[k.course]?.value),
      heading: parseNumber(ts[k.heading]?.value),
      lat: parseNumber(ts[k.latitude]?.value),
      lng: parseNumber(ts[k.longitude]?.value),
      draught: parseNumber(clientAttrs[k.draught]?.value) || null, // AIS sends 0 for "not available"
      destination: String(clientAttrs[k.destination]?.value ?? "").trim(),
      eta: this.parseAisEta(clientAttrs[k.eta]?.value),
      atd: this.parseLocalDateTime(ts[k.atd]?.value),
      lastSeen,
      alarmCount: this.alarmCounts.get(deviceId) ?? 0,
      coolantAlarm: flags?.coolant ?? false,
      oilPressureAlarm: flags?.oil ?? false,
      engineSpeedValue: sortValue("engineSpeed"),
      loadValue: sortValue("percentLoad"),
      coolantValue: sortValue("coolantTemperature"),
      oilPressureValue: sortValue("engineOilPressure"),
      fuelRateValue: engines.reduce((sum, e) => sum + (e.fuelRate ?? 0), 0) || sortValue("fuelRate"),
      engineHoursValue: sortValue("totalEngineHours"),
    };
  }

  /**
   * The table's rows under the sidebar's Status and Home port (the search is the table's own), each filter's options counted
   * under the other filters; the map's markers (every vessel). A vessel gone from the fleet leaves its page.
   */
  private applyFilters(): void {
    const statuses = new Set(this.selectedStatuses);
    const ports = new Set(this.selectedPorts);
    const byStatus = (r: VesselRow) => !statuses.size || statuses.has(this.statusId(r));
    const byPort = (r: VesselRow) => !ports.size || ports.has(r.homePort);
    const filters = [byStatus, byPort];
    // Passes every filter — or every one but the given, for that filter's own counts.
    const passes = (r: VesselRow, except?: (r: VesselRow) => boolean) => filters.every((f) => f === except || f(r));
    this.tableRows = this.vesselsRows.filter((r) => passes(r));
    // Status: the statuses the vessels report, in the AIS codes' order (an unreported status, then labels of no code, last).
    const forStatus = this.vesselsRows.filter((r) => passes(r, byStatus));
    const statusIds = [...new Set(this.vesselsRows.map((r) => this.statusId(r)))];
    const rank = (id: string) => (/^\d+$/.test(id) ? Number(id) : id === "none" ? 100 : 101);
    statusIds.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
    this.statusOptions = statusIds.map((id) => {
      const sample = this.vesselsRows.find((r) => this.statusId(r) === id);
      return { id, label: this.statusMeta(sample?.status ?? null).label, count: forStatus.filter((r) => this.statusId(r) === id).length };
    });
    // Home port: the ports the vessels name (a vessel without one, in none).
    const forPort = this.vesselsRows.filter((r) => passes(r, byPort));
    const portNames = [...new Set(this.vesselsRows.map((r) => r.homePort).filter((p) => !!p))].sort((a, b) => a.localeCompare(b));
    this.portOptions = portNames.map((p) => ({ id: p, label: p, count: forPort.filter((r) => r.homePort === p).length }));
    this.updateMapLocations();

    const fleet = new Set(this.vesselsRows.map((r) => r.deviceId));
    if (this.detailOpen && this.selectedVessel && !fleet.has(this.selectedVessel.deviceId)) {
      this.closeDetail();
    }
    if (this.mode === "fleet" && this.view === "vessel" && this.selectedVessel && !fleet.has(this.selectedVessel.deviceId)) {
      this.closeVesselPage();
    }
    this.applyAlarmFilter();
  }

  /** Markers: every vessel (brand pins) plus every port and barge loader (slate pins) — each its profile's icon. */
  private updateMapLocations(): void {
    const vessels: MapLocation[] = this.vesselsRows
      .filter((r) => r.lat != null && r.lng != null)
      .map((r) => {
        const meta = this.statusMeta(r.status);
        return {
          id: r.deviceId,
          name: r.name,
          lat: r.lat as number,
          lng: r.lng as number,
          icon: this.deviceIcon(r.profile),
          status: { label: meta.label, tone: meta.tone, icon: meta.icon },
          heading: r.heading ?? undefined, // the compass in the popup's corner
          trip: r.destination ? this.tripFor(r) : undefined,
          details: [
            { label: "Speed", value: r.speed != null ? `${this.fmt(r.speed, 1)} kn` : "—" },
            { label: "Course", value: r.course != null ? `${Math.round(r.course)}°` : "—" },
            { label: "Draught", value: r.draught != null ? `${this.fmt(r.draught, 1)} m` : "—" },
            { label: "Engine", value: r.engineSpeedValue != null ? `${this.fmt(r.engineSpeedValue)} rpm` : "—" },
            { label: "Alarms", value: String(r.alarmCount) },
          ],
          subtitle: `Updated ${this.relativeTime(r.lastSeen)}`,
        };
      });
    // Until the full vessel query has answered once, the quick positions stand in.
    const boats = this.vesselsLoadedOnce ? vessels : this.vesselPreview;
    if (!this.mapGateOpen) {
      return; // published by openMapGate() once every source has answered
    }
    this.setMapLocations([...boats, ...this.portLocations, ...this.bargeLoaderLocations].map((l) => this.withProfileIcon(l)));
  }

  /** A pin with its entity's profile icon, as known now (the icons coming in publish the pins again). */
  private withProfileIcon(loc: MapLocation): MapLocation {
    const pin = loc.id ? this.pinProfiles.get(loc.id) : undefined;
    return pin ? { ...loc, icon: this.icons.of(pin.kind, pin.profile) } : loc;
  }

  /** A map source answered its first query; open the gate once all have. */
  private sourceReady(source: keyof typeof this.mapSourcesReady): void {
    this.mapSourcesReady[source] = true;
    if (Object.values(this.mapSourcesReady).every(Boolean)) {
      this.openMapGate();
    }
  }

  private openMapGate(): void {
    if (this.mapGateOpen) {
      return;
    }
    clearTimeout(this.mapGateTimer);
    this.mapGateOpen = true;
    this.updateMapLocations();
    this.cd.detectChanges();
  }

  /** Quick first pass for the map: just name, profile + latest position of every vessel. */
  private loadVesselPositions(): void {
    const k = this.keys;
    const query: EntityDataQuery = {
      entityFilter: this.deviceFilter,
      pageLink: byNamePageLink(),
      entityFields: [
        { type: EntityKeyType.ENTITY_FIELD, key: "name" },
        { type: EntityKeyType.ENTITY_FIELD, key: "label" },
        { type: EntityKeyType.ENTITY_FIELD, key: "type" },
      ],
      latestValues: [k.latitude, k.longitude].map((key) => ({ type: EntityKeyType.TIME_SERIES, key })),
    };
    this.ctx.entityService
      .findEntityDataByQuery(query, QUIET_REQUEST)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          if (this.vesselsLoadedOnce) {
            return; // the full rows are already in
          }
          this.vesselPreview = page.data
            .map((d) => {
              const fields = d.latest?.[EntityKeyType.ENTITY_FIELD] ?? {};
              const ts = d.latest?.[EntityKeyType.TIME_SERIES] ?? {};
              const id = d.entityId.id as string;
              this.pinProfiles.set(id, { kind: "device", profile: fields["type"]?.value ?? "" });
              return {
                id,
                name: fields["label"]?.value || fields["name"]?.value || "Unknown vessel",
                lat: parseNumber(ts[k.latitude]?.value),
                lng: parseNumber(ts[k.longitude]?.value),
              };
            })
            .filter((v) => v.lat != null && v.lng != null)
            // The pin's icon: its profile's, put on as the pins are published (withProfileIcon).
            .map((v) => ({ id: v.id, name: v.name, lat: v.lat as number, lng: v.lng as number }));
          this.sourceReady("vessels");
          this.updateMapLocations();
          this.cd.detectChanges();
        },
        error: () => this.sourceReady("vessels"),
      });
  }

  /** Replace the markers only when a position, status or popup value changed (not on every reload). */
  private setMapLocations(locs: MapLocation[]): void {
    const key = (a: MapLocation[]) =>
      a
        .map((l) => `${l.kind ?? ""}:${l.icon ?? ""}:${l.name}:${l.lat}:${l.lng}:${l.status?.label ?? ""}:${l.heading ?? ""}:${(l.details ?? []).map((d) => d.value).join(",")}:${l.trip ? `${l.trip.to}|${l.trip.progress}|${l.trip.eta ?? ""}` : ""}`)
        .sort()
        .join("|");
    if (key(locs) !== key(this.mapLocations)) {
      this.mapLocations = locs;
    }
  }

  // -- data: ports (Site assets) ----------------------------------------------

  /** Port assets, plus Site assets whose `port` server attribute is true, placed by their latitude / longitude attributes. */
  private loadSites(): void {
    const query: EntityDataQuery = {
      entityFilter: this.siteFilter,
      pageLink: byNamePageLink(),
      entityFields: [
        { type: EntityKeyType.ENTITY_FIELD, key: "name" },
        { type: EntityKeyType.ENTITY_FIELD, key: "label" },
        { type: EntityKeyType.ENTITY_FIELD, key: "type" },
      ],
      latestValues: [
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: this.keys.latitude },
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: this.keys.longitude },
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: this.portAttribute },
      ],
    };
    this.ctx.entityService
      .findEntityDataByQuery(query, QUIET_REQUEST)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this.portLocations = page.data
            .map((d) => {
              const fields = d.latest?.[EntityKeyType.ENTITY_FIELD] ?? {};
              const attrs = d.latest?.[EntityKeyType.SERVER_ATTRIBUTE] ?? {};
              return {
                id: d.entityId.id as string,
                name: fields["label"]?.value || fields["name"]?.value || "Port",
                profile: String(fields["type"]?.value ?? ""),
                lat: parseNumber(attrs[this.keys.latitude]?.value),
                lng: parseNumber(attrs[this.keys.longitude]?.value),
                isPort: this.portAssetTypes.includes(fields["type"]?.value) || String(attrs[this.portAttribute]?.value) === "true",
              };
            })
            .filter((p) => p.isPort && p.lat != null && p.lng != null)
            .map((p) => {
              // The pin's icon: the asset's profile's (a Port's, a Site's), put on as the pins are published (withProfileIcon).
              this.pinProfiles.set(p.id, { kind: "asset", profile: p.profile });
              return { id: p.id, name: p.name, lat: p.lat as number, lng: p.lng as number, kind: "neutral" as const, draggable: true };
            });
          for (const p of this.portLocations) {
            this.fixedEntityTypes.set(p.id as string, EntityType.ASSET);
          }
          this.sourceReady("ports");
          this.updateMapLocations();
          this.cd.detectChanges();
        },
        error: () => this.sourceReady("ports"),
      });
  }

  // -- data: barge loaders (BeltScale devices) ---------------------------------

  /** BeltScale devices whose `bargeScale` server attribute is true, placed by
   *  their latest latitude / longitude (telemetry, else server attributes). */
  private loadBargeLoaders(): void {
    const query: EntityDataQuery = {
      entityFilter: this.bargeLoaderFilter,
      pageLink: byNamePageLink(),
      entityFields: [
        { type: EntityKeyType.ENTITY_FIELD, key: "name" },
        { type: EntityKeyType.ENTITY_FIELD, key: "label" },
        { type: EntityKeyType.ENTITY_FIELD, key: "type" },
      ],
      latestValues: [
        ...[this.keys.latitude, this.keys.longitude, ...SCALE_TS_KEYS].map((key) => ({ type: EntityKeyType.TIME_SERIES, key })),
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: this.keys.latitude },
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: this.keys.longitude },
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: this.bargeLoaderAttribute },
      ],
    };
    this.ctx.entityService
      .findEntityDataByQuery(query, QUIET_REQUEST)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this.scaleRows = page.data
            .map((d) => {
              const fields = d.latest?.[EntityKeyType.ENTITY_FIELD] ?? {};
              const ts = d.latest?.[EntityKeyType.TIME_SERIES] ?? {};
              const attrs = d.latest?.[EntityKeyType.SERVER_ATTRIBUTE] ?? {};
              const name = fields["name"]?.value ?? "";
              const rawState = String(ts["state"]?.value ?? "");
              const weightUnit = String(ts["weightUnit"]?.value || "t");
              const rateUnit = String(ts["rateUnit"]?.value || "hr");
              const imperial = String(ts["distanceUnit"]?.value || "").toLowerCase().startsWith("imp");
              const stamps = SCALE_TS_KEYS.map((k) => ts[k]?.ts).filter((t): t is number => !!t);
              return {
                deviceId: d.entityId.id as string,
                name: fields["label"]?.value || name || "Barge loader",
                deviceName: name,
                profile: String(fields["type"]?.value ?? ""),
                lat: parseNumber(ts[this.keys.latitude]?.value) ?? parseNumber(attrs[this.keys.latitude]?.value),
                lng: parseNumber(ts[this.keys.longitude]?.value) ?? parseNumber(attrs[this.keys.longitude]?.value),
                state: (SCALE_STATES.some((m) => m.id === rawState) ? rawState : null) as ScaleState | null,
                rate: parseNumber(ts["rate"]?.value),
                rateUnit: `${weightUnit}/${rateUnit}`,
                speedUnit: imperial ? "ft/min" : "m/s",
                // Some scales report the belt speed under `speed`.
                beltSpeed: parseNumber(ts["beltSpeed"]?.value) ?? parseNumber(ts["speed"]?.value),
                lastSeen: stamps.length ? Math.max(...stamps) : null,
                isLoader: String(attrs[this.bargeLoaderAttribute]?.value) === "true",
              };
            })
            .filter((p) => p.isLoader && p.lat != null && p.lng != null)
            .map((p): ScaleRow => ({
              deviceId: p.deviceId,
              name: p.name,
              deviceName: p.deviceName,
              profile: p.profile,
              lat: p.lat as number,
              lng: p.lng as number,
              state: p.state,
              rate: p.rate,
              rateUnit: p.rateUnit,
              beltSpeed: p.beltSpeed,
              speedUnit: p.speedUnit,
              lastSeen: p.lastSeen,
            }));
          for (const r of this.scaleRows) {
            this.fixedEntityTypes.set(r.deviceId, EntityType.DEVICE);
          }
          this.bargeLoaderLocations = this.scaleRows.map((r) => {
            const meta = this.scaleMeta(r.state);
            // The pin's icon: the scale's profile's, put on as the pins are published (withProfileIcon).
            this.pinProfiles.set(r.deviceId, { kind: "device", profile: r.profile });
            return {
              id: r.deviceId,
              name: r.name,
              lat: r.lat,
              lng: r.lng,
              draggable: true,
              kind: "neutral" as const,
              status: { label: meta.label, tone: meta.tone, icon: meta.icon },
              details: [
                { label: "Rate", value: r.rate != null ? `${this.fmt(r.rate, 1)} ${r.rateUnit}` : "—" },
                { label: "Belt speed", value: r.beltSpeed != null ? `${this.fmt(r.beltSpeed, 2)} ${r.speedUnit}` : "—" },
              ],
            };
          });
          // Re-point the open panel at the fresh row so it shows live values.
          if (this.selectedScale) {
            this.selectedScale = this.scaleRows.find((r) => r.deviceId === this.selectedScale!.deviceId) ?? this.selectedScale;
          }
          this.sourceReady("loaders");
          this.updateMapLocations();
          this.cd.detectChanges();
        },
        error: () => this.sourceReady("loaders"),
      });
  }

  /** Reload the barge loaders when one's position or flag changes. */
  private subscribeBargeLoaders(): void {
    subscribeLatestChanges(
      this.ctx,
      this.destroyRef,
      {
        entityFilter: this.bargeLoaderFilter,
        attributes: [this.keys.latitude, this.keys.longitude, this.bargeLoaderAttribute],
        timeseries: [this.keys.latitude, this.keys.longitude, ...SCALE_TS_KEYS],
      },
      () => this.loadBargeLoaders(),
      (subscription) => (this.bargeLoadersSubscription = subscription)
    );
  }

  /** Reload the ports when a Site's position or port flag changes. */
  private subscribeSites(): void {
    subscribeLatestChanges(
      this.ctx,
      this.destroyRef,
      { entityFilter: this.siteFilter, attributes: [this.keys.latitude, this.keys.longitude, this.portAttribute] },
      () => this.loadSites(),
      (subscription) => (this.sitesSubscription = subscription)
    );
  }

  private refreshSelectedVessel(): void {
    if (!this.selectedVessel) {
      return;
    }
    const updated = this.vesselsRows.find((r) => r.deviceId === this.selectedVessel!.deviceId);
    if (updated) {
      this.selectedVessel = updated;
      if (this.selectedEngine >= updated.engines.length) {
        this.selectedEngine = 0;
      }
      this.refreshRouteMarker();
    }
  }

  /** Live "latest" subscription — reload the table shortly after any value changes. */
  private subscribeVessels(): void {
    const k = this.keys;
    subscribeLatestChanges(
      this.ctx,
      this.destroyRef,
      {
        entityFilter: this.deviceFilter,
        attributes: [k.callSign, k.homePort, k.engineCount, k.draught, k.destination, k.eta],
        timeseries: [k.latitude, k.longitude, k.speed, k.course, k.heading, k.navStatus, k.atd, ...this.engineTsKeys],
      },
      () => {
        clearTimeout(this.vesselsRefreshTimer);
        this.vesselsRefreshTimer = setTimeout(() => this.loadVessels(), 300);
      },
      (subscription) => (this.vesselsSubscription = subscription)
    );
  }

  // -- data: alarms -----------------------------------------------------------

  private subscribeAlarms(): void {
    this.alarmsLoading = true;
    subscribeActiveAlarms(this.ctx, this.destroyRef, {
      // Tugs and belt scales: the scale panel's Alarms tab reads from the same stream.
      entityFilter:
        this.mode === "vessel"
          ? this.deviceFilter
          : { type: AliasFilterType.deviceType, deviceTypes: [...this.deviceTypes, ...this.bargeLoaderDeviceTypes], deviceNameFilter: "" },
      onSubscribed: (subscription) => (this.alarmsSubscription = subscription),
      onUpdated: (alarms) => this.onAlarmsUpdated(alarms),
    });
  }

  private onAlarmsUpdated(alarms: DashboardAlarm[]): void {
    this.alarmsRows = alarms;
    this.alarmsLoading = false;
    this.applyAlarmCounts();
    this.applyAlarmFilter();
    this.applyDetailAlarms();
    this.cd.detectChanges();
  }

  /** Per-vessel active-alarm tallies + the coolant / oil-pressure flags, injected into the rows. */
  private applyAlarmCounts(): void {
    const counts = new Map<string, number>();
    const flags = new Map<string, { coolant: boolean; oil: boolean }>();
    for (const a of this.alarmsRows) {
      if (!a.originatorId) {
        continue;
      }
      counts.set(a.originatorId, (counts.get(a.originatorId) ?? 0) + 1);
      const type = a.type.toLowerCase();
      const f = flags.get(a.originatorId) ?? { coolant: false, oil: false };
      f.coolant = f.coolant || type.includes("coolant");
      f.oil = f.oil || type.includes("oil pressure");
      flags.set(a.originatorId, f);
    }
    this.alarmCounts = counts;
    this.alarmFlags = flags;
    this.vesselsRows = this.vesselsRows.map((r) => ({
      ...r,
      alarmCount: counts.get(r.deviceId) ?? 0,
      coolantAlarm: flags.get(r.deviceId)?.coolant ?? false,
      oilPressureAlarm: flags.get(r.deviceId)?.oil ?? false,
    }));
    const fresh = new Map(this.vesselsRows.map((r) => [r.deviceId, r]));
    this.tableRows = this.tableRows.map((v) => fresh.get(v.deviceId) ?? v);
    this.refreshSelectedVessel();
  }

  /** The alarms panel's list, titled with the vessel's name over its customer. */
  private applyAlarmFilter(): void {
    const vessels = new Map(this.vesselsRows.map((d) => [d.deviceId, d]));
    this.panelAlarms = this.scopedAlarms.map((a) => {
      const v = vessels.get(a.originatorId);
      return { ...a, originatorName: v?.name || a.originatorName || "Unknown vessel" };
    });
  }

  private applyDetailAlarms(): void {
    const id = this.selectedVessel?.deviceId;
    this.detailAlarms = id ? this.alarmsRows.filter((a) => a.originatorId === id) : [];
    const scaleId = this.selectedScale?.deviceId;
    this.scaleDetailAlarms = scaleId ? this.alarmsRows.filter((a) => a.originatorId === scaleId) : [];
  }

  // -- detail panel charts ----------------------------------------------------

  /**
   * Metric chart cards for the selected engine, keyed with its suffix. Each card's series take the chart palette in its fixed
   * order (`paletteCharts`) — on the details page each chart is a card of its own, so its series start again at the first.
   */
  private rebuildChartCards(): void {
    const suffix = this.keys.engineSuffixes[this.selectedEngine] ?? "";
    const key = (m: EngineMetric, label: string) => ({ name: this.keys.engine[m] + suffix, label, color: CHART_PALETTE[0] });
    const cards: { title: string; charts: MetricChartSection[] }[] = [
      {
        title: "Engine",
        charts: [
          { chartTitle: "Engine speed", unit: "rpm", fill: true, showLegend: false, keys: [key("engineSpeed", "Engine speed")] },
          { chartTitle: "Percent load at current speed", unit: "%", yMin: 0, yMax: 100, fill: true, showLegend: false, keys: [key("percentLoad", "Load")] },
          { chartTitle: "Coolant temperature", unit: "°C", fill: true, showLegend: false, keys: [key("coolantTemperature", "Coolant")] },
        ],
      },
      {
        title: "Temperatures",
        charts: [
          {
            chartTitle: "Oil, intercooler and intake",
            unit: "°C",
            keys: [key("engineOilTemperature", "Engine oil"), key("intercoolerTemperature", "Intercooler"), key("intakeManifoldTemperature", "Intake manifold")],
          },
          {
            chartTitle: "Exhaust gas",
            unit: "°C",
            keys: [key("leftExhaustGasTemperature", "Left bank"), key("rightExhaustGasTemperature", "Right bank")],
          },
        ],
      },
      {
        title: "Pressures",
        charts: [
          {
            chartTitle: "Engine",
            unit: "kPa",
            keys: [key("engineOilPressure", "Engine oil"), key("fuelDeliveryPressure", "Fuel delivery"), key("boostPressure", "Boost")],
          },
        ],
      },
      {
        title: "Fuel",
        charts: [
          {
            chartTitle: "Fuel rate",
            unit: "L/h",
            keys: [key("fuelRate", "Fuel rate"), key("tripAverageFuelRate", "Trip average")],
          },
        ],
      },
      {
        title: "Transmission",
        charts: [
          { chartTitle: "Oil pressure", unit: "kPa", fill: true, showLegend: false, keys: [key("transmissionOilPressure", "Oil pressure")] },
          { chartTitle: "Oil temperature", unit: "°C", fill: true, showLegend: false, keys: [key("transmissionOilTemperature", "Oil temperature")] },
        ],
      },
      {
        title: "Electrical & filters",
        charts: [
          { chartTitle: "Battery potential", unit: "V", fill: true, showLegend: false, keys: [key("batteryPotential", "Battery")] },
          {
            chartTitle: "Filter differential pressure",
            unit: "kPa",
            keys: [key("fuelFilterDifferentialPressure", "Fuel filter"), key("oilFilterDifferentialPressure", "Oil filter")],
          },
        ],
      },
    ];
    this.chartCards = cards.map((card) => ({ ...card, charts: paletteCharts(card.charts) }));
    this.pageChartCards = cards.flatMap((card) =>
      card.charts.map((section) => ({ title: section.chartTitle || card.title, charts: paletteCharts([{ ...section, chartTitle: undefined }]) })),
    );
  }

  // -- misc -------------------------------------------------------------------

  private loadUserPreferences(): void {
    readUserSettings(this.ctx, this.destroyRef, (settings) => {
      this.theme.restore(settings);
      this.vesselColumnChoice.restore(settings);
      // The user's sort: one they picked, or none if they cleared it (a third header click); by name until they've touched it.
      const sort = settings?.[this.sortSettingKey];
      if (sort === null) {
        this.vesselSort = null;
      } else if (sort && this.vesselColumns.some((c) => c.key === sort.key) && (sort.direction === "asc" || sort.direction === "desc")) {
        this.vesselSort = { key: sort.key, direction: sort.direction };
      }
      const savedMap = settings[this.mapSettingKey];
      if (savedMap === "roadmap" || savedMap === "satellite" || savedMap === "hybrid") {
        this.mapType = savedMap;
      }
      this.cd.detectChanges();
    });
  }

  /** 1s ticker while the panel is open, so "Updated Xs ago" counts up. */
  private startClock(): void {
    this.stopClock();
    this.clockTimer = setInterval(() => this.cd.detectChanges(), 1000);
  }

  private stopClock(): void {
    clearInterval(this.clockTimer);
    this.clockTimer = undefined;
  }

  /**
   * AIS ETA "MM-DD HH:MM" (UTC, "00-00 24:60" = unavailable) → ms. Crews rarely
   * refresh the field, so an ETA that is already past or more than
   * ETA_MAX_DAYS_AHEAD out is stale and reads as unavailable, like MarineTraffic
   * does. The year is whichever of the current or the next keeps it in that window.
   */
  private parseAisEta(raw: any): number | null {
    const m = /^(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(String(raw ?? "").trim());
    if (!m) {
      return null;
    }
    const [month, day, hour, minute] = m.slice(1).map(Number);
    if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) {
      return null; // AIS "not available" markers
    }
    const now = Date.now();
    const year = new Date().getUTCFullYear();
    for (const y of [year, year + 1]) {
      const ts = Date.UTC(y, month - 1, day, hour, minute);
      if (ts >= now && ts <= now + ETA_MAX_DAYS_AHEAD * 24 * 60 * 60 * 1000) {
        return ts;
      }
    }
    return null;
  }

  /**
   * The popup's trip bar. AIS carries no arrival time and crews rarely refresh
   * the ETA, so a vessel that has been stopped a while after its departure
   * counts as arrived (full bar, "Arrived", no ETA). Otherwise the bar fills
   * by the time elapsed between ATD and ETA.
   */
  private tripFor(r: VesselRow): MapTrip {
    const eta = r.eta ? formatDateTime(r.eta) : undefined;
    if (TRIP_PROGRESS_DEV_MODE) {
      return { to: r.destination, progress: TRIP_PROGRESS_DEV_VALUE, eta };
    }
    if (this.hasArrived(r)) {
      return { to: r.destination, progress: 1, label: "Arrived" };
    }
    return { to: r.destination, progress: this.tripProgress(r.atd, r.eta), eta };
  }

  /** Stopped (under 0.5 kn) at least 30 min after departure — the trip is over. */
  private hasArrived(r: VesselRow): boolean {
    return r.atd != null && r.speed != null && r.speed < 0.5 && Date.now() - r.atd > 30 * 60 * 1000;
  }

  /** Share of the trip elapsed between departure and ETA (0–1), or undefined without both or with ETA before ATD. */
  private tripProgress(atd: number | null, eta: number | null): number | undefined {
    if (atd == null || eta == null || eta <= atd) {
      return undefined;
    }
    return Math.max(0, Math.min(1, (Date.now() - atd) / (eta - atd)));
  }

  /**
   * "MM-DD HH:MM" or "YYYY-MM-DD HH:MM" in the viewer's local time → ms. Without
   * a year the current one is used, or the previous when that would be in the future.
   */
  private parseLocalDateTime(raw: any): number | null {
    const m = /^(?:(\d{4})-)?(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(String(raw ?? "").trim());
    if (!m) {
      return null;
    }
    const [year, month, day, hour, minute] = m.slice(1).map((v) => (v == null ? NaN : Number(v)));
    if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) {
      return null;
    }
    const y = isFinite(year) ? year : new Date().getFullYear();
    let ts = new Date(y, month - 1, day, hour, minute).getTime();
    if (!isFinite(year) && ts > Date.now()) {
      ts = new Date(y - 1, month - 1, day, hour, minute).getTime();
    }
    return ts;
  }

  /** navStatus telemetry: a code (number or numeric string) or a text label. */
  private toNavStatus(raw: any): NavStatus {
    if (raw == null || raw === "") {
      return null;
    }
    const n = parseNumber(raw);
    return n != null ? n : String(raw).trim();
  }

}
