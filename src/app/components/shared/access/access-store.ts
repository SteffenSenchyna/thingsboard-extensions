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
import { Observable, defer, forkJoin, from, of, throwError, timer } from "rxjs";
import { catchError, concatMap, finalize, map, mergeMap, shareReplay, switchMap, tap, toArray } from "rxjs/operators";
import { defaultHttpOptionsFromConfig } from "@core/public-api";
import {
  AliasFilterType,
  AttributeScope,
  EntityDataQuery,
  EntityFilter,
  EntityKeyType,
  EntityRelation,
  EntitySearchDirection,
  EntityType,
} from "@shared/public-api";
import { WidgetContext } from "@home/models/widget-component.models";
import { QUIET_REQUEST, apiMessage } from "../value-utils";
import { siteLocationLabel } from "../organization/site-locations";
import { OWNER_ENTITY_FIELDS, ownerCustomer } from "../entity-owner";
import { DEVICE_PLACE_KEYS, DevicePlace, SITE_DEVICE_RELATION, devicePlaceOf, isTestName, loadMobileProfiles, placeDevice, relinkGateway } from "../organization/device-places";
import { SegmentOption } from "../segmented-control/segmented-control.component";
import { TbSelectOption } from "../select/select.component";
import type { OrganizationStore } from "../organization/organization-store";
import type { ApplicationStore } from "../applications/application-store";
import type { Application } from "../applications/applications.models";
import { AssetKind, AssetRow, lineWithin, orgFilterOptions, subProductLines } from "../organization/organization.models";
import type { FilterListOption } from "../filter-list/filter-list.component";
import { SavedColumnChoice, SavedTableSort, SavedToggle } from "../dashboard/table-columns";
import type { DataTableSort } from "../data-table/data-table.component";
import { PanelStop, PanelTrail } from "../panel-trail/panel-trail";
import {
  ACCESS_GROUP_COLUMNS,
  ACCESS_ACTION_ROWS,
  ACCESS_GROUP_FACETS,
  ACCESS_MATRIX_COLUMNS,
  ACCESS_MATRIX_ROLE,
  ACCESS_ROLE_COLUMNS,
  ACCESS_ROLE_FACETS,
  ACCESS_SCOPE_TYPES,
  TENANT_ROLE_GROUP_NAMES,
  TENANT_SCOPE_TYPE,
  tenantRoleIcon,
  ACCESS_USER_COLUMNS,
  ACCESS_USER_FACETS,
  AccessBlocks,
  AccessFacet,
  AccessFilter,
  AccessGroup,
  AccessGroupDraft,
  AccessHealthCheck,
  AccessHealthItem,
  AccessLevel,
  AccessPage,
  AccessRole,
  AccessRoleDraft,
  BUILT_IN_ROLES,
  parseRoles,
  roleAppliesTo,
  broadestLevel,
  plantPickScopes,
  plantsOfGroups,
  plantsScope,
  AccessScope,
  AccessSettings,
  AccessUser,
  EVERYTHING,
  ALL_FACET_VALUES,
  NO_ACCESS_FILTER,
  NO_SCOPE,
  accessInfo,
  accessScopeType,
  accessUserName,
  completeScope,
  defaultGroupName,
  itemScope,
  levelFromAttribute,
  parseAccess,
  scopeAttributes,
  scopeFromAttributes,
  scopeItems,
  scopeKey,
  scopeLabel,
  scopeSites,
  SITE_WIDE_RELATIONS,
  appsRunningIn,
  OLD_HOME_KEYS,
} from "./access.models";

/** Where the store reports what it did (a dashboard's toasts). */
export interface AccessNotices {
  success(message: string): void;
  error(message: string): void;
}

/** The roles the groups' permissions use — found by name, made when missing (tenant roles). */
const ROLES = {
  viewer: { name: "Access · Viewer", type: "GROUP", permissions: ["READ", "READ_ATTRIBUTES", "READ_TELEMETRY"] },
  operator: {
    name: "Access · Operator",
    type: "GROUP",
    permissions: ["READ", "READ_ATTRIBUTES", "READ_TELEMETRY", "WRITE", "WRITE_ATTRIBUTES", "WRITE_TELEMETRY", "RPC_CALL"],
  },
  // The generic role every access group has: the alarms — and the user's own profile (Settings › Account: their name, their Google Chat
  // webhook and the alarm notifications they pick), which ThingsBoard lets a user edit only with PROFILE — and the device and asset
  // profiles' attributes: each profile's icon, what every dashboard shows its devices / assets by (profile-icons.ts; a customer user
  // may otherwise read a profile's name only).
  alarmReader: {
    name: "Access · Alarm reader",
    type: "GENERIC",
    permissions: { ALARM: ["READ"], PROFILE: ["ALL"], DEVICE_PROFILE: ["READ_ATTRIBUTES"], ASSET_PROFILE: ["READ_ATTRIBUTES"] },
  },
  alarmOperator: {
    name: "Access · Alarm operator",
    type: "GENERIC",
    permissions: { ALARM: ["READ", "WRITE"], PROFILE: ["ALL"], DEVICE_PROFILE: ["READ_ATTRIBUTES"], ASSET_PROFILE: ["READ_ATTRIBUTES"] },
  },
  memberManager: { name: "Access · Member manager", type: "GROUP", permissions: ["READ", "ADD_TO_GROUP", "REMOVE_FROM_GROUP"] },
  // A role's other combinations (Access › Roles): an edit or a control without the rest, the members seen only.
  editor: { name: "Access · Editor", type: "GROUP", permissions: ["WRITE", "WRITE_ATTRIBUTES", "WRITE_TELEMETRY"] },
  controller: { name: "Access · Controller", type: "GROUP", permissions: ["RPC_CALL"] },
  memberReader: { name: "Access · Member reader", type: "GROUP", permissions: ["READ"] },
} as const;
type RoleKey = keyof typeof ROLES;

/** One group permission a group should hold: a role, on an entity group (none: generic). */
interface PermissionSpec {
  role: RoleKey;
  groupId: string | null;
  groupType: string | null;
}

/** What a sync did. */
export interface AccessSyncReport {
  added: number;
  removed: number;
  /** In scope, but not the access owner's (not migrated yet): left out. */
  skipped: string[];
  /** Steps that failed — a lookup among them: nothing was removed, a sync again finishes it. */
  failed: number;
}

interface TbId {
  id: string;
  entityType?: string;
}

/** A device or asset with its profile and owner (an entity query's row). */
interface OwnedEntity {
  id: string;
  name: string;
  label: string;
  type: string;
  ownerType: string;
  ownerName: string;
}

/** A dashboard and its owner, as its own record says (`/api/dashboard/info`). */
interface DashboardOwner {
  id: string;
  title: string;
  owner: TbId;
}

/** How many ids an entity query looks up at once (in its body: no URL limit). */
const LOOKUP_CHUNK = 500;
/** How many groups a batch ("Sync all", "Add default groups") syncs at once. */
const BATCH_PARALLEL = 3;
/** How long the "Access Lifecycle" rule chain gets to act on an Organization edit before the groups reload. */
const RULE_CHAIN_SETTLE_MS = 3000;

// The panels' tabs: icons, their names in the tooltips (as every tab group).
const GROUP_TABS: SegmentOption[] = [{ id: "group", label: "Group", icon: "groups", tooltip: "Group" }];
const GROUP_TABS_WITH_MEMBERS: SegmentOption[] = [...GROUP_TABS, { id: "members", label: "Members", icon: "person", tooltip: "Members" }];
const USER_TABS: SegmentOption[] = [{ id: "details", label: "Details", icon: "person", tooltip: "Details" }];
const ADD_USER_TABS: SegmentOption[] = [{ id: "details", label: "User", icon: "person_add", tooltip: "User" }];
const ROLE_TABS: SegmentOption[] = [{ id: "role", label: "Role", icon: "badge", tooltip: "Role" }];
/** An existing role's: its groups and their members too, a compact list each. */
const ROLE_TABS_WITH_LISTS: SegmentOption[] = [
  ...ROLE_TABS,
  { id: "groups", label: "Groups", icon: "groups", tooltip: "Groups" },
  { id: "users", label: "Users", icon: "person", tooltip: "Users" },
];
/** The access owner's server attribute holding the roles (Access › Roles) — the Access Lifecycle rule chain reads it too. */
const ROLES_KEY = "accessRoles";

/**
 * A dashboard's access: the access owner's groups and users, their editing
 * (the group, user and add-user panels, the confirmations) and the sync
 * that turns a group's definition into ThingsBoard's own permissions. A
 * dashboard makes one (with its Organization and Applications — a group's
 * scope, and the apps running there) and shows it with `tb-access-settings`
 * (the Settings page's Groups / Users) and `tb-access-panels` (the panels
 * and dialogs, in the dashboard root).
 *
 * Access is by sites alone. A group, synced: three entity groups — every
 * device at its scope's sites (any profile), its scope's sites, markets and
 * product lines with every asset there and the Application assets of the
 * apps running in its scope ({@link groupApps}), and those apps' dashboards
 * with its other dashboards (the tenant's: a group holds only its owner's
 * entities) — and the group
 * permissions: Viewer / Operator on the first two, Viewer on the dashboards,
 * alarms read (or read and act on), and a manager's hold on the group's own
 * members. The default home (Home) opens for every user through one grant of
 * its own — and is where every user of the owner lands ({@link applyHomes}).
 * Only what the access owner owns can join the owner's groups: anything else
 * in scope is reported as not migrated.
 *
 * The Organization's items' groups live and die with them — the "Access
 * Lifecycle" rule chain (from the Root chain's Entity Created / Updated /
 * Deleted): a new product line, market or site moves to the access owner and
 * gets its three default groups (a level each, not synced yet); a renamed one's
 * default groups follow its name; a deleted one's groups go with it. A group
 * syncs when first joined, or with "Sync all". A user is in the default
 * groups of their role their plants become (several at once: nothing moves
 * them out of one when they join another — the chain's one-default-group
 * branch is disconnected since 2026-11-12).
 */
export class AccessStore {
  /** The access owner (the customer), once resolved. */
  ownerId = "";
  ownerTitle = "";
  ownerError = "";

  groups: AccessGroup[] = [];
  /** The access owner's users, then — a tenant administrator viewing — the tenant-level ones (the Tenant scope). */
  users: AccessUser[] = [];
  /**
   * The tenant's user groups ("All" left out; the default ones first, administrators first): the two default ones a Tenant scope
   * user's role (`TENANT_ROLE_GROUP_NAMES`), the others their access groups. A tenant administrator's view only.
   */
  tenantGroups: { id: string; name: string; role: boolean }[] = [];
  private tenantRoleCache?: { groups: { id: string; name: string }[]; roles: TbSelectOption[]; others: { id: string; label: string }[] };
  groupsLoading = false;
  /** The users are loading — the first time, until each one's last login is in too (no "Never" that turns into a date). */
  usersLoading = false;
  /** Each user's last login as their own record has it (read after the list): kept, so a later read of the list shows them at once. */
  private readonly lastLogins = new Map<string, number | null>();
  private lastLoginsRead = false;
  /** The roles (Access › Roles): the access owner's `accessRoles` — the three to start until any is saved. */
  roles: AccessRole[] = BUILT_IN_ROLES;
  rolesLoading = false;

  // -- the role panel
  rolePanelOpen = false;
  /** The tab the role panel opens on (a row: Role; back along the panels' trail: the one it was left on). */
  rolePanelTab = "role";
  /** The role being edited (null: a new one). */
  editingRole: AccessRole | null = null;
  roleResetKey = 0;
  deleteRoleConfirm: AccessRole | null = null;
  /** The role panel's tabs: the role — an existing one's groups and users too. */
  get roleTabs(): SegmentOption[] {
    return this.editingRole ? ROLE_TABS_WITH_LISTS : ROLE_TABS;
  }
  /** The tenant's dashboards (a group's other dashboards): "None", then each. */
  dashboardOptions: TbSelectOption[] = [{ value: "", label: "None" }];

  // -- the group panel
  groupPanelOpen = false;
  /** The tab it opens on (a row: Group; its Members count: Members). */
  groupPanelTab = "group";
  editingGroup: AccessGroup | null = null;
  groupResetKey = 0;
  /** The other groups' names (a name is unique among the owner's user groups). */
  otherGroupNames: string[] = [];
  deleteGroupsConfirm: AccessGroup[] = [];

  // -- the user panels
  userPanelOpen = false;
  editingUser: AccessUser | null = null;
  userResetKey = 0;
  addUserOpen = false;
  addUserResetKey = 0;
  deleteUserConfirm: AccessUser | null = null;
  /** The activation link to pass on (a new user without an email, or "Show activation link"). */
  activationDialog: { link: string; ttl: string } | null = null;
  /** "Add default groups (n)": how many are to be made, once confirmed (0: no dialog). */
  defaultsConfirm = 0;
  /** The Groups and Users pages' filters (`tb-access-filters` in the Settings sidebar): what their tables show. */
  /** The Groups page's filters — to start, the default groups shown ("View default groups") and the empty ones hidden ("Hide empty groups"). */
  groupFilter: AccessFilter = { ...NO_ACCESS_FILTER, showDefault: true, hideEmpty: true };
  userFilter: AccessFilter = NO_ACCESS_FILTER;
  /** The Roles page's (its search). */
  roleFilter: AccessFilter = NO_ACCESS_FILTER;
  /** The Groups and Users tables' "Customize columns": each table's pick, kept in the user's settings. */
  readonly groupColumns: SavedColumnChoice;
  readonly userColumns: SavedColumnChoice;
  readonly roleColumns: SavedColumnChoice;
  /** "Customize columns" (at the foot of `tb-access-filters`): the picker open beside the filters — the dashboard widens its sidebar for it (`settingsSidebarWidth`). */
  columnPickerOpen = false;
  /** Each table's sort for the visit (a header click): the picker marks its column. */
  /** The Groups and Users tables' sorts (a header click), kept in the user's settings — read as their page first shows. */
  /**
   * The side panels' trail (`tb-panel-trail`, in `tb-access-panels`): these
   * panels, the Organization's and the applications' lead to each other — a
   * plant's groups, a group's members, a role's groups, a check's items — so
   * they share one, each open panel a stop on it.
   */
  readonly trail = new PanelTrail();
  /** The Access table whose help is open (its "?" beside the title — Groups, Users, Roles), null: none — `tb-organization-help`, in `tb-access-panels`. */
  help: "accessGroup" | "user" | "role" | null = null;
  readonly groupSort: SavedTableSort;
  /** The Groups table's sort as a matrix ({@link groupMatrix}): by a scope column or a role's. */
  readonly groupMatrixSort: SavedTableSort;
  readonly userSort: SavedTableSort;
  readonly roleSort: SavedTableSort;
  /** The Groups table's "Similarity grouping" (the switch atop its filters): the groups of one scope folded under the first — kept in the user's settings. */
  readonly groupSimilar: SavedToggle;
  /** The Groups page's "Matrix" (the switch atop its filters): the default groups as scope items × roles, in the list's place — kept in the user's settings. */
  readonly groupMatrix: SavedToggle;

  saving = false;
  syncing = false;
  /** A batch's progress ("Syncing… 12 / 141"): groups done of all; null outside one. */
  progress: { done: number; total: number } | null = null;

  private roleIds: Partial<Record<RoleKey, string>> = {};
  /**
   * The viewer's own permissions (ThingsBoard PE's allowed permissions: generic
   * by resource, and by entity group), read once as Access opens — what "Log in
   * as user" needs (`IMPERSONATE` on users); null until in, or unreadable.
   */
  private viewerPermissions: { generic: Record<string, string[]>; groups: Record<string, { operations?: string[] }> } | null = null;
  private viewerPermissionsAsked = false;
  /** The default home dashboard (see {@link defaultHome}), looked up once. */
  private homeLoad?: Observable<string>;
  /** A sync's failed steps, each "<group> · <step>: <reason>" — the report names the first, the browser console lists all. */
  private syncFailures: string[] = [];
  /** The groups have loaded once (the Settings page's Access was shown). */
  loaded = false;
  /** The roles being looked up (shared by the groups syncing at once). */
  private rolesLoad?: Observable<Record<RoleKey, string>>;
  /**
   * A batch's shared lookups ("Sync all", "Add default groups", an item's
   * three groups): each relation tree, each market's / product line's
   * children and each scope's reach are fetched once and reused by every
   * group in it — a scope's three levels, a market and its sites, regional and
   * all the rest walk the same trees. Null outside a batch: always fresh.
   */
  private batch: { depth: number; lookups: Map<string, Observable<any>> } | null = null;
  /** The default groups missing, worked out for these lists (cached). */
  private missing?: {
    groups: AccessGroup[];
    roles: AccessRole[];
    productLines: AssetRow[];
    markets: AssetRow[];
    sites: AssetRow[];
    list: { scope: AccessScope; level: AccessLevel }[];
  };
  /** The roles' select options (the forms' "Role"), rebuilt when the roles change. */
  private roleOptionsCache?: { roles: AccessRole[]; options: TbSelectOption[] };

  constructor(
    private ctx: WidgetContext,
    private destroyRef: DestroyRef,
    readonly settings: AccessSettings,
    private notices: AccessNotices,
    /** Re-render the dashboard (its change detection) after an async change. */
    private changed: () => void,
    /** The scopes' hierarchy and the apps — the same stores the Settings page edits. */
    readonly org: OrganizationStore,
    readonly apps: ApplicationStore
  ) {
    this.groupColumns = new SavedColumnChoice(ACCESS_GROUP_COLUMNS, "accessGroupColumns", ctx, destroyRef, changed);
    this.userColumns = new SavedColumnChoice(ACCESS_USER_COLUMNS, "accessUserColumns", ctx, destroyRef, changed);
    this.roleColumns = new SavedColumnChoice(ACCESS_ROLE_COLUMNS, "accessRoleColumns", ctx, destroyRef, changed);
    this.groupSort = new SavedTableSort("accessGroupSort", () => ACCESS_GROUP_COLUMNS.map((c) => c.key), ctx, destroyRef, changed);
    this.groupMatrixSort = new SavedTableSort(
      "accessGroupMatrixSort",
      () => [...ACCESS_MATRIX_COLUMNS, ...this.roles.map((r) => `${ACCESS_MATRIX_ROLE}${r.id}`)],
      ctx,
      destroyRef,
      changed
    );
    this.userSort = new SavedTableSort("accessUserSort", () => ACCESS_USER_COLUMNS.map((c) => c.key), ctx, destroyRef, changed);
    this.roleSort = new SavedTableSort("accessRoleSort", () => ACCESS_ROLE_COLUMNS.map((c) => c.key), ctx, destroyRef, changed);
    this.groupSimilar = new SavedToggle("accessGroupSimilar", ctx, destroyRef, changed);
    this.groupMatrix = new SavedToggle("accessGroupMatrix", ctx, destroyRef, changed);
    // One trail for the panels that lead to each other.
    this.trail.join(this, () => this.closePanels());
    org.trail = this.trail;
    apps.trail = this.trail;
    // An Organization item's panel lists the groups reaching it.
    org.access = this;
    org.follow({
      saved: (e) => this.afterItemChange(e.kind, !e.before, e),
      deleted: (e) => this.afterItemChange(e.kind, false),
      deleteNote: (e) => this.itemsDeleteNote(e.assets),
    });
  }

  // -- loading ---------------------------------------------------------------------------------------

