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
import { WidgetContext } from "@home/models/widget-component.models";
import { NavRailItem } from "../nav-rail/nav-rail.component";
import { FEEDBACK_RAIL_ITEM } from "../feedback/feedback.models";

// What every dashboard keeps per user (ThingsBoard's user settings) and shows
// in its icon rail's second group (under the pages) — one implementation, so they stay alike.

/** The user's theme: light, dark, or the system's (the device's light / dark setting, followed as it changes). */
export type TbThemeMode = "light" | "dark" | "system";

/** The user setting holding the theme ({@link TbThemeMode}) — one key, so the choice follows the user across dashboards. */
export const TB_THEME_SETTING = "themeMode";

/** The theme the user's settings name: their pick — the system's until they make one. */
export function themeModeOf(settings: Record<string, any> | null | undefined): TbThemeMode {
  const mode = settings?.[TB_THEME_SETTING];
  return mode === "light" || mode === "dark" || mode === "system" ? mode : "system";
}

/**
 * The attribute on ThingsBoard's app root (`tb-root`) naming the theme the dashboards last showed, "light" or "dark".
 * It stays as the user moves on to ThingsBoard's own pages (the extension stays loaded, the root with it), so the
 * white-labeling's custom CSS keeps ThingsBoard's side nav, top bar and their menus in the user's theme everywhere
 * (`white-labeling/custom-css.scss`). A page loaded afresh has none until a dashboard starts: the device's setting.
 */
export const SITE_THEME_ATTRIBUTE = "data-tb-theme";

/** The theme last shown in this browser (local storage): a dashboard starts in it, before the user's settings arrive. */
const THEME_CACHE_KEY = "tb-ext-theme";

function cachedThemeMode(): TbThemeMode | null {
  try {
    const mode = window.localStorage.getItem(THEME_CACHE_KEY);
    return mode === "light" || mode === "dark" || mode === "system" ? mode : null;
  } catch {
    return null; // storage blocked: the system's, until the settings arrive
  }
}

/** The theme last marked on the app root, and the device's setting it follows while that's "system". */
let siteThemeMode: TbThemeMode | null = null;
let siteThemeMedia: MediaQueryList | null = null;

/** Marks the user's theme on the app root ({@link SITE_THEME_ATTRIBUTE}) — "system" as the device says, followed as it changes. */
function markSiteTheme(mode: TbThemeMode): void {
  if (typeof document === "undefined") {
    return;
  }
  siteThemeMode = mode;
  try {
    window.localStorage.setItem(THEME_CACHE_KEY, mode);
  } catch {
    // storage blocked: the next load starts in the system's
  }
  if (!siteThemeMedia && window.matchMedia) {
    // One listener for the page's life: the mark outlives every dashboard.
    siteThemeMedia = window.matchMedia("(prefers-color-scheme: dark)");
    siteThemeMedia.addEventListener("change", () => {
      if (siteThemeMode === "system") {
        paintSiteTheme();
      }
    });
  }
  paintSiteTheme();
}

function paintSiteTheme(): void {
  const dark = siteThemeMode === "dark" || (siteThemeMode === "system" && !!siteThemeMedia?.matches);
  document.querySelector("tb-root")?.setAttribute(SITE_THEME_ATTRIBUTE, dark ? "dark" : "light");
}

/** Reads the user's saved settings once and hands them to `apply` (which sets the dashboard's fields and runs change detection). */
export function readUserSettings(ctx: WidgetContext, destroyRef: DestroyRef, apply: (settings: Record<string, any>) => void): void {
  ctx.userSettingsService
    .loadUserSettings()
    .pipe(takeUntilDestroyed(destroyRef))
    .subscribe((settings: any) => apply(settings ?? {}));
}

/** Saves `values` to the user's settings (merged server-side with the rest). */
export function saveUserSettings(ctx: WidgetContext, destroyRef: DestroyRef, values: Record<string, unknown>): void {
  ctx.userSettingsService
    .putUserSettings(values as any)
    .pipe(takeUntilDestroyed(destroyRef))
    .subscribe();
}

/**
 * A dashboard's light / dark theme, the same on every dashboard: the user's
 * pick (`mode`, kept in their settings — {@link TB_THEME_SETTING}), dark
 * ({@link dark}) as it says, or as the device's own setting says for
 * "system" — followed as that changes. A dashboard makes one in `ngOnInit`
 * with what re-renders it, restores it from the user's settings
 * (`readUserSettings`) and binds `.dark` to {@link dark}; the rail's toggle
 * is {@link toggle}, the Settings page's Account section {@link set}. It
 * starts in the theme last shown in this browser (local storage), so a
 * reload doesn't flash the system's before the settings arrive, and marks it
 * on ThingsBoard's app root ({@link SITE_THEME_ATTRIBUTE}) — as it starts,
 * restores and changes — for ThingsBoard's own side nav and pages.
 */
