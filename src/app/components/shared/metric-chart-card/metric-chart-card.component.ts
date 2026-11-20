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
  ChangeDetectorRef,
  Component,
  DestroyRef,
  EventEmitter,
  HostBinding,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { WidgetSubscriptionOptions } from "@core/public-api";
import {
  AggregationType,
  AliasFilterType,
  DataKeyType,
  Datasource,
  DatasourceType,
  EntityFilter,
  EntityType,
  HistoryWindowType,
  RealtimeWindow,
  RealtimeWindowType,
  SharedModule,
  Timewindow,
  TimewindowType,
  widgetType,
} from "@shared/public-api";
import { WidgetContext } from "@home/models/widget-component.models";
import { CollapsibleCardComponent } from "../collapsible-card/collapsible-card.component";
import { TB_CUSTOM_TIMEFRAME, TB_WINDOW_TIMEFRAMES, TimeframePickerComponent } from "../timeframe-picker/timeframe-picker.component";
import { LineChartComponent, LineChartSeries, LineChartThreshold } from "../line-chart/line-chart.component";
import { ChartStateStrip, ChartStripRun, stateStripRuns } from "../line-chart/chart-strip";
import { removeSubscriptions } from "../dashboard/dashboard-subscriptions";
import { QUIET_REQUEST } from "../value-utils";
import { RecentReads } from "../recent-reads";
import { Subscription, catchError, of } from "rxjs";

/** How often a live window's state bars are read again (their readings come in every minute; a few minutes behind is plenty). */
const STRIP_REFRESH_MS = 5 * 60 * 1000;
/** The state bar of a section still read: its track alone (one array — a fresh `[]` would redraw the bar every check). */
const NO_STRIP_RUNS: ChartStripRun[] = [];
/**
 * The lines and the state bars as last read, by device, window and charts — kept a couple of minutes across the cards (a panel closed
 * and opened again on the device shows them at once; the subscription then brings them up to date).
 */
const SERIES_READS = new RecentReads<{ series: LineChartSeries[][]; start?: number; end?: number }>();
const STRIP_READS = new RecentReads<(ChartStripRun[] | null)[]>();

/** Per-instance counter so each card's stacked charts get a unique sync group. */
let cardSeq = 0;

/** A point's number: the value itself, or — a JSON object (as a string or parsed) — its `field` property. */
function metricValue(raw: unknown, field?: string): number {
  if (!field) {
    return Number(raw);
  }
  let obj: unknown = raw;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw);
    } catch {
      return NaN;
    }
  }
  const value = field.split(".").reduce<any>((o, key) => (o && typeof o === "object" ? o[key] : undefined), obj);
  return Number(value);
}

/** A telemetry series to plot in a {@link MetricChartCardComponent}. */
export interface MetricChartKey {
  /** Telemetry key name (used for every window without a {@link nameByTimeframe} entry). */
  name: string;
  /**
   * A different telemetry key per window, e.g. `{ "1M": "rssiAvg1d" }` to
   * plot pre-aggregated daily values over a month while `name` covers the rest.
   * A custom range reads the entry of the shortest named window at least as long as it.
   */
  nameByTimeframe?: Record<string, string>;
  /** Key plotted where the window's own key has no data — none in range, or none before its first point, well into the window
   *  (e.g. raw `rssi` on a device that doesn't report the averages, or averages kept only since a day inside it). */
  fallbackName?: string;
  /** Legend label. */
  label: string;
  /** Line colour. */
  color: string;
  /** A reference line (an average of another key's): dotted, over the others ({@link LineChartSeries.dotted}). */
  dotted?: boolean;
  /**
   * The windows the key is drawn on (a custom range: the named window whose keys it reads), e.g. `["1D", "3D"]` for an hour
   * average that the longer windows' own hourly or daily keys already draw. Unset: every window.
   */
  timeframes?: string[];
  /**
   * The key's values are JSON objects (a gateway's `machineStats`): plot this
   * property of each — a dot path for a nested one. Unset, the value itself.
   */
  field?: string;
}

