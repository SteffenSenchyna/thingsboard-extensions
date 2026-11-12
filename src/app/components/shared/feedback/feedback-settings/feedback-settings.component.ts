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
import { DataTableCellDirective, DataTableComponent } from "../../data-table/data-table.component";
import { TableManage } from "../../data-table/table-manage";
import { TableLinksComponent } from "../../table-links/table-links.component";
import { StatusPillComponent } from "../../status-pill/status-pill.component";
import { TipDirective } from "../../tip/tip.directive";
import { DashboardLoadingComponent, FirstLoads, firstLoadsOf } from "../../dashboard-loading/dashboard-loading.component";
import { formatDateTime } from "../../time-format";
import { FeedbackStore } from "../feedback-store";
import { FEEDBACK_SECTION, FeedbackEntry, feedbackStatusOf, feedbackTypeOf } from "../feedback.models";

/**
 * Home's Settings › Feedback (tenant administrators'): what users sent from
 * the dashboards' "Send feedback", newest first — its kind, sender, words,
 * the app it came from, the sender's product line and market, the page and
 * its status — as the filters beside it let through (`tb-feedback-filters`,
 * in the Settings sidebar); a row opens its panel (`tb-feedback-panels`, in
 * the dashboard root). Manage deletes several.
 */
@Component({
  selector: "tb-feedback-settings",
  templateUrl: "./feedback-settings.component.html",
  styleUrls: ["./feedback-settings.component.scss"],
  standalone: true,
  imports: [DashboardLoadingComponent, CommonModule, SharedModule, DataTableCellDirective, DataTableComponent, TableLinksComponent, StatusPillComponent, TipDirective],
})
export class FeedbackSettingsComponent implements DoCheck {
  @Input() store!: FeedbackStore;
  /** The section's icon (Settings › Feedback's, apart from "Send feedback"'s). */
  readonly sectionIcon = FEEDBACK_SECTION.icon ?? "reviews";

  get firstLoads(): FirstLoads {
    return firstLoadsOf(this.store);
  }

  @ViewChild("feedbackTable") private table?: DataTableComponent;
  readonly manage = new TableManage(
    () => this.table,
    () => this.store.entries.length
  );

  rows: Record<string, any>[] = [];
  /** What the rows were built from: rebuilt only when one changes. */
  private seen: unknown[] = [];

  ngDoCheck(): void {
    const s = this.store;
    if (!s) {
      return;
    }
    // The table's sort and columns as the user left them (read once).
    s.sort.load();
    s.columns.load();
    const inputs = [s.entries, s.sendersVersion, s.filter, s.org?.productLines.rows, s.org?.markets.rows];
    if (inputs.every((x, i) => x === this.seen[i])) {
      return;
    }
    this.seen = inputs;
    // A product line's / market's label on hover — none when it's its code.
    const tip = (a: { name: string; label: string } | null) => (a?.label && a.label !== a.name ? a.label : "");
    this.rows = s.entries.filter((e) => s.passes(e)).map((e) => {
      const type = feedbackTypeOf(e.item?.type);
      const status = feedbackStatusOf(e.status);
      const line = s.lineOf(e);
      const market = s.marketOf(e);
      return {
        id: String(e.ts),
        entry: e,
        ts: e.ts,
        received: formatDateTime(e.ts),
        typeLabel: type.label,
        typeIcon: type.icon,
        shot: e.item?.screenshot === "attached",
        from: s.senderName(e),
        email: e.email,
        text: e.item?.text ?? "(unreadable)",
        app: s.appOf(e) || "—",
        productLine: line?.name ?? "—",
        productLineLabel: tip(line),
        market: market?.name ?? "—",
        marketLabel: tip(market),
        where: s.whereOf(e),
        url: s.addressOf(e),
        status: status.label,
        statusTone: status.tone,
        statusRank: ["new", "reviewed", "done"].indexOf(e.status),
      };
    });
    this.manage.keep(new Set(this.rows.map((r) => r["id"])));
  }

  onRow(row: Record<string, any>): void {
    if (!this.manage.managing) {
      this.store.open(row["entry"] as FeedbackEntry);
    }
  }

  askDeleteSelected(): void {
    if (this.manage.selected.length) {
      this.store.askDelete(this.manage.selected.map((r) => r["entry"] as FeedbackEntry));
    }
  }
}
