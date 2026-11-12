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
import { FilterListComponent } from "../../filter-list/filter-list.component";
import { FilterSectionComponent } from "../../filter-section/filter-section.component";
import { OrgFilterOptions } from "../organization.models";

/**
 * The Product line and Market filters, one look in every filter column (Organization › Sites, the Access pages,
 * Settings › Feedback): each a folding section (`tb-filter-section`) around a searchable `tb-filter-list` — the product
 * lines as their tree (a parent picks itself with every line under it), the markets by their names. Their options come
 * from {@link orgFilterOptions} (the Organization's own lines and markets alone — no "No …" option). Placed inside a
 * column's `tb-filter-sections`, so "Hide empty filters" reaches both lists.
 *
 * ```html
 * <tb-org-filters [options]="orgOptions" [productLines]="filter.productLines" [markets]="filter.markets"
 *                 (productLinesChange)="set({ productLines: $event })" (marketsChange)="set({ markets: $event })"></tb-org-filters>
 * ```
 */
@Component({
  selector: "tb-org-filters",
  template: `<tb-filter-section heading="Product line">
      <tb-filter-list searchPlaceholder="Search" emptyText="No product lines" [treeToggle]="true" [options]="options.productLines"
                      [selected]="productLines" (selectedChange)="productLinesChange.emit($event)"></tb-filter-list>
    </tb-filter-section>
    <tb-filter-section heading="Market">
      <tb-filter-list searchPlaceholder="Search" emptyText="No markets" [options]="options.markets" [selected]="markets"
                      (selectedChange)="marketsChange.emit($event)"></tb-filter-list>
    </tb-filter-section>`,
  styles: [":host { display: contents; }"],
  standalone: true,
  imports: [FilterSectionComponent, FilterListComponent],
})
export class OrgFiltersComponent {
  @Input() options: OrgFilterOptions = { productLines: [], markets: [] };
  /** The product lines picked (ids). */
  @Input() productLines: string[] = [];
  @Input() markets: string[] = [];
  @Output() productLinesChange = new EventEmitter<string[]>();
  @Output() marketsChange = new EventEmitter<string[]>();
}
