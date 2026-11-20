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

// ESF's security settings, as its console's Security page groups them — the gateway page's ESF Security view: the certificates the
// unit's keystores hold (the Keystores v1 REST API, `rest.keystores`), then its SSL, keystores, HTTP service, web console, network
// threat protection and tamper detection components (Configuration v2). The Configuration view's list leaves those out.

import { esfList } from "./esf.models";

/** A component with its factory (`esfComponentFactories`, ESF's `pidsWithFactory`). */
export interface EsfComponentFactory {
  pid: string;
  factoryPid: string;
}

const text = (v: unknown) => (v === undefined || v === null ? "" : String(v));

export function parseEsfComponentFactories(reply: unknown): EsfComponentFactory[] {
  return esfList(reply, "components").map((c: any) => ({ pid: text(c?.pid), factoryPid: text(c?.factoryPid) })).filter((c) => c.pid);
}

/** A tab of the Security view: its components (Configuration v2), or — the first — the certificates. */
export type EsfSecurityTab = "certificates" | "ssl" | "keystores" | "http" | "console" | "threats" | "tamper";

export interface EsfSecuritySection {
  id: EsfSecurityTab;
  label: string;
  /** Its components, as the unit has them (none: the tab says the unit has none). */
  pids: string[];
  /** Its components with their factories (an instances table's rows). */
  components: EsfComponentFactory[];
  /**
   * Instances of a factory, as many as the unit has (SSL managers, keystores): a table of them (Service PID, Factory PID), a row
   * opening its settings in the side panel — ESF's console's "Allows to create and manage … instances". Else its settings in place.
   */
  instances: boolean;
  /** What one instance is called ("SSL manager", "keystore"; "" not an instances tab). */
  noun: string;
  /** The unit's factories that make its instances (`esfFactoryComponents`), for "Create new". */
  factories: string[];
}

const SSL = "org.eclipse.kura.ssl.SslManagerService";

/** Which components a tab holds, by their pid or their factory's — ESF's console's Security page's tabs. */
const SECTIONS: {
  id: Exclude<EsfSecurityTab, "certificates">;
  label: string;
  /** An instances tab: what one of its rows is called ("SSL manager"), and the factories that make them. */
  instance?: { noun: string; factory: (factoryPid: string) => boolean };
  holds: (c: EsfComponentFactory) => boolean;
}[] = [
  { id: "ssl", label: "SSL", instance: { noun: "SSL manager", factory: (f) => f === SSL }, holds: (c) => c.pid === SSL || c.factoryPid === SSL },
  {
    id: "keystores",
    label: "Keystores",
    instance: { noun: "keystore", factory: (f) => /keystore/i.test(f) },
    holds: (c) => /keystore/i.test(c.factoryPid),
  },
  { id: "http", label: "HTTP service", holds: (c) => c.pid === "org.eclipse.kura.http.server.manager.HttpService" },
  { id: "console", label: "Web console", holds: (c) => c.pid === "org.eclipse.kura.web.Console" },
  { id: "threats", label: "Network threats", holds: (c) => /FloodingProtection|Fail2Ban/i.test(c.pid) },
  { id: "tamper", label: "Tamper detection", holds: (c) => /TamperDetection/i.test(c.pid) },
];

/**
 * The Security view's tabs — always these seven, as ESF's console's Security page has them on every unit: shown at once, nothing
 * read for them (each tab's content is the unit's).
 */
export const ESF_SECURITY_TABS: { id: EsfSecurityTab; label: string }[] = [
  { id: "certificates", label: "Certificates" },
  ...SECTIONS.map((s) => ({ id: s.id, label: s.label })),
];

/**
 * Each tab's components on a unit (in its list's order; none: the tab says so) and, an instances tab, the unit's factories that
 * make them (`factories`: the unit's factory pids), so one can be made.
 */
