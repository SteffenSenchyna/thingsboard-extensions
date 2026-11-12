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
import { formatDate, formatWhen } from "../../components/shared/time-format";
import { parseBool } from "../../components/shared/value-utils";

// ---------------------------------------------------------------------------
// Settings — where the dashboard reads/writes each value on the pump devices.
// Every key can be overridden from the widget's settings (ctx.settings).
// ---------------------------------------------------------------------------

export interface FuelDashboardSettings {
  /** Device profiles (device types) listed as pumps. */
  pumpDeviceTypes: string[];
  /** Asset type of the markets listed in the Market filter. */
  marketAssetType: string;
  /** Asset type of the product lines listed in the Product line filter. */
  productLineAssetType: string;
  /** Relation type from a product line to each of its sites (a station's product line is its site's). */
  productLineRelation: string;
  /**
   * The Settings page's Organization (shared): the sites' asset profile, and
   * the relation from a market to each site it contains — the access
   * hierarchy's, which is also how a market's codes reach its sites (and a
   * market's sites here: those the Fuel application runs at).
   */
  siteAssetType: string;
  marketSiteRelation: string;
  /** The Settings page's Applications (shared): the applications' asset profile. */
  applicationAssetType: string;
  /** The Settings page's Access (shared): the customer whose users its groups hold — and who owns the hierarchy ("WCAN"). */
  accessOwnerTitle: string;
  /** The relation from an application to each site it runs at (its Sites tab on the Settings page). */
  applicationSiteRelation: string;
  /**
   * The Fuel application (its asset's name): the sites it runs at are this
   * dashboard's — a market shows with those of its sites, none: not at all.
   */
  fuelApplicationName: string;
  /** Relation type from a Site to each of its pumps. */
  pumpRelation: string;
  /**
   * The PLCs: the controllers holding the code tables of the pumps they drive
   * (every new code goes to the PLCs of its market). Their device profiles,
   * and the relation type linking a PLC from its Site (or its Market).
   */
  plcDeviceTypes: string[];
  plcRelation: string;
  /**
   * Relation type from a station's PLC to each of its pumps — a station's
   * pumps are the ones its PLC links to by it (set from the station's Settings
   * tab, a new pump's form, or a pump's Settings tab).
   */
  stationPumpRelation: string;
  /**
   * Relation type from a gateway to each device it created ("Created" — added
   * by ThingsBoard when a gateway connects a new device) — the gateways the
   * Settings page lists; a device without the relation falls back to its
   * `additionalInfo.lastConnectedGateway`.
   */
  gatewayRelation: string;
  /**
   * PLC CLIENT attributes (booleans, read back from the PLC by the gateway):
   * true while the PLC is loading the user / vehicle list it was last sent
   * into its own table — a new list is held until it is false again.
   */
  userCodesXferKey: string;
  vehicleCodesXferKey: string;
  /**
   * PLC SHARED attributes (booleans): set true, with the list itself in the
   * PLC's SHARED user / vehicle code-list attribute, to have the gateway load
   * that list into the PLC — what the backend does when a market's list
   * changes, and what the Settings page's "push again" buttons repeat.
   */
  userCodesXferRequestKey: string;
  vehicleCodesXferRequestKey: string;
  /**
   * Code assets — one asset per access code, named `<prefix><code>`
   * (USR-125003 / VEH-125003) with the holder as its label, linked from its
   * market by the user / vehicle code relation. The backend builds each
   * market's code lists and the pumps' codes from these assets.
   */
  userCodeAssetType: string;
  vehicleCodeAssetType: string;
  userCodeRelation: string;
  vehicleCodeRelation: string;
  userCodePrefix: string;
  vehicleCodePrefix: string;
  /**
   * The user / vehicle code-list keys: the market SERVER attributes holding its
   * allowed codes as a fixed-length array of code strings — one slot per
   * allowed code (the stations' user / vehicle code limits), "" for an empty slot,
   * e.g. ["125003", "", "716966", ""]; the dashboard fills a free slot with a
   * created code and clears a revoked code's slot in place — and the pump SHARED
   * (sent) / CLIENT (reported) attributes behind the sync pill.
   */
  userCodesKey: string;
  vehicleCodesKey: string;
  /**
   * A code asset's SERVER attributes: its {@link CodeStatus} ("active" when
   * absent) — a suspended or expired code is out of its scope's list (its slot
   * free) but keeps its asset and its keypad code — and when it expires (ms;
   * none: never), as the "Fuel Code Expiry" rule chain reads it: past it, the
   * chain takes the code out of its list and marks it expired.
   */
  codeStatusKey: string;
  codeExpiresKey: string;
  /**
   * Station (PLC) SERVER attributes (numbers): the size of the code lists it
   * holds — the most codes it can take in total, and of each kind. Every
   * station in a market holds all of that market's codes, so a market is
   * capped by its most restrictive station. (Pumps carry no limits — the PLC
   * that drives them holds their code tables.)
   */
  totalCodesLimitKey: string;
  userCodesLimitKey: string;
  vehicleCodesLimitKey: string;
  /** Fallback total limit for a station that hasn't reported {@link totalCodesLimitKey} (and a market without stations). */
  maxCodesPerStation: number;
  /** SHARED attribute: boolean — the pump is locked out. */
  lockedKey: string;
  /** SERVER attribute: site name — fallback for pumps with no Site relation. */
  siteKey: string;
  /** SERVER attribute: fuel type (Diesel, Unleaded, …). */
  fuelTypeKey: string;
  /** SERVER attribute: the pump's short label in event descriptions ("P01"; read by the ParseTransaction calculated field). */
  pumpLabelKey: string;
  /**
   * Pump TIME SERIES: litres per dispense, a point a dispense (saved with
   * its event by the FuelPump Transactions rule chain) — the pump panel's
   * Dispensing chart; the latest point is the pump's last dispense.
   */
  dispenseVolumeKey: string;
  /**
   * PLC TIME SERIES: its station's last dispense — the litres and the pump
   * ({@link stationDispensePumpKey}), copied from each dispense of its pumps by
   * the FuelPump Transactions rule chain, at the dispense's time.
   */
  stationDispenseVolumeKey: string;
  stationDispensePumpKey: string;
  /** TIME SERIES: JSON {@link PumpEvent} per pump event (feeds the Activity tab). */
  eventKey: string;
  /**
   * Pump TIME SERIES (from its gateway, on change): true while the PLC holds
   * an event frame for it to read — each is acked as it's parsed, so one true
   * for long is a stalled drain (the Stations table's "Events stalled").
   */
  eventReadyKey: string;
  /**
   * Pump TIME SERIES: its day's totals — litres dispensed, dispenses, denials
   * (and timeouts) — a point a day at its midnight (America/Edmonton), kept by
   * the "Fuel Daily Totals" rule chain (every 2 minutes, from its events, as
   * the sum of its quarter-hours' `fuelQtr*`). The Stations cards' "today".
   */
  dayLitresKey: string;
  dayDispensesKey: string;
  dayDeniedKey: string;
  /** Pump TIME SERIES: the same a quarter-hour (at its start) — what the Reports page sums, by the hour or the day. */
  qtrLitresKey: string;
  qtrDispensesKey: string;
  qtrDeniedKey: string;
}

