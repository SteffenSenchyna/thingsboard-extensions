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

import { DestroyRef } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { Observable, forkJoin, from, of } from "rxjs";
import { catchError, map, mergeMap, switchMap, toArray } from "rxjs/operators";
import { AliasFilterType, Asset, Direction, EntityDataQuery, EntityFilter, EntityKeyType, EntityRelation, EntityType, PageLink } from "@shared/public-api";
import { WidgetContext } from "@home/models/widget-component.models";
import { byNamePageLink } from "../dashboard/dashboard-subscriptions";
import { SavedTableSort } from "../dashboard/table-columns";
import { defaultHttpOptionsFromConfig } from "@core/public-api";
import { QUIET_REQUEST, apiMessage, parseDescription, parseNumber, parseObject } from "../value-utils";
import { SegmentOption } from "../segmented-control/segmented-control.component";
import { TagPickerOption } from "../tag-picker/tag-picker.component";
import type { OrganizationStore } from "../organization/organization-store";
import type { PanelStop, PanelTrail } from "../panel-trail/panel-trail";
import { Application, ApplicationDraft, ApplicationSettings, applicationName } from "./applications.models";

/** Where the store reports what it did (a dashboard's toasts). */
export interface ApplicationNotices {
  success(message: string): void;
  error(message: string): void;
}

/** A dashboard's own work around its applications (every hook optional). */
export interface ApplicationHooks {
  /** The list was set (loaded, or renamed in place): the dashboard's tags / filters / columns follow. */
  listChanged?: () => void;
  /** The list and each one's devices ({@link ApplicationStore.members}) were loaded afresh (after {@link listChanged}). */
  loaded?: () => void;
  /** These applications (ids) were deleted. */
  deleted?: (ids: string[]) => void;
}

/** The panel's tabs: a new application's, and an existing one's when the dashboard shows where they run. */
const APPLICATION_TAB: SegmentOption = { id: "application", label: "Application", icon: "apps", tooltip: "Application" };
const PANEL_TABS: SegmentOption[] = [APPLICATION_TAB];
const PANEL_TABS_WITH_SITES: SegmentOption[] = [APPLICATION_TAB, { id: "sites", label: "Sites", icon: "factory", tooltip: "Sites" }];

/** The Applications table's columns a saved sort may name (the settings table's, some of them only when the dashboard shows them). */
const APPLICATION_SORT_KEYS = ["name", "label", "description", "profiles", "assetProfiles", "sites", "count", "created"];

/**
 * A dashboard's applications — assets of their profile: a plant, a product
 * line, a project — and their editing: the application panel ("Create new",
 * a row) and the delete confirmation. A dashboard makes one (with its toasts
 * and its change detection) and shows it with `tb-application-settings` (the
 * Settings page's table) and `tb-application-panels` (the panel and the
 * confirmation, in the dashboard root). A dashboard that applies them to
 * devices names the relation ({@link ApplicationSettings.memberRelation}):
 * each application's devices load with the list ({@link members}). One that
 * shows where they run names that relation
 * ({@link ApplicationSettings.siteRelation}) and hands over its Organization
 * ({@link org}): the panel's Sites tab lists where an application runs — a
 * relation to each, kept by the "Application Sites" rule chain (a plant with
 * a device of the app's device profiles) — a site opening its own panel
 * ({@link openSiteOf}). An application names the device and asset profiles
 * that are its own (where it runs; a market's fuel codes apply at the sites
 * an app owning their profile runs at).
 */
export class ApplicationStore {
  /** In the order they show (by label). */
  applications: Application[] = [];
  loading = false;
  /** The list (and each application's sites) has been read once: what runs where is known. */
  loaded = false;
  /** Each application's devices (ids) — by {@link ApplicationSettings.memberRelation}, when the dashboard names one. */
  members = new Map<string, string[]>();
  /**
   * Each application's sites (ids) — by {@link ApplicationSettings.siteRelation}, when the dashboard names one (a new map on
   * each load): where it runs, as the "Application Sites" rule chain keeps it. Access reads it — a group's apps are those
   * running in its scope.
   */
  sites = new Map<string, string[]>();
  /**
   * The dashboard's Organization — its sites, their markets and product lines
   * — for the Sites tab (with a {@link ApplicationSettings.siteRelation}).
   */
  org: OrganizationStore | null = null;
  private panelTrail: PanelTrail | null = null;

