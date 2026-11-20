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

import type { DataTableColumn } from "./data-table/data-table.component";

// One clock for every dashboard: 12-hour times with AM/PM, always in the
// viewer's browser time zone (Date's local fields / toLocale* with no timeZone).

/**
 * "9:05 AM"; `compact` drops ":00" on the hour ("2 PM") for tight chart axes;
 * `seconds` adds them ("9:05:07 AM") for an event log, where events come seconds apart.
 */
export function formatClockTime(ts: number | Date, compact = false, seconds = false): string {
  const d = ts instanceof Date ? ts : new Date(ts);
  const onTheHour = d.getMinutes() === 0 && !seconds;
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: compact && onTheHour ? undefined : "2-digit",
    second: seconds ? "2-digit" : undefined,
    hour12: true,
  });
}

/** "Sep 21, 2026" (month, day and year, viewer's time zone) — a "Created on" column's date. */
export function formatDate(ts: number | Date): string {
  const d = ts instanceof Date ? ts : new Date(ts);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** A Settings table's "Created on" column — its rows' {@link createdCells}: the date, sorted by the time. */
export const CREATED_ON_COLUMN: DataTableColumn = { key: "created", phone: "hide", header: "Created on", sortValue: (row) => row["createdTime"] ?? 0 };

/** A row's "Created on" cells: the date ("—" unknown), and the time it sorts by. */
export function createdCells(ts: number | null | undefined): { created: string; createdTime: number } {
  return { created: ts ? formatDate(ts) : "—", createdTime: ts ?? 0 };
}

/** "Sep 21" (month + day, viewer's time zone). */
export function formatShortDate(ts: number | Date): string {
  const d = ts instanceof Date ? ts : new Date(ts);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "Sep 21, 9:05 AM". */
export function formatDateTime(ts: number | Date): string {
  return `${formatShortDate(ts)}, ${formatClockTime(ts)}`;
}

/** Angular DatePipe format matching {@link formatDateTime}'s clock: "Sep 21 at 9:05 AM". */
export const TB_DATE_AT_TIME = "MMM d 'at' h:mm a";

/**
 * "Today 9:15 AM", "Yesterday 5:40 PM", else "Sep 21 2:10 PM" — a table's time
 * column; "—" when unset. `seconds`: an event log's ("Today 9:15:07 AM").
 */
export function formatWhen(ts: number | null | undefined, options: { seconds?: boolean } = {}): string {
  if (!ts) {
    return "—";
  }
  const d = new Date(ts);
  const time = formatClockTime(d, false, !!options.seconds);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - day.getTime()) / 86400000);
  if (diffDays === 0) {
    return `Today ${time}`;
  }
  if (diffDays === 1) {
    return `Yesterday ${time}`;
  }
  return `${formatShortDate(d)} ${time}`;
}

/**
 * How long ago: "just now" (under a minute), "5m ago", "3h ago", "2d ago",
 * then the date ("Sep 21") after a week; "—" when unset. A time slightly in
 * the future (a device clock running ahead) reads "just now".
 */
export function relativeTime(ts: number | null | undefined): string {
  if (!ts) {
    return "—";
  }
  const diff = Date.now() - ts;
  if (diff < 60_000) {
    return "just now";
  }
  if (diff < 3_600_000) {
    return `${Math.floor(diff / 60_000)}m ago`;
  }
  if (diff < 86_400_000) {
    return `${Math.floor(diff / 3_600_000)}h ago`;
  }
  if (diff < 7 * 86_400_000) {
    return `${Math.floor(diff / 86_400_000)}d ago`;
  }
  return formatShortDate(ts);
}

/** A duration in the two largest units: "3d 4h", "4h 12m", "12m", "<1m" (a gateway's uptime, how long a state lasted). */
export function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) {
    return "<1m";
  }
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days) {
    return hours ? `${days}d ${hours}h` : `${days}d`;
  }
  if (hours) {
    return mins ? `${hours}h ${mins}m` : `${hours}h`;
  }
  return `${mins}m`;
}
