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

import { Component, ElementRef, EventEmitter, HostListener, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";

/** An option in the {@link TimeframeSelectorComponent} dropdown. */
export interface TimeframeOption {
  id: string;
  label: string;
  icon: string;
}

/**
 * Calendar pill that opens a TTS-style dropdown of time-frame options. Reflects
 * {@link selected} and emits {@link selectedChange}; the host owns the meaning of
 * the options and any data reload.
 */
@Component({
  selector: "tb-timeframe-selector",
  templateUrl: "./timeframe-selector.component.html",
  styleUrls: ["./timeframe-selector.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule],
})
export class TimeframeSelectorComponent {
  @Input() options: TimeframeOption[] = [];
  @Input() selected = "";
  @Output() selectedChange = new EventEmitter<string>();

  panelOpen = false;

  constructor(private readonly host: ElementRef<HTMLElement>) {}

  get selectedOption(): TimeframeOption | undefined {
    return this.options.find((o) => o.id === this.selected);
  }

  get label(): string {
    return this.selectedOption?.label ?? "";
  }

  get icon(): string {
    return this.selectedOption?.icon ?? "calendar_today";
  }

  toggle(): void {
    this.panelOpen = !this.panelOpen;
  }

  select(id: string): void {
    this.panelOpen = false;
    if (id !== this.selected) {
      this.selectedChange.emit(id);
    }
  }

  @HostListener("document:click", ["$event"])
  onDocumentClick(event: MouseEvent): void {
    if (this.panelOpen && !this.host.nativeElement.contains(event.target as Node)) {
      this.panelOpen = false;
    }
  }
}
