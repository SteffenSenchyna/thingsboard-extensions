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
import { Observable, Subscription, forkJoin, from, of, throwError } from "rxjs";
import { catchError, map, mergeMap, switchMap, tap, toArray } from "rxjs/operators";
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
import { DashboardAlarm, alarmSeverityTone, clearDashboardAlarm, subscribeActiveAlarms } from "../../../components/shared/dashboard/dashboard-alarms";
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
import { CopyBoxComponent } from "../../../components/shared/copy-box/copy-box.component";
import { CollapsibleSectionComponent } from "../../../components/shared/collapsible-section/collapsible-section.component";
import { FoldComponent } from "../../../components/shared/fold/fold.component";
import { AssetRow, ORGANIZATION_SECTION, organizationKindOf, siteOptionLabel } from "../../../components/shared/organization/organization.models";
import { OrganizationStore } from "../../../components/shared/organization/organization-store";
import { OrganizationSettingsComponent } from "../../../components/shared/organization/organization-settings/organization-settings.component";
import { OrganizationPanelsComponent } from "../../../components/shared/organization/organization-panels/organization-panels.component";
import { ACCOUNT_SECTION, AccountSettingsComponent } from "../../../components/shared/account-settings/account-settings.component";
import { APPLICATIONS_SECTION } from "../../../components/shared/applications/applications.models";
import { ApplicationStore } from "../../../components/shared/applications/application-store";
import { ApplicationSettingsComponent } from "../../../components/shared/applications/application-settings/application-settings.component";
import { ApplicationPanelsComponent } from "../../../components/shared/applications/application-panels/application-panels.component";
import { ACCESS_SECTION, AccessPage, accessPageOf } from "../../../components/shared/access/access.models";
import { AccessStore } from "../../../components/shared/access/access-store";
import { AccessSettingsComponent } from "../../../components/shared/access/access-settings/access-settings.component";
import { AccessPanelsComponent } from "../../../components/shared/access/access-panels/access-panels.component";
import { AlarmNotificationPanelComponent } from "../../../components/shared/alarm-subscriptions/alarm-notification-panel.component";
import { CheckFilterComponent } from "../../../components/shared/check-filter/check-filter.component";
import { FilterSectionComponent } from "../../../components/shared/filter-section/filter-section.component";
import { FilterSectionsComponent } from "../../../components/shared/filter-sections/filter-sections.component";
import { ConfirmDialogComponent } from "../../../components/shared/confirm-dialog/confirm-dialog.component";
import { DateRangePickerComponent, TbDateRange } from "../../../components/shared/date-range-picker/date-range-picker.component";
import {
  DataTableCellDirective,
  DataTableColumn,
  DataTableComponent,
  DataTableSort,
} from "../../../components/shared/data-table/data-table.component";
import { TableLinkComponent, TableLinksComponent } from "../../../components/shared/table-links/table-links.component";
import { TableCountComponent } from "../../../components/shared/table-count/table-count.component";
import { PanelStop } from "../../../components/shared/panel-trail/panel-trail";
import { tableManageOf } from "../../../components/shared/data-table/table-manage";
import {
  AttributeSelect,
  DeviceSettingControl,
  DeviceSettingsCardComponent,
} from "../../../components/shared/device-settings-card/device-settings-card.component";
import { keepsSidePanelOpen } from "../../../components/shared/detail-panel/side-panel-outside-click";
import { EntityDetailPanelComponent } from "../../../components/shared/entity-detail-panel/entity-detail-panel.component";
import { FilterListComponent, FilterListOption } from "../../../components/shared/filter-list/filter-list.component";
import { ColumnPickerComponent } from "../../../components/shared/column-picker/column-picker.component";
import { TableColumnChoice, sidebarWidth } from "../../../components/shared/dashboard/table-columns";
import { SettingsSidebarComponent, settingsSidebarWidth } from "../../../components/shared/settings-sidebar/settings-sidebar.component";
import { MetricChartCardComponent, MetricChartSection } from "../../../components/shared/metric-chart-card/metric-chart-card.component";
import { NavRailComponent, NavRailItem } from "../../../components/shared/nav-rail/nav-rail.component";
import { DashboardLoadingComponent, FirstLoad } from "../../../components/shared/dashboard-loading/dashboard-loading.component";
import { SegmentOption, SegmentedControlComponent } from "../../../components/shared/segmented-control/segmented-control.component";
import { SidebarLayoutComponent } from "../../../components/shared/sidebar-layout/sidebar-layout.component";
import { StatAction, StatGridComponent, StatItem } from "../../../components/shared/stat-grid/stat-grid.component";
import { StatusPillComponent, StatusPillTone } from "../../../components/shared/status-pill/status-pill.component";
import { SearchBoxComponent } from "../../../components/shared/search-box/search-box.component";
import { SummaryCard, SummaryCardsComponent, SummaryRow } from "../../../components/shared/summary-cards/summary-cards.component";
import { TB_CUSTOM_TIMEFRAME, TimeframePickerComponent } from "../../../components/shared/timeframe-picker/timeframe-picker.component";
import { ToastsComponent } from "../../../components/shared/toasts/toasts.component";
import { AssignCodeFormComponent } from "../../components/assign-code-form/assign-code-form.component";
import { ImportCodesFormComponent } from "../../components/import-codes-form/import-codes-form.component";
import { AddPumpFormComponent } from "../../components/add-pump-form/add-pump-form.component";
import { SelectComponent, TbSelectOption } from "../../../components/shared/select/select.component";
import { FuelReportsComponent } from "../../components/fuel-reports/fuel-reports.component";
import { CodeDetailsComponent } from "../../components/code-details/code-details.component";
import { CodeSettingsChange, CodeSettingsComponent } from "../../components/code-settings/code-settings.component";
import { FuelReport, REPORT_HOURLY_MAX_DAYS, ReportBucket, ReportPeople, ReportPump, buildFuelReport } from "../../components/fuel-reports/fuel-reports.models";
import { PumpAccessCodesComponent } from "../../components/pump-access-codes/pump-access-codes.component";
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
  CodeRoom,
  codeRoom,
  codeRoomReason,
  siteCodeCount,
  codesSyncState,
  EVENT_META,
  FuelDashboardSettings,
  MarketCodes,
  MarketNode,
  PUMP_STATUS_META,
  PumpEvent,
  PumpLocation,
  PumpRow,
  PumpStatus,
  codeKindLabel,
  fuelDashboardDefaultSettings,
  parseCodeLimits,
  parseOptionalBool,
  lastConnectedGateway,
  plcNotReadyWarning,
  AddPumpRequest,
  FUEL_TYPES,
  nextPumpNumber,
  pumpNamePrefix,
  PlcRow,
  PlcStatus,
  plcStatus,
  plcStatusMeta,
  PLC_STATUS_META,
  PLC_STATUSES,
  PLC_READINESS_META,
  plcReadiness,
  StationTableRow,
  CodeStatus,
  CODE_STATUSES,
  CODE_STATUS_META,
  codeStatusNow,
  parseCodeStatus,
  CodeActivityRow,
  CODE_USAGE_TIMEFRAMES,
  CodeChangeType,
  formatExpiry,
  NO_ATTENTION,
  STATION_ATTENTIONS,
  STATION_ATTENTION_META,
  StationAttention,
  attentionRank,
  stationAttention,
  parseCodeSlots,
  parsePumpEvent,
  shortPumpName,
  strictestCodeLimits,
  toAccessCodeRow,
  withCode,
  withCodes,
  withoutCode,
  withoutCodes,
} from "../../models/fuel-management.models";

/** The rail's pages. */
type DashboardPage = "stations" | "codes" | "reports" | "settings";
/** Stations: Pumps | Activity (station events). Codes: Users | Vehicles | Activity (code changes). */
type DashboardView = "pumps" | "activity" | "userCodes" | "vehicleCodes" | "codeActivity" | "reports" | "settings";

/** The Codes page's view of a list. */
const CODES_VIEW: Record<CodeKind, DashboardView> = { users: "userCodes", vehicles: "vehicleCodes" };

/** Each rail page's views (its tab group), its first the default — the ones the URL may name. */
const PAGE_VIEWS: Record<DashboardPage, DashboardView[]> = {
  stations: ["pumps", "activity"],
  codes: ["userCodes", "vehicleCodes", "codeActivity"],
  reports: ["reports"],
  settings: ["settings"],
};

/** The tables' sorts until the user picks one: stations by name, codes newest first. */
const DEFAULT_STATION_SORT: DataTableSort = { key: "name", direction: "asc" };
const DEFAULT_CODE_SORT: DataTableSort = { key: "added", direction: "desc" };
/** The user-settings keys the tables' sorts are kept under. */
const STATION_SORT_SETTING = "fuelStationSort";
const CODE_SORT_SETTING = "fuelCodeSort";
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
type LocationFacet = "productLine" | "market" | "site";

/** The most events read from one pump or market for a window (ThingsBoard's newest first). */
const EVENTS_PER_SOURCE = 5000;

/** The Stations page's Activity columns shown until the user picks ("Customize columns"): odometer and hours are a pick away. */
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

/** Local midnight today (the Stations cards' "today"). */
function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** The rail's pages. */
const FUEL_PAGES: NavRailItem[] = [
  { id: "stations", label: "Stations", icon: "local_gas_station" },
  { id: "codes", label: "Codes", icon: "key" },
  { id: "reports", label: "Reports", icon: "analytics" },
];

