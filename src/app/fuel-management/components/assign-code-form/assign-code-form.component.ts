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

import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { AbstractControl, FormBuilder, FormGroup, ValidationErrors, Validators } from "@angular/forms";
import { SharedModule } from "@shared/public-api";
import { CalloutComponent } from "../../../components/shared/callout/callout.component";
import { FormActionsComponent } from "../../../components/shared/form-actions/form-actions.component";
import { CardComponent } from "../../../components/shared/card/card.component";
import { nameErrorOf, nameValidators } from "../../../components/shared/form-utils";
import { FilterListComponent, FilterListOption } from "../../../components/shared/filter-list/filter-list.component";
import { plantsPickedText } from "../../../components/shared/organization/organization.models";
import { TipDirective } from "../../../components/shared/tip/tip.directive";
import { StationReadinessComponent } from "../station-readiness/station-readiness.component";
import { AssignCodeRequest, CodeKind, CodeRoom, codeRoomReason, generateAccessCode, PlcRow } from "../../models/fuel-management.models";

/**
 * Form for issuing an access code into the user or vehicle lists — the list
 * is {@link kind}, set by where the form was opened from (the Codes page's
 * Users / Vehicles tab, a pump's Codes tab): the plants it works at (the
 * plant tree a user's form picks plants with — "All plants" › each market ›
 * its plants; {@link plantsChange}, the dashboard feeds back the pick's room
 * and PLCs: a market whose every plant is ticked takes it in its own list, so
 * its sites to come get it too), the holder (the user's / vehicle's name) and
 * the 6-digit keypad code — blank to start, typed in or filled by the
 * generate button, and never one already in use — and the pick's stations
 * (tb-fuel-station-readiness: whether each can take a new code of the list
 * now). Emits {@link submitted} with an {@link AssignCodeRequest}; the
 * dashboard saves it. The form resets whenever {@link resetKey} changes.
 */
@Component({
  selector: "tb-fuel-assign-code-form",
  templateUrl: "./assign-code-form.component.html",
  styleUrls: ["./assign-code-form.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, CalloutComponent, CardComponent, FilterListComponent, FormActionsComponent, StationReadinessComponent, TipDirective],
})
export class AssignCodeFormComponent implements OnChanges {
  /** The list the code goes to (the form itself offers no choice). */
  @Input() kind: CodeKind = "users";
  /** The plants it works at (ids), the plant tree to pick them in, and how many plants there are ("9 of 32 plants selected"). */
  @Input() plantIds: string[] = [];
  @Input() plantOptions: FilterListOption[] = [];
  @Input() plantTotal = 0;
  /** Codes already in use — a typed code may not be one, a generated one never is. */
  @Input() takenCodes: string[] = [];
  /** Change to reset the form (e.g. each time the panel opens). */
  @Input() resetKey = 0;
  @Input() saving = false;
  /** The pick's room — submitting is blocked while a station it reaches is full (of the list, or in all) — and where it is, for the reason. */
  @Input() room: CodeRoom | null = null;
  @Input() scopeName = "";
  /** The pick's PLCs — the code goes to each; their readiness is shown per the selected list. */
  @Input() plcs: PlcRow[] = [];
  @Input() plcsLoading = false;
  @Output() submitted = new EventEmitter<AssignCodeRequest>();
  @Output() cancelled = new EventEmitter<void>();
  /** Other plants were ticked. */
  @Output() plantsChange = new EventEmitter<string[]>();

  /** {@link kind}, for the stations' readiness pills (kept as one array so the card isn't re-fed every check). */
  selectedKinds: CodeKind[] = ["users"];

  form: FormGroup;

  constructor(private fb: FormBuilder) {
    this.form = this.fb.group({
      plants: [[] as string[], (c: AbstractControl) => ((c.value as string[] | null)?.length ? null : { required: true })],
      name: ["", [...nameValidators(() => []), Validators.maxLength(80)]],
      code: ["", [Validators.required, Validators.pattern(/^\d{6}$/), (c: AbstractControl) => this.takenValidator(c)]],
    });
  }

  /** The plants ticked (ids). */
  get plants(): string[] {
    return this.form.controls["plants"].value as string[];
  }

  /** Under the tree: how many plants are ticked, of all of them. */
  get plantsText(): string {
    return plantsPickedText(this.plants.length, this.plantTotal);
  }

  /** Other plants ticked: the dashboard works out their room and stations. */
  setPlants(ids: string[]): void {
    this.form.controls["plants"].setValue(ids);
    this.plantsChange.emit(ids);
  }

  /** Shown under the code field: the code is in use, or (after leaving the field) isn't 6 digits. */
  get codeError(): string | null {
    const c = this.form.controls["code"];
    if (c.hasError("taken")) {
      return "This code is already in use. Enter another or generate one.";
    }
    if (c.touched && c.value && c.hasError("pattern")) {
      return "Codes are 6 digits.";
    }
    return null;
  }

  /** The code field's note (its label's info bubble). */
  readonly codeNote = "6 digits, not one already in use — type them, or generate a code.";

  get nameLabel(): string {
    return this.kind === "vehicles" ? "Vehicle" : "User";
  }

  get nameError(): string | null {
    return nameErrorOf(this.form.controls["name"], "");
  }

  /** Why the scope can't take another code of the selected list, or null. */
  get limitReason(): string | null {
    return this.room ? codeRoomReason(this.room, this.kind, this.scopeName) : null;
  }

  get canSubmit(): boolean {
    return this.form.valid && !this.limitReason && !this.saving;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["resetKey"]) {
      this.form.reset({ plants: this.plantIds, name: "", code: "" }, { emitEvent: false });
    } else if (changes["plantIds"] && this.plantIds !== this.plants) {
      this.form.patchValue({ plants: this.plantIds }, { emitEvent: false });
    }
    if (changes["kind"] || changes["resetKey"]) {
      this.selectedKinds = [this.kind];
    }
  }

  /** Fill the code field with a random unused code. */
  generate(): void {
    this.form.patchValue({ code: generateAccessCode(new Set(this.takenCodes)) });
    this.form.controls["code"].markAsTouched();
  }

  /** Keypad codes are digits only: drop anything else as it's typed (max 6). */
  digitsOnly(): void {
    const c = this.form.controls["code"];
    const digits = String(c.value ?? "").replace(/\D/g, "").slice(0, 6);
    if (digits !== c.value) {
      c.setValue(digits);
    }
  }

  submit(): void {
    if (!this.canSubmit) {
      return;
    }
    const v = this.form.value;
    this.submitted.emit({ kind: this.kind, code: v.code, name: String(v.name).trim() });
  }

  private takenValidator(c: AbstractControl): ValidationErrors | null {
    return c.value && this.takenCodes.includes(String(c.value)) ? { taken: true } : null;
  }
}
