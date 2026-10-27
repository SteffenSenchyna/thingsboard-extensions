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
  DataKeyType,
  Datasource,
  DatasourceType,
  Direction,
  EntityDataQuery,
  EntityFilter,
  EntityKeyType,
  RealtimeWindowType,
  SharedModule,
  TimewindowType,
  widgetType,
} from "@shared/public-api";
import type { AlarmService } from "@core/http/alarm.service";
import { WidgetContext } from "@home/models/widget-component.models";
import { DataTableCellDirective, DataTableColumn, DataTableComponent } from "../../../components/shared/data-table/data-table.component";
import { ThemeToggleComponent } from "../../../components/shared/theme-toggle/theme-toggle.component";
import { SidebarLayoutComponent } from "../../../components/shared/sidebar-layout/sidebar-layout.component";
import { FilterSectionComponent } from "../../../components/shared/filter-section/filter-section.component";
import { FilterListComponent, FilterListOption } from "../../../components/shared/filter-list/filter-list.component";
import { CheckFilterComponent } from "../../../components/shared/check-filter/check-filter.component";
import { keepsSidePanelOpen } from "../../../components/shared/detail-panel/side-panel-outside-click";
import { EntityDetailPanelComponent } from "../../../components/shared/entity-detail-panel/entity-detail-panel.component";
import { SegmentOption, SegmentedControlComponent } from "../../../components/shared/segmented-control/segmented-control.component";
import { MetricChartCardComponent, MetricChartSection } from "../../../components/shared/metric-chart-card/metric-chart-card.component";
import { MapCardComponent, MapLocation, MapType } from "../../../components/shared/map-card/map-card.component";
import { StatusPillComponent, StatusPillTone } from "../../../components/shared/status-pill/status-pill.component";
import { HeaderIconButtonComponent } from "../../../components/shared/header-icon-button/header-icon-button.component";
import { AlarmListComponent } from "../../../components/shared/alarm-list/alarm-list.component";
import { injectCss } from "../../../components/shared/cdn-loader";
import { formatClockTime } from "../../../components/shared/time-format";

/** Sidebar views: the Vessels table or the fleet map. */
type MarineView = "vessels" | "map";

/** Derived vessel state — from the latest speed, engine speed and report age. */
type VesselStatus = "underway" | "idle" | "moored" | "offline";

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
  /** Call sign (server attribute), shown in the name cell's meta line. */
  callSign: string;
  /** Home port (server attribute) — the sidebar filter; "" = unassigned. */
  homePort: string;
  engineCount: number;
  engines: EngineReading[];
  status: VesselStatus;
  /** GPS: speed over ground (kn), heading (°), position. */
  speed: number | null;
  heading: number | null;
  lat: number | null;
  lng: number | null;
  /** Newest telemetry timestamp of any key (ms), or null. */
  lastSeen: number | null;
  alarmCount: number;
  /** Active alarm types mention coolant / oil pressure — colour those values red. */
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
  heading: string;
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
  speed: "speed",
  heading: "heading",
  callSign: "callSign",
  homePort: "homePort",
  engineCount: "engineCount",
  engine: {
    engineSpeed: "engineSpeed",
    percentLoad: "percentLoadAtCurrentSpeed",
    coolantTemperature: "coolantTemperature",
    engineOilTemperature: "engineOilTemperature",
    intercoolerTemperature: "intercoolerTemperature",
    fuelDeliveryPressure: "fuelDeliveryPressure",
    engineOilPressure: "engineOilPressure",
    boostPressure: "boostPressure",
    intakeManifoldTemperature: "intakeManifoldTemperature",
    rightExhaustGasTemperature: "rightExhaustGasTemperature",
    leftExhaustGasTemperature: "leftExhaustGasTemperature",
    batteryPotential: "batteryPotential",
    transmissionOilPressure: "transmissionOilPressure",
    transmissionOilTemperature: "transmissionOilTemperature",
    fuelRate: "fuelRate",
    fuelFilterDifferentialPressure: "fuelFilterDifferentialPressure",
    oilFilterDifferentialPressure: "oilFilterDifferentialPressure",
    tripAverageFuelRate: "tripAverageFuelRate",
    totalEngineHours: "totalEngineHours",
    totalFuelUsed: "totalFuelUsed",
    totalIdleHours: "totalIdleHours",
    totalIdleFuelUsed: "totalIdleFuelUsed",
  },
  engineSuffixes: ["", "2"],
};

