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
import { NgIf, NgTemplateOutlet } from "@angular/common";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { Observable, forkJoin, of } from "rxjs";
import { catchError, map, shareReplay } from "rxjs/operators";
import { AliasFilterType, EntityDataQuery, EntityFilter, EntityKeyType, EntityType } from "@shared/public-api";
import { WidgetContext } from "@home/models/widget-component.models";
import { AlarmListComponent, AlarmListItem } from "../alarm-list/alarm-list.component";
import { DEFAULT_LOCATION_SETTINGS, LOCATION_KEYS, loadNamedAssets, siteLocationLabel } from "../organization/site-locations";
import { QUIET_REQUEST } from "../value-utils";
import { EntityDetailPanelComponent } from "../entity-detail-panel/entity-detail-panel.component";
import { SegmentOption } from "../segmented-control/segmented-control.component";
import { BottomSheetComponent } from "../bottom-sheet/bottom-sheet.component";
import { DashboardRootDirective } from "../dashboard/dashboard-root.directive";

/**
 * The alarms side panel every dashboard opens from its bell: the shared side
 * panel, titled "Alarms", holding the shared alarm list with one card per
 * originator — under its name, its site by its label and code ("Richmond Lab
 * (4R20)", as the filters name a site): the `site` server attribute the
 * backend keeps on every device (site-locations.ts), read once per originator,
 * named from the Site assets (read once, with the first originators' — a site
 * the viewer can't read shows by its code) (`ctx`). Placed in the dashboard
 * root, like the other side panels. On a phone (the dashboard root's `tb-phone`) it opens in `tb-bottom-sheet from="right"`:
 * from the right edge still, the window's height, its left corners rounded — swiped right, it closes.
 */
@Component({
  selector: "tb-alarm-panel",
  standalone: true,
  imports: [NgIf, NgTemplateOutlet, EntityDetailPanelComponent, AlarmListComponent, BottomSheetComponent],
  template: `
    <!-- A phone: a panel from the right edge (as on a wider screen), its corners rounded, swiped right to close. -->
    <tb-bottom-sheet *ngIf="phone; else side" from="right" [open]="open" icon="notifications" title="Alarms" [subtitle]="subtitle"
                     (closed)="closed.emit()">
      <ng-container *ngTemplateOutlet="list"></ng-container>
    </tb-bottom-sheet>
    <ng-template #side>
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
        <div alarms><ng-container *ngTemplateOutlet="list"></ng-container></div>
      </tb-entity-detail-panel>
    </ng-template>
    <ng-template #list>
      <tb-alarm-list [alarms]="shown" [grouped]="true" [loading]="loading" (clear)="clear.emit($event)"></tb-alarm-list>
    </ng-template>
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
  /** Each originator's site as it's shown ("Richmond Lab (4R20)"), by id — read once (live alarm updates don't read it again). */
  private readonly sites = new Map<string, string>();
  /** The Site assets' names by code ("4R20" → "Richmond Lab (4R20)") — read once, with the first originators' sites. */
  private siteNames$: Observable<Map<string, string>> | null = null;
  private readonly asked = new Set<string>();
  private readonly cd = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  /** The dashboard's root: on a phone, the panel from the right edge (`tb-bottom-sheet from="right"`). */
  private readonly root = inject(DashboardRootDirective, { optional: true });

  constructor() {
    this.root?.changes.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.cd.detectChanges());
  }

  /** Laid out for a phone: `tb-bottom-sheet from="right"`, not the side panel. */
  get phone(): boolean {
    return !!this.root?.phone;
  }

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
    this.siteNames$ ??= loadNamedAssets(ctx, DEFAULT_LOCATION_SETTINGS.siteAssetType).pipe(
      map((sites) => new Map(sites.map((s) => [s.code, siteLocationLabel(s)]))),
      shareReplay(1)
    );
    const pages$ = [EntityType.DEVICE, EntityType.ASSET].map((t) =>
      ctx.entityService.findEntityDataByQuery(query(t), QUIET_REQUEST).pipe(catchError(() => of({ data: [] as any[] })))
    );
    // The sites and their names together, so a card's site shows once, named (never its code, then its name).
    forkJoin({ names: this.siteNames$, pages: forkJoin(pages$) })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ names, pages }) => {
        for (const page of pages) {
          for (const d of page.data as any[]) {
            const code = String(d.latest?.[EntityKeyType.SERVER_ATTRIBUTE]?.[LOCATION_KEYS.site]?.value ?? "");
            this.sites.set(d.entityId.id, (code && names.get(code)) || code);
          }
        }
        this.relabel();
        this.cd.detectChanges();
      });
  }
}
