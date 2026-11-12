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


import { ChangeDetectorRef, Component, DestroyRef, Input, OnChanges, SimpleChanges, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { of } from "rxjs";
import { catchError } from "rxjs/operators";
import { EntityId, SharedModule } from "@shared/public-api";
import { WidgetContext } from "@home/models/widget-component.models";
import { DataTableColumn, DataTableComponent } from "../../../components/shared/data-table/data-table.component";
import { QUIET_REQUEST } from "../../../components/shared/value-utils";
import { KeyValueRow, keyValueRow } from "./entity-tabs.models";

/** An entity's Latest telemetry tab: every time-series key with its latest value and when (read-only), and Refresh. */
@Component({
  selector: "tb-entity-telemetry",
  template: `<tb-data-table title="Latest telemetry" icon="timeline" [compactHeader]="true" [searchEnabled]="false" [columns]="columns"
                   [rows]="rows" [loading]="loading" [paginated]="false" trackByKey="key" [sortable]="true" emptyText="No telemetry"
                   emptyIcon="timeline" loadingText="Loading telemetry…">
      <div dt-footer class="et-links"><button type="button" class="et-link" [disabled]="loading" (click)="load()">Refresh</button></div>
    </tb-data-table>`,
  styleUrls: ["./entity-telemetry.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, DataTableComponent],
})
export class EntityTelemetryComponent implements OnChanges {
  @Input() ctx!: WidgetContext;
  @Input() entityId!: EntityId;

  rows: KeyValueRow[] = [];
  loading = true;
  readonly columns: DataTableColumn[] = [
    { key: "key", header: "Key", maxWidth: "150px" },
    { key: "value", header: "Value", maxWidth: "170px" },
    { key: "when", header: "Updated", sortKey: "ts" },
  ];

  private readonly cd = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["entityId"]) {
      this.load();
    }
  }

  load(): void {
    this.loading = true;
    this.ctx.attributeService
      .getEntityTimeseriesLatest(this.entityId, undefined, true, QUIET_REQUEST)
      .pipe(
        catchError(() => of({})),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((data: Record<string, { ts: number; value: unknown }[]>) => {
        this.rows = Object.entries(data ?? {})
          .map(([key, values]) => keyValueRow(key, values?.[0]?.value, values?.[0]?.ts))
          .sort((a, b) => a.key.localeCompare(b.key));
        this.loading = false;
        this.cd.detectChanges();
      });
  }
}
