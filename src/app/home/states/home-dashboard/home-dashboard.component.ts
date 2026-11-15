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
import { EMPTY, Observable, Subject, of, timer } from "rxjs";
import { auditTime, catchError, exhaustMap, expand, map, mergeMap, reduce, switchMap, take, toArray } from "rxjs/operators";
import { defaultHttpOptionsFromConfig, selectAuth } from "@core/public-api";
import { select } from "@ngrx/store";
import { AliasFilterType, EntityType, SharedModule } from "@shared/public-api";
import type { AlarmService } from "@core/http/alarm.service";
import { WidgetContext } from "@home/models/widget-component.models";
import { NavRailComponent, NavRailItem } from "../../../components/shared/nav-rail/nav-rail.component";
import { DashboardLoadingComponent, FirstLoad } from "../../../components/shared/dashboard-loading/dashboard-loading.component";
import { DashboardAlarm, clearDashboardAlarm, countAlarmsByOriginator, subscribeActiveAlarms, toDashboardAlarm } from "../../../components/shared/dashboard/dashboard-alarms";
import {
  DEV_DASHBOARD_SUFFIX,
  DEV_SWITCH_ID,
  dashboardRailFootItems,
  dashboardRailItems,
  DashboardTheme,
  isTenantAdmin,
  readUserSettings,
} from "../../../components/shared/dashboard/dashboard-preferences";
import { byNamePageLink, removeSubscriptions, subscribeLatestChanges } from "../../../components/shared/dashboard/dashboard-subscriptions";
import { readDashboardUrlState, watchDashboardUrlState, writeDashboardUrlState } from "../../../components/shared/dashboard/dashboard-url-state";
import { SettingsSidebarComponent, settingsHasFilters, settingsSidebarWidth } from "../../../components/shared/settings-sidebar/settings-sidebar.component";
import { fmtNumber, parseObject, parseStringList } from "../../../components/shared/value-utils";
import { SummaryCard, SummaryCardsComponent, SummaryMarkTone, SummaryRow } from "../../../components/shared/summary-cards/summary-cards.component";
import { StatGridComponent, StatHeadline, StatItem } from "../../../components/shared/stat-grid/stat-grid.component";
import type { HeatmapPoint } from "../../../components/shared/calendar-heatmap/calendar-heatmap.component";
import { HourHeatmapComponent } from "../../../components/shared/hour-heatmap/hour-heatmap.component";
import { formatClockTime } from "../../../components/shared/time-format";
import { CollapsibleCardComponent } from "../../../components/shared/collapsible-card/collapsible-card.component";
import { HIERARCHY_COUNT_KEYS, HierarchyCount, HierarchyCounts, loadHierarchyCounts } from "../../../components/shared/organization/hierarchy-counts";
import { ALARMS_PER_DAY_REFRESH_MS, loadAlarmsPerDay, viewerAlarmsPerDaySource } from "../../../components/shared/organization/alarms-per-day";
import { ToastsComponent } from "../../../components/shared/toasts/toasts.component";
import { FeedbackDialogComponent } from "../../../components/shared/feedback/feedback-dialog/feedback-dialog.component";
import { FEEDBACK_RAIL_ID, FEEDBACK_SECTION, feedbackOf, safeUrl } from "../../../components/shared/feedback/feedback.models";
import { AlarmListItem } from "../../../components/shared/alarm-list/alarm-list.component";
import { AlarmPanelComponent } from "../../../components/shared/alarm-panel/alarm-panel.component";
import { SidebarLayoutComponent } from "../../../components/shared/sidebar-layout/sidebar-layout.component";
import { AssetRow, ORGANIZATION_SECTION, lineAncestors, lineWithin, organizationKindOf } from "../../../components/shared/organization/organization.models";
import { OrganizationStore } from "../../../components/shared/organization/organization-store";
import { OrganizationSettingsComponent } from "../../../components/shared/organization/organization-settings/organization-settings.component";
import { OrganizationPanelsComponent } from "../../../components/shared/organization/organization-panels/organization-panels.component";
import { ACCOUNT_SECTION, AccountSettingsComponent } from "../../../components/shared/account-settings/account-settings.component";
import { APPLICATIONS_SECTION, Application } from "../../../components/shared/applications/applications.models";
import { ApplicationStore } from "../../../components/shared/applications/application-store";
import { ApplicationSettingsComponent } from "../../../components/shared/applications/application-settings/application-settings.component";
import { ApplicationPanelsComponent } from "../../../components/shared/applications/application-panels/application-panels.component";
import { FeedbackSettingsComponent } from "../../../components/shared/feedback/feedback-settings/feedback-settings.component";
import { FeedbackPanelsComponent } from "../../../components/shared/feedback/feedback-panels/feedback-panels.component";
import { FeedbackStore } from "../../../components/shared/feedback/feedback-store";
import { ACCESS_SECTION, AccessPage, accessListSwitch, accessPageOf } from "../../../components/shared/access/access.models";
import { sectionEntries, sectionEntryOf } from "../../../components/shared/section-nav/section-nav.component";
import { AccessStore } from "../../../components/shared/access/access-store";
import { AccessSettingsComponent } from "../../../components/shared/access/access-settings/access-settings.component";
import { AccessPanelsComponent } from "../../../components/shared/access/access-panels/access-panels.component";
import { AlarmNotificationPanelComponent } from "../../../components/shared/alarm-subscriptions/alarm-notification-panel.component";
import { injectCss } from "../../../components/shared/cdn-loader";
import { DashboardHost, NestedDashboard } from "../../../components/shared/dashboard/nested-dashboard";
import { HOME_APP_APPLICATIONS, HomeAppId } from "../../../components/shared/dashboard/home-apps";
import { GatewayDashboardComponent } from "../../../gateway-management/states/gateway-dashboard/gateway-dashboard.component";
import { MarineDashboardComponent } from "../../../marine-monitoring/states/marine-dashboard/marine-dashboard.component";
import { FuelManagementDashboardComponent } from "../../../fuel-management/states/fuel-management-dashboard/fuel-management-dashboard.component";
import { QcLabMonitoringDashboardComponent } from "../../../qc-lab-monitoring/states/qc-lab-monitoring-dashboard/qc-lab-monitoring-dashboard.component";
import { AsphaltDashboardComponent } from "../../../asphalt-monitoring/states/asphalt-dashboard/asphalt-dashboard.component";
import { EntityManagerComponent } from "../../components/entity-manager/entity-manager.component";
import { EntityPanelComponent } from "../../components/entity-manager/entity-panel.component";
import { ProfileManagerComponent } from "../../components/profile-manager/profile-manager.component";
import { DEFAULT_PROFILE_ICON, profileIconsOf } from "../../../components/shared/profile-icons/profile-icons";
import { HomeDashboardSettings, homeDashboardDefaultSettings } from "../../models/home.models";

/** The chart palette, in its fixed order: the "By app" card's swatches. */
const APP_SWATCHES = ["var(--c-chart-1)", "var(--c-chart-2)", "var(--c-chart-3)", "var(--c-chart-4)", "var(--c-chart-5)"];

/** A count by a dimension (a market, a product line, a site, a device type): its code and label, its devices and those online. */
interface DeviceTally {
  name: string;
  label: string;
  devices: number;
  online: number;
}

/** The alarms' figures strip (`tb-stat-grid [headline]`) beside the calendar: the last 30 days against the 30 before, then their figures. */
interface AlarmStrip {
  headline: StatHeadline;
  items: StatItem[];
}

/**
 * Who the Home page is for — what the viewer's access reaches (the sites,
 * markets and product lines they can see): one plant, one market (maybe one
 * product line's plants in it), one product line (its sub lines' too), or
 * everything — a tenant administrator, a regional or wider scope.
 */
type HomeScopeKind = "all" | "productLine" | "market" | "site";

interface HomeScope {
  kind: HomeScopeKind;
  /** The scope card's title: "Plant · Richmond Lab", "Market · GVA (RMX)", "Product line · RMX". */
  title: string;
  site?: AssetRow;
  market?: AssetRow;
  productLine?: AssetRow;
}

const ALL_SCOPE: HomeScope = { kind: "all", title: "Organization" };

/** What a chart breaks the devices or the alarms down by. */
type HomeDimension = "market" | "productLine" | "site" | "profile";

/** Each scope's charts — a level under it: devices by these dimensions (a plant's: none — its cards and its alarms per day). */
const SCOPE_DIMENSIONS: Record<HomeScopeKind, HomeDimension[]> = {
  all: ["market", "productLine"],
  productLine: ["market", "site"],
  market: ["site", "productLine"],
  site: [],
};

/** The Top alarms card's lines: the most frequent active alarm types. */
const TOP_ALARMS = 5;

/** An alarm severity's mark (the shared status scale's ramp: critical → error … warning → warning), most severe first. */
const SEVERITY_MARKS: [string, SummaryMarkTone][] = [
  ["CRITICAL", "error"],
  ["MAJOR", "major"],
  ["MINOR", "minor"],
  ["WARNING", "warning"],
];

const DIMENSION_NOUN: Record<HomeDimension, string> = { market: "market", productLine: "product line", site: "site", profile: "device type" };

/** A ranked card's most lines: past them, the rest as "Other". */
const MAX_BARS = 12;

/** The alarms' period: the last 30 days (a month), today included — the figures strip's and the day-and-hour map's. */
const ALARM_DAYS = 30;

