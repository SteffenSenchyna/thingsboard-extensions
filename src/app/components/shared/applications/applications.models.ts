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

/** An application: an asset of the applications' profile — a plant, a product line, a project — shown by its label. */
export interface Application {
  /** The asset's id. */
  id: string;
  name: string;
  label: string;
  description: string;
  /**
   * The device profiles whose devices are its own ("FuelPump", "FuelPLC") —
   * where it runs: a plant with one of them (the "Application Sites" rule
   * chain keeps its Application → site relations). Kept in the asset's
   * additional info, as {@link assetProfiles}. Access is by sites alone: no
   * profile grants or limits it.
   */
  deviceProfiles: string[];
  /** The asset profiles whose assets are its own ("FuelUser", "FuelVehicle") — a market's fuel codes apply at the sites it runs at. */
  assetProfiles: string[];
  /** Its dashboards (ids): shared with the access groups whose scope it runs in. */
  dashboardIds: string[];
  /** When its asset was made (null unknown). */
  createdTime: number | null;
}

/** What the application form saves: the store makes it an asset (or saves the edited one). */
export type ApplicationDraft = Omit<Application, "id" | "createdTime">;

/** An application as it shows (a column, a filter, a picker): its label, else its name. */
export function applicationName(a: { name: string; label: string }): string {
  return a.label || a.name;
}

/** Where a dashboard keeps its applications. */
export interface ApplicationSettings {
  /** The applications' asset profile. */
  assetType: string;
  /**
   * The relation from an application to each device it's applied to — when a
   * dashboard applies them (the gateways'): the store then loads each one's
   * devices too ({@link ApplicationStore.members}).
   */
  memberRelation?: string;
  /**
   * The relation from an application to each site it runs at — kept by the
   * "Application Sites" rule chain (a plant with a device of its device
   * profiles) — when a dashboard shows where they run among its
   * Organization's sites (its {@link ApplicationStore.org}): the
   * application's panel then has a Sites tab, and its sites load with the
   * list ({@link ApplicationStore.sites}).
   */
  siteRelation?: string;
  /** What an application is applied to, in the texts ("gateway") — none: the texts don't say. */
  appliedNoun?: string;
}

/** The Settings page's Applications section. */
export const APPLICATIONS_SECTION: SectionNavItem = { id: "applications", label: "Applications", icon: "apps" };
