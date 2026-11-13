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


import { ChangeDetectorRef, Component, DestroyRef, HostBinding, Input, OnInit, ViewChild, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { EMPTY, Observable, Subscription, forkJoin, from, of } from "rxjs";
import { catchError, expand, map, mergeMap, reduce, shareReplay, switchMap, toArray } from "rxjs/operators";
import { Direction, EntityDataQuery, EntityKeyType, SharedModule } from "@shared/public-api";
import { WidgetContext } from "@home/models/widget-component.models";
import { defaultHttpOptionsFromConfig } from "@core/public-api";
import { DataTableColumn, DataTableComponent } from "../../../components/shared/data-table/data-table.component";
import { tableManageOf } from "../../../components/shared/data-table/table-manage";
import { SavedTableSort } from "../../../components/shared/dashboard/table-columns";
import { DetailTableComponent } from "../../../components/shared/detail-table/detail-table.component";
import { PanelTabComponent } from "../../../components/shared/panel-tab/panel-tab.component";
import { LOCATION_KEYS, loadOrganizationNames, siteLocationLabel } from "../../../components/shared/organization/site-locations";
import { PanelStop, PanelTrail } from "../../../components/shared/panel-trail/panel-trail";
import { PanelTrailComponent } from "../../../components/shared/panel-trail/panel-trail.component";
import { EntityPanelComponent } from "../entity-manager/entity-panel.component";
import { EntityRow } from "../entity-manager/entity-manager.models";
import { TableLinksComponent } from "../../../components/shared/table-links/table-links.component";
import { EntityDetailPanelComponent } from "../../../components/shared/entity-detail-panel/entity-detail-panel.component";
import { ConfirmDialogComponent } from "../../../components/shared/confirm-dialog/confirm-dialog.component";
import { DashboardLoadingComponent, firstLoadsOf } from "../../../components/shared/dashboard-loading/dashboard-loading.component";
import { ManageActionComponent, ManageCardComponent } from "../../../components/shared/manage-card/manage-card.component";
import { TbSelectOption } from "../../../components/shared/select/select.component";
import { OrganizationNotices } from "../../../components/shared/organization/organization-store";
import { DEFAULT_PROFILE_ICON, ProfileKind, profileIconsOf, readProfileIcon, saveProfileIcon } from "../../../components/shared/profile-icons/profile-icons";
import { loadMobileProfiles, saveMobileProfiles } from "../../../components/shared/organization/device-places";
import { OWNER_ENTITY_FIELDS, ownerCustomer } from "../../../components/shared/entity-owner";
import { QUIET_REQUEST, apiMessage, parseNumber } from "../../../components/shared/value-utils";
import { formatWhen } from "../../../components/shared/time-format";
import {
  NEW_PROFILE_TABS,
  NO_PROFILE_CHOICES,
  PROFILE_COUNT_CONCURRENCY,
  PROFILE_ENTITIES,
  PROFILE_ENTITIES_TITLE,
  PROFILE_ENTITY_LIMIT,
  PROFILE_NOUN,
  PROFILE_PANEL_TABS,
  PROFILE_PATH,
  PROFILES_PAGE_SIZE,
  PROFILES_PATH,
  PROFILE_SORT_SETTING,
  ProfileChoices,
  ProfileDraft,
  ProfileEntityRow,
  ProfileRow,
  profileBodyOf,
  profileEntityFilter,
} from "./profile-manager.models";
import { ProfileFormComponent } from "./profile-form.component";

/** A ThingsBoard page of profiles. */
interface ProfilePage {
  data: any[];
  hasNext?: boolean;
}

/**
 * The tenant's device profiles — or its asset profiles — as ThingsBoard's own
 * Profiles pages hold them, in the Home dashboard (its rail's Entities menu,
 * tenant administrators'; `kind` says which): the table — every profile,
 * read in full (a tenant has few), each with a count
 * of its devices / assets; every column sorts, the sort kept in the user's
 * settings — "Create new | Manage" (Delete) at its foot. A row opens its side
 * panel: the Details form (name, icon, description, default rule chain,
 * queue, default dashboard, image — a device profile's transport, alarm rules
 * and provisioning kept as they are) with its Manage card (Set as default,
 * Delete), then its Devices / Assets tab (grouped by site — its count opens
 * the panel there), a row of which opens that device's / asset's Details
 * panel (`tb-entity-panel`, the Devices and Assets pages' own) — the next
 * stop on the page's trail. ThingsBoard refuses to delete the default profile
 * or one in use: its reason shows in the toast.
 */
@Component({
  selector: "tb-profile-manager",
  templateUrl: "./profile-manager.component.html",
  styleUrls: ["./profile-manager.component.scss"],
  standalone: true,
  imports: [
    CommonModule,
    SharedModule,
    DataTableComponent,
    TableLinksComponent,
    EntityDetailPanelComponent,
    PanelTabComponent,
    DetailTableComponent,
    EntityPanelComponent,
    PanelTrailComponent,
    ConfirmDialogComponent,
    DashboardLoadingComponent,
    ManageCardComponent,
    ManageActionComponent,
    ProfileFormComponent,
  ],
})
export class ProfileManagerComponent implements OnInit {
  /** Never let the browser's native tooltip show on the host. */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;

  @Input() ctx!: WidgetContext;
  /** Where it reports what it did (the dashboard's toasts). */
  @Input() notices: OrganizationNotices | null = null;
  /** The page: the device profiles, or the asset profiles (set as it's made — each its own page). */
  @Input() kind: ProfileKind = "device";

  columns: DataTableColumn[] = [];

  // -- the table: every profile, with its count
  rows: ProfileRow[] = [];
  /** The first load only (a reload keeps the rows shown). */
  loading = true;
  /** The sort shown — the user's, kept in their settings (by name until they pick one). */
  tableSort!: SavedTableSort;
  private listRequest?: Subscription;

  // -- Manage: rows checked to delete
  managing = false;
  checkedRows: ProfileRow[] = [];
  @ViewChild("table") private table?: DataTableComponent;

  // -- the side panels: the profile's, and a device's / an asset's from its tab — stops on the page's trail
  readonly trail = new PanelTrail();
  @ViewChild("entityPanel", { static: true }) private entityPanel!: EntityPanelComponent;
  panelOpen = false;
  /** The tab it opens on (a count: the Devices / Assets tab), then the tab shown. */
  panelTab = "details";
  /** The row shown — null: a new one. */
  editing: ProfileRow | null = null;
  /** The edited profile as ThingsBoard holds it (null while it's read): the form's start, and what a save keeps. */
  editingProfile: any = null;
  /** The edited profile's icon ("" none; null while it's read). */
  editingIcon: string | null = null;
  /** A device profile's: its devices are vehicles (one of the tenant's `mobileProfiles`; null while they're read). */
  editingMobile: boolean | null = null;
  /** The tenant's mobile device profiles (device profiles only; null while read). */
  private mobileProfiles: string[] | null = null;
  choices: ProfileChoices = NO_PROFILE_CHOICES;
  saving = false;
  /** Bumped on every open: the form resets. */
  resetKey = 0;

  // -- the Devices / Assets tab: the profile's (the first by name), by site
  readonly entityColumns: DataTableColumn[] = [
    { key: "name", header: "Name" },
    { key: "label", header: "Label", emphasis: "muted" },
    { key: "site", header: "Site", emphasis: "muted" },
  ];
  entityRows: ProfileEntityRow[] = [];
  entitiesLoading = false;
  /** How many the profile holds (the tab lists the first {@link PROFILE_ENTITY_LIMIT}). */
  entityTotal = 0;
  readonly entityLimit = PROFILE_ENTITY_LIMIT;
  private entityRequest?: Subscription;
  /** Each site's name in the list — its label with its code — by its code (lower case), read once. */
  private siteNames$?: Observable<Map<string, string>>;

  // -- the delete confirmation
  deleteConfirm: ProfileRow[] | null = null;

  private readonly cd = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  get icons() {
    return profileIconsOf(this.ctx);
  }

  get noun(): string {
    return PROFILE_NOUN[this.kind];
  }

  /** What its profiles hold: "devices" / "assets". */
  get entitiesNoun(): string {
    return PROFILE_ENTITIES[this.kind];
  }

  /** The panel's tabs: Details, then Devices / Assets — a new profile's, Details alone. */
  get panelTabs() {
    return this.editing ? PROFILE_PANEL_TABS[this.kind] : NEW_PROFILE_TABS;
  }

  /** The tab lists only the first of them. */
  get entitiesCut(): boolean {
    return !this.entitiesLoading && this.entityTotal > this.entityRows.length;
  }

  /** The loading page over the list: the page's first load, once per visit. */
  get pageLoading(): boolean {
    return firstLoadsOf(this.ctx).pending(`profiles:${this.kind}`, this.loading);
  }

  /** The table's empty state: the kind's default icon. */
  get kindIcon(): string {
    return DEFAULT_PROFILE_ICON[this.kind];
  }

  ngOnInit(): void {
    const kind = this.kind;
    this.trail.join(this, () => this.closePanel());
    if (kind === "device") {
      loadMobileProfiles(this.ctx)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((list) => {
          this.mobileProfiles = list;
          if (this.editing && this.editingMobile === null) {
            this.editingMobile = list.includes(this.editing.name);
          }
          this.cd.detectChanges();
        });
    }
    this.columns = [
      { key: "name", header: "Name", emphasis: "strong", maxWidth: "280px", iconOf: (r) => this.icons.ofId(kind, r["id"]) },
      // Capped (cut with "…" past it), not `truncate`: the spare width spreads over every column, as the Devices page's.
      { key: "description", header: "Description", emphasis: "muted", maxWidth: "400px" },
      // Its devices / assets: a count opening its panel on that tab.
      {
        key: "entities",
        header: PROFILE_ENTITIES_TITLE[kind],
        count: { label: PROFILE_ENTITIES[kind], icon: DEFAULT_PROFILE_ICON[kind] },
        sortValue: (r) => r["entities"] ?? -1,
      },
      { key: "created", header: "Created", sortKey: "createdTime" },
    ];
    this.tableSort = new SavedTableSort(
      PROFILE_SORT_SETTING[kind],
      () => this.columns.map((c) => c.key),
      this.ctx,
      this.destroyRef,
      () => this.cd.detectChanges(),
      { key: "name", direction: "asc" }
    );
    this.tableSort.load();
    this.icons.load(kind);
    // Icons coming in (read, or saved here): the rows and the panel's header show them.
    this.icons.changes.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.cd.detectChanges());
    this.loadProfiles();
    this.loadChoices();
  }

  // -- data ------------------------------------------------------------------------------------------------

  /**
   * Every profile (a page after another — a tenant has few), then each one's devices / assets counted (a count request a profile, a few
   * at once): the rows once all are in. A reload (after a save, a delete) keeps the rows shown until the new ones are.
   */
  loadProfiles(): void {
    this.listRequest?.unsubscribe();
    const kind = this.kind;
    const page = (n: number) =>
      this.ctx.http.get<ProfilePage>(
        `${PROFILES_PATH[kind]}?pageSize=${PROFILES_PAGE_SIZE}&page=${n}&sortProperty=name&sortOrder=ASC`,
        defaultHttpOptionsFromConfig(QUIET_REQUEST)
      );
    this.listRequest = page(0)
      .pipe(
        expand((res, i) => (res?.hasNext ? page(i + 1) : EMPTY)),
        reduce((all: any[], res: ProfilePage) => all.concat(res?.data ?? []), []),
        map((profiles) => profiles.map((p) => this.rowOf(p))),
        switchMap((rows) => this.withCounts(rows)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (rows) => {
          this.rows = rows;
          this.loading = false;
          this.cd.detectChanges();
        },
        error: (err) => {
          this.loading = false;
          this.notices?.error(`Couldn't load the ${this.noun}s${apiMessage(err)}`);
          this.cd.detectChanges();
        },
      });
  }

  private rowOf(p: any): ProfileRow {
    const created = parseNumber(p.createdTime);
    return {
      id: String(p.id.id),
      kind: this.kind,
      name: String(p.name ?? ""),
      description: String(p.description ?? ""),
      isDefault: p.default === true,
      createdTime: created,
      created: formatWhen(created),
      entities: null,
    };
  }

  /** The rows with their devices / assets counted (one that can't be: none — "—"). */
  private withCounts(rows: ProfileRow[]): Observable<ProfileRow[]> {
    if (!rows.length) {
      return of(rows);
    }
    const kind = this.kind;
    return from(rows).pipe(
      mergeMap(
        (row) =>
          this.ctx.http
            .post<number>("/api/entitiesQuery/count", { entityFilter: profileEntityFilter(kind, row.name), keyFilters: [] }, defaultHttpOptionsFromConfig(QUIET_REQUEST))
            .pipe(
              map((n) => {
                row.entities = parseNumber(n);
              }),
              catchError(() => of(null))
            ),
        PROFILE_COUNT_CONCURRENCY
      ),
      toArray(),
      map(() => rows)
    );
  }

  /**
   * The panel's Devices / Assets tab: the profile's first ones by name, with their stored site named by its label and code ("Richmond Lab
   * (4R20)" — the list groups by it) — by site, those without one last. Shown once both are in.
   */
  private loadEntities(row: ProfileRow): void {
    this.entityRequest?.unsubscribe();
    this.entityRows = [];
    this.entityTotal = 0;
    this.entitiesLoading = true;
    const query: EntityDataQuery = {
      entityFilter: profileEntityFilter(this.kind, row.name),
      keyFilters: [],
      entityFields: [{ type: EntityKeyType.ENTITY_FIELD, key: "name" }, { type: EntityKeyType.ENTITY_FIELD, key: "label" }, ...OWNER_ENTITY_FIELDS],
      latestValues: [{ type: EntityKeyType.SERVER_ATTRIBUTE, key: LOCATION_KEYS.site }],
      pageLink: { page: 0, pageSize: PROFILE_ENTITY_LIMIT, sortOrder: { key: { type: EntityKeyType.ENTITY_FIELD, key: "name" }, direction: Direction.ASC } },
    };
    this.entityRequest = forkJoin([this.ctx.entityService.findEntityDataByQuery(query, QUIET_REQUEST).pipe(catchError(() => of(null))), this.siteNames()])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([page, siteNames]) => {
        if (this.editing?.id !== row.id) {
          return;
        }
        if (!page) {
          this.notices?.error(`Couldn't read ${row.name}'s ${this.entitiesNoun}.`);
        }
        const field = (d: any, key: string) => String(d.latest?.[EntityKeyType.ENTITY_FIELD]?.[key]?.value ?? "");
        const rows: ProfileEntityRow[] = (page?.data ?? []).map((d: any) => {
          const siteCode = String(d.latest?.[EntityKeyType.SERVER_ATTRIBUTE]?.[LOCATION_KEYS.site]?.value ?? "");
          return {
            id: String(d.entityId.id),
            name: field(d, "name"),
            label: field(d, "label"),
            site: siteCode ? (siteNames.get(siteCode.toLowerCase()) ?? siteCode) : "",
            siteCode,
            owner: ownerCustomer(d.latest?.[EntityKeyType.ENTITY_FIELD] ?? {}),
          };
        });
        // By the site as named (a stable sort: by name within one, as read).
        this.entityRows = rows.sort((a, b) => Number(!a.site) - Number(!b.site) || a.site.localeCompare(b.site, undefined, { numeric: true }));
        this.entityTotal = page?.totalElements ?? rows.length;
        this.entitiesLoading = false;
        this.cd.detectChanges();
      });
  }

  /** The sites' names in the list (read once — none read: the codes alone). */
  private siteNames(): Observable<Map<string, string>> {
    this.siteNames$ ??= loadOrganizationNames(this.ctx).pipe(
      map((names) => new Map(names.sites.map((site) => [site.code.toLowerCase(), siteLocationLabel(site)]))),
      catchError(() => of(new Map<string, string>())),
      shareReplay(1)
    );
    return this.siteNames$;
  }

  /** The form's pickers (read once): the tenant's core rule chains, the rule engine's queues, its dashboards, its gallery images. */
  private loadChoices(): void {
    const list = <T>(path: string, option: (item: T) => TbSelectOption): Observable<TbSelectOption[]> =>
      this.ctx.http.get<{ data: T[] }>(path, defaultHttpOptionsFromConfig(QUIET_REQUEST)).pipe(
        map((res) => (res?.data ?? []).map(option)),
        catchError(() => of([] as TbSelectOption[]))
      );
    forkJoin({
      ruleChains: list<{ id: { id: string }; name: string }>("/api/ruleChains?pageSize=1000&page=0&type=CORE&sortProperty=name&sortOrder=ASC", (r) => ({
        value: r.id.id,
        label: r.name,
      })),
      queues: list<{ name: string }>("/api/queues?serviceType=TB_RULE_ENGINE&pageSize=100&page=0&sortProperty=name&sortOrder=ASC", (q) => ({ value: q.name, label: q.name })),
      dashboards: list<{ id: { id: string }; title: string }>("/api/tenant/dashboards?pageSize=1000&page=0&sortProperty=title&sortOrder=ASC", (d) => ({
        value: d.id.id,
        label: d.title,
      })),
      images: list<{ link: string; title: string }>("/api/images?pageSize=1000&page=0&includeSystemImages=false&sortProperty=title&sortOrder=ASC", (i) => ({
        value: `tb-image;${i.link}`,
        label: i.title,
      })),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((choices) => {
        this.choices = choices;
        this.cd.detectChanges();
      });
  }

  // -- Manage ------------------------------------------------------------------------------------------

  /** The footer's Manage state (`tb-table-links`): "Select all" covers every row. */
  readonly manage = tableManageOf({
    managing: () => this.managing,
    selectedCount: () => this.checkedRows.length,
    allChecked: () => this.table?.allFilteredChecked ?? false,
    count: () => this.table?.checkableCount ?? this.rows.length,
    start: () => this.startManage(),
    end: () => this.endManage(),
    toggleAll: () => this.toggleAllChecked(),
  });

  startManage(): void {
    this.managing = true;
    this.closePanel();
    this.entityPanel.close();
  }

  endManage(): void {
    this.managing = false;
    this.checkedRows = [];
    this.table?.clearChecked();
  }

  onSelection(rows: Record<string, any>[]): void {
    this.checkedRows = rows as ProfileRow[];
  }

  toggleAllChecked(): void {
    if (this.table?.allFilteredChecked) {
      this.table.clearChecked();
    } else {
      this.table?.checkAll(true);
    }
  }

  askDelete(rows: ProfileRow[]): void {
    if (rows.length) {
      this.deleteConfirm = rows;
    }
  }

  get deleteHeading(): string {
    const rows = this.deleteConfirm ?? [];
    return rows.length === 1 ? `Delete ${this.noun} ${rows[0].name}?` : `Delete ${rows.length} ${this.noun}s?`;
  }

  get deleteMessage(): string {
    const one = (this.deleteConfirm?.length ?? 0) === 1;
    return `This deletes ${one ? "it" : "them"} from ThingsBoard for good. ThingsBoard keeps the default profile and any profile its ${
      this.kind === "device" ? "devices" : "assets"
    } still use. It can't be undone.`;
  }

  /** Each one deleted — ThingsBoard's reason for one it keeps (the default, one in use) in the toast. */
  confirmDelete(): void {
    const rows = this.deleteConfirm ?? [];
    this.deleteConfirm = null;
    if (!rows.length) {
      return;
    }
    const kind = this.kind;
    this.saving = true;
    const del = (r: ProfileRow): Observable<string | null> =>
      this.ctx.http.delete(`${PROFILE_PATH[kind]}/${r.id}`, defaultHttpOptionsFromConfig(QUIET_REQUEST)).pipe(
        map(() => null),
        catchError((err) => of(apiMessage(err)))
      );
    forkJoin(rows.map(del))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((failures) => {
        this.saving = false;
        const deleted = rows.filter((_, i) => failures[i] === null);
        deleted.forEach((r) => this.icons.remove(kind, r.id));
        const firstFailure = failures.findIndex((f) => f !== null);
        if (firstFailure < 0) {
          this.notices?.success(rows.length === 1 ? `${rows[0].name} deleted` : `${rows.length} ${this.noun}s deleted`);
        } else if (rows.length === 1) {
          this.notices?.error(`Couldn't delete ${rows[0].name}${failures[0]}`);
        } else {
          this.notices?.error(`Deleted ${deleted.length} of ${rows.length} ${this.noun}s — ${rows[firstFailure].name} couldn't be${failures[firstFailure]}`);
        }
        if (this.editing && deleted.some((r) => r.id === this.editing?.id)) {
          this.closePanel();
        }
        this.endManage();
        this.loadProfiles();
      });
  }

  /** Set as default: new devices / assets take it. */
  setDefault(): void {
    const row = this.editing;
    if (!row || row.isDefault) {
      return;
    }
    this.saving = true;
    this.ctx.http
      .post<any>(`${PROFILE_PATH[this.kind]}/${row.id}/default`, null, defaultHttpOptionsFromConfig(QUIET_REQUEST))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (saved) => {
          this.saving = false;
          this.notices?.success(`${row.name} is the default ${this.noun} now`);
          if (this.editing?.id === row.id) {
            this.editing = { ...row, isDefault: true };
            this.editingProfile = saved ?? this.editingProfile;
          }
          this.loadProfiles();
        },
        error: (err) => {
          this.saving = false;
          this.notices?.error(`Couldn't make ${row.name} the default${apiMessage(err)}`);
          this.cd.detectChanges();
        },
      });
  }

  // -- the side panel ----------------------------------------------------------------------------------

  openAdd(): void {
    this.trail.reset(this);
    this.entityRequest?.unsubscribe();
    this.editing = null;
    this.editingProfile = null;
    this.editingIcon = "";
    this.editingMobile = false;
    this.panelTab = "details";
    this.resetKey++;
    this.panelOpen = true;
  }

  /** A row's count: its panel on the Devices / Assets tab. */
  openEntities(row: Record<string, any>): void {
    this.openRow(row, "entities");
  }

  /** A row: its panel — on Details, or the tab named (not while the list is managed). */
  openRow(row: Record<string, any>, tab = "details"): void {
    if (this.managing) {
      return;
    }
    const r = row as ProfileRow;
    const kind = this.kind;
    this.trail.visit(this, this.profileStop(r));
    this.editing = r;
    this.editingProfile = null;
    this.editingIcon = null;
    this.editingMobile = kind === "device" ? (this.mobileProfiles ? this.mobileProfiles.includes(r.name) : null) : false;
    this.panelTab = tab;
    this.resetKey++;
    this.panelOpen = true;
    this.loadEntities(r);
    // As ThingsBoard holds it (what a save keeps), and its icon: the form's start.
    forkJoin({
      profile: this.ctx.http.get<any>(`${PROFILE_PATH[kind]}/${r.id}`, defaultHttpOptionsFromConfig(QUIET_REQUEST)).pipe(catchError(() => of(null))),
      icon: readProfileIcon(this.ctx, kind, r.id).pipe(catchError(() => of(""))),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ profile, icon }) => {
        if (this.editing?.id !== r.id) {
          return;
        }
        if (!profile) {
          this.notices?.error(`Couldn't read ${r.name}.`);
        }
        this.editingProfile = profile;
        this.editingIcon = icon;
        this.cd.detectChanges();
      });
  }

  closePanel(): void {
    this.panelOpen = false;
  }

  /** The panel's tab: where it shows next, and where its stop opens again. */
  onPanelTab(tab: string): void {
    this.panelTab = tab;
    if (this.editing) {
      this.trail.noteTab(`profile:${this.editing.id}`, tab);
    }
  }

  /** A device / an asset of the tab: its Details panel — the trail's next stop. */
  openEntity(row: Record<string, any>): void {
    const e = row as ProfileEntityRow;
    const entity: EntityRow = {
      id: e.id,
      kind: this.kind,
      name: e.name,
      label: e.label,
      profile: this.editing?.name ?? "",
      owner: e.owner,
      site: e.siteCode,
      active: null,
      createdTime: null,
      created: "",
      description: "",
    };
    this.entityPanel.open(entity);
  }

  /** One deleted from its panel: out of the tab's list, the counts read again. */
  onEntityDeleted(id: string): void {
    if (this.entityRows.some((r) => r.id === id)) {
      this.entityRows = this.entityRows.filter((r) => r.id !== id);
      this.entityTotal = Math.max(0, this.entityTotal - 1);
    }
    this.loadProfiles();
  }

  /** A profile's stop on the trail: its icon, "Device profile · <name>" in the strip's bubble — gone once it's no longer listed. */
  private profileStop(row: ProfileRow): PanelStop {
    const icons = this.icons;
    const kind = this.kind;
    return {
      key: `profile:${row.id}`,
      get icon() {
        return icons.ofId(kind, row.id);
      },
      kind: this.noun.charAt(0).toUpperCase() + this.noun.slice(1),
      label: () => (this.editing?.id === row.id ? this.editing.name : (this.rows.find((r) => r.id === row.id)?.name ?? null)),
      isOpen: () => this.panelOpen && this.editing?.id === row.id,
      open: (tab) => this.openRow(this.rows.find((r) => r.id === row.id) ?? row, tab ?? "details"),
      close: () => this.closePanel(),
    };
  }

  get selectedId(): string | null {
    return this.panelOpen && this.editing ? this.editing.id : null;
  }

  get panelIcon(): string {
    return this.editing ? this.icons.ofId(this.kind, this.editing.id) : DEFAULT_PROFILE_ICON[this.kind];
  }

  get panelName(): string {
    return this.editing ? this.editing.name : `New ${this.noun}`;
  }

  get panelSubtitle(): string {
    if (!this.editing) {
      return "";
    }
    const noun = this.noun.charAt(0).toUpperCase() + this.noun.slice(1);
    return this.editing.isDefault ? `${noun} · Default` : noun;
  }

  /** Details' Create / Apply: the profile (all it holds besides kept), then its icon and — a device profile's — its Mobile when they changed. */
  save(draft: ProfileDraft): void {
    const kind = this.kind;
    const editing = this.editing;
    const before = editing ? this.editingProfile : null;
    const iconBefore = editing ? (this.editingIcon ?? "") : "";
    const mobileBefore = editing ? !!this.editingMobile : false;
    // The list goes by the profile's name: a mobile one renamed is listed again under its new one.
    const mobileChanged = kind === "device" && (draft.mobile !== mobileBefore || (draft.mobile && !!editing && draft.name !== editing.name));
    this.saving = true;
    this.ctx.http
      .post<any>(PROFILE_PATH[kind], profileBodyOf(kind, before, draft), defaultHttpOptionsFromConfig(QUIET_REQUEST))
      .pipe(
        switchMap((saved) => {
          const id = String(saved.id.id);
          const icon$ =
            draft.icon === iconBefore
              ? of(true)
              : saveProfileIcon(this.ctx, kind, id, draft.icon).pipe(
                  map(() => true),
                  catchError(() => of(false))
                );
          const mobile$ = mobileChanged
            ? this.saveMobile(editing?.name ?? "", draft).pipe(
                map(() => true),
                catchError(() => of(false))
              )
            : of(true);
          return forkJoin({ iconSaved: icon$, mobileSaved: mobile$ }).pipe(map(({ iconSaved, mobileSaved }) => ({ saved, iconSaved, mobileSaved })));
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: ({ saved, iconSaved, mobileSaved }) => {
          this.saving = false;
          const id = String(saved.id.id);
          const icon = iconSaved ? draft.icon : iconBefore;
          this.icons.put(kind, id, draft.name, icon);
          if (iconSaved && mobileSaved) {
            this.notices?.success(`${draft.name} ${editing ? "saved" : "created"}`);
          } else {
            const left = [iconSaved ? "" : "its icon", mobileSaved ? "" : "Mobile"].filter(Boolean).join(" and ");
            this.notices?.error(`${draft.name} ${editing ? "saved" : "created"}, but ${left} couldn't be saved.`);
          }
          if (editing && this.editing?.id === editing.id) {
            this.editingProfile = saved;
            this.editingIcon = icon;
            this.editingMobile = mobileSaved ? draft.mobile : mobileBefore;
            this.editing = { ...editing, name: draft.name, description: draft.description };
            if (draft.name !== editing.name) {
              // Its devices / assets go by its name: read again under the new one.
              this.loadEntities(this.editing);
            }
          } else if (!editing) {
            this.closePanel();
          }
          this.loadProfiles();
        },
        error: (err) => {
          this.saving = false;
          const msg = apiMessage(err);
          this.notices?.error(/already exists/i.test(msg) ? `A ${this.noun} named ${draft.name} already exists.` : `Couldn't ${editing ? "save" : "create"} the ${this.noun}${msg}`);
          this.cd.detectChanges();
        },
      });
  }

  /**
   * The tenant's mobile device profiles with this one in or out (read afresh, so another's change stands): under its new name when
   * Mobile, its old one taken out.
   */
  private saveMobile(nameBefore: string, draft: ProfileDraft): Observable<unknown> {
    return loadMobileProfiles(this.ctx).pipe(
      switchMap((list) => {
        const next = list.filter((n) => n !== nameBefore && n !== draft.name);
        if (draft.mobile) {
          next.push(draft.name);
        }
        return saveMobileProfiles(this.ctx, next).pipe(
          map(() => {
            this.mobileProfiles = next;
            return null;
          })
        );
      })
    );
  }
}
