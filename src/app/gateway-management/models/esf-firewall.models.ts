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

// ESF's firewall (Eclipse Kura's FirewallConfigurationService, and its IPv6 twin): three settings, each a list of rules as one
// string — the rules separated by ";", a rule's fields by ",", its last field "#" (Kura's FirewallConfiguration): open ports (8
// fields), port forwarding (11) and NAT — IP forwarding / masquerading (7). An empty field is written as nothing between its
// commas. A rule that doesn't parse is kept as it is.

/** A firewall setting: its rules. */
export type EsfFirewallSection = "openPorts" | "portForwarding" | "nat";

/** A rule's field: its key, its column / label, how it's picked, and its check. */
export interface EsfFirewallField {
  key: string;
  /** Its column's header. */
  label: string;
  /** Its name in a rule's form (ESF's entry form's: "Port or Port Range"). */
  formLabel: string;
  /** A note beside its name (the info bubble), where its name doesn't say it all: a format, what it does. */
  note?: string;
  /** Another field that, set, greys this one out (ESF's permitted / unpermitted interface: one or the other). */
  excludedBy?: string;
  kind: "text" | "protocol" | "boolean";
  required?: boolean;
  /** Always a column (else only while a rule has it). */
  always?: boolean;
  check?: "port" | "portRange" | "network" | "address" | "mac";
}

/** A firewall setting's rules: its button's label, its setting's id (after `firewall.` / `firewall.ipv6.`), its fields in order. */
export interface EsfFirewallSectionDef {
  id: EsfFirewallSection;
  label: string;
  /** "New open port", … — the add card's title. */
  newLabel: string;
  setting: string;
  fields: EsfFirewallField[];
  /** A protocol field's choices. */
  protocols: string[];
}

