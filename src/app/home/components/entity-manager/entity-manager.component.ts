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
import { Observable, Subscription, forkJoin, of } from "rxjs";
import { catchError, map, switchMap } from "rxjs/operators";
import {
  AliasFilterType,
  Direction,
  EntityDataQuery,
  EntityFilter,
  EntityKeyType,
  EntityKeyValueType,
  EntityType,
  FilterPredicateType,
  BooleanOperation,
  KeyFilter,
  SharedModule,
} from "@shared/public-api";
import { WidgetContext } from "@home/models/widget-component.models";
import { defaultHttpOptionsFromConfig } from "@core/public-api";
import { DataTableCellDirective, DataTableColumn, DataTableComponent, DataTableSort } from "../../../components/shared/data-table/data-table.component";
import { TableLinksComponent } from "../../../components/shared/table-links/table-links.component";
import { tableManageOf } from "../../../components/shared/data-table/table-manage";
import { SidebarLayoutComponent } from "../../../components/shared/sidebar-layout/sidebar-layout.component";
import { SearchBoxComponent } from "../../../components/shared/search-box/search-box.component";
import { FilterSectionsComponent } from "../../../components/shared/filter-sections/filter-sections.component";
import { FilterSectionComponent } from "../../../components/shared/filter-section/filter-section.component";
import { FilterListComponent, FilterListOption } from "../../../components/shared/filter-list/filter-list.component";
import { CheckFilterComponent } from "../../../components/shared/check-filter/check-filter.component";
import { StatusPillComponent } from "../../../components/shared/status-pill/status-pill.component";
import { EntityDetailPanelComponent } from "../../../components/shared/entity-detail-panel/entity-detail-panel.component";
import { ConfirmDialogComponent } from "../../../components/shared/confirm-dialog/confirm-dialog.component";
import { DashboardLoadingComponent, firstLoadsOf } from "../../../components/shared/dashboard-loading/dashboard-loading.component";
import { OWNER_ENTITY_FIELDS, ownerCustomer } from "../../../components/shared/entity-owner";
import { LOCATION_KEYS } from "../../../components/shared/organization/site-locations";
import { QUIET_REQUEST, apiMessage, parseDescription, parseNumber } from "../../../components/shared/value-utils";
import { formatWhen } from "../../../components/shared/time-format";
import { OrganizationNotices } from "../../../components/shared/organization/organization-store";
import { DEFAULT_PROFILE_ICON, ProfileIcons, profileIconsOf } from "../../../components/shared/profile-icons/profile-icons";
import { ManageActionComponent, ManageCardComponent } from "../../../components/shared/manage-card/manage-card.component";
import {
  ENTITY_PANEL_TABS,
  ENTITY_TYPE_OF,
  EntityDraft,
  EntityFilters,
  EntityKind,
  EntityOption,
  EntityRow,
  EntityStatus,
  NO_ENTITY_FILTERS,
} from "./entity-manager.models";
import { EntityDetailsFormComponent } from "./entity-details-form.component";

/** A table column's server sort: the entity field (or server attribute) its rows are ordered by. */
const SORT_KEYS: Record<string, { type: EntityKeyType; key: string }> = {
  name: { type: EntityKeyType.ENTITY_FIELD, key: "name" },
  label: { type: EntityKeyType.ENTITY_FIELD, key: "label" },
  profile: { type: EntityKeyType.ENTITY_FIELD, key: "type" },
  owner: { type: EntityKeyType.ENTITY_FIELD, key: "ownerName" },
  created: { type: EntityKeyType.ENTITY_FIELD, key: "createdTime" },
  site: { type: EntityKeyType.SERVER_ATTRIBUTE, key: LOCATION_KEYS.site },
  status: { type: EntityKeyType.SERVER_ATTRIBUTE, key: "active" },
};

const STATUS_LABELS: Record<EntityStatus, string> = { active: "Active", inactive: "Inactive" };

/**
 * The table's columns, a kind's — made once a page (a new array every check would re-sort and re-measure the table
 * every time): the name with its profile's icon.
 */
const columnsOf = (kind: EntityKind, icons: ProfileIcons): DataTableColumn[] => {
  const name: DataTableColumn = { key: "name", header: "Name", maxWidth: "260px", iconOf: (r) => icons.of(kind, r["profile"]) };
  return [name, ...COLUMNS[kind]];
};

