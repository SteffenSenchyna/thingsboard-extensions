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

import { AfterViewInit, Component, ElementRef, EventEmitter, HostBinding, Input, NgZone, OnChanges, OnDestroy, Output, ViewChild } from "@angular/core";
import { CommonModule } from "@angular/common";
import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import { chartTooltipHtml, chartTooltipStyle, hideChartTooltipOnLeave } from "../chart-tooltip";

echarts.use([BarChart, GridComponent, LegendComponent, TooltipComponent, SVGRenderer]);

/** One series of a {@link BarChartComponent}: a value per category. */
export interface BarChartSeries {
  name: string;
  /** A colour or a theme token, e.g. `var(--c-chart-1)` (re-resolved on every render, so it follows light / dark). */
  color: string;
  /** One value per category, in the categories' order. */
  data: number[];
}

/**
 * Themed bar / column chart (ECharts) for categories — days, hours, stations:
 * columns (default) or horizontal bars, grouped or {@link stacked}. Drawn to
 * the shared chart rules: columns at most 24px thick and horizontal bars 16px
 * (the rest of their band is air), a 4px rounded data end (square at the
 * baseline) — stacked, on the outermost segment only — a 2px surface gap between stacked segments, recessive axes —
 * solid hairline gridlines, a few clean ticks — and a ranked list's names in
 * the stronger text colour, text in the text colours (never the series colour), a legend
 * from two series up, and a hover tooltip per category (with the total when
 * stacked) in the line charts' style (chart-tooltip.ts). Series colours should come from the chart palette
 * (`var(--c-chart-1)` …, in order). One category can stand out ({@link highlight} — today in a chart by the
 * day, this hour in one by the hour): its bars in full, the others dimmed, its value (its stack's total) in a
 * pill on top of it. Categories with no data at all ({@link gaps} — no pump online that day) show a striped grey
 * bar the plot's height, "No data" in the tooltip — never a zero. A chart over time can label its two ends
 * alone ({@link axisEnds}); hovering a category says which ({@link categoryHover}). Ticks read compact from a
 * thousand ("1.2k").
 *
 * ```html
 * <tb-bar-chart [categories]="days" [series]="byFuel" [stacked]="true" unit="L" [dark]="dark"></tb-bar-chart>
 * ```
 */
/**
 * The "no data" bars' fill: the neutral fill, faint, crossed by diagonal stripes ("/") in the border's colour — a tile repeated, drawn at
 * the screen's pixel density (scaled back to CSS pixels) so its lines stay sharp.
 */
function stripes(fill: string, line: string): { image: HTMLCanvasElement; repeat: "repeat"; scaleX: number; scaleY: number } {
  const size = 8; // a stripe every 8px, across
  const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size * dpr;
  const g = canvas.getContext("2d");
  if (g) {
    g.scale(dpr, dpr);
    g.globalAlpha = 0.5;
    g.fillStyle = fill;
    g.fillRect(0, 0, size, size);
    g.globalAlpha = 0.9;
    g.strokeStyle = line;
    g.lineWidth = 1.25;
    g.beginPath();
    // The tile's diagonal and its neighbours' corners, so the stripes run on unbroken from tile to tile.
    for (const shift of [-size, 0, size]) {
      g.moveTo(shift, size);
      g.lineTo(shift + size, 0);
    }
    g.stroke();
  }
  return { image: canvas, repeat: "repeat", scaleX: 1 / dpr, scaleY: 1 / dpr };
}

/** The value axis the "no data" outlines stand on: 0 to 1, hidden — so an outline of 1 is the plot's full height. */
const GAP_AXIS = { type: "value", min: 0, max: 1, show: false, splitLine: { show: false } };

