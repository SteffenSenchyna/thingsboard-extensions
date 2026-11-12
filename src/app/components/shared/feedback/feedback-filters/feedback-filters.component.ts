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
import { CheckFilterComponent } from "../../check-filter/check-filter.component";
import type { FilterListOption } from "../../filter-list/filter-list.component";
import { FilterSectionsComponent } from "../../filter-sections/filter-sections.component";
import { SettingsFiltersComponent } from "../../settings-filters/settings-filters.component";
import { OrgFiltersComponent } from "../../organization/org-filters/org-filters.component";
import { OrgFilterOptions, orgFilterOptions } from "../../organization/organization.models";
import { FeedbackStore } from "../feedback-store";
import { FEEDBACK_STATUSES, FEEDBACK_TYPES, FeedbackFacet, FeedbackFilter } from "../feedback.models";

/**
 * Settings › Feedback's filters: a column beside the table (as Organization ›
 * Sites'): the table's search, then — under "Hide empty filters" — the status,
 * the kind, the app it was sent from, and the sender's product line and
 * market (`tb-org-filters`, as every filter column's); each option counted
 * under the other filters, "Clear filters" and
 * "Customize columns" at the foot. The filters and the columns live in the
 * {@link FeedbackStore}; `tb-settings-sidebar` places it on the Feedback page.
 */
@Component({
  selector: "tb-feedback-filters",
  templateUrl: "./feedback-filters.component.html",
  styleUrls: ["./feedback-filters.component.scss"],
  standalone: true,
  imports: [CommonModule, CheckFilterComponent, FilterSectionsComponent, OrgFiltersComponent, SettingsFiltersComponent],
})
export class FeedbackFiltersComponent implements DoCheck {
  @Input() store!: FeedbackStore;
  statusOptions: FilterListOption[] = [];
  typeOptions: FilterListOption[] = [];
  appOptions: FilterListOption[] = [];
  /** The Product line and Market filters' options (`tb-org-filters`). */
  orgOptions: OrgFilterOptions = { productLines: [], markets: [] };
  private seen: unknown[] = [];

  get filter(): FeedbackFilter {
    return this.store.filter;
  }

  /** The options and their counts, rebuilt when the items, their senders, the Organization's lists or the filters change. */
  ngDoCheck(): void {
    const s = this.store;
    if (!s) {
      return;
    }
    const inputs = [s.entries, s.sendersVersion, s.filter, s.org?.productLines.rows, s.org?.markets.rows];
    if (inputs.every((x, i) => x === this.seen[i])) {
      return;
    }
    this.seen = inputs;
    /** How many items the other filters let through carry this value — or, `also`, any of these (a parent line's subtree). */
    const counter = (facet: FeedbackFacet) => {
      const passing = s.entries.filter((e) => s.passes(e, s.filter, facet));
      return (value: string, also: string[] = []) => passing.filter((e) => s.facets(e)[facet].some((v) => v === value || also.includes(v))).length;
    };
    const statusCount = counter("statuses");
    this.statusOptions = FEEDBACK_STATUSES.map((x) => ({ id: x.id, label: x.label, count: statusCount(x.id) }));
    const typeCount = counter("types");
    this.typeOptions = FEEDBACK_TYPES.map((x) => ({ id: x.id, label: x.label, count: typeCount(x.id) }));
    // The apps items were sent from (Home first, the others by name); "Unknown" — sent before the app was kept.
    const appCount = counter("apps");
    const apps = [...new Set(s.entries.map((e) => s.appOf(e)))].sort((a, b) => (a === "Home" ? -1 : b === "Home" ? 1 : !a ? 1 : !b ? -1 : a.localeCompare(b)));
    this.appOptions = apps.map((a) => ({ id: a, label: a || "Unknown", count: appCount(a) }));
    this.orgOptions = orgFilterOptions(s.org?.productLines.rows ?? [], s.org?.markets.rows ?? [], counter("productLines"), counter("markets"));
  }

  set(patch: Partial<FeedbackFilter>): void {
    this.store.setFilter(patch);
  }
}
