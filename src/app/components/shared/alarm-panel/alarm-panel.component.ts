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

import { ChangeDetectorRef, Component, DestroyRef, EventEmitter, Input, OnChanges, Output, inject } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { forkJoin, of } from "rxjs";
import { catchError } from "rxjs/operators";
import { AliasFilterType, EntityDataQuery, EntityFilter, EntityKeyType, EntityType } from "@shared/public-api";
import { WidgetContext } from "@home/models/widget-component.models";
import { AlarmListComponent, AlarmListItem } from "../alarm-list/alarm-list.component";
import { LOCATION_KEYS } from "../organization/site-locations";
import { QUIET_REQUEST } from "../value-utils";
import { EntityDetailPanelComponent } from "../entity-detail-panel/entity-detail-panel.component";
import { SegmentOption } from "../segmented-control/segmented-control.component";

/**
 * The alarms side panel every dashboard opens from its bell: the shared side
 * panel, titled "Alarms", holding the shared alarm list with one card per
 * originator — under its name, its site: the `site` server attribute the
 * backend keeps on every device (site-locations.ts), read once per originator
 * (`ctx`). Placed in the dashboard root, like the other side panels.
 */
@Component({
  selector: "tb-alarm-panel",
  standalone: true,
  imports: [EntityDetailPanelComponent, AlarmListComponent],
  template: `
    <tb-entity-detail-panel
      [open]="open"
      icon="notifications"
      name="Alarms"
      [subtitle]="subtitle"
      [tabs]="tabs"
      [dismissible]="true"
      [flushBody]="true"
      (closed)="closed.emit()"
    >
      <div alarms>
        <tb-alarm-list [alarms]="shown" [grouped]="true" [loading]="loading" (clear)="clear.emit($event)"></tb-alarm-list>
      </div>
    </tb-entity-detail-panel>
  `,
  // No box of its own: the side panel positions itself against the dashboard root.
  styles: [":host { display: contents; }"],
})
export class AlarmPanelComponent implements OnChanges {
  /** The dashboard's widget context: each originator's site is read through it (none: the alarms as given). */
  @Input() ctx: WidgetContext | null = null;
  @Input() open = false;
  /** The alarms in scope, each named as the dashboard shows its originator (`originatorName` / `originatorSub`). */
  @Input() alarms: AlarmListItem[] = [];
  @Input() loading = false;
  /** Muted line under the panel's title. */
  @Input() subtitle = "";
  /** The panel was dismissed (its close button, or Escape). */
  @Output() closed = new EventEmitter<void>();
  /** The alarm whose Clear button was pressed. */
  @Output() clear = new EventEmitter<AlarmListItem>();

  readonly tabs: SegmentOption[] = [{ id: "alarms", label: "Alarms", icon: "notifications", tooltip: "Alarms" }];

  /** The alarms as listed: each under its originator's site (once read; "" for none). */
  shown: AlarmListItem[] = [];
  /** Each originator's site, by id — read once (live alarm updates don't read it again). */
  private readonly sites = new Map<string, string>();
  private readonly asked = new Set<string>();
  private readonly cd = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  ngOnChanges(): void {
    this.readSites();
    this.relabel();
  }

  private relabel(): void {
    this.shown = this.ctx ? this.alarms.map((a) => ({ ...a, originatorSub: this.sites.get(a.originatorId) ?? "" })) : this.alarms;
  }

  /** The sites of the originators not read yet: one entity query a type (devices, assets). */
  private readSites(): void {
    const ctx = this.ctx;
    if (!ctx) {
      return;
    }
    const ids = [...new Set(this.alarms.map((a) => a.originatorId).filter((id) => !!id && !this.asked.has(id)))];
    if (!ids.length) {
      return;
    }
    ids.forEach((id) => this.asked.add(id));
    const query = (entityType: EntityType): EntityDataQuery => ({
      entityFilter: { type: AliasFilterType.entityList, entityType, entityList: ids } as EntityFilter,
      entityFields: [],
      latestValues: [{ type: EntityKeyType.SERVER_ATTRIBUTE, key: LOCATION_KEYS.site }],
      keyFilters: [],
      pageLink: { page: 0, pageSize: ids.length },
    });
    forkJoin([EntityType.DEVICE, EntityType.ASSET].map((t) => ctx.entityService.findEntityDataByQuery(query(t), QUIET_REQUEST).pipe(catchError(() => of({ data: [] as any[] })))))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((pages) => {
        for (const page of pages) {
          for (const d of page.data as any[]) {
            this.sites.set(d.entityId.id, String(d.latest?.[EntityKeyType.SERVER_ATTRIBUTE]?.[LOCATION_KEYS.site]?.value ?? ""));
          }
        }
        this.relabel();
        this.cd.detectChanges();
      });
  }
}
