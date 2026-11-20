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

import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";
import { DataTableCellDirective, DataTableColumn, DataTableComponent } from "../../../components/shared/data-table/data-table.component";
import { SectionNavItem } from "../../../components/shared/section-nav/section-nav.component";
import { StatusPillComponent } from "../../../components/shared/status-pill/status-pill.component";
import { SummaryCard, SummaryCardsComponent } from "../../../components/shared/summary-cards/summary-cards.component";
import { fmtNumber } from "../../../components/shared/value-utils";
import { AsphaltDashboardSettings, TANK_STATUS_META, TankRow, asphaltDashboardDefaultSettings } from "../../models/asphalt-monitoring.models";
import { DashboardLoadingComponent, FirstLoad } from "../../../components/shared/dashboard-loading/dashboard-loading.component";
import { DEFAULT_PROFILE_ICON } from "../../../components/shared/profile-icons/profile-icons";
import { thresholdAlarmText } from "../../../components/shared/device-settings-card/threshold-alarm";

export const ASPHALT_SETTINGS_SECTIONS: SectionNavItem[] = [
  { id: "thresholds", label: "Alarm thresholds", icon: "rule" },
  { id: "tanks", label: "Tanks", icon: "oil_barrel" },
  { id: "keys", label: "Data keys", icon: "data_object" },
];

/**
 * The Settings page: every tank's threshold alarms (its own server attributes,
 * which the device profile's "Level" and "Temperature" alarm rules read), every tank with how it's set
 * up, and the data keys the dashboard reads. A row in either table opens that
 * tank's panel on its Settings tab, where its thresholds and set-up are edited.
 */
@Component({
  selector: "tb-asphalt-settings",
  templateUrl: "./asphalt-settings.component.html",
  styleUrls: ["./asphalt-settings.component.scss"],
  standalone: true,
  imports: [DashboardLoadingComponent, CommonModule, SharedModule, DataTableCellDirective, DataTableComponent, StatusPillComponent, SummaryCardsComponent],
})
export class AsphaltSettingsComponent implements OnChanges {
  /** The loading page: the settings the first time they show. */
  readonly firstLoad = new FirstLoad();

  @Input() section = "thresholds";
  @Input() settings: AsphaltDashboardSettings = asphaltDashboardDefaultSettings;
  @Input() tanks: TankRow[] = [];
  @Input() loading = false;
  /** A tank's icon — its profile's, from the dashboard (which repaints this page as the icons come in). */
  @Input() tankIcon: (tank: TankRow) => string = () => DEFAULT_PROFILE_ICON.device;
  /** A tank's row: open its panel on Settings. */
  @Output() tankClick = new EventEmitter<TankRow>();

  readonly statusMeta = TANK_STATUS_META;
  /** Both tables' name column shows the tank's profile icon. */
  readonly thresholdColumns: DataTableColumn[] = [
    { key: "name", phone: "title", header: "Name", iconOf: (r) => this.tankIcon(r["tank"]) },
    { key: "product", phone: "sub", header: "Product" },
    { key: "levelAlarm", phone: "trail", phoneHeader: "Level | Temp", header: "Level alarm" },
    { key: "temperatureAlarm", phone: "trail", header: "Temperature alarm" },
  ];
  readonly tankColumns: DataTableColumn[] = [
    { key: "name", phone: "title", header: "Name", iconOf: (r) => this.tankIcon(r["tank"]) },
    { key: "deviceName", phone: "sub", header: "Serial number" },
    { key: "product", phone: "sub", header: "Product" },
    { key: "size", phone: "hide", header: "Height × diameter" },
    { key: "capacity", phone: "hide", header: "Capacity" },
    { key: "sensor", phone: "hide", header: "Sensor" },
    { key: "status", phone: "trail", header: "Status" },
  ];
  tankRows: Record<string, any>[] = [];
  keyCards: SummaryCard[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["tanks"] || changes["settings"]) {
      this.tankRows = this.tanks.map((t) => ({
        id: t.deviceId,
        tank: t,
        name: t.name,
        deviceName: t.deviceName,
        product: t.product || "—",
        size:
          t.details.sizeMeasure.height && t.details.sizeMeasure.diameter
            ? `${fmtNumber(t.details.sizeMeasure.height, 1)} × ${fmtNumber(t.details.sizeMeasure.diameter, 1)} ${t.details.tankDimensionUnits}`
            : "—",
        capacity: t.capacity === null ? "—" : `${fmtNumber(t.capacity, 0)} ${t.capacityUnits}`,
        sensor: t.details.levelMeasurement ? `${t.details.levelMeasurement}, ${t.sensorUnits}` : "—",
        status: t.status,
        // Each threshold alarm in a few words: "Above 95%", "Outside 120–170 °C", "Off" (muted).
        levelAlarm: thresholdAlarmText(t.levelAlarmConfig, "%"),
        levelAlarmOff: !t.levelAlarmConfig?.enable,
        temperatureAlarm: thresholdAlarmText(t.temperatureAlarmConfig, "°C"),
        temperatureAlarmOff: !t.temperatureAlarmConfig?.enable,
      }));
    }
    if (changes["settings"]) {
      const s = this.settings;
      this.keyCards = [
        {
          id: "entities",
          title: "Entities",
          rows: [
            { label: "Tank device types", value: s.tankDeviceTypes.join(", ") },
            { label: "New tanks' device type", value: s.newTankDeviceType },
          ],
        },
        {
          id: "telemetry",
          title: "Telemetry",
          rows: [
            { label: "Level, %", value: s.levelPercentKey },
            { label: "Level reading", value: s.levelKey },
            { label: "Temperature", value: s.temperatureKey },
            { label: "Tonnage", value: s.tonnageKey },
            { label: "Battery", value: s.batteryKey },
          ],
        },
        {
          id: "attributes",
          title: "Tank attributes",
          rows: [
            { label: "Product", value: s.liquidTypeKey },
            { label: "Capacity / units", value: `${s.capacityKey} / ${s.capacityUnitsKey}` },
            { label: "Sensor units", value: s.sensorUnitsKey },
            { label: "Min level", value: s.minLevelThresholdKey },
          ],
        },
        {
          id: "burners",
          title: "Burners",
          rows: [
            { label: "Burner device types", value: s.burnerDeviceTypes.join(", ") },
            { label: "Low temperature", value: s.burnerLowTemperatureKey },
            { label: "Power phases", value: s.burnerPowerPhaseKeys.join(", ") },
          ],
        },
        {
          id: "alarms",
          title: "Alarms",
          rows: [
            { label: "Level threshold alarm", value: `${s.levelAlarmConfigKey} (a new tank: above ${s.defaultMaxLevelThreshold}%)` },
            { label: "Temperature threshold alarm", value: `${s.temperatureAlarmConfigKey} (a new tank: above ${s.defaultMaxTemperatureThreshold} °C)` },
            { label: "Level alarms", value: s.levelAlarmTypes.join(", ") },
            { label: "Temperature alarms", value: s.temperatureAlarmTypes.join(", ") },
            { label: "Low battery alarms", value: s.lowBatteryAlarmTypes.join(", ") },
          ],
        },
      ];
    }
  }

  onTankRow(row: Record<string, any>): void {
    this.tankClick.emit(row["tank"] as TankRow);
  }
}
