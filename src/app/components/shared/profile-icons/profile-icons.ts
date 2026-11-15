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


import { Observable, Subject, forkJoin, of } from "rxjs";
import { catchError, map, shareReplay } from "rxjs/operators";
import { AliasFilterType, EntityDataQuery, EntityFilter, EntityKeyType, EntityType } from "@shared/public-api";
import { WidgetContext } from "@home/models/widget-component.models";
import { defaultHttpOptionsFromConfig } from "@core/public-api";
import { byNamePageLink } from "../dashboard/dashboard-subscriptions";
import { QUIET_REQUEST } from "../value-utils";

/** A profile's kind: a device profile's or an asset profile's. */
export type ProfileKind = "device" | "asset";

/**
 * Where a profile keeps its icon: a server attribute of the profile itself
 * (a Material Symbols Rounded name; none — its kind's default). A profile has
 * no additional info, and a save drops any key ThingsBoard doesn't know — in
 * its JSON or in its profile data — so the icon can't ride in the profile.
 */
export const PROFILE_ICON_KEY = "icon";

/** A profile with no icon of its own shows its kind's. */
export const DEFAULT_PROFILE_ICON: Record<ProfileKind, string> = { device: "sensors", asset: "category" };

export const PROFILE_ENTITY_TYPE: Record<ProfileKind, EntityType> = { device: EntityType.DEVICE_PROFILE, asset: EntityType.ASSET_PROFILE };

/**
 * The icons where everyone can read them: ThingsBoard refuses a customer's
 * user a profile's attributes (and its list), whatever their role — so a
 * tenant administrator's dashboard keeps every profile's icon ({@link
 * IconMirror}: id, name, icon — those with one) in this server attribute of
 * every Application asset, shared with each access group whose plants run
 * the app ({@link ProfileIcons.syncMirror}); anyone else reads it there.
 */
export const PROFILE_ICONS_MIRROR_KEY = "profileIcons";
const MIRROR_ASSET_TYPE = "Application";

/** The mirror's value: each kind's profiles with an icon, by name. */
interface IconMirror {
  device: { id: string; name: string; icon: string }[];
  asset: { id: string; name: string; icon: string }[];
}

/** The profile list a user who can't run an entity query over profiles reads (where ThingsBoard lets them: names and ids). */
const PROFILE_INFOS_PATH: Record<ProfileKind, string> = { device: "/api/deviceProfileInfos", asset: "/api/assetProfileInfos" };

/** How a kind's icons are read: not yet, one entity query (every profile's), or a profile at a time (named ones, as asked for). */
type LoadMode = "idle" | "loading" | "bulk" | "each";

interface KindState {
  mode: LoadMode;
  /** A profile's name → its id (`each`: from the profile list). */
  ids: Map<string, string>;
  /** A profile's id → its name. */
  names: Map<string, string>;
  /** A profile's id → its icon ("" none); a profile not in it: not read yet. */
  icons: Map<string, string>;
  /** `each`: names asked for, not read yet. */
  wanted: Set<string>;
  /** `each`: the profiles' attributes can't be read (one read refused): none is read again, each shows its kind's default. */
  denied: boolean;
  flushTimer?: ReturnType<typeof setTimeout>;
}

/**
 * Every device and asset profile's icon, as the dashboards show a device or
 * an asset (a panel's header, a table's row, a card): `of(kind, profileName)`
 * — a device's or asset's `type` names its profile — gives the icon, its
 * kind's default ({@link DEFAULT_PROFILE_ICON}) until it's known or when the
 * profile has none. One per widget ({@link profileIconsOf}); asking starts the
 * read: a tenant administrator's, one entity query a kind (every profile with
 * its `icon` attribute) — and the mirror kept ({@link syncMirror}); anyone
 * else's, the mirror on the Application assets ({@link PROFILE_ICONS_MIRROR_KEY}),
 * else (none there) the profiles' names, then each profile asked for — read once. `changes` tells when icons came in: the components showing them
 * repaint (`icons.changes.pipe(takeUntilDestroyed(…)).subscribe(() => cd.detectChanges())`).
 */
export class ProfileIcons {
  /** Icons came in (a read, or a profile saved): repaint. Never on subscribe. */
  readonly changes = new Subject<void>();

  private readonly kinds: Record<ProfileKind, KindState> = { device: this.emptyState(), asset: this.emptyState() };
  /** The mirror's read (anyone but a tenant administrator), shared by both kinds. */
  private mirror$?: Observable<IconMirror | null>;
  /** A tenant administrator's: the mirror checked (once a widget, again after a profile's icon changed here). */
  private mirrorChecked = false;
  private mirrorTimer?: ReturnType<typeof setTimeout>;

