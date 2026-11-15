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

/**
 * Where a device is and what its name says — as the backend keeps them (CLAUDE.md "Where a device is",
 * "Device names", "Mobile devices"): a device's name read as its parts by the "Device Naming" rule chain
 * (`nameSite` — a Site's code, or a code that's neither — `nameAsset` — a vehicle's number — `nameLine`),
 * the gateway that created it (`gateway`, the Device Site Attributes chain's; `hasCreator`, Mark created
 * devices'), the gateway it's connected through now (ThingsBoard's `additionalInfo.lastConnectedGateway`),
 * and the tenant's mobile profiles (`mobileProfiles`: a device of one is a vehicle). And what changes them
 * from a dashboard: a device put at a site ({@link placeDevice}), a device made to follow another gateway
 * ({@link relinkGateway}) — the backend derives the rest.
 */

import { Observable, concat, forkJoin, of } from "rxjs";
import { catchError, last, map, switchMap } from "rxjs/operators";
import { AliasFilterType, AttributeScope, EntityDataQuery, EntityFilter, EntityKeyType, EntityRelation, EntityType, RelationTypeGroup } from "@shared/public-api";
import { defaultHttpOptionsFromConfig } from "@core/public-api";
import { WidgetContext } from "@home/models/widget-component.models";
import { QUIET_REQUEST, parseBool } from "../value-utils";
import { OWNER_ENTITY_FIELDS, ownerCustomer } from "../entity-owner";

/** A device's name, read as its parts (the "Device Naming" rule chain's server attributes). */
export const NAME_KEYS = { site: "nameSite", asset: "nameAsset", line: "nameLine", type: "nameType" } as const;
/** The gateway that created a device — its name (server attribute, the Device Site Attributes chain's). */
export const GATEWAY_KEY = "gateway";
/** A gateway created the device (server attribute, Mark created devices'). */
export const HAS_CREATOR_KEY = "hasCreator";
/** The tenant's server attribute listing the mobile device profiles' names. */
export const MOBILE_PROFILES_KEY = "mobileProfiles";
/** The relation by which a gateway created a device (ThingsBoard's own). */
export const CREATED_RELATION = "Created";
/** The relation by which a site holds a device. */
export const SITE_DEVICE_RELATION = "Contains";

/**
 * The product lines of test devices' names ("dev-nb-gw-03"): they name no product line or site of the
 * Organization, so the checks on device names leave them out.
 */
export const TEST_NAME_LINES = ["DEV"];

/** The server attributes {@link devicePlaceOf} reads. */
export const DEVICE_PLACE_KEYS = ["site", "market", "productLine", NAME_KEYS.site, NAME_KEYS.asset, NAME_KEYS.line, HAS_CREATOR_KEY, GATEWAY_KEY];

/** A device's place and name as stored. */
export interface DevicePlace {
  /** Its site's, market's and product line's codes ("" none). */
  site: string;
  market: string;
  productLine: string;
  /** The place its name says: a Site's code, or a code that's neither — `nameSite`; a vehicle's number — `nameAsset`. */
  nameSite: string;
  nameAsset: string;
  /** Its name's product line ("" — the name doesn't follow the convention, or isn't read yet). */
  nameLine: string;
  /** A gateway created it (named by the gateway's config, placed where the gateway is). */
  created: boolean;
  /** That gateway's name ("" none). */
  gateway: string;
  /** The gateway it's connected through now — its id ("" none). */
  lastGatewayId: string;
}

/** The gateway a device is connected through now (`additionalInfo.lastConnectedGateway`, a JSON text or an object): its id, "" none. */
export function lastGatewayOf(additionalInfo: unknown): string {
  let info: any = additionalInfo;
  if (typeof info === "string") {
    try {
      info = JSON.parse(info);
    } catch {
      info = null;
    }
  }
  return info && typeof info === "object" && info.lastConnectedGateway ? String(info.lastConnectedGateway) : "";
}

