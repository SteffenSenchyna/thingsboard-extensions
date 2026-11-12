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

import { Component, HostBinding, Input } from "@angular/core";

/**
 * A detail panel card's facts as label / value rows (a user's last login, a
 * feedback item's page and browser): the rows a table's text size apart, each
 * a {@link DetailRowComponent}.
 *
 * ```html
 * <tb-card>
 *   <tb-detail-rows>
 *     <tb-detail-row label="Received">{{ when }}</tb-detail-row>
 *     <tb-detail-row label="Status"><tb-button-group …></tb-button-group></tb-detail-row>
 *     <tb-detail-row label="Feedback" [stacked]="true" [divider]="true">{{ text }}</tb-detail-row>
 *   </tb-detail-rows>
 * </tb-card>
 * ```
 */
@Component({
  selector: "tb-detail-rows",
  template: `<ng-content></ng-content>`,
  styleUrls: ["./detail-rows.component.scss"],
  standalone: true,
})
export class DetailRowsComponent {}

/**
 * One fact of a {@link DetailRowsComponent}: its label (muted) at the left, the
 * value (projected — text, a link cut with "…", a control) at the right; or,
 * `stacked`, the label over a value the card's width (a block of text). A
 * `divider` draws a line above it, setting it apart from the rows before;
 * `oneLine` keeps a text value on one line, cut with "…" (an email address).
 */
@Component({
  selector: "tb-detail-row",
  template: `<span class="tbdr-label">{{ label }}</span><span class="tbdr-value"><ng-content></ng-content></span>`,
  styleUrls: ["./detail-row.component.scss"],
  standalone: true,
})
export class DetailRowComponent {
  @Input() label = "";
  @Input() @HostBinding("class.tbdr-stacked") stacked = false;
  @Input() @HostBinding("class.tbdr-divider") divider = false;
  @Input() @HostBinding("class.tbdr-one-line") oneLine = false;
}
