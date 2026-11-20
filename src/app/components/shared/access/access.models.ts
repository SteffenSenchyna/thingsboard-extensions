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

import { SectionNavItem } from "../section-nav/section-nav.component";
import { AssetKind, AssetRow, lineWithin } from "../organization/organization.models";
import type { DataTableColumn } from "../data-table/data-table.component";
import { CREATED_ON_COLUMN } from "../time-format";

/**
 * Access: who sees what, by sites alone — the Organization's hierarchy
 * (product line › market › site). An **access group** is a ThingsBoard user
 * group of the access owner ("WCAN") holding its definition — a scope, a
 * level and its other dashboards — in its additional info; syncing it
 * ({@link AccessStore.syncGroup}) keeps three entity groups (every device of
 * its scope's sites, its scope's assets with the Application assets of the
 * apps running there, those apps' dashboards and its own) and the group
 * permissions on them; the default home (Home) opens for every user of the
 * owner through one grant of its own. Applications grant nothing: an app runs
 * at a plant with a device of its device profiles. A user's access is the
 * groups they're in; every user lands on the default home (Home), whatever
 * their groups.
 *
 * A **role** (Access › Roles) is a template of access: what its members may
 * do (its actions) and the scope items it applies to. Each item a role
 * applies to —
 * regional, a product line, a market, a plant — has a **default group** of it
 * ("Richmond Lab · Viewers"): made with the item (the Access Lifecycle rule
 * chain, for a role applying to every item of its kind) or when the role is
 * applied, deleted with the item. A user is given a role and the plants they
 * have access to, and is in that role's default groups for them — the
 * region's when it's every plant, a market's when it's all of its plants,
 * else each plant's ({@link plantPickScopes}); a user can be in several
 * default groups. Other groups can be added after. Viewer, Operator and
 * Manager are the roles to start (kept by id).
 */

/** A group's (and a user's) role: its id among the roles ({@link AccessRole.id}). */
export type AccessLevel = string;

/** An action a role may take — `<what>.<view | edit | control>`. */
export type AccessAction = string;

/** A row of the roles' actions grid: what's reached, and its actions by column (null: no such action there). */
export interface AccessActionRow {
  key: string;
  label: string;
  view: AccessAction | null;
  edit: AccessAction | null;
  control: AccessAction | null;
}

/**
 * The actions a role can have — the forms' grid (`tb-access-level-actions`)
 * and what a group's sync grants (`setPermissions`): devices (read; edit
 * attributes and settings; send commands), assets (read; edit), dashboards
 * (open), alarms (read; acknowledge and clear) and the group's members (see;
 * add and remove). An edit or a control takes the view with it.
 */
export const ACCESS_ACTION_ROWS: AccessActionRow[] = [
  { key: "devices", label: "Devices", view: "devices.view", edit: "devices.edit", control: "devices.control" },
  { key: "assets", label: "Assets", view: "assets.view", edit: "assets.edit", control: null },
  { key: "dashboards", label: "Dashboards", view: "dashboards.view", edit: null, control: null },
  { key: "alarms", label: "Alarms", view: "alarms.view", edit: "alarms.edit", control: null },
  { key: "members", label: "Group members", view: "members.view", edit: "members.edit", control: null },
];

/** Every action there is. */
export const ACCESS_ACTIONS: AccessAction[] = ACCESS_ACTION_ROWS.flatMap((r) => [r.view, r.edit, r.control].filter((a): a is string => !!a));

/** Where a role applies, for one kind of scope item: every one (new ones too), else the ones picked (none: no item). */
export interface AccessRoleTargets {
  all: boolean;
  ids: string[];
}

/** The scope items a role applies to: each has a default group of it. */
export interface AccessRoleScope {
  regional: boolean;
  productLines: AccessRoleTargets;
  markets: AccessRoleTargets;
  sites: AccessRoleTargets;
}

/** A role: a template of access (Access › Roles), kept with the others on the access owner (`accessRoles`). */
export interface AccessRole {
  id: string;
  /** One member's name: "Viewer". */
  label: string;
  /** Its default groups' — several members': "Viewers" ("Richmond Lab · Viewers"). */
  plural: string;
  icon: string;
  description: string;
  actions: AccessAction[];
  appliesTo: AccessRoleScope;
  /**
   * A default role: kept as it is — the dashboards neither edit nor delete it
   * (set on the stored list, `accessRoles`, never by the form). The three to
   * start are, unless the list says otherwise.
   */
  default: boolean;
  createdTime: number | null;
}

/** A role being made or saved (the role form's) — its default flag isn't the form's to set. */
export type AccessRoleDraft = Omit<AccessRole, "id" | "createdTime" | "default">;

const EVERY: AccessRoleTargets = { all: true, ids: [] };
const EVERYWHERE: AccessRoleScope = { regional: true, productLines: EVERY, markets: EVERY, sites: EVERY };
export const NOWHERE: AccessRoleScope = { regional: false, productLines: { all: false, ids: [] }, markets: { all: false, ids: [] }, sites: { all: false, ids: [] } };

