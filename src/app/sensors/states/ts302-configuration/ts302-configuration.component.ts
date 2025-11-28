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
import { FormBuilder, FormGroup, FormControl, Validators } from "@angular/forms";
import { MatDialogRef } from "@angular/material/dialog";
import { MatTabGroup } from "@angular/material/tabs";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { CommonModule } from "@angular/common";
import { forkJoin, of } from "rxjs";
import { AttributeService, deepTrim, DeviceService } from "@core/public-api";
import { DeviceId, NULL_UUID, AttributeScope, SharedModule } from "@shared/public-api";
import { Device } from "@shared/models/device.models";
import { TS302SensorConfig, TimeDisplay, TemperatureUnit, SensorType, AlarmCondition, TS302ConfigTab, TS302ConfigTabKey } from "./models/public-api";
import { TS302GeneralConfigurationComponent } from "./components/general/ts302-general-configuration.component";
import { TS302CalibrationConfigurationComponent } from "./components/calibration/ts302-calibration-configuration.component";
import { TS302AlarmConfigurationComponent } from "./components/alarm/ts302-alarm-configuration.component";

@Component({
  selector: "tb-ts302-configuration",
  templateUrl: "./ts302-configuration.component.html",
  styleUrls: ["./ts302-configuration.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, TS302GeneralConfigurationComponent, TS302CalibrationConfigurationComponent, TS302AlarmConfigurationComponent],
})
export class TS302ConfigurationComponent implements AfterViewInit {
  @Input() device: DeviceId;
  @Input() defaultTab: TS302ConfigTabKey;
  @Input() dialogRef: MatDialogRef<TS302ConfigurationComponent>;

  @ViewChild("configGroup") configGroup: MatTabGroup;

  ts302ConfigForm: FormGroup;

  // Alarm enable controls for expansion panels
  temperatureChn1AlarmEnableControl: FormControl<boolean>;
  temperatureChn2AlarmEnableControl: FormControl<boolean>;
  temperatureChn1MutationAlarmEnableControl: FormControl<boolean>;
  temperatureChn2MutationAlarmEnableControl: FormControl<boolean>;

  // Calibration enable controls for expansion panels
  temperatureChn1CalibrationEnableControl: FormControl<boolean>;
  temperatureChn2CalibrationEnableControl: FormControl<boolean>;

  // Store original config for change detection
  private originalConfig: Partial<TS302SensorConfig> = {};

  // Store device entity for label updates
  private deviceEntity: Device | null = null;

  // Server attribute keys (sensorChn1 and sensorChn2)
  private readonly SERVER_ATTRIBUTE_KEYS = ["sensorChn1", "sensorChn2"];

  constructor(private fb: FormBuilder, private attributeService: AttributeService, private deviceService: DeviceService, private cd: ChangeDetectorRef, private destroyRef: DestroyRef) {
    this.initializeForm();
    this.initializeAlarmControls();
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

    const formValue = deepTrim(this.ts302ConfigForm.value);
    const { entityLabel, ...config } = formValue;
    const changedAttributes = this.getChangedAttributes(config as TS302SensorConfig);

    // Check if entityLabel has changed
    const labelChanged = this.deviceEntity && this.deviceEntity.label !== entityLabel;

    if (changedAttributes.shared.length === 0 && changedAttributes.server.length === 0 && !labelChanged) {
      // No changes to save
      if (this.dialogRef) {
        this.dialogRef.close(config);
      } else {
        this.ts302ConfigForm.markAsPristine();
        this.cd.detectChanges();
      }
      return;
    }

    // Create observables for each scope that has changes
    const sharedObs$ = changedAttributes.shared.length > 0 ? this.attributeService.saveEntityAttributes(this.device, AttributeScope.SHARED_SCOPE, changedAttributes.shared) : of(null);

    const serverObs$ = changedAttributes.server.length > 0 ? this.attributeService.saveEntityAttributes(this.device, AttributeScope.SERVER_SCOPE, changedAttributes.server) : of(null);

    // Create observable for device label update
    const deviceObs$ = labelChanged
      ? (() => {
          this.deviceEntity.label = entityLabel;
          return this.deviceService.saveDevice(this.deviceEntity);
        })()
      : of(null);

    // Use forkJoin with array notation
    forkJoin([sharedObs$, serverObs$, deviceObs$])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        // Update original config with saved values
        this.originalConfig = JSON.parse(JSON.stringify(config));

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
      entityLabel: [null],
      reportInterval: [20, [Validators.required, Validators.min(1)]],
      timeZone: ["UTC+8", Validators.required],
      timeDisplay: [TimeDisplay.HOUR_24, Validators.required],
      syncTime: [true],
      temperatureUnitDisplay: [TemperatureUnit.CELSIUS, Validators.required],
      displayEnable: [true],
      historyEnable: [true],
      retransmitEnable: [true],
      retransmitInterval: [300, [Validators.required, Validators.min(30), Validators.max(1200)]],

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

  private fetchConfiguration(): void {
    if (this.device?.id === NULL_UUID) {
      return;
    }

    // Fetch device entity, shared and server attributes using array notation
    forkJoin([
      this.deviceService.getDevice(this.device.id),
      this.attributeService.getEntityAttributes(this.device, AttributeScope.SHARED_SCOPE),
      this.attributeService.getEntityAttributes(this.device, AttributeScope.SERVER_SCOPE),
    ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([deviceEntity, sharedAttributes, serverAttributes]) => {
        // Store device entity for label updates
        this.deviceEntity = deviceEntity;

        // Combine shared and server attributes
        const allAttributes = [...sharedAttributes, ...serverAttributes];
        const config = this.attributesToConfig(allAttributes);

        if (config) {
          // Store original config for change detection
          this.originalConfig = JSON.parse(JSON.stringify(config));

          // Patch form with config and device label
          this.ts302ConfigForm.patchValue({ ...config, entityLabel: deviceEntity?.label ?? null }, { emitEvent: false });

          // Update alarm enable controls based on fetched config
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

          // Update calibration enable controls based on fetched config
          if (config.temperatureChn1CalibrationSettings) {
            this.temperatureChn1CalibrationEnableControl.patchValue(config.temperatureChn1CalibrationSettings.enable || false, { emitEvent: false });
          }
          if (config.temperatureChn2CalibrationSettings) {
            this.temperatureChn2CalibrationEnableControl.patchValue(config.temperatureChn2CalibrationSettings.enable || false, { emitEvent: false });
          }

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

  private getChangedAttributes(config: TS302SensorConfig): { shared: Array<{ key: string; value: any }>; server: Array<{ key: string; value: any }> } {
    const changedShared: Array<{ key: string; value: any }> = [];
    const changedServer: Array<{ key: string; value: any }> = [];

    Object.entries(config).forEach(([key, value]) => {
      // Check if value has changed by deep comparison
      if (!this.isEqual(this.originalConfig[key], value)) {
        const attribute = { key, value };

        // Separate server attributes from shared attributes
        if (this.SERVER_ATTRIBUTE_KEYS.includes(key)) {
          changedServer.push(attribute);
        } else {
          changedShared.push(attribute);
        }
      }
    });

    return { shared: changedShared, server: changedServer };
  }

  private isEqual(a: any, b: any): boolean {
    // Deep equality check
    return JSON.stringify(a) === JSON.stringify(b);
  }

  private initializeAlarmControls(): void {
    // Initialize alarm enable controls
    this.temperatureChn1AlarmEnableControl = this.fb.control(false);
    this.temperatureChn2AlarmEnableControl = this.fb.control(false);
    this.temperatureChn1MutationAlarmEnableControl = this.fb.control(false);
    this.temperatureChn2MutationAlarmEnableControl = this.fb.control(false);

    // Initialize calibration enable controls
    this.temperatureChn1CalibrationEnableControl = this.fb.control(false);
    this.temperatureChn2CalibrationEnableControl = this.fb.control(false);

    // Sync Channel 1 alarm control with form group
    this.temperatureChn1AlarmEnableControl.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((enable) => {
      const alarmConfig = this.ts302ConfigForm.get("temperatureChn1AlarmConfig") as FormGroup;
      alarmConfig.patchValue({ enable }, { emitEvent: false });
    });

    // Sync Channel 2 alarm control with form group
    this.temperatureChn2AlarmEnableControl.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((enable) => {
      const alarmConfig = this.ts302ConfigForm.get("temperatureChn2AlarmConfig") as FormGroup;
      alarmConfig.patchValue({ enable }, { emitEvent: false });
    });

    // Sync Channel 1 mutation alarm control with form group
    this.temperatureChn1MutationAlarmEnableControl.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((enable) => {
      const mutationConfig = this.ts302ConfigForm.get("temperatureChn1MutationAlarmConfig") as FormGroup;
      mutationConfig.patchValue({ enable }, { emitEvent: false });
    });

    // Sync Channel 2 mutation alarm control with form group
    this.temperatureChn2MutationAlarmEnableControl.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((enable) => {
      const mutationConfig = this.ts302ConfigForm.get("temperatureChn2MutationAlarmConfig") as FormGroup;
      mutationConfig.patchValue({ enable }, { emitEvent: false });
    });

    // Sync Channel 1 calibration control with form group
    this.temperatureChn1CalibrationEnableControl.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((enable) => {
      const calibrationConfig = this.ts302ConfigForm.get("temperatureChn1CalibrationSettings") as FormGroup;
      calibrationConfig.patchValue({ enable }, { emitEvent: false });
    });

    // Sync Channel 2 calibration control with form group
    this.temperatureChn2CalibrationEnableControl.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((enable) => {
      const calibrationConfig = this.ts302ConfigForm.get("temperatureChn2CalibrationSettings") as FormGroup;
      calibrationConfig.patchValue({ enable }, { emitEvent: false });
    });
  }
}
