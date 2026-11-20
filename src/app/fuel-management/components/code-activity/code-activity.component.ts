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

import { Component, EventEmitter, HostBinding, Input, OnChanges, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { BarChartComponent, BarChartSeries } from "../../../components/shared/bar-chart/bar-chart.component";
import { CalloutComponent } from "../../../components/shared/callout/callout.component";
import { CollapsibleCardComponent } from "../../../components/shared/collapsible-card/collapsible-card.component";
import { EventListComponent, EventListItem } from "../../../components/shared/event-list/event-list.component";
import { CHART_PALETTE } from "../../../components/shared/metric-chart-card/metric-chart-card.component";
import { TimeframePickerComponent } from "../../../components/shared/timeframe-picker/timeframe-picker.component";
import { SegmentOption } from "../../../components/shared/segmented-control/segmented-control.component";
import { ChartWindow, CodeActivityRow, CODE_USAGE_TIMEFRAMES, hasFuelingDetails, isFueling } from "../../models/fuel-management.models";

/** The events its Activity card lists: the latest (the rest are the Activity page's, a link away). */
const RECENT_EVENTS = 10;

/**
 * A code panel's Insights tab: its Usage card — the card's own window picker
 * (1W | 1M | 3M: its use is read over it), then its litres a day (a week over
 * 3M) in the shared bar chart — no figures (its facts card has its last use); a note when a pump had more events than are read; then
 * its latest {@link RECENT_EVENTS} events — its dispenses and denials at its
 * places' pumps in the window and its changes (assigned, edited, disabled,
 * …), newest first — as the alarm list's rows (`tb-event-list`, no search):
 * what happened over its mark (its icon in its tone), when, where, its litres
 * and who; at its foot "View full activity" ({@link viewAll}: the Activity
 * page's Pumps, on the code).
 */
@Component({
  selector: "tb-fuel-code-activity",
  templateUrl: "./code-activity.component.html",
  styleUrls: ["./code-activity.component.scss"],
  standalone: true,
  imports: [CommonModule, BarChartComponent, CalloutComponent, CollapsibleCardComponent, EventListComponent, TimeframePickerComponent],
})
export class CodeActivityComponent implements OnChanges {
  /** No native tooltip (a `title` attribute set on it by mistake). */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;
  /** The code (its asset's id): the list's search empties for another. */
  @Input() codeId = "";
  /** Its events: use in {@link timeframe}, its changes whenever; newest first. */
  @Input() events: CodeActivityRow[] = [];
  /** A pump had more events in the window than are read: its oldest are left out. */
  @Input() capped = false;
  /** The usage window ({@link CODE_USAGE_TIMEFRAMES}). */
  @Input() timeframe = "1W";
  @Output() timeframeChange = new EventEmitter<string>();
  /** The window's span and its slots ({@link chartWindow}): its use was read over it, its bars split by it. */
  @Input() window: ChartWindow | null = null;
  @Input() dark = false;
  /** The Activity card's "View full activity": the code's events on the Activity page. */
  @Output() viewAll = new EventEmitter<void>();

  readonly timeframeOptions: SegmentOption[] = CODE_USAGE_TIMEFRAMES.map((t) => ({ id: t.id, label: t.id }));
  /** A row (the latest {@link RECENT_EVENTS}): what happened, then its mark, when, where, the litres and who. */
  items: EventListItem[] = [];
  /** Its litres a slot of the window (none dispensed: no bars, the chart's empty line). */
  categories: string[] = [];
  series: BarChartSeries[] = [];

  ngOnChanges(): void {
    this.items = this.events.slice(0, RECENT_EVENTS).map((e) => ({
      id: e.id,
      title: e.label,
      icon: e.icon,
      tone: e.tone,
      time: e.time,
      // A change's markets by their codes, their names in the bubble; the line's values cut with "…" when it's narrow (the list's).
      parts: [{ text: e.where, tip: e.whereTip }, e.litres ? `${e.litres} L` : "", e.by ? `by ${e.by}` : ""],
      // A dispense's or a stop's details onto more lines when they don't fit, never cut.
      wrap: hasFuelingDetails(e.type),
    }));
    // Its litres from its events as they are: another window's read keeps these bars on show until it's in (the panel's wireframes
    // cover the first). A stop that ended a fueling with litres counts as a dispense (its row is the fueling's only record).
    const dispenses = this.events.filter(isFueling);
    const litres = dispenses.reduce((sum, e) => sum + (e.volume ?? 0), 0);
    const w = this.window;
    this.categories = w?.labels ?? [];
    const perSlot = this.categories.map(() => 0);
    for (const e of dispenses) {
      const slot = w ? w.slotOf(e.ts) : -1;
      if (slot >= 0 && slot < perSlot.length) {
        perSlot[slot] += e.volume ?? 0;
      }
    }
    this.series = litres > 0 ? [{ name: "Fuel dispensed", color: CHART_PALETTE[0], data: perSlot.map((l) => Math.round(l * 10) / 10) }] : [];
  }
}
