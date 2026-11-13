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

import { Component, DestroyRef, DoCheck, EventEmitter, Input, OnChanges, Output, SimpleChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import { CardComponent } from "../../card/card.component";
import { FormActionsComponent } from "../../form-actions/form-actions.component";
import { SelectComponent, TbSelectOption } from "../../select/select.component";
import { IconBadgeComponent } from "../../icon-badge/icon-badge.component";
import { SwitchComponent } from "../../switch/switch.component";
import { TagPickerComponent, TagPickerOption } from "../../tag-picker/tag-picker.component";
import { FilterListComponent, FilterListOption } from "../../filter-list/filter-list.component";
import { AssetRow, siteOptionLabel } from "../../organization/organization.models";
import { AccessGroup, AccessLevel, AccessRole, BUILT_IN_ROLES, TENANT_SCOPE_TYPE, scopeSites, tenantRoleIcon } from "../access.models";
import { AccessLevelActionsComponent } from "../access-level-actions/access-level-actions.component";

/** What the user form hands back on submit. */
export interface AccessUserFormValue {
  email: string;
  firstName: string;
  lastName: string;
  /** The access groups picked (ids) — on submit, with the default groups they're in now. */
  groupIds: string[];
  /** Add only: email the activation (else its link is shown to pass on). */
  sendActivationMail: boolean;
  /** The plants they have access to (ids): with the role, the default groups they're in. Editing: those their default groups give them. */
  plantIds: string[];
  /** Their role (the default groups' level). */
  level: AccessLevel;
  /** Edit: the plants or the role were changed (their default groups follow); add: always. */
  accessChanged?: boolean;
  /**
   * The tenant: a tenant-level user of ThingsBoard (no plants, role or access groups of the owner's). Edit: picked for one
   * of the owner's users (or left for the plants by a tenant-level user), they move to the tenant (or back).
   */
  tenant?: boolean;
  /** A tenant-level user's role: the tenant user group (its id). */
  tenantRole?: string;
}

/** The "Access" choices (a tenant administrator's view): the plants — the owner's — or the tenant. */
const ACCESS_PLANTS = "plants";
const ACCESS_TENANT = "tenant";
const ACCESS_BOTH: TbSelectOption[] = [
  { value: ACCESS_PLANTS, label: "Plants" },
  { value: ACCESS_TENANT, label: TENANT_SCOPE_TYPE.label },
];
const ACCESS_TENANT_ONLY: TbSelectOption[] = [{ value: ACCESS_TENANT, label: TENANT_SCOPE_TYPE.label }];

/** The plant tree's parents (never emitted: the tree picks plant ids only): all of them, a market, the plants with none. */
const ALL_NODE = "all-plants";
const MARKET_NODE = "market:";
const NO_MARKET_NODE = "no-market";

/**
 * A user's form (the Users page's panels): `add` — email, name, their role
 * and the plants they have access to (a tree, market › plant, in
 * `tb-filter-list`), and whether to email the activation, its buttons always
 * shown; `edit` — the same for an existing user, their plants those their
 * default groups give them, and their access groups — hand-made ones within
 * the plants — Cancel / Apply showing once something changed, Cancel
 * resetting it. The role and the plants become default groups
 * (`plantPickScopes`: every plant, the region's; all of a market's, the
 * market's; each other plant, its own); the store makes the missing ones and
 * moves the user into exactly those. With
 * {@link allowTenant}, "Access" sits above: Plants | Tenant — the tenant's
 * role a tenant user group, its access groups the tenant's others; picked
 * for an existing user (or left by a tenant-level user), they move between
 * the owner and the tenant. Projected content sits between the name and the
 * access (`[before-access]`: the account) and after the access (the Manage
 * actions). Submit emits {@link submitted}; the access store saves. Bump
 * {@link resetKey} to reset to {@link value}.
 */
@Component({
  selector: "tb-access-user-form",
  templateUrl: "./access-user-form.component.html",
  styleUrls: ["./access-user-form.component.scss"],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    CardComponent,
    SelectComponent,
    IconBadgeComponent,
    SwitchComponent,
    TagPickerComponent,
    FilterListComponent,
    AccessLevelActionsComponent,
    FormActionsComponent,
  ],
})
export class AccessUserFormComponent implements OnChanges, DoCheck {
  @Input() mode: "add" | "edit" = "add";
  @Input() value: AccessUserFormValue | null = null;
  /** The access groups (the picker offers the hand-made ones within the plants; the default ones name the picks). */
  @Input() groups: AccessGroup[] = [];
  @Input() productLines: AssetRow[] = [];
  @Input() markets: AssetRow[] = [];
  @Input() sites: AssetRow[] = [];
  /** The roles (Access › Roles): the "Role" choices. */
  @Input() roles: AccessRole[] = BUILT_IN_ROLES;
  /** The tenant's two default user groups: a tenant-level user's "Role" choices. */
  @Input() tenantRoles: TbSelectOption[] = [];
  /** The tenant's other user groups: a tenant-level user's access groups (edit — added after, as the owner's users' groups). */
  @Input() tenantGroups: TagPickerOption[] = [];
  /**
   * The tenant is offered beside the plants (a tenant administrator's view): a new user's; an existing user's, to move
   * them between the owner and the tenant (never the viewer's own). Off: an existing user stays on their side.
   */
  @Input() allowTenant = false;
  @Input() resetKey = 0;
  @Input() saving = false;
  @Output() submitted = new EventEmitter<AccessUserFormValue>();
  @Output() cancelled = new EventEmitter<void>();

