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

import { ChangeDetectorRef, Component, DestroyRef, HostListener, Input, OnDestroy, OnInit, ViewChild } from "@angular/core";
import { CommonModule } from "@angular/common";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { WidgetSubscriptionOptions } from "@core/public-api";
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
  SharedModule,
  TimewindowType,
  widgetType,
} from "@shared/public-api";
import type { AlarmService } from "@core/http/alarm.service";
import { WidgetContext } from "@home/models/widget-component.models";
import { DataTableCellDirective, DataTableColumn, DataTableComponent } from "../../../components/shared/data-table/data-table.component";
import { NavRailComponent, NavRailItem } from "../../../components/shared/nav-rail/nav-rail.component";
import { keepsSidePanelOpen } from "../../../components/shared/detail-panel/side-panel-outside-click";
import { EntityDetailPanelComponent } from "../../../components/shared/entity-detail-panel/entity-detail-panel.component";
import { SegmentOption, SegmentedControlComponent } from "../../../components/shared/segmented-control/segmented-control.component";
import { MetricChartCardComponent, MetricChartSection } from "../../../components/shared/metric-chart-card/metric-chart-card.component";
import { MapBounds, MapCardComponent, MapControl, MapLocation, MapLocationMove, MapType } from "../../../components/shared/map-card/map-card.component";
import { StatusPillComponent, StatusPillTone } from "../../../components/shared/status-pill/status-pill.component";
import { AlarmListComponent } from "../../../components/shared/alarm-list/alarm-list.component";
import { injectCss } from "../../../components/shared/cdn-loader";
import { StateTimelineComponent, StateTimelineState } from "../../../components/shared/state-timeline/state-timeline.component";
import { formatClockTime } from "../../../components/shared/time-format";

/** Sidebar views: the Vessels table or the fleet map. */
type MarineView = "vessels" | "map";

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

/** One alarm row (the shared tb-alarm-list's item shape). */
interface AlarmRow {
  id: string;
  createdTime: number;
  originatorName: string;
  originatorId: string;
  type: string;
  severity: string;
  acknowledged: boolean;
  cleared: boolean;
  detailsData: string;
}

