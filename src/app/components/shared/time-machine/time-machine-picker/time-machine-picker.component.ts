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
import { TimeframePickerComponent } from "../../timeframe-picker/timeframe-picker.component";
import { TimeMachineState } from "../time-machine-state";

/**
 * A page's Time Machine window, under its sidebar's search while the view is on: the fuel Activity page's picker (`tb-timeframe-picker
 * [fullWidth] [customRange]`, 1D | 3D | 1W | 2W | 1M — `TB_WINDOW_TIMEFRAME_OPTIONS` — or a range from its calendar, the dashboard's
 * `tb-date-picker-host`). The timeline spans it and the cards' charts show it — read afresh, back to live; a range is read as
 * history (the timeline's top its end). Kept in the user's settings (`TimeMachineState`). Hidden while the switch is off.
 *
 * ```html
 * <tb-time-machine-picker *ngIf="!phone" [machine]="tm"></tb-time-machine-picker>
 * ```
 */
@Component({
  selector: "tb-time-machine-picker",
  standalone: true,
  imports: [TimeframePickerComponent],
  template: `<tb-timeframe-picker [options]="machine.timeframeOptions" [selected]="machine.timeframe" [customRange]="true" [fullWidth]="true"
                                 (selectedChange)="machine.setTimeframe($event)" (customClick)="machine.openRange($event)"></tb-timeframe-picker>`,
  styles: [":host { display: block; }"],
})
export class TimeMachinePickerComponent {
  @Input() machine!: TimeMachineState;

  /** Shown with the view (its switch on). */
  @HostBinding("style.display")
  get display(): string | null {
    return this.machine?.on ? null : "none";
  }
}
