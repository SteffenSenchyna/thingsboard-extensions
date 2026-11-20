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
import { CommonModule } from "@angular/common";

/** A figure card's tone: its value's colour and its meter's — the status scale's, or (default) the strong text and the chart blue. */
export type FigureCardTone = "default" | "success" | "error";

/**
 * A detail panel's figure card — what the thing is now, at a glance, first on its Insights tab (a sensor's battery, a tank's level,
 * a vessel's position): its title with its value at the right (in its tone; a muted `note` before it — "Main engine"), a meter
 * under them when it has one (`meter`: the value's percentage; null an empty track), anything else projected (a `tb-stat-grid` of
 * figures), then a muted foot line — its `foot` at the start ("Updated 5m ago"), its `footEnd` or a projected `[figure-foot]` (a
 * link) at the end. One look for every panel: never a figure card of a dashboard's own.
 *
 * ```html
 * <tb-figure-card title="Battery" [value]="battery + '%'" [tone]="battery < 20 ? 'error' : 'success'" [meter]="battery"
 *                 [foot]="'Updated ' + ago"></tb-figure-card>
 * <tb-figure-card title="Position" [foot]="'Updated ' + ago">
 *   <tb-stat-grid [items]="position"></tb-stat-grid>
 *   <button figure-foot type="button" (click)="showOnMap()">Show on map</button>
 * </tb-figure-card>
 * ```
 */
@Component({
  selector: "tb-figure-card",
  templateUrl: "./figure-card.component.html",
  styleUrls: ["./figure-card.component.scss"],
  standalone: true,
  imports: [CommonModule],
})
export class FigureCardComponent {
  /** Never let the browser's native tooltip show on the host (`title` is an input). */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;
  @Input() title = "";
  /** Its value at the head's right ("94%"; "": none). */
  @Input() value = "";
  /** A muted note at the head's right, before the value ("Main engine"). */
  @Input() note = "";
  /** Its value's and its meter's colour: the status scale's (success, error) or the default (strong text, the chart blue). */
  @Input() tone: FigureCardTone = "default";
  /** A meter under the head, the value's percentage (0–100); null: an empty track; undefined: no meter. */
  @Input() meter: number | null | undefined = undefined;
  /** The muted foot line's start ("Updated 5m ago"; "": no foot). */
  @Input() foot = "";
  /** The foot line's end ("12 t / 40 t") — or a projected `[figure-foot]` (a link). */
  @Input() footEnd = "";

  get meterWidth(): number {
    return Math.max(0, Math.min(100, Number(this.meter) || 0));
  }
}
