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
import type { SummaryCard, SummaryPart, SummaryRow } from "../../../components/shared/summary-cards/summary-cards.component";
import type { StatHeadline, StatItem } from "../../../components/shared/stat-grid/stat-grid.component";
import type { StatusPillTone } from "../../../components/shared/status-pill/status-pill.component";
import type { Insight } from "../../../components/shared/insight-list/insight-list.component";
import type { LineChartSeries } from "../../../components/shared/line-chart/line-chart.component";
import type { TrendPoint } from "../../../components/shared/trend-chart/trend-chart.component";
import { formatClockTime, formatDateTime, formatDuration, formatShortDate } from "../../../components/shared/time-format";
import { fmtNumber } from "../../../components/shared/value-utils";

// The Asphalt Reports page: the tanks' inventory over a window, in tonnes (the one unit every tank shares — their volumes are in
// gallons or litres by tank). Built from each tank's tonnage averaged over the window's buckets ({@link inventoryInterval}): its
// ledger ({@link tankLedger}) books a fill or a draw once the level has moved by more than the tank's dead band
// ({@link moveBand}), so a sensor's jitter isn't counted, and settles what's left under the band at the window's end — so the
// books balance: opening + received − dispensed = closing, a tank's, a day's and the window's.

/** The least a move counts as a fill or a draw (t): a small day tank's dead band. */
export const MOVE_MIN_TONNES = 5;

/** A tank's dead band as a share of its full tonnage: a big tank's sensor jitters by more than a small one's. */
export const MOVE_BAND_SHARE = 0.005;

/** A tank under this level (%) is running low (an insight). */
export const LOW_LEVEL_PERCENT = 15;

/** A tank at or over this level (%) is nearly full (an insight). */
export const FULL_LEVEL_PERCENT = 90;

/** A product with fewer days of supply than this left at the window's rate of dispensing (an insight). */
export const LOW_SUPPLY_DAYS = 7;

/** The longest window read by the hour; a longer one is read by the day. */
export const INVENTORY_HOURLY_MAX_DAYS = 93;

const MINUTE = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE;

/**
 * The buckets a window's tonnage is averaged over: 10 minutes up to 3 days (a day tank fills and empties within the hour), 30 up
 * to two weeks, an hour up to {@link INVENTORY_HOURLY_MAX_DAYS}, a day past that.
 */
export function inventoryInterval(days: number): number {
  if (days <= 3) {
    return 10 * MINUTE;
  }
  if (days <= 14) {
    return 30 * MINUTE;
  }
  return days <= INVENTORY_HOURLY_MAX_DAYS ? 60 * MINUTE : DAY_MS;
}

/** A tank's dead band (t): {@link MOVE_BAND_SHARE} of its full tonnage, at least {@link MOVE_MIN_TONNES}. */
export function moveBand(fullTonnes: number | null): number {
  return Math.max(MOVE_MIN_TONNES, (fullTonnes ?? 0) * MOVE_BAND_SHARE);
}

/** A tank's full tonnage from its tonnage now and its level (%): null under 5% (too little to scale from). */
export function fullTonnesOf(tonnes: number | null, levelPercent: number | null): number | null {
  return tonnes !== null && levelPercent !== null && levelPercent >= 5 && tonnes > 0 ? (tonnes * 100) / levelPercent : null;
}

/** Same day, the day before, …: the window before a report's, shifted back by its days (the same days, to the same time). */
export function previousInventoryWindow(start: number, end: number, days: number): { start: number; end: number } {
  const back = (ts: number) => {
    const d = new Date(ts);
    d.setDate(d.getDate() - Math.max(1, days));
    return d.getTime();
  };
  return { start: back(start), end: back(end) };
}

/** A tank in the report: what it is, where, its state now and its averaged tonnage over the window and the window before. */
export interface ReportTank {
  id: string;
  name: string;
  product: string;
  siteId: string;
  /** Its site as the dashboards name one: "Richmond Lab (4R20)" ("" none). */
  site: string;
  /** Now: its level (%), its tonnage and whether it's online. */
  levelPercent: number | null;
  onHand: number | null;
  online: boolean;
  lastUpdateTs: number | null;
  /** Its tonnage at 100% ({@link fullTonnesOf}), its dead band's base. */
  fullTonnes: number | null;
  /** Its tonnage averaged a bucket over the window, and over the window before (null: not read yet). */
  points: TrendPoint[];
  previousPoints: TrendPoint[] | null;
}