  /** The owner, then its groups and users, and the dashboards to open on (and, once, the viewer's own permissions). */
  load(): void {
    this.loadViewerPermissions();
    if (this.ownerId) {
      this.loadGroups();
      return;
    }
    this.groupsLoading = this.usersLoading = true;
    this.resolveOwner()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (owner) => {
          this.ownerId = owner.id;
          this.ownerTitle = owner.title;
          this.loadGroups();
          this.loadDashboards();
        },
        error: () => {
          this.groupsLoading = this.usersLoading = false;
          this.ownerError = `No customer named "${this.settings.ownerTitle}" — the access owner.`;
          this.changed();
        },
      });
  }

  /** A customer user's own customer; for a tenant administrator, the customer the settings name. */
  private resolveOwner(): Observable<{ id: string; title: string }> {
    const me = this.ctx.currentUser;
    if (me?.authority === "CUSTOMER_USER" && me.customerId) {
      return of({ id: me.customerId, title: this.settings.ownerTitle });
    }
    return this.get<{ id: TbId; title: string }>("/api/tenant/customers", { customerTitle: this.settings.ownerTitle }).pipe(
      map((c) => {
        if (!c?.id?.id) {
          throw new Error("no owner");
        }
        return { id: c.id.id, title: c.title };
      })
    );
  }

  /**
   * The owner's access groups (user groups with a definition in their
   * additional info) and its users — two requests side by side: the user list
   * (`userInfos`) carries each user's account and group memberships, so the
   * groups' members come from it (no request per user or per group).
   */
  loadGroups(): void {
    this.groupsLoading = this.usersLoading = true;
    this.loadRoles();
    // The Tenant scope (a tenant administrator's view): the tenant-level users and the tenant's user groups, their roles.
    const tenantId = this.ctx.currentUser?.tenantId ?? "";
    const withTenant = this.manageTenant && !!tenantId;
    forkJoin({
      groups: this.get<{ id: TbId; name: string; additionalInfo?: any }[]>(`/api/entityGroups/CUSTOMER/${this.ownerId}/USER`),
      users: this.pages<any>(`/api/customer/${this.ownerId}/userInfos`, { sortProperty: "email", sortOrder: "ASC" }),
      scopes: this.userScopes(),
      tenantUsers: withTenant
        ? this.pages<any>("/api/userInfos/all", { includeCustomers: "false", sortProperty: "email", sortOrder: "ASC" }).pipe(catchError(() => of([] as any[])))
        : of([] as any[]),
      tenantGroups: withTenant
        ? this.get<{ id: TbId; name: string }[]>(`/api/entityGroups/TENANT/${tenantId}/USER`).pipe(catchError(() => of([] as { id: TbId; name: string }[])))
        : of([] as { id: TbId; name: string }[]),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ groups, users, scopes, tenantUsers, tenantGroups }) => {
          const roleRank = (name: string) => {
            const i = TENANT_ROLE_GROUP_NAMES.indexOf(name);
            return i < 0 ? TENANT_ROLE_GROUP_NAMES.length : i;
          };
          this.tenantGroups = (tenantGroups ?? [])
            .filter((g) => g.name !== "All")
            .map((g) => ({ id: g.id.id, name: g.name, role: TENANT_ROLE_GROUP_NAMES.includes(g.name) }))
            .sort((a, b) => roleRank(a.name) - roleRank(b.name) || a.name.localeCompare(b.name));
          const memberships = new Map<string, string[]>();
          for (const u of users) {
            for (const g of u.groups ?? []) {
              memberships.set(g.id.id, [...(memberships.get(g.id.id) ?? []), u.id.id]);
            }
          }
          this.groups = (groups ?? [])
            .map((g) => this.toGroup(g, memberships.get(g.id.id) ?? []))
            .filter((g): g is AccessGroup => !!g)
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
          this.loaded = true;
          this.users = [...users.map((u) => this.toUser(u, scopes)), ...(tenantUsers ?? []).map((u) => this.toTenantUser(u))]
            // The last logins already read from the users' own records (the list's can be older).
            .map((u) => (this.lastLogins.has(u.id) ? { ...u, lastLoginTs: this.lastLogins.get(u.id) ?? null } : u))
            .sort((a, b) => accessUserName(a).localeCompare(accessUserName(b)));
          // What waited on the groups (an automatic sync after an edit).
          const waiting = this.afterLoad;
          this.afterLoad = [];
          waiting.forEach((run) => run());
          if (this.indexDue && this.ready) {
            // Groups were synced or deleted since: the rule chain's indexes follow.
            this.indexDue = false;
            this.writeAccessIndex()
              .pipe(takeUntilDestroyed(this.destroyRef))
              .subscribe((failed) => {
                if (failed) {
                  console.warn(`[access] membership index: ${failed} of its attributes not saved`);
                }
              });
          }
          // The users' own last logins: the first time, the Users page stays behind its loader until they're in; after, they follow.
          this.groupsLoading = false;
          this.usersLoading = !this.lastLoginsRead;
          this.refreshLastLogins(
            this.users.map((u) => u.id),
            () => {
              this.lastLoginsRead = true;
              this.usersLoading = false;
            }
          );
          if (this.editingUser) {
            this.editingUser = this.users.find((u) => u.id === this.editingUser!.id) ?? null;
            this.userResetKey++;
          }
          this.changed();
        },
        error: () => {
          this.groupsLoading = this.usersLoading = false;
          this.changed();
        },
      });
  }

  /** The roles: the access owner's `accessRoles` (none stored: the three to start). */
  private loadRoles(): void {
    this.rolesLoading = true;
    this.get<{ key: string; value: unknown }[]>(`/api/plugins/telemetry/CUSTOMER/${this.ownerId}/values/attributes/SERVER_SCOPE`, { keys: ROLES_KEY })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (attrs) => {
          this.roles = parseRoles((attrs ?? []).find((a) => a.key === ROLES_KEY)?.value);
          this.rolesLoading = false;
          this.changed();
        },
        error: () => {
          this.rolesLoading = false;
          this.changed();
        },
      });
  }

  /** Groups were synced or deleted since the membership indexes were last written. */
  private indexDue = false;

  /**
   * The indexes the "Access Membership" rule chain reads, so a device or
   * asset that appears or moves with nobody at a screen joins and leaves the
   * right entity groups — which groups cover what stays this store's rule:
   * - each site's `accessGroups` (server attribute): the synced groups
   *   covering it, their device and asset entity groups by the profile they
   *   take — "*" for each (a group takes every profile at its sites);
   * - the access owner's `accessBlocks`: every access device / asset entity
   *   group there is (what an entity may be taken out of).
   * How many of its attributes failed to save.
   */
  private writeAccessIndex(): Observable<number> {
    const sites = this.org.sites.rows;
    const lines = this.org.productLines.rows;
    const synced = this.groups.filter((g) => !!g.blocks.devices);
    type ByProfile = Record<string, string[]>;
    const perSite = new Map<string, { devices: ByProfile; assets: ByProfile }>(sites.map((s) => [s.id, { devices: {}, assets: {} }]));
    // Every profile ("*"): a group takes every device and asset at its sites.
    const add = (to: ByProfile, block: string) => (to["*"] = [...(to["*"] ?? []), block]);
    for (const g of synced) {
      for (const site of scopeSites(g.scope, sites, lines)) {
        const index = perSite.get(site.id);
        if (index) {
          add(index.devices, g.blocks.devices);
          if (g.blocks.assets) {
            add(index.assets, g.blocks.assets);
          }
        }
      }
    }
    const blocks = { devices: synced.map((g) => g.blocks.devices), assets: synced.map((g) => g.blocks.assets).filter((id) => !!id) };
    const saves: Observable<unknown>[] = [
      this.post(`/api/plugins/telemetry/CUSTOMER/${this.ownerId}/attributes/SERVER_SCOPE`, { accessBlocks: blocks }),
      ...sites.map((s) => this.post(`/api/plugins/telemetry/ASSET/${s.id}/attributes/SERVER_SCOPE`, { accessGroups: perSite.get(s.id) })),
    ];
    return from(saves).pipe(
      mergeMap(
        (save) =>
          save.pipe(
            map(() => 0),
            catchError(() => of(1))
          ),
        4
      ),
      toArray(),
      map((failed) => failed.reduce((n: number, f) => n + f, 0))
    );
  }

  /** The users afresh (an account changed): the groups and users reload together, as one. */
  loadUsers(): void {
    this.loadGroups();
  }

  /** A user group as an access group (null: not one — no definition in its additional info). */
  private toGroup(ug: { id: TbId; name: string; additionalInfo?: any; createdTime?: number }, members: string[]): AccessGroup | null {
    const def = parseAccess(ug.additionalInfo);
    return def ? { id: ug.id.id, name: ug.name, ...def, members, createdTime: Number(ug.createdTime) || null } : null;
  }

  /** Every user's scope and level, from their server attributes (one entity query); none set: null. */
  private userScopes(): Observable<Map<string, { scope: AccessScope | null; level: AccessLevel | null }>> {
    const keys = ["scopeType", "productLineId", "marketId", "plantIds", "level"];
    const query: EntityDataQuery = {
      entityFilter: { type: AliasFilterType.entityType, entityType: EntityType.USER } as EntityFilter,
      entityFields: [{ type: EntityKeyType.ENTITY_FIELD, key: "name" }],
      latestValues: keys.map((key) => ({ type: EntityKeyType.SERVER_ATTRIBUTE, key })),
      keyFilters: [],
      pageLink: { page: 0, pageSize: 2000 },
    };
    return this.ctx.entityService.findEntityDataByQuery(query, QUIET_REQUEST).pipe(
      map(
        (page) =>
          new Map(
            page.data.map((d: any): [string, { scope: AccessScope | null; level: AccessLevel | null }] => {
              const a = d.latest?.[EntityKeyType.SERVER_ATTRIBUTE] ?? {};
              const attrs = Object.fromEntries(keys.map((k) => [k, a[k]?.value ?? ""]));
              return [d.entityId.id, { scope: scopeFromAttributes(attrs), level: levelFromAttribute(attrs["level"]) }];
            })
          )
      ),
      catchError(() => of(new Map<string, { scope: AccessScope | null; level: AccessLevel | null }>()))
    );
  }

  /**
   * A user's scope and level as server attributes (the group's keys:
   * `scopeType`, `scope`, `productLine`, `market`, `plants`, …, and `level`)
   * — a plant scope with its plant's product line and market. The scope is
   * their one default group's, else their plants' ({@link scopeOfGroups}).
   */
  private saveUserScope(userId: string, scope: AccessScope, level: AccessLevel | null): Observable<unknown> {
    const attributes = { ...scopeAttributes(completeScope(scope, this.org.sites.rows, this.org.productLines.rows), this.nameOf()), level: level ?? "" };
    return this.ctx.attributeService.saveEntityAttributes(
      { entityType: EntityType.USER, id: userId },
      AttributeScope.SERVER_SCOPE,
      Object.entries(attributes).map(([key, value]) => ({ key, value })),
      QUIET_REQUEST
    );
  }

  /** The scope a user's default groups give them, as their attributes keep it: the group's, when it's one; else a plant scope of their plants. */
  private scopeOfGroups(defaults: AccessGroup[], plantIds = plantsOfGroups(defaults, this.org.sites.rows, this.org.productLines.rows)): AccessScope {
    return defaults.length === 1 ? defaults[0].scope : plantsScope(plantIds, this.org.sites.rows);
  }

  /** A user's scope and level saved from the default groups they're now in ({@link groups}' members) — in none: removed. */
  private saveScopeFromGroups(userId: string): Observable<unknown> {
    const defaults = this.groups.filter((g) => g.auto && g.members.includes(userId));
    if (!defaults.length) {
      return this.clearUserScope(userId);
    }
    return this.saveUserScope(
      userId,
      this.scopeOfGroups(defaults),
      broadestLevel(
        defaults.map((g) => g.level),
        this.roles
      ) ?? defaults[0].level
    );
  }

  /**
   * A user's role: their default groups' (several roles: the broadest), else their own (an attribute), else the broadest
   * of their other groups', else the first role — what their form starts on.
   */
  userLevel(u: AccessUser): AccessLevel {
    const mine = this.groups.filter((g) => u.groupIds.includes(g.id));
    return (
      broadestLevel(
        mine.filter((g) => g.auto).map((g) => g.level),
        this.roles
      ) ??
      u.level ??
      broadestLevel(
        mine.map((g) => g.level),
        this.roles
      ) ??
      this.roles[0]?.id ??
      "viewer"
    );
  }

  /** The plants a user has access to — those their default groups give them (any role): what their form's tree ticks. */
  userPlants(u: AccessUser): string[] {
    const defaults = this.groups.filter((g) => g.auto && u.groupIds.includes(g.id));
    return plantsOfGroups(defaults, this.org.sites.rows, this.org.productLines.rows);
  }

  // -- the roles -----------------------------------------------------------------------------------

  /** A role by its id (a group's or a user's level). */
  roleOf(level: AccessLevel): AccessRole | undefined {
    return this.roles.find((r) => r.id === level);
  }

  /** A role's name ("Viewer"); a removed one's id. */
  levelLabel(level: AccessLevel): string {
    return this.roleOf(level)?.label ?? level;
  }

  /** A role's icon. */
  levelIcon(level: AccessLevel): string {
    return this.roleOf(level)?.icon ?? "person";
  }

  /** The roles as a select's options ("Role" in the forms), rebuilt only when the roles change. */
  get roleOptions(): TbSelectOption[] {
    if (this.roleOptionsCache?.roles !== this.roles) {
      this.roleOptionsCache = { roles: this.roles, options: this.roles.map((r) => ({ value: r.id, label: r.label })) };
    }
    return this.roleOptionsCache.options;
  }

  /** The Organization's items' own names — their codes ("RMX", "GVA") — by id ("" for none / unknown); `extra`: rows not in the lists yet. */
  private codeOf(extra: AssetRow[] = []): (id: string | null) => string {
    const codes = new Map<string, string>();
    [...this.org.productLines.rows, ...this.org.markets.rows, ...this.org.sites.rows, ...extra].forEach((a) => codes.set(a.id, a.name));
    return (id) => (id ? (codes.get(id) ?? "") : "");
  }

  /** The Organization's and the applications' names, by id ("" for none / unknown) — `extra`: rows not in the lists yet (one just made). */
  private nameOf(extra: AssetRow[] = []): (id: string | null) => string {
    const names = new Map<string, string>();
    [...this.org.productLines.rows, ...this.org.markets.rows, ...this.org.sites.rows, ...extra].forEach((a) => names.set(a.id, a.label || a.name));
    this.apps.applications.forEach((a) => names.set(a.id, a.label || a.name));
    return (id) => (id ? (names.get(id) ?? "") : "");
  }

  private toUser(u: any, scopes: Map<string, { scope: AccessScope | null; level: AccessLevel | null }>): AccessUser {
    const info = u.additionalInfo ?? {};
    const id = u.id.id as string;
    const home = info.homeDashboardId;
    return {
      id,
      email: u.email ?? "",
      firstName: u.firstName ?? "",
      lastName: u.lastName ?? "",
      name: [u.firstName, u.lastName].filter(Boolean).join(" "),
      phone: u.phone ?? "",
      groupIds: this.groups.filter((g) => g.members.includes(id)).map((g) => g.id),
      // (the groups are set first, their members from these same users)
      lastLoginTs: Number(info.lastLoginTs) || null,
      createdTime: Number(u.createdTime) || null,
      activated: info.userActivated !== false,
      enabled: info.userCredentialsEnabled !== false,
      homeDashboardId: (typeof home === "object" ? home?.id : home) || "",
      oldHome: OLD_HOME_KEYS.some((k) => k in info),
      scope: scopes.get(id)?.scope ?? null,
      level: scopes.get(id)?.level ?? null,
      tenant: false,
      tenantGroupIds: [],
    };
  }

  /** A tenant-level user (the Tenant scope): their account as a user's, their tenant user groups their role — no scope, level or access groups. */
  private toTenantUser(u: any): AccessUser {
    const known = new Set(this.tenantGroups.map((g) => g.id));
    return {
      ...this.toUser(u, new Map()),
      groupIds: [],
      tenant: true,
      tenantGroupIds: ((u.groups ?? []) as { id: TbId }[]).map((g) => g.id.id).filter((id) => known.has(id)),
    };
  }

  /**
   * Each user's last login from their own record (`/api/user/{id}`): ThingsBoard's user listings and entity queries can
   * carry an older one (a tenant user's most of all). After the list is in, a few at a time; the rows follow once all are
   * in, then `done`.
   */
  private refreshLastLogins(ids: string[], done: () => void): void {
    from(ids)
      .pipe(
        mergeMap(
          (id) =>
            this.get<{ additionalInfo?: any }>(`/api/user/${id}`).pipe(
              map((u) => ({ id, ts: Number(u?.additionalInfo?.lastLoginTs) || null })),
              catchError(() => of(null))
            ),
          8
        ),
        toArray(),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((found) => {
        let changed = false;
        for (const f of found) {
          if (f) {
            this.lastLogins.set(f.id, f.ts);
          }
          const u = f && this.users.find((x) => x.id === f.id);
          if (u && f && f.ts !== u.lastLoginTs) {
            u.lastLoginTs = f.ts;
            changed = true;
          }
        }
        if (changed) {
          this.users = [...this.users]; // the table's rows follow
        }
        done();
        this.changed();
      });
  }

  /** The viewer manages the Tenant scope's users: a tenant administrator. */
  get manageTenant(): boolean {
    return this.ctx.currentUser?.authority === "TENANT_ADMIN";
  }

  private get tenantChoices(): { roles: TbSelectOption[]; others: { id: string; label: string }[] } {
    if (this.tenantRoleCache?.groups !== this.tenantGroups) {
      this.tenantRoleCache = {
        groups: this.tenantGroups,
        roles: this.tenantGroups.filter((g) => g.role).map((g) => ({ value: g.id, label: g.name })),
        others: this.tenantGroups.filter((g) => !g.role).map((g) => ({ id: g.id, label: g.name })),
      };
    }
    return this.tenantRoleCache;
  }

  /** The Tenant scope's "Role" choices: the two default tenant user groups. */
  get tenantRoleOptions(): TbSelectOption[] {
    return this.tenantChoices.roles;
  }

  /** A Tenant scope user's access groups to pick from: the tenant's other user groups. */
  get tenantGroupOptions(): { id: string; label: string }[] {
    return this.tenantChoices.others;
  }

  /** A Tenant scope user's role: their default tenant user group (administrators first); "" for none. */
  tenantRoleOf(u: AccessUser): string {
    return this.tenantGroups.find((g) => g.role && u.tenantGroupIds.includes(g.id))?.id ?? "";
  }

  /** A Tenant scope user's access groups: their other tenant user groups (ids). */
  tenantAccessGroupsOf(u: AccessUser): string[] {
    const others = new Set(this.tenantGroups.filter((g) => !g.role).map((g) => g.id));
    return u.tenantGroupIds.filter((id) => others.has(id));
  }

  /** A user's role in words — their level's, or a Tenant scope user's tenant group's. */
  userRoleLabel(u: AccessUser): string {
    if (u.tenant) {
      return this.tenantGroups.find((g) => g.id === this.tenantRoleOf(u))?.name ?? "—";
    }
    return this.levelLabel(this.userLevel(u));
  }

  /** A user's role as its icon. */
  userRoleIcon(u: AccessUser): string {
    if (u.tenant) {
      const g = this.tenantGroups.find((x) => x.id === this.tenantRoleOf(u));
      return g ? tenantRoleIcon(g.name) : "";
    }
    return this.levelIcon(this.userLevel(u));
  }

  /** The tenant's dashboards (a group's other dashboards): "None", then each by title. */
  private loadDashboards(): void {
    this.pages<{ id: TbId; title: string }>("/api/tenant/dashboards", { sortProperty: "title", sortOrder: "ASC" })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((list) => {
        this.dashboardOptions = [{ value: "", label: "None" }, ...list.map((d) => ({ value: d.id.id, label: d.title }))];
        this.changed();
      });
  }

  /**
   * The scopes can be worked out: the Organization's lists are in, the sites
   * with their market and product line (their links), and the applications
   * with their sites. Until then a sync would see scopes with no sites — and
   * empty its groups.
   */
  get ready(): boolean {
    const o = this.org;
    return (
      !o.sites.loading &&
      !o.markets.loading &&
      !o.productLines.loading &&
      !this.apps.loading &&
      // (What runs where must be known: a sync without it would drop the apps' assets and dashboards.)
      this.apps.loaded &&
      o.sites.rows.length > 0 &&
      o.sites.rows.some((s) => s.links !== undefined)
    );
  }

  // -- the Groups and Users pages' filters ------------------------------------------------------

  /** A page's filters (`tb-access-filters`). */
  filterOf(page: AccessPage): AccessFilter {
    return page === "groups" ? this.groupFilter : page === "users" ? this.userFilter : this.roleFilter;
  }

  /** A page's table's "Customize columns" choice. */
  columnsOf(page: AccessPage): SavedColumnChoice {
    return page === "groups" ? this.groupColumns : page === "users" ? this.userColumns : this.roleColumns;
  }

  /** A page's table's sort (the picker marks its column). */
  sortOf(page: AccessPage): DataTableSort | null {
    return this.savedSortOf(page).sort;
  }

  /** A page's table's saved sort. */
  savedSortOf(page: AccessPage): SavedTableSort {
    return page === "groups" ? (this.groupMatrix.on ? this.groupMatrixSort : this.groupSort) : page === "users" ? this.userSort : this.roleSort;
  }

  setFilter(page: AccessPage, patch: Partial<AccessFilter>): void {
    if (page === "groups") {
      this.groupFilter = { ...this.groupFilter, ...patch };
    } else if (page === "users") {
      this.userFilter = { ...this.userFilter, ...patch };
    } else {
      this.roleFilter = { ...this.roleFilter, ...patch };
    }
  }

  /** "Clear filters": the search and the facets (whether the default groups show, and the empty ones, stays). */
  clearFilter(page: AccessPage): void {
    const f = this.filterOf(page);
    this.setFilter(page, { ...NO_ACCESS_FILTER, showDefault: f.showDefault, hideEmpty: f.hideEmpty });
  }

  hasFilter(page: AccessPage): boolean {
    const f = this.filterOf(page);
    const facets = page === "roles" ? ACCESS_ROLE_FACETS : page === "users" ? ACCESS_USER_FACETS : ACCESS_GROUP_FACETS;
    return !!f.search.length || facets.some((k) => f[k].length > 0);
  }

  /** A group's facets — what the filters match on: its scope (a plant's with its product line and market) and its level. */
  groupFacets(g: AccessGroup): Record<AccessFacet, string[]> {
    return { ...this.scopeFacets(g.scope), levels: [g.level], actions: [] };
  }

  /** A user's facets: their scope ("none" without one) and their level (theirs, else their groups'). */
  userFacets(u: AccessUser): Record<AccessFacet, string[]> {
    if (u.tenant) {
      // The Tenant scope: over every product line and market; their role their tenant user group.
      return {
        scopes: [TENANT_SCOPE_TYPE.id],
        productLines: [ALL_FACET_VALUES],
        markets: [ALL_FACET_VALUES],
        levels: u.tenantGroupIds.filter((id) => id === this.tenantRoleOf(u)).map((id) => `${TENANT_ROLE_FACET}${id}`),
        actions: [],
      };
    }
    const scope = u.scope ? this.scopeFacets(u.scope) : { scopes: [NO_SCOPE], productLines: [], markets: [] };
    return { ...scope, levels: [this.userLevel(u)], actions: [] };
  }

  /**
   * A role's facets: where it applies — its kinds of scope item, as a scope's
   * type (regional, product lines, markets, plants: every one or some) — and
   * the actions grid's rows it has an action in.
   */
  roleFacets(r: AccessRole): Record<AccessFacet, string[]> {
    const t = r.appliesTo;
    const some = (x: { all: boolean; ids: string[] }) => x.all || x.ids.length > 0;
    const scopes = [
      ...(t.regional ? ["all"] : []),
      ...(some(t.productLines) ? ["productLine"] : []),
      ...(some(t.markets) ? ["market"] : []),
      ...(some(t.sites) ? ["site"] : []),
    ];
    const actions = ACCESS_ACTION_ROWS.filter((row) => [row.view, row.edit, row.control].some((a) => !!a && r.actions.includes(a))).map((row) => row.key);
    return { scopes, productLines: [], markets: [], levels: [], actions };
  }

  /** A role passes the filters: each facet's picks (none: any) — `skip` one to count its options under the others. */
  rolePasses(r: AccessRole, filter = this.roleFilter, skip?: AccessFacet): boolean {
    return facetsPass(this.roleFacets(r), filter, ACCESS_ROLE_FACETS, skip);
  }

  /**
   * A group passes the filters: a default one only while they show, an empty
   * one (no members) unless they're hidden, and each facet's picks (none:
   * any) — `skip` one facet to count its options under the others;
   * `showDefault` overrides whether the default groups show.
   */
  groupPasses(g: AccessGroup, filter = this.groupFilter, skip?: AccessFacet, showDefault = filter.showDefault): boolean {
    if ((g.auto && !showDefault) || (filter.hideEmpty && !g.members.length)) {
      return false;
    }
    return facetsPass(this.groupFacets(g), filter, ACCESS_GROUP_FACETS, skip);
  }

  /** A scope item passes the Groups filters' Scope, Product line and Market picks (the matrix's rows — its roles are its columns). */
  scopePasses(scope: AccessScope, filter = this.groupFilter): boolean {
    return facetsPass(this.scopeFacets(scope) as Record<AccessFacet, string[]>, filter, ["scopes", "productLines", "markets"]);
  }

  /** A user passes the filters: each facet's picks (none: any) — `skip` one to count its options under the others. */
  userPasses(u: AccessUser, filter = this.userFilter, skip?: AccessFacet): boolean {
    return facetsPass(this.userFacets(u), filter, ACCESS_USER_FACETS, skip);
  }

  /**
   * The filter boxes' options for a page's items under a filter — Level,
   * Scope (users: "No scope" too), Product line (its tree: a parent picks
   * itself with every line under it), Market (by its name: "GVA") and, for
   * the roles, Permissions — each counted under the other filters: those with the value
   * and those covering every value (a regional group passes any pick). No
   * "All …" option: "Select all" is it. The filters column
   * (`tb-access-filters`) and a group's Members tab show them.
   */
  facetOptions(page: AccessPage, filter: AccessFilter): AccessFacetOptions {
    const items: { facets: Record<AccessFacet, string[]>; passes: (skip?: AccessFacet) => boolean }[] =
      page === "groups"
        ? this.groups.map((g) => ({ facets: this.groupFacets(g), passes: (skip?: AccessFacet) => this.groupPasses(g, filter, skip) }))
        : page === "roles"
          ? this.roles.map((r) => ({ facets: this.roleFacets(r), passes: (skip?: AccessFacet) => this.rolePasses(r, filter, skip) }))
          : this.users.map((u) => ({ facets: this.userFacets(u), passes: (skip?: AccessFacet) => this.userPasses(u, filter, skip) }));
    /** How many items the other filters let through picking this value would show (`also`: any of these values too — a parent line's subtree). */
    const counter = (facet: AccessFacet) => {
      const passing = items.filter((it) => it.passes(facet));
      return (value: string, also: string[] = []) =>
        passing.filter((it) => it.facets[facet].some((v) => v === value || v === ALL_FACET_VALUES || also.includes(v))).length;
    };
    const options = (facet: AccessFacet, values: { id: string; label: string }[]): FilterListOption[] => {
      const count = counter(facet);
      return values.map((v) => ({ id: v.id, label: v.label, count: count(v.id) }));
    };
    // The Users page: the Tenant scope (a tenant administrator's view) — the scope, and the tenant's user groups as roles.
    const tenant = page === "users" && this.tenantGroups.length > 0;
    // The product lines and markets: every filter column's (`tb-org-filters`).
    const org = orgFilterOptions(this.org.productLines.rows, this.org.markets.rows, counter("productLines"), counter("markets"));
    return {
      levels: options("levels", [...this.roles, ...(tenant ? this.tenantGroups.filter((g) => g.role).map((g) => ({ id: `${TENANT_ROLE_FACET}${g.id}`, label: g.name })) : [])]),
      scopes: options("scopes", [...(tenant ? [TENANT_SCOPE_TYPE] : []), ...ACCESS_SCOPE_TYPES, ...(page === "users" ? [{ id: NO_SCOPE, label: "No scope" }] : [])]),
      productLines: org.productLines,
      markets: org.markets,
      actions: options("actions", ACCESS_ACTION_ROWS.map((row) => ({ id: row.key, label: row.label }))),
    };
  }

  private scopeFacets(raw: AccessScope): Pick<Record<AccessFacet, string[]>, "scopes" | "productLines" | "markets"> {
    const scope = completeScope(raw, this.org.sites.rows, this.org.productLines.rows);
    if (scope.siteIds.length > 1) {
      // Several plants (a user's): their product lines and markets.
      const plants = this.org.sites.rows.filter((s) => scope.siteIds.includes(s.id));
      const values = (of: (s: AssetRow) => string | null | undefined) => {
        const ids = [...new Set(plants.map(of).filter((id): id is string => !!id))];
        return ids.length ? ids : [ALL_FACET_VALUES];
      };
      return { scopes: ["site"], productLines: values((s) => s.productLineId), markets: values((s) => s.marketId) };
    }
    return { scopes: [accessScopeType(scope)], productLines: [scope.productLineId ?? ALL_FACET_VALUES], markets: [scope.marketId ?? ALL_FACET_VALUES] };
  }

  // -- the group panel ---------------------------------------------------------------------------

  get groupTabs(): SegmentOption[] {
    return this.editingGroup ? GROUP_TABS_WITH_MEMBERS : GROUP_TABS;
  }

  get selectedGroupId(): string | null {
    return this.groupPanelOpen && this.editingGroup ? this.editingGroup.id : null;
  }

  openAddGroup(): void {
    this.openGroup(null);
  }

  openEditGroup(g: AccessGroup): void {
    this.openGroup(g);
  }

  /** A group's Members count (the table's): its panel, on the Members tab. */
  openGroupMembers(g: AccessGroup): void {
    this.openGroup(g, "members");
  }

  closeGroupPanel(): void {
    this.groupPanelOpen = false;
  }

  /** The group panel's title: the group's name, or "New access group". */
  get groupPanelName(): string {
    return this.editingGroup?.name ?? "New access group";
  }

  get groupPanelSubtitle(): string {
    return this.editingGroup ? "Access group" : "";
  }

  private openGroup(g: AccessGroup | null, tab = "group"): void {
    this.enter(g ? this.groupStop(g.id) : null);
    this.editingGroup = g;
    this.groupPanelTab = tab;
    this.otherGroupNames = this.groups.filter((x) => x.id !== g?.id).map((x) => x.name);
    this.groupResetKey++;
    this.groupPanelOpen = true;
  }

  /** The group form's Save: the user group (made, or its name and definition saved), then synced. */
  submitGroup(draft: AccessGroupDraft): void {
    const existing = this.editingGroup;
    if (!this.ready) {
      this.notices.error("The Organization is still loading — save once it's in.");
      return;
    }
    this.saving = true;
    const save$ = existing
      ? this.get<any>(`/api/entityGroup/${existing.id}`).pipe(
          switchMap((ug) =>
            this.post<any>("/api/entityGroup", {
              ...ug,
              // A default group keeps its name (its scope's — the rule chain renames it with the item).
              name: existing.auto ? ug.name : draft.name,
              // A default group keeps its scope and level (its form doesn't offer them).
              additionalInfo: accessInfo(ug.additionalInfo, {
                ...draft,
                ...(existing.auto ? { name: ug.name, description: existing.description, scope: existing.scope, level: existing.level, auto: true } : {}),
                blocks: existing.blocks,
              }),
            })
          )
        )
      : this.post<any>("/api/entityGroup", {
          name: draft.name,
          type: "USER",
          ownerId: { entityType: "CUSTOMER", id: this.ownerId },
          additionalInfo: accessInfo(null, draft),
        });
    save$
      .pipe(
        map((ug): AccessGroup => this.toGroup(ug, existing?.members ?? [])!),
        switchMap((group) => this.syncSteps(group).pipe(map((report) => ({ group, report })))),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: ({ group, report }) => {
          this.saving = false;
          this.notices.success(`Group ${group.name} ${existing ? "saved" : "created"}${this.reportText(report)}`);
          this.editingGroup = group;
          this.groupResetKey++;
          this.loadGroups();
          this.changed();
        },
        error: (err) => {
          this.saving = false;
          const msg = apiMessage(err);
          this.notices.error(/already exists/i.test(msg) ? `There's a group named ${draft.name} already.` : `Couldn't save the group${msg}`);
          this.changed();
        },
      });
  }

  /**
   * The Members tab applied: the group holds exactly these users; those who
   * joined land on the default home ({@link applyHomes}). A default group:
   * joining it just adds it (a user can be in several) — the scope saved on
   * each user who joined or left it follows the default groups they're now in.
   */
  setMembers(group: AccessGroup, userIds: string[]): void {
    const add = userIds.filter((id) => !group.members.includes(id));
    const remove = group.members.filter((id) => !userIds.includes(id));
    if (!add.length && !remove.length) {
      return;
    }
    this.saving = true;
    const steps: Observable<unknown>[] = [];
    if (add.length) {
      steps.push(this.post(`/api/entityGroup/${group.id}/addEntities`, add));
    }
    if (remove.length) {
      steps.push(this.post(`/api/entityGroup/${group.id}/deleteEntities`, remove));
    }
    forkJoin(steps)
      .pipe(
        switchMap(() => {
          // The groups as they now are — and the open group's panel (its Members tab: nothing left to apply).
          this.groups = this.groups.map((g) => (g.id === group.id ? { ...g, members: [...userIds] } : g));
          if (this.editingGroup?.id === group.id) {
            this.editingGroup = this.groups.find((g) => g.id === group.id) ?? this.editingGroup;
          }
          const scopes = group.auto ? [...add, ...remove].map((uid) => this.saveScopeFromGroups(uid)) : [];
          return runSteps(scopes).pipe(switchMap(() => this.applyHomes(add)));
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: () => {
          this.saving = false;
          this.notices.success(`${group.name}: ${userIds.length} ${userIds.length === 1 ? "member" : "members"}`);
          this.changed();
          this.loadGroups();
        },
        error: (err) => {
          this.saving = false;
          this.notices.error(`Couldn't update ${group.name}'s members${apiMessage(err)}`);
          this.loadGroups();
        },
      });
  }

  /** Sync every group (the Groups page's "Sync all"): after the hierarchy, the apps' sites or the ownership changed. */
  syncAll(): void {
    if (this.syncing || !this.groups.length) {
      return;
    }
    if (!this.ready) {
      this.notices.error("The Organization is still loading — sync once it's in.");
      return;
    }
    this.syncing = true;
    this.syncFailures = [];
    const list = [...this.groups];
    this.progress = { done: 0, total: list.length };
    this.changed();
    this.batched(() =>
      this.shareDefaultHome().pipe(
        switchMap((homeFailed) =>
          from(list).pipe(
            mergeMap(
              (g) =>
                this.syncSteps(g).pipe(
                  catchError((err) => {
                    this.noteFailure(`${g.name} · sync`, err);
                    return of({ added: 0, removed: 0, skipped: [], failed: 1 } as AccessSyncReport);
                  }),
                  tap(() => this.stepDone())
                ),
              BATCH_PARALLEL
            ),
            toArray(),
            map((reports) => [...reports, { added: 0, removed: 0, skipped: [], failed: homeFailed } as AccessSyncReport])
          )
        )
      )
    )
      .pipe(
        switchMap((reports) => this.completeUserScopes().pipe(map(() => reports))),
        switchMap((reports) => this.applyHomes(this.users.filter((u) => !u.tenant).map((u) => u.id)).pipe(map(() => reports))),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((reports) => {
        this.syncing = false;
        this.progress = null;
        const total = reports.reduce(
          (t, r) => ({ added: t.added + r.added, removed: t.removed + r.removed, skipped: [...t.skipped, ...r.skipped], failed: t.failed + r.failed }),
          { added: 0, removed: 0, skipped: [] as string[], failed: 0 }
        );
        const synced = list.length;
        const text = `${synced} ${synced === 1 ? "group" : "groups"} synced${this.reportText(total)}`;
        if (total.failed) {
          // The first failure in the report; every one in the browser console.
          const first = this.syncFailures[0] ? ` First: ${this.syncFailures[0]}` : "";
          console.warn(`[access] Sync all — ${total.failed} failed steps:\n${this.syncFailures.join("\n")}`);
          this.notices.error(`${text} — ${total.failed} step${total.failed === 1 ? "" : "s"} failed.${first} (All in the browser console.)`);
        } else {
          this.notices.success(text);
        }
        this.loadGroups();
      });
  }

  /** One more group of the batch done: its progress shows. */
  private stepDone(): void {
    if (this.progress) {
      this.progress = { ...this.progress, done: this.progress.done + 1 };
      this.changed();
    }
  }

  /** Run `work` as a batch: its lookups shared (see {@link batch}; a batch inside another shares the outer one's). */
  private batched<T>(work: () => Observable<T>): Observable<T> {
    return defer(() => {
      if (this.batch) {
        this.batch.depth++;
      } else {
        this.batch = { depth: 1, lookups: new Map() };
      }
      return work().pipe(
        finalize(() => {
          if (this.batch && --this.batch.depth <= 0) {
            this.batch = null;
          }
        })
      );
    });
  }

  /** A lookup shared within the batch — in flight or done, one request; outside a batch, fetched afresh. */
  private shared<T>(key: string, fetch: () => Observable<T>): Observable<T> {
    const b = this.batch;
    if (!b) {
      return fetch();
    }
    let lookup = b.lookups.get(key) as Observable<T> | undefined;
    if (!lookup) {
      lookup = fetch().pipe(shareReplay(1));
      b.lookups.set(key, lookup);
    }
    return lookup;
  }

  /** Users whose plant scope doesn't name its plant's product line and market (older ones): their attributes, completed. */
  private completeUserScopes(): Observable<number> {
    const { sites, productLines } = { sites: this.org.sites.rows, productLines: this.org.productLines.rows };
    const steps = this.users
      .filter((u) => !!u.scope && completeScope(u.scope, sites, productLines) !== u.scope)
      .map((u) => this.saveUserScope(u.id, u.scope!, u.level));
    return runSteps(steps);
  }

  private reportText(r: AccessSyncReport): string {
    const parts = [r.added ? `${r.added} added` : "", r.removed ? `${r.removed} removed` : ""].filter(Boolean);
    const skipped = new Set(r.skipped).size;
    return (parts.length ? ` (${parts.join(", ")})` : "") + (skipped ? ` — ${skipped} not migrated yet, left out` : "");
  }

  // -- deleting groups ---------------------------------------------------------------------------

  /** A delete of groups under way: how many are done of how many (the Delete link shows it); null when none is. */
  deleting: { done: number; total: number } | null = null;

  /**
   * Delete (a group's panel, Manage's "Delete (n)"): hand-made groups only. A default group — made for each scope item a role
   * applies to, kept by the model (and the Access Lifecycle chain) — is never deleted by hand: left out, the toast says why.
   */
  askDeleteGroups(list: AccessGroup[]): void {
    const deletable = list.filter((g) => !g.auto);
    const kept = list.length - deletable.length;
    if (kept) {
      this.notices.error(
        deletable.length
          ? `Default groups can't be deleted: ${kept} left out.`
          : kept === 1
            ? "A default group can't be deleted."
            : "Default groups can't be deleted."
      );
    }
    if (deletable.length) {
      this.deleteGroupsConfirm = deletable;
    }
  }

  cancelDeleteGroups(): void {
    this.deleteGroupsConfirm = [];
  }

  get deleteGroupsHeading(): string {
    return this.deleteGroupsConfirm.length === 1 ? "Delete group?" : "Delete groups?";
  }

  get deleteGroupsMessage(): string {
    const list = this.deleteGroupsConfirm;
    const members = new Set(list.flatMap((g) => g.members)).size;
    const who = members ? ` Its ${members} ${members === 1 ? "member loses" : "members lose"} the access it gave.` : "";
    return list.length === 1
      ? `Group ${list[0].name} will be deleted.${who} The users and the devices stay.`
      : `${list.length} groups will be deleted.${who} The users and the devices stay.`;
  }

  /** Each group's entity groups, then the user group itself (its permissions go with it). */
  confirmDeleteGroups(): void {
    // (Hand-made groups only: a default group is never deleted by hand.)
    const list = this.deleteGroupsConfirm.filter((g) => !g.auto);
    this.deleteGroupsConfirm = [];
    if (!list.length) {
      return;
    }
    this.saving = true;
    this.deleting = { done: 0, total: list.length };
    this.changed();
    this.deleteGroupList(list)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((deleted) => {
        this.saving = false;
        this.deleting = null;
        if (deleted < list.length) {
          this.notices.error(`Deleted ${deleted} of ${list.length} groups.`);
        } else {
          this.notices.success(deleted === 1 ? `Group ${list[0].name} deleted` : `${deleted} groups deleted`);
        }
        this.closeGroupPanel();
        this.loadGroups();
      });
  }

  /** Groups deleted — each one's entity groups, then the user group itself (its permissions go with it). How many went. */
  private deleteGroupList(list: AccessGroup[]): Observable<number> {
    this.indexDue = true;
    return from(list).pipe(
      concatMap((g) => {
        const blocks = [g.blocks.devices, g.blocks.assets, g.blocks.dashboards].filter((id) => !!id);
        const dropBlocks$ = blocks.length
          ? forkJoin(blocks.map((id) => this.ctx.http.delete(`/api/entityGroup/${id}`, this.options()).pipe(catchError(() => of(null)))))
          : of([]);
        return dropBlocks$.pipe(
          switchMap(() => this.ctx.http.delete(`/api/entityGroup/${g.id}`, this.options())),
          map((): string | null => g.id),
          catchError(() => of(null)),
          // One more gone: the Delete link counts it.
          tap(() => {
            if (this.deleting) {
              this.deleting = { ...this.deleting, done: this.deleting.done + 1 };
              this.changed();
            }
          })
        );
      }),
      toArray(),
      map((ids) => {
        const gone = new Set(ids.filter((id): id is string => !!id));
        this.groups = this.groups.filter((g) => !gone.has(g.id));
        return gone.size;
      })
    );
  }

  // -- default groups: three a scope item ----------------------------------------------------------

  /**
   * The scope's default group of a level: found among `groups` (a default
   * group of the same scope and level) — synced first if it never was (the
   * rule chain makes them unsynced) — else made — named for its scope — and
   * synced. A new one joins `groups`.
   */
  private groupFor(scope: AccessScope, level: AccessLevel, groups: AccessGroup[], extra: AssetRow[] = []): Observable<{ group: AccessGroup; made: boolean }> {
    const key = scopeKey(scope);
    const found = groups.find((g) => g.auto && g.level === level && scopeKey(g.scope) === key);
    if (found) {
      return found.blocks.devices ? of({ group: found, made: false }) : this.syncSteps(found).pipe(map(() => ({ group: found, made: false })));
    }
    const nameOf = this.nameOf(extra);
    const codeOf = this.codeOf(extra);
    // A name is unique among the owner's groups: two plants of one label get "(2)", "(3)", …
    const taken = new Set(groups.map((g) => g.name.toLowerCase()));
    const role = this.roleOf(level);
    const base = defaultGroupName(
      scope,
      role?.plural ?? `${level}s`,
      (id) => codeOf(id) || "—",
      (id) => nameOf(id) || "—"
    );
    let name = base;
    for (let n = 2; taken.has(name.toLowerCase()); n++) {
      name = `${base} (${n})`;
    }
    const draft: AccessGroupDraft = {
      name,
      description: `${scopeLabel(scope, (id) => nameOf(id) || "—")}: its default ${(role?.label ?? level).toLowerCase()} group.`,
      scope,
      level,
      dashboardIds: [],
    };
    return this.post<any>("/api/entityGroup", {
      name: draft.name,
      type: "USER",
      ownerId: { entityType: "CUSTOMER", id: this.ownerId },
      additionalInfo: accessInfo(null, { ...draft, auto: true }),
    }).pipe(
      map((ug) => this.toGroup(ug, [])!),
      switchMap((group) => {
        groups.push(group);
        return this.syncSteps(group, extra).pipe(map(() => ({ group, made: true })));
      })
    );
  }

  /**
   * An Organization item created, edited or deleted: the "Access Lifecycle"
   * rule chain makes its default groups (moving it to the owner), renames
   * them or deletes its groups — wherever the item changed. Once it has had a
   * moment, the groups reload (a new item's list too: its owner).
   */
  private afterItemChange(kind: AssetKind, created: boolean, e?: { asset: AssetRow; before: AssetRow | null; changed?: boolean }): void {
    if (e && (created || e.changed)) {
      // What its groups open may have changed: they sync by themselves once things have settled.
      if (kind === "site") {
        this.pending.sites.set(e.asset.id, e.asset);
        if (e.before) {
          this.pending.before.push(e.before);
        }
      } else if (created) {
        this.pending.items.add(e.asset.id);
      }
    }
    if (created) {
      this.pending.reload.add(kind);
    }
    this.settle();
  }

  /**
   * What changed since the last automatic sync: the sites whose groups'
   * reach may have (as they now are, and as they were — a site moved to
   * another market leaves groups too), the new product lines and markets
   * (their own new groups), the lists to reload. Edits in a row (a bulk
   * relink) gather here: one sync for all of them.
   */
  private pending = { sites: new Map<string, AssetRow>(), before: [] as AssetRow[], items: new Set<string>(), reload: new Set<AssetKind>() };
  private settling?: { unsubscribe(): void };
  /** Runs once the groups have (re)loaded. */
  private afterLoad: (() => void)[] = [];

  /** Once the rule chain has had a moment (and the edits have stopped coming): the lists reload, then the groups, then what's pending syncs. */
  private settle(): void {
    this.settling?.unsubscribe();
    this.settling = timer(RULE_CHAIN_SETTLE_MS)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.pending.reload.forEach((kind) => this.org.load(kind));
        this.pending.reload.clear();
        const toSync = this.pending.sites.size > 0 || this.pending.items.size > 0;
        if (toSync) {
          this.afterLoad.push(() => this.whenReady(() => this.syncPending()));
        }
        if (this.loaded || (toSync && this.ownerId)) {
          this.loadGroups();
        } else if (toSync) {
          // Access wasn't opened yet: its owner, groups and users first.
          this.load();
        }
      });
  }

  /** `run` once the Organization and the applications are in ({@link ready}) — a list just reloading; given up after a while. */
  private whenReady(run: () => void, tries = 60): void {
    if (this.ready && !this.syncing && !this.groupsLoading) {
      run();
    } else if (tries > 0) {
      timer(500)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => this.whenReady(run, tries - 1));
    }
  }

  /**
   * The automatic sync after an edit: the groups covering a changed site —
   * as it now is, or as it was — and a new product line's or market's own
   * groups (the rule chain made them, not synced). No "Sync all" needed for
   * a new plant or a site moved.
   */
  private syncPending(): void {
    const sites = [...this.pending.sites.values()];
    const before = this.pending.before;
    const items = this.pending.items;
    this.pending = { sites: new Map(), before: [], items: new Set(), reload: this.pending.reload };
    if (!sites.length && !items.size) {
      return;
    }
    const rows = this.org.sites.rows;
    const lines = this.org.productLines.rows;
    const without = (list: AssetRow[]) => rows.filter((r) => !list.some((x) => x.id === r.id));
    const now = [...without(sites), ...sites];
    const was = [...without(before), ...before];
    const ids = new Set(sites.map((x) => x.id));
    const covers = (g: AccessGroup, list: AssetRow[]) => scopeSites(g.scope, list, lines).some((x) => ids.has(x.id));
    const list = this.groups.filter((g) => covers(g, now) || (before.length > 0 && covers(g, was)) || scopeItems(g.scope).some((id) => items.has(id)));
    const what = sites.length === 1 ? sites[0].label || sites[0].name : sites.length ? `${sites.length} sites` : "New groups";
    this.syncGroups(list, sites, what);
  }

  /** Some groups synced together (their lookups shared) — its progress as "Sync all"'s, its toast named for what changed. */
  private syncGroups(list: AccessGroup[], extra: AssetRow[], what: string): void {
    if (!list.length) {
      return;
    }
    this.syncing = true;
    this.syncFailures = [];
    this.progress = { done: 0, total: list.length };
    this.changed();
    this.batched(() =>
      from(list).pipe(
        mergeMap(
          (g) =>
            this.syncSteps(g, extra).pipe(
              map((r) => r.failed),
              catchError((err) => {
                this.noteFailure(`${g.name} · sync`, err);
                return of(1);
              }),
              tap(() => this.stepDone())
            ),
          BATCH_PARALLEL
        ),
        toArray()
      )
    )
      .pipe(
        map((failed) => failed.reduce((n: number, f) => n + f, 0)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((failed) => {
        this.syncing = false;
        this.progress = null;
        const text = `${what}: ${list.length} ${list.length === 1 ? "group" : "groups"} synced`;
        if (failed) {
          console.warn(`[access] ${text} — ${failed} failed steps:\n${this.syncFailures.join("\n")}`);
          this.notices.error(`${text} — ${failed} step${failed === 1 ? "" : "s"} failed. (All in the browser console.)`);
        } else {
          this.notices.success(text);
        }
        this.loadGroups();
      });
  }

  /** The delete confirmation's note: the groups that go with these items. */
  private itemsDeleteNote(assets: AssetRow[]): string {
    const its = assets.length === 1 ? "Its" : "Their";
    const them = assets.length === 1 ? "it" : "them";
    if (!this.loaded) {
      return `${its} access groups go with ${them}.`;
    }
    const ids = new Set(assets.map((a) => a.id));
    const n = this.groups.filter((g) => scopeItems(g.scope).some((id) => ids.has(id))).length;
    return n ? `${its} ${n} access ${n === 1 ? "group goes" : "groups go"} with ${them}.` : "";
  }

  /** The default groups the roles call for and not made yet: a group a role for each scope item it applies to (regional, product lines, markets, plants). */
  get missingDefaults(): { scope: AccessScope; level: AccessLevel }[] {
    const o = this.org;
    const m = this.missing;
    if (
      m &&
      m.groups === this.groups &&
      m.roles === this.roles &&
      m.productLines === o.productLines.rows &&
      m.markets === o.markets.rows &&
      m.sites === o.sites.rows
    ) {
      return m.list;
    }
    const list = this.roles.flatMap((r) => this.roleMissing(r));
    this.missing = { groups: this.groups, roles: this.roles, productLines: o.productLines.rows, markets: o.markets.rows, sites: o.sites.rows, list };
    return list;
  }

  /** Every scope item a default group can stand on: regional, each product line, market and plant. */
  private itemScopes(): AccessScope[] {
    const o = this.org;
    return [
      EVERYTHING,
      ...o.productLines.rows.map((r) => itemScope("productLine", r)),
      ...o.markets.rows.map((r) => itemScope("market", r)),
      ...o.sites.rows.map((r) => itemScope("site", r)),
    ];
  }

  /** A role's default groups not made yet: for each scope item it applies to without one. */
  private roleMissing(role: AccessRole, groups = this.groups): { scope: AccessScope; level: AccessLevel }[] {
    const have = new Set(groups.filter((g) => g.auto && g.level === role.id).map((g) => scopeKey(g.scope)));
    return this.itemScopes()
      .filter((scope) => roleAppliesTo(role, scope) && !have.has(scopeKey(scope)))
      .map((scope) => ({ scope, level: role.id }));
  }

  /**
   * A role's default groups it no longer applies to (regional's, a product
   * line's, a market's or a plant's — a market's filtered to a product line
   * is left be): `empty` ones go when the role is applied, the rest stay
   * until their members move.
   */
  private roleUnused(role: AccessRole, scopeOf: (r: AccessRole) => AccessRole = (r) => r): { empty: AccessGroup[]; kept: AccessGroup[] } {
    const applied = scopeOf(role);
    // Only groups standing on one item (a market filtered to a product line, or several plants, are left be).
    const onItem = (g: AccessGroup) => {
      const type = accessScopeType(g.scope);
      return type === "site" ? g.scope.siteIds.length === 1 : type !== "market" || !g.scope.productLineId;
    };
    const unused = this.groups.filter((g) => g.auto && g.level === role.id && onItem(g) && !roleAppliesTo(applied, g.scope));
    return { empty: unused.filter((g) => !g.members.length), kept: unused.filter((g) => g.members.length > 0) };
  }

  /** How many default groups are missing — once the groups and the Organization are in (0 until then). */
  get defaultsMissing(): number {
    return this.loaded && this.ready && !this.groupsLoading ? this.missingDefaults.length : 0;
  }

  /** "Add default groups (n)": confirm first. */
  askAddDefaults(): void {
    if (this.ready && this.loaded) {
      this.defaultsConfirm = this.missingDefaults.length;
    }
  }

  get defaultsMessage(): string {
    const n = this.defaultsConfirm;
    return (
      `${n} default ${n === 1 ? "group" : "groups"} will be made and synced — a group of each role for every scope item it applies to ` +
      `(Access › Roles) that doesn't have one yet. It can take a few minutes.`
    );
  }

  /** The missing default groups made and synced, one after another. */
  addDefaults(): void {
    const list = this.missingDefaults;
    this.defaultsConfirm = 0;
    if (!list.length || this.syncing) {
      return;
    }
    this.syncing = true;
    this.progress = { done: 0, total: list.length };
    this.changed();
    const groups = [...this.groups];
    this.batched(() =>
      from(list).pipe(
        mergeMap(
          (d) =>
            this.groupFor(d.scope, d.level, groups).pipe(
              map((r) => r.made),
              catchError(() => of(false)),
              tap(() => this.stepDone())
            ),
          BATCH_PARALLEL
        ),
        toArray()
      )
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((made) => {
        this.syncing = false;
        this.progress = null;
        const n = made.filter(Boolean).length;
        if (n < list.length) {
          this.notices.error(`Made ${n} of ${list.length} default groups — "Add default groups" makes the rest.`);
        } else {
          this.notices.success(`${n} default ${n === 1 ? "group" : "groups"} made`);
        }
        this.loadGroups();
      });
  }

  // -- the sync ----------------------------------------------------------------------------------

  /**
   * Sync one group: its entity groups made (or found), their members set, and
   * its permissions — and an older plant scope's product line and market
   * stored. `extra`: Organization rows not in the lists yet (one just made).
   */
  syncSteps(group: AccessGroup, extra: AssetRow[] = []): Observable<AccessSyncReport> {
    // A group synced: the membership indexes are due (written with the groups' next reload).
    this.indexDue = true;
    return forkJoin({ roles: this.ensureRoles(), target: this.target(group), blocks: this.ensureBlocks(group) }).pipe(
      switchMap(({ roles, target, blocks }) => {
        // A lookup failed: what's known is added, nothing removed (it may only be missing from the lookup).
        const remove = !target.incomplete;
        if (target.incomplete) {
          this.noteFailure(`${group.name} · lookup`, `${target.incomplete} lookup${target.incomplete === 1 ? "" : "s"} failed — nothing removed`);
        }
        const counted = (step: string) => (failed: number) => {
          if (failed) {
            this.noteFailure(`${group.name} · ${step}`, `${failed} failed`);
          }
          return failed;
        };
        return forkJoin([
          this.setGroupEntities(blocks.devices, target.devices, remove, `${group.name} · devices`),
          this.setGroupEntities(blocks.assets, target.assets, remove, `${group.name} · assets`),
          this.setGroupEntities(blocks.dashboards, target.dashboards, remove, `${group.name} · dashboards`),
          this.setPermissions(group, blocks, roles),
          this.saveScopeAttributes(group, extra).pipe(map(counted("scope attributes"))),
          this.storeCompleteScope(group, blocks).pipe(map(counted("complete scope"))),
        ]).pipe(
          map(([d, a, b, p, attrs, stored]) => ({
            added: d.added + a.added + b.added,
            removed: d.removed + a.removed + b.removed,
            skipped: target.skipped,
            failed: d.failed + a.failed + b.failed + p + attrs + stored + target.incomplete,
          }))
        );
      })
    );
  }

  /**
   * What a group covers: its scope's sites, their markets and product lines,
   * the Application assets of the apps running in its scope — and every
   * device and asset that belongs to its scope (any profile):
   * - each of its sites' subtree (up to {@link SCOPE_DEPTH} relations: a
   *   gateway, the devices it created);
   * - unless it lists sites, the markets' and product lines' own entities (a
   *   market's trucks, their gateways and tickets) that fit it — under its
   *   market, if it names one, and under its product line, if it names one —
   *   with their subtrees;
   * - its sites' markets' site-wide entities ({@link SITE_WIDE_RELATIONS}: a
   *   market's fuel codes) where they apply — at the market's sites an app
   *   owning their profile runs at (a fuel code: the Fuel app's sites, where
   *   it works) — when one of those is in its scope, a plant's too; as they
   *   are (no subtree).
   * A walk never enters another site, market or product line. And the
   * dashboards of the apps running in its scope and its other dashboards —
   * the tenant's (the default home opens for every user through
   * {@link shareDefaultHome}). Only the access owner's devices, assets and
   * the tenant's dashboards join (the rest: skipped, by name).
   */
  private target(g: AccessGroup): Observable<{ devices: string[]; assets: string[]; dashboards: string[]; skipped: string[]; incomplete: number }> {
    // Its dashboards are its own; what it reaches is its scope's (the apps running there too) — shared within a batch (a scope's three levels).
    const apps = this.groupApps(g);
    const ids = [...new Set([...apps.flatMap((a) => a.dashboardIds), ...g.dashboardIds].filter((x) => !!x))].sort();
    const key = `reach|${JSON.stringify(g.scope)}`;
    return forkJoin({
      r: this.shared(key, () => this.reach(g)),
      found: this.dashboardOwners(ids),
    }).pipe(
      map(({ r, found }) => {
        if (found === null) {
          // Their owners unknown: nothing added or removed this time.
          return { ...r, dashboards: [], incomplete: r.incomplete + 1 };
        }
        // Its dashboards group is the tenant's, and a group only holds its owner's entities: anyone else's is left out (named).
        const tenants = found.filter((d) => d.owner.entityType === "TENANT").map((d) => d.id);
        const others = found.filter((d) => d.owner.entityType !== "TENANT").map((d) => d.title);
        return { ...r, dashboards: tenants, skipped: [...r.skipped, ...others] };
      })
    );
  }

  /**
   * The default home (see {@link defaultHome}) open to every user of the
   * access owner — one entity group holding it ("Access · Home", owned by the
   * dashboard's owner: a group only holds its owner's entities) and one
   * Viewer grant on it to the owner's "All" user group, which every user is in
   * — instead of a grant per access group. Run with Sync all; failed steps:
   * their count (each named, see {@link noteFailure}).
   */
  private shareDefaultHome(): Observable<number> {
    const tenantId = this.ctx.currentUser?.tenantId ?? "";
    return forkJoin({ home: this.defaultHome(), roles: this.ensureRoles() }).pipe(
      switchMap(({ home, roles }) => {
        if (!home) {
          return of(0);
        }
        return this.dashboardOwners([home]).pipe(
          switchMap((found) => {
            const d = found?.[0];
            const owner: TbId | null = !d
              ? null
              : d.owner.entityType === "TENANT"
                ? { entityType: "TENANT", id: tenantId }
                : d.owner.entityType === "CUSTOMER" && d.owner.id === this.ownerId
                  ? { entityType: "CUSTOMER", id: this.ownerId }
                  : null;
            if (!owner) {
              this.noteFailure("Default home", d ? `${d.title} is owned by another customer, not the tenant or ${this.ownerTitle}` : "it couldn't be read");
              return of(1);
            }
            return forkJoin({
              group: this.ensureNamedGroup("Access · Home", "DASHBOARD", owner),
              all: this.get<{ id: TbId }>(`/api/entityGroup/all/CUSTOMER/${this.ownerId}/USER`),
            }).pipe(
              switchMap(({ group, all }) =>
                forkJoin([
                  this.setGroupEntities(group, [home], true, "Default home · its group").pipe(map((r) => r.failed)),
                  this.ensurePermission(all.id.id, roles.viewer, group, "DASHBOARD", "Default home · the grant to every user"),
                ])
              ),
              map(([members, grant]) => members + grant)
            );
          })
        );
      }),
      catchError((err) => {
        this.noteFailure("Default home", err);
        return of(1);
      })
    );
  }

  /** An entity group of this name, type and owner — found, else made — marked auto-generated: its id. */
  private ensureNamedGroup(name: string, type: string, owner: TbId): Observable<string> {
    const make = () =>
      this.post<{ id: TbId }>("/api/entityGroup", { name, type, ownerId: owner, additionalInfo: { autoGenerated: true } }).pipe(
        switchMap((eg) => this.markAutoGenerated(eg.id.id).pipe(map(() => eg.id.id as string)))
      );
    return this.get<{ id: TbId } | null>(`/api/entityGroup/${owner.entityType}/${owner.id}/${type}/${encodeURIComponent(name)}`).pipe(
      catchError(() => of(null)),
      switchMap((eg) => (eg?.id?.id ? of(eg.id.id) : make()))
    );
  }

  /** A user group holds this role on this entity group (made when missing): 1 if it failed. */
  private ensurePermission(userGroupId: string, roleId: string, entityGroupId: string, groupType: string, label: string): Observable<number> {
    return this.get<any[]>(`/api/userGroup/${userGroupId}/groupPermissions`).pipe(
      switchMap((current) =>
        (current ?? []).some((p) => p.roleId?.id === roleId && p.entityGroupId?.id === entityGroupId)
          ? of(0)
          : this.post("/api/groupPermission", {
              userGroupId: { entityType: "ENTITY_GROUP", id: userGroupId },
              roleId: { entityType: "ROLE", id: roleId },
              entityGroupId: { entityType: "ENTITY_GROUP", id: entityGroupId },
              entityGroupType: groupType,
            }).pipe(map(() => 0))
      ),
      catchError((err) => {
        this.noteFailure(label, err);
        return of(1);
      })
    );
  }

  /** A failed sync step, named — "<group> · <step>: <reason>" (kept for the report, at most 500). */
  private noteFailure(label: string, err: unknown): void {
    if (this.syncFailures.length >= 500) {
      return;
    }
    const reason = typeof err === "string" ? err : apiMessage(err).replace(/^: /, "").replace(/^\.$/, "no reason given");
    this.syncFailures.push(`${label}: ${reason}`);
  }

  /**
   * The default home dashboard — where every user of the access owner lands
   * ({@link applyHomes}): the owner's ("WCAN": its customer home dashboard),
   * else the tenant's. "" when neither is set (or they can't be read). Looked
   * up once.
   */
  private defaultHome(): Observable<string> {
    this.homeLoad ??= this.get<{ additionalInfo?: { homeDashboardId?: string } }>(`/api/customer/${this.ownerId}`).pipe(
      map((c) => String(c?.additionalInfo?.homeDashboardId ?? "")),
      catchError(() => of("")),
      switchMap((id) =>
        id
          ? of(id)
          : this.get<{ dashboardId?: { id?: string } }>("/api/tenant/dashboard/home/info").pipe(
              map((h) => h?.dashboardId?.id ?? ""),
              catchError(() => of(""))
            )
      ),
      shareReplay(1)
    );
    return this.homeLoad;
  }

  /**
   * New entities the access groups would take at their next sync — fuel codes
   * as they're assigned — joined now, so the groups' users see them at once:
   * each to every synced group (its devices / assets group made: a group never
   * synced takes everything at its first sync) whose scope holds a site the
   * entity applies at (`sites`, each with its market and product line: a site
   * code's site; a market code's sites the Fuel app runs at), when the access
   * owner owns it — as {@link reach} picks them (any profile). Emits how many joins
   * were made; a failure is let go (the next sync adds them).
   */
  joinCoveringGroups(entities: CoveredEntity[]): Observable<number> {
    if (!entities.length) {
      return of(0);
    }
    const owner$ = this.ownerId ? of({ id: this.ownerId, title: this.ownerTitle }) : this.resolveOwner();
    return owner$.pipe(
      switchMap((owner) =>
        (this.loaded
          ? of(this.groups)
          : this.get<{ id: TbId; name: string; additionalInfo?: any }[]>(`/api/entityGroups/CUSTOMER/${owner.id}/USER`).pipe(
              map((list) => (list ?? []).map((g) => this.toGroup(g, [])).filter((g): g is AccessGroup => !!g))
            )
        ).pipe(map((groups) => ({ owner, groups })))
      ),
      switchMap(({ owner, groups }) => {
        const lines = this.org.productLines.rows;
        const joins = new Map<string, string[]>(); // a group's devices / assets group → the entities joining it
        for (const e of entities) {
          if (e.ownerId !== owner.id) {
            continue;
          }
          const device = e.entityType === EntityType.DEVICE;
          for (const g of groups) {
            const block = device ? g.blocks.devices : g.blocks.assets;
            if (block && scopeSites(g.scope, e.sites, lines).length) {
              joins.set(block, [...(joins.get(block) ?? []), e.id]);
            }
          }
        }
        const steps = [...joins.entries()].map(([block, ids]) => this.post(`/api/entityGroup/${block}/addEntities`, ids).pipe(map(() => ids.length)));
        return steps.length ? forkJoin(steps).pipe(map((counts) => counts.reduce((n, c) => n + c, 0))) : of(0);
      }),
      catchError(() => of(0))
    );
  }

  /**
   * Entities moved away from some sites — a fuel code moved to other plants —
   * leave the synced groups whose scope holds a site they left (`sites`) but
   * none of those they're at now (`keep`), as the groups' next sync would
   * take them out. Emits how many leaves were made; a failure is let go (the
   * next sync settles it).
   */
  leaveCoveringGroups(entities: CoveredEntity[], keep: AssetRow[]): Observable<number> {
    if (!entities.length) {
      return of(0);
    }
    const owner$ = this.ownerId ? of({ id: this.ownerId, title: this.ownerTitle }) : this.resolveOwner();
    return owner$.pipe(
      switchMap((owner) =>
        (this.loaded
          ? of(this.groups)
          : this.get<{ id: TbId; name: string; additionalInfo?: any }[]>(`/api/entityGroups/CUSTOMER/${owner.id}/USER`).pipe(
              map((list) => (list ?? []).map((g) => this.toGroup(g, [])).filter((g): g is AccessGroup => !!g))
            )
        ).pipe(map((groups) => ({ owner, groups })))
      ),
      switchMap(({ owner, groups }) => {
        const lines = this.org.productLines.rows;
        const leaves = new Map<string, string[]>(); // a group's devices / assets group → the entities leaving it
        for (const e of entities) {
          if (e.ownerId !== owner.id) {
            continue;
          }
          const device = e.entityType === EntityType.DEVICE;
          for (const g of groups) {
            const block = device ? g.blocks.devices : g.blocks.assets;
            if (block && scopeSites(g.scope, e.sites, lines).length && !scopeSites(g.scope, keep, lines).length) {
              leaves.set(block, [...(leaves.get(block) ?? []), e.id]);
            }
          }
        }
        const steps = [...leaves.entries()].map(([block, ids]) => this.post(`/api/entityGroup/${block}/deleteEntities`, ids).pipe(map(() => ids.length)));
        return steps.length ? forkJoin(steps).pipe(map((counts) => counts.reduce((n, c) => n + c, 0))) : of(0);
      }),
      catchError(() => of(0))
    );
  }

  /** What a group's scope reaches (see {@link target}). */
  private reach(g: AccessGroup): Observable<{ devices: string[]; assets: string[]; dashboards: string[]; skipped: string[]; incomplete: number }> {
    const org = this.org;
    const lines = org.productLines.rows;
    const sites = scopeSites(g.scope, org.sites.rows, lines);
    const uniq = (list: (string | null | undefined)[]) => [...new Set(list.filter((x): x is string => !!x))];
    // A plant scope names its plant (it may not be in the list yet: just made); a product line takes its sub lines with it.
    const listed = g.scope.siteIds.length > 0;
    const subLines = g.scope.productLineId && !listed ? subProductLines(g.scope.productLineId, lines) : [];
    const marketIds = uniq([...sites.map((s) => s.marketId), g.scope.marketId]);
    const productLineIds = uniq([...sites.map((s) => s.productLineId), g.scope.productLineId, ...subLines]);
    // The apps running in its scope: their Application assets and dashboards (its devices and assets: every one in scope).
    const apps = this.groupApps(g);
    const allMarkets = org.markets.rows.map((r) => r.id);
    const allProductLines = org.productLines.rows.map((r) => r.id);
    // The hierarchy's own assets (any scope's): never "related" assets of another.
    const structural = new Set([...org.sites.rows.map((r) => r.id), ...allMarkets, ...allProductLines, ...this.apps.applications.map((a) => a.id)]);
    const siteIds = listed ? uniq(g.scope.siteIds) : sites.map((s) => s.id);
    const inScopeSites = new Set(siteIds);
    // A plant takes no market- or product-line-level entities; otherwise those of its market / product line and its sub lines (any, when it names none).
    const parents = listed
      ? []
      : uniq([...(g.scope.marketId ? [g.scope.marketId] : allMarkets), ...(g.scope.productLineId ? [g.scope.productLineId, ...subLines] : allProductLines)]);
    const dashboards = uniq([...apps.flatMap((a) => a.dashboardIds), ...g.dashboardIds]);
    // Its sites' markets: their site-wide entities (fuel codes) apply at its sites — any scope's, a plant's too.
    const siteWide = new Set(SITE_WIDE_RELATIONS);
    const siteMarkets = uniq(sites.map((s) => s.marketId));
    const lookIn = uniq([...parents, ...siteMarkets]);
    /** Lookups that failed (a relation query, an entity query): the result is then incomplete. */
    let incomplete = 0;
    const counted = <T>(list: T[] | null): T[] => {
      if (list === null) {
        incomplete++;
      }
      return list ?? [];
    };
    const children$ = lookIn.length
      ? forkJoin(
          lookIn.map((id) =>
            this.shared(`children|${id}`, () =>
              this.ctx.entityRelationService.findByFrom({ entityType: EntityType.ASSET, id }, QUIET_REQUEST).pipe(catchError(() => of(null)))
            )
          )
        )
      : of([] as (EntityRelation[] | null)[]);
    return children$.pipe(
      map((results) => results.map(counted)),
      map((lists) => {
        const relations = lists.flat();
        const parentIds = new Set(parents);
        const siteMarketIds = new Set(siteMarkets);
        const isEntity = (r: EntityRelation) =>
          !!r.to?.id && !structural.has(r.to.id) && (r.to.entityType === EntityType.DEVICE || r.to.entityType === EntityType.ASSET);
        // Its sites' markets' site-wide entities (fuel codes), with the markets linking them: taken as they are, where they apply (at the end).
        const wide = new Map<string, { entityType: EntityType; markets: Set<string> }>();
        relations.forEach((r) => {
          if (siteWide.has(r.type) && siteMarketIds.has(r.from?.id) && isEntity(r)) {
            const w = wide.get(r.to.id) ?? { entityType: r.to.entityType as EntityType, markets: new Set<string>() }; // a device or an asset (isEntity)
            w.markets.add(r.from.id);
            wide.set(r.to.id, w);
          }
        });
        // Each direct child of a market / product line (but by a site-wide relation), with the markets and product lines it's under.
        const under = new Map<string, { entityType: EntityType; markets: Set<string>; productLines: Set<string> }>();
        const markets = new Set(allMarkets);
        relations.forEach((r) => {
          const to = r.to;
          if (!parentIds.has(r.from?.id) || siteWide.has(r.type) || !isEntity(r)) {
            return;
          }
          const c = under.get(to.id) ?? { entityType: to.entityType as EntityType, markets: new Set<string>(), productLines: new Set<string>() };
          (markets.has(r.from.id) ? c.markets : c.productLines).add(r.from.id);
          under.set(to.id, c);
        });
        const fits = (c: { markets: Set<string>; productLines: Set<string> }) =>
          (!g.scope.marketId || c.markets.has(g.scope.marketId)) &&
          (!g.scope.productLineId || [...c.productLines].some((l) => lineWithin(l, g.scope.productLineId, lines)));
        const owned = [...under.entries()].filter(([, c]) => fits(c)).map(([id, c]) => ({ id, entityType: c.entityType }));
        return { owned, wide };
      }),
      switchMap(({ owned, wide }) => {
        const trees = [
          ...siteIds.map((id) => this.relationTree(id, EntityType.ASSET, SCOPE_DEPTH)),
          ...owned.map((o) => this.relationTree(o.id, o.entityType, SCOPE_DEPTH - 1)),
        ];
        return (trees.length ? forkJoin(trees) : of([] as (EntityRelation[] | null)[])).pipe(map((lists) => ({ owned, wide, relations: lists.map(counted).flat() })));
      }),
      switchMap(({ owned, wide, relations }) => {
        const walk = reachable([...siteIds, ...owned.map((o) => o.id)], relations, (id) => !structural.has(id) || inScopeSites.has(id), structural);
        const direct = [...owned, ...[...wide.entries()].map(([id, w]) => ({ id, entityType: w.entityType }))];
        // Reached otherwise (its sites' subtrees, its markets' / product lines' own): no site-wide check.
        const reached = new Set([...walk.deviceIds, ...walk.assetIds, ...owned.map((o) => o.id)]);
        const deviceIds = uniq([...walk.deviceIds, ...direct.filter((o) => o.entityType === EntityType.DEVICE).map((o) => o.id)]);
        const relatedAssetIds = uniq([...walk.assetIds, ...direct.filter((o) => o.entityType === EntityType.ASSET).map((o) => o.id)]);
        const ownAssetIds = uniq([...siteIds, ...marketIds, ...productLineIds, ...apps.map((a) => a.id)]);
        return forkJoin({
          devices: this.entities(EntityType.DEVICE, deviceIds),
          related: this.entities(EntityType.ASSET, relatedAssetIds),
          own: this.entities(EntityType.ASSET, ownAssetIds),
        }).pipe(map((found) => ({ ...found, wide, reached })));
      }),
      map(({ devices, related, own, wide, reached }) => {
        /**
         * A site-wide entity (a fuel code) reached only through its market
         * applies at the market's sites an app owning its profile runs at (the
         * Fuel app's: a code works at its stations) — every site of the market
         * when no app (with its sites known) owns it: taken when one of those
         * sites is in the scope.
         */
        const appliesHere = (e: OwnedEntity, device: boolean): boolean => {
          const w = wide.get(e.id);
          if (!w || reached.has(e.id)) {
            return true;
          }
          const owners = this.apps.applications.filter((a) => (device ? a.deviceProfiles : a.assetProfiles).includes(e.type) && this.apps.sites.has(a.id));
          const appSites = new Set(owners.flatMap((a) => this.apps.sites.get(a.id) ?? []));
          return sites.some((x) => !!x.marketId && w.markets.has(x.marketId) && (!owners.length || appSites.has(x.id)));
        };
        const skipped: string[] = [];
        const ownedByOwner = (e: OwnedEntity) => {
          if (e.ownerType === "CUSTOMER" && e.ownerName === this.ownerTitle) {
            return true;
          }
          skipped.push(e.label || e.name);
          return false;
        };
        return {
          devices: counted(devices)
            .filter((d) => appliesHere(d, true) && ownedByOwner(d))
            .map((d) => d.id),
          assets: [...counted(own).filter(ownedByOwner), ...counted(related).filter((a) => appliesHere(a, false) && ownedByOwner(a))].map((a) => a.id),
          dashboards,
          skipped,
          incomplete,
        };
      })
    );
  }

  /** Every relation out of an entity, `depth` steps deep (one query); null when it failed. */
  private relationTree(id: string, entityType: EntityType, depth: number): Observable<EntityRelation[] | null> {
    return this.shared(`tree|${id}|${depth}`, () =>
      this.ctx.entityRelationService
        .findByQuery({ parameters: { rootId: id, rootType: entityType, direction: EntitySearchDirection.FROM, maxLevel: depth, fetchLastLevelOnly: false }, filters: [] }, QUIET_REQUEST)
        .pipe(catchError(() => of(null)))
    );
  }

  /**
   * Devices or assets by id, with their profile and owner — entity queries of
   * {@link LOOKUP_CHUNK} ids (in the body: a long id list in a URL is refused
   * by the proxy). Null when any of them failed.
   */
  private entities(entityType: EntityType, ids: string[]): Observable<OwnedEntity[] | null> {
    if (!ids.length) {
      return of([]);
    }
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += LOOKUP_CHUNK) {
      chunks.push(ids.slice(i, i + LOOKUP_CHUNK));
    }
    const field = (key: string) => ({ type: EntityKeyType.ENTITY_FIELD, key });
    return from(chunks).pipe(
      mergeMap(
        (chunk) => {
          const query: EntityDataQuery = {
            entityFilter: { type: AliasFilterType.entityList, entityType, entityList: chunk } as EntityFilter,
            entityFields: ["name", "label", "type", "ownerType", "ownerName"].map(field),
            latestValues: [],
            keyFilters: [],
            pageLink: { page: 0, pageSize: chunk.length },
          };
          return this.ctx.entityService.findEntityDataByQuery(query, QUIET_REQUEST).pipe(
            map((page) =>
              page.data.map((d: any): OwnedEntity => {
                const f = d.latest?.[EntityKeyType.ENTITY_FIELD] ?? {};
                const v = (k: string) => String(f[k]?.value ?? "");
                return { id: d.entityId.id, name: v("name"), label: v("label"), type: v("type"), ownerType: v("ownerType"), ownerName: v("ownerName") };
              })
            ),
            catchError(() => of(null))
          );
        },
        3
      ),
      toArray(),
      map((pages) => (pages.some((p) => p === null) ? null : pages.flatMap((p) => p ?? [])))
    );
  }

  /**
   * Dashboards' owners, from each one's own record — not an entity query's
   * `ownerType`, which calls a tenant dashboard with no customer set a
   * customer's (with no name). One lookup per dashboard within a batch; a
   * dashboard that's gone is left out; null if one couldn't be read.
   */
  private dashboardOwners(ids: string[]): Observable<DashboardOwner[] | null> {
    if (!ids.length) {
      return of([]);
    }
    return forkJoin(
      ids.map((id) =>
        this.shared(`dashboard|${id}`, () =>
          this.get<{ title?: string; name?: string; ownerId?: TbId }>(`/api/dashboard/info/${id}`).pipe(
            map((d): DashboardOwner | undefined => (d?.ownerId ? { id, title: d.title || d.name || id, owner: d.ownerId } : undefined)),
            // Gone (deleted since it was picked): nothing to add.
            catchError((err) => of(err?.status === 404 ? undefined : null))
          )
        )
      )
    ).pipe(map((list) => (list.some((d) => d === null) ? null : list.filter((d): d is DashboardOwner => !!d))));
  }

  /**
   * The group's three entity groups: found by their stored ids, else made
   * (renamed to follow the group) — or, when one of that name is there already
   * (a sync cut off before it stored them), that one; stored back when new.
   * Each is marked auto-generated — `additionalInfo.autoGenerated` (lists of a
   * device's groups hide them) and the server attribute `autoGenerated` —
   * when made, or the first time a sync finds it unmarked.
   */
  private ensureBlocks(g: AccessGroup): Observable<AccessBlocks> {
    const tenantId = this.ctx.currentUser?.tenantId ?? "";
    const specs: { key: keyof AccessBlocks; type: string; suffix: string; owner: TbId }[] = [
      { key: "devices", type: "DEVICE", suffix: "Devices", owner: { entityType: "CUSTOMER", id: this.ownerId } },
      { key: "assets", type: "ASSET", suffix: "Assets", owner: { entityType: "CUSTOMER", id: this.ownerId } },
      // Dashboards are the tenant's: so is their group (shared with the owner's user group by the permission).
      { key: "dashboards", type: "DASHBOARD", suffix: "Dashboards", owner: { entityType: "TENANT", id: tenantId } },
    ];
    return forkJoin(
      specs.map((s) => {
        const name = `Access · ${g.name} · ${s.suffix}`;
        // The block as it should be: its name, and marked auto-generated (the flag, then the attribute) when it wasn't.
        const settle = (eg: any) => {
          const marked = eg.additionalInfo?.autoGenerated === true;
          if (eg.name === name && marked) {
            return of(eg.id.id as string);
          }
          const saved = { ...eg, name, additionalInfo: { ...(eg.additionalInfo ?? {}), autoGenerated: true } };
          return this.post<{ id: TbId }>("/api/entityGroup", saved).pipe(
            switchMap(() => (marked ? of(null) : this.markAutoGenerated(eg.id.id))),
            map(() => eg.id.id as string)
          );
        };
        const byName = () => this.get<any>(`/api/entityGroup/${s.owner.entityType}/${s.owner.id}/${s.type}/${encodeURIComponent(name)}`).pipe(switchMap(settle));
        const make = () =>
          this.post<{ id: TbId }>("/api/entityGroup", { name, type: s.type, ownerId: s.owner, additionalInfo: { autoGenerated: true } }).pipe(
            switchMap((eg) => this.markAutoGenerated(eg.id.id).pipe(map(() => eg.id.id))),
            catchError(() => byName())
          );
        const id = g.blocks[s.key];
        return id
          ? this.get<any>(`/api/entityGroup/${id}`).pipe(
              switchMap(settle),
              catchError(() => make())
            )
          : make();
      })
    ).pipe(
      map(([devices, assets, dashboards]) => ({ devices, assets, dashboards })),
      switchMap((blocks) =>
        blocks.devices === g.blocks.devices && blocks.assets === g.blocks.assets && blocks.dashboards === g.blocks.dashboards
          ? of(blocks)
          : this.get<any>(`/api/entityGroup/${g.id}`).pipe(
              switchMap((ug) => this.post("/api/entityGroup", { ...ug, additionalInfo: accessInfo(ug.additionalInfo, { ...g, blocks }) })),
              map(() => blocks)
            )
      )
    );
  }

  /** The server attribute `autoGenerated` on an entity group the sync made (for ThingsBoard's own filters); a failure is let go — the flag in its additional info stands. */
  private markAutoGenerated(entityGroupId: string): Observable<unknown> {
    return this.ctx.attributeService
      .saveEntityAttributes({ entityType: "ENTITY_GROUP" as EntityType, id: entityGroupId }, AttributeScope.SERVER_SCOPE, [{ key: "autoGenerated", value: true }], QUIET_REQUEST)
      .pipe(catchError(() => of(null)));
  }

  /** An entity group holds exactly `ids`: the missing added, the rest removed (unless `remove` is off: added only). */
  private setGroupEntities(groupId: string, ids: string[], remove = true, label = "entity group"): Observable<{ added: number; removed: number; failed: number }> {
    return this.pages<{ id: TbId }>(`/api/entityGroup/${groupId}/entities`).pipe(
      switchMap((current) => {
        const have = new Set(current.map((e) => e.id.id));
        const want = new Set(ids);
        const add = ids.filter((id) => !have.has(id));
        const extra = remove ? [...have].filter((id) => !want.has(id)) : [];
        const steps: Observable<unknown>[] = [];
        for (let i = 0; i < add.length; i += 100) {
          steps.push(this.post(`/api/entityGroup/${groupId}/addEntities`, add.slice(i, i + 100)));
        }
        for (let i = 0; i < extra.length; i += 100) {
          steps.push(this.post(`/api/entityGroup/${groupId}/deleteEntities`, extra.slice(i, i + 100)));
        }
        return runSteps(steps, (err) => this.noteFailure(label, err)).pipe(map((failed) => ({ added: add.length, removed: extra.length, failed })));
      })
    );
  }

  /**
   * The group's permissions: exactly its role's actions (any other on it
   * removed) — on its devices and assets: Viewer for a view, Operator for all
   * of them (view, edit and — devices — control), else the view with Editor /
   * Controller beside it; Viewer on its dashboards; the alarms read (or read
   * and acted on); its members seen (Member reader) or managed (Member
   * manager). Its role unknown (the roles not in, or it was removed): its
   * permissions are left as they are — a failed step.
   */
  private setPermissions(g: AccessGroup, blocks: AccessBlocks, roles: Record<RoleKey, string>): Observable<number> {
    const role = this.roleOf(g.level);
    if (!role) {
      this.noteFailure(`${g.name} · permissions`, `role "${g.level}" not found — permissions left as they are`);
      return of(1);
    }
    const can = new Set(role.actions);
    const entity = (what: "devices" | "assets", groupId: string, groupType: string): PermissionSpec[] => {
      const view = can.has(`${what}.view`);
      const edit = can.has(`${what}.edit`);
      const control = what === "devices" ? can.has("devices.control") : edit;
      if (view && edit && control) {
        return [{ role: "operator", groupId, groupType }];
      }
      return [
        ...(view ? [{ role: "viewer" as RoleKey, groupId, groupType }] : []),
        ...(edit ? [{ role: "editor" as RoleKey, groupId, groupType }] : []),
        ...(what === "devices" && control ? [{ role: "controller" as RoleKey, groupId, groupType }] : []),
      ];
    };
    const want: PermissionSpec[] = [
      ...entity("devices", blocks.devices, "DEVICE"),
      ...entity("assets", blocks.assets, "ASSET"),
      ...(can.has("dashboards.view") ? [{ role: "viewer" as RoleKey, groupId: blocks.dashboards, groupType: "DASHBOARD" }] : []),
      ...(can.has("alarms.edit")
        ? [{ role: "alarmOperator" as RoleKey, groupId: null, groupType: null }]
        : can.has("alarms.view")
          ? [{ role: "alarmReader" as RoleKey, groupId: null, groupType: null }]
          : []),
      ...(can.has("members.edit")
        ? [{ role: "memberManager" as RoleKey, groupId: g.id, groupType: "USER" }]
        : can.has("members.view")
          ? [{ role: "memberReader" as RoleKey, groupId: g.id, groupType: "USER" }]
          : []),
    ];
    const key = (roleId: string, groupId: string | null) => `${roleId}|${groupId ?? ""}`;
    return this.get<any[]>(`/api/userGroup/${g.id}/groupPermissions`).pipe(
      switchMap((current) => {
        const wantKeys = new Map(want.map((p) => [key(roles[p.role], p.groupId), p]));
        const have = new Map((current ?? []).map((p) => [key(p.roleId?.id, p.entityGroupId?.id ?? null), p]));
        const steps: Observable<unknown>[] = [];
        have.forEach((p, k) => {
          if (!wantKeys.has(k)) {
            steps.push(this.ctx.http.delete(`/api/groupPermission/${p.id.id}`, this.options()));
          }
        });
        wantKeys.forEach((p, k) => {
          if (!have.has(k)) {
            steps.push(
              this.post("/api/groupPermission", {
                userGroupId: { entityType: "ENTITY_GROUP", id: g.id },
                roleId: { entityType: "ROLE", id: roles[p.role] },
                ...(p.groupId ? { entityGroupId: { entityType: "ENTITY_GROUP", id: p.groupId }, entityGroupType: p.groupType } : {}),
              })
            );
          }
        });
        return runSteps(steps, (err) => this.noteFailure(`${g.name} · permissions`, err));
      })
    );
  }

  /**
   * The group's definition as server attributes on its user group — plain
   * strings, so filter boxes, entity queries' key filters and ThingsBoard's own
   * widgets can filter groups by them: `scopeType` (all / productLine / market /
   * site), `scope` (in words), `productLine` / `productLineId`, `market` /
   * `marketId`, `plants` / `plantIds` (comma-separated), `level`,
   * `applications` / `applicationIds` (the apps running in its scope; none: "No applications"). Names as they are at
   * the sync. 1 if it failed.
   */
  private saveScopeAttributes(g: AccessGroup, extra: AssetRow[] = []): Observable<number> {
    const nameOf = this.nameOf(extra);
    const apps = this.groupApps(g);
    const attributes = {
      ...scopeAttributes(completeScope(g.scope, [...this.org.sites.rows, ...extra], this.org.productLines.rows), nameOf),
      level: g.level,
      applications: apps.length ? apps.map((a) => a.label || a.name).join(", ") : "No applications",
      applicationIds: apps.map((a) => a.id).join(","),
      // A scope item's default group (made with it, by the rule chain or "Add default groups").
      autoGenerated: g.auto,
    };
    return this.ctx.attributeService
      .saveEntityAttributes(
        // ThingsBoard PE's entity groups (its CE models, which this build compiles against, don't list the type).
        { entityType: "ENTITY_GROUP" as EntityType, id: g.id },
        AttributeScope.SERVER_SCOPE,
        Object.entries(attributes).map(([key, value]) => ({ key, value })),
        QUIET_REQUEST
      )
      .pipe(
        map(() => 0),
        catchError(() => of(1))
      );
  }

  /** An older plant scope (no product line / market) stored with its plant's. 1 if it failed. */
  private storeCompleteScope(g: AccessGroup, blocks: AccessBlocks): Observable<number> {
    const scope = completeScope(g.scope, this.org.sites.rows, this.org.productLines.rows);
    if (scope === g.scope) {
      return of(0);
    }
    return this.get<any>(`/api/entityGroup/${g.id}`).pipe(
      switchMap((ug) => this.post("/api/entityGroup", { ...ug, additionalInfo: accessInfo(ug.additionalInfo, { ...g, scope, blocks }) })),
      map(() => 0),
      catchError(() => of(1))
    );
  }

  /** The access roles' ids — found by name, made when missing, brought up to their permissions here when those changed (once). */
  private ensureRoles(): Observable<Record<RoleKey, string>> {
    const keys = Object.keys(ROLES) as RoleKey[];
    if (keys.every((k) => this.roleIds[k])) {
      return of(this.roleIds as Record<RoleKey, string>);
    }
    // One lookup however many groups sync at once (each would otherwise make a missing role).
    this.rolesLoad ??= this.pages<{ id: TbId; name: string; permissions?: unknown }>("/api/roles").pipe(
      switchMap((roles) => {
        const byName = new Map(roles.map((r) => [r.name, r]));
        return forkJoin(
          keys.map((k) => {
            const found = byName.get(ROLES[k].name);
            if (!found) {
              return this.post<{ id: TbId }>("/api/role", ROLES[k]).pipe(map((r) => r.id.id));
            }
            // A role made before its permissions grew (the generic ones: the user's own profile, the profiles' icons): saved with what
            // it lacks — what it has beyond them (set by hand) stays. Refused, the role stays as it was: the sync goes on with it.
            const grown = withPermissions(found.permissions, ROLES[k].permissions);
            if (grown) {
              return this.post<{ id: TbId }>("/api/role", { ...found, permissions: grown }).pipe(
                map((r) => r.id.id),
                catchError(() => of(found.id.id))
              );
            }
            return of(found.id.id);
          })
        );
      }),
      map((ids) => {
        keys.forEach((k, i) => (this.roleIds[k] = ids[i]));
        return this.roleIds as Record<RoleKey, string>;
      }),
      shareReplay(1),
      catchError((err) => {
        this.rolesLoad = undefined;
        return throwError(() => err);
      })
    );
    return this.rolesLoad;
  }

  /**
   * Users' homes: every user of the access owner lands on the default home
   * ({@link defaultHome}: Home) — written where it differs (or their record
   * still carries an older "Opens on", {@link OLD_HOME_KEYS}, dropped): opening
   * on it, full screen, its toolbar hidden — each one's record read first (as
   * it now is: nothing written when it already opens there).
   */
  applyHomes(userIds: string[]): Observable<number> {
    const ids = [...new Set(userIds)];
    if (!ids.length) {
      return of(0);
    }
    return this.defaultHome().pipe(
      switchMap((home) => {
        const steps: Observable<unknown>[] = [];
        for (const id of ids) {
          const user = this.users.find((u) => u.id === id);
          if (!home || (user && user.homeDashboardId === home && !user.oldHome)) {
            continue;
          }
          steps.push(
            this.get<any>(`/api/user/${id}`).pipe(
              switchMap((u) => {
                const info = u?.additionalInfo ?? {};
                const current = typeof info.homeDashboardId === "object" ? info.homeDashboardId?.id : info.homeDashboardId;
                const same = current === home && !OLD_HOME_KEYS.some((k) => k in info);
                return same ? of(null) : this.post("/api/user", { ...u, additionalInfo: homeInfo(info, home) });
              }),
              tap(() => {
                if (user) {
                  user.homeDashboardId = home;
                  user.oldHome = false;
                }
              })
            )
          );
        }
        return runSteps(steps);
      })
    );
  }

  /**
   * A group's applications: those running at one of its scope's sites (an
   * app runs at a plant with a device of its device profiles — the
   * Application → site relations the "Application Sites" rule chain keeps,
   * {@link ApplicationStore.sites}). They grant no access: their Application
   * assets and dashboards are shared with the group.
   */
  private groupApps(g: AccessGroup): Application[] {
    const running = new Set(appsRunningIn(g.scope, this.org.sites.rows, this.org.productLines.rows, this.apps.sites));
    return this.apps.applications.filter((a) => running.has(a.id));
  }

  // -- an Organization item's panel: the groups reaching it (OrganizationAccess) ---------------------

  get groupsVersion(): unknown {
    return this.groups;
  }

  get groupsLoaded(): boolean {
    return this.loaded;
  }

  loadAccess(): void {
    if (!this.loaded && !this.groupsLoading) {
      this.load();
    }
  }

  openUserOf(id: string): void {
    const u = this.users.find((x) => x.id === id);
    if (u) {
      this.openUser(u);
    }
  }

  get usersVersion(): unknown {
    return this.users;
  }

  /** A user's role in words and its place among the roles (a Tenant scope user's: after them) — by their id; null: not among the users. */
  userRoleOf(id: string): { name: string; order: number } | null {
    const u = this.users.find((x) => x.id === id);
    return u ? this.userRole(u) : null;
  }

  /** A user's role in words and its place among the roles (a Tenant scope user's: after them) — the lists grouping users by role. */
  userRole(u: AccessUser): { name: string; order: number } {
    const at = u.tenant ? -1 : this.roles.findIndex((r) => r.id === this.userLevel(u));
    return { name: this.userRoleLabel(u), order: at < 0 ? this.roles.length : at };
  }

  // -- the panels' trail -----------------------------------------------------------------------------

  /** Every panel of these closed: another opens — here or, by the trail, in another store. */
  private closePanels(): void {
    this.groupPanelOpen = false;
    this.rolePanelOpen = false;
    this.userPanelOpen = false;
    this.addUserOpen = false;
    this.healthOpenId = null;
  }

  /**
   * A panel of these opens: on an entity, a stop on the trail (after the one
   * now open, if any); a blank form or a bulk edit (null) ends the trail.
   * First thing — the trail reads what's open — then the others close.
   */
  private enter(stop: PanelStop | null): void {
    if (stop) {
      this.trail.visit(this, stop);
    } else {
      this.trail.reset(this);
    }
    this.closePanels();
  }

  /** A panel shows this tab (the group's, the role's): where its stop on the trail opens again. */
  noteTab(panel: "group" | "role", tab: string): void {
    if (panel === "group" ? this.groupPanelOpen : this.rolePanelOpen) {
      // The tab it opens on follows the tab shown: opening it on another is then a change the panel sees.
      if (panel === "group") {
        this.groupPanelTab = tab;
      } else {
        this.rolePanelTab = tab;
      }
    }
    const id = panel === "group" ? this.selectedGroupId : this.selectedRoleId;
    if (id) {
      this.trail.noteTab(`${panel}:${id}`, tab);
    }
  }

  private groupStop(id: string): PanelStop {
    const find = () => this.groups.find((g) => g.id === id);
    return {
      key: `group:${id}`,
      icon: "groups",
      kind: "Access group",
      label: () => find()?.name ?? null,
      isOpen: () => this.groupPanelOpen && this.editingGroup?.id === id,
      open: (tab) => {
        const g = find();
        if (g) {
          this.openGroup(g, tab);
        }
      },
      close: () => this.closeGroupPanel(),
    };
  }

  private userStop(id: string): PanelStop {
    const find = () => this.users.find((u) => u.id === id);
    return {
      key: `user:${id}`,
      icon: "person",
      kind: "User",
      label: () => {
        const u = find();
        return u ? accessUserName(u) : null;
      },
      isOpen: () => this.userPanelOpen && this.editingUser?.id === id,
      open: () => {
        const u = find();
        if (u) {
          this.openUser(u);
        }
      },
      close: () => this.closeUserPanels(),
    };
  }

  private roleStop(id: string): PanelStop {
    const find = () => this.roles.find((r) => r.id === id);
    return {
      key: `role:${id}`,
      icon: find()?.icon || "badge",
      kind: "Role",
      label: () => find()?.label ?? null,
      isOpen: () => this.rolePanelOpen && this.editingRole?.id === id,
      open: (tab) => {
        const r = find();
        if (r) {
          this.openRole(r, tab);
        }
      },
      close: () => this.closeRolePanel(),
    };
  }

  private healthStop(id: string): PanelStop {
    const find = () => this.health.find((c) => c.id === id);
    return {
      key: `health:${id}`,
      icon: "monitor_heart",
      kind: "Health",
      label: () => find()?.label ?? null,
      isOpen: () => this.healthOpenId === id,
      open: () => {
        const check = find();
        if (check) {
          this.openHealth(check);
        }
      },
      close: () => this.closeHealth(),
    };
  }

  // -- Access › Health: what should hold, and where it doesn't ---------------------------------------

  /**
   * The devices, for the checks on their names and gateways (null until read
   * — as Access › Health shows): where each is and what its name says, as
   * the backend keeps them ({@link DevicePlace}: `site` / `market`, `nameSite`
   * / `nameAsset` / `nameLine` — the "Device Naming" rule chain's — whether a
   * gateway created it and which, the gateway it's connected through now),
   * its profile, whether it's a vehicle (a device of the tenant's mobile
   * profiles, `mobileProfiles`) and whether a Site holds it itself (Site
   * —Contains→ device: one query over every Site, never a walk a device).
   */
  healthDevices: (DevicePlace & { id: string; name: string; profile: string; owner: string; vehicle: boolean; inSite: boolean })[] | null = null;
  private healthDevicesAsked = false;
  /** The Sites' ids, read with the devices (a fix's moves only touch a Site's relations). */
  private healthSiteIds = new Set<string>();

  /** The devices' names, places and gateways, read once (Access › Health) — again after a fix. */
  loadHealthDevices(again = false): void {
    if (this.healthDevicesAsked && !again) {
      return;
    }
    this.healthDevicesAsked = true;
    // Every page of a query's rows.
    const all = (query: Omit<EntityDataQuery, "pageLink">, n = 0): Observable<any[]> =>
      this.ctx.entityService
        .findEntityDataByQuery({ ...query, pageLink: { page: n, pageSize: 1000 } } as EntityDataQuery, QUIET_REQUEST)
        .pipe(switchMap((r) => (r.hasNext ? all(query, n + 1).pipe(map((rest) => [...r.data, ...rest])) : of(r.data as any[]))));
    const devices$ = all({
      entityFilter: { type: AliasFilterType.entityType, entityType: EntityType.DEVICE } as EntityFilter,
      entityFields: [
        { type: EntityKeyType.ENTITY_FIELD, key: "name" },
        { type: EntityKeyType.ENTITY_FIELD, key: "type" },
        { type: EntityKeyType.ENTITY_FIELD, key: "additionalInfo" },
        ...OWNER_ENTITY_FIELDS,
      ],
      latestValues: DEVICE_PLACE_KEYS.map((key) => ({ type: EntityKeyType.SERVER_ATTRIBUTE, key })),
      keyFilters: [],
    });
    // The Sites, then the devices one of them holds itself — one query from all of them.
    const siteHeld$ = all({
      entityFilter: { type: AliasFilterType.assetType, assetTypes: [this.org.settings.siteAssetType] } as EntityFilter,
      entityFields: [{ type: EntityKeyType.ENTITY_FIELD, key: "name" }],
      keyFilters: [],
    }).pipe(
      switchMap((sites) => {
        const siteIds = sites.map((r) => String(r.entityId.id));
        if (!siteIds.length) {
          return of({ siteIds, held: [] as any[] });
        }
        const held$ = all({
          entityFilter: {
            type: AliasFilterType.relationsQuery,
            rootEntity: { entityType: EntityType.ASSET, id: siteIds[0] },
            multiRoot: true,
            multiRootEntitiesType: EntityType.ASSET,
            multiRootEntityIds: siteIds,
            direction: EntitySearchDirection.FROM,
            maxLevel: 1,
            fetchLastLevelOnly: false,
            filters: [{ relationType: SITE_DEVICE_RELATION, entityTypes: [EntityType.DEVICE] }],
          } as EntityFilter,
          entityFields: [{ type: EntityKeyType.ENTITY_FIELD, key: "name" }],
          keyFilters: [],
        });
        return held$.pipe(map((held) => ({ siteIds, held })));
      })
    );
    forkJoin({ rows: devices$, mobile: loadMobileProfiles(this.ctx), sites: siteHeld$ })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ rows, mobile, sites }) => {
          const vehicleProfiles = new Set(mobile);
          const held = new Set(sites.held.map((r) => String(r.entityId.id)));
          this.healthSiteIds = new Set(sites.siteIds);
          this.healthDevices = rows.map((d) => {
            const a = d.latest?.[EntityKeyType.SERVER_ATTRIBUTE] ?? {};
            const f = d.latest?.[EntityKeyType.ENTITY_FIELD] ?? {};
            const attrs = Object.fromEntries(DEVICE_PLACE_KEYS.map((k) => [k, a[k]?.value ?? ""]));
            const profile = String(f["type"]?.value ?? "");
            return {
              ...devicePlaceOf(attrs, f["additionalInfo"]?.value),
              id: d.entityId.id,
              name: String(f["name"]?.value ?? ""),
              profile,
              owner: ownerCustomer(f),
              vehicle: vehicleProfiles.has(profile),
              inSite: held.has(String(d.entityId.id)),
            };
          });
          this.changed();
        },
        error: () => {
          // Unreadable (a user without the devices): the device checks stay out.
          this.healthDevicesAsked = false;
        },
      });
  }

  /**
   * A Health fix that changes relations, asked: its confirmation (heading, message, button) and what it runs once confirmed — the
   * devices to change, each one's step (a few at a time, one failing leaving the rest), and its toast's words; null: not asked.
   */
  healthFixConfirm: {
    heading: string;
    message: string;
    confirmLabel: string;
    items: { id: string; name: string }[];
    step: (item: { id: string; name: string }) => Observable<unknown>;
    /** What's now true of each changed one ("follows the gateway serving it"): the toast's words. */
    done: string;
  } | null = null;

  /** The asked fix, confirmed: its step for each device (one at a time), then the devices read again — the checks follow. */
  confirmHealthFix(): void {
    const fix = this.healthFixConfirm;
    this.healthFixConfirm = null;
    if (!fix || !fix.items.length) {
      return;
    }
    this.saving = true;
    let failed = 0;
    from(fix.items)
      .pipe(
        concatMap((i) =>
          fix.step(i).pipe(
            catchError(() => {
              failed++;
              return of(null);
            })
          )
        ),
        toArray(),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => {
        this.saving = false;
        const done = fix.items.length - failed;
        const noun = (n: number) => `${n} ${n === 1 ? "device" : "devices"}`;
        if (failed) {
          this.notices.error(`${noun(done)} of ${fix.items.length} changed; ${failed} couldn't be.`);
        } else {
          this.notices.success(`${noun(done)}: ${fix.done}`);
        }
        this.loadHealthDevices(true);
        this.changed();
      });
  }

  /** The check whose items show in the panel (its id; null: closed). */
  healthOpenId: string | null = null;
  private healthCache?: { key: unknown[]; checks: AccessHealthCheck[] };

  /** The open check, as it now is (null: closed, or gone). */
  get healthOpen(): AccessHealthCheck | null {
    return this.healthOpenId ? (this.health.find((c) => c.id === this.healthOpenId) ?? null) : null;
  }

  openHealth(check: AccessHealthCheck): void {
    this.enter(this.healthStop(check.id));
    this.healthOpenId = check.id;
  }

  closeHealth(): void {
    this.healthOpenId = null;
  }

  /** An item of the open check: the check's panel closes, the item's opens. */
  openHealthItem(item: AccessHealthItem): void {
    if (item.open) {
      // The item's panel takes the check's place (the check stays on the panels' trail).
      item.open();
    }
  }

  /**
   * The checks (Access › Health), each with the items failing it — worked
   * out from what's loaded (the groups, users, roles, Organization and
   * applications), again only when one of them changes; none until they're in.
   */
  get health(): AccessHealthCheck[] {
    if (!this.loaded || !this.ready) {
      // One array, the same every read: a fresh [] would be "new checks" on every pass, the Health table re-rendering — and
      // re-measuring — without end, freezing the page before the data that ends it can arrive.
      return NO_HEALTH_CHECKS;
    }
    const o = this.org;
    const key = [this.groups, this.users, this.roles, o.productLines.rows, o.markets.rows, o.sites.rows, this.apps.applications, this.apps.sites, this.healthDevices];
    if (this.healthCache && key.every((k, i) => k === this.healthCache!.key[i])) {
      return this.healthCache.checks;
    }
    const sites = o.sites.rows;
    const lines = o.productLines.rows;
    const itemIds = new Set([...lines, ...o.markets.rows, ...sites].map((a) => a.id));
    const group = (g: AccessGroup): AccessHealthItem => ({ id: g.id, name: g.name, open: () => this.openEditGroup(g) });
    const user = (u: AccessUser): AccessHealthItem => ({ id: u.id, name: accessUserName(u), open: () => this.openUser(u) });
    const site = (a: AssetRow): AccessHealthItem => ({ id: a.id, name: a.label || a.name, open: () => o.openEdit("site", a) });
    const codeOf = this.codeOf();
    const nameOf = this.nameOf();
    const defaults = this.groups.filter((g) => g.auto);
    const unused = this.roles.flatMap((r) => {
      const u = this.roleUnused(r);
      return [...u.kept, ...u.empty];
    });
    const defaultsOf = (u: AccessUser) => defaults.filter((g) => u.groupIds.includes(g.id));
    const siteRelation = !!this.apps.settings.siteRelation;
    const checks: AccessHealthCheck[] = [
      {
        id: "orphaned",
        itemsTitle: "Groups",
        itemsIcon: "groups",
        label: "Groups whose scope item is gone",
        severity: "error",
        items: this.groups.filter((g) => scopeItems(g.scope).some((id) => !itemIds.has(id))).map(group),
      },
      { id: "removedRole", itemsTitle: "Groups", itemsIcon: "groups", label: "Groups of a removed role", severity: "error", items: this.groups.filter((g) => !this.roleOf(g.level)).map(group) },
      {
        // A user's default groups are of one role (their form's): several — groups joined another way.
        id: "severalRoles",
        itemsTitle: "Users",
        itemsIcon: "person",
        label: "Users with more than one role",
        severity: "warning",
        items: this.users.filter((u) => !u.tenant && new Set(defaultsOf(u).map((g) => g.level)).size > 1).map(user),
      },
      {
        id: "notSynced",
        itemsTitle: "Groups",
        itemsIcon: "groups",
        label: "Groups not synced yet",
        severity: "warning",
        items: this.groups.filter((g) => !g.blocks.devices).map(group),
        fix: { label: "Sync all", run: () => this.syncAll() },
      },
      {
        id: "missingDefaults",
        itemsTitle: "Groups",
        itemsIcon: "groups",
        label: "Default groups to add",
        severity: "warning",
        items: this.missingDefaults.map((d, i) => ({
          id: `missing-${i}`,
          name: defaultGroupName(
            d.scope,
            this.roleOf(d.level)?.plural ?? d.level,
            (id) => codeOf(id) || "—",
            (id) => nameOf(id) || "—"
          ),
        })),
        fix: { label: "Add default groups", run: () => this.askAddDefaults() },
      },
      { id: "unusedDefaults", itemsTitle: "Groups", itemsIcon: "groups", label: "Default groups no role applies to", severity: "warning", items: unused.map(group) },
      { id: "noScope", itemsTitle: "Users", itemsIcon: "person", label: "Users without a scope", severity: "warning", items: this.users.filter((u) => !u.tenant && !u.scope).map(user) },
      { id: "noAccess", itemsTitle: "Users", itemsIcon: "person", label: "Users in no group", severity: "warning", items: this.users.filter((u) => !u.tenant && !u.groupIds.length).map(user) },
      {
        id: "siteLinks",
        itemsTitle: "Sites",
        itemsIcon: "factory",
        label: "Sites without a market or product line",
        severity: "warning",
        items: sites.filter((s) => s.links !== undefined && (!s.marketId || !s.productLineId)).map(site),
      },
      ...(siteRelation
        ? [
            {
              id: "appsNowhere",
              itemsTitle: "Applications",
              itemsIcon: "apps",
              label: "Applications that run nowhere",
              severity: "info" as const,
              items: this.apps.applications
                .filter((a) => !(this.apps.sites.get(a.id) ?? []).length)
                .map((a): AccessHealthItem => ({ id: a.id, name: a.label || a.name, open: () => this.apps.openEdit(a) })),
            },
          ]
        : []),
    ];
    // The devices' names against where they are, and their gateways (once the devices are read).
    const devices = this.healthDevices;
    if (devices) {
      // The sites by code (a Site's name is its code): a code read as the site's label with it ("STAR (3D21)"), else as it is.
      const siteByCode = new Map(sites.map((x) => [x.name.toLowerCase(), x]));
      const siteText = (code: string) => {
        const s = siteByCode.get(code.toLowerCase());
        return s ? siteLocationLabel({ id: s.id, name: s.label || s.name, code: s.name }) : code;
      };
      const byId = new Map(devices.map((d) => [d.id, d]));
      const byName = new Map(devices.map((d) => [d.name.toLowerCase(), d]));
      const nameOf = (id: string) => byId.get(id)?.name ?? "a gateway";
      // Held to their names: a device a gateway created is named by the gateway's config and goes where the gateway is (the gateway's
      // what to fix); a test device's name names no site of the Organization.
      const named = devices.filter((d) => !d.created && !isTestName(d));
      // A device item: its own detail (short — the panel is narrow), and what it shares with others of the check (the list groups by it).
      const item = (d: (typeof devices)[number], details: string[], group = ""): AccessHealthItem => ({
        id: d.id,
        name: d.name,
        details,
        group,
        device: { id: d.id, name: d.name, profile: d.profile, site: d.site, owner: d.owner },
      });
      // A created device connected through another gateway than the one that created it (a replacement: ThingsBoard doesn't remake the
      // Created relation) — it still goes where its old one is.
      const otherGateway = devices.filter((d) => d.created && !!d.gateway && !!d.lastGatewayId && d.lastGatewayId !== d.id && byId.has(d.lastGatewayId) && nameOf(d.lastGatewayId).toLowerCase() !== d.gateway.toLowerCase());
      // A device a gateway created that a Site links to as well (linked before the chain left created devices to their gateway).
      const placedTwice = devices.filter((d) => d.created && d.inSite);
      // A gateway named for a vehicle that another gateway serves, or that serves (created) another vehicle.
      const vehiclesOf = (gateway: string) => devices.filter((v) => v.vehicle && v.gateway.toLowerCase() === gateway.toLowerCase());
      const misnamedGateways = named.flatMap((d) => {
        if (!d.nameAsset) {
          return [];
        }
        const serves = vehiclesOf(d.name).find((v) => v.name.toLowerCase() !== d.nameAsset.toLowerCase());
        if (serves) {
          return [item(d, [`named ${d.nameAsset}`], `serves ${serves.name}`)];
        }
        const vehicle = byName.get(d.nameAsset.toLowerCase());
        return vehicle && vehicle.lastGatewayId && vehicle.lastGatewayId !== d.id ? [item(d, [`named ${d.nameAsset}`], `served by ${nameOf(vehicle.lastGatewayId)}`)] : [];
      });
      checks.push(
        {
          // Only a name whose code is a site's: one that isn't a site's is the next check's.
          id: "deviceOtherSite",
          itemsTitle: "Devices",
          itemsIcon: "sensors",
          label: "Devices at another site than their name says",
          severity: "warning",
          items: named
            .filter((d) => !!d.nameSite && siteByCode.has(d.nameSite.toLowerCase()) && !!d.site && d.site.toLowerCase() !== d.nameSite.toLowerCase())
            .map((d) => item(d, [`named ${d.nameSite}`], `at ${siteText(d.site)}`)),
        },
        {
          // A code that's neither a Site's nor a vehicle's (the chain keeps a vehicle's as nameAsset) — a vehicle not made yet too.
          id: "deviceUnknownSite",
          itemsTitle: "Devices",
          itemsIcon: "sensors",
          label: "Devices named for a place that isn't one",
          severity: "warning",
          items: named
            .filter((d) => !!d.nameSite && !siteByCode.has(d.nameSite.toLowerCase()))
            .map((d) => item(d, [`named ${d.nameSite}`], d.site ? `at ${siteText(d.site)}` : "No site")),
        },
        {
          id: "gatewayOtherVehicle",
          itemsTitle: "Gateways",
          itemsIcon: "router",
          label: "Gateways named for a vehicle they don't serve",
          severity: "warning",
          items: misnamedGateways,
        },
        {
          id: "deviceOtherGateway",
          itemsTitle: "Devices",
          itemsIcon: "sensors",
          label: "Devices following another gateway than the one serving them",
          severity: "warning",
          items: otherGateway.map((d) => item(d, [`follows ${d.gateway}`], `served by ${nameOf(d.lastGatewayId)}`)),
          ...(otherGateway.length
            ? {
                fix: {
                  label: "Link to their gateway",
                  run: () => {
                    const n = otherGateway.length;
                    this.healthFixConfirm = {
                      heading: "Link to their gateway?",
                      message: `${n === 1 ? "The device follows" : `${n} devices follow`} the gateway serving ${n === 1 ? "it" : "them"} from now on — ${
                        n === 1 ? "its" : "their"
                      } site with it.`,
                      confirmLabel: "Link",
                      items: otherGateway.map((d) => ({ id: d.id, name: d.name })),
                      step: (i) => {
                        const d = byId.get(i.id)!;
                        return relinkGateway(this.ctx, d.id, byName.get(d.gateway.toLowerCase())?.id ?? null, d.lastGatewayId);
                      },
                      done: "they follow the gateway serving them",
                    };
                  },
                },
              }
            : {}),
        },
        {
          // A device its gateway created that a Site also links to itself: it gets its site from both — they agree only until the
          // gateway moves, then the device is at two sites.
          id: "devicePlacedTwice",
          itemsTitle: "Devices",
          itemsIcon: "sensors",
          label: "Devices linked to both a site and a gateway",
          severity: "warning",
          items: placedTwice.map((d) => item(d, [], [d.gateway || "Its gateway", d.site ? siteText(d.site) : ""].filter(Boolean).join(" · "))),
          ...(placedTwice.length
            ? {
                fix: {
                  label: "Unlink from their site",
                  run: () => {
                    const n = placedTwice.length;
                    this.healthFixConfirm = {
                      heading: "Unlink from their site?",
                      message: `${n === 1 ? "The device leaves" : `${n} devices leave`} the site that holds ${n === 1 ? "it" : "them"} and ${
                        n === 1 ? "goes" : "go"
                      } where ${n === 1 ? "its" : "their"} gateway is from now on.`,
                      confirmLabel: "Unlink",
                      items: placedTwice.map((d) => ({ id: d.id, name: d.name })),
                      step: (i) => placeDevice(this.ctx, i.id, null, this.healthSiteIds),
                      done: "they go where their gateway is",
                    };
                  },
                },
              }
            : {}),
        },
        {
          // A vehicle no gateway of its own created (served by a shared one, or not at all): it doesn't follow a gateway's site.
          id: "vehicleNoGateway",
          itemsTitle: "Vehicles",
          itemsIcon: "local_shipping",
          label: "Vehicles without their own gateway",
          severity: "info",
          items: devices
            .filter((d) => d.vehicle && !d.created)
            .map((d) => item(d, [], d.lastGatewayId && d.lastGatewayId !== d.id ? `served by ${nameOf(d.lastGatewayId)}` : "No gateway")),
        },
        {
          // Neither its name nor its deviceName read as <line>-<place>-<type>-<number> (a vehicle and a created device: their gateway's names).
          id: "deviceOffConvention",
          itemsTitle: "Devices",
          itemsIcon: "sensors",
          label: "Devices named off the convention",
          severity: "info",
          items: devices.filter((d) => !d.created && !d.vehicle && !d.nameLine).map((d) => item(d, [], d.profile)),
        },
        {
          id: "deviceNoPlace",
          itemsTitle: "Devices",
          itemsIcon: "sensors",
          label: "Devices with no site or market",
          severity: "warning",
          items: devices.filter((d) => !d.site && !d.market).map((d) => item(d, [], d.profile)),
        }
      );
    }
    this.healthCache = { key, checks };
    return checks;
  }

  // -- the role panel (Access › Roles) -------------------------------------------------------------

  /** A role being saved, waiting on its confirmation: the default groups it no longer applies to go (empty ones). */
  roleApplyConfirm: { draft: AccessRoleDraft; empty: AccessGroup[]; kept: AccessGroup[] } | null = null;
  /** A role's apply under way (its groups made, deleted, renamed, synced): done of all; null when none is. */
  roleProgress: { done: number; total: number } | null = null;

  get selectedRoleId(): string | null {
    return this.rolePanelOpen && this.editingRole ? this.editingRole.id : null;
  }

  openAddRole(): void {
    this.openRole(null);
  }

  openEditRole(r: AccessRole): void {
    this.openRole(r);
  }

  closeRolePanel(): void {
    this.rolePanelOpen = false;
  }

  private openRole(r: AccessRole | null, tab = "role"): void {
    this.enter(r ? this.roleStop(r.id) : null);
    this.rolePanelTab = tab;
    this.editingRole = r;
    this.roleResetKey++;
    this.rolePanelOpen = true;
  }

  /** The other roles' names and group names (each is unique). */
  get otherRoleNames(): string[] {
    return this.roles.filter((r) => r.id !== this.editingRole?.id).flatMap((r) => [r.label, r.plural]);
  }

  /** A role's groups (default and hand-made). */
  roleGroups(role: AccessRole): AccessGroup[] {
    return this.groups.filter((g) => g.level === role.id);
  }

  /**
   * What keeps a role from being deleted: a group of it with members, a
   * hand-made group of it, a user with it as their own — "" when none does
   * (its default groups, all empty, go with it), or it's the last role.
   */
  roleInUse(role: AccessRole): string {
    if (this.roles.length <= 1) {
      return "The last role can't be deleted.";
    }
    const groups = this.roleGroups(role).filter((g) => !g.auto || g.members.length > 0).length;
    const users = this.users.filter((u) => u.level === role.id).length;
    const parts = [groups ? `${groups} ${groups === 1 ? "group" : "groups"}` : "", users ? `${users} ${users === 1 ? "user" : "users"}` : ""].filter(Boolean);
    return parts.length ? `In use by ${parts.join(" and ")} — move them to another role first.` : "";
  }

  /**
   * The role form's Save: a role whose scope leaves default groups behind
   * asks first (the empty ones go); then {@link saveRole}.
   */
  submitRole(draft: AccessRoleDraft): void {
    if (this.editingRole?.default) {
      this.notices.error("A default role can't be changed.");
      return;
    }
    if (!this.ready || !this.loaded) {
      this.notices.error("The Organization is still loading — save once it's in.");
      return;
    }
    const before = this.editingRole;
    const unused = before ? this.roleUnused(before, (r) => ({ ...r, appliesTo: draft.appliesTo })) : { empty: [], kept: [] };
    if (unused.empty.length) {
      this.roleApplyConfirm = { draft, ...unused };
      return;
    }
    this.saveRole(draft);
  }

  get roleApplyMessage(): string {
    const c = this.roleApplyConfirm;
    if (!c) {
      return "";
    }
    const n = c.empty.length;
    const kept = c.kept.length ? ` ${c.kept.length} with members ${c.kept.length === 1 ? "stays" : "stay"} until ${c.kept.length === 1 ? "its" : "their"} members move.` : "";
    return `The role no longer applies to ${n + c.kept.length} ${n + c.kept.length === 1 ? "item" : "items"}: ${n} empty default ${n === 1 ? "group" : "groups"} will be deleted.${kept}`;
  }

  confirmRoleApply(): void {
    const c = this.roleApplyConfirm;
    this.roleApplyConfirm = null;
    if (c) {
      this.saveRole(c.draft);
    }
  }

  /**
   * A role saved (the roles, on the access owner) and applied to the
   * Organization: its default groups made where it now applies, the empty
   * ones where it no longer does deleted (the others stay), renamed after
   * its new name, and — its access changed — its groups synced.
   */
  private saveRole(draft: AccessRoleDraft): void {
    const before = this.editingRole;
    const role: AccessRole = before ? { ...before, ...draft } : { ...draft, id: newRoleId(draft.label, this.roles), default: false, createdTime: Date.now() };
    const roles = before ? this.roles.map((r) => (r.id === before.id ? role : r)) : [...this.roles, role];
    this.saving = true;
    this.changed();
    this.saveRoles(roles)
      .pipe(
        switchMap(() => {
          this.roles = roles;
          this.editingRole = role;
          this.roleResetKey++;
          return this.applyRole(role, before);
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (r) => {
          this.saving = false;
          this.roleProgress = null;
          const parts = [
            r.made ? `${r.made} ${r.made === 1 ? "group" : "groups"} made` : "",
            r.deleted ? `${r.deleted} deleted` : "",
            r.synced ? `${r.synced} synced` : "",
            r.kept ? `${r.kept} kept (members)` : "",
          ].filter(Boolean);
          const text = `Role ${role.label} ${before ? "saved" : "created"}${parts.length ? ` — ${parts.join(", ")}` : ""}`;
          if (r.failed) {
            console.warn(`[access] Role ${role.label} — ${r.failed} failed steps:\n${this.syncFailures.join("\n")}`);
            this.notices.error(`${text} — ${r.failed} step${r.failed === 1 ? "" : "s"} failed. (All in the browser console.)`);
          } else {
            this.notices.success(text);
          }
          this.loadGroups();
        },
        error: (err) => {
          this.roleProgress = null;
          this.failed(err, "Couldn't save the role");
        },
      });
  }

  /** The roles saved on the access owner (`accessRoles`: the Access Lifecycle rule chain reads them for a new item's default groups). */
  private saveRoles(roles: AccessRole[]): Observable<unknown> {
    return this.post(`/api/plugins/telemetry/CUSTOMER/${this.ownerId}/attributes/SERVER_SCOPE`, { [ROLES_KEY]: roles });
  }

  /** {@link saveRole}'s groups: made, deleted, renamed and synced — counted (failed steps named, see {@link noteFailure}). */
  private applyRole(role: AccessRole, before: AccessRole | null): Observable<{ made: number; deleted: number; synced: number; kept: number; failed: number }> {
    this.syncFailures = [];
    const groups = [...this.groups];
    const missing = this.roleMissing(role, groups);
    const { empty, kept } = this.roleUnused(role);
    const gone = new Set(empty.map((g) => g.id));
    const renamed = !!before && (before.plural !== role.plural || before.label !== role.label);
    const accessChanged = !!before && JSON.stringify([...before.actions].sort()) !== JSON.stringify([...role.actions].sort());
    // Its groups that stay: renamed (a default one, after the role's new name) and synced (its access, or its blocks' names, changed).
    const staying = this.roleGroups(role).filter((g) => !gone.has(g.id));
    const toSync = renamed || accessChanged ? staying : [];
    this.roleProgress = { done: 0, total: missing.length + empty.length + toSync.length };
    this.changed();
    const step = () => {
      if (this.roleProgress) {
        this.roleProgress = { ...this.roleProgress, done: this.roleProgress.done + 1 };
        this.changed();
      }
    };
    const codeOf = this.codeOf();
    const nameOf = this.nameOf();
    const sync$ = (g: AccessGroup) =>
      (renamed && g.auto ? this.renameDefaultGroup(g, role, codeOf, nameOf) : of(g)).pipe(
        switchMap((named) => this.syncSteps(named)),
        map((r) => r.failed),
        catchError((err) => {
          this.noteFailure(`${g.name} · sync`, err);
          return of(1);
        }),
        tap(step)
      );
    const made$ = from(missing).pipe(
      mergeMap(
        (d) =>
          this.groupFor(d.scope, d.level, groups).pipe(
            map((r) => (r.made ? 1 : 0)),
            catchError((err) => {
              this.noteFailure(`${role.label} · default group`, err);
              return of(-1);
            }),
            tap(step)
          ),
        BATCH_PARALLEL
      ),
      toArray()
    );
    this.deleting = empty.length ? { done: 0, total: empty.length } : null;
    return this.batched(() =>
      made$.pipe(
        switchMap((made) =>
          (empty.length ? this.deleteGroupList(empty) : of(0)).pipe(
            tap(() => {
              this.deleting = null;
              empty.forEach(step);
            }),
            map((deleted) => ({ made, deleted }))
          )
        ),
        switchMap(({ made, deleted }) =>
          from(toSync).pipe(
            mergeMap(sync$, BATCH_PARALLEL),
            toArray(),
            map((failures) => ({ made, deleted, failures }))
          )
        ),
        map(({ made, deleted, failures }) => ({
          made: made.filter((m) => m === 1).length,
          deleted,
          synced: toSync.length,
          kept: kept.length,
          failed: made.filter((m) => m < 0).length + (empty.length - deleted) + failures.reduce((n, f) => n + f, 0),
        }))
      )
    );
  }

  /** A default group renamed after its role's new name (and its description after its label); the group as renamed. */
  private renameDefaultGroup(g: AccessGroup, role: AccessRole, codeOf: (id: string | null) => string, nameOf: (id: string | null) => string): Observable<AccessGroup> {
    const name = defaultGroupName(
      g.scope,
      role.plural,
      (id) => codeOf(id) || "—",
      (id) => nameOf(id) || "—"
    );
    const description = `${scopeLabel(g.scope, (id) => nameOf(id) || "—")}: its default ${role.label.toLowerCase()} group.`;
    if (name === g.name && description === g.description) {
      return of(g);
    }
    return this.get<any>(`/api/entityGroup/${g.id}`).pipe(
      switchMap((ug) => this.post<any>("/api/entityGroup", { ...ug, name, additionalInfo: { ...(ug.additionalInfo ?? {}), description } })),
      map(() => ({ ...g, name, description }))
    );
  }

  /** "Delete role": confirmed first — only one nothing uses ({@link roleInUse}). */
  askDeleteRole(role: AccessRole): void {
    const blocked = role.default ? "A default role can't be deleted." : this.roleInUse(role);
    if (blocked) {
      this.notices.error(blocked);
      return;
    }
    this.deleteRoleConfirm = role;
  }

  get deleteRoleMessage(): string {
    const r = this.deleteRoleConfirm;
    if (!r) {
      return "";
    }
    const n = this.roleGroups(r).length;
    return `Role ${r.label} will be deleted${n ? `, with its ${n} empty default ${n === 1 ? "group" : "groups"}` : ""}.`;
  }

  /** The role's (empty) default groups deleted, then the role itself from the list. */
  confirmDeleteRole(): void {
    const role = this.deleteRoleConfirm;
    this.deleteRoleConfirm = null;
    if (!role || role.default || this.roleInUse(role)) {
      return;
    }
    const groups = this.roleGroups(role);
    const roles = this.roles.filter((r) => r.id !== role.id);
    this.saving = true;
    this.deleting = groups.length ? { done: 0, total: groups.length } : null;
    this.changed();
    (groups.length ? this.deleteGroupList(groups) : of(0))
      .pipe(
        switchMap((deleted) => this.saveRoles(roles).pipe(map(() => deleted))),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (deleted) => {
          this.saving = false;
          this.deleting = null;
          this.roles = roles;
          this.rolePanelOpen = false;
          this.notices.success(`Role ${role.label} deleted${deleted ? ` — ${deleted} ${deleted === 1 ? "group" : "groups"} with it` : ""}`);
          this.loadGroups();
        },
        error: (err) => {
          this.deleting = null;
          this.failed(err, "Couldn't delete the role");
        },
      });
  }

  // -- the user panels ---------------------------------------------------------------------------

  get userTabs(): SegmentOption[] {
    return USER_TABS;
  }

  get addUserTabs(): SegmentOption[] {
    return ADD_USER_TABS;
  }

  get selectedUserId(): string | null {
    return this.userPanelOpen && this.editingUser ? this.editingUser.id : null;
  }

  openUser(u: AccessUser): void {
    this.enter(this.userStop(u.id));
    this.editingUser = u;
    this.userResetKey++;
    this.userPanelOpen = true;
  }

  openAddUser(): void {
    this.enter(null);
    this.addUserResetKey++;
    this.addUserOpen = true;
  }

  closeUserPanels(): void {
    this.userPanelOpen = false;
    this.addUserOpen = false;
  }

  /**
   * A user's details applied: the name and email (read-modify-write), the
   * groups joined / left; their home the default home ({@link applyHomes}).
   * Other plants or another role: the default groups they become
   * ({@link picksGroups} — made where missing) against the default groups
   * they're in now (any role) — the new ones joined, the rest left (their
   * hand-made groups are the form's picks) — and their scope and level saved.
   */
  submitUser(
    user: AccessUser,
    v: {
      email: string;
      firstName: string;
      lastName: string;
      /** The hand-made groups picked and the default groups they're in now. */
      groupIds: string[];
      /** The plants they have access to. */
      plantIds: string[];
      level: AccessLevel;
      accessChanged?: boolean;
      /** The Tenant scope picked: a tenant-level user (one of the owner's picking it — or a Tenant scope user leaving it — moves). */
      tenant?: boolean;
      /** A Tenant scope user's role: the tenant user group picked. */
      tenantRole?: string;
    }
  ): void {
    if (!!v.tenant !== user.tenant) {
      this.moveUser(user, v);
      return;
    }
    if (user.tenant) {
      this.applyTenantUser(user, v);
      return;
    }
    if (!v.accessChanged) {
      this.applyUser(user, v, v.groupIds, null);
      return;
    }
    if (!this.ready) {
      this.notices.error("The Organization is still loading — apply once it's in.");
      return;
    }
    if (!v.plantIds.length) {
      this.notices.error("Pick the plants the user has access to.");
      return;
    }
    this.saving = true;
    this.changed();
    this.picksGroups(v.plantIds, v.level)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ groups, scope }) => {
          // Their hand-made groups as picked; their default groups, the picks'.
          const handMade = v.groupIds.filter((id) => !this.groups.find((g) => g.id === id)?.auto);
          this.applyUser(user, v, [...new Set([...handMade, ...groups.map((g) => g.id)])], scope);
        },
        error: (err) => this.failed(err, "Couldn't make the default groups"),
      });
  }

  /**
   * The default groups a user's plants and role become ({@link plantPickScopes}: every plant, the region's; all of a
   * market's plants, the market's; each other plant, its own — the broadest the role applies to), found or made and
   * synced (`groupFor`, one at a time: a new one's name is checked against those made before it; the new ones join
   * {@link groups}) — and the scope their attributes keep ({@link scopeOfGroups}).
   */
  private picksGroups(plantIds: string[], level: AccessLevel): Observable<{ groups: AccessGroup[]; scope: AccessScope }> {
    const scopes = plantPickScopes(plantIds, this.roleOf(level), this.org.sites.rows, this.org.markets.rows);
    const list = [...this.groups];
    return this.batched(() =>
      from(scopes).pipe(
        concatMap((scope) => this.groupFor(scope, level, list)),
        toArray()
      )
    ).pipe(
      map((found) => {
        const groups = found.map((f) => f.group);
        if (!groups.length) {
          throw new Error("none of the plants picked is in the Organization");
        }
        const known = new Set(this.groups.map((g) => g.id));
        const made = groups.filter((g) => !known.has(g.id));
        if (made.length) {
          this.groups = [...this.groups, ...made];
        }
        return { groups, scope: this.scopeOfGroups(groups, plantIds) };
      })
    );
  }

  /** Default groups in words, for a toast: the one's name, else how many. */
  private groupsText(groups: AccessGroup[]): string {
    return groups.length === 1 ? groups[0].name : `${groups.length} default groups`;
  }

  /** `scope`: their access changed — the scope and level to save (null: as they are). */
  private applyUser(
    user: AccessUser,
    v: { email: string; firstName: string; lastName: string; level: AccessLevel },
    groupIds: string[],
    scope: AccessScope | null
  ): void {
    const detailsChanged = v.email !== user.email || v.firstName !== user.firstName || v.lastName !== user.lastName;
    const add = groupIds.filter((id) => !user.groupIds.includes(id));
    const remove = user.groupIds.filter((id) => !groupIds.includes(id));
    const steps: Observable<unknown>[] = [];
    if (detailsChanged) {
      steps.push(
        this.get<any>(`/api/user/${user.id}`).pipe(
          switchMap((full) => this.post("/api/user", { ...full, email: v.email, firstName: v.firstName || null, lastName: v.lastName || null }))
        )
      );
    }
    if (scope) {
      steps.push(this.saveUserScope(user.id, scope, v.level));
    }
    steps.push(...add.map((gid) => this.post(`/api/entityGroup/${gid}/addEntities`, [user.id])));
    steps.push(...remove.map((gid) => this.post(`/api/entityGroup/${gid}/deleteEntities`, [user.id])));
    if (!steps.length) {
      this.saving = false;
      this.userResetKey++;
      this.changed();
      return;
    }
    this.saving = true;
    forkJoin(steps)
      .pipe(
        switchMap(() => {
          this.groups = this.groups.map((g) =>
            add.includes(g.id) ? { ...g, members: [...g.members, user.id] } : remove.includes(g.id) ? { ...g, members: g.members.filter((m) => m !== user.id) } : g
          );
          // (Their home: the default home, written if it isn't yet — after their details: one write each.)
          return this.applyHomes([user.id]);
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: () => {
          this.saving = false;
          this.notices.success("Changes applied");
          this.loadGroups();
        },
        error: (err) => this.failed(err, "Couldn't apply the changes"),
      });
  }

  /**
   * A new user of the owner: in the default groups their plants and role
   * become ({@link picksGroups} — made where missing), all at once (PE's
   * `entityGroupIds`, comma-separated), opening on the default home (Home,
   * full screen); their scope and level saved; then the activation link,
   * unless it was emailed. Other groups are added after.
   */
  addUser(v: {
    email: string;
    firstName: string;
    lastName: string;
    sendActivationMail: boolean;
    /** The plants they have access to. */
    plantIds: string[];
    level: AccessLevel;
    tenant?: boolean;
    tenantRole?: string;
  }): void {
    if (v.tenant) {
      this.addTenantUser(v);
      return;
    }
    if (this.saving || !this.ownerId) {
      return;
    }
    if (!this.ready) {
      this.notices.error("The Organization is still loading — create the user once it's in.");
      return;
    }
    if (!v.plantIds.length) {
      this.notices.error("Pick the plants the user has access to.");
      return;
    }
    this.saving = true;
    this.changed();
    let joined = "";
    this.picksGroups(v.plantIds, v.level)
      .pipe(
        switchMap(({ groups, scope }) => this.defaultHome().pipe(map((home) => ({ groups, scope, home })))),
        switchMap(({ groups, scope, home }) => {
          joined = this.groupsText(groups);
          const body = {
            email: v.email,
            firstName: v.firstName || undefined,
            lastName: v.lastName || undefined,
            authority: "CUSTOMER_USER",
            tenantId: { entityType: "TENANT", id: this.ctx.currentUser?.tenantId },
            customerId: { entityType: "CUSTOMER", id: this.ownerId },
            additionalInfo: home ? homeInfo(null, home) : {},
          };
          const params: Record<string, string> = {
            sendActivationMail: v.sendActivationMail ? "true" : "false",
            entityGroupIds: groups.map((g) => g.id).join(","),
          };
          return this.post<{ id: TbId; email: string }>("/api/user", body, params).pipe(map((user) => ({ user, scope })));
        }),
        // Their scope and level (server attributes) as soon as they exist.
        switchMap(({ user, scope }) => this.saveUserScope(user.id.id, scope, v.level).pipe(map(() => user))),
        switchMap((user) =>
          v.sendActivationMail
            ? of({ user, dialog: null as { link: string; ttl: string } | null })
            : this.activationLink(user.id.id).pipe(
                map((dialog) => ({ user, dialog })),
                catchError(() => of({ user, dialog: null as { link: string; ttl: string } | null }))
              )
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: ({ user, dialog }) => {
          this.saving = false;
          this.notices.success(`${v.sendActivationMail ? `Activation email sent to ${user.email}` : `${user.email} added`} — in ${joined}`);
          this.addUserOpen = false;
          this.activationDialog = dialog;
          this.loadGroups();
        },
        error: (err) => this.failed(err, "Couldn't add the user"),
      });
  }

  /**
   * A Tenant scope user's details applied: the name and email (read-modify-write), their role — moved from their old
   * default tenant user group to the one picked — and their access groups (the tenant's other user groups) joined / left.
   */
  private applyTenantUser(user: AccessUser, v: { email: string; firstName: string; lastName: string; tenantRole?: string; groupIds: string[] }): void {
    const detailsChanged = v.email !== user.email || v.firstName !== user.firstName || v.lastName !== user.lastName;
    const was = this.tenantRoleOf(user);
    const role = v.tenantRole ?? was;
    const steps: Observable<unknown>[] = [];
    if (detailsChanged) {
      steps.push(
        this.get<any>(`/api/user/${user.id}`).pipe(
          switchMap((full) => this.post("/api/user", { ...full, email: v.email, firstName: v.firstName || null, lastName: v.lastName || null }))
        )
      );
    }
    if (role && role !== was) {
      // Into the new group first, so they're never in none.
      steps.push(
        this.post(`/api/entityGroup/${role}/addEntities`, [user.id]).pipe(
          switchMap(() => (was ? this.post(`/api/entityGroup/${was}/deleteEntities`, [user.id]) : of(null)))
        )
      );
    }
    const others = new Set(this.tenantGroupOptions.map((o) => o.id));
    const had = this.tenantAccessGroupsOf(user);
    const picked = v.groupIds.filter((id) => others.has(id));
    steps.push(...picked.filter((id) => !had.includes(id)).map((id) => this.post(`/api/entityGroup/${id}/addEntities`, [user.id])));
    steps.push(...had.filter((id) => !picked.includes(id)).map((id) => this.post(`/api/entityGroup/${id}/deleteEntities`, [user.id])));
    if (!steps.length) {
      this.userResetKey++;
      this.changed();
      return;
    }
    this.userAction(forkJoin(steps), "Changes applied", "Couldn't apply the changes", true);
  }

  /** A user the viewer may move between the owner and the tenant (their scope to or from Tenant): a tenant administrator's view, never their own. */
  canMoveUser(user: AccessUser | null): boolean {
    return !!user && this.manageTenant && !this.isSelf(user);
  }

  /**
   * A user moved between the access owner and the tenant (their scope to or from Tenant) — ThingsBoard's change of owner,
   * which takes them out of the old owner's groups, into the new side's: to the tenant, their tenant user group (their
   * role) and the tenant groups picked, their scope and level removed (no longer the owner's); to the owner, the default
   * groups their plants and role become ({@link picksGroups} — made where missing) and the groups picked, their scope and
   * level saved first, then their home — the default home ({@link applyHomes}). ThingsBoard sets the new side's authority
   * itself (a tenant administrator's, a customer user's — verified 2026-11-12); their record then takes their details.
   */
  private moveUser(
    user: AccessUser,
    v: {
      email: string;
      firstName: string;
      lastName: string;
      groupIds: string[];
      plantIds: string[];
      level: AccessLevel;
      tenant?: boolean;
      tenantRole?: string;
    }
  ): void {
    const tenantId = this.ctx.currentUser?.tenantId ?? "";
    const toTenant = !!v.tenant;
    if (this.saving) {
      return;
    }
    if (!this.canMoveUser(user) || !tenantId || !this.ownerId) {
      this.notices.error(this.isSelf(user) ? "You can't move your own account." : "Only a tenant administrator can move a user to or from the tenant.");
      return;
    }
    const role = toTenant ? this.tenantGroups.find((g) => g.role && g.id === v.tenantRole) : undefined;
    if (toTenant && !role) {
      this.notices.error("Pick the user's role.");
      return;
    }
    if (!toTenant && !this.ready) {
      this.notices.error("The Organization is still loading — apply once it's in.");
      return;
    }
    if (!toTenant && !v.plantIds.length) {
      this.notices.error("Pick the plants the user has access to.");
      return;
    }
    this.saving = true;
    this.changed();
    const tenantOthers = new Set(this.tenantGroupOptions.map((o) => o.id));
    const target: Observable<{ owner: string; groupIds: string[]; where: string }> = toTenant
      ? of({
          owner: `TENANT/${tenantId}`,
          groupIds: [role!.id, ...v.groupIds.filter((id) => tenantOthers.has(id))],
          where: role!.name,
        })
      : this.picksGroups(v.plantIds, v.level).pipe(
          switchMap(({ groups, scope }) => this.saveUserScope(user.id, scope, v.level).pipe(map(() => groups))),
          map((groups) => {
            const picked = v.groupIds.filter((id) => this.groups.some((g) => g.id === id && !g.auto));
            return { owner: `CUSTOMER/${this.ownerId}`, groupIds: [...new Set([...groups.map((g) => g.id), ...picked])], where: this.groupsText(groups) };
          })
        );
    let where = "";
    target
      .pipe(
        // ThingsBoard's change of owner, into the new side's groups.
        switchMap((t) => this.post(`/api/owner/${t.owner}/USER/${user.id}`, t.groupIds).pipe(map(() => t))),
        // Their record as moved: their details — a tenant-level user opening where ThingsBoard opens them (the
        // access's home taken off, as a new one's); one of the owner's, on the default home (written after).
        switchMap((t) =>
          this.get<any>(`/api/user/${user.id}`).pipe(
            switchMap((full) => {
              const info: Record<string, any> = { ...(full.additionalInfo ?? {}) };
              if (toTenant) {
                ACCESS_HOME_KEYS.forEach((k) => delete info[k]);
              }
              const write =
                full.email !== v.email ||
                (full.firstName ?? "") !== v.firstName ||
                (full.lastName ?? "") !== v.lastName ||
                JSON.stringify(info) !== JSON.stringify(full.additionalInfo ?? {});
              return write
                ? this.post("/api/user", { ...full, email: v.email, firstName: v.firstName || null, lastName: v.lastName || null, additionalInfo: info })
                : of(null);
            }),
            map(() => t)
          )
        ),
        switchMap((t) => {
          where = t.where;
          if (toTenant) {
            return this.clearUserScope(user.id);
          }
          // Their new groups; they land on the default home.
          this.groups = this.groups.map((g) => (t.groupIds.includes(g.id) && !g.members.includes(user.id) ? { ...g, members: [...g.members, user.id] } : g));
          return this.applyHomes([user.id]);
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: () => {
          this.saving = false;
          this.notices.success(`${accessUserName(user)} moved to ${toTenant ? "the tenant" : this.ownerTitle} — in ${where}`);
          this.loadUsers();
        },
        error: (err) => {
          this.failed(err, "Couldn't move the user");
          this.loadUsers(); // as far as it got
        },
      });
  }

  /** A user's scope and level removed (their server attributes — every key a scope is saved under): a tenant-level user has none. */
  private clearUserScope(userId: string): Observable<unknown> {
    const keys = [...Object.keys(scopeAttributes(EVERYTHING, () => "")), "level"];
    return this.ctx.attributeService.deleteEntityAttributes(
      { entityType: EntityType.USER, id: userId },
      AttributeScope.SERVER_SCOPE,
      keys.map((key) => ({ key, value: null })),
      QUIET_REQUEST
    );
  }

  /**
   * A new Tenant scope user: a tenant-level user of ThingsBoard in the tenant user group picked (their role — the
   * administrators' or the users'); then the activation link, unless it was emailed.
   */
  private addTenantUser(v: { email: string; firstName: string; lastName: string; sendActivationMail: boolean; tenantRole?: string }): void {
    const tenantId = this.ctx.currentUser?.tenantId;
    const role = this.tenantGroups.find((g) => g.id === v.tenantRole);
    if (this.saving || !tenantId || !this.manageTenant) {
      return;
    }
    if (!role) {
      this.notices.error("Pick the user's role.");
      return;
    }
    this.saving = true;
    this.changed();
    const body = {
      email: v.email,
      firstName: v.firstName || undefined,
      lastName: v.lastName || undefined,
      authority: "TENANT_ADMIN",
      tenantId: { entityType: "TENANT", id: tenantId },
      additionalInfo: {},
    };
    this.post<{ id: TbId; email: string }>("/api/user", body, { sendActivationMail: v.sendActivationMail ? "true" : "false", entityGroupIds: role.id })
      .pipe(
        switchMap((user) =>
          v.sendActivationMail
            ? of({ user, dialog: null as { link: string; ttl: string } | null })
            : this.activationLink(user.id.id).pipe(
                map((dialog) => ({ user, dialog })),
                catchError(() => of({ user, dialog: null as { link: string; ttl: string } | null }))
              )
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: ({ user, dialog }) => {
          this.saving = false;
          this.notices.success(`${v.sendActivationMail ? `Activation email sent to ${user.email}` : `${user.email} added`} — in ${role.name}`);
          this.addUserOpen = false;
          this.activationDialog = dialog;
          this.loadGroups();
        },
        error: (err) => this.failed(err, "Couldn't add the user"),
      });
  }

  /** The viewer's own account (their own can't be disabled, deleted or logged in as here). */
  isSelf(user: AccessUser): boolean {
    return user.id === this.ctx.currentUser?.userId;
  }

  setUserEnabled(user: AccessUser, enabled: boolean): void {
    if (!enabled && this.isSelf(user)) {
      this.notices.error("You can't disable your own account.");
      return;
    }
    this.userAction(
      this.post(`/api/user/${user.id}/userCredentialsEnabled`, null, { userCredentialsEnabled: String(enabled) }),
      enabled ? "Account enabled" : "Account disabled",
      enabled ? "Couldn't enable the account" : "Couldn't disable the account",
      true
    );
  }

  resendActivation(user: AccessUser): void {
    this.userAction(this.post("/api/user/sendActivationMail", null, { email: user.email }), `Activation email sent to ${user.email}`, "Couldn't send the activation email");
  }

  showActivationLink(user: AccessUser): void {
    this.saving = true;
    this.activationLink(user.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (dialog) => {
          this.saving = false;
          this.activationDialog = dialog;
          this.changed();
        },
        error: (err) => this.failed(err, "Couldn't get the activation link"),
      });
  }

  askDeleteUser(user: AccessUser): void {
    if (this.isSelf(user)) {
      this.notices.error("You can't delete your own account.");
      return;
    }
    this.deleteUserConfirm = user;
  }

  get deleteUserMessage(): string {
    const u = this.deleteUserConfirm;
    return u ? `${u.email} loses access to every app. The account and its history are removed from ThingsBoard.` : "";
  }

  confirmDeleteUser(): void {
    const user = this.deleteUserConfirm;
    this.deleteUserConfirm = null;
    if (!user) {
      return;
    }
    this.userAction(this.ctx.http.delete(`/api/user/${user.id}`, this.options()), `${user.email} deleted`, "Couldn't delete the user", true, () => {
      this.userPanelOpen = false;
    });
  }

  /**
   * The viewer may log in as this user: ThingsBoard's `IMPERSONATE` on users —
   * generic (a tenant administrator's `ALL`), or on one of the user's groups. A
   * customer user (a group's manager) usually may not. When the permissions
   * couldn't be read: a tenant administrator may.
   */
  canLoginAs(user: AccessUser): boolean {
    if (user.tenant || this.isSelf(user)) {
      return false; // ThingsBoard logs a tenant administrator in only as a customer's user (`loginAs` says so for a Tenant scope user)
    }
    const p = this.viewerPermissions;
    if (!p) {
      return this.ctx.currentUser?.authority === "TENANT_ADMIN";
    }
    const grants = (ops: string[] | undefined) => !!ops && (ops.includes("ALL") || ops.includes("IMPERSONATE"));
    return grants(p.generic["USER"]) || grants(p.generic["ALL"]) || user.groupIds.some((id) => grants(p.groups[id]?.operations));
  }

  /**
   * ThingsBoard's "Login as user": the user's session replaces this one. The
   * token is fetched quietly (ThingsBoard's own `loginAsUser` would also pop
   * its "Permission Denied" dialog over the toast), then handed to its auth
   * service as its own login-as does.
   */
  loginAs(user: AccessUser): void {
    if (user.tenant) {
      this.notices.error("ThingsBoard lets a tenant administrator log in only as a customer's user. A tenant user takes the system administrator.");
      return;
    }
    if (!user.enabled || !user.activated || this.saving || !this.canLoginAs(user)) {
      return;
    }
    this.saving = true;
    this.get<{ token: string; refreshToken: string }>(`/api/user/${user.id}/token`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (login) => {
          this.saving = false;
          this.ctx.authService.setUserFromJwtToken(login.token, login.refreshToken, true);
        },
        error: (err) => this.failed(err, `Couldn't log in as ${user.email}`),
      });
  }

  /** The viewer's own permissions, read once (a failure: null — see {@link canLoginAs}). */
  private loadViewerPermissions(): void {
    if (this.viewerPermissionsAsked) {
      return;
    }
    this.viewerPermissionsAsked = true;
    this.get<{ userPermissions?: { genericPermissions?: Record<string, string[]>; groupPermissions?: Record<string, { operations?: string[] }> } }>(
      "/api/permissions/allowedPermissions"
    )
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((allowed) => {
        const up = allowed?.userPermissions;
        this.viewerPermissions = up ? { generic: up.genericPermissions ?? {}, groups: up.groupPermissions ?? {} } : null;
        this.changed();
      });
  }

  private userAction(call: Observable<unknown>, ok: string, fail: string, reload = false, after?: () => void): void {
    this.saving = true;
    call.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.saving = false;
        this.notices.success(ok);
        after?.();
        if (reload) {
          this.loadUsers();
        }
        this.changed();
      },
      error: (err) => this.failed(err, fail),
    });
  }

  private failed(err: unknown, title: string): void {
    this.saving = false;
    this.notices.error(`${title}${apiMessage(err)}`);
    this.changed();
  }

  /** The activation link with its time to live ("23 hours 56 minutes"); the plain link when the info has none. */
  private activationLink(userId: string): Observable<{ link: string; ttl: string }> {
    return this.get<{ value: string; ttlMs: number }>(`/api/user/${userId}/activationLinkInfo`).pipe(
      map((info) => ({ link: info.value, ttl: info?.ttlMs ? formatTtl(info.ttlMs) : "" })),
      catchError(() => this.ctx.http.get(`/api/user/${userId}/activationLink`, { ...this.options(), responseType: "text" }).pipe(map((link) => ({ link, ttl: "" }))))
    );
  }

  // -- http -------------------------------------------------------------------------------------------

  private options(params?: Record<string, string>): { headers: any; params: any } {
    return defaultHttpOptionsFromConfig({ ...QUIET_REQUEST, queryParams: params });
  }

  private get<T>(url: string, params?: Record<string, string>): Observable<T> {
    return this.ctx.http.get<T>(url, this.options(params));
  }

  private post<T = unknown>(url: string, body: unknown, params?: Record<string, string>): Observable<T> {
    return this.ctx.http.post<T>(url, body, this.options(params));
  }

  /** Every page of a paged list. */
  private pages<T>(url: string, params: Record<string, string> = {}): Observable<T[]> {
    const page = (n: number): Observable<T[]> =>
      this.get<{ data: T[]; hasNext: boolean }>(url, { pageSize: "500", page: String(n), ...params }).pipe(
        switchMap((p) => (p?.hasNext ? page(n + 1).pipe(map((rest) => [...(p.data ?? []), ...rest])) : of(p?.data ?? [])))
      );
    return page(0);
  }
}

