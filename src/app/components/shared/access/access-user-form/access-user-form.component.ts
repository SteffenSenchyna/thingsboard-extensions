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

import { Component, DoCheck, EventEmitter, Input, OnChanges, Output, SimpleChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import { CardComponent } from "../../card/card.component";
import { FormActionsComponent } from "../../form-actions/form-actions.component";
import { SelectComponent, TbSelectOption } from "../../select/select.component";
import type { AccessStartAppOption } from "../access-group-form/access-group-form.component";
import { IconBadgeComponent } from "../../icon-badge/icon-badge.component";
import { SwitchComponent } from "../../switch/switch.component";
import { TagPickerComponent, TagPickerOption } from "../../tag-picker/tag-picker.component";
import { AssetRow } from "../../organization/organization.models";
import {
  AccessGroup,
  AccessLevel,
  AccessRole,
  AccessScope,
  AccessScopeChoice,
  completeScope,
  scopeChoiceComplete,
  scopeChoiceOf,
  scopeWithin,
  AccessHome,
  BUILT_IN_ROLES,
  EVERYTHING,
  TENANT_SCOPE_TYPE,
  roleAppliesTo,
  tenantRoleIcon,
} from "../access.models";
import { AccessScopePickerComponent } from "../access-scope-picker/access-scope-picker.component";
import { AccessLevelActionsComponent } from "../access-level-actions/access-level-actions.component";


/** What the user form hands back on submit. */
export interface AccessUserFormValue {
  email: string;
  firstName: string;
  lastName: string;
  /** The access groups picked (ids). */
  groupIds: string[];
  /** Add only: email the activation (else its link is shown to pass on). */
  sendActivationMail: boolean;
  /** Their scope (server attributes on the user): the groups they can join lie within it. Editing: theirs (null: none yet). */
  scope: AccessScope | null;
  /** Their level (a server attribute): with the scope, the default group they're in. */
  level: AccessLevel;
  /** Edit: the scope or the level was changed (they move to its default group); add: always. */
  accessChanged?: boolean;
  /** Edit: their own "Opens on", over their groups' (null: their groups'). */
  homeOverride?: AccessHome | null;
  /**
   * The Tenant scope: a tenant-level user of ThingsBoard (no scope, level or access groups of the owner's). Edit: picked
   * for one of the owner's users (or left for an owner's scope by a Tenant scope user), they move to the tenant (or back).
   */
  tenant?: boolean;
  /** A Tenant scope user's role: the tenant user group (its id). */
  tenantRole?: string;
}

/** The "Opens on" choices: their groups' (""), Home, a start app (`app:<id>`), a dashboard (its id). */
const OPENS_HOME = "home";
const OPENS_APP = "app:";

/**
 * A user's form (the Users page's panels): `add` — email, name, their scope
 * (`tb-access-scope-picker`) and level — they join the scope's default group
 * of the level — and whether to email the activation, its buttons always
 * shown; `edit` — the same for an existing user (a new scope or level moves
 * them to its default group) and their access groups — only those within the
 * scope — Cancel / Apply showing once something changed, Cancel resetting it. With {@link allowTenant}, the Tenant
 * scope sits above the owner's: its role a tenant user group, its access groups the tenant's others — picked for an
 * existing user (or left by a Tenant scope user), they move between the owner and the tenant. Projected content sits between the
 * name and the access (`[before-access]`: the account) and after the access
 * (the Manage actions). Submit emits {@link submitted}; the access store saves.
 * Bump {@link resetKey} to reset to {@link value}.
 */
@Component({
  selector: "tb-access-user-form",
  templateUrl: "./access-user-form.component.html",
  styleUrls: ["./access-user-form.component.scss"],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, CardComponent, SelectComponent, IconBadgeComponent, SwitchComponent, TagPickerComponent, AccessScopePickerComponent, AccessLevelActionsComponent, FormActionsComponent],
})
export class AccessUserFormComponent implements OnChanges, DoCheck {
  @Input() mode: "add" | "edit" = "add";
  @Input() value: AccessUserFormValue | null = null;
  /** The access groups (the picker offers those within the user's scope). */
  @Input() groups: AccessGroup[] = [];
  @Input() productLines: AssetRow[] = [];
  @Input() markets: AssetRow[] = [];
  @Input() sites: AssetRow[] = [];
  /** Where the picked groups open the user, in words ("Home › QC Lab", a dashboard's title, "Home") — shown under the groups. */
  @Input() homeTitle = "";
  /** Home's apps, each with its Application (the "Opens on" start apps — those of their groups' apps). */
  @Input() startApps: AccessStartAppOption[] = [];
  /** The roles (Access › Roles): the "Role" choices — those applying to the scope picked (a scope item has a default group of them). */
  @Input() roles: AccessRole[] = BUILT_IN_ROLES;
  /** The dashboards (the "Opens on" choices; "None" first, left out). */
  @Input() dashboardOptions: TbSelectOption[] = [];
  /** The tenant's two default user groups: a Tenant scope user's "Role" choices. */
  @Input() tenantRoles: TbSelectOption[] = [];
  /** The tenant's other user groups: a Tenant scope user's access groups (edit — added after, as the owner's users' groups). */
  @Input() tenantGroups: TagPickerOption[] = [];
  /**
   * The Tenant scope is offered beside the owner's (a tenant administrator's view): a new user's; an existing user's, to
   * move them between the owner and the tenant (never the viewer's own). Off: an existing user's scope stays on their side.
   */
  @Input() allowTenant = false;
  @Input() resetKey = 0;
  @Input() saving = false;
  @Output() submitted = new EventEmitter<AccessUserFormValue>();
  @Output() cancelled = new EventEmitter<void>();
  /** The user picked other groups (the panel works out the home they give; until then, {@link value}'s). */
  @Output() groupsChange = new EventEmitter<string[]>();

