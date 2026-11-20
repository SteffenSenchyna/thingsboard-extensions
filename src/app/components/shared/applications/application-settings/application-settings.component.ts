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

import { Component, DoCheck, Input, ViewChild } from "@angular/core";
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";
import { DataTableCellDirective, DataTableColumn, DataTableComponent } from "../../data-table/data-table.component";
import { TableManage } from "../../data-table/table-manage";
import { TableCountComponent } from "../../table-count/table-count.component";
import { TableLinksComponent } from "../../table-links/table-links.component";
import { TipDirective } from "../../tip/tip.directive";
import { Application } from "../applications.models";
import { ApplicationStore } from "../application-store";
import { CREATED_ON_COLUMN, createdCells } from "../../time-format";
import { DashboardLoadingComponent, FirstLoads, firstLoadsOf } from "../../dashboard-loading/dashboard-loading.component";

/**
 * The Settings page's Applications (shared by the dashboards): every asset of
 * the applications' profile — a row opens its panel, the footer is "Create
 * new | Manage" (Manage checks rows to delete). A dashboard that applies them
 * adds a count column ({@link countHeader}, {@link counts}: "Gateways").
 * Everything is done by the {@link ApplicationStore}; its panel and
 * confirmation show with `tb-application-panels` in the dashboard root.
 */
@Component({
  selector: "tb-application-settings",
  templateUrl: "./application-settings.component.html",
  styleUrls: ["./application-settings.component.scss"],
  standalone: true,
  imports: [DashboardLoadingComponent, CommonModule, SharedModule, DataTableCellDirective, DataTableComponent, TableCountComponent, TableLinksComponent, TipDirective],
})
export class ApplicationSettingsComponent implements DoCheck {
  /** The loading page: the applications the first time they show (kept on the store: the component is made anew per visit). */
  get firstLoads(): FirstLoads {
    return firstLoadsOf(this.store);
  }

  @Input() store!: ApplicationStore;
  /** A count column's heading ("Gateways"): how many each application is applied to — none, no column. */
  @Input() countHeader = "";
  /** Its counts, by application id. */
  @Input() counts: Record<string, number> | null = null;

  @ViewChild("applicationsTable") private table?: DataTableComponent;
  /** Managing the list (its rows get check boxes; the footer: Delete, Select all, Done). */
  readonly manage = new TableManage(
    () => this.table,
    () => this.store.applications.length
  );

  columns: DataTableColumn[] = [];
  rows: Record<string, any>[] = [];

  /** What the rows / columns were built from: rebuilt only when one changes. */
  private seen: { list?: Application[]; sites?: Map<string, string[]>; counts?: Record<string, number> | null; countHeader?: string } = {};

  ngDoCheck(): void {
    // The table's sort as the user left it (read once).
    this.store?.sort.load();
    const s = this.store;
    if (
      !s ||
      (s.applications === this.seen.list && s.sites === this.seen.sites && this.counts === this.seen.counts && this.countHeader === this.seen.countHeader)
    ) {
      return;
    }
    // Sites: how many it's assigned to — when the dashboard assigns them (the panel's Sites tab).
    const assignsSites = !!s.settings.siteRelation;
    this.columns = [
      { key: "name", phone: "title", header: "Name", emphasis: "strong" },
      { key: "label", phone: "sub", header: "Label", emphasis: "muted" },
      // A short table: every column in full (the description wraps), its device and asset profiles as pills.
      { key: "description", phone: "note", header: "Description" },
      { key: "profiles", phone: "hide", header: "Device profiles", pills: true, sortValue: (row) => (row["profiles"] as string[]).join(", ") },
      { key: "assetProfiles", phone: "hide", header: "Asset profiles", pills: true, sortValue: (row) => (row["assetProfiles"] as string[]).join(", ") },
      ...(assignsSites ? [{ key: "sites", phone: "trail" as const, header: "Sites" }] : []),
      ...(this.countHeader ? [{ key: "count", phone: "hide" as const, header: this.countHeader, emphasis: "muted" as const }] : []),
      CREATED_ON_COLUMN,
    ];
    this.rows = s.applications.map((a) => ({
      id: a.id,
      application: a,
      name: a.name,
      label: a.label,
      description: a.description,
      profiles: a.deviceProfiles,
      assetProfiles: a.assetProfiles,
      sites: s.sites.get(a.id)?.length ?? 0,
      count: this.counts?.[a.id] ?? 0,
      ...createdCells(a.createdTime),
    }));
    this.seen = { list: s.applications, sites: s.sites, counts: this.counts, countHeader: this.countHeader };
    // The list changed (a delete): the checks that are gone drop out.
    this.manage.keep(new Set(s.applications.map((a) => a.id)));
  }

  /** A row: its application's panel (not while managing). */
  onRow(row: Record<string, any>): void {
    if (!this.manage.managing) {
      this.store.openEdit(row["application"] as Application);
    }
  }

  /** A row's Sites count: its panel on the Sites tab (not the row's own click). */
  openSites(row: Record<string, any>): void {
    if (!this.manage.managing) {
      this.store.openSites(row["application"] as Application);
    }
  }

  /** "Delete (n)": the store asks first. */
  askDeleteSelected(): void {
    if (this.manage.selected.length) {
      this.store.askDelete(this.manage.selected.map((r) => r["application"] as Application));
    }
  }
}
