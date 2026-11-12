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
import { Router } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { base64toObj, objToBase64 } from "@core/public-api";
import { WidgetContext } from "@home/models/widget-component.models";

/**
 * Where a dashboard is (its page, its tab, a section, an entity it shows),
 * kept in the URL so a reload or a pasted link lands there and the browser's
 * Back / Forward move between places: the `state` query param, in
 * ThingsBoard's own dashboard-state format — `[{ id, params }]`, base64.
 * ThingsBoard reads the param back and its state controller reports the
 * change. A dashboard writes its place on each move ({@link writeDashboardUrlState}),
 * reads it on start ({@link readDashboardUrlState}) and follows it after
 * ({@link watchDashboardUrlState}).
 */

/**
 * Write the dashboard's place (`params`; `{}` for its first page) into the
 * URL. The dashboard's own state id is kept; `replace` rewrites the current
 * history entry (a tab or a section) instead of adding one (a page).
 */
export function writeDashboardUrlState(ctx: WidgetContext, params: Record<string, unknown>, replace = false): void {
  const router = ctx.$injector.get(Router, null) as Router | null;
  const controller = ctx.stateController;
  if (!router || !controller) {
    return;
  }
  const id = controller.getStateId?.() || "default";
  const tree = router.parseUrl(router.url);
  tree.queryParams = { ...tree.queryParams, state: encodeURIComponent(objToBase64([{ id, params }])) };
  router.navigateByUrl(tree, { replaceUrl: replace });
}

/**
 * The URL's place (its state's params; `{}` for none). A change comes with
 * its new state string — read that: the controller reports it before taking
 * it over, so its own params still say the old one.
 */
export function readDashboardUrlState(ctx: WidgetContext, state?: string | null): Record<string, any> {
  if (typeof state === "string") {
    try {
      const entries = state ? (base64toObj(state) as { params?: Record<string, any> }[]) : [];
      return (Array.isArray(entries) && entries.length ? entries[entries.length - 1]?.params : null) ?? {};
    } catch {
      return {};
    }
  }
  return (ctx.stateController?.getStateParams?.() as Record<string, any> | undefined) ?? {};
}

/** Follow the URL's place as it changes (Back / Forward, a pasted link): `apply` gets the new state string. */
export function watchDashboardUrlState(ctx: WidgetContext, destroyRef: DestroyRef, apply: (state: string | null) => void): void {
  ctx.stateController
    ?.stateChanged?.()
    ?.pipe(takeUntilDestroyed(destroyRef))
    .subscribe((state) => apply(state));
}

/**
 * Open the signed-in user's own settings — the Settings page's Account
 * section (their profile, their Google Chat webhook): the place written into
 * the URL as every dashboard with that page names it, which the dashboard
 * (Home, for an app nested in it) then follows.
 */
export function openAccountSettings(ctx: WidgetContext): void {
  writeDashboardUrlState(ctx, { page: "settings", settingsSection: "account" });
}

