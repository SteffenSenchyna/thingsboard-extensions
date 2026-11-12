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

import { ChangeDetectorRef, Component, DestroyRef, Input, OnDestroy, OnInit, ViewChild } from "@angular/core";
import { CommonModule } from "@angular/common";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { forkJoin, from, Observable, of } from "rxjs";
import { catchError, map, mergeMap, switchMap, toArray } from "rxjs/operators";
import { WidgetSubscriptionOptions } from "@core/public-api";
import type { AlarmService } from "@core/http/alarm.service";
import {
  AggregationType,
  AliasFilterType,
  AttributeData,
  AttributeScope,
  DataKeyType,
  Datasource,
  DatasourceType,
  Device,
  DeviceCredentials,
  DeviceCredentialsType,
  EntityDataQuery,
  EntityRelation,
  RelationTypeGroup,
  EntityFilter,
  EntityId,
  EntityKeyType,
  EntityKeyValueType,
  EntityType,
  FilterPredicateType,
  KeyFilter,
  SharedModule,
  StringOperation,
  widgetType,
} from "@shared/public-api";
import { WidgetContext } from "@home/models/widget-component.models";
import { injectCss } from "../../../components/shared/cdn-loader";
import { CountMarkComponent } from "../../../components/shared/count-mark/count-mark.component";
import { BarChartComponent, BarChartSeries } from "../../../components/shared/bar-chart/bar-chart.component";
import { formatClockTime, formatWhen, relativeTime } from "../../../components/shared/time-format";
import { downloadCsv } from "../../../components/shared/csv";
import { AlarmListComponent, AlarmListItem } from "../../../components/shared/alarm-list/alarm-list.component";
import { AlarmPanelComponent } from "../../../components/shared/alarm-panel/alarm-panel.component";
import { OWNER_ENTITY_FIELDS, ownerCustomer, ownerIsTenant } from "../../../components/shared/entity-owner";
import { CheckFilterComponent } from "../../../components/shared/check-filter/check-filter.component";
import { ColumnPickerComponent } from "../../../components/shared/column-picker/column-picker.component";
import { TableColumnChoice, sidebarWidth } from "../../../components/shared/dashboard/table-columns";
import { SettingsSidebarComponent, settingsSidebarWidth } from "../../../components/shared/settings-sidebar/settings-sidebar.component";
import { CollapsibleCardComponent } from "../../../components/shared/collapsible-card/collapsible-card.component";
import { CopyBoxComponent } from "../../../components/shared/copy-box/copy-box.component";
import { ConfirmDialogComponent } from "../../../components/shared/confirm-dialog/confirm-dialog.component";
import { DateRangePickerComponent, TbDateRange } from "../../../components/shared/date-range-picker/date-range-picker.component";
import { DialogComponent } from "../../../components/shared/dialog/dialog.component";
import { DataTableCellDirective, DataTableColumn, DataTableComponent, DataTableSort } from "../../../components/shared/data-table/data-table.component";
import { TableLinksComponent } from "../../../components/shared/table-links/table-links.component";
import { tableManageOf } from "../../../components/shared/data-table/table-manage";
import { DeviceSettingsCardComponent } from "../../../components/shared/device-settings-card/device-settings-card.component";
import { EntityDetailPanelComponent } from "../../../components/shared/entity-detail-panel/entity-detail-panel.component";
import { FilterListComponent, FilterListOption } from "../../../components/shared/filter-list/filter-list.component";
import { FilterSectionComponent } from "../../../components/shared/filter-section/filter-section.component";
import { FilterSectionsComponent } from "../../../components/shared/filter-sections/filter-sections.component";
import { MetricChartCardComponent, MetricChartSection } from "../../../components/shared/metric-chart-card/metric-chart-card.component";
import { NavRailComponent, NavRailItem } from "../../../components/shared/nav-rail/nav-rail.component";
import { DashboardLoadingComponent, FirstLoad } from "../../../components/shared/dashboard-loading/dashboard-loading.component";
import { SectionNavComponent, SectionNavItem } from "../../../components/shared/section-nav/section-nav.component";
import { SegmentedControlComponent, SegmentOption } from "../../../components/shared/segmented-control/segmented-control.component";
import { SelectComponent, TbSelectOption } from "../../../components/shared/select/select.component";
import { SidebarLayoutComponent } from "../../../components/shared/sidebar-layout/sidebar-layout.component";
import { StatGridComponent, StatItem } from "../../../components/shared/stat-grid/stat-grid.component";
import { StateTimelineComponent, StateTimelineState } from "../../../components/shared/state-timeline/state-timeline.component";
import { StatusPillComponent } from "../../../components/shared/status-pill/status-pill.component";
import { SearchBoxComponent } from "../../../components/shared/search-box/search-box.component";
import { SummaryCard, SummaryCardsComponent } from "../../../components/shared/summary-cards/summary-cards.component";
import { SwitchComponent } from "../../../components/shared/switch/switch.component";
import { TagPickerComponent, TagPickerOption } from "../../../components/shared/tag-picker/tag-picker.component";
import { TB_CUSTOM_TIMEFRAME, TimeframePickerComponent } from "../../../components/shared/timeframe-picker/timeframe-picker.component";
import { ToastsComponent, ToastTone } from "../../../components/shared/toasts/toasts.component";
import { FeedbackDialogComponent } from "../../../components/shared/feedback/feedback-dialog/feedback-dialog.component";
import { FEEDBACK_RAIL_ID, feedbackOf } from "../../../components/shared/feedback/feedback.models";
import { ConnectorFormComponent } from "../../components/connector-form/connector-form.component";
import { ConnectorQuickEdit, ConnectorQuickFormComponent, ConnectorQuickState } from "../../components/connector-quick-form/connector-quick-form.component";
import { CustomStatisticsComponent } from "../../components/custom-statistics/custom-statistics.component";
import { DeviceTemplateFormComponent } from "../../components/device-template-form/device-template-form.component";
import { GATEWAY_CONFIG_SECTIONS, GatewayConfigFormComponent, GatewayConfigSection } from "../../components/gateway-config-form/gateway-config-form.component";
import { AddGatewayRequest, GatewayFormComponent } from "../../components/gateway-form/gateway-form.component";
import { GatewayLogsComponent, GatewayRef, LogChannel, LogGateway } from "../../components/gateway-logs/gateway-logs.component";
import { GatewayRpcComponent } from "../../components/gateway-rpc/gateway-rpc.component";
import { GATEWAY_SETTINGS_SECTION_IDS, GATEWAY_SETTINGS_SECTIONS, GatewaySettingsComponent } from "../../components/gateway-settings/gateway-settings.component";
import { GatewayStatisticsComponent } from "../../components/gateway-statistics/gateway-statistics.component";
import { LaunchCardComponent } from "../../components/launch-card/launch-card.component";
import { AssetDraft, organizationKindOf, siteOptionLabel } from "../../../components/shared/organization/organization.models";
import { OrganizationStore } from "../../../components/shared/organization/organization-store";
import { OrganizationSettingsComponent } from "../../../components/shared/organization/organization-settings/organization-settings.component";
import { OrganizationPanelsComponent } from "../../../components/shared/organization/organization-panels/organization-panels.component";
import { AccountSettingsComponent } from "../../../components/shared/account-settings/account-settings.component";
import { Application } from "../../../components/shared/applications/applications.models";
import { ApplicationStore } from "../../../components/shared/applications/application-store";
import { ApplicationSettingsComponent } from "../../../components/shared/applications/application-settings/application-settings.component";
import { ApplicationPanelsComponent } from "../../../components/shared/applications/application-panels/application-panels.component";
import { AccessPage, accessPageOf } from "../../../components/shared/access/access.models";
import { AccessStore } from "../../../components/shared/access/access-store";
import { AccessSettingsComponent } from "../../../components/shared/access/access-settings/access-settings.component";
import { AccessPanelsComponent } from "../../../components/shared/access/access-panels/access-panels.component";
import { AlarmNotificationPanelComponent } from "../../../components/shared/alarm-subscriptions/alarm-notification-panel.component";
import { GatewayBulkDraft, GatewayBulkFormComponent } from "../../components/gateway-bulk-form/gateway-bulk-form.component";
import {
  AssetKind,
  AssetList,
  AssetRow,
  buildLogsConfiguration,
  CONNECTOR_HELP_LINKS,
  CONNECTOR_VIEW_DEFAULT,
  CONNECTOR_VIEW_OPTIONS,
  connectorLogKeys,
  ConnectorRow,
  connectorSynced,
  ConnectorView,
  connectorSyncMeta,
  connectorToSave,
  connectorTypeLabel,
  defaultGatewayConfig,
  DeviceTemplate,
  DeviceTemplateDraft,
  DeviceTemplateSource,
  GATEWAY_CONFIG_HELP,
  GATEWAY_LOG_SOURCES,
  GATEWAY_STATUS_META,
  GATEWAY_STATUS_OPTIONS,
  applicationName,
  GatewayApplication,
  GatewayConfigSecurity,
  GatewayConfigValue,
  GatewayConnector,
  gatewayDashboardDefaultSettings,
  GatewayDashboardSettings,
  GatewayDeviceRow,
  GatewayLogLevel,
  GatewayRow,
  gatewayStatus,
  GatewayStatus,
  lastConnectedGatewayId,
  latestStats,
  parseConnector,
  parseDeviceTemplates,
  parseLogsConfiguration,
  SecurityType,
  STAT_KPIS,
  STAT_METRICS,
  gatewayVersionShares,
} from "../../models/gateway-management.models";
import { DashboardAlarm, alarmsTab, clearDashboardAlarm, countAlarmsByOriginator, subscribeActiveAlarms } from "../../../components/shared/dashboard/dashboard-alarms";
import { dashboardRailItems, DashboardTheme, readUserSettings, saveUserSettings, isTenantAdmin } from "../../../components/shared/dashboard/dashboard-preferences";
import { byNamePageLink, removeSubscriptions, subscribeLatestChanges } from "../../../components/shared/dashboard/dashboard-subscriptions";
import { readDashboardUrlState, watchDashboardUrlState, writeDashboardUrlState } from "../../../components/shared/dashboard/dashboard-url-state";
import {
  DashboardHost,
  NestedDashboard,
  dashboardWidgetSettings,
  nestedSettingsSections,
  nestedUrlParams,
  ownSettingsSections,
  ownsUrlState,
} from "../../../components/shared/dashboard/nested-dashboard";
import { QUIET_REQUEST, apiMessage, fmtNumber, parseDescription, parseNumber, parseObject } from "../../../components/shared/value-utils";
import { DEFAULT_PROFILE_ICON, ProfileIcons, profileIconsOf } from "../../../components/shared/profile-icons/profile-icons";
import { formatDuration, parseStringArray } from "../../models/gateway-utils";

/** The filters column's width (the sidebar's, the column picker closed). */
const SIDEBAR_WIDTH = 300;


/** The sections a gateway page's URL can name (see writeUrlState). */
const GATEWAY_SECTIONS: GatewaySection[] = ["overview", "connectors", "logs", "rpc", "stats", "alarms", "settings"];

/** The gateways table's columns shown by default (every user, until they customise them): no Devices, no Alarms. */
const DEFAULT_GATEWAY_COLUMN_KEYS = [
  "name",
  "deviceName",
  "status",
  "owner",
  "site",
  "market",
  "productLine",
  "version",
  "connectors",
  "errors",
  "lastConnectTime",
  "createdTime",
  "applications",
];

/** An Organization list by the names its assets go by — label, and name (which wins a clash): how a gateway's attributes find them. */
function assetsByRef(rows: AssetRow[]): Map<string, AssetRow> {
  const byRef = new Map<string, AssetRow>();
  for (const a of rows) {
    if (a.label) {
      byRef.set(a.label, a);
    }
  }
  for (const a of rows) {
    byRef.set(a.name, a);
  }
  return byRef;
}

/** A gateway's site, market and product line attributes: the assets' names ("" for none). */
interface GatewayRefs {
  site: string;
  market: string;
  productLine: string;
}

/** An attribute naming an asset: by its name, or its label. */
function namesAsset(ref: string, asset: { name: string; label: string }): boolean {
  return !!ref && (ref === asset.name || (!!asset.label && ref === asset.label));
}

/** Default columns added after users could already save a pick of columns: such a pick (saved without the list of columns it knew) gets them once. */
const GATEWAY_COLUMNS_ADDED_SINCE = ["site", "market", "productLine", "lastConnectTime"];
/** The gateways table's sort until the user picks one: the newest gateway first. */
const DEFAULT_GATEWAY_SORT: DataTableSort = { key: "createdTime", direction: "desc" };

/** The rail's pages. */
type DashboardPage = "gateways" | "settings";
/** The main area: the gateways table, one gateway's page, or the settings sections. */
type DashboardView = "gateways" | "gateway" | "settings";
/** A gateway page's sections (the sidebar's menu). */
type GatewaySection = "overview" | "connectors" | "logs" | "rpc" | "stats" | "alarms" | "settings";

/** The Logs section's Source filter: the gateway's channels, then its connectors' and converters' logs. */

/** The rail's pages (Settings is at its foot — see railBottomItems). */
const GATEWAY_PAGES: NavRailItem[] = [{ id: "gateways", label: "Gateways", icon: "router" }];

/**
 * Gateway management: the tenant's ThingsBoard IoT Gateways (the devices
 * marked `additionalInfo.gateway = true`) — ThingsBoard's "Gateways" dashboard
 * and its gateway-management-extensions widgets, as a dashboard of the
 * extension's shared pieces.
 *
 * - Icon rail (left edge, as on the fuel dashboard): Gateways and Settings,
 *   with the alarms and the theme toggle at its foot.
 * - Gateways: summary cards over one row per gateway — status, version, its
 *   connectors (enabled / all), the devices connected through it, its errors
 *   and its last connection. "Add gateway" in the table's footer creates a
 *   gateway device.
 * - A row opens the gateway's page in the main area, its sections as the
 *   sidebar's menu (as the Settings page's): Overview (its figures, the
 *   launch instructions, its devices), Connectors (enable / disable, open,
 *   add), Logs (its remote logs — its own channels and its connectors' —
 *   with the window, level and source filters in the sidebar), RPC (the
 *   gateway service commands), Statistics (its message and machine figures
 *   over a window, one chart per figure, and its custom statistics), Alarms
 *   and Settings (identity + the whole gateway configuration; delete). A
 *   connector opens the connector panel: Settings (its configuration JSON,
 *   logging, report strategy; delete), RPC (requests to the connector with
 *   saved templates) and Logs.
 *
 * Everything lives on the gateway devices as ThingsBoard's gateway itself
 * stores it (see {@link GatewayDashboardSettings}): connectors as attributes
 * named after them (shared while enabled, server while disabled), the
 * configuration as shared attributes the gateway reports back as client
 * attributes, logs and statistics as time series.
 */
@Component({
  selector: "tb-gm-dashboard",
  templateUrl: "./gateway-dashboard.component.html",
  styleUrls: ["./gateway-dashboard.component.scss"],
  standalone: true,
  imports: [
    CommonModule,
    SharedModule,
    AlarmListComponent,
    AlarmPanelComponent,
    ApplicationSettingsComponent,
    ApplicationPanelsComponent,
    BarChartComponent,
    CheckFilterComponent,
    ColumnPickerComponent,
    CollapsibleCardComponent,
    CopyBoxComponent,
    ConfirmDialogComponent,
    ConnectorFormComponent,
    ConnectorQuickFormComponent,
    CustomStatisticsComponent,
    DataTableCellDirective,
    DataTableComponent,
    DateRangePickerComponent,
    DeviceSettingsCardComponent,
    DeviceTemplateFormComponent,
    DialogComponent,
    EntityDetailPanelComponent,
    FilterListComponent,
    FilterSectionComponent,
    FilterSectionsComponent,
    GatewayConfigFormComponent,
    GatewayBulkFormComponent,
    GatewayFormComponent,
    GatewayLogsComponent,
    GatewayRpcComponent,
    GatewaySettingsComponent,
    GatewayStatisticsComponent,
    LaunchCardComponent,
    MetricChartCardComponent,
    OrganizationSettingsComponent,
    OrganizationPanelsComponent,
    AccountSettingsComponent,
    DashboardLoadingComponent,
    NavRailComponent,
    SectionNavComponent,
    SelectComponent,
    SidebarLayoutComponent,
    SettingsSidebarComponent,
    StatGridComponent,
    StateTimelineComponent,
    StatusPillComponent,
    SearchBoxComponent,
    SegmentedControlComponent,
    TimeframePickerComponent,
    SummaryCardsComponent,
    SwitchComponent,
    TagPickerComponent,
    ToastsComponent,
    FeedbackDialogComponent,
    CountMarkComponent,
    AccessSettingsComponent,
    AccessPanelsComponent,
    AlarmNotificationPanelComponent,
    TableLinksComponent,
  ],
})
export class GatewayDashboardComponent implements OnInit, OnDestroy, NestedDashboard {
  @Input() ctx: WidgetContext;
  /** Opened inside the Home dashboard (one of its apps): no rail of its own, Home's theme (nested-dashboard.ts). */
  @Input() host: DashboardHost | null = null;

  settings: GatewayDashboardSettings = gatewayDashboardDefaultSettings;
  /** The light / dark theme: the user's pick, or the system's (shared with the other dashboards). */
  theme!: DashboardTheme;
  get darkMode(): boolean {
    return !!this.theme?.dark;
  }

  // -- layout -----------------------------------------------------------------

  /** The rail's pages (Settings is at its foot — see railBottomItems). */
  readonly pages = GATEWAY_PAGES;
  /** Nested in the Home dashboard: its pages, then its own settings sections (Templates) — the menu beside its app in Home's rail. */
  static readonly nestedPages: NavRailItem[] = [
    ...GATEWAY_PAGES,
    ...ownSettingsSections(GATEWAY_SETTINGS_SECTIONS).map((x) => ({ id: x.id, label: x.label, icon: x.icon })),
  ];
  page: DashboardPage = "gateways";
  view: DashboardView = "gateways";
  sidebarOpen = true;
  private pageView: Record<DashboardPage, DashboardView> = { gateways: "gateways", settings: "settings" };

  // -- settings page ------------------------------------------------------------

  /** The Settings menu — nested, its own sections only (the shared ones are on Home's Settings page). */
  settingsSections = GATEWAY_SETTINGS_SECTIONS;
  private settingsSectionIds = GATEWAY_SETTINGS_SECTION_IDS;
  settingsSection = GATEWAY_SETTINGS_SECTION_IDS[0];

  // -- gateways + filters ---------------------------------------------------------

