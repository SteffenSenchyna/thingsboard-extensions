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

import { Component, ElementRef, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewChild } from "@angular/core";
import { CommonModule } from "@angular/common";
import { AbstractControl, FormBuilder, FormGroup, ValidationErrors, Validators } from "@angular/forms";
import { SharedModule } from "@shared/public-api";
import { SelectComponent, TbSelectOption } from "../../../components/shared/select/select.component";
import { SETTING_PIECES } from "../../../components/shared/setting-object/setting-object.component";
import { AddPumpRequest, FUEL_TYPES, pumpDeviceName } from "../../models/fuel-management.models";

/**
 * Inline form for a new pump, folding open in a station's Pumps card (its "Add pump"; it stays mounted between): only
 * its number and fuel type — the device is named after its station,
 * product-site-pump-# ({@link prefix}: "dev-inf" → "dev-inf-pump-03", the one
 * the gateway's connector sends the pump's data under, never one in use), its
 * label and its events' name "P03" — with its own Add / Cancel. Emits
 * {@link submitted} with an {@link AddPumpRequest}; the dashboard creates the
 * device and links it to the station. The form resets whenever
 * {@link resetKey} changes.
 */
@Component({
  selector: "tb-fuel-add-pump-form",
  templateUrl: "./add-pump-form.component.html",
  styleUrls: ["./add-pump-form.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, SelectComponent, ...SETTING_PIECES],
})
export class AddPumpFormComponent implements OnChanges {
  /** The station's product-site part ("dev-inf"); "" when its name doesn't follow product-site-plc-# (no pump can be named). */
  @Input() prefix = "";
  /** The number the form starts with (the first free one). */
  @Input() nextNumber = 1;
  /** Device names already in use — the new pump's may not be one. */
  @Input() takenNames: string[] = [];
  /** Change to reset the form (each time it opens). */
  @Input() resetKey = 0;
  @Input() saving = false;
  @Output() submitted = new EventEmitter<AddPumpRequest>();
  @Output() cancelled = new EventEmitter<void>();

  @ViewChild("numberInput") private numberInput?: ElementRef<HTMLInputElement>;

  readonly fuelTypeOptions: TbSelectOption[] = FUEL_TYPES.map((v) => ({ value: v, label: v }));
  form: FormGroup;
  private taken = new Set<string>();

  constructor(private fb: FormBuilder) {
    this.form = this.fb.group({
      number: ["", [Validators.required, Validators.pattern(/^\d{1,3}$/), Validators.min(1), (c: AbstractControl) => this.takenValidator(c)]],
      fuelType: [FUEL_TYPES[0], Validators.required],
    });
  }

  /** The number as typed, or null while it isn't one. */
  private get num(): number | null {
    const v = String(this.form.value.number ?? "").trim();
    return /^\d{1,3}$/.test(v) && Number(v) > 0 ? Number(v) : null;
  }

  /** The device name the pump gets ("dev-inf-pump-03"); "" until there's a number. */
  get deviceName(): string {
    const n = this.num;
    return this.prefix && n ? pumpDeviceName(this.prefix, n) : "";
  }

  /** Its label and its events' name: "P03". */
  get pumpLabel(): string {
    const n = this.num;
    return n ? `P${String(n).padStart(2, "0")}` : "";
  }

  /** Shown under the number: the name it makes is in use. */
  get numberError(): string | null {
    return this.form.controls["number"].hasError("taken") ? `${this.deviceName} already exists.` : null;
  }

  get canSubmit(): boolean {
    return !!this.prefix && this.form.valid && !this.saving;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["takenNames"]) {
      this.taken = new Set(this.takenNames.map((n) => n.trim().toLowerCase()));
    }
    if (changes["resetKey"]) {
      this.form.reset({ number: String(this.nextNumber), fuelType: FUEL_TYPES[0] }, { emitEvent: false });
      // Opened (it stays mounted, folded, in between): straight into the number once it's no longer inert.
      if (!changes["resetKey"].firstChange) {
        setTimeout(() => this.numberInput?.nativeElement.select());
      }
    }
    if (changes["takenNames"] || changes["prefix"]) {
      this.form.controls["number"].updateValueAndValidity({ emitEvent: false });
    }
  }

  /** Pump numbers are digits only: drop anything else as it's typed (max 3). */
  digitsOnly(): void {
    const c = this.form.controls["number"];
    const digits = String(c.value ?? "").replace(/\D/g, "").slice(0, 3);
    if (digits !== c.value) {
      c.setValue(digits);
    }
  }

  submit(): void {
    if (!this.canSubmit) {
      return;
    }
    this.submitted.emit({
      name: this.deviceName,
      label: this.pumpLabel,
      pumpLabel: this.pumpLabel,
      fuelType: String(this.form.value.fuelType),
    });
  }

  private takenValidator(c: AbstractControl): ValidationErrors | null {
    const v = String(c.value ?? "").trim();
    const name = this.prefix && /^\d{1,3}$/.test(v) && Number(v) > 0 ? pumpDeviceName(this.prefix, Number(v)).toLowerCase() : "";
    return name && this.taken.has(name) ? { taken: true } : null;
  }
}
