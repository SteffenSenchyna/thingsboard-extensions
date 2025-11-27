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

import { Component, forwardRef, Input, ViewChild, AfterViewInit } from "@angular/core";
import { ControlValueAccessor, NG_VALUE_ACCESSOR, FormGroup, FormBuilder, FormControl, Validators } from "@angular/forms";
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";
import { MatTabGroup } from "@angular/material/tabs";
import { TS302GeneralConfigurationComponent } from "./general/ts302-general-configuration.component";
import { TS302CalibrationConfigurationComponent } from "./calibration/ts302-calibration-configuration.component";
import { TS302AlarmConfigurationComponent } from "./alarm/ts302-alarm-configuration.component";
import { TimeDisplay, TemperatureUnit, SensorType, AlarmCondition, TS302ConfigTab, TS302ConfigTabKey } from "../models/public-api";

@Component({
  selector: "tb-ts302-basic-configuration",
  templateUrl: "./ts302-basic-configuration.component.html",
  styleUrls: ["./ts302-basic-configuration.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, TS302GeneralConfigurationComponent, TS302CalibrationConfigurationComponent, TS302AlarmConfigurationComponent],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => TS302BasicConfigurationComponent),
      multi: true,
    },
  ],
})
export class TS302BasicConfigurationComponent implements ControlValueAccessor, AfterViewInit {
  @Input() defaultTab: TS302ConfigTabKey;
  @Input() dialogMode = false;

  @ViewChild("configGroup") configGroup: MatTabGroup;

  ts302BasicForm: FormGroup;
  TS302ConfigTab = TS302ConfigTab;

  constructor(private fb: FormBuilder) {
    this.initializeForm();
    this.initializeControls();
  }

  ngAfterViewInit(): void {
    if (this.defaultTab && this.configGroup) {
      this.configGroup.selectedIndex = TS302ConfigTab[this.defaultTab];
    }
  }

  writeValue(value: any): void {
    if (value) {
      this.ts302BasicForm.patchValue(value, { emitEvent: false });
      this.updateEnableControls(value);
    }
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
    this.ts302BasicForm.valueChanges.subscribe(fn);
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    if (isDisabled) {
      this.ts302BasicForm.disable();
    } else {
      this.ts302BasicForm.enable();
    }
  }

  private onChange: (value: any) => void = () => {};

  private onTouched: () => void = () => {};

  private initializeForm(): void {
    this.ts302BasicForm = this.fb.group({
      reportInterval: [20, [Validators.required, Validators.min(1)]],
      timeZone: ["UTC+8", Validators.required],
      timeDisplay: [TimeDisplay.HOUR_24, Validators.required],
      syncTime: [true],
      temperatureUnitDisplay: [TemperatureUnit.CELSIUS, Validators.required],
      displayEnable: [true],
      sensorChn1: [SensorType.TEMPERATURE_PROBE, Validators.required],
      sensorChn2: [SensorType.TEMPERATURE_PROBE, Validators.required],
      temperatureChn1CalibrationSettings: this.fb.group({
        enable: [false],
        calibrationValue: [0],
      }),
      temperatureChn2CalibrationSettings: this.fb.group({
        enable: [false],
        calibrationValue: [0],
      }),
      temperatureChn1AlarmConfig: this.fb.group({
        enable: [false],
        alarmReleaseEnable: [false],
        condition: [AlarmCondition.DISABLE],
        thresholdMin: [0],
        thresholdMax: [0],
        alarmReportingTimes: [1, [Validators.min(1)]],
        alarmReportingInterval: [1, [Validators.min(1)]],
      }),
      temperatureChn2AlarmConfig: this.fb.group({
        enable: [false],
        alarmReleaseEnable: [false],
        condition: [AlarmCondition.DISABLE],
        thresholdMin: [0],
        thresholdMax: [0],
        alarmReportingTimes: [1, [Validators.min(1)]],
        alarmReportingInterval: [1, [Validators.min(1)]],
      }),
      temperatureChn1MutationAlarmConfig: this.fb.group({
        enable: [false],
        mutation: [0],
      }),
      temperatureChn2MutationAlarmConfig: this.fb.group({
        enable: [false],
        mutation: [0],
      }),
    });
  }

  private initializeControls(): void {
    // No external controls needed - all managed by form groups
  }

  private updateEnableControls(config: any): void {
    // No external controls to sync
  }
}
