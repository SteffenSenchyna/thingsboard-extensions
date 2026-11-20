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

// An ESF unit's configuration (Eurotech's Everyware Software Framework — Eclipse Kura). The ThingsBoard IoT Gateway runs on the
// unit itself (in Docker, host networking), so the unit is the gateway: its ESF connector (a Request connector,
// `integrations/esf/request-connector.json`) points at the unit's own REST API and makes no device of its own. The dashboard
// sends connector RPCs to the gateway's device (`request_<method>`): the gateway hands them to its Request connector, which
// makes the HTTP call the RPC's params describe — the URL, method, headers and timeouts taken from the connector's own
// `serverSideRpc` entry for that method, the body as `params.body` — and returns ESF's JSON. The shapes are ESF's own ("JSON
// definitions" of the Configuration v2 page): a component is its `pid`, its definition (`ocd` — the docs' examples name it
// `definition`) listing each setting (an attribute definition), and its `properties`, each `{ type, value }`. An update sends
// only the settings changed (`{ configs: [{ pid, properties }], takeSnapshot: true }`): ESF keeps the rest, and the snapshot it
// takes is a point the unit can roll back to.

import { parseObject } from "../../components/shared/value-utils";
import { ConnectorRow, ConnectorType, GatewayConnector, newConnector } from "./gateway-management.models";
import { ESF_WORDS, esfShortNote } from "./esf-notes.models";
import { ANSIBLE_LOGO_SVG, DOCKER_LOGO_SVG } from "./brand-logos";
import { esfTwinMapping } from "./esf-twin.models";

export { esfShortNote };

/** The ESF connector's RPC methods for the configuration API (its `serverSideRpc` methodFilters). */
export const ESF_RPC = {
  listComponents: "esfListComponents",
  getConfig: "esfGetConfig",
  updateConfig: "esfUpdateConfig",
  listSnapshots: "esfListSnapshots",
  takeSnapshot: "esfTakeSnapshot",
  rollbackSnapshot: "esfRollbackSnapshot",
} as const;

/** A configuration API the settings editor works on: its calls (Configuration v2, or Network Configuration v1 — the same shapes). */
export interface EsfConfigApi {
  listComponents: string;
  getConfig: string;
  updateConfig: string;
}

/** ESF's Configuration v2 API (`rest.configuration`). */
export const ESF_CONFIG_API: EsfConfigApi = {
  listComponents: ESF_RPC.listComponents,
  getConfig: ESF_RPC.getConfig,
  updateConfig: ESF_RPC.updateConfig,
};

/** ESF's Network Configuration v1 API (`rest.network.configuration`): the same shapes, its own components. */
export const ESF_NETWORK_CONFIG_API: EsfConfigApi = {
  listComponents: "esfNetListComponents",
  getConfig: "esfNetGetConfig",
  updateConfig: "esfNetUpdateConfig",
};

/** An ESF call the connector describes: its HTTP method and path (`${params.x}` a path parameter), whether it carries a body, its timeout (s). */
export interface EsfCall {
  name: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  body: boolean;
  timeout: number;
}

const call = (name: string, method: EsfCall["method"], path: string, body = false, timeout = 10): EsfCall => ({ name, method, path, body, timeout });

/**
 * Every ESF call the dashboard makes, by the REST permission it needs (ESF's REST API pages). The connector template's
 * `serverSideRpc` is made from it (`ESF_CONNECTOR_CONFIG`).
 */
