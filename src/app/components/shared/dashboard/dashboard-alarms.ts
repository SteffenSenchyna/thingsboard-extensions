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
import type { AlarmService } from "@core/http/alarm.service";
import {
  AlarmSearchStatus,
  DataKeyType,
  Datasource,
  DatasourceType,
  Direction,
  EntityFilter,
  EntityKeyType,
  KeyFilter,
  RealtimeWindowType,
  TimewindowType,
  widgetType,
} from "@shared/public-api";
import { WidgetContext } from "@home/models/widget-component.models";
import { AlarmListItem } from "../alarm-list/alarm-list.component";
import type { StatusPillTone } from "../status-pill/status-pill.component";
import type { SegmentOption } from "../segmented-control/segmented-control.component";

// The alarms of every dashboard: one live subscription over its devices'
// ACTIVE alarms, read into the shared alarm list's items, and one way to clear
// an alarm from a list.

/** An alarm as a dashboard holds it: the alarm list's item, with its acknowledged flag and its details always set. */
export interface DashboardAlarm extends AlarmListItem {
  acknowledged: boolean;
  detailsData: string;
}

/** What {@link subscribeActiveAlarms} needs from a dashboard. */
export interface ActiveAlarmsQuery {
  /** The entities whose alarms are read. */
  entityFilter: EntityFilter;
  /** Key filters narrowing those entities (the gateway dashboard's "is a gateway"). */
  keyFilters?: KeyFilter[];
  /** The subscription once it exists — keep it, to remove it with the dashboard. */
  onSubscribed: (subscription: any) => void;
  /** The alarms, on the first read and on every change after. */
  onUpdated: (alarms: DashboardAlarm[]) => void;
  /** The alarm query failed (some instances refuse it for customer users). */
  onError?: () => void;
}

const TEN_YEARS_MS = 10 * 365 * 24 * 60 * 60 * 1000;

/**
 * Subscribes to the ACTIVE alarms of the query's entities. A REALTIME window
 * (not history) keeps it streaming — new alarms appear and cleared ones drop
 * out without a refresh — and its wide interval surfaces alarms of any age.
 */
export function subscribeActiveAlarms(ctx: WidgetContext, destroyRef: DestroyRef, query: ActiveAlarmsQuery): void {
  const alarmSource: Datasource = {
    type: DatasourceType.entity,
    name: "alarms",
    entityFilter: query.entityFilter,
    ...(query.keyFilters ? { keyFilters: query.keyFilters } : {}),
    dataKeys: [
      { name: "createdTime", label: "createdTime", type: DataKeyType.alarm, settings: {} },
      { name: "type", label: "type", type: DataKeyType.alarm, settings: {} },
      { name: "severity", label: "severity", type: DataKeyType.alarm, settings: {} },
    ],
  };
  const options: WidgetSubscriptionOptions = {
    type: widgetType.alarm,
    alarmSource,
    useDashboardTimewindow: false,
    timeWindowConfig: {
      selectedTab: TimewindowType.REALTIME,
      realtime: { realtimeType: RealtimeWindowType.LAST_INTERVAL, timewindowMs: TEN_YEARS_MS },
    },
    callbacks: {
      onDataUpdated: (subscription) => query.onUpdated(toDashboardAlarms(subscription)),
      ...(query.onError
        ? {
            onDataUpdateError: () => query.onError(),
            onSubscriptionMessage: (_: unknown, message: any) => {
              if (message?.severity === "error") {
                query.onError();
              }
            },
          }
        : {}),
    },
  };
  ctx.subscriptionApi
    .createSubscription(options, false)
    .pipe(takeUntilDestroyed(destroyRef))
    .subscribe((subscription) => {
      query.onSubscribed(subscription);
      subscription.subscribeForAlarms(
        {
          pageSize: 1024,
          page: 0,
          sortOrder: { key: { type: EntityKeyType.ALARM_FIELD, key: "createdTime" }, direction: Direction.DESC },
          searchPropagatedAlarms: true,
          typeList: [],
          statusList: [AlarmSearchStatus.ACTIVE],
          severityList: [],
        },
        query.keyFilters ?? null
      );
    });
}

/** An alarm subscription's alarms as the dashboards (and the shared alarm list) read them. */
export function toDashboardAlarms(subscription: any): DashboardAlarm[] {
  return (subscription?.alarms?.data ?? []).map((a: any) => toDashboardAlarm(a));
}