  constructor(private readonly ctx: WidgetContext) {}

  private get admin(): boolean {
    return this.ctx.currentUser?.authority === "TENANT_ADMIN";
  }

  /** A profile's icon by its name — its kind's default until it's known, and when it has none. */
  of(kind: ProfileKind, profileName: string | null | undefined): string {
    const s = this.kinds[kind];
    this.start(kind);
    if (!profileName) {
      return DEFAULT_PROFILE_ICON[kind];
    }
    const id = s.ids.get(profileName);
    const icon = id ? s.icons.get(id) : undefined;
    if (icon === undefined && s.mode !== "bulk" && !s.denied) {
      s.wanted.add(profileName);
      this.scheduleFlush(kind);
    }
    return icon || DEFAULT_PROFILE_ICON[kind];
  }

  /** A profile's icon by its id — as {@link of}. */
  ofId(kind: ProfileKind, profileId: string | null | undefined): string {
    const s = this.kinds[kind];
    this.start(kind);
    if (!profileId) {
      return DEFAULT_PROFILE_ICON[kind];
    }
    const icon = s.icons.get(profileId);
    const name = s.names.get(profileId);
    if (icon === undefined && name && s.mode !== "bulk" && !s.denied) {
      s.wanted.add(name);
      this.scheduleFlush(kind);
    }
    return icon || DEFAULT_PROFILE_ICON[kind];
  }

  /** The icon a profile picked — "" for none (its kind's default) — or null while it isn't known. */
  picked(kind: ProfileKind, profileId: string): string | null {
    return this.kinds[kind].icons.get(profileId) ?? null;
  }

  /** Start reading a kind's icons (a page about to show them) — `of` starts it too. */
  load(kind: ProfileKind): void {
    this.start(kind);
  }

  /** A profile saved here (its name and its icon — "" none), or created: shown at once, everywhere this widget shows it. */
  put(kind: ProfileKind, profileId: string, profileName: string, icon: string): void {
    const s = this.kinds[kind];
    const before = s.names.get(profileId);
    if (before !== undefined && before !== profileName) {
      s.ids.delete(before);
    }
    s.ids.set(profileName, profileId);
    s.names.set(profileId, profileName);
    s.icons.set(profileId, icon);
    this.changes.next();
    this.mirrorChanged();
  }

  /** A profile deleted here. */
  remove(kind: ProfileKind, profileId: string): void {
    const s = this.kinds[kind];
    const name = s.names.get(profileId);
    if (name !== undefined) {
      s.ids.delete(name);
    }
    s.names.delete(profileId);
    s.icons.delete(profileId);
    this.mirrorChanged();
  }

  private emptyState(): KindState {
    return { mode: "idle", ids: new Map(), names: new Map(), icons: new Map(), wanted: new Set(), denied: false };
  }

  private start(kind: ProfileKind): void {
    const s = this.kinds[kind];
    if (s.mode !== "idle") {
      return;
    }
    s.mode = "loading";
    // Outside the caller's change detection (a template asks): the read's answer repaints.
    const bulk$ = this.admin ? this.readAll(kind) : this.readMirror().pipe(map((m) => (m ? m[kind] : null)));
    if (this.admin) {
      this.syncMirror();
    }
    bulk$.subscribe((all) => {
      // Read in one go: an administrator's every profile (none found: the fallback below), or the mirror's (its profiles with an icon).
      if (all && (all.length || !this.admin)) {
        for (const p of all) {
          s.ids.set(p.name, p.id);
          s.names.set(p.id, p.name);
          s.icons.set(p.id, p.icon);
        }
        s.mode = "bulk";
        s.wanted.clear();
        this.changes.next();
        return;
      }
      // Nothing in one go (no mirror yet, or an administrator's query found none): the names, then each profile asked for.
      this.readNames(kind).subscribe((names) => {
        for (const p of names) {
          s.ids.set(p.name, p.id);
          s.names.set(p.id, p.name);
        }
        s.mode = "each";
        this.flush(kind);
        // Those asked for by id while the names were read: asked again as the components repaint.
        this.changes.next();
      });
    });
  }

  /** Every profile of the kind with its icon (one entity query); null when it can't be run. */
  private readAll(kind: ProfileKind): Observable<{ id: string; name: string; icon: string }[] | null> {
    const query: EntityDataQuery = {
      entityFilter: { type: AliasFilterType.entityType, entityType: PROFILE_ENTITY_TYPE[kind] } as EntityFilter,
      entityFields: [{ type: EntityKeyType.ENTITY_FIELD, key: "name" }],
      latestValues: [{ type: EntityKeyType.SERVER_ATTRIBUTE, key: PROFILE_ICON_KEY }],
      keyFilters: [],
      pageLink: byNamePageLink(),
    };
    return this.ctx.entityService.findEntityDataByQuery(query, QUIET_REQUEST).pipe(
      map((page) =>
        page.data.map((d: any) => ({
          id: String(d.entityId.id),
          name: String(d.latest?.[EntityKeyType.ENTITY_FIELD]?.["name"]?.value ?? ""),
          icon: String(d.latest?.[EntityKeyType.SERVER_ATTRIBUTE]?.[PROFILE_ICON_KEY]?.value ?? "").trim(),
        }))
      ),
      catchError(() => of(null))
    );
  }

