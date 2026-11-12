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

import { Component, Input } from "@angular/core";
import { CommonModule } from "@angular/common";
import { BarChartComponent } from "../../../components/shared/bar-chart/bar-chart.component";
import { CollapsibleCardComponent } from "../../../components/shared/collapsible-card/collapsible-card.component";
import { SummaryCardsComponent } from "../../../components/shared/summary-cards/summary-cards.component";
import { FuelReport } from "./fuel-reports.models";

/**
 * The Reports page: fuel-consumption summaries (consumption, the fuel-type
 * split, top sites, users and vehicles) over the window, sites and code lists
 * picked in the sidebar, then the charts — fuel dispensed over time stacked by
 * fuel type, by station, and dispenses by hour of day. The dashboard builds
 * the report ({@link buildFuelReport}) from the pumps' stored totals ("Fuel
 * Daily Totals") and, for who took the fuel, their dispense events.
 */
@Component({
  selector: "tb-fuel-reports",
  templateUrl: "./fuel-reports.component.html",
  styleUrls: ["./fuel-reports.component.scss"],
  standalone: true,
  imports: [CommonModule, BarChartComponent, CollapsibleCardComponent, SummaryCardsComponent],
})
export class FuelReportsComponent {
  @Input() report!: FuelReport;
  /** A day's window: its chart is per hour (else per day). */
  @Input() dayWindow = false;
  @Input() dark = false;

  get overTimeTitle(): string {
    return this.dayWindow ? "Fuel dispensed per hour" : "Fuel dispensed per day";
  }
}
