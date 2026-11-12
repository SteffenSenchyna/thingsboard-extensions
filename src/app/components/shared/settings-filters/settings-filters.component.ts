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

import { Component, EventEmitter, HostBinding, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ColumnPickerComponent } from "../column-picker/column-picker.component";
import { SearchBoxComponent } from "../search-box/search-box.component";
import { SavedColumnChoice, settingsFiltersWidth } from "../dashboard/table-columns";
import type { DataTableSort } from "../data-table/data-table.component";

/** A filters column's search: the box's chips, its text, and what the table searches for (both). */
export interface FiltersSearch {
  searchTerms: string[];
  searchText: string;
  search: string[];
}

/**
 * A Settings table's filters column, beside the Settings menu — the one
 * frame every such column shares: the table's search box, the page's own
 * filters (projected: switches, `tb-filter-sections`), "Clear filters" and
 * "Customize columns" pinned at its foot, and the column picker beside it
 * while open (the dashboard widens its sidebar for it:
 * `settingsSidebarWidth(true, pickerOpen)`).
 *
 * ```html
 * <tb-settings-filters [filter]="filter" (filterChange)="set($event)" [canClear]="store.hasFilter(page)" (clear)="store.clearFilter(page)"
 *                      [columns]="columns" [sort]="store.sortOf(page)" [(pickerOpen)]="store.columnPickerOpen">
 *   <tb-filter-sections>…</tb-filter-sections>
 * </tb-settings-filters>
 * ```
 */
@Component({
  selector: "tb-settings-filters",
  templateUrl: "./settings-filters.component.html",
  styleUrls: ["./settings-filters.component.scss"],
  standalone: true,
  imports: [CommonModule, ColumnPickerComponent, SearchBoxComponent],
})
export class SettingsFiltersComponent {
  @HostBinding("attr.title") readonly hostTitle: string | null = null;
  /** The table's search (the page's filter holds it). */
  @Input() filter: FiltersSearch = { searchTerms: [], searchText: "", search: [] };
  /** A part of the search changed: the patch for the page's filter. */
  @Output() filterChange = new EventEmitter<Partial<FiltersSearch>>();
  /** "Clear filters" has something to clear. */
  @Input() canClear = false;
  @Output() clear = new EventEmitter<void>();
  /** The table's "Customize columns" choice, and its sort (the picker marks its column). */
  @Input() columns!: SavedColumnChoice;
  @Input() sort: DataTableSort | null = null;
  /** The column picker is open (two-way). */
  @Input() pickerOpen = false;
  @Output() pickerOpenChange = new EventEmitter<boolean>();

  /** The filters column — and the column picker beside it while open. */
  @HostBinding("style.width.px") get width(): number {
    return settingsFiltersWidth(this.pickerOpen);
  }
}
