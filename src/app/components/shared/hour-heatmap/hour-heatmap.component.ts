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


import { ChangeDetectionStrategy, Component, HostBinding, Input, OnChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { TipDirective } from "../tip/tip.directive";
import { fmtNumber } from "../value-utils";

/** A cell of {@link HourHeatmapComponent}: its shade (0 none … 4) and its bubble. */
interface HeatCell {
  level: number;
  tip: string;
}

/** A row of {@link HourHeatmapComponent}: its name and its cells. */
interface HeatRow {
  label: string;
  cells: HeatCell[];
}

/**
 * When in the week: a grid of the days of the week (rows) by the hours of the day (columns), each cell shaded by its count in the
 * heat maps' ramp (`styles/_heat.scss`, the calendar's — a step per quarter of the cells with any count), its figure in the
 * dashboards' bubble ("Mon 2 PM · 12 dispenses"). The hours' labels every few columns; `wireframe`: the cells as placeholders.
 *
 * ```html
 * <tb-hour-heatmap [rows]="['Mon', …]" [columns]="['12 AM', …]" [values]="counts" unit="dispenses"></tb-hour-heatmap>
 * ```
 */
@Component({
  selector: "tb-hour-heatmap",
  templateUrl: "./hour-heatmap.component.html",
  styleUrls: ["./hour-heatmap.component.scss"],
  standalone: true,
  imports: [CommonModule, TipDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HourHeatmapComponent implements OnChanges {
  /** The rows' names (the days of the week). */
  @Input() rows: string[] = [];
  /** The columns' names (the hours), one a column — every few shown under the grid. */
  @Input() columns: string[] = [];
  /** The counts, a row of columns each. */
  @Input() values: number[][] = [];
  /** What's counted, after a cell's figure ("dispenses"). */
  @Input() unit = "";
  /** The counts aren't in: the cells as placeholders. */
  @Input() wireframe = false;
  /** Show a column's label every this many columns. */
  @Input() labelEvery = 3;

  @HostBinding("attr.title") readonly hostTitle: string | null = null;

  grid: HeatRow[] = [];
  axis: { label: string; span: number }[] = [];
  readonly levels = [0, 1, 2, 3, 4];

  ngOnChanges(): void {
    const counted = this.values
      .flat()
      .filter((n) => n > 0)
      .sort((a, b) => a - b);
    const percentile = (f: number) => counted[Math.min(counted.length - 1, Math.floor(f * counted.length))];
    const bounds = counted.length ? [percentile(0.25), percentile(0.5), percentile(0.75)] : [];
    this.grid = this.rows.map((label, r) => ({
      label,
      cells: this.columns.map((column, c) => {
        const v = this.values[r]?.[c] ?? 0;
        return {
          level: v > 0 ? 1 + bounds.filter((b) => v > b).length : 0,
          tip: `${label} ${column} · ${fmtNumber(v)}${this.unit ? ` ${this.unit}` : ""}`,
        };
      }),
    }));
    // The hours' labels: one every few columns, each over its span.
    const every = Math.max(1, this.labelEvery);
    this.axis = [];
    for (let c = 0; c < this.columns.length; c += every) {
      this.axis.push({ label: this.columns[c], span: Math.min(every, this.columns.length - c) });
    }
  }

  trackByIndex(i: number): number {
    return i;
  }
}
