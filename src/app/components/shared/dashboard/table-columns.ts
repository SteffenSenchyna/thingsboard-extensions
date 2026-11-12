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

import { DestroyRef } from "@angular/core";
import { WidgetContext } from "@home/models/widget-component.models";
import { DataTableColumn, DataTableSort } from "../data-table/data-table.component";
import { COLUMN_PICKER_WIDTH } from "../column-picker/column-picker.component";
import { readUserSettings, saveUserSettings } from "./dashboard-preferences";

/** The gap between a sidebar's filters and its column picker (as `dashboard.tb-dashboard-sidebar-columns`). */
export const SIDEBAR_COLUMNS_GAP = 12;

/**
 * A `tb-sidebar-layout` sidebar's own room before its divider: its padding
 * and the divider (`.sl-sidebar`'s padding-right and border) — a sidebar this
 * much wider than a fixed-width column in it holds the column clear of the
 * divider, as every dashboard's filters are.
 */
export const SIDEBAR_LAYOUT_INSET = 17;

/** The Settings page's sidebar width: its section menu — compact, no filters beside it (the layout's inset included). */
export const SETTINGS_SIDEBAR_WIDTH = 220;

/** A Settings page's filters column beside the section menu (the Access pages' `tb-access-filters`). */
export const SETTINGS_FILTERS_WIDTH = 240;

/** The space between the section menu and the filters column, a divider down its middle — keep it equal to `$settings-filters-gap` (styles/_dashboard.scss). */
export const SETTINGS_FILTERS_GAP = 20;

/** A Settings page's filters column (`tb-access-filters`, `tb-site-filters`): the filters, plus its table's column picker and the gap to it while that's open. */
export function settingsFiltersWidth(pickerOpen: boolean): number {
  return SETTINGS_FILTERS_WIDTH + (pickerOpen ? SIDEBAR_COLUMNS_GAP + COLUMN_PICKER_WIDTH : 0);
}

/**
 * A dashboard sidebar's width: its filters column, plus the column picker and
 * the gap to it while that's open (`tb-sidebar-layout [width]`).
 */
export function sidebarWidth(filtersWidth: number, pickerOpen: boolean): number {
  return filtersWidth + (pickerOpen ? SIDEBAR_COLUMNS_GAP + COLUMN_PICKER_WIDTH : 0);
}

/**
 * A table's "Customize columns" choice: which of its columns show — the
 * user's pick, kept in their settings, the defaults until they make one. Pair
 * it with `tb-column-picker` in the sidebar:
 *
 * ```ts
 * readonly columnChoice = new TableColumnChoice(this.columns, DEFAULT_KEYS, "myTableColumns");
 * // readUserSettings(…, (settings) => this.columnChoice.restore(settings))
 * onColumnsChange(keys: string[]) {
 *   this.columnChoice.set(keys);
 *   saveUserSettings(this.ctx, this.destroyRef, this.columnChoice.settingsFor(keys));
 * }
 * ```
 * ```html
 * <tb-data-table [columns]="columnChoice.visible" [sortableColumns]="columnChoice.columns" …>
 * <tb-column-picker [columns]="columnChoice.columns" [visible]="columnChoice.keys" [defaults]="columnChoice.defaults"
 *                   (visibleChange)="onColumnsChange($event)" …>
 * ```
 */
export class TableColumnChoice {
  /** The columns shown, in the table's order. */
  visible: DataTableColumn[];
  /** Their keys (the picker's ticks). */
  keys: string[];

  /**
   * @param columns Every column the table has, in its order.
   * @param defaults The keys shown until the user picks (and what the picker's "Restore" goes back to).
   * @param settingKey The user-settings key the pick is kept under; the columns the pick knew go under `<settingKey>Known`.
   * @param addedSince Default columns added after users could already save a pick: a pick saved before
   *   the known columns were kept with it gets these once.
   */
  constructor(
    readonly columns: DataTableColumn[],
    readonly defaults: string[],
    private readonly settingKey: string,
    private readonly addedSince: string[] = []
  ) {
    this.visible = columns.filter((c) => defaults.includes(c.key));
    this.keys = this.visible.map((c) => c.key);
  }

  private get knownKey(): string {
    return `${this.settingKey}Known`;
  }

  /** Show these columns (in the table's order); none of them = every column. */
  set(keys: string[]): void {
    const wanted = new Set(keys);
    const columns = this.columns.filter((c) => wanted.has(c.key));
    this.visible = columns.length ? columns : this.columns;
    this.keys = this.visible.map((c) => c.key);
  }

  /**
   * The user's saved pick (from `readUserSettings`), if any. A default column
   * the pick never knew (added since it was saved) shows once; unticked after
   * that, it stays off.
   */
  restore(settings: Record<string, any> | null | undefined): void {
    const picked = settings?.[this.settingKey];
    if (!Array.isArray(picked)) {
      return;
    }
    const keys = picked.filter((k): k is string => typeof k === "string");
    const savedKnown = settings?.[this.knownKey];
    const known: string[] = Array.isArray(savedKnown) ? savedKnown : this.columns.map((c) => c.key).filter((k) => !this.addedSince.includes(k));
    const added = this.defaults.filter((k) => !known.includes(k) && !keys.includes(k));
    this.set([...keys, ...added]);
  }

