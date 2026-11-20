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

import { Component, Input, OnChanges, forwardRef } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from "@angular/forms";
import { SharedModule } from "@shared/public-api";
import { NumberBoxComponent } from "../number-box/number-box.component";

/**
 * Themed numeric slider + stepper box (matches the dashboard `--c-*` tokens):
 * a range track with a filled brand-blue portion on the left of the thumb, plus
 * the shared number box (`tb-number-box`) on the right showing the value, an
 * optional unit, and up/down stepper buttons. Implements ControlValueAccessor so it works with
 * `formControlName` / `[(ngModel)]`.
 */
@Component({
  selector: "tb-slider-stepper",
  templateUrl: "./slider-stepper.component.html",
  styleUrls: ["./slider-stepper.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, FormsModule, NumberBoxComponent],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SliderStepperComponent), multi: true }],
})
export class SliderStepperComponent implements ControlValueAccessor, OnChanges {
  @Input() min = 0;
  @Input() max = 100;
  @Input() step = 1;
  @Input() unit = "";
  /**
   * The values it may take, as ranges in order, when there are gaps ([[0, 0], [576, 1500]]: an MTU's 0, then 576 to 1500): the
   * slider snaps a value in a gap to the nearer edge, the box's steppers skip the gap (`tb-number-box [ranges]`); a typed value is
   * left as typed (the form's check judges it).
   */
  @Input() ranges: readonly (readonly [number, number])[] | null = null;

  /** Clamped value shown in the slider/box. */
  value = 0;
  disabled = false;

  // Last requested value, kept unclamped so it can be re-clamped correctly once
  // the min/max inputs are applied (writeValue can run before they are set).
  private raw = 0;

  private onChange: (value: number) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  /** Width of the filled (brand) portion of the track, as a CSS percentage. */
  get fillPercent(): string {
    const range = this.max - this.min || 1;
    return `${((this.value - this.min) / range) * 100}%`;
  }

  /** Re-derive the clamped value (e.g. after min/max change). */
  ngOnChanges(): void {
    this.value = this.clampRaw();
  }

  private clampRaw(): number {
    const c = Math.min(this.max, Math.max(this.min, this.raw));
    return Math.round(c * 1e6) / 1e6; // strip float noise from stepping
  }

  /** Set the value (clamped to [min, max]); emits unless `emit` is false. */
  setValue(input: number, emit = true): void {
    const n = Number(input);
    this.raw = isFinite(n) ? n : this.min;
    this.value = this.clampRaw();
    if (emit) {
      this.onChange(this.value);
      this.onTouched();
    }
  }

  onSlider(event: Event): void {
    this.setValue(this.nearestAllowed(Number((event.target as HTMLInputElement).value)));
  }

  /** A slider's value kept to the {@link ranges}: in one, as it is; in a gap, the nearer edge of the ranges on either side. */
  private nearestAllowed(value: number): number {
    const ranges = this.ranges ?? [];
    if (!ranges.length || ranges.some(([lo, hi]) => value >= lo && value <= hi)) {
      return value;
    }
    const below = [...ranges].reverse().find(([, hi]) => hi < value);
    const above = ranges.find(([lo]) => lo > value);
    if (!below || !above) {
      return below ? below[1] : above ? above[0] : value;
    }
    return value - below[1] <= above[0] - value ? below[1] : above[0];
  }

  stepBy(dir: number): void {
    if (!this.disabled) {
      this.setValue(this.value + dir * this.step);
    }
  }

  // -- ControlValueAccessor ---------------------------------------------------
  writeValue(value: number): void {
    this.setValue(value == null ? this.min : Number(value), false);
  }
  registerOnChange(fn: (value: number) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }
}
