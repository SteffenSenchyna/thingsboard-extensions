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
import { SharedModule } from "@shared/public-api";
import { CheckboxComponent } from "../checkbox/checkbox.component";

/** An option in {@link FilterListComponent} — a leaf, or a parent of child options. */
export interface FilterListOption {
  id: string;
  label: string;
  /** Muted count after the label, e.g. how many items the option matches. */
  count?: number;
  /** Greyed out and not selectable. */
  disabled?: boolean;
  /**
   * Child options (one level). A parent with children is a group toggle: its
   * checkbox is checked / partial / empty from its children and selects or
   * clears them all — only leaf ids are ever emitted. An empty array = a leaf.
   */
  children?: FilterListOption[];
}

/** An option's label with its count right after it: "Development (2)" (every sidebar filter). */
export function filterOptionLabel(o: FilterListOption): string {
  return o.count === undefined || o.count === null ? o.label : `${o.label} (${o.count})`;
}

/** A rendered row of the (possibly tree-shaped) list. */
interface FilterListNode {
  option: FilterListOption;
  /** Children shown under it (after the search). */
  children: FilterListOption[];
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
 * Multi-select filter card — flat or a one-level tree:
 * - a search field matching parents and children (matches auto-expand);
 * - a "Selected (n)" row that expands to the selection as removable chips (a
 *   fully-selected parent shows as one chip);
 * - a scrolling checkbox list with counts; parents expand/collapse and toggle
 *   all their children;
 * - a footer with "Select all", "Reset" and an expand button that stretches the
 *   card to fill its column (host must be a flex child of a bounded column).
 *
 * {@link selected} holds leaf ids only; empty means "no filter" to the consumer.
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
export class FilterListComponent {
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
  /** Stretch the card to its column's full height (two-way bindable). */
  @Input() @HostBinding("class.tbfl-expanded") expanded = false;
  @Output() selectedChange = new EventEmitter<string[]>();
  @Output() expandedChange = new EventEmitter<boolean>();

  search = "";
  /** Show the selection as chips under the "Selected (n)" row. */
  selectedOpen = false;
  /** Parents the user collapsed (parents start expanded). */
  private collapsed = new Set<string>();

  /** Whether any option has children (leaf rows then indent to align with parents). */
  get isTree(): boolean {
    return this.options.some((o) => this.hasChildren(o));
  }

  /** Rows after the search: a parent matching shows all its children; a child
   *  matching shows under its (auto-expanded) parent. */
  get visibleNodes(): FilterListNode[] {
    const q = this.search.trim().toLowerCase();
    const matches = (o: FilterListOption) => o.label.toLowerCase().includes(q);
    const nodes: FilterListNode[] = [];
    for (const o of this.options) {
      const kids = o.children ?? [];
      if (!q) {
        nodes.push({ option: o, children: kids, expanded: !this.collapsed.has(o.id) });
      } else if (matches(o)) {
        nodes.push({ option: o, children: kids, expanded: true });
      } else {
        const hits = kids.filter(matches);
        if (hits.length) {
          nodes.push({ option: o, children: hits, expanded: true });
        }
      }
    }
    return nodes;
  }

  /** The selection as chips: one per fully-selected parent, else per selected leaf. */
  get chips(): FilterListChip[] {
    const chips: FilterListChip[] = [];
    for (const o of this.options) {
      if (!this.hasChildren(o)) {
        if (this.isSelected(o.id)) {
          chips.push({ key: o.id, label: o.label, ids: [o.id] });
        }
        continue;
      }
      if (this.state(o) === true) {
        chips.push({ key: o.id, label: o.label, ids: this.leafIds(o) });
      } else {
        o.children!.filter((c) => this.isSelected(c.id)).forEach((c) => chips.push({ key: c.id, label: c.label, ids: [c.id] }));
      }
    }
    return chips;
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

  /** Selectable leaf ids under an option (itself when it's a leaf). */
  leafIds(o: FilterListOption): string[] {
    return this.hasChildren(o) ? o.children!.filter((c) => !c.disabled).map((c) => c.id) : o.disabled ? [] : [o.id];
  }

  /** Toggle an option: a parent selects all its children, or clears them when all are selected. */
  toggle(o: FilterListOption): void {
    const leaves = this.leafIds(o);
    const allOn = leaves.length > 0 && leaves.every((id) => this.isSelected(id));
    this.emit(allOn ? this.selected.filter((id) => !leaves.includes(id)) : [...new Set([...this.selected, ...leaves])]);
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
    if (!o.disabled && !(this.selected.length === 1 && this.selected[0] === o.id)) {
      this.emit([o.id]);
    }
  }

  reset(): void {
    this.emit([]);
  }

  toggleExpanded(): void {
    this.expanded = !this.expanded;
    this.expandedChange.emit(this.expanded);
  }

  trackByNode(_: number, n: FilterListNode): string {
    return n.option.id;
  }

  trackById(_: number, o: { id?: string; key?: string }): string {
    return (o.id ?? o.key)!;
  }

  private emit(ids: string[]): void {
    this.selected = ids;
    this.selectedChange.emit(ids);
  }
}
