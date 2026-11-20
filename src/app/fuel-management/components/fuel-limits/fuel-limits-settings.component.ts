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

import { ChangeDetectorRef, Component, DestroyRef, EventEmitter, HostBinding, Input, OnChanges, Output, SimpleChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { Subscription, forkJoin, of } from "rxjs";
import { catchError } from "rxjs/operators";
import { AliasFilterType, EntityDataQuery, EntityKeyType, EntityType } from "@shared/public-api";
import { WidgetContext } from "@home/models/widget-component.models";
import { SharedModule } from "@shared/public-api";
import { DataTableCellDirective, DataTableColumn, DataTableComponent } from "../../../components/shared/data-table/data-table.component";
import { DashboardLoadingComponent, FirstLoad } from "../../../components/shared/dashboard-loading/dashboard-loading.component";
import { StatusPillComponent } from "../../../components/shared/status-pill/status-pill.component";
import { SectionNavItem } from "../../../components/shared/section-nav/section-nav.component";
import { QUIET_REQUEST, parseStringList } from "../../../components/shared/value-utils";
import {
  FUEL_LIMIT_KEYS,
  FUEL_PERIOD_META,
  FUEL_USED_KEYS,
  FuelLimits,
  FuelUse,
  MarketNode,
  NO_FUEL_LIMITS,
  parseFuelLimits,
  parseFuelUse,
} from "../../models/fuel-management.models";
import { FuelLimitsTarget, FuelUseRow, fuelUseRow } from "./fuel-limits.models";

/** The Settings section's id (its entry in the fuel dashboard's Settings menu, and — nested in Home — its app's page). */
export const FUEL_LIMITS_SECTION: SectionNavItem = { id: "fuelLimits", label: "Fuel limits", icon: "data_thresholding" };

/** A row of the table: a market, a site under it, or a pump under its site. */
interface FuelLimitsRow extends FuelLimitsTarget {
  parentId: string | null;
  /** Its name's bubble: a pump's device name ("dev-sim1-pump-01"); "" none. */
  tip: string;
  /** A pump's own name ("P01"): its row's {@link name} is it and its station's ("P01 · PLC02" — a site's stations each have a P01). */
  pumpName: string;
  day: FuelUseRow;
  month: FuelUseRow;
  year: FuelUseRow;
}

/**
 * Settings › Fuel limits: the hierarchy from the highest level the viewer can
 * read — each market they can read, its Fuel sites under it, each site's pumps
 * under it (placed by their stored `site`) — the tree folding as a panel's
 * grouped list (`treeCollapsible`: + / −, folded to start) — and a Fuel site
 * whose market they can't read on its own — each
 * one's fuel used today, this month and this year (the backend's totals: a
 * pump's its dispenses', a site's its pumps', a market's its sites') against
 * its limits, a pill once near (its warn share), over or well over: the
 * alarms it raises ("Daily fuel limit", …). A row opens its limits panel
 * ({@link open}: the dashboard's side panel); {@link refreshKey} reads them
 * again (after a save).
 */
@Component({
  selector: "tb-fuel-limits-settings",
  templateUrl: "./fuel-limits-settings.component.html",
  styleUrls: ["./fuel-limits-settings.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, DataTableComponent, DataTableCellDirective, DashboardLoadingComponent, StatusPillComponent],
})
export class FuelLimitsSettingsComponent implements OnChanges {
  /** No native tooltip (a `title` attribute set on it by mistake). */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;
  @Input() ctx!: WidgetContext;
  /** The markets the viewer can read and their Fuel sites (the dashboard's). */
  @Input() markets: MarketNode[] = [];
  @Input() marketsLoading = true;
  /** The Site asset profile, and the application a site runs to be a Fuel site (its `applications`). */
  @Input() siteAssetType = "Site";
  @Input() fuelApp = "Fuel";
  /** The pumps' device profiles, the server attribute holding a pump's site (its code) and the one holding its label ("P01"). */
  @Input() pumpDeviceTypes: string[] = ["FuelPump"];
  @Input() siteKey = "site";
  @Input() pumpLabelKey = "pumpLabel";
  /** Each pump's station by name (by the pump's device id) — the dashboard's; a pump without one is named alone. */
  @Input() pumpStations: Record<string, string> = {};
  /** The row whose panel is open. */
  @Input() selectedId: string | null = null;
  /** Change to read the limits and totals again. */
  @Input() refreshKey = 0;
  @Output() open = new EventEmitter<FuelLimitsTarget>();

  readonly section = FUEL_LIMITS_SECTION;
  rows: FuelLimitsRow[] = [];
  loading = true;
  readonly firstLoad = new FirstLoad();
  readonly columns: DataTableColumn[] = [
    { key: "name", header: "Name", emphasis: "strong", tooltipKey: "tip" },
    { key: "day", header: FUEL_PERIOD_META.day.label, nowrap: true },
    { key: "month", header: FUEL_PERIOD_META.month.label, nowrap: true },
    { key: "year", header: FUEL_PERIOD_META.year.label, nowrap: true },
  ];

  private readSub?: Subscription;

  constructor(
    private destroyRef: DestroyRef,
    private cd: ChangeDetectorRef
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes["markets"] || changes["marketsLoading"] || changes["refreshKey"]) && !this.marketsLoading) {
      this.read();
    } else if (changes["pumpStations"] && this.rows.some((r) => r.kind === "pump")) {
      this.rows = this.rows.map((r) => (r.kind === "pump" ? { ...r, name: this.pumpTitle(r.id, r.pumpName) } : r));
    }
  }

  onRow(row: Record<string, any>): void {
    const r = row as FuelLimitsRow;
    this.open.emit({ kind: r.kind, id: r.id, name: r.name, place: r.place, profile: r.profile, limits: r.limits, use: r.use });
  }

  /** A pump's row name: its own and its station's ("P01 · PLC02"), else its own alone. */
  private pumpTitle(id: string, name: string): string {
    const station = this.pumpStations[id];
    return station ? `${name} · ${station}` : name;
  }

  /**
   * The rows, from the highest level the viewer can read: every Fuel site
   * they can read (one entity query: its applications, its limits, its use),
   * every market they can read (another: its limits, its use) and every pump
   * they can read (a third: its site, its label, its limits, its use) — a
   * market first, its sites under it, each site's pumps under it; a site
   * whose market isn't theirs at the top. A pump at no Fuel site is left out.
   */
  private read(): void {
    const used = FUEL_USED_KEYS.map((key) => ({ type: EntityKeyType.TIME_SERIES, key }));
    const limits = FUEL_LIMIT_KEYS.map((key) => ({ type: EntityKeyType.SERVER_ATTRIBUTE, key }));
    const fields = [
      { type: EntityKeyType.ENTITY_FIELD, key: "name" },
      { type: EntityKeyType.ENTITY_FIELD, key: "label" },
    ];
    const sitesQuery: EntityDataQuery = {
      entityFilter: { type: AliasFilterType.assetType, assetTypes: [this.siteAssetType], assetNameFilter: "" } as any,
      entityFields: fields,
      latestValues: [...used, ...limits, { type: EntityKeyType.SERVER_ATTRIBUTE, key: "applications" }],
      pageLink: { page: 0, pageSize: 1024 },
    };
    const marketIds = this.markets.map((m) => m.id);
    const marketsQuery: EntityDataQuery | null = marketIds.length
      ? {
          entityFilter: { type: AliasFilterType.entityList, entityType: EntityType.ASSET, entityList: marketIds } as any,
          entityFields: fields,
          latestValues: [...used, ...limits],
          pageLink: { page: 0, pageSize: 1024 },
        }
      : null;
    const pumpsQuery: EntityDataQuery = {
      entityFilter: { type: AliasFilterType.deviceType, deviceTypes: this.pumpDeviceTypes, deviceNameFilter: "" } as any,
      entityFields: [...fields, { type: EntityKeyType.ENTITY_FIELD, key: "type" }],
      latestValues: [
        ...used,
        ...limits,
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: this.siteKey },
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: this.pumpLabelKey },
      ],
      pageLink: { page: 0, pageSize: 1024 },
    };
    this.loading = true;
    this.readSub?.unsubscribe();
    this.readSub = forkJoin({
      sites: this.ctx.entityService.findEntityDataByQuery(sitesQuery, QUIET_REQUEST).pipe(catchError(() => of(null))),
      markets: marketsQuery ? this.ctx.entityService.findEntityDataByQuery(marketsQuery, QUIET_REQUEST).pipe(catchError(() => of(null))) : of(null),
      pumps: this.pumpDeviceTypes.length ? this.ctx.entityService.findEntityDataByQuery(pumpsQuery, QUIET_REQUEST).pipe(catchError(() => of(null))) : of(null),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ sites, markets, pumps }) => {
        const stored = (d: any) => {
          const ts = d.latest?.[EntityKeyType.TIME_SERIES] ?? {};
          const server = d.latest?.[EntityKeyType.SERVER_ATTRIBUTE] ?? {};
          return { limits: parseFuelLimits((k) => server[k]?.value), use: parseFuelUse((k) => ts[k]?.value) };
        };
        const isFuel = (d: any) => {
          const apps = parseStringList(d.latest?.[EntityKeyType.SERVER_ATTRIBUTE]?.["applications"]?.value);
          return apps.includes(this.fuelApp);
        };
        const field = (d: any, key: string) => String(d.latest?.[EntityKeyType.ENTITY_FIELD]?.[key]?.value ?? "").trim();
        const nameOf = (d: any) => {
          const code = field(d, "name");
          const label = field(d, "label");
          return label && label !== code ? `${label} (${code})` : code;
        };
        // A pump everywhere by its pump label, else the device's label, else its name.
        const pumpNameOf = (d: any) =>
          String(d.latest?.[EntityKeyType.SERVER_ATTRIBUTE]?.[this.pumpLabelKey]?.value ?? "").trim() || field(d, "label") || field(d, "name");
        const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, undefined, { numeric: true });
        const row = (
          kind: FuelLimitsRow["kind"],
          id: string,
          name: string,
          parentId: string | null,
          s: { limits: FuelLimits; use: FuelUse },
          pump?: { tip: string; place: string; profile: string }
        ): FuelLimitsRow => ({
          kind,
          id,
          name,
          parentId,
          tip: pump?.tip ?? "",
          pumpName: pump ? name : "",
          place: pump?.place,
          profile: pump?.profile,
          ...s,
          day: fuelUseRow("day", s.use, s.limits),
          month: fuelUseRow("month", s.use, s.limits),
          year: fuelUseRow("year", s.use, s.limits),
        });
        // Each Fuel site the viewer can read, under the market it's in when that market is theirs too.
        const marketOf = new Map(this.markets.flatMap((m) => m.sites.map((x) => [x.id, m.id] as const)));
        const fuelSites = (sites?.data ?? []).filter(isFuel);
        const siteRows = fuelSites.map((d) => row("site", d.entityId.id, nameOf(d), marketOf.get(d.entityId.id) ?? null, stored(d)));
        // Each pump at one of those sites (its stored site code), under it.
        const siteByCode = new Map(fuelSites.map((d, i) => [field(d, "name"), siteRows[i]] as const));
        const pumpRows = (pumps?.data ?? []).flatMap((d) => {
          const site = siteByCode.get(String(d.latest?.[EntityKeyType.SERVER_ATTRIBUTE]?.[this.siteKey]?.value ?? "").trim());
          return site
            ? [row("pump", d.entityId.id, pumpNameOf(d), site.id, stored(d), { tip: field(d, "name"), place: site.name, profile: field(d, "type") })].map(
                (r) => ({ ...r, name: this.pumpTitle(r.id, r.pumpName) })
              )
            : [];
        });
        const withPumps = (site: FuelLimitsRow) => [site, ...pumpRows.filter((r) => r.parentId === site.id).sort(byName)];
        const marketStored = new Map((markets?.data ?? []).map((d) => [d.entityId.id, stored(d)] as const));
        const top: FuelLimitsRow[] = [
          ...this.markets
            .filter((m) => siteRows.some((r) => r.parentId === m.id))
            .map((m) => row("market", m.id, m.name || m.code, null, marketStored.get(m.id) ?? { limits: NO_FUEL_LIMITS, use: { day: 0, month: 0, year: 0 } })),
          ...siteRows.filter((r) => r.parentId === null),
        ].sort(byName);
        this.rows = top.flatMap((t) =>
          t.kind === "market" ? [t, ...siteRows.filter((r) => r.parentId === t.id).sort(byName).flatMap(withPumps)] : withPumps(t)
        );
        this.loading = false;
        this.cd.detectChanges();
      });
  }
}