export const fuelDashboardDefaultSettings: FuelDashboardSettings = {
  pumpDeviceTypes: ["FuelPump"],
  marketAssetType: "Market",
  productLineAssetType: "ProductLine",
  productLineRelation: "Contains",
  siteAssetType: "Site",
  marketSiteRelation: "Contains",
  applicationAssetType: "Application",
  accessOwnerTitle: "WCAN",
  applicationSiteRelation: "Contains",
  fuelApplicationName: "Fuel",
  pumpRelation: "FuelPump",
  plcDeviceTypes: ["FuelPLC"],
  plcRelation: "FuelPLC",
  stationPumpRelation: "FuelPump",
  gatewayRelation: "Created",
  userCodesXferKey: "userCodesXfer",
  vehicleCodesXferKey: "vehicleCodesXfer",
  userCodesXferRequestKey: "userCodesXferRequest",
  vehicleCodesXferRequestKey: "vehicleCodesXferRequest",
  userCodeAssetType: "FuelUser",
  vehicleCodeAssetType: "FuelVehicle",
  userCodeRelation: "FuelUser",
  vehicleCodeRelation: "FuelVehicle",
  userCodePrefix: "USR-",
  vehicleCodePrefix: "VEH-",
  userCodesKey: "userCodes",
  vehicleCodesKey: "vehicleCodes",
  codeStatusKey: "codeStatus",
  codeExpiresKey: "expiresAt",
  totalCodesLimitKey: "totalCodesLength",
  userCodesLimitKey: "userCodesLength",
  vehicleCodesLimitKey: "vehicleCodesLength",
  maxCodesPerStation: 50,
  lockedKey: "locked",
  siteKey: "site",
  fuelTypeKey: "fuelType",
  pumpLabelKey: "pumpLabel",
  dispenseVolumeKey: "fuelVolume",
  stationDispenseVolumeKey: "lastDispenseVolume",
  stationDispensePumpKey: "lastDispensePump",
  eventKey: "event",
  eventReadyKey: "eventReady",
  dayLitresKey: "fuelDayLitres",
  dayDispensesKey: "fuelDayDispenses",
  dayDeniedKey: "fuelDayDenied",
  qtrLitresKey: "fuelQtrLitres",
  qtrDispensesKey: "fuelQtrDispenses",
  qtrDeniedKey: "fuelQtrDenied",
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

/** The User | Vehicle toggle's options (pump Codes tab, assign form). */
export const CODE_KIND_TOGGLE: { id: CodeKind; label: string }[] = CODE_KINDS.map((k) => ({ id: k.id, label: k.single }));

export function codeKindLabel(kind: CodeKind, singular = false): string {
  const k = CODE_KINDS.find((o) => o.id === kind)!;
  return singular ? k.single : k.label;
}

/**
 * One access code: a FuelUser / FuelVehicle asset linked from its scope — a
 * market (every site in it) or one site — by the user / vehicle code relation.
 */
export interface AccessCode {
  /** The code asset's id. */
  assetId: string;
  /** Its scope: the site it's limited to (the site's asset id), or "" — every site of its market. */
  siteId: string;
  /** Keypad code — the asset name without its prefix ("125003" from "USR-125003"). */
  code: string;
  /** The holder: the user's or vehicle's name (the asset label). */
  name: string;
  /** When the asset was created. */
  createdAt: number;
  /** As stored ({@link FuelDashboardSettings.codeStatusKey}): only an active code is in its scope's list. */
  status: CodeStatus;
  /** When it expires (ms); null: never. */
  expiresAt: number | null;
}

/**
 * A code's state: active (in its scope's list — the stations take it),
 * suspended (taken out by hand, to put back with Resume) or expired (taken
 * out by the "Fuel Code Expiry" chain at its expiry). Out of the list, a code
 * frees its slot but keeps its asset and keypad code.
 */
export type CodeStatus = "active" | "suspended" | "expired";

export const CODE_STATUSES: CodeStatus[] = ["active", "suspended", "expired"];

export const CODE_STATUS_META: Record<CodeStatus, { label: string; icon: string; tone: StatusPillTone }> = {
  active: { label: "Active", icon: "check_circle", tone: "success" },
  suspended: { label: "Suspended", icon: "pause_circle", tone: "neutral" },
  expired: { label: "Expired", icon: "event_busy", tone: "major" },
};

/** A stored status value ("active" for anything else, or none). */
export function parseCodeStatus(raw: unknown): CodeStatus {
  const v = String(raw ?? "").trim().toLowerCase();
  return v === "suspended" || v === "expired" ? v : "active";
}

/** A code as it stands now: expired once its expiry has passed (before the chain has taken it out), else its stored status. */
export function codeStatusNow(c: Pick<AccessCode, "status" | "expiresAt">, now = Date.now()): CodeStatus {
  return c.status === "active" && c.expiresAt !== null && c.expiresAt <= now ? "expired" : c.status;
}

/** A keypad code hidden but its last two digits ("••••03"). */
export function maskCode(code: string): string {
  return code.length > 2 ? `${"•".repeat(code.length - 2)}${code.slice(-2)}` : code;
}

/** Where a kind of code lives: its asset type, market relation, name prefix and list key. */
export interface CodeAssetConfig {
  type: string;
  relation: string;
  prefix: string;
  listKey: string;
}

export function codeAssetConfig(s: FuelDashboardSettings, kind: CodeKind): CodeAssetConfig {
  return kind === "users"
    ? { type: s.userCodeAssetType, relation: s.userCodeRelation, prefix: s.userCodePrefix, listKey: s.userCodesKey }
    : { type: s.vehicleCodeAssetType, relation: s.vehicleCodeRelation, prefix: s.vehicleCodePrefix, listKey: s.vehicleCodesKey };
}

/** The keypad code from a code asset's name: "USR-125003" → "125003" (case-insensitive prefix). */
export function codeFromAssetName(name: string, prefix: string): string {
  return prefix && name.toUpperCase().startsWith(prefix.toUpperCase()) ? name.slice(prefix.length) : name;
}

/** A market's two code lists (built from its code assets): its own and its sites' (each code's `siteId`). */
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

/** A station's limits from its attributes; a missing total falls back to `fallbackTotal`,
 *  a missing per-list limit to the total (no separate cap). */
export function parseCodeLimits(total: unknown, users: unknown, vehicles: unknown, fallbackTotal: number): CodeLimits {
  const num = (v: unknown) => {
    const n = Number(v);
    return v != null && v !== "" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
  };
  const t = num(total) ?? fallbackTotal;
  return { total: t, users: num(users) ?? t, vehicles: num(vehicles) ?? t };
}

/** A market's limits: the smallest of its stations' (every station holds every code). */
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

/** How many more codes a scope can take — of each list and in all — before a station it reaches is full. */
export interface CodeRoom {
  users: number;
  vehicles: number;
  total: number;
}

/** A scope's own codes in a list: the market's ("") or one site's — active ones only (a suspended or expired code's slot is free). */
export function scopeCodes(market: MarketNode, siteId: string, kind: CodeKind): AccessCode[] {
  return market.codes[kind].filter((c) => c.siteId === siteId && c.status === "active");
}

/**
 * The codes a site's stations hold of a list: the market's, then the site's
 * own (the backend merges them into the PLC's list in that order).
 */
export function siteCodeCount(market: MarketNode, siteId: string, kind: CodeKind): number {
  return scopeCodes(market, "", kind).length + (siteId ? scopeCodes(market, siteId, kind).length : 0);
}

/**
 * The room a scope has left. A market code goes to every station of the
 * market — beside that station's site codes — and fills a slot of the
 * market's own list (its length: the market's limits); a site code goes to
 * that site's stations. So the room is what the fullest of them has left.
 */
export function codeRoom(market: MarketNode, siteId: string): CodeRoom {
  const left = (limits: CodeLimits, sid: string): CodeRoom => {
    const users = siteCodeCount(market, sid, "users");
    const vehicles = siteCodeCount(market, sid, "vehicles");
    return { users: limits.users - users, vehicles: limits.vehicles - vehicles, total: limits.total - users - vehicles };
  };
  const site = siteId ? market.sites.find((x) => x.id === siteId) : null;
  const rooms = siteId
    ? [left(site?.limits ?? market.limits, siteId)]
    : [left(market.limits, ""), ...market.sites.flatMap((x) => (x.limits ? [left(x.limits, x.id)] : []))];
  return rooms.reduce((a, r) => ({
    users: Math.min(a.users, r.users),
    vehicles: Math.min(a.vehicles, r.vehicles),
    total: Math.min(a.total, r.total),
  }));
}

/** Why `scope` (its name: a site's, a market's) can't take `count` more `kind` codes, or null. */
export function codeRoomReason(room: CodeRoom, kind: CodeKind, scope: string, count = 1): string | null {
  if (room.total < count) {
    return `${scope}'s stations are full — no room for another code.`;
  }
  if (room[kind] < count) {
    return `${scope}'s stations have no room for another ${codeKindLabel(kind, true).toLowerCase()} code.`;
  }
  return null;
}

/** A pump's user / vehicle code slots: fixed-length lists of code strings, "" = empty slot. */
export type PumpCodeSlots = Record<CodeKind, string[]>;

/** A code-list attribute value as its slots ([] when missing or unreadable). */
export function parseCodeSlots(raw: unknown): string[] {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = raw.trim() === "" ? [] : JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((v: any) => (v == null ? "" : typeof v === "object" ? String(v.code ?? "").trim() : String(v).trim()));
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

/** What the import-codes form submits: the ready lines of the paste (the market is the one it was opened for). */
export interface ImportCodesRequest {
  codes: AssignCodeRequest[];
}

/** Why a pasted line will be skipped by the import. */
export type ImportProblem = "invalid" | "noName" | "noKind" | "duplicate" | "taken" | "overLimit";

export interface ImportProblemMeta {
  label: string;
  icon: string;
  tone: StatusPillTone;
  /** The pill's tooltip. */
  hint: string;
}

export const IMPORT_PROBLEM_META: Record<ImportProblem, ImportProblemMeta> = {
  invalid: { label: "Not 6 digits", icon: "error", tone: "error", hint: "Codes are 6 digits — keep leading zeros." },
  noName: { label: "No name", icon: "error", tone: "error", hint: "Every code needs the user's or vehicle's name." },
  noKind: { label: "No type", icon: "error", tone: "error", hint: "Every line needs its type: User or Vehicle." },
  duplicate: { label: "Duplicate", icon: "content_copy", tone: "neutral", hint: "The same code appears earlier in the paste." },
  taken: { label: "In use", icon: "link", tone: "neutral", hint: "This code is already assigned." },
  overLimit: { label: "Over limit", icon: "block", tone: "major", hint: "The market has no room left for this code." },
};

/** One line of a pasted code list, as the import form previews it. */
export interface ImportCodeLine {
  /** 1-based line number in the paste (the preview's track key). */
  line: number;
  /** The code as read (digits; "" when the line has none). */
  code: string;
  name: string;
  /** The list it goes to; null when the line doesn't say ("noKind"). */
  kind: CodeKind | null;
  /** Why it will be skipped; null when it will be imported. */
  problem: ImportProblem | null;
}

/** Words a pasted type cell may use for each list (compared lower-case) — only
 *  the list's own names, so a name like "Truck" is never taken for a type. */
const IMPORT_KIND_WORDS: Record<string, CodeKind> = {
  user: "users",
  users: "users",
  u: "users",
  usr: "users",
  vehicle: "vehicles",
  vehicles: "vehicles",
  v: "vehicles",
  veh: "vehicles",
};

/** A header line's cells. */
const IMPORT_HEADER_WORDS = /^(access )?(code|codes|name|names|holder|type|list|user|users|vehicle|vehicles)$/i;

/** Split one pasted line into its cells: tabs (a spreadsheet copy), else semicolons, else commas — quoted cells kept whole. */
function splitImportLine(line: string): string[] {
  const delimiter = line.includes("\t") ? "\t" : line.includes(";") && !line.includes(",") ? ";" : ",";
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cell += '"'; // an escaped quote inside a quoted cell
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === delimiter && !quoted) {
      cells.push(cell);
      cell = "";
    } else {
      cell += ch;
    }
  }
  cells.push(cell);
  return cells.map((c) => c.trim());
}

