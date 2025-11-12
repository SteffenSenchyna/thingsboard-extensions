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

import { ChangeDetectorRef, Component, Input, AfterViewInit, DestroyRef, ViewChild } from "@angular/core";
import { FormBuilder, FormGroup, Validators } from "@angular/forms";
import { MatDialogRef } from "@angular/material/dialog";
import { MatTabGroup } from "@angular/material/tabs";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { CommonModule } from "@angular/common";
import { AttributeService, deepTrim } from "@core/public-api";
import { DeviceId, NULL_UUID, AttributeScope, SharedModule } from "@shared/public-api";
import {
  TS302SensorConfig,
  TimeDisplay,
  TemperatureUnit,
  SensorType,
  AlarmCondition,
  TS302ConfigTab,
  TS302ConfigTabKey,
} from "./models/public-api";

@Component({
  selector: "tb-ts302-sensor-configuration",
  templateUrl: "./ts302-sensor-configuration.component.html",
  styleUrls: ["./ts302-sensor-configuration.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule],
})
export class TS302SensorConfigurationComponent implements AfterViewInit {
  @Input() device: DeviceId;
  @Input() defaultTab: TS302ConfigTabKey;
  @Input() dialogRef: MatDialogRef<TS302SensorConfigurationComponent>;

  @ViewChild("configGroup") configGroup: MatTabGroup;

  ts302ConfigForm: FormGroup;

  // Tab enum for template
  TS302ConfigTab = TS302ConfigTab;

  // Enums for template
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

  alarmConditionOptions = [
    { value: AlarmCondition.DISABLE, label: "Disabled" },
    { value: AlarmCondition.ABOVE, label: "Above" },
    { value: AlarmCondition.BELOW, label: "Below" },
    { value: AlarmCondition.BETWEEN, label: "Between" },
  ];

  // Timezone options (simplified - you may want to expand this)
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

  constructor(private fb: FormBuilder, private attributeService: AttributeService, private cd: ChangeDetectorRef, private destroyRef: DestroyRef) {
    this.initializeForm();
  }

  ngAfterViewInit(): void {
    if (this.defaultTab) {
      this.configGroup.selectedIndex = TS302ConfigTab[this.defaultTab];
    }
    this.fetchConfiguration();
  }

  saveConfig(): void {
    if (this.ts302ConfigForm.invalid) {
      return;
    }

    const config = deepTrim(this.ts302ConfigForm.value) as TS302SensorConfig;
    const attributes = this.configToAttributes(config);

    this.attributeService
      .saveEntityAttributes(this.device, AttributeScope.SHARED_SCOPE, attributes)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.dialogRef) {
          this.dialogRef.close(config);
        } else {
          this.ts302ConfigForm.markAsPristine();
          this.cd.detectChanges();
        }
      });
  }

  cancel(): void {
    if (this.dialogRef) {
      this.dialogRef.close();
    }
  }

  private initializeForm(): void {
    this.ts302ConfigForm = this.fb.group({
      // Basic settings
      reportInterval: [20, [Validators.required, Validators.min(1)]],
      collectionInterval: [300, [Validators.required, Validators.min(1)]],
      timeZone: ["UTC+8", Validators.required],
      timeDisplay: [TimeDisplay.HOUR_24, Validators.required],
      syncTime: [true],
      temperatureUnitDisplay: [TemperatureUnit.CELSIUS, Validators.required],
      displayEnable: [true],

      // Sensor channels
      sensorChn1: [SensorType.TEMPERATURE_PROBE, Validators.required],
      sensorChn2: [SensorType.TEMPERATURE_PROBE, Validators.required],

      // Channel 1 calibration
      temperatureChn1CalibrationSettings: this.fb.group({
        enable: [false],
        calibrationValue: [0],
      }),

      // Channel 2 calibration
      temperatureChn2CalibrationSettings: this.fb.group({
        enable: [false],
        calibrationValue: [0],
      }),

      // Channel 1 alarm config
      temperatureChn1AlarmConfig: this.fb.group({
        enable: [false],
        alarmReleaseEnable: [false],
        condition: [AlarmCondition.DISABLE],
        thresholdMin: [0],
        thresholdMax: [0],
        alarmReportingTimes: [1, [Validators.min(1)]],
        alarmReportingInterval: [1, [Validators.min(1)]],
      }),

      // Channel 2 alarm config
      temperatureChn2AlarmConfig: this.fb.group({
        enable: [false],
        alarmReleaseEnable: [false],
        condition: [AlarmCondition.DISABLE],
        thresholdMin: [0],
        thresholdMax: [0],
        alarmReportingTimes: [1, [Validators.min(1)]],
        alarmReportingInterval: [1, [Validators.min(1)]],
      }),

      // Channel 1 mutation alarm
      temperatureChn1MutationAlarmConfig: this.fb.group({
        enable: [false],
        mutation: [0],
      }),

      // Channel 2 mutation alarm
      temperatureChn2MutationAlarmConfig: this.fb.group({
        enable: [false],
        mutation: [0],
      }),
    });
  }

  private fetchConfiguration(): void {
    if (this.device?.id === NULL_UUID) {
      return;
    }

    this.attributeService
      .getEntityAttributes(this.device, AttributeScope.SHARED_SCOPE)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((attributes) => {
        const config = this.attributesToConfig(attributes);
        if (config) {
          this.ts302ConfigForm.patchValue(config, { emitEvent: false });
          this.ts302ConfigForm.markAsPristine();
          this.cd.detectChanges();
        }
      });
  }

  private attributesToConfig(attributes: any[]): Partial<TS302SensorConfig> | null {
    if (!attributes || attributes.length === 0) {
      return null;
    }

    const config: any = {};

    attributes.forEach((attr) => {
      config[attr.key] = attr.value;
    });

    return config;
  }

  private configToAttributes(config: TS302SensorConfig): Array<{ key: string; value: any }> {
    return Object.entries(config).map(([key, value]) => ({
      key,
      value,
    }));
  }
}
