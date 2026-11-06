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
import { AbstractControl, FormBuilder, FormGroup, ValidationErrors, Validators } from "@angular/forms";
import { SharedModule } from "@shared/public-api";
import { CardComponent } from "../../../components/shared/card/card.component";
import { SelectComponent, TbSelectOption } from "../../../components/shared/select/select.component";
import { StationReadinessComponent } from "../station-readiness/station-readiness.component";
import {
  AssignCodeRequest,
  CodeKind,
  CodeLimits,
  codeLimitReason,
  generateAccessCode,
  MarketCodes,
  PlcRow,
} from "../../models/fuel-management.models";

/**
 * Form for issuing an access code into a market's user or vehicle list — the
 * list is {@link kind}, set by where the form was opened from (the Codes
 * page's Users / Vehicles tab, a pump's Codes tab): the market (a dropdown — changing it emits
 * {@link marketChange}, and the dashboard feeds back that market's codes,
 * limits and PLCs), the holder (the user's / vehicle's name) and the
 * 6-digit keypad code — blank to start, typed in or filled by the generate
 * button, and never one already in use — and the market's stations
 * (tb-fuel-station-readiness: whether each can take a new code of the
 * selected list now). Emits {@link submitted}
 * with an {@link AssignCodeRequest}; the dashboard saves it to the market. The
 * form resets whenever {@link resetKey} changes.
 */
@Component({
  selector: "tb-fuel-assign-code-form",
  templateUrl: "./assign-code-form.component.html",
  styleUrls: ["./assign-code-form.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, CardComponent, SelectComponent, StationReadinessComponent],
})
export class AssignCodeFormComponent implements OnChanges {
  /** The list the code goes to (the form itself offers no choice). */
  @Input() kind: CodeKind = "users";
  /** The market the code goes to, and the markets to pick from. */
  @Input() marketId: string | null = null;
  @Input() marketOptions: TbSelectOption[] = [];
  /** Codes already in use — a typed code may not be one, a generated one never is. */
  @Input() takenCodes: string[] = [];
  /** Change to reset the form (e.g. each time the panel opens). */
  @Input() resetKey = 0;
  @Input() saving = false;
  /** The market's current codes and limits — submitting is blocked while the
   *  total or the selected list is at its limit. */
  @Input() codes: MarketCodes | null = null;
  @Input() limits: CodeLimits | null = null;
  /** The market's PLCs — the code goes to each; their readiness is shown per the selected list. */
  @Input() plcs: PlcRow[] = [];
  @Input() plcsLoading = false;
  @Output() submitted = new EventEmitter<AssignCodeRequest>();
  @Output() cancelled = new EventEmitter<void>();
  /** Another market was picked. */
  @Output() marketChange = new EventEmitter<string>();

  /** {@link kind}, for the stations' readiness pills (kept as one array so the card isn't re-fed every check). */
  selectedKinds: CodeKind[] = ["users"];

  form: FormGroup;

  // DestroyRef passed explicitly: in the extension bundle, takeUntilDestroyed()
  // without one throws NG0203 at runtime (no injection context).
  constructor(
    private fb: FormBuilder,
    private destroyRef: DestroyRef
  ) {
    this.form = this.fb.group({
      market: [null as string | null, Validators.required],
      name: ["", [Validators.required, Validators.maxLength(80)]],
      code: ["", [Validators.required, Validators.pattern(/^\d{6}$/), (c: AbstractControl) => this.takenValidator(c)]],
    });
    this.form.controls["market"].valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((id: string | null) => {
      if (id && id !== this.marketId) {
        this.marketChange.emit(id);
      }
    });
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

  get selectedKind(): CodeKind {
    return this.kind;
  }

  get nameLabel(): string {
    return this.selectedKind === "vehicles" ? "Vehicle" : "User";
  }

  get namePlaceholder(): string {
    return this.selectedKind === "vehicles" ? "Unit number or vehicle name" : "Full name";
  }

  /** Why the selected list can't take another code, or null. */
  get limitReason(): string | null {
    return this.codes && this.limits ? codeLimitReason(this.codes, this.limits, this.selectedKind) : null;
  }

  get canSubmit(): boolean {
    return this.form.valid && !this.limitReason && !this.saving;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["resetKey"]) {
      this.form.reset({ market: this.marketId, name: "", code: "" }, { emitEvent: false });
    } else if (changes["marketId"]) {
      this.form.patchValue({ market: this.marketId }, { emitEvent: false });
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
