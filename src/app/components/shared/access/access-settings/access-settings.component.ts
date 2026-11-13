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

import { Component, DoCheck, Input, OnChanges, SimpleChanges, ViewChild } from "@angular/core";
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";
import { DataTableCellDirective, DataTableColumn, DataTableComponent } from "../../data-table/data-table.component";
import { TableManage } from "../../data-table/table-manage";
import { TableLinkComponent, TableLinksComponent } from "../../table-links/table-links.component";
import { TableCountComponent } from "../../table-count/table-count.component";
import { StatusPillComponent } from "../../status-pill/status-pill.component";
import { TipDirective } from "../../tip/tip.directive";
import { createdCells, formatDateTime } from "../../time-format";
import { AssetKind, AssetRow, productLineTree } from "../../organization/organization.models";
import {
  ACCESS_ACTION_ROWS,
  ACCESS_HEALTH_COLUMNS,
  ACCESS_MATRIX_ROLE,
  AccessHealthCheck,
  ACCESS_SCOPE_TYPES,
  TENANT_SCOPE_TYPE,
  AccessGroup,
  AccessPage,
  AccessRole,
  AccessScope,
  AccessUser,
  EVERYTHING,
  accessMatrixColumns,
  accessScopeType,
  completeScope,
  itemScope,
  roleScopeText,
  scopeKey,
  scopeLabel,
  scopeShortName,
} from "../access.models";
import { AccessStore } from "../access-store";
import { DashboardLoadingComponent, FirstLoads, firstLoadsOf } from "../../dashboard-loading/dashboard-loading.component";

/**
 * The Settings page's Access (shared by the dashboards), a list each
 * ({@link page}). The **Users** page holds two, switched by the button group
 * atop its filters ("Users | Groups", `tb-access-filters`): the **users** —
 * the access owner's, with their groups; a row opens one (its details, and
 * Manage: log in as them, activation, sign-in, delete), "Create new" adds one
 * — and the access **groups** — each a scope (its type, product line,
 * market and plant a column each: "All" where it takes every one) and a
 * level; a row edits one, the footer is "Create new | Manage | Sync all".
 * Then the **Roles** — the templates of access: what
 * each may do, where it applies (each item there
 * has a default group of it), its groups and members; a row edits one,
 * "Create new" adds one. Everything is done by the {@link AccessStore};
 * its panels and dialogs show with `tb-access-panels` in the dashboard root.
 */
@Component({
  selector: "tb-access-settings",
  templateUrl: "./access-settings.component.html",
  styleUrls: ["./access-settings.component.scss"],
  standalone: true,
  imports: [
    DashboardLoadingComponent,
    CommonModule,
    SharedModule,
    DataTableCellDirective,
    DataTableComponent,
    TableLinkComponent,
    TableLinksComponent,
    StatusPillComponent,
    TableCountComponent,
    TipDirective,
  ],
})
export class AccessSettingsComponent implements OnChanges, DoCheck {
  /** The loading page: the groups, the users, each the first time it shows (kept on the store: the component is made anew per visit). */
  get firstLoads(): FirstLoads {
    return firstLoadsOf(this.store);
  }

  @Input() store!: AccessStore;
  @Input() page: AccessPage = "groups";

  groupRows: Record<string, any>[] = [];
  /**
   * The Groups table as a matrix (its "Matrix" switch): the same table, its
   * rows the scope items (regional, the product lines, the markets, the
   * plants — the list's own scope columns) and a column a role — a cell the
   * item's default group of the role, its members.
   */
  matrixRows: Record<string, any>[] = [];
  /** The matrix's columns: the scope columns the list shows, then the roles the filter lets through. */
  matrixColumns: DataTableColumn[] = [];
  /** Every column the matrix can be sorted by (a role filtered out keeps its sort). */
  matrixSortable: DataTableColumn[] = [];
  userRows: Record<string, any>[] = [];
  roleRows: Record<string, any>[] = [];
  /** Access › Health: a row a check — its failing items counted; fine ones last. */
  healthRows: Record<string, any>[] = [];
  readonly healthColumns = ACCESS_HEALTH_COLUMNS;
  private seenHealth?: AccessHealthCheck[];

