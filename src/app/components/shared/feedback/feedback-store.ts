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
import { Observable, Subject, forkJoin, of, throwError } from "rxjs";
import { catchError, debounceTime, finalize, map, mergeMap, switchMap, toArray } from "rxjs/operators";
import { defaultHttpOptionsFromConfig } from "@core/public-api";
import { WidgetContext } from "@home/models/widget-component.models";
import { AliasFilterType, EntityFilter, EntityType } from "@shared/public-api";
import { subscribeLatestChanges } from "../dashboard/dashboard-subscriptions";
import { ToastsComponent } from "../toasts/toasts.component";
import { PanelTrail } from "../panel-trail/panel-trail";
import { SavedColumnChoice, SavedTableSort } from "../dashboard/table-columns";
import { OrganizationStore } from "../organization/organization-store";
import { AssetRow } from "../organization/organization.models";
import { QUIET_REQUEST, apiMessage, parseObject } from "../value-utils";
import { formatDateTime } from "../time-format";
import {
  FEEDBACK_ASSET_NAME,
  FEEDBACK_EMAIL_KEY,
  FEEDBACK_FROM_KEY,
  FEEDBACK_KEY,
  FEEDBACK_REVIEW_KEY,
  FEEDBACK_COLUMNS,
  FEEDBACK_FACETS,
  FEEDBACK_SHOT_KEY,
  FeedbackEntry,
  FeedbackFacet,
  FeedbackFilter,
  NO_FEEDBACK_FILTER,
  FeedbackReview,
  FeedbackStatus,
  browserOf,
  decodeFeedbackItem,
  feedbackStatusOf,
  feedbackTypeOf,
  safeUrl,
} from "./feedback.models";

interface TsPoint {
  ts: number;
  value: unknown;
}

/** The Feedback table's columns a saved sort may name. */
const FEEDBACK_SORT_KEYS = FEEDBACK_COLUMNS.map((c) => c.key);

/** A sender: their name, and their scope's product line and market (the access model's attributes on the user; none — the tenant's, a regional one). */
export interface FeedbackSender {
  name: string;
  productLineId: string;
  marketId: string;
}
/** How many items the page reads (the newest). */
const FEEDBACK_LIMIT = 1000;

/**
 * Home's Settings › Feedback (tenant administrators'): what users sent from
 * the dashboards, as the Feedback rule chain keeps it on the Feedback asset —
 * newest first — each one's screenshot read when its panel opens, its status
 * (New, Reviewed, Done: the asset's `feedbackReview`) set there, and Delete.
 * The table is `tb-feedback-settings`, the panel `tb-feedback-panels` (in the
 * dashboard root).
 */
export class FeedbackStore {
  loading = false;
  /** No Feedback asset (the rule chain isn't installed, or nothing was ever sent). */
  missing = false;
  error = "";
  entries: FeedbackEntry[] = [];
  private assetId: string | null = null;
  /** The senders, by user id (read once each): their names and scopes. */
  private readonly senders = new Map<string, FeedbackSender>();
  /** Bumped as senders come in (the table and the filters rebuild). */
  sendersVersion = 0;
  readonly sort: SavedTableSort;
  /** The table's "Customize columns", kept in the user's settings; the picker open beside the filters. */
  readonly columns: SavedColumnChoice;
  columnPickerOpen = false;
  /** The filters (`tb-feedback-filters`): the table shows what passes. */
  filter: FeedbackFilter = NO_FEEDBACK_FILTER;
  /** The Organization (Home's): the product lines' and markets' names, for the senders' scopes. */
  org: OrganizationStore | null = null;

  // -- the panel
  panelOpen = false;
  selected: FeedbackEntry | null = null;
  /** The selected one's screenshot (a data URL): read as its panel opens; null — none, or not in yet. */
  shot: string | null = null;
  shotLoading = false;
  saving = false;
  /** The items "Delete" asks about (one from the panel, several from Manage). */
  deleteConfirm: FeedbackEntry[] = [];
  /** The side panels' trail (the Access store's): opening this panel closes the others'. */
  private trailRef: PanelTrail | null = null;
  /** The live subscription to the asset's newest item (once loaded): a new one, a delete — the list read again. Remove it with the dashboard. */
  subscription: { id: string } | null = null;
  private readonly arrived = new Subject<void>();
  private watching = false;

