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
import { AccessScope, accessScopeType, scopeFromAttributes } from "../access/access.models";
import { AssetRow, lineWithin } from "./organization.models";
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
  /** Their own scope (their scope attributes). */
  scope: AccessScope;
}

/** The users read: each item's own ({@link loadItemUsers}), and every user with a scope (a regional one too). */
export interface ItemUsers {
  byItem: Map<string, ItemUser[]>;
  users: ItemUser[];
}

export const NO_ITEM_USERS: ItemUsers = { byItem: new Map(), users: [] };

/**
 * Each Organization item's users — those whose own scope is it, its default
 * groups' members: a plant's (each of a user's plants), a market's (a market
 * scope, with or without one product line's plants), a product line's — by
 * the item's id, by name; and every user with a scope (a regional one too:
 * {@link usersWithin} counts them where their scope reaches). One without a
 * scope is in neither. Read from the users and their scope attributes (an
 * entity query, a page at a time); a failed read: none.
 */
export function loadItemUsers(ctx: WidgetContext): Observable<ItemUsers> {
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
      const all: ItemUser[] = [];
      for (const row of rows) {
        const a = row.latest?.[EntityKeyType.SERVER_ATTRIBUTE] ?? {};
        const scope = scopeFromAttributes(Object.fromEntries(SCOPE_KEYS.map((k) => [k, a[k]?.value ?? ""])));
        if (!scope) {
          continue;
        }
        const f = row.latest?.[EntityKeyType.ENTITY_FIELD] ?? {};
        const email = String(f["email"]?.value ?? "");
        const name = `${f["firstName"]?.value ?? ""} ${f["lastName"]?.value ?? ""}`.trim() || email;
        const user: ItemUser = { id: row.entityId.id, name, email, scope };
        all.push(user);
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
      return { byItem: users, users: all };
    }),
    catchError(() => of(NO_ITEM_USERS))
  );
}

/**
 * Each product line's or market's users — everyone whose own scope reaches
 * it: scoped to it (a product line's: or to one of its sub product lines, or
 * to a line above it), or to a scope holding any of its sites — a plant of
 * it, a market (a product line's) or a product line (a market's) with sites
 * in it, a regional one (every site). A user whose scope spans several
 * product lines or markets counts under each. By the item's id, by name.
 */
export function usersWithin(kind: "productLine" | "market", users: ItemUser[], items: AssetRow[], productLines: AssetRow[], sites: AssetRow[]): Map<string, ItemUser[]> {
  // Each user's reach: the sites their scope holds — a regional one, every site ("all").
  const reach = users.map((user) => ({ user, sites: reachOf(user.scope, productLines, sites) }));
  const byItem = new Map<string, ItemUser[]>();
  for (const item of items) {
    const itemSites = sites.filter((s) => (kind === "productLine" ? lineWithin(s.productLineId, item.id, productLines) : s.marketId === item.id)).map((s) => s.id);
    const list = reach
      .filter(({ user, sites: r }) => r === "all" || ownScopeIn(kind, user.scope, item.id, productLines) || itemSites.some((id) => r.has(id)))
      .map(({ user }) => user);
    if (list.length) {
      byItem.set(
        item.id,
        list.sort((x, y) => x.name.localeCompare(y.name))
      );
    }
  }
  return byItem;
}

/** The sites a scope holds — "all" for a regional one. */
function reachOf(scope: AccessScope, productLines: AssetRow[], sites: AssetRow[]): Set<string> | "all" {
  switch (accessScopeType(scope)) {
    case "site":
      return new Set(scope.siteIds);
    case "market":
      return new Set(sites.filter((s) => s.marketId === scope.marketId && (!scope.productLineId || lineWithin(s.productLineId, scope.productLineId, productLines))).map((s) => s.id));
    case "productLine":
      return new Set(sites.filter((s) => lineWithin(s.productLineId, scope.productLineId, productLines)).map((s) => s.id));
    default:
      return "all";
  }
}

/**
 * A scope names the item — so it counts there even with no site in it: a product line's, a line scope (or a market's paired with
 * one) that is it, under it or above it; a market's, a market scope that is it.
 */
function ownScopeIn(kind: "productLine" | "market", scope: AccessScope, itemId: string, productLines: AssetRow[]): boolean {
  const type = accessScopeType(scope);
  if (kind === "market") {
    return type === "market" && scope.marketId === itemId;
  }
  return (type === "productLine" || type === "market") && (lineWithin(scope.productLineId, itemId, productLines) || lineWithin(itemId, scope.productLineId, productLines));
}
