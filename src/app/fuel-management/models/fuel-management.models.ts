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
  /** Asset type of the markets listed (as tree parents) in the location filter. */
  marketAssetType: string;
  /** SERVER attribute (boolean) opting a market into fuel management. */
  fuelManagementKey: string;
  /** Relation type from a Market to each of its Sites — every asset a market links
   *  to by it is one of the market's sites (no type or attribute check). */
  siteRelation: string;
  /** Relation type from a Site to each of its pumps. */
  pumpRelation: string;
  /** Market SERVER attribute: JSON array of the market's user {@link AccessCode}s. */
  userCodesKey: string;
  /** Market SERVER attribute: JSON array of the market's vehicle {@link AccessCode}s. */
  vehicleCodesKey: string;
  /**
   * Pump SERVER attributes (numbers): the most codes the pump's keypad can hold
   * in total, and of each kind. Every pump in a market holds all of that
   * market's codes, so a market is capped by its most restrictive pump.
   */
  totalCodesLimitKey: string;
  userCodesLimitKey: string;
  vehicleCodesLimitKey: string;
  /** Fallback total limit for a pump without {@link totalCodesLimitKey}. */
  maxCodesPerPump: number;
  /** SHARED attribute: boolean — the pump is locked out. */
  lockedKey: string;
  /** SERVER attribute: site name — fallback for pumps with no Site relation. */
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
  marketAssetType: "Market",
  fuelManagementKey: "fuelManagement",
  siteRelation: "FuelSite",
  pumpRelation: "FuelPump",
  userCodesKey: "userCodes",
  vehicleCodesKey: "vehicleCodes",
  totalCodesLimitKey: "totalCodesLength",
  userCodesLimitKey: "userCodesLength",
  vehicleCodesLimitKey: "vehicleCodesLength",
  maxCodesPerPump: 50,
  lockedKey: "locked",
  siteKey: "site",
  fuelTypeKey: "fuelType",
  dispenseVolumeKey: "dispensedVolume",
  eventKey: "pumpEvent",
};

// ---------------------------------------------------------------------------
// Access codes
// ---------------------------------------------------------------------------

/** The two code lists every market keeps. */
export type CodeKind = "users" | "vehicles";

export const CODE_KINDS: { id: CodeKind; label: string; single: string }[] = [
  { id: "users", label: "Users", single: "User" },
  { id: "vehicles", label: "Vehicles", single: "Vehicle" },
];

export function codeKindLabel(kind: CodeKind, singular = false): string {
  const k = CODE_KINDS.find((o) => o.id === kind)!;
  return singular ? k.single : k.label;
}

/** One access code in a market's user or vehicle list. */
export interface AccessCode {
  code: string;
  /** The holder: the user's or vehicle's name. */
  name: string;
  createdAt: number;
}

/** A market's two code lists (stored as its user / vehicle codes attributes). */
export interface MarketCodes {
  users: AccessCode[];
  vehicles: AccessCode[];
}

/** Most codes allowed: in total (users + vehicles) and per list. */
export interface CodeLimits {
  total: number;
  users: number;
  vehicles: number;
}

/** A pump's limits from its attributes; a missing total falls back to `fallbackTotal`,
 *  a missing per-list limit to the total (no separate cap). */
export function parseCodeLimits(total: unknown, users: unknown, vehicles: unknown, fallbackTotal: number): CodeLimits {
  const num = (v: unknown) => {
    const n = Number(v);
    return v != null && v !== "" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
  };
  const t = num(total) ?? fallbackTotal;
  return { total: t, users: num(users) ?? t, vehicles: num(vehicles) ?? t };
}

/** A market's limits: the smallest of its pumps' (all pumps hold every code). */
export function strictestCodeLimits(limits: CodeLimits[], fallbackTotal: number): CodeLimits {
  if (!limits.length) {
    return { total: fallbackTotal, users: fallbackTotal, vehicles: fallbackTotal };
  }
  return {
    total: Math.min(...limits.map((l) => l.total)),
    users: Math.min(...limits.map((l) => l.users)),
    vehicles: Math.min(...limits.map((l) => l.vehicles)),
  };
}