/** The alarms strip's period: the last 30 days (today included), against the 30 before. */
const ALARM_STRIP_DAYS = ALARM_DAYS;

/** The day-and-hour map's rows (the days of the week, Monday first — the Fuel Reports page's) and how often it's read again. */
const WEEK_ROWS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const ALARM_HOURS_REFRESH_MS = 10 * 60 * 1000;
/** A tenant administrator's read of the period's alarms: pages of this many, at most this many pages. */
const ALARM_PAGE = 1000;
const ALARM_PAGES = 20;

/** The dashboards Home opens in place (nested-dashboard.ts): Gateways under Apps, then — after a divider — the apps. */
type NestedAppId = HomeAppId;

/** A nested app's page in its rail menu: `<app>/<its page>`. */
const PAGE_SEPARATOR = "/";

/** A nested app's rail entry — its pages (the dashboard's static `nestedPages`) the menu beside it; none: its tooltip. */
function appItem(id: NestedAppId, label: string, icon: string, pages: NavRailItem[], divider = false): NavRailItem & { id: NestedAppId } {
  return {
    id,
    label,
    icon,
    ...(divider ? { divider } : {}),
    ...(pages.length ? { children: pages.map((p) => ({ ...p, id: `${id}${PAGE_SEPARATOR}${p.id}` })) } : {}),
  };
}

/**
 * Each nested app's Application (its asset's name, Settings › Applications —
 * home-apps.ts): the app shows in the rail to whoever can read a site it runs
 * at (a Site asset's {@link SITE_APPLICATIONS_KEY} names it) — and ""
 * (Gateways): tenant administrators alone. The rail only shows the way: what
 * an app shows is its user's own access.
 */
const NESTED_APP_APPLICATION: Record<NestedAppId, string> = {
  gateways: "",
  ...(Object.fromEntries(HOME_APP_APPLICATIONS.map((a) => [a.id, a.application])) as Record<Exclude<NestedAppId, "gateways">, string>),
};

/**
 * A Site asset's server attribute naming the apps running there — a JSON list of their Applications' names, sorted
 * (`["Fuel", "QC Lab"]`), kept by the "Application Sites" rule chain (a plant with a device of an app's device profiles).
 */
const SITE_APPLICATIONS_KEY = "applications";
/** How many sites the rail's one query reads (every Site asset the user can read: a few hundred at most). */
const SITE_APPS_PAGE_SIZE = 2000;

/** The apps after Gateways, QC Lab first (the divider before it). QC Lab's and Asphalt's views are the button group atop their sidebar instead: no menu. */
const NESTED_APPS: (NavRailItem & { id: NestedAppId })[] = [
  appItem("gateways", "Gateways", "router", GatewayDashboardComponent.nestedPages),
  appItem("qc", "QC Lab", "science", [], true),
  appItem("marine", "Marine", "directions_boat", MarineDashboardComponent.nestedPages),
  appItem("fuel", "Fuel", "local_gas_station", FuelManagementDashboardComponent.nestedPages),
  appItem("asphalt", "Asphalt", "oil_barrel", []),
];

/** Rail pages: the apps (Home's own), the nested dashboards; tenant administrators also the Settings (the rail's second group). */
type HomePage = "home" | EntityPage | "settings" | NestedAppId;

/** The Entities menu's pages (tenant administrators'): the devices, the assets and their profiles — as ThingsBoard's own. */
type EntityPage = "devices" | "assets" | "deviceProfiles" | "assetProfiles";
const ENTITY_PAGES: EntityPage[] = ["devices", "assets", "deviceProfiles", "assetProfiles"];

function isEntityPage(page: string): page is EntityPage {
  return (ENTITY_PAGES as string[]).includes(page);
}

/** The tenant administrators' Entities (above Gateways): its pages, Devices, Assets and their profiles (as ThingsBoard's own), the menu beside it. */
const ENTITIES_ID = "entities";
/** The rail's Alarms (under Home): opens the alarms panel — not a page. */
const ALARMS_ID = "alarms";
const ENTITIES_ITEM: NavRailItem = {
  id: ENTITIES_ID,
  icon: "category",
  label: "Entities",
  children: [
    { id: `${ENTITIES_ID}/devices`, icon: "devices_other", label: "Devices" },
    { id: `${ENTITIES_ID}/assets`, icon: "domain", label: "Assets" },
    { id: `${ENTITIES_ID}/deviceProfiles`, icon: "developer_board", label: "Device profiles" },
    { id: `${ENTITIES_ID}/assetProfiles`, icon: "dataset", label: "Asset profiles" },
  ],
};

/** A device the user can see: its profile (which apps it's in), whether it's active, whether it's a gateway. */
interface DeviceInfo {
  id: string;
  name: string;
  profile: string;
  active: boolean;
  gateway: boolean;
  /** Where it is — its server attributes' codes (the Device Site Attributes chain keeps them): "" none. */
  site: string;
  market: string;
  productLine: string;
}

interface TbId {
  entityType: string;
  id: string;
}

/** A dashboard the user can open, by its title (the development switch's other version). */
interface DashboardTitle {
  id: { id: string };
  title: string;
}

/** One page of an entity query. */
interface EntityQueryPage {
  data: { entityId: TbId; latest: Record<string, Record<string, { value?: unknown }>> }[];
  hasNext: boolean;
}

/**
 * The home dashboard: the fleet's summary (gateways, alarms, devices by app —
 * the Applications, Settings › Applications — as a doughnut, the
 * Organization) and its charts: the devices of each market and product line
 * (a line's own sites'), online / offline, as the hierarchy's calculated
 * fields keep them (no relation walk here, followed live). Tenant administrators also
 * get the Settings page, as the fuel and gateway dashboards': the
 * Applications, the Organization, the Access and the Account.
 *
 * Its rail also opens the other dashboards in place — Gateways, then Marine,
 * Fuel, QC Lab and Asphalt — each nested (nested-dashboard.ts): no rail of
 * its own (its pages in a section menu beside it, as the Settings page's),
 * this dashboard's theme, its place in the URL with its app's id (`app`).
 */
@Component({
  selector: "tb-ext-home-dashboard",
  templateUrl: "./home-dashboard.component.html",
  styleUrls: ["./home-dashboard.component.scss"],
  standalone: true,
  imports: [
    CommonModule,
    SharedModule,
    DashboardLoadingComponent,
    NavRailComponent,
    SummaryCardsComponent,
    StatGridComponent,
    HourHeatmapComponent,
    CollapsibleCardComponent,
    ToastsComponent,
    FeedbackDialogComponent,
    AlarmPanelComponent,
    SidebarLayoutComponent,
    SettingsSidebarComponent,
    OrganizationSettingsComponent,
    OrganizationPanelsComponent,
    AccountSettingsComponent,
    ApplicationSettingsComponent,
    ApplicationPanelsComponent,
    FeedbackSettingsComponent,
    FeedbackPanelsComponent,
    AccessSettingsComponent,
    AccessPanelsComponent,
    AlarmNotificationPanelComponent,
    EntityManagerComponent,
    EntityPanelComponent,
    ProfileManagerComponent,
    GatewayDashboardComponent,
    MarineDashboardComponent,
    FuelManagementDashboardComponent,
    QcLabMonitoringDashboardComponent,
    AsphaltDashboardComponent,
  ],
})
export class HomeDashboardComponent implements OnInit, OnDestroy {
  @Input() ctx!: WidgetContext;

  /**
   * The rail ({@link buildRail}): Home, the alarms (their count; the panel),
   * Entities and Gateways, a divider, the user's apps — an app's pages the
   * menu beside it — and, a tenant administrator's, a divider and the Settings
   * page's sections (a group's pages its menu).
   */
  railItems: NavRailItem[] = [{ id: "home", icon: "home", label: "Home" }];
  /** The rail's apps (Gateways, then — after a divider — the others), as the user may open them ({@link applyRailApps}). */
  private railApps: NavRailItem[] = [];
  /** The alarms' count the rail shows (it's built again when it changes). */
  private railAlarmCount = -1;
  /** The New feedback's count the rail shows on Settings › Feedback (a tenant administrator's; built again when it changes). */
  private railFeedbackCount = 0;
  page: HomePage = "home";
  /** A page picked from the menu of an app not open yet: shown once the app hands itself over. */
  private pendingPage: string | null = null;
  /** Each nested app's host (made once the theme is): its id, this dashboard's theme, where it hands itself over. */
  hosts!: Record<NestedAppId, DashboardHost>;
  /** The nested dashboard open (once created): it says which of its pages shows, and shows another. */
  private nested: NestedDashboard | null = null;
  private destroyed = false;
  theme!: DashboardTheme;
  settings: HomeDashboardSettings = homeDashboardDefaultSettings;

  /** The shared stores: the apps (and, on the Settings page, the Organization and the Access). */
  org!: OrganizationStore;
  apps!: ApplicationStore;
  access!: AccessStore;
  /** What users sent from the dashboards (Settings › Feedback). */
  feedback!: FeedbackStore;

