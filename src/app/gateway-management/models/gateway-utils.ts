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

// Helpers of the gateway module only — the parse / format helpers every
// dashboard shares are in `components/shared/value-utils.ts` and
// `components/shared/time-format.ts`.

/** A bulk form picker's value while untouched: no choice (the picker shows blank), each row's own value kept. */
export const KEEP = "__keep__";

/** A string array from an attribute value (an array, or a JSON string of one). */
export function parseStringArray(raw: unknown): string[] {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  return Array.isArray(value) ? value.map((v) => String(v)) : [];
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) {
    return false;
  }
  return ka.every((k) => deepEqual((a as any)[k], (b as any)[k]));
}

/** The chart palette token for the n-th series (cycling the five colours). */
export function chartColor(index: number): string {
  return `var(--c-chart-${(index % 5) + 1})`;
}