@Component({
  selector: "tb-bar-chart",
  templateUrl: "./bar-chart.component.html",
  styleUrls: ["./bar-chart.component.scss"],
  standalone: true,
  imports: [CommonModule],
})
export class BarChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  /** Never let the browser's native tooltip show on the host. */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;

  /** The category labels (the x axis; the y axis when {@link horizontal}). */
  @Input() categories: string[] = [];
  @Input() series: BarChartSeries[] = [];
  /** Stack the series in one bar per category (instead of side by side). */
  @Input() stacked = false;
  /** Horizontal bars, the first category on top (for ranked lists). */
  @Input() horizontal = false;
  /** Each bar's value at its end (the total of a stacked bar). */
  @Input() valueLabels = false;
  @Input() unit = "";
  /** Decimal places for values (tooltip and labels). */
  @Input() decimals = 0;
  /** The legend — by default shown from two series up (a single series is named by its card's title). */
  @Input() showLegend: boolean | null = null;
  /** Chart height (CSS length). */
  @Input() height = "220px";
  /** Active theme — drives the axis / tooltip colours (re-renders when toggled). */
  @Input() dark = false;
  /** Its data is loading: with none yet, its plot's wireframe (placeholder bars — never a "Loading…" line). */
  @Input() loading = false;
  /** Its plot's wireframe whatever it holds — its page's first reads aren't all in yet. */
  @Input() wireframe = false;
  @Input() emptyText = "No data";
  /**
   * The category that stands out (its index — today, this hour; null: none): its bars in full colour, every other one dimmed, and
   * its value — its stack's total — in a pill on top of it, in the chart palette's first colour.
   */
  @Input() highlight: number | null = null;
  /** The categories with no data at all (their indexes): a striped grey bar the plot's height in their place, "No data" in the tooltip. */
  @Input() gaps: number[] = [];
  /** Each category's name in full for its tooltip's header ("Tue, Nov 10"); none given: the axis's label. */
  @Input() tooltipTitles: string[] = [];
  /** A chart over time: its category axis labels its first and last categories alone (the rest in the tooltip). */
  @Input() axisEnds = false;
  /** The category hovered (its index), null once the pointer leaves the plot. */
  @Output() categoryHover = new EventEmitter<number | null>();
  private hovered: number | null = null;

  /** The wireframe's bars (their lengths, %: varied, the same each time). */
  readonly wireframeBars = [46, 72, 58, 88, 64, 40, 76, 54, 68, 36, 82, 60];
  readonly wireframeRows = this.wireframeBars.slice(0, 6);

  @ViewChild("chart") private chartEl?: ElementRef<HTMLElement>;

  private chart: any;

  constructor(private readonly zone: NgZone) {}
  private viewReady = false;
  private resizeObserver?: ResizeObserver;

  /** True when no series has a value. */
  get isEmpty(): boolean {
    return !this.categories.length || !this.series.some((s) => s.data.some((v) => isFinite(Number(v))));
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    const el = this.chartEl?.nativeElement;
    if (el && "ResizeObserver" in window) {
      this.resizeObserver = new ResizeObserver(() => this.chart?.resize());
      this.resizeObserver.observe(el);
    }
    this.render();
  }

  ngOnChanges(): void {
    if (this.viewReady) {
      this.render();
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.chart?.dispose();
    this.chart = undefined;
  }

  private render(): void {
    const el = this.chartEl?.nativeElement;
    if (!el) {
      return;
    }
    if (!this.chart) {
      // Outside Angular's zone (as `tb-line-chart`): ECharts listens to every pointer move over the plot — inside the zone each
      // would run the whole dashboard's change detection. `categoryHover` re-enters it, only where a page listens.
      this.chart = this.zone.runOutsideAngular(() => echarts.init(el, null, { renderer: "svg" }));
      hideChartTooltipOnLeave(this.chart, el);
      // The category under the pointer (the axis pointer's), and none once it leaves the plot — listened to once, by handler: never
      // `off` an event wholesale, which would take ECharts' own listeners too (its "globalout" is what hides the tooltip).
      this.chart.on("updateAxisPointer", (e: any) => {
        const index = e?.axesInfo?.[0]?.value;
        this.setHovered(typeof index === "number" ? index : null);
      });
      this.chart.getZr().on("globalout", () => this.setHovered(null));
    }
    if (this.isEmpty) {
      this.chart.clear();
      return;
    }
    const styles = getComputedStyle(el);
    const cssVar = (name: string) => styles.getPropertyValue(name).trim();
    const resolve = (color: string) => {
      const name = color.match(/^var\(\s*(--[^),\s]+)/)?.[1];
      return (name ? cssVar(name) : color) || color;
    };
    const axisText = cssVar("--c-text-neutral-light");
    // A horizontal chart's categories are names (a ranked list): read in the stronger text colour.
    const nameText = cssVar("--c-text-neutral-semilight");
    const valueText = cssVar("--c-text-neutral-semilight");
    const gridLine = cssVar("--c-border-neutral-light");
    const surface = cssVar("--c-bg-neutral-extralight");
    const pillFill = resolve("var(--c-chart-1)");
    const gapLine = cssVar("--c-border-neutral-normal");
    const gapFill = cssVar("--c-bg-neutral-light");
    const gapSet = new Set(this.gaps.filter((g) => g >= 0 && g < this.categories.length));

    const n = this.series.length;
    const legend = this.showLegend ?? n >= 2;
    const value = (v: number) => Number(v).toLocaleString("en-US", { maximumFractionDigits: this.decimals });
    const withUnit = (v: number) => `${value(v)}${this.unit ? " " + this.unit : ""}`;
    const totals = this.categories.map((_, i) => this.series.reduce((sum, s) => sum + (Number(s.data[i]) || 0), 0));
    // The category standing out — only when it has something to show: an empty one (nothing yet today, no data) dims nothing.
    const lit =
      this.highlight !== null && this.highlight >= 0 && this.highlight < this.categories.length && totals[this.highlight] > 0 && !gapSet.has(this.highlight)
        ? this.highlight
        : null;
    // The data end rounds (4px); the baseline end stays square. Stacked: only the outermost segment with a value — one with a
    // segment on top of it stays square; on its own (none on top: all online, none offline) it rounds.
    const radius = this.horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0];
    const outermost = this.categories.map((_, j) => {
      for (let k = n - 1; k > 0; k--) {
        if (Number(this.series[k].data[j]) > 0) {
          return k;
        }
      }
      return 0;
    });

    const series = this.series.map((s, i) => {
      const top = !this.stacked || i === n - 1;
      return {
        name: s.name,
        type: "bar",
        stack: this.stacked ? "total" : undefined,
        barMaxWidth: this.horizontal ? 16 : 24,
        barGap: "20%",
        data: s.data.map((v, j) => {
          const end = !this.stacked || outermost[j] === i;
          const item: Record<string, unknown> = {
            value: v,
            // The highlighted category's bars in full; the others dimmed.
            itemStyle: { borderRadius: end ? radius : 0, opacity: lit === null || j === lit ? 1 : 0.38 },
          };
          if (j === lit && end && (this.stacked ? totals[j] : Number(v)) > 0) {
            // Its value — its stack's total — in a pill on its end.
            item["label"] = {
              show: true,
              position: this.horizontal ? "right" : "top",
              distance: 6,
              color: surface,
              backgroundColor: pillFill,
              borderRadius: 4,
              padding: [3, 6],
              fontSize: 11,
              fontWeight: 600,
              formatter: () => withUnit(this.stacked ? totals[j] : Number(v)),
            };
          }
          return item;
        }),
        itemStyle: {
          color: resolve(s.color),
          // The 2px surface gap between stacked segments (1px of surface on each).
          borderColor: this.stacked ? surface : undefined,
          borderWidth: this.stacked ? 1 : 0,
        },
        emphasis: { disabled: true },
        label: {
          show: this.valueLabels && top,
          position: this.horizontal ? "right" : "top",
          distance: 6,
          color: valueText,
          fontSize: 11,
          formatter: (p: any) => value(this.stacked ? totals[p.dataIndex] : p.value),
        },
      };
    });

    // Axis ticks: in full under a thousand, compact past it ("1.2k", "12k") — one style per axis.
    const axisMax = Math.max(...(this.stacked ? totals : this.series.flatMap((s) => s.data.map(Number))));
    const tick = (v: number) =>
      axisMax >= 1000 ? `${(v / 1000).toLocaleString("en-US", { maximumFractionDigits: axisMax >= 10000 ? 0 : 1 })}k` : v.toLocaleString("en-US");
    // The categories with no data: a striped grey bar the plot's height over each (out of the legend and the stack). It sits
    // over its category's bar (ECharts takes the last series' gap for all), so only where a category holds one bar or one stack.
    const gapsShown = gapSet.size > 0 && (this.stacked || n <= 1);
    if (gapsShown) {
      // On a hidden value axis of its own (0 to 1), each outline 1: the plot's full height, whatever the bars' scale.
      series.push({
        name: "No data",
        type: "bar",
        stack: undefined,
        barMaxWidth: this.horizontal ? 16 : 24,
        barGap: "-100%",
        ...(this.horizontal ? { xAxisIndex: 1 } : { yAxisIndex: 1 }),
        // Grey, striped, a hairline round it; nothing at all where there's data ("-": no bar, not even its border at the foot).
        data: this.categories.map((_, j) =>
          gapSet.has(j)
            ? { value: 1, itemStyle: { color: stripes(gapFill, gapLine), borderColor: gapLine, borderWidth: 1, borderRadius: radius, opacity: 1 } }
            : "-"
        ),
        itemStyle: { color: "transparent", borderColor: undefined, borderWidth: 0 },
        emphasis: { disabled: true },
        label: { show: false } as any,
        silent: true,
        z: 1,
      } as any);
    }
    const last = this.categories.length - 1;
    const categoryAxis = {
      type: "category",
      data: this.categories,
      inverse: this.horizontal, // ranked lists read top-down
      axisLabel: this.horizontal
        ? { color: nameText, fontSize: 12, margin: 12, hideOverlap: true }
        : {
            color: axisText,
            fontSize: 11,
            hideOverlap: true,
            // Over time, the two ends alone (the rest are the tooltip's).
            ...(this.axisEnds ? { interval: (i: number) => i === 0 || i === last, alignMinLabel: "left", alignMaxLabel: "right" } : {}),
          },
      axisLine: { lineStyle: { color: gridLine } },
      axisTick: { show: false },
    };
    // Recessive: a few clean ticks, solid hairline gridlines.
    const valueAxis = {
      type: "value",
      splitNumber: 4,
      axisLabel: { color: axisText, fontSize: 11, margin: 10, formatter: tick },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: gridLine, width: 1, type: "solid" } },
    };

    this.chart.setOption(
      {
        animation: true,
        animationDuration: 500,
        animationEasing: "cubicOut",
        animationDurationUpdate: 300,
        animationEasingUpdate: "cubicOut",
        grid: {
          left: 8,
          right: this.horizontal && (this.valueLabels || lit !== null) ? 64 : 12,
          top: (this.valueLabels || lit !== null) && !this.horizontal ? 28 : 12,
          bottom: legend ? 28 : 4,
          containLabel: true,
        },
        legend: {
          show: legend,
          bottom: 0,
          icon: "roundRect",
          itemWidth: 10,
          itemHeight: 10,
          itemGap: 18,
          textStyle: { color: axisText, fontSize: 12 },
          data: this.series.map((s) => s.name),
        },
        tooltip: {
          trigger: "axis",
          // Over the plot: near an edge it flips inward (drawn on the page, never clipped).
          confine: true,
          axisPointer: { type: "shadow", shadowStyle: { color: this.dark ? "rgba(255, 255, 255, 0.05)" : "rgba(10, 30, 60, 0.05)" } },
          // The shared chart tooltip (chart-tooltip.ts — the Fuel Reports page's look).
          ...chartTooltipStyle(styles),
          // The category in full, muted; a row a series (its swatch, its name, its value right-aligned) — a stack's empty parts left
          // out — then a hairline and the stack's total; a category with no data, the striped swatch and "No data".
          formatter: (params: any) => {
            const arr = Array.isArray(params) ? params : [params];
            if (!arr.length) {
              return "";
            }
            const index: number = arr[0].dataIndex;
            const title = this.tooltipTitles[index] || arr[0].axisValueLabel;
            if (gapSet.has(index)) {
              const pattern = `repeating-linear-gradient(-45deg, ${gapLine} 0 1.5px, ${gapFill} 1.5px 4px)`;
              return chartTooltipHtml(title, [{ name: "No data", value: "", swatch: pattern, swatchBorder: gapLine }]);
            }
            const shown = arr.filter((p: any) => p.seriesName !== "No data" && this.series[p.seriesIndex]);
            const parts = this.stacked && n > 1 ? shown.filter((p: any) => Number(p.value) > 0) : shown;
            const rows = (parts.length ? parts : shown).map((p: any) => ({
              name: p.seriesName,
              value: withUnit(Number(p.value) || 0),
              swatch: resolve(this.series[p.seriesIndex].color),
            }));
            return chartTooltipHtml(title, rows, this.stacked && n > 1 ? { label: "Total", value: withUnit(totals[index]) } : undefined);
          },
        },
        xAxis: this.horizontal ? (gapsShown ? [valueAxis, GAP_AXIS] : valueAxis) : categoryAxis,
        yAxis: this.horizontal ? categoryAxis : gapsShown ? [valueAxis, GAP_AXIS] : valueAxis,
        series,
      },
      { notMerge: true }
    );
  }

  /** The category under the pointer changed (from outside the zone): told, in the zone, where a page listens (the Fuel Reports strip). */
  private setHovered(index: number | null): void {
    if (index !== this.hovered) {
      this.hovered = index;
      if (this.categoryHover.observed) {
        this.zone.run(() => this.categoryHover.emit(index));
      }
    }
  }
}
