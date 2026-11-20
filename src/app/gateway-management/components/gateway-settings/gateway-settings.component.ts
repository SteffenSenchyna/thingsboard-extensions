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

import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewChild } from "@angular/core";
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";
import { DataTableColumn, DataTableComponent } from "../../../components/shared/data-table/data-table.component";
import { TableManage } from "../../../components/shared/data-table/table-manage";
import { TableLinksComponent } from "../../../components/shared/table-links/table-links.component";
import { SectionNavItem } from "../../../components/shared/section-nav/section-nav.component";
import { ORGANIZATION_SECTION } from "../../../components/shared/organization/organization.models";
import { ACCOUNT_SECTION } from "../../../components/shared/account-settings/account-settings.component";
import { ACCESS_SECTION } from "../../../components/shared/access/access.models";
import { APPLICATIONS_SECTION } from "../../../components/shared/applications/applications.models";
import {
  connectorTypeLabel,
  DeviceTemplate,
  applicationName,
  GatewayApplication,
  GatewayDashboardSettings,
  gatewayDashboardDefaultSettings,
} from "../../models/gateway-management.models";

/**
 * The settings page's sections (the sidebar menu): the Organization (a group of
 * its pages — the shared `tb-organization-settings`), the applications (the
 * shared `tb-application-settings`), the access (the shared `tb-access-settings`: groups and users), the
 * templates and the Account (the shared `tb-account-settings`: the user's profile and the light / dark theme).
 */
export const GATEWAY_SETTINGS_SECTIONS: SectionNavItem[] = [
  APPLICATIONS_SECTION,
  ORGANIZATION_SECTION,
  ACCESS_SECTION,
  { id: "templates", label: "Templates", icon: "bookmarks" },
  ACCOUNT_SECTION,
];

/** The sections a page shows (a group's are its children), in menu order — the first is the default. */
export const GATEWAY_SETTINGS_SECTION_IDS: string[] = GATEWAY_SETTINGS_SECTIONS.flatMap((s) => (s.children ? s.children.map((c) => c.id) : [s.id]));

/**
 * The Settings page's gateway section: the device templates, kept by the
 * dashboard in a tenant attribute — a row opens its panel; the footer is
 * "Create new | Manage": Manage checks rows to delete. (The Organization, the
 * applications and the Account are the shared `tb-organization-settings`,
 * `tb-application-settings` and `tb-account-settings`.)
 */
@Component({
  selector: "tb-gm-settings",
  templateUrl: "./gateway-settings.component.html",
  styleUrls: ["./gateway-settings.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, DataTableComponent, TableLinksComponent],
})
export class GatewaySettingsComponent implements OnChanges {
  @Input() section = GATEWAY_SETTINGS_SECTION_IDS[0];
  @Input() settings: GatewayDashboardSettings = gatewayDashboardDefaultSettings;
  /** The entity whose panel is open (its id; null: none): its row is the highlighted one — and no row is once the panel closes. */
  @Input() selectedId: string | null = null;
  @Input() saving = false;

  @ViewChild("templatesTable") private templatesTable?: DataTableComponent;
  /** The templates being managed (their rows get check boxes; the footer: Delete, Select all, Done). */
  readonly manage = new TableManage(
    () => this.templatesTable,
    () => this.templates.length
  );
  /** The applications (a template's pills name its applications). */
  @Input() applications: GatewayApplication[] = [];
  /** The device templates (kept by the dashboard in a tenant attribute). */
  @Input() templates: DeviceTemplate[] = [];
  @Output() addTemplate = new EventEmitter<void>();
  /** A template's row: open its panel. */
  @Output() editTemplate = new EventEmitter<DeviceTemplate>();
  /** Managing the templates, "Delete (n)": the checked ones to delete (the dashboard asks first). */
  @Output() deleteTemplates = new EventEmitter<DeviceTemplate[]>();

  readonly templateColumns: DataTableColumn[] = [
    { key: "name", phone: "title", header: "Name", emphasis: "strong" },
    { key: "type", phone: "sub", header: "Connector type", emphasis: "muted" },
    // The template's applications as pills (the gateways table's); a dash for none.
    { key: "applications", phone: "note", header: "Applications", pills: true, sortValue: (row) => (row["applications"] as string[]).join(", ") },
  ];
  templateRows: Record<string, any>[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    // Another section (the Settings menu): a list being managed leaves Manage.
    if (changes["section"] && !changes["section"].firstChange && this.manage.managing) {
      this.manage.end();
    }
    if (changes["templates"]) {
      // The managed list changed (a delete): the checks that are gone drop out.
      this.manage.keep(new Set(this.templates.map((t) => t.id)));
    }
    if (changes["templates"] || changes["applications"]) {
      this.templateRows = this.templates.map((t) => ({
        id: t.id,
        template: t,
        name: t.name,
        type: connectorTypeLabel(t.type),
        // The applications a gateway gets with the template (those still defined), by name — a pill each.
        applications: this.applications.filter((a) => (t.applications ?? []).includes(a.id)).map(applicationName),
      }));
    }
  }

  // -- the lists: a row opens its panel; Manage checks rows to delete --------

  onTemplateRow(row: Record<string, any>): void {
    if (!this.manage.managing) {
      this.editTemplate.emit(row["template"] as DeviceTemplate);
    }
  }

  /** "Delete (n)": the checked rows' entities to the dashboard, which asks first. */
  askDeleteSelected(): void {
    if (this.manage.selected.length) {
      this.deleteTemplates.emit(this.manage.selected.map((r) => r["template"] as DeviceTemplate));
    }
  }
}
