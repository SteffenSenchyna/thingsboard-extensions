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

import { ChangeDetectorRef, Component, ElementRef, HostBinding, Input, OnChanges, ViewChild } from "@angular/core";
import { CommonModule } from "@angular/common";
import { chartTooltipCss } from "../chart-tooltip";
import { formatShortDate } from "../time-format";
import { fmtNumber } from "../value-utils";

/** A count at a time (an hour's, a day's …): the heatmap sums them by the viewer's day. */
export interface HeatmapPoint {
  ts: number;
  value: number;
}

/** One day of the grid: its total and its shade (0: none, 1–4: a quarter of the days with any count each). */
interface HeatmapDay {
  key: string;
  at: Date;
  value: number;
  level: number;
  /** In the days shown (the grid's first and last weeks are filled out with blanks). */
  shown: boolean;
  today: boolean;
  /** The tooltip's date ("Tue, Nov 3") and figure ("12 alarms"). */
  figure: string;
  date: string;
}

/** A column of the grid: a week, Sunday to Saturday — the month's name over the week it starts in. */
interface HeatmapWeek {
  month: string;
  days: HeatmapDay[];
}

/** The tooltip's gap above the day it's for, in px. */
const TOOLTIP_GAP = 8;
/** The weeks after the first one in which a month starting leaves no room for the first week's month name. */
const MONTH_LABEL_WEEKS = 3;

/** The weekdays' labels down the grid's side (every other day, as GitHub's). */
const WEEKDAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];

/**
 * A calendar heatmap (GitHub style) of a count per day over the last
 * {@link days} days (a year by default), today included: the period's
 * figures (the total, a day's average, the busiest day, today) over a grid
 * of a column per week and a row per weekday, each day shaded by its total —
 * one hue, light to dark (dark to bright in dark mode), a step per quarter of
 * the days with any count (so one busy day doesn't wash the rest out), an
 * empty day in the track colour — with the charts' tooltip per day
 * (chart-tooltip.ts: its date, a marker in its shade, its count) and a Less / More
 * scale under it. The squares take the grid's share of the width (at most
 * 20px), so a year fits a half-width card. It sums the {@link points} it's
 * given by the viewer's day, so hourly counts can be passed as they are;
 * `null` — no data to read — shows {@link emptyText}. Put it in a card
 * (`tb-collapsible-card`).
 *
 * ```html
 * <tb-calendar-heatmap [points]="alarmsPerHour" unit="alarms" unitOne="alarm" [loading]="loading"></tb-calendar-heatmap>
 * ```
 */
@Component({
  selector: "tb-calendar-heatmap",
  templateUrl: "./calendar-heatmap.component.html",
  styleUrls: ["./calendar-heatmap.component.scss"],
  standalone: true,
  imports: [CommonModule],
})
export class CalendarHeatmapComponent implements OnChanges {
  /** Never let the browser's native tooltip show on the host. */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;

  /** The counts, any number a day (summed by the viewer's day); `null`: nothing to read. */
  @Input() points: HeatmapPoint[] | null = [];
  /** The days shown, ending today. */
  @Input() days = 365;
  /** What is counted, plural ("alarms") — and one of it ("alarm"). */
  @Input() unit = "";
  @Input() unitOne = "";
  @Input() loading = false;
  /** Shown instead of the figures when there's nothing to read (`points` null). */
  @Input() emptyText = "No data";
  /** Active theme — the tooltip's colours follow it (the charts' tooltip). */
  @Input() dark = false;

  @ViewChild("tooltip") private tooltipEl?: ElementRef<HTMLElement>;
  /** The day hovered (its tooltip shown), where the tooltip sits in the host, and its look (the charts' tooltip). */
  hovered: HeatmapDay | null = null;
  tooltipX = 0;
  tooltipY = 0;
  tooltipStyle: Record<string, string> = {};

  constructor(
    private host: ElementRef<HTMLElement>,
    private cd: ChangeDetectorRef
  ) {}

  readonly weekdayLabels = WEEKDAY_LABELS;
  readonly levels = [0, 1, 2, 3, 4];
  weeks: HeatmapWeek[] = [];
  /** The period's figures: its total, a day's average, the busiest day (and its date), today. */
  total = "—";
  average = "—";
  busiest = "—";
  busiestDate = "";
  today = "—";
  /** The total's label: the period ("Last year", "Last 30 days"). */
  period = "";
  /** For a screen reader: the period's total and its busiest day. */
  ariaLabel = "";

  get empty(): boolean {
    return !this.loading && this.points === null;
  }

  ngOnChanges(): void {
    this.build();
  }

