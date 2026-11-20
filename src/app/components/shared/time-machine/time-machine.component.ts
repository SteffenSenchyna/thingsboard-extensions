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

import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";
import { TipDirective, TipRich } from "../tip/tip.directive";
import type { ChartTooltipRow } from "../chart-tooltip";
import { formatClockTime, formatShortDate } from "../time-format";
import type { StatusPillTone } from "../status-pill/status-pill.component";
import { TimeMachineEvent, TimeMachineSpan } from "./time-machine.models";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
/** The zoom's steps: pixels a minute — a month from 864px to a day at 11 520px. */
const ZOOM_LEVELS = [0.02, 0.05, 0.1, 0.25, 0.5, 1, 2, 3, 5, 8];
/** A day's window starts at 5px a minute — a labelled tick every 10 minutes, 50px apart (UniFi's); a longer one as much less
 *  (a week's 0.5, a month's 0.1 — the nearest step down). */
const DAY_ZOOM_PPM = 5;
/** The labelled ticks' steps (minutes, up to two days): the finest at least {@link LABEL_MIN_PX} apart. */
const LABEL_STEPS = [10, 15, 30, 60, 120, 180, 360, 720, 1440, 2880];
const LABEL_MIN_PX = 40;
/** The small ticks' steps (minutes): the finest at least {@link MINOR_MIN_PX} apart that divides the labels' step. */
const MINOR_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 180, 360, 720, 1440];
const MINOR_MIN_PX = 5;
/** The marker's line: fixed this far under the axis' top (keep in step with `$playhead` in the stylesheet) — the time under it the
 *  picked one; above it, the next minutes (not yet). */
const PLAYHEAD_PX = 32;
/** A label this close to the axis' top is left out (it would be cut). */
const LABEL_TOP_PX = 8;
/** A bubble naming several (a mark's events, a down run's devices) lists this many lines at most, the last "and n more". */
const CLUSTER_LINES = 8;
/** Marks closer than this (px) are one mark — its count on it. */
const MARK_PITCH = 24;
/** A down stretch is drawn at least this tall (px). */
const SPAN_MIN_PX = 2;
/** Down stretches closer than this (px) are one run — no sliver of track between them (it would be lost in the gaps). */
const SPAN_JOIN_PX = 4;
/** The gap between two sections of the track (px): each a rounded bar, so where one ends and the next begins shows. */
const SEGMENT_GAP_PX = 2;
/** Scrolled less than this (px) from the top: live. */
const LIVE_SNAP_PX = 2;
/** How often the axis follows the clock. */
const CLOCK_MS = 10_000;
/** A mark's tone, worst first: a cluster takes its worst. */
const TONE_ORDER: StatusPillTone[] = ["error", "major", "minor", "warning", "caution", "neutral", "sky", "brand", "success"];
/**
 * A bubble row's bar, in its tone — the mark's own colour (`--tm-mark`): the status scale's (an alarm's severity), an Offline
 * pill's grey, the brand accent. Theme tokens, resolved where the mark sits by the tip directive.
 */
const TONE_COLOR: Record<StatusPillTone, string> = {
  success: "var(--c-bg-success-normal)",
  warning: "var(--c-bg-warning-normal)",
  caution: "var(--c-bg-caution-normal)",
  minor: "var(--c-bg-minor-normal)",
  major: "var(--c-bg-major-normal)",
  error: "var(--c-bg-error-normal)",
  neutral: "var(--c-text-pill-neutral)",
  brand: "var(--c-brand-accent)",
  sky: "var(--c-bg-sky-normal)",
};

/** A labelled tick: its place, its time ("10:50 AM"; a midnight's, the date). */
interface AxisLabel {
  ts: number;
  y: number;
  text: string;
}

/** An event's line across the track, at its time, in its mark's tone (the icon beside it — several close together: the worst's). */
interface AxisTick {
  id: string;
  y: number;
  tone: StatusPillTone;
}

