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
import { Observable, forkJoin, from, of, throwError } from "rxjs";
import { catchError, map, mergeMap, switchMap, tap, toArray } from "rxjs/operators";
import { WidgetSubscriptionOptions, defaultHttpOptionsFromConfig } from "@core/public-api";
import type { AlarmService } from "@core/http/alarm.service";
import {
  AlarmSearchStatus,
  AliasFilterType,
  Asset,
  AttributeScope,
  DataKeyType,
  Datasource,
  DatasourceType,
  Direction,
  EntityDataQuery,
  EntityFilter,
  EntityKeyType,
  EntityRelation,
  EntitySearchDirection,
  EntityType,
  NULL_UUID,
  RealtimeWindowType,
  RelationTypeGroup,
  SharedModule,
  TimewindowType,
  widgetType,
} from "@shared/public-api";
import { WidgetContext } from "@home/models/widget-component.models";
import { injectCss } from "../../../components/shared/cdn-loader";
import { AlarmListComponent, AlarmListItem } from "../../../components/shared/alarm-list/alarm-list.component";
import { OWNER_ENTITY_FIELDS, ownerCustomer } from "../../../components/shared/entity-owner";
import { CollapsibleCardComponent } from "../../../components/shared/collapsible-card/collapsible-card.component";
import { CheckFilterComponent } from "../../../components/shared/check-filter/check-filter.component";
import { FilterSectionComponent } from "../../../components/shared/filter-section/filter-section.component";
import { ConfirmDialogComponent } from "../../../components/shared/confirm-dialog/confirm-dialog.component";
import { DateRangePickerComponent, TbDateRange } from "../../../components/shared/date-range-picker/date-range-picker.component";
import {
  DataTableCellDirective,
  DataTableColumn,
  DataTableComponent,
} from "../../../components/shared/data-table/data-table.component";
import {
  AttributeSelect,
  DeviceSettingControl,
  DeviceSettingsCardComponent,
} from "../../../components/shared/device-settings-card/device-settings-card.component";
import { keepsSidePanelOpen } from "../../../components/shared/detail-panel/side-panel-outside-click";
import { EntityDetailPanelComponent } from "../../../components/shared/entity-detail-panel/entity-detail-panel.component";
import { FilterListComponent, FilterListOption } from "../../../components/shared/filter-list/filter-list.component";
import { MetricChartCardComponent, MetricChartSection } from "../../../components/shared/metric-chart-card/metric-chart-card.component";
import type { TbSelectOption } from "../../../components/shared/select/select.component";
import { NavRailComponent, NavRailItem } from "../../../components/shared/nav-rail/nav-rail.component";
import { SegmentOption, SegmentedControlComponent } from "../../../components/shared/segmented-control/segmented-control.component";
import { SidebarLayoutComponent } from "../../../components/shared/sidebar-layout/sidebar-layout.component";
import { StatAction, StatGridComponent, StatItem } from "../../../components/shared/stat-grid/stat-grid.component";
import { StatusPillComponent } from "../../../components/shared/status-pill/status-pill.component";
import { SearchBoxComponent } from "../../../components/shared/search-box/search-box.component";
import { SummaryCard, SummaryCardsComponent } from "../../../components/shared/summary-cards/summary-cards.component";
import { TB_CUSTOM_TIMEFRAME, TimeframePickerComponent } from "../../../components/shared/timeframe-picker/timeframe-picker.component";
import { ToastsComponent } from "../../../components/shared/toasts/toasts.component";
import { AssignCodeFormComponent } from "../../components/assign-code-form/assign-code-form.component";
import { ImportCodesFormComponent } from "../../components/import-codes-form/import-codes-form.component";
import { FuelReportsComponent } from "../../components/fuel-reports/fuel-reports.component";
import {
  FUEL_SETTINGS_SECTIONS,
  FuelSettingsComponent,
  SettingsGateway,
  SettingsMarket,
} from "../../components/fuel-settings/fuel-settings.component";
import { SectionNavComponent } from "../../../components/shared/section-nav/section-nav.component";
import { PumpAccessCodesComponent } from "../../components/pump-access-codes/pump-access-codes.component";
import { PlcCodesComponent } from "../../components/plc-codes/plc-codes.component";
import {
  ACTIVITY_FILTERS,
  ActivityGroup,
  ACTIVITY_TIMEFRAMES,
  AccessCode,
  AccessCodeRow,
  ActivityRow,
  AssignCodeRequest,
  CODE_KINDS,
  CodeKind,
  ImportCodesRequest,
  codeAssetConfig,
  codeChangeEvent,
  compareCodeSlots,
  eventDescription,
  codeFromAssetName,
  codeLimitReason,
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
  formatWhen,
  fuelDashboardDefaultSettings,
  parseBool,
  parseCodeLimits,
  parseOptionalBool,
  lastConnectedGateway,
  plcNotReadyWarning,
  PlcRow,
  plcStatusMeta,
  PLC_READINESS_META,
  plcReadiness,
  StationTableRow,
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

/**
 * Fuel management dashboard: fuel pumps (devices of the configured profiles)
 * and the keypad access codes assigned to them.
 *
 * - Icon rail (left edge, as on the marine dashboard): three pages — Stations,
 *   Codes and Reports — with the alarms and the theme toggle at its foot. Each page has a button
 *   tab group at the top of its sidebar: Pumps | Activity, Codes | Activity.
 * - Sidebar: the page's filters. Stations: a location filter — a Market →
 *   Site tree of the fuel-management markets (`fuelManagement` = true) and
 *   their sites — that scopes both views, the alarms and the counts. A Market
 *   links to its Sites by a "FuelSite" relation and each Site to its pumps by
 *   "FuelPump" (both configurable). Codes: the Type and Markets filters
 *   (none checked = all), scoping both the codes and their changes.
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
    AssignCodeFormComponent,
    ImportCodesFormComponent,
    CheckFilterComponent,
    CollapsibleCardComponent,
    ConfirmDialogComponent,
    DateRangePickerComponent,
    DataTableCellDirective,
    DataTableComponent,
    DeviceSettingsCardComponent,
    EntityDetailPanelComponent,
    FuelReportsComponent,
    FuelSettingsComponent,
    SectionNavComponent,
    FilterListComponent,
    FilterSectionComponent,
    MetricChartCardComponent,
    NavRailComponent,
    PumpAccessCodesComponent,
    PlcCodesComponent,
    SegmentedControlComponent,
    SidebarLayoutComponent,
    StatGridComponent,
    StatusPillComponent,
    SearchBoxComponent,
    SummaryCardsComponent,
    TimeframePickerComponent,
    ToastsComponent,
  ],
})
export class FuelManagementDashboardComponent implements OnInit, OnDestroy {
  @Input() ctx: WidgetContext;

  settings: FuelDashboardSettings = fuelDashboardDefaultSettings;
  /** Light/dark theme (persisted per user, shared with the other dashboards). */
  darkMode = false;

  // -- layout -----------------------------------------------------------------

  /** The rail's pages: Stations (the pumps + their activity) and Codes (the access codes + their changes). */
  readonly pages: NavRailItem[] = [
    { id: "stations", label: "Stations", icon: "local_gas_station" },
    { id: "codes", label: "Codes", icon: "key" },
    { id: "reports", label: "Reports", icon: "analytics" },
    { id: "settings", label: "Settings", icon: "settings" },
  ];
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

  readonly settingsSections = FUEL_SETTINGS_SECTIONS;
  settingsSection = "markets";
  /** Every Market asset (in fuel management or not), with its fuel-management node when it has one. */
  settingsMarkets: SettingsMarket[] = [];
  settingsGateways: SettingsGateway[] = [];
  /** Each pump's / PLC's gateway name, by device id (the Settings tables). */
  gatewayNames: Record<string, string> = {};
  settingsLoading = true;
  /** A market's fuel-management switch is being saved. */
  settingsSaving = false;
  private allMarkets: { id: string; name: string; fuelManagement: boolean }[] = [];
  /** The gateways' names and online state, by id. */
  private gatewayInfo = new Map<string, { name: string; online: boolean }>();

  /** The Reports page's window (its sidebar picker: 1D … 1M, or a range from its calendar). */
  reportTimeframe = "1W";
  reportRange: TbDateRange | null = null;
  /** The Reports page's Sites filter (ids; none = all) and their names for the report. */
  reportLocations: string[] = [];
  reportSiteNames: string[] = [];
  reportLocationOptions: FilterListOption[] = [];
  reportLocationsExpanded = false;
  /** The Reports page's Type filter: Users / Vehicles (none = both). */
  reportKinds: CodeKind[] = [];
  reportTypeOptions: FilterListOption[] = [];

  // -- pumps + location filter ------------------------------------------------

  /** Every pump, unfiltered. */
  pumps: PumpRow[] = [];
  pumpsLoading = false;
  /** The stations (PLCs) have loaded at least once — their capacity sizes the markets' code lists. */
  private plcsLoaded = false;
  /** Pumps under the selected sites / markets (all when none selected). */
  visiblePumps: PumpRow[] = [];
  /** Market → Site tree for the location filter. */
  locationOptions: FilterListOption[] = [];
  /** Selected site ids (plus market ids for markets without sites). */
  selectedLocations: string[] = [];
  /**
   * The Stations tab's summary cards (above its table). PLACEHOLDER values —
   * what the page should summarise, not wired to data yet:
   * - Station summary: the stations (PLCs) in the filter by status — online,
   *   loading a code list (their transfer flags), offline (`active`);
   * - Dispensing today: fuel, dispenses, the average dispense, denials and the
   *   last dispense (the pumps' dispense / denied events since midnight);
   * - Top stations / Top vehicles: the most fuel dispensed today, by station
   *   (its pumps) and by vehicle (the dispense events' vehicle codes).
   */
  readonly stationSummary: SummaryCard[] = [
    {
      id: "status",
      title: "Station summary",
      rows: [
        { label: "Stations", icon: "local_gas_station", value: "4" },
        { label: "Online", mark: "success", value: "3 (75%)" },
        { label: "Updating", mark: "warning", value: "0 (0%)" },
        { label: "Offline", mark: "neutral", value: "1 (25%)" },
      ],
    },
    {
      id: "dispensing",
      title: "Dispensing today",
      rows: [
        { label: "Fuel dispensed", icon: "water_drop", value: "12,480", unit: "L" },
        { label: "Dispenses", icon: "receipt_long", value: "214" },
        { label: "Avg per dispense", icon: "avg_pace", value: "58.3", unit: "L" },
        { label: "Denied", icon: "block", value: "7 (3.2%)" },
        { label: "Last dispense", icon: "schedule", value: "4m ago" },
      ],
    },
    {
      id: "topStations",
      title: "Top stations",
      link: "See more",
      rows: [
        { label: "PLC01", value: "5,120", unit: "L" },
        { label: "PLC02", value: "3,880", unit: "L" },
        { label: "PLC03", value: "2,140", unit: "L" },
        { label: "PLC04", value: "1,340", unit: "L" },
      ],
    },
    {
      id: "topVehicles",
      title: "Top vehicles",
      link: "See more",
      rows: [
        { label: "129702", value: "1,860", unit: "L" },
        { label: "61149", value: "1,420", unit: "L" },
        { label: "40218", value: "980", unit: "L" },
        { label: "33871", value: "760", unit: "L" },
        { label: "52690", value: "540", unit: "L" },
      ],
    },
  ];

  /** The Stations table: one row per station (PLC). */
  stationRows: StationTableRow[] = [];
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
    { key: "name", header: "" },
    { key: "status", header: "", align: "right" },
  ];
  readonly stationColumns: DataTableColumn[] = [
    { key: "name", header: "Station" },
    { key: "site", header: "Site" },
    { key: "userCodes", header: "User codes" },
    { key: "vehicleCodes", header: "Vehicle codes" },
    { key: "status", header: "Status" },
    { key: "lastDispense", header: "Last dispense" },
  ];

  // -- access codes -----------------------------------------------------------

  /** Which list the pump panel's Codes tab shows. */
  codeKind: CodeKind = "users";
  /** Access codes view: the code types shown (none checked = both). */
  codeTypes: CodeKind[] = [];
  /** The sidebar's Type filter: Users / Vehicles, counted over the markets in the filter. */
  codeTypeOptions: FilterListOption[] = [];
  /** The Markets list is stretched to the sidebar's full height (its expand button). */
  marketsListExpanded = false;
  /** The Sites tree (Pumps / Activity) is stretched to the sidebar's full height. */
  locationsListExpanded = false;
  /** The Codes page's Markets filter: the markets shown (none checked = all). */
  codeMarkets: string[] = [];
  /** The Markets filter's options (count = codes on Codes, changes on Activity, per the Type filter). */
  marketOptions: FilterListOption[] = [];
  codeRows: AccessCodeRow[] = [];
  codeColumns: DataTableColumn[] = [];
  /** The Codes page's Activity: the code changes of the markets in the filter (per the Type filter), newest first. */
  codeActivityRows: ActivityRow[] = [];
  readonly codeActivityColumns: DataTableColumn[] = [
    { key: "time", header: "Time" },
    { key: "event", header: "Event" },
    { key: "pump", header: "Market" },
    { key: "description", header: "Description", truncate: true },
  ];
  /** The assign form's market dropdown (every fuel-management market, by name). */
  assignMarketOptions: TbSelectOption[] = [];
  /** The markets (and their code lists) are still loading. */
  marketsLoading = true;
  /** Codes already in the assign panel's market — generated codes never collide with these. */
  takenCodes: string[] = [];

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
  /** Events in view (location filter + chip filter). */
  activityRows: ActivityRow[] = [];
  activityLoading = false;
  readonly activityColumns: DataTableColumn[] = [
    { key: "time", header: "Time" },
    { key: "event", header: "Event" },
    { key: "pump", header: "Entity" },
    { key: "description", header: "Description", truncate: true },
  ];

  // -- alarms -----------------------------------------------------------------

  alarmsLoading = false;
  alarmPanelOpen = false;
  /** Active alarms of the visible pumps (header badge + alarms panel). */
  panelAlarms: AlarmListItem[] = [];
  /** Active alarms of the selected pump (detail panel Alarms tab). */
  detailAlarms: AlarmListItem[] = [];
  readonly alarmPanelTabs: SegmentOption[] = [{ id: "alarms", label: "Alarms", icon: "notifications" }];

  // -- station detail panel -----------------------------------------------------

  selectedStation: StationTableRow | null = null;
  stationOpen = false;
  /** Active alarms of the selected station: its PLC's and its pumps'. */
  stationAlarms: AlarmListItem[] = [];

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

  // -- assign-code panel ------------------------------------------------------

  assignOpen = false;
  /** Market the assign panel adds to, and the list it starts on. */
  assignMarketId: string | null = null;
  assignKind: CodeKind = "users";
  /** Bumped on every open so the form resets. */
  assignResetKey = 0;
  readonly assignTabs: SegmentOption[] = [{ id: "assign", label: "Assign code", icon: "key" }];
  /** The assign panel's market's PLCs (their readiness pills). */
  assignPlcs: PlcRow[] = [];
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
  /** The import panel's market's PLCs (their readiness pills). */
  importPlcs: PlcRow[] = [];
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
  /** The gateway that created each device (its "Created" relation), by device id. */
  private createdBy = new Map<string, string>();
  /** The gateways {@link createdBy} was fetched for (sorted ids), and the latest fetch. */
  private gatewaysKey = "";
  private gatewaysRequest = 0;
  /** Each linked pump's Market → Site location, by pump id. */
  private pumpLocations = new Map<string, PumpLocation>();
  private readonly themeSettingKey = "darkMode";
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
  private alarmsSubscription: any;
  private pumpsSubscription: any;
  private plcsSubscription: any;
  private pumpsRefreshTimer?: any;
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

  /** Rail foot: the alarms (badge = the active alarms in scope), then the light/dark toggle (icon follows the theme). */
  get railBottomItems(): NavRailItem[] {
    return [
      { id: "alarms", icon: "notifications", label: "Alarms", badge: this.panelAlarms.length },
      { id: "theme", icon: this.darkMode ? "light_mode" : "dark_mode", label: this.darkMode ? "Light mode" : "Dark mode" },
    ];
  }

  onRailBottomClick(id: string): void {
    if (id === "alarms") {
      this.alarmPanelOpen = true;
    } else if (id === "theme") {
      this.toggleTheme();
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
      { id: "codes", label: "Codes", icon: "key", tooltip: "Codes", badge: this.stationCodeDifferences },
      { id: "alarms", label: "Alarms", icon: "notifications", tooltip: "Alarms", badge: this.stationAlarms.length },
    ];
  }

  /** Slots of the selected station's lists (both kinds) that differ between what was sent and what it reports — the Codes tab's badge. */
  get stationCodeDifferences(): number {
    const plc = this.selectedStation?.plc;
    if (!plc) {
      return 0;
    }
    return CODE_KINDS.map((k) => k.id).reduce(
      (n, kind) => n + compareCodeSlots(plc.sentCodes[kind], plc.reportedCodes[kind]).filter((r) => r.status !== "match").length,
      0
    );
  }

  /** The Stations row to highlight: the selected station while its panel is showing. */
  get highlightedStationId(): string | null {
    return this.selectedStation && this.stationOpen ? this.selectedStation.rowKey : null;
  }

  get stationSubtitle(): string {
    const s = this.selectedStation;
    return s ? [s.site, s.market].filter(Boolean).join(" · ") : "";
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

  ngOnInit(): void {
    this.ctx.$scope.fuelManagementDashboardComponent = this;
    this.settings = { ...fuelDashboardDefaultSettings, ...(this.ctx.settings ?? {}) };
    injectCss("tb-ext-material-symbols-rounded", "https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200");
    this.alarmService = this.ctx.$injector.get(this.ctx.servicesMap.get("alarmService")) as AlarmService;
    this.buildPanelConfig();
    this.applyCodes(); // table columns before the markets arrive
    this.loadUserPreferences();

    this.loadHierarchy();
    this.loadPumps(); // initial render (also triggers the first activity load)
    this.subscribePumps(); // live refresh on attribute / telemetry changes
    this.loadPlcs();
    this.subscribePlcs(); // the readiness pills follow the PLCs' transfer flags
    this.loadAllMarkets(); // the Settings page's market list
    this.subscribeAlarms();
  }

  ngOnDestroy(): void {
    if (this.alarmsSubscription) {
      this.ctx.subscriptionApi.removeSubscription(this.alarmsSubscription.id);
    }
    if (this.pumpsSubscription) {
      this.ctx.subscriptionApi.removeSubscription(this.pumpsSubscription.id);
    }
    if (this.plcsSubscription) {
      this.ctx.subscriptionApi.removeSubscription(this.plcsSubscription.id);
    }
    clearTimeout(this.pumpsRefreshTimer);
    clearTimeout(this.plcsRefreshTimer);
    clearTimeout(this.activityRefreshTimer);
  }

  /** ThingsBoard hook — data comes from the custom subscriptions; just re-render. */
  onDataUpdated(): void {
    this.ctx.detectChanges();
  }

  onResize(): void {
    this.cd.detectChanges();
  }

  // -- header / sidebar ---------------------------------------------------------

  /** A rail page: back to the view it last showed. */
  selectPage(id: string): void {
    this.page = id as DashboardPage;
    this.selectView(this.pageView[this.page]);
  }

  /** A view of the current page (its tab group). */
  selectView(id: string): void {
    this.view = id as DashboardView;
    this.pageView[this.page] = this.view;
    if (this.isActivityView && !this.activityLoaded) {
      this.loadActivity();
    }
    this.applyFilters(); // Sites count pumps on Pumps, events on Activity
    this.applyCodes(); // Type / Markets count codes on Codes, changes on Activity
  }

  toggleTheme(): void {
    this.darkMode = !this.darkMode;
    this.cd.detectChanges();
    this.ctx.userSettingsService
      .putUserSettings({ [this.themeSettingKey]: this.darkMode } as any)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe();
  }

  onLocationsChange(ids: string[]): void {
    this.selectedLocations = ids;
    this.applyFilters();
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
    this.closeDetail();
    this.selectedStation = station;
    this.stationOpen = true;
    this.applyAlarmScope();
  }

  closeStation(): void {
    this.stationOpen = false;
    this.selectedStation = null;
    this.stationAlarms = [];
  }

  /** A pump in the station panel: the pump's own panel takes its place. */
  onStationPumpClick(row: Record<string, any>): void {
    this.closeStation();
    this.openPump(row as PumpRow, "insights");
  }

  /** Show a pump in the panel; `tab` null keeps the open panel's current tab. */
  private openPump(pump: PumpRow, tab: string | null): void {
    this.selectedPump = pump;
    if (tab) {
      this.detailOpenTab = tab; // used when the panel opens (or reopens)
      if (this.detailOpen) {
        this.pumpPanel?.selectTab(tab); // already open — switch now
      }
    }
    this.detailOpen = true;
    this.syncDetailInputs();
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
    if ((!this.detailOpen && !this.stationOpen) || this.assignOpen || this.importOpen || keepsSidePanelOpen(event.target)) {
      return;
    }
    this.closeDetail();
    this.closeStation();
    this.cd.detectChanges();
  }

  /** Ask to revoke one of a market's codes (the themed confirm dialog). */
  onRevoke(market: MarketNode | null, code: AccessCode, kind: CodeKind): void {
    if (!market) {
      return;
    }
    this.revokeConfirm = {
      market,
      code,
      kind,
      message: `Code ${code.code} (${code.name || "no name"}) will stop working at every pump in ${market.name}.`,
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
            this.toasts.warn(`Code ${code.code} revoked, but ${market.name}'s code list couldn't be updated.`);
          }
          this.scheduleActivityRefresh();
          this.cd.detectChanges();
        },
        error: (err) => {
          this.saving = false;
          this.toasts.error(`Couldn't delete the code asset${this.apiMessage(err)}`);
          this.cd.detectChanges();
        },
      });
    this.cd.detectChanges();
  }

  /**
   * Revoke one code: delete its asset, then — side by side — clear its slot
   * (in place) in the market's fixed-length list and log the change, and drop
   * it from the market's codes. Emits whether the list was updated; errors
   * when the asset couldn't be deleted. (A bulk revoke doesn't run these one
   * by one — see {@link confirmBulkRevoke}.)
   */
  private revokeCode(market: MarketNode, code: AccessCode, kind: CodeKind): Observable<boolean> {
    const cfg = { ignoreLoading: true, ignoreErrors: true };
    return this.ctx.assetService.deleteAsset(code.assetId, cfg).pipe(
      switchMap(() =>
        forkJoin({
          listUpdated: this.updateMarketList(market.id, kind, (raw) => withoutCode(raw, code.code, market.limits[kind])).pipe(
            map(() => true),
            catchError(() => of(false))
          ),
          logged: this.logEvent(market.id, codeChangeEvent("code_revoked", kind, code.code, code.name, market.name)),
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
    const cfg = { ignoreLoading: true, ignoreErrors: true };
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
          // One list write per market + list, one event batch per market.
          const groups = new Map<string, { market: MarketNode; kind: CodeKind; codes: AccessCodeRow[] }>();
          const events = new Map<string, AccessCodeRow[]>();
          for (const r of deleted) {
            const market = this.marketById(r.marketId);
            if (!market) {
              continue;
            }
            const key = `${market.id}:${r.kind}`;
            const g = groups.get(key) ?? { market, kind: r.kind, codes: [] };
            g.codes.push(r);
            groups.set(key, g);
            events.set(market.id, [...(events.get(market.id) ?? []), r]);
          }
          const writes = [...groups.values()].map((g) =>
            this.updateMarketList(g.market.id, g.kind, (raw) => withoutCodes(raw, g.codes.map((c) => c.code), g.market.limits[g.kind])).pipe(
              map(() => ({ g, ok: true })),
              catchError(() => of({ g, ok: false }))
            )
          );
          const logs = [...events.entries()].map(([marketId, codes]) =>
            this.logEvents(
              marketId,
              codes.map((c) => codeChangeEvent("code_revoked", c.kind, c.code, c.source.name, c.market))
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
          this.toasts.warn(`${revoked} codes revoked, but ${listsFailed} couldn't be cleared from their market's code list.`);
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
    this.assignMarketId = market.id;
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

  /** The assign form's Market dropdown: that market's codes, limits and PLCs. */
  onAssignMarketChange(id: string): void {
    this.assignMarketId = id;
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
   * Create the code: a FuelUser / FuelVehicle asset named `<prefix><code>`
   * with the holder as its label, owned by the market's customer (the tenant
   * when the market is tenant-owned), then the market → asset relation (the
   * backend builds the market's list and the pumps' codes from these), and log a
   * "code assigned" event on the market, and put the code in the first free slot
   * of the market's fixed-length allowed-codes list. If the owner or relation can't be set
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
    const reason = codeLimitReason(market.codes, market.limits, req.kind);
    if (reason) {
      this.toasts.warn(reason);
      return;
    }
    this.saving = true;
    this.marketCustomerId(market.id)
      .pipe(
        switchMap((customerId) => this.createCodeAsset(market, req, customerId)),
        // Allowed codes: add the code to the market's list (a failure here doesn't undo the code).
        switchMap((saved) =>
          this.updateMarketList(market.id, req.kind, (raw) => withCode(raw, req.code, market.limits[req.kind])).pipe(
            map(() => true),
            catchError(() => of(false)),
            map((listUpdated) => ({ saved, listUpdated }))
          )
        ),
        switchMap((result) =>
          this.logEvent(market.id, codeChangeEvent("code_assigned", req.kind, req.code, req.name, market.name)).pipe(map(() => result))
        )
      )
      .subscribe({
        next: ({ saved, listUpdated }) => {
          this.saving = false;
          const entry: AccessCode = { assetId: saved.id.id, code: req.code, name: req.name, createdAt: saved.createdTime || Date.now() };
          this.showCodes(req.kind); // the new code's tab
          this.patchMarketCodes(market.id, req.kind, [...market.codes[req.kind], entry]);
          if (listUpdated) {
            this.toasts.success(`${codeKindLabel(req.kind, true)} code ${req.code} added to ${market.name}`);
          } else {
            this.toasts.warn(`Code ${req.code} created, but ${market.name}'s code list couldn't be updated.`);
          }
          this.closeAssign();
          this.scheduleActivityRefresh();
          this.cd.detectChanges();
        },
        error: (err) => {
          this.saving = false;
          const msg = this.apiMessage(err);
          this.toasts.error(
            /already exists/i.test(msg) ? `Code ${req.code} is already in use — generate another.` : `Couldn't create the code${msg}`
          );
          this.cd.detectChanges();
        },
      });
  }

  /**
   * Create one code asset for a market: a FuelUser / FuelVehicle asset named
   * `<prefix><code>` with the holder as its label, owned by `customerId` (the
   * tenant when ""), then the market → asset relation (the backend builds the
   * market's list and the pumps' codes from these). If the owner or relation
   * can't be set the new asset is deleted again, so no stray asset is left behind.
   */
  private createCodeAsset(market: MarketNode, req: AssignCodeRequest, customerId: string): Observable<Asset> {
    const k = codeAssetConfig(this.settings, req.kind);
    const cfg = { ignoreLoading: true, ignoreErrors: true };
    const asset = { name: `${k.prefix}${req.code}`, type: k.type, label: req.name } as Asset;
    if (customerId) {
      asset.customerId = { entityType: EntityType.CUSTOMER, id: customerId };
    }
    return this.ctx.assetService.saveAsset(asset, cfg).pipe(
      switchMap((saved) => this.ensureCustomerOwner(saved, customerId).pipe(catchError((err) => this.deleteCreatedAsset(saved, err)))),
      switchMap((saved) =>
        this.ctx.entityRelationService
          .saveRelation(
            { from: { entityType: EntityType.ASSET, id: market.id }, to: saved.id, type: k.relation, typeGroup: RelationTypeGroup.COMMON },
            cfg
          )
          .pipe(
            map(() => saved),
            catchError((err) => this.deleteCreatedAsset(saved, err))
          )
      )
    );
  }

  // -- import-codes panel -------------------------------------------------------

  /** Open the import panel for a market. */
  openImport(market: MarketNode | null): void {
    if (!market) {
      this.toasts.warn("No fuel-management market to import codes into.");
      return;
    }
    this.importMarketId = market.id;
    this.refreshTakenCodes();
    this.applyImportPlcs();
    this.importResetKey++;
    this.importOpen = true;
  }

  closeImport(): void {
    this.importOpen = false;
  }

  /** The import form's Market dropdown: that market's codes, limits and PLCs. */
  onImportMarketChange(id: string): void {
    this.importMarketId = id;
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
    this.saving = true;
    this.importProgress = { done: 0, total };
    this.marketCustomerId(market.id)
      .pipe(
        switchMap((customerId) =>
          from(req.codes).pipe(
            mergeMap(
              (code, index) =>
                this.createCodeAsset(market, code, customerId).pipe(
                  map((saved) => ({ index, code, saved: saved as Asset | null, error: "" })),
                  catchError((err) => of({ index, code, saved: null as Asset | null, error: this.apiMessage(err) })),
                  tap(() => {
                    this.importProgress = { done: (this.importProgress?.done ?? 0) + 1, total };
                    this.cd.detectChanges();
                  })
                ),
              FuelManagementDashboardComponent.BULK_CONCURRENCY
            ),
            toArray(),
            // Back in paste order, so the codes take their list slots in that order.
            map((results) => results.sort((a, b) => a.index - b.index))
          )
        ),
        // Allowed codes: one list write per kind with every code created (a failure doesn't undo the codes).
        switchMap((results) => {
          const created = results.filter((r) => r.saved);
          const writes = kinds
            .map((kind) => ({ kind, codes: created.filter((r) => r.code.kind === kind).map((r) => r.code.code) }))
            .filter((w) => w.codes.length)
            .map((w) =>
              this.updateMarketList(market.id, w.kind, (raw) => withCodes(raw, w.codes, market.limits[w.kind])).pipe(
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
            r.results.filter((x) => x.saved).map((x) => codeChangeEvent("code_assigned", x.code.kind, x.code.code, x.code.name, market.name))
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
              .map((r) => ({ assetId: r.saved!.id.id, code: r.code.code, name: r.code.name, createdAt: r.saved!.createdTime || Date.now() }));
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
            this.toasts.warn(`${created.length} codes imported, but ${market.name}'s code list couldn't be updated.`);
          } else {
            this.toasts.success(created.length === 1 ? `1 code imported to ${market.name}` : `${created.length} codes imported to ${market.name}`);
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
          this.toasts.error(`Couldn't import the codes${this.apiMessage(err)}`);
          this.cd.detectChanges();
        },
      });
  }

  /** The import panel's PLCs: those located in its market. */
  private applyImportPlcs(): void {
    this.importPlcs = this.plcs.filter((p) => p.marketId === this.importMarketId);
  }

  /** The customer that owns a market ("" when the tenant owns it). */
  private marketCustomerId(marketId: string): Observable<string> {
    return this.ctx.assetService.getAsset(marketId, { ignoreLoading: true, ignoreErrors: true }).pipe(
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
   * Make sure a new code asset is owned by `customerId` — the create request
   * already asks for it; if the server still made it tenant-owned, move it with
   * the PE owner endpoint. No-op when the market is tenant-owned.
   */
  private ensureCustomerOwner(saved: Asset, customerId: string): Observable<Asset> {
    const ownedBy = (saved as any).ownerId?.id ?? saved.customerId?.id;
    if (!customerId || ownedBy === customerId) {
      return of(saved);
    }
    return this.ctx.http
      .post(
        `/api/owner/CUSTOMER/${customerId}/ASSET/${saved.id.id}`,
        [],
        defaultHttpOptionsFromConfig({ ignoreLoading: true, ignoreErrors: true })
      )
      .pipe(map(() => saved));
  }

  /** Undo a half-created code: delete the new asset, then re-throw the original error. */
  private deleteCreatedAsset(saved: Asset, err: unknown): Observable<never> {
    return this.ctx.assetService.deleteAsset(saved.id.id, { ignoreLoading: true, ignoreErrors: true }).pipe(
      catchError(() => of(null)),
      switchMap(() => throwError(() => err))
    );
  }

  /** ": <server message>" from a failed ThingsBoard call ("." when there is none). */
  private apiMessage(err: any): string {
    const msg = err?.error?.message ?? err?.message;
    return msg ? `: ${msg}` : ".";
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

  /** The Reports page's window end (a calendar range's end; null = now). */
  get reportEnd(): number | null {
    return this.reportTimeframe === TB_CUSTOM_TIMEFRAME && this.reportRange ? this.reportRange.end : null;
  }

  /** The range the date-range panel opens on (the page it sets). */
  get rangePickerRange(): TbDateRange | null {
    return this.rangeTarget === "reports" ? this.reportRange : this.activityRange;
  }

  onReportTimeframe(id: string): void {
    this.reportTimeframe = id;
    this.reportRange = null;
  }

  /** The Reports page's Sites filter: the ids, and the names the report goes by. */
  onReportLocationsChange(ids: string[]): void {
    this.reportLocations = ids;
    const names = new Map<string, string>();
    this.markets.forEach((m) => {
      names.set(m.id, m.name);
      m.sites.forEach((site) => names.set(site.id, site.name));
    });
    this.reportSiteNames = ids.map((id) => names.get(id) ?? "").filter(Boolean);
  }

  onReportKindsChange(ids: string[]): void {
    this.reportKinds = ids as CodeKind[];
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

  /** Either Activity's export (the sidebar's download button): the rows in view. */
  onActivityAction(id: string): void {
    if (id === "export") {
      const codes = this.view === "codeActivity";
      this.exportActivityCsv(codes ? this.codeActivityRows : this.activityRows, codes ? "fuel-code-activity" : "fuel-activity");
    }
  }

  // -- alarms -------------------------------------------------------------------

  clearAlarm(alarm: AlarmListItem): void {
    alarm.cleared = true;
    this.alarmService
      .clearAlarm(alarm.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ error: () => (alarm.cleared = false) });
  }

  // -- data: pumps ----------------------------------------------------------------

  /** Load every pump (entity query) and rebuild all derived views. */
  loadPumps(): void {
    const s = this.settings;
    this.pumpsLoading = true;
    const query: EntityDataQuery = {
      entityFilter: this.pumpFilter,
      pageLink: {
        pageSize: 1024,
        page: 0,
        sortOrder: { key: { type: EntityKeyType.ENTITY_FIELD, key: "name" }, direction: Direction.ASC },
      },
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
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: s.siteKey },
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: s.fuelTypeKey },
        { type: EntityKeyType.SHARED_ATTRIBUTE, key: s.lockedKey },
        // Code lists sent to the pump (shared) vs what it reports back (client) → Synced / Desynced.
        { type: EntityKeyType.SHARED_ATTRIBUTE, key: s.userCodesKey },
        { type: EntityKeyType.SHARED_ATTRIBUTE, key: s.vehicleCodesKey },
        { type: EntityKeyType.CLIENT_ATTRIBUTE, key: s.userCodesKey },
        { type: EntityKeyType.CLIENT_ATTRIBUTE, key: s.vehicleCodesKey },
        // Latest dispense point — its timestamp is "Last dispense".
        { type: EntityKeyType.TIME_SERIES, key: s.dispenseVolumeKey },
      ],
    };
    this.ctx.entityService
      .findEntityDataByQuery(query, { ignoreLoading: true, ignoreErrors: true })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this.pumps = page.data.map((d) => this.toPumpRow(d)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
          this.pumpsLoading = false;
          this.refreshGateways();
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
      description: this.parseDescription(fields["additionalInfo"]?.value),
      type: fields["type"]?.value ?? "",
      owner: ownerCustomer(fields),
      lastGatewayId: lastConnectedGateway(fields["additionalInfo"]?.value),
      site: siteAttr,
      siteAttr,
      siteId: "",
      marketId: "",
      market: "",
      fuelType: server[s.fuelTypeKey]?.value ?? "",
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
    });
  }

  /** Apply the pump's Market → Site location and its market's code count (once the hierarchy has loaded). */
  private locate(p: PumpRow): PumpRow {
    const loc = this.pumpLocations.get(p.pumpId);
    const market = loc ? this.markets.find((m) => m.id === loc.marketId) : undefined;
    return {
      ...p,
      siteId: loc?.siteId ?? "",
      marketId: loc?.marketId ?? "",
      market: loc?.marketName ?? "",
      site: loc?.siteName || p.siteAttr,
      codeCount: market ? market.codes.users.length + market.codes.vehicles.length : 0,
    };
  }

  // -- data: PLCs -----------------------------------------------------------------

  /** Load every PLC (entity query): name, online state and transfer flags. */
  private loadPlcs(): void {
    const s = this.settings;
    const query: EntityDataQuery = {
      entityFilter: this.plcFilter,
      pageLink: {
        pageSize: 1024,
        page: 0,
        sortOrder: { key: { type: EntityKeyType.ENTITY_FIELD, key: "name" }, direction: Direction.ASC },
      },
      entityFields: [
        { type: EntityKeyType.ENTITY_FIELD, key: "name" },
        { type: EntityKeyType.ENTITY_FIELD, key: "label" },
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
        // Code lists sent to the PLC (shared) vs what it reports holding (client) → the panel's Codes tab.
        { type: EntityKeyType.SHARED_ATTRIBUTE, key: s.userCodesKey },
        { type: EntityKeyType.SHARED_ATTRIBUTE, key: s.vehicleCodesKey },
        { type: EntityKeyType.CLIENT_ATTRIBUTE, key: s.userCodesKey },
        { type: EntityKeyType.CLIENT_ATTRIBUTE, key: s.vehicleCodesKey },
      ],
    };
    this.ctx.entityService
      .findEntityDataByQuery(query, { ignoreLoading: true, ignoreErrors: true })
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
          this.applySettingsMarkets();
          this.buildSidebarFilters(); // the Sites tree counts stations
          this.refreshGateways();
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
    return this.locatePlc({
      plcId: d.entityId.id,
      name: fields["label"]?.value || fields["name"]?.value || "Unknown PLC",
      owner: ownerCustomer(fields),
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
      sentCodes: { users: parseCodeSlots(shared[s.userCodesKey]?.value), vehicles: parseCodeSlots(shared[s.vehicleCodesKey]?.value) },
      reportedCodes: { users: parseCodeSlots(client[s.userCodesKey]?.value), vehicles: parseCodeSlots(client[s.vehicleCodesKey]?.value) },
      codesSync: codesSyncState(
        shared[s.userCodesKey]?.value,
        client[s.userCodesKey]?.value,
        shared[s.vehicleCodesKey]?.value,
        client[s.vehicleCodesKey]?.value
      ),
    });
  }

  /** Apply the PLC's Market → Site location (once the hierarchy has loaded). */
  private locatePlc(p: PlcRow): PlcRow {
    const loc = this.plcLocations.get(p.plcId);
    return { ...p, siteId: loc?.siteId ?? "", site: loc?.siteName ?? "", marketId: loc?.marketId ?? "" };
  }

  /**
   * The gateways' "Created" relations (gateway → each device it created), so
   * {@link applyStations} can group a gateway's pumps under its PLC. Fetched
   * again only when the set of gateways (the devices' last-connected gateways)
   * changes; a device without the relation keeps its last-connected gateway.
   */
  private refreshGateways(): void {
    const relation = this.settings.gatewayRelation;
    const ids = [...new Set([...this.pumps.map((p) => p.lastGatewayId), ...this.plcs.map((p) => p.lastGatewayId)].filter(Boolean))].sort();
    const key = ids.join(",");
    if (key === this.gatewaysKey) {
      return;
    }
    this.gatewaysKey = key;
    const request = ++this.gatewaysRequest;
    const cfg = { ignoreLoading: true, ignoreErrors: true };
    const calls = ids.map((id) =>
      this.ctx.entityRelationService
        .findByQuery(
          {
            parameters: { rootId: id, rootType: EntityType.DEVICE, direction: EntitySearchDirection.FROM, maxLevel: 1, fetchLastLevelOnly: false },
            filters: [{ relationType: relation, entityTypes: [EntityType.DEVICE] }],
          },
          cfg
        )
        .pipe(catchError(() => of([] as EntityRelation[])))
    );
    (calls.length ? forkJoin(calls) : of([] as EntityRelation[][]))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((perGateway) => {
        if (request !== this.gatewaysRequest) {
          return; // a newer set of gateways is being fetched
        }
        const createdBy = new Map<string, string>();
        for (const r of perGateway.flat()) {
          if (r.type === relation && r.from?.entityType === EntityType.DEVICE && r.to?.entityType === EntityType.DEVICE && !createdBy.has(r.to.id)) {
            createdBy.set(r.to.id, r.from.id);
          }
        }
        this.createdBy = createdBy;
        this.applyStations();
        this.cd.detectChanges();
      });
    this.loadGatewayInfo(ids);
  }

  /** The gateways' names and online state (the Settings page's Gateways table and gateway columns). */
  private loadGatewayInfo(ids: string[]): void {
    if (!ids.length) {
      this.gatewayInfo = new Map();
      this.applyGateways();
      return;
    }
    const query: EntityDataQuery = {
      entityFilter: { type: AliasFilterType.entityList, entityType: EntityType.DEVICE, entityList: ids },
      entityFields: [
        { type: EntityKeyType.ENTITY_FIELD, key: "name" },
        { type: EntityKeyType.ENTITY_FIELD, key: "label" },
      ],
      latestValues: [{ type: EntityKeyType.SERVER_ATTRIBUTE, key: "active" }],
      pageLink: { pageSize: Math.max(64, ids.length), page: 0 },
    };
    this.ctx.entityService
      .findEntityDataByQuery(query, { ignoreLoading: true, ignoreErrors: true })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this.gatewayInfo = new Map(
            page.data.map((d) => {
              const f = d.latest?.[EntityKeyType.ENTITY_FIELD] ?? {};
              const server = d.latest?.[EntityKeyType.SERVER_ATTRIBUTE] ?? {};
              return [
                d.entityId.id,
                { name: String(f["label"]?.value || f["name"]?.value || ""), online: String(server["active"]?.value ?? "") !== "false" },
              ] as [string, { name: string; online: boolean }];
            })
          );
          this.applyGateways();
          this.cd.detectChanges();
        },
        error: () => this.applyGateways(),
      });
  }

  /** The Settings page's gateways (each with its stations / pumps) and each device's gateway name. */
  private applyGateways(): void {
    const gatewayOf = (id: string, last: string) => this.createdBy.get(id) ?? last;
    const names: Record<string, string> = {};
    const counts = new Map<string, { stations: number; pumps: number }>();
    const count = (gw: string, kind: "stations" | "pumps") => {
      const c = counts.get(gw) ?? { stations: 0, pumps: 0 };
      c[kind]++;
      counts.set(gw, c);
    };
    for (const plc of this.plcs) {
      const gw = gatewayOf(plc.plcId, plc.lastGatewayId);
      if (gw) {
        names[plc.plcId] = this.gatewayInfo.get(gw)?.name ?? "";
        count(gw, "stations");
      }
    }
    for (const pump of this.pumps) {
      const gw = gatewayOf(pump.pumpId, pump.lastGatewayId);
      if (gw) {
        names[pump.pumpId] = this.gatewayInfo.get(gw)?.name ?? "";
        count(gw, "pumps");
      }
    }
    this.gatewayNames = names;
    this.settingsGateways = [...counts]
      .map(([id, c]) => ({ id, name: this.gatewayInfo.get(id)?.name || "Unknown gateway", online: this.gatewayInfo.get(id)?.online ?? false, ...c }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }

  // -- data: settings ---------------------------------------------------------------

  /** Every Market asset with its fuel-management flag — the Settings page lists them all. */
  private loadAllMarkets(): void {
    const s = this.settings;
    const query: EntityDataQuery = {
      entityFilter: { type: AliasFilterType.assetType, assetTypes: [s.marketAssetType], assetNameFilter: "" },
      entityFields: [
        { type: EntityKeyType.ENTITY_FIELD, key: "name" },
        { type: EntityKeyType.ENTITY_FIELD, key: "label" },
      ],
      latestValues: [{ type: EntityKeyType.SERVER_ATTRIBUTE, key: s.fuelManagementKey }],
      pageLink: { pageSize: 1024, page: 0, sortOrder: { key: { type: EntityKeyType.ENTITY_FIELD, key: "name" }, direction: Direction.ASC } },
    };
    this.ctx.entityService
      .findEntityDataByQuery(query, { ignoreLoading: true, ignoreErrors: true })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this.allMarkets = page.data.map((d) => {
            const f = d.latest?.[EntityKeyType.ENTITY_FIELD] ?? {};
            return {
              id: d.entityId.id,
              name: String(f["label"]?.value || f["name"]?.value || ""),
              fuelManagement: parseBool(d.latest?.[EntityKeyType.SERVER_ATTRIBUTE]?.[s.fuelManagementKey]?.value),
            };
          });
          this.settingsLoading = false;
          this.applySettingsMarkets();
          this.cd.detectChanges();
        },
        error: () => {
          this.settingsLoading = false;
          this.cd.detectChanges();
        },
      });
  }

  /** Join every market with its fuel-management node (sites, codes, limits), when it's in fuel management. */
  private applySettingsMarkets(): void {
    this.settingsMarkets = this.allMarkets.map((m) => ({ ...m, node: this.marketById(m.id) }));
  }

  /** The Settings page's fuel-management switch: write the market's flag, then reload what depends on it. */
  onFuelManagementChange(e: { market: SettingsMarket; on: boolean }): void {
    const s = this.settings;
    this.settingsSaving = true;
    this.ctx.attributeService
      .saveEntityAttributes(
        { entityType: EntityType.ASSET, id: e.market.id },
        AttributeScope.SERVER_SCOPE,
        [{ key: s.fuelManagementKey, value: e.on }],
        { ignoreLoading: true, ignoreErrors: true }
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.settingsSaving = false;
          this.toasts.success(`${e.market.name} ${e.on ? "added to" : "removed from"} fuel management`);
          this.loadAllMarkets();
          this.loadHierarchy();
        },
        error: (err) => {
          this.settingsSaving = false;
          this.toasts.error(`Couldn't update ${e.market.name}${this.apiMessage(err)}`);
          this.applySettingsMarkets(); // the switch back to what's saved
          this.cd.detectChanges();
        },
      });
  }

  /**
   * The Settings page's "push again" button: send a market's user / vehicle
   * list to each of its stations (PLCs) once more — the list into the PLC's
   * SHARED code-list attribute with its transfer-request flag set, which is
   * what the backend writes when the list changes; the gateway then loads it
   * into the PLC (its transfer flag shows "Updating" meanwhile).
   */
  onRepushCodes(e: { market: SettingsMarket; kind: CodeKind }): void {
    this.repushCodes(e.market, e.kind, this.plcs.filter((p) => p.marketId === e.market.id));
  }

  /** The station panel's ⟲ beside its codes: that list to this station only. */
  onStationStatAction(e: { id: string }): void {
    const st = this.selectedStation;
    const market = st ? this.marketById(st.marketId) : null;
    const kind: CodeKind | null = e.id === "repush:users" ? "users" : e.id === "repush:vehicles" ? "vehicles" : null;
    if (!st || !kind) {
      return;
    }
    if (!market) {
      this.toasts.warn(`${st.name} isn't in a fuel-management market.`);
      return;
    }
    this.repushCodes(market, kind, [st.plc]);
  }

  /** The repush action of a station figure (disabled while one is running). */
  private repushAction(kind: CodeKind): StatAction {
    return { id: `repush:${kind}`, icon: "history", label: "Repush", disabled: this.settingsSaving };
  }

  /** Send a market's user / vehicle list to the given stations once more (see {@link onRepushCodes}). */
  private repushCodes(market: { id: string; name: string }, kind: CodeKind, plcs: PlcRow[]): void {
    const s = this.settings;
    if (!plcs.length) {
      this.toasts.warn(`${market.name} has no stations to push to.`);
      return;
    }
    const listKey = codeAssetConfig(s, kind).listKey;
    const requestKey = kind === "users" ? s.userCodesXferRequestKey : s.vehicleCodesXferRequestKey;
    const cfg = { ignoreLoading: true, ignoreErrors: true };
    const label = codeKindLabel(kind, true).toLowerCase();
    this.settingsSaving = true;
    this.ctx.attributeService
      .getEntityAttributes({ entityType: EntityType.ASSET, id: market.id }, AttributeScope.SERVER_SCOPE, [listKey], cfg)
      .pipe(
        switchMap((attrs) => {
          const list = attrs.find((a) => a.key === listKey)?.value;
          if (list == null || list === "") {
            return throwError(() => new Error(`${market.name} has no ${label} code list yet.`));
          }
          return forkJoin(
            plcs.map((plc) =>
              this.ctx.attributeService
                .saveEntityAttributes(
                  { entityType: EntityType.DEVICE, id: plc.plcId },
                  AttributeScope.SHARED_SCOPE,
                  [
                    { key: listKey, value: list },
                    { key: requestKey, value: true },
                  ],
                  cfg
                )
                .pipe(
                  map(() => true),
                  catchError(() => of(false))
                )
            )
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (results) => {
          this.settingsSaving = false;
          const sent = results.filter(Boolean).length;
          const names = plcs.map((p) => p.name).join(", ");
          if (sent === results.length) {
            this.toasts.success(`${market.name}'s ${label} codes sent to ${sent === 1 ? names : `${sent} stations`}`);
          } else if (sent) {
            this.toasts.warn(`${market.name}'s ${label} codes sent to ${sent} of ${results.length} stations.`);
          } else {
            this.toasts.error(`Couldn't send ${market.name}'s ${label} codes to ${names}.`);
          }
          this.cd.detectChanges();
        },
        error: (err) => {
          this.settingsSaving = false;
          this.toasts.error(`Couldn't push the ${label} codes${this.apiMessage(err)}`);
          this.cd.detectChanges();
        },
      });
  }

  /** The Settings page's Pumps table: the pump panel on its Settings tab. */
  onSettingsPump(pump: PumpRow): void {
    this.closeStation();
    this.openPump(pump, "settings");
  }

  /** The Settings page's Stations table: the station panel. */
  onSettingsStation(plc: PlcRow): void {
    const row = this.stationRows.find((r) => r.rowKey === plc.plcId);
    if (row) {
      this.onStationRowClick(row);
    }
  }

  /**
   * The Stations table: one row per PLC in the location filter's scope (the
   * PLC's own site / market — the filter counts stations), with its pumps for
   * its panel. A PLC's pumps are the pumps on its gateway: the one that created
   * each device ("Created" relation), else the one it last connected through;
   * on a gateway with several PLCs a pump goes to the one at its site, else the
   * first by name. A pump on no station's gateway isn't listed.
   */
  private applyStations(): void {
    const gatewayOf = (id: string, last: string) => this.createdBy.get(id) ?? last;
    const sel = new Set(this.selectedLocations);
    const inScope = (p: PlcRow) => !sel.size || (!!p.siteId && sel.has(p.siteId)) || (!!p.marketId && sel.has(p.marketId));
    const plcsByGateway = new Map<string, PlcRow[]>();
    for (const plc of this.plcs) {
      const gw = gatewayOf(plc.plcId, plc.lastGatewayId);
      if (gw) {
        plcsByGateway.set(gw, [...(plcsByGateway.get(gw) ?? []), plc]);
      }
    }
    const pumpsOf = new Map<string, PumpRow[]>();
    for (const pump of this.pumps) {
      const candidates = plcsByGateway.get(gatewayOf(pump.pumpId, pump.lastGatewayId)) ?? [];
      const plc = candidates.find((c) => !!c.siteId && c.siteId === pump.siteId) ?? candidates[0];
      if (plc) {
        pumpsOf.set(plc.plcId, [...(pumpsOf.get(plc.plcId) ?? []), pump]);
      }
    }
    this.stationRows = this.plcs
      .filter(inScope)
      .map((plc) => {
        const pumps = pumpsOf.get(plc.plcId) ?? [];
        const market = this.marketById(plc.marketId) ?? this.marketById(pumps[0]?.marketId ?? "");
        const latest = Math.max(0, ...pumps.map((p) => p.lastDispenseTs ?? 0)) || null;
        return {
          rowKey: plc.plcId,
          name: plc.name,
          site: plc.site || pumps[0]?.site || "",
          market: market?.name ?? "",
          marketId: market?.id ?? "",
          // Its codes are its market's, against the market's limits — the
          // strictest of the market's stations, so a market with one station
          // shows that station's own capacity.
          userCodes: market?.codes.users.length ?? 0,
          userCodeLimit: market?.limits.users ?? plc.limits.users,
          vehicleCodes: market?.codes.vehicles.length ?? 0,
          vehicleCodeLimit: market?.limits.vehicles ?? plc.limits.vehicles,
          status: plcStatusMeta(plc),
          lastDispense: formatWhen(latest),
          plc,
          pumps,
        };
      });
    this.applyGateways();
    // Keep the open panel on the refreshed station (closed when it's gone).
    if (this.selectedStation) {
      const updated = this.stationRows.find((r) => r.rowKey === this.selectedStation!.rowKey);
      if (updated) {
        this.selectedStation = updated;
      } else {
        this.closeStation();
      }
    }
    this.applyAlarmScope();
  }

  /** A station's user / vehicle code count: the Codes page, filtered to its market and that list. */
  onStationCodesClick(event: Event, row: StationTableRow, kind: CodeKind): void {
    event.stopPropagation(); // not the row's expand / collapse
    if (row.marketId) {
      this.codeMarkets = [row.marketId];
    }
    this.page = "codes";
    this.selectView(CODES_VIEW[kind]);
  }

  /** The assign panel's PLCs: those located in its market. */
  private applyAssignPlcs(): void {
    this.assignPlcs = this.plcs.filter((p) => p.marketId === this.assignMarketId);
  }

  private get plcFilter(): EntityFilter {
    return { type: AliasFilterType.deviceType, deviceTypes: this.settings.plcDeviceTypes, deviceNameFilter: "" };
  }

  /** Live subscription over the PLCs' online state and transfer flags; a change reloads them (debounced). */
  private subscribePlcs(): void {
    const s = this.settings;
    const attr = (key: string) => ({ name: key, label: key, type: DataKeyType.attribute, settings: {} });
    const datasources: Datasource[] = [
      {
        type: DatasourceType.entity,
        name: "plcs",
        entityFilter: this.plcFilter,
        // Any-scope keys: a shared or client code-list change reloads the PLCs too.
        dataKeys: [attr("active"), attr(s.userCodesXferKey), attr(s.vehicleCodesXferKey), attr(s.userCodesKey), attr(s.vehicleCodesKey)],
      },
    ];
    let firstEmission = true;
    const options: WidgetSubscriptionOptions = {
      type: widgetType.latest,
      datasources,
      callbacks: {
        onDataUpdated: () => {
          if (firstEmission) {
            firstEmission = false;
            return;
          }
          clearTimeout(this.plcsRefreshTimer);
          this.plcsRefreshTimer = setTimeout(() => this.loadPlcs(), 300);
        },
      },
    };
    this.ctx.subscriptionApi
      .createSubscription(options, true)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((sub) => (this.plcsSubscription = sub));
  }

  /** Scope pumps, codes, activity and alarms to the selected sites / markets. */
  private applyFilters(): void {
    const sel = new Set(this.selectedLocations);
    const inLocation = (p: PumpRow) => !sel.size || (!!p.siteId && sel.has(p.siteId)) || (!!p.marketId && sel.has(p.marketId));
    this.visiblePumps = this.pumps.filter(inLocation);
    this.applyStations();
    this.applyActivityFilter();
    this.buildSidebarFilters();
    this.applyAlarmScope();
  }

  /**
   * The Sites tree. On Stations it is counted by stations (PLCs). On Activity it counts
   * station events of the event types picked (faceted, like UniFi): a site by
   * its pumps' events, a market by its sites'. (The filter greys out a 0 count
   * itself, unless it's picked.)
   */
  private buildSidebarFilters(): void {
    const byLabel = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label, undefined, { numeric: true });
    this.reportLocationOptions = this.buildPumpLocationOptions();
    if (this.view !== "activity") {
      this.locationOptions = this.buildLocationOptions();
      return;
    }
    // Station events of the picked types, counted per pump.
    const groups = new Set(this.activityGroups);
    const perPump = new Map<string, number>();
    this.stationEvents
      .filter((e) => !groups.size || groups.has(e.group))
      .forEach((e) => perPump.set(e.pumpId, (perPump.get(e.pumpId) ?? 0) + 1));

    // Sites: a site = its pumps' events; a market = its sites'.
    const perSite = new Map<string, number>();
    this.pumps.forEach((p) => p.siteId && perSite.set(p.siteId, (perSite.get(p.siteId) ?? 0) + (perPump.get(p.pumpId) ?? 0)));
    this.locationOptions = this.markets
      .map((m) => {
        const children = m.sites
          .map((site) => ({ id: site.id, label: site.name, count: perSite.get(site.id) ?? 0 }))
          .sort(byLabel);
        const total = children.reduce((n, c) => n + c.count, 0);
        return { id: m.id, label: m.name, count: total, children };
      })
      .sort(byLabel);
  }

  /**
   * The location filter tree (the Stations tab): each fuel-management market
   * (parent) with its fuel-management sites (children), counted by the
   * stations (PLCs) at them — a market also counts the PLCs linked straight
   * from it. A market without sites is a selectable leaf of its own.
   */
  private buildLocationOptions(): FilterListOption[] {
    const perSite = new Map<string, number>();
    const perMarket = new Map<string, number>();
    for (const plc of this.plcs) {
      if (plc.siteId) {
        perSite.set(plc.siteId, (perSite.get(plc.siteId) ?? 0) + 1);
      } else if (plc.marketId) {
        perMarket.set(plc.marketId, (perMarket.get(plc.marketId) ?? 0) + 1);
      }
    }
    const byName = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label, undefined, { numeric: true });
    return this.markets
      .map((m) => {
        const children = m.sites.map((site) => ({ id: site.id, label: site.name, count: perSite.get(site.id) ?? 0 })).sort(byName);
        const own = perMarket.get(m.id) ?? 0;
        return { id: m.id, label: m.name, count: children.reduce((n, c) => n + c.count, 0) + own, children };
      })
      .sort(byName);
  }

  /**
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
        return { id: m.id, label: m.name, count: children.reduce((n, c) => n + c.count, 0), children };
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
    const countOf = (m: MarketNode) =>
      onActivity ? changes.filter((e) => e.pumpId === m.id && ofType(e)).length : kinds.reduce((n, k) => n + m.codes[k].length, 0);
    this.marketOptions = markets.map((m) => ({ id: m.id, label: m.name, count: countOf(m) }));
    const scopedChanges = changes.filter((e) => scopeIds.has(e.pumpId));
    this.codeTypeOptions = CODE_KINDS.map((k) => ({
      id: k.id,
      label: k.label,
      count: onActivity
        ? scopedChanges.filter((e) => e.codeKind === k.id).length
        : inScope.reduce((n, m) => n + m.codes[k.id].length, 0),
    }));
    this.codeActivityRows = scopedChanges.filter(ofType);
    // The open tab's list across the markets in the filter, newest first.
    this.codeRows = inScope
      .flatMap((m) => kinds.flatMap((k) => m.codes[k].map((c) => toAccessCodeRow(c, k, m))))
      .sort((a, b) => (b.source.createdAt || 0) - (a.source.createdAt || 0));
    // Auto-sized like the Pumps table: column widths follow their content (the tab names the type).
    this.codeColumns = [
      { key: "code", header: "Code", copyable: true },
      { key: "name", header: "Holder" },
      { key: "market", header: "Market" },
      { key: "added", header: "Added" },
      // The row Revoke button — not while managing (the checkboxes and "Revoke" in the footer take over).
      ...(this.codesManaging ? [] : [{ key: "actions", header: "", align: "right" as const }]),
    ];
  }

  /** Each market's limits: the strictest of the stations (PLCs) located in it — never the pumps'. */
  private applyMarketLimits(): void {
    const fallback = this.settings.maxCodesPerStation;
    this.markets = this.markets.map((m) => ({
      ...m,
      limits: strictestCodeLimits(
        this.plcs.filter((p) => p.marketId === m.id).map((p) => p.limits),
        fallback
      ),
    }));
  }

  /** Replace one of a market's code lists (after a save) and refresh everything derived from it. */
  private patchMarketCodes(marketId: string, kind: CodeKind, list: AccessCode[]): void {
    this.markets = this.markets.map((m) => (m.id === marketId ? { ...m, codes: { ...m.codes, [kind]: list } } : m));
    this.pumps = this.pumps.map((p) => this.locate(p));
    this.applyFilters();
    this.applyCodes();
    this.refreshSelectedPump();
  }

  /**
   * Load the Market → Site → Pump hierarchy:
   * 1. markets: assets of {@link FuelDashboardSettings.marketAssetType} whose
   *    `fuelManagement` server attribute is true;
   * 2. per market, two calls side by side — (a) one relation search two levels
   *    deep for the structure: Market → asset over
   *    {@link FuelDashboardSettings.siteRelation} ("FuelSite") and asset → device
   *    over {@link FuelDashboardSettings.pumpRelation} ("FuelPump") and
   *    {@link FuelDashboardSettings.plcRelation} ("FuelPLC"); (b) one entity
   *    query for the market's related assets one level out — its sites and its
   *    code assets over the user / vehicle code relations ("FuelUser" /
   *    "FuelVehicle") — with their names, labels, types and creation times.
   *    (The code assets are deliberately kept out of the relation search: a
   *    relation search over hundreds of them takes seconds, the entity query
   *    half a second.)
   * 3. the market's FuelSite assets are its sites — the relation alone decides
   *    (no asset-type or attribute check);
   * 4. each site's FuelPump devices → the pump's location (pumps not of
   *    the pump profile never appear in the table, so they're ignored), and
   *    each site's (or the market's own) FuelPLC devices → the PLC's location;
   * 5. each code asset → an {@link AccessCode} on its market's user / vehicle
   *    list, by its asset type.
   * Each level is also matched on its relation type client-side, so a FuelPump
   * straight from a market (or a FuelSite under a site) is never mistaken for
   * the other level.
   * The markets' flag is checked client-side so it matches whether stored as a
   * boolean or the string "true".
   */
  private loadHierarchy(): void {
    const s = this.settings;
    const cfg = { ignoreLoading: true, ignoreErrors: true };
    const flagOn = (d: any) => parseBool(d.latest?.[EntityKeyType.SERVER_ATTRIBUTE]?.[s.fuelManagementKey]?.value);
    const nameOf = (d: any) => {
      const f = d.latest?.[EntityKeyType.ENTITY_FIELD] ?? {};
      return String(f["label"]?.value || f["name"]?.value || "");
    };
    const assetFields = [
      { type: EntityKeyType.ENTITY_FIELD, key: "name" },
      { type: EntityKeyType.ENTITY_FIELD, key: "label" },
      { type: EntityKeyType.ENTITY_FIELD, key: "type" },
    ];
    const marketsQuery: EntityDataQuery = {
      entityFilter: { type: AliasFilterType.assetType, assetTypes: [s.marketAssetType], assetNameFilter: "" },
      entityFields: assetFields,
      latestValues: [{ type: EntityKeyType.SERVER_ATTRIBUTE, key: s.fuelManagementKey }],
      pageLink: { pageSize: 1024, page: 0 },
    };
    const userCodes = codeAssetConfig(s, "users");
    const vehicleCodes = codeAssetConfig(s, "vehicles");
    /** Market -FuelSite→ asset: one of the market's sites. */
    const isSiteLink = (r: EntityRelation, marketId: string) =>
      r.type === s.siteRelation && r.from?.id === marketId && r.to?.entityType === EntityType.ASSET;
    /** A code asset's list, by its asset type (FuelUser / FuelVehicle); null for anything else (a site). */
    const kindOfType = (type: string): CodeKind | null => (type === userCodes.type ? "users" : type === vehicleCodes.type ? "vehicles" : null);
    /** A market's related assets (its sites and code assets), as the entity query returns them. */
    interface RelatedAsset {
      id: string;
      name: string;
      label: string;
      type: string;
      createdTime: number;
    }
    const relatedAssetsQuery = (marketId: string): EntityDataQuery => ({
      entityFilter: {
        type: AliasFilterType.relationsQuery,
        rootEntity: { entityType: EntityType.ASSET, id: marketId },
        direction: EntitySearchDirection.FROM,
        maxLevel: 1,
        fetchLastLevelOnly: false,
        filters: [
          { relationType: s.siteRelation, entityTypes: [EntityType.ASSET] },
          { relationType: userCodes.relation, entityTypes: [EntityType.ASSET] },
          { relationType: vehicleCodes.relation, entityTypes: [EntityType.ASSET] },
        ],
      } as EntityFilter,
      entityFields: [...assetFields, { type: EntityKeyType.ENTITY_FIELD, key: "createdTime" }],
      pageLink: { pageSize: 1024, page: 0 },
    });
    this.ctx.entityService
      .findEntityDataByQuery(marketsQuery, cfg)
      .pipe(
        map((page) => page.data.filter(flagOn).map((d) => ({ id: d.entityId.id, name: nameOf(d) }))),
        switchMap((markets) =>
          markets.length
            ? forkJoin(
                markets.map((market) =>
                  forkJoin({
                    // (a) Market -FuelSite→ site -FuelPump / FuelPLC→ device (and Market -FuelPLC→ device).
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
                            { relationType: s.siteRelation, entityTypes: [EntityType.ASSET] },
                            { relationType: s.pumpRelation, entityTypes: [EntityType.DEVICE] },
                            { relationType: s.plcRelation, entityTypes: [EntityType.DEVICE] },
                          ],
                        },
                        cfg
                      )
                      .pipe(catchError(() => of([] as EntityRelation[]))),
                    // (b) its sites and code assets, named.
                    assets: this.ctx.entityService.findEntityDataByQuery(relatedAssetsQuery(market.id), cfg).pipe(
                      map((page) =>
                        page.data.map((d): RelatedAsset => {
                          const f = d.latest?.[EntityKeyType.ENTITY_FIELD] ?? {};
                          return {
                            id: d.entityId.id,
                            name: String(f["name"]?.value ?? ""),
                            label: String(f["label"]?.value ?? ""),
                            type: String(f["type"]?.value ?? ""),
                            createdTime: Number(f["createdTime"]?.value) || 0,
                          };
                        })
                      ),
                      catchError(() => of([] as RelatedAsset[]))
                    ),
                  }).pipe(map(({ relations, assets }) => ({ market, relations, assets })))
                )
              )
            : of([] as { market: Pick<MarketNode, "id" | "name">; relations: EntityRelation[]; assets: RelatedAsset[] }[])
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (perMarket) => {
          const locations = new Map<string, PumpLocation>();
          const plcLocations = new Map<string, PumpLocation>();
          this.markets = perMarket.map(({ market, relations, assets }) => {
            const byId = new Map(assets.map((a) => [a.id, a] as [string, RelatedAsset]));
            const siteName = (id: string) => {
              const a = byId.get(id);
              return a ? a.label || a.name : "";
            };
            const codes: MarketCodes = { users: [], vehicles: [] };
            for (const a of assets) {
              const kind = kindOfType(a.type);
              if (kind && !codes[kind].some((c) => c.assetId === a.id)) {
                codes[kind].push({ assetId: a.id, code: codeFromAssetName(a.name, codeAssetConfig(s, kind).prefix), name: a.label, createdAt: a.createdTime });
              }
            }
            codes.users.sort((x, y) => x.createdAt - y.createdAt);
            codes.vehicles.sort((x, y) => x.createdAt - y.createdAt);
            const siteIds = [...new Set(relations.filter((r) => isSiteLink(r, market.id) && byId.has(r.to.id)).map((r) => r.to.id as string))];
            for (const r of relations) {
              // Site -FuelPump→ device: the device's location (first market/site wins).
              if (r.type === s.pumpRelation && siteIds.includes(r.from?.id) && r.to?.entityType === EntityType.DEVICE && !locations.has(r.to.id)) {
                locations.set(r.to.id, { siteId: r.from.id, siteName: siteName(r.from.id), marketId: market.id, marketName: market.name });
              }
              // Site -FuelPLC→ device, or Market -FuelPLC→ device: the PLC's location (a site link wins).
              if (r.type === s.plcRelation && r.to?.entityType === EntityType.DEVICE && !plcLocations.get(r.to.id)?.siteId) {
                if (siteIds.includes(r.from?.id)) {
                  plcLocations.set(r.to.id, { siteId: r.from.id, siteName: siteName(r.from.id), marketId: market.id, marketName: market.name });
                } else if (r.from?.id === market.id && !plcLocations.has(r.to.id)) {
                  plcLocations.set(r.to.id, { siteId: "", siteName: "", marketId: market.id, marketName: market.name });
                }
              }
            }
            return {
              id: market.id,
              name: market.name,
              codes,
              sites: siteIds.map((id) => ({ id, name: siteName(id) })),
              limits: strictestCodeLimits([], s.maxCodesPerStation), // set from its stations just below
            };
          });
          this.pumpLocations = locations;
          this.plcLocations = plcLocations;
          this.marketsLoading = false;
          this.pumps = this.pumps.map((p) => this.locate(p));
          this.plcs = this.plcs.map((p) => this.locatePlc(p));
          this.applyMarketLimits();
          this.applyFilters(); // (re)builds the Stations table with the PLCs' sites
          this.applyCodes();
          this.applyAssignPlcs();
          this.applySettingsMarkets();
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
      this.selectedPump = updated;
      this.syncDetailInputs();
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
        keys: [{ name: s.dispenseVolumeKey, label: "Dispensed", color: "var(--c-chart-1)" }],
      },
    ];
    this.fuelTypeSelects = [
      {
        key: s.fuelTypeKey,
        label: "Fuel type",
        options: ["Diesel", "Unleaded", "Premium", "DEF"].map((v) => ({ value: v, label: v })),
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
    const attr = (key: string) => ({ name: key, label: key, type: DataKeyType.attribute, settings: {} });
    const series = (key: string) => ({ name: key, label: key, type: DataKeyType.timeseries, settings: {} });
    const datasources: Datasource[] = [
      {
        type: DatasourceType.entity,
        name: "pumps",
        entityFilter: this.pumpFilter,
        dataKeys: [
          attr("active"),
          attr(s.siteKey),
          attr(s.fuelTypeKey),
          attr(s.lockedKey),
          // Any-scope keys: a shared or client code-list change reloads the pumps.
          attr(s.userCodesKey),
          attr(s.vehicleCodesKey),
          series(s.dispenseVolumeKey),
          series(s.eventKey),
        ],
      },
    ];
    let firstEmission = true;
    const options: WidgetSubscriptionOptions = {
      type: widgetType.latest,
      datasources,
      callbacks: {
        onDataUpdated: () => {
          if (firstEmission) {
            firstEmission = false;
            return;
          }
          clearTimeout(this.pumpsRefreshTimer);
          this.pumpsRefreshTimer = setTimeout(() => this.loadPumps(), 300);
          if (this.activityLoaded) {
            this.scheduleActivityRefresh();
          }
        },
      },
    };
    this.ctx.subscriptionApi
      .createSubscription(options, true)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((sub) => (this.pumpsSubscription = sub));
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
    const cfg = { ignoreLoading: true, ignoreErrors: true };
    const sources = [
      ...this.pumps.map((p) => ({ entityType: EntityType.DEVICE, id: p.pumpId, label: p.shortName })),
      ...this.markets.map((m) => ({ entityType: EntityType.ASSET, id: m.id, label: m.name })),
    ];
    const calls: Observable<ActivityRow[]>[] = sources.map((src) =>
      this.ctx.attributeService
        .getEntityTimeseries({ entityType: src.entityType, id: src.id }, [this.settings.eventKey], start, end, 500, undefined, undefined, undefined, undefined, cfg)
        .pipe(
          map((data: any) => (data?.[this.settings.eventKey] ?? []).map((pt: any) => this.toActivityRow(src, pt.ts, pt.value)).filter(Boolean) as ActivityRow[]),
          catchError(() => of([] as ActivityRow[]))
        )
    );
    (calls.length ? forkJoin(calls) : of([] as ActivityRow[][]))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((perPump) => {
        this.allEvents = perPump.flat().sort((a, b) => b.ts - a.ts);
        this.activityLoading = false;
        this.applyFilters();
        this.applyCodes(); // the Codes page's Activity
        this.cd.detectChanges();
      });
  }

  /** One event of a pump (labelled by its short name) or a market (by its name). */
  private toActivityRow(src: { id: string; label: string }, ts: number, raw: unknown): ActivityRow | null {
    const e = parsePumpEvent(raw);
    if (!e) {
      return null;
    }
    const meta = EVENT_META[e.type];
    return {
      id: `${src.id}-${ts}`,
      ts,
      time: formatWhen(ts),
      type: e.type,
      label: meta.label,
      icon: meta.icon,
      tone: meta.tone,
      group: meta.group,
      pumpId: src.id,
      pump: src.label,
      description: eventDescription(e) || "—",
      codeKind: meta.group === "codes" ? (e.vehicleCode ? "vehicles" : e.userCode ? "users" : null) : null,
    };
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
    this.activityRows = groups.size ? scoped.filter((e) => groups.has(e.group)) : scoped;
  }

  private scheduleActivityRefresh(): void {
    clearTimeout(this.activityRefreshTimer);
    this.activityRefreshTimer = setTimeout(() => this.loadActivity(), 1000);
  }

  /** Download events as CSV, named `<name>-<date>.csv`. */
  private exportActivityCsv(rows: ActivityRow[], name: string): void {
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [
      ["Time", "Event", "Entity", "Description"].join(","),
      ...rows.map((r) => [new Date(r.ts).toISOString(), r.label, r.pump, r.description].map((v) => esc(v)).join(",")
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // -- data: alarms ---------------------------------------------------------------------

  /**
   * Live alarm subscription over the pumps (active alarms only). A REALTIME
   * window keeps it streaming; the wide interval surfaces alarms of any age.
   */
  private subscribeAlarms(): void {
    this.alarmsLoading = true;
    const alarmSource: Datasource = {
      type: DatasourceType.entity,
      name: "alarms",
      // The pumps' and the PLCs' alarms.
      entityFilter: {
        type: AliasFilterType.deviceType,
        deviceTypes: [...this.settings.pumpDeviceTypes, ...this.settings.plcDeviceTypes],
        deviceNameFilter: "",
      },
      dataKeys: [
        { name: "createdTime", label: "createdTime", type: DataKeyType.alarm, settings: {} },
        { name: "type", label: "type", type: DataKeyType.alarm, settings: {} },
        { name: "severity", label: "severity", type: DataKeyType.alarm, settings: {} },
      ],
    };
    const tenYearsMs = 10 * 365 * 24 * 60 * 60 * 1000;
    const options: WidgetSubscriptionOptions = {
      type: widgetType.alarm,
      alarmSource,
      useDashboardTimewindow: false,
      timeWindowConfig: {
        selectedTab: TimewindowType.REALTIME,
        realtime: { realtimeType: RealtimeWindowType.LAST_INTERVAL, timewindowMs: tenYearsMs },
      },
      callbacks: {
        onDataUpdated: (subscription) => this.onAlarmsUpdated(subscription),
      },
    };
    this.ctx.subscriptionApi
      .createSubscription(options, false)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((subscription) => {
        this.alarmsSubscription = subscription;
        subscription.subscribeForAlarms(
          {
            pageSize: 1024,
            page: 0,
            sortOrder: { key: { type: EntityKeyType.ALARM_FIELD, key: "createdTime" }, direction: Direction.DESC },
            searchPropagatedAlarms: true,
            typeList: [],
            statusList: [AlarmSearchStatus.ACTIVE],
            severityList: [],
          },
          null
        );
      });
  }

  private onAlarmsUpdated(subscription: any): void {
    this.allAlarms = (subscription?.alarms?.data ?? []).map((a: any) => {
      const raw = a.details?.data;
      return {
        id: a.id?.id ?? a.id,
        createdTime: a.createdTime,
        originatorId: a.originator?.id ?? a.originatorId ?? "",
        originatorName: a.originatorDisplayName || a.originatorLabel || a.originatorName || "",
        type: a.type,
        severity: a.severity,
        cleared: !!(a.cleared ?? a.clearTs > 0),
        detailsData: raw == null ? "" : typeof raw === "object" ? JSON.stringify(raw) : String(raw),
      } as AlarmListItem;
    });
    this.alarmsLoading = false;
    this.applyAlarmScope();
    this.cd.detectChanges();
  }

  /**
   * Alarms of the visible pumps and stations' PLCs (named by display name over
   * their customer), of the selected pump, and of the selected station (its
   * PLC and pumps).
   */
  private applyAlarmScope(): void {
    const names = new Map<string, { name: string; owner: string }>([
      ...this.visiblePumps.map((p) => [p.pumpId, { name: p.name, owner: p.owner }] as [string, { name: string; owner: string }]),
      ...this.stationRows.map((s) => [s.rowKey, { name: s.name, owner: s.plc.owner }] as [string, { name: string; owner: string }]),
    ]);
    const named = (a: AlarmListItem) => {
      const d = names.get(a.originatorId);
      return { ...a, originatorName: d?.name ?? a.originatorName, originatorSub: d?.owner ?? "" };
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
   * Edit the market's user / vehicle code-list SERVER attribute (its allowed
   * codes): read the current value, apply `edit`, write the result back — no
   * write when `edit` returns null (nothing changed). Reading first keeps edits
   * made elsewhere since the dashboard loaded.
   */
  private updateMarketList(marketId: string, kind: CodeKind, edit: (raw: unknown) => unknown): Observable<unknown> {
    const key = codeAssetConfig(this.settings, kind).listKey;
    const entityId = { entityType: EntityType.ASSET, id: marketId };
    const cfg = { ignoreLoading: true, ignoreErrors: true };
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
      .post(`/api/plugins/telemetry/ASSET/${marketId}/timeseries/ANY`, body, defaultHttpOptionsFromConfig({ ignoreLoading: true, ignoreErrors: true }))
      .pipe(catchError(() => of(null)));
  }

  // -- misc ------------------------------------------------------------------------------

  private loadUserPreferences(): void {
    this.ctx.userSettingsService
      .loadUserSettings()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((settings: any) => {
        this.darkMode = !!settings?.[this.themeSettingKey];
        this.cd.detectChanges();
      });
  }

  private parseDescription(raw: any): string {
    if (!raw) {
      return "";
    }
    try {
      return JSON.parse(raw)?.description ?? "";
    } catch {
      return "";
    }
  }
}
