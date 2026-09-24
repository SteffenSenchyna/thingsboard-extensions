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
import { FormBuilder, FormGroup, Validators } from "@angular/forms";
import { SharedModule } from "@shared/public-api";
import { CardComponent } from "../../../components/shared/card/card.component";
import { CheckboxComponent } from "../../../components/shared/checkbox/checkbox.component";
import { CopyBoxComponent } from "../../../components/shared/copy-box/copy-box.component";
import { SelectComponent, TbSelectOption } from "../../../components/shared/select/select.component";
import {
  AssignCodeRequest,
  HOLDER_TYPE_OPTIONS,
  HolderType,
  PumpRow,
  VALIDITY_OPTIONS,
  generateAccessCode,
} from "../../models/fuel-management.models";

/**
 * Form for issuing an access code: holder name + type, a generated 6-digit
 * keypad code (regenerable, copyable), validity, and the pumps it opens.
 * Emits {@link submitted} with an {@link AssignCodeRequest}; the dashboard writes
 * it to each selected pump. The form resets whenever {@link resetKey} changes.
 */
@Component({
  selector: "tb-fuel-assign-code-form",
  templateUrl: "./assign-code-form.component.html",
  styleUrls: ["./assign-code-form.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, CardComponent, CheckboxComponent, CopyBoxComponent, SelectComponent],
})
export class AssignCodeFormComponent implements OnChanges {
  /** Pumps offered in the checklist. */
  @Input() pumps: PumpRow[] = [];
  /** Pumps pre-checked when the form (re)opens. */
  @Input() initialPumpIds: string[] = [];
  /** Codes already in use — a generated code never collides with these. */
  @Input() takenCodes: string[] = [];
  /** Change to reset the form (e.g. each time the panel opens). */
  @Input() resetKey = 0;
  @Input() saving = false;
  @Output() submitted = new EventEmitter<AssignCodeRequest>();
  @Output() cancelled = new EventEmitter<void>();

  readonly holderTypes: TbSelectOption[] = HOLDER_TYPE_OPTIONS;
  readonly validityOptions: TbSelectOption[] = VALIDITY_OPTIONS.map(({ value, label }) => ({ value, label }));

  form: FormGroup;
  checkedPumpIds = new Set<string>();

  constructor(private fb: FormBuilder) {
    this.form = this.fb.group({
      holder: ["", [Validators.required, Validators.maxLength(80)]],
      holderType: ["driver" as HolderType],
      code: [""],
      validity: ["30d"],
    });
  }

  get code(): string {
    return this.form.value.code;
  }

  get canSubmit(): boolean {
    return this.form.valid && this.checkedPumpIds.size > 0 && !this.saving;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["resetKey"] || changes["initialPumpIds"]) {
      this.form.reset({ holder: "", holderType: "driver", code: this.newCode(), validity: "30d" });
      this.checkedPumpIds = new Set(this.initialPumpIds);
    }
  }

  regenerate(): void {
    this.form.patchValue({ code: this.newCode() });
  }

  isChecked(pump: PumpRow): boolean {
    return this.checkedPumpIds.has(pump.pumpId);
  }

  togglePump(pump: PumpRow): void {
    if (this.checkedPumpIds.has(pump.pumpId)) {
      this.checkedPumpIds.delete(pump.pumpId);
    } else {
      this.checkedPumpIds.add(pump.pumpId);
    }
  }

  submit(): void {
    if (!this.canSubmit) {
      return;
    }
    const v = this.form.value;
    const days = VALIDITY_OPTIONS.find((o) => o.value === v.validity)?.days ?? null;
    this.submitted.emit({
      code: v.code,
      holder: String(v.holder).trim(),
      holderType: v.holderType,
      expiresAt: days == null ? null : endOfDay(Date.now() + days * 86400000),
      pumpIds: this.pumps.filter((p) => this.checkedPumpIds.has(p.pumpId)).map((p) => p.pumpId),
    });
  }

  trackByPumpId(_: number, p: PumpRow): string {
    return p.pumpId;
  }

  private newCode(): string {
    return generateAccessCode(new Set(this.takenCodes));
  }
}

/** Codes stay valid through the whole last day. */
function endOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}