  /** Managing the groups (check boxes; the footer: Delete, Select all, Done), and the checked rows. */
  readonly manage = new TableManage(
    () => this.groupsTable,
    () => this.store.groups.length
  );
  /** Similarity grouping: the cells a scope's groups share — on its summary row, blank on the groups under it. */
  readonly sharedScopeColumns = ["scope", "productLine", "market", "plant"];

  /**
   * Similarity grouping: a scope's summary row — named after the scope (its
   * default groups' name before the level: "Richmond Lab", "GVA (RMX)"), its
   * scope's type, product line, market and plant, its groups' members
   * summed; "Created on" a dash, and a column its groups differ in (the
   * level) too.
   */
  readonly groupSummary = (rows: Record<string, any>[]): Record<string, any> => {
    const first = rows[0];
    const same = (key: string) => rows.every((r) => r[key] === first[key]);
    return {
      summary: true,
      name: first["scopeName"],
      scope: first["scope"],
      scopeIcon: first["scopeIcon"],
      scopeOrder: first["scopeOrder"],
      scopeText: first["scopeText"],
      productLine: first["productLine"],
      market: first["market"],
      plant: first["plant"],
      productLineLabel: first["productLineLabel"],
      marketLabel: first["marketLabel"],
      plantLabel: first["plantLabel"],
      level: same("level") ? first["level"] : "—",
      levelIcon: same("level") ? first["levelIcon"] : "",
      members: rows.reduce((n, r) => n + (Number(r["members"]) || 0), 0),
      created: "—",
      createdTime: null,
    };
  };
  @ViewChild("groupsTable") private groupsTable?: DataTableComponent;

  private seen: {
    groups?: AccessGroup[];
    users?: AccessUser[];
    sites?: unknown;
    markets?: unknown;
    productLines?: unknown;
    groupColumns?: unknown;
    filter?: unknown;
    userFilter?: unknown;
    roles?: unknown;
    roleFilter?: unknown;
  } = {};

  /** Another list (the Users page's Users / Groups, Roles): its columns and sort as the user picked them (read once); the groups leave Manage. */
  ngOnChanges(changes: SimpleChanges): void {
    if (changes["page"] || changes["store"]) {
      this.store?.columnsOf(this.page).load();
      this.store?.savedSortOf(this.page).load();
      if (this.page === "groups") {
        this.store?.groupSimilar.load();
        this.store?.groupMatrix.load();
        this.store?.groupMatrixSort.load();
      }
      if (this.page === "health") {
        // The devices, for the checks on their names.
        this.store?.loadHealthDevices();
      }
    }
    if (changes["page"] && !changes["page"].firstChange && this.manage.managing) {
      this.manage.end();
    }
  }

