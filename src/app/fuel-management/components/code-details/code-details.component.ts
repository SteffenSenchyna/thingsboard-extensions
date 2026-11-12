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

import { Component, EventEmitter, HostBinding, Input, OnChanges, Output, SimpleChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";
import { CollapsibleCardComponent } from "../../../components/shared/collapsible-card/collapsible-card.component";
import { CopyBoxComponent } from "../../../components/shared/copy-box/copy-box.component";
import { DataTableCellDirective, DataTableColumn, DataTableComponent } from "../../../components/shared/data-table/data-table.component";
import { StatGridComponent, StatItem } from "../../../components/shared/stat-grid/stat-grid.component";
import { StatusPillComponent } from "../../../components/shared/status-pill/status-pill.component";
import { TimeframePickerComponent } from "../../../components/shared/timeframe-picker/timeframe-picker.component";
import { SegmentOption } from "../../../components/shared/segmented-control/segmented-control.component";
import { formatWhen, relativeTime } from "../../../components/shared/time-format";
import { fmtNumber } from "../../../components/shared/value-utils";
import { AccessCodeRow, CodeActivityRow, CODE_USAGE_TIMEFRAMES } from "../../models/fuel-management.models";

/**
 * A code panel's Insights tab: the code — hidden but its last two digits
 * until shown (the copy button copies it either way) — and what it is
 * (status, list, market, sites, expiry, added when and by whom); its use over
 * the picked window (dispenses, litres, denials, its last dispense); and its
 * activity — its dispenses and denials at its scope's pumps in the window,
 * and its changes (assigned, edited, suspended, …), newest first, as a
 * compact list (an entry an event: its pill, when and where, its litres).
 */
@Component({
  selector: "tb-fuel-code-details",
  templateUrl: "./code-details.component.html",
  styleUrls: ["./code-details.component.scss"],
  standalone: true,
  imports: [
    CommonModule,
    SharedModule,
    CollapsibleCardComponent,
    CopyBoxComponent,
    DataTableComponent,
    DataTableCellDirective,
    StatGridComponent,
    StatusPillComponent,
    TimeframePickerComponent,
  ],
})
export class CodeDetailsComponent implements OnChanges {
  /** No native tooltip (a `title` attribute set on it by mistake). */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;
  @Input() row: AccessCodeRow | null = null;
  /** Where it works ("All sites in GEA", "Richmond Lab (4R20)"). */
  @Input() scope = "";
  /** Who assigned it (its "Code assigned" event's), "" unknown. */
  @Input() addedBy = "";
  /** Its events: use in {@link timeframe}, its changes whenever; newest first. */
  @Input() events: CodeActivityRow[] = [];
  @Input() loading = false;
  /** A pump had more events in the window than are read: its oldest are left out. */
  @Input() capped = false;
  /** The usage window ({@link CODE_USAGE_TIMEFRAMES}). */
  @Input() timeframe = "1M";
  @Output() timeframeChange = new EventEmitter<string>();

  readonly timeframeOptions: SegmentOption[] = CODE_USAGE_TIMEFRAMES.map((t) => ({ id: t.id, label: t.id }));
  /** The Activity list's one column: the event's entry. */
  readonly activityColumns: DataTableColumn[] = [{ key: "entry", header: "" }];
  /** The keypad code shown in full (reset to hidden for each code). */
  revealed = false;
  details: StatItem[] = [];
  usage: StatItem[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    const prev = changes["row"]?.previousValue as AccessCodeRow | null | undefined;
    if (changes["row"] && prev?.source.assetId !== this.row?.source.assetId) {
      this.revealed = false;
    }
    this.build();
  }

  toggleReveal(): void {
    this.revealed = !this.revealed;
  }

  private build(): void {
    const r = this.row;
    if (!r) {
      this.details = [];
      this.usage = [];
      return;
    }
    this.details = [
      { label: "Status", pill: r.statusMeta },
      { label: "Type", value: r.type },
      { label: "Market", value: r.marketCode },
      { label: "Sites", value: this.scope || r.siteCode },
      { label: "Expires", value: r.expires || "Never" },
      { label: "Added", value: formatWhen(r.source.createdAt || null) },
      { label: "Added by", value: this.addedBy || "—" },
    ];
    const shown = (text: string) => (this.loading ? "…" : text);
    const dispenses = this.events.filter((e) => e.type === "dispense");
    const litres = dispenses.reduce((sum, e) => sum + (e.volume ?? 0), 0);
    const denied = this.events.filter((e) => e.group === "denied").length;
    this.usage = [
      { label: "Dispenses", value: shown(fmtNumber(dispenses.length)) },
      { label: "Fuel dispensed", value: shown(fmtNumber(litres, litres > 0 && litres < 100 && !Number.isInteger(litres) ? 1 : 0)), unit: "L" },
      { label: "Denied", value: shown(fmtNumber(denied)) },
      { label: "Last dispense", value: shown(dispenses.length ? relativeTime(dispenses[0].ts) : "—") },
    ];
  }
}
