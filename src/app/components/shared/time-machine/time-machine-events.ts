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

import { DestroyRef } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { Subscription, forkJoin, of, timer } from "rxjs";
import { exhaustMap } from "rxjs/operators";
import { WidgetContext } from "@home/models/widget-component.models";
import { DashboardAlarm, alarmSeverityRank } from "../dashboard/dashboard-alarms";
import type { MetricChartSection } from "../metric-chart-card/metric-chart-card.component";
import type { StatusPillTone } from "../status-pill/status-pill.component";
import { formatWhen } from "../time-format";
import {
  TIME_MACHINE_OFFLINE_ICON,
  TIME_MACHINE_ONLINE_ICON,
  TimeMachineEvent,
  TimeMachineSpan,
  alarmEvents,
  offlineStretches,
  readAlarmsInWindow,
  readReadingTimes,
  timeMachineSubject,
} from "./time-machine.models";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** How often a live window is read again (the alarms raised meanwhile come in live). */
const REFRESH_MS = 5 * MINUTE;
/** A device's report interval when it names none: offline after three missed reports, at least half an hour. */
const DEFAULT_REPORT_INTERVAL = 10 * MINUTE;
const OFFLINE_MIN_GAP = 30 * MINUTE;

/** A device in a Time Machine view: its card, and whose events (its alarms, its offline stretches) the timeline shows. */
export interface TimeMachineDevice {
  id: string;
  /** Its name: the card's title (a click opens its panel), the subject of its marks. */
  name: string;
  /** A muted detail before its site on the card's second line (QC Lab's IMEI) — left out when it's the name. */
  detail?: string;
  /** Its site by its label with its code, "Richmond Lab (4R20)" (`siteLocationLabel`'s format; "" none — the card a dash):
   *  the card's second line, and after its name in its marks' bubbles. */
  site?: string;
  /** Its card's charts over the window (`tb-metric-chart-card`'s sections): a new array with the same content is taken as the same. */
  charts: MetricChartSection[];
  /** The time-series keys whose readings show it reporting — every uplink's (its readings, `rssi`); none given: its charts' keys. */
  readingKeys?: string[];
  /** How often it reports (ms): offline past three missed reports, at least half an hour — none given, every 10 minutes. */
  reportInterval?: number;
  /** Its state now, as its list's pill (Aria's scale: Producing, Offline, …): the pill beside its card's name while live — at a
   *  picked time, its charts' state bar's state then (`MetricChartSection.stateStrip`). None: no pill. */
  status?: TimeMachineStatus;
}

/** A device's state as a pill shows it: its label, its tone (the status scale) and its icon. */
export interface TimeMachineStatus {
  label: string;
  tone: StatusPillTone;
  icon?: string;
}

/**
 * The events of a Time Machine's devices over its window: their alarms (raised in it, any status — and those raised since, from the
 * page's live alarm subscription) and the stretches each sent nothing (offline), as the timeline's marks and down stretches. A live
 * window (the last N up to now) is read again every few minutes; a custom range once. Each device's reads are one REST read
 * (`readAlarmsInWindow`, `readReadingTimes` — never a multi-entity time-series subscription), a few at a time.
 *
 * The devices read only grow: a device shown that wasn't read yet reads the window again (for all of them); one filtered out stays
 * read, so narrowing and widening the list again reads nothing.
 *
 * An offline stretch is an "Offline" mark at its start and a hatched run on the track; the runs are optional
 * (`setOfflineSpans(false)`: Aria's belt scales, quiet all night — the marks alone), on unless a page turns them off (QC Lab's).
 *
 * `tb-time-machine-view` owns one; a page with a timeline of its own can too:
 * ```ts
 * this.events = new TimeMachineEvents(this.ctx, this.destroyRef, () => this.cd.detectChanges());
 * this.events.setDevices(devices, liveAlarms); // what's shown, and the live subscription's alarms (again as they change)
 * this.events.setWindow(span, end);           // starts the reads; a new window: read afresh
 * ```
 */
export class TimeMachineEvents {
  /** The marks and down stretches of the devices shown. */
  events: TimeMachineEvent[] = [];
  spans: TimeMachineSpan[] = [];
  /** A window's first read is out: the timeline's count and track wireframed. */
  loading = false;
  /** The window's alarms as read (any status): what was active at a picked time ({@link alarmsAt}). */
  windowAlarms: DashboardAlarm[] = [];

