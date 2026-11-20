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


import { AliasFilterType, EntityFilter } from "@shared/public-api";
import { DEFAULT_PROFILE_ICON, ProfileKind } from "../../../components/shared/profile-icons/profile-icons";
import { TbSelectOption } from "../../../components/shared/select/select.component";
import { SegmentOption } from "../../../components/shared/segmented-control/segmented-control.component";

/** One profile of the table (a page of them, from the server). */
export interface ProfileRow {
  id: string;
  kind: ProfileKind;
  name: string;
  description: string;
  /** ThingsBoard's default profile of its kind (a new device / asset takes it). */
  isDefault: boolean;
  createdTime: number | null;
  created: string;
  /** Its devices (a device profile's) or assets — null: they couldn't be counted. */
  entities: number | null;
}

/** A device / asset of a profile, on its panel's Devices / Assets tab. */
export interface ProfileEntityRow {
  id: string;
  name: string;
  label: string;
  /** Its site as the list names it — its label with its code, "Richmond Lab (4R20)" (the code alone, a site that isn't listed) — "" for none. */
  site: string;
  /** Its site's code (its stored `site`) — "" for none. */
  siteCode: string;
  /** Its owner's title (a customer's, or the tenant's own): its Details panel's form starts with it. */
  owner: string;
}

/** The Details form's values. */
export interface ProfileDraft {
  name: string;
  description: string;
  /** Its icon (a Material Symbols Rounded name) — "" for its kind's default. */
  icon: string;
  /** Its image, as ThingsBoard keeps it (`tb-image;/api/images/…`) — "" for none. */
  image: string;
  /** Its default rule chain's id — "" for the root rule chain. */
  ruleChainId: string;
  /** Its queue's name — "" for the default queue (Main). */
  queueName: string;
  /** Its default dashboard's id — "" for none. */
  dashboardId: string;
  /** A device profile's devices are vehicles (it's one of the tenant's `mobileProfiles`) — an asset profile's: false. */
  mobile: boolean;
}

/** The form's pickers: the tenant's rule chains, queues, dashboards and gallery images. */
export interface ProfileChoices {
  ruleChains: TbSelectOption[];
  queues: TbSelectOption[];
  dashboards: TbSelectOption[];
  images: TbSelectOption[];
}

export const NO_PROFILE_CHOICES: ProfileChoices = { ruleChains: [], queues: [], dashboards: [], images: [] };

/** The page's words for its kind. */
export const PROFILE_NOUN: Record<ProfileKind, string> = { device: "device profile", asset: "asset profile" };
/** The page's name and icon: its table's title and Home's rail entry (Entities › Device profiles / Asset profiles). */
export const PROFILE_PAGE: Record<ProfileKind, { title: string; icon: string }> = {
  device: { title: "Device profiles", icon: "developer_board" },
  asset: { title: "Asset profiles", icon: "dataset" },
};

/** The REST path of a kind's profile (`/api/deviceProfile`, `/api/assetProfile`) and its list. */
export const PROFILE_PATH: Record<ProfileKind, string> = { device: "/api/deviceProfile", asset: "/api/assetProfile" };
export const PROFILES_PATH: Record<ProfileKind, string> = { device: "/api/deviceProfiles", asset: "/api/assetProfiles" };

/** What a kind's profiles hold, in the texts ("devices", "assets") and as the count column's and the tab's name. */
export const PROFILE_ENTITIES: Record<ProfileKind, string> = { device: "devices", asset: "assets" };
export const PROFILE_ENTITIES_TITLE: Record<ProfileKind, string> = { device: "Devices", asset: "Assets" };

/** The user-settings key each page's sort is kept under. */
export const PROFILE_SORT_SETTING: Record<ProfileKind, string> = { device: "deviceProfileSort", asset: "assetProfileSort" };

/** The profiles read a request (all of them are read, a page after another). */
export const PROFILES_PAGE_SIZE = 1000;
/** The count requests in flight at once (a request a profile). */
export const PROFILE_COUNT_CONCURRENCY = 6;
/** A profile's Devices / Assets tab: the first ones by name (a profile can hold tens of thousands — the tickets'). */
export const PROFILE_ENTITY_LIMIT = 1000;

const DETAILS_TAB: SegmentOption = { id: "details", label: "Details", icon: "info", tooltip: "Details" };

/**
 * The side panel's tabs: the profile's details (transport, alarm rules and provisioning stay ThingsBoard's own page's), then its devices /
 * assets (`entities`) — a new one's, Details alone.
 */
export const PROFILE_PANEL_TABS: Record<ProfileKind, SegmentOption[]> = {
  device: [DETAILS_TAB, { id: "entities", label: "Devices", icon: DEFAULT_PROFILE_ICON.device, tooltip: "Devices" }],
  asset: [DETAILS_TAB, { id: "entities", label: "Assets", icon: DEFAULT_PROFILE_ICON.asset, tooltip: "Assets" }],
};
export const NEW_PROFILE_TABS: SegmentOption[] = [DETAILS_TAB];

/** A profile's devices (or assets): those of its name — a device's / asset's `type` names its profile. */
export function profileEntityFilter(kind: ProfileKind, profileName: string): EntityFilter {
  return (kind === "device"
    ? { type: AliasFilterType.deviceType, deviceTypes: [profileName], deviceNameFilter: "" }
    : { type: AliasFilterType.assetType, assetTypes: [profileName], assetNameFilter: "" }) as EntityFilter;
}

/** A new profile as ThingsBoard makes one: a device profile with its default transport, no alarm rules, no provisioning. */
export function newProfileBody(kind: ProfileKind): Record<string, unknown> {
  if (kind === "asset") {
    return {};
  }
  return {
    type: "DEFAULT",
    transportType: "DEFAULT",
    provisionType: "DISABLED",
    profileData: {
      configuration: { type: "DEFAULT" },
      transportConfiguration: { type: "DEFAULT" },
      provisionConfiguration: { type: "DISABLED", provisionDeviceSecret: null },
      alarms: null,
    },
  };
}

/** The form's start from a profile as ThingsBoard holds it (its icon apart). */
export function profileDraftOf(profile: any, icon: string, mobile = false): ProfileDraft {
  return {
    name: String(profile?.name ?? ""),
    description: String(profile?.description ?? ""),
    icon,
    image: String(profile?.image ?? ""),
    ruleChainId: String(profile?.defaultRuleChainId?.id ?? ""),
    queueName: String(profile?.defaultQueueName ?? ""),
    dashboardId: String(profile?.defaultDashboardId?.id ?? ""),
    mobile,
  };
}

/** A profile with the form's values: everything else it holds (a device profile's transport, alarm rules, provisioning) kept. */
export function profileBodyOf(kind: ProfileKind, before: any, draft: ProfileDraft): Record<string, unknown> {
  return {
    ...(before ?? newProfileBody(kind)),
    name: draft.name,
    description: draft.description || null,
    image: draft.image || null,
    defaultRuleChainId: draft.ruleChainId ? { entityType: "RULE_CHAIN", id: draft.ruleChainId } : null,
    defaultQueueName: draft.queueName || null,
    defaultDashboardId: draft.dashboardId ? { entityType: "DASHBOARD", id: draft.dashboardId } : null,
  };
}
