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
import { SwitchComponent } from "../../switch/switch.component";
import { TimeMachineState } from "../time-machine-state";

/**
 * A page's Time Machine switches, under its sidebar's search and window picker and over its filters (as UniFi's view switches, a
 * divider under them): "Time Machine" — the
 * view (`tb-time-machine-view`) in the list's place, never saved — and, while it's on, "Large charts" (two cards a row, their charts
 * taller) and "Alarms on top" (the devices with alarms at the picked time first), both kept in the user's settings. A page's own view
 * switches go after them (projected). Only for a wider screen: a phone's sheet leaves it out (`*ngIf="!phone"`).
 *
 * ```html
 * <tb-time-machine-switches *ngIf="!phone" [machine]="tm" (switched)="onTimeMachine($event)"></tb-time-machine-switches>
 * ```
 */
@Component({
  selector: "tb-time-machine-switches",
  templateUrl: "./time-machine-switches.component.html",
  styleUrls: ["./time-machine-switches.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, SwitchComponent],
})
export class TimeMachineSwitchesComponent {
  @Input() machine!: TimeMachineState;
  /** The "Time Machine" switch flipped (the page ends what the view replaces — a table's Manage). */
  @Output() switched = new EventEmitter<boolean>();

  setOn(on: boolean): void {
    this.machine.setOn(on);
    this.switched.emit(on);
  }
}
