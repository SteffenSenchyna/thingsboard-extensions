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
import { AccessCode, AccessCodeRow, CODE_KINDS, CodeKind, MarketNode, toAccessCodeRow } from "../../models/fuel-management.models";

/**
 * The pump detail panel's Codes tab: the codes of the pump's market — a
 * Users | Vehicles toggle over that list (copy box + name + expiry, with a
 * revoke button), the market's "n / max codes" capacity and an "Assign code"
 * action. Presentational — the dashboard performs the writes.
 */
@Component({
  selector: "tb-fuel-pump-access-codes",
  templateUrl: "./pump-access-codes.component.html",
  styleUrls: ["./pump-access-codes.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, CopyBoxComponent, DataTableComponent, DataTableCellDirective, SplitToggleComponent],
})
export class PumpAccessCodesComponent implements OnChanges {
  /** The pump's market (null when the pump isn't in a fuel-management market). */
  @Input() market: MarketNode | null = null;
  /** Which list is shown. */
  @Input() kind: CodeKind = "users";
  /** Disable the controls while a write is in flight. */
  @Input() saving = false;
  /** Most codes a pump (so its market) can hold — "Assign code" disables at the cap. */
  @Input() maxCodes = 50;
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

  get full(): boolean {
    return this.total >= this.maxCodes;
  }

  get emptyText(): string {
    return this.market ? "No codes" : "This pump isn't in a fuel-management market";
  }

  ngOnChanges(): void {
    this.rows = (this.market?.codes[this.kind] ?? []).map(toAccessCodeRow);
  }
}