/** The roles to start — each scope item's three default groups before Roles existed (their ids kept: the groups and users name them). */
export const BUILT_IN_ROLES: AccessRole[] = [
  {
    id: "viewer",
    label: "Viewer",
    plural: "Viewers",
    icon: "visibility",
    description: "Views devices, data and alarms.",
    actions: ["devices.view", "assets.view", "dashboards.view", "alarms.view"],
    appliesTo: EVERYWHERE,
    default: true,
    createdTime: null,
  },
  {
    id: "operator",
    label: "Operator",
    plural: "Operators",
    icon: "tune",
    description: "Also controls devices and handles alarms.",
    actions: ["devices.view", "devices.edit", "devices.control", "assets.view", "assets.edit", "dashboards.view", "alarms.view", "alarms.edit"],
    appliesTo: EVERYWHERE,
    default: true,
    createdTime: null,
  },
  {
    id: "manager",
    label: "Manager",
    plural: "Managers",
    icon: "manage_accounts",
    description: "Also manages the group's members.",
    actions: [
      "devices.view",
      "devices.edit",
      "devices.control",
      "assets.view",
      "assets.edit",
      "dashboards.view",
      "alarms.view",
      "alarms.edit",
      "members.view",
      "members.edit",
    ],
    appliesTo: EVERYWHERE,
    default: true,
    createdTime: null,
  },
];

/** The icons a role can take (the role form's choices). */
export const ACCESS_ROLE_ICONS: { id: string; label: string }[] = [
  { id: "visibility", label: "Viewer" },
  { id: "tune", label: "Controls" },
  { id: "manage_accounts", label: "Manager" },
  { id: "badge", label: "Badge" },
  { id: "engineering", label: "Engineer" },
  { id: "construction", label: "Maintenance" },
  { id: "science", label: "Lab" },
  { id: "local_gas_station", label: "Fuel" },
  { id: "local_shipping", label: "Transport" },
  { id: "support_agent", label: "Support" },
  { id: "admin_panel_settings", label: "Administrator" },
  { id: "shield_person", label: "Security" },
  { id: "monitoring", label: "Analyst" },
  { id: "person", label: "Person" },
];

/**
 * The roles back from the access owner's `accessRoles` attribute (a list, or its JSON) — none stored, or unreadable: the
 * three to start. Older lists carry `appIds` / `runningApps` (apps granted by a role) and `startApp` / `homeDashboardId`
 * (where its groups' members opened): read past, ignored — the next save of the roles drops them.
 */
export function parseRoles(value: unknown): AccessRole[] {
  let list: unknown = value;
  if (typeof value === "string") {
    try {
      list = JSON.parse(value);
    } catch {
      list = null;
    }
  }
  if (!Array.isArray(list) || !list.length) {
    return BUILT_IN_ROLES;
  }
  const str = (x: unknown, fallback = "") => (typeof x === "string" ? x : fallback);
  const ids = (x: unknown) => (Array.isArray(x) ? x.filter((v): v is string => typeof v === "string" && !!v) : []);
  const targets = (x: any): AccessRoleTargets => ({ all: x?.all === true, ids: ids(x?.ids) });
  const roles = list
    .filter((r: any) => r && typeof r === "object" && typeof r.id === "string" && r.id)
    .map((r: any): AccessRole => {
      const label = str(r.label, r.id);
      return {
        id: r.id,
        label,
        plural: str(r.plural) || `${label}s`,
        icon: str(r.icon) || "badge",
        description: str(r.description),
        actions: ids(r.actions).filter((a) => ACCESS_ACTIONS.includes(a)),
        appliesTo: {
          regional: r.appliesTo?.regional === true,
          productLines: targets(r.appliesTo?.productLines),
          markets: targets(r.appliesTo?.markets),
          sites: targets(r.appliesTo?.sites),
        },
        // As stored; not stored — one of the three to start is, any other isn't.
        default: typeof r.default === "boolean" ? r.default : BUILT_IN_ROLES.some((b) => b.id === r.id),
        createdTime: Number(r.createdTime) || null,
      };
    });
  return roles.length ? roles : BUILT_IN_ROLES;
}

/**
 * A role's breadth — how much it may do (its actions): a user's role, when
 * they set none, is their groups' broadest; the later role in the list wins a
 * tie.
 */
export function roleBreadth(role: AccessRole | undefined): number {
  return role?.actions.length ?? 0;
}

/** Whether a role applies to a scope (its default group of the role belongs there): regional, a product line, a market or a plant picked or every one. */
export function roleAppliesTo(role: AccessRole, scope: AccessScope): boolean {
  const t = role.appliesTo;
  switch (accessScopeType(scope)) {
    case "site":
      return scope.siteIds.length === 1 && (t.sites.all || t.sites.ids.includes(scope.siteIds[0]));
    case "market":
      // A market filtered to a product line: its market's.
      return !!scope.marketId && (t.markets.all || t.markets.ids.includes(scope.marketId));
    case "productLine":
      return !!scope.productLineId && (t.productLines.all || t.productLines.ids.includes(scope.productLineId));
    default:
      return t.regional;
  }
}

/** Where a role applies, in words: "Regional, every product line, 3 markets, every plant" ("Nowhere" for none). */
export function roleScopeText(role: AccessRole): string {
  const t = role.appliesTo;
  const part = (x: AccessRoleTargets, one: string, many: string) =>
    x.all ? `every ${one}` : x.ids.length ? `${x.ids.length} ${x.ids.length === 1 ? one : many}` : "";
  const parts = [
    t.regional ? "Regional" : "",
    part(t.productLines, "product line", "product lines"),
    part(t.markets, "market", "markets"),
    part(t.sites, "plant", "plants"),
  ].filter(Boolean);
  const text = parts.join(", ");
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "Nowhere";
}

/**
 * Where a group's access reaches: the sites within a product line (and its
 * sub product lines) and / or a market (none: any) — or one plant, named with
 * its product line and market. Nothing set: everything. Each site brings its
 * market and product line with it; every device and asset related from them
 * is the scope's (no profile left out).
 */
export interface AccessScope {
  productLineId: string | null;
  marketId: string | null;
  /**
   * A plant scope's plants — a group's one (its product line and market then describe it); a user's, every plant they
   * have access to when that's more than one default group (the product line and market they all share, if any). Empty:
   * every site the product line / market allow.
   */
  siteIds: string[];
}