export function esfSecuritySections(components: EsfComponentFactory[], factories: string[] = []): EsfSecuritySection[] {
  const tabs: EsfSecuritySection[] = [{ id: "certificates", label: "Certificates", pids: [], components: [], instances: false, noun: "", factories: [] }];
  for (const s of SECTIONS) {
    const held = components.filter((c) => s.holds(c));
    const makers = s.instance ? factories.filter((f) => s.instance!.factory(f)) : [];
    tabs.push({ id: s.id, label: s.label, pids: held.map((c) => c.pid), components: held, instances: !!s.instance, noun: s.instance?.noun ?? "", factories: makers });
  }
  return tabs;
}

/** A new instance's PID: what's wrong with it ("" nothing) — needed, without spaces or odd characters, not one the unit has. */
export function esfInstancePidError(pid: string, existing: string[]): string {
  const p = pid.trim();
  if (!p) {
    return "Required";
  }
  if (!/^[A-Za-z0-9._-]+$/.test(p)) {
    return "Letters, digits, dots, dashes and underscores only";
  }
  return existing.includes(p) ? "The unit already has one of this name" : "";
}

/** `esfCreateFactoryComponent`'s body: an instance of the factory, its settings its defaults, a snapshot taken. */
export function esfCreateInstanceRequest(pid: string, factoryPid: string): Record<string, unknown> {
  return { configs: [{ pid: pid.trim(), factoryPid, properties: {} }], takeSnapshot: true };
}

/** `esfDeleteFactoryComponents`' body: the instances deleted, a snapshot taken. */
export function esfDeleteInstancesRequest(pids: string[]): Record<string, unknown> {
  return { pids, takeSnapshot: true };
}

/** Every component the Security view shows (the Configuration view's list leaves them out). */
export function esfSecurityPids(components: EsfComponentFactory[]): Set<string> {
  return new Set(components.filter((c) => SECTIONS.some((s) => s.holds(c))).map((c) => c.pid));
}

/** A certificate or key a keystore holds (the certificates' table): its alias, subject, type, keystore and validity. */
export interface EsfCertificate {
  key: string;
  alias: string;
  subject: string;
  type: string;
  keystore: string;
  /** Its validity's start and end (ms), null when not given. */
  validFrom: number | null;
  validTo: number | null;
}

const ENTRY_TYPES: Record<string, string> = {
  PRIVATE_KEY: "Key pair",
  TRUSTED_CERTIFICATE: "Trusted certificate",
  SECRET_KEY: "Secret key",
  CSR: "Signing request",
};

/** A date ESF gives as ms (a number, or its digits as text — ESF 7.6's entries: "1432720187000"), seconds or a date's text, as ms. */
function timeOf(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v) : NaN;
  if (isFinite(n)) {
    return n < 1e12 ? n * 1000 : n;
  }
  const t = typeof v === "string" && v ? Date.parse(v) : NaN;
  return isFinite(t) ? t : null;
}

/**
 * `esfKeystoreEntries` (Keystores v1 `entries`): every keystore's certificates and keys, by keystore then alias — a list of
 * `{ alias, subjectDN, issuer, type, keystoreServicePid, startDate, expirationDate, algorithm, size }` (dev-inf-gw-01, ESF 7.6.2,
 * its dates ms as text); read tolerantly (`subject`, `validFrom`, … too).
 */
export function parseEsfKeystoreEntries(reply: unknown): EsfCertificate[] {
  const list: any[] = Array.isArray(reply) ? reply : esfList(reply, "entries").length ? esfList(reply, "entries") : esfList(reply, "keystoreEntries");
  return list
    .map((e: any) => {
      const keystore = text(e?.keystoreServicePid ?? e?.keystore);
      const alias = text(e?.alias);
      const rawType = text(e?.type).toUpperCase();
      return {
        key: `${keystore}|${alias}`,
        alias,
        subject: text(e?.subjectDN ?? e?.subject ?? e?.distinguishedName),
        type: ENTRY_TYPES[rawType] ?? (rawType ? rawType.charAt(0) + rawType.slice(1).toLowerCase().replace(/_/g, " ") : ""),
        keystore,
        validFrom: timeOf(e?.startDate ?? e?.validFrom ?? e?.notBefore),
        validTo: timeOf(e?.expirationDate ?? e?.validTo ?? e?.notAfter),
      };
    })
    .sort((a, b) => a.keystore.localeCompare(b.keystore) || a.alias.localeCompare(b.alias));
}
