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

import { Component, EventEmitter, HostBinding, Input, OnChanges, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { SeverityBarComponent } from "./severity-bar.component";
import { TipDirective } from "../tip/tip.directive";

/** The severities, mildest first. */
export const SEVERITY_BOXES = [
  { value: "WARNING", label: "Warning" },
  { value: "MINOR", label: "Minor" },
  { value: "MAJOR", label: "Major" },
  { value: "CRITICAL", label: "Critical" },
];

/**
 * The alarm severities as a row of equal boxes, each its segmented bar
 * (`tb-severity-bar`) with its name in a tooltip:
 *
 *  - `mode="one"` (an alarm list's filter): one severity picked
 *    ({@link selected}); a click on it again clears the pick;
 *  - `mode="many"` (a notification's severities): any of them picked
 *    ({@link picked}), each box on or off by itself;
 *  - `readonly` (a table's cell): only shown — the picked ones, in their plain
 *    outline, at their own width on one line (none picked: all of them —
 *    every severity).
 *
 * `levels` narrows the boxes to the severities given (an alarm's own).
 *
 * ```html
 * <tb-severity-boxes [selected]="filter" (selectedChange)="filter = $event"></tb-severity-boxes>
 * <tb-severity-boxes mode="many" [levels]="alarm.severities" [picked]="mine" (pickedChange)="mine = $event"></tb-severity-boxes>
 * <tb-severity-boxes [picked]="row.severities" [readonly]="true"></tb-severity-boxes>
 * ```
 */
@Component({
  selector: "tb-severity-boxes",
  templateUrl: "./severity-boxes.component.html",
  styleUrls: ["./severity-boxes.component.scss"],
  standalone: true,
  imports: [CommonModule, SeverityBarComponent, TipDirective],
})
export class SeverityBoxesComponent implements OnChanges {
  @HostBinding("attr.title") readonly hostTitle: string | null = null;
  /** The severities shown (none given: all four). */
  @Input() levels: readonly string[] | null = null;
  /** `mode="one"`: the severity picked (UPPER_CASE); null: none. */
  @Input() selected: string | null = null;
  /** `mode="many"` / `readonly`: the severities picked. */
  @Input() picked: readonly string[] = [];
  @Input() mode: "one" | "many" = "one";
  /** Only shown (a table's cell): the picked ones as lit marks — none picked: all of them. */
  @Input() @HostBinding("class.svb-readonly") readonly = false;
  @Output() selectedChange = new EventEmitter<string | null>();
  /** `mode="many"`: the severities picked after a click, mildest first. */
  @Output() pickedChange = new EventEmitter<string[]>();

  boxes = SEVERITY_BOXES;

  ngOnChanges(): void {
    const levels = this.levels;
    const offered = levels?.length ? SEVERITY_BOXES.filter((b) => levels.includes(b.value)) : SEVERITY_BOXES;
    // Only shown: the picked ones (none picked means every severity: all of them).
    this.boxes = this.readonly && this.picked.length ? SEVERITY_BOXES.filter((b) => this.picked.includes(b.value)) : offered;
  }

  /** Lit: picked. */
  active(value: string): boolean {
    return this.mode === "many" ? this.picked.includes(value) : value === this.selected;
  }

  pick(value: string): void {
    if (this.mode === "one") {
      this.selectedChange.emit(this.selected === value ? null : value);
    } else {
      const on = !this.picked.includes(value);
      this.pickedChange.emit(SEVERITY_BOXES.map((b) => b.value).filter((v) => (v === value ? on : this.picked.includes(v))));
    }
  }
}
