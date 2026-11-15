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

/** A severity's place on the scale: warning (and anything else) 1 … critical 4 — its bar's filled segments. */
export function severityRank(severity: string | null | undefined): number {
  switch ((severity || "").toUpperCase()) {
    case "CRITICAL":
      return 4;
    case "MAJOR":
      return 3;
    case "MINOR":
      return 2;
    default:
      return 1;
  }
}

/**
 * An alarm severity as a segmented bar: 1–4 filled segments in the severity's
 * colour of the status scale's ramp (critical → error, major → major, minor →
 * minor, warning → warning: yellow to red) — an alarm's row, a severity's box
 * (`tb-severity-boxes`).
 *
 * ```html
 * <tb-severity-bar [severity]="alarm.severity"></tb-severity-bar>
 * ```
 */
@Component({
  selector: "tb-severity-bar",
  template: `<span class="seg" [class.on]="rank >= 1"></span><span class="seg" [class.on]="rank >= 2"></span><span class="seg" [class.on]="rank >= 3"></span
    ><span class="seg" [class.on]="rank >= 4"></span>`,
  styleUrls: ["./severity-bar.component.scss"],
  standalone: true,
})
export class SeverityBarComponent {
  @HostBinding("attr.title") readonly hostTitle: string | null = null;
  /** ThingsBoard's severity (CRITICAL / MAJOR / MINOR / WARNING / …), any case. */
  @Input() severity: string | null = null;

  get rank(): number {
    return severityRank(this.severity);
  }

  /** The severity as the host's class (its segments' colour). */
  @HostBinding("class") get tone(): string {
    return (this.severity || "").toLowerCase();
  }
}