/** One stacked chart within a {@link MetricChartCardComponent}. */
export interface MetricChartSection {
  /** Caption shown above the chart. */
  chartTitle?: string;
  /** Optional explanatory text shown in a hover-info tooltip by the caption. */
  info?: string;
  /** Value unit (e.g. "°C", "dBm"). */
  unit?: string;
  /** Telemetry keys plotted in this chart. */
  keys: MetricChartKey[];
  /** Show the legend (default true). */
  showLegend?: boolean;
  /** Fill the area under the line(s) with a gradient. */
  fill?: boolean;
  /** Baseline y-axis range; the axis expands past it when data falls outside. */
  yMin?: number;
  yMax?: number;
  /** A hard floor: the axis never under it, whatever the data (`tb-line-chart`'s `yFloor`). */
  yFloor?: number;
  /** A state of the device under the chart's plot as a thin bar on its time axis (`tb-line-chart [strip]`): its readings over
   *  the window, read apart from the lines (a string key: never averaged), again every few minutes while live. */
  stateStrip?: ChartStateStrip;
  /** Horizontal reference lines (e.g. alarm thresholds). */
  thresholds?: LineChartThreshold[];
}

/** The chart palette, in its fixed order: a card's series take its slots one after another. */
export const CHART_PALETTE = [1, 2, 3, 4, 5].map((i) => `var(--c-chart-${i})`);

/** A card's charts with their series coloured by the palette, in order across the card (each chart's series, chart after chart). */
export function paletteCharts(charts: MetricChartSection[]): MetricChartSection[] {
  let slot = 0;
  return charts.map((c) => ({ ...c, keys: c.keys.map((k) => ({ ...k, color: CHART_PALETTE[slot++ % CHART_PALETTE.length] })) }));
}

/**
 * Reusable "metric chart" card: a collapsible card with a 1H/1D/1W time picker
 * over one or more stacked line charts (separated by a divider). A single
 * native ThingsBoard timeseries subscription feeds every chart, so they all
 * share the selected window. History + live websocket updates + server-side AVG
 * aggregation, with per-(device,window) caching and a loading wireframe that
 * stays up until the lines are drawn — "No data" only once a quick check finds
 * nothing in the window to draw ({@link probeEmpty}).
 */
