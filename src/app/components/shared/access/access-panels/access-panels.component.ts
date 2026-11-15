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

import { Component, DoCheck, EventEmitter, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { CardComponent } from "../../card/card.component";
import { ConfirmDialogComponent } from "../../confirm-dialog/confirm-dialog.component";
import { CopyBoxComponent } from "../../copy-box/copy-box.component";
import { EntityDetailPanelComponent } from "../../entity-detail-panel/entity-detail-panel.component";
import { DeleteCardComponent, ManageActionComponent, ManageCardComponent } from "../../manage-card/manage-card.component";
import { PanelTabComponent } from "../../panel-tab/panel-tab.component";
import { PanelTrailComponent } from "../../panel-trail/panel-trail.component";
import type { SegmentOption } from "../../segmented-control/segmented-control.component";
import type { DataTableColumn } from "../../data-table/data-table.component";
import { DetailTableComponent } from "../../detail-table/detail-table.component";
import { StatusPillComponent } from "../../status-pill/status-pill.component";
import { formatDateTime } from "../../time-format";
import {
  AccessHealthDevice,
  AccessHealthItem,
  AccessGroup,
  AccessScopeType,
  AccessUser,
  accessScopeType,
  accessUserName,
  scopeLabel,
  TENANT_SCOPE_TYPE,
  USER_SCOPE_TYPES,
} from "../access.models";
import { AccessStore } from "../access-store";
import { AccessGroupFormComponent } from "../access-group-form/access-group-form.component";
import { AccessMembersComponent } from "../access-members/access-members.component";
import { AccessRoleFormComponent } from "../access-role-form/access-role-form.component";
import { AccessUserFormComponent, AccessUserFormValue } from "../access-user-form/access-user-form.component";
import { OrganizationHelpComponent } from "../../organization/organization-help/organization-help.component";

/**
 * The access side panels and dialogs, driven by the {@link AccessStore}: a
 * group's panel (Group | Members), a user's (their details, account and
 * access, the Manage actions), a new user, a role's (Access › Roles), the
 * confirmations and the activation link. Place it in the dashboard root, as every side panel — with
 * `(deviceOpen)` bound, a device an Access › Health check lists opens in the dashboard's device panel
 * (Home's `tb-entity-panel`, the next stop on the trail):
 *
 * ```html
 * <tb-access-panels [store]="access" (deviceOpen)="openSiteDevice($event)"></tb-access-panels>
 * ```
 */
@Component({
  selector: "tb-access-panels",
  templateUrl: "./access-panels.component.html",
  styleUrls: ["./access-panels.component.scss"],
  standalone: true,
  imports: [
    CommonModule,
    CardComponent,
    ConfirmDialogComponent,
    CopyBoxComponent,
    EntityDetailPanelComponent,
    DeleteCardComponent,
    ManageActionComponent,
    ManageCardComponent,
    PanelTabComponent,
    PanelTrailComponent,
    DetailTableComponent,
    StatusPillComponent,
    AccessGroupFormComponent,
    AccessMembersComponent,
    AccessRoleFormComponent,
    AccessUserFormComponent,
    OrganizationHelpComponent,
  ],
})
export class AccessPanelsComponent implements DoCheck {
  @Input() store!: AccessStore;

  /** The group panel's tab. */
  groupTab = "group";
  /** The open user's form values — rebuilt when the user, their groups, the roles or the plants change (the form resets to them while untouched). */
  userValue: AccessUserFormValue | null = null;
  private seen: { role?: unknown; groups?: unknown; users?: unknown } = {};
  private userSeen: unknown[] = [];
  /**
   * Access › Health: a check's panel — one tab, its items by name, what's wrong with each muted after it, grouped by what they share
   * (`AccessHealthItem.group`: a group's row named by it, its rows leaving it off).
   */
  readonly healthTabs: SegmentOption[] = [{ id: "items", label: "Items", icon: "monitor_heart", tooltip: "Items" }];
  readonly healthItemColumns: DataTableColumn[] = [
    { key: "name", header: "Name" },
    { key: "detail1", header: "" },
    { key: "detail2", header: "" },
    { key: "group", header: "" },
  ];
  /** The open check's items as its list's rows (rebuilt only when its items change). */
  healthRows: Record<string, any>[] = [];
  /** Its rows open what they are (a device's, only with `deviceOpen` bound). */
  healthClickable = false;
  private healthItemsSeen: AccessHealthItem[] | null = null;

  /** A device a check lists, picked: the dashboard opens its Details panel (unbound, its row opens nothing). */
  @Output() deviceOpen = new EventEmitter<AccessHealthDevice>();

  /** A failing item's row: what it is, in its own panel — a device's, the dashboard's. */
  onHealthItem(row: Record<string, any>): void {
    const item = row["item"] as AccessHealthItem;
    if (item.device) {
      if (this.deviceOpen.observed) {
        this.deviceOpen.emit(item.device);
      }
      return;
    }
    this.store.openHealthItem(item);
  }

  /** The role panel's tab: the role, its groups, its users. */
  roleTab = "role";
  /**
   * The open role's groups (the Groups tab) and their members (the Users tab), compact lists — and its details' counts. Every one of the
   * role: both grouped by their scope's type ("Plant (40)" — regional first, a plant's last), in the order given within one.
   */
  roleGroupRows: Record<string, any>[] = [];
  roleUserRows: Record<string, any>[] = [];
  readonly roleGroupColumns: DataTableColumn[] = [
    { key: "name", header: "Name" },
    { key: "scopeType", header: "Scope" },
    { key: "members", header: "Members" },
  ];
  /** A role's user: their name and their scope in words ("Plant · Richmond Port") — their email searched, not shown. */
  readonly roleUserColumns: DataTableColumn[] = [
    { key: "name", header: "Name" },
    { key: "scope", header: "Scope" },
  ];

  ngDoCheck(): void {
    const s = this.store;
    if (!s) {
      return;
    }
    const items = s.healthOpen?.items ?? null;
    if (items !== this.healthItemsSeen) {
      this.healthItemsSeen = items;
      this.healthRows = (items ?? []).map((i) => ({ id: i.id, name: i.name, detail1: i.details?.[0] ?? "", detail2: i.details?.[1] ?? "", group: i.group ?? "", item: i }));
      this.healthClickable = (items ?? []).some((i) => !!i.open || (!!i.device && this.deviceOpen.observed));
    }
    const userKey = [s.editingUser, s.userResetKey, s.groups, s.roles, s.tenantGroups, s.org.sites.rows, s.org.productLines.rows];
    if (userKey.some((k, i) => k !== this.userSeen[i])) {
      this.userSeen = userKey;
      this.userValue = this.buildUserValue();
    }
    const role = s.editingRole;
    if (role !== this.seen.role || s.groups !== this.seen.groups || s.users !== this.seen.users) {
      // The open role's groups — each with its scope in words and its members — and the users in them.
      const names = new Map([...s.org.productLines.rows, ...s.org.markets.rows, ...s.org.sites.rows].map((a) => [a.id, a.label || a.name]));
      const nameOf = (id: string) => names.get(id) ?? "—";
      const groups = role ? s.roleGroups(role) : [];
      this.roleGroupRows = byScopeType(
        groups.map((g) => ({
          id: g.id,
          group: g,
          name: g.name,
          scope: g.scope ? scopeLabel(g.scope, nameOf) : "—",
          ...scopeTypeOf(g.scope ? accessScopeType(g.scope) : null),
          members: g.members.length,
        }))
      );
      const ids = new Set(groups.flatMap((g) => g.members));
      this.roleUserRows = byScopeType(
        s.users
          .filter((u) => ids.has(u.id))
          .map((u) => ({
            id: u.id,
            user: u,
            name: accessUserName(u),
            email: u.email,
            scope: u.tenant ? TENANT_SCOPE_TYPE.label : u.scope ? scopeLabel(u.scope, nameOf) : "",
            ...scopeTypeOf(u.tenant ? "tenant" : u.scope ? accessScopeType(u.scope) : null),
          }))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    }
    this.seen = { role, groups: s.groups, users: s.users };
  }

  /** A row of the role's Groups tab: that group's panel. */
  openRoleGroup(row: Record<string, any>): void {
    this.store.openEditGroup(row["group"] as AccessGroup);
  }

  /** A row of the role's Users tab: that user's panel. */
  openRoleUser(row: Record<string, any>): void {
    this.store.openUser(row["user"] as AccessUser);
  }

  get user(): AccessUser | null {
    return this.store.editingUser;
  }

  /** The open user's form values: their plants those their default groups give them, their role theirs. */
  private buildUserValue(): AccessUserFormValue | null {
    const u = this.user;
    return u
      ? {
          email: u.email,
          firstName: u.firstName,
          lastName: u.lastName,
          groupIds: u.tenant ? this.store.tenantAccessGroupsOf(u) : u.groupIds,
          sendActivationMail: true,
          plantIds: u.tenant ? [] : this.store.userPlants(u),
          level: this.store.userLevel(u),
          tenant: u.tenant,
          tenantRole: u.tenant ? this.store.tenantRoleOf(u) : undefined,
        }
      : null;
  }

  userName(u: AccessUser): string {
    return accessUserName(u);
  }

  status(u: AccessUser): { label: string; icon: string; tone: "neutral" | "warning" | "success" } {
    // Not activated first: ThingsBoard keeps a new account's sign-in off until it's activated (not a disabled one).
    return !u.activated
      ? { label: "Not activated", icon: "schedule", tone: "warning" }
      : !u.enabled
        ? { label: "Disabled", icon: "block", tone: "neutral" }
        : { label: "Activated", icon: "check_circle", tone: "success" };
  }

  when(ts: number | null, none: string): string {
    return ts ? formatDateTime(ts) : none;
  }

  onUserSubmit(v: AccessUserFormValue): void {
    if (this.user) {
      this.store.submitUser(this.user, v);
    }
  }

}

/** A scope's type in words ("Plant") and its place among the types (the tenant, then regional first, a plant's last; none: after them) — a role's lists group by it. */
function scopeTypeOf(type: AccessScopeType | null): { scopeType: string; scopeOrder: number } {
  const at = USER_SCOPE_TYPES.findIndex((t) => t.id === type);
  return at < 0 ? { scopeType: "", scopeOrder: USER_SCOPE_TYPES.length } : { scopeType: USER_SCOPE_TYPES[at].label, scopeOrder: at };
}

/** The rows by their scope's type ({@link scopeTypeOf}), in the order given within one (a stable sort). */
function byScopeType<T extends { scopeOrder: number }>(rows: T[]): T[] {
  return rows.sort((a, b) => a.scopeOrder - b.scopeOrder);
}