/** A fill or a draw: a run of the tank's level moving one way — when it started and ended, and by how much (t). */
export interface TankMovement {
  tankId: string;
  tank: string;
  kind: "fill" | "draw";
  start: number;
  end: number;
  tonnes: number;
}

/** A tank's books over a window: its opening and closing tonnage, what it received and dispensed, each booked step, its moves, its low. */
export interface TankLedger {
  opening: number;
  closing: number;
  received: number;
  used: number;
  /** Each booked change: when, and by how much (t; a fill > 0, a draw < 0) — the window's end settled last. */
  steps: { ts: number; tonnes: number }[];
  movements: TankMovement[];
  low: TrendPoint;
}

/**
 * A tank's books from its averaged tonnage: a change is booked once the level has moved by `band` or more from the last booked
 * level (so its jitter isn't), each booked change a step — consecutive steps one way, no more than `maxGap` apart, a movement
 * (its start the reading before its first step) — and what's left under the band settled at its last reading: opening + received
 * − dispensed = closing. Null: no readings.
 */
export function tankLedger(points: TrendPoint[], band: number, maxGap: number, tank: { id: string; name: string }): TankLedger | null {
  const sorted = points.filter((p) => Number.isFinite(p.value)).sort((a, b) => a.ts - b.ts);
  if (!sorted.length) {
    return null;
  }
  const steps: { ts: number; tonnes: number }[] = [];
  const movements: TankMovement[] = [];
  let open: TankMovement | null = null;
  let booked = sorted[0].value;
  let low = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    const p = sorted[i];
    if (p.value < low.value) {
      low = p;
    }
    const change = p.value - booked;
    if (Math.abs(change) < band) {
      continue;
    }
    const kind = change > 0 ? "fill" : "draw";
    steps.push({ ts: p.ts, tonnes: change });
    if (open && open.kind === kind && p.ts - open.end <= maxGap) {
      open.end = p.ts;
      open.tonnes += Math.abs(change);
    } else {
      if (open) {
        movements.push(open);
      }
      open = { tankId: tank.id, tank: tank.name, kind, start: sorted[i - 1].ts, end: p.ts, tonnes: Math.abs(change) };
    }
    booked = p.value;
  }
  if (open) {
    movements.push(open);
  }
  const last = sorted[sorted.length - 1];
  if (last.value !== booked) {
    steps.push({ ts: last.ts, tonnes: last.value - booked });
  }
  const received = steps.reduce((t, s) => t + Math.max(0, s.tonnes), 0);
  const used = steps.reduce((t, s) => t + Math.max(0, -s.tonnes), 0);
  return { opening: sorted[0].value, closing: last.value, received, used, steps, movements, low };
}

/** A movement's key, the same across rebuilds: its tank and its bucket start (the ledger's). */
export function movementKey(m: Pick<TankMovement, "tankId" | "start">): string {
  return `${m.tankId}|${m.start}`;
}

/** A movement longer than this isn't refined from raw readings (its raw readings would be too many to read). */
export const REFINE_MAX_MS = 12 * 60 * MINUTE;

/** Where a movement's raw readings are read: its tank, its kind, its tank's dead band and the span. */
export interface MovementWindow {
  key: string;
  tankId: string;
  kind: TankMovement["kind"];
  band: number;
  start: number;
  end: number;
}

/**
 * Every tank's movements over the window and, each, the span its raw readings are read over to find when it really started and
 * ended ({@link refineMovement}): from a bucket before its first booked step to a bucket after its last — but never into the same
 * tank's movement before or after it. A movement longer than {@link REFINE_MAX_MS} isn't refined.
 */