/** The Role filter's value for a Tenant scope user's role: the prefix, then the tenant user group's id. */
const TENANT_ROLE_FACET = "tenant:";

/** {@link AccessStore.facetOptions}: each filter box's options, counted. */
export interface AccessFacetOptions {
  levels: FilterListOption[];
  scopes: FilterListOption[];
  productLines: FilterListOption[];
  markets: FilterListOption[];
  /** Roles: the actions grid's rows (Devices, Assets, …). */
  actions: FilterListOption[];
}

/**
 * An entity for {@link AccessStore.joinCoveringGroups}: its type and profile
 * (for the record — a group takes every profile at its sites), the customer
 * that owns it, and the sites it applies at — each with its market and
 * product line (`scopeSites` picks among them).
 */
export interface CoveredEntity {
  id: string;
  entityType: EntityType;
  profile: string;
  ownerId: string;
  sites: AssetRow[];
}

/**
 * A role's permissions with those of `wanted` it lacks added — a group role's operations, a generic role's operations by
 * resource; what it has beyond them stays. null: it lacks none.
 */
function withPermissions(have: unknown, wanted: readonly string[] | Readonly<Record<string, readonly string[]>>): unknown | null {
  const union = (a: unknown, b: readonly string[]): { list: string[]; grew: boolean } => {
    const list = Array.isArray(a) ? (a as string[]).slice() : [];
    // "ALL" already covers every operation.
    const missing = list.includes("ALL") ? [] : b.filter((op) => !list.includes(op));
    return { list: [...list, ...missing], grew: missing.length > 0 };
  };
  if (Array.isArray(wanted)) {
    const { list, grew } = union(have, wanted);
    return grew ? list : null;
  }
  const out: Record<string, unknown> = have && typeof have === "object" && !Array.isArray(have) ? { ...(have as Record<string, unknown>) } : {};
  let grew = false;
  for (const [resource, ops] of Object.entries(wanted as Record<string, readonly string[]>)) {
    const merged = union(out[resource], ops);
    if (merged.grew) {
      out[resource] = merged.list;
      grew = true;
    }
  }
  return grew ? out : null;
}

