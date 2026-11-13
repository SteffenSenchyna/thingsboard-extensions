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
import { EntityType } from "@shared/public-api";
import { WidgetContext } from "@home/models/widget-component.models";
import { SegmentOption } from "../../../components/shared/segmented-control/segmented-control.component";
import { QUIET_REQUEST } from "../../../components/shared/value-utils";

/** What the page lists: the tenant's devices, or its assets. */
export type EntityKind = "device" | "asset";

export const ENTITY_TYPE_OF: Record<EntityKind, EntityType> = { device: EntityType.DEVICE, asset: EntityType.ASSET };

/** One device or asset of the table (a page of them, from the server). */
export interface EntityRow {
  id: string;
  kind: EntityKind;
  name: string;
  label: string;
  profile: string;
  /** The owner's title — a customer's, or the tenant's own. */
  owner: string;
  /** Its site's code (the `site` server attribute the backend keeps); "" for none. */
  site: string;
  /** A device: whether it's active (its `active` server attribute); an asset: null. */
  active: boolean | null;
  createdTime: number | null;
  created: string;
  description: string;
}

/** A device's status filter. */
export type EntityStatus = "active" | "inactive";

/** The sidebar's filters: the search box's terms, the profiles, a device's status (none picked = all). */
export interface EntityFilters {
  search: string[];
  profiles: string[];
  statuses: EntityStatus[];
}

export const NO_ENTITY_FILTERS: EntityFilters = { search: [], profiles: [], statuses: [] };

/** The Details form's values: a new one's, or the edited one's. */
export interface EntityDraft {
  name: string;
  label: string;
  /** Its profile's id. */
  profileId: string;
  /** Its owner: "" for the tenant, else a customer's id. */
  ownerId: string;
  /** A device's Site — "" none; absent: not picked here (a device a gateway created goes where its gateway is). */
  siteId?: string;
  description: string;
}

/** The Details tab's pickers: a profile, an owner. */
export interface EntityOption {
  value: string;
  label: string;
}

/** The side panel's one tab, as a profile's: Details. */
export const ENTITY_PANEL_TABS: SegmentOption[] = [{ id: "details", label: "Details", icon: "info", tooltip: "Details" }];

/** A device's / asset's name as its panel and its toasts say it: its label, else its name. */
export function entityNameOf(row: { name: string; label: string }): string {
  return row.label || row.name;
}

/** Deletes these devices / assets: whether each one went (one that couldn't, false). */
export function deleteEntities(ctx: WidgetContext, rows: { id: string; kind: EntityKind }[]): Observable<boolean[]> {
  if (!rows.length) {
    return of([]);
  }
  return forkJoin(
    rows.map((r) =>
      (r.kind === "device" ? ctx.deviceService.deleteDevice(r.id, QUIET_REQUEST) : ctx.assetService.deleteAsset(r.id, QUIET_REQUEST)).pipe(
        map(() => true),
        catchError(() => of(false))
      )
    )
  );
}