/** A device's place and name out of its server attributes (by key; values as ThingsBoard gives them) and its additional info. */
export function devicePlaceOf(attrs: Record<string, unknown>, additionalInfo: unknown): DevicePlace {
  const text = (k: string) => (attrs[k] === null || attrs[k] === undefined ? "" : String(attrs[k]));
  return {
    site: text("site"),
    market: text("market"),
    productLine: text("productLine"),
    nameSite: text(NAME_KEYS.site),
    nameAsset: text(NAME_KEYS.asset),
    nameLine: text(NAME_KEYS.line),
    created: parseBool(attrs[HAS_CREATOR_KEY]),
    gateway: text(GATEWAY_KEY),
    lastGatewayId: lastGatewayOf(additionalInfo),
  };
}

/** A test device's name (its product line one of {@link TEST_NAME_LINES}): the name checks leave it out. */
export function isTestName(place: { nameLine: string }): boolean {
  return TEST_NAME_LINES.includes(place.nameLine.toUpperCase());
}

/** The tenant's mobile device profiles (`mobileProfiles`): a device of one is a vehicle — [] when none, or unreadable. */
export function loadMobileProfiles(ctx: WidgetContext): Observable<string[]> {
  const tenantId = ctx.currentUser?.tenantId;
  if (!tenantId) {
    return of([]);
  }
  return ctx.attributeService.getEntityAttributes({ entityType: EntityType.TENANT, id: tenantId }, AttributeScope.SERVER_SCOPE, [MOBILE_PROFILES_KEY], QUIET_REQUEST).pipe(
    map((attrs) => {
      let value: unknown = attrs.find((a) => a.key === MOBILE_PROFILES_KEY)?.value;
      if (typeof value === "string") {
        try {
          value = JSON.parse(value);
        } catch {
          value = [];
        }
      }
      return Array.isArray(value) ? value.map(String) : [];
    }),
    catchError(() => of([] as string[]))
  );
}

/** The tenant's mobile device profiles set to these (a tenant administrator's: the device profile form's "Mobile"). */
export function saveMobileProfiles(ctx: WidgetContext, profiles: string[]): Observable<unknown> {
  const tenantId = ctx.currentUser?.tenantId;
  const value = [...new Set(profiles)].sort((a, b) => a.localeCompare(b));
  return ctx.attributeService.saveEntityAttributes({ entityType: EntityType.TENANT, id: tenantId }, AttributeScope.SERVER_SCOPE, [{ key: MOBILE_PROFILES_KEY, value }], QUIET_REQUEST);
}

/**
 * A name with its place — its second part — replaced by `code` ("agg-3d64-gw-01" at 3D21 → "agg-3d21-gw-01";
 * "rmx-61081-gw-01" on 61080 → "rmx-61080-gw-01"); null when the name isn't <line>-<place>-<type>-<number>,
 * or already says it.
 */
export function renamedFor(name: string, code: string): string | null {
  const parts = name.trim().split("-");
  if (parts.length !== 4 || !code) {
    return null;
  }
  parts[1] = code.toLowerCase();
  const renamed = parts.join("-");
  return renamed === name ? null : renamed;
}

/** A device's name follows the convention itself (not only its `deviceName` — a LoRaWAN sensor's, ChirpStack's to change). */
export function nameHasParts(name: string): boolean {
  return /^[a-z0-9]+-[a-z0-9]+-[a-z][a-z0-9]*-[0-9]+$/i.test(name.trim());
}

/** A device a panel or a list links to: what its Details panel opens with. */
export interface DeviceRef {
  id: string;
  name: string;
  label: string;
  /** Its profile's name. */
  profile: string;
  /** Its owner's title (a customer's, or the tenant's own) and its stored site's code ("" none): its panel's form starts with them. */
  owner: string;
  site: string;
}

