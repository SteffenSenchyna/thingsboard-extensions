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

import { Component, EventEmitter, Input, OnChanges, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";
import { WidgetContext } from "@home/models/widget-component.models";
import { AlarmSubscriptionNotices, AlarmSubscriptionsComponent } from "../alarm-subscriptions/alarm-subscriptions.component";
import { SegmentOption } from "../segmented-control/segmented-control.component";
import { SeverityBarComponent } from "../severity-boxes/severity-bar.component";
import { SeverityBoxesComponent } from "../severity-boxes/severity-boxes.component";
import { TimeframePickerComponent } from "../timeframe-picker/timeframe-picker.component";
import { DataTableCellDirective, DataTableColumn, DataTableComponent } from "../data-table/data-table.component";
import { TB_DATE_AT_TIME } from "../time-format";

/** One alarm in an {@link AlarmListComponent}. */
export interface AlarmListItem {
  id: string;
  createdTime: number;
  /** Originator entity id — groups the list per device in grouped mode. */
  originatorId: string;
  /** Display name of the originator (group card title). */
  originatorName: string;
  /** Muted line under that title in grouped mode — the originator's owning customer. */
  originatorSub?: string;
  type: string;
  /** ThingsBoard severity, UPPER_CASE (CRITICAL / MAJOR / MINOR / WARNING / …). */
  severity: string;
  cleared: boolean;
  /** Optional extra detail shown after the date (e.g. the reading). */
  detailsData?: string;
}

/** One originator's card in grouped mode. */
interface AlarmGroup {
  id: string;
  name: string;
  /** The muted line under the name — the first alarm carrying {@link AlarmListItem.originatorSub}. */
  sub: string;
  rows: AlarmListItem[];
}

/** A device's list's two views (the picker on top). */
const VIEWS: SegmentOption[] = [
  { id: "alarms", label: "Alarms" },
  { id: "notifications", label: "Notifications" },
];

/**
 * Alarm list with a 4-box severity filter (click again to clear) above either one
 * header-less table or, when {@link grouped}, one compact card per originator.
 * Each row shows the type, a segmented severity bar, the date and an optional
 * detail, with a Clear button emitting {@link clear}. A grouped card's title
 * carries {@link AlarmListItem.originatorSub} (its customer) as a sub-label.
 */
@Component({
  selector: "tb-alarm-list",
  templateUrl: "./alarm-list.component.html",
  styleUrls: ["./alarm-list.component.scss"],
  standalone: true,
  imports: [
    CommonModule,
    SharedModule,
    DataTableComponent,
    DataTableCellDirective,
    AlarmSubscriptionsComponent,
    SeverityBarComponent,
    SeverityBoxesComponent,
    TimeframePickerComponent,
  ],
})
export class AlarmListComponent implements OnChanges {
  /** "Sep 21 at 9:05 AM" — the shared 12-hour format. */
  readonly dateFormat = TB_DATE_AT_TIME;
  @Input() alarms: AlarmListItem[] = [];
  @Input() loading = false;
  /**
   * The device whose alarms these are (a device's panel): a picker on top
   * then switches between the alarms and the user's notifications for the
   * device's alarms (`tb-alarm-subscriptions` — it reads through {@link ctx}
   * and says why a pick didn't take in {@link notices}). None: the list alone.
   */
  @Input() deviceId: string | null = null;
  @Input() ctx: WidgetContext | null = null;
  @Input() notices: AlarmSubscriptionNotices | null = null;
  /** One card per originator (titled with its name) instead of a single table. */
  @Input() grouped = false;
  /** Emits the alarm whose Clear button was pressed. */
  @Output() clear = new EventEmitter<AlarmListItem>();

  readonly views = VIEWS;
  /** A device's list: the alarms, or the user's notifications. */
  view = "alarms";
  readonly columns: DataTableColumn[] = [{ key: "alarm", header: "" }];
  severityFilter: string | null = null;
  /** Alarms after the severity filter. */
  filtered: AlarmListItem[] = [];
  /** {@link filtered} grouped per originator, in order of each one's newest alarm. */
  groups: AlarmGroup[] = [];

  ngOnChanges(): void {
    this.apply();
  }

  /** A device's list (its picker and notifications show). */
  get forDevice(): boolean {
    return !!this.ctx && !!this.deviceId;
  }

  setSeverity(value: string | null): void {
    this.severityFilter = value;
    this.apply();
  }

  onClear(alarm: AlarmListItem): void {
    if (!alarm.cleared) {
      this.clear.emit(alarm);
    }
  }

  trackByGroupId(_: number, g: { id: string }): string {
    return g.id;
  }

  severityLabel(severity: string): string {
    return severity ? severity.charAt(0) + severity.slice(1).toLowerCase() : "";
  }

  /** Short readings ("20.2 °C", "95.13%") sit beside the time; anything longer is a message, shown on its own line. */
  isMessage(row: AlarmListItem): boolean {
    return (row.detailsData ?? "").length > 24;
  }

  private apply(): void {
    const f = this.severityFilter;
    this.filtered = f ? this.alarms.filter((a) => (a.severity || "").toUpperCase() === f) : this.alarms;
    const byId = new Map<string, AlarmGroup>();
    for (const a of this.filtered) {
      let g = byId.get(a.originatorId);
      if (!g) {
        g = { id: a.originatorId, name: a.originatorName || "Unknown device", sub: "", rows: [] };
        byId.set(a.originatorId, g);
      }
      if (!g.sub && a.originatorSub) {
        g.sub = a.originatorSub;
      }
      g.rows.push(a);
    }
    this.groups = [...byId.values()];
  }
}
