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
import { CopyBoxComponent } from "../../../components/shared/copy-box/copy-box.component";
import { SplitToggleComponent } from "../../../components/shared/split-toggle/split-toggle.component";
import {
  AssignCodeRequest,
  CODE_KINDS,
  CodeKind,
  CodeLimits,
  codeLimitReason,
  generateAccessCode,
  MarketCodes,
} from "../../models/fuel-management.models";

/**
 * Form for issuing an access code into a market's user or vehicle list: the
 * list (Users | Vehicles), the holder (the user's / vehicle's name) and a
 * generated 6-digit keypad code (regenerable, copyable). Emits {@link submitted}
 * with an {@link AssignCodeRequest}; the dashboard saves it to the market. The
 * form resets whenever {@link resetKey} changes.
 */
@Component({
  selector: "tb-fuel-assign-code-form",
  templateUrl: "./assign-code-form.component.html",
  styleUrls: ["./assign-code-form.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, CardComponent, CopyBoxComponent, SplitToggleComponent],
})
export class AssignCodeFormComponent implements OnChanges {
  /** List the form starts on. */
  @Input() kind: CodeKind = "users";
  /** Codes already in the market — a generated code never collides with these. */
  @Input() takenCodes: string[] = [];
  /** Change to reset the form (e.g. each time the panel opens). */
  @Input() resetKey = 0;
  @Input() saving = false;
  /** The market's current codes and limits — submitting is blocked while the
   *  total or the selected list is at its limit. */
  @Input() codes: MarketCodes | null = null;
  @Input() limits: CodeLimits | null = null;
  @Output() submitted = new EventEmitter<AssignCodeRequest>();
  @Output() cancelled = new EventEmitter<void>();

  readonly kinds = CODE_KINDS;

  form: FormGroup;

  constructor(private fb: FormBuilder) {
    this.form = this.fb.group({
      kind: ["users" as CodeKind],
      name: ["", [Validators.required, Validators.maxLength(80)]],
      code: [""],
    });
  }

  get code(): string {
    return this.form.value.code;
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
      this.form.reset({ kind: this.kind, name: "", code: this.newCode() });
    }
  }

  setKind(kind: string): void {
    this.form.patchValue({ kind });
  }

  regenerate(): void {
    this.form.patchValue({ code: this.newCode() });
  }

  submit(): void {
    if (!this.canSubmit) {
      return;
    }
    const v = this.form.value;
    this.submitted.emit({ kind: v.kind, code: v.code, name: String(v.name).trim() });
  }

  private newCode(): string {
    return generateAccessCode(new Set(this.takenCodes));
  }
}
