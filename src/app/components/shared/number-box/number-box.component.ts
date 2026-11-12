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

import { Component, HostBinding, Input, forwardRef } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from "@angular/forms";
import { SharedModule } from "@shared/public-api";

/**
 * Themed number box — the text inputs' box with the value, an optional unit
 * and up / down stepper chevrons on the right (the QC lab settings form's
 * number fields, and the box of `tb-slider-stepper`). A ControlValueAccessor:
 * works with `formControlName` / `[(ngModel)]`; the value is a number, or
 * null while the box is empty. The steppers move by {@link step} and keep
 * within {@link min} / {@link max}; a typed value is passed on as typed (the
 * form's validators judge it).
 *
 * ```html
 * <tb-number-box inputId="gc-port" [min]="1" [max]="65535" formControlName="port"></tb-number-box>
 * ```
 */
@Component({
  selector: "tb-number-box",
  templateUrl: "./number-box.component.html",
  styleUrls: ["./number-box.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, FormsModule],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => NumberBoxComponent), multi: true }],
})
export class NumberBoxComponent implements ControlValueAccessor {
  @Input() min?: number;
  @Input() max?: number;
  @Input() step = 1;
  /** Shown after the value, muted ("°C", "ms"). */
  @Input() unit = "";
  @Input() placeholder = "";
  /** The inner input's id, for a `<label for>`. */
  @Input() inputId = "";
  @Input() ariaLabel = "";
  /** The error border (the form's hint says why). */
  @Input() @HostBinding("class.nb-invalid") invalid = false;
  /** The compact control height (a control beside a heading, as the select's) instead of a form input's. */
  @Input() @HostBinding("class.nb-compact") compact = false;

  value: number | null = null;
  disabled = false;

  private onChange: (value: number | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  /** The input's value (a number, or null while empty / not a number). */
  onInput(value: number | null): void {
    this.value = typeof value === "number" && Number.isFinite(value) ? value : null;
    this.onChange(this.value);
  }

  onBlur(): void {
    this.onTouched();
  }

  canStep(dir: 1 | -1): boolean {
    if (this.disabled) {
      return false;
    }
    const v = this.value;
    return dir > 0 ? this.max === undefined || v === null || v < this.max : this.min === undefined || v === null || v > this.min;
  }

  /** Up / down: by a step from the value (or from the minimum / zero while empty), kept within the bounds. */
  stepBy(dir: 1 | -1): void {
    if (!this.canStep(dir)) {
      return;
    }
    const base = this.value ?? this.min ?? 0;
    let next = this.value === null ? base : base + dir * this.step;
    if (this.min !== undefined) {
      next = Math.max(this.min, next);
    }
    if (this.max !== undefined) {
      next = Math.min(this.max, next);
    }
    this.value = Math.round(next * 1e6) / 1e6; // strip float noise from stepping
    this.onChange(this.value);
    this.onTouched();
  }

  // -- ControlValueAccessor ---------------------------------------------------
  writeValue(value: number | string | null): void {
    const n = value === null || value === undefined || value === "" ? null : Number(value);
    this.value = n !== null && Number.isFinite(n) ? n : null;
  }
  registerOnChange(fn: (value: number | null) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }
}
