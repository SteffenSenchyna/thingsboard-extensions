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

import { Component, EventEmitter, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";
import { CheckboxComponent } from "../checkbox/checkbox.component";
import { FilterListOption, filterOptionLabel } from "../filter-list/filter-list.component";
import { FilterSectionComponent } from "../filter-section/filter-section.component";

/**
 * A short filter group for the sidebar: a `tb-filter-section` (divider, heading,
 * collapse chevron) over a plain list of checkboxes with counts — for a handful of options, where
 * `tb-filter-list`'s search / selected / footer would be overkill. Nothing
 * checked means no filter (show everything). Options read like a filter list's
 * (a 0 count doesn't grey an option out); `disabled` options are greyed.
 *
 * ```html
 * <tb-check-filter heading="Type" [options]="typeOptions" [(selected)]="types"></tb-check-filter>
 * ```
 */
@Component({
  selector: "tb-check-filter",
  templateUrl: "./check-filter.component.html",
  styleUrls: ["./check-filter.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, CheckboxComponent, FilterSectionComponent],
})
export class CheckFilterComponent {
  @Input() heading = "";
  /** Divider above the group (see `tb-filter-section`). */
  @Input() divider = true;
  @Input() options: FilterListOption[] = [];
  /** Checked option ids (two-way bindable). */
  @Input() selected: string[] = [];
  @Output() selectedChange = new EventEmitter<string[]>();

  /** "Users (3)" — the count follows the label inline, as in every sidebar filter. */
  readonly labelOf = filterOptionLabel;

  isChecked(id: string): boolean {
    return this.selected.includes(id);
  }

  isDisabled(o: FilterListOption): boolean {
    return !!o.disabled;
  }

  toggle(id: string): void {
    this.selected = this.isChecked(id) ? this.selected.filter((s) => s !== id) : [...this.selected, id];
    this.selectedChange.emit(this.selected);
  }

  trackById(_: number, o: FilterListOption): string {
    return o.id;
  }
}
