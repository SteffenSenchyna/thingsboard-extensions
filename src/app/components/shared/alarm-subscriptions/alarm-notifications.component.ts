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

import { ChangeDetectorRef, Component, DestroyRef, DoCheck, HostBinding, Input } from "@angular/core";
import { CommonModule } from "@angular/common";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { AliasFilterType, EntityDataQuery, EntityFilter, EntityKeyType, EntityType, User } from "@shared/public-api";
import { WidgetContext } from "@home/models/widget-component.models";
import { DataTableCellDirective, DataTableColumn, DataTableComponent } from "../data-table/data-table.component";
import { RoundToggleComponent } from "../round-toggle/round-toggle.component";
import { TipDirective } from "../tip/tip.directive";
import { alarmSeverityRank } from "../dashboard/dashboard-alarms";
import { SeverityBoxesComponent } from "../severity-boxes/severity-boxes.component";
import { QUIET_REQUEST } from "../value-utils";
import { ownProfileOf } from "../alarm-chat/own-profile";
import { ALARM_CHAT_SEVERITIES, parseAlarmChat } from "../alarm-chat/alarm-chat.models";
import { notificationPanelOf } from "../alarm-chat/notification-panel";

/**
 * Every alarm notification the signed-in user has set, in one table — the
 * Settings page's Account section shows it under their profile: a row an
 * alarm of a device — the device, the alarm, where they're told (Google
 * Chat, Email) and at which severities. A row opens that device's
 * notifications in the side panel (`tb-alarm-notification-panel`, in the
 * dashboard root): the same form its own panel has, to change them or turn
 * them off. A device they can no longer read shows as unavailable (nothing
 * is sent for it; its notifications can still be turned off).
 *
 * ```html
 * <tb-alarm-notifications [ctx]="ctx"></tb-alarm-notifications>
 * ```
 */
@Component({
  selector: "tb-alarm-notifications",
  templateUrl: "./alarm-notifications.component.html",
  styleUrls: ["./alarm-notifications.component.scss"],
  standalone: true,
  imports: [CommonModule, DataTableComponent, DataTableCellDirective, SeverityBoxesComponent, RoundToggleComponent, TipDirective],
})
export class AlarmNotificationsComponent implements DoCheck {
  @HostBinding("attr.title") readonly hostTitle: string | null = null;
  @Input() ctx!: WidgetContext;

  readonly columns: DataTableColumn[] = [
    { key: "device", header: "Device", emphasis: "strong" },
    { key: "alarm", header: "Alarm" },
    { key: "channels", header: "Sent to", sortValue: (row) => row["channels"] },
    // The mildest severity first, then how many.
    { key: "severities", header: "Severities", nowrap: true, sortValue: (row) => row["severityOrder"] },
  ];
  rows: Record<string, any>[] = [];
  loading = true;
  /** The devices' names, by id (null: asked for, none came — unreadable or gone). */
  private names = new Map<string, string | null>();
  /** The row whose device the panel shows (highlighted while it's open). */
  selectedId: string | null = null;
  private seenUser: User | null | undefined;
  private asked = false;

  constructor(
    private readonly cd: ChangeDetectorRef,
    private readonly destroyRef: DestroyRef
  ) {}

  /** The rows, from the user's record as last read or saved (the Account page reads it; a save here or in a device's panel replaces it). */
  ngDoCheck(): void {
    if (!this.ctx) {
      return;
    }
    const profile = ownProfileOf(this.ctx);
    if (!this.asked) {
      this.asked = true;
      profile
        .load()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => this.cd.markForCheck(),
          error: () => {
            this.loading = false;
            this.cd.markForCheck();
          },
        });
    }
    // The highlight goes with the panel.
    if (this.selectedId && !notificationPanelOf(this.ctx).open) {
      this.selectedId = null;
    }
    if (profile.user === this.seenUser) {
      return;
    }
    this.seenUser = profile.user;
    if (profile.user) {
      this.build();
    }
  }

  /** A row: its device's notifications, in the side panel. */
  open(row: Record<string, any>): void {
    this.selectedId = row["id"];
    notificationPanelOf(this.ctx).show(row["deviceId"], row["device"]);
  }

  private build(): void {
    const picks = parseAlarmChat(ownProfileOf(this.ctx).info);
    const ids = Object.keys(picks);
    this.rows = ids
      .flatMap((deviceId) =>
        Object.entries(picks[deviceId]).map(([type, pick]) => ({
          id: `${deviceId}|${type}`,
          deviceId,
          device: this.names.get(deviceId) ?? (this.names.has(deviceId) ? "Unavailable device" : "…"),
          alarm: type,
          chat: pick.chat,
          email: pick.email,
          // (In words: its sort.)
          channels: [...(pick.chat ? ["Google Chat"] : []), ...(pick.email ? ["Email"] : [])].join(", "),
          // (None named: every severity — all its boxes, lit.)
          severityList: pick.severities.length ? pick.severities : [...ALARM_CHAT_SEVERITIES],
          severityOrder: pick.severities.length ? `${Math.min(...pick.severities.map((s) => alarmSeverityRank(s)))}|${pick.severities.length}` : "0|0",
        }))
      )
      .sort((a, b) => a.device.localeCompare(b.device, undefined, { numeric: true }) || a.alarm.localeCompare(b.alarm));
    const unknown = ids.filter((id) => !this.names.has(id));
    if (!unknown.length) {
      this.loading = false;
      return;
    }
    // The devices' names (their labels where they have one): those the user can read.
    const query: EntityDataQuery = {
      entityFilter: { type: AliasFilterType.entityList, entityType: EntityType.DEVICE, entityList: unknown } as EntityFilter,
      entityFields: [
        { type: EntityKeyType.ENTITY_FIELD, key: "name" },
        { type: EntityKeyType.ENTITY_FIELD, key: "label" },
      ],
      latestValues: [],
      pageLink: { page: 0, pageSize: Math.max(unknown.length, 1) },
    };
    unknown.forEach((id) => this.names.set(id, null));
    this.ctx.entityService
      .findEntityDataByQuery(query, QUIET_REQUEST)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          for (const row of page?.data ?? []) {
            const field = row.latest?.[EntityKeyType.ENTITY_FIELD] ?? {};
            this.names.set(row.entityId.id, String(field["label"]?.value || field["name"]?.value || "") || null);
          }
          this.loading = false;
          this.build();
          this.cd.markForCheck();
        },
        error: () => {
          this.loading = false;
          this.build();
          this.cd.markForCheck();
        },
      });
  }
}
