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

import { Component, HostBinding, Input } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormBuilder, FormGroup } from "@angular/forms";
import { SharedModule } from "@shared/public-api";
import { CollapsibleCardComponent } from "../../../components/shared/collapsible-card/collapsible-card.component";
import { SETTING_PIECES } from "../../../components/shared/setting-object/setting-object.component";
import { SliderStepperComponent } from "../../../components/shared/slider-stepper/slider-stepper.component";
import { SwitchComponent } from "../../../components/shared/switch/switch.component";
import {
  FUEL_LIMIT_WARN_DEFAULT,
  FUEL_PERIODS,
  FuelLimits,
  FuelPeriod,
} from "../../models/fuel-management.models";

/** What a limit is set on — its sliders' ranges: a vehicle or user code's litres, a pump's, a site's, a market's. */
export type FuelLimitScale = "code" | "pump" | "site" | "market";

/** A period's slider: its top, its step and the value a limit switched on starts at. */
interface LimitRange {
  max: number;
  step: number;
  start: number;
}

export const FUEL_LIMIT_RANGES: Record<FuelLimitScale, Record<FuelPeriod, LimitRange>> = {
  code: { day: { max: 2_000, step: 10, start: 200 }, month: { max: 40_000, step: 100, start: 4_000 }, year: { max: 400_000, step: 1_000, start: 40_000 } },
  pump: { day: { max: 20_000, step: 50, start: 3_000 }, month: { max: 400_000, step: 1_000, start: 60_000 }, year: { max: 4_000_000, step: 10_000, start: 700_000 } },
  site: { day: { max: 50_000, step: 100, start: 5_000 }, month: { max: 1_000_000, step: 1_000, start: 100_000 }, year: { max: 10_000_000, step: 10_000, start: 1_000_000 } },
  market: {
    day: { max: 200_000, step: 500, start: 20_000 },
    month: { max: 5_000_000, step: 5_000, start: 500_000 },
    year: { max: 50_000_000, step: 50_000, start: 5_000_000 },
  },
};

/** A period's switch heading its section. */
const LIMIT_LABELS: Record<FuelPeriod, string> = { day: "Daily limit", month: "Monthly limit", year: "Yearly limit" };

const onKey = (p: FuelPeriod) => `${p}On`;

/** The limits' form group: a period's switch (`dayOn`, …) and its litres (`day`, …), and the warn share (`warn`, %). */
export function fuelLimitsGroup(fb: FormBuilder): FormGroup {
  return fb.group({
    dayOn: [false],
    day: [0],
    monthOn: [false],
    month: [0],
    yearOn: [false],
    year: [0],
    warn: [FUEL_LIMIT_WARN_DEFAULT],
  });
}

/** The group's value for `limits`: a limit set — its switch on, its litres; none — off, the slider at its range's start. */
export function fuelLimitsFormValue(limits: FuelLimits, scale: FuelLimitScale): Record<string, number | boolean> {
  const v: Record<string, number | boolean> = { warn: limits.warnPercent };
  for (const p of FUEL_PERIODS) {
    v[onKey(p)] = limits[p] !== null;
    v[p] = limits[p] ?? FUEL_LIMIT_RANGES[scale][p].start;
  }
  return v;
}

/** The limits the group holds: a period switched on with litres above 0 — its limit; else none. */
export function fuelLimitsOf(group: FormGroup): FuelLimits {
  const v = group.getRawValue();
  const limit = (p: FuelPeriod) => (v[onKey(p)] && Number(v[p]) > 0 ? Number(v[p]) : null);
  const warn = Number(v.warn);
  return { day: limit("day"), month: limit("month"), year: limit("year"), warnPercent: warn >= 1 && warn <= 100 ? warn : FUEL_LIMIT_WARN_DEFAULT };
}

/**
 * Fuel limits in QC Lab's settings cards (the shared setting pieces): one
 * "Fuel limits" card — first "Warn at", the share of a limit its Warning
 * starts at, then a period a setting, its switch heading it ("Daily limit"),
 * folding open its litres (the shared slider-stepper), a rule between them.
 * For a code's Settings form and a site's or a market's limits panel; the
 * host owns the form group ({@link fuelLimitsGroup}) and saves it with its
 * own buttons.
 */
@Component({
  selector: "tb-fuel-limits-fields",
  templateUrl: "./fuel-limits-fields.component.html",
  styleUrls: ["./fuel-limits-fields.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, CollapsibleCardComponent, SliderStepperComponent, SwitchComponent, ...SETTING_PIECES],
})
export class FuelLimitsFieldsComponent {
  /** No native tooltip (a `title` attribute set on it by mistake). */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;
  @Input() group!: FormGroup;
  /** Its sliders' ranges: a code's, a site's or a market's litres. */
  @Input() scale: FuelLimitScale = "code";

  readonly periods: FuelPeriod[] = FUEL_PERIODS;
  readonly labels = LIMIT_LABELS;
  readonly onKey = onKey;
  isOn(p: FuelPeriod): boolean {
    return !!this.group.controls[onKey(p)]?.value;
  }

  step(p: FuelPeriod): number {
    return FUEL_LIMIT_RANGES[this.scale][p].step;
  }

  /** A period's slider top: its range's, or a limit already set above it (never clamped down on save). */
  max(p: FuelPeriod): number {
    return Math.max(FUEL_LIMIT_RANGES[this.scale][p].max, Number(this.group.controls[p]?.value) || 0);
  }
}
