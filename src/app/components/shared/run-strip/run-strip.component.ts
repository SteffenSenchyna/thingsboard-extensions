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


import { ChangeDetectionStrategy, Component, HostBinding, Input } from "@angular/core";
import { CommonModule } from "@angular/common";
import { TipDirective } from "../tip/tip.directive";

/**
 * A stretch of a {@link RunStripComponent}: its share of the strip (0–1), what it was — on (online: the status scale's green), off
 * (offline: the Offline pill's grey) or none (not known yet, or still to come: the meter track) — and its bubble ("Online · Nov 5,
 * 2:10 PM – 6:45 PM").
 */
export interface RunSegment {
  share: number;
  state: "on" | "off" | "none";
  tip: string;
}

/**
 * A thing's states over a window as one thin bar — a pump's online and offline runs over a report's window: each stretch as wide as
 * its share of the window, in its state's colour, its times in the dashboards' bubble. Fits a table cell.
 *
 * ```html
 * <tb-run-strip [segments]="row.runs"></tb-run-strip>
 * ```
 */
@Component({
  selector: "tb-run-strip",
  template: `<span *ngFor="let s of segments" class="rs-seg" [ngClass]="'rs-' + s.state" [style.flex-grow]="s.share" [tbTip]="s.tip"></span>`,
  styleUrls: ["./run-strip.component.scss"],
  standalone: true,
  imports: [CommonModule, TipDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RunStripComponent {
  @Input() segments: RunSegment[] = [];

  @HostBinding("attr.title") readonly hostTitle: string | null = null;
}
