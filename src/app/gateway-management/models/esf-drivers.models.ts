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

// The unit's drivers and assets, as ESF's console's "Drivers and Assets" page has them — all Configuration v2 (`rest.configuration`):
// a driver is an instance of a driver factory (`org.eclipse.kura.driver.modbus`, `…opcua`, ESF's Allen-Bradley …), an asset an
// instance of the Wire asset factory (`org.eclipse.kura.wire.WireAsset`, its definition `org.eclipse.kura.asset`) naming its driver
// (`driver.pid`). An asset's settings are its own few (description, driver, what it emits) and then each channel's,
// `<channel>#<setting>`: the ones every channel has (`+enabled`, `+name`, `+type`, `+value.type`, scale and offset, `+unit`,
// `+listen`) and its driver's (Modbus: `unit.id`, `primary.table`, `memory.address`, `data.type` …; OPC UA: `node.id` …). Checked
// on dev-inf-gw-01 (ESF 7.6.2) and agg-3a12-gw-01 (ESF 7.6.0), 18 November 2026.

import { EsfAttribute, esfShortName } from "./esf.models";
import { esfSettingLabel } from "./esf-notes.models";
import { EsfComponentFactory } from "./esf-security.models";

/** The Wire asset's definition id (an asset's form is laid out by it — `esf-layouts.models.ts`). */
export const ESF_ASSET_DEFINITION = "org.eclipse.kura.asset";

/** A driver factory: a `driver` part in its pid ("org.eclipse.kura.driver.modbus", "com.eurotech.framework.driver.AllenBradley"). */
export function isEsfDriverFactory(factoryPid: string): boolean {
  return /(^|\.)driver(\.|$)/i.test(factoryPid) || /Driver$/.test(esfShortName(factoryPid));
}

/** An asset factory: its class an asset ("org.eclipse.kura.wire.WireAsset"). */
export function isEsfAssetFactory(factoryPid: string): boolean {
  return /Asset$/.test(esfShortName(factoryPid));
}

/** Every driver and asset the unit has (the Configuration view leaves them out — this view shows them). */
export function esfDriverAssetPids(components: EsfComponentFactory[]): Set<string> {
  return new Set(components.filter((c) => c.factoryPid && (isEsfDriverFactory(c.factoryPid) || isEsfAssetFactory(c.factoryPid))).map((c) => c.pid));
}

/** A driver's kind, by its factory: "Modbus", "OPC UA", "Allen Bradley", "GPIO". */
export function esfDriverTypeName(factoryPid: string): string {
  const last = esfShortName(factoryPid);
  return esfSettingLabel({ id: last, name: last });
}

/**
 * An asset's settings run 5–6 KB a channel (most of it its definition's descriptions), measured on 18 November 2026: OPC UA 6.2 KB
 * (dev-inf-gw-01's opcuaServer), J1939 6.0 KB (rmx-61016-gw-01's mixer — its 27 channels a 167,253-byte reply), GPIO 4.8 KB,
 * Modbus 4.7 KB; the asset's own settings ~3.6 KB more. One with more channels than this isn't read whole — its reply could pass
 * ThingsBoard's MQTT limit (262,144 bytes on our server since 18 November 2026; 65,536 by default) and the gateway's session would
 * be closed. 30 holds a driver of 8 KB a channel under it (~244 KB): room for a driver not measured yet. Its channels are counted
 * with the Assets REST API instead (a few bytes each).
 */
export const ESF_ASSET_READ_MAX_CHANNELS = 30;

/** What the view reads of an asset: its driver (null: not read — too many channels), its channels' count, its description. */
export interface EsfAssetSummary {
  driverPid: string | null;
  channels: number;
  description: string;
}

/** A row of the drivers and assets table: a driver, its assets under it (`parent`). */
export interface EsfDriverAssetRow {
  key: string;
  pid: string;
  kind: "driver" | "asset";
  /** An asset's driver's key (the tree's parent); "" a driver, or an asset whose driver the unit hasn't. */
  parent: string;
  factoryPid: string;
  /** A driver's kind ("Modbus"), an asset's: "Asset" — or, its driver missing, "Asset · no driver". */
  type: string;
  /** An asset's channels ("" a driver, or not read). */
  channels: number | "";
  description: string;
  icon: string;
  /** An asset's driver (its `driver.pid`); "" a driver. */
  driverPid: string;
}

export const ESF_DRIVER_ICON = "settings_input_component";
export const ESF_ASSET_ICON = "sensors";

