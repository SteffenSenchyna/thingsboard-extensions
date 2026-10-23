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

/** Colour family of a {@link StatusPillComponent}. */
/** success / warning / major / error = the shared status scale (green / yellow / orange / red). */
export type StatusPillTone = "success" | "warning" | "major" | "error" | "neutral" | "brand";

/**
 * Bordered status pill — optional leading icon plus projected label, tinted by
 * {@link tone} from the `--c-*` status tokens so it adapts to light/dark:
 *
 * ```html
 * <tb-status-pill tone="success" icon="wifi">Online</tb-status-pill>
 * <tb-status-pill tone="brand" variant="tag">P01</tb-status-pill>
 * ```
 *
 * `variant="tag"` renders a squarer, icon-less chip for short identifiers.
 */
@Component({
  selector: "tb-status-pill",
  template: `<span class="tbsp" [ngClass]="['tbsp--' + tone, 'tbsp--' + variant, 'tbsp--' + size]" [class.tbsp--text-only]="!icon">
    <mat-icon *ngIf="icon && variant === 'pill'">{{ icon }}</mat-icon><ng-content></ng-content>
  </span>`,
  styleUrls: ["./status-pill.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule],
})
export class StatusPillComponent {
  @Input() tone: StatusPillTone = "neutral";
  /** Material icon shown before the label (pill variant only). */
  @Input() icon = "";
  @Input() variant: "pill" | "tag" = "pill";
  /** `sm` for dense table rows, `md` for headers. */
  @Input() size: "sm" | "md" = "sm";
}
