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
import { SectionNavComponent, SectionNavItem } from "../section-nav/section-nav.component";
import { AccessFiltersComponent } from "../access/access-filters/access-filters.component";
import { SiteFiltersComponent } from "../organization/site-filters/site-filters.component";
import { FeedbackFiltersComponent } from "../feedback/feedback-filters/feedback-filters.component";
import { FeedbackStore } from "../feedback/feedback-store";
import { FEEDBACK_SECTION } from "../feedback/feedback.models";
import { AccessStore } from "../access/access-store";
import { OrganizationStore } from "../organization/organization-store";
import { accessPageOf } from "../access/access.models";
import { SETTINGS_FILTERS_GAP, SETTINGS_SIDEBAR_WIDTH, SIDEBAR_LAYOUT_INSET, settingsFiltersWidth } from "../dashboard/table-columns";

/** A Settings section's filters column: an Access page's (its groups, users, roles), the Sites page's, Feedback's — the others have none. */
export function settingsHasFilters(section: string): boolean {
  const page = accessPageOf(section);
  return (!!page && page !== "health") || section === "sites" || section === FEEDBACK_SECTION.id;
}

/**
 * A Settings page's sidebar width (`tb-sidebar-layout [width]`) — with
 * `tb-settings-sidebar` in it: the section menu (`withMenu`), then the
 * section's filters column beside it, wider while its table's column picker
 * is open. Without a menu (Home's: the rail is it), the filters column alone
 * and the layout's room before its divider — 0 when there's none.
 */
export function settingsSidebarWidth(
  section: string,
  withMenu: boolean,
  org: OrganizationStore | null,
  access: AccessStore | null,
  feedback: FeedbackStore | null = null
): number {
  const filters = settingsHasFilters(section);
  const pickerOpen = accessPageOf(section)
    ? !!access?.columnPickerOpen
    : section === FEEDBACK_SECTION.id
      ? !!feedback?.columnPickerOpen
      : section === "sites" && !!org?.columnPickerOpen;
  if (!withMenu) {
    return filters ? settingsFiltersWidth(pickerOpen) + SIDEBAR_LAYOUT_INSET : 0;
  }
  return SETTINGS_SIDEBAR_WIDTH + (filters ? SETTINGS_FILTERS_GAP + settingsFiltersWidth(pickerOpen) : 0);
}

/**
 * The Settings page's sidebar, one for every dashboard: its section menu
 * (`sections`; none — Home's, whose rail is the menu — no menu column) and
 * beside it the section's filters (`tb-access-filters` on an Access page,
 * `tb-site-filters` on Sites, `tb-feedback-filters` on Feedback), a divider between them. Its width is
 * {@link settingsSidebarWidth}'s:
 *
 * ```html
 * <tb-sidebar-layout [(open)]="sidebarOpen" [width]="settingsWidth" [collapseToggle]="true">
 *   <tb-settings-sidebar sidebar [sections]="settingsSections" [section]="settingsSection" [org]="org" [access]="access"
 *                        (sectionChange)="selectSettingsSection($event)"></tb-settings-sidebar>
 *   …
 * </tb-sidebar-layout>
 * ```
 */
@Component({
  selector: "tb-settings-sidebar",
  templateUrl: "./settings-sidebar.component.html",
  styleUrls: ["./settings-sidebar.component.scss"],
  standalone: true,
  imports: [CommonModule, SectionNavComponent, AccessFiltersComponent, SiteFiltersComponent, FeedbackFiltersComponent],
})
export class SettingsSidebarComponent {
  /** The section menu (none: no menu column — the filters stand first, no divider before them). */
  @Input() sections: SectionNavItem[] = [];
  @Input() section = "";
  @Input() org!: OrganizationStore;
  @Input() access!: AccessStore;
  /** Settings › Feedback's store (Home's): its filters. */
  @Input() feedback: FeedbackStore | null = null;
  /** A section picked in the menu. */
  @Output() sectionChange = new EventEmitter<string>();

  /** No menu: the filters column first (its host-context drops the space and the divider it keeps beside a menu). */
  @HostBinding("class.tb-settings-filters-alone") get alone(): boolean {
    return !this.sections.length;
  }

  /** The Access page whose filters show (Health has none). */
  get accessPage() {
    const page = accessPageOf(this.section);
    return page === "health" ? null : page;
  }
}
