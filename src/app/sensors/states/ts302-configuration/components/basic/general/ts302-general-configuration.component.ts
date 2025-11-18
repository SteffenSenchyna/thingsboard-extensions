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
import {
  getTimeDisplayOptions,
  getTemperatureUnitOptions,
  getSensorTypeOptions,
} from "../../../models/public-api";

@Component({
  selector: "tb-ts302-general-configuration",
  templateUrl: "./ts302-general-configuration.component.html",
  standalone: true,
  imports: [CommonModule, SharedModule],
})
export class TS302GeneralConfigurationComponent {
  @Input() generalSettingsFormGroup: FormGroup;

  // Dropdown options
  timeDisplayOptions = getTimeDisplayOptions();
  temperatureUnitOptions = getTemperatureUnitOptions();
  sensorTypeOptions = getSensorTypeOptions();

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

  preventInvalidNumberInput(event: KeyboardEvent): void {
    const input = event.target as HTMLInputElement;
    const key = event.key;

    // Prevent minus, e, E
    if (key === '-' || key === 'e' || key === 'E') {
      event.preventDefault();
      return;
    }

    // Prevent 0 when field is empty or all text is selected
    if (key === '0') {
      if (!input.value || (input.selectionStart === 0 && input.selectionEnd === input.value.length)) {
        event.preventDefault();
      }
    }
  }

  clearZeroValue(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.value === '0') {
      input.value = '';
    }
  }

  updateReportInterval(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = parseInt(input.value, 10);
    this.generalSettingsFormGroup.get('reportInterval')?.setValue(value);
    this.generalSettingsFormGroup.get('reportInterval')?.markAsTouched();
  }

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
    if (control.hasError("max")) {
      return "Must not exceed 1440";
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