/** One vessel row in the Vessels table. */
interface VesselRow {
  deviceId: string;
  /** Display name (label || name). */
  name: string;
  /** The device's real name — the panel's sub-label when a label is shown as the title. */
  deviceName: string;
  /** Call sign (server attribute), shown in the name cell's meta line. */
  callSign: string;
  /** Home port (server attribute) — the sidebar filter; "" = unassigned. */
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

/** Status → pill tone / icon / label (one scale: status.$success etc. via the pill tones). */
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
const NAV_STATUS_UNKNOWN: StatusMeta = { label: "No status", tone: "neutral", icon: "help" };

/** Letters only, lower case — "Under way using engine" and "under-way (using engine)" compare equal. */
const normalizeStatusLabel = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

/** Text labels → code: the table's own labels plus the long ITU wordings. */
const NAV_STATUS_BY_LABEL: Record<string, number> = Object.fromEntries([
  ...Object.entries(NAV_STATUS_META).map(([code, m]) => [normalizeStatusLabel(m.label), Number(code)]),
  ...Object.entries({
    "under way using engine": 0,
    "underway using engine": 0,
    "restricted maneuverability": 3,
    "constrained by her draught": 4,
    "constrained by draft": 4,
    "engaged in fishing": 7,
    "power-driven vessel towing astern": 11,
    "power-driven vessel pushing ahead or towing alongside": 12,
    "pushing ahead or towing alongside": 12,
    "ais-sart is active": 14,
    "ais sart": 14,
    "undefined": 15,
    "not defined (default)": 15,
  }).map(([label, code]) => [normalizeStatusLabel(label), code]),
]);

/**
 * Marine fleet dashboard — tugboats with GPS + J1939-style engine telemetry.
 *
 * Same layout as the QC Lab and fuel dashboards: a filter sidebar (view
 * switcher, Status, Home ports), a top bar (alarms + theme), and the active
 * view — the Vessels table or the fleet map. A row (or marker) opens the
 * vessel detail panel: position, per-engine totals and the engine metric
 * charts; the header bell opens the grouped alarms panel.
 *
 * The map also plots ports: Site assets (`siteAssetTypes`, default ["Site"])
 * whose `port` server attribute (`portAttribute`) is true, at their latitude /
 * longitude server attributes — and barge loaders: devices of
 * `bargeLoaderDeviceTypes` (default ["BeltScale"]) whose `bargeScale` server
 * attribute (`bargeLoaderAttribute`) is true, at their latest latitude /
 * longitude telemetry (or server attributes). Both get the anchor marker. `homeBounds` ([[S, W], [N, E]]) is the view
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
    NavRailComponent,
    SegmentedControlComponent,
    EntityDetailPanelComponent,
    MetricChartCardComponent,
    MapCardComponent,
    StatusPillComponent,
    AlarmListComponent,
    StateTimelineComponent,
  ],
})
export class MarineDashboardComponent implements OnInit, OnDestroy {
  @Input() ctx: WidgetContext;

  // -- views (icon rail on the left; the map opens first) ---------------------
  readonly views: NavRailItem[] = [
    { id: "map", label: "Map", icon: "map" },
    { id: "vessels", label: "Vessels", icon: "directions_boat" },
  ];
  view: MarineView = "map";
  /** Light/dark theme (persisted per user, shared across dashboards). */
  darkMode = false;
  mapType: MapType = "roadmap";
  /** CARTO basemaps key from the widget settings (`cartoApiKey`); "" = keyless tiles. */
  cartoApiKey = "";
  // -- vessels table ----------------------------------------------------------
  readonly vesselColumns: DataTableColumn[] = [
    { key: "name", header: "Vessel" },
    { key: "status", header: "Status" },
    { key: "speed", header: "Speed", sortKey: "speed" },
    { key: "engineSpeed", header: "Engine speed", sortKey: "engineSpeedValue" },
    { key: "load", header: "Load", sortKey: "loadValue" },
    { key: "coolant", header: "Coolant", sortKey: "coolantValue" },
    { key: "oilPressure", header: "Oil pressure", sortKey: "oilPressureValue" },
    { key: "fuelRate", header: "Fuel rate", sortKey: "fuelRateValue" },
    { key: "engineHours", header: "Engine hours", align: "right", sortKey: "engineHoursValue" },
    { key: "alarmCount", header: "Alarms", align: "right" },
  ];
  /** Every vessel of the configured device types. */
  vesselsRows: VesselRow[] = [];
  /** Vessels passing the sidebar filters — the table, the map and the alarm scope. */
  tableRows: VesselRow[] = [];
  vesselsLoading = false;
  mapLocations: MapLocation[] = [];
  // -- detail panel -----------------------------------------------------------
  selectedVessel: VesselRow | null = null;
  detailOpen = false;
  /** Selected engine index in the panel (0 = Port / only engine). */
  selectedEngine = 0;
  /** One window shared by every chart card in the panel. */
  insightsTimeframe = "1D";
  /** Chart cards for the selected engine (rebuilt when the engine changes). */
  chartCards: { title: string; charts: MetricChartSection[] }[] = [];
  detailAlarms: AlarmRow[] = [];
  // -- alarms -----------------------------------------------------------------
  alarmsRows: AlarmRow[] = [];
  alarmsLoading = false;
  alarmPanelOpen = false;
  readonly alarmPanelTabs: SegmentOption[] = [{ id: "alarms", label: "Alarms", icon: "notifications", tooltip: "Alarms" }];
  /** Alarms of the filtered vessels, named by vessel (tb-alarm-list groups them). */
  panelAlarms: AlarmRow[] = [];
  /** Ports: Site assets flagged with the `port` server attribute — slate anchor markers. */
  portLocations: MapLocation[] = [];
  /** Barge loaders: BeltScale devices flagged with the `bargeScale` server attribute — slate anchor markers too. */
  bargeLoaderLocations: MapLocation[] = [];
  scaleRows: ScaleRow[] = [];
  /** The belt scale shown in its own detail panel (null when closed). */
  selectedScale: ScaleRow | null = null;
  scaleDetailOpen = false;
  scaleDetailAlarms: AlarmRow[] = [];
  /** Belt scale charts (Insights tab), one card each: belt speed and rate over the last 24 h. */
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
  private vesselsLoadedOnce = false;
  /** Home area of the map: the view before any marker arrives (Vancouver ports to Texada Island). */
  homeBounds: MapBounds = [
    [49.0, -125.0],
    [49.85, -122.6],
  ];
  private readonly themeSettingKey = "darkMode";
  private readonly mapSettingKey = "marineMapType";
  @ViewChild("vesselTable") private vesselTable?: DataTableComponent;
  @ViewChild("mapCard") private mapCard?: MapCardComponent;
  private alarmCounts = new Map<string, number>();
  private alarmFlags = new Map<string, { coolant: boolean; oil: boolean }>();
  private keys: MarineKeys = DEFAULT_KEYS;
  private deviceTypes = ["Tugboat"];
  private siteAssetTypes = ["Site"];
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

