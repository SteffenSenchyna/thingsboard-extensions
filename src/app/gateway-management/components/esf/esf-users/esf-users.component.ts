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

import { ChangeDetectorRef, Component, DestroyRef, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewChild } from "@angular/core";
import { CommonModule } from "@angular/common";
import { CalloutComponent } from "../../../../components/shared/callout/callout.component";
import { DataTableCellDirective, DataTableColumn, DataTableComponent } from "../../../../components/shared/data-table/data-table.component";
import { TableManage } from "../../../../components/shared/data-table/table-manage";
import { StatusPillComponent } from "../../../../components/shared/status-pill/status-pill.component";
import { TableLinksComponent } from "../../../../components/shared/table-links/table-links.component";
import { ToastTone } from "../../../../components/shared/toasts/toasts.component";
import { EsfClient, EsfConfirm, EsfIdentity, esfReason, esfSubscribe, parseEsfIdentities, parseEsfPermissions } from "../../../models/esf-api.models";
import { EsfUserOpen } from "../../esf-user/esf-user.component";

type UserRow = EsfIdentity & { permissionCount: string };

/**
 * The ESF unit's users, as ESF's console's Identities page (Identity v2, `rest.identity`): a row each — its permissions' count,
 * password login, a password change due. A row opens the user in the dashboard's side panel (`userOpen`: its password and
 * permissions, its Delete); "Create new" a new one there; Manage's "Delete (n)" deletes the checked ones (confirmed). ESF lets
 * this user manage only users whose permissions are within its own (7.6.3+).
 */
@Component({
  selector: "tb-gm-esf-users",
  templateUrl: "./esf-users.component.html",
  styleUrls: ["./esf-users.component.scss"],
  standalone: true,
  imports: [CommonModule, CalloutComponent, DataTableComponent, DataTableCellDirective, StatusPillComponent, TableLinksComponent],
})
export class EsfUsersComponent implements OnChanges {
  @Input() client: EsfClient | null = null;
  @Output() notify = new EventEmitter<{ tone: ToastTone; message: string }>();
  @Output() confirm = new EventEmitter<EsfConfirm>();
  /** A user (or "Create new") for the dashboard's side panel. */
  @Output() userOpen = new EventEmitter<EsfUserOpen>();

  @ViewChild("table") table?: DataTableComponent;
  readonly manage = new TableManage(() => this.table, () => this.rows.length);

  readonly columns: DataTableColumn[] = [
    { key: "name", phone: "title", header: "User", emphasis: "strong" },
    { key: "permissionCount", phone: "trail", header: "Permissions", emphasis: "muted", nowrap: true },
    { key: "login", phone: "sub", header: "Password login" },
  ];
  rows: UserRow[] = [];
  permissions: string[] = [];
  loading = false;
  error = "";
  /** The user open in the side panel (lit); "" none. */
  openName = "";
  /** A delete running: its progress. */
  deleting: { done: number; total: number } | null = null;

  constructor(
    private cd: ChangeDetectorRef,
    private destroyRef: DestroyRef
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["client"]) {
      this.openName = "";
      this.load();
    }
  }

  load(): void {
    const client = this.client;
    this.error = "";
    if (!client) {
      return;
    }
    this.loading = true;
    esfSubscribe(
      client.call("esfIdentities"),
      this.destroyRef,
      (reply) => {
        if (client !== this.client) {
          return;
        }
        this.rows = parseEsfIdentities(reply).map((i) => ({ ...i, permissionCount: `${i.permissions.length}` }));
        this.manage.keep(new Set(this.rows.map((r) => r.name)), "name");
        this.loading = false;
        this.cd.markForCheck();
      },
      (reason) => {
        if (client === this.client) {
          this.loading = false;
          this.error = reason;
          this.cd.markForCheck();
        }
      }
    );
    esfSubscribe(
      client.call("esfDefinedPermissions"),
      this.destroyRef,
      (reply) => {
        if (client === this.client) {
          this.permissions = parseEsfPermissions(reply);
          this.cd.markForCheck();
        }
      },
      () => undefined
    );
  }

  /** A row: the user in the side panel. */
  openRow(row: Record<string, any>): void {
    const identity = this.rows.find((r) => r.name === row["name"]);
    if (identity) {
      this.openName = identity.name;
      this.userOpen.emit(this.openFor(identity));
    }
  }

  /** "Create new": a new user in the side panel. */
  openCreate(): void {
    this.manage.end();
    this.openName = "";
    this.userOpen.emit(this.openFor(null));
  }

  /** Manage's "Delete (n)": the checked users, confirmed — deleted one at a time. */
  askDelete(): void {
    const names = this.manage.selected.map((r) => r["name"] as string);
    if (!names.length) {
      return;
    }
    this.confirm.emit({
      heading: `Delete ${names.length === 1 ? names[0] : `${names.length} users`}?`,
      message: `${names.length === 1 ? "The user" : "They"} will be deleted from the unit and can no longer sign in to it.`,
      confirmLabel: "Delete",
      danger: true,
      run: () => this.deleteUsers(names),
    });
  }

  private openFor(identity: EsfIdentity | null): EsfUserOpen {
    return {
      client: this.client!,
      identity,
      permissions: this.permissions,
      names: this.rows.map((r) => r.name),
      changed: () => this.load(),
      closed: () => {
        this.openName = "";
        this.cd.markForCheck();
      },
    };
  }

  private deleteUsers(names: string[]): void {
    const client = this.client;
    if (!client || this.deleting) {
      return;
    }
    this.deleting = { done: 0, total: names.length };
    const next = (i: number) => {
      if (i >= names.length || client !== this.client) {
        this.deleting = null;
        this.manage.end();
        this.notify.emit({ tone: "success", message: "Settings applied" });
        this.load();
        return;
      }
      client.call("esfDeleteIdentity", { name: names[i] }).subscribe({
        next: () => {
          this.deleting = { done: i + 1, total: names.length };
          this.cd.markForCheck();
          next(i + 1);
        },
        error: (err) => {
          this.deleting = null;
          this.notify.emit({ tone: "error", message: `Couldn't delete ${names[i]}: ${esfReason(err)}` });
          this.load();
        },
      });
    };
    next(0);
  }
}
