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
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";

/**
 * Shared widget/card header: a brand icon badge, a title, and an optional muted
 * sub-label. Right-side actions can be projected via the `widget-header-actions`
 * slot. Styling uses the dashboard's `--c-*` theme tokens (inherited from an
 * ancestor) so it adapts to light/dark, and is shared across all widget headers.
 *
 * ```html
 * <tb-widget-header icon="location_city" title="Sites" subtitle="3 active">
 *   <span widget-header-actions>…buttons…</span>
 * </tb-widget-header>
 * ```
 */
@Component({
  selector: "tb-widget-header",
  templateUrl: "./widget-header.component.html",
  styleUrls: ["./widget-header.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule],
})
export class WidgetHeaderComponent {
  /**
   * Strip the native `title` attribute off the host: `title` is set as an @Input
   * via `title="…"`, but it is also a global HTML attribute, so the browser would
   * otherwise render its own tooltip with that text.
   */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;

  @Input() icon = "table_rows";
  @Input() title = "";
  /** Optional muted sub-label rendered beneath the title. */
  @Input() subtitle?: string;
}
