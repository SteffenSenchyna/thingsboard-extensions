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

/**
 * Two-pane layout: a fixed-width left sidebar (divided from the content by a
 * rule) and a flexible main area that fills the rest. {@link open} collapses the
 * sidebar so the content takes the full width; the sidebar stays mounted, so its
 * state (search text, scroll) survives a collapse.
 *
 * ```html
 * <tb-sidebar-layout [open]="sidebarOpen">
 *   <div sidebar>…filters…</div>
 *   …main content…
 * </tb-sidebar-layout>
 * ```
 */
@Component({
  selector: "tb-sidebar-layout",
  template: `<aside class="sl-sidebar" [hidden]="!open" [style.flex-basis.px]="width" [style.width.px]="width">
      <ng-content select="[sidebar]"></ng-content>
    </aside>
    <div class="sl-main"><ng-content></ng-content></div>`,
  styleUrls: ["./sidebar-layout.component.scss"],
  standalone: true,
})
export class SidebarLayoutComponent {
  @Input() open = true;
  /** Sidebar width in px (including its right padding). */
  @Input() width = 300;
}
