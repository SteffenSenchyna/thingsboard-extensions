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


import { BarChartSeries } from "../../../components/shared/bar-chart/bar-chart.component";
import { SummaryCard, SummaryRow } from "../../../components/shared/summary-cards/summary-cards.component";
import type { StatHeadline, StatItem } from "../../../components/shared/stat-grid/stat-grid.component";
import type { StatusPillTone } from "../../../components/shared/status-pill/status-pill.component";
import type { Insight } from "../../../components/shared/insight-list/insight-list.component";
import type { LineChartSeries } from "../../../components/shared/line-chart/line-chart.component";
import { formatClockTime, formatDateTime, formatShortDate } from "../../../components/shared/time-format";
import { fmtNumber } from "../../../components/shared/value-utils";
import { CodeKind, FUEL_TYPES } from "../../models/fuel-management.models";

/** The Reports page: its insights, its figures strip, its cards, its charts and its folded sections. */
export interface FuelReport {
  /**
   * The insights strip (`tb-insight-list`): what stands out, by fixed rules ({@link fuelInsights}) — warnings first, four at most, a
   * card's `target` the folded section it opens ("denials", "pumps", "users", "vehicles", "slots"). `insightsLoading`: the totals or
   * the events aren't in.
   */
  insights: Insight[];
  insightsLoading: boolean;
  details: ReportDetails;
  /**
   * This period against the last ({@link previousReportWindow}: the same days, to the same time): the fuel dispensed, the dispenses and
   * the denials — each its change, and the previous window's figure in a muted line under it ("Yesterday to 2:15 PM: 1,234 L").
   */
  versus: StatItem[];
  /**
   * The figures strip (`tb-stat-grid` with a headline): the fuel dispensed — its change against the previous period, its trend over
   * the window — then the dispenses, their average, the denials, the best day (hour), the average per active day (hour) and the pumps
   * dispensing. `loading`: the totals aren't in (their values wireframed; the trend stays).
   */
  figures: { headline: StatHeadline; items: StatItem[]; loading: boolean };
  summary: SummaryCard[];
  /**
   * Fuel dispensed over the window (per hour for a day, else per day), stacked by fuel type — a plain bar chart, every bar in full;
   * `titles` each slot named in full for its tooltip ("Tue, Nov 10", "2 PM – 3 PM").
   */
  overTime: { categories: string[]; titles: string[]; series: BarChartSeries[] };
  /** Fuel dispensed by station (PLC), largest first: a ranked card (the top ten) — each one's share and its bar, as the "Top …" cards'. */
  byStation: SummaryCard;
  /** Dispenses by hour of day over the window (null: the window was read by the day). */
  byHour: { categories: string[]; series: BarChartSeries[] } | null;
  /** The volumes' unit as shown ("L", "gal") — every figure, card and chart is in it ({@link FuelReportInput.unit}). */
  unit: string;
  /**
   * The strip as it reads for each slot of the over-time chart (its hour, its day): shown while that slot's bar is hovered — the
   * slot's fuel against the average active slot, its dispenses, denials, share of the period, rank and pumps dispensing.
   */
  slotFigures: { headline: StatHeadline; items: StatItem[] }[];
  /** The running total over the window against the period before's (dashed, the same slots): how far ahead or behind it is. */
  running: { series: LineChartSeries[]; xMin: number; xMax: number };
  /** Dispenses by day of the week and hour of the day (a window of a week or more read by the hour), else null. */
  weekHour: { rows: string[]; columns: string[]; values: number[][] } | null;
  /** How large the dispenses were: how many in each size band (`loading`: the events aren't in). */
  sizes: { categories: string[]; series: BarChartSeries[]; loading: boolean };
  /** By shift (a window read by the hour): Day, Evening, Night — each its share and its bar, as a ranked card's; else null. */
  byShift: SummaryCard | null;
  /** The window's events read only in part ({@link FuelReportInput.eventsFrom}): what that leaves out, for a note over the page; else null. */
  eventsNote: string | null;
}

/** The volumes a report shows: litres, or US gallons. */
export type ReportUnit = "L" | "gal";

/** US gallons in a litre. */
export const GALLONS_PER_LITRE = 0.264172;

/** A dispense over a window (from the pumps' events): when, at which pump, how much (litres) and with which codes. */
export interface ReportDispense {
  ts: number;
  pumpId: string;
  volume: number;
  userCode: string;
  vehicleCode: string;
}

/** An hour (or a day) of a pump's stored totals ("Fuel Daily Totals"): its bucket's middle and its sums. */
export interface ReportBucket {
  ts: number;
  litres: number;
  dispenses: number;
  denied: number;
}

/** A pump's sums over the previous window ({@link previousReportWindow}): the "vs last" figures'. */
export interface ReportPrevious {
  litres: number;
  dispenses: number;
  denied: number;
}

export const NO_REPORT_PREVIOUS: ReportPrevious = { litres: 0, dispenses: 0, denied: 0 };

/**
 * The window before a report's — the same window shifted back by its days (calendar days, in the viewer's zone): today so far against
 * yesterday to the same time, the last 7 days against the 7 before them, to the same time — so "vs last" compares like with like.
 */
export function previousReportWindow(start: number, end: number, days: number): { start: number; end: number } {
  const back = (ts: number) => {
    const d = new Date(ts);
    d.setDate(d.getDate() - Math.max(1, days));
    return d.getTime();
  };
  return { start: back(start), end: back(end) };
}

/** A pump's part in the report: where it is, its fuel, its buckets over the window and its sums over the previous window. */
export interface ReportPump {
  id: string;
  /** Its name as the dashboards show it (its label, else its device name). */
  name: string;
  fuelType: string;
  station: string;
  site: string;
  buckets: ReportBucket[];
  previous: ReportPrevious;
  /** Its buckets over the previous window (the running total's dashed line). */
  previousBuckets: ReportBucket[];
}

