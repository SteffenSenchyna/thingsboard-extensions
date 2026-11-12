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
import { InfoIconComponent } from "../info-icon/info-icon.component";
import { StatusPillComponent, StatusPillTone } from "../status-pill/status-pill.component";

/** One figure of a {@link StatGridComponent}: a label over a value (with its unit), or over a status pill. */
export interface StatItem {
  label: string;
  /** Info-icon tooltip after the label. */
  info?: string;
  /** Preformatted value ("12.4", "4m ago", "3"). */
  value?: string;
  /** Unit after the value, in the muted small type ("kn", "/ 200"). */
  unit?: string;
  /** A status pill in place of the value. */
  pill?: { label: string; icon?: string; tone: StatusPillTone };
  /** A small brand-blue icon button after the value (its label in the tooltip); clicking emits {@link StatGridComponent.actionClick}. */
  action?: StatAction;
}

export interface StatAction {
  /** What {@link StatGridComponent.actionClick} reports. */
  id: string;
  /** Material Symbols icon name. */
  icon: string;
  /** The tooltip / accessible label ("Repush"). */
  label: string;
  disabled?: boolean;
}

/**
 * Key figures in a grid (two columns by default) — a detail panel's position,
 * totals, a station's counts: each a muted label (optional info icon) over a
 * bold value with its unit (and an optional small action button), or over a
 * status pill. One look for every dashboard's figures.
 *
 * ```html
 * <tb-stat-grid [items]="[{ label: 'Speed over ground', value: '8.4', unit: 'kn', info: '…' }]"></tb-stat-grid>
 * ```
 */
@Component({
  selector: "tb-stat-grid",
  templateUrl: "./stat-grid.component.html",
  styleUrls: ["./stat-grid.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, InfoIconComponent, StatusPillComponent],
})
export class StatGridComponent {
  @Input() items: StatItem[] = [];
  @Input() columns = 2;
  /** A figure's action button was clicked: its {@link StatAction.id} and the figure. */
  @Output() actionClick = new EventEmitter<{ id: string; item: StatItem }>();

  trackByLabel(_: number, s: StatItem): string {
    return s.label;
  }
}