export const ESF_FIREWALL_SECTIONS: EsfFirewallSectionDef[] = [
  {
    id: "openPorts",
    label: "Open ports",
    newLabel: "New open port",
    setting: "open.ports",
    protocols: ["tcp", "udp"],
    fields: [
      {
        key: "port",
        label: "Port",
        formLabel: "Port or Port Range",
        note: "A port, or a range as 3040:3050",
        kind: "text",
        required: true,
        always: true,
        check: "portRange",
      },
      { key: "protocol", label: "Protocol", formLabel: "Protocol", kind: "protocol", required: true, always: true },
      {
        key: "permittedNetwork",
        label: "Permitted network",
        formLabel: "Permitted Network",
        note: "As 192.168.1.0/24\n0.0.0.0/0: any",
        kind: "text",
        always: true,
        check: "network",
      },
      {
        key: "permittedInterface",
        label: "Permitted interface",
        formLabel: "Permitted Interface Name",
        note: "Only on this interface (this, or an unpermitted one)",
        kind: "text",
        always: true,
        excludedBy: "unpermittedInterface",
      },
      {
        key: "unpermittedInterface",
        label: "Unpermitted interface",
        formLabel: "Unpermitted Interface Name",
        note: "On every interface but this one",
        kind: "text",
        excludedBy: "permittedInterface",
      },
      { key: "permittedMac", label: "Permitted MAC", formLabel: "Permitted MAC Address", kind: "text", check: "mac" },
      {
        key: "sourcePorts",
        label: "Source ports",
        formLabel: "Source Port or Port Range",
        note: "A port, or a range as 10100:20200",
        kind: "text",
        check: "portRange",
      },
    ],
  },
  {
    id: "portForwarding",
    label: "Port forwarding",
    newLabel: "New port forward",
    setting: "port.forwarding",
    protocols: ["tcp", "udp"],
    fields: [
      {
        key: "inputInterface",
        label: "Input interface",
        formLabel: "Input Interface",
        note: "Where the packet comes in",
        kind: "text",
        required: true,
        always: true,
      },
      {
        key: "outputInterface",
        label: "Output interface",
        formLabel: "Output Interface",
        note: "Where it's forwarded out",
        kind: "text",
        required: true,
        always: true,
      },
      { key: "address", label: "LAN address", formLabel: "LAN Address", note: "The destination host", kind: "text", required: true, always: true, check: "address" },
      { key: "protocol", label: "Protocol", formLabel: "Protocol", kind: "protocol", required: true, always: true },
      {
        key: "externalPort",
        label: "External port",
        formLabel: "External Port",
        note: "On the gateway",
        kind: "text",
        required: true,
        always: true,
        check: "port",
      },
      {
        key: "internalPort",
        label: "Internal port",
        formLabel: "Internal Port",
        note: "On the destination host",
        kind: "text",
        required: true,
        always: true,
        check: "port",
      },
      {
        key: "masquerade",
        label: "Masquerade",
        formLabel: "Enable Masquerading",
        note: "Forwarded packets appear to come from the gateway",
        kind: "boolean",
        always: true,
      },
      {
        key: "permittedNetwork",
        label: "Permitted network",
        formLabel: "Permitted Network",
        note: "The source, as 192.168.1.0/24\nEmpty: any",
        kind: "text",
        check: "network",
      },
      { key: "permittedMac", label: "Permitted MAC", formLabel: "Permitted MAC Address", kind: "text", check: "mac" },
      {
        key: "sourcePorts",
        label: "Source ports",
        formLabel: "Source Port or Port Range",
        note: "A port, or a range as 10100:20200",
        kind: "text",
        check: "portRange",
      },
    ],
  },
  {
    id: "nat",
    label: "NAT",
    newLabel: "New NAT rule",
    setting: "nat",
    protocols: ["all", "tcp", "udp"],
    fields: [
      {
        key: "inputInterface",
        label: "Input interface",
        formLabel: "Input Interface Name",
        note: "Where traffic comes in",
        kind: "text",
        required: true,
        always: true,
      },
      {
        key: "outputInterface",
        label: "Output interface",
        formLabel: "Output Interface Name",
        note: "Where it's forwarded out",
        kind: "text",
        required: true,
        always: true,
      },
      { key: "protocol", label: "Protocol", formLabel: "Protocol", kind: "protocol", required: true, always: true },
      {
        key: "source",
        label: "Source network",
        formLabel: "Source Network/Host",
        note: "As 192.168.1.0/24",
        kind: "text",
        always: true,
        check: "network",
      },
      {
        key: "destination",
        label: "Destination network",
        formLabel: "Destination Network/Host",
        note: "As 0.0.0.0/0",
        kind: "text",
        always: true,
        check: "network",
      },
      {
        key: "masquerade",
        label: "Masquerade",
        formLabel: "Enable Masquerading",
        note: "Forwarded traffic appears to come from the gateway",
        kind: "boolean",
        always: true,
      },
    ],
  },
];

/** The firewall setting an attribute id is, and whether it's the IPv6 firewall's ("firewall.ipv6.nat"); null for any other. */
export function esfFirewallSettingOf(id: string): { section: EsfFirewallSection; ipv6: boolean } | null {
  const m = /^firewall\.(ipv6\.)?(.+)$/.exec(id);
  const section = m ? ESF_FIREWALL_SECTIONS.find((s) => s.setting === m[2]) : undefined;
  return section && m ? { section: section.id, ipv6: !!m[1] } : null;
}

/** A rule: its fields by key (a boolean "true" / "false"), or — one that doesn't parse — its text alone. */
export interface EsfFirewallRule {
  key: string;
  raw: string;
  values: Record<string, string>;
  valid: boolean;
}

