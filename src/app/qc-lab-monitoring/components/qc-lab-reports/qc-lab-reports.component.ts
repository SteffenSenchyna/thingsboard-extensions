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
import { DataTableCellDirective, DataTableColumn, DataTableComponent, DataTablePhoneRole } from "../../../components/shared/data-table/data-table.component";
import { StatusPillComponent } from "../../../components/shared/status-pill/status-pill.component";
import { Insight, InsightListComponent } from "../../../components/shared/insight-list/insight-list.component";
import { LineChartComponent } from "../../../components/shared/line-chart/line-chart.component";
import { QcReport } from "./qc-lab-reports.models";

/**
 * The QC Lab Reports page: how well each device kept to its range over the window — its channels together (a probe's two, an
 * ambience sensor's temperature and humidity), each kept to the range its own threshold alarm is set to — sites and types picked in
 * the sidebar, from their raw readings: its insights (`tb-insight-list`, a click opening its folded
 * section), its figures strip (the time in range — its change against the period before, its course a day — then the excursions,
 * the time out of range, the longest excursion, the devices always in range, the devices reporting and the devices without a
 * range), its cards (out of range by device, excursions by device, out of range now) and, with ambience sensors in it, theirs (their
 * time in range, temperature and humidity), then its charts — the hours out of range a day (too cold, too warm — too dry, too wet
 * with a humidity; a plain stacked bar chart) beside this period against the last, and the temperature channels' highest,
 * average and lowest readings an hour with their limits — then its folded sections: its days (hours), its devices and its
 * excursions. The dashboard builds the report ({@link buildQcReport}).
 */
@Component({
  selector: "tb-qc-lab-reports",
  templateUrl: "./qc-lab-reports.component.html",
  styleUrls: ["./qc-lab-reports.component.scss"],
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
export class QcLabReportsComponent {
  @Input() report!: QcReport;
  /** A day's window: its slots are hours (else days). */
  @Input() dayWindow = false;
  @Input() dark = false;
  /** Its cards' and charts' wireframes — the window's readings are being read. */
  @Input() wireframe = false;

  get outOfRangeTitle(): string {
    return this.dayWindow ? "Hours out of range per hour" : "Hours out of range per day";
  }

  get slotTitle(): string {
    return this.dayWindow ? "Hours" : "Days";
  }

  get slotColumns(): DataTableColumn[] {
    return this.dayWindow ? HOUR_COLUMNS : DAY_COLUMNS;
  }

  readonly deviceColumns = DEVICE_COLUMNS;
  readonly excursionColumns = EXCURSION_COLUMNS;

  /** The folded sections open — an insight's click opens its own. */
  open: Record<ReportSection, boolean> = { slots: false, devices: false, excursions: false };
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
type ReportSection = "slots" | "devices" | "excursions";

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
  figure("inRange", "In range", "trail"),
  figure("out", "Out of range"),
  figure("excursions", "Excursions"),
  figure("lowest", "Lowest", "hide"),
  figure("highest", "Highest", "hide"),
];
const DAY_COLUMNS = slots("Day");
const HOUR_COLUMNS = slots("Hour");
/** A row a device, its channels together: no readings first, then the least time in range. */
const DEVICE_COLUMNS: DataTableColumn[] = [
  { key: "device", phone: "title", header: "Device", emphasis: "strong", nowrap: true },
  { key: "site", phone: "hide", header: "Site", nowrap: true },
  { key: "range", phone: "sub", header: "Range", nowrap: true },
  figure("inRange", "In range", "trail"),
  figure("out", "Out of range"),
  figure("excursions", "Excursions"),
  figure("longest", "Longest", "hide"),
  figure("lowest", "Lowest", "hide"),
  figure("highest", "Highest", "hide"),
  figure("readings", "Readings", "hide"),
];
const EXCURSION_COLUMNS: DataTableColumn[] = [
  { key: "started", phone: "sub", header: "Started", nowrap: true, sortValue: (r) => Number(r["startedSort"]) },
  { key: "device", phone: "title", header: "Device", emphasis: "strong", nowrap: true },
  { key: "channel", phone: "sub", header: "Channel", nowrap: true },
  // Which way it was out (`OUT_WAYS`): Too cold, Too warm, Too dry or Too wet, its pill and icon; sorting by its name.
  { key: "kind", phone: "sub", header: "Kind" },
  figure("duration", "Duration", "trail"),
  figure("peak", "Peak"),
  { key: "range", phone: "hide", header: "Range", nowrap: true },
];
