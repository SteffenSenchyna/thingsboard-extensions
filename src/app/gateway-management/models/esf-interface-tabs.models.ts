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

// An interface's tabs, as ESF's own console has them (its Network page; checked against ESF 7.6.2's console and Kura's web UI
// source, kura-management-ui): which tabs an interface gets by its type, each tab's fields in the console's order, their labels,
// choices and rules, and how each reads and writes the interface's NetworkConfigurationService settings.

import { EsfInterface } from "./esf-api.models";
import {
  IfField,
  IfOption,
  IfRead,
  IfStatus,
  IfTab,
  IfTabsOf,
  IfValues,
  isIpv4,
  isIpv6,
  listToSetting,
  maskToPrefix,
  prefixToMask,
  settingToList,
  textOf,
} from "./esf-interface-form.models";

/** The panel's read-only tab: what the unit reports of the interface. */
export const ESF_HARDWARE_TAB = { id: "hardware", label: "Hardware", icon: "memory" };

// ---- The values the settings take ------------------------------------------------------------------------------------------

const IP4 = {
  disabled: "netIPv4StatusDisabled",
  unmanaged: "netIPv4StatusUnmanaged",
  l2only: "netIPv4StatusL2Only",
  lan: "netIPv4StatusEnabledLAN",
  wan: "netIPv4StatusEnabledWAN",
};
const IP6 = { disabled: "netIPv6StatusDisabled", lan: "netIPv6StatusEnabledLAN", wan: "netIPv6StatusEnabledWAN", unmanaged: "netIPv6StatusUnmanaged" };
const IP6_METHOD = { auto: "netIPv6MethodAuto", dhcp: "netIPv6MethodDhcp", manual: "netIPv6MethodManual" };
const WIFI_MODE = { station: "INFRA", ap: "MASTER" };
const ENTERPRISE = "SECURITY_WPA2_WPA3_ENTERPRISE";
const WPA_FAMILY = ["SECURITY_WPA", "SECURITY_WPA2", "SECURITY_WPA_WPA2", "SECURITY_WPA3", "SECURITY_WPA2_WPA3"];
const EAP = { tls: "Kura8021xEapTls", ttls: "Kura8021xEapTtls", peap: "Kura8021xEapPeap" };
const INNER = { none: "Kura8021xInnerAuthNone", mschapv2: "Kura8021xInnerAuthMschapv2" };

// ---- What the form's values say ----------------------------------------------------------------------------------------------

const ip4 = (v: IfValues) => v["ip4Status"];
const ip4Addressed = (v: IfValues) => ip4(v) === IP4.lan || ip4(v) === IP4.wan;
const ip4Manual = (v: IfValues) => v["ip4Configure"] === "false";
const ip4Wan = (v: IfValues) => ip4(v) === IP4.wan;
const ip6 = (v: IfValues) => v["ip6Status"];
const ip6On = (v: IfValues) => !!ip6(v) && ip6(v) !== IP6.disabled;
/** The console's "interface enabled": not (IPv4 and IPv6 both disabled), and IPv4 managed. */
const ifaceEnabled = (v: IfValues) => !(ip4(v) === IP4.disabled && !ip6On(v)) && ip4(v) !== IP4.unmanaged;
const station = (v: IfValues) => v["wifiMode"] !== WIFI_MODE.ap;
const ap = (v: IfValues) => v["wifiMode"] === WIFI_MODE.ap;

// ---- Checks ------------------------------------------------------------------------------------------------------------------

const BAD_IP4 = "Invalid IPv4 Address";
const BAD_IP6 = "IPv6 addresses range from 0000:0000:0000:0000:0000:0000:0000:0000 to ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff";
const required = (message: string, test: (x: string) => boolean) => (value: string) => (!value.trim() ? "Required" : test(value) ? "" : message);
const checkIp4 = required(BAD_IP4, isIpv4);
const checkIp6 = required(BAD_IP6, isIpv6);
const checkMask = required(BAD_IP4, (x) => maskToPrefix(x) !== "");
/** An interface Status's options, as ESF's console explains them (its Information panel beside the IPv4 / IPv6 tab). */
const STATUS_INFO = {
  disabled: "The interface is disabled.",
  unmanaged: "Interface is not managed by Kura.",
  l2only: "Only Layer 2 portion of interface is configured.",
  lan: "Interface is used to create a local network. Use this for creating an access point that other devices can connect to.",
  wan: "Interface is enabled for use as a gateway to an external network. Use this to connect to a router, wireless access point, or cellular network.",
};

const ints = (x: string) => /^-?\d+$/.test(x.trim());
const checkPriority = (value: string) =>
  ints(value) && +value >= -1 && +value <= 2147483646 ? "" : "Valid priority values are integers from 0 to 2147483646. Set -1 to disable the feature.";
const checkDnsList = (message: string, test: (x: string) => boolean) => (value: string) =>
  !value.trim() || value.trim().split(/[\s,;]+/).every(test) ? "" : message;
const atLeast = (min: number, message: string) => (value: string) => (ints(value) && +value >= min ? "" : message);

const ip4ToNumber = (ip: string) => ip.split(".").reduce((acc, p) => ((acc << 8) | +p) >>> 0, 0);

/** A DHCP range end: an IPv4 address in the interface's network (its IPv4 address and mask), the range's end after its start. */
function checkRange(which: "start" | "end") {
  return (value: string, v: IfValues): string => {
    const bad = checkIp4(value);
    if (bad) {
      return bad;
    }
    const prefix = Number(maskToPrefix(v["ip4Mask"] ?? ""));
    if (isIpv4(v["ip4Address"] ?? "") && prefix) {
      const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
      if (((ip4ToNumber(value) & mask) >>> 0) !== ((ip4ToNumber(v["ip4Address"]) & mask) >>> 0)) {
        return "Not in the interface's network (its IPv4 address and subnet mask)";
      }
    }
    const start = v["dhcpStart"] ?? "";
    const end = v["dhcpEnd"] ?? "";
    if (which === "end" && isIpv4(start) && isIpv4(end) && ip4ToNumber(end) <= ip4ToNumber(start)) {
      return "The ending address must come after the beginning address";
    }
    return "";
  };
}