/** Why another `kind` code can't be added (total or that list at its limit), or null. */
export function codeLimitReason(codes: MarketCodes, limits: CodeLimits, kind: CodeKind): string | null {
  if (codes.users.length + codes.vehicles.length >= limits.total) {
    return `This market already has the maximum of ${limits.total} codes.`;
  }
  if (codes[kind].length >= limits[kind]) {
    return `This market already has the maximum of ${limits[kind]} ${codeKindLabel(kind, true).toLowerCase()} codes.`;
  }
  return null;
}

/**
 * A pump's code sync: "synced" when its CLIENT user / vehicle code lists (what
 * the device reports) match the SHARED ones (what was sent to it), "desynced"
 * while they differ, null when the pump has no shared code lists at all.
 */
export type CodesSyncState = "synced" | "desynced" | null;

export function codesSyncState(
  sharedUsers: unknown,
  clientUsers: unknown,
  sharedVehicles: unknown,
  clientVehicles: unknown
): CodesSyncState {
  const missing = (v: unknown) => v == null || v === "";
  if (missing(sharedUsers) && missing(sharedVehicles)) {
    return null;
  }
  return sameCodeList(sharedUsers, clientUsers) && sameCodeList(sharedVehicles, clientVehicles) ? "synced" : "desynced";
}

/** Two code-list attribute values hold the same codes: parsed from JSON, with
 *  object-key and list order ignored; missing / empty counts as an empty list. */
function sameCodeList(a: unknown, b: unknown): boolean {
  const parse = (v: unknown): unknown => {
    if (v == null || v === "") {
      return [];
    }
    if (typeof v !== "string") {
      return v;
    }
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  };
  const canonical = (v: unknown): string => {
    if (Array.isArray(v)) {
      return `[${v.map(canonical).sort().join(",")}]`;
    }
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      return `{${Object.keys(o)
        .sort()
        .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
        .join(",")}}`;
    }
    return JSON.stringify(v);
  };
  return canonical(parse(a)) === canonical(parse(b));
}

/** What the assign-code form submits (the market is the one it was opened for). */
export interface AssignCodeRequest {
  kind: CodeKind;
  code: string;
  name: string;
}

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
  /** Site name — the related Site asset, else the {@link FuelDashboardSettings.siteKey} attribute. */
  site: string;
  /** Raw {@link FuelDashboardSettings.siteKey} attribute (fallback for {@link site}). */
  siteAttr: string;
  /** Related Site / Market assets (Market -FuelSite→ Site -FuelPump→ Pump); "" when unlinked. */
  siteId: string;
  marketId: string;
  market: string;
  fuelType: string;
  status: PumpStatus;
  locked: boolean;
  /** Codes the pump holds: its market's users + vehicles (0 outside a market). */
  codeCount: number;
  /** The pump's own code limits (its limit attributes, with fallbacks). */
  limits: CodeLimits;
  /** Whether the pump confirmed its codes (client = shared); null when it has none. */
  codesSync: CodesSyncState;
  lastDispenseTs: number | null;
  /** Preformatted {@link lastDispenseTs} ("Today 08:42", "—"). */
  lastDispense: string;
}

/** A fuel-management market: its fuel-management sites and its code lists. */
export interface MarketNode {
  id: string;
  name: string;
  sites: { id: string; name: string }[];
  codes: MarketCodes;
  /** Its most restrictive pump's limits (the default when it has no pumps). */
  limits: CodeLimits;
}

/** Where a pump sits in the Market → Site hierarchy. */
export interface PumpLocation {
  siteId: string;
  siteName: string;
  marketId: string;
  marketName: string;
}

/** One code in a market's user / vehicle list (Access codes table, pump Codes tab). */
export interface AccessCodeRow {
  code: string;
  name: string;
  /** When it was issued ("Today 09:15", "Sep 21 14:10"). */
  added: string;
  source: AccessCode;
}

export function toAccessCodeRow(c: AccessCode): AccessCodeRow {
  return { code: c.code, name: c.name || "—", added: formatWhen(c.createdAt || null), source: c };
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
  /** Which market list a code change was in (code events logged on a market). */
  kind?: CodeKind;
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

/** Activity time windows, keyed by the shared timeframe picker's ids (1D / 1W / 1M). */
export const ACTIVITY_TIMEFRAMES: { id: string; ms: number }[] = [
  { id: "1D", ms: 24 * 3600 * 1000 },
  { id: "1W", ms: 7 * 24 * 3600 * 1000 },
  { id: "1M", ms: 30 * 24 * 3600 * 1000 },
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
      name: String(c.name ?? c.holder ?? ""),
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