/** Facet values pass a filter: each of `facets` picked (none: any) has one of the values — but `skip`. */
/** Each facet's picks (none: any) — an item covering every value of a facet ({@link ALL_FACET_VALUES}: a regional group's product
 *  lines and markets) passes any pick of it. */
function facetsPass(values: Record<AccessFacet, string[]>, filter: AccessFilter, facets: AccessFacet[], skip?: AccessFacet): boolean {
  return facets.every((k) => k === skip || !filter[k].length || values[k].some((v) => v === ALL_FACET_VALUES || filter[k].includes(v)));
}

/** How far a scope reaches from a site: site › gateway › created device …; from a market's own entity, one step less (truck › gateway › created device). */
const SCOPE_DEPTH = 4;

/** Access › Health before what it checks is in: no checks — one array, never a fresh one ({@link AccessStore.health}). */
const NO_HEALTH_CHECKS: AccessHealthCheck[] = [];

/**
 * The devices and assets reachable from `roots` along `relations` (from → to),
 * stepping only onto entities `canEnter` allows (so never into another site or
 * market) — the hierarchy's own assets (`structural`) not collected.
 */
function reachable(roots: string[], relations: EntityRelation[], canEnter: (id: string) => boolean, structural: Set<string>): { deviceIds: string[]; assetIds: string[] } {
  const next = new Map<string, EntityRelation[]>();
  relations.forEach((r) => {
    if (r.from?.id && r.to?.id) {
      next.set(r.from.id, [...(next.get(r.from.id) ?? []), r]);
    }
  });
  const seen = new Set<string>(roots);
  const devices = new Set<string>();
  const assets = new Set<string>();
  let frontier = [...roots];
  for (let depth = 0; depth < SCOPE_DEPTH && frontier.length; depth++) {
    const following: string[] = [];
    for (const id of frontier) {
      for (const r of next.get(id) ?? []) {
        const to = r.to;
        if (seen.has(to.id) || !canEnter(to.id) || (to.entityType !== EntityType.DEVICE && to.entityType !== EntityType.ASSET)) {
          continue;
        }
        seen.add(to.id);
        following.push(to.id);
        if (to.entityType === EntityType.DEVICE) {
          devices.add(to.id);
        } else if (!structural.has(to.id)) {
          assets.add(to.id);
        }
      }
    }
    frontier = following;
  }
  return { deviceIds: [...devices], assetIds: [...assets] };
}