  private build(): void {
    const today = startOfDay(new Date());
    const first = addDays(today, -(Math.max(1, this.days) - 1));
    // Each day's total, by the viewer's day.
    const totals = new Map<string, number>();
    const from = first.getTime();
    for (const p of this.points ?? []) {
      if (p.ts >= from && Number.isFinite(p.value)) {
        const key = dayKey(new Date(p.ts));
        totals.set(key, (totals.get(key) ?? 0) + p.value);
      }
    }
    const counting = !this.loading && this.points !== null;
    // The grid: from the Sunday of the first day's week to the Saturday of today's.
    const shown: { date: Date; value: number }[] = [];
    const weeks: HeatmapWeek[] = [];
    for (let d = addDays(first, -first.getDay()); d <= addDays(today, 6 - today.getDay()); d = addDays(d, 1)) {
      if (d.getDay() === 0) {
        weeks.push({ month: "", days: [] });
      }
      const inPeriod = d >= first && d <= today;
      const value = inPeriod ? (totals.get(dayKey(d)) ?? 0) : 0;
      if (inPeriod) {
        shown.push({ date: d, value });
      }
      weeks[weeks.length - 1].days.push({
        key: dayKey(d),
        at: d,
        value,
        level: 0,
        shown: inPeriod,
        today: d.getTime() === today.getTime(),
        figure: counting ? this.figure(value) : "…",
        date: `${d.toLocaleDateString("en-US", { weekday: "short" })}, ${formatShortDate(d)}`,
      });
    }
    // A month's name over the week its 1st falls in — and over the first week, unless a month starts in the next few (no room for both).
    const monthName = (d: Date) => d.toLocaleDateString("en-US", { month: "short" });
    const firstOfMonth = (w: HeatmapWeek) => w.days.find((day) => day.shown && day.at.getDate() === 1);
    const roomForFirst = !weeks.slice(1, 1 + MONTH_LABEL_WEEKS).some(firstOfMonth);
    weeks.forEach((w, i) => {
      const start = firstOfMonth(w) ?? (i === 0 && roomForFirst ? w.days.find((day) => day.shown) : undefined);
      w.month = start ? monthName(start.at) : "";
    });
    // The shades: a step per quarter of the days with any count — the 25th, 50th and 75th percentiles their bounds.
    const counted = shown.map((s) => s.value).filter((n) => n > 0).sort((a, b) => a - b);
    const percentile = (f: number) => counted[Math.min(counted.length - 1, Math.floor(f * counted.length))];
    const bounds = counted.length ? [percentile(0.25), percentile(0.5), percentile(0.75)] : [];
    for (const w of weeks) {
      for (const day of w.days) {
        day.level = counting && day.shown && day.value > 0 ? 1 + bounds.filter((b) => day.value > b).length : 0;
      }
    }
    this.weeks = weeks;
    // The figures.
    const sum = shown.reduce((t, s) => t + s.value, 0);
    const peak = shown.reduce((best, s) => (s.value > best.value ? s : best), shown[0]);
    const v = (n: number, decimals = 0) => (counting ? fmtNumber(n, decimals) : this.loading ? "…" : "—");
    this.total = v(sum);
    this.average = v(sum / shown.length, sum / shown.length < 10 && sum > 0 ? 1 : 0);
    this.busiest = v(peak?.value ?? 0);
    this.busiestDate = counting && peak && peak.value > 0 ? `${peak.date.toLocaleDateString("en-US", { weekday: "short" })}, ${formatShortDate(peak.date)}` : "";
    this.today = v(totals.get(dayKey(today)) ?? 0);
    this.period = shown.length === 365 ? "Last year" : `Last ${shown.length} days`;
    this.ariaLabel = counting ? `${this.figure(sum)} in the ${this.period.toLowerCase()}${this.busiestDate ? `, the most on ${this.busiestDate}: ${this.busiest}` : ""}` : "";
  }

  /** A day hovered: its tooltip, centred above it — kept inside the host's width. */
  showTooltip(day: HeatmapDay, event: MouseEvent): void {
    if (!day.shown) {
      return;
    }
    this.hovered = day;
    this.tooltipStyle = chartTooltipCss(getComputedStyle(this.host.nativeElement));
    // Drawn first, to be measured.
    this.cd.detectChanges();
    const tooltip = this.tooltipEl?.nativeElement;
    if (!tooltip) {
      return;
    }
    const box = this.host.nativeElement.getBoundingClientRect();
    const cell = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const centre = cell.left - box.left + cell.width / 2;
    this.tooltipX = Math.max(0, Math.min(box.width - tooltip.offsetWidth, centre - tooltip.offsetWidth / 2));
    this.tooltipY = cell.top - box.top - tooltip.offsetHeight - TOOLTIP_GAP;
  }

  hideTooltip(): void {
    this.hovered = null;
  }

  /** A count with what it counts ("12 alarms", "1 alarm"). */
  private figure(n: number): string {
    const unit = n === 1 && this.unitOne ? this.unitOne : this.unit;
    return `${fmtNumber(n)}${unit ? ` ${unit}` : ""}`;
  }

  trackByKey(_: number, d: HeatmapDay): string {
    return d.key;
  }

  trackByIndex(i: number): number {
    return i;
  }
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** A day `n` days from `d` (by the calendar, so a daylight-saving change doesn't shift it). */
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
