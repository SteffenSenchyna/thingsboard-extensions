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

import { Component, DoCheck, Input, OnChanges, SimpleChanges, ViewChild } from "@angular/core";
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";
import { DataTableCellDirective, DataTableColumn, DataTableComponent } from "../../data-table/data-table.component";
import { TableManage } from "../../data-table/table-manage";
import { TableLinksComponent } from "../../table-links/table-links.component";
import { AssetKind, AssetList, AssetRow, MARKET_COLUMNS, PRODUCT_LINE_COLUMNS, organizationKindOf } from "../organization.models";
import { OrganizationStore } from "../organization-store";
import { createdCells } from "../../time-format";
import { DashboardLoadingComponent, FirstLoads, firstLoadsOf } from "../../dashboard-loading/dashboard-loading.component";
import { TableCountComponent } from "../../table-count/table-count.component";
import { TipDirective } from "../../tip/tip.directive";

/**
 * The Settings page's Organization (shared by the dashboards): the product
 * lines, markets and sites — assets of those profiles — one page each
 * ({@link section}: "productLines", "markets", "sites"). A row edits its asset,
 * every table's footer is "Create new | Manage": Manage checks rows to delete
 * (the sites' also to edit together). Everything is done by the
 * {@link OrganizationStore}; its panel and confirmation show with
 * `tb-organization-panels` in the dashboard root.
 */
@Component({
  selector: "tb-organization-settings",
  templateUrl: "./organization-settings.component.html",
  styleUrls: ["./organization-settings.component.scss"],
  standalone: true,
  imports: [DashboardLoadingComponent, CommonModule, SharedModule, DataTableCellDirective, DataTableComponent, TableCountComponent, TableLinksComponent, TipDirective],
})
export class OrganizationSettingsComponent implements OnChanges, DoCheck {
  /** The loading page: each section's list the first time it shows (kept on the store: the component is made anew per visit). */
  get firstLoads(): FirstLoads {
    return firstLoadsOf(this.store);
  }
  /**
   * The section's loader holds until everything its table shows is in — its list, each item's users (the Users column) and, on
   * Sites, the access groups (the Groups column) — so no count shows "…" and then a number.
   */
  get sectionLoading(): boolean {
    const s = this.store;
    const list = this.section === "markets" ? s.markets.loading : this.section === "sites" ? s.sites.loading : s.productLines.loading;
    return list || s.itemUsers === null || (this.section === "sites" && !!s.access?.groupsLoading);
  }

  @Input() store!: OrganizationStore;
  @Input() section = "productLines";

  @ViewChild("productLinesTable") private productLinesTable?: DataTableComponent;
  @ViewChild("marketsTable") private marketsTable?: DataTableComponent;
  @ViewChild("sitesTable") private sitesTable?: DataTableComponent;
  /** The section's list being managed (its rows get check boxes; the footer: [Edit,] Delete, Select all, Done). */
  readonly manage = new TableManage(
    () => this.tableOf(this.kind),
    () => (this.kind ? this.store.list(this.kind).rows.length : 0)
  );

  /** The section's list. */
  get kind(): AssetKind | null {
    return organizationKindOf(this.section);
  }

  readonly productLineColumns: DataTableColumn[] = PRODUCT_LINE_COLUMNS;
  readonly marketColumns: DataTableColumn[] = MARKET_COLUMNS;
  productLineRows: Record<string, any>[] = [];
  marketRows: Record<string, any>[] = [];
  siteRows: Record<string, any>[] = [];

  /** The lists the rows were built from, and the bulk edits seen: the rows rebuild (and Manage ends) only when they change. */
  private seen: { productLines?: AssetList; markets?: AssetList; sites?: AssetList; siteFilter?: unknown; users?: unknown; groups?: unknown; manageDoneKey?: number } = {};

  /** Another section (the Settings menu): its table's sort — and Sites' columns — as the user left them (read once); a list being managed leaves Manage. */
  ngOnChanges(changes: SimpleChanges): void {
    const kind = organizationKindOf(this.section);
    if ((changes["section"] || changes["store"]) && kind) {
      this.store?.sorts[kind].load();
      // The items' users (the Users column), as they are now; the access groups (the Groups column), if not read yet.
      this.store?.loadItemUsers();
      this.store?.access?.loadAccess();
    }
    if ((changes["section"] || changes["store"]) && this.section === "sites") {
      this.store?.siteColumns.load();
    }
    if (changes["section"] && !changes["section"].firstChange && this.manage.managing) {
      this.manage.end();
    }
  }

