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

import { AfterViewInit, Component, ElementRef, HostBinding, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild } from "@angular/core";
import { CommonModule } from "@angular/common";
import * as echarts from "echarts/core";
import { PieChart } from "echarts/charts";
import { TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import { chartTooltipStyle } from "../chart-tooltip";

echarts.use([PieChart, TooltipComponent, SVGRenderer]);

/** The parts' corner radius, in px (the bar charts' rounded data end). */
const CORNER_RADIUS = 4;

/** One part of a {@link DonutChartComponent}'s whole. */
export interface DonutSlice {
  name: string;
  value: number;
  /** A colour or a theme token, e.g. `var(--c-chart-1)` (re-resolved on every render, so it follows light / dark). */
  color: string;
}

/**
 * Themed doughnut (ECharts): one whole split into a few parts — a thin ring,
 * drawn clockwise from the top in the order given, each part's corners
 * rounded (4px) and a 2px surface gap between the parts, the whole's figure
 * in its centre, and a hover tooltip per part
 * (its name, value and share) in the other charts' style (chart-tooltip.ts).
 * It draws no legend: put one beside it that names each part with its figure
 * (a `tb-summary-cards` card does, from its rows), so a part is never told by
 * its colour alone. The legend drives it as the line charts' legend does its
 * series: {@link highlightedPart} lifts a part (its row hovered), the others
 * fading; {@link hiddenParts} switches parts off (their rows clicked) — the
 * ring spans the rest and its centre shows their total. Colours should come from the chart palette
 * (`var(--c-chart-1)` …, in order), with a neutral one for an "Other" part;
 * keep it to six parts at most. Nothing to show draws an empty ring.
 *
 * ```html
 * <tb-donut-chart [slices]="byVersion" centerValue="66" centerLabel="gateways" [dark]="dark"></tb-donut-chart>
 * ```
 */
@Component({
  selector: "tb-donut-chart",
  templateUrl: "./donut-chart.component.html",
  styleUrls: ["./donut-chart.component.scss"],
  standalone: true,
  imports: [CommonModule],
})
export class DonutChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  /** Never let the browser's native tooltip show on the host. */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;
  @HostBinding("attr.role") readonly role = "img";

  /** The parts, in the order they're drawn (clockwise from the top); a part of 0 is left out. */
  @Input() slices: DonutSlice[] = [];
  /** The ring's diameter, in px. */
  @Input() @HostBinding("style.width.px") @HostBinding("style.height.px") size = 112;
  /** The figure in the ring's centre — the whole ("66"). */
  @Input() centerValue = "";
  /** The word under that figure ("gateways"). */
  @Input() centerLabel = "";
  /** Unit after a part's value in the tooltip. */
  @Input() unit = "";
  /** Decimal places for the tooltip's values. */
  @Input() decimals = 0;
  /** Active theme — drives the tooltip and the colours (re-renders when toggled). */
  @Input() dark = false;
  /** Parts switched off (by name; the legend's rows clicked): the ring spans the rest. Pass a new array when it changes. */
  @Input() hiddenParts: string[] = [];
  /** A part lifted (by name; its legend row hovered or focused), the others fading; null: none. */
  @Input() highlightedPart: string | null = null;

  @ViewChild("chart") private chartEl?: ElementRef<HTMLElement>;

  private chart: any;
  private viewReady = false;
  /** What was last drawn: the same parts again (a list rebuilt on every refresh) aren't redrawn. */
  private drawn = "";

  /** The parts the ring shows: those with a value, not switched off. */
  private get parts(): DonutSlice[] {
    return this.slices.filter((s) => Number(s.value) > 0 && !this.hiddenParts.includes(s.name));
  }

  /** The centre's figure: the whole — or, with parts switched off, the total of those the ring still shows. */
  get shownCenterValue(): string {
    const off = this.slices.some((s) => Number(s.value) > 0 && this.hiddenParts.includes(s.name));
    if (!off) {
      return this.centerValue;
    }
    const shown = this.parts.reduce((sum, s) => sum + Number(s.value), 0);
    return shown.toLocaleString("en-US", { maximumFractionDigits: this.decimals });
  }

  /** What the ring shows, for a screen reader: the whole, then each part with its value. */
  @HostBinding("attr.aria-label") get ariaLabel(): string {
    const whole = [this.shownCenterValue, this.centerLabel].filter(Boolean).join(" ");
    const parts = this.parts.map((s) => `${s.name} ${s.value}`).join(", ");
    return [whole, parts].filter(Boolean).join(": ");
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.render();
    this.applyHighlight();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.viewReady) {
      return;
    }
    // A legend row hovered: only the highlight moves; anything else may change what's drawn.
    if (Object.keys(changes).some((k) => k !== "highlightedPart")) {
      this.render();
    }
    this.applyHighlight();
  }

  ngOnDestroy(): void {
    this.chart?.dispose();
    this.chart = undefined;
  }

  private render(): void {
    const el = this.chartEl?.nativeElement;
    if (!el) {
      return;
    }
    const parts = this.parts;
    const signature = JSON.stringify([parts, this.size, this.unit, this.decimals, this.dark]);
    if (this.chart && signature === this.drawn) {
      return;
    }
    this.drawn = signature;
    if (!this.chart) {
      this.chart = echarts.init(el, null, { renderer: "svg", width: this.size, height: this.size });
    } else {
      this.chart.resize({ width: this.size, height: this.size });
    }
    const styles = getComputedStyle(el);
    const cssVar = (name: string) => styles.getPropertyValue(name).trim();
    const resolve = (color: string) => {
      const name = color.match(/^var\(\s*(--[^),\s]+)/)?.[1];
      return (name ? cssVar(name) : color) || color;
    };
    const surface = cssVar("--c-bg-neutral-extralight");
    const track = cssVar("--c-border-neutral-light");
    const value = (v: number) => Number(v).toLocaleString("en-US", { maximumFractionDigits: this.decimals });
    const withUnit = (v: number) => `${value(v)}${this.unit ? " " + this.unit : ""}`;

    this.chart.setOption({
      animation: true,
      animationDuration: 500,
      animationEasing: "cubicOut",
      animationDurationUpdate: 300,
      animationEasingUpdate: "cubicOut",
      tooltip: {
        show: parts.length > 0,
        trigger: "item",
        // A small ring: its tooltip opens beside the pointer, past the ring's own box, rather than squeezed inside it.
        confine: false,
        // The other charts' frosted-glass tooltip.
        ...chartTooltipStyle(styles),
        // A coloured marker, the part's name, its value and its share of the whole.
        formatter: (p: any) => `${p.marker}${p.name} <b>${withUnit(p.value)}</b> (${Math.round(p.percent)}%)`,
      },
      series: [
        {
          type: "pie",
          // A thin ring; the outer edge leaves room for the hovered part to grow a little.
          radius: ["70%", "96%"],
          center: ["50%", "50%"],
          startAngle: 90,
          clockwise: true,
          avoidLabelOverlap: false,
          silent: !parts.length,
          label: { show: false },
          labelLine: { show: false },
          // Each part's corners rounded (ECharts' rounded doughnut, at the bars' 4px data ends), and the 2px surface gap between
          // the parts: a border in the card's fill, 1px of it inside each part's edge.
          itemStyle: { borderRadius: CORNER_RADIUS, borderColor: surface, borderWidth: parts.length > 1 ? 2 : 0 },
          // A part hovered — or lifted from its legend row — grows a little and the others fade.
          emphasis: { scale: parts.length > 0, scaleSize: 2, focus: "self" },
          blur: { itemStyle: { opacity: 0.35 } },
          data: parts.length
            ? parts.map((s) => ({ name: s.name, value: Number(s.value), itemStyle: { color: resolve(s.color) } }))
            : // Nothing to show: the ring's empty track.
              [{ name: "", value: 1, itemStyle: { color: track } }],
        },
      ],
    });
  }

  /** The legend's hovered part lifted, the others faded — or every part as it is (none hovered, or it's switched off). */
  private applyHighlight(): void {
    if (!this.chart) {
      return;
    }
    this.chart.dispatchAction({ type: "downplay", seriesIndex: 0 });
    const name = this.highlightedPart;
    if (name && this.parts.some((s) => s.name === name)) {
      this.chart.dispatchAction({ type: "highlight", seriesIndex: 0, name });
    }
  }
}