/** A mark on the axis: one event, or several close together (its count shown, its bubble naming them). */
interface AxisMark {
  id: string;
  ts: number;
  y: number;
  tone: StatusPillTone;
  icon: string;
  /** Its events in words (its button's accessible name), a line each. */
  label: string;
  /** Its bubble: the charts' tooltip — a row an event, its device the title when they share one. */
  tip: TipRich | null;
  count: number;
}

/** A row of a mark's or a down run's bubble: what happened, to what, in its tone. */
interface BubbleItem {
  label: string;
  subject?: string;
  tone: StatusPillTone;
}

/**
 * A section of the track, a rounded bar (a gap between neighbours): not yet (above now), up, or down — a run of down stretches
 * (those overlapping or touching one), hatched, named in its bubble. Its top and height whole pixels (px from the track's top);
 * a down run's hatch offset minus its top — the stripes anchored to the track, running on from one run to the next.
 */
interface TrackSegment {
  id: string;
  kind: "future" | "up" | "down";
  top: number;
  height: number;
  hatchY: number;
  /** A down run's bubble (the charts' tooltip: a row a device — one device, its title); none on the others. */
  tip: TipRich | null;
}

/**
 * A dashboard's Time Machine (as UniFi's): a vertical timeline of the last day (`span`), newest at the top — its header "Last 24h
 * (n Events)" and a zoom (− slider +), then the axis (a labelled tick every 10 minutes, small ones between, 12-hour times), its
 * track (the down stretches hatched, `spans` — those overlapping or touching one run), its events' marks beside it (a tile in its
 * tone on the status scale, named in its bubble) and the marker: a line fixed near the axis' top, its pill "LIVE" or the time under
 * it ("4:16:16 AM"). Scrolling the axis scrubs it — the time under the marker is the picked one, the scroll's top now (live) — as
 * do a drag of the marker, a click on the axis or a mark (that time brought up to the marker), the arrow keys, and the arrow button
 * at its foot (back to live). The picked time is `time` (`null`: live), two-way: a dashboard moves its charts' pointer there
 * (`tb-metric-chart-card [pointerTime]`).
 *
 * ```html
 * <tb-time-machine [events]="tmEvents" [spans]="tmSpans" [loading]="tmLoading" [(time)]="pickedTime"></tb-time-machine>
 * ```
 */
