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
import { AbstractControl, FormBuilder, FormGroup, ValidationErrors, Validators } from "@angular/forms";
import { SharedModule } from "@shared/public-api";
import { CardComponent } from "../../../components/shared/card/card.component";
import { FormActionsComponent } from "../../../components/shared/form-actions/form-actions.component";
import { ManageActionComponent, ManageCardComponent } from "../../../components/shared/manage-card/manage-card.component";
import { NO_LEAD_TRAIL_SPACES } from "../../../components/shared/form-utils";
import { AccessCodeRow, expiryDateOf, expiryFromDate } from "../../models/fuel-management.models";

/** What a code panel's Settings saves: the holder's name and the expiry (null: never). */
export interface CodeSettingsChange {
  name: string;
  expiresAt: number | null;
}

/** An expiry's day may not be before today (the viewer's). */
function notBeforeToday(c: AbstractControl): ValidationErrors | null {
  const at = expiryFromDate(String(c.value ?? ""));
  return at !== null && at <= Date.now() ? { past: true } : null;
}

/**
 * A code panel's Settings tab: the holder's name and the code's last day
 * (blank: it never expires) — Cancel / Apply shown once something changed —
 * then its Manage card: Suspend (an active code) or Resume (a suspended or
 * expired one), and Revoke. The dashboard does the saving; the form resets
 * whenever {@link resetKey} changes.
 */
@Component({
  selector: "tb-fuel-code-settings",
  templateUrl: "./code-settings.component.html",
  styleUrls: ["./code-settings.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, CardComponent, FormActionsComponent, ManageCardComponent, ManageActionComponent],
})
export class CodeSettingsComponent implements OnChanges {
  /** No native tooltip (a `title` attribute set on it by mistake). */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;
  @Input() row: AccessCodeRow | null = null;
  @Input() saving = false;
  /** Change to reset the form to {@link row} (each code opened, each save). */
  @Input() resetKey = 0;
  @Output() saved = new EventEmitter<CodeSettingsChange>();
  @Output() suspendCode = new EventEmitter<void>();
  @Output() resumeCode = new EventEmitter<void>();
  @Output() revokeCode = new EventEmitter<void>();

  form: FormGroup;
  dirty = false;

  constructor(
    fb: FormBuilder,
    private destroyRef: DestroyRef
  ) {
    this.form = fb.group({
      name: ["", [Validators.required, Validators.pattern(NO_LEAD_TRAIL_SPACES)]],
      expires: ["", [notBeforeToday]],
    });
    // DestroyRef passed explicitly: in the extension bundle, takeUntilDestroyed() without it throws NG0203.
    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.updateDirty());
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["resetKey"] || (changes["row"] && !this.dirty)) {
      this.reset();
    }
  }

  get nameLabel(): string {
    return this.row?.kind === "vehicles" ? "Vehicle" : "User";
  }

  get nameError(): string | null {
    const c = this.form.controls["name"];
    if (!c.touched) {
      return null;
    }
    return c.hasError("required") ? "A name is required." : c.hasError("pattern") ? "No leading or trailing spaces." : null;
  }

  get expiresError(): string | null {
    return this.form.controls["expires"].hasError("past") ? "Pick today or a later day." : null;
  }

  get canSubmit(): boolean {
    return this.dirty && this.form.valid && !this.saving;
  }

  /** Blank the expiry: the code never expires. */
  clearExpiry(): void {
    this.form.controls["expires"].setValue("");
    this.form.controls["expires"].markAsTouched();
  }

  submit(): void {
    this.form.markAllAsTouched();
    if (!this.canSubmit) {
      return;
    }
    const v = this.form.getRawValue();
    this.saved.emit({ name: String(v.name), expiresAt: expiryFromDate(String(v.expires ?? "")) });
  }

  cancel(): void {
    this.reset();
  }

  private reset(): void {
    const r = this.row;
    this.form.reset({ name: r?.source.name ?? "", expires: expiryDateOf(r?.source.expiresAt ?? null) }, { emitEvent: false });
    this.dirty = false;
  }

  private updateDirty(): void {
    const r = this.row;
    const v = this.form.getRawValue();
    this.dirty = !!r && (String(v.name) !== r.source.name || String(v.expires ?? "") !== expiryDateOf(r.source.expiresAt));
  }
}
