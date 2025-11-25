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
import { getTimeDisplayOptions, getTemperatureUnitOptions, getSensorTypeOptions } from "../../../models/public-api";
import { SliderInputComponent, MobileHintTooltipDirective } from "../../../../../../components/shared/public-api";

@Component({
  selector: "tb-ts302-general-configuration",
  templateUrl: "./ts302-general-configuration.component.html",
  standalone: true,
  imports: [CommonModule, SharedModule, SliderInputComponent, MobileHintTooltipDirective],
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
}