  ngDoCheck(): void {
    const s = this.store;
    if (!s) {
      return;
    }
    if (this.seen.manageDoneKey !== undefined && s.manageDoneKey !== this.seen.manageDoneKey) {
      this.manage.end();
    }
    this.seen.manageDoneKey = s.manageDoneKey;
    const usersChanged = s.itemUsers !== this.seen.users;
    // The access groups (every table's Groups column): their version once they're in.
    const groupsKey = s.access?.groupsLoaded ? s.access.groupsVersion : null;
    const groupsChanged = groupsKey !== this.seen.groups;
    const changed =
      s.productLines !== this.seen.productLines ||
      s.markets !== this.seen.markets ||
      s.sites !== this.seen.sites ||
      s.siteFilter !== this.seen.siteFilter ||
      usersChanged ||
      groupsChanged;
    if (!changed) {
      return;
    }
    // An item's users: null (shown "…") until they're read.
    const users = (id: string) => (s.itemUsers ? (s.itemUsers.get(id)?.length ?? 0) : null);
    const rowsOf = (list: AssetList) =>
      list.rows.map((a) => ({ id: a.id, asset: a, name: a.name, label: a.label || "—", users: users(a.id), ...createdCells(a.createdTime) }));
    // A market's or a product line's groups (those whose scope is it, as its Groups tab): null (shown "…") until the access groups are in.
    const itemGroups = groupsKey !== null && s.access ? s.access.itemGroupCounts() : null;
    const withGroups = (r: Record<string, any>) => ({ ...r, groups: itemGroups ? (itemGroups.get(r["id"]) ?? 0) : null });
    if (s.productLines !== this.seen.productLines || usersChanged || groupsChanged) {
      // A sub product line under its parent (the table's tree).
      this.productLineRows = rowsOf(s.productLines).map((r) => ({ ...withGroups(r), parentId: (r.asset as AssetRow).parentId ?? "" }));
    }
    if (s.markets !== this.seen.markets || usersChanged || groupsChanged) {
      this.marketRows = rowsOf(s.markets).map(withGroups);
    }
    // A site's product line and market, looked up in the other lists: each by its name (its code), its label for the bubble on hover.
    const asset = (list: AssetList, id: string | null | undefined) => (id ? list.rows.find((x) => x.id === id) : undefined);
    const tip = (a: AssetRow | undefined) => (a?.label && a.label !== a.name ? a.label : "");
    // A site's groups (those covering it): null (shown "…") until the access groups are in; its devices, the stored count.
    const groupCounts = groupsKey !== null && s.access ? s.access.siteGroupCounts() : null;
    // The sites the filters let through (the sidebar's column).
    this.siteRows = rowsOf(s.sites).filter((r) => s.sitePasses(r["asset"] as AssetRow)).map((r) => {
      const site = r["asset"] as AssetRow;
      const line = asset(s.productLines, site.productLineId);
      const market = asset(s.markets, site.marketId);
      return {
        ...r,
        productLine: line?.name ?? "—",
        productLineLabel: tip(line),
        market: market?.name ?? "—",
        marketLabel: tip(market),
        groups: groupCounts ? (groupCounts.get(site.id) ?? 0) : null,
        devices: site.devices ?? null,
      };
    });
    this.seen = { ...this.seen, productLines: s.productLines, markets: s.markets, sites: s.sites, siteFilter: s.siteFilter, users: s.itemUsers, groups: groupsKey };
    if (this.kind) {
      // The managed list changed (a delete): the checks that are gone drop out.
      this.manage.keep(new Set(s.list(this.kind).rows.map((a) => a.id)));
    }
  }

  /** A row's Users count: its asset's panel on the Users tab (not while its list is managed). */
  openUsers(kind: AssetKind, row: Record<string, any>): void {
    if (!this.manage.managing) {
      this.store.openUsers(kind, row["asset"] as AssetRow);
    }
  }

  /** A row's Groups count: its asset's panel on the Groups tab; a site's Devices count, on the Devices tab (not while the list is managed). */
  openGroups(kind: AssetKind, row: Record<string, any>): void {
    if (!this.manage.managing) {
      this.store.openGroups(kind, row["asset"] as AssetRow);
    }
  }

  openSiteDevices(row: Record<string, any>): void {
    if (!this.manage.managing) {
      this.store.openDevices(row["asset"] as AssetRow);
    }
  }

  /** A row: its asset's panel (not while its list is managed). */
  onRow(kind: AssetKind, row: Record<string, any>): void {
    if (!this.manage.managing) {
      this.store.openEdit(kind, row["asset"] as AssetRow);
    }
  }

  create(kind: AssetKind): void {
    this.store.openAdd(kind);
  }

  countOf(kind: AssetKind): number {
    return this.store.list(kind).rows.length;
  }

  /** "Delete (n)": the store asks first. */
  askDeleteSelected(): void {
    if (this.kind && this.manage.selected.length) {
      this.store.askDelete(
        this.kind,
        this.manage.selected.map((r) => r["asset"] as AssetRow)
      );
    }
  }

  /** "Edit (n)" on the sites (their product line and market) or the product lines (their parent), set together. */
  editSelected(): void {
    const kind = this.kind;
    if ((kind === "site" || kind === "productLine") && this.manage.selected.length) {
      this.store.openBulkEdit(
        kind,
        this.manage.selected.map((r) => r["asset"] as AssetRow)
      );
    }
  }

  private tableOf(kind: AssetKind | null): DataTableComponent | undefined {
    return kind === "productLine" ? this.productLinesTable : kind === "market" ? this.marketsTable : kind === "site" ? this.sitesTable : undefined;
  }
}