/**
 * Read a pasted code list (CSV / TSV) into its lines: one code per line — the
 * 6-digit code, the holder's name and its list (User / Vehicle, any case;
 * `u` / `v` work too), in any column order; the name is whatever cells are
 * left (joined). Separators: tabs (a copy from a spreadsheet), semicolons or
 * commas; quoted cells stay whole. A leading header line (no code, cells like
 * "code" / "name") and blank lines are skipped. Each line carries its
 * {@link ImportProblem}: a code that isn't 6 digits, a missing name or type,
 * a repeat of an earlier line, or a code in `taken` (already assigned anywhere).
 */
export function parseCodeImport(text: string, taken: Set<string>): ImportCodeLine[] {
  const lines: ImportCodeLine[] = [];
  const seen = new Set<string>();
  const digits = (c: string) => c.replace(/[\s-]/g, "");
  text.split(/\r?\n/).forEach((raw, i) => {
    const cells = splitImportLine(raw).filter((c) => c !== "");
    if (!cells.length) {
      return;
    }
    let codeIdx = cells.findIndex((c) => /^\d{6}$/.test(digits(c)));
    if (codeIdx < 0 && !lines.length && cells.some((c) => IMPORT_HEADER_WORDS.test(c))) {
      return; // the header line
    }
    if (codeIdx < 0) {
      codeIdx = cells.findIndex((c) => /^\d+$/.test(digits(c))); // a number that isn't 6 digits: shown, flagged
    }
    const code = codeIdx >= 0 ? digits(cells[codeIdx]) : "";
    const rest = cells.filter((_, idx) => idx !== codeIdx);
    // The type is normally the last column, so the last cell naming a list wins.
    const kindIdx = rest.map((c) => c.toLowerCase() in IMPORT_KIND_WORDS).lastIndexOf(true);
    const kind = kindIdx >= 0 ? IMPORT_KIND_WORDS[rest[kindIdx].toLowerCase()] : null;
    const name = rest
      .filter((_, idx) => idx !== kindIdx)
      .join(" ")
      .trim();
    let problem: ImportProblem | null = null;
    if (!/^\d{6}$/.test(code)) {
      problem = "invalid";
    } else if (!name) {
      problem = "noName";
    } else if (!kind) {
      problem = "noKind";
    } else if (seen.has(code)) {
      problem = "duplicate";
    } else if (taken.has(code)) {
      problem = "taken";
    }
    if (code.length === 6) {
      seen.add(code);
    }
    lines.push({ line: i + 1, code, name, kind, problem });
  });
  return lines;
}

