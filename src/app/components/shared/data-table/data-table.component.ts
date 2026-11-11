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
  ContentChildren,
  Directive,
  ElementRef,
  EventEmitter,
  HostBinding,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  QueryList,
  SimpleChanges,
  TemplateRef,
  ViewChild,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatTableDataSource } from "@angular/material/table";
import { MatPaginator } from "@angular/material/paginator";
import { Subscription } from "rxjs";
import { SharedModule } from "@shared/public-api";
import { CopyBoxComponent } from "../copy-box/copy-box.component";
import { WidgetHeaderComponent } from "../widget-header/widget-header.component";
import { StatusPillComponent } from "../status-pill/status-pill.component";

/**
 * Marks an `<ng-template>` as the custom cell renderer for a {@link DataTableComponent}
 * column. The template's implicit context is the row.
 *
 * ```html
 * <tb-data-table [columns]="cols" [rows]="rows">
 *   <ng-template tbDataTableCell="status" let-row>…</ng-template>
 * </tb-data-table>
 * ```
 */
@Directive({ selector: "[tbDataTableCell]", standalone: true })
export class DataTableCellDirective {
  /** Key of the column this template renders. */
  @Input("tbDataTableCell") column = "";

  constructor(public readonly template: TemplateRef<{ $implicit: Record<string, any>; row: Record<string, any> }>) {}
}

/** Column definition for {@link DataTableComponent}. */
export interface DataTableColumn {
  /** Row property rendered in the cell. */
  key: string;
  /** Column header label. */
  header: string;
  /**
   * The cell's text weight: "strong" — the row's name; "muted" — a secondary
   * value (a label, a description). The cells every table shares, with no
   * template of their own.
   */
  emphasis?: "strong" | "muted";
  /** The value stays on one line. */
  nowrap?: boolean;
  /** The value is a list (`string[]`): a pill each, wrapping in the column; none — "—". Give it a {@link sortValue}. */
  pills?: boolean;
  /** Render the value as a status chip instead of plain text. */
  chip?: boolean;
  /** Boolean row property controlling the chip's active/inactive style. */
  chipActiveKey?: string;
  /**
   * Render a two-line "primary" cell: {@link key} as the title and this row
   * property as the muted sub-label beneath it.
   */
  subtitleKey?: string;
  /** Horizontal alignment of the column's header and cells (defaults to left). */
  align?: "left" | "right";
  /** Render the value inside a monospace copy-to-clipboard box. */
  copyable?: boolean;
  /** Fixed width for the copy box (CSS length) so it doesn't resize per value. */
  copyWidth?: string;
  /** Row property to copy to the clipboard (defaults to the displayed value). */
  copyValueKey?: string;
  /** Column width (any CSS length, e.g. "20%"). Honoured exactly with {@link DataTableComponent.fixedLayout}. */
  width?: string;
  /**
   * Long text (a description): the column takes the table's spare width and
   * the value stays on one line, cut with "…", instead of widening the table
   * (a custom cell's content too). The table's other columns then fit their
   * content on one line — none is squeezed into wrapping. Several share the spare width.
   * A cut value shows in full in the dashboards' tooltip bubble on hover.
   */
  truncate?: boolean;
  /**
   * Cap the value at this width (any CSS length), on one line, cut with "…"
   * past it — its full text in the bubble on hover — while the column is sized
   * like any other (unlike {@link truncate}, it takes no spare width). For a
   * name that can run long ("Market · Greater Vancouver Area · Operators").
   */
  maxWidth?: string;
  /**
   * Row property shown in the dashboards' bubble while the cell is hovered
   * (a code's label: "4R20" → "Richmond Lab"); an empty one shows none. It's
   * searched too (as {@link sortKey}).
   */
  tooltipKey?: string;
  /** The bubble's text from the row, for a value the row doesn't hold (over {@link tooltipKey}). */
  tooltipOf?: (row: Record<string, any>) => string;
  /**
   * Row property the column sorts by when the table is {@link DataTableComponent.sortable}
   * (defaults to {@link key}) — e.g. a raw number behind a formatted "21.4 °C".
   */
  sortKey?: string;
  /** The value the column sorts by, derived from the row (a count of an array, a lookup) — over {@link sortKey}. */
  sortValue?: (row: Record<string, any>) => unknown;
  /** Set false to keep this column's header unclickable in a sortable table. */
  sortable?: boolean;
}

/** Direction of a sorted column. */
export type DataTableSortDirection = "asc" | "desc";

/** A table's sort: the column and its direction. */
export interface DataTableSort {
  key: string;
  direction: DataTableSortDirection;
}

/** Header action button for {@link DataTableComponent}. */
export interface DataTableAction {
  /** Identifier emitted via {@link DataTableComponent.actionClick} when clicked. */
  id: string;
  /** Material icon name. */
  icon: string;
  /** Tooltip / accessible label. */
  tooltip?: string;
  /** Render the button in its active (highlighted) state. */
  active?: boolean;
}

/**
 * Reusable, themed data table: card header (icon badge + title), toggleable
 * search, fixed-height scrolling mat-table with text/chip columns, and a
 * paginator. Styling uses the dashboard's `--c-*` theme tokens (inherited from
 * an ancestor), so it adapts to light/dark.
 */
/** Standard body-row height — keep in step with `$row-height` in the SCSS. */
const DT_ROW_HEIGHT_PX = 40;
/** The header badge's icon unless the consumer names one. */
const DT_DEFAULT_ICON = "table_rows";

/** Joins several search terms into the data source's one filter string (each must match). */
const DT_SEARCH_TERM_SEPARATOR = "\u0000";
/** A {@link DataTableComponent.fitPageSize} table's page (every settings table's): this many rows at most — one size for all. */
const DT_FIT_PAGE_ROWS = 20;
/** A tree row's dots: one a level, this far apart — keep in step with `$tree-dot-pitch` in the SCSS. */
const DT_TREE_DOT_PITCH_PX = 10;

/** {@link DataTableComponent.groupKey}: a grouped row's place — its group (the value), its summary row or one of its rows, the group's size. */
interface DtGroupPlace {
  value: string;
  /** The group's summary row (its toggle, its count). */
  lead: boolean;
  /** The last of the group's rows (its tree line ends there). */
  last: boolean;
  size: number;
  collapsed: boolean;
  /** The group's rows (the summary's: every one, shown or folded). */
  rows: Record<string, any>[];
}

