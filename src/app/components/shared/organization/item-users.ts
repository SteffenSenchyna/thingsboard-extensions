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
import { catchError, expand, map, reduce } from "rxjs/operators";
import { AliasFilterType, EntityDataQuery, EntityKeyType, EntityType } from "@shared/public-api";
import { WidgetContext } from "@home/models/widget-component.models";
import { accessScopeType, scopeFromAttributes } from "../access/access.models";
import { QUIET_REQUEST } from "../value-utils";

/** The users' scope attributes (Access writes them on each user) — where a user counts. */
const SCOPE_KEYS = ["scopeType", "productLineId", "marketId", "plantIds"];
const PAGE_SIZE = 2000;

/** A user of an Organization item (the item panel's Users tab). */
export interface ItemUser {
  id: string;
  /** "First Last", else their email. */
  name: string;
  email: string;
}

/**
 * Each Organization item's users — those whose own scope is it, its default
 * groups' members: a plant's (each of a user's plants), a market's (a market
 * scope, with or without one product line's plants), a product line's — by
 * the item's id, by name. A regional user, or one without a scope, is at
 * none. Read from the users and their scope attributes (an entity query, a
 * page at a time); a failed read: none.
 */
export function loadItemUsers(ctx: WidgetContext): Observable<Map<string, ItemUser[]>> {
  const page = (n: number) => {
    const query: EntityDataQuery = {
      entityFilter: { type: AliasFilterType.entityType, entityType: EntityType.USER } as any,
      entityFields: ["firstName", "lastName", "email"].map((key) => ({ type: EntityKeyType.ENTITY_FIELD, key })),
      latestValues: SCOPE_KEYS.map((key) => ({ type: EntityKeyType.SERVER_ATTRIBUTE, key })),
      keyFilters: [],
      pageLink: { page: n, pageSize: PAGE_SIZE },
    };
    return ctx.entityService.findEntityDataByQuery(query, QUIET_REQUEST).pipe(map((result: any) => ({ n, result })));
  };
  return page(0).pipe(
    expand(({ n, result }) => (result?.hasNext ? page(n + 1) : of())),
    reduce((rows, { result }) => rows.concat(result?.data ?? []), [] as any[]),
    map((rows) => {
      const users = new Map<string, ItemUser[]>();
      for (const row of rows) {
        const a = row.latest?.[EntityKeyType.SERVER_ATTRIBUTE] ?? {};
        const scope = scopeFromAttributes(Object.fromEntries(SCOPE_KEYS.map((k) => [k, a[k]?.value ?? ""])));
        if (!scope) {
          continue;
        }
        const f = row.latest?.[EntityKeyType.ENTITY_FIELD] ?? {};
        const email = String(f["email"]?.value ?? "");
        const name = `${f["firstName"]?.value ?? ""} ${f["lastName"]?.value ?? ""}`.trim() || email;
        const user: ItemUser = { id: row.entityId.id, name, email };
        const add = (id: string | null) => id && users.set(id, [...(users.get(id) ?? []), user]);
        switch (accessScopeType(scope)) {
          case "site":
            new Set(scope.siteIds).forEach((id) => add(id));
            break;
          case "market":
            add(scope.marketId);
            break;
          case "productLine":
            add(scope.productLineId);
            break;
        }
      }
      users.forEach((list) => list.sort((x, y) => x.name.localeCompare(y.name)));
      return users;
    }),
    catchError(() => of(new Map<string, ItemUser[]>()))
  );
}
