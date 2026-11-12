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
import { SharedModule } from "@shared/public-api";
import { WidgetContext } from "@home/models/widget-component.models";
import { defaultHttpOptionsFromConfig } from "@core/public-api";
import { DataTableCellDirective, DataTableColumn, DataTableComponent, DataTableSort } from "../../../components/shared/data-table/data-table.component";
import { tableManageOf } from "../../../components/shared/data-table/table-manage";
import { TableLinksComponent } from "../../../components/shared/table-links/table-links.component";
import { SidebarLayoutComponent } from "../../../components/shared/sidebar-layout/sidebar-layout.component";
import { SearchBoxComponent } from "../../../components/shared/search-box/search-box.component";
import { StatusPillComponent } from "../../../components/shared/status-pill/status-pill.component";
import { EntityDetailPanelComponent } from "../../../components/shared/entity-detail-panel/entity-detail-panel.component";
import { ConfirmDialogComponent } from "../../../components/shared/confirm-dialog/confirm-dialog.component";
import { DashboardLoadingComponent, firstLoadsOf } from "../../../components/shared/dashboard-loading/dashboard-loading.component";
import { ManageActionComponent, ManageCardComponent } from "../../../components/shared/manage-card/manage-card.component";
import { TbSelectOption } from "../../../components/shared/select/select.component";
import { OrganizationNotices } from "../../../components/shared/organization/organization-store";
import { DEFAULT_PROFILE_ICON, ProfileKind, profileIconsOf, readProfileIcon, saveProfileIcon } from "../../../components/shared/profile-icons/profile-icons";
import { QUIET_REQUEST, apiMessage, parseNumber } from "../../../components/shared/value-utils";
import { formatWhen } from "../../../components/shared/time-format";
import {
  NO_PROFILE_CHOICES,
  PROFILE_NOUN,
  PROFILE_PANEL_TABS,
  PROFILE_PATH,
  PROFILES_PATH,
  PROFILE_SORT_PROPERTY,
  ProfileChoices,
  ProfileDraft,
  ProfileRow,
  profileBodyOf,
} from "./profile-manager.models";
import { ProfileFormComponent } from "./profile-form.component";

/** A ThingsBoard page of profiles. */
interface ProfilePage {
  data: any[];
  totalElements?: number;
}

