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

import { Component, ElementRef, EventEmitter, HostBinding, Input, Output } from "@angular/core";
import { SegmentedControlComponent, SegmentOption } from "../segmented-control/segmented-control.component";

/** The id the picker reports while a custom date range (from the calendar) is in use. */
export const TB_CUSTOM_TIMEFRAME = "custom";

/** The standard windows: last day / week / month. */
export const TB_TIMEFRAME_OPTIONS: SegmentOption[] = [
  { id: "1D", label: "1D" },
  { id: "1W", label: "1W" },
  { id: "1M", label: "1M" },
];

/**
 * Compact time-window picker ("1D | 1W | 1M"): an outlined box with thin
 * dividers, the selected window's label in brand blue. The one timeframe
 * picker for charts and tables in every dashboard (metrics chart card,
 * activity tables, …).
 *
 * ```html
 * <tb-timeframe-picker [selected]="tf" (selectedChange)="tf = $event"></tb-timeframe-picker>
 * ```
 *
 * `customRange` adds a calendar button as the last segment: clicking it emits
 * {@link customClick} with that button (the anchor for a `tb-date-range-picker`,
 * which opens with its left edge at the icon); set `selected` to {@link TB_CUSTOM_TIMEFRAME} once a
 * range is applied. `fullWidth` stretches the segments across the container.
 */
@Component({
  selector: "tb-timeframe-picker",
  templateUrl: "./timeframe-picker.component.html",
  styleUrls: ["./timeframe-picker.component.scss"],
  standalone: true,
  imports: [SegmentedControlComponent],
})
export class TimeframePickerComponent {
  @Input() options: SegmentOption[] = TB_TIMEFRAME_OPTIONS;
  @Input() selected = "1D";
  /** Add the calendar (custom range) segment. */
  @Input() customRange = false;
  @Input() @HostBinding("class.tbtf-full") fullWidth = false;
  @Output() selectedChange = new EventEmitter<string>();
  /** The calendar segment was clicked — emits that button: open a date-range picker at it. */
  @Output() customClick = new EventEmitter<HTMLElement>();

  constructor(private host: ElementRef<HTMLElement>) {}

  get segments(): SegmentOption[] {
    return this.customRange
      ? [...this.options, { id: TB_CUSTOM_TIMEFRAME, label: "Custom range", icon: "calendar_month" }]
      : this.options;
  }

  onSelect(id: string): void {
    if (id !== TB_CUSTOM_TIMEFRAME) {
      this.selectedChange.emit(id);
    }
  }

  onClick(id: string): void {
    if (id === TB_CUSTOM_TIMEFRAME) {
      // The calendar button itself (the last segment) is the anchor, so the panel
      // opens at the icon rather than at the bar's left edge.
      const buttons = this.host.nativeElement.querySelectorAll<HTMLElement>("button");
      this.customClick.emit(buttons[buttons.length - 1] ?? this.host.nativeElement);
    }
  }
}
