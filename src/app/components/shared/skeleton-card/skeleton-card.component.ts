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

import { Component, HostBinding, Input, OnChanges } from "@angular/core";
import { CommonModule } from "@angular/common";

/** The card a {@link SkeletonCardComponent} stands in for. */
export type SkeletonCardKind = "figures" | "chart" | "list" | "table" | "filters";

/** A placeholder's width (%) in a row of a table's wireframe: varied, the same each time. */
const CELL_WIDTHS = [62, 44, 78, 36, 54, 70, 40, 58];

/**
 * A card's wireframe while its data loads — within an app, every page's
 * loading state (the logo spinner is only an app's first load): the card's
 * shell with placeholder bars in its shape (`styles/_skeleton.scss`) — a
 * title, then `figures` (a stat grid: a label over a value, two a row),
 * `chart` (its window picker, two figures, the plot), `list` (rows: a line
 * over a muted one) or `table` (its column headings, then its rows; `fill`:
 * the container's height) — or, with no shell, `filters` (a sidebar's
 * filter sections: a heading over its boxes). The page shows them in its
 * cards' places until every read is in, then the cards all at once.
 *
 * ```html
 * <ng-container *ngIf="!loading; else wireframe">…the cards…</ng-container>
 * <ng-template #wireframe>
 *   <tb-skeleton-card kind="figures" [rows]="3"></tb-skeleton-card>
 *   <tb-skeleton-card kind="chart"></tb-skeleton-card>
 *   <tb-skeleton-card kind="list" [rows]="5"></tb-skeleton-card>
 * </ng-template>
 * ```
 */
@Component({
  selector: "tb-skeleton-card",
  templateUrl: "./skeleton-card.component.html",
  styleUrls: ["./skeleton-card.component.scss"],
  standalone: true,
  imports: [CommonModule],
})
export class SkeletonCardComponent implements OnChanges {
  /** Never let the browser's native tooltip show on the host. */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;
  /** Read by assistive tech as loading (nothing else in it is). */
  @HostBinding("attr.aria-busy") readonly busy = "true";
  @Input() kind: SkeletonCardKind = "figures";
  /** A list's or a table's rows, a figures card's rows of two, a filters column's sections. */
  @Input() rows = 3;
  /** A table's columns. */
  @Input() columns = 5;
  /** A table filling its container's height (a page's table; its rows cut off at the bottom). */
  @Input() @HostBinding("class.sk-fill") fill = false;

  @HostBinding("class.sk-flat") get flat(): boolean {
    return this.kind === "filters";
  }

  /** The rows and the columns drawn (stable arrays: rebuilt only when their counts change). */
  rowList: number[] = [0, 1, 2];
  columnList: number[] = [0, 1, 2, 3, 4];

  ngOnChanges(): void {
    const rows = Math.max(1, Math.min(this.rows, 40));
    if (rows !== this.rowList.length) {
      this.rowList = Array.from({ length: rows }, (_, i) => i);
    }
    const columns = Math.max(1, Math.min(this.columns, 8));
    if (columns !== this.columnList.length) {
      this.columnList = Array.from({ length: columns }, (_, i) => i);
    }
  }

  /** A table cell's placeholder width (%): varied by row and column, the same each time. */
  cellWidth(row: number, column: number): number {
    return CELL_WIDTHS[(row * 3 + column * 5) % CELL_WIDTHS.length];
  }
}
