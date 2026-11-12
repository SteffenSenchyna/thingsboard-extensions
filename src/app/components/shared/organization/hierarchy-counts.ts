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
import { AliasFilterType, EntityDataQuery, EntityKeyType } from "@shared/public-api";
import { WidgetContext } from "@home/models/widget-component.models";
import { byNamePageLink } from "../dashboard/dashboard-subscriptions";
import { QUIET_REQUEST, parseNumber } from "../value-utils";

/**
 * The time series the hierarchy's calculated fields keep, so no dashboard
 * walks the relations to count devices: "Hierarchy device counts" on the
 * Site, Market, ProductLine and RMX Truck asset profiles (each child: a device
 * counts 1 and what its gateway created, an asset what it counts) and "Created
 * device counts" / "Mark created devices" on the gateways' device profiles.
 * A product line keeps only what it holds itself (`lineDevices`: its sites',
 * trucks', devices') — ThingsBoard never re-runs a calculated field for its
 * own output, so a line can't sum its sub lines'.
 */
export const HIERARCHY_COUNT_KEYS = {
  devices: "devices",
  online: "devicesOnline",
  lineDevices: "lineDevices",
  lineOnline: "lineDevicesOnline",
} as const;

/** A site's, market's or product line's devices (and how many are online), as stored. */
export interface HierarchyCount {
  id: string;
  /** Its code ("RMX", "4R20"). */
  name: string;
  label: string;
  devices: number;
  online: number;
}

export interface HierarchyCounts {
  sites: HierarchyCount[];
  markets: HierarchyCount[];
  /** Each line's own: its sub lines not included. */
  productLines: HierarchyCount[];
}

export interface HierarchyCountSettings {
  siteAssetType: string;
  marketAssetType: string;
  productLineAssetType: string;
}

/** The stored counts of every site, market and product line (one entity query each; none stored yet reads 0). */
export function loadHierarchyCounts(ctx: WidgetContext, settings: HierarchyCountSettings): Observable<HierarchyCounts> {
  const read = (assetType: string, devicesKey: string, onlineKey: string): Observable<HierarchyCount[]> => {
    const query: EntityDataQuery = {
      entityFilter: { type: AliasFilterType.assetType, assetTypes: [assetType], assetNameFilter: "" } as any,
      entityFields: [
        { type: EntityKeyType.ENTITY_FIELD, key: "name" },
        { type: EntityKeyType.ENTITY_FIELD, key: "label" },
      ],
      latestValues: [
        { type: EntityKeyType.TIME_SERIES, key: devicesKey },
        { type: EntityKeyType.TIME_SERIES, key: onlineKey },
      ],
      keyFilters: [],
      pageLink: byNamePageLink(),
    };
    return ctx.entityService.findEntityDataByQuery(query, QUIET_REQUEST).pipe(
      map((page) =>
        page.data.map((d: any) => {
          const f = d.latest?.[EntityKeyType.ENTITY_FIELD] ?? {};
          const ts = d.latest?.[EntityKeyType.TIME_SERIES] ?? {};
          return {
            id: d.entityId.id as string,
            name: String(f["name"]?.value ?? ""),
            label: String(f["label"]?.value ?? ""),
            devices: parseNumber(ts[devicesKey]?.value) ?? 0,
            online: parseNumber(ts[onlineKey]?.value) ?? 0,
          };
        })
      ),
      catchError(() => of([] as HierarchyCount[]))
    );
  };
  const k = HIERARCHY_COUNT_KEYS;
  return forkJoin({
    sites: read(settings.siteAssetType, k.devices, k.online),
    markets: read(settings.marketAssetType, k.devices, k.online),
    productLines: read(settings.productLineAssetType, k.lineDevices, k.lineOnline),
  });
}
