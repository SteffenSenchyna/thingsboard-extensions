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
import { TS302GeneralConfigurationComponent } from "../general/ts302-general-configuration.component";
import { TS302CalibrationConfigurationComponent } from "../calibration/ts302-calibration-configuration.component";
import { TS302AlarmConfigurationComponent } from "../alarm/ts302-alarm-configuration.component";
import { TimeDisplay, TemperatureUnit, SensorType, AlarmCondition, TS302ConfigTab, TS302ConfigTabKey } from "../../models/public-api";

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

  // Form controls for expansion panels
  temperatureChn1CalibrationEnableControl: FormControl<boolean>;
  temperatureChn2CalibrationEnableControl: FormControl<boolean>;
  temperatureChn1AlarmEnableControl: FormControl<boolean>;
  temperatureChn2AlarmEnableControl: FormControl<boolean>;
  temperatureChn1MutationAlarmEnableControl: FormControl<boolean>;
  temperatureChn2MutationAlarmEnableControl: FormControl<boolean>;

  private onChange: (value: any) => void = () => {};
  private onTouched: () => void = () => {};

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
    this.temperatureChn1CalibrationEnableControl = this.fb.control(false);
    this.temperatureChn2CalibrationEnableControl = this.fb.control(false);
    this.temperatureChn1AlarmEnableControl = this.fb.control(false);
    this.temperatureChn2AlarmEnableControl = this.fb.control(false);
    this.temperatureChn1MutationAlarmEnableControl = this.fb.control(false);
    this.temperatureChn2MutationAlarmEnableControl = this.fb.control(false);

    // Sync controls with form groups
    this.temperatureChn1CalibrationEnableControl.valueChanges.subscribe((enable) => {
      const calibrationConfig = this.ts302BasicForm.get("temperatureChn1CalibrationSettings") as FormGroup;
      calibrationConfig.patchValue({ enable }, { emitEvent: false });
    });

    this.temperatureChn2CalibrationEnableControl.valueChanges.subscribe((enable) => {
      const calibrationConfig = this.ts302BasicForm.get("temperatureChn2CalibrationSettings") as FormGroup;
      calibrationConfig.patchValue({ enable }, { emitEvent: false });
    });

    this.temperatureChn1AlarmEnableControl.valueChanges.subscribe((enable) => {
      const alarmConfig = this.ts302BasicForm.get("temperatureChn1AlarmConfig") as FormGroup;
      alarmConfig.patchValue({ enable }, { emitEvent: false });
    });

    this.temperatureChn2AlarmEnableControl.valueChanges.subscribe((enable) => {
      const alarmConfig = this.ts302BasicForm.get("temperatureChn2AlarmConfig") as FormGroup;
      alarmConfig.patchValue({ enable }, { emitEvent: false });
    });

    this.temperatureChn1MutationAlarmEnableControl.valueChanges.subscribe((enable) => {
      const mutationConfig = this.ts302BasicForm.get("temperatureChn1MutationAlarmConfig") as FormGroup;
      mutationConfig.patchValue({ enable }, { emitEvent: false });
    });

    this.temperatureChn2MutationAlarmEnableControl.valueChanges.subscribe((enable) => {
      const mutationConfig = this.ts302BasicForm.get("temperatureChn2MutationAlarmConfig") as FormGroup;
      mutationConfig.patchValue({ enable }, { emitEvent: false });
    });
  }

  private updateEnableControls(config: any): void {
    if (config.temperatureChn1CalibrationSettings) {
      this.temperatureChn1CalibrationEnableControl.patchValue(config.temperatureChn1CalibrationSettings.enable || false, { emitEvent: false });
    }
    if (config.temperatureChn2CalibrationSettings) {
      this.temperatureChn2CalibrationEnableControl.patchValue(config.temperatureChn2CalibrationSettings.enable || false, { emitEvent: false });
    }
    if (config.temperatureChn1AlarmConfig) {
      this.temperatureChn1AlarmEnableControl.patchValue(config.temperatureChn1AlarmConfig.enable || false, { emitEvent: false });
    }
    if (config.temperatureChn2AlarmConfig) {
      this.temperatureChn2AlarmEnableControl.patchValue(config.temperatureChn2AlarmConfig.enable || false, { emitEvent: false });
    }
    if (config.temperatureChn1MutationAlarmConfig) {
      this.temperatureChn1MutationAlarmEnableControl.patchValue(config.temperatureChn1MutationAlarmConfig.enable || false, { emitEvent: false });
    }
    if (config.temperatureChn2MutationAlarmConfig) {
      this.temperatureChn2MutationAlarmEnableControl.patchValue(config.temperatureChn2MutationAlarmConfig.enable || false, { emitEvent: false });
    }
  }
}
