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
import type { TableManageState } from "../data-table/table-manage";

/**
 * One link of a table's footer ({@link TableLinksComponent}): a text link
 * after the divider from the link before it — "Sync all", "Import" — placed
 * inside `tb-table-links` for a table's own actions.
 *
 * ```html
 * <tb-table-link [disabled]="store.syncing" (action)="store.syncAll()">Sync all</tb-table-link>
 * ```
 */
@Component({
  selector: "tb-table-link",
  template: `<span *ngIf="divider" class="tl-divider" aria-hidden="true"></span>
    <button type="button" class="tl-link" [class.danger]="danger" [disabled]="disabled" (click)="action.emit()">
      <span *ngIf="busy" class="tl-spinner" aria-hidden="true"></span><ng-content></ng-content>
    </button>`,
  styleUrls: ["./table-link.component.scss"],
  standalone: true,
  imports: [CommonModule],
})
export class TableLinkComponent {
  @HostBinding("attr.title") readonly hostTitle: string | null = null;
  @Input() disabled = false;
  /** A destructive link (Delete): in red. */
  @Input() danger = false;
  /** The divider before it (off for a footer's first link). */
  @Input() divider = true;
  /** Its action is running: a spinner before its text. */
  @Input() busy = false;
  @Output() action = new EventEmitter<void>();
}

/**
 * A table's footer links (in its `dt-footer` slot) — the one set every table
 * shares: "Create new | Manage", then the table's own links (projected
 * `tb-table-link`s); managing (rows checked): "Edit (n) | Delete (n) | Select
 * all (n) / Deselect all | Done". The state is a `TableManage` (or a table's
 * own, through `tableManageOf`); the table says what its links do.
 *
 * ```html
 * <tb-table-links dt-footer [manage]="manage" [busy]="store.saving" [canEdit]="true" [manageDisabled]="!rows.length"
 *                 (create)="store.openAdd()" (edit)="editSelected()" (delete)="askDeleteSelected()">
 *   <tb-table-link (action)="store.syncAll()">Sync all</tb-table-link>
 * </tb-table-links>
 * ```
 */
@Component({
  selector: "tb-table-links",
  templateUrl: "./table-links.component.html",
  styleUrls: ["./table-links.component.scss"],
  standalone: true,
  imports: [CommonModule, TableLinkComponent],
})
export class TableLinksComponent {
  @HostBinding("attr.title") readonly hostTitle: string | null = null;
  /** The table's Manage state (none: a footer with "Create new" and its own links only). */
  @Input() manage: TableManageState | null = null;
  /** A save or delete under way: the managing links wait. */
  @Input() busy = false;
  /** "Create new" shows / is off. */
  @Input() canCreate = true;
  @Input() createDisabled = false;
  /** "Manage" is off (no rows, another list being managed). */
  @Input() manageDisabled = false;
  /** Managing: "Edit (n)" and "Delete (n)" show. */
  @Input() canEdit = false;
  @Input() canDelete = true;
  /** A delete under way ("Deleting… 2 / 4"). */
  @Input() deleting: { done: number; total: number } | null = null;
  /** "Select all" covers only the page shown (a server-paged table): "Select page". */
  @Input() pageOnly = false;
  @Output() create = new EventEmitter<void>();
  @Output() edit = new EventEmitter<void>();
  @Output() delete = new EventEmitter<void>();

  get n(): number {
    return this.manage?.selectedCount ?? 0;
  }

  get count(): string {
    return this.n ? ` (${this.n})` : "";
  }
}
