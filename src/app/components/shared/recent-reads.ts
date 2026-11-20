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

/** How long a card's history read is kept once read: a device's panel opened again within it shows at once. */
export const RECENT_READ_MS = 2 * 60_000;

/**
 * What cards read of a device's history (a chart card's lines and state bars, a state card's reports), kept a short while — module
 * wide, so it outlives the card: a panel closed and opened again on the same device and window shows it at once, the card's live
 * subscription then bringing it up to date (the read is never skipped, only the wait). Past `keepMs` an entry is gone; the oldest
 * go past `max`.
 *
 * ```ts
 * const READS = new RecentReads<LineChartSeries[][]>();
 * READS.set(`${deviceId}:${window}`, series);
 * const shown = READS.get(`${deviceId}:${window}`); // undefined once older than RECENT_READ_MS
 * ```
 */
export class RecentReads<T> {
  private readonly entries = new Map<string, { at: number; value: T }>();

  constructor(
    private readonly keepMs = RECENT_READ_MS,
    private readonly max = 200
  ) {}

  /** The value kept for `key` — undefined when none, or older than `keepMs`. */
  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }
    if (Date.now() - entry.at > this.keepMs) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  /** Keep `value` for `key` from now (the newest; the oldest dropped past `max`). */
  set(key: string, value: T): void {
    this.entries.delete(key);
    this.entries.set(key, { at: Date.now(), value });
    while (this.entries.size > this.max) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.entries.delete(oldest);
    }
  }
}
