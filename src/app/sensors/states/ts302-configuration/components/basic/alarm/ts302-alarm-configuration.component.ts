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
import { getAlarmConditionOptions } from "../../../models/public-api";

@Component({
  selector: "tb-ts302-alarm-configuration",
  templateUrl: "./ts302-alarm-configuration.component.html",
  standalone: true,
  imports: [CommonModule, SharedModule],
})
export class TS302AlarmConfigurationComponent {
  @Input() alarmFormGroup: FormGroup;

  alarmConditionOptions = getAlarmConditionOptions();

  get temperatureChn1AlarmConfig(): FormGroup {
    return this.alarmFormGroup.get("temperatureChn1AlarmConfig") as FormGroup;
  }

  get temperatureChn1AlarmEnableControl(): FormControl<boolean> {
    return this.temperatureChn1AlarmConfig?.get("enable") as FormControl<boolean>;
  }

  get temperatureChn2AlarmConfig(): FormGroup {
    return this.alarmFormGroup.get("temperatureChn2AlarmConfig") as FormGroup;
  }

  get temperatureChn2AlarmEnableControl(): FormControl<boolean> {
    return this.temperatureChn2AlarmConfig?.get("enable") as FormControl<boolean>;
  }

  get temperatureChn1MutationAlarmConfig(): FormGroup {
    return this.alarmFormGroup.get("temperatureChn1MutationAlarmConfig") as FormGroup;
  }

  get temperatureChn1MutationAlarmEnableControl(): FormControl<boolean> {
    return this.temperatureChn1MutationAlarmConfig?.get("enable") as FormControl<boolean>;
  }

  get temperatureChn2MutationAlarmConfig(): FormGroup {
    return this.alarmFormGroup.get("temperatureChn2MutationAlarmConfig") as FormGroup;
  }

  get temperatureChn2MutationAlarmEnableControl(): FormControl<boolean> {
    return this.temperatureChn2MutationAlarmConfig?.get("enable") as FormControl<boolean>;
  }
}