  form: FormGroup;
  /** The roles applying to the scope picked (and the one picked, if it doesn't), a select's options. */
  levelOptions: TbSelectOption[] = [];
  private levelKey = "";
  private seenRoles?: AccessRole[];
  /** The groups within the scope (the picker's choices). */
  /** The groups they can join — hand-made ones within their scope (a default group follows the scope and level). */
  groupOptions: TagPickerOption[] = [];
  /** Their default groups (the scope and level's): not picked here — kept as they are, the save swaps one when the scope or level changes. */
  private defaultGroupIds: string[] = [];
  /** Edit: "Opens on" — "Group default (…)" (their groups'), Home, their apps inside Home, the dashboards. */
  opensOnOptions: TbSelectOption[] = [];
  private opensOnKey = "";
  private baseline = "";
  /** The scope and level as last reset (edit: whether they changed). */
  private accessBaseline = "";
  private seen: { groups?: AccessGroup[]; sites?: AssetRow[]; markets?: AssetRow[]; productLines?: AssetRow[]; scope?: string } = {};

  constructor(private fb: FormBuilder) {
    this.form = this.fb.group({
      email: ["", [Validators.required, Validators.email]],
      firstName: [""],
      lastName: [""],
      groupIds: [[] as string[]],
      opensOn: [""],
      sendActivationMail: [true],
      scope: [scopeChoiceOf(null)],
      level: ["viewer"],
      tenantRole: [""],
    });
  }

  /** The Tenant scope is picked (a tenant-level user): their role a default tenant user group, their access groups the tenant's others; no "Opens on". */
  get tenantScope(): boolean {
    return this.scope.type === TENANT_SCOPE_TYPE.id;
  }

  /** The scope types the picker offers: the Tenant scope above the owner's when allowed; else a Tenant scope user's own (fixed), or the owner's. */
  get scopeTypes(): "access" | "user" | "tenant" {
    if (this.allowTenant && this.tenantRoles.length) {
      return "user";
    }
    return this.mode === "edit" && this.value?.tenant ? "tenant" : "access";
  }

  /** The tenant user group picked, as its icon. */
  get tenantRoleIcon(): string {
    const label = this.tenantRoles.find((o) => o.value === this.form.controls["tenantRole"].value)?.label ?? "";
    return label ? tenantRoleIcon(label) : "person";
  }

  /** The picker's groups: the hand-made ones within the scope (rebuilt when the groups, the lists or the scope change); then "Opens on"'s choices. */
  ngDoCheck(): void {
    const key = JSON.stringify(this.scope.scope);
    const s = this.seen;
    if (s.groups !== this.groups || s.sites !== this.sites || s.productLines !== this.productLines || s.scope !== key) {
      this.groupOptions = this.groups
        .filter((g) => !g.auto && scopeWithin(g.scope, this.scope.scope, this.sites, this.productLines))
        .map((g) => ({ id: g.id, label: g.name }));
    }
    this.seen = { groups: this.groups, sites: this.sites, markets: this.markets, productLines: this.productLines, scope: key };
    this.buildOpensOn();
    this.buildLevelOptions(key);
  }