  /** What to save after a pick (`saveUserSettings`): the pick, and the columns it knew. */
  settingsFor(keys: string[]): Record<string, unknown> {
    return { [this.settingKey]: keys, [this.knownKey]: this.columns.map((c) => c.key) };
  }
}

/**
 * A shared table's "Customize columns" — Organization › Sites, Access › Groups
 * and Users, on every dashboard's Settings page — kept by its store: a
 * {@link TableColumnChoice} that reads the user's pick from their settings the
 * first time its table shows ({@link load}) and saves each change ({@link pick}).
 * Every column shows until the user picks.
 */
export class SavedColumnChoice extends TableColumnChoice {
  private loaded = false;
  /** A pick made before the user's settings came in: theirs wins. */
  private picked = false;

  constructor(
    columns: DataTableColumn[],
    settingKey: string,
    private readonly ctx: WidgetContext,
    private readonly destroyRef: DestroyRef,
    /** Re-render the dashboard once the saved pick is in. */
    private readonly changed: () => void
  ) {
    super(columns, columns.map((c) => c.key), settingKey);
  }

  /** The user's saved pick, read once (its table shows). */
  load(): void {
    if (this.loaded) {
      return;
    }
    this.loaded = true;
    readUserSettings(this.ctx, this.destroyRef, (settings) => {
      if (!this.picked) {
        this.restore(settings);
        this.changed();
      }
    });
  }

  /** The picker's change: shown at once and kept in the user's settings. */
  pick(keys: string[]): void {
    this.picked = true;
    this.set(keys);
    saveUserSettings(this.ctx, this.destroyRef, this.settingsFor(keys));
  }
}

/**
 * A table's sort kept in the user's settings, as the gateways table's — every
 * Settings table's (Organization, Applications, Access): read the first time
 * its table shows ({@link load}), saved with each header click ({@link pick}).
 * A cleared sort (a third click) stays cleared; until the user picks one, the
 * default; a saved sort on a column the table no longer has is dropped. Bind
 * it to the table (and to its column picker, which marks the sorted column):
 *
 * ```html
 * <tb-data-table [sortable]="true" [sort]="tableSort.sort" (sortChange)="tableSort.pick($event)" …>
 * <tb-column-picker [sort]="tableSort.sort" …>
 * ```
 */
export class SavedTableSort {
  /** The sort shown. */
  sort: DataTableSort | null;
  private loaded = false;
  /** A sort picked before the user's settings came in: theirs wins. */
  private picked = false;

  constructor(
    /** The user-settings key it's kept under. */
    private readonly settingKey: string,
    /** The keys of the columns it may sort by (a saved sort on another is dropped). */
    private readonly keys: () => string[],
    private readonly ctx: WidgetContext,
    private readonly destroyRef: DestroyRef,
    /** Re-render the dashboard once the saved sort is in. */
    private readonly changed: () => void,
    readonly defaultSort: DataTableSort | null = null
  ) {
    this.sort = defaultSort;
  }

  /** The user's saved sort, read once (its table shows). */
  load(): void {
    if (this.loaded) {
      return;
    }
    this.loaded = true;
    readUserSettings(this.ctx, this.destroyRef, (settings) => {
      if (this.picked) {
        return;
      }
      const saved = settings?.[this.settingKey];
      if (saved === null) {
        this.sort = null;
      } else if (saved && typeof saved === "object" && this.keys().includes(saved.key) && (saved.direction === "asc" || saved.direction === "desc")) {
        this.sort = { key: saved.key, direction: saved.direction };
      }
      this.changed();
    });
  }

  /** A header click: the sort shown at once and kept in the user's settings (null: cleared). */
  pick(sort: DataTableSort | null): void {
    this.picked = true;
    this.sort = sort;
    saveUserSettings(this.ctx, this.destroyRef, { [this.settingKey]: sort });
  }
}

/**
 * A table's on / off view option (Access › Groups' "Similarity grouping"),
 * kept in the user's settings: its default until theirs comes in (read once,
 * as its page first shows) — a switch flipped first wins.
 *
 * ```html
 * <tb-ext-switch [ngModel]="option.on" (ngModelChange)="option.set($event)"></tb-ext-switch>
 * ```
 */
export class SavedToggle {
  /** Whether it's on, as shown. */
  on: boolean;
  private loaded = false;
  private picked = false;

  constructor(
    /** The user-settings key it's kept under. */
    private readonly settingKey: string,
    private readonly ctx: WidgetContext,
    private readonly destroyRef: DestroyRef,
    /** Re-render the dashboard once the saved value is in. */
    private readonly changed: () => void,
    readonly defaultOn = false
  ) {
    this.on = defaultOn;
  }

  /** The user's saved value, read once (its page shows). */
  load(): void {
    if (this.loaded) {
      return;
    }
    this.loaded = true;
    readUserSettings(this.ctx, this.destroyRef, (settings) => {
      const saved = settings?.[this.settingKey];
      if (this.picked || typeof saved !== "boolean") {
        return;
      }
      this.on = saved;
      this.changed();
    });
  }

  /** The switch flipped: shown at once and kept in the user's settings. */
  set(on: boolean): void {
    this.picked = true;
    this.on = on;
    saveUserSettings(this.ctx, this.destroyRef, { [this.settingKey]: on });
  }
}