  /**
   * The mirror ({@link PROFILE_ICONS_MIRROR_KEY}) as the Application assets this user can read have it — those of every
   * app running at their plants — merged; null when none has it (not written yet: a tenant administrator's dashboard
   * writes it).
   */
  private readMirror(): Observable<IconMirror | null> {
    if (!this.mirror$) {
      this.mirror$ = this.mirrorRows().pipe(
        map((rows) => {
          const found = rows.map((r) => r.mirror).filter((m): m is IconMirror => !!m);
          if (!found.length) {
            return null;
          }
          const merged: IconMirror = { device: [], asset: [] };
          for (const m of found) {
            for (const kind of ["device", "asset"] as ProfileKind[]) {
              for (const e of m[kind]) {
                if (!merged[kind].some((x) => x.id === e.id)) {
                  merged[kind].push(e);
                }
              }
            }
          }
          return merged;
        }),
        shareReplay(1)
      );
    }
    return this.mirror$;
  }

  /** The Application assets this user can read, each with its mirror (null: none, or unreadable) and the text it's stored as. */
  private mirrorRows(): Observable<{ id: string; mirror: IconMirror | null; text: string }[]> {
    const query: EntityDataQuery = {
      entityFilter: { type: AliasFilterType.assetType, assetTypes: [MIRROR_ASSET_TYPE], assetNameFilter: "" } as EntityFilter,
      entityFields: [{ type: EntityKeyType.ENTITY_FIELD, key: "name" }],
      latestValues: [{ type: EntityKeyType.SERVER_ATTRIBUTE, key: PROFILE_ICONS_MIRROR_KEY }],
      keyFilters: [],
      pageLink: byNamePageLink(),
    };
    return this.ctx.entityService.findEntityDataByQuery(query, QUIET_REQUEST).pipe(
      map((page) =>
        page.data.map((d: any) => {
          const mirror = parseMirror(d.latest?.[EntityKeyType.SERVER_ATTRIBUTE]?.[PROFILE_ICONS_MIRROR_KEY]?.value);
          return { id: String(d.entityId.id), mirror, text: mirror ? JSON.stringify(mirror) : "" };
        })
      ),
      catchError(() => of([]))
    );
  }

  /**
   * A tenant administrator's: the mirror made what the profiles hold — every profile's icon read again, written to each
   * Application asset whose copy differs (none differs: nothing written). Once a widget, and again after a profile's icon
   * changed here; a failure is let go (the next one tries again).
   */
  private syncMirror(): void {
    if (this.mirrorChecked || !this.admin) {
      return;
    }
    this.mirrorChecked = true;
    forkJoin({ device: this.readAll("device"), asset: this.readAll("asset"), rows: this.mirrorRows() }).subscribe(({ device, asset, rows }) => {
      if (!device || !asset) {
        this.mirrorChecked = false;
        return;
      }
      const entries = (list: { id: string; name: string; icon: string }[]) =>
        list.filter((p) => !!p.icon).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
      const want: IconMirror = { device: entries(device), asset: entries(asset) };
      const text = JSON.stringify(want);
      const options = defaultHttpOptionsFromConfig(QUIET_REQUEST);
      const writes = rows
        .filter((r) => r.text !== text)
        .map((r) =>
          this.ctx.http.post(`/api/plugins/telemetry/ASSET/${r.id}/attributes/SERVER_SCOPE`, { [PROFILE_ICONS_MIRROR_KEY]: want }, options).pipe(catchError(() => of(null)))
        );
      if (writes.length) {
        forkJoin(writes).subscribe();
      }
    });
  }

  /** A profile's icon changed here (a tenant administrator's): the mirror checked again, once the edits stop. */
  private mirrorChanged(): void {
    if (!this.admin) {
      return;
    }
    clearTimeout(this.mirrorTimer);
    this.mirrorTimer = setTimeout(() => {
      this.mirrorChecked = false;
      this.syncMirror();
    }, 1000);
  }

