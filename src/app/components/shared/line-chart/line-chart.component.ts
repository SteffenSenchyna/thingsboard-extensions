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
  ElementRef,
  EventEmitter,
  HostBinding,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, LegendComponent, MarkLineComponent, TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import { formatClockTime, formatDateTime, formatShortDate } from "../time-format";
import { chartTooltipHtml, chartTooltipStyle, hexToRgba, hideChartTooltipOnLeave } from "../chart-tooltip";
import { TrendPoint } from "../trend-chart/trend-chart.component";
import { TipDirective } from "../tip/tip.directive";
import { ChartStripRun } from "./chart-strip";

// Register the ECharts pieces this chart uses, once. Uses the bundled ECharts
// (same dependency ThingsBoard's own charts use) — no CDN load, instant init.
// MarkLineComponent is required for the threshold lines: without it ECharts
// silently ignores a series' markLine option.
echarts.use([LineChart, GridComponent, LegendComponent, MarkLineComponent, TooltipComponent, SVGRenderer]);

/** A threshold line's colour unless it names its own: the Major alarm severity's orange (an alarm's limit — QC Lab's, Asphalt's). */
export const LINE_CHART_THRESHOLD_COLOR = "var(--c-bg-major-normal)";

/** The room over the plot (px): half the axis' top label. */
const PLOT_TOP_PX = 12;
/** More room over it while a captioned threshold line is drawn: its label (10px text, ECharts' 5px gap over the line) fits even
 *  when the line is the plot's top edge. */
const THRESHOLD_LABEL_ROOM_PX = 10;

/** A horizontal reference line drawn across {@link LineChartComponent}. */
export interface LineChartThreshold {
  /** Y value the line sits at. */
  value: number;
  /** Line colour — any CSS colour, or a `var(--token)` resolved against the chart; none, {@link LINE_CHART_THRESHOLD_COLOR}. */
  color?: string;
  /** Optional short caption drawn at the line's right end. */
  label?: string;
}

/** A named, coloured series for {@link LineChartComponent}. */
export interface LineChartSeries {
  /** Legend label. */
  name: string;
  /** A CSS colour, or a chart-palette token (`var(--c-chart-1)` …): the shared palette, stepped for dark mode. */
  color: string;
  /** Time-series points. */
  data: TrendPoint[];
  /** A comparison drawn behind the others (the period before, a target): a dashed line in its colour, no area under it. */
  dashed?: boolean;
  /** A reference drawn over the others (an average of the line it follows): a line of round dots in its colour, no area under it. */
  dotted?: boolean;
}

/** A series at a time picked elsewhere ({@link LineChartComponent.pointerTime}): its value there, and its dot's place on the plot. */
interface PointerReading {
  name: string;
  color: string;
  /** "21.4 °C"; "—" — no reading near the time. */
  value: string;
  /** The dot's place (px, on the plot); none without a reading. */
  x: number | null;
  y: number | null;
}

/** A series as last drawn: its colour (resolved) and points (sorted, smoothed) — what the pointer's dots and values read. */
interface PlottedSeries {
  name: string;
  color: string;
  points: [number, number][];
  /** The farthest a reading may be from the pointer's time and still be its value there (ms). */
  reach: number;
}

/** A reading counts for the pointer's time within this of it — or twice the series' mean spacing, if wider. */
const POINTER_REACH_MS = 15 * 60 * 1000;
/**
 * A dense line's readings averaged into time buckets about this many pixels of the plot wide: a minute's readings over a day
 * drawn as one clean line (ECharts' own LTTB sampling keeps every spike — a jagged band).
 */
const BUCKET_PX = 3;
/** The buckets' widths: whole steps, their edges at multiples of one — as readings arrive only the newest bucket changes. */
const BUCKET_STEPS_MS = [1, 2, 5, 10, 15, 20, 30, 60, 120, 180, 360, 720, 1440].map((m) => m * 60 * 1000);
/** The plot's width short of the chart's: the y axis' labels and the grid's margins. */
const PLOT_INSET_PX = 50;
/** The state bar ({@link LineChartComponent.strip}) under the plot: its gap below the axis line and its height (px) — the time
 *  labels moved down past it (ECharts' label margin: 8px). */
const STRIP_GAP_PX = 5;
const STRIP_HEIGHT_PX = 8;
const AXIS_LABEL_MARGIN_PX = 8;

/**
 * Reusable multi-series line chart with visible axes, a bottom legend and a
 * themed tooltip, rendered with the bundled Apache ECharts (SVG renderer).
 * Colours come per-series; axis/grid colours follow the dashboard `--c-*`
 * tokens so it adapts to light/dark.
 */
