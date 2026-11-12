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
import { SharedModule } from "@shared/public-api";

/**
 * A count with its icon, as the tables show a row's alarms or errors: red
 * (the status scale's error) while there are any, muted at zero. With
 * `alert` off it is a plain, always-muted count (a site's devices).
 */
@Component({
  selector: "tb-count-mark",
  standalone: true,
  imports: [SharedModule],
  template: `<mat-icon>{{ icon }}</mat-icon>{{ count ?? 0 }}`,
  styleUrls: ["./count-mark.component.scss"],
})
export class CountMarkComponent {
  /** The count; none yet (null) reads as 0. */
  @Input() count: number | null | undefined = 0;
  /** Material icon before the count. */
  @Input() icon = "warning";
  /** Turns red while the count is above zero. */
  @Input() alert = true;

  @HostBinding("class.cm-muted")
  get muted(): boolean {
    return !this.alert || !this.count;
  }
}
