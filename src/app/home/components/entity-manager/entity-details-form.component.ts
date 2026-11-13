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
import { NO_LEAD_TRAIL_SPACES } from "../../../components/shared/form-utils";
import { parseDescription } from "../../../components/shared/value-utils";
import { SharedModule } from "@shared/public-api";
import { CardComponent } from "../../../components/shared/card/card.component";
import { FormActionsComponent } from "../../../components/shared/form-actions/form-actions.component";
import { SELECT_EMPTY, SelectComponent } from "../../../components/shared/select/select.component";
import { EntityDraft, EntityOption, EntityRow } from "./entity-manager.models";


/**
 * A device's or asset's Details tab, as a profile's: its name, label, profile,
 * owner (the tenant or a customer), a device's site (`showSite`: one no gateway
 * created, held by a Site itself — the Site that holds it, "None" for none)
 * and description, then the panel's cards (projected) — Create (a new one) or
 * Apply (the edited one, once something changed). The profile, owner, site and
 * description of an edited one arrive once it's read (`profileId`, `ownerId`,
 * `siteId`, `entity` — a row from a list that doesn't carry the description, a
 * profile's tab, starts without). The panel's note fills a field ({@link setName},
 * {@link setSite}): the form's Apply saves it.
 */
@Component({
  selector: "tb-entity-details-form",
  templateUrl: "./entity-details-form.component.html",
  styleUrls: ["./entity-details-form.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, ReactiveFormsModule, CardComponent, SelectComponent, FormActionsComponent],
})
export class EntityDetailsFormComponent implements OnInit, OnChanges {
  /** "device" / "asset" — in the texts. */
  @Input() noun = "device";
  /** The row edited (null: a new one). */
  @Input() value: EntityRow | null = null;
  /** The edited one as ThingsBoard holds it (null while it's read). */
  @Input() entity: any = null;
  @Input() profileOptions: EntityOption[] = [];
  @Input() ownerOptions: EntityOption[] = [];
  /**
   * A device's Site field (always, so nothing pops in once its place is read), its options ("None" first) — locked (`siteLocked`)
   * when its site isn't its own to pick: a device a gateway created goes where the gateway is, one in a truck or a room where that is.
   */
  @Input() showSite = false;
  @Input() siteLocked = false;
  @Input() siteOptions: EntityOption[] = [];
  /** A select with nothing picked (once the lists are in): blank. */
  readonly selectEmpty = SELECT_EMPTY;
  /**
   * The edited one's profile, owner ("" for the tenant) and Site ("" none) — from the row it was opened from, then as read; null while
   * one isn't known yet (its select says "Loading…" — never a value it might not have, as the tenant or "None").
   */
  @Input() profileId: string | null = "";
  @Input() ownerId: string | null = "";
  @Input() siteId: string | null = "";
  /** Bumped on every open: the form resets. */
  @Input() resetKey = 0;
  @Input() saving = false;
  @Output() submitted = new EventEmitter<EntityDraft>();
  @Output() cancelled = new EventEmitter<void>();

  form!: FormGroup;
  private baseline = "";
  private readonly fb = inject(FormBuilder);
  private readonly cd = inject(ChangeDetectorRef);

  ngOnInit(): void {
    this.form = this.fb.group({
      name: ["", [Validators.required, Validators.pattern(NO_LEAD_TRAIL_SPACES)]],
      label: [""],
      profileId: ["", Validators.required],
      ownerId: [""],
      siteId: [""],
      description: [""],
    });
    this.reset();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.form) {
      return;
    }
    if (changes["resetKey"] || changes["value"]) {
      this.reset();
    } else if (changes["entity"] || changes["profileId"] || changes["ownerId"] || changes["siteId"] || changes["profileOptions"]) {
      this.takeRead();
    }
    if (changes["siteLocked"] || changes["resetKey"] || changes["value"]) {
      this.lockSite();
    }
  }

  /** The Site field locked (showing the site it follows) or open, as its device's place says. */
  private lockSite(): void {
    const c = this.form.controls["siteId"];
    if (this.siteLocked && c.enabled) {
      c.disable({ emitEvent: false });
    } else if (!this.siteLocked && c.disabled) {
      c.enable({ emitEvent: false });
    }
    this.cd.markForCheck();
  }

  get creating(): boolean {
    return !this.value;
  }

  /** The edited one is still being read. */
  get reading(): boolean {
    return !this.creating && !this.entity;
  }

  get dirty(): boolean {
    return !!this.form && JSON.stringify(this.form.getRawValue()) !== this.baseline;
  }

  get canSubmit(): boolean {
    return this.form.valid && !this.saving && !this.reading && (this.creating || this.dirty);
  }

  get submitLabel(): string {
    return this.saving ? "Saving…" : this.creating ? `Create ${this.noun}` : "Apply changes";
  }

  get nameError(): string | null {
    const c = this.form.controls["name"];
    if (!c.touched) {
      return null;
    }
    if (c.hasError("required")) {
      return "A name is required.";
    }
    return c.hasError("pattern") ? "No leading or trailing spaces." : null;
  }

  get profileError(): string | null {
    const c = this.form.controls["profileId"];
    return c.touched && c.hasError("required") ? "A profile is required." : null;
  }

  submit(): void {
    if (!this.canSubmit) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.submitted.emit({
      name: String(v.name).trim(),
      label: String(v.label ?? "").trim(),
      profileId: String(v.profileId),
      ownerId: String(v.ownerId ?? ""),
      ...(this.showSite && !this.siteLocked ? { siteId: String(v.siteId ?? "") } : {}),
      description: String(v.description ?? "").trim(),
    });
  }

  /** The panel's note: the name it suggests in the Name field (Apply saves it). */
  setName(name: string): void {
    this.fill("name", name);
  }

  /** The panel's note: the Site its name says in the Site field (Apply moves it). */
  setSite(siteId: string): void {
    this.fill("siteId", siteId);
  }

  private fill(control: string, value: string): void {
    const c = this.form.controls[control];
    c.setValue(value);
    c.markAsDirty();
    c.markAsTouched();
    this.cd.markForCheck();
  }

  cancel(): void {
    if (this.creating) {
      this.cancelled.emit();
    } else {
      this.reset();
    }
  }

  /** A new one's profile: "default" when there is one, else the first. */
  private defaultProfile(): string {
    return (this.profileOptions.find((p) => p.label === "default") ?? this.profileOptions[0])?.value ?? "";
  }

  private reset(): void {
    this.form.reset(
      {
        name: this.value?.name ?? "",
        label: this.value?.label ?? "",
        profileId: this.creating ? this.defaultProfile() : this.profileId,
        ownerId: this.creating ? "" : this.ownerId,
        siteId: this.creating ? "" : this.siteId,
        description: this.value?.description ?? "",
      },
      { emitEvent: false }
    );
    this.form.markAsPristine();
    this.form.markAsUntouched();
    this.baseline = JSON.stringify(this.form.getRawValue());
    this.cd.markForCheck();
  }

  /** The edited one's profile, owner and description, once read (a new one's default profile, once the profiles are): untouched fields take them. */
  private takeRead(): void {
    const patch: Record<string, string | null> = {};
    if (this.creating) {
      if (!this.form.controls["profileId"].dirty && !this.form.controls["profileId"].value) {
        patch["profileId"] = this.defaultProfile();
      }
    } else {
      if (!this.form.controls["profileId"].dirty) {
        patch["profileId"] = this.profileId;
      }
      if (!this.form.controls["ownerId"].dirty) {
        patch["ownerId"] = this.ownerId;
      }
      if (!this.form.controls["siteId"].dirty) {
        patch["siteId"] = this.siteId;
      }
      if (this.entity && !this.form.controls["description"].dirty) {
        patch["description"] = parseDescription(this.entity.additionalInfo);
      }
    }
    this.form.patchValue(patch, { emitEvent: false });
    this.baseline = JSON.stringify({ ...JSON.parse(this.baseline || "{}"), ...patch });
    this.cd.markForCheck();
  }
}