@Component({
  selector: "tb-line-chart",
  templateUrl: "./line-chart.component.html",
  styleUrls: ["./line-chart.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, TipDirective],
})
export class LineChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  /** Strip the native `title` attribute off the host (set via `title=`) so the
   *  browser doesn't render its own tooltip over the chart. */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;

  @Input() series: LineChartSeries[] = [];
  @Input() unit = "";
  @Input() loading = false;
  /** Active theme — drives axis/grid/tooltip colours (re-renders when toggled). */
  @Input() dark = false;
  /** Chart height (CSS length). */
  @Input() height = "220px";
  /** Optional bold heading shown above the chart. */
  @Input() title = "";
  /** Optional explanatory text shown in a hover tooltip on an info icon by the title. */
  @Input() titleInfo = "";
  /** Centred moving-average window (in points) to smooth noisy lines; <=1 = off. */
  @Input() averageWindow = 0;
  /** Downsample to at most this many points (bucket-averaged); 0 = off. */
  @Input() maxPoints = 0;
  /** Render the lines as smooth splines. */
  @Input() smooth = false;
  /** Animate draws/updates. Disable for instant rendering. */
  @Input() animated = true;
  /** Show the bottom legend (hide it for single-series charts). */
  @Input() showLegend = true;
  /** Fill the area under each line with a vertical colour gradient. */
  @Input() area = false;
  /** Decimal places for the y-axis labels (default 1). */
  @Input() yDecimals = 1;
  /** Tooltip header shows the date only ("Sep 21") — for day-binned data, whose
   *  bin midpoints all share one clock time that would read as a stuck time. */
  @Input() tooltipDateOnly = false;
  /** Charts sharing the same group sync their hover tooltip + axis pointer
   *  (like Grafana). Give every chart that should sync the same id. */
  @Input() syncGroup?: string;
  /** Force the time x-axis to span this window (epoch ms) regardless of the data
   *  extent — so e.g. a 1D chart shows the full 24h even when data is sparse. */
  @Input() xMin?: number;
  @Input() xMax?: number;
  /** Baseline y-axis range. The axis always spans at least [yMin, yMax], and
   *  expands beyond it when data or thresholds fall outside. */
  @Input() yMin?: number;
  @Input() yMax?: number;
  /** A hard floor: the axis never goes under it, whatever the data or the thresholds (a belt scale's rate, idling a little under
   *  0): a reading under it is cut off at the plot's foot, its tooltip and readout still giving the reading. */
  @Input() yFloor?: number;
  /** Horizontal reference lines (e.g. alarm thresholds): the axis always reaches them, a baseline range ({@link yMin}) or not. */
  @Input() thresholds: LineChartThreshold[] = [];
  /** Text overlaid on the plot when there is nothing to draw and no load is in
   *  flight — i.e. the series are empty and {@link loading} is false. */
  @Input() emptyText = "No data";

  /** The time (epoch ms) under the pointer while hovering — also for charts synced into the same
   *  group — and `null` when the pointer leaves. Lets a host mirror the hover elsewhere (a map). Emitted outside Angular's zone
   *  (the chart runs there — see `render`): a host that redraws on it re-enters the zone itself (`tb-metric-chart-card` does,
   *  for a page listening to its `hoverTime`). */
  @Output() hoverTime = new EventEmitter<number | null>();
  /** A time (epoch ms) picked elsewhere — hovered on another chart, a Time Machine's marker: this chart's axis line there, a dot
   *  on each line at its reading then and the readings in its title row (the plot's top-right corner without a title), no
   *  tooltip box (`null` hides them). While the pointer is over this chart itself, its own hover shows instead. */
  @Input() pointerTime: number | null = null;
  /** In a {@link syncGroup}, the other charts show their tooltip box too (the default — a card's few stacked charts). `false`:
   *  only the chart under the pointer shows its box, the others their line, dots and readings as for {@link pointerTime} — a
   *  long, scrolling list of cards, where a box drawn on the page for a chart scrolled out of view would float over what's there. */
  @Input() syncTooltips = true;
  /**
   * The values in its title row, never a tooltip box (a list of cards — each chart alike, hovered or not): hovered — this chart or
   * another of its group — or a time picked elsewhere, that time's readings and a dot on each line; else, live, each series' latest
   * reading (its time muted before them).
   */
  @Input() inlineReadout = false;
  /**
   * `false`: the pointer over the chart moves nothing — no hover line, no tooltip, no readings, nothing synced to its group: its
   * time is set from elsewhere alone ({@link pointerTime} — a list of cards scrubbed by a Time Machine's bar).
   */
  @Input() hoverable = true;
  /**
   * A state over the window as a thin bar right under the plot, over the time labels (`ChartStripRun`s — a device's state,
   * `stateStripRuns`): each run at its place on this chart's time axis, so it lines up with the lines above it; the picked time
   * ({@link pointerTime}) a line across it. `[]`: its track alone (still read); null: no bar.
   */
  @Input() strip: ChartStripRun[] | null = null;

  @ViewChild("chart") chartEl?: ElementRef<HTMLElement>;

  /** The readings at the pointer's time (a time picked elsewhere), its time ("4:16 AM") — none: nothing picked, or hovered here. */
  pointerReadings: PointerReading[] = [];
  pointerLabel = "";
  /** The state bar's place under the plot (px, in the plot's box) and its runs there; the picked time's line on it (px). */
  stripBox: { top: number; left: number; width: number } | null = null;
  stripRuns: { left: number; width: number; color: string | null; hatched: boolean; tip: string }[] = [];
  stripPointer: number | null = null;

  private chart: any;
  /** The series as last drawn (for the pointer's dots and readings). */
  private plotted: PlottedSeries[] = [];
  /** A pointer update sent by this chart itself: its axis line moved, no hover to report (`hoverTime`). */
  private applying = false;
  /** A hover synced in from another chart of the group ({@link syncTooltips} off): its time, shown as the pointer's. */
  private syncedTime: number | null = null;
  private syncedFrame = 0;
  /** The time the axis pointer is at (the pointer's own, unsnapped — the tooltip's title); none: not shown. */
  private axisTime: number | null = null;
  private restoreTimer?: ReturnType<typeof setTimeout>;
  private viewReady = false;
  private destroyed = false;
  private resizeObserver?: ResizeObserver;
  /** Series count at the last render — a change forces a full (notMerge) rebuild. */
  private lastSeriesCount = -1;
  /** While the pointer is over the chart, defer redraws so the hover tooltip +
   *  active point markers aren't wiped by a live data refresh. */
  private hovering = false;
  private pendingRender = false;
  /** The chart's width its lines were last bucketed for ({@link bucketByTime}): a resize past a fifth of it buckets them again. */
  private bucketedWidth = 0;
  /** Tooltip content switched off while this chart only mirrors another chart's pointer. */
  private tooltipMuted = false;
  private readonly onPointerEnter = () => {
    if (!this.hoverable) {
      return; // its time is set from elsewhere alone
    }
    this.hovering = true;
    if (this.inlineReadout) {
      return; // its own hover shows in its title row too (the axis pointer's updates)
    }
    this.muteTooltip(false); // this chart's own hover shows its tooltip again
    // Its own tooltip shows the values: the picked time's readings and dots step aside.
    if (this.pointerReadings.length) {
      this.clearReadings();
      this.cd.detectChanges();
    }
  };
  private readonly onPointerLeave = () => {
    if (!this.hoverable && !this.hovering) {
      return;
    }
    this.hovering = false;
    this.hoverTime.emit(null);
    if (!this.syncTooltips) {
      this.muteTooltip(true);
    }
    if (this.pendingRender) {
      this.pendingRender = false;
      this.render();
    }
    // Back to the time picked elsewhere (inline: or the latest readings) — once ECharts has hidden its own hover (its "globalout"
    // comes with this leave).
    clearTimeout(this.restoreTimer);
    this.restoreTimer = setTimeout(() => {
      if (!this.destroyed && !this.hovering && (this.pointerTime != null || this.inlineReadout)) {
        this.applyPointerTime();
        this.cd.detectChanges();
      }
    });
  };

  constructor(
    private readonly cd: ChangeDetectorRef,
    private readonly zone: NgZone
  ) {}

  /** True when no series has any finite points. */
  get isEmpty(): boolean {
    return !(this.series ?? []).some((s) => (s.data ?? []).some((p) => isFinite(Number(p.value))));
  }

  trackByName(_: number, r: PointerReading): string {
    return r.name;
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    const el = this.chartEl?.nativeElement;
    // Re-measure when the container resizes (panel open / card expand / widget resize) — the pointer's dots move with the plot.
    if (el && "ResizeObserver" in window) {
      this.resizeObserver = new ResizeObserver(() => {
        this.chart?.resize();
        const width = el.clientWidth;
        if (width > 0 && Math.abs(width - this.bucketedWidth) > Math.max(1, this.bucketedWidth) / 5) {
          this.render(); // the lines bucketed again for the new width
        }
        if (this.pointerReadings.length && !this.destroyed) {
          this.refreshPointer();
          this.cd.detectChanges();
        }
        if (this.strip && !this.destroyed) {
          this.placeStrip();
          this.cd.detectChanges();
        }
      });
      this.resizeObserver.observe(el);
    }
    el?.addEventListener("mouseenter", this.onPointerEnter);
    el?.addEventListener("mouseleave", this.onPointerLeave);
    this.render();
    // Readings set by this first draw (a picked time, inline's latest) and the state bar's place: shown now, not on the next check.
    if (this.pointerReadings.length || this.strip) {
      this.cd.detectChanges();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["syncTooltips"] || changes["inlineReadout"]) {
      if (!this.chart) {
        this.tooltipMuted = !this.syncTooltips || this.inlineReadout;
      } else if (!this.hovering) {
        this.muteTooltip(!this.syncTooltips || this.pointerTime != null);
      }
    }
    if (changes["pointerTime"] && !changes["pointerTime"].firstChange) {
      this.applyPointerTime();
      this.placeStripPointer();
    }
    // The state bar: shown or gone moves the time labels (a redraw); new runs are only placed again.
    if (this.viewReady && changes["strip"] && !changes["strip"].firstChange) {
      if (!changes["strip"].previousValue !== !this.strip) {
        this.render();
      } else {
        this.placeStrip();
      }
    }
    if (
      this.viewReady &&
      (changes["series"] ||
        changes["loading"] ||
        changes["dark"] ||
        changes["unit"] ||
        changes["averageWindow"] ||
        changes["maxPoints"] ||
        changes["smooth"] ||
        changes["animated"] ||
        changes["showLegend"] ||
        changes["area"] ||
        changes["yDecimals"] ||
        changes["xMin"] ||
        changes["xMax"] ||
        changes["yMin"] ||
        changes["yMax"] ||
        changes["yFloor"] ||
        changes["thresholds"] ||
        changes["hoverable"])
    ) {
      this.render();
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    clearTimeout(this.restoreTimer);
    cancelAnimationFrame(this.syncedFrame);
    this.resizeObserver?.disconnect();
    const el = this.chartEl?.nativeElement;
    el?.removeEventListener("mouseenter", this.onPointerEnter);
    el?.removeEventListener("mouseleave", this.onPointerLeave);
    this.chart?.dispose();
    this.chart = undefined;
  }

  /** Re-measure the canvas (call after the card is shown/resized). */
  resize(): void {
    this.chart?.resize();
  }

  /**
   * Mirror {@link pointerTime}: the axis pointer is moved to that time with the
   * tooltip content switched off, a dot put on each line at its reading then and
   * the readings shown (the title row's). ECharts needs a pixel inside the grid
   * to accept the update, so the time is converted to one (a time outside the
   * axis hides the line, the dots and the readings instead).
   */
  private applyPointerTime(): void {
    if (!this.chart || this.hovering) {
      return;
    }
    const ts = this.pointerTime;
    const x = ts == null ? NaN : this.chart.convertToPixel({ xAxisIndex: 0 }, ts);
    const y = this.chart.getHeight() / 2;
    if (ts == null || !isFinite(x) || !this.chart.containPixel({ gridIndex: 0 }, [x, y])) {
      this.dispatchOwn({ type: "updateAxisPointer", currTrigger: "leave" });
      this.muteTooltip(ts != null || !this.syncTooltips);
      if (this.inlineReadout) {
        this.setLatestReadings();
      } else {
        this.clearReadings();
      }
      return;
    }
    this.muteTooltip(true);
    this.dispatchOwn({ type: "updateAxisPointer", x, y, axesInfo: [{ axisDim: "x", axisIndex: 0, value: ts }] });
    this.setReadings(ts);
  }

  /** The pointer's dots and readings placed again (the plot redrawn or resized): a synced hover's, else the picked time's. */
  private refreshPointer(): void {
    if (this.syncedTime != null) {
      this.setReadings(this.syncedTime);
    } else {
      this.applyPointerTime();
    }
  }

  /**
   * An action of this chart's own — its pointer moved to a time picked elsewhere: not passed on to its {@link syncGroup} (every
   * chart of the group is given the time itself — passed on, each chart's move would run on all the others: a list of cards'
   * charts squared on every move of a Time Machine's marker), and no hover of the user's to report ({@link hoverTime}).
   */
  private dispatchOwn(action: Record<string, unknown>): void {
    const group = this.chart.group;
    this.applying = true;
    this.chart.group = "";
    try {
      this.chart.dispatchAction(action);
    } finally {
      this.chart.group = group;
      this.applying = false;
    }
  }

  /**
   * A hover relayed from another chart of the group placed on this one's plot. ECharts' connect relays it as the hovered chart's
   * sample — its time and its series' data index, no place — and each chart looks that index up in its own series: past its end
   * (a chart of fewer readings — one reported on change) the point is lost and the chart hides its line and its tooltip; within
   * it, its tooltip sits at another time's reading. The time is put at this chart's own pixel instead (outside its axis: hidden).
   */
  private placeRelayed(action: any): any {
    if (action?.type !== "updateAxisPointer" || action.x != null || action.currTrigger === "leave") {
      return action;
    }
    const value = (action.axesInfo ?? []).find((a: any) => a?.axisDim === "x")?.value;
    if (typeof value !== "number" || !isFinite(value)) {
      return action; // the hover gone (no time): hidden as relayed
    }
    const x = this.chart.convertToPixel({ xAxisIndex: 0 }, value);
    const mid = this.chart.getHeight() / 2;
    if (!isFinite(x) || !this.chart.containPixel({ gridIndex: 0 }, [x, mid])) {
      return { type: "updateAxisPointer", currTrigger: "leave" };
    }
    // Its tooltip beside the line: at the first series' reading then (none near: the plot's middle) — as the hovered chart's
    // follows the pointer, never pinned to one height.
    const first = this.plotted[0];
    const p = first ? nearestPoint(first.points, value, first.reach) : null;
    const at: number[] | null = p ? this.chart.convertToPixel({ seriesIndex: 0 }, p) : null;
    const y = at && isFinite(at[1]) && this.chart.containPixel({ gridIndex: 0 }, [x, at[1]]) ? at[1] : mid;
    return { type: "updateAxisPointer", x, y, axesInfo: action.axesInfo };
  }

  /** A hover on another chart of the group ({@link syncTooltips} off) — or, inline, on this one: its time, as the pointer's, a frame at a time. */
  private showSynced(ts: number | null): void {
    this.syncedTime = ts;
    cancelAnimationFrame(this.syncedFrame);
    this.syncedFrame = requestAnimationFrame(() => {
      if (this.destroyed || (this.hovering && !this.inlineReadout)) {
        return;
      }
      if (this.syncedTime != null) {
        this.setReadings(this.syncedTime);
      } else {
        // The hover has gone: back to the time picked elsewhere (its line too), or nothing.
        this.applyPointerTime();
      }
      this.cd.detectChanges();
    });
  }

  /** Each series' reading nearest the time (within its reach — none: "—", no dot) and its dot's place on the plot. */
  private setReadings(ts: number): void {
    this.pointerReadings = this.plotted.map((s, i) => {
      const p = nearestPoint(s.points, ts, s.reach);
      const at: number[] | null = p ? this.chart.convertToPixel({ seriesIndex: i }, p) : null;
      const placed = !!at && isFinite(at[0]) && isFinite(at[1]);
      return { name: s.name, color: s.color, value: p ? this.formatValue(p[1]) : "—", x: placed ? at![0] : null, y: placed ? at![1] : null };
    });
    this.pointerLabel = this.tooltipDateOnly ? formatShortDate(ts) : formatClockTime(ts);
  }

  /** Live (inline): each series' latest reading, no dot — its time the newest of them. */
  private setLatestReadings(): void {
    const last = (s: PlottedSeries) => s.points[s.points.length - 1];
    this.pointerReadings = this.plotted.map((s) => ({ name: s.name, color: s.color, value: last(s) ? this.formatValue(last(s)[1]) : "—", x: null, y: null }));
    const newest = Math.max(...this.plotted.map((s) => last(s)?.[0] ?? -Infinity));
    this.pointerLabel = isFinite(newest) ? (this.tooltipDateOnly ? formatShortDate(newest) : formatClockTime(newest)) : "";
  }

  private clearReadings(): void {
    if (this.pointerReadings.length) {
      this.pointerReadings = [];
      this.pointerLabel = "";
    }
  }

  /** A value as the tooltip shows it: a decimal, the unit after it ("21.4 °C"). */
  private formatValue(raw: number): string {
    return `${Math.round(Number(raw) * 10) / 10}${this.unit ? " " + this.unit : ""}`;
  }

  /** Hide / show the tooltip box (the axis pointer keeps working either way). */
  private muteTooltip(muted: boolean): void {
    muted ||= this.inlineReadout; // inline: never a box
    if (this.tooltipMuted === muted || !this.chart) {
      return;
    }
    this.tooltipMuted = muted;
    this.chart.setOption({ tooltip: { showContent: !muted } });
  }

  private render(): void {
    const el = this.chartEl?.nativeElement;
    if (!el || this.destroyed) {
      return;
    }
    // Init the chart up front so we can show the loading spinner over an empty
    // frame (no "No data" text flash before the line arrives).
    if (!this.chart) {
      // Outside Angular's zone: ECharts listens to every pointer move over the plot (and, in a synced group, each move runs on every
      // chart of it) — inside the zone each would run the whole dashboard's change detection, the hover dropping frames. What a
      // hover changes on screen is redrawn by this component itself (`detectChanges`), and its `hoverTime` re-enters the zone only
      // where a host listens.
      this.chart = this.zone.runOutsideAngular(() => echarts.init(el, null, { renderer: "svg" }));
      hideChartTooltipOnLeave(this.chart, el);
      // Group + connect so charts in the same group share the hover tooltip and
      // axis pointer (connect re-scans the group, linking later-created charts).
      if (this.syncGroup) {
        this.chart.group = this.syncGroup;
        echarts.connect(this.syncGroup);
        const dispatch = this.chart.dispatchAction.bind(this.chart);
        this.chart.dispatchAction = (action: any, opt?: unknown) => dispatch(this.placeRelayed(action), opt);
      }
      // The axis pointer's time — fired on every chart of a synced group, so a
      // host hears the hover whichever chart the pointer is over.
      // (Not the moves of its own pointer to a time picked elsewhere: no hover there.) A hover on another chart of the group, with
      // the boxes of the others off (`syncTooltips`), shows here as that time's dots and readings.
      this.chart.on("updateAxisPointer", (e: any) => {
        const value = e?.axesInfo?.[0]?.value;
        const ts = typeof value === "number" && isFinite(value) ? value : null;
        this.axisTime = ts;
        // ECharts redraws a tooltip's text only when its nearest reading changes (it keeps its last content, `_lastDataByCoordSys`):
        // the pointer's time moves on between readings, so that is dropped and the title and rows follow the pointer.
        if (ts != null) {
          const tip = this.chart?._componentsViews?.find((v: any) => v?.type === "tooltip");
          if (tip) {
            tip._lastDataByCoordSys = null;
          }
        }
        if (this.applying) {
          return;
        }
        this.hoverTime.emit(ts);
        if (this.inlineReadout || (!this.syncTooltips && !this.hovering)) {
          this.showSynced(ts);
        }
      });
    }
    // Don't redraw while hovering — it would dismiss the active tooltip and the
    // hover point markers. Apply the latest data once the pointer leaves.
    if (this.hovering) {
      this.pendingRender = true;
      return;
    }

    const styles = getComputedStyle(el);
    const cssVar = (name: string) => styles.getPropertyValue(name).trim();
    const axisText = cssVar("--c-text-neutral-light");
    const axisLine = cssVar("--c-border-neutral-light");
    const splitLine = cssVar("--c-border-neutral-light");

    // Loading state: strip any previous line so the spinner overlay (template)
    // sits on an empty frame, rather than flashing a "No data" label. The
    // spinner itself is a DOM element, so re-rendering here can't disturb it.
    if (this.isEmpty) {
      if (this.lastSeriesCount !== -1) {
        this.chart.clear();
        this.lastSeriesCount = -1; // next non-empty render rebuilds fully
      }
      this.plotted = [];
      this.clearReadings();
      return;
    }

    // A series colour may be a theme token (`var(--c-chart-1)`): resolved against the element each render, so it follows light / dark.
    const resolve = (c: string) => {
      const name = (c || "").match(/^var\(\s*(--[^),\s]+)/)?.[1];
      return (name ? cssVar(name) : c) || c;
    };
    const plotted: PlottedSeries[] = [];
    const series = (this.series ?? []).map((s) => {
      const color = resolve(s.color);
      const points = (s.data ?? [])
        .map((p) => [p.ts, Number(p.value)] as [number, number])
        .filter((p) => isFinite(p[1]))
        .sort((a, b) => a[0] - b[0]);
      const data = this.movingAverage(this.downsample(this.bucketByTime(points, el.clientWidth), this.maxPoints), this.averageWindow);
      // A reading's reach for the pointer: a quarter-hour, or twice the series' mean spacing (a day-binned month's: two days).
      const spacing = data.length > 1 ? (data[data.length - 1][0] - data[0][0]) / (data.length - 1) : 0;
      plotted.push({ name: s.name, color, points: data, reach: Math.max(POINTER_REACH_MS, 2 * spacing) });
      const opt: any = {
        name: s.name,
        type: "line",
        // Show point markers when the series is too sparse to draw a line, so a
        // lone reading is still visible instead of appearing as "no data".
        showSymbol: data.length <= 2,
        // A point is a dot in the line's colour, no ring — hovered too, as the picked time's dot (never ECharts' hollow circle,
        // white-filled: a pale ring on a dark card), in both themes.
        symbol: "circle",
        symbolSize: 8,
        emphasis: { scale: false, itemStyle: { color, borderWidth: 0 } },
        smooth: this.smooth,
        // Downsample to the plot width when there are many points (cheap render).
        sampling: "lttb",
        // A dotted line: dashes of no length with round caps — a row of round dots.
        lineStyle: s.dotted
          ? { color, width: 2, type: [0, 4], cap: "round" }
          : s.dashed
            ? { color, width: 1.5, type: "dashed", opacity: 0.7 }
            : { color, width: 1.5 },
        itemStyle: { color, borderWidth: 0 },
        // A comparison (dashed) behind the lines, a reference (dotted) over them and their fills.
        z: s.dotted ? 3 : s.dashed ? 1 : 2,
        data,
      };
      if (this.area && !s.dashed && !s.dotted) {
        opt.areaStyle = {
          // Always fill down to the axis baseline (not toward y=0), so negative
          // series like RSSI still fill to the bottom of the chart.
          origin: "start",
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: hexToRgba(color, 0.6) },
              { offset: 1, color: hexToRgba(color, 0.1) },
            ],
          },
        };
      }
      return opt;
    });

    // Threshold lines ride on a series of their own — no data, not in the legend — so hiding a series from the legend (Channel 1) never
    // takes them with it. Always there (its lines may be none) so removing a threshold clears the line on a merged update, and the series
    // count stays the same.
    const thresholds = (this.thresholds ?? []).filter((t) => isFinite(Number(t.value)));
    // Their values: the y axis reaches each (below).
    const limits = thresholds.map((t) => Number(t.value));
    // A captioned line's label sits over it (its value, ~17px tall with its gap): a line at the plot's top — the axis stretched
    // to reach it — would have its label cut off by the chart's edge, so while one is drawn the plot starts lower, leaving it room.
    const plotTop = thresholds.some((t) => !!t.label) ? PLOT_TOP_PX + THRESHOLD_LABEL_ROOM_PX : PLOT_TOP_PX;
    const lines: any[] = [...series];
    if (series.length) {
      lines.push({
        id: "tb-thresholds",
        type: "line",
        data: [],
        silent: true,
        tooltip: { show: false },
        markLine: {
          silent: true,
          symbol: "none",
          animation: false,
          data: thresholds.map((t) => {
            // Resolve "var(--x)" against the chart element so a themed token
            // follows light/dark (re-resolved on every render).
            const raw = t.color || LINE_CHART_THRESHOLD_COLOR;
            const varName = raw.match(/^var\(\s*(--[^),\s]+)/)?.[1];
            const color = (varName ? cssVar(varName) : raw) || "#f59e0b";
            return {
              yAxis: Number(t.value),
              lineStyle: { color, width: 1.5, type: "dashed" },
              label: {
                show: !!t.label,
                formatter: t.label ?? "",
                position: "insideEndTop",
                color,
                fontSize: 10,
              },
            };
          }),
        },
      });
    }

    this.chart.setOption(
      {
        // Animation settings copied from ThingsBoard's time-series chart
        // (chart.models.ts → chartAnimationDefaultSettings). animationThreshold
        // auto-disables animation past 2000 points so big series stay snappy.
        animation: this.animated,
        animationThreshold: 2000,
        animationDuration: 500,
        animationEasing: "cubicOut",
        animationDelay: 0,
        animationDurationUpdate: 300,
        animationEasingUpdate: "cubicOut",
        animationDelayUpdate: 0,
        color: series.map((s) => s.itemStyle.color),
        grid: { left: 8, right: 12, top: plotTop, bottom: this.showLegend ? 28 : 8, containLabel: true },
        legend: {
          show: this.showLegend,
          bottom: 0,
          icon: "roundRect",
          itemWidth: 14,
          itemHeight: 3,
          itemGap: 18,
          textStyle: { color: axisText, fontSize: 12 },
          data: series.map((s) => s.name),
        },
        tooltip: {
          trigger: "axis",
          // Not hoverable: the pointer moves nothing (the axis pointer only as set from elsewhere).
          triggerOn: this.hoverable ? "mousemove|click" : "none",
          showContent: !this.tooltipMuted,
          // Over the plot: near an edge it flips inward rather than straying across the panel (drawn on the page, never clipped).
          confine: true,
          // The shared chart tooltip (chart-tooltip.ts — the Fuel Reports page's look).
          ...chartTooltipStyle(styles),
          // Header: "May 23, 1:05 PM"; then a row a series — its swatch, its name, its value (the charts' shared layout). Every
          // series' reading nearest that time (within its reach — none: left out), not ECharts' own pick: it lists only the series
          // whose reading is the very nearest, so a series read at other times (an hour average beside its rate) went missing.
          formatter: (params: any) => {
            const arr = Array.isArray(params) ? params : [params];
            if (!arr.length) {
              return "";
            }
            // The pointer's time (it follows the pointer, never snapping: see the x axis' axisPointer), else ECharts' snapped one.
            const ts = this.axisTime ?? (Array.isArray(arr[0].value) ? arr[0].value[0] : arr[0].axisValue);
            const rows = this.plotted.flatMap((s) => {
              const p = nearestPoint(s.points, ts, s.reach);
              return p ? [{ name: s.name, value: this.formatValue(p[1]), swatch: s.color }] : [];
            });
            return chartTooltipHtml(this.formatTooltipDate(ts), rows);
          },
        },
        xAxis: {
          type: "time",
          // Pin the axis to the requested window so it spans the full range even
          // when the data doesn't fill it; otherwise ECharts fits to the data.
          min: this.xMin ?? "dataMin",
          max: this.xMax ?? "dataMax",
          axisLabel: {
            color: axisText,
            fontSize: 11,
            hideOverlap: true,
            // A state bar under the plot: the labels under it.
            margin: AXIS_LABEL_MARGIN_PX + (this.strip ? STRIP_GAP_PX + STRIP_HEIGHT_PX : 0),
            // 12-hour clock ("2 PM", "2:30 PM"); midnight ticks show the date.
            formatter: (v: number) => {
              const d = new Date(v);
              return d.getHours() === 0 && d.getMinutes() === 0 ? formatShortDate(d) : formatClockTime(d, true);
            },
          },
          axisLine: { lineStyle: { color: axisLine } },
          axisTick: { show: false },
          splitLine: { show: false },
          // The hover line follows the pointer, never snapping to a reading: snapped, it hopped from one reading to the next (and,
          // readings far apart, eased there — a stutter), and each chart of a group stood at its own reading's time. The tooltip
          // lists each series' reading nearest it. (Set on the axis: ECharts overrides a tooltip's own `snap`.)
          axisPointer: { snap: false },
        },
        yAxis: {
          type: "value",
          scale: true,
          // Baseline range (when given): the axis always shows [yMin, yMax], and
          // grows past it when data or a threshold line sits outside — never under
          // a floor (`yFloor`). With no baseline, ECharts' own ends, but a threshold
          // outside the readings is reached (ECharts leaves a mark line out of the
          // extent: a tank's 170 °C limit over 148 °C readings would be off the plot).
          // A callback's null leaves the end to ECharts.
          min:
            this.yMin == null && this.yFloor == null && !limits.length
              ? undefined
              : (v: { min: number }) => {
                  const min =
                    this.yMin != null
                      ? Math.min(this.yMin, Math.floor(v.min), ...limits)
                      : limits.length && isFinite(v.min) && Math.min(...limits) < v.min
                        ? Math.min(...limits)
                        : null;
                  return this.yFloor != null && (min ?? v.min) < this.yFloor ? this.yFloor : min;
                },
          max:
            this.yMax == null && this.yFloor == null && !limits.length
              ? undefined
              : (v: { max: number }) => {
                  if (this.yMax != null) {
                    return Math.max(this.yMax, Math.ceil(v.max), ...limits);
                  }
                  if (limits.length && isFinite(v.max) && Math.max(...limits) > v.max) {
                    return Math.max(...limits);
                  }
                  // Every reading under the floor: an empty strip just over it, not an axis ending under its start.
                  return this.yFloor != null && v.max <= this.yFloor ? this.yFloor + 1 : null;
                },
          // Round labels to {@link yDecimals} places, dropping trailing zeros
          // (avoids artefacts like 21.900000000002; yDecimals=0 → whole degrees).
          axisLabel: {
            color: axisText,
            fontSize: 11,
            formatter: (v: number) => {
              const f = 10 ** this.yDecimals;
              return `${Math.round(v * f) / f}`;
            },
          },
          axisLine: { show: false },
          splitLine: { lineStyle: { color: splitLine, type: "dashed" } },
        },
        series: lines,
      },
      // Merge data updates so an active hover tooltip survives a live refresh;
      // only force a full rebuild when the series count actually changes.
      { notMerge: lines.length !== this.lastSeriesCount },
    );
    this.lastSeriesCount = lines.length;
    this.plotted = plotted;
    // A time picked elsewhere (or a synced hover) stays shown on the redrawn plot: its line, its dots and readings placed again
    // (inline, live: the latest readings).
    if (this.pointerTime != null || this.syncedTime != null || this.inlineReadout) {
      this.refreshPointer();
    }
    this.placeStrip();
  }

  trackByStripRun(index: number): number {
    return index;
  }

  /** The plot's box in the chart (px): the grid's rect — where the axes put it, its y axis' labels at its left. */
  private plotRect(): { x: number; y: number; width: number; height: number } | null {
    const rect = this.chart?.getModel?.()?.getComponent?.("grid", 0)?.coordinateSystem?.getRect?.();
    return rect && rect.width > 0 ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null;
  }

  /** The state bar's place under the plot and its runs' places on the time axis (after a draw, a resize, new runs). */
  private placeStrip(): void {
    const rect = this.strip && this.chart ? this.plotRect() : null;
    if (!rect || !this.strip) {
      this.stripBox = null;
      this.stripRuns = [];
      this.stripPointer = null;
      return;
    }
    this.stripBox = { top: rect.y + rect.height + STRIP_GAP_PX, left: rect.x, width: rect.width };
    const at = (ts: number) => Math.min(rect.width, Math.max(0, this.chart.convertToPixel({ xAxisIndex: 0 }, ts) - rect.x));
    this.stripRuns = this.strip
      .map((r) => {
        const left = at(r.start);
        return { left, width: at(r.end) - left, color: r.hatched ? null : r.color ?? null, hatched: !!r.hatched, tip: r.tip };
      })
      .filter((r) => r.width > 0);
    this.placeStripPointer();
  }

  /** The picked time's line on the state bar (none: live, or outside the window). */
  private placeStripPointer(): void {
    const ts = this.pointerTime;
    const rect = ts != null && this.stripBox ? this.plotRect() : null;
    const x = rect && ts != null ? this.chart.convertToPixel({ xAxisIndex: 0 }, ts) - rect.x : NaN;
    this.stripPointer = rect && isFinite(x) && x >= 0 && x <= rect.width ? x : null;
  }

  /**
   * Reduce to at most `maxPoints` by grouping consecutive points into equal
   * buckets and averaging each bucket's timestamp + value. Far fewer points get
   * rendered while preserving the overall shape. Off when `maxPoints` <= 0.
   */
  private downsample(points: [number, number][], maxPoints: number): [number, number][] {
    if (!maxPoints || maxPoints <= 0 || points.length <= maxPoints) {
      return points;
    }
    const bucketSize = Math.ceil(points.length / maxPoints);
    const out: [number, number][] = [];
    for (let i = 0; i < points.length; i += bucketSize) {
      const end = Math.min(points.length, i + bucketSize);
      let sumT = 0;
      let sumV = 0;
      for (let j = i; j < end; j++) {
        sumT += points[j][0];
        sumV += points[j][1];
      }
      const n = end - i;
      out.push([sumT / n, sumV / n]);
    }
    return out;
  }

  /**
   * A dense line's readings averaged into time buckets about {@link BUCKET_PX} of the plot wide (a whole step,
   * {@link BUCKET_STEPS_MS}): each bucket's readings one point, at their mean time and value; an empty bucket none, so a gap
   * stays a gap. A line no denser than that is left as read.
   */
  private bucketByTime(points: [number, number][], chartWidth: number): [number, number][] {
    this.bucketedWidth = chartWidth;
    const buckets = Math.floor((chartWidth - PLOT_INSET_PX) / BUCKET_PX);
    if (buckets < 2 || points.length <= buckets) {
      return points;
    }
    const span = (this.xMax ?? points[points.length - 1][0]) - (this.xMin ?? points[0][0]);
    if (!(span > 0)) {
      return points;
    }
    const step = BUCKET_STEPS_MS.find((ms) => ms >= span / buckets) ?? span / buckets;
    const out: [number, number][] = [];
    let bucket = NaN;
    let sumTs = 0;
    let sumValue = 0;
    let count = 0;
    for (const [ts, value] of points) {
      const at = Math.floor(ts / step);
      if (at !== bucket) {
        if (count) {
          out.push([sumTs / count, sumValue / count]);
        }
        bucket = at;
        sumTs = sumValue = count = 0;
      }
      sumTs += ts;
      sumValue += value;
      count++;
    }
    if (count) {
      out.push([sumTs / count, sumValue / count]);
    }
    return out;
  }

  /** Centred moving average over `window` points (returns input unchanged when off). */
  private movingAverage(points: [number, number][], window: number): [number, number][] {
    if (!window || window <= 1 || points.length < 2) {
      return points;
    }
    const half = Math.floor(window / 2);
    return points.map((p, i) => {
      const start = Math.max(0, i - half);
      const end = Math.min(points.length, i + half + 1);
      let sum = 0;
      for (let j = start; j < end; j++) {
        sum += points[j][1];
      }
      return [p[0], sum / (end - start)] as [number, number];
    });
  }

  /** Format a timestamp as "May 23, 1:05 PM" (month day, then 12-hour time). */
  private formatTooltipDate(ts: number): string {
    return this.tooltipDateOnly ? formatShortDate(ts) : formatDateTime(ts);
  }
}

/** The point of a series (sorted by time) nearest a time, if within `reach` of it. */
function nearestPoint(points: [number, number][], ts: number, reach: number): [number, number] | null {
  if (!points.length) {
    return null;
  }
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid][0] < ts) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  // `lo`: the first at or after the time; the one before it may be nearer.
  const best = lo > 0 && Math.abs(points[lo - 1][0] - ts) <= Math.abs(points[lo][0] - ts) ? points[lo - 1] : points[lo];
  return Math.abs(best[0] - ts) <= reach ? best : null;
}
