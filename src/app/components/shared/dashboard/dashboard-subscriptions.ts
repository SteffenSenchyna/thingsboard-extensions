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

import { DestroyRef } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { WidgetSubscriptionOptions } from "@core/public-api";
import { DataKeyType, Datasource, DatasourceType, Direction, EntityDataPageLink, EntityFilter, EntityKeyType, KeyFilter, widgetType } from "@shared/public-api";
import { WidgetContext } from "@home/models/widget-component.models";

// The live refresh of every dashboard's tables: ThingsBoard's entity query is
// a one-off read, so a "latest values" subscription over the same entities
// tells the dashboard when to read again.

/** The page link of a dashboard's entity query: one page of `pageSize` entities, sorted by name. */
export function byNamePageLink(pageSize = 1024, page = 0): EntityDataPageLink {
  return { pageSize, page, sortOrder: { key: { type: EntityKeyType.ENTITY_FIELD, key: "name" }, direction: Direction.ASC } };
}

/** What {@link subscribeLatestChanges} watches. */
export interface LatestChangesSource {
  /** The entities watched. */
  entityFilter: EntityFilter;
  /** Key filters narrowing those entities. */
  keyFilters?: KeyFilter[];
  /** Attribute keys (any scope) whose change counts. */
  attributes?: string[];
  /** Time series keys whose change counts. */
  timeseries?: string[];
}

/**
 * A live "latest values" subscription over the source's keys that calls
 * `onChange` whenever one of them changes. The first emission is skipped — it
 * only repeats what the dashboard's own load has just read. `onSubscribed`
 * hands over the subscription, to remove with the dashboard
 * ({@link removeSubscriptions}).
 */
export function subscribeLatestChanges(
  ctx: WidgetContext,
  destroyRef: DestroyRef,
  source: LatestChangesSource,
  onChange: () => void,
  onSubscribed: (subscription: any) => void
): void {
  const key = (type: DataKeyType) => (name: string) => ({ name, label: name, type, settings: {} });
  const datasources: Datasource[] = [
    {
      type: DatasourceType.entity,
      name: "changes",
      entityFilter: source.entityFilter,
      ...(source.keyFilters ? { keyFilters: source.keyFilters } : {}),
      dataKeys: [...(source.attributes ?? []).map(key(DataKeyType.attribute)), ...(source.timeseries ?? []).map(key(DataKeyType.timeseries))],
    },
  ];
  let firstEmission = true;
  const options: WidgetSubscriptionOptions = {
    type: widgetType.latest,
    datasources,
    callbacks: {
      onDataUpdated: () => {
        if (firstEmission) {
          firstEmission = false;
          return;
        }
        onChange();
      },
    },
  };
  ctx.subscriptionApi
    .createSubscription(options, true)
    .pipe(takeUntilDestroyed(destroyRef))
    .subscribe((subscription) => onSubscribed(subscription));
}

/** Removes the widget subscriptions a dashboard / card created (the ones that exist). */
export function removeSubscriptions(ctx: WidgetContext, ...subscriptions: Array<{ id: string } | null | undefined>): void {
  for (const subscription of subscriptions) {
    if (subscription) {
      ctx.subscriptionApi.removeSubscription(subscription.id);
    }
  }
}