export const ESF_CALLS: EsfCall[] = [
  // rest.configuration — Configuration v2
  call(ESF_RPC.listComponents, "GET", "services/configuration/v2/configurableComponents"),
  // each component's pid with its factory's (a container ESF itself runs is a ContainerInstance component of its name)
  call("esfComponentFactories", "GET", "services/configuration/v2/configurableComponents/pidsWithFactory"),
  // the factories, and an instance of one made or deleted (the Security view's SSL managers and keystores), a snapshot taken
  call("esfFactoryComponents", "GET", "services/configuration/v2/factoryComponents"),
  call("esfCreateFactoryComponent", "POST", "services/configuration/v2/factoryComponents", true, 20),
  call("esfDeleteFactoryComponents", "DELETE", "services/configuration/v2/factoryComponents/byPid", true, 20),
  call(ESF_RPC.getConfig, "POST", "services/configuration/v2/configurableComponents/configurations/byPid", true),
  call(ESF_RPC.updateConfig, "PUT", "services/configuration/v2/configurableComponents/configurations/_update", true, 20),
  call(ESF_RPC.listSnapshots, "GET", "services/configuration/v2/snapshots"),
  call(ESF_RPC.takeSnapshot, "POST", "services/configuration/v2/snapshots/_write", false, 20),
  // … and, from ESF 7.6.3, kura.admin
  call(ESF_RPC.rollbackSnapshot, "POST", "services/configuration/v2/snapshots/byId/_rollback", true, 40),
  // rest.network.configuration — Network Configuration v1
  call(ESF_NETWORK_CONFIG_API.listComponents, "GET", "services/networkConfiguration/v1/configurableComponents"),
  call(ESF_NETWORK_CONFIG_API.getConfig, "POST", "services/networkConfiguration/v1/configurableComponents/configurations/byPid", true),
  call(ESF_NETWORK_CONFIG_API.updateConfig, "PUT", "services/networkConfiguration/v1/configurableComponents/configurations/_update", true, 30),
  // rest.network.status — Network Status v1
  call("esfNetStatus", "GET", "services/networkStatus/v1/status", false, 15),
  // rest.cloudconnection — Cloud Connection v1
  call("esfCloudInstances", "GET", "services/cloudconnection/v1/instances"),
  call("esfCloudIsConnected", "POST", "services/cloudconnection/v1/cloudEndpoint/isConnected", true),
  call("esfCloudConnect", "POST", "services/cloudconnection/v1/cloudEndpoint/connect", true, 20),
  call("esfCloudDisconnect", "POST", "services/cloudconnection/v1/cloudEndpoint/disconnect", true, 20),
  call("esfCloudFactories", "GET", "services/cloudconnection/v1/factories"),
  call("esfCloudStackPids", "POST", "services/cloudconnection/v1/cloudEndpoint/stackComponentPids", true),
  call("esfCloudGetConfigs", "POST", "services/cloudconnection/v1/configurations", true),
  call("esfCloudUpdateConfigs", "PUT", "services/cloudconnection/v1/configurations", true, 20),
  call("esfCloudCreateEndpoint", "POST", "services/cloudconnection/v1/cloudEndpoint", true, 20),
  call("esfCloudCreatePubSub", "POST", "services/cloudconnection/v1/pubSub", true, 20),
  call("esfCloudDeleteEndpoint", "DELETE", "services/cloudconnection/v1/cloudEndpoint", true, 20),
  call("esfCloudDeletePubSub", "DELETE", "services/cloudconnection/v1/pubSub", true, 20),
  // rest.deploy — Deploy v2
  call("esfPackages", "GET", "services/deploy/v2/"),
  call("esfInstallPackage", "POST", "services/deploy/v2/_install", true, 20),
  call("esfUninstallPackage", "DELETE", "services/deploy/v2/${params.name}", false, 20),
  // rest.inventory — Inventory v1
  call("esfBundles", "GET", "services/inventory/v1/bundles"),
  call("esfStartBundle", "POST", "services/inventory/v1/bundles/_start", true),
  call("esfStopBundle", "POST", "services/inventory/v1/bundles/_stop", true),
  call("esfContainers", "GET", "services/inventory/v1/containers"),
  call("esfStartContainer", "POST", "services/inventory/v1/containers/_start", true, 20),
  call("esfStopContainer", "POST", "services/inventory/v1/containers/_stop", true, 20),
  call("esfImages", "GET", "services/inventory/v1/images"),
  call("esfDeleteImage", "POST", "services/inventory/v1/images/_delete", true, 20),
  call("esfSystemPackages", "GET", "services/inventory/v1/systemPackages", false, 15),
  // rest.keystores — Keystores v1: every keystore's certificates and keys (the Security view's Certificates)
  call("esfKeystoreEntries", "GET", "services/keystores/v1/entries"),
  // One keystore's: the Certificates' fallback when the whole read fails (one keystore ESF can't open — a PKCS11 module whose
  // library isn't there — fails it for all).
  call("esfKeystoreEntriesOf", "GET", "services/keystores/v1/entries?keystoreServicePid=${params.pid}"),
  // rest.system — System v1
  call("esfFrameworkProperties", "GET", "services/system/v1/properties/framework"),
  call("esfKuraProperties", "GET", "services/system/v1/properties/kura"),
  // rest.position — Position v1
  call("esfPosition", "GET", "services/position/v1/position"),
  call("esfPositionLocked", "GET", "services/position/v1/isLocked"),
  call("esfDateTime", "GET", "services/position/v1/dateTime"),
  // rest.tamper.detection — Tamper Detection v1
  call("esfTamperList", "GET", "services/tamper/v1/list"),
  call("esfTamperStatus", "GET", "services/tamper/v1/pid/${params.pid}"),
  call("esfTamperReset", "POST", "services/tamper/v1/pid/${params.pid}/_reset"),
  // rest.security — Security v2
  call("esfSecurityDebug", "GET", "services/security/v2/debug-enabled"),
  call("esfReloadPolicyFingerprint", "POST", "services/security/v2/security-policy-fingerprint/reload"),
  call("esfReloadCommandLineFingerprint", "POST", "services/security/v2/command-line-fingerprint/reload"),
  // rest.identity — Identity v2
  call("esfIdentities", "GET", "services/identity/v2/identities"),
  call("esfDefinedPermissions", "GET", "services/identity/v2/definedPermissions"),
  call("esfCreateIdentity", "POST", "services/identity/v2/identities", true),
  call("esfUpdateIdentity", "PUT", "services/identity/v2/identities", true),
  call("esfDeleteIdentity", "DELETE", "services/identity/v2/identities", true),
  // rest.command — Command v1
  call("esfCommand", "POST", "services/command/v1/command/", true, 30),
  // rest.assets — Assets
  call("esfAssets", "GET", "services/assets"),
  call("esfAssetChannels", "GET", "services/assets/${params.asset}"),
  call("esfReadAsset", "GET", "services/assets/${params.asset}/_read"),
  call("esfWriteAsset", "POST", "services/assets/${params.asset}/_write", true),
  // rest.wires.admin — WIRE-V1: the Wire graph edited — the kinds of Wire component (the palette: their factories, then their
  // definitions a few at a time — port counts, settings), the graph put whole (its topology and its new components), deleted
  call("esfWireFactories", "GET", "services/wire/v1/metadata/wireComponents/factoryPids"),
  call("esfWireDefinitions", "POST", "services/wire/v1/metadata/wireComponents/definitions/byFactoryPid", true, 20),
  call("esfWireUpdate", "PUT", "services/wire/v1/graph/snapshot", true, 40),
  call("esfWireDeleteGraph", "DELETE", "services/wire/v1/graph", false, 30),
];

