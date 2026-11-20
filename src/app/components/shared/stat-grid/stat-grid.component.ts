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

import { Component, EventEmitter, HostBinding, Input, OnChanges, Output, SimpleChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";
import { InfoIconComponent } from "../info-icon/info-icon.component";
import { StatusPillComponent, StatusPillTone } from "../status-pill/status-pill.component";

/** One figure of a {@link StatGridComponent}: a label over a value (with its unit), or over a status pill. */
export interface StatItem {
  label: string;
  /** Info-icon tooltip after the label. */
  info?: string;
  /** Preformatted value ("12.4", "4m ago", "3"). */
  value?: string;
  /** Unit after the value, in the muted small type ("kn", "/ 200"). */
  unit?: string;
  /** What else it says, muted after the value and its unit ("Thu, Nov 5", "6 active days"). */
  note?: string;
  /** A muted line under the value — what it's compared with ("Yesterday to 2:15 PM: 1,234 L"). */
  caption?: string;
  /** A status pill in place of the value. */
  pill?: { label: string; icon?: string; tone: StatusPillTone };
  /** A small brand-blue icon button after the value (its label in the tooltip); clicking emits {@link StatGridComponent.actionClick}. */
  action?: StatAction;
}

/**
 * A strip's headline figure ({@link StatGridComponent.headline}): its label over a large value (with its unit), its change against
 * a previous period as a chip under it, and its trend over the window as a line along its foot.
 */
export interface StatHeadline {
  label: string;
  /** Preformatted value ("12,480"). */
  value: string;
  unit?: string;
  /**
   * Its change against a previous period: the chip's words ("+12.4% vs previous period"), its arrow and its tone — the status
   * scale's when the page says which way is good (Fuel Reports: fuel down green, up red); none, neutral.
   */
  change?: { text: string; direction: "up" | "down" | "flat"; tone?: StatusPillTone };
  /** Its values over the window, oldest first: the trend line (none, or fewer than two: no line). */
  trend?: number[];
  /** A muted line under its chip: how fresh it is ("As of 10:32 PM · updates every 2 min"). */
  note?: string;
}

export interface StatAction {
  /** What {@link StatGridComponent.actionClick} reports. */
  id: string;
  /** Material Symbols icon name. */
  icon: string;
  /** The tooltip / accessible label ("Repush"). */
  label: string;
  disabled?: boolean;
}

/**
 * Key figures in a grid (two columns by default) — a detail panel's position,
 * totals, a station's counts: each a muted label (optional info icon) over a
 * bold value with its unit and a muted note (and an optional small action
 * button), or over a status pill. One look for every dashboard's figures.
 *
 * With a {@link headline} it's a report page's figures strip — a card of its
 * own: the headline figure at its left (large, its change's chip, its trend
 * line along its foot), the other figures in {@link columns} beside it, every
 * cell divided by a hairline; narrow, the headline over the figures, two to a
 * row.
 *
 * ```html
 * <tb-stat-grid [items]="[{ label: 'Speed over ground', value: '8.4', unit: 'kn', info: '…' }]"></tb-stat-grid>
 * <tb-stat-grid [headline]="figures.headline" [items]="figures.items" [columns]="3" [wireframe]="loading"></tb-stat-grid>
 * ```
 */
@Component({
  selector: "tb-stat-grid",
  templateUrl: "./stat-grid.component.html",
  styleUrls: ["./stat-grid.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, InfoIconComponent, StatusPillComponent],
})
export class StatGridComponent implements OnChanges {
  @Input() items: StatItem[] = [];
  @Input() columns = 2;
  /** The strip's headline figure (none: a plain grid of figures). */
  @Input() headline: StatHeadline | null = null;

  /** A strip (a headline given): the card of its own. */
  @HostBinding("class.sg-strip") get strip(): boolean {
    return !!this.headline;
  }

  /** The headline's trend line and the area under it, in a 100 × 32 box (none: no line) — worked out as the headline changes. */
  trendLine = "";
  trendArea = "";
  /**
   * The values' wireframe — they're being worked out again (another window's sums): a placeholder in each value's place under its
   * label, never a stale value or "…".
   */
  @Input() wireframe = false;
  /** A figure's action button was clicked: its {@link StatAction.id} and the figure. */
  @Output() actionClick = new EventEmitter<{ id: string; item: StatItem }>();

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["headline"]) {
      const points = sparkPoints(this.headline?.trend ?? []);
      this.trendLine = points.length ? `M${points.join(" L")}` : "";
      this.trendArea = points.length ? `M0,32 L${points.join(" L")} L100,32 Z` : "";
    }
  }

  get changeIcon(): string {
    const d = this.headline?.change?.direction;
    return d === "up" ? "trending_up" : d === "down" ? "trending_down" : "trending_flat";
  }

  trackByLabel(_: number, s: StatItem): string {
    return s.label;
  }
}

/** A trend's values as points of a 100 × 32 box (a little room top and bottom; all equal: a level line) — fewer than two, none. */
function sparkPoints(values: number[]): string[] {
  const v = values.map((x) => (Number.isFinite(x) ? x : 0));
  if (v.length < 2) {
    return [];
  }
  const max = Math.max(...v);
  const min = Math.min(0, ...v);
  const span = max - min || 1;
  return v.map((x, i) => `${((i / (v.length - 1)) * 100).toFixed(2)},${(30 - ((x - min) / span) * 26).toFixed(2)}`);
}
