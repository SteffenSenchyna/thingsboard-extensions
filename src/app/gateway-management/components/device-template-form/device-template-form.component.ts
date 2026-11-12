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

import { ChangeDetectorRef, Component, DestroyRef, EventEmitter, HostBinding, Input, OnChanges, OnInit, Output, SimpleChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from "@angular/forms";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { merge } from "rxjs";
import { ContentType, SharedModule } from "@shared/public-api";
import { CardComponent } from "../../../components/shared/card/card.component";
import { CollapsibleCardComponent } from "../../../components/shared/collapsible-card/collapsible-card.component";
import { InfoIconComponent } from "../../../components/shared/info-icon/info-icon.component";
import { JsonEditorDirective } from "../../../components/shared/code-editor/json-editor.directive";
import { jsonObjectValidator } from "../../../components/shared/code-editor/json-validators";
import { ResizeBoxComponent } from "../../../components/shared/resize-box/resize-box.component";
import { SelectComponent, TbSelectOption } from "../../../components/shared/select/select.component";
import { TagPickerComponent, TagPickerOption } from "../../../components/shared/tag-picker/tag-picker.component";
import {
  CONNECTOR_TYPE_LABELS,
  ConnectorType,
  deviceListDefaults,
  DeviceTemplate,
  DeviceTemplateDraft,
  DeviceTemplateSource,
  getAtPath,
  NO_LEAD_TRAIL_SPACES,
} from "../../models/gateway-management.models";

/** A dot path: segments without spaces, parted by single dots ("master.slaves"). */
const DOT_PATH = /^[^.\s]+(\.[^.\s]+)*$/;

/**
 * The device template form (the Settings page's "Add template" / edit, and a
 * connector's "Save device as template"): the template's name, the connector
 * type, where that type's configuration lists its devices and which field
 * names a device, and the device block itself as JSON — taken from one of
 * the source connector's devices when saving one. It can carry applications:
 * a gateway is tagged with them when one of its connectors adds devices from
 * the template. A new template's Cancel /
 * Add always show; editing one, Cancel / Apply show once the form differs
 * from the template, Cancel reverting to it. Save emits the draft; the
 * dashboard keeps it in the tenant's attribute.
 */
@Component({
  selector: "tb-gm-device-template-form",
  templateUrl: "./device-template-form.component.html",
  styleUrls: ["./device-template-form.component.scss"],
  standalone: true,
  imports: [
    CommonModule,
    SharedModule,
    ReactiveFormsModule,
    CardComponent,
    CollapsibleCardComponent,
    InfoIconComponent,
    JsonEditorDirective,
    ResizeBoxComponent,
    SelectComponent,
    TagPickerComponent,
  ],
})
export class DeviceTemplateFormComponent implements OnInit, OnChanges {
  /** The template being edited (null: a new one). */
  @Input() value: DeviceTemplate | null = null;
  /** A connector to take a new template's device from (its type and configuration); ignored while editing. */
  @Input() source: DeviceTemplateSource | null = null;
  /** The other templates' names — a name must be unique. */
  @Input() existingNames: string[] = [];
  /** The applications (the Settings page's tags) the template can carry; none: the field isn't shown. */
  @Input() applicationOptions: TagPickerOption[] = [];
  /** Bumped to reset the form (on every open). */
  @Input() resetKey = 0;
  @Input() saving = false;
  /** Two columns (a dialog's width): the template's fields on the left, the Device card — its JSON — on the right, the whole height. */
  @Input() @HostBinding("class.dt-wide") wide = false;
  /** No buttons of its own: a dialog's footer has them, and calls {@link submit}. */
  @Input() hideActions = false;
  @Output() submitted = new EventEmitter<DeviceTemplateDraft>();
  @Output() cancelled = new EventEmitter<void>();

  readonly ContentType = ContentType;
  /** What the Device block is (its title's info icon). */
  readonly deviceInfo = "One entry of the device list — its registers, attributes and time series — as the connector's configuration holds it. The name is set per device when adding.";
  readonly typeOptions: TbSelectOption[] = Object.entries(CONNECTOR_TYPE_LABELS).map(([value, label]) => ({ value, label }));
  form!: FormGroup;
  /** The source connector's devices (what its configuration lists at the device list path), to take the block from. */
  sourceOptions: TbSelectOption[] = [];
  sourceIndex = "0";
  /** The template's applications (ids), as picked. */
  applications: string[] = [];
  /** The path fields were edited by hand (a type change no longer refills them). */
  private pathsTouched = false;
  /** The values as last reset: what "changed" is measured against. */
  private baseline = "";

  constructor(
    private fb: FormBuilder,
    private cd: ChangeDetectorRef,
    private destroyRef: DestroyRef
  ) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      name: ["", [Validators.required, Validators.pattern(NO_LEAD_TRAIL_SPACES), (c: AbstractControl) => this.uniqueName(c)]],
      type: [ConnectorType.MODBUS, Validators.required],
      listPath: ["", [Validators.required, Validators.pattern(DOT_PATH)]],
      nameKey: ["", [Validators.required, Validators.pattern(DOT_PATH)]],
      deviceJson: ["{}", jsonObjectValidator],
    });
    this.form.controls["type"].valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.onTypeChange());
    merge(this.form.controls["listPath"].valueChanges, this.form.controls["nameKey"].valueChanges)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.form.controls["listPath"].dirty || this.form.controls["nameKey"].dirty) {
          this.pathsTouched = true;
        }
        this.buildSourceOptions();
      });
    this.reset();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.form) {
      return;
    }
    if (changes["resetKey"] || changes["value"] || changes["source"]) {
      this.reset();
    }
  }

  get type(): ConnectorType {
    return this.form.controls["type"].value as ConnectorType;
  }

  /** A new template (not an edit of one). */
  get creating(): boolean {
    return !this.value;
  }

  /** The form's values differ from the template's (the Cancel / Apply buttons show, Apply enables). */
  get dirty(): boolean {
    return !!this.form && this.snapshot() !== this.baseline;
  }

  /** The form's values with the applications picked (in any order): what "changed" compares. */
  private snapshot(): string {
    return JSON.stringify({ ...this.form.getRawValue(), applications: [...this.applications].sort() });
  }

  onApplications(ids: string[]): void {
    this.applications = ids;
    this.cd.markForCheck();
  }

  get submitLabel(): string {
    if (this.saving) {
      return "Saving…";
    }
    return this.creating ? "Add template" : "Apply changes";
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
      return "There's a template with this name already.";
    }
    return null;
  }

  get listPathError(): string | null {
    return this.pathError("listPath", "master.slaves");
  }

  get nameKeyError(): string | null {
    return this.pathError("nameKey", "deviceName");
  }

  get jsonError(): string | null {
    const c = this.form.controls["deviceJson"];
    if (!c.touched && !c.dirty) {
      return null;
    }
    if (c.hasError("required")) {
      return "The device is required.";
    }
    if (c.hasError("contentBody")) {
      return "The device isn't valid JSON.";
    }
    if (c.hasError("json")) {
      return "The device must be a JSON object.";
    }
    return null;
  }

  get canSubmit(): boolean {
    return this.form.valid && !this.saving && (this.creating || this.dirty);
  }

  /** Discard the edits: back to the template's values (a new one: close). */
  cancel(): void {
    if (this.creating) {
      this.cancelled.emit();
    } else {
      this.reset();
    }
  }

  /** The source connector's device at the index: its block into the box, and (a blank name) its device type as the name. */
  pickSource(index: string): void {
    this.sourceIndex = index;
    const list = this.sourceList;
    const device = list[Number(index)];
    if (!device) {
      return;
    }
    this.form.controls["deviceJson"].setValue(JSON.stringify(device, null, 2));
    const name = this.form.controls["name"];
    if (!String(name.value ?? "").trim() && typeof device["deviceType"] === "string") {
      name.setValue(device["deviceType"]);
    }
    this.cd.markForCheck();
  }

  submit(): void {
    if (!this.canSubmit) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.value;
    this.submitted.emit({
      name: String(v.name).trim(),
      type: v.type as ConnectorType,
      listPath: String(v.listPath).trim(),
      nameKey: String(v.nameKey).trim(),
      device: JSON.parse(String(v.deviceJson)),
      applications: [...this.applications],
    });
  }

  /** The form's values: the template's, or — a new one — the source connector's type and its first device, or the defaults. */
  private reset(): void {
    const v = this.value;
    const s = v ? null : this.source;
    const type = v?.type ?? s?.type ?? ConnectorType.MODBUS;
    const defaults = deviceListDefaults(type);
    this.form.reset(
      {
        name: v?.name ?? "",
        type,
        listPath: v?.listPath ?? defaults.listPath,
        nameKey: v?.nameKey ?? defaults.nameKey,
        deviceJson: JSON.stringify(v?.device ?? {}, null, 2),
      },
      { emitEvent: false }
    );
    this.pathsTouched = false;
    this.sourceIndex = "0";
    this.applications = [...(v?.applications ?? [])];
    this.buildSourceOptions();
    if (s && this.sourceOptions.length) {
      this.pickSource("0");
    }
    this.form.markAsPristine();
    this.baseline = this.snapshot();
    this.cd.markForCheck();
  }

  /** A type change: that type's device list and name field, unless they were typed. */
  private onTypeChange(): void {
    if (this.pathsTouched) {
      return;
    }
    const defaults = deviceListDefaults(this.type);
    this.form.patchValue({ listPath: defaults.listPath, nameKey: defaults.nameKey }, { emitEvent: false });
    this.buildSourceOptions();
  }

  /** The source connector's devices at the device list path (none while editing a template). */
  private get sourceList(): Record<string, any>[] {
    const s = this.value ? null : this.source;
    const path = String(this.form.controls["listPath"].value ?? "").trim();
    const list = s && path ? getAtPath(s.config, path) : null;
    return Array.isArray(list) ? list.filter((d): d is Record<string, any> => !!d && typeof d === "object") : [];
  }

  private buildSourceOptions(): void {
    const nameKey = String(this.form.controls["nameKey"].value ?? "").trim();
    this.sourceOptions = this.sourceList.map((d, i) => {
      const name = nameKey ? getAtPath(d, nameKey) : undefined;
      return { value: String(i), label: typeof name === "string" && name ? name : `Device ${i + 1}` };
    });
    if (!this.sourceOptions.some((o) => o.value === this.sourceIndex)) {
      this.sourceIndex = "0";
    }
  }

  private pathError(control: string, example: string): string | null {
    const c = this.form.controls[control];
    if (!c.touched) {
      return null;
    }
    if (c.hasError("required")) {
      return "Required.";
    }
    if (c.hasError("pattern")) {
      return `A dot path, like ${example}.`;
    }
    return null;
  }

  private uniqueName(c: AbstractControl): ValidationErrors | null {
    const name = String(c.value ?? "")
      .trim()
      .toLowerCase();
    if (!name) {
      return null;
    }
    return this.existingNames.some((n) => n.toLowerCase() === name) ? { duplicate: true } : null;
  }
}