/** A call's `serverSideRpc` entry (its `deviceNameFilter` unused: the dashboard sends connector RPCs). */
function rpcEntry(c: EsfCall): Record<string, unknown> {
  return {
    deviceNameFilter: ".*",
    methodFilter: c.name,
    requestUrlExpression: c.path,
    httpMethod: c.method,
    ...(c.body ? { requestValueExpression: "${params.body}" } : {}),
    httpHeaders: c.body ? { "Content-Type": "application/json", Accept: "application/json" } : { Accept: "application/json" },
    timeout: c.timeout,
    responseTimeout: c.timeout + 5,
  };
}

/** ESF's configuration API (the gateway page's ESF section links it as its documentation). */
export const ESF_CONFIG_HELP = "https://esf.eurotech.com/docs/configuration-v2-rest-apis-and-conf-v2-request-handler";

/** How long a call to the unit may take (ms): the gateway's own wait is up to 35 s (a command's). */
export const ESF_RPC_TIMEOUT_MS = 45000;

/** A configuration property's type (ESF's PropertyType). */
export type EsfPropertyType = "STRING" | "LONG" | "DOUBLE" | "FLOAT" | "INTEGER" | "BYTE" | "CHAR" | "BOOLEAN" | "SHORT" | "PASSWORD";

const PROPERTY_TYPES: EsfPropertyType[] = ["STRING", "LONG", "DOUBLE", "FLOAT", "INTEGER", "BYTE", "CHAR", "BOOLEAN", "SHORT", "PASSWORD"];
const INTEGER_TYPES: EsfPropertyType[] = ["LONG", "INTEGER", "SHORT", "BYTE"];
const DECIMAL_TYPES: EsfPropertyType[] = ["DOUBLE", "FLOAT"];

/** An allowed value of a multiple-choice setting. */
export interface EsfOption {
  label: string;
  value: string;
}

/** A setting's definition (ESF's AttributeDefinition). */
export interface EsfAttribute {
  id: string;
  type: EsfPropertyType;
  /** Its name, else its id. */
  name: string;
  /** Its description, without ESF's UI hints ("…|TextArea"). */
  description: string;
  /** Its description shortened for its info bubble (`esfShortNote`). */
  note: string;
  /** 0: one value; otherwise a list of at most this many (ESF gives a negative one for some lists — its size alone counts). */
  cardinality: number;
  min: string | null;
  max: string | null;
  required: boolean;
  defaultValue: string | null;
  options: EsfOption[];
  /** ESF's hint that the setting is long text ("|TextArea" after its description). */
  textArea: boolean;
}

/** A component's definition (ESF's ObjectClassDefinition). */
export interface EsfDefinition {
  id: string;
  name: string;
  description: string;
  /** Its description shortened for its info bubble (`esfShortNote`). */
  note: string;
  attributes: EsfAttribute[];
}

/** A property as ESF sends and takes it. */
export interface EsfProperty {
  type: EsfPropertyType;
  value?: unknown;
}

/** A component's configuration (ESF's ComponentConfiguration). */
export interface EsfComponentConfig {
  pid: string;
  definition: EsfDefinition | null;
  properties: Record<string, EsfProperty>;
}

