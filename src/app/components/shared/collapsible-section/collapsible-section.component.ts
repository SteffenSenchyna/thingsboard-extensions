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

import { Component, EventEmitter, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";
import { FoldComponent } from "../fold/fold.component";

/**
 * A section inside a card that folds under its heading — one of a card's
 * repeated parts (a station's pumps, a device's channels): the heading row
 * (the whole row toggles, a chevron at its end), and the fields projected
 * under it in a `tb-fold` (a field stack that folds with the collapsible
 * cards' motion, stays mounted so a form keeps its edits, and stops clipping
 * once open so a select's dropdown can open past it). Separate sections with
 * `form.tb-section-divider`.
 *
 * ```html
 * <tb-collapsible-section heading="Pump 1" [open]="false">
 *   <div class="xx-field">…</div>
 * </tb-collapsible-section>
 * ```
 */
@Component({
  selector: "tb-collapsible-section",
  templateUrl: "./collapsible-section.component.html",
  styleUrls: ["./collapsible-section.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, FoldComponent],
})
export class CollapsibleSectionComponent {
  @Input() heading = "";
  /** Expanded (two-way bindable); folded shows only the heading. */
  @Input() open = true;
  @Output() openChange = new EventEmitter<boolean>();

  toggle(): void {
    this.open = !this.open;
    this.openChange.emit(this.open);
  }
}