// ---- IPv4 --------------------------------------------------------------------------------------------------------------------

/** No DHCP server and no NAT (the Router Mode Off): an interface not enabled for LAN, or one configured by DHCP. */
function stopServing(set: (setting: string, value: string, type?: "BOOLEAN") => void): void {
  set("config.dhcpServer4.enabled", "false", "BOOLEAN");
  set("config.nat.enabled", "false", "BOOLEAN");
}

function ip4Tab(modem: boolean): IfTab {
  const fields: IfField[] = [
    {
      key: "ip4Status",
      label: "Status",
      kind: "select",
      // Each mode as ESF's console explains it (its Information panel): a radio group, one a line, an info icon an option.
      options: [
        { value: IP4.disabled, label: "Disabled", info: STATUS_INFO.disabled },
        { value: IP4.unmanaged, label: "Not Managed", info: STATUS_INFO.unmanaged },
        { value: IP4.l2only, label: "Layer 2 Only", info: STATUS_INFO.l2only },
        ...(modem ? [] : [{ value: IP4.lan, label: "Enabled for LAN", info: STATUS_INFO.lan }]),
        { value: IP4.wan, label: "Enabled for WAN", info: STATUS_INFO.wan },
      ],
      read: (get) => (Object.values(IP4).includes(textOf(get("config.ip4.status"))) ? textOf(get("config.ip4.status")) : IP4.disabled),
      write: (v, set) => {
        set("config.ip4.status", ip4(v));
        // Not managed: IPv6 is the system's too.
        if (ip4(v) === IP4.unmanaged) {
          set("config.ip6.status", IP6.unmanaged);
        }
        // Without an address of its own it takes DHCP's (as the console writes it); serving DHCP and NAT is a LAN's alone.
        if (!ip4Addressed(v)) {
          set("config.dhcpClient4.enabled", "true", "BOOLEAN");
        }
        if (ip4(v) !== IP4.lan) {
          stopServing(set);
        }
      },
      effect: (v) => {
        // Without an address of its own, the interface takes DHCP's (and serves none); a WAN Wi-Fi is a station.
        if (!ip4Addressed(v)) {
          v["ip4Configure"] = "true";
        }
        if (ip4(v) !== IP4.lan) {
          v["routerMode"] = "off";
        }
        if (ip4Wan(v)) {
          v["wifiMode"] = WIFI_MODE.station;
        }
      },
    },
    {
      key: "ip4Priority",
      label: "WAN Priority",
      note: "The lowest is the primary WAN\n-1: by the interface's type",
      kind: "number",
      min: -1,
      read: (get) => textOf(get("config.ip4.wan.priority") ?? -1),
      write: (v, set) => set("config.ip4.wan.priority", v["ip4Priority"].trim() || "-1", "INTEGER"),
      enabled: ip4Wan,
      check: checkPriority,
    },
    {
      key: "ip4Configure",
      label: "Configure",
      kind: "select",
      options: [
        { value: "true", label: "Using DHCP" },
        { value: "false", label: "Manually" },
      ],
      read: (get) => (get("config.dhcpClient4.enabled") === false || get("config.dhcpClient4.enabled") === "false" ? "false" : "true"),
      write: (v, set) => {
        set("config.dhcpClient4.enabled", v["ip4Configure"], "BOOLEAN");
        // Configured by DHCP, it serves neither DHCP nor NAT.
        if (!ip4Manual(v)) {
          stopServing(set);
        }
      },
      enabled: (v) => !modem && ip4Addressed(v),
      effect: (v) => {
        if (!ip4Manual(v)) {
          v["routerMode"] = "off";
        }
      },
    },
    {
      key: "ip4Address",
      label: "IPv4 Address",
      kind: "text",
      setting: "config.ip4.address",
      enabled: (v) => !modem && ip4Addressed(v) && ip4Manual(v),
      check: checkIp4,
    },
    {
      key: "ip4Mask",
      label: "Subnet Mask",
      note: "As 255.255.255.0",
      kind: "text",
      read: (get) => prefixToMask(get("config.ip4.prefix")),
      write: (v, set) => {
        const prefix = maskToPrefix(v["ip4Mask"]);
        if (prefix && prefix !== "0") {
          set("config.ip4.prefix", prefix, "SHORT");
        }
      },
      enabled: (v) => !modem && ip4Addressed(v) && ip4Manual(v),
      check: checkMask,
    },
    {
      key: "ip4Gateway",
      label: "Gateway",
      kind: "text",
      setting: "config.ip4.gateway",
      enabled: (v) => !modem && ip4Wan(v) && ip4Manual(v),
      check: checkIp4,
    },
    {
      key: "ip4Dns",
      label: "DNS Servers",
      note: "One a line; they replace the servers DHCP gives",
      kind: "textarea",
      read: (get) => settingToList(String(textOf(get("config.ip4.dnsServers"))).replace(/\s+/g, ",")),
      write: (v, set) => set("config.ip4.dnsServers", listToSetting(v["ip4Dns"])),
      enabled: (v) => (modem ? ip4(v) !== IP4.disabled && ip4(v) !== IP4.unmanaged : ip4Wan(v)),
      check: checkDnsList("One of the IP addresses provided is invalid. Please check", isIpv4),
    },
  ];
  return { id: "ip4", label: "IPv4", icon: "counter_4", sections: [{ title: "", fields }] };
}

// ---- IPv6 --------------------------------------------------------------------------------------------------------------------