/** How a setting is edited. */
export type EsfFieldKind = "boolean" | "select" | "integer" | "decimal" | "text" | "textarea" | "password" | "list";

/**
 * The ESF connector's configuration — `integrations/esf/request-connector.json`'s (keep the two the same), its name and log level
 * the connector's own. The unit is the loopback address (the gateway runs on it); the gateway's ESF user comes from its
 * container's REQUEST_BASIC_USERNAME / REQUEST_BASIC_PASSWORD (the `security` here the fallback). Its `mapping` is the unit's
 * twin (`esf-twin.models.ts`: polls into the gateway device's own client attributes). Its `serverSideRpc` entries describe the
 * ESF calls the dashboard makes (`esfRpc`) — their `deviceNameFilter` unused.
 */
export const ESF_CONNECTOR_CONFIG: Record<string, unknown> = {
  host: "https://127.0.0.1",
  SSLVerify: false,
  // The gateway's ESF user: tb_gateway (ESF identity names take no dashes). Its password comes from the gateway's
  // environment (REQUEST_BASIC_USERNAME / REQUEST_BASIC_PASSWORD, gateway 3.8.3+), which overrides these.
  security: { type: "basic", username: "tb_gateway", password: "CHANGE_ME" },
  // The unit's twin: its configuration, snapshots, cloud connections, inventory and properties polled into the gateway
  // device's client attributes, sent when they change (`esf-twin.models.ts`).
  mapping: esfTwinMapping(),
  attributeUpdates: [],
  serverSideRpc: ESF_CALLS.map(rpcEntry),
};


/** A new ESF connector, for the add-connector form to start from: "ESF", or the next free "ESF 2", "ESF 3", … */
export function esfConnectorPreset(gatewayVersion: string, existingNames: string[]): GatewayConnector {
  const taken = new Set(existingNames.map((n) => n.toLowerCase()));
  let name = "ESF";
  for (let i = 2; taken.has(name.toLowerCase()); i++) {
    name = `ESF ${i}`;
  }
  return { ...newConnector(name, ConnectorType.REQUEST, gatewayVersion, false), configurationJson: JSON.parse(JSON.stringify(ESF_CONNECTOR_CONFIG)) };
}

/** An ESF connector: a Request connector carrying the ESF calls (a `serverSideRpc` entry for `esfGetConfig`). */
export function isEsfConnector(row: ConnectorRow): boolean {
  if (row.connector.type !== "request") {
    return false;
  }
  const rpcs = row.connector.configurationJson?.["serverSideRpc"];
  return Array.isArray(rpcs) && rpcs.some((r) => r?.methodFilter === ESF_RPC.getConfig);
}

/** A gateway's ESF connector (the first; the gateway hands its connector RPCs to its first Request connector), else null. */
export function esfConnectorOf(connectors: ConnectorRow[]): ConnectorRow | null {
  return connectors.find(isEsfConnector) ?? null;
}

/** The keys of a `serverSideRpc` entry the RPC's params carry (the HTTP call the connector makes). */
const RPC_CALL_KEYS = ["requestUrlExpression", "httpMethod", "httpHeaders", "timeout", "responseTimeout"];

/**
 * An ESF call as a connector RPC to the gateway's device: `request_<method>`, its params the HTTP call — the connector's own
 * `serverSideRpc` entry for the method (else the template's) — with its body (sent as JSON through `params.body`) and any URL
 * parameters (`${params.asset}`).
 */
export function esfRpc(connector: ConnectorRow | null, method: string, body?: unknown, urlParams: Record<string, string> = {}): { method: string; params: Record<string, unknown> } {
  const own = connector?.connector.configurationJson?.["serverSideRpc"];
  const known = ESF_CALLS.find((c) => c.name === method);
  const entry: Record<string, unknown> =
    (Array.isArray(own) ? own.find((r) => r?.methodFilter === method) : null) ?? (known ? rpcEntry(known) : {});
  const params: Record<string, unknown> = { ...urlParams };
  for (const key of RPC_CALL_KEYS) {
    if (entry[key] !== undefined) {
      params[key] = entry[key];
    }
  }
  if (body !== undefined) {
    params["body"] = body;
    params["requestValueExpression"] = "${params.body}";
  } else {
    params["requestValueExpression"] = "";
  }
  return { method: `request_${method}`, params };
}

/**
 * A connector RPC's reply unwrapped. The gateway (3.8) answers `[{ success, result, status }]` — ESF's body as `result`, its
 * HTTP status as `status`, `success` true even when ESF refused the call — or `{ error }` when the call couldn't be made; older
 * ones hand back ESF's body as it is.
 */
