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

// The ESF unit's digital twin (reported state): what its ESF connector keeps in ThingsBoard as the gateway device's client
// attributes, so the dashboard reads them instead of asking the unit each time. The connector's `mapping` polls the unit's REST
// API locally, each area on its own period, and sends a value only when it changed (the ON_CHANGE report strategy; every value
// again once a day, `ttl`, and after the gateway restarts). Kapua keeps a Kura unit's configuration the same way, as a store it
// serves while the unit is unreachable.
//
// The device: `currentThingsBoardGateway`, the gateway's reserved name for its own device — the attributes land on the gateway
// device itself (its `v1/devices/me`), the same connector on every unit. The gateway also connects a device of that name the
// first time (one for the whole tenant), which receives nothing else.
//
// What stays a live read (an RPC, `esf-api.models.ts`): what changes on every read (network status: byte counters, Wi-Fi scans;
// the position), replies that are a bare list (the connector converts a list item by item: packages, users, keystores,
// permissions), what comes in another order each read (the components with their factories), the containers and images (ESF
// answers 500 while its Container Orchestration is off — an error logged each poll), the system packages (148 KB, read when
// their tab opens), and the network API's component list.
//
// No module imports here: `scripts/esf-connector.mjs` reads this file to write the connector's `mapping`.

/** The gateway's own device, by the gateway's reserved name (its data goes to the gateway's `v1/devices/me`). */
export const ESF_TWIN_DEVICE = "currentThingsBoardGateway";

/** A value is sent when it changed, and again once a day (s) — and after the gateway restarts (its cache is in memory). */
const ON_CHANGE = { type: "ON_CHANGE", ttl: 86400 };

/** The twin's attributes (the gateway device's client attributes), besides a component's (`esfTwinConfigKey`, `esfTwinDefinitionKey`). */
export const ESF_TWIN_KEY = {
  /**
   * The components' pids (Configuration v2's list, in the same order on every read): the components there are now — a
   * component's attributes stay after it's deleted, so this list is what's there. (Its `pidsWithFactory` comes in another order
   * each read, so it would be sent on every poll: it stays a live read.)
   */
  components: "esf.components",
  /** The snapshot ids, oldest first (a new one with every configuration change made with a snapshot — ids only grow). */
  snapshots: "esf.snapshots",
  /**
   * The cloud connections, each with its state (CONNECTED / DISCONNECTED), and their publishers and subscribers — those come in
   * another order each read, so that attribute (~1 KB) is sent every poll.
   */
  cloudEndpoints: "esf.cloud.endpoints",
  cloudPubSub: "esf.cloud.pubsub",
  /** The OSGi bundles (the inventory's containers and images stay live reads: ESF answers 500 while its Container Orchestration is off). */
  bundles: "esf.bundles",
  /** The framework's and ESF's properties (System v1). */
  frameworkProps: "esf.props.framework",
  kuraProps: "esf.props.kura",
} as const;

/** A component's settings (its `properties`, each `{ type, value }`; passwords as ESF gives them, "placeholder"). */
export const esfTwinConfigKey = (pid: string): string => `esf.cfg.${pid}`;
/** A component's definition (its settings' names, types and choices — the settings form is built from it). */
export const esfTwinDefinitionKey = (pid: string): string => `esf.def.${pid}`;

/** One poll of the connector's: a GET on the unit, its period and timeout (s), and the attributes it makes (`${…}` from the reply). */
interface EsfTwinPoll {
  url: string;
  scanPeriod: number;
  timeout: number;
  /** A list in the reply to make attributes of item by item (the configurations' `configs`). */
  unpack?: string;
  attributes: { key: string; value: string }[];
}

const CONFIGURATIONS = "services/configuration/v2/configurableComponents/configurations";

/**
 * The connector's polls. The configurations are read whole (one GET, ~320 KB on a ReliaGATE 10-14 with 54 components, its
 * definitions ~250 KB of it): their settings every minute, their definitions — which change only with ESF — every hour.
 */
export const ESF_TWIN_POLLS: EsfTwinPoll[] = [
  { url: CONFIGURATIONS, scanPeriod: 60, timeout: 30, unpack: "configs", attributes: [{ key: "esf.cfg.${pid}", value: "${properties}" }] },
  { url: CONFIGURATIONS, scanPeriod: 3600, timeout: 30, unpack: "configs", attributes: [{ key: "esf.def.${pid}", value: "${definition}" }] },
  { url: "services/configuration/v2/configurableComponents", scanPeriod: 60, timeout: 15, attributes: [{ key: ESF_TWIN_KEY.components, value: "${pids}" }] },
  { url: "services/configuration/v2/snapshots", scanPeriod: 30, timeout: 15, attributes: [{ key: ESF_TWIN_KEY.snapshots, value: "${ids}" }] },
  {
    url: "services/cloudconnection/v1/instances",
    scanPeriod: 60,
    timeout: 15,
    attributes: [
      { key: ESF_TWIN_KEY.cloudEndpoints, value: "${cloudEndpointInstances}" },
      { key: ESF_TWIN_KEY.cloudPubSub, value: "${pubsubInstances}" },
    ],
  },
  { url: "services/inventory/v1/bundles", scanPeriod: 300, timeout: 15, attributes: [{ key: ESF_TWIN_KEY.bundles, value: "${bundles}" }] },
  // The framework's properties are the reply itself (`${$}`), with the `ts` the connector adds to it: sent every poll, an hour.
  { url: "services/system/v1/properties/framework", scanPeriod: 3600, timeout: 15, attributes: [{ key: ESF_TWIN_KEY.frameworkProps, value: "${$}" }] },
  { url: "services/system/v1/properties/kura", scanPeriod: 3600, timeout: 15, attributes: [{ key: ESF_TWIN_KEY.kuraProps, value: "${kuraProperties}" }] },
];