  /** Every gateway, unfiltered. */
  gateways: GatewayRow[] = [];
  gatewaysLoading = true;
  /** The gateways in the Status / Profiles filters. */
  visibleGateways: GatewayRow[] = [];
  gatewaySearchTerms: string[] = [];
  gatewaySearchText = "";
  gatewaySearch: string[] = [];
  selectedStatuses: GatewayStatus[] = [];
  statusOptions: FilterListOption[] = [];
  selectedProfiles: string[] = [];
  profileOptions: FilterListOption[] = [];
  /** The tenant's title, as the gateways' query names it (for a gateway added before the query returns it). */
  private tenantName = "";
  /** The Product line, Market and Site filters: the Organization's lists (asset ids), matched through the site each gateway is assigned to. */
  selectedProductLines: string[] = [];
  productLineFilterOptions: FilterListOption[] = [];
  selectedMarkets: string[] = [];
  marketFilterOptions: FilterListOption[] = [];
  selectedSites: string[] = [];
  siteFilterOptions: FilterListOption[] = [];
  /** The Applications filter: the tags' ids. */
  selectedApplications: string[] = [];
  applicationOptions: FilterListOption[] = [];
  gatewaySummary: SummaryCard[] = [];
  readonly gatewayColumns: DataTableColumn[] = [
    // The gateway's label (its device name without one) — no profile icon beside it (the dashboard's tables show none) — then the device's own name.
    { key: "name", header: "Label" },
    // No wider than its copy box: the column takes the least it can (its cell's content doesn't shrink), the rest of the row's width going to the others.
    { key: "deviceName", header: "Name", width: "1%" },
    { key: "status", header: "Status" },
    { key: "owner", header: "Customer" },
    // The site the gateway is assigned to, and the market and product line that site belongs to.
    // By their names (their codes), each label in a bubble on hover.
    {
      key: "site",
      header: "Site",
      sortValue: (row) => this.refCode("site", (row as GatewayRow).siteRef),
      tooltipOf: (row) => this.refTip("site", (row as GatewayRow).siteRef),
    },
    {
      key: "market",
      header: "Market",
      sortValue: (row) => this.refCode("market", (row as GatewayRow).marketRef),
      tooltipOf: (row) => this.refTip("market", (row as GatewayRow).marketRef),
    },
    {
      key: "productLine",
      header: "Product line",
      sortValue: (row) => this.refCode("productLine", (row as GatewayRow).productLineRef),
      tooltipOf: (row) => this.refTip("productLine", (row as GatewayRow).productLineRef),
    },
    { key: "version", header: "Version" },
    { key: "connectors", header: "Connectors", sortValue: (row) => (row as GatewayRow).activeConnectors.length },
    { key: "devices", header: "Devices", sortValue: (row) => this.deviceCount(row as GatewayRow) },
    { key: "errors", header: "Errors" },
    { key: "alarms", header: "Alarms", sortValue: (row) => this.alarmCount(row as GatewayRow) },
    // When it last connected (the device's lastConnectTime), with how many days ago. One that never has sorts as the
    // longest disconnected: first when ordered longest-ago first, last the other way (not sunk to the bottom both ways).
    { key: "lastConnectTime", header: "Last connected", sortValue: (row) => (row as GatewayRow).lastConnectTime ?? 0 },
    { key: "createdTime", header: "Created at" },
    // Last: the tags, after the gateway's own facts.
    { key: "applications", header: "Applications", sortValue: (row) => this.applicationNames(row as GatewayRow).join(", ") },
  ];
  /** The table's sort (a header click; kept in the user's settings) — newest first until they pick one. */
  gatewaySort: DataTableSort | null = DEFAULT_GATEWAY_SORT;
  private readonly sortSettingKey = "gatewaySort";
  /** The columns shown (the user's pick — "Customize columns" — kept in their settings; the default set until then). */
  readonly gatewayColumnChoice = new TableColumnChoice(this.gatewayColumns, DEFAULT_GATEWAY_COLUMN_KEYS, "gatewayColumns", GATEWAY_COLUMNS_ADDED_SINCE);
  /** "Customize columns" open: the picker beside the filters (the sidebar widened for it). */
  columnPickerOpen = false;
  readonly statusMeta = GATEWAY_STATUS_META;

  // -- devices ----------------------------------------------------------------------

  /** Every device that connected through a gateway (the table's counts, the summary, each gateway's Overview). */
  devices: GatewayDeviceRow[] = [];
  devicesLoading = true;

  // -- gateway logs / statistics (the gateway page's sections) ----------------------------

  /** The selected gateway with all its log channels (its own, its connectors', its converters'). */
  gatewayLogGateways: LogGateway[] = [];
  /** The Logs section's window (its picker is in the table's header). */
  logTimeframe = "1H";
  /** The logs' custom range, applied from the calendar (in use while logTimeframe is the picker's custom id) — the page's Logs and the panel's share the window. */
  logRange: TbDateRange | null = null;
  logRangePickerOpen = false;
  /** The calendar button the date-range panel opens at. */
  logRangeAnchor: HTMLElement | null = null;
  /** The selected gateway, for its statistics charts. */
  gatewayStatRefs: GatewayRef[] = [];
  /** The Statistics section's window (its picker is above the charts). */
  statsTimeframe = "1D";

  // -- alarms -----------------------------------------------------------------------------

  alarmsLoading = false;
  alarmPanelOpen = false;
  panelAlarms: AlarmListItem[] = [];
  detailAlarms: AlarmListItem[] = [];

  // -- gateway page -----------------------------------------------------------------------

  /** The gateway whose page is open (view "gateway"). */
  selectedGateway: GatewayRow | null = null;
  gatewaySection: GatewaySection = "overview";
  gatewayStats: StatItem[] = [];
  /**
   * A Gateways row's panel: the selected gateway (its data loaded as for its page, the page itself behind "Details") — its
   * activity over the day, its figures (the timeline shows the status), its connectors; its logs, alarms and Connection settings.
   */
  gatewayPanelOpen = false;
  gatewayPanelTab = "insights";
  /** The panel's tabs — its Alarms tab's badge the gateway's active alarms (the ones it lists). */
  get gatewayPanelTabs(): SegmentOption[] {
    return [
      { id: "insights", label: "Insights", icon: "bar_chart", tooltip: "Insights" },
      { id: "logs", label: "Logs", icon: "receipt_long", tooltip: "Logs" },
      { id: "rpc", label: "RPC", icon: "terminal", tooltip: "RPC" },
      alarmsTab(this.detailAlarms),
      { id: "settings", label: "Settings", icon: "settings", tooltip: "Settings" },
    ];
  }
  // -- organization (the Settings page): assets by profile ----------------------------------------

  /** The Organization's lists and their editing (the Settings page's Organization, its panel): shared with the other dashboards. */
  org!: OrganizationStore;
  get productLines(): AssetList {
    return this.org.productLines;
  }
  get markets(): AssetList {
    return this.org.markets;
  }
  get sites(): AssetList {
    return this.org.sites;
  }
  /** The sites as a gateway's site picker offers them ("" first for none). */
  siteOptions: TbSelectOption[] = [{ value: "", label: "None" }];
  /**
   * Each Organization list's assets by the names they go by (name, and
   * label), as soon as the list's query returns: what turns a gateway's site /
   * market / product line attributes — the dashboard's source for them — into
   * the assets they name (the columns, the filters, the gateway's site).
   */
  private assetsByRef: Partial<Record<AssetKind, Map<string, AssetRow>>> = {};

  /** The panel's figures: version, profile, uptime (since it connected, while active) and devices — the rest has its own card. */
  gatewayPanelStats: StatItem[] = [];
  /** The panel's Settings: the configuration's cards one at a time, picked in an icon group (General: the identity card with the platform connection). */
  gatewayPanelSettingsSection: GatewayConfigSection = "general";
  gatewayPanelSettingsOptions: SegmentOption[] = [];
  /** The panel's Errors chart: new errors per hour over the last day, out of the gateway's running error count. */
  gatewayPanelErrorCategories: string[] = [];
  gatewayPanelErrorSeries: BarChartSeries[] = [];
  gatewayPanelErrorsLoading = false;
  /** The panel's Resources card: the gateway process's CPU and memory, and the host's disk, out of its machine statistics (one JSON key). */
  gatewayPanelCharts: MetricChartSection[] = [];
  /** The panel's connectors: a switch per connector (its name, whether it's enabled), the enabled ones first. */
  gatewayPanelConnectors: Record<string, any>[] = [];
  /** The activity timeline's states: the gateway reports its statistics while it runs, each report a run of "active"; silence is a gap. */
  readonly activityStates: StateTimelineState[] = [
    { id: "active", label: "Active", color: "var(--c-bg-success-normal)" },
    { id: "inactive", label: "Inactive", color: "var(--c-text-neutral-light)" },
  ];
  readonly activityResolve = (): string => "active";
  /** The selected gateway's devices (its Overview). */
  gatewayDevices: GatewayDeviceRow[] = [];
  readonly gatewayDeviceColumns: DataTableColumn[] = [
    // The device's name (its profile in its own column, no icon beside the name).
    { key: "name", header: "Device" },
    { key: "connectorType", header: "Connector type" },
    { key: "type", header: "Profile" },
    { key: "status", header: "Status" },
  ];
  /** Its connectors (the Connectors section). */
  connectors: ConnectorRow[] = [];
  connectorsLoading = false;
  readonly connectorColumns: DataTableColumn[] = [
    { key: "enabled", header: "Enabled" },
    { key: "name", header: "Connector" },
    { key: "type", header: "Type" },
    { key: "sync", header: "Status" },
    { key: "errors", header: "Errors" },
    { key: "actions", header: "", align: "right" },
  ];
  /** The Settings section's configuration form. */
  configValue: GatewayConfigValue | null = null;
  configLoading = false;
  configResetKey = 0;
  configDirty = false;
  configValid = true;
  /** The last Apply also saved the configuration (its save shows the toast). */
  private configIncludedInApply = false;
  saving = false;
  /** "Delete gateway" awaiting confirmation. */
  deleteGatewayConfirm: GatewayRow | null = null;
  /** Remote configuration being switched off: the gateway name typed to confirm. */
  remoteOffConfirm = false;
  remoteOffTyped = "";

  // -- connector panel --------------------------------------------------------------------

  selectedConnector: ConnectorRow | null = null;
  /** The RPC section's target: a connector's key, or "" for the gateway's service commands. */
  rpcTarget = "";
  /** The Logs section's source: a connector's key, or "" for every channel. */
  logSource = "";
  /** The Logs section's search (the sidebar's box). */
  logSearchTerms: string[] = [];
  logSearchText = "";
  logSearch: string[] = [];
  @ViewChild("pageLogs") private pageLogs?: GatewayLogsComponent;
  @ViewChild("panelLogs") private panelLogs?: GatewayLogsComponent;
  /** The connector side panel (a row's RPC / Logs action): its connector, whether it's open, its tab, and the connector's log channels. */
  panelConnector: ConnectorRow | null = null;
  connectorPanelOpen = false;
  connectorPanelTab = "rpc";
  readonly connectorPanelTabs: SegmentOption[] = [
    { id: "rpc", label: "RPC", icon: "terminal", tooltip: "RPC" },
    { id: "logs", label: "Logs", icon: "receipt_long", tooltip: "Logs" },
  ];
  connectorPanelLogGateways: LogGateway[] = [];
  /** The connector opened from the panel's Connectors card (its name): the dialog with its quick edit beside its logs. */
  connectorDialogKey: string | null = null;
  /** The quick edit's state (for the dialog's buttons): changed from the saved connector, and what's wrong with it. */
  connectorDialogState: ConnectorQuickState = { dirty: false, error: null };
  /** Bumped once an edit is saved: the form goes back to the connector as saved. */
  connectorDialogResetKey = 0;
  connectorDialogLogGateways: LogGateway[] = [];
  @ViewChild("connectorQuickForm") private connectorQuickForm?: ConnectorQuickFormComponent;
  /** The new-connector dialog (the gateway panel's Connectors card, "Create new"). */
  newConnectorOpen = false;
  newConnectorResetKey = 0;
  @ViewChild("newConnectorForm") private newConnectorForm?: ConnectorFormComponent;
  /** The template dialog (the connector dialog's "Save device as template"), over the connector dialog it came from. */
  templateDialogOpen = false;
  @ViewChild("templateDialogForm") private templateDialogForm?: DeviceTemplateFormComponent;
  connectorResetKey = 0;
  connectorDirty = false;
  /** The configuration card's view (its header's switch): the connector's general settings or its JSON — kept from one connector to the next. */
  connectorView: ConnectorView = CONNECTOR_VIEW_DEFAULT;
  readonly connectorViewOptions = CONNECTOR_VIEW_OPTIONS;
  /** The connector panel's Logs tab: the gateway with the connector's own and its converter's channels. */
  deleteConnectorConfirm: ConnectorRow | null = null;

  // -- add panels ----------------------------------------------------------------------------

  addGatewayOpen = false;
  addGatewayResetKey = 0;
  readonly addGatewayTabs: SegmentOption[] = [{ id: "add", label: "Gateway", icon: "router" }];
  deviceProfileOptions: TbSelectOption[] = [];
  /** The new gateway's device profile, as picked in its form (the default until a pick): its panel's icon. */
  addGatewayType = "";
  addConnectorOpen = false;
  addConnectorResetKey = 0;
  readonly addConnectorTabs: SegmentOption[] = [{ id: "add", label: "Add connector", icon: "cable" }];

  // -- device templates (a tenant attribute) ----------------------------------------------------

  deviceTemplates: DeviceTemplate[] = [];
  templatePanelOpen = false;
  templateResetKey = 0;
  /** The template being edited in the panel (null: a new one). */
  editingTemplate: DeviceTemplate | null = null;
  /** A connector's "Save device as template": its type and configuration, to take the device from. */
  templateSource: DeviceTemplateSource | null = null;
  /** That connector's name (the panel's subtitle). */
  templateSourceName = "";
  deleteTemplatesConfirm: DeviceTemplate[] = [];
  readonly templateTabs: SegmentOption[] = [{ id: "template", label: "Template", icon: "bookmark" }];

  // -- applications (assets of their profile; applied to a gateway by a relation to it) -----------

  /** The applications and their editing (the Settings page's Applications, its panel): shared with the other dashboards. */
  apps!: ApplicationStore;
  /** The Settings page's Access (shared: its groups and users, their panels). */
  access!: AccessStore;
  get applications(): GatewayApplication[] {
    return this.apps.applications;
  }
  /** Each application's gateway count (the Settings page's Gateways column), rebuilt as the gateways or the applications change. */
  private countsOf?: { gateways: GatewayRow[]; applications: Application[]; counts: Record<string, number> };
  /** Each gateway's applications (ids, in the applications' order), out of the applications' relations to the gateways. */
  private gatewayApps = new Map<string, string[]>();
  /** The applications as the identity card's tag field offers them (built with {@link applications}: a fresh list per check would rebuild the field's boxes on each). */
  applicationTagOptions: TagPickerOption[] = [];
  /** The open gateway's tags (ids) as edited in its Settings; saved with the floating Apply. */
  gatewayApplications: string[] = [];
  /** The open gateway's site (id, "" = none) as edited in its Settings; saved with the floating Apply. */
  gatewaySite = "";
  private siteIncludedInApply = false;
  /** "Configure" on an application in the filter: the editor in the sidebar, the tagged gateways checked in the table. */
  manageApplication: GatewayApplication | null = null;
  manageName = "";
  /** The gateways tagged, as edited (ids — those hidden by the other filters kept as they are). */
  manageMembers: string[] = [];
  private applicationsIncludedInApply = false;
  /** The table's Manage mode: the gateways checked for a bulk edit (ids), and the edit's panel. */
  manageGateways = false;
  selectedGatewayIds: string[] = [];
  /** The gateways table's footer state (`tb-table-links`): its Manage, the gateways checked. */
  readonly gatewaysManage = tableManageOf({
    managing: () => this.manageGateways,
    selectedCount: () => this.selectedGatewayIds.length,
    allChecked: () => this.allGatewaysChecked,
    count: () => this.manageGatewayCount,
    start: () => this.startManageGateways(),
    end: () => this.endManageGateways(),
    toggleAll: () => this.toggleAllGateways(),
  });
  bulkGatewaysOpen = false;
  bulkGateways: GatewayRow[] = [];
  bulkGatewaysResetKey = 0;
  readonly bulkGatewaysTabs: SegmentOption[] = [{ id: "gateways", label: "Gateways", icon: "router" }];

  @ViewChild("configForm") private configForm?: GatewayConfigFormComponent;
  @ViewChild("gatewaysTable") private gatewaysTable?: DataTableComponent;
  @ViewChild("connectorPanel") private connectorPanelRef?: EntityDetailPanelComponent;
  @ViewChild("toasts", { static: true }) private toasts!: ToastsComponent;
  private alarmService: AlarmService;
  private allAlarms: AlarmListItem[] = [];
  /** Active alarms per gateway id (the table's Alarms column). */
  private alarmCounts = new Map<string, number>();
  private alarmsSubscription: any;
  private gatewaysSubscription: any;
  private devicesSubscription: any;
  private connectorsSubscription: any;
  private gatewaysRefreshTimer?: any;
  private devicesRefreshTimer?: any;
  private connectorsRefreshTimer?: any;
  /** The connectors' `<name>_ERRORS_COUNT`, by connector name (the selected gateway). */
  private connectorErrors = new Map<string, number | null>();
  /** The device profiles' icons (shared by the widget): a gateway's, a device's — its profile's. */
  private icons!: ProfileIcons;

  constructor(
    private cd: ChangeDetectorRef,
    private destroyRef: DestroyRef
  ) {}

  // -- view getters -------------------------------------------------------------

  get railBottomItems(): NavRailItem[] {
    return dashboardRailItems(this.darkMode, this.panelAlarms.length, { settings: true, themeToggle: isTenantAdmin(this.ctx) });
  }

  onRailBottomClick(id: string): void {
    if (id === "alarms") {
      this.alarmPanelOpen = true;
    } else if (id === "settings") {
      this.selectPage("settings");
    } else if (id === FEEDBACK_RAIL_ID) {
      feedbackOf(this.ctx).show("Gateways");
    } else if (id === "theme") {
      this.theme.toggle(); // a tenant administrator's, under Settings
    }
  }

  /** Each application's gateway count (the Settings page's Gateways column) — the same object until the gateways or the applications change. */
  get applicationCounts(): Record<string, number> {
    const c = this.countsOf;
    if (!c || c.gateways !== this.gateways || c.applications !== this.applications) {
      const counts: Record<string, number> = {};
      for (const a of this.applications) {
        counts[a.id] = this.gateways.filter((g) => g.applications.includes(a.id)).length;
      }
      this.countsOf = { gateways: this.gateways, applications: this.applications, counts };
    }
    return this.countsOf!.counts;
  }

  /** The Settings page's section is one of the Organization's (the shared tables). */
  get organizationSection(): boolean {
    return !!organizationKindOf(this.settingsSection);
  }

