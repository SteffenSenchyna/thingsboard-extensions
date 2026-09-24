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

import { StatusPillTone } from "../../components/shared/status-pill/status-pill.component";

// ---------------------------------------------------------------------------
// Settings — where the dashboard reads/writes each value on the pump devices.
// Every key can be overridden from the widget's settings (ctx.settings).
// ---------------------------------------------------------------------------

export interface FuelDashboardSettings {
  /** Device profiles (device types) listed as pumps. */
  pumpDeviceTypes: string[];
  /**
   * Customer entity group(s) listed in the customer filter (PE). Every CUSTOMER
   * group with this name the user can read is used, whichever owner (tenant or
   * any customer in the hierarchy) it belongs to. Empty = list the pumps' owners.
   */
  customerGroupName: string;
  /** SHARED attribute: JSON array of {@link AccessCode} — synced to the pump. */
  accessCodesKey: string;
  /** SHARED attribute: boolean — the pump only dispenses after a valid code. */
  requireCodeKey: string;
  /** SHARED attribute: boolean — the pump is locked out. */
  lockedKey: string;
  /** SERVER attribute: site / yard name. */
  siteKey: string;
  /** SERVER attribute: fuel type (Diesel, Unleaded, …). */
  fuelTypeKey: string;
  /** TIME SERIES: litres per dispense — the latest point is the last dispense. */
  dispenseVolumeKey: string;
  /** TIME SERIES: JSON {@link PumpEvent} per pump event (feeds the Activity tab). */
  eventKey: string;
}

export const fuelDashboardDefaultSettings: FuelDashboardSettings = {
  pumpDeviceTypes: ["Fuel pump"],
  customerGroupName: "Fuel Management",
  accessCodesKey: "accessCodes",
  requireCodeKey: "requireAccessCode",
  lockedKey: "locked",
  siteKey: "site",
  fuelTypeKey: "fuelType",
  dispenseVolumeKey: "dispensedVolume",
  eventKey: "pumpEvent",
};

// ---------------------------------------------------------------------------
// Access codes
// ---------------------------------------------------------------------------

export type HolderType = "driver" | "vehicle" | "group" | "contractor";

export const HOLDER_TYPE_OPTIONS: { value: HolderType; label: string }[] = [
  { value: "driver", label: "Driver" },
  { value: "vehicle", label: "Vehicle" },
  { value: "group", label: "Group" },
  { value: "contractor", label: "Contractor" },
];

/** One access code as stored in a pump's {@link FuelDashboardSettings.accessCodesKey} attribute. */
export interface AccessCode {
  code: string;
  holder: string;
  holderType: HolderType;
  /** Expiry (ms epoch), or null for no expiry. */
  expiresAt: number | null;
  createdAt: number;
}

/** What the assign-code form submits. */
export interface AssignCodeRequest {
  code: string;
  holder: string;
  holderType: HolderType;
  expiresAt: number | null;
  pumpIds: string[];
}

/** Validity choices in the assign form (days; null = no expiry). */
export const VALIDITY_OPTIONS: { value: string; label: string; days: number | null }[] = [
  { value: "7d", label: "7 days from today", days: 7 },
  { value: "30d", label: "30 days from today", days: 30 },
  { value: "90d", label: "90 days from today", days: 90 },
  { value: "365d", label: "1 year from today", days: 365 },
  { value: "none", label: "No expiry", days: null },
];

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export type PumpStatus = "online" | "locked" | "offline";

export const PUMP_STATUS_META: Record<PumpStatus, { label: string; icon: string; tone: StatusPillTone }> = {
  online: { label: "Online", icon: "wifi", tone: "success" },
  locked: { label: "Locked", icon: "lock", tone: "warning" },
  offline: { label: "Offline", icon: "wifi_off", tone: "neutral" },
};

/** One pump in the Pumps table (and the detail panel). */
export interface PumpRow {
  pumpId: string;
  /** Display name — label when set, else the device name. */
  name: string;
  /** Short chip id, e.g. "P01" from "Pump 01". */
  shortName: string;
  /** Raw device name / label / description (Settings tab). */
  deviceName: string;
  deviceLabel: string;
  description: string;
  type: string;
  site: string;
  fuelType: string;
  /** Owning customer's name ("Unassigned" when the tenant owns it). */
  customer: string;
  status: PumpStatus;
  locked: boolean;
  requireCode: boolean;
  accessCodes: AccessCode[];
  codeCount: number;
  lastDispenseTs: number | null;
  /** Preformatted {@link lastDispenseTs} ("Today 08:42", "—"). */
  lastDispense: string;
}

/** One code in the Access codes table — a code aggregated across the pumps it opens. */
export interface AccessCodeRow {
  /** Stable identity: code + holder. */
  key: string;
  code: string;
  holder: string;
  holderType: string;
  pumpIds: string[];
  /** Short pump chips ("P01", …). */
  pumps: string[];
  expiresAt: number | null;
  expires: string;
}

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

export type PumpEventType =
  | "dispense"
  | "denied_invalid"
  | "denied_expired"
  | "code_assigned"
  | "code_revoked"
  | "locked"
  | "unlocked"
  | "offline"
  | "online";