export const EVERYTHING: AccessScope = { productLineId: null, marketId: null, siteIds: [] };

/**
 * A scope's type (the group form's choice): regional — the access owner's
 * whole organization — a product line, a market (optionally one product
 * line's plants in it), or a plant.
 */
export type AccessScopeType = "all" | "productLine" | "market" | "site" | "tenant";

export function accessScopeType(scope: AccessScope): AccessScopeType {
  if (scope.siteIds.length) {
    return "site";
  }
  return scope.marketId ? "market" : scope.productLineId ? "productLine" : "all";
}

/**
 * The entity groups that carry a group's access (ids; "" until first synced).
 * `dashboards` is the tenant's (the apps' dashboards are): a group only holds
 * its owner's entities. The default home is shared once with every user
 * instead (`AccessStore.shareDefaultHome`).
 */
export interface AccessBlocks {
  devices: string;
  assets: string;
  dashboards: string;
}

const NO_BLOCKS: AccessBlocks = { devices: "", assets: "", dashboards: "" };

/** An access group: a user group of the access owner, with its definition. */
export interface AccessGroup {
  /** The user group's id. */
  id: string;
  name: string;
  description: string;
  scope: AccessScope;
  level: AccessLevel;
  /** Other dashboards it opens, beyond those of the apps running in its scope (ids) — a site's own reports. */
  dashboardIds: string[];
  blocks: AccessBlocks;
  /** One of its scope's three default groups (a level each): made with the scope's item, deleted with it — its scope and level are fixed. */
  auto: boolean;
  /** Its members (user ids). */
  members: string[];
  /** When its user group was made (null unknown). */
  createdTime: number | null;
}

/** What the group form saves. */
export type AccessGroupDraft = Pick<AccessGroup, "name" | "description" | "scope" | "level" | "dashboardIds">;

/**
 * Keys of a user's additional info older access wrote for where they opened — the app Home opened on (`homeStartApp`)
 * and their own "Opens on" (`homeOverride`): read past, ignored; the next write of their home drops them.
 */
export const OLD_HOME_KEYS = ["homeStartApp", "homeOverride"];

/** A user of the access owner, as the Users page shows them. */
export interface AccessUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  /** "First Last", "" for none. */
  name: string;
  phone: string;
  /** The access groups they're in (ids). */
  groupIds: string[];
  lastLoginTs: number | null;
  createdTime: number | null;
  activated: boolean;
  enabled: boolean;
  /** Their home dashboard as ThingsBoard holds it ("" none): the default home once the access has written it. */
  homeDashboardId: string;
  /**
   * Their additional info differs from where the access opens them, past the home itself — an older "Opens on" still there
   * ({@link OLD_HOME_KEYS}) or the home's toolbar hidden: the next write of their home puts it right.
   */
  homeOutdated: boolean;
  /**
   * Their scope (server attributes on the user — the Users table's and its filters'): their one default group's, else
   * a plant scope listing their plants; null for none set.
   */
  scope: AccessScope | null;
  /** Their level (a server attribute): the role of their default groups; null for none set. */
  level: AccessLevel | null;
  /**
   * A tenant-level user (the Tenant scope — ThingsBoard's tenant administrators and tenant users): no scope, level or
   * access groups of the owner's; their role is their tenant user group ({@link tenantGroupIds}).
   */
  tenant: boolean;
  /** A tenant user's tenant user groups (ids; "All" left out): one of the two default ones their role, the others their access groups. */
  tenantGroupIds: string[];
}

/** Where a dashboard keeps its access. */
export interface AccessSettings {
  /** The customer whose users the access groups hold — and who owns the hierarchy's devices and assets ("WCAN"). */
  ownerTitle: string;
}

/**
 * The Settings page's Access: a group of the section menu — its pages Users,
 * Roles and Health. The Users page holds two lists, the users and the access
 * groups, switched by the button group atop its filters ("Users | Groups"):
 * a section each, the groups' shown on the Users page (no entry of its own —
 * an older link to it, or a place naming it, opens the page on the groups).
 */
export const ACCESS_SECTION: SectionNavItem = {
  id: "access",
  label: "Access",
  icon: "admin_panel_settings",
  // Users first — the page the group opens on (its Groups list with it) — then Roles, Health.
  children: [
    { id: "accessUsers", label: "Users", icon: "person" },
    { id: "accessGroups", label: "Groups", icon: "groups", shownOn: "accessUsers" },
    { id: "accessRoles", label: "Roles", icon: "badge" },
    { id: "accessHealth", label: "Health", icon: "monitor_heart" },
  ],
};

/**
 * The Settings page's Access lists, a section each: the Users page's two ("users", "groups" — its button group's), "roles"
 * and "health" (its checks — no filters column).
 */
export type AccessPage = "groups" | "users" | "roles" | "health";

/** The Users page's lists, as its button group names them (`tb-access-filters`): the users, then the access groups. */
export const ACCESS_USERS_PAGE_LISTS: { page: AccessPage; label: string; icon: string }[] = [
  { page: "users", label: "Users", icon: "person" },
  { page: "groups", label: "Groups", icon: "groups" },
];

/**
 * One check of Access › Health: what should hold, how bad it is when it
 * doesn't, and the items where it doesn't (none: fine) — each opening what
 * it is; `fix`: the one action that settles it.
 */
export interface AccessHealthCheck {
  id: string;
  label: string;
  severity: "error" | "warning" | "info";
  /** What its items are ("Devices", "Groups"): the title of its panel's list — as a side panel's tab names its list — and its icon. */
  itemsTitle: string;
  itemsIcon: string;
  items: AccessHealthItem[];
  fix?: { label: string; run: () => void };
}

