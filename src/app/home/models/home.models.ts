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

/** Widget settings of the home dashboard (`ctx.settings`), merged over {@link homeDashboardDefaultSettings}. */
export interface HomeDashboardSettings {
  /** The name in the sidebar's brand block ("IoTA"). */
  brandName: string;
  /** The access owner — the customer whose users the access groups hold ("WCAN"): the Settings page's Access. */
  ownerTitle: string;
  /** The Organization's asset profiles and relations (the Settings page's Organization; the apps' sites). */
  productLineAssetType: string;
  marketAssetType: string;
  siteAssetType: string;
  marketSiteRelation: string;
  productLineRelation: string;
  /** The applications' asset profile, and the relation from one to each site it runs at. */
  applicationAssetType: string;
  applicationSiteRelation: string;
  /** The CARTO basemaps key (Marine's un-watermarked Roadmap tiles), passed to the apps Home opens in place. */
  cartoApiKey: string;
}

/**
 * The instance's settings as of November 2026 (`iota.prd.cfops.biz`). The
 * widget settings override any of this.
 */
export const homeDashboardDefaultSettings: HomeDashboardSettings = {
  brandName: "IoTA",
  ownerTitle: "WCAN",
  cartoApiKey: "",
  productLineAssetType: "ProductLine",
  marketAssetType: "Market",
  siteAssetType: "Site",
  marketSiteRelation: "Contains",
  productLineRelation: "Contains",
  applicationAssetType: "Application",
  applicationSiteRelation: "Contains",
};
