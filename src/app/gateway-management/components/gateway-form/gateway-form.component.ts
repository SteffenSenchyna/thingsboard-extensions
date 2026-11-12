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
import { AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from "@angular/forms";
import { SharedModule } from "@shared/public-api";
import { CardComponent } from "../../../components/shared/card/card.component";
import { SelectComponent, TbSelectOption } from "../../../components/shared/select/select.component";
import { NO_LEAD_TRAIL_SPACES } from "../../models/gateway-management.models";

/** What "Create new" (a gateway) creates. */
export interface AddGatewayRequest {
  name: string;
  label: string;
  type: string;
}

/**
 * The new-gateway form ("Create new" on the gateways table): the new gateway device's name (unique among the
 * tenant's devices), label and device profile. The dashboard creates the
 * device marked as a gateway (`additionalInfo.gateway = true`), then opens
 * its panel on the launch instructions.
 */
@Component({
  selector: "tb-gm-gateway-form",
  templateUrl: "./gateway-form.component.html",
  styleUrls: ["./gateway-form.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, ReactiveFormsModule, CardComponent, SelectComponent],
})
export class GatewayFormComponent implements OnChanges {
  /** The device profiles to pick from (empty = a text box). */
  @Input() profileOptions: TbSelectOption[] = [];
  @Input() defaultType = "default";
  /** Existing gateway names — a name must be unique. */
  @Input() existingNames: string[] = [];
  /** Bumped to reset the form (each time the panel opens). */
  @Input() resetKey = 0;
  @Input() saving = false;
  @Output() submitted = new EventEmitter<AddGatewayRequest>();
  @Output() cancelled = new EventEmitter<void>();
  /** The device profile picked (not the reset's: the panel knows the default) — the panel's icon follows it. */
  @Output() typeChange = new EventEmitter<string>();

  form: FormGroup;

  constructor(
    private fb: FormBuilder,
    private destroyRef: DestroyRef
  ) {
    this.form = this.fb.group({
      name: ["", [Validators.required, Validators.pattern(NO_LEAD_TRAIL_SPACES), (c: AbstractControl) => this.uniqueName(c)]],
      label: [""],
      type: ["default", Validators.required],
    });
    this.form.controls["type"].valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((v) => this.typeChange.emit(String(v ?? "").trim()));
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["resetKey"] || changes["defaultType"]) {
      this.form.reset({ name: "", label: "", type: this.defaultType || "default" }, { emitEvent: false });
    }
  }

  get nameError(): string | null {
    const c = this.form.controls["name"];
    if (!c.touched) {
      return null;
    }
    if (c.hasError("required")) {
      return "A name is required.";
    }
    if (c.hasError("pattern")) {
      return "No leading or trailing spaces.";
    }
    if (c.hasError("duplicate")) {
      return "A gateway with this name already exists.";
    }
    return null;
  }

  get canSubmit(): boolean {
    return this.form.valid && !this.saving;
  }

  submit(): void {
    if (!this.canSubmit) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.value;
    this.submitted.emit({ name: String(v.name).trim(), label: String(v.label ?? "").trim(), type: String(v.type).trim() || "default" });
  }

  private uniqueName(c: AbstractControl): ValidationErrors | null {
    const name = String(c.value ?? "")
      .trim()
      .toLowerCase();
    return name && this.existingNames.some((n) => n.toLowerCase() === name) ? { duplicate: true } : null;
  }
}