function ip6Tab(modem: boolean): IfTab {
  const ip6Auto = (v: IfValues) => v["ip6Method"] === IP6_METHOD.auto;
  const ip6Manual = (v: IfValues) => v["ip6Method"] === IP6_METHOD.manual;
  const fields: IfField[] = [
    {
      key: "ip6Status",
      label: "Status",
      kind: "select",
      // Each mode as ESF's console explains it: a radio group, one a line, an info icon an option.
      options: [
        { value: IP6.disabled, label: "Disabled", info: STATUS_INFO.disabled },
        ...(modem ? [] : [{ value: IP6.lan, label: "Enabled for LAN", info: STATUS_INFO.lan }]),
        { value: IP6.wan, label: "Enabled for WAN", info: STATUS_INFO.wan },
      ],
      read: (get) => ([IP6.lan, IP6.wan].includes(textOf(get("config.ip6.status"))) ? textOf(get("config.ip6.status")) : IP6.disabled),
      setting: "config.ip6.status",
      effect: (v) => {
        if (!ip6On(v)) {
          v["ip6Method"] = IP6_METHOD.auto;
          v["ip6GenMode"] = "netIPv6AddressGenModeEUI64";
          v["ip6Privacy"] = "netIPv6PrivacyDisabled";
        }
      },
    },
    {
      key: "ip6Priority",
      label: "WAN Priority",
      note: "The lowest is the primary WAN\n-1: by the interface's type",
      kind: "number",
      min: -1,
      read: (get) => textOf(get("config.ip6.wan.priority") ?? -1),
      write: (v, set) => set("config.ip6.wan.priority", v["ip6Priority"].trim() || "-1", "INTEGER"),
      enabled: (v) => ip6(v) === IP6.wan,
      check: checkPriority,
    },
    {
      key: "ip6Method",
      label: "Configure",
      kind: "select",
      options: [
        { value: IP6_METHOD.auto, label: "Stateless Address Auto-Configuration (SLAAC)", info: "The interface works out its address from the network's prefix." },
        { value: IP6_METHOD.dhcp, label: "Using DHCPv6", info: "Its address comes from a DHCPv6 server." },
        { value: IP6_METHOD.manual, label: "Manually", info: "Its address and prefix as entered below." },
      ],
      read: (get) => (Object.values(IP6_METHOD).includes(textOf(get("config.ip6.address.method"))) ? textOf(get("config.ip6.address.method")) : IP6_METHOD.auto),
      setting: "config.ip6.address.method",
      enabled: (v) => !modem && ip6On(v),
    },
    {
      key: "ip6GenMode",
      label: "Address Generation Mode",
      kind: "select",
      options: [
        { value: "netIPv6AddressGenModeEUI64", label: "EUI64", info: "From the hardware address, the same on every network, so it can be tracked." },
        { value: "netIPv6AddressGenModeStablePrivacy", label: "Stable-privacy", info: "A stable hash, steady on one network and different on each." },
      ],
      read: (get) => textOf(get("config.ip6.addr.gen.mode")) || "netIPv6AddressGenModeEUI64",
      setting: "config.ip6.addr.gen.mode",
      enabled: (v) => ip6On(v) && ip6Auto(v),
    },
    {
      key: "ip6Address",
      label: "IPv6 Address",
      kind: "text",
      setting: "config.ip6.address",
      enabled: (v) => !modem && ip6On(v) && ip6Manual(v),
      check: checkIp6,
    },
    {
      key: "ip6Prefix",
      label: "Subnet Mask",
      note: "A prefix length, 1 to 128",
      kind: "number",
      min: 1,
      max: 128,
      read: (get) => (Number(get("config.ip6.prefix")) > 0 ? textOf(get("config.ip6.prefix")) : ""),
      write: (v, set) => set("config.ip6.prefix", v["ip6Prefix"].trim(), "SHORT"),
      enabled: (v) => !modem && ip6On(v) && ip6Manual(v),
      check: (value) => (ints(value) && +value >= 1 && +value <= 128 ? "" : "Subnet mask must be an integer between 1 and 128"),
    },
    {
      key: "ip6Gateway",
      label: "Gateway",
      kind: "text",
      setting: "config.ip6.gateway",
      enabled: (v) => !modem && ip6(v) === IP6.wan && ip6Manual(v),
      check: checkIp6,
    },
    {
      key: "ip6Dns",
      label: "DNS Servers",
      note: "One a line; they replace the automatic ones",
      kind: "textarea",
      read: (get) => settingToList(String(textOf(get("config.ip6.dnsServers"))).replace(/\s+/g, ",")),
      write: (v, set) => set("config.ip6.dnsServers", listToSetting(v["ip6Dns"])),
      enabled: (v) => ip6(v) === IP6.wan,
      check: checkDnsList(BAD_IP6, isIpv6),
    },
    {
      key: "ip6Privacy",
      label: "Privacy",
      kind: "select",
      options: [
        { value: "netIPv6PrivacyDisabled", label: "Disabled", info: "No temporary addresses: the interface uses its stable address alone." },
        { value: "netIPv6PrivacyEnabledPubAdd", label: "Prefer public addresses", info: "Temporary addresses are made, but outgoing connections use the public one." },
        {
          value: "netIPv6PrivacyEnabledTempAdd",
          label: "Prefer temporary addresses",
          info: "Temporary addresses are made and outgoing connections use them, so the unit is harder to track.",
        },
      ],
      read: (get) => textOf(get("config.ip6.privacy")) || "netIPv6PrivacyDisabled",
      setting: "config.ip6.privacy",
      enabled: (v) => ip6On(v) && ip6Auto(v),
    },
  ];
  return {
    id: "ip6",
    label: "IPv6",
    icon: "counter_6",
    sections: [{ title: "", fields }],
    enabled: (v) => ip4(v) !== IP4.unmanaged,
    disabledNote: "IPv6 is set here once IPv4 is managed: with IPv4 Not Managed, both are left to the system.",
  };
}

// ---- DHCPv4 & NAT --------------------------------------------------------------------------------------------------------