/** Who took the fuel over the window: litres by user code and by vehicle code (from the dispense events). */
export interface ReportPeople {
  users: Map<string, number>;
  vehicles: Map<string, number>;
  /** Their dispenses, by the same codes. */
  userDispenses: Map<string, number>;
  vehicleDispenses: Map<string, number>;
}

/** A denial over the window (a dispense event of the "denied" group): when, at which pump, why and with which codes. */
export interface ReportDenial {
  id: string;
  ts: number;
  pump: string;
  /** Its reason, as the Activity page names it ("Unknown user"), and its pill's icon and tone there (`EVENT_META`). */
  label: string;
  icon: string;
  tone: StatusPillTone;
  userCode: string;
  vehicleCode: string;
}

/**
 * The Reports page's folded sections ("Days 6", "Pumps", "Users", "Vehicles", "Denials"): each a table's rows, worked out once with the
 * report. `slots` are the window's days with anything in them (its hours, a day's window); `loading`: the totals, the events not in.
 */
export interface ReportDetails {
  slots: Record<string, unknown>[];
  pumps: Record<string, unknown>[];
  users: Record<string, unknown>[] | null;
  vehicles: Record<string, unknown>[] | null;
  denials: Record<string, unknown>[];
  loadingTotals: boolean;
  loadingEvents: boolean;
}

export interface FuelReportInput {
  /** The window: its first day's local midnight, its end, and how many days (1: that day, by hour). */
  start: number;
  end: number;
  /** It runs to now (not a custom range): its "vs last" is to the same time of day. */
  toNow: boolean;
  days: number;
  /** Its buckets are hours (a day's window, or any up to {@link REPORT_HOURLY_MAX_DAYS}); else days. */
  hourly: boolean;
  pumps: ReportPump[];
  /** Who: null while it loads. */
  people: ReportPeople | null;
  /** The denials over the window: null while they load. */
  denials: ReportDenial[] | null;
  /** The window's dispenses, one by one (their sizes, each user's and vehicle's course): null while they load. */
  dispenses: ReportDispense[] | null;
  /** The previous window's dispenses (the users' and vehicles' "vs last", their rank changes): null while they load. */
  previousDispenses: ReportDispense[] | null;
  /** The volumes' unit: litres, or US gallons. */
  unit: ReportUnit;
  /** When the totals were read (the strip's "As of …"); none: not said. */
  readAt?: number;
  /**
   * The window's events are all read only from here on (a pump had more than a report reads — its older ones left out): the users,
   * vehicles, denials and sizes cover from then, and the page says so. None: all of them.
   */
  eventsFrom?: number | null;
  /** The code lists picked (none: both) — the Top users / Top vehicles cards. */
  kinds: CodeKind[];
  /** The totals are still loading ("…"). */
  loading: boolean;
  /** A code's holder by name ("" unknown). */
  holder: (kind: CodeKind, code: string) => string;
}

/** The longest window read by the hour (the by-hour chart needs hours); a longer one is read by the day. */
export const REPORT_HOURLY_MAX_DAYS = 93;

/**
 * The fuel types in the charts' and cards' order, each with its slot of the
 * chart palette — a colour follows its fuel type: the known ones, then
 * "Other" (none set, or one not listed).
 */
const FUELS = [...FUEL_TYPES, "Other"].map((name, i) => ({ name, color: `var(--c-chart-${Math.min(i + 1, 5)})` }));

const DAY_MS = 24 * 3600 * 1000;
/** A volume as shown (in the report's unit): a decimal under 100. */
const vol = (l: number) => fmtNumber(l, l > 0 && l < 100 && !Number.isInteger(l) ? 1 : 0);
const share = (part: number, whole: number) => (whole ? ` · ${Math.round((part / whole) * 100)}%` : "");

