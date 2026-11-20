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

// The ESF unit's cloud connections, as ESF's console's Cloud Connections page lays them out (Cloud Connection v1,
// `rest.cloudconnection`): one table — each connection (a cloud endpoint), then its publishers and subscribers — with its
// Service PID, Type, Status and Factory PID; a connection's settings its stack's components' (CloudService, DataService,
// MqttDataTransport, …), a publisher's or subscriber's its own; new ones made from the unit's factories.

import { EsfCloudEndpoint, EsfPubSub } from "./esf-api.models";
import { esfObject, esfShortName } from "./esf.models";

/** A connection ESF connects and disconnects (the others have no connection of their own). */
export const ESF_CLOUD_MANAGER = "CLOUD_CONNECTION_MANAGER";

/** A cloud connection factory: what makes connections, the PID it suggests and the PID's pattern. */
export interface EsfCloudFactory {
  pid: string;
  defaultPid: string;
  pidRegex: string;
}

/** A publisher / subscriber factory: its kind's factory, the connection factory whose connections it serves, its PID's defaults. */
export interface EsfPubSubFactory {
  factoryPid: string;
  connectionFactoryPid: string;
  defaultPid: string;
  pidRegex: string;
}

/** Words written in capitals in a factory's name ("RawMqttSubscriber" → "Raw MQTT Subscriber"). */
const NAME_ACRONYMS: Record<string, string> = { mqtt: "MQTT", iot: "IoT", http: "HTTP", sparkplug: "Sparkplug", aws: "AWS", api: "API" };

/**
 * A factory PID's name: its class, its words apart ("org.eclipse.kura.cloud.publisher.CloudPublisher" → "Cloud Publisher") — shown
 * over the PID wherever a factory is named (the cloud table's Factory column, the creation form's picker), the PID under it.
 */
export function esfFactoryName(pid: string): string {
  const cls = pid.split(".").pop() ?? pid;
  return cls
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(" ")
    .map((w) => NAME_ACRONYMS[w.toLowerCase()] ?? w)
    .join(" ");
}

/**
 * Factories as a picker's options: each by its name, its PID the muted line under it (`TbSelectOption.note` — a long PID wraps
 * there, never cut). Two of one name: the package segment before the class tells them apart ("Connection Factory · eclipseiot").
 */
export function esfFactoryOptions(pids: string[]): { value: string; label: string; note: string }[] {
  const names = pids.map(esfFactoryName);
  return pids.map((pid, i) => {
    const twin = names.filter((n) => n === names[i]).length > 1;
    const parts = pid.split(".");
    return { value: pid, label: twin && parts.length > 1 ? `${names[i]} · ${parts[parts.length - 2]}` : names[i], note: pid };
  });
}

const text = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const list = (v: unknown): any[] => (Array.isArray(v) ? v : []);

/** `esfCloudFactories`: the connection factories and the publisher / subscriber factories. */
export function parseEsfCloudFactories(reply: unknown): { connections: EsfCloudFactory[]; pubSubs: EsfPubSubFactory[] } {
  const body = esfObject(reply);
  return {
    connections: list(body["cloudConnectionFactories"]).map((f) => ({
      pid: text(f?.cloudConnectionFactoryPid),
      defaultPid: text(f?.defaultCloudEndpointPid),
      pidRegex: text(f?.cloudEndpointPidRegex),
    })),
    pubSubs: list(body["pubSubFactories"]).map((f) => ({
      factoryPid: text(f?.factoryPid),
      connectionFactoryPid: text(f?.cloudConnectionFactoryPid),
      defaultPid: text(f?.defaultPid),
      pidRegex: text(f?.defaultPidRegex),
    })),
  };
}

/** `esfCloudStackPids`: a connection's stack components (its CloudService, DataService, MqttDataTransport, …). */
export function parseEsfStackPids(reply: unknown): string[] {
  return list(esfObject(reply)["pids"]).map(text).filter(Boolean);
}

/** A row of the table: a connection, or one of its publishers / subscribers (under it). */
export interface EsfCloudRow {
  key: string;
  pid: string;
  /** "Cloud connection", "Publisher", "Subscriber". */
  type: string;
  /** Its type's icon, as ESF's table marks it: a cloud, an arrow up (publishes), an arrow down (subscribes). */
  icon: string;
  kind: "connection" | "pubsub";
  /** Its factory (a connection's: its connection factory). */
  factoryPid: string;
  /** A publisher's / subscriber's connection; a connection's own PID. */
  connectionPid: string;
  /** A connection's factory (a publisher's / subscriber's: its connection's). */
  connectionFactoryPid: string;
  /** Connected / Disconnected — a connection ESF connects; "" else. */
  status: string;
  manager: boolean;
  /** The row it's under (a publisher's / subscriber's connection), for the table's tree. */
  parent: string | null;
}

/** The table's rows: each connection, then its publishers and subscribers (as ESF lists them); those of no connection last. */
export function esfCloudRows(endpoints: EsfCloudEndpoint[], pubsub: EsfPubSub[]): EsfCloudRow[] {
  const rows: EsfCloudRow[] = [];
  const subRow = (p: EsfPubSub, parent: string | null, connectionFactoryPid: string): EsfCloudRow => ({
    key: `${p.type}:${p.pid}`,
    pid: p.pid,
    type: p.type.toUpperCase() === "SUBSCRIBER" ? "Subscriber" : "Publisher",
    icon: p.type.toUpperCase() === "SUBSCRIBER" ? "arrow_downward" : "arrow_upward",
    kind: "pubsub",
    factoryPid: p.factoryPid,
    connectionPid: p.endpointPid,
    connectionFactoryPid,
    status: "",
    manager: false,
    parent,
  });
  for (const e of endpoints) {
    const key = `endpoint:${e.pid}`;
    const manager = e.type === ESF_CLOUD_MANAGER;
    rows.push({
      key,
      pid: e.pid,
      type: "Cloud connection",
      icon: "cloud",
      kind: "connection",
      factoryPid: e.factoryPid,
      connectionPid: e.pid,
      connectionFactoryPid: e.factoryPid,
      status: manager ? (e.state.toUpperCase() === "CONNECTED" ? "Connected" : "Disconnected") : "",
      manager,
      parent: null,
    });
    pubsub.filter((p) => p.endpointPid === e.pid).forEach((p) => rows.push(subRow(p, key, e.factoryPid)));
  }
  const known = new Set(endpoints.map((e) => e.pid));
  pubsub.filter((p) => !known.has(p.endpointPid)).forEach((p) => rows.push(subRow(p, null, "")));
  return rows;
}

/** A stack component's tab: its name (the PID's last part, "MqttDataTransport") and an icon by what it is. */
export function esfStackTab(pid: string): { id: string; label: string; icon: string; tooltip: string } {
  const label = esfShortName(pid);
  const icon = /CloudService|CloudEndpoint|ConnectionManager/i.test(label)
    ? "cloud"
    : /DataService/i.test(label)
      ? "database"
      : /Transport|Mqtt/i.test(label)
        ? "swap_vert"
        : /Provisioning/i.test(label)
          ? "key"
          : "tune";
  return { id: pid, label, icon, tooltip: label };
}

/** A new PID against its factory's pattern ("" fine). */
export function esfCloudPidError(pid: string, regex: string): string {
  if (!pid.trim()) {
    return "Required";
  }
  if (!regex) {
    return "";
  }
  try {
    return new RegExp(regex).test(pid.trim()) ? "" : `Must match the factory's pattern: ${regex}`;
  } catch {
    return "";
  }
}