const ENGINE_METRICS = Object.keys(DEFAULT_KEYS.engine) as EngineMetric[];
const ENGINE_LABELS = ["Port", "Starboard", "Centre"];

/** Status → pill tone / icon / label (one scale: status.$success etc. via the pill tones). */
const STATUS_META: Record<VesselStatus, { label: string; tone: StatusPillTone; icon: string }> = {
  underway: { label: "Underway", tone: "success", icon: "navigation" },
  idle: { label: "Idle", tone: "warning", icon: "pause_circle" },
  moored: { label: "Moored", tone: "brand", icon: "anchor" },
  offline: { label: "Offline", tone: "neutral", icon: "cloud_off" },
};

/**
 * Marine fleet dashboard — tugboats with GPS + J1939-style engine telemetry.
 *
 * Same layout as the QC Lab and fuel dashboards: a filter sidebar (view
 * switcher, Status, Home ports), a top bar (alarms + theme), and the active
 * view — the Vessels table or the fleet map. A row (or marker) opens the
 * vessel detail panel: position, per-engine totals and the engine metric
 * charts; the header bell opens the grouped alarms panel.
 *
 * Widget settings (all optional): `deviceTypes` (default ["Tugboat"]),
 * `offlineAfterMinutes` (default 15) and `keys` (partial {@link MarineKeys}).
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
    ThemeToggleComponent,
    SidebarLayoutComponent,
    SegmentedControlComponent,
    FilterSectionComponent,
    FilterListComponent,
    CheckFilterComponent,
    EntityDetailPanelComponent,
    MetricChartCardComponent,
    MapCardComponent,
    StatusPillComponent,
    HeaderIconButtonComponent,
    AlarmListComponent,
  ],
})
export class MarineDashboardComponent implements OnInit, OnDestroy {
  @Input() ctx: WidgetContext;

  // -- views + sidebar filters ------------------------------------------------
  readonly views: SegmentOption[] = [
    { id: "vessels", label: "Vessels", icon: "directions_boat", tooltip: "Vessels" },
    { id: "map", label: "Map", icon: "map", tooltip: "Map" },
  ];
  view: MarineView = "vessels";
  sidebarOpen = true;
  /** Status filter (none checked = all). */
  statusFilter: string[] = [];
  statusOptions: FilterListOption[] = [];
  /** Home ports filter (none checked = all). */
  portFilter: string[] = [];
  portOptions: FilterListOption[] = [];
  portsListExpanded = false;

  /** Light/dark theme (persisted per user, shared across dashboards). */
  darkMode = false;
  private readonly themeSettingKey = "darkMode";
  mapType: MapType = "roadmap";
  private readonly mapSettingKey = "marineMapType";

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
  @ViewChild("vesselTable") private vesselTable?: DataTableComponent;
  @ViewChild("mapCard") private mapCard?: MapCardComponent;

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
  private alarmCounts = new Map<string, number>();
  private alarmFlags = new Map<string, { coolant: boolean; oil: boolean }>();

  private keys: MarineKeys = DEFAULT_KEYS;
  private deviceTypes = ["Tugboat"];
  private offlineAfterMs = 15 * 60 * 1000;
  private alarmService: AlarmService;
  private alarmsSubscription: any;
  private vesselsSubscription: any;
  private vesselsRefreshTimer?: any;
  private clockTimer?: any;

  constructor(private cd: ChangeDetectorRef, private destroyRef: DestroyRef) {}

  // -- derived ----------------------------------------------------------------

  get detailTabs(): SegmentOption[] {
    return [
      { id: "insights", label: "Insights", icon: "bar_chart", tooltip: "Insights" },
      { id: "alarms", label: "Alarms", icon: "notifications", tooltip: "Alarms", badge: this.selectedVessel?.alarmCount ?? 0 },
    ];
  }

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

  statusMeta(status: VesselStatus): { label: string; tone: StatusPillTone; icon: string } {
    return STATUS_META[status];
  }

  // -- lifecycle --------------------------------------------------------------

  ngOnInit(): void {
    this.ctx.$scope.marineDashboardComponent = this;
    injectCss("tb-ext-material-symbols-rounded", "https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200");
    this.applySettings();
    this.alarmService = this.ctx.$injector.get(this.ctx.servicesMap.get("alarmService")) as AlarmService;
    this.loadUserPreferences();
    this.subscribeAlarms();
    this.loadVessels();
    this.subscribeVessels();
  }

  ngOnDestroy(): void {
    if (this.alarmsSubscription) {
      this.ctx.subscriptionApi.removeSubscription(this.alarmsSubscription.id);
    }
    if (this.vesselsSubscription) {
      this.ctx.subscriptionApi.removeSubscription(this.vesselsSubscription.id);
    }
    clearTimeout(this.vesselsRefreshTimer);
    this.stopClock();
  }

  /** ThingsBoard hooks — data comes from our own subscriptions, so just re-render. */
  onDataUpdated(): void {
    this.ctx.detectChanges();
  }

  onResize(): void {
    this.mapCard?.invalidateSize();
    this.cd.detectChanges();
  }

  @HostListener("document:pointerdown", ["$event"])
  onDocumentPointerDown(event: Event): void {
    if (!this.detailOpen || keepsSidePanelOpen(event.target)) {
      return;
    }
    this.closeDetail();
    this.cd.detectChanges();
  }

  // -- sidebar ----------------------------------------------------------------

  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
    // The map's container width changes once the sidebar has slid; re-measure then.
    setTimeout(() => this.mapCard?.invalidateSize(), 300);
  }

  selectView(id: string): void {
    if (id === this.view) {
      return;
    }
    this.view = id as MarineView;
    if (this.view === "map") {
      // The map was hidden (display:none) — Leaflet needs a re-measure.
      setTimeout(() => this.mapCard?.invalidateSize());
    }
  }

  onStatusFilterChange(ids: string[]): void {
    this.statusFilter = ids;
    this.applyFilters();
  }

  onPortFilterChange(ids: string[]): void {
    this.portFilter = ids;
    this.applyFilters();
  }

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

  // -- detail panel -----------------------------------------------------------

  onVesselRowClick(row: Record<string, any>): void {
    const vessel = row as VesselRow;
    if (this.detailOpen && this.selectedVessel?.deviceId === vessel.deviceId) {
      this.closeDetail();
      return;
    }
    this.openDetail(vessel);
  }

  openDetail(vessel: VesselRow): void {
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

  // -- formatting helpers (templates) -----------------------------------------

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
    if (value == null) {
      return "—";
    }
    const points = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    const idx = Math.round((((value % 360) + 360) % 360) / 45) % 8;
    return `${Math.round(value)}° ${points[idx]}`;
  }

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

  // -- data: vessels ----------------------------------------------------------

  private applySettings(): void {
    const s = (this.ctx.settings ?? {}) as { deviceTypes?: string[]; offlineAfterMinutes?: number; keys?: Partial<MarineKeys> };
    if (Array.isArray(s.deviceTypes) && s.deviceTypes.length) {
      this.deviceTypes = s.deviceTypes;
    }
    if (typeof s.offlineAfterMinutes === "number" && s.offlineAfterMinutes > 0) {
      this.offlineAfterMs = s.offlineAfterMinutes * 60 * 1000;
    }
    if (s.keys) {
      this.keys = { ...DEFAULT_KEYS, ...s.keys, engine: { ...DEFAULT_KEYS.engine, ...(s.keys.engine ?? {}) } };
    }
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
        ...[k.latitude, k.longitude, k.speed, k.heading, ...this.engineTsKeys].map((key) => ({ type: EntityKeyType.TIME_SERIES, key })),
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
          this.refreshSelectedVessel();
          this.applyFilters();
          this.cd.detectChanges();
        },
        error: () => {
          this.vesselsLoading = false;
          this.cd.detectChanges();
        },
      });
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
    const maxOf = (m: EngineMetric) => engines.map((e) => e[m]).filter((v): v is number => v != null).reduce((a, b) => Math.max(a, b), -Infinity);
    const sortValue = (m: EngineMetric) => (engines.some((e) => e[m] != null) ? maxOf(m) : null);
    const flags = this.alarmFlags.get(deviceId);

    return {
      deviceId,
      name: label || name || "Unknown vessel",
      callSign: attrs[k.callSign]?.value ?? "",
      homePort: attrs[k.homePort]?.value ?? "",
      engineCount,
      engines,
      status: this.deriveStatus(speed, sortValue("engineSpeed"), lastSeen),
      speed,
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

  /** Offline when nothing reported recently; moored with the engines stopped;
   *  idle when running but not moving; underway otherwise. */
  private deriveStatus(speed: number | null, rpm: number | null, lastSeen: number | null): VesselStatus {
    if (!lastSeen || Date.now() - lastSeen > this.offlineAfterMs) {
      return "offline";
    }
    if (!rpm) {
      return "moored";
    }
    return (speed ?? 0) < 1 ? "idle" : "underway";
  }

  /** Rebuild the sidebar option counts, the filtered rows and the map markers. */
  private applyFilters(): void {
    const byStatus = (r: VesselRow) => !this.statusFilter.length || this.statusFilter.includes(r.status);
    const byPort = (r: VesselRow) => !this.portFilter.length || this.portFilter.includes(r.homePort);

    const statusCounts = new Map<VesselStatus, number>();
    for (const r of this.vesselsRows.filter(byPort)) {
      statusCounts.set(r.status, (statusCounts.get(r.status) ?? 0) + 1);
    }
    this.statusOptions = (Object.keys(STATUS_META) as VesselStatus[]).map((s) => ({ id: s, label: STATUS_META[s].label, count: statusCounts.get(s) ?? 0 }));

    const portCounts = new Map<string, number>();
    for (const r of this.vesselsRows.filter(byStatus)) {
      portCounts.set(r.homePort, (portCounts.get(r.homePort) ?? 0) + 1);
    }
    const ports = [...new Set(this.vesselsRows.map((r) => r.homePort))].sort((a, b) => (a || "~").localeCompare(b || "~"));
    this.portOptions = ports.map((p) => ({ id: p, label: p || "Unassigned", count: portCounts.get(p) ?? 0 }));
    this.portFilter = this.portFilter.filter((p) => ports.includes(p));

    this.tableRows = this.vesselsRows.filter((r) => byStatus(r) && byPort(r));
    this.setMapLocations(this.tableRows.filter((r) => r.lat != null && r.lng != null).map((r) => ({ name: r.name, lat: r.lat as number, lng: r.lng as number })));

    const listed = new Set(this.tableRows.map((r) => r.deviceId));
    if (this.detailOpen && this.selectedVessel && !listed.has(this.selectedVessel.deviceId)) {
      this.closeDetail();
    }
    this.applyAlarmFilter();
  }

  /** Replace the markers only when positions changed, so the map doesn't re-fit on every reload. */
  private setMapLocations(locs: MapLocation[]): void {
    const key = (a: MapLocation[]) => a.map((l) => `${l.name}:${l.lat}:${l.lng}`).sort().join("|");
    if (key(locs) !== key(this.mapLocations)) {
      this.mapLocations = locs;
    }
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
      ...[k.latitude, k.longitude, k.speed, k.heading, ...this.engineTsKeys].map((name) => ({ name, label: name, type: DataKeyType.timeseries, settings: {} })),
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
      entityFilter: this.deviceFilter,
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
          null,
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

  private toNumber(raw: any): number | null {
    if (raw === "" || raw == null) {
      return null;
    }
    const n = Number(raw);
    return isFinite(n) ? n : null;
  }
}