/**
 * Fuel management dashboard: fuel pumps (devices of the configured profiles)
 * and the keypad access codes assigned to them.
 *
 * - Icon rail (left edge, as on the marine dashboard): three pages — Stations,
 *   Codes and Reports — with the alarms and the theme toggle at its foot. Each page has a button
 *   tab group at the top of its sidebar: Pumps | Activity, Codes | Activity.
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
 *   the station panel: Insights (its key figures and its pumps — a pump opens
 *   the pump panel: Insights / Access codes / Alarms / Settings) and the
 *   alarms of the PLC and its pumps.
 * - Codes: the codes of the markets in the filter (each row names its
 *   market), Users | Vehicles; every pump in a market holds its codes (hence
 *   the per-pump Codes count). The assign panel picks the code's market and
 *   lists that market's PLCs —
 *   the controllers holding the pumps' code tables (linked by "FuelPLC" from a
 *   Site or the Market) — with whether each can take a new code now (its
 *   transfer flag, live).
 * - Activity, per page: on Stations the pumps' events (dispenses, denials,
 *   status), filterable by group, sites and time window; on Codes the code
 *   changes (assigned / revoked) of the markets in the filter, by type and time
 *   window. Both export as CSV.
 *
 * Each code is an asset — "FuelUser" / "FuelVehicle", named USR-<code> /
 * VEH-<code>, holder as its label — linked from its market by the relation of
 * the same name. Assigning creates the asset + relation and puts the code in
 * the first free slot of the market's allowed-codes attribute (userCodes /
 * vehicleCodes: a fixed-length array of code strings sized to the pumps' code
 * limits, "" = empty slot); revoking deletes the asset and clears its slot in
 * place. Both
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
    AlarmPanelComponent,
    AssignCodeFormComponent,
    AddPumpFormComponent,
    CopyBoxComponent,
    CollapsibleSectionComponent,
    FoldComponent,
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
    DateRangePickerComponent,
    DataTableCellDirective,
    DataTableComponent,
    DeviceSettingsCardComponent,
    EntityDetailPanelComponent,
    FuelReportsComponent,
    CodeDetailsComponent,
    CodeSettingsComponent,
    FilterListComponent,
    FilterSectionComponent,
    FilterSectionsComponent,
    MetricChartCardComponent,
    DashboardLoadingComponent,
    NavRailComponent,
    PumpAccessCodesComponent,
    SegmentedControlComponent,
    SidebarLayoutComponent,
    SettingsSidebarComponent,
    StatGridComponent,
    StatusPillComponent,
    SearchBoxComponent,
    SummaryCardsComponent,
    TimeframePickerComponent,
    ToastsComponent,
    AccessSettingsComponent,
    AccessPanelsComponent,
    AlarmNotificationPanelComponent,
    TableLinkComponent,
    TableLinksComponent,
    TableCountComponent,
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

  /** The rail's pages: Stations (the pumps + their activity) and Codes (the access codes + their changes). */
  readonly pages = FUEL_PAGES;
  /** Nested in the Home dashboard: its pages — the menu beside its app in Home's rail (its Settings sections are all Home's). */
  static readonly nestedPages: NavRailItem[] = FUEL_PAGES;
  /** Each page's views — the button tab group at the top of its sidebar. */
  readonly stationViews: SegmentOption[] = [
    { id: "pumps", label: "Stations", icon: "local_gas_station", tooltip: "Stations" },
    { id: "activity", label: "Activity", icon: "history", tooltip: "Activity" },
  ];
  readonly codeViews: SegmentOption[] = [
    { id: "userCodes", label: "Users", icon: "person", tooltip: "Users" },
    { id: "vehicleCodes", label: "Vehicles", icon: "local_shipping", tooltip: "Vehicles" },
    { id: "codeActivity", label: "Activity", icon: "history", tooltip: "Activity" },
  ];
  page: DashboardPage = "stations";
  view: DashboardView = "pumps";
  sidebarOpen = true;
  /** Each page's view last shown — the rail returns to it. */
  private pageView: Record<DashboardPage, DashboardView> = { stations: "pumps", codes: "userCodes", reports: "reports", settings: "settings" };
  // -- settings page ------------------------------------------------------------

  /** The Settings page's sections (its menu): the shared Organization, Applications and Appearance. */
  /** The Settings menu — nested, none of these: they're all on Home's Settings page (so no Settings page then). */
  settingsSections = [APPLICATIONS_SECTION, ORGANIZATION_SECTION, ACCESS_SECTION, ACCOUNT_SECTION];
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
  report: FuelReport = buildFuelReport({ start: Date.now(), days: 7, hourly: true, pumps: [], people: null, kinds: [], loading: true, holder: () => "" });
  /** The window's stored totals ("Fuel Daily Totals"), each pump's buckets and its previous window's litres — for the window read (`key`). */
  private reportTotals: { key: string; hourly: boolean; buckets: Map<string, ReportBucket[]>; previous: Map<string, number> } | null = null;
  /** The window's dispense events (who took the fuel), for the window read; null while they load. */
  private reportDispenses: ActivityRow[] | null = null;
  /** The window read last (its start, days and end): a change reads again. */
  private reportKey = "";

  // -- pumps + location filter ------------------------------------------------

  /** Every pump, unfiltered. */
  pumps: PumpRow[] = [];
  pumpsLoading = false;
  /** The stations (PLCs) have loaded at least once — their capacity sizes the markets' code lists. */
  private plcsLoaded = false;
  /** Pumps in the Product line / Market / Site filters (all when none checked): the Activity and the alarms follow them. */
  visiblePumps: PumpRow[] = [];
  /**
   * The Stations page's location filters, as the gateways dashboard's: every
   * product line of the Organization, and the fuel-management markets and
   * their sites (none checked = all). Each is counted under the other filters:
   * stations on Pumps, station events on Activity.
   */
  selectedProductLines: string[] = [];
  productLineFilterOptions: FilterListOption[] = [];
  selectedMarkets: string[] = [];
  marketFilterOptions: FilterListOption[] = [];
  selectedSites: string[] = [];
  siteFilterOptions: FilterListOption[] = [];
  /** The Organization's product lines (by label), and the product line each site belongs to (its Contains parent). */
  /** The product lines: each label (else its name), and its code (its name). */
  productLines: { id: string; name: string; code: string }[] = [];
  private siteProductLines = new Map<string, string>();
  /**
   * The Stations tab's summary cards (above its table), for the stations and
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
  /** The Codes table's "Manage" mode: checkboxes for bulk revoke ("Revoke | Done" in its footer). */
  codesManaging = false;
  /** The codes table's footer state (`tb-table-links`): its Manage, the checked codes that can be revoked. */
  readonly codesManage = tableManageOf({
    managing: () => this.codesManaging,
    selectedCount: () => this.bulkRevokeCount,
    allChecked: () => this.allShownCodesChecked,
    count: () => this.shownCodeCount,
    start: () => this.startManage(),
    end: () => this.stopManage(),
    toggleAll: () => this.toggleAllCodes(),
  });
  selectedCodeRows: AccessCodeRow[] = [];
  /** A bulk revoke awaiting confirmation (null = no dialog). */
  bulkRevokeConfirm: { rows: AccessCodeRow[]; heading: string; message: string } | null = null;
  /** The Activity tables' searches (the sidebar box, beside the CSV export): the Stations page's, the Codes page's. */
  activitySearchTerms: string[] = [];
  activitySearchText = "";
  activitySearch: string[] = [];
  codeActivitySearchTerms: string[] = [];
  codeActivitySearchText = "";
  codeActivitySearch: string[] = [];
  /** The station panel's Pumps card. */
  readonly stationPumpColumns: DataTableColumn[] = [
    { key: "name", header: "", emphasis: "strong" },
    { key: "status", header: "", align: "right" },
  ];
  readonly stationColumns: DataTableColumn[] = [
    { key: "name", header: "Station", emphasis: "strong" },
    // Online, then updating, then offline (ascending).
    { key: "status", header: "Status", sortValue: (row) => PLC_STATUSES.indexOf((row as StationTableRow).statusId) },
    // Nothing first, the worst last (ascending): by its worst reason, then how many.
    { key: "attention", header: "Attention", sortValue: (row) => (row as StationTableRow).attentionRank },
    // By their names (their codes), each label in a bubble on hover.
    { key: "site", header: "Site", sortKey: "siteCode", tooltipKey: "siteLabel", emphasis: "muted" },
    { key: "market", header: "Market", sortKey: "marketCode", tooltipKey: "marketLabel", emphasis: "muted" },
    { key: "productLine", header: "Product line", sortKey: "productLineCode", tooltipKey: "productLineLabel", emphasis: "muted" },
    { key: "pumpCount", header: "Pumps" },
    { key: "userCodes", header: "User codes" },
    { key: "vehicleCodes", header: "Vehicle codes" },
    // A station none of whose pumps has dispensed sorts as the longest ago: first when ordered longest-ago first, last the
    // other way (not sunk to the bottom both ways).
    { key: "lastDispense", header: "Last dispense", nowrap: true, sortValue: (row) => (row as StationTableRow).lastDispenseTs ?? 0 },
    { key: "profile", header: "Device profile", emphasis: "muted" },
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
  /** The Codes page's Markets filter: the markets shown (none checked = all). */
  codeMarkets: string[] = [];
  /** The Markets filter's options (count = codes on Codes, changes on Activity, per the Type filter). */
  marketOptions: FilterListOption[] = [];
  codeRows: AccessCodeRow[] = [];
  codeColumns: DataTableColumn[] = [];
  /** Every column of the Codes tables (each sorts; a row opens its code's panel). */
  readonly codeSortColumns: DataTableColumn[] = [
    // Hidden but its last two digits; the copy button copies it.
    { key: "code", header: "Code", copyable: true },
    // A code with no holder sinks to the bottom (its cell shows "—").
    { key: "name", header: "Holder", emphasis: "strong", sortValue: (row) => (row as AccessCodeRow).source.name },
    // Active, then suspended, then expired (ascending).
    { key: "status", header: "Status", sortValue: (row) => CODE_STATUSES.indexOf((row as AccessCodeRow).status) },
    { key: "market", header: "Market", sortKey: "marketCode", tooltipKey: "marketLabel", emphasis: "muted" },
    // Its scope: a site by its name (its code), its label in the bubble — "All sites" for a market code.
    { key: "site", header: "Site", sortKey: "siteCode", tooltipKey: "siteLabel", emphasis: "muted" },
    // The soonest first (ascending); one that never expires last.
    { key: "expires", header: "Expires", emphasis: "muted", nowrap: true, sortValue: (row) => (row as AccessCodeRow).source.expiresAt ?? Number.MAX_SAFE_INTEGER },
    { key: "added", header: "Added", emphasis: "muted", nowrap: true, sortValue: (row) => (row as AccessCodeRow).source.createdAt || 0 },
  ];
  /** The Codes tables' columns shown (Users and Vehicles alike; "Customize columns", kept in the user's settings) — a column added since shown once to a pick saved before it. */
  readonly codeColumnChoice = new TableColumnChoice(this.codeSortColumns, this.codeSortColumns.map((c) => c.key), "fuelCodeColumns", [
    "site",
    "status",
    "expires",
  ]);
  /** The Codes tables' Status filter (none checked = all), counted under the Market filter. */
  codeStatuses: CodeStatus[] = [];
  codeStatusOptions: FilterListOption[] = [];
  /** The Codes page's Activity: the code changes of the markets in the filter (per the Type filter), newest first. */
  codeActivityRows: ActivityRow[] = [];
  readonly codeActivityColumns: DataTableColumn[] = [
    { key: "time", header: "Time", emphasis: "muted", nowrap: true },
    { key: "event", header: "Event" },
    { key: "pump", header: "Market", emphasis: "strong" },
    { key: "description", header: "Description", truncate: true },
  ];
  /** The assign form's market dropdown (every fuel-management market, by name). */
  assignMarketOptions: TbSelectOption[] = [];
  /** The markets (and their code lists) are still loading. */
  marketsLoading = true;
  /** Codes already in the assign panel's market — generated codes never collide with these. */
  takenCodes: string[] = [];
  /** The code panel (a Codes row opens it): its code, and its tabs. */
  selectedCode: AccessCodeRow | null = null;
  codeOpen = false;
  /** The tab the code panel opens on (back along the panels' trail: the one it was left on). */
  codeOpenTab = "insights";
  readonly codeTabs: SegmentOption[] = [
    { id: "insights", label: "Insights", icon: "bar_chart", tooltip: "Insights" },
    { id: "settings", label: "Settings", icon: "settings", tooltip: "Settings" },
  ];
  /** Its events — its use in {@link codeTimeframe} at its scope's pumps, its changes on its market — and their read. */
  codeEvents: CodeActivityRow[] = [];
  codeEventsLoading = false;
  codeEventsCapped = false;
  codeTimeframe = "1M";
  /** Who assigned it (its "Code assigned" event's), "" unknown. */
  codeAddedBy = "";
  /** Resets the panel's Settings form (each code opened, each save). */
  codeResetKey = 0;
  /** A suspend awaiting confirmation. */
  suspendConfirm: { heading: string; message: string } | null = null;
  private codeEventsSub?: Subscription;

  // -- activity ---------------------------------------------------------------

  /** The sidebar picker's window ("1D" … "1M"), or TB_CUSTOM_TIMEFRAME for {@link activityRange}. */
  activityTimeframe = "1W";
  readonly activityTimeframeOptions = ACTIVITY_TIMEFRAMES.map((t) => ({ id: t.id, label: t.id }));
  /** The custom range applied from the calendar (used while activityTimeframe is custom). */
  activityRange: TbDateRange | null = null;
  rangePickerOpen = false;
  /** Whose window the date-range panel sets: an Activity tab's or the Reports page's. */
  private rangeTarget: "activity" | "reports" = "activity";
  /** The picker the date-range panel opens under. */
  rangeAnchor: HTMLElement | null = null;
  /** Event groups the Activity view shows (none checked = all). */
  activityGroups: ActivityGroup[] = [];
  /** The sidebar's Events filter: each group with its count (location-scoped). */
  activityGroupOptions: FilterListOption[] = [];
  /** Events in view (location filter + chip filter), with where and who. */
  activityRows: StationActivityRow[] = [];
  activityLoading = false;
  /** A pump or market had more events in the window than are read ({@link EVENTS_PER_SOURCE}): its oldest are left out. */
  activityCapped = false;
  /** The Activity table: every column there is — the dispense's detail as columns of its own, sorted by them. */
  readonly activityColumns: DataTableColumn[] = [
    { key: "time", header: "Time", emphasis: "muted", nowrap: true, sortValue: (row) => (row as StationActivityRow).ts },
    { key: "event", header: "Event", sortKey: "label" },
    { key: "station", header: "Station", nowrap: true },
    { key: "pump", header: "Pump", emphasis: "strong" },
    // A holder by name, else the code ("—" none).
    { key: "user", header: "User", nowrap: true, sortValue: (row) => (row as StationActivityRow).userName || (row as StationActivityRow).userCode },
    { key: "vehicle", header: "Vehicle", nowrap: true, sortValue: (row) => (row as StationActivityRow).vehicleName || (row as StationActivityRow).vehicleCode },
    { key: "litres", header: "Litres", align: "right", emphasis: "strong", nowrap: true, sortValue: (row) => (row as StationActivityRow).volume ?? NaN },
    { key: "odometer", header: "Odometer", align: "right", nowrap: true, sortValue: (row) => (row as StationActivityRow).odometer ?? NaN },
    { key: "hours", header: "Hours", align: "right", nowrap: true, sortValue: (row) => (row as StationActivityRow).hours ?? NaN },
    { key: "description", header: "Description", truncate: true },
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

  // -- pump detail panel ------------------------------------------------------

  selectedPump: PumpRow | null = null;
  detailOpen = false;
  /** Tab the pump panel opens on — Insights, or Access codes from the Codes cell. */
  detailOpenTab = "insights";
  detailTab = "insights";
  /** A code write (revoke / assign) is in flight. */
  saving = false;
  /** Revoke awaiting confirmation in the themed confirm dialog (null = closed). */
  revokeConfirm: { market: MarketNode; code: AccessCode; kind: CodeKind; message: string } | null = null;
  insightsTimeframe = "1D";
  metricsCharts: MetricChartSection[] = [];
  fuelTypeSelects: AttributeSelect[] = [];
  lockControls: DeviceSettingControl[] = [];
  /** Stable value maps for the Settings tab (rebuilt only when the pump refreshes). */
  fuelTypeValues: Record<string, string> = {};
  lockValues: Record<string, string | number | boolean> = {};
  /** The pump's Settings tab: its station and pump label as edited (saved with the card's Apply), and the stations to pick from. */
  pumpStation = "";
  pumpLabelEdit = "";
  pumpStationOptions: TbSelectOption[] = [];

  // -- assign-code panel ------------------------------------------------------

  assignOpen = false;
  /** Market the assign panel adds to, and the list it starts on. */
  assignMarketId: string | null = null;
  assignKind: CodeKind = "users";
  /** Bumped on every open so the form resets. */
  assignResetKey = 0;
  readonly assignTabs: SegmentOption[] = [{ id: "assign", label: "Assign code", icon: "key" }];
  /** The assign panel's scope's PLCs (their readiness pills): its market's, or its one site's. */
  assignPlcs: PlcRow[] = [];
  /** The assign panel's scope: one site ("" = every site of its market), the market's sites to pick from, and the room the scope has left. */
  assignSiteId = "";
  assignSiteOptions: TbSelectOption[] = [];
  assignRoom: CodeRoom | null = null;
  plcsLoading = true;
  /** An assign awaiting confirmation because a station isn't ready for it (null = no dialog). */
  assignConfirm: { req: AssignCodeRequest; heading: string; message: string } | null = null;

  // -- import-codes panel -----------------------------------------------------

  importOpen = false;
  /** Market the import panel adds to. */
  importMarketId: string | null = null;
  /** Bumped on every open so the form resets. */
  importResetKey = 0;
  readonly importTabs: SegmentOption[] = [{ id: "import", label: "Import codes", icon: "upload_file" }];
  /** The import panel's scope's PLCs (their readiness pills): its market's, or its one site's. */
  importPlcs: PlcRow[] = [];
  /** The import panel's scope (as the assign panel's). */
  importSiteId = "";
  importSiteOptions: TbSelectOption[] = [];
  importRoom: CodeRoom | null = null;
  /** How far a running import has got (null when none is). */
  importProgress: { done: number; total: number } | null = null;
  /** An import awaiting confirmation because a station isn't ready for it (null = no dialog). */
  importConfirm: { req: ImportCodesRequest; heading: string; message: string } | null = null;

  /** Fuel-management markets with their fuel-management sites and code lists. */
  private markets: MarketNode[] = [];
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
  private alarmService: AlarmService;
  /** All active alarms of every pump, unscoped. */
  private allAlarms: AlarmListItem[] = [];
  /** All loaded events of every pump, unfiltered. */
  private allEvents: ActivityRow[] = [];
  private activityLoaded = false;
  /** Today's pump events (the Stations cards'): the Activity window's, or read on their own when it doesn't reach today. */
  private todayEvents: ActivityRow[] = [];
  private todayLoading = true;
  /** The pumps have loaded once (their day totals are the Stations cards' "today"). */
  private pumpsLoaded = false;
  private alarmsSubscription: any;
  private pumpsSubscription: any;
  private plcsSubscription: any;
  private pumpsRefreshTimer?: any;
  /** Every minute, while a pump has an event frame waiting: its stations' Attention again (a stall is time passing). */
  private attentionTimer?: any;
  private plcsRefreshTimer?: any;
  private activityRefreshTimer?: any;

  constructor(private cd: ChangeDetectorRef, private destroyRef: DestroyRef) {}

  // -- view getters -------------------------------------------------------------

  /** Either page's Activity view (the sidebar's time window shows on both). */
  get isActivityView(): boolean {
    return this.view === "activity" || this.view === "codeActivity";
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
      this.alarmPanelOpen = true;
    } else if (id === "settings") {
      this.selectPage("settings");
    } else if (id === "theme") {
      this.theme.toggle(); // a tenant administrator's, under Settings
    }
  }


  get detailTabs(): SegmentOption[] {
    return [
      { id: "insights", label: "Insights", icon: "bar_chart", tooltip: "Insights" },
      { id: "codes", label: "Access codes", icon: "key", tooltip: "Access codes" },
      { id: "alarms", label: "Alarms", icon: "notifications", tooltip: "Alarms", badge: this.detailAlarms.length },
      { id: "settings", label: "Settings", icon: "settings", tooltip: "Settings" },
    ];
  }

  get stationTabs(): SegmentOption[] {
    return [
      { id: "insights", label: "Insights", icon: "bar_chart", tooltip: "Insights" },
      { id: "alarms", label: "Alarms", icon: "notifications", tooltip: "Alarms", badge: this.stationAlarms.length },
      { id: "settings", label: "Settings", icon: "settings", tooltip: "Settings" },
    ];
  }

  /** The Stations row to highlight: the selected station while its panel is showing. */
  get highlightedStationId(): string | null {
    return this.selectedStation && this.stationOpen ? this.selectedStation.rowKey : null;
  }

  /** The station panel's subtitle: its site. */
  get stationSubtitle(): string {
    return this.selectedStation?.site ?? "";
  }

  /** The station panel's figures (the shared stat grid): pumps, last dispense, codes against capacity, the transfer pills. */
  get stationStats(): StatItem[] {
    const st = this.selectedStation;
    if (!st) {
      return [];
    }
    const transfer = (kind: CodeKind) => {
      const m = PLC_READINESS_META[plcReadiness(st.plc, kind)];
      return { label: m.label, icon: m.icon, tone: m.tone };
    };
    return [
      { label: "Pumps", value: String(st.pumps.length) },
      { label: "Last dispense", value: st.lastDispense },
      // ⟲ beside each list: send it to this station again (the Settings page's repush, for one station).
      { label: "User codes", value: String(st.userCodes), unit: `/ ${st.userCodeLimit}`, action: this.repushAction("users") },
      { label: "Vehicle codes", value: String(st.vehicleCodes), unit: `/ ${st.vehicleCodeLimit}`, action: this.repushAction("vehicles") },
      { label: "User code transfer", pill: transfer("users") },
      { label: "Vehicle code transfer", pill: transfer("vehicles") },
    ];
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

  /** The market the assign panel adds to (its codes + limits feed the form's cap check). */
  get assignMarket(): MarketNode | null {
    return this.markets.find((m) => m.id === this.assignMarketId) ?? null;
  }

  get assignSubtitle(): string {
    return this.assignMarket?.name ?? "";
  }

  /** The market the import panel adds to (its codes + limits feed the form's room check). */
  get importMarket(): MarketNode | null {
    return this.markets.find((m) => m.id === this.importMarketId) ?? null;
  }

  get importSubtitle(): string {
    return this.importMarket?.name ?? "";
  }

  /** The assign / import panel's scope by name — its site's, else its market's (the room's reason). */
  get assignScopeName(): string {
    return this.scopeName(this.assignMarket, this.assignSiteId);
  }

  get importScopeName(): string {
    return this.scopeName(this.importMarket, this.importSiteId);
  }

  /** A code's scope by name: its site's (the label with its code: "Dev Site (C032)"), else its market's. */
  private scopeName(market: MarketNode | null, siteId: string): string {
    const site = siteId ? market?.sites.find((x) => x.id === siteId) : null;
    return site ? siteOptionLabel({ name: site.code, label: site.name }) : (market?.name ?? "");
  }

  /** The Sites picker of the assign / import panel: every site of the market first, then each site. */
  private siteOptionsOf(market: MarketNode): TbSelectOption[] {
    return [
      { value: "", label: `All sites in ${market.code || market.name}` },
      ...market.sites.map((x) => ({ value: x.id, label: siteOptionLabel({ name: x.code, label: x.name }) })),
    ];
  }

  /** A scope's code-list length (its slots): its site's stations' limit (the market's when the site has none), else the market's. */
  private scopeLength(market: MarketNode, siteId: string, kind: CodeKind): number {
    const site = siteId ? market.sites.find((x) => x.id === siteId) : null;
    return (site?.limits ?? market.limits)[kind];
  }

  /** Who's making a change (a code assigned or revoked), for its event: their name, else their email. */
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

  statusMeta(status: PumpStatus): { label: string; icon: string; tone: any } {
    return PUMP_STATUS_META[status];
  }

  // -- lifecycle ----------------------------------------------------------------

  /** The loading page while the dashboard first loads (tb-dashboard-loading) — a later reload never brings it back. */
  private readonly firstLoad = new FirstLoad();
  get pageLoading(): boolean {
    return this.firstLoad.pending(this.marketsLoading, this.plcsLoading);
  }

  ngOnInit(): void {
    if (!this.host) {
      this.ctx.$scope.fuelManagementDashboardComponent = this;
    }
    this.theme = this.host?.theme ?? new DashboardTheme(this.ctx, this.destroyRef, () => this.cd.detectChanges());
    this.settings = { ...fuelDashboardDefaultSettings, ...dashboardWidgetSettings<FuelDashboardSettings>(this.ctx, this.host) };
    this.settingsSections = nestedSettingsSections(this.host, this.settingsSections);
    this.settingsSectionIds = this.settingsSections.flatMap((s) => (s.children?.length ? s.children.map((c) => c.id) : [s.id]));
    this.settingsSection = this.settingsSectionIds[0] ?? this.settingsSection;
    injectCss("tb-ext-material-symbols-rounded", "https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200");
    this.alarmService = this.ctx.$injector.get(this.ctx.servicesMap.get("alarmService")) as AlarmService;
    this.buildPanelConfig();
    this.applyCodes(); // table columns before the markets arrive
    this.buildStationSummary(); // the Stations cards, "…" until their data is in
    this.loadUserPreferences();

    this.loadHierarchy();
    this.loadPumps(); // initial render (also triggers the first activity load)
    this.subscribePumps(); // live refresh on attribute / telemetry changes
    this.attentionTimer = setInterval(() => this.onAttentionTick(), 60_000); // a waiting event frame turns stalled with time
    this.loadPlcs();
    this.subscribePlcs(); // the readiness pills follow the PLCs' transfer flags
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
    // The Settings page's Applications: where each runs (its Sites tab) — the Fuel application's sites are this dashboard's.
    this.apps = new ApplicationStore(
      this.ctx,
      this.destroyRef,
      { assetType: s.applicationAssetType, siteRelation: s.applicationSiteRelation },
      this.toasts,
      () => this.cd.detectChanges(),
      {
        sitesAssigned: (app) => {
          if (app.name === s.fuelApplicationName) {
            this.loadHierarchy(); // the stations, the filters and the codes follow its sites
          }
        },
      }
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
          this.applyFilters(); // the stations' product lines, and the filters' counts
          this.cd.detectChanges();
        },
      });
  }

  ngOnDestroy(): void {
    this.host?.attach(null);
    removeSubscriptions(this.ctx, this.alarmsSubscription, this.pumpsSubscription, this.plcsSubscription);
    clearTimeout(this.pumpsRefreshTimer);
    clearTimeout(this.plcsRefreshTimer);
    clearTimeout(this.activityRefreshTimer);
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
    return this.page;
  }

  selectRailPage(id: string): void {
    this.selectPage(id);
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

  /** Show a Settings section; an Organization page reloads its list. */
  private showSettingsSection(id: string): void {
    this.settingsSection = id;
    const kind = organizationKindOf(id);
    if (kind) {
      this.org.load(kind);
    } else if (id === "applications") {
      this.apps.load();
    } else if (accessPageOf(id)) {
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
    if (this.codesManaging && view !== this.view) {
      this.codesManaging = false;
      this.selectedCodeRows = [];
    }
    this.view = view;
    this.pageView[this.page] = view;
    if (this.isActivityView) {
      this.ensureActivityLoaded(); // (at start it loads once the pumps and the markets are in)
    }
    this.applyFilters(); // Sites count pumps on Pumps, events on Activity
    this.applyCodes(); // Type / Markets count codes on Codes, changes on Activity
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
    const page = (Object.keys(PAGE_VIEWS) as DashboardPage[]).find((p) => p === params["page"] && (p !== "settings" || this.settingsSectionIds.length)) ?? "stations";
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

  onMarketsChange(ids: string[]): void {
    this.selectedMarkets = ids;
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

  /** Any of the Product line / Market / Site filters in use (the Stations page's two tabs share them). */
  private get hasLocationFilters(): boolean {
    return !!(this.selectedProductLines.length || this.selectedMarkets.length || this.selectedSites.length);
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
        return !!(this.activitySearchTerms.length || this.activitySearchText || this.activityGroups.length || this.hasLocationFilters);
      case "codeActivity":
        return !!(this.codeActivitySearchTerms.length || this.codeActivitySearchText || this.codeTypes.length || this.codeMarkets.length);
      default:
        return !!(this.codesView && (this.codeSearchTerms.length || this.codeSearchText || this.codeStatuses.length || this.codeMarkets.length));
    }
  }

  clearTableFilters(): void {
    if (this.page === "stations") {
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
      }
      this.selectedProductLines = [];
      this.selectedMarkets = [];
      this.selectedSites = [];
      this.applyFilters();
    } else if (this.page === "codes") {
      if (this.view === "codeActivity") {
        this.codeActivitySearchTerms = [];
        this.codeActivitySearchText = "";
        this.codeActivitySearch = [];
        this.codeTypes = [];
      } else {
        this.codeSearchTerms = [];
        this.codeSearchText = "";
        this.codeSearch = [];
        this.codeStatuses = [];
      }
      this.codeMarkets = [];
      this.applyCodes();
    }
  }

  /** The table "Customize columns" picks for: the Stations table, or the open Codes tab's (null elsewhere). */
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

  /** The Codes tables' columns: the user's pick (a code is revoked from its panel, or several with Manage). */
  private buildCodeColumns(): void {
    this.codeColumns = [...this.codeColumnChoice.visible];
  }

  /** A Stations header click: the sort shown at once and kept in the user's settings. */
  onStationSortChange(sort: DataTableSort | null): void {
    this.stationSort = sort;
    saveUserSettings(this.ctx, this.destroyRef, { [STATION_SORT_SETTING]: sort });
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

  /** The Codes page's Activity: its Type filter (Users / Vehicles). */
  onCodeTypesChange(ids: string[]): void {
    this.codeTypes = ids as CodeKind[];
    this.applyCodes();
  }

  /** The Users / Vehicles tables' Status filter. */
  onCodeStatusesChange(ids: string[]): void {
    this.codeStatuses = ids as CodeStatus[];
    this.applyCodes();
  }

  /** The Codes page's Markets filter. */
  onCodeMarketsChange(ids: string[]): void {
    this.codeMarkets = ids;
    this.applyCodes();
  }

  // -- pumps table + detail panel -----------------------------------------------

  /** A Pumps row: open that pump's panel on Insights (an open panel keeps its tab). */
  /** A summary card's "See more" (the top stations / vehicles): the dispenses behind it, in the Activity tab. */
  onSummaryLink(): void {
    this.selectView("activity");
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
    this.selectedStation = station;
    this.stationOpenTab = tab;
    this.stationOpen = true;
    this.resetStationSettings();
    this.applyAlarmScope();
  }

  closeStation(): void {
    this.closeAddPump();
    this.stationOpen = false;
    this.selectedStation = null;
    this.stationAlarms = [];
  }

  /** A pump in the station panel: the pump's own panel takes its place (the station a tab away on the panels' trail). */
  onStationPumpClick(row: Record<string, any>): void {
    this.openPump(row as PumpRow, "insights");
  }

  // -- the panels' trail (the dashboard's: the Access store's, shared with the Settings panels) ------

  /** The station, pump and code panels closed (a panel of another store opens). */
  private closeOwnPanels(): void {
    this.closeDetail();
    this.closeStation();
    this.closeCode();
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
    return {
      key: `station:${rowKey}`,
      icon: "local_gas_station",
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
    return {
      key: `pump:${pumpId}`,
      icon: "local_gas_station",
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
    return {
      key: `code:${code}`,
      icon: "key",
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
          this.toasts.success(`${st.name}'s settings saved`);
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
          this.toasts.error(`Couldn't save ${st.name}'s settings${apiMessage(err)}`);
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
      this.toasts.success(`${st.name} saved`);
    }
    this.loadPlcs();
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
   * (its location). A failure after the device exists deletes it again.
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
                ...(st.siteId ? [relation({ entityType: EntityType.ASSET, id: st.siteId }, s.pumpRelation)] : []),
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
          this.toasts.success(`${req.label || req.name} added to ${st.name}`);
          this.loadHierarchy(); // the new pump's site
          this.loadPumps();
          this.loadStationPumps();
          this.closeAddPump();
          this.cd.detectChanges();
        },
        error: (err) => {
          this.saving = false;
          this.toasts.error(`Couldn't add ${req.name}${apiMessage(err)}`);
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
            stationId !== p.stationId ? (station ? `${p.name} moved to ${station.name}` : `${p.name} removed from its station`) : `${p.name} saved`
          );
          this.loadPumps();
          this.loadStationPumps();
          this.cd.detectChanges();
        },
        error: (err) => {
          this.settingsSaving = false;
          this.toasts.error(`Couldn't save ${p.name}${apiMessage(err)}`);
          this.cd.detectChanges();
        },
      });
  }

  onPumpSettingsCancel(): void {
    this.resetPumpSettings();
  }

  /** The card saved the pump's own fields (name, label, note, fuel type, lock): reload the pumps. */
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
   * {@link keepsSidePanelOpen}. Ignored while the assign or import panel is open.
   */
  @HostListener("document:pointerdown", ["$event"])
  onDocumentPointerDown(event: Event): void {
    if ((!this.detailOpen && !this.stationOpen && !this.codeOpen) || this.assignOpen || this.importOpen || keepsSidePanelOpen(event.target)) {
      return;
    }
    this.closeDetail();
    this.closeStation();
    this.closeCode();
    this.cd.detectChanges();
  }

  /** Ask to revoke one of a market's codes (the themed confirm dialog). */
  onRevoke(market: MarketNode | null, code: AccessCode, kind: CodeKind): void {
    if (!market) {
      return;
    }
    const where = code.siteId ? `at ${this.scopeName(market, code.siteId)}` : `in ${market.name}`;
    this.revokeConfirm = {
      market,
      code,
      kind,
      message: `Code ${code.code} (${code.name || "no name"}) will stop working at every pump ${where}.`,
    };
  }

  cancelRevoke(): void {
    this.revokeConfirm = null;
    this.cd.detectChanges();
  }

  /**
   * Confirmed: delete the code asset, then clear the code's slot (in place) in
   * the market's fixed-length allowed-codes list and log the change. A failed list update still counts as revoked — the asset (the
   * source of truth) is gone — but says so.
   */
  confirmRevoke(): void {
    if (!this.revokeConfirm) {
      return;
    }
    const { market, code, kind } = this.revokeConfirm;
    this.revokeConfirm = null;
    if (!this.plcsLoaded) {
      this.toasts.warn("Still loading the stations — try again in a moment.");
      return;
    }
    this.saving = true;
    this.revokeCode(market, code, kind)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (listUpdated) => {
          this.saving = false;
          if (listUpdated) {
            this.toasts.success(`Code ${code.code} revoked`);
          } else {
            this.toasts.warn(`Code ${code.code} revoked, but ${this.scopeName(market, code.siteId)}'s code list couldn't be updated.`);
          }
          this.scheduleActivityRefresh();
          this.cd.detectChanges();
        },
        error: (err) => {
          this.saving = false;
          this.toasts.error(`Couldn't delete the code asset${apiMessage(err)}`);
          this.cd.detectChanges();
        },
      });
    this.cd.detectChanges();
  }

  /**
   * Revoke one code: delete its asset, then — side by side — clear its slot
   * (in place) in its scope's fixed-length list (its site's, else its
   * market's) and log the change, and drop it from the market's codes. Emits whether the list was updated; errors
   * when the asset couldn't be deleted. (A bulk revoke doesn't run these one
   * by one — see {@link confirmBulkRevoke}.)
   */
  private revokeCode(market: MarketNode, code: AccessCode, kind: CodeKind): Observable<boolean> {
    const cfg = QUIET_REQUEST;
    return this.ctx.assetService.deleteAsset(code.assetId, cfg).pipe(
      switchMap(() =>
        forkJoin({
          listUpdated: this.updateScopeList(code.siteId || market.id, kind, (raw) =>
            withoutCode(raw, code.code, this.scopeLength(market, code.siteId, kind))
          ).pipe(
            map(() => true),
            catchError(() => of(false))
          ),
          logged: this.logEvent(
            market.id,
            codeChangeEvent("code_revoked", kind, code.code, code.name, market.name, code.siteId ? this.scopeName(market, code.siteId) : "", this.actor)
          ),
        })
      ),
      map(({ listUpdated }) => listUpdated),
      tap(() => {
        const current = this.marketById(market.id);
        if (current) {
          this.patchMarketCodes(market.id, kind, current.codes[kind].filter((c) => c.assetId !== code.assetId));
        }
      })
    );
  }

  // -- code panel --------------------------------------------------------------------

  /** A Codes row: its panel (not while managing — a click checks the row then). */
  onCodeRowClick(row: Record<string, any>): void {
    if (this.codesManaging) {
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
    this.codeOpenTab = tab;
    this.codeOpen = true;
    this.codeResetKey++;
    this.loadCodeEvents();
  }

  closeCode(): void {
    this.codeOpen = false;
    this.codeEventsSub?.unsubscribe();
  }

  /** The panel has slid out: its code let go. */
  onCodePanelClosed(): void {
    if (!this.codeOpen) {
      this.selectedCode = null;
      this.codeEvents = [];
    }
  }

  /** The open code's list and where it works ("User code · All sites in GEA"). */
  get codeSubtitle(): string {
    return this.selectedCode ? `${this.selectedCode.type} code · ${this.codeScope}` : "";
  }

  /** Where the open code works: every site of its market ("All sites in GEA"), or its site ("Richmond Lab (4R20)"). */
  get codeScope(): string {
    const r = this.selectedCode;
    if (!r) {
      return "";
    }
    return r.siteId ? this.scopeName(this.marketById(r.marketId), r.siteId) : `All sites in ${r.marketCode}`;
  }

  onCodeTimeframe(id: string): void {
    this.codeTimeframe = id;
    this.loadCodeEvents();
  }

  /**
   * The open code's events: its dispenses and denials in the window at the
   * pumps where it works (its market's, or its site's), and every change of
   * it logged on its market — since it was created (a revoked code's number
   * given out again is another code); who assigned it, from its "Code
   * assigned" event.
   */
  private loadCodeEvents(): void {
    const r = this.selectedCode;
    this.codeEventsSub?.unsubscribe();
    if (!r) {
      return;
    }
    const end = Date.now();
    const start = end - (CODE_USAGE_TIMEFRAMES.find((t) => t.id === this.codeTimeframe) ?? CODE_USAGE_TIMEFRAMES[1]).ms;
    const pumps = this.pumps.filter((p) => p.marketId === r.marketId && (!r.siteId || p.siteId === r.siteId));
    const market = this.marketById(r.marketId);
    const mine = (e: ActivityRow) => (r.kind === "users" ? e.userCode : e.vehicleCode) === r.code;
    // Its change events are stamped by the browser that made them: a few minutes' leeway for its clock.
    const since = (r.source.createdAt || 0) - 10 * 60_000;
    this.codeEventsLoading = true;
    this.codeEventsCapped = false;
    this.codeEventsSub = forkJoin({
      usage: this.readEventSources(
        pumps.map((p) => ({ entityType: EntityType.DEVICE, id: p.pumpId, label: p.shortName })),
        start,
        end
      ),
      changes: market
        ? this.readEventSources([{ entityType: EntityType.ASSET, id: market.id, label: market.name }], 0, end)
        : of({ events: [] as ActivityRow[], capped: false }),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ usage, changes }) => {
        const plcNames = new Map(this.plcs.map((x) => [x.plcId, x.name]));
        const pumpById = new Map(this.pumps.map((x) => [x.pumpId, x]));
        const rows = [...usage.events.filter(mine), ...changes.events.filter((e) => e.group === "codes" && mine(e))]
          .filter((e) => e.ts >= since)
          .sort((a, b) => b.ts - a.ts);
        this.codeAddedBy = [...rows].reverse().find((e) => e.type === "code_assigned")?.by ?? "";
        this.codeEvents = rows.map((e): CodeActivityRow => {
          const pump = pumpById.get(e.pumpId);
          const station = pump ? (plcNames.get(this.pumpStations.get(pump.pumpId) ?? "") ?? "") : "";
          return {
            ...e,
            where: pump ? [station, pump.shortName].filter(Boolean).join(" · ") : e.pump,
            litres: e.volume === null ? "" : fmtNumber(e.volume, 1),
          };
        });
        this.codeEventsCapped = usage.capped;
        this.codeEventsLoading = false;
        this.cd.detectChanges();
      });
  }

  /** A change of the open code as its market logs it (its scope named as the other code events name it). */
  private openCodeEvent(type: CodeChangeType, r: AccessCodeRow, market: MarketNode, change = ""): PumpEvent {
    return codeChangeEvent(type, r.kind, r.code, r.source.name, market.name, r.siteId ? this.scopeName(market, r.siteId) : "", this.actor, change);
  }

  /** One of a market's codes changed (after a save): its list refreshed, the open panel with it. */
  private patchCode(r: AccessCodeRow, changes: Partial<AccessCode>): void {
    const market = this.marketById(r.marketId);
    if (market) {
      this.patchMarketCodes(
        market.id,
        r.kind,
        market.codes[r.kind].map((c) => (c.assetId === r.source.assetId ? { ...c, ...changes } : c))
      );
    }
  }

  /**
   * The panel's Settings saved: the holder's name (the asset's label) and the
   * expiry (the server attribute the "Fuel Code Expiry" chain reads; removed
   * for never), then the edit logged on its market.
   */
  onCodeSaved(change: CodeSettingsChange): void {
    const r = this.selectedCode;
    const market = r ? this.marketById(r.marketId) : null;
    if (!r || !market) {
      return;
    }
    const c = r.source;
    const renamed = change.name !== c.name;
    const expiryChanged = change.expiresAt !== c.expiresAt;
    if (!renamed && !expiryChanged) {
      return;
    }
    const entityId = { entityType: EntityType.ASSET, id: c.assetId };
    const key = this.settings.codeExpiresKey;
    const steps: Observable<unknown>[] = [];
    if (renamed) {
      steps.push(
        this.ctx.assetService
          .getAsset(c.assetId, QUIET_REQUEST)
          .pipe(switchMap((asset) => this.ctx.assetService.saveAsset({ ...asset, label: change.name }, QUIET_REQUEST)))
      );
    }
    if (expiryChanged) {
      steps.push(
        change.expiresAt === null
          ? this.ctx.attributeService.deleteEntityAttributes(entityId, AttributeScope.SERVER_SCOPE, [{ key, value: null }], QUIET_REQUEST)
          : this.ctx.attributeService.saveEntityAttributes(entityId, AttributeScope.SERVER_SCOPE, [{ key, value: change.expiresAt }], QUIET_REQUEST)
      );
    }
    const what = [
      renamed ? `holder renamed to ${change.name}` : "",
      expiryChanged ? (change.expiresAt === null ? "expiry removed" : `expiry set to ${formatExpiry(change.expiresAt)}`) : "",
    ]
      .filter(Boolean)
      .join(", ");
    this.saving = true;
    forkJoin(steps)
      .pipe(
        switchMap(() => this.logEvent(market.id, this.openCodeEvent("code_updated", r, market, what))),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: () => {
          this.saving = false;
          this.patchCode(r, { name: change.name, expiresAt: change.expiresAt });
          this.codeResetKey++;
          this.toasts.success(`Code ${c.code} saved`);
          this.loadCodeEvents();
          this.cd.detectChanges();
        },
        error: (err) => {
          this.saving = false;
          this.toasts.error(`Couldn't save the code${apiMessage(err)}`);
          this.cd.detectChanges();
        },
      });
  }

  /** The panel's Suspend: confirmed first (the themed dialog). */
  askSuspendCode(): void {
    const r = this.selectedCode;
    if (!r) {
      return;
    }
    const market = this.marketById(r.marketId);
    const where = r.siteId ? `at ${this.scopeName(market, r.siteId)}` : `in ${market?.name ?? r.market}`;
    this.suspendConfirm = {
      heading: "Suspend access code?",
      message: `Code ${r.code} (${r.source.name || "no name"}) will stop working at every pump ${where} until it's resumed.`,
    };
  }

  confirmSuspendCode(): void {
    this.suspendConfirm = null;
    this.setCodeListed(false);
  }

  /** The panel's Resume: not past its expiry, and only with room in its scope's list. */
  resumeCode(): void {
    const r = this.selectedCode;
    const market = r ? this.marketById(r.marketId) : null;
    if (!r || !market) {
      return;
    }
    if (r.source.expiresAt !== null && r.source.expiresAt <= Date.now()) {
      this.toasts.warn(`Code ${r.code}'s expiry has passed — set a later day, or Never, first.`);
      return;
    }
    const reason = codeRoomReason(codeRoom(market, r.siteId), r.kind, this.scopeName(market, r.siteId));
    if (reason) {
      this.toasts.warn(reason);
      return;
    }
    this.setCodeListed(true);
  }

  /** The panel's Revoke: the table's (confirmed, then deleted). */
  revokeOpenCode(): void {
    const r = this.selectedCode;
    if (r) {
      this.onRevoke(this.marketById(r.marketId), r.source, r.kind);
    }
  }

  /**
   * Suspend the open code — out of its scope's list (its slot freed), then
   * marked suspended — or resume it — into its list's first free slot, then
   * marked active — and log it on its market. The list first: what the
   * stations hold changes before what the dashboard shows.
   */
  private setCodeListed(listed: boolean): void {
    const r = this.selectedCode;
    const market = r ? this.marketById(r.marketId) : null;
    if (!r || !market) {
      return;
    }
    if (!this.plcsLoaded) {
      this.toasts.warn("Still loading the stations — try again in a moment.");
      return;
    }
    const length = this.scopeLength(market, r.siteId, r.kind);
    const status: CodeStatus = listed ? "active" : "suspended";
    this.saving = true;
    this.updateScopeList(r.siteId || market.id, r.kind, (raw) => (listed ? withCode(raw, r.code, length) : withoutCode(raw, r.code, length)))
      .pipe(
        switchMap(() =>
          this.ctx.attributeService.saveEntityAttributes(
            { entityType: EntityType.ASSET, id: r.source.assetId },
            AttributeScope.SERVER_SCOPE,
            [{ key: this.settings.codeStatusKey, value: status }],
            QUIET_REQUEST
          )
        ),
        switchMap(() => this.logEvent(market.id, this.openCodeEvent(listed ? "code_resumed" : "code_suspended", r, market))),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: () => {
          this.saving = false;
          this.patchCode(r, { status });
          this.toasts.success(`Code ${r.code} ${listed ? "resumed" : "suspended"}`);
          this.loadCodeEvents();
          this.cd.detectChanges();
        },
        error: (err) => {
          this.saving = false;
          this.toasts.error(`Couldn't ${listed ? "resume" : "suspend"} the code${apiMessage(err)}`);
          this.cd.detectChanges();
        },
      });
  }

  // -- codes: Manage (bulk revoke) ------------------------------------------------

  /** "Manage": checkboxes on the codes (the row Revoke buttons give way). */
  startManage(): void {
    this.codesManaging = true;
    this.selectedCodeRows = [];
    this.applyCodes();
  }

  /** "Done": back to the plain list. */
  stopManage(): void {
    this.codesManaging = false;
    this.selectedCodeRows = [];
    this.applyCodes();
  }

  onCodeSelection(rows: Record<string, any>[]): void {
    this.selectedCodeRows = rows as AccessCodeRow[];
  }

  /** Codes passing the search / filter, across the pages — what "Select all" covers. */
  get shownCodeCount(): number {
    return this.codesTable?.filteredCount ?? 0;
  }

  get allShownCodesChecked(): boolean {
    return this.codesTable?.allFilteredChecked ?? false;
  }

  /** "Select all N" / "Deselect all" in the Manage footer. */
  toggleAllCodes(): void {
    if (this.allShownCodesChecked) {
      this.codesTable?.clearChecked();
    } else {
      this.codesTable?.checkAll(true);
    }
  }

  /** The checked codes still shown (the search can hide checked rows — those are left alone). */
  private get bulkRevokeRows(): AccessCodeRow[] {
    const shown = new Set((this.codesTable?.dataSource.filteredData ?? this.codeRows).map((r) => r["code"]));
    return this.selectedCodeRows.filter((r) => shown.has(r.code));
  }

  get bulkRevokeCount(): number {
    return this.bulkRevokeRows.length;
  }

  /** "Revoke": ask first (the themed confirm dialog). */
  askBulkRevoke(): void {
    const rows = this.bulkRevokeRows;
    if (!rows.length) {
      return;
    }
    const markets = [...new Set(rows.map((r) => r.market))];
    this.bulkRevokeConfirm = {
      rows,
      heading: rows.length === 1 ? "Revoke access code?" : `Revoke ${rows.length} access codes?`,
      message:
        rows.length === 1
          ? `Code ${rows[0].code} (${rows[0].source.name || "no name"}) will stop working at every pump in ${rows[0].market}.`
          : `${rows.length} codes will stop working at every pump in ${markets.length === 1 ? markets[0] : `${markets.length} markets`}.`,
    };
  }

  /**
   * Confirmed: delete the codes' assets a few at a time, then clear every
   * deleted code from its market's list in one write per market and list,
   * log the changes in one request per market, and drop them from the
   * markets' codes — rather than the four round trips per code a one-by-one
   * revoke would cost.
   */
  confirmBulkRevoke(): void {
    const rows = this.bulkRevokeConfirm?.rows ?? [];
    this.bulkRevokeConfirm = null;
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
          // One list write per scope (a site, else the market) + list, one event batch per market.
          const groups = new Map<string, { market: MarketNode; siteId: string; kind: CodeKind; codes: AccessCodeRow[] }>();
          const events = new Map<string, AccessCodeRow[]>();
          for (const r of deleted) {
            const market = this.marketById(r.marketId);
            if (!market) {
              continue;
            }
            const siteId = r.source.siteId;
            const key = `${siteId || market.id}:${r.kind}`;
            const g = groups.get(key) ?? { market, siteId, kind: r.kind, codes: [] };
            g.codes.push(r);
            groups.set(key, g);
            events.set(market.id, [...(events.get(market.id) ?? []), r]);
          }
          const writes = [...groups.values()].map((g) =>
            this.updateScopeList(g.siteId || g.market.id, g.kind, (raw) =>
              withoutCodes(raw, g.codes.map((c) => c.code), this.scopeLength(g.market, g.siteId, g.kind))
            ).pipe(
              map(() => ({ g, ok: true })),
              catchError(() => of({ g, ok: false }))
            )
          );
          const logs = [...events.entries()].map(([marketId, codes]) =>
            this.logEvents(
              marketId,
              codes.map((c) => {
                const m = this.marketById(marketId);
                const site = c.source.siteId && m ? this.scopeName(m, c.source.siteId) : "";
                return codeChangeEvent("code_revoked", c.kind, c.code, c.source.name, c.market, site, this.actor);
              })
            )
          );
          return forkJoin({ writes: writes.length ? forkJoin(writes) : of([]), logs: logs.length ? forkJoin(logs) : of([]) }).pipe(
            map(({ writes: w }) => ({ results, deleted, listsFailed: w.filter((x) => !x.ok).reduce((n, x) => n + x.g.codes.length, 0) }))
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(({ results, deleted, listsFailed }) => {
        this.saving = false;
        const gone = new Set(deleted.map((r) => r.source.assetId));
        for (const marketId of new Set(deleted.map((r) => r.marketId))) {
          for (const kind of CODE_KINDS.map((k) => k.id)) {
            const current = this.marketById(marketId);
            if (current && current.codes[kind].some((c) => gone.has(c.assetId))) {
              this.patchMarketCodes(marketId, kind, current.codes[kind].filter((c) => !gone.has(c.assetId)));
            }
          }
        }
        const revoked = deleted.length;
        const failed = results.length - revoked;
        if (failed) {
          this.toasts.error(`Revoked ${revoked} of ${results.length} codes — ${failed} couldn't be deleted.`);
        } else if (listsFailed) {
          this.toasts.warn(`${revoked} codes revoked, but ${listsFailed} couldn't be cleared from their code lists.`);
        } else {
          this.toasts.success(revoked === 1 ? "1 code revoked" : `${revoked} codes revoked`);
        }
        this.selectedCodeRows = [];
        this.codesTable?.clearChecked();
        this.scheduleActivityRefresh();
        this.cd.detectChanges();
      });
  }

  // -- assign-code panel --------------------------------------------------------

  /**
   * The codes table's footer links: "Create New" opens the assign panel,
   * "Import" the import panel — both on the market filtered to (when exactly
   * one is), else the first by name.
   */
  onCodeAction(id: string): void {
    const only = this.codeMarkets.length === 1 ? this.marketById(this.codeMarkets[0]) : null;
    const market = only ?? this.marketById(String(this.assignMarketOptions[0]?.value ?? ""));
    if (id === "add") {
      this.openAssign(market);
    } else if (id === "import") {
      this.openImport(market);
    }
  }

  /** Open the assign panel for a market (on the list currently shown). */
  openAssign(market: MarketNode | null): void {
    if (!market) {
      this.toasts.warn("No fuel-management market to add codes to.");
      return;
    }
    this.closeCode();
    this.assignMarketId = market.id;
    this.assignSiteId = "";
    this.ensureAccessLists();
    this.assignKind = this.filteredKind;
    this.refreshTakenCodes();
    this.applyAssignPlcs();
    this.assignResetKey++;
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
    this.takenCodes = this.markets.flatMap((m) => [...m.codes.users, ...m.codes.vehicles]).map((c) => c.code);
  }

  closeAssign(): void {
    this.assignOpen = false;
  }

  /** The assign form's Market dropdown: that market — every site of it to start — its room and PLCs. */
  onAssignMarketChange(id: string): void {
    this.assignMarketId = id;
    this.assignSiteId = "";
    this.applyAssignPlcs();
  }

  /** The assign form's Sites dropdown: one site ("" = every site of the market) — its room and PLCs. */
  onAssignSiteChange(id: string): void {
    this.assignSiteId = id;
    this.applyAssignPlcs();
  }

  /**
   * The assign form's submit. When a station (PLC) of the market isn't ready
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
   * Create the code in the panel's scope — every site of the market, or one
   * site: a FuelUser / FuelVehicle asset named `<prefix><code>` with the
   * holder as its label, owned by the market's customer (the tenant when the
   * market is tenant-owned), then the scope → asset relation; put the code in
   * the first free slot of the scope's fixed-length allowed-codes list (the
   * backend sends a market's list down to each of its sites, and each site its
   * market's and its own to its stations), and log a "code assigned" event —
   * who did it with it — on the market. If the owner or relation can't be set
   * the new asset is deleted again, so no stray asset is left behind.
   */
  private assign(req: AssignCodeRequest): void {
    const market = this.markets.find((m) => m.id === this.assignMarketId);
    if (!market) {
      return;
    }
    if (!this.plcsLoaded) {
      this.toasts.warn("Still loading the stations — try again in a moment.");
      return;
    }
    const siteId = this.assignSiteId;
    const scope = this.scopeName(market, siteId);
    const reason = codeRoomReason(codeRoom(market, siteId), req.kind, scope);
    if (reason) {
      this.toasts.warn(reason);
      return;
    }
    this.saving = true;
    this.marketCustomerId(market.id)
      .pipe(
        switchMap((customerId) =>
          this.createCodeAsset(market, req, customerId, siteId).pipe(
            tap((saved) => this.joinAccess([{ assetId: saved.id.id, kind: req.kind }], market, siteId, customerId))
          )
        ),
        // Allowed codes: add the code to its scope's list — the site's, else the market's (a failure here doesn't undo the code).
        switchMap((saved) =>
          this.updateScopeList(siteId || market.id, req.kind, (raw) => withCode(raw, req.code, this.scopeLength(market, siteId, req.kind))).pipe(
            map(() => true),
            catchError(() => of(false)),
            map((listUpdated) => ({ saved, listUpdated }))
          )
        ),
        switchMap((result) =>
          this.logEvent(
            market.id,
            codeChangeEvent("code_assigned", req.kind, req.code, req.name, market.name, siteId ? scope : "", this.actor)
          ).pipe(map(() => result))
        )
      )
      .subscribe({
        next: ({ saved, listUpdated }) => {
          this.saving = false;
          const entry: AccessCode = {
            assetId: saved.id.id,
            siteId,
            code: req.code,
            name: req.name,
            createdAt: saved.createdTime || Date.now(),
            status: "active",
            expiresAt: null,
          };
          this.showCodes(req.kind); // the new code's tab
          this.patchMarketCodes(market.id, req.kind, [...market.codes[req.kind], entry]);
          if (listUpdated) {
            this.toasts.success(`${codeKindLabel(req.kind, true)} code ${req.code} added to ${scope}`);
          } else {
            this.toasts.warn(`Code ${req.code} created, but ${scope}'s code list couldn't be updated.`);
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
   * Create one code asset in a scope — a market (every site of it), or one of
   * its sites (`siteId`): a FuelUser / FuelVehicle asset named
   * `<prefix><code>` with the holder as its label, owned by `customerId` (the
   * tenant when ""), then the scope → asset relation (a code's scope is what
   * it's linked from). If the owner or relation can't be set the new asset is
   * deleted again, so no stray asset is left behind.
   */
  private createCodeAsset(market: MarketNode, req: AssignCodeRequest, customerId: string, siteId = ""): Observable<Asset> {
    const k = codeAssetConfig(this.settings, req.kind);
    const cfg = QUIET_REQUEST;
    const asset = { name: `${k.prefix}${req.code}`, type: k.type, label: req.name } as Asset;
    if (customerId) {
      asset.customerId = { entityType: EntityType.CUSTOMER, id: customerId };
    }
    return this.ctx.assetService.saveAsset(asset, cfg).pipe(
      switchMap((saved) => this.ensureCustomerOwner(saved, customerId).pipe(catchError((err) => this.deleteCreatedAsset(saved, err)))),
      switchMap((saved) =>
        this.ctx.entityRelationService
          .saveRelation(
            { from: { entityType: EntityType.ASSET, id: siteId || market.id }, to: saved.id, type: k.relation, typeGroup: RelationTypeGroup.COMMON },
            cfg
          )
          .pipe(
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

  /**
   * New codes join the access groups that cover them now, not at their next
   * sync: the groups whose scope holds a site the code works at — its site, or
   * its market's Fuel sites (the market's stations) — each with its product
   * line. Fire and forget: a failure leaves it to the next sync.
   */
  private joinAccess(codes: { assetId: string; kind: CodeKind }[], market: MarketNode, siteId: string, ownerId: string): void {
    if (!codes.length) {
      return;
    }
    const sites: AssetRow[] = market.sites
      .filter((x) => !siteId || x.id === siteId)
      .map((x) => ({
        id: x.id,
        name: x.code,
        label: x.name,
        owner: "",
        createdTime: null,
        marketId: market.id,
        productLineId: this.siteProductLines.get(x.id) ?? null,
      }));
    this.access
      .joinCoveringGroups(
        codes.map((c) => ({ id: c.assetId, entityType: EntityType.ASSET, profile: codeAssetConfig(this.settings, c.kind).type, ownerId, sites }))
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe();
  }

  // -- import-codes panel -------------------------------------------------------

  /** Open the import panel for a market. */
  openImport(market: MarketNode | null): void {
    if (!market) {
      this.toasts.warn("No fuel-management market to import codes into.");
      return;
    }
    this.closeCode();
    this.importMarketId = market.id;
    this.importSiteId = "";
    this.ensureAccessLists();
    this.refreshTakenCodes();
    this.applyImportPlcs();
    this.importResetKey++;
    this.importOpen = true;
  }

  closeImport(): void {
    this.importOpen = false;
  }

  /** The import form's Market dropdown: that market — every site of it to start — its room and PLCs. */
  onImportMarketChange(id: string): void {
    this.importMarketId = id;
    this.importSiteId = "";
    this.applyImportPlcs();
  }

  /** The import form's Sites dropdown: one site ("" = every site of the market) — its room and PLCs. */
  onImportSiteChange(id: string): void {
    this.importSiteId = id;
    this.applyImportPlcs();
  }

  /**
   * The import form's submit. When a station (PLC) of the market isn't ready
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
   * Create the pasted codes' assets ({@link createCodeAsset} each — a few at a
   * time, since ThingsBoard has no bulk create for an asset with its relation;
   * one that fails is skipped, the rest go on), then put every code created
   * into the market's allowed-codes list in one write per list, log the "code
   * assigned" events in one request, and report how it went in a toast.
   */
  private importCodes(req: ImportCodesRequest): void {
    const market = this.importMarket;
    if (!market || !req.codes.length) {
      return;
    }
    if (!this.plcsLoaded) {
      this.toasts.warn("Still loading the stations — try again in a moment.");
      return;
    }
    const total = req.codes.length;
    const kinds = CODE_KINDS.map((k) => k.id);
    const siteId = this.importSiteId;
    const scope = this.scopeName(market, siteId);
    this.saving = true;
    this.importProgress = { done: 0, total };
    this.marketCustomerId(market.id)
      .pipe(
        switchMap((customerId) =>
          from(req.codes).pipe(
            mergeMap(
              (code, index) =>
                this.createCodeAsset(market, code, customerId, siteId).pipe(
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
                market,
                siteId,
                customerId
              )
            )
          )
        ),
        // Allowed codes: one write per list of the scope (its site's, else the market's) with every code created (a failure doesn't undo the codes).
        switchMap((results) => {
          const created = results.filter((r) => r.saved);
          const writes = kinds
            .map((kind) => ({ kind, codes: created.filter((r) => r.code.kind === kind).map((r) => r.code.code) }))
            .filter((w) => w.codes.length)
            .map((w) =>
              this.updateScopeList(siteId || market.id, w.kind, (raw) => withCodes(raw, w.codes, this.scopeLength(market, siteId, w.kind))).pipe(
                map(() => true),
                catchError(() => of(false))
              )
            );
          return (writes.length ? forkJoin(writes) : of([] as boolean[])).pipe(
            map((updated) => ({ results, listsFailed: updated.filter((ok) => !ok).length }))
          );
        }),
        switchMap((r) =>
          this.logEvents(
            market.id,
            r.results
              .filter((x) => x.saved)
              .map((x) => codeChangeEvent("code_assigned", x.code.kind, x.code.code, x.code.name, market.name, siteId ? scope : "", this.actor))
          ).pipe(map(() => r))
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: ({ results, listsFailed }) => {
          this.saving = false;
          this.importProgress = null;
          const created = results.filter((r) => r.saved);
          for (const kind of kinds) {
            const entries: AccessCode[] = created
              .filter((r) => r.code.kind === kind)
              .map(
                (r): AccessCode => ({
                  assetId: r.saved!.id.id,
                  siteId,
                  code: r.code.code,
                  name: r.code.name,
                  createdAt: r.saved!.createdTime || Date.now(),
                  status: "active",
                  expiresAt: null,
                })
              );
            if (entries.length) {
              this.patchMarketCodes(market.id, kind, [...(this.marketById(market.id)?.codes[kind] ?? []), ...entries]);
            }
          }
          const failed = results.length - created.length;
          const firstError = results.find((r) => !r.saved)?.error ?? ".";
          if (!created.length) {
            this.toasts.error(`None of the ${total} codes could be created${firstError}`);
          } else if (failed) {
            this.toasts.warn(`Imported ${created.length} of ${total} codes — ${failed} couldn't be created${firstError}`);
          } else if (listsFailed) {
            this.toasts.warn(`${created.length} codes imported, but ${scope}'s code list couldn't be updated.`);
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

  /** The import panel's scope: its PLCs (its market's, or its one site's), the market's sites to pick from and the room left. */
  private applyImportPlcs(): void {
    const market = this.importMarket;
    if (this.importSiteId && !market?.sites.some((x) => x.id === this.importSiteId)) {
      this.importSiteId = ""; // the site left the market
    }
    this.importPlcs = this.plcs.filter((p) => p.marketId === this.importMarketId && (!this.importSiteId || p.siteId === this.importSiteId));
    this.importSiteOptions = market ? this.siteOptionsOf(market) : [];
    this.importRoom = market ? codeRoom(market, this.importSiteId) : null;
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
   * {@link REPORT_HOURLY_MAX_DAYS} — and its previous window as one sum) and,
   * for who took the fuel, its dispense events; the report is built as each
   * arrives.
   */
  private loadReport(): void {
    if (!this.pumpsLoaded || this.marketsLoading) {
      return; // read once the pumps and their places are in (ensureReport)
    }
    const s = this.settings;
    const w = this.reportWindow;
    const key = `${w.start}|${w.days}|${this.reportTimeframe === TB_CUSTOM_TIMEFRAME ? w.end : "now"}`;
    this.reportKey = key;
    this.reportTotals = null;
    this.reportDispenses = null;
    this.buildReport();
    const hourly = w.days <= REPORT_HOURLY_MAX_DAYS;
    const interval = hourly ? 3600 * 1000 : 24 * 3600 * 1000;
    const span = w.end - w.start;
    const keys = [s.qtrLitresKey, s.qtrDispensesKey, s.qtrDeniedKey];
    const value = (points: { ts: number; value: unknown }[] | undefined, ts: number) => Number(points?.find((p) => p.ts === ts)?.value) || 0;
    const pumps = this.pumps.filter((p) => p.marketId);
    const reads = pumps.map((p) => {
      const id = { entityType: EntityType.DEVICE, id: p.pumpId };
      const buckets = this.ctx.attributeService
        .getEntityTimeseries(id, keys, w.start, w.end, Math.ceil(span / interval) + 2, AggregationType.SUM, interval, undefined, undefined, QUIET_REQUEST)
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
      // The previous window, as one sum (the "vs previous period").
      const previous = this.ctx.attributeService
        .getEntityTimeseries(id, [s.qtrLitresKey], w.start - span, w.start, 2, AggregationType.SUM, span, undefined, undefined, QUIET_REQUEST)
        .pipe(
          map((data: any) => (data?.[s.qtrLitresKey] ?? []).reduce((sum: number, pt: any) => sum + (Number(pt.value) || 0), 0) as number),
          catchError(() => of(0))
        );
      return forkJoin([buckets, previous]).pipe(map(([b, prev]) => ({ id: p.pumpId, buckets: b, previous: prev })));
    });
    (reads.length ? forkJoin(reads) : of([] as { id: string; buckets: ReportBucket[]; previous: number }[]))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((list) => {
        if (this.reportKey !== key) {
          return; // another window was asked for meanwhile
        }
        this.reportTotals = {
          key,
          hourly,
          buckets: new Map(list.map((r) => [r.id, r.buckets])),
          previous: new Map(list.map((r) => [r.id, r.previous])),
        };
        this.buildReport();
        this.cd.detectChanges();
      });
    this.readEvents(w.start, w.end, false)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ events }) => {
        if (this.reportKey !== key) {
          return;
        }
        this.reportDispenses = events.filter((e) => e.type === "dispense" && e.volume !== null);
        this.buildReport();
        this.cd.detectChanges();
      });
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
      fuelType: p.fuelType,
      station: plcNames.get(this.pumpStations.get(p.pumpId) ?? "") ?? "",
      site: p.site,
      buckets: totals?.buckets.get(p.pumpId) ?? [],
      previousLitres: totals?.previous.get(p.pumpId) ?? 0,
    }));
    let people: ReportPeople | null = null;
    if (this.reportDispenses) {
      const ids = new Set(inScope.map((p) => p.pumpId));
      people = { users: new Map(), vehicles: new Map() };
      for (const e of this.reportDispenses) {
        if (ids.has(e.pumpId)) {
          if (e.userCode) {
            people.users.set(e.userCode, (people.users.get(e.userCode) ?? 0) + (e.volume ?? 0));
          }
          if (e.vehicleCode) {
            people.vehicles.set(e.vehicleCode, (people.vehicles.get(e.vehicleCode) ?? 0) + (e.volume ?? 0));
          }
        }
      }
    }
    const holders = {
      users: new Map(this.markets.flatMap((m) => m.codes.users.map((c) => [c.code, c.name] as const))),
      vehicles: new Map(this.markets.flatMap((m) => m.codes.vehicles.map((c) => [c.code, c.name] as const))),
    };
    this.report = buildFuelReport({
      start: w.start,
      days: w.days,
      hourly: totals?.hourly ?? w.days <= REPORT_HOURLY_MAX_DAYS,
      pumps,
      people,
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

  /** Either Activity's export (the sidebar's download button): the rows in view — the filters and the search — every column. */
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
        // ThingsBoard's device-state `active` flag → Online / Offline.
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: "active" },
        // When it last sent anything (its frames too): a drain still moving isn't stalled (not subscribed — it changes with every report).
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: "lastActivityTime" },
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: s.siteKey },
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: s.fuelTypeKey },
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: s.pumpLabelKey },
        { type: EntityKeyType.SHARED_ATTRIBUTE, key: s.lockedKey },
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
        // An event frame waiting at the PLC, and since when (a stalled drain: the Stations table's Attention).
        { type: EntityKeyType.TIME_SERIES, key: s.eventReadyKey },
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
          this.ensureActivityLoaded();
          this.cd.detectChanges();
        },
        error: () => {
          this.pumpsLoading = false;
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
    const name = deviceLabel || deviceName || "Unknown pump";
    // `active` is absent when device-state tracking is off — treat as online.
    const offline = String(server["active"]?.value ?? "") === "false";
    const locked = parseBool(shared[s.lockedKey]?.value);
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
      status: offline ? "offline" : locked ? "locked" : "online",
      locked,
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
      // Reported on change: the point's time is when a frame came up — or, while frames keep coming (each one
      // reported), the pump's last report.
      eventsWaitingSince: parseBool(ts[s.eventReadyKey]?.value)
        ? Math.max(Number(ts[s.eventReadyKey]?.ts) || 0, Number(server["lastActivityTime"]?.value) || 0) || null
        : null,
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
    const client = d.latest?.[EntityKeyType.CLIENT_ATTRIBUTE] ?? {};
    const ts = d.latest?.[EntityKeyType.TIME_SERIES] ?? {};
    const rawVolume = ts[s.stationDispenseVolumeKey]?.value;
    const volume = rawVolume === undefined || rawVolume === null || rawVolume === "" ? null : Number(rawVolume);
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

  /** The station panel's ⟲ beside its codes: that list to this station once more. */
  onStationStatAction(e: { id: string }): void {
    const st = this.selectedStation;
    const kind: CodeKind | null = e.id === "repush:users" ? "users" : e.id === "repush:vehicles" ? "vehicles" : null;
    if (st && kind) {
      this.repushCodes(kind, [st.plc]);
    }
  }

  /** The repush action of a station figure (disabled while one is running). */
  private repushAction(kind: CodeKind): StatAction {
    return { id: `repush:${kind}`, icon: "history", label: "Repush", disabled: this.settingsSaving };
  }

  /**
   * Send stations their user / vehicle list once more (a station panel's
   * repush): each its own list as the backend last built it — its market's
   * codes and its site's — with the transfer request.
   */
  private repushCodes(kind: CodeKind, plcs: PlcRow[]): void {
    const s = this.settings;
    if (!plcs.length) {
      return;
    }
    const listKey = codeAssetConfig(s, kind).listKey;
    const requestKey = kind === "users" ? s.userCodesXferRequestKey : s.vehicleCodesXferRequestKey;
    const cfg = QUIET_REQUEST;
    const label = codeKindLabel(kind, true);
    this.settingsSaving = true;
    forkJoin(
      plcs.map((plc) => {
        const id = { entityType: EntityType.DEVICE, id: plc.plcId };
        return this.ctx.attributeService.getEntityAttributes(id, AttributeScope.SHARED_SCOPE, [listKey], cfg).pipe(
          switchMap((attrs) => {
            const list = attrs.find((a) => a.key === listKey)?.value;
            return list == null || list === ""
              ? of(false) // no list built for it yet
              : this.ctx.attributeService
                  .saveEntityAttributes(
                    id,
                    AttributeScope.SHARED_SCOPE,
                    [
                      { key: listKey, value: list },
                      { key: requestKey, value: true },
                    ],
                    cfg
                  )
                  .pipe(map(() => true));
          }),
          catchError(() => of(false))
        );
      })
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((results) => {
        this.settingsSaving = false;
        const sent = results.filter(Boolean).length;
        const names = plcs.map((p) => p.name).join(", ");
        if (sent === results.length) {
          this.toasts.success(`${label} codes sent again to ${sent === 1 ? names : `${sent} stations`}`);
        } else if (sent) {
          this.toasts.warn(`${label} codes sent again to ${sent} of ${results.length} stations.`);
        } else {
          this.toasts.error(`Couldn't send the ${label.toLowerCase()} codes again to ${names}.`);
        }
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
        this.selectedStation = updated;
        this.syncStationPumpEdits(false); // its pumps refreshed: edits kept
      } else {
        this.closeStation();
      }
    }
    this.applyAlarmScope();
    this.buildStationSummary();
  }

  /** A station's user / vehicle code count: the Codes page, filtered to its market and that list. */
  openStationCodes(row: StationTableRow, kind: CodeKind): void {
    if (row.marketId) {
      this.codeMarkets = [row.marketId];
    }
    this.showPage("codes", CODES_VIEW[kind]);
    this.writeUrlState();
  }

  /** The assign panel's scope: its PLCs (its market's, or its one site's), the market's sites to pick from and the room left. */
  private applyAssignPlcs(): void {
    const market = this.assignMarket;
    if (this.assignSiteId && !market?.sites.some((x) => x.id === this.assignSiteId)) {
      this.assignSiteId = ""; // the site left the market
    }
    this.assignPlcs = this.plcs.filter((p) => p.marketId === this.assignMarketId && (!this.assignSiteId || p.siteId === this.assignSiteId));
    this.assignSiteOptions = market ? this.siteOptionsOf(market) : [];
    this.assignRoom = market ? codeRoom(market, this.assignSiteId) : null;
  }

  private get plcFilter(): EntityFilter {
    return { type: AliasFilterType.deviceType, deviceTypes: this.settings.plcDeviceTypes, deviceNameFilter: "" };
  }

  /** Live subscription over the PLCs' online state and transfer flags; a change reloads them (debounced). */
  private subscribePlcs(): void {
    const s = this.settings;
    subscribeLatestChanges(
      this.ctx,
      this.destroyRef,
      // A new dispense on a station refreshes it too (its Last dispense).
      { entityFilter: this.plcFilter, attributes: ["active", s.userCodesXferKey, s.vehicleCodesXferKey], timeseries: [s.stationDispenseVolumeKey] },
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
      (except === "market" || !this.selectedMarkets.length || this.selectedMarkets.includes(loc.marketId)) &&
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
   * The Stations page's filters, each counted under the others (as the
   * gateways dashboard's): on Activity the station events of the Events
   * filter's types (by their pump), else the stations. (A filter greys out a
   * 0 count itself, unless it's picked.)
   */
  private buildSidebarFilters(): void {
    this.reportLocationOptions = this.buildPumpLocationOptions();
    if (this.view === "activity") {
      const groups = new Set(this.activityGroups);
      const pumpById = new Map(this.pumps.map((p) => [p.pumpId, p] as [string, PumpRow]));
      const located = this.stationEvents
        .filter((e) => !groups.size || groups.has(e.group))
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
   * The Product line, Market and Site options, each counted over `items`
   * (stations, or station events' pumps) under the other two: the product
   * lines of the dashboard's sites (one still checked stays, to be cleared),
   * every market and its sites — the lists themselves, whether or not anything
   * is at them yet. A site shows its
   * label with its code in brackets, so the filter's search finds it by either.
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
    // Markets and product lines by their names (codes: "GVA", "RMX"); a site by its label and code.
    this.marketFilterOptions = this.markets
      .map((m) => ({ id: m.id, label: m.code || m.name, count: count("market", (x) => x.marketId === m.id) }))
      .sort(byLabel);
    this.siteFilterOptions = [...sites.values()]
      .map((site) => ({
        id: site.id,
        label: site.code && site.code !== site.name ? `${site.name} (${site.code})` : site.name,
        count: count("site", (x) => x.siteId === site.id),
      }))
      .sort(byLabel);
  }

  /**
   * The Reports page's Sites tree:  /**
   * The Reports page's Sites tree: each market with its sites, counted by the
   * pumps at them (the fuel comes from the pumps). A market without sites is a
   * selectable leaf of its own.
   */
  private buildPumpLocationOptions(): FilterListOption[] {
    const perSite = new Map<string, number>();
    this.pumps.forEach((p) => p.siteId && perSite.set(p.siteId, (perSite.get(p.siteId) ?? 0) + 1));
    const byName = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label, undefined, { numeric: true });
    return this.markets
      .map((m) => {
        const children = m.sites.map((site) => ({ id: site.id, label: site.name, count: perSite.get(site.id) ?? 0 })).sort(byName);
        return { id: m.id, label: m.code || m.name, count: children.reduce((n, c) => n + c.count, 0), children };
      })
      .sort(byName);
  }

  /**
   * The Codes page: the Markets filter (none checked = all), the codes of the
   * markets in it (each naming its market), and their code changes (the page's
   * Activity). The Type / Markets counts follow the view: codes on Codes,
   * changes (in the time window) on Activity (the filters grey out a 0 count
   * themselves, unless it's picked).
   */
  private applyCodes(): void {
    const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, undefined, { numeric: true });
    const markets = [...this.markets].sort(byName);
    this.assignMarketOptions = markets.map((m) => ({ value: m.id, label: m.name }));
    // The Reports page's Type filter: every market's users / vehicles.
    this.reportTypeOptions = CODE_KINDS.map((k) => ({
      id: k.id,
      label: k.label,
      count: markets.reduce((n, m) => n + m.codes[k.id].length, 0),
    }));
    // Drop picks of markets that are gone (keeping the array when nothing changes).
    if (this.codeMarkets.some((id) => !markets.some((m) => m.id === id))) {
      this.codeMarkets = this.codeMarkets.filter((id) => markets.some((m) => m.id === id));
    }
    const picked = new Set(this.codeMarkets);
    const inScope = markets.filter((m) => !picked.size || picked.has(m.id));
    const scopeIds = new Set(inScope.map((m) => m.id));
    // The open tab's list on Users / Vehicles; the Type filter's lists on Activity (none checked = both).
    const kinds: CodeKind[] = this.codesView ? [this.codesView] : this.codeTypes.length ? this.codeTypes : CODE_KINDS.map((k) => k.id);
    // Code changes are logged on their market; a change of no known list shows only unfiltered.
    const changes = this.allEvents.filter((e) => e.group === "codes");
    const ofType = (e: ActivityRow) => !this.codeTypes.length || (!!e.codeKind && this.codeTypes.includes(e.codeKind));
    const onActivity = this.view === "codeActivity";
    const now = Date.now();
    // The Users / Vehicles tables' Status filter (none checked = all): a code as it stands now.
    const statusPasses = (c: AccessCode) => !this.codeStatuses.length || this.codeStatuses.includes(codeStatusNow(c, now));
    const countOf = (m: MarketNode) =>
      onActivity
        ? changes.filter((e) => e.pumpId === m.id && ofType(e)).length
        : kinds.reduce((n, k) => n + m.codes[k].filter(statusPasses).length, 0);
    this.marketOptions = markets.map((m) => ({ id: m.id, label: m.code || m.name, count: countOf(m) }));
    const scopedChanges = changes.filter((e) => scopeIds.has(e.pumpId));
    this.codeTypeOptions = CODE_KINDS.map((k) => ({
      id: k.id,
      label: k.label,
      count: onActivity
        ? scopedChanges.filter((e) => e.codeKind === k.id).length
        : inScope.reduce((n, m) => n + m.codes[k.id].length, 0),
    }));
    this.codeActivityRows = scopedChanges.filter(ofType);
    // Status counted under the Market filter (the open tab's list).
    this.codeStatusOptions = CODE_STATUSES.map((id) => ({
      id,
      label: CODE_STATUS_META[id].label,
      count: inScope.reduce((n, m) => n + kinds.reduce((k2, k) => k2 + m.codes[k].filter((c) => codeStatusNow(c, now) === id).length, 0), 0),
    }));
    // The open tab's list across the markets in the filter, per Status, newest first.
    this.codeRows = inScope
      .flatMap((m) => kinds.flatMap((k) => m.codes[k].filter(statusPasses).map((c) => toAccessCodeRow(c, k, m, now))))
      .sort((a, b) => (b.source.createdAt || 0) - (a.source.createdAt || 0));
    // The open code's panel on its refreshed row (closed when it's gone — revoked).
    if (this.selectedCode) {
      const id = this.selectedCode.source.assetId;
      const updated = markets.flatMap((m) =>
        CODE_KINDS.flatMap((k) => m.codes[k.id].filter((c) => c.assetId === id).map((c) => toAccessCodeRow(c, k.id, m, now)))
      )[0];
      if (updated) {
        this.selectedCode = updated;
      } else {
        this.closeCode();
      }
    }
    // Auto-sized like the Pumps table: column widths follow their content (the tab names the type).
    this.buildCodeColumns();
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
      /** A code asset's state and expiry (a site: none). */
      status: CodeStatus;
      expiresAt: number | null;
    }
    /** A site's own code asset (its scope: `siteId`). */
    type SiteCodeAsset = RelatedAsset & { siteId: string };
    /** A code asset's state and expiry (server attributes). */
    const codeStateKeys = [
      { type: EntityKeyType.SERVER_ATTRIBUTE, key: s.codeStatusKey },
      { type: EntityKeyType.SERVER_ATTRIBUTE, key: s.codeExpiresKey },
    ];
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
        expiresAt: Number(attrs[s.codeExpiresKey]?.value) || null,
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
            // Its codes: its own (every site — linked from the market) and its sites' own (linked from a site).
            const codes: MarketCodes = { users: [], vehicles: [] };
            const scoped = [...assets.map((a) => ({ ...a, siteId: "" })), ...siteCodes.filter((a) => siteIds.includes(a.siteId))];
            for (const a of scoped) {
              const kind = kindOfType(a.type);
              if (kind && !codes[kind].some((c) => c.assetId === a.id)) {
                codes[kind].push({
                  assetId: a.id,
                  siteId: a.siteId,
                  code: codeFromAssetName(a.name, codeAssetConfig(s, kind).prefix),
                  name: a.label,
                  createdAt: a.createdTime,
                  status: a.status,
                  expiresAt: a.expiresAt,
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
            this.ensureActivityLoaded();
          }
          this.cd.detectChanges();
        },
        error: () => {
          this.marketsLoading = false;
          console.warn("[fuel-management] Couldn't load the Market → Site hierarchy.");
          this.ensureActivityLoaded();
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

  /** Settings-tab value maps + the selected pump's alarms. */
  private syncDetailInputs(): void {
    const p = this.selectedPump;
    this.fuelTypeValues = p ? { [this.settings.fuelTypeKey]: p.fuelType } : {};
    this.lockValues = p ? { [this.settings.lockedKey]: p.locked } : {};
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
    this.lockControls = [
      { kind: "toggle", key: s.lockedKey, label: "Lock pump", info: "A locked pump refuses every code until it is unlocked." },
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
        // Any-scope keys: a shared or client code-list change reloads the pumps.
        attributes: ["active", s.siteKey, s.fuelTypeKey, s.lockedKey, s.userCodesKey, s.vehicleCodesKey],
        timeseries: [s.dispenseVolumeKey, s.eventKey, s.eventReadyKey, s.dayLitresKey, s.dayDispensesKey, s.dayDeniedKey],
      },
      () => {
        clearTimeout(this.pumpsRefreshTimer);
        this.pumpsRefreshTimer = setTimeout(() => this.loadPumps(), 300);
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
        // Today's, for the Stations cards: the window's when it reaches from midnight to now (every preset does), else read on their own.
        const midnight = startOfToday();
        if (start <= midnight && end >= Date.now() - 60_000) {
          this.todayEvents = events.filter((e) => e.ts >= midnight && e.group !== "codes");
          this.todayLoading = false;
        } else {
          this.loadTodayEvents();
        }
        this.applyFilters();
        this.applyCodes(); // the Codes page's Activity
        this.cd.detectChanges();
      });
  }

  /** Today's pump events on their own (the Stations cards' — the Activity window, a custom range, doesn't reach today). */
  private loadTodayEvents(): void {
    this.todayLoading = true;
    this.readEvents(startOfToday(), Date.now(), false)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ events }) => {
        this.todayEvents = events;
        this.todayLoading = false;
        this.buildStationSummary();
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
   * name) in a window, newest first — at most {@link EVENTS_PER_SOURCE} each
   * (`capped`: one had more); a source that can't be read gives none.
   */
  private readEventSources(
    sources: { entityType: EntityType; id: string; label: string }[],
    start: number,
    end: number
  ): Observable<{ events: ActivityRow[]; capped: boolean }> {
    const calls: Observable<{ rows: ActivityRow[]; capped: boolean }>[] = sources.map((src) =>
      this.ctx.attributeService
        .getEntityTimeseries(
          { entityType: src.entityType, id: src.id },
          [this.settings.eventKey],
          start,
          end,
          EVENTS_PER_SOURCE,
          undefined,
          undefined,
          undefined,
          undefined,
          QUIET_REQUEST
        )
        .pipe(
          map((data: any) => {
            const points: any[] = data?.[this.settings.eventKey] ?? [];
            return { rows: points.map((pt) => this.toActivityRow(src, pt.ts, pt.value)).filter(Boolean) as ActivityRow[], capped: points.length >= EVENTS_PER_SOURCE };
          }),
          catchError(() => of({ rows: [] as ActivityRow[], capped: false }))
        )
    );
    return (calls.length ? forkJoin(calls) : of([] as { rows: ActivityRow[]; capped: boolean }[])).pipe(
      map((lists) => ({ events: lists.flatMap((l) => l.rows).sort((a, b) => b.ts - a.ts), capped: lists.some((l) => l.capped) }))
    );
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
      volume: e.type === "dispense" ? num(e.fuelVolume) : null,
      userCode: String(e.userCode ?? "").trim(),
      vehicleCode: String(e.vehicleCode ?? "").trim(),
      odometer: e.type === "dispense" ? num(e.odometer) : null,
      hours: e.type === "dispense" ? num(e.hours) : null,
      by: String(e.by ?? "").trim(),
    };
  }

  /** The Stations cards ({@link stationSummary}) from the stations, pumps and today's events in the location filters. */
  private buildStationSummary(): void {
    const stations = this.scopedStations;
    const stationsLoading = this.plcsLoading || this.marketsLoading;
    const totalsLoading = this.pumpsLoading || !this.pumpsLoaded;
    const eventsLoading = !this.activityLoaded || this.activityLoading || this.todayLoading;
    const shown = (text: string, loading: boolean) => (loading ? "…" : text);
    const share = (part: number, whole: number) => `${fmtNumber(part)}${whole ? ` (${Math.round((part / whole) * 100)}%)` : ""}`;
    const litres = (l: number) => fmtNumber(l, l > 0 && l < 100 && !Number.isInteger(l) ? 1 : 0);
    const status = (id: PlcStatus) => stations.filter((r) => r.statusId === id).length;
    const attention = stations.filter((r) => r.attention.length);

    // Today at the pumps in the filters: their stored day totals ("Fuel Daily Totals" — whole however many events).
    const pumps = this.visiblePumps;
    const total = pumps.reduce((sum, p) => sum + p.today.litres, 0);
    const dispenses = pumps.reduce((sum, p) => sum + p.today.dispenses, 0);
    const denied = pumps.reduce((sum, p) => sum + p.today.denied, 0);
    const lastTs = Math.max(0, ...stations.map((r) => r.lastDispenseTs ?? 0)) || null;
    // …and today's dispense events, for who took the fuel (the totals don't say).
    const pumpIds = new Set(pumps.map((p) => p.pumpId));
    const midnight = startOfToday();
    const measured = this.todayEvents.filter((e) => e.ts >= midnight && pumpIds.has(e.pumpId) && e.type === "dispense" && e.volume !== null);

    /** The largest first, at most `count`. */
    const top = (sums: Map<string, number>, count: number) => [...sums].filter(([, l]) => l > 0).sort((a, b) => b[1] - a[1]).slice(0, count);
    const topRows = (list: [string, number][], loading: boolean, label: (k: string) => string): SummaryRow[] =>
      loading
        ? [{ label: "Loading…", value: "" }]
        : list.length
          ? list.map(([k, l]) => ({ label: label(k), value: litres(l), unit: "L" }))
          : [{ label: "No dispenses today", value: "" }];
    // Litres today by station (its pumps' day totals) and by vehicle (today's dispenses' vehicle codes).
    const byStation = new Map(stations.map((r) => [r.name, r.pumps.filter((p) => pumpIds.has(p.pumpId)).reduce((sum, p) => sum + p.today.litres, 0)] as const));
    const byVehicle = new Map<string, number>();
    measured.forEach((e) => e.vehicleCode && byVehicle.set(e.vehicleCode, (byVehicle.get(e.vehicleCode) ?? 0) + (e.volume ?? 0)));
    // A vehicle by its holder's name (its code's), the code after it; else the code alone.
    const holders = new Map(this.markets.flatMap((m) => m.codes.vehicles.map((c) => [c.code, c.name] as const)));

    this.stationSummary = [
      {
        id: "status",
        title: "Station summary",
        rows: [
          { label: "Stations", icon: "local_gas_station", value: shown(fmtNumber(stations.length), stationsLoading) },
          { label: "Online", mark: "success", value: shown(share(status("online"), stations.length), stationsLoading) },
          { label: "Updating", mark: "warning", value: shown(share(status("updating"), stations.length), stationsLoading) },
          { label: "Offline", mark: "neutral", value: shown(share(status("offline"), stations.length), stationsLoading) },
          // Any reason in its Attention column, toned by the worst: red (a stall, critical alarms), yellow (major / minor),
          // else plain (locked pumps, warning alarms).
          {
            label: "Needs attention",
            icon: "flag",
            value: shown(share(attention.length, stations.length), stationsLoading),
            tone: attention.some((r) => r.attention[0].tone === "error")
              ? "error"
              : attention.some((r) => ["major", "warning"].includes(r.attention[0].tone))
                ? "warning"
                : "default",
          },
        ],
      },
      {
        id: "dispensing",
        title: "Dispensing today",
        rows: [
          { label: "Fuel dispensed", icon: "water_drop", value: shown(litres(total), totalsLoading), unit: "L" },
          { label: "Dispenses", icon: "receipt_long", value: shown(fmtNumber(dispenses), totalsLoading) },
          {
            label: "Avg per dispense",
            icon: "avg_pace",
            value: shown(dispenses ? fmtNumber(total / dispenses, 1) : "—", totalsLoading),
            unit: dispenses ? "L" : "",
          },
          // Denials and timeouts, against every attempt (dispensed or not).
          { label: "Denied", icon: "block", value: shown(share(denied, denied + dispenses), totalsLoading) },
          { label: "Last dispense", icon: "schedule", value: shown(relativeTime(lastTs), stationsLoading) },
        ],
      },
      {
        id: "topStations",
        title: "Top stations",
        link: "See more",
        rows: topRows(top(byStation, 4), totalsLoading, (k) => k),
      },
      {
        id: "topVehicles",
        title: "Top vehicles",
        link: "See more",
        rows: topRows(top(byVehicle, 5), eventsLoading, (code) => (holders.get(code) ? `${holders.get(code)} (${code})` : code)),
      },
    ];
  }

  /** The Stations page's events: everything but code changes (those are the Codes page's Activity). */
  private get stationEvents(): ActivityRow[] {
    return this.allEvents.filter((e) => e.group !== "codes");
  }

  /** The Stations page's Activity: location-scope the station events, count them per group, then apply the Events filter. */
  private applyActivityFilter(): void {
    const ids = new Set(this.visiblePumps.map((p) => p.pumpId));
    const scoped = this.stationEvents.filter((e) => ids.has(e.pumpId));
    this.activityGroupOptions = ACTIVITY_FILTERS.map((f) => ({
      id: f.id,
      label: f.label,
      count: scoped.filter((e) => e.group === f.id).length,
    }));
    const groups = new Set(this.activityGroups);
    const shown = groups.size ? scoped.filter((e) => groups.has(e.group)) : scoped;
    // Where each happened (its pump's station, site and market) and who (its codes' holders, by name).
    const plcNames = new Map(this.plcs.map((p) => [p.plcId, p.name]));
    const pumps = new Map(this.pumps.map((p) => [p.pumpId, p]));
    const users = new Map(this.markets.flatMap((m) => m.codes.users.map((c) => [c.code, c.name] as const)));
    const vehicles = new Map(this.markets.flatMap((m) => m.codes.vehicles.map((c) => [c.code, c.name] as const)));
    const number = (v: number | null, decimals: number) => (v === null ? "" : fmtNumber(v, decimals));
    this.activityRows = shown.map((e) => {
      const pump = pumps.get(e.pumpId);
      return {
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
    });
    this.buildStationSummary(); // today's figures follow the events
  }

  /** The Activity table's foot: what's in it — events, dispenses and their litres, denials — and a note when events were left out. */
  get activityTotals(): string {
    const rows = this.activityRows;
    const dispenses = rows.filter((r) => r.type === "dispense");
    const litres = dispenses.reduce((sum, r) => sum + (r.volume ?? 0), 0);
    const denied = rows.filter((r) => r.group === "denied").length;
    const plural = (n: number, one: string, many: string) => `${fmtNumber(n)} ${n === 1 ? one : many}`;
    return [
      plural(rows.length, "event", "events"),
      `${plural(dispenses.length, "dispense", "dispenses")} (${fmtNumber(litres, litres < 100 && !Number.isInteger(litres) ? 1 : 0)} L)`,
      plural(denied, "denied", "denied"),
    ].join(" · ");
  }

  private scheduleActivityRefresh(): void {
    clearTimeout(this.activityRefreshTimer);
    this.activityRefreshTimer = setTimeout(() => this.loadActivity(), 1000);
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

  /** The minute's tick: while a pump has an event frame waiting, its station may have stalled since — its Attention again. */
  private onAttentionTick(): void {
    if (this.pumps.some((p) => p.eventsWaitingSince !== null)) {
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
    const station = this.selectedStation;
    const stationIds = new Set(station ? [station.rowKey, ...station.pumps.map((p) => p.pumpId)] : []);
    this.stationAlarms = this.allAlarms.filter((a) => stationIds.has(a.originatorId)).map(named);
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

  /** Write a code-change activity event on a market; failures (e.g. no telemetry
   *  permission) never block the change itself. */
  private logEvent(marketId: string, event: PumpEvent): Observable<any> {
    return this.logEvents(marketId, [event]);
  }

  /**
   * {@link logEvent} for several events in one request (an import): each gets
   * its own timestamp, a millisecond apart and none later than now, since
   * two points of one key at the same instant would overwrite each other.
   */
  private logEvents(marketId: string, events: PumpEvent[]): Observable<any> {
    if (!events.length) {
      return of(null);
    }
    const last = Date.now();
    const body = events.map((e, i) => ({ ts: last - (events.length - 1 - i), values: { [this.settings.eventKey]: JSON.stringify(e) } }));
    return this.ctx.http
      .post(`/api/plugins/telemetry/ASSET/${marketId}/timeseries/ANY`, body, defaultHttpOptionsFromConfig(QUIET_REQUEST))
      .pipe(catchError(() => of(null)));
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
      // The user's "Customize columns" picks.
      this.stationColumnChoice.restore(settings);
      this.codeColumnChoice.restore(settings);
      this.activityColumnChoice.restore(settings);
      this.buildCodeColumns();
      this.cd.detectChanges();
    });
  }

}