  ngDoCheck(): void {
    const s = this.store;
    if (!s) {
      return;
    }
    // The matrix has nothing to manage (its rows are scope items).
    if (this.matrix && this.manage.managing) {
      this.manage.end();
    }
    // The checks (their own cache says when they change): failing ones first, by how bad.
    const health = this.page === "health" ? s.health : this.seenHealth;
    if (health && health !== this.seenHealth) {
      this.seenHealth = health;
      const order = { error: 0, warning: 1, info: 2 };
      this.healthRows = health
        .map((c) => {
          const n = c.items.length;
          return {
            id: c.id,
            check: c,
            label: c.label,
            count: n,
            order: n ? order[c.severity] : 3,
            status: n ? (c.severity === "error" ? "Fix" : c.severity === "warning" ? "Check" : "Note") : "OK",
            tone: n ? (c.severity === "error" ? "error" : c.severity === "warning" ? "warning" : "neutral") : "success",
            icon: n ? (c.severity === "error" ? "error" : c.severity === "warning" ? "warning" : "info") : "check_circle",
          };
        })
        .sort((a, b) => a.order - b.order || b.count - a.count);
    }
    const org = s.org;
    const changed =
      s.groups !== this.seen.groups ||
      s.users !== this.seen.users ||
      org.sites.rows !== this.seen.sites ||
      org.markets.rows !== this.seen.markets ||
      org.productLines.rows !== this.seen.productLines ||
      s.groupColumns.visible !== this.seen.groupColumns ||
      s.groupFilter !== this.seen.filter ||
      s.userFilter !== this.seen.userFilter ||
      s.roles !== this.seen.roles ||
      s.roleFilter !== this.seen.roleFilter;
    if (!changed) {
      return;
    }
    const names = new Map<string, string>();
    const codes = new Map<string, string>();
    [...org.productLines.rows, ...org.markets.rows, ...org.sites.rows].forEach((a) => {
      names.set(a.id, a.label || a.name);
      codes.set(a.id, a.name);
    });
    /** An asset by its name (its code), its label for the bubble ("" when it's the name, or none): "All" where the scope takes every one. */
    const coded = (rows: AssetRow[], ids: (string | null | undefined)[]): { text: string; label: string } => {
      const set = ids.filter((id): id is string => !!id);
      if (!set.length) {
        return { text: "All", label: "" };
      }
      const assets = set.map((id) => rows.find((x) => x.id === id));
      const label = assets.map((a) => (a ? a.label || a.name : "—")).join(", ");
      const text = assets.map((a) => (a ? a.name : "—")).join(", ");
      return { text, label: label === text ? "" : label };
    };
    const codedCells = (scope: AccessScope) => {
      // Several plants (a user's): their product lines and markets.
      const plants = scope.siteIds.length > 1 ? org.sites.rows.filter((x) => scope.siteIds.includes(x.id)) : [];
      const of = (key: "productLineId" | "marketId", own: string | null) => (plants.length ? [...new Set(plants.map((p) => p[key]))] : [own]);
      const line = coded(org.productLines.rows, of("productLineId", scope.productLineId));
      const market = coded(org.markets.rows, of("marketId", scope.marketId));
      const plant = coded(org.sites.rows, scope.siteIds);
      return {
        productLine: line.text,
        market: market.text,
        plant: plant.text,
        productLineLabel: line.label,
        marketLabel: market.label,
        plantLabel: plant.label,
      };
    };
    /**
     * A scope's cells: its type (icon, order, in words), and its product line, market and plant — each by its name (its code), the
     * label for the bubble (`productLineLabel`, …) — "All" where it takes every one; none: "—".
     */
    const scopeCells = (raw: AccessScope | null) => {
      if (!raw) {
        return {
          scope: "—",
          scopeKey: "",
          scopeName: "",
          scopeIcon: "",
          scopeOrder: ACCESS_SCOPE_TYPES.length,
          scopeText: "",
          productLine: "—",
          market: "—",
          plant: "—",
          productLineLabel: "",
          marketLabel: "",
          plantLabel: "",
        };
      }
      // A plant's product line and market as it now has them (older plant scopes named neither).
      const scope = completeScope(raw, org.sites.rows, org.productLines.rows);
      const type = ACCESS_SCOPE_TYPES.find((t) => t.id === accessScopeType(scope)) ?? ACCESS_SCOPE_TYPES[0];
      return {
        scope: type.label,
        // The scope itself (its type and ids) — the groups' similarity grouping: one scope, one group.
        scopeKey: [type.id, scope.productLineId ?? "", scope.marketId ?? "", [...scope.siteIds].sort().join(",")].join("|"),
        // Its own name (its default groups' before the level) — its summary row's.
        scopeName: scopeShortName(scope, (id) => codes.get(id) ?? "—", (id) => names.get(id) ?? "—"),
        scopeIcon: type.icon,
        scopeOrder: ACCESS_SCOPE_TYPES.indexOf(type),
        scopeText: scopeLabel(scope, (id) => names.get(id) ?? "—"),
        ...codedCells(scope),
      };
    };
    // The groups the filters let through (the sidebar's column; the default groups only while shown).
    this.groupRows = s.groups
      .filter((g) => s.groupPasses(g))
      .map((g) => ({
        id: g.id,
        group: g,
        name: g.name,
        description: g.description,
        ...scopeCells(g.scope),
        level: s.levelLabel(g.level),
        levelIcon: s.levelIcon(g.level),
        members: g.members.length,
        ...createdCells(g.createdTime),
      }));
    // The matrix: the scope items the Scope, Product line and Market filters let through — named as the similarity grouping's rows, with the
    // list's scope cells — and, a role, its default group there: its members (none there: no count).
    const defaults = new Map<string, AccessGroup>();
    s.groups.filter((g) => g.auto).forEach((g) => defaults.set(`${scopeKey(g.scope)}|${g.level}`, g));
    const matrixRow = (kind: AssetKind | null, asset: AssetRow | null): Record<string, any> | null => {
      const scope = kind && asset ? itemScope(kind, asset) : EVERYTHING;
      if (!s.scopePasses(scope)) {
        return null;
      }
      const cells = scopeCells(scope);
      const row: Record<string, any> = { id: asset?.id ?? "regional", kind, asset, name: cells.scopeName, ...cells, groups: {} as Record<string, AccessGroup> };
      for (const r of s.roles) {
        const group = defaults.get(`${scopeKey(scope)}|${r.id}`);
        row[`${ACCESS_MATRIX_ROLE}${r.id}`] = group ? group.members.length : null;
        if (group) {
          row["groups"][r.id] = group;
        }
      }
      return row;
    };
    const byName = (a: AssetRow, b: AssetRow) => (a.label || a.name).localeCompare(b.label || b.name, undefined, { numeric: true });
    this.matrixRows = [
      matrixRow(null, null),
      ...productLineTree(org.productLines.rows).map((l) => matrixRow("productLine", l)),
      ...[...org.markets.rows].sort(byName).map((m) => matrixRow("market", m)),
      ...[...org.sites.rows].sort(byName).map((x) => matrixRow("site", x)),
    ].filter((r): r is Record<string, any> => !!r);
    this.matrixSortable = accessMatrixColumns(s.roles);
    this.matrixColumns = accessMatrixColumns(
      s.roles.filter((r) => !s.groupFilter.levels.length || s.groupFilter.levels.includes(r.id)),
      s.groupColumns.keys
    );
    const groupName = new Map(s.groups.map((g) => [g.id, g.name]));
    // The hand-made groups (the column's): a user's default group shows in their scope and level.
    const handMade = new Set(s.groups.filter((g) => !g.auto).map((g) => g.id));
    // The users the filters let through (the sidebar's column).
    // A Tenant scope user's scope cells: the tenant, over every product line, market and plant — first when sorted.
    const tenantCells = {
      ...scopeCells(null),
      scope: TENANT_SCOPE_TYPE.label,
      scopeIcon: TENANT_SCOPE_TYPE.icon,
      scopeOrder: -1,
      scopeText: TENANT_SCOPE_TYPE.label,
      productLine: "All",
      market: "All",
      plant: "All",
    };
    // A Tenant scope user's access groups: their other tenant user groups, by name.
    const tenantGroupName = new Map(s.tenantGroups.map((g) => [g.id, g.name]));
    const tenantGroupNames = (u: AccessUser) => s.tenantAccessGroupsOf(u).map((id) => tenantGroupName.get(id) ?? "").filter(Boolean);
    this.userRows = s.users.filter((u) => s.userPasses(u)).map((u) => ({
      id: u.id,
      user: u,
      name: u.name,
      email: u.email,
      ...(u.tenant ? tenantCells : scopeCells(u.scope)),
      // Their role: their level's — a Tenant scope user's, their tenant user group.
      level: s.userRoleLabel(u),
      levelIcon: s.userRoleIcon(u),
      // Their hand-made groups as pills ("No access": in no group at all — a Tenant scope user has none of the owner's); the text for the
      // search and the sort.
      groupList: u.tenant ? tenantGroupNames(u) : u.groupIds.filter((id) => handMade.has(id)).map((id) => groupName.get(id) ?? "").filter(Boolean),
      noAccess: !u.tenant && !u.groupIds.length,
      groups: u.tenant
        ? tenantGroupNames(u).join(", ")
        : u.groupIds.filter((id) => handMade.has(id)).map((id) => groupName.get(id) ?? "").filter(Boolean).join(", ") || (u.groupIds.length ? "" : "No access"),
      lastLogin: u.lastLoginTs ? formatDateTime(u.lastLoginTs) : "Never",
      lastLoginTs: u.lastLoginTs,
      ...createdCells(u.createdTime),
      status: !u.enabled
        ? { label: "Disabled", icon: "block", tone: "neutral" }
        : !u.activated
          ? { label: "Not activated", icon: "schedule", tone: "warning" }
          : { label: "Active", icon: "check_circle", tone: "success" },
    }));
    // The roles: what each may do (its actions in words), where it applies, its groups and their members.
    const search = s.roleFilter.search.map((t) => t.toLowerCase());
    this.roleRows = s.roles
      .filter((r) => s.rolePasses(r))
      .map((r) => this.roleRow(r))
      .filter((row) => !search.length || search.every((t) => `${row["name"]} ${row["description"]} ${row["permissions"]} ${row["appliesTo"]}`.toLowerCase().includes(t)));
    this.seen = {
      roles: s.roles,
      roleFilter: s.roleFilter,
      groups: s.groups,
      users: s.users,
      sites: org.sites.rows,
      markets: org.markets.rows,
      productLines: org.productLines.rows,
      groupColumns: s.groupColumns.visible,
      filter: s.groupFilter,
      userFilter: s.userFilter,
    };
    this.manage.keep(new Set(s.groups.map((g) => g.id)));
  }