/**
 * The tenant's device profiles — or its asset profiles — as ThingsBoard's own
 * Profiles pages hold them, in the Home dashboard (its rail's Entities menu,
 * tenant administrators'; `kind` says which): the search in the sidebar, the
 * table paged, sorted and searched on the server, "Create new | Manage"
 * (Delete) at its foot. A row opens its side panel: the Details form (name,
 * icon, description, default rule chain, queue, default dashboard, image —
 * a device profile's transport, alarm rules and provisioning kept as they
 * are) and its Manage card (Set as default, Delete). ThingsBoard refuses to
 * delete the default profile or one in use: its reason shows in the toast.
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
    DataTableCellDirective,
    TableLinksComponent,
    SidebarLayoutComponent,
    SearchBoxComponent,
    StatusPillComponent,
    EntityDetailPanelComponent,
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

  readonly panelTabs = PROFILE_PANEL_TABS;
  search: string[] = [];
  sidebarOpen = true;
  columns: DataTableColumn[] = [];

  // -- the table: one page from the server
  rows: ProfileRow[] = [];
  total = 0;
  page = 0;
  pageSize = 20;
  sort: DataTableSort | null = { key: "name", direction: "asc" };
  loading = true;
  private pageRequest?: Subscription;

  // -- Manage: rows checked to delete
  managing = false;
  checkedRows: ProfileRow[] = [];
  @ViewChild("table") private table?: DataTableComponent;

  // -- the side panel
  panelOpen = false;
  /** The row shown — null: a new one. */
  editing: ProfileRow | null = null;
  /** The edited profile as ThingsBoard holds it (null while it's read): the form's start, and what a save keeps. */
  editingProfile: any = null;
  /** The edited profile's icon ("" none; null while it's read). */
  editingIcon: string | null = null;
  choices: ProfileChoices = NO_PROFILE_CHOICES;
  saving = false;
  /** Bumped on every open: the form resets. */
  resetKey = 0;

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

  /** The loading page over the list: the page's first load, once per visit. */
  get pageLoading(): boolean {
    return firstLoadsOf(this.ctx).pending(`profiles:${this.kind}`, this.loading);
  }

  get hasFilters(): boolean {
    return this.search.length > 0;
  }

  /** The table's empty state: the kind's default icon. */
  get kindIcon(): string {
    return DEFAULT_PROFILE_ICON[this.kind];
  }

  ngOnInit(): void {
    const kind = this.kind;
    this.columns = [
      { key: "name", header: "Name", emphasis: "strong", maxWidth: "280px", iconOf: (r) => this.icons.ofId(kind, r["id"]) },
      { key: "description", header: "Description", emphasis: "muted", truncate: true },
      { key: "default", header: "Default" },
      { key: "created", header: "Created" },
    ];
    this.icons.load(kind);
    // Icons coming in (read, or saved here): the rows and the panel's header show them.
    this.icons.changes.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.cd.detectChanges());
    this.loadPage();
    this.loadChoices();
  }

  // -- search, paging ---------------------------------------------------------------------------

  setSearch(terms: string[]): void {
    this.search = terms;
    this.page = 0;
    this.loadPage();
  }

  clearFilters(): void {
    this.setSearch([]);
  }

  onPage(e: { page: number; pageSize: number }): void {
    if (e.page === this.page && e.pageSize === this.pageSize) {
      return;
    }
    this.page = e.page;
    this.pageSize = e.pageSize;
    this.loadPage();
  }

  /** A header click: the server sorts — from the first page. */
  onSort(sort: DataTableSort | null): void {
    this.sort = sort;
    this.page = 0;
    this.loadPage();
  }

  // -- data ------------------------------------------------------------------------------------------------

  private loadPage(): void {
    this.pageRequest?.unsubscribe();
    this.loading = true;
    const kind = this.kind;
    const params = new URLSearchParams({
      pageSize: String(this.pageSize),
      page: String(this.page),
      sortProperty: PROFILE_SORT_PROPERTY[this.sort?.key ?? "name"] ?? "name",
      sortOrder: this.sort?.direction === "desc" ? "DESC" : "ASC",
    });
    const text = this.search.join(" ").trim();
    if (text) {
      params.set("textSearch", text);
    }
    this.pageRequest = this.ctx.http
      .get<ProfilePage>(`${PROFILES_PATH[kind]}?${params.toString()}`, defaultHttpOptionsFromConfig(QUIET_REQUEST))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this.rows = (page?.data ?? []).map((p) => {
            const created = parseNumber(p.createdTime);
            return {
              id: String(p.id.id),
              kind,
              name: String(p.name ?? ""),
              description: String(p.description ?? ""),
              isDefault: p.default === true,
              createdTime: created,
              created: formatWhen(created),
            };
          });
          this.total = page?.totalElements ?? this.rows.length;
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
    this.checkedRows = rows as ProfileRow[];
  }

  get allPageChecked(): boolean {
    return this.rows.length > 0 && this.rows.every((r) => this.checkedRows.some((c) => c.id === r.id));
  }

  togglePageChecked(): void {
    this.table?.checkAll(!this.allPageChecked);
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
        this.loadPage();
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
          this.loadPage();
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
    this.editing = null;
    this.editingProfile = null;
    this.editingIcon = "";
    this.resetKey++;
    this.panelOpen = true;
  }

  openRow(row: Record<string, any>): void {
    if (this.managing) {
      return;
    }
    const r = row as ProfileRow;
    const kind = this.kind;
    this.editing = r;
    this.editingProfile = null;
    this.editingIcon = null;
    this.resetKey++;
    this.panelOpen = true;
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

  /** Details' Create / Apply: the profile (all it holds besides kept), then its icon when it changed. */
  save(draft: ProfileDraft): void {
    const kind = this.kind;
    const editing = this.editing;
    const before = editing ? this.editingProfile : null;
    const iconBefore = editing ? (this.editingIcon ?? "") : "";
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
          return icon$.pipe(map((iconSaved) => ({ saved, iconSaved })));
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: ({ saved, iconSaved }) => {
          this.saving = false;
          const id = String(saved.id.id);
          const icon = iconSaved ? draft.icon : iconBefore;
          this.icons.put(kind, id, draft.name, icon);
          if (iconSaved) {
            this.notices?.success(`${draft.name} ${editing ? "saved" : "created"}`);
          } else {
            this.notices?.error(`${draft.name} ${editing ? "saved" : "created"}, but its icon couldn't be saved.`);
          }
          if (editing && this.editing?.id === editing.id) {
            this.editingProfile = saved;
            this.editingIcon = icon;
            this.editing = { ...editing, name: draft.name, description: draft.description };
          } else if (!editing) {
            this.closePanel();
          }
          this.loadPage();
        },
        error: (err) => {
          this.saving = false;
          const msg = apiMessage(err);
          this.notices?.error(/already exists/i.test(msg) ? `A ${this.noun} named ${draft.name} already exists.` : `Couldn't ${editing ? "save" : "create"} the ${this.noun}${msg}`);
          this.cd.detectChanges();
        },
      });
  }
}
