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

import { ChangeDetectorRef, Component, DestroyRef, HostListener, Input, OnDestroy, OnInit, ViewChild } from "@angular/core";
import { CommonModule } from "@angular/common";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { Observable, Subscription, concat, forkJoin, from, of, throwError, timer } from "rxjs";
import { catchError, concatMap, defaultIfEmpty, filter, map, mergeMap, switchMap, take, tap, toArray } from "rxjs/operators";
import { defaultHttpOptionsFromConfig } from "@core/public-api";
import type { AlarmService } from "@core/http/alarm.service";
import {
  AggregationType,
  AliasFilterType,
  Asset,
  AttributeScope,
  Device,
  EntityId,
  EntityDataQuery,
  EntityFilter,
  EntityKeyType,
  EntityRelation,
  EntitySearchDirection,
  EntityType,
  NULL_UUID,
  RelationTypeGroup,
  SharedModule,
} from "@shared/public-api";
import { WidgetContext } from "@home/models/widget-component.models";
import { DashboardAlarm, alarmSeverityTone, alarmsTab, clearDashboardAlarm, subscribeActiveAlarms } from "../../../components/shared/dashboard/dashboard-alarms";
import { dashboardRailItems, DashboardTheme, readUserSettings, saveUserSettings, isTenantAdmin } from "../../../components/shared/dashboard/dashboard-preferences";
import { byNamePageLink, removeSubscriptions, subscribeLatestChanges } from "../../../components/shared/dashboard/dashboard-subscriptions";
import { readDashboardUrlState, watchDashboardUrlState, writeDashboardUrlState } from "../../../components/shared/dashboard/dashboard-url-state";
import {
  DashboardHost,
  NestedDashboard,
  dashboardWidgetSettings,
  nestedSettingsSections,
  nestedUrlParams,
  ownsUrlState,
} from "../../../components/shared/dashboard/nested-dashboard";
import { formatWhen, relativeTime } from "../../../components/shared/time-format";
import { QUIET_REQUEST, apiMessage, fmtNumber, parseBool, parseDescription } from "../../../components/shared/value-utils";
import { injectCss } from "../../../components/shared/cdn-loader";
import { AlarmListComponent, AlarmListItem } from "../../../components/shared/alarm-list/alarm-list.component";
import { AlarmPanelComponent } from "../../../components/shared/alarm-panel/alarm-panel.component";
import { OWNER_ENTITY_FIELDS, ownerCustomer } from "../../../components/shared/entity-owner";
import { CollapsibleCardComponent } from "../../../components/shared/collapsible-card/collapsible-card.component";
import { ButtonGroupComponent } from "../../../components/shared/button-group/button-group.component";
import { CopyBoxComponent } from "../../../components/shared/copy-box/copy-box.component";
import { FoldComponent } from "../../../components/shared/fold/fold.component";
import { SETTING_PIECES } from "../../../components/shared/setting-object/setting-object.component";
import { CalloutComponent } from "../../../components/shared/callout/callout.component";
import { ManageActionComponent, ManageCardComponent } from "../../../components/shared/manage-card/manage-card.component";
import {
  AssetRow,
  ORGANIZATION_SECTION,
  PlantTreeSite,
  organizationKindOf,
  plantTreeOptions,
  siteFilterTree,
  siteOptionLabel,
} from "../../../components/shared/organization/organization.models";
import { placeDevice } from "../../../components/shared/organization/device-places";
import { OrganizationStore } from "../../../components/shared/organization/organization-store";
import { OrganizationSettingsComponent } from "../../../components/shared/organization/organization-settings/organization-settings.component";
import { OrganizationPanelsComponent } from "../../../components/shared/organization/organization-panels/organization-panels.component";
import { ACCOUNT_SECTION, AccountSettingsComponent } from "../../../components/shared/account-settings/account-settings.component";
import { APPLICATIONS_SECTION } from "../../../components/shared/applications/applications.models";
import { ApplicationStore } from "../../../components/shared/applications/application-store";
import { ApplicationSettingsComponent } from "../../../components/shared/applications/application-settings/application-settings.component";
import { ApplicationPanelsComponent } from "../../../components/shared/applications/application-panels/application-panels.component";
import { ACCESS_SECTION, AccessPage, accessListSwitch, accessPageOf } from "../../../components/shared/access/access.models";
import { AccessStore } from "../../../components/shared/access/access-store";
import { AccessSettingsComponent } from "../../../components/shared/access/access-settings/access-settings.component";
import { AccessPanelsComponent } from "../../../components/shared/access/access-panels/access-panels.component";
import { AlarmNotificationPanelComponent } from "../../../components/shared/alarm-subscriptions/alarm-notification-panel.component";
import { CheckFilterComponent } from "../../../components/shared/check-filter/check-filter.component";
import { FilterSectionComponent } from "../../../components/shared/filter-section/filter-section.component";
import { FilterSectionsComponent } from "../../../components/shared/filter-sections/filter-sections.component";
import { ConfirmDialogComponent } from "../../../components/shared/confirm-dialog/confirm-dialog.component";
import { DialogComponent } from "../../../components/shared/dialog/dialog.component";
import { DateRangePickerComponent, TbDateRange } from "../../../components/shared/date-range-picker/date-range-picker.component";
import {
  DataTableCellDirective,
  DataTableColumn,
  DataTableComponent,
  DataTableSort,
} from "../../../components/shared/data-table/data-table.component";
import { TableLinkComponent, TableLinksComponent } from "../../../components/shared/table-links/table-links.component";
import { TableCountComponent } from "../../../components/shared/table-count/table-count.component";
import { DetailCardComponent, DetailRowComponent } from "../../../components/shared/detail-rows/detail-rows.component";
import { PanelStop } from "../../../components/shared/panel-trail/panel-trail";
import { ProfileIcons, profileIconsOf } from "../../../components/shared/profile-icons/profile-icons";
import { TableManage } from "../../../components/shared/data-table/table-manage";
import { PanelTabComponent } from "../../../components/shared/panel-tab/panel-tab.component";
import { TipDirective } from "../../../components/shared/tip/tip.directive";
import {
  AttributeSelect,
  DeviceSettingsCardComponent,
} from "../../../components/shared/device-settings-card/device-settings-card.component";
import { keepsSidePanelOpen } from "../../../components/shared/detail-panel/side-panel-outside-click";
// The station, pump and code panels' tabs: the shared ones (Insights first, Settings — the form — last), as QC Lab's device panel's.
import { DETAILS_TAB, EntityDetailPanelComponent, INSIGHTS_TAB, SETTINGS_TAB } from "../../../components/shared/entity-detail-panel/entity-detail-panel.component";
import { EventListComponent, EventListItem } from "../../../components/shared/event-list/event-list.component";
import { FilterListComponent, FilterListOption } from "../../../components/shared/filter-list/filter-list.component";
import { ColumnPickerComponent } from "../../../components/shared/column-picker/column-picker.component";
import { TableColumnChoice, sidebarWidth } from "../../../components/shared/dashboard/table-columns";
import { SettingsSidebarComponent, settingsSidebarWidth } from "../../../components/shared/settings-sidebar/settings-sidebar.component";
import { MetricChartCardComponent, MetricChartSection } from "../../../components/shared/metric-chart-card/metric-chart-card.component";
import { NavRailComponent, NavRailItem } from "../../../components/shared/nav-rail/nav-rail.component";
import { DashboardRootDirective } from "../../../components/shared/dashboard/dashboard-root.directive";
import { DashboardLoadingComponent, FirstLoad, FirstLoads } from "../../../components/shared/dashboard-loading/dashboard-loading.component";
import { SkeletonCardComponent } from "../../../components/shared/skeleton-card/skeleton-card.component";
import { SegmentOption, SegmentedControlComponent } from "../../../components/shared/segmented-control/segmented-control.component";
import { SidebarLayoutComponent } from "../../../components/shared/sidebar-layout/sidebar-layout.component";
import { StatusPillComponent, StatusPillTone } from "../../../components/shared/status-pill/status-pill.component";
import { SearchBoxComponent } from "../../../components/shared/search-box/search-box.component";
import {
  SummaryCard,
  SummaryCardsComponent,
  SummaryMarkTone,
  SummaryRow,
  SummaryValueTone,
} from "../../../components/shared/summary-cards/summary-cards.component";
import { TB_CUSTOM_TIMEFRAME, TimeframePickerComponent } from "../../../components/shared/timeframe-picker/timeframe-picker.component";
import { ToastsComponent } from "../../../components/shared/toasts/toasts.component";
import { FeedbackDialogComponent } from "../../../components/shared/feedback/feedback-dialog/feedback-dialog.component";
import { FEEDBACK_RAIL_ID, feedbackOf } from "../../../components/shared/feedback/feedback.models";
import { AssignCodeFormComponent } from "../../components/assign-code-form/assign-code-form.component";
import { ImportCodesFormComponent } from "../../components/import-codes-form/import-codes-form.component";
import { AddPumpFormComponent } from "../../components/add-pump-form/add-pump-form.component";
import { AddStationFormComponent } from "../../components/add-station-form/add-station-form.component";
import { SelectComponent, TbSelectOption } from "../../../components/shared/select/select.component";
import { FuelReportsComponent } from "../../components/fuel-reports/fuel-reports.component";
import { CodeActivityComponent } from "../../components/code-activity/code-activity.component";
import { CodeFormChange, CodeFormComponent } from "../../components/code-form/code-form.component";
import { CodeMapComponent } from "../../components/code-map/code-map.component";
import { FUEL_LIMITS_SECTION, FuelLimitsSettingsComponent } from "../../components/fuel-limits/fuel-limits-settings.component";
import { FuelLimitsFormComponent } from "../../components/fuel-limits/fuel-limits-form.component";
import { FuelLimitsTarget, FuelUseRow, fuelUseRows } from "../../components/fuel-limits/fuel-limits.models";
import {
  FuelReport,
  NO_REPORT_PREVIOUS,
  REPORT_HOURLY_MAX_DAYS,
  ReportBucket,
  ReportPeople,
  ReportDispense,
  ReportPrevious,
  ReportPump,
  ReportUnit,
  buildFuelReport,
  previousReportWindow,
} from "../../components/fuel-reports/fuel-reports.models";
import { PumpAccessCodesComponent } from "../../components/pump-access-codes/pump-access-codes.component";
import { StationTotalsComponent } from "../../components/station-totals/station-totals.component";
import { StationPumpsComponent } from "../../components/station-pumps/station-pumps.component";
import {
  ACTIVITY_FILTERS,
  ActivityGroup,
  ACTIVITY_TIMEFRAMES,
  AccessCode,
  AccessCodeRow,
  ActivityRow,
  StationActivityRow,
  AssignCodeRequest,
  CODE_KINDS,
  CodeKind,
  ImportCodesRequest,
  codeAssetConfig,
  codeChangeEvent,
  eventDescription,
  codeFromAssetName,
  CodePlace,
  CodeRoom,
  codeChangeKey,
  codeRoomReason,
  distinctCodes,
  placeScopeId,
  placesOfPlants,
  placesRoom,
  placesText,
  plantsOfPlaces,
  atPlaces,
  samePlace,
  siteCodeCount,
  sitesOfPlaces,
  codesSyncState,
  gatewayRpcError,
  PIN_RESET_EVENT,
  PIN_RESET_RPC_TIMEOUT_MS,
  PinResetInfo,
  RPC_FINAL_STATUSES,
  EVENT_META,
  activityTip,
  hasFuelingDetails,
  isFueling,
  FuelDashboardSettings,
  MarketCodes,
  MarketNode,
  PumpEvent,
  PumpLocation,
  PumpRow,
  codeKindLabel,
  fuelDashboardDefaultSettings,
  parseCodeLimits,
  parseOptionalBool,
  lastConnectedGateway,
  plcNotReadyWarning,
  AddPumpRequest,
  AddStationRequest,
  plantDevicePrefix,
  StationPlant,
  FUEL_TYPES,
  nextPumpNumber,
  pumpNamePrefix,
  PlcRow,
  PlcStatus,
  plcStatus,
  plcStatusMeta,
  PLC_STATUS_META,
  PLC_STATUSES,
  codeListSync,
  plcCodesSync,
  codeSyncMark,
  plcLoading,
  isPendingLoad,
  StationTableRow,
  CodeStatus,
  CODE_STATUSES,
  CODE_STATUS_META,
  parseCodeStatus,
  CodeActivityRow,
  CODE_USAGE_TIMEFRAMES,
  ChartWindow,
  chartWindow,
  CodeChangeType,
  NO_ATTENTION,
  STATION_ATTENTIONS,
  STATION_ATTENTION_META,
  StationAttention,
  attentionRank,
  stationAttention,
  parseCodeSlots,
  codeMisfits,
  codeAttention,
  CodeMap,
  codeMapOf,
  parsePumpEvent,
  parseReleaseLog,
  FUEL_LIMIT_KEYS,
  FUEL_USED_KEYS,
  FuelLimits,
  FuelUse,
  LAST_ACTIVITY_KEY,
  PUMP_BUFFER_FULL_KEY,
  PUMP_OVERLOAD_TRIP_KEY,
  fuelLimitAttributes,
  parseFuelLimits,
  parseFuelUse,
  pumpEventsStalled,
  pumpReleaseStep,
  RELEASE_STEPS_UNDER_WAY,
  shortPumpName,
  strictestCodeLimits,
  toAccessCodeRows,
  withCode,
  withCodes,
  withoutCode,
  withoutCodes,
} from "../../models/fuel-management.models";

/** The rail's pages. */
type DashboardPage = "stations" | "codes" | "activity" | "reports" | "settings";
/** Stations: its table (pumps). Codes: Users | Vehicles. Activity: Pumps (station events) | Codes (code changes). */
type DashboardView = "pumps" | "activity" | "userCodes" | "vehicleCodes" | "codeActivity" | "reports" | "settings";

/** The Codes page's view of a list. */
const CODES_VIEW: Record<CodeKind, DashboardView> = { users: "userCodes", vehicles: "vehicleCodes" };


/** Each rail page's views (its tab group), its first the default — the ones the URL may name. */
const PAGE_VIEWS: Record<DashboardPage, DashboardView[]> = {
  stations: ["pumps"],
  codes: ["userCodes", "vehicleCodes"],
  activity: ["activity", "codeActivity"],
  reports: ["reports"],
  settings: ["settings"],
};

/** Views that were another page's tab (Stations' and Codes' Activity, now the Activity page's lists): an older link naming one opens it there. */
const MOVED_VIEWS: Partial<Record<string, DashboardPage>> = { activity: "activity", codeActivity: "activity" };

/** The tables' sorts until the user picks one: stations by name, codes newest first. */
const DEFAULT_STATION_SORT: DataTableSort = { key: "name", direction: "asc" };
const DEFAULT_CODE_SORT: DataTableSort = { key: "added", direction: "desc" };
/** The user-settings keys the tables' sorts are kept under. */
const STATION_SORT_SETTING = "fuelStationSort";
const CODE_SORT_SETTING = "fuelCodeSort";
/** The Assignment tree's layout: left to right (true) or top down — the user's flip, kept. */
const CODE_MAP_LAYOUT_SETTING = "fuelCodeMapHorizontal";
/** The sidebar's width with the column picker closed (the filters column's). */
const SIDEBAR_WIDTH = 300;
/** The Stations table's columns shown until the user customises them: all but the device profile. */
const DEFAULT_STATION_COLUMN_KEYS = ["name", "status", "attention", "site", "market", "productLine", "pumpCount", "userCodes", "vehicleCodes", "lastDispense"];
/** A pump's row in the station's Pumps card: its label and fuel type as edited, and as saved. */
interface PumpEdit {
  label: string;
  fuelType: string;
  savedLabel: string;
  savedFuelType: string;
}

/** A Stations filter that narrows by where a station (or a pump) is. */
type LocationFacet = "productLine" | "site";

/**
 * The most intervals one aggregated time-series read may hold: ThingsBoard refuses past 700 ("Number of intervals is to high",
 * `database.ts_max_intervals`) — a month by the hour is 720 — so a longer read goes in parts of this many.
 */
const TS_MAX_INTERVALS = 690;

/** A pump's events read for the Reports page ({@link REPORT_EVENT_PAGES}): its rows, and from when they're all read (null: all). */
interface ReportEventRead {
  rows: ActivityRow[];
  coveredFrom: number | null;
}

/**
 * The Reports page reads a pump's events a page ({@link EVENTS_PER_SOURCE}) at a time, back to the window's start — at most this many
 * pages a window (50 000 events); a pump with more, its older ones are left out and the page says from when its figures run.
 */
const REPORT_EVENT_PAGES = 10;

/** The most events read from one pump or market for a window (ThingsBoard's newest first). */
const EVENTS_PER_SOURCE = 5000;

/** How long a pump's events read stay good for a code panel (a week of a busy pump's is ~300 KB, seconds to fetch). */
const EVENT_CACHE_MS = 2 * 60_000;

/** The events a station panel's Activity card lists: its pumps' latest (the rest are the Activity page's, a link away). */
const RECENT_STATION_EVENTS = 10;

/** The Activity page's Pumps columns shown until the user picks ("Customize columns"): odometer and hours are a pick away. */
const DEFAULT_ACTIVITY_COLUMN_KEYS = ["time", "event", "station", "pump", "user", "vehicle", "litres", "description"];

/** A time in the viewer's zone for a spreadsheet: "2026-11-10 15:18:46". */
function localDateTime(ts: number): string {
  const d = new Date(ts);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
}

/** The rows a table's search lets through: every term in one of `keys` (as the table matches). */
function matchingSearch<T extends Record<string, any>>(rows: T[], terms: string[], keys: string[]): T[] {
  const words = terms.map((w) => w.trim().toLowerCase()).filter(Boolean);
  if (!words.length) {
    return rows;
  }
  return rows.filter((r) => {
    const text = keys.map((k) => `${r[k] ?? ""}`).join(" ").toLowerCase();
    return words.every((w) => text.includes(w));
  });
}

/** Download a table as CSV (every value quoted), named `<name>-<date>.csv`. */
function downloadCsv(name: string, header: string[], rows: string[][]): void {
  const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  const text = [header, ...rows].map((line) => line.map(esc).join(",")).join("\n");
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}-${localDateTime(Date.now()).slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * A pump's day total for today: its latest day point's value when that day is
 * today's (its point, at the day's midnight, within the last 24 hours); else 0.
 */
function todayValue(point: { ts?: unknown; value?: unknown } | undefined): number {
  const ts = Number(point?.ts);
  const value = Number(point?.value);
  return ts && Date.now() - ts < 24 * 3600 * 1000 && Number.isFinite(value) ? value : 0;
}

/** A pump's PLC flag (its overload trip, its event buffer full): its latest point's value — null when it has never reported one. */
function flagOf(point: { ts?: unknown; value?: unknown } | undefined): boolean | null {
  return point?.ts && point.value != null && point.value !== "" ? parseBool(point.value) : null;
}

/** The Stations card's split by state: its lines' marks' colours (online green, updating orange, offline the neutral mark's grey). */
const STATION_STATUS_COLORS: Record<PlcStatus, string> = {
  online: "var(--c-bg-success-normal)",
  updating: "var(--c-bg-warning-normal)",
  // The neutral mark's grey (the summary cards' `.sc-mark`), so the bar's Offline part matches its line's mark.
  offline: "var(--c-icon-neutral-light)",
};
const STATION_STATUS_MARKS: Record<PlcStatus, SummaryMarkTone> = { online: "success", updating: "warning", offline: "neutral" };

/** The rail's pages. */
const FUEL_PAGES: NavRailItem[] = [
  { id: "stations", label: "Stations", icon: "local_gas_station" },
  { id: "codes", label: "Codes", icon: "key" },
  { id: "activity", label: "Activity", icon: "history" },
  { id: "reports", label: "Reports", icon: "analytics" },
];

/**
 * Fuel management dashboard: fuel pumps (devices of the configured profiles)
 * and the keypad access codes assigned to them.
 *
 * - Icon rail (left edge, as on the marine dashboard): four pages — Stations,
 *   Codes, Activity and Reports — with the alarms and the theme toggle at its foot. A page of
 *   several lists has a button tab group at the top of its sidebar: Codes' Users | Vehicles,
 *   Activity's Pumps | Codes.
 * - Sidebar: the page's filters. Stations: a location filter — a Market →
 *   Site tree of the Fuel application's sites (where it runs: its Sites tab on
 *   the Settings page) and their markets — that scopes both views, the alarms and the counts. A Market
 *   contains its Sites (the access hierarchy's "Contains") and each Site
 *   links its pumps by "FuelPump" and its PLC by "FuelPLC". Codes: the Type
 *   and Markets filters (none checked = all), scoping both the codes and
 *   their changes. A code is a market's (every site of it) or one site's.
 * - Stations: one row per station — a PLC and the pumps created by the same
 *   gateway ("Created" relation, else the gateway they last connected
 *   through) — with its site, its user / vehicle codes against its capacity
 *   for each, its status and the latest dispense over its pumps. A row opens
 *   the station panel, as QC Lab's device panel: Insights (its key figures and
 *   readiness, its pumps' fuel dispensed and dispenses / denials from their
 *   stored totals, its pumps — a pump opens the pump panel: Insights / Access
 *   codes / Alarms / Settings — and its pumps' latest events), Alarms (its PLC's and its pumps') and Settings
 *   (its PLC, its site, its pumps).
 * - Codes: the codes of the markets in the filter (each row names its
 *   market), Users | Vehicles; every pump in a market holds its codes (hence
 *   the per-pump Codes count). "Create new | Manage | Import" at the table's
 *   foot, Manage's "Delete (n)"; a row opens the code's panel (Insights: its
 *   use and its changes; Settings: its form and Manage — Disable / Enable,
 *   Delete). A new code's panel picks its plants and lists their
 *   PLCs — the controllers holding the pumps' code tables (linked by
 *   "FuelPLC" from a Site or the Market) — with whether each can take a new
 *   code now (its transfer flag, live).
 * - Activity: two lists — Pumps, the pumps' events (dispenses, denials,
 *   status), filterable by group, the Stations page's product line, market
 *   and site filters and by pump; Codes, the code changes (assigned / revoked) of the
 *   markets in the Codes page's filter, by type — both by user and vehicle
 *   code (one pick), over one time window. A panel's "View full activity"
 *   opens Pumps on its entity: a station's pumps picked in the Pump filter, a
 *   code picked in the User or Vehicle filter. Both export as CSV.
 *
 * Each code is an asset — "FuelUser" / "FuelVehicle", named USR-<code> /
 * VEH-<code>, holder as its label — linked from its market by the relation of
 * the same name. Assigning creates the asset + relation and puts the code in
 * the first free slot of the market's allowed-codes attribute (userCodes /
 * vehicleCodes: a fixed-length array of code strings sized to the pumps' code
 * limits, "" = empty slot); deleting it (a "code_revoked" event) deletes the
 * asset and clears its slot in place. Both
 * also write an activity event on the market. Where each value lives is set by
 * {@link FuelDashboardSettings} (widget settings override).
 */
@Component({
  selector: "tb-fuel-management-dashboard",
  templateUrl: "./fuel-management-dashboard.component.html",
  styleUrls: ["./fuel-management-dashboard.component.scss"],
  standalone: true,
  imports: [
    CommonModule,
    SharedModule,
    AlarmListComponent,
    ButtonGroupComponent,
    AlarmPanelComponent,
    AssignCodeFormComponent,
    AddPumpFormComponent,
    AddStationFormComponent,
    CopyBoxComponent,
    FoldComponent,
    ...SETTING_PIECES,
    CalloutComponent,
    ManageCardComponent,
    ManageActionComponent,
    OrganizationSettingsComponent,
    OrganizationPanelsComponent,
    AccountSettingsComponent,
    ApplicationSettingsComponent,
    ApplicationPanelsComponent,
    SelectComponent,
    ImportCodesFormComponent,
    CheckFilterComponent,
    ColumnPickerComponent,
    CollapsibleCardComponent,
    ConfirmDialogComponent,
    DialogComponent,
    DateRangePickerComponent,
    DataTableCellDirective,
    DataTableComponent,
    DeviceSettingsCardComponent,
    EntityDetailPanelComponent,
    EventListComponent,
    FuelReportsComponent,
    CodeActivityComponent,
    CodeFormComponent,
    CodeMapComponent,
    FuelLimitsSettingsComponent,
    FuelLimitsFormComponent,
    FilterListComponent,
    FilterSectionComponent,
    FilterSectionsComponent,
    MetricChartCardComponent,
    DashboardLoadingComponent,
    NavRailComponent,
    DashboardRootDirective,
    PanelTabComponent,
    PumpAccessCodesComponent,
    StationTotalsComponent,
    StationPumpsComponent,
    SkeletonCardComponent,
    SegmentedControlComponent,
    SidebarLayoutComponent,
    SettingsSidebarComponent,
    StatusPillComponent,
    SearchBoxComponent,
    SummaryCardsComponent,
    TimeframePickerComponent,
    ToastsComponent,
    FeedbackDialogComponent,
    AccessSettingsComponent,
    AccessPanelsComponent,
    AlarmNotificationPanelComponent,
    TableLinkComponent,
    TableLinksComponent,
    TipDirective,
    TableCountComponent,
    DetailCardComponent,
    DetailRowComponent,
  ],
})
export class FuelManagementDashboardComponent implements OnInit, OnDestroy, NestedDashboard {
  @Input() ctx: WidgetContext;
  /** Opened inside the Home dashboard (one of its apps): no rail of its own, Home's theme (nested-dashboard.ts). */
  @Input() host: DashboardHost | null = null;

  settings: FuelDashboardSettings = fuelDashboardDefaultSettings;
  /** The light / dark theme: the user's pick, or the system's (shared with the other dashboards). */
  theme!: DashboardTheme;
  get darkMode(): boolean {
    return !!this.theme?.dark;
  }

  // -- layout -----------------------------------------------------------------

  /** The rail's pages: Stations (the pumps), Codes (the access codes), Activity (the pumps' events, the codes' changes) and Reports. */
  readonly pages = FUEL_PAGES;
  /** Nested in the Home dashboard: its pages — the menu beside its app in Home's rail (its Settings sections are all Home's). */
  /** Nested in the Home dashboard: its pages, then its own Settings section (Fuel limits) — the menu beside its app in Home's rail. */
  static readonly nestedPages: NavRailItem[] = [...FUEL_PAGES, { id: FUEL_LIMITS_SECTION.id, label: FUEL_LIMITS_SECTION.label, icon: FUEL_LIMITS_SECTION.icon }];
  /** A page's lists — the button tab group at the top of its sidebar (Stations and Reports show one: none). */
  readonly codeViews: SegmentOption[] = [
    { id: "userCodes", label: "Users", icon: "person", tooltip: "Users" },
    { id: "vehicleCodes", label: "Vehicles", icon: "local_shipping", tooltip: "Vehicles" },
  ];
  readonly activityViews: SegmentOption[] = [
    { id: "activity", label: "Pumps", icon: "local_gas_station", tooltip: "Pumps" },
    { id: "codeActivity", label: "Codes", icon: "key", tooltip: "Codes" },
  ];
  page: DashboardPage = "stations";
  view: DashboardView = "pumps";
  sidebarOpen = true;
  /** Each page's view last shown — the rail returns to it. */
  private pageView: Record<DashboardPage, DashboardView> = {
    stations: "pumps",
    codes: "userCodes",
    activity: "activity",
    reports: "reports",
    settings: "settings",
  };
  // -- settings page ------------------------------------------------------------

  /** The Settings page's sections (its menu): the shared Organization, Applications and Appearance. */
  /** The Settings menu — nested, none of these: they're all on Home's Settings page (so no Settings page then). */
  settingsSections = [APPLICATIONS_SECTION, ORGANIZATION_SECTION, FUEL_LIMITS_SECTION, ACCESS_SECTION, ACCOUNT_SECTION];
  /** Every section the menu can show (a group's sections, not the group) — the ones the URL may name. */
  private settingsSectionIds = this.settingsSections.flatMap((s) => (s.children?.length ? s.children.map((c) => c.id) : [s.id]));
  settingsSection = "applications";
  /** The Settings page's Organization (shared with the other dashboards: product lines, markets, sites, and their panel). */
  org!: OrganizationStore;
  /** The Settings page's Applications (shared with the other dashboards: the list, its panel). */
  apps!: ApplicationStore;
  /** The Settings page's Access (shared: its groups and users, their panels). */
  access!: AccessStore;
  /** Its lists are loaded once the Settings page is first shown (nothing else here needs them). */
  private orgLoaded = false;
  /** The product lines and applications a new code's access join needs, asked for (an assign / import panel opened before the Settings page). */
  private accessListsLoaded = false;
  /** A market's fuel-management switch is being saved. */
  settingsSaving = false;
  /** The gateways' names and online state, by id. */
  private gatewayInfo = new Map<string, { name: string; online: boolean }>();

  /** The Reports page's window (its sidebar picker: 1D … 1M, or a range from its calendar). */
  reportTimeframe = "1W";
  reportRange: TbDateRange | null = null;
  /** The Reports page's Sites filter (site ids; none = all). */
  reportLocations: string[] = [];
  reportLocationOptions: FilterListOption[] = [];
  /** The Reports page's Type filter: Users / Vehicles (none = both). */
  reportKinds: CodeKind[] = [];
  reportTypeOptions: FilterListOption[] = [];
  /** The Reports page's report — built from {@link reportTotals} and {@link reportDispenses} (whatever's in so far). */
  report: FuelReport = buildFuelReport({
    start: Date.now(),
    end: Date.now(),
    toNow: true,
    days: 7,
    hourly: true,
    pumps: [],
    people: null,
    denials: null,
    dispenses: null,
    previousDispenses: null,
    unit: "L",
    kinds: [],
    loading: true,
    holder: () => "",
  });
  /**
   * The window's stored totals ("Fuel Daily Totals"), each pump's buckets and its previous window's (the window shifted back by its
   * days — the same days, to the same time): its buckets and their sums — for the window read (`key`).
   */
  private reportTotals: {
    key: string;
    hourly: boolean;
    buckets: Map<string, ReportBucket[]>;
    previous: Map<string, ReportPrevious>;
    previousBuckets: Map<string, ReportBucket[]>;
    /** When they were read (the strip's "As of …"). */
    readAt: number;
  } | null = null;
  /** The window's dispense events (who took the fuel), for the window read; null while they load. */
  private reportDispenses: ActivityRow[] | null = null;
  /** The window's denials (the same read's "denied" events) — the Denials section's; null while they load. */
  private reportDenials: ActivityRow[] | null = null;
  /** The previous window's dispense events — the users' and vehicles' "vs last" and their rank changes; null while they load. */
  private reportPreviousDispenses: ActivityRow[] | null = null;
  /** The window's events are all read from here on (a pump had more than {@link REPORT_EVENT_PAGES} pages); null: all of them. */
  private reportEventsFrom: number | null = null;
  /** The Reports page's volumes: litres, or US gallons (its sidebar's Units). */
  reportUnit: ReportUnit = "L";
  readonly reportUnitOptions = [
    { value: "L", label: "Litres" },
    { value: "gal", label: "Gallons" },
  ];
  /** The window read last (its start, days and end): a change reads again. */
  private reportKey = "";

  // -- pumps + location filter ------------------------------------------------

  /** Every pump, unfiltered. */
  pumps: PumpRow[] = [];
  pumpsLoading = false;
  /** The stations (PLCs) have loaded at least once — their capacity sizes the markets' code lists. */
  private plcsLoaded = false;
  /** Pumps in the Product line / Site filters (all when none checked): the Activity and the alarms follow them. */
  visiblePumps: PumpRow[] = [];
  /**
   * The Stations page's location filters, as the gateways dashboard's: every
   * product line of the Organization, and the shared site tree — the
   * fuel-management markets › their sites (`siteFilterTree`; none checked =
   * all). Each is counted under the other: stations on Stations, station
   * events on Activity's Pumps (both pages share them).
   */
  selectedProductLines: string[] = [];
  productLineFilterOptions: FilterListOption[] = [];
  selectedSites: string[] = [];
  siteFilterOptions: FilterListOption[] = [];
  /** The Organization's product lines (by label), and the product line each site belongs to (its Contains parent). */
  /** The product lines: each label (else its name), and its code (its name). */
  productLines: { id: string; name: string; code: string }[] = [];
  private siteProductLines = new Map<string, string>();
  /**
   * The Stations page's summary cards (above its table), for the stations and
   * pumps in the location filters ({@link buildStationSummary}):
   * - Station summary: the stations (PLCs) by status — online, loading a code
   *   list (their transfer flags), offline (`active`);
   * - Dispensing today: fuel, dispenses, the average dispense, denials (and
   *   timeouts) — the pumps' events since midnight — and the last dispense;
   * - Top stations / Top vehicles: the most fuel dispensed today, by station
   *   (its pumps) and by vehicle (the dispenses' vehicle codes, by holder).
   */
  stationSummary: SummaryCard[] = [];

  /** The Stations table: one row per station (PLC) in all of its filters. */
  stationRows: StationTableRow[] = [];
  /** Every station (PLC), unfiltered. */
  private allStations: StationTableRow[] = [];
  /** The stations in the location filters (any status): the panels and the alarms follow these. */
  private scopedStations: StationTableRow[] = [];
  /** The Stations table's Status filter (none checked = all). */
  selectedStationStatuses: PlcStatus[] = [];
  stationStatusOptions: FilterListOption[] = [];
  /** The Stations table's Attention filter: its reasons and "None" (none checked = all). */
  selectedStationAttention: string[] = [];
  stationAttentionOptions: FilterListOption[] = [];
  /** "Customize columns" open: the picker beside the filters (the Stations or a Codes table's; the sidebar widened for it). */
  columnPickerOpen = false;
  /** The Stations table's sort (a header click; kept in the user's settings) — by name until they pick one. */
  stationSort: DataTableSort | null = DEFAULT_STATION_SORT;
  /** The Codes tables' sort (Users and Vehicles alike; kept in the user's settings) — newest first until they pick one. */
  codeSort: DataTableSort | null = DEFAULT_CODE_SORT;
  /** The Stations table's search — the sidebar box's chips and text, and both together for the table. */
  stationSearchTerms: string[] = [];
  stationSearchText = "";
  stationSearch: string[] = [];
  /** The Codes table's search (the sidebar box). */
  codeSearchTerms: string[] = [];
  codeSearchText = "";
  codeSearch: string[] = [];
  /** The Codes table's Manage (its footer's "Delete (n) | Select all (n) | Done"): its checked codes. */
  readonly codesManage = new TableManage(() => this.codesTable, () => this.codeRows.length);
  /** A delete awaiting confirmation — the panel's code, or Manage's checked ones (null = no dialog). */
  deleteConfirm: { rows: AccessCodeRow[]; heading: string; message: string } | null = null;
  /** The Activity page's searches (the sidebar box, beside the CSV export): its Pumps list's, its Codes list's. */
  activitySearchTerms: string[] = [];
  activitySearchText = "";
  activitySearch: string[] = [];
  codeActivitySearchTerms: string[] = [];
  codeActivitySearchText = "";
  codeActivitySearch: string[] = [];
  readonly stationColumns: DataTableColumn[] = [
    // Its PLC's device profile's icon before its name.
    { key: "name", phone: "title", header: "Station", emphasis: "strong", iconOf: (row) => this.icons.of("device", (row as StationTableRow).profile) },
    // Online, then updating, then offline (ascending).
    { key: "status", phone: "trail", header: "Status", sortValue: (row) => PLC_STATUSES.indexOf((row as StationTableRow).statusId) },
    // Nothing first, the worst last (ascending): by its worst reason, then how many.
    { key: "attention", phone: "sub", header: "Attention", sortValue: (row) => (row as StationTableRow).attentionRank },
    // By their names (their codes), each label in a bubble on hover.
    { key: "site", phone: "sub", header: "Site", sortKey: "siteCode", tooltipKey: "siteLabel", emphasis: "muted" },
    { key: "market", phone: "hide", header: "Market", sortKey: "marketCode", tooltipKey: "marketLabel", emphasis: "muted" },
    { key: "productLine", phone: "hide", header: "Product line", sortKey: "productLineCode", tooltipKey: "productLineLabel", emphasis: "muted" },
    { key: "pumpCount", phone: "hide", header: "Pumps" },
    { key: "userCodes", phone: "hide", header: "User codes" },
    { key: "vehicleCodes", phone: "hide", header: "Vehicle codes" },
    // A station none of whose pumps has dispensed sorts as the longest ago: first when ordered longest-ago first, last the
    // other way (not sunk to the bottom both ways).
    { key: "lastDispense", phone: "hide", header: "Last dispense", nowrap: true, sortValue: (row) => (row as StationTableRow).lastDispenseTs ?? 0 },
    { key: "profile", phone: "hide", header: "Device profile", emphasis: "muted" },
  ];
  /** The Stations table's columns shown ("Customize columns"; kept in the user's settings). */
  readonly stationColumnChoice = new TableColumnChoice(this.stationColumns, DEFAULT_STATION_COLUMN_KEYS, "fuelStationColumns", ["attention"]);

