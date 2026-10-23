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

/**
 * A sidebar filter group: a divider line on top (between sections), a heading with a collapse
 * chevron, and the filter itself (projected) underneath — the frame every
 * sidebar filter sits in (`tb-check-filter` uses it for its checkboxes; wrap a
 * `tb-filter-list` in one to title it).
 *
 * ```html
 * <tb-filter-section heading="Markets" [grow]="listExpanded">
 *   <tb-filter-list … [(expanded)]="listExpanded"></tb-filter-list>
 * </tb-filter-section>
 * ```
 */
@Component({
  selector: "tb-filter-section",
  templateUrl: "./filter-section.component.html",
  styleUrls: ["./filter-section.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule],
})
export class FilterSectionComponent {
  @Input() heading = "";
  /** Expanded (two-way bindable); collapsed shows only the heading. */
  @Input() open = true;
  @Output() openChange = new EventEmitter<boolean>();
  /** Divider line above the section — off for the first section under other content. */
  @Input() @HostBinding("class.tbfs-divider") divider = true;
  /** Take the column's spare height — bind to the projected filter list's `expanded`. */
  @Input() @HostBinding("class.tbfs-grow") grow = false;

  toggle(): void {
    this.open = !this.open;
    this.openChange.emit(this.open);
  }
}