export interface AccessHealthItem {
  id: string;
  name: string;
  /** What's wrong with it, its own — muted after its name on its line ("named 3D64"); kept short, the panel is narrow. */
  details?: string[];
  /**
   * What it shares with others of its check ("at STAR (3D21)", "agg-3a12-gw-01 · Squamish (3A12)", a profile): the check's list
   * groups by it — a group's row named by it, its rows leaving it off (all one value: one list, the value on each row).
   */
  group?: string;
  /** Opens the item's panel (none: nothing to open — a group not made yet). */
  open?: () => void;
  /** A device: its Details panel opens in its place — the dashboard's, `tb-access-panels (deviceOpen)`. */
  device?: AccessHealthDevice;
}

/** A device a check lists: what its Details panel opens with (its profile for the icon, its site's code). */
export interface AccessHealthDevice {
  id: string;
  name: string;
  profile: string;
  site: string;
  /** Its owner's title (a customer's, or the tenant's own): its Details panel's form starts with it. */
  owner: string;
}

/** The Health table's columns. */
export const ACCESS_HEALTH_COLUMNS: DataTableColumn[] = [
  { key: "label", phone: "title", header: "Check", emphasis: "strong" },
  { key: "status", phone: "trail", header: "Status", sortValue: (row) => row["order"] ?? 0 },
  { key: "count", phone: "trail", header: "Items", align: "right", sortValue: (row) => row["count"] ?? 0 },
];

/** The Access list a section id shows, or null for any other section. */
export function accessPageOf(section: string): AccessPage | null {
  return section === "accessGroups" ? "groups" : section === "accessUsers" ? "users" : section === "accessRoles" ? "roles" : section === "accessHealth" ? "health" : null;
}

/** The section an Access list is ("groups": `accessGroups`, shown on the Users page). */
export function accessSectionOf(page: AccessPage): string {
  return page === "groups" ? "accessGroups" : page === "users" ? "accessUsers" : page === "roles" ? "accessRoles" : "accessHealth";
}

/** From one of the Users page's two lists to the other (its button group): the same page, nothing to reload. */
export function accessListSwitch(from: string, to: string): boolean {
  const users = (s: string) => s === "accessUsers" || s === "accessGroups";
  return from !== to && users(from) && users(to);
}

// -- stored definition ---------------------------------------------------------------------------

/**
 * A group's definition out of its user group's additional info; null: not an access group. Older definitions carry
 * `appIds` (apps granted to the group) and `startApp` / `homeDashboardId` (where its members opened): read past,
 * ignored — a save writes the definition without them.
 */
export function parseAccess(info: unknown): Omit<AccessGroup, "id" | "name" | "members" | "createdTime"> | null {
  const a = info && typeof info === "object" ? (info as Record<string, any>)["access"] : null;
  if (!a || typeof a !== "object") {
    return null;
  }
  const s = a.scope ?? {};
  // Its role's id (a role since removed still names it: the store reads it as the first role).
  const level: AccessLevel = typeof a.level === "string" && a.level ? a.level : "viewer";
  const ids = (x: unknown) => (Array.isArray(x) ? x.filter((v): v is string => typeof v === "string" && !!v) : []);
  const id = (x: unknown) => (typeof x === "string" && x ? x : null);
  const b = a.blocks ?? {};
  return {
    description: typeof (info as any).description === "string" ? (info as any).description : "",
    scope: { productLineId: id(s.productLineId), marketId: id(s.marketId), siteIds: ids(s.siteIds) },
    level,
    dashboardIds: ids(a.dashboardIds),
    blocks: { devices: id(b.devices) ?? "", assets: id(b.assets) ?? "", dashboards: id(b.dashboards) ?? "" },
    auto: a.auto === true,
  };
}

/** A group's additional info: the user group's own, its description and its definition. */
export function accessInfo(base: Record<string, any> | null | undefined, g: AccessGroupDraft & { blocks?: AccessBlocks; auto?: boolean }): Record<string, any> {
  return {
    ...(base ?? {}),
    description: g.description,
    access: {
      v: 1,
      scope: g.scope,
      level: g.level,
      dashboardIds: g.dashboardIds,
      blocks: g.blocks ?? NO_BLOCKS,
      ...(g.auto ? { auto: true } : {}),
    },
  };
}

// -- scopes ----------------------------------------------------------------------------------------

/**
 * Relation types by which a market's entity applies across its sites — its
 * fuel codes (a market's user / vehicle code works at every station of it):
 * it applies at the market's sites an app owning its profile runs at (the
 * Fuel app's), and an access group whose scope holds one of those takes it, a
 * plant's too. (A market's other entities — its trucks — only a scope of the
 * market or wider.) A site's own (a site code) comes with the site.
 */
export const SITE_WIDE_RELATIONS = ["FuelUser", "FuelVehicle"];

/**
 * The sites a scope covers, out of the Organization's (each with its market
 * and product line resolved): a plant scope's plant (its product line and
 * market only describe it); else those of its product line — a sub product
 * line's too — and / or its market.
 */
export function scopeSites(scope: AccessScope, sites: AssetRow[], productLines: AssetRow[] = []): AssetRow[] {
  if (scope.siteIds.length) {
    return sites.filter((s) => scope.siteIds.includes(s.id));
  }
  return sites.filter(
    (s) => (!scope.productLineId || lineWithin(s.productLineId, scope.productLineId, productLines)) && (!scope.marketId || s.marketId === scope.marketId)
  );
}

