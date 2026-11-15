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

// One set of parse / format helpers for every dashboard: attribute and
// telemetry values arrive as strings (or JSON strings), and every table shows
// a missing one the same way ("—").

/** A number from an attribute / telemetry value; null when absent or not numeric. */
export function parseNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") {
    return null;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** A JSON object from an attribute value (an object, or a JSON string of one); {} when it isn't one. */
export function parseObject(raw: unknown): Record<string, any> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, any>;
  }
  if (typeof raw === "string" && raw.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

/** A list of strings from an attribute value (a list, or a JSON string of one: `["Fuel", "QC Lab"]`); [] when it isn't one. */
export function parseStringList(raw: unknown): string[] {
  let list: unknown = raw;
  if (typeof raw === "string" && raw.trim().startsWith("[")) {
    try {
      list = JSON.parse(raw);
    } catch {
      list = null;
    }
  }
  return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string" && !!x) : [];
}

/** A boolean from an attribute value (true / "true" / false / "false"); `fallback` for anything else. */
export function parseBool(raw: unknown, fallback = false): boolean {
  if (typeof raw === "boolean") {
    return raw;
  }
  if (typeof raw === "string") {
    const v = raw.trim().toLowerCase();
    if (v === "true") {
      return true;
    }
    if (v === "false") {
      return false;
    }
  }
  return fallback;
}

/** An entity's description from its `additionalInfo` (an object, or the JSON string an entity query returns); "" when unset. */
export function parseDescription(raw: unknown): string {
  const description = parseObject(raw)["description"];
  return typeof description === "string" ? description : "";
}

/** A number for display, with `decimals` places and thousands separators; "—" when there is none. */
export function fmtNumber(v: number | null | undefined, decimals = 0): string {
  if (v === null || v === undefined || !Number.isFinite(v)) {
    return "—";
  }
  return v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/**
 * A request ThingsBoard stays quiet about: no page-wide loading bar, and no
 * ThingsBoard error toast (it opens outside the dashboard and ignores its
 * theme) — the dashboard reports a failure in its own toast, see {@link apiMessage}.
 */
export const QUIET_REQUEST = { ignoreLoading: true, ignoreErrors: true };

/**
 * How a failed request ends a toast's sentence: ": <why>" — ThingsBoard's own
 * message when it sent one (its JSON body, parsed when it came as text), else
 * the status in plain words ("You don't have permission to perform this
 * operation!" for a 403), else an error's own message — or "." when there's
 * nothing to say. Never Angular's "Http failure response for <url>: 403 OK".
 */
export function apiMessage(err: any): string {
  const msg = failureReason(err);
  return msg ? `: ${msg}` : ".";
}

/** Why a request failed, in words ({@link apiMessage}); "" when nothing says. */
function failureReason(err: any): string {
  let body = err?.error;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      // A short plain-text reason is said as it is; a page of HTML is not.
      const text = body.trim();
      return text && text.length <= 200 && !/<[a-z!]/i.test(text) ? text : statusReason(err?.status);
    }
  }
  const server = body && typeof body === "object" ? body.message : null;
  if (server) {
    return String(server);
  }
  // An HTTP failure without a message: its status in words, never Angular's text (the URL and "403 OK").
  if (typeof err?.status === "number") {
    return statusReason(err.status);
  }
  return String(err?.message ?? "");
}

/** A failed request's status in words, as ThingsBoard puts its own ("You don't have permission to perform this operation!"). */
function statusReason(status: unknown): string {
  switch (status) {
    case 0:
      return "ThingsBoard couldn't be reached";
    case 401:
      return "Your session has ended — sign in again";
    case 403:
      return "You don't have permission to perform this operation!";
    case 404:
      return "It wasn't found";
    case 409:
      return "Someone changed it meanwhile — reload and try again";
    default:
      return typeof status === "number" && status >= 500 ? `ThingsBoard couldn't do it (error ${status})` : typeof status === "number" ? `The request failed (${status})` : "";
  }
}