  /** The gateway page's section menu in the sidebar (Alarms carries the count of active ones). */
  get gatewaySections(): SectionNavItem[] {
    return [
      { id: "overview", label: "Overview", icon: "dashboard" },
      { id: "connectors", label: "Connectors", icon: "cable" },
      { id: "logs", label: "Logs", icon: "receipt_long" },
      { id: "rpc", label: "RPC", icon: "terminal" },
      { id: "stats", label: "Statistics", icon: "monitoring" },
      { id: "alarms", label: "Alarms", icon: "notifications", badge: this.detailAlarms.filter((a) => !a.cleared).length },
      { id: "settings", label: "Settings", icon: "settings" },
    ];
  }

  get highlightedConnectorKey(): string | null {
    return this.selectedConnector?.key ?? null;
  }

  /** The RPC section's targets: the gateway, then each connector. */
  get rpcTargetOptions(): TbSelectOption[] {
    return [{ value: "", label: "Gateway (service commands)" }, ...this.connectors.map((c) => ({ value: c.key, label: `${c.key} (${connectorTypeLabel(c.connector.type)})` }))];
  }

  get rpcConnector(): ConnectorRow | null {
    return this.connectors.find((c) => c.key === this.rpcTarget) ?? null;
  }

  /** The Logs section's sources: everything, then each connector (its own and its converter's lines). */
  get logSourceOptions(): TbSelectOption[] {
    return [{ value: "", label: "All sources" }, ...this.connectors.map((c) => ({ value: c.key, label: c.key }))];
  }

  /** The open section's documentation, as the help button in the page's title: Settings — the gateway configuration reference. */
  get sectionHelp(): string {
    return this.gatewaySection === "settings" ? GATEWAY_CONFIG_HELP : "";
  }

  /** A gateway's header title (its page's, its panel's): the device's own name — its label is left to the table. */
  get gatewayTitle(): string {
    const g = this.selectedGateway;
    return g ? g.deviceName || g.name : "";
  }

  get gatewaySubtitle(): string {
    return this.selectedGateway ? this.subtitleOf(this.selectedGateway) : "";
  }

  /** A gateway's icon (its page's badge, its panel's header): its device profile's. */
  get gatewayIcon(): string {
    return this.icons.of("device", this.selectedGateway?.type);
  }

  /** The new-gateway panel's icon: the profile picked in its form. */
  get addGatewayIcon(): string {
    return this.icons.of("device", this.addGatewayType);
  }

  /** The bulk edit's icon: the checked gateways' profile's when they share one, else a device's. */
  get bulkGatewaysIcon(): string {
    const type = this.bulkGateways[0]?.type;
    return this.bulkGateways.every((g) => g.type === type) ? this.icons.of("device", type) : DEFAULT_PROFILE_ICON.device;
  }

  /** Under a gateway's device name: its version, and the site it's assigned to (when it is). */
  private subtitleOf(g: GatewayRow): string {
    return [g.version ? `v${g.version}` : "", this.siteName(g)].filter(Boolean).join(" · ");
  }

  /** The open connector type's configuration reference (the card's help button). */
  get selectedConnectorHelp(): string {
    const c = this.selectedConnector;
    return c ? (CONNECTOR_HELP_LINKS[c.connector.type] ?? "") : "";
  }

  /** The selected gateway's custom statistics commands. */
  get customCommands() {
    return this.selectedGateway?.generalConfiguration?.statistics?.commands ?? [];
  }

  get connectorNames(): string[] {
    return this.connectors.map((c) => c.key);
  }

  get gatewayNames(): string[] {
    return this.gateways.map((g) => g.deviceName);
  }

  connectorSyncMeta(row: ConnectorRow) {
    return connectorSyncMeta(row);
  }

  connectorTypeLabel(type: string): string {
    return connectorTypeLabel(type);
  }

  // -- lifecycle ----------------------------------------------------------------

  /** The loading page while the dashboard first loads (tb-dashboard-loading) — a later reload never brings it back. */
  private readonly firstLoad = new FirstLoad();
  get pageLoading(): boolean {
    return this.firstLoad.pending(this.gatewaysLoading, this.devicesLoading);
  }

  ngOnInit(): void {
    if (!this.host) {
      this.ctx.$scope.gatewayDashboardComponent = this;
    }
    this.theme = this.host?.theme ?? new DashboardTheme(this.ctx, this.destroyRef, () => this.cd.detectChanges());
    this.settings = { ...gatewayDashboardDefaultSettings, ...dashboardWidgetSettings<GatewayDashboardSettings>(this.ctx, this.host) };
    this.settingsSections = nestedSettingsSections(this.host, GATEWAY_SETTINGS_SECTIONS);
    this.settingsSectionIds = this.settingsSections.flatMap((s) => (s.children ? s.children.map((c) => c.id) : [s.id]));
    this.settingsSection = this.settingsSectionIds[0];
    this.gatewayPanelCharts = ["gwProcessCpuUsage", "gwMemory", "diskUsage"].flatMap((id, i) => {
      const m = STAT_METRICS.find((x) => x.id === id);
      // Under the card's "Resources" title the short names do — CPU, Memory, Disk — as each chart's caption and its tooltip's line.
      const label = m?.shortLabel ?? m?.label ?? "";
      return m
        ? [{ chartTitle: label, unit: m.unit, yMin: 0, yMax: 100, fill: true, showLegend: false, keys: [{ name: this.settings.machineStatsKey, field: m.field, label, color: `var(--c-chart-${i + 1})` }] }]
        : [];
    });
    injectCss("tb-ext-material-symbols-rounded", "https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200");
    this.alarmService = this.ctx.$injector.get(this.ctx.servicesMap.get("alarmService")) as AlarmService;
    // The profiles' icons coming in: the gateways' and devices' rows, a gateway's badge and panels show them.
    this.icons = profileIconsOf(this.ctx);
    this.icons.changes.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.cd.detectChanges());
    // The shared stores first: the filters, the columns and the template read them from the start (their lists load below).
    this.apps = new ApplicationStore(
      this.ctx,
      this.destroyRef,
      {
        assetType: this.settings.applicationAssetType,
        memberRelation: this.settings.applicationGatewayRelation,
        siteRelation: this.settings.applicationSiteRelation,
        appliedNoun: "gateway",
      },
      this.toasts,
      () => this.cd.detectChanges(),
      {
        // The list set (loaded, or one renamed): the tag field's options, the filter's options and the column's names follow.
        listChanged: () => {
          this.applicationTagOptions = this.applications.map((a) => ({ id: a.id, label: applicationName(a) }));
          this.applyFilters();
        },
        // Loaded afresh: each gateway's applications out of the relations just read (in the applications' order).
        loaded: () => {
          const byGateway = new Map<string, string[]>();
          for (const a of this.applications) {
            for (const deviceId of this.apps.members.get(a.id) ?? []) {
              byGateway.set(deviceId, [...(byGateway.get(deviceId) ?? []), a.id]);
            }
          }
          this.gatewayApps = byGateway;
          this.applyGatewayApps();
        },
        deleted: (ids) => {
          const gone = new Set(ids);
          this.selectedApplications = this.selectedApplications.filter((id) => !gone.has(id));
        },
      }
    );
    this.org = new OrganizationStore(this.ctx, this.destroyRef, this.settings, this.toasts, () => this.cd.detectChanges(), {
      // A list set: the names the gateways' attributes use, the gateways' sites and their picker, and the filters follow.
      listChanged: (kind) => {
        const rows = this.org.list(kind).rows;
        this.assetsByRef = { ...this.assetsByRef, [kind]: assetsByRef(rows) };
        if (kind === "site") {
          this.siteOptions = [{ value: "", label: "None" }, ...rows.map((a) => ({ value: a.id, label: siteOptionLabel(a) }))];
          this.applyGatewayRefs();
        }
        this.applyFilters();
      },
      // An edited asset: the gateways naming it in their attributes follow (renamed, or a site relinked).
      afterSave: ({ kind, before, draft }) => (before ? this.rewriteGatewayRefs(this.refsAfterEdit(kind, before, draft)) : of(null)),
      afterSiteRelinked: ({ site, links }) => this.rewriteGatewayRefs(this.refsAfterEdit("site", site, { ...links, name: site.name })),
      // Deleted assets: the gateways naming one lose it (a deleted site: all three, as its relations go with it).
      afterDelete: ({ kind, assets }) =>
        this.rewriteGatewayRefs((g, refs) => {
          if (kind === "site") {
            return assets.some((a) => namesAsset(refs.site, a)) ? { site: "", market: "", productLine: "" } : null;
          }
          const field: keyof GatewayRefs = kind === "market" ? "market" : "productLine";
          return assets.some((a) => namesAsset(refs[field], a)) ? { ...refs, [field]: "" } : null;
        }),
    });
    // The applications' Sites tab: the Organization's sites, by market.
    this.apps.org = this.org;
    // The Settings page's Access: groups scoped by the Organization, opening the Applications.
    this.access = new AccessStore(this.ctx, this.destroyRef, { ownerTitle: this.settings.accessOwnerTitle }, this.toasts, () => this.cd.detectChanges(), this.org, this.apps);
    this.applyFilters();
    this.loadUserPreferences();

