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

import { Component, ElementRef, EventEmitter, HostBinding, Input, OnChanges, OnDestroy, Optional, Output, SimpleChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";
import { CheckboxComponent } from "../checkbox/checkbox.component";
import { SwitchComponent } from "../switch/switch.component";
import { FilterSectionsState } from "../filter-sections/filter-sections.component";

/** An option in {@link FilterListComponent} — a leaf, or a parent of child options. */
export interface FilterListOption {
  id: string;
  label: string;
  /** Its chip's text under "Selected" (a person's name where the row also shows their email); none — the label. */
  chipLabel?: string;
  /**
   * Muted count after the label, e.g. how many items the option matches. A 0
   * count greys the option out (it matches nothing) unless it's selected —
   * the default in every filter (`tb-filter-list`, `tb-check-filter`).
   */
  count?: number;
  /** A parent's own count (its children's not in it) — its count in the flat list (`treeToggle` off); none: {@link count}. */
  ownCount?: number;
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
  imports: [CommonModule, SharedModule, CheckboxComponent, SwitchComponent],
})
export class FilterListComponent implements OnChanges, OnDestroy {
  /** "Hide empty filters": the options with something in them, as of the last snapshot (taken while no other filter has picks). */
  private seen = new Set<string>();
  /** …and those with something of their own (a parent: without its children's) — the flat list's (`treeToggle` off). */
  private seenOwn = new Set<string>();
  private snapshot = false;

  /** A label cut with "…" — the one hovered (or last hovered): its full text, and where the label sits in the host (its bubble's anchor). */
  cut = { text: "", left: 0, top: 0, width: 0, height: 0 };
  /** Its bubble shows: the pointer is on a cut label. */
  cutShown = false;

