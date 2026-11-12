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

import { Component, DoCheck, EventEmitter, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { SelectComponent, TbSelectOption } from "../../select/select.component";
import { IconBadgeComponent } from "../../icon-badge/icon-badge.component";
import { AssetRow, lineWithin, productLineOptions, siteOptionLabel } from "../../organization/organization.models";
import { ACCESS_SCOPE_TYPES, AccessScopeChoice, AccessScopeType, EVERYTHING, TENANT_SCOPE_TYPE, USER_SCOPE_TYPES, scopeChoiceComplete } from "../access.models";

/** The scope types offered, a select's options: an access group's; a user's (the Tenant scope too); a Tenant scope user's own (fixed). */
const SCOPE_TYPE_OPTIONS: Record<"access" | "user" | "tenant", TbSelectOption[]> = {
  access: ACCESS_SCOPE_TYPES.map((t) => ({ value: t.id, label: t.label })),
  user: USER_SCOPE_TYPES.map((t) => ({ value: t.id, label: t.label })),
  tenant: [{ value: TENANT_SCOPE_TYPE.id, label: TENANT_SCOPE_TYPE.label }],
};

/**
 * A scope, by type (the group and user forms' — a select, the type's icon
 * before it): regional — the access
 * owner's whole organization — a product line, a market (optionally one
 * product line's plants in it), or a plant; with a line on what it covers (or
 * what's still to pick). Its fields keep the hierarchy's order — product line,
 * market, plant: a product line narrows the markets offered (those with its
 * plants — a sub line's too), and for a plant the product line and the market
 * (both part of its scope) narrow the plants offered; picking a plant first
 * fills them in. The form keeps the {@link choice} and gets each change from
 * {@link choiceChange}.
 *
 * ```html
 * <tb-access-scope-picker [choice]="scope" [productLines]="…" [markets]="…" [sites]="…" (choiceChange)="scope = $event"></tb-access-scope-picker>
 * ```
 */
@Component({
  selector: "tb-access-scope-picker",
  templateUrl: "./access-scope-picker.component.html",
  styleUrls: ["./access-scope-picker.component.scss"],
  standalone: true,
  imports: [CommonModule, FormsModule, SelectComponent, IconBadgeComponent],
})
export class AccessScopePickerComponent implements DoCheck {
  @Input() choice: AccessScopeChoice = { type: "all", scope: EVERYTHING };
  /** The label over the type ("Scope"; none: no label). */
  @Input() label = "";
  /** The Organization's lists (the choices). */
  @Input() productLines: AssetRow[] = [];
  @Input() markets: AssetRow[] = [];
  @Input() sites: AssetRow[] = [];
  /**
   * The scope types offered: `access` — an access group's (regional, product line, market, plant); `user` — a user's, the
   * Tenant scope too, above them (a tenant-level user of ThingsBoard — a tenant administrator's view; an existing user
   * picking it, or leaving it, moves between the owner and the tenant); `tenant` — a Tenant scope user's own, shown fixed
   * (a viewer who can't move them: their own record).
   */
  @Input() types: "access" | "user" | "tenant" = "access";
  @Output() choiceChange = new EventEmitter<AccessScopeChoice>();

  get typeOptions(): TbSelectOption[] {
    return SCOPE_TYPE_OPTIONS[this.types];
  }
  /** The product lines (a sub line after its parent); the market type's filter, "All product lines" first. */
  productLineOptions: TbSelectOption[] = [];
  productLineFilterOptions: TbSelectOption[] = [];
  /** The markets offered — those with plants in the product line picked, if any. */
  marketOptions: TbSelectOption[] = [];
  /** The plants offered: those of the product line and market picked (and the one picked, always). */
  siteOptions: TbSelectOption[] = [];
  private seen: { productLines?: AssetRow[]; markets?: AssetRow[]; sites?: AssetRow[]; scope?: string } = {};

  ngDoCheck(): void {
    const s = this.seen;
    const key = `${this.choice.type}|${JSON.stringify(this.choice.scope)}`;
    if (s.productLines !== this.productLines) {
      this.productLineOptions = productLineOptions(this.productLines);
      this.productLineFilterOptions = [{ value: "", label: "All product lines" }, ...this.productLineOptions];
    }
    if (s.productLines !== this.productLines || s.markets !== this.markets || s.sites !== this.sites || s.scope !== key) {
      const sc = this.choice.scope;
      const line = sc.productLineId ?? "";
      const inLine = (x: AssetRow) => !line || lineWithin(x.productLineId, line, this.productLines);
      const linesMarkets = new Set(this.sites.filter(inLine).map((x) => x.marketId));
      this.marketOptions = this.markets
        .filter((m) => !line || linesMarkets.has(m.id) || m.id === sc.marketId)
        .map((a) => ({ value: a.id, label: a.label || a.name }));
      const picked = sc.siteIds[0];
      this.siteOptions = this.sites
        .filter((x) => x.id === picked || (inLine(x) && (!sc.marketId || x.marketId === sc.marketId)))
        .map((a) => ({ value: a.id, label: siteOptionLabel(a) }))
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
    }
    this.seen = { productLines: this.productLines, markets: this.markets, sites: this.sites, scope: key };
  }

  /** The type picked, as its icon (before the type's options). */
  get typeIcon(): string {
    return USER_SCOPE_TYPES.find((t) => t.id === this.choice.type)?.icon ?? "public";
  }

  /**
   * Under the scope: all the devices in what's picked — a product line and a
   * market by their names (codes), a plant by its label: "All devices in GVA
   * (RMX)."; "" until it's picked.
   */
  get hint(): string {
    if (!scopeChoiceComplete(this.choice)) {
      return "";
    }
    const sc = this.choice.scope;
    const code = (rows: AssetRow[], id: string | null) => rows.find((r) => r.id === id)?.name ?? "";
    switch (this.choice.type) {
      case "tenant":
        return "All of the tenant, ThingsBoard's own pages included.";
      case "productLine":
        return `All devices in ${code(this.productLines, sc.productLineId)}.`;
      case "market":
        return `All devices in ${code(this.markets, sc.marketId)}${sc.productLineId ? ` (${code(this.productLines, sc.productLineId)})` : ""}.`;
      case "site": {
        const site = this.sites.find((r) => r.id === sc.siteIds[0]);
        return `All devices in ${site ? site.label || site.name : "the plant"}.`;
      }
      default:
        return "All devices in the region.";
    }
  }

  /** Another type: it starts with nothing picked. */
  setType(type: string): void {
    if (type !== this.choice.type) {
      this.emit(type as AccessScopeType, { productLineId: null, marketId: null, siteIds: [] });
    }
  }

  /**
   * The scope's product line (the Product line type's; the Market type's
   * filter; a plant's): a market no longer holding its plants goes — and a
   * plant no longer under it.
   */
  setProductLine(id: string): void {
    const sc = this.choice.scope;
    const line = id || null;
    const keepMarket = !line || !sc.marketId || this.sites.some((x) => lineWithin(x.productLineId, line, this.productLines) && x.marketId === sc.marketId);
    const site = this.siteOf(sc.siteIds[0]);
    const keepSite = !!site && (!line || lineWithin(site.productLineId, line, this.productLines));
    this.emit(this.choice.type, { productLineId: line, marketId: keepMarket ? sc.marketId : null, siteIds: keepSite ? [...sc.siteIds] : [] });
  }

  /** The scope's market (a plant no longer in it goes). */
  setMarket(id: string): void {
    const sc = this.choice.scope;
    const site = this.siteOf(sc.siteIds[0]);
    const keepSite = !!site && (!id || site.marketId === id);
    this.emit(this.choice.type, { ...sc, marketId: id || null, siteIds: keepSite ? [...sc.siteIds] : [] });
  }

  /** The plant: its product line and market filled in where they aren't picked yet. */
  setSite(id: string): void {
    const sc = this.choice.scope;
    const site = this.siteOf(id);
    if (!site) {
      this.emit("site", { ...sc, siteIds: [] });
      return;
    }
    const productLineId = sc.productLineId && lineWithin(site.productLineId, sc.productLineId, this.productLines) ? sc.productLineId : (site.productLineId ?? null);
    this.emit("site", { productLineId, marketId: site.marketId ?? sc.marketId, siteIds: [site.id] });
  }

  private siteOf(id: string | undefined): AssetRow | undefined {
    return id ? this.sites.find((x) => x.id === id) : undefined;
  }

  private emit(type: AccessScopeType, scope: AccessScopeChoice["scope"]): void {
    this.choiceChange.emit({ type, scope });
  }
}
