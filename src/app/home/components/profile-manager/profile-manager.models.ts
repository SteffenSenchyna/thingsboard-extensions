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


import { ProfileKind } from "../../../components/shared/profile-icons/profile-icons";
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

/** The REST path of a kind's profile (`/api/deviceProfile`, `/api/assetProfile`) and its list. */
export const PROFILE_PATH: Record<ProfileKind, string> = { device: "/api/deviceProfile", asset: "/api/assetProfile" };
export const PROFILES_PATH: Record<ProfileKind, string> = { device: "/api/deviceProfiles", asset: "/api/assetProfiles" };

/** A table column's server sort: the profile property its rows are ordered by. */
export const PROFILE_SORT_PROPERTY: Record<string, string> = { name: "name", description: "description", default: "isDefault", created: "createdTime" };

/** The side panel's one tab: the profile's details (transport, alarm rules and provisioning stay ThingsBoard's own page's). */
export const PROFILE_PANEL_TABS: SegmentOption[] = [{ id: "details", label: "Details", icon: "info", tooltip: "Details" }];

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
export function profileDraftOf(profile: any, icon: string): ProfileDraft {
  return {
    name: String(profile?.name ?? ""),
    description: String(profile?.description ?? ""),
    icon,
    image: String(profile?.image ?? ""),
    ruleChainId: String(profile?.defaultRuleChainId?.id ?? ""),
    queueName: String(profile?.defaultQueueName ?? ""),
    dashboardId: String(profile?.defaultDashboardId?.id ?? ""),
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