@Component({
  selector: "tb-time-machine",
  templateUrl: "./time-machine.component.html",
  styleUrls: ["./time-machine.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, TipDirective],
})
export class TimeMachineComponent implements OnChanges, AfterViewInit, OnDestroy {
  /** How far back it reaches (ms) — "Last 24h". */
  @Input() span = 24 * 60 * MINUTE;
  /**
   * A window ending before now (a sidebar's custom range): its end (epoch ms) at the axis' top instead of now — the clock still,
   * the header the range's dates, the marker's top that end; null — the last `span` up to now (live).
   */
  @Input() end: number | null = null;
  /** What happened over it: a mark each (see {@link TimeMachineEvent}). */
  @Input() events: readonly TimeMachineEvent[] = [];
  /** Stretches something was down (a device offline): hatched on the track, those overlapping or touching as one run. */
  @Input() spans: readonly TimeMachineSpan[] = [];
  /** Its events are still read: the count and the track as a wireframe. */
  @Input() loading = false;
  /** The picked time (epoch ms); `null` — live (now). */
  @Input() time: number | null = null;
  @Output() timeChange = new EventEmitter<number | null>();

  @ViewChild("body", { static: true }) private bodyEl!: ElementRef<HTMLElement>;
  @ViewChild("scale", { static: true }) private scaleEl!: ElementRef<HTMLElement>;

  readonly maxZoom = ZOOM_LEVELS.length - 1;
  zoom = defaultZoom(24 * 60 * MINUTE);
  now = Date.now();
  /** The axis' oldest time (`span` before now). */
  axisStart = 0;
  /** The scale's height (px): the axis (the track's), then room for the oldest time to come up to the marker. */
  height = 0;
  axisHeight = 0;
  /** The small ticks' spacing and their tile's offset (on the minutes). */
  minorPx = 5;
  minorOffset = 0;
  labels: AxisLabel[] = [];
  marks: AxisMark[] = [];
  /** Each event's line across the track, at its own time (a cluster's events each theirs). */
  ticks: AxisTick[] = [];
  /** The track's sections, top to bottom: not yet (above now), then up and down (the down stretches' runs, hatched). */
  segments: TrackSegment[] = [];
  markerLabel = "LIVE";
  dragging = false;

  /** The body's height: the room under the axis, so its oldest time can come up to the marker. */
  private viewHeight = 0;
  /** The last time sent out: the dashboard's echo of it moves nothing. */
  private emitted: number | null = null;
  private clock?: ReturnType<typeof setInterval>;
  private scrollFrame = 0;
  private resizeObserver?: ResizeObserver;
  private drag = { y: 0, scrollTop: 0 };
  /** Scrolling scrubs: the time under the marker, a frame at a time. */
  private readonly onScroll = () => {
    if (!this.scrollFrame) {
      this.scrollFrame = requestAnimationFrame(() => {
        this.scrollFrame = 0;
        this.scrubFromScroll();
      });
    }
  };
  /** A click on the axis (not a mark or the marker — they stop theirs): that time brought up to the marker. */
  private readonly onScaleClick = (event: MouseEvent) => {
    this.scrubTo(this.timeAt(this.contentY(event.clientY)));
    this.cd.markForCheck(); // as a template's event would: this view and the dashboard's over it (its charts' pointer)
  };

  constructor(
    private readonly cd: ChangeDetectorRef,
    private readonly zone: NgZone
  ) {
    this.layout();
  }

  get live(): boolean {
    return this.time == null;
  }

  /** "Last 24h", "Last 3d" — a past window its dates, "Nov 10 – Nov 14". */
  get spanLabel(): string {
    if (this.end != null) {
      return `${formatShortDate(this.end - this.span)} – ${formatShortDate(this.end)}`;
    }
    const hours = Math.round(this.span / (60 * MINUTE));
    return hours < 48 ? `Last ${hours}h` : `Last ${Math.round(hours / 24)}d`;
  }

  /** A window ending before now (`end` set): its top is that end, not live. */
  get pastWindow(): boolean {
    return this.end != null;
  }

  /** The axis' top: now — or a past window's end. */
  private get topTime(): number {
    return this.end ?? Date.now();
  }

  /** The zoom slider's filled part (its thumb's place), as the dashboards' sliders. */
  get zoomFill(): string {
    return `${(this.zoom / this.maxZoom) * 100}%`;
  }

  private get pxPerMinute(): number {
    return ZOOM_LEVELS[this.zoom];
  }

  ngOnChanges(changes: SimpleChanges): void {
    // A new window: its zoom (the whole of a week or a month at a glance, a day as UniFi's), the axis from its top.
    if (changes["span"] || changes["end"]) {
      this.now = this.topTime;
      this.zoom = defaultZoom(this.span);
      if (!(changes["span"] ?? changes["end"]).firstChange) {
        requestAnimationFrame(() => this.scrollToTime());
      }
    }
    if (changes["events"] || changes["spans"] || changes["span"] || changes["end"]) {
      this.layout();
    } else if (changes["time"]) {
      this.placeMarker(); // a scrub's echo: only the pill's time (the axis is as drawn — never laid out again each frame)
    }
    // A time set by the dashboard (not its echo of ours): the axis scrolled to bring it under the marker, once drawn.
    if (changes["time"] && !changes["time"].firstChange && this.time !== this.emitted) {
      this.emitted = this.time;
      requestAnimationFrame(() => this.scrollToTime());
    }
  }

  ngAfterViewInit(): void {
    // In Angular's zone: a pick re-renders the dashboard's charts.
    this.scaleEl.nativeElement.addEventListener("click", this.onScaleClick);
    this.zone.runOutsideAngular(() => {
      const body = this.bodyEl.nativeElement;
      body.addEventListener("scroll", this.onScroll, { passive: true });
      this.clock = setInterval(() => this.tick(), CLOCK_MS);
      // The body's height sets the room under the axis (its oldest time can come up to the marker).
      if (typeof ResizeObserver !== "undefined") {
        this.resizeObserver = new ResizeObserver(() => {
          if (body.clientHeight !== this.viewHeight) {
            this.viewHeight = body.clientHeight;
            this.layout();
            this.cd.detectChanges();
            this.scrollToTime();
          }
        });
        this.resizeObserver.observe(body);
      }
    });
    if (this.time != null) {
      this.emitted = this.time;
      requestAnimationFrame(() => this.scrollToTime());
    }
  }

  ngOnDestroy(): void {
    clearInterval(this.clock);
    cancelAnimationFrame(this.scrollFrame);
    this.resizeObserver?.disconnect();
    this.bodyEl?.nativeElement.removeEventListener("scroll", this.onScroll);
    this.scaleEl?.nativeElement.removeEventListener("click", this.onScaleClick);
  }

  trackByTs(_: number, l: AxisLabel): number {
    return l.ts;
  }

  trackById(_: number, x: { id: string }): string {
    return x.id;
  }

  /** The place (px from the scale's top) of a time: now on the marker's line (scrolled to the top), older further down. */
  yOf(ts: number): number {
    return PLAYHEAD_PX + ((this.now - ts) / MINUTE) * this.pxPerMinute;
  }

  private timeAt(y: number): number {
    return this.now - ((y - PLAYHEAD_PX) / this.pxPerMinute) * MINUTE;
  }

  /** The scroll that brings a time under the marker (live: the top). */
  private scrollFor(ts: number | null): number {
    return ts == null ? 0 : Math.max(0, ((this.now - ts) / MINUTE) * this.pxPerMinute);
  }

  // -- zoom ----------------------------------------------------------------------

  /** A zoom step: the picked time stays under the marker. */
  setZoom(level: number): void {
    const next = Math.max(0, Math.min(this.maxZoom, Math.round(level)));
    if (next === this.zoom) {
      return;
    }
    this.zoom = next;
    this.layout();
    this.cd.detectChanges();
    this.scrollToTime();
  }

  // -- the marker ------------------------------------------------------------------

  /** Back to now: the axis scrolled to its top, scrubbing up as it goes. */
  goLive(): void {
    this.bodyEl.nativeElement.scrollTo({ top: 0, behavior: "smooth" });
  }

  onMarkClick(mark: AxisMark, event: MouseEvent): void {
    event.stopPropagation();
    this.scrubTo(mark.ts);
  }

  /** The marker dragged: down, back in time (the axis scrolls under it); up, toward now. */
  startDrag(event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    (event.currentTarget as HTMLElement).focus();
    this.drag = { y: event.clientY, scrollTop: this.bodyEl.nativeElement.scrollTop };
    this.dragging = true;
  }

  onDrag(event: PointerEvent): void {
    if (this.dragging) {
      this.bodyEl.nativeElement.scrollTop = this.drag.scrollTop + (event.clientY - this.drag.y);
    }
  }

  endDrag(event: PointerEvent): void {
    if (!this.dragging) {
      return;
    }
    this.dragging = false;
    (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
  }

  /** The wheel over the marker scrolls the axis under it, as anywhere on it. */
  onMarkerWheel(event: WheelEvent): void {
    this.bodyEl.nativeElement.scrollTop += event.deltaY;
  }

  /** The marker by key: ↑ / ↓ a minute later / earlier (with Shift, ten), Home — live, End — the oldest. */
  onMarkerKey(event: KeyboardEvent): void {
    const at = this.time ?? this.now;
    const step = (event.shiftKey ? 10 : 1) * MINUTE;
    const moves: Record<string, () => void> = {
      ArrowUp: () => this.scrubTo(at + step),
      ArrowDown: () => this.scrubTo(at - step),
      Home: () => this.goLive(),
      End: () => this.scrubTo(this.axisStart),
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      move();
    }
  }

  /** A time brought up to the marker (at once): picked as given, the axis scrolled to it. */
  private scrubTo(ts: number): void {
    this.setTime(ts);
    this.scrollToTime();
  }

  /** The axis scrolled so the picked time is under the marker (live: its top). */
  private scrollToTime(): void {
    this.bodyEl.nativeElement.scrollTop = this.scrollFor(this.time);
  }

  /**
   * The scroll moved (the wheel, a drag, the arrow button's glide): the time under the marker is the picked one — the top live.
   * Within a pixel of the picked time it stays as it is (the scroll set for it, rounded to the screen's pixels).
   */
  private scrubFromScroll(): void {
    const top = this.bodyEl.nativeElement.scrollTop;
    if (top < LIVE_SNAP_PX) {
      this.setTime(null);
      return;
    }
    const ts = this.timeAt(top + PLAYHEAD_PX);
    if (this.time != null && Math.abs(ts - this.time) <= MINUTE / this.pxPerMinute) {
      return;
    }
    this.setTime(ts);
  }

  /** The picked time (whole seconds, within the window; past now — live): shown on the pill and sent to the dashboard. */
  private setTime(ts: number | null): void {
    const next = ts == null || ts >= this.now ? null : Math.max(this.axisStart, Math.round(ts / 1000) * 1000);
    if (next === this.time) {
      return;
    }
    this.time = next;
    this.emitted = next;
    this.placeMarker();
    this.cd.detectChanges();
    // From a scroll (outside Angular) too: the dashboard re-renders its charts' pointer.
    this.zone.run(() => this.timeChange.emit(next));
  }

  // -- layout ----------------------------------------------------------------------

  /** The clock moved on: the axis follows — live, now stays on the marker; a picked time stays under it (the axis scrolled on). */
  private tick(): void {
    if (this.end != null) {
      return; // a past window: nothing moves
    }
    this.now = Date.now();
    this.layout();
    this.cd.detectChanges();
    this.scrollToTime();
  }

  /** The axis, its labels and small ticks, the marks, the down stretches and the marker, for now and the zoom. */
  private layout(): void {
    const ppm = this.pxPerMinute;
    const labelStep = LABEL_STEPS.find((s) => s * ppm >= LABEL_MIN_PX) ?? LABEL_STEPS[LABEL_STEPS.length - 1];
    const minorStep = MINOR_STEPS.find((s) => s * ppm >= MINOR_MIN_PX && labelStep % s === 0) ?? labelStep;
    this.axisStart = this.now - this.span;
    this.axisHeight = this.yOf(this.axisStart);
    // Room under the axis: its oldest time can come up to the marker.
    this.height = this.axisHeight + Math.max(0, this.viewHeight - PLAYHEAD_PX);
    // The axis' top is a little past now (the marker's room above it).
    const top = this.timeAt(0);
    this.minorPx = minorStep * ppm;
    this.minorOffset = this.yOf(alignDown(top, minorStep));

    const labels: AxisLabel[] = [];
    for (let ts = alignDown(top, labelStep); ts >= this.axisStart; ts -= labelStep * MINUTE) {
      const y = this.yOf(ts);
      if (y >= LABEL_TOP_PX) {
        const d = new Date(ts);
        labels.push({ ts, y, text: d.getHours() === 0 && d.getMinutes() === 0 ? formatShortDate(d) : formatClockTime(d) });
      }
    }
    this.labels = labels;

    // Newest first; marks closer than a tile's pitch are one (its worst tone, its count).
    const marks: AxisMark[] = [];
    const named: TimeMachineEvent[][] = [];
    /** Each event's mark (its index in `marks`): its line takes the mark's colour. */
    const markOf: number[] = [];
    // Each event once (the same alarm read twice is one mark), within the window.
    const seen = new Set<string>();
    const shown = this.events
      .filter((e) => e.ts >= this.axisStart && e.ts <= this.now && !seen.has(e.id) && !!seen.add(e.id))
      .sort((a, b) => b.ts - a.ts);
    for (const e of shown) {
      const y = this.yOf(e.ts);
      const last = marks[marks.length - 1];
      markOf.push(last && y - last.y < MARK_PITCH ? marks.length - 1 : marks.length);
      if (last && y - last.y < MARK_PITCH) {
        last.count++;
        named[named.length - 1].push(e);
        if (TONE_ORDER.indexOf(e.tone) < TONE_ORDER.indexOf(last.tone)) {
          last.tone = e.tone;
          last.icon = e.icon;
        }
      } else {
        marks.push({ id: e.id, ts: e.ts, y, tone: e.tone, icon: e.icon, label: "", tip: null, count: 1 });
        named.push([e]);
      }
    }
    // Each mark's bubble: a row an event, newest first — as the axis runs.
    marks.forEach((m, i) => {
      m.label = clusterLabel(named[i].map(itemText));
      m.tip = bubbleTip(named[i]);
    });
    this.marks = marks;
    // Each event's line in its mark's colour (several close together: the worst's, as the icon beside them).
    this.ticks = shown.map((e, i) => ({ id: e.id, y: this.yOf(e.ts), tone: marks[markOf[i]].tone }));

    this.segments = this.trackSegments();

    this.placeMarker();
  }

  /**
   * The track's sections, top to bottom: not yet (the track above now), then up and down by turns — the down stretches within
   * the window, those overlapping or touching (within {@link SPAN_JOIN_PX}) one run, its bubble a row each (a device once). Each a rounded bar on whole pixels, {@link SEGMENT_GAP_PX} between neighbours.
   */
  private trackSegments(): TrackSegment[] {
    const nowY = Math.round(this.yOf(this.now));
    const endY = Math.round(this.axisHeight);
    const rects = this.spans
      .map((s) => ({ s, start: Math.max(s.start, this.axisStart), end: Math.min(s.end, this.now) }))
      .filter(({ start, end }) => end > start)
      .map(({ s, start, end }) => {
        const top = this.yOf(end);
        return { s, top, bottom: Math.max(top + SPAN_MIN_PX, this.yOf(start)) };
      })
      .sort((a, b) => a.top - b.top);
    /** A run: its place, what was down (a row each — a device once). */
    const runs: { id: string; top: number; bottom: number; items: Map<string, BubbleItem> }[] = [];
    const itemOf = (s: TimeMachineSpan): [string, BubbleItem] => [itemText(s), { label: s.label, subject: s.subject, tone: "neutral" }];
    for (const r of rects) {
      const last = runs[runs.length - 1];
      if (last && r.top <= last.bottom + SPAN_JOIN_PX) {
        last.bottom = Math.max(last.bottom, r.bottom);
        last.items.set(...itemOf(r.s));
      } else {
        runs.push({ id: r.s.id, top: r.top, bottom: r.bottom, items: new Map([itemOf(r.s)]) });
      }
    }
    // The sections' edges, whole pixels: not yet, then up between the down runs.
    const pieces: { id: string; kind: TrackSegment["kind"]; top: number; bottom: number; tip: TipRich | null }[] = [
      { id: "future", kind: "future", top: 0, bottom: nowY, tip: null },
    ];
    let y = nowY;
    for (const r of runs) {
      const top = Math.max(y, Math.round(r.top));
      const bottom = Math.min(endY, Math.max(top + SPAN_MIN_PX, Math.round(r.bottom)));
      if (top > y) {
        pieces.push({ id: `up:${pieces.length}`, kind: "up", top: y, bottom: top, tip: null });
      }
      pieces.push({ id: r.id, kind: "down", top, bottom, tip: bubbleTip([...r.items.values()]) });
      y = bottom;
    }
    if (endY > y) {
      pieces.push({ id: `up:${pieces.length}`, kind: "up", top: y, bottom: endY, tip: null });
    }
    // A gap where one section meets the next: half off each.
    const half = SEGMENT_GAP_PX / 2;
    return pieces
      .map((p, i) => {
        const top = p.top + (i > 0 ? half : 0);
        const bottom = p.bottom - (i < pieces.length - 1 ? half : 0);
        return { id: p.id, kind: p.kind, top, height: bottom - top, hatchY: -top, tip: p.tip };
      })
      .filter((p) => p.height > 0);
  }

  private placeMarker(): void {
    // At the top: live — a past window's end, its time.
    const at = this.time ?? (this.end != null ? this.end : null);
    this.markerLabel = at == null ? "LIVE" : formatClockTime(at, false, true);
  }

  private contentY(clientY: number): number {
    const body = this.bodyEl.nativeElement;
    return clientY - body.getBoundingClientRect().top + body.scrollTop;
  }
}

/** A window's zoom: the step nearest below {@link DAY_ZOOM_PPM} scaled to it (a day 5px a minute, a week 0.5, a month 0.1). */
function defaultZoom(span: number): number {
  const target = (DAY_ZOOM_PPM * DAY) / Math.max(span, MINUTE);
  const i = ZOOM_LEVELS.findIndex((ppm) => ppm > target);
  return Math.max(0, (i < 0 ? ZOOM_LEVELS.length : i) - 1);
}

/** A time rounded down to a whole `step` minutes of the local clock (an hour's 10-minute marks, the day's 3-hour ones). */
function alignDown(ts: number, step: number): number {
  const d = new Date(ts);
  const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const minutes = (ts - midnight) / MINUTE;
  return midnight + Math.floor(minutes / step) * step * MINUTE;
}

/** A mark's events in words (its accessible name): its event's, or — several — each on a line of its own, past a few how many more. */
function clusterLabel(labels: string[]): string {
  const shown = labels.length <= CLUSTER_LINES ? labels : [...labels.slice(0, CLUSTER_LINES - 1), `and ${labels.length - CLUSTER_LINES + 1} more`];
  return shown.join("\n");
}

/** An event or a stretch in words: what happened, then to what — "Channel 2 Temperature · RMC Tank 02 · Richmond Lab (4R20)". */
function itemText(item: { label: string; subject?: string }): string {
  return [item.label, item.subject].filter((part) => !!part).join(" · ");
}

/**
 * A mark's or a down run's bubble — the charts' tooltip, a row an item: a bar in its tone (an alarm's severity, an Offline pill's
 * grey) and what happened, muted ("Channel 2 Temperature", "Offline"). What it happened to — a device and its site, "RMC Tank 10 ·
 * Richmond Lab (4R20)" — is the title when every row shares it; several devices: no title, each row its own on the right. Past a
 * few, how many more.
 */
function bubbleTip(items: readonly BubbleItem[]): TipRich {
  const subjects = new Set(items.map((item) => item.subject ?? ""));
  const shared = subjects.size === 1 ? [...subjects][0] : "";
  const rows: ChartTooltipRow[] = items.map((item) => ({ name: item.label, value: shared ? "" : item.subject ?? "", swatch: TONE_COLOR[item.tone] }));
  return {
    title: shared,
    rows: rows.length <= CLUSTER_LINES ? rows : [...rows.slice(0, CLUSTER_LINES - 1), { name: `and ${rows.length - CLUSTER_LINES + 1} more`, value: "" }],
  };
}
