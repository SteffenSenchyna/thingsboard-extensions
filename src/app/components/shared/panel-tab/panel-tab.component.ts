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
 * One tab's view in a detail panel (`tb-entity-detail-panel`'s `tab-content`):
 * shown while it's the panel's tab, kept in the DOM while it isn't (hidden),
 * so edits on one tab survive a look at another. It fills the panel's view —
 * its form's buttons at the panel's bottom on a long one — its cards stacked.
 *
 * ```html
 * <tb-entity-detail-panel [tabs]="tabs" (activeTabChange)="tab = $event" …>
 *   <tb-panel-tab tab-content [shown]="tab === 'group'">…</tb-panel-tab>
 *   <tb-panel-tab tab-content [shown]="tab === 'members'">…</tb-panel-tab>
 * </tb-entity-detail-panel>
 * ```
 */
@Component({
  selector: "tb-panel-tab",
  template: `<ng-content></ng-content>`,
  styleUrls: ["./panel-tab.component.scss"],
  standalone: true,
})
export class PanelTabComponent {
  /** It's the panel's tab. */
  @Input() shown = true;

  @HostBinding("hidden") get isHidden(): boolean {
    return !this.shown;
  }
}