/**
 * The applications running in a scope (their ids): those at one of its sites
 * — an app runs at a plant with a device of its device profiles; the
 * "Application Sites" rule chain keeps an Application → site relation each
 * (`appSites`: `ApplicationStore.sites`, each app's sites). A group's apps:
 * their Application assets and dashboards are shared with it.
 */
export function appsRunningIn(scope: AccessScope, sites: AssetRow[], productLines: AssetRow[], appSites: ReadonlyMap<string, string[]>): string[] {
  const inScope = new Set(scopeSites(scope, sites, productLines).map((s) => s.id));
  return [...appSites.entries()].filter(([, at]) => at.some((id) => inScope.has(id))).map(([id]) => id);
}

/**
 * A plant scope as its plant now is: its market, and its product line — the
 * one named, if the plant still counts under it (a parent line), else the
 * plant's own. Older scopes named no product line or market: they're filled
 * in. Any other scope (or a plant not in the list): as it is.
 */
export function completeScope(scope: AccessScope, sites: AssetRow[], productLines: AssetRow[] = []): AccessScope {
  const site = scope.siteIds.length === 1 ? sites.find((s) => s.id === scope.siteIds[0]) : undefined;
  if (!site) {
    return scope;
  }
  const productLineId =
    scope.productLineId && lineWithin(site.productLineId, scope.productLineId, productLines) ? scope.productLineId : (site.productLineId ?? scope.productLineId);
  const marketId = site.marketId ?? scope.marketId;
  return productLineId === scope.productLineId && marketId === scope.marketId ? scope : { ...scope, productLineId, marketId };
}

/** How broad a scope is (0 = everything … 4 = listed sites): an item's groups are listed narrowest first. */
export function scopeBreadth(scope: AccessScope): number {
  if (scope.siteIds.length) {
    return 4;
  }
  if (scope.productLineId && scope.marketId) {
    return 3;
  }
  return scope.marketId ? 2 : scope.productLineId ? 1 : 0;
}

/** The scope types as the group form offers them: an icon each (the Organization menu's), its name in the tooltip. */
export const ACCESS_SCOPE_TYPES: { id: AccessScopeType; label: string; icon: string }[] = [
  { id: "all", label: "Regional", icon: "public" },
  { id: "productLine", label: "Product line", icon: "category" },
  { id: "market", label: "Market", icon: "storefront" },
  { id: "site", label: "Plant", icon: "factory" },
];

/**
 * A user's scope above the access owner's: the tenant — a tenant-level user of ThingsBoard (its tenant administrators and
 * tenant users), whose role is the tenant's user group they're in ("Tenant Administrators", "Tenant Users"). Users only:
 * an access group's scope is the owner's.
 */
export const TENANT_SCOPE_TYPE: { id: AccessScopeType; label: string; icon: string } = { id: "tenant", label: "Tenant", icon: "domain" };

/** A user's scope types: the tenant, then the access owner's. */
export const USER_SCOPE_TYPES = [TENANT_SCOPE_TYPE, ...ACCESS_SCOPE_TYPES];

/**
 * The Tenant scope's roles: ThingsBoard's two default tenant user groups, by name — the administrators' and the users'.
 * The tenant's other user groups are a Tenant scope user's access groups, added after (as the owner's hand-made ones).
 */
export const TENANT_ROLE_GROUP_NAMES = ["Tenant Administrators", "Tenant Users"];

/** A tenant user group's icon as a role: an administrators' group the administrator's, any other a user's. */
export function tenantRoleIcon(name: string): string {
  return /admin/i.test(name) ? "admin_panel_settings" : "person";
}

/**
 * A scope in words, by its type: "Regional", "Product line · Ready Mix",
 * "Market · Greater Vancouver Area" ("… (Ready Mix)" with a product line),
 * "Plant · Richmond Port", "3 plants".
 */
export function scopeLabel(scope: AccessScope, nameOf: (id: string) => string): string {
  switch (accessScopeType(scope)) {
    case "site":
      return scope.siteIds.length === 1 ? `Plant · ${nameOf(scope.siteIds[0])}` : `${scope.siteIds.length} plants`;
    case "market":
      return `Market · ${nameOf(scope.marketId!)}${scope.productLineId ? ` (${nameOf(scope.productLineId)})` : ""}`;
    case "productLine":
      return `Product line · ${nameOf(scope.productLineId!)}`;
    default:
      return "Regional";
  }
}

/** A user's display name: "First Last", else their email. */
export function accessUserName(u: { name: string; email: string }): string {
  return u.name || u.email;
}

// -- scope choices (the scope picker) ---------------------------------------------------------------

/** A scope as the scope picker holds it: its type (an empty pick is still its own type) and the scope. */
export interface AccessScopeChoice {
  type: AccessScopeType;
  scope: AccessScope;
}

export function scopeChoiceOf(scope: AccessScope | null | undefined): AccessScopeChoice {
  const sc = scope ?? EVERYTHING;
  return { type: accessScopeType(sc), scope: { productLineId: sc.productLineId, marketId: sc.marketId, siteIds: [...sc.siteIds] } };
}

/** The choice's own pick is made: a product line, a market, a plant — with its product line and market (regional needs none). */
export function scopeChoiceComplete(c: AccessScopeChoice): boolean {
  switch (c.type) {
    case "productLine":
      return !!c.scope.productLineId;
    case "market":
      return !!c.scope.marketId;
    case "site":
      return c.scope.siteIds.length === 1 && !!c.scope.productLineId && !!c.scope.marketId;
    default:
      return true;
  }
}

