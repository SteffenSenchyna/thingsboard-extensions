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
import { formatClockTime, formatShortDate } from "../../../components/shared/time-format";
import { fmtNumber } from "../../../components/shared/value-utils";
import { CodeKind, FUEL_TYPES } from "../../models/fuel-management.models";

/** The Reports page: its cards and its charts. */
export interface FuelReport {
  summary: SummaryCard[];
  /** Fuel dispensed over the window (per hour for a day, else per day), stacked by fuel type. */
  overTime: { categories: string[]; series: BarChartSeries[] };
  /** Fuel dispensed by station (PLC), largest first. */
  byStation: { categories: string[]; series: BarChartSeries[] };
  /** Dispenses by hour of day over the window (null: the window was read by the day). */
  byHour: { categories: string[]; series: BarChartSeries[] } | null;
}

/** An hour (or a day) of a pump's stored totals ("Fuel Daily Totals"): its bucket's middle and its sums. */
export interface ReportBucket {
  ts: number;
  litres: number;
  dispenses: number;
  denied: number;
}

/** A pump's part in the report: where it is, its fuel, its buckets over the window and its previous window's litres. */
export interface ReportPump {
  id: string;
  fuelType: string;
  station: string;
  site: string;
  buckets: ReportBucket[];
  previousLitres: number;
}

/** Who took the fuel over the window: litres by user code and by vehicle code (from the dispense events). */
export interface ReportPeople {
  users: Map<string, number>;
  vehicles: Map<string, number>;
}

export interface FuelReportInput {
  /** The window: its first day's local midnight, and how many days (1: that day, by hour). */
  start: number;
  days: number;
  /** Its buckets are hours (a day's window, or any up to {@link REPORT_HOURLY_MAX_DAYS}); else days. */
  hourly: boolean;
  pumps: ReportPump[];
  /** Who: null while it loads. */
  people: ReportPeople | null;
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
const litres = (l: number) => fmtNumber(l, l > 0 && l < 100 && !Number.isInteger(l) ? 1 : 0);
const share = (part: number, whole: number) => (whole ? ` · ${Math.round((part / whole) * 100)}%` : "");

/** The report from the window's stored totals (and who took the fuel): every card and chart adds up to the same totals. */
export function buildFuelReport(input: FuelReportInput): FuelReport {
  const { start, days, hourly, pumps, people, kinds, loading } = input;
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
  let previous = 0;
  for (const p of pumps) {
    const fuel = fuelOf(p);
    previous += p.previousLitres;
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
    }
  }

  const shown = (text: string) => (loading ? "…" : text);
  const change = previous ? (total - previous) / previous : null;
  const largest = (sums: Map<string, number>, count: number) => [...sums].filter(([, l]) => l > 0).sort((a, b) => b[1] - a[1]).slice(0, count);
  const listRows = (list: [string, number][], waiting: boolean, empty: string, label: (k: string) => string = (k) => k): SummaryRow[] =>
    waiting
      ? [{ label: "Loading…", value: "" }]
      : list.length
        ? list.map(([k, l]) => ({ label: label(k), value: litres(l), unit: "L" }))
        : [{ label: empty, value: "" }];
  const fuels = FUELS.filter((f) => (fuelTotals.get(f.name) ?? 0) > 0);
  const named = (kind: CodeKind) => (code: string) => {
    const name = input.holder(kind, code);
    return name ? `${name} (${code})` : code;
  };
  const picked = kinds.length ? kinds : (["users", "vehicles"] as CodeKind[]);

  const summary: SummaryCard[] = [
    {
      id: "consumption",
      title: "Consumption",
      rows: [
        { label: "Fuel dispensed", icon: "water_drop", value: shown(litres(total)), unit: "L" },
        { label: "Dispenses", icon: "receipt_long", value: shown(fmtNumber(dispenses)) },
        { label: "Avg per dispense", icon: "avg_pace", value: shown(dispenses ? fmtNumber(total / dispenses, 1) : "—"), unit: dispenses ? "L" : "" },
        // Denials and timeouts, against every attempt.
        { label: "Denied", icon: "block", value: shown(`${fmtNumber(denied)}${denied + dispenses ? ` (${Math.round((denied / (denied + dispenses)) * 100)}%)` : ""}`) },
        {
          label: "Vs previous period",
          icon: change !== null && change < 0 ? "trending_down" : "trending_up",
          value: shown(change === null ? "—" : `${change >= 0 ? "+" : "−"}${Math.abs(change * 100).toFixed(1)}%`),
        },
      ],
    },
    {
      id: "fuelTypes",
      title: "By fuel type",
      rows: loading
        ? [{ label: "Loading…", value: "" }]
        : fuels.length
          ? fuels.map((f) => ({ label: f.name, swatch: f.color, value: litres(fuelTotals.get(f.name) ?? 0), unit: `L${share(fuelTotals.get(f.name) ?? 0, total)}` }))
          : [{ label: "No dispenses", value: "" }],
    },
    { id: "sites", title: "Top sites", rows: listRows(largest(bySite, 5), loading, "No dispenses") },
    ...(picked.includes("users")
      ? [{ id: "users", title: "Top users", rows: listRows(largest(people?.users ?? new Map(), 5), !people, "No dispenses", named("users")) }]
      : []),
    ...(picked.includes("vehicles")
      ? [{ id: "vehicles", title: "Top vehicles", rows: listRows(largest(people?.vehicles ?? new Map(), 5), !people, "No dispenses", named("vehicles")) }]
      : []),
  ];

  const stations = largest(byStation, 50);
  return {
    summary,
    overTime: {
      categories: labels,
      series: fuels.map((f) => ({ name: f.name, color: f.color, data: perFuel.get(f.name)!.map((l) => Math.round(l * 10) / 10) })),
    },
    byStation: {
      categories: stations.map(([name]) => name),
      series: [{ name: "Fuel dispensed", color: "var(--c-chart-1)", data: stations.map(([, l]) => Math.round(l * 10) / 10) }],
    },
    byHour: hourly
      ? {
          categories: Array.from({ length: 24 }, (_, h) => formatClockTime(new Date(start).setHours(h), true)),
          series: [{ name: "Dispenses", color: "var(--c-chart-1)", data: byHour }],
        }
      : null,
  };
}