/** Run the steps a few at a time, a failure not stopping the rest (each told to `onError`): how many failed. */
/** The keys of a user's additional info the access writes for where they open ({@link homeInfo}) — and older access's, {@link OLD_HOME_KEYS}. */
const ACCESS_HOME_KEYS = ["homeDashboardId", "homeDashboardHideToolbar", "defaultDashboardId", "defaultDashboardFullscreen", ...OLD_HOME_KEYS];

/** A user's additional info opening on `home` (the default home: full screen, its toolbar hidden) — an older "Opens on" dropped. */
function homeInfo(info: Record<string, any> | null | undefined, home: string): Record<string, any> {
  const next: Record<string, any> = {
    ...(info ?? {}),
    homeDashboardId: home,
    homeDashboardHideToolbar: true,
    defaultDashboardId: home,
    defaultDashboardFullscreen: true,
  };
  OLD_HOME_KEYS.forEach((k) => delete next[k]);
  return next;
}

function runSteps(steps: Observable<unknown>[], onError?: (err: unknown) => void): Observable<number> {
  if (!steps.length) {
    return of(0);
  }
  return from(steps).pipe(
    mergeMap(
      (step) =>
        step.pipe(
          map(() => 0),
          catchError((err) => {
            onError?.(err);
            return of(1);
          })
        ),
      4
    ),
    toArray(),
    map((results) => results.reduce((n, x) => n + x, 0))
  );
}

/** "23 hours 56 minutes 24 seconds". */
function formatTtl(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const parts: string[] = [];
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (days) {
    parts.push(`${days} day${days === 1 ? "" : "s"}`);
  }
  if (hours) {
    parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
  }
  if (minutes) {
    parts.push(`${minutes} minute${minutes === 1 ? "" : "s"}`);
  }
  parts.push(`${seconds} second${seconds === 1 ? "" : "s"}`);
  return parts.join(" ");
}

/** A new role's id: its name as a slug ("qc-technician"), unique among the roles (the groups and users name it). */
function newRoleId(label: string, roles: AccessRole[]): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "role";
  const taken = new Set(roles.map((r) => r.id));
  let id = base;
  for (let n = 2; taken.has(id); n++) {
    id = `${base}-${n}`;
  }
  return id;
}
