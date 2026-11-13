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
   * The section's loader holds until everything its table shows is in — its list and each item's users (the Users column) —
   * so no count shows "…" and then a number.
   */
  get sectionLoading(): boolean {
    const s = this.store;
    const list = this.section === "markets" ? s.markets.loading : this.section === "sites" ? s.sites.loading : s.productLines.loading;
    return list || s.itemUsers === null;
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
  private seen: { productLines?: AssetList; markets?: AssetList; sites?: AssetList; siteFilter?: unknown; users?: unknown; manageDoneKey?: number } = {};

  /** Another section (the Settings menu): its table's sort — and Sites' columns — as the user left them (read once); a list being managed leaves Manage. */
  ngOnChanges(changes: SimpleChanges): void {
    const kind = organizationKindOf(this.section);
    if ((changes["section"] || changes["store"]) && kind) {
      this.store?.sorts[kind].load();
      // The items' users (the Users column), as they are now.
      this.store?.loadItemUsers();
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
    const changed =
      s.productLines !== this.seen.productLines ||
      s.markets !== this.seen.markets ||
      s.sites !== this.seen.sites ||
      s.siteFilter !== this.seen.siteFilter ||
      usersChanged;
    if (!changed) {
      return;
    }
    // An item's users (a product line's or a market's: everyone in it): null (shown "…") until they're read.
    const users = (kind: AssetKind, id: string) => s.usersOf(kind, id)?.length ?? null;
    const rowsOf = (list: AssetList, kind: AssetKind) =>
      list.rows.map((a) => ({ id: a.id, asset: a, name: a.name, label: a.label || "—", users: users(kind, a.id), ...createdCells(a.createdTime) }));
    // (A product line's and a market's users depend on the sites too: a site moved to another moves its users.)
    if (s.productLines !== this.seen.productLines || s.sites !== this.seen.sites || usersChanged) {
      // A sub product line under its parent (the table's tree).
      this.productLineRows = rowsOf(s.productLines, "productLine").map((r) => ({ ...r, parentId: (r.asset as AssetRow).parentId ?? "" }));
    }
    if (s.markets !== this.seen.markets || s.sites !== this.seen.sites || usersChanged) {
      this.marketRows = rowsOf(s.markets, "market");
    }
    // A site's product line and market, looked up in the other lists: each by its name (its code), its label for the bubble on hover.
    const asset = (list: AssetList, id: string | null | undefined) => (id ? list.rows.find((x) => x.id === id) : undefined);
    const tip = (a: AssetRow | undefined) => (a?.label && a.label !== a.name ? a.label : "");
    // A site's devices: the stored count.
    // The sites the filters let through (the sidebar's column).
    this.siteRows = rowsOf(s.sites, "site").filter((r) => s.sitePasses(r["asset"] as AssetRow)).map((r) => {
      const site = r["asset"] as AssetRow;
      const line = asset(s.productLines, site.productLineId);
      const market = asset(s.markets, site.marketId);
      return {
        ...r,
        productLine: line?.name ?? "—",
        productLineLabel: tip(line),
        market: market?.name ?? "—",
        marketLabel: tip(market),
        devices: site.devices ?? null,
      };
    });
    this.seen = { ...this.seen, productLines: s.productLines, markets: s.markets, sites: s.sites, siteFilter: s.siteFilter, users: s.itemUsers };
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

  /** A site's Devices count: its panel on the Devices tab (not while the list is managed). */
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
