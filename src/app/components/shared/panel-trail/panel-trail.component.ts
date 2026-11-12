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

import { Component, DoCheck, HostBinding, Input } from "@angular/core";
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";
import { PanelStop, PanelTrail } from "./panel-trail";

/**
 * The side panels' trail as a strip on the open panel's left edge (as
 * UniFi's): a tab a panel opened on the way here — its icon, its kind and
 * name in a bubble on hover, a × to drop it — the open one lit. A tab opens
 * its panel again, on the tab it was left on. Shows from the second stop on,
 * while one of the trail's panels is open.
 *
 * Placed once beside the panels it serves (`tb-access-panels` has it: the
 * Organization's, the applications' and the access panels share one trail).
 *
 * ```html
 * <tb-panel-trail [trail]="store.trail"></tb-panel-trail>
 * ```
 */
@Component({
  selector: "tb-panel-trail",
  templateUrl: "./panel-trail.component.html",
  styleUrls: ["./panel-trail.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule],
})
export class PanelTrailComponent implements DoCheck {
  @HostBinding("attr.title") readonly hostTitle: string | null = null;
  @Input() trail?: PanelTrail | null;

  /** The tabs (kept as last shown while the strip fades out). */
  tabs: { stop: PanelStop; label: string }[] = [];
  activeKey: string | null = null;
  shown = false;
  private seen = "";

  /** The tabs from the trail: its stops still there, while one of them is open — built again only when they change. */
  ngDoCheck(): void {
    const trail = this.trail;
    const active = trail?.active ?? null;
    const live =
      trail && active
        ? trail.stops.map((stop) => ({ stop, label: stop.label() })).filter((t): t is { stop: PanelStop; label: string } => t.label !== null)
        : [];
    const signature = `${active?.key ?? ""}\u0001${live.map((t) => `${t.stop.key}\u0000${t.stop.icon}\u0000${t.label}`).join("\u0001")}`;
    if (signature === this.seen) {
      return;
    }
    this.seen = signature;
    this.shown = live.length > 1;
    if (this.shown) {
      this.tabs = live;
      this.activeKey = active?.key ?? null;
    }
  }

  select(stop: PanelStop): void {
    this.trail?.select(stop);
  }

  remove(stop: PanelStop, event: Event): void {
    event.stopPropagation();
    this.trail?.remove(stop);
  }

  byKey(_: number, tab: { stop: PanelStop }): string {
    return tab.stop.key;
  }
}
