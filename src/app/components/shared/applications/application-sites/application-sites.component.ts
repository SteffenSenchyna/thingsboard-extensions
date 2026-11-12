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
import type { DataTableColumn } from "../../data-table/data-table.component";
import { DetailTableComponent } from "../../detail-table/detail-table.component";
import { siteOptionLabel } from "../../organization/organization.models";
import { Application } from "../applications.models";
import { ApplicationStore } from "../application-store";

const NO_ROWS: Record<string, any>[] = [];

/**
 * An application's Sites tab (its panel, when the dashboard assigns them to
 * sites): the sites where it runs (a relation to each) as the panels'
 * compact list (`tb-detail-table`) — a site "Richmond Lab (4R20)" over
 * "GVA | RMX" (its market and product line) — grouped by market: a market's
 * sites fold under its row ("GVA (5)", + / −, folded to start), a market
 * with one site and the market-less ones (last) standing alone. A site's row
 * opens the site's own panel, the next stop on the panels' trail
 * ({@link ApplicationStore.openSiteOf}); what runs at a site is set on its
 * form ("Applications").
 */
@Component({
  selector: "tb-application-sites",
  templateUrl: "./application-sites.component.html",
  styleUrls: ["./application-sites.component.scss"],
  standalone: true,
  imports: [CommonModule, DetailTableComponent],
})
export class ApplicationSitesComponent implements DoCheck {
  @Input() store!: ApplicationStore;
  @Input() app!: Application;

  /** An entry's name, then its meta line: the market, the product line (their names — their codes). */
  readonly columns: DataTableColumn[] = [
    { key: "name", header: "Site" },
    { key: "market", header: "Market" },
    { key: "productLine", header: "Product line" },
  ];
  /** Its sites (built only when they, or the Organization's lists, change). */
  rows: Record<string, any>[] = NO_ROWS;
  private seen: { app?: Application; assigned?: unknown; sites?: unknown; markets?: unknown; lines?: unknown } = {};

  ngDoCheck(): void {
    const org = this.store?.org;
    if (!org || !this.app) {
      return;
    }
    const seen = this.seen;
    if (
      seen.app === this.app &&
      seen.assigned === this.store.sites &&
      seen.sites === org.sites &&
      seen.markets === org.markets.rows &&
      seen.lines === org.productLines.rows
    ) {
      return;
    }
    this.seen = { app: this.app, assigned: this.store.sites, sites: org.sites, markets: org.markets.rows, lines: org.productLines.rows };
    // Once the sites' links are in (until then, every site would look market-less).
    if (org.sites.loading) {
      this.rows = NO_ROWS;
      return;
    }
    const ids = new Set(this.store.sites.get(this.app.id) ?? []);
    const marketName = new Map(org.markets.rows.map((m) => [m.id, m.name]));
    const lineName = new Map(org.productLines.rows.map((l) => [l.id, l.name]));
    const compare = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
    this.rows = org.sites.rows
      .filter((s) => ids.has(s.id))
      .map((s) => ({
        id: s.id,
        name: siteOptionLabel(s),
        market: (s.marketId && marketName.get(s.marketId)) || "",
        productLine: (s.productLineId && lineName.get(s.productLineId)) || "",
      }))
      // By market (the market-less last), by label within it: the list folds a market's sites under its row.
      .sort((a, b) => (!a.market !== !b.market ? (a.market ? -1 : 1) : compare(a.market, b.market) || compare(a.name, b.name)));
  }

  get loading(): boolean {
    return !!(this.store?.org?.sites.loading || this.store?.loading);
  }
}
