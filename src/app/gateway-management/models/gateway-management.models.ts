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

import type { Application, ApplicationDraft } from "../../components/shared/applications/applications.models";
import { SegmentOption } from "../../components/shared/segmented-control/segmented-control.component";
import { StatusPillTone } from "../../components/shared/status-pill/status-pill.component";
import { parseNumber, parseObject } from "../../components/shared/value-utils";
import { deepEqual } from "./gateway-utils";
import { CONNECTOR_DEFAULT_CONFIGS } from "./connector-default-configs";

// ---------------------------------------------------------------------------
// Settings — where the dashboard reads / writes each value on the gateway
// devices: the attribute and time-series keys the ThingsBoard IoT Gateway
// (thingsboard-gateway) itself uses, as ThingsBoard's own "Gateways" dashboard
// and the gateway-management-extensions widgets read them. Every key can be
// overridden from the widget's settings (ctx.settings).
// ---------------------------------------------------------------------------

export interface GatewayDashboardSettings {
  /**
   * What marks a device as a gateway: ThingsBoard sets `additionalInfo.gateway
   * = true` on a gateway device, so the gateways are the devices whose
   * additionalInfo contains this text (an entity-field CONTAINS filter).
   */
  gatewayMarker: string;
  /** Device profile a gateway added from the dashboard is created with. */
  newGatewayDeviceType: string;
  /** SHARED attribute: JSON array of the names of the enabled connectors (each one's config is a SHARED attribute of that name). */
  activeConnectorsKey: string;
  /** SERVER attribute: JSON array of the names of the disabled connectors (each one's config is a SERVER attribute of that name). */
  inactiveConnectorsKey: string;
  /** CLIENT attribute: the gateway's version ("3.7.3"). */
  versionKey: string;
  /** TIME SERIES: the gateway's total error count (each connector also reports `<name>_ERRORS_COUNT`). */
  errorsCountKey: string;
  /** SHARED attributes (written by the dashboard, reported back by the gateway as CLIENT attributes). */
  generalConfigurationKey: string;
  grpcConfigurationKey: string;
  logsConfigurationKey: string;
  storageConfigurationKey: string;
  remoteLoggingLevelKey: string;
  modeKey: string;
  /** TIME SERIES: JSON of the gateway's storage / platform message counters and machine resources. */
  serviceStatsKey: string;
  machineStatsKey: string;
  /** Attribute (any scope — the gateway publishes it as the device's own) of a device a gateway connected: its connector type ("mqtt", "modbus", …). */
  deviceConnectorTypeKey: string;
  /** Attribute (any scope, as the type's) of a device a gateway connected: the name of the connector it came through. */
  deviceConnectorNameKey: string;
  /** `additionalInfo` property of a device: the id of the gateway it last connected through (set by ThingsBoard). */
  lastConnectedGatewayKey: string;
  /** SERVER attribute of the tenant: the device templates (a JSON array, see {@link DeviceTemplate}). */
  deviceTemplatesKey: string;
  /** The asset profile (type) of the applications: each one is an asset of it (see {@link GatewayApplication}). */
  applicationAssetType: string;
  /** The relation from an application to a gateway it's applied to (Contains by default: the asset's profile tells it from a site's). */
  applicationGatewayRelation: string;
  /** The relation from an application to each site it's assigned to (its panel's Sites tab; Contains by default — to an asset, not a device). */
  applicationSiteRelation: string;
  /** The Settings page's Access (shared): the customer whose users its groups hold — and who owns the hierarchy ("WCAN"). */
  accessOwnerTitle: string;
  /** The asset profiles (types) of the product lines, markets and sites the Settings page's Organization lists. */
  productLineAssetType: string;
  marketAssetType: string;
  siteAssetType: string;
  /** The relation from a market to a site it contains, and from a product line to a site it covers (both Contains: the asset's profile tells them apart). */
  marketSiteRelation: string;
  productLineSiteRelation: string;
  /** The relation from a site to a gateway it contains (Contains by default): the gateway's site, in its Settings and the table's filters. */
  siteGatewayRelation: string;
  /**
   * SERVER attributes of a gateway: its site's name, and that site's market's
   * and product line's — a copy of the relations above that the backend keeps
   * on the gateway. Read with the gateway itself, they fill the table's Site,
   * Market and Product line at once; the relations, slower to look up, have
   * the last word once they're loaded.
   */
  siteAttributeKey: string;
  marketAttributeKey: string;
  productLineAttributeKey: string;
}

export const gatewayDashboardDefaultSettings: GatewayDashboardSettings = {
  gatewayMarker: '"gateway":true',
  newGatewayDeviceType: "default",
  activeConnectorsKey: "active_connectors",
  inactiveConnectorsKey: "inactive_connectors",
  versionKey: "Version",
  errorsCountKey: "ALL_ERRORS_COUNT",
  generalConfigurationKey: "general_configuration",
  grpcConfigurationKey: "grpc_configuration",
  logsConfigurationKey: "logs_configuration",
  storageConfigurationKey: "storage_configuration",
  remoteLoggingLevelKey: "RemoteLoggingLevel",
  modeKey: "mode",
  serviceStatsKey: "serviceStats",
  machineStatsKey: "machineStats",
  deviceConnectorTypeKey: "connectorType",
  deviceConnectorNameKey: "connectorName",
  lastConnectedGatewayKey: "lastConnectedGateway",
  deviceTemplatesKey: "deviceTemplates",
  applicationAssetType: "Application",
  applicationGatewayRelation: "Contains",
  applicationSiteRelation: "Contains",
  accessOwnerTitle: "WCAN",
  productLineAssetType: "ProductLine",
  marketAssetType: "Market",
  siteAssetType: "Site",
  marketSiteRelation: "Contains",
  productLineSiteRelation: "Contains",
  siteGatewayRelation: "Contains",
  siteAttributeKey: "site",
  marketAttributeKey: "market",
  productLineAttributeKey: "productLine",
};

// ---------------------------------------------------------------------------
// Gateways
// ---------------------------------------------------------------------------

export type GatewayStatus = "active" | "inactive";

export const GATEWAY_STATUS_META: Record<GatewayStatus, { label: string; icon: string; tone: StatusPillTone }> = {
  active: { label: "Online", icon: "wifi", tone: "success" },
  inactive: { label: "Offline", icon: "wifi_off", tone: "neutral" },
};

/** The Status filter's options. */
export const GATEWAY_STATUS_OPTIONS: { id: GatewayStatus; label: string }[] = [
  { id: "active", label: "Online" },
  { id: "inactive", label: "Offline" },
];

/**
 * A gateway is active while ThingsBoard reports it so and its last
 * connection isn't older than its last disconnection (the gateway widgets'
 * own rule — `active` alone lags behind a dropped session).
 */
export function gatewayStatus(active: unknown, lastConnectTime: unknown, lastDisconnectTime: unknown): GatewayStatus {
  if (String(active ?? "") !== "true") {
    return "inactive";
  }
  const connected = Number(lastConnectTime) || 0;
  const disconnected = Number(lastDisconnectTime) || 0;
  return !disconnected || connected > disconnected ? "active" : "inactive";
}

