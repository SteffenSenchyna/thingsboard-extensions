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


// The helpers of the Devices / Assets panel's old Attributes, Latest telemetry and Relations tabs (archived with them).
import { formatWhen } from "../../src/app/components/shared/time-format";

/** A value as a table shows it: text as it is, anything else (a number, a JSON object) as JSON. */
export function displayValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "—";
  }
  return typeof value === "string" ? value : JSON.stringify(value);
}

/** A typed-in value as ThingsBoard stores it: JSON when it parses (a number, true / false, an object), else the text. */
export function parseInputValue(text: string): unknown {
  const t = text.trim();
  if (!t) {
    return "";
  }
  try {
    return JSON.parse(t);
  } catch {
    return text;
  }
}

/** One attribute or latest time-series value of an entity, for its tab's table. */
export interface KeyValueRow {
  key: string;
  value: string;
  raw: unknown;
  ts: number | null;
  when: string;
}

export function keyValueRow(key: string, raw: unknown, ts: number | null | undefined): KeyValueRow {
  return { key, value: displayValue(raw), raw, ts: ts ?? null, when: formatWhen(ts ?? null) };
}

/** One relation of an entity: the other end, which way, its type. */
export interface RelationRow {
  /** Unique in the list: the direction, the type, the other end. */
  id: string;
  direction: "from" | "to";
  /** "Out" (this → the other end) or "In" (the other end → this). */
  way: string;
  type: string;
  otherType: string;
  otherId: string;
  otherName: string;
}
