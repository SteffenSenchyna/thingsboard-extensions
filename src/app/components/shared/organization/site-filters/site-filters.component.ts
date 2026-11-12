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


import { Component, DoCheck, Input } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FilterSectionsComponent } from "../../filter-sections/filter-sections.component";
import { SettingsFiltersComponent } from "../../settings-filters/settings-filters.component";
import { OrgFilterOptions, SiteFacet, SiteFilter, orgFilterOptions } from "../organization.models";
import { OrganizationStore } from "../organization-store";
import { OrgFiltersComponent } from "../org-filters/org-filters.component";

/**
 * The Sites page's filters: a column beside the Settings page's section menu
 * (as the Access pages'): the table's search, then — under "Hide empty
 * filters" — the product line and the market (`tb-org-filters`, as every
 * filter column's); each option counted under the other
 * filter, "Clear filters" and "Customize columns" at the foot (the Sites
 * table's columns: the picker opens beside the filters). The filters, the
 * columns and the picker live in the {@link OrganizationStore} (`siteFilter`,
 * `siteColumns`, `columnPickerOpen`): the Sites table shows what passes.
 * `tb-settings-sidebar` places it on Organization › Sites (its width:
 * `settingsSidebarWidth`).
 */
@Component({
  selector: "tb-site-filters",
  templateUrl: "./site-filters.component.html",
  styleUrls: ["./site-filters.component.scss"],
  standalone: true,
  imports: [CommonModule, FilterSectionsComponent, OrgFiltersComponent, SettingsFiltersComponent],
})
export class SiteFiltersComponent implements DoCheck {
  @Input() store!: OrganizationStore;
  /** The Product line and Market filters' options (`tb-org-filters`). */
  orgOptions: OrgFilterOptions = { productLines: [], markets: [] };
  private seen: unknown[] = [];

  get filter(): SiteFilter {
    return this.store.siteFilter;
  }

  /** The options and their counts, rebuilt when the lists or the filters change. */
  ngDoCheck(): void {
    const s = this.store;
    if (!s) {
      return;
    }
    const inputs = [s.sites.rows, s.productLines.rows, s.markets.rows, s.siteFilter];
    if (inputs.every((x, i) => x === this.seen[i])) {
      return;
    }
    this.seen = inputs;
    const sites = s.sites.rows;
    /** How many sites the other filter lets through carry this value — or, `also`, any of these (a parent line's subtree). */
    const counter = (facet: SiteFacet) => {
      const passing = sites.filter((x) => s.sitePasses(x, s.siteFilter, facet));
      return (value: string, also: string[] = []) => passing.filter((x) => s.siteFacets(x)[facet].some((v) => v === value || also.includes(v))).length;
    };
    this.orgOptions = orgFilterOptions(s.productLines.rows, s.markets.rows, counter("productLines"), counter("markets"));
  }

  set(patch: Partial<SiteFilter>): void {
    this.store.setSiteFilter(patch);
  }
}
