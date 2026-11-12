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


import { Component, EventEmitter, HostBinding, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { ACCESS_ACTION_ROWS, AccessAction, AccessActionRow } from "../access.models";

type Column = "view" | "edit" | "control";

/** A cell of the table: the role has it, doesn't, or it's no action there. */
type Cell = "on" | "off" | "none";

/**
 * What a role may do — a small table (the user and group forms, under the
 * role; the role form, to set it): devices, assets, dashboards, alarms and
 * the group's members by View / Edit / Control, ticked where the role has
 * it, an empty box where it doesn't, a dash where it isn't an action.
 * `editable` (the role form): each box toggles — an edit or a control takes
 * the view with it, the view off takes them off.
 *
 * ```html
 * <tb-access-level-actions [actions]="role.actions"></tb-access-level-actions>
 * <tb-access-level-actions [editable]="true" [actions]="actions" (actionsChange)="actions = $event"></tb-access-level-actions>
 * ```
 */
@Component({
  selector: "tb-access-level-actions",
  templateUrl: "./access-level-actions.component.html",
  styleUrls: ["./access-level-actions.component.scss"],
  standalone: true,
  imports: [CommonModule, MatIconModule],
})
export class AccessLevelActionsComponent {
  @HostBinding("attr.title") readonly hostTitle: string | null = null;
  /** The role's actions. */
  @Input() actions: AccessAction[] = [];
  /** The boxes toggle (the role form). */
  @Input() @HostBinding("class.ala-editable") editable = false;
  @Output() actionsChange = new EventEmitter<AccessAction[]>();

  readonly rows = ACCESS_ACTION_ROWS;
  readonly columns: { key: Column; label: string }[] = [
    { key: "view", label: "View" },
    { key: "edit", label: "Edit" },
    { key: "control", label: "Control" },
  ];

  cell(row: AccessActionRow, key: Column): Cell {
    const action = row[key];
    return !action ? "none" : this.actions.includes(action) ? "on" : "off";
  }

  /** A box toggled: an edit or a control on takes the view with it; the view off takes the row's others off. */
  toggle(row: AccessActionRow, key: Column): void {
    const action = row[key];
    if (!this.editable || !action) {
      return;
    }
    const next = new Set(this.actions);
    if (next.has(action)) {
      next.delete(action);
      if (key === "view") {
        [row.edit, row.control].forEach((a) => a && next.delete(a));
      }
    } else {
      next.add(action);
      if (key !== "view" && row.view) {
        next.add(row.view);
      }
    }
    this.actionsChange.emit(ACCESS_ACTION_ROWS.flatMap((r) => [r.view, r.edit, r.control]).filter((a): a is string => !!a && next.has(a)));
  }

  trackByKey(_: number, row: AccessActionRow): string {
    return row.key;
  }
}
