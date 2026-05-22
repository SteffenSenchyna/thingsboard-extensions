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

import { AfterViewInit, ChangeDetectorRef, Component, DestroyRef, Input, OnDestroy, OnInit, ViewChild } from "@angular/core";
import { CommonModule } from "@angular/common";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { forkJoin } from "rxjs";
import { map, switchMap } from "rxjs/operators";
import { WidgetSubscriptionOptions } from "@core/public-api";
import { SharedModule } from "@shared/public-api";
import {
  AggregationType,
  AlarmSearchStatus,
  AliasFilterType,
  DataKeyType,
  Datasource,
  DatasourceType,
  Direction,
  EntityDataQuery,
  EntityFilter,
  EntityKeyType,
  EntityType,
  historyInterval,
  widgetType,
} from "@shared/public-api";
import type { AlarmService } from "@core/http/alarm.service";
import {
  DataTableAction,
  DataTableCellDirective,
  DataTableColumn,
  DataTableComponent,
} from "../../../components/shared/data-table/data-table.component";
import { TrendChartComponent, TrendPoint } from "../../../components/shared/trend-chart/trend-chart.component";
import { ThemeToggleComponent } from "../../../components/shared/theme-toggle/theme-toggle.component";
import {
  SegmentOption,
  SegmentedControlComponent,
} from "../../../components/shared/segmented-control/segmented-control.component";
import { MapCardComponent, MapLocation, MapType } from "../../../components/shared/map-card/map-card.component";
import { TabBarComponent } from "../../../components/shared/tab-bar/tab-bar.component";
import { injectCss } from "../../../components/shared/cdn-loader";
import { WidgetContext } from "@home/models/widget-component.models";

/** Rolling time window (now − period) for the consumption table + chart. */
type Timeframe = "24h" | "31d" | "1y";

/** A tab in the widget header (Overview / Analytics / Users). */
interface DashboardTab {
  id: string;
  label: string;
  icon: string;
}

/** A binary status tile (door / motion). */
interface StatusCard {
  id: string;
  label: string;
  icon: string;
  value: string;
  alert: boolean;
}

/** A single numeric metric tile. */
interface MetricCard {
  id: string;
  label: string;
  icon: string;
  value: string;
  units: string;
}

/** One alarm row in the Alarms list. */
interface AlarmRow {
  id: string;
  createdTime: number;
  originatorName: string;
  /** Originator device id — used to tally active alarms per site. */
  originatorId: string;
  type: string;
  severity: string;
  acknowledged: boolean;
  cleared: boolean;
  /** Precomputed visible text, used by the base table's search filter. */
  searchText: string;
}