export function movementWindows(tanks: ReportTank[], interval: number): MovementWindow[] {
  const maxGap = Math.max(3 * interval, 60 * MINUTE);
  const out: MovementWindow[] = [];
  for (const t of tanks) {
    const band = moveBand(t.fullTonnes);
    const moves = tankLedger(t.points, band, maxGap, t)?.movements ?? [];
    moves.forEach((m, i) => {
      if (m.end - m.start > REFINE_MAX_MS) {
        return;
      }
      const start = Math.max(m.start - interval, i ? moves[i - 1].end : -Infinity);
      const end = Math.min(m.end + interval, i < moves.length - 1 ? moves[i + 1].start : Infinity);
      out.push({ key: movementKey(m), tankId: t.id, kind: m.kind, band, start, end });
    });
  }
  return out;
}

/**
 * A movement's real start and end, from the tank's raw readings over its window: the level before it is the window's first reading,
 * after it the last; it started at the last reading before the level left the first by more than its jitter (a quarter of the tank's
 * dead band, 3% of the move, at least 0.5 t), and ended at the first reading from which it stays that close to the last. Null: the
 * readings don't show it (too few, or the level didn't move its way).
 */
export function refineMovement(points: TrendPoint[], kind: TankMovement["kind"], band: number): { start: number; end: number } | null {
  const pts = points.filter((p) => Number.isFinite(p.value)).sort((a, b) => a.ts - b.ts);
  if (pts.length < 3) {
    return null;
  }
  const before = pts[0].value;
  const after = pts[pts.length - 1].value;
  const total = after - before;
  if ((kind === "fill" && total <= 0) || (kind === "draw" && total >= 0)) {
    return null;
  }
  const jitter = Math.max(0.5, band / 4, Math.abs(total) * 0.03);
  const left = pts.findIndex((p) => Math.abs(p.value - before) > jitter);
  if (left < 0) {
    return null;
  }
  let settled = pts.length - 1;
  while (settled > 0 && Math.abs(pts[settled - 1].value - after) <= jitter) {
    settled--;
  }
  const start = pts[Math.max(0, left - 1)].ts;
  const end = pts[settled].ts;
  return end > start ? { start, end } : null;
}

export interface AsphaltReportInput {
  /** The window: its first day's local midnight, its end, how many days (1: that day, by hour). */
  start: number;
  end: number;
  /** It runs to now (not a custom range). */
  toNow: boolean;
  days: number;
  /** The buckets its tonnage was averaged over ({@link inventoryInterval}). */
  interval: number;
  tanks: ReportTank[];
  /** The window's tonnage is being read. */
  loading: boolean;
  /** When it was read (the strip's "As of …"). */
  readAt?: number;
  /**
   * The movements' real starts and ends, by {@link movementKey}, from their raw readings ({@link refineMovement}) — null while
   * they're read (the Movements section and the insights wireframed). A movement checked whose readings show no step (null in it:
   * a slow drift booked once it passed the dead band) isn't listed — its tonnes still count in Received and Dispensed; one not checked
   * (longer than {@link REFINE_MAX_MS}) keeps its buckets' times.
   */
  refined: Map<string, { start: number; end: number } | null> | null;
}

/** The Asphalt Reports page: its insights, figures strip, cards, charts and folded sections. */
export interface AsphaltReport {
  insights: Insight[];
  figures: { headline: StatHeadline; items: StatItem[] };
  /** This period against the last (the same days, to the same time): received, dispensed, the average a day — null until it's read. */
  versus: StatItem[] | null;
  summary: SummaryCard[];
  /** The tonnage on hand over the window, a line a product (each tank's last reading carried forward between its own). */
  inventory: { series: LineChartSeries[]; xMin: number; xMax: number };
  /** Received and dispensed a slot (an hour of a day's window, else a day): a plain bar chart, each slot named in full for its tooltip. */
  movement: { categories: string[]; titles: string[]; series: BarChartSeries[] };
  details: { slots: Record<string, unknown>[]; tanks: Record<string, unknown>[]; movements: Record<string, unknown>[]; movementsLoading: boolean };
}