  /** The Applications table's help (its "?" beside the title): open — `tb-organization-help`, in `tb-application-panels`. */
  helpOpen = false;

  /** The application panel: open, and the application being edited (null: a new one). */
  panelOpen = false;
  editing: Application | null = null;
  /** Bumped on each open: the form resets. */
  resetKey = 0;
  /** The tab the panel opens on (a row: Application; its Sites count: Sites). */
  panelTab = "application";
  /** The other applications' names (a name is unique), taken as the panel opens. */
  otherNames: string[] = [];
  /** ThingsBoard's device and asset profiles and the tenant's dashboards, for the form's pickers (loaded as the panel first opens). */
  deviceProfileOptions: TagPickerOption[] = [];
  assetProfileOptions: TagPickerOption[] = [];
  dashboardOptions: TagPickerOption[] = [];
  private profilesLoaded = false;
  /** "Delete (n)" on the managed list: what's to go, once confirmed. */
  deleteConfirm: Application[] = [];
  saving = false;

  constructor(
    private ctx: WidgetContext,
    private destroyRef: DestroyRef,
    readonly settings: ApplicationSettings,
    private notices: ApplicationNotices,
    /** Re-render the dashboard (its change detection) after an async change. */
    private changed: () => void,
    private hooks: ApplicationHooks = {}
  ) {
    this.sort = new SavedTableSort("applicationSort", () => APPLICATION_SORT_KEYS, ctx, destroyRef, changed);
  }

  /** The Applications table's sort (a header click), kept in the user's settings — read as the table first shows. */
  readonly sort: SavedTableSort;

  /** The panel's tabs: Application — and Sites, for an existing one, when the dashboard shows where they run. */
  get panelTabs(): SegmentOption[] {
    return this.editing && this.settings.siteRelation && this.org ? PANEL_TABS_WITH_SITES : PANEL_TABS;
  }

  /** The application whose panel is open (its id): its table row is highlighted while it is. */
  get selectedId(): string | null {
    return this.panelOpen && this.editing ? this.editing.id : null;
  }

