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
import { SharedModule } from "@shared/public-api";

/**
 * A round on / off toggle: an icon in a ring, on the dashboard's background —
 * neutral while off, the brand accent (ring and icon) while on; hovered and
 * focused as a radio button. A notification's channels (the bell: Google
 * Chat; the envelope: email). `readonly`: the same mark, only shown — a
 * table's cell saying what is on (a click on it is its row's).
 *
 * ```html
 * <tb-round-toggle icon="mail" label="Email" [on]="row.email" (toggled)="row.email = $event"></tb-round-toggle>
 * <tb-round-toggle icon="mail" label="Email" [on]="row.email" [readonly]="true"></tb-round-toggle>
 * ```
 */
@Component({
  selector: "tb-round-toggle",
  template: `<button *ngIf="!readonly; else mark" type="button" class="rt" [class.on]="on" [attr.aria-label]="label" [attr.aria-pressed]="on" (click)="toggled.emit(!on)">
      <mat-icon>{{ icon }}</mat-icon>
    </button>
    <ng-template #mark>
      <span class="rt rt-mark" [class.on]="on" role="img" [attr.aria-label]="label + (on ? ': on' : ': off')"><mat-icon>{{ icon }}</mat-icon></span>
    </ng-template>`,
  styleUrls: ["./round-toggle.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule],
})
export class RoundToggleComponent {
  @HostBinding("attr.title") readonly hostTitle: string | null = null;
  /** Its icon (Material). */
  @Input() icon = "";
  /** What it turns on, for assistive tech ("Email"). */
  @Input() label = "";
  @Input() on = false;
  /** Only shown, not pressed (a table's cell). */
  @Input() readonly = false;
  /** Pressed: the state it should take. */
  @Output() toggled = new EventEmitter<boolean>();
}