const PALETTE = ["var(--c-chart-1)", "var(--c-chart-2)", "var(--c-chart-3)", "var(--c-chart-4)", "var(--c-chart-5)"];
/** Tonnes as shown: a decimal under 100. */
const tonnes = (t: number) => fmtNumber(t, Math.abs(t) > 0 && Math.abs(t) < 100 && !Number.isInteger(t) ? 1 : 0);
const signed = (t: number) => (t > 0 ? `+${tonnes(t)}` : t < 0 ? `−${tonnes(-t)}` : "0");
const percent = (part: number, whole: number) => (!whole ? "" : part > 0 && part / whole < 0.005 ? "<1%" : `${Math.round((part / whole) * 100)}%`);
const changeText = (now: number, before: number) => {
  if (!before) {
    return now ? "New" : "—";
  }
  const c = (now - before) / before;
  return `${c > 0 ? "+" : c < 0 ? "−" : ""}${Math.round(Math.abs(c) * 100)}%`;
};

/** The report from the window's readings: every figure, card, chart and table adds up to the same books. */
export function buildAsphaltReport(input: AsphaltReportInput): AsphaltReport {
  const { start, end, toNow, days, interval } = input;
  const dayWindow = days <= 1;
  const maxGap = Math.max(3 * interval, 60 * MINUTE);

  // The window's slots, in the viewer's zone: a day's hours, else its days.
  const dayStarts = Array.from({ length: Math.max(1, days) }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d.getTime();
  });
  const labels = dayWindow ? Array.from({ length: 24 }, (_, h) => formatClockTime(new Date(start).setHours(h), true)) : dayStarts.map((ts) => formatShortDate(ts));
  const titles = dayWindow
    ? Array.from({ length: 24 }, (_, h) => `${formatClockTime(new Date(start).setHours(h), true)} – ${formatClockTime(new Date(start).setHours(h + 1), true)}`)
    : dayStarts.map((ts) => `${new Date(ts).toLocaleDateString("en-US", { weekday: "short" })}, ${formatShortDate(ts)}`);
  const slotOf = (ts: number): number => {
    if (dayWindow) {
      const h = Math.floor((ts - start) / (60 * MINUTE));
      return h >= 0 && h < 24 ? h : -1;
    }
    for (let i = dayStarts.length - 1; i >= 0; i--) {
      if (ts >= dayStarts[i]) {
        return i;
      }
    }
    return -1;
  };

  // Each tank's books (those with readings in the window), and the window before's.
  const ledgers = input.tanks
    .map((t) => ({ tank: t, ledger: tankLedger(t.points, moveBand(t.fullTonnes), maxGap, t) }))
    .filter((x): x is { tank: ReportTank; ledger: TankLedger } => !!x.ledger);
  const silent = input.tanks.filter((t) => !ledgers.some((x) => x.tank.id === t.id));
  const previousRead = input.tanks.every((t) => t.previousPoints !== null);
  const previous = previousRead
    ? input.tanks
        .map((t) => tankLedger(t.previousPoints ?? [], moveBand(t.fullTonnes), maxGap, t))
        .filter((l): l is TankLedger => !!l)
        .reduce((s, l) => ({ received: s.received + l.received, used: s.used + l.used }), { received: 0, used: 0 })
    : null;

  // The window's books, and its slots': each slot's received and dispensed from the steps booked in it, its opening the slot before's
  // closing — so a day's figures add up, and the last day closes where the tanks do.
  const opening = ledgers.reduce((s, x) => s + x.ledger.opening, 0);
  const closing = ledgers.reduce((s, x) => s + x.ledger.closing, 0);
  const received = ledgers.reduce((s, x) => s + x.ledger.received, 0);
  const used = ledgers.reduce((s, x) => s + x.ledger.used, 0);
  const slotIn = labels.map(() => 0);
  const slotOut = labels.map(() => 0);
  const tankSlotOut = new Map<string, number[]>();
  for (const { tank, ledger } of ledgers) {
    const out = labels.map(() => 0);
    for (const step of ledger.steps) {
      const slot = Math.max(0, Math.min(labels.length - 1, slotOf(step.ts)));
      if (step.tonnes > 0) {
        slotIn[slot] += step.tonnes;
      } else {
        slotOut[slot] -= step.tonnes;
        out[slot] -= step.tonnes;
      }
    }
    tankSlotOut.set(tank.id, out);
  }
  const now = Date.now();
  const lastSlot = toNow ? Math.max(0, slotOf(now)) : labels.length - 1;
  const slotOpening: number[] = [];
  const slotClosing: number[] = [];
  labels.forEach((_, i) => {
    slotOpening[i] = i ? slotClosing[i - 1] : opening;
    slotClosing[i] = slotOpening[i] + slotIn[i] - slotOut[i];
  });
  const elapsedDays = Math.max(1 / 24, (Math.min(end, now) - start) / DAY_MS);
  const perDay = used / elapsedDays;
  const supply = perDay > 0 ? closing / perDay : null;

  // The tonnage on hand over the window, a series a product: at each reading's time, every tank's last reading carried forward.
  const products = [...new Set(ledgers.map((x) => x.tank.product || "No product"))]
    .map((name) => ({ name, onHand: ledgers.filter((x) => (x.tank.product || "No product") === name).reduce((s, x) => s + x.ledger.closing, 0) }))
    .sort((a, b) => b.onHand - a.onHand || a.name.localeCompare(b.name));
  const colorOf = new Map(products.map((p, i) => [p.name, PALETTE[Math.min(i, PALETTE.length - 1)]]));
  const totalOver = (list: { tank: ReportTank; ledger: TankLedger }[]): TrendPoint[] => {
    const times = [...new Set(list.flatMap((x) => x.tank.points.map((p) => p.ts)))].sort((a, b) => a - b);
    const sorted = list.map((x) => [...x.tank.points].sort((a, b) => a.ts - b.ts));
    const at = sorted.map(() => 0);
    const last: (number | null)[] = sorted.map(() => null);
    return times.map((ts) => {
      let sum = 0;
      sorted.forEach((pts, k) => {
        while (at[k] < pts.length && pts[at[k]].ts <= ts) {
          last[k] = pts[at[k]].value;
          at[k]++;
        }
        sum += last[k] ?? pts[0]?.value ?? 0;
      });
      return { ts, value: Math.round(sum * 10) / 10 };
    });
  };
  const inventorySeries: LineChartSeries[] = products.map((p) => ({
    name: p.name,
    color: colorOf.get(p.name)!,
    data: totalOver(ledgers.filter((x) => (x.tank.product || "No product") === p.name)),
  }));
  const total = totalOver(ledgers);
  const lowest = total.reduce<TrendPoint | null>((m, p) => (!m || p.value < m.value ? p : m), null);

  // The figures strip: the tonnage on hand — against the window's opening, its course a slot — then the moves and the supply.
  const delta = closing - opening;
  // Its chip in the status scale: more on hand green, less red, about the same neutral.
  const direction = Math.abs(delta) < 0.5 ? "flat" : delta > 0 ? "up" : "down";
  const asOf = input.readAt ? `As of ${formatClockTime(input.readAt)}` : undefined;
  const headline: StatHeadline = {
    label: toNow ? "On hand now" : "On hand at the end",
    value: ledgers.length ? tonnes(closing) : "—",
    unit: "t",
    change: ledgers.length
      ? { text: `${signed(delta)} t since ${formatShortDate(start)}`, direction, tone: direction === "up" ? "success" : direction === "down" ? "error" : undefined }
      : undefined,
    trend: slotClosing.slice(0, lastSlot + 1),
    note: asOf,
  };
  const items: StatItem[] = [
    { label: "Received", value: tonnes(received), unit: "t", info: "Each tank's fills: its rises past its dead band, a slow drift too. A tank filled from another counts too" },
    { label: "Dispensed", value: tonnes(used), unit: "t", info: "Each tank's draws: its falls past its dead band, a slow drift too. A tank emptied into another counts too" },
    { label: "Dispensed a day", value: tonnes(perDay), unit: "t", info: "What was dispensed over the window, a day on average" },
    {
      label: "Days of supply",
      value: supply === null ? "—" : fmtNumber(supply, supply < 10 ? 1 : 0),
      unit: supply === null ? "" : "days",
      info: "What's on hand, at the rate dispensed over the window",
    },
    { label: "Lowest on hand", value: lowest ? tonnes(lowest.value) : "—", unit: lowest ? "t" : "", note: lowest ? formatDateTime(lowest.ts) : undefined },
    { label: "Tanks reporting", value: `${ledgers.length}`, unit: `/ ${input.tanks.length}` },
  ];

  // This period against the last: received, dispensed, dispensed a day.
  const previousDays = elapsedDays;
  const versus: StatItem[] | null = previous
    ? [
        { label: "Received", value: tonnes(received), unit: "t", note: changeText(received, previous.received), caption: `Period before: ${tonnes(previous.received)} t` },
        { label: "Dispensed", value: tonnes(used), unit: "t", note: changeText(used, previous.used), caption: `Period before: ${tonnes(previous.used)} t` },
        {
          label: "Dispensed a day",
          value: tonnes(perDay),
          unit: "t",
          note: changeText(perDay, previous.used / previousDays),
          caption: `Period before: ${tonnes(previous.used / previousDays)} t`,
        },
      ]
    : null;

  // The cards: by product (a split of what's on hand), then the tanks ranked by what they hold and by what they dispensed.
  const composition: SummaryPart[] = closing > 0 ? products.map((p) => ({ label: p.name, color: colorOf.get(p.name)!, share: p.onHand / closing })) : [];
  const productRows: SummaryRow[] = products.length
    ? products.map((p) => ({ label: p.name, swatch: colorOf.get(p.name), meta: percent(p.onHand, closing), value: tonnes(p.onHand), unit: "t" }))
    : [{ label: "No readings", value: "" }];
  const ranked = (list: { label: string; value: number; trend?: number[] }[], whole: number, empty: string, noun: string): SummaryRow[] => {
    // Nothing that rounds to 0.0 t (a big tank's jitter settled at the window's end).
    const shown = list.filter((x) => x.value >= 0.05).sort((a, b) => b.value - a.value);
    if (!shown.length) {
      return [{ label: empty, value: "" }];
    }
    const top = shown[0].value;
    return shown.slice(0, 10).map((x) => ({
      label: x.label,
      meta: percent(x.value, whole),
      value: tonnes(x.value),
      unit: "t",
      share: top ? x.value / top : 0,
      ...(x.trend && labels.length <= 31 ? { trend: x.trend, trendTip: `${noun} a ${dayWindow ? "hour" : "day"}` } : {}),
    }));
  };
  const tankClosings = (l: TankLedger) => {
    // A tank's closing a slot, from its own steps: the "On hand" card's course.
    const byslot = labels.map(() => 0);
    for (const s of l.steps) {
      byslot[Math.max(0, Math.min(labels.length - 1, slotOf(s.ts)))] += s.tonnes;
    }
    let level = l.opening;
    return byslot.slice(0, lastSlot + 1).map((d) => (level += d));
  };
  const summary: SummaryCard[] = [
    { id: "products", title: "By product", info: "What's on hand, by product", composition, rows: productRows },
    {
      id: "onHand",
      title: "On hand by tank",
      rows: ranked(
        ledgers.map((x) => ({ label: x.tank.name, value: x.ledger.closing, trend: tankClosings(x.ledger) })),
        closing,
        "No readings",
        "On hand"
      ),
    },
    {
      id: "usedByTank",
      title: "Dispensed by tank",
      rows: ranked(
        ledgers.map((x) => ({ label: x.tank.name, value: x.ledger.used, trend: tankSlotOut.get(x.tank.id)?.slice(0, lastSlot + 1) })),
        used,
        "Nothing dispensed",
        "Dispensed"
      ),
    },
  ];
  const sites = new Map<string, number>();
  ledgers.forEach((x) => sites.set(x.tank.site || "No site", (sites.get(x.tank.site || "No site") ?? 0) + x.ledger.closing));
  if (sites.size > 1) {
    summary.push({ id: "bySite", title: "On hand by site", rows: ranked([...sites].map(([label, value]) => ({ label, value })), closing, "No readings", "On hand") });
  }

  // Each movement's real start and end (its raw readings'), once read — those whose readings show no step left out; else its buckets'.
  const movements = ledgers
    .flatMap((x) => x.ledger.movements)
    .filter((m) => input.refined?.get(movementKey(m)) !== null)
    .map((m) => ({ ...m, ...(input.refined?.get(movementKey(m)) ?? {}) }))
    .sort((a, b) => b.start - a.start);
  const report: AsphaltReport = {
    insights: [],
    figures: { headline, items },
    versus,
    summary,
    inventory: { series: inventorySeries, xMin: start, xMax: toNow ? now : end },
    movement: {
      categories: labels,
      titles,
      series: [
        { name: "Received", color: "var(--c-chart-1)", data: slotIn.map((v) => Math.round(v * 10) / 10) },
        { name: "Dispensed", color: "var(--c-chart-2)", data: slotOut.map((v) => Math.round(v * 10) / 10) },
      ],
    },
    details: {
      slots: labels
        .map((_, i) => ({
          id: String(i),
          slot: titles[i],
          slotSort: i,
          opening: tonnes(slotOpening[i]),
          openingSort: slotOpening[i],
          received: tonnes(slotIn[i]),
          receivedSort: slotIn[i],
          used: tonnes(slotOut[i]),
          usedSort: slotOut[i],
          closing: tonnes(slotClosing[i]),
          closingSort: slotClosing[i],
        }))
        .filter((_, i) => ledgers.length && i <= lastSlot),
      tanks: input.tanks.map((t) => {
        const l = ledgers.find((x) => x.tank.id === t.id)?.ledger ?? null;
        const num = (v: number | null | undefined) => (v === null || v === undefined ? "—" : tonnes(v));
        return {
          id: t.id,
          tank: t.name,
          product: t.product || "—",
          site: t.site || "—",
          level: t.levelPercent === null ? "—" : `${fmtNumber(t.levelPercent, 0)}%`,
          levelSort: t.levelPercent ?? -1,
          onHand: num(l?.closing),
          onHandSort: l?.closing ?? -1,
          received: num(l?.received),
          receivedSort: l?.received ?? -1,
          used: num(l?.used),
          usedSort: l?.used ?? -1,
          net: l ? signed(l.closing - l.opening) : "—",
          netSort: l ? l.closing - l.opening : 0,
          low: num(l?.low.value),
          lowSort: l?.low.value ?? -1,
        };
      }),
      movements: movements.map((m, i) => ({
        id: `${m.tankId}|${m.start}|${i}`,
        time: formatDateTime(m.start),
        timeSort: m.start,
        tank: m.tank,
        kind: m.kind === "fill" ? "Fill" : "Draw",
        tone: (m.kind === "fill" ? "brand" : "neutral") as StatusPillTone,
        icon: m.kind === "fill" ? "arrow_upward" : "arrow_downward",
        tonnes: tonnes(m.tonnes),
        tonnesSort: m.tonnes,
        duration: formatDuration(Math.max(MINUTE, m.end - m.start)),
        durationSort: m.end - m.start,
      })),
      movementsLoading: input.refined === null,
    },
  };
  report.insights = inventoryInsights({
    tanks: input.tanks,
    silent,
    ledgers,
    products: products.map((p) => ({
      name: p.name,
      onHand: p.onHand,
      used: ledgers.filter((x) => (x.tank.product || "No product") === p.name).reduce((s, x) => s + x.ledger.used, 0),
    })),
    elapsedDays,
    movements,
    slotOut,
    titles,
    dayWindow,
    opening,
    closing,
    start,
  });
  return report;
}

