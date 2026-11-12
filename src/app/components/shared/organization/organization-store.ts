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
import {
  AliasFilterType,
  Asset,
  AttributeScope,
  EntityDataQuery,
  EntityFilter,
  EntityId,
  EntityKeyType,
  EntityKeyValueType,
  EntityRelation,
  EntityType,
  FilterPredicateType,
  RelationTypeGroup,
  StringOperation,
} from "@shared/public-api";
import { WidgetContext } from "@home/models/widget-component.models";
import { byNamePageLink } from "../dashboard/dashboard-subscriptions";
import { OWNER_ENTITY_FIELDS, ownerCustomer } from "../entity-owner";
import { QUIET_REQUEST, apiMessage, parseNumber } from "../value-utils";
import { SegmentOption } from "../segmented-control/segmented-control.component";
import { SavedColumnChoice, SavedTableSort } from "../dashboard/table-columns";
import { TbSelectOption } from "../select/select.component";
import type { TagPickerOption } from "../tag-picker/tag-picker.component";
import type { PanelStop, PanelTrail } from "../panel-trail/panel-trail";
import {
  ASSET_KINDS,
  AssetDraft,
  AssetKind,
  AssetList,
  AssetRow,
  EMPTY_ASSET_LIST,
  NO_SITE_FILTER,
  OrganizationSettings,
  MARKET_COLUMNS,
  PRODUCT_LINE_COLUMNS,
  SITE_COLUMNS,
  SITE_FACETS,
  SiteFacet,
  SiteFilter,
  productLineLabel,
  productLineOptions,
  productLineTree,
  subProductLines,
} from "./organization.models";
import { ItemUser, loadItemUsers } from "./item-users";
import { HIERARCHY_COUNT_KEYS } from "./hierarchy-counts";
import { profileIconsOf } from "../profile-icons/profile-icons";


/** No users (an item without any, or none read yet) — one list, so a view bound to it sees no change. */
const NO_USERS: ItemUser[] = [];
/** Where the store reports what it did (a dashboard's toasts). */
export interface OrganizationNotices {
  success(message: string): void;
  error(message: string): void;
}

/**
 * A dashboard's own work around the Organization's lists. Every hook is
 * optional; those returning an Observable run inside the save / delete, before
 * its toast (a dashboard keeping the assets' names in its devices' attributes
 * updates them there).
 */
export interface OrganizationHooks {
  /** A list was set (loading, loaded, its sites' links resolved): the dashboard's filters / pickers follow. */
  listChanged?: (kind: AssetKind) => void;
  /** An asset was created (`before` null) or edited (`before` its old row) — and a site's links saved. */
  afterSave?: (e: { kind: AssetKind; before: AssetRow | null; draft: AssetDraft }) => Observable<unknown>;
  /** One of several sites edited together ("Edit (n)") got these links. */
  afterSiteRelinked?: (e: { site: AssetRow; links: AssetDraft }) => Observable<unknown>;
  /** These assets were deleted. */
  afterDelete?: (e: { kind: AssetKind; assets: AssetRow[] }) => Observable<unknown>;
  /** A save, an edit together or a delete went through (the lists reload; a dashboard may reload what it builds from them). */
  edited?: (kind: AssetKind) => void;
}

/**
 * Who else follows the Organization's edits (the access store: each product
 * line's, market's and site's default access groups). Told once an edit went
 * through — its own work (and toasts) follow on their own.
 */
export interface OrganizationFollower {
  /**
   * An asset was created (`before` null) or edited — or a site relinked
   * ("Edit (n)"): its row as it now is; `changed`: a site's market, product
   * line or applications did — what the groups covering it open.
   */
  saved?(e: { kind: AssetKind; asset: AssetRow; before: AssetRow | null; changed?: boolean }): void;
  /** These assets were deleted. */
  deleted?(e: { kind: AssetKind; assets: AssetRow[] }): void;
  /** What else deleting these takes — a sentence for the confirmation ("" nothing). */
  deleteNote?(e: { kind: AssetKind; assets: AssetRow[] }): string;
}

/** The applications, as a site's form needs them (the dashboard's `ApplicationStore`, when it assigns applications to sites). */
export interface OrganizationSiteApps {
  /** The applications, a picker's options. */
  readonly siteAppOptions: TagPickerOption[];
  /** Those that run at a site (ids). */
  appsAt(siteId: string): string[];
  /** Exactly these run at the site: how many relations failed. */
  setSiteApps(siteId: string, appIds: string[]): Observable<number>;
}