/**
 * The table's data source, never rendering every row at once: the paginator
 * sits in the table's own view, so it connects only after the first render
 * (ngAfterViewInit) — until then Material's data source pages nothing, and a
 * paginated table would build a row for each of its rows (a thousand events,
 * each with its pill), only to drop all but a page of them. Until it connects,
 * `firstPage()` rows (a page; null: all — an unpaginated or server-paged table).
 *
 * A grouping table ({@link DataTableComponent.groupKey}) pages by its
 * top-level rows (`tops()`: where each starts in the arranged rows — a summary
 * row or a row standing alone): a page is that many of them, an open group's
 * rows going with its summary (never split across pages); the paginator
 * counts them.
 */
class FirstPageDataSource<T> extends MatTableDataSource<T> {
  // Set after super(): Material's constructor already pages its (empty) data.
  private readonly firstPage?: () => number | null;
  /** The rows the search let through, arranged by the table (its similarity groups) before they're paged. */
  private readonly arrange?: (rows: T[]) => T[];
  /** Where each top-level row starts in the arranged rows (null: every row is one — the table doesn't group). */
  private readonly tops?: () => number[] | null;
  /** Inside {@link _filterData}: Material's own paginator update (the rows before they're arranged) is skipped. */
  private arranging = false;

  constructor(firstPage: () => number | null, arrange?: (rows: T[]) => T[], tops?: () => number[] | null) {
    super([]);
    this.firstPage = firstPage;
    this.arrange = arrange;
    this.tops = tops;
  }

  override _filterData(data: T[]): T[] {
    this.arranging = !!this.arrange;
    const filtered = super._filterData(data);
    this.arranging = false;
    if (!this.arrange) {
      return filtered;
    }
    this.filteredData = this.arrange(filtered);
    if (this.paginator) {
      this._updatePaginator(this.filteredData.length);
    }
    return this.filteredData;
  }

  /** The paginator counts the top-level rows (a grouping table's), else every row. */
  override _updatePaginator(filteredDataLength: number): void {
    if (!this.arranging) {
      super._updatePaginator(this.tops?.()?.length ?? filteredDataLength);
    }
  }

  override _pageData(data: T[]): T[] {
    const paginator = this.paginator;
    if (paginator) {
      return this.page(data, paginator.pageIndex, paginator.pageSize);
    }
    const rows = this.firstPage?.() ?? null;
    return rows === null ? data : this.page(data, 0, rows);
  }

  /** The rows of a page — `size` rows, or (grouping) `size` top-level rows with their open groups' rows. */
  page(data: T[], index: number, size: number): T[] {
    const tops = this.tops?.();
    if (!tops) {
      return data.slice(index * size, (index + 1) * size);
    }
    const from = tops[index * size];
    return from === undefined ? [] : data.slice(from, tops[(index + 1) * size] ?? data.length);
  }

  /** How many rows the paginator pages: the top-level rows (a grouping table's), else every row. */
  get pagedCount(): number {
    return this.tops?.()?.length ?? this.filteredData.length;
  }
}