interface InsightInput {
  tanks: ReportTank[];
  silent: ReportTank[];
  ledgers: { tank: ReportTank; ledger: TankLedger }[];
  products: { name: string; onHand: number; used: number }[];
  elapsedDays: number;
  movements: TankMovement[];
  slotOut: number[];
  titles: string[];
  dayWindow: boolean;
  opening: number;
  closing: number;
  start: number;
}

const names = (list: string[]) => (list.length <= 2 ? list.join(" and ") : `${list.slice(0, 2).join(", ")} and ${list.length - 2} more`);

/**
 * What stands out, by fixed rules over what was read — warnings first, four at most, a card's `target` the folded section it opens:
 * tanks with no readings in the window, tanks running low, a product with few days of supply left at the window's rate of dispensing, then the
 * tanks nearly full, the largest fill, the day (hour) most was dispensed and how far what's on hand moved. Nothing: one card saying so.
 */
export function inventoryInsights(i: InsightInput): Insight[] {
  const warnings: Insight[] = [];
  const facts: Insight[] = [];
  if (i.silent.length) {
    warnings.push({
      id: "silent",
      icon: "wifi_off",
      tone: "warning",
      text: `No readings from ${names(i.silent.map((t) => t.name))} in this window`,
      target: "tanks",
    });
  }
  const low = i.tanks.filter((t) => t.levelPercent !== null && t.levelPercent < LOW_LEVEL_PERCENT).sort((a, b) => a.levelPercent! - b.levelPercent!);
  if (low.length === 1) {
    const t = low[0];
    warnings.push({ id: "low", icon: "water_loss", tone: "warning", text: `${t.name} is at ${fmtNumber(t.levelPercent, 0)}%${t.onHand !== null ? ` (${tonnes(t.onHand)} t)` : ""}`, target: "tanks" });
  } else if (low.length > 1) {
    warnings.push({ id: "low", icon: "water_loss", tone: "warning", text: `${low.length} tanks under ${LOW_LEVEL_PERCENT}%: ${names(low.map((t) => t.name))}`, target: "tanks" });
  }
  const short = i.products
    .map((p) => ({ ...p, days: p.used > 0 ? p.onHand / (p.used / i.elapsedDays) : null }))
    .filter((p): p is typeof p & { days: number } => p.days !== null && p.days < LOW_SUPPLY_DAYS)
    .sort((a, b) => a.days - b.days);
  for (const p of short.slice(0, 2)) {
    warnings.push({
      id: `supply-${p.name}`,
      icon: "hourglass_bottom",
      tone: "warning",
      text: `${p.name}: about ${fmtNumber(p.days, p.days < 10 ? 1 : 0)} days of supply left at this window's rate of dispensing`,
      target: "tanks",
    });
  }
  const full = i.tanks.filter((t) => t.levelPercent !== null && t.levelPercent >= FULL_LEVEL_PERCENT).sort((a, b) => b.levelPercent! - a.levelPercent!);
  if (full.length) {
    facts.push({
      id: "full",
      icon: "water_full",
      tone: "info",
      text: full.length === 1 ? `${full[0].name} is nearly full (${fmtNumber(full[0].levelPercent, 0)}%)` : `${full.length} tanks nearly full: ${names(full.map((t) => t.name))}`,
      target: "tanks",
    });
  }
  const fills = i.movements.filter((m) => m.kind === "fill").sort((a, b) => b.tonnes - a.tonnes);
  if (fills.length) {
    const f = fills[0];
    facts.push({ id: "fill", icon: "local_shipping", tone: "info", text: `Largest fill: ${tonnes(f.tonnes)} t into ${f.tank}, ${formatShortDate(f.start)}`, target: "movements" });
  }
  const busiest = i.slotOut.reduce((at, v, k) => (v > i.slotOut[at] ? k : at), 0);
  if (i.slotOut[busiest] > 0 && i.slotOut.filter((v) => v > 0).length > 1) {
    facts.push({ id: "busiest", icon: "trending_down", tone: "info", text: `Most dispensed: ${tonnes(i.slotOut[busiest])} t, ${i.titles[busiest]}`, target: "slots" });
  }
  if (i.ledgers.length && i.opening > 0) {
    const c = (i.closing - i.opening) / i.opening;
    if (Math.abs(c) >= 0.02) {
      facts.push({
        id: "change",
        icon: c > 0 ? "trending_up" : "trending_down",
        tone: "info",
        text: `On hand ${c > 0 ? "up" : "down"} ${Math.round(Math.abs(c) * 100)}% since ${formatShortDate(i.start)}`,
        target: "slots",
      });
    }
  }
  const list = [...warnings, ...facts].slice(0, 4);
  return list.length ? list : [{ id: "calm", icon: "check_circle", tone: "success", text: "Nothing stands out" }];
}