export interface GatewayRow {
  id: string;
  /** Display name: the label, else the device name. */
  name: string;
  deviceName: string;
  deviceLabel: string;
  /** Device profile. */
  type: string;
  description: string;
  owner: string;
  /** When the device was created in ThingsBoard. */
  createdTime: number | null;
  status: GatewayStatus;
  lastConnectTime: number | null;
  lastDisconnectTime: number | null;
  version: string;
  activeConnectors: string[];
  inactiveConnectors: string[];
  /** The gateway's total error count (null before it reports one). */
  errors: number | null;
  /** Its `general_configuration` as it reports it (null before it does). */
  generalConfiguration: GatewayGeneralConfig | null;
  remoteLoggingLevel: GatewayLogLevel;
  /** The ids of the applications applied to it — those with a relation to it (see {@link GatewayApplication}). */
  applications: string[];
  /** The id of the site that contains it (the site → gateway relation), null for none; its market and product line follow from the site. */
  siteId: string | null;
  /** Its site's, market's and product line's names as its own attributes hold them (the backend's copy of the relations; "" for none). */
  siteRef: string;
  marketRef: string;
  productLineRef: string;
}

/**
 * An application — a plant, a product line, a project — applied to gateways
 * in their Settings; the Gateways page filters by it. Each is an asset of the
 * applications' profile (`applicationAssetType`: its name, label, and its
 * description in the asset's), applied to a gateway by a relation from it
 * (`applicationGatewayRelation`). It shows by its label: the asset's name is
 * unique among all the tenant's assets, so an application can share its label
 * with a site or a market.
 */
export type GatewayApplication = Application;

/** What the application form saves: the store makes it an asset (or saves the edited one). */
export type GatewayApplicationDraft = ApplicationDraft;

/** An application as it shows (the gateways' column, the filter, the pickers): its label, else its name — shared. */
export { applicationName } from "../../components/shared/applications/applications.models";

/** The Organization's lists (product lines, markets, sites): shared by the dashboards (components/shared/organization). */
export { ASSET_KINDS } from "../../components/shared/organization/organization.models";
export type { AssetKind, AssetList, AssetRow } from "../../components/shared/organization/organization.models";

/** A device a gateway created / that last connected through it. */
export interface GatewayDeviceRow {
  id: string;
  name: string;
  deviceName: string;
  deviceLabel: string;
  type: string;
  gatewayId: string;
  gatewayName: string;
  connectorType: string;
  /** The connector it came through, by name ("" before the gateway reports it). */
  connectorName: string;
  active: boolean;
}

/** The id of the gateway a device last connected through, from its `additionalInfo`. */
export function lastConnectedGatewayId(additionalInfo: unknown, key: string): string {
  const info = parseObject(additionalInfo);
  const id = info[key];
  return typeof id === "string" ? id : "";
}

// ---------------------------------------------------------------------------
// Versions and connector types
// ---------------------------------------------------------------------------

export enum GatewayVersion {
  v3_8_5 = "3.8.5",
  v3_7_3 = "3.7.3",
  v3_7_2 = "3.7.2",
  v3_7_0 = "3.7",
  v3_6_3 = "3.6.3",
  v3_6_2 = "3.6.2",
  v3_6_0 = "3.6",
  v3_5_2 = "3.5.2",
  Legacy = "legacy",
}

export enum ConnectorType {
  MQTT = "mqtt",
  MODBUS = "modbus",
  GRPC = "grpc",
  OPCUA = "opcua",
  BLE = "ble",
  REQUEST = "request",
  CAN = "can",
  BACNET = "bacnet",
  ODBC = "odbc",
  REST = "rest",
  SNMP = "snmp",
  FTP = "ftp",
  SOCKET = "socket",
  XMPP = "xmpp",
  OCPP = "ocpp",
  CUSTOM = "custom",
  KNX = "knx",
  S7 = "s7",
}

export const CONNECTOR_TYPE_LABELS: Record<ConnectorType, string> = {
  [ConnectorType.MQTT]: "MQTT",
  [ConnectorType.MODBUS]: "Modbus",
  [ConnectorType.GRPC]: "gRPC",
  [ConnectorType.OPCUA]: "OPC-UA",
  [ConnectorType.BLE]: "BLE",
  [ConnectorType.REQUEST]: "Request",
  [ConnectorType.CAN]: "CAN",
  [ConnectorType.BACNET]: "BACnet",
  [ConnectorType.ODBC]: "ODBC",
  [ConnectorType.REST]: "REST",
  [ConnectorType.SNMP]: "SNMP",
  [ConnectorType.FTP]: "FTP",
  [ConnectorType.SOCKET]: "Socket",
  [ConnectorType.XMPP]: "XMPP",
  [ConnectorType.OCPP]: "OCPP",
  [ConnectorType.CUSTOM]: "Custom",
  [ConnectorType.KNX]: "KNX",
  [ConnectorType.S7]: "S7",
};

export function connectorTypeLabel(type: string): string {
  return CONNECTOR_TYPE_LABELS[type as ConnectorType] ?? (type ? type.toUpperCase() : "—");
}

const HELP_BASE = "https://thingsboard.io/docs/iot-gateway/config";

/** The documentation page of each connector's configuration. */
export const CONNECTOR_HELP_LINKS: Partial<Record<ConnectorType, string>> = {
  [ConnectorType.MQTT]: `${HELP_BASE}/mqtt/`,
  [ConnectorType.MODBUS]: `${HELP_BASE}/modbus/`,
  [ConnectorType.OPCUA]: `${HELP_BASE}/opc-ua/`,
  [ConnectorType.BLE]: `${HELP_BASE}/ble/`,
  [ConnectorType.REQUEST]: `${HELP_BASE}/request/`,
  [ConnectorType.CAN]: `${HELP_BASE}/can/`,
  [ConnectorType.BACNET]: `${HELP_BASE}/bacnet/`,
  [ConnectorType.ODBC]: `${HELP_BASE}/odbc/`,
  [ConnectorType.REST]: `${HELP_BASE}/rest/`,
  [ConnectorType.SNMP]: `${HELP_BASE}/snmp/`,
  [ConnectorType.FTP]: `${HELP_BASE}/ftp/`,
  [ConnectorType.SOCKET]: `${HELP_BASE}/socket/`,
  [ConnectorType.XMPP]: `${HELP_BASE}/xmpp/`,
  [ConnectorType.OCPP]: `${HELP_BASE}/ocpp/`,
  [ConnectorType.KNX]: `${HELP_BASE}/knx/`,
  [ConnectorType.S7]: `${HELP_BASE}/s7/`,
};

export const GATEWAY_INSTALL_HELP = "https://thingsboard.io/docs/iot-gateway/install/docker-installation/";
export const GATEWAY_CONFIG_HELP = "https://thingsboard.io/docs/iot-gateway/configuration/";

/**
 * "3.7.3" → 3.73: the gateway widgets' version number — major.minor + the
 * first digit of the patch — so versions compare as numbers.
 */
