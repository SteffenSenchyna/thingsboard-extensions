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
import { AbstractControl, FormBuilder, FormGroup, ValidationErrors } from "@angular/forms";
import { SharedModule } from "@shared/public-api";
import { CardComponent } from "../../../components/shared/card/card.component";
import { FormActionsComponent } from "../../../components/shared/form-actions/form-actions.component";
import { ManageActionComponent, ManageCardComponent } from "../../../components/shared/manage-card/manage-card.component";
import { CopyBoxComponent } from "../../../components/shared/copy-box/copy-box.component";
import { FilterListComponent, FilterListOption } from "../../../components/shared/filter-list/filter-list.component";
import { plantsPickedText } from "../../../components/shared/organization/organization.models";
import { nameErrorOf, nameValidators } from "../../../components/shared/form-utils";
import { SETTING_PIECES } from "../../../components/shared/setting-object/setting-object.component";
import { AccessCodeRow, FuelLimits, NO_FUEL_LIMITS, sameFuelLimits } from "../../models/fuel-management.models";
import { FuelLimitsFieldsComponent, fuelLimitsFormValue, fuelLimitsGroup, fuelLimitsOf } from "../fuel-limits/fuel-limits-fields.component";

/** What a code panel's Settings saves: the holder's name, the plants it works at and its fuel limits (null: as they are). */
export interface CodeFormChange {
  name: string;
  plantIds: string[] | null;
  limits: FuelLimits | null;
}

/** At least one plant ticked. */
function somePlants(c: AbstractControl): ValidationErrors | null {
  return (c.value as string[] | null)?.length ? null : { required: true };
}

/** The same plants, in any order. */
function samePlants(a: string[], b: string[]): boolean {
  const set = new Set(a);
  return a.length === b.length && b.every((id) => set.has(id));
}

/**
 * A code panel's Settings tab (after its Insights), as every Settings panel's
 * Details: the form — the code (in full, in the shared copy box: its button
 * copies it), its holder and the plants it works at (the plant tree of the
 * create form: moving it frees its slots where it leaves and takes slots
 * where it goes), its fuel limits (litres a day, a month, a year: its "Daily
 * fuel limit" alarms…) — then its Manage card (an active user code's Reset PIN, Disable — an
 * active code — or Enable, then Delete, in red) and
 * the form's buttons, shown once something changed. The dashboard does the
 * saving; the form resets whenever {@link resetKey} changes.
 */
@Component({
  selector: "tb-fuel-code-form",
  templateUrl: "./code-form.component.html",
  styleUrls: ["./code-form.component.scss"],
  standalone: true,
  imports: [
    CommonModule,
    SharedModule,
    CardComponent,
    FormActionsComponent,
    ManageCardComponent,
    ManageActionComponent,
    CopyBoxComponent,
    FilterListComponent,
    FuelLimitsFieldsComponent,
    ...SETTING_PIECES,
  ],
})
export class CodeFormComponent implements OnChanges {
  /** No native tooltip (a `title` attribute set on it by mistake). */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;
  @Input() row: AccessCodeRow | null = null;
  /** The plants it works at now (ids), the plant tree to pick them in, and how many plants there are. */
  @Input() plantIds: string[] = [];
  @Input() plantOptions: FilterListOption[] = [];
  @Input() plantTotal = 0;
  @Input() saving = false;
  /** Its Reset PIN is running (at its stations). */
  @Input() resettingPin = false;
  /** Its fuel limits as saved; null while they're read (the card shows them once in). */
  @Input() limits: FuelLimits | null = null;
  /** Change to reset the form to {@link row} (each code opened, each save). */
  @Input() resetKey = 0;
  @Output() saved = new EventEmitter<CodeFormChange>();
  /** Manage's Disable (an active code: out of its lists, its slots freed) and Enable (back in them). */
  @Output() disableCode = new EventEmitter<void>();
  @Output() enableCode = new EventEmitter<void>();
  /** Manage's Reset PIN (an active user code): its PIN cleared at the stations where it works. */
  @Output() resetPin = new EventEmitter<void>();
  @Output() deleteCode = new EventEmitter<void>();

  form: FormGroup;
  dirty = false;

  constructor(
    fb: FormBuilder,
    private destroyRef: DestroyRef
  ) {
    this.form = fb.group({
      name: ["", nameValidators(() => [])],
      plants: [[] as string[], somePlants],
      limits: fuelLimitsGroup(fb),
    });
    // DestroyRef passed explicitly: in the extension bundle, takeUntilDestroyed() without it throws NG0203.
    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.updateDirty());
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["resetKey"] || ((changes["row"] || changes["plantIds"] || changes["limits"]) && !this.dirty)) {
      this.reset();
    }
  }

  get nameLabel(): string {
    return this.row?.kind === "vehicles" ? "Vehicle" : "User";
  }

  get nameError(): string | null {
    return nameErrorOf(this.form.controls["name"], "");
  }

  /** The plants ticked (ids). */
  get plants(): string[] {
    return this.form.controls["plants"].value as string[];
  }

  /** Its limits' group (the card's). */
  get limitsGroup(): FormGroup {
    return this.form.controls["limits"] as FormGroup;
  }

  /** Under the tree: how many plants are ticked, of all of them. */
  get plantsText(): string {
    return plantsPickedText(this.plants.length, this.plantTotal);
  }

  setPlants(ids: string[]): void {
    this.form.controls["plants"].setValue(ids);
  }

  get canSubmit(): boolean {
    return this.dirty && this.form.valid && !this.saving;
  }

  submit(): void {
    this.form.markAllAsTouched();
    if (!this.canSubmit) {
      return;
    }
    const v = this.form.getRawValue();
    const plants = v.plants as string[];
    const limits = fuelLimitsOf(this.limitsGroup);
    this.saved.emit({
      name: String(v.name),
      plantIds: samePlants(plants, this.plantIds) ? null : plants,
      limits: this.limits && !sameFuelLimits(limits, this.limits) ? limits : null,
    });
  }

  cancel(): void {
    this.reset();
  }

  private reset(): void {
    const r = this.row;
    this.form.reset({ name: r?.source.name ?? "", plants: this.plantIds, limits: fuelLimitsFormValue(this.limits ?? NO_FUEL_LIMITS, "code") }, { emitEvent: false });
    this.dirty = false;
  }

  private updateDirty(): void {
    const r = this.row;
    const v = this.form.getRawValue();
    this.dirty =
      !!r &&
      (String(v.name) !== r.source.name ||
        !samePlants(v.plants as string[], this.plantIds) ||
        (!!this.limits && !sameFuelLimits(fuelLimitsOf(this.limitsGroup), this.limits)));
  }
}
