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


import { ChangeDetectorRef, Component, DestroyRef, DoCheck, EventEmitter, Input, Output, inject } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
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
import { SegmentedControlComponent, SegmentOption } from "../../segmented-control/segmented-control.component";
import { SavedColumnChoice } from "../../dashboard/table-columns";
import { DashboardRootDirective } from "../../dashboard/dashboard-root.directive";
import { ACCESS_USERS_PAGE_LISTS, AccessFilter, AccessPage } from "../access.models";
import { AccessStore } from "../access-store";

/**
 * The Access pages' filters: a column beside the Settings page's section
 * menu (as UniFi's policy filters). The Users page's first: its lists,
 * "Users | Groups" (a button group — a pick emits {@link pageChange}, the
 * list's section; the filters under it are the list shown's). Groups: the table's search,
 * "Similarity grouping" (a scope's groups folded into a row of its own, in
 * the table — the store's `groupSimilar`; a divider under it), "View default
 * groups (n)" (the default groups, hidden unless checked), then Level, Scope,
 * Product line and Sites; Users: the search, then Level, Scope ("No scope"
 * too), Product line and Sites — the shared site tree in the Market filter's
 * place (the plants a scope covers); Roles: the search, then Applies to and
 * Permissions — each option counted under the
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
    SegmentedControlComponent,
  ],
})
export class AccessFiltersComponent implements DoCheck {
  @Input() store!: AccessStore;
  @Input() page: AccessPage = "groups";
  /** The Users page's other list picked in its button group ("users" / "groups"). */
  @Output() pageChange = new EventEmitter<AccessPage>();
  /** The Users page's button group: its lists, each its icon and name (two: both labelled, halves of the column). */
  readonly listOptions: SegmentOption[] = ACCESS_USERS_PAGE_LISTS.map((l) => ({ id: l.page, label: l.label, icon: l.icon }));
  scopeOptions: FilterListOption[] = [];
  /** The Product line and Sites filters' options (`tb-org-filters`, its Sites tree in the Markets' place). */
  orgOptions: OrgFilterOptions = { productLines: [], markets: [] };
  levelOptions: FilterListOption[] = [];
  /** Roles: the actions grid's rows (Permissions). */
  actionOptions: FilterListOption[] = [];
  /** The default groups the other filters let through (the "View default groups" count). */
  defaultCount = 0;
  /** Groups: how many shown have no members (what "Hide empty groups" hides). */
  emptyCount = 0;
  private seen: unknown[] = [];
  /** The dashboard's root: on a phone the Users page's button group is atop the page (`tb-access-settings`), not in the filters' sheet. */
  private readonly root = inject(DashboardRootDirective, { optional: true });

  constructor() {
    const cd = inject(ChangeDetectorRef);
    this.root?.changes.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe(() => cd.detectChanges());
  }

  /** Laid out for a phone: the lists' button group is atop the page instead. */
  get phone(): boolean {
    return !!this.root?.phone;
  }

  get filter(): AccessFilter {
    return this.store.filterOf(this.page);
  }

  /** The Users page — one of its two lists (its button group shows). */
  get usersPage(): boolean {
    return ACCESS_USERS_PAGE_LISTS.some((l) => l.page === this.page);
  }

  /** Groups: the table shows as a matrix ("Matrix" on) — the filters it doesn't use hide. */
  get matrix(): boolean {
    return this.page === "groups" && this.store.groupMatrix.on;
  }

  /** The page's table's "Customize columns" choice. */
  get columns(): SavedColumnChoice {
    return this.store.columnsOf(this.page);
  }

  /** The options and their counts, rebuilt when the page, its items, the lists or the filters change. */
  ngDoCheck(): void {
    const s = this.store;
    if (!s) {
      return;
    }
    const filter = this.filter;
    const org = s.org;
    const inputs = [this.page, s.groups, s.users, s.roles, filter, org.productLines.rows, org.markets.rows, org.sites.rows, org.sites.loading, org.markets.loading];
    if (inputs.every((x, i) => x === this.seen[i])) {
      return;
    }
    this.seen = inputs;
    const facets = s.facetOptions(this.page, filter);
    this.scopeOptions = facets.scopes;
    this.orgOptions = { productLines: facets.productLines, markets: facets.markets, sites: facets.sites };
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