export function parseVersion(version: string | number | null | undefined): number {
  if (typeof version === "number") {
    return version;
  }
  if (typeof version === "string" && version.trim()) {
    const [major, minor = "0", patch = "0"] = version.trim().split(".");
    const n = parseFloat(`${major}.${minor}${patch.slice(0, 1)}`);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** A version's part of a set of gateways (the Gateways page's versions doughnut). */
export interface VersionShare {
  /** The version ("3.7.4"), "Unknown" for gateways that never reported one, or "Other". */
  name: string;
  count: number;
  /** Its colour: a chart palette token, or the neutral one for "Other". */
  color: string;
}

/** How the gateways that never reported a version are named. */
const UNKNOWN_VERSION = "Unknown";
/** The chart palette's colours (`--c-chart-1` … `--c-chart-5`). */
const CHART_PALETTE_SIZE = 5;

/** A gateway's version as the dashboard names it (the versions card, the Version filter): its own, else "Unknown". */
export function gatewayVersionName(version: string | null | undefined): string {
  return (version ?? "").trim() || UNKNOWN_VERSION;
}

/** The gateways' versions by name, newest first, "Unknown" last (the versions card's order, the Version filter's). */
export function gatewayVersionsNewestFirst(gateways: { version: string }[]): string[] {
  return [...new Set(gateways.map((g) => gatewayVersionName(g.version)))].sort((a, b) =>
    a === UNKNOWN_VERSION ? 1 : b === UNKNOWN_VERSION ? -1 : b.localeCompare(a, undefined, { numeric: true })
  );
}

/**
 * The gateways shown, by version — the parts of the versions doughnut, newest
 * version first. A version's colour is its place among the whole fleet's
 * versions (newest first, the palette in order), so it keeps that colour
 * whatever the filters leave in view. At most `maxParts` parts: past that the
 * newest versions stay and the older ones ("Unknown" last) — and any past the
 * palette — fold into a neutral "Other", last (a single version left over
 * keeps its name). By version, never by how many gateways run it.
 */
export function gatewayVersionShares(shown: { version: string }[], fleet: { version: string }[], maxParts = 4): VersionShare[] {
  const nameOf = (g: { version: string }) => gatewayVersionName(g.version);
  const order = gatewayVersionsNewestFirst(fleet);
  const counts = new Map<string, number>();
  for (const g of shown) {
    counts.set(nameOf(g), (counts.get(nameOf(g)) ?? 0) + 1);
  }
  const count = (version: string) => counts.get(version) ?? 0;
  // The versions shown that have a palette colour, in the fleet's order.
  let named = order.filter((v, i) => i < CHART_PALETTE_SIZE && counts.has(v));
  const tail = [...counts.keys()].some((v) => !named.includes(v));
  if (named.length + (tail ? 1 : 0) > maxParts) {
    // Too many for the card: the newest stay, the older ones join "Other".
    named = named.slice(0, maxParts - 1);
  }
  const parts: VersionShare[] = named.map((v) => ({ name: v, count: count(v), color: `var(--c-chart-${order.indexOf(v) + 1})` }));
  // The rest as one neutral part: "Other" — or, a single version left over, under its own name.
  const rest = [...counts.keys()].filter((v) => !named.includes(v));
  if (rest.length) {
    parts.push({ name: rest.length === 1 ? rest[0] : "Other", count: rest.reduce((sum, v) => sum + count(v), 0), color: "var(--c-icon-neutral-light)" });
  }
  return parts;
}

/** The gateway version each connector's current configuration format arrived in. */
export const CONNECTOR_CONFIG_VERSION: Partial<Record<ConnectorType, GatewayVersion>> = {
  [ConnectorType.S7]: GatewayVersion.v3_8_5,
  [ConnectorType.REST]: GatewayVersion.v3_7_2,
  [ConnectorType.KNX]: GatewayVersion.v3_7_0,
  [ConnectorType.BACNET]: GatewayVersion.v3_6_2,
  [ConnectorType.SOCKET]: GatewayVersion.v3_6_0,
  [ConnectorType.MQTT]: GatewayVersion.v3_5_2,
  [ConnectorType.OPCUA]: GatewayVersion.v3_5_2,
  [ConnectorType.MODBUS]: GatewayVersion.v3_5_2,
};

/** The connector types a gateway of this version supports. */
export function connectorTypesForVersion(gatewayVersion: string): ConnectorType[] {
  const v = parseVersion(gatewayVersion);
  const all = Object.values(ConnectorType);
  if (v >= parseVersion(GatewayVersion.v3_8_5)) {
    return all;
  }
  if (v >= parseVersion(GatewayVersion.v3_7_0)) {
    return all.filter((t) => t !== ConnectorType.S7);
  }
  return all.filter((t) => t !== ConnectorType.KNX && t !== ConnectorType.S7);
}

/** Whether a connector of this config version carries a report strategy (3.6+, Modbus 3.5.2+). */
export function withReportStrategy(configVersion: string | number | null | undefined, type?: string): boolean {
  const v = parseVersion(configVersion);
  if (type === ConnectorType.MODBUS) {
    return v >= parseVersion(GatewayVersion.v3_5_2);
  }
  return v >= parseVersion(GatewayVersion.v3_6_0);
}

/**
 * The default configuration of a connector type for a gateway version — the
 * versioned entry ("3.6.2", "legacy", …) when the type has them, else its one
 * configuration. Returns a fresh copy.
 */
export function defaultConnectorConfig(type: ConnectorType, gatewayVersion: string): Record<string, unknown> {
  const config = CONNECTOR_DEFAULT_CONFIGS[type];
  if (!config) {
    return {};
  }
  const latest = CONNECTOR_CONFIG_VERSION[type];
  const versioned = latest && parseVersion(gatewayVersion) >= parseVersion(latest) ? config[latest] : config[GatewayVersion.Legacy];
  return JSON.parse(JSON.stringify(versioned ?? config));
}

// ---------------------------------------------------------------------------
// Connectors
// ---------------------------------------------------------------------------

export enum GatewayLogLevel {
  NONE = "NONE",
  CRITICAL = "CRITICAL",
  ERROR = "ERROR",
  WARNING = "WARNING",
  INFO = "INFO",
  DEBUG = "DEBUG",
  TRACE = "TRACE",
}

export const GATEWAY_LOG_LEVELS = Object.values(GatewayLogLevel);

export enum ReportStrategyType {
  OnChange = "ON_CHANGE",
  OnReportPeriod = "ON_REPORT_PERIOD",
  OnChangeOrReportPeriod = "ON_CHANGE_OR_REPORT_PERIOD",
  OnReceived = "ON_RECEIVED",
  Disabled = "DISABLED",
}

export const REPORT_STRATEGY_OPTIONS: { value: ReportStrategyType; label: string }[] = [
  { value: ReportStrategyType.OnReportPeriod, label: "On report period" },
  { value: ReportStrategyType.OnChange, label: "On value change" },
  { value: ReportStrategyType.OnChangeOrReportPeriod, label: "On value change or report period" },
  { value: ReportStrategyType.OnReceived, label: "On received" },
];

/** A connector's two views where they share one place (the connector page's card, the connector dialog's Settings pane): its general settings, or its configuration's JSON. */
export type ConnectorView = "settings" | "config";

/** The switch between a connector's views (a picker styled as the logs' level filter), and the view it opens on: the configuration. */
export const CONNECTOR_VIEW_OPTIONS: SegmentOption[] = [
  { id: "settings", label: "General" },
  { id: "config", label: "Config" },
];
export const CONNECTOR_VIEW_DEFAULT: ConnectorView = "config";

/** Default report periods, ms. */
export const REPORT_PERIOD_DEFAULT = { gateway: 60000, connector: 60000 };

export interface ReportStrategyConfig {
  type: ReportStrategyType;
  reportPeriod?: number;
}

/** A connector as the gateway stores it: one attribute (named after the connector) holding this object. */
export interface GatewayConnector {
  name: string;
  type: ConnectorType;
  /** The config file name on the gateway (`<camelCaseName>.json`). */
  configuration?: string;
  logLevel: GatewayLogLevel;
  enableRemoteLogging?: boolean;
  /** gRPC connectors: their key ("auto" = generated). */
  key?: string;
  /** Custom connectors: the Python class. */
  class?: string;
  mode?: "basic" | "advanced";
  configVersion?: string;
  reportStrategy?: ReportStrategyConfig;
  sendDataOnlyOnChange?: boolean;
  /** The protocol configuration (the connector's JSON). */
  configurationJson: Record<string, any>;
  /** When the dashboard last saved it (ms). */
  ts?: number;
}

/** A connector row: the stored connector, where it lives, and the gateway's view of it. */
export interface ConnectorRow {
  /** The attribute key = the connector's name. */
  key: string;
  connector: GatewayConnector;
  /** In `active_connectors` (a SHARED attribute) — else in `inactive_connectors` (SERVER). */
  enabled: boolean;
  /** The gateway runs this configuration (its CLIENT copy matches, and it's active). */
  synced: boolean;
  /** `<name>_ERRORS_COUNT` (null before the gateway reports one). */
  errors: number | null;
  /** The gateway's own copy (what it reports it runs), when it has reported one. */
  reported: GatewayConnector | null;
}

export const CONNECTOR_SYNC_META = {
  synced: { label: "In sync", icon: "sync", tone: "success" as StatusPillTone },
  pending: { label: "Out of sync", icon: "sync_problem", tone: "warning" as StatusPillTone },
  disabled: { label: "Disabled", icon: "pause_circle", tone: "neutral" as StatusPillTone },
};

export function connectorSyncMeta(row: ConnectorRow): { label: string; icon: string; tone: StatusPillTone } {
  if (!row.enabled) {
    return CONNECTOR_SYNC_META.disabled;
  }
  return row.synced ? CONNECTOR_SYNC_META.synced : CONNECTOR_SYNC_META.pending;
}

/**
 * Whether the gateway's reported copy of a connector matches the one sent to
 * it — the same name, saved no later than the report, and the same protocol
 * configuration (the identity / logging / strategy fields aside).
 */
export function connectorSynced(sent: GatewayConnector, reported: GatewayConnector | null, gatewayActive: boolean): boolean {
  if (!reported || !gatewayActive || !sent.ts) {
    return false;
  }
  if (reported.name !== sent.name) {
    return false;
  }
  const reportedTs = Number(reported.ts) || 0;
  if (reportedTs && reportedTs > (sent.ts ?? 0) + 1) {
    // A reported copy newer than ours would be another writer's.
    return false;
  }
  const sentConfig = stripConnectorBaseInfo(sent.configurationJson);
  const reportedConfig = stripConnectorBaseInfo(reported.configurationJson);
  return Object.keys(sentConfig).length === 0 || deepEqual(sentConfig, reportedConfig);
}

/** The protocol configuration alone: without the identity / logging / strategy fields the gateway adds. */
export function stripConnectorBaseInfo(config: Record<string, any> | null | undefined): Record<string, any> {
  if (!config || typeof config !== "object") {
    return {};
  }
  const { name, id, enableRemoteLogging, logLevel, reportStrategy, configVersion, ...rest } = config;
  void name;
  void id;
  void enableRemoteLogging;
  void logLevel;
  void reportStrategy;
  void configVersion;
  return rest;
}

/** The connector's id on the gateway (assigned by it) — needed for connector RPC. */
export function connectorId(row: ConnectorRow): string {
  return String(row.reported?.configurationJson?.["id"] ?? row.connector.configurationJson?.["id"] ?? "");
}

/** Parse a stored connector attribute (a JSON string or an object). */
/**
 * A saved device block for a connector type — one entry of a connector
 * configuration's device list (a Modbus slave, an OPC-UA mapping, …) — to add
 * devices to a connector from, under a name pattern (see
 * {@link addDevicesFromTemplate}). Kept for the tenant in one attribute
 * (`deviceTemplatesKey`), so every gateway's connectors can use it.
 */
export interface DeviceTemplate {
  id: string;
  name: string;
  type: ConnectorType;
  /** Where the connector configuration lists its devices, a dot path ("master.slaves"). */
  listPath: string;
  /** The device's name field inside the block, a dot path ("deviceName"). */
  nameKey: string;
  /** The block itself. */
  device: Record<string, any>;
  /** The applications (their assets' ids) applied to a gateway when one of its connectors adds devices from this template. */
  applications: string[];
  /** When it was last saved (ms). */
  ts: number;
}

/** What the template form saves: the dashboard gives it its id and time. */
export type DeviceTemplateDraft = Omit<DeviceTemplate, "id" | "ts">;

/** A connector to take a template's device from: its type and configuration. */
export interface DeviceTemplateSource {
  type: ConnectorType;
  config: Record<string, any>;
}

/** Where each connector type lists its devices, and the device's name field, as the gateway's configurations are laid out. */
export const DEVICE_LIST_DEFAULTS: Partial<Record<ConnectorType, { listPath: string; nameKey: string }>> = {
  [ConnectorType.MODBUS]: { listPath: "master.slaves", nameKey: "deviceName" },
  [ConnectorType.OPCUA]: { listPath: "mapping", nameKey: "deviceInfo.deviceNameExpression" },
  [ConnectorType.BACNET]: { listPath: "devices", nameKey: "deviceInfo.deviceNameExpression" },
  [ConnectorType.BLE]: { listPath: "devices", nameKey: "name" },
  [ConnectorType.CAN]: { listPath: "devices", nameKey: "name" },
  [ConnectorType.SNMP]: { listPath: "devices", nameKey: "deviceName" },
  [ConnectorType.SOCKET]: { listPath: "devices", nameKey: "deviceName" },
};

export function deviceListDefaults(type: ConnectorType): { listPath: string; nameKey: string } {
  return DEVICE_LIST_DEFAULTS[type] ?? { listPath: "devices", nameKey: "deviceName" };
}

/** The templates attribute's value: a JSON array (as a string or parsed); anything else is none. */
export function parseDeviceTemplates(raw: unknown): DeviceTemplate[] {
  let list: unknown = raw;
  if (typeof raw === "string") {
    try {
      list = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) {
    return [];
  }
  const types = new Set<string>(Object.values(ConnectorType));
  return list
    .map((t: any) => {
      const device = parseObject(t?.device);
      if (typeof t?.id !== "string" || !t?.name || !types.has(t?.type) || !Object.keys(device).length) {
        return null;
      }
      const defaults = deviceListDefaults(t.type as ConnectorType);
      const template: DeviceTemplate = {
        id: t.id,
        name: String(t.name),
        type: t.type as ConnectorType,
        listPath: typeof t.listPath === "string" && t.listPath ? t.listPath : defaults.listPath,
        nameKey: typeof t.nameKey === "string" && t.nameKey ? t.nameKey : defaults.nameKey,
        device,
        applications: Array.isArray(t.applications) ? t.applications.filter((x: unknown): x is string => typeof x === "string") : [],
        ts: parseNumber(t.ts) ?? 0,
      };
      return template;
    })
    .filter((t): t is DeviceTemplate => !!t);
}

/** The most values one pattern may give. */
export const PATTERN_LIMIT = 500;

/**
 * A NetBox-style pattern's values: each `[…]` group is a range ("[1-3]";
 * "[01-03]" keeps the width; "[a-c]") or a comma list ("[1,3,5]"), and
 * several groups give every combination, the first group changing slowest;
 * with no group, the text itself. Throws past {@link PATTERN_LIMIT} values.
 */
export function expandPattern(pattern: string): string[] {
  const groups: string[][] = [];
  const template = pattern.replace(/\[([^\]]*)\]/g, (_, inner: string) => {
    groups.push(expandGroup(inner));
    return "\u0000";
  });
  let values = [""];
  const parts = template.split("\u0000");
  for (let i = 0; i < parts.length; i++) {
    const options = i < groups.length ? groups[i] : [""];
    const next: string[] = [];
    for (const v of values) {
      for (const o of options) {
        next.push(v + parts[i] + o);
        if (next.length > PATTERN_LIMIT) {
          throw new Error(`A pattern can give at most ${PATTERN_LIMIT} values.`);
        }
      }
    }
    values = next;
  }
  return values;
}

/** One group's values: a "1-3" / "01-03" / "a-c" range, else a comma list. */
function expandGroup(inner: string): string[] {
  const numbers = inner.trim().match(/^([0-9]+)-([0-9]+)$/);
  if (numbers) {
    const [, from, to] = numbers;
    const a = Number(from);
    const b = Number(to);
    if (Math.abs(b - a) >= PATTERN_LIMIT) {
      throw new Error(`A pattern can give at most ${PATTERN_LIMIT} values.`);
    }
    const width = from.startsWith("0") ? from.length : 0;
    const out: string[] = [];
    const step = a <= b ? 1 : -1;
    for (let n = a; step > 0 ? n <= b : n >= b; n += step) {
      out.push(width ? String(n).padStart(width, "0") : String(n));
    }
    return out;
  }
  const letters = inner.trim().match(/^([a-zA-Z])-([a-zA-Z])$/);
  if (letters) {
    const a = letters[1].charCodeAt(0);
    const b = letters[2].charCodeAt(0);
    const out: string[] = [];
    const step = a <= b ? 1 : -1;
    for (let c = a; step > 0 ? c <= b : c >= b; c += step) {
      out.push(String.fromCharCode(c));
    }
    return out;
  }
  return inner.split(",").map((v) => v.trim());
}

/** The value at a dot path ("deviceInfo.deviceNameExpression"), or undefined. */
export function getAtPath(obj: Record<string, any>, path: string): unknown {
  return path.split(".").reduce<any>((o, k) => (o && typeof o === "object" ? o[k] : undefined), obj);
}

/** Set a dot path's value, making the objects on the way. */
export function setAtPath(obj: Record<string, any>, path: string, value: unknown): void {
  const keys = path.split(".");
  let o = obj;
  for (const k of keys.slice(0, -1)) {
    if (!o[k] || typeof o[k] !== "object") {
      o[k] = {};
    }
    o = o[k];
  }
  o[keys[keys.length - 1]] = value;
}

/** A field that varies between the devices added from a template: a dot path in the block, and its pattern. */
export interface DeviceFieldPattern {
  key: string;
  pattern: string;
}

/**
 * Devices into a connector configuration from a template: one per name the
 * pattern gives, the block cloned with that name and each varying field's
 * value (a field's pattern gives one value for all or one per device, kept a
 * number where the block holds one), appended to the template's device list
 * (made if missing). Returns the new configuration and the count; throws
 * with a reason the form can show.
 */
export function addDevicesFromTemplate(
  config: Record<string, any>,
  template: DeviceTemplate,
  namePattern: string,
  fields: DeviceFieldPattern[]
): { config: Record<string, any>; added: number } {
  const names = expandPattern(namePattern.trim()).filter(Boolean);
  if (!names.length) {
    throw new Error("Give the devices a name, or a pattern of names.");
  }
  const values = fields
    .filter((f) => f.key.trim())
    .map((f) => {
      const list = expandPattern(f.pattern.trim());
      if (list.length !== 1 && list.length !== names.length) {
        throw new Error(`"${f.key.trim()}" gives ${list.length} values for ${names.length} devices.`);
      }
      return { key: f.key.trim(), list };
    });
  const next = JSON.parse(JSON.stringify(config ?? {})) as Record<string, any>;
  let list = getAtPath(next, template.listPath);
  if (!Array.isArray(list)) {
    list = [];
    setAtPath(next, template.listPath, list);
  }
  names.forEach((name, i) => {
    const device = JSON.parse(JSON.stringify(template.device)) as Record<string, any>;
    setAtPath(device, template.nameKey, name);
    for (const { key, list: vals } of values) {
      const raw = vals.length === 1 ? vals[0] : vals[i];
      const current = getAtPath(template.device, key);
      const asNumber = Number(raw);
      setAtPath(device, key, typeof current === "number" && raw.trim() !== "" && Number.isFinite(asNumber) ? asNumber : raw);
    }
    (list as any[]).push(device);
  });
  return { config: next, added: names.length };
}

export function parseConnector(raw: unknown): GatewayConnector | null {
  const obj = parseObject(raw);
  if (!obj["name"] || !obj["type"]) {
    return null;
  }
  return {
    ...obj,
    name: String(obj["name"]),
    type: String(obj["type"]) as ConnectorType,
    logLevel: (obj["logLevel"] as GatewayLogLevel) ?? GatewayLogLevel.INFO,
    configurationJson: parseObject(obj["configurationJson"]),
  } as GatewayConnector;
}

/** "My MQTT connector" → "myMqttConnector" (the gateway's config file name). */
export function camelCase(text: string): string {
  const words = text
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  return words.map((w, i) => (i === 0 ? w.charAt(0).toLowerCase() + w.slice(1) : w.charAt(0).toUpperCase() + w.slice(1))).join("");
}

/** The values a new connector starts with. */
export function newConnector(name: string, type: ConnectorType, gatewayVersion: string, useDefaults: boolean): GatewayConnector {
  const configurationJson = useDefaults ? defaultConnectorConfig(type, gatewayVersion) : {};
  const connector: GatewayConnector = {
    name,
    type,
    configuration: `${camelCase(name)}.json`,
    logLevel: GatewayLogLevel.INFO,
    enableRemoteLogging: false,
    mode: "advanced",
    configurationJson,
  };
  if (gatewayVersion) {
    connector.configVersion = gatewayVersion;
  }
  if (type === ConnectorType.GRPC) {
    connector.key = "auto";
  }
  if (type === ConnectorType.CUSTOM) {
    connector.class = "";
  }
  return connector;
}

/**
 * The connector as it's written to the gateway: the config file name from its
 * name, the type-specific fields only where they apply, the report strategy
 * mirrored into the configuration (3.6+), and a fresh timestamp.
 */
export function connectorToSave(c: GatewayConnector, gatewayVersion: string): GatewayConnector {
  const value: GatewayConnector = { ...c, configurationJson: { ...(c.configurationJson ?? {}) } };
  value.configuration = `${camelCase(value.name)}.json`;
  if (value.type !== ConnectorType.GRPC) {
    delete value.key;
  }
  if (value.type !== ConnectorType.CUSTOM) {
    delete value.class;
  }
  if (withReportStrategy(value.configVersion, value.type)) {
    if (value.reportStrategy) {
      value.configurationJson["reportStrategy"] = value.reportStrategy;
    } else {
      delete value.reportStrategy;
      delete value.configurationJson["reportStrategy"];
    }
    delete value.sendDataOnlyOnChange;
  } else {
    delete value.reportStrategy;
  }
  if (gatewayVersion && !value.configVersion) {
    value.configVersion = gatewayVersion;
  }
  value.ts = Date.now();
  return value;
}

// ---------------------------------------------------------------------------
// Gateway configuration (general_configuration, storage, gRPC, logs)
// ---------------------------------------------------------------------------

export enum StorageType {
  MEMORY = "memory",
  FILE = "file",
  SQLITE = "sqlite",
}

export const STORAGE_TYPE_OPTIONS: { value: StorageType; label: string }[] = [
  { value: StorageType.MEMORY, label: "Memory storage" },
  { value: StorageType.FILE, label: "File storage" },
  { value: StorageType.SQLITE, label: "SQLite" },
];

export enum SecurityType {
  ACCESS_TOKEN = "accessToken",
  USERNAME_PASSWORD = "usernamePassword",
  TLS_ACCESS_TOKEN = "tlsAccessToken",
  TLS_PRIVATE_KEY = "tlsPrivateKey",
}

export const SECURITY_TYPE_OPTIONS: { value: SecurityType; label: string }[] = [
  { value: SecurityType.ACCESS_TOKEN, label: "Access token" },
  { value: SecurityType.USERNAME_PASSWORD, label: "Username and password" },
  { value: SecurityType.TLS_ACCESS_TOKEN, label: "TLS + access token" },
  { value: SecurityType.TLS_PRIVATE_KEY, label: "TLS + private key" },
];

export enum LogSavingPeriod {
  days = "D",
  hours = "H",
  minutes = "M",
  seconds = "S",
}

export const LOG_SAVING_PERIOD_OPTIONS: { value: LogSavingPeriod; label: string }[] = [
  { value: LogSavingPeriod.days, label: "Days" },
  { value: LogSavingPeriod.hours, label: "Hours" },
  { value: LogSavingPeriod.minutes, label: "Minutes" },
  { value: LogSavingPeriod.seconds, label: "Seconds" },
];

/** The gateway's local log files, in the order the form lists them. */
export const LOCAL_LOGGERS: { id: string; label: string }[] = [
  { id: "service", label: "Service" },
  { id: "connector", label: "Connector" },
  { id: "converter", label: "Converter" },
  { id: "tb_connection", label: "ThingsBoard connection" },
  { id: "storage", label: "Storage" },
  { id: "extension", label: "Extension" },
];

export interface GatewayConfigCommand {
  /** The time-series key the command's output is reported as. */
  attributeOnGateway: string;
  command: string;
  timeout: number;
  installCmd?: string;
}

export interface GatewayConfigSecurity {
  type: SecurityType;
  accessToken?: string;
  clientId?: string;
  username?: string;
  password?: string;
  caCert?: string;
  cert?: string;
  privateKey?: string;
}

export interface GatewayGeneralConfig {
  host: string;
  port: number;
  remoteShell: boolean;
  remoteConfiguration: boolean;
  checkConnectorsConfigurationInSeconds: number;
  statistics: {
    enable: boolean;
    enableCustom?: boolean;
    statsSendPeriodInSeconds: number;
    customStatsSendPeriodInSeconds: number;
    commands: GatewayConfigCommand[];
  };
  maxPayloadSizeBytes: number;
  minPackSendDelayMS: number;
  minPackSizeToSend: number;
  handleDeviceRenaming: boolean;
  checkingDeviceActivity: {
    checkDeviceInactivity: boolean;
    inactivityTimeoutSeconds?: number;
    inactivityCheckPeriodSeconds?: number;
  };
  security: GatewayConfigSecurity;
  qos: number;
  reportStrategy?: ReportStrategyConfig;
}

export interface GatewayStorageConfig {
  type: StorageType;
  read_records_count?: number;
  max_records_count?: number;
  data_folder_path?: string;
  max_file_count?: number;
  max_read_records_count?: number;
  max_records_per_file?: number;
  data_file_path?: string;
  messages_ttl_check_in_hours?: number;
  messages_ttl_in_days?: number;
  size_limit?: number;
  max_db_amount?: number;
  oversize_check_period?: number;
  writing_batch_size?: number;
}

export interface GatewayGrpcConfig {
  enabled: boolean;
  serverPort: number;
  keepAliveTimeMs: number;
  keepAliveTimeoutMs: number;
  keepalivePermitWithoutCalls: boolean;
  maxPingsWithoutData: number;
  minTimeBetweenPingsMs: number;
  minPingIntervalWithoutDataMs: number;
}

export interface LocalLogConfig {
  logLevel: GatewayLogLevel;
  filePath: string;
  backupCount: number;
  savingTime: number;
  savingPeriod: LogSavingPeriod;
}

export interface GatewayLogsConfig {
  /** The remote logging level (`RemoteLoggingLevel`): NONE turns remote logs off. */
  logLevel: GatewayLogLevel;
  dateFormat: string;
  logFormat: string;
  local: Record<string, LocalLogConfig>;
}

/** The whole gateway configuration, as the form edits it. */
export interface GatewayConfigValue {
  thingsboard: GatewayGeneralConfig;
  storage: GatewayStorageConfig;
  grpc: GatewayGrpcConfig;
  logs: GatewayLogsConfig;
}

export function defaultLocalLogConfig(): LocalLogConfig {
  return { logLevel: GatewayLogLevel.INFO, filePath: "./logs", backupCount: 7, savingTime: 3, savingPeriod: LogSavingPeriod.days };
}

/** The gateway widgets' defaults for a gateway that hasn't reported a configuration. */
export function defaultGatewayConfig(host: string): GatewayConfigValue {
  const local: Record<string, LocalLogConfig> = {};
  for (const l of LOCAL_LOGGERS) {
    local[l.id] = defaultLocalLogConfig();
  }
  return {
    thingsboard: {
      host,
      port: 1883,
      remoteShell: false,
      remoteConfiguration: true,
      checkConnectorsConfigurationInSeconds: 60,
      statistics: { enable: true, enableCustom: false, statsSendPeriodInSeconds: 3600, customStatsSendPeriodInSeconds: 3600, commands: [] },
      maxPayloadSizeBytes: 8196,
      minPackSendDelayMS: 50,
      minPackSizeToSend: 500,
      handleDeviceRenaming: true,
      checkingDeviceActivity: { checkDeviceInactivity: false, inactivityTimeoutSeconds: 300, inactivityCheckPeriodSeconds: 10 },
      security: { type: SecurityType.ACCESS_TOKEN, accessToken: "" },
      qos: 1,
      reportStrategy: { type: ReportStrategyType.OnReportPeriod, reportPeriod: REPORT_PERIOD_DEFAULT.gateway },
    },
    storage: {
      type: StorageType.MEMORY,
      read_records_count: 100,
      max_records_count: 100000,
      data_folder_path: "./data/",
      max_file_count: 10,
      max_read_records_count: 10,
      max_records_per_file: 10000,
      data_file_path: "./data/",
      messages_ttl_check_in_hours: 1,
      messages_ttl_in_days: 7,
      size_limit: 1024,
      max_db_amount: 10,
      oversize_check_period: 1,
      writing_batch_size: 1000,
    },
    grpc: {
      enabled: false,
      serverPort: 9595,
      keepAliveTimeMs: 10000,
      keepAliveTimeoutMs: 5000,
      keepalivePermitWithoutCalls: true,
      maxPingsWithoutData: 0,
      minTimeBetweenPingsMs: 10000,
      minPingIntervalWithoutDataMs: 5000,
    },
    logs: {
      logLevel: GatewayLogLevel.INFO,
      dateFormat: "%Y-%m-%d %H:%M:%S",
      logFormat: "%(asctime)s.%(msecs)03d - |%(levelname)s| - [%(filename)s] - %(module)s - %(funcName)s - %(lineno)d - %(message)s",
      local,
    },
  };
}

/** The gateway's `logs_configuration` attribute: a Python `logging.config` dict. */
export interface LogsConfigurationAttribute {
  version: number;
  disable_existing_loggers: boolean;
  formatters: { LogFormatter: { class: string; format: string; datefmt: string } };
  handlers: Record<string, any>;
  loggers: Record<string, any>;
  root: { level: string; handlers: string[] };
  ts: number;
}

const LOGS_HANDLER_CLASS = "thingsboard_gateway.tb_utility.tb_rotating_file_handler.TimedRotatingFileHandler";
const LOGS_LEGACY_HANDLER_CLASS = "thingsboard_gateway.tb_utility.tb_handler.TimedRotatingFileHandler";

/** The form's logs section → the gateway's `logs_configuration` (as the gateway widgets build it). */
export function buildLogsConfiguration(logs: GatewayLogsConfig, gatewayVersion: string): LogsConfigurationAttribute {
  const updated = parseVersion(gatewayVersion || GatewayVersion.Legacy) >= parseVersion(GatewayVersion.v3_6_3);
  const attr: LogsConfigurationAttribute = {
    version: 1,
    disable_existing_loggers: false,
    formatters: { LogFormatter: { class: "logging.Formatter", format: logs.logFormat, datefmt: logs.dateFormat } },
    handlers: { consoleHandler: { class: "logging.StreamHandler", formatter: "LogFormatter", level: 0, stream: "ext://sys.stdout" } },
    loggers: updated ? {} : { database: { handlers: ["consoleHandler"], level: "DEBUG", propagate: false } },
    root: { level: "ERROR", handlers: ["consoleHandler"] },
    ts: Date.now(),
  };
  for (const [key, cfg] of Object.entries(logs.local ?? {})) {
    attr.handlers[`${key}Handler`] = {
      class: updated ? LOGS_HANDLER_CLASS : LOGS_LEGACY_HANDLER_CLASS,
      formatter: "LogFormatter",
      filename: `${cfg.filePath}/${key}.log`,
      backupCount: cfg.backupCount,
      interval: cfg.savingTime,
      when: cfg.savingPeriod,
      encoding: "utf-8",
    };
    attr.loggers[key] = { handlers: [`${key}Handler`, "consoleHandler"], level: cfg.logLevel, propagate: false };
  }
  return attr;
}

/** The gateway's `logs_configuration` → the form's logs section. */
export function parseLogsConfiguration(raw: unknown, logLevel: GatewayLogLevel): GatewayLogsConfig | null {
  const attr = parseObject(raw) as Partial<LogsConfigurationAttribute>;
  const formatter = attr.formatters?.["LogFormatter"];
  if (!formatter) {
    return null;
  }
  const local: Record<string, LocalLogConfig> = {};
  for (const l of LOCAL_LOGGERS) {
    const handler = attr.handlers?.[`${l.id}Handler`] ?? {};
    const logger = attr.loggers?.[l.id] ?? {};
    const filename = String(handler["filename"] ?? "");
    local[l.id] = {
      logLevel: (logger["level"] as GatewayLogLevel) || GatewayLogLevel.INFO,
      filePath: filename ? filename.split(`/${l.id}`)[0] || "./logs" : "./logs",
      backupCount: Number(handler["backupCount"]) || 7,
      savingTime: Number(handler["interval"]) || 3,
      savingPeriod: (handler["when"] as LogSavingPeriod) || LogSavingPeriod.days,
    };
  }
  return { logLevel, dateFormat: String(formatter.datefmt ?? ""), logFormat: String(formatter.format ?? ""), local };
}

// ---------------------------------------------------------------------------
// Logs (the gateway's remote log time series)
// ---------------------------------------------------------------------------

/** The gateway's log channels — each a time series of log lines. */
export const GATEWAY_LOG_SOURCES: { id: string; label: string; key: string }[] = [
  { id: "general", label: "General", key: "LOGS" },
  { id: "service", label: "Service", key: "SERVICE_LOGS" },
  { id: "connection", label: "Connection", key: "CONNECTION_LOGS" },
  { id: "storage", label: "Storage", key: "STORAGE_LOGS" },
  { id: "extension", label: "Extension", key: "EXTENSIONS_LOGS" },
];

/** A connector's log channels: its own and its converter's. */
export function connectorLogKeys(connectorName: string): { key: string; label: string }[] {
  return [
    { key: `${connectorName}_LOGS`, label: `${connectorName} · connector` },
    { key: `${connectorName}_converter_LOGS`, label: `${connectorName} · converter` },
  ];
}

export type LogLevelName = "DEBUG" | "INFO" | "WARNING" | "ERROR" | "EXCEPTION" | "CRITICAL" | "TRACE" | "UNKNOWN";

export const LOG_LEVEL_META: Record<LogLevelName, { label: string; tone: StatusPillTone; icon: string }> = {
  TRACE: { label: "Trace", tone: "neutral", icon: "" },
  DEBUG: { label: "Debug", tone: "neutral", icon: "" },
  INFO: { label: "Info", tone: "brand", icon: "" },
  WARNING: { label: "Warning", tone: "warning", icon: "" },
  ERROR: { label: "Error", tone: "error", icon: "" },
  EXCEPTION: { label: "Exception", tone: "error", icon: "" },
  CRITICAL: { label: "Critical", tone: "error", icon: "" },
  UNKNOWN: { label: "Unknown", tone: "neutral", icon: "" },
};

/** The Level filter's options. */
export const LOG_LEVEL_OPTIONS: { id: LogLevelName; label: string }[] = [
  { id: "ERROR", label: "Error / exception" },
  { id: "WARNING", label: "Warning" },
  { id: "INFO", label: "Info" },
  { id: "DEBUG", label: "Debug / trace" },
];

/** The level a log line counts under in the Level filter. */
export function logLevelFilterId(level: LogLevelName): LogLevelName {
  if (level === "EXCEPTION" || level === "CRITICAL") {
    return "ERROR";
  }
  if (level === "TRACE") {
    return "DEBUG";
  }
  if (level === "UNKNOWN") {
    return "INFO";
  }
  return level;
}

export interface GatewayLogRow {
  id: string;
  ts: number;
  time: string;
  gatewayId: string;
  gatewayName: string;
  /** The time-series key the line came from. */
  key: string;
  source: string;
  level: LogLevelName;
  message: string;
  /** The whole line, for the search. */
  raw: string;
}

/**
 * A gateway log line — `2024-01-01 10:00:00,000 - |INFO| - [tb_gateway_service.py] - … - message`
 * — split into its level (between the pipes) and message (from the file
 * name on).
 */
export function parseLogLine(line: string): { level: LogLevelName; message: string } {
  const levelMatch = /\|(\w+)\|/.exec(line);
  const level = (levelMatch ? levelMatch[1].toUpperCase() : "UNKNOWN") as LogLevelName;
  const messageMatch = /\[(.*)/.exec(line);
  return { level: LOG_LEVEL_META[level] ? level : "UNKNOWN", message: messageMatch ? messageMatch[0] : line };
}

/** The log views' windows. */
export const LOG_TIMEFRAMES: { id: string; ms: number }[] = [
  { id: "1H", ms: 60 * 60 * 1000 },
  { id: "6H", ms: 6 * 60 * 60 * 1000 },
  { id: "1D", ms: 24 * 60 * 60 * 1000 },
  { id: "1W", ms: 7 * 24 * 60 * 60 * 1000 },
];

/** The statistics views' windows. */
export const STATS_TIMEFRAMES: { id: string; ms: number }[] = [
  { id: "1D", ms: 24 * 60 * 60 * 1000 },
  { id: "1W", ms: 7 * 24 * 60 * 60 * 1000 },
  { id: "1M", ms: 30 * 24 * 60 * 60 * 1000 },
];

// ---------------------------------------------------------------------------
// Statistics (serviceStats / machineStats time series)
// ---------------------------------------------------------------------------

/**
 * One figure the gateway reports in its `serviceStats` / `machineStats` JSON
 * — each is a chart of the Statistics view (one line per gateway) and a
 * figure of a gateway's Overview.
 */
export interface StatMetric {
  id: string;
  /** Which time series holds it. */
  series: "service" | "machine";
  /** The property in the JSON. */
  field: string;
  label: string;
  /** Its name under a heading that already says what's measured (the gateway panel's Metrics card): "CPU" for "Process CPU usage". */
  shortLabel?: string;
  unit: string;
  info: string;
  /** The Statistics view's Metrics filter groups the charts under these. */
  group: "messages" | "machine";
}

export const STAT_METRICS: StatMetric[] = [
  { id: "platformMsgPushed", series: "service", field: "platformMsgPushed", label: "Messages pushed to platform", unit: "", info: "Messages the gateway pushed to the platform.", group: "messages" },
  { id: "storageMsgPulled", series: "service", field: "storageMsgPulled", label: "Messages pulled from storage", unit: "", info: "Messages the gateway pulled from its storage to send.", group: "messages" },
  { id: "storageMsgCount", series: "service", field: "storageMsgCount", label: "Messages in storage", unit: "", info: "Messages waiting in the gateway's storage.", group: "messages" },
  { id: "platformAttrProduced", series: "service", field: "platformAttrProduced", label: "Attributes produced", unit: "", info: "Attribute datapoints the gateway produced for the platform.", group: "messages" },
  { id: "platformTsProduced", series: "service", field: "platformTsProduced", label: "Telemetry produced", unit: "", info: "Telemetry datapoints the gateway produced for the platform.", group: "messages" },
  { id: "gwProcessCpuUsage", series: "machine", field: "gwProcessCpuUsage", label: "Process CPU usage", shortLabel: "CPU", unit: "%", info: "The gateway process's CPU usage.", group: "machine" },
  { id: "gwMemory", series: "machine", field: "gwMemory", label: "Process memory usage", shortLabel: "Memory", unit: "%", info: "The gateway process's memory usage.", group: "machine" },
  { id: "diskUsage", series: "machine", field: "diskUsage", label: "Disk usage", shortLabel: "Disk", unit: "%", info: "The gateway host's disk usage.", group: "machine" },
];

/** The Statistics view's Metrics filter. */
export const STAT_GROUP_OPTIONS: { id: StatMetric["group"]; label: string }[] = [
  { id: "messages", label: "Messages & datapoints" },
  { id: "machine", label: "Machine resources" },
];

/** The latest figures a gateway's Overview shows, in order. */
export const STAT_KPIS: string[] = ["storageMsgCount", "platformMsgPushed", "gwProcessCpuUsage", "gwMemory", "diskUsage"];

/** The latest `serviceStats` / `machineStats` values of a gateway, by metric id. */
export function latestStats(serviceStats: unknown, machineStats: unknown): Record<string, number | null> {
  const service = parseObject(serviceStats);
  const machine = parseObject(machineStats);
  const out: Record<string, number | null> = {};
  for (const m of STAT_METRICS) {
    out[m.id] = parseNumber((m.series === "service" ? service : machine)[m.field]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// RPC
// ---------------------------------------------------------------------------

/** The gateway service commands (`gateway_<command>`). */
export const GATEWAY_RPC_COMMANDS: { id: string; label: string; info: string }[] = [
  { id: "ping", label: "Ping", info: "Checks the gateway responds." },
  { id: "stats", label: "Stats", info: "The gateway's current statistics." },
  { id: "devices", label: "Devices", info: "The devices connected through the gateway." },
  { id: "update", label: "Update", info: "Updates the gateway to the latest version." },
  { id: "version", label: "Version", info: "The gateway's version." },
  { id: "restart", label: "Restart", info: "Restarts the gateway service." },
  { id: "reboot", label: "Reboot", info: "Reboots the gateway host." },
];

/** A saved connector-RPC request (the gateway's `<type>_template` server attribute holds a list). */
export interface RpcTemplate {
  name: string;
  type: ConnectorType;
  config: Record<string, any>;
}

/**
 * The RPC method a connector request is sent as (`<type>_<command>`): which
 * parameter names the command depends on the connector type, as in the
 * gateway widgets.
 */
export function connectorRpcCommand(type: ConnectorType, params: Record<string, any>): string {
  switch (type) {
    case ConnectorType.MQTT:
    case ConnectorType.FTP:
    case ConnectorType.SNMP:
    case ConnectorType.REST:
    case ConnectorType.REQUEST:
      return String(params["methodFilter"] ?? "");
    case ConnectorType.MODBUS:
      return [1, 2, 3, 4].includes(Number(params["functionCode"])) ? "get" : "set";
    case ConnectorType.BACNET:
    case ConnectorType.CAN:
    case ConnectorType.OPCUA:
      return String(params["method"] ?? "");
    case ConnectorType.BLE:
    case ConnectorType.OCPP:
    case ConnectorType.SOCKET:
    case ConnectorType.XMPP:
      return String(params["methodRPC"] ?? "");
    case ConnectorType.S7:
      return String(params["requestType"] ?? "");
    default:
      return String(params["command"] ?? "");
  }
}

/** A starting request for each connector type (the gateway docs' examples). */
export function connectorRpcExample(type: ConnectorType): Record<string, any> {
  switch (type) {
    case ConnectorType.MQTT:
      return { methodFilter: "echo", requestTopicExpression: "sensor/${deviceName}/request/${methodName}/${requestId}", responseTopicExpression: "sensor/${deviceName}/response/${methodName}/${requestId}", responseTimeout: 10000, valueExpression: "${params}", withResponse: true };
    case ConnectorType.MODBUS:
      return { tag: "temperature", type: "16int", functionCode: 3, objectsCount: 1, address: 0 };
    case ConnectorType.OPCUA:
      return { method: "multiply", arguments: [1, 2] };
    case ConnectorType.SOCKET:
      return { methodRPC: "rpcMethod1", methodProcessing: "write", encoding: "utf-8", withResponse: true };
    case ConnectorType.BACNET:
      return { method: "readProperty", requestType: "readProperty", objectType: "analogInput", objectId: 1, propertyId: "presentValue" };
    case ConnectorType.BLE:
      return { methodRPC: "rpcMethod1", characteristicUUID: "00002A00-0000-1000-8000-00805F9B34FB", methodProcessing: "read", withResponse: true };
    case ConnectorType.CAN:
      return { method: "sendSameData", nodeId: 4, isExtendedId: true, dataInHex: "aa bb cc dd ee ff aa bb" };
    case ConnectorType.S7:
      return { requestType: "read", address: "DB1.DBD0", type: "real" };
    case ConnectorType.SNMP:
      return { methodFilter: "setData", method: "set", oid: "1.3.6.1.2.1.1.5.0" };
    case ConnectorType.REST:
    case ConnectorType.REQUEST:
      return { methodFilter: "echo", httpMethod: "POST", requestUrlExpression: "sensor/${deviceName}/request/${methodName}/${requestId}", valueExpression: "${params}", timeout: 5, withResponse: true };
    case ConnectorType.FTP:
      return { methodFilter: "read", valueExpression: "${params}", filePath: "" };
    case ConnectorType.OCPP:
    case ConnectorType.XMPP:
      return { methodRPC: "rpcMethod1", valueExpression: "${params}", withResponse: true };
    default:
      return { command: "", params: {} };
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** A name: no leading or trailing spaces, single spaces between words — the shared forms' (re-exported: the gateway forms import it from here). */
export { NO_LEAD_TRAIL_SPACES } from "../../components/shared/form-utils";
