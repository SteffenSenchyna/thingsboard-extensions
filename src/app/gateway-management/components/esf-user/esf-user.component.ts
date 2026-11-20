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

import { ChangeDetectorRef, Component, DestroyRef, EventEmitter, HostBinding, Input, OnChanges, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { CheckboxComponent } from "../../../components/shared/checkbox/checkbox.component";
import { CollapsibleCardComponent } from "../../../components/shared/collapsible-card/collapsible-card.component";
import { FilterListComponent, FilterListOption } from "../../../components/shared/filter-list/filter-list.component";
import { FormActionsComponent } from "../../../components/shared/form-actions/form-actions.component";
import { DeleteCardComponent } from "../../../components/shared/manage-card/manage-card.component";
import { SecretBoxComponent } from "../../../components/shared/secret-box/secret-box.component";
import { ToastTone } from "../../../components/shared/toasts/toasts.component";
import { EsfClient, EsfConfirm, EsfIdentity, esfIdentityUpdate, esfSubscribe } from "../../models/esf-api.models";

/** An ESF user opened in the side panel (the Users view's row, or its "Create new"). */
export interface EsfUserOpen {
  client: EsfClient;
  /** The user (null: a new one). */
  identity: EsfIdentity | null;
  /** The permissions the unit defines (the Permissions card's list). */
  permissions: string[];
  /** The users' names (a new one's must differ). */
  names: string[];
  /** Something changed on the unit: the table reads again. */
  changed: () => void;
  /** The panel closed (the row no longer lit). */
  closed: () => void;
}

/** The form's values. */
interface UserDraft {
  name: string;
  passwordAuthEnabled: boolean;
  passwordChangeNeeded: boolean;
  password: string;
  confirm: string;
  permissions: string[];
}

const draftOf = (i: EsfIdentity | null): UserDraft => ({
  name: i?.name ?? "",
  passwordAuthEnabled: i?.passwordAuthEnabled ?? true,
  passwordChangeNeeded: i?.passwordChangeNeeded ?? false,
  password: "",
  confirm: "",
  permissions: [...(i?.permissions ?? [])].sort(),
});

/**
 * An ESF user in the side panel, as ESF's console's Identities page (Identity v2, `rest.identity`): a new one's name, then its
 * Password — password authentication enabled, a password change required at next login, a new password and its confirmation —
 * and its Permissions (the unit's defined ones, ticked as assigned, searchable); "Create" / "Apply changes", and an existing
 * one's Delete (confirmed). A user is created, then given its permissions and password, as ESF does. ESF lets the gateway's user
 * manage only users whose permissions are within its own (7.6.3+): its refusal says so.
 */
@Component({
  selector: "tb-gm-esf-user",
  templateUrl: "./esf-user.component.html",
  styleUrls: ["./esf-user.component.scss"],
  standalone: true,
  imports: [CommonModule, FormsModule, CheckboxComponent, CollapsibleCardComponent, DeleteCardComponent, FilterListComponent, FormActionsComponent, SecretBoxComponent],
})
export class EsfUserComponent implements OnChanges {
  @HostBinding("attr.title") readonly hostTitle: string | null = null;
  @Input() open: EsfUserOpen | null = null;
  @Output() notify = new EventEmitter<{ tone: ToastTone; message: string }>();
  @Output() confirm = new EventEmitter<EsfConfirm>();
  /** Done (created, deleted): the panel closes. */
  @Output() done = new EventEmitter<void>();

  draft: UserDraft = draftOf(null);
  permissionOptions: FilterListOption[] = [];
  saving = false;
  /** "Create" / "Apply changes" was pressed: every check shows. */
  tried = false;
  private initial = "";

  constructor(
    private cd: ChangeDetectorRef,
    private destroyRef: DestroyRef
  ) {}

  ngOnChanges(): void {
    this.draft = draftOf(this.open?.identity ?? null);
    this.initial = JSON.stringify(this.draft);
    this.tried = false;
    const defined = new Set(this.open?.permissions ?? []);
    // The unit's permissions, and any of the user's it doesn't list (so a save never drops one).
    this.draft.permissions.forEach((p) => defined.add(p));
    this.permissionOptions = [...defined].sort().map((p) => ({ id: p, label: p }));
  }

  get isNew(): boolean {
    return !this.open?.identity;
  }

  get dirty(): boolean {
    return JSON.stringify(this.draft) !== this.initial;
  }

  get nameError(): string {
    const name = this.draft.name.trim();
    if (!name) {
      return "Required";
    }
    return (this.open?.names ?? []).some((n) => n.toLowerCase() === name.toLowerCase()) ? "A user of this name exists" : "";
  }

  get confirmError(): string {
    return this.draft.password && this.draft.confirm !== this.draft.password ? "The passwords don't match" : "";
  }

  get invalid(): boolean {
    return (this.isNew && !!this.nameError) || !!this.confirmError;
  }

  setPermissions(ids: string[]): void {
    this.draft.permissions = [...ids].sort();
  }

  reset(): void {
    this.draft = JSON.parse(this.initial);
    this.tried = false;
  }

  /** "Create": the user made, then given its permissions and password — or "Apply changes" to an existing one. */
  submit(): void {
    this.tried = true;
    const open = this.open;
    if (!open || this.invalid || this.saving) {
      return;
    }
    const d = this.draft;
    const name = this.isNew ? d.name.trim() : open.identity!.name;
    const update = () => open.client.call("esfUpdateIdentity", esfIdentityUpdate(name, d.permissions, d.passwordAuthEnabled, d.passwordChangeNeeded, d.password));
    const failed = (reason: string) => {
      this.saving = false;
      this.notify.emit({ tone: "error", message: `Couldn't ${this.isNew ? "create" : "save"} ${name}: ${reason}` });
      this.cd.markForCheck();
    };
    const saved = () => {
      this.saving = false;
      this.notify.emit({ tone: "success", message: "Settings applied" });
      open.changed();
      if (this.isNew) {
        this.done.emit();
      } else {
        this.initial = JSON.stringify({ ...d, password: "", confirm: "" });
        this.draft = JSON.parse(this.initial);
        this.cd.markForCheck();
      }
    };
    this.saving = true;
    if (this.isNew) {
      esfSubscribe(
        open.client.call("esfCreateIdentity", { name }),
        this.destroyRef,
        () => esfSubscribe(update(), this.destroyRef, saved, (reason) => {
          // Made, but not configured: the table shows it; its settings can be applied again.
          open.changed();
          failed(reason);
        }),
        failed
      );
    } else {
      esfSubscribe(update(), this.destroyRef, saved, failed);
    }
  }

  /** Delete: confirmed first; the user can no longer sign in to the unit. */
  askDelete(): void {
    const open = this.open;
    const name = open?.identity?.name;
    if (!open || !name) {
      return;
    }
    this.confirm.emit({
      heading: "Delete user?",
      message: `${name} will be deleted from the unit and can no longer sign in to it.`,
      confirmLabel: "Delete",
      danger: true,
      run: () => {
        this.saving = true;
        esfSubscribe(
          open.client.call("esfDeleteIdentity", { name }),
          this.destroyRef,
          () => {
            this.saving = false;
            this.notify.emit({ tone: "success", message: "Settings applied" });
            open.changed();
            this.done.emit();
          },
          (reason) => {
            this.saving = false;
            this.notify.emit({ tone: "error", message: `Couldn't delete ${name}: ${reason}` });
            this.cd.markForCheck();
          }
        );
      },
    });
  }
}
