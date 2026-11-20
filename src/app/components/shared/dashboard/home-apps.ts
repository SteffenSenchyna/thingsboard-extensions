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

// Home is everyone's dashboard: its rail opens the apps in place — each app
// shown to whoever can read a site its Application runs at. Every user lands
// on Home's Home page (the access writes it as their home); an app opens from
// the rail.

/** The apps Home opens in place (nested-dashboard.ts): Gateways, then the apps. */
export type HomeAppId = "gateways" | "marine" | "fuel" | "qc" | "asphalt" | "aria";

/** One of Home's apps and its Application. */
export interface HomeAppApplication {
  id: Exclude<HomeAppId, "gateways">;
  /** Its Application (the asset's name, Settings › Applications): who can read a site it runs at has the app in Home's rail. */
  application: string;
}

/** Home's apps by their Applications — all but Gateways (tenant administrators', no Application). */
export const HOME_APP_APPLICATIONS: HomeAppApplication[] = [
  { id: "marine", application: "Marine" },
  { id: "fuel", application: "Fuel" },
  { id: "qc", application: "QC Lab" },
  { id: "asphalt", application: "Asphalt" },
  { id: "aria", application: "Aria" },
];
