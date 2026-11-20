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

import { EMPTY, Observable, of } from "rxjs";
import { catchError, expand, map, mergeMap, reduce } from "rxjs/operators";
import { defaultHttpOptionsFromConfig } from "@core/public-api";
import { AggregationType, EntityType } from "@shared/public-api";
import { WidgetContext } from "@home/models/widget-component.models";
import { DashboardAlarm, alarmSeverityTone, toDashboardAlarm, uniqueAlarms } from "../dashboard/dashboard-alarms";
import { isTenantAdmin } from "../dashboard/dashboard-preferences";
import { QUIET_REQUEST } from "../value-utils";
import type { StatusPillTone } from "../status-pill/status-pill.component";

// What a dashboard's Time Machine (`tb-time-machine`) shows: its events (a mark each — an alarm, a device going offline) and the
// stretches something was down (hatched on its track), and how a dashboard reads them for its devices over the window.

/** One mark on the timeline: what happened, when, in its tone. */
export interface TimeMachineEvent {
  /** Stable id (the marks are tracked by it). */
  id: string;
  /** When it happened (epoch ms) — where its mark sits. */
  ts: number;
  /** What happened — an alarm's type, "Offline": its row's name in the bubble (the charts' tooltip). */
  label: string;
  /**
   * What it happened to — a device and its site, "RMC Tank 02 · Richmond Lab (4R20)" ({@link timeMachineSubject}): the bubble's
   * title when its rows share it, else its row's value.
   */
  subject?: string;
  /** Its tone on the status scale (an alarm's: `alarmSeverityTone`); neutral — the grey of an Offline pill. */
  tone: StatusPillTone;
  /** The Material Symbols icon on its tile. */
  icon: string;
}

/** A stretch something was down (a device offline): hatched on the track, named in its bubble (a row, as an event's). */
export interface TimeMachineSpan {
  id: string;
  start: number;
  end: number;
  /** What it was — "Offline": its row's name. */
  label: string;
  /** What was down — a device and its site ({@link timeMachineSubject}): the bubble's title when its rows share it, else its row's value. */
  subject?: string;
}

/**
 * What a Time Machine event happened to: the device, then its site by its label with its code — "RMC Tank 02 · Richmond Lab
 * (4R20)" (`siteLocationLabel`'s format); no site, the device alone. Its bubble's title (one device), or each row's value.
 */
export function timeMachineSubject(device: string, site: string): string {
  return [device, site].filter((part) => !!part?.trim()).join(" · ");
}

/** The icon of an alarm's mark: the alarms' bell (the rail's Alarms, a panel's Alarms tab). */
export const TIME_MACHINE_ALARM_ICON = "notifications";
/** The icon of a device going offline. */
export const TIME_MACHINE_OFFLINE_ICON = "cloud_off";
/** The icon of a device coming back online (its mark green, the status scale's success). */
export const TIME_MACHINE_ONLINE_ICON = "cloud";

/** A tenant administrator's alarm reads: pages of this many, at most this many pages. */
const ALARM_PAGE = 1000;
const ALARM_PAGES = 20;
/** Devices read at a time (their alarms, their readings). */
const DEVICE_READS = 6;

function quiet(params: Record<string, string>): { headers: any; params: any } {
  return defaultHttpOptionsFromConfig({ ...QUIET_REQUEST, queryParams: params });
}

/**
 * The alarms the devices raised in the window (created in it, any status) — a tenant administrator's the tenant's
 * (`/api/v2/alarms`, a page at a time, kept to the devices), anyone else's device by device (`/api/v2/alarm/DEVICE/…` — the
 * alarm query the server refuses them). A failed read reads as none (a device's: its alarms), so a caller never waits on it.
 */
