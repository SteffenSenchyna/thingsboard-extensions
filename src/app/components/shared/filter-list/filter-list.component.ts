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

import { Component, EventEmitter, Input, OnChanges, OnDestroy, Optional, Output, SimpleChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";
import { CheckboxComponent } from "../checkbox/checkbox.component";
import { FilterSectionsState } from "../filter-sections/filter-sections.component";

/** An option in {@link FilterListComponent} — a leaf, or a parent of child options. */
export interface FilterListOption {
  id: string;
  label: string;
  /**
   * Muted count after the label, e.g. how many items the option matches. A 0
   * count greys the option out (it matches nothing) unless it's selected —
   * the default in every filter (`tb-filter-list`, `tb-check-filter`).
   */
  count?: number;
  /** Greyed out and not selectable, whatever its count. */
  disabled?: boolean;
  /**
   * Child options (any depth). A parent with children is a group toggle: its
   * checkbox is checked / partial / empty from its children and selects or
   * clears them all — only leaf ids are emitted (and {@link selectable}
   * parents' own). An empty array = a leaf.
   */
  children?: FilterListOption[];
  /**
   * A parent that is a value itself (a product line with groups of its own):
   * its box picks its own id along with everything under it.
   */
  selectable?: boolean;
}

/** An option's label with its count right after it: "Development (2)" (every sidebar filter). */
export function filterOptionLabel(o: FilterListOption): string {
  return o.count === undefined || o.count === null ? o.label : `${o.label} (${o.count})`;
}

/** A rendered row of the (possibly tree-shaped) list. */
interface FilterListNode {
  option: FilterListOption;
  /** Children shown under it (after the search), as rows of their own. */
  children: FilterListNode[];
  expanded: boolean;
}

/** A removable chip in the "Selected" row. */
interface FilterListChip {
  key: string;
  label: string;
  /** Leaf ids the chip stands for (a fully-selected parent = all its children). */
  ids: string[];
}

/**
 * Multi-select filter card — flat or a tree (any depth: the top level folds,
 * deeper levels show open, each a step further in):
 * - a search field matching parents and children (matches auto-expand);
 * - a "Selected (n)" row that expands to the selection as removable chips (a
 *   fully-selected parent shows as one chip);
 * - a scrolling checkbox list with counts; parents expand/collapse and toggle
 *   all their children;
 * - a footer with "Select all" and "Reset".
 *
 * Inside a `tb-filter-sections` with "Hide empty filters" on, its empty
 * options are left out: those with nothing in them (nothing picked in them)
 * as of its snapshot — taken while no other filter has picks, its counts then
 * the totals — so picking other filters only greys an option out at 0.
 *
 * {@link selected} holds leaf ids only (and {@link FilterListOption.selectable}
 * parents' own); empty means "no filter" to the consumer.
 * An option with a 0 count is greyed out and can't be picked, unless it's
 * selected (a parent: any of its children), so it can still be cleared
 * ({@link isDisabled}).
 *
 * `[multiple]="false"` makes it a single-choice list: radio buttons (flat options
 * only), each click selects exactly that option, and the "Selected (n)" row and
 * the "Select all" / "Reset" links are hidden.
 *
 * ```html
 * <tb-filter-list heading="Markets" [options]="markets"
 *                 [(selected)]="selectedSites"></tb-filter-list>
 * ```
 */
@Component({
  selector: "tb-filter-list",
  templateUrl: "./filter-list.component.html",
  styleUrls: ["./filter-list.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, CheckboxComponent],
})
export class FilterListComponent implements OnChanges, OnDestroy {
  /** "Hide empty filters": the options with something in them, as of the last snapshot (taken while no other filter has picks). */
  private seen = new Set<string>();
  private snapshot = false;

  /** Inside a `tb-filter-sections`: whether its empty options are hidden ("Hide empty filters"). */
  constructor(@Optional() private readonly sections: FilterSectionsState | null) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["selected"]) {
      this.sections?.picked(this, this.selected.length > 0);
    }
    // The counts are the totals while no other filter has picks: the snapshot follows them; else it holds.
    if (changes["options"] && (!this.snapshot || !this.sections?.othersPicked(this))) {
      const seen = new Set<string>();
      const note = (list: FilterListOption[]) =>
        list.forEach((o) => {
          if (o.count !== 0) {
            seen.add(o.id);
          }
          note(o.children ?? []);
        });
      note(this.options);
      this.seen = seen;
      this.snapshot = true;
    }
  }

  ngOnDestroy(): void {
    this.sections?.forget(this);
  }

  readonly labelOf = filterOptionLabel;
  /** Optional heading above the card. */
  @Input() heading = "";
  @Input() options: FilterListOption[] = [];
  /** Checked leaf ids. */
  @Input() selected: string[] = [];
  @Input() searchPlaceholder = "Search";
  @Input() emptyText = "No matches";
  /** Multi-select checkboxes (default) or a single-choice radio list. */
  @Input() multiple = true;
  @Output() selectedChange = new EventEmitter<string[]>();

  search = "";
  /** Show the selection as chips under the "Selected (n)" row. */
  selectedOpen = false;
  /** Parents the user collapsed (parents start expanded). */
  private collapsed = new Set<string>();

  /** Whether any option has children (leaf rows then indent to align with parents). */
  get isTree(): boolean {
    return this.options.some((o) => this.hasChildren(o));
  }

  /** Rows after the search: a parent matching shows all under it; a child
   *  matching shows under its (auto-expanded) parents. */
  get visibleNodes(): FilterListNode[] {
    const q = this.search.trim().toLowerCase();
    return this.options.map((o) => this.nodeOf(o, q, 0, false)).filter((n): n is FilterListNode => !!n);
  }

  /** The selection as chips: one per fully-selected parent, else per selected leaf (and selectable parent). */
  get chips(): FilterListChip[] {
    return this.options.flatMap((o) => this.chipsOf(o));
  }

  hasChildren(o: FilterListOption): boolean {
    return !!o.children?.length;
  }

  isSelected(id: string): boolean {
    return this.selected.includes(id);
  }

  /** Checkbox state: true / false, or null (partial) for a partly-selected parent. */
  state(o: FilterListOption): boolean | null {
    if (!this.hasChildren(o)) {
      return this.isSelected(o.id);
    }
    const leaves = this.leafIds(o);
    const n = leaves.filter((id) => this.isSelected(id)).length;
    return n === 0 ? false : n === leaves.length ? true : null;
  }

  /**
   * Greyed out and not selectable: marked {@link FilterListOption.disabled},
   * or a 0 count (it matches nothing) — unless it's selected (a parent: any
   * under it), so it can still be cleared.
   */
  isDisabled(o: FilterListOption): boolean {
    if (o.disabled) {
      return true;
    }
    return o.count === 0 && !this.anySelected(o);
  }

  /** The ids a box picks: a leaf's own; a parent's every selectable leaf under it (and its own, when {@link FilterListOption.selectable}). */
  leafIds(o: FilterListOption): string[] {
    if (!this.hasChildren(o)) {
      return this.isDisabled(o) ? [] : [o.id];
    }
    const own = o.selectable && !this.isDisabled(o) ? [o.id] : [];
    return [...own, ...o.children!.flatMap((c) => this.leafIds(c))];
  }

  /** The option or one under it is selected. */
  private anySelected(o: FilterListOption): boolean {
    return this.isSelected(o.id) || (o.children ?? []).some((c) => this.anySelected(c));
  }

  /** An option's row after the search (null: nothing in it matches); `shown`: a matching ancestor shows it all. Only the top level folds. */
  private nodeOf(o: FilterListOption, q: string, depth: number, shown: boolean): FilterListNode | null {
    // Empty options hidden ("Hide empty filters"): nothing in it as of the snapshot (taken while no other filter has picks),
    // nothing picked in it — picking other filters only greys an option out at 0.
    if (this.sections?.hideEmpty && !this.seen.has(o.id) && !this.anySelected(o)) {
      return null;
    }
    const kids = o.children ?? [];
    const all = !q || shown || o.label.toLowerCase().includes(q);
    const children = kids.map((c) => this.nodeOf(c, q, depth + 1, all)).filter((n): n is FilterListNode => !!n);
    if (!all && !children.length) {
      return null;
    }
    return { option: o, children, expanded: q ? true : depth > 0 || !this.collapsed.has(o.id) };
  }

  /** An option's chips: itself when fully selected (a parent: as one chip), else its selected own id and its children's. */
  private chipsOf(o: FilterListOption): FilterListChip[] {
    if (!this.hasChildren(o)) {
      return this.isSelected(o.id) ? [{ key: o.id, label: o.label, ids: [o.id] }] : [];
    }
    if (this.state(o) === true) {
      return [{ key: o.id, label: o.label, ids: this.leafIds(o) }];
    }
    const own = o.selectable && this.isSelected(o.id) ? [{ key: o.id, label: o.label, ids: [o.id] }] : [];
    return [...own, ...o.children!.flatMap((c) => this.chipsOf(c))];
  }

  /** Toggle an option: a parent selects all its children, or clears them when all are selected. */
  toggle(o: FilterListOption): void {
    const leaves = this.leafIds(o);
    const allOn = leaves.length > 0 && leaves.every((id) => this.isSelected(id));
    this.emit(allOn ? this.selected.filter((id) => !leaves.includes(id)) : [...new Set([...this.selected, ...leaves])]);
  }

  /** A click on a row's own area toggles (or, single-choice, picks) it; its box, radio and twisty (buttons) handle their own clicks. */
  onRowClick(o: FilterListOption, event: Event): void {
    if ((event.target as HTMLElement | null)?.closest("button") || this.isDisabled(o)) {
      return;
    }
    if (this.multiple) {
      if (this.leafIds(o).length) {
        this.toggle(o);
      }
    } else {
      this.pick(o);
    }
  }

  toggleCollapsed(id: string): void {
    if (this.collapsed.has(id)) {
      this.collapsed.delete(id);
    } else {
      this.collapsed.add(id);
    }
  }

  removeChip(chip: FilterListChip): void {
    this.emit(this.selected.filter((id) => !chip.ids.includes(id)));
  }

  /** Check every enabled leaf. */
  selectAll(): void {
    this.emit(this.options.flatMap((o) => this.leafIds(o)));
  }

  /** Single-choice mode: select just this option. */
  pick(o: FilterListOption): void {
    if (!this.isDisabled(o) && !(this.selected.length === 1 && this.selected[0] === o.id)) {
      this.emit([o.id]);
    }
  }

  reset(): void {
    this.emit([]);
  }

  trackByNode(_: number, n: FilterListNode): string {
    return n.option.id;
  }

  trackById(_: number, o: { id?: string; key?: string }): string {
    return (o.id ?? o.key)!;
  }

  private emit(ids: string[]): void {
    this.selected = ids;
    // Reported now, before the other filters recount.
    this.sections?.picked(this, ids.length > 0);
    this.selectedChange.emit(ids);
  }
}