  /** The Groups table shows as a matrix (the "Matrix" switch atop its filters). */
  get matrix(): boolean {
    return this.page === "groups" && this.store.groupMatrix.on;
  }

  /** A row: its group's panel — the matrix's, its scope item's ("Regional" is no item). */
  onGroupRow(row: Record<string, any>): void {
    if (this.matrix) {
      if (row["kind"] && row["asset"]) {
        this.store.org.openEdit(row["kind"] as AssetKind, row["asset"] as AssetRow);
      }
    } else if (!this.manage.managing) {
      this.store.openEditGroup(row["group"] as AccessGroup);
    }
  }

  /** The matrix's count (a role's column): the item's group of that role, on its Members tab. */
  openMatrixMembers(e: { row: Record<string, any>; column: DataTableColumn }): void {
    const group = (e.row["groups"] as Record<string, AccessGroup> | undefined)?.[e.column.key.slice(ACCESS_MATRIX_ROLE.length)];
    if (group) {
      this.store.openGroupMembers(group);
    }
  }

  /** A row's Members count: its panel on the Members tab (not the row's own click). */
  openMembers(row: Record<string, any>): void {
    if (!this.manage.managing) {
      this.store.openGroupMembers(row["group"] as AccessGroup);
    }
  }

  onUserRow(row: Record<string, any>): void {
    this.store.openUser(row["user"] as AccessUser);
  }

