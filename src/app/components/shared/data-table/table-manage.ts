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

import { DataTableComponent } from "./data-table.component";

/**
 * A table's Manage mode — rows checked to edit or delete together — the state
 * `tb-table-links` shows ("Manage" → "Edit (n) | Delete (n) | Select all |
 * Done") and the table binds:
 *
 * ```ts
 * readonly manage = new TableManage(() => this.table, () => this.store.items.length);
 * ```
 * ```html
 * <tb-data-table #table [multiSelect]="manage.managing" (selectionChange)="manage.onSelection($event)" …>
 *   <tb-table-links dt-footer [manage]="manage" …></tb-table-links>
 * </tb-data-table>
 * ```
 */
export class TableManage implements TableManageState {
  managing = false;
  /** The checked rows. */
  selected: Record<string, any>[] = [];

  constructor(
    /** The table (its checks), once rendered. */
    private table: () => DataTableComponent | undefined,
    /** How many rows there are while the table isn't rendered yet. */
    private total: () => number = () => 0
  ) {}

  start(): void {
    this.managing = true;
    this.selected = [];
  }

  end(): void {
    const table = this.table();
    this.managing = false;
    this.selected = [];
    table?.clearChecked();
  }

  /** The table's `(selectionChange)`. */
  onSelection(rows: Record<string, any>[]): void {
    if (this.managing) {
      this.selected = rows;
    }
  }

  get selectedCount(): number {
    return this.selected.length;
  }

  /** Every row passing the table's search is checked. */
  get allChecked(): boolean {
    return this.table()?.allFilteredChecked ?? false;
  }

  /** The rows "Select all" covers: those passing the table's search (every row without one). */
  get count(): number {
    return this.table()?.checkableCount ?? this.total();
  }

  toggleAll(): void {
    const table = this.table();
    if (!table) {
      return;
    }
    if (this.allChecked) {
      table.clearChecked();
    } else {
      table.checkAll(true);
    }
  }

  /** The list changed (a delete): the checks that are gone drop out. */
  keep(ids: Set<string>, key = "id"): void {
    if (this.managing) {
      this.selected = this.selected.filter((r) => ids.has(r[key] as string));
    }
  }
}

/** What a table's footer (`tb-table-links`) needs of its Manage state — a {@link TableManage}, or a table's own ({@link tableManageOf}). */
export interface TableManageState {
  managing: boolean;
  /** How many rows are checked. */
  selectedCount: number;
  /** Every row "Select all" covers is checked. */
  allChecked: boolean;
  /** How many rows "Select all" covers. */
  count: number;
  start(): void;
  end(): void;
  toggleAll(): void;
}

/** A table that keeps its Manage state itself (a server-paged list, a dashboard's own table): that state, for its footer. */
export function tableManageOf(of: {
  managing: () => boolean;
  selectedCount: () => number;
  allChecked: () => boolean;
  count: () => number;
  start: () => void;
  end: () => void;
  toggleAll: () => void;
}): TableManageState {
  return {
    get managing() {
      return of.managing();
    },
    get selectedCount() {
      return of.selectedCount();
    },
    get allChecked() {
      return of.allChecked();
    },
    get count() {
      return of.count();
    },
    start: () => of.start(),
    end: () => of.end(),
    toggleAll: () => of.toggleAll(),
  };
}
