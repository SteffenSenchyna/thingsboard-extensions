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
import { MatIconModule } from "@angular/material/icon";

/**
 * An icon on a rounded tile — the brand icon on the light brand fill (a
 * neutral one in dark mode): a detail panel's header ("md", 40px) and the
 * lines of a panel's details ("sm", 32px: a group's scope, its level).
 *
 * ```html
 * <tb-icon-badge icon="storefront" size="sm"></tb-icon-badge>
 * ```
 */
@Component({
  selector: "tb-icon-badge",
  template: `<mat-icon>{{ icon }}</mat-icon>`,
  styleUrls: ["./icon-badge.component.scss"],
  standalone: true,
  imports: [MatIconModule],
})
export class IconBadgeComponent {
  /** No native tooltip from a reflected `title`. */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;
  /** A Material Symbols icon name. */
  @Input() icon = "";
  @Input() size: "sm" | "md" = "md";

  @HostBinding("class.ib-sm") get small(): boolean {
    return this.size === "sm";
  }
}