    this.loadGateways();
    this.subscribeGateways();
    this.loadDevices();
    this.subscribeDevices();
    this.subscribeAlarms();
    this.loadTemplates();
    this.apps.load();
    this.org.loadAll();
    // The URL's dashboard state: a gateway named there opens (once loaded), the
    // Settings page shows if named, and every change to it — the browser's
    // Back / Forward, a pasted link — is followed.
    watchDashboardUrlState(this.ctx, this.destroyRef, (state) => this.applyUrlState(state));
    this.applyUrlState();
    this.host?.attach(this);
  }

  ngOnDestroy(): void {
    this.host?.attach(null);
    removeSubscriptions(this.ctx, this.alarmsSubscription, this.gatewaysSubscription, this.devicesSubscription, this.connectorsSubscription);
    clearTimeout(this.gatewaysRefreshTimer);
    clearTimeout(this.devicesRefreshTimer);
    clearTimeout(this.connectorsRefreshTimer);
  }

  /** ThingsBoard hook — data comes from the custom subscriptions; just re-render. */
  onDataUpdated(): void {
    this.ctx.detectChanges();
  }

  onResize(): void {
    this.cd.detectChanges();
  }

  // -- nested in the Home dashboard: its pages and its own settings sections (Templates) — the menu beside its app in Home's rail --

  get railActive(): string {
    return this.page === "settings" ? this.settingsSection : this.page;
  }

  selectRailPage(id: string): void {
    if (this.pages.some((p) => p.id === id)) {
      this.selectPage(id);
    } else {
      // A settings section: the Settings page on it (its menu is Home's).
      if (this.page !== "settings") {
        this.selectPage("settings");
      }
      this.selectSettingsSection(id);
    }
    this.cd.detectChanges();
  }

  // -- header / sidebar ---------------------------------------------------------

  selectPage(id: string): void {
    this.page = id as DashboardPage;
    if (this.page === "settings") {
      this.org.wantSiteLinks();
    }
    this.selectView(this.pageView[this.page]);
    // The URL follows: the Settings page, the gateway's page the Gateways page comes back to, or neither.
    this.writeUrlState();
  }

  selectView(id: string): void {
    // Another tab (or page): the gateways leave Manage.
    if (this.manageGateways && id !== this.view) {
      this.endManageGateways();
    }
    this.view = id as DashboardView;
    this.pageView[this.page] = this.view;
  }

  /** The Settings page's section (the sidebar menu), kept in the URL; the Organization's pages reload their assets. */
  selectSettingsSection(id: string): void {
    this.settingsSection = id;
    const kind = organizationKindOf(id);
    if (kind) {
      this.org.load(kind);
    } else if (id === "applications") {
      this.apps.load();
    } else if (accessPageOf(id)) {
      this.access.load();
    }
    this.writeUrlState(true);
  }

  /** The Settings page's Access page ("groups" / "users" / "roles"), or null on another section. */
  get accessPage(): AccessPage | null {
    return accessPageOf(this.settingsSection);
  }

  // -- organization: the assets ------------------------------------------------------------------

  /** The site a gateway is assigned to (the table's Site column; "" for none) — by its site attribute. */
  siteName(g: GatewayRow): string {
    return this.refLabel("site", g.siteRef);
  }

  /**
   * An asset a gateway's attribute names, as the columns show assets: its
   * label (the attribute may hold its name or its label) — the attribute's
   * text when the list has no such asset; "" until the list has loaded, so a
   * name never shows only to turn into a label a moment later.
   */
  private refLabel(kind: AssetKind, ref: string): string {
    const assets = this.assetsByRef[kind];
    if (!ref || !assets) {
      return "";
    }
    const asset = assets.get(ref);
    return asset ? asset.label || asset.name : ref;
  }

  /**
   * An asset a gateway's attribute names, as the table shows it: its name
   * (its code) — the attribute's text when the list has no such asset; "" until
   * the list has loaded.
   */
  refCode(kind: AssetKind, ref: string): string {
    const assets = this.assetsByRef[kind];
    if (!ref || !assets) {
      return "";
    }
    return assets.get(ref)?.name ?? ref;
  }

  /** That asset's label for the table's bubble ("" when it has none, or it's the code). */
  refTip(kind: AssetKind, ref: string): string {
    const asset = ref ? this.assetsByRef[kind]?.get(ref) : undefined;
    return asset?.label && asset.label !== asset.name ? asset.label : "";
  }

  /** The id of the asset a gateway's attribute names ("" for none, or none in the list). */
  private refId(kind: AssetKind, ref: string): string {
    return (ref && this.assetsByRef[kind]?.get(ref)?.id) || "";
  }

  /** The gateways' sites by their attributes (the site list, or the gateways, just loaded); the open gateway's site picker follows unless edited. */
  private applyGatewayRefs(): void {
    const dirty = this.siteDirty;
    for (const g of this.gateways) {
      g.siteId = this.refId("site", g.siteRef) || null;
    }
    if (this.selectedGateway && !dirty) {
      this.resetGatewaySite();
    }
  }

  /**
   * The attributes a gateway in this site carries: the site's name and its
   * market's and product line's (the site's links looked up when the list
   * hasn't loaded them); all "" for no site.
   */
  private siteRefs(siteId: string | null): Observable<GatewayRefs> {
    const site = siteId ? this.sites.rows.find((s) => s.id === siteId) : null;
    if (!site) {
      return of({ site: "", market: "", productLine: "" });
    }
    const links$ = site.links
      ? of(site.links)
      : this.ctx.entityRelationService
          .findByTo({ entityType: EntityType.ASSET, id: site.id }, QUIET_REQUEST)
          .pipe(map((relations) => relations.filter((r) => r.from?.entityType === EntityType.ASSET).map((r) => ({ type: r.type, fromId: r.from.id }))));
    const s = this.settings;
    return links$.pipe(
      map((links) => {
        const linked = (kind: AssetKind, type: string) => links.find((l) => l.type === type && this.org.list(kind).rows.some((a) => a.id === l.fromId))?.fromId ?? null;
        return this.refsOf(site.name, linked("market", s.marketSiteRelation), linked("productLine", s.productLineSiteRelation));
      })
    );
  }

  /** A gateway's attributes for a site of this name in this market and product line (ids, null for none): their names. */
  private refsOf(siteName: string, marketId: string | null | undefined, productLineId: string | null | undefined): GatewayRefs {
    const nameOf = (kind: AssetKind, id: string | null | undefined) => (id ? (this.org.list(kind).rows.find((a) => a.id === id)?.name ?? "") : "");
    return { site: siteName, market: nameOf("market", marketId), productLine: nameOf("productLine", productLineId) };
  }

  /** A gateway's site / market / product line attributes set to these names (only those that differ); its row follows. */
  private writeGatewayRefs(g: GatewayRow, refs: GatewayRefs): Observable<unknown> {
    const s = this.settings;
    const changed = [
      { key: s.siteAttributeKey, value: refs.site, before: g.siteRef },
      { key: s.marketAttributeKey, value: refs.market, before: g.marketRef },
      { key: s.productLineAttributeKey, value: refs.productLine, before: g.productLineRef },
    ].filter((a) => a.value !== a.before);
    if (!changed.length) {
      return of(null);
    }
    const attributes = changed.map(({ key, value }) => ({ key, value }));
    return this.ctx.attributeService.saveEntityAttributes({ entityType: EntityType.DEVICE, id: g.id }, AttributeScope.SERVER_SCOPE, attributes, QUIET_REQUEST).pipe(
      map(() => {
        g.siteRef = refs.site;
        g.marketRef = refs.market;
        g.productLineRef = refs.productLine;
        g.siteId = this.refId("site", refs.site) || null;
        return null;
      })
    );
  }

  /**
   * The gateways an Organization change touches get their attributes again —
   * `change` gives a gateway's new ones, or null to leave it — a few at a
   * time; one that fails is left as it was (the asset's own save stands).
   */
  private rewriteGatewayRefs(change: (g: GatewayRow, refs: GatewayRefs) => GatewayRefs | null): Observable<unknown> {
    const jobs = this.gateways.flatMap((g) => {
      const next = change(g, { site: g.siteRef, market: g.marketRef, productLine: g.productLineRef });
      return next ? [{ g, next }] : [];
    });
    if (!jobs.length) {
      return of(null);
    }
    return from(jobs).pipe(
      mergeMap(({ g, next }) => this.writeGatewayRefs(g, next).pipe(catchError(() => of(null))), 4),
      toArray()
    );
  }

  /** The Settings page's entity whose panel is open (an asset, an application or a template — its id): its table's row is highlighted while it is, and not after. */
  get settingsSelectedId(): string | null {
    if (this.templatePanelOpen && this.editingTemplate) {
      return this.editingTemplate.id;
    }
    return null;
  }

  /**
   * An Organization asset edited: each gateway's new attributes (null: not
   * one naming it). A site's gateways take its name and its market's and
   * product line's; a market's or product line's, its new name.
   */
  private refsAfterEdit(kind: AssetKind, before: AssetRow, draft: AssetDraft): (g: GatewayRow, refs: GatewayRefs) => GatewayRefs | null {
    if (kind === "site") {
      const marketId = draft.marketId !== undefined ? draft.marketId || null : before.marketId;
      const productLineId = draft.productLineId !== undefined ? draft.productLineId || null : before.productLineId;
      const next = this.refsOf(draft.name, marketId, productLineId);
      return (g) => (namesAsset(g.siteRef, before) ? next : null);
    }
    const field: keyof GatewayRefs = kind === "market" ? "market" : "productLine";
    return (g, refs) => (namesAsset(refs[field], before) && refs[field] !== draft.name ? { ...refs, [field]: draft.name } : null);
  }

  onStatusesChange(ids: string[]): void {
    this.selectedStatuses = ids as GatewayStatus[];
    this.applyFilters();
  }

  onProfilesChange(ids: string[]): void {
    this.selectedProfiles = ids;
    this.applyFilters();
  }

  onApplicationsChange(ids: string[]): void {
    this.selectedApplications = ids;
    this.applyFilters();
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

  /** A gateway's applications' names (the table's Applications column; a tag no longer defined is left out). */
  applicationNames(row: GatewayRow): string[] {
    return this.applications.filter((a) => row.applications.includes(a.id)).map(applicationName);
  }

  /** A gateway's active alarms (the Alarms column). */
  alarmCount(row: GatewayRow): number {
    return this.alarmCounts.get(row.id) ?? 0;
  }

  /** When the gateway's device was created (the Created at column). */
  createdAt(row: GatewayRow): string {
    return formatWhen(row.createdTime);
  }

  /**
   * When the gateway last connected, with how many days ago in brackets —
   * "Nov 2, 11:33 AM (6 days)", counted in calendar days; today's stands
   * alone ("Today 6:14 PM"), and "—" shows before it ever has.
   */
  lastConnected(row: GatewayRow): string {
    const ts = row.lastConnectTime;
    if (!ts) {
      return "—";
    }
    const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const days = Math.round((midnight(new Date()) - midnight(new Date(ts))) / 86400000);
    return days > 0 ? `${formatWhen(ts)} (${days} day${days === 1 ? "" : "s"})` : formatWhen(ts);
  }

  // -- manage an application (the filter's "Configure") ------------------------------------------

  get managing(): boolean {
    return !!this.manageApplication;
  }

  /** The name (its label) or the tagged gateways differ from the saved ones (Save enables). */
  get manageDirty(): boolean {
    const app = this.manageApplication;
    if (!app) {
      return false;
    }
    const saved = this.gateways.filter((g) => g.applications.includes(app.id)).map((g) => g.id);
    return this.manageName.trim() !== applicationName(app) || [...this.manageMembers].sort().join() !== saved.sort().join();
  }

  openManageApplication(id: string): void {
    const app = this.applications.find((a) => a.id === id);
    if (!app) {
      return;
    }
    this.manageApplication = app;
    this.manageName = applicationName(app);
    this.manageMembers = this.gateways.filter((g) => g.applications.includes(app.id)).map((g) => g.id);
    this.applyFilters(); // every gateway shows, whatever the Applications filter
  }

  closeManageApplication(): void {
    if (!this.manageApplication) {
      return;
    }
    this.manageApplication = null;
    this.manageMembers = [];
    this.applyFilters();
  }

  /** The table's checks: the tagged among the rows shown; those hidden by the other filters stay as they were. */
  onManageSelection(rows: Record<string, any>[]): void {
    const shown = new Set(this.visibleGateways.map((g) => g.id));
    this.manageMembers = [...this.manageMembers.filter((id) => !shown.has(id)), ...rows.map((r) => r["id"] as string)];
  }

  // -- manage the gateways (the table's "Manage": a bulk edit) -----------------------------------

  /** "Manage": the rows get their checkboxes; "Edit (n)" sets the checked gateways' site and applications together. */
  startManageGateways(): void {
    this.closeManageApplication();
    this.manageGateways = true;
    this.selectedGatewayIds = [];
  }

  endManageGateways(): void {
    this.manageGateways = false;
    this.selectedGatewayIds = [];
    this.gatewaysTable?.clearChecked();
  }

  /** The table's checks: an application's members while one is managed, else the gateways for the bulk edit. */
  onTableSelection(rows: Record<string, any>[]): void {
    if (this.managing) {
      this.onManageSelection(rows);
    } else if (this.manageGateways) {
      this.selectedGatewayIds = rows.map((r) => r["id"] as string);
    }
  }

  /** Every row shown is checked. */
  get allGatewaysChecked(): boolean {
    return this.gatewaysTable?.allFilteredChecked ?? false;
  }

  /** The rows "Select all" covers: those passing the search and the filters. */
  get manageGatewayCount(): number {
    return this.gatewaysTable?.filteredCount ?? this.visibleGateways.length;
  }

  toggleAllGateways(): void {
    const table = this.gatewaysTable;
    if (!table) {
      return;
    }
    if (this.allGatewaysChecked) {
      table.clearChecked();
    } else {
      table.checkAll(true);
    }
  }

  /** "Edit (n)": the bulk edit's panel for the checked gateways. */
  openBulkEditGateways(): void {
    const ids = new Set(this.selectedGatewayIds);
    this.bulkGateways = this.gateways.filter((g) => ids.has(g.id));
    if (!this.bulkGateways.length) {
      return;
    }
    this.bulkGatewaysResetKey++;
    this.bulkGatewaysOpen = true;
  }

  closeBulkEditGateways(): void {
    this.bulkGatewaysOpen = false;
  }

  get bulkGatewaysName(): string {
    const n = this.bulkGateways.length;
    return `Edit ${n} gateway${n === 1 ? "" : "s"}`;
  }

  /** The bulk edit applied: each checked gateway gets the picked site and / or applications; the table then leaves its Manage mode. */
  applyBulkGateways(draft: GatewayBulkDraft): void {
    const tags = draft.applications ?? null;
    this.saving = true;
    from(this.bulkGateways)
      .pipe(
        mergeMap((g) => {
          const steps: Observable<unknown>[] = [];
          if (draft.siteId !== undefined) {
            steps.push(this.syncGatewaySite(g, draft.siteId || null));
          }
          if (tags) {
            steps.push(this.syncGatewayApplications(g, tags));
          }
          return (steps.length ? forkJoin(steps) : of(null)).pipe(
            map(() => true),
            catchError(() => of(false))
          );
        }, 4),
        toArray(),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((results) => {
        this.saving = false;
        const done = results.filter(Boolean).length;
        const failed = results.length - done;
        if (failed) {
          this.toasts.error(`Updated ${done} of ${results.length} gateways — ${failed} couldn't be updated.`);
        } else {
          this.toasts.success(done === 1 ? "1 gateway updated" : `${done} gateways updated`);
        }
        this.closeBulkEditGateways();
        this.endManageGateways();
        this.applyFilters();
        this.scheduleGatewaysRefresh();
        this.cd.detectChanges();
      });
  }

  /** Save: each gateway applied or no longer gets its relation from the application made or removed (a few at a time), then a new name goes to the application's asset as its label. */
  saveManageApplication(): void {
    const app = this.manageApplication;
    if (!app) {
      return;
    }
    const members = new Set(this.manageMembers);
    const changed = this.gateways.filter((g) => g.applications.includes(app.id) !== members.has(g.id));
    const shown = applicationName(app);
    const name = this.manageName.trim() || shown;
    const message = `Application ${name} saved — ${members.size} gateway${members.size === 1 ? "" : "s"}`;
    const relations$ = from(changed).pipe(
      mergeMap((g) => this.syncGatewayApplications(g, members.has(g.id) ? [...g.applications, app.id] : g.applications.filter((id) => id !== app.id)), 4),
      toArray()
    );
    const renamed$ = name !== shown ? this.apps.saveAsset(app.id, { ...app, label: name }) : of(null);
    this.saving = true;
    relations$
      .pipe(
        switchMap(() => renamed$),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: () => {
          this.saving = false;
          if (name !== shown) {
            this.apps.setApplications(this.applications.map((a) => (a.id === app.id ? { ...a, label: name } : a)));
          }
          this.toasts.success(message);
          this.closeManageApplication();
          this.cd.detectChanges();
        },
        error: (err) => {
          this.saving = false;
          this.toasts.error(`Couldn't save application ${name}${apiMessage(err)}`);
          // Whatever was applied before the failure stands: the relations are read again.
          this.apps.load();
          this.cd.detectChanges();
        },
      });
  }

  /** Any of the table's filters in use (search, Status, Applications, Product line, Market, Site, Device profiles). */
  get hasGatewayFilters(): boolean {
    return !!(
      this.gatewaySearchTerms.length ||
      this.gatewaySearchText ||
      this.selectedStatuses.length ||
      this.selectedApplications.length ||
      this.selectedProductLines.length ||
      this.selectedMarkets.length ||
      this.selectedSites.length ||
      this.selectedProfiles.length
    );
  }

  clearGatewayFilters(): void {
    this.gatewaySearchTerms = [];
    this.gatewaySearchText = "";
    this.gatewaySearch = [];
    this.selectedStatuses = [];
    this.selectedApplications = [];
    this.selectedProductLines = [];
    this.selectedMarkets = [];
    this.selectedSites = [];
    this.selectedProfiles = [];
    this.applyFilters();
  }

  /** The picker is in the sidebar: on the gateways table, while open. */
  get columnPickerShown(): boolean {
    return this.view === "gateways" && this.columnPickerOpen;
  }

  /** The sidebar's width: the filters column, plus the column picker and the gap to it while that's open. */
  get sidebarWidth(): number {
    // The Settings page: its section menu — and an Access page's or the Sites page's filters beside it (tb-settings-sidebar's).
    if (this.page === "settings") {
      return settingsSidebarWidth(this.settingsSection, true, this.org, this.access);
    }
    return sidebarWidth(SIDEBAR_WIDTH, this.columnPickerShown);
  }

  /** A header click: the sort shown at once and kept in the user's settings. */
  onGatewaySortChange(sort: DataTableSort | null): void {
    this.gatewaySort = sort;
    saveUserSettings(this.ctx, this.destroyRef, { [this.sortSettingKey]: sort });
  }

  /** The picker's choice: shown at once and kept in the user's settings. */
  onGatewayColumnsChange(keys: string[]): void {
    this.gatewayColumnChoice.set(keys);
    saveUserSettings(this.ctx, this.destroyRef, this.gatewayColumnChoice.settingsFor(keys));
  }

  // -- gateways table + gateway page ------------------------------------------------

  /** A Gateways row: the gateway's panel (its page is behind the panel's "Details"). */
  onGatewayRowClick(row: Record<string, any>): void {
    this.openGatewayPanel(row as GatewayRow);
  }

  // -- a gateway's panel ------------------------------------------------------------------------

  /** The panel's gateway: the selected one, while the gateways table is the view (its page takes it over otherwise). */
  get panelGateway(): GatewayRow | null {
    return this.view === "gateways" ? this.selectedGateway : null;
  }

  /** A Gateways row: the gateway selected (its page's data loads) and its panel open on Insights. */
  openGatewayPanel(g: GatewayRow): void {
    this.selectGateway(g);
    this.gatewayPanelTab = "insights";
    this.gatewayPanelSettingsSection = "general";
    this.gatewayPanelOpen = true;
  }

  selectConnectorView(id: string): void {
    this.connectorView = id as ConnectorView;
  }

  selectPanelSettingsSection(id: string): void {
    this.gatewayPanelSettingsSection = id as GatewayConfigSection;
  }

  closeGatewayPanel(): void {
    this.gatewayPanelOpen = false;
  }

  /** The panel slid away: its gateway is let go — unless its page took over ("Details"). */
  onGatewayPanelClosed(): void {
    if (this.view !== "gateway") {
      this.leaveGatewayPage();
      this.cd.detectChanges();
    }
  }

  /** The panel's "Details": the gateway's page, on its Overview. */
  openGatewayDetails(): void {
    if (this.selectedGateway) {
      this.showGateway(this.selectedGateway, "overview");
    }
  }

  trackPanelConnector(_: number, row: Record<string, any>): string {
    return row["key"] as string;
  }

  /** A connector's name in the panel's card: its dialog — its quick edit (enabled, logging, report strategy, the configuration) beside its logs (its own and its converter's). */
  openConnectorDialog(row: Record<string, any>): void {
    const g = this.selectedGateway;
    const key = row["key"] as string;
    this.connectorDialogKey = key;
    this.connectorDialogState = { dirty: false, error: null };
    this.connectorDialogLogGateways = g ? [{ id: g.id, name: g.name, channels: connectorLogKeys(key) }] : [];
  }

  closeConnectorDialog(): void {
    this.connectorDialogKey = null;
    this.connectorDialogState = { dirty: false, error: null };
    this.connectorDialogLogGateways = [];
  }

  /** The dialog's connector, as loaded (null until the gateway's connectors arrive). */
  get connectorDialogRow(): ConnectorRow | null {
    return this.connectorDialogKey ? (this.connectors.find((c) => c.key === this.connectorDialogKey) ?? null) : null;
  }

  /** The quick edit reports its state inside change detection (a form reset): the buttons follow on the next turn. */
  onConnectorDialogState(state: ConnectorQuickState): void {
    if (state.dirty === this.connectorDialogState.dirty && state.error === this.connectorDialogState.error) {
      return;
    }
    Promise.resolve().then(() => {
      this.connectorDialogState = state;
      this.cd.detectChanges();
    });
  }

  /** The dialog's "Apply changes": the quick edit submits (see applyConnectorDialog). */
  submitConnectorDialog(): void {
    this.connectorQuickForm?.submit();
  }

  /**
   * The quick edit applied: the connector saved as the connector form saves it
   * (the gateway picks it up), in the scope its switch now puts it in — enabled
   * (shared, listed active) or disabled (server, listed inactive), its copy in
   * the scope it left removed.
   */
  applyConnectorDialog(edit: ConnectorQuickEdit): void {
    const g = this.selectedGateway;
    const row = this.connectorDialogRow;
    if (!g || !row) {
      return;
    }
    const value = connectorToSave(edit.connector, g.version);
    const on = edit.enabled;
    const active = g.activeConnectors.filter((n) => n !== row.key);
    const inactive = g.inactiveConnectors.filter((n) => n !== row.key);
    (on ? active : inactive).push(row.key);
    const scope = on ? AttributeScope.SHARED_SCOPE : AttributeScope.SERVER_SCOPE;
    const left = on === row.enabled ? null : on ? AttributeScope.SERVER_SCOPE : AttributeScope.SHARED_SCOPE;
    this.writeConnector(
      g,
      value,
      scope,
      active,
      inactive,
      null,
      `Connector ${value.name} saved`,
      () => {
        // The saved connector is the form's new baseline at once (the buttons rest), before the reload confirms it.
        const saved: ConnectorRow = { ...row, connector: value, enabled: on };
        this.connectors = this.connectors.map((c) => (c.key === row.key ? saved : c));
        if (this.selectedConnector?.key === row.key) {
          this.selectedConnector = saved;
          this.connectorResetKey++;
        }
        this.connectorDialogResetKey++;
        this.refreshGatewayDerived();
        this.tagGatewayFromTemplates(g, edit.templateApplications);
      },
      left
    );
  }

  /** The dialog's subtitle: the connector's type, and its gateway. */
  get connectorDialogSubtitle(): string {
    const c = this.connectors.find((x) => x.key === this.connectorDialogKey);
    const gateway = this.selectedGateway?.name ?? "";
    return c ? `${connectorTypeLabel(c.connector.type)} · ${gateway}` : gateway;
  }

  /** A figure's action in the panel (Errors → the logs): the gateway's page on that section. */
  onGatewayPanelStatAction(event: { id: string }): void {
    if (event.id === "logs") {
      this.openGatewaySectionFromPanel("logs");
    }
  }

  /** The Logs export (the page's section or the panel's tab): the lines shown (the window, the source, the search) as CSV, named after the gateway. */
  exportLogsCsv(): void {
    const g = this.selectedGateway;
    const logs = this.pageLogs ?? this.panelLogs;
    if (!g || !logs) {
      return;
    }
    const terms = this.logSearch.map((t) => t.trim().toLowerCase()).filter(Boolean);
    const rows = logs.visibleRows.filter((r) => {
      const text = logs.searchKeys.map((k) => `${(r as Record<string, any>)[k] ?? ""}`).join(" ").toLowerCase();
      return terms.every((t) => text.includes(t));
    });
    downloadCsv(
      `${g.deviceName || g.name}-logs`,
      ["Time", "Gateway", "Source", "Level", "Message"],
      rows.map((r) => [new Date(r.ts).toISOString(), r.gatewayName, r.source, r.level, r.message])
    );
  }

  /** A link in the panel (the Connectors table's "Configure"): the gateway's page on that section. */
  openGatewaySectionFromPanel(section: GatewaySection): void {
    if (this.selectedGateway) {
      this.showGateway(this.selectedGateway, section);
    }
  }

  /** How long one statistics report counts as activity: 1.5 reporting periods (the gateway's setting; 2 minutes at least). */
  activityStaleMs(g: GatewayRow): number {
    const period = Number(g.generalConfiguration?.statistics?.statsSendPeriodInSeconds) || 3600;
    return Math.max(period * 1.5, 120) * 1000;
  }

  /** A section of the page: kept in the URL (rewriting the entry, not adding one), so a reload lands on it. */
  selectGatewaySection(id: string): void {
    this.gatewaySection = id as GatewaySection;
    if (this.selectedGateway) {
      this.writeUrlState(true);
    }
  }

  /** Show a gateway's page on a section; a different gateway reloads its connectors and configuration. */
  /** A figure in a gateway's row (its connectors): the gateway's page on that section, not the row's Overview. */
  openGatewaySection(row: Record<string, any>, section: GatewaySection, event?: Event): void {
    event?.stopPropagation();
    this.showGateway(row as GatewayRow, section);
  }

  /** The user opens a gateway's page: shown, and written to the URL (a new history entry from the table). */
  private showGateway(g: GatewayRow, section: GatewaySection): void {
    const fromTable = this.view !== "gateway";
    this.openGateway(g, section);
    this.writeUrlState(!fromTable);
  }

  // -- the URL's dashboard state -----------------------------------------------------

  /**
   * Where the dashboard is, into the URL (`writeDashboardUrlState`): the open
   * gateway — as ThingsBoard's own entity params, `{ entityId, entityName, … }`
   * — and its section, or the Settings page (`page`, and its section), or
   * nothing for the gateways table. `replace` rewrites the current history
   * entry (a section change) instead of adding one.
   */
  private writeUrlState(replace = false): void {
    const g = this.view === "gateway" ? this.selectedGateway : null;
    const params = g
      ? { entityId: { entityType: EntityType.DEVICE, id: g.id }, entityName: g.deviceName || g.name, entityLabel: g.deviceLabel, gatewaySection: this.gatewaySection }
      : this.page === "settings"
        ? { page: "settings", settingsSection: this.settingsSection }
        : {};
    writeDashboardUrlState(this.ctx, nestedUrlParams(this.host, params), replace);
  }

  /** The gateway the URL's state names (a device's id), and the section, if any (a change brings its new state string). */
  private urlState(state?: string | null): { gateway: { id: string; section: GatewaySection } | null; page: DashboardPage; settingsSection: string } {
    const params = readDashboardUrlState(this.ctx, state);
    const entity = params?.["entityId"];
    const section = GATEWAY_SECTIONS.includes(params?.["gatewaySection"]) ? (params?.["gatewaySection"] as GatewaySection) : "overview";
    const gateway = entity && typeof entity.id === "string" && entity.entityType === EntityType.DEVICE ? { id: entity.id as string, section } : null;
    const settingsSection = this.settingsSectionIds.includes(params?.["settingsSection"]) ? (params?.["settingsSection"] as string) : this.settingsSectionIds[0];
    return { gateway, page: params?.["page"] === "settings" ? "settings" : "gateways", settingsSection };
  }

  /** The gateway the URL names is still to come (the gateways load). */
  private pendingGatewayId = "";

  /** Follow the URL's state (a change brings its new state string): the gateway it names opens (once the gateways are loaded), none leaves the page. */
  private applyUrlState(state?: string | null): void {
    if (!ownsUrlState(this.host, readDashboardUrlState(this.ctx, state))) {
      return; // nested, and the URL is another app's (or Home's own page)
    }
    const wanted = this.urlState(state);
    if (!wanted.gateway) {
      // No gateway: the rail's page the URL names (Settings), else the gateways table.
      this.pendingGatewayId = "";
      if (this.view === "gateway") {
        this.leaveGatewayPage();
      }
      this.page = wanted.page;
      if (this.page === "settings") {
        this.settingsSection = wanted.settingsSection;
        this.org.wantSiteLinks();
        if (accessPageOf(this.settingsSection)) {
          this.access.load();
        }
      }
      this.selectView(this.page === "settings" ? "settings" : "gateways");
      this.cd.detectChanges();
      return;
    }
    const g = this.gateways.find((x) => x.id === wanted.gateway.id);
    if (!g) {
      // Shown once the gateways arrive — the page meanwhile, loading, not the table.
      this.pendingGatewayId = wanted.gateway.id;
      this.page = "gateways";
      this.view = "gateway";
      return;
    }
    this.pendingGatewayId = "";
    if (this.view !== "gateway" || this.selectedGateway?.id !== g.id) {
      this.openGateway(g, wanted.gateway.section);
    } else if (this.gatewaySection !== wanted.gateway.section) {
      this.gatewaySection = wanted.gateway.section;
    }
    this.cd.detectChanges();
  }

  /** The gateways just loaded: the page the URL asked for, or back to the table when that gateway isn't one. */
  private openPendingGateway(): void {
    if (!this.pendingGatewayId) {
      return;
    }
    const wanted = this.urlState();
    const g = this.gateways.find((x) => x.id === this.pendingGatewayId);
    this.pendingGatewayId = "";
    if (g) {
      this.openGateway(g, wanted.gateway?.section ?? "overview");
    } else if (this.view === "gateway" && !this.selectedGateway) {
      this.leaveGatewayPage();
      this.writeUrlState(true);
    }
  }

  private openGateway(g: GatewayRow, section: GatewaySection): void {
    this.gatewayPanelOpen = false;
    this.selectGateway(g);
    this.gatewaySection = section;
    this.page = "gateways";
    this.view = "gateway";
  }

  /** The gateway in hand (its page's, or its panel's): a different one reloads its connectors and configuration. */
  private selectGateway(g: GatewayRow): void {
    const changed = this.selectedGateway?.id !== g.id;
    this.closeConnector();
    this.closeAddConnector();
    this.closeManageApplication();
    this.endManageGateways();
    this.selectedGateway = g;
    if (changed) {
      this.connectors = [];
      this.connectorErrors = new Map();
      this.configValue = null;
      this.configDirty = false;
      this.configResetKey++;
      this.resetGatewayApplications();
      this.resetGatewaySite();
      this.rpcTarget = "";
      this.logSource = "";
      this.connectorPanelOpen = false;
      this.closeConnectorDialog();
      this.loadConnectors(g);
      this.loadConfig(g);
      this.subscribeConnectors(g);
      this.loadPanelErrors(g);
    }
    this.refreshGatewayDerived();
    this.applyAlarmScope();
  }

  /** The panel's Errors chart: the error count over the last day, bucketed by the hour — a bucket's errors are the count's rise within it (a drop is a restart: the new count is all new). */
  private loadPanelErrors(g: GatewayRow): void {
    const hour = 60 * 60 * 1000;
    const end = Date.now();
    const start = Math.floor(end / hour) * hour - 23 * hour;
    this.gatewayPanelErrorCategories = [];
    this.gatewayPanelErrorSeries = [];
    this.gatewayPanelErrorsLoading = true;
    this.ctx.attributeService
      .getEntityTimeseries({ entityType: EntityType.DEVICE, id: g.id }, [this.settings.errorsCountKey], start - 24 * hour, end, 5000, AggregationType.NONE, undefined, undefined, true, QUIET_REQUEST)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          if (this.selectedGateway?.id !== g.id) {
            return;
          }
          const points = ((data as Record<string, { ts: number; value: unknown }[]>)?.[this.settings.errorsCountKey] ?? [])
            .map((p) => ({ ts: Number(p.ts), value: Number(p.value) }))
            .filter((p) => isFinite(p.ts) && isFinite(p.value))
            .sort((a, b) => a.ts - b.ts);
          const buckets: number[] = new Array(24).fill(0);
          let prev: number | null = null;
          for (const p of points) {
            if (p.ts >= start) {
              const i = Math.min(23, Math.floor((p.ts - start) / hour));
              buckets[i] += prev === null ? 0 : p.value >= prev ? p.value - prev : p.value;
            }
            prev = p.value;
          }
          this.gatewayPanelErrorCategories = buckets.map((_, i) => formatClockTime(start + i * hour, true));
          // The status scale's red (an error count, not a plotted metric).
          this.gatewayPanelErrorSeries = [{ name: "Errors", color: "var(--c-bg-error-normal)", data: buckets }];
          this.gatewayPanelErrorsLoading = false;
          this.cd.detectChanges();
        },
        error: () => {
          this.gatewayPanelErrorsLoading = false;
          this.cd.detectChanges();
        },
      });
  }

  /** The page's own back button: the table, written to the URL. */
  closeGatewayPage(): void {
    this.leaveGatewayPage();
    this.writeUrlState();
  }

  /** Back to the gateways table. */
  private leaveGatewayPage(): void {
    if (this.view === "gateway") {
      this.view = "gateways";
    }
    this.connectorPanelOpen = false;
    this.selectedGateway = null;
    this.detailAlarms = [];
    this.connectors = [];
    this.configValue = null;
    this.gatewayPanelErrorCategories = [];
    this.gatewayPanelErrorSeries = [];
    this.closeConnector();
    this.removeConnectorsSubscription();
    this.refreshGatewayDerived();
  }

  /** The Overview's "Errors" action: the gateway's Logs section. */
  onGatewayStatAction(e: { id: string }): void {
    if (e.id === "logs" && this.selectedGateway) {
      this.gatewaySection = "logs";
    }
  }

  // -- add gateway ------------------------------------------------------------------

  openAddGateway(): void {
    this.addGatewayResetKey++;
    // The form starts on the default profile (its reset): the panel's icon is that profile's until another is picked.
    this.addGatewayType = this.settings.newGatewayDeviceType || "default";
    this.addGatewayOpen = true;
    if (!this.deviceProfileOptions.length) {
      this.ctx.entityService
        .getEntitySubtypesObservable(EntityType.DEVICE)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((types) => {
          const all = [...new Set([this.settings.newGatewayDeviceType, ...(types ?? [])])].filter(Boolean).sort((a, b) => a.localeCompare(b));
          this.deviceProfileOptions = all.map((t) => ({ value: t, label: t }));
          this.cd.detectChanges();
        });
    }
  }

  closeAddGateway(): void {
    this.addGatewayOpen = false;
  }

  /** A new device marked as a gateway; then its page, on the launch instructions. */
  onAddGateway(req: AddGatewayRequest): void {
    this.saving = true;
    const device = { name: req.name, label: req.label, type: req.type, additionalInfo: { gateway: true } } as Device;
    this.ctx.deviceService
      .saveDevice(device, QUIET_REQUEST)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (saved) => {
          this.saving = false;
          this.toasts.success(`Gateway ${req.label || req.name} added`);
          this.closeAddGateway();
          const row = this.emptyGatewayRow(saved.id.id, req);
          this.gateways = [...this.gateways, row].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
          this.applyFilters();
          this.showGateway(row, "overview");
          this.scheduleGatewaysRefresh();
          this.cd.detectChanges();
        },
        error: (err) => {
          this.saving = false;
          const msg = apiMessage(err);
          this.toasts.error(/already exists/i.test(msg) ? `A device named ${req.name} already exists.` : `Couldn't add the gateway${msg}`);
          this.cd.detectChanges();
        },
      });
  }

  askDeleteGateway(): void {
    this.deleteGatewayConfirm = this.selectedGateway;
  }

  confirmDeleteGateway(): void {
    const g = this.deleteGatewayConfirm;
    this.deleteGatewayConfirm = null;
    if (!g) {
      return;
    }
    this.saving = true;
    this.ctx.deviceService
      .deleteDevice(g.id, QUIET_REQUEST)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving = false;
          this.toasts.success(`Gateway ${g.name} deleted`);
          this.leaveGatewayPage();
          this.gateways = this.gateways.filter((x) => x.id !== g.id);
          this.applyFilters();
          this.scheduleGatewaysRefresh();
          this.cd.detectChanges();
        },
        error: (err) => {
          this.saving = false;
          this.toasts.error(`Couldn't delete ${g.name}${apiMessage(err)}`);
          this.cd.detectChanges();
        },
      });
  }

  // -- gateway settings (identity card + configuration form) ----------------------------

  onSettingsApply(): void {
    if (this.siteDirty) {
      this.siteIncludedInApply = true;
      this.saveGatewaySite();
    }
    if (this.applicationsDirty) {
      this.applicationsIncludedInApply = true;
      this.saveGatewayApplications();
    }
    if (this.configDirty) {
      this.configIncludedInApply = true;
      this.configForm?.submit();
    }
  }

  onSettingsCancel(): void {
    this.configResetKey++;
    this.resetGatewayApplications();
    this.resetGatewaySite();
  }

  /** The identity card saved (label, note): reload the gateways. */
  onSettingsSaved(g: GatewayRow): void {
    if (!this.configIncludedInApply && !this.applicationsIncludedInApply && !this.siteIncludedInApply) {
      this.toasts.success(`${g.name} saved`);
    }
    this.configIncludedInApply = false;
    this.scheduleGatewaysRefresh();
  }

  /** The open gateway's tags differ from its saved ones (the floating Apply shows). */
  get applicationsDirty(): boolean {
    const g = this.selectedGateway;
    return !!g && [...this.gatewayApplications].sort().join() !== [...g.applications].sort().join();
  }


  private resetGatewayApplications(): void {
    this.gatewayApplications = [...(this.selectedGateway?.applications ?? [])];
  }

  /** The open gateway's site differs from its saved one (the floating Apply shows). */
  get siteDirty(): boolean {
    const g = this.selectedGateway;
    return !!g && this.gatewaySite !== (g.siteId ?? "");
  }

  private resetGatewaySite(): void {
    this.gatewaySite = this.selectedGateway?.siteId ?? "";
  }

  /** The gateway's site to its relation (the old site's removed, the new one's made). */
  private saveGatewaySite(): void {
    const g = this.selectedGateway;
    if (!g) {
      return;
    }
    const siteId = this.gatewaySite || null;
    this.saving = true;
    this.syncGatewaySite(g, siteId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving = false;
          this.siteIncludedInApply = false;
          this.gatewaySite = siteId ?? "";
          this.applyFilters();
          this.toasts.success(`${g.name}'s site saved`);
          this.cd.detectChanges();
        },
        error: (err) => {
          this.saving = false;
          this.siteIncludedInApply = false;
          this.toasts.error(`Couldn't save ${g.name}'s site${apiMessage(err)}`);
          this.cd.detectChanges();
        },
      });
  }

  /**
   * Move a gateway into a site (or out of one). The relations follow — the
   * gateway's actual ones are looked up (its attribute may be out of date), any
   * from another site removed, the new site's made — then its site / market /
   * product line attributes, which the dashboard reads, and its row.
   */
  private syncGatewaySite(g: GatewayRow, siteId: string | null): Observable<unknown> {
    if ((g.siteId ?? null) === siteId) {
      return of(null);
    }
    const device: EntityId = { entityType: EntityType.DEVICE, id: g.id };
    const type = this.settings.siteGatewayRelation;
    const sites = new Set(this.sites.rows.map((s) => s.id));
    return this.ctx.entityRelationService.findByTo(device, QUIET_REQUEST).pipe(
      map((relations) => relations.filter((r) => r.type === type && r.from?.entityType === EntityType.ASSET && sites.has(r.from.id))),
      switchMap((current) => {
        const steps: Observable<unknown>[] = current
          .filter((r) => r.from.id !== siteId)
          .map((r) => this.ctx.entityRelationService.deleteRelation(r.from, type, device, QUIET_REQUEST));
        if (siteId && !current.some((r) => r.from.id === siteId)) {
          const relation: EntityRelation = { from: { entityType: EntityType.ASSET, id: siteId }, to: device, type, typeGroup: RelationTypeGroup.COMMON };
          steps.push(this.ctx.entityRelationService.saveRelation(relation, QUIET_REQUEST));
        }
        return steps.length ? forkJoin(steps) : of(null);
      }),
      switchMap(() => this.siteRefs(siteId)),
      switchMap((refs) => this.writeGatewayRefs(g, refs)),
      map(() => {
        g.siteId = siteId;
        return null;
      })
    );
  }

  /** The gateway's applications as ticked in its Settings: a relation from each to it (those unticked removed). */
  private saveGatewayApplications(): void {
    const g = this.selectedGateway;
    if (!g) {
      return;
    }
    this.saving = true;
    this.syncGatewayApplications(g, this.gatewayApplications)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving = false;
          this.applicationsIncludedInApply = false;
          this.gatewayApplications = [...g.applications];
          this.applyFilters();
          this.toasts.success(`${g.name}'s applications saved`);
          this.cd.detectChanges();
        },
        error: (err) => {
          this.saving = false;
          this.applicationsIncludedInApply = false;
          this.toasts.error(`Couldn't save ${g.name}'s applications${apiMessage(err)}`);
          this.cd.detectChanges();
        },
      });
  }

  /** The configuration form's submit: the gateway's shared attributes, then its credentials. */
  onConfigSubmit(g: GatewayRow, value: GatewayConfigValue): void {
    const s = this.settings;
    const ts = Date.now();
    const attributes: AttributeData[] = [
      { key: s.remoteLoggingLevelKey, value: value.logs.logLevel },
      { key: s.logsConfigurationKey, value: buildLogsConfiguration(value.logs, g.version) },
      { key: s.grpcConfigurationKey, value: { ...value.grpc, ts } },
      { key: s.storageConfigurationKey, value: { ...value.storage, ts } },
      { key: s.generalConfigurationKey, value: { ...value.thingsboard, ts } },
    ];
    this.saving = true;
    this.ctx.attributeService
      .saveEntityAttributes({ entityType: EntityType.DEVICE, id: g.id }, AttributeScope.SHARED_SCOPE, attributes, QUIET_REQUEST)
      .pipe(
        switchMap(() => this.updateCredentials(g.id, value.thingsboard.security)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: () => {
          this.saving = false;
          this.configIncludedInApply = false;
          this.configValue = value;
          this.configResetKey++;
          this.toasts.success(`${g.name}'s configuration saved`);
          this.scheduleGatewaysRefresh();
          this.cd.detectChanges();
        },
        error: (err) => {
          this.saving = false;
          this.configIncludedInApply = false;
          this.toasts.error(`Couldn't save ${g.name}'s configuration${apiMessage(err)}`);
          this.cd.detectChanges();
        },
      });
  }

  /** Remote configuration switched off in the form: confirm by typing the gateway's name. */
  onRemoteConfigurationOff(): void {
    this.remoteOffTyped = "";
    this.remoteOffConfirm = true;
  }

  confirmRemoteOff(): void {
    const g = this.selectedGateway;
    this.remoteOffConfirm = false;
    if (!g || this.remoteOffTyped.trim() !== g.deviceName) {
      this.configForm?.keepRemoteConfiguration();
      this.toasts.warn("The name didn't match — remote configuration stays on.");
    }
  }

  cancelRemoteOff(): void {
    this.remoteOffConfirm = false;
    this.configForm?.keepRemoteConfiguration();
  }

  // -- connectors ---------------------------------------------------------------------

  /** A row: its connector in the configuration card beside the table. */
  onConnectorRowClick(row: Record<string, any>): void {
    this.openConnector(row as ConnectorRow);
  }

  private openConnector(c: ConnectorRow): void {
    this.closeAddConnector();
    const changed = this.selectedConnector?.key !== c.key;
    this.selectedConnector = c;
    if (changed) {
      this.connectorResetKey++;
      this.connectorDirty = false;
    }
  }

  closeConnector(): void {
    this.selectedConnector = null;
    this.connectorDirty = false;
  }

  /** A row's RPC action: RPC to the connector, in the side panel. */
  openConnectorRpc(c: ConnectorRow): void {
    this.openConnectorPanel(c, "rpc");
  }

  /** A row's logs action: the connector's lines (its own and its converter's) in the side panel. */
  openConnectorLogs(c: ConnectorRow): void {
    this.openConnectorPanel(c, "logs");
  }

  /** The connector side panel (as the other dashboards' detail panels) on a tab; already open, it switches connector / tab in place. */
  private openConnectorPanel(c: ConnectorRow, tab: "rpc" | "logs"): void {
    const g = this.selectedGateway;
    this.panelConnector = c;
    this.connectorPanelLogGateways = g ? [{ id: g.id, name: g.name, channels: connectorLogKeys(c.key) }] : [];
    this.connectorPanelTab = tab;
    if (this.connectorPanelOpen) {
      this.connectorPanelRef?.selectTab(tab);
    }
    this.connectorPanelOpen = true;
  }

  closeConnectorPanel(): void {
    this.connectorPanelOpen = false;
  }

  /** The panel's subtitle: the connector's type, and its gateway. */
  get connectorPanelSubtitle(): string {
    const c = this.panelConnector;
    return c ? `${connectorTypeLabel(c.connector.type)} · ${this.selectedGateway?.name ?? ""}` : "";
  }

  /** A window picked for the logs (a preset): the custom range, if any, goes. */
  onLogTimeframe(id: string): void {
    this.logTimeframe = id;
    this.logRange = null;
  }

  /** The logs picker's calendar: the date-range panel opens at it — or closes, when it's open (any other click outside closes it on its own). */
  openLogRangePicker(anchor: HTMLElement): void {
    if (this.logRangePickerOpen) {
      this.logRangePickerOpen = false;
      return;
    }
    this.logRangeAnchor = anchor;
    this.logRangePickerOpen = true;
  }

  /** A range applied in the panel: the logs read exactly that span. */
  onLogRangeApplied(range: TbDateRange): void {
    this.logRangePickerOpen = false;
    this.logTimeframe = TB_CUSTOM_TIMEFRAME;
    this.logRange = range;
  }

  setLogSource(key: string): void {
    this.logSource = key;
    this.refreshGatewayScopes();
  }

  /** The Connectors tab's switch: the connector moves between the shared (enabled) and server (disabled) scopes. */
  toggleConnector(row: ConnectorRow, on: boolean): void {
    const g = this.selectedGateway;
    if (!g || row.enabled === on || this.saving) {
      return;
    }
    const s = this.settings;
    const entity = { entityType: EntityType.DEVICE, id: g.id };
    const active = g.activeConnectors.filter((n) => n !== row.key);
    const inactive = g.inactiveConnectors.filter((n) => n !== row.key);
    (on ? active : inactive).push(row.key);
    const newScope = on ? AttributeScope.SHARED_SCOPE : AttributeScope.SERVER_SCOPE;
    const oldScope = on ? AttributeScope.SERVER_SCOPE : AttributeScope.SHARED_SCOPE;
    const connector = { ...row.connector, ts: Date.now() };
    row.enabled = on;
    this.saving = true;
    this.ctx.attributeService
      .saveEntityAttributes(entity, newScope, [{ key: row.key, value: connector }], QUIET_REQUEST)
      .pipe(
        switchMap(() =>
          forkJoin([
            this.ctx.attributeService.saveEntityAttributes(entity, AttributeScope.SHARED_SCOPE, [{ key: s.activeConnectorsKey, value: active }], QUIET_REQUEST),
            this.ctx.attributeService.saveEntityAttributes(entity, AttributeScope.SERVER_SCOPE, [{ key: s.inactiveConnectorsKey, value: inactive }], QUIET_REQUEST),
            this.ctx.attributeService.deleteEntityAttributes(entity, oldScope, [{ key: row.key, value: null }], QUIET_REQUEST).pipe(catchError(() => of(null))),
          ])
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: () => {
          this.saving = false;
          g.activeConnectors = active;
          g.inactiveConnectors = inactive;
          this.toasts.success(`${row.key} ${on ? "enabled" : "disabled"}`);
          this.scheduleConnectorsRefresh();
          this.scheduleGatewaysRefresh();
          this.cd.detectChanges();
        },
        error: (err) => {
          this.saving = false;
          row.enabled = !on;
          this.toasts.error(`Couldn't ${on ? "enable" : "disable"} ${row.key}${apiMessage(err)}`);
          this.cd.detectChanges();
        },
      });
  }

  openAddConnector(): void {
    if (!this.selectedGateway) {
      return;
    }
    this.closeConnector();
    this.addConnectorResetKey++;
    this.addConnectorOpen = true;
  }

  // -- device templates ------------------------------------------------------------------------

  /** The tenant, whose server attribute holds the templates. */
  private get tenantEntity(): EntityId | null {
    const id = this.ctx.currentUser?.tenantId;
    return id ? { entityType: EntityType.TENANT, id } : null;
  }

  /** The other templates' names (a template's name is unique). */
  get templateNames(): string[] {
    return this.deviceTemplates.filter((t) => t.id !== this.editingTemplate?.id).map((t) => t.name);
  }

  get templatePanelSubtitle(): string {
    return this.editingTemplate ? "Template" : this.templateSourceName ? `From ${this.templateSourceName}` : "";
  }

  /** Read one of the tenant's server attributes (the templates). */
  private loadTenantAttribute(key: string, apply: (value: unknown) => void): void {
    const tenant = this.tenantEntity;
    if (!tenant) {
      return;
    }
    this.ctx.attributeService
      .getEntityAttributes(tenant, AttributeScope.SERVER_SCOPE, [key], QUIET_REQUEST)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((attrs) => {
        apply(attrs.find((a) => a.key === key)?.value);
        this.cd.detectChanges();
      });
  }

  /** Write one of the tenant's server attributes: `saved` takes the value in hand, then a toast. */
  private saveTenantAttribute(key: string, value: unknown, what: string, success: string, saved: () => void): void {
    const tenant = this.tenantEntity;
    if (!tenant) {
      this.toasts.error(`The ${what} need a tenant user.`);
      return;
    }
    this.saving = true;
    this.ctx.attributeService
      .saveEntityAttributes(tenant, AttributeScope.SERVER_SCOPE, [{ key, value }], QUIET_REQUEST)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving = false;
          saved();
          this.toasts.success(success);
          this.cd.detectChanges();
        },
        error: (err) => {
          this.saving = false;
          this.toasts.error(`Couldn't save the ${what}${apiMessage(err)}`);
          this.cd.detectChanges();
        },
      });
  }

  private loadTemplates(): void {
    this.loadTenantAttribute(this.settings.deviceTemplatesKey, (value) => (this.deviceTemplates = parseDeviceTemplates(value)));
  }

  /** Write the templates to the tenant attribute; shown at once, with a toast. */
  private saveTemplates(templates: DeviceTemplate[], message: string, done?: () => void): void {
    this.saveTenantAttribute(this.settings.deviceTemplatesKey, templates, "device templates", message, () => {
      this.deviceTemplates = templates;
      done?.();
    });
  }

  openAddTemplate(): void {
    this.openTemplatePanel(null, null, "");
  }

  openEditTemplate(t: DeviceTemplate): void {
    this.openTemplatePanel(t, null, "");
  }

  /** The configuration card's "Save device as template": a new template from one of the open connector's devices (picked in the panel). */
  saveDeviceAsTemplate(): void {
    const c = this.selectedConnector;
    if (!c) {
      return;
    }
    this.openTemplatePanel(null, { type: c.connector.type, config: c.connector.configurationJson ?? {} }, c.key);
  }

  /**
   * The connector dialog's "Save device as template": a new template from one
   * of that connector's devices — its configuration as it stands in the dialog
   * (edits in hand included), else as saved.
   */
  saveDialogDeviceAsTemplate(): void {
    const row = this.connectorDialogRow;
    if (!row) {
      return;
    }
    const source = this.connectorQuickForm?.templateSource ?? { type: row.connector.type, config: row.connector.configurationJson ?? {} };
    this.openTemplateDialog(source, row.key);
  }

  private openTemplateDialog(source: DeviceTemplateSource, sourceName: string): void {
    this.editingTemplate = null;
    this.templateSource = source;
    this.templateSourceName = sourceName;
    this.templateResetKey++;
    this.templateDialogOpen = true;
  }

  closeTemplateDialog(): void {
    this.templateDialogOpen = false;
  }

  /** The template dialog's "Add template": the form submits — or shows what's missing. */
  submitTemplateDialog(): void {
    this.templateDialogForm?.submit();
  }

  private openTemplatePanel(editing: DeviceTemplate | null, source: DeviceTemplateSource | null, sourceName: string): void {
    this.editingTemplate = editing;
    this.templateSource = source;
    this.templateSourceName = sourceName;
    this.templateResetKey++;
    this.templatePanelOpen = true;
  }

  closeTemplatePanel(): void {
    this.templatePanelOpen = false;
  }

  /** The template panel's Save: the draft as the template (a new one, or the edited one in its place). */
  onTemplateSubmit(draft: DeviceTemplateDraft): void {
    const existing = this.editingTemplate;
    const template: DeviceTemplate = { ...draft, id: existing?.id ?? `tpl-${Date.now()}`, ts: Date.now() };
    const list = existing ? this.deviceTemplates.map((t) => (t.id === existing.id ? template : t)) : [...this.deviceTemplates, template];
    this.saveTemplates(list, `Template ${template.name} saved`, () => {
      this.closeTemplatePanel();
      this.closeTemplateDialog();
    });
  }

  /** "Delete (n)" on the managed templates: confirm first. */
  askDeleteTemplates(list: DeviceTemplate[]): void {
    if (list.length) {
      this.deleteTemplatesConfirm = list;
    }
  }

  get deleteTemplatesMessage(): string {
    const list = this.deleteTemplatesConfirm;
    return list.length === 1
      ? `Template ${list[0].name} will be removed; devices added from it are unaffected.`
      : `${list.length} templates will be removed; devices added from them are unaffected.`;
  }

  confirmDeleteTemplates(): void {
    const list = this.deleteTemplatesConfirm;
    this.deleteTemplatesConfirm = [];
    if (!list.length) {
      return;
    }
    const ids = new Set(list.map((t) => t.id));
    this.saveTemplates(
      this.deviceTemplates.filter((x) => !ids.has(x.id)),
      list.length === 1 ? `Template ${list[0].name} deleted` : `${list.length} templates deleted`
    );
  }

  // -- applications ----------------------------------------------------------------------------

  /** Each gateway's applications out of the relations just read (a new list, so the Settings page's counts follow); the open gateway's field too, unless edited. */
  private applyGatewayApps(): void {
    const edited = this.applicationsDirty;
    this.gateways = this.gateways.map((g) => {
      g.applications = this.gatewayApps.get(g.id) ?? [];
      return g;
    });
    if (!edited) {
      this.resetGatewayApplications();
    }
    this.applyFilters();
  }

  /**
   * Apply these applications to a gateway, and no others: the gateway's
   * actual relations from the applications are looked up (a site's to it is
   * the same type — only an application's counts), those it no longer has
   * removed, the new ones made; then its row (in the applications' order).
   */
  private syncGatewayApplications(g: GatewayRow, ids: string[]): Observable<unknown> {
    const next = this.applications.map((a) => a.id).filter((id) => ids.includes(id));
    const device: EntityId = { entityType: EntityType.DEVICE, id: g.id };
    const type = this.settings.applicationGatewayRelation;
    const apps = new Set(this.applications.map((a) => a.id));
    return this.ctx.entityRelationService.findByTo(device, QUIET_REQUEST).pipe(
      map((relations) => relations.filter((r) => r.type === type && r.from?.entityType === EntityType.ASSET && apps.has(r.from.id)).map((r) => r.from.id)),
      switchMap((current) => {
        const steps: Observable<unknown>[] = [
          ...current.filter((id) => !next.includes(id)).map((id) => this.ctx.entityRelationService.deleteRelation({ entityType: EntityType.ASSET, id }, type, device, QUIET_REQUEST)),
          ...next
            .filter((id) => !current.includes(id))
            .map((id) => {
              const relation: EntityRelation = { from: { entityType: EntityType.ASSET, id }, to: device, type, typeGroup: RelationTypeGroup.COMMON };
              return this.ctx.entityRelationService.saveRelation(relation, QUIET_REQUEST);
            }),
        ];
        return steps.length ? forkJoin(steps) : of(null);
      }),
      map(() => {
        g.applications = next;
        this.gatewayApps.set(g.id, next);
        // A new list: the Settings page's counts follow.
        this.gateways = [...this.gateways];
        return null;
      })
    );
  }

  closeAddConnector(): void {
    this.addConnectorOpen = false;
  }

  /** A new connector: enabled (a shared attribute), listed in `active_connectors`. */
  onAddConnector(connector: GatewayConnector, templateApplications: string[] = []): void {
    this.addConnector(connector, templateApplications, () => {
      this.closeAddConnector();
      this.gatewaySection = "connectors";
    });
  }

  /** A new connector on the gateway in hand: enabled (a shared attribute), listed in `active_connectors`; its templates' applications tag the gateway. */
  private addConnector(connector: GatewayConnector, templateApplications: string[], done: () => void): void {
    const g = this.selectedGateway;
    if (!g) {
      return;
    }
    const value = connectorToSave(connector, g.version);
    const active = [...g.activeConnectors.filter((n) => n !== value.name), value.name];
    this.writeConnector(g, value, AttributeScope.SHARED_SCOPE, active, g.inactiveConnectors, null, `Connector ${value.name} added`, () => {
      done();
      this.tagGatewayFromTemplates(g, templateApplications);
    });
  }

  // -- the new-connector dialog (the gateway panel's Connectors card) -------------------------------

  openNewConnector(): void {
    if (!this.selectedGateway) {
      return;
    }
    this.newConnectorResetKey++;
    this.newConnectorOpen = true;
  }

  closeNewConnector(): void {
    this.newConnectorOpen = false;
  }

  /** The dialog's "Create connector": the form submits — or shows what's missing. */
  submitNewConnector(): void {
    this.newConnectorForm?.submit();
  }

  /** The dialog's form submitted: the connector is added, the dialog closes and the panel's card lists it. */
  onNewConnector(connector: GatewayConnector, templateApplications: string[] = []): void {
    this.addConnector(connector, templateApplications, () => {
      this.closeNewConnector();
      this.refreshGatewayDerived();
    });
  }

  /**
   * The applications of the templates a connector added devices from, onto its
   * gateway once the connector is saved: those not yet applied to it get their
   * relation to it.
   */
  private tagGatewayFromTemplates(g: GatewayRow, ids: string[]): void {
    const known = new Set(this.applications.map((a) => a.id));
    const missing = ids.filter((id) => known.has(id) && !g.applications.includes(id));
    if (!missing.length) {
      return;
    }
    const names = this.applications
      .filter((a) => missing.includes(a.id))
      .map(applicationName)
      .join(", ");
    this.syncGatewayApplications(g, [...g.applications, ...missing])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          if (this.selectedGateway?.id === g.id) {
            // Its Settings' application field follows — the new ones joining any edit in hand there.
            this.gatewayApplications = this.applications.map((a) => a.id).filter((id) => this.gatewayApplications.includes(id) || missing.includes(id));
          }
          this.applyFilters();
          this.toasts.success(`${g.name} tagged ${names} (from the template)`);
          this.cd.detectChanges();
        },
        error: (err) => {
          this.toasts.error(`Couldn't tag ${g.name} with ${names}${apiMessage(err)}`);
          this.cd.detectChanges();
        },
      });
  }

  /** The connector panel's Apply: the connector rewritten in its scope (renamed: the old attribute goes, the list follows). */
  onConnectorSubmit(connector: GatewayConnector, templateApplications: string[] = []): void {
    const g = this.selectedGateway;
    const row = this.selectedConnector;
    if (!g || !row) {
      return;
    }
    const value = connectorToSave(connector, g.version);
    const scope = row.enabled ? AttributeScope.SHARED_SCOPE : AttributeScope.SERVER_SCOPE;
    const rename = value.name !== row.key ? row.key : null;
    const replace = (list: string[], inList: boolean) => (inList ? [...list.filter((n) => n !== row.key && n !== value.name), value.name] : list.filter((n) => n !== value.name));
    const active = replace(g.activeConnectors, row.enabled);
    const inactive = replace(g.inactiveConnectors, !row.enabled);
    this.writeConnector(g, value, scope, active, inactive, rename, `Connector ${value.name} saved`, () => {
      this.connectorDirty = false;
      this.tagGatewayFromTemplates(g, templateApplications);
      if (rename) {
        this.closeConnector();
        return;
      }
      // The saved values are the form's new baseline at once (its buttons go), before the reload confirms them.
      const saved: ConnectorRow = { ...row, connector: value };
      this.selectedConnector = saved;
      this.connectors = this.connectors.map((c) => (c.key === row.key ? saved : c));
      this.connectorResetKey++;
    });
  }

  /** A row's delete action: the confirm dialog. */
  askDeleteConnector(c: ConnectorRow): void {
    this.deleteConnectorConfirm = c;
  }

  confirmDeleteConnector(): void {
    const g = this.selectedGateway;
    const row = this.deleteConnectorConfirm;
    this.deleteConnectorConfirm = null;
    if (!g || !row) {
      return;
    }
    const s = this.settings;
    const entity = { entityType: EntityType.DEVICE, id: g.id };
    const scope = row.enabled ? AttributeScope.SHARED_SCOPE : AttributeScope.SERVER_SCOPE;
    const active = g.activeConnectors.filter((n) => n !== row.key);
    const inactive = g.inactiveConnectors.filter((n) => n !== row.key);
    this.saving = true;
    forkJoin([
      this.ctx.attributeService.deleteEntityAttributes(entity, scope, [{ key: row.key, value: null }], QUIET_REQUEST),
      this.ctx.attributeService.saveEntityAttributes(entity, AttributeScope.SHARED_SCOPE, [{ key: s.activeConnectorsKey, value: active }], QUIET_REQUEST),
      this.ctx.attributeService.saveEntityAttributes(entity, AttributeScope.SERVER_SCOPE, [{ key: s.inactiveConnectorsKey, value: inactive }], QUIET_REQUEST),
    ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving = false;
          g.activeConnectors = active;
          g.inactiveConnectors = inactive;
          this.connectors = this.connectors.filter((c) => c.key !== row.key);
          this.closeConnector();
          this.toasts.success(`Connector ${row.key} deleted`);
          this.scheduleConnectorsRefresh();
          this.scheduleGatewaysRefresh();
          this.cd.detectChanges();
        },
        error: (err) => {
          this.saving = false;
          this.toasts.error(`Couldn't delete ${row.key}${apiMessage(err)}`);
          this.cd.detectChanges();
        },
      });
  }

  private writeConnector(
    g: GatewayRow,
    value: GatewayConnector,
    scope: AttributeScope,
    active: string[],
    inactive: string[],
    removeKey: string | null,
    message: string,
    done: () => void,
    /** The scope the connector leaves (it was enabled / disabled with this save): its copy there is removed. */
    leftScope: AttributeScope | null = null
  ): void {
    const s = this.settings;
    const entity = { entityType: EntityType.DEVICE, id: g.id };
    this.saving = true;
    this.ctx.attributeService
      .saveEntityAttributes(entity, scope, [{ key: value.name, value }], QUIET_REQUEST)
      .pipe(
        switchMap(() =>
          forkJoin([
            this.ctx.attributeService.saveEntityAttributes(entity, AttributeScope.SHARED_SCOPE, [{ key: s.activeConnectorsKey, value: active }], QUIET_REQUEST),
            this.ctx.attributeService.saveEntityAttributes(entity, AttributeScope.SERVER_SCOPE, [{ key: s.inactiveConnectorsKey, value: inactive }], QUIET_REQUEST),
            removeKey ? this.ctx.attributeService.deleteEntityAttributes(entity, scope, [{ key: removeKey, value: null }], QUIET_REQUEST).pipe(catchError(() => of(null))) : of(null),
            leftScope ? this.ctx.attributeService.deleteEntityAttributes(entity, leftScope, [{ key: value.name, value: null }], QUIET_REQUEST).pipe(catchError(() => of(null))) : of(null),
          ])
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: () => {
          this.saving = false;
          g.activeConnectors = active;
          g.inactiveConnectors = inactive;
          this.toasts.success(message);
          done();
          this.loadConnectors(g);
          this.scheduleGatewaysRefresh();
          this.cd.detectChanges();
        },
        error: (err) => {
          this.saving = false;
          this.toasts.error(`Couldn't save the connector${apiMessage(err)}`);
          this.cd.detectChanges();
        },
      });
  }

  // -- notifications from the panels' components --------------------------------------

  onNotify(e: { tone: ToastTone; message: string }): void {
    this.toasts.show(e.message, { tone: e.tone });
  }

  /** The custom statistics' "Add them in Settings": the Settings section. */
  onConfigureStatistics(): void {
    this.gatewaySection = "settings";
  }

  // -- alarms -------------------------------------------------------------------------

  clearAlarm(alarm: AlarmListItem): void {
    clearDashboardAlarm(this.alarmService, this.destroyRef, alarm, {
      // The list items are copies of the subscription's alarms: mark the source too.
      also: [this.allAlarms.find((a) => a.id === alarm.id)],
      // ignoreErrors: a failure is reported in the dashboard's own toast, not ThingsBoard's (at the page's foot).
      config: QUIET_REQUEST,
      onError: (err) => {
        this.toasts.error(`Couldn't clear the alarm${apiMessage(err)}`);
        this.cd.detectChanges();
      },
    });
  }

  // -- data: gateways ------------------------------------------------------------------

  /** The devices marked as gateways: ThingsBoard's `additionalInfo.gateway = true`. */
  private get gatewayFilter(): EntityFilter {
    return { type: AliasFilterType.entityType, entityType: EntityType.DEVICE } as EntityFilter;
  }

  private get gatewayKeyFilters(): KeyFilter[] {
    return [
      {
        key: { type: EntityKeyType.ENTITY_FIELD, key: "additionalInfo" },
        valueType: EntityKeyValueType.STRING,
        predicate: { type: FilterPredicateType.STRING, operation: StringOperation.CONTAINS, value: { defaultValue: this.settings.gatewayMarker }, ignoreCase: false },
      },
    ];
  }

  loadGateways(): void {
    const s = this.settings;
    const query: EntityDataQuery = {
      entityFilter: this.gatewayFilter,
      keyFilters: this.gatewayKeyFilters,
      pageLink: byNamePageLink(),
      entityFields: [
        { type: EntityKeyType.ENTITY_FIELD, key: "name" },
        { type: EntityKeyType.ENTITY_FIELD, key: "label" },
        { type: EntityKeyType.ENTITY_FIELD, key: "type" },
        { type: EntityKeyType.ENTITY_FIELD, key: "additionalInfo" },
        { type: EntityKeyType.ENTITY_FIELD, key: "createdTime" },
        ...OWNER_ENTITY_FIELDS,
      ],
      latestValues: [
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: "active" },
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: "lastConnectTime" },
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: "lastDisconnectTime" },
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: s.inactiveConnectorsKey },
        // Its site, market and product line by name (the backend's copy of the relations): the table's columns before those load.
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: s.siteAttributeKey },
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: s.marketAttributeKey },
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: s.productLineAttributeKey },
        { type: EntityKeyType.SHARED_ATTRIBUTE, key: s.activeConnectorsKey },
        { type: EntityKeyType.SHARED_ATTRIBUTE, key: s.generalConfigurationKey },
        { type: EntityKeyType.SHARED_ATTRIBUTE, key: s.remoteLoggingLevelKey },
        { type: EntityKeyType.CLIENT_ATTRIBUTE, key: s.versionKey },
        { type: EntityKeyType.CLIENT_ATTRIBUTE, key: s.generalConfigurationKey },
        { type: EntityKeyType.TIME_SERIES, key: s.errorsCountKey },
        { type: EntityKeyType.TIME_SERIES, key: s.serviceStatsKey },
        { type: EntityKeyType.TIME_SERIES, key: s.machineStatsKey },
      ],
    };
    this.ctx.entityService
      .findEntityDataByQuery(query, QUIET_REQUEST)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this.gateways = page.data.map((d) => this.toGatewayRow(d)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
          this.gatewaysLoading = false;
          this.applyFilters();
          this.applyDeviceNames();
          this.refreshSelectedGateway();
          this.openPendingGateway();
          this.cd.detectChanges();
        },
        error: () => {
          this.gatewaysLoading = false;
          this.cd.detectChanges();
        },
      });
  }

  private toGatewayRow(d: any): GatewayRow {
    const s = this.settings;
    const fields = d.latest?.[EntityKeyType.ENTITY_FIELD] ?? {};
    const server = d.latest?.[EntityKeyType.SERVER_ATTRIBUTE] ?? {};
    const shared = d.latest?.[EntityKeyType.SHARED_ATTRIBUTE] ?? {};
    const client = d.latest?.[EntityKeyType.CLIENT_ATTRIBUTE] ?? {};
    const ts = d.latest?.[EntityKeyType.TIME_SERIES] ?? {};
    const deviceName = fields["name"]?.value ?? "";
    const deviceLabel = fields["label"]?.value ?? "";
    // The configuration the gateway runs (its client copy), else the one set for it.
    const generalRaw = client[s.generalConfigurationKey]?.value ?? shared[s.generalConfigurationKey]?.value;
    const general = parseObject(generalRaw);
    return {
      id: d.entityId.id,
      name: deviceLabel || deviceName || "Unknown gateway",
      deviceName,
      deviceLabel,
      type: fields["type"]?.value ?? "",
      description: parseDescription(fields["additionalInfo"]?.value),
      owner: this.ownerOf(fields),
      createdTime: parseNumber(fields["createdTime"]?.value),
      status: gatewayStatus(server["active"]?.value, server["lastConnectTime"]?.value, server["lastDisconnectTime"]?.value),
      lastConnectTime: parseNumber(server["lastConnectTime"]?.value),
      lastDisconnectTime: parseNumber(server["lastDisconnectTime"]?.value),
      version: String(client[s.versionKey]?.value ?? ""),
      activeConnectors: parseStringArray(shared[s.activeConnectorsKey]?.value),
      inactiveConnectors: parseStringArray(server[s.inactiveConnectorsKey]?.value),
      errors: parseNumber(ts[s.errorsCountKey]?.value),
      generalConfiguration: Object.keys(general).length ? (general as GatewayRow["generalConfiguration"]) : null,
      remoteLoggingLevel: (shared[s.remoteLoggingLevelKey]?.value as GatewayLogLevel) ?? GatewayLogLevel.NONE,
      applications: this.gatewayApps.get(d.entityId.id) ?? [],
      siteId: this.refId("site", String(server[s.siteAttributeKey]?.value ?? "").trim()) || null,
      siteRef: String(server[s.siteAttributeKey]?.value ?? "").trim(),
      marketRef: String(server[s.marketAttributeKey]?.value ?? "").trim(),
      productLineRef: String(server[s.productLineAttributeKey]?.value ?? "").trim(),
      ...{ stats: latestStats(ts[s.serviceStatsKey]?.value, ts[s.machineStatsKey]?.value) },
    } as GatewayRow & { stats: Record<string, number | null> };
  }

  /** A gateway's owner (a customer, or the tenant itself); the tenant's title is kept for a gateway created before the query names it. */
  private ownerOf(fields: Record<string, { value?: unknown } | undefined>): string {
    const owner = ownerCustomer(fields);
    if (owner && ownerIsTenant(fields)) {
      this.tenantName = owner;
    }
    return owner;
  }

  /** A just-created gateway (the tenant's), before the query returns it. */
  private emptyGatewayRow(id: string, req: AddGatewayRequest): GatewayRow {
    return {
      id,
      name: req.label || req.name,
      deviceName: req.name,
      deviceLabel: req.label,
      type: req.type,
      description: "",
      owner: this.tenantName,
      status: "inactive",
      createdTime: Date.now(),
      lastConnectTime: null,
      lastDisconnectTime: null,
      version: "",
      activeConnectors: [],
      inactiveConnectors: [],
      errors: null,
      generalConfiguration: null,
      remoteLoggingLevel: GatewayLogLevel.NONE,
      applications: [],
      siteId: null,
      siteRef: "",
      marketRef: "",
      productLineRef: "",
    };
  }

  /** Live subscription over the gateways' attributes and counters; a change reloads them (debounced, first emission skipped). */
  private subscribeGateways(): void {
    const s = this.settings;
    subscribeLatestChanges(
      this.ctx,
      this.destroyRef,
      {
        entityFilter: this.gatewayFilter,
        keyFilters: this.gatewayKeyFilters,
        attributes: [
          "active",
          "lastConnectTime",
          "lastDisconnectTime",
          s.activeConnectorsKey,
          s.inactiveConnectorsKey,
          s.siteAttributeKey,
          s.marketAttributeKey,
          s.productLineAttributeKey,
          s.versionKey,
          s.generalConfigurationKey,
          s.remoteLoggingLevelKey,
        ],
        timeseries: [s.errorsCountKey, s.serviceStatsKey, s.machineStatsKey],
      },
      () => this.scheduleGatewaysRefresh(),
      (subscription) => (this.gatewaysSubscription = subscription)
    );
  }

  private scheduleGatewaysRefresh(): void {
    clearTimeout(this.gatewaysRefreshTimer);
    this.gatewaysRefreshTimer = setTimeout(() => this.loadGateways(), 300);
  }

  private gatewayById(id: string): GatewayRow | null {
    return this.gateways.find((g) => g.id === id) ?? null;
  }

  /** Keep the open page on the reloaded gateway (and reload its connectors when their lists changed). */
  private refreshSelectedGateway(): void {
    if (!this.selectedGateway) {
      return;
    }
    const fresh = this.gatewayById(this.selectedGateway.id);
    if (!fresh) {
      this.leaveGatewayPage();
      return;
    }
    const before = this.selectedGateway;
    const appsEdited = this.applicationsDirty;
    const siteEdited = this.siteDirty;
    this.selectedGateway = fresh;
    if (!appsEdited) {
      this.resetGatewayApplications();
    }
    if (!siteEdited) {
      this.resetGatewaySite();
    }
    const listsChanged = before.activeConnectors.join() !== fresh.activeConnectors.join() || before.inactiveConnectors.join() !== fresh.inactiveConnectors.join();
    if (listsChanged || before.status !== fresh.status) {
      this.scheduleConnectorsRefresh();
    }
    this.refreshGatewayDerived();
  }

  /** The Overview's figures and devices, and the Logs / Statistics tabs' scope, for the selected gateway. */
  private refreshGatewayDerived(): void {
    this.refreshGatewayScopes();
    const g = this.selectedGateway as (GatewayRow & { stats?: Record<string, number | null> }) | null;
    if (!g) {
      this.gatewayStats = [];
      this.gatewayPanelStats = [];
      this.gatewayPanelConnectors = [];
      this.gatewayDevices = [];
      return;
    }
    this.gatewayDevices = this.devices.filter((d) => d.gatewayId === g.id);
    const stats = g.stats ?? {};
    const items = this.gatewayStatItems(g);
    for (const id of STAT_KPIS) {
      const m = STAT_METRICS.find((x) => x.id === id);
      if (m && stats[id] !== null && stats[id] !== undefined) {
        items.push({ label: m.label, value: fmtNumber(stats[id], m.unit === "%" ? 1 : 0), unit: m.unit, info: m.info });
      }
    }
    this.gatewayStats = items;
    const base = this.gatewayStatItems(g);
    const pick = (label: string) => base.find((i) => i.label === label);
    const uptime = g.status === "active" && g.lastConnectTime ? formatDuration(Date.now() - g.lastConnectTime) : "—";
    this.gatewayPanelStats = [pick("Version"), pick("Profile"), { label: "Uptime", value: uptime }, pick("Devices")].filter((i): i is StatItem => !!i);
    // By name, whatever their state (a connector keeps its row when it's switched on or off), each with its error count (as the
    // gateway reports it) and the devices that came through it.
    const through = (name: string) => this.gatewayDevices.filter((d) => d.connectorName === name).length;
    const row = (name: string, enabled: boolean) => ({ key: name, name, enabled, errors: this.connectorErrors.get(name) ?? null, devices: through(name) });
    this.gatewayPanelConnectors = [...g.activeConnectors.map((name) => row(name, true)), ...g.inactiveConnectors.map((name) => row(name, false))].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    // The picker's sections: General (the Connection card over its folded cards), Storage, gRPC server, Logs.
    const sections = GATEWAY_CONFIG_SECTIONS.filter((x) => !x.inGeneral);
    this.gatewayPanelSettingsOptions = this.sameList(
      this.gatewayPanelSettingsOptions,
      sections.map((x) => ({ id: x.id, label: x.label, icon: x.icon, tooltip: x.label })),
      (x) => x.id
    );
  }

  /** A gateway's figures (its page's Gateway card, its panel): status, version, profile, connection times, errors, connectors, devices. */
  private gatewayStatItems(g: GatewayRow): StatItem[] {
    const devices = this.devices.filter((d) => d.gatewayId === g.id);
    const activeDevices = devices.filter((d) => d.active).length;
    const meta = GATEWAY_STATUS_META[g.status];
    return [
      { label: "Status", pill: { label: meta.label, icon: meta.icon, tone: meta.tone } },
      { label: "Version", value: g.version || "—" },
      { label: "Profile", value: g.type || "—" },
      { label: "Last connected", value: relativeTime(g.lastConnectTime), info: g.lastConnectTime ? formatWhen(g.lastConnectTime) : "" },
      { label: "Last disconnected", value: relativeTime(g.lastDisconnectTime), info: g.lastDisconnectTime ? formatWhen(g.lastDisconnectTime) : "" },
      { label: "Errors", value: fmtNumber(g.errors), action: { id: "logs", icon: "receipt_long", label: "View logs" } },
      { label: "Connectors", value: String(g.activeConnectors.length), unit: g.inactiveConnectors.length ? `· ${g.inactiveConnectors.length} off` : "" },
      { label: "Devices", value: String(devices.length), unit: devices.length ? `· ${activeDevices} active` : "" },
    ];
  }

  // -- data: devices --------------------------------------------------------------------

  /** The devices that last connected through a gateway (ThingsBoard's `additionalInfo.lastConnectedGateway`). */
  private get deviceKeyFilters(): KeyFilter[] {
    return [
      {
        key: { type: EntityKeyType.ENTITY_FIELD, key: "additionalInfo" },
        valueType: EntityKeyValueType.STRING,
        predicate: { type: FilterPredicateType.STRING, operation: StringOperation.CONTAINS, value: { defaultValue: `"${this.settings.lastConnectedGatewayKey}"` }, ignoreCase: false },
      },
    ];
  }

  loadDevices(): void {
    const s = this.settings;
    const query: EntityDataQuery = {
      entityFilter: this.gatewayFilter,
      keyFilters: this.deviceKeyFilters,
      pageLink: byNamePageLink(4096),
      entityFields: [
        { type: EntityKeyType.ENTITY_FIELD, key: "name" },
        { type: EntityKeyType.ENTITY_FIELD, key: "label" },
        { type: EntityKeyType.ENTITY_FIELD, key: "type" },
        { type: EntityKeyType.ENTITY_FIELD, key: "additionalInfo" },
      ],
      latestValues: [
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: "active" },
        // Any scope: the gateway publishes it as the device's own (client) attribute.
        { type: EntityKeyType.ATTRIBUTE, key: s.deviceConnectorTypeKey },
        { type: EntityKeyType.ATTRIBUTE, key: s.deviceConnectorNameKey },
      ],
    };
    this.ctx.entityService
      .findEntityDataByQuery(query, QUIET_REQUEST)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this.devices = page.data
            .map((d) => {
              const fields = d.latest?.[EntityKeyType.ENTITY_FIELD] ?? {};
              const server = d.latest?.[EntityKeyType.SERVER_ATTRIBUTE] ?? {};
              const attributes = d.latest?.[EntityKeyType.ATTRIBUTE] ?? {};
              const deviceName = fields["name"]?.value ?? "";
              const deviceLabel = fields["label"]?.value ?? "";
              return {
                id: d.entityId.id,
                name: deviceLabel || deviceName,
                deviceName,
                deviceLabel,
                type: fields["type"]?.value ?? "",
                gatewayId: lastConnectedGatewayId(fields["additionalInfo"]?.value, s.lastConnectedGatewayKey),
                gatewayName: "",
                connectorType: String(attributes[s.deviceConnectorTypeKey]?.value ?? ""),
                connectorName: String(attributes[s.deviceConnectorNameKey]?.value ?? ""),
                active: String(server["active"]?.value ?? "") !== "false",
              } as GatewayDeviceRow;
            })
            .filter((d) => d.gatewayId)
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
          this.devicesLoading = false;
          this.applyFilters(); // the gateways' device counts
          this.applyDeviceNames();
          this.refreshGatewayDerived();
          this.cd.detectChanges();
        },
        error: () => {
          this.devicesLoading = false;
          this.cd.detectChanges();
        },
      });
  }

  private subscribeDevices(): void {
    const s = this.settings;
    subscribeLatestChanges(
      this.ctx,
      this.destroyRef,
      { entityFilter: this.gatewayFilter, keyFilters: this.deviceKeyFilters, attributes: ["active", s.deviceConnectorTypeKey, s.deviceConnectorNameKey] },
      () => {
        clearTimeout(this.devicesRefreshTimer);
        this.devicesRefreshTimer = setTimeout(() => this.loadDevices(), 500);
      },
      (subscription) => (this.devicesSubscription = subscription)
    );
  }

  // -- data: the selected gateway's connectors --------------------------------------------

  /** The gateway's three attribute scopes: the connectors set for it (shared / server) and what it reports (client). */
  private loadConnectors(g: GatewayRow): void {
    const entity = { entityType: EntityType.DEVICE, id: g.id };
    this.connectorsLoading = true;
    forkJoin([
      this.ctx.attributeService.getEntityAttributes(entity, AttributeScope.SHARED_SCOPE, undefined, QUIET_REQUEST).pipe(catchError(() => of([] as AttributeData[]))),
      this.ctx.attributeService.getEntityAttributes(entity, AttributeScope.SERVER_SCOPE, undefined, QUIET_REQUEST).pipe(catchError(() => of([] as AttributeData[]))),
      this.ctx.attributeService.getEntityAttributes(entity, AttributeScope.CLIENT_SCOPE, undefined, QUIET_REQUEST).pipe(catchError(() => of([] as AttributeData[]))),
    ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([shared, server, client]) => {
        if (this.selectedGateway?.id !== g.id) {
          return;
        }
        const fresh = this.gatewayById(g.id) ?? g;
        const byKey = (list: AttributeData[]) => new Map(list.map((a) => [a.key, a]));
        const sharedMap = byKey(shared);
        const serverMap = byKey(server);
        const clientMap = byKey(client);
        const rows: ConnectorRow[] = [];
        const add = (name: string, enabled: boolean) => {
          const attr = (enabled ? sharedMap : serverMap).get(name) ?? (enabled ? serverMap : sharedMap).get(name);
          const connector = parseConnector(attr?.value);
          if (!connector) {
            return;
          }
          const reported = parseConnector(clientMap.get(name)?.value);
          rows.push({
            key: name,
            connector,
            enabled,
            reported,
            synced: connectorSynced(connector, reported, fresh.status === "active"),
            errors: this.connectorErrors.get(name) ?? null,
          });
        };
        fresh.activeConnectors.forEach((n) => add(n, true));
        fresh.inactiveConnectors.forEach((n) => add(n, false));
        rows.sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
        this.connectors = rows.map((r) => ({ ...r, typeLabel: connectorTypeLabel(r.connector.type) }) as ConnectorRow);
        this.connectorsLoading = false;
        if (this.selectedConnector) {
          const same = this.connectors.find((c) => c.key === this.selectedConnector!.key);
          if (same) {
            this.selectedConnector = same;
          } else if (!this.saving) {
            this.closeConnector();
          }
        }
        this.subscribeConnectors(fresh);
        this.cd.detectChanges();
      });
  }

  private scheduleConnectorsRefresh(): void {
    clearTimeout(this.connectorsRefreshTimer);
    this.connectorsRefreshTimer = setTimeout(() => {
      if (this.selectedGateway) {
        this.loadConnectors(this.selectedGateway);
      }
    }, 400);
  }

  /** The selected gateway's connector attributes (any scope) and error counters: a change reloads the connectors; the counters fill the rows. */
  private subscribeConnectors(g: GatewayRow): void {
    const s = this.settings;
    const names = [...new Set([...g.activeConnectors, ...g.inactiveConnectors])];
    const keys = [s.activeConnectorsKey, s.inactiveConnectorsKey, ...names];
    const signature = `${g.id}|${keys.join(",")}`;
    if (this.connectorsSubscription?.gmSignature === signature) {
      return;
    }
    this.removeConnectorsSubscription();
    const datasources: Datasource[] = [
      {
        type: DatasourceType.entity,
        name: "gateway-connectors",
        entityFilter: { type: AliasFilterType.singleEntity, singleEntity: { entityType: EntityType.DEVICE, id: g.id } } as EntityFilter,
        dataKeys: [
          ...keys.map((key) => ({ name: key, label: key, type: DataKeyType.attribute, settings: {} })),
          ...names.map((n) => ({ name: `${n}_ERRORS_COUNT`, label: `${n}_ERRORS_COUNT`, type: DataKeyType.timeseries, settings: {} })),
        ],
      },
    ];
    let first = true;
    const options: WidgetSubscriptionOptions = {
      type: widgetType.latest,
      datasources,
      singleEntity: true,
      callbacks: {
        onDataUpdated: (sub) => {
          const errors = new Map<string, number | null>();
          for (const d of (sub?.data ?? []) as any[]) {
            const name = String(d?.dataKey?.name ?? "");
            if (name.endsWith("_ERRORS_COUNT") && d?.dataKey?.type === DataKeyType.timeseries) {
              errors.set(name.slice(0, -"_ERRORS_COUNT".length), parseNumber(d?.data?.[0]?.[1]));
            }
          }
          this.connectorErrors = errors;
          this.connectors = this.connectors.map((c) => ({ ...c, errors: errors.get(c.key) ?? null }));
          this.gatewayPanelConnectors = this.gatewayPanelConnectors.map((c) => ({ ...c, errors: errors.get(c["key"]) ?? null }));
          if (first) {
            first = false;
          } else {
            this.scheduleConnectorsRefresh();
          }
          this.cd.detectChanges();
        },
      },
    };
    this.ctx.subscriptionApi
      .createSubscription(options, true)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((sub) => {
        (sub as any).gmSignature = signature;
        this.connectorsSubscription = sub;
      });
  }

  private removeConnectorsSubscription(): void {
    if (this.connectorsSubscription) {
      this.ctx.subscriptionApi.removeSubscription(this.connectorsSubscription.id);
      this.connectorsSubscription = undefined;
    }
  }

  // -- data: the selected gateway's configuration ------------------------------------------

  /** The configuration: per key, the newer of what the gateway reports (client) and what's set for it (shared); its credentials fill the security section. */
  private loadConfig(g: GatewayRow): void {
    const s = this.settings;
    const keys = [s.generalConfigurationKey, s.grpcConfigurationKey, s.logsConfigurationKey, s.storageConfigurationKey, s.remoteLoggingLevelKey];
    const entity = { entityType: EntityType.DEVICE, id: g.id };
    this.configLoading = true;
    forkJoin([
      this.ctx.attributeService.getEntityAttributes(entity, AttributeScope.SHARED_SCOPE, keys, QUIET_REQUEST).pipe(catchError(() => of([] as AttributeData[]))),
      this.ctx.attributeService.getEntityAttributes(entity, AttributeScope.CLIENT_SCOPE, keys, QUIET_REQUEST).pipe(catchError(() => of([] as AttributeData[]))),
      this.ctx.deviceService.getDeviceCredentials(g.id, false, QUIET_REQUEST).pipe(catchError(() => of(null as DeviceCredentials | null))),
    ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([shared, client, credentials]) => {
        if (this.selectedGateway?.id !== g.id) {
          return;
        }
        const merged = new Map<string, AttributeData>();
        for (const a of [...shared, ...client]) {
          const cur = merged.get(a.key);
          if (!cur || (a.lastUpdateTs ?? 0) >= (cur.lastUpdateTs ?? 0)) {
            merged.set(a.key, a);
          }
        }
        const value = (key: string) => merged.get(key)?.value;
        const defaults = defaultGatewayConfig(window.location.hostname);
        const general = parseObject(value(s.generalConfigurationKey));
        const logLevel = (value(s.remoteLoggingLevelKey) as GatewayLogLevel) || GatewayLogLevel.NONE;
        const config: GatewayConfigValue = {
          thingsboard: Object.keys(general).length ? { ...defaults.thingsboard, ...(general as GatewayConfigValue["thingsboard"]) } : defaults.thingsboard,
          storage: { ...defaults.storage, ...parseObject(value(s.storageConfigurationKey)) } as GatewayConfigValue["storage"],
          grpc: { ...defaults.grpc, ...parseObject(value(s.grpcConfigurationKey)) } as GatewayConfigValue["grpc"],
          logs: parseLogsConfiguration(value(s.logsConfigurationKey), logLevel) ?? { ...defaults.logs, logLevel },
        };
        config.thingsboard.security = this.securityFromCredentials(config.thingsboard.security, credentials);
        this.configValue = config;
        this.configLoading = false;
        this.configResetKey++;
        this.cd.detectChanges();
      });
  }

  /** The security section from the device's credentials when the configuration has none (or stale ones). */
  private securityFromCredentials(security: GatewayConfigSecurity | undefined, credentials: DeviceCredentials | null): GatewayConfigSecurity {
    const current: GatewayConfigSecurity = security?.type ? { ...security } : { type: SecurityType.ACCESS_TOKEN };
    if (!credentials) {
      return current;
    }
    if (credentials.credentialsType === DeviceCredentialsType.ACCESS_TOKEN) {
      if (current.type === SecurityType.USERNAME_PASSWORD || current.type === SecurityType.TLS_PRIVATE_KEY) {
        return current; // the config says otherwise — the save will align the credentials
      }
      return { ...current, type: current.type === SecurityType.TLS_ACCESS_TOKEN ? current.type : SecurityType.ACCESS_TOKEN, accessToken: credentials.credentialsId };
    }
    if (credentials.credentialsType === DeviceCredentialsType.MQTT_BASIC) {
      const parsed = parseObject(credentials.credentialsValue);
      if (current.type !== SecurityType.USERNAME_PASSWORD && current.type !== SecurityType.TLS_PRIVATE_KEY) {
        return { type: SecurityType.USERNAME_PASSWORD, clientId: String(parsed["clientId"] ?? ""), username: String(parsed["userName"] ?? ""), password: String(parsed["password"] ?? "") };
      }
      if (current.type === SecurityType.USERNAME_PASSWORD && !current.username && !current.clientId) {
        return { ...current, clientId: String(parsed["clientId"] ?? ""), username: String(parsed["userName"] ?? ""), password: String(parsed["password"] ?? "") };
      }
    }
    return current;
  }

  /** The device's credentials follow the configuration's security (access token or MQTT basic), as the gateway widgets do. */
  private updateCredentials(deviceId: string, security: GatewayConfigSecurity): Observable<unknown> {
    const wantsToken = security.type === SecurityType.ACCESS_TOKEN || security.type === SecurityType.TLS_ACCESS_TOKEN;
    const wantsBasic = security.type === SecurityType.USERNAME_PASSWORD;
    if (!wantsToken && !wantsBasic) {
      return of(null);
    }
    if (wantsToken && !security.accessToken) {
      return of(null);
    }
    return this.ctx.deviceService.getDeviceCredentials(deviceId, false, QUIET_REQUEST).pipe(
      switchMap((creds) => {
        let next: DeviceCredentials | null = null;
        if (wantsToken && (creds.credentialsType !== DeviceCredentialsType.ACCESS_TOKEN || creds.credentialsId !== security.accessToken)) {
          next = { ...creds, credentialsType: DeviceCredentialsType.ACCESS_TOKEN, credentialsId: security.accessToken!, credentialsValue: null as any };
        } else if (wantsBasic) {
          const value = {
            ...(security.clientId ? { clientId: security.clientId } : {}),
            ...(security.username ? { userName: security.username } : {}),
            ...(security.password ? { password: security.password } : {}),
          };
          const current = creds.credentialsType === DeviceCredentialsType.MQTT_BASIC ? parseObject(creds.credentialsValue) : null;
          const same = current && current["clientId"] === value.clientId && current["userName"] === value.userName && current["password"] === value.password;
          if (!same) {
            next = { ...creds, credentialsType: DeviceCredentialsType.MQTT_BASIC, credentialsId: null as any, credentialsValue: JSON.stringify(value) };
          }
        }
        return next ? this.ctx.deviceService.saveDeviceCredentials({ ...next, version: null as any } as DeviceCredentials, QUIET_REQUEST) : of(null);
      })
    );
  }

  // -- filters, summary, scopes -----------------------------------------------------------

  private applyFilters(): void {
    const statuses = new Set(this.selectedStatuses);
    // Managing an application: every gateway shows, so any can be tagged.
    const apps = new Set(this.managing ? [] : this.selectedApplications);
    const profiles = new Set(this.selectedProfiles);
    const productLines = new Set(this.selectedProductLines);
    const markets = new Set(this.selectedMarkets);
    const sites = new Set(this.selectedSites);
    // A gateway's site, market and product line — by its own attributes, no relation lookups ("" = none).
    const siteOf = (g: GatewayRow) => g.siteId ?? "";
    const marketOf = (g: GatewayRow) => this.refId("market", g.marketRef);
    const productLineOf = (g: GatewayRow) => this.refId("productLine", g.productLineRef);
    const byStatus = (g: GatewayRow) => !statuses.size || statuses.has(g.status);
    const byApp = (g: GatewayRow) => !apps.size || g.applications.some((a) => apps.has(a));
    const byProfile = (g: GatewayRow) => !profiles.size || profiles.has(g.type);
    const byProductLine = (g: GatewayRow) => !productLines.size || productLines.has(productLineOf(g));
    const byMarket = (g: GatewayRow) => !markets.size || markets.has(marketOf(g));
    const bySite = (g: GatewayRow) => !sites.size || sites.has(siteOf(g));
    const filters = [byStatus, byApp, byProfile, byProductLine, byMarket, bySite];
    // Passes every filter — or every one but the given, for that filter's own counts.
    const passes = (g: GatewayRow, except?: (g: GatewayRow) => boolean) => filters.every((f) => f === except || f(g));
    this.visibleGateways = this.gateways.filter((g) => passes(g));
    // Each filter's counts under the other filters.
    const forStatus = this.gateways.filter((g) => passes(g, byStatus));
    this.statusOptions = GATEWAY_STATUS_OPTIONS.map((o) => ({ id: o.id, label: o.label, count: forStatus.filter((g) => g.status === o.id).length }));
    const forApps = this.gateways.filter((g) => passes(g, byApp));
    this.applicationOptions = this.applications.map((a) => ({ id: a.id, label: applicationName(a), count: forApps.filter((g) => g.applications.includes(a.id)).length }));
    const forProfiles = this.gateways.filter((g) => passes(g, byProfile));
    const types = [...new Set(this.gateways.map((g) => g.type))].sort((a, b) => a.localeCompare(b));
    this.profileOptions = types.map((t) => ({ id: t, label: t || "No profile", count: forProfiles.filter((g) => g.type === t).length }));
    // The assets' filters: every market and site of the Organization's lists, and the product lines of the gateways' sites (one
    // still checked stays, to be cleared) — each counted under the other filters (no "none" entry); markets and product lines
    // by their names (codes: "GVA", "RMX"), a site by its label and code.
    const assetOptions = (
      list: AssetRow[],
      valueOf: (g: GatewayRow) => string,
      counted: GatewayRow[],
      labelOf: (a: AssetRow) => string = (a) => a.name
    ): FilterListOption[] =>
      list
        .map((a) => ({ id: a.id, label: labelOf(a), count: counted.filter((g) => valueOf(g) === a.id).length }))
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
    const lines = new Set(this.gateways.map(productLineOf).filter((id) => !!id));
    this.productLineFilterOptions = assetOptions(
      this.productLines.rows.filter((pl) => lines.has(pl.id) || productLines.has(pl.id)),
      productLineOf,
      this.gateways.filter((g) => passes(g, byProductLine))
    );
    this.marketFilterOptions = assetOptions(this.markets.rows, marketOf, this.gateways.filter((g) => passes(g, byMarket)));
    // A site: its label with its code in brackets (the filter's search finds it by either).
    this.siteFilterOptions = assetOptions(this.sites.rows, siteOf, this.gateways.filter((g) => passes(g, bySite)), siteOptionLabel);
    this.buildSummary();
    this.applyAlarmScope();
  }

  /** The gateways' device counts (the table's Devices column). */
  deviceCount(g: GatewayRow): number {
    return this.devices.filter((d) => d.gatewayId === g.id).length;
  }

  private buildSummary(): void {
    const gws = this.visibleGateways;
    const n = gws.length;
    const pct = (k: number) => (n ? ` (${Math.round((k / n) * 100)}%)` : "");
    const active = gws.filter((g) => g.status === "active").length;
    const withErrors = gws.filter((g) => (g.errors ?? 0) > 0).length;
    const enabled = gws.reduce((s, g) => s + g.activeConnectors.length, 0);
    const disabled = gws.reduce((s, g) => s + g.inactiveConnectors.length, 0);
    // The gateways in view by version: the doughnut's parts, and — one line each, with its swatch — its legend.
    const versions = gatewayVersionShares(gws, this.gateways);
    // The gateways in view by status: the doughnut's two parts (the status scale's green, and the neutral grey), their total — the
    // number alone — in its centre.
    const statuses = [
      { name: "Active", value: active, color: "var(--c-bg-success-normal)" },
      { name: "Inactive", value: n - active, color: "var(--c-icon-neutral-light)" },
    ];
    this.gatewaySummary = [
      {
        id: "gateways",
        title: "Gateways",
        donut: { slices: statuses, centerValue: String(n) },
        rows: [
          ...statuses.map((s) => ({ label: s.name, swatch: s.color, value: `${s.value}${pct(s.value)}` })),
          // Errors cut across both parts (an inactive gateway keeps its last count): a line of its own, not a part of the ring.
          { label: "With errors", icon: "warning", value: `${withErrors}${pct(withErrors)}`, tone: withErrors ? ("error" as const) : ("default" as const) },
        ],
      },
      {
        id: "connectors",
        title: "Connectors",
        rows: [
          { label: "Connectors", icon: "cable", value: String(enabled + disabled) },
          { label: "Enabled", mark: "success", value: String(enabled) },
          { label: "Disabled", mark: "neutral", value: String(disabled) },
          { label: "Errors", icon: "warning", value: fmtNumber(gws.reduce((s, g) => s + (g.errors ?? 0), 0)), tone: withErrors ? "error" : "default" },
        ],
      },
      {
        id: "versions",
        title: "Gateway versions",
        donut: { slices: versions.map((v) => ({ name: v.name, value: v.count, color: v.color })) },
        rows: versions.map((v) => ({ label: v.name, swatch: v.color, value: `${v.count}${pct(v.count)}` })),
      },
    ];
  }

  /** Each device's gateway name (the gateways may load after the devices). */
  private applyDeviceNames(): void {
    const names = new Map(this.gateways.map((g) => [g.id, g.name]));
    this.devices = this.devices.map((d) => ({ ...d, gatewayName: names.get(d.gatewayId) ?? d.gatewayName }));
  }

  /** The same list as before (by `key`) keeps its reference, so the views don't reload on every gateway refresh. */
  private sameList<T>(prev: T[], next: T[], key: (item: T) => string): T[] {
    const same = prev.length === next.length && prev.every((item, i) => key(item) === key(next[i]));
    return same ? prev : next;
  }

  /**
   * The selected gateway for its page's Logs section — its own five log
   * channels and each of its connectors' and converters', or one connector's
   * (logSource) — and its Statistics section.
   */
  private refreshGatewayScopes(): void {
    const g = this.selectedGateway;
    this.gatewayStatRefs = this.sameList(this.gatewayStatRefs, g ? [{ id: g.id, name: g.name }] : [], (x) => `${x.id}:${x.name}`);
    const channels: LogChannel[] = this.logSource ? [] : GATEWAY_LOG_SOURCES.map((s) => ({ key: s.key, label: s.label }));
    for (const name of g ? [...new Set([...g.activeConnectors, ...g.inactiveConnectors])] : []) {
      if (!this.logSource || name === this.logSource) {
        channels.push(...connectorLogKeys(name));
      }
    }
    const next: LogGateway[] = g ? [{ id: g.id, name: g.name, channels }] : [];
    this.gatewayLogGateways = this.sameList(this.gatewayLogGateways, next, (x) => `${x.id}:${x.name}:${x.channels.map((c) => c.key).join("+")}`);
  }

  // -- data: alarms -------------------------------------------------------------------------

  private subscribeAlarms(): void {
    this.alarmsLoading = true;
    subscribeActiveAlarms(this.ctx, this.destroyRef, {
      entityFilter: this.gatewayFilter,
      keyFilters: this.gatewayKeyFilters,
      onSubscribed: (subscription) => (this.alarmsSubscription = subscription),
      onUpdated: (alarms) => this.onAlarmsUpdated(alarms),
    });
  }

  private onAlarmsUpdated(alarms: DashboardAlarm[]): void {
    this.allAlarms = alarms;
    this.alarmsLoading = false;
    this.applyAlarmScope();
    this.cd.detectChanges();
  }

  /** Alarms of the visible gateways (named by display name over their customer), and of the selected gateway. */
  private applyAlarmScope(): void {
    const names = new Map(this.visibleGateways.map((g) => [g.id, { name: g.name, owner: g.owner }]));
    const named = (a: AlarmListItem) => {
      const d = names.get(a.originatorId);
      return { ...a, originatorName: d?.name ?? a.originatorName };
    };
    this.panelAlarms = this.allAlarms.filter((a) => names.has(a.originatorId)).map(named);
    this.alarmCounts = countAlarmsByOriginator(this.allAlarms);
    const id = this.selectedGateway?.id;
    this.detailAlarms = id ? this.allAlarms.filter((a) => a.originatorId === id) : [];
  }

  // -- misc ----------------------------------------------------------------------------------

  private loadUserPreferences(): void {
    readUserSettings(this.ctx, this.destroyRef, (settings) => {
      this.theme.restore(settings);
      this.gatewayColumnChoice.restore(settings);
      // The user's sort: one they picked, or none if they cleared it (a third header click); the default until they've touched it.
      const sort = settings?.[this.sortSettingKey];
      if (sort === null) {
        this.gatewaySort = null;
      } else if (sort && this.gatewayColumns.some((c) => c.key === sort.key) && (sort.direction === "asc" || sort.direction === "desc")) {
        this.gatewaySort = { key: sort.key, direction: sort.direction };
      }
      this.cd.detectChanges();
    });
  }

}
