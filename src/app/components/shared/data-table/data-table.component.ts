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
  ContentChildren,
  Directive,
  ElementRef,
  EventEmitter,
  HostBinding,
  Input,
  OnChanges,
  Output,
  QueryList,
  SimpleChanges,
  TemplateRef,
  ViewChild,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatTableDataSource } from "@angular/material/table";
import { MatPaginator } from "@angular/material/paginator";
import { SharedModule } from "@shared/public-api";
import { CopyBoxComponent } from "../copy-box/copy-box.component";
import { WidgetHeaderComponent } from "../widget-header/widget-header.component";

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
@Component({
  selector: "tb-data-table",
  templateUrl: "./data-table.component.html",
  styleUrls: ["./data-table.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, CopyBoxComponent, WidgetHeaderComponent],
})
export class DataTableComponent implements OnChanges, AfterViewInit {
  /**
   * Strip the native `title` attribute off the host. The `title` @Input is set
   * via `title="…"` on the host element, but `title` is also a global HTML
   * attribute, so the browser would otherwise render its own tooltip with that
   * text on top of any matTooltip.
   */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;

  @Input() title = "";
  @Input() icon = "table_rows";
  @Input() columns: DataTableColumn[] = [];
  @Input() rows: Record<string, any>[] = [];
  @Input() loading = false;
  @Input() emptyText = "No data";
  @Input() loadingText = "Loading…";
  @Input() searchEnabled = true;
  /** Render the search button before the action buttons (default: after). */
  @Input() searchFirst = false;
  /** Keep the card the same height whether the search bar is open or closed. */
  @Input() reserveSearchSpace = false;
  @Input() searchPlaceholder = "Search";
  /** Row properties included in the search filter (defaults to all column keys). */
  @Input() searchKeys: string[] = [];
  /** Hide the column header row (useful for single rich-cell tables). */
  @Input() showColumnHeaders = true;
  /** Extra header action buttons, rendered left of the search button. */
  @Input() actions: DataTableAction[] = [];
  @Input() pageSize = 10;

  /** Emits the {@link DataTableAction.id} of a clicked header action. */
  @Output() actionClick = new EventEmitter<string>();

  @ViewChild("paginator") paginator!: MatPaginator;
  @ViewChild("searchInput") searchInput?: ElementRef<HTMLInputElement>;
  @ContentChildren(DataTableCellDirective) cellDefs?: QueryList<DataTableCellDirective>;

  dataSource = new MatTableDataSource<Record<string, any>>([]);
  searchOpen = false;

  get columnKeys(): string[] {
    return this.columns.map((c) => c.key);
  }

  trackByActionId(_: number, action: DataTableAction): string {
    return action.id;
  }

  /** Custom cell template for a column, if a consumer projected one. */
  cellTemplate(key: string): TemplateRef<any> | null {
    return this.cellDefs?.find((d) => d.column === key)?.template ?? null;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["rows"]) {
      this.dataSource.data = this.rows ?? [];
    }
    if (changes["columns"] || changes["searchKeys"]) {
      const defaultKeys = this.columns.flatMap((c) => (c.subtitleKey ? [c.key, c.subtitleKey] : [c.key]));
      const keys = this.searchKeys.length ? this.searchKeys : defaultKeys;
      this.dataSource.filterPredicate = (row, filter) =>
        keys
          .map((k) => `${row[k] ?? ""}`)
          .join(" ")
          .toLowerCase()
          .includes(filter);
    }
  }

  ngAfterViewInit(): void {
    this.dataSource.paginator = this.paginator;
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
    this.dataSource.filter = value.trim().toLowerCase();
    this.dataSource.paginator?.firstPage();
  }

  chipActive(row: Record<string, any>, col: DataTableColumn): boolean {
    return !!row[col.chipActiveKey ?? col.key];
  }
}