@Component({
  selector: "tb-water-metering-dashboard",
  templateUrl: "./water-metering-dashboard.component.html",
  styleUrls: ["./water-metering-dashboard.component.scss"],
  standalone: true,
  imports: [
    CommonModule,
    SharedModule,
    DataTableComponent,
    DataTableCellDirective,
    TrendChartComponent,
    ThemeToggleComponent,
    SegmentedControlComponent,
    MapCardComponent,
    TabBarComponent,
  ],
})
export class WaterMeteringDashboardComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() ctx: WidgetContext;

  @ViewChild(TrendChartComponent) trendChart?: TrendChartComponent;
  @ViewChild(MapCardComponent) mapCard?: MapCardComponent;

  /** Device types listed by this dashboard (== device profile names). */
  readonly deviceTypes = ["Water Meter", "Milesight-EM300-DI"];

  meterName = "Water metering";

  readonly tabs: DashboardTab[] = [{ id: "overview", label: "Overview", icon: "dashboard" }];
  activeTab = "overview";

  /** Light/dark theme toggle (persisted per-user server-side, shared across dashboards). */
  darkMode = false;
  private readonly themeSettingKey = "darkMode";
  private readonly mapSettingKey = "waterMeteringMapType";

  statusCards: StatusCard[] = [];
  metricCards: MetricCard[] = [];

  chargingState = "Charging";
  chargingActive = true;
  chargingVoltage = "11.99";
  batteryVoltage = "110.15";

  // Stock-ticker widget — single device + one timeseries key (hardcoded for now).
  private readonly tickerDeviceName = "24e1241360566b58";
  private readonly tickerKey = "hourlyConsumption";
  readonly tickerSymbol = "Water Consumption";
  readonly tickerUnit = "L";
  tickerLoading = true;
  tickerSeries: TrendPoint[] = []; // fed to <tb-trend-chart>; rendering lives there

  // Sites table (assets of type "Site" related to a Milesight-EM300-DI device).
  readonly sitesColumns: DataTableColumn[] = [
    // Rendered via a projected cell template (title + facility/devices meta).
    { key: "name", header: "Site" },
    {
      key: "consumption",
      header: "Water Consumption",
      align: "right",
      copyable: true,
      copyWidth: "150px",
      copyValueKey: "consumptionCopy",
    },
  ];
  sitesRows: {
    siteId: string;
    name: string;
    facility: string;
    deviceCount: number;
    alarmCount: number;
    consumption: string;
    consumptionCopy: string;
    consumptionRaw: string;
  }[] = [];
  sitesLoading = false;
  /** deviceId → siteId, and active-alarm tallies per site (resolved in loadSites). */
  private siteIdByDeviceId = new Map<string, string>();
  private siteAlarmCount = new Map<string, number>();
  /** When true, the Water Consumption column shows m³ instead of litres. */
  consumptionInCubicMeters = false;

  // Rolling time window for the consumption table + chart: the range is the
  // current time minus the selected period. Persisted per-user (server-side).
  timeframe: Timeframe = "24h";
  private readonly timeframeSettingKey = "waterMeteringTimeframe";
  readonly timeframeOptions: SegmentOption[] = [
    { id: "24h", label: "24h" },
    { id: "31d", label: "31d" },
    { id: "1y", label: "1y" },
  ];
  private readonly timeframeMs: Record<Timeframe, number> = {
    "24h": 24 * 60 * 60 * 1000,
    "31d": 31 * 24 * 60 * 60 * 1000,
    "1y": 365 * 24 * 60 * 60 * 1000,
  };

  setTimeframe(tf: string): void {
    if (this.timeframe === tf) {
      return;
    }
    this.timeframe = tf as Timeframe;
    this.ctx.userSettingsService
      .putUserSettings({ [this.timeframeSettingKey]: tf } as any)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe();
    this.loadSites();
    this.loadTicker();
  }

  /** Rolling window: [now − selected period, now]. */
  private timeframeRange(): { startTs: number; endTs: number } {
    const endTs = Date.now();
    return { startTs: endTs - (this.timeframeMs[this.timeframe] ?? this.timeframeMs["24h"]), endTs };
  }
  /**
   * Header actions for the Sites table. Kept as a stable reference (mutated in
   * place) so the table's *ngFor doesn't recreate the buttons every change
   * detection cycle — recreation would break the matTooltip on hover.
   */
  readonly sitesActions: DataTableAction[] = [
    {
      id: "toggle-consumption-unit",
      icon: "swap_horiz",
      // Stable label describing the action — changing it on click would morph the
      // visible tooltip just before it dismisses, which looks jarring.
      tooltip: "Convert units",
      active: false,
    },
    { id: "open-map", icon: "map", tooltip: "Map" },
  ];

  /** Whether the map popup dialog is open. */
  mapDialogOpen = false;
  /** Whether the alarms popup dialog is open. */
  alarmDialogOpen = false;
  /** Close button shown in each popup's header. */
  readonly mapHeaderActions = [{ id: "close", icon: "close", tooltip: "Close" }];
  // Header actions for the alarm popup (kept mutable so "filter" can toggle its
  // active highlight in place).
  readonly alarmDialogActions: DataTableAction[] = [
    { id: "filter", icon: "filter_list", tooltip: "Filter by severity", active: false },
    { id: "close", icon: "close", tooltip: "Close" },
  ];
  alarmFilterOpen = false;
  alarmSeverityFilter: string | null = null;
  /** Severity filter options (value matches the alarm severity, UPPER_CASE). */
  readonly alarmSeverities = [
    { value: "WARNING", label: "Warning" },
    { value: "MINOR", label: "Minor" },
    { value: "MAJOR", label: "Major" },
    { value: "CRITICAL", label: "Critical" },
  ];
  /** Alarm rows shown in the popup (after the severity filter). */
  displayedAlarms: AlarmRow[] = [];

  /** Number of active alarms (drives the header badge) — always the unfiltered total. */
  get activeAlarmCount(): number {
    return this.alarmsRows.length;
  }

  onMapHeaderAction(id: string): void {
    if (id === "close") {
      this.mapDialogOpen = false;
    }
  }

  onAlarmAction(id: string): void {
    if (id === "close") {
      this.alarmDialogOpen = false;
      return;
    }
    if (id === "filter") {
      this.alarmFilterOpen = !this.alarmFilterOpen;
      this.alarmDialogActions[0].active = this.alarmFilterOpen;
      if (!this.alarmFilterOpen) {
        this.alarmSeverityFilter = null; // closing the filter bar clears the filter
        this.applyAlarmFilter();
      }
    }
  }

  /** Toggle the severity filter (clicking the active one clears it). */
  toggleAlarmSeverity(value: string): void {
    this.alarmSeverityFilter = this.alarmSeverityFilter === value ? null : value;
    this.applyAlarmFilter();
  }

  private applyAlarmFilter(): void {
    const f = this.alarmSeverityFilter;
    this.displayedAlarms = f ? this.alarmsRows.filter((r) => (r.severity || "").toUpperCase() === f) : this.alarmsRows;
  }

  /** Close the map popup only when the backdrop itself (not its content) is clicked. */
  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.mapDialogOpen = false;
    }
  }

  /** Close the alarms popup only when the backdrop itself is clicked. */
  onAlarmBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.alarmDialogOpen = false;
    }
  }

  onSitesAction(id: string): void {
    if (id === "open-map") {
      this.openMap();
      return;
    }
    if (id === "toggle-consumption-unit") {
      this.consumptionInCubicMeters = !this.consumptionInCubicMeters;
      this.sitesActions[0].active = this.consumptionInCubicMeters;
      this.sitesRows = this.sitesRows.map((r) => ({
        ...r,
        consumption: this.formatConsumption(r.consumptionRaw),
        consumptionCopy: this.consumptionCopyValue(r.consumptionRaw),
      }));
    }
  }

  /** Open the map popup and size the Leaflet map once it has rendered. */
  openMap(): void {
    this.mapDialogOpen = true;
    setTimeout(() => this.mapCard?.invalidateSize());
  }

  /** Convert a raw litre value to the current display unit; null when not numeric. */
  private convertConsumption(raw: string): number | null {
    if (raw === "" || raw == null) {
      return null;
    }
    const litres = Number(raw);
    if (!isFinite(litres)) {
      return null;
    }
    const value = this.consumptionInCubicMeters ? litres / 1000 : litres;
    return Math.round(value * 1000) / 1000;
  }

  /** Display value with unit for the Water Consumption column, e.g. "23.396 m³" (or "—"). */
  private formatConsumption(raw: string): string {
    const value = this.convertConsumption(raw);
    if (value === null) {
      return "—";
    }
    return `${value} ${this.consumptionInCubicMeters ? "m³" : "L"}`;
  }

  /** Unit-less value copied from the Water Consumption box, e.g. "23.396" (empty when not numeric). */
  private consumptionCopyValue(raw: string): string {
    const value = this.convertConsumption(raw);
    return value === null ? "" : `${value}`;
  }

  // Single rich-cell column rendered via a projected template (see HTML).
  readonly alarmColumns: DataTableColumn[] = [{ key: "alarm", header: "" }];
  alarmsRows: AlarmRow[] = [];
  alarmsLoading = false;

  // Map base layer — owned here for per-user persistence; rendering lives in
  // <tb-map-card>, which receives [mapType] and emits (mapTypeChange).
  mapType: MapType = "roadmap";
  // Markers for the Site assets (same filtered set as the Sites table); resolved
  // in loadSites(). Fed to <tb-map-card>.
  mapLocations: MapLocation[] = [];

  private alarmService: AlarmService;

  // Custom subscriptions created in code — no widget datasource required.
  private alarmsSubscription: any;
  private sitesSubscription: any;

  /** Replace the map markers, but only when the positions actually changed (so the
   *  map doesn't re-fit on every timeframe reload). */
  private setMapLocations(locs: MapLocation[]): void {
    const key = (a: MapLocation[]) =>
      a
        .map((l) => `${l.name}:${l.lat}:${l.lng}`)
        .sort()
        .join("|");
    if (key(locs) !== key(this.mapLocations)) {
      this.mapLocations = locs;
    }
  }

  constructor(private cd: ChangeDetectorRef, private destroyRef: DestroyRef) {}

  ngOnInit(): void {
    this.ctx.$scope.waterMeteringDashboardComponent = this;
    // Load the Material Symbols Rounded variable font so all dashboard icons can
    // use the rounded variant (and so the map's "recenter" symbol resolves).
    injectCss(
      "tb-ext-material-symbols-rounded",
      "https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200",
    );
    this.alarmService = this.ctx.$injector.get(this.ctx.servicesMap.get("alarmService")) as AlarmService;
    this.loadUserPreferences();

    this.resolveEntityName();
    this.buildDefaults();
    this.applyContextData();

    this.subscribeAlarms();
    this.loadSites(); // Sites table + map markers
    this.subscribeSites(); // live updates when Site lat/long change
    this.loadTicker(); // stock-ticker widget
  }

  ngOnDestroy(): void {
    if (this.alarmsSubscription) {
      this.ctx.subscriptionApi.removeSubscription(this.alarmsSubscription.id);
    }
    if (this.sitesSubscription) {
      this.ctx.subscriptionApi.removeSubscription(this.sitesSubscription.id);
    }
  }

  ngAfterViewInit(): void {
    this.cd.detectChanges();
  }

  /** Called by ThingsBoard whenever subscription data changes. */
  onDataUpdated(): void {
    this.applyContextData();
    this.ctx.detectChanges();
  }

  /** Called by ThingsBoard when the widget is resized. */
  onResize(): void {
    this.mapCard?.invalidateSize();
    this.trendChart?.resize();
  }

  selectTab(tabId: string): void {
    this.activeTab = tabId;
    if (tabId === "overview") {
      // Map + chart need a re-measure after being hidden/shown.
      this.mapCard?.invalidateSize();
      this.trendChart?.resize();
    }
  }

  onMapTypeChange(type: MapType): void {
    this.mapType = type;
    // Persist per-user.
    this.ctx.userSettingsService
      .putUserSettings({ [this.mapSettingKey]: type } as any)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe();
  }

  toggleTheme(): void {
    this.darkMode = !this.darkMode;
    // Apply the `.dark` class to the DOM *before* the chart re-reads the theme
    // tokens via getComputedStyle, otherwise it paints with the old theme.
    this.cd.detectChanges();
    // Persist to the logged-in user's settings (merged server-side).
    this.ctx.userSettingsService
      .putUserSettings({ [this.themeSettingKey]: this.darkMode } as any)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe();
    this.mapCard?.invalidateSize();
    // The chart + map re-theme themselves via their [dark] input bindings.
  }

  private loadUserPreferences(): void {
    this.ctx.userSettingsService
      .loadUserSettings()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((settings: any) => {
        this.darkMode = !!settings?.[this.themeSettingKey];
        const savedMap = settings?.[this.mapSettingKey];
        if (savedMap === "roadmap" || savedMap === "satellite" || savedMap === "hybrid") {
          // <tb-map-card> applies the layer via its [mapType] input.
          this.mapType = savedMap;
        }
        // The initial loadSites() in ngOnInit assumes the default "24h"; if the
        // user saved a different window, switch to it and reload.
        const savedTf = settings?.[this.timeframeSettingKey];
        if ((savedTf === "24h" || savedTf === "31d" || savedTf === "1y") && this.timeframe !== savedTf) {
          this.timeframe = savedTf;
          this.loadSites();
          this.loadTicker();
        }
        this.cd.detectChanges();
        this.mapCard?.invalidateSize();
      });
  }

  ackAlarm(alarm: AlarmRow): void {
    if (alarm.acknowledged) {
      return;
    }
    // Optimistically disable the button; the live subscription confirms it.
    alarm.acknowledged = true;
    this.alarmService
      .ackAlarm(alarm.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ error: () => (alarm.acknowledged = false) });
  }

  clearAlarm(alarm: AlarmRow): void {
    if (alarm.cleared) {
      return;
    }
    alarm.cleared = true;
    this.alarmService
      .clearAlarm(alarm.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ error: () => (alarm.cleared = false) });
  }

  // -- live subscriptions (no configured datasource required) ----------------

  /** Entity filter selecting both configured device types. */
  private get deviceFilter(): EntityFilter {
    return {
      type: AliasFilterType.deviceType,
      deviceTypes: this.deviceTypes,
      deviceNameFilter: "",
    };
  }

  /**
   * Live "latest" subscription over the Site assets' latitude/longitude. When a
   * Site's coordinates change (or are first added), reload the sites so the map
   * + table update without a page refresh. The initial emission is skipped — the
   * explicit loadSites() in ngOnInit already covers the first render.
   */
  private subscribeSites(): void {
    const datasources: Datasource[] = [
      {
        type: DatasourceType.entity,
        name: "sites",
        entityFilter: { type: AliasFilterType.assetType, assetTypes: ["Site"], assetNameFilter: "" } as EntityFilter,
        dataKeys: [
          { name: "latitude", label: "latitude", type: DataKeyType.attribute, settings: {} },
          { name: "longitude", label: "longitude", type: DataKeyType.attribute, settings: {} },
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
          this.loadSites();
        },
      },
    };

    this.ctx.subscriptionApi
      .createSubscription(options, true)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((subscription) => {
        this.sitesSubscription = subscription;
      });
  }

  /**
   * Load assets of type "Site" that have a relation to a Milesight-EM300-DI
   * device. Resolves Site assets and Milesight device ids, then walks relations
   * from each device up to its parent Site.
   *
   * Relation lookups fan out over the (bounded) Milesight device set rather than
   * over every Site, so Sites with no Milesight device cost no relation calls —
   * cheap even with hundreds of Sites.
   */
  private loadSites(): void {
    this.sitesLoading = true;

    const siteQuery: EntityDataQuery = {
      entityFilter: { type: AliasFilterType.assetType, assetTypes: ["Site"], assetNameFilter: "" } as EntityFilter,
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
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: "facilityId" },
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: "latitude" },
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: "longitude" },
      ],
    };
    const deviceQuery: EntityDataQuery = {
      entityFilter: { type: AliasFilterType.deviceType, deviceTypes: ["Milesight-EM300-DI"], deviceNameFilter: "" } as EntityFilter,
      pageLink: {
        pageSize: 1024,
        page: 0,
        sortOrder: { key: { type: EntityKeyType.ENTITY_FIELD, key: "name" }, direction: Direction.ASC },
      },
      entityFields: [{ type: EntityKeyType.ENTITY_FIELD, key: "name" }],
    };

    const cfg = { ignoreLoading: true, ignoreErrors: true };
    forkJoin([
      this.ctx.entityService.findEntityDataByQuery(deviceQuery, cfg),
      this.ctx.entityService.findEntityDataByQuery(siteQuery, cfg),
    ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ([devicesPage, sitesPage]) => {
          const deviceNameById = new Map<string, string>();
          for (const d of devicesPage.data) {
            deviceNameById.set(d.entityId.id, d.latest?.[EntityKeyType.ENTITY_FIELD]?.["name"]?.value ?? "");
          }
          const siteNameById = new Map<string, string>();
          const siteFacilityById = new Map<string, string>();
          const siteLatLngById = new Map<string, { lat: number; lng: number }>();
          for (const ed of sitesPage.data) {
            const fields = ed.latest?.[EntityKeyType.ENTITY_FIELD] ?? {};
            const attrs = ed.latest?.[EntityKeyType.SERVER_ATTRIBUTE] ?? {};
            const id = ed.entityId.id;
            siteNameById.set(id, fields["label"]?.value || fields["name"]?.value || "Unknown site");
            siteFacilityById.set(id, attrs["facilityId"]?.value ?? "");
            const lat = parseFloat(attrs["latitude"]?.value);
            const lng = parseFloat(attrs["longitude"]?.value);
            if (isFinite(lat) && isFinite(lng)) {
              siteLatLngById.set(id, { lat, lng });
            }
          }

          if (!siteNameById.size || !deviceNameById.size) {
            this.sitesRows = [];
            this.setMapLocations([]);
            this.sitesLoading = false;
            this.cd.detectChanges();
            return;
          }

          // One relation call per Milesight device (the bounded set). For each,
          // walk "to" → find the parent Site asset, and group device names by Site.
          const lookups = Array.from(deviceNameById.keys()).map((deviceId) =>
            this.ctx.entityRelationService.findByTo({ entityType: EntityType.DEVICE, id: deviceId }, cfg).pipe(
              map((relations: any[]) => {
                const siteRel = (relations ?? []).find(
                  (r) => r.from?.entityType === EntityType.ASSET && siteNameById.has(r.from.id),
                );
                return siteRel ? { siteId: siteRel.from.id, deviceId, deviceName: deviceNameById.get(deviceId) ?? "" } : null;
              }),
            ),
          );

          forkJoin(lookups)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((pairs) => {
              const devicesBySite = new Map<string, Set<string>>();
              this.siteIdByDeviceId = new Map<string, string>();
              for (const pair of pairs) {
                if (!pair || !pair.deviceName) {
                  continue;
                }
                this.siteIdByDeviceId.set(pair.deviceId, pair.siteId);
                const set = devicesBySite.get(pair.siteId) ?? new Set<string>();
                set.add(pair.deviceName);
                devicesBySite.set(pair.siteId, set);
              }

              const siteIds = Array.from(devicesBySite.keys());

              // Plot a marker for every matched Site that has coordinates (same
              // filtered set as the table).
              this.setMapLocations(
                siteIds
                  .filter((id) => siteLatLngById.has(id))
                  .map((id) => ({
                    name: siteNameById.get(id) ?? "Unknown site",
                    ...siteLatLngById.get(id)!,
                  })),
              );

              if (!siteIds.length) {
                this.sitesRows = [];
                this.sitesLoading = false;
                this.cd.detectChanges();
                return;
              }

              // Sum hourlyConsumption over the selected window. Fetch the raw
              // points (no server aggregation) and add them up client-side so the
              // total is unambiguous and changes with the Today/Week/Month window.
              const { startTs, endTs } = this.timeframeRange();
              const consumptionLookups = siteIds.map((siteId) =>
                this.ctx.attributeService
                  .getEntityTimeseries(
                    { entityType: EntityType.ASSET, id: siteId },
                    ["hourlyConsumption"],
                    startTs,
                    endTs,
                    10000,
                    AggregationType.NONE,
                    undefined,
                    undefined,
                    false,
                    cfg,
                  )
                  .pipe(
                    map((data: any) => {
                      const points: any[] = data?.["hourlyConsumption"] ?? [];
                      const sum = points.reduce((acc, p) => acc + (Number(p.value) || 0), 0);
                      return { siteId, value: points.length ? `${sum}` : "" };
                    }),
                  ),
              );

              forkJoin(consumptionLookups)
                .pipe(takeUntilDestroyed(this.destroyRef))
                .subscribe((results) => {
                  const consumptionBySite = new Map<string, string>();
                  for (const r of results) {
                    consumptionBySite.set(r.siteId, r.value);
                  }

                  this.sitesRows = siteIds
                    .map((siteId) => {
                      const facility = siteFacilityById.get(siteId) ?? "";
                      const consumptionRaw = consumptionBySite.get(siteId) ?? "";
                      return {
                        siteId,
                        name: siteNameById.get(siteId) ?? "Unknown site",
                        facility,
                        deviceCount: devicesBySite.get(siteId)?.size ?? 0,
                        alarmCount: this.siteAlarmCount.get(siteId) ?? 0,
                        consumptionRaw,
                        consumption: this.formatConsumption(consumptionRaw),
                        consumptionCopy: this.consumptionCopyValue(consumptionRaw),
                      };
                    })
                    .sort((a, b) => a.name.localeCompare(b.name));
                  this.sitesLoading = false;
                  // Re-tally active alarms now that the device→site map is current.
                  this.applyAlarmCounts();
                  this.cd.detectChanges();
                });
            });
        },
        error: () => {
          this.sitesLoading = false;
          this.cd.detectChanges();
        },
      });
  }

  /**
   * Stock-ticker widget: resolve the device by name, then pull the raw
   * `meterReadingDelta` series for the sparkline + open/high/low/current.
   */
  private loadTicker(): void {
    this.tickerLoading = true;
    const cfg = { ignoreLoading: true, ignoreErrors: true };
    const { startTs, endTs } = this.timeframeRange();
    this.ctx.deviceService
      .findByName(this.tickerDeviceName, cfg)
      .pipe(
        switchMap((device: any) =>
          this.ctx.attributeService.getEntityTimeseries(
            device.id,
            [this.tickerKey],
            startTs,
            endTs,
            10000, // enough raw points to cover the whole window (no truncation)
            AggregationType.NONE,
            undefined,
            undefined,
            false,
            cfg,
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (data: any) => this.applyTickerData(data?.[this.tickerKey] ?? []),
        error: () => {
          this.tickerLoading = false;
          this.tickerSeries = [];
          this.cd.detectChanges();
        },
      });
  }

  private applyTickerData(raw: { ts: number; value: any }[]): void {
    const points = (raw ?? [])
      .map((p) => ({ ts: p.ts, value: Number(p.value) }))
      .filter((p) => isFinite(p.value));
    // Sum the hourly consumption into the bucket that matches the window:
    // 24h → per hour, 31d → per day, 1y → per (calendar) month.
    const sums = new Map<number, number>();
    for (const p of points) {
      const key = this.bucketStart(p.ts);
      sums.set(key, (sums.get(key) ?? 0) + p.value);
    }
    // Emit a slot for every bucket across the full window (zeros where there is
    // no data) so the bars keep a constant width/spacing and sit in their real
    // positions — recent buckets on the right — instead of being stretched to
    // fill the chart.
    const { startTs, endTs } = this.timeframeRange();
    this.tickerSeries = this.bucketGrid(startTs, endTs).map((ts) => ({ ts, value: sums.get(ts) ?? 0 }));
    this.tickerLoading = false;
    this.cd.detectChanges();
  }

  /** Truncate a timestamp to the start of its bucket for the current window. */
  private bucketStart(ts: number): number {
    const d = new Date(ts);
    if (this.timeframe === "24h") {
      d.setMinutes(0, 0, 0); // start of the hour
    } else if (this.timeframe === "31d") {
      d.setHours(0, 0, 0, 0); // start of the day
    } else {
      d.setDate(1); // start of the (calendar) month
      d.setHours(0, 0, 0, 0);
    }
    return d.getTime();
  }

  /** Every bucket-start timestamp from the window start to now (inclusive). */
  private bucketGrid(startTs: number, endTs: number): number[] {
    const out: number[] = [];
    const d = new Date(this.bucketStart(startTs));
    const end = this.bucketStart(endTs);
    while (d.getTime() <= end) {
      out.push(d.getTime());
      if (this.timeframe === "24h") {
        d.setHours(d.getHours() + 1);
      } else if (this.timeframe === "31d") {
        d.setDate(d.getDate() + 1);
      } else {
        d.setMonth(d.getMonth() + 1);
      }
    }
    return out;
  }

  /**
   * Live alarm subscription over the same device set. Alarm subscriptions do
   * not auto-start, so subscribeForAlarms() must be called explicitly.
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

    // Alarm subscriptions require a timewindow — without one the platform
    // throws "Cannot read properties of null (reading 'realtimeWindowMs')".
    // A wide history window surfaces alarms of any age for these devices.
    const tenYearsMs = 10 * 365 * 24 * 60 * 60 * 1000;
    const options: WidgetSubscriptionOptions = {
      type: widgetType.alarm,
      alarmSource,
      useDashboardTimewindow: false,
      timeWindowConfig: historyInterval(tenYearsMs),
      callbacks: {
        onDataUpdated: (subscription) => this.onAlarmsSubscriptionUpdated(subscription),
      },
    };

    this.ctx.subscriptionApi
      .createSubscription(options, false)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((subscription) => {
        this.alarmsSubscription = subscription;
        // No startTs/endTs bound => return alarms of any age for these devices.
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
          null,
        );
      });
  }

  private onAlarmsSubscriptionUpdated(subscription: any): void {
    const alarms = subscription?.alarms?.data ?? [];
    this.alarmsRows = alarms.map((a: any) => {
      // Prefer the originator's display name / label, falling back to its name.
      const originatorName = a.originatorDisplayName || a.originatorLabel || a.originatorName || "";
      return {
        id: a.id?.id ?? a.id,
        createdTime: a.createdTime,
        originatorName,
        originatorId: a.originator?.id ?? a.originatorId ?? "",
        type: a.type,
        severity: a.severity,
        acknowledged: !!(a.acknowledged ?? a.ackTs > 0),
        cleared: !!(a.cleared ?? a.clearTs > 0),
        // Visible text only (not ids/timestamps) so the base table search matches.
        searchText: `${originatorName} ${a.type} ${this.severityLabel(a.severity)} ${new Date(a.createdTime).toLocaleString()}`,
      };
    });
    this.alarmsLoading = false;
    this.applyAlarmCounts(); // refresh the per-site active-alarm tallies
    this.applyAlarmFilter(); // refresh the popup's (optionally severity-filtered) list
    this.cd.detectChanges();
  }

  /** Recompute the active-alarm count per site and inject it into the site rows. */
  private applyAlarmCounts(): void {
    const counts = new Map<string, number>();
    for (const a of this.alarmsRows) {
      const siteId = this.siteIdByDeviceId.get(a.originatorId);
      if (siteId) {
        counts.set(siteId, (counts.get(siteId) ?? 0) + 1);
      }
    }
    this.siteAlarmCount = counts;
    this.sitesRows = this.sitesRows.map((r) => ({ ...r, alarmCount: counts.get(r.siteId) ?? 0 }));
  }

  // -- demo defaults for the non-device tiles --------------------------------

  private resolveEntityName(): void {
    // An optional "title" widget setting always wins.
    const settingsTitle = this.ctx.settings?.title;
    if (settingsTitle) {
      this.meterName = settingsTitle;
      return;
    }
    // Otherwise adopt the bound entity's name — but ignore the simulated
    // "function" datasource, whose entityName is the literal "function".
    const ds = this.ctx.datasources?.[0];
    if (ds && ds.type !== DatasourceType.function && ds.entityName) {
      this.meterName = ds.entityLabel || ds.entityName;
    }
  }

  private buildDefaults(): void {
    this.statusCards = [
      { id: "outsideDoor", label: "Outside door", icon: "sensor_door", value: "Open", alert: true },
      { id: "insideDoor", label: "Inside door", icon: "sensor_door", value: "Closed", alert: false },
      { id: "motion", label: "Motion", icon: "directions_run", value: "Motion", alert: true },
    ];
    this.metricCards = [
      { id: "airTankPressure", label: "Air tank pressure", icon: "compress", value: "43000", units: "psi" },
      { id: "insideTemperature", label: "Inside temperature", icon: "device_thermostat", value: "21.5", units: "°C" },
    ];
  }

  private applyContextData(): void {
    if (!this.ctx?.data?.length) {
      return;
    }
    for (const entry of this.ctx.data) {
      if (!entry.data?.length) {
        continue;
      }
      const label = (entry.dataKey.label || entry.dataKey.name || "").toLowerCase();
      const raw = entry.data[entry.data.length - 1][1];
      this.applyStatus(label, raw);
      this.applyMetric(label, raw);
      this.applyCharging(label, raw);
    }
  }

  private applyStatus(label: string, raw: any): void {
    const card = this.statusCards.find((c) => label.includes(c.label.toLowerCase()));
    if (!card) {
      return;
    }
    if (card.id === "motion") {
      const motion = this.truthy(raw);
      card.value = motion ? "Motion" : "No motion";
      card.alert = motion;
    } else {
      const open = this.truthy(raw);
      card.value = open ? "Open" : "Closed";
      card.alert = open;
    }
  }

  private applyMetric(label: string, raw: any): void {
    const card = this.metricCards.find((c) => label.includes(c.label.toLowerCase()));
    if (card) {
      card.value = `${raw}`;
    }
  }

  private applyCharging(label: string, raw: any): void {
    if (label.includes("charging state") || label === "charging") {
      this.chargingActive = this.truthy(raw);
      this.chargingState = this.chargingActive ? "Charging" : "Idle";
    } else if (label.includes("charging voltage")) {
      this.chargingVoltage = `${raw}`;
    } else if (label.includes("battery voltage")) {
      this.batteryVoltage = `${raw}`;
    }
  }

  private truthy(raw: any): boolean {
    if (typeof raw === "boolean") {
      return raw;
    }
    if (typeof raw === "number") {
      return raw !== 0;
    }
    const v = `${raw}`.trim().toLowerCase();
    return v === "true" || v === "1" || v === "open" || v === "on" || v === "motion" || v === "active";
  }

  severityLabel(severity: string): string {
    if (!severity) {
      return "";
    }
    return severity.charAt(0) + severity.slice(1).toLowerCase();
  }

  severityClass(severity: string): string {
    return (severity || "").toLowerCase();
  }

  /** Number of filled segments (1–4) for the severity bar. */
  severityRank(severity: string): number {
    switch ((severity || "").toUpperCase()) {
      case "CRITICAL":
        return 4;
      case "MAJOR":
        return 3;
      case "MINOR":
        return 2;
      default:
        return 1; // WARNING / INDETERMINATE
    }
  }

  severityIcon(severity: string): string {
    switch ((severity || "").toUpperCase()) {
      case "CRITICAL":
        return "error"; // filled circle
      case "MAJOR":
        return "warning"; // triangle
      case "MINOR":
        return "error_outline";
      case "WARNING":
        return "info";
      default:
        return "help_outline";
    }
  }
}
