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

// Home is everyone's dashboard: its rail opens the apps in place. An access
// group may name the app its members start on — a *start app* — instead of a
// dashboard of its own (kept for apps Home doesn't open: In-Transit, Aria).
// The access sync writes a member's start app into their additional info;
// Home opens it as it loads with no place in its URL.

/** The apps Home opens in place (nested-dashboard.ts): Gateways, then the apps. */
export type HomeAppId = "gateways" | "marine" | "fuel" | "qc" | "asphalt";

/** An app a user can start on. */
export interface HomeStartApp {
  id: HomeAppId;
  label: string;
  /** Its Application (the asset's name, Settings › Applications): who can read it has the app in Home's rail. */
  application: string;
}

/** The apps a user can start on — Home's apps but Gateways (tenant administrators', no start app). */
export const HOME_START_APPS: HomeStartApp[] = [
  { id: "marine", label: "Marine", application: "Marine" },
  { id: "fuel", label: "Fuel", application: "Fuel" },
  { id: "qc", label: "QC Lab", application: "QC Lab" },
  { id: "asphalt", label: "Asphalt", application: "Asphalt" },
];

/** Where a user's start app is kept: a key of their additional info (written by the access sync, read by Home). */
export const HOME_START_APP_KEY = "homeStartApp";

/** A start app by its id; null for none or one unknown. */
export function homeStartApp(id: unknown): HomeStartApp | null {
  return HOME_START_APPS.find((a) => a.id === id) ?? null;
}

/** A start app in words: "Home › QC Lab" ("" for none). */
export function homeStartAppLabel(id: unknown): string {
  const app = homeStartApp(id);
  return app ? `Home › ${app.label}` : "";
}
