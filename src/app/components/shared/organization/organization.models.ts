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
import { TbSelectOption } from "../select/select.component";
import type { FilterListOption } from "../filter-list/filter-list.component";
import type { DataTableColumn } from "../data-table/data-table.component";
import { CREATED_ON_COLUMN } from "../time-format";

/** An asset of the Organization's lists (a product line, a market, a site). */
export interface AssetRow {
  id: string;
  name: string;
  label: string;
  /** The owner's name: the customer's, or the tenant's own. */
  owner: string;
  createdTime: number | null;
  /** A site's relations from assets (type, and the asset), as loaded. */
  links?: { type: string; fromId: string }[];
  /** A site's: the market that contains it and the product line that covers it — its links resolved against those lists. */
  marketId?: string | null;
  productLineId?: string | null;
  /** A sub product line's: the product line above it (lines nest to any depth), which contains it. */
  parentId?: string | null;
  /** A site's devices, as the hierarchy's calculated field keeps them (its `devices`). */
  devices?: number | null;
}

/** One of the Organization's lists: its assets, and whether they're loading. */
export interface AssetList {
  rows: AssetRow[];
  loading: boolean;
}

export const EMPTY_ASSET_LIST: AssetList = { rows: [], loading: false };

/** The Organization's kinds of asset: each listed from one asset profile (a dashboard setting). */
export type AssetKind = "productLine" | "market" | "site";

/** Where a dashboard keeps its Organization: the asset profiles of its lists, and the relations from a market and a product line to each of its sites. */
export interface OrganizationSettings {
  productLineAssetType: string;
  marketAssetType: string;
  siteAssetType: string;
  marketSiteRelation: string;
  productLineSiteRelation: string;
}

export const ASSET_KINDS: Record<AssetKind, { noun: string; plural: string; icon: string; settingKey: "productLineAssetType" | "marketAssetType" | "siteAssetType" }> = {
  productLine: { noun: "product line", plural: "Product lines", icon: "category", settingKey: "productLineAssetType" },
  market: { noun: "market", plural: "Markets", icon: "storefront", settingKey: "marketAssetType" },
  site: { noun: "site", plural: "Sites", icon: "factory", settingKey: "siteAssetType" },
};

/**
 * What the asset form saves: the asset's name and label — and, a site's, the
 * product line and market it's linked to ("" = none; in bulk, left out =
 * unchanged).
 */
export interface AssetDraft {
  name: string;
  label: string;
  productLineId?: string;
  marketId?: string;
  /** A product line's parent product line ("" = none: a top-level line). */
  parentId?: string;
  /** A site's Google Chat webhook (its `googleChatUrl` server attribute — the Alarm Routing chain posts its alarms there; "" = none). */
  googleChatUrl?: string;
  /**
   * A site's alarm watchdog (its `criticalAlarmEmail` server attribute): on, the "Critical Alarm Email" chain emails its
   * plant managers about a device's critical alarm still active after {@link criticalAlarmDays} days, and again every so many.
   */
  criticalAlarmEmail?: boolean;
  /** The watchdog's days (its `criticalAlarmEmailDays` server attribute): the threshold, and the time between reminders. */
  criticalAlarmDays?: number;
}

/** A site's alarm watchdog days: the chain's default when unset, and the bounds it holds them to. */
export const WATCHDOG_DAYS = { default: 3, min: 1, max: 30 } as const;

/** A Google Chat space's incoming webhook: what a site's `googleChatUrl` must be. */
export const GOOGLE_CHAT_WEBHOOK = /^https:\/\/chat\.googleapis\.com\/v1\/spaces\/[^/\s]+\/messages\?\S+$/;

// -- product lines: nested, any depth --------------------------------------------------------------

/** A product line's ancestors, nearest first (a parent product line, its parent, …; a cycle stops the walk). */
export function lineAncestors(lineId: string | null | undefined, productLines: AssetRow[]): string[] {
  const parentOf = new Map(productLines.map((l) => [l.id, l.parentId ?? null]));
  const out: string[] = [];
  let next = lineId ? (parentOf.get(lineId) ?? null) : null;
  while (next && next !== lineId && !out.includes(next)) {
    out.push(next);
    next = parentOf.get(next) ?? null;
  }
  return out;
}

/** A product line's sub product lines — every level under it. */
export function subProductLines(lineId: string, productLines: AssetRow[]): string[] {
  return productLines.filter((l) => l.id !== lineId && lineAncestors(l.id, productLines).includes(lineId)).map((l) => l.id);
}