/** The columns after the name, a kind's. */
const COLUMNS: Record<EntityKind, DataTableColumn[]> = {
  device: [
    { key: "label", header: "Label", maxWidth: "220px" },
    { key: "profile", header: "Profile" },
    { key: "owner", header: "Owner" },
    { key: "site", header: "Site" },
    { key: "status", header: "Status" },
    { key: "created", header: "Created", sortKey: "createdTime" },
  ],
  asset: [
    { key: "label", header: "Label", maxWidth: "220px" },
    { key: "profile", header: "Profile" },
    { key: "owner", header: "Owner" },
    { key: "site", header: "Site" },
    { key: "created", header: "Created", sortKey: "createdTime" },
  ],
};

/**
 * The tenant's devices — or its assets — as ThingsBoard's own pages hold them,
 * in the Home dashboard (its rail's Devices and Assets pages, tenant
 * administrators'; `kind` says which): the search and the Profile (and,
 * devices, Status) filters in the sidebar, the table paged, sorted and searched on the server (the tenant's
 * tickets alone are tens of thousands of assets), "Create new | Manage"
 * (Delete) at its foot. A row opens its side panel, as a profile's: Details
 * alone — the form (name, label, profile, owner, description), then its Manage
 * card (Delete).
 */
@Component({
  selector: "tb-entity-manager",
  templateUrl: "./entity-manager.component.html",
  styleUrls: ["./entity-manager.component.scss"],
  standalone: true,
  imports: [
    CommonModule,
    SharedModule,
    DataTableComponent,
    DataTableCellDirective,
    SidebarLayoutComponent,
    SearchBoxComponent,
    FilterSectionsComponent,
    FilterSectionComponent,
    FilterListComponent,
    CheckFilterComponent,
    StatusPillComponent,
    EntityDetailPanelComponent,
    ConfirmDialogComponent,
    DashboardLoadingComponent,
    EntityDetailsFormComponent,
    ManageCardComponent,
    ManageActionComponent,
    TableLinksComponent,
  ],
})
export class EntityManagerComponent implements OnInit {
  /** Never let the browser's native tooltip show on the host. */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;

  @Input() ctx!: WidgetContext;
  /** Where it reports what it did (the dashboard's toasts). */
  @Input() notices: OrganizationNotices | null = null;

  /** The page: the devices, or the assets (set as it's made — each its own page). */
  @Input() kind: EntityKind = "device";
  filters: EntityFilters = NO_ENTITY_FILTERS;
  sidebarOpen = true;

  // -- the table: one page from the server
  rows: EntityRow[] = [];
  total = 0;
  page = 0;
  pageSize = 20;
  sort: DataTableSort | null = { key: "name", direction: "asc" };
  loading = true;
  private pageRequest?: Subscription;

  // -- the filters' options (counted under the other filter)
  profileOptions: FilterListOption[] = [];
  statusOptions: FilterListOption[] = [];
  private profiles: Record<EntityKind, EntityOption[] | null> = { device: null, asset: null };
  ownerOptions: EntityOption[] = [];

  // -- Manage: rows checked to delete
  managing = false;
  checkedRows: EntityRow[] = [];
  @ViewChild("table") private table?: DataTableComponent;

  // -- the side panel
  readonly panelTabs = ENTITY_PANEL_TABS;
  panelOpen = false;
  /** The row shown — null: a new one. */
  editing: EntityRow | null = null;
  /** The edited entity as ThingsBoard holds it (its profile, owner and additional info): the form's start. */
  editingEntity: any = null;
  saving = false;
  /** Bumped on every open: the form resets. */
  resetKey = 0;

  // -- the delete confirmation
  deleteConfirm: EntityRow[] | null = null;

  private readonly cd = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  columns: DataTableColumn[] = [];

  /** The loading page over the list: the page's first load, once per visit (kept on the widget context — the page is made anew each time it shows). */
  get pageLoading(): boolean {
    return firstLoadsOf(this.ctx).pending(`entities:${this.kind}`, this.loading);
  }

  get noun(): string {
    return this.kind === "device" ? "device" : "asset";
  }

