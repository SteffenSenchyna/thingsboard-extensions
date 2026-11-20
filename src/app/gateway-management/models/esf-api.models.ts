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

// The ESF unit's other REST APIs (beyond its configuration — `esf.models.ts`), as the gateway page's ESF views read them: a
// client sending the calls (connector RPCs to the gateway, `esfRpc`), and a tolerant parser per reply, from the shapes on
// ESF's REST API pages (Network Status v1, Cloud Connection v1, Deploy v2, Inventory v1, System v1, Position v1, Tamper
// Detection v1, Security v2, Identity v2, Command v1, Assets). A field ESF leaves out reads as empty, never an error.

import { DestroyRef, TemplateRef } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { BehaviorSubject, catchError, defer, distinctUntilChanged, finalize, Observable, of, shareReplay, Subscription, map, switchMap } from "rxjs";
import { WidgetContext } from "@home/models/widget-component.models";
import { defaultHttpOptionsFromConfig } from "@core/public-api";
import { apiMessage, QUIET_REQUEST } from "../../components/shared/value-utils";
import { ESF_CALLS, esfBody, EsfCallError, esfList, esfObject, esfRefusal, esfRpc, ESF_RPC_TIMEOUT_MS, esfUnwrap } from "./esf.models";
import { ConnectorRow } from "./gateway-management.models";
import { EsfComponentFactory, parseEsfComponentFactories } from "./esf-security.models";
import { ESF_TWIN_READS, ESF_TWIN_SETTLE_MS, esfTwinEnabled } from "./esf-twin.models";

/** The calls that only read, though sent as a POST (a body naming what to read); every other POST, PUT or DELETE changes the unit. */
const POST_READS = new Set(["esfGetConfig", "esfNetGetConfig", "esfCloudGetConfigs", "esfCloudIsConnected", "esfCloudStackPids", "esfReadAsset", "esfWireDefinitions"]);

/**
 * Where this browser keeps a gateway's live window (`EsfClient.liveUntil`): a reload, or another tab, still reads from the unit until
 * the twin has caught up with a change just sent — else it showed the twin's older copy (a Wire graph applied, then the page reloaded).
 */
const liveKey = (gatewayId: string) => `tbEsfLiveUntil:${gatewayId}`;

function storedLiveUntil(gatewayId: string): number {
  try {
    const at = Number(localStorage.getItem(liveKey(gatewayId)));
    return Number.isFinite(at) && at > Date.now() ? at : 0;
  } catch {
    return 0;
  }
}

function storeLiveUntil(gatewayId: string, at: number): void {
  try {
    localStorage.setItem(liveKey(gatewayId), String(at));
  } catch {
    // No storage (a private window, blocked site data): the window lasts this page only.
  }
}

/** Whether a call changes the unit (its twin then lags behind it for a moment). */
function esfChanges(name: string): boolean {
  const known = ESF_CALLS.find((c) => c.name === name);
  return !!known && known.method !== "GET" && !POST_READS.has(name);
}

