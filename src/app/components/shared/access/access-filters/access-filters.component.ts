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
import { FormsModule } from "@angular/forms";
import { CheckboxComponent } from "../../checkbox/checkbox.component";
import { CheckFilterComponent } from "../../check-filter/check-filter.component";
import type { FilterListOption } from "../../filter-list/filter-list.component";
import { FilterSectionsComponent } from "../../filter-sections/filter-sections.component";
import { OrgFiltersComponent } from "../../organization/org-filters/org-filters.component";
import type { OrgFilterOptions } from "../../organization/organization.models";
import { SwitchComponent } from "../../switch/switch.component";
import { SettingsFiltersComponent } from "../../settings-filters/settings-filters.component";
import { SavedColumnChoice } from "../../dashboard/table-columns";
import { AccessFilter, AccessPage } from "../access.models";
import { AccessStore } from "../access-store";

/**
 * The Access pages' filters: a column beside the Settings page's section
 * menu (as UniFi's policy filters). Groups: the table's search,
 * "Similarity grouping" (a scope's groups folded into a row of its own, in
 * the table — the store's `groupSimilar`; a divider under it), "View default
 * groups (n)" (the default groups, hidden unless checked), then Level, Scope,
 * Product line, Market and Applications; Users: the search, then Level, Scope
 * ("No scope" too), Product line and Market; Roles: the search, then Applies
 * to, Permissions and Applications — each option counted under the
 * other filters, "Clear filters" and "Customize columns" at the foot (the
 * page's table's columns: the picker opens beside the filters). The product
 * lines as their tree: a parent picks itself with every line under it. The
 * filters, the columns and the picker live in the {@link AccessStore}
 * (`groupFilter` / `userFilter`, `groupColumns` / `userColumns`,
 * `columnPickerOpen`): the page's table shows what passes. `tb-settings-sidebar`
 * places it on an Access page (its width: `settingsSidebarWidth`).
 */
@Component({
  selector: "tb-access-filters",
  templateUrl: "./access-filters.component.html",
  styleUrls: ["./access-filters.component.scss"],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CheckboxComponent,
    CheckFilterComponent,
    FilterSectionsComponent,
    OrgFiltersComponent,
    SwitchComponent,
    SettingsFiltersComponent,
  ],
})
export class AccessFiltersComponent implements DoCheck {
  @Input() store!: AccessStore;
  @Input() page: AccessPage = "groups";
  scopeOptions: FilterListOption[] = [];
  /** The Product line and Market filters' options (`tb-org-filters`). */
  orgOptions: OrgFilterOptions = { productLines: [], markets: [] };
  appOptions: FilterListOption[] = [];
  levelOptions: FilterListOption[] = [];
  /** Roles: the actions grid's rows (Permissions). */
  actionOptions: FilterListOption[] = [];
  /** The default groups the other filters let through (the "View default groups" count). */
  defaultCount = 0;
  /** Groups: how many shown have no members (what "Hide empty groups" hides). */
  emptyCount = 0;
  private seen: unknown[] = [];

  get filter(): AccessFilter {
    return this.store.filterOf(this.page);
  }

  /** Groups: the table shows as a matrix ("Matrix" on) — the filters it doesn't use hide. */
  get matrix(): boolean {
    return this.page === "groups" && this.store.groupMatrix.on;
  }

  /** The page's table's "Customize columns" choice. */
  get columns(): SavedColumnChoice {
    return this.store.columnsOf(this.page);
  }

  /** The options and their counts, rebuilt when the page, its items, the lists, the apps or the filters change. */
  ngDoCheck(): void {
    const s = this.store;
    if (!s) {
      return;
    }
    const filter = this.filter;
    const inputs = [this.page, s.groups, s.users, s.roles, filter, s.org.productLines.rows, s.org.markets.rows, s.org.sites.rows, s.apps.applications];
    if (inputs.every((x, i) => x === this.seen[i])) {
      return;
    }
    this.seen = inputs;
    const facets = s.facetOptions(this.page, filter);
    this.scopeOptions = facets.scopes;
    this.orgOptions = { productLines: facets.productLines, markets: facets.markets };
    this.appOptions = facets.apps;
    this.levelOptions = facets.levels;
    this.actionOptions = facets.actions;
    this.defaultCount = this.page === "groups" ? s.groups.filter((g) => g.auto && s.groupPasses(g, filter, undefined, true)).length : 0;
    const showingEmpty = { ...filter, hideEmpty: false };
    this.emptyCount = this.page === "groups" ? s.groups.filter((g) => !g.members.length && s.groupPasses(g, showingEmpty)).length : 0;
  }

  set(patch: Partial<AccessFilter>): void {
    this.store.setFilter(this.page, patch);
  }
}