/**
 * A product line counts under another: it is that line, or one of its sub
 * product lines at any level — so a sub line's site counts under every line
 * above it (a parent's scope covers its sub lines' sites).
 */
export function lineWithin(lineId: string | null | undefined, outerId: string | null | undefined, productLines: AssetRow[]): boolean {
  if (!lineId || !outerId) {
    return false;
  }
  return lineId === outerId || lineAncestors(lineId, productLines).includes(outerId);
}

/** The product lines in their tree's order — each top-level line, then the lines under it, depth first (by name at each level). */
export function productLineTree(productLines: AssetRow[]): AssetRow[] {
  const ids = new Set(productLines.map((l) => l.id));
  const byName = (a: AssetRow, b: AssetRow) => (a.label || a.name).localeCompare(b.label || b.name, undefined, { numeric: true });
  const out: AssetRow[] = [];
  const seen = new Set<string>();
  const visit = (line: AssetRow) => {
    if (seen.has(line.id)) {
      return;
    }
    seen.add(line.id);
    out.push(line);
    productLines.filter((c) => c.parentId === line.id).sort(byName).forEach(visit);
  };
  productLines.filter((l) => !l.parentId || !ids.has(l.parentId)).sort(byName).forEach(visit);
  productLines.filter((l) => !seen.has(l.id)).sort(byName).forEach(visit); // a cycle: shown from the top
  return out;
}

/** The product lines as a picker offers them: in their tree's order, each by its own name — its code ("AAT"), never the lines above it. */
export function productLineOptions(productLines: AssetRow[]): TbSelectOption[] {
  return productLineTree(productLines).map((l) => ({ value: l.id, label: l.name }));
}

/**
 * The product lines as a filter's tree, by their names (their codes: "BM",
 * "RMX") at each level: a parent picks itself with every line under it, its
 * count the items in its subtree (`count(id, subtree)`) — its own the flat
 * list's (`treeToggle` off); a line whose parent is gone (or caught in a
 * cycle) shows at the top.
 */
export function productLineFilterTree(lines: AssetRow[], count: (value: string, also?: string[]) => number): FilterListOption[] {
  const ids = new Set(lines.map((l) => l.id));
  const byName = (a: AssetRow, b: AssetRow) => a.name.localeCompare(b.name, undefined, { numeric: true });
  const seen = new Set<string>();
  const build = (line: AssetRow): FilterListOption => {
    seen.add(line.id);
    const children = lines
      .filter((c) => c.parentId === line.id && !seen.has(c.id))
      .sort(byName)
      .map(build);
    return children.length
      ? { id: line.id, label: line.name, count: count(line.id, subProductLines(line.id, lines)), ownCount: count(line.id), children, selectable: true }
      : { id: line.id, label: line.name, count: count(line.id) };
  };
  const top = lines
    .filter((l) => !l.parentId || !ids.has(l.parentId))
    .sort(byName)
    .map(build);
  return [...top, ...lines.filter((l) => !seen.has(l.id)).sort(byName).map(build)];
}

/** The Product line and Market filters' options (`tb-org-filters`); with `sites` (a {@link siteFilterTree}), the Sites tree in the Markets' place. */
export interface OrgFilterOptions {
  productLines: FilterListOption[];
  markets: FilterListOption[];
  sites?: FilterListOption[];
}

/**
 * The Product line and Market filters' options, the same in every filter column (`tb-org-filters`): the product lines
 * as their tree ({@link productLineFilterTree}), the markets by their names (their codes: "GVA") — the Organization's
 * own lines and markets alone, never a "No product line" / "No market" option. `lineCount` / `marketCount`: how many
 * of the page's items pass the other filters with that value (`also`: a parent line's subtree too).
 */
export function orgFilterOptions(
  lines: AssetRow[],
  markets: AssetRow[],
  lineCount: (value: string, also?: string[]) => number,
  marketCount: (value: string) => number
): OrgFilterOptions {
  return {
    productLines: productLineFilterTree(lines, lineCount),
    markets: markets.map((m) => ({ id: m.id, label: m.name, count: marketCount(m.id) })),
  };
}

/** A site as a filter and a picker name it: its label with its code (the asset's name) in brackets, so either finds it — the code alone without a label. */
export function siteOptionLabel(site: { name: string; label: string }): string {
  return site.label && site.label !== site.name ? `${site.label} (${site.name})` : site.name;
}

/** The plant tree's parents (never picked: the tree picks plant ids only): all of them, a market, the plants with none. */
const PLANT_TREE_ALL = "all-plants";
const PLANT_TREE_MARKET = "market:";
const PLANT_TREE_NO_MARKET = "no-market";