/** A twin attribute's value: JSON as ThingsBoard hands it back (an object, or its text). */
function twinValue(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * Sends ESF calls for one gateway: connector RPCs to its device, made by its ESF connector. It counts the calls waiting on the
 * unit, so the views' background reads go one view at a time, while it's otherwise quiet (`idle$`).
 *
 * When the gateway's ESF connector keeps the unit's twin (`esf-twin.models.ts`: the configuration, snapshots, cloud
 * connections, inventory and properties as the gateway's client attributes, kept up to date by the connector), the reads it
 * covers come from the twin — at once, and while the gateway is offline — in ESF's own reply shapes. A read the twin can't
 * answer yet (not reported) goes to the unit; so does every read for a couple of minutes after a change is sent, until the
 * twin's polls have caught up with it.
 */
export class EsfClient {
  /** The calls sent and not yet answered. */
  private waiting = 0;
  private readonly idleState = new BehaviorSubject(true);
  /** Whether no call is waiting on the unit (true to start). */
  readonly idle$: Observable<boolean> = this.idleState.pipe(distinctUntilChanged());
  /** Whether the gateway's ESF connector keeps the unit's twin (its polls in the connector's `mapping`). */
  readonly twin: boolean;
  /**
   * Reads go to the unit itself until then (ms): a change was just sent, and the twin catches up with it — kept in this browser for
   * the gateway (`storeLiveUntil`), so a reload in that time still reads from the unit.
   */
  private liveUntil: number;

  constructor(
    private readonly ctx: WidgetContext,
    readonly gatewayId: string,
    private readonly connector: ConnectorRow | null
  ) {
    this.twin = esfTwinEnabled(connector?.connector.configurationJson as Record<string, unknown> | undefined);
    this.liveUntil = storedLiveUntil(gatewayId);
  }

  /** A change sent: reads go to the unit for a while (`ESF_TWIN_SETTLE_MS`), kept for a reload too. */
  private goLive(): void {
    this.liveUntil = Date.now() + ESF_TWIN_SETTLE_MS;
    storeLiveUntil(this.gatewayId, this.liveUntil);
  }

  private factories$: Observable<EsfComponentFactory[]> | null = null;

  /**
   * The unit's components with their factories (`pidsWithFactory`), read once and shared — the settings forms' service picks
   * (`esf-targets.models.ts`). A refused read is none (the picks stay text), and is tried again next time.
   */
  componentFactories(): Observable<EsfComponentFactory[]> {
    if (!this.factories$) {
      const read$ = this.call("esfComponentFactories").pipe(
        map((reply) => parseEsfComponentFactories(reply)),
        catchError(() => {
          if (this.factories$ === read$) {
            this.factories$ = null;
          }
          return of([] as EsfComponentFactory[]);
        }),
        shareReplay({ bufferSize: 1, refCount: false })
      );
      this.factories$ = read$;
    }
    return this.factories$;
  }

  /** Forget the components read (the Security view reading them again — an instance made or deleted): the next form reads them anew. */
  forgetComponentFactories(): void {
    this.factories$ = null;
  }

  /**
   * A call by its name (`ESF_CALLS`), with its body and path parameters, if any: ESF's body, or an `EsfCallError` when it refused.
   * A read the twin covers comes from it (see the class's note).
   */
  call(name: string, body?: unknown, urlParams: Record<string, string> = {}): Observable<unknown> {
    const fromTwin = this.twin ? ESF_TWIN_READS[name] : undefined;
    const keys = fromTwin?.keys(body) ?? null;
    if (!fromTwin || !keys) {
      return this.callUnit(name, body, urlParams);
    }
    return defer(() => (Date.now() < this.liveUntil ? of(null) : this.readTwin(keys))).pipe(
      switchMap((values) => {
        const reply = values ? fromTwin.reply(values, body) : null;
        return reply !== null ? of(reply) : this.callUnit(name, body, urlParams);
      })
    );
  }

  /** The call as a connector RPC to the unit. A change sends reads to the unit for a moment after it (the twin catching up). */
  private callUnit(name: string, body: unknown, urlParams: Record<string, string>): Observable<unknown> {
    const rpc = esfRpc(this.connector, name, body, urlParams);
    const changes = this.twin && esfChanges(name);
    return defer(() => {
      this.waiting++;
      this.idleState.next(false);
      if (changes) {
        this.goLive();
      }
      return this.ctx.deviceService.sendTwoWayRpcCommand(this.gatewayId, { ...rpc, timeout: ESF_RPC_TIMEOUT_MS }, QUIET_REQUEST).pipe(
        map((reply: unknown) => {
          const unwrapped = esfUnwrap(reply);
          if (!unwrapped.ok) {
            throw esfRefusal(unwrapped);
          }
          return unwrapped.body;
        }),
        finalize(() => {
          this.waiting = Math.max(0, this.waiting - 1);
          this.idleState.next(this.waiting === 0);
          if (changes) {
            this.goLive();
          }
        })
      );
    });
  }

  /** The twin's attributes of these keys (the gateway's client attributes), by key; none (`null`) when ThingsBoard refuses the read. */
  private readTwin(keys: string[]): Observable<Record<string, unknown> | null> {
    const url = `/api/plugins/telemetry/DEVICE/${this.gatewayId}/values/attributes/CLIENT_SCOPE?keys=${encodeURIComponent(keys.join(","))}`;
    return this.ctx.http.get<{ key: string; value: unknown }[]>(url, defaultHttpOptionsFromConfig(QUIET_REQUEST)).pipe(
      map((attributes) => {
        const values: Record<string, unknown> = {};
        for (const a of attributes ?? []) {
          values[a.key] = twinValue(a.value);
        }
        return values;
      }),
      catchError(() => of(null))
    );
  }
}

/** Why an ESF call failed, in words: ESF's refusal, else ThingsBoard's reason (the gateway offline, the call timed out). */
export function esfReason(err: unknown): string {
  if (err instanceof EsfCallError) {
    return err.message;
  }
  const said = apiMessage(err).replace(/^: /, "").replace(/^\.$/, "");
  return said || "The call failed";
}

/** An ESF call subscribed for a view: its reply to `next`, its failure's reason to `error`. */
export function esfSubscribe(call: Observable<unknown>, destroyRef: DestroyRef, next: (reply: unknown) => void, error: (reason: string) => void): Subscription {
  return call.pipe(takeUntilDestroyed(destroyRef)).subscribe({ next, error: (err) => error(esfReason(err)) });
}

/** A confirmation an ESF view asks the dashboard for (its themed dialog), and what runs on "confirm". */
export interface EsfConfirm {
  heading: string;
  message: string;
  confirmLabel: string;
  danger: boolean;
  run: () => void;
  /** Cancelled (Cancel, Escape, a click off it): what the view undoes. */
  cancel?: () => void;
  /** A short form under the message (the Wire graph's new component: its name, a WireAsset's driver), the view's own template. */
  content?: TemplateRef<unknown>;
  /** It's a form: its field takes the focus, a phone's dialog at the screen's top (`tb-ext-confirm-dialog [form]`). */
  form?: boolean;
  /** The confirm button off while this says so (the form not filled in right). */
  confirmDisabled?: () => boolean;
  /** Set by the view when it has done the dialog's work itself (its form's Enter): the dialog closes. */
  closed?: boolean;
}

const text = (v: unknown): string => (v === undefined || v === null ? "" : String(v));

// ---- Network Status v1 ---------------------------------------------------------------------------------------------------

/** A network interface's status, the facts a row shows. */
export interface EsfInterface {
  id: string;
  name: string;
  type: string;
  state: string;
  mac: string;
  ip4: string;
  ip6: string;
  gateway: string;
  dns: string;
  mtu: string;
  virtual: boolean;
  /** Its status as ESF sent it (its driver, firmware, Wi-Fi scan and channels, modem facts — an interface panel's Hardware). */
  raw: Record<string, any>;
}

function addressesOf(status: unknown): { list: string; gateway: string; dns: string } {
  const s = (status && typeof status === "object" ? status : {}) as Record<string, any>;
  const list = (Array.isArray(s["addresses"]) ? s["addresses"] : []).map((a: any) => (a?.prefix !== undefined ? `${a?.address}/${a?.prefix}` : text(a?.address))).filter(Boolean);
  return { list: list.join(", "), gateway: text(s["gateway"]), dns: (Array.isArray(s["dnsServerAddresses"]) ? s["dnsServerAddresses"] : []).map(text).join(", ") };
}

/** `esfNetStatus`: the interfaces (InterfaceStatusList), loopback last; the failures, as "id: reason". */
export function parseEsfInterfaces(reply: unknown): { interfaces: EsfInterface[]; failures: string[] } {
  const interfaces = esfList(reply, "interfaces").map((i: any): EsfInterface => {
    const v4 = addressesOf(i?.interfaceIp4Addresses);
    const v6 = addressesOf(i?.interfaceIp6Addresses);
    return {
      id: text(i?.id),
      name: text(i?.interfaceName || i?.id),
      type: text(i?.type),
      state: text(i?.state),
      mac: text(i?.hardwareAddress),
      ip4: v4.list,
      ip6: v6.list,
      gateway: v4.gateway || v6.gateway,
      dns: [v4.dns, v6.dns].filter(Boolean).join(", "),
      mtu: text(i?.mtu),
      virtual: i?.virtual === true,
      raw: i && typeof i === "object" ? i : {},
    };
  });
  interfaces.sort((a, b) => Number(a.type === "LOOPBACK") - Number(b.type === "LOOPBACK") || a.name.localeCompare(b.name, undefined, { numeric: true }));
  const failures = esfList(reply, "failures").map((f: any) => `${text(f?.interfaceId ?? f?.id)}: ${text(f?.reason ?? f?.message)}`);
  return { interfaces, failures };
}

// ---- Cloud Connection v1 -------------------------------------------------------------------------------------------------

export interface EsfCloudEndpoint {
  pid: string;
  factoryPid: string;
  /** CLOUD_CONNECTION_MANAGER (it connects and disconnects) or CLOUD_ENDPOINT. */
  type: string;
  /** CONNECTED / DISCONNECTED ("" not reported). */
  state: string;
}

export interface EsfPubSub {
  pid: string;
  factoryPid: string;
  type: string;
  endpointPid: string;
}

/** `esfCloudInstances`: the cloud endpoints and their publishers / subscribers. */
export function parseEsfCloudInstances(reply: unknown): { endpoints: EsfCloudEndpoint[]; pubsub: EsfPubSub[] } {
  return {
    endpoints: esfList(reply, "cloudEndpointInstances").map((e: any) => ({
      pid: text(e?.cloudEndpointPid),
      factoryPid: text(e?.factoryPid ?? e?.cloudConnectionFactoryPid),
      type: text(e?.cloudEndpointType),
      state: text(e?.state),
    })),
    // ESF's docs spell it "pubsubInstances"; a unit spelling it "pubSubInstances" lists them too.
    pubsub: (esfList(reply, "pubsubInstances").length ? esfList(reply, "pubsubInstances") : esfList(reply, "pubSubInstances")).map((p: any) => ({
      pid: text(p?.pid),
      factoryPid: text(p?.factoryPid),
      type: text(p?.type),
      endpointPid: text(p?.cloudEndpointPid),
    })),
  };
}

/** `esfCloudIsConnected`: whether the endpoint is connected. */
export function parseEsfConnected(reply: unknown): boolean {
  return esfObject(reply)["connected"] === true;
}

// ---- Deploy v2 / Inventory v1 --------------------------------------------------------------------------------------------

export interface EsfPackage {
  name: string;
  version: string;
}

export interface EsfBundle {
  id: string;
  name: string;
  version: string;
  state: string;
  signed: boolean;
}

export interface EsfContainer {
  name: string;
  version: string;
  type: string;
  state: string;
}

export interface EsfSystemPackage {
  name: string;
  version: string;
  type: string;
}

const byName = <T extends { name: string }>(list: T[]): T[] => list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

/** `esfPackages`: the deployment packages installed ([{ name, version }]). */
export function parseEsfPackages(reply: unknown): EsfPackage[] {
  return byName(esfList(reply, "deploymentPackages").map((p: any) => ({ name: text(p?.name), version: text(p?.version) })));
}

/** `esfBundles`: the OSGi bundles, by name. */
export function parseEsfBundles(reply: unknown): EsfBundle[] {
  return byName(esfList(reply, "bundles").map((b: any) => ({ id: text(b?.id), name: text(b?.name), version: text(b?.version), state: text(b?.state), signed: b?.signed === true })));
}

/** `esfContainers`: the containers (their image as `version`). */
export function parseEsfContainers(reply: unknown): EsfContainer[] {
  return byName(esfList(reply, "containers").map((c: any) => ({ name: text(c?.name), version: text(c?.version), type: text(c?.type), state: text(c?.state) })));
}

/** ESF's factory of the components that run a container (Container Instance): one of these is a container the framework manages. */
export const ESF_CONTAINER_INSTANCE_FACTORY = "org.eclipse.kura.container.provider.ContainerInstance";

/**
 * `esfComponentFactories` (`pidsWithFactory`): the containers ESF itself runs — the pids of its Container Instance components, each
 * the name of the container it runs (ESF's console's "Framework Managed"). A container started outside ESF (the gateway's own,
 * from its compose file) has none.
 */
export function parseEsfManagedContainers(reply: unknown): Set<string> {
  return new Set(
    esfList(reply, "components")
      .filter((c: any) => text(c?.factoryPid) === ESF_CONTAINER_INSTANCE_FACTORY)
      .map((c: any) => text(c?.pid))
      .filter(Boolean)
  );
}

/** `esfImages`: the container images. */
export function parseEsfImages(reply: unknown): EsfPackage[] {
  return byName(esfList(reply, "images").map((i: any) => ({ name: text(i?.name), version: text(i?.version) })));
}

/** `esfSystemPackages`: the Linux packages (DEB / RPM / APK). */
export function parseEsfSystemPackages(reply: unknown): EsfSystemPackage[] {
  return byName(esfList(reply, "systemPackages").map((p: any) => ({ name: text(p?.name), version: text(p?.version), type: text(p?.type) })));
}

// ---- System v1 / Position v1 / Tamper Detection v1 / Security v2 ---------------------------------------------------------

/** A flat properties reply (System v1's) as label / value pairs, by key; nested values as JSON. */
export function parseEsfProperties(reply: unknown): { key: string; value: string }[] {
  // The framework's come as they are; ESF's in one object ({ "kuraProperties": { … } }): its properties, not the object.
  const body = esfObject(reply);
  const keys = Object.keys(body);
  const only = keys.length === 1 ? body[keys[0]] : null;
  const properties: Record<string, unknown> = only && typeof only === "object" && !Array.isArray(only) ? only : body;
  return Object.entries(properties)
    .map(([key, value]) => ({ key, value: value !== null && typeof value === "object" ? JSON.stringify(value) : text(value) }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export interface EsfPosition {
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  speed: number | null;
  track: number | null;
  gnss: string;
  /** ESF's message when it has no fix ("Position is not locked"). */
  message: string;
}

const num = (v: unknown): number | null => (v === undefined || v === null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/** `esfPosition`: the GNSS position, or ESF's message when it has none. */
export function parseEsfPosition(reply: unknown): EsfPosition {
  const p = esfObject(reply);
  return {
    latitude: num(p["latitude"]),
    longitude: num(p["longitude"]),
    altitude: num(p["altitude"]),
    speed: num(p["speed"]),
    track: num(p["track"]),
    gnss: Array.isArray(p["gnssType"]) ? p["gnssType"].map(text).join(", ") : text(p["gnssType"]),
    message: text(p["message"]),
  };
}

/** `esfPositionLocked`: whether the GNSS has a fix (ESF names it `islocked`). */
export function parseEsfLocked(reply: unknown): boolean {
  const o = esfObject(reply);
  return (o["islocked"] ?? o["isLocked"] ?? o["locked"]) === true;
}

/** `esfDateTime`: the GNSS date and time (ISO 8601, UTC), "" when it has none. */
export function parseEsfDateTime(reply: unknown): string {
  return text(esfObject(reply)["dateTime"]);
}

export interface EsfTamperService {
  pid: string;
  name: string;
}

/** `esfTamperList`: the tamper detection services. */
export function parseEsfTamperList(reply: unknown): EsfTamperService[] {
  return esfList(reply, "").map((t: any) => ({ pid: text(t?.pid), name: text(t?.displayName || t?.pid) }));
}

/** `esfTamperStatus`: whether the service finds the device tampered, and when (its `timestamp` property, ms). */
export function parseEsfTamperStatus(reply: unknown): { tampered: boolean; timestamp: number | null } {
  const o = esfObject(reply);
  return { tampered: o["isDeviceTampered"] === true, timestamp: num(parseObjectValue(o["properties"])["timestamp"]) };
}

function parseObjectValue(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** `esfSecurityDebug`: whether the unit runs in debug mode. */
export function parseEsfDebugEnabled(reply: unknown): boolean {
  return esfObject(reply)["enabled"] === true;
}

// ---- Identity v2 ---------------------------------------------------------------------------------------------------------

export interface EsfIdentity {
  name: string;
  permissions: string[];
  passwordAuthEnabled: boolean;
  passwordChangeNeeded: boolean;
}

/** `esfIdentities`: the users, by name, each with its permissions. */
export function parseEsfIdentities(reply: unknown): EsfIdentity[] {
  return byName(
    esfList(reply, "identities").map((i: any) => ({
      name: text(i?.identity?.name ?? i?.name),
      permissions: (Array.isArray(i?.permissionConfiguration?.permissions) ? i.permissionConfiguration.permissions : [])
        .map((p: any) => text(p?.name ?? p))
        .filter(Boolean)
        .sort(),
      passwordAuthEnabled: i?.passwordConfiguration?.passwordAuthEnabled === true,
      passwordChangeNeeded: i?.passwordConfiguration?.passwordChangeNeeded === true,
    }))
  );
}

/** `esfDefinedPermissions`: every permission the unit defines, sorted. */
export function parseEsfPermissions(reply: unknown): string[] {
  return esfList(reply, "permissions")
    .map((p: any) => text(p?.name ?? p))
    .filter(Boolean)
    .sort();
}

/** An identity's update (`esfUpdateIdentity`): its permissions, and its password settings (a new password only when given). */
export function esfIdentityUpdate(name: string, permissions: string[], passwordAuthEnabled: boolean, passwordChangeNeeded: boolean, password: string): Record<string, unknown> {
  return {
    identity: { name },
    permissionConfiguration: { permissions: permissions.map((p) => ({ name: p })) },
    passwordConfiguration: { passwordAuthEnabled, passwordChangeNeeded, ...(password ? { password } : {}) },
  };
}

// ---- Command v1 ----------------------------------------------------------------------------------------------------------

export interface EsfCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}

/** `esfCommand`: what the command printed, its exit code, whether it timed out. */
export function parseEsfCommandResult(reply: unknown): EsfCommandResult {
  const o = esfObject(reply);
  return { stdout: text(o["stdout"]), stderr: text(o["stderr"]), exitCode: num(o["exitCode"]), timedOut: o["isTimeOut"] === true };
}

// ---- Assets --------------------------------------------------------------------------------------------------------------

/** `esfAssets`: the asset pids (a list of names, or of `{ pid }`). */
export function parseEsfAssets(reply: unknown): string[] {
  return esfList(reply, "assets")
    .map((a: any) => (typeof a === "string" ? a : text(a?.pid ?? a?.name)))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export interface EsfChannel {
  name: string;
  /** READ, WRITE or READ_WRITE. */
  mode: string;
  valueType: string;
}

/** `esfAssetChannels`: an asset's channels (their name, mode and value type). */
export function parseEsfChannels(reply: unknown): EsfChannel[] {
  const body = esfBody(reply);
  const list = Array.isArray(body) ? body : esfList(reply, "channels");
  return byName(list.map((c: any) => ({ name: text(c?.name), mode: text(c?.type ?? c?.mode), valueType: text(c?.valueType) })));
}

export interface EsfChannelRecord {
  name: string;
  value: string;
  valueType: string;
  timestamp: number | null;
  error: string;
}

/** `esfReadAsset`: each channel's value as read (or why it couldn't be). */
export function parseEsfChannelRecords(reply: unknown): EsfChannelRecord[] {
  const body = esfBody(reply);
  const list = Array.isArray(body) ? body : esfList(reply, "records").length ? esfList(reply, "records") : esfList(reply, "channels");
  return byName(
    list.map((r: any) => ({
      name: text(r?.name ?? r?.channel ?? r?.channelName),
      value: r?.value === undefined || r?.value === null ? "" : typeof r.value === "object" ? JSON.stringify(r.value) : String(r.value),
      valueType: text(r?.valueType ?? r?.type),
      timestamp: num(r?.timestamp),
      error: text(r?.error ?? r?.errorMessage),
    }))
  );
}

/** A channel write's value of its type ("12" → 12 for a number, "true" → true for a boolean); null when it doesn't parse. */
export function esfChannelValue(valueType: string, raw: string): unknown {
  const t = valueType.toUpperCase();
  const s = raw.trim();
  if (t === "BOOLEAN") {
    return /^(true|false)$/i.test(s) ? s.toLowerCase() === "true" : null;
  }
  if (["INTEGER", "LONG", "SHORT", "BYTE"].includes(t)) {
    return /^-?\d+$/.test(s) ? Number(s) : null;
  }
  if (["FLOAT", "DOUBLE"].includes(t)) {
    return s !== "" && Number.isFinite(Number(s)) ? Number(s) : null;
  }
  return raw;
}
