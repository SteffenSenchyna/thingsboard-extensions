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

import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormBuilder, FormGroup, ReactiveFormsModule } from "@angular/forms";
import { SharedModule } from "@shared/public-api";
import { CardComponent } from "../../card/card.component";
import { FormActionsComponent } from "../../form-actions/form-actions.component";
import { nameErrorOf, nameValidators } from "../../form-utils";
import { TagPickerComponent, TagPickerOption } from "../../tag-picker/tag-picker.component";
import { Application, ApplicationDraft } from "../applications.models";


/**
 * The application form (the Settings page's "Add application" / edit): the
 * application's name, its label, a description, and the device and asset
 * profiles that are its own (where it runs). A new application's Cancel / Add always show;
 * editing one, Cancel / Apply show once the form differs from it, Cancel
 * reverting. Save emits the draft; the application store saves it as the
 * application's asset.
 */
@Component({
  selector: "tb-application-form",
  templateUrl: "./application-form.component.html",
  styleUrls: ["./application-form.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, ReactiveFormsModule, CardComponent, TagPickerComponent, FormActionsComponent],
})
export class ApplicationFormComponent implements OnInit, OnChanges {
  /** The application being edited (null: a new one). */
  @Input() value: Application | null = null;
  /** The other applications' names — a name must be unique. */
  @Input() existingNames: string[] = [];
  /** ThingsBoard's device and asset profiles (the pickers' choices). */
  @Input() deviceProfileOptions: TagPickerOption[] = [];
  @Input() assetProfileOptions: TagPickerOption[] = [];
  /** The tenant's dashboards (the Dashboards picker's choices). */
  @Input() dashboardOptions: TagPickerOption[] = [];
  /** Bumped to reset the form (on every open). */
  @Input() resetKey = 0;
  @Input() saving = false;
  @Output() submitted = new EventEmitter<ApplicationDraft>();
  @Output() cancelled = new EventEmitter<void>();

  form!: FormGroup;
  /** The values as last reset: what "changed" is measured against. */
  private baseline = "";

  constructor(
    private fb: FormBuilder,
    private cd: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      name: ["", nameValidators(() => this.existingNames)],
      label: [""],
      description: [""],
      deviceProfiles: [[] as string[]],
      assetProfiles: [[] as string[]],
      dashboardIds: [[] as string[]],
    });
    this.reset();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.form) {
      return;
    }
    if (changes["resetKey"] || changes["value"]) {
      this.reset();
    }
  }

  /** A new application (not an edit of one). */
  get creating(): boolean {
    return !this.value;
  }

  /** The form's values differ from the application's (the Cancel / Apply buttons show, Apply enables). */
  get dirty(): boolean {
    return !!this.form && JSON.stringify(this.form.getRawValue()) !== this.baseline;
  }

  get submitLabel(): string {
    if (this.saving) {
      return "Saving…";
    }
    return this.creating ? "Add application" : "Apply changes";
  }

  get nameError(): string | null {
    return nameErrorOf(this.form.controls["name"], "There's an application with this name already.");
  }

  /** A profile picker's picks (the tag picker isn't a form control: its picks set the control, marking the form changed). */
  setProfiles(control: "deviceProfiles" | "assetProfiles" | "dashboardIds", names: string[]): void {
    const c = this.form.controls[control];
    c.setValue(names);
    c.markAsDirty();
  }

  get canSubmit(): boolean {
    return this.form.valid && !this.saving && (this.creating || this.dirty);
  }

  /** Discard the edits: back to the application's values (a new one: close). */
  cancel(): void {
    if (this.creating) {
      this.cancelled.emit();
    } else {
      this.reset();
    }
  }

  submit(): void {
    if (!this.canSubmit) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.value;
    this.submitted.emit({
      name: String(v.name).trim(),
      label: String(v.label ?? "").trim(),
      description: String(v.description ?? "").trim(),
      deviceProfiles: [...(v.deviceProfiles ?? [])],
      assetProfiles: [...(v.assetProfiles ?? [])],
      dashboardIds: [...(v.dashboardIds ?? [])],
    });
  }

  private reset(): void {
    const a = this.value;
    this.form.reset(
      {
        name: a?.name ?? "",
        label: a?.label ?? "",
        description: a?.description ?? "",
        deviceProfiles: [...(a?.deviceProfiles ?? [])],
        assetProfiles: [...(a?.assetProfiles ?? [])],
        dashboardIds: [...(a?.dashboardIds ?? [])],
      },
      { emitEvent: false }
    );
    this.form.markAsPristine();
    this.baseline = JSON.stringify(this.form.getRawValue());
    this.cd.markForCheck();
  }
}
