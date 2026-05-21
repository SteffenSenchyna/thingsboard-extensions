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
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";
import { WidgetHeaderComponent } from "../widget-header/widget-header.component";
import { injectScript } from "../cdn-loader";

/** A single time-series point. */
export interface TrendPoint {
  ts: number;
  value: number;
}

/**
 * Reusable "trend" card: a {@link WidgetHeaderComponent} (icon + title + the
 * current value as a sub-label) over a full-bleed smooth area chart rendered
 * with Apache ECharts (loaded lazily from a CDN). Colours come from the
 * dashboard's `--c-*` theme tokens, so it adapts to light/dark.
 */
@Component({
  selector: "tb-trend-chart",
  templateUrl: "./trend-chart.component.html",
  styleUrls: ["./trend-chart.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, WidgetHeaderComponent],
})
export class TrendChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() icon = "show_chart";
  @Input() title = "";
  @Input() unit = "";
  @Input() data: TrendPoint[] = [];
  @Input() loading = false;
  /** Active theme — drives the canvas colours (re-renders when toggled). */
  @Input() dark = false;

  @ViewChild("chart") chartEl?: ElementRef<HTMLElement>;

  private echarts: any;
  private chart: any;
  private viewReady = false;

  /** Header sub-label: the latest value (rounded) with unit, or an em dash. */
  get valueLabel(): string {
    if (this.loading || !this.data?.length) {
      return "—";
    }
    const last = Number(this.data[this.data.length - 1]?.value);
    if (!isFinite(last)) {
      return "—";
    }
    const v = Math.round(last);
    return this.unit ? `${v} ${this.unit}` : `${v}`;
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.render();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.viewReady && (changes["data"] || changes["dark"] || changes["unit"])) {
      this.render();
    }
  }

  ngOnDestroy(): void {
    this.chart?.dispose();
  }

  /** Re-measure the canvas (call after the card is shown/resized). */
  resize(): void {
    this.chart?.resize();
  }

  private async render(): Promise<void> {
    const el = this.chartEl?.nativeElement;
    if (!el) {
      return;
    }
    const pts = (this.data ?? [])
      .map((p) => ({ ts: p.ts, v: Number(p.value) }))
      .filter((p) => isFinite(p.v))
      .sort((a, b) => a.ts - b.ts);

    if (pts.length < 2) {
      this.chart?.clear();
      return;
    }
    if (!this.echarts) {
      this.echarts = await this.loadECharts();
    }
    if (!this.echarts) {
      return;
    }
    if (!this.chart) {
      this.chart = this.echarts.init(el);
    }

    // Resolve the active theme colours so the canvas matches the CSS tokens.
    const styles = getComputedStyle(el);
    const cssVar = (name: string) => styles.getPropertyValue(name).trim();
    const lineColor = this.dark ? cssVar("--c-icon-brand-light") : cssVar("--c-bg-brand-normal");
    const tooltipBg = this.dark ? cssVar("--c-bg-neutral-light") : cssVar("--c-bg-neutral-min");
    const tooltipBorder = this.dark ? cssVar("--c-border-neutral-normal") : cssVar("--c-border-neutral-light");
    const tooltipText = cssVar("--c-text-neutral-heavy");

    this.chart.setOption({
      animation: true,
      animationDuration: 600,
      animationDurationUpdate: 600,
      animationEasingUpdate: "cubicOut",
      grid: { left: 0, right: 0, top: "52%", bottom: 0 },
      tooltip: {
        trigger: "axis",
        backgroundColor: this.hexToRgba(tooltipBg, 0.72),
        borderColor: this.hexToRgba(tooltipBorder, 0.6),
        borderWidth: 1,
        padding: [6, 10],
        textStyle: { color: tooltipText, fontSize: 12 },
        extraCssText:
          "backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); border-radius: 8px; box-shadow: 0 3px 16px rgba(0, 0, 0, 0.12);",
        axisPointer: { type: "line", lineStyle: { color: lineColor, width: 1, opacity: 0.5 } },
        formatter: (params: any) => {
          const p = Array.isArray(params) ? params[0] : params;
          return `${this.formatTs(p.value[0])}<br/><b>${Math.round(Number(p.value[1]))}${
            this.unit ? " " + this.unit : ""
          }</b>`;
        },
      },
      xAxis: { type: "time", show: false, boundaryGap: false },
      yAxis: { type: "value", show: false, scale: true },
      series: [
        {
          type: "line",
          showSymbol: false,
          smooth: true,
          lineStyle: { color: lineColor, width: 2 },
          itemStyle: { color: lineColor },
          areaStyle: {
            color: new this.echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: this.hexToRgba(lineColor, 0.7) },
              { offset: 1, color: this.hexToRgba(lineColor, 0.1) },
            ]),
          },
          data: pts.map((p) => [p.ts, p.v]),
        },
      ],
    });
    this.chart.resize();
  }

  private async loadECharts(): Promise<any> {
    const w = window as any;
    if (!w.echarts) {
      await injectScript("tb-ext-echarts-js", "https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js");
    }
    return w.echarts;
  }

  private formatTs(ts: number): string {
    const d = new Date(ts);
    return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }

  /** Convert a #rgb/#rrggbb colour to rgba() with the given alpha (passthrough otherwise). */
  private hexToRgba(color: string, alpha: number): string {
    const hex = (color || "").trim().replace("#", "");
    let r: number;
    let g: number;
    let b: number;
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length === 6) {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    } else {
      return color;
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
}
