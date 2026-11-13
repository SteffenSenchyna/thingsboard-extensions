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


import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import { SharedModule } from "@shared/public-api";
import { CardComponent } from "../../../components/shared/card/card.component";
import { FormActionsComponent } from "../../../components/shared/form-actions/form-actions.component";
import { NO_LEAD_TRAIL_SPACES, nameErrorOf } from "../../../components/shared/form-utils";
import { IconPickerComponent } from "../../../components/shared/icon-picker/icon-picker.component";
import { DEFAULT_PROFILE_ICON, ProfileKind } from "../../../components/shared/profile-icons/profile-icons";
import { SelectComponent, TbSelectOption } from "../../../components/shared/select/select.component";
import { SwitchComponent } from "../../../components/shared/switch/switch.component";
import { TipDirective } from "../../../components/shared/tip/tip.directive";
import { NO_PROFILE_CHOICES, PROFILE_NOUN, ProfileChoices, ProfileDraft, ProfileRow, profileDraftOf } from "./profile-manager.models";

/** The image a profile holds that isn't in the gallery (an older embedded one): kept, by this label. */
const CURRENT_IMAGE = "Current image";

/**
 * A device or asset profile's Details tab, as ThingsBoard's own: its name,
 * its icon (what the dashboards show its devices / assets by — `tb-icon-picker`),
 * a device profile's "Mobile" (its devices are vehicles: the tenant's
 * `mobileProfiles`, which the panel saves), its description, its default rule chain, queue and dashboard, and its image
 * (one of the gallery's, previewed). Create (a new one) or Apply (the edited
 * one, once something changed); the panel's Manage card is projected under
 * the cards. An edited one's profile, icon and Mobile arrive once read
 * (`profile`, `icon`, `mobile`): untouched fields take them.
 */
