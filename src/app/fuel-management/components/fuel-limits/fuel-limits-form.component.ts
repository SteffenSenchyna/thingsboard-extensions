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

import { Component, DestroyRef, EventEmitter, HostBinding, Input, OnChanges, Output, SimpleChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormBuilder, FormGroup } from "@angular/forms";
import { SharedModule } from "@shared/public-api";
import { DetailCardComponent, DetailRowComponent } from "../../../components/shared/detail-rows/detail-rows.component";
import { FormActionsComponent } from "../../../components/shared/form-actions/form-actions.component";
import { StatusPillComponent } from "../../../components/shared/status-pill/status-pill.component";
import { FuelLimits, FuelUse, NO_FUEL_LIMITS, sameFuelLimits } from "../../models/fuel-management.models";
import { FuelLimitScale, FuelLimitsFieldsComponent, fuelLimitsFormValue, fuelLimitsGroup, fuelLimitsOf } from "./fuel-limits-fields.component";
import { FuelUseRow, fuelUseRows } from "./fuel-limits.models";

/**
 * A site's or a market's fuel limits panel (Settings › Fuel limits): its use
 * of today, this month and this year against its limits (each one's band —
 * near, over, well over — a pill), then its limits ({@link FuelLimitsFieldsComponent})
 * and the form's buttons once something changed. The dashboard saves; the
 * form resets whenever {@link resetKey} changes.
 */
@Component({
  selector: "tb-fuel-limits-form",
  templateUrl: "./fuel-limits-form.component.html",
  styleUrls: ["./fuel-limits-form.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, DetailCardComponent, DetailRowComponent, FormActionsComponent, StatusPillComponent, FuelLimitsFieldsComponent],
})
export class FuelLimitsFormComponent implements OnChanges {
  /** No native tooltip (a `title` attribute set on it by mistake). */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;
  /** Its limits as saved. */
  @Input() limits: FuelLimits = NO_FUEL_LIMITS;
  /** Its use of each period; null while it's read. */
  @Input() use: FuelUse | null = null;
  /** Its sliders' ranges: a site's or a market's litres. */
  @Input() scale: FuelLimitScale = "site";
  @Input() saving = false;
  /** Change to reset the form to {@link limits} (each panel opened, each save). */
  @Input() resetKey = 0;
  @Output() saved = new EventEmitter<FuelLimits>();

  form: FormGroup;
  dirty = false;
  /** Its use rows (made once a change, not a check — the template's list). */
  useRows: FuelUseRow[] = [];

  constructor(
    fb: FormBuilder,
    private destroyRef: DestroyRef
  ) {
    this.form = fuelLimitsGroup(fb);
    // DestroyRef passed explicitly: in the extension bundle, takeUntilDestroyed() without it throws NG0203.
    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => (this.dirty = !sameFuelLimits(fuelLimitsOf(this.form), this.limits)));
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["resetKey"] || ((changes["limits"] || changes["scale"]) && !this.dirty)) {
      this.reset();
    }
    if (changes["limits"] || changes["use"]) {
      this.useRows = this.use ? fuelUseRows(this.use, this.limits) : [];
    }
  }

  readonly trackPeriod = (_: number, r: FuelUseRow) => r.period;

  get canSubmit(): boolean {
    return this.dirty && this.form.valid && !this.saving;
  }

  submit(): void {
    this.form.markAllAsTouched();
    if (this.canSubmit) {
      this.saved.emit(fuelLimitsOf(this.form));
    }
  }

  cancel(): void {
    this.reset();
  }

  private reset(): void {
    this.form.reset(fuelLimitsFormValue(this.limits, this.scale), { emitEvent: false });
    this.dirty = false;
  }
}
