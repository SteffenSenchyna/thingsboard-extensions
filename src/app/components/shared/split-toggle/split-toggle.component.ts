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

/** An option in {@link SplitToggleComponent}. */
export interface SplitToggleOption {
  id: string;
  label: string;
}

/**
 * A bordered bar of equal-width text options split by thin dividers — the
 * selected option's text turns link-blue (no pill). For switching between a few
 * sibling lists (e.g. Users | Vehicles). Reflects {@link selected} and emits
 * {@link selectedChange}.
 */
@Component({
  selector: "tb-split-toggle",
  template: `<div class="tbst" role="radiogroup">
    <ng-container *ngFor="let o of options; let first = first; trackBy: trackById">
      <span *ngIf="!first" class="tbst-divider" aria-hidden="true"></span>
      <button type="button" class="tbst-option" role="radio" [class.active]="o.id === selected"
              [attr.aria-checked]="o.id === selected" (click)="select(o.id)">{{ o.label }}</button>
    </ng-container>
  </div>`,
  styleUrls: ["./split-toggle.component.scss"],
  standalone: true,
  imports: [CommonModule],
})
export class SplitToggleComponent {
  @Input() options: SplitToggleOption[] = [];
  @Input() selected = "";
  @Output() selectedChange = new EventEmitter<string>();

  select(id: string): void {
    if (id !== this.selected) {
      this.selectedChange.emit(id);
    }
  }

  trackById(_: number, o: SplitToggleOption): string {
    return o.id;
  }
}
