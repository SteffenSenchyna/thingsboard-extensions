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

import { ChangeDetectorRef, Component, DestroyRef, EventEmitter, Input, OnChanges, Output, SimpleChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { CalloutComponent } from "../../../../components/shared/callout/callout.component";
import { DataTableCellDirective, DataTableColumn, DataTableComponent } from "../../../../components/shared/data-table/data-table.component";
import { StatusPillComponent } from "../../../../components/shared/status-pill/status-pill.component";
import { TableLinkComponent, TableLinksComponent } from "../../../../components/shared/table-links/table-links.component";
import { formatDateTime } from "../../../../components/shared/time-format";
import { ToastTone } from "../../../../components/shared/toasts/toasts.component";
import { EsfCallError, ESF_RPC, parseEsfSnapshots } from "../../../models/esf.models";
import { EsfClient, EsfConfirm, esfReason, esfSubscribe } from "../../../models/esf-api.models";

/** A snapshot's row: its id (ESF's: the time it was taken, in ms — 0 the configuration the unit started with) and its label. */
interface SnapshotRow {
  key: string;
  id: number;
  when: string;
  latest: boolean;
}

/** A snapshot's name: the time it was taken, snapshot 0 the unit's first configuration. */
export function esfSnapshotLabel(id: number): string {
  return id === 0 ? "Initial configuration" : formatDateTime(id);
}

/**
 * The ESF unit's configuration snapshots (Configuration v2 — `rest.configuration`), newest first: ESF takes one after each change
 * applied from the dashboard. "Take snapshot" saves the configuration as it is now; a row's "Rollback" (confirmed) puts the
 * unit's whole configuration back to that snapshot — from ESF 7.6.3 only for a user with `kura.admin`, which the gateway's ESF
 * user doesn't have unless it's given: ESF's refusal says so.
 */
@Component({
  selector: "tb-gm-esf-snapshots",
  templateUrl: "./esf-snapshots.component.html",
  styleUrls: ["./esf-snapshots.component.scss"],
  standalone: true,
  imports: [CommonModule, CalloutComponent, DataTableComponent, DataTableCellDirective, StatusPillComponent, TableLinkComponent, TableLinksComponent],
})
export class EsfSnapshotsComponent implements OnChanges {
  @Input() client: EsfClient | null = null;
  @Input() gatewayName = "";
  @Output() notify = new EventEmitter<{ tone: ToastTone; message: string }>();
  @Output() confirm = new EventEmitter<EsfConfirm>();

  readonly columns: DataTableColumn[] = [
    { key: "when", phone: "title", header: "Snapshot", emphasis: "strong" },
    { key: "latest", phone: "sub", header: "" },
    { key: "action", phone: "trail", header: "", align: "right" },
  ];

  rows: SnapshotRow[] = [];
  loading = false;
  error = "";
  /** "Take snapshot" running. */
  taking = false;
  /** The snapshot a rollback is running for (null none). */
  rollingBack: number | null = null;

  constructor(
    private cd: ChangeDetectorRef,
    private destroyRef: DestroyRef
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["client"]) {
      this.rows = [];
      this.load();
    }
  }

  get busy(): boolean {
    return this.taking || this.rollingBack !== null;
  }

  /** The unit's snapshots read (again): the rows shown kept while it's read. */
  load(): void {
    const client = this.client;
    if (!client) {
      return;
    }
    this.loading = true;
    this.error = "";
    esfSubscribe(
      client.call(ESF_RPC.listSnapshots),
      this.destroyRef,
      (reply) => {
        if (client === this.client) {
          this.loading = false;
          this.rows = parseEsfSnapshots(reply).map((id, i) => ({ key: String(id), id, when: esfSnapshotLabel(id), latest: i === 0 }));
          this.cd.markForCheck();
        }
      },
      (reason) => {
        if (client === this.client) {
          this.loading = false;
          this.rows = [];
          this.error = reason;
          this.cd.markForCheck();
        }
      }
    );
  }

  /** "Take snapshot": the unit's configuration as it is now saved as a new snapshot. */
  takeSnapshot(): void {
    if (!this.client || this.busy) {
      return;
    }
    this.taking = true;
    esfSubscribe(
      this.client.call(ESF_RPC.takeSnapshot),
      this.destroyRef,
      () => {
        this.taking = false;
        this.notify.emit({ tone: "success", message: "Settings applied" });
        this.load();
      },
      (reason) => {
        this.taking = false;
        this.notify.emit({ tone: "error", message: `Couldn't take a snapshot: ${reason}` });
        this.cd.markForCheck();
      }
    );
  }

  /** A row's "Rollback": confirmed first — every component of the unit goes back to the snapshot's settings. */
  askRollback(row: SnapshotRow): void {
    if (this.busy) {
      return;
    }
    this.confirm.emit({
      heading: "Roll back configuration?",
      message:
        `${this.gatewayName || "The unit"}'s whole configuration goes back to the snapshot of ${row.when}. ESF applies every component's ` +
        `settings again, which can briefly cut the unit off, the gateway too.`,
      confirmLabel: "Rollback",
      danger: true,
      run: () => this.rollback(row),
    });
  }

  private rollback(row: SnapshotRow): void {
    if (!this.client || this.busy) {
      return;
    }
    this.rollingBack = row.id;
    this.cd.markForCheck();
    this.client
      .call(ESF_RPC.rollbackSnapshot, { id: row.id })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.rollingBack = null;
          this.notify.emit({ tone: "success", message: "Settings applied" });
          this.load();
        },
        error: (err) => {
          this.rollingBack = null;
          const message =
            err instanceof EsfCallError && err.status === 403
              ? "ESF refused the rollback (403): from ESF 7.6.3 a rollback needs the kura.admin permission, which the gateway's ESF user lacks."
              : `Couldn't roll back: ${esfReason(err)}`;
          this.notify.emit({ tone: "error", message });
          this.cd.markForCheck();
        },
      });
  }
}
