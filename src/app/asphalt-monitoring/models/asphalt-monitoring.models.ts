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

import { StatusPillTone } from "../../components/shared/status-pill/status-pill.component";

// ---------------------------------------------------------------------------
// Settings — where the dashboard reads / writes each value on the tank devices
// (the keys ThingsBoard's "Tank level monitoring" template uses). Every key can
// be overridden from the widget's settings (ctx.settings).
// ---------------------------------------------------------------------------

export interface AsphaltDashboardSettings {
  /** Device profiles (device types) listed as tanks. */
  tankDeviceTypes: string[];
  /** Device profile a tank added from the dashboard is created with. */
  newTankDeviceType: string;
  /** TIME SERIES: fill level in % of the tank's capacity. */
  levelPercentKey: string;
  /** TIME SERIES: the sensor's level reading, in {@link sensorUnitsKey}. */
  levelKey: string;
  /** TIME SERIES: product temperature, °C. */
  temperatureKey: string;
  /** TIME SERIES: product mass, t. */
  tonnageKey: string;
  /** TIME SERIES: sensor battery, %. */
  batteryKey: string;
  /** SERVER attributes written by the tank form (see {@link TankDetails}). */
  liquidTypeKey: string;
  capacityKey: string;
  capacityUnitsKey: string;
  sensorUnitsKey: string;
  /** SERVER attribute: the tank's own minimum level, in {@link sensorUnitsKey}. */
  minLevelThresholdKey: string;
  /**
   * The alarm types behind each condition (the Status filter, the red level and
   * temperature, the map pins): a tank is in a condition while it has an ACTIVE
   * alarm of one of these types. (The rule chain's `isHighLevel`-style flags
   * aren't used: they're only recounted when an alarm is raised, so they stay
   * set after the alarm clears.) Offline comes from the device's `active` state.
   */
  highLevelAlarmTypes: string[];
  lowBatteryAlarmTypes: string[];
  lowTemperatureAlarmTypes: string[];
  highTemperatureAlarmTypes: string[];
  /**
   * Each tank's alarm thresholds — its own SERVER attributes, which the device
   * profile's alarm rules read: "High Level" raises when the level (%) goes
   * above `maxLevelThresholdKey`, "High Temperature" when the temperature (°C)
   * reaches `maxTemperatureThresholdKey`. A tank without the attribute uses the
   * rule's default, mirrored here.
   */
  maxLevelThresholdKey: string;
  maxTemperatureThresholdKey: string;
  defaultMaxLevelThreshold: number;
  defaultMaxTemperatureThreshold: number;
  /**
   * The burners (the rail's Burners page): devices of these profiles and their
   * state time series (booleans). The profile's alarm rules raise "Low
   * Temperature" while `lowTemperature` is true and "No Power Phase N" while a
   * phase is false, so true is the fault for the first and false for the phases.
   */
  burnerDeviceTypes: string[];
  burnerLowTemperatureKey: string;
  burnerPowerPhaseKeys: string[];
}

export const asphaltDashboardDefaultSettings: AsphaltDashboardSettings = {
  tankDeviceTypes: ["Asphalt tank"],
  newTankDeviceType: "Asphalt tank",
  levelPercentKey: "tankLevel",
  levelKey: "level",
  temperatureKey: "temperature",
  tonnageKey: "tonnage",
  batteryKey: "battery",
  liquidTypeKey: "liquidType",
  capacityKey: "tankCapacity",
  capacityUnitsKey: "tankCapacityOutput",
  sensorUnitsKey: "sensorDimensionUnits",
  minLevelThresholdKey: "minLevelThreshold",
  highLevelAlarmTypes: ["High Level"],
  lowBatteryAlarmTypes: ["Low Battery Level", "Low Battery"],
  lowTemperatureAlarmTypes: ["Low Temperature"],
  highTemperatureAlarmTypes: ["High Temperature"],
  maxLevelThresholdKey: "maxLevelThreshold",
  maxTemperatureThresholdKey: "maxTemperatureThreshold",
  defaultMaxLevelThreshold: 95,
  defaultMaxTemperatureThreshold: 170,
  burnerDeviceTypes: ["Burner"],
  burnerLowTemperatureKey: "lowTemperature",
  burnerPowerPhaseKeys: ["powerPhase1", "powerPhase2", "powerPhase3"],
};

// ---------------------------------------------------------------------------
// Tank geometry, units and products (the tank form)
// ---------------------------------------------------------------------------

/**
 * Every tank is a vertical cylinder, sized by its height and diameter. The
 * shape is still written to the tank's `tankShape` attribute, which
 * ThingsBoard's own tank widgets read.
 */
export const TANK_SHAPE = "Vertical Cylinder";

export type TankDimensionField = "height" | "diameter";

/** The tank's dimensions, in form order. */
export const TANK_DIMENSIONS: { id: TankDimensionField; label: string }[] = [
  { id: "height", label: "Height" },
  { id: "diameter", label: "Diameter" },
];

export type MeasurementSystem = "Metric" | "Imperial";

