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

import { Component, Input } from "@angular/core";
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";

/**
 * Outlined square icon button for dashboard headers (same look as the theme
 * toggle), with a navy hover tooltip below and an optional red count badge on
 * the icon — e.g. an alarms bell or a sidebar toggle. Clicks bubble from the
 * host, so bind `(click)` directly:
 *
 * ```html
 * <tb-header-icon-button icon="notifications" tooltip="Alarms" [badge]="count"
 *                        (click)="openAlarms()"></tb-header-icon-button>
 * ```
 */
@Component({
  selector: "tb-header-icon-button",
  template: `<span class="hib">
    <button class="hib-btn" type="button" [class.active]="active" [attr.aria-label]="tooltip"
            [attr.aria-pressed]="pressable ? active : null">
      <span class="hib-icon-wrap">
        <mat-icon>{{ icon }}</mat-icon>
        <span *ngIf="badge" class="hib-badge">{{ badge }}</span>
      </span>
    </button>
    <span *ngIf="tooltip" class="hib-tooltip">{{ tooltip }}</span>
  </span>`,
  styleUrls: ["./header-icon-button.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule],
})
export class HeaderIconButtonComponent {
  @Input() icon = "";
  /** Hover tooltip text (also the button's accessible label). */
  @Input() tooltip = "";
  /** Count badge on the icon; hidden when 0 / unset. */
  @Input() badge: number | null = null;
  /** Highlighted (brand) state, e.g. while the panel it opens is shown. */
  @Input() active = false;
  /** Expose {@link active} as `aria-pressed` (for toggle buttons). */
  @Input() pressable = false;
}