  /** The roles applying to the scope (a scope not picked yet: every role) — and the one picked, kept. */
  private buildLevelOptions(scopeKey: string): void {
    const key = `${scopeKey}|${this.level}|${this.roles.map((r) => r.id).join(",")}`;
    if (key === this.levelKey && this.seenRoles === this.roles) {
      return;
    }
    this.levelKey = key;
    this.seenRoles = this.roles;
    const complete = scopeChoiceComplete(this.scope);
    this.levelOptions = this.roles
      .filter((r) => !complete || r.id === this.level || roleAppliesTo(r, this.scope.scope))
      .map((r) => ({ value: r.id, label: r.label }));
  }

  /** The role picked. */
  get role(): AccessRole | undefined {
    return this.roles.find((r) => r.id === this.level);
  }

  /** What the role picked may do (the table under it). */
  get levelActions(): string[] {
    return this.role?.actions ?? [];
  }

  /** What the level picked lets them do (under the level — as the group form's). */
  get levelHint(): string {
    return this.role?.description ?? "";
  }

  /** The level picked, as its icon (before the level's options). */
  get levelIcon(): string {
    return this.role?.icon ?? "person";
  }

  get level(): AccessLevel {
    return this.form.controls["level"].value as AccessLevel;
  }

  get scope(): AccessScopeChoice {
    return this.form.controls["scope"].value as AccessScopeChoice;
  }

  /** Another scope: the picked groups no longer within it drop out — all of them, from the owner's to the Tenant scope or back. */
  setScope(choice: AccessScopeChoice): void {
    const c = this.form.controls["scope"];
    c.setValue(choice);
    c.markAsDirty();
    const tenant = choice.type === TENANT_SCOPE_TYPE.id;
    const picked = this.form.controls["groupIds"].value as string[];
    const kept = picked.filter((id) => {
      if (tenant) {
        return this.tenantGroups.some((o) => o.id === id);
      }
      const g = this.groups.find((x) => x.id === id);
      return !!g && scopeWithin(g.scope, choice.scope, this.sites, this.productLines);
    });
    if (kept.length !== picked.length) {
      this.setGroups(kept);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["resetKey"] || changes["mode"] || (changes["value"] && !this.dirty)) {
      this.reset();
    } else if (changes["tenantRoles"] && !this.form.controls["tenantRole"].value && !this.dirty) {
      // The tenant's groups arrived after the form was set: a new user's role, the least.
      this.reset();
    }
  }

  /** The email's problem once the field's been left: empty, or not an address. */
  get emailError(): string {
    const c = this.form.controls["email"];
    if (!c.touched || c.valid) {
      return "";
    }
    return c.hasError("required") ? "An email address is required." : "Enter a valid email address, like name@company.com.";
  }

  get dirty(): boolean {
    return JSON.stringify(this.form.getRawValue()) !== this.baseline;
  }

  get showActions(): boolean {
    return this.mode === "add" || this.dirty;
  }

  get canSubmit(): boolean {
    const access = this.tenantScope ? !!this.form.controls["tenantRole"].value : scopeChoiceComplete(this.scope);
    return !this.saving && this.form.controls["email"].valid && access && (this.mode === "add" || this.dirty);
  }

  get submitLabel(): string {
    if (this.mode === "add") {
      return this.saving ? "Creating…" : "Create user";
    }
    return this.saving ? "Saving…" : "Apply changes";
  }

  setGroups(ids: string[]): void {
    const c = this.form.controls["groupIds"];
    c.setValue(ids);
    c.markAsDirty();
    // Where they open comes from all their groups — the default ones too.
    this.groupsChange.emit([...ids, ...this.defaultGroupIds]);
  }

  /**
   * "Opens on"'s choices (rebuilt when they change): their groups' (what they
   * give, in words), Home, the Home apps their groups open, the dashboards.
   */
  private buildOpensOn(): void {
    if (!this.form) {
      return;
    }
    const ids = [...(this.form.controls["groupIds"].value as string[]), ...this.defaultGroupIds];
    const mine = this.groups.filter((g) => ids.includes(g.id));
    // Every app: no groups yet, or a hand-made group with none picked (a default group's none is none — its apps are granted).
    const everyApp = !mine.length || mine.some((g) => !g.appIds.length && !g.auto);
    const appIds = new Set(mine.flatMap((g) => g.appIds));
    const starts = this.startApps.filter((a) => !!a.applicationId && (everyApp || appIds.has(a.applicationId)));
    const key = `${this.homeTitle}|${starts.map((a) => a.id).join(",")}|${this.dashboardOptions.length}`;
    if (key === this.opensOnKey) {
      return;
    }
    this.opensOnKey = key;
    this.opensOnOptions = [
      { value: "", label: `Group default (${this.homeTitle || "Home"})` },
      { value: OPENS_HOME, label: "Home" },
      ...starts.map((a) => ({ value: `${OPENS_APP}${a.id}`, label: `Home › ${a.label}` })),
      ...this.dashboardOptions.filter((o) => !!o.value),
    ];
  }

