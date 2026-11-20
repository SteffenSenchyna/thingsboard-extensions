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

import { Component, ElementRef, Input, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { BarChartComponent } from "../../../components/shared/bar-chart/bar-chart.component";
import { CollapsibleCardComponent } from "../../../components/shared/collapsible-card/collapsible-card.component";
import { SummaryCardsComponent } from "../../../components/shared/summary-cards/summary-cards.component";
import { StatGridComponent, StatItem } from "../../../components/shared/stat-grid/stat-grid.component";
import { DataTableCellDirective, DataTableColumn, DataTableComponent, DataTablePhoneRole } from "../../../components/shared/data-table/data-table.component";
import { StatusPillComponent } from "../../../components/shared/status-pill/status-pill.component";
import { Insight, InsightListComponent } from "../../../components/shared/insight-list/insight-list.component";
import { LineChartComponent } from "../../../components/shared/line-chart/line-chart.component";
import { AsphaltReport } from "./asphalt-reports.models";

/**
 * The Asphalt Reports page: the tanks' inventory over the window, sites and products picked in the sidebar, in tonnes — its insights
 * (`tb-insight-list`: what stands out, a click opening its folded section and scrolling to it), its figures strip (`tb-stat-grid` with
 * a headline: what's on hand, its change since the window's start and its course, then what was received and dispensed, dispensed a day,
 * the days of supply, the low point and the tanks reporting), its cards (by product, on hand by tank, dispensed by tank), then its charts
 * — on hand over time by product, received and dispensed a day (an hour, a day's window: a plain bar chart) beside this period against the last — then its
 * folded sections, a sortable table each: its days (hours), its tanks and its movements (each fill and draw). The dashboard builds
 * the report ({@link buildAsphaltReport}) from each tank's averaged tonnage.
 */
@Component({
  selector: "tb-asphalt-reports",
  templateUrl: "./asphalt-reports.component.html",
  styleUrls: ["./asphalt-reports.component.scss"],
  standalone: true,
  imports: [
    CommonModule,
    BarChartComponent,
    CollapsibleCardComponent,
    SummaryCardsComponent,
    StatGridComponent,
    DataTableComponent,
    DataTableCellDirective,
    StatusPillComponent,
    InsightListComponent,
    LineChartComponent,
  ],
})
export class AsphaltReportsComponent {
  @Input() report!: AsphaltReport;
  /** A day's window: its slots are hours (else days). */
  @Input() dayWindow = false;
  @Input() dark = false;
  /** Its cards' and charts' wireframes — the window's tonnage is being read. */
  @Input() wireframe = false;

  get movementTitle(): string {
    return this.dayWindow ? "Received and dispensed per hour" : "Received and dispensed per day";
  }

  get slotTitle(): string {
    return this.dayWindow ? "Hours" : "Days";
  }

  get slotColumns(): DataTableColumn[] {
    return this.dayWindow ? HOUR_COLUMNS : DAY_COLUMNS;
  }

  readonly tankColumns = TANK_COLUMNS;
  readonly movementColumns = MOVEMENT_COLUMNS;
  readonly versusWireframe = VERSUS_WIREFRAME;

  /** The folded sections open — an insight's click opens its own. */
  open: Record<ReportSection, boolean> = { slots: false, tanks: false, movements: false };
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** An insight clicked: its section opened, then scrolled into view once it has (scrolled before, it stops at its heading). */
  openInsight(insight: Insight): void {
    const target = insight.target as ReportSection | undefined;
    if (!target || !(target in this.open)) {
      return;
    }
    const wasOpen = this.open[target];
    this.open = { ...this.open, [target]: true };
    setTimeout(() => {
      const section = this.host.nativeElement.querySelector<HTMLElement>(`[data-section="${target}"]`);
      if (!section) {
        return;
      }
      let done = false;
      const scroll = () => {
        if (done) {
          return;
        }
        done = true;
        section.removeEventListener("transitionend", opened);
        section.scrollIntoView({ behavior: "smooth", block: "start" });
      };
      // Its body easing open (tb-collapsible-card: grid-template-rows 0fr → 1fr); no transition (reduced motion), the timer.
      const opened = (e: TransitionEvent) => e.propertyName === "grid-template-rows" && scroll();
      if (wasOpen) {
        scroll();
        return;
      }
      section.addEventListener("transitionend", opened);
      setTimeout(scroll, 400);
    });
  }
}

/** The folded sections, as an insight's `target` names them. */
type ReportSection = "slots" | "tanks" | "movements";

/** A figure column: its value as shown, right-aligned, sorting by the number behind it (`<key>Sort`). */
const figure = (key: string, header: string, phone: DataTablePhoneRole = "meta"): DataTableColumn => ({
  key,
  header,
  phone,
  align: "right",
  nowrap: true,
  sortValue: (r) => Number(r[`${key}Sort`]),
});

const slots = (header: string): DataTableColumn[] => [
  { key: "slot", phone: "title", header, emphasis: "strong", nowrap: true, sortValue: (r) => Number(r["slotSort"]) },
  figure("opening", "Opening (t)", "hide"),
  figure("received", "Received (t)"),
  figure("used", "Dispensed (t)"),
  figure("closing", "Closing (t)", "trail"),
];
const DAY_COLUMNS = slots("Day");
const HOUR_COLUMNS = slots("Hour");
const TANK_COLUMNS: DataTableColumn[] = [
  { key: "tank", phone: "title", header: "Tank", emphasis: "strong", nowrap: true },
  { key: "product", phone: "sub", header: "Product" },
  { key: "site", phone: "hide", header: "Site", nowrap: true },
  figure("level", "Level"),
  figure("onHand", "On hand (t)", "trail"),
  figure("received", "Received (t)"),
  figure("used", "Dispensed (t)"),
  figure("net", "Net (t)", "hide"),
  figure("low", "Lowest (t)", "hide"),
];
const MOVEMENT_COLUMNS: DataTableColumn[] = [
  { key: "time", phone: "sub", header: "Started", nowrap: true, sortValue: (r) => Number(r["timeSort"]) },
  { key: "tank", phone: "title", header: "Tank", emphasis: "strong", nowrap: true },
  // Fill or Draw, a pill (its cell template), sorting by its name.
  { key: "kind", phone: "sub", header: "Kind" },
  figure("tonnes", "Tonnes", "trail"),
  figure("duration", "Duration", "hide"),
];
/** The "This period vs last" card while the window before is read: its figures' places. */
const VERSUS_WIREFRAME: StatItem[] = [{ label: "Received" }, { label: "Dispensed" }, { label: "Dispensed a day" }];
