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
import { CollapsibleCardComponent } from "../collapsible-card/collapsible-card.component";
import { InfoIconComponent } from "../info-icon/info-icon.component";

/** One of a {@link ManageCardComponent}'s actions: its label (the content), a click's {@link action}. */
@Component({
  selector: "tb-manage-action",
  templateUrl: "./manage-action.component.html",
  styleUrls: ["./manage-action.component.scss"],
  standalone: true,
  imports: [CommonModule, InfoIconComponent],
})
export class ManageActionComponent {
  /** No native tooltip (a `title` attribute set on it by mistake). */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;
  /** A destructive action (a delete): in red. */
  @Input() danger = false;
  @Input() disabled = false;
  /** It's running: its {@link busyLabel} ("Activating") with animated dots in its place, the link off. */
  @Input() busy = false;
  @Input() busyLabel = "";
  /** What it does, in the info icon at the row's end (none: no icon). */
  @Input() info = "";
  @Output() action = new EventEmitter<void>();
}

/**
 * A Settings detail panel's "Manage" card (as UniFi's): titled "Manage" (no
 * folding), its actions a row each — a text link (an info icon at the row's
 * end, when it needs one) — the destructive one last, in red. The panel's
 * form projects it under its last card, above its Save / Cancel. Every
 * Settings panel has one (an Organization item, an application, an access
 * group: "Delete"; a user: their account's actions).
 *
 * ```html
 * <tb-manage-card>
 *   <tb-manage-action [danger]="true" (action)="askDelete()">Delete</tb-manage-action>
 * </tb-manage-card>
 * ```
 */
@Component({
  selector: "tb-manage-card",
  template: `<tb-collapsible-card title="Manage" [collapsible]="false"><div class="tbmc-rows"><ng-content></ng-content></div></tb-collapsible-card>`,
  styleUrls: ["./manage-card.component.scss"],
  standalone: true,
  imports: [CollapsibleCardComponent],
})
export class ManageCardComponent {}

/**
 * A detail panel's Manage card with the one action most have: "Delete"
 * (confirmed by the panel's dialog).
 *
 * ```html
 * <tb-delete-card [disabled]="store.saving" (delete)="store.askDelete(item)"></tb-delete-card>
 * ```
 */
@Component({
  selector: "tb-delete-card",
  template: `<tb-manage-card><tb-manage-action [danger]="true" [disabled]="disabled" (action)="delete.emit()">Delete</tb-manage-action></tb-manage-card>`,
  styles: [":host { display: block; }"],
  standalone: true,
  imports: [ManageCardComponent, ManageActionComponent],
})
export class DeleteCardComponent {
  @Input() disabled = false;
  @Output() delete = new EventEmitter<void>();
}
