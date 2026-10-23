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
  type: string;
  /** ThingsBoard severity, UPPER_CASE (CRITICAL / MAJOR / MINOR / WARNING / …). */
  severity: string;
  cleared: boolean;
  /** Optional extra detail shown after the date (e.g. the reading). */
  detailsData?: string;
}

/** Severity filter options (value matches the alarm severity). */
const SEVERITIES = [
  { value: "WARNING", label: "Warning" },
  { value: "MINOR", label: "Minor" },
  { value: "MAJOR", label: "Major" },
  { value: "CRITICAL", label: "Critical" },
];

/**
 * Alarm list with a 4-box severity filter (click again to clear) above either one
 * header-less table or, when {@link grouped}, one compact card per originator.
 * Each row shows the type, a segmented severity bar, the date and an optional
 * detail, with a Clear button emitting {@link clear}.
 */
@Component({
  selector: "tb-alarm-list",
  templateUrl: "./alarm-list.component.html",
  styleUrls: ["./alarm-list.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, DataTableComponent, DataTableCellDirective],
})
export class AlarmListComponent implements OnChanges {
  /** "Sep 21 at 9:05 AM" — the shared 12-hour format. */
  readonly dateFormat = TB_DATE_AT_TIME;
  @Input() alarms: AlarmListItem[] = [];
  @Input() loading = false;
  /** One card per originator (titled with its name) instead of a single table. */
  @Input() grouped = false;
  /** Emits the alarm whose Clear button was pressed. */
  @Output() clear = new EventEmitter<AlarmListItem>();

  readonly severities = SEVERITIES;
  readonly columns: DataTableColumn[] = [{ key: "alarm", header: "" }];
  severityFilter: string | null = null;
  /** Alarms after the severity filter. */
  filtered: AlarmListItem[] = [];
  /** {@link filtered} grouped per originator, in order of each one's newest alarm. */
  groups: { id: string; name: string; rows: AlarmListItem[] }[] = [];

  ngOnChanges(): void {
    this.apply();
  }

  toggleSeverity(value: string): void {
    this.severityFilter = this.severityFilter === value ? null : value;
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

  severityClass(severity: string): string {
    return (severity || "").toLowerCase();
  }

  /** Filled segments (1–4) for the severity bar. */
  severityRank(severity: string): number {
    switch ((severity || "").toUpperCase()) {
      case "CRITICAL":
        return 4;
      case "MAJOR":
        return 3;
      case "MINOR":
        return 2;
      default:
        return 1; // WARNING / INDETERMINATE
    }
  }

  private apply(): void {
    const f = this.severityFilter;
    this.filtered = f ? this.alarms.filter((a) => (a.severity || "").toUpperCase() === f) : this.alarms;
    const byId = new Map<string, { id: string; name: string; rows: AlarmListItem[] }>();
    for (const a of this.filtered) {
      let g = byId.get(a.originatorId);
      if (!g) {
        g = { id: a.originatorId, name: a.originatorName || "Unknown device", rows: [] };
        byId.set(a.originatorId, g);
      }
      g.rows.push(a);
    }
    this.groups = [...byId.values()];
  }
}