/** The table's rows: each driver (by PID), then each of its assets under it; an asset naming no driver the unit has at the top. */
export function esfDriverAssetRows(components: EsfComponentFactory[], assets: Map<string, EsfAssetSummary>): EsfDriverAssetRow[] {
  const byPid = (a: EsfComponentFactory, b: EsfComponentFactory) => a.pid.localeCompare(b.pid, undefined, { numeric: true });
  const drivers = components.filter((c) => c.factoryPid && isEsfDriverFactory(c.factoryPid)).sort(byPid);
  const driverPids = new Set(drivers.map((d) => d.pid));
  const rows: EsfDriverAssetRow[] = drivers.map((d) => ({
    key: d.pid,
    pid: d.pid,
    kind: "driver",
    parent: "",
    factoryPid: d.factoryPid,
    type: esfDriverTypeName(d.factoryPid),
    channels: "",
    description: "",
    icon: ESF_DRIVER_ICON,
    driverPid: "",
  }));
  for (const a of components.filter((c) => c.factoryPid && isEsfAssetFactory(c.factoryPid)).sort(byPid)) {
    const summary = assets.get(a.pid);
    const driver = summary?.driverPid ?? "";
    const known = driverPids.has(driver);
    rows.push({
      key: a.pid,
      pid: a.pid,
      kind: "asset",
      parent: known ? driver : "",
      factoryPid: a.factoryPid,
      type: summary && summary.driverPid !== null && !known ? "Asset · no driver" : "Asset",
      channels: summary ? summary.channels : "",
      description: summary?.description ?? "",
      icon: ESF_ASSET_ICON,
      driverPid: driver,
    });
  }
  return rows;
}

/** One of an asset's channels: its name (its settings' prefix) and its settings, in the definition's order. */
export interface EsfAssetChannel {
  name: string;
  attributes: EsfAttribute[];
}

/** An asset's channels, from its definition's `<channel>#<setting>` settings, in their order. */
export function esfAssetChannels(attributes: EsfAttribute[]): EsfAssetChannel[] {
  const channels = new Map<string, EsfAttribute[]>();
  for (const a of attributes) {
    const at = a.id.indexOf("#");
    if (at > 0) {
      const name = a.id.slice(0, at);
      channels.set(name, [...(channels.get(name) ?? []), a]);
    }
  }
  return [...channels.entries()].map(([name, list]) => ({ name, attributes: list }));
}

/** An asset's own settings (not a channel's). */
export function esfAssetOwnSetting(attr: { id: string }): boolean {
  return !attr.id.includes("#");
}

/** A channel setting every channel has, whatever its driver (`+enabled`, `+value.type` …); else its driver's. */
export function esfChannelCommonSetting(attr: { id: string }): boolean {
  return attr.id.slice(attr.id.indexOf("#") + 1).startsWith("+");
}

/** Channel settings written out, where the id says little ("+scaleoffset.type" → "Scale Offset Type"). */
const CHANNEL_LABELS: Record<string, string> = {
  "+enabled": "Enabled",
  "+name": "Name",
  "+type": "Mode",
  "+value.type": "Value Type",
  "+scaleoffset.type": "Scale/Offset Type",
  "+scale": "Scale",
  "+offset": "Offset",
  "+unit": "Unit",
  "+listen": "Listen",
};

/** A channel setting's label: its own part, written out ("A#+value.type" → "Value type", "A#memory.address" → "Memory Address"). */
export function esfChannelLabel(attr: { id: string }): string {
  const own = attr.id.slice(attr.id.indexOf("#") + 1);
  if (own in CHANNEL_LABELS) {
    return CHANNEL_LABELS[own];
  }
  const plain = own.replace(/^\+/, "");
  return esfSettingLabel({ id: plain, name: plain });
}

/** `esfCreateFactoryComponent`'s body for a new asset: the Wire asset factory's instance, its driver set, a snapshot taken. */
export function esfCreateAssetRequest(pid: string, factoryPid: string, driverPid: string): Record<string, unknown> {
  return {
    configs: [{ pid: pid.trim(), factoryPid, properties: { "driver.pid": { type: "STRING", value: driverPid } } }],
    takeSnapshot: true,
  };
}

/**
 * A new channel's name: what's wrong with it ("" nothing) — needed; letters, digits, dots, dashes and underscores (its settings are
 * keyed `<name>#…`, so never a "#"); not one the asset has.
 */
export function esfChannelNameError(name: string, taken: string[]): string {
  const n = name.trim();
  if (!n) {
    return "Required";
  }
  if (!/^[A-Za-z0-9._-]+$/.test(n)) {
    return "Letters, digits, dots, dashes and underscores only";
  }
  return taken.some((t) => t.toLowerCase() === n.toLowerCase()) ? "The asset already has a channel of this name" : "";
}