export class DashboardTheme {
  /** Until the user's settings arrive: the theme last shown in this browser, else the system's. */
  mode: TbThemeMode = cachedThemeMode() ?? "system";
  private readonly media: MediaQueryList | null = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  constructor(
    private ctx: WidgetContext,
    private destroyRef: DestroyRef,
    /** Re-render the dashboard in the theme now in force (its change detection, and anything that paints by it). */
    private changed: () => void
  ) {
    const onSystemChange = () => {
      if (this.mode === "system") {
        this.changed();
      }
    };
    this.media?.addEventListener("change", onSystemChange);
    destroyRef.onDestroy(() => this.media?.removeEventListener("change", onSystemChange));
    // Marked as the dashboard starts, not when the settings arrive — ThingsBoard's side nav is in it from then.
    markSiteTheme(this.mode);
  }

  /** The dashboard is dark: picked, or the system's while the pick is "system". */
  get dark(): boolean {
    return this.mode === "dark" || (this.mode === "system" && !!this.media?.matches);
  }

  /** The user's theme out of their saved settings (`readUserSettings`); the caller re-renders. */
  restore(settings: Record<string, any>): void {
    this.mode = themeModeOf(settings);
    markSiteTheme(this.mode);
  }

  /** The user picks a theme: shown, and kept in their settings. */
  set(mode: TbThemeMode): void {
    this.mode = mode;
    markSiteTheme(mode);
    this.changed();
    saveUserSettings(this.ctx, this.destroyRef, { [TB_THEME_SETTING]: mode });
  }

  /** The rail's toggle: the other of light and dark, picked outright. */
  toggle(): void {
    this.set(this.dark ? "light" : "dark");
  }
}

/** The rail's development switch (`dashboardRailItems`' `devSwitch`): its id in `bottomClick`. */
export const DEV_SWITCH_ID = "dev";

/** A dashboard's development version (made per dashboard: "<Title> Development", on the dev bundle's widget type). */
export const DEV_DASHBOARD_SUFFIX = " Development";

/**
 * The icon rail's second group (under its pages, after a divider), the same on every dashboard: the alarms (ids
 * "alarms", its badge the count — left out when `alarmCount` is omitted) and
 * the light / dark toggle (id "theme") — or, with `settings`, the Settings
 * page (id "settings"; the toggle is then in its Account section,
 * `tb-account-settings`, with "system" too) — and, with `themeToggle` too (a
 * tenant administrator's, for development: {@link isTenantAdmin}), the toggle
 * again. The rail highlights it while it's the page. "Send feedback" (id
 * "sendFeedback", `FEEDBACK_RAIL_ID`) opens the dashboard's `tb-feedback-dialog`
 * — `feedbackOf(ctx).show()`. The toggle and Send feedback sit at the rail's
 * foot (`foot`: after the development switch, before Account); the alarms and
 * Settings stay in the group.
 */
export function dashboardRailItems(darkMode: boolean, alarmCount?: number, options?: { settings?: boolean; themeToggle?: boolean }): NavRailItem[] {
  const theme: NavRailItem = { id: "theme", icon: darkMode ? "light_mode" : "dark_mode", label: darkMode ? "Light mode" : "Dark mode", foot: true };
  // A dashboard with a Settings page has it in the toggle's place (the theme is in its Account section) — a tenant
  // administrator's keeps the toggle, at the foot.
  const last: NavRailItem[] = [
    ...(options?.settings ? [{ id: "settings", icon: "settings", label: "Settings" }] : []),
    ...(!options?.settings || options.themeToggle ? [theme] : []),
    { ...FEEDBACK_RAIL_ITEM, foot: true },
  ];
  return alarmCount === undefined ? last : [{ id: "alarms", icon: "notifications", label: "Alarms", badge: alarmCount }, ...last];
}

/**
 * The rail's foot (`tb-nav-rail [footItems]`): the development version's switch — the Home dashboard's, for a tenant
 * administrator — the `code_blocks` icon (id "dev") at the rail's bottom edge, lit while on the development version; none without one.
 */
export function dashboardRailFootItems(devSwitch: { on: boolean } | null): NavRailItem[] {
  return devSwitch ? [{ id: DEV_SWITCH_ID, icon: "code_blocks", label: devSwitch.on ? "Leave development" : "Development", on: devSwitch.on }] : [];
}

/** The viewer is a tenant administrator (the Settings page's, and the rail's theme toggle under it for development). */
export function isTenantAdmin(ctx: WidgetContext): boolean {
  return ctx.currentUser?.authority === "TENANT_ADMIN";
}
