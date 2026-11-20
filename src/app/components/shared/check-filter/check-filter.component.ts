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

import { Component, EventEmitter, HostBinding, Input, OnChanges, OnDestroy, Optional, Output, SimpleChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";
import { CheckboxComponent } from "../checkbox/checkbox.component";
import { FilterListOption, filterOptionLabel } from "../filter-list/filter-list.component";
import { FilterSectionComponent } from "../filter-section/filter-section.component";
import { FilterSectionsState } from "../filter-sections/filter-sections.component";

/**
 * A short filter group for the sidebar: a `tb-filter-section` (divider, heading,
 * collapse chevron) over a plain list of checkboxes with counts — for a handful of options, where
 * `tb-filter-list`'s search / selected / footer would be overkill. Nothing
 * checked means no filter (show everything). Options read like a filter list's:
 * a 0 count greys an option out unless it's checked (so it can still be
 * cleared), and `disabled` options are always greyed.
 *
 * ```html
 * <tb-check-filter heading="Types" [options]="typeOptions" [(selected)]="types"></tb-check-filter>
 * ```
 */
@Component({
  selector: "tb-check-filter",
  templateUrl: "./check-filter.component.html",
  styleUrls: ["./check-filter.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, CheckboxComponent, FilterSectionComponent],
})
export class CheckFilterComponent implements OnChanges, OnDestroy {
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
      this.seen = new Set(this.options.filter((o) => o.count !== 0).map((o) => o.id));
      this.snapshot = true;
    }
  }

  ngOnDestroy(): void {
    this.sections?.forget(this);
  }

  /**
   * The options shown: all — or, empty ones hidden, those with something in
   * them (the snapshot: picking other filters only greys an option out at 0)
   * or checked; none: the section goes.
   */
  get shownOptions(): FilterListOption[] {
    return this.sections?.hideEmpty ? this.options.filter((o) => this.seen.has(o.id) || this.isChecked(o.id)) : this.options;
  }

  /** Nothing to show: no box either — the sidebar's gap between its items would stand in for it. */
  @HostBinding("class.tbcf-none") get none(): boolean {
    return !this.shownOptions.length;
  }

  @Input() heading = "";
  /** Divider above the group (see `tb-filter-section`). */
  @Input() divider = true;
  /** The section open (its rows shown); collapsed shows only the heading. */
  @Input() open = true;
  @Input() options: FilterListOption[] = [];
  /** Checked option ids (two-way bindable). */
  @Input() selected: string[] = [];
  @Output() selectedChange = new EventEmitter<string[]>();
  /** A text link at the end of every row ("Configure"); its click emits the option's id on {@link action}. */
  @Input() actionLabel = "";
  @Output() action = new EventEmitter<string>();
  /** Print each option's count after its label (on to start); off, the counts still grey an option out and hide empty ones. */
  @Input() showCounts = true;

  /** "Users (3)" — the count follows the label inline, as in every sidebar filter — unless {@link showCounts} is off. */
  labelOf(o: FilterListOption): string {
    return this.showCounts ? filterOptionLabel(o) : o.label;
  }

  isChecked(id: string): boolean {
    return this.selected.includes(id);
  }

  /** Greyed out: marked `disabled`, or a 0 count unless it's checked. */
  isDisabled(o: FilterListOption): boolean {
    return !!o.disabled || (o.count === 0 && !this.isChecked(o.id));
  }

  toggle(id: string): void {
    this.selected = this.isChecked(id) ? this.selected.filter((s) => s !== id) : [...this.selected, id];
    // Reported now, before the other filters recount.
    this.sections?.picked(this, this.selected.length > 0);
    this.selectedChange.emit(this.selected);
  }

  /** A click on the row's own area toggles it; the box and the action (buttons) handle their own clicks. */
  onRowClick(o: FilterListOption, event: Event): void {
    if ((event.target as HTMLElement | null)?.closest("button") || this.isDisabled(o)) {
      return;
    }
    this.toggle(o.id);
  }

  trackById(_: number, o: FilterListOption): string {
    return o.id;
  }
}