/** The report from the window's stored totals (and who took the fuel): every card and chart adds up to the same totals. */
export function buildFuelReport(input: FuelReportInput): FuelReport {
  const { start, end, toNow, days, hourly, denials, kinds, loading } = input;
  // Every volume in the report's unit (litres, or US gallons) from the start: the cards, charts and tables add up the same.
  const k = input.unit === "gal" ? GALLONS_PER_LITRE : 1;
  const U = input.unit === "gal" ? "gal" : "L";
  const scaled = (b: ReportBucket): ReportBucket => ({ ...b, litres: b.litres * k });
  const pumps: ReportPump[] = input.pumps.map((p) => ({
    ...p,
    buckets: p.buckets.map(scaled),
    previousBuckets: p.previousBuckets.map(scaled),
    previous: { ...p.previous, litres: p.previous.litres * k },
  }));
  const scaledMap = (m: Map<string, number>) => new Map([...m].map(([c, v]) => [c, v * k] as [string, number]));
  const people: ReportPeople | null = input.people && { ...input.people, users: scaledMap(input.people.users), vehicles: scaledMap(input.people.vehicles) };
  const dispenseList = input.dispenses?.map((d) => ({ ...d, volume: d.volume * k })) ?? null;
  const previousList = input.previousDispenses?.map((d) => ({ ...d, volume: d.volume * k })) ?? null;
  const dayWindow = days <= 1;
  // The window's buckets, in the viewer's zone: a day's hours, else its days.
  const dayStarts = Array.from({ length: Math.max(1, days) }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d.getTime();
  });
  const labels = dayWindow
    ? Array.from({ length: 24 }, (_, h) => formatClockTime(new Date(start).setHours(h), true))
    : dayStarts.map((ts) => formatShortDate(ts));
  // What a slot is ("hour", "day"), and one named as a reader would ("2 PM", "Tue, Nov 10").
  const slot = dayWindow ? "hour" : "day";
  const slotLabel = (i: number) =>
    dayWindow ? labels[i] : `${new Date(dayStarts[i]).toLocaleDateString("en-US", { weekday: "short" })}, ${formatShortDate(dayStarts[i])}`;
  // A slot's bounds: its start, and the next one's (the day after, the hour after).
  const slotStart = (i: number) => (dayWindow ? new Date(start).setHours(i, 0, 0, 0) : dayStarts[i]);
  const slotEnd = (i: number) => {
    if (dayWindow) {
      return new Date(start).setHours(i + 1, 0, 0, 0);
    }
    const d = new Date(dayStarts[i]);
    d.setDate(d.getDate() + 1);
    return d.getTime();
  };
  // A ranked line's trend: the slots gathered into periods, a dozen or so bars at most — a day's hours in twos, up to two weeks'
  // days, up to fourteen weeks' weeks (seven days from the window's first), months past that.
  const trendPeriods = ((): { noun: string; periods: { label: string; slots: number[] }[] } => {
    const count = labels.length;
    const chunks = (size: number, label: (first: number, last: number) => string) =>
      Array.from({ length: Math.ceil(count / size) }, (_, c) => {
        const slots = Array.from({ length: Math.min(size, count - c * size) }, (_, k) => c * size + k);
        return { label: label(slots[0], slots[slots.length - 1]), slots };
      });
    if (dayWindow) {
      return { noun: "2 hours", periods: chunks(2, (a, b) => `${formatClockTime(slotStart(a), true)} – ${formatClockTime(slotEnd(b), true)}`) };
    }
    if (count <= 14) {
      return { noun: "day", periods: chunks(1, (a) => slotLabel(a)) };
    }
    if (count <= 98) {
      return { noun: "week", periods: chunks(7, (a) => `the week of ${formatShortDate(dayStarts[a])}`) };
    }
    const years = new Set(dayStarts.map((ts) => new Date(ts).getFullYear())).size;
    const months = new Map<string, { label: string; slots: number[] }>();
    dayStarts.forEach((ts, i) => {
      const d = new Date(ts);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const month = months.get(key) ?? { label: d.toLocaleDateString("en-US", years > 1 ? { month: "long", year: "numeric" } : { month: "long" }), slots: [] };
      month.slots.push(i);
      months.set(key, month);
    });
    return { noun: "month", periods: [...months.values()] };
  })();
  const slotOf = (ts: number): number => {
    if (dayWindow) {
      return Math.floor((ts - start) / 3600000);
    }
    // The last day that starts at or before it.
    for (let i = dayStarts.length - 1; i >= 0; i--) {
      if (ts >= dayStarts[i]) {
        return ts < dayStarts[i] + DAY_MS + 3600000 ? i : -1;
      }
    }
    return -1;
  };

  const fuelOf = (p: ReportPump) => (FUEL_TYPES.includes(p.fuelType) ? p.fuelType : "Other");
  const perFuel = new Map(FUELS.map((f) => [f.name, labels.map(() => 0)]));
  const fuelTotals = new Map<string, number>();
  const byStation = new Map<string, number>();
  const bySite = new Map<string, number>();
  const byHour = Array.from({ length: 24 }, () => 0);
  let total = 0;
  let dispenses = 0;
  let denied = 0;
  const before = { ...NO_REPORT_PREVIOUS };
  // Each slot's and each pump's dispenses and denials too (the folded sections' tables).
  const slotDispenses = labels.map(() => 0);
  const slotDenied = labels.map(() => 0);
  const pumpSums = new Map<string, { litres: number; dispenses: number; denied: number }>();
  // Each slot's pumps dispensing, each station's and site's fuel a slot (their rows' trends), the hours' fuel (the shifts) and the
  // week's hours' dispenses (the weekday × hour map).
  const slotPumps = labels.map(() => new Set<string>());
  const stationSlots = new Map<string, number[]>();
  const siteSlots = new Map<string, number[]>();
  const addTo = (m: Map<string, number[]>, key: string, slot: number, v: number) => {
    const list = m.get(key) ?? labels.map(() => 0);
    list[slot] += v;
    m.set(key, list);
  };
  const hourLitres = Array.from({ length: 24 }, () => 0);
  const weekHour = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  for (const p of pumps) {
    const fuel = fuelOf(p);
    const mine = { litres: 0, dispenses: 0, denied: 0 };
    pumpSums.set(p.id, mine);
    before.litres += p.previous.litres;
    before.dispenses += p.previous.dispenses;
    before.denied += p.previous.denied;
    for (const b of p.buckets) {
      const slot = slotOf(b.ts);
      if (slot < 0 || slot >= labels.length) {
        continue;
      }
      perFuel.get(fuel)![slot] += b.litres;
      fuelTotals.set(fuel, (fuelTotals.get(fuel) ?? 0) + b.litres);
      byStation.set(p.station || "No station", (byStation.get(p.station || "No station") ?? 0) + b.litres);
      if (p.site) {
        bySite.set(p.site, (bySite.get(p.site) ?? 0) + b.litres);
      }
      if (hourly) {
        byHour[new Date(b.ts).getHours()] += b.dispenses;
      }
      total += b.litres;
      dispenses += b.dispenses;
      denied += b.denied;
      slotDispenses[slot] += b.dispenses;
      slotDenied[slot] += b.denied;
      mine.litres += b.litres;
      mine.dispenses += b.dispenses;
      mine.denied += b.denied;
      if (b.litres > 0) {
        slotPumps[slot].add(p.id);
      }
      addTo(stationSlots, p.station || "No station", slot, b.litres);
      if (p.site) {
        addTo(siteSlots, p.site, slot, b.litres);
      }
      if (hourly) {
        const at = new Date(b.ts);
        hourLitres[at.getHours()] += b.litres;
        weekHour[(at.getDay() + 6) % 7][at.getHours()] += b.dispenses;
      }
    }
  }
  // The period before by the same slots (its buckets moved forward by the window's days): the running total's dashed line.
  const forward = (ts: number) => {
    const d = new Date(ts);
    d.setDate(d.getDate() + Math.max(1, days));
    return d.getTime();
  };
  const prevSlotLitres = labels.map(() => 0);
  for (const p of pumps) {
    for (const b of p.previousBuckets) {
      const slot = slotOf(forward(b.ts));
      if (slot >= 0 && slot < labels.length) {
        prevSlotLitres[slot] += b.litres;
      }
    }
  }

  const change = before.litres ? (total - before.litres) / before.litres : null;
  const now = Date.now();
  const largest = (sums: Map<string, number>, count: number) => [...sums].filter(([, l]) => l > 0).sort((a, b) => b[1] - a[1]).slice(0, count);
  const percent = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "");
  // A card's lines while they're read: placeholders (as many as it'll show), never a "Loading…" line.
  const placeholders = (count: number): SummaryRow[] => Array.from({ length: count }, (_, i) => ({ label: `${i}`, value: "" }));
  // A ranked card ("Top …", "By …"): each line's share of all the fuel muted before its litres, its bar against the list's largest.
  // Each line its course over the window (`trendOf`: a value a slot — small bars) and its move since the period before (`moveOf`).
  const ranked = (
    id: string,
    title: string,
    list: [string, number][],
    waiting: boolean,
    label: (k: string) => string = (k) => k,
    info?: string,
    trendOf?: (k: string) => number[] | undefined,
    moveOf?: (k: string, place: number) => number | "new" | undefined
  ): SummaryCard => {
    if (waiting) {
      return { id, title, info, wireframe: true, rows: placeholders(5) };
    }
    if (!list.length) {
      return { id, title, info, rows: [{ label: "No dispenses", value: "" }] };
    }
    const top = list[0][1];
    // A trend's bubble: what a bar is, and its busiest one ("Fuel per week · busiest the week of Nov 3: 62,000 L").
    const trendTip = (trend: number[] | undefined) => {
      const peak = trend?.length ? trend.reduce((at, v, i) => (v > trend[at] ? i : at), 0) : -1;
      return trend && peak >= 0 && trend[peak] > 0
        ? `Fuel per ${trendPeriods.noun} · busiest ${trendPeriods.periods[peak].label}: ${vol(trend[peak])} ${U}`
        : undefined;
    };
    return {
      id,
      title,
      info,
      rows: list.map(([key, l], place) => {
        const slots = trendOf?.(key);
        const trend = slots && trendPeriods.periods.map((p) => p.slots.reduce((sum, i) => sum + (slots[i] ?? 0), 0));
        return {
          label: label(key),
          meta: percent(l, total),
          value: vol(l),
          unit: U,
          share: top ? l / top : 0,
          trend,
          trendTip: trendTip(trend),
          rankChange: moveOf?.(key, place),
        };
      }),
    };
  };
  // Who took the fuel, a slot at a time (their lines' trends), and the period before's ranking (their moves).
  const bySlot = (codeOf: (d: ReportDispense) => string) => {
    const m = new Map<string, number[]>();
    for (const d of dispenseList ?? []) {
      const slot = slotOf(d.ts);
      const code = codeOf(d);
      if (code && slot >= 0 && slot < labels.length) {
        addTo(m, code, slot, d.volume);
      }
    }
    return m;
  };
  const userSlots = bySlot((d) => d.userCode);
  const vehicleSlots = bySlot((d) => d.vehicleCode);
  const previousBy = (codeOf: (d: ReportDispense) => string) => {
    const m = new Map<string, number>();
    for (const d of previousList ?? []) {
      const code = codeOf(d);
      if (code) {
        m.set(code, (m.get(code) ?? 0) + d.volume);
      }
    }
    return m;
  };
  const previousUsers = previousBy((d) => d.userCode);
  const previousVehicles = previousBy((d) => d.vehicleCode);
  const moveIn = (before: Map<string, number>) => {
    const order = largest(before, 100000).map(([code]) => code);
    return (code: string, place: number): number | "new" | undefined => {
      if (!previousList) {
        return undefined;
      }
      const was = order.indexOf(code);
      return was < 0 ? "new" : was - place;
    };
  };
  const fuels = FUELS.filter((f) => (fuelTotals.get(f.name) ?? 0) > 0);
  const named = (kind: CodeKind) => (code: string) => {
    const name = input.holder(kind, code);
    return name ? `${name} (${code})` : code;
  };
  const picked = kinds.length ? kinds : (["users", "vehicles"] as CodeKind[]);

  // The figures strip: each slot's litres (every fuel), the best one and the active ones.
  const slotLitres = labels.map((_, i) => FUELS.reduce((sum, f) => sum + perFuel.get(f.name)![i], 0));
  const best = slotLitres.reduce((at, l, i) => (l > (slotLitres[at] ?? 0) ? i : at), 0);
  const active = slotLitres.filter((l) => l > 0).length;
  const pumpsDispensing = pumps.filter((p) => p.buckets.some((b) => b.litres > 0)).length;
  const attempts = dispenses + denied;
  const figures: FuelReport["figures"] = {
    loading,
    headline: {
      label: "Fuel dispensed",
      value: vol(total),
      unit: U,
      note: toNow && input.readAt ? `As of ${formatClockTime(input.readAt)} · totals stored every 2 min` : undefined,
      // Less fuel than the period before is good: down green, up red, about the same neutral.
      change:
        change === null
          ? { text: "— vs previous period", direction: "flat" }
          : {
              text: `${change >= 0 ? "+" : "−"}${Math.abs(change * 100).toFixed(1)}% vs previous period`,
              direction: change > 0.0005 ? "up" : change < -0.0005 ? "down" : "flat",
              tone: change > 0.0005 ? "error" : change < -0.0005 ? "success" : "neutral",
            },
      trend: slotLitres.map((l) => Math.round(l * 10) / 10),
    },
    items: [
      { label: "Dispenses", value: fmtNumber(dispenses) },
      { label: "Avg per dispense", value: dispenses ? fmtNumber(total / dispenses, 1) : "—", unit: dispenses ? U : "" },
      // Denials and timeouts, against every attempt.
      { label: "Denied", value: fmtNumber(denied), note: attempts ? `${Math.round((denied / attempts) * 100)}% of attempts` : "" },
      {
        label: dayWindow ? "Busiest hour" : "Best day",
        value: active ? vol(slotLitres[best]) : "—",
        unit: active ? U : "",
        note: active ? labels[best] : "",
      },
      {
        label: `Avg per active ${slot}`,
        value: active ? vol(total / active) : "—",
        unit: active ? U : "",
        note: active ? `${active} active ${slot}${active === 1 ? "" : "s"}` : "",
      },
      { label: "Pumps dispensing", value: fmtNumber(pumpsDispensing), unit: pumps.length ? `of ${fmtNumber(pumps.length)}` : "" },
    ],
  };

  const summary: SummaryCard[] = [
    {
      id: "fuelTypes",
      title: "By fuel type",
      wireframe: loading,
      // The split as one bar under its title: each fuel as wide as its share.
      composition: !loading && total ? fuels.map((f) => ({ label: f.name, color: f.color, share: (fuelTotals.get(f.name) ?? 0) / total })) : undefined,
      rows: loading
        ? placeholders(3)
        : fuels.length
          ? fuels.map((f) => ({ label: f.name, swatch: f.color, value: vol(fuelTotals.get(f.name) ?? 0), unit: `${U}${share(fuelTotals.get(f.name) ?? 0, total)}` }))
          : [{ label: "No dispenses", value: "" }],
    },
    ranked("sites", "Top sites", largest(bySite, 5), loading, (key) => key, undefined, (key) => siteSlots.get(key)),
    ...(picked.includes("users")
      ? [ranked("users", "Top users", largest(people?.users ?? new Map(), 5), !people, named("users"), undefined, (key) => userSlots.get(key), moveIn(previousUsers))]
      : []),
    ...(picked.includes("vehicles")
      ? [
          ranked(
            "vehicles",
            "Top vehicles",
            largest(people?.vehicles ?? new Map(), 5),
            !people,
            named("vehicles"),
            undefined,
            (key) => vehicleSlots.get(key),
            moveIn(previousVehicles)
          ),
        ]
      : []),
  ];

  // This period against the last: the previous window named ("Yesterday", "Oct 30 – Nov 5"; to now: "… to 2:15 PM").
  const prev = previousReportWindow(start, end, days);
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const prevLast = toNow ? prev.end : prev.end - 1;
  const prevName =
    days <= 1
      ? start === todayStart
        ? "Yesterday"
        : formatShortDate(prev.start)
      : `${formatShortDate(prev.start)} – ${formatShortDate(prevLast)}`;
  const prevLabel = toNow ? `${prevName} to ${formatClockTime(prev.end)}` : prevName;
  const delta = (now: number, was: number) => (was ? `${now >= was ? "+" : "−"}${Math.abs(((now - was) / was) * 100).toFixed(1)}%` : "—");
  const versus: StatItem[] = [
    { label: "Fuel dispensed", value: vol(total), unit: U, note: delta(total, before.litres), caption: `${prevLabel}: ${vol(before.litres)} ${U}` },
    { label: "Dispenses", value: fmtNumber(dispenses), note: delta(dispenses, before.dispenses), caption: `${prevLabel}: ${fmtNumber(before.dispenses)}` },
    { label: "Denied", value: fmtNumber(denied), note: delta(denied, before.denied), caption: `${prevLabel}: ${fmtNumber(before.denied)}` },
  ];

  // The folded sections' rows: each figure as shown, with the number it sorts by.
  const num = (n: number) => fmtNumber(n);
  const slotRows = labels
    .map((label, i) => ({
      id: `slot-${i}`,
      slot: dayWindow ? label : formatShortDate(dayStarts[i]),
      slotSort: i,
      litres: vol(slotLitres[i]),
      litresSort: slotLitres[i],
      dispenses: num(slotDispenses[i]),
      dispensesSort: slotDispenses[i],
      denied: num(slotDenied[i]),
      deniedSort: slotDenied[i],
      average: slotDispenses[i] ? `${fmtNumber(slotLitres[i] / slotDispenses[i], 1)} ${U}` : "—",
      averageSort: slotDispenses[i] ? slotLitres[i] / slotDispenses[i] : -1,
    }))
    .filter((r, i) => slotLitres[i] > 0 || slotDispenses[i] > 0 || slotDenied[i] > 0);
  // Each figure against the period before's: "+12%", "New" (none then), "—" (none either time) — sorting by the change.
  // Against the period before, and its pill's tone: more fuel red, less green, about the same neutral (the headline's chip's
  // rule); none the period before, "New" in the brand blue; nothing to compare, no pill ("—").
  const versusLast = (now: number, was: number | undefined): { text: string; sort: number; tone: StatusPillTone | null } => {
    if (was === undefined) {
      return { text: "—", sort: -Number.MAX_SAFE_INTEGER, tone: null };
    }
    if (!was) {
      return now > 0 ? { text: "New", sort: Number.MAX_SAFE_INTEGER, tone: "brand" } : { text: "—", sort: -Number.MAX_SAFE_INTEGER, tone: null };
    }
    const c = (now - was) / was;
    const pct = Math.round(Math.abs(c * 100));
    return { text: `${c >= 0 ? "+" : "−"}${pct}%`, sort: c, tone: pct === 0 ? "neutral" : c > 0 ? "error" : "success" };
  };
  // The window to now (the rest of it still to come), and from when its events are all read (a long window's, in part).
  const shownTo = Math.min(end, now);
  const eventsFrom = input.eventsFrom ? Math.min(shownTo, Math.max(start, input.eventsFrom)) : start;
  const windowEnd = Math.max(shownTo, slotEnd(labels.length - 1));
  const pumpRows = pumps
    .map((p) => {
      const sums = pumpSums.get(p.id) ?? { litres: 0, dispenses: 0, denied: 0 };
      const vs = versusLast(sums.litres, p.previous.litres);
      return {
        id: p.id,
        pump: p.name,
        station: p.station || "—",
        site: p.site || "—",
        fuel: fuelOf(p),
        litres: vol(sums.litres),
        litresSort: sums.litres,
        dispenses: num(sums.dispenses),
        dispensesSort: sums.dispenses,
        denied: num(sums.denied),
        deniedSort: sums.denied,
        vsLast: vs.text,
        vsLastSort: vs.sort,
        vsLastTone: vs.tone,
      };
    })
    .sort((a, b) => b.litresSort - a.litresSort || a.pump.localeCompare(b.pump, undefined, { numeric: true }));
  const holderRows = (fuel: Map<string, number>, counts: Map<string, number>, label: (code: string) => string, before: Map<string, number>) =>
    [...new Set([...fuel.keys(), ...counts.keys()])]
      .map((code) => {
        const vs = versusLast(fuel.get(code) ?? 0, previousList ? (before.get(code) ?? 0) : undefined);
        return {
          id: code,
          holder: label(code),
          litres: vol(fuel.get(code) ?? 0),
          litresSort: fuel.get(code) ?? 0,
          dispenses: num(counts.get(code) ?? 0),
          dispensesSort: counts.get(code) ?? 0,
          vsLast: vs.text,
          vsLastSort: vs.sort,
          vsLastTone: vs.tone,
        };
      })
      .sort((a, b) => b.litresSort - a.litresSort || a.holder.localeCompare(b.holder));
  const details: ReportDetails = {
    slots: slotRows,
    pumps: pumpRows,
    users: picked.includes("users") ? (people ? holderRows(people.users, people.userDispenses, named("users"), previousUsers) : []) : null,
    vehicles: picked.includes("vehicles") ? (people ? holderRows(people.vehicles, people.vehicleDispenses, named("vehicles"), previousVehicles) : []) : null,
    denials: (denials ?? [])
      .map((d) => ({
        id: d.id,
        time: formatDateTime(d.ts),
        timeSort: d.ts,
        pump: d.pump,
        reason: d.label,
        icon: d.icon,
        tone: d.tone,
        user: d.userCode ? named("users")(d.userCode) : "—",
        vehicle: d.vehicleCode ? named("vehicles")(d.vehicleCode) : "—",
      }))
      .sort((a, b) => b.timeSort - a.timeSort),
    loadingTotals: loading,
    // The users' and vehicles' "vs last" come with the events (the period before's too).
    loadingEvents: !people || !denials || !previousList,
  };

  const insights = fuelInsights({
    total,
    dispenses,
    denied,
    before,
    pumps,
    pumpSums,
    byStation,
    byHour: hourly ? byHour : null,
    dayStarts: dayWindow ? null : dayStarts,
    slotLitres,
    end,
    people,
    denials,
    picked,
    largest,
    percent,
  });

  // The strip for each slot hovered: its fuel against the average active slot, its dispenses, denials, share, rank and pumps.
  const average = active ? total / active : 0;
  const order = slotLitres
    .map((l, i) => [l, i] as [number, number])
    .filter(([l]) => l > 0)
    .sort((a, b) => b[0] - a[0])
    .map(([, i]) => i);
  const slotFigures = labels.map((_, i) => {
    const l = slotLitres[i];
    const d = slotDispenses[i];
    const x = slotDenied[i];
    const place = order.indexOf(i);
    const vsAverage = average && l > 0 ? (l - average) / average : null;
    const headline: StatHeadline = {
      label: `Fuel dispensed · ${slotLabel(i)}`,
      value: vol(l),
      unit: U,
      change:
        vsAverage === null
          ? { text: `Nothing this ${slot}`, direction: "flat" }
          : {
              text: `${vsAverage >= 0 ? "+" : "−"}${Math.abs(vsAverage * 100).toFixed(0)}% vs average ${slot}`,
              direction: vsAverage > 0.005 ? "up" : vsAverage < -0.005 ? "down" : "flat",
            },
      trend: figures.headline.trend,
      // The window's "As of …" kept, so the strip keeps its height as a bar is hovered.
      note: figures.headline.note,
    };
    const items: StatItem[] = [
      { label: "Dispenses", value: fmtNumber(d) },
      { label: "Avg per dispense", value: d ? fmtNumber(l / d, 1) : "—", unit: d ? U : "" },
      { label: "Denied", value: fmtNumber(x), note: d + x ? `${Math.round((x / (d + x)) * 100)}% of attempts` : "" },
      { label: "Share of period", value: total ? `${Math.round((l / total) * 100)}%` : "—" },
      { label: `Rank among ${slot}s`, value: place >= 0 ? fmtNumber(place + 1) : "—", unit: place >= 0 ? `of ${fmtNumber(order.length)}` : "" },
      { label: "Pumps dispensing", value: fmtNumber(slotPumps[i].size), unit: pumps.length ? `of ${fmtNumber(pumps.length)}` : "" },
    ];
    return { headline, items };
  });

  // The running total, this period and the one before by the same slots (to now): a point at each slot's end, from zero.
  const runningPoints = (values: number[]) => {
    const points = [{ ts: start, value: 0 }];
    let sum = 0;
    values.forEach((v, i) => {
      if (slotStart(i) < shownTo) {
        sum += v;
        points.push({ ts: Math.min(slotEnd(i), shownTo), value: Math.round(sum * 10) / 10 });
      }
    });
    return points;
  };
  const running: FuelReport["running"] = {
    xMin: start,
    xMax: windowEnd,
    series: [
      { name: "This period", color: "var(--c-chart-1)", data: runningPoints(slotLitres) },
      { name: "Period before", color: "var(--c-chart-2)", dashed: true, data: runningPoints(prevSlotLitres) },
    ],
  };

  // How large the dispenses were: a count in each band (in the report's unit).
  const bands = input.unit === "gal" ? [5, 15, 25, 50] : [20, 50, 100, 200];
  const sizeCounts = [0, 0, 0, 0, 0];
  for (const d of dispenseList ?? []) {
    sizeCounts[bands.filter((b) => d.volume >= b).length] += 1;
  }
  const sizes: FuelReport["sizes"] = {
    loading: !dispenseList,
    categories: [`Under ${bands[0]} ${U}`, ...bands.slice(0, -1).map((b, i) => `${b}–${bands[i + 1]} ${U}`), `${bands[bands.length - 1]} ${U}+`],
    series: [{ name: "Dispenses", color: "var(--c-chart-1)", data: sizeCounts }],
  };

  // By shift (a window read by the hour): its hours' fuel — Day 6 AM – 2 PM, Evening 2 PM – 10 PM, Night 10 PM – 6 AM.
  const shiftLitres = [0, 0, 0];
  hourLitres.forEach((l, h) => (shiftLitres[h >= 6 && h < 14 ? 0 : h >= 14 && h < 22 ? 1 : 2] += l));
  const shiftTop = Math.max(...shiftLitres);
  const byShift: SummaryCard | null = hourly
    ? {
        id: "shifts",
        title: "By shift",
        info: "Day 6 AM – 2 PM, Evening 2 PM – 10 PM, Night 10 PM – 6 AM",
        wireframe: loading,
        rows: loading
          ? placeholders(3)
          : total
            ? ["Day", "Evening", "Night"].map((name, i) => ({
                label: name,
                meta: percent(shiftLitres[i], total),
                value: vol(shiftLitres[i]),
                unit: U,
                share: shiftTop ? shiftLitres[i] / shiftTop : 0,
              }))
            : [{ label: "No dispenses", value: "" }],
      }
    : null;

  const hours = Array.from({ length: 24 }, (_, h) => formatClockTime(new Date(start).setHours(h), true));

  return {
    unit: U,
    slotFigures,
    running,
    sizes,
    byShift,
    // A week or more read by the hour: dispenses by weekday and hour.
    weekHour: hourly && days >= 7 ? { rows: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], columns: hours, values: weekHour } : null,
    insights,
    insightsLoading: loading || !people || !denials,
    eventsNote:
      eventsFrom > start
        ? `This window has more pump events than a report reads: users, vehicles, denials and dispense sizes cover ${formatDateTime(eventsFrom)} on. The totals cover all of it.`
        : null,
    details,
    versus,
    figures,
    summary,
    overTime: {
      titles: labels.map((_, i) => (dayWindow ? `${formatClockTime(slotStart(i), true)} – ${formatClockTime(slotEnd(i), true)}` : slotLabel(i))),
      categories: labels,
      series: fuels.map((f) => ({ name: f.name, color: f.color, data: perFuel.get(f.name)!.map((l) => Math.round(l * 10) / 10) })),
    },
    byStation: ranked(
      "stations",
      "By station",
      largest(byStation, 10),
      loading,
      (key) => key,
      `${U === "gal" ? "Gallons" : "Litres"} dispensed at each station's pumps`,
      (key) => stationSlots.get(key)
    ),
    byHour: hourly
      ? {
          categories: hours,
          series: [{ name: "Dispenses", color: "var(--c-chart-1)", data: byHour }],
        }
      : null,
  };
}