/** The devices a panel links to, by id: each a {@link DeviceRef} — one entity query (its fields, its owner, its stored site). */
function readDeviceRefs(ctx: WidgetContext, ids: string[]): Observable<Map<string, DeviceRef & { type: string }>> {
  if (!ids.length) {
    return of(new Map());
  }
  const query: EntityDataQuery = {
    entityFilter: { type: AliasFilterType.entityList, entityType: EntityType.DEVICE, entityList: ids } as EntityFilter,
    entityFields: [
      { type: EntityKeyType.ENTITY_FIELD, key: "name" },
      { type: EntityKeyType.ENTITY_FIELD, key: "label" },
      { type: EntityKeyType.ENTITY_FIELD, key: "type" },
      ...OWNER_ENTITY_FIELDS,
    ],
    latestValues: [{ type: EntityKeyType.SERVER_ATTRIBUTE, key: "site" }],
    keyFilters: [],
    pageLink: { page: 0, pageSize: ids.length },
  };
  return ctx.entityService.findEntityDataByQuery(query, QUIET_REQUEST).pipe(
    map((page) => {
      const refs = new Map<string, DeviceRef & { type: string }>();
      (page?.data ?? []).forEach((d: any) => {
        const f = d.latest?.[EntityKeyType.ENTITY_FIELD] ?? {};
        const text = (k: string) => String(f[k]?.value ?? "");
        const profile = text("type");
        refs.set(String(d.entityId.id), {
          id: String(d.entityId.id),
          name: text("name"),
          label: text("label"),
          profile,
          type: profile,
          owner: ownerCustomer(f),
          site: String(d.latest?.[EntityKeyType.SERVER_ATTRIBUTE]?.["site"]?.value ?? ""),
        });
      });
      return refs;
    }),
    catchError(() => of(new Map<string, DeviceRef & { type: string }>()))
  );
}

/** What a device's panel shows about its place and its gateway, read as it opens ({@link readDeviceContext}). */
export interface DeviceContext {
  place: DevicePlace;
  /** The Site that holds it directly (Site —Contains→ device): its id; null none. */
  siteId: string | null;
  /** Its site comes from another parent (a truck asset, a room): no Site of its own to pick. */
  siteViaOther: boolean;
  /** The gateway that created it (its Created parent). */
  creator: DeviceRef | null;
  /** The gateway it's connected through now (not itself). */
  servedBy: DeviceRef | null;
  /** A gateway named for a vehicle (`nameAsset`): that vehicle, and the gateway it's connected through now (its id). */
  namedVehicle: DeviceRef | null;
  namedVehicleGatewayId: string;
  /** A gateway: the vehicles it created (devices of a mobile profile). */
  vehicles: DeviceRef[];
}

/**
 * A device's place, name and gateways (its panel, after a save): its server attributes, its parents, the
 * gateways it was created by and is connected through, and — a gateway — the vehicle its name says and the
 * vehicles it created. `entity` is the device as ThingsBoard holds it; `siteIds` the Organization's Sites.
 */
export function readDeviceContext(ctx: WidgetContext, entity: any, siteIds: ReadonlySet<string>, mobileProfiles: readonly string[]): Observable<DeviceContext> {
  return readWith(ctx, String(entity.id.id), of(entity), siteIds, mobileProfiles).pipe(map((r) => r.context));
}

/**
 * A device as ThingsBoard holds it and its context ({@link readDeviceContext}), read together — the device
 * and the first of its context in one round, so its panel's form fills in sooner. Fails when the device
 * can't be read.
 */
export function readDevice(ctx: WidgetContext, deviceId: string, siteIds: ReadonlySet<string>, mobileProfiles: readonly string[]): Observable<{ entity: any; context: DeviceContext }> {
  return readWith(ctx, deviceId, ctx.deviceService.getDevice(deviceId, QUIET_REQUEST), siteIds, mobileProfiles);
}