@Component({
  selector: "tb-data-table",
  templateUrl: "./data-table.component.html",
  styleUrls: ["./data-table.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, CopyBoxComponent, WidgetHeaderComponent, StatusPillComponent],
})
export class DataTableComponent implements OnChanges, AfterViewInit, OnDestroy {
  /**
   * Strip the native `title` attribute off the host. The `title` @Input is set
   * via `title="…"` on the host element, but `title` is also a global HTML
   * attribute, so the browser would otherwise render its own tooltip with that
   * text on top of any matTooltip.
   */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;

  @Input() title = "";
  /** Muted line under the title (compact header only), e.g. the owning customer of the card's device. */
  @Input() subtitle = "";
  /** The header's icon (the widget header's badge; beside a compact title when named — the default shows no icon there). */
  @Input() icon = DT_DEFAULT_ICON;
  @Input() columns: DataTableColumn[] = [];
  @Input() rows: Record<string, any>[] = [];
  @Input() loading = false;
  @Input() emptyText = "No data";
  /** Optional Material icon shown above {@link emptyText} in the empty state. */
  @Input() emptyIcon = "";
  @Input() loadingText = "Loading…";
  @Input() searchEnabled = true;
  /** Render the search button before the action buttons (default: after). */
  @Input() searchFirst = false;
  /** Keep the card the same height whether the search bar is open or closed. */
  @Input() reserveSearchSpace = false;
  @Input() searchPlaceholder = "Search";
  /** Hide the whole card header (title + search + actions row). */
  @Input() showHeader = true;
  /** Render the title as a plain compact row (collapsible-card style: 14px
   *  bold, no icon badge, no actions/search) instead of the widget header. */
  @Input() compactHeader = false;
  /** Row properties included in the search filter (defaults to all column keys). */
  @Input() searchKeys: string[] = [];
  /**
   * Search from outside the table — e.g. a sidebar `tb-search-box`, with the
   * table's own header hidden: a text, or several terms that a row must all
   * match (the box's chips and the text being typed).
   */
  @Input() search: string | string[] | null = null;
  /** Hide the column header row (useful for single rich-cell tables). */
  @Input() showColumnHeaders = true;
  /**
   * Inset the row divider to match the row's 16px side padding (instead of
   * spanning the full width) — one continuous line across all the columns.
   */
  @Input() insetRowDivider = false;
  /** Highlight rows on hover (turn off for tables whose rows aren't clickable,
   *  e.g. alarm lists where only the row's action buttons are interactive). */
  @Input() rowHover = true;
  /** Extra header action buttons, rendered left of the search button. */
  @Input() actions: DataTableAction[] = [];
  /** Rows a page (a {@link treeParentKey} table shows all of them; a {@link fitPageSize} one, the settings tables' {@link DT_FIT_PAGE_ROWS}). */
  @Input() pageSize = 10;
  /**
   * Whether to paginate. When false, no paginator is shown and all rows render;
   * the scroll area grows with the content and the surrounding container scrolls
   * once it runs out of room.
   */
  @Input() paginated = true;
  /**
   * A paginated table sized to its pages (every settings table): the rows area
   * grows with its rows up to one page — {@link DT_FIT_PAGE_ROWS} rows, the
   * same for every settings table — and never scrolls. A
   * table with more than one page holds a full page's height on every page (its
   * last page doesn't shrink the card), while one that fits on a page keeps its
   * own height and shows no page controls. Overrides the default fixed scroll height.
   */
  @Input() fitPageSize = false;
  /**
   * Unpaginated tables: cap the rows area at this many px and scroll it inside
   * the card past that (e.g. a preview list in a side panel), instead of
   * growing with the content. Ignored when {@link paginated} / {@link fitPageSize}.
   */
  @Input() maxBodyHeight: number | null = null;
  /**
   * Server paging (a list too long to hold — the tenant's assets): `rows` is
   * the one page the parent fetched, this the count of all of them. The
   * paginator pages through the total and emits {@link pageChange}; sorting
   * emits {@link sortChange} and searching is the parent's (neither sorts nor
   * filters the page itself). null: the table pages its own rows.
   */
  @Input() serverTotal: number | null = null;
  /** Server paging: the page shown (0-based) — the parent sets it back to 0 when its filters change. */
  @Input() serverPage = 0;
  /** Server paging: the page (or, a {@link fillHeight} table re-fitting, the page size) changed — fetch it. */
  @Output() pageChange = new EventEmitter<{ page: number; pageSize: number }>();
  private pageSub?: Subscription;
  /**
   * Row property used as a stable identity for the mat-table's `trackBy`. Set
   * this for tables fed by a live subscription so rows are reused (not
   * recreated) on each update — otherwise the hovered row's highlight blinks
   * when the data refreshes. Defaults to object-reference identity.
   */
  @Input() trackByKey?: string;
  /** Make rows clickable: shows a pointer, highlights the selected row, and emits {@link rowClick}. */
  @Input() selectable = false;
  /**
   * Controlled selection: when bound, the highlighted row is the one whose
   * {@link trackByKey} value equals this (null/undefined = none), so the
   * consumer's own state — e.g. "the detail panel is open for this row" —
   * decides the highlight, however that state changes. Row clicks still emit
   * {@link rowClick}. Leave unbound for click-managed selection.
   */
  @Input() selectedKey: unknown;
  /**
   * Add a leading checkbox column for bulk selection: a select-all header
   * checkbox (with an indeterminate state) and a per-row checkbox. Selection
   * survives live refreshes when {@link trackByKey} is set, and is reported via
   * {@link selectionChange}. Independent of {@link selectable}.
   */
  @Input() multiSelect = false;
  // (Leaving multi-select clears the checks — see ngOnChanges.)
  /**
   * Controlled multi-select: the checked rows' keys ({@link trackByKey} values).
   * Bound, the checks follow it (a dashboard tagging gateways presets the
   * tagged ones); unbound, the checks are the table's own.
   */
  @Input() checked: unknown[] | null = null;
  /**
   * Stretch the card to fill its container's height: the rows area grows to the
   * remaining space and the paginator sits on the bottom edge. When paginated,
   * the page size follows the space — as many rows as fit without scrolling.
   * The host must be given a height (e.g. a flex child with `min-height: 0`).
   */
  @Input() fillHeight = false;
  /**
   * Lock the column widths (`table-layout: fixed`) to each column's
   * {@link DataTableColumn.width} (the rest share the remaining space equally),
   * so the columns don't shift with the content — e.g. between an empty list
   * and a filled one, or while searching.
   */
  @Input() fixedLayout = false;
  /**
   * Click a column header to sort by it: ascending, then descending, then back
   * to the rows' own order. Numbers sort numerically, text case-insensitively
   * (with natural digit order), and empty values always sink to the bottom.
   * Exclude a column with `sortable: false`; sort by another row property with
   * {@link DataTableColumn.sortKey}.
   */
  @Input() sortable = false;
  /** The sort to show (a dashboard keeping it, e.g. in the user's settings); null = the rows' own order. */
  @Input() sort: DataTableSort | null = null;
  /**
   * Every column the table can be sorted by, shown or not (default: the shown
   * ones). With it, a sort on a column that's then hidden — by a column
   * picker — stays in force (no header shows it; sorting by another column
   * replaces it) instead of being cleared.
   */
  @Input() sortableColumns: DataTableColumn[] | null = null;
  /** A header click changed the sort: the column and direction, or null once cleared (or the sorted column went away). */
  @Output() sortChange = new EventEmitter<DataTableSort | null>();
  /**
   * Group rows under parent rows (one level): the row property holding the
   * {@link trackByKey} value of the row it sits under ("" / unset = a top-level
   * row) — rows nest to any depth. Children are drawn right under their
   * parent, their first cell indented a step a level with a dot before its
   * text; every row clicks as any row. It doesn't page: every row shows, the
   * table as tall as its rows. Sorting keeps every group together (top-level
   * rows sort among themselves, children within their parent), and a search
   * shows every match with the rows above it and under it.
   * Requires {@link trackByKey}.
   */
  @Input() treeParentKey?: string;
  /**
   * Similarity grouping (as UniFi's): rows with the same value of this row
   * property fold into a summary row of their own — {@link groupSummary}'s
   * cells, a toggle (+ / −) before its first cell, the group's count "(4)"
   * after its {@link groupCountColumn} cell — folded to start; opened, its
   * rows follow it, joined to it by tree lines in their first cell, their
   * {@link groupSharedColumns} cells blank (the summary's say it). A summary
   * row's click opens or folds it (never a row click); in Manage its box
   * checks its rows. Summary rows sort among the other rows, a group's rows
   * among themselves. A row with no value, or none like it, stands alone. As
   * a tree table, it doesn't page (a group never splits across pages). Not
   * with {@link treeParentKey}. Requires {@link trackByKey}.
   */
  @Input() groupKey?: string | null;
  /** {@link groupKey}: a group's summary row from its rows (shown under the search): its cells — without it, its {@link groupSharedColumns}' values. */
  @Input() groupSummary?: (rows: Record<string, any>[], value: string) => Record<string, any>;
  /** {@link groupKey}: the column whose cell shows a group's count on its summary row (when it isn't shown: the first column). */
  @Input() groupCountColumn?: string;
  /** {@link groupKey}: the columns a group's rows share — blank on them (their summary's say it). */
  @Input() groupSharedColumns: string[] = [];

  /** Emits the {@link DataTableAction.id} of a clicked header action. */
  @Output() actionClick = new EventEmitter<string>();
  /** Emits the clicked row (only when {@link selectable}). */
  @Output() rowClick = new EventEmitter<Record<string, any>>();
  /** Emits the currently checked rows whenever the multi-select selection changes. */
  @Output() selectionChange = new EventEmitter<Record<string, any>[]>();

  /** Keys ({@link rowKey}) of the rows checked in multi-select mode. */
  private checkedKeys = new Set<unknown>();
  /** {@link treeParentKey}: each row's depth (0: top-level) and the rows that have children (by {@link rowKey}) — worked out from the rows themselves. */
  private treeDepths = new Map<unknown, number>();
  private treeParents = new Set<unknown>();
  /** {@link treeParentKey} search: the rows shown for the last data + filter (rows matching, plus their group). */
  private treeMatch?: { data: Record<string, any>[]; filter: string; keys: Set<unknown> };
  /** {@link groupKey}: each grouped row's place (by {@link rowKey}), as last arranged; a row standing alone has none. */
  private groupPlaces = new Map<unknown, DtGroupPlace>();
  /** {@link groupKey}: the groups opened (their values) — folded to start; kept while the rows refresh. */
  private openGroups = new Set<string>();
  /** {@link groupKey}: where each top-level row (a summary row, a row standing alone) starts in the arranged rows — the pages count them; null while the table doesn't group. */
  private groupTops: number[] | null = null;

  @ViewChild("paginator") paginator!: MatPaginator;
  @ViewChild("searchInput") searchInput?: ElementRef<HTMLInputElement>;
  @ViewChild("scroll") scrollEl?: ElementRef<HTMLElement>;
  @ContentChildren(DataTableCellDirective) cellDefs?: QueryList<DataTableCellDirective>;

  dataSource = new FirstPageDataSource<Record<string, any>>(
    () => (this.paginated && !this.serverMode ? this.pageLength : null),
    (rows) => this.arrangeGroups(rows),
    () => this.groupTops
  );
  /** The sorted column's {@link DataTableColumn.key} (null = the rows' own order). */
  sortColumn: string | null = null;
  sortDirection: DataTableSortDirection = "asc";
  searchOpen = false;
  /** One full page's height (its rows and the column headings) when {@link fitPageSize} is set. */
  fitHeightPx: number | null = null;
  /** Identity of the currently selected row (matched by {@link trackByKey}, so it
   *  survives live data refreshes). */
  selectedRowKey: unknown = null;

  /** Watches the rows area and the table while {@link fillHeight} is set, to re-fit the page size. */
  private fillObserver?: ResizeObserver;

  constructor(private cd: ChangeDetectorRef) {}

  @HostBinding("class.dt-fill")
  get fillClass(): boolean {
    return this.fillHeight;
  }

  get columnKeys(): string[] {
    return this.columns.map((c) => c.key);
  }

  /** Columns rendered by the table — the checkbox column is prepended in multi-select mode. */
  get displayedColumns(): string[] {
    return this.multiSelect ? ["__select", ...this.columnKeys] : this.columnKeys;
  }

  trackByActionId(_: number, action: DataTableAction): string {
    return action.id;
  }

  /** mat-table trackBy: a stable row id when {@link trackByKey} is set, else the row itself. */
  trackByRow = (_: number, row: Record<string, any>): unknown => (this.trackByKey ? row[this.trackByKey] : row);

  /** Stable identity for a row (used for selection + trackBy). */
  private rowKey(row: Record<string, any>): unknown {
    return this.trackByKey ? row[this.trackByKey] : row;
  }

  /** Whether a row is the currently selected one. */
  isRowSelected(row: Record<string, any>): boolean {
    return this.selectable && this.selectedRowKey != null && this.rowKey(row) === this.selectedRowKey;
  }

  /** {@link treeParentKey}: the row heads a group (it has children). */
  isTreeParent(row: Record<string, any>): boolean {
    return this.treeParents.has(this.rowKey(row));
  }

  /** {@link treeParentKey}: the row sits under a parent. */
  isTreeChild(row: Record<string, any>): boolean {
    return this.treeDepth(row) > 0;
  }

  /** {@link treeParentKey}: how deep the row sits (0: top-level, 1: under a top-level row, …) — its indent. */
  treeDepth(row: Record<string, any>): number {
    return this.treeDepths.get(this.rowKey(row)) ?? 0;
  }

  /** {@link treeParentKey}: a deeper row's extra dots (a dot a level), as shadows of its first — the cell's `--dt-tree-dots`; null under a top-level row. */
  treeDots(row: Record<string, any>): string | null {
    const depth = this.treeDepth(row);
    if (depth < 2) {
      return null;
    }
    return Array.from({ length: depth - 1 }, (_, i) => `${(i + 1) * DT_TREE_DOT_PITCH_PX}px 0 0 var(--c-icon-neutral-light)`).join(", ");
  }

  /** A {@link DataTableColumn.pills} cell's list (not a list: none). */
  pillsOf(row: Record<string, any>, col: DataTableColumn): string[] {
    const value = row[col.key];
    return Array.isArray(value) ? value : [];
  }

  /** {@link groupKey}: the row's place in its group (none: it stands alone, or the table doesn't group). */
  groupPlace(row: Record<string, any>): DtGroupPlace | undefined {
    return this.groupKey ? this.groupPlaces.get(this.rowKey(row)) : undefined;
  }

  /** {@link groupKey}: a summary row's count of rows, in its {@link groupCountColumn} cell (that column hidden: the first). */
  groupCount(col: DataTableColumn, row: Record<string, any>): number | null {
    const place = this.groupPlace(row);
    if (!place?.lead) {
      return null;
    }
    const keys = this.columnKeys;
    const at = this.groupCountColumn && keys.includes(this.groupCountColumn) ? this.groupCountColumn : keys[0];
    return col.key === at ? place.size : null;
  }

  /** {@link groupKey}: a grouped row's shared cell — blank (its summary's says it). */
  groupHidesCell(col: DataTableColumn, row: Record<string, any>): boolean {
    return !!this.groupSharedColumns.length && this.groupSharedColumns.includes(col.key) && this.groupPlace(row)?.lead === false;
  }

  /** {@link groupKey}: a summary row's toggle (or click) — its group opens or folds (the rows arranged again). */
  toggleGroup(row: Record<string, any>, event?: Event): void {
    event?.stopPropagation();
    const place = this.groupPlace(row);
    if (!place?.lead) {
      return;
    }
    if (!this.openGroups.delete(place.value)) {
      this.openGroups.add(place.value);
    }
    this.dataSource.data = [...this.dataSource.data];
  }

  /** {@link groupKey}: the rows a check covers — a summary row stands for its group's rows (shown or folded), each once. */
  private checkable(rows: Record<string, any>[]): Record<string, any>[] {
    const out = new Map<unknown, Record<string, any>>();
    for (const row of rows) {
      const place = this.groupPlace(row);
      for (const r of place?.lead ? place.rows : [row]) {
        out.set(this.rowKey(r), r);
      }
    }
    return [...out.values()];
  }

  /** {@link groupKey}: a summary row's box — some of its rows checked, not all (the dash). */
  isPartlyChecked(row: Record<string, any>): boolean {
    const place = this.groupPlace(row);
    if (!place?.lead) {
      return false;
    }
    const n = place.rows.filter((r) => this.checkedKeys.has(this.rowKey(r))).length;
    return n > 0 && n < place.rows.length;
  }

  /** A compact title's icon: only one the consumer named (the badge's default stays off the compact row). */
  get compactIcon(): string {
    return this.icon && this.icon !== DT_DEFAULT_ICON ? this.icon : "";
  }

  /** A cell's bubble text ({@link DataTableColumn.tooltipOf} / {@link DataTableColumn.tooltipKey}); "" for none. */
  tipOf(col: DataTableColumn, row: Record<string, any>): string {
    const tip = col.tooltipOf ? col.tooltipOf(row) : col.tooltipKey ? row[col.tooltipKey] : "";
    return tip ? String(tip) : "";
  }

  /** A truncate cell hovered: its bubble (the full text) shows only while the text is cut with "…". */
  noteCut(event: Event): void {
    const wrap = event.currentTarget as HTMLElement | null;
    const text = wrap?.querySelector<HTMLElement>(".dt-truncate");
    wrap?.classList.toggle("dt-cut", !!text && text.scrollWidth > text.clientWidth + 1);
  }

  /** Rows click: {@link selectable} / {@link multiSelect}. */
  get rowsClickable(): boolean {
    return this.selectable || this.multiSelect;
  }

  /** Select a clicked row and emit it (no-op when not {@link selectable}).
   *  In multi-select mode the click toggles the row's checkbox instead. */
  onRowClick(row: Record<string, any>): void {
    if (this.groupPlace(row)?.lead) {
      this.toggleGroup(row);
      return;
    }
    if (this.multiSelect) {
      this.toggleRow(row);
      return;
    }
    if (!this.selectable) {
      return;
    }
    this.selectedRowKey = this.rowKey(row);
    this.rowClick.emit(row);
  }

  /** Clear the row selection (e.g. when the consumer closes its detail panel). */
  clearSelection(): void {
    this.selectedRowKey = null;
  }

  // --- Multi-select (checkbox column) ---

  /**
   * Rows on the current page — the scope of the select-all checkbox. Falls back
   * to all filtered rows when there's no paginator (unpaginated tables).
   */
  private get pageRows(): Record<string, any>[] {
    const data = this.dataSource.filteredData ?? [];
    const paginator = this.dataSource.paginator;
    if (!paginator) {
      return data;
    }
    return this.dataSource.page(data, paginator.pageIndex, paginator.pageSize);
  }

  /** Whether a row's checkbox is ticked. */
  isChecked(row: Record<string, any>): boolean {
    const place = this.groupPlace(row);
    if (place?.lead) {
      return place.rows.length > 0 && place.rows.every((r) => this.checkedKeys.has(this.rowKey(r)));
    }
    return this.checkedKeys.has(this.rowKey(row));
  }

  /** All rows on the current page are checked (drives the header checkbox). */
  get allChecked(): boolean {
    const rows = this.checkable(this.pageRows);
    return rows.length > 0 && rows.every((r) => this.checkedKeys.has(this.rowKey(r)));
  }

  /** At least one row on the current page is checked (drives the indeterminate dash). */
  get someChecked(): boolean {
    return this.checkable(this.pageRows).some((r) => this.checkedKeys.has(this.rowKey(r)));
  }

  /** Rows passing the search / filter, every page — what {@link checkAll} covers (server paging: every row there is). */
  get filteredCount(): number {
    return this.serverMode ? (this.serverTotal ?? 0) : (this.dataSource.filteredData ?? []).length;
  }

  /** The rows a "select all" checks — the filtered rows ({@link groupKey}: a summary row's rows, not the summary row). */
  get checkableCount(): number {
    return this.serverMode ? (this.serverTotal ?? 0) : this.checkable(this.dataSource.filteredData ?? []).length;
  }

  /** The rows come a page at a time from the parent ({@link serverTotal}). */
  get serverMode(): boolean {
    return this.serverTotal !== null;
  }

  /** {@link fitPageSize}: every row (a grouping table's: every top-level row) fits on one page. */
  get fitsOnePage(): boolean {
    return this.fitPageSize && (this.serverMode ? this.filteredCount : this.dataSource.pagedCount) <= this.pageLength;
  }

  /**
   * Rows a page: a tree table's, all of them (it grows with its rows); a
   * {@link fitPageSize} table's (every settings table's), {@link DT_FIT_PAGE_ROWS};
   * else {@link pageSize}. A grouping one ({@link groupKey}) counts its
   * top-level rows — an open group's rows come with its summary row, so its
   * page grows by them (a group never splits across pages).
   */
  get pageLength(): number {
    if (this.treeParentKey) {
      return Math.max(1, (this.dataSource.data ?? []).length);
    }
    return this.fitPageSize ? DT_FIT_PAGE_ROWS : this.pageSize;
  }

  /** {@link fitPageSize}: the rows area's height — a full page once the rows run past one page, else its own. */
  get fitMinHeightPx(): number | null {
    return this.fitPageSize && this.paginated && !this.fitsOnePage ? this.fitHeightPx : null;
  }

  /** Every filtered row (every page) is checked. */
  get allFilteredChecked(): boolean {
    const filtered = this.checkable(this.dataSource.filteredData ?? []);
    return filtered.length > 0 && filtered.every((r) => this.checkedKeys.has(this.rowKey(r)));
  }

  /** Toggle a single row's checkbox. */
  toggleRow(row: Record<string, any>): void {
    const place = this.groupPlace(row);
    if (place?.lead) {
      // A summary row's box: all its rows, checked or not as one.
      const check = !this.isChecked(row);
      place.rows.forEach((r) => (check ? this.checkedKeys.add(this.rowKey(r)) : this.checkedKeys.delete(this.rowKey(r))));
      this.emitSelection();
      return;
    }
    const key = this.rowKey(row);
    if (this.checkedKeys.has(key)) {
      this.checkedKeys.delete(key);
    } else {
      this.checkedKeys.add(key);
    }
    this.emitSelection();
  }

  /** Check or uncheck every row on the current page (the header select-all). */
  toggleAll(checked: boolean): void {
    for (const row of this.checkable(this.pageRows)) {
      const key = this.rowKey(row);
      if (checked) {
        this.checkedKeys.add(key);
      } else {
        this.checkedKeys.delete(key);
      }
    }
    this.emitSelection();
  }

  /** The checked rows (resolved against the current data, so stale keys drop out). */
  get selectedRows(): Record<string, any>[] {
    return (this.rows ?? []).filter((r) => this.checkedKeys.has(this.rowKey(r)));
  }

  /** Clear the multi-select checkbox selection. */
  clearChecked(): void {
    if (this.checkedKeys.size === 0) {
      return;
    }
    this.checkedKeys.clear();
    this.emitSelection();
  }

  /**
   * Check or uncheck every (filtered) row — a global "select all" across pages,
   * distinct from the page-scoped header checkbox ({@link toggleAll}).
   */
  checkAll(checked: boolean): void {
    for (const row of this.checkable(this.dataSource.filteredData ?? [])) {
      const key = this.rowKey(row);
      if (checked) {
        this.checkedKeys.add(key);
      } else {
        this.checkedKeys.delete(key);
      }
    }
    this.emitSelection();
  }

  private emitSelection(): void {
    this.selectionChange.emit(this.selectedRows);
  }

  /** Custom cell template for a column, if a consumer projected one. */
  cellTemplate(key: string): TemplateRef<any> | null {
    return this.cellDefs?.find((d) => d.column === key)?.template ?? null;
  }

  /** A column takes the spare width (cut with "…"): the others fit their content. */
  private truncating = false;

  /** A column sized to its content on one line: a table with a {@link DataTableColumn.truncate} column's other columns. */
  fits(col: DataTableColumn): boolean {
    return this.truncating && !col.truncate;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["columns"]) {
      this.truncating = this.columns.some((c) => c.truncate);
    }
    if (changes["multiSelect"] && !this.multiSelect) {
      this.clearChecked();
    }
    if (changes["checked"] && this.checked) {
      this.checkedKeys = new Set(this.checked);
    }
    if (changes["selectedKey"]) {
      this.selectedRowKey = this.selectedKey ?? null;
    }
    if (changes["sort"]) {
      this.sortColumn = this.sort?.key ?? null;
      this.sortDirection = this.sort?.direction ?? "asc";
    }
    if (changes["columns"] && this.sortColumn && !this.sortColumnDef()) {
      this.sortColumn = null; // the sorted column went away for good (not merely hidden: it isn't among sortableColumns either)
      this.sortChange.emit(null);
    }
    if (this.serverMode && this.paginator && (changes["serverTotal"] || changes["serverPage"])) {
      this.paginator.length = this.serverTotal ?? 0;
      this.paginator.pageIndex = this.serverPage;
    }
    if (changes["rows"] || changes["columns"] || changes["sort"] || changes["sortableColumns"]) {
      this.applySort();
      // Re-measure once the new rows have rendered (the first batch usually
      // arrives asynchronously after init, and row height can change when the
      // icon font finishes loading).
      if (this.fitPageSize) {
        this.scheduleFitMeasure();
      }
    }
    if ((changes["groupKey"] || changes["groupSharedColumns"]) && !changes["rows"]) {
      // Grouped, or not: the rows arranged again (a fresh grouping starts folded, on the first page).
      if (changes["groupKey"]) {
        this.openGroups.clear();
        this.dataSource.paginator?.firstPage();
      }
      this.dataSource.data = [...this.dataSource.data];
    }
    if (changes["columns"] || changes["searchKeys"] || changes["treeParentKey"]) {
      // A column's value — and its subtitle, its sort value's key and its bubble's (a code's label) — is searched.
      const defaultKeys = this.columns.flatMap((c) => [c.key, c.subtitleKey, c.sortKey, c.tooltipKey].filter((k): k is string => !!k));
      const keys = this.searchKeys.length ? this.searchKeys : defaultKeys;
      const matches = (row: Record<string, any>, filter: string) => {
        const text = keys
          .map((k) => `${row[k] ?? ""}`)
          .join(" ")
          .toLowerCase();
        return filter.split(DT_SEARCH_TERM_SEPARATOR).every((term) => text.includes(term));
      };
      this.treeMatch = undefined;
      this.dataSource.filterPredicate = this.treeParentKey
        ? (row, filter) => this.treeSearchKeys(filter, matches).has(this.rowKey(row))
        : matches;
      // Re-run the search with the new predicate.
      const filter = this.dataSource.filter;
      this.dataSource.filter = "";
      this.dataSource.filter = filter;
    }
    if (changes["search"]) {
      const terms = (Array.isArray(this.search) ? this.search : [this.search ?? ""])
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
      this.setFilter(terms.join(DT_SEARCH_TERM_SEPARATOR));
    }
  }

  ngAfterViewInit(): void {
    if (this.paginated && this.serverMode && this.paginator) {
      // Server paging: the paginator pages through the parent's total; each page (or page size) is the parent's to fetch.
      this.paginator.length = this.serverTotal ?? 0;
      this.paginator.pageIndex = this.serverPage;
      this.pageSub = this.paginator.page.subscribe((e) => this.pageChange.emit({ page: e.pageIndex, pageSize: e.pageSize }));
    } else if (this.paginated) {
      this.dataSource.paginator = this.paginator;
    }
    if (this.fitPageSize) {
      this.scheduleFitMeasure();
    }
    if (this.fillHeight && this.scrollEl && typeof ResizeObserver !== "undefined") {
      const scroll = this.scrollEl.nativeElement;
      this.fillObserver = new ResizeObserver((entries) => {
        // The table alone changing height past the first page is the page's own
        // rows (rows of uneven height, a wrapped message): re-fitting from them
        // would resize the page and throw it back to the first one.
        if (this.paginator?.pageIndex > 0 && entries.every((e) => e.target !== scroll)) {
          return;
        }
        this.fitPageToHeight();
      });
      this.fillObserver.observe(scroll);
      // Also watch the table itself: its rows can change height without the
      // rows area resizing (e.g. the first page renders before the icon font
      // loads, so icon names show as text and the rows are taller). Re-fitting
      // then keeps the page from staying sized to those taller rows.
      const table = scroll.querySelector("table");
      if (table) {
        this.fillObserver.observe(table);
      }
    }
  }

  ngOnDestroy(): void {
    this.pageSub?.unsubscribe();
    this.fillObserver?.disconnect();
  }

  /**
   * {@link fillHeight}: size the page to the rows that fit the rows area (minus
   * the sticky column-header row), so the table fills its container without an
   * inner scroll. Counts in the shortest rendered row — the standard row — but
   * never more than one and a half standard rows: a page of tall rows (wrapped
   * log messages, a compact list) then scrolls inside the rows area, and the
   * page size depends on the container alone — not on which rows a live
   * refresh happens to show, which would resize the page on every update.
   */
  private fitPageToHeight(): void {
    const scroll = this.scrollEl?.nativeElement;
    if (!scroll || !this.paginated || !this.paginator) {
      return;
    }
    const headerRow = scroll.querySelector<HTMLElement>("tr.mat-mdc-header-row");
    let shortest = 0;
    scroll.querySelectorAll<HTMLElement>("tr.mat-mdc-row").forEach((r) => {
      if (r.offsetHeight && (!shortest || r.offsetHeight < shortest)) {
        shortest = r.offsetHeight;
      }
    });
    const rowPx = Math.min(shortest || DT_ROW_HEIGHT_PX, DT_ROW_HEIGHT_PX * 1.5);
    const available = scroll.clientHeight - (headerRow?.offsetHeight ?? 0);
    const fit = Math.max(1, Math.floor(available / rowPx));
    if (fit !== this.paginator.pageSize) {
      // _changePageSize keeps the first visible row in view and emits a page
      // event, so the MatTableDataSource re-slices to the new page size.
      this.paginator._changePageSize(fit);
      this.cd.detectChanges();
    }
  }

  /**
   * Measure now, after the next frame, and again once the icon font has loaded —
   * the rendered row height grows when Material Symbols replaces the fallback
   * font, so an early single measurement would be too short.
   */
  private scheduleFitMeasure(): void {
    setTimeout(() => this.measureFitHeight());
    const fonts: any = (document as any).fonts;
    if (fonts?.ready?.then) {
      fonts.ready.then(() => this.measureFitHeight());
    }
  }

  /**
   * Set {@link fitHeightPx} to `pageLength × (rendered row height)` so a full page
   * fits exactly with no inner scroll and the height stays constant across
   * pages. No-op until at least one row is rendered.
   */
  private measureFitHeight(): void {
    const rows = this.scrollEl?.nativeElement.querySelectorAll<HTMLElement>("tr.mat-mdc-row");
    if (!rows?.length) {
      return;
    }
    // Use the tallest row to guard against a row that hasn't fully laid out yet;
    // rows are uniform in practice.
    let rowHeight = 0;
    rows.forEach((r) => (rowHeight = Math.max(rowHeight, r.offsetHeight)));
    // The (sticky) column-header row lives inside the scroll area, so the fit
    // height must include it or the last row gets clipped and scrolls. It's
    // offsetHeight 0 when hidden (display:none), so this is a no-op then.
    const headerRow = this.scrollEl?.nativeElement.querySelector<HTMLElement>("tr.mat-mdc-header-row");
    const headerHeight = headerRow?.offsetHeight ?? 0;
    const next = rowHeight * this.pageLength + headerHeight;
    if (next !== this.fitHeightPx) {
      this.fitHeightPx = next;
      this.cd.detectChanges();
    }
  }

  toggleSearch(): void {
    this.searchOpen = !this.searchOpen;
    if (this.searchOpen) {
      setTimeout(() => this.searchInput?.nativeElement.focus());
    } else {
      this.applyFilter("");
    }
  }

  applyFilter(value: string): void {
    this.setFilter(value.trim().toLowerCase());
  }

  /** Apply a (lower-cased) filter string — one term, or several joined by {@link DT_SEARCH_TERM_SEPARATOR}. Server paging: the parent's. */
  private setFilter(filter: string): void {
    if (this.serverMode) {
      return;
    }
    this.dataSource.filter = filter;
    this.dataSource.paginator?.firstPage();
  }

  /** The parent row's key of a row ({@link treeParentKey}); null for a top-level row. */
  private treeParentOf(row: Record<string, any>): unknown {
    const parent = this.treeParentKey ? row[this.treeParentKey] : null;
    return parent === "" || parent === undefined ? null : parent;
  }

  /**
   * {@link treeParentKey} search: the rows to show for a filter — every row
   * that matches, the rows above it and the rows under it, at any depth.
   * Cached per data + filter (the predicate runs per row).
   */
  private treeSearchKeys(filter: string, matches: (row: Record<string, any>, filter: string) => boolean): Set<unknown> {
    const data = this.dataSource.data;
    if (this.treeMatch && this.treeMatch.data === data && this.treeMatch.filter === filter) {
      return this.treeMatch.keys;
    }
    const parentOf = new Map(data.map((r) => [this.rowKey(r), this.treeParentOf(r)]));
    const childrenOf = new Map<unknown, unknown[]>();
    parentOf.forEach((parent, key) => {
      if (parent !== null && parentOf.has(parent)) {
        childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), key]);
      }
    });
    const keys = new Set<unknown>();
    const below = new Set<unknown>();
    const down = (key: unknown) => {
      for (const child of childrenOf.get(key) ?? []) {
        if (!below.has(child)) {
          below.add(child);
          keys.add(child);
          down(child);
        }
      }
    };
    for (const row of data.filter((r) => matches(r, filter))) {
      const key = this.rowKey(row);
      keys.add(key);
      const seen = new Set<unknown>([key]);
      for (let up = parentOf.get(key) ?? null; up !== null && parentOf.has(up) && !seen.has(up); up = parentOf.get(up) ?? null) {
        seen.add(up);
        keys.add(up);
      }
      down(key);
    }
    this.treeMatch = { data, filter, keys };
    return keys;
  }

  /** Whether a column's header sorts on click. */
  isSortable(col: DataTableColumn): boolean {
    return this.sortable && this.showColumnHeaders && col.sortable !== false;
  }

  /** Header click: ascending → descending → unsorted (the rows' own order). */
  toggleSort(col: DataTableColumn): void {
    if (this.sortColumn !== col.key) {
      this.sortColumn = col.key;
      this.sortDirection = "asc";
    } else if (this.sortDirection === "asc") {
      this.sortDirection = "desc";
    } else {
      this.sortColumn = null;
    }
    this.applySort();
    this.dataSource.paginator?.firstPage();
    this.sortChange.emit(this.sortColumn ? { key: this.sortColumn, direction: this.sortDirection } : null);
    if (this.serverMode && this.paginator) {
      // The parent sorts: back to its first page.
      this.paginator.pageIndex = 0;
      this.pageChange.emit({ page: 0, pageSize: this.paginator.pageSize });
    }
  }

  /** `aria-sort` for a header cell. */
  ariaSort(col: DataTableColumn): string | null {
    if (!this.isSortable(col)) {
      return null;
    }
    if (this.sortColumn !== col.key) {
      return "none";
    }
    return this.sortDirection === "asc" ? "ascending" : "descending";
  }

  /** Feed the data source the rows in the current sort order (search and paging apply on top; server paging: the page as fetched). */
  private applySort(): void {
    const rows = this.rows ?? [];
    if (this.serverMode) {
      this.dataSource.data = rows;
      return;
    }
    const col = this.sortColumnDef();
    const compare = col ? this.sortComparator(col) : null;
    if (this.treeParentKey) {
      this.dataSource.data = this.treeOrder(rows, compare);
    } else {
      this.treeDepths = new Map();
      this.treeParents = new Set();
      this.dataSource.data = compare ? [...rows].sort(compare) : rows;
    }
  }

  /**
   * {@link groupKey}: the rows (searched, in order) with each group of two or
   * more in a summary row of its own ({@link groupSummary}) — the summary rows
   * sorted among the rows standing alone, by the table's sort — its rows under
   * it while it's open; each grouped row's place noted.
   */
  private arrangeGroups(rows: Record<string, any>[]): Record<string, any>[] {
    const key = this.groupKey;
    const places = new Map<unknown, DtGroupPlace>();
    this.groupPlaces = places;
    this.groupTops = null;
    if (!key || this.treeParentKey) {
      return rows;
    }
    const groups = new Map<string, Record<string, any>[]>();
    const order: (Record<string, any> | string)[] = [];
    for (const row of rows) {
      const value = row[key] == null ? "" : String(row[key]);
      const group = value ? groups.get(value) : undefined;
      if (!value) {
        order.push(row);
      } else if (group) {
        group.push(row);
      } else {
        groups.set(value, [row]);
        order.push(value);
      }
    }
    // The top level: the rows standing alone and a summary row a group.
    const top = order.map((item) => {
      const group = typeof item === "string" ? (groups.get(item) ?? []) : [];
      if (typeof item !== "string" || group.length < 2) {
        return { row: typeof item === "string" ? group[0] : item, value: "", group: [] as Record<string, any>[] };
      }
      const summary = this.groupSummary ? this.groupSummary(group, item) : Object.fromEntries(this.groupSharedColumns.map((k) => [k, group[0][k]]));
      if (this.trackByKey) {
        summary[this.trackByKey] = `\u0000group:${item}`;
      }
      return { row: summary, value: item, group };
    });
    const col = this.sortColumnDef();
    if (col) {
      const compare = this.sortComparator(col);
      top.sort((a, b) => compare(a.row, b.row));
    }
    const out: Record<string, any>[] = [];
    const tops: number[] = [];
    for (const { row, value, group } of top) {
      tops.push(out.length);
      out.push(row);
      if (!value) {
        continue;
      }
      const collapsed = !this.openGroups.has(value);
      places.set(this.rowKey(row), { value, lead: true, last: false, size: group.length, collapsed, rows: group });
      if (!collapsed) {
        group.forEach((r, i) => {
          places.set(this.rowKey(r), { value, lead: false, last: i === group.length - 1, size: group.length, collapsed, rows: [] });
          out.push(r);
        });
      }
    }
    this.groupTops = tops;
    return out;
  }

  /**
   * {@link treeParentKey}: each top-level row followed by the rows under it,
   * depth first (a row whose parent isn't in the rows counts as top-level;
   * rows caught in a cycle show from the top), each level sorted by
   * `compare` when given — and each row's depth and the parents noted.
   */
  private treeOrder(rows: Record<string, any>[], compare: ((a: Record<string, any>, b: Record<string, any>) => number) | null): Record<string, any>[] {
    const keys = new Set(rows.map((r) => this.rowKey(r)));
    const top: Record<string, any>[] = [];
    const children = new Map<unknown, Record<string, any>[]>();
    for (const row of rows) {
      const parent = this.treeParentOf(row);
      if (parent !== null && keys.has(parent) && parent !== this.rowKey(row)) {
        children.set(parent, [...(children.get(parent) ?? []), row]);
      } else {
        top.push(row);
      }
    }
    const sorted = (list: Record<string, any>[]) => (compare ? [...list].sort(compare) : list);
    const ordered: Record<string, any>[] = [];
    const depths = new Map<unknown, number>();
    const visit = (row: Record<string, any>, depth: number) => {
      const key = this.rowKey(row);
      if (depths.has(key)) {
        return;
      }
      depths.set(key, depth);
      ordered.push(row);
      sorted(children.get(key) ?? []).forEach((child) => visit(child, depth + 1));
    };
    sorted(top).forEach((row) => visit(row, 0));
    sorted(rows.filter((r) => !depths.has(this.rowKey(r)))).forEach((row) => visit(row, 0));
    this.treeDepths = depths;
    this.treeParents = new Set([...children.keys()]);
    return ordered;
  }

  /** The sorted column's definition: among the shown columns, else among {@link sortableColumns} (a hidden column keeps its sort). */
  private sortColumnDef(): DataTableColumn | undefined {
    const key = this.sortColumn;
    return key ? (this.columns.find((c) => c.key === key) ?? this.sortableColumns?.find((c) => c.key === key)) : undefined;
  }

  /** The comparator of a sorted column (its {@link DataTableColumn.sortValue} or {@link DataTableColumn.sortKey}, in {@link sortDirection}). */
  private sortComparator(col: DataTableColumn): (a: Record<string, any>, b: Record<string, any>) => number {
    const key = col.sortKey ?? col.key;
    const value = col.sortValue ?? ((row: Record<string, any>) => row[key]);
    const dir = this.sortDirection === "asc" ? 1 : -1;
    const isEmpty = (v: unknown) => v === null || v === undefined || v === "" || (typeof v === "number" && isNaN(v));
    return (a, b) => {
      const va = value(a);
      const vb = value(b);
      // Empty values sink to the bottom in both directions.
      if (isEmpty(va) || isEmpty(vb)) {
        return isEmpty(va) === isEmpty(vb) ? 0 : isEmpty(va) ? 1 : -1;
      }
      if (typeof va === "number" && typeof vb === "number") {
        return (va - vb) * dir;
      }
      return `${va}`.localeCompare(`${vb}`, undefined, { numeric: true, sensitivity: "base" }) * dir;
    };
  }

  chipActive(row: Record<string, any>, col: DataTableColumn): boolean {
    return !!row[col.chipActiveKey ?? col.key];
  }
}