/** The access groups, as an item's panel lists them (the dashboard's `AccessStore`, which sets itself here). */
export interface OrganizationAccess {
  /** Changes whenever the groups do (the rows rebuild then). */
  readonly groupsVersion: unknown;
  /** The groups are in. */
  readonly groupsLoaded: boolean;
  /** The groups are being read (the Sites page's loader waits for them: its Groups column). */
  readonly groupsLoading: boolean;
  /** Read the groups, if they weren't yet. */
  loadAccess(): void;
  /** The groups reaching an item: a site's — every group covering it, its own first; a market's or a product line's — those whose scope is it. */
  groupsOf(kind: AssetKind, asset: AssetRow): OrganizationGroupRow[];
  /** How many groups cover each site (by its id) — its Groups tab's rows, counted for the Sites table. */
  siteGroupCounts(): Map<string, number>;
  /** How many groups have each market or product line (by its id) as their scope — its Groups tab's rows, counted for their tables. */
  itemGroupCounts(): Map<string, number>;
  /** A group's row: its panel (the item's closes — it stays on the panels' trail). */
  openGroupOf(id: string): void;
  /** A user's row: their panel. */
  openUserOf(id: string): void;
  /** Changes whenever the users do (the Users tab's rows rebuild then). */
  readonly usersVersion: unknown;
  /** A user's role ("Viewer") and its place among the roles (the Users tab groups by it, in that order); null: not among the users read. */
  userRoleOf(id: string): { name: string; order: number } | null;
}

export interface OrganizationGroupRow {
  id: string;
  name: string;
  role: string;
  members: number;
}

/** A device at a site (its panel's Devices tab). */
export interface SiteDevice {
  id: string;
  name: string;
  type: string;
}

const NONE: TbSelectOption = { value: "", label: "None" };
const NO_APPS: string[] = [];

/** A site's Google Chat webhook: the server attribute the Alarm Routing chain posts the site's alarms to. */
const SITE_CHAT_KEY = "googleChatUrl";

/**
 * The Organization's lists — product lines, markets and sites: the assets of
 * three asset profiles, a site linked from the market that contains it and the
 * product line that covers it, a sub product line from its parent product line
 * (any depth, the same relation) — and their editing: the asset panel ("Create
 * new", a row, or the sites' "Edit (n)") and the delete confirmation. A
 * dashboard makes one (with its toasts and its change detection) and shows it
 * with `tb-organization-settings` (the Settings page's tables) and
 * `tb-organization-panels` (the panel and the confirmation, in the dashboard
 * root).
 */
export class OrganizationStore {
  productLines: AssetList = EMPTY_ASSET_LIST;
  markets: AssetList = EMPTY_ASSET_LIST;
  sites: AssetList = EMPTY_ASSET_LIST;
  /** A site's pickers: the product lines (a sub line after its parent) and markets ("None" first), built with their lists. */
  productLineOptions: TbSelectOption[] = [NONE];
  marketOptions: TbSelectOption[] = [NONE];
  /** A product line's parent picker: "None", then every line but itself and those under it (no cycles), named after the lines above them. */
  parentOptions: TbSelectOption[] = [NONE];

  /** The table whose help is open (its "?" beside the title — Product lines, Markets, Sites), null: none — `tb-organization-help`, in the dashboard root with the panels. */
  help: AssetKind | null = null;

  /** The asset panel: open, the list's kind, the asset when editing one — or the sites when editing several. */
  panelOpen = false;
  panelKind: AssetKind = "productLine";
  editing: AssetRow | null = null;
  bulk: AssetRow[] = [];
  /** Each item's users (those whose own scope is it), by its id — read as an Organization page shows ({@link loadItemUsers}); null until in. */
  itemUsers: Map<string, ItemUser[]> | null = null;
  /** The panel's tab: the item ("asset") or its users ("users" — its Users count opens it there). */
  panelTab = "asset";
  /** Bumped on each open: the form resets. */
  resetKey = 0;
  /** A site's Google Chat webhook (its `googleChatUrl` server attribute), read as its panel opens — null while it's read, "" for none. */
  panelChatUrl: string | null = null;
  panelTabs: SegmentOption[] = [];
  private panelTrail: PanelTrail | null = null;
  /** The panel's list's names (a name is unique in it), taken as it opens. */
  panelNames: string[] = [];
  /** "Delete (n)" on a managed list: what's to go, once confirmed. */
  deleteConfirm: { kind: AssetKind; assets: AssetRow[] } | null = null;
  saving = false;
  /** Bumped once a bulk edit is applied: the tables leave Manage. */
  manageDoneKey = 0;
  /** The Sites page's filters (`tb-site-filters` in the Settings sidebar): what its table shows. */
  siteFilter: SiteFilter = NO_SITE_FILTER;
  /** The Sites table's "Customize columns": the user's pick, kept in their settings. */
  readonly siteColumns: SavedColumnChoice;
  /** Each table's sort (a header click), kept in the user's settings — read as its page first shows. */
  readonly sorts: Record<AssetKind, SavedTableSort>;
  /** "Customize columns" (at the foot of `tb-site-filters`): the picker open beside the filters — the dashboard widens its sidebar for it (`settingsSidebarWidth`). */
  columnPickerOpen = false;

  /**
   * The sites' links (each site's market and product line: one lookup per
   * site) are wanted — the Settings page has been shown. Until then the site
   * list loads without them.
   */
  private siteLinksWanted = false;
  private followers: OrganizationFollower[] = [];
  /** The applications (set by the dashboard's `ApplicationStore`): a site's form then has its Applications — what runs there. */
  siteApps: OrganizationSiteApps | null = null;
  /** The access groups (set by the dashboard's `AccessStore`): an item's panel then has its Groups tab. */
  access: OrganizationAccess | null = null;
  /** The open site's devices (its panel's Devices tab: those stored at it) — null while they're read. */
  panelDevices: SiteDevice[] | null = null;
  private appsAtPanel?: { site: string; from: unknown; ids: string[] };