export interface EsfReply {
  ok: boolean;
  /** ESF's HTTP status, when the gateway reports it. */
  status: number | null;
  body: unknown;
}

const isRecord = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);

export function esfUnwrap(reply: unknown): EsfReply {
  let r = reply;
  if (typeof r === "string") {
    try {
      r = JSON.parse(r);
    } catch {
      return { ok: true, status: null, body: r };
    }
  }
  if (Array.isArray(r) && r.length === 1 && isRecord(r[0]) && ("result" in r[0] || "error" in r[0] || "success" in r[0])) {
    r = r[0];
  }
  if (isRecord(r) && ("result" in r || "error" in r) && ("success" in r || "status" in r || "error" in r)) {
    // Its status: given — or, gateway 3.8.6's refusal (`{ "error": "Not Found (code: 404)" }`), read from its text.
    const coded = /\(code:\s*(\d{3})\)/.exec(typeof r["error"] === "string" ? r["error"] : "");
    const status = r["status"] !== undefined ? Number(r["status"]) : coded ? Number(coded[1]) : NaN;
    const known = Number.isFinite(status);
    const ok = r["success"] !== false && !r["error"] && (!known || status < 400);
    return { ok, status: known ? status : null, body: "result" in r ? r["result"] : r["error"] };
  }
  return { ok: true, status: null, body: r };
}

/** An ESF call ESF (or the gateway) refused: its reason in words, ESF's HTTP status if known. */
export class EsfCallError extends Error {
  constructor(
    message: string,
    readonly status: number | null
  ) {
    super(message);
  }
}

/** A refused call's reason: ESF's message with its status, and for a refused login or permission what to check. */
export function esfRefusal(reply: EsfReply): EsfCallError {
  const body = reply.body;
  const said = typeof body === "string" ? body : isRecord(body) ? String(body["message"] ?? body["error"] ?? "") : "";
  if (reply.status === 401) {
    return new EsfCallError(
      "ESF refused the gateway's login (401). Check the ESF connector's user and password, and that ESF's REST service has Basic Authentication enabled.",
      401
    );
  }
  if (reply.status === 403) {
    return new EsfCallError("ESF refused the call (403): the gateway's ESF user lacks the permission it needs.", 403);
  }
  const what = said || "The call failed";
  // Its status after it — unless it says it already ("Not Found (code: 404)").
  return new EsfCallError(reply.status && !/\(code:\s*\d{3}\)/.test(what) ? `${what} (${reply.status})` : what, reply.status);
}

/** An RPC reply as ESF sent it: the gateway hands back the HTTP response's JSON (an object, an array, or text), at times wrapped as `{ result }`. */
export function esfBody(reply: unknown): unknown {
  let body = reply;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return body;
    }
  }
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const keys = Object.keys(body);
    if (keys.length === 1 && keys[0] === "result") {
      return esfBody((body as Record<string, unknown>)["result"]);
    }
  }
  return body;
}

/** An RPC reply's body as an object ({} when it isn't one). */
export function esfObject(reply: unknown): Record<string, any> {
  const body = esfBody(reply);
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, any>) : {};
}

/** An RPC reply's list: the body itself when it's an array, else its `key` array ([] when neither). */
export function esfList(reply: unknown, key = ""): any[] {
  const body = esfBody(reply);
  if (Array.isArray(body)) {
    return body;
  }
  const list = key && body && typeof body === "object" ? (body as Record<string, unknown>)[key] : null;
  return Array.isArray(list) ? list : [];
}

const replyBody = esfObject;

/** The pids in an `esfListComponents` reply (ESF's PidSet), sorted by their short name. */
export function parseEsfPids(reply: unknown): string[] {
  const pids = replyBody(reply)["pids"];
  return Array.isArray(pids) ? pids.map(String).sort((a, b) => esfShortName(a).localeCompare(esfShortName(b))) : [];
}

/** The snapshot ids in an `esfListSnapshots` reply (ESF's SnapshotIdSet), newest first. */
export function parseEsfSnapshots(reply: unknown): number[] {
  const ids = replyBody(reply)["ids"];
  return Array.isArray(ids) ? ids.map(Number).filter((n) => Number.isFinite(n)).sort((a, b) => b - a) : [];
}

/** The configurations in an `esfGetConfig` reply (ESF's ComponentConfigurationList). */
export function parseEsfConfigs(reply: unknown): EsfComponentConfig[] {
  const configs = replyBody(reply)["configs"];
  if (!Array.isArray(configs)) {
    return [];
  }
  return configs
    .map((c): EsfComponentConfig | null => {
      const pid = String(c?.pid ?? "");
      if (!pid) {
        return null;
      }
      const def = c?.ocd ?? c?.definition;
      const properties: Record<string, EsfProperty> = {};
      for (const [key, p] of Object.entries(parseObject(c?.properties))) {
        const prop = parseObject(p);
        properties[key] = { type: propertyType(prop["type"]), value: prop["value"] };
      }
      return { pid, definition: def ? parseDefinition(def) : null, properties };
    })
    .filter((c): c is EsfComponentConfig => !!c);
}