export const MEASUREMENT_SYSTEMS: MeasurementSystem[] = ["Metric", "Imperial"];

/** Length units per system (the tank's dimensions, the sensor's readings). */
export const DIMENSION_UNITS: Record<MeasurementSystem, string[]> = {
  Metric: ["mm", "cm", "m"],
  Imperial: ["in", "ft"],
};

/** Volume units per system (the capacity). */
export const CAPACITY_UNITS: Record<MeasurementSystem, string[]> = {
  Metric: ["L", "mm³", "cm³", "m³"],
  Imperial: ["gal", "in³", "ft³"],
};

export type LevelMeasurement = "Remaining space" | "Fill height";

export const LEVEL_MEASUREMENTS: LevelMeasurement[] = ["Remaining space", "Fill height"];

export const LIQUID_TYPES: string[] = [
  "Asphalt (64 - 22)",
  "Asphalt (58 - 28)",
  "Gasoline regular (87 octane)",
  "Gasoline mid-grade (89 octane)",
  "Gasoline premium (91-93 octane)",
  "Diesel",
  "Flex Fuel (E85)",
  "Biodiesel B5 (5%)",
  "Biodiesel B20 (20%)",
  "Propane (LPG)",
];

/** A length in any dimension unit → centimetres. */
export function toCentimetres(value: number, unit: string): number {
  switch (unit) {
    case "in":
      return value * 2.54;
    case "ft":
      return value * 30.48;
    case "mm":
      return value / 10;
    case "m":
      return value * 100;
    default:
      return value;
  }
}

/** A volume in litres → the capacity unit. */
export function fromLitres(litres: number, unit: string): number {
  switch (unit) {
    case "gal":
      return litres * 0.264172;
    case "in³":
      return litres * 61.0237;
    case "ft³":
      return litres * 0.0353147;
    case "mm³":
      return litres * 1000000;
    case "cm³":
      return litres * 1000;
    case "m³":
      return litres * 0.001;
    default:
      return litres;
  }
}

/**
 * A vertical cylinder's capacity, π·r²·h, from its height and diameter (in
 * `dimensionUnit`), in `capacityUnit`. Null while either is missing or not
 * positive.
 */
export function tankCapacity(height: number | null | undefined, diameter: number | null | undefined, dimensionUnit: string, capacityUnit: string): number | null {
  if (!(Number(height) > 0) || !(Number(diameter) > 0)) {
    return null;
  }
  const h = toCentimetres(Number(height), dimensionUnit);
  const r = toCentimetres(Number(diameter), dimensionUnit) / 2;
  const cubicCm = Math.PI * r * r * h;
  return Math.round(fromLitres(cubicCm / 1000, capacityUnit) * 100) / 100;
}

/** The tank form's value — the tank's SERVER attributes, plus its device name and label. */
export interface TankDetails {
  liquidType: string;
  /** Always {@link TANK_SHAPE}. */
  tankShape: string;
  tankMeasurementSystem: MeasurementSystem;
  tankDimensionUnits: string;
  sizeMeasure: Partial<Record<TankDimensionField, number | null>>;
  tankCapacityOutput: string;
  tankCapacity: number | null;
  levelMeasurement: LevelMeasurement | "";
  /** Distance from the sensor to the full level (only with "Remaining space"). */
  sensorGap: number | null;
  sensorMeasurementSystem: MeasurementSystem;
  sensorDimensionUnits: string;
}

export interface TankFormValue {
  /** The device name (its serial number). */
  name: string;
  /** The device label (the tank's display name). */
  label: string;
  details: TankDetails;
}

/** The attribute keys the tank form writes (every field of {@link TankDetails}). */
export const TANK_DETAIL_KEYS: (keyof TankDetails)[] = [
  "liquidType",
  "tankShape",
  "tankMeasurementSystem",
  "tankDimensionUnits",
  "sizeMeasure",
  "tankCapacityOutput",
  "tankCapacity",
  "levelMeasurement",
  "sensorGap",
  "sensorMeasurementSystem",
  "sensorDimensionUnits",
];

export const emptyTankDetails: TankDetails = {
  liquidType: "",
  tankShape: TANK_SHAPE,
  tankMeasurementSystem: "Metric",
  tankDimensionUnits: "cm",
  sizeMeasure: {},
  tankCapacityOutput: "L",
  tankCapacity: null,
  levelMeasurement: "",
  sensorGap: null,
  sensorMeasurementSystem: "Metric",
  sensorDimensionUnits: "mm",
};

// ---------------------------------------------------------------------------
// Tanks
// ---------------------------------------------------------------------------

/** The conditions a tank can be in — the sidebar's Status filter. */
export type TankCondition = "noAlarms" | "highLevel" | "lowBattery" | "lowTemperature" | "highTemperature" | "offline";