function dhcpNatTab(wifi: boolean): IfTab {
  const serving = (v: IfValues) => v["routerMode"] === "dhcpNat" || v["routerMode"] === "dhcp";
  const fields: IfField[] = [
    {
      key: "routerMode",
      label: "Router Mode",
      kind: "select",
      options: [
        { value: "dhcpNat", label: "DHCP and NAT", info: "Hands out addresses on this network and shares the WAN connection with it." },
        { value: "dhcp", label: "DHCP Only", info: "Hands out addresses on this network, without sharing the WAN connection." },
        { value: "nat", label: "NAT Only", info: "Shares the WAN connection; the addresses come from elsewhere." },
        { value: "off", label: "Off", info: "Neither, the interface only has its own address." },
      ],
      read: (get) => {
        const dhcp = get("config.dhcpServer4.enabled") === true || get("config.dhcpServer4.enabled") === "true";
        const nat = get("config.nat.enabled") === true || get("config.nat.enabled") === "true";
        return dhcp && nat ? "dhcpNat" : dhcp ? "dhcp" : nat ? "nat" : "off";
      },
      write: (v, set) => {
        const manual = ip4Manual(v);
        set("config.dhcpServer4.enabled", String(manual && serving(v)), "BOOLEAN");
        set("config.nat.enabled", String(manual && (v["routerMode"] === "dhcpNat" || v["routerMode"] === "nat")), "BOOLEAN");
      },
      check: (value, v) => (!ip4Manual(v) && value !== "off" ? "Invalid selection when TCP/IP is configured for DHCP" : ""),
    },
    { key: "dhcpStart", label: "DHCP Beginning Address", kind: "text", setting: "config.dhcpServer4.rangeStart", enabled: serving, check: checkRange("start") },
    { key: "dhcpEnd", label: "DHCP Ending Address", kind: "text", setting: "config.dhcpServer4.rangeEnd", enabled: serving, check: checkRange("end") },
    {
      key: "dhcpMask",
      label: "DHCP Subnet Mask",
      note: "As 255.255.255.0",
      kind: "text",
      read: (get) => prefixToMask(get("config.dhcpServer4.prefix")),
      write: (v, set) => {
        const prefix = maskToPrefix(v["dhcpMask"]);
        if (prefix && prefix !== "0") {
          set("config.dhcpServer4.prefix", prefix, "SHORT");
        }
      },
      enabled: serving,
      check: checkMask,
    },
    {
      key: "dhcpLease",
      label: "DHCP Default Lease Time",
      kind: "number",
      unit: "s",
      min: 60,
      max: 86400,
      slider: { step: 60 },
      setting: "config.dhcpServer4.defaultLeaseTime",
      enabled: serving,
      check: atLeast(60, "A whole number of seconds, 60 or more"),
    },
    {
      key: "dhcpMaxLease",
      label: "DHCP Max Lease Time",
      kind: "number",
      unit: "s",
      min: 60,
      max: 86400,
      slider: { step: 60 },
      setting: "config.dhcpServer4.maxLeaseTime",
      enabled: serving,
      check: atLeast(60, "A whole number of seconds, 60 or more"),
    },
    {
      key: "dhcpPassDns",
      label: "Pass DNS Servers through DHCP",
      kind: "check",
      read: (get) => String(get("config.dhcpServer4.passDns") === true || get("config.dhcpServer4.passDns") === "true"),
      setting: "config.dhcpServer4.passDns",
      enabled: serving,
    },
  ];
  return {
    id: "dhcpNat",
    label: "DHCPv4 & NAT",
    icon: "router",
    sections: [{ title: "", fields }],
    enabled: (v) => ip4(v) === IP4.lan && ip4Manual(v) && (!wifi || ap(v)),
    disabledNote: wifi
      ? "DHCP and NAT are for an access point: Wireless Mode Access Point, IPv4 enabled for LAN and configured manually."
      : "DHCP and NAT are for an interface enabled for LAN, with IPv4 configured manually.",
  };
}

// ---- Wireless ------------------------------------------------------------------------------------------------------------

const RADIO_MODES: IfOption[] = [
  { value: "RADIO_MODE_80211g", label: "2.4GHz" },
  { value: "RADIO_MODE_80211a", label: "5GHz" },
  { value: "RADIO_MODE_80211nHT20", label: "2.4GHz/5GHz" },
];

/** A stored radio mode as the band the console shows. */
function bandOf(value: unknown): string {
  const v = textOf(value);
  if (v === "RADIO_MODE_80211a" || v === "RADIO_MODE_80211_AC") {
    return "RADIO_MODE_80211a";
  }
  return v === "RADIO_MODE_80211b" || v === "RADIO_MODE_80211g" ? "RADIO_MODE_80211g" : "RADIO_MODE_80211nHT20";
}

const CIPHERS: IfOption[] = [
  { value: "CCMP_TKIP", label: "CCMP and TKIP" },
  { value: "CCMP", label: "CCMP" },
  { value: "TKIP", label: "TKIP" },
];

const BGSCAN: IfOption[] = [
  { value: "NONE", label: "None" },
  { value: "SIMPLE", label: "Simple" },
  { value: "LEARN", label: "Learn" },
];

/** The bgscan setting's parts ("netWifiBgscanMode_SIMPLE:30:-80:300" — module, short interval, signal threshold, long interval). */
function bgscanOf(value: unknown): { module: string; short: string; rssi: string; long: string } {
  const parts = textOf(value).split(":");
  const module = /learn/i.test(parts[0] ?? "") ? "LEARN" : /simple/i.test(parts[0] ?? "") ? "SIMPLE" : "NONE";
  return parts.length === 4 ? { module, short: parts[1], rssi: parts[2], long: parts[3] } : { module, short: "0", rssi: "0", long: "0" };
}

/** The bgscan setting as the console writes it. */
function writeBgscan(v: IfValues, set: (setting: string, value: string) => void): void {
  const n = (x: string) => (ints(x ?? "") ? String(+x) : "0");
  set("config.wifi.infra.bgscan", `netWifiBgscanMode_${v["iBgscan"]}:${n(v["iBgShort"])}:${n(v["iBgRssi"])}:${n(v["iBgLong"])}`);
}

/** The Wi-Fi's channels as choices — Automatic first — by band: 5 GHz above 2501 MHz, 2.4 GHz at or below it, both all of them. */
function channelLists(status: IfStatus): Record<string, IfOption[]> {
  const channels = (Array.isArray(status["channels"]) ? status["channels"] : [])
    .filter((c: any) => c && !c.disabled && Number(c.channel) > 0)
    .sort((a: any, b: any) => Number(a.channel) - Number(b.channel));
  const option = (c: any): IfOption => ({
    value: String(c.channel),
    label: Number(c.frequency) > 0 ? `Channel ${c.channel} - ${c.frequency} MHz` : `Channel ${c.channel}`,
  });
  const auto: IfOption = { value: "0", label: "Automatic" };
  return {
    RADIO_MODE_80211g: [auto, ...channels.filter((c: any) => Number(c.frequency) <= 2501).map(option)],
    RADIO_MODE_80211a: [auto, ...channels.filter((c: any) => Number(c.frequency) > 2501).map(option)],
    RADIO_MODE_80211nHT20: [auto, ...channels.map(option)],
  };
}