  get hasFilters(): boolean {
    return !!(this.filters.search.length || this.filters.profiles.length || this.filters.statuses.length);
  }

  /** The kind's icon (the table's empty state, a new one's panel). */
  get kindIcon(): string {
    return DEFAULT_PROFILE_ICON[this.kind];
  }

  /** The panel's header: the entity's profile icon. */
  get panelIcon(): string {
    return this.editing ? profileIconsOf(this.ctx).of(this.kind, this.editing.profile) : this.kindIcon;
  }

  ngOnInit(): void {
    const icons = profileIconsOf(this.ctx);
    this.columns = columnsOf(this.kind, icons);
    // The profiles' icons coming in: the rows and the panel's header show them.
    icons.changes.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.cd.detectChanges());
    this.loadOwners();
    this.loadKind();
  }

  // -- filters, paging --------------------------------------------------------------------------

  setSearch(terms: string[]): void {
    this.filters = { ...this.filters, search: terms };
    this.reload();
  }

  setProfiles(ids: string[]): void {
    this.filters = { ...this.filters, profiles: ids };
    this.reload();
    this.loadStatusCounts();
  }

  setStatuses(ids: string[]): void {
    this.filters = { ...this.filters, statuses: ids as EntityStatus[] };
    this.reload();
    this.loadProfileCounts();
  }

  clearFilters(): void {
    this.filters = NO_ENTITY_FILTERS;
    this.reload();
    this.loadFacets();
  }

  onPage(e: { page: number; pageSize: number }): void {
    if (e.page === this.page && e.pageSize === this.pageSize) {
      return;
    }
    this.page = e.page;
    this.pageSize = e.pageSize;
    this.loadPage();
  }

  /** A header click: the server sorts — from the first page (the table's own page-0 request then matches, and is skipped). */
  onSort(sort: DataTableSort | null): void {
    this.sort = sort;
    this.page = 0;
    this.loadPage();
  }

  /** A filter changed: back to the first page. */
  private reload(): void {
    this.page = 0;
    this.loadPage();
  }

  private loadKind(): void {
    this.page = 0;
    this.rows = [];
    this.total = 0;
    this.loadPage();
    this.loadProfiles().subscribe(() => this.loadFacets());
  }

  // -- data ------------------------------------------------------------------------------------------------

  /** The entities' filter: the picked profiles', else every one of the kind. */
  private entityFilter(profiles = this.filters.profiles): EntityFilter {
    if (!profiles.length) {
      return { type: AliasFilterType.entityType, entityType: ENTITY_TYPE_OF[this.kind] } as EntityFilter;
    }
    return (this.kind === "device"
      ? { type: AliasFilterType.deviceType, deviceTypes: profiles, deviceNameFilter: "" }
      : { type: AliasFilterType.assetType, assetTypes: profiles, assetNameFilter: "" }) as EntityFilter;
  }

  /** A device's status filter (one of the two picked): its `active` server attribute. */
  private statusFilters(statuses = this.filters.statuses): KeyFilter[] {
    if (this.kind !== "device" || statuses.length !== 1) {
      return [];
    }
    return [
      {
        key: { type: EntityKeyType.SERVER_ATTRIBUTE, key: "active" },
        valueType: EntityKeyValueType.BOOLEAN,
        predicate: { type: FilterPredicateType.BOOLEAN, operation: BooleanOperation.EQUAL, value: { defaultValue: statuses[0] === "active" } },
      } as KeyFilter,
    ];
  }

  /** The page shown: the filters, the search, the sort — from the server. */
  private loadPage(): void {
    this.pageRequest?.unsubscribe();
    this.loading = true;
    const sortKey = SORT_KEYS[this.sort?.key ?? "name"] ?? SORT_KEYS["name"];
    const query: EntityDataQuery = {
      entityFilter: this.entityFilter(),
      keyFilters: this.statusFilters(),
      entityFields: [
        { type: EntityKeyType.ENTITY_FIELD, key: "name" },
        { type: EntityKeyType.ENTITY_FIELD, key: "label" },
        { type: EntityKeyType.ENTITY_FIELD, key: "type" },
        { type: EntityKeyType.ENTITY_FIELD, key: "createdTime" },
        { type: EntityKeyType.ENTITY_FIELD, key: "additionalInfo" },
        ...OWNER_ENTITY_FIELDS,
      ],
      latestValues: [
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: LOCATION_KEYS.site },
        ...(this.kind === "device" ? [{ type: EntityKeyType.SERVER_ATTRIBUTE, key: "active" }] : []),
      ],
      pageLink: {
        page: this.page,
        pageSize: this.pageSize,
        textSearch: this.filters.search.join(" ") || undefined,
        sortOrder: { key: sortKey, direction: this.sort?.direction === "desc" ? Direction.DESC : Direction.ASC },
      },
    };
    const kind = this.kind;
    this.pageRequest = this.ctx.entityService
      .findEntityDataByQuery(query, QUIET_REQUEST)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this.rows = page.data.map((d: any) => {
            const f = d.latest?.[EntityKeyType.ENTITY_FIELD] ?? {};
            const a = d.latest?.[EntityKeyType.SERVER_ATTRIBUTE] ?? {};
            const created = parseNumber(f["createdTime"]?.value);
            const active = a["active"]?.value;
            return {
              id: d.entityId.id,
              kind,
              name: String(f["name"]?.value ?? ""),
              label: String(f["label"]?.value ?? ""),
              profile: String(f["type"]?.value ?? ""),
              owner: ownerCustomer(f),
              site: String(a[LOCATION_KEYS.site]?.value ?? ""),
              active: kind === "device" ? active === true || active === "true" : null,
              createdTime: created,
              created: formatWhen(created),
              description: parseDescription(f["additionalInfo"]?.value),
            };
          });
          this.total = page.totalElements ?? this.rows.length;
          this.loading = false;
          this.cd.detectChanges();
        },
        error: (err) => {
          this.loading = false;
          this.rows = [];
          this.total = 0;
          this.notices?.error(`Couldn't load the ${this.noun}s${apiMessage(err)}`);
          this.cd.detectChanges();
        },
      });
  }

  /** The kind's profiles (read once): the Profile filter's options and the form's picker. */
  private loadProfiles(): Observable<EntityOption[]> {
    const kind = this.kind;
    const known = this.profiles[kind];
    if (known) {
      return of(known);
    }
    const path = kind === "device" ? "/api/deviceProfileInfos" : "/api/assetProfileInfos";
    return this.ctx.http.get<{ data: { id: { id: string }; name: string }[] }>(`${path}?pageSize=1000&page=0&sortProperty=name&sortOrder=ASC`, defaultHttpOptionsFromConfig(QUIET_REQUEST)).pipe(
      map((res) => (res?.data ?? []).map((p) => ({ value: p.id.id, label: p.name }))),
      catchError(() => of([] as EntityOption[])),
      map((list) => {
        this.profiles[kind] = list;
        this.cd.detectChanges();
        return list;
      }),
      takeUntilDestroyed(this.destroyRef)
    );
  }

  get profileChoices(): EntityOption[] {
    return this.profiles[this.kind] ?? [];
  }

  private loadFacets(): void {
    this.loadProfileCounts();
    this.loadStatusCounts();
  }

  /** Each profile's count under the status filter (a count query each — the search isn't counted). */
  private loadProfileCounts(): void {
    const kind = this.kind;
    const profiles = this.profiles[kind] ?? [];
    if (!profiles.length) {
      this.profileOptions = [];
      return;
    }
    forkJoin(profiles.map((p) => this.count(this.entityFilter([p.label]), this.statusFilters())))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((counts) => {
        if (kind !== this.kind) {
          return;
        }
        this.profileOptions = profiles.map((p, i) => ({ id: p.label, label: p.label, count: counts[i] }));
        this.cd.detectChanges();
      });
  }

  /** A device's two statuses, each counted under the profile filter. */
  private loadStatusCounts(): void {
    if (this.kind !== "device") {
      this.statusOptions = [];
      return;
    }
    const statuses: EntityStatus[] = ["active", "inactive"];
    forkJoin(statuses.map((s) => this.count(this.entityFilter(), this.statusFilters([s]))))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((counts) => {
        this.statusOptions = statuses.map((s, i) => ({ id: s, label: STATUS_LABELS[s], count: counts[i] }));
        this.cd.detectChanges();
      });
  }

  private count(entityFilter: EntityFilter, keyFilters: KeyFilter[]): Observable<number> {
    return this.ctx.http.post<number>("/api/entitiesQuery/count", { entityFilter, keyFilters }, defaultHttpOptionsFromConfig(QUIET_REQUEST)).pipe(
      map((n) => Number(n) || 0),
      catchError(() => of(0))
    );
  }

  /** The owners a form can pick: the tenant, then every customer. */
  private loadOwners(): void {
    this.ctx.http
      .get<{ data: { id: { id: string }; title: string }[] }>("/api/customers?pageSize=1000&page=0&sortProperty=title&sortOrder=ASC")
      .pipe(
        catchError(() => of({ data: [] as { id: { id: string }; title: string }[] })),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((res) => {
        this.ownerOptions = [{ value: "", label: "Tenant (no customer)" }, ...(res?.data ?? []).map((c) => ({ value: c.id.id, label: c.title }))];
        this.cd.detectChanges();
      });
  }

  // -- Manage ------------------------------------------------------------------------------------------

  /** The footer's Manage state (`tb-table-links`): the page shown is what "Select page" covers — the rest is on the server. */
  readonly manage = tableManageOf({
    managing: () => this.managing,
    selectedCount: () => this.checkedRows.length,
    allChecked: () => this.allPageChecked,
    count: () => this.rows.length,
    start: () => this.startManage(),
    end: () => this.endManage(),
    toggleAll: () => this.togglePageChecked(),
  });

  startManage(): void {
    this.managing = true;
    this.closePanel();
  }

  endManage(): void {
    this.managing = false;
    this.checkedRows = [];
  }

  onSelection(rows: Record<string, any>[]): void {
    this.checkedRows = rows as EntityRow[];
  }

  /** Every row of the page shown is checked. */
  get allPageChecked(): boolean {
    return this.rows.length > 0 && this.rows.every((r) => this.checkedRows.some((c) => c.id === r.id));
  }

  togglePageChecked(): void {
    this.table?.checkAll(!this.allPageChecked);
  }

  askDelete(rows: EntityRow[]): void {
    if (rows.length) {
      this.deleteConfirm = rows;
    }
  }

  get deleteHeading(): string {
    const rows = this.deleteConfirm ?? [];
    return rows.length === 1 ? `Delete ${this.noun} ${rows[0].label || rows[0].name}?` : `Delete ${rows.length} ${this.noun}s?`;
  }

  get deleteMessage(): string {
    return `This deletes ${(this.deleteConfirm?.length ?? 0) === 1 ? "it" : "them"} from ThingsBoard for good, with ${
      this.kind === "device" ? "their telemetry, attributes, credentials" : "their telemetry, attributes"
    } and relations. It can't be undone.`;
  }

  confirmDelete(): void {
    const rows = this.deleteConfirm ?? [];
    this.deleteConfirm = null;
    if (!rows.length) {
      return;
    }
    this.saving = true;
    const del = (r: EntityRow) =>
      (r.kind === "device" ? this.ctx.deviceService.deleteDevice(r.id, QUIET_REQUEST) : this.ctx.assetService.deleteAsset(r.id, QUIET_REQUEST)).pipe(
        map(() => true),
        catchError(() => of(false))
      );
    forkJoin(rows.map(del))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((done) => {
        this.saving = false;
        const ok = done.filter(Boolean).length;
        if (ok === rows.length) {
          this.notices?.success(ok === 1 ? `${rows[0].label || rows[0].name} deleted` : `${ok} ${this.noun}s deleted`);
        } else {
          this.notices?.error(`Deleted ${ok} of ${rows.length} ${this.noun}s — the rest couldn't be.`);
        }
        if (this.editing && rows.some((r) => r.id === this.editing?.id)) {
          this.closePanel();
        }
        this.endManage();
        this.loadPage();
        this.loadFacets();
      });
  }

  // -- the side panel ----------------------------------------------------------------------------------

  openAdd(): void {
    this.editing = null;
    this.editingEntity = null;
    this.resetKey++;
    this.panelOpen = true;
  }

  openRow(row: Record<string, any>): void {
    if (this.managing) {
      return;
    }
    const r = row as EntityRow;
    this.editing = r;
    this.editingEntity = null;
    this.resetKey++;
    this.panelOpen = true;
    // As ThingsBoard holds it: its profile, owner and description, the form's start.
    const read$: Observable<any> = r.kind === "device" ? this.ctx.deviceService.getDevice(r.id, QUIET_REQUEST) : this.ctx.assetService.getAsset(r.id, QUIET_REQUEST);
    read$
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((entity) => {
        if (this.editing?.id === r.id) {
          this.editingEntity = entity;
          this.cd.detectChanges();
        }
      });
  }

  closePanel(): void {
    this.panelOpen = false;
  }

  get selectedId(): string | null {
    return this.panelOpen && this.editing ? this.editing.id : null;
  }

  get panelName(): string {
    return this.editing ? this.editing.label || this.editing.name : `New ${this.noun}`;
  }

  get panelSubtitle(): string {
    return this.editing ? `${this.editing.profile}${this.editing.site ? " · " + this.editing.site : ""}` : "";
  }

  /** Details' Save: a new device / asset, or the edited one — and its owner, when it changed. */
  save(draft: EntityDraft): void {
    const kind = this.kind;
    const editing = this.editing;
    const before = this.editingEntity;
    const profileId = kind === "device" ? { entityType: EntityType.DEVICE_PROFILE, id: draft.profileId } : { entityType: EntityType.ASSET_PROFILE, id: draft.profileId };
    const body: any = {
      ...(before ?? {}),
      name: draft.name,
      label: draft.label,
      ...(kind === "device" ? { deviceProfileId: profileId } : { assetProfileId: profileId }),
      additionalInfo: { ...(before?.additionalInfo ?? {}), description: draft.description },
    };
    delete body.type; // the profile id names it
    this.saving = true;
    const save$: Observable<any> = kind === "device" ? this.ctx.deviceService.saveDevice(body, QUIET_REQUEST) : this.ctx.assetService.saveAsset(body, QUIET_REQUEST);
    save$
      .pipe(
        switchMap((saved) => this.moveOwner(kind, saved.id.id, draft.ownerId, before).pipe(map(() => saved))),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (saved) => {
          this.saving = false;
          this.notices?.success(`${draft.label || draft.name} ${editing ? "saved" : "created"}`);
          if (editing) {
            this.editingEntity = saved;
            this.editing = { ...editing, name: draft.name, label: draft.label, description: draft.description };
          } else {
            this.closePanel();
          }
          this.loadPage();
          this.loadFacets();
        },
        error: (err) => {
          this.saving = false;
          const msg = apiMessage(err);
          this.notices?.error(/already exists/i.test(msg) ? `A ${this.noun} named ${draft.name} already exists.` : `Couldn't ${editing ? "save" : "create"} the ${this.noun}${msg}`);
          this.cd.detectChanges();
        },
      });
  }

  /** The entity to this owner (ThingsBoard PE) — when it isn't its owner already. */
  private moveOwner(kind: EntityKind, id: string, ownerId: string, before: any): Observable<unknown> {
    // A new one is the tenant's; an edited one, its customer's or the tenant's.
    const current = before?.ownerId?.entityType === "CUSTOMER" ? String(before.ownerId.id) : "";
    if (ownerId === current) {
      return of(null);
    }
    const tenantId = this.ctx.currentUser?.tenantId ?? before?.tenantId?.id;
    const url = ownerId ? `/api/owner/CUSTOMER/${ownerId}/${ENTITY_TYPE_OF[kind]}/${id}` : `/api/owner/TENANT/${tenantId}/${ENTITY_TYPE_OF[kind]}/${id}`;
    return this.ctx.http.post(url, [], defaultHttpOptionsFromConfig(QUIET_REQUEST));
  }

  /** The form's owner, as it starts: the edited one's customer, else the tenant. */
  get editingOwnerId(): string {
    return this.editingEntity?.ownerId?.entityType === "CUSTOMER" ? this.editingEntity.ownerId.id : "";
  }

  get editingProfileId(): string {
    const id = this.kind === "device" ? this.editingEntity?.deviceProfileId?.id : this.editingEntity?.assetProfileId?.id;
    return id ?? "";
  }
}