function readWith(
  ctx: WidgetContext,
  id: string,
  entity$: Observable<any>,
  siteIds: ReadonlySet<string>,
  mobileProfiles: readonly string[]
): Observable<{ entity: any; context: DeviceContext }> {
  const deviceId = { entityType: EntityType.DEVICE, id };
  const attrs$ = ctx.attributeService.getEntityAttributes(deviceId, AttributeScope.SERVER_SCOPE, DEVICE_PLACE_KEYS, QUIET_REQUEST).pipe(catchError(() => of([])));
  const parents$ = ctx.entityRelationService.findByTo(deviceId, QUIET_REQUEST).pipe(catchError(() => of([] as EntityRelation[])));
  const children$ = ctx.entityRelationService.findInfoByFrom(deviceId, QUIET_REQUEST).pipe(catchError(() => of([] as any[])));
  const mobile = new Set(mobileProfiles);
  return forkJoin({ entity: entity$, attrs: attrs$, parents: parents$, children: children$ }).pipe(
    switchMap(({ entity, attrs, parents, children }) => {
      const place = devicePlaceOf(Object.fromEntries(attrs.map((a) => [a.key, a.value])), entity.additionalInfo);
      const sites = parents.filter((r) => r.type === SITE_DEVICE_RELATION && r.from?.entityType === EntityType.ASSET && siteIds.has(r.from.id));
      const creatorId = parents.find((r) => r.type === CREATED_RELATION && r.from?.entityType === EntityType.DEVICE && r.from.id !== id)?.from.id ?? "";
      const servedId = place.lastGatewayId && place.lastGatewayId !== id ? place.lastGatewayId : "";
      const createdIds = children.filter((r: any) => r.type === CREATED_RELATION && r.to?.entityType === EntityType.DEVICE && r.to.id !== id).map((r: any) => String(r.to.id));
      // The vehicle a gateway's name says (by name — only then is its id known), then every device the panel links to, in one query.
      const vehicle$: Observable<any> = place.nameAsset
        ? ctx.http.get<any>(`/api/tenant/devices?deviceName=${encodeURIComponent(place.nameAsset)}`, defaultHttpOptionsFromConfig(QUIET_REQUEST)).pipe(catchError(() => of(null)))
        : of(null);
      return vehicle$.pipe(
        switchMap((vehicle) => {
          const namedVehicle = vehicle?.id && mobile.has(String(vehicle.type)) ? vehicle : null;
          const namedId = namedVehicle ? String(namedVehicle.id.id) : "";
          const ids = [...new Set([creatorId, servedId, namedId, ...createdIds].filter(Boolean))];
          return readDeviceRefs(ctx, ids).pipe(
            map((refs): { entity: any; context: DeviceContext } => {
              const ref = (refId: string): DeviceRef | null => (refId ? (refs.get(refId) ?? null) : null);
              const context: DeviceContext = {
                place,
                siteId: sites[0]?.from.id ?? null,
                siteViaOther: !sites.length && !!place.site && !place.created,
                creator: ref(creatorId),
                servedBy: ref(servedId),
                namedVehicle: ref(namedId),
                namedVehicleGatewayId: namedVehicle ? lastGatewayOf(namedVehicle.additionalInfo) : "",
                vehicles: createdIds.map((c) => refs.get(c)).filter((d): d is DeviceRef & { type: string } => !!d && mobile.has(d.type)),
              };
              return { entity, context };
            })
          );
        })
      );
    })
  );
}

/** What a device's name or gateway disagrees with (its panel's callout), and the actions that settle it. */
export interface DeviceNote {
  /** What disagrees ("Named for 3D64, which is neither a site nor a vehicle") — the callout's text, under its "Warning" title. */
  text: string;
  /** Its name with its place as the device is (the Name field takes it; the form's Apply saves it). */
  rename: string | null;
  /** The Site its name says (the Site field takes it). */
  moveTo: string | null;
  /** The gateway it's connected through now, to follow (its Created relation moved to it). */
  follow: DeviceRef | null;
}

/**
 * The note on a device's panel: the first of — it follows another gateway than the one serving it (a
 * replacement gateway: ThingsBoard doesn't remake the Created relation); a gateway named for another vehicle
 * than the one it serves; a name for a site it isn't at; a name for a place that's neither a site nor a
 * vehicle. Null when all agree — a test device's name aside. Renames only for a name of its own (not a
 * LoRaWAN sensor's `deviceName`, ChirpStack's) and never for a device a gateway created (its gateway's config
 * names it: renamed here, the gateway would make a new one under the old name).
 */
