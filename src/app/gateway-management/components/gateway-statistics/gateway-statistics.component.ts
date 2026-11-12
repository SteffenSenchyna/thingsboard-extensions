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

import { ChangeDetectorRef, Component, DestroyRef, EventEmitter, HostBinding, Input, OnChanges, OnDestroy, Output, SimpleChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { forkJoin, of } from "rxjs";
import { catchError, map } from "rxjs/operators";
import { WidgetSubscriptionOptions } from "@core/public-api";
import { AggregationType, AliasFilterType, DataKeyType, Datasource, DatasourceType, EntityFilter, EntityType, SharedModule, widgetType } from "@shared/public-api";
import { WidgetContext } from "@home/models/widget-component.models";
import { CollapsibleCardComponent } from "../../../components/shared/collapsible-card/collapsible-card.component";
import { LineChartComponent, LineChartSeries } from "../../../components/shared/line-chart/line-chart.component";
import { SegmentOption } from "../../../components/shared/segmented-control/segmented-control.component";
import { TimeframePickerComponent } from "../../../components/shared/timeframe-picker/timeframe-picker.component";
import { TrendPoint } from "../../../components/shared/trend-chart/trend-chart.component";
import {
  GatewayDashboardSettings,
  gatewayDashboardDefaultSettings,
  STAT_METRICS,
  STATS_TIMEFRAMES,
  StatMetric,
} from "../../models/gateway-management.models";
import { parseNumber, parseObject } from "../../../components/shared/value-utils";
import { chartColor } from "../../models/gateway-utils";
import { GatewayRef } from "../gateway-logs/gateway-logs.component";
import { removeSubscriptions } from "../../../components/shared/dashboard/dashboard-subscriptions";

/** One chart of the Statistics view: a metric, one line per gateway. */
interface StatChart {
  metric: StatMetric;
  series: LineChartSeries[];
}

/** A gateway's window as read: its `serviceStats` / `machineStats` points, each JSON parsed once, oldest first. */
interface StatsRead {
  gateway: GatewayRef;
  points: Record<StatMetric["series"], { ts: number; values: Record<string, any> }[]>;
}

/**
 * The last window read per gateways + window + keys, kept for a minute (the
 * gateways' statistics period): coming back to the Statistics tab paints at
 * once instead of downloading the window again. New statistics arriving
 * reread past it (see resubscribe).
 */
const STATS_CACHE_TTL_MS = 60_000;
const statsCache = new Map<string, { at: number; reads: StatsRead[] }>();

/**
 * The gateways' statistics over a window: one chart per figure of their
 * `serviceStats` / `machineStats` JSON time series (messages pushed / pulled /
 * waiting, datapoints produced, process CPU / memory, disk), each gateway a
 * line in the chart palette. Read over REST for the window and reread when a
 * gateway reports new statistics (a live subscription on the two keys).
 */
@Component({
  selector: "tb-gm-statistics",
  templateUrl: "./gateway-statistics.component.html",
  styleUrls: ["./gateway-statistics.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, CollapsibleCardComponent, LineChartComponent, TimeframePickerComponent],
})
export class GatewayStatisticsComponent implements OnChanges, OnDestroy {
  @Input() ctx!: WidgetContext;
  @Input() settings: GatewayDashboardSettings = gatewayDashboardDefaultSettings;
  @Input() gateways: GatewayRef[] = [];
  /** "1D" / "1W" / "1M" (see STATS_TIMEFRAMES). */
  @Input() timeframe = "1D";
  @Output() timeframeChange = new EventEmitter<string>();
  /** A picker above the charts (the gateway panel); a view's picker lives in the sidebar. */
  @Input() showTimeframePicker = false;
  /** One chart per row, inside a side panel (implies embedded). */
  @Input() @HostBinding("class.gs-compact") compact = false;
  /** One block of a scrolling page rather than a scrolling view of its own. */
  @Input() @HostBinding("class.gs-embedded") embedded = false;
  /** The metric groups shown (none = all). */
  @Input() groups: string[] = [];
  @Input() dark = false;

  readonly timeframeOptions: SegmentOption[] = STATS_TIMEFRAMES.map((t) => ({ id: t.id, label: t.id }));
  charts: StatChart[] = [];
  loading = false;

  private subscription: any;
  private subscribedIds = "";
  private refreshTimer?: any;
  private loadSeq = 0;
  /** The gateways' windows as last read (or taken from the cache): what the charts are built from. */
  private reads: StatsRead[] = [];

  constructor(private cd: ChangeDetectorRef, private destroyRef: DestroyRef) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["gateways"] || changes["timeframe"] || changes["ctx"] || changes["settings"]) {
      this.load();
      this.resubscribe();
    }
    if (changes["groups"]) {
      this.charts = this.buildCharts(this.reads);
    }
  }

  ngOnDestroy(): void {
    clearTimeout(this.refreshTimer);
    this.removeSubscription();
  }

  get multi(): boolean {
    return this.gateways.length > 1;
  }

  onTimeframe(id: string): void {
    this.timeframe = id;
    this.timeframeChange.emit(id);
    this.load();
  }

  /**
   * Build the charts from the window's `serviceStats` / `machineStats` of
   * every gateway: from the cache when it has this window from the last
   * minute, else read over REST — the chart frames go up at once (spinning)
   * and fill when the window arrives; a reread keeps the current lines up
   * meanwhile. `force` reads past the cache (new statistics arrived).
   */
  private load(force = false): void {
    const seq = ++this.loadSeq;
    const gateways = this.gateways;
    if (!this.ctx || !gateways.length) {
      this.reads = [];
      this.charts = [];
      this.loading = false;
      return;
    }
    const s = this.settings;
    const cacheKey = [gateways.map((g) => g.id).join(","), this.timeframe, s.serviceStatsKey, s.machineStatsKey].join("|");
    const cached = statsCache.get(cacheKey);
    if (!force && cached && Date.now() - cached.at < STATS_CACHE_TTL_MS) {
      this.reads = cached.reads;
      this.charts = this.buildCharts(this.reads);
      this.loading = false;
      return;
    }
    if (!this.charts.length) {
      this.charts = this.buildCharts(gateways.map((gateway) => ({ gateway, points: { service: [], machine: [] } })));
    }
    const windowMs = STATS_TIMEFRAMES.find((t) => t.id === this.timeframe)?.ms ?? STATS_TIMEFRAMES[0].ms;
    const end = Date.now();
    const start = end - windowMs;
    this.loading = true;
    const reads = gateways.map((g) =>
      this.ctx.attributeService
        .getEntityTimeseries({ entityType: EntityType.DEVICE, id: g.id }, [s.serviceStatsKey, s.machineStatsKey], start, end, 5000, AggregationType.NONE, undefined, undefined, true, {
          ignoreLoading: true,
          ignoreErrors: true,
        })
        .pipe(
          map((data) => this.parseRead(g, data as Record<string, { ts: number; value: unknown }[]>)),
          catchError(() => of(this.parseRead(g, {})))
        )
    );
    forkJoin(reads)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((results) => {
        if (seq !== this.loadSeq) {
          return; // a newer load is on its way
        }
        const now = Date.now();
        statsCache.set(cacheKey, { at: now, reads: results });
        for (const [key, entry] of statsCache) {
          if (now - entry.at >= STATS_CACHE_TTL_MS) {
            statsCache.delete(key);
          }
        }
        this.reads = results;
        this.charts = this.buildCharts(results);
        this.loading = false;
        this.cd.detectChanges();
      });
  }

  /** A gateway's response: each series' points with their JSON parsed once (not once per metric), oldest first. */
  private parseRead(gateway: GatewayRef, data: Record<string, { ts: number; value: unknown }[]>): StatsRead {
    const s = this.settings;
    const parse = (key: string) =>
      (data?.[key] ?? [])
        .map((p) => ({ ts: Number(p.ts), values: parseObject(p.value) }))
        .filter((p) => Number.isFinite(p.ts))
        .sort((a, b) => a.ts - b.ts);
    return { gateway, points: { service: parse(s.serviceStatsKey), machine: parse(s.machineStatsKey) } };
  }

  /**
   * One chart per (shown) metric: each gateway's figure picked out of its
   * parsed points. A single gateway's line is named after the figure (the
   * tooltip reads "Telemetry produced 4"); with several, after each gateway.
   */
  private buildCharts(reads: StatsRead[]): StatChart[] {
    const groups = new Set(this.groups);
    const single = reads.length === 1;
    return STAT_METRICS.filter((metric) => !groups.size || groups.has(metric.group)).map((metric) => ({
      metric,
      series: reads.map(({ gateway, points }, i) => {
        const data: TrendPoint[] = points[metric.series]
          .map((p) => ({ ts: p.ts, value: parseNumber(p.values[metric.field]) }))
          .filter((p): p is TrendPoint => p.value !== null);
        return { name: single ? metric.label : gateway.name, color: chartColor(i), data };
      }),
    }));
  }

  /** A gateway reporting new statistics rereads the window (debounced; the first emission is the current values). */
  private resubscribe(): void {
    const ids = this.gateways.map((g) => g.id);
    const signature = ids.join(",");
    if (signature === this.subscribedIds) {
      return;
    }
    this.subscribedIds = signature;
    this.removeSubscription();
    if (!this.ctx || !ids.length) {
      return;
    }
    const s = this.settings;
    const entityFilter: EntityFilter =
      ids.length === 1
        ? ({ type: AliasFilterType.singleEntity, singleEntity: { entityType: EntityType.DEVICE, id: ids[0] } } as EntityFilter)
        : ({ type: AliasFilterType.entityList, entityType: EntityType.DEVICE, entityList: ids } as EntityFilter);
    const datasources: Datasource[] = [
      {
        type: DatasourceType.entity,
        name: "gateway-stats",
        entityFilter,
        dataKeys: [s.serviceStatsKey, s.machineStatsKey].map((key) => ({ name: key, label: key, type: DataKeyType.timeseries, settings: {} })),
      },
    ];
    let first = true;
    const options: WidgetSubscriptionOptions = {
      type: widgetType.latest,
      datasources,
      callbacks: {
        onDataUpdated: () => {
          if (first) {
            first = false;
            return;
          }
          clearTimeout(this.refreshTimer);
          this.refreshTimer = setTimeout(() => this.load(true), 1000);
        },
      },
    };
    this.ctx.subscriptionApi
      .createSubscription(options, true)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((sub) => (this.subscription = sub));
  }

  private removeSubscription(): void {
    removeSubscriptions(this.ctx, this.subscription);
    this.subscription = undefined;
  }
}