  /** A site's form: the applications to pick from (none: the dashboard has no applications at sites). */
  get panelAppOptions(): TagPickerOption[] {
    return this.siteApps?.siteAppOptions ?? [];
  }

  /** The open site's applications (those running there), the same list until they change. */
  get panelAppIds(): string[] {
    const site = this.panelKind === "site" && !this.bulk.length ? this.editing : null;
    if (!this.siteApps || !site) {
      return NO_APPS;
    }
    const from = this.siteApps.siteAppOptions;
    const ids = this.siteApps.appsAt(site.id);
    const c = this.appsAtPanel;
    if (c && c.site === site.id && c.from === from && c.ids.length === ids.length && c.ids.every((id, i) => id === ids[i])) {
      return c.ids;
    }
    this.appsAtPanel = { site: site.id, from, ids };
    return ids;
  }

  constructor(
    private ctx: WidgetContext,
    private destroyRef: DestroyRef,
    readonly settings: OrganizationSettings,
    private notices: OrganizationNotices,
    /** Re-render the dashboard (its change detection) after an async change. */
    private changed: () => void,
    private hooks: OrganizationHooks = {}
  ) {
    this.siteColumns = new SavedColumnChoice(SITE_COLUMNS, "siteColumns", ctx, destroyRef, changed);
    // The profiles' icons coming in: the panel's header takes its kind's.
    profileIconsOf(ctx).changes.pipe(takeUntilDestroyed(destroyRef)).subscribe(() => changed());
    const keys = (columns: { key: string }[]) => () => columns.map((c) => c.key);
    this.sorts = {
      productLine: new SavedTableSort("productLineSort", keys(PRODUCT_LINE_COLUMNS), ctx, destroyRef, changed),
      market: new SavedTableSort("marketSort", keys(MARKET_COLUMNS), ctx, destroyRef, changed),
      site: new SavedTableSort("siteSort", keys(SITE_COLUMNS), ctx, destroyRef, changed),
    };
  }

  /** Follow the edits (see {@link OrganizationFollower}). */
  follow(follower: OrganizationFollower): void {
    this.followers.push(follower);
  }

  // -- the Sites page's filters ----------------------------------------------------------------------

  setSiteFilter(patch: Partial<SiteFilter>): void {
    this.siteFilter = { ...this.siteFilter, ...patch };
  }

  /** "Clear filters": the search and the picks. */
  clearSiteFilter(): void {
    this.siteFilter = NO_SITE_FILTER;
  }

  get hasSiteFilter(): boolean {
    const f = this.siteFilter;
    return !!f.search.length || SITE_FACETS.some((k) => f[k].length > 0);
  }

  /** A site's facets: its product line and its market ("" for none). */
  siteFacets(site: AssetRow): Record<SiteFacet, string[]> {
    return { productLines: [site.productLineId ?? ""], markets: [site.marketId ?? ""] };
  }

  /** A site passes the filters: each facet's picks (none: any) — `skip` one to count its options under the other. */
  sitePasses(site: AssetRow, filter = this.siteFilter, skip?: SiteFacet): boolean {
    const facets = this.siteFacets(site);
    return SITE_FACETS.every((k) => k === skip || !filter[k].length || facets[k].some((v) => filter[k].includes(v)));
  }

  list(kind: AssetKind): AssetList {
    return kind === "productLine" ? this.productLines : kind === "market" ? this.markets : this.sites;
  }

  loadAll(): void {
    (["productLine", "market", "site"] as AssetKind[]).forEach((kind) => this.load(kind));
  }

  /**
   * The Settings page shown: from now on the site list loads with its links,
   * and loads them now if it has none yet.
   */
  wantSiteLinks(): void {
    if (this.siteLinksWanted) {
      return;
    }
    this.siteLinksWanted = true;
    const rows = this.sites.rows;
    if (rows.length && !this.sites.loading) {
      this.setList("site", { rows, loading: true });
      this.loadSiteLinks(rows);
    }
  }

