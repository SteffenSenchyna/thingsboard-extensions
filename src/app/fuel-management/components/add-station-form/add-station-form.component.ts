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

import { Component, DestroyRef, EventEmitter, Input, OnChanges, Output, SimpleChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { AbstractControl, FormArray, FormBuilder, FormGroup, ValidationErrors, Validators } from "@angular/forms";
import { SharedModule } from "@shared/public-api";
import { CardComponent } from "../../../components/shared/card/card.component";
import { CollapsibleCardComponent } from "../../../components/shared/collapsible-card/collapsible-card.component";
import { FormActionsComponent } from "../../../components/shared/form-actions/form-actions.component";
import { SelectComponent, TbSelectOption } from "../../../components/shared/select/select.component";
import {
  AddStationRequest,
  FUEL_TYPES,
  nextPlcNumber,
  nextPumpNumber,
  plcDeviceName,
  pumpDeviceName,
  StationPlant,
} from "../../models/fuel-management.models";

/** A number typed in a number field ("3"), or null while it isn't one (1–999). */
function numberOf(value: unknown): number | null {
  const v = String(value ?? "").trim();
  return /^\d{1,3}$/.test(v) && Number(v) > 0 ? Number(v) : null;
}

/** Two digits: 3 → "03". */
const two = (n: number) => String(n).padStart(2, "0");

/**
 * A new station's panel form ("Create new" on the Stations table), as every
 * Settings panel's Details: its plant (every plant of the Organization — a
 * station makes a plant a Fuel site), its number — the PLC is named after
 * the plant, product-site-plc-# ("agg-3h32-plc-01", the plant's product line
 * and code: the name the gateway's connector sends its data under), labelled
 * "PLC01" — then its pumps, a section each in the Pumps card (as the
 * station panel's Pumps card): each pump's number and fuel type
 * (product-site-pump-#, "P01"), "Create new" adding the next one, Remove
 * taking one away. A number never makes a name in use, or one listed twice.
 * Emits {@link submitted} with an {@link AddStationRequest}; the dashboard
 * creates the devices and their links. The form resets whenever
 * {@link resetKey} changes.
 */
@Component({
  selector: "tb-fuel-add-station-form",
  templateUrl: "./add-station-form.component.html",
  styleUrls: ["./add-station-form.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, CardComponent, CollapsibleCardComponent, FormActionsComponent, SelectComponent],
})
export class AddStationFormComponent implements OnChanges {
  /** The plants to pick from (each with its devices' prefix: "" — no product line — can't be named). */
  @Input() plants: StationPlant[] = [];
  /** Device names already in use — a new device's may not be one. */
  @Input() takenNames: string[] = [];
  /** Change to reset the form (each time the panel opens). */
  @Input() resetKey = 0;
  @Input() saving = false;
  @Output() submitted = new EventEmitter<AddStationRequest>();
  @Output() cancelled = new EventEmitter<void>();

  readonly fuelTypeOptions: TbSelectOption[] = FUEL_TYPES.map((v) => ({ value: v, label: v }));
  /** The plant picker's options (kept as one array between checks). */
  plantOptions: TbSelectOption[] = [];
  form: FormGroup;
  private taken = new Set<string>();

  constructor(
    private fb: FormBuilder,
    private destroyRef: DestroyRef
  ) {
    this.form = this.fb.group({
      site: [null as string | null, Validators.required],
      number: ["1", [Validators.required, (c: AbstractControl) => this.stationNumberError(c)]],
      pumps: this.fb.array([]),
    });
    // Another plant: its own numbers, the next free ones there (nothing's made yet).
    // DestroyRef passed explicitly: in the extension bundle, takeUntilDestroyed() without it throws NG0203.
    this.form.controls["site"].valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.renumber());
    // A pump's number checked against the others' (listed twice) whenever any changes.
    this.pumps.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() =>
      this.pumps.controls.forEach((g) => (g as FormGroup).controls["number"].updateValueAndValidity({ emitEvent: false }))
    );
  }

  get pumps(): FormArray {
    return this.form.controls["pumps"] as FormArray;
  }

  /** The plant picked, and its devices' prefix ("agg-3h32"; "" none picked or no product line). */
  get plant(): StationPlant | null {
    // (Its validators first run while the form is being built.)
    const id = this.form?.controls["site"].value as string | null;
    return id ? (this.plants.find((p) => p.id === id) ?? null) : null;
  }

  get prefix(): string {
    return this.plant?.prefix ?? "";
  }

  /** The PLC's name and label ("agg-3h32-plc-01", "PLC01"); "" until there's a plant and a number. */
  get stationName(): string {
    const n = numberOf(this.form.controls["number"].value);
    return this.prefix && n ? plcDeviceName(this.prefix, n) : "";
  }

  get stationLabel(): string {
    const n = numberOf(this.form.controls["number"].value);
    return n ? `PLC${two(n)}` : "";
  }

  /** A pump section's name and label ("agg-3h32-pump-01", "P01"). */
  pumpName(g: AbstractControl): string {
    const n = numberOf((g as FormGroup).controls["number"].value);
    return this.prefix && n ? pumpDeviceName(this.prefix, n) : "";
  }

  pumpLabel(g: AbstractControl): string {
    const n = numberOf((g as FormGroup).controls["number"].value);
    return n ? `P${two(n)}` : "";
  }

  /** Shown under a number: the name it makes is in use, or (a pump's) listed twice. */
  numberError(c: AbstractControl, name: string): string | null {
    if (c.hasError("taken")) {
      return `${name} already exists.`;
    }
    if (c.hasError("repeat")) {
      return "Another pump has this number.";
    }
    if (c.touched && c.value && c.hasError("pattern")) {
      return "Numbers are 1 to 999.";
    }
    return null;
  }

  get canSubmit(): boolean {
    return !!this.prefix && this.form.valid && !this.saving;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["plants"]) {
      this.plantOptions = this.plants.map((p) => ({ value: p.id, label: p.label }));
    }
    if (changes["takenNames"]) {
      this.taken = new Set(this.takenNames.map((n) => n.trim().toLowerCase()));
    }
    if (changes["resetKey"]) {
      this.pumps.clear({ emitEvent: false });
      this.form.reset({ site: null, number: "1" }, { emitEvent: false });
      this.addPump();
    } else if (changes["takenNames"]) {
      this.validateNumbers();
    }
  }

  /** "Create new": one more pump, the number after the highest listed (or the next free one at the plant). */
  addPump(): void {
    const listed = this.pumps.controls.map((g) => numberOf((g as FormGroup).controls["number"].value) ?? 0);
    const next = Math.max(this.prefix ? nextPumpNumber(this.prefix, this.takenNames) : 1, ...listed.map((n) => n + 1));
    this.pumps.push(
      this.fb.group({
        number: [String(next), [Validators.required, (c: AbstractControl) => this.pumpNumberError(c)]],
        fuelType: [FUEL_TYPES[0], Validators.required],
      })
    );
  }

  removePump(index: number): void {
    this.pumps.removeAt(index);
  }

  /** Numbers are digits only: drop anything else as it's typed (max 3). */
  digitsOnly(c: AbstractControl): void {
    const digits = String(c.value ?? "").replace(/\D/g, "").slice(0, 3);
    if (digits !== c.value) {
      c.setValue(digits);
    }
  }

  trackIndex(index: number): number {
    return index;
  }

  submit(): void {
    if (!this.canSubmit) {
      return;
    }
    const plant = this.plant!;
    this.submitted.emit({
      siteId: plant.id,
      name: this.stationName,
      label: this.stationLabel,
      pumps: this.pumps.controls.map((g) => ({
        name: this.pumpName(g),
        label: this.pumpLabel(g),
        pumpLabel: this.pumpLabel(g),
        fuelType: String((g as FormGroup).controls["fuelType"].value),
      })),
    });
  }

  /** Another plant picked: the station the next free number there, its pumps the next free ones after each other. */
  private renumber(): void {
    const prefix = this.prefix;
    this.form.controls["number"].setValue(String(prefix ? nextPlcNumber(prefix, this.takenNames) : 1), { emitEvent: false });
    const first = prefix ? nextPumpNumber(prefix, this.takenNames) : 1;
    this.pumps.controls.forEach((g, i) => (g as FormGroup).controls["number"].setValue(String(first + i), { emitEvent: false }));
    this.validateNumbers();
  }

  private validateNumbers(): void {
    this.form.controls["number"].updateValueAndValidity({ emitEvent: false });
    this.pumps.controls.forEach((g) => (g as FormGroup).controls["number"].updateValueAndValidity({ emitEvent: false }));
  }

  private stationNumberError(c: AbstractControl): ValidationErrors | null {
    const n = numberOf(c.value);
    if (n === null) {
      return c.value ? { pattern: true } : null;
    }
    return this.prefix && this.taken.has(plcDeviceName(this.prefix, n).toLowerCase()) ? { taken: true } : null;
  }

  private pumpNumberError(c: AbstractControl): ValidationErrors | null {
    const n = numberOf(c.value);
    if (n === null) {
      return c.value ? { pattern: true } : null;
    }
    if (this.prefix && this.taken.has(pumpDeviceName(this.prefix, n).toLowerCase())) {
      return { taken: true };
    }
    const same = (this.form ? this.pumps.controls : []).filter((g) => numberOf((g as FormGroup).controls["number"].value) === n).length;
    return same > 1 ? { repeat: true } : null;
  }
}
