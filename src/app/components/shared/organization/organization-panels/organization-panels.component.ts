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
  /**
   * A device picked on a site's Devices tab (its id, name, profile and owner, and the site's code): the dashboard opens its Details
   * panel in place — Home's `tb-entity-panel`, the trail's next stop, as a user's from the Users tab. Unbound, the rows open nothing.
   */
  @Output() deviceOpen = new EventEmitter<{ id: string; name: string; profile: string; site: string; owner: string }>();

  /** A row of the Devices tab: the device, for the dashboard to open. */
  openDevice(row: Record<string, any>): void {
    this.deviceOpen.emit({
      id: String(row["id"]),
      name: String(row["name"] ?? ""),
      profile: String(row["type"] ?? ""),
      site: this.store.editing?.name ?? "",
      owner: String(row["owner"] ?? ""),
    });
  }
  /** The panel's tab: the item, or its users. */
  tab = "asset";
  /**
   * The Users tab's list: a user's name (their email searched, not shown), where they are (a product line's or a market's users: their own scope, when
   * it isn't the item's — "Landrock") and role — grouped by role (the dashboard has Access: their roles are read there).
   */
  readonly userColumns: DataTableColumn[] = [
    { key: "name", header: "Name" },
    { key: "place", header: "Scope", emphasis: "muted" },
    { key: "role", header: "Role", emphasis: "muted" },
  ];
  /** A site's Devices tab: the devices stored at it — grouped by profile. */
  readonly deviceColumns: DataTableColumn[] = [
    { key: "name", header: "Name" },
    { key: "type", header: "Profile", emphasis: "muted" },
  ];
  /** The item's users by role (in the roles' order), by name within one. */
  userRows: Record<string, any>[] = NO_ROWS;
  /** The open site's devices by profile, by name within one (none until they're read). */
  deviceRows: Record<string, any>[] = NO_ROWS;
  private seen: { users?: unknown; accessUsers?: unknown; devices?: unknown } = {};

  /** The tabs' rows, listed again only when what they're made of changes. */
  ngDoCheck(): void {
    const s = this.store;
    if (!s) {
      return;
    }
    const access = s.access;
    const seen = this.seen;
    const users = s.panelUsers;
    if (users !== seen.users || access?.usersVersion !== seen.accessUsers) {
      Object.assign(seen, { users, accessUsers: access?.usersVersion });
      this.userRows = usersByRole(users, access, (u) => s.userPlace(u));
    }
    if (s.panelDevices !== seen.devices) {
      seen.devices = s.panelDevices;
      // (A stable sort: by name within a profile, as read.)
      this.deviceRows = [...(s.panelDevices ?? NO_ROWS)].sort((a, b) => compareText(a["type"], b["type"]));
    }
  }
}

/** The users with where they are and their roles (none without Access: the list stays as it was), by role in the roles' order — by name within one, as given. */
function usersByRole(users: ItemUser[], access: OrganizationAccess | null, placeOf: (user: ItemUser) => string): Record<string, any>[] {
  return users
    .map((u) => {
      const role = access?.userRoleOf(u.id);
      return { id: u.id, name: u.name || u.email, email: u.email, place: placeOf(u), role: role?.name ?? "", order: role?.order ?? Number.MAX_SAFE_INTEGER };
    })
    .sort((a, b) => a.order - b.order);
}

function compareText(a: string, b: string): number {
  return (a ?? "").localeCompare(b ?? "", undefined, { numeric: true });
}