/** JSON payload of one {@link FuelDashboardSettings.eventKey} time-series point. */
export interface PumpEvent {
  type: PumpEventType;
  code?: string;
  holder?: string;
  /** Litres dispensed (dispense events). */
  volume?: number;
}

/** Activity filter chip group an event belongs to. */
export type ActivityGroup = "dispense" | "denied" | "codes" | "status";

export const EVENT_META: Record<PumpEventType, { label: string; icon: string; tone: StatusPillTone; group: ActivityGroup }> = {
  dispense: { label: "Dispense", icon: "local_gas_station", tone: "brand", group: "dispense" },
  denied_invalid: { label: "Denied · invalid code", icon: "block", tone: "error", group: "denied" },
  denied_expired: { label: "Denied · expired code", icon: "block", tone: "error", group: "denied" },
  code_assigned: { label: "Code assigned", icon: "key", tone: "success", group: "codes" },
  code_revoked: { label: "Code revoked", icon: "link_off", tone: "neutral", group: "codes" },
  locked: { label: "Pump locked", icon: "lock", tone: "warning", group: "status" },
  unlocked: { label: "Pump unlocked", icon: "lock_open", tone: "success", group: "status" },
  offline: { label: "Pump offline", icon: "wifi_off", tone: "neutral", group: "status" },
  online: { label: "Pump online", icon: "wifi", tone: "success", group: "status" },
};

export const ACTIVITY_FILTERS: { id: "all" | ActivityGroup; label: string; icon: string }[] = [
  { id: "all", label: "All", icon: "list" },
  { id: "dispense", label: "Dispenses", icon: "local_gas_station" },
  { id: "denied", label: "Denied", icon: "block" },
  { id: "codes", label: "Code changes", icon: "key" },
  { id: "status", label: "Pump status", icon: "sensors" },
];

/** Activity time windows (ids double as the timeframe selector's). */
export const ACTIVITY_TIMEFRAMES: { id: string; label: string; icon: string; ms: number }[] = [
  { id: "1D", label: "Last 24 hours", icon: "calendar_today", ms: 24 * 3600 * 1000 },
  { id: "7D", label: "Last 7 days", icon: "calendar_today", ms: 7 * 24 * 3600 * 1000 },
  { id: "30D", label: "Last 30 days", icon: "calendar_today", ms: 30 * 24 * 3600 * 1000 },
];

/** One row in the Activity table. */
export interface ActivityRow {
  id: string;
  ts: number;
  time: string;
  type: PumpEventType;
  label: string;
  icon: string;
  tone: StatusPillTone;
  group: ActivityGroup;
  pumpId: string;
  pump: string;
  holder: string;
  code: string;
  volume: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse the access-codes attribute (arrives JSON-stringified); drops malformed entries. */
export function parseAccessCodes(raw: unknown): AccessCode[] {
  let list: unknown = raw;
  if (typeof raw === "string") {
    try {
      list = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) {
    return [];
  }
  return list
    .filter((c: any) => c && c.code != null)
    .map((c: any) => ({
      code: String(c.code),
      holder: String(c.holder ?? ""),
      holderType: (c.holderType ?? "driver") as HolderType,
      expiresAt: c.expiresAt == null || c.expiresAt === "" ? null : Number(c.expiresAt),
      createdAt: Number(c.createdAt ?? 0),
    }));
}

/** Parse one event point (JSON string); null when it isn't a known event. */
export function parsePumpEvent(raw: unknown): PumpEvent | null {
  try {
    const e = typeof raw === "string" ? JSON.parse(raw) : raw;
    return e && (e as PumpEvent).type in EVENT_META ? (e as PumpEvent) : null;
  } catch {
    return null;
  }
}

/** Attribute values arrive stringified — "true"/true are truthy, everything else false. */
export function parseBool(raw: unknown, fallback = false): boolean {
  if (raw == null || raw === "") {
    return fallback;
  }
  return raw === true || String(raw).toLowerCase() === "true";
}

/** "P01" from "Pump 01" / "pump-1"; otherwise the name itself. */
export function shortPumpName(name: string): string {
  const m = /(\d+)\s*$/.exec(name);
  return m ? `P${m[1].padStart(2, "0")}` : name;
}

const pad = (n: number): string => String(n).padStart(2, "0");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Today 09:15", "Yesterday 17:40", or "Sep 21 14:10"; "—" when unset. */
export function formatWhen(ts: number | null): string {
  if (!ts) {
    return "—";
  }
  const d = new Date(ts);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
  return `${MONTHS[d.getMonth()]} ${d.getDate()} ${time}`;
}

/** "Dec 31" (adds the year when it isn't this year), "Expired", or "No expiry". */
export function formatExpiry(ts: number | null): string {
  if (ts == null) {
    return "No expiry";
  }
  if (ts < Date.now()) {
    return "Expired";
  }
  const d = new Date(ts);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return `${MONTHS[d.getMonth()]} ${d.getDate()}${sameYear ? "" : `, ${d.getFullYear()}`}`;
}

export function holderTypeLabel(type: string): string {
  return HOLDER_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;
}

/** A random 6-digit keypad code not already in use. */
export function generateAccessCode(taken: Set<string>): string {
  for (let i = 0; i < 1000; i++) {
    const code = String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
    if (!taken.has(code)) {
      return code;
    }
  }
  return String(Date.now()).slice(-6);
}
