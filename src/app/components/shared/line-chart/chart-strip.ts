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

import { formatDuration } from "../time-format";
import type { StatusPillTone } from "../status-pill/status-pill.component";

/**
 * A run of a line chart's state bar (`tb-line-chart [strip]`): a stretch of one state on the chart's own time axis, in its state's
 * colour — or hatched, nothing known there (the device silent: offline) — named in its bubble.
 */
export interface ChartStripRun {
  start: number;
  end: number;
  /** Its fill, a `--c-*` token (none when hatched). */
  color?: string;
  /** The Offline pill's grey in stripes over the track: no state known — the device sent nothing. */
  hatched?: boolean;
  /** Its bubble: its state and how long it lasted, "Producing · 1h 23m". */
  tip: string;
  /** Its state as a pill shows it (a card's state at a picked time): its label, tone and icon. */
  label: string;
  tone: StatusPillTone;
  icon?: string;
}

/** One value a state key takes: its id, its label and its colour (a `--c-*` token) — the state card's (`StateTimelineState`). */
export interface ChartStripState {
  id: string;
  label: string;
  color: string;
  /** Its pill's tone and icon (a card's state at a picked time); neutral, none when not given. */
  tone?: StatusPillTone;
  icon?: string;
}

/**
 * A device's state over a chart's window as a thin bar under its plot (`MetricChartSection.stateStrip`): its string time series
 * (`key`), each report holding until the next or `staleAfterMs` after it — past that, and before its first, a hatched stretch
 * named `gapLabel` (the device silent: "Offline").
 */
export interface ChartStateStrip {
  key: string;
  states: ChartStripState[];
  /** A reported value as a state's id (stored as labels, codes, mixed); none known: a gap. Identity when not given. */
  resolve?: (raw: string) => string | null;
  /** How long a report holds. */
  staleAfterMs: number;
  /** The bubble and pill of a stretch with nothing known (default "Offline"), its pill's icon. */
  gapLabel?: string;
  gapIcon?: string;
}

/** The run a bar shows at a time — none: not read there. */
export function stripRunAt(runs: readonly ChartStripRun[] | null | undefined, ts: number): ChartStripRun | null {
  return runs?.find((r) => r.start <= ts && ts < r.end) ?? null;
}

/** A stretch's length for its bubble: how long the state lasted, "1h 23m" (`formatDuration`) — not its times. */
function stretchLength(start: number, end: number): string {
  return formatDuration(end - start);
}

/**
 * The bar's runs over [start, end] from a state key's readings (any order): each report's state until the next report or
 * `staleAfterMs` after it, neighbours of one state joined; the stretches between them with nothing known — before the first, after
 * the last — hatched (`gapLabel`). `end` is when the readings were read (now, live): nothing past it.
 */
export function stateStripRuns(points: readonly { ts: number; value: unknown }[], strip: ChartStateStrip, start: number, end: number): ChartStripRun[] {
  const resolve = strip.resolve ?? ((raw: string) => raw);
  const sorted = points
    .map((p) => ({ ts: Number(p.ts), raw: String(p.value) }))
    .filter((p) => isFinite(p.ts))
    .sort((a, b) => a.ts - b.ts);
  const known: { state: ChartStripState; start: number; end: number }[] = [];
  sorted.forEach((p, i) => {
    const id = resolve(p.raw);
    const state = id == null ? undefined : strip.states.find((s) => s.id === id);
    if (!state) {
      return; // an unknown value: nothing known there
    }
    const next = i + 1 < sorted.length ? sorted[i + 1].ts : end;
    const runStart = Math.max(p.ts, start);
    const runEnd = Math.min(next, p.ts + strip.staleAfterMs, end);
    if (runEnd <= runStart) {
      return;
    }
    const last = known[known.length - 1];
    if (last && last.state === state && last.end >= runStart) {
      last.end = Math.max(last.end, runEnd);
    } else {
      known.push({ state, start: runStart, end: runEnd });
    }
  });
  const gapLabel = strip.gapLabel ?? "Offline";
  const runs: ChartStripRun[] = [];
  const gap = (from: number, to: number) => {
    if (to > from) {
      runs.push({ start: from, end: to, hatched: true, tip: `${gapLabel} · ${stretchLength(from, to)}`, label: gapLabel, tone: "neutral", icon: strip.gapIcon });
    }
  };
  let cursor = start;
  for (const k of known) {
    gap(cursor, k.start);
    const { label, color, tone, icon } = k.state;
    runs.push({ start: k.start, end: k.end, color, tip: `${label} · ${stretchLength(k.start, k.end)}`, label, tone: tone ?? "neutral", icon });
    cursor = k.end;
  }
  gap(cursor, end);
  return runs;
}