/** What {@link fuelInsights} reads: the report's sums as {@link buildFuelReport} has worked them out. */
interface InsightInput {
  total: number;
  dispenses: number;
  denied: number;
  before: ReportPrevious;
  pumps: ReportPump[];
  pumpSums: Map<string, { litres: number; dispenses: number; denied: number }>;
  byStation: Map<string, number>;
  /** Dispenses by hour of day (a window read by the hour), else null. */
  byHour: number[] | null;
  /** The window's days' starts (a window of days), else null. */
  dayStarts: number[] | null;
  slotLitres: number[];
  end: number;
  people: ReportPeople | null;
  denials: ReportDenial[] | null;
  picked: CodeKind[];
  largest: (sums: Map<string, number>, count: number) => [string, number][];
  percent: (part: number, whole: number) => string;
}

/** Ten in a hundred: a share worth saying. */
const NOTABLE_SHARE = 0.1;

/**
 * The Reports page's insights — what stands out in the window, by fixed rules over what's read (no model): denials up on the period
 * before (or a large share of attempts), where and why; a pump that dispensed nothing (or hasn't since a date); a few vehicles or users
 * taking most of the fuel; one station dispensing most of it; the night's share of the dispenses; the busiest weekday. Warnings first,
 * four at most; nothing standing out, one card saying so.
 */
