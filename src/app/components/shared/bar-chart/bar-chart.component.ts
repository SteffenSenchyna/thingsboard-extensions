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

import { AfterViewInit, Component, ElementRef, HostBinding, Input, OnChanges, OnDestroy, ViewChild } from "@angular/core";
import { CommonModule } from "@angular/common";
import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import { chartTooltipStyle } from "../chart-tooltip";

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
 * (`var(--c-chart-1)` …, in order).
 *
 * ```html
 * <tb-bar-chart [categories]="days" [series]="byFuel" [stacked]="true" unit="L" [dark]="dark"></tb-bar-chart>
 * ```
 */
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
  @Input() loading = false;
  @Input() emptyText = "No data";

  @ViewChild("chart") private chartEl?: ElementRef<HTMLElement>;

  private chart: any;
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
      this.chart = echarts.init(el, null, { renderer: "svg" });
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

    const n = this.series.length;
    const legend = this.showLegend ?? n >= 2;
    const value = (v: number) => Number(v).toLocaleString("en-US", { maximumFractionDigits: this.decimals });
    const withUnit = (v: number) => `${value(v)}${this.unit ? " " + this.unit : ""}`;
    const totals = this.categories.map((_, i) => this.series.reduce((sum, s) => sum + (Number(s.data[i]) || 0), 0));
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
        data: s.data.map((v, j) => ({ value: v, itemStyle: { borderRadius: !this.stacked || outermost[j] === i ? radius : 0 } })),
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

    // Axis ticks: in full under 10,000, compact past it (10K) — one style per axis.
    const axisMax = Math.max(...(this.stacked ? totals : this.series.flatMap((s) => s.data.map(Number))));
    const tick = (v: number) => (axisMax >= 10000 ? `${Math.round(v / 100) / 10}K` : v.toLocaleString("en-US"));
    const categoryAxis = {
      type: "category",
      data: this.categories,
      inverse: this.horizontal, // ranked lists read top-down
      axisLabel: this.horizontal ? { color: nameText, fontSize: 12, margin: 12, hideOverlap: true } : { color: axisText, fontSize: 11, hideOverlap: true },
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
          right: this.horizontal && this.valueLabels ? 44 : 12,
          top: this.valueLabels && !this.horizontal ? 20 : 12,
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
          // Kept inside the plot (its container clips overflow).
          confine: true,
          axisPointer: { type: "shadow", shadowStyle: { color: this.dark ? "rgba(255, 255, 255, 0.05)" : "rgba(10, 30, 60, 0.05)" } },
          // The shared chart tooltip (the dashboards' tooltip bubble — chart-tooltip.ts).
          ...chartTooltipStyle(styles),
          // The category, a coloured marker + value per series, and the total when stacked.
          formatter: (params: any) => {
            const arr = Array.isArray(params) ? params : [params];
            if (!arr.length) {
              return "";
            }
            const rows = arr.map((p: any) => `${p.marker}${p.seriesName} <b>${withUnit(p.value)}</b>`);
            if (this.stacked && n > 1) {
              rows.push(`Total <b>${withUnit(totals[arr[0].dataIndex])}</b>`);
            }
            return `${arr[0].axisValueLabel}<br/>${rows.join("<br/>")}`;
          },
        },
        xAxis: this.horizontal ? valueAxis : categoryAxis,
        yAxis: this.horizontal ? categoryAxis : valueAxis,
        series,
      },
      { notMerge: true }
    );
  }
}