export function readAlarmsInWindow(ctx: WidgetContext, deviceIds: readonly string[], start: number, end: number): Observable<DashboardAlarm[]> {
  if (!deviceIds.length) {
    return of([]);
  }
  const window = { startTime: String(Math.floor(start)), endTime: String(Math.ceil(end)) };
  if (isTenantAdmin(ctx)) {
    const ids = new Set(deviceIds);
    const page = (n: number) =>
      ctx.http
        .get<{ data: any[]; hasNext: boolean }>(
          "/api/v2/alarms",
          quiet({ ...window, pageSize: String(ALARM_PAGE), page: String(n), sortProperty: "createdTime", sortOrder: "DESC" })
        )
        .pipe(catchError(() => of({ data: [] as any[], hasNext: false })));
    // Newest first, a page at a time: an alarm raised meanwhile shifts the pages, so one may come twice — kept once.
    return page(0).pipe(
      expand((res, i) => (res?.hasNext && i + 1 < ALARM_PAGES ? page(i + 1) : EMPTY)),
      reduce((all, res) => {
        (res?.data ?? [])
          .filter((a) => a?.originator?.entityType === EntityType.DEVICE && ids.has(a.originator.id))
          .map(toDashboardAlarm)
          .forEach((a) => all.set(a.id, a));
        return all;
      }, new Map<string, DashboardAlarm>()),
      map((byId) => [...byId.values()])
    );
  }
  return of(...deviceIds).pipe(
    mergeMap(
      (id) =>
        ctx.http.get<{ data: any[] }>(`/api/v2/alarm/DEVICE/${id}`, quiet({ ...window, pageSize: String(ALARM_PAGE), page: "0" })).pipe(
          map((res) => (res?.data ?? []).map(toDashboardAlarm)),
          catchError(() => of([] as DashboardAlarm[]))
        ),
      DEVICE_READS
    ),
    reduce((all, list) => all.concat(list), [] as DashboardAlarm[]),
    // Each alarm once: a propagated one (a pump's, on its station's PLC) is listed under each device it reaches.
    map((all) => uniqueAlarms(all))
  );
}

/**
 * The marks of alarms: at their start, in their severity's tone (their bubble rows' bar), named by their type, with what raised
 * them — `subjectOf`: its device and its site, "RMC Tank 02 · Richmond Lab (4R20)" ({@link timeMachineSubject}).
 */
export function alarmEvents(alarms: readonly DashboardAlarm[], subjectOf: (alarm: DashboardAlarm) => string): TimeMachineEvent[] {
  return alarms.map((a) => ({
    id: `alarm:${a.id}`,
    ts: a.createdTime,
    label: a.type,
    subject: subjectOf(a),
    tone: alarmSeverityTone(a.severity),
    icon: TIME_MACHINE_ALARM_ICON,
  }));
}

/**
 * When each device's readings came in over the window — one read a device (its own keys), a few at a time: its readings' times,
 * ascending. A long window (a week, a month) is read by `bucket` (ms): each bucket's count of readings (ThingsBoard's own COUNT,
 * at most a few hundred buckets — it refuses past 700), its times the buckets with any (each bucket's middle). A failed read reads
 * as none for that device (so it isn't taken for offline: left out).
 */
export function readReadingTimes(
  ctx: WidgetContext,
  devices: readonly { id: string; keys: string[] }[],
  start: number,
  end: number,
  bucket = 0
): Observable<Map<string, number[]>> {
  if (!devices.length) {
    return of(new Map<string, number[]>());
  }
  return of(...devices).pipe(
    mergeMap(
      (d) =>
        ctx.attributeService
          .getEntityTimeseries(
            { entityType: EntityType.DEVICE, id: d.id },
            d.keys,
            start,
            end,
            bucket ? 1000 : 5000,
            bucket ? AggregationType.COUNT : AggregationType.NONE,
            bucket || undefined,
            undefined,
            true,
            QUIET_REQUEST
          )
          .pipe(
            map((data) => {
              const series = data as Record<string, { ts: number; value: unknown }[]>;
              const times = [
                ...new Set(
                  d.keys.flatMap((k) => (series?.[k] ?? []).filter((p) => !bucket || Number(p.value) > 0).map((p) => Number(p.ts))).filter((t) => isFinite(t))
                ),
              ];
              return [d.id, times.sort((a, b) => a - b)] as [string, number[] | null];
            }),
            catchError(() => of([d.id, null] as [string, number[] | null]))
          ),
      DEVICE_READS
    ),
    reduce((all, [id, times]) => (times ? all.set(id, times) : all), new Map<string, number[]>())
  );
}

/**
 * The stretches a device sent nothing in the window: a gap between two readings (or before its first, after its last) longer
 * than `maxGap` — offline from when its next reading was due (`interval` after the last) to its next reading, or to the window's
 * end. A device with no reading at all in the window: offline throughout.
 */
export function offlineStretches(times: readonly number[], start: number, end: number, interval: number, maxGap: number): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  if (!times.length) {
    return [{ start, end }];
  }
  if (times[0] - start > maxGap) {
    out.push({ start, end: times[0] });
  }
  for (let i = 1; i < times.length; i++) {
    if (times[i] - times[i - 1] > maxGap) {
      out.push({ start: times[i - 1] + interval, end: times[i] });
    }
  }
  const last = times[times.length - 1];
  if (end - last > maxGap) {
    out.push({ start: last + interval, end });
  }
  return out;
}
