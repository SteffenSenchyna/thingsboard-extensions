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
import { CardComponent } from "../../../components/shared/card/card.component";
import { CopyBoxComponent } from "../../../components/shared/copy-box/copy-box.component";
import { DataTableCellDirective, DataTableColumn, DataTableComponent } from "../../../components/shared/data-table/data-table.component";
import { SwitchComponent } from "../../../components/shared/switch/switch.component";
import { AccessCode, PumpRow, formatExpiry, holderTypeLabel } from "../../models/fuel-management.models";

interface AssignedCodeRow {
  code: string;
  holder: string;
  /** "Driver · Expires Dec 31" */
  meta: string;
  source: AccessCode;
}

/**
 * The pump detail panel's Access codes tab: a "Require access code" switch, the
 * codes assigned to the pump (copy box + holder, with a revoke button), and an
 * "Assign code" action. Presentational — the dashboard performs the writes.
 */
@Component({
  selector: "tb-fuel-pump-access-codes",
  templateUrl: "./pump-access-codes.component.html",
  styleUrls: ["./pump-access-codes.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, CardComponent, CopyBoxComponent, DataTableComponent, DataTableCellDirective, SwitchComponent],
})
export class PumpAccessCodesComponent implements OnChanges {
  @Input() pump!: PumpRow;
  /** Disable the controls while a write is in flight. */
  @Input() saving = false;
  @Output() requireCodeChange = new EventEmitter<boolean>();
  @Output() revoke = new EventEmitter<AccessCode>();
  @Output() assign = new EventEmitter<void>();

  readonly columns: DataTableColumn[] = [{ key: "code", header: "" }];
  rows: AssignedCodeRow[] = [];

  ngOnChanges(): void {
    this.rows = (this.pump?.accessCodes ?? []).map((c) => ({
      code: c.code,
      holder: c.holder || "—",
      meta: `${holderTypeLabel(c.holderType)} · ${c.expiresAt == null ? "No expiry" : "Expires " + formatExpiry(c.expiresAt)}`,
      source: c,
    }));
  }
}
