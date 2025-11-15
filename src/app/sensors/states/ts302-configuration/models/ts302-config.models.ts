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

export enum TimeDisplay {
  HOUR_24 = "24_hour",
  HOUR_12 = "12_hour",
}

export enum TemperatureUnit {
  CELSIUS = "celsius",
  FAHRENHEIT = "fahrenheit",
}

export enum SensorType {
  TEMPERATURE_PROBE = "temperatureProbe",
  CONTACT_SWITCH = "contactSwitch",
  DISABLED = "disabled",
}

export enum SensorTypeActive {
  TEMPERATURE_PROBE = "temperatureProbe",
  CONTACT_SWITCH = "contactSwitch",
}

export enum AlarmCondition {
  DISABLE = "disable",
  ABOVE = "above",
  BELOW = "below",
  BETWEEN = "between",
  OUTSIDE = "outside",
}

// Label mappings
export const TimeDisplayLabels: Record<TimeDisplay, string> = {
  [TimeDisplay.HOUR_24]: "24 Hour",
  [TimeDisplay.HOUR_12]: "12 Hour",
};

export const TemperatureUnitLabels: Record<TemperatureUnit, string> = {
  [TemperatureUnit.CELSIUS]: "Celsius",
  [TemperatureUnit.FAHRENHEIT]: "Fahrenheit",
};

export const SensorTypeLabels: Record<SensorType, string> = {
  [SensorType.TEMPERATURE_PROBE]: "Temperature Probe",
  [SensorType.CONTACT_SWITCH]: "Contact Switch",
  [SensorType.DISABLED]: "Disabled",
};

export const SensorTypeActiveLabels: Record<SensorTypeActive, string> = {
  [SensorTypeActive.TEMPERATURE_PROBE]: "Temperature Probe",
  [SensorTypeActive.CONTACT_SWITCH]: "Contact Switch",
};

export const AlarmConditionLabels: Record<AlarmCondition, string> = {
  [AlarmCondition.DISABLE]: "Disabled",
  [AlarmCondition.ABOVE]: "Above",
  [AlarmCondition.BELOW]: "Below",
  [AlarmCondition.BETWEEN]: "Between",
  [AlarmCondition.OUTSIDE]: "Outside",
};

// Option type for select dropdowns
export interface SelectOption<T> {
  value: T;
  label: string;
}

// Helper functions to get options arrays
export function getTimeDisplayOptions(): SelectOption<TimeDisplay>[] {
  return Object.values(TimeDisplay).map(value => ({
    value,
    label: TimeDisplayLabels[value],
  }));
}

export function getTemperatureUnitOptions(): SelectOption<TemperatureUnit>[] {
  return Object.values(TemperatureUnit).map(value => ({
    value,
    label: TemperatureUnitLabels[value],
  }));
}

export function getSensorTypeOptions(): SelectOption<SensorType>[] {
  return Object.values(SensorType).map(value => ({
    value,
    label: SensorTypeLabels[value],
  }));
}

export function getSensorTypeActiveOptions(): SelectOption<SensorTypeActive>[] {
  return Object.values(SensorTypeActive).map(value => ({
    value,
    label: SensorTypeActiveLabels[value],
  }));
}

export function getAlarmConditionOptions(): SelectOption<AlarmCondition>[] {
  return Object.values(AlarmCondition).map(value => ({
    value,
    label: AlarmConditionLabels[value],
  }));
}

export interface CalibrationSettings {
  enable: boolean;
  calibrationValue: number;
}

export interface AlarmConfig {
  enable: boolean;
  alarmReleaseEnable: boolean;
  condition: AlarmCondition;
  thresholdMin: number;
  thresholdMax: number;
  alarmReportingTimes: number;
  alarmReportingInterval: number;
}

export interface MutationAlarmConfig {
  enable: boolean;
  mutation: number;
}

export interface TS302SensorConfig {
  reportInterval: number;
  collectionInterval: number;
  timeZone: string;
  timeDisplay: TimeDisplay;
  syncTime: boolean;
  temperatureUnitDisplay: TemperatureUnit;
  displayEnable: boolean;
  sensorChn1: SensorType;
  sensorChn2: SensorType;
  temperatureChn1CalibrationSettings: CalibrationSettings;
  temperatureChn2CalibrationSettings: CalibrationSettings;
  temperatureChn1AlarmConfig: AlarmConfig;
  temperatureChn2AlarmConfig: AlarmConfig;
  temperatureChn1MutationAlarmConfig: MutationAlarmConfig;
  temperatureChn2MutationAlarmConfig: MutationAlarmConfig;
}

export enum TS302ConfigTab {
  basic,
  sensors,
  calibration,
  alarms,
  mutationAlarms,
}

export type TS302ConfigTabKey = keyof typeof TS302ConfigTab;
