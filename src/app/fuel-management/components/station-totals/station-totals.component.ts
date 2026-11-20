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

import { Component, EventEmitter, HostBinding, Input, OnChanges, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { BarChartComponent, BarChartSeries } from "../../../components/shared/bar-chart/bar-chart.component";
import { CollapsibleCardComponent } from "../../../components/shared/collapsible-card/collapsible-card.component";
import { CHART_PALETTE } from "../../../components/shared/metric-chart-card/metric-chart-card.component";
import { StatGridComponent, StatItem } from "../../../components/shared/stat-grid/stat-grid.component";
import { TimeframePickerComponent } from "../../../components/shared/timeframe-picker/timeframe-picker.component";
import { fmtNumber } from "../../../components/shared/value-utils";
import { ChartWindow, PumpRow } from "../../models/fuel-management.models";
import { ReportBucket } from "../fuel-reports/fuel-reports.models";

const litresText = (l: number) => fmtNumber(l, l > 0 && l < 100 && !Number.isInteger(l) ? 1 : 0);
const tenth = (v: number) => Math.round(v * 10) / 10;

/**
 * A station panel's "Fuel dispensed" card of its pumps' stored totals ("Fuel
 * Daily Totals": their quarter-hours, summed by the hour) over its window, a
 * folding card: its own 1D | 1W | 1M picker (two-way bindable — the
 * station's window), the window's figures (the shared stat grid: the fuel
 * dispensed and the average dispense), then two bar charts by the hour or
 * the day (the shared bar chart), a divider between them, as a metric chart
 * card's charts:
 * - the litres, a pump a stacked segment (the palette in the pumps' order);
 * - the dispenses, the denials (timeouts too) stacked on them — no figures,
 *   its legend naming them.
 */
@Component({
  selector: "tb-fuel-station-totals",
  templateUrl: "./station-totals.component.html",
  styleUrls: ["./station-totals.component.scss"],
  standalone: true,
  imports: [CommonModule, BarChartComponent, CollapsibleCardComponent, StatGridComponent, TimeframePickerComponent],
})
export class StationTotalsComponent implements OnChanges {
  /** No native tooltip (a `title` attribute set on it by mistake). */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;
  /** The station's pumps, in its order (a pump's segment named by its short name). */
  @Input() pumps: Pick<PumpRow, "pumpId" | "name" | "shortName">[] = [];
  /**
   * Its pumps' totals over {@link window}, by pump id (a bucket an hour); null while first read (the panel's wireframes). Another
   * window's read keeps these, and the window they're over, until it's in — the figures and bars change at once.
   */
  @Input() buckets: Map<string, ReportBucket[]> | null = null;
  @Input() window: ChartWindow | null = null;
  /** The window picked ("1D" | "1W" | "1M"), two-way bindable as `[(timeframe)]`. */
  @Input() timeframe = "1D";
  @Output() timeframeChange = new EventEmitter<string>();
  @Input() dark = false;
  /** Another window was picked: its sums are being worked out again — their figures wireframed until they're in (the bars kept). */
  @Input() figuresLoading = false;

  stats: StatItem[] = [];
  categories: string[] = [];
  /** The litres chart's series: a pump each. */
  litresSeries: BarChartSeries[] = [];
  /** The dispenses chart's series: the dispenses, then the denials. */
  dispenseSeries: BarChartSeries[] = [];

  ngOnChanges(): void {
    const w = this.window;
    const slots = w?.labels.length ?? 0;
    const zero = () => Array.from({ length: slots }, () => 0);
    const litres = this.pumps.map(() => zero());
    const dispenses = zero();
    const denied = zero();
    this.pumps.forEach((p, i) => {
      for (const b of this.buckets?.get(p.pumpId) ?? []) {
        const slot = w ? w.slotOf(b.ts) : -1;
        if (slot >= 0 && slot < slots) {
          litres[i][slot] += b.litres;
          dispenses[slot] += b.dispenses;
          denied[slot] += b.denied;
        }
      }
    });
    const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
    const totalLitres = sum(litres.map(sum));
    const totalDispenses = sum(dispenses);
    const totalDenied = sum(denied);
    const shown = (text: string) => (this.buckets ? text : "…");
    this.categories = w?.labels ?? [];
    this.stats = [
      { label: "Fuel dispensed", value: shown(litresText(totalLitres)), unit: "L" },
      { label: "Avg per dispense", value: shown(totalDispenses ? fmtNumber(totalLitres / totalDispenses, 1) : "—"), unit: totalDispenses ? "L" : "" },
    ];
    // Nothing in the window: no bars, the chart's empty line.
    this.litresSeries = totalLitres
      ? this.pumps.map((p, i) => ({ name: p.shortName || p.name, color: CHART_PALETTE[i % CHART_PALETTE.length], data: litres[i].map(tenth) }))
      : [];
    this.dispenseSeries =
      totalDispenses + totalDenied
        ? [
            { name: "Dispenses", color: CHART_PALETTE[0], data: dispenses },
            // A status, not a series of the palette: the status scale's red (the denial pills' colour).
            { name: "Denied", color: "var(--c-bg-error-normal)", data: denied },
          ]
        : [];
  }

  /** The card's own picker: the window shown here, and the host told. */
  pick(timeframe: string): void {
    if (timeframe !== this.timeframe) {
      this.timeframe = timeframe;
      this.timeframeChange.emit(timeframe);
    }
  }
}