/**
 * A scope (a group's) lies within another (a user's): regional takes any; a
 * product line takes itself or a sub line of it, a market filtered to either,
 * or a plant of either; a market (filtered to a product line or not) takes
 * itself — with any or that filter (or its sub line) — or a plant in it; a
 * plant takes only itself. `sites`: the Organization's, with their market and
 * product line; `productLines`: theirs (the sub lines).
 */
export function scopeWithin(
  inner: AccessScope,
  outer: AccessScope,
  sites: { id: string; marketId?: string | null; productLineId?: string | null }[],
  productLines: AssetRow[] = []
): boolean {
  const t = accessScopeType(outer);
  const ti = accessScopeType(inner);
  if (t === "all") {
    return true;
  }
  if (ti === "all") {
    return false;
  }
  const siteOf = new Map(sites.map((x) => [x.id, x]));
  const plants = (fits: (x: { marketId?: string | null; productLineId?: string | null }) => boolean) =>
    inner.siteIds.every((id) => {
      const x = siteOf.get(id);
      return !!x && fits(x);
    });
  const inLine = (lineId: string | null | undefined) => lineWithin(lineId, outer.productLineId, productLines);
  if (t === "productLine") {
    if (ti === "site") {
      return plants((x) => inLine(x.productLineId));
    }
    return inLine(inner.productLineId); // the product line itself (or a sub line), or a market filtered to either
  }
  if (t === "market") {
    if (ti === "market") {
      return inner.marketId === outer.marketId && (!outer.productLineId || inLine(inner.productLineId));
    }
    if (ti === "site") {
      return plants((x) => x.marketId === outer.marketId && (!outer.productLineId || inLine(x.productLineId)));
    }
    return false;
  }
  return ti === "site" && inner.siteIds.every((id) => outer.siteIds.includes(id));
}

/**
 * A scope as server attributes (a group's, a user's) — plain strings, so
 * filters and entity queries can use them: `scopeType`, `scope` (in words),
 * `productLine` / `productLineId`, `market` / `marketId`, `plants` /
 * `plantIds` (comma-separated). Names as they are now (`nameOf`).
 */
export function scopeAttributes(scope: AccessScope, nameOf: (id: string | null) => string): Record<string, string> {
  return {
    scopeType: accessScopeType(scope),
    scope: scopeLabel(scope, (id) => nameOf(id)),
    productLine: nameOf(scope.productLineId),
    productLineId: scope.productLineId ?? "",
    market: nameOf(scope.marketId),
    marketId: scope.marketId ?? "",
    plants: scope.siteIds.map(nameOf).join(", "),
    plantIds: scope.siteIds.join(","),
  };
}

/** A scope back from its server attributes (`scopeType`, the ids); null when none is set. */
export function scopeFromAttributes(attrs: Record<string, unknown>): AccessScope | null {
  const type = attrs["scopeType"];
  if (type !== "all" && type !== "productLine" && type !== "market" && type !== "site") {
    return null;
  }
  const id = (k: string) => (typeof attrs[k] === "string" && attrs[k] ? (attrs[k] as string) : null);
  const ids = (k: string) => (typeof attrs[k] === "string" ? (attrs[k] as string).split(",").filter(Boolean) : []);
  return {
    productLineId: type === "all" ? null : id("productLineId"),
    marketId: type === "market" || type === "site" ? id("marketId") : null,
    siteIds: type === "site" ? ids("plantIds") : [],
  };
}

/** A user's role back from its server attribute (`level`: the role's id); null when none is set. */
export function levelFromAttribute(value: unknown): AccessLevel | null {
  return typeof value === "string" && value ? value : null;
}

/**
 * An entity group the access sync made (a group's Devices / Assets /
 * Dashboards): flagged `additionalInfo.autoGenerated` — or, one a sync hasn't
 * marked yet, named "Access · … · Devices" (Assets, Dashboards). Lists of an
 * entity's groups leave them out.
 */
export function isAutoGeneratedGroup(g: { name?: string; additionalInfo?: any }): boolean {
  return g.additionalInfo?.autoGenerated === true || /^Access · .+ · (Devices|Assets|Dashboards)$/.test(g.name ?? "");
}

// -- the Groups and Users pages' filters ------------------------------------------------------------

/**
 * The Groups table's columns, in order (all shown until the user picks with
 * "Customize columns" — the store's `groupColumns`). The name capped, cut
 * with "…" past it (the full text in a bubble on hover); the
 * other columns in full — the scope a column per level of the hierarchy
 * (sorted by the scope's breadth, then its words).
 */
export const ACCESS_GROUP_COLUMNS: DataTableColumn[] = [
  { key: "name", phone: "title", header: "Name", emphasis: "strong", maxWidth: "260px" },
  { key: "scope", phone: "sub", header: "Scope", sortValue: (row) => `${row["scopeOrder"]}|${row["scopeText"]}` },
  // The product line, market and plant by their names (their codes), each label in a bubble on hover.
  { key: "productLine", phone: "hide", header: "Product line", tooltipKey: "productLineLabel" },
  { key: "market", phone: "hide", header: "Market", tooltipKey: "marketLabel" },
  { key: "plant", phone: "hide", header: "Plant", tooltipKey: "plantLabel" },
  { key: "level", phone: "sub", header: "Role" },
  { key: "members", phone: "trail", header: "Members" },
  CREATED_ON_COLUMN,
];

/**
 * Access › Groups as a matrix: the Groups table's own leading columns (the
 * scope item, its scope a column per level), then a column a role — its key
 * {@link ACCESS_MATRIX_ROLE} + the role's id, its cell the item's default
 * group of the role: its members.
 */
export const ACCESS_MATRIX_COLUMNS = ["name", "scope", "productLine", "market", "plant"];
export const ACCESS_MATRIX_ROLE = "role:";