/** A stored channel list ("1 6 11"): its first, "0" Automatic. */
const channelOf = (value: unknown) => textOf(value).trim().split(/[\s,]+/)[0] || "0";

const SSID = /^[^!#;+\]/"\t][^+\]/"\t]{0,31}$/;

/** An access point's password: WPA's 8–63 printable ASCII characters, WEP's 5 / 13 characters or 10 / 26 hex digits. */
function checkApPassword(security: string) {
  return (value: string): string => {
    if (WPA_FAMILY.includes(security)) {
      return /^[ -~]{8,63}$/.test(value) ? "" : "Password must be 8-63 characters and use ASCII characters from code 32 to 126";
    }
    if (security === "SECURITY_WEP") {
      const ascii = [...value].every((c) => c.charCodeAt(0) < 128);
      return (ascii && (value.length === 5 || value.length === 13)) || /^(?:[a-fA-F0-9]{10}|[a-fA-F0-9]{26})$/.test(value)
        ? ""
        : "Password must be 5 or 13 ASCII characters long, or 10 or 26 hex characters long";
    }
    return "";
  };
}

/** One mode's fields (Station: `infra`, Access Point: `master`), shown while the mode is picked. */
function wifiModeFields(mode: "infra" | "master", get: IfRead, status: IfStatus): IfField[] {
  const p = mode === "infra" ? "i" : "m";
  const isStation = mode === "infra";
  const shown = (v: IfValues) => (isStation ? station(v) : ap(v));
  const setting = (name: string) => `config.wifi.${mode}.${name}`;
  const security = (v: IfValues) => v[`${p}Security`];
  const stored = textOf(get(setting("securityType")));
  const wpa3 = stored === "SECURITY_WPA3" || stored === "SECURITY_WPA2_WPA3";
  const securities: IfOption[] = [
    { value: "NONE", label: "None" },
    { value: "SECURITY_WEP", label: "WEP" },
    { value: "SECURITY_WPA", label: "WPA" },
    { value: "SECURITY_WPA2", label: "WPA2" },
    { value: "SECURITY_WPA_WPA2", label: "WPA/WPA2" },
    ...(wpa3
      ? [
          { value: "SECURITY_WPA3", label: "WPA3 - Experimental" },
          { value: "SECURITY_WPA2_WPA3", label: "WPA2/WPA3 - Experimental" },
        ]
      : []),
    ...(isStation ? [{ value: ENTERPRISE, label: "WPA2/WPA3-Enterprise" }] : []),
  ];
  const lists = channelLists(status);
  const fields: IfField[] = [
    {
      key: `${p}Ssid`,
      label: "Network Name",
      note: isStation ? "The SSID to join" : "The SSID to create",
      kind: "text",
      setting: setting("ssid"),
      visible: shown,
      check: required("Invalid SSID name.", (x) => SSID.test(x.trim())),
    },
    {
      key: `${p}Band`,
      label: "Band",
      kind: "select",
      options: RADIO_MODES,
      read: (g) => bandOf(g(setting("radioMode"))),
      setting: setting("radioMode"),
      visible: shown,
    },
    {
      key: `${p}Security`,
      label: "Wireless Security",
      kind: "select",
      options: securities,
      read: (g) => (securities.some((o) => o.value === textOf(g(setting("securityType")))) ? textOf(g(setting("securityType"))) : "SECURITY_WPA2"),
      setting: setting("securityType"),
      visible: shown,
    },
    {
      key: `${p}Password`,
      label: "Wireless Password",
      kind: "password",
      read: () => "",
      setting: setting("passphrase"),
      visible: (v) => shown(v) && security(v) !== "NONE" && security(v) !== ENTERPRISE,
      check: isStation ? undefined : (value, v) => checkApPassword(security(v))(value),
    },
    {
      key: `${p}Pairwise`,
      label: "Pairwise Ciphers",
      note: "For unicast traffic",
      kind: "select",
      options: CIPHERS,
      read: (g) => textOf(g(setting("pairwiseCiphers"))) || "CCMP",
      setting: setting("pairwiseCiphers"),
      visible: (v) => shown(v) && WPA_FAMILY.includes(security(v)),
    },
  ];
  if (isStation) {
    const bg = bgscanOf(get(setting("bgscan")));
    const bgOn = (v: IfValues) => station(v) && v["iBgscan"] !== "NONE";
    const checkInterval = (value: string, v: IfValues) =>
      !/^\d+$/.test(value.trim())
        ? "The bgscan interval must be a numerical value"
        : /^\d+$/.test(v["iBgShort"]) && /^\d+$/.test(v["iBgLong"]) && +v["iBgShort"] >= +v["iBgLong"]
          ? "The Bgscan Short Interval value must be less than the Bgscan Long Interval value"
          : "";
    fields.push(
      {
        key: "iGroup",
        label: "Group Ciphers",
        note: "For broadcast traffic",
        kind: "select",
        options: CIPHERS,
        read: (g) => textOf(g(setting("groupCiphers"))) || "CCMP",
        setting: setting("groupCiphers"),
        visible: (v) => station(v) && WPA_FAMILY.includes(security(v)),
      },
      {
        key: "iBgscan",
        label: "Bgscan Module",
        note: "Background scanning for a better access point",
        kind: "select",
        options: BGSCAN,
        read: () => bg.module,
        write: writeBgscan,
        visible: station,
      },
      {
        key: "iBgRssi",
        label: "Bgscan Signal Strength Threshold",
        note: "Below it, scans come more often",
        kind: "number",
        unit: "dBm",
        read: () => bg.rssi,
        write: writeBgscan,
        visible: bgOn,
        check: (value) => (ints(value) ? "" : "A whole number of dBm, as -80"),
      },
      { key: "iBgShort", label: "Bgscan Short Interval", kind: "number", unit: "s", min: 0, read: () => bg.short, write: writeBgscan, visible: bgOn, check: checkInterval },
      { key: "iBgLong", label: "Bgscan Long Interval", kind: "number", unit: "s", min: 0, read: () => bg.long, write: writeBgscan, visible: bgOn, check: checkInterval },
      {
        key: "iPing",
        label: "Ping Access Point & renew DHCP lease if not reachable",
        kind: "check",
        read: (g) => String(g(setting("pingAccessPoint")) === true || g(setting("pingAccessPoint")) === "true"),
        setting: setting("pingAccessPoint"),
        visible: station,
      }
    );
  }
  fields.push(
    {
      key: `${p}IgnoreSsid`,
      label: "Ignore Broadcast SSID",
      note: isStation ? "Don't scan for the SSID" : "Hides the network: no SSID in its beacons",
      kind: "check",
      read: (g) => String(g(setting("ignoreSSID")) === true || g(setting("ignoreSSID")) === "true"),
      setting: setting("ignoreSSID"),
      visible: shown,
    },
    {
      key: `${p}Channel`,
      label: "Channel List",
      kind: "select",
      optionsOf: (v) => lists[v[`${p}Band`]] ?? lists["RADIO_MODE_80211nHT20"],
      read: (g) => channelOf(g(setting("channel"))),
      setting: setting("channel"),
      visible: shown,
    }
  );
  return fields;
}

function wirelessTab(get: IfRead, status: IfStatus): IfTab {
  const fields: IfField[] = [
    {
      key: "wifiMode",
      label: "Wireless Mode",
      kind: "select",
      options: [
        { value: WIFI_MODE.station, label: "Station Mode", info: "Joins an existing Wi-Fi network." },
        { value: WIFI_MODE.ap, label: "Access Point", info: "Creates a Wi-Fi network for other devices to join." },
      ],
      read: (g) => (textOf(g("config.wifi.mode")) === WIFI_MODE.ap ? WIFI_MODE.ap : WIFI_MODE.station),
      write: (v, set) => {
        set("config.wifi.mode", v["wifiMode"]);
        // A station serves neither DHCP nor NAT.
        if (!ap(v)) {
          stopServing(set);
        }
      },
      // A WAN interface is a station.
      enabled: (v) => !ip4Wan(v) && ip6(v) !== IP6.wan,
      effect: (v) => {
        if (!ap(v)) {
          v["routerMode"] = "off";
        }
      },
    },
    ...wifiModeFields("infra", get, status),
    ...wifiModeFields("master", get, status),
    { key: "wifiCountry", label: "Country Code", note: "00: unknown", kind: "static", read: (_g, s) => textOf(s["countryCode"]) },
  ];
  return {
    id: "wireless",
    label: "Wireless",
    icon: "wifi",
    sections: [{ title: "", fields }],
    enabled: ifaceEnabled,
    disabledNote: "Enable IPv4 or IPv6 (and leave IPv4 managed) to set the interface's wireless network.",
  };
}

// ---- 802.1x --------------------------------------------------------------------------------------------------------------

function dot1xTab(): IfTab {
  const tls = (v: IfValues) => v["eap"] === EAP.tls;
  const fields: IfField[] = [
    {
      key: "eap",
      label: "Enterprise EAP",
      kind: "select",
      options: [
        { value: EAP.tls, label: "TLS" },
        { value: EAP.ttls, label: "TTLS" },
        { value: EAP.peap, label: "PEAP" },
      ],
      read: (g) => ([EAP.tls, EAP.peap].includes(textOf(g("config.802-1x.eap"))) ? textOf(g("config.802-1x.eap")) : EAP.ttls),
      write: (v, set) => {
        set("config.802-1x.eap", v["eap"]);
        set("config.802-1x.innerAuth", v["innerAuth"]);
      },
      effect: (v) => {
        v["innerAuth"] = tls(v) ? INNER.none : INNER.mschapv2;
      },
    },
    {
      key: "innerAuth",
      label: "Inner Authentication",
      note: "Set by the EAP: MSCHAPV2 for PEAP and TTLS, none for TLS",
      kind: "select",
      options: [
        { value: INNER.none, label: "NONE" },
        { value: INNER.mschapv2, label: "MSCHAPV2" },
      ],
      read: (g) => (textOf(g("config.802-1x.innerAuth")) === INNER.mschapv2 ? INNER.mschapv2 : INNER.none),
      setting: "config.802-1x.innerAuth",
      enabled: () => false,
    },
    { key: "identity", label: "Identity (Username)", kind: "text", setting: "config.802-1x.identity", check: required("Required", () => true) },
    {
      key: "dot1xPassword",
      label: "Password",
      kind: "password",
      read: () => "",
      setting: "config.802-1x.password",
    },
    {
      key: "keystore",
      label: "Keystore Pid",
      note: "The keystore service holding the certificate and key",
      kind: "text",
      setting: "config.802-1x.keystore.pid",
      visible: tls,
      check: required("Required", () => true),
    },
    { key: "caCert", label: "Certificate Authority Certificate (CA-Cert) - Optional", note: "Its name in the keystore", kind: "text", setting: "config.802-1x.ca-cert-name", visible: tls },
    {
      key: "keyPair",
      label: "Client Public/Private Key Pair",
      note: "Its name in the keystore",
      kind: "text",
      setting: "config.802-1x.private-key-name",
      write: (v, set) => {
        set("config.802-1x.private-key-name", v["keyPair"].trim());
        set("config.802-1x.client-cert-name", v["keyPair"].trim());
      },
      visible: tls,
      check: required("Required", () => true),
    },
  ];
  return {
    id: "8021x",
    label: "802.1x",
    icon: "badge",
    sections: [{ title: "", fields }],
    enabled: (v) => ifaceEnabled(v) && station(v) && v["iSecurity"] === ENTERPRISE,
    disabledNote: "802.1x is for a station on a WPA2/WPA3-Enterprise network (its Wireless Security).",
  };
}

// ---- Cellular, GPS, Antenna ----------------------------------------------------------------------------------------------

const list = (x: unknown) => (Array.isArray(x) ? x.join(", ") : textOf(x));

function cellularTab(status: IfStatus): IfTab {
  const cdma = list(status["accessTechnologies"]).match(/EVDO|CDMA/) !== null;
  const authed = (v: IfValues) => !cdma && v["authType"] !== "NONE";
  const whole = (message: string, min = 0) => (value: string) => (/^\d+$/.test(value.trim()) && +value >= min ? "" : message);
  return {
    id: "cellular",
    label: "Cellular",
    icon: "cell_tower",
    sections: [
      {
        title: "Modem",
        fields: [
          {
            key: "modemModel",
            label: "Model",
            kind: "static",
            read: (_g, s) => [textOf(s["manufacturer"]).slice(0, 20), textOf(s["model"]).slice(0, 40)].filter(Boolean).join("-"),
          },
          { key: "modemTech", label: "Network Technology", kind: "static", read: (_g, s) => list(s["accessTechnologies"]) },
          { key: "modemConnection", label: "Connection Type", kind: "static", read: (_g, s) => textOf(s["connectionType"]) },
          { key: "pppNum", label: "Interface #", kind: "static", read: (g) => textOf(g("config.pppNum") ?? 0) },
        ],
      },
      {
        title: "Connection",
        fields: [
          { key: "modemId", label: "Modem Identifier", kind: "text", setting: "usb.product.name" },
          { key: "apn", label: "APN", note: "Empty: taken from the provider", kind: "text", setting: "config.apn", enabled: () => !cdma },
          {
            key: "authType",
            label: "Auth Type",
            kind: "select",
            options: [
              { value: "NONE", label: "None" },
              { value: "AUTO", label: "Auto" },
              { value: "CHAP", label: "CHAP" },
              { value: "PAP", label: "PAP" },
            ],
            read: (g) => (["AUTO", "CHAP", "PAP"].includes(textOf(g("config.authType"))) ? textOf(g("config.authType")) : "NONE"),
            setting: "config.authType",
            enabled: () => !cdma,
          },
          { key: "modemUser", label: "Username", kind: "text", setting: "config.username", enabled: authed },
          { key: "modemPassword", label: "Password", kind: "password", read: () => "", setting: "config.password", enabled: authed },
          {
            key: "resetTimeout",
            label: "Modem Reset Timeout",
            note: "Minutes without a connection before a reset\n0: never",
            kind: "number",
            unit: "min",
            min: 0,
            ranges: [[0, 0], [2, Infinity]],
            setting: "config.resetTimeout",
            check: (value) =>
              /^\d+$/.test(value.trim()) && +value !== 1 ? "" : '"Modem Reset Timeout" must be set to 0 (to disable) or must be greater than 1 minute.',
          },
          {
            key: "persist",
            label: "Reopen connection on termination",
            kind: "check",
            read: (g) => String(g("config.persist") !== false && g("config.persist") !== "false"),
            setting: "config.persist",
          },
          {
            key: "holdoff",
            label: "Connection Attempts Retry Delay",
            kind: "number",
            unit: "s",
            min: 0,
            setting: "config.holdoff",
            check: whole('"Connection Attempts Retry Delay" must be a positive integer.'),
          },
          {
            key: "maxFail",
            label: "Connection Attempts",
            note: "0: no limit",
            kind: "number",
            min: 0,
            setting: "config.maxFail",
            check: whole('"Connection Attempts" must be a positive integer.'),
          },
          {
            key: "lcpInterval",
            label: "LCP Echo Interval",
            note: "PPP's lcp-echo-interval\n0: off",
            kind: "number",
            unit: "s",
            min: 0,
            setting: "config.lpcEchoInterval",
            check: whole('"LCP Echo Interval" must be set to either 0 or positive integer.'),
          },
          {
            key: "lcpFailure",
            label: "LCP Echo Failure",
            note: "PPP's lcp-echo-failure\n0: off",
            kind: "number",
            min: 0,
            setting: "config.lpcEchoFailure",
            check: whole('"LCP Echo Failure" must be set to either 0 or positive integer.'),
          },
        ],
      },
    ],
    enabled: ifaceEnabled,
    disabledNote: "Enable IPv4 or IPv6 (and leave IPv4 managed) to set the modem's connection.",
  };
}

function gpsTab(status: IfStatus): IfTab {
  const supported = status["gpsSupported"] === true;
  return {
    id: "gps",
    label: "GPS",
    icon: "satellite_alt",
    sections: [
      {
        title: "",
        fields: [
          {
            key: "gpsEnabled",
            label: "Enable GPS",
            kind: "check",
            read: (g) => String(g("config.gpsEnabled") === true || g("config.gpsEnabled") === "true"),
            setting: "config.gpsEnabled",
          },
          {
            key: "gpsMode",
            label: "GPS Mode",
            kind: "select",
            options: [
              { value: "kuraModemGpsModeUnmanaged", label: "Unmanaged", info: "Another application reads the GPS port." },
              { value: "kuraModemGpsModeManagedGps", label: "Managed GPS", info: "The modem manager reads the GPS." },
            ],
            read: (g) => (textOf(g("config.gpsMode")) === "kuraModemGpsModeManagedGps" ? "kuraModemGpsModeManagedGps" : "kuraModemGpsModeUnmanaged"),
            setting: "config.gpsMode",
            enabled: (v) => v["gpsEnabled"] === "true",
          },
        ],
      },
    ],
    enabled: (v) => supported && ip4(v) !== IP4.unmanaged,
    disabledNote: supported ? "GPS is set here once IPv4 is managed." : "The modem doesn't report GPS support.",
  };
}

function antennaTab(): IfTab {
  const sim = (s: IfStatus) => {
    const sims = Array.isArray(s["availableSims"]) ? s["availableSims"] : [];
    return sims.find((x: any) => x?.active) ?? sims[Number(s["activeSimIndex"]) || 0] ?? {};
  };
  const facts: [string, string, (s: IfStatus) => string][] = [
    ["regStatus", "Registration Status", (s) => textOf(s["registrationStatus"])],
    ["imsi", "IMSI", (s) => textOf(sim(s)["imsi"])],
    ["iccid", "ICCID", (s) => textOf(sim(s)["iccid"])],
    ["operator", "Network", (s) => textOf(s["operatorName"])],
    ["radio", "Radio", (s) => list(s["accessTechnologies"])],
    ["bands", "Frequency Band", (s) => list(s["currentBands"])],
  ];
  return {
    id: "antenna",
    label: "Antenna",
    icon: "settings_input_antenna",
    sections: [{ title: "", fields: facts.map(([key, label, read]) => ({ key, label, kind: "static", read: (_g, s) => read(s) }) as IfField) }],
  };
}

// ---- Advanced ------------------------------------------------------------------------------------------------------------

function advancedTab(ethernet: boolean): IfTab {
  return {
    id: "advanced",
    label: "Advanced",
    icon: "tune",
    sections: [
      {
        title: "",
        fields: [
          {
            key: "ip4Mtu",
            label: "IPv4 MTU",
            note: "0: found automatically",
            kind: "number",
            unit: "bytes",
            min: 0,
            max: 1500,
            ranges: [[0, 0], [576, 1500]],
            read: (g) => textOf(g("config.ip4.mtu") ?? 0),
            write: (v, set) => set("config.ip4.mtu", v["ip4Mtu"].trim() || "0", "INTEGER"),
            check: (value) => (ints(value) && (+value === 0 || (+value >= 576 && +value <= 1500)) ? "" : "IPv4 MTU must be 0, or a positive Integer between 576 and 1500."),
          },
          {
            key: "ip6Mtu",
            label: "IPv6 MTU",
            note: "0: found automatically",
            kind: "number",
            unit: "bytes",
            min: 0,
            max: 1500,
            ranges: [[0, 0], [1280, 1500]],
            read: (g) => textOf(g("config.ip6.mtu") ?? 0),
            write: (v, set) => set("config.ip6.mtu", v["ip6Mtu"].trim() || "0", "INTEGER"),
            check: (value) => (ints(value) && (+value === 0 || (+value >= 1280 && +value <= 1500)) ? "" : "IPv6 MTU must be 0, or a positive Integer between 1280 and 1500."),
          },
          {
            key: "promisc",
            label: "Promiscuous Mode",
            note: "Receives all traffic on the link, not only its own",
            kind: "select",
            options: [
              { value: "-1", label: "System default" },
              { value: "1", label: "Enabled" },
              { value: "0", label: "Disabled" },
            ],
            read: (g) => (["1", "0"].includes(textOf(g("config.promisc"))) ? textOf(g("config.promisc")) : "-1"),
            write: (v, set) => set("config.promisc", v["promisc"], "INTEGER"),
            enabled: () => ethernet,
          },
        ],
      },
    ],
  };
}

// ---- The interface's tabs ------------------------------------------------------------------------------------------------

/** An interface's kind, by the type the unit reports: a Wi-Fi, a modem, the loopback, or any other (as an Ethernet). */
export function esfInterfaceKind(iface: EsfInterface): "wifi" | "modem" | "loopback" | "ethernet" | "other" {
  const type = iface.type.toUpperCase();
  if (type === "WIFI") {
    return "wifi";
  }
  if (type === "MODEM") {
    return "modem";
  }
  if (type === "LOOPBACK" || iface.id.startsWith("mon.wlan")) {
    return "loopback";
  }
  return type === "ETHERNET" ? "ethernet" : "other";
}

/**
 * An interface's tabs, as the console has them by its type — Wi-Fi: IPv4, IPv6, Wireless, 802.1x, DHCPv4 & NAT, Advanced; a
 * modem: IPv4, IPv6, Cellular, GPS, Antenna, Advanced; the loopback: IPv4, IPv6, Advanced; any other: IPv4, IPv6, DHCPv4 & NAT,
 * Advanced — Hardware last (the panel's, from the unit's status).
 */
export function esfInterfaceTabs(iface: EsfInterface): IfTabsOf {
  const kind = esfInterfaceKind(iface);
  return (get, status) => {
    const modem = kind === "modem";
    const tabs: IfTab[] = [ip4Tab(modem), ip6Tab(modem)];
    if (kind === "wifi") {
      tabs.push(wirelessTab(get, status), dot1xTab(), dhcpNatTab(true));
    } else if (modem) {
      tabs.push(cellularTab(status), gpsTab(status), antennaTab());
    } else if (kind !== "loopback") {
      tabs.push(dhcpNatTab(false));
    }
    tabs.push(advancedTab(kind === "ethernet"));
    return tabs;
  };
}

/** The panel's tabs for an interface: its form's (by its type), then Hardware. */
export function esfInterfacePanelTabs(iface: EsfInterface): { id: string; label: string; icon: string; tooltip: string }[] {
  const tabs = esfInterfaceTabs(iface)(() => undefined, {});
  return [...tabs, ESF_HARDWARE_TAB].map((t) => ({ id: t.id, label: t.label, icon: t.icon, tooltip: t.label }));
}

/** The Hardware tab's facts, as the console lists them — those the unit reports. */
export function esfInterfaceHardware(iface: EsfInterface, usbDevicePath = ""): { label: string; value: string }[] {
  const s = iface.raw ?? {};
  const kind = esfInterfaceKind(iface);
  const signal =
    kind === "wifi" ? textOf(s["activeWifiAccessPoint"]?.["signalStrength"]) : kind === "modem" ? textOf(s["signalStrength"]) : "";
  const rows: [string, string][] = [
    ["State", textOf(s["state"] ?? s["connectionStatus"])],
    ["Name", iface.id],
    ["Type", textOf(s["type"])],
    ["Hardware Address", textOf(s["hardwareAddress"])],
    ["Serial #", kind === "modem" ? textOf(s["serialNumber"]) : ""],
    ["Driver", textOf(s["driver"])],
    ["Version", textOf(s["driverVersion"])],
    ["Firmware", textOf(s["firmwareVersion"])],
    ["MTU", textOf(s["mtu"])],
    ["USB Device", kind === "modem" ? usbDevicePath : ""],
    ["Received Signal Strength (dBm)", signal],
    ["Current WLAN Channel", kind === "wifi" ? textOf(s["activeWifiAccessPoint"]?.["channel"]?.["channel"]) : ""],
  ];
  return rows.filter(([, value]) => value !== "").map(([label, value]) => ({ label, value }));
}
