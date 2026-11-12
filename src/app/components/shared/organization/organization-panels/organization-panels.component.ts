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
import { EntityDetailPanelComponent } from "../../entity-detail-panel/entity-detail-panel.component";
import { DeleteCardComponent } from "../../manage-card/manage-card.component";
import { ConfirmDialogComponent } from "../../confirm-dialog/confirm-dialog.component";
import type { DataTableColumn } from "../../data-table/data-table.component";
import { DetailTableComponent } from "../../detail-table/detail-table.component";
import { PanelTabComponent } from "../../panel-tab/panel-tab.component";
import { AssetFormComponent } from "../asset-form/asset-form.component";
import { OrganizationHelpComponent } from "../organization-help/organization-help.component";
import type { ItemUser } from "../item-users";
import { OrganizationAccess, OrganizationStore } from "../organization-store";

const NO_ROWS: Record<string, any>[] = [];

/**
 * The Organization's side panel (a product line, market or site to create or
 * edit — an existing one's users on a tab of their own, those whose scope is
 * it; or several sites' links, "Edit (n)") and its delete confirmation,
 * both driven by the {@link OrganizationStore}. Place it in the dashboard root,
 * as every side panel and dialog (they cover the root, and take its theme):
 *
 * ```html
 * <tb-organization-panels [store]="org"></tb-organization-panels>
 * ```
 */
@Component({
  selector: "tb-organization-panels",
  templateUrl: "./organization-panels.component.html",
  styleUrls: ["./organization-panels.component.scss"],
  standalone: true,
  imports: [
    CommonModule,
    EntityDetailPanelComponent,
    DeleteCardComponent,
    ConfirmDialogComponent,
    DetailTableComponent,
    PanelTabComponent,
    AssetFormComponent,
    OrganizationHelpComponent,
  ],
})
export class OrganizationPanelsComponent implements DoCheck {
  @Input() store!: OrganizationStore;
  /** The panel's tab: the item, or its users. */
  tab = "asset";
  /** The Users tab's list: a user's name, over their email and role — grouped by role (the dashboard has Access: their roles are read there). */
  readonly userColumns: DataTableColumn[] = [
    { key: "name", header: "Name" },
    { key: "email", header: "Email" },
    { key: "role", header: "Role", emphasis: "muted" },
  ];
  /** The Groups tab: the access groups reaching the item — its role and its members; grouped by role. */
  readonly groupColumns: DataTableColumn[] = [
    { key: "name", header: "Name" },
    { key: "role", header: "Role", emphasis: "muted" },
    { key: "members", header: "Members" },
  ];
  /** A site's Devices tab: the devices stored at it — grouped by profile. */
  readonly deviceColumns: DataTableColumn[] = [
    { key: "name", header: "Name" },
    { key: "type", header: "Profile", emphasis: "muted" },
  ];
  groupRows: Record<string, any>[] = NO_ROWS;
  /** The item's users by role (in the roles' order), by name within one. */
  userRows: Record<string, any>[] = NO_ROWS;
  /** The open site's devices by profile, by name within one (none until they're read). */
  deviceRows: Record<string, any>[] = NO_ROWS;
  private seen: { groups?: unknown; item?: unknown; sites?: unknown; users?: unknown; accessUsers?: unknown; devices?: unknown } = {};

  /** The tabs' rows, listed again only when what they're made of changes. */
  ngDoCheck(): void {
    const s = this.store;
    if (!s) {
      return;
    }
    const access = s.access;
    const seen = this.seen;
    const item = s.panelOpen && !s.bulk.length ? s.editing : null;
    if (access?.groupsVersion !== seen.groups || item !== seen.item || s.sites !== seen.sites) {
      Object.assign(seen, { groups: access?.groupsVersion, item, sites: s.sites });
      this.groupRows = access && item ? access.groupsOf(s.panelKind, item) : NO_ROWS;
    }
    const users = s.panelUsers;
    if (users !== seen.users || access?.usersVersion !== seen.accessUsers) {
      Object.assign(seen, { users, accessUsers: access?.usersVersion });
      this.userRows = usersByRole(users, access);
    }
    if (s.panelDevices !== seen.devices) {
      seen.devices = s.panelDevices;
      // (A stable sort: by name within a profile, as read.)
      this.deviceRows = [...(s.panelDevices ?? NO_ROWS)].sort((a, b) => compareText(a["type"], b["type"]));
    }
  }
}

/** The users with their roles (none without Access: the list stays as it was), by role in the roles' order — by name within one, as given. */
function usersByRole(users: ItemUser[], access: OrganizationAccess | null): Record<string, any>[] {
  return users
    .map((u) => {
      const role = access?.userRoleOf(u.id);
      return { ...u, role: role?.name ?? "", order: role?.order ?? Number.MAX_SAFE_INTEGER };
    })
    .sort((a, b) => a.order - b.order);
}

function compareText(a: string, b: string): number {
  return (a ?? "").localeCompare(b ?? "", undefined, { numeric: true });
}