  // -- Settings page
  readonly settingsSections = [APPLICATIONS_SECTION, ORGANIZATION_SECTION, ACCESS_SECTION, FEEDBACK_SECTION, ACCOUNT_SECTION];
  private readonly settingsSectionIds = this.settingsSections.flatMap((s) => (s.children?.length ? s.children.map((c) => c.id) : [s.id]));
  /** The Settings sections the viewer may open: a tenant administrator's every one, a user's Account alone. */
  private get ownSettingsSectionIds(): string[] {
    return this.isTenantAdmin ? this.settingsSectionIds : [ACCOUNT_SECTION.id];
  }
  /**
   * The Settings page's sections in the rail, after the apps (a divider first): a group's pages its menu, as an app's —
   * all but Account, which is in the rail's second group, with the theme toggle; a section shown on another's page (Access ›
   * Users' Groups list) has no entry of its own.
   */
  private readonly settingsRailItems: NavRailItem[] = this.settingsSections.filter((s) => s.id !== ACCOUNT_SECTION.id).map((s, i) => ({
    id: s.id,
    icon: s.icon ?? "settings",
    label: s.label,
    divider: i === 0,
    ...(s.children?.length ? { children: sectionEntries(s.children).map((c) => ({ id: c.id, icon: c.icon ?? "settings", label: c.label })) } : {}),
  }));
  settingsSection = "applications";
  sidebarOpen = true;
  /** The Settings page's lists have loaded once (its first showing). */
  private settingsLoaded = false;

  // -- Home page
  private devices = new Map<string, DeviceInfo>();
  devicesLoading = true;
  alarms: DashboardAlarm[] = [];
  alarmsLoading = true;
  private alarmCounts = new Map<string, number>();
  /** The devices of each site, market and product line, as the hierarchy's calculated fields keep them. */
  private counts: HierarchyCounts | null = null;
  countsLoading = true;
  private countsSubscription: any;
  /** A stored count changed: read them again (at most every few seconds). */
  private readonly countsChanged = new Subject<void>();
  summaryCards: SummaryCard[] = [];
  /** Who the page is for (worked out from what the viewer can see). */
  homeScope: HomeScope = ALL_SCOPE;
  /** The ranked cards: devices by the dimensions a level under the scope — each line its share, its bar online and offline. */
  rankCards: SummaryCard[] = [];
  /** The alarms' figures strip over the calendar (null: no alarm counts for this user). */
  alarmStrip: AlarmStrip | null = null;
  /** The alarms created each day, as the backend keeps them (alarms-per-day.ts) — the figures strip's; null: none to read for this user. */
  alarmsPerDay: HeatmapPoint[] | null = [];
  /**
   * Alarms by day and hour (the Fuel Reports page's dispenses' map): the last {@link ALARM_DAYS} days' alarms, every status, counted
   * by when they started — the day of the week by the hour of the day (the viewer's).
   */
  readonly alarmWeekRows = WEEK_ROWS;
  readonly alarmHours = Array.from({ length: 24 }, (_, h) => formatClockTime(new Date(2000, 0, 1, h), true));
  alarmWeekHour: number[][] = WEEK_ROWS.map(() => new Array(24).fill(0));
  alarmWeekHourLoading = true;
  alarmsPerDayLoading = true;
  /** The heatmap's counts have been asked for ({@link requestAlarmsPerDay}: once the Home page shows and its own data is in). */
  private alarmsPerDayRequested = false;
  /** What the cards and charts were built from (rebuilt when any changes). */
  private seenRows: unknown[] = [];

  /**
   * The rail's development switch (tenant administrators'): on while this is the development version ("Home Development"),
   * and the other version to open — found among the user's dashboards by title; none (no switch) without it.
   */
  private devSwitch: { on: boolean; targetId: string } | null = null;

  alarmPanelOpen = false;
  private alarmService!: AlarmService;
  private alarmsSubscription: any;
  /** The alarm query is refused (customer users on this instance): the alarms are read device by device. */
  private alarmsFallback = false;

  @ViewChild("toasts", { static: true }) toasts!: ToastsComponent;

  constructor(
    private cd: ChangeDetectorRef,
    private destroyRef: DestroyRef
  ) {}

  get darkMode(): boolean {
    return !!this.theme?.dark;
  }

  get isTenantAdmin(): boolean {
    return isTenantAdmin(this.ctx);
  }

  // -- lifecycle --------------------------------------------------------------

  /**
   * The loading page (tb-dashboard-loading, the logo). The launch — the widget's first: the page the URL opens it on, Home's own
   * or an app's — until that page's first view is in (an app's: its own first load, `nested.pageLoading`), one logo over
   * everything, the rail too, so the page comes in whole; then Home's page's own first showing, if it wasn't the launch's (the
   * logo over Home's area, under the rail — an app opened later shows its own: the logo between apps). A later reload never
   * brings it back.
   */
  private readonly firstLoad = new FirstLoad();
  private readonly launch = new FirstLoad();
  get pageLoading(): boolean {
    const home = this.page === "home" && this.firstLoad.pending(this.devicesLoading, this.countsLoading, this.alarmsLoading);
    const app = !!this.appPage && (!this.nested || this.nested.pageLoading);
    return this.launch.pending(home, app) || home;
  }