export function fuelInsights(i: InsightInput): Insight[] {
  const warnings: Insight[] = [];
  const notes: Insight[] = [];
  const share = (part: number, whole: number) => i.percent(part, whole);
  const topOf = <K>(counts: Map<K, number>): [K, number] | null => [...counts].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])[0] ?? null;

  // Denials: up on the period before, or a large share of the attempts — where most were, and why.
  if (i.denied >= 3) {
    const bySite = new Map<string, number>();
    for (const p of i.pumps) {
      const place = p.site || p.station;
      if (place) {
        bySite.set(place, (bySite.get(place) ?? 0) + (i.pumpSums.get(p.id)?.denied ?? 0));
      }
    }
    const reasons = new Map<string, number>();
    (i.denials ?? []).forEach((d) => reasons.set(d.label, (reasons.get(d.label) ?? 0) + 1));
    const where = topOf(bySite)?.[0];
    const why = topOf(reasons)?.[0];
    const tail = `${where ? ` at ${where}` : ""}${why ? `, mostly ${why}` : ""}`;
    const up = i.before.denied ? (i.denied - i.before.denied) / i.before.denied : null;
    const attempts = i.denied + i.dispenses;
    if (up !== null && up >= 0.25) {
      warnings.push({ id: "denials", icon: "block", tone: "warning", text: `Denials up ${Math.round(up * 100)}%${tail}`, target: "denials" });
    } else if (!i.before.denied) {
      warnings.push({ id: "denials", icon: "block", tone: "warning", text: `${fmtNumber(i.denied)} denials, none the period before${tail}`, target: "denials" });
    } else if (attempts && i.denied / attempts >= NOTABLE_SHARE) {
      warnings.push({ id: "denials", icon: "block", tone: "warning", text: `1 in ${Math.round(attempts / i.denied)} attempts was denied${tail}`, target: "denials" });
    }
  }

  // A pump that dispensed nothing while the others did — else the one that hasn't for longest (two days or more, a window of days).
  if (i.total > 0) {
    const idle = i.pumps.filter((p) => !(i.pumpSums.get(p.id)?.litres ?? 0));
    if (idle.length === 1) {
      const p = idle[0];
      warnings.push({ id: "idle", icon: "pause_circle", tone: "warning", text: `${p.name}${p.site ? ` at ${p.site}` : ""} dispensed nothing this period`, target: "pumps" });
    } else if (idle.length > 1) {
      warnings.push({ id: "idle", icon: "pause_circle", tone: "warning", text: `${idle.length} pumps dispensed nothing this period`, target: "pumps" });
    } else if (i.dayStarts) {
      const stale = i.pumps
        .map((p) => ({ p, last: Math.max(0, ...p.buckets.filter((b) => b.litres > 0).map((b) => b.ts)) }))
        .filter((x) => x.last && i.end - x.last >= 2 * DAY_MS)
        .sort((a, b) => a.last - b.last)[0];
      if (stale) {
        warnings.push({ id: "idle", icon: "pause_circle", tone: "warning", text: `${stale.p.name} hasn't dispensed since ${formatShortDate(stale.last)}`, target: "pumps" });
      }
    }
  }

  // A few vehicles (else users) taking most of the fuel.
  if (i.people && i.total > 0) {
    const lists: [CodeKind, Map<string, number>, string][] = [
      ["vehicles", i.people.vehicles, "vehicles"],
      ["users", i.people.users, "users"],
    ];
    for (const [kind, litresOf, noun] of lists) {
      const list = i.largest(litresOf, 1000);
      const top = list.slice(0, 3).reduce((sum, [, l]) => sum + l, 0);
      if (i.picked.includes(kind) && list.length >= 5 && top / i.total >= 0.4) {
        notes.push({ id: "few", icon: kind === "vehicles" ? "local_shipping" : "groups", tone: "info", text: `3 ${noun} took ${share(top, i.total)} of the fuel`, target: kind });
        break;
      }
    }
  }

  // One station dispensing most of it.
  const stations = i.largest(i.byStation, 100);
  if (stations.length >= 2 && stations[0][1] / i.total >= 0.5) {
    notes.push({ id: "station", icon: "local_gas_station", tone: "info", text: `${stations[0][0]} dispensed ${share(stations[0][1], i.total)} of the fuel`, target: "pumps" });
  }

  // The night's share of the dispenses (10 PM – 5 AM), a window read by the hour.
  if (i.byHour && i.dispenses >= 10) {
    const night = [22, 23, 0, 1, 2, 3, 4].reduce((sum, h) => sum + (i.byHour![h] ?? 0), 0);
    if (night / i.dispenses >= NOTABLE_SHARE) {
      notes.push({ id: "night", icon: "dark_mode", tone: "info", text: `${share(night, i.dispenses)} of dispenses were at night (10 PM – 5 AM)`, target: "slots" });
    }
  }

  // The busiest weekday, a window of two weeks or more.
  if (i.dayStarts && i.dayStarts.length >= 14 && i.total > 0) {
    const byDay = new Map<number, number>();
    i.dayStarts.forEach((ts, d) => byDay.set(new Date(ts).getDay(), (byDay.get(new Date(ts).getDay()) ?? 0) + (i.slotLitres[d] ?? 0)));
    const top = topOf(byDay);
    if (top && top[1] / i.total >= 0.2) {
      const day = i.dayStarts.find((ts) => new Date(ts).getDay() === top[0]) ?? 0;
      const name = new Date(day).toLocaleDateString("en-US", { weekday: "long" });
      notes.push({ id: "weekday", icon: "calendar_month", tone: "info", text: `Most fuel goes out on ${name}s (${share(top[1], i.total)})`, target: "slots" });
    }
  }

  const all = [...warnings, ...notes].slice(0, 4);
  if (all.length) {
    return all;
  }
  return [{ id: "quiet", icon: "check_circle", tone: "success", text: i.total > 0 ? "Nothing unusual this period" : "No dispenses this period" }];
}