function propertyType(value: unknown): EsfPropertyType {
  const t = String(value ?? "").toUpperCase() as EsfPropertyType;
  return PROPERTY_TYPES.includes(t) ? t : "STRING";
}

function optionalString(value: unknown): string | null {
  return value === undefined || value === null || value === "" ? null : String(value);
}

/**
 * An attribute's default as ESF makes a component with it — Kura's `StringUtil.splitValues` (`ComponentUtil.getDefaultValue`),
 * its first value: a backslash keeps the character after it whatever it is (`\,` a comma, `\\` a backslash — and `\n` an `n`), an
 * unescaped comma ends the value, unescaped whitespace at its ends dropped (line breaks too). A GraalVM™ filter's default script
 * comes `logger.info('…'\, input…)` — no JavaScript until it's read so.
 */
function metatypeDefault(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const chars: { c: string; kept: boolean }[] = [];
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === ",") {
      break; // one value: the first
    }
    if (c === "\\") {
      if (i + 1 < value.length) {
        chars.push({ c: value[++i], kept: true });
      }
      continue;
    }
    chars.push({ c, kept: false });
  }
  const loose = (x: { c: string; kept: boolean }) => !x.kept && /\s/.test(x.c);
  let from = 0;
  let to = chars.length;
  while (from < to && loose(chars[from])) {
    from++;
  }
  while (to > from && loose(chars[to - 1])) {
    to--;
  }
  const read = chars.slice(from, to).map((x) => x.c).join("");
  return read === "" ? null : read;
}

/** The longest note an info bubble shows (characters). */
/** ESF's UI hint after a description's last "|" ("…|TextArea"), "" none — a word alone, so a "|" in the text itself stays. */
function uiHintOf(description: string): string {
  const at = description.lastIndexOf("|");
  return at >= 0 && /^[A-Za-z]+$/.test(description.slice(at + 1).trim()) ? description.slice(at + 1).trim() : "";
}

/** A definition as ESF gives it (an `ocd`: its id, name, description and `ad` list) — a Wire kind's settings, made up from its definition. */
export function parseEsfDefinition(raw: unknown): EsfDefinition {
  return parseDefinition(raw);
}

function parseDefinition(raw: unknown): EsfDefinition {
  const d = parseObject(raw);
  const ad = Array.isArray(d["ad"]) ? d["ad"] : [];
  const description = String(d["description"] ?? "");
  // What a setting's note can take as said: its component's name (its card's title) and pid.
  const context = `${String(d["name"] ?? "")} ${String(d["id"] ?? "")}`;
  return {
    id: String(d["id"] ?? ""),
    name: String(d["name"] ?? d["id"] ?? ""),
    description,
    note: esfShortNote(description, String(d["name"] ?? ""), String(d["id"] ?? "")),
    // A setting listed twice (ESF's network definition lists an interface's `config.ip4.status` twice): once, its first.
    attributes: ad.map((a: any): EsfAttribute => {
      const rawDescription = String(a?.description ?? "");
      const hint = uiHintOf(rawDescription);
      const options = Array.isArray(a?.option) ? a.option : [];
      const description = (hint ? rawDescription.slice(0, rawDescription.lastIndexOf("|")) : rawDescription).trim();
      const name = String(a?.name || a?.id || "");
      return {
        id: String(a?.id ?? ""),
        type: propertyType(a?.type),
        name,
        description,
        note: esfShortNote(description, name, String(a?.id ?? ""), context),
        cardinality: Number(a?.cardinality ?? 0) || 0,
        min: optionalString(a?.min),
        max: optionalString(a?.max),
        required: a?.isRequired === true,
        // One value: ESF's escapes read as ESF makes the component (a list's stay — its commas part its values).
        defaultValue: (Number(a?.cardinality ?? 0) || 0) === 0 ? metatypeDefault(optionalString(a?.defaultValue)) : optionalString(a?.defaultValue),
        // An option listed twice, once (the Modbus driver's data order lists its four twice over: a select showed eight, two ticked).
        options: options
          .map((o: any) => ({ value: String(o?.value ?? ""), label: String(o?.label ?? o?.value ?? "") }))
          .filter((o: { value: string }, i: number, all: { value: string }[]) => all.findIndex((x) => x.value === o.value) === i),
        textArea: /^textarea$/i.test(hint),
      };
    }).filter((a: EsfAttribute, i: number, all: EsfAttribute[]) => all.findIndex((b) => b.id === a.id) === i),
  };
}