/** A site as {@link plantTreeOptions} places it: its id, its code (`name`) and label, its market and product line. */
export type PlantTreeSite = Pick<AssetRow, "id" | "name" | "label" | "marketId" | "productLineId">;

/**
 * The plants as a tree, for a `tb-filter-list [treeToggle] [field]` picking
 * plant ids (a user's plants, a fuel code's): "All plants", the markets under
 * it by name, each market's plants by label with their code — a plant's
 * product line after it ("Richmond Lab (4R20) · RMX") — and the plants of no
 * listed market under "No market", last. A market with no plants is left out.
 * A sidebar's Site filter is {@link siteFilterTree}: its root "All sites"
 * (`root`), no product line (`lines: false`: its Product line filter has them).
 */
export function plantTreeOptions(
  sites: PlantTreeSite[],
  markets: { id: string; name: string }[],
  productLines: { id: string; name: string }[],
  { root = "All plants", lines = true }: { root?: string; lines?: boolean } = {}
): FilterListOption[] {
  const lineCode = new Map(productLines.map((l) => [l.id, l.name]));
  const plant = (s: AssetRow): FilterListOption => {
    const line = lines && s.productLineId ? lineCode.get(s.productLineId) : "";
    return { id: s.id, label: line ? `${siteOptionLabel(s)} · ${line}` : siteOptionLabel(s) };
  };
  const byLabel = (a: FilterListOption, b: FilterListOption) => a.label.localeCompare(b.label, undefined, { numeric: true });
  const known = new Set(markets.map((m) => m.id));
  const grouped = markets
    .map((m): FilterListOption => ({ id: `${PLANT_TREE_MARKET}${m.id}`, label: m.name, children: sites.filter((s) => s.marketId === m.id).map(plant).sort(byLabel) }))
    .filter((m) => !!m.children?.length)
    .sort(byLabel);
  const loose = sites
    .filter((s) => !s.marketId || !known.has(s.marketId))
    .map(plant)
    .sort(byLabel);
  const children = [...grouped, ...(loose.length ? [{ id: PLANT_TREE_NO_MARKET, label: "No market", children: loose }] : [])];
  return children.length ? [{ id: PLANT_TREE_ALL, label: root, children }] : [];
}

/**
 * Every sidebar's Site filter, one look on every page (`tb-filter-section heading="Sites"` around `tb-filter-list
 * [treeToggle]="true"`, emptyText "No sites"): the user form's plant tree — "All sites" › each market by its name › its sites by
 * label and code ("Richmond Lab (4R20)"; no product line — a Product line filter has them; those of no market under "No market") —
 * never a Market filter beside it (a market's box picks its sites). It picks site ids alone. A site counts the page's items at it
 * under the other filters (`countAt`), a market and the root the sum of theirs.
 */
export function siteFilterTree(sites: PlantTreeSite[], markets: { id: string; name: string }[], countAt: (siteId: string) => number): FilterListOption[] {
  return countSiteTree(plantTreeOptions(sites, markets, [], { root: "All sites", lines: false }), countAt);
}

/** A {@link siteFilterTree} counted again — its other filters changed while its lists reload (the tree it had kept meanwhile). */
export function countSiteTree(tree: FilterListOption[], countAt: (siteId: string) => number): FilterListOption[] {
  const counted = (o: FilterListOption): FilterListOption => {
    if (!o.children?.length) {
      return { ...o, count: countAt(o.id) };
    }
    const children = o.children.map(counted);
    return { ...o, children, count: children.reduce((sum, c) => sum + (c.count ?? 0), 0) };
  };
  return tree.map(counted);
}

/**
 * A {@link siteFilterTree} counted by items at several sites (a user's plants): each option the items at any of its sites — an
 * item once a branch, however many of its sites it's at (a market's count is never its sites' sum). `items`: each one's sites, or
 * null for one at every site (a regional scope: counted everywhere).
 */
export function countSiteTreeOnce(tree: FilterListOption[], items: Iterable<readonly string[] | null>): FilterListOption[] {
  // Each site's branch: the site and every option over it.
  const branchOf = new Map<string, string[]>();
  const walk = (o: FilterListOption, above: string[]) => {
    const path = [...above, o.id];
    if (o.children?.length) {
      o.children.forEach((c) => walk(c, path));
    } else {
      branchOf.set(o.id, path);
    }
  };
  tree.forEach((o) => walk(o, []));
  const counts = new Map<string, number>();
  let everywhere = 0;
  for (const sites of items) {
    if (!sites) {
      everywhere++;
      continue;
    }
    const touched = new Set(sites.flatMap((id) => branchOf.get(id) ?? []));
    touched.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));
  }
  const counted = (o: FilterListOption): FilterListOption => ({
    ...o,
    ...(o.children?.length ? { children: o.children.map(counted) } : {}),
    count: (counts.get(o.id) ?? 0) + everywhere,
  });
  return tree.map(counted);
}

