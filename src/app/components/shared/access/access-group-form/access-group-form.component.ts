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

import { ChangeDetectorRef, Component, DoCheck, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormBuilder, FormGroup, ReactiveFormsModule } from "@angular/forms";
import { CardComponent } from "../../card/card.component";
import { FormActionsComponent } from "../../form-actions/form-actions.component";
import { nameErrorOf, nameValidators } from "../../form-utils";
import { SelectComponent, TbSelectOption } from "../../select/select.component";
import { IconBadgeComponent } from "../../icon-badge/icon-badge.component";
import { TagPickerComponent, TagPickerOption } from "../../tag-picker/tag-picker.component";
import { AssetRow } from "../../organization/organization.models";
import {
  AccessGroup,
  AccessGroupDraft,
  AccessLevel,
  AccessRole,
  AccessScopeChoice,
  BUILT_IN_ROLES,
  completeScope,
  scopeChoiceComplete,
  scopeChoiceOf,
  scopeLabel,
  ACCESS_SCOPE_TYPES,
  accessScopeType,
} from "../access.models";
import { AccessScopePickerComponent } from "../access-scope-picker/access-scope-picker.component";
import { AccessLevelActionsComponent } from "../access-level-actions/access-level-actions.component";

/**
 * An access group's form (its panel's Group tab): its name and description;
 * its scope (`tb-access-scope-picker`: regional, a product line, a market or
 * a plant — every device and asset at its sites); and its access — the
 * level and its other dashboards. A default group (a
 * scope item's, a level each) shows its name, scope and level as they are:
 * they stay (the rule chain renames it with its item). Create / Cancel
 * always show for a new group; editing one, Cancel / Apply show once it
 * differs. Save emits the draft; the access store saves and syncs it.
 */
@Component({
  selector: "tb-access-group-form",
  templateUrl: "./access-group-form.component.html",
  styleUrls: ["./access-group-form.component.scss"],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    CardComponent,
    SelectComponent,
    IconBadgeComponent,
    TagPickerComponent,
    AccessScopePickerComponent,
    AccessLevelActionsComponent,
    FormActionsComponent,
  ],
})
export class AccessGroupFormComponent implements OnInit, OnChanges, DoCheck {
  /** The group being edited (null: a new one). */
  @Input() value: AccessGroup | null = null;
  /** The other groups' names — a name is unique. */
  @Input() existingNames: string[] = [];
  /** The Organization's lists (the scope's choices). */
  @Input() productLines: AssetRow[] = [];
  @Input() markets: AssetRow[] = [];
  @Input() sites: AssetRow[] = [];
  /** The dashboards (the other dashboards' choices; "None" first, left out). */
  @Input() dashboardOptions: TbSelectOption[] = [];
  /** The roles (Access › Roles): the "Role" choices. */
  @Input() roles: AccessRole[] = BUILT_IN_ROLES;
  @Input() resetKey = 0;
  @Input() saving = false;
  @Output() submitted = new EventEmitter<AccessGroupDraft>();
  @Output() cancelled = new EventEmitter<void>();

  form!: FormGroup;
  /** The roles, a select's options. */
  levelOptions: TbSelectOption[] = [];
  /** The dashboards (the Other dashboards picker's choices, without "None"). */
  dashboardTags: TagPickerOption[] = [];
  private baseline = "";
  private seenDashboards?: TbSelectOption[];
  private seenRoles?: AccessRole[];

