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
import { FormGroup, FormControl } from "@angular/forms";
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";
import { AlarmCondition } from "../../models/public-api";

@Component({
  selector: "tb-ts302-alarm-configuration",
  templateUrl: "./ts302-alarm-configuration.component.html",
  standalone: true,
  imports: [CommonModule, SharedModule],
})
export class TS302AlarmConfigurationComponent {
  @Input() alarmFormGroup: FormGroup;
  @Input() temperatureChn1AlarmEnableControl: FormControl<boolean>;
  @Input() temperatureChn2AlarmEnableControl: FormControl<boolean>;
  @Input() temperatureChn1MutationAlarmEnableControl: FormControl<boolean>;
  @Input() temperatureChn2MutationAlarmEnableControl: FormControl<boolean>;

  alarmConditionOptions = [
    { value: AlarmCondition.DISABLE, label: "Disabled" },
    { value: AlarmCondition.ABOVE, label: "Above" },
    { value: AlarmCondition.BELOW, label: "Below" },
    { value: AlarmCondition.BETWEEN, label: "Between" },
    { value: AlarmCondition.OUTSIDE, label: "Outside" },
  ];
}