  /** No group at all — none picked and no default one: they can sign in but see nothing (a Tenant scope user's role gives them it). */
  get noGroups(): boolean {
    return !this.tenantScope && !(this.form.controls["groupIds"].value as string[]).length && !this.defaultGroupIds.length;
  }

  /** The access groups offered: a Tenant scope user's, the tenant's other user groups; else the owner's within the scope. */
  get accessGroupOptions(): TagPickerOption[] {
    return this.tenantScope ? this.tenantGroups : this.groupOptions;
  }

  cancel(): void {
    if (this.mode === "add") {
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
      email: String(v.email ?? "").trim(),
      firstName: String(v.firstName ?? "").trim(),
      lastName: String(v.lastName ?? "").trim(),
      // The groups picked, and their default ones (kept).
      groupIds: [...new Set([...v.groupIds, ...this.defaultGroupIds])],
      sendActivationMail: !!v.sendActivationMail,
      scope: { ...this.scope.scope, siteIds: [...this.scope.scope.siteIds] },
      level: this.level,
      accessChanged: this.mode === "add" || this.accessKey() !== this.accessBaseline,
      ...(this.mode === "edit" && !this.tenantScope ? { homeOverride: overrideOf(String(v.opensOn ?? "")) } : {}),
      ...(this.tenantScope ? { tenant: true, tenantRole: String(v.tenantRole ?? "") } : {}),
    });
  }

  private reset(): void {
    const v = this.value;
    // Their groups: the hand-made ones to pick from, the default ones kept aside.
    const ids = v?.groupIds ?? [];
    const isDefault = (id: string) => !!this.groups.find((g) => g.id === id)?.auto;
    this.defaultGroupIds = ids.filter(isDefault);
    this.form.reset(
      {
        email: v?.email ?? "",
        firstName: v?.firstName ?? "",
        lastName: v?.lastName ?? "",
        groupIds: ids.filter((id) => !isDefault(id)),
        opensOn: opensOnOf(v?.homeOverride ?? null),
        sendActivationMail: true,
        // An older plant scope: its plant's product line and market filled in; a Tenant scope user's, the tenant.
        scope: v?.tenant
          ? { type: TENANT_SCOPE_TYPE.id, scope: { ...EVERYTHING, siteIds: [] } }
          : scopeChoiceOf(v?.scope ? completeScope(v.scope, this.sites, this.productLines) : null),
        level: v?.level ?? this.roles[0]?.id ?? "viewer",
        // Their tenant user group — a new one's, the least: a group that isn't the administrators'.
        tenantRole: v?.tenantRole ?? (this.tenantRoles.find((o) => !/admin/i.test(o.label)) ?? this.tenantRoles[0])?.value ?? "",
      },
      { emitEvent: false }
    );
    this.form.markAsPristine();
    this.baseline = JSON.stringify(this.form.getRawValue());
    this.accessBaseline = this.accessKey();
  }

  private accessKey(): string {
    return JSON.stringify({ scope: this.scope.scope, type: this.scope.type, level: this.level, tenantRole: this.form.controls["tenantRole"].value });
  }
}

/** A user's own "Opens on" as the select holds it. */
function opensOnOf(h: AccessHome | null): string {
  if (!h) {
    return "";
  }
  return h.startApp ? `${OPENS_APP}${h.startApp}` : h.dashboardId || OPENS_HOME;
}

/** The select's "Opens on" as a user's own (null: their groups'). */
function overrideOf(v: string): AccessHome | null {
  if (!v) {
    return null;
  }
  if (v === OPENS_HOME) {
    return { dashboardId: "", startApp: "" };
  }
  return v.startsWith(OPENS_APP) ? { dashboardId: "", startApp: v.slice(OPENS_APP.length) } : { dashboardId: v, startApp: "" };
}