  private span = DAY;
  private end: number | null = null;
  private started = false;
  /** Its devices' offline stretches drawn as hatched runs on the track too (their marks always); off — the marks alone. */
  private offlineSpans = true;
  private devices: readonly TimeMachineDevice[] = [];
  private live: readonly DashboardAlarm[] = [];
  /** Every device shown since the view opened, by id (the latest of each: its report interval, its name) — what's read. */
  private readable = new Map<string, TimeMachineDevice>();
  private readings = new Map<string, number[]>();
  private bucket = 0;
  private window = { start: 0, end: 0 };
  /** What the marks were last built from — new arrays only when it changes. */
  private signature = "";
  private subscription?: Subscription;

  constructor(
    private readonly ctx: WidgetContext,
    private readonly destroyRef: DestroyRef,
    private readonly changed: () => void = () => undefined
  ) {}

  /**
   * The window: the last `span` (ms) up to `end` (null: now — live, read again every few minutes). The first call starts the reads
   * (give the devices first, `setDevices`); a new window is read afresh, its marks wireframed meanwhile.
   */
  setWindow(span: number, end: number | null): void {
    if (this.started && span === this.span && end === this.end) {
      return;
    }
    this.span = span;
    this.end = end;
    this.started = true;
    this.restart(true);
  }

  /** Offline stretches as hatched runs on the track (on to start) or their marks alone — the marks rebuilt, nothing read again. */
  setOfflineSpans(on: boolean): void {
    if (on === this.offlineSpans) {
      return;
    }
    this.offlineSpans = on;
    this.apply();
  }

  /** The devices shown (their marks) and the live subscription's alarms: the marks rebuilt — a device not read yet, the window again. */
  setDevices(devices: readonly TimeMachineDevice[], liveAlarms: readonly DashboardAlarm[]): void {
    this.devices = devices;
    this.live = liveAlarms;
    let added = false;
    for (const d of devices) {
      added = added || !this.readable.has(d.id);
      this.readable.set(d.id, d);
    }
    if (!this.started) {
      return; // its window not given yet: read then
    }
    if (added) {
      // The marks shown stay while the new devices are read (a window's first read stays wireframed).
      this.restart(this.loading);
    } else {
      this.apply();
    }
  }

  /** Its reads stop (the view gone). */
  stop(): void {
    this.subscription?.unsubscribe();
    this.subscription = undefined;
  }

  /** Each device's alarms active at `time` (null: now) — the window's as read and the live subscription's ({@link alarmsActiveAt}). */
  alarmsAt(time: number | null): Map<string, DashboardAlarm[]> {
    return alarmsActiveAt(this.windowAlarms, this.live, time);
  }

