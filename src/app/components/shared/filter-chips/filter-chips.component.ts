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

/** A chip in {@link FilterChipsComponent}. */
export interface FilterChipOption {
  id: string;
  label: string;
  /** Optional Material icon before the label. */
  icon?: string;
  /** Optional muted count after the label (e.g. matching rows). */
  count?: number;
}

/**
 * Single-select row of pill filter chips — the selected chip is tinted brand
 * blue. Reflects {@link selected} and emits {@link selectedChange}. Typically
 * projected into a data table's `dt-filter-bar` slot.
 */
@Component({
  selector: "tb-filter-chips",
  template: `<div class="tbfc" role="group">
    <button *ngFor="let o of options; trackBy: trackById" type="button" class="tbfc-chip"
            [class.active]="o.id === selected" [attr.aria-pressed]="o.id === selected" (click)="select(o.id)">
      <mat-icon *ngIf="o.icon">{{ o.icon }}</mat-icon>
      <span>{{ o.label }}</span>
      <span *ngIf="o.count !== undefined && o.count !== null" class="tbfc-count">{{ o.count }}</span>
    </button>
  </div>`,
  styleUrls: ["./filter-chips.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule],
})
export class FilterChipsComponent {
  @Input() options: FilterChipOption[] = [];
  @Input() selected = "";
  @Output() selectedChange = new EventEmitter<string>();

  select(id: string): void {
    if (id !== this.selected) {
      this.selectedChange.emit(id);
    }
  }

  trackById(_: number, o: FilterChipOption): string {
    return o.id;
  }
}
