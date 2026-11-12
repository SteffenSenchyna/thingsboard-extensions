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

import { Component, EventEmitter, HostBinding, Input, OnChanges, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { DialogComponent } from "../../dialog/dialog.component";
import { CollapsibleCardComponent } from "../../collapsible-card/collapsible-card.component";
import { loadDocsDiagramFont } from "../../cdn-loader";
import { AssetKind } from "../organization.models";

/** The tables with a help: the Organization's, the Applications, and Access › Groups, Users and Roles. */
export type OrganizationHelpKind = AssetKind | "application" | "accessGroup" | "user" | "role";

/** Each table's help: its dialog's heading — no subtitle (a kind not here has no help). */
const HELP: Partial<Record<OrganizationHelpKind, string>> = {
  accessGroup: "Access groups",
  role: "Roles",
  user: "Users",
  application: "Applications",
  productLine: "Product lines",
  site: "Sites",
  market: "Markets",
};

/**
 * An Organization table's help (the "?" beside its title): how its items fit
 * in the organization, at an administrator's level — Access › Groups' (an
 * access group's users, role, scope and applications), Users' (a user's own
 * scope and role, their groups, where they start) and Roles' (where a
 * role applies, its actions and defaults, the groups that take it; both
 * placed by `tb-access-panels`, the `AccessStore`'s `help`), the Applications
 * table's (the profiles associated with an application, the sites it's
 * activated at, the access groups it's granted to, the dashboard it
 * represents in Home's menu; placed by `tb-application-panels`, opened
 * by the `ApplicationStore`'s `helpOpen`), the Product lines
 * table's (the sites and sub product lines a product line holds, its sites in
 * any market, and who is scoped to it), the Sites table's (the
 * product lines and markets that group sites, the applications activated at
 * them, the assets, gateways and devices they hold) and the Markets table's
 * (the sites a market holds, from any product line, and who is scoped to
 * it): one of the app's cards, its text beside its drawing in the ThingsBoard
 * docs' look (`diagram.tb-docs-diagram`). A themed dialog over the dashboard
 * root: placed there by `tb-organization-panels`, the table it's for the
 * store's `help`.
 *
 * ```html
 * <tb-organization-help [kind]="store.help" (closed)="store.help = null"></tb-organization-help>
 * ```
 */
@Component({
  selector: "tb-organization-help",
  templateUrl: "./organization-help.component.html",
  styleUrls: ["./organization-help.component.scss"],
  standalone: true,
  imports: [CommonModule, DialogComponent, CollapsibleCardComponent],
})
export class OrganizationHelpComponent implements OnChanges {
  /** Never let the browser's native tooltip show on the host. */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;

  /** The table whose help shows (null: closed). */
  @Input() kind: OrganizationHelpKind | null = null;
  @Output() closed = new EventEmitter<void>();

  get heading(): string {
    return (this.kind && HELP[this.kind]) || "";
  }

  ngOnChanges(): void {
    if (this.kind) {
      loadDocsDiagramFont();
    }
  }
}
