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

import type { BarChartSeries } from "../../../components/shared/bar-chart/bar-chart.component";
import type { SummaryCard, SummaryRow } from "../../../components/shared/summary-cards/summary-cards.component";
import type { StatHeadline, StatItem } from "../../../components/shared/stat-grid/stat-grid.component";
import type { StatusPillTone } from "../../../components/shared/status-pill/status-pill.component";
import type { Insight } from "../../../components/shared/insight-list/insight-list.component";
import type { LineChartSeries, LineChartThreshold } from "../../../components/shared/line-chart/line-chart.component";
import type { TrendPoint } from "../../../components/shared/trend-chart/trend-chart.component";
import { formatClockTime, formatDateTime, formatDuration, formatShortDate } from "../../../components/shared/time-format";
import { fmtNumber } from "../../../components/shared/value-utils";

// The QC Lab Reports page: how well each channel kept to its range over a window — the range its own threshold alarm is set to
// (a probe channel's `temperatureChnNAlarmConfig`, an ambience sensor's `temperatureAlarmConfig` / `humidityAlarmConfig`) — from its
// raw readings. A reading stands for the time until the next one (at most {@link MAX_HOLD_MS} — past that, no data), so a probe
// reporting hourly gives its time in range to the hour; an excursion runs from its first reading out of range to the first back in
// it, both the readings' own times — and ends only once back in range for {@link EXCURSION_SETTLE_MS}.

/** A reading stands for at most this long: a longer silence is no data (neither in range nor out). */
export const MAX_HOLD_MS = 2 * 60 * 60 * 1000;

/** A channel in range for less of the time than this (%) is named (an insight). */
export const LOW_IN_RANGE_PERCENT = 95;

/**
 * An excursion ends once its channel has been back in range this long: a reading flickering across its limit (a probe sitting at
 * 25.0 °C — 25.1, 24.9, 25.1 a minute apart) is one excursion, not many. Its time out of range still counts only the time out.
 */
export const EXCURSION_SETTLE_MS = 15 * 60 * 1000;

/** The longest window read by the hour (the temperature chart's buckets); a longer one by the day. */
export const QC_HOURLY_MAX_DAYS = 93;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export type Quantity = "temperature" | "humidity";

/** Which way a reading was out of its range: too cold or too warm (a temperature), too dry or too wet (a humidity). */
export type OutWay = "cold" | "warm" | "dry" | "wet";

/** A way out as shown: its words, its pill's tone and icon, its colour in the out of range chart (the chart palette, in order). */
export const OUT_WAYS: Record<OutWay, { label: string; tone: StatusPillTone; icon: string; color: string }> = {
  cold: { label: "Too cold", tone: "sky", icon: "ac_unit", color: "var(--c-chart-1)" },
  warm: { label: "Too warm", tone: "error", icon: "local_fire_department", color: "var(--c-chart-2)" },
  dry: { label: "Too dry", tone: "minor", icon: "humidity_low", color: "var(--c-chart-3)" },
  wet: { label: "Too wet", tone: "brand", icon: "humidity_high", color: "var(--c-chart-4)" },
};

const WAYS = Object.keys(OUT_WAYS) as OutWay[];

/** The way out of a reading under its range ("low") or over it ("high"). */
export function outWay(quantity: Quantity, state: "low" | "high"): OutWay {
  if (quantity === "humidity") {
    return state === "low" ? "dry" : "wet";
  }
  return state === "low" ? "cold" : "warm";
}

/** A channel's range: what its threshold alarm leaves alone. `inverted`: it alarms inside [low, high] (its condition "between"). */
export interface ChannelRange {
  low: number | null;
  high: number | null;
  inverted: boolean;
}

