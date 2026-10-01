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
import { CopyBoxComponent } from "../../../components/shared/copy-box/copy-box.component";
import { DataTableCellDirective, DataTableColumn, DataTableComponent } from "../../../components/shared/data-table/data-table.component";
import { SplitToggleComponent } from "../../../components/shared/split-toggle/split-toggle.component";
import { StatusPillComponent } from "../../../components/shared/status-pill/status-pill.component";
import { CODE_KIND_TOGGLE, CodeKind, CodesSyncState, MarketNode, PumpCodeSlots } from "../../models/fuel-management.models";

/** One filled slot of the pump's code list. */
interface PumpCodeRow {
  /** 1-based slot number in the pump's fixed-length list (the row's track key). */
  slot: number;
  code: string;
  /** The code's holder (its market code asset's label); "" when unknown. */
  holder: string;
}

/**
 * The pump detail panel's Codes tab — read-only: the codes sent to the pump
 * (its SHARED user / vehicle code lists, the same values the Synced / Desynced
 * pill checks), Users | Vehicles, one row per filled slot (copy box + holder)
 * and how many slots are used. Codes are added and revoked in the
 * Access codes view.
 */
@Component({
  selector: "tb-fuel-pump-access-codes",
  templateUrl: "./pump-access-codes.component.html",
  styleUrls: ["./pump-access-codes.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, CopyBoxComponent, DataTableComponent, DataTableCellDirective, SplitToggleComponent, StatusPillComponent],
})
export class PumpAccessCodesComponent implements OnChanges {
  /** The pump's code slots as sent to it (null when unknown). */
  @Input() slots: PumpCodeSlots | null = null;
  /** The pump's market — names each code's holder from its code assets. */
  @Input() market: MarketNode | null = null;
  /** Which list is shown. */
  @Input() kind: CodeKind = "users";
  /** The pump's code sync (Synced / Desynced pill in the card's corner; hidden when null). */
  @Input() sync: CodesSyncState = null;
  @Output() kindChange = new EventEmitter<CodeKind>();

  readonly kinds = CODE_KIND_TOGGLE;
  readonly columns: DataTableColumn[] = [{ key: "code", header: "" }];
  rows: PumpCodeRow[] = [];

  /** Slots in the shown list (the pump's fixed length). */
  get slotCount(): number {
    return this.slots?.[this.kind].length ?? 0;
  }

  ngOnChanges(): void {
    const holders = new Map((this.market?.codes[this.kind] ?? []).map((c) => [c.code, c.name] as [string, string]));
    this.rows = (this.slots?.[this.kind] ?? [])
      .map((code, i) => ({ slot: i + 1, code, holder: holders.get(code) ?? "" }))
      .filter((r) => r.code !== "");
  }
}