  /**
   * Every asset of the applications' profile (its description and its
   * device / asset profiles from its additional info) — then, when the dashboard applies them,
   * each one's relations to its devices and its sites.
   */
  load(): void {
    this.loading = true;
    const query: EntityDataQuery = {
      entityFilter: { type: AliasFilterType.assetType, assetTypes: [this.settings.assetType] } as EntityFilter,
      keyFilters: [],
      pageLink: byNamePageLink(),
      entityFields: [
        { type: EntityKeyType.ENTITY_FIELD, key: "name" },
        { type: EntityKeyType.ENTITY_FIELD, key: "label" },
        { type: EntityKeyType.ENTITY_FIELD, key: "additionalInfo" },
        { type: EntityKeyType.ENTITY_FIELD, key: "createdTime" },
      ],
      latestValues: [],
    };
    const { memberRelation, siteRelation } = this.settings;
    this.ctx.entityService
      .findEntityDataByQuery(query, QUIET_REQUEST)
      .pipe(
        map((page) =>
          page.data
            .map((d: any): Application => {
              const fields = d.latest?.[EntityKeyType.ENTITY_FIELD] ?? {};
              const info = parseObject(fields["additionalInfo"]?.value);
              return {
                id: d.entityId.id as string,
                name: String(fields["name"]?.value ?? ""),
                label: String(fields["label"]?.value ?? ""),
                description: parseDescription(fields["additionalInfo"]?.value),
                deviceProfiles: stringList(info["deviceProfiles"]),
                assetProfiles: stringList(info["assetProfiles"]),
                dashboardIds: stringList(info["dashboardIds"]),
                createdTime: parseNumber(fields["createdTime"]?.value),
              };
            })
            .sort((a, b) => applicationName(a).localeCompare(applicationName(b), undefined, { numeric: true }))
        ),
        switchMap((apps) => {
          if ((!memberRelation && !siteRelation) || !apps.length) {
            return of({ apps, members: new Map<string, string[]>(), sites: new Map<string, string[]>() });
          }
          return forkJoin(
            apps.map((a) =>
              this.ctx.entityRelationService.findByFrom({ entityType: EntityType.ASSET, id: a.id }, QUIET_REQUEST).pipe(catchError(() => of([] as EntityRelation[])))
            )
          ).pipe(
            map((relations) => {
              // Its devices (the member relation to a device) and its sites (the site relation to an asset).
              const members = new Map<string, string[]>();
              const sites = new Map<string, string[]>();
              const to = (list: EntityRelation[], type: string | undefined, entityType: EntityType) =>
                type ? list.filter((r) => r.type === type && r.to?.entityType === entityType).map((r) => r.to.id as string) : [];
              apps.forEach((a, i) => {
                members.set(a.id, to(relations[i], memberRelation, EntityType.DEVICE));
                sites.set(a.id, to(relations[i], siteRelation, EntityType.ASSET));
              });
              return { apps, members, sites };
            })
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: ({ apps, members, sites }) => {
          this.loading = false;
          this.loaded = true;
          this.members = members;
          this.sites = sites;
          this.setApplications(apps);
          this.hooks.loaded?.();
          this.changed();
        },
        error: () => {
          this.loading = false;
          this.changed();
        },
      });
  }

  /** The list in hand (loaded, or one renamed in place): the dashboard follows. */
  setApplications(list: Application[]): void {
    this.applications = list;
    this.hooks.listChanged?.();
  }

  /** An application's asset saved: a new one of the profile (id null), or the edited one's name, label, description and profiles. */
  saveAsset(id: string | null, draft: ApplicationDraft): Observable<Asset> {
    const { name, label } = draft;
    const info = { description: draft.description.trim(), deviceProfiles: draft.deviceProfiles, assetProfiles: draft.assetProfiles, dashboardIds: draft.dashboardIds };
    return id
      ? this.ctx.assetService
          .getAsset(id, QUIET_REQUEST)
          .pipe(switchMap((asset) => this.ctx.assetService.saveAsset({ ...asset, name, label, additionalInfo: { ...(asset.additionalInfo ?? {}), ...info } }, QUIET_REQUEST)))
      : this.ctx.assetService.saveAsset({ name, label, type: this.settings.assetType, additionalInfo: info } as Asset, QUIET_REQUEST);
  }

  // -- the panel -----------------------------------------------------------------------------------

  openAdd(): void {
    this.openPanel(null);
  }

  openEdit(a: Application): void {
    this.openPanel(a);
  }

  /** An application's Sites count (the table's): its panel, on the Sites tab. */
  openSites(a: Application): void {
    this.openPanel(a, "sites");
  }

  /** A site's row on the Sites tab: its panel, the Organization's — the next stop on the panels' trail (which closes this one). */
  openSiteOf(id: string): void {
    const site = this.org?.sites.rows.find((s) => s.id === id);
    if (!site) {
      return;
    }
    if (!this.panelTrail) {
      this.closePanel(); // no trail to close it: one panel at a time
    }
    this.org?.openEdit("site", site);
  }

  closePanel(): void {
    this.panelOpen = false;
  }

  /** The side panels' trail (`tb-panel-trail`) — the dashboard's Access sets its own here: an application's panel is a stop on it. */
  get trail(): PanelTrail | null {
    return this.panelTrail;
  }

  set trail(trail: PanelTrail | null) {
    this.panelTrail = trail;
    trail?.join(this, () => this.closePanel());
  }

  /** The panel shows this tab: where its stop on the trail opens again. */
  noteTab(tab: string): void {
    if (this.panelOpen) {
      // The tab it opens on follows the tab shown: opening it on another is then a change the panel sees.
      this.panelTab = tab;
    }
    if (this.panelOpen && this.editing) {
      this.panelTrail?.noteTab(`application:${this.editing.id}`, tab);
    }
  }

  private panelStop(id: string): PanelStop {
    const find = () => this.applications.find((a) => a.id === id);
    return {
      key: `application:${id}`,
      icon: "apps",
      kind: "Application",
      label: () => {
        const app = find();
        return app ? app.label || app.name : null;
      },
      isOpen: () => this.panelOpen && this.editing?.id === id,
      open: (tab) => {
        const app = find();
        if (app) {
          this.openPanel(app, tab);
        }
      },
      close: () => this.closePanel(),
    };
  }

  private openPanel(a: Application | null, tab = "application"): void {
    // The trail first (it reads what's open now): an application's panel is a stop on it; a blank form ends it.
    if (a) {
      this.panelTrail?.visit(this, this.panelStop(a.id));
    } else {
      this.panelTrail?.reset(this);
    }
    this.editing = a;
    this.panelTab = tab;
    this.otherNames = this.applications.filter((x) => x.id !== a?.id).map((x) => x.name);
    this.resetKey++;
    this.panelOpen = true;
    this.loadProfiles();
  }

  /** ThingsBoard's device and asset profiles (their names) and the tenant's dashboards, once: the form's pickers. */
  private loadProfiles(): void {
    if (this.profilesLoaded) {
      return;
    }
    this.profilesLoaded = true;
    const names = (path: string) =>
      this.ctx.http.get<{ name: string }[]>(path, defaultHttpOptionsFromConfig(QUIET_REQUEST)).pipe(
        map((list) => (list ?? []).map((p) => ({ id: p.name, label: p.name })).sort((a, b) => a.label.localeCompare(b.label))),
        catchError(() => of([] as TagPickerOption[]))
      );
    // The tenant's dashboards, a page of them (the list endpoint wants its page size and number).
    const dashboards = this.ctx.dashboardService
      .getTenantDashboards(new PageLink(1024, 0, undefined, { property: "title", direction: Direction.ASC }), QUIET_REQUEST)
      .pipe(
        map((page) => (page?.data ?? []).map((d) => ({ id: d.id.id, label: d.title }))),
        catchError(() => of([] as TagPickerOption[]))
      );
    forkJoin({ devices: names("/api/deviceProfile/names?activeOnly=false"), assets: names("/api/assetProfile/names?activeOnly=false"), dashboards })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ devices, assets, dashboards }) => {
        this.deviceProfileOptions = devices;
        this.assetProfileOptions = assets;
        this.dashboardOptions = dashboards;
        this.changed();
      });
  }

  /** The panel's Save: a new application's asset, or the edited one's; the list reloads. */
  submit(draft: ApplicationDraft): void {
    const existing = this.editing;
    this.saving = true;
    this.saveAsset(existing?.id ?? null, draft)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving = false;
          this.notices.success(`Application ${draft.label || draft.name} ${existing ? "saved" : "created"}`);
          this.closePanel();
          this.load();
          this.changed();
        },
        error: (err) => {
          this.saving = false;
          const msg = apiMessage(err);
          this.notices.error(/already exists/i.test(msg) ? `An asset named ${draft.name} already exists.` : `Couldn't ${existing ? "save" : "create"} the application${msg}`);
          this.changed();
        },
      });
  }

  // -- deleting ---------------------------------------------------------------------------------------

  /** "Delete (n)" on the managed list: confirm first. */
  askDelete(list: Application[]): void {
    if (list.length) {
      this.deleteConfirm = list;
    }
  }

  cancelDelete(): void {
    this.deleteConfirm = [];
  }

  get deleteHeading(): string {
    return this.deleteConfirm.length === 1 ? "Delete application?" : "Delete applications?";
  }

  get deleteMessage(): string {
    const list = this.deleteConfirm;
    const noun = this.settings.appliedNoun;
    if (list.length === 1) {
      const lose = noun ? `, and the ${noun}s it's applied to lose it` : "";
      return `Application ${applicationName(list[0])} will be deleted${lose}. This cannot be undone.`;
    }
    const lose = noun ? `, and the ${noun}s they're applied to lose them` : "";
    return `${list.length} applications will be deleted${lose}. This cannot be undone.`;
  }

  /** The applications' assets deleted one by one (a few at a time) — their relations go with them; the list reloads with what's left. */
  confirmDelete(): void {
    const list = this.deleteConfirm;
    this.deleteConfirm = [];
    if (!list.length) {
      return;
    }
    this.saving = true;
    from(list)
      .pipe(
        mergeMap(
          (a) =>
            this.ctx.assetService.deleteAsset(a.id, QUIET_REQUEST).pipe(
              map(() => a.id),
              catchError(() => of(null))
            ),
          4
        ),
        toArray(),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((results) => {
        this.saving = false;
        const gone = results.filter((id): id is string => !!id);
        const failed = results.length - gone.length;
        if (failed) {
          this.notices.error(`Deleted ${gone.length} of ${results.length} applications — ${failed} couldn't be deleted.`);
        } else {
          this.notices.success(gone.length === 1 ? `Application ${applicationName(list[0])} deleted` : `${gone.length} applications deleted`);
        }
        this.hooks.deleted?.(gone);
        // The application open in the panel (its Manage card's Delete) is gone: the panel closes.
        if (this.panelOpen && this.editing && gone.includes(this.editing.id)) {
          this.closePanel();
        }
        this.load();
        this.changed();
      });
  }
}

/** A list of names out of stored JSON (anything else: none). */
function stringList(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string" && !!x) : [];
}