/** The sites a {@link siteFilterTree} lists (its leaves): a pick of a site no longer there drops out. */
export function siteTreeIds(tree: FilterListOption[]): Set<string> {
  const ids = new Set<string>();
  const walk = (o: FilterListOption) => (o.children?.length ? o.children.forEach(walk) : ids.add(o.id));
  tree.forEach(walk);
  return ids;
}

/** Under a plant tree: how many plants are ticked, of all of them ("9 of 32 plants selected"). */
export function plantsPickedText(picked: number, total: number): string {
  return `${picked} of ${total} ${total === 1 ? "plant" : "plants"} selected`;
}

/**
 * The Sites table's columns, in order (all shown until the user picks with
 * "Customize columns" — the store's `siteColumns`): the product line and the
 * market by their names (their codes), each label in a bubble on hover.
 */
/**
 * An item's users, as the access groups' Members — a site's: those whose own scope is it (its default groups' members); a product
 * line's or a market's: everyone whose scope reaches it (`usersWithin` — a scope spanning several counts under each).
 */
export const ITEM_USERS_COLUMN: DataTableColumn = { key: "users", phone: "trail", header: "Users", sortValue: (row) => row["users"] ?? -1 };
/** A site's devices (the stored count): a count, as Users. (No Groups column: the groups are the access model's own detail.) */
export const SITE_DEVICES_COLUMN: DataTableColumn = { key: "devices", phone: "trail", header: "Devices", sortValue: (row) => row["devices"] ?? -1 };

/** The Product lines and Markets tables' columns: an item's name (its code), label and users. */
export const PRODUCT_LINE_COLUMNS: DataTableColumn[] = [
  { key: "name", phone: "title", header: "Name", emphasis: "strong" },
  { key: "label", phone: "sub", header: "Label", emphasis: "muted" },
  ITEM_USERS_COLUMN,
  CREATED_ON_COLUMN,
];
export const MARKET_COLUMNS: DataTableColumn[] = [
  { key: "name", phone: "title", header: "Name", emphasis: "strong" },
  { key: "label", phone: "sub", header: "Label", emphasis: "muted" },
  ITEM_USERS_COLUMN,
  CREATED_ON_COLUMN,
];

export const SITE_COLUMNS: DataTableColumn[] = [
  { key: "name", phone: "title", header: "Name", emphasis: "strong" },
  { key: "label", phone: "sub", header: "Label", emphasis: "muted" },
  { key: "productLine", phone: "sub", header: "Product line", emphasis: "muted", tooltipKey: "productLineLabel" },
  { key: "market", phone: "sub", header: "Market", emphasis: "muted", tooltipKey: "marketLabel" },
  ITEM_USERS_COLUMN,
  SITE_DEVICES_COLUMN,
  CREATED_ON_COLUMN,
];

/** What the Sites page's filters match on: a site's product line and market ("" = linked to none). */
export type SiteFacet = "productLines" | "markets";

export const SITE_FACETS: SiteFacet[] = ["productLines", "markets"];

/** The Sites page's filters (`tb-site-filters`): the search, and the product lines and markets picked (none: any). */
export interface SiteFilter {
  searchTerms: string[];
  searchText: string;
  /** What the table searches for (the box's terms and its text). */
  search: string[];
  productLines: string[];
  markets: string[];
}

export const NO_SITE_FILTER: SiteFilter = { searchTerms: [], searchText: "", search: [], productLines: [], markets: [] };

/** The Settings page's Organization: a group of the section menu, a page per list. */
export const ORGANIZATION_SECTION: SectionNavItem = {
  id: "organization",
  label: "Organization",
  icon: "domain",
  // Sites first — the page the group opens on — then Markets, then Product lines.
  children: [
    { id: "sites", label: "Sites", icon: "factory" },
    { id: "markets", label: "Markets", icon: "storefront" },
    { id: "productLines", label: "Product lines", icon: "category" },
  ],
};

/** The list an Organization page shows (by its section id), or null for any other section. */
export function organizationKindOf(section: string): AssetKind | null {
  return section === "productLines" ? "productLine" : section === "markets" ? "market" : section === "sites" ? "site" : null;
}
