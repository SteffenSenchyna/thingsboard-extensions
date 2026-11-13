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
import { DataTableCellDirective, DataTableColumn, DataTableComponent } from "../../../components/shared/data-table/data-table.component";
import { Insight, InsightListComponent } from "../../../components/shared/insight-list/insight-list.component";
import { LineChartComponent } from "../../../components/shared/line-chart/line-chart.component";
import { HourHeatmapComponent } from "../../../components/shared/hour-heatmap/hour-heatmap.component";
import { RunStripComponent } from "../../../components/shared/run-strip/run-strip.component";
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
    InsightListComponent,
    LineChartComponent,
    HourHeatmapComponent,
    RunStripComponent,
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

  /** An insight clicked: its section opened, then scrolled into view. */
  openInsight(insight: Insight): void {
    const target = insight.target as ReportSection | undefined;
    if (!target || !(target in this.open)) {
      return;
    }
    this.open = { ...this.open, [target]: true };
    setTimeout(() => this.host.nativeElement.querySelector(`[data-section="${target}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  readonly denialColumns = DENIAL_COLUMNS;
}

/** The folded sections, as an insight's `target` names them. */
type ReportSection = "slots" | "pumps" | "users" | "vehicles" | "denials";

/** A figure column: its value as shown, right-aligned, sorting by the number behind it (`<key>Sort`). */
const figure = (key: string, header: string): DataTableColumn => ({ key, header, align: "right", nowrap: true, sortValue: (r) => Number(r[`${key}Sort`]) });

/** The sections' columns in one unit — made once a unit (a table's columns never made afresh). */
interface ReportColumns {
  days: DataTableColumn[];
  hours: DataTableColumn[];
  pumps: DataTableColumn[];
  users: DataTableColumn[];
  vehicles: DataTableColumn[];
}

function reportColumns(volume: string): ReportColumns {
  const figures = [figure("litres", volume), figure("dispenses", "Dispenses"), figure("denied", "Denied")];
  const slots = (header: string): DataTableColumn[] => [
    { key: "slot", header, emphasis: "strong", nowrap: true, sortValue: (r) => Number(r["slotSort"]) },
    ...figures,
    figure("average", "Avg per dispense"),
  ];
  // Against the period before (the same days, to the same time): "+12%", muted.
  const vsLast: DataTableColumn = { ...figure("vsLast", "vs last"), emphasis: "muted" };
  const holders = (header: string): DataTableColumn[] => [
    { key: "holder", header, emphasis: "strong" },
    figure("litres", volume),
    figure("dispenses", "Dispenses"),
    vsLast,
  ];
  return {
    days: slots("Day"),
    hours: slots("Hour"),
    pumps: [
      { key: "pump", header: "Pump", emphasis: "strong", nowrap: true },
      { key: "station", header: "Station" },
      { key: "site", header: "Site", nowrap: true },
      { key: "fuel", header: "Fuel", nowrap: true },
      ...figures,
      vsLast,
      // Its online and offline runs over the window (a strip), then its share online.
      { key: "runs", header: "Availability", width: "140px", sortable: false },
      { ...figure("online", "Online"), emphasis: "muted" },
    ],
    users: holders("User"),
    vehicles: holders("Vehicle"),
  };
}

const LITRE_COLUMNS = reportColumns("Litres");
const GALLON_COLUMNS = reportColumns("Gallons");
const DENIAL_COLUMNS: DataTableColumn[] = [
  { key: "time", header: "Time", nowrap: true, sortValue: (r) => Number(r["timeSort"]) },
  { key: "pump", header: "Pump", emphasis: "strong", nowrap: true },
  { key: "reason", header: "Reason" },
  { key: "user", header: "User" },
  { key: "vehicle", header: "Vehicle" },
];
