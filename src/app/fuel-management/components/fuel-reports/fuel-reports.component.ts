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
import { StatGridComponent } from "../../../components/shared/stat-grid/stat-grid.component";
import {
  DataTableCellDirective,
  DataTableColumn,
  DataTableComponent,
  DataTablePhoneRole,
} from "../../../components/shared/data-table/data-table.component";
import { StatusPillComponent } from "../../../components/shared/status-pill/status-pill.component";
import { Insight, InsightListComponent } from "../../../components/shared/insight-list/insight-list.component";
import { LineChartComponent } from "../../../components/shared/line-chart/line-chart.component";
import { HourHeatmapComponent } from "../../../components/shared/hour-heatmap/hour-heatmap.component";
import { CalloutComponent } from "../../../components/shared/callout/callout.component";
import type { StatHeadline, StatItem } from "../../../components/shared/stat-grid/stat-grid.component";
import { FuelReport } from "./fuel-reports.models";

/**
 * The Reports page, over the window, sites and code lists picked in the
 * sidebar: its insights (`tb-insight-list` — what stands out, a click opening
 * its folded section and scrolling to it), its figures strip (`tb-stat-grid` with a headline — the fuel
 * dispensed, its change and its trend, then the dispenses, denials, best day
 * and the pumps dispensing), the summaries (the fuel-type split, top sites,
 * users and vehicles), then the charts — fuel dispensed over time stacked by
 * fuel type, by station, and dispenses by hour of day — then its folded
 * sections, a table each (`tb-collapsible-card [flat]` around a sortable
 * `tb-data-table`, its count after its title): its days (a day's window: its
 * hours), its pumps, its users and vehicles (the code lists picked) and its
 * denials. The dashboard builds
 * the report ({@link buildFuelReport}) from the pumps' stored totals ("Fuel
 * Daily Totals") and, for who took the fuel, their dispense events.
 */
@Component({
  selector: "tb-fuel-reports",
  templateUrl: "./fuel-reports.component.html",
  styleUrls: ["./fuel-reports.component.scss"],
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
    HourHeatmapComponent,
    CalloutComponent,
  ],
})
export class FuelReportsComponent {
  @Input() report!: FuelReport;
  /** A day's window: its chart is per hour (else per day). */
  @Input() dayWindow = false;
  @Input() dark = false;
  /** Its cards' and charts' wireframes — the page's first reads aren't all in yet. */
  @Input() wireframe = false;

  get overTimeTitle(): string {
    return this.dayWindow ? "Fuel dispensed per hour" : "Fuel dispensed per day";
  }

  /** The over-time chart's slot under the pointer: the strip reads for it meanwhile (null: the window's). */
  hovered: number | null = null;

  /** The strip: the hovered slot's figures, else the window's (the report's own objects — never made afresh). */
  get strip(): { headline: StatHeadline; items: StatItem[] } {
    return (this.hovered !== null && this.report.slotFigures[this.hovered]) || this.report.figures;
  }

  /** The volume columns' word ("Litres", "Gallons"), and the charts' info lines in it. */
  get volumeWord(): string {
    return this.report.unit === "gal" ? "Gallons" : "Litres";
  }

  private get columns(): ReportColumns {
    return this.report.unit === "gal" ? GALLON_COLUMNS : LITRE_COLUMNS;
  }

  /** The days' (a day's window: the hours') section: its title and its columns. */
  get slotTitle(): string {
    return this.dayWindow ? "Hours" : "Days";
  }

  get slotColumns(): DataTableColumn[] {
    return this.dayWindow ? this.columns.hours : this.columns.days;
  }

  get pumpColumns(): DataTableColumn[] {
    return this.columns.pumps;
  }

  get userColumns(): DataTableColumn[] {
    return this.columns.users;
  }

  get vehicleColumns(): DataTableColumn[] {
    return this.columns.vehicles;
  }

  /** The folded sections open — an insight's click opens its own. */
  open: Record<ReportSection, boolean> = { slots: false, pumps: false, users: false, vehicles: false, denials: false };
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /**
   * An insight clicked: its section opened, then scrolled into view once it has opened — scrolled before, the page isn't yet tall
   * enough to bring the section up (it's folded) and stops at its heading, the table opening under the window's edge.
   */
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
      // Its body's height easing open (tb-collapsible-card: grid-template-rows 0fr → 1fr); no transition (reduced motion), the timer.
      const opened = (e: TransitionEvent) => e.propertyName === "grid-template-rows" && scroll();
      if (wasOpen) {
        scroll();
        return;
      }
      section.addEventListener("transitionend", opened);
      setTimeout(scroll, 400);
    });
  }

  readonly denialColumns = DENIAL_COLUMNS;
}

/** The folded sections, as an insight's `target` names them. */
type ReportSection = "slots" | "pumps" | "users" | "vehicles" | "denials";

/** A figure column: its value as shown, right-aligned, sorting by the number behind it (`<key>Sort`). */
const figure = (key: string, header: string, phone: DataTablePhoneRole = "meta"): DataTableColumn => ({
  key,
  header,
  phone,
  align: "right",
  nowrap: true,
  sortValue: (r) => Number(r[`${key}Sort`]),
});

/** The sections' columns in one unit — made once a unit (a table's columns never made afresh). */
interface ReportColumns {
  days: DataTableColumn[];
  hours: DataTableColumn[];
  pumps: DataTableColumn[];
  users: DataTableColumn[];
  vehicles: DataTableColumn[];
}

function reportColumns(volume: string): ReportColumns {
  // A phone's condensed table: the volume at the right, the other figures named under the row's name.
  const figures = [figure("litres", volume, "trail"), figure("dispenses", "Dispenses"), figure("denied", "Denied")];
  const slots = (header: string): DataTableColumn[] => [
    { key: "slot", phone: "title", header, emphasis: "strong", nowrap: true, sortValue: (r) => Number(r["slotSort"]) },
    ...figures,
    figure("average", "Avg per dispense", "hide"),
  ];
  // Against the period before (the same days, to the same time): "+12%" in a pill — more fuel red, less green (its cell template).
  const vsLast: DataTableColumn = { ...figure("vsLast", "vs last"), emphasis: "muted" };
  const holders = (header: string): DataTableColumn[] => [
    { key: "holder", phone: "title", header, emphasis: "strong" },
    figure("litres", volume, "trail"),
    figure("dispenses", "Dispenses"),
    vsLast,
  ];
  return {
    days: slots("Day"),
    hours: slots("Hour"),
    pumps: [
      { key: "pump", phone: "title", header: "Pump", emphasis: "strong", nowrap: true },
      { key: "station", phone: "sub", header: "Station" },
      { key: "site", phone: "hide", header: "Site", nowrap: true },
      { key: "fuel", phone: "sub", header: "Fuel", nowrap: true },
      ...figures,
      vsLast,
    ],
    users: holders("User"),
    vehicles: holders("Vehicle"),
  };
}

const LITRE_COLUMNS = reportColumns("Litres");
const GALLON_COLUMNS = reportColumns("Gallons");
const DENIAL_COLUMNS: DataTableColumn[] = [
  { key: "time", phone: "trail", header: "Time", nowrap: true, sortValue: (r) => Number(r["timeSort"]) },
  { key: "pump", phone: "sub", header: "Pump", emphasis: "strong", nowrap: true },
  // Its reason as the Activity page's pill (its icon, its tone), sorting by its name.
  { key: "reason", phone: "title", header: "Reason" },
  { key: "user", phone: "sub", header: "User" },
  { key: "vehicle", phone: "sub", header: "Vehicle" },
];
