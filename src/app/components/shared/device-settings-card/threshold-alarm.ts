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

import type { LineChartThreshold } from "../line-chart/line-chart.component";
import { fmtNumber } from "../value-utils";
import type { AttributeSelectOption, DeviceSettingControl, DeviceSettingObject } from "./device-settings-card.component";

// A numeric threshold alarm — a reading against limits — is one JSON object a measurement, the Milesight TS302's own shape:
// `{ enable, condition, thresholdMin, thresholdMax }`. QC Lab's probes and ambience sensors and the Asphalt tanks keep theirs so; its
// settings are the same card everywhere ({@link thresholdAlarmObject}), its chart lines {@link thresholdAlarmLines}, and the alarm
// rule reading it compares the reading as {@link thresholdBreached} does.

/** When the alarm raises: under the min, over the max, inside the range or outside it. */
export type ThresholdCondition = "below" | "above" | "between" | "outside";

/** The Condition buttons, in their order. */
export const THRESHOLD_CONDITION_OPTIONS: AttributeSelectOption[] = [
  { value: "below", label: "Below" },
  { value: "above", label: "Above" },
  { value: "between", label: "Between" },
  { value: "outside", label: "Outside" },
];

/** The conditions reading the min (Below, Between, Outside) and the max (Above, Between, Outside). */
const MIN_CONDITIONS: ThresholdCondition[] = ["below", "between", "outside"];
const MAX_CONDITIONS: ThresholdCondition[] = ["above", "between", "outside"];

/** A threshold alarm's limits: the sliders' range, their unit (or a unit read from another setting) and where a new one starts. */
export interface ThresholdAlarmRange {
  min: number;
  max: number;
  step?: number;
  unit?: string;
  /** The unit from another setting's value (QC Lab's °C / °F). */
  unitFrom?: { key: string; map: Record<string, string> };
  /** Where a config without them starts: its condition (Above) and its limits. */
  condition?: ThresholdCondition;
  thresholdMin?: number;
  thresholdMax?: number;
}

/**
 * A threshold alarm's settings, the standard for any numeric alarm: its switch (`enable`) heading it, then Condition — Below |
 * Above | Between | Outside — and the limits it reads, Min threshold for Below / Between / Outside, Max threshold for Above /
 * Between / Outside (`showWhen`: the other one hides, keeping its value).
 */
export function thresholdAlarmFields(r: ThresholdAlarmRange): DeviceSettingControl[] {
  const limit = (key: "thresholdMin" | "thresholdMax", label: string, when: ThresholdCondition[]): DeviceSettingControl => ({
    kind: "slider",
    key,
    label,
    min: r.min,
    max: r.max,
    step: r.step ?? 1,
    ...(r.unit !== undefined ? { unit: r.unit } : {}),
    ...(r.unitFrom ? { unitFrom: r.unitFrom } : {}),
    ...(r[key] !== undefined ? { defaultValue: r[key] } : {}),
    showWhen: { key: "condition", values: when },
  });
  return [
    { kind: "toggle", key: "enable", label: "Enable" },
    { kind: "buttons", key: "condition", label: "Condition", options: THRESHOLD_CONDITION_OPTIONS, defaultValue: r.condition ?? "above" },
    limit("thresholdMin", "Min threshold", MIN_CONDITIONS),
    limit("thresholdMax", "Max threshold", MAX_CONDITIONS),
  ];
}

/** A threshold alarm as an object of a settings card: its attribute, its label on the switch heading it, its fields. */
export function thresholdAlarmObject(key: string, label: string, range: ThresholdAlarmRange, scope?: "shared" | "server"): DeviceSettingObject {
  return { key, label, gateKey: "enable", ...(scope ? { scope } : {}), fields: thresholdAlarmFields(range) };
}

/** A threshold alarm as stored, parsed: null when there's none. */
export interface ThresholdAlarmConfig {
  enable: boolean;
  /** "" when it names none (or one of no meaning). */
  condition: ThresholdCondition | "";
  thresholdMin: number | null;
  thresholdMax: number | null;
}

