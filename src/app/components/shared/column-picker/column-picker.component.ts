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

import { Component, ElementRef, EventEmitter, HostBinding, Input, OnDestroy, OnInit, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { SharedModule } from "@shared/public-api";
import { CheckboxComponent } from "../checkbox/checkbox.component";

/** A column the picker offers: a table's `DataTableColumn` does. */
export interface PickableColumn {
  key: string;
  header: string;
}

/** The table's sort, as the picker marks it (a table's `DataTableSort` does). */
export interface ColumnPickerSort {
  key: string;
  direction: "asc" | "desc";
}

/** The picker's width — the sidebar grows by it (and its gap) while the picker is open. */
export const COLUMN_PICKER_WIDTH = 220;

/**
 * The class a column picker puts on the element holding it while it's shown — so a sheet (`tb-sidebar-layout`'s, a phone's) can show
 * the picker in its siblings' place by a class, never a `*:has(> tb-column-picker)` rule (which made every DOM change on the page
 * re-match it: ~10 ms of style recalculation a change, a chart tooltip's on each pointer move).
 */
export const COLUMN_PICKER_PARENT_CLASS = "tb-column-picker-parent";

/**
 * "Customize columns" for a table (UniFi style): a bordered column listing the
 * table's columns with a checkbox each (and "All"), changes applied as they're
 * made, "Restore" for the defaults and "Done" to close. At least one column
 * always stays. The column the table is sorted by carries the sort's arrow
 * (up: ascending, down: descending) — the only sign of it once that column is
 * hidden.
 *
 * It isn't a popup: put it in the sidebar beside the filters (the sidebar
 * widened by {@link COLUMN_PICKER_WIDTH} plus a gap while it's open), where it
 * takes the sidebar's height and folds away with it.
 *
 * ```html
 * <tb-column-picker *ngIf="pickerOpen" [columns]="columns" [visible]="visibleKeys"
 *                   (visibleChange)="visibleKeys = $event" (done)="pickerOpen = false"></tb-column-picker>
 * ```
 */
@Component({
  selector: "tb-column-picker",
  templateUrl: "./column-picker.component.html",
  styleUrls: ["./column-picker.component.scss"],
  standalone: true,
  imports: [CommonModule, FormsModule, SharedModule, CheckboxComponent],
})
export class ColumnPickerComponent implements OnInit, OnDestroy {
  /** Every column of the table, in its order. */
  @Input() columns: PickableColumn[] = [];
  /** The keys of the columns shown. */
  @Input() visible: string[] = [];
  /** The keys "Restore" goes back to (none = every column). */
  @Input() defaults: string[] = [];
  /** The table's sort: its column's row carries the arrow of its direction (null: none shown). */
  @Input() sort: ColumnPickerSort | null = null;
  /** The columns shown, in the table's order, after a change. */
  @Output() visibleChange = new EventEmitter<string[]>();
  /** "Done". */
  @Output() done = new EventEmitter<void>();

  @HostBinding("style.width.px") readonly width = COLUMN_PICKER_WIDTH;

  /** The element holding it, marked while it's shown ({@link COLUMN_PICKER_PARENT_CLASS}). */
  private parent: HTMLElement | null = null;

  constructor(private readonly host: ElementRef<HTMLElement>) {}

  ngOnInit(): void {
    this.parent = this.host.nativeElement.parentElement;
    this.parent?.classList.add(COLUMN_PICKER_PARENT_CLASS);
  }

  ngOnDestroy(): void {
    this.parent?.classList.remove(COLUMN_PICKER_PARENT_CLASS);
    this.parent = null;
  }

  /** "All": checked only while every column shows. */
  get allValue(): boolean {
    return this.columns.every((c) => this.isVisible(c.key));
  }

  isVisible(key: string): boolean {
    return this.visible.includes(key);
  }

  /** The last column showing can't be hidden. */
  isLocked(key: string): boolean {
    return this.isVisible(key) && this.columns.filter((c) => this.isVisible(c.key)).length <= 1;
  }

  toggle(key: string): void {
    if (this.isLocked(key)) {
      return;
    }
    const next = new Set(this.visible);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    this.emit(next);
  }

  /** "All" on: every column; off: just the first. */
  onAll(on: boolean): void {
    this.emit(new Set(on ? this.columns.map((c) => c.key) : this.columns.slice(0, 1).map((c) => c.key)));
  }

  restore(): void {
    this.emit(new Set(this.defaults.length ? this.defaults : this.columns.map((c) => c.key)));
  }

  trackByKey(_: number, c: PickableColumn): string {
    return c.key;
  }

  private emit(keys: Set<string>): void {
    this.visibleChange.emit(this.columns.filter((c) => keys.has(c.key)).map((c) => c.key));
  }
}
