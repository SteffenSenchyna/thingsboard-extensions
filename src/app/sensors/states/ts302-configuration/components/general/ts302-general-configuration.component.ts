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
import { FormGroup } from "@angular/forms";
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";
import { TimeDisplay, TemperatureUnit, SensorType } from "../../models/public-api";

@Component({
  selector: "tb-ts302-general-configuration",
  templateUrl: "./ts302-general-configuration.component.html",
  styleUrls: ["./ts302-general-configuration.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule],
})
export class TS302GeneralConfigurationComponent {
  @Input() generalSettingsFormGroup: FormGroup;

  // Dropdown options
  timeDisplayOptions = [
    { value: TimeDisplay.HOUR_24, label: "24 Hour" },
    { value: TimeDisplay.HOUR_12, label: "12 Hour" },
  ];

  temperatureUnitOptions = [
    { value: TemperatureUnit.CELSIUS, label: "Celsius" },
    { value: TemperatureUnit.FAHRENHEIT, label: "Fahrenheit" },
  ];

  sensorTypeOptions = [
    { value: SensorType.TEMPERATURE_PROBE, label: "Temperature Probe" },
    { value: SensorType.DISABLED, label: "Disabled" },
  ];

  // Timezone options
  timezoneOptions = [
    "UTC-12",
    "UTC-11",
    "UTC-10",
    "UTC-9",
    "UTC-8",
    "UTC-7",
    "UTC-6",
    "UTC-5",
    "UTC-4",
    "UTC-3",
    "UTC-2",
    "UTC-1",
    "UTC+0",
    "UTC+1",
    "UTC+2",
    "UTC+3",
    "UTC+4",
    "UTC+5",
    "UTC+6",
    "UTC+7",
    "UTC+8",
    "UTC+9",
    "UTC+10",
    "UTC+11",
    "UTC+12",
  ];

  getFieldErrorMessage(fieldName: string): string {
    const control = this.generalSettingsFormGroup.get(fieldName);
    if (!control) {
      return "";
    }

    if (control.hasError("required")) {
      return `${this.getFieldLabel(fieldName)} is required`;
    }
    if (control.hasError("min")) {
      return "Must be at least 1";
    }
    return "Invalid value";
  }

  private getFieldLabel(fieldName: string): string {
    const labels: { [key: string]: string } = {
      reportInterval: "Report interval",
    };
    return labels[fieldName] || fieldName;
  }
}
