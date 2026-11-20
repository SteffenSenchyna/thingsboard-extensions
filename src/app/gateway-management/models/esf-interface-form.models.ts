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

// An interface's form, as ESF's own web console lays it out (its Network page: an interface picked, then tabs — IPv4, IPv6,
// Wireless, 802.1x, DHCPv4 & NAT, Advanced, Hardware, Cellular, …): each tab's fields in the console's order, with its labels,
// its choices and its rules (a field greyed out where it doesn't apply). A field's value is text (a choice's value, "true" /
// "false" for a checkbox); it reads from and writes to the interface's NetworkConfigurationService settings — the part of their
// name after `net.interface.<interface>.` ("config.ip4.status") — converting where the console does (a subnet mask for a
// prefix length, "Using DHCP" for `config.dhcpClient4.enabled`). An apply sends only the settings whose value changed.

import { EsfAttribute, EsfComponentConfig, EsfProperty, EsfPropertyType } from "./esf.models";

/** A form's values, by field. */
export type IfValues = Record<string, string>;

/** An interface setting's value as the unit has it (by the part of its name after `net.interface.<interface>.`). */
export type IfRead = (setting: string) => unknown;

/**
 * An interface setting set to a value, as text — made the setting's type (its definition's; else `type`, else a string): a
 * number, true / false.
 */
export type IfWrite = (setting: string, value: string, type?: EsfPropertyType) => void;

/** The interface's status as the unit reports it (Network Status v1: its Wi-Fi channels and scan, its modem's facts). */
export type IfStatus = Record<string, any>;

/** A choice: its value and its label. */
export interface IfOption {
  value: string;
  label: string;
  /** What picking it means (a mode's consequence): its field shows as a radio group, this its info icon (`pickControl`). */
  info?: string;
}

/** A field of an interface's form. */
export interface IfField {
  key: string;
  label: string;
  /** Its note (the info bubble beside its label). */
  note?: string;
  /**
   * A select, a text box, a whole number (the shared number box, its unit inside it — its value still text), several lines, a masked
   * secret, a checkbox (true / false — its value "true" / "false"), or a fact the unit reports (shown greyed out, never written — a
   * Wi-Fi country code, a modem's model).
   */
  kind: "select" | "text" | "number" | "textarea" | "password" | "check" | "static";
  /** A number's unit, inside its box ("s", "dBm", "bytes") — never in its label. */
  unit?: string;
  /** A number's bounds for its box's stepper (its `check` still says what's wrong with a typed value). */
  min?: number;
  max?: number;
  /** A number's allowed values as ranges, when there are gaps (an MTU: 0, then 576–1500): its stepper skips them (`tb-number-box`). */
  ranges?: [number, number][];
  /**
   * A bounded number shown as a slider beside its box (`tb-slider-stepper`, QC Lab's intervals' look): `min` to `max` by `step` (an
   * MTU, a DHCP lease time). The slider's range is the field's: a value past it can't be set.
   */
  slider?: { step?: number };
  options?: IfOption[];
  /** Its choices given the form's values (a channel list by band) — each list made once, so the same list comes back. */
  optionsOf?: (values: IfValues) => IfOption[];
  /** The setting it edits as it is (read as text, written back as the setting's type). */
  setting?: string;
  /** Its value from the settings and the unit's status (else its setting's, as text). */
  read?: (get: IfRead, status: IfStatus) => string;
  /** Its value into the settings (else into its setting as it is). */
  write?: (values: IfValues, set: IfWrite) => void;
  /** Whether it applies, given the form's values (greyed out where not — as in ESF's console). */
  enabled?: (values: IfValues) => boolean;
  /** Whether it shows, given the form's values (a Station's fields in Station mode; hidden fields are never written). */
  visible?: (values: IfValues) => boolean;
  /** What's wrong with its value, "" nothing. */
  check?: (value: string, values: IfValues) => string;
  /** What a change of it does to the others (as the console: IPv4 disabled puts Configure back on "Using DHCP"). */
  effect?: (values: IfValues) => void;
}

/** A card of a tab: its title ("" the tab's), its fields. */
export interface IfSection {
  title: string;
  fields: IfField[];
}

/** A tab of an interface's form. */
export interface IfTab {
  id: string;
  label: string;
  icon: string;
  sections: IfSection[];
  /** Whether it applies, given the form's values (where not, its note says when it does). */
  enabled?: (values: IfValues) => boolean;
  disabledNote?: string;
}

/** What an interface's tabs are made from: its settings as the unit has them, and its status. */
export type IfTabsOf = (get: IfRead, status: IfStatus) => IfTab[];

/** An interface's form built: its tabs, its values as read, and the settings they came from. */
export class IfForm {
  readonly tabs: IfTab[];
  values: IfValues = {};
  private initial: IfValues = {};
  private readonly attributes = new Map<string, EsfAttribute>();
  private readonly props: Record<string, unknown> = {};
  private readonly tabOf = new Map<IfField, IfTab>();

  constructor(
    tabsOf: IfTabsOf,
    readonly iface: string,
    config: EsfComponentConfig | null,
    status: IfStatus = {},
    /** Nothing editable (the loopback: the console greys every field out). */
    readonly readOnly = false
  ) {
    const prefix = `net.interface.${iface}.`;
    for (const a of config?.definition?.attributes ?? []) {
      if (a.id.startsWith(prefix)) {
        this.attributes.set(a.id.slice(prefix.length), a);
      }
    }
    for (const [id, p] of Object.entries(config?.properties ?? {})) {
      if (id.startsWith(prefix)) {
        this.props[id.slice(prefix.length)] = p.value;
      }
    }
    const get: IfRead = (setting) => this.props[setting];
    this.tabs = tabsOf(get, status);
    for (const t of this.tabs) {
      for (const f of t.sections.flatMap((x) => x.fields)) {
        this.tabOf.set(f, t);
      }
    }
    for (const f of this.fields) {
      this.values[f.key] = f.read ? f.read(get, status) : textOf(get(f.setting ?? ""));
    }
    this.initial = { ...this.values };
  }