  /** A check's row: its failing items, in its panel (a fine one has none to show). */
  onHealthRow(row: Record<string, any>): void {
    const check = row["check"] as AccessHealthCheck;
    if (check.items.length) {
      this.store.openHealth(check);
    }
  }

  onRoleRow(row: Record<string, any>): void {
    this.store.openEditRole(row["role"] as AccessRole);
  }

  /** A role's row. */
  private roleRow(r: AccessRole): Record<string, any> {
    const s = this.store;
    const groups = s.roleGroups(r);
    const members = new Set(groups.flatMap((g) => g.members)).size;
    // Its actions in words, a row each: "Devices: view, edit, control".
    const permissions = ACCESS_ACTION_ROWS.map((row) => {
      const on = (["view", "edit", "control"] as const).filter((k) => !!row[k] && r.actions.includes(row[k]!));
      return on.length ? `${row.label}: ${on.join(", ")}` : "";
    }).filter(Boolean);
    return {
      id: r.id,
      role: r,
      name: r.label,
      icon: r.icon,
      default: r.default,
      description: r.description || "—",
      permissionList: permissions,
      permissions: permissions.join("; ") || "None",
      actionCount: r.actions.length,
      appliesTo: roleScopeText(r),
      groups: `${groups.length}`,
      groupCount: groups.length,
      members,
      ...createdCells(r.createdTime),
    };
  }

  askDeleteSelected(): void {
    if (this.manage.selected.length) {
      this.store.askDeleteGroups(this.manage.selected.map((r) => r["group"] as AccessGroup));
    }
  }
}
