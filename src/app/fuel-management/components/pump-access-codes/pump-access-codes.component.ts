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
import {
  AccessCode,
  AccessCodeRow,
  CODE_KINDS,
  CodeKind,
  codeKindLabel,
  codeLimitReason,
  CodesSyncState,
  MarketNode,
  toAccessCodeRow,
} from "../../models/fuel-management.models";

/**
 * The pump detail panel's Codes tab: the codes of the pump's market — a
 * Users | Vehicles toggle over that list (copy box + holder + when added, with a
 * revoke button), the market's capacity against its limits (its most
 * restrictive pump's) and an "Assign code" action. Presentational — the
 * dashboard performs the writes.
 */
@Component({
  selector: "tb-fuel-pump-access-codes",
  templateUrl: "./pump-access-codes.component.html",
  styleUrls: ["./pump-access-codes.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, CopyBoxComponent, DataTableComponent, DataTableCellDirective, SplitToggleComponent, StatusPillComponent],
})
export class PumpAccessCodesComponent implements OnChanges {
  /** The pump's market (null when the pump isn't in a fuel-management market). */
  @Input() market: MarketNode | null = null;
  /** Which list is shown. */
  @Input() kind: CodeKind = "users";
  /** The pump's code sync (Synced / Desynced pill in the card's corner; hidden when null). */
  @Input() sync: CodesSyncState = null;
  /** Disable the controls while a write is in flight. */
  @Input() saving = false;
  @Output() kindChange = new EventEmitter<CodeKind>();
  @Output() revoke = new EventEmitter<AccessCode>();
  @Output() assign = new EventEmitter<void>();

  readonly kinds = CODE_KINDS;
  readonly columns: DataTableColumn[] = [{ key: "code", header: "" }];
  rows: AccessCodeRow[] = [];

  /** Users + vehicles — every pump in the market holds them all. */
  get total(): number {
    return this.market ? this.market.codes.users.length + this.market.codes.vehicles.length : 0;
  }

  /** Codes in the shown list. */
  get kindCount(): number {
    return this.market?.codes[this.kind].length ?? 0;
  }

  /** The shown list has its own cap below the total (else only the total is shown). */
  get kindCapped(): boolean {
    return !!this.market && this.market.limits[this.kind] < this.market.limits.total;
  }

  get kindLabel(): string {
    return codeKindLabel(this.kind).toLowerCase();
  }

  /** Why "Assign code" is disabled (the total or the shown list is at its limit), or null. */
  get limitReason(): string | null {
    return this.market ? codeLimitReason(this.market.codes, this.market.limits, this.kind) : null;
  }

  get emptyText(): string {
    return this.market ? "No codes" : "This pump isn't in a fuel-management market";
  }

  ngOnChanges(): void {
    this.rows = (this.market?.codes[this.kind] ?? []).map(toAccessCodeRow);
  }
}
