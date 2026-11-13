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
import type { DataTableColumn } from "../../data-table/data-table.component";
import { DetailTableComponent } from "../../detail-table/detail-table.component";
import { AccessGroup, AccessUser, accessUserName } from "../access.models";
import { AccessStore } from "../access-store";

/** The members list: a member's name and role (searched by name or email — the email not shown). */
const MEMBER_COLUMNS: DataTableColumn[] = [
  { key: "name", header: "Name" },
  { key: "role", header: "Role" },
];

/**
 * An access group's Members tab: its users, view only — the panels' list
 * (`tb-detail-table`, as a role's Users), searched by name or email, grouped
 * by role (in the roles' order; a default group's members, all of its role:
 * one list); a row opens that user. A user joins a group from their own form
 * (its access groups) or, a default group, by the role and the plants it
 * picks — a user can be in several default groups.
 */
@Component({
  selector: "tb-access-members",
  template: `<tb-detail-table title="Members" [columns]="columns" [rows]="rows" groupKey="role" [searchKeys]="['name', 'email']" [loading]="store.usersLoading"
    loadingText="Loading users…" emptyText="No members" emptyIcon="person" [clickable]="true" [resetKey]="group?.id"
    (rowClick)="open($event)"></tb-detail-table>`,
  standalone: true,
  imports: [CommonModule, DetailTableComponent],
})
export class AccessMembersComponent implements DoCheck {
  @Input() store!: AccessStore;
  @Input() group!: AccessGroup;

  readonly columns = MEMBER_COLUMNS;
  rows: Record<string, any>[] = [];
  private seen: { users?: AccessUser[]; group?: AccessGroup; roles?: unknown; groups?: unknown } = {};

  /** The rows, rebuilt only when the users, the group or the roles change (a user's role is their level, else their groups'). */
  ngDoCheck(): void {
    const s = this.store;
    if (!s || !this.group || (s.users === this.seen.users && this.group === this.seen.group && s.roles === this.seen.roles && s.groups === this.seen.groups)) {
      return;
    }
    this.seen = { users: s.users, group: this.group, roles: s.roles, groups: s.groups };
    const members = new Set(this.group.members);
    this.rows = s.users
      .filter((u) => members.has(u.id))
      .map((u) => {
        const role = s.userRole(u);
        return { id: u.id, user: u, name: accessUserName(u), email: u.email, role: role.name, order: role.order };
      })
      // By role (the roles' order), by name within one.
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  }

  /** A member's row: that user's panel. */
  open(row: Record<string, any>): void {
    this.store.openUser(row["user"] as AccessUser);
  }
}