  get fields(): IfField[] {
    return this.tabs.flatMap((t) => t.sections.flatMap((s) => s.fields));
  }

  /** A field applies: editable, its tab applies, and its own rule (if any) holds. */
  isEnabled(f: IfField): boolean {
    const tab = this.tabOf.get(f);
    return !this.readOnly && f.kind !== "static" && (!tab || this.tabEnabled(tab)) && (!f.enabled || f.enabled(this.values));
  }

  /** A field's value set (its control changed), and what that does to the others. */
  set(f: IfField, value: string): void {
    this.values[f.key] = value;
    f.effect?.(this.values);
  }

  isVisible(f: IfField): boolean {
    return !f.visible || f.visible(this.values);
  }

  optionsOf(f: IfField): IfOption[] {
    return f.optionsOf ? f.optionsOf(this.values) : (f.options ?? NO_OPTIONS);
  }

  tabEnabled(t: IfTab): boolean {
    return !t.enabled || t.enabled(this.values);
  }

  changed(f: IfField): boolean {
    return this.values[f.key] !== this.initial[f.key];
  }

  /** A changed field's error ("" none). */
  errorOf(f: IfField): string {
    return this.changed(f) && this.isEnabled(f) && this.isVisible(f) && f.check ? f.check(this.values[f.key] ?? "", this.values) : "";
  }

  get dirty(): boolean {
    return this.fields.some((f) => this.changed(f));
  }

  get invalid(): boolean {
    return this.fields.some((f) => !!this.errorOf(f));
  }

  reset(): void {
    this.values = { ...this.initial };
  }

  /**
   * The settings an apply sends: every field that applies written as the console writes it, kept where the value differs from
   * the unit's — each as ESF's property (its type the definition's), under its full name.
   */
  changes(): Record<string, EsfProperty> {
    const out: Record<string, EsfProperty> = {};
    const set: IfWrite = (setting, value, type) => {
      const attr = this.attributes.get(setting);
      const property = propertyOf(attr?.type ?? type ?? "STRING", value);
      if (JSON.stringify(property.value) !== JSON.stringify(this.props[setting] ?? (property.type === "STRING" ? "" : null))) {
        out[`net.interface.${this.iface}.${setting}`] = property;
      }
    };
    for (const f of this.fields.filter((x) => this.changed(x) && this.isEnabled(x) && this.isVisible(x))) {
      if (f.write) {
        f.write(this.values, set);
      } else if (f.setting) {
        set(f.setting, this.values[f.key] ?? "");
      }
    }
    return out;
  }
}

const NO_OPTIONS: IfOption[] = [];

/** A setting's value as text: a list joined with commas, nothing for none. */
export function textOf(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  return Array.isArray(value) ? value.join(",") : String(value);
}

const NUMBER_TYPES = ["INTEGER", "LONG", "SHORT", "BYTE", "DOUBLE", "FLOAT"];

/** Text as a setting's property of a type. */
function propertyOf(type: EsfPropertyType, value: string): EsfProperty {
  if (type === "BOOLEAN") {
    return { type, value: value === "true" };
  }
  if (NUMBER_TYPES.includes(type)) {
    const n = Number(value);
    return { type, value: value.trim() === "" || !Number.isFinite(n) ? null : n } as EsfProperty;
  }
  return { type, value } as EsfProperty;
}

// ---- Converters the console uses ---------------------------------------------------------------------------------------------

/** A prefix length as a dotted subnet mask (24 → "255.255.255.0"); "" none. */
export function prefixToMask(prefix: unknown): string {
  const n = Number(prefix);
  if (prefix === "" || prefix === null || prefix === undefined || !Number.isInteger(n) || n < 0 || n > 32) {
    return "";
  }
  const bits = n === 0 ? 0 : (0xffffffff << (32 - n)) >>> 0;
  return [24, 16, 8, 0].map((s) => (bits >>> s) & 255).join(".");
}

/** A dotted subnet mask as its prefix length ("255.255.255.0" → "24"), "" when it isn't one. */
export function maskToPrefix(mask: string): string {
  const parts = mask.trim().split(".");
  if (parts.length !== 4 || parts.some((p) => !/^\d{1,3}$/.test(p) || +p > 255)) {
    return "";
  }
  const bits = parts.reduce((acc, p) => ((acc << 8) | +p) >>> 0, 0);
  const prefix = 32 - Math.log2((~bits >>> 0) + 1);
  return Number.isInteger(prefix) ? String(prefix) : "";
}

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

export const isIpv4 = (v: string) => IPV4.test(v.trim());
export const isIpv6 = (v: string) => /^[0-9a-fA-F:.]+$/.test(v.trim()) && v.includes(":");

/** A list as the console writes it (one a line, or comma-separated) as the setting's comma-separated text. */
export function listToSetting(text: string): string {
  return text
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(",");
}

/** A setting's comma-separated list, one a line (the console's text areas). */
export function settingToList(value: unknown): string {
  return textOf(value)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .join("\n");
}
