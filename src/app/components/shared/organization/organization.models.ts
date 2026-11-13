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
}

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

/** The Product line and Market filters' options (`tb-org-filters`). */
export interface OrgFilterOptions {
  productLines: FilterListOption[];
  markets: FilterListOption[];
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

/**
 * The Sites table's columns, in order (all shown until the user picks with
 * "Customize columns" — the store's `siteColumns`): the product line and the
 * market by their names (their codes), each label in a bubble on hover.
 */
/**
 * An item's users, as the access groups' Members — a site's: those whose own scope is it (its default groups' members); a product
 * line's or a market's: everyone whose scope reaches it (`usersWithin` — a scope spanning several counts under each).
 */
export const ITEM_USERS_COLUMN: DataTableColumn = { key: "users", header: "Users", sortValue: (row) => row["users"] ?? -1 };
/** A site's devices (the stored count): a count, as Users. (No Groups column: the groups are the access model's own detail.) */
export const SITE_DEVICES_COLUMN: DataTableColumn = { key: "devices", header: "Devices", sortValue: (row) => row["devices"] ?? -1 };

/** The Product lines and Markets tables' columns: an item's name (its code), label and users. */
export const PRODUCT_LINE_COLUMNS: DataTableColumn[] = [
  { key: "name", header: "Name", emphasis: "strong" },
  { key: "label", header: "Label", emphasis: "muted" },
  ITEM_USERS_COLUMN,
  CREATED_ON_COLUMN,
];
export const MARKET_COLUMNS: DataTableColumn[] = [
  { key: "name", header: "Name", emphasis: "strong" },
  { key: "label", header: "Label", emphasis: "muted" },
  ITEM_USERS_COLUMN,
  CREATED_ON_COLUMN,
];

export const SITE_COLUMNS: DataTableColumn[] = [
  { key: "name", header: "Name", emphasis: "strong" },
  { key: "label", header: "Label", emphasis: "muted" },
  { key: "productLine", header: "Product line", emphasis: "muted", tooltipKey: "productLineLabel" },
  { key: "market", header: "Market", emphasis: "muted", tooltipKey: "marketLabel" },
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