/** The matrix's columns for these roles: {@link ACCESS_MATRIX_COLUMNS} (those of `shown`, the name always), then a count column a role. */
export function accessMatrixColumns(roles: AccessRole[], shown: string[] = ACCESS_MATRIX_COLUMNS): DataTableColumn[] {
  return [
    ...ACCESS_GROUP_COLUMNS.filter((c) => ACCESS_MATRIX_COLUMNS.includes(c.key) && (c.key === "name" || shown.includes(c.key))),
    ...roles.map((r): DataTableColumn => ({ key: `${ACCESS_MATRIX_ROLE}${r.id}`, header: r.plural, count: { label: "members" }, phone: "meta" })),
  ];
}

/** The Roles table's columns, in order (all shown until the user picks — the store's `roleColumns`). */
export const ACCESS_ROLE_COLUMNS: DataTableColumn[] = [
  { key: "name", phone: "title", header: "Name" },
  { key: "description", phone: "note", header: "Description", emphasis: "muted", maxWidth: "260px" },
  { key: "permissions", phone: "hide", header: "Permissions", sortValue: (row) => row["actionCount"] ?? 0 },
  { key: "appliesTo", phone: "sub", header: "Applies to" },
  { key: "members", phone: "trail", header: "Members" },
  CREATED_ON_COLUMN,
];

/** The Users table's columns, in order (all shown until the user picks — the store's `userColumns`). */
export const ACCESS_USER_COLUMNS: DataTableColumn[] = [
  { key: "name", phone: "title", header: "Name" },
  { key: "email", phone: "hide", header: "Email", copyable: true },
  { key: "status", phone: "trail", header: "Status", sortValue: (row) => row["status"]?.label ?? "" },
  // Their scope a column per level of the hierarchy, as the groups'; their level.
  { key: "scope", phone: "hide", header: "Scope", sortValue: (row) => `${row["scopeOrder"]}|${row["scopeText"]}` },
  // The product line, market and plant by their names (their codes), each label in a bubble on hover.
  { key: "productLine", phone: "hide", header: "Product line", tooltipKey: "productLineLabel" },
  { key: "market", phone: "hide", header: "Market", tooltipKey: "marketLabel" },
  { key: "plant", phone: "sub", header: "Plant", tooltipKey: "plantLabel" },
  { key: "level", phone: "sub", header: "Role" },
  { key: "lastLogin", phone: "hide", header: "Last login", emphasis: "muted", nowrap: true, sortValue: (row) => row["lastLoginTs"] ?? 0 },
  CREATED_ON_COLUMN,
];

/** What the filters match on (`tb-access-filters`): a scope's type, product line and market and the level — and a role's permissions (`actions`). */
export type AccessFacet = "scopes" | "productLines" | "markets" | "sites" | "levels" | "actions";

/** The Groups page's facets, and the Users page's — both with the Sites tree in the Market filter's place (the plants a scope covers). */
export const ACCESS_GROUP_FACETS: AccessFacet[] = ["scopes", "productLines", "sites", "levels"];
export const ACCESS_USER_FACETS: AccessFacet[] = ["scopes", "productLines", "sites", "levels"];
/** The Roles page's: where a role applies (its kinds of scope item, as a scope's type) and its permissions (the actions grid's rows). */
export const ACCESS_ROLE_FACETS: AccessFacet[] = ["scopes", "actions"];

/** A user's scope facet when they have none set. */
export const NO_SCOPE = "none";

/** A facet value covering every option of the facet (a regional group's product lines and markets): such an item passes
 *  any pick of the facet — so the filters need no "All …" option beside "Select all". */
export const ALL_FACET_VALUES = "";

/**
 * A page's filters (its sidebar column): the search, whether the default
 * groups show (the Groups page), and each facet's picks (none: any). A facet
 * value "" is one that takes every one — every product line or market.
 */
export interface AccessFilter {
  searchTerms: string[];
  searchText: string;
  /** What the table searches for (the box's terms and its text). */
  search: string[];
  showDefault: boolean;
  /** Groups: those with no members hidden. */
  hideEmpty: boolean;
  scopes: string[];
  productLines: string[];
  markets: string[];
  /** Users and Groups: the sites picked in the Sites tree (site ids). */
  sites: string[];
  levels: string[];
  /** Roles: the actions grid's rows (`AccessActionRow.key`) a role has an action in. */
  actions: string[];
}

export const NO_ACCESS_FILTER: AccessFilter = {
  searchTerms: [],
  searchText: "",
  search: [],
  showDefault: false,
  hideEmpty: false,
  scopes: [],
  productLines: [],
  markets: [],
  sites: [],
  levels: [],
  actions: [],
};

// -- default groups (three a scope item: a level each) ----------------------------------------------

/**
 * What identifies a scope (two default groups of one level are the same
 * scope's): its type and item — a plant's own id (its product line and
 * market only describe it), a market's with its product line filter.
 */
export function scopeKey(scope: AccessScope): string {
  switch (accessScopeType(scope)) {
    case "site":
      return `site:${[...scope.siteIds].sort().join(",")}`;
    case "market":
      return `market:${scope.marketId}:${scope.productLineId ?? ""}`;
    case "productLine":
      return `productLine:${scope.productLineId}`;
    default:
      return "all";
  }
}

/**
 * A default group's name: its scope — without its type — and its role's
 * members ({@link AccessRole.plural}): a product line and a market by their
 * names (their codes), a plant by its label: "GVA (RMX) · Viewers", "RMX ·
 * Operators", "Richmond Lab · Viewers", "Regional · Managers". (The Access
 * Lifecycle rule chain names the groups it makes, and renames them, the same
 * way; the description keeps the type: "Product line · RMX: its default
 * operator group.")
 */
