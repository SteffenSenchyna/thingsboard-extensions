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
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule } from "@angular/forms";
import { CardComponent } from "../../card/card.component";
import { FormActionsComponent } from "../../form-actions/form-actions.component";
import { nameErrorOf, nameValidators } from "../../form-utils";
import { SELECT_EMPTY, SelectComponent, TbSelectOption } from "../../select/select.component";
import { IconBadgeComponent } from "../../icon-badge/icon-badge.component";
import { TagPickerComponent, TagPickerOption } from "../../tag-picker/tag-picker.component";
import { AssetRow } from "../../organization/organization.models";
import {
  AccessGroup,
  AccessGroupBulkEdit,
  AccessGroupDraft,
  AccessLevel,
  AccessListEdit,
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

/** A start app among the "Opens on" choices: `app:<its id>` (a dashboard's is its id, Home's ""). */
const START_PREFIX = "app:";
/** Bulk: a choice left as each group has it. */
const KEEP = "keep";


/** A start app the form offers: one of Home's apps, with its Application's id (null: there's none of that name). */
export interface AccessStartAppOption {
  id: string;
  label: string;
  applicationId: string | null;
}


/**
 * An access group's form (its panel's Group tab): its name and description;
 * its scope (`tb-access-scope-picker`: regional, a product line, a market or
 * a plant); and its access — the apps (none: every one), the level, where
 * its members open (Home; one of its apps inside Home — its start app; or a
 * dashboard of its own, for an app Home doesn't open) and its other
 * dashboards. In bulk ("Edit (n)" on several groups) only the access shows,
 * every choice on Keep until changed: the apps and other dashboards added,
 * removed or set, the level (a default group keeps its own), where they open.
 * A default group (a
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
  /** The applications (the apps' choices). */
  @Input() appOptions: TagPickerOption[] = [];
  /** The dashboards (the home's choices; "None" first). */
  @Input() dashboardOptions: TbSelectOption[] = [];
  /** Home's apps (the start app's choices — those of the group's apps). */
  @Input() startApps: AccessStartAppOption[] = [];
  /** Bulk: the groups edited together (none: one group, or a new one). */
  @Input() bulkGroups: AccessGroup[] = [];
  /** The roles (Access › Roles): the "Role" choices, and what a group without apps or an "Opens on" of its own takes from its role. */
  @Input() roles: AccessRole[] = BUILT_IN_ROLES;
  @Input() resetKey = 0;
  @Input() saving = false;
  @Output() submitted = new EventEmitter<AccessGroupDraft>();
  /** Bulk: what changes across {@link bulkGroups}. */
  @Output() bulkSubmitted = new EventEmitter<AccessGroupBulkEdit>();
  @Output() cancelled = new EventEmitter<void>();

  form!: FormGroup;
  /** The roles, a select's options; bulk: dashes (each keeps its own), then the roles. */
  levelOptions: TbSelectOption[] = [];
  bulkLevelOptions: TbSelectOption[] = [];
  /** How a choice left as it is reads ("---------"). */
  readonly emptyChoice = SELECT_EMPTY;
  /** Bulk: each choice left as it is (none picked, dashes) until changed. */
  bulkAppsAdd: string[] = [];
  bulkAppsRemove: string[] = [];
  readonly bulkLevel = new FormControl(KEEP, { nonNullable: true });
  readonly bulkOpensOn = new FormControl(KEEP, { nonNullable: true });
  bulkDashboardsAdd: string[] = [];
  bulkDashboardsRemove: string[] = [];
  /** Bulk "Opens on": "Keep each group's", Home, every start app (each group takes one it opens), then the dashboards. */
  bulkOpensOnOptions: TbSelectOption[] = [];
  /** The dashboards (the Other dashboards picker's choices: the home's, without "None"). */
  dashboardTags: TagPickerOption[] = [];
  /** "Opens on": Home, its apps the group opens ("Home › QC Lab"), then the dashboards. */
  opensOnOptions: TbSelectOption[] = [];
  private baseline = "";
  private seenDashboards?: TbSelectOption[];
  private seenOpensOn = "";
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
      appIds: [[] as string[]],
      level: ["viewer"],
      opensOn: [""],
      dashboardIds: [[] as string[]],
    });
    this.reset();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.form && (changes["resetKey"] || changes["value"] || changes["bulkGroups"])) {
      this.reset();
    }
  }

  ngDoCheck(): void {
    if (this.seenRoles !== this.roles) {
      this.seenRoles = this.roles;
      this.levelOptions = this.roles.map((r) => ({ value: r.id, label: r.label }));
      this.bulkLevelOptions = [{ value: KEEP, label: SELECT_EMPTY }, ...this.levelOptions];
      this.seenOpensOn = "";
    }
    if (this.seenDashboards !== this.dashboardOptions) {
      this.seenDashboards = this.dashboardOptions;
      this.dashboardTags = this.dashboardOptions.filter((o) => !!o.value).map((o) => ({ id: o.value, label: o.label }));
      this.seenOpensOn = "";
    }
    // The start apps follow the group's apps (rebuilt only when they change).
    const starts = this.form ? this.offeredStartApps() : [];
    const roleHome = this.roleHomeLabel;
    const key = `${starts.map((a) => a.id).join(",")}|${this.dashboardOptions.length}|${this.startApps.length}|${roleHome}`;
    if (key !== this.seenOpensOn) {
      this.seenOpensOn = key;
      const dashboards = this.dashboardOptions.filter((o) => !!o.value);
      const startOption = (a: AccessStartAppOption) => ({ value: `${START_PREFIX}${a.id}`, label: `Home › ${a.label}` });
      // None of its own: its role's, when the role sets one ("Home › QC Lab (role)"), else Home.
      this.opensOnOptions = [{ value: "", label: roleHome ? `${roleHome} (role)` : "Home" }, ...starts.map(startOption), ...dashboards];
      this.bulkOpensOnOptions = [
        { value: KEEP, label: SELECT_EMPTY },
        { value: "", label: "Home" },
        ...this.startApps.filter((a) => !!a.applicationId).map(startOption),
        ...dashboards,
      ];
    }
  }

  /** Bulk: several groups edited together. */
  get bulk(): boolean {
    return this.bulkGroups.length > 0;
  }

  /** Bulk: a default group among them — its level is fixed, so the bulk edit offers no level. */
  get bulkHasDefaults(): boolean {
    return this.bulkGroups.some((g) => g.auto);
  }

  /** Bulk: a choice was changed from Keep. */
  get bulkChanged(): boolean {
    return (
      this.bulkAppsAdd.length + this.bulkAppsRemove.length + this.bulkDashboardsAdd.length + this.bulkDashboardsRemove.length > 0 ||
      this.bulkLevel.value !== KEEP ||
      this.bulkOpensOn.value !== KEEP
    );
  }

  /** Under "Opens on": a start app the group no longer opens (its members open on Home) — else none. */
  get opensOnHint(): string {
    const v = String(this.form.controls["opensOn"].value ?? "");
    if (v.startsWith(START_PREFIX) && !this.offeredStartApps().some((a) => `${START_PREFIX}${a.id}` === v)) {
      return "This app isn't one of the group's apps, so members open on Home.";
    }
    return "";
  }

  get creating(): boolean {
    return !this.value;
  }

  get dirty(): boolean {
    return !!this.form && JSON.stringify(this.form.getRawValue()) !== this.baseline;
  }

  get submitLabel(): string {
    if (this.bulk) {
      return this.saving ? "Applying…" : `Apply to ${this.bulkGroups.length} ${this.bulkGroups.length === 1 ? "group" : "groups"}`;
    }
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

  /** The Applications picker with none picked: its role's apps (a group's own, once picked, win), else none / every one. */
  get appsPlaceholder(): string {
    const names = [
      ...(this.role?.appIds ?? []).map((id) => this.appOptions.find((a) => a.id === id)?.label ?? "—"),
      ...(this.role?.runningApps ? ["Apps running in scope"] : []),
    ];
    if (names.length) {
      return `${names.join(", ")} (role)`;
    }
    return this.isDefault ? "None" : "All";
  }

  /** Where the role opens its members ("" none): a group setting none of its own opens there. */
  get roleHomeLabel(): string {
    const r = this.role;
    if (r?.startApp) {
      const app = this.startApps.find((a) => a.id === r.startApp);
      return app ? `Home › ${app.label}` : "";
    }
    return r?.homeDashboardId ? (this.dashboardOptions.find((o) => o.value === r.homeDashboardId)?.label ?? "") : "";
  }

  get canSubmit(): boolean {
    if (this.bulk) {
      return this.bulkChanged && !this.saving;
    }
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
  setList(control: "appIds" | "dashboardIds", ids: string[]): void {
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
    if (this.bulk) {
      if (this.canSubmit) {
        this.bulkSubmitted.emit(this.bulkEdit());
      }
      return;
    }
    if (!this.canSubmit) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.submitted.emit({
      name: String(v.name).trim(),
      description: String(v.description ?? "").trim(),
      scope: { ...this.scope.scope, siteIds: [...this.scope.scope.siteIds] },
      appIds: [...v.appIds],
      level: v.level as AccessLevel,
      ...this.opensOn(String(v.opensOn ?? "")),
      dashboardIds: [...v.dashboardIds],
    });
  }

  /** Bulk: the choices made (each Keep: null). */
  private bulkEdit(): AccessGroupBulkEdit {
    const list = (add: string[], remove: string[]): AccessListEdit => (add.length || remove.length ? { add: [...add], remove: [...remove] } : null);
    const o = this.bulkOpensOn.value;
    return {
      apps: list(this.bulkAppsAdd, this.bulkAppsRemove),
      level: this.bulkLevel.value === KEEP ? null : (this.bulkLevel.value as AccessLevel),
      opensOn:
        o === KEEP
          ? null
          : o.startsWith(START_PREFIX)
            ? { startApp: o.slice(START_PREFIX.length), homeDashboardId: "" }
            : { startApp: "", homeDashboardId: o },
      dashboards: list(this.bulkDashboardsAdd, this.bulkDashboardsRemove),
    };
  }

  /** Home's apps the group opens (every one when it opens every app) — those with an Application. */
  private offeredStartApps(): AccessStartAppOption[] {
    // Its own apps, else its role's.
    const own = this.form.controls["appIds"].value as string[];
    const appIds = own.length ? own : (this.role?.appIds ?? []);
    // None picked: a hand-made group every app; a default group none (its apps are granted).
    return this.startApps.filter((a) => !!a.applicationId && ((!appIds.length && !this.isDefault) || appIds.includes(a.applicationId)));
  }

  /** The picked "Opens on": a start app (one the group still opens) or a dashboard. */
  private opensOn(v: string): Pick<AccessGroupDraft, "startApp" | "homeDashboardId"> {
    if (v.startsWith(START_PREFIX)) {
      const id = v.slice(START_PREFIX.length);
      return { startApp: this.offeredStartApps().some((a) => a.id === id) ? id : "", homeDashboardId: "" };
    }
    return { startApp: "", homeDashboardId: v };
  }

  private reset(): void {
    this.bulkAppsAdd = [];
    this.bulkAppsRemove = [];
    this.bulkDashboardsAdd = [];
    this.bulkDashboardsRemove = [];
    this.bulkLevel.reset(KEEP, { emitEvent: false });
    this.bulkOpensOn.reset(KEEP, { emitEvent: false });
    const g = this.value;
    this.form.reset(
      {
        name: g?.name ?? "",
        description: g?.description ?? "",
        // An older plant scope: its plant's product line and market filled in.
        scope: scopeChoiceOf(g ? completeScope(g.scope, this.sites, this.productLines) : null),
        appIds: [...(g?.appIds ?? [])],
        level: g?.level ?? this.roles[0]?.id ?? "viewer",
        opensOn: g?.startApp ? `${START_PREFIX}${g.startApp}` : (g?.homeDashboardId ?? ""),
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