/** A pid's short name: its last dotted part ("org.eclipse.kura.clock.ClockService" → "ClockService"). */
export function esfShortName(pid: string): string {
  const parts = pid.split(".");
  return parts[parts.length - 1] || pid;
}

/**
 * A service's name in the Configuration view's list, as ESF's console names them: a component's class, its words apart
 * ("org.eclipse.kura.container.orchestration.provider.ContainerOrchestrationService" → "Container Orchestration Service"); an
 * instance named by hand ("OPC_Timer", "default.diagnostic.publisher") — its pid as it is.
 */
export function esfServiceName(pid: string): string {
  const last = esfShortName(pid);
  if (!/^[A-Z]/.test(last)) {
    return pid;
  }
  return last
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(" ")
    .map((w) => ESF_WORDS[w.toLowerCase()] ?? w)
    .join(" ");
}

/** A service's icon in the list, by what its pid names (ESF's console gives each service its own); a generic one else. */
const SERVICE_ICONS: [RegExp, string][] = [
  [/publisher/i, "upload"],
  [/subscriber/i, "download"],
  [/cloud|mqtt|datatransport|dataservice/i, "cloud"],
  [/artemis|broker/i, "hub"],
  [/container/i, "deployed_code"],
  [/log|journal/i, "receipt_long"],
  [/keystore|ssl|security|crypto|scep|ldevid|fail2ban|aide|tamper|certificate/i, "shield"],
  [/clock|ntp|time/i, "schedule"],
  [/position|gps/i, "location_on"],
  [/watchdog/i, "monitor_heart"],
  [/h2|db/i, "database"],
  [/deploy/i, "install_desktop"],
  [/command|shell|ansible/i, "terminal"],
  [/reboot/i, "restart_alt"],
  [/vpn/i, "vpn_lock"],
  [/serial|modbus|can\b/i, "cable"],
  [/rest|onboarding|http/i, "api"],
  [/diagnostic/i, "troubleshoot"],
  [/wire|opc|asset|driver/i, "account_tree"],
  [/user|identity|role/i, "person"],
  [/lora/i, "settings_input_antenna"],
];

export function esfServiceIcon(pid: string): string {
  return SERVICE_ICONS.find(([re]) => re.test(pid))?.[1] ?? "settings";
}

/**
 * A service's logo in the list in its icon's place, where the service is a known product's: Ansible's mark for ESF's Ansible
 * services, Docker's for its container services ("Container Orchestration Service") and each container it runs (a Container
 * Instance, named by hand, so told by its factory: `containerInstance`). None else (the icon stays).
 */
export function esfServiceLogo(pid: string, containerInstance = false): string | undefined {
  if (/ansible/i.test(pid)) {
    return ANSIBLE_LOGO_SVG;
  }
  if (containerInstance || /container/i.test(pid)) {
    return DOCKER_LOGO_SVG;
  }
  return undefined;
}

/**
 * A component's name on a button ("Network", "Firewall IPv4"): its pid's short name without "ConfigurationService" / "Service",
 * its words apart; the firewalls named by their IP version, as ESF's own pages are.
 */
export function esfComponentLabel(pid: string): string {
  const short = esfShortName(pid);
  const firewall = /^FirewallConfigurationService(IPv6)?$/.exec(short);
  if (firewall) {
    return firewall[1] ? "Firewall IPv6" : "Firewall IPv4";
  }
  const name = short.replace(/(Configuration)?Service$/, "") || short;
  return name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
}

/** How a setting is edited: a list (a cardinality) as comma-separated text, else by its options and type. */
export function esfFieldKind(a: EsfAttribute): EsfFieldKind {
  if (a.cardinality !== 0) {
    return "list";
  }
  if (a.options.length) {
    return "select";
  }
  if (a.type === "BOOLEAN") {
    return "boolean";
  }
  if (a.type === "PASSWORD") {
    return "password";
  }
  if (INTEGER_TYPES.includes(a.type)) {
    return "integer";
  }
  if (DECIMAL_TYPES.includes(a.type)) {
    return "decimal";
  }
  return a.textArea ? "textarea" : "text";
}

