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

import { Observable, of } from "rxjs";
import { catchError, map } from "rxjs/operators";
import { AliasFilterType, AttributeScope, EntityDataQuery, EntityKeyType, EntityType } from "@shared/public-api";
import { WidgetContext } from "@home/models/widget-component.models";
import { HeatmapPoint } from "../calendar-heatmap/calendar-heatmap.component";
import { isTenantAdmin } from "../dashboard/dashboard-preferences";
import { AccessScope, accessScopeType, scopeFromAttributes } from "../access/access.models";
import { QUIET_REQUEST, parseObject } from "../value-utils";

/**
 * The alarms created each day, as the backend keeps them, so no dashboard
 * reads a year of alarms to count them: the "Alarms Per Day" rule chain
 * counts today's and yesterday's device alarms again every 5 minutes (each
 * day in Mountain time, America/Edmonton) and keeps a year of days as the
 * server attribute `alarmsPerDay` (`{"2026-11-10": 12, …}`, a day without
 * alarms left out) on each site, market, product line (its sub lines'
 * included) and region (the markets it Contains) — an alarm placed by its
 * device's stored location (`site` / `market` / `productLine`), never by the
 * relations — and on the tenant (every device's).
 */
export const ALARMS_PER_DAY_KEY = "alarmsPerDay";

/** The chain counts again this often: the stored days are read again as often. */
export const ALARMS_PER_DAY_REFRESH_MS = 5 * 60 * 1000;

/** Where a viewer's days are read: the tenant's (every device), or the sum of some assets' (null: nothing to read). */
export type AlarmsPerDaySource = { tenantId: string } | { assetIds: string[] } | null;

/** The Organization's assets the viewer reads (their ids). */
export interface SeenOrganization {
  siteIds: string[];
  marketIds: string[];
  productLineIds: string[];
}

/**
 * A user's source by their scope: a product line's or a market's own days,
 * a regional user's the markets they read, a plant's its sites' — else (a
 * market's one product line's plants, no scope, an asset they can't read)
 * the sites they read.
 */
export function alarmsPerDaySource(scope: AccessScope | null, seen: SeenOrganization): AlarmsPerDaySource {
  const sites = seen.siteIds.length ? { assetIds: seen.siteIds } : null;
  if (!scope) {
    return sites;
  }
  switch (accessScopeType(scope)) {
    case "productLine":
      return seen.productLineIds.includes(scope.productLineId ?? "") ? { assetIds: [scope.productLineId as string] } : sites;
    case "market":
      return !scope.productLineId && seen.marketIds.includes(scope.marketId ?? "") ? { assetIds: [scope.marketId as string] } : sites;
    case "all":
      return seen.marketIds.length ? { assetIds: seen.marketIds } : sites;
    default: {
      const plants = scope.siteIds.filter((id) => seen.siteIds.includes(id));
      return plants.length ? { assetIds: plants } : sites;
    }
  }
}

/** The viewer's source: a tenant administrator's, the tenant's; a user's, by their scope (their server attributes, read once). */
export function viewerAlarmsPerDaySource(ctx: WidgetContext, seen: SeenOrganization): Observable<AlarmsPerDaySource> {
  const user = ctx.currentUser;
  if (isTenantAdmin(ctx)) {
    return of(user?.tenantId ? { tenantId: user.tenantId } : null);
  }
  if (!user?.userId) {
    return of(alarmsPerDaySource(null, seen));
  }
  const keys = ["scopeType", "productLineId", "marketId", "plantIds"];
  const query: EntityDataQuery = {
    entityFilter: { type: AliasFilterType.singleEntity, singleEntity: { entityType: EntityType.USER, id: user.userId } } as any,
    latestValues: keys.map((key) => ({ type: EntityKeyType.SERVER_ATTRIBUTE, key })),
    keyFilters: [],
    pageLink: { page: 0, pageSize: 1 },
  };
  return ctx.entityService.findEntityDataByQuery(query, QUIET_REQUEST).pipe(
    map((page: any) => {
      const a = page?.data?.[0]?.latest?.[EntityKeyType.SERVER_ATTRIBUTE] ?? {};
      return scopeFromAttributes(Object.fromEntries(keys.map((k) => [k, a[k]?.value ?? ""])));
    }),
    catchError(() => of(null)),
    map((scope) => alarmsPerDaySource(scope, seen))
  );
}

/** The source's stored days, summed, as heatmap points (each day at its local noon): null — nothing to read; undefined — the read failed. */
export function loadAlarmsPerDay(ctx: WidgetContext, source: AlarmsPerDaySource): Observable<HeatmapPoint[] | null | undefined> {
  if (!source || ("assetIds" in source && !source.assetIds.length)) {
    return of(null);
  }
  const maps: Observable<unknown[]> =
    "tenantId" in source
      ? ctx.attributeService
          .getEntityAttributes({ entityType: EntityType.TENANT, id: source.tenantId }, AttributeScope.SERVER_SCOPE, [ALARMS_PER_DAY_KEY], QUIET_REQUEST)
          .pipe(map((attrs) => attrs.filter((a) => a.key === ALARMS_PER_DAY_KEY).map((a) => a.value)))
      : ctx.entityService
          .findEntityDataByQuery(
            {
              entityFilter: { type: AliasFilterType.entityList, entityType: EntityType.ASSET, entityList: source.assetIds } as any,
              latestValues: [{ type: EntityKeyType.SERVER_ATTRIBUTE, key: ALARMS_PER_DAY_KEY }],
              keyFilters: [],
              pageLink: { page: 0, pageSize: source.assetIds.length },
            },
            QUIET_REQUEST
          )
          .pipe(map((page: any) => (page?.data ?? []).map((d: any) => d.latest?.[EntityKeyType.SERVER_ATTRIBUTE]?.[ALARMS_PER_DAY_KEY]?.value)));
  return maps.pipe(
    map(sumDays),
    catchError(() => of(undefined))
  );
}

/** Several assets' days added up, one point a day. */
function sumDays(maps: unknown[]): HeatmapPoint[] {
  const days = new Map<string, number>();
  for (const m of maps) {
    for (const [day, n] of Object.entries(parseObject(m))) {
      const value = Number(n);
      if (/^\d{4}-\d{2}-\d{2}$/.test(day) && value > 0) {
        days.set(day, (days.get(day) ?? 0) + value);
      }
    }
  }
  return [...days].map(([day, value]) => {
    const [y, m, d] = day.split("-").map(Number);
    return { ts: new Date(y, m - 1, d, 12).getTime(), value };
  });
}