/** A setting's rules, in their order. */
export function parseEsfFirewallRules(section: EsfFirewallSectionDef, value: unknown): EsfFirewallRule[] {
  const text = typeof value === "string" ? value : "";
  return text
    .split(";")
    .map((r) => r.trim())
    .filter((r) => r !== "")
    .map((raw, i) => {
      const parts = raw.split(",");
      const valid = parts.length === section.fields.length + 1 && parts[parts.length - 1].trim() === "#";
      const values: Record<string, string> = {};
      if (valid) {
        section.fields.forEach((f, j) => (values[f.key] = parts[j].trim()));
      }
      return { key: String(i), raw, values, valid };
    });
}

/** A rule as Kura writes it: its fields in order, then "#". */
export function esfFirewallRuleText(section: EsfFirewallSectionDef, values: Record<string, string | boolean>): string {
  const fields = section.fields.map((f) => {
    const v = values[f.key];
    return f.kind === "boolean" ? String(v === true || v === "true") : String(v ?? "").trim();
  });
  return [...fields, "#"].join(",");
}

/** A setting's value: its rules joined. */
export function esfFirewallValue(rules: EsfFirewallRule[]): string {
  return rules.map((r) => r.raw).join(";");
}

const PORT = /^\d{1,5}$/;
const portOk = (v: string) => PORT.test(v) && +v >= 1 && +v <= 65535;
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const ipv4Ok = (v: string) => {
  const m = IPV4.exec(v);
  return !!m && m.slice(1).every((n) => +n <= 255);
};
const ipv6Ok = (v: string) => /^[0-9a-fA-F:.]+$/.test(v) && v.includes(":");

/** What's wrong with a new rule's field ("" nothing). */
export function esfFirewallFieldError(f: EsfFirewallField, value: string | boolean, ipv6: boolean): string {
  if (f.kind === "boolean") {
    return "";
  }
  const v = String(value ?? "").trim();
  if (!v) {
    return f.required ? "Required" : "";
  }
  if (/[,;#]/.test(v)) {
    return "No commas, semicolons or #";
  }
  switch (f.check) {
    case "port":
      return portOk(v) ? "" : "A port, 1 to 65535";
    case "portRange": {
      const [a, b, ...rest] = v.split(":");
      const ok = rest.length === 0 && portOk(a) && (b === undefined || (portOk(b) && +a <= +b));
      return ok ? "" : "A port or a range, as 3040:3050";
    }
    case "address":
      return (ipv6 ? ipv6Ok(v) : ipv4Ok(v)) ? "" : ipv6 ? "An IPv6 address" : "An IPv4 address";
    case "network": {
      const [addr, prefix, ...rest] = v.split("/");
      const max = ipv6 ? 128 : 32;
      const ok = rest.length === 0 && (ipv6 ? ipv6Ok(addr) : ipv4Ok(addr)) && prefix !== undefined && /^\d{1,3}$/.test(prefix) && +prefix <= max;
      return ok ? "" : ipv6 ? "A network, as ::/0" : "A network, as 192.168.1.0/24";
    }
    case "mac":
      return /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(v) ? "" : "A MAC address, as 00:11:22:33:44:55";
    default:
      return "";
  }
}

/** A new rule's starting values: the first protocol, every network open ("0.0.0.0/0" — "::/0" on IPv6) where it's always set. */
export function esfFirewallDraft(section: EsfFirewallSectionDef, ipv6: boolean): Record<string, string | boolean> {
  const draft: Record<string, string | boolean> = {};
  for (const f of section.fields) {
    draft[f.key] = f.kind === "boolean" ? false : f.kind === "protocol" ? section.protocols[0] : "";
  }
  if (section.id === "openPorts") {
    draft["permittedNetwork"] = ipv6 ? "::/0" : "0.0.0.0/0";
  }
  return draft;
}

/** A field's value as a table shows it: a protocol in capitals, a boolean "Yes" / "No". */
export function esfFirewallShown(f: EsfFirewallField, value: string): string {
  if (f.kind === "boolean") {
    return value === "true" ? "Yes" : "No";
  }
  return f.kind === "protocol" ? value.toUpperCase() : value;
}
