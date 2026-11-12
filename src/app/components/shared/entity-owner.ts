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

import { EntityKey, EntityKeyType } from "@shared/public-api";

/**
 * The entity-data-query fields that name an entity's owner (ThingsBoard PE):
 * spread into a query's `entityFields`, then read the row with
 * {@link ownerCustomer}. Every dashboard shows the owner the same way (the
 * Customer column and filter, the alarms panel's sub-label, …), so the lookup
 * lives here rather than per dashboard.
 */
export const OWNER_ENTITY_FIELDS: EntityKey[] = [
  { type: EntityKeyType.ENTITY_FIELD, key: "ownerType" },
  { type: EntityKeyType.ENTITY_FIELD, key: "ownerName" },
];

/**
 * The owner's title from a query row's ENTITY_FIELD values
 * (`d.latest[EntityKeyType.ENTITY_FIELD]`): the owning customer's, or the
 * tenant's own when it owns the entity ("" only when the row names no owner).
 */
export function ownerCustomer(fields: Record<string, { value?: unknown } | undefined>): string {
  const type = fields["ownerType"]?.value;
  return type === "CUSTOMER" || type === "TENANT" ? String(fields["ownerName"]?.value ?? "") : "";
}

/** The tenant itself owns the entity (its {@link ownerCustomer} is the tenant's title). */
export function ownerIsTenant(fields: Record<string, { value?: unknown } | undefined>): boolean {
  return fields["ownerType"]?.value === "TENANT";
}