export function defaultGroupName(scope: AccessScope, plural: string, codeOf: (id: string) => string, labelOf: (id: string) => string): string {
  return `${scopeShortName(scope, codeOf, labelOf)} · ${plural}`;
}

/**
 * A scope's own name — its default groups' name before the level: a plant's
 * label ("Richmond Lab"), a market's code with its product line's ("GVA
 * (RMX)"), a product line's code ("RMX"), "Regional". The Groups table's
 * similarity grouping names a scope's summary row so.
 */
export function scopeShortName(scope: AccessScope, codeOf: (id: string) => string, labelOf: (id: string) => string): string {
  switch (accessScopeType(scope)) {
    case "site":
      return scope.siteIds.length === 1 ? labelOf(scope.siteIds[0]) : `${scope.siteIds.length} plants`;
    case "market":
      return `${codeOf(scope.marketId!)}${scope.productLineId ? ` (${codeOf(scope.productLineId)})` : ""}`;
    case "productLine":
      return codeOf(scope.productLineId!);
    default:
      return "Regional";
  }
}

/** An Organization item's own scope: a product line's, a market's, a plant's (with its product line and market). */
export function itemScope(kind: AssetKind, item: AssetRow): AccessScope {
  switch (kind) {
    case "productLine":
      return { productLineId: item.id, marketId: null, siteIds: [] };
    case "market":
      return { productLineId: null, marketId: item.id, siteIds: [] };
    default:
      return { productLineId: item.productLineId ?? null, marketId: item.marketId ?? null, siteIds: [item.id] };
  }
}

/**
 * The Organization items a scope stands on — deleting one takes the groups of
 * this scope with it: a plant's own (its product line and market only
 * describe it), a market's and its product line filter, a product line's.
 */
export function scopeItems(scope: AccessScope): string[] {
  switch (accessScopeType(scope)) {
    case "site":
      return [...scope.siteIds];
    case "market":
      return [scope.marketId!, ...(scope.productLineId ? [scope.productLineId] : [])];
    case "productLine":
      return [scope.productLineId!];
    default:
      return [];
  }
}

// -- a user's plants (the user form's tree) ----------------------------------------------------------

/**
 * The default groups' scopes a user's plants and role become — each the
 * broadest the role applies to: every plant ticked, the region's; else every
 * plant of a market ticked, that market's (no product line); every other
 * plant, its own (with its product line and market). Plants not in `sites`
 * are left out; none ticked: none. A plant or market added later then comes
 * with the region's or the market's group.
 */
export function plantPickScopes(plantIds: string[], role: AccessRole | undefined, sites: AssetRow[], markets: AssetRow[]): AccessScope[] {
  const picked = new Set(plantIds);
  const chosen = sites.filter((s) => picked.has(s.id));
  if (!chosen.length) {
    return [];
  }
  const applies = (scope: AccessScope) => !role || roleAppliesTo(role, scope);
  if (chosen.length === sites.length && applies(EVERYTHING)) {
    return [EVERYTHING];
  }
  const scopes: AccessScope[] = [];
  const covered = new Set<string>();
  for (const m of markets) {
    const own = sites.filter((s) => s.marketId === m.id);
    const scope: AccessScope = { productLineId: null, marketId: m.id, siteIds: [] };
    if (own.length && own.every((s) => picked.has(s.id)) && applies(scope)) {
      scopes.push(scope);
      own.forEach((s) => covered.add(s.id));
    }
  }
  for (const s of chosen) {
    if (!covered.has(s.id)) {
      scopes.push({ productLineId: s.productLineId ?? null, marketId: s.marketId ?? null, siteIds: [s.id] });
    }
  }
  return scopes;
}

/**
 * The plants some groups give (ids, in the sites' order): each one's scope's
 * sites — a regional group's every plant; a market's its plants (of its
 * product line, when it names one); a product line's, its sub lines' too; a
 * plant's, the plant. A user's default groups: the plants their form ticks.
 */
export function plantsOfGroups(groups: AccessGroup[], sites: AssetRow[], productLines: AssetRow[]): string[] {
  const ids = new Set(groups.flatMap((g) => scopeSites(g.scope, sites, productLines).map((s) => s.id)));
  return sites.filter((s) => ids.has(s.id)).map((s) => s.id);
}

/** A plant scope of several plants (a user's scope attributes): those of `plantIds` in the list, and the product line and market they all share, if any. */
export function plantsScope(plantIds: string[], sites: AssetRow[]): AccessScope {
  const picked = new Set(plantIds);
  const chosen = sites.filter((s) => picked.has(s.id));
  const shared = (of: (s: AssetRow) => string | null | undefined): string | null => {
    const values = new Set(chosen.map((s) => of(s) ?? null));
    return values.size === 1 ? [...values][0] : null;
  };
  return { productLineId: shared((s) => s.productLineId), marketId: shared((s) => s.marketId), siteIds: chosen.map((s) => s.id) };
}

/**
 * Of several groups' roles, the broadest — the most actions
 * ({@link roleBreadth}), the later in the list on a tie; a role no longer
 * among `roles` left out (none left: undefined). A user's role, when their
 * groups have several.
 */
export function broadestLevel(levels: Iterable<AccessLevel>, roles: AccessRole[]): AccessLevel | undefined {
  const theirs = new Set(levels);
  return roles
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => theirs.has(r.id))
    .sort((a, b) => roleBreadth(b.r) - roleBreadth(a.r) || b.i - a.i)[0]?.r.id;
}
