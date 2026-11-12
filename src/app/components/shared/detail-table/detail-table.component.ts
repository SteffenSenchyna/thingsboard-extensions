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
import { DataTableCellDirective, DataTableColumn, DataTableComponent } from "../data-table/data-table.component";
import { SearchBoxComponent } from "../search-box/search-box.component";
import { TableCountComponent } from "../table-count/table-count.component";

/** Marks a {@link DetailTableComponent.groupKey} group's row. */
const GROUP_ROW = "\u0000groupRow";

/**
 * A list in a detail panel's tab — what an entity holds or reaches (a
 * plant's users, groups and devices, an access group's members, a role's
 * groups and users): a search box, then the shared table as a compact list,
 * as the gateway's Logs and the alarm list — no column headings, a row an
 * entry: its name ({@link strongKey}) bold over a muted line of its other
 * columns' values ("Viewer | …", those it has), its count column
 * (`countKey`, a `tb-table-count`) at the row's end. 20 rows a page, view
 * only, in the order given; `clickable` rows open what they are
 * ({@link rowClick}). The search — over {@link searchKeys}, else the
 * columns — empties when {@link resetKey} changes (another entity).
 *
 * Grouped ({@link groupKey}: an application's sites by market, a site's
 * devices by profile, an item's groups and users by role), the rows sharing
 * a value fold into a row of their own — the shared table's similarity
 * grouping: named by the value, its count "(n)" after it, folded to start;
 * its + / −, or a click on it, opens or folds it (never a {@link rowClick}).
 * A row under it leaves that value off its meta line (the group's row says
 * it); a value only one row has leaves the row standing alone, as it was,
 * and rows all sharing one value stay one list (a default group's members,
 * all of its role).
 *
 * A panel is narrow: what a row says goes in its entry, never in columns
 * side by side.
 *
 * ```html
 * <tb-detail-table [columns]="columns" [rows]="rows" [searchKeys]="['name', 'email']" emptyText="No members" emptyIcon="person"
 *                  [clickable]="true" [resetKey]="group" (rowClick)="open($event)"></tb-detail-table>
 * ```
 */
@Component({
  selector: "tb-detail-table",
  templateUrl: "./detail-table.component.html",
  styleUrls: ["./detail-table.component.scss"],
  standalone: true,
  imports: [CommonModule, DataTableComponent, DataTableCellDirective, SearchBoxComponent, TableCountComponent],
})
export class DetailTableComponent implements OnChanges {
  @HostBinding("attr.title") readonly hostTitle: string | null = null;
  /** What a row says: its name's column ({@link strongKey}), its count's ({@link countKey}) and — the rest — its meta line's parts, in order. */
  @Input() columns: DataTableColumn[] = [];
  /** Its rows — each with an `id`. */
  @Input() rows: Record<string, any>[] = [];
  /** What the search looks in (none: the columns'). */
  @Input() searchKeys: string[] = [];
  @Input() loading = false;
  @Input() loadingText = "Loading…";
  /** No rows at all (a search matching none: "No matches"). */
  @Input() emptyText = "None";
  @Input() emptyIcon = "";
  /** The column shown bold (the row's name). */
  @Input() strongKey = "name";
  /** A count column ("members"): its key, what it counts (plural) and its icon. */
  @Input() countKey = "";
  @Input() countLabel = "";
  @Input() countIcon = "person";
  /** Rows open what they are (a click). */
  @Input() clickable = false;
  /** Rows sharing this property's value (two or more) fold into a row named by it — the rows in the order given, the group where its first row is. */
  @Input() groupKey: string | null = null;
  /** Another entity: the search empties. */
  @Input() resetKey: unknown = null;
  @Output() rowClick = new EventEmitter<Record<string, any>>();

  terms: string[] = [];
  text = "";
  search: string[] = [];
  /** The table's one column: the entry. */
  readonly entryColumns: DataTableColumn[] = [{ key: "entry", header: "" }];
  /** The meta line's columns: all but the name's and the count's. */
  metaColumns: DataTableColumn[] = [];
  /** What the search looks in: {@link searchKeys}, else every column. */
  entrySearchKeys: string[] = [];
  /** {@link groupKey} while the rows split by it — every row sharing one value: one list, nothing to fold. */
  splitKey: string | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["columns"] || changes["strongKey"] || changes["countKey"] || changes["searchKeys"]) {
      this.metaColumns = this.columns.filter((c) => c.key !== this.strongKey && c.key !== this.countKey);
      this.entrySearchKeys = this.searchKeys.length ? this.searchKeys : this.columns.map((c) => c.key);
    }
    if (changes["rows"] || changes["groupKey"]) {
      const key = this.groupKey;
      const first = key && this.rows.length ? (this.rows[0][key] ?? "") : null;
      this.splitKey = key && this.rows.some((r) => (r[key] ?? "") !== first) ? key : null;
    }
    if (changes["resetKey"] && !changes["resetKey"].firstChange) {
      this.terms = [];
      this.text = "";
      this.search = [];
    }
  }

  /**
   * The row has something to say in this column: an empty part, one repeating the name (a user named by their email) and — the row under its
   * group's row — the value that row says, leave the meta line.
   */
  hasValue(row: Record<string, any>, col: DataTableColumn, grouped = false): boolean {
    const value = row[col.key];
    return value !== null && value !== undefined && value !== "" && value !== row[this.strongKey] && !(grouped && col.key === this.splitKey);
  }

  /** {@link groupKey}: a group's row — named by the value it groups by, nothing more (the table puts its count after the name). */
  readonly groupRowOf = (_rows: Record<string, any>[], value: string): Record<string, any> => ({ [this.strongKey]: value, [GROUP_ROW]: true });

  /** A group's row (not one of the rows given). */
  isGroupRow(row: Record<string, any>): boolean {
    return !!row[GROUP_ROW];
  }
}
