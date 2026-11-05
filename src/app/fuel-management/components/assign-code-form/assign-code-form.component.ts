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
import { DataTableCellDirective, DataTableColumn, DataTableComponent } from "../../../components/shared/data-table/data-table.component";
import { SelectComponent, TbSelectOption } from "../../../components/shared/select/select.component";
import { SplitToggleComponent } from "../../../components/shared/split-toggle/split-toggle.component";
import { StatusPillComponent, StatusPillTone } from "../../../components/shared/status-pill/status-pill.component";
import {
  AssignCodeRequest,
  CODE_KIND_TOGGLE,
  CodeKind,
  CodeLimits,
  codeLimitReason,
  generateAccessCode,
  MarketCodes,
  PLC_READINESS_META,
  PlcRow,
  plcReadiness,
  plcReadinessHint,
} from "../../models/fuel-management.models";

/** A PLC with its readiness pill for the selected list. */
interface PlcReadinessRow extends PlcRow {
  label: string;
  icon: string;
  tone: StatusPillTone;
  hint: string;
}

/**
 * Form for issuing an access code into a market's user or vehicle list: the
 * list (Users | Vehicles), the market (a dropdown — changing it emits
 * {@link marketChange}, and the dashboard feeds back that market's codes,
 * limits and PLCs), the holder (the user's / vehicle's name) and the
 * 6-digit keypad code — blank to start, typed in or filled by the generate
 * button, and never one already in use — and the market's PLCs, each with a
 * pill saying whether it can take a new code of the selected list now
 * ({@link plcReadiness}: its transfer flag). Emits {@link submitted}
 * with an {@link AssignCodeRequest}; the dashboard saves it to the market. The
 * form resets whenever {@link resetKey} changes.
 */
@Component({
  selector: "tb-fuel-assign-code-form",
  templateUrl: "./assign-code-form.component.html",
  styleUrls: ["./assign-code-form.component.scss"],
  standalone: true,
  imports: [
    CommonModule,
    SharedModule,
    CardComponent,
    DataTableComponent,
    DataTableCellDirective,
    SelectComponent,
    SplitToggleComponent,
    StatusPillComponent,
  ],
})
export class AssignCodeFormComponent implements OnChanges {
  /** List the form starts on. */
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

  readonly kinds = CODE_KIND_TOGGLE;
  readonly plcColumns: DataTableColumn[] = [
    { key: "name", header: "" },
    { key: "status", header: "", align: "right" },
  ];
  /** {@link plcs} with each one's pill for the selected list. */
  plcRows: PlcReadinessRow[] = [];

  form: FormGroup;

  // DestroyRef passed explicitly: in the extension bundle, takeUntilDestroyed()
  // without one throws NG0203 at runtime (no injection context).
  constructor(
    private fb: FormBuilder,
    private destroyRef: DestroyRef
  ) {
    this.form = this.fb.group({
      kind: ["users" as CodeKind],
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
    return this.form.value.kind;
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
      this.form.reset({ kind: this.kind, market: this.marketId, name: "", code: "" }, { emitEvent: false });
    } else if (changes["marketId"]) {
      this.form.patchValue({ market: this.marketId }, { emitEvent: false });
    }
    this.refreshPlcRows();
  }

  setKind(kind: string): void {
    this.form.patchValue({ kind });
    this.refreshPlcRows(); // the pills follow the list
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
    this.submitted.emit({ kind: v.kind, code: v.code, name: String(v.name).trim() });
  }

  private takenValidator(c: AbstractControl): ValidationErrors | null {
    return c.value && this.takenCodes.includes(String(c.value)) ? { taken: true } : null;
  }

  private refreshPlcRows(): void {
    const kind = this.selectedKind;
    this.plcRows = this.plcs.map((plc) => {
      const readiness = plcReadiness(plc, kind);
      return { ...plc, ...PLC_READINESS_META[readiness], hint: plcReadinessHint(readiness, kind) };
    });
  }
}