/** An alarm config attribute as an object (it arrives JSON-stringified, or as an object). */
function configOf(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object") {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === "string" && raw.trim()) {
    try {
      const o = JSON.parse(raw);
      return o && typeof o === "object" ? o : {};
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * A channel's range from its threshold alarm's config — `enable`, `condition` (outside: in range between min and max; below: from
 * min up; above: up to max; between: anywhere but between them), `thresholdMin`, `thresholdMax` — in °C (a device showing °F has
 * its thresholds in °F: converted). Null: the alarm is off or incomplete (the channel has no range).
 */
export function channelRange(raw: unknown, fahrenheit: boolean): ChannelRange | null {
  const cfg = configOf(raw);
  if (cfg["enable"] !== true && cfg["enable"] !== "true") {
    return null;
  }
  const num = (v: unknown): number | null => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  const c = (v: number | null) => (v === null ? null : fahrenheit ? Math.round((((v - 32) * 5) / 9) * 10) / 10 : v);
  const min = c(num(cfg["thresholdMin"]));
  const max = c(num(cfg["thresholdMax"]));
  switch (String(cfg["condition"] ?? "").toLowerCase()) {
    case "outside":
      return min !== null && max !== null ? { low: min, high: max, inverted: false } : null;
    case "below":
      return min !== null ? { low: min, high: null, inverted: false } : null;
    case "above":
      return max !== null ? { low: null, high: max, inverted: false } : null;
    case "between":
      return min !== null && max !== null ? { low: min, high: max, inverted: true } : null;
    default:
      return null;
  }
}

/** Where a reading stands against a range: in it, under it or over it (an inverted range: "high" inside it). */
export function rangeState(v: number, r: ChannelRange): "in" | "low" | "high" {
  if (r.inverted) {
    return r.low !== null && r.high !== null && v >= r.low && v <= r.high ? "high" : "in";
  }
  if (r.low !== null && v < r.low) {
    return "low";
  }
  if (r.high !== null && v > r.high) {
    return "high";
  }
  return "in";
}

const num1 = (v: number) => fmtNumber(v, Number.isInteger(v) ? 0 : 1);

/** A range as shown: "21–25 °C", "≥ 21 °C", "≤ 25 °C", "not 21–25 °C". */
export function rangeText(r: ChannelRange, unit: string): string {
  const u = unit === "%" ? "%" : ` ${unit}`;
  if (r.inverted) {
    return `not ${num1(r.low!)}–${num1(r.high!)}${u}`;
  }
  if (r.low !== null && r.high !== null) {
    return `${num1(r.low)}–${num1(r.high)}${u}`;
  }
  return r.low !== null ? `≥ ${num1(r.low)}${u}` : `≤ ${num1(r.high!)}${u}`;
}

/** One channel in the report: its device, which reading, where, its range and its raw readings over the window (and the one before). */
export interface ReportChannel {
  /** `<device id>|<key>`. */
  id: string;
  deviceId: string;
  device: string;
  /** "Channel 1", "Channel 2" (a probe's), "Temperature", "Humidity" (an ambience sensor's). */
  channel: string;
  /** Its site as the dashboards name one ("Richmond Lab (4R20)"; "" none). */
  site: string;
  siteId: string;
  /** An ambience sensor's (its temperature and humidity) — else a probe's. */
  ambience: boolean;
  quantity: Quantity;
  unit: string;
  range: ChannelRange | null;
  points: TrendPoint[];
  previousPoints: TrendPoint[];
}

/** A run out of range: from its first reading out to the first back in (or the readings' end — `ongoing` at the window's end). */
export interface Excursion {
  channelId: string;
  device: string;
  channel: string;
  site: string;
  kind: "low" | "high";
  /** Which way, by its quantity: too cold / too warm, too dry / too wet. */
  way: OutWay;
  start: number;
  end: number;
  /** Its most extreme reading. */
  peak: number;
  unit: string;
  range: string;
  ongoing: boolean;
}

/** A channel's figures over a window: its readings' spread, its excursions, and the stretches its readings stand for. */
export interface ChannelStats {
  readings: number;
  min: number | null;
  max: number | null;
  /** Its readings' average. */
  mean: number | null;
  last: number | null;
  excursions: Excursion[];
  /** The stretches its readings stand for (each reading's hold, touching ones joined), and those under and over its range — what its
   *  device's figures are made of. */
  heldSpans: Span[];
  lowSpans: Span[];
  highSpans: Span[];
}

/** A stretch of time, [from, to) in ms. */
type Span = [number, number];

/** Stretches joined where they overlap or touch, in order (two probes of one tank out together: one tank out). */
function mergeSpans(spans: Span[]): Span[] {
  const merged: Span[] = [];
  [...spans]
    .sort((a, b) => a[0] - b[0])
    .forEach(([from, to]) => {
      const last = merged[merged.length - 1];
      if (last && from <= last[1]) {
        last[1] = Math.max(last[1], to);
      } else {
        merged.push([from, to]);
      }
    });
  return merged;
}

const spanMs = (spans: Span[]) => spans.reduce((t, [from, to]) => t + to - from, 0);
/** How much of [from, to) the stretches cover. */
const overlapMs = (spans: Span[], from: number, to: number) => spans.reduce((t, [a, b]) => t + Math.max(0, Math.min(b, to) - Math.max(a, from)), 0);

/**
 * A channel's figures over [start, end]: each reading stands until the next one — at most {@link MAX_HOLD_MS}, and never past the
 * window's end — in range, under it or over it (no range: in range); its excursions.
 */
export function channelStats(
  c: Pick<ReportChannel, "id" | "device" | "channel" | "site" | "quantity" | "unit" | "range">,
  points: TrendPoint[],
  start: number,
  end: number
): ChannelStats {
  const pts = points.filter((p) => Number.isFinite(p.value) && p.ts < end).sort((a, b) => a.ts - b.ts);
  const stats: ChannelStats = { readings: pts.length, min: null, max: null, mean: null, last: null, excursions: [], heldSpans: [], lowSpans: [], highSpans: [] };
  if (!pts.length) {
    return stats;
  }
  const rangeLabel = c.range ? rangeText(c.range, c.unit) : "";
  // The excursion running (a holder: the closures below change it).
  const run: { e: Excursion | null } = { e: null };
  const close = (at: number, ongoing = false) => {
    if (run.e) {
      run.e.end = at;
      run.e.ongoing = ongoing;
      stats.excursions.push(run.e);
      run.e = null;
    }
  };
  const addSpan = (from: number, to: number, state: "in" | "low" | "high") => {
    const join = (list: Span[]) => {
      const prev = list[list.length - 1];
      if (prev && prev[1] === from) {
        prev[1] = to;
      } else {
        list.push([from, to]);
      }
    };
    join(stats.heldSpans);
    if (state !== "in") {
      join(state === "low" ? stats.lowSpans : stats.highSpans);
    }
  };
  pts.forEach((p, i) => {
    stats.min = stats.min === null ? p.value : Math.min(stats.min, p.value);
    stats.max = stats.max === null ? p.value : Math.max(stats.max, p.value);
    const next = i + 1 < pts.length ? pts[i + 1].ts : end;
    const until = Math.min(next, p.ts + MAX_HOLD_MS, end);
    const state = c.range ? rangeState(p.value, c.range) : "in";
    if (state === "in") {
      close(p.ts);
    } else {
      if (run.e && run.e.kind !== state) {
        close(p.ts);
      }
      const e: Excursion = run.e ?? {
        channelId: c.id,
        device: c.device,
        channel: c.channel,
        site: c.site,
        kind: state,
        way: outWay(c.quantity, state),
        start: p.ts,
        end: until,
        peak: p.value,
        unit: c.unit,
        range: rangeLabel,
        ongoing: false,
      };
      run.e = e;
      e.peak = state === "low" ? Math.min(e.peak, p.value) : Math.max(e.peak, p.value);
      e.end = until;
      // A silence past its hold ends what's known of it there.
      if (until < next && until < end) {
        close(until);
      }
    }
    if (until > Math.max(p.ts, start)) {
      addSpan(Math.max(p.ts, start), until, state);
    }
  });
  const last = run.e as Excursion | null;
  if (last) {
    close(last.end, last.end >= end - 1);
  }
  // Excursions one way with less than EXCURSION_SETTLE_MS back in range between them are one.
  stats.excursions = stats.excursions.reduce<Excursion[]>((list, e) => {
    const prev = list[list.length - 1];
    if (prev && prev.kind === e.kind && e.start - prev.end < EXCURSION_SETTLE_MS) {
      prev.end = e.end;
      prev.ongoing = e.ongoing;
      prev.peak = e.kind === "low" ? Math.min(prev.peak, e.peak) : Math.max(prev.peak, e.peak);
    } else {
      list.push(e);
    }
    return list;
  }, []);
  stats.last = pts[pts.length - 1].value;
  stats.mean = pts.reduce((t, p) => t + p.value, 0) / pts.length;
  return stats;
}

export interface QcReportInput {
  /** The window: its first day's local midnight, its end, how many days (1: that day, by hour). */
  start: number;
  end: number;
  toNow: boolean;
  days: number;
  channels: ReportChannel[];
  /** The readings are being read. */
  loading: boolean;
  /** When they were read (the strip's "As of …"). */
  readAt?: number;
}

/** The QC Lab Reports page: its insights, figures strip, cards, charts and folded sections. */
export interface QcReport {
  insights: Insight[];
  figures: { headline: StatHeadline; items: StatItem[] };
  /** This period against the last (the same days, to the same time): time in range, excursions, time out of range. */
  versus: StatItem[];
  summary: SummaryCard[];
  /**
   * The ambience sensors' cards — none in the report (its Types and Sites filters): none — their time in range (worst first, its
   * course a slot), then their temperature and their humidity (each its average, its lowest and highest).
   */
  ambience: SummaryCard[];
  /** Hours out of range a slot (an hour of a day's window, else a day): too cold, too warm — too dry, too wet with a humidity in the
   *  report — a plain stacked bar chart. */
  outOfRange: { categories: string[]; titles: string[]; series: BarChartSeries[] };
  /** The temperature channels' readings an hour (a day past {@link QC_HOURLY_MAX_DAYS}): their highest, average and lowest, the limits most of them use. */
  temperature: { series: LineChartSeries[]; thresholds: LineChartThreshold[]; xMin: number; xMax: number };
  details: { slots: Record<string, unknown>[]; devices: Record<string, unknown>[]; excursions: Record<string, unknown>[] };
}

const pct = (part: number, whole: number) => (whole ? (part / whole) * 100 : null);
const pctText = (p: number | null) => (p === null ? "—" : p >= 99.95 && p < 100 ? "99.9" : fmtNumber(p, p === 100 || p === 0 ? 0 : 1));
const hours = (ms: number) => Math.round((ms / HOUR_MS) * 10) / 10;
const duration = (ms: number) => (ms > 0 ? formatDuration(ms) : "0");
const changeText = (now: number, before: number) => {
  if (!before) {
    return now ? "New" : "—";
  }
  const c = (now - before) / before;
  return `${c > 0 ? "+" : c < 0 ? "−" : ""}${Math.round(Math.abs(c) * 100)}%`;
};

/** A device's figures: its channels together — a probe's two, an ambience sensor's temperature and humidity — one device. */
interface DeviceFigures {
  deviceId: string;
  device: string;
  site: string;
  /** An ambience sensor (its temperature and humidity) — else a probe. */
  ambience: boolean;
  /** Its channels' ranges, each once ("21–25 °C · 45–56%"); none: no range set. */
  ranges: string[];
  /** The stretches its ranged channels' readings stood for, those any was out each way (too cold, …), and those any was out. */
  held: Span[];
  ways: Record<OutWay, Span[]>;
  out: Span[];
  heldMs: number;
  waysMs: Record<OutWay, number>;
  /** The time any of its ranged channels was out of range, and its share in range of the time they stood for (null: no readings). */
  outMs: number;
  inPct: number | null;
  /** A reading of it with no range (its threshold alarm off): left out of the time in range. */
  unranged: boolean;
  excursions: number;
  longestMs: number;
  /** Its temperature channels' lowest and highest readings. */
  lowest: number | null;
  highest: number | null;
  /** Each quantity's readings: their average (its channels' readings together), lowest and highest; null: none. */
  spread: Record<Quantity, { mean: number; min: number; max: number } | null>;
  readings: number;
}

function deviceFigures(rows: { c: ReportChannel; s: ChannelStats }[]): DeviceFigures[] {
  const by = new Map<string, { c: ReportChannel; s: ChannelStats }[]>();
  rows.forEach((r) => (by.get(r.c.deviceId) ?? by.set(r.c.deviceId, []).get(r.c.deviceId)!).push(r));
  return [...by.values()].map((list) => {
    const ranged = list.filter((r) => r.c.range);
    const held = mergeSpans(ranged.flatMap((r) => r.s.heldSpans));
    // Each way out: its channels out that way together (a probe's two too cold at once: one stretch too cold).
    const ways = Object.fromEntries(
      WAYS.map((w) => [
        w,
        mergeSpans(ranged.flatMap((r) => [...(outWay(r.c.quantity, "low") === w ? r.s.lowSpans : []), ...(outWay(r.c.quantity, "high") === w ? r.s.highSpans : [])])),
      ])
    ) as Record<OutWay, Span[]>;
    const out = mergeSpans(WAYS.flatMap((w) => ways[w]));
    const heldMs = spanMs(held);
    const outMs = spanMs(out);
    const temps = list.filter((r) => r.c.quantity === "temperature" && r.s.readings);
    const spreadOf = (q: Quantity) => {
      const read = list.filter((r) => r.c.quantity === q && r.s.readings);
      const n = read.reduce((t, r) => t + r.s.readings, 0);
      return n
        ? {
            mean: read.reduce((t, r) => t + r.s.mean! * r.s.readings, 0) / n,
            min: Math.min(...read.map((r) => r.s.min!)),
            max: Math.max(...read.map((r) => r.s.max!)),
          }
        : null;
    };
    return {
      deviceId: list[0].c.deviceId,
      device: list[0].c.device,
      site: list[0].c.site,
      ambience: list[0].c.ambience,
      ranges: [...new Set(ranged.map((r) => rangeText(r.c.range!, r.c.unit)))],
      held,
      ways,
      out,
      heldMs,
      waysMs: Object.fromEntries(WAYS.map((w) => [w, spanMs(ways[w])])) as Record<OutWay, number>,
      outMs,
      inPct: ranged.length ? pct(heldMs - outMs, heldMs) : null,
      unranged: list.some((r) => !r.c.range),
      excursions: ranged.reduce((t, r) => t + r.s.excursions.length, 0),
      longestMs: ranged.reduce((m, r) => r.s.excursions.reduce((n, e) => Math.max(n, e.end - e.start), m), 0),
      lowest: temps.length ? Math.min(...temps.map((r) => r.s.min!)) : null,
      highest: temps.length ? Math.max(...temps.map((r) => r.s.max!)) : null,
      spread: { temperature: spreadOf("temperature"), humidity: spreadOf("humidity") },
      readings: list.reduce((t, r) => t + r.s.readings, 0),
    };
  });
}

/** The report from the channels' readings: every figure, card, chart and table from the same spans. */
export function buildQcReport(input: QcReportInput): QcReport {
  const { start, end, toNow, days } = input;
  const dayWindow = days <= 1;
  const now = Date.now();
  const shownEnd = Math.min(end, now);
  const dayStarts = Array.from({ length: Math.max(1, days) }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d.getTime();
  });
  const slots = dayWindow ? Array.from({ length: 24 }, (_, h) => new Date(start).setHours(h, 0, 0, 0)) : dayStarts;
  const labels = dayWindow ? slots.map((ts) => formatClockTime(ts, true)) : slots.map((ts) => formatShortDate(ts));
  const titles = dayWindow
    ? slots.map((ts, h) => `${formatClockTime(ts, true)} – ${formatClockTime(new Date(start).setHours(h + 1), true)}`)
    : slots.map((ts) => `${new Date(ts).toLocaleDateString("en-US", { weekday: "short" })}, ${formatShortDate(ts)}`);
  const lastSlot = Math.max(0, slots.filter((s) => s <= shownEnd).length - 1);

  // Each channel's figures over the window, and over the window before (the same days, to the same time).
  const back = (ts: number) => {
    const d = new Date(ts);
    d.setDate(d.getDate() - Math.max(1, days));
    return d.getTime();
  };
  const rows = input.channels.map((c) => ({
    c,
    s: channelStats(c, c.points, start, shownEnd),
    p: channelStats(c, c.previousPoints, back(start), back(shownEnd)),
  }));
  const ranged = rows.filter((r) => r.c.range);
  // Each device — never a channel — its channels together: a probe's two, an ambience sensor's temperature and humidity. Its time
  // out of range the time any of them was out; its time in range its share of the time they stood for. Every time figure is theirs.
  const devices = deviceFigures(rows);
  const rangedDevices = devices.filter((d) => d.ranges.length);
  const prevDevices = deviceFigures(rows.map((r) => ({ c: r.c, s: r.p }))).filter((d) => d.ranges.length);
  const sumHeld = rangedDevices.reduce((t, d) => t + d.heldMs, 0);
  const sumOut = rangedDevices.reduce((t, d) => t + d.outMs, 0);
  const prevHeld = prevDevices.reduce((t, d) => t + d.heldMs, 0);
  const prevOut = prevDevices.reduce((t, d) => t + d.outMs, 0);
  const inPct = pct(sumHeld - sumOut, sumHeld);
  const prevPct = pct(prevHeld - prevOut, prevHeld);
  const excursions = ranged.flatMap((r) => r.s.excursions).sort((a, b) => b.start - a.start);
  const prevExcursions = ranged.reduce((t, r) => t + r.p.excursions.length, 0);
  const longest = excursions.reduce<Excursion | null>((m, e) => (!m || e.end - e.start > m.end - m.start ? e : m), null);
  const ongoing = excursions.filter((e) => e.ongoing && toNow);
  const deviceIds = [...new Set(input.channels.map((c) => c.deviceId))];
  const reporting = new Set(rows.filter((r) => r.s.readings).map((r) => r.c.deviceId));
  const silentDevices = deviceIds.filter((id) => !reporting.has(id)).map((id) => input.channels.find((c) => c.deviceId === id)!.device);
  const unranged = devices.filter((d) => d.readings && d.unranged).length;
  const alwaysIn = rangedDevices.filter((d) => d.readings && d.outMs === 0).length;
  // Each slot's figures, the devices' added up: the time they stood for, out of range, and out each way (too cold, …).
  const slotEnd = (i: number) => (i + 1 < slots.length ? slots[i + 1] : shownEnd);
  const slotFigures = slots.map((ts, i) => {
    const sum = (spans: (d: DeviceFigures) => Span[]) => rangedDevices.reduce((t, d) => t + overlapMs(spans(d), ts, slotEnd(i)), 0);
    return {
      held: sum((d) => d.held),
      out: sum((d) => d.out),
      ways: Object.fromEntries(WAYS.map((w) => [w, sum((d) => d.ways[w])])) as Record<OutWay, number>,
    };
  });
  const slotPct = slotFigures.map((f) => pct(f.held - f.out, f.held));

  // The figures strip: the time in range — its change against the period before, its course a slot — then the excursions.
  const asOf = input.readAt ? `As of ${formatClockTime(input.readAt)}` : undefined;
  // Its change against the period before, as a share of it (the Fuel Reports page's pill): more time in range is good.
  const change = inPct !== null && prevPct ? (inPct - prevPct) / prevPct : null;
  const headline: StatHeadline = {
    label: "Time in range",
    value: pctText(inPct),
    unit: inPct === null ? "" : "%",
    change:
      change === null
        ? undefined
        : {
            text: `${change >= 0 ? "+" : "−"}${Math.abs(change * 100).toFixed(1)}% vs previous period`,
            direction: change > 0.0005 ? "up" : change < -0.0005 ? "down" : "flat",
            tone: change > 0.0005 ? "success" : change < -0.0005 ? "error" : undefined,
          },
    trend: slotPct.slice(0, lastSlot + 1).map((p) => p ?? 100),
    note: asOf,
  };
  const items: StatItem[] = [
    { label: "Excursions", value: String(excursions.length), note: ongoing.length ? `${ongoing.length} ongoing` : undefined, info: "Runs of readings out of range" },
    { label: "Out of range", value: duration(sumOut), info: "Each device's time out of range, added up" },
    { label: "Longest excursion", value: longest ? duration(longest.end - longest.start) : "—", note: longest ? longest.device : undefined },
    { label: "Always in range", value: String(alwaysIn), unit: `/ ${rangedDevices.length} devices` },
    { label: "Devices reporting", value: String(reporting.size), unit: `/ ${deviceIds.length}` },
    { label: "Without a range", value: String(unranged), unit: unranged === 1 ? "device" : "devices", info: "Devices with a reading whose threshold alarm is off: that reading is left out of the time in range" },
  ];
  const versus: StatItem[] = [
    { label: "Time in range", value: pctText(inPct), unit: inPct === null ? "" : "%", caption: `Period before: ${pctText(prevPct)}${prevPct === null ? "" : "%"}` },
    { label: "Excursions", value: String(excursions.length), note: changeText(excursions.length, prevExcursions), caption: `Period before: ${prevExcursions}` },
    { label: "Out of range", value: duration(sumOut), note: changeText(sumOut, prevOut), caption: `Period before: ${duration(prevOut)}` },
  ];

  // The cards: the devices by their time out of range, by their excursions, and those out of range now.
  const worst = devices.filter((d) => d.outMs > 0).sort((a, b) => b.outMs - a.outMs);
  const deviceRows: SummaryRow[] = worst.length
    ? worst.slice(0, 10).map((d) => ({
        label: d.device,
        meta: sumOut ? `${Math.round((d.outMs / sumOut) * 100)}%` : "",
        value: duration(d.outMs),
        share: worst[0].outMs ? d.outMs / worst[0].outMs : 0,
      }))
    : [{ label: "Always in range", value: "" }];
  // How often each device went out of range: a probe sitting at its limit goes out again and again, a short while each time.
  const excursionsBy = new Map<string, number>();
  excursions.forEach((e) => excursionsBy.set(e.device, (excursionsBy.get(e.device) ?? 0) + 1));
  const busiest = [...excursionsBy].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const excursionRows: SummaryRow[] = busiest.length
    ? busiest.slice(0, 10).map(([device, n]) => ({
        label: device,
        meta: `${Math.round((n / excursions.length) * 100)}%`,
        value: String(n),
        share: n / busiest[0][1],
      }))
    : [{ label: "No excursions", value: "" }];
  // The sites by their time in range, worst first (an insight's, where the viewer sees more than one).
  const bySite = new Map<string, { held: number; out: number }>();
  rangedDevices.forEach((d) => {
    const v = bySite.get(d.site || "No site") ?? { held: 0, out: 0 };
    v.held += d.heldMs;
    v.out += d.outMs;
    bySite.set(d.site || "No site", v);
  });
  const sites = [...bySite]
    .map(([label, v]) => ({ label, pct: pct(v.held - v.out, v.held) }))
    .filter((x): x is { label: string; pct: number } => x.pct !== null)
    .sort((a, b) => a.pct - b.pct || a.label.localeCompare(b.label));
  // The devices out of range at their latest reading (the window's end, a window in the past): each once — its channel out the
  // longest — how long, and its reading; the longest first.
  const outNow = new Map<string, Excursion>();
  excursions
    .filter((e) => e.ongoing)
    .forEach((e) => {
      const had = outNow.get(e.device);
      if (!had || e.start < had.start) {
        outNow.set(e.device, e);
      }
    });
  const nowList = [...outNow.values()].sort((a, b) => a.start - b.start);
  const nowRows: SummaryRow[] = nowList.length
    ? nowList.slice(0, 10).map((e) => {
        const reading = ranged.find((r) => r.c.id === e.channelId)?.s.last ?? null;
        return {
          label: e.device,
          icon: OUT_WAYS[e.way].icon,
          meta: reading === null ? "" : `${num1(Math.round(reading * 10) / 10)}${e.unit === "%" ? "%" : ` ${e.unit}`}`,
          value: duration(e.end - e.start),
          share: (e.end - e.start) / (nowList[0].end - nowList[0].start || 1),
        };
      })
    : [{ label: "Every device in range", value: "" }];
  const summary: SummaryCard[] = [
    { id: "devices", title: "Out of range by device", info: "The time any of a device's channels was out of range", rows: deviceRows },
    { id: "excursions", title: "Excursions by device", info: "How often each device went out of range", rows: excursionRows },
    {
      id: "now",
      title: toNow ? "Out of range now" : "Out of range at the end",
      info: toNow ? "Devices out of range at their latest reading: that reading, and how long they've been out" : "Devices out of range at the window's end: their reading then, and how long they'd been out",
      rows: nowRows,
    },
  ];

  // The ambience sensors' cards: their time in range, worst first — its course a slot — then their temperature and humidity.
  const ambient = devices.filter((d) => d.ambience);
  const slotWord = dayWindow ? "hour" : "day";
  const ambienceRanked: SummaryRow[] = [...ambient]
    .sort((a, b) => (a.inPct ?? 101) - (b.inPct ?? 101) || a.device.localeCompare(b.device))
    .slice(0, 10)
    .map((d) => {
      // Its time out of range a slot, up to the last shown (a window of a month or less: a bar a slot stays readable).
      const outBy = slots.length <= 31 && d.inPct !== null ? slots.slice(0, lastSlot + 1).map((ts, i) => overlapMs(d.out, ts, slotEnd(i))) : undefined;
      const peak = outBy?.length ? outBy.reduce((at, v, i) => (v > outBy[at] ? i : at), 0) : -1;
      return {
        label: d.device,
        meta: !d.readings ? "No readings" : !d.ranges.length ? "No range set" : undefined,
        value: d.inPct === null ? "—" : pctText(d.inPct),
        unit: d.inPct === null ? undefined : "%",
        share: (d.inPct ?? 0) / 100,
        trend: outBy,
        trendTip: outBy && peak >= 0 && outBy[peak] > 0 ? `Out of range a ${slotWord} · most ${titles[peak]}: ${duration(outBy[peak])}` : undefined,
      };
    });
  // A quantity's line a sensor, by name: its average, its lowest and highest before it.
  const ambienceSpread = (q: Quantity, unit: string): SummaryRow[] =>
    [...ambient]
      .sort((a, b) => a.device.localeCompare(b.device))
      .slice(0, 10)
      .map((d) => {
        const s = d.spread[q];
        const r1 = (v: number) => num1(Math.round(v * 10) / 10);
        return s ? { label: d.device, meta: `${r1(s.min)}–${r1(s.max)}`, value: r1(s.mean), unit } : { label: d.device, meta: "No readings", value: "—" };
      });
  const ambience: SummaryCard[] = ambient.length
    ? [
        {
          id: "ambienceInRange",
          title: "Ambience in range",
          info: `Each ambience sensor's time in range, its temperature and humidity together — worst first, its time out of range a ${slotWord} beside it`,
          rows: ambienceRanked,
        },
        { id: "ambienceTemperature", title: "Ambience temperature", info: "Each ambience sensor's average temperature, its lowest and highest before it", rows: ambienceSpread("temperature", "°C") },
        { id: "ambienceHumidity", title: "Ambience humidity", info: "Each ambience sensor's average humidity, its lowest and highest before it", rows: ambienceSpread("humidity", "%") },
      ]
    : [];

  // Hours out of range a slot, each way: too cold and too warm — too dry and too wet with a ranged humidity in the report.
  const shownWays: OutWay[] = ranged.some((r) => r.c.quantity === "humidity") ? WAYS : ["cold", "warm"];
  const outOfRange = {
    categories: labels,
    titles,
    series: shownWays.map((w) => ({ name: OUT_WAYS[w].label, color: OUT_WAYS[w].color, data: slotFigures.map((f) => hours(f.ways[w])) })),
  };

  // The temperature channels an hour (a day past QC_HOURLY_MAX_DAYS): their highest, average and lowest readings; their limits.
  const bucket = days <= QC_HOURLY_MAX_DAYS ? HOUR_MS : DAY_MS;
  const temps = rows.filter((r) => r.c.quantity === "temperature");
  const buckets = new Map<number, number[]>();
  temps.forEach((r) =>
    r.c.points.forEach((p) => {
      if (p.ts >= start && p.ts < shownEnd && Number.isFinite(p.value)) {
        const b = start + Math.floor((p.ts - start) / bucket) * bucket + bucket / 2;
        (buckets.get(b) ?? buckets.set(b, []).get(b)!).push(p.value);
      }
    })
  );
  const times = [...buckets.keys()].sort((a, b) => a - b);
  const line = (fn: (vs: number[]) => number) => times.map((ts) => ({ ts, value: Math.round(fn(buckets.get(ts)!) * 10) / 10 }));
  // Each limit the one most of the temperature channels use (94 at 21–25 °C, one at 23–25 °C: 21 and 25 drawn).
  const usual = (values: (number | null | undefined)[]): number[] => {
    const counts = new Map<number, number>();
    values.forEach((v) => typeof v === "number" && counts.set(v, (counts.get(v) ?? 0) + 1));
    const top = [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
    return top ? [top[0]] : [];
  };
  const limit = "var(--c-bg-major-normal)";
  const temperature = {
    series: [
      { name: "Highest", color: "var(--c-chart-2)", data: line((vs) => Math.max(...vs)) },
      { name: "Average", color: "var(--c-chart-1)", data: line((vs) => vs.reduce((a, b) => a + b, 0) / vs.length) },
      { name: "Lowest", color: "var(--c-chart-3)", data: line((vs) => Math.min(...vs)) },
    ],
    // The range's lower and upper limits, each the one most temperature channels use.
    thresholds: [...usual(temps.map((r) => r.c.range?.low)), ...usual(temps.map((r) => r.c.range?.high))].map((v) => ({ value: v, color: limit, label: `${num1(v)} °C` })),
    xMin: start,
    xMax: toNow ? now : end,
  };

  const report: QcReport = {
    insights: qcInsights({ ranged, devices, silentDevices, excursions, ongoing, sites, days }),
    figures: { headline, items },
    versus,
    summary,
    ambience,
    outOfRange,
    temperature,
    details: {
      slots: slots
        .map((ts, i) => {
          const inSlot = temps.flatMap((r) => r.c.points.filter((p) => p.ts >= ts && p.ts < (i + 1 < slots.length ? slots[i + 1] : shownEnd)).map((p) => p.value));
          const outMs = slotFigures[i].out;
          return {
            id: String(i),
            slot: titles[i],
            slotSort: i,
            inRange: slotPct[i] === null ? "—" : `${pctText(slotPct[i])}%`,
            inRangeSort: slotPct[i] ?? -1,
            out: duration(outMs),
            outSort: outMs,
            excursions: String(excursions.filter((e) => e.start >= ts && e.start < (i + 1 < slots.length ? slots[i + 1] : shownEnd)).length),
            excursionsSort: excursions.filter((e) => e.start >= ts && e.start < (i + 1 < slots.length ? slots[i + 1] : shownEnd)).length,
            lowest: inSlot.length ? `${num1(Math.min(...inSlot))} °C` : "—",
            lowestSort: inSlot.length ? Math.min(...inSlot) : Number.MAX_SAFE_INTEGER,
            highest: inSlot.length ? `${num1(Math.max(...inSlot))} °C` : "—",
            highestSort: inSlot.length ? Math.max(...inSlot) : -Number.MAX_SAFE_INTEGER,
          };
        })
        .filter((_, i) => i <= lastSlot),
      devices: [...devices]
        .sort((a, b) => Number(b.readings === 0) - Number(a.readings === 0) || (a.inPct ?? 101) - (b.inPct ?? 101) || a.device.localeCompare(b.device))
        .map((d) => ({
          id: d.deviceId,
          device: d.device,
          site: d.site || "—",
          range: d.ranges.length ? d.ranges.join(" · ") : "No range set",
          inRange: d.inPct === null ? "—" : `${pctText(d.inPct)}%`,
          inRangeSort: d.readings === 0 ? -1 : (d.inPct ?? 101),
          out: d.ranges.length && d.readings ? duration(d.outMs) : "—",
          outSort: d.outMs,
          excursions: d.ranges.length && d.readings ? String(d.excursions) : "—",
          excursionsSort: d.excursions,
          longest: d.longestMs ? duration(d.longestMs) : "—",
          longestSort: d.longestMs,
          lowest: d.lowest === null ? "—" : `${num1(Math.round(d.lowest * 10) / 10)} °C`,
          lowestSort: d.lowest ?? Number.MAX_SAFE_INTEGER,
          highest: d.highest === null ? "—" : `${num1(Math.round(d.highest * 10) / 10)} °C`,
          highestSort: d.highest ?? -Number.MAX_SAFE_INTEGER,
          readings: d.readings ? String(d.readings) : "None",
          readingsSort: d.readings,
        })),
      excursions: excursions.map((e, i) => ({
        id: `${e.channelId}|${e.start}|${i}`,
        started: formatDateTime(e.start),
        startedSort: e.start,
        device: e.device,
        channel: e.channel,
        kind: OUT_WAYS[e.way].label,
        tone: OUT_WAYS[e.way].tone,
        icon: OUT_WAYS[e.way].icon,
        duration: e.ongoing && toNow ? `${duration(e.end - e.start)}, ongoing` : duration(e.end - e.start),
        durationSort: e.end - e.start,
        peak: `${num1(Math.round(e.peak * 10) / 10)}${e.unit === "%" ? "%" : ` ${e.unit}`}`,
        peakSort: e.peak,
        range: e.range,
      })),
    },
  };
  return report;
}

interface InsightInput {
  /** The ranged channels (an out of range device's reading) and the devices. */
  ranged: { c: ReportChannel; s: ChannelStats }[];
  devices: DeviceFigures[];
  silentDevices: string[];
  excursions: Excursion[];
  ongoing: Excursion[];
  /** The sites by their time in range, worst first. */
  sites: { label: string; pct: number }[];
  days: number;
}

/** A quarter of the day an excursion starts in, by its hour: "12–6 AM", "6 AM–12 PM", "12–6 PM", "6 PM–12 AM". */
const DAY_PARTS = ["12–6 AM", "6 AM–12 PM", "12–6 PM", "6 PM–12 AM"];

/**
 * What stands out across the devices and sites — never a channel by channel breakdown — by fixed rules: a short sentence a card, two
 * lines at most, warnings first, four at most, none repeating the strip under it; a card's `target` the folded section it opens:
 *  - the devices out of range now (the reading, one alone);
 *  - the devices that sent no readings;
 *  - the devices out of range a day or more in all (a window longer than a day) — its specimens' curing in doubt;
 *  - the site with the lowest time in range, under {@link LOW_IN_RANGE_PERCENT}% — only where the viewer sees more than one;
 *  - which way it went: three quarters or more of the time out of range one way — too cold, too warm, too dry or too wet;
 *  - when: half or more of the excursions (eight or more) starting in one quarter of the day ("12–6 AM").
 * Nothing: one card saying so.
 */
export function qcInsights(i: InsightInput): Insight[] {
  const out: Insight[] = [];
  const warnings: Insight[] = [];
  const reading = (v: number | null, unit: string) => (v === null ? "" : ` (${num1(Math.round(v * 10) / 10)}${unit === "%" ? "%" : ` ${unit}`})`);
  // The device out the longest first, as the Out of range now card.
  const devicesOut = [...new Set([...i.ongoing].sort((a, b) => a.start - b.start).map((e) => e.device))];
  if (devicesOut.length) {
    const first = i.ongoing.find((e) => e.device === devicesOut[0])!;
    const now = i.ranged.find((r) => r.c.id === first.channelId)?.s.last ?? null;
    out.push({
      id: "ongoing",
      icon: "warning",
      tone: "error",
      text:
        devicesOut.length === 1
          ? `${devicesOut[0]} out of range now${reading(now, first.unit)}`
          : `${devicesOut.length} devices out of range now: ${devicesOut[0]} +${devicesOut.length - 1}`,
      target: "excursions",
    });
  }
  if (i.silentDevices.length) {
    warnings.push({
      id: "silent",
      icon: "wifi_off",
      tone: "warning",
      text: i.silentDevices.length === 1 ? `No readings from ${i.silentDevices[0]}` : `${i.silentDevices.length} devices sent no readings`,
      target: "devices",
    });
  }
  const dayOut = i.devices.filter((d) => d.outMs >= DAY_MS);
  if (i.days > 1 && dayOut.length) {
    warnings.push({
      id: "day-out",
      icon: "timer",
      tone: "warning",
      text: dayOut.length === 1 ? `${dayOut[0].device} out of range a day or more` : `${dayOut.length} devices out of range a day or more`,
      target: "devices",
    });
  }
  // The lowest site, where there's more than one to compare (most viewers see one: its figure is the strip's).
  const lowSite = i.sites[0];
  if (i.sites.length > 1 && lowSite.pct < LOW_IN_RANGE_PERCENT) {
    warnings.push({
      id: "site",
      icon: "location_on",
      tone: "warning",
      text: `${lowSite.label} lowest site at ${pctText(lowSite.pct)}% in range`,
    });
  }
  out.push(...warnings);
  const byWay = WAYS.map((w) => ({ w, ms: i.devices.reduce((t, d) => t + d.waysMs[w], 0) })).sort((a, b) => b.ms - a.ms);
  const allWays = byWay.reduce((t, x) => t + x.ms, 0);
  if (allWays >= HOUR_MS && byWay[0].ms >= 0.75 * allWays) {
    const way = OUT_WAYS[byWay[0].w];
    out.push({
      id: "way",
      icon: way.icon,
      tone: "info",
      text: `Mostly ${way.label.toLowerCase()}: ${Math.round((byWay[0].ms / allWays) * 100)}% of the time out of range`,
      target: "excursions",
    });
  }
  const parts = [0, 0, 0, 0];
  i.excursions.forEach((e) => parts[Math.floor(new Date(e.start).getHours() / 6)]++);
  const top = parts.indexOf(Math.max(...parts));
  if (i.excursions.length >= 8 && parts[top] * 2 >= i.excursions.length) {
    out.push({
      id: "when",
      icon: "schedule",
      tone: "info",
      text: `${Math.round((parts[top] / i.excursions.length) * 100)}% of excursions start ${DAY_PARTS[top]}`,
      target: "excursions",
    });
  }
  if (out.length) {
    return out.slice(0, 4);
  }
  return [{ id: "calm", icon: "check_circle", tone: "success", text: i.excursions.length ? "Nothing stands out" : "Everything stayed in range" }];
}
