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


import { WidgetContext } from "@home/models/widget-component.models";
import { SectionNavItem } from "../section-nav/section-nav.component";
import { APPLICATIONS_SECTION } from "../applications/applications.models";
import { ORGANIZATION_SECTION } from "../organization/organization.models";
import { ACCESS_SECTION } from "../access/access.models";
import { ACCOUNT_SECTION } from "../account-settings/account-settings.component";
import { DashboardTheme } from "./dashboard-preferences";

// A dashboard runs standalone (its own widget, its own rail) or nested: one
// of the Home dashboard's apps, opened from Home's rail. Nested, it shows no
// rail of its own — its pages are the menu beside its app in Home's rail, the
// alarms and Settings are Home's — and it follows Home's theme; its place goes into the
// URL with its app's id (`app`), so a reload or Back lands on it again.

/** What the host (the Home dashboard) gives a dashboard it opens. */
export interface DashboardHost {
  /** The app's id: the host's rail entry and the URL state's `app`. */
  appId: string;
  /** The host's theme — the nested dashboard follows it, with no toggle of its own. */
  theme: DashboardTheme;
  /** Its widget settings, as its own widget would have them — what the host passes (its CARTO key: Marine's `cartoApiKey`). */
  settings?: Record<string, unknown>;
  /** The nested dashboard hands itself over once created (null when it goes): its pages join the host's rail. */
  attach(dashboard: NestedDashboard | null): void;
}

/**
 * A nested dashboard, to its host: its pages are the menu beside its app in
 * the host's rail (each dashboard's static `nestedPages` — the host lists them
 * before the app is even open), so it says which it shows and shows another.
 */
export interface NestedDashboard {
  /** The page it shows (one of its `nestedPages`' ids). */
  readonly railActive: string;
  selectRailPage(id: string): void;
  /** The host's widget was resized. */
  onResize(): void;
  /**
   * Its loading page is up (its first load: `tb-dashboard-loading [loading]="pageLoading"`) — the host's launch waits on it, so a
   * widget opening on the app shows one logo until the app's first page is in.
   */
  readonly pageLoading: boolean;
}

/** A dashboard's URL state: nested, with its app's id (`app`) — the host opens the app from it. */
export function nestedUrlParams(host: DashboardHost | null, params: Record<string, unknown>): Record<string, unknown> {
  return host ? { app: host.appId, ...params } : params;
}

/** The URL state is this dashboard's: it isn't nested, or the state names its app (another app's is the host's to handle). */
export function ownsUrlState(host: DashboardHost | null, params: Record<string, any>): boolean {
  return !host || params["app"] === host.appId;
}

/** The widget settings a dashboard reads: its own widget's — nested, the ones the host keeps for it (else none: its defaults). */
export function dashboardWidgetSettings<T>(ctx: WidgetContext, host: DashboardHost | null): Partial<T> {
  return (host ? (host.settings ?? {}) : (ctx.settings ?? {})) as Partial<T>;
}

/** A dashboard's own Settings sections: all but the Applications, the Organization, the Access and the Account (the host's Settings page has those). */
export function ownSettingsSections(sections: SectionNavItem[]): SectionNavItem[] {
  const hosts = new Set([APPLICATIONS_SECTION.id, ORGANIZATION_SECTION.id, ACCESS_SECTION.id, ACCOUNT_SECTION.id]);
  return sections.filter((s) => !hosts.has(s.id));
}

/** A nested dashboard's Settings sections: its own only (standalone, all of them). */
export function nestedSettingsSections(host: DashboardHost | null, sections: SectionNavItem[]): SectionNavItem[] {
  return host ? ownSettingsSections(sections) : sections;
}