  // -- access codes -----------------------------------------------------------

  /** Which list the pump panel's Codes tab shows. */
  codeKind: CodeKind = "users";
  /** Access codes view: the code types shown (none checked = both). */
  codeTypes: CodeKind[] = [];
  /** The sidebar's Type filter: Users / Vehicles, counted over the markets in the filter. */
  codeTypeOptions: FilterListOption[] = [];
  /**
   * The Codes page's Sites filter (and Activity's Codes'): the shared site tree — "All sites" › each market › its sites — the sites
   * picked (none checked = all). A code passes when it works at one of them (placed at the site, or at its market); a code change
   * when it was logged on the market of one of them.
   */
  codeSites: string[] = [];
  /** The Sites filter's tree (count = codes working there on Codes, changes on Activity's Codes — a branch each once). */
  codeSiteOptions: FilterListOption[] = [];
  /** The code panel's tree dialog (its "doesn't fit" note's link): open, and the tree it shows — built again as the code refreshes. */
  codeMapOpen = false;
  codeMap: CodeMap | null = null;
  /** The tree laid out left to right (its flip) — the user's pick, from their settings. */
  codeMapHorizontal = false;
  /** Each code asset's last dispense (its latest `fuelVolume` point) — the Codes tables' Last used; null until read. */
  private codeUsage: Map<string, number> | null = null;
  private codeUsageRead = 0;
  private codeUsageLoading = false;
  private codeUsageTimer?: any;
  codeRows: AccessCodeRow[] = [];
  codeColumns: DataTableColumn[] = [];
  /** Every column of the Codes tables (each sorts; a row opens its code's panel). */
  readonly codeSortColumns: DataTableColumn[] = [
    // The code in full; its copy button copies it.
    { key: "code", phone: "title", header: "Code", copyable: true },
    // A code with no holder sinks to the bottom (its cell shows "—"); its asset profile's icon (FuelUser / FuelVehicle) before it — the
    // table shows none while every row has the same.
    {
      key: "name", phone: "sub",
      header: "Holder",
      emphasis: "strong",
      sortValue: (row) => (row as AccessCodeRow).source.name,
      iconOf: (row) => this.codeIcon((row as AccessCodeRow).kind),
    },
    // Active, then disabled (ascending).
    { key: "status", phone: "trail", header: "Status", sortValue: (row) => CODE_STATUSES.indexOf((row as AccessCodeRow).status) },
    // A station it should be at with no room for it (its list full): nothing first, the most stations last (ascending).
    { key: "attention", phone: "sub", header: "Attention", sortValue: (row) => (row as AccessCodeRow).attentionRank },
    // Its last dispense ("Never": none) — never used first (ascending).
    { key: "lastUsed", phone: "hide", header: "Last used", emphasis: "muted", nowrap: true, sortValue: (row) => (row as AccessCodeRow).lastUsedTs ?? 0 },
    // By its name (its code), its label in the bubble.
    { key: "market", phone: "hide", header: "Market", tooltipKey: "marketLabel", emphasis: "muted" },
    // Its scope: a site by its name (its code), its label in the bubble — "All sites" for a market code.
    { key: "site", phone: "hide", header: "Site", tooltipKey: "siteLabel", emphasis: "muted" },
    { key: "added", phone: "hide", header: "Added", emphasis: "muted", nowrap: true, sortValue: (row) => (row as AccessCodeRow).source.createdAt || 0 },
  ];
  /** The Codes tables' columns shown (Users and Vehicles alike; "Customize columns", kept in the user's settings) — a column added since shown once to a pick saved before it. */
  readonly codeColumnChoice = new TableColumnChoice(this.codeSortColumns, this.codeSortColumns.map((c) => c.key), "fuelCodeColumns", [
    "site",
    "status",
    "code",
    "lastUsed",
    "attention",
  ]);
  /** The Codes tables' Status filter (none checked = all), counted under the Market filter. */
  codeStatuses: CodeStatus[] = [];
  codeStatusOptions: FilterListOption[] = [];
  /** The Activity page's Codes: the code changes of the markets in the filter (per the Type filter), newest first. */
  codeActivityRows: ActivityRow[] = [];
  readonly codeActivityColumns: DataTableColumn[] = [
    { key: "time", phone: "sub", header: "Time", emphasis: "muted", nowrap: true },
    { key: "event", phone: "title", header: "Event" },
    { key: "pump", phone: "sub", header: "Market", emphasis: "strong" },
    { key: "description", phone: "note", header: "Description", truncate: true },
  ];
  /** The markets (and their code lists) are still loading. */
  marketsLoading = true;
  /** Codes already in use — a new code's generated digits never collide with these. */
  takenCodes: string[] = [];
  /**
   * The code panel (a Codes row opens it): its code, and its tabs, as QC Lab's device panel's — Insights (its use, its changes), then
   * Settings (its form, Manage); no Alarms (a code has none).
   */
  selectedCode: AccessCodeRow | null = null;
  codeOpen = false;
  /** The code panel's tab: the one it opens on (back along the panels' trail, the one it was left on), then the one shown. */
  codeOpenTab = "insights";
  readonly codeTabs: SegmentOption[] = [INSIGHTS_TAB, SETTINGS_TAB];
  /** A new code's panel and the import panel: their form alone (one tab — the panel shows no tab group). */
  readonly formTabs: SegmentOption[] = [DETAILS_TAB];
  /** Its events — its use in {@link codeTimeframe} at its scope's pumps, its changes on its market — and their read. */
  codeEvents: CodeActivityRow[] = [];
  codeEventsLoading = false;
  codeEventsCapped = false;
  /** Its usage window: a week to start (each pump of its scope read over it — a busy pump's month of events is megabytes). */
  codeTimeframe = "1W";
  /** {@link codeTimeframe}'s span (its use is read over it) and its slots (the Usage card's bars). */
  codeWindow: ChartWindow = chartWindow("1W");
  /** Who assigned it (its "Code assigned" event's), "" unknown. */
  codeAddedBy = "";
  /** Resets the panel's Settings form (each code opened, each save). */
  codeResetKey = 0;
  /** A disable awaiting confirmation. */
  disableConfirm: { heading: string; message: string } | null = null;
  /** A PIN reset awaiting confirmation: the stations it goes to. */
  pinResetConfirm: { heading: string; message: string; plcs: PlcRow[] } | null = null;
  /** The code whose PIN reset is running (its asset id), null none — one at a time. */
  private pinResetAssetId: string | null = null;
  /** The open code's fuel limits (its Settings' card) and its use of today, this month and this year against them (its Insights); null while read. */
  codeLimits: FuelLimits | null = null;
  codeUseRows: FuelUseRow[] = [];
  private codeUse: FuelUse = { day: 0, month: 0, year: 0 };
  private codeLimitsSub?: Subscription;
  readonly trackUsePeriod = (_: number, r: FuelUseRow) => r.period;

  // -- Settings › Fuel limits (a site's or a market's panel) ----------------------
  /** The site or market whose limits panel is open. */
  limitsTarget: FuelLimitsTarget | null = null;
  limitsOpen = false;
  limitsSaving = false;
  /** Resets its form (each opened, each save); reads the section's table again (each save). */
  limitsResetKey = 0;
  limitsRefreshKey = 0;
  /** The open pump's PLC has held its event frame for over 5 minutes (its Manage card's Release events). */
  pumpStalled = false;
  /** A Release events awaiting confirmation: its pump. */
  releaseConfirm: { heading: string; message: string; pump: PumpRow } | null = null;
  /** A release asked for here, followed until the backend says how it went (a toast): its pump, when asked. */
  private releaseWatch: { pumpId: string; since: number } | null = null;
  private releaseWatchTimer?: ReturnType<typeof setTimeout>;
  private codeEventsSub?: Subscription;

  // -- activity ---------------------------------------------------------------

  /** The sidebar picker's window ("1D" … "1M"), or TB_CUSTOM_TIMEFRAME for {@link activityRange}. */
  activityTimeframe = "1W";
  readonly activityTimeframeOptions = ACTIVITY_TIMEFRAMES.map((t) => ({ id: t.id, label: t.id }));
  /** The custom range applied from the calendar (used while activityTimeframe is custom). */
  activityRange: TbDateRange | null = null;
  rangePickerOpen = false;
  /** Whose window the date-range panel sets: the Activity page's or the Reports page's. */
  private rangeTarget: "activity" | "reports" = "activity";
  /** The picker the date-range panel opens under. */
  rangeAnchor: HTMLElement | null = null;
  /** Event groups the Activity page's Pumps shows (none checked = all). */
  activityGroups: ActivityGroup[] = [];
  /** The sidebar's Events filter: each group with its count (location-scoped). */
  activityGroupOptions: FilterListOption[] = [];
  /**
   * The Activity page's Pumps: its Pump filter — the pumps picked, by id (none = all) — a station panel's "View full activity" picks
   * its pumps; its options each station › its pumps, counted under the list's other filters.
   */
  activityPumps: string[] = [];
  activityPumpOptions: FilterListOption[] = [];
  /**
   * The Activity page's User and Vehicle filters, both lists' (one pick): the codes picked (none in either = all), one pick across
   * both — a row passes with its user code picked in User or its vehicle code in Vehicle — a code panel's "View full activity" picks
   * its code; their options each list's, the codes in its rows, by holder, counted under its other filters.
   */
  activityUserCodes: string[] = [];
  activityVehicleCodes: string[] = [];
  activityUserOptions: FilterListOption[] = [];
  activityVehicleOptions: FilterListOption[] = [];
  codeActivityUserOptions: FilterListOption[] = [];
  codeActivityVehicleOptions: FilterListOption[] = [];
  /** Events in view (location filter + chip filter), with where and who. */
  activityRows: StationActivityRow[] = [];
  activityLoading = false;
  /** A pump or market had more events in the window than are read ({@link EVENTS_PER_SOURCE}): its oldest are left out. */
  activityCapped = false;
  /** The Activity table: every column there is — the dispense's detail as columns of its own, sorted by them. */
  readonly activityColumns: DataTableColumn[] = [
    { key: "time", phone: "sub", header: "Time", emphasis: "muted", nowrap: true, sortValue: (row) => (row as StationActivityRow).ts },
    { key: "event", phone: "title", header: "Event", sortKey: "label" },
    { key: "station", phone: "sub", header: "Station", nowrap: true },
    { key: "pump", phone: "sub", header: "Pump", emphasis: "strong" },
    // A holder by name, else the code ("—" none).
    { key: "user", phone: "hide", header: "User", nowrap: true, sortValue: (row) => (row as StationActivityRow).userName || (row as StationActivityRow).userCode },
    { key: "vehicle", phone: "hide", header: "Vehicle", nowrap: true, sortValue: (row) => (row as StationActivityRow).vehicleName || (row as StationActivityRow).vehicleCode },
    { key: "litres", phone: "trail", header: "Litres", align: "right", emphasis: "strong", nowrap: true, sortValue: (row) => (row as StationActivityRow).volume ?? NaN },
    { key: "odometer", phone: "hide", header: "Odometer", align: "right", nowrap: true, sortValue: (row) => (row as StationActivityRow).odometer ?? NaN },
    { key: "hours", phone: "hide", header: "Hours", align: "right", nowrap: true, sortValue: (row) => (row as StationActivityRow).hours ?? NaN },
    // Cut, its bubble the event laid out to read: what happened, then a line a fact (activityTip).
    { key: "description", phone: "note", header: "Description", truncate: true, cutTipKey: "descriptionTip" },
  ];
  /** The Activity table's columns shown ("Customize columns"; kept in the user's settings). */
  readonly activityColumnChoice = new TableColumnChoice(this.activityColumns, DEFAULT_ACTIVITY_COLUMN_KEYS, "fuelActivityColumns");
  /** The Activity table's sort (a header click) — newest first to start. */
  activitySort: DataTableSort | null = { key: "time", direction: "desc" };
  /** What the Activity table's search matches on (its rows' words, their codes and holders too). */
  readonly activitySearchKeys = ["label", "station", "pump", "site", "market", "userCode", "userName", "vehicleCode", "vehicleName", "description"];

  // -- alarms -----------------------------------------------------------------

  alarmsLoading = false;
  alarmPanelOpen = false;
  /** Active alarms of the visible pumps (header badge + alarms panel). */
  panelAlarms: AlarmListItem[] = [];
  /** Active alarms of the selected pump (detail panel Alarms tab). */
  detailAlarms: AlarmListItem[] = [];

  // -- station detail panel -----------------------------------------------------

  selectedStation: StationTableRow | null = null;
  stationOpen = false;
  /** Active alarms of the selected station: its PLC's and its pumps'. */
  stationAlarms: AlarmListItem[] = [];
  /** The tab the station panel opens on (Settings again after adding a pump from it). */
  stationOpenTab = "insights";
  /**
   * The station's Insights charts (Fuel dispensed, Dispenses): its pumps' stored totals over {@link stationWindow}, by pump id (null
   * while they're first read — a re-read keeps them), and when they were read.
   */
  stationTotals: Map<string, ReportBucket[]> | null = null;
  /** Another window picked: its cards' sums are being worked out again (their figures wireframed until they're in). */
  stationFiguresLoading = false;
  stationWindow: ChartWindow = chartWindow("1D");
  /** Its Activity card: its pumps' latest {@link RECENT_STATION_EVENTS} events in the window (the rest the Activity page's, a link away). */
  stationEventItems: EventListItem[] = [];
  stationEventsLoading = false;
  private stationTotalsAt = 0;
  private stationEventsAt = 0;
  private stationTotalsSub?: Subscription;
  private stationEventsSub?: Subscription;
  /** Each source's events last read whole (its window's start, when, its rows, whether some were left out): {@link readEventSources}. */
  private eventCache = new Map<string, { start: number; readAt: number; rows: ActivityRow[]; capped: boolean }>();
  private stationTimeframeValue = "1D";
  /** The station's Settings tab: its site as picked (saved with the card's Apply), and the sites to pick from. */
  stationSite = "";
  stationSiteOptions: TbSelectOption[] = [];
  /** The station's Pumps card: each pump's label and fuel type as edited (saved with the card's Apply). */
  stationPumpEdits: Record<string, PumpEdit> = {};
  readonly fuelTypeOptions: TbSelectOption[] = FUEL_TYPES.map((v) => ({ value: v, label: v }));
  /** The extras (site, pumps) are being saved by an Apply — the card's own save then says nothing. */
  private stationExtrasInApply = false;
  readonly trackPumpId = (_: number, p: PumpRow): string => p.pumpId;
  /** Each pump's station: the PLC linking to it by the station → pump relation (pump id → PLC id). */
  private pumpStations = new Map<string, string>();

  // -- add pump (inline, in the station's Pumps card) ---------------------------

  addPumpOpen = false;
  /** The station the new pump goes to. */
  addPumpStation: StationTableRow | null = null;
  addPumpResetKey = 0;
  /** Device names in use (the form refuses them) — set as the form opens. */
  takenDeviceNames: string[] = [];
  /** The station's product-site part its pumps are named by ("dev-inf"), and the first free pump number under it. */
  addPumpPrefix = "";
  addPumpNextNumber = 1;

  // -- a new station's panel ("Create new" on the Stations table) ------------------

  addStationOpen = false;
  addStationResetKey = 0;
  /** The Organization's plants and product lines asked for once (the Settings page loads them too). */
  private stationListsLoaded = false;
  private stationPlantsMemo: { sites: AssetRow[]; lines: AssetRow[]; plants: StationPlant[] } | null = null;

  // -- pump detail panel ------------------------------------------------------

  selectedPump: PumpRow | null = null;
  detailOpen = false;
  /** Tab the pump panel opens on — Insights, or Access codes from the Codes cell. */
  detailOpenTab = "insights";
  detailTab = "insights";
  /** A code write (a delete, a new code) is in flight. */
  saving = false;
  insightsTimeframe = "1D";
  metricsCharts: MetricChartSection[] = [];
  fuelTypeSelects: AttributeSelect[] = [];
  /** Stable value maps for the Settings tab (rebuilt only when the pump refreshes). */
  fuelTypeValues: Record<string, string> = {};
  /** The pump's Settings tab: its station and pump label as edited (saved with the card's Apply), and the stations to pick from. */
  pumpStation = "";
  pumpLabelEdit = "";
  pumpStationOptions: TbSelectOption[] = [];

  // -- assign-code panel ------------------------------------------------------

  assignOpen = false;
  /** The list the assign panel starts on. */
  assignKind: CodeKind = "users";
  /** Bumped on every open so the form resets. */
  assignResetKey = 0;
  /** The assign panel's plants (ids, in the plant tree), the places they make ({@link placesOfPlants}), their PLCs (their readiness pills) and the room they have left. */
  assignPlantIds: string[] = [];
  assignPlaces: CodePlace[] = [];
  assignPlcs: PlcRow[] = [];
  assignRoom: CodeRoom | null = null;
  plcsLoading = true;
  /** An assign awaiting confirmation because a station isn't ready for it (null = no dialog). */
  assignConfirm: { req: AssignCodeRequest; heading: string; message: string } | null = null;

  // -- import-codes panel -----------------------------------------------------

  importOpen = false;
  /** Bumped on every open so the form resets. */
  importResetKey = 0;
  /** The import panel's plants, places, PLCs and room (as the assign panel's). */
  importPlantIds: string[] = [];
  importPlaces: CodePlace[] = [];
  importPlcs: PlcRow[] = [];
  importRoom: CodeRoom | null = null;
  /** How far a running import has got (null when none is). */
  importProgress: { done: number; total: number } | null = null;
  /** An import awaiting confirmation because a station isn't ready for it (null = no dialog). */
  importConfirm: { req: ImportCodesRequest; heading: string; message: string } | null = null;

  /**
   * The plant tree of the code forms (create, import, a code's Settings): the
   * markets' Fuel plants, as a user's form picks plants ("All plants" › each
   * market › its plants), and how many there are.
   */
  codePlantOptions: FilterListOption[] = [];
  codePlantTotal = 0;
  /** The open code's plants (its places' — a market's: all its plants), for its Settings form's tree. */
  selectedCodePlants: string[] = [];

  /** Fuel-management markets with their fuel-management sites and code lists. */
  markets: MarketNode[] = [];
  /** Every PLC, located once the hierarchy has loaded. */
  plcs: PlcRow[] = [];
  /** Each linked PLC's Market → Site location, by PLC id. */
  private plcLocations = new Map<string, PumpLocation>();
  /** Each linked pump's Market → Site location, by pump id. */
  private pumpLocations = new Map<string, PumpLocation>();
  /** The pump panel, to switch its tab when it's already open. */
  @ViewChild("pumpPanel") private pumpPanel?: EntityDetailPanelComponent;
  /** The Codes table (its checked rows, the rows its search leaves). */
  @ViewChild("codesTable") private codesTable?: DataTableComponent;
  /** The dashboard's toasts (in its root, so they take its theme). */
  @ViewChild("toasts", { static: true }) private toasts!: ToastsComponent;
  /** The dashboard's root: whether it's laid out for a phone (the page's tab group atop the page, not in the filters' sheet). */
  @ViewChild(DashboardRootDirective, { static: true }) private root?: DashboardRootDirective;
  private alarmService: AlarmService;
  /** All active alarms of every pump, unscoped. */
  private allAlarms: AlarmListItem[] = [];
  /** All loaded events of every pump, unfiltered. */
  private allEvents: ActivityRow[] = [];
  private activityLoaded = false;
  /** The product lines (the Product line filter, the stations' product lines) are still loading. */
  private productLinesLoading = true;
  /** The pumps have loaded once (their day totals are the Stations cards' "today"). */
  private pumpsLoaded = false;
  private alarmsSubscription: any;
  private pumpsSubscription: any;
  private plcsSubscription: any;
  /** The markets' and sites' code lists: a code changed anywhere (another person, another tab) reloads the markets. */
  private codeListsSubscription: any;
  private codeListsRefreshTimer?: any;
  /** The latest markets read ({@link loadHierarchy}): reads can overlap (a change of this dashboard's, then the live one), and only the latest applies. */
  private hierarchyRead = 0;
  private pumpsRefreshTimer?: any;
  /** Every minute, while a pump has an event frame waiting: its stations' Attention again (a stall is time passing). */
  private attentionTimer?: any;
  private plcsRefreshTimer?: any;
  private activityRefreshTimer?: any;

  constructor(private cd: ChangeDetectorRef, private destroyRef: DestroyRef) {}

  // -- view getters -------------------------------------------------------------

  /** The Activity page's lists, either one (the sidebar's time window shows on both). */
  get isActivityView(): boolean {
    return this.view === "activity" || this.view === "codeActivity";
  }

  /** Laid out for a phone (the root's `tb-phone`): the page's tab group atop the page, over its list. */
  get phone(): boolean {
    return !!this.root?.phone;
  }

  /** The page's tab group atop its sidebar (a phone: atop the page): Codes' Users | Vehicles, Activity's Pumps | Codes; null on a page of one list. */
  get pageViews(): SegmentOption[] | null {
    return this.page === "codes" ? this.codeViews : this.page === "activity" ? this.activityViews : null;
  }

  /** The list the Codes page's Users / Vehicles tab shows; null on any other view. */
  get codesView(): CodeKind | null {
    return this.view === "userCodes" ? "users" : this.view === "vehicleCodes" ? "vehicles" : null;
  }

  /** Rail foot: the alarms (badge = the active alarms in scope), then Settings (the light / dark theme is its Account section). */
  get railBottomItems(): NavRailItem[] {
    return dashboardRailItems(this.darkMode, this.panelAlarms.length, { settings: true, themeToggle: isTenantAdmin(this.ctx) });
  }

  onRailBottomClick(id: string): void {
    if (id === "alarms") {
      this.alarmPanelOpen = !this.alarmPanelOpen; // a second click closes it
    } else if (id === "settings") {
      this.selectPage("settings");
    } else if (id === FEEDBACK_RAIL_ID) {
      feedbackOf(this.ctx).show("Fuel");
    } else if (id === "theme") {
      this.theme.toggle(); // a tenant administrator's, under Settings
    }
  }


  get detailTabs(): SegmentOption[] {
    return [INSIGHTS_TAB, { id: "codes", label: "Access codes", icon: "key", tooltip: "Access codes" }, alarmsTab(this.detailAlarms), SETTINGS_TAB];
  }

  /** The station panel's tabs, as QC Lab's device panel's: Insights, Alarms (its PLC's and its pumps'), Settings. */
  get stationTabs(): SegmentOption[] {
    return [INSIGHTS_TAB, alarmsTab(this.stationAlarms), SETTINGS_TAB];
  }

  /**
   * The station's Insights window — both its chart cards' pickers bound two-way to it (`[(timeframe)]`), so they keep one window; a
   * change reads its totals again.
   */
  get stationTimeframe(): string {
    return this.stationTimeframeValue;
  }

  set stationTimeframe(tf: string) {
    if (tf !== this.stationTimeframeValue) {
      this.stationTimeframeValue = tf;
      this.stationFiguresLoading = true; // the cards' sums wireframed, their bars kept, until the new window's are in
      this.loadStationTotals(true);
    }
  }

  /** The Stations row to highlight: the selected station while its panel is showing. */
  get highlightedStationId(): string | null {
    return this.selectedStation && this.stationOpen ? this.selectedStation.rowKey : null;
  }

  /** The station panel's subtitle: its site. */
  get stationSubtitle(): string {
    return this.selectedStation?.site ?? "";
  }

  /** Every device and asset profile's icon (the widget's; Home's, nested). */
  private get icons(): ProfileIcons {
    return profileIconsOf(this.ctx);
  }

  /** The station panel's icon: its PLC's device profile's. */
  get stationIcon(): string {
    return this.icons.of("device", this.selectedStation?.profile);
  }

  /** A new station's panel's icon: the profile its PLC will be made with. */
  get newStationIcon(): string {
    return this.icons.of("device", this.settings.plcDeviceTypes[0]);
  }

  /** The pump panel's icon: its device profile's. */
  get pumpIcon(): string {
    return this.icons.of("device", this.selectedPump?.type);
  }

  /** The stations as a kind (the Stations table's empty state, the Station summary's count): their (PLCs') device profile's icon. */
  get stationsEmptyIcon(): string {
    return this.icons.of("device", this.settings.plcDeviceTypes?.[0]);
  }


  /**
   * The Pumps row to highlight: the selected pump only while its panel (or the
   * assign panel opened from it) is showing — so closing the panel any way at
   * all (close button, Escape, outside click, sidebar toggle) clears it.
   */
  get highlightedPumpId(): string | null {
    return this.selectedPump && (this.detailOpen || this.assignOpen) ? this.selectedPump.pumpId : null;
  }

  get pumpSubtitle(): string {
    const p = this.selectedPump;
    return p ? [p.site, p.fuelType].filter(Boolean).join(" · ") : "";
  }

  /** The new code's panel: "New user code" / "New vehicle code", its icon the profile it'll be made with. */
  get assignName(): string {
    return `New ${codeKindLabel(this.assignKind, true).toLowerCase()} code`;
  }

  get assignIcon(): string {
    return this.codeIcon(this.assignKind);
  }

  /** A code's icon: its asset profile's (FuelUser / FuelVehicle — a code is an asset of it). */
  codeIcon(kind: CodeKind): string {
    return this.icons.of("asset", codeAssetConfig(this.settings, kind).type);
  }

  /** The assign / import panel's pick in a sentence — "all sites in GEA", "GEA and Richmond Lab (4R20)" (the room's reason). */
  get assignScopeName(): string {
    return placesText(this.assignPlaces, this.markets, true);
  }

  get importScopeName(): string {
    return placesText(this.importPlaces, this.markets, true);
  }

  /** A place's code-list length (its slots): its site's stations' limit (the market's when the site has none), else the market's. */
  private placeLength(place: CodePlace, kind: CodeKind): number {
    const market = this.marketById(place.marketId);
    const site = place.siteId ? market?.sites.find((x) => x.id === place.siteId) : null;
    return (site?.limits ?? market?.limits ?? { users: this.settings.maxCodesPerStation, vehicles: this.settings.maxCodesPerStation, total: this.settings.maxCodesPerStation })[kind];
  }

  /**
   * The plant tree of the code forms: the markets' Fuel plants — each with
   * its product line — as the user form's plant tree (`plantTreeOptions`),
   * built again as the markets or the product lines load.
   */
  private buildCodePlantTree(): void {
    const sites: AssetRow[] = this.markets.flatMap((m) =>
      m.sites.map((x) => ({
        id: x.id,
        name: x.code,
        label: x.name,
        owner: "",
        createdTime: null,
        marketId: m.id,
        productLineId: this.siteProductLines.get(x.id) ?? null,
      }))
    );
    this.codePlantOptions = plantTreeOptions(
      sites,
      this.markets.map((m) => ({ id: m.id, name: m.code || m.name })),
      this.productLines.map((l) => ({ id: l.id, name: l.code || l.name }))
    );
    this.codePlantTotal = sites.length;
  }

  /** Who's making a change (a code created or deleted), for its event: their name, else their email. */
  private get actor(): string {
    const u = this.ctx.currentUser;
    const name = [u?.firstName, u?.lastName]
      .map((x) => String(x ?? "").trim())
      .filter(Boolean)
      .join(" ");
    return name || String(u?.sub ?? "");
  }

  /** A market by id (null when it isn't a fuel-management market). */
  marketById(id: string): MarketNode | null {
    return this.markets.find((m) => m.id === id) ?? null;
  }

  /** A pump's market (null when it isn't in a fuel-management market). */
  marketOf(pump: PumpRow | null): MarketNode | null {
    return pump ? (this.markets.find((m) => m.id === pump.marketId) ?? null) : null;
  }

  // -- lifecycle ----------------------------------------------------------------

  /**
   * The app's loading page (tb-dashboard-loading, the logo spinner over the whole dashboard) — its first load only: the first page
   * shown, until everything it shows is in. Every later page shows its wireframes instead ({@link pageWireframe}).
   */
  private readonly appFirstLoad = new FirstLoad();
  get pageLoading(): boolean {
    return this.appFirstLoad.pending(this.pageWireframe);
  }

  /**
   * The page shown, its first showing: its content's wireframes — its tables' rows, its cards, its sidebar's filters — until
   * everything it shows is in ({@link pageReads}), then all of it at once; a later reload (a refresh, a filter, a window) keeps
   * what it has.
   */
  private readonly firstLoads = new FirstLoads();
  get pageWireframe(): boolean {
    return this.firstLoads.pending(this.view, ...this.pageReads());
  }

  /**
   * What the page shown waits on (its reads' loading flags): every page but Settings (its sections hold themselves) the markets
   * and their codes, the stations, the pumps and the product lines; Stations also the alarms (its Attention — its cards read
   * the stations and the pumps' stored day totals); Activity its window's events; Reports its totals and its dispenses.
   */
  private pageReads(): boolean[] {
    const base = [this.marketsLoading, this.plcsLoading, this.pumpsLoading || !this.pumpsLoaded, this.productLinesLoading];
    switch (this.view) {
      case "settings":
        return [];
      case "pumps":
        return [...base, this.alarmsLoading];
      case "activity":
      case "codeActivity":
        return [...base, !this.activityLoaded || this.activityLoading];
      case "reports":
        return [...base, !this.reportTotals || !this.reportDispenses];
      case "userCodes":
      case "vehicleCodes":
        return [...base, this.codeUsage === null];
      default:
        return base;
    }
  }

  /** The station panel's Insights: its cards' wireframes until its charts' totals and its latest events are in — each station opened. */
  private stationFirstLoad = new FirstLoad();
  get stationInsightsLoading(): boolean {
    return this.stationFirstLoad.pending(!this.stationTotals, this.stationEventsLoading);
  }

  /** The code panel's Insights: its cards' wireframes until its events are in — each code opened. */
  private codeFirstLoad = new FirstLoad();
  get codeInsightsLoading(): boolean {
    return this.codeFirstLoad.pending(this.codeEventsLoading, this.codeLimits === null);
  }