/** A stored threshold alarm (a JSON string, as attributes arrive, or an object) — null when there's none to read. */
export function parseThresholdAlarm(raw: unknown): ThresholdAlarmConfig | null {
  let obj: Record<string, unknown> | null = null;
  if (raw && typeof raw === "object") {
    obj = raw as Record<string, unknown>;
  } else if (typeof raw === "string" && raw.trim().startsWith("{")) {
    try {
      obj = JSON.parse(raw);
    } catch {
      obj = null;
    }
  }
  if (!obj) {
    return null;
  }
  const num = (v: unknown): number | null => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  const condition = String(obj["condition"] ?? "").toLowerCase();
  return {
    enable: obj["enable"] === true || obj["enable"] === "true",
    condition: (THRESHOLD_CONDITION_OPTIONS.some((o) => o.value === condition) ? condition : "") as ThresholdCondition | "",
    thresholdMin: num(obj["thresholdMin"]),
    thresholdMax: num(obj["thresholdMax"]),
  };
}

/** The limits an enabled alarm compares against, by its condition (Below: the min; Above: the max; both else) — none while it's off. */
export function thresholdAlarmLimits(cfg: ThresholdAlarmConfig | null): number[] {
  if (!cfg?.enable || !cfg.condition) {
    return [];
  }
  return [
    MIN_CONDITIONS.includes(cfg.condition) ? cfg.thresholdMin : null,
    MAX_CONDITIONS.includes(cfg.condition) ? cfg.thresholdMax : null,
  ].filter((v): v is number => v !== null);
}

/**
 * The lines a chart draws for its threshold alarms (several: QC Lab's two channels on one chart): each enabled one's limits by its
 * condition, a value once, captioned with its value and `unit` — in the shared threshold colour.
 */
export function thresholdAlarmLines(raws: unknown[], unit: string): LineChartThreshold[] {
  const seen = new Set<number>();
  const out: LineChartThreshold[] = [];
  for (const raw of raws) {
    for (const v of thresholdAlarmLimits(parseThresholdAlarm(raw))) {
      if (!seen.has(v)) {
        seen.add(v);
        out.push({ value: v, label: unit ? `${fmtNumber(v, Number.isInteger(v) ? 0 : 1)} ${unit}` : fmtNumber(v, Number.isInteger(v) ? 0 : 1) });
      }
    }
  }
  return out;
}

/** Whether a reading breaks a threshold alarm — the alarm rules' comparison (a limit its condition needs and lacks: never). */
export function thresholdBreached(cfg: ThresholdAlarmConfig | null, v: number | null): boolean {
  if (!cfg?.enable || v === null) {
    return false;
  }
  const lo = cfg.thresholdMin;
  const hi = cfg.thresholdMax;
  switch (cfg.condition) {
    case "below":
      return lo !== null && v < lo;
    case "above":
      return hi !== null && v > hi;
    case "outside":
      return (lo !== null && v < lo) || (hi !== null && v > hi);
    case "between":
      return lo !== null && hi !== null && v >= lo && v <= hi;
    default:
      return false;
  }
}

/** A threshold alarm in a few words, for a table's cell: "Above 95%", "Outside 120–170 °C", "Off". */
export function thresholdAlarmText(cfg: ThresholdAlarmConfig | null, unit: string): string {
  if (!cfg?.enable) {
    return "Off";
  }
  const n = (v: number | null) => (v === null ? "—" : fmtNumber(v, Number.isInteger(v) ? 0 : 1));
  const u = unit === "%" ? "%" : unit ? ` ${unit}` : "";
  switch (cfg.condition) {
    case "below":
      return `Below ${n(cfg.thresholdMin)}${u}`;
    case "above":
      return `Above ${n(cfg.thresholdMax)}${u}`;
    case "between":
      return `Between ${n(cfg.thresholdMin)}–${n(cfg.thresholdMax)}${u}`;
    case "outside":
      return `Outside ${n(cfg.thresholdMin)}–${n(cfg.thresholdMax)}${u}`;
    default:
      return "No condition";
  }
}