@Component({
  selector: "tb-profile-form",
  templateUrl: "./profile-form.component.html",
  styleUrls: ["./profile-form.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, ReactiveFormsModule, CardComponent, SelectComponent, IconPickerComponent, FormActionsComponent, SwitchComponent, TipDirective],
})
export class ProfileFormComponent implements OnInit, OnChanges {
  @Input() kind: ProfileKind = "device";
  /** The row edited (null: a new one). */
  @Input() value: ProfileRow | null = null;
  /** The edited one as ThingsBoard holds it (null while it's read). */
  @Input() profile: any = null;
  /** The edited one's icon ("" none; null while it's read). */
  @Input() icon: string | null = null;
  /** A device profile's: its devices are vehicles (one of the tenant's `mobileProfiles`; null while it's read). */
  @Input() mobile: boolean | null = null;
  /** The Mobile switch's note (its info bubble). */
  readonly mobileNote = "Its devices are vehicles: each goes where its gateway is, and its gateway is named for its number.";
  @Input() choices: ProfileChoices = NO_PROFILE_CHOICES;
  /** Bumped on every open: the form resets. */
  @Input() resetKey = 0;
  @Input() saving = false;
  @Output() submitted = new EventEmitter<ProfileDraft>();
  @Output() cancelled = new EventEmitter<void>();

  form!: FormGroup;
  /** The pickers' options, an empty choice first (kept until the choices or the profile change: a select re-filters on a new list). */
  ruleChainOptions: TbSelectOption[] = [];
  queueOptions: TbSelectOption[] = [];
  dashboardOptions: TbSelectOption[] = [];
  imageOptions: TbSelectOption[] = [];
  private baseline = "";
  private readonly fb = inject(FormBuilder);
  private readonly cd = inject(ChangeDetectorRef);

  ngOnInit(): void {
    this.form = this.fb.group({
      name: ["", [Validators.required, Validators.pattern(NO_LEAD_TRAIL_SPACES)]],
      description: [""],
      icon: [""],
      image: [""],
      ruleChainId: [""],
      queueName: [""],
      dashboardId: [""],
      mobile: [false],
    });
    this.buildOptions();
    this.reset();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.form) {
      return;
    }
    if (changes["choices"] || changes["profile"]) {
      this.buildOptions();
    }
    if (changes["resetKey"] || changes["value"]) {
      this.reset();
    } else if (changes["profile"] || changes["icon"] || changes["mobile"]) {
      this.takeRead();
    }
  }

  get creating(): boolean {
    return !this.value;
  }

  /** The edited one is still being read. */
  get reading(): boolean {
    return !this.creating && (!this.profile || this.icon === null || (this.kind === "device" && this.mobile === null));
  }

  get defaultIcon(): string {
    return DEFAULT_PROFILE_ICON[this.kind];
  }

  get dirty(): boolean {
    return !!this.form && JSON.stringify(this.form.getRawValue()) !== this.baseline;
  }

  get canSubmit(): boolean {
    return this.form.valid && !this.saving && !this.reading && (this.creating || this.dirty);
  }

  get submitLabel(): string {
    return this.saving ? "Saving…" : this.creating ? `Create ${PROFILE_NOUN[this.kind]}` : "Apply changes";
  }

  get nameError(): string | null {
    return nameErrorOf(this.form.controls["name"], `A ${PROFILE_NOUN[this.kind]} of that name already exists.`);
  }

  /** The image picked, as the preview loads it (ThingsBoard's image pipe reads `tb-image;` links with the user's token). */
  get imageValue(): string {
    return String(this.form.controls["image"].value ?? "");
  }

  submit(): void {
    if (!this.canSubmit) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.submitted.emit({
      name: String(v.name).trim(),
      description: String(v.description ?? "").trim(),
      icon: String(v.icon ?? ""),
      image: String(v.image ?? ""),
      ruleChainId: String(v.ruleChainId ?? ""),
      queueName: String(v.queueName ?? ""),
      dashboardId: String(v.dashboardId ?? ""),
      mobile: this.kind === "device" && !!v.mobile,
    });
  }

  cancel(): void {
    if (this.creating) {
      this.cancelled.emit();
    } else {
      this.reset();
    }
  }

  private start(): ProfileDraft {
    if (this.creating) {
      return { name: "", description: "", icon: "", image: "", ruleChainId: "", queueName: "", dashboardId: "", mobile: false };
    }
    if (this.profile) {
      return profileDraftOf(this.profile, this.icon ?? "", !!this.mobile);
    }
    // Still read: what the row knows.
    return { name: this.value?.name ?? "", description: this.value?.description ?? "", icon: "", image: "", ruleChainId: "", queueName: "", dashboardId: "", mobile: false };
  }

  private reset(): void {
    this.form.reset(this.start(), { emitEvent: false });
    this.form.markAsPristine();
    this.form.markAsUntouched();
    this.baseline = JSON.stringify(this.form.getRawValue());
    this.cd.markForCheck();
  }

  /** The edited one read: its untouched fields take what it holds. */
  private takeRead(): void {
    if (this.creating) {
      return;
    }
    const start = this.start() as unknown as Record<string, string>;
    const patch: Record<string, string> = {};
    for (const key of Object.keys(start)) {
      if (!this.form.controls[key].dirty) {
        patch[key] = start[key];
      }
    }
    this.form.patchValue(patch, { emitEvent: false });
    this.baseline = JSON.stringify({ ...JSON.parse(this.baseline || "{}"), ...patch });
    this.cd.markForCheck();
  }

  private buildOptions(): void {
    const c = this.choices ?? NO_PROFILE_CHOICES;
    this.ruleChainOptions = [{ value: "", label: "Default (root rule chain)" }, ...c.ruleChains];
    this.queueOptions = [{ value: "", label: "Default (Main)" }, ...c.queues];
    this.dashboardOptions = [{ value: "", label: "None" }, ...c.dashboards];
    const current = String(this.profile?.image ?? "");
    const known = !current || c.images.some((o) => o.value === current);
    this.imageOptions = [{ value: "", label: "None" }, ...(known ? [] : [{ value: current, label: CURRENT_IMAGE }]), ...c.images];
  }
}
