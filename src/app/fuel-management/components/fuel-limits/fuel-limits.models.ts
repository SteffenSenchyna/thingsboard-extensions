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

import { StatusPillTone } from "../../../components/shared/status-pill/status-pill.component";
import {
  FUEL_LIMIT_BAND_META,
  FUEL_PERIOD_META,
  FUEL_PERIODS,
  FuelLimits,
  FuelPeriod,
  FuelUse,
  fuelLimitBand,
  fuelUseText,
} from "../../models/fuel-management.models";

/** A period's line: its name, its use against its limit ("412 of 500 L · 82%"), and its band's pill — none under the warn share. */
export interface FuelUseRow {
  period: FuelPeriod;
  label: string;
  text: string;
  /** Its use for sorting. */
  used: number;
  band: { label: string; tone: StatusPillTone } | null;
}

/** A use against limits, a line a period. */
export function fuelUseRows(use: FuelUse, limits: FuelLimits): FuelUseRow[] {
  return FUEL_PERIODS.map((p) => fuelUseRow(p, use, limits));
}

export function fuelUseRow(period: FuelPeriod, use: FuelUse, limits: FuelLimits): FuelUseRow {
  const band = fuelLimitBand(use[period], limits[period], limits.warnPercent);
  return {
    period,
    label: FUEL_PERIOD_META[period].label,
    text: fuelUseText(use[period], limits[period]),
    used: use[period],
    band: band === "under" ? null : FUEL_LIMIT_BAND_META[band],
  };
}

/** A market, a site or a pump whose limits are set (Settings › Fuel limits), and what its panel shows. */
export interface FuelLimitsTarget {
  kind: "market" | "site" | "pump";
  /** Its asset (a market's, a site's) or its device (a pump's). */
  id: string;
  /** Its name as the table shows it ("Richmond Lab (4R20)", "GEA", a pump's label "P01"). */
  name: string;
  /** A pump's: its site's name ("Richmond Lab (4R20)"), and its device profile (its icon's). */
  place?: string;
  profile?: string;
  limits: FuelLimits;
  use: FuelUse;
}