  ngOnInit(): void {
    if (!this.host) {
      this.ctx.$scope.fuelManagementDashboardComponent = this;
    }
    this.theme = this.host?.theme ?? new DashboardTheme(this.ctx, this.destroyRef, () => this.cd.detectChanges());
    // A phone or not: the page's tab group atop the page or atop its filters.
    this.root?.changes.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.cd.detectChanges());
    this.settings = { ...fuelDashboardDefaultSettings, ...dashboardWidgetSettings<FuelDashboardSettings>(this.ctx, this.host) };
    this.settingsSections = nestedSettingsSections(this.host, this.settingsSections);
    this.settingsSectionIds = this.settingsSections.flatMap((s) => (s.children?.length ? s.children.map((c) => c.id) : [s.id]));
    this.settingsSection = this.settingsSectionIds[0] ?? this.settingsSection;
    injectCss("tb-ext-material-symbols-rounded", "https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200");
    this.alarmService = this.ctx.$injector.get(this.ctx.servicesMap.get("alarmService")) as AlarmService;
    this.buildPanelConfig();
    this.applyCodes(); // table columns before the markets arrive
    this.buildStationSummary(); // the Stations cards, "…" until their data is in
    // The stations' and pumps' profile icons came in: the cards (Top stations) take them, and the tables and panels repaint.
    this.icons.changes.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.buildStationSummary();
      this.cd.detectChanges();
    });
    this.loadUserPreferences();

    this.loadHierarchy();
    this.loadPumps(); // initial render (also triggers the first activity load)
    this.subscribePumps(); // live refresh on attribute / telemetry changes
    this.attentionTimer = setInterval(() => this.onAttentionTick(), 60_000); // a waiting event frame turns stalled with time
    this.loadPlcs();
    this.subscribePlcs(); // the readiness pills follow the PLCs' transfer flags
    this.subscribeCodeLists(); // the code counts follow a code changed anywhere
    this.loadProductLines(); // the Product line filter
    this.subscribeAlarms();
    // The Settings page's Organization: an edit there reloads what this dashboard builds from those assets.
    const s = this.settings;
    this.org = new OrganizationStore(
      this.ctx,
      this.destroyRef,
      {
        productLineAssetType: s.productLineAssetType,
        marketAssetType: s.marketAssetType,
        siteAssetType: s.siteAssetType,
        marketSiteRelation: s.marketSiteRelation,
        productLineSiteRelation: s.productLineRelation,
      },
      this.toasts,
      () => this.cd.detectChanges(),
      {
        edited: () => {
          this.loadHierarchy(); // the markets' and sites' names
          this.loadProductLines(); // the Product line filter and the stations' product lines
        },
      }
    );
    // The Settings page's Applications: where each runs (its Sites tab) — the Fuel application's sites are this dashboard's. What runs at a site
    // follows its devices (the "Application Sites" rule chain: a plant with a device of the app's device profiles).
    this.apps = new ApplicationStore(
      this.ctx,
      this.destroyRef,
      { assetType: s.applicationAssetType, siteRelation: s.applicationSiteRelation },
      this.toasts,
      () => this.cd.detectChanges()
    );
    this.apps.org = this.org;
    // The Settings page's Access: groups scoped by the Organization, opening the Applications.
    this.access = new AccessStore(this.ctx, this.destroyRef, { ownerTitle: s.accessOwnerTitle }, this.toasts, () => this.cd.detectChanges(), this.org, this.apps);
    // The station, pump and code panels are stops on the dashboard's panels' trail (the Settings panels' — a pump opened from its station
    // leaves the station a tab away): another store's panel opening closes these.
    this.access.trail.join(this, () => this.closeOwnPanels());
    // The URL's dashboard state: the page, its view and the Settings section named
    // there show, and every change to it — the browser's Back / Forward, a pasted link — is followed.
    watchDashboardUrlState(this.ctx, this.destroyRef, (state) => this.applyUrlState(state));
    this.applyUrlState();
    this.host?.attach(this);
  }

  /** The Organization's product lines (the Product line filter) and the sites each contains — a station's product line is its site's. */
  private loadProductLines(): void {
    const s = this.settings;
    const query: EntityDataQuery = {
      entityFilter: { type: AliasFilterType.assetType, assetTypes: [s.productLineAssetType], assetNameFilter: "" } as EntityFilter,
      entityFields: [
        { type: EntityKeyType.ENTITY_FIELD, key: "name" },
        { type: EntityKeyType.ENTITY_FIELD, key: "label" },
      ],
      pageLink: byNamePageLink(),
    };
    const sitesOf = (productLineId: string): EntityDataQuery => ({
      entityFilter: {
        type: AliasFilterType.relationsQuery,
        rootEntity: { entityType: EntityType.ASSET, id: productLineId },
        direction: EntitySearchDirection.FROM,
        maxLevel: 1,
        fetchLastLevelOnly: false,
        filters: [{ relationType: s.productLineRelation, entityTypes: [EntityType.ASSET] }],
      } as EntityFilter,
      pageLink: { pageSize: 1024, page: 0 },
    });
    this.ctx.entityService
      .findEntityDataByQuery(query, QUIET_REQUEST)
      .pipe(
        switchMap((page) => {
          const lines = page.data.map((d: any) => {
            const fields = d.latest?.[EntityKeyType.ENTITY_FIELD] ?? {};
            return {
              id: d.entityId.id as string,
              name: String(fields["label"]?.value || fields["name"]?.value || ""),
              code: String(fields["name"]?.value ?? ""),
            };
          });
          const siteIds = lines.map((pl) =>
            this.ctx.entityService.findEntityDataByQuery(sitesOf(pl.id), QUIET_REQUEST).pipe(
              map((sites) => sites.data.map((d: any) => d.entityId.id as string)),
              catchError(() => of([] as string[]))
            )
          );
          return (siteIds.length ? forkJoin(siteIds) : of([] as string[][])).pipe(map((sites) => ({ lines, sites })));
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: ({ lines, sites }) => {
          this.productLines = lines;
          const bySite = new Map<string, string>();
          lines.forEach((pl, i) => sites[i].forEach((siteId) => !bySite.has(siteId) && bySite.set(siteId, pl.id)));
          this.siteProductLines = bySite;
          this.productLinesLoading = false;
          this.buildCodePlantTree(); // each plant's product line
          this.applyFilters(); // the stations' product lines, and the filters' counts
          this.cd.detectChanges();
        },
        error: () => {
          this.productLinesLoading = false;
          this.cd.detectChanges();
        },
      });
  }

  ngOnDestroy(): void {
    this.host?.attach(null);
    removeSubscriptions(this.ctx, this.alarmsSubscription, this.pumpsSubscription, this.plcsSubscription, this.codeListsSubscription);
    clearTimeout(this.pumpsRefreshTimer);
    clearTimeout(this.plcsRefreshTimer);
    clearTimeout(this.codeListsRefreshTimer);
    clearTimeout(this.codeUsageTimer);
    clearTimeout(this.activityRefreshTimer);
    clearTimeout(this.releaseWatchTimer);
    clearInterval(this.attentionTimer);
  }

  /** ThingsBoard hook — data comes from the custom subscriptions; just re-render. */
  onDataUpdated(): void {
    this.ctx.detectChanges();
  }

  onResize(): void {
    this.cd.detectChanges();
  }

  // -- header / sidebar ---------------------------------------------------------

  // -- nested in the Home dashboard: its pages are the menu beside its app in Home's rail --

  get railActive(): string {
    // Nested, its Settings is its own sections (Fuel limits) — an entry each in Home's rail.
    return this.page === "settings" && this.host ? this.settingsSection : this.page;
  }

  selectRailPage(id: string): void {
    if (this.pages.some((p) => p.id === id) || id === "settings") {
      this.selectPage(id);
    } else {
      // A Settings section (nested: Fuel limits, from Home's rail): the Settings page on it.
      if (this.page !== "settings") {
        this.selectPage("settings");
      }
      this.selectSettingsSection(id);
    }
    this.cd.detectChanges();
  }

  /** A rail page: back to the view it last showed — a new entry in the URL. */
  selectPage(id: string): void {
    this.showPage(id as DashboardPage);
    this.writeUrlState();
  }

  /** The Settings page's section (its menu), kept in the URL (rewriting the entry). */
  selectSettingsSection(id: string): void {
    this.showSettingsSection(id);
    this.writeUrlState(true);
  }

  /** Show a rail page on a view (the one it last showed); the Settings page loads its lists the first time. */
  private showPage(page: DashboardPage, view = this.pageView[page]): void {
    this.page = page;
    if (page === "settings" && !this.orgLoaded) {
      this.orgLoaded = true;
      this.org.loadAll();
      this.org.wantSiteLinks();
      this.apps.load();
      if (accessPageOf(this.settingsSection)) {
        this.access.load(); // opened on an Access page (the URL's)
      }
    }
    this.showView(view);
  }

  /** Show a Settings section; an Organization page reloads its list, an Access page its groups and users (not a switch between the Users page's lists). */
  private showSettingsSection(id: string): void {
    const from = this.settingsSection;
    this.settingsSection = id;
    const kind = organizationKindOf(id);
    if (kind) {
      this.org.load(kind);
    } else if (id === "applications") {
      this.apps.load();
    } else if (accessPageOf(id) && !accessListSwitch(from, id)) {
      this.access.load();
    }
  }

  /** The Settings page's Access page ("groups" / "users" / "roles"), or null on another section. */
  get accessPage(): AccessPage | null {
    return accessPageOf(this.settingsSection);
  }

  /** The Settings page's section is one of the Organization's (the shared tables). */
  get organizationSection(): boolean {
    return !!organizationKindOf(this.settingsSection);
  }

  /** A view of the current page (its tab group), kept in the URL (rewriting the entry). */
  selectView(id: string): void {
    this.showView(id as DashboardView);
    this.writeUrlState(true);
  }

  private showView(view: DashboardView): void {
    // Another tab (or page): the codes leave Manage.
    if (this.codesManage.managing && view !== this.view) {
      this.codesManage.end();
    }
    this.view = view;
    this.pageView[this.page] = view;
    if (this.isActivityView) {
      this.ensureActivityLoaded(); // (at start it loads once the pumps and the markets are in)
    }
    this.applyFilters(); // Sites count stations on Stations, events on Activity's Pumps
    this.applyCodes(); // Type / Markets count codes on Codes, changes on Activity's Codes
    this.ensureReport(); // the Reports page: its window read (once)
  }

  // -- the URL's dashboard state -----------------------------------------------------

  /**
   * Where the dashboard is, into the URL (`writeDashboardUrlState`): the rail's
   * page and its view, and the Settings page's section — nothing for Stations'
   * Pumps, the first. `replace` rewrites the current history entry (a tab, a
   * section) instead of adding one (a page).
   */
  private writeUrlState(replace = false): void {
    const params =
      this.page === "settings"
        ? { page: this.page, settingsSection: this.settingsSection }
        : this.page === "stations" && this.view === "pumps"
          ? {}
          : { page: this.page, view: this.view };
    writeDashboardUrlState(this.ctx, nestedUrlParams(this.host, params), replace);
  }

  /** The page, view and Settings section the URL's state names (a change brings its new state string); Stations' Pumps for none. */
  private urlState(state?: string | null): { page: DashboardPage; view: DashboardView; settingsSection: string } {
    const params = readDashboardUrlState(this.ctx, state);
    // The Settings page only while it has sections (nested, it has none: they're on Home's).
    const named = (Object.keys(PAGE_VIEWS) as DashboardPage[]).find((p) => p === params["page"] && (p !== "settings" || this.settingsSectionIds.length)) ?? "stations";
    // An older link's Activity tab of Stations or Codes: that list on the Activity page.
    const page = (named !== "settings" && MOVED_VIEWS[params["view"]]) || named;
    const views = PAGE_VIEWS[page];
    const view = views.find((v) => v === params["view"]) ?? views[0];
    const settingsSection = this.settingsSectionIds.find((id) => id === params["settingsSection"]) ?? this.settingsSectionIds[0];
    return { page, view, settingsSection };
  }

  /** Follow the URL's state (at start, and as it changes): its page, view and Settings section show. */
  private applyUrlState(state?: string | null): void {
    if (!ownsUrlState(this.host, readDashboardUrlState(this.ctx, state))) {
      return; // nested, and the URL is another app's (or Home's own page)
    }
    const wanted = this.urlState(state);
    if (wanted.page === "settings" && wanted.settingsSection !== this.settingsSection) {
      if (this.orgLoaded) {
        this.showSettingsSection(wanted.settingsSection);
      } else {
        this.settingsSection = wanted.settingsSection; // the page's first showing loads every list
      }
    }
    if (wanted.page !== this.page || wanted.view !== this.view) {
      this.showPage(wanted.page, wanted.view);
    }
    if (state !== undefined) {
      this.cd.detectChanges(); // a change after start (at start, the first render follows)
    }
  }

  onProductLinesChange(ids: string[]): void {
    this.selectedProductLines = ids;
    this.applyFilters();
  }

  onSitesChange(ids: string[]): void {
    this.selectedSites = ids;
    this.applyFilters();
  }

  /** The Stations table's Status filter. */
  onStationStatusesChange(ids: string[]): void {
    this.selectedStationStatuses = ids as PlcStatus[];
    this.applyFilters();
  }

  onStationAttentionChange(ids: string[]): void {
    this.selectedStationAttention = ids;
    this.applyFilters();
  }

  /** Any of the Product line / Market / Site filters in use (the Stations table and Activity's Pumps share them). */
  private get hasLocationFilters(): boolean {
    return !!(this.selectedProductLines.length || this.selectedSites.length);
  }

  /** The open table's filters in use — its search and the sidebar's filters: "Clear filters". */
  get hasTableFilters(): boolean {
    switch (this.view) {
      case "pumps":
        return !!(
          this.stationSearchTerms.length ||
          this.stationSearchText ||
          this.selectedStationStatuses.length ||
          this.selectedStationAttention.length ||
          this.hasLocationFilters
        );
      case "activity":
        return !!(
          this.activitySearchTerms.length ||
          this.activitySearchText ||
          this.activityGroups.length ||
          this.activityPumps.length ||
          this.activityUserCodes.length ||
          this.activityVehicleCodes.length ||
          this.hasLocationFilters
        );
      case "codeActivity":
        return !!(
          this.codeActivitySearchTerms.length ||
          this.codeActivitySearchText ||
          this.codeTypes.length ||
          this.activityUserCodes.length ||
          this.activityVehicleCodes.length ||
          this.codeSites.length
        );
      default:
        return !!(this.codesView && (this.codeSearchTerms.length || this.codeSearchText || this.codeStatuses.length || this.codeSites.length));
    }
  }

  clearTableFilters(): void {
    // The Stations table and Activity's Pumps share the location filters; the Codes tables and Activity's Codes the Market filter.
    if (this.view === "pumps" || this.view === "activity") {
      if (this.view === "pumps") {
        this.stationSearchTerms = [];
        this.stationSearchText = "";
        this.stationSearch = [];
        this.selectedStationStatuses = [];
        this.selectedStationAttention = [];
      } else {
        this.activitySearchTerms = [];
        this.activitySearchText = "";
        this.activitySearch = [];
        this.activityGroups = [];
        this.activityPumps = [];
        this.activityUserCodes = [];
        this.activityVehicleCodes = [];
      }
      this.selectedProductLines = [];
      this.selectedSites = [];
      this.applyFilters();
    } else if (this.codesView || this.view === "codeActivity") {
      if (this.view === "codeActivity") {
        this.codeActivitySearchTerms = [];
        this.codeActivitySearchText = "";
        this.codeActivitySearch = [];
        this.codeTypes = [];
        this.activityUserCodes = [];
        this.activityVehicleCodes = [];
      } else {
        this.codeSearchTerms = [];
        this.codeSearchText = "";
        this.codeSearch = [];
        this.codeStatuses = [];
      }
      this.codeSites = [];
      this.applyCodes();
    }
  }

  /** The table "Customize columns" picks for: the Stations table, the open Codes tab's or Activity's Pumps (null elsewhere). */
  get columnChoice(): TableColumnChoice | null {
    return this.view === "pumps"
      ? this.stationColumnChoice
      : this.view === "activity"
        ? this.activityColumnChoice
        : this.codesView
          ? this.codeColumnChoice
          : null;
  }

  /** The picker shows beside the filters while open, on a table with one. */
  get columnPickerShown(): boolean {
    return this.columnPickerOpen && !!this.columnChoice;
  }

  /** The sort the picker marks: its table's. */
  get columnPickerSort(): DataTableSort | null {
    return this.view === "pumps" ? this.stationSort : this.view === "activity" ? this.activitySort : this.codeSort;
  }

  /** The sidebar's width: the filters column, plus the column picker and the gap to it while that's open. */
  /** Nested in Home, its Settings page (its own sections alone — Fuel limits) has no column: Home's rail is its menu. */
  get hasSidebar(): boolean {
    return !(this.host && this.page === "settings");
  }

  get sidebarWidth(): number {
    // The Settings page: its section menu — and an Access page's or the Sites page's filters beside it (tb-settings-sidebar's).
    if (this.page === "settings") {
      return settingsSidebarWidth(this.settingsSection, true, this.org, this.access);
    }
    return sidebarWidth(SIDEBAR_WIDTH, this.columnPickerShown);
  }

  /** The picker's choice: shown at once and kept in the user's settings. */
  onColumnsChange(keys: string[]): void {
    const choice = this.columnChoice;
    if (!choice) {
      return;
    }
    choice.set(keys);
    if (choice === this.codeColumnChoice) {
      this.buildCodeColumns();
    }
    saveUserSettings(this.ctx, this.destroyRef, choice.settingsFor(keys));
  }

  /** The Codes tables' columns: the user's pick (a code is deleted from its panel, or several with Manage). */
  private buildCodeColumns(): void {
    this.codeColumns = [...this.codeColumnChoice.visible];
  }

  /** A Stations header click: the sort shown at once and kept in the user's settings. */
  onStationSortChange(sort: DataTableSort | null): void {
    this.stationSort = sort;
    saveUserSettings(this.ctx, this.destroyRef, { [STATION_SORT_SETTING]: sort });
  }

  /** The Assignment tree's flip: kept in the user's settings (every tree opens that way). */
  onCodeMapLayout(horizontal: boolean): void {
    this.codeMapHorizontal = horizontal;
    saveUserSettings(this.ctx, this.destroyRef, { [CODE_MAP_LAYOUT_SETTING]: horizontal });
  }

  /** A Codes header click (either tab): the sort shown at once and kept in the user's settings. */
  onCodeSortChange(sort: DataTableSort | null): void {
    this.codeSort = sort;
    saveUserSettings(this.ctx, this.destroyRef, { [CODE_SORT_SETTING]: sort });
  }

  /** The pump panel's Codes tab toggle. */
  onCodeKindChange(kind: string): void {
    this.codeKind = kind as CodeKind;
  }

  /** The Activity page's Codes: its Type filter (Users / Vehicles). */
  onCodeTypesChange(ids: string[]): void {
    this.codeTypes = ids as CodeKind[];
    this.applyCodes();
  }

  /** The Users / Vehicles tables' Status filter. */
  onCodeStatusesChange(ids: string[]): void {
    this.codeStatuses = ids as CodeStatus[];
    this.applyCodes();
  }

  /** The Codes page's Sites filter. */
  onCodeSitesChange(ids: string[]): void {
    this.codeSites = ids;
    this.applyCodes();
  }

  // -- pumps table + detail panel -----------------------------------------------

  /** A Pumps row: open that pump's panel on Insights (an open panel keeps its tab). */
  /** The Top stations card's "See more": the Reports page (its stations ranked over the window) — a new entry in the URL. */
  onSummaryLink(): void {
    this.showPage("reports");
    this.writeUrlState();
  }

  /** A Stations row: open that station's panel — or close it when it's the station already open. */
  onStationRowClick(row: Record<string, any>): void {
    const station = row as StationTableRow;
    if (this.stationOpen && this.selectedStation?.rowKey === station.rowKey) {
      this.closeStation();
      return;
    }
    this.openStation(station, "insights");
  }

  /** Show a station in its panel, on `tab` — a stop on the panels' trail (told first: it reads what's open); a pump's or a code's panel gives way. */
  private openStation(station: StationTableRow, tab: string): void {
    this.access.trail.visit(this, this.stationStop(station.rowKey));
    this.closeDetail();
    this.closeCode();
    this.closeAddPump();
    const same = this.selectedStation?.rowKey === station.rowKey && !!this.stationTotals;
    if (!same) {
      this.stationFirstLoad = new FirstLoad(); // its Insights held until its reads are in
      this.stationFiguresLoading = false;
    }
    this.selectedStation = station;
    this.stationOpenTab = tab;
    this.addStationOpen = false;
    this.stationOpen = true;
    this.resetStationSettings();
    this.applyAlarmScope();
    this.loadStationTotals(same);
  }

  closeStation(): void {
    this.closeAddPump();
    this.stationOpen = false;
    this.selectedStation = null;
    this.stationAlarms = [];
    this.stationTotalsSub?.unsubscribe();
    this.stationTotals = null;
    this.stationEventsSub?.unsubscribe();
    this.stationEventItems = [];
  }

  /**
   * The open station's Insights charts: its pumps' stored totals over {@link stationTimeframe}'s window — their quarter-hours
   * summed by the hour ({@link readPumpTotals}), never its events — and its Activity card ({@link loadStationEvents}). `keep`
   * holds what's shown — the figures, the bars, the window they're over — until the new ones are in (another window, a refresh);
   * without it (a station opened) the panel shows its wireframes meanwhile.
   */
  private loadStationTotals(keep: boolean): void {
    const st = this.selectedStation;
    this.stationTotalsSub?.unsubscribe();
    if (!st || !this.stationOpen) {
      return;
    }
    const window = chartWindow(this.stationTimeframe);
    this.loadStationEvents(keep, window); // over the same window
    if (!keep) {
      this.stationTotals = null;
      this.stationWindow = window;
    }
    this.stationTotalsAt = Date.now();
    if (!st.pumps.length) {
      this.stationWindow = window;
      this.stationTotals = new Map(); // no pumps: nothing to read (the charts' empty line)
      this.stationFiguresLoading = false;
      return;
    }
    const { start, end } = window;
    const reads = st.pumps.map((p) => this.readPumpTotals(p.pumpId, start, end, 3600 * 1000).pipe(map((buckets) => [p.pumpId, buckets] as const)));
    this.stationTotalsSub = forkJoin(reads)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((list) => {
        // The window and its totals together: the cards change from the old figures to the new at once.
        this.stationWindow = window;
        this.stationTotals = new Map(list);
        this.stationFiguresLoading = false;
        this.cd.detectChanges();
      });
  }

  /**
   * The open station's Activity card: its pumps' latest {@link RECENT_STATION_EVENTS} events in the window — each pump's latest
   * read (no more), the newest of them kept — as the alarm list's rows: what happened, its mark, when, the pump, the litres and
   * who (the holders by name, else their codes) — over `window` (the cards' window: the one they show unless given the next).
   */
  private loadStationEvents(keep: boolean, window: ChartWindow = this.stationWindow): void {
    const st = this.selectedStation;
    this.stationEventsSub?.unsubscribe();
    if (!st || !this.stationOpen) {
      return;
    }
    if (!keep) {
      this.stationEventItems = [];
    }
    this.stationEventsAt = Date.now();
    if (!st.pumps.length) {
      this.stationEventsLoading = false;
      this.stationEventItems = [];
      return;
    }
    this.stationEventsLoading = !keep;
    const { start, end } = window;
    const sources = st.pumps.map((p) => ({ entityType: EntityType.DEVICE, id: p.pumpId, label: p.shortName || p.name }));
    this.stationEventsSub = this.readEventSources(sources, start, end, RECENT_STATION_EVENTS)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ events }) => {
        const holder = (kind: CodeKind, code: string) =>
          code ? (this.markets.flatMap((m) => m.codes[kind]).find((c) => c.code === code)?.name || code) : "";
        this.stationEventItems = events.slice(0, RECENT_STATION_EVENTS).map((e) => ({
          id: e.id,
          title: e.label,
          icon: e.icon,
          tone: e.tone,
          time: e.time,
          // Its pump and litres beside the time; who — the user and the vehicle, by their holders' names — on a line under it.
          parts: [e.pump, e.volume === null ? "" : `${fmtNumber(e.volume, 1)} L`],
          sub: [holder("users", e.userCode), holder("vehicles", e.vehicleCode)],
        }));
        this.stationEventsLoading = false;
        this.cd.detectChanges();
      });
  }

  /**
   * The open station refreshed (its pumps reloaded): its totals read again — kept on show meanwhile — once the "Fuel Daily Totals"
   * chain has had its 2 minutes, or at once when its pumps changed; its latest events every 20 seconds at most.
   */
  private refreshStationTotals(pumpsBefore: string): void {
    const st = this.selectedStation;
    if (!st || !this.stationOpen) {
      return;
    }
    const pumpsNow = st.pumps.map((p) => p.pumpId).join(",");
    if (pumpsNow !== pumpsBefore || Date.now() - this.stationTotalsAt > 2 * 60_000) {
      this.loadStationTotals(true);
    } else if (Date.now() - this.stationEventsAt > 20_000) {
      this.loadStationEvents(true);
    }
  }

  // -- the panels' trail (the dashboard's: the Access store's, shared with the Settings panels) ------

  /** The station, pump and code panels — and a new code's or the import panel — closed (a panel of another store opens). */
  private closeOwnPanels(): void {
    this.closeLimits();
    this.closeAddStation();
    this.closeDetail();
    this.closeStation();
    this.closeCode();
    this.closeAssign();
    this.closeImport();
  }

  /** A panel shows this tab: where its stop on the trail opens again — and the tab it opens on follows, so opening it on another is a change the panel sees. */
  onPanelTab(panel: "station" | "pump" | "code", tab: string): void {
    let key: string | null = null;
    if (panel === "station" && this.stationOpen) {
      this.stationOpenTab = tab;
      key = this.selectedStation ? `station:${this.selectedStation.rowKey}` : null;
    } else if (panel === "pump" && this.detailOpen) {
      this.detailOpenTab = tab;
      key = this.selectedPump ? `pump:${this.selectedPump.pumpId}` : null;
    } else if (panel === "code" && this.codeOpen) {
      this.codeOpenTab = tab;
      key = this.selectedCode ? `code:${this.selectedCode.code}` : null;
    }
    if (key) {
      this.access?.trail.noteTab(key, tab);
    }
  }

  private stationStop(rowKey: string): PanelStop {
    const find = () => this.scopedStations.find((s) => s.rowKey === rowKey);
    const icons = this.icons;
    return {
      key: `station:${rowKey}`,
      // Its PLC's device profile's icon (the panel header's), as it comes in.
      get icon() {
        return icons.of("device", find()?.profile);
      },
      kind: "Station",
      label: () => find()?.name ?? null,
      isOpen: () => this.stationOpen && this.selectedStation?.rowKey === rowKey,
      open: (tab) => {
        const station = find();
        if (station) {
          this.openStation(station, tab ?? "insights");
        }
      },
      close: () => this.closeStation(),
    };
  }

  private pumpStop(pumpId: string): PanelStop {
    const find = () => this.pumps.find((p) => p.pumpId === pumpId);
    const icons = this.icons;
    return {
      key: `pump:${pumpId}`,
      // Its device profile's icon (the panel header's), as it comes in.
      get icon() {
        return icons.of("device", find()?.type);
      },
      kind: "Pump",
      label: () => find()?.name ?? null,
      isOpen: () => this.detailOpen && this.selectedPump?.pumpId === pumpId,
      open: (tab) => {
        const pump = find();
        if (pump) {
          this.openPump(pump, tab ?? "insights");
        }
      },
      close: () => this.closeDetail(),
    };
  }

  private codeStop(code: string): PanelStop {
    const find = () => this.codeRows.find((c) => c.code === code);
    const icon = () => this.codeIcon(find()?.kind ?? "users");
    return {
      key: `code:${code}`,
      // Its asset profile's icon (the panel header's), as it comes in.
      get icon() {
        return icon();
      },
      kind: "Code",
      label: () => find()?.name ?? null,
      isOpen: () => this.codeOpen && this.selectedCode?.code === code,
      open: (tab) => {
        const row = find();
        if (row) {
          this.openCode(row, tab ?? "insights");
        }
      },
      close: () => this.closeCode(),
    };
  }

  // -- station Settings tab (the PLC's identity and site, its pumps) -----------------------------

  /** The station's site differs from its saved one. */
  get stationSiteDirty(): boolean {
    const st = this.selectedStation;
    return !!st && this.stationSite !== st.plc.siteId;
  }

  /** The pumps whose label or fuel type was edited. */
  private get editedPumps(): { pump: PumpRow; edit: PumpEdit }[] {
    return (this.selectedStation?.pumps ?? [])
      .map((pump) => ({ pump, edit: this.stationPumpEdits[pump.pumpId] }))
      .filter(({ edit }) => !!edit && (edit.label.trim() !== edit.savedLabel || edit.fuelType !== edit.savedFuelType));
  }

  /** The site or a pump was edited (the card's floating Apply shows). */
  get stationSettingsDirty(): boolean {
    return this.stationSiteDirty || this.editedPumps.length > 0;
  }

  /**
   * The Pumps card's rows from the station's pumps: `reset` starts every row
   * from its saved values; otherwise (the pumps refreshed) a row keeps its
   * edits, an untouched one follows the new values, and a new pump gets a row.
   */
  private syncStationPumpEdits(reset: boolean): void {
    const next: Record<string, PumpEdit> = {};
    for (const pump of this.selectedStation?.pumps ?? []) {
      const saved = { savedLabel: pump.deviceLabel, savedFuelType: pump.fuelType };
      const e = this.stationPumpEdits[pump.pumpId];
      const untouched = !e || (e.label === e.savedLabel && e.fuelType === e.savedFuelType);
      next[pump.pumpId] = reset || untouched ? { label: pump.deviceLabel, fuelType: pump.fuelType, ...saved } : { ...e, ...saved };
    }
    this.stationPumpEdits = next;
  }

  /** The Settings tab's site picker: every fuel-management site ("label (code)"), or none. */
  private resetStationSettings(): void {
    this.stationSite = this.selectedStation?.plc.siteId ?? "";
    this.syncStationPumpEdits(true);
    const sites = new Map<string, { id: string; name: string; code: string }>();
    this.markets.forEach((m) => m.sites.forEach((site) => sites.set(site.id, site)));
    const label = (s: { name: string; code: string }) => (s.code && s.code !== s.name ? `${s.name} (${s.code})` : s.name);
    this.stationSiteOptions = [
      { value: "", label: "None" },
      ...[...sites.values()]
        .map((s) => ({ value: s.id, label: label(s) }))
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })),
    ];
  }

  /**
   * The card's Apply, with the site or a pump edited: the site's relation
   * follows, and each edited pump's label (the device's) and fuel type (its
   * attribute) are saved.
   */
  onStationSettingsApply(): void {
    const st = this.selectedStation;
    if (!st || !this.stationSettingsDirty) {
      return;
    }
    const s = this.settings;
    const siteChanged = this.stationSiteDirty;
    const pumps = this.editedPumps;
    const steps: Observable<unknown>[] = [];
    if (siteChanged) {
      const sites = new Set(this.stationSiteOptions.map((o) => String(o.value)).filter(Boolean));
      steps.push(this.relinkFrom({ entityType: EntityType.DEVICE, id: st.plc.plcId }, s.plcRelation, EntityType.ASSET, sites, this.stationSite));
    }
    for (const { pump, edit } of pumps) {
      const label = edit.label.trim();
      if (label !== edit.savedLabel) {
        steps.push(
          this.ctx.deviceService
            .getDevice(pump.pumpId, QUIET_REQUEST)
            .pipe(switchMap((device) => this.ctx.deviceService.saveDevice({ ...device, label }, QUIET_REQUEST)))
        );
      }
      if (edit.fuelType !== edit.savedFuelType) {
        const id: EntityId = { entityType: EntityType.DEVICE, id: pump.pumpId };
        steps.push(this.ctx.attributeService.saveEntityAttributes(id, AttributeScope.SERVER_SCOPE, [{ key: s.fuelTypeKey, value: edit.fuelType }], QUIET_REQUEST));
      }
    }
    this.settingsSaving = true;
    this.stationExtrasInApply = true;
    forkJoin(steps)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.settingsSaving = false;
          this.stationExtrasInApply = false;
          this.toasts.success("Settings saved");
          if (siteChanged) {
            this.loadHierarchy(); // the stations' (and their pumps') locations
          }
          if (pumps.length) {
            this.loadPumps(); // their labels and fuel types (the card's rows follow)
          }
          this.cd.detectChanges();
        },
        error: (err) => {
          this.settingsSaving = false;
          this.stationExtrasInApply = false;
          this.toasts.error(`Couldn't save the settings${apiMessage(err)}`);
          this.cd.detectChanges();
        },
      });
  }

  onStationSettingsCancel(): void {
    this.stationSite = this.selectedStation?.plc.siteId ?? "";
    this.syncStationPumpEdits(true);
  }

  /** The card saved the PLC's name / label / note: reload the stations (one toast when Apply also saved the extras). */
  onStationSettingsSaved(): void {
    const st = this.selectedStation;
    if (st && !this.stationExtrasInApply) {
      this.toasts.success("Station saved");
    }
    this.loadPlcs();
  }

  // -- a new station ("Create new" on the Stations table) ----------------------------------

  /**
   * The plants a new station can go to: every plant of the Organization — a
   * station makes a plant a Fuel site (the "Application Sites" chain links it
   * once its devices are there) — by its label with its code, its devices'
   * prefix from its product line's code ({@link plantDevicePrefix}).
   */
  get stationPlants(): StationPlant[] {
    const sites = this.org.sites.rows;
    const lines = this.org.productLines.rows;
    const memo = this.stationPlantsMemo;
    if (memo && memo.sites === sites && memo.lines === lines) {
      return memo.plants;
    }
    const lineCode = new Map(lines.map((l) => [l.id, l.name]));
    const plants = sites
      .map((x) => ({
        id: x.id,
        label: siteOptionLabel(x),
        prefix: plantDevicePrefix(lineCode.get(x.productLineId ?? "") ?? "", x.name),
        marketId: x.marketId ?? "",
      }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
    this.stationPlantsMemo = { sites, lines, plants };
    return plants;
  }

  /** "Create new" on the Stations table: a new station's panel — a blank form, the trail starts again. */
  openAddStation(): void {
    this.access.trail.reset(this);
    this.closeOwnPanels();
    if (!this.orgLoaded && !this.stationListsLoaded) {
      this.stationListsLoaded = true;
      this.org.load("site");
      this.org.load("productLine");
    }
    this.takenDeviceNames = [...this.pumps.map((p) => p.deviceName), ...this.plcs.map((p) => p.deviceName)];
    this.addStationResetKey++;
    this.addStationOpen = true;
  }

  closeAddStation(): void {
    this.addStationOpen = false;
  }

  /**
   * A new station: its PLC (the PLC profile, owned by its plant's market's
   * customer — as its pumps and codes are — linked from the plant by FuelPLC
   * and placed there, Site —Contains→ device, so the backend gives it its
   * location), then each pump as "Add pump" makes one — its label and fuel
   * type, linked from the PLC and the plant (FuelPump) and placed there — one
   * after another. A failure deletes every device made so far again. The
   * plant becomes a Fuel site once the "Application Sites" chain has seen its
   * devices: the hierarchy is read again then.
   */
  onAddStation(req: AddStationRequest): void {
    if (this.saving) {
      return;
    }
    const s = this.settings;
    const plant = this.stationPlants.find((p) => p.id === req.siteId);
    if (!plant) {
      return;
    }
    const site: EntityId = { entityType: EntityType.ASSET, id: req.siteId };
    const atSite = new Set([req.siteId]);
    const made: string[] = [];
    const relation = (from: EntityId, to: EntityId, type: string): Observable<unknown> =>
      this.ctx.entityRelationService.saveRelation({ from, to, type, typeGroup: RelationTypeGroup.COMMON }, QUIET_REQUEST);
    /** One device of `profile` (its owner set), then `then` with its id. */
    const create = (name: string, label: string, profile: string, customerId: string, then: (id: EntityId) => Observable<unknown>[]): Observable<EntityId> => {
      const device = { name, label, type: profile } as Device;
      if (customerId) {
        device.customerId = { entityType: EntityType.CUSTOMER, id: customerId } as Device["customerId"];
      }
      return this.ctx.deviceService.saveDevice(device, QUIET_REQUEST).pipe(
        switchMap((saved) => {
          made.push(saved.id.id);
          const id: EntityId = { entityType: EntityType.DEVICE, id: saved.id.id };
          return forkJoin([this.ensureCustomerOwner(saved, customerId), ...then(id)]).pipe(map(() => id));
        })
      );
    };
    this.saving = true;
    (plant.marketId ? this.marketCustomerId(plant.marketId).pipe(catchError(() => of(""))) : of(""))
      .pipe(
        switchMap((customerId) =>
          create(req.name, req.label, s.plcDeviceTypes[0], customerId, (plc) => [
            relation(site, plc, s.plcRelation),
            placeDevice(this.ctx, plc.id, req.siteId, atSite),
          ]).pipe(
            // Its pumps one after another (each name its own; a failure stops the rest).
            switchMap((plc) =>
              req.pumps.length
                ? concat(
                    ...req.pumps.map((pump) =>
                      create(pump.name, pump.label, s.pumpDeviceTypes[0], customerId, (id) => [
                        this.ctx.attributeService.saveEntityAttributes(
                          id,
                          AttributeScope.SERVER_SCOPE,
                          [
                            { key: s.pumpLabelKey, value: pump.pumpLabel },
                            { key: s.fuelTypeKey, value: pump.fuelType },
                          ],
                          QUIET_REQUEST
                        ),
                        relation(plc, id, s.stationPumpRelation),
                        relation(site, id, s.pumpRelation),
                        placeDevice(this.ctx, id.id, req.siteId, atSite),
                      ])
                    )
                  ).pipe(toArray())
                : of([])
            )
          )
        ),
        catchError((err) =>
          (made.length ? forkJoin(made.map((id) => this.ctx.deviceService.deleteDevice(id, QUIET_REQUEST).pipe(catchError(() => of(null))))) : of(null)).pipe(
            switchMap(() => throwError(() => err))
          )
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: () => {
          this.saving = false;
          const pumps = req.pumps.length === 1 ? "1 pump" : `${req.pumps.length} pumps`;
          this.toasts.success(`Station created with ${pumps}`);
          this.closeAddStation();
          this.loadPlcs(); // its row (its pumps follow: loadStationPumps)
          this.loadPumps();
          this.loadHierarchy();
          // A plant new to Fuel: the chain links it once it has seen the devices (it gathers them for 30 s) — read again then.
          const fuelSite = this.markets.some((m) => m.sites.some((x) => x.id === req.siteId));
          if (!fuelSite) {
            timer(45_000)
              .pipe(takeUntilDestroyed(this.destroyRef))
              .subscribe(() => this.loadHierarchy());
          }
          this.cd.detectChanges();
        },
        error: (err) => {
          this.saving = false;
          const msg = apiMessage(err);
          this.toasts.error(/already exists/i.test(msg) ? `A device with one of these names already exists${msg}` : `Couldn't create ${req.name}${msg}`);
          this.cd.detectChanges();
        },
      });
  }

  /** "Add pump" in the station's Pumps card: the new pump's form opens in the card. */
  openAddPump(): void {
    const st = this.selectedStation;
    if (!st) {
      return;
    }
    this.addPumpStation = st;
    this.takenDeviceNames = [...this.pumps.map((p) => p.deviceName), ...this.plcs.map((p) => p.deviceName)];
    // Named after the station: product-site-pump-#, the number the next free one.
    this.addPumpPrefix = pumpNamePrefix(st.plc.deviceName, st.pumps.map((p) => p.deviceName));
    this.addPumpNextNumber = nextPumpNumber(this.addPumpPrefix, this.takenDeviceNames);
    this.addPumpResetKey++;
    this.addPumpOpen = true;
  }

  /** Close the new pump's form (its Cancel, once added, or the station's panel closing). */
  closeAddPump(): void {
    this.addPumpOpen = false;
    this.addPumpStation = null;
  }

  /**
   * A new pump on the station: the device (the pump profile, owned by the
   * station's market's customer, as its codes are), its pump label and fuel
   * type, then its links — from the station's PLC, and from the station's site
   * (FuelPump, and Contains: placed there, so the backend gives it its
   * location). A failure after the device exists deletes it again.
   */
  onAddPump(req: AddPumpRequest): void {
    const st = this.addPumpStation;
    if (!st || this.saving) {
      return;
    }
    const s = this.settings;
    this.saving = true;
    (st.marketId ? this.marketCustomerId(st.marketId).pipe(catchError(() => of(""))) : of(""))
      .pipe(
        switchMap((customerId) => {
          const device = { name: req.name, label: req.label, type: s.pumpDeviceTypes[0] } as Device;
          if (customerId) {
            device.customerId = { entityType: EntityType.CUSTOMER, id: customerId } as Device["customerId"];
          }
          return this.ctx.deviceService.saveDevice(device, QUIET_REQUEST).pipe(
            switchMap((saved) => {
              const id: EntityId = { entityType: EntityType.DEVICE, id: saved.id.id };
              const relation = (from: EntityId, type: string): Observable<unknown> =>
                this.ctx.entityRelationService.saveRelation({ from, to: id, type, typeGroup: RelationTypeGroup.COMMON }, QUIET_REQUEST);
              const steps: Observable<unknown>[] = [
                this.ensureCustomerOwner(saved, customerId),
                this.ctx.attributeService.saveEntityAttributes(
                  id,
                  AttributeScope.SERVER_SCOPE,
                  [
                    { key: s.pumpLabelKey, value: req.pumpLabel },
                    { key: s.fuelTypeKey, value: req.fuelType },
                  ],
                  QUIET_REQUEST
                ),
                relation({ entityType: EntityType.DEVICE, id: st.plc.plcId }, s.stationPumpRelation),
                ...(st.siteId
                  ? [relation({ entityType: EntityType.ASSET, id: st.siteId }, s.pumpRelation), placeDevice(this.ctx, saved.id.id, st.siteId, new Set([st.siteId]))]
                  : []),
              ];
              return forkJoin(steps).pipe(
                map(() => saved),
                catchError((err) =>
                  this.ctx.deviceService.deleteDevice(saved.id.id, QUIET_REQUEST).pipe(
                    catchError(() => of(null)),
                    switchMap(() => throwError(() => err))
                  )
                )
              );
            })
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: () => {
          this.saving = false;
          this.toasts.success("Pump added");
          this.loadHierarchy(); // the new pump's site
          this.loadPumps();
          this.loadStationPumps();
          this.closeAddPump();
          this.cd.detectChanges();
        },
        error: (err) => {
          this.saving = false;
          this.toasts.error(`Couldn't add the pump${apiMessage(err)}`);
          this.cd.detectChanges();
        },
      });
  }

  // -- pump Settings tab: its station and pump label (beside the card's own fields) ----------------

  /** The pump's station or pump label differs from its saved one (the card's floating Apply shows). */
  get pumpSettingsDirty(): boolean {
    const p = this.selectedPump;
    return !!p && (this.pumpStation !== p.stationId || this.pumpLabelEdit.trim() !== p.pumpLabel);
  }

  /** The Settings tab's station picker (every station, "name (site)") and pump label, from the pump's saved ones. */
  private resetPumpSettings(): void {
    const p = this.selectedPump;
    this.pumpStation = p?.stationId ?? "";
    this.pumpLabelEdit = p?.pumpLabel ?? "";
    this.pumpStationOptions = [
      { value: "", label: "None" },
      ...this.allStations.map((st) => ({ value: st.rowKey, label: st.site ? `${st.name} (${st.site})` : st.name })),
    ];
  }

  /** The card's Apply, with the station or pump label changed: the PLC → pump relation and the attribute follow. */
  onPumpSettingsApply(): void {
    const p = this.selectedPump;
    if (!p || !this.pumpSettingsDirty) {
      return;
    }
    const s = this.settings;
    const id: EntityId = { entityType: EntityType.DEVICE, id: p.pumpId };
    const stationId = this.pumpStation;
    const pumpLabel = this.pumpLabelEdit.trim();
    const steps: Observable<unknown>[] = [];
    if (stationId !== p.stationId) {
      const plcs = new Set(this.plcs.map((plc) => plc.plcId));
      steps.push(this.relinkFrom(id, s.stationPumpRelation, EntityType.DEVICE, plcs, stationId));
    }
    if (pumpLabel !== p.pumpLabel) {
      steps.push(this.ctx.attributeService.saveEntityAttributes(id, AttributeScope.SERVER_SCOPE, [{ key: s.pumpLabelKey, value: pumpLabel }], QUIET_REQUEST));
    }
    this.settingsSaving = true;
    forkJoin(steps)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.settingsSaving = false;
          const station = this.allStations.find((st) => st.rowKey === stationId);
          this.toasts.success(
            stationId !== p.stationId ? (station ? "Pump moved to another station" : "Pump removed from its station") : "Pump saved"
          );
          this.loadPumps();
          this.loadStationPumps();
          this.cd.detectChanges();
        },
        error: (err) => {
          this.settingsSaving = false;
          this.toasts.error(`Couldn't save the pump${apiMessage(err)}`);
          this.cd.detectChanges();
        },
      });
  }

  onPumpSettingsCancel(): void {
    this.resetPumpSettings();
  }

  /** The card saved the pump's own fields (name, label, note, fuel type): reload the pumps. */
  onPumpSettingsSaved(): void {
    this.loadPumps();
  }

  /**
   * Point `to`'s `type` relation from one of `candidates` (entities of
   * `fromType`) at `fromId` — "" for none: any other candidate's relation is
   * removed, the new one made. Relations of that type from anything else stay.
   */
  private relinkFrom(to: EntityId, type: string, fromType: EntityType, candidates: Set<string>, fromId: string): Observable<unknown> {
    return this.ctx.entityRelationService.findByToAndType(to, type, QUIET_REQUEST).pipe(
      map((relations) => relations.filter((r) => r.from?.entityType === fromType && candidates.has(r.from.id))),
      switchMap((current) => {
        const steps: Observable<unknown>[] = current
          .filter((r) => r.from.id !== fromId)
          .map((r) => this.ctx.entityRelationService.deleteRelation(r.from, type, to, QUIET_REQUEST));
        if (fromId && !current.some((r) => r.from.id === fromId)) {
          const relation: EntityRelation = { from: { entityType: fromType, id: fromId } as EntityId, to, type, typeGroup: RelationTypeGroup.COMMON };
          steps.push(this.ctx.entityRelationService.saveRelation(relation, QUIET_REQUEST));
        }
        return steps.length ? forkJoin(steps) : of(null);
      })
    );
  }

  /** Each pump's station: the pumps each PLC links to by the station → pump relation. */
  private loadStationPumps(): void {
    const type = this.settings.stationPumpRelation;
    const plcs = this.plcs;
    const lookups = plcs.map((plc) =>
      this.ctx.entityRelationService
        .findByFromAndType({ entityType: EntityType.DEVICE, id: plc.plcId } as EntityId, type, QUIET_REQUEST)
        .pipe(catchError(() => of([] as EntityRelation[])))
    );
    (lookups.length ? forkJoin(lookups) : of([] as EntityRelation[][]))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((lists) => {
        const stations = new Map<string, string>();
        lists.forEach((relations, i) =>
          relations
            .filter((r) => r.to?.entityType === EntityType.DEVICE && !stations.has(r.to.id))
            .forEach((r) => stations.set(r.to.id, plcs[i].plcId))
        );
        this.pumpStations = stations;
        this.pumps = this.pumps.map((p) => ({ ...p, stationId: stations.get(p.pumpId) ?? "" }));
        this.applyFilters(); // the stations' pumps
        if (this.selectedPump) {
          this.selectedPump = this.pumps.find((p) => p.pumpId === this.selectedPump!.pumpId) ?? this.selectedPump;
          if (!this.pumpSettingsDirty) {
            this.resetPumpSettings();
          }
        }
        this.cd.detectChanges();
      });
  }

  /** Show a pump in the panel; `tab` null keeps the open panel's current tab. */
  private openPump(pump: PumpRow, tab: string | null): void {
    // The trail first (it reads what's open), then the station's (or a code's) panel gives way.
    this.access.trail.visit(this, this.pumpStop(pump.pumpId));
    this.closeStation();
    this.closeCode();
    this.selectedPump = pump;
    if (tab) {
      this.detailOpenTab = tab; // used when the panel opens (or reopens)
      if (this.detailOpen) {
        this.pumpPanel?.selectTab(tab); // already open — switch now
      }
    }
    this.addStationOpen = false;
    this.detailOpen = true;
    this.syncDetailInputs();
    this.resetPumpSettings();
  }

  /** Close the pump panel (its row highlight follows — see {@link highlightedPumpId}). */
  closeDetail(): void {
    this.detailOpen = false;
    this.selectedPump = null;
    this.detailAlarms = [];
  }

  /**
   * Close the pump panel on a click outside it — anywhere but the panel itself,
   * a clickable pump row (that switches the panel) or an overlay; see
   * {@link keepsSidePanelOpen}. Ignored while a code's, a new code's or the import panel is open (those, as the Settings panels, close by
   * their close button or Escape only).
   */
  @HostListener("document:pointerdown", ["$event"])
  onDocumentPointerDown(event: Event): void {
    if ((!this.detailOpen && !this.stationOpen) || this.codeOpen || this.assignOpen || this.importOpen || keepsSidePanelOpen(event.target)) {
      return;
    }
    this.closeDetail();
    this.closeStation();
    this.cd.detectChanges();
  }

  // -- code panel --------------------------------------------------------------------

  /** A Codes row: its panel, on Insights (not while managing — a click checks the row then). */
  onCodeRowClick(row: Record<string, any>): void {
    if (this.codesManage.managing) {
      return;
    }
    this.openCode(row as AccessCodeRow, "insights");
  }

  /** Show a code in its panel, on `tab` — a stop on the panels' trail (told first: it reads what's open). */
  private openCode(code: AccessCodeRow, tab: string): void {
    this.access.trail.visit(this, this.codeStop(code.code));
    this.closeDetail();
    this.closeStation();
    this.assignOpen = false;
    this.importOpen = false;
    this.selectedCode = code;
    this.setSelectedCodePlants(code);
    this.codeOpenTab = tab;
    this.addStationOpen = false;
    this.codeOpen = true;
    this.codeResetKey++;
    this.codeFirstLoad = new FirstLoad(); // its Insights held until its events are in
    this.loadCodeEvents();
    this.loadCodeLimits();
  }

  closeCode(): void {
    this.codeOpen = false;
    this.codeMapOpen = false;
    this.codeEventsSub?.unsubscribe();
  }

  /** The code panel's "doesn't fit" note's link: where the code is assigned, as a tree, in a dialog. */
  openCodeMap(): void {
    this.codeMap = this.buildCodeMap();
    this.codeMapOpen = !!this.codeMap;
  }

  /** The open code's tree ({@link codeMapOf}): its markets, its sites, their stations — each station's state for it. */
  private buildCodeMap(): CodeMap | null {
    const row = this.selectedCode;
    if (!row) {
      return null;
    }
    const s = this.settings;
    return codeMapOf(row, this.markets, this.plcs, {
      code: this.codeIcon(row.kind),
      market: this.icons.of("asset", s.marketAssetType),
      site: this.icons.of("asset", s.siteAssetType),
      station: (plc) => this.icons.of("device", plc.type),
    });
  }

  /** The panel has slid out: its code let go. */
  onCodePanelClosed(): void {
    if (!this.codeOpen) {
      this.selectedCode = null;
      this.codeEvents = [];
    }
  }

  /** The open code's list and where it works ("User code · All sites in GEA", "User code · GEA and Richmond Lab (4R20)"). */
  get codeSubtitle(): string {
    return this.selectedCode ? `${this.selectedCode.type} code · ${this.selectedCode.where}` : "";
  }

  onCodeTimeframe(id: string): void {
    this.codeTimeframe = id;
    this.loadCodeEvents();
  }

  /**
   * The open code's events: its dispenses and denials in the window at the
   * pumps where it works (its places': a market's every pump, a site's those
   * at it), and every change of it logged on its markets — each once, though
   * logged on each — since it was created (a revoked code's number given out
   * again is another code); who assigned it, from its "Code assigned" event.
   */
  private loadCodeEvents(): void {
    const r = this.selectedCode;
    this.codeEventsSub?.unsubscribe();
    if (!r) {
      return;
    }
    // The window's days up to now (its bars' slots): today and the days before it, the 13 weeks ending today over 3M — shown with
    // its events once they're in (the card keeps the window it shows until then).
    const window = chartWindow(CODE_USAGE_TIMEFRAMES.some((t) => t.id === this.codeTimeframe) ? this.codeTimeframe : "1W");
    const { start, end } = window;
    const pumps = atPlaces(r.places, this.pumps);
    const markets = r.marketIds.map((id) => this.marketById(id)).filter((m): m is MarketNode => !!m);
    const mine = (e: ActivityRow) => (r.kind === "users" ? e.userCode : e.vehicleCode) === r.code;
    // Its change events are stamped by the browser that made them: a few minutes' leeway for its clock.
    const since = (r.source.createdAt || 0) - 10 * 60_000;
    this.codeEventsLoading = true;
    // Its pumps' events from what was read lately where it covers the window (another code of the scope, the Activity page); its
    // markets' only since it was created (never cached: a change just made shows).
    this.codeEventsSub = forkJoin({
      usage: this.readEventSources(
        pumps.map((p) => ({ entityType: EntityType.DEVICE, id: p.pumpId, label: p.shortName })),
        start,
        end,
        EVENTS_PER_SOURCE,
        true
      ),
      changes: markets.length
        ? this.readEventSources(
            markets.map((m) => ({ entityType: EntityType.ASSET, id: m.id, label: m.code || m.name })),
            Math.max(0, since),
            end
          )
        : of({ events: [] as ActivityRow[], capped: false }),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ usage, changes }) => {
        const plcNames = new Map(this.plcs.map((x) => [x.plcId, x.name]));
        const pumpById = new Map(this.pumps.map((x) => [x.pumpId, x]));
        // A change's markets by their codes on its line (several, joined — collapseCodeChanges), their names in the bubble.
        const marketNames = new Map(markets.map((m) => [m.code || m.name, m.name]));
        const namesOf = (codes: string) => {
          const list = codes.split(", ");
          return list.every((c) => (marketNames.get(c) ?? c) === c) ? "" : list.map((c) => marketNames.get(c) ?? c).join(", ");
        };
        const rows = [...usage.events.filter(mine), ...this.collapseCodeChanges(changes.events.filter((e) => e.group === "codes" && mine(e)))]
          .filter((e) => e.ts >= since)
          .sort((a, b) => b.ts - a.ts);
        this.codeAddedBy = [...rows].reverse().find((e) => e.type === "code_assigned")?.by ?? "";
        this.codeEvents = rows.map((e): CodeActivityRow => {
          const pump = pumpById.get(e.pumpId);
          const station = pump ? (plcNames.get(this.pumpStations.get(pump.pumpId) ?? "") ?? "") : "";
          return {
            ...e,
            where: pump ? [station, pump.shortName].filter(Boolean).join(" · ") : e.pump,
            whereTip: pump ? "" : namesOf(e.pump),
            litres: e.volume === null ? "" : fmtNumber(e.volume, 1),
          };
        });
        this.codeWindow = window;
        this.codeEventsCapped = usage.capped;
        this.codeEventsLoading = false;
        this.cd.detectChanges();
      });
  }

  /** One of the codes changed (after a save): its entries in every market refreshed, the open panel with it. */
  private patchCode(r: AccessCodeRow, changes: Partial<AccessCode>): void {
    for (const id of r.marketIds) {
      const market = this.marketById(id);
      if (market) {
        this.patchMarketCodes(
          market.id,
          r.kind,
          market.codes[r.kind].map((c) => (c.assetId === r.source.assetId ? { ...c, ...changes } : c))
        );
      }
    }
  }

  /**
   * The panel's Settings saved: the holder's name (the asset's label) and its plants — the places they make ({@link placesOfPlants})
   * against those it has: each new one linked to it (an active code: its slot
   * taken, room checked first — its own slots don't count, they move with
   * it), then each old one cleared (its slot freed, its link removed) — then
   * the edit logged on its markets, those it was in and those it's in now.
   * Moved, it joins the access groups of its new plants and leaves those
   * covering none of them.
   */
  onCodeSaved(change: CodeFormChange): void {
    const r = this.selectedCode;
    if (!r) {
      return;
    }
    const c = r.source;
    const renamed = change.name !== c.name;
    const places = change.plantIds ? placesOfPlants(change.plantIds, this.markets) : r.places;
    const added = places.filter((p) => !r.places.some((q) => samePlace(p, q)));
    const removed = r.places.filter((p) => !places.some((q) => samePlace(p, q)));
    const moved = added.length > 0 || removed.length > 0;
    if (!renamed && !moved && !change.limits) {
      return;
    }
    // Only an active code (as stored) holds slots in its places' lists.
    const listed = c.status === "active";
    if (moved) {
      if (!places.length) {
        this.toasts.warn("Pick at least one plant.");
        return;
      }
      if (!this.plcsLoaded) {
        this.toasts.warn("Still loading the stations — try again in a moment.");
        return;
      }
      const room = listed && added.length ? placesRoom(added, this.markets, c.assetId) : null;
      const reason = room ? codeRoomReason(room, r.kind, placesText(added, this.markets, true)) : null;
      if (reason) {
        this.toasts.warn(reason);
        return;
      }
    }
    const entityId = { entityType: EntityType.ASSET, id: c.assetId };
    const k = codeAssetConfig(this.settings, r.kind);
    const cfg = QUIET_REQUEST;
    const steps: Observable<unknown>[] = [];
    if (renamed) {
      steps.push(
        this.ctx.assetService.getAsset(c.assetId, cfg).pipe(switchMap((asset) => this.ctx.assetService.saveAsset({ ...asset, label: change.name }, cfg)))
      );
    }
    // Its fuel limits: its limit alarms read them at once.
    if (change.limits) {
      steps.push(this.saveFuelLimits(c.assetId, change.limits));
    }
    // Its new places first (linked, their slots taken), then its old ones cleared: never a moment it works nowhere.
    const join = added.map((p) =>
      this.ctx.entityRelationService
        .saveRelation({ from: { entityType: EntityType.ASSET, id: placeScopeId(p) }, to: entityId, type: k.relation, typeGroup: RelationTypeGroup.COMMON }, cfg)
        .pipe(switchMap(() => (listed ? this.updateScopeList(placeScopeId(p), r.kind, (raw) => withCode(raw, c.code, this.placeLength(p, r.kind))) : of(null))))
    );
    const leave = removed.map((p) =>
      (listed ? this.updateScopeList(placeScopeId(p), r.kind, (raw) => withoutCode(raw, c.code, this.placeLength(p, r.kind))) : of(null)).pipe(
        switchMap(() => this.ctx.entityRelationService.deleteRelation({ entityType: EntityType.ASSET, id: placeScopeId(p) }, k.relation, entityId, cfg))
      )
    );
    const what = [
      renamed ? `holder renamed to ${change.name}` : "",
      moved ? `moved to ${placesText(places, this.markets, true)}` : "",
      change.limits ? "fuel limits changed" : "",
    ]
      .filter(Boolean)
      .join(", ");
    const marketIds = [...new Set([...r.marketIds, ...places.map((p) => p.marketId)])];
    this.saving = true;
    (steps.length ? forkJoin(steps) : of([]))
      .pipe(
        switchMap(() => (join.length ? forkJoin(join) : of([]))),
        switchMap(() => (leave.length ? forkJoin(leave) : of([]))),
        switchMap(() => this.logCodeEvents([{ marketIds, event: this.codeEvent("code_updated", r.kind, c.code, c.name, r.places, what) }])),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: () => {
          this.saving = false;
          const now = { ...c, name: change.name };
          if (moved) {
            this.regroupCode(r.kind, c.assetId, r.places, places);
            this.setCodePlaces(r.kind, now, r.places, places);
          }
          this.patchCode(this.selectedCode ?? r, { name: change.name });
          if (change.limits && this.selectedCode?.source.assetId === c.assetId) {
            // Its card and its Insights' lines against them.
            this.codeLimits = change.limits;
            this.codeUseRows = fuelUseRows(this.codeUse, change.limits);
          }
          this.codeResetKey++;
          this.toasts.success(`Code ${c.code} saved`);
          this.loadCodeEvents();
          this.cd.detectChanges();
        },
        error: (err) => {
          this.saving = false;
          this.toasts.error(`Couldn't save the code${apiMessage(err)}`);
          if (moved) {
            this.loadHierarchy(); // where it is now, as stored
          }
          this.cd.detectChanges();
        },
      });
  }

  /**
   * A code moved: its entries in the markets' lists follow — those of the
   * places it left dropped, one for each place it went to (its asset's
   * values `entry`).
   */
  private setCodePlaces(kind: CodeKind, entry: AccessCode, before: CodePlace[], after: CodePlace[]): void {
    for (const id of new Set([...before, ...after].map((p) => p.marketId))) {
      const market = this.marketById(id);
      if (!market) {
        continue;
      }
      const kept = market.codes[kind].filter((c) => c.assetId !== entry.assetId || after.some((p) => p.marketId === id && p.siteId === c.siteId));
      const fresh = after
        .filter((p) => p.marketId === id && !kept.some((c) => c.assetId === entry.assetId && c.siteId === p.siteId))
        .map((p): AccessCode => ({ ...entry, siteId: p.siteId }));
      this.patchMarketCodes(id, kind, [...kept, ...fresh]);
    }
  }

  /** The panel's Disable: confirmed first (the themed dialog). */
  askDisableCode(): void {
    const r = this.selectedCode;
    if (!r) {
      return;
    }
    this.disableConfirm = {
      heading: "Disable access code?",
      message: `Code ${r.code} (${r.source.name || "no name"}) will stop working at every pump ${this.pumpsWhere(r.places)} until it's enabled.`,
    };
  }

  /** Where a code's pumps are, after "every pump": "in GEA" (a market), "at Richmond Lab (4R20)" (a site), "at every plant", "at GEA and …". */
  private pumpsWhere(places: CodePlace[]): string {
    const text = placesText(places, this.markets, true);
    if (places.length === 1 && !places[0].siteId) {
      const m = this.marketById(places[0].marketId);
      return `in ${m?.name ?? text}`;
    }
    return `at ${text}`;
  }

  confirmDisableCode(): void {
    this.disableConfirm = null;
    this.setCodeListed(false);
  }

  /** The panel's Enable: only with room in each of its places' lists. */
  enableCode(): void {
    const r = this.selectedCode;
    if (!r) {
      return;
    }
    const room = placesRoom(r.places, this.markets, r.source.assetId);
    const reason = room ? codeRoomReason(room, r.kind, placesText(r.places, this.markets, true)) : null;
    if (reason) {
      this.toasts.warn(reason);
      return;
    }
    this.setCodeListed(true);
  }

  /** The panel's Delete: Manage's, for this code (confirmed first). */
  deleteOpenCode(): void {
    if (this.selectedCode) {
      this.askDeleteCodes([this.selectedCode]);
    }
  }

  /**
   * Disable the open code — out of each of its places' lists (its slots
   * freed), then marked disabled — or enable it — into each list's first
   * free slot, then marked active — and log it on its markets. The lists
   * first: what the stations hold changes before what the dashboard shows.
   */
  private setCodeListed(listed: boolean): void {
    const r = this.selectedCode;
    if (!r) {
      return;
    }
    if (!this.plcsLoaded) {
      this.toasts.warn("Still loading the stations — try again in a moment.");
      return;
    }
    const status: CodeStatus = listed ? "active" : "disabled";
    const lists = r.places.map((p) => {
      const length = this.placeLength(p, r.kind);
      return this.updateScopeList(placeScopeId(p), r.kind, (raw) => (listed ? withCode(raw, r.code, length) : withoutCode(raw, r.code, length)));
    });
    this.saving = true;
    (lists.length ? forkJoin(lists) : of([]))
      .pipe(
        switchMap(() =>
          this.ctx.attributeService.saveEntityAttributes(
            { entityType: EntityType.ASSET, id: r.source.assetId },
            AttributeScope.SERVER_SCOPE,
            [{ key: this.settings.codeStatusKey, value: status }],
            QUIET_REQUEST
          )
        ),
        switchMap(() =>
          this.logCodeEvents([
            { marketIds: r.marketIds, event: this.codeEvent(listed ? "code_enabled" : "code_disabled", r.kind, r.code, r.source.name, r.places) },
          ])
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: () => {
          this.saving = false;
          this.patchCode(r, { status });
          this.toasts.success(`Code ${r.code} ${listed ? "enabled" : "disabled"}`);
          this.loadCodeEvents();
          this.cd.detectChanges();
        },
        error: (err) => {
          this.saving = false;
          this.toasts.error(`Couldn't ${listed ? "enable" : "disable"} the code${apiMessage(err)}`);
          this.cd.detectChanges();
        },
      });
  }

  // -- pumps: Release events (a stalled drain) -------------------------------------------------------

  /** The open pump's release is under way: asked for here and not yet reported back, or the backend on a step. */
  get releasingEvents(): boolean {
    return !!this.selectedPump && this.releasingEventsOf(this.selectedPump);
  }

  /** A pump's release is under way: asked for here and not yet reported back, or the backend on a step. */
  releasingEventsOf(p: PumpRow): boolean {
    return this.releaseWatch?.pumpId === p.pumpId || RELEASE_STEPS_UNDER_WAY.includes(p.releaseStep);
  }

  /** The open station's pumps' ids (its Alarms tab's Notifications cover them) — the same list while they're the same pumps. */
  get stationPumpIds(): string[] {
    const ids = this.selectedStation?.pumps.map((p) => p.pumpId) ?? [];
    if (ids.join(",") !== this.stationPumpIdsCache.join(",")) {
      this.stationPumpIdsCache = ids;
    }
    return this.stationPumpIdsCache;
  }
  private stationPumpIdsCache: string[] = [];

  /** A station's pumps whose PLC has held their event frame for over 5 minutes (its Settings tab's "Release events"). */
  stalledPumpsOf(station: { pumps: PumpRow[] }): PumpRow[] {
    const now = Date.now();
    return station.pumps.filter((p) => pumpEventsStalled(p, now));
  }

  /**
   * A pump's Release events (the station's Settings tab's Manage card — or an open pump panel's — while its PLC has held its event
   * frame for over 5 minutes): confirmed first.
   */
  askReleaseEvents(p: PumpRow | null): void {
    if (!p || !pumpEventsStalled(p, Date.now())) {
      return;
    }
    if (this.releaseWatch) {
      this.toasts.warn("A release is still running — try again in a moment.");
      return;
    }
    const since = formatWhen(p.eventsWaitingSince).replace(/^(Today|Yesterday)/, (day) => day.toLowerCase());
    this.releaseConfirm = {
      pump: p,
      heading: "Release events?",
      message:
        `The PLC has held ${p.name}'s next event since ${since}, so no newer ones come in. ThingsBoard saves that event if it ` +
        `hasn't, reconnects the pump if its gateway dropped it, and acknowledges it so the PLC sends the next.`,
    };
  }

  /**
   * Confirmed: the pump's request saved (its {@link FuelDashboardSettings.eventReleaseRequestKey}) —
   * the "Fuel Event Release" rule chain takes it within 30 s — then followed
   * until the chain logs how it went ({@link checkReleaseWatch}), a toast.
   */
  confirmReleaseEvents(): void {
    const p = this.releaseConfirm?.pump;
    this.releaseConfirm = null;
    if (!p) {
      return;
    }
    const since = Date.now();
    this.releaseWatch = { pumpId: p.pumpId, since };
    const id = { entityType: EntityType.DEVICE, id: p.pumpId };
    this.ctx.attributeService
      .saveEntityAttributes(id, AttributeScope.SERVER_SCOPE, [{ key: this.settings.eventReleaseRequestKey, value: since }], QUIET_REQUEST)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toasts.info("Releasing the pump's events…");
          clearTimeout(this.releaseWatchTimer);
          this.releaseWatchTimer = setTimeout(() => this.endReleaseWatch("timeout"), FuelManagementDashboardComponent.RELEASE_WATCH_MS);
          this.cd.detectChanges();
        },
        error: (err) => {
          this.releaseWatch = null;
          this.toasts.error(`Couldn't release the pump's events${apiMessage(err)}`);
          this.cd.detectChanges();
        },
      });
    this.cd.detectChanges();
  }

  /** How long a release asked for here is followed before it's left to the backend (its retries go on). */
  private static readonly RELEASE_WATCH_MS = 5 * 60_000;

  /**
   * A release asked for here, against the pumps just read: the chain's log
   * since it was asked says how it went — released (or the pump no longer
   * holding a frame), nothing to release, or given up — each its toast.
   * A step still trying keeps it followed.
   */
  private checkReleaseWatch(): void {
    const w = this.releaseWatch;
    const p = w ? this.pumps.find((x) => x.pumpId === w.pumpId) : undefined;
    if (!w || !p) {
      return;
    }
    // Its log entries from the request on (a few seconds' leeway: the chain's clock, not the browser's).
    const log = p.releaseLog && p.releaseLog.ts >= w.since - 10_000 ? p.releaseLog.log : null;
    if (log?.action === "released" || p.eventsWaitingSince === null) {
      this.endReleaseWatch("released");
    } else if (log?.action === "nothing") {
      this.endReleaseWatch("nothing");
    } else if (log?.action === "gave-up") {
      this.endReleaseWatch("gave-up", log.note);
    }
  }

  /** The release followed is done with: how it went, a toast. */
  private endReleaseWatch(outcome: "released" | "nothing" | "gave-up" | "timeout", note = ""): void {
    const w = this.releaseWatch;
    if (!w) {
      return;
    }
    this.releaseWatch = null;
    clearTimeout(this.releaseWatchTimer);
    if (outcome === "released") {
      this.toasts.success("The pump's events are moving again");
    } else if (outcome === "nothing") {
      this.toasts.info("Nothing to release: the pump's events are moving.");
    } else if (outcome === "gave-up") {
      this.toasts.error(`Couldn't release the pump's events${note ? `: ${note}` : "."}`);
    } else {
      this.toasts.warn("The pump's events are still held. ThingsBoard keeps trying.");
    }
    this.cd.detectChanges();
  }

  /** A pump's {@link FuelDashboardSettings.eventHealKey} latest point, read as a log entry. */
  private releaseLogOf(point: { ts?: number | string; value?: unknown } | undefined): PumpRow["releaseLog"] {
    const log = parseReleaseLog(point?.value);
    const ts = Number(point?.ts) || 0;
    return log && ts ? { ts, log } : null;
  }

  // -- fuel limits ---------------------------------------------------------------------------------

  /**
   * The open code's fuel limits (server attributes) and its use of today, this
   * month and this year (the backend's totals, time series) — its Settings'
   * Limits card and its Insights' lines. Held (its Insights' wireframe) until in.
   */
  private loadCodeLimits(): void {
    const assetId = this.selectedCode?.source.assetId;
    this.codeLimits = null;
    this.codeUseRows = [];
    this.codeLimitsSub?.unsubscribe();
    if (!assetId) {
      return;
    }
    const id = { entityType: EntityType.ASSET, id: assetId };
    this.codeLimitsSub = forkJoin([
      this.ctx.attributeService.getEntityAttributes(id, AttributeScope.SERVER_SCOPE, FUEL_LIMIT_KEYS, QUIET_REQUEST).pipe(catchError(() => of([]))),
      this.ctx.attributeService.getEntityTimeseriesLatest(id, FUEL_USED_KEYS, false, QUIET_REQUEST).pipe(catchError(() => of({}))),
    ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([attrs, ts]) => {
        if (this.selectedCode?.source.assetId !== assetId) {
          return;
        }
        const limits = parseFuelLimits((k) => attrs.find((a) => a.key === k)?.value);
        const latest = ts as Record<string, { value?: unknown }[]>;
        this.codeUse = parseFuelUse((k) => latest[k]?.[0]?.value);
        this.codeLimits = limits;
        this.codeUseRows = fuelUseRows(this.codeUse, limits);
        this.cd.detectChanges();
      });
  }

  /** Save a code's, a site's or a market's limits — a pump's, its device's (server attributes: its limit alarms read them at once). */
  private saveFuelLimits(id: string, limits: FuelLimits, entityType: EntityType.ASSET | EntityType.DEVICE = EntityType.ASSET): Observable<unknown> {
    return this.ctx.attributeService.saveEntityAttributes(
      { entityType, id },
      AttributeScope.SERVER_SCOPE,
      fuelLimitAttributes(limits),
      QUIET_REQUEST
    );
  }

  /** Settings › Fuel limits: a market's, a site's or a pump's row opens its limits panel (the other panels give way). */
  openLimits(target: FuelLimitsTarget): void {
    this.access.trail.reset(this);
    this.closeOwnPanels();
    this.limitsTarget = target;
    this.limitsResetKey++;
    this.limitsOpen = true;
    this.cd.detectChanges();
  }

  closeLimits(): void {
    this.limitsOpen = false;
  }

  /** Each pump's station by name, by the pump's id (Settings › Fuel limits tells a site's two P01s apart) — kept while the pumps and stations are. */
  get pumpStationNames(): Record<string, string> {
    if (this.pumpStationsOf?.pumps !== this.pumps || this.pumpStationsOf.plcs !== this.plcs) {
      const plcName = new Map(this.plcs.map((p) => [p.plcId, p.name] as const));
      const names: Record<string, string> = {};
      for (const p of this.pumps) {
        const station = plcName.get(p.stationId);
        if (station) {
          names[p.pumpId] = station;
        }
      }
      this.pumpStationsOf = { pumps: this.pumps, plcs: this.plcs, names };
    }
    return this.pumpStationsOf.names;
  }

  private pumpStationsOf?: { pumps: PumpRow[]; plcs: PlcRow[]; names: Record<string, string> };

  /** The limits panel's icon: its profile's (a market's, a site's, a pump's). */
  get limitsIcon(): string {
    const t = this.limitsTarget;
    if (!t) {
      return "";
    }
    return t.kind === "pump"
      ? this.icons.of("device", t.profile || this.settings.pumpDeviceTypes[0] || "")
      : this.icons.of("asset", t.kind === "site" ? this.settings.siteAssetType : this.settings.marketAssetType);
  }

  /** "Market", "Site" — a pump's with its site ("Pump · Sim Site 1 (SIM1)"). */
  get limitsSubtitle(): string {
    const t = this.limitsTarget;
    if (!t) {
      return "";
    }
    return t.kind === "pump" ? (t.place ? `Pump · ${t.place}` : "Pump") : t.kind === "site" ? "Site" : "Market";
  }

  /** The limits panel's Apply: saved, then the section's table (and the panel) read again. */
  saveLimits(limits: FuelLimits): void {
    const t = this.limitsTarget;
    if (!t) {
      return;
    }
    this.limitsSaving = true;
    this.saveFuelLimits(t.id, limits, t.kind === "pump" ? EntityType.DEVICE : EntityType.ASSET)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.limitsSaving = false;
          if (this.limitsTarget?.id === t.id) {
            this.limitsTarget = { ...t, limits };
            this.limitsResetKey++;
          }
          this.limitsRefreshKey++;
          this.toasts.success("Fuel limits saved");
          this.cd.detectChanges();
        },
        error: (err) => {
          this.limitsSaving = false;
          this.toasts.error(`Couldn't save the fuel limits${apiMessage(err)}`);
          this.cd.detectChanges();
        },
      });
    this.cd.detectChanges();
  }

  // -- codes: Reset PIN (the panel's user code) -----------------------------------------------------

  /** The open code's Reset PIN is running (its Manage link shows it). */
  get resettingPin(): boolean {
    return !!this.pinResetAssetId && this.pinResetAssetId === this.selectedCode?.source.assetId;
  }

  /**
   * The panel's Reset PIN (an active user code): confirmed first, naming
   * where its stations are — the PLCs of its places. One reset at a time: two
   * at once would race for a station's user to clear.
   */
  askResetPin(): void {
    const r = this.selectedCode;
    if (!r || r.kind !== "users") {
      return;
    }
    if (!this.plcsLoaded) {
      this.toasts.warn("Still loading the stations — try again in a moment.");
      return;
    }
    if (this.pinResetAssetId) {
      this.toasts.warn("A PIN reset is still running — try again in a moment.");
      return;
    }
    const plcs = atPlaces(r.places, this.plcs);
    if (!plcs.length) {
      this.toasts.warn(`No station ${this.pumpsWhere(r.places)} holds code ${r.code}.`);
      return;
    }
    this.pinResetConfirm = {
      plcs,
      heading: "Reset PIN?",
      message: `Code ${r.code} (${r.source.name || "no name"}) will have its PIN cleared at ${plcs.length === 1 ? "the station" : "every station"} ${this.pumpsWhere(r.places)}.`,
    };
  }

  /**
   * Confirmed: the PIN cleared at each of the code's stations (a few at a
   * time), then how it went said — each station that didn't, and why. The
   * "Fuel PIN Reset" rule chain logs each one done on its station's market;
   * the panel's activity is read again a moment later to show it.
   */
  confirmResetPin(): void {
    const r = this.selectedCode;
    const plcs = this.pinResetConfirm?.plcs ?? [];
    this.pinResetConfirm = null;
    if (!r || !plcs.length) {
      return;
    }
    const assetId = r.source.assetId;
    this.pinResetAssetId = assetId;
    from(plcs)
      .pipe(
        mergeMap((plc) => this.resetPinAt(plc, r).pipe(map((error) => ({ plc, error }))), FuelManagementDashboardComponent.BULK_CONCURRENCY),
        toArray(),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((results) => {
        this.pinResetAssetId = null;
        const failed = results.filter((x) => x.error);
        const done = results.length - failed.length;
        const why = failed.map((x) => (results.length === 1 ? x.error : `${x.plc.name} — ${x.error}`)).join("; ");
        if (!failed.length) {
          this.toasts.success(`PIN reset for code ${r.code}${done > 1 ? ` at ${done} stations` : ""}`);
        } else if (done) {
          this.toasts.warn(`PIN reset for code ${r.code} at ${done} of ${results.length} stations. Not at ${why}.`);
        } else {
          this.toasts.error(`Couldn't reset the PIN of code ${r.code}: ${why}.`);
        }
        if (done) {
          timer(1500)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(() => {
              if (this.selectedCode?.source.assetId === assetId) {
                this.loadCodeEvents();
              }
            });
        }
        this.cd.detectChanges();
      });
    this.cd.detectChanges();
  }

  /**
   * Clear a user's PIN at one station: unless its PLC is still on an earlier
   * reset (its flag still up), the user's code is written to it and read
   * back ({@link plcSetUser}), then the flag — a persistent RPC carrying the
   * event's details ({@link PinResetInfo}) — and the PLC's answer awaited.
   * Null when done, else why not.
   */
  private resetPinAt(plc: PlcRow, r: AccessCodeRow): Observable<string | null> {
    const s = this.settings;
    const market = this.marketById(plc.marketId);
    const info: PinResetInfo = {
      fuelEvent: PIN_RESET_EVENT,
      code: r.code,
      holder: r.source.name,
      station: plc.name,
      where: plc.siteId ? placesText([{ marketId: plc.marketId, siteId: plc.siteId }], this.markets, true) : (market?.name ?? plc.site),
      by: this.actor,
    };
    const id = { entityType: EntityType.DEVICE, id: plc.plcId };
    return this.ctx.attributeService.getEntityAttributes(id, AttributeScope.CLIENT_SCOPE, [s.pinResetRequestKey], QUIET_REQUEST).pipe(
      catchError(() => of([] as { key: string; value: unknown }[])),
      switchMap((attrs) =>
        parseBool(attrs.find((a) => a.key === s.pinResetRequestKey)?.value)
          ? of("it's still clearing another PIN")
          : this.plcSetUser(plc.plcId, r.code).pipe(
              switchMap((error) => (error ? of(error) : this.plcSet(plc.plcId, s.pinResetRequestKey, "true", info)))
            )
      ),
      catchError((err) => of(this.rpcFailure(err)))
    );
  }

  /**
   * Put the user on a station's PLC: their code written to its user tag, then
   * read back — the flag only goes up once the PLC holds that code, never on
   * a user left there from before. What the PLC holds counts, not what the
   * write said: gateway 3.8's OPC UA connector reports an all-digit string
   * as not written ("'int' object has no attribute 'encode'" — the PLC
   * refuses its first write's timestamp yet takes the value, and its retry
   * casts the string to a number) while the PLC has it. Null when it holds
   * the code, else why not.
   */
  private plcSetUser(plcId: string, code: string): Observable<string | null> {
    const key = this.settings.pinResetUserKey;
    return this.plcSet(plcId, key, code).pipe(
      catchError((err) => of(this.rpcFailure(err))),
      switchMap((writeError) =>
        this.plcGet(plcId, key).pipe(map((value) => (value != null && String(value) === code ? null : (writeError ?? "the station didn't take the code"))))
      )
    );
  }

  /** One of a PLC's values as it holds it now — the OPC UA connector's reserved `get` RPC, by its key; undefined when it can't be read. */
  private plcGet(plcId: string, key: string): Observable<unknown> {
    const body = { method: "get", params: key, timeout: PIN_RESET_RPC_TIMEOUT_MS };
    return this.ctx.http.post<unknown>(`/api/rpc/twoway/${plcId}`, body, defaultHttpOptionsFromConfig(QUIET_REQUEST)).pipe(
      map((reply) => (gatewayRpcError(reply) ? undefined : (reply as { result?: { value?: unknown } } | null)?.result?.value)),
      catchError(() => of(undefined))
    );
  }

  /**
   * Write one of a PLC's values through its gateway — the OPC UA connector's
   * reserved `set` RPC, naming the key the connector maps to the PLC's tag —
   * and wait for the PLC's answer: null when written, else why not. With
   * `info`, a persistent RPC (ThingsBoard hands it to the PLC profile's rule
   * chain once answered), its outcome read back as it comes in.
   */
  private plcSet(plcId: string, key: string, value: string, info?: PinResetInfo): Observable<string | null> {
    const body = { method: "set", params: `${key}; ${value}`, timeout: PIN_RESET_RPC_TIMEOUT_MS, ...(info ? { persistent: true, additionalInfo: info } : {}) };
    const reply = this.ctx.http.post<unknown>(`/api/rpc/twoway/${plcId}`, body, defaultHttpOptionsFromConfig(QUIET_REQUEST));
    return info
      ? reply.pipe(
          switchMap((r) => {
            const rpcId = (r as { rpcId?: unknown } | null)?.rpcId;
            return typeof rpcId === "string" && rpcId ? this.awaitRpc(rpcId) : of(gatewayRpcError(r) ?? "the station didn't answer");
          })
        )
      : reply.pipe(map((r) => gatewayRpcError(r)));
  }

  /** A persistent RPC's outcome, read every second until it has one (a few seconds past its timeout): null done, else why not. */
  private awaitRpc(rpcId: string): Observable<string | null> {
    const opts = defaultHttpOptionsFromConfig(QUIET_REQUEST);
    return timer(500, 1000).pipe(
      take(Math.ceil(PIN_RESET_RPC_TIMEOUT_MS / 1000) + 5),
      concatMap(() => this.ctx.http.get<{ status?: string; response?: unknown }>(`/api/rpc/persistent/${rpcId}`, opts).pipe(catchError(() => of(null)))),
      filter((rpc): rpc is { status: string; response?: unknown } => !!rpc?.status && RPC_FINAL_STATUSES.includes(rpc.status)),
      take(1),
      map((rpc) =>
        rpc.status === "SUCCESSFUL"
          ? gatewayRpcError(rpc.response)
          : rpc.status === "FAILED"
            ? (gatewayRpcError(rpc.response) ?? "the station refused it")
            : "the station didn't answer"
      ),
      defaultIfEmpty<string | null, string>("the station didn't answer")
    );
  }

  /** Why an RPC call failed: no answer in time (the station or its gateway offline), else ThingsBoard's reason. */
  private rpcFailure(err: unknown): string {
    const status = (err as { status?: number } | null)?.status;
    if (status === 504 || status === 408 || status === 409) {
      return "the station didn't answer";
    }
    const reason = apiMessage(err);
    return reason.startsWith(": ") ? reason.slice(2) : "the request failed";
  }

  // -- codes: Delete (the panel's code, or Manage's checked ones) ------------------------------------

  /** Manage's checked codes still shown (the search can hide checked rows — those are left alone). */
  private get checkedCodeRows(): AccessCodeRow[] {
    const shown = new Set((this.codesTable?.dataSource.filteredData ?? this.codeRows).map((r) => r["code"]));
    return (this.codesManage.selected as AccessCodeRow[]).filter((r) => shown.has(r.code));
  }

  /** Manage's "Delete (n)": the checked codes, confirmed first. */
  askDeleteChecked(): void {
    this.askDeleteCodes(this.checkedCodeRows);
  }

  /** Delete codes — asked first (the themed confirm dialog). */
  private askDeleteCodes(rows: AccessCodeRow[]): void {
    if (!rows.length) {
      return;
    }
    const one = rows[0];
    const markets = [...new Set(rows.flatMap((r) => r.marketIds))];
    const only = markets.length === 1 ? this.marketById(markets[0]) : null;
    this.deleteConfirm = {
      rows,
      heading: rows.length === 1 ? "Delete access code?" : `Delete ${rows.length} access codes?`,
      message:
        rows.length === 1
          ? `Code ${one.code} (${one.source.name || "no name"}) will stop working at every pump ${this.pumpsWhere(one.places)}.`
          : `${rows.length} codes will stop working at every pump in ${only ? only.name : `${markets.length} markets`}.`,
    };
  }

  /**
   * Confirmed: delete the codes' assets a few at a time, then clear every
   * deleted code from each of its places' lists in one write per place and
   * list, log the changes ("code_revoked", each on every market of its code)
   * in one request per market, and drop them from the markets' codes — one
   * code (the panel's) or many (Manage's) alike.
   * A failed list update still counts as deleted — the asset (the source of
   * truth) is gone — but says so.
   */
  confirmDeleteCodes(): void {
    const rows = this.deleteConfirm?.rows ?? [];
    this.deleteConfirm = null;
    if (!rows.length) {
      return;
    }
    if (!this.plcsLoaded) {
      this.toasts.warn("Still loading the stations — try again in a moment.");
      return;
    }
    const cfg = QUIET_REQUEST;
    this.saving = true;
    from(rows)
      .pipe(
        mergeMap(
          (r) =>
            this.ctx.assetService.deleteAsset(r.source.assetId, cfg).pipe(
              map(() => ({ r, ok: true })),
              catchError(() => of({ r, ok: false }))
            ),
          FuelManagementDashboardComponent.BULK_CONCURRENCY
        ),
        toArray(),
        switchMap((results) => {
          const deleted = results.filter((x) => x.ok).map((x) => x.r);
          // One list write per place (a site, else the market) + list, every place of every code deleted.
          const groups = new Map<string, { place: CodePlace; kind: CodeKind; codes: AccessCodeRow[] }>();
          for (const r of deleted) {
            for (const place of r.places) {
              const key = `${placeScopeId(place)}:${r.kind}`;
              const g = groups.get(key) ?? { place, kind: r.kind, codes: [] };
              g.codes.push(r);
              groups.set(key, g);
            }
          }
          const writes = [...groups.values()].map((g) =>
            this.updateScopeList(placeScopeId(g.place), g.kind, (raw) =>
              withoutCodes(raw, g.codes.map((c) => c.code), this.placeLength(g.place, g.kind))
            ).pipe(
              map(() => ({ g, ok: true })),
              catchError(() => of({ g, ok: false }))
            )
          );
          const logs = [
            this.logCodeEvents(
              deleted.map((c) => ({ marketIds: c.marketIds, event: this.codeEvent("code_revoked", c.kind, c.code, c.source.name, c.places) }))
            ),
          ];
          return forkJoin({ writes: writes.length ? forkJoin(writes) : of([]), logs: logs.length ? forkJoin(logs) : of([]) }).pipe(
            map(({ writes: w }) => ({ results, deleted, listsFailed: w.filter((x) => !x.ok).reduce((n, x) => n + x.g.codes.length, 0) }))
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(({ results, deleted, listsFailed }) => {
        this.saving = false;
        const gone = new Set(deleted.map((r) => r.source.assetId));
        for (const marketId of new Set(deleted.flatMap((r) => r.marketIds))) {
          for (const kind of CODE_KINDS.map((k) => k.id)) {
            const current = this.marketById(marketId);
            if (current && current.codes[kind].some((c) => gone.has(c.assetId))) {
              this.patchMarketCodes(marketId, kind, current.codes[kind].filter((c) => !gone.has(c.assetId)));
            }
          }
        }
        const done = deleted.length;
        const failed = results.length - done;
        const named = done === 1 ? `Code ${deleted[0].code}` : `${done} codes`;
        if (failed) {
          this.toasts.error(results.length === 1 ? "Couldn't delete the code." : `Deleted ${done} of ${results.length} codes — ${failed} couldn't be deleted.`);
        } else if (listsFailed) {
          this.toasts.warn(
            done === 1
              ? `${named} deleted, but its code list couldn't be updated.`
              : `${named} deleted, but ${listsFailed} couldn't be cleared from their code lists.`
          );
        } else {
          this.toasts.success(`${named} deleted`);
        }
        this.codesTable?.clearChecked();
        this.codesManage.selected = [];
        this.scheduleActivityRefresh();
        this.cd.detectChanges();
      });
  }

  // -- a new code's panel ("Create new") ---------------------------------------

  /**
   * The codes table's footer links: "Create new" opens a new code's panel,
   * "Import" the import panel — both with the sites of the Sites filter
   * ticked (none picked: none).
   */
  onCodeAction(id: string): void {
    const plants = [...this.codeSites];
    if (id === "add") {
      this.openAssign(plants);
    } else if (id === "import") {
      this.openImport(plants);
    }
  }

  /** Open a new code's panel (on the list currently shown, `plantIds` ticked) — a blank form: the trail starts again. */
  openAssign(plantIds: string[]): void {
    if (!this.markets.length) {
      this.toasts.warn("No fuel-management market to add codes to.");
      return;
    }
    this.access.trail.reset(this);
    this.closeCode();
    this.closeImport();
    this.assignPlantIds = plantIds;
    this.ensureAccessLists();
    this.assignKind = this.filteredKind;
    this.refreshTakenCodes();
    this.applyAssignPlcs();
    this.assignResetKey++;
    this.addStationOpen = false;
    this.assignOpen = true;
  }

  /** The list to start a new code on: the Codes page's open tab (Users / Vehicles), else users. */
  private get filteredKind(): CodeKind {
    return this.codesView ?? "users";
  }

  /** Show the Codes page's tab of a list, so a code just added there is in view. */
  private showCodes(kind: CodeKind): void {
    if (this.page === "codes" && this.codesView && this.codesView !== kind) {
      this.selectView(CODES_VIEW[kind]);
    }
  }

  /** Every code in use, across every market and both kinds: a keypad code must identify one holder. */
  private refreshTakenCodes(): void {
    this.takenCodes = [...new Set(this.markets.flatMap((m) => [...m.codes.users, ...m.codes.vehicles]).map((c) => c.code))];
  }

  closeAssign(): void {
    this.assignOpen = false;
  }

  /** The assign form's plant tree: the plants ticked — their places, room and PLCs. */
  onAssignPlantsChange(ids: string[]): void {
    this.assignPlantIds = ids;
    this.applyAssignPlcs();
  }

  /**
   * The assign form's submit. When a station (PLC) of the pick isn't ready
   * for a new code of the list, the not-ready dialog asks first.
   */
  onAssign(req: AssignCodeRequest): void {
    // A station that isn't ready for the new code: ask first (the dialog in the dashboard root).
    const warning = plcNotReadyWarning(this.assignPlcs, req.kind);
    if (warning) {
      this.assignConfirm = { req, ...warning };
      return;
    }
    this.assign(req);
  }

  /** "Assign anyway" in the not-ready dialog. */
  confirmAssign(): void {
    const req = this.assignConfirm?.req;
    this.assignConfirm = null;
    if (req) {
      this.assign(req);
    }
  }

  /**
   * Create the code at the panel's plants — their places ({@link
   * placesOfPlants}: a market's own list for a market whose every plant is
   * ticked, else each plant's): a FuelUser / FuelVehicle asset named
   * `<prefix><code>` with the holder as its label, owned by its first
   * market's customer (the tenant when the market is tenant-owned), then a
   * place → asset relation each; put the code in the first free slot of each
   * place's fixed-length allowed-codes list (the backend sends a market's list
   * down to each of its sites, and each site its market's and its own to its
   * stations), and log a "code assigned" event — who did it with it — on each
   * of its markets. If the owner or a relation can't be set the new asset is
   * deleted again, so no stray asset is left behind.
   */
  private assign(req: AssignCodeRequest): void {
    const places = this.assignPlaces;
    const first = places.length ? this.marketById(places[0].marketId) : null;
    if (!first) {
      this.toasts.warn("Pick at least one plant.");
      return;
    }
    if (!this.plcsLoaded) {
      this.toasts.warn("Still loading the stations — try again in a moment.");
      return;
    }
    const scope = placesText(places, this.markets, true);
    const room = placesRoom(places, this.markets);
    const reason = room ? codeRoomReason(room, req.kind, scope) : null;
    if (reason) {
      this.toasts.warn(reason);
      return;
    }
    const marketIds = [...new Set(places.map((p) => p.marketId))];
    this.saving = true;
    this.marketCustomerId(first.id)
      .pipe(
        switchMap((customerId) =>
          this.createCodeAsset(req, customerId, places).pipe(
            tap((saved) => this.joinAccess([{ assetId: saved.id.id, kind: req.kind }], places, customerId))
          )
        ),
        // Allowed codes: add the code to each place's list — a site's, else a market's (a failure here doesn't undo the code).
        switchMap((saved) =>
          forkJoin(
            places.map((p) =>
              this.updateScopeList(placeScopeId(p), req.kind, (raw) => withCode(raw, req.code, this.placeLength(p, req.kind))).pipe(
                map(() => true),
                catchError(() => of(false))
              )
            )
          ).pipe(map((updated) => ({ saved, listUpdated: updated.every((ok) => ok) })))
        ),
        switchMap((result) =>
          this.logCodeEvents([{ marketIds, event: this.codeEvent("code_assigned", req.kind, req.code, req.name, places) }]).pipe(map(() => result))
        )
      )
      .subscribe({
        next: ({ saved, listUpdated }) => {
          this.saving = false;
          const entry: AccessCode = {
            assetId: saved.id.id,
            siteId: "",
            code: req.code,
            name: req.name,
            createdAt: saved.createdTime || Date.now(),
            status: "active",
          };
          this.showCodes(req.kind); // the new code's tab
          this.setCodePlaces(req.kind, entry, [], places);
          if (listUpdated) {
            this.toasts.success(`${codeKindLabel(req.kind, true)} code ${req.code} added to ${scope}`);
          } else {
            this.toasts.warn(`Code ${req.code} created, but a code list of ${scope} couldn't be updated.`);
          }
          this.closeAssign();
          this.scheduleActivityRefresh();
          this.cd.detectChanges();
        },
        error: (err) => {
          this.saving = false;
          const msg = apiMessage(err);
          this.toasts.error(
            /already exists/i.test(msg) ? `Code ${req.code} is already in use — generate another.` : `Couldn't create the code${msg}`
          );
          this.cd.detectChanges();
        },
      });
  }

  /**
   * Create one code asset at its places: a FuelUser / FuelVehicle asset named
   * `<prefix><code>` with the holder as its label, owned by `customerId` (the
   * tenant when ""), then a place → asset relation each (a code's places are
   * what it's linked from: a market, or a site). If the owner or a relation
   * can't be set the new asset is deleted again, so no stray asset is left
   * behind.
   */
  private createCodeAsset(req: AssignCodeRequest, customerId: string, places: CodePlace[]): Observable<Asset> {
    const k = codeAssetConfig(this.settings, req.kind);
    const cfg = QUIET_REQUEST;
    const asset = { name: `${k.prefix}${req.code}`, type: k.type, label: req.name } as Asset;
    if (customerId) {
      asset.customerId = { entityType: EntityType.CUSTOMER, id: customerId };
    }
    return this.ctx.assetService.saveAsset(asset, cfg).pipe(
      switchMap((saved) => this.ensureCustomerOwner(saved, customerId).pipe(catchError((err) => this.deleteCreatedAsset(saved, err)))),
      switchMap((saved) =>
        forkJoin(
          places.map((p) =>
            this.ctx.entityRelationService.saveRelation(
              { from: { entityType: EntityType.ASSET, id: placeScopeId(p) }, to: saved.id, type: k.relation, typeGroup: RelationTypeGroup.COMMON },
              cfg
            )
          )
        ).pipe(
          map(() => saved),
          catchError((err) => this.deleteCreatedAsset(saved, err))
        )
      )
    );
  }

  /** What a new code's access join needs — the product lines and the applications — asked for once (the Settings page loads them too). */
  private ensureAccessLists(): void {
    if (!this.orgLoaded && !this.accessListsLoaded) {
      this.accessListsLoaded = true;
      this.org.load("productLine");
      this.apps.load();
    }
  }

  /** The sites of a code's places (a market's: its Fuel sites, where it works), as the access groups' scopes read them. */
  private accessSitesOf(places: CodePlace[]): AssetRow[] {
    return sitesOfPlaces(places, this.markets).map(({ market, site }) => ({
      id: site.id,
      name: site.code,
      label: site.name,
      owner: "",
      createdTime: null,
      marketId: market.id,
      productLineId: this.siteProductLines.get(site.id) ?? null,
    }));
  }

  /**
   * New codes join the access groups that cover them now, not at their next
   * sync: the groups whose scope holds a site the code works at — its places'
   * sites (a market's: its Fuel sites, its stations) — each with its product
   * line. Fire and forget: a failure leaves it to the next sync.
   */
  private joinAccess(codes: { assetId: string; kind: CodeKind }[], places: CodePlace[], ownerId: string): void {
    if (!codes.length) {
      return;
    }
    const sites = this.accessSitesOf(places);
    this.access
      .joinCoveringGroups(
        codes.map((c) => ({ id: c.assetId, entityType: EntityType.ASSET, profile: codeAssetConfig(this.settings, c.kind).type, ownerId, sites }))
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe();
  }

  /**
   * A code moved to other plants: it joins the access groups covering a site
   * of its new places and leaves those covering a site of its old ones but
   * none of its new ones — as their next sync would. Fire and forget.
   */
  private regroupCode(kind: CodeKind, assetId: string, before: CodePlace[], after: CodePlace[]): void {
    const sites = this.accessSitesOf(after);
    const left = this.accessSitesOf(before).filter((x) => !sites.some((y) => y.id === x.id));
    if (!after.length) {
      return;
    }
    // Its owner: its markets' customer, as it was made with.
    this.marketCustomerId(after[0].marketId)
      .pipe(
        switchMap((ownerId) => {
          const entity = { id: assetId, entityType: EntityType.ASSET, profile: codeAssetConfig(this.settings, kind).type, ownerId, sites };
          return forkJoin([
            this.access.joinCoveringGroups([entity]),
            left.length ? this.access.leaveCoveringGroups([{ ...entity, sites: left }], sites) : of(0),
          ]);
        }),
        catchError(() => of(null)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe();
  }

  // -- import-codes panel -------------------------------------------------------

  /** Open the import panel (`plantIds` ticked) — a blank form: the trail starts again. */
  openImport(plantIds: string[]): void {
    if (!this.markets.length) {
      this.toasts.warn("No fuel-management market to import codes into.");
      return;
    }
    this.access.trail.reset(this);
    this.closeCode();
    this.closeAssign();
    this.importPlantIds = plantIds;
    this.ensureAccessLists();
    this.refreshTakenCodes();
    this.applyImportPlcs();
    this.importResetKey++;
    this.addStationOpen = false;
    this.importOpen = true;
  }

  closeImport(): void {
    this.importOpen = false;
  }

  /** The import form's plant tree: the plants ticked — their places, room and PLCs. */
  onImportPlantsChange(ids: string[]): void {
    this.importPlantIds = ids;
    this.applyImportPlcs();
  }

  /**
   * The import form's submit. When a station (PLC) of the pick isn't ready
   * for new codes of a list in the import, the not-ready dialog asks first.
   */
  onImport(req: ImportCodesRequest): void {
    for (const kind of CODE_KINDS.map((k) => k.id)) {
      const count = req.codes.filter((c) => c.kind === kind).length;
      const warning = count ? plcNotReadyWarning(this.importPlcs, kind, count) : null;
      if (warning) {
        this.importConfirm = { req, ...warning };
        return;
      }
    }
    this.importCodes(req);
  }

  /** "Import anyway" in the not-ready dialog. */
  confirmImport(): void {
    const req = this.importConfirm?.req;
    this.importConfirm = null;
    if (req) {
      this.importCodes(req);
    }
  }

  /** How many code assets a bulk action creates or deletes at once (each is its own ThingsBoard request). */
  private static readonly BULK_CONCURRENCY = 4;

  /**
   * Create the pasted codes' assets at the panel's places ({@link
   * createCodeAsset} each — a few at a time, since ThingsBoard has no bulk
   * create for an asset with its relations; one that fails is skipped, the
   * rest go on), then put every code created into each place's allowed-codes
   * list in one write per place and list, log the "code assigned" events in
   * one request per market, and report how it went in a toast.
   */
  private importCodes(req: ImportCodesRequest): void {
    const places = this.importPlaces;
    const first = places.length ? this.marketById(places[0].marketId) : null;
    if (!first || !req.codes.length) {
      return;
    }
    if (!this.plcsLoaded) {
      this.toasts.warn("Still loading the stations — try again in a moment.");
      return;
    }
    const total = req.codes.length;
    const kinds = CODE_KINDS.map((k) => k.id);
    const scope = placesText(places, this.markets, true);
    const marketIds = [...new Set(places.map((p) => p.marketId))];
    this.saving = true;
    this.importProgress = { done: 0, total };
    this.marketCustomerId(first.id)
      .pipe(
        switchMap((customerId) =>
          from(req.codes).pipe(
            mergeMap(
              (code, index) =>
                this.createCodeAsset(code, customerId, places).pipe(
                  map((saved) => ({ index, code, saved: saved as Asset | null, error: "" })),
                  catchError((err) => of({ index, code, saved: null as Asset | null, error: apiMessage(err) })),
                  tap(() => {
                    this.importProgress = { done: (this.importProgress?.done ?? 0) + 1, total };
                    this.cd.detectChanges();
                  })
                ),
              FuelManagementDashboardComponent.BULK_CONCURRENCY
            ),
            toArray(),
            // Back in paste order, so the codes take their list slots in that order.
            map((results) => results.sort((a, b) => a.index - b.index)),
            tap((results) =>
              this.joinAccess(
                results.flatMap((r) => (r.saved ? [{ assetId: r.saved.id.id, kind: r.code.kind }] : [])),
                places,
                customerId
              )
            )
          )
        ),
        // Allowed codes: one write per place (a site's list, else a market's) and list with every code created (a failure doesn't undo the codes).
        switchMap((results) => {
          const created = results.filter((r) => r.saved);
          const writes = kinds
            .map((kind) => ({ kind, codes: created.filter((r) => r.code.kind === kind).map((r) => r.code.code) }))
            .filter((w) => w.codes.length)
            .flatMap((w) =>
              places.map((p) =>
                this.updateScopeList(placeScopeId(p), w.kind, (raw) => withCodes(raw, w.codes, this.placeLength(p, w.kind))).pipe(
                  map(() => true),
                  catchError(() => of(false))
                )
              )
            );
          return (writes.length ? forkJoin(writes) : of([] as boolean[])).pipe(
            map((updated) => ({ results, listsFailed: updated.filter((ok) => !ok).length }))
          );
        }),
        switchMap((r) =>
          this.logCodeEvents(
            r.results
              .filter((x) => x.saved)
              .map((x) => ({ marketIds, event: this.codeEvent("code_assigned", x.code.kind, x.code.code, x.code.name, places) }))
          ).pipe(map(() => r))
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: ({ results, listsFailed }) => {
          this.saving = false;
          this.importProgress = null;
          const created = results.filter((r) => r.saved);
          // Each code an entry in its markets' lists, one a place.
          for (const kind of kinds) {
            const made = created.filter((r) => r.code.kind === kind);
            for (const id of marketIds) {
              const mine = made.flatMap((r) =>
                places
                  .filter((p) => p.marketId === id)
                  .map(
                    (p): AccessCode => ({
                      assetId: r.saved!.id.id,
                      siteId: p.siteId,
                      code: r.code.code,
                      name: r.code.name,
                      createdAt: r.saved!.createdTime || Date.now(),
                      status: "active",
                    })
                  )
              );
              if (mine.length) {
                this.patchMarketCodes(id, kind, [...(this.marketById(id)?.codes[kind] ?? []), ...mine]);
              }
            }
          }
          const failed = results.length - created.length;
          const firstError = results.find((r) => !r.saved)?.error ?? ".";
          if (!created.length) {
            this.toasts.error(`None of the ${total} codes could be created${firstError}`);
          } else if (failed) {
            this.toasts.warn(`Imported ${created.length} of ${total} codes — ${failed} couldn't be created${firstError}`);
          } else if (listsFailed) {
            this.toasts.warn(`${created.length} codes imported, but a code list of ${scope} couldn't be updated.`);
          } else {
            this.toasts.success(created.length === 1 ? `1 code imported to ${scope}` : `${created.length} codes imported to ${scope}`);
          }
          if (created.length) {
            this.closeImport();
          }
          this.scheduleActivityRefresh();
          this.cd.detectChanges();
        },
        error: (err) => {
          this.saving = false;
          this.importProgress = null;
          this.toasts.error(`Couldn't import the codes${apiMessage(err)}`);
          this.cd.detectChanges();
        },
      });
  }

  /** The import panel's pick: its places, their PLCs and the room they have left. */
  private applyImportPlcs(): void {
    this.importPlaces = placesOfPlants(this.importPlantIds, this.markets);
    this.importPlcs = atPlaces(this.importPlaces, this.plcs);
    this.importRoom = placesRoom(this.importPlaces, this.markets);
  }

  /** The customer that owns a market ("" when the tenant owns it). */
  private marketCustomerId(marketId: string): Observable<string> {
    return this.ctx.assetService.getAsset(marketId, QUIET_REQUEST).pipe(
      map((a: any) => {
        const owner = a?.ownerId; // PE
        if (owner?.entityType) {
          return owner.entityType === EntityType.CUSTOMER ? String(owner.id) : "";
        }
        const customer = a?.customerId?.id;
        return customer && customer !== NULL_UUID ? String(customer) : "";
      })
    );
  }

  /**
   * Make sure a new entity (a code asset, a pump) is owned by `customerId` — the create request
   * already asks for it; if the server still made it tenant-owned, move it with
   * the PE owner endpoint. No-op when the market is tenant-owned.
   */
  private ensureCustomerOwner<T extends Asset | Device>(saved: T, customerId: string): Observable<T> {
    const ownedBy = (saved as any).ownerId?.id ?? saved.customerId?.id;
    if (!customerId || ownedBy === customerId) {
      return of(saved);
    }
    return this.ctx.http
      .post(
        `/api/owner/CUSTOMER/${customerId}/${saved.id.entityType}/${saved.id.id}`,
        [],
        defaultHttpOptionsFromConfig(QUIET_REQUEST)
      )
      .pipe(map(() => saved));
  }

  /** Undo a half-created code: delete the new asset, then re-throw the original error. */
  private deleteCreatedAsset(saved: Asset, err: unknown): Observable<never> {
    return this.ctx.assetService.deleteAsset(saved.id.id, QUIET_REQUEST).pipe(
      catchError(() => of(null)),
      switchMap(() => throwError(() => err))
    );
  }

  // -- activity -----------------------------------------------------------------

  /** The Reports page's window, in days (a calendar range's span, else the picker's). */
  get reportDays(): number {
    const day = 24 * 3600 * 1000;
    if (this.reportTimeframe === TB_CUSTOM_TIMEFRAME && this.reportRange) {
      return Math.max(1, Math.round((this.reportRange.end - this.reportRange.start) / day));
    }
    const tf = ACTIVITY_TIMEFRAMES.find((t) => t.id === this.reportTimeframe) ?? ACTIVITY_TIMEFRAMES[2];
    return Math.round(tf.ms / day);
  }

  /** The range the date-range panel opens on (the page it sets). */
  get rangePickerRange(): TbDateRange | null {
    return this.rangeTarget === "reports" ? this.reportRange : this.activityRange;
  }

  onReportTimeframe(id: string): void {
    this.reportTimeframe = id;
    this.reportRange = null;
    this.loadReport();
  }

  /** The Reports page's Sites filter (site ids; none = all): the report again, from what's read. */
  onReportLocationsChange(ids: string[]): void {
    this.reportLocations = ids;
    this.buildReport();
  }

  onReportKindsChange(ids: string[]): void {
    this.reportKinds = ids as CodeKind[];
    this.buildReport();
  }

  /** The Reports page's Units (litres / gallons): the report rebuilt in them — nothing read again. */
  onReportUnitChange(unit: string): void {
    this.reportUnit = unit === "gal" ? "gal" : "L";
    this.buildReport();
  }

  /**
   * The Reports page's window: its first day's local midnight, how many days
   * (a preset's — today and the days before it — or a calendar range's), and
   * its end (now, or the range's).
   */
  private get reportWindow(): { start: number; end: number; days: number } {
    const days = this.reportDays;
    const custom = this.reportTimeframe === TB_CUSTOM_TIMEFRAME ? this.reportRange : null;
    const first = new Date(custom ? custom.start : Date.now());
    first.setHours(0, 0, 0, 0);
    if (!custom) {
      first.setDate(first.getDate() - (days - 1));
    }
    return { start: first.getTime(), end: custom ? custom.end : Date.now(), days };
  }

  /** The Reports page shown: its window read, unless it's the one read already. */
  private ensureReport(): void {
    if (this.view === "reports" && this.pumpsLoaded && !this.marketsLoading) {
      const w = this.reportWindow;
      const key = `${w.start}|${w.days}|${this.reportTimeframe === TB_CUSTOM_TIMEFRAME ? w.end : "now"}`;
      if (key !== this.reportKey) {
        this.loadReport();
      }
    }
  }

  /**
   * Read the Reports page's window: each Fuel pump's stored totals over it
   * (its quarter-hours summed by the hour — by the day past
   * {@link REPORT_HOURLY_MAX_DAYS} — and its previous window's sums, the same
   * window shifted back by its days: the same days, to the same time) and,
   * for who took the fuel, its dispense events; the report is built as each
   * arrives.
   */
  private loadReport(): void {
    if (!this.pumpsLoaded || this.marketsLoading) {
      return; // read once the pumps and their places are in (ensureReport)
    }
    const w = this.reportWindow;
    const key = `${w.start}|${w.days}|${this.reportTimeframe === TB_CUSTOM_TIMEFRAME ? w.end : "now"}`;
    this.reportKey = key;
    this.reportTotals = null;
    this.reportDispenses = null;
    this.reportDenials = null;
    this.reportPreviousDispenses = null;
    this.reportEventsFrom = null;
    this.buildReport();
    const hourly = w.days <= REPORT_HOURLY_MAX_DAYS;
    const interval = hourly ? 3600 * 1000 : 24 * 3600 * 1000;
    // The previous window: this one shifted back by its days (calendar days: the same days of the week, to the same time) — "vs last".
    const prev = previousReportWindow(w.start, w.end, w.days);
    const pumps = this.pumps.filter((p) => p.marketId);
    const reads = pumps.map((p) => {
      const buckets = this.readPumpTotals(p.pumpId, w.start, w.end, interval);
      // The previous window by the same buckets: its sums ("vs last") and its running total (the ghost line).
      const before = this.readPumpTotals(p.pumpId, prev.start, prev.end, interval);
      return forkJoin([buckets, before]).pipe(map(([b, pb]) => ({ id: p.pumpId, buckets: b, previousBuckets: pb })));
    });
    (reads.length ? forkJoin(reads) : of([] as { id: string; buckets: ReportBucket[]; previousBuckets: ReportBucket[] }[]))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((list) => {
        if (this.reportKey !== key) {
          return; // another window was asked for meanwhile
        }
        const sums = (b: ReportBucket[]): ReportPrevious =>
          b.reduce((t, x) => ({ litres: t.litres + x.litres, dispenses: t.dispenses + x.dispenses, denied: t.denied + x.denied }), { ...NO_REPORT_PREVIOUS });
        this.reportTotals = {
          key,
          hourly,
          buckets: new Map(list.map((r) => [r.id, r.buckets])),
          previous: new Map(list.map((r) => [r.id, sums(r.previousBuckets)])),
          previousBuckets: new Map(list.map((r) => [r.id, r.previousBuckets])),
          readAt: Date.now(),
        };
        this.buildReport();
        this.cd.detectChanges();
      });
    this.readReportEvents(w.start, w.end)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ events, coveredFrom }) => {
        if (this.reportKey !== key) {
          return;
        }
        this.reportEventsFrom = coveredFrom;
        // Its fuelings: the dispenses, and the stops that ended one with litres (as the daily totals count them).
        this.reportDispenses = events.filter((e) => isFueling(e) && e.volume !== null);
        this.reportDenials = events.filter((e) => e.group === "denied");
        this.buildReport();
        this.cd.detectChanges();
      });
    // The previous window's dispenses: the users' and vehicles' "vs last".
    this.readReportEvents(prev.start, prev.end)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ events }) => {
        if (this.reportKey !== key) {
          return;
        }
        this.reportPreviousDispenses = events.filter((e) => isFueling(e) && e.volume !== null);
        this.buildReport();
        this.cd.detectChanges();
      });
  }

  /**
   * Every Fuel pump's events over [start, end] for the Reports page — a page ({@link EVENTS_PER_SOURCE}) at a time, each the next
   * older, back to the window's start — at most {@link REPORT_EVENT_PAGES} pages a pump. `coveredFrom`: a pump had more — the time
   * from which every pump's events are all read (its oldest read, the latest of them); null, all of them.
   */
  private readReportEvents(start: number, end: number): Observable<{ events: ActivityRow[]; coveredFrom: number | null }> {
    const readFrom = (src: { entityType: EntityType; id: string; label: string }, until: number, pages: number): Observable<ReportEventRead> =>
      this.readEventSources([src], start, until).pipe(
        switchMap(({ events, capped }): Observable<ReportEventRead> => {
          if (!capped || !events.length) {
            return of({ rows: events, coveredFrom: null });
          }
          // A full page: the next one ends just before its oldest (newest first).
          const oldest = events[events.length - 1].ts;
          if (pages <= 1 || oldest <= start) {
            return of({ rows: events, coveredFrom: oldest > start ? oldest : null });
          }
          return readFrom(src, oldest - 1, pages - 1).pipe(map((more) => ({ rows: [...events, ...more.rows], coveredFrom: more.coveredFrom })));
        })
      );
    const sources = this.pumps.map((p) => ({ entityType: EntityType.DEVICE, id: p.pumpId, label: p.shortName }));
    return (sources.length ? forkJoin(sources.map((src) => readFrom(src, end, REPORT_EVENT_PAGES))) : of([] as ReportEventRead[])).pipe(
      map((reads) => {
        const partial = reads.map((r) => r.coveredFrom).filter((ts): ts is number => ts !== null);
        return { events: reads.flatMap((r) => r.rows).sort((a, b) => b.ts - a.ts), coveredFrom: partial.length ? Math.max(...partial) : null };
      })
    );
  }

  /**
   * A pump's stored totals over [start, end] — its "Fuel Daily Totals"
   * quarter-hours (litres, dispenses, denials) summed by `interval` with
   * ThingsBoard's own SUM: a bucket each, at its middle (none when the read
   * fails). The Reports page's and a station panel's.
   */
  private readPumpTotals(pumpId: string, start: number, end: number, interval: number): Observable<ReportBucket[]> {
    // Past ThingsBoard's intervals a read: in parts, each a whole number of intervals from the window's start, so the buckets line up.
    const span = TS_MAX_INTERVALS * interval;
    if (end - start > span) {
      const parts: Observable<ReportBucket[]>[] = [];
      for (let from = start; from < end; from += span) {
        parts.push(this.readPumpTotals(pumpId, from, Math.min(end, from + span), interval));
      }
      return forkJoin(parts).pipe(map((lists) => lists.flat()));
    }
    const s = this.settings;
    const keys = [s.qtrLitresKey, s.qtrDispensesKey, s.qtrDeniedKey];
    const value = (points: { ts: number; value: unknown }[] | undefined, ts: number) => Number(points?.find((p) => p.ts === ts)?.value) || 0;
    const id = { entityType: EntityType.DEVICE, id: pumpId };
    return this.ctx.attributeService
      .getEntityTimeseries(id, keys, start, end, Math.ceil((end - start) / interval) + 2, AggregationType.SUM, interval, undefined, undefined, QUIET_REQUEST)
      .pipe(
        map((data: any) => {
          const litres: { ts: number; value: unknown }[] = data?.[s.qtrLitresKey] ?? [];
          const times = new Set<number>([...litres, ...(data?.[s.qtrDispensesKey] ?? []), ...(data?.[s.qtrDeniedKey] ?? [])].map((pt) => Number(pt.ts)));
          return [...times].map((ts) => ({
            ts,
            litres: value(litres, ts),
            dispenses: value(data?.[s.qtrDispensesKey], ts),
            denied: value(data?.[s.qtrDeniedKey], ts),
          }));
        }),
        catchError(() => of([] as ReportBucket[]))
      );
  }

  /** The report from what's read for the window, for the sites picked (none: every Fuel pump) and the code lists picked. */
  private buildReport(): void {
    const w = this.reportWindow;
    const totals = this.reportTotals;
    const picked = new Set(this.reportLocations);
    const inScope = this.pumps.filter((p) => p.marketId && (!picked.size || picked.has(p.siteId)));
    const plcNames = new Map(this.plcs.map((p) => [p.plcId, p.name]));
    const pumps: ReportPump[] = inScope.map((p) => ({
      id: p.pumpId,
      name: p.name,
      fuelType: p.fuelType,
      station: plcNames.get(this.pumpStations.get(p.pumpId) ?? "") ?? "",
      site: p.site,
      buckets: totals?.buckets.get(p.pumpId) ?? [],
      previous: totals?.previous.get(p.pumpId) ?? NO_REPORT_PREVIOUS,
      previousBuckets: totals?.previousBuckets.get(p.pumpId) ?? [],
    }));
    let people: ReportPeople | null = null;
    const ids = new Set(inScope.map((p) => p.pumpId));
    if (this.reportDispenses) {
      people = { users: new Map(), vehicles: new Map(), userDispenses: new Map(), vehicleDispenses: new Map() };
      for (const e of this.reportDispenses) {
        if (ids.has(e.pumpId)) {
          if (e.userCode) {
            people.users.set(e.userCode, (people.users.get(e.userCode) ?? 0) + (e.volume ?? 0));
            people.userDispenses.set(e.userCode, (people.userDispenses.get(e.userCode) ?? 0) + 1);
          }
          if (e.vehicleCode) {
            people.vehicles.set(e.vehicleCode, (people.vehicles.get(e.vehicleCode) ?? 0) + (e.volume ?? 0));
            people.vehicleDispenses.set(e.vehicleCode, (people.vehicleDispenses.get(e.vehicleCode) ?? 0) + 1);
          }
        }
      }
    }
    const denials = this.reportDenials ? this.reportDenials.filter((e) => ids.has(e.pumpId)) : null;
    const dispenseOf = (e: ActivityRow): ReportDispense => ({ ts: e.ts, pumpId: e.pumpId, volume: e.volume ?? 0, userCode: e.userCode, vehicleCode: e.vehicleCode });
    const dispensesNow = this.reportDispenses ? this.reportDispenses.filter((e) => ids.has(e.pumpId)).map(dispenseOf) : null;
    const dispensesBefore = this.reportPreviousDispenses ? this.reportPreviousDispenses.filter((e) => ids.has(e.pumpId)).map(dispenseOf) : null;
    const holders = {
      users: new Map(this.markets.flatMap((m) => m.codes.users.map((c) => [c.code, c.name] as const))),
      vehicles: new Map(this.markets.flatMap((m) => m.codes.vehicles.map((c) => [c.code, c.name] as const))),
    };
    this.report = buildFuelReport({
      start: w.start,
      end: w.end,
      // A window to now (not a custom range): its "vs last" is to the same time.
      toNow: this.reportTimeframe !== TB_CUSTOM_TIMEFRAME,
      days: w.days,
      hourly: totals?.hourly ?? w.days <= REPORT_HOURLY_MAX_DAYS,
      pumps,
      people,
      denials,
      dispenses: dispensesNow,
      previousDispenses: dispensesBefore,
      unit: this.reportUnit,
      readAt: totals?.readAt,
      eventsFrom: this.reportEventsFrom,
      kinds: this.reportKinds,
      loading: !totals,
      holder: (kind, code) => holders[kind].get(code) ?? "",
    });
  }

  onActivityTimeframe(id: string): void {
    this.activityTimeframe = id;
    this.activityRange = null;
    this.loadActivity();
  }

  /** The picker's calendar: open the date-range panel at it — or close it when it's open
   *  (any other click outside the panel closes it on its own). */
  openRangePicker(anchor: HTMLElement, target: "activity" | "reports" = "activity"): void {
    if (this.rangePickerOpen) {
      this.rangePickerOpen = false;
      return;
    }
    this.rangeTarget = target;
    this.rangeAnchor = anchor;
    this.rangePickerOpen = true;
  }

  onRangeApplied(range: TbDateRange): void {
    this.rangePickerOpen = false;
    if (this.rangeTarget === "reports") {
      this.reportTimeframe = TB_CUSTOM_TIMEFRAME;
      this.reportRange = range;
      this.loadReport();
      return;
    }
    this.activityTimeframe = TB_CUSTOM_TIMEFRAME;
    this.activityRange = range;
    this.loadActivity();
  }

  /** The Activity sidebar's Events filter. */
  onActivityGroupsChange(ids: string[]): void {
    this.activityGroups = ids as ActivityGroup[];
    this.applyFilters(); // Sites / Devices counts follow the event types
  }

  /** Activity's Pumps: its Pump filter (the pumps picked; a station picks its pumps). */
  onActivityPumpsChange(ids: string[]): void {
    this.activityPumps = ids;
    this.applyFilters(); // its Events and location counts follow
  }

  /** The Activity page's User or Vehicle filter (both lists', one pick across both): either list and its other counts follow. */
  onActivityCodesChange(kind: CodeKind, codes: string[]): void {
    if (kind === "users") {
      this.activityUserCodes = codes;
    } else {
      this.activityVehicleCodes = codes;
    }
    this.applyFilters(); // Pumps: its Events, Pump and location counts
    this.applyCodes(); // Codes: its Type and Market counts
  }

  /** The Pump filter on a pump event: nothing picked, or its pump picked. */
  private activityPumpPasses(e: ActivityRow): boolean {
    return !this.activityPumps.length || this.activityPumps.includes(e.pumpId);
  }

  /**
   * The User / Vehicle filters on an Activity row (a pump event, or a code change — of one code): nothing picked in either, or its
   * user code picked in User or its vehicle code in Vehicle.
   */
  private activityCodePasses(e: ActivityRow): boolean {
    if (!this.activityUserCodes.length && !this.activityVehicleCodes.length) {
      return true;
    }
    return (!!e.userCode && this.activityUserCodes.includes(e.userCode)) || (!!e.vehicleCode && this.activityVehicleCodes.includes(e.vehicleCode));
  }

  /**
   * The Pump filter's options: each station (its PLC, by name; "No station" for a pump without one) › its pumps in the location
   * filters (by short name) — and a picked one outside them, to be cleared — each counted over `rows` (the list's events under its
   * other filters).
   */
  private buildActivityPumpOptions(rows: ActivityRow[]): FilterListOption[] {
    const counts = new Map<string, number>();
    rows.forEach((e) => counts.set(e.pumpId, (counts.get(e.pumpId) ?? 0) + 1));
    const shown = new Set([...this.visiblePumps.map((p) => p.pumpId), ...this.activityPumps]);
    const pumps = this.pumps.filter((p) => shown.has(p.pumpId));
    const plcNames = new Map(this.plcs.map((x) => [x.plcId, x.name]));
    const byLabel = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label, undefined, { numeric: true });
    const stations = new Map<string, FilterListOption[]>();
    for (const p of pumps) {
      const station = this.pumpStations.get(p.pumpId) ?? "";
      stations.set(station, [...(stations.get(station) ?? []), { id: p.pumpId, label: p.shortName || p.name, count: counts.get(p.pumpId) ?? 0 }]);
    }
    return [...stations]
      .map(([plcId, children]) => ({
        id: `station:${plcId}`,
        label: plcNames.get(plcId) || "No station",
        count: children.reduce((n, c) => n + (c.count ?? 0), 0),
        children: children.sort(byLabel),
      }))
      .sort(byLabel);
  }

  /**
   * The User or the Vehicle filter's options: the codes of that list in `rows` (a list's rows under its other filters) — its holder
   * with the code ("Jane Doe (1234)"), the code alone once it's no longer assigned — counted; a picked one no row has stays, to be
   * cleared.
   */
  private buildActivityCodeOptions(rows: ActivityRow[], kind: CodeKind): FilterListOption[] {
    const counts = new Map<string, number>();
    rows.forEach((e) => {
      const code = kind === "users" ? e.userCode : e.vehicleCode;
      if (code) {
        counts.set(code, (counts.get(code) ?? 0) + 1);
      }
    });
    (kind === "users" ? this.activityUserCodes : this.activityVehicleCodes).forEach((code) => counts.set(code, counts.get(code) ?? 0));
    const holders = new Map(this.markets.flatMap((m) => m.codes[kind].map((c) => [c.code, c.name] as const)));
    return [...counts]
      .map(([code, count]) => ({ id: code, label: holders.get(code) ? `${holders.get(code)} (${code})` : code, count }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  }

  /**
   * The Activity page's window for a panel's "View full activity": the page's preset of the panel's (1D, 1W, 1M), else the panel's
   * window as a range (a code's 3M). True when it isn't the window the page shows.
   */
  private setActivityWindow(timeframe: string, window: ChartWindow): boolean {
    const preset = ACTIVITY_TIMEFRAMES.find((t) => t.id === timeframe);
    const next = preset ? preset.id : TB_CUSTOM_TIMEFRAME;
    const range = preset ? null : { start: window.start, end: window.end };
    const changed = next !== this.activityTimeframe || !!range;
    this.activityTimeframe = next;
    this.activityRange = range;
    return changed;
  }

  /** The Activity page shown on a list after a panel's "View full activity": its window read again when it changed (else its filters applied). */
  private showActivityList(view: "activity" | "codeActivity", windowChanged: boolean): void {
    this.showPage("activity", view);
    if (windowChanged && this.activityLoaded) {
      this.loadActivity(); // read already, over another window
    }
    this.writeUrlState();
  }

  /**
   * A code panel's "View full activity": the Activity page's Pumps (its dispenses and denials; its changes the Codes list's, a switch
   * away) on the code — its User or Vehicle filter picking it alone, over the panel's window — the filters that would hide its rows
   * cleared (both lists' search, Events, Pump, Type, and the location / Market picks when they leave its pumps out); the panel
   * closes. A new entry in the URL.
   */
  openCodeActivity(): void {
    const r = this.selectedCode;
    if (!r) {
      return;
    }
    this.activityUserCodes = r.kind === "users" ? [r.code] : [];
    this.activityVehicleCodes = r.kind === "vehicles" ? [r.code] : [];
    this.activitySearchTerms = [];
    this.activitySearchText = "";
    this.activitySearch = [];
    this.activityGroups = [];
    this.activityPumps = [];
    this.codeActivitySearchTerms = [];
    this.codeActivitySearchText = "";
    this.codeActivitySearch = [];
    if (this.codeTypes.length && !this.codeTypes.includes(r.kind)) {
      this.codeTypes = [];
    }
    if (this.codeSites.length && !r.siteIds.some((id) => this.codeSites.includes(id))) {
      this.codeSites = [];
    }
    const pumps = atPlaces(r.places, this.pumps);
    if (pumps.some((p) => !this.locationPasses(p))) {
      this.selectedProductLines = [];
      this.selectedSites = [];
    }
    const windowChanged = this.setActivityWindow(this.codeTimeframe, this.codeWindow);
    this.closeCode();
    this.showActivityList("activity", windowChanged);
  }

  /**
   * A station panel's "View full activity": the Activity page's Pumps on the station — its Pump filter picking its pumps, over the
   * panel's window — the filters that would hide their events cleared (the search, Events, User, Vehicle, and the location picks
   * when its pumps aren't all in them); the panel closes. A new entry in the URL.
   */
  openStationActivity(): void {
    const st = this.selectedStation;
    if (!st) {
      return;
    }
    this.activityPumps = st.pumps.map((p) => p.pumpId);
    this.activityUserCodes = [];
    this.activityVehicleCodes = [];
    this.activitySearchTerms = [];
    this.activitySearchText = "";
    this.activitySearch = [];
    this.activityGroups = [];
    if (st.pumps.some((p) => !this.locationPasses(p))) {
      this.selectedProductLines = [];
      this.selectedSites = [];
    }
    const windowChanged = this.setActivityWindow(this.stationTimeframe, this.stationWindow);
    this.closeStation();
    this.showActivityList("activity", windowChanged);
  }

  /** The Activity page's export (the sidebar's download button), of the list shown: the rows in view — the filters and the search — every column. */
  onActivityAction(id: string): void {
    if (id !== "export") {
      return;
    }
    if (this.view === "codeActivity") {
      this.exportCodeActivityCsv(matchingSearch(this.codeActivityRows, this.codeActivitySearch, ["label", "pump", "description"]));
    } else {
      this.exportStationActivityCsv(matchingSearch(this.activityRows, this.activitySearch, this.activitySearchKeys));
    }
  }

  // -- alarms -------------------------------------------------------------------

  clearAlarm(alarm: AlarmListItem): void {
    clearDashboardAlarm(this.alarmService, this.destroyRef, alarm);
  }

  // -- data: pumps ----------------------------------------------------------------

  /** Load every pump (entity query) and rebuild all derived views. */
  loadPumps(): void {
    const s = this.settings;
    this.pumpsLoading = true;
    const query: EntityDataQuery = {
      entityFilter: this.pumpFilter,
      pageLink: byNamePageLink(),
      entityFields: [
        { type: EntityKeyType.ENTITY_FIELD, key: "name" },
        { type: EntityKeyType.ENTITY_FIELD, key: "label" },
        { type: EntityKeyType.ENTITY_FIELD, key: "type" },
        // additionalInfo (JSON) carries the description (Settings → Note).
        { type: EntityKeyType.ENTITY_FIELD, key: "additionalInfo" },
        ...OWNER_ENTITY_FIELDS,
      ],
      latestValues: [
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: s.siteKey },
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: s.fuelTypeKey },
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: s.pumpLabelKey },
        // Code lists sent to the pump (shared) vs what it reports back (client) → Synced / Desynced.
        { type: EntityKeyType.SHARED_ATTRIBUTE, key: s.userCodesKey },
        { type: EntityKeyType.SHARED_ATTRIBUTE, key: s.vehicleCodesKey },
        { type: EntityKeyType.CLIENT_ATTRIBUTE, key: s.userCodesKey },
        { type: EntityKeyType.CLIENT_ATTRIBUTE, key: s.vehicleCodesKey },
        // Latest dispense point — its timestamp is "Last dispense".
        { type: EntityKeyType.TIME_SERIES, key: s.dispenseVolumeKey },
        // Its day so far ("Fuel Daily Totals"): the Stations cards' "today".
        { type: EntityKeyType.TIME_SERIES, key: s.dayLitresKey },
        { type: EntityKeyType.TIME_SERIES, key: s.dayDispensesKey },
        { type: EntityKeyType.TIME_SERIES, key: s.dayDeniedKey },
        // An event frame waiting at the PLC, and since when (a stalled drain: the Stations table's Attention) — the flag's and
        // the frame's last report (the array not subscribed: a drain's every frame reloads the pumps by its event already).
        { type: EntityKeyType.TIME_SERIES, key: s.eventReadyKey },
        { type: EntityKeyType.TIME_SERIES, key: s.eventArrayKey },
        // The backend's release of a stalled one under way (its pump's Manage card: "Releasing"), and its last step.
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: s.eventHealStepKey },
        { type: EntityKeyType.TIME_SERIES, key: s.eventHealKey },
        // The station panel's Pumps card: the PLC's overload trip and event buffer for it, its latest report (the PLC's heartbeat
        // keeps it fresh), and its use of each period against its limits.
        { type: EntityKeyType.TIME_SERIES, key: PUMP_OVERLOAD_TRIP_KEY },
        { type: EntityKeyType.TIME_SERIES, key: PUMP_BUFFER_FULL_KEY },
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: LAST_ACTIVITY_KEY },
        ...FUEL_USED_KEYS.map((key) => ({ type: EntityKeyType.TIME_SERIES, key })),
        ...FUEL_LIMIT_KEYS.map((key) => ({ type: EntityKeyType.SERVER_ATTRIBUTE, key })),
      ],
    };
    this.ctx.entityService
      .findEntityDataByQuery(query, QUIET_REQUEST)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this.pumps = page.data.map((d) => this.toPumpRow(d)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
          this.pumpsLoading = false;
          this.pumpsLoaded = true;
          this.applyFilters();
          this.applyCodes();
          this.refreshSelectedPump();
          this.applyAlarmScope();
          this.ensureEventsLoaded();
          this.checkReleaseWatch();
          this.cd.detectChanges();
        },
        error: () => {
          this.pumpsLoading = false;
          this.pumpsLoaded = true; // none known: the pages it holds show
          this.ensureEventsLoaded();
          this.cd.detectChanges();
        },
      });
  }

  private toPumpRow(d: any): PumpRow {
    const s = this.settings;
    const fields = d.latest?.[EntityKeyType.ENTITY_FIELD] ?? {};
    const server = d.latest?.[EntityKeyType.SERVER_ATTRIBUTE] ?? {};
    const shared = d.latest?.[EntityKeyType.SHARED_ATTRIBUTE] ?? {};
    const client = d.latest?.[EntityKeyType.CLIENT_ATTRIBUTE] ?? {};
    const ts = d.latest?.[EntityKeyType.TIME_SERIES] ?? {};
    const deviceName = fields["name"]?.value ?? "";
    const deviceLabel = fields["label"]?.value ?? "";
    // Its name: its pump label (the attribute its panel's Label edits, its events' descriptions name), else the device's label, else
    // the device's name.
    const pumpLabel = String(server[s.pumpLabelKey]?.value ?? "").trim();
    const name = (pumpLabel !== "none" && pumpLabel) || deviceLabel || deviceName || "Unknown pump";
    const dispenseTs = Number(ts[s.dispenseVolumeKey]?.ts) || null;
    const siteAttr = server[s.siteKey]?.value ?? "";
    return this.locate({
      pumpId: d.entityId.id,
      name,
      shortName: shortPumpName(name),
      deviceName,
      deviceLabel,
      description: parseDescription(fields["additionalInfo"]?.value),
      type: fields["type"]?.value ?? "",
      owner: ownerCustomer(fields),
      lastGatewayId: lastConnectedGateway(fields["additionalInfo"]?.value),
      site: siteAttr,
      siteAttr,
      siteId: "",
      marketId: "",
      market: "",
      fuelType: server[s.fuelTypeKey]?.value ?? "",
      pumpLabel: String(server[s.pumpLabelKey]?.value ?? ""),
      stationId: this.pumpStations.get(d.entityId.id) ?? "",
      codeCount: 0, // from the pump's market — see locate()
      codesSync: codesSyncState(
        shared[s.userCodesKey]?.value,
        client[s.userCodesKey]?.value,
        shared[s.vehicleCodesKey]?.value,
        client[s.vehicleCodesKey]?.value
      ),
      sentCodes: { users: parseCodeSlots(shared[s.userCodesKey]?.value), vehicles: parseCodeSlots(shared[s.vehicleCodesKey]?.value) },
      lastDispenseTs: dispenseTs,
      lastDispense: formatWhen(dispenseTs),
      today: {
        litres: todayValue(ts[s.dayLitresKey]),
        dispenses: todayValue(ts[s.dayDispensesKey]),
        denied: todayValue(ts[s.dayDeniedKey]),
      },
      // Both reported on change: the flag's time is when a frame came up, the array's when the frame last came (each frame
      // of a drain still moving). Never the pump's activity: the PLC's heartbeat keeps every pump reporting.
      eventsWaitingSince: parseBool(ts[s.eventReadyKey]?.value)
        ? Math.max(Number(ts[s.eventReadyKey]?.ts) || 0, Number(ts[s.eventArrayKey]?.ts) || 0) || null
        : null,
      releaseStep: pumpReleaseStep(server[s.eventHealStepKey]?.value),
      releaseLog: this.releaseLogOf(ts[s.eventHealKey]),
      overloadTrip: flagOf(ts[PUMP_OVERLOAD_TRIP_KEY]),
      bufferFull: flagOf(ts[PUMP_BUFFER_FULL_KEY]),
      lastReportTs: Number(server[LAST_ACTIVITY_KEY]?.value) || null,
      use: parseFuelUse((k) => ts[k]?.value),
      limits: parseFuelLimits((k) => server[k]?.value),
    });
  }

  /** Apply the pump's Market → Site location and its codes' count — its market's and its site's (once the hierarchy has loaded). */
  private locate(p: PumpRow): PumpRow {
    const loc = this.pumpLocations.get(p.pumpId);
    const market = loc ? this.markets.find((m) => m.id === loc.marketId) : undefined;
    return {
      ...p,
      siteId: loc?.siteId ?? "",
      marketId: loc?.marketId ?? "",
      market: loc?.marketName ?? "",
      site: loc?.siteName || p.siteAttr,
      codeCount: market ? siteCodeCount(market, loc?.siteId ?? "", "users") + siteCodeCount(market, loc?.siteId ?? "", "vehicles") : 0,
    };
  }

  // -- data: PLCs -----------------------------------------------------------------

  /** Load every PLC (entity query): name, online state and transfer flags. */
  private loadPlcs(): void {
    const s = this.settings;
    const query: EntityDataQuery = {
      entityFilter: this.plcFilter,
      pageLink: byNamePageLink(),
      entityFields: [
        { type: EntityKeyType.ENTITY_FIELD, key: "name" },
        { type: EntityKeyType.ENTITY_FIELD, key: "label" },
        { type: EntityKeyType.ENTITY_FIELD, key: "type" },
        // additionalInfo (JSON) carries the gateway it last connected through.
        { type: EntityKeyType.ENTITY_FIELD, key: "additionalInfo" },
        ...OWNER_ENTITY_FIELDS,
      ],
      latestValues: [
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: "active" },
        // Its code capacity (CodeListCapacity: the lengths of the code lists read back from it).
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: s.totalCodesLimitKey },
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: s.userCodesLimitKey },
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: s.vehicleCodesLimitKey },
        // The transfer flags, as the gateway reads them back from the PLC.
        { type: EntityKeyType.CLIENT_ATTRIBUTE, key: s.userCodesXferKey },
        { type: EntityKeyType.CLIENT_ATTRIBUTE, key: s.vehicleCodesXferKey },
        // A load of each list pending (the backend's Fuel Code Transfer): Updating until the PLC's table holds it.
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: s.userCodesXferPendingKey },
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: s.vehicleCodesXferPendingKey },
        // Its code lists: as sent (shared) and the tables the PLC works from, as the gateway reads them back (client) —
        // its "Codes not synced".
        { type: EntityKeyType.SHARED_ATTRIBUTE, key: s.userCodesKey },
        { type: EntityKeyType.SHARED_ATTRIBUTE, key: s.vehicleCodesKey },
        { type: EntityKeyType.CLIENT_ATTRIBUTE, key: s.plcUserCodesKey },
        { type: EntityKeyType.CLIENT_ATTRIBUTE, key: s.plcVehicleCodesKey },
        // Its lists as the backend builds them (uncut): a code left out of a full sent list doesn't fit (the Codes tables' flag).
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: s.userCodesKey },
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: s.vehicleCodesKey },
        // Its station's last dispense (the rule chain copies each of its pumps' to it): litres and pump, at the dispense's time.
        { type: EntityKeyType.TIME_SERIES, key: s.stationDispenseVolumeKey },
        { type: EntityKeyType.TIME_SERIES, key: s.stationDispensePumpKey },
      ],
    };
    this.ctx.entityService
      .findEntityDataByQuery(query, QUIET_REQUEST)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this.plcs = page.data.map((d) => this.toPlcRow(d)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
          this.plcsLoading = false;
          this.plcsLoaded = true;
          this.applyMarketLimits(); // the markets' limits are their stations' capacity
          this.applyAssignPlcs();
          this.applyImportPlcs();
          this.applyStations();
          this.applyCodes(); // the Codes tables' flags: a code its stations have no room for
          this.buildSidebarFilters(); // the filters count stations
          this.loadStationPumps(); // each station's pumps (its PLC's relations)
          this.cd.detectChanges();
        },
        error: () => {
          this.plcsLoading = false;
          this.cd.detectChanges();
        },
      });
  }

  private toPlcRow(d: any): PlcRow {
    const s = this.settings;
    const fields = d.latest?.[EntityKeyType.ENTITY_FIELD] ?? {};
    const server = d.latest?.[EntityKeyType.SERVER_ATTRIBUTE] ?? {};
    const shared = d.latest?.[EntityKeyType.SHARED_ATTRIBUTE] ?? {};
    const client = d.latest?.[EntityKeyType.CLIENT_ATTRIBUTE] ?? {};
    const ts = d.latest?.[EntityKeyType.TIME_SERIES] ?? {};
    const rawVolume = ts[s.stationDispenseVolumeKey]?.value;
    const volume = rawVolume === undefined || rawVolume === null || rawVolume === "" ? null : Number(rawVolume);
    // Each list as sent (shared) against the table the PLC works from (client, read back by its gateway).
    const listSync: PlcRow["listSync"] = {
      users: codeListSync(shared[s.userCodesKey]?.value, client[s.plcUserCodesKey]?.value),
      vehicles: codeListSync(shared[s.vehicleCodesKey]?.value, client[s.plcVehicleCodesKey]?.value),
    };
    // Each list as built (server, uncut) and as sent (shared, cut at its capacity): their codes, and whether the sent one is full.
    const codesIn = (raw: unknown) => parseCodeSlots(raw).filter(Boolean);
    const isFull = (raw: unknown) => {
      const slots = parseCodeSlots(raw);
      return slots.length > 0 && slots.every(Boolean);
    };
    return this.locatePlc({
      plcId: d.entityId.id,
      name: fields["label"]?.value || fields["name"]?.value || "Unknown PLC",
      owner: ownerCustomer(fields),
      type: String(fields["type"]?.value ?? ""),
      deviceName: String(fields["name"]?.value ?? ""),
      deviceLabel: String(fields["label"]?.value ?? ""),
      description: parseDescription(fields["additionalInfo"]?.value),
      siteId: "",
      site: "",
      marketId: "",
      // `active` is absent when device-state tracking is off — treat as online.
      online: String(server["active"]?.value ?? "") !== "false",
      lastGatewayId: lastConnectedGateway(fields["additionalInfo"]?.value),
      limits: parseCodeLimits(
        server[s.totalCodesLimitKey]?.value,
        server[s.userCodesLimitKey]?.value,
        server[s.vehicleCodesLimitKey]?.value,
        s.maxCodesPerStation
      ),
      xfer: {
        users: parseOptionalBool(client[s.userCodesXferKey]?.value),
        vehicles: parseOptionalBool(client[s.vehicleCodesXferKey]?.value),
      },
      pending: {
        users: isPendingLoad(server[s.userCodesXferPendingKey]?.value),
        vehicles: isPendingLoad(server[s.vehicleCodesXferPendingKey]?.value),
      },
      listSync,
      codesSync: plcCodesSync(listSync),
      builtCodes: { users: codesIn(server[s.userCodesKey]?.value), vehicles: codesIn(server[s.vehicleCodesKey]?.value) },
      sentCodes: { users: codesIn(shared[s.userCodesKey]?.value), vehicles: codesIn(shared[s.vehicleCodesKey]?.value) },
      listFull: { users: isFull(shared[s.userCodesKey]?.value), vehicles: isFull(shared[s.vehicleCodesKey]?.value) },
      heldCodes: { users: codesIn(client[s.plcUserCodesKey]?.value), vehicles: codesIn(client[s.plcVehicleCodesKey]?.value) },
      lastDispenseVolume: volume !== null && isFinite(volume) ? volume : null,
      lastDispenseTs: Number(ts[s.stationDispenseVolumeKey]?.ts) || null,
      lastDispensePump: String(ts[s.stationDispensePumpKey]?.value ?? ""),
    });
  }

  /** Apply the PLC's Market → Site location (once the hierarchy has loaded). */
  private locatePlc(p: PlcRow): PlcRow {
    const loc = this.plcLocations.get(p.plcId);
    return { ...p, siteId: loc?.siteId ?? "", site: loc?.siteName ?? "", marketId: loc?.marketId ?? "" };
  }

  // -- data: settings ---------------------------------------------------------------

  /** The station panel's code count: the Codes page on that list, filtered to the station's site — the panel closes (as its "View full activity"). */
  showStationCodes(kind: CodeKind): void {
    const st = this.selectedStation;
    if (st) {
      this.closeStation();
      this.openStationCodes(st, kind);
    }
  }

  /** The station panel's ⟲ beside its codes: that list to this station once more. */
  repushStation(kind: CodeKind): void {
    const st = this.selectedStation;
    if (st) {
      this.repushCodes(kind, [st.plc]);
    }
  }

  /**
   * Send stations their user / vehicle list once more (a station panel's
   * repush): each its own list as the backend last built it — its market's
   * codes and its site's — written again (the gateway rewrites its IoT array),
   * and a load given up on cleared with its tries, so the backend tries it
   * again: the RequestCodeTransfer calculated field marks a load pending while
   * the PLC's table differs from the list and the array is read back, and the
   * Fuel Code Transfer rule chain commands it (TRUE to its transfer flag, by
   * RPC) until the table holds it. A table already holding the list needs no
   * load. A station still loading that list is left alone — its array must not
   * change mid-load.
   */
  private repushCodes(kind: CodeKind, plcs: PlcRow[]): void {
    const s = this.settings;
    const label = codeKindLabel(kind, true);
    const busy = plcs.filter((plc) => plcLoading(plc, kind));
    const idle = plcs.filter((plc) => !plcLoading(plc, kind));
    if (busy.length) {
      this.toasts.warn(
        `${busy.length === 1 ? "The station is" : `${busy.length} stations are`} still loading ${label.toLowerCase()} codes — try again once ${busy.length === 1 ? "it's" : "they're"} done.`
      );
    }
    if (!idle.length) {
      return;
    }
    const listKey = codeAssetConfig(s, kind).listKey;
    const retry = (kind === "users" ? [s.userCodesXferFailedKey, s.userCodesXferTriesKey] : [s.vehicleCodesXferFailedKey, s.vehicleCodesXferTriesKey]).map(
      (key) => ({ key, value: "" })
    );
    const cfg = QUIET_REQUEST;
    this.settingsSaving = true;
    forkJoin(
      idle.map((plc) => {
        const id = { entityType: EntityType.DEVICE, id: plc.plcId };
        return this.ctx.attributeService.getEntityAttributes(id, AttributeScope.SHARED_SCOPE, [listKey], cfg).pipe(
          switchMap((attrs) => {
            const list = attrs.find((a) => a.key === listKey)?.value;
            return list == null || list === ""
              ? of(false) // no list built for it yet
              : this.ctx.attributeService
                  .saveEntityAttributes(id, AttributeScope.SHARED_SCOPE, [{ key: listKey, value: list }], cfg)
                  .pipe(
                    switchMap(() => this.ctx.attributeService.saveEntityAttributes(id, AttributeScope.SERVER_SCOPE, retry, cfg)),
                    map(() => true)
                  );
          }),
          catchError(() => of(false))
        );
      })
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((results) => {
        this.settingsSaving = false;
        const sent = results.filter(Boolean).length;
        if (sent === results.length) {
          this.toasts.success(`${label} codes sent again${sent === 1 ? "" : ` to ${sent} stations`}`);
        } else if (sent) {
          this.toasts.warn(`${label} codes sent again to ${sent} of ${results.length} stations.`);
        } else {
          this.toasts.error(`Couldn't send the ${label.toLowerCase()} codes again.`);
        }
        this.loadPlcs(); // its Updating status
        this.cd.detectChanges();
      });
  }

  /**
   * The Stations table: one row per PLC in its filters (the location filters by
   * the PLC's own site / market, its product line its site's), with its pumps
   * for its panel — the pumps its PLC links to by the station → pump relation
   * (a pump on no station isn't listed under one).
   */
  private applyStations(): void {
    const pumpsOf = new Map<string, PumpRow[]>();
    for (const pump of this.pumps) {
      const plcId = this.pumpStations.get(pump.pumpId);
      if (plcId) {
        pumpsOf.set(plcId, [...(pumpsOf.get(plcId) ?? []), pump]);
      }
    }
    const productLineNames = new Map(this.productLines.map((pl) => [pl.id, pl.name]));
    const productLineCodes = new Map(this.productLines.map((pl) => [pl.id, pl.code]));
    // Each Fuel site's code (its asset name), from the markets' sites.
    const siteCodes = new Map(this.markets.flatMap((m) => m.sites.map((x) => [x.id, x.code] as const)));
    /** A column's value by its code, its label for the bubble ("" when it's the code). */
    const coded = (label: string, code: string | undefined) => ({ code: code || label, label: code && label !== code ? label : "" });
    // Each device's active alarms, by their tone (a station's Attention: its PLC's and its pumps').
    const alarmTones = new Map<string, { tone: StatusPillTone }[]>();
    for (const a of this.allAlarms) {
      if (!a.cleared) {
        alarmTones.set(a.originatorId, [...(alarmTones.get(a.originatorId) ?? []), { tone: alarmSeverityTone(a.severity) }]);
      }
    }
    const now = Date.now();
    this.allStations = this.plcs.map((plc) => {
      const pumps = pumpsOf.get(plc.plcId) ?? [];
      const market = this.marketById(plc.marketId) ?? this.marketById(pumps[0]?.marketId ?? "");
      // Its last dispense as the rule chain copies it to the PLC (litres, pump, time); else its pumps' latest time.
      const latest = plc.lastDispenseTs ?? (Math.max(0, ...pumps.map((p) => p.lastDispenseTs ?? 0)) || null);
      const volume = plc.lastDispenseTs ? plc.lastDispenseVolume : null;
      const siteId = plc.siteId || pumps[0]?.siteId || "";
      const productLineId = this.siteProductLines.get(siteId) ?? "";
      const site = coded(plc.site || pumps[0]?.site || "", siteCodes.get(siteId));
      const marketCell = coded(market?.name ?? "", market?.code);
      const line = coded(productLineNames.get(productLineId) ?? "", productLineCodes.get(productLineId));
      // Its codes — its market's and its site's own (the list the backend merges for it) — against its own capacity.
      const userCodes = market ? siteCodeCount(market, siteId, "users") : 0;
      const vehicleCodes = market ? siteCodeCount(market, siteId, "vehicles") : 0;
      const statusId = plcStatus(plc);
      const attention = stationAttention({
        pumps,
        alarmSeverities: [plc.plcId, ...pumps.map((p) => p.pumpId)].flatMap((id) => alarmTones.get(id) ?? []),
        updating: statusId === "updating",
        codesSync: plc.codesSync,
        userCodes,
        userCodeLimit: plc.limits.users,
        vehicleCodes,
        vehicleCodeLimit: plc.limits.vehicles,
        now,
      });
      return {
        rowKey: plc.plcId,
        name: plc.name,
        site: plc.site || pumps[0]?.site || "",
        siteId,
        market: market?.name ?? "",
        marketId: market?.id ?? "",
        productLine: productLineNames.get(productLineId) ?? "",
        productLineId,
        siteCode: site.code,
        siteLabel: site.label,
        marketCode: marketCell.code,
        marketLabel: marketCell.label,
        productLineCode: line.code,
        productLineLabel: line.label,
        profile: plc.type,
        userCodes,
        userCodeLimit: plc.limits.users,
        vehicleCodes,
        vehicleCodeLimit: plc.limits.vehicles,
        userSync: codeSyncMark(plc, "users"),
        vehicleSync: codeSyncMark(plc, "vehicles"),
        status: plcStatusMeta(plc),
        statusId,
        lastDispense: formatWhen(latest),
        lastDispenseTs: latest,
        lastDispenseAmount: volume === null ? "" : `${fmtNumber(volume, Number.isInteger(volume) ? 0 : 1)} L`,
        lastDispensePump: plc.lastDispenseTs ? plc.lastDispensePump : "",
        pumpCount: pumps.length,
        plc,
        pumps,
        attention,
        attentionRank: attentionRank(attention),
      };
    });
    // The table: the location filters, then Status and Attention (the options are counted in buildSidebarFilters).
    this.scopedStations = this.allStations.filter((r) => this.locationPasses(r));
    this.stationRows = this.scopedStations.filter((r) => this.stationPasses(r));
    // Keep the open panel on the refreshed station (closed when it's gone — not when the Status filter only hides its row).
    if (this.selectedStation) {
      const updated = this.scopedStations.find((r) => r.rowKey === this.selectedStation!.rowKey);
      if (updated) {
        const pumpsBefore = this.selectedStation.pumps.map((p) => p.pumpId).join(",");
        this.selectedStation = updated;
        this.syncStationPumpEdits(false); // its pumps refreshed: edits kept
        this.refreshStationTotals(pumpsBefore); // and its charts, now and then
      } else {
        this.closeStation();
      }
    }
    this.applyAlarmScope();
    this.buildStationSummary();
  }

  /** A station's user / vehicle code count: the Codes page, filtered to its site (the codes working there) and that list. */
  openStationCodes(row: StationTableRow, kind: CodeKind): void {
    if (row.siteId) {
      this.codeSites = [row.siteId];
    }
    this.showPage("codes", CODES_VIEW[kind]);
    this.writeUrlState();
  }

  /** The assign panel's pick: its places ({@link placesOfPlants}), their PLCs and the room they have left. */
  private applyAssignPlcs(): void {
    this.assignPlaces = placesOfPlants(this.assignPlantIds, this.markets);
    this.assignPlcs = atPlaces(this.assignPlaces, this.plcs);
    this.assignRoom = placesRoom(this.assignPlaces, this.markets);
  }

  private get plcFilter(): EntityFilter {
    return { type: AliasFilterType.deviceType, deviceTypes: this.settings.plcDeviceTypes, deviceNameFilter: "" };
  }

  /**
   * Live subscription over the markets' and sites' code lists (`userCodes` / `vehicleCodes`, server attributes): every code change —
   * assigned, imported, moved, disabled, enabled, deleted, here or anywhere else — rewrites one of them, so a change reloads the
   * markets (debounced: one change touches several lists, and this dashboard's own changes reload them too). The stations' and
   * markets' code counts, "Codes nearly full" and the Codes page follow.
   */
  private subscribeCodeLists(): void {
    const s = this.settings;
    subscribeLatestChanges(
      this.ctx,
      this.destroyRef,
      {
        entityFilter: { type: AliasFilterType.assetType, assetTypes: [s.marketAssetType, s.siteAssetType], assetNameFilter: "" },
        attributes: [codeAssetConfig(s, "users").listKey, codeAssetConfig(s, "vehicles").listKey],
      },
      () => {
        clearTimeout(this.codeListsRefreshTimer);
        this.codeListsRefreshTimer = setTimeout(() => this.loadHierarchy(), 1000);
      },
      (subscription) => (this.codeListsSubscription = subscription)
    );
  }

  /** Live subscription over the PLCs' online state and transfer flags; a change reloads them (debounced). */
  private subscribePlcs(): void {
    const s = this.settings;
    subscribeLatestChanges(
      this.ctx,
      this.destroyRef,
      // A new dispense on a station refreshes it too (its Last dispense).
      // Its code lists too (as sent, and its own tables) — its "Codes not synced" follows them.
      {
        entityFilter: this.plcFilter,
        attributes: [
          "active",
          s.userCodesXferKey,
          s.vehicleCodesXferKey,
          s.userCodesKey,
          s.vehicleCodesKey,
          s.plcUserCodesKey,
          s.plcVehicleCodesKey,
          s.userCodesXferPendingKey,
          s.vehicleCodesXferPendingKey,
        ],
        timeseries: [s.stationDispenseVolumeKey],
      },
      () => {
        clearTimeout(this.plcsRefreshTimer);
        this.plcsRefreshTimer = setTimeout(() => this.loadPlcs(), 300);
      },
      (subscription) => (this.plcsSubscription = subscription)
    );
  }

  /** Scope pumps, stations, activity and alarms to the Product line / Market / Site filters (and the table to its own). */
  private applyFilters(): void {
    this.visiblePumps = this.pumps.filter((p) => this.locationPasses(p));
    this.applyStations();
    this.applyActivityFilter();
    this.buildSidebarFilters();
    this.applyAlarmScope();
    // The Reports page: read once the pumps and their places are in; built again as they change (stations, sites, fuel types).
    if (this.view === "reports") {
      if (this.reportKey) {
        this.buildReport();
      } else {
        this.ensureReport();
      }
    }
  }

  /**
   * The Product line / Market / Site filters on a station or a pump (by its
   * site and market; its product line is its site's): every one of them, or
   * every one but `except` — for that filter's own counts.
   */
  private locationPasses(loc: { siteId: string; marketId: string }, except?: LocationFacet): boolean {
    // Only what's at the Fuel application's sites (located in one of the dashboard's markets): a station or pump elsewhere isn't its.
    if (!loc.marketId) {
      return false;
    }
    const productLine = this.siteProductLines.get(loc.siteId) ?? "";
    return (
      (except === "productLine" || !this.selectedProductLines.length || this.selectedProductLines.includes(productLine)) &&
      (except === "site" || !this.selectedSites.length || this.selectedSites.includes(loc.siteId))
    );
  }

  /** The Stations table's own filters (Status, Attention) on a station: both, or both but `except` — for that filter's own counts. */
  private stationPasses(row: StationTableRow, except?: "status" | "attention"): boolean {
    const picked = this.selectedStationAttention;
    return (
      (except === "status" || !this.selectedStationStatuses.length || this.selectedStationStatuses.includes(row.statusId)) &&
      (except === "attention" ||
        !picked.length ||
        (row.attention.length ? row.attention.some((a) => picked.includes(a.kind)) : picked.includes(NO_ATTENTION)))
    );
  }

  /**
   * The Stations page's filters (Activity's Pumps shares the location ones),
   * each counted under the others (as the gateways dashboard's): on Activity's
   * Pumps the station events under its Events, Pump, User and Vehicle
   * filters (by their pump), else the stations. (A filter greys out a 0
   * count itself, unless it's picked.)
   */
  private buildSidebarFilters(): void {
    this.reportLocationOptions = this.buildPumpLocationOptions();
    if (this.view === "activity") {
      const groups = new Set(this.activityGroups);
      const pumpById = new Map(this.pumps.map((p) => [p.pumpId, p] as [string, PumpRow]));
      const located = this.stationEvents
        .filter((e) => (!groups.size || groups.has(e.group)) && this.activityPumpPasses(e) && this.activityCodePasses(e))
        .map((e) => pumpById.get(e.pumpId))
        .filter((p): p is PumpRow => !!p);
      this.buildLocationFilters(located);
      return;
    }
    // Status counted under the location filters and Attention, Attention under them and Status, those under both.
    const forStatus = this.scopedStations.filter((r) => this.stationPasses(r, "status"));
    this.stationStatusOptions = PLC_STATUSES.map((id) => ({
      id,
      label: PLC_STATUS_META[id].label,
      count: forStatus.filter((r) => r.statusId === id).length,
    }));
    const forAttention = this.scopedStations.filter((r) => this.stationPasses(r, "attention"));
    this.stationAttentionOptions = [
      ...STATION_ATTENTIONS.map((id: StationAttention) => ({
        id,
        label: STATION_ATTENTION_META[id].label,
        count: forAttention.filter((r) => r.attention.some((a) => a.kind === id)).length,
      })),
      { id: NO_ATTENTION, label: "None", count: forAttention.filter((r) => !r.attention.length).length },
    ];
    this.buildLocationFilters(this.allStations.filter((r) => this.stationPasses(r)));
  }

  /**
   * The Product line and Site options, each counted over `items` (stations,
   * or station events' pumps) under the other: the product lines of the
   * dashboard's sites (one still checked stays, to be cleared), and the shared
   * site tree of every market and its sites ({@link siteTree}) — the lists
   * themselves, whether or not anything is at them yet.
   */
  private buildLocationFilters(items: { siteId: string; marketId: string }[]): void {
    const byLabel = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label, undefined, { numeric: true });
    const count = (except: LocationFacet, matches: (x: { siteId: string; marketId: string }) => boolean) =>
      items.filter((x) => this.locationPasses(x, except) && matches(x)).length;
    const sites = new Map<string, { id: string; name: string; code: string }>();
    this.markets.forEach((m) => m.sites.forEach((site) => sites.set(site.id, site)));
    // Only the product lines of the dashboard's sites (and one still checked, so it can be cleared).
    const lines = new Set([...sites.keys()].map((id) => this.siteProductLines.get(id)).filter((id): id is string => !!id));
    this.productLineFilterOptions = this.productLines
      .filter((pl) => lines.has(pl.id) || this.selectedProductLines.includes(pl.id))
      .map((pl) => ({ id: pl.id, label: pl.code || pl.name, count: count("productLine", (x) => this.siteProductLines.get(x.siteId) === pl.id) }))
      .sort(byLabel);
    // Product lines by their names (codes: "RMX"); the sites as the shared tree, a site counting what's at it under the Product line filter.
    const atSite = new Map<string, number>();
    items.filter((x) => this.locationPasses(x, "site")).forEach((x) => atSite.set(x.siteId, (atSite.get(x.siteId) ?? 0) + 1));
    this.siteFilterOptions = this.siteTree((id) => atSite.get(id) ?? 0);
  }

  /**
   * Every page's Site filter (Stations, Activity's Pumps, Reports): the shared site tree (`siteFilterTree` — "All sites" › each
   * fuel-management market by its code › its sites by label and code), a site counting `countAt` it, a market the sum of its sites'.
   */
  private siteTree(countAt: (siteId: string) => number): FilterListOption[] {
    const sites: PlantTreeSite[] = this.markets.flatMap((m) => m.sites.map((site) => ({ id: site.id, name: site.code || site.name, label: site.name, marketId: m.id })));
    return siteFilterTree(sites, this.markets.map((m) => ({ id: m.id, name: m.code || m.name })), countAt);
  }

  /** The Reports page's Site filter: the shared site tree, a site counted by the pumps at it (the fuel comes from the pumps). */
  private buildPumpLocationOptions(): FilterListOption[] {
    const perSite = new Map<string, number>();
    this.pumps.forEach((p) => p.siteId && perSite.set(p.siteId, (perSite.get(p.siteId) ?? 0) + 1));
    return this.siteTree((id) => perSite.get(id) ?? 0);
  }

  /**
   * The Codes page: the Sites filter (the shared site tree; none checked = all),
   * the codes working at the sites in it (placed at one of them, or at its
   * market), and their code changes (the Activity page's Codes: logged on the
   * markets of those sites). The Type / Sites / Status counts follow the view:
   * codes on Codes, changes (in the time window) on Activity's Codes (the filters
   * grey out a 0 count themselves, unless it's picked).
   */
  private applyCodes(): void {
    this.ensureCodeUsage(); // the Codes tables' Last used: read once a Codes page shows
    const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, undefined, { numeric: true });
    const markets = [...this.markets].sort(byName);
    // The Reports page's Type filter: every market's users / vehicles.
    this.reportTypeOptions = CODE_KINDS.map((k) => ({ id: k.id, label: k.label, count: distinctCodes(markets, k.id).length }));
    // Every site of the markets, by the market holding it.
    const marketOfSite = new Map<string, string>(markets.flatMap((m) => m.sites.map((x) => [x.id, m.id] as [string, string])));
    // Drop picks of sites that are gone (keeping the array when nothing changes).
    if (this.codeSites.some((id) => !marketOfSite.has(id))) {
      this.codeSites = this.codeSites.filter((id) => marketOfSite.has(id));
    }
    const picked = new Set(this.codeSites);
    const scope = picked.size ? picked : null;
    /** The sites a market's code entry works at: its own site, or every site of the market (the market's own list). */
    const sitesOf = (m: MarketNode, c: AccessCode): string[] => (c.siteId ? [c.siteId] : m.sites.map((x) => x.id));
    /** How many codes of a list work at any of `sites` (null: anywhere) — a code once, however many places. */
    const codesAt = (sites: Set<string> | null, k: CodeKind, pass: (c: AccessCode) => boolean = () => true) =>
      new Set(
        markets.flatMap((m) => m.codes[k].filter((c) => pass(c) && (!sites || sitesOf(m, c).some((id) => sites.has(id)))).map((c) => c.assetId))
      ).size;
    // Code changes are logged on each of their markets: the markets of the sites in the filter.
    const scopeIds = new Set(scope ? [...scope].map((id) => marketOfSite.get(id) ?? "") : markets.map((m) => m.id));
    // The open tab's list on Users / Vehicles; the Type filter's lists on Activity's Codes (none checked = both).
    const kinds: CodeKind[] = this.codesView ? [this.codesView] : this.codeTypes.length ? this.codeTypes : CODE_KINDS.map((k) => k.id);
    // Code changes are logged on each of their markets; a change of no known list shows only unfiltered.
    const changes = this.allEvents.filter((e) => e.group === "codes");
    const ofType = (e: ActivityRow) => !this.codeTypes.length || (!!e.codeKind && this.codeTypes.includes(e.codeKind));
    // Activity's Codes: the User / Vehicle filters too (each filter counted under the others).
    const ofCode = (e: ActivityRow) => this.activityCodePasses(e);
    const onActivity = this.view === "codeActivity";
    // The Users / Vehicles tables' Status filter (none checked = all).
    const statusPasses = (c: AccessCode) => !this.codeStatuses.length || this.codeStatuses.includes(c.status);
    // The Sites filter: the shared site tree, each option counting what's at its sites under the other filters — the codes working
    // there (Codes), the changes logged on their markets (Activity's Codes) — a branch each once, not once a site.
    const countAt = (sites: Set<string>) =>
      onActivity
        ? new Set(changes.filter((e) => ofType(e) && ofCode(e) && [...sites].some((id) => marketOfSite.get(id) === e.pumpId)).map(codeChangeKey)).size
        : kinds.reduce((n, k) => n + codesAt(sites, k, statusPasses), 0);
    const leaves = (o: FilterListOption): string[] => (o.children?.length ? o.children.flatMap(leaves) : [o.id]);
    const recount = (o: FilterListOption): FilterListOption => ({
      ...o,
      ...(o.children?.length ? { children: o.children.map(recount) } : {}),
      count: countAt(new Set(leaves(o))),
    });
    this.codeSiteOptions = this.siteTree(() => 0).map(recount);
    // A change logged on several of the markets in the filter shows once, naming them.
    const scopedChanges = this.collapseCodeChanges(changes.filter((e) => scopeIds.has(e.pumpId)));
    this.codeTypeOptions = CODE_KINDS.map((k) => ({
      id: k.id,
      label: k.label,
      count: onActivity ? scopedChanges.filter((e) => e.codeKind === k.id && ofCode(e)).length : codesAt(scope, k.id),
    }));
    this.codeActivityUserOptions = this.buildActivityCodeOptions(scopedChanges.filter(ofType), "users");
    this.codeActivityVehicleOptions = this.buildActivityCodeOptions(scopedChanges.filter(ofType), "vehicles");
    this.codeActivityRows = scopedChanges.filter((e) => ofType(e) && ofCode(e));
    // Status counted under the Sites filter (the open tab's list).
    this.codeStatusOptions = CODE_STATUSES.map((id) => ({
      id,
      label: CODE_STATUS_META[id].label,
      count: kinds.reduce((n, k) => n + codesAt(scope, k, (c) => c.status === id), 0),
    }));
    // The open tab's list — a row a code, with every place it works at and its last dispense — of the codes working at a site in the
    // filter, per Status, newest first.
    // Each row flagged when a station it should be at has no room for it (its list full, the code cut from what's sent).
    const flagged = (r: AccessCodeRow): AccessCodeRow => {
      const misfits = codeMisfits(r, this.plcs);
      return misfits.length ? { ...r, attention: codeAttention(r, misfits), attentionRank: misfits.length } : r;
    };
    this.codeRows = kinds
      .flatMap((k) => toAccessCodeRows(markets, k, statusPasses, this.codeUsage))
      .filter((r) => !picked.size || r.siteIds.some((id) => picked.has(id)))
      .map(flagged)
      .sort((a, b) => (b.source.createdAt || 0) - (a.source.createdAt || 0));
    // The open code's panel on its refreshed row (closed when it's gone — deleted), its plants with it.
    if (this.selectedCode) {
      const id = this.selectedCode.source.assetId;
      const updated = toAccessCodeRows(markets, this.selectedCode.kind, (c) => c.assetId === id, this.codeUsage).map(flagged)[0];
      if (updated) {
        this.selectedCode = updated;
        this.setSelectedCodePlants(updated);
        if (this.codeMapOpen) {
          this.codeMap = this.buildCodeMap(); // its tree follows (a slot freed, a station loaded)
        }
      } else {
        this.closeCode();
      }
    }
    // Auto-sized like the Pumps table: column widths follow their content (the tab names the type).
    this.buildCodeColumns();
  }

  /** A Codes page shown: each code's last dispense, read once (then again after a pump's dispense — {@link subscribePumps}). */
  private ensureCodeUsage(): void {
    if (this.codesView && this.codeUsage === null && !this.codeUsageLoading) {
      this.loadCodeUsage();
    }
  }

  /**
   * Each code asset's last dispense: the latest `fuelVolume` point of every FuelUser / FuelVehicle asset (the FuelPump Transactions
   * chain writes one with each of the code's dispenses), one entity query a page at a time. A read failing ends as none ("Never").
   */
  private loadCodeUsage(): void {
    const s = this.settings;
    const read = ++this.codeUsageRead;
    this.codeUsageLoading = true;
    const key = s.dispenseVolumeKey;
    const types = [codeAssetConfig(s, "users").type, codeAssetConfig(s, "vehicles").type];
    const page = (n: number): Observable<Map<string, number>> =>
      this.ctx.entityService
        .findEntityDataByQuery(
          {
            entityFilter: { type: AliasFilterType.assetType, assetTypes: types, assetNameFilter: "" },
            entityFields: [{ type: EntityKeyType.ENTITY_FIELD, key: "name" }],
            latestValues: [{ type: EntityKeyType.TIME_SERIES, key }],
            pageLink: { pageSize: 1024, page: n },
          },
          QUIET_REQUEST
        )
        .pipe(
          switchMap((result) => {
            const seen = new Map<string, number>();
            for (const d of result.data) {
              const ts = Number(d.latest?.[EntityKeyType.TIME_SERIES]?.[key]?.ts) || 0;
              if (ts > 0) {
                seen.set(d.entityId.id, ts);
              }
            }
            return result.hasNext && n < 20 ? page(n + 1).pipe(map((rest) => new Map([...seen, ...rest]))) : of(seen);
          })
        );
    page(0)
      .pipe(
        catchError(() => of(new Map<string, number>())),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((usage) => {
        if (read !== this.codeUsageRead) {
          return; // a newer read is under way
        }
        this.codeUsage = usage;
        this.codeUsageLoading = false;
        this.applyCodes();
        this.cd.detectChanges();
      });
  }

  /** The open code's plants for its Settings form's tree — a new array only when they changed (the form resets to it). */
  private setSelectedCodePlants(r: AccessCodeRow): void {
    const next = plantsOfPlaces(r.places, this.markets);
    const now = this.selectedCodePlants;
    if (next.length !== now.length || next.some((id, i) => id !== now[i])) {
      this.selectedCodePlants = next;
    }
  }

  /**
   * One code change logged on several markets (the same time, kind and code — {@link codeChangeKey}) shown once: the first row,
   * its Market cell naming each of them.
   */
  private collapseCodeChanges(rows: ActivityRow[]): ActivityRow[] {
    const byKey = new Map<string, ActivityRow>();
    for (const e of rows) {
      const key = codeChangeKey(e);
      const seen = byKey.get(key);
      if (!seen) {
        byKey.set(key, e);
      } else if (!seen.pump.split(", ").includes(e.pump)) {
        byKey.set(key, { ...seen, pump: `${seen.pump}, ${e.pump}` });
      }
    }
    return [...byKey.values()];
  }

  /** Each market's limits — the strictest of the stations (PLCs) located in it — and each of its sites' (null: no station there); never the pumps'. */
  private applyMarketLimits(): void {
    const fallback = this.settings.maxCodesPerStation;
    this.markets = this.markets.map((m) => ({
      ...m,
      limits: strictestCodeLimits(
        this.plcs.filter((p) => p.marketId === m.id).map((p) => p.limits),
        fallback
      ),
      sites: m.sites.map((x) => {
        const plcs = this.plcs.filter((p) => p.siteId === x.id);
        return { ...x, limits: plcs.length ? strictestCodeLimits(plcs.map((p) => p.limits), fallback) : null };
      }),
    }));
  }

  /** Replace one of a market's code lists (after a save) and refresh everything derived from it. */
  private patchMarketCodes(marketId: string, kind: CodeKind, list: AccessCode[]): void {
    this.markets = this.markets.map((m) => (m.id === marketId ? { ...m, codes: { ...m.codes, [kind]: list } } : m));
    this.pumps = this.pumps.map((p) => this.locate(p));
    this.applyFilters();
    this.applyCodes();
    this.applyAssignPlcs(); // the open panels' room
    this.applyImportPlcs();
    this.refreshSelectedPump();
  }

  /**
   * Load the Market → Site → Pump hierarchy:
   * 1. side by side: the markets — every asset of
   *    {@link FuelDashboardSettings.marketAssetType} — and the Fuel
   *    application's sites, where it runs ({@link fuelApplicationSites});
   * 2. per market, two calls side by side — (a) one relation search two levels
   *    deep for the structure: Market → site over the access hierarchy's
   *    {@link FuelDashboardSettings.marketSiteRelation} ("Contains") and site →
   *    device over {@link FuelDashboardSettings.pumpRelation} ("FuelPump") and
   *    {@link FuelDashboardSettings.plcRelation} ("FuelPLC"); (b) one entity
   *    query for the market's related assets one level out — its sites and its
   *    own code assets (every site's) over the user / vehicle code relations
   *    ("FuelUser" / "FuelVehicle") — with their names, labels, types and
   *    creation times; then (c) one entity query per site the Fuel application
   *    runs at for that site's own code assets (its scope: that site only).
   *    (The code assets are deliberately kept out of the relation search: a
   *    relation search over hundreds of them takes seconds, the entity query
   *    half a second.)
   * 3. the market's sites the Fuel application runs at are its sites (no
   *    asset-type check); a market with none isn't shown;
   * 4. each site's FuelPump devices → the pump's location (pumps not of
   *    the pump profile never appear in the table, so they're ignored), and
   *    each site's (or the market's own) FuelPLC devices → the PLC's location —
   *    a market's own PLC only when no site it doesn't run at links it;
   * 5. each code asset → an {@link AccessCode} on its market's user / vehicle
   *    list, by its asset type — scoped to its site when a site links it.
   * Each level is also matched on its relation type client-side, so a FuelPump
   * straight from a market (or a site contained by a site) is never mistaken for
   * the other level.
   */
  private loadHierarchy(): void {
    const s = this.settings;
    const cfg = QUIET_REQUEST;
    const read = ++this.hierarchyRead;
    const nameOf = (d: any) => {
      const f = d.latest?.[EntityKeyType.ENTITY_FIELD] ?? {};
      return String(f["label"]?.value || f["name"]?.value || "");
    };
    /** The asset's own name (its code: the tables show it). */
    const codeOf = (d: any) => String(d.latest?.[EntityKeyType.ENTITY_FIELD]?.["name"]?.value ?? "");
    const assetFields = [
      { type: EntityKeyType.ENTITY_FIELD, key: "name" },
      { type: EntityKeyType.ENTITY_FIELD, key: "label" },
      { type: EntityKeyType.ENTITY_FIELD, key: "type" },
    ];
    const marketsQuery: EntityDataQuery = {
      entityFilter: { type: AliasFilterType.assetType, assetTypes: [s.marketAssetType], assetNameFilter: "" },
      entityFields: assetFields,
      pageLink: { pageSize: 1024, page: 0 },
    };
    const userCodes = codeAssetConfig(s, "users");
    const vehicleCodes = codeAssetConfig(s, "vehicles");
    /** Market -Contains→ asset (the access hierarchy): one of the market's sites. */
    const isSiteLink = (r: EntityRelation, marketId: string) =>
      r.type === s.marketSiteRelation && r.from?.id === marketId && r.to?.entityType === EntityType.ASSET;
    /** A code asset's list, by its asset type (FuelUser / FuelVehicle); null for anything else (a site). */
    const kindOfType = (type: string): CodeKind | null => (type === userCodes.type ? "users" : type === vehicleCodes.type ? "vehicles" : null);
    /** A market's related assets (its sites and code assets), as the entity query returns them. */
    interface RelatedAsset {
      id: string;
      name: string;
      label: string;
      type: string;
      createdTime: number;
      /** A code asset's state (a site: none — active). */
      status: CodeStatus;
    }
    /** A site's own code asset (its scope: `siteId`). */
    type SiteCodeAsset = RelatedAsset & { siteId: string };
    /** A code asset's state (a server attribute). */
    const codeStateKeys = [{ type: EntityKeyType.SERVER_ATTRIBUTE, key: s.codeStatusKey }];
    const relatedAssetsQuery = (marketId: string): EntityDataQuery => ({
      entityFilter: {
        type: AliasFilterType.relationsQuery,
        rootEntity: { entityType: EntityType.ASSET, id: marketId },
        direction: EntitySearchDirection.FROM,
        maxLevel: 1,
        fetchLastLevelOnly: false,
        filters: [
          { relationType: s.marketSiteRelation, entityTypes: [EntityType.ASSET] },
          { relationType: userCodes.relation, entityTypes: [EntityType.ASSET] },
          { relationType: vehicleCodes.relation, entityTypes: [EntityType.ASSET] },
        ],
      } as EntityFilter,
      entityFields: [...assetFields, { type: EntityKeyType.ENTITY_FIELD, key: "createdTime" }],
      latestValues: codeStateKeys,
      pageLink: { pageSize: 1024, page: 0 },
    });
    /** A site's own code assets (its scope: that site only). */
    const siteCodesQuery = (siteId: string): EntityDataQuery => ({
      entityFilter: {
        type: AliasFilterType.relationsQuery,
        rootEntity: { entityType: EntityType.ASSET, id: siteId },
        direction: EntitySearchDirection.FROM,
        maxLevel: 1,
        fetchLastLevelOnly: false,
        filters: [
          { relationType: userCodes.relation, entityTypes: [EntityType.ASSET] },
          { relationType: vehicleCodes.relation, entityTypes: [EntityType.ASSET] },
        ],
      } as EntityFilter,
      entityFields: [...assetFields, { type: EntityKeyType.ENTITY_FIELD, key: "createdTime" }],
      latestValues: codeStateKeys,
      pageLink: { pageSize: 1024, page: 0 },
    });
    const toRelatedAsset = (d: any): RelatedAsset => {
      const f = d.latest?.[EntityKeyType.ENTITY_FIELD] ?? {};
      const attrs = d.latest?.[EntityKeyType.SERVER_ATTRIBUTE] ?? {};
      return {
        id: d.entityId.id,
        name: String(f["name"]?.value ?? ""),
        label: String(f["label"]?.value ?? ""),
        type: String(f["type"]?.value ?? ""),
        createdTime: Number(f["createdTime"]?.value) || 0,
        status: parseCodeStatus(attrs[s.codeStatusKey]?.value),
      };
    };
    /** The sites the Fuel application runs at, while the markets load: this dashboard's. */
    let fuelSites = new Set<string>();
    forkJoin({
      markets: this.ctx.entityService
        .findEntityDataByQuery(marketsQuery, cfg)
        .pipe(map((page) => page.data.map((d) => ({ id: d.entityId.id, name: nameOf(d), code: codeOf(d) })))),
      sites: this.fuelApplicationSites(),
    })
      .pipe(
        map(({ markets, sites }) => {
          fuelSites = sites;
          return sites.size ? markets : []; // nowhere to run: no markets to look into
        }),
        switchMap((markets) =>
          markets.length
            ? forkJoin(
                markets.map((market) =>
                  forkJoin({
                    // (a) Market -Contains→ site -FuelPump / FuelPLC→ device (and Market -FuelPLC→ device).
                    relations: this.ctx.entityRelationService
                      .findByQuery(
                        {
                          parameters: {
                            rootId: market.id,
                            rootType: EntityType.ASSET,
                            direction: EntitySearchDirection.FROM,
                            maxLevel: 2,
                            fetchLastLevelOnly: false,
                          },
                          filters: [
                            { relationType: s.marketSiteRelation, entityTypes: [EntityType.ASSET] },
                            { relationType: s.pumpRelation, entityTypes: [EntityType.DEVICE] },
                            { relationType: s.plcRelation, entityTypes: [EntityType.DEVICE] },
                          ],
                        },
                        cfg
                      )
                      .pipe(catchError(() => of([] as EntityRelation[]))),
                    // (b) its sites and code assets, named.
                    assets: this.ctx.entityService.findEntityDataByQuery(relatedAssetsQuery(market.id), cfg).pipe(
                      map((page) => page.data.map(toRelatedAsset)),
                      catchError(() => of([] as RelatedAsset[]))
                    ),
                  }).pipe(
                    // (c) its Fuel sites' own codes, a query per site, side by side.
                    switchMap(({ relations, assets }) => {
                      const siteIds = [...new Set(relations.filter((r) => isSiteLink(r, market.id)).map((r) => r.to.id as string))].filter((id) =>
                        fuelSites.has(id)
                      );
                      const perSite = siteIds.map((siteId) =>
                        this.ctx.entityService.findEntityDataByQuery(siteCodesQuery(siteId), cfg).pipe(
                          map((page) => page.data.map((d): SiteCodeAsset => ({ ...toRelatedAsset(d), siteId }))),
                          catchError(() => of([] as SiteCodeAsset[]))
                        )
                      );
                      return (perSite.length ? forkJoin(perSite) : of([] as SiteCodeAsset[][])).pipe(
                        map((lists) => ({ market, relations, assets, siteCodes: lists.flat() }))
                      );
                    })
                  )
                )
              )
            : of(
                [] as {
                  market: Pick<MarketNode, "id" | "name" | "code">;
                  relations: EntityRelation[];
                  assets: RelatedAsset[];
                  siteCodes: SiteCodeAsset[];
                }[]
              )
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (perMarket) => {
          if (read !== this.hierarchyRead) {
            return; // a newer read is under way: it applies
          }
          const locations = new Map<string, PumpLocation>();
          const plcLocations = new Map<string, PumpLocation>();
          const markets = perMarket.map(({ market, relations, assets, siteCodes }): MarketNode | null => {
            const byId = new Map(assets.map((a) => [a.id, a] as [string, RelatedAsset]));
            const siteName = (id: string) => {
              const a = byId.get(id);
              return a ? a.label || a.name : "";
            };
            // Its sites: those the Fuel application runs at (a market with none isn't shown); the rest are left out, their devices too.
            const linked = new Set(relations.filter((r) => isSiteLink(r, market.id)).map((r) => r.to.id as string));
            const siteIds = [...linked].filter((id) => byId.has(id) && fuelSites.has(id));
            if (!siteIds.length) {
              return null;
            }
            // Its codes: its own (every site — linked from the market) and its sites' own (linked from a site) — an entry a place (a code
            // picked for several of its plants has one for each).
            const codes: MarketCodes = { users: [], vehicles: [] };
            const scoped = [...assets.map((a) => ({ ...a, siteId: "" })), ...siteCodes.filter((a) => siteIds.includes(a.siteId))];
            for (const a of scoped) {
              const kind = kindOfType(a.type);
              if (kind && !codes[kind].some((c) => c.assetId === a.id && c.siteId === a.siteId)) {
                codes[kind].push({
                  assetId: a.id,
                  siteId: a.siteId,
                  code: codeFromAssetName(a.name, codeAssetConfig(s, kind).prefix),
                  name: a.label,
                  createdAt: a.createdTime,
                  status: a.status,
                });
              }
            }
            codes.users.sort((x, y) => x.createdAt - y.createdAt);
            codes.vehicles.sort((x, y) => x.createdAt - y.createdAt);
            const leftOut = new Set([...linked].filter((id) => !siteIds.includes(id)));
            /** A device linked from one of its sites the Fuel application doesn't run at. */
            const atLeftOutSite = (deviceId: string) =>
              relations.some((x) => x.type === s.plcRelation && x.to?.id === deviceId && leftOut.has(x.from?.id));
            for (const r of relations) {
              // Site -FuelPump→ device: the device's location (first market/site wins).
              if (r.type === s.pumpRelation && siteIds.includes(r.from?.id) && r.to?.entityType === EntityType.DEVICE && !locations.has(r.to.id)) {
                locations.set(r.to.id, { siteId: r.from.id, siteName: siteName(r.from.id), marketId: market.id, marketName: market.name });
              }
              // Site -FuelPLC→ device, or Market -FuelPLC→ device: the PLC's location (a site link wins).
              if (r.type === s.plcRelation && r.to?.entityType === EntityType.DEVICE && !plcLocations.get(r.to.id)?.siteId) {
                if (siteIds.includes(r.from?.id)) {
                  plcLocations.set(r.to.id, { siteId: r.from.id, siteName: siteName(r.from.id), marketId: market.id, marketName: market.name });
                } else if (r.from?.id === market.id && !plcLocations.has(r.to.id) && !atLeftOutSite(r.to.id)) {
                  plcLocations.set(r.to.id, { siteId: "", siteName: "", marketId: market.id, marketName: market.name });
                }
              }
            }
            return {
              id: market.id,
              name: market.name,
              code: market.code,
              codes,
              sites: siteIds.map((id) => ({ id, name: siteName(id), code: byId.get(id)?.name ?? "", limits: null })), // limits: just below
              limits: strictestCodeLimits([], s.maxCodesPerStation), // set from its stations just below
            };
          });
          this.markets = markets.filter((m): m is MarketNode => !!m);
          this.buildCodePlantTree();
          this.pumpLocations = locations;
          this.plcLocations = plcLocations;
          this.marketsLoading = false;
          this.pumps = this.pumps.map((p) => this.locate(p));
          this.plcs = this.plcs.map((p) => this.locatePlc(p));
          this.applyMarketLimits();
          this.applyFilters(); // (re)builds the Stations table with the PLCs' sites
          this.applyCodes();
          this.applyAssignPlcs();
          this.refreshSelectedPump();
          if (this.activityLoaded) {
            this.scheduleActivityRefresh(); // pick up the markets' own events
          } else {
            this.ensureEventsLoaded();
          }
          this.cd.detectChanges();
        },
        error: () => {
          if (read !== this.hierarchyRead) {
            return;
          }
          this.marketsLoading = false;
          console.warn("[fuel-management] Couldn't load the Market → Site hierarchy.");
          this.ensureEventsLoaded();
          this.cd.detectChanges();
        },
      });
  }

  /**
   * The sites the Fuel application ({@link FuelDashboardSettings.fuelApplicationName})
   * runs at: its asset's {@link FuelDashboardSettings.applicationSiteRelation}
   * relations to assets (its Sites tab on the Settings page). No such application: none.
   */
  private fuelApplicationSites(): Observable<Set<string>> {
    const s = this.settings;
    const query: EntityDataQuery = {
      entityFilter: { type: AliasFilterType.assetType, assetTypes: [s.applicationAssetType], assetNameFilter: s.fuelApplicationName } as EntityFilter,
      entityFields: [{ type: EntityKeyType.ENTITY_FIELD, key: "name" }],
      pageLink: { pageSize: 50, page: 0 },
    };
    return this.ctx.entityService.findEntityDataByQuery(query, QUIET_REQUEST).pipe(
      map((page) => page.data.find((d: any) => d.latest?.[EntityKeyType.ENTITY_FIELD]?.["name"]?.value === s.fuelApplicationName)?.entityId.id as string | undefined),
      switchMap((appId) => (appId ? this.ctx.entityRelationService.findByFrom({ entityType: EntityType.ASSET, id: appId }, QUIET_REQUEST) : of([] as EntityRelation[]))),
      map((relations) => new Set(relations.filter((r) => r.type === s.applicationSiteRelation && r.to?.entityType === EntityType.ASSET).map((r) => r.to.id as string))),
      catchError(() => of(new Set<string>()))
    );
  }

  /**
   * The events read at start, once the pumps and the markets are known: the
   * Activity window while an Activity list shows — a week of every pump's
   * events is megabytes, read only when the Activity page first shows (the
   * Stations page reads none: its cards read the pumps' stored day totals).
   */
  private ensureEventsLoaded(): void {
    if (this.pumpsLoading || this.marketsLoading) {
      return;
    }
    if (this.isActivityView) {
      this.ensureActivityLoaded();
    }
  }

  /**
   * The first activity load, once both its sources — the pumps and the markets
   * — are known, so it runs once at start rather than once per arrival.
   */
  private ensureActivityLoaded(): void {
    if (!this.activityLoaded && !this.pumpsLoading && !this.marketsLoading) {
      this.loadActivity();
    }
  }

  /** Re-point the detail panel at the refreshed row object. */
  private refreshSelectedPump(): void {
    if (!this.selectedPump) {
      return;
    }
    const updated = this.pumps.find((p) => p.pumpId === this.selectedPump!.pumpId);
    if (updated) {
      const dirty = this.pumpSettingsDirty; // against the row before the refresh
      this.selectedPump = updated;
      this.syncDetailInputs();
      if (!dirty) {
        this.resetPumpSettings(); // its station / pump label as saved now
      }
    }
  }

  /** Settings-tab value maps, its stall (the Manage card's Release events) + the selected pump's alarms. */
  private syncDetailInputs(): void {
    const p = this.selectedPump;
    this.fuelTypeValues = p ? { [this.settings.fuelTypeKey]: p.fuelType } : {};
    this.pumpStalled = !!p && pumpEventsStalled(p, Date.now());
    this.applyAlarmScope();
  }

  /** Chart + Settings-tab definitions that depend on the configured keys. */
  private buildPanelConfig(): void {
    const s = this.settings;
    this.metricsCharts = [
      {
        chartTitle: "Dispensed volume",
        unit: "L",
        // Each dispense's litres; over a month (day bins, averaged) its days' totals — a point a day, so a bin is its day.
        keys: [{ name: s.dispenseVolumeKey, nameByTimeframe: { "1M": s.dayLitresKey }, label: "Dispensed", color: "var(--c-chart-1)" }],
      },
    ];
    this.fuelTypeSelects = [
      {
        key: s.fuelTypeKey,
        label: "Fuel type",
        options: FUEL_TYPES.map((v) => ({ value: v, label: v })),
      },
    ];
  }

  private get pumpFilter(): EntityFilter {
    return { type: AliasFilterType.deviceType, deviceTypes: this.settings.pumpDeviceTypes, deviceNameFilter: "" };
  }

  /**
   * Live subscription over the pumps' attributes and telemetry; any change
   * reloads the pumps (debounced) and, once loaded, the activity feed. The
   * initial emission is skipped — ngOnInit's loadPumps covers the first render.
   */
  private subscribePumps(): void {
    const s = this.settings;
    subscribeLatestChanges(
      this.ctx,
      this.destroyRef,
      {
        entityFilter: this.pumpFilter,
        // Any-scope keys: a shared or client code-list change reloads the pumps; a pump label changed anywhere, its name.
        // A release's step and log: its Manage card's "Releasing", and how it went (a toast for one asked for here).
        // The station panel's Pumps card: the PLC's overload trip and event buffer for it (their pills), and its use of each period
        // (each written as a dispense lands) — never its last report (the PLC's heartbeat: every pump reloaded every 30 s).
        attributes: [s.siteKey, s.fuelTypeKey, s.pumpLabelKey, s.userCodesKey, s.vehicleCodesKey, s.eventHealStepKey],
        timeseries: [
          s.dispenseVolumeKey,
          s.eventKey,
          s.eventReadyKey,
          s.eventHealKey,
          s.dayLitresKey,
          s.dayDispensesKey,
          s.dayDeniedKey,
          PUMP_OVERLOAD_TRIP_KEY,
          PUMP_BUFFER_FULL_KEY,
          ...FUEL_USED_KEYS,
        ],
      },
      () => {
        clearTimeout(this.pumpsRefreshTimer);
        this.pumpsRefreshTimer = setTimeout(() => this.loadPumps(), 300);
        // A dispense also lands on its codes' assets: their Last used, read again (once read at all).
        if (this.codeUsage) {
          clearTimeout(this.codeUsageTimer);
          this.codeUsageTimer = setTimeout(() => this.loadCodeUsage(), 2000);
        }
        if (this.activityLoaded) {
          this.scheduleActivityRefresh();
        }
      },
      (subscription) => (this.pumpsSubscription = subscription)
    );
  }

  // -- data: activity ---------------------------------------------------------------

  /** Load the events of every pump and every market (code changes) for the selected window, newest first. */
  private loadActivity(): void {
    // A custom range from the calendar, or the last N days up to now.
    const custom = this.activityTimeframe === TB_CUSTOM_TIMEFRAME ? this.activityRange : null;
    const tf = ACTIVITY_TIMEFRAMES.find((t) => t.id === this.activityTimeframe) ?? ACTIVITY_TIMEFRAMES.find((t) => t.id === "1W")!;
    const end = custom ? custom.end : Date.now();
    const start = custom ? custom.start : end - tf.ms;
    this.activityLoading = true;
    this.activityLoaded = true;
    this.readEvents(start, end, true)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ events, capped }) => {
        this.allEvents = events;
        this.activityCapped = capped;
        this.activityLoading = false;
        this.applyFilters();
        this.applyCodes(); // the Activity page's Codes
        this.cd.detectChanges();
      });
  }

  /**
   * The pumps' events — and the markets' (code changes) with `withMarkets` —
   * from `start` to `end`, newest first: at most {@link EVENTS_PER_SOURCE} a
   * source (`capped`: one had that many — its older ones in the window left out).
   */
  private readEvents(start: number, end: number, withMarkets: boolean): Observable<{ events: ActivityRow[]; capped: boolean }> {
    return this.readEventSources(
      [
        ...this.pumps.map((p) => ({ entityType: EntityType.DEVICE, id: p.pumpId, label: p.shortName })),
        ...(withMarkets ? this.markets.map((m) => ({ entityType: EntityType.ASSET, id: m.id, label: m.name })) : []),
      ],
      start,
      end
    );
  }

  /**
   * The events of some pumps (each labelled by its short name) and markets (by
   * name) in a window, newest first — at most `limit` each ({@link
   * EVENTS_PER_SOURCE}; `capped`: one had more); a source that can't be read
   * gives none. Every whole read is kept a while ({@link keepEvents}); `cached`
   * takes a source's from it when a read under {@link EVENT_CACHE_MS} old
   * covers the window (a code panel's: the pumps' events are megabytes).
   */
  private readEventSources(
    sources: { entityType: EntityType; id: string; label: string }[],
    start: number,
    end: number,
    limit = EVENTS_PER_SOURCE,
    cached = false
  ): Observable<{ events: ActivityRow[]; capped: boolean }> {
    const now = Date.now();
    const calls: Observable<{ rows: ActivityRow[]; capped: boolean }>[] = sources.map((src) => {
      const kept = cached ? this.eventCache.get(src.id) : undefined;
      if (kept && kept.start <= start && !kept.capped && now - kept.readAt < EVENT_CACHE_MS) {
        return of({ rows: kept.rows.filter((e) => e.ts >= start && e.ts <= end), capped: false });
      }
      return this.ctx.attributeService
        .getEntityTimeseries(
          { entityType: src.entityType, id: src.id },
          [this.settings.eventKey],
          start,
          end,
          limit,
          undefined,
          undefined,
          undefined,
          undefined,
          QUIET_REQUEST
        )
        .pipe(
          map((data: any) => {
            const points: any[] = data?.[this.settings.eventKey] ?? [];
            return { rows: points.map((pt) => this.toActivityRow(src, pt.ts, pt.value)).filter(Boolean) as ActivityRow[], capped: points.length >= limit };
          }),
          // Kept only a read that runs to now (the cache holds a source's events from its start to now) — never a past window's (the
          // Reports page's period before, a calendar range), which would hide the newer events from the next panel.
          tap(({ rows, capped }) => limit === EVENTS_PER_SOURCE && end >= now - EVENT_CACHE_MS && this.keepEvents(src.id, start, rows, capped)),
          catchError(() => of({ rows: [] as ActivityRow[], capped: false }))
        );
    });
    return (calls.length ? forkJoin(calls) : of([] as { rows: ActivityRow[]; capped: boolean }[])).pipe(
      map((lists) => ({ events: lists.flatMap((l) => l.rows).sort((a, b) => b.ts - a.ts), capped: lists.some((l) => l.capped) }))
    );
  }

  /** A source's whole read kept (see {@link readEventSources}): over a fresh one, only when it reaches further back. */
  private keepEvents(id: string, start: number, rows: ActivityRow[], capped: boolean): void {
    const old = this.eventCache.get(id);
    if (!old || Date.now() - old.readAt >= EVENT_CACHE_MS || start <= old.start) {
      this.eventCache.set(id, { start, readAt: Date.now(), rows, capped });
    }
  }

  /** One event of a pump (labelled by its short name) or a market (by its name). */
  private toActivityRow(src: { id: string; label: string }, ts: number, raw: unknown): ActivityRow | null {
    const e = parsePumpEvent(raw);
    if (!e) {
      return null;
    }
    const meta = EVENT_META[e.type];
    /** A reported number (a dispense's litres, odometer, hours); null when it reported none. */
    const num = (v: unknown) => (v === undefined || v === null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
    return {
      id: `${src.id}-${ts}`,
      ts,
      time: formatWhen(ts, { seconds: true }),
      type: e.type,
      label: meta.label,
      icon: meta.icon,
      tone: meta.tone,
      group: meta.group,
      pumpId: src.id,
      pump: src.label,
      description: eventDescription(e) || "—",
      codeKind: meta.group === "codes" ? (e.vehicleCode ? "vehicles" : e.userCode ? "users" : null) : null,
      // A dispense's details, and a stop's — whatever the PLC had when the fueling stopped.
      volume: hasFuelingDetails(e.type) ? num(e.fuelVolume) : null,
      userCode: String(e.userCode ?? "").trim(),
      vehicleCode: String(e.vehicleCode ?? "").trim(),
      odometer: hasFuelingDetails(e.type) ? num(e.odometer) : null,
      hours: hasFuelingDetails(e.type) ? num(e.hours) : null,
      by: String(e.by ?? "").trim(),
    };
  }

  /**
   * The Stations cards ({@link stationSummary}), in the Reports page's look, from the stations and pumps in the location
   * filters: the stations by their state now (a split bar in the status colours, and those needing attention); dispensing
   * today, from the pumps' stored day totals ("Fuel Daily Totals"); the top stations today, ranked lines — each its share of
   * the day's fuel and its bar. A card's lines wireframed while they're read.
   */
  private buildStationSummary(): void {
    const stations = this.scopedStations;
    const stationsLoading = this.plcsLoading || this.marketsLoading;
    const totalsLoading = stationsLoading || this.pumpsLoading || !this.pumpsLoaded;
    const litres = (l: number) => fmtNumber(l, l > 0 && l < 100 && !Number.isInteger(l) ? 1 : 0);
    const percent = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "");
    // A card's lines while they're read: placeholders (as many as it'll show), never a "Loading…" line.
    const placeholders = (count: number): SummaryRow[] => Array.from({ length: count }, (_, i) => ({ label: `${i}`, value: "" }));

    // The stations by their state: a split in the status marks' colours (online green, updating orange, offline the Offline pill's grey).
    const statusCounts = PLC_STATUSES.map((id) => ({ id, count: stations.filter((r) => r.statusId === id).length }));
    const attention = stations.filter((r) => r.attention.length);
    // Needs attention toned by the worst of them: red (a stall, critical alarms), orange (anything else that needs a look).
    const attentionTone: SummaryValueTone = attention.some((r) => r.attention[0].tone === "error")
      ? "error"
      : attention.some((r) => ["major", "minor", "warning", "caution"].includes(r.attention[0].tone))
        ? "warning"
        : "default";

    // Today at the pumps in the filters: their stored day totals (whole however many events).
    const pumps = this.visiblePumps;
    const pumpIds = new Set(pumps.map((p) => p.pumpId));
    const total = pumps.reduce((sum, p) => sum + p.today.litres, 0);
    const dispenses = pumps.reduce((sum, p) => sum + p.today.dispenses, 0);
    const denied = pumps.reduce((sum, p) => sum + p.today.denied, 0);
    const lastTs = Math.max(0, ...stations.map((r) => r.lastDispenseTs ?? 0)) || null;

    // Each station's litres today (its pumps' day totals), the largest first.
    const byStation = stations
      .map((r) => ({ row: r, litres: r.pumps.filter((p) => pumpIds.has(p.pumpId)).reduce((sum, p) => sum + p.today.litres, 0) }))
      .filter((x) => x.litres > 0)
      .sort((a, b) => b.litres - a.litres)
      .slice(0, 5);
    // A station's icon: its PLC's device profile's — none while every station's is the same (as a table's icons).
    const stationIcon = (r: StationTableRow) => this.icons.of("device", r.profile);
    const stationIcons = new Set(stations.map(stationIcon)).size > 1;

    this.stationSummary = [
      {
        id: "stations",
        title: "Stations",
        wireframe: stationsLoading,
        composition:
          !stationsLoading && stations.length
            ? statusCounts.map((s) => ({ label: PLC_STATUS_META[s.id].label, color: STATION_STATUS_COLORS[s.id], share: s.count / stations.length }))
            : undefined,
        rows: stationsLoading
          ? placeholders(4)
          : [
              ...statusCounts.map((s) => ({
                label: PLC_STATUS_META[s.id].label,
                mark: STATION_STATUS_MARKS[s.id],
                meta: percent(s.count, stations.length),
                value: fmtNumber(s.count),
              })),
              { label: "Needs attention", icon: "flag", meta: percent(attention.length, stations.length), value: fmtNumber(attention.length), tone: attentionTone },
            ],
      },
      {
        id: "dispensing",
        title: "Dispensing today",
        wireframe: totalsLoading,
        rows: totalsLoading
          ? placeholders(5)
          : [
              { label: "Fuel dispensed", icon: "water_drop", value: litres(total), unit: "L" },
              { label: "Dispenses", icon: "receipt_long", value: fmtNumber(dispenses) },
              { label: "Avg per dispense", icon: "avg_pace", value: dispenses ? fmtNumber(total / dispenses, 1) : "—", unit: dispenses ? "L" : "" },
              // Denials and timeouts, their share of every attempt (dispensed or not) muted before them.
              { label: "Denied", icon: "block", meta: percent(denied, denied + dispenses), value: fmtNumber(denied) },
              { label: "Last dispense", icon: "schedule", value: relativeTime(lastTs) },
            ],
      },
      {
        id: "topStations",
        title: "Top stations today",
        link: "See more",
        wireframe: totalsLoading,
        rows: totalsLoading
          ? placeholders(5)
          : byStation.length
            ? byStation.map((x) => ({
                label: x.row.name,
                icon: stationIcons ? stationIcon(x.row) : undefined,
                meta: percent(x.litres, total),
                value: litres(x.litres),
                unit: "L",
                share: x.litres / byStation[0].litres,
              }))
            : [{ label: "No dispenses today", value: "" }],
      },
    ];
  }

  /** The pumps' events (the Activity page's Pumps): everything but code changes (those are its Codes). */
  private get stationEvents(): ActivityRow[] {
    return this.allEvents.filter((e) => e.group !== "codes");
  }

  /**
   * The Activity page's Pumps: location-scope the station events, count them per group, per pump and per user / vehicle code —
   * each under the other filters — then apply them all.
   */
  private applyActivityFilter(): void {
    const ids = new Set(this.visiblePumps.map((p) => p.pumpId));
    const scoped = this.stationEvents.filter((e) => ids.has(e.pumpId));
    const groups = new Set(this.activityGroups);
    const groupPasses = (e: ActivityRow) => !groups.size || groups.has(e.group);
    this.activityGroupOptions = ACTIVITY_FILTERS.map((f) => ({
      id: f.id,
      label: f.label,
      count: scoped.filter((e) => e.group === f.id && this.activityPumpPasses(e) && this.activityCodePasses(e)).length,
    }));
    this.activityPumpOptions = this.buildActivityPumpOptions(scoped.filter((e) => groupPasses(e) && this.activityCodePasses(e)));
    const forCodes = scoped.filter((e) => groupPasses(e) && this.activityPumpPasses(e));
    this.activityUserOptions = this.buildActivityCodeOptions(forCodes, "users");
    this.activityVehicleOptions = this.buildActivityCodeOptions(forCodes, "vehicles");
    const shown = forCodes.filter((e) => this.activityCodePasses(e));
    // Where each happened (its pump's station, site and market) and who (its codes' holders, by name).
    const plcNames = new Map(this.plcs.map((p) => [p.plcId, p.name]));
    const pumps = new Map(this.pumps.map((p) => [p.pumpId, p]));
    const users = new Map(this.markets.flatMap((m) => m.codes.users.map((c) => [c.code, c.name] as const)));
    const vehicles = new Map(this.markets.flatMap((m) => m.codes.vehicles.map((c) => [c.code, c.name] as const)));
    const number = (v: number | null, decimals: number) => (v === null ? "" : fmtNumber(v, decimals));
    this.activityRows = shown.map((e) => {
      const pump = pumps.get(e.pumpId);
      const row = {
        ...e,
        station: plcNames.get(this.pumpStations.get(e.pumpId) ?? "") ?? "",
        site: pump?.site ?? "",
        market: pump?.market ?? "",
        userName: users.get(e.userCode) ?? "",
        vehicleName: vehicles.get(e.vehicleCode) ?? "",
        litres: number(e.volume, 1),
        odometerText: number(e.odometer, 0),
        hoursText: number(e.hours, 0),
      };
      // Its Description's bubble while cut: what happened, then a line a fact.
      return { ...row, descriptionTip: activityTip(row) };
    });
    this.buildStationSummary(); // today's figures follow the events
  }

  /** The Activity table's foot: what's in it — events, dispenses and their litres, denials — and a note when events were left out. */
  get activityTotals(): string {
    const rows = this.activityRows;
    const dispenses = rows.filter(isFueling); // a stop that ended a fueling with litres counts as one
    const litres = dispenses.reduce((sum, r) => sum + (r.volume ?? 0), 0);
    const denied = rows.filter((r) => r.group === "denied").length;
    const plural = (n: number, one: string, many: string) => `${fmtNumber(n)} ${n === 1 ? one : many}`;
    return [
      plural(rows.length, "event", "events"),
      `${plural(dispenses.length, "dispense", "dispenses")} (${fmtNumber(litres, litres < 100 && !Number.isInteger(litres) ? 1 : 0)} L)`,
      plural(denied, "denied", "denied"),
    ].join(" · ");
  }

  /** The events shown read again, a second on: the Activity window once it's been read, else none yet. */
  private scheduleActivityRefresh(): void {
    clearTimeout(this.activityRefreshTimer);
    this.activityRefreshTimer = setTimeout(() => {
      if (this.activityLoaded) {
        this.loadActivity();
      }
    }, 1000);
  }

  /** The Stations page's events as CSV — each dispense's detail a column: where, who (code and holder), litres, odometer, hours. */
  private exportStationActivityCsv(rows: StationActivityRow[]): void {
    const num = (v: number | null) => (v === null ? "" : String(v));
    downloadCsv(
      "fuel-activity",
      ["Time", "Time (UTC)", "Event", "Station", "Pump", "Site", "Market", "User code", "User", "Vehicle code", "Vehicle", "Litres", "Odometer", "Hours", "Description"],
      rows.map((r) => [
        localDateTime(r.ts),
        new Date(r.ts).toISOString(),
        r.label,
        r.station,
        r.pump,
        r.site,
        r.market,
        r.userCode,
        r.userName,
        r.vehicleCode,
        r.vehicleName,
        num(r.volume),
        num(r.odometer),
        num(r.hours),
        r.description === "—" ? "" : r.description,
      ])
    );
  }

  /** The Codes page's changes as CSV: the code, its list, who made the change. */
  private exportCodeActivityCsv(rows: ActivityRow[]): void {
    downloadCsv(
      "fuel-code-activity",
      ["Time", "Time (UTC)", "Event", "Market", "List", "Code", "By", "Description"],
      rows.map((r) => [
        localDateTime(r.ts),
        new Date(r.ts).toISOString(),
        r.label,
        r.pump,
        r.codeKind ? codeKindLabel(r.codeKind, true) : "",
        r.userCode || r.vehicleCode,
        r.by,
        r.description === "—" ? "" : r.description,
      ])
    );
  }

  // -- data: alarms ---------------------------------------------------------------------

  /**
   * Live alarm subscription over the pumps (active alarms only). A REALTIME
   * window keeps it streaming; the wide interval surfaces alarms of any age.
   */
  private subscribeAlarms(): void {
    this.alarmsLoading = true;
    subscribeActiveAlarms(this.ctx, this.destroyRef, {
      // The pumps' and the PLCs' alarms.
      entityFilter: {
        type: AliasFilterType.deviceType,
        deviceTypes: [...this.settings.pumpDeviceTypes, ...this.settings.plcDeviceTypes],
        deviceNameFilter: "",
      },
      onSubscribed: (subscription) => (this.alarmsSubscription = subscription),
      onUpdated: (alarms) => this.onAlarmsUpdated(alarms),
    });
  }

  private onAlarmsUpdated(alarms: DashboardAlarm[]): void {
    this.allAlarms = alarms;
    this.alarmsLoading = false;
    // The stations' Attention follows (their alarms), and its filter's counts; applyStations scopes the alarm lists.
    this.applyStations();
    this.buildSidebarFilters();
    this.cd.detectChanges();
  }

  /** The minute's tick: while a pump has an event frame waiting, its station (and the open pump) may have stalled since — its Attention again. */
  private onAttentionTick(): void {
    if (this.pumps.some((p) => p.eventsWaitingSince !== null)) {
      this.pumpStalled = !!this.selectedPump && pumpEventsStalled(this.selectedPump, Date.now());
      this.applyStations();
      this.buildSidebarFilters();
      this.cd.detectChanges();
    }
  }

  /**
   * Alarms of the visible pumps and stations' PLCs (named by display name over
   * their customer), of the selected pump, and of the selected station (its
   * PLC and pumps).
   */
  private applyAlarmScope(): void {
    const names = new Map<string, { name: string; owner: string }>([
      ...this.visiblePumps.map((p) => [p.pumpId, { name: p.name, owner: p.owner }] as [string, { name: string; owner: string }]),
      ...this.scopedStations.map((s) => [s.rowKey, { name: s.name, owner: s.plc.owner }] as [string, { name: string; owner: string }]),
    ]);
    const named = (a: AlarmListItem) => {
      const d = names.get(a.originatorId);
      return { ...a, originatorName: d?.name ?? a.originatorName };
    };
    this.panelAlarms = this.allAlarms.filter((a) => names.has(a.originatorId)).map(named);
    const id = this.selectedPump?.pumpId;
    this.detailAlarms = id ? this.allAlarms.filter((a) => a.originatorId === id) : [];
    // The station's: its PLC's and its pumps', each row naming its device (its pumps by their own label, "P01" — whatever the
    // table's filters show).
    const station = this.selectedStation;
    const stationNames = new Map<string, string>(station ? [[station.rowKey, station.name], ...station.pumps.map((p): [string, string] => [p.pumpId, p.name])] : []);
    this.stationAlarms = this.allAlarms
      .filter((a) => stationNames.has(a.originatorId))
      .map((a) => ({ ...a, originatorName: stationNames.get(a.originatorId) || a.originatorName }));
  }

  // -- writes -------------------------------------------------------------------------

  /**
   * Edit a scope's user / vehicle code-list SERVER attribute (its allowed
   * codes) — a market's (every site of it) or a site's own: read the current
   * value, apply `edit`, write the result back — no write when `edit` returns
   * null (nothing changed). Reading first keeps edits made elsewhere since the
   * dashboard loaded.
   */
  private updateScopeList(scopeId: string, kind: CodeKind, edit: (raw: unknown) => unknown): Observable<unknown> {
    const key = codeAssetConfig(this.settings, kind).listKey;
    const entityId = { entityType: EntityType.ASSET, id: scopeId };
    const cfg = QUIET_REQUEST;
    return this.ctx.attributeService.getEntityAttributes(entityId, AttributeScope.SERVER_SCOPE, [key], cfg).pipe(
      switchMap((attrs) => {
        const next = edit(attrs.find((a) => a.key === key)?.value);
        return next === null
          ? of(null)
          : this.ctx.attributeService.saveEntityAttributes(entityId, AttributeScope.SERVER_SCOPE, [{ key, value: next }], cfg);
      })
    );
  }

  /**
   * Write code-change activity events, each on every market of the code
   * (`marketIds`) at the same time — so a list of several markets shows it
   * once ({@link codeChangeKey}) — the events a millisecond apart and none
   * later than now (two points of one key at the same instant would overwrite
   * each other), one request a market. Failures (e.g. no telemetry
   * permission) never block the change itself.
   */
  private logCodeEvents(entries: { marketIds: string[]; event: PumpEvent }[]): Observable<unknown> {
    const last = Date.now();
    const byMarket = new Map<string, { ts: number; values: Record<string, string> }[]>();
    entries.forEach((e, i) => {
      const point = { ts: last - (entries.length - 1 - i), values: { [this.settings.eventKey]: JSON.stringify(e.event) } };
      for (const id of new Set(e.marketIds)) {
        byMarket.set(id, [...(byMarket.get(id) ?? []), point]);
      }
    });
    const posts = [...byMarket.entries()].map(([id, body]) =>
      this.ctx.http
        .post(`/api/plugins/telemetry/ASSET/${id}/timeseries/ANY`, body, defaultHttpOptionsFromConfig(QUIET_REQUEST))
        .pipe(catchError(() => of(null)))
    );
    return posts.length ? forkJoin(posts) : of(null);
  }

  /** A code's change as its markets log it: where it works named as {@link placesText} names it in a sentence, who made it. */
  private codeEvent(type: CodeChangeType, kind: CodeKind, code: string, holder: string, places: CodePlace[], change = ""): PumpEvent {
    return codeChangeEvent(type, kind, code, holder, placesText(places, this.markets, true), this.actor, change);
  }

  // -- misc ------------------------------------------------------------------------------

  private loadUserPreferences(): void {
    readUserSettings(this.ctx, this.destroyRef, (settings) => {
      this.theme.restore(settings);
      // The user's sorts: one they picked, or none if they cleared it (a third header click); the default until they've touched it.
      const savedSort = (key: string, columns: DataTableColumn[], fallback: DataTableSort | null): DataTableSort | null => {
        const sort = settings?.[key];
        if (sort === null) {
          return null;
        }
        const valid = sort && columns.some((c) => c.key === sort.key) && (sort.direction === "asc" || sort.direction === "desc");
        return valid ? { key: sort.key, direction: sort.direction } : fallback;
      };
      this.stationSort = savedSort(STATION_SORT_SETTING, this.stationColumns, DEFAULT_STATION_SORT);
      this.codeSort = savedSort(CODE_SORT_SETTING, this.codeSortColumns, DEFAULT_CODE_SORT);
      this.codeMapHorizontal = settings?.[CODE_MAP_LAYOUT_SETTING] === true;
      // The user's "Customize columns" picks.
      this.stationColumnChoice.restore(settings);
      this.codeColumnChoice.restore(settings);
      this.activityColumnChoice.restore(settings);
      this.buildCodeColumns();
      this.cd.detectChanges();
    });
  }

}