/**
 * The lines the scope has no room for, flagged "overLimit": the ready lines
 * are counted in order against its {@link CodeRoom} (of each list and in all).
 */
export function markImportLimits(lines: ImportCodeLine[], room: CodeRoom): ImportCodeLine[] {
  const left = { ...room };
  return lines.map((l) => {
    if (l.problem || !l.kind) {
      return l;
    }
    if (left.total < 1 || left[l.kind] < 1) {
      return { ...l, problem: "overLimit" };
    }
    left.total--;
    left[l.kind]--;
    return l;
  });
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

/** The fuel types a pump can be set to (its Settings tab, a new pump's form). */
export const FUEL_TYPES = ["Diesel", "Unleaded", "Premium", "DEF"];

/** A new pump, from a station's "Add pump": the device, its pump label and fuel type. */
export interface AddPumpRequest {
  /** The device name — product-site-pump-# after its station's ({@link pumpDeviceName}). */
  name: string;
  label: string;
  pumpLabel: string;
  fuelType: string;
}

/**
 * The product-site part a station's devices are named by: "dev-inf" from its
 * PLC's "dev-inf-plc-01", else from one of its pumps' "dev-inf-pump-02"; ""
 * when neither follows product-site-plc-# / product-site-pump-#.
 */
export function pumpNamePrefix(plcName: string, pumpNames: string[]): string {
  const fromPlc = /^(.+)-plc-?\d+$/i.exec(plcName.trim());
  if (fromPlc) {
    return fromPlc[1];
  }
  for (const name of pumpNames) {
    const fromPump = /^(.+)-pump-?\d+$/i.exec(name.trim());
    if (fromPump) {
      return fromPump[1];
    }
  }
  return "";
}

/** A pump's device name: its station's product-site part, "pump" and its number, two digits ("dev-inf-pump-03"). */
export function pumpDeviceName(prefix: string, num: number): string {
  return `${prefix}-pump-${String(num).padStart(2, "0")}`;
}

/** The first free pump number after the highest one in use under `prefix`. */
export function nextPumpNumber(prefix: string, deviceNames: string[]): number {
  const own = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-pump-?(\\d+)$`, "i");
  const used = deviceNames.map((n) => own.exec(n.trim())).filter((m): m is RegExpExecArray => !!m).map((m) => Number(m[1]));
  return used.length ? Math.max(...used) + 1 : 1;
}

/** A pump label from a device name: "P" and its trailing number, two digits ("dev-inf-pump-3" → "P03"); "" without one. */
export function pumpLabelFromName(name: string): string {
  const m = /(\d+)\s*$/.exec(name);
  return m ? `P${m[1].padStart(2, "0")}` : "";
}

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
  /** The owner's title (the customer's, or the tenant's own) — the alarms panel's sub-label. */
  owner: string;
  /** The gateway it last connected through (`additionalInfo.lastConnectedGateway`); "" when none. */
  lastGatewayId: string;
  /** Site name — the related Site asset, else the {@link FuelDashboardSettings.siteKey} attribute. */
  site: string;
  /** Raw {@link FuelDashboardSettings.siteKey} attribute (fallback for {@link site}). */
  siteAttr: string;
  /** Related Site / Market assets (Market -Contains→ Site -FuelPump→ Pump); "" when unlinked. */
  siteId: string;
  marketId: string;
  market: string;
  fuelType: string;
  /** Its {@link FuelDashboardSettings.pumpLabelKey} attribute ("P01"); "" when unset. */
  pumpLabel: string;
  /** The station (PLC) it belongs to — the PLC linking to it by {@link FuelDashboardSettings.stationPumpRelation}; "" for none. */
  stationId: string;
  status: PumpStatus;
  locked: boolean;
  /** Codes the pump holds: its market's users + vehicles (0 outside a market). */
  codeCount: number;
  /** Whether the pump confirmed its codes (client = shared); null when it has none. */
  codesSync: CodesSyncState;
  /** The code slots sent to the pump (its SHARED user / vehicle code lists). */
  sentCodes: PumpCodeSlots;
  lastDispenseTs: number | null;
  /** Preformatted {@link lastDispenseTs} ("Today 08:42", "—"). */
  lastDispense: string;
  /** Its day so far, as the "Fuel Daily Totals" chain keeps it ({@link FuelDashboardSettings.dayLitresKey}); zeros when it has none for today. */
  today: PumpDayTotals;
  /**
   * Since when the PLC has held an event frame for it ({@link FuelDashboardSettings.eventReadyKey}
   * true): the frame's coming up, or the pump's last report if later (a drain still moving); null while it holds none.
   */
  eventsWaitingSince: number | null;
}

/** A pump's day: litres dispensed, dispenses, denials (and timeouts). */
export interface PumpDayTotals {
  litres: number;
  dispenses: number;
  denied: number;
}

/** A fuel-management market: its fuel-management sites and its code lists. */
export interface MarketNode {
  id: string;
  /** Its label (else its name); `code` is the asset's name (the tables show it, the label in a bubble). */
  name: string;
  code: string;
  /**
   * Its sites: shown by `name` (the asset's label, else its name); `code` is
   * the asset's name (e.g. "C032"); `limits` its most restrictive station's
   * (null: no station there).
   */
  sites: { id: string; name: string; code: string; limits: CodeLimits | null }[];
  /** Its codes: its own (every site) and its sites' (each code's `siteId`). */
  codes: MarketCodes;
  /** Its most restrictive station's (PLC's) limits — the default when it has none; the length of its own code lists. */
  limits: CodeLimits;
}

/** Where a pump sits in the Market → Site hierarchy. */
export interface PumpLocation {
  siteId: string;
  siteName: string;
  marketId: string;
  marketName: string;
}

// ---------------------------------------------------------------------------
// PLCs
// ---------------------------------------------------------------------------

/**
 * A PLC — it holds the code tables of the pumps it drives, so every new code
 * of a market goes to the market's PLCs. Located like a pump (Site -FuelPLC→
 * device, or straight from the Market).
 */
export interface PlcRow {
  plcId: string;
  /** Display name — label when set, else the device name. */
  name: string;
  /** The owner's title (the customer's, or the tenant's own) — the alarms panel's sub-label. */
  owner: string;
  /** Its device profile. */
  type: string;
  /** Raw device name / label / description (the station's Settings tab). */
  deviceName: string;
  deviceLabel: string;
  description: string;
  /** Related Site / Market; "" when unlinked. */
  siteId: string;
  site: string;
  marketId: string;
  /** ThingsBoard's device-state `active` flag (absent = online, like a pump). */
  online: boolean;
  /** The gateway it last connected through (`additionalInfo.lastConnectedGateway`); "" when none. */
  lastGatewayId: string;
  /** Its station's last dispense (its pumps' latest, as the rule chain copies it to the PLC): litres, when, which pump; null / "" for none. */
  lastDispenseVolume: number | null;
  lastDispenseTs: number | null;
  lastDispensePump: string;
  /** Its code capacity — the code-list lengths read back from it (CodeListCapacity), with fallbacks. */
  limits: CodeLimits;
  /**
   * The PLC's transfer flags ({@link FuelDashboardSettings.userCodesXferKey} /
   * {@link FuelDashboardSettings.vehicleCodesXferKey}): true while it is
   * loading that list into its own table, false once done; null when it has
   * never reported one.
   */
  xfer: Record<CodeKind, boolean | null>;
}

/** A PLC's status in the Stations table: offline, loading a code list, or online. */
export function plcStatusMeta(plc: PlcRow): { label: string; icon: string; tone: StatusPillTone } {
  return PLC_STATUS_META[plcStatus(plc)];
}

/** A station's state: offline, loading a code list (a transfer flag up) or online. */
export type PlcStatus = "online" | "updating" | "offline";

/** The statuses in the Stations table's Status filter and sort order (online first). */
export const PLC_STATUSES: PlcStatus[] = ["online", "updating", "offline"];

export const PLC_STATUS_META: Record<PlcStatus, { label: string; icon: string; tone: StatusPillTone }> = {
  online: { label: "Online", icon: "wifi", tone: "success" },
  updating: { label: "Updating", icon: "sync", tone: "warning" },
  offline: { label: "Offline", icon: "wifi_off", tone: "neutral" },
};

export function plcStatus(plc: PlcRow): PlcStatus {
  if (!plc.online) {
    return "offline";
  }
  return plc.xfer.users || plc.xfer.vehicles ? "updating" : "online";
}

/**
 * One row of the Stations table: a station — a PLC and the pumps created by
 * its gateway. A click opens its panel (Insights / Alarms).
 */
export interface StationTableRow {
  /** The PLC's device id (the table's track key). */
  rowKey: string;
  name: string;
  site: string;
  siteId: string;
  market: string;
  marketId: string;
  /** The product line its site belongs to ("" for none). */
  productLine: string;
  productLineId: string;
  /** The Site, Market and Product line columns: each by its name (its code), its label for the bubble ("" when it's the code). */
  siteCode: string;
  siteLabel: string;
  marketCode: string;
  marketLabel: string;
  productLineCode: string;
  productLineLabel: string;
  /** Its PLC's device profile. */
  profile: string;
  /** Its codes — its market's users / vehicles — against the market's limit for each list. */
  userCodes: number;
  userCodeLimit: number;
  vehicleCodes: number;
  vehicleCodeLimit: number;
  status: { label: string; icon: string; tone: StatusPillTone };
  /** The Status filter's and sort's value behind {@link status}. */
  statusId: PlcStatus;
  /** The latest dispense over its pumps. */
  lastDispense: string;
  /** {@link lastDispense} as a time (the column's sort); null when none of its pumps has dispensed. */
  lastDispenseTs: number | null;
  /** Its last dispense's litres ("24 L"; "" when unknown), and the pump it was at. */
  lastDispenseAmount: string;
  lastDispensePump: string;
  /** How many pumps it has (the Pumps column). */
  pumpCount: number;
  plc: PlcRow;
  /** Its pumps (in the location filter's scope), by name. */
  pumps: PumpRow[];
  /** What needs a look ({@link stationAttention}), worst first; empty when nothing does. */
  attention: StationAttentionItem[];
  /** The Attention column's sort ({@link attentionRank}): its worst reason, then how many. */
  attentionRank: number;
}

// ---------------------------------------------------------------------------
// Attention
// ---------------------------------------------------------------------------

/**
 * Why a station needs a look — the Stations table's Attention column and
 * filter, the "Needs attention" row of its summary:
 * - stalled: the PLC has held a pump's event frame for over
 *   {@link EVENT_STALL_MS} — unacked, the drain waits for it (and a late ack
 *   never reaches the PLC once its gateway drops the idle pump);
 * - alarms: its PLC's and pumps' active alarms, toned by the worst;
 * - desynced: a pump's code lists not confirmed back (not while the PLC
 *   loads a list — its Status is Updating then);
 * - codesFull: a code list at {@link CODES_NEARLY_FULL} of its capacity or
 *   more (full: major);
 * - locked: pumps locked out.
 * A pump offline is none: an idle pump goes inactive after its last event.
 * The station's own state is its Status.
 */
export type StationAttention = "stalled" | "alarms" | "desynced" | "codesFull" | "locked";

/** The Attention filter's order (worst first), and "None" — a station with nothing. */
export const STATION_ATTENTIONS: StationAttention[] = ["stalled", "alarms", "desynced", "codesFull", "locked"];
export const NO_ATTENTION = "none";

export const STATION_ATTENTION_META: Record<StationAttention, { label: string; icon: string; tone: StatusPillTone }> = {
  stalled: { label: "Events stalled", icon: "hourglass_top", tone: "error" },
  alarms: { label: "Alarms", icon: "notifications_active", tone: "error" },
  desynced: { label: "Codes not synced", icon: "sync_problem", tone: "warning" },
  codesFull: { label: "Codes nearly full", icon: "data_usage", tone: "warning" },
  locked: { label: "Pumps locked", icon: "lock", tone: "neutral" },
};

/** How long a frame may wait before its drain counts as stalled (a ~200-event drain takes a minute). */
export const EVENT_STALL_MS = 5 * 60_000;
/** A code list this full (of its capacity) needs a look. */
export const CODES_NEARLY_FULL = 0.9;

/** One reason, as its pill shows it ("2 alarms", "User codes 46 / 50"). */
export interface StationAttentionItem {
  kind: StationAttention;
  label: string;
  icon: string;
  tone: StatusPillTone;
}

/** What {@link stationAttention} looks at. */
export interface StationAttentionInput {
  pumps: PumpRow[];
  /** Its PLC's and its pumps' active alarms' severities. */
  alarmSeverities: { tone: StatusPillTone }[];
  /** Its PLC loading a code list (its Status Updating). */
  updating: boolean;
  userCodes: number;
  userCodeLimit: number;
  vehicleCodes: number;
  vehicleCodeLimit: number;
  now: number;
}

/** A tone's weight, worst highest — the order of a station's pills and the column's sort. */
const TONE_WEIGHT: Record<StatusPillTone, number> = { error: 5, major: 4, warning: 3, success: 2, neutral: 1, brand: 1 };

/** A station's reasons for a look, worst first (see {@link StationAttention}). */
export function stationAttention(input: StationAttentionInput): StationAttentionItem[] {
  const items: StationAttentionItem[] = [];
  const add = (kind: StationAttention, label: string, tone = STATION_ATTENTION_META[kind].tone) =>
    items.push({ kind, label, icon: STATION_ATTENTION_META[kind].icon, tone });
  const counted = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  const stalled = input.pumps.filter((p) => p.eventsWaitingSince !== null && input.now - p.eventsWaitingSince > EVENT_STALL_MS);
  if (stalled.length) {
    add("stalled", stalled.length === 1 ? `Events stalled at ${stalled[0].shortName}` : `Events stalled at ${stalled.length} pumps`);
  }
  if (input.alarmSeverities.length) {
    const worst = input.alarmSeverities.reduce((w, a) => (TONE_WEIGHT[a.tone] > TONE_WEIGHT[w] ? a.tone : w), "neutral" as StatusPillTone);
    add("alarms", counted(input.alarmSeverities.length, "alarm", "alarms"), worst);
  }
  if (!input.updating && input.pumps.some((p) => p.codesSync === "desynced")) {
    add("desynced", STATION_ATTENTION_META.desynced.label);
  }
  const fill = (label: string, used: number, limit: number) => {
    if (limit > 0 && used >= limit * CODES_NEARLY_FULL) {
      add("codesFull", `${label} ${used} / ${limit}`, used >= limit ? "major" : "warning");
    }
  };
  fill("User codes", input.userCodes, input.userCodeLimit);
  fill("Vehicle codes", input.vehicleCodes, input.vehicleCodeLimit);
  const locked = input.pumps.filter((p) => p.locked).length;
  if (locked) {
    add("locked", counted(locked, "pump locked", "pumps locked"));
  }
  return items.sort((a, b) => TONE_WEIGHT[b.tone] - TONE_WEIGHT[a.tone]);
}

/** The Attention column's sort value: its worst reason's weight, then how many it has (none: 0). */
export function attentionRank(items: StationAttentionItem[]): number {
  return items.length ? TONE_WEIGHT[items[0].tone] * 10 + Math.min(items.length, 9) : 0;
}

/** `additionalInfo.lastConnectedGateway` of a device (the JSON entity field); "" when none. */
export function lastConnectedGateway(additionalInfo: unknown): string {
  try {
    const info = typeof additionalInfo === "string" ? JSON.parse(additionalInfo) : additionalInfo;
    return String((info as any)?.lastConnectedGateway ?? "");
  } catch {
    return "";
  }
}

/** Whether a PLC can take a new code of a list right now (the pill in the assign form). */
export type PlcReadiness = "ready" | "updating" | "offline" | "unknown";

export const PLC_READINESS_META: Record<PlcReadiness, { label: string; icon: string; tone: StatusPillTone }> = {
  ready: { label: "Ready", icon: "check_circle", tone: "success" },
  updating: { label: "Updating", icon: "sync", tone: "warning" },
  offline: { label: "Offline", icon: "wifi_off", tone: "neutral" },
  unknown: { label: "Unknown", icon: "help", tone: "neutral" },
};

/**
 * A PLC is ready for a new code of `kind` when it is online and its transfer
 * flag for that list is false — true means it is still loading the last list
 * it was sent (the list must not change meanwhile, so a new code waits).
 */
export function plcReadiness(plc: PlcRow, kind: CodeKind): PlcReadiness {
  if (!plc.online) {
    return "offline";
  }
  const xfer = plc.xfer[kind];
  return xfer === null ? "unknown" : xfer ? "updating" : "ready";
}

/** The readiness pill's tooltip. */
export function plcReadinessHint(readiness: PlcReadiness, kind: CodeKind): string {
  const single = codeKindLabel(kind, true).toLowerCase();
  switch (readiness) {
    case "ready":
      return `Ready to take a new ${single} code`;
    case "updating":
      return `Still loading its ${single} codes — not ready for a new one`;
    case "offline":
      return "Offline — not ready for a new code";
    default:
      return "Hasn't reported whether it is ready for a new code";
  }
}

/**
 * The assign / import confirmation's text when some of the market's stations
 * (PLCs) aren't ready for a new code of `kind` (`count` of them for an
 * import); null when every one is ready (or the market has none).
 */
export function plcNotReadyWarning(plcs: PlcRow[], kind: CodeKind, count = 1): { heading: string; message: string } | null {
  const notReady = plcs
    .map((plc) => ({ plc, readiness: plcReadiness(plc, kind) }))
    .filter((x) => x.readiness !== "ready");
  if (!notReady.length) {
    return null;
  }
  const single = codeKindLabel(kind, true).toLowerCase();
  const names = notReady.map((x) => `${x.plc.name} (${PLC_READINESS_META[x.readiness].label})`).join(", ");
  const these = count === 1 ? "this code" : `these ${count} codes`;
  const anyway = count === 1 ? "Assign it anyway?" : "Import them anyway?";
  return notReady.length === 1
    ? {
        heading: "Station not ready",
        message: `${names} isn't ready for a new ${single} code, so it won't receive ${these}. ${anyway}`,
      }
    : {
        heading: "Stations not ready",
        message: `${notReady.length} stations aren't ready for a new ${single} code — ${names} — so they won't receive ${these}. ${anyway}`,
      };
}

/** One code in the Access codes table (a market's users and vehicles together). */
export interface AccessCodeRow {
  code: string;
  name: string;
  kind: CodeKind;
  /** "User" / "Vehicle". */
  type: string;
  /** The market the code is in — its label (else its name); the Market column shows its code, the label in a bubble. */
  marketId: string;
  market: string;
  marketCode: string;
  marketLabel: string;
  /** Its scope: the site it's limited to ("" for every site of its market) — the Site column shows its code ("All sites"), the label in a bubble. */
  siteId: string;
  site: string;
  siteCode: string;
  siteLabel: string;
  /** When it was issued ("Today 9:15 AM", "Sep 21 2:10 PM"). */
  added: string;
  /** Its keypad code hidden but its last two digits ({@link maskCode}) — the Code column (the copy button copies the code). */
  masked: string;
  /** Its state now ({@link codeStatusNow}) and its pill. */
  status: CodeStatus;
  statusMeta: { label: string; icon: string; tone: StatusPillTone };
  /** Its last day ("Dec 31, 2026"; "" never), and whether that's within {@link CODE_EXPIRY_SOON_MS} (and not past). */
  expires: string;
  expiresSoon: boolean;
  source: AccessCode;
}

/** An expiry this close is shown in yellow. */
export const CODE_EXPIRY_SOON_MS = 7 * 24 * 3600_000;

/**
 * A code expires at the end of its last day (the viewer's midnight after it):
 * that day's "YYYY-MM-DD" (a date input's value) to the time stored.
 */
export function expiryFromDate(date: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1).getTime() : null;
}

/** A stored expiry's last day, as a date input's "YYYY-MM-DD" ("" none). */
export function expiryDateOf(expiresAt: number | null): string {
  if (expiresAt === null) {
    return "";
  }
  const d = new Date(expiresAt - 1);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

/** A stored expiry's last day ("Dec 31, 2026"; "" none). */
export function formatExpiry(expiresAt: number | null): string {
  return expiresAt === null ? "" : formatDate(expiresAt - 1);
}

export function toAccessCodeRow(
  c: AccessCode,
  kind: CodeKind,
  market: Pick<MarketNode, "id" | "name" | "code" | "sites">,
  now = Date.now()
): AccessCodeRow {
  const code = market.code || market.name;
  const status = codeStatusNow(c, now);
  const site = c.siteId ? market.sites.find((x) => x.id === c.siteId) : null;
  const siteCode = c.siteId ? site?.code || site?.name || "—" : "All sites";
  return {
    code: c.code,
    name: c.name || "—",
    kind,
    type: codeKindLabel(kind, true),
    marketId: market.id,
    market: market.name,
    marketCode: code,
    marketLabel: market.name !== code ? market.name : "",
    siteId: c.siteId,
    site: site?.name ?? (c.siteId ? "" : "All sites"),
    siteCode,
    siteLabel: site && site.name !== siteCode ? site.name : "",
    added: formatWhen(c.createdAt || null),
    masked: maskCode(c.code),
    status,
    statusMeta: CODE_STATUS_META[status],
    expires: formatExpiry(c.expiresAt),
    expiresSoon: status === "active" && c.expiresAt !== null && c.expiresAt - now <= CODE_EXPIRY_SOON_MS,
    source: c,
  };
}

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

export type PumpEventType =
  | "dispense"
  | "denied_invalid_vehicle"
  | "denied_invalid_user"
  | "denied_invalid_user_pin"
  | "denied_odometer"
  | "denied_hours"
  | "pump_timeout"
  | "code_assigned"
  | "code_revoked"
  | "code_suspended"
  | "code_resumed"
  | "code_expired"
  | "code_updated"
  | "locked"
  | "unlocked"
  | "offline"
  | "online";

/** JSON payload of one {@link FuelDashboardSettings.eventKey} time-series point. */
export interface PumpEvent {
  type: PumpEventType;
  /** What happened, in a sentence — the Activity table's Description column. */
  description?: string;
  /** The user's keypad code (a dispense, or a change to a user code). */
  userCode?: string;
  /** The vehicle's keypad code (a dispense, or a change to a vehicle code). */
  vehicleCode?: string;
  /** Odometer reading at a dispense. */
  odometer?: number | string;
  /** Vehicle hours at a dispense. */
  hours?: number | string;
  /** Litres dispensed. */
  fuelVolume?: number | string;
  /** Who made the change (a code assigned / revoked from the dashboard): their name, else their email. */
  by?: string;
}

/** The changes to a code the dashboard logs (and the expiry chain: "code_expired"). */
export type CodeChangeType = "code_assigned" | "code_revoked" | "code_suspended" | "code_resumed" | "code_expired" | "code_updated";

/** A code change event as the dashboard logs it on a market: the code under
 *  `userCode` or `vehicleCode` by its list, who made it (`by`), and a
 *  description, e.g. "User code 593304 (Steffen) assigned to C032 in Greater
 *  Edmonton Area by Jane Smith." */
export function codeChangeEvent(
  type: CodeChangeType,
  kind: CodeKind,
  code: string,
  holder: string,
  marketName: string,
  /** A site code's site (its name): "assigned to C032 in Greater Edmonton Area". */
  siteName = "",
  /** Who made the change (their name, else their email); "" when unknown. */
  by = "",
  /** An edit's changes ("holder renamed to Jane Smith, expiry set to Dec 31, 2026"). */
  change = ""
): PumpEvent {
  const who = holder ? ` (${holder})` : "";
  const where = siteName ? `${siteName} in ${marketName}` : marketName;
  const what: Record<CodeChangeType, string> = {
    code_assigned: `assigned to ${where}`,
    code_revoked: `revoked from ${where}`,
    code_suspended: `suspended in ${where}`,
    code_resumed: `resumed in ${where}`,
    code_expired: `expired in ${where}`,
    code_updated: `edited (${change})`,
  };
  const description = `${codeKindLabel(kind, true)} code ${code}${who} ${what[type]}${by ? ` by ${by}` : ""}.`;
  const event: PumpEvent = kind === "users" ? { type, description, userCode: code } : { type, description, vehicleCode: code };
  return by ? { ...event, by } : event;
}

/**
 * The Description column: the event's `description`, or — for an event without
 * one — its details joined, e.g. "User 593304 · Vehicle 125003 · 87.4 L".
 */
export function eventDescription(e: PumpEvent): string {
  const text = (v: unknown) => (v == null ? "" : String(v).trim());
  if (text(e.description)) {
    return text(e.description);
  }
  const volume = Number(e.fuelVolume);
  return [
    text(e.userCode) && `User ${text(e.userCode)}`,
    text(e.vehicleCode) && `Vehicle ${text(e.vehicleCode)}`,
    text(e.fuelVolume) && isFinite(volume) ? `${volume.toFixed(1)} L` : "",
    text(e.odometer) && `Odometer ${text(e.odometer)}`,
    text(e.hours) && `Hours ${text(e.hours)}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Activity filter chip group an event belongs to. */
export type ActivityGroup = "dispense" | "denied" | "codes" | "status";

export const EVENT_META: Record<PumpEventType, { label: string; icon: string; tone: StatusPillTone; group: ActivityGroup }> = {
  dispense: { label: "Dispense", icon: "local_gas_station", tone: "brand", group: "dispense" },
  // A denial by its reason (the Events filter groups them as "Denied").
  denied_invalid_vehicle: { label: "Unknown vehicle", icon: "block", tone: "error", group: "denied" },
  denied_invalid_user: { label: "Unknown user", icon: "block", tone: "error", group: "denied" },
  denied_invalid_user_pin: { label: "Wrong PIN", icon: "block", tone: "error", group: "denied" },
  denied_odometer: { label: "Odometer rejected", icon: "block", tone: "error", group: "denied" },
  denied_hours: { label: "Hours rejected", icon: "block", tone: "error", group: "denied" },
  pump_timeout: { label: "Pump timeout", icon: "timer_off", tone: "warning", group: "denied" },
  code_assigned: { label: "Code assigned", icon: "key", tone: "success", group: "codes" },
  code_revoked: { label: "Code revoked", icon: "link_off", tone: "neutral", group: "codes" },
  code_suspended: { label: "Code suspended", icon: "pause_circle", tone: "neutral", group: "codes" },
  code_resumed: { label: "Code resumed", icon: "play_circle", tone: "success", group: "codes" },
  code_expired: { label: "Code expired", icon: "event_busy", tone: "major", group: "codes" },
  code_updated: { label: "Code edited", icon: "edit", tone: "brand", group: "codes" },
  locked: { label: "Pump locked", icon: "lock", tone: "warning", group: "status" },
  unlocked: { label: "Pump unlocked", icon: "lock_open", tone: "warning", group: "status" },
  offline: { label: "Pump offline", icon: "wifi_off", tone: "neutral", group: "status" },
  online: { label: "Pump online", icon: "wifi", tone: "success", group: "status" },
};

/**
 * The Stations page's Activity Events filter: one option per station event
 * group (none checked = all). Code changes ("codes") are the Codes page's own
 * Activity, so they never show on the Stations page.
 */
export const ACTIVITY_FILTERS: { id: ActivityGroup; label: string }[] = [
  { id: "dispense", label: "Dispense" },
  { id: "denied", label: "Denied" },
  { id: "status", label: "Status" },
];

/** Activity time windows (the sidebar picker's 1D / 3D / 1W / 2W / 1M; a custom range comes from its calendar). */
export const ACTIVITY_TIMEFRAMES: { id: string; ms: number }[] = [
  { id: "1D", ms: 24 * 3600 * 1000 },
  { id: "3D", ms: 3 * 24 * 3600 * 1000 },
  { id: "1W", ms: 7 * 24 * 3600 * 1000 },
  { id: "2W", ms: 14 * 24 * 3600 * 1000 },
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
  /** What happened ({@link eventDescription}); "—" when the event says nothing more. */
  description: string;
  /** A code change's list (by its `userCode` / `vehicleCode`); null for every other event. */
  codeKind: CodeKind | null;
  /** A dispense's litres (its `fuelVolume`); null for any other event, or a dispense that reported none. */
  volume: number | null;
  /** The keypad codes it names ("" none) — a dispense's user and vehicle, a denial's, a code change's. */
  userCode: string;
  vehicleCode: string;
  /** A dispense's odometer and engine hours as entered; null when it reported none. */
  odometer: number | null;
  hours: number | null;
  /** Who made a code change ("" for anything else, or unknown). */
  by: string;
}

/**
 * A row of the Stations page's Activity table: the event with where it
 * happened (its pump's station, site and market) and who — its codes'
 * holders by name, where the codes are still assigned — for the columns,
 * the search and the CSV.
 */
export interface StationActivityRow extends ActivityRow {
  station: string;
  site: string;
  market: string;
  userName: string;
  vehicleName: string;
  /** The litres, odometer and hours as shown ("" none). */
  litres: string;
  odometerText: string;
  hoursText: string;
}

/**
 * A row of a code panel's Activity: one of the code's events — a dispense or
 * a denial at a pump of its scope (where: the station and pump), or a change
 * of it (where: its market) — with its litres as shown ("" none).
 */
export interface CodeActivityRow extends ActivityRow {
  where: string;
  litres: string;
}

/** A code panel's usage windows (the pumps' events read for it). */
export const CODE_USAGE_TIMEFRAMES: { id: string; ms: number }[] = [
  { id: "1W", ms: 7 * 24 * 3600 * 1000 },
  { id: "1M", ms: 30 * 24 * 3600 * 1000 },
  { id: "3M", ms: 91 * 24 * 3600 * 1000 },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** An empty slot in a market's fixed-length code list. */
export const EMPTY_CODE_SLOT = "";

/**
 * A market code-list attribute as its `length` slots: parsed (a missing value is
 * all empty), padded with empty slots, trailing empty slots beyond `length`
 * trimmed. Throws when it isn't an array or holds a code beyond `length` — a
 * code is never dropped to make it fit.
 */
function codeSlots(raw: unknown, length: number): string[] {
  const empty = raw == null || raw === "";
  const value: unknown = empty ? [] : typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!Array.isArray(value)) {
    throw new Error("The market's code list isn't an array.");
  }
  const slots = value.map((v) => (v == null ? EMPTY_CODE_SLOT : String(v)));
  if (slots.slice(length).some((v) => v !== EMPTY_CODE_SLOT)) {
    throw new Error(`The market's code list has codes beyond its ${length} slots.`);
  }
  return [...slots.slice(0, length), ...new Array<string>(Math.max(0, length - slots.length)).fill(EMPTY_CODE_SLOT)];
}

/** The slots written back in the attribute's own type (a JSON string stays a
 *  string), or null when nothing changed. */
function slotsValue(raw: unknown, slots: string[]): unknown {
  const empty = raw == null || raw === "";
  const next = JSON.stringify(slots);
  if (!empty && (typeof raw === "string" ? raw : JSON.stringify(raw)) === next) {
    return null;
  }
  return typeof raw === "string" && !empty ? next : slots;
}

/**
 * A market's fixed-length code list with `code` in its first empty slot (the
 * list fitted to `length` slots), or null when nothing changes. Throws when
 * every slot is taken or the value isn't a code list.
 */
export function withCode(raw: unknown, code: string, length: number): unknown {
  return withCodes(raw, [code], length);
}

/**
 * {@link withCode} for several codes at once (an import): each goes into the
 * next empty slot, one already in the list stays where it is. Throws when the
 * slots run out — then none of them is written.
 */
export function withCodes(raw: unknown, codes: string[], length: number): unknown {
  const slots = codeSlots(raw, length);
  for (const code of codes) {
    if (slots.includes(code)) {
      continue;
    }
    const free = slots.indexOf(EMPTY_CODE_SLOT);
    if (free < 0) {
      throw new Error(`All ${length} code slots are taken.`);
    }
    slots[free] = code;
  }
  return slotsValue(raw, slots);
}

/**
 * A market's fixed-length code list with `code`'s slot cleared in place (every
 * other code keeps its index; the list fitted to `length` slots), or null when
 * nothing changes.
 */
export function withoutCode(raw: unknown, code: string, length: number): unknown {
  return withoutCodes(raw, [code], length);
}

/** {@link withoutCode} for several codes at once (a bulk revoke): one read-modify-write for all of them. */
export function withoutCodes(raw: unknown, codes: string[], length: number): unknown {
  const gone = new Set(codes);
  return slotsValue(
    raw,
    codeSlots(raw, length).map((v) => (gone.has(v) ? EMPTY_CODE_SLOT : v))
  );
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

/** A boolean attribute that may not have been reported yet: null when absent. */
export function parseOptionalBool(raw: unknown): boolean | null {
  return raw == null || raw === "" ? null : parseBool(raw);
}

/** "P01" from "Pump 01" / "pump-1"; otherwise the name itself. */
export function shortPumpName(name: string): string {
  return pumpLabelFromName(name) || name;
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