@Component({
  selector: "tb-metric-chart-card",
  templateUrl: "./metric-chart-card.component.html",
  styleUrls: ["./metric-chart-card.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, CollapsibleCardComponent, TimeframePickerComponent, LineChartComponent],
})
export class MetricChartCardComponent implements OnChanges, OnDestroy {
  /**
   * Strip the native `title` attribute off the host: the `title` @Input is set
   * via `title="…"`, but `title` is also a global HTML attribute, so the browser
   * would otherwise render its own tooltip with that text.
   */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;

  /** Widget context (used to create the subscription). */
  @Input() ctx!: WidgetContext;
  /** Entity (device) to plot; null tears the chart subscription down. */
  @Input() deviceId: string | null = null;
  /** Card title. */
  @Input() title = "Metrics";
  /** Active theme. */
  @Input() dark = false;
  /** Stacked charts to render (each shares the card's time window). */
  @Input() charts: MetricChartSection[] = [];
  /**
   * How long the wireframe may wait when nothing says whether the window has data (ms) — the quick check ({@link probeEmpty})
   * failed. Once it finds data, the wireframe waits for the lines however long they take; once it finds none, "No data" at
   * once. (ThingsBoard's own "loaded" comes with its first reply, often before the time series, so it can't tell.) Past this,
   * it gives up on the wireframe only: data that comes later still lands (see {@link onUpdated}).
   */
  @Input() loadTimeoutMs = 30000;

  /** Per-section series, parallel to {@link charts}. */
  sectionSeries: LineChartSeries[][] = [];
  /** Per-section state bars (`stateStrip`), parallel to {@link charts}: null — none. */
  sectionStrips: (ChartStripRun[] | null)[] = [];
  /** The first state bar's runs as they're read (`[]` still read, null none) — a host showing the state at a time (a Time
   *  Machine card's pill, `stripRunAt`). */
  @Output() stateRunsChange = new EventEmitter<ChartStripRun[] | null>();
  /** Stable empty-series reference for sections without data — a fresh `[]` in
   *  the template would change identity on every check and re-render the chart. */
  readonly noSeries: LineChartSeries[] = [];
  /** Window bounds (epoch ms) so each chart's x-axis spans the full timeframe. */
  windowStart?: number;
  windowEnd?: number;
  /** Unique group so this card's stacked charts share their hover line. */
  /** Hover sync group of this card's charts: its own by default; set one id on several cards to sync them all. */
  @Input() syncGroup = `mcc-sync-${++cardSeq}`;
  /** The time under the pointer on any of the card's charts (`null` when it leaves). */
  @Output() hoverTime = new EventEmitter<number | null>();
  /** A time picked elsewhere (hovered on another card, a Time Machine's marker): every chart of the card shows its axis line
   *  there, a dot on each line and the readings in its title row — tooltip-free. */
  @Input() pointerTime: number | null = null;
  /** In its {@link syncGroup}, the charts not under the pointer show their tooltip box too (the default); `false` — their line,
   *  dots and readings only (`tb-line-chart [syncTooltips]`: a long list of cards sharing one group). */
  @Input() syncTooltips = true;
  /** The values in each chart's title row, never a tooltip box: hovered or picked, that time's; live, the latest
   *  (`tb-line-chart [inlineReadout]`: a list of cards, each chart alike). */
  @Input() inlineReadout = false;
  /** `false`: hovering a chart moves nothing — its time set from elsewhere alone (`pointerTime`: a Time Machine's bar). */
  @Input() hoverable = true;
  /** Each chart's plot height (CSS length): 200px, or taller — a dashboard's large view of its cards. */
  @Input() chartHeight = "200px";
  /** `false`: the charts alone, without the card (its title, its shell) — inside a card of the host's own (a device's card in
   *  a list, its header the host's). The picker stays, if shown. */
  @Input() shell = true;
  loading = false;
  /**
   * Selected window, two-way bindable as `[(timeframe)]` so sibling cards can
   * mirror one another through a shared value in the host. Set externally, the
   * card retunes exactly as if its own picker had been clicked.
   */
  @Input() timeframe = "1D";
  @Output() timeframeChange = new EventEmitter<string>();
  /**
   * A custom window while {@link timeframe} is "custom" (`TB_CUSTOM_TIMEFRAME` — a sidebar picker's calendar): its fixed start
   * and end, read as history (no live updates). The named windows are 1D | 3D | 1W | 2W | 1M (`TB_WINDOW_TIMEFRAMES`).
   */
  @Input() range: { start: number; end: number } | null = null;
  /** Hide the 1D | 1W | 1M picker (the window is then fixed by `timeframe`). */
  @Input() showTimeframePicker = true;
  /** `false` pins the card open with a plain caption (no chevron), e.g. on a full details page. */
  @Input() collapsible = true;
  /** Animate the lines as they draw (default); `false` paints them at once. */
  @Input() animated = true;
  private readonly windowByTf: Record<string, number> = Object.fromEntries(TB_WINDOW_TIMEFRAMES.map((t) => [t.id, t.ms]));

  /** A custom range in use (the calendar's). */
  private get custom(): boolean {
    return this.timeframe === TB_CUSTOM_TIMEFRAME && !!this.range && this.range.end > this.range.start;
  }

  /** The window's length: the range's, or the named window's (a week's when unknown). */
  private get windowMs(): number {
    return this.custom ? this.range!.end - this.range!.start : this.windowByTf[this.timeframe] ?? this.windowByTf["1W"];
  }

  /**
   * The named window whose keys ({@link MetricChartKey.nameByTimeframe}) the window reads: its own — a custom range, the shortest
   * named window at least as long as it (the longest past them all): a 2-day range reads 3D's keys, a 10-day one 2W's.
   */
  private get keyWindow(): string {
    if (!this.custom) {
      return this.timeframe;
    }
    const named = [...TB_WINDOW_TIMEFRAMES].sort((a, b) => a.ms - b.ms);
    return (named.find((t) => t.ms >= this.windowMs) ?? named[named.length - 1]).id;
  }

  /**
   * Where a key's points start too late in the window — none at all, or the first more than two of their steps after its start
   * (averages kept only since a day inside it): that first point's time, the fallback's readings drawn before it. Null: they cover
   * it from its start.
   */
  private leadGap(series: { ts: number }[]): number | null {
    if (!series.length) {
      return Infinity;
    }
    const start = this.windowStart ?? series[0].ts;
    let step = Infinity;
    for (let i = 1; i < Math.min(series.length, 50); i++) {
      const d = series[i].ts - series[i - 1].ts;
      if (d > 0 && d < step) {
        step = d;
      }
    }
    if (!isFinite(step)) {
      step = this.windowMs / 100; // one point: a hundredth of the window
    }
    return series[0].ts - start > 2 * step ? series[0].ts : null;
  }

  /** What the window is, for the cache and the retune guard: its name, or the range's ends. */
  private get windowKey(): string {
    return this.custom ? `custom:${this.range!.start}:${this.range!.end}` : this.timeframe;
  }

  /**
   * AVG bin size by the window's length: past 20 days a day (a month's raw points are too dense), past 10 an hour (two weeks);
   * shorter windows raw (unaggregated).
   */
  private binFor(windowMs: number): number | undefined {
    const day = 24 * 60 * 60 * 1000;
    return windowMs >= 20 * day ? day : windowMs >= 10 * day ? 60 * 60 * 1000 : undefined;
  }

  /** Day-binned window (a month): each point is a whole day, so the tooltip shows
   *  just the date — the bin midpoints all fall at the same clock time. */
  get dailyBins(): boolean {
    return (this.binFor(this.windowMs) ?? 0) >= 24 * 60 * 60 * 1000;
  }

  private subscription?: any;
  /** What its reads are kept under ({@link SERIES_READS}, {@link STRIP_READS}): the device, the window and the charts it draws. */
  private readKey(deviceId: string): string {
    const charts = this.charts.map((c) => [c.chartTitle, c.stateStrip?.key ?? "", ...c.keys.map((k) => `${k.name}/${k.field ?? ""}`)].join(","));
    return `${deviceId}:${this.windowKey}:${charts.join("|")}`;
  }
  private stripRead?: Subscription;
  /** The quick "anything in the window?" read of the load under way ({@link probeEmpty}). */
  private emptyProbe?: Subscription;
  private stripReadAt = 0;
  /** The device and window the bars shown are of. */
  private stripWindow = "";
  private loadTimeout?: any;
  /** Timeframe the current window/subscription was built for. Guards the retune
   *  when a mirrored `[(timeframe)]` binding echoes our own change back to us. */
  private appliedTimeframe = "";

  ngOnChanges(changes: SimpleChanges): void {
    // A device change re-opens the subscription with whatever timeframe is
    // current, so a simultaneous timeframe change needs no separate retune.
    const retuned = (changes["timeframe"] && !changes["timeframe"].firstChange) || (changes["range"] && !changes["range"].firstChange);
    if (retuned && !changes["deviceId"]) {
      this.applyTimeframe();
    }
    if (changes["deviceId"]) {
      if (this.deviceId) {
        this.open(this.deviceId);
      } else {
        this.teardown();
      }
    }
  }

  ngOnDestroy(): void {
    this.teardown();
  }

  constructor(private cd: ChangeDetectorRef, private destroyRef: DestroyRef, private zone: NgZone) {}

  /**
   * A chart's hover (its time, null as it leaves) — on every pointer move, from outside Angular's zone (the charts run there): passed
   * on, in the zone, only when a page listens to this card's `hoverTime` (Marine's map) — else nothing runs, so a hover never runs the
   * dashboard's change detection on each move.
   */
  onChartHover(ts: number | null): void {
    if (this.hoverTime.observed) {
      this.zone.run(() => this.hoverTime.emit(ts));
    }
  }

  /** Track stacked charts by position so ambient CD doesn't recreate them. */
  trackBySection(index: number): number {
    return index;
  }

  /** The card's own picker: retune, then tell the host so mirrored cards follow. */
  setTimeframe(tf: string): void {
    if (this.timeframe === tf) {
      return;
    }
    this.timeframe = tf;
    this.applyTimeframe();
    this.timeframeChange.emit(tf);
  }

  /** Move the window (and the live subscription) to {@link timeframe}. */
  private applyTimeframe(): void {
    if (this.appliedTimeframe === this.windowKey) {
      return; // already on this window (e.g. our own emit coming back in)
    }
    this.appliedTimeframe = this.windowKey;
    // Provisional bounds so the axis spans the new window immediately, even
    // before fresh data arrives (refined from the subscription in onUpdated).
    this.setComputedWindow();
    if (this.deviceId) {
      const cached = SERIES_READS.get(this.readKey(this.deviceId));
      if (cached) {
        this.sectionSeries = cached.series;
        this.windowStart = cached.start;
        this.windowEnd = cached.end;
        this.stopLoading();
      } else {
        this.sectionSeries = [];
        this.startLoading();
      }
      this.readStrips();
    }
    if (this.subscription) {
      this.subscription.updateTimewindowConfig(this.buildTimewindow());
    }
  }

  private open(deviceId: string): void {
    // Keep the currently-selected timeframe across device switches (don't reset
    // to the default), so the chosen window persists when browsing devices.
    this.appliedTimeframe = this.windowKey;
    this.setComputedWindow();
    // This device and window as read in the last couple of minutes (by any card — a panel closed and opened again): at once, the
    // subscription then bringing it up to date; never read yet, the plots wireframed meanwhile.
    const cached = SERIES_READS.get(this.readKey(deviceId));
    if (cached) {
      this.sectionSeries = cached.series;
      this.windowStart = cached.start;
      this.windowEnd = cached.end;
      this.stopLoading();
    } else {
      this.sectionSeries = [];
      this.startLoading();
    }
    this.removeSubscription();
    this.readStrips();

    // One subscription over the union of every chart's keys (deduped) — every
    // per-window variant and fallback too, so switching windows needs no
    // resubscribe; onUpdated plots the window's own key.
    const seen = new Set<string>();
    const dataKeys: any[] = [];
    for (const section of this.charts) {
      for (const k of section.keys) {
        const names = [k.name, ...Object.values(k.nameByTimeframe ?? {}), ...(k.fallbackName ? [k.fallbackName] : [])];
        for (const name of names) {
          if (!seen.has(name)) {
            seen.add(name);
            dataKeys.push({ name, label: k.label, type: DataKeyType.timeseries, color: k.color, settings: {} });
          }
        }
      }
    }

    const datasources: Datasource[] = [
      {
        type: DatasourceType.entity,
        name: "metric-chart",
        entityFilter: {
          type: AliasFilterType.singleEntity,
          singleEntity: { entityType: EntityType.DEVICE, id: deviceId },
        } as EntityFilter,
        dataKeys,
      },
    ];

    const options: WidgetSubscriptionOptions = {
      type: widgetType.timeseries,
      datasources,
      // singleEntity + ignoreDataUpdateOnIntervalTick are the same combination
      // TB's native chart widgets use to keep long realtime windows snappy:
      // single-entity bypasses the entity-data pagination path, and the
      // ignore-tick flag stops the data aggregator from re-emitting the whole
      // window on every interval tick.
      singleEntity: true,
      useDashboardTimewindow: false,
      timeWindowConfig: this.buildTimewindow(),
      ignoreDataUpdateOnIntervalTick: true,
      callbacks: {
        onDataUpdated: (subscription) => this.onUpdated(subscription),
      },
    };

    this.ctx.subscriptionApi
      .createSubscription(options, true)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((subscription) => {
        this.subscription = subscription;
      });
  }

  private onUpdated(subscription: any): void {
    const data: any[] = subscription?.data ?? [];
    // Prefer the subscription's authoritative window bounds; fall back to the
    // computed window. This pins the x-axis to the full timeframe.
    const tw = subscription?.timeWindow;
    if (tw?.minTime && tw?.maxTime) {
      this.windowStart = tw.minTime;
      this.windowEnd = tw.maxTime;
    } else {
      this.setComputedWindow();
    }
    const keyWindow = this.keyWindow;
    const sectionSeries: LineChartSeries[][] = this.charts.map((section) =>
      section.keys.filter((k) => !k.timeframes || k.timeframes.includes(keyWindow)).map((k) => {
        const points = (name: string | undefined): { ts: number; value: number }[] =>
          ((name && data.find((dd) => dd.dataKey?.name === name)?.data) || [])
            .map((p: any[]) => ({ ts: Number(p[0]), value: metricValue(p[1], k.field) }))
            .filter((p: { value: number }) => isFinite(p.value));
        // The window's own key; its fallback where that has nothing — the whole window, or before its first point (averages
        // kept only since a day inside the window: the readings before them, so the line runs on rather than starting late).
        let series = points(k.nameByTimeframe?.[keyWindow] ?? k.name);
        const lead = k.fallbackName ? this.leadGap(series) : null;
        if (lead !== null) {
          series = [...points(k.fallbackName).filter((p) => p.ts < lead), ...series];
        }
        return { name: k.label, color: k.color, data: series, dotted: k.dotted };
      }),
    );
    // The subscription fires an initial empty update; ignore empty emissions and
    // keep the spinner up until real data arrives (the timeout covers no-data).
    // This runs on every emission for the life of the subscription, so a slow
    // first response lands here after the spinner has already given up and
    // swaps the "No data" overlay out for the drawn series.
    const hasData = sectionSeries.some((secs) => secs.some((s) => s.data.length > 0));
    // A live window's state bars follow its readings, every few minutes (a custom range is read once).
    if (hasData && !this.custom && Date.now() - this.stripReadAt > STRIP_REFRESH_MS) {
      this.readStrips();
    }
    if (hasData) {
      this.sectionSeries = sectionSeries;
      this.stopLoading();
      if (this.deviceId) {
        SERIES_READS.set(this.readKey(this.deviceId), {
          series: sectionSeries,
          start: this.windowStart,
          end: this.windowEnd,
        });
      }
      this.cd.detectChanges();
    }
  }

  /** Set window bounds from the current timeframe (end = now, start = now − N; a custom range its own ends). */
  private setComputedWindow(): void {
    if (this.custom) {
      this.windowStart = this.range!.start;
      this.windowEnd = this.range!.end;
      return;
    }
    this.windowEnd = Date.now();
    this.windowStart = this.windowEnd - this.windowMs;
  }

  /**
   * REALTIME "last N" window — or, a custom range, a fixed HISTORY one. Long
   * windows are AVG-binned ({@link binFor}: a month by the day, two weeks by
   * the hour); the rest fetch raw data.
   */
  private buildTimewindow(): Timewindow {
    const windowMs = this.windowMs;
    const interval = this.binFor(windowMs);
    // A custom range: a fixed history window (its own ends, no live updates).
    if (this.custom) {
      return {
        selectedTab: TimewindowType.HISTORY,
        history: {
          historyType: HistoryWindowType.FIXED,
          fixedTimewindow: { startTimeMs: this.range!.start, endTimeMs: this.range!.end },
          ...(interval ? { interval } : {}),
        },
        aggregation: { type: interval ? AggregationType.AVG : AggregationType.NONE, limit: 50000 },
      };
    }
    const realtime: RealtimeWindow = {
      realtimeType: RealtimeWindowType.LAST_INTERVAL,
      timewindowMs: windowMs,
    };
    if (interval) {
      realtime.interval = interval;
    }
    return {
      selectedTab: TimewindowType.REALTIME,
      realtime,
      aggregation: {
        type: interval ? AggregationType.AVG : AggregationType.NONE,
        limit: 50000,
      },
    };
  }

  private startLoading(): void {
    this.loading = true;
    clearTimeout(this.loadTimeout);
    this.loadTimeout = setTimeout(() => {
      this.loading = false;
      this.cd.detectChanges();
    }, this.loadTimeoutMs);
    this.probeEmpty();
  }

  /**
   * Whether the window has anything to draw: one point a key the charts would plot (the window's own key, its fallback) — a
   * cheap read beside the subscription's. Some: the wireframe holds, no timer, until the lines are drawn. None: "No data" now.
   * Failed: the timer decides ({@link loadTimeoutMs}).
   */
  private probeEmpty(): void {
    this.emptyProbe?.unsubscribe();
    if (!this.deviceId) {
      return;
    }
    const deviceId = this.deviceId;
    const windowKey = this.windowKey;
    const keyWindow = this.keyWindow;
    const keys = [
      ...new Set(
        this.charts.flatMap((section) => section.keys.flatMap((k) => [k.nameByTimeframe?.[keyWindow] ?? k.name, ...(k.fallbackName ? [k.fallbackName] : [])]))
      ),
    ];
    const end = this.custom ? this.range!.end : Date.now();
    const start = end - this.windowMs;
    this.emptyProbe = this.ctx.attributeService
      .getEntityTimeseries({ entityType: EntityType.DEVICE, id: deviceId }, keys, start, end, 1, AggregationType.NONE, undefined, undefined, false, QUIET_REQUEST)
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((data) => {
        if (!data || deviceId !== this.deviceId || windowKey !== this.windowKey || !this.loading) {
          return; // failed (the timer decides), another device / window since, or the lines already drawn
        }
        const series = data as unknown as Record<string, unknown[]>;
        if (keys.some((k) => (series[k] ?? []).length > 0)) {
          clearTimeout(this.loadTimeout); // there's data: hold the wireframe until it's drawn
        } else {
          this.stopLoading();
          this.cd.detectChanges();
        }
      });
  }

  private stopLoading(): void {
    this.loading = false;
    clearTimeout(this.loadTimeout);
  }

  private removeSubscription(): void {
    removeSubscriptions(this.ctx, this.subscription);
    this.subscription = undefined;
  }

  private teardown(): void {
    this.stopLoading();
    this.removeSubscription();
    this.stripRead?.unsubscribe();
    this.emptyProbe?.unsubscribe();
    this.sectionSeries = [];
    this.sectionStrips = [];
    this.stateRunsChange.emit(null);
  }

  /**
   * The sections' state bars (`stateStrip`) over the window: the keys' readings in one REST read (never averaged — a state is a
   * string; a month of minute reports is ~43k points), from a report's hold before the window's start, so a state held into it
   * shows. Until read: the last read of this window, else each bar's track alone.
   */
  private readStrips(): void {
    const strips = this.charts.map((c) => c.stateStrip ?? null);
    this.stripRead?.unsubscribe();
    if (!this.deviceId || !strips.some((s) => !!s)) {
      this.sectionStrips = [];
      this.stateRunsChange.emit(null);
      return;
    }
    const deviceId = this.deviceId;
    const windowKey = this.windowKey;
    const cacheKey = this.readKey(deviceId);
    const cached = STRIP_READS.get(cacheKey);
    if (!this.sectionStrips.length || this.stripWindow !== cacheKey) {
      this.sectionStrips = cached ?? strips.map((s) => (s ? NO_STRIP_RUNS : null));
      this.stateRunsChange.emit(this.sectionStrips.find((r) => !!r) ?? null);
    }
    this.stripWindow = cacheKey;
    const end = this.custom ? this.range!.end : Date.now();
    const start = end - this.windowMs;
    const hold = Math.max(...strips.map((s) => s?.staleAfterMs ?? 0));
    const keys = [...new Set(strips.flatMap((s) => (s ? [s.key] : [])))];
    this.stripReadAt = Date.now();
    this.stripRead = this.ctx.attributeService
      .getEntityTimeseries({ entityType: EntityType.DEVICE, id: deviceId }, keys, start - hold, end, 50000, AggregationType.NONE, undefined, undefined, false, QUIET_REQUEST)
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((data) => {
        if (!data || deviceId !== this.deviceId || windowKey !== this.windowKey) {
          return; // failed (the last bars stay), or another device / window since
        }
        const series = data as unknown as Record<string, { ts: number; value: unknown }[]>;
        const readTo = Math.min(end, Date.now());
        this.sectionStrips = strips.map((s) => (s ? stateStripRuns(series[s.key] ?? [], s, start, readTo) : null));
        STRIP_READS.set(cacheKey, this.sectionStrips);
        this.stateRunsChange.emit(this.sectionStrips.find((r) => !!r) ?? null);
        this.cd.detectChanges();
      });
  }
}