  ngOnInit(): void {
    this.ctx.$scope.homeDashboardComponent = this;
    this.theme = new DashboardTheme(this.ctx, this.destroyRef, () => this.cd.detectChanges());
    injectCss("tb-ext-material-symbols-rounded", "https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200");
    this.alarmService = this.ctx.$injector.get(this.ctx.servicesMap.get("alarmService")) as AlarmService;
    this.settings = this.readSettings();
    this.hosts = Object.fromEntries(NESTED_APPS.map((a) => [a.id, this.hostFor(a.id)])) as Record<NestedAppId, DashboardHost>;
    this.createStores();
    // The rail: Home, Entities (tenant administrators: Devices, Assets and their profiles in its menu), Gateways, a divider, the apps — the user's.
    this.applyRailApps();
    this.loadSiteApps();
    // The apps (with their sites) and the Organization's lists (the sites' names): the Home page's cards.
    this.apps.load();
    this.org.loadAll();
    this.rebuild();
    // The profiles' icons coming in: the cards showing a kind of asset (the Organization's) take them.
    const icons = profileIconsOf(this.ctx);
    icons.changes.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.summaryCards = this.buildSummaryCards();
      this.cd.detectChanges();
    });
    // Read as Home starts, whatever page it opens on — a tenant administrator's start keeps the icons' mirror on the
    // Application assets (what everyone else reads them from).
    icons.load("device");
    readUserSettings(this.ctx, this.destroyRef, (settings) => {
      this.theme.restore(settings);
      this.cd.detectChanges();
    });
    this.loadDevices();
    this.loadCounts();
    this.loadDevSwitch();
    // What users sent (tenant administrators'): its New ones the badge on Settings › Feedback in the rail, kept live.
    if (this.isTenantAdmin) {
      this.feedback.load();
    }
    this.subscribeAlarms();
    // The page (and the Settings section) in the URL: a reload lands on it; Back / Forward follow it.
    watchDashboardUrlState(this.ctx, this.destroyRef, (state) => this.applyUrlState(state));
    // (No place in the URL: Home's Home page.)
    this.applyUrlState();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    removeSubscriptions(this.ctx, this.alarmsSubscription, this.countsSubscription, this.feedback?.subscription);
  }

  /** Called by the widget's controller script; the data comes from this component's own queries. */
  onDataUpdated(): void {
    this.cd.markForCheck();
  }

  /** Called by the widget's controller script; the layout is fluid — the nested dashboard open re-measures (Marine's map). */
  onResize(): void {
    this.nested?.onResize();
    this.cd.markForCheck();
  }

  /**
   * A nested app's host. The dashboard hands itself over while Home renders
   * (its ngOnInit), so the rail takes its pages on the next turn — not by a
   * change detection inside this one.
   */
  private hostFor(appId: NestedAppId): DashboardHost {
    return {
      appId,
      theme: this.theme,
      // What its own widget's settings would pass it: Home's CARTO key (Marine's map).
      settings: this.settings.cartoApiKey ? { cartoApiKey: this.settings.cartoApiKey } : undefined,
      attach: (dashboard) => {
        // A detach counts only for the app still open (switching apps, the old one may go after the new one came).
        if (dashboard || this.page === appId) {
          this.nested = dashboard;
        }
        Promise.resolve().then(() => {
          if (this.destroyed) {
            return;
          }
          // Opened from its menu: on the page picked.
          if (dashboard && this.pendingPage && this.page === appId) {
            const page = this.pendingPage;
            this.pendingPage = null;
            dashboard.selectRailPage(page);
          }
          this.cd.detectChanges();
        });
      },
    };
  }

  /** The shared stores (as the fuel dashboard's): the Organization, the Applications (with their sites) and the Access. */
  private createStores(): void {
    const s = this.settings;
    const changed = () => {
      this.rebuild();
      // The Organization in (a user's heatmap waits for it): even if no row changed.
      this.requestAlarmsPerDay();
      this.cd.detectChanges();
    };
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
      changed
    );
    this.apps = new ApplicationStore(this.ctx, this.destroyRef, { assetType: s.applicationAssetType, siteRelation: s.applicationSiteRelation }, this.toasts, changed);
    this.apps.org = this.org;
    this.access = new AccessStore(this.ctx, this.destroyRef, { ownerTitle: s.ownerTitle }, this.toasts, changed, this.org, this.apps);
    this.feedback = new FeedbackStore(this.ctx, this.destroyRef, this.toasts, () => {
      // The New ones' count changed: the rail's badge with it.
      if (this.feedback.unread !== this.railFeedbackCount) {
        this.buildRail();
      }
      this.cd.detectChanges();
    });
    this.feedback.trail = this.access.trail;
    this.feedback.org = this.org;
  }

  // -- rail and pages ---------------------------------------------------------

  /**
   * The apps running at the sites the user can read — their Applications' names, lower case, from the Site assets'
   * {@link SITE_APPLICATIONS_KEY} ({@link loadSiteApps}); null until read (until then a user who isn't a tenant
   * administrator sees no app).
   */
  private siteAppNames: Set<string> | null = null;
  /** The apps the user may open (see {@link applyRailApps}); null until known. */
  private allowedApps: Set<NestedAppId> | null = null;
  /** The apps the rail was last built with ("" before it first is). */
  private railKey = "";

  /**
   * The rail's apps: a tenant administrator's every one; anyone else's those
   * running at a site they can read ({@link NESTED_APP_APPLICATION}, the
   * sites' {@link SITE_APPLICATIONS_KEY}) — none until the sites are read. The
   * apps' group starts after a divider (on its first app shown). An open app
   * that isn't theirs gives way to Home. Once known at start: a user (not a tenant administrator) with one app of their own and
   * no place in the URL opens on that app, not the Home page.
   */
  private applyRailApps(): void {
    const running = this.siteAppNames;
    const allowed = this.isTenantAdmin
      ? new Set(NESTED_APPS.map((a) => a.id))
      : running
        ? new Set(NESTED_APPS.filter((a) => !!NESTED_APP_APPLICATION[a.id] && running.has(NESTED_APP_APPLICATION[a.id].toLowerCase())).map((a) => a.id))
        : null;
    const key = allowed ? [...allowed].join(",") || "-" : "?";
    if (key === this.railKey) {
      return;
    }
    const wasUnknown = this.railKey === "?";
    this.railKey = key;
    this.allowedApps = allowed;
    const visible = NESTED_APPS.filter((a) => allowed?.has(a.id));
    const firstApp = visible.find((a) => a.id !== "gateways");
    this.railApps = visible.map((a) => ({ ...a, divider: a === firstApp }));
    this.buildRail();
    if (wasUnknown) {
      const named = readDashboardUrlState(this.ctx);
      this.applyUrlState(); // the URL's app, held until now: it opens if it's theirs
      // Just signed in (the URL names no place) with one app of their own: the app itself, not the Home page — Home stays in the rail.
      const own = [...(allowed ?? [])].filter((id) => id !== "gateways");
      if (!this.isTenantAdmin && !named["app"] && !named["page"] && own.length === 1 && this.page === "home") {
        this.showPage(own[0]);
        this.writeUrlState(true);
      }
    } else if (allowed && NESTED_APPS.some((a) => a.id === this.page) && !allowed.has(this.page as NestedAppId)) {
      this.showPage("home");
      this.writeUrlState(true);
    }
  }

  /**
   * The apps running at the sites a user (not a tenant administrator: every app) can read: one entity query of the Site
   * assets with their {@link SITE_APPLICATIONS_KEY} — then the rail shows them. Unreadable: none.
   */
  private loadSiteApps(): void {
    if (this.isTenantAdmin) {
      return;
    }
    this.ctx.http
      .post<EntityQueryPage>(
        "/api/entitiesQuery/find",
        {
          entityFilter: { type: "assetType", assetTypes: [this.settings.siteAssetType], assetNameFilter: "" },
          entityFields: [{ type: "ENTITY_FIELD", key: "name" }],
          latestValues: [{ type: "SERVER_ATTRIBUTE", key: SITE_APPLICATIONS_KEY }],
          pageLink: byNamePageLink(SITE_APPS_PAGE_SIZE),
        },
        this.silent()
      )
      .pipe(
        map((page) => (page?.data ?? []).flatMap((row) => parseStringList(row.latest?.["SERVER_ATTRIBUTE"]?.[SITE_APPLICATIONS_KEY]?.value))),
        catchError(() => of([] as string[])),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((names) => {
        this.siteAppNames = new Set(names.map((n) => n.toLowerCase()));
        this.applyRailApps();
        this.cd.detectChanges();
      });
  }

  /** The rail's items, again (the apps the user may open known, or the alarms' count changed): see {@link railItems}. */
  private buildRail(): void {
    this.railAlarmCount = this.alarms.length;
    this.railFeedbackCount = this.feedback?.unread ?? 0;
    this.railItems = [
      { id: "home", icon: "home", label: "Home" },
      { id: ALARMS_ID, icon: "notifications", label: "Alarms", badge: this.alarms.length },
      ...(this.isTenantAdmin ? [ENTITIES_ITEM] : []),
      ...this.railApps,
      ...(this.isTenantAdmin ? this.settingsRailItems.map((i) => (i.id === FEEDBACK_SECTION.id ? { ...i, badge: this.railFeedbackCount } : i)) : []),
    ];
  }

  /**
   * A Settings item of the rail: the section it opens — its own (Applications,
   * Account), a group's page (Markets), or a group's first page (Organization:
   * Sites — the page open stays, when it's one of the group's); null
   * for another item.
   */
  private settingsSectionOf(id: string): string | null {
    if (!this.isTenantAdmin) {
      return id === ACCOUNT_SECTION.id ? id : null; // a user's Settings: Account alone
    }
    for (const s of this.settingsSections) {
      const pages = s.children?.map((c) => c.id) ?? [];
      if (s.id === id) {
        return !pages.length ? s.id : this.page === "settings" && pages.includes(this.settingsSection) ? this.settingsSection : pages[0];
      }
      if (pages.includes(id)) {
        // The page shown picked again: it stays on the list it shows (Access › Users on its Groups).
        return this.page === "settings" && sectionEntryOf(this.settingsSections, this.settingsSection) === id ? this.settingsSection : id;
      }
    }
    return null;
  }

  /** The Settings page on a section (the rail's): a new entry in the URL. */
  private openSettingsSection(section: string): void {
    if (!this.settingsLoaded) {
      // Its first showing loads what the section needs.
      this.settingsSection = section;
      this.showPage("settings");
    } else {
      this.showPage("settings");
      if (section !== this.settingsSection) {
        this.showSettingsSection(section);
      }
    }
    this.writeUrlState();
  }

  /** The Settings sidebar's pick — the Users page's other list (its button group): shown, the URL's entry rewritten. */
  selectSettingsSection(section: string): void {
    if (section !== this.settingsSection && this.ownSettingsSectionIds.includes(section)) {
      this.showSettingsSection(section);
      this.writeUrlState(true);
    }
  }

  /** The rail's active entry: the page — an open app's own page in its menu, when it has one. */
  get railActive(): string {
    if (this.page === "settings") {
      // Its item in the rail (a group's page: the group's icon active with it; a list shown on another's page: that page's).
      return sectionEntryOf(this.settingsSections, this.settingsSection);
    }
    if (isEntityPage(this.page)) {
      return `${ENTITIES_ID}${PAGE_SEPARATOR}${this.page}`; // its page in the Entities menu (the icon active with it)
    }
    const app = NESTED_APPS.find((a) => a.id === this.page);
    return app?.children?.length && this.nested ? `${app.id}${PAGE_SEPARATOR}${this.nested.railActive}` : this.page;
  }

  /** The nested app open, if one is. */
  get appPage(): NestedAppId | null {
    return NESTED_APPS.some((a) => a.id === this.page) ? (this.page as NestedAppId) : null;
  }

  /** The Settings page's Account section at the rail's foot (everyone's: a user's Settings page is Account alone). */
  private readonly accountRailItem: NavRailItem = { id: ACCOUNT_SECTION.id, icon: ACCOUNT_SECTION.icon ?? "account_circle", label: ACCOUNT_SECTION.label, foot: true };

  /**
   * The rail's foot items, after the development switch: the theme toggle, Send feedback, then the Account section at the
   * bottom edge (the alarms are under Home, a tenant administrator's other Settings sections after the apps).
   */
  get railBottomItems(): NavRailItem[] {
    return [...dashboardRailItems(this.darkMode, undefined, { themeToggle: isTenantAdmin(this.ctx) }), this.accountRailItem];
  }

  /** The rail's foot, first: the development switch (tenant administrators', with both versions of Home there). */
  railFootItems: NavRailItem[] = [];

  /** A rail page — a new entry in the URL; an app's page from its menu: the app on it (opened first if it isn't). */
  selectPage(id: string): void {
    if (id === ALARMS_ID) {
      this.alarmPanelOpen = true;
      return;
    }
    const section = this.settingsSectionOf(id);
    if (section) {
      this.openSettingsSection(section);
      return;
    }
    const [app, page] = id.split(PAGE_SEPARATOR);
    // Entities: its page (the icon itself: Devices).
    if (app === ENTITIES_ID) {
      this.showPage(isEntityPage(page) ? page : "devices");
      this.writeUrlState();
      return;
    }
    if (page !== undefined) {
      if (app === this.page && this.nested) {
        this.nested.selectRailPage(page);
        return;
      }
      this.pendingPage = page;
    }
    this.showPage(app as HomePage);
    this.writeUrlState();
  }

  onRailBottomClick(id: string): void {
    if (id === ACCOUNT_SECTION.id) {
      this.selectPage(id); // the Settings page on its Account section
    } else if (id === FEEDBACK_RAIL_ID) {
      feedbackOf(this.ctx).show((NESTED_APPS.find((a) => a.id === this.appPage)?.label ?? "Home"));
    } else if (id === "theme") {
      this.theme.toggle();
    } else if (id === DEV_SWITCH_ID && this.devSwitch) {
      // The other version, on the same page (this one's URL state — never a sign-in token a link left in it).
      const state = new URL(safeUrl(`${location.origin}${this.ctx.router?.url ?? ""}`)).search;
      this.navigate(`/dashboards/${this.devSwitch.targetId}${state}`);
    }
  }

  /** A device's Details panel, opened from a plant's Devices tab (on the page it's on). */
  @ViewChild("siteDevicePanel", { static: true }) private siteDevicePanel!: EntityPanelComponent;

  /**
   * A device picked on a plant's Devices tab or in an Access › Health check: its Details panel in place, on the page shown — the
   * trail's next stop, the plant's (or the check's) panel the stop before it (closed by the trail as the device's opens), as a user
   * picked on a Users tab.
   */
  openSiteDevice(d: { id: string; name: string; profile: string; site: string; owner?: string }): void {
    this.siteDevicePanel.open({
      id: d.id,
      kind: "device",
      name: d.name,
      label: "",
      profile: d.profile,
      owner: d.owner ?? "",
      site: d.site,
      active: null,
      createdTime: null,
      created: "",
      description: "",
    });
  }

  private showPage(page: HomePage): void {
    if (page !== this.page) {
      this.nested = null; // the open app goes (a new one hands itself over once created)
    }
    // Settings and the Entities pages: tenant administrators' alone — but Settings › Account, everyone's; an app, its users' (the rail's).
    const notTheirs = NESTED_APPS.some((a) => a.id === page) && !this.allowedApps?.has(page as NestedAppId);
    const adminOnly = (page === "settings" && this.settingsSection !== ACCOUNT_SECTION.id) || isEntityPage(page);
    this.page = (adminOnly && !this.isTenantAdmin) || notTheirs ? "home" : page;
    this.requestAlarmsPerDay();
    if (this.page === "settings" && !this.settingsLoaded) {
      this.settingsLoaded = true;
      if (this.isTenantAdmin) {
        this.org.wantSiteLinks();
        if (accessPageOf(this.settingsSection)) {
          this.access.load(); // opened on an Access page (the URL's)
        } else if (this.settingsSection === FEEDBACK_SECTION.id) {
          this.feedback.load(); // opened on Feedback (the URL's)
        }
      }
    }
  }

  /**
   * Show a Settings section; an Organization page reloads its list, Applications its apps, an Access page its groups and users
   * (not a switch between the Users page's two lists: its button group's).
   */
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
    } else if (id === FEEDBACK_SECTION.id) {
      this.feedback.load();
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

  /** The Settings section has filters (an Access page's, the Sites page's): a sidebar of them — the others, none (their menu is the rail). */
  get settingsHasFilters(): boolean {
    return settingsHasFilters(this.settingsSection);
  }

  /** The Settings page's sidebar (tb-settings-sidebar, no menu): its section's filters, the layout's room before its divider. */
  get sidebarWidth(): number {
    return settingsSidebarWidth(this.settingsSection, false, this.org, this.access, this.feedback);
  }

  /**
   * Where the dashboard is, into the URL: a nested app (`app` — its own place
   * it adds), the Settings page and its section, an Entities page — for the
   * Home page nothing.
   */
  private writeUrlState(replace = false): void {
    const params = this.appPage
      ? { app: this.appPage }
      : this.page === "settings"
        ? { page: "settings", settingsSection: this.settingsSection }
        : isEntityPage(this.page)
          ? { page: this.page }
          : {};
    writeDashboardUrlState(this.ctx, params, replace);
  }

  /** Follow the URL's state (at start, and as it changes): its page and Settings section show. */
  private applyUrlState(state?: string | null): void {
    const params = readDashboardUrlState(this.ctx, state);
    // A nested app's state names its app (its own keys — page, view … — are its own): one of
    // theirs — until their apps are known it waits on the Home page; one not theirs is the Home page.
    const namedApp = NESTED_APPS.find((a) => a.id === params["app"])?.id;
    const app = namedApp && this.allowedApps?.has(namedApp) ? namedApp : undefined;
    const named = ["settings", ...ENTITY_PAGES].find((p) => p === params["page"]) as HomePage | undefined;
    const page: HomePage = app ?? named ?? "home";
    const own = this.ownSettingsSectionIds;
    const section = own.find((id) => id === params["settingsSection"]) ?? own[0];
    if (page === "settings" && section !== this.settingsSection) {
      if (this.settingsLoaded) {
        this.showSettingsSection(section);
      } else {
        this.settingsSection = section;
      }
    }
    if (page !== this.page) {
      this.showPage(page);
    }
    if (namedApp && !app && this.allowedApps) {
      this.writeUrlState(true); // not theirs: the URL says Home
    }
    if (state !== undefined) {
      this.cd.detectChanges();
    }
  }

  // -- Home page: the apps ----------------------------------------------------

  /** The devices of an app: those of its device profiles. */
  private appDevices(app: Application): DeviceInfo[] {
    const profiles = new Set(app.deviceProfiles);
    return [...this.devices.values()].filter((d) => profiles.has(d.profile));
  }

  /** The summary cards and the charts, from the apps, the devices, the alarms and the stored counts (when any of them changed). */
  private rebuild(): void {
    const inputs = [
      this.apps.applications,
      this.apps.sites,
      this.org.sites.rows,
      this.org.markets.rows,
      this.org.productLines.rows,
      this.devices,
      this.devicesLoading,
      this.alarms,
      this.alarmsLoading,
      this.counts,
    ];
    if (inputs.every((x, i) => x === this.seenRows[i])) {
      return;
    }
    this.seenRows = inputs;
    this.homeScope = this.scopeOf();
    this.summaryCards = this.buildSummaryCards();
    this.buildRankCards();
    this.requestAlarmsPerDay();
  }

  /**
   * Who the Home page is for, from what the viewer can see: one site — that
   * plant; sites in one market — that market (with the product line covering
   * them, if one does); sites under one product line — it (the most specific
   * one covering them all); else (a tenant administrator, a regional or wider
   * scope) everything.
   */
  private scopeOf(): HomeScope {
    if (this.isTenantAdmin) {
      return ALL_SCOPE;
    }
    const sites = this.org.sites.rows;
    const lines = this.org.productLines.rows;
    const markets = this.org.markets.rows;
    if (!sites.length) {
      return ALL_SCOPE;
    }
    if (sites.length === 1) {
      const site = sites[0];
      return {
        kind: "site",
        title: `Plant · ${site.label || site.name}`,
        site,
        market: markets.find((m) => m.id === site.marketId),
        productLine: lines.find((l) => l.id === site.productLineId),
      };
    }
    const lineIds = [...new Set(sites.map((x) => x.productLineId).filter((id): id is string => !!id))];
    const depth = (id: string) => lineAncestors(id, lines).length;
    const covering = lineIds.length
      ? lines.filter((l) => lineIds.every((id) => id === l.id || lineWithin(id, l.id, lines))).sort((a, b) => depth(b.id) - depth(a.id))[0]
      : undefined;
    const marketIds = new Set(sites.map((x) => x.marketId).filter(Boolean));
    if (marketIds.size === 1) {
      const market = markets.find((m) => marketIds.has(m.id));
      const lineCode = covering && lineIds.length === 1 ? ` (${covering.name})` : "";
      return { kind: "market", title: `Market · ${market?.name ?? "—"}${lineCode}`, market, productLine: lineIds.length === 1 ? covering : undefined };
    }
    if (covering) {
      return { kind: "productLine", title: `Product line · ${covering.name}`, productLine: covering };
    }
    return ALL_SCOPE;
  }

  /**
   * The Home page's charts, a level under the scope: devices by two
   * dimensions — everything's from the stored counts (markets, product
   * lines), a scope's from the devices it sees (where each is).
   */
  /**
   * The ranked cards (the Fuel Reports page's "By …" lists): devices by the dimensions a level under the scope, most first — each
   * line its devices, its share of them all, its bar (the most a full one) online in green and offline in grey; past {@link
   * MAX_BARS} the rest as "Other". Everything's: by market and product line, from the stored counts; a scope's: from its devices.
   */
  private buildRankCards(): void {
    const scope = this.homeScope;
    const dims = SCOPE_DIMENSIONS[scope.kind];
    let lists: DeviceTally[][];
    let loading = this.devicesLoading;
    if (scope.kind === "all") {
      const c = this.counts;
      const tallies = (rows: HierarchyCount[]): DeviceTally[] =>
        capTallies(
          rows
            .filter((r) => r.devices > 0)
            .map((r) => ({ name: r.name, label: r.label, devices: r.devices, online: r.online }))
            .sort((a, b) => b.devices - a.devices || named(a).localeCompare(named(b)))
        );
      // A product line by its own devices (its sites') — a parent line (BM, ACM) isn't summed from its sub lines.
      lists = c ? [tallies(c.markets), tallies(c.productLines)] : [[], []];
      loading = this.countsLoading;
    } else {
      lists = dims.map((dim) => this.devicesByDimension(dim));
    }
    this.rankCards = dims.map((dim, i) => ({
      id: `devices-${dim}`,
      title: `Devices by ${DIMENSION_NOUN[dim]}`,
      info: `Each ${DIMENSION_NOUN[dim]}'s devices and its share of them all — its bar online (green) and offline (grey)`,
      wireframe: loading,
      rows: loading ? placeholderRows(5) : lists[i].length ? rankedDeviceRows(lists[i]) : [{ label: `No devices by ${DIMENSION_NOUN[dim]}`, value: "" }],
    }));
  }

  /** A device's key on a dimension (none: ""). */
  private deviceKeys(d: DeviceInfo, dim: HomeDimension): string[] {
    switch (dim) {
      case "site":
        return [d.site];
      case "market":
        return [d.market];
      case "productLine":
        return [d.productLine];
      default:
        return [d.profile];
    }
  }

  /** A dimension's key in words: a site, market or product line by its label (its code without one); none — "Not placed" / "No app". */
  private dimensionLabel(dim: HomeDimension, key: string): string {
    if (!key) {
      return dim === "profile" ? "No type" : "Not placed";
    }
    const rows = dim === "site" ? this.org.sites.rows : dim === "market" ? this.org.markets.rows : dim === "productLine" ? this.org.productLines.rows : null;
    const row = rows?.find((r) => r.name === key);
    return row ? row.label || row.name : key;
  }

  /** Devices on a dimension, with those online: most first, past {@link MAX_BARS} the rest as "Other". */
  private devicesByDimension(dim: HomeDimension): DeviceTally[] {
    const groups = new Map<string, { devices: number; online: number }>();
    for (const d of this.devices.values()) {
      for (const key of this.deviceKeys(d, dim)) {
        const g = groups.get(key) ?? { devices: 0, online: 0 };
        g.devices++;
        g.online += d.active ? 1 : 0;
        groups.set(key, g);
      }
    }
    const rows = [...groups.entries()]
      .map(([key, g]) => ({ name: key, label: this.dimensionLabel(dim, key), ...g }))
      .sort((a, b) => b.devices - a.devices || a.label.localeCompare(b.label, undefined, { numeric: true }));
    return capTallies(rows);
  }

  /**
   * The summary cards: everything's — the gateways, the alarms, the devices
   * by app, the Organization; a scope's — its devices, its active alarms,
   * its top alarms, its devices by app.
   */
  private buildSummaryCards(): SummaryCard[] {
    if (this.homeScope.kind === "all") {
      return [this.gatewaysCard(), this.alarmsCard(), this.appCard(), this.organizationCard()];
    }
    return [this.devicesCard(), this.alarmsCard(), this.topAlarmsCard(), this.appCard()];
  }

  /** "n (p%)" — a share of a whole; "…" while loading. */
  private share(n: number, of: number, loading = this.devicesLoading): string {
    return loading ? "…" : `${n}${of ? ` (${Math.round((n / of) * 100)}%)` : ""}`;
  }

  /** A fleet's lines: how many, then online, offline and in alarm — each with its share; "In alarm" always red, at 0 too. */
  private fleetRows(label: string, icon: string, fleet: DeviceInfo[]): SummaryRow[] {
    const online = fleet.filter((d) => d.active).length;
    const inAlarm = fleet.filter((d) => (this.alarmCounts.get(d.id) ?? 0) > 0).length;
    return [
      { label, icon, value: this.devicesLoading ? "…" : String(fleet.length) },
      { label: "Online", mark: "success", value: this.share(online, fleet.length) },
      { label: "Offline", mark: "neutral", value: this.share(fleet.length - online, fleet.length) },
      { label: "In alarm", mark: "error", value: this.share(inAlarm, fleet.length, this.devicesLoading || this.alarmsLoading) },
    ];
  }

  private gatewaysCard(): SummaryCard {
    return { id: "gateways", title: "Gateways", rows: this.fleetRows("Gateways", "router", [...this.devices.values()].filter((d) => d.gateway)) };
  }

  /** A scope's devices: how many — and how many of them gateways — then online, offline and in alarm. */
  private devicesCard(): SummaryCard {
    const all = [...this.devices.values()];
    const [count, ...status] = this.fleetRows("Devices", DEFAULT_PROFILE_ICON.device, all);
    const gateways = all.filter((d) => d.gateway).length;
    return { id: "devices", title: "Devices", rows: [count, { label: "Gateways", icon: "router", value: this.devicesLoading ? "…" : String(gateways) }, ...status] };
  }

  /**
   * The Top alarms card: the most frequent active alarm types ({@link TOP_ALARMS}),
   * each with how many are active, marked by its most severe one.
   */
  private topAlarmsCard(): SummaryCard {
    if (this.alarmsLoading) {
      return { id: "topAlarms", title: "Top alarms", wireframe: true, rows: placeholderRows(TOP_ALARMS) };
    }
    const byType = new Map<string, { n: number; severities: Set<string> }>();
    for (const a of this.alarms) {
      const t = byType.get(a.type) ?? { n: 0, severities: new Set<string>() };
      t.n++;
      t.severities.add(a.severity);
      byType.set(a.type, t);
    }
    // Ranked (the Fuel Reports page's "Top …" lists): each type's share of the active alarms, its bar — the most a full one.
    const ranked = [...byType.entries()].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0])).slice(0, TOP_ALARMS);
    const most = ranked[0]?.[1].n ?? 0;
    const rows: SummaryRow[] = ranked.map(([type, t]) => ({
      label: type,
      mark: SEVERITY_MARKS.find(([sev]) => t.severities.has(sev))?.[1] ?? "neutral",
      value: String(t.n),
      meta: percent(t.n, this.alarms.length),
      share: most ? t.n / most : 0,
    }));
    return { id: "topAlarms", title: "Top alarms", rows: rows.length ? rows : [{ label: "No active alarms", value: "—" }] };
  }

  private alarmsCard(): SummaryCard {
    const count = (severity: string) => this.alarms.filter((a) => a.severity === severity).length;
    const v = (n: number) => (this.alarmsLoading ? "…" : String(n));
    return {
      id: "alarms",
      title: "Active alarms",
      rows: [
        { label: "Total", icon: "notifications", value: v(this.alarms.length) },
        { label: "Critical", mark: "error", value: v(count("CRITICAL")) },
        { label: "Major", mark: "major", value: v(count("MAJOR")) },
        { label: "Minor", mark: "minor", value: v(count("MINOR")) },
        { label: "Warning", mark: "warning", value: v(count("WARNING")) },
      ],
    };
  }

  /**
   * The "By app" card (the Fuel Reports page's split, as its fuel types'): each app's devices (by its device profiles) as one bar
   * under its title — each app as wide as its share — then a line each, most first, in the chart palette's fixed order: its swatch,
   * its share, its devices; the four largest apps, the rest as "Other" (the palette's fifth colour).
   */
  private appCard(): SummaryCard {
    const apps = this.apps.applications;
    if (this.apps.loading || this.devicesLoading) {
      return { id: "apps", title: "By app", wireframe: true, rows: placeholderRows(4) };
    }
    if (!apps.length) {
      return { id: "apps", title: "By app", rows: [{ label: "No apps", value: "—" }] };
    }
    // Only apps with devices — in the ring and its legend.
    const counted = apps
      .map((app) => ({ name: app.label || app.name, n: this.appDevices(app).length }))
      .filter((a) => a.n > 0)
      .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
    if (!counted.length) {
      return { id: "apps", title: "By app", rows: [{ label: "No devices in an app", value: "—" }] };
    }
    const parts = counted.length > APP_SWATCHES.length ? [...counted.slice(0, APP_SWATCHES.length - 1), { name: "Other", n: counted.slice(APP_SWATCHES.length - 1).reduce((t, x) => t + x.n, 0) }] : counted;
    const total = parts.reduce((t, p) => t + p.n, 0);
    return {
      id: "apps",
      title: "By app",
      composition: parts.map((p, i) => ({ label: p.name, color: APP_SWATCHES[i], share: total ? p.n / total : 0 })),
      rows: parts.map((p, i) => ({ label: p.name, swatch: APP_SWATCHES[i], meta: percent(p.n, total), value: String(p.n), unit: "devices" })),
    };
  }

  /** The Organization: how many product lines, markets and sites it has. */
  private organizationCard(): SummaryCard {
    const c = this.counts;
    const v = (n: number) => (c ? String(n) : "…");
    // Each by its asset profile's icon (the Organization's kinds of asset).
    const icons = profileIconsOf(this.ctx);
    const s = this.settings;
    return {
      id: "organization",
      title: "Organization",
      rows: [
        { label: "Product lines", icon: icons.of("asset", s.productLineAssetType), value: v(c?.productLines.length ?? 0) },
        { label: "Markets", icon: icons.of("asset", s.marketAssetType), value: v(c?.markets.length ?? 0) },
        { label: "Sites", icon: icons.of("asset", s.siteAssetType), value: v(c?.sites.length ?? 0) },
      ],
    };
  }

  /**
   * Navigate to a ThingsBoard path. A user set to "Always fullscreen" may only
   * open the fullscreen dashboard route (`/dashboard/<id>`), so for them a
   * `/dashboards/<id>` or `/dashboards/<group>/<id>` path is rewritten to it.
   */
  private navigate(url: string): void {
    this.ctx.store.pipe(select(selectAuth), take(1)).subscribe((auth) => {
      const m = auth?.forceFullscreen ? /^\/dashboards\/(?:[^/]+\/)?([0-9a-f-]{36})(\?.*)?$/i.exec(url) : null;
      this.ctx.router.navigateByUrl(m ? `/dashboard/${m[1]}${m[2] ?? ""}` : url);
    });
  }

  // -- alarms panel -----------------------------------------------------------

  closeAlarms(): void {
    this.alarmPanelOpen = false;
  }

  get alarmPanelSubtitle(): string {
    const n = this.alarms.length;
    return this.alarmsLoading ? "Loading…" : n === 0 ? "No active alarms" : `${n} active alarm${n === 1 ? "" : "s"}`;
  }

  clearAlarm(alarm: AlarmListItem): void {
    clearDashboardAlarm(this.alarmService, this.destroyRef, alarm);
  }

  // -- data: settings, devices and alarms -------------------------------------

  private readSettings(): HomeDashboardSettings {
    return { ...homeDashboardDefaultSettings, ...((this.ctx.settings ?? {}) as Partial<HomeDashboardSettings>) };
  }

  /**
   * Request options for the widget's own calls: no global loading bar and no
   * "Permission Denied" dialog from ThingsBoard's interceptor — a refused call
   * is handled here (a dash, a fallback).
   */
  private silent(params?: Record<string, string>): { headers: any; params: any } {
    return defaultHttpOptionsFromConfig({ ignoreLoading: true, ignoreErrors: true, queryParams: params });
  }

  /**
   * This dashboard's id: the last id in the route (`/dashboards/<id>`,
   * `/dashboards/<group>/<id>`, `/dashboard/<id>`) — or, opened as the user's
   * home dashboard (`/home`, no id in it), the one ThingsBoard's route resolved
   * (its `homeDashboard` data).
   */
  private currentDashboardId(): string {
    const inUrl = /\/dashboards?\/(?:[^/?]+\/)?([0-9a-f-]{36})/i.exec(this.ctx.router?.url ?? "")?.[1];
    if (inUrl) {
      return inUrl;
    }
    let id = "";
    for (let route = this.ctx.router?.routerState?.snapshot?.root; route; route = route.firstChild) {
      id = route.data?.["homeDashboard"]?.id?.id ?? id;
    }
    return id;
  }

  /**
   * The rail's development switch (tenant administrators'): this dashboard's other version ("Home" ⇄ "Home Development"),
   * found by title among the dashboards they can open (`/api/user/dashboards`: all their groups', paged).
   */
  private loadDevSwitch(): void {
    if (!this.isTenantAdmin) {
      return;
    }
    const here = this.currentDashboardId();
    const fetchPage = (page: number) =>
      this.ctx.http
        .get<{ data: DashboardTitle[]; hasNext: boolean }>(
          "/api/user/dashboards",
          this.silent({ pageSize: "200", page: String(page), sortProperty: "title", sortOrder: "ASC" })
        )
        .pipe(map((result) => ({ page, result })));
    fetchPage(0)
      .pipe(
        expand(({ page, result }) => (result?.hasNext ? fetchPage(page + 1) : of())),
        reduce((all, { result }) => all.concat(result?.data ?? []), [] as DashboardTitle[]),
        catchError(() => of([] as DashboardTitle[])),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((dashboards) => {
        const current = dashboards.find((d) => d.id.id === here);
        if (!current) {
          return;
        }
        const on = current.title.endsWith(DEV_DASHBOARD_SUFFIX);
        const other = on ? current.title.slice(0, -DEV_DASHBOARD_SUFFIX.length) : `${current.title}${DEV_DASHBOARD_SUFFIX}`;
        const target = dashboards.find((d) => d.id.id !== here && d.title === other);
        this.devSwitch = target ? { on, targetId: target.id.id } : null;
        this.railFootItems = dashboardRailFootItems(this.devSwitch);
        this.cd.detectChanges();
      });
  }

  /**
   * The heatmap's counts, read once the Home page shows and its own data (the
   * devices, the stored counts, the alarms — a user's, the Organization too:
   * their scope's assets) is in: never ahead of a page's first load, nor for
   * a page that doesn't show it (an app's, Settings).
   */
  private requestAlarmsPerDay(): void {
    if (this.alarmsPerDayRequested || this.page !== "home" || this.devicesLoading || this.countsLoading || this.alarmsLoading) {
      return;
    }
    const org = this.org;
    if (!this.isTenantAdmin && (!org || org.sites.loading || org.markets.loading || org.productLines.loading)) {
      return;
    }
    this.alarmsPerDayRequested = true;
    this.loadAlarmsPerDay();
    this.loadAlarmWeekHour();
  }

  /**
   * The day-and-hour map's counts: the last {@link ALARM_DAYS} days' alarms of every status (created in them) — a tenant
   * administrator's the tenant's devices' (pages of them), anyone else's their devices' one by one (the alarm query the server
   * refuses them, as the active alarms') — each counted at its start's day of the week and hour; read again every few minutes. A
   * failed read counts none (a device's: its alarms).
   */
  private loadAlarmWeekHour(): void {
    timer(0, ALARM_HOURS_REFRESH_MS)
      .pipe(
        exhaustMap(() => {
          const end = Date.now();
          const start = new Date(end);
          start.setHours(0, 0, 0, 0);
          start.setDate(start.getDate() - (ALARM_DAYS - 1));
          const window = { startTime: String(start.getTime()), endTime: String(end) };
          return this.isTenantAdmin ? this.tenantAlarmsIn(window) : this.deviceAlarmsIn(window);
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((created) => {
        const counts = WEEK_ROWS.map(() => new Array(24).fill(0));
        for (const ts of created) {
          const at = new Date(ts);
          counts[(at.getDay() + 6) % 7][at.getHours()]++;
        }
        this.alarmWeekHour = counts;
        this.alarmWeekHourLoading = false;
        this.cd.detectChanges();
      });
  }

  /** The tenant's device alarms created in the window (a tenant administrator's): their start times, a page at a time. */
  private tenantAlarmsIn(window: { startTime: string; endTime: string }): Observable<number[]> {
    const page = (n: number) =>
      this.ctx.http
        .get<{ data: any[]; hasNext: boolean }>(
          "/api/v2/alarms",
          this.silent({ ...window, pageSize: String(ALARM_PAGE), page: String(n), sortProperty: "createdTime", sortOrder: "DESC" })
        )
        .pipe(catchError(() => of({ data: [] as any[], hasNext: false })));
    return page(0).pipe(
      expand((res, i) => (res.hasNext && i + 1 < ALARM_PAGES ? page(i + 1) : EMPTY)),
      reduce((all, res) => [...all, ...(res.data ?? []).filter((a) => a?.originator?.entityType === EntityType.DEVICE).map((a) => Number(a.createdTime))], [] as number[])
    );
  }

  /** Each of the user's devices' alarms created in the window: their start times (a few devices at a time). */
  private deviceAlarmsIn(window: { startTime: string; endTime: string }): Observable<number[]> {
    const devices = [...this.devices.values()];
    if (!devices.length) {
      return of([]);
    }
    return of(...devices).pipe(
      mergeMap(
        (d) =>
          this.ctx.http
            .get<{ data: any[] }>(`/api/v2/alarm/DEVICE/${d.id}`, this.silent({ ...window, pageSize: String(ALARM_PAGE), page: "0" }))
            .pipe(
              map((res) => (res?.data ?? []).map((a) => Number(a.createdTime))),
              catchError(() => of([] as number[]))
            ),
        6
      ),
      reduce((all, list) => [...all, ...list], [] as number[])
    );
  }

  /**
   * The heatmap's counts: the days the backend keeps — a tenant
   * administrator's the tenant's (every device), a user's those of their
   * scope's assets — read again as often as the backend counts them. A
   * failed re-read keeps what's shown.
   */
  private loadAlarmsPerDay(): void {
    const ids = (rows: { id: string }[]) => rows.map((r) => r.id);
    const seen = { siteIds: ids(this.org.sites.rows), marketIds: ids(this.org.markets.rows), productLineIds: ids(this.org.productLines.rows) };
    viewerAlarmsPerDaySource(this.ctx, seen)
      .pipe(
        switchMap((source) => timer(0, ALARMS_PER_DAY_REFRESH_MS).pipe(exhaustMap(() => loadAlarmsPerDay(this.ctx, source)))),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((points) => {
        if (points === undefined && !this.alarmsPerDayLoading) {
          return;
        }
        this.alarmsPerDay = points ?? null;
        this.alarmsPerDayLoading = false;
        this.alarmStrip = alarmStripOf(this.alarmsPerDay);
        this.cd.detectChanges();
      });
  }

  /** Every device the user can see, with its profile and the `active` attribute, paged. */
  private loadDevices(): void {
    const fetchPage = (page: number) =>
      this.ctx.http
        .post<EntityQueryPage>(
          "/api/entitiesQuery/find",
          {
            entityFilter: { type: "entityType", entityType: "DEVICE" },
            entityFields: [
              { type: "ENTITY_FIELD", key: "name" },
              { type: "ENTITY_FIELD", key: "label" },
              { type: "ENTITY_FIELD", key: "type" },
              { type: "ENTITY_FIELD", key: "additionalInfo" },
            ],
            latestValues: [
              { type: "ATTRIBUTE", key: "active" },
              // Where it is (codes): the scoped Home page's charts.
              { type: "SERVER_ATTRIBUTE", key: "site" },
              { type: "SERVER_ATTRIBUTE", key: "market" },
              { type: "SERVER_ATTRIBUTE", key: "productLine" },
            ],
            pageLink: byNamePageLink(1000, page),
          },
          this.silent()
        )
        .pipe(map((result) => ({ page, result })));
    fetchPage(0)
      .pipe(
        expand(({ page, result }) => (result?.hasNext ? fetchPage(page + 1) : of())),
        reduce((all, { result }) => all.concat(result?.data ?? []), [] as EntityQueryPage["data"]),
        catchError(() => of([] as EntityQueryPage["data"])),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((rows) => {
        this.devices = new Map(
          rows.map((row) => {
            const f = row.latest?.["ENTITY_FIELD"] ?? {};
            const active = row.latest?.["ATTRIBUTE"]?.["active"]?.value;
            const at = row.latest?.["SERVER_ATTRIBUTE"] ?? {};
            const code = (key: string) => String(at[key]?.value ?? "");
            return [
              row.entityId.id,
              {
                id: row.entityId.id,
                name: String(f["label"]?.value || f["name"]?.value || ""),
                profile: String(f["type"]?.value ?? ""),
                active: active === true || active === "true",
                gateway: parseObject(f["additionalInfo"]?.value)["gateway"] === true,
                site: code("site"),
                market: code("market"),
                productLine: code("productLine"),
              },
            ];
          })
        );
        this.devicesLoading = false;
        this.rebuild();
        this.cd.detectChanges();
        if (this.alarmsFallback) {
          this.loadAlarmsPerDevice();
        }
      });
  }

  /**
   * The stored device counts of the sites, markets and product lines (the
   * hierarchy's calculated fields) — read again whenever one of them changes
   * (a latest-values subscription; a burst of changes reads once).
   */
  private loadCounts(): void {
    const s = this.settings;
    const read = () =>
      loadHierarchyCounts(this.ctx, s)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((counts) => {
          this.counts = counts;
          this.countsLoading = false;
          this.rebuild();
          this.cd.detectChanges();
        });
    read();
    this.countsChanged.pipe(auditTime(3000), takeUntilDestroyed(this.destroyRef)).subscribe(() => read());
    const k = HIERARCHY_COUNT_KEYS;
    subscribeLatestChanges(
      this.ctx,
      this.destroyRef,
      {
        entityFilter: { type: AliasFilterType.assetType, assetTypes: [s.siteAssetType, s.marketAssetType, s.productLineAssetType], assetNameFilter: "" } as any,
        timeseries: [k.devices, k.online, k.lineDevices, k.lineOnline],
      },
      () => this.countsChanged.next(),
      (subscription) => (this.countsSubscription = subscription)
    );
  }

  /** Live active alarms on every device the user can see (ten-year window = "all active"). */
  private subscribeAlarms(): void {
    subscribeActiveAlarms(this.ctx, this.destroyRef, {
      entityFilter: { type: AliasFilterType.entityType, entityType: EntityType.DEVICE },
      onSubscribed: (subscription) => (this.alarmsSubscription = subscription),
      onUpdated: (alarms) => this.onAlarmsUpdated(alarms),
      // The alarm query fails server-side for customer users on this instance: read the alarms device by device instead.
      onError: () => this.useAlarmFallback(),
    });
  }

  /** The alarm subscription failed: switch to per-device reads (now, and again whenever the devices reload). */
  private useAlarmFallback(): void {
    if (this.alarmsFallback) {
      return;
    }
    this.alarmsFallback = true;
    removeSubscriptions(this.ctx, this.alarmsSubscription);
    this.alarmsSubscription = null;
    this.loadAlarmsPerDevice();
  }

  /** Active alarms read device by device (a few at a time), for users whose alarm query the server refuses. */
  private loadAlarmsPerDevice(): void {
    if (this.devicesLoading) {
      return; // runs once the devices are in
    }
    const devices = [...this.devices.values()];
    if (!devices.length) {
      this.onAlarmsUpdated([]);
      return;
    }
    of(...devices)
      .pipe(
        mergeMap(
          (d) =>
            this.ctx.http.get<{ data: any[] }>(`/api/v2/alarm/DEVICE/${d.id}`, this.silent({ pageSize: "100", page: "0", statusList: "ACTIVE" })).pipe(
              map((page) => (page?.data ?? []).map((a) => ({ ...a, originatorName: a.originatorName || d.name }))),
              catchError(() => of([] as any[]))
            ),
          6
        ),
        toArray(),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((pages) => {
        const data = pages.flat().sort((a, b) => (b.createdTime ?? 0) - (a.createdTime ?? 0));
        this.onAlarmsUpdated(data.map(toDashboardAlarm));
      });
  }

  private onAlarmsUpdated(alarms: DashboardAlarm[]): void {
    this.alarms = alarms;
    this.alarmCounts = countAlarmsByOriginator(this.alarms);
    this.alarmsLoading = false;
    if (this.alarms.length !== this.railAlarmCount) {
      this.buildRail(); // the rail's Alarms count
    }
    this.rebuild();
    this.cd.detectChanges();
  }

}

/** A count's name in the charts: its label, else its code. */
function named(x: { name: string; label: string }): string {
  return x.label || x.name;
}

/** A share of a whole in words ("23%"); "" without a whole. */
function percent(n: number, of: number): string {
  return of ? `${Math.round((n / of) * 100)}%` : "";
}

/** A card's lines while they're read: placeholders (as many as it'll show), never a "Loading…" line. */
function placeholderRows(count: number): SummaryRow[] {
  return Array.from({ length: count }, (_, i) => ({ label: String(i), value: "" }));
}

/** Tallies past {@link MAX_BARS}: the first ones, the rest folded into "Other". */
function capTallies(rows: DeviceTally[]): DeviceTally[] {
  return capRows(rows, (rest) => ({ name: "other", label: "Other", devices: sum(rest, "devices"), online: sum(rest, "online") }));
}

/**
 * A "By …" card's lines: each its devices, its share of them all (muted before them) and its bar — the most a full one — in two parts,
 * online in the status scale's green and offline in the Offline pill's grey (the status split's colours), each named in its bubble.
 */
function rankedDeviceRows(rows: DeviceTally[]): SummaryRow[] {
  const total = rows.reduce((t, r) => t + r.devices, 0);
  const most = Math.max(0, ...rows.map((r) => r.devices));
  return rows.map((r) => {
    const offline = Math.max(0, r.devices - r.online);
    return {
      label: named(r),
      meta: percent(r.devices, total),
      value: fmtNumber(r.devices, 0),
      share: most ? r.devices / most : 0,
      shareParts: r.devices
        ? [
            { label: `Online ${fmtNumber(r.online, 0)}`, color: "var(--c-bg-success-normal)", share: r.online / r.devices },
            { label: `Offline ${fmtNumber(offline, 0)}`, color: "var(--c-text-pill-neutral)", share: offline / r.devices },
          ]
        : [],
    };
  });
}

/**
 * The alarms' figures strip (the Fuel Reports page's), beside the calendar of the same days: the last {@link ALARM_STRIP_DAYS} days'
 * alarms — against the days before them as its chip, its course a day a point as its line — then today's, a day's average, the
 * busiest day (its date) and the days with any, each day the viewer's (the calendar's own days); null when there are no counts to
 * read.
 */
function alarmStripOf(points: HeatmapPoint[] | null): AlarmStrip | null {
  if (points === null) {
    return null;
  }
  const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const perDay = new Map<string, number>();
  for (const p of points) {
    const k = key(new Date(p.ts));
    perDay.set(k, (perDay.get(k) ?? 0) + (Number(p.value) || 0));
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // The period and the one before it, a day each, oldest first.
  const span = 2 * ALARM_STRIP_DAYS;
  const days = Array.from({ length: span }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (span - 1 - i));
    return { date: d, n: perDay.get(key(d)) ?? 0 };
  });
  const total = (list: { n: number }[]) => list.reduce((t, d) => t + d.n, 0);
  const last = days.slice(-ALARM_STRIP_DAYS);
  const now = total(last);
  const then = total(days.slice(0, ALARM_STRIP_DAYS));
  const rounded = then ? Math.round(((now - then) / then) * 100) : 0;
  const change: StatHeadline["change"] = then
    ? { text: `${rounded > 0 ? "+" : ""}${rounded}% vs the ${ALARM_STRIP_DAYS} days before`, direction: rounded > 0 ? "up" : rounded < 0 ? "down" : "flat" }
    : now
      ? { text: `None the ${ALARM_STRIP_DAYS} days before`, direction: "up" }
      : { text: `As the ${ALARM_STRIP_DAYS} days before`, direction: "flat" };
  const average = now / ALARM_STRIP_DAYS;
  const peak = last.reduce((best, d) => (d.n > best.n ? d : best), last[0]);
  return {
    headline: { label: `Alarms · last ${ALARM_STRIP_DAYS} days`, value: fmtNumber(now, 0), change, trend: last.map((d) => d.n) },
    items: [
      { label: "Today", value: fmtNumber(last[last.length - 1].n, 0) },
      { label: "Per day", value: fmtNumber(average, average < 10 && now > 0 ? 1 : 0) },
      {
        label: "Busiest day",
        value: fmtNumber(peak.n, 0),
        note: peak.n ? peak.date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "",
      },
      { label: "Days with alarms", value: String(last.filter((d) => d.n > 0).length), unit: `/ ${ALARM_STRIP_DAYS}` },
    ],
  };
}

/** Rows past {@link MAX_BARS}: the first ones, the rest folded into one (`other`). */
function capRows<T>(rows: T[], other: (rest: T[]) => T): T[] {
  return rows.length > MAX_BARS ? [...rows.slice(0, MAX_BARS - 1), other(rows.slice(MAX_BARS - 1))] : rows;
}

function sum<T>(rows: T[], key: keyof T): number {
  return rows.reduce((t, r) => t + (Number(r[key]) || 0), 0);
}