  form: FormGroup;
  /** Every role (and the one picked, if it's been removed), a select's options. */
  levelOptions: TbSelectOption[] = [];
  private levelKey = "";
  private seenRoles?: AccessRole[];
  /** The plants as a tree: "All plants" › each market (by its name) › its plants ("Richmond Lab (4R20) · RMX"); "No market" last. */
  plantOptions: FilterListOption[] = [];
  /** The groups they can join — hand-made ones within their plants (the default ones follow the plants and the role). */
  groupOptions: TagPickerOption[] = [];
  /** Their default groups now: not picked here — kept as they are unless the plants or the role change (the store swaps them then). */
  private defaultGroupIds: string[] = [];
  private baseline = "";
  /** The plants, the role and the side as last reset (edit: whether they changed). */
  private accessBaseline = "";
  private seen: {
    groups?: AccessGroup[];
    sites?: AssetRow[];
    markets?: AssetRow[];
    productLines?: AssetRow[];
    plants?: string[];
  } = {};

  constructor(
    private fb: FormBuilder,
    private destroyRef: DestroyRef
  ) {
    this.form = this.fb.group({
      email: ["", [Validators.required, Validators.email]],
      firstName: [""],
      lastName: [""],
      groupIds: [[] as string[]],
      sendActivationMail: [true],
      access: [ACCESS_PLANTS],
      plants: [[] as string[]],
      level: ["viewer"],
      tenantRole: [""],
    });
    // Another side: the picked groups not of it drop out.
    this.form.controls["access"].valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.keepGroupsWithin());
  }

  /** The tenant is picked (a tenant-level user): their role a default tenant user group, their access groups the tenant's others. */
  get tenantScope(): boolean {
    return this.form.controls["access"].value === ACCESS_TENANT;
  }

  /** "Access"'s choices: Plants | Tenant when the tenant is offered; a tenant-level user's own (fixed); none — the plants alone, no select. */
  get accessOptions(): TbSelectOption[] {
    if (this.allowTenant && this.tenantRoles.length) {
      return ACCESS_BOTH;
    }
    return this.mode === "edit" && this.value?.tenant ? ACCESS_TENANT_ONLY : [];
  }

  /** "Access"'s pick, as its icon. */
  get accessIcon(): string {
    return this.tenantScope ? TENANT_SCOPE_TYPE.icon : "factory";
  }

  /** The tenant user group picked, as its icon. */
  get tenantRoleIcon(): string {
    const label = this.tenantRoles.find((o) => o.value === this.form.controls["tenantRole"].value)?.label ?? "";
    return label ? tenantRoleIcon(label) : "person";
  }

  /** The plants ticked (ids). */
  get plants(): string[] {
    return this.form.controls["plants"].value as string[];
  }

  /** Under the tree: how many plants are ticked, of all of them ("9 of 32 plants selected"). */
  get plantsText(): string {
    const picked = new Set(this.plants);
    const n = this.sites.filter((s) => picked.has(s.id)).length;
    return `${n} of ${this.sites.length} ${this.sites.length === 1 ? "plant" : "plants"} selected`;
  }

  /**
   * The tree (when the lists change) and the picker's groups — the hand-made ones within the plants (when the groups, the
   * lists or the plants change); then the roles.
   */
  ngDoCheck(): void {
    const s = this.seen;
    const plants = this.plants;
    // "Access" is fixed (one choice): its select shows it, disabled.
    const access = this.form.controls["access"];
    const fixed = this.accessOptions.length < 2;
    if (access.disabled !== fixed) {
      if (fixed) {
        access.disable({ emitEvent: false });
      } else {
        access.enable({ emitEvent: false });
      }
    }
    if (s.sites !== this.sites || s.markets !== this.markets || s.productLines !== this.productLines) {
      this.plantOptions = this.plantTree();
    }
    if (s.groups !== this.groups || s.sites !== this.sites || s.productLines !== this.productLines || s.plants !== plants) {
      this.groupOptions = this.groups.filter((g) => !g.auto && this.withinPlants(g, plants)).map((g) => ({ id: g.id, label: g.name }));
    }
    this.seen = { groups: this.groups, sites: this.sites, markets: this.markets, productLines: this.productLines, plants };
    this.buildLevelOptions();
  }

  /** The plants as a tree: "All plants", the markets under it by name, each market's plants by label — a plant's product line after it. */
  private plantTree(): FilterListOption[] {
    const lineCode = new Map(this.productLines.map((l) => [l.id, l.name]));
    const plant = (s: AssetRow): FilterListOption => {
      const line = s.productLineId ? lineCode.get(s.productLineId) : "";
      return { id: s.id, label: line ? `${siteOptionLabel(s)} · ${line}` : siteOptionLabel(s) };
    };
    const byLabel = (a: FilterListOption, b: FilterListOption) => a.label.localeCompare(b.label, undefined, { numeric: true });
    const known = new Set(this.markets.map((m) => m.id));
    const markets = this.markets
      .map((m): FilterListOption => ({ id: `${MARKET_NODE}${m.id}`, label: m.name, children: this.sites.filter((s) => s.marketId === m.id).map(plant).sort(byLabel) }))
      // (A market with no plants would be a leaf of its own: left out.)
      .filter((m) => !!m.children?.length)
      .sort(byLabel);
    const loose = this.sites
      .filter((s) => !s.marketId || !known.has(s.marketId))
      .map(plant)
      .sort(byLabel);
    const children = [...markets, ...(loose.length ? [{ id: NO_MARKET_NODE, label: "No market", children: loose }] : [])];
    return children.length ? [{ id: ALL_NODE, label: "All plants", children }] : [];
  }

  /** A hand-made group is within the plants: every plant its scope covers is ticked. */
  private withinPlants(g: AccessGroup, plants: string[]): boolean {
    const picked = new Set(plants);
    return scopeSites(g.scope, this.sites, this.productLines).every((s) => picked.has(s.id));
  }

  /** Every role — and the one picked, if it's been removed (by its id). */
  private buildLevelOptions(): void {
    const key = `${this.level}|${this.roles.map((r) => r.id).join(",")}`;
    if (key === this.levelKey && this.seenRoles === this.roles) {
      return;
    }
    this.levelKey = key;
    this.seenRoles = this.roles;
    const removed = !!this.level && !this.roles.some((r) => r.id === this.level);
    this.levelOptions = [...this.roles.map((r) => ({ value: r.id, label: r.label })), ...(removed ? [{ value: this.level, label: this.level }] : [])];
  }

  /** The role picked. */
  get role(): AccessRole | undefined {
    return this.roles.find((r) => r.id === this.level);
  }

  /** What the role picked may do (the table under it). */
  get levelActions(): string[] {
    return this.role?.actions ?? [];
  }

  /** What the role picked lets them do (under the role — as the group form's). */
  get levelHint(): string {
    return this.role?.description ?? "";
  }

  /** The role picked, as its icon (before the role's options). */
  get levelIcon(): string {
    return this.role?.icon ?? "person";
  }

  get level(): AccessLevel {
    return this.form.controls["level"].value as AccessLevel;
  }

  /** Other plants ticked: the picked groups no longer within them drop out. */
  setPlants(ids: string[]): void {
    const c = this.form.controls["plants"];
    c.setValue(ids);
    c.markAsDirty();
    this.keepGroupsWithin();
  }

  /** The picked groups that still fit — on the tenant, the tenant's; else the hand-made ones within the plants. */
  private keepGroupsWithin(): void {
    const tenant = this.tenantScope;
    const picked = this.form.controls["groupIds"].value as string[];
    const kept = picked.filter((id) => {
      if (tenant) {
        return this.tenantGroups.some((o) => o.id === id);
      }
      const g = this.groups.find((x) => x.id === id);
      return !!g && !g.auto && this.withinPlants(g, this.plants);
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

  /** The plants, the role or the side changed since the last reset (add: from the start). */
  get accessChanged(): boolean {
    return this.accessKey() !== this.accessBaseline;
  }

  get showActions(): boolean {
    return this.mode === "add" || this.dirty;
  }

  /** A plant is ticked — or, editing, the access is as it was (a user with none keeps their details editable); the tenant: a role. */
  get canSubmit(): boolean {
    const access = this.tenantScope ? !!this.form.controls["tenantRole"].value : this.plants.length > 0 || (this.mode === "edit" && !this.accessChanged);
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
  }

  /** No group at all — none picked and no default one coming: they can sign in but see nothing (a tenant-level user's role gives them it). */
  get noGroups(): boolean {
    const defaults = this.accessChanged ? this.plants.length : this.defaultGroupIds.length;
    return !this.tenantScope && !(this.form.controls["groupIds"].value as string[]).length && !defaults;
  }

  /** The access groups offered: a tenant-level user's, the tenant's other user groups; else the owner's within the plants. */
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
      // The groups picked, and their default ones (kept unless the access changed).
      groupIds: [...new Set([...v.groupIds, ...this.defaultGroupIds])],
      sendActivationMail: !!v.sendActivationMail,
      plantIds: [...this.plants],
      level: this.level,
      accessChanged: this.mode === "add" || this.accessChanged,
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
        sendActivationMail: true,
        access: v?.tenant ? ACCESS_TENANT : ACCESS_PLANTS,
        plants: [...(v?.plantIds ?? [])],
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
    const c = this.form.controls;
    return JSON.stringify({ plants: [...this.plants].sort(), access: c["access"].value, level: this.level, tenantRole: c["tenantRole"].value });
  }
}