  /** The kind's profiles by name (every user can read the list). */
  private readNames(kind: ProfileKind): Observable<{ id: string; name: string }[]> {
    return this.ctx.http
      .get<{ data: { id: { id: string }; name: string }[] }>(`${PROFILE_INFOS_PATH[kind]}?pageSize=1000&page=0`, defaultHttpOptionsFromConfig(QUIET_REQUEST))
      .pipe(
        map((res) => (res?.data ?? []).map((p) => ({ id: p.id.id, name: p.name }))),
        catchError(() => of([]))
      );
  }

  private scheduleFlush(kind: ProfileKind): void {
    const s = this.kinds[kind];
    if (s.mode !== "each" || s.flushTimer) {
      return; // still loading: the names' answer flushes
    }
    s.flushTimer = setTimeout(() => {
      s.flushTimer = undefined;
      this.flush(kind);
    });
  }

  /** `each`: the profiles asked for, read (one request each, together); refused once — none again. */
  private flush(kind: ProfileKind): void {
    const s = this.kinds[kind];
    const wanted = [...s.wanted].map((name) => s.ids.get(name)).filter((id): id is string => !!id && !s.icons.has(id));
    s.wanted.clear();
    if (!wanted.length || s.denied) {
      return;
    }
    // Asked once: a second ask while the read runs waits for it.
    wanted.forEach((id) => s.icons.set(id, ""));
    forkJoin(
      wanted.map((id) =>
        this.ctx.http
          .get<{ key: string; value: unknown }[]>(
            `/api/plugins/telemetry/${PROFILE_ENTITY_TYPE[kind]}/${id}/values/attributes/SERVER_SCOPE?keys=${PROFILE_ICON_KEY}`,
            defaultHttpOptionsFromConfig(QUIET_REQUEST)
          )
          .pipe(
            map((attrs) => ({ id, icon: String((attrs ?? []).find((a) => a.key === PROFILE_ICON_KEY)?.value ?? "").trim(), denied: false })),
            catchError((err) => of({ id, icon: "", denied: err?.status === 403 || err?.status === 401 }))
          )
      )
    ).subscribe((read) => {
      for (const r of read) {
        s.icons.set(r.id, r.icon);
      }
      s.denied = s.denied || read.some((r) => r.denied);
      if (read.some((r) => r.icon)) {
        this.changes.next();
      }
    });
  }
}

/** A stored mirror (a JSON object, or its text) as {@link IconMirror}, each kind's entries in the order stored; null when it isn't one. */
function parseMirror(raw: unknown): IconMirror | null {
  let v = raw;
  if (typeof raw === "string") {
    try {
      v = raw.trim() ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== "object") {
    return null;
  }
  const entries = (list: unknown) =>
    (Array.isArray(list) ? list : [])
      .filter((e: any) => e && typeof e.id === "string" && typeof e.name === "string" && typeof e.icon === "string" && e.icon.trim())
      .map((e: any) => ({ id: e.id, name: e.name, icon: e.icon.trim() }));
  return { device: entries((v as any).device), asset: entries((v as any).asset) };
}

const PROFILE_ICONS = new WeakMap<object, ProfileIcons>();

/** The widget's {@link ProfileIcons} — one per widget (the nested dashboards share Home's). */
export function profileIconsOf(ctx: WidgetContext): ProfileIcons {
  let icons = PROFILE_ICONS.get(ctx);
  if (!icons) {
    icons = new ProfileIcons(ctx);
    PROFILE_ICONS.set(ctx, icons);
  }
  return icons;
}

/** One profile's icon as stored ("" none) — the profile form's start. */
export function readProfileIcon(ctx: WidgetContext, kind: ProfileKind, profileId: string): Observable<string> {
  return ctx.http
    .get<{ key: string; value: unknown }[]>(
      `/api/plugins/telemetry/${PROFILE_ENTITY_TYPE[kind]}/${profileId}/values/attributes/SERVER_SCOPE?keys=${PROFILE_ICON_KEY}`,
      defaultHttpOptionsFromConfig(QUIET_REQUEST)
    )
    .pipe(map((attrs) => String((attrs ?? []).find((a) => a.key === PROFILE_ICON_KEY)?.value ?? "").trim()));
}

/** A profile's icon saved ("" — removed: its kind's default again). */
export function saveProfileIcon(ctx: WidgetContext, kind: ProfileKind, profileId: string, icon: string): Observable<unknown> {
  const base = `/api/plugins/telemetry/${PROFILE_ENTITY_TYPE[kind]}/${profileId}`;
  const options = defaultHttpOptionsFromConfig(QUIET_REQUEST);
  return icon
    ? ctx.http.post(`${base}/attributes/SERVER_SCOPE`, { [PROFILE_ICON_KEY]: icon }, options)
    : ctx.http.delete(`${base}/SERVER_SCOPE?keys=${PROFILE_ICON_KEY}`, options);
}