/** Whether a connector's configuration carries the twin's polls (a mapping entry onto the gateway's own device). */
export function esfTwinEnabled(connectorConfig: Record<string, unknown> | null | undefined): boolean {
  const mapping = connectorConfig?.["mapping"];
  return Array.isArray(mapping) && mapping.some((m) => m?.converter?.deviceNameJsonExpression === ESF_TWIN_DEVICE);
}

/** After a change sent to the unit, reads go to the unit itself this long (ms): until every poll a change shows in has run again (the bundles' 5 minutes). */
export const ESF_TWIN_SETTLE_MS = 330_000;

/**
 * A read the twin answers in the unit's place: the attributes it needs (from the call's body; null: the twin can't answer it),
 * and ESF's reply made from their values — the very shape the unit's REST API gives, so the views parse it as ever — or null
 * when one is missing (not reported yet), and the read goes to the unit.
 */
export interface EsfTwinRead {
  keys(body: unknown): string[] | null;
  reply(values: Record<string, unknown>, body: unknown): unknown | null;
}

const pidsOf = (body: unknown): string[] | null => {
  const pids = (body as { pids?: unknown } | null)?.pids;
  return Array.isArray(pids) && pids.length && pids.every((p) => typeof p === "string") ? (pids as string[]) : null;
};

/** Components' configurations (`{ pids }` → `{ configs: [{ pid, definition, properties }] }`) — the configuration, network and cloud APIs alike. */
const CONFIGURATIONS_READ: EsfTwinRead = {
  keys: (body) => pidsOf(body)?.flatMap((pid) => [esfTwinConfigKey(pid), esfTwinDefinitionKey(pid)]) ?? null,
  reply: (values, body) => {
    const pids = pidsOf(body) ?? [];
    if (pids.some((pid) => values[esfTwinConfigKey(pid)] === undefined || values[esfTwinDefinitionKey(pid)] === undefined)) {
      return null;
    }
    return { configs: pids.map((pid) => ({ pid, definition: values[esfTwinDefinitionKey(pid)], properties: values[esfTwinConfigKey(pid)] })) };
  },
};

/** One attribute, shaped as ESF's reply. */
const oneKey = (key: string, shape: (value: unknown) => unknown): EsfTwinRead => ({
  keys: () => [key],
  reply: (values) => (values[key] === undefined ? null : shape(values[key])),
});

const listOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** The reads the twin answers, by the call's name (`ESF_CALLS`). */
export const ESF_TWIN_READS: Record<string, EsfTwinRead> = {
  esfListComponents: oneKey(ESF_TWIN_KEY.components, (pids) => ({ pids: listOf(pids).filter((pid): pid is string => typeof pid === "string") })),
  esfGetConfig: CONFIGURATIONS_READ,
  esfNetGetConfig: CONFIGURATIONS_READ,
  esfCloudGetConfigs: CONFIGURATIONS_READ,
  esfListSnapshots: oneKey(ESF_TWIN_KEY.snapshots, (ids) => ({ ids: listOf(ids) })),
  esfCloudInstances: {
    keys: () => [ESF_TWIN_KEY.cloudEndpoints, ESF_TWIN_KEY.cloudPubSub],
    reply: (values) =>
      values[ESF_TWIN_KEY.cloudEndpoints] === undefined
        ? null
        : { cloudEndpointInstances: listOf(values[ESF_TWIN_KEY.cloudEndpoints]), pubsubInstances: listOf(values[ESF_TWIN_KEY.cloudPubSub]) },
  },
  esfBundles: oneKey(ESF_TWIN_KEY.bundles, (b) => ({ bundles: listOf(b) })),
  // Without the `ts` the connector added to the reply.
  esfFrameworkProperties: oneKey(ESF_TWIN_KEY.frameworkProps, (p) => {
    const props = { ...((p && typeof p === "object" ? p : {}) as Record<string, unknown>) };
    delete props["ts"];
    return props;
  }),
  esfKuraProperties: oneKey(ESF_TWIN_KEY.kuraProps, (p) => ({ kuraProperties: p ?? {} })),
};

/** The connector's `mapping`, from the polls: a JSON converter onto the gateway's own device, its values kept as JSON. */
export function esfTwinMapping(): Record<string, unknown>[] {
  return ESF_TWIN_POLLS.map((p) => ({
    url: p.url,
    httpMethod: "GET",
    httpHeaders: { Accept: "application/json" },
    allowRedirects: false,
    timeout: p.timeout,
    scanPeriod: p.scanPeriod,
    ...(p.unpack ? { dataUnpackExpression: p.unpack } : {}),
    reportStrategy: ON_CHANGE,
    converter: {
      type: "json",
      deviceNameJsonExpression: ESF_TWIN_DEVICE,
      deviceTypeJsonExpression: "default",
      attributes: p.attributes.map((a) => ({ type: "json", key: a.key, value: a.value })),
      telemetry: [],
    },
  }));
}