/** A setting's numeric bound, for a number field; null when it has none (or it isn't a number). */
export function esfBound(value: string | null): number | null {
  if (value === null) {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * A setting's value as its field holds it: a boolean, a number (null when unset), a list as "a, b, c", the rest as text. A
 * password is never shown (ESF sends a placeholder): its field starts empty, and stays out of the update unless typed in.
 */
export function esfFieldValue(a: EsfAttribute, prop: EsfProperty | undefined): boolean | number | string | null {
  const kind = esfFieldKind(a);
  const value = prop?.value;
  switch (kind) {
    case "password":
      return "";
    case "boolean":
      return value === true || value === "true";
    case "integer":
    case "decimal":
      return value === undefined || value === null || value === "" ? null : Number(value);
    case "list":
      return Array.isArray(value) ? value.map(String).join(", ") : value === undefined || value === null ? "" : String(value);
    default:
      return value === undefined || value === null ? "" : String(value);
  }
}

/** A list field's text as its values ("a, b" → ["a", "b"]); empty parts dropped. */
function listItems(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

/** A single value of a type from its text, or an error. */
function typedValue(type: EsfPropertyType, text: string): { value: unknown } | { error: string } {
  if (INTEGER_TYPES.includes(type)) {
    return /^-?\d+$/.test(text) ? { value: Number(text) } : { error: `"${text}" isn't a whole number.` };
  }
  if (DECIMAL_TYPES.includes(type)) {
    const n = Number(text);
    return Number.isFinite(n) ? { value: n } : { error: `"${text}" isn't a number.` };
  }
  if (type === "BOOLEAN") {
    return /^(true|false)$/i.test(text) ? { value: text.toLowerCase() === "true" } : { error: `"${text}" isn't true or false.` };
  }
  if (type === "CHAR" && text.length !== 1) {
    return { error: `"${text}" isn't one character.` };
  }
  return { value: text };
}

/**
 * What's wrong with a field's value, if anything: required and empty, out of its bounds, a list too long or holding a value of
 * the wrong type, a character that isn't one. Null when it's fine.
 */
export function esfFieldError(a: EsfAttribute, fieldValue: unknown): string | null {
  const kind = esfFieldKind(a);
  const min = esfBound(a.min);
  const max = esfBound(a.max);
  const inBounds = (n: number) =>
    min !== null && n < min ? `At least ${a.min}.` : max !== null && n > max ? `At most ${a.max}.` : null;
  if (kind === "boolean" || kind === "password") {
    return null;
  }
  if (kind === "integer" || kind === "decimal") {
    if (fieldValue === null || fieldValue === undefined || fieldValue === "") {
      return a.required ? "Required." : null;
    }
    const n = Number(fieldValue);
    if (!Number.isFinite(n) || (kind === "integer" && !Number.isInteger(n))) {
      return kind === "integer" ? "A whole number." : "A number.";
    }
    return inBounds(n);
  }
  const text = String(fieldValue ?? "");
  if (kind === "list") {
    const items = listItems(text);
    if (!items.length) {
      return a.required ? "Required." : null;
    }
    const size = Math.abs(a.cardinality);
    if (size && items.length > size) {
      return `At most ${size} values.`;
    }
    for (const item of items) {
      const v = typedValue(a.type, item);
      if ("error" in v) {
        return v.error;
      }
      if (typeof v.value === "number") {
        const bound = inBounds(v.value);
        if (bound) {
          return bound;
        }
      }
    }
    return null;
  }
  if (text === "") {
    return a.required && kind !== "select" ? "Required." : null;
  }
  if (a.type === "CHAR" && text.length !== 1) {
    return "One character.";
  }
  return null;
}

/** A field's value as ESF takes it (`{ type, value }`); an empty optional field sets null. */
export function esfPropertyOf(a: EsfAttribute, fieldValue: unknown): EsfProperty {
  const kind = esfFieldKind(a);
  if (kind === "boolean") {
    return { type: a.type, value: !!fieldValue };
  }
  if (kind === "integer" || kind === "decimal") {
    return { type: a.type, value: fieldValue === null || fieldValue === undefined || fieldValue === "" ? null : Number(fieldValue) };
  }
  if (kind === "list") {
    const items = listItems(String(fieldValue ?? "")).map((item) => {
      const v = typedValue(a.type, item);
      return "value" in v ? v.value : item;
    });
    return { type: a.type, value: items.length ? items : null };
  }
  if (kind === "select" && a.type !== "STRING" && a.type !== "PASSWORD" && a.type !== "CHAR") {
    const v = typedValue(a.type, String(fieldValue ?? ""));
    return { type: a.type, value: "value" in v ? v.value : null };
  }
  const text = String(fieldValue ?? "");
  return { type: a.type, value: text === "" ? null : text };
}

/** The update an `esfUpdateConfig` RPC carries: one component's changed settings, with a snapshot taken after. */
export function esfUpdateRequest(pid: string, properties: Record<string, EsfProperty>): Record<string, unknown> {
  return { configs: [{ pid, properties }], takeSnapshot: true };
}

/** An update of several components at once (one form of them — a Security tab's), one snapshot after. */
export function esfUpdateManyRequest(changes: { pid: string; properties: Record<string, EsfProperty> }[]): Record<string, unknown> {
  return { configs: changes.map((c) => ({ pid: c.pid, properties: c.properties })), takeSnapshot: true };
}