  constructor(private cd: ChangeDetectorRef, private destroyRef: DestroyRef) {}

  /** Rail foot: the light/dark toggle (icon follows the current theme). */
  get railBottomItems(): NavRailItem[] {
    return [{ id: "theme", icon: this.darkMode ? "light_mode" : "dark_mode", label: this.darkMode ? "Light mode" : "Dark mode" }];
  }

  /** Map control stack: the alarms bell with its active count. */
  get mapControls(): MapControl[] {
    return [
      { id: "alarms", icon: "notifications", tooltip: "Alarms", badge: this.activeAlarmCount, active: this.alarmPanelOpen },
      { id: "reposition", icon: "edit_location_alt", tooltip: this.repositionMode ? "Done repositioning" : "Reposition sites and scales", active: this.repositionMode },
    ];
  }

  /** Reposition mode: site and scale pins can be dragged; a drop saves their latitude / longitude attributes. */
  repositionMode = false;
  /** Entity type behind each fixed marker id, for the attribute save. */
  private fixedEntityTypes = new Map<string, EntityType>();

  get scaleDetailTabs(): SegmentOption[] {
    return [
      { id: "insights", label: "Insights", icon: "bar_chart", tooltip: "Insights" },
      { id: "alarms", label: "Alarms", icon: "notifications", tooltip: "Alarms", badge: this.scaleDetailAlarms.length },
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
      { id: "insights", label: "Insights", icon: "bar_chart", tooltip: "Insights" },
      { id: "alarms", label: "Alarms", icon: "notifications", tooltip: "Alarms", badge: this.selectedVessel?.alarmCount ?? 0 },
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

  /** "Open vessel" in a map popup → the detail panel for that tug. */
  /** Panel sub-label: the real device name under a label title; nothing when the title is the name itself. */
  get detailSubtitle(): string {
    const v = this.selectedVessel;
    return v && v.deviceName && v.deviceName !== v.name ? v.deviceName : "";
  }

  private get scopedAlarms(): AlarmRow[] {
    const ids = new Set(this.tableRows.map((r) => r.deviceId));
    return this.alarmsRows.filter((a) => ids.has(a.originatorId));
  }

  private get deviceFilter(): EntityFilter {
    return { type: AliasFilterType.deviceType, deviceTypes: this.deviceTypes, deviceNameFilter: "" };
  }

  /** Every per-engine timeseries key (all metrics × all engine suffixes). */
  private get engineTsKeys(): string[] {
    return this.keys.engineSuffixes.flatMap((s) => ENGINE_METRICS.map((m) => this.keys.engine[m] + s));
  }

  private get siteFilter(): EntityFilter {
    return { type: AliasFilterType.assetType, assetTypes: this.siteAssetTypes, assetNameFilter: "" } as EntityFilter;
  }

  private get bargeLoaderFilter(): EntityFilter {
    return { type: AliasFilterType.deviceType, deviceTypes: this.bargeLoaderDeviceTypes, deviceNameFilter: "" };
  }

  // -- lifecycle --------------------------------------------------------------

  onMapControl(id: string): void {
    if (id === "alarms") {
      this.alarmPanelOpen = true;
    } else if (id === "reposition") {
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

  ngOnInit(): void {
    this.ctx.$scope.marineDashboardComponent = this;
    injectCss("tb-ext-material-symbols-rounded", "https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200");
    this.applySettings();
    this.alarmService = this.ctx.$injector.get(this.ctx.servicesMap.get("alarmService")) as AlarmService;
    this.loadUserPreferences();
    this.subscribeAlarms();
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
    for (const sub of [this.alarmsSubscription, this.vesselsSubscription, this.sitesSubscription, this.bargeLoadersSubscription]) {
      if (sub) {
        this.ctx.subscriptionApi.removeSubscription(sub.id);
      }
    }
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

  @HostListener("document:pointerdown", ["$event"])
  onDocumentPointerDown(event: Event): void {
    if ((!this.detailOpen && !this.scaleDetailOpen) || keepsSidePanelOpen(event.target)) {
      return;
    }
    this.closeDetail();
    this.closeScaleDetail();
    this.cd.detectChanges();
  }

  selectView(id: string): void {
    if (id === this.view) {
      return;
    }
    this.view = id as MarineView;
    if (this.view === "map") {
      // The map was hidden (display:none): flush the DOM change and re-measure
      // synchronously, before the first paint, so the markers and their labels
      // don't flash at the hidden-state geometry.
      this.cd.detectChanges();
      this.mapCard?.invalidateSize();
    }
  }

  // -- detail panel -----------------------------------------------------------

  toggleTheme(): void {
    this.darkMode = !this.darkMode;
    this.cd.detectChanges();
    this.ctx.userSettingsService
      .putUserSettings({ [this.themeSettingKey]: this.darkMode } as any)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe();
    this.mapCard?.invalidateSize();
  }

  onMapTypeChange(type: MapType): void {
    this.mapType = type;
    this.ctx.userSettingsService
      .putUserSettings({ [this.mapSettingKey]: type } as any)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe();
  }

  onVesselRowClick(row: Record<string, any>): void {
    const vessel = row as VesselRow;
    if (this.detailOpen && this.selectedVessel?.deviceId === vessel.deviceId) {
      this.closeDetail();
      return;
    }
    this.openDetail(vessel);
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
    this.vesselTable?.clearSelection();
    this.stopClock();
  }

  onDetailAfterClosed(): void {
    this.selectedVessel = null;
    this.detailAlarms = [];
  }

  openScaleDetail(scale: ScaleRow): void {
    this.closeDetail();
    this.selectedScale = scale;
    this.scaleCharts = [
      { chartTitle: "Speed", unit: scale.speedUnit, fill: true, showLegend: false, keys: [{ name: "beltSpeed", fallbackName: "speed", label: "Speed", color: "#1e5dff" }] },
      { chartTitle: "Rate", unit: scale.rateUnit, fill: true, showLegend: false, keys: [{ name: "rate", label: "Rate", color: "#a855f7" }] },
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

  // -- formatting helpers (templates) -----------------------------------------

  selectEngine(id: string): void {
    this.selectedEngine = Number(id) || 0;
    this.rebuildChartCards();
  }

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

  /** "1,480" / "84.5" with thousands separators, or "—". */
  fmt(value: number | null, decimals = 0): string {
    if (value == null) {
      return "—";
    }
    return value.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }

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

  // -- data: vessels ----------------------------------------------------------

  fmtClock(ts: number | null): string {
    return ts ? formatClockTime(new Date(ts)) : "—";
  }

  relativeTime(ts: number | null): string {
    if (!ts) {
      return "—";
    }
    const secs = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (secs < 60) {
      return secs === 0 ? "just now" : `${secs}s ago`;
    }
    const mins = Math.floor(secs / 60);
    if (mins < 60) {
      return `${mins}m ago`;
    }
    const hours = Math.floor(mins / 60);
    return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
  }

  loadVessels(): void {
    this.vesselsLoading = true;
    const k = this.keys;
    const query: EntityDataQuery = {
      entityFilter: this.deviceFilter,
      pageLink: {
        pageSize: 1024,
        page: 0,
        sortOrder: { key: { type: EntityKeyType.ENTITY_FIELD, key: "name" }, direction: Direction.ASC },
      },
      entityFields: [
        { type: EntityKeyType.ENTITY_FIELD, key: "name" },
        { type: EntityKeyType.ENTITY_FIELD, key: "label" },
      ],
      latestValues: [
        ...[k.latitude, k.longitude, k.speed, k.course, k.heading, k.navStatus, ...this.engineTsKeys].map((key) => ({ type: EntityKeyType.TIME_SERIES, key })),
        ...[k.callSign, k.homePort, k.engineCount].map((key) => ({ type: EntityKeyType.SERVER_ATTRIBUTE, key })),
      ],
    };

    this.ctx.entityService
      .findEntityDataByQuery(query, { ignoreLoading: true, ignoreErrors: true })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this.vesselsRows = page.data.map((d) => this.toVesselRow(d)).sort((a, b) => a.name.localeCompare(b.name));
          this.vesselsLoading = false;
          this.vesselsLoadedOnce = true;
          this.sourceReady("vessels");
          this.refreshSelectedVessel();
          this.applyFilters();
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
    const s = (this.ctx.settings ?? {}) as {
      deviceTypes?: string[];
      siteAssetTypes?: string[];
      bargeLoaderDeviceTypes?: string[];
      bargeLoaderAttribute?: string;
      portAttribute?: string;
      homeBounds?: MapBounds;
      keys?: Partial<MarineKeys>;
      cartoApiKey?: string;
    };
    if (typeof s.cartoApiKey === "string") {
      this.cartoApiKey = s.cartoApiKey.trim();
    }
    if (Array.isArray(s.deviceTypes) && s.deviceTypes.length) {
      this.deviceTypes = s.deviceTypes;
    }
    if (Array.isArray(s.siteAssetTypes) && s.siteAssetTypes.length) {
      this.siteAssetTypes = s.siteAssetTypes;
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
        reading[m] = this.toNumber(point?.value);
        if (point?.ts && (reading.ts == null || point.ts > reading.ts)) {
          reading.ts = point.ts;
        }
      }
      engines.push(reading);
    }

    const speed = this.toNumber(ts[k.speed]?.value);
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
      callSign: attrs[k.callSign]?.value ?? "",
      homePort: attrs[k.homePort]?.value ?? "",
      engineCount,
      engines,
      status: this.toNavStatus(ts[k.navStatus]?.value),
      speed,
      course: this.toNumber(ts[k.course]?.value),
      heading: this.toNumber(ts[k.heading]?.value),
      lat: this.toNumber(ts[k.latitude]?.value),
      lng: this.toNumber(ts[k.longitude]?.value),
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

  /** Rebuild the table rows and the map markers from the loaded vessels. */
  private applyFilters(): void {
    this.tableRows = this.vesselsRows;
    this.updateMapLocations();

    const listed = new Set(this.tableRows.map((r) => r.deviceId));
    if (this.detailOpen && this.selectedVessel && !listed.has(this.selectedVessel.deviceId)) {
      this.closeDetail();
    }
    this.applyAlarmFilter();
  }

  /** Markers: the filtered vessels (brand boat pins) plus every port (slate anchor pins). */
  private updateMapLocations(): void {
    const vessels: MapLocation[] = this.tableRows
      .filter((r) => r.lat != null && r.lng != null)
      .map((r) => {
        const meta = this.statusMeta(r.status);
        return {
          id: r.deviceId,
          name: r.name,
          lat: r.lat as number,
          lng: r.lng as number,
          icon: "directions_boat",
          status: { label: meta.label, tone: meta.tone, icon: meta.icon },
          heading: r.heading ?? undefined, // the compass in the popup's corner
          details: [
            { label: "Speed", value: r.speed != null ? `${this.fmt(r.speed, 1)} kn` : "—" },
            { label: "Course", value: r.course != null ? `${Math.round(r.course)}°` : "—" },
            { label: "Engine", value: r.engineSpeedValue != null ? `${this.fmt(r.engineSpeedValue)} rpm` : "—" },
            { label: "Alarms", value: String(r.alarmCount) },
          ],
          actionLabel: "Details",
        };
      });
    // Until the full vessel query has answered once, the quick positions stand in.
    const boats = this.vesselsLoadedOnce ? vessels : this.vesselPreview;
    if (!this.mapGateOpen) {
      return; // published by openMapGate() once every source has answered
    }
    this.setMapLocations([...boats, ...this.portLocations, ...this.bargeLoaderLocations]);
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

  /** Quick first pass for the map: just name + latest position of every vessel. */
  private loadVesselPositions(): void {
    const k = this.keys;
    const query: EntityDataQuery = {
      entityFilter: this.deviceFilter,
      pageLink: { pageSize: 1024, page: 0, sortOrder: { key: { type: EntityKeyType.ENTITY_FIELD, key: "name" }, direction: Direction.ASC } },
      entityFields: [
        { type: EntityKeyType.ENTITY_FIELD, key: "name" },
        { type: EntityKeyType.ENTITY_FIELD, key: "label" },
      ],
      latestValues: [k.latitude, k.longitude].map((key) => ({ type: EntityKeyType.TIME_SERIES, key })),
    };
    this.ctx.entityService
      .findEntityDataByQuery(query, { ignoreLoading: true, ignoreErrors: true })
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
              return {
                id: d.entityId.id as string,
                name: fields["label"]?.value || fields["name"]?.value || "Unknown vessel",
                lat: this.toNumber(ts[k.latitude]?.value),
                lng: this.toNumber(ts[k.longitude]?.value),
              };
            })
            .filter((v) => v.lat != null && v.lng != null)
            .map((v) => ({ id: v.id, name: v.name, lat: v.lat as number, lng: v.lng as number, icon: "directions_boat" }));
          this.sourceReady("vessels");
          this.updateMapLocations();
          this.cd.detectChanges();
        },
        error: () => this.sourceReady("vessels"),
      });
  }

  // -- data: ports (Site assets) ----------------------------------------------

  /** Replace the markers only when a position, status or popup value changed (not on every reload). */
  private setMapLocations(locs: MapLocation[]): void {
    const key = (a: MapLocation[]) =>
      a
        .map((l) => `${l.kind ?? ""}:${l.icon ?? ""}:${l.name}:${l.lat}:${l.lng}:${l.status?.label ?? ""}:${l.heading ?? ""}:${(l.details ?? []).map((d) => d.value).join(",")}`)
        .sort()
        .join("|");
    if (key(locs) !== key(this.mapLocations)) {
      this.mapLocations = locs;
    }
  }

  /** Site assets whose `port` server attribute is true, placed by their latitude / longitude attributes. */
  private loadSites(): void {
    const query: EntityDataQuery = {
      entityFilter: this.siteFilter,
      pageLink: {
        pageSize: 1024,
        page: 0,
        sortOrder: { key: { type: EntityKeyType.ENTITY_FIELD, key: "name" }, direction: Direction.ASC },
      },
      entityFields: [
        { type: EntityKeyType.ENTITY_FIELD, key: "name" },
        { type: EntityKeyType.ENTITY_FIELD, key: "label" },
      ],
      latestValues: [
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: this.keys.latitude },
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: this.keys.longitude },
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: this.portAttribute },
      ],
    };
    this.ctx.entityService
      .findEntityDataByQuery(query, { ignoreLoading: true, ignoreErrors: true })
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
                lat: this.toNumber(attrs[this.keys.latitude]?.value),
                lng: this.toNumber(attrs[this.keys.longitude]?.value),
                isPort: String(attrs[this.portAttribute]?.value) === "true",
              };
            })
            .filter((p) => p.isPort && p.lat != null && p.lng != null)
            .map((p) => ({ id: p.id, name: p.name, lat: p.lat as number, lng: p.lng as number, icon: "anchor", kind: "neutral" as const, draggable: true }));
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
      pageLink: {
        pageSize: 1024,
        page: 0,
        sortOrder: { key: { type: EntityKeyType.ENTITY_FIELD, key: "name" }, direction: Direction.ASC },
      },
      entityFields: [
        { type: EntityKeyType.ENTITY_FIELD, key: "name" },
        { type: EntityKeyType.ENTITY_FIELD, key: "label" },
      ],
      latestValues: [
        ...[this.keys.latitude, this.keys.longitude, ...SCALE_TS_KEYS].map((key) => ({ type: EntityKeyType.TIME_SERIES, key })),
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: this.keys.latitude },
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: this.keys.longitude },
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: this.bargeLoaderAttribute },
      ],
    };
    this.ctx.entityService
      .findEntityDataByQuery(query, { ignoreLoading: true, ignoreErrors: true })
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
                lat: this.toNumber(ts[this.keys.latitude]?.value) ?? this.toNumber(attrs[this.keys.latitude]?.value),
                lng: this.toNumber(ts[this.keys.longitude]?.value) ?? this.toNumber(attrs[this.keys.longitude]?.value),
                state: (SCALE_STATES.some((m) => m.id === rawState) ? rawState : null) as ScaleState | null,
                rate: this.toNumber(ts["rate"]?.value),
                rateUnit: `${weightUnit}/${rateUnit}`,
                speedUnit: imperial ? "ft/min" : "m/s",
                // Some scales report the belt speed under `speed`.
                beltSpeed: this.toNumber(ts["beltSpeed"]?.value) ?? this.toNumber(ts["speed"]?.value),
                lastSeen: stamps.length ? Math.max(...stamps) : null,
                isLoader: String(attrs[this.bargeLoaderAttribute]?.value) === "true",
              };
            })
            .filter((p) => p.isLoader && p.lat != null && p.lng != null)
            .map((p): ScaleRow => ({
              deviceId: p.deviceId,
              name: p.name,
              deviceName: p.deviceName,
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
            return {
              id: r.deviceId,
              name: r.name,
              lat: r.lat,
              lng: r.lng,
              draggable: true,
              icon: "anchor",
              kind: "neutral" as const,
              status: { label: meta.label, tone: meta.tone, icon: meta.icon },
              details: [
                { label: "Rate", value: r.rate != null ? `${this.fmt(r.rate, 1)} ${r.rateUnit}` : "—" },
                { label: "Belt speed", value: r.beltSpeed != null ? `${this.fmt(r.beltSpeed, 2)} ${r.speedUnit}` : "—" },
              ],
              actionLabel: "Details",
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
    const dataKeys = [
      ...[this.keys.latitude, this.keys.longitude, ...SCALE_TS_KEYS].map((name) => ({ name, label: name, type: DataKeyType.timeseries, settings: {} })),
      ...[this.keys.latitude, this.keys.longitude, this.bargeLoaderAttribute].map((name) => ({ name, label: name, type: DataKeyType.attribute, settings: {} })),
    ];
    const datasources: Datasource[] = [{ type: DatasourceType.entity, name: "bargeLoaders", entityFilter: this.bargeLoaderFilter, dataKeys }];
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
          this.loadBargeLoaders();
        },
      },
    };
    this.ctx.subscriptionApi
      .createSubscription(options, true)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((subscription) => (this.bargeLoadersSubscription = subscription));
  }

  /** Reload the ports when a Site's position or port flag changes. */
  private subscribeSites(): void {
    const dataKeys = [this.keys.latitude, this.keys.longitude, this.portAttribute].map((name) => ({ name, label: name, type: DataKeyType.attribute, settings: {} }));
    const datasources: Datasource[] = [{ type: DatasourceType.entity, name: "ports", entityFilter: this.siteFilter, dataKeys }];
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
          this.loadSites();
        },
      },
    };
    this.ctx.subscriptionApi
      .createSubscription(options, true)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((subscription) => (this.sitesSubscription = subscription));
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
    }
  }

  /** Live "latest" subscription — reload the table shortly after any value changes. */
  private subscribeVessels(): void {
    const k = this.keys;
    const dataKeys = [
      ...[k.latitude, k.longitude, k.speed, k.course, k.heading, k.navStatus, ...this.engineTsKeys].map((name) => ({ name, label: name, type: DataKeyType.timeseries, settings: {} })),
      ...[k.callSign, k.homePort, k.engineCount].map((name) => ({ name, label: name, type: DataKeyType.attribute, settings: {} })),
    ];
    const datasources: Datasource[] = [{ type: DatasourceType.entity, name: "vessels", entityFilter: this.deviceFilter, dataKeys }];

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
          clearTimeout(this.vesselsRefreshTimer);
          this.vesselsRefreshTimer = setTimeout(() => this.loadVessels(), 300);
        },
      },
    };
    this.ctx.subscriptionApi
      .createSubscription(options, true)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((subscription) => (this.vesselsSubscription = subscription));
  }

  // -- data: alarms -----------------------------------------------------------

  private subscribeAlarms(): void {
    this.alarmsLoading = true;
    const alarmSource: Datasource = {
      type: DatasourceType.entity,
      name: "alarms",
      // Tugs and belt scales: the scale panel's Alarms tab reads from the same stream.
      entityFilter: { type: AliasFilterType.deviceType, deviceTypes: [...this.deviceTypes, ...this.bargeLoaderDeviceTypes], deviceNameFilter: "" },
      dataKeys: [
        { name: "createdTime", label: "createdTime", type: DataKeyType.alarm, settings: {} },
        { name: "type", label: "type", type: DataKeyType.alarm, settings: {} },
        { name: "severity", label: "severity", type: DataKeyType.alarm, settings: {} },
      ],
    };
    const tenYearsMs = 10 * 365 * 24 * 60 * 60 * 1000;
    const options: WidgetSubscriptionOptions = {
      type: widgetType.alarm,
      alarmSource,
      useDashboardTimewindow: false,
      timeWindowConfig: {
        selectedTab: TimewindowType.REALTIME,
        realtime: { realtimeType: RealtimeWindowType.LAST_INTERVAL, timewindowMs: tenYearsMs },
      },
      callbacks: { onDataUpdated: (subscription) => this.onAlarmsUpdated(subscription) },
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
            statusList: [AlarmSearchStatus.ACTIVE],
            severityList: [],
          },
          null
        );
      });
  }

  private onAlarmsUpdated(subscription: any): void {
    const alarms = subscription?.alarms?.data ?? [];
    this.alarmsRows = alarms.map((a: any) => {
      const rawData = a.details?.data;
      return {
        id: a.id?.id ?? a.id,
        createdTime: a.createdTime,
        originatorName: a.originatorDisplayName || a.originatorLabel || a.originatorName || "",
        originatorId: a.originator?.id ?? a.originatorId ?? "",
        type: a.type,
        severity: a.severity,
        acknowledged: !!(a.acknowledged ?? a.ackTs > 0),
        cleared: !!(a.cleared ?? a.clearTs > 0),
        detailsData: rawData == null ? "" : typeof rawData === "object" ? JSON.stringify(rawData) : String(rawData),
      } as AlarmRow;
    });
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

  private applyAlarmFilter(): void {
    const names = new Map(this.vesselsRows.map((d) => [d.deviceId, d.name]));
    this.panelAlarms = this.scopedAlarms.map((a) => ({ ...a, originatorName: names.get(a.originatorId) || a.originatorName || "Unknown vessel" }));
  }

  private applyDetailAlarms(): void {
    const id = this.selectedVessel?.deviceId;
    this.detailAlarms = id ? this.alarmsRows.filter((a) => a.originatorId === id) : [];
    const scaleId = this.selectedScale?.deviceId;
    this.scaleDetailAlarms = scaleId ? this.alarmsRows.filter((a) => a.originatorId === scaleId) : [];
  }

  // -- detail panel charts ----------------------------------------------------

  /** Metric chart cards for the selected engine, keyed with its suffix. */
  private rebuildChartCards(): void {
    const suffix = this.keys.engineSuffixes[this.selectedEngine] ?? "";
    const key = (m: EngineMetric, label: string, color: string) => ({ name: this.keys.engine[m] + suffix, label, color });
    const blue = "#1e5dff";
    const purple = "#a855f7";
    const sky = "#0ea5e9";
    const amber = "#f59e0b";
    this.chartCards = [
      {
        title: "Engine",
        charts: [
          { chartTitle: "Engine speed", unit: "rpm", fill: true, showLegend: false, keys: [key("engineSpeed", "Engine speed", blue)] },
          { chartTitle: "Percent load at current speed", unit: "%", yMin: 0, yMax: 100, fill: true, showLegend: false, keys: [key("percentLoad", "Load", purple)] },
          { chartTitle: "Coolant temperature", unit: "°C", fill: true, showLegend: false, keys: [key("coolantTemperature", "Coolant", blue)] },
        ],
      },
      {
        title: "Temperatures",
        charts: [
          {
            chartTitle: "Oil, intercooler and intake",
            unit: "°C",
            keys: [key("engineOilTemperature", "Engine oil", blue), key("intercoolerTemperature", "Intercooler", sky), key("intakeManifoldTemperature", "Intake manifold", purple)],
          },
          {
            chartTitle: "Exhaust gas",
            unit: "°C",
            keys: [key("leftExhaustGasTemperature", "Left bank", blue), key("rightExhaustGasTemperature", "Right bank", amber)],
          },
        ],
      },
      {
        title: "Pressures",
        charts: [
          {
            chartTitle: "Engine",
            unit: "kPa",
            keys: [key("engineOilPressure", "Engine oil", blue), key("fuelDeliveryPressure", "Fuel delivery", sky), key("boostPressure", "Boost", purple)],
          },
        ],
      },
      {
        title: "Fuel",
        charts: [
          {
            chartTitle: "Fuel rate",
            unit: "L/h",
            keys: [key("fuelRate", "Fuel rate", blue), key("tripAverageFuelRate", "Trip average", purple)],
          },
        ],
      },
      {
        title: "Transmission",
        charts: [
          { chartTitle: "Oil pressure", unit: "kPa", fill: true, showLegend: false, keys: [key("transmissionOilPressure", "Oil pressure", blue)] },
          { chartTitle: "Oil temperature", unit: "°C", fill: true, showLegend: false, keys: [key("transmissionOilTemperature", "Oil temperature", purple)] },
        ],
      },
      {
        title: "Electrical & filters",
        charts: [
          { chartTitle: "Battery potential", unit: "V", fill: true, showLegend: false, keys: [key("batteryPotential", "Battery", blue)] },
          {
            chartTitle: "Filter differential pressure",
            unit: "kPa",
            keys: [key("fuelFilterDifferentialPressure", "Fuel filter", sky), key("oilFilterDifferentialPressure", "Oil filter", amber)],
          },
        ],
      },
    ];
  }

  // -- misc -------------------------------------------------------------------

  private loadUserPreferences(): void {
    this.ctx.userSettingsService
      .loadUserSettings()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((settings: any) => {
        this.darkMode = !!settings?.[this.themeSettingKey];
        const savedMap = settings?.[this.mapSettingKey];
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

  /** navStatus telemetry: a code (number or numeric string) or a text label. */
  private toNavStatus(raw: any): NavStatus {
    if (raw == null || raw === "") {
      return null;
    }
    const n = this.toNumber(raw);
    return n != null ? n : String(raw).trim();
  }

  private toNumber(raw: any): number | null {
    if (raw === "" || raw == null) {
      return null;
    }
    const n = Number(raw);
    return isFinite(n) ? n : null;
  }
}
