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

import type { StatusPillTone } from "../../components/shared/status-pill/status-pill.component";
import type { MetricChartKey } from "../../components/shared/metric-chart-card/metric-chart-card.component";

// Aria: aggregate production — the plants' conveyor belt scales (Loadrite
// C2880 / Beltway integrators read over Modbus by each plant's gateway, the
// "beltway" connector), devices of the "BeltScale" profile. What each value's
// key is can be overridden from the widget's settings (ctx.settings).

/**
 * Aria's mark — a stockpile over its base: a triangle, a narrow gap, then a band that carries the triangle's sides on down. One
 * colour (a mask): the rail draws it in its icons' colour (`NavRailItem.logo`), as Material Symbols' 24-unit box sizes a glyph.
 */
export const ARIA_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 3.7 17.9 13.5H6.1Z"/><path d="M4.47 16.2H19.53L22 20.3H2Z"/></svg>`;

export interface AriaDashboardSettings {
  /** Device profiles (device types) listed as belt scales. */
  scaleDeviceTypes: string[];
  /** TIME SERIES: the belt's rate (t/h — the scale's displayed TPH). */
  rateKey: string;
  /** TIME SERIES: the rate's average over the hour so far (the profile's "Hourly averages" calculated field, Mountain time). */
  hourRateKey: string;
  /** TIME SERIES: the belt's speed (the integrator's units). */
  speedKey: string;
  /** TIME SERIES: the load on the belt (the integrator's units). */
  loadKey: string;
  /** TIME SERIES: the scale's running total (t). */
  totalKey: string;
  /** TIME SERIES: what the belt is doing — "producing", "blackBelt" (moving, nothing on it), "stopped" (the profile's "state" calculated field). */
  stateKey: string;
}

export const ariaDashboardDefaultSettings: AriaDashboardSettings = {
  scaleDeviceTypes: ["BeltScale"],
  rateKey: "rate",
  hourRateKey: "rateAvgHr",
  speedKey: "speed",
  loadKey: "load",
  totalKey: "total",
  stateKey: "state",
};

/**
 * A reading's chart key (rate, speed, load) read from the averages the BeltScale profile's calculated fields keep of it, a few
 * hundred points a window at most: its 5-minute average for 1D and 3D (288 a day — "5-min averages"), its hourly one for 1W and 2W
 * (168 a week — "Hourly averages") and its daily one for 1M ("Daily averages") — `<key>Avg5m`, `<key>AvgHr`, `<key>AvgDay`, each
 * at its interval's start, Edmonton time; a custom range the key of the shortest of those windows at least as long as it. The raw
 * readings (every minute) where a window has no averages — none at all, or none before a point well into it.
 */
export function scaleAveragedKey(key: string): Pick<MetricChartKey, "name" | "nameByTimeframe" | "fallbackName"> {
  return {
    name: `${key}Avg5m`,
    nameByTimeframe: { "1D": `${key}Avg5m`, "3D": `${key}Avg5m`, "1W": `${key}AvgHr`, "2W": `${key}AvgHr`, "1M": `${key}AvgDay` },
    fallbackName: key,
  };
}

/**
 * What a scale shows: the belt's state as the profile's "state" calculated field reports it (material over the scale —
 * producing; the belt moving with none — "blackBelt", shown as Blackbelt; stopped), or offline (the device's `active` false),
 * over any state it last reported.
 */
export type ScaleCondition = "producing" | "blackBelt" | "stopped" | "offline" | "unknown";

/** Each condition's pill (the status scale: producing green, blackbelt orange, stopped red, offline grey) and its order. */
export const SCALE_CONDITION_META: Record<ScaleCondition, { label: string; icon: string; tone: StatusPillTone; rank: number }> = {
  producing: { label: "Producing", icon: "play_arrow", tone: "success", rank: 0 },
  blackBelt: { label: "Blackbelt", icon: "sync", tone: "major", rank: 1 },
  stopped: { label: "Stopped", icon: "stop", tone: "error", rank: 2 },
  offline: { label: "Offline", icon: "wifi_off", tone: "neutral", rank: 3 },
  unknown: { label: "No state", icon: "help", tone: "neutral", rank: 4 },
};

/** A condition's pill as a Time Machine card shows it beside its name: its label, tone and icon (an unknown one: "No state"). */
export function scaleConditionPill(condition: string): { label: string; tone: StatusPillTone; icon: string } {
  const meta = SCALE_CONDITION_META[condition as ScaleCondition] ?? SCALE_CONDITION_META.unknown;
  return { label: meta.label, tone: meta.tone, icon: meta.icon };
}

/** The Statuses filter's options, in the pills' order. */
export const SCALE_CONDITIONS: ScaleCondition[] = ["producing", "blackBelt", "stopped", "offline", "unknown"];

/** A scale's condition: offline over its last state; its state as the calculated field names it. */
export function scaleCondition(active: unknown, state: unknown): ScaleCondition {
  if (String(active ?? "").toLowerCase() === "false") {
    return "offline";
  }
  switch (String(state ?? "").trim()) {
    case "producing":
      return "producing";
    case "blackBelt":
      return "blackBelt";
    case "stopped":
      return "stopped";
    default:
      return "unknown";
  }
}

/**
 * SERVER ATTRIBUTE on a scale: which integrator weighs its belt — "Beltway" or "Loadrite" (unset: not picked yet). Set on the
 * scale's Settings tab (its Scale card); the table's Model column and the Models filter read it.
 */
export const SCALE_MODEL_KEY = "scaleModel";

/** The scale models, in the button group's and the filter's order. */
export const SCALE_MODELS = ["Beltway", "Loadrite"] as const;
export type ScaleModel = (typeof SCALE_MODELS)[number];

/** The Models filter's option for a scale with no model picked. */
export const NO_SCALE_MODEL = "none";

/** A stored model as one of the models ("" — none, or a value that isn't one). */
export function scaleModel(raw: unknown): ScaleModel | "" {
  const value = String(raw ?? "").trim();
  return SCALE_MODELS.find((m) => m.toLowerCase() === value.toLowerCase()) ?? "";
}

/** One belt scale, as the table and its panel show it. */
export interface ScaleRow {
  deviceId: string;
  /** Its label (the belt it weighs: "Jaw Discharge #2"), else its device name. */
  name: string;
  deviceName: string;
  deviceLabel: string;
  description: string;
  /** Its device profile. */
  type: string;
  /** Its owner's title. */
  owner: string;
  /** Where it is: its stored `site` / `market` codes; the site's label for the bubble ("" when it's the code). */
  siteId: string;
  siteCode: string;
  siteLabel: string;
  marketId: string;
  /** Its integrator (`scaleModel`): "Beltway", "Loadrite" — "" not picked yet. */
  model: ScaleModel | "";
  condition: ScaleCondition;
  /** The latest readings (null: none). */
  rate: number | null;
  hourRate: number | null;
  speed: number | null;
  load: number | null;
  total: number | null;
  /** Its latest reading's time (null: none). */
  lastUpdateTs: number | null;
}
