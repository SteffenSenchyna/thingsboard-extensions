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

import { Component, DoCheck, Input } from "@angular/core";
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
import { TagPickerOption } from "../../tag-picker/tag-picker.component";
import { formatDateTime } from "../../time-format";
import {
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
import { AccessGroupFormComponent, AccessStartAppOption } from "../access-group-form/access-group-form.component";
import { HOME_START_APPS } from "../../dashboard/home-apps";
import { AccessMembersComponent } from "../access-members/access-members.component";
import { AccessRoleFormComponent } from "../access-role-form/access-role-form.component";
import { AccessUserFormComponent, AccessUserFormValue } from "../access-user-form/access-user-form.component";
import { OrganizationHelpComponent } from "../../organization/organization-help/organization-help.component";

/**
 * The access side panels and dialogs, driven by the {@link AccessStore}: a
 * group's panel (Group | Members), a user's (their details, account and
 * access, the Manage actions), a new user, a role's (Access › Roles), the
 * confirmations and the activation link. Place it in the dashboard root, as every side panel:
 *
 * ```html
 * <tb-access-panels [store]="access"></tb-access-panels>
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
  /** The choices the forms pick from (rebuilt only when their lists change). */
  appOptions: TagPickerOption[] = [];
  /** Home's apps, each with its Application (the group form's start apps). */
  startApps: AccessStartAppOption[] = [];
  /** The groups picked in the open user form, until applied (null: the user's own). */
  pickedGroupIds: string[] | null = null;
  private seen: { apps?: unknown; userKey?: number; role?: unknown; groups?: unknown; users?: unknown } = {};
  /** Access › Health: a check's panel — one tab, its items by name. */
  readonly healthTabs: SegmentOption[] = [{ id: "items", label: "Items", icon: "monitor_heart", tooltip: "Items" }];
  readonly healthItemColumns: DataTableColumn[] = [{ key: "name", header: "Name" }];

  /** A failing item's row: what it is, in its own panel. */
  onHealthItem(row: Record<string, any>): void {
    this.store.openHealthItem(row as AccessHealthItem);
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
  /** A role's user: their name, over their email and their scope in words ("Plant · Richmond Port"). */
  readonly roleUserColumns: DataTableColumn[] = [
    { key: "name", header: "Name" },
    { key: "email", header: "Email" },
    { key: "scope", header: "Scope" },
  ];

  ngDoCheck(): void {
    const s = this.store;
    if (!s) {
      return;
    }
    if (s.apps.applications !== this.seen.apps) {
      this.appOptions = s.apps.applications.map((a) => ({ id: a.id, label: a.label || a.name }));
      this.startApps = HOME_START_APPS.map((h) => ({
        id: h.id,
        label: h.label,
        applicationId: s.apps.applications.find((a) => a.name.toLowerCase() === h.application.toLowerCase())?.id ?? null,
      }));
    }
    if (s.userResetKey !== this.seen.userKey) {
      this.pickedGroupIds = null;
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
    this.seen = { apps: s.apps.applications, userKey: s.userResetKey, role, groups: s.groups, users: s.users };
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

  /** The open user's form values. */
  get userValue(): AccessUserFormValue | null {
    const u = this.user;
    return u
      ? {
          email: u.email,
          firstName: u.firstName,
          lastName: u.lastName,
          groupIds: u.tenant ? this.store.tenantAccessGroupsOf(u) : u.groupIds,
          sendActivationMail: true,
          scope: u.scope,
          level: this.store.userLevel(u),
          homeOverride: u.homeOverride,
          tenant: u.tenant,
          tenantRole: u.tenant ? this.store.tenantRoleOf(u) : undefined,
        }
      : null;
  }

  /** Where the open user's picked groups open them, in words. */
  get userHomeTitle(): string {
    const u = this.user;
    return u ? this.store.homeLabel(this.store.homeOf(u.id, this.pickedGroupIds ?? u.groupIds)) : "";
  }

  userName(u: AccessUser): string {
    return accessUserName(u);
  }

  status(u: AccessUser): { label: string; icon: string; tone: "neutral" | "warning" | "success" } {
    return !u.enabled
      ? { label: "Disabled", icon: "block", tone: "neutral" }
      : !u.activated
        ? { label: "Not activated", icon: "schedule", tone: "warning" }
        : { label: "Active", icon: "check_circle", tone: "success" };
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
