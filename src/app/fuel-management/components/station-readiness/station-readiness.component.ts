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
import { Component, Input, OnChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";
import { DataTableCellDirective, DataTableColumn, DataTableComponent } from "../../../components/shared/data-table/data-table.component";
import { StatusPillComponent, StatusPillTone } from "../../../components/shared/status-pill/status-pill.component";
import { TipDirective } from "../../../components/shared/tip/tip.directive";
import { CodeKind, PLC_READINESS_META, PlcReadiness, PlcRow, plcReadiness, plcReadinessHint } from "../../models/fuel-management.models";

/** A PLC with its readiness pill for the selected list. */
interface PlcReadinessRow extends PlcRow {
  label: string;
  icon: string;
  tone: StatusPillTone;
  hint: string;
}

/** The pill shows the least ready of the lists: offline over updating over unknown over ready. */
const READINESS_RANK: Record<PlcReadiness, number> = { ready: 0, unknown: 1, updating: 2, offline: 3 };

/**
 * The "Stations" card of the assign and import forms: a market's PLCs (they
 * hold the pumps' code tables, so every new code goes to each), one per row
 * with a pill saying whether it can take new codes of {@link kinds} right now
 * ({@link plcReadiness}: online and not still loading that list) — for
 * several lists, the least ready one.
 */
@Component({
  selector: "tb-fuel-station-readiness",
  templateUrl: "./station-readiness.component.html",
  styleUrls: ["./station-readiness.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, DataTableComponent, DataTableCellDirective, StatusPillComponent, TipDirective],
})
export class StationReadinessComponent implements OnChanges {
  @Input() plcs: PlcRow[] = [];
  @Input() loading = false;
  /** The lists new codes would go to — the pills follow them. */
  @Input() kinds: CodeKind[] = ["users"];

  readonly columns: DataTableColumn[] = [
    { key: "name", header: "", subtitleKey: "site" },
    { key: "status", header: "", align: "right" },
  ];
  rows: PlcReadinessRow[] = [];

  ngOnChanges(): void {
    const kinds: CodeKind[] = this.kinds.length ? this.kinds : ["users"];
    this.rows = this.plcs.map((plc) => {
      const worst = kinds
        .map((kind) => ({ kind, readiness: plcReadiness(plc, kind) }))
        .reduce((a, b) => (READINESS_RANK[b.readiness] > READINESS_RANK[a.readiness] ? b : a));
      return { ...plc, ...PLC_READINESS_META[worst.readiness], hint: plcReadinessHint(worst.readiness, worst.kind) };
    });
  }
}