  constructor(
    private readonly ctx: WidgetContext,
    private readonly destroyRef: DestroyRef,
    private readonly notices: ToastsComponent | undefined,
    private readonly changed: () => void
  ) {
    this.sort = new SavedTableSort("feedbackSort", () => FEEDBACK_SORT_KEYS, ctx, destroyRef, changed, { key: "received", direction: "desc" });
    this.columns = new SavedColumnChoice(FEEDBACK_COLUMNS, "feedbackColumns", ctx, destroyRef, changed);
    this.arrived.pipe(debounceTime(1500), takeUntilDestroyed(destroyRef)).subscribe(() => this.load());
  }

  /** The items not looked at yet (New): the badge on Settings › Feedback in Home's rail. */
  get unread(): number {
    return this.entries.reduce((n, e) => n + (e.status === "new" ? 1 : 0), 0);
  }

  set trail(trail: PanelTrail) {
    this.trailRef = trail;
    trail.join(this, () => this.closePanel());
  }

  /** The items, again: the asset, its points (the screenshots left out), their reviews and senders. */
  load(): void {
    this.loading = true;
    this.error = "";
    this.findAsset()
      .pipe(
        switchMap((id) => {
          this.assetId = id;
          this.missing = !id;
          return id ? forkJoin([this.readPoints(id), this.readReviews(id)]) : of(null);
        }),
        switchMap((read) => (read ? this.withSenders(read[0]).pipe(map(() => read)) : of(null))),
        finalize(() => {
          this.loading = false;
          this.changed();
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (read) => {
          this.entries = read ? this.toEntries(read[0], read[1]) : [];
          this.watch();
          // The open one, as now stored.
          if (this.selected) {
            this.selected = this.entries.find((e) => e.ts === this.selected?.ts) ?? null;
            this.panelOpen = this.panelOpen && !!this.selected;
          }
        },
        error: (err) => {
          this.entries = [];
          this.error = `Feedback not loaded${apiMessage(err)}`;
        },
      });
  }

  /** The sender's name (their user's, else the name the item gave, else their email). */
  senderName(e: FeedbackEntry): string {
    return this.senders.get(e.fromId)?.name || e.item?.name || e.email || "Unknown";
  }

  /** The app it was sent from ("" — sent before that was kept). */
  appOf(e: FeedbackEntry): string {
    return e.item?.app ?? "";
  }

  /** The sender's product line and market (their scope's; null — none). */
  lineOf(e: FeedbackEntry): AssetRow | null {
    const id = this.senders.get(e.fromId)?.productLineId;
    return (id && this.org?.productLines.rows.find((r) => r.id === id)) || null;
  }

  marketOf(e: FeedbackEntry): AssetRow | null {
    const id = this.senders.get(e.fromId)?.marketId;
    return (id && this.org?.markets.rows.find((r) => r.id === id)) || null;
  }

  // -- the filters ----------------------------------------------------------------------------------------------------

  setFilter(patch: Partial<FeedbackFilter>): void {
    this.filter = { ...this.filter, ...patch };
  }

  /** "Clear filters": the search and the picks. */
  clearFilter(): void {
    this.filter = NO_FEEDBACK_FILTER;
  }

  get hasFilter(): boolean {
    const f = this.filter;
    return !!f.search.length || FEEDBACK_FACETS.some((k) => f[k].length > 0);
  }

  /** An item's facets: its status, kind and app, its sender's product line and market ("" for none). */
  facets(e: FeedbackEntry): Record<FeedbackFacet, string[]> {
    const sender = this.senders.get(e.fromId);
    return {
      statuses: [e.status],
      types: [e.item?.type ?? "other"],
      apps: [this.appOf(e)],
      productLines: [sender?.productLineId ?? ""],
      markets: [sender?.marketId ?? ""],
    };
  }

  /** An item passes the filters: each facet's picks (none: any) — `skip` one to count its options under the others. */
  passes(e: FeedbackEntry, filter = this.filter, skip?: FeedbackFacet): boolean {
    const facets = this.facets(e);
    return FEEDBACK_FACETS.every((k) => k === skip || !filter[k].length || facets[k].some((v) => filter[k].includes(v)));
  }

  /** Where it was sent from: the page's title (the app's name), else its address. */
  whereOf(e: FeedbackEntry): string {
    return e.item?.title || this.addressOf(e) || "—";
  }

  /** Its page's address, any credential in it left out (an item sent before they were taken out). */
  addressOf(e: FeedbackEntry): string {
    return e.item?.url ? safeUrl(e.item.url) : "";
  }

  browserOf(e: FeedbackEntry): string {
    return e.item ? browserOf(e.item.userAgent) : "—";
  }

  // -- the panel ------------------------------------------------------------------------------------------------------

  open(e: FeedbackEntry): void {
    this.trailRef?.reset(this);
    this.selected = e;
    this.panelOpen = true;
    this.shot = null;
    if (e.item?.screenshot === "attached" && this.assetId) {
      this.shotLoading = true;
      this.http<Record<string, TsPoint[]>>(this.tsUrl(this.assetId, [FEEDBACK_SHOT_KEY], e.ts, e.ts + 1, 1))
        .pipe(
          finalize(() => {
            this.shotLoading = false;
            this.changed();
          }),
          takeUntilDestroyed(this.destroyRef)
        )
        .subscribe({
          next: (res) => {
            const value = res?.[FEEDBACK_SHOT_KEY]?.[0]?.value;
            if (this.selected === e && typeof value === "string" && value.startsWith("data:image/")) {
              this.shot = value;
            }
          },
          error: () => (this.shot = null),
        });
    }
  }

  closePanel(): void {
    this.panelOpen = false;
  }

  /** Its status set (New, Reviewed, Done): the asset's reviews read again, this one's changed, saved. */
  setStatus(e: FeedbackEntry, status: FeedbackStatus): void {
    if (!this.assetId || e.status === status) {
      return;
    }
    const assetId = this.assetId;
    const by = this.ctx.currentUser?.sub ?? "";
    this.saving = true;
    this.readReviews(assetId)
      .pipe(
        switchMap((reviews) => {
          const next = { ...reviews };
          if (status === "new") {
            delete next[String(e.ts)];
          } else {
            next[String(e.ts)] = { status, by, at: Date.now() };
          }
          return this.saveReviews(assetId, next);
        }),
        finalize(() => {
          this.saving = false;
          this.changed();
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: () => {
          const update = (x: FeedbackEntry): FeedbackEntry =>
            x.ts === e.ts ? { ...x, status, reviewedBy: status === "new" ? "" : by, reviewedAt: status === "new" ? 0 : Date.now() } : x;
          this.entries = this.entries.map(update);
          if (this.selected?.ts === e.ts) {
            this.selected = update(this.selected);
          }
        },
        error: (err) => this.notices?.error(`Status not saved${apiMessage(err)}`),
      });
  }

  /** Its screenshot saved as a file. */
  downloadShot(e: FeedbackEntry): void {
    if (!this.shot) {
      return;
    }
    const a = document.createElement("a");
    a.href = this.shot;
    const ext = /^data:image\/(\w+)/.exec(this.shot)?.[1]?.replace("jpeg", "jpg") ?? "jpg";
    a.download = `feedback-${new Date(e.ts).toISOString().replace(/[:.]/g, "-")}.${ext}`;
    a.click();
  }

  /** Everything about it as text (to paste where it's looked into). */
  copyDetails(e: FeedbackEntry): void {
    const i = e.item;
    const lines = [
      `${feedbackTypeOf(i?.type).label} feedback — ${formatDateTime(e.ts)}`,
      `From: ${this.senderName(e)}${e.email ? ` <${e.email}>` : ""}`,
      `Status: ${feedbackStatusOf(e.status).label}`,
      `Application: ${this.appOf(e) || "—"}`,
      `Product line: ${this.lineOf(e)?.name ?? "—"} · Market: ${this.marketOf(e)?.name ?? "—"}`,
      `Page: ${i?.title ?? "—"}`,
      `Address: ${i?.url ? safeUrl(i.url) : "—"}`,
      `Build: ${i?.build ?? "—"}`,
      `Browser: ${i?.userAgent ?? "—"}`,
      `Window: ${i?.viewport ?? "—"}, ${i?.theme ?? "—"} theme`,
      `Screenshot: ${i?.screenshot ?? "none"}`,
      "",
      i?.text ?? "",
    ];
    navigator.clipboard?.writeText(lines.join("\n")).then(
      () => this.notices?.success("Details copied."),
      () => this.notices?.error("Couldn't copy the details.")
    );
  }

  // -- delete ---------------------------------------------------------------------------------------------------------

  askDelete(entries: FeedbackEntry[]): void {
    this.deleteConfirm = entries;
  }

  cancelDelete(): void {
    this.deleteConfirm = [];
  }

  get deleteHeading(): string {
    const n = this.deleteConfirm.length;
    return n === 1 ? "Delete this feedback?" : `Delete ${n} feedback items?`;
  }

  readonly deleteMessage = "Its words and screenshot are deleted for good.";

  /** Each one's points deleted (all its keys, at its time), then its review. */
  confirmDelete(): void {
    const entries = this.deleteConfirm;
    this.deleteConfirm = [];
    const assetId = this.assetId;
    if (!assetId || !entries.length) {
      return;
    }
    const keys = [FEEDBACK_KEY, FEEDBACK_SHOT_KEY, FEEDBACK_FROM_KEY, FEEDBACK_EMAIL_KEY].join(",");
    this.saving = true;
    of(...entries)
      .pipe(
        mergeMap(
          (e) =>
            this.ctx.http
              .delete(
                `/api/plugins/telemetry/ASSET/${assetId}/timeseries/delete?keys=${keys}&startTs=${e.ts}&endTs=${e.ts + 1}&deleteAllDataForKeys=false&rewriteLatestIfDeleted=true`,
                defaultHttpOptionsFromConfig(QUIET_REQUEST)
              )
              .pipe(
                map(() => e.ts),
                catchError(() => of(null))
              ),
          4
        ),
        toArray(),
        switchMap((done) => {
          const gone = new Set(done.filter((ts): ts is number => ts !== null));
          return this.readReviews(assetId).pipe(
            switchMap((reviews) => {
              const left = Object.fromEntries(Object.entries(reviews).filter(([ts]) => !gone.has(Number(ts))));
              return Object.keys(left).length === Object.keys(reviews).length ? of(null) : this.saveReviews(assetId, left);
            }),
            catchError(() => of(null)),
            map(() => gone)
          );
        }),
        finalize(() => {
          this.saving = false;
          this.changed();
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((gone) => {
        this.entries = this.entries.filter((e) => !gone.has(e.ts));
        if (this.selected && gone.has(this.selected.ts)) {
          this.panelOpen = false;
        }
        const failed = entries.length - gone.size;
        if (failed) {
          this.notices?.error(`${failed} of ${entries.length} not deleted.`);
        } else {
          this.notices?.success(entries.length === 1 ? "Feedback deleted." : `${entries.length} feedback items deleted.`);
        }
      });
  }

  // -- reading --------------------------------------------------------------------------------------------------------

  /** The asset's newest item watched (once, after the first read finds the asset): a change reads the list again. */
  private watch(): void {
    if (this.subscription || !this.assetId || this.watching) {
      return;
    }
    this.watching = true;
    const entityFilter = { type: AliasFilterType.singleEntity, singleEntity: { entityType: EntityType.ASSET, id: this.assetId } } as EntityFilter;
    subscribeLatestChanges(
      this.ctx,
      this.destroyRef,
      { entityFilter, timeseries: [FEEDBACK_KEY] },
      () => this.arrived.next(),
      (subscription) => (this.subscription = subscription)
    );
  }

  /** The tenant's Feedback asset; null when there's none. */
  private findAsset(): Observable<string | null> {
    return this.http<{ id?: { id?: string } }>(`/api/tenant/assets?assetName=${encodeURIComponent(FEEDBACK_ASSET_NAME)}`).pipe(
      map((a) => a?.id?.id ?? null),
      catchError((err) => (err?.status === 404 ? of(null) : throwError(() => err)))
    );
  }

  private readPoints(assetId: string): Observable<Record<string, TsPoint[]>> {
    return this.http<Record<string, TsPoint[]>>(this.tsUrl(assetId, [FEEDBACK_KEY, FEEDBACK_FROM_KEY, FEEDBACK_EMAIL_KEY], 0, Date.now() + 60_000, FEEDBACK_LIMIT));
  }

  private readReviews(assetId: string): Observable<Record<string, FeedbackReview>> {
    return this.http<{ key: string; value: unknown }[]>(`/api/plugins/telemetry/ASSET/${assetId}/values/attributes/SERVER_SCOPE?keys=${FEEDBACK_REVIEW_KEY}`).pipe(
      map((attrs) => parseObject(attrs?.find((a) => a.key === FEEDBACK_REVIEW_KEY)?.value) as Record<string, FeedbackReview>)
    );
  }

  private saveReviews(assetId: string, reviews: Record<string, FeedbackReview>): Observable<unknown> {
    return this.ctx.http.post(`/api/plugins/telemetry/ASSET/${assetId}/attributes/SERVER_SCOPE`, { [FEEDBACK_REVIEW_KEY]: reviews }, defaultHttpOptionsFromConfig(QUIET_REQUEST));
  }

  /**
   * The senders not read yet: each one's user (their name) and their scope's
   * product line and market (the server attributes the access model keeps on
   * a user — a plant's filled in from its site). A deleted user keeps the
   * item's name and no scope.
   */
  private withSenders(points: Record<string, TsPoint[]>): Observable<unknown> {
    const ids = [...new Set((points[FEEDBACK_FROM_KEY] ?? []).map((p) => String(p.value)))].filter((id) => id && !this.senders.has(id));
    if (!ids.length) {
      return of(null);
    }
    return of(...ids).pipe(
      mergeMap(
        (id) =>
          forkJoin([
            this.http<{ firstName?: string; lastName?: string; email?: string }>(`/api/user/${id}`).pipe(catchError(() => of(null))),
            this.http<{ key: string; value: unknown }[]>(`/api/plugins/telemetry/USER/${id}/values/attributes/SERVER_SCOPE?keys=productLineId,marketId`).pipe(
              catchError(() => of([]))
            ),
          ]).pipe(
            map(([u, attrs]) => {
              const attr = (key: string) => {
                const v = (attrs ?? []).find((a) => a.key === key)?.value;
                return typeof v === "string" ? v : "";
              };
              this.senders.set(id, { name: [u?.firstName, u?.lastName].filter(Boolean).join(" ") || u?.email || "", productLineId: attr("productLineId"), marketId: attr("marketId") });
            })
          ),
        6
      ),
      toArray(),
      map(() => this.sendersVersion++)
    );
  }

  private toEntries(points: Record<string, TsPoint[]>, reviews: Record<string, FeedbackReview>): FeedbackEntry[] {
    const at = (key: string) => new Map((points[key] ?? []).map((p) => [p.ts, p.value]));
    const from = at(FEEDBACK_FROM_KEY);
    const email = at(FEEDBACK_EMAIL_KEY);
    return (points[FEEDBACK_KEY] ?? [])
      .map((p) => {
        const review = reviews[String(p.ts)];
        return {
          ts: p.ts,
          item: decodeFeedbackItem(p.value),
          fromId: String(from.get(p.ts) ?? ""),
          email: String(email.get(p.ts) ?? ""),
          status: feedbackStatusOf(review?.status).id,
          reviewedBy: review?.by ?? "",
          reviewedAt: review?.at ?? 0,
        };
      })
      .sort((a, b) => b.ts - a.ts);
  }

  private tsUrl(assetId: string, keys: string[], startTs: number, endTs: number, limit: number): string {
    return `/api/plugins/telemetry/ASSET/${assetId}/values/timeseries?keys=${keys.join(",")}&startTs=${startTs}&endTs=${endTs}&limit=${limit}&agg=NONE&orderBy=DESC&useStrictDataTypes=false`;
  }

  private http<T>(url: string): Observable<T> {
    return this.ctx.http.get<T>(url, defaultHttpOptionsFromConfig(QUIET_REQUEST));
  }
}