export function deviceNoteOf(
  device: { id: string; name: string },
  c: DeviceContext,
  siteByCode: ReadonlyMap<string, { id: string }>,
  siteText: (code: string) => string
): DeviceNote | null {
  const p = c.place;
  if (p.created && c.creator && c.servedBy && c.servedBy.id !== c.creator.id) {
    return { text: `Follows ${c.creator.name}, served by ${c.servedBy.name}`, rename: null, moveTo: null, follow: c.servedBy };
  }
  if (p.created || isTestName(p)) {
    return null;
  }
  const ownName = nameHasParts(device.name);
  const served = c.vehicles[0] ?? null;
  if (p.nameAsset) {
    if (served && served.name.toUpperCase() !== p.nameAsset.toUpperCase()) {
      return { text: `Named for ${p.nameAsset}, serves ${served.name}`, rename: ownName ? renamedFor(device.name, served.name) : null, moveTo: null, follow: null };
    }
    if (!served && c.namedVehicle && c.namedVehicleGatewayId && c.namedVehicleGatewayId !== device.id) {
      return { text: `Named for ${p.nameAsset}, which another gateway serves`, rename: null, moveTo: null, follow: null };
    }
    return null;
  }
  if (!p.nameSite) {
    return null;
  }
  if (served) {
    // Named for a site, on a vehicle: a vehicle's gateway is named for the vehicle.
    return { text: `Named for ${siteText(p.nameSite)}, serves ${served.name}`, rename: ownName ? renamedFor(device.name, served.name) : null, moveTo: null, follow: null };
  }
  const named = siteByCode.get(p.nameSite.toLowerCase());
  if (!named) {
    return { text: `Named for ${p.nameSite}, which is neither a site nor a vehicle`, rename: null, moveTo: null, follow: null };
  }
  if (p.site && p.site.toLowerCase() !== p.nameSite.toLowerCase()) {
    return {
      text: `Named for ${siteText(p.nameSite)}, at ${siteText(p.site)}`,
      rename: ownName ? renamedFor(device.name, p.site) : null,
      moveTo: c.siteViaOther ? null : named.id,
      follow: null,
    };
  }
  return null;
}

/**
 * Puts a device at a site (null: out of every site): its relation from any other Site removed, the site's
 * made — its other parents stay (an application's, a gateway's). The backend derives its site, market and
 * product line from them (the Device Site Attributes chain); never write those here.
 */
export function placeDevice(ctx: WidgetContext, deviceId: string, siteId: string | null, siteIds: ReadonlySet<string>, relationType = SITE_DEVICE_RELATION): Observable<unknown> {
  const device = { entityType: EntityType.DEVICE, id: deviceId };
  return ctx.entityRelationService.findByTo(device, QUIET_REQUEST).pipe(
    map((relations) => relations.filter((r) => r.type === relationType && r.from?.entityType === EntityType.ASSET && siteIds.has(r.from.id))),
    switchMap((current) => {
      const steps: Observable<unknown>[] = current
        .filter((r) => r.from.id !== siteId)
        .map((r) => ctx.entityRelationService.deleteRelation(r.from, relationType, device, QUIET_REQUEST));
      if (siteId && !current.some((r) => r.from.id === siteId)) {
        const relation: EntityRelation = { from: { entityType: EntityType.ASSET, id: siteId }, to: device, type: relationType, typeGroup: RelationTypeGroup.COMMON };
        steps.push(ctx.entityRelationService.saveRelation(relation, QUIET_REQUEST));
      }
      return steps.length ? forkJoin(steps) : of(null);
    })
  );
}

/**
 * A device made to follow the gateway it's connected through now: the Created relation from it made, then
 * the one from its old gateway (`fromGatewayId`, when there's one) removed — it goes where its new gateway
 * is from then on (Mark created devices; its `gateway` the chain's).
 */
export function relinkGateway(ctx: WidgetContext, deviceId: string, fromGatewayId: string | null, toGatewayId: string): Observable<unknown> {
  const device = { entityType: EntityType.DEVICE, id: deviceId };
  const relation: EntityRelation = { from: { entityType: EntityType.DEVICE, id: toGatewayId }, to: device, type: CREATED_RELATION, typeGroup: RelationTypeGroup.COMMON };
  const steps: Observable<unknown>[] = [ctx.entityRelationService.saveRelation(relation, QUIET_REQUEST)];
  if (fromGatewayId && fromGatewayId !== toGatewayId) {
    steps.push(ctx.entityRelationService.deleteRelation({ entityType: EntityType.DEVICE, id: fromGatewayId }, CREATED_RELATION, device, QUIET_REQUEST));
  }
  return concat(...steps).pipe(last());
}