  /** Inside a `tb-filter-sections`: whether its empty options are hidden ("Hide empty filters"). */
  constructor(
    @Optional() private readonly sections: FilterSectionsState | null,
    private readonly host: ElementRef<HTMLElement>
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["selected"]) {
      this.sections?.picked(this, this.selected.length > 0);
    }
    // The counts are the totals while no other filter has picks: the snapshot follows them; else it holds.
    if (changes["options"] && (!this.snapshot || !this.sections?.othersPicked(this))) {
      const seen = new Set<string>();
      const seenOwn = new Set<string>();
      const note = (list: FilterListOption[]) =>
        list.forEach((o) => {
          if (o.count !== 0) {
            seen.add(o.id);
          }
          if ((o.ownCount ?? o.count) !== 0) {
            seenOwn.add(o.id);
          }
          note(o.children ?? []);
        });
      note(this.options);
      this.seen = seen;
      this.seenOwn = seenOwn;
      this.snapshot = true;
    }
  }

  ngOnDestroy(): void {
    this.sections?.forget(this);
  }

  /** An option's label as shown: its count after it ({@link filterOptionLabel}), unless {@link showCounts} is off. */
  labelOf(o: FilterListOption): string {
    return this.showCounts ? filterOptionLabel(o) : o.label;
  }

  /** A row hovered: when its label is cut with "…", its full text in the bubble above it (as a table's cut cell). */
  showCut(option: FilterListOption, event: MouseEvent): void {
    const label = (event.currentTarget as HTMLElement).querySelector<HTMLElement>(".cb-label, .tbfl-radio-label");
    if (!label || label.scrollWidth <= label.clientWidth + 1) {
      this.cutShown = false;
      return;
    }
    const box = this.host.nativeElement.getBoundingClientRect();
    const at = label.getBoundingClientRect();
    this.cut = { text: this.labelOf(option), left: at.left - box.left, top: at.top - box.top, width: at.width, height: at.height };
    this.cutShown = true;
  }

  /** The pointer left the row, or the list scrolled under it. */
  hideCut(): void {
    this.cutShown = false;
  }
  /** Optional heading above the card. */
  @Input() heading = "";
  @Input() options: FilterListOption[] = [];
  /** Checked leaf ids. */
  @Input() selected: string[] = [];
  @Input() searchPlaceholder = "Search";
  @Input() emptyText = "No matches";
  /** Multi-select checkboxes (default) or a single-choice radio list. */
  @Input() multiple = true;
  /**
   * An outside filter (filter selects above the list): only these options'
   * rows show (null: all). The selection and its chips keep every option;
   * "Select all" and "Reset" act on the rows shown.
   */
  @Input() shownIds: Set<string> | null = null;
  /**
   * A tree's "Tree grouping" switch (on to start), above the search: off,
   * its options as one flat list by name — a parent that's a value of its own
   * ({@link FilterListOption.selectable}) a row of its own, its own count
   * ({@link FilterListOption.ownCount}); a parent that's only a heading drops
   * out (its children stay). The selection is the same ids either way.
   */
  @Input() treeToggle = false;
  /**
   * In a form (a user's plants): the box takes a field's fill — the dashboard's surface, as the form's selects and
   * inputs — instead of showing the card it sits on. Off (a sidebar's filter): no fill, on the dashboard background.
   */
  @Input() @HostBinding("class.tbfl-field") field = false;
  /**
   * Print each option's count after its label (on to start). Off (a list of thousands of events — the fuel Activity page's
   * Pumps), the counts still grey an option out at 0 and drive "Hide empty filters"; only the numbers go.
   */
  @Input() showCounts = true;
  @Output() selectedChange = new EventEmitter<string[]>();

  /** {@link treeToggle}: shown as the tree (on) or the flat list (off). */
  treeOn = true;
  private flat?: { options: FilterListOption[]; list: FilterListOption[] };

  search = "";
  /** Show the selection as chips under the "Selected (n)" row. */
  selectedOpen = false;
  /** Parents the user collapsed (parents start expanded). */
  private collapsed = new Set<string>();

  /** The options are a tree (its "Tree grouping" switch shows, with {@link treeToggle}). */
  get hasTree(): boolean {
    return this.options.some((o) => this.hasChildren(o));
  }

  /** The rows shown are a tree (leaf rows then indent to align with parents). */
  get isTree(): boolean {
    return this.hasTree && this.treeOn;
  }

  /** The options as shown: the tree — or, its grouping off ({@link treeToggle}), every value flat by name, its own count. */
  get shownOptions(): FilterListOption[] {
    if (this.treeOn || !this.hasTree) {
      return this.options;
    }
    if (this.flat?.options !== this.options) {
      const list: FilterListOption[] = [];
      const walk = (options: FilterListOption[]) =>
        options.forEach((o) => {
          if (!this.hasChildren(o) || o.selectable) {
            list.push({ id: o.id, label: o.label, chipLabel: o.chipLabel, count: o.ownCount ?? o.count, disabled: o.disabled });
          }
          walk(o.children ?? []);
        });
      walk(this.options);
      list.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
      this.flat = { options: this.options, list };
    }
    return this.flat.list;
  }

  /** Rows after the search: a parent matching shows all under it; a child
   *  matching shows under its (auto-expanded) parents. */
  get visibleNodes(): FilterListNode[] {
    const q = this.search.trim().toLowerCase();
    return this.shownOptions.map((o) => this.nodeOf(o, q, 0, false)).filter((n): n is FilterListNode => !!n);
  }

  /** The selection as chips: one per fully-selected parent, else per selected leaf (and selectable parent). */
  get chips(): FilterListChip[] {
    return this.shownOptions.flatMap((o) => this.chipsOf(o));
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
    if (this.sections?.hideEmpty && !(this.isTree ? this.seen : this.seenOwn).has(o.id) && !this.anySelected(o)) {
      return null;
    }
    const kids = o.children ?? [];
    // Hidden by the outside filter (a leaf; a parent goes when none under it shows).
    if (this.shownIds && !kids.length && !this.shownIds.has(o.id)) {
      return null;
    }
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
      return this.isSelected(o.id) ? [{ key: o.id, label: o.chipLabel ?? o.label, ids: [o.id] }] : [];
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

  /** Check every enabled leaf (with an outside filter: those shown, added to the selection). */
  selectAll(): void {
    const all = this.shownOptions.flatMap((o) => this.leafIds(o));
    this.emit(this.shownIds ? [...new Set([...this.selected, ...all.filter((id) => this.shownIds!.has(id))])] : all);
  }

  /** Single-choice mode: select just this option. */
  pick(o: FilterListOption): void {
    if (!this.isDisabled(o) && !(this.selected.length === 1 && this.selected[0] === o.id)) {
      this.emit([o.id]);
    }
  }

  /** Clear the selection (with an outside filter: of the rows shown — the hidden picks stay). */
  reset(): void {
    this.emit(this.shownIds ? this.selected.filter((id) => !this.shownIds!.has(id)) : []);
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
