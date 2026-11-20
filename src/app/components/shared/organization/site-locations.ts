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


import { Observable, forkJoin, of } from "rxjs";
import { catchError, map } from "rxjs/operators";
import { AliasFilterType, EntityDataQuery, EntityFilter, EntityKeyType } from "@shared/public-api";
import { WidgetContext } from "@home/models/widget-component.models";
import { byNamePageLink } from "../dashboard/dashboard-subscriptions";
import { QUIET_REQUEST } from "../value-utils";

/**
 * Where a device is, as the backend keeps it — server attributes holding the
 * codes (asset names) of its site, market and product line: the "Device Site
 * Attributes" rule chain sets them when a relation is added or removed (from
 * its parents: a site, a market or product line, a truck, the gateway that
 * created it), and the "Propagate …" calculated fields carry a rename or a
 * move down to every device below. Read them with the device — never walk the
 * relations to place one.
 */
export const LOCATION_KEYS = { site: "site", market: "market", productLine: "productLine" } as const;

export interface LocationSettings {
  siteAssetType: string;
  marketAssetType: string;
  productLineAssetType: string;
}

export const DEFAULT_LOCATION_SETTINGS: LocationSettings = {
  siteAssetType: "Site",
  marketAssetType: "Market",
  productLineAssetType: "ProductLine",
};

/** An Organization asset: its id, the name it shows by (its label, else its name) and its code (the asset's name). */
export interface NamedAsset {
  id: string;
  name: string;
  code: string;
}

/** The Organization's assets by kind — to show a device's location codes by their labels. */
export interface OrganizationNames {
  productLines: NamedAsset[];
  markets: NamedAsset[];
  sites: NamedAsset[];
}

/** A site as a filter names it: its label with its code in brackets, so the search finds it by either. */
export function siteLocationLabel(site: NamedAsset): string {
  return site.code && site.code !== site.name ? `${site.name} (${site.code})` : site.name;
}

/** The assets of one Organization kind (its asset type), named — one entity query; none it may read: empty. */
export function loadNamedAssets(ctx: WidgetContext, assetType: string): Observable<NamedAsset[]> {
  const query: EntityDataQuery = {
    entityFilter: { type: AliasFilterType.assetType, assetTypes: [assetType] } as EntityFilter,
    entityFields: [
      { type: EntityKeyType.ENTITY_FIELD, key: "name" },
      { type: EntityKeyType.ENTITY_FIELD, key: "label" },
    ],
    latestValues: [],
    keyFilters: [],
    pageLink: byNamePageLink(),
  };
  return ctx.entityService.findEntityDataByQuery(query, QUIET_REQUEST).pipe(
    map((page) =>
      page.data.map((d: any) => {
        const f = d.latest?.[EntityKeyType.ENTITY_FIELD] ?? {};
        const code = String(f["name"]?.value ?? "");
        return { id: d.entityId.id as string, name: String(f["label"]?.value || code), code };
      })
    ),
    catchError(() => of([] as NamedAsset[]))
  );
}

/** The Organization's product lines, markets and sites, named (one entity query each). */
export function loadOrganizationNames(ctx: WidgetContext, settings: LocationSettings = DEFAULT_LOCATION_SETTINGS): Observable<OrganizationNames> {
  const named = (assetType: string) => loadNamedAssets(ctx, assetType);
  return forkJoin({ productLines: named(settings.productLineAssetType), markets: named(settings.marketAssetType), sites: named(settings.siteAssetType) });
}