/** One ThingsBoard alarm (from a subscription, or the REST API) as a {@link DashboardAlarm}. */
export function toDashboardAlarm(a: any): DashboardAlarm {
  const raw = a.details?.data;
  return {
    id: a.id?.id ?? a.id,
    createdTime: a.createdTime,
    originatorId: a.originator?.id ?? a.originatorId ?? "",
    // The originator's display name / label, falling back to its name.
    originatorName: a.originatorDisplayName || a.originatorLabel || a.originatorName || "",
    type: a.type,
    severity: a.severity,
    acknowledged: !!(a.acknowledged ?? a.ackTs > 0),
    cleared: !!(a.cleared ?? a.clearTs > 0),
    detailsData: raw == null ? "" : typeof raw === "object" ? JSON.stringify(raw) : String(raw),
  };
}

/** Active (uncleared) alarms per originator id — a table's Alarms column. */
export function countAlarmsByOriginator(alarms: AlarmListItem[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const a of alarms) {
    if (a.originatorId && !a.cleared) {
      counts.set(a.originatorId, (counts.get(a.originatorId) ?? 0) + 1);
    }
  }
  return counts;
}

/** Alarm severities, worst first (ThingsBoard's, UPPER_CASE). */
const SEVERITY_ORDER = ["CRITICAL", "MAJOR", "MINOR", "WARNING"];

/** A severity's rank: critical 4, major 3, minor 2, warning 1, anything else 0 — the worst of several is the highest. */
export function alarmSeverityRank(severity: string): number {
  const i = SEVERITY_ORDER.indexOf((severity || "").toUpperCase());
  return i < 0 ? 0 : SEVERITY_ORDER.length - i;
}

/** A severity on the shared status scale's ramp: critical → error, major → major, minor → minor, warning → warning; else neutral. */
export function alarmSeverityTone(severity: string): StatusPillTone {
  const tones: StatusPillTone[] = ["neutral", "warning", "minor", "major", "error"];
  return tones[alarmSeverityRank(severity)];
}

/** Options of {@link clearDashboardAlarm}. */
export interface ClearAlarmOptions {
  /** Other copies of the alarm (the subscription's own item behind a list's copy) marked along with it. */
  also?: Array<{ cleared: boolean } | null | undefined>;
  /** The request's config (the dashboards that report failures in their own toast pass `ignoreErrors`). */
  config?: Parameters<AlarmService["clearAlarm"]>[1];
  /** The clear failed and the marks were taken back. */
  onError?: (err: any) => void;
}

/**
 * Clears an alarm from a list: marked cleared at once (the list greys it out
 * and the live subscription then drops it), taken back if the request fails.
 */
export function clearDashboardAlarm(alarmService: AlarmService, destroyRef: DestroyRef, alarm: { id: string; cleared: boolean }, options: ClearAlarmOptions = {}): void {
  if (alarm.cleared) {
    return;
  }
  const marked = [alarm, ...(options.also ?? [])].filter((a): a is { cleared: boolean } => !!a);
  marked.forEach((a) => (a.cleared = true));
  alarmService
    .clearAlarm(alarm.id, options.config)
    .pipe(takeUntilDestroyed(destroyRef))
    .subscribe({
      error: (err) => {
        marked.forEach((a) => (a.cleared = false));
        options.onError?.(err);
      },
    });
}

/**
 * The Alarms tab of a details panel's button group (`tb-segmented-control` — a panel's tabs, `tb-entity-detail-panel`'s
 * `[tabs]`): the bell, its badge the count of the entity's active alarms (none: no badge) — the same on every
 * dashboard's panel. `alarms`: the alarms its tab lists (the cleared ones left out of the count), or their count.
 *
 * ```ts
 * get detailTabs(): SegmentOption[] {
 *   return [INSIGHTS_TAB, alarmsTab(this.detailAlarms), SETTINGS_TAB];
 * }
 * ```
 */
export function alarmsTab(alarms: readonly AlarmListItem[] | number | null | undefined): SegmentOption {
  const count = typeof alarms === "number" ? alarms : (alarms ?? []).filter((a) => !a.cleared).length;
  return { id: "alarms", label: "Alarms", icon: "notifications", tooltip: "Alarms", badge: count };
}
