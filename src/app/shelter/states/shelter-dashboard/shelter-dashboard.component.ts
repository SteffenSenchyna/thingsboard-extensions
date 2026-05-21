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
  TimeframeOption,
  TimeframeSelectorComponent,
} from "../../../components/shared/timeframe-selector/timeframe-selector.component";
import { MapCardComponent, MapLocation, MapType } from "../../../components/shared/map-card/map-card.component";
import { WidgetContext } from "@home/models/widget-component.models";

/** Aggregation window for the Water Consumption column. */
type Timeframe = "daily" | "weekly" | "monthly";

/** A tab in the widget header (Overview / Analytics / Users). */
interface ShelterTab {
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
  type: string;
  severity: string;
  acknowledged: boolean;
  cleared: boolean;
  /** Precomputed visible text, used by the base table's search filter. */
  searchText: string;
}

/** Per-entity accumulator while folding subscription data into device rows. */
interface DeviceAcc {
  id: string;
  name: string;
  active: boolean;
  lat?: number;
  lng?: number;
}

@Component({
  selector: "tb-shelter-dashboard",
  templateUrl: "./shelter-dashboard.component.html",
  styleUrls: ["./shelter-dashboard.component.scss"],
  standalone: true,
  imports: [
    CommonModule,
    SharedModule,
    DataTableComponent,
    DataTableCellDirective,
    TrendChartComponent,
    ThemeToggleComponent,
    TimeframeSelectorComponent,
    MapCardComponent,
  ],
})
export class ShelterDashboardComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() ctx: WidgetContext;

  @ViewChild(TrendChartComponent) trendChart?: TrendChartComponent;
  @ViewChild(MapCardComponent) mapCard?: MapCardComponent;

  /** Device types listed by this dashboard (== device profile names). */
  readonly deviceTypes = ["Water Meter", "Milesight-EM300-DI"];

  shelterName = "Shelter 1";

  readonly tabs: ShelterTab[] = [
    { id: "overview", label: "Overview", icon: "dashboard" },
    { id: "analytics", label: "Analytics", icon: "show_chart" },
    { id: "users", label: "Users", icon: "group" },
  ];
  activeTab = "overview";

  /** Light/dark theme toggle (persisted per-user server-side, shared across dashboards). */
  darkMode = false;
  private readonly themeSettingKey = "darkMode";
  private readonly mapSettingKey = "shelterMapType";

  statusCards: StatusCard[] = [];
  metricCards: MetricCard[] = [];

  chargingState = "Charging";
  chargingActive = true;
  chargingVoltage = "11.99";
  batteryVoltage = "110.15";

  // Stock-ticker widget — single device + one timeseries key (hardcoded for now).
  private readonly tickerDeviceName = "24e1241360566b58";
  private readonly tickerKey = "meterReadingDelta";
  readonly tickerSymbol = "Water consumption";
  readonly tickerUnit = "L";
  tickerLoading = true;
  tickerSeries: TrendPoint[] = []; // fed to <tb-trend-chart>; rendering lives there

  // Sites table (assets of type "Site" related to a Milesight-EM300-DI device).
  readonly sitesColumns: DataTableColumn[] = [
    { key: "name", header: "Site", subtitleKey: "subtitle" },
    {
      key: "consumption",
      header: "Water Consumption",
      align: "right",
      copyable: true,
      copyWidth: "150px",
      copyValueKey: "consumptionCopy",
    },
  ];
  sitesRows: { name: string; subtitle: string; consumption: string; consumptionCopy: string; consumptionRaw: string }[] =
    [];
  sitesLoading = false;
  /** When true, the Water Consumption column shows m³ instead of litres. */
  consumptionInCubicMeters = false;

  // Widget time frame for the Water Consumption column. "daily" shows today's
  // total; "weekly"/"monthly" sum the daily values from the start of the current
  // week/month up to now. Persisted per-user (server-side).
  timeframe: Timeframe = "daily";
  private readonly timeframeSettingKey = "shelterTimeframe";
  readonly timeframeOptions: TimeframeOption[] = [
    { id: "daily", label: "Today", icon: "today" },
    { id: "weekly", label: "Week to date", icon: "date_range" },
    { id: "monthly", label: "Month to date", icon: "calendar_month" },
  ];

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

  /** Start/end of the selected time frame: start of today / week / month → now. */
  private timeframeRange(): { startTs: number; endTs: number } {
    const now = new Date();
    const endTs = now.getTime();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0); // start of today
    if (this.timeframe === "weekly") {
      const sinceMonday = (start.getDay() + 6) % 7; // 0 = Monday … 6 = Sunday
      start.setDate(start.getDate() - sinceMonday);
    } else if (this.timeframe === "monthly") {
      start.setDate(1);
    }
    return { startTs: start.getTime(), endTs };
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
      tooltip: "Switch between litres and m³",
      active: false,
    },
  ];

  onSitesAction(id: string): void {
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
  deviceLocations: MapLocation[] = []; // fed to <tb-map-card>

  private alarmService: AlarmService;

  // Custom subscriptions created in code — no widget datasource required.
  private devicesSubscription: any;
  private alarmsSubscription: any;

  constructor(private cd: ChangeDetectorRef, private destroyRef: DestroyRef) {}

  ngOnInit(): void {
    this.ctx.$scope.shelterDashboardComponent = this;
    this.alarmService = this.ctx.$injector.get(this.ctx.servicesMap.get("alarmService")) as AlarmService;
    this.loadUserPreferences();

    this.resolveEntityName();
    this.buildDefaults();
    this.applyContextData();

    this.subscribeDevices(); // map markers (device locations)
    this.subscribeAlarms();
    this.loadSites(); // Sites table
    this.loadTicker(); // stock-ticker widget
  }

  ngOnDestroy(): void {
    if (this.devicesSubscription) {
      this.ctx.subscriptionApi.removeSubscription(this.devicesSubscription.id);
    }
    if (this.alarmsSubscription) {
      this.ctx.subscriptionApi.removeSubscription(this.alarmsSubscription.id);
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
        // The initial loadSites() in ngOnInit assumes the default "daily"; if the
        // user saved a different window, switch to it and reload.
        const savedTf = settings?.[this.timeframeSettingKey];
        if ((savedTf === "weekly" || savedTf === "monthly") && this.timeframe !== savedTf) {
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
   * Live "latest" subscription over all devices of the configured types.
   * Pushes attribute updates (active/latitude/longitude) via onDataUpdated.
   */
  private subscribeDevices(): void {
    const datasources: Datasource[] = [
      {
        type: DatasourceType.entity,
        name: "devices",
        entityFilter: this.deviceFilter,
        dataKeys: [
          { name: "active", label: "active", type: DataKeyType.attribute, settings: {} },
          { name: "latitude", label: "latitude", type: DataKeyType.attribute, settings: {} },
          { name: "longitude", label: "longitude", type: DataKeyType.attribute, settings: {} },
        ],
      },
    ];

    const options: WidgetSubscriptionOptions = {
      type: widgetType.latest,
      datasources,
      callbacks: {
        onDataUpdated: (subscription) => this.onDevicesSubscriptionUpdated(subscription),
      },
    };

    this.ctx.subscriptionApi
      .createSubscription(options, true)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((subscription) => {
        this.devicesSubscription = subscription;
        this.onDevicesSubscriptionUpdated(subscription);
      });
  }

  private onDevicesSubscriptionUpdated(subscription: any): void {
    const byEntity = new Map<string, DeviceAcc>();

    for (const item of subscription?.data ?? []) {
      const ds = item.datasource;
      const id = ds?.entityId || ds?.entity?.id?.id;
      if (!id) {
        continue;
      }
      const name = ds?.entityLabel || ds?.entityName || ds?.entity?.name || "Unknown device";
      const rec: DeviceAcc = byEntity.get(id) ?? { id, name, active: false };
      const value = item.data?.length ? item.data[item.data.length - 1][1] : null;

      switch (item.dataKey?.name) {
        case "active":
          rec.active = `${value}`.toLowerCase() === "true";
          break;
        case "latitude":
          rec.lat = parseFloat(value);
          break;
        case "longitude":
          rec.lng = parseFloat(value);
          break;
      }
      byEntity.set(id, rec);
    }

    const locations: MapLocation[] = [];
    for (const rec of byEntity.values()) {
      if (rec.lat !== undefined && rec.lng !== undefined && isFinite(rec.lat) && isFinite(rec.lng)) {
        locations.push({ name: rec.name, lat: rec.lat, lng: rec.lng });
      }
    }

    // New array reference → <tb-map-card> ngOnChanges re-plots the markers.
    this.deviceLocations = locations;
    this.cd.detectChanges();
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
      latestValues: [{ type: EntityKeyType.SERVER_ATTRIBUTE, key: "facilityId" }],
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
          for (const ed of sitesPage.data) {
            const fields = ed.latest?.[EntityKeyType.ENTITY_FIELD] ?? {};
            const attrs = ed.latest?.[EntityKeyType.SERVER_ATTRIBUTE] ?? {};
            siteNameById.set(ed.entityId.id, fields["label"]?.value || fields["name"]?.value || "Unknown site");
            siteFacilityById.set(ed.entityId.id, attrs["facilityId"]?.value ?? "");
          }

          if (!siteNameById.size || !deviceNameById.size) {
            this.sitesRows = [];
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
                return siteRel ? { siteId: siteRel.from.id, deviceName: deviceNameById.get(deviceId) ?? "" } : null;
              }),
            ),
          );

          forkJoin(lookups)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((pairs) => {
              const devicesBySite = new Map<string, Set<string>>();
              for (const pair of pairs) {
                if (!pair || !pair.deviceName) {
                  continue;
                }
                const set = devicesBySite.get(pair.siteId) ?? new Set<string>();
                set.add(pair.deviceName);
                devicesBySite.set(pair.siteId, set);
              }

              const siteIds = Array.from(devicesBySite.keys());
              if (!siteIds.length) {
                this.sitesRows = [];
                this.sitesLoading = false;
                this.cd.detectChanges();
                return;
              }

              // Sum dailyConsumption over the selected window. Server-side SUM
              // aggregation with a single bucket spanning the whole range gives
              // the week-/month-to-date total (or today's total for "daily").
              const { startTs, endTs } = this.timeframeRange();
              const interval = Math.max(endTs - startTs, 1);
              const consumptionLookups = siteIds.map((siteId) =>
                this.ctx.attributeService
                  .getEntityTimeseries(
                    { entityType: EntityType.ASSET, id: siteId },
                    ["dailyConsumption"],
                    startTs,
                    endTs,
                    1,
                    AggregationType.SUM,
                    interval,
                    undefined,
                    false,
                    cfg,
                  )
                  .pipe(
                    map((data: any) => {
                      const points: any[] = data?.["dailyConsumption"] ?? [];
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
                      const count = devicesBySite.get(siteId)?.size ?? 0;
                      const countLabel = `${count} ${count === 1 ? "device" : "devices"}`;
                      const facility = siteFacilityById.get(siteId) ?? "";
                      const consumptionRaw = consumptionBySite.get(siteId) ?? "";
                      return {
                        name: siteNameById.get(siteId) ?? "Unknown site",
                        subtitle: facility ? `${facility} | ${countLabel}` : countLabel,
                        consumptionRaw,
                        consumption: this.formatConsumption(consumptionRaw),
                        consumptionCopy: this.consumptionCopyValue(consumptionRaw),
                      };
                    })
                    .sort((a, b) => a.name.localeCompare(b.name));
                  this.sitesLoading = false;
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
            200,
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
    this.tickerSeries = (raw ?? [])
      .map((p) => ({ ts: p.ts, value: Number(p.value) }))
      .filter((p) => isFinite(p.value))
      .sort((a, b) => a.ts - b.ts);
    this.tickerLoading = false;
    this.cd.detectChanges();
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
        type: a.type,
        severity: a.severity,
        acknowledged: !!(a.acknowledged ?? a.ackTs > 0),
        cleared: !!(a.cleared ?? a.clearTs > 0),
        // Visible text only (not ids/timestamps) so the base table search matches.
        searchText: `${originatorName} ${a.type} ${this.severityLabel(a.severity)} ${new Date(a.createdTime).toLocaleString()}`,
      };
    });
    this.alarmsLoading = false;
    this.cd.detectChanges();
  }

  // -- demo defaults for the non-device tiles --------------------------------

  private resolveEntityName(): void {
    // An optional "title" widget setting always wins.
    const settingsTitle = this.ctx.settings?.title;
    if (settingsTitle) {
      this.shelterName = settingsTitle;
      return;
    }
    // Otherwise adopt the bound entity's name — but ignore the simulated
    // "function" datasource, whose entityName is the literal "function".
    const ds = this.ctx.datasources?.[0];
    if (ds && ds.type !== DatasourceType.function && ds.entityName) {
      this.shelterName = ds.entityLabel || ds.entityName;
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