  constructor(
    private fb: FormBuilder,
    private cd: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      name: ["", nameValidators(() => this.existingNames)],
      description: [""],
      scope: [scopeChoiceOf(null)],
      level: ["viewer"],
      dashboardIds: [[] as string[]],
    });
    this.reset();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.form && (changes["resetKey"] || changes["value"])) {
      this.reset();
    }
  }

  ngDoCheck(): void {
    if (this.seenRoles !== this.roles) {
      this.seenRoles = this.roles;
      this.levelOptions = this.roles.map((r) => ({ value: r.id, label: r.label }));
    }
    if (this.seenDashboards !== this.dashboardOptions) {
      this.seenDashboards = this.dashboardOptions;
      this.dashboardTags = this.dashboardOptions.filter((o) => !!o.value).map((o) => ({ id: o.value, label: o.label }));
    }
  }

  get creating(): boolean {
    return !this.value;
  }

  get dirty(): boolean {
    return !!this.form && JSON.stringify(this.form.getRawValue()) !== this.baseline;
  }

  get submitLabel(): string {
    return this.saving ? "Saving…" : this.creating ? "Create group" : "Apply changes";
  }

  get scope(): AccessScopeChoice {
    return this.form.controls["scope"].value as AccessScopeChoice;
  }

  /** One of its scope item's default groups: its scope and level are fixed. */
  get isDefault(): boolean {
    return !!this.value?.auto;
  }

  /** A default group's scope, in words. */
  get scopeText(): string {
    const names = new Map<string, string>();
    [...this.productLines, ...this.markets, ...this.sites].forEach((a) => names.set(a.id, a.label || a.name));
    return this.value ? scopeLabel(this.value.scope, (id) => names.get(id) ?? "—") : "";
  }

  /** A default group's scope type, as an icon (the scope types': regional, product line, market, plant). */
  get scopeIcon(): string {
    return this.value ? (ACCESS_SCOPE_TYPES.find((t) => t.id === accessScopeType(this.value!.scope))?.icon ?? "groups") : "groups";
  }

  /** The role picked. */
  get role(): AccessRole | undefined {
    return this.roles.find((r) => r.id === this.form.controls["level"].value);
  }

  /** The role picked, as an icon. */
  get levelIcon(): string {
    return this.role?.icon ?? "person";
  }

  get levelLabel(): string {
    return this.role?.label ?? String(this.form.controls["level"].value ?? "");
  }

  /** What the role picked may do (the table under it). */
  get levelActions(): string[] {
    return this.role?.actions ?? [];
  }

  get canSubmit(): boolean {
    return this.form.valid && scopeChoiceComplete(this.scope) && !this.saving && (this.creating || this.dirty);
  }

  get nameError(): string | null {
    return nameErrorOf(this.form.controls["name"], "There's a group with this name already.");
  }

  /** What the role allows (under it). */
  get levelHint(): string {
    return this.role?.description ?? "";
  }

  setScope(choice: AccessScopeChoice): void {
    const c = this.form.controls["scope"];
    c.setValue(choice);
    c.markAsDirty();
  }

  /** A list picker's picks (the tag picker isn't a form control). */
  setList(control: "dashboardIds", ids: string[]): void {
    const c = this.form.controls[control];
    c.setValue(ids);
    c.markAsDirty();
  }

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
    const v = this.form.getRawValue();
    this.submitted.emit({
      name: String(v.name).trim(),
      description: String(v.description ?? "").trim(),
      scope: { ...this.scope.scope, siteIds: [...this.scope.scope.siteIds] },
      level: v.level as AccessLevel,
      dashboardIds: [...v.dashboardIds],
    });
  }

  private reset(): void {
    const g = this.value;
    this.form.reset(
      {
        name: g?.name ?? "",
        description: g?.description ?? "",
        // An older plant scope: its plant's product line and market filled in.
        scope: scopeChoiceOf(g ? completeScope(g.scope, this.sites, this.productLines) : null),
        level: g?.level ?? this.roles[0]?.id ?? "viewer",
        dashboardIds: [...(g?.dashboardIds ?? [])],
      },
      { emitEvent: false }
    );
    // A default group's name and description are its scope's (made with the item, renamed with it): not edited here.
    for (const key of ["name", "description"]) {
      const c = this.form.controls[key];
      if (g?.auto) {
        c.disable({ emitEvent: false });
      } else {
        c.enable({ emitEvent: false });
      }
    }
    this.form.markAsPristine();
    this.baseline = JSON.stringify(this.form.getRawValue());
    this.cd.markForCheck();
  }
}