export const TANK_CONDITIONS: { id: TankCondition; label: string; icon: string; tone: StatusPillTone }[] = [
  { id: "noAlarms", label: "No alarms", icon: "check_circle", tone: "success" },
  { id: "highLevel", label: "High level", icon: "water_full", tone: "error" },
  { id: "lowBattery", label: "Low battery", icon: "battery_alert", tone: "warning" },
  { id: "lowTemperature", label: "Low temperature", icon: "ac_unit", tone: "error" },
  { id: "highTemperature", label: "High temperature", icon: "local_fire_department", tone: "error" },
  { id: "offline", label: "Offline", icon: "wifi_off", tone: "neutral" },
];

export type TankStatus = "online" | "offline";

export const TANK_STATUS_META: Record<TankStatus, { label: string; icon: string; tone: StatusPillTone }> = {
  online: { label: "Online", icon: "wifi", tone: "success" },
  offline: { label: "Offline", icon: "wifi_off", tone: "neutral" },
};

/** One tank device, as the table, map and panel show it. */
export interface TankRow {
  deviceId: string;
  /** Display name: the label, else the device name. */
  name: string;
  deviceName: string;
  deviceLabel: string;
  description: string;
  type: string;
  owner: string;
  product: string;
  capacity: number | null;
  capacityUnits: string;
  sensorUnits: string;
  /** Fill level, % of capacity. */
  levelPercent: number | null;
  /** The sensor's level reading, in {@link sensorUnits}. */
  level: number | null;
  /** The product volume, in {@link capacityUnits} (level % × capacity). */
  volume: number | null;
  temperature: number | null;
  tonnage: number | null;
  battery: number | null;
  minLevelThreshold: number | null;
  /** The tank's alarm thresholds (null = the alarm rule's default applies). */
  maxLevelThreshold: number | null;
  maxTemperatureThreshold: number | null;
  status: TankStatus;
  highLevel: boolean;
  lowBattery: boolean;
  lowTemperature: boolean;
  highTemperature: boolean;
  /** Every condition that holds ("noAlarms" when none does). */
  conditions: TankCondition[];
  /** Any threshold condition holds (the level / temperature cells go red). */
  inAlarm: boolean;
  /** Newest reading of the level, temperature or tonnage series. */
  lastUpdateTs: number | null;
  lastUpdate: string;
  /** The tank form's values, from its attributes. */
  details: TankDetails;
}

/**
 * A tank with its alarm conditions taken from the types of its ACTIVE alarms
 * (see {@link AsphaltDashboardSettings.highLevelAlarmTypes}); offline stays as
 * the device state says.
 */
export function withAlarmConditions(t: TankRow, activeTypes: Set<string>, s: AsphaltDashboardSettings): TankRow {
  const hasAlarm = (types: string[]) => types.some((type) => activeTypes.has(type));
  const flags = {
    highLevel: hasAlarm(s.highLevelAlarmTypes),
    lowBattery: hasAlarm(s.lowBatteryAlarmTypes),
    lowTemperature: hasAlarm(s.lowTemperatureAlarmTypes),
    highTemperature: hasAlarm(s.highTemperatureAlarmTypes),
  };
  const conditions = tankConditions({ ...flags, status: t.status });
  return { ...t, ...flags, conditions, inAlarm: conditions.some((c) => c !== "noAlarms" && c !== "offline") };
}

export function tankConditions(t: Pick<TankRow, "status" | "highLevel" | "lowBattery" | "lowTemperature" | "highTemperature">): TankCondition[] {
  const c: TankCondition[] = [];
  if (t.highLevel) {
    c.push("highLevel");
  }
  if (t.lowBattery) {
    c.push("lowBattery");
  }
  if (t.lowTemperature) {
    c.push("lowTemperature");
  }
  if (t.highTemperature) {
    c.push("highTemperature");
  }
  if (t.status === "offline") {
    c.push("offline");
  }
  return c.length ? c : ["noAlarms"];
}

// ---------------------------------------------------------------------------
// Burners
// ---------------------------------------------------------------------------

/** One burner state: its value as reported, and whether that's a fault. */
export interface BurnerState {
  /** "True" / "False", or "—" before the burner has reported it. */
  label: string;
  /** null while unreported. */
  fault: boolean | null;
}

/** One burner device, as the Burners table and panel show it. */
export interface BurnerRow {
  deviceId: string;
  name: string;
  deviceName: string;
  deviceLabel: string;
  description: string;
  type: string;
  owner: string;
  status: TankStatus;
  lowTemperature: BurnerState;
  /** Phase 1, 2, 3 (in {@link AsphaltDashboardSettings.burnerPowerPhaseKeys} order). */
  powerPhases: BurnerState[];
  lastUpdateTs: number | null;
}

/**
 * A boolean burner state from its raw value: `faultWhen` is the value that
 * means trouble (true for low temperature, false for a power phase).
 */
export function burnerState(raw: unknown, faultWhen: boolean): BurnerState {
  if (raw === null || raw === undefined || raw === "") {
    return { label: "—", fault: null };
  }
  const on = raw === true || String(raw).toLowerCase() === "true";
  return { label: on ? "True" : "False", fault: on === faultWhen };
}