  /** One of the lists: every asset of its profile, with its owning customer (a site, its links too once wanted). */
  load(kind: AssetKind): void {
    this.setList(kind, { rows: this.list(kind).rows, loading: true });
    const query: EntityDataQuery = {
      entityFilter: { type: AliasFilterType.assetType, assetTypes: [this.settings[ASSET_KINDS[kind].settingKey]] } as EntityFilter,
      keyFilters: [],
      pageLink: byNamePageLink(),
      entityFields: [
        { type: EntityKeyType.ENTITY_FIELD, key: "name" },
        { type: EntityKeyType.ENTITY_FIELD, key: "label" },
        { type: EntityKeyType.ENTITY_FIELD, key: "createdTime" },
        ...OWNER_ENTITY_FIELDS,
      ],
      // A site's devices: the count the hierarchy's calculated field keeps on it (the Sites table's Devices column).
      latestValues: kind === "site" ? [{ type: EntityKeyType.TIME_SERIES, key: HIERARCHY_COUNT_KEYS.devices }] : [],
    };
    this.ctx.entityService
      .findEntityDataByQuery(query, QUIET_REQUEST)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          const rows: AssetRow[] = page.data.map((d: any) => {
            const fields = d.latest?.[EntityKeyType.ENTITY_FIELD] ?? {};
            const series = d.latest?.[EntityKeyType.TIME_SERIES] ?? {};
            return {
              id: d.entityId.id as string,
              name: String(fields["name"]?.value ?? ""),
              label: String(fields["label"]?.value ?? ""),
              owner: ownerCustomer(fields),
              createdTime: parseNumber(fields["createdTime"]?.value),
              ...(kind === "site" ? { devices: parseNumber(series[HIERARCHY_COUNT_KEYS.devices]?.value) ?? 0 } : {}),
            };
          });
          // The product lines' parents (one lookup per line — a few); a reload keeps those already known meanwhile.
          if (kind === "productLine" && rows.length) {
            const before = new Map(this.productLines.rows.map((l) => [l.id, l.parentId]));
            this.setList("productLine", { rows: rows.map((r) => ({ ...r, parentId: before.get(r.id) ?? null })), loading: true });
            this.changed();
            this.loadLineParents(rows);
            return;
          }
          // The sites' links once wanted (one lookup per site); a reload keeps those already known meanwhile.
          if (kind === "site" && rows.length && this.siteLinksWanted) {
            const before = new Map(this.sites.rows.map((s) => [s.id, s.links]));
            this.setList("site", { rows: rows.map((r) => ({ ...r, links: before.get(r.id) })), loading: true });
            this.changed();
            this.loadSiteLinks(rows);
            return;
          }
          this.setList(kind, { rows, loading: false });
          this.changed();
        },
        error: () => {
          this.setList(kind, { rows: this.list(kind).rows, loading: false });
          this.changed();
        },
      });
  }

  // -- the asset panel ---------------------------------------------------------------------------

  /**
   * The side panels' trail (`tb-panel-trail`) — the dashboard's Access sets
   * its own here, its panels and these leading to each other: an item's panel
   * is a stop on it.
   */
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
    if (this.panelOpen && this.editing && !this.bulk.length) {
      this.panelTrail?.noteTab(`${this.panelKind}:${this.editing.id}`, tab);
    }
  }

  private panelStop(kind: AssetKind, id: string): PanelStop {
    const meta = ASSET_KINDS[kind];
    const find = () => this.list(kind).rows.find((a) => a.id === id);
    const icons = profileIconsOf(this.ctx);
    const assetType = this.settings[meta.settingKey];
    return {
      key: `${kind}:${id}`,
      // The panel header's: its kind's asset profile's icon (read as the strip shows it — it may come in later).
      get icon() {
        return icons.of("asset", assetType);
      },
      kind: meta.noun.charAt(0).toUpperCase() + meta.noun.slice(1),
      label: () => {
        const asset = find();
        return asset ? asset.label || asset.name : null;
      },
      isOpen: () => this.panelOpen && this.panelKind === kind && !this.bulk.length && this.editing?.id === id,
      open: (tab) => {
        const asset = find();
        if (asset) {
          this.openPanel(kind, asset, [], tab);
        }
      },
      close: () => this.closePanel(),
    };
  }

  get panelNoun(): string {
    return ASSET_KINDS[this.panelKind].noun;
  }

  /** The panel's header: the kind's asset profile's icon (Site, Market, ProductLine — as every dashboard shows those assets). */
  get panelIcon(): string {
    return profileIconsOf(this.ctx).of("asset", this.settings[ASSET_KINDS[this.panelKind].settingKey]);
  }

  get panelName(): string {
    if (this.bulk.length) {
      return `Edit ${this.bulk.length} ${this.bulk.length === 1 ? this.panelNoun : ASSET_KINDS[this.panelKind].plural.toLowerCase()}`;
    }
    return this.editing ? this.editing.label || this.editing.name : `New ${this.panelNoun}`;
  }

  /** The asset whose panel is open (its id): its table row is highlighted while it is. */
  get selectedId(): string | null {
    return this.panelOpen && this.editing ? this.editing.id : null;
  }

  /** "Create new" on a list: the panel, blank. */
  openAdd(kind: AssetKind): void {
    this.openPanel(kind, null);
  }

  /** A row of one of the lists: the asset's panel, to edit its name and label (a site's links too). */
  openEdit(kind: AssetKind, asset: AssetRow): void {
    this.openPanel(kind, asset);
  }

  /** An item's Users count (its table's): its panel, on the Users tab. */
  openUsers(kind: AssetKind, asset: AssetRow): void {
    this.openPanel(kind, asset, [], "users");
  }

  /** An item's groups (the access matrix's row, a site's Groups count): its panel, on the Groups tab. */
  openGroups(kind: AssetKind, asset: AssetRow): void {
    this.openPanel(kind, asset, [], "groups");
  }

  /** A site's Devices count: its panel, on the Devices tab. */
  openDevices(asset: AssetRow): void {
    this.openPanel("site", asset, [], "devices");
  }

  /** "Edit (n)" on the managed sites or product lines: the panel with the pickers alone — the sites' product line and market, the lines' parent, set together. */
  openBulkEdit(kind: AssetKind, rows: AssetRow[]): void {
    this.openPanel(kind, null, rows);
  }

  closePanel(): void {
    this.panelOpen = false;
  }

  private openPanel(kind: AssetKind, asset: AssetRow | null, bulk: AssetRow[] = [], tab = "asset"): void {
    // The trail first (it reads what's open now): an item's panel is a stop on it; a blank form or "Edit (n)" ends it.
    if (asset && !bulk.length) {
      this.panelTrail?.visit(this, this.panelStop(kind, asset.id));
    } else {
      this.panelTrail?.reset(this);
    }
    const meta = ASSET_KINDS[kind];
    this.panelKind = kind;
    this.editing = asset;
    this.bulk = bulk;
    const name = meta.noun.charAt(0).toUpperCase() + meta.noun.slice(1);
    // An existing item (not "Edit (n)"): its users too.
    const single = !!asset && !bulk.length;
    // …and the groups reaching it (the dashboard has Access), and a site's devices.
    this.panelTabs = [
      { id: "asset", label: name, icon: meta.icon, tooltip: name },
      ...(single ? [{ id: "users", label: "Users", icon: "person", tooltip: "Users" }] : []),
      ...(single && this.access ? [{ id: "groups", label: "Groups", icon: "groups", tooltip: "Groups" }] : []),
      ...(single && kind === "site" ? [{ id: "devices", label: "Devices", icon: "sensors", tooltip: "Devices" }] : []),
    ];
    this.panelTab = single && this.panelTabs.some((t) => t.id === tab) ? tab : "asset";
    if (single) {
      this.access?.loadAccess();
    }
    this.panelDevices = null;
    if (single && kind === "site" && asset) {
      this.loadSiteDevices(asset);
    }
    this.panelNames = this.list(kind).rows.map((a) => a.name);
    if (kind === "productLine") {
      // A parent: any line but the one(s) edited and the lines under them — a line can't go under itself.
      const lines = this.productLines.rows;
      const edited = [...(asset ? [asset] : []), ...bulk].map((l) => l.id);
      const blocked = new Set([...edited, ...edited.flatMap((id) => subProductLines(id, lines))]);
      this.parentOptions = [
        NONE,
        ...productLineTree(lines)
          .filter((l) => !blocked.has(l.id))
          .map((l) => ({ value: l.id, label: productLineLabel(l, lines) })),
      ];
    }
    // A site's Google Chat webhook: read for the one being edited (a secret — never with the list), none for a new one.
    this.panelChatUrl = kind === "site" && asset && !bulk.length ? null : "";
    if (kind === "site" && asset && !bulk.length) {
      this.ctx.attributeService
        .getEntityAttributes({ entityType: EntityType.ASSET, id: asset.id }, AttributeScope.SERVER_SCOPE, [SITE_CHAT_KEY], QUIET_REQUEST)
        .pipe(catchError(() => of([])), takeUntilDestroyed(this.destroyRef))
        .subscribe((attrs) => {
          if (this.editing?.id === asset.id) {
            this.panelChatUrl = String(attrs.find((a) => a.key === SITE_CHAT_KEY)?.value ?? "");
            this.changed();
          }
        });
    }
    this.resetKey++;
    this.panelOpen = true;
  }

  /** The panel's Save: a new asset of the list's profile, or the edited one renamed / relabelled (or several sites relinked); the list reloads. */
  submit(draft: AssetDraft): void {
    const kind = this.panelKind;
    const meta = ASSET_KINDS[kind];
    if (this.bulk.length) {
      if (kind === "productLine") {
        this.reparentLines(this.bulk, draft);
      } else {
        this.relinkSites(this.bulk, draft);
      }
      return;
    }
    const editing = this.editing;
    const chatBefore = this.panelChatUrl ?? "";
    const appsWere = kind === "site" && editing && this.siteApps ? [...this.siteApps.appsAt(editing.id)] : [];
    const noun = meta.noun.charAt(0).toUpperCase() + meta.noun.slice(1);
    this.saving = true;
    const write = editing
      ? this.ctx.assetService
          .getAsset(editing.id, QUIET_REQUEST)
          .pipe(switchMap((asset) => this.ctx.assetService.saveAsset({ ...asset, name: draft.name, label: draft.label }, QUIET_REQUEST)))
      : this.ctx.assetService.saveAsset({ name: draft.name, label: draft.label, type: this.settings[meta.settingKey] } as Asset, QUIET_REQUEST);
    // A site: its product line and market links follow (relations to the saved asset); a product line: its parent's; then the dashboard's own follow-up.
    const followed = write.pipe(
      switchMap((saved) => {
        const id = saved.id.id;
        // (A site's applications too: those that run there, set from its side.)
        const apps = kind === "site" && draft.appIds && this.siteApps ? this.siteApps.setSiteApps(id, draft.appIds) : of(0);
        const linked =
          kind === "site"
            ? forkJoin([this.syncSiteLinks(id, draft, editing), this.saveSiteChat(id, draft.googleChatUrl, chatBefore), apps])
            : kind === "productLine"
              ? this.syncLineParent(id, draft.parentId, editing?.parentId)
              : of(null);
        const after = this.hooks.afterSave ? linked.pipe(switchMap(() => this.hooks.afterSave!({ kind, before: editing, draft }))) : linked;
        return after.pipe(map(() => id));
      })
    );
    followed.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (id) => {
        this.saving = false;
        this.notices.success(`${noun} ${draft.label || draft.name} ${editing ? "saved" : "created"}`);
        this.closePanel();
        this.load(kind);
        this.hooks.edited?.(kind);
        const asset: AssetRow = {
          ...(editing ?? { owner: "", createdTime: null }),
          id,
          name: draft.name,
          label: draft.label,
          ...(kind === "site" ? { productLineId: draft.productLineId || null, marketId: draft.marketId || null } : {}),
          ...(kind === "productLine" ? { parentId: draft.parentId || null } : {}),
        };
        // What the groups covering it open may have changed: a new item, or a site whose market, product line or applications did.
        const appsBefore = kind === "site" && editing ? appsWere : [];
        const moved =
          kind === "site" &&
          !!editing &&
          ((draft.productLineId ?? "") !== (editing.productLineId ?? "") ||
            (draft.marketId ?? "") !== (editing.marketId ?? "") ||
            (!!draft.appIds && (draft.appIds.length !== appsBefore.length || draft.appIds.some((a) => !appsBefore.includes(a)))));
        this.followers.forEach((f) => f.saved?.({ kind, asset, before: editing, changed: !editing || moved }));
        this.changed();
      },
      error: (err) => {
        this.saving = false;
        const msg = apiMessage(err);
        this.notices.error(/already exists/i.test(msg) ? `An asset named ${draft.name} already exists.` : `Couldn't ${editing ? "save" : "create"} the ${meta.noun}${msg}`);
        this.changed();
      },
    });
  }

  /** Several sites' links at once: each gets the picked product line / market (a picker left unchanged keeps the site's own). */
  private relinkSites(sites: AssetRow[], draft: AssetDraft): void {
    this.saving = true;
    from(sites)
      .pipe(
        mergeMap(
          (site) => {
            const links: AssetDraft = { ...draft, productLineId: draft.productLineId ?? (site.productLineId ?? ""), marketId: draft.marketId ?? (site.marketId ?? "") };
            const synced = this.syncSiteLinks(site.id, links, site);
            return (this.hooks.afterSiteRelinked ? synced.pipe(switchMap(() => this.hooks.afterSiteRelinked!({ site, links }))) : synced).pipe(
              map(() => {
                const asset: AssetRow = { ...site, productLineId: links.productLineId || null, marketId: links.marketId || null };
                this.followers.forEach((f) => f.saved?.({ kind: "site", asset, before: site, changed: true }));
                return true;
              }),
              catchError(() => of(false))
            );
          },
          4
        ),
        toArray(),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((results) => {
        this.saving = false;
        const done = results.filter(Boolean).length;
        const failed = results.length - done;
        if (failed) {
          this.notices.error(`Updated ${done} of ${results.length} sites — ${failed} couldn't be updated.`);
        } else {
          this.notices.success(done === 1 ? "1 site updated" : `${done} sites updated`);
        }
        this.closePanel();
        this.manageDoneKey++;
        this.load("site");
        this.hooks.edited?.("site");
        this.changed();
      });
  }

  /** Several product lines' parent at once — never a line under itself (the parent, or one under it, stays as it is). */
  private reparentLines(lines: AssetRow[], draft: AssetDraft): void {
    const parent = draft.parentId;
    if (parent === undefined) {
      this.closePanel();
      return;
    }
    const all = this.productLines.rows;
    const movable = lines.filter((l) => !parent || (l.id !== parent && !subProductLines(l.id, all).includes(parent)));
    const kept = lines.length - movable.length;
    this.saving = true;
    from(movable)
      .pipe(
        mergeMap(
          (line) =>
            this.syncLineParent(line.id, parent, line.parentId).pipe(
              map(() => true),
              catchError(() => of(false))
            ),
          4
        ),
        toArray(),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((results) => {
        this.saving = false;
        const done = results.filter(Boolean).length;
        const failed = results.length - done;
        const note = kept ? ` — ${kept} left as ${kept === 1 ? "it is: it's" : "they are: they're"} the parent or above it` : "";
        if (failed) {
          this.notices.error(`Updated ${done} of ${results.length} product lines — ${failed} couldn't be updated.`);
        } else {
          this.notices.success(`${done === 1 ? "1 product line" : `${done} product lines`} updated${note}`);
        }
        this.closePanel();
        this.manageDoneKey++;
        this.load("productLine");
        this.hooks.edited?.("productLine");
        this.changed();
      });
  }

  // -- deleting ---------------------------------------------------------------------------------------

  /** The items' users (the tables' Users column, the panel's Users tab), read again each time an Organization page shows. */
  loadItemUsers(): void {
    loadItemUsers(this.ctx)
      // Refused: no users rather than a page waiting on them.
      .pipe(
        catchError(() => of(new Map<string, ItemUser[]>())),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((users) => {
        this.itemUsers = users;
        this.changed();
      });
  }

  /** The panel's item's users (its Users tab), by name. */
  get panelUsers(): ItemUser[] {
    return (this.editing && this.itemUsers?.get(this.editing.id)) || NO_USERS;
  }

  /** A site's devices: those whose stored `site` is its code (the Device Site Attributes chain keeps it) — for its panel's Devices tab. */
  private loadSiteDevices(site: AssetRow): void {
    const query: EntityDataQuery = {
      entityFilter: { type: AliasFilterType.entityType, entityType: EntityType.DEVICE } as EntityFilter,
      entityFields: [
        { type: EntityKeyType.ENTITY_FIELD, key: "name" },
        { type: EntityKeyType.ENTITY_FIELD, key: "type" },
      ],
      latestValues: [],
      keyFilters: [
        {
          key: { type: EntityKeyType.SERVER_ATTRIBUTE, key: "site" },
          valueType: EntityKeyValueType.STRING,
          predicate: { type: FilterPredicateType.STRING, operation: StringOperation.EQUAL, value: { defaultValue: site.name }, ignoreCase: true },
        },
      ],
      pageLink: { page: 0, pageSize: 1000 },
    };
    this.ctx.entityService
      .findEntityDataByQuery(query, QUIET_REQUEST)
      .pipe(catchError(() => of(null)), takeUntilDestroyed(this.destroyRef))
      .subscribe((page) => {
        if (this.editing?.id !== site.id) {
          return;
        }
        const field = (d: any, key: string) => String(d.latest?.[EntityKeyType.ENTITY_FIELD]?.[key]?.value ?? "");
        this.panelDevices = (page?.data ?? [])
          .map((d: any) => ({ id: d.entityId.id as string, name: field(d, "name"), type: field(d, "type") }))
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
        this.changed();
      });
  }

  /** "Delete (n)" on a managed list: confirm first. */
  askDelete(kind: AssetKind, assets: AssetRow[]): void {
    if (assets.length) {
      this.deleteConfirm = { kind, assets };
    }
  }

  /** The panel's Manage card: "Delete <item>" — the item it shows, confirmed first. */
  askDeleteEditing(): void {
    if (this.editing && !this.bulk.length) {
      this.askDelete(this.panelKind, [this.editing]);
    }
  }

  cancelDelete(): void {
    this.deleteConfirm = null;
  }

  get deleteHeading(): string {
    return this.deleteConfirm?.assets.length === 1 ? "Delete asset?" : "Delete assets?";
  }

  get deleteMessage(): string {
    const c = this.deleteConfirm;
    if (!c) {
      return "";
    }
    const meta = ASSET_KINDS[c.kind];
    const notes = this.followers
      .map((f) => f.deleteNote?.({ kind: c.kind, assets: c.assets }) ?? "")
      .filter(Boolean)
      .map((n) => ` ${n}`)
      .join("");
    return c.assets.length === 1
      ? `${meta.noun.charAt(0).toUpperCase() + meta.noun.slice(1)} ${c.assets[0].label || c.assets[0].name} and its data will be deleted.${notes} This cannot be undone.`
      : `${c.assets.length} ${meta.plural.toLowerCase()} and their data will be deleted.${notes} This cannot be undone.`;
  }

  /** The assets deleted one by one (a few at a time); the list reloads with what's left. */
  confirmDelete(): void {
    const c = this.deleteConfirm;
    this.deleteConfirm = null;
    if (!c) {
      return;
    }
    const meta = ASSET_KINDS[c.kind];
    this.saving = true;
    from(c.assets)
      .pipe(
        mergeMap(
          (a) =>
            this.ctx.assetService.deleteAsset(a.id, QUIET_REQUEST).pipe(
              map(() => a),
              catchError(() => of(null))
            ),
          4
        ),
        toArray(),
        switchMap((done) => {
          const gone = done.filter((a): a is AssetRow => !!a);
          const follow = this.hooks.afterDelete && gone.length ? this.hooks.afterDelete({ kind: c.kind, assets: gone }) : of(null);
          return follow.pipe(map(() => ({ results: done.map((a) => !!a), gone })));
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(({ results, gone }) => {
        this.saving = false;
        if (gone.length) {
          this.followers.forEach((f) => f.deleted?.({ kind: c.kind, assets: gone }));
        }
        // The item open in the panel (its Manage card's Delete) is gone: the panel closes.
        if (this.panelOpen && this.editing && gone.some((a) => a.id === this.editing?.id)) {
          this.closePanel();
        }
        const deleted = results.filter(Boolean).length;
        const failed = results.length - deleted;
        if (failed) {
          this.notices.error(`Deleted ${deleted} of ${results.length} ${meta.plural.toLowerCase()} — ${failed} couldn't be deleted.`);
        } else {
          this.notices.success(deleted === 1 ? `1 ${meta.noun} deleted` : `${deleted} ${meta.plural.toLowerCase()} deleted`);
        }
        this.load(c.kind);
        this.hooks.edited?.(c.kind);
        this.changed();
      });
  }

  // -- the lists' state ---------------------------------------------------------------------------------

  private setList(kind: AssetKind, list: AssetList): void {
    const options = () => [NONE, ...list.rows.map((a) => ({ value: a.id, label: a.label || a.name }))];
    if (kind === "productLine") {
      this.productLines = list;
      this.productLineOptions = [NONE, ...productLineOptions(list.rows)];
    } else if (kind === "market") {
      this.markets = list;
      this.marketOptions = options();
    } else {
      this.sites = list;
    }
    this.resolveSiteLinks();
    this.hooks.listChanged?.(kind);
  }

  /** Each site's market and product line: its links resolved against those lists (a list reloading: the sites follow). */
  private resolveSiteLinks(): void {
    const markets = new Set(this.markets.rows.map((a) => a.id));
    const productLines = new Set(this.productLines.rows.map((a) => a.id));
    const s = this.settings;
    const rows = this.sites.rows.map((site) => {
      const links = site.links ?? [];
      const marketId = links.find((l) => l.type === s.marketSiteRelation && markets.has(l.fromId))?.fromId ?? null;
      const productLineId = links.find((l) => l.type === s.productLineSiteRelation && productLines.has(l.fromId))?.fromId ?? null;
      return site.marketId === marketId && site.productLineId === productLineId ? site : { ...site, marketId, productLineId };
    });
    if (rows.some((r, i) => r !== this.sites.rows[i])) {
      this.sites = { rows, loading: this.sites.loading };
    }
  }

  /** The product lines' parents: the product line each is related from (the product line → site relation's type). */
  private loadLineParents(rows: AssetRow[]): void {
    const ids = new Set(rows.map((r) => r.id));
    const type = this.settings.productLineSiteRelation;
    forkJoin(
      rows.map((r) => this.ctx.entityRelationService.findByTo({ entityType: EntityType.ASSET, id: r.id }, QUIET_REQUEST).pipe(catchError(() => of([] as EntityRelation[]))))
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((relations) => {
        const lines = rows.map((r, i) => ({
          ...r,
          parentId: relations[i].find((x) => x.type === type && x.from?.entityType === EntityType.ASSET && ids.has(x.from.id) && x.from.id !== r.id)?.from.id ?? null,
        }));
        this.setList("productLine", { rows: lines, loading: false });
        this.changed();
      });
  }

  /** The sites' links: every relation to each from an asset. */
  private loadSiteLinks(rows: AssetRow[]): void {
    forkJoin(
      rows.map((r) => this.ctx.entityRelationService.findByTo({ entityType: EntityType.ASSET, id: r.id }, QUIET_REQUEST).pipe(catchError(() => of([] as EntityRelation[]))))
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((relations) => {
        const linked = rows.map((r, i) => ({
          ...r,
          links: relations[i].filter((x) => x.from?.entityType === EntityType.ASSET).map((x) => ({ type: x.type, fromId: x.from.id })),
        }));
        this.setList("site", { rows: linked, loading: false });
        this.changed();
      });
  }

  /**
   * A site's links, as relations to it: the market that contains it and the
   * product line that covers it — each removed when it changes, the new one
   * made (none: the relation's just removed).
   */
  /** A site's Google Chat webhook saved (or, emptied, removed) — when it changed. */
  private saveSiteChat(siteId: string, url: string | undefined, before: string): Observable<unknown> {
    if (url === undefined || url === before) {
      return of(null);
    }
    const id = { entityType: EntityType.ASSET, id: siteId };
    return url
      ? this.ctx.attributeService.saveEntityAttributes(id, AttributeScope.SERVER_SCOPE, [{ key: SITE_CHAT_KEY, value: url }], QUIET_REQUEST)
      : this.ctx.attributeService.deleteEntityAttributes(id, AttributeScope.SERVER_SCOPE, [{ key: SITE_CHAT_KEY, value: null }], QUIET_REQUEST);
  }

  private syncSiteLinks(siteId: string, draft: AssetDraft, before: AssetRow | null): Observable<unknown> {
    const steps = [
      ...this.linkSteps(siteId, this.settings.productLineSiteRelation, before?.productLineId, draft.productLineId),
      ...this.linkSteps(siteId, this.settings.marketSiteRelation, before?.marketId, draft.marketId),
    ];
    return steps.length ? forkJoin(steps) : of(null);
  }

  /** A product line's parent: the parent product line's relation to it (the product line → site one's type), moved when it changes. */
  private syncLineParent(lineId: string, next: string | undefined, prev: string | null | undefined): Observable<unknown> {
    if (next === undefined) {
      return of(null);
    }
    const steps = this.linkSteps(lineId, this.settings.productLineSiteRelation, prev, next);
    return steps.length ? forkJoin(steps) : of(null);
  }

  /** An asset's link from another, as a relation: the old one removed when it changes, the new one made (none: just removed). */
  private linkSteps(toId: string, type: string, prev: string | null | undefined, next: string | undefined): Observable<unknown>[] {
    const to: EntityId = { entityType: EntityType.ASSET, id: toId };
    const linkFrom = next || null;
    if ((prev ?? null) === linkFrom) {
      return [];
    }
    const steps: Observable<unknown>[] = [];
    if (prev) {
      steps.push(this.ctx.entityRelationService.deleteRelation({ entityType: EntityType.ASSET, id: prev }, type, to, QUIET_REQUEST));
    }
    if (linkFrom) {
      const relation: EntityRelation = { from: { entityType: EntityType.ASSET, id: linkFrom }, to, type, typeGroup: RelationTypeGroup.COMMON };
      steps.push(this.ctx.entityRelationService.saveRelation(relation, QUIET_REQUEST));
    }
    return steps;
  }
}