  /** The window read now — and, live, every few minutes; `wireframe`: the marks cleared meanwhile. */
  private restart(wireframe: boolean): void {
    this.stop();
    if (wireframe) {
      this.signature = "";
      this.events = [];
      this.spans = [];
      this.windowAlarms = [];
      this.readings = new Map();
      this.loading = true;
    }
    // Always after this call (never inside the caller's change detection): a custom range once, a live window every few minutes.
    const reads = this.end != null ? timer(0) : timer(0, REFRESH_MS);
    this.subscription = reads
      .pipe(
        exhaustMap(() => {
          const end = this.end ?? Date.now();
          const span = this.span;
          const start = end - span;
          // Past a day, the readings as counts a bucket (a week's an hour, a month's two: ThingsBoard refuses past 700).
          const bucket = span > DAY ? Math.max(HOUR, Math.ceil(span / 400 / HOUR) * HOUR) : 0;
          const devices = [...this.readable.values()];
          return forkJoin({
            window: of({ start, end }),
            alarms: readAlarmsInWindow(
              this.ctx,
              devices.map((d) => d.id),
              start,
              end
            ),
            readings: readReadingTimes(
              this.ctx,
              devices.map((d) => ({ id: d.id, keys: readingKeysOf(d) })),
              start,
              end,
              bucket
            ),
            bucket: of(bucket),
          });
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(({ window, alarms, readings, bucket }) => {
        this.window = window;
        this.bucket = bucket;
        this.windowAlarms = alarms;
        this.readings = readings;
        this.loading = false;
        this.apply();
        this.changed();
      });
  }

  /**
   * The marks of the devices shown: their alarms over the window (as read, and those raised since — the live subscription's), each
   * in its severity's tone, and each stretch a device sent nothing (offline: past three of its report intervals, at least half an
   * hour), a grey mark at its start ("Offline"), a green one at its end once the device reports again ("Online"), and hatched on
   * the track — each named with its device and the device's site, "RMC Tank 02 ·
   * Richmond Lab (4R20)".
   */
  private apply(): void {
    if (!this.started || this.loading) {
      return;
    }
    const shown = new Map(this.devices.map((d) => [d.id, d]));
    const { start, end } = this.window;
    const read = new Set(this.windowAlarms.map((a) => a.id));
    // Live, those raised since the read too; a custom range, those in it.
    const since = (a: DashboardAlarm) => a.createdTime >= start && (this.end == null || a.createdTime <= end);
    const alarms = [...this.windowAlarms, ...this.live.filter((a) => !read.has(a.id) && since(a))].filter((a) => shown.has(a.originatorId));
    const subjectOf = (d: TimeMachineDevice | undefined, fallback = "") => timeMachineSubject(d?.name || fallback, d?.site ?? "");
    const events = alarmEvents(alarms, (a) => subjectOf(shown.get(a.originatorId), a.originatorName));
    const spans: TimeMachineSpan[] = [];
    for (const d of this.devices) {
      const times = this.readings.get(d.id);
      if (!times) {
        continue; // not read yet, or its read failed: not taken for offline
      }
      const interval = d.reportInterval || DEFAULT_REPORT_INTERVAL;
      // Counted a bucket (a long window): a bucket's time is its middle, readings to its end; offline past an empty bucket.
      const bucket = this.bucket;
      const due = bucket ? bucket / 2 : interval;
      const maxGap = Math.max(3 * interval, OFFLINE_MIN_GAP, 1.5 * bucket);
      const subject = subjectOf(d);
      for (const s of offlineStretches(times, start, end, due, maxGap)) {
        const id = `offline:${d.id}:${s.start}`;
        if (this.offlineSpans) {
          spans.push({ id, start: s.start, end: s.end, label: "Offline", subject });
        }
        events.push({ id, ts: s.start, label: "Offline", subject, tone: "neutral", icon: TIME_MACHINE_OFFLINE_ICON });
        // Back online — its next reading ended the stretch (one running to the window's end hasn't: still offline): a green cloud.
        if (s.end < end) {
          events.push({ id: `online:${d.id}:${s.end}`, ts: s.end, label: "Online", subject, tone: "success", icon: TIME_MACHINE_ONLINE_ICON });
        }
      }
    }
    const signature = JSON.stringify([events, spans]);
    if (signature !== this.signature) {
      this.signature = signature;
      this.events = events;
      this.spans = spans;
    }
  }
}

/**
 * Each device's alarms active at `time` — raised by then and not yet cleared: the window's (as read: a cleared one by its clear
 * time) and the live subscription's (active now, raised by then); `null` (live), those active now. Worst first, then newest. An
 * alarm raised before the window and cleared within it isn't read, so isn't counted.
 */
export function alarmsActiveAt(
  windowAlarms: readonly DashboardAlarm[],
  liveAlarms: readonly DashboardAlarm[],
  time: number | null
): Map<string, DashboardAlarm[]> {
  const all = new Map<string, DashboardAlarm>();
  if (time != null) {
    windowAlarms.forEach((a) => all.set(a.id, a));
  }
  liveAlarms.forEach((a) => all.set(a.id, a));
  const byDevice = new Map<string, DashboardAlarm[]>();
  for (const a of all.values()) {
    const active = time == null ? !a.cleared : a.createdTime <= time && (a.clearTs != null ? a.clearTs > time : !a.cleared);
    if (active && a.originatorId) {
      byDevice.set(a.originatorId, [...(byDevice.get(a.originatorId) ?? []), a]);
    }
  }
  byDevice.forEach((list) => list.sort((a, b) => alarmSeverityRank(b.severity) - alarmSeverityRank(a.severity) || b.createdTime - a.createdTime));
  return byDevice;
}

/** The keys whose readings show a device reporting: its own, else its charts'. */
function readingKeysOf(d: TimeMachineDevice): string[] {
  return d.readingKeys?.length ? d.readingKeys : [...new Set(d.charts.flatMap((c) => c.keys.map((k) => k.name)))];
}

/** A list of alarms in a bubble, a line each, worst first — "Channel 1 Temperature Alarm · Critical · Today 9:42 AM". */
export function alarmLinesTip(alarms: readonly DashboardAlarm[]): string {
  const severity = (s: string) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : "");
  return alarms.map((a) => [a.type, severity(a.severity), formatWhen(a.createdTime)].filter(Boolean).join(" · ")).join("\n");
}
