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

import { ChangeDetectionStrategy, Component, HostBinding, Input, OnChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { CollapsibleCardComponent } from "../../../components/shared/collapsible-card/collapsible-card.component";
import { DetailBlockComponent, DetailRowComponent } from "../../../components/shared/detail-rows/detail-rows.component";
import { StatusPillComponent, StatusPillTone } from "../../../components/shared/status-pill/status-pill.component";
import { formatWhen, relativeTime } from "../../../components/shared/time-format";
import { fmtNumber } from "../../../components/shared/value-utils";
import { PumpRow, RELEASE_STEPS_UNDER_WAY, pumpEventsStalled } from "../../models/fuel-management.models";
import { FuelUseRow, fuelUseRows } from "../fuel-limits/fuel-limits.models";

/** A pump's state as its block's pill: the worst of what its PLC reports for it. */
interface PumpState {
  label: string;
  tone: StatusPillTone;
  icon: string;
}

/** A value of a block's row: its text, or a pill when it's something to see to. */
interface PumpFact {
  text: string;
  tone: StatusPillTone | null;
}

/** One pump as the card shows it. */
interface PumpView {
  id: string;
  name: string;
  fuelType: string;
  state: PumpState;
  use: FuelUseRow[];
  dispenses: string;
  lastDispense: string;
  overload: PumpFact;
  buffer: PumpFact;
  lastReport: string;
}

const NOT_REPORTED: PumpFact = { text: "—", tone: null };

/**
 * A fuel station's pumps, in its panel's Insights: a block a pump — its name and fuel type, its state as a pill (the worst of an
 * overload trip, a full event buffer, events held at the PLC, a release under way; else OK) — then its facts as label / value rows:
 * its fuel today, this month and this year (against its limits, a pill once near or over), its dispenses and denials today, its
 * last dispense, its overload trip and event buffer (status pills: OK green, tripped or full red), its latest report. Its events
 * held at the PLC show only in its pill (no row of their own).
 * Nothing in it opens anything:
 * the station manages its pumps — their alarms on its Alarms tab (propagated to its PLC), their settings and "Release events" on its
 * Settings tab.
 *
 * ```html
 * <tb-fuel-station-pumps [pumps]="station.pumps"></tb-fuel-station-pumps>
 * ```
 */
@Component({
  selector: "tb-fuel-station-pumps",
  templateUrl: "./station-pumps.component.html",
  styleUrls: ["./station-pumps.component.scss"],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, CollapsibleCardComponent, DetailBlockComponent, DetailRowComponent, StatusPillComponent],
})
export class StationPumpsComponent implements OnChanges {
  /** Never let the browser's native tooltip show on the host. */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;

  /** The station's pumps (as the dashboard reads them: a reload passes a new list). */
  @Input() pumps: readonly PumpRow[] = [];

  views: PumpView[] = [];

  ngOnChanges(): void {
    const now = Date.now();
    this.views = this.pumps.map((p) => this.viewOf(p, now));
  }

  trackId(_: number, view: PumpView): string {
    return view.id;
  }

  trackPeriod(_: number, row: FuelUseRow): string {
    return row.period;
  }

  private viewOf(p: PumpRow, now: number): PumpView {
    const stalled = pumpEventsStalled(p, now);
    const releasing = RELEASE_STEPS_UNDER_WAY.includes(p.releaseStep);
    const gaveUp = p.releaseStep === "gave-up";
    return {
      id: p.pumpId,
      name: p.name,
      fuelType: p.fuelType,
      state: stateOf(p, stalled, releasing, gaveUp),
      use: fuelUseRows(p.use, p.limits),
      dispenses: `${fmtNumber(p.today.dispenses)}${p.today.denied ? ` · ${fmtNumber(p.today.denied)} denied` : ""}`,
      lastDispense: p.lastDispenseTs ? formatWhen(p.lastDispenseTs) : "Never",
      overload: flagFact(p.overloadTrip, "Tripped"),
      buffer: flagFact(p.bufferFull, "Full"),
      lastReport: p.lastReportTs ? `${relativeTime(p.lastReportTs)} · ${formatWhen(p.lastReportTs)}` : "Never",
    };
  }
}

/** A PLC flag of the pump as a status pill: OK (green) while off, `on` (red) while on — never reported: a dash. */
function flagFact(on: boolean | null, onLabel: string): PumpFact {
  if (on === null) {
    return NOT_REPORTED;
  }
  return on ? { text: onLabel, tone: "error" } : { text: "OK", tone: "success" };
}

/** Its pill: an overload trip or a full buffer (the PLC stops it), a release given up, events stalled, a release under way — else OK. */
function stateOf(p: PumpRow, stalled: boolean, releasing: boolean, gaveUp: boolean): PumpState {
  if (p.overloadTrip) {
    return { label: "Overload trip", tone: "error", icon: "bolt" };
  }
  if (p.bufferFull) {
    return { label: "Buffer full", tone: "error", icon: "inventory" };
  }
  if (stalled && gaveUp) {
    return { label: "Events stalled", tone: "error", icon: "hourglass_disabled" };
  }
  if (stalled && releasing) {
    return { label: "Releasing", tone: "warning", icon: "sync" };
  }
  if (stalled) {
    return { label: "Events stalled", tone: "major", icon: "hourglass_top" };
  }
  return { label: "OK", tone: "success", icon: "check_circle" };
}
