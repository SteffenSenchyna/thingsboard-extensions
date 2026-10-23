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

import { AfterViewChecked, Component, DestroyRef, ElementRef, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewChild, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";
import { injectCss } from "../cdn-loader";
import { SelectComponent, TbSelectOption } from "../select/select.component";

/** A time range in epoch ms. */
export interface TbDateRange {
  start: number;
  end: number;
}

interface CalendarDay {
  date: Date;
  day: number;
  /** After today — events can't be in the future. */
  future: boolean;
  /** Between the range's ends (inclusive) — the end being the hovered day while it's picked. */
  inRange: boolean;
  /** First / last day of a band of more than one day (the band runs from its middle). */
  bandStart: boolean;
  bandEnd: boolean;
  /** A range end: drawn as a filled circle (includes the hovered end-to-be). */
  edge: boolean;
}

interface CalendarMonth {
  title: string;
  /** Leading blanks (null) for the weekday the month starts on, then its days. */
  cells: (CalendarDay | null)[];
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

/**
 * Date-range panel (the custom range behind a `tb-timeframe-picker`'s calendar
 * button): two months side by side — click a start day, then an end day —
 * quick ranges on the right, and the exact start / end (date, hour, minute,
 * AM/PM) with Cancel / Apply below. Future days can't be picked.
 *
 * Place it in the dashboard root (like `tb-ext-confirm-dialog`) so it takes the
 * dashboard's theme and isn't clipped by a scrolling sidebar; it opens under
 * {@link anchor}, kept inside the root. Escape or a click anywhere outside the
 * panel cancels — except on the anchor itself, whose own click toggles it
 * closed (so that click doesn't close and immediately reopen it).
 */
@Component({
  selector: "tb-date-range-picker",
  templateUrl: "./date-range-picker.component.html",
  styleUrls: ["./date-range-picker.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, SelectComponent],
})
export class DateRangePickerComponent implements OnChanges, AfterViewChecked {
  @Input() open = false;
  /** Element the panel opens under, its left edge lined up with the element's (e.g. a calendar button). */
  @Input() anchor: HTMLElement | null = null;
  /** The range in use (the panel starts on it); null → the last 7 days. */
  @Input() range: TbDateRange | null = null;
  @Output() applied = new EventEmitter<TbDateRange>();
  @Output() cancelled = new EventEmitter<void>();

  @ViewChild("panel") private panel?: ElementRef<HTMLElement>;

  readonly weekdays = ["S", "M", "T", "W", "T", "F", "S"];
  readonly presets: { label: string; range: () => TbDateRange }[] = [
    { label: "Last Hour", range: () => ({ start: Date.now() - HOUR, end: Date.now() }) },
    { label: "Today", range: () => ({ start: startOfDay(new Date()).getTime(), end: Date.now() }) },
    { label: "Last 24 Hours", range: () => ({ start: Date.now() - DAY, end: Date.now() }) },
    { label: "Last 7 Days", range: () => ({ start: Date.now() - 7 * DAY, end: Date.now() }) },
    { label: "Last 30 Days", range: () => ({ start: Date.now() - 30 * DAY, end: Date.now() }) },
  ];
  readonly meridiems: TbSelectOption[] = [
    { value: "AM", label: "AM" },
    { value: "PM", label: "PM" },
  ];

  /** The range being edited (end null between the two calendar clicks). */
  start = new Date();
  end: Date | null = new Date();
  /** First day of the left-hand month. */
  view = new Date();
  months: CalendarMonth[] = [];
  /** The day under the pointer — previews the end while it's being picked. */
  private hover: Date | null = null;
  private placed = false;
  /** Time of day the end keeps while a new range is being clicked out. */
  private endClock = new Date();

  constructor() {
    // The start / end fields use Inter (as UniFi's do); loaded once per page.
    injectCss("tb-ext-font-inter", "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap");
    const host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
    // Capture phase so Escape / an outside click reach the panel before the side
    // panels' own handlers.
    const onKey = (e: KeyboardEvent) => {
      if (this.open && e.key === "Escape" && !e.defaultPrevented) {
        e.preventDefault();
        this.cancelled.emit();
      }
    };
    const onDown = (e: Event) => {
      const t = e.target as Node | null;
      if (this.open && t && !host.contains(t) && !this.anchor?.contains(t)) {
        this.cancelled.emit();
      }
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onDown, true);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onDown, true);
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["open"] && this.open) {
      const r = this.range ?? { start: Date.now() - 7 * DAY, end: Date.now() };
      this.start = new Date(r.start);
      this.end = new Date(r.end);
      this.endClock = new Date(r.end);
      this.hover = null;
      this.view = new Date(this.start.getFullYear(), this.start.getMonth(), 1);
      this.buildMonths();
      this.placed = false;
    }
  }

  /**
   * Open under the anchor (left edges aligned), kept inside the dashboard root.
   * Set straight on the element (not through bindings) so it lands on the very
   * first render — the panel stays hidden until it's placed.
   */
  ngAfterViewChecked(): void {
    const panel = this.panel?.nativeElement;
    const root = panel?.offsetParent as HTMLElement | null;
    if (!this.open || this.placed || !panel || !root || !this.anchor) {
      return;
    }
    this.placed = true;
    const a = this.anchor.getBoundingClientRect();
    const r = root.getBoundingClientRect();
    const top = Math.min(a.bottom - r.top + 4, Math.max(8, r.height - panel.offsetHeight - 8));
    const left = Math.min(a.left - r.left, Math.max(8, r.width - panel.offsetWidth - 8));
    panel.style.top = `${Math.max(0, top)}px`;
    panel.style.left = `${Math.max(0, left)}px`;
    panel.style.visibility = "visible";
  }

  // -- calendar -----------------------------------------------------------------

  shift(months: number): void {
    this.view = new Date(this.view.getFullYear(), this.view.getMonth() + months, 1);
    this.buildMonths();
  }

  /** The right-hand month is the current one — nothing later to show. */
  get atLatest(): boolean {
    const now = new Date();
    const right = new Date(this.view.getFullYear(), this.view.getMonth() + 1, 1);
    return right.getFullYear() > now.getFullYear() || (right.getFullYear() === now.getFullYear() && right.getMonth() >= now.getMonth());
  }

  /** First click picks the start day, the second the end day (swapped if earlier). */
  pickDay(d: CalendarDay): void {
    if (d.future) {
      return;
    }
    if (this.end) {
      // Start a new range: this day starts it.
      this.endClock = this.end;
      this.start = withTime(d.date, this.start);
      this.end = null;
    } else if (startOfDay(d.date) < startOfDay(this.start)) {
      // Clicked before the start: the earlier day starts, the first one ends.
      this.end = withTime(this.start, this.endClock);
      this.start = withTime(d.date, this.start);
    } else {
      this.end = withTime(d.date, this.endClock);
    }
    this.buildMonths();
  }

  /** Hovering a day while the end is being picked previews the range to it. */
  hoverDay(d: CalendarDay | null): void {
    const next = d && !d.future ? d.date : null;
    if (next?.getTime() !== this.hover?.getTime()) {
      this.hover = next;
      if (!this.end) {
        this.buildMonths();
      }
    }
  }

  applyPreset(p: { range: () => TbDateRange }): void {
    this.applied.emit(p.range());
  }

  apply(): void {
    if (!this.end) {
      return;
    }
    const a = this.start.getTime();
    const b = this.end.getTime();
    this.applied.emit({ start: Math.min(a, b), end: Math.max(a, b) });
  }

  // -- start / end fields --------------------------------------------------------

  /** A segment's value: month (1–12), day, year, hour (1–12) or minute. */
  segmentValue(d: Date | null, part: Segment): number {
    const v = d ?? this.start;
    switch (part) {
      case "month":
        return v.getMonth() + 1;
      case "day":
        return v.getDate();
      case "year":
        return v.getFullYear();
      case "hour":
        return v.getHours() % 12 || 12;
      case "minute":
        return v.getMinutes();
    }
  }

  /** "09", "15", "2026", "05", "55". */
  segmentText(d: Date | null, part: Segment): string {
    const n = this.segmentValue(d, part);
    return part === "year" ? String(n) : pad(n);
  }

  isPm(d: Date | null): boolean {
    return !!d && d.getHours() >= 12;
  }

  /** A typed segment; anything out of range puts the segment back as it was. */
  setSegment(which: "start" | "end", part: Segment, input: HTMLInputElement): void {
    const n = Math.floor(+input.value);
    const [min, max] = segmentRange(this.dateOf(which), part);
    if (input.value.trim() && n >= min && n <= max) {
      this.setPart(which, part, n);
    }
    // Always rewrite it: "5" for an unchanged 05 wouldn't change the binding.
    input.value = this.segmentText(this.dateOf(which), part);
  }

  /** Arrow keys on a segment step it, keeping it selected. */
  segmentKey(which: "start" | "end", part: Segment, e: KeyboardEvent): void {
    const delta = e.key === "ArrowUp" ? 1 : e.key === "ArrowDown" ? -1 : 0;
    if (!delta) {
      return;
    }
    e.preventDefault();
    this.step(which, part, delta);
    // Write the new value now and keep the segment selected (the binding
    // writes the same text, which leaves the selection alone).
    const input = e.target as HTMLInputElement;
    input.value = this.segmentText(this.dateOf(which), part);
    input.select();
  }

  /** Up / down one, wrapping like a spin button (12 → 1, 59 → 0); the year doesn't wrap. */
  step(which: "start" | "end", part: Segment, delta: number): void {
    const cur = this.segmentValue(this.dateOf(which), part);
    const [min, max] = segmentRange(this.dateOf(which), part);
    const span = max - min + 1;
    const n = part === "year" ? Math.min(max, Math.max(min, cur + delta)) : ((((cur - min + delta) % span) + span) % span) + min;
    this.setPart(which, part, n);
  }

  setMeridiem(which: "start" | "end", pm: boolean): void {
    const d = new Date(this.dateOf(which));
    d.setHours((d.getHours() % 12) + (pm ? 12 : 0));
    this.set(which, d);
  }

  trackByIndex(i: number): number {
    return i;
  }

  /** Set one segment (a month / year change keeps the day inside the month). */
  private setPart(which: "start" | "end", part: Segment, n: number): void {
    const d = new Date(this.dateOf(which));
    switch (part) {
      case "year":
        d.setFullYear(n, d.getMonth(), Math.min(d.getDate(), daysIn(n, d.getMonth())));
        break;
      case "month":
        d.setFullYear(d.getFullYear(), n - 1, Math.min(d.getDate(), daysIn(d.getFullYear(), n - 1)));
        break;
      case "day":
        d.setDate(n);
        break;
      case "hour":
        d.setHours((n % 12) + (d.getHours() >= 12 ? 12 : 0));
        break;
      case "minute":
        d.setMinutes(n);
        break;
    }
    if (part === "hour" || part === "minute") {
      this.set(which, d);
      return;
    }
    // A new date: show the start's month.
    this.set(which, d);
    this.view = new Date(this.start.getFullYear(), this.start.getMonth(), 1);
    this.buildMonths();
  }

  private dateOf(which: "start" | "end"): Date {
    return which === "start" ? this.start : (this.end ?? this.start);
  }

  private set(which: "start" | "end", d: Date): void {
    if (which === "start") {
      this.start = d;
    } else {
      this.end = d;
    }
    this.buildMonths();
  }

  private buildMonths(): void {
    const today = startOfDay(new Date()).getTime();
    const s = startOfDay(this.start).getTime();
    // While the end is being picked, the hovered day stands in for it.
    const endDay = this.end ?? this.hover;
    const e = endDay ? startOfDay(endDay).getTime() : s;
    const lo = Math.min(s, e);
    const hi = Math.max(s, e);
    this.months = [0, 1].map((offset) => {
      const first = new Date(this.view.getFullYear(), this.view.getMonth() + offset, 1);
      const count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
      const cells: (CalendarDay | null)[] = new Array(first.getDay()).fill(null);
      for (let day = 1; day <= count; day++) {
        const date = new Date(first.getFullYear(), first.getMonth(), day);
        const t = date.getTime();
        cells.push({
          date,
          day,
          future: t > today,
          inRange: !!endDay && t >= lo && t <= hi,
          bandStart: lo !== hi && t === lo,
          bandEnd: lo !== hi && t === hi,
          edge: t === s || (!!endDay && t === e),
        });
      }
      return { title: `${first.getFullYear()} ${MONTHS[first.getMonth()]}`, cells };
    });
  }
}

/** A field segment: the date's month / day / year, the time's hour / minute. */
type Segment = "month" | "day" | "year" | "hour" | "minute";

/** The values a segment takes ([min, max]) — the day's depends on the month. */
function segmentRange(d: Date, part: Segment): [number, number] {
  switch (part) {
    case "month":
      return [1, 12];
    case "day":
      return [1, daysIn(d.getFullYear(), d.getMonth())];
    case "year":
      return [1970, 9999];
    case "hour":
      return [1, 12];
    case "minute":
      return [0, 59];
  }
}

function daysIn(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** `day`'s date with `time`'s hours and minutes. */
function withTime(day: Date, time: Date): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), time.getHours(), time.getMinutes());
}
