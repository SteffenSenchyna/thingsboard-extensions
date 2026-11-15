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
import { Observable, of, throwError } from "rxjs";
import { catchError, map, switchMap } from "rxjs/operators";
import type { AlarmService } from "@core/http/alarm.service";
import {
  AliasFilterType,
  AttributeScope,
  Device,
  EntityDataQuery,
  EntityFilter,
  EntityKeyType,
  EntityType,
  SharedModule,
} from "@shared/public-api";
import { WidgetContext } from "@home/models/widget-component.models";
import { injectCss } from "../../../components/shared/cdn-loader";
import { CountMarkComponent } from "../../../components/shared/count-mark/count-mark.component";
import { DashboardAlarm, alarmsTab, clearDashboardAlarm, countAlarmsByOriginator, subscribeActiveAlarms } from "../../../components/shared/dashboard/dashboard-alarms";
import { dashboardRailItems, isTenantAdmin, DashboardTheme, readUserSettings } from "../../../components/shared/dashboard/dashboard-preferences";
import { DashboardHost, NestedDashboard, dashboardWidgetSettings } from "../../../components/shared/dashboard/nested-dashboard";
import { byNamePageLink, removeSubscriptions, subscribeLatestChanges } from "../../../components/shared/dashboard/dashboard-subscriptions";
import { formatWhen, relativeTime } from "../../../components/shared/time-format";
import { QUIET_REQUEST, apiMessage, fmtNumber, parseDescription, parseNumber, parseObject } from "../../../components/shared/value-utils";
import { AlarmListComponent, AlarmListItem } from "../../../components/shared/alarm-list/alarm-list.component";
import { AlarmPanelComponent } from "../../../components/shared/alarm-panel/alarm-panel.component";
import { OWNER_ENTITY_FIELDS, ownerCustomer } from "../../../components/shared/entity-owner";
import { CheckFilterComponent } from "../../../components/shared/check-filter/check-filter.component";
import { FilterSectionComponent } from "../../../components/shared/filter-section/filter-section.component";
import { FilterSectionsComponent } from "../../../components/shared/filter-sections/filter-sections.component";
import { DataTableCellDirective, DataTableColumn, DataTableComponent } from "../../../components/shared/data-table/data-table.component";
import { TableLinksComponent } from "../../../components/shared/table-links/table-links.component";
import { AttributeSelect, DeviceSettingObjectCard, DeviceSettingsCardComponent } from "../../../components/shared/device-settings-card/device-settings-card.component";
import { keepsSidePanelOpen } from "../../../components/shared/detail-panel/side-panel-outside-click";
import { EntityDetailPanelComponent } from "../../../components/shared/entity-detail-panel/entity-detail-panel.component";
import { FilterListComponent, FilterListOption } from "../../../components/shared/filter-list/filter-list.component";
import { MetricChartCardComponent, MetricChartSection } from "../../../components/shared/metric-chart-card/metric-chart-card.component";
import { NavRailComponent, NavRailItem } from "../../../components/shared/nav-rail/nav-rail.component";
import { DashboardLoadingComponent, FirstLoad } from "../../../components/shared/dashboard-loading/dashboard-loading.component";
import { SectionNavComponent } from "../../../components/shared/section-nav/section-nav.component";
import { SegmentOption, SegmentedControlComponent } from "../../../components/shared/segmented-control/segmented-control.component";
import { SidebarLayoutComponent } from "../../../components/shared/sidebar-layout/sidebar-layout.component";
import { StateTimelineComponent, StateTimelineState } from "../../../components/shared/state-timeline/state-timeline.component";
import { StatusPillComponent } from "../../../components/shared/status-pill/status-pill.component";
import { SearchBoxComponent } from "../../../components/shared/search-box/search-box.component";
import { SummaryCard, SummaryCardsComponent, SummaryRow } from "../../../components/shared/summary-cards/summary-cards.component";
import { ToastsComponent } from "../../../components/shared/toasts/toasts.component";
import { FeedbackDialogComponent } from "../../../components/shared/feedback/feedback-dialog/feedback-dialog.component";
import { FEEDBACK_RAIL_ID, feedbackOf } from "../../../components/shared/feedback/feedback.models";
import { ProfileIcons, profileIconsOf } from "../../../components/shared/profile-icons/profile-icons";
import { ASPHALT_SETTINGS_SECTIONS, AsphaltSettingsComponent } from "../../components/asphalt-settings/asphalt-settings.component";
import { TankFormComponent } from "../../components/tank-form/tank-form.component";
import {
  AsphaltDashboardSettings,
  TANK_CONDITIONS,
  LIQUID_TYPES,
  TANK_DETAIL_KEYS,
  TANK_SHAPE,
  TANK_STATUS_META,
  TankCondition,
  TankDetails,
  TankFormValue,
  TankRow,
  BurnerRow,
  burnerState,
  TankStatus,
  asphaltDashboardDefaultSettings,
  emptyTankDetails,
  tankConditions,
  withAlarmConditions,
} from "../../models/asphalt-monitoring.models";

/** The "By product" card's swatches: the chart palette, in its fixed order. */
const PRODUCT_SWATCHES = ["var(--c-chart-1)", "var(--c-chart-2)", "var(--c-chart-3)", "var(--c-chart-4)", "var(--c-chart-5)"];

/** The rail's pages. */
type DashboardPage = "tanks" | "burners" | "settings";
/** Tanks: the table; Settings: its sections. */
type DashboardView = "tanks" | "burners" | "settings";

/**
 * Asphalt tank monitoring: the tank devices (the configured profiles), their
 * level, temperature, tonnage and alarms — ThingsBoard's "Tank level
 * monitoring" template, as a dashboard of the extension's shared pieces.
 *
 * - Icon rail (left edge, as on the fuel and marine dashboards): Tanks and
 *   Settings, with the alarms and the theme toggle at its foot.
 * - Sidebar: the table's search, a Status filter (the alarm conditions — high
 *   level, low battery, low / high temperature — offline and no alarms; none
 *   checked = all) and a Products filter, both scoping the table, the
 *   summary cards and the alarms.
 * - Tanks: summary cards (the fleet, its levels, its products) over one row
 *   per tank — product, level (% with a bar, and the sensor's reading), temperature,
 *   tonnage and its active alarms. A row opens the tank panel: Insights (its
 *   level card and its level / temperature / tonnage charts),
 *   Alarms and Settings (the shared settings card: identity, alarm thresholds
 *   and the tank's set-up). "Add tank" in the table's footer opens the add
 *   panel: a new device of the configured profile with the form's values as its
 *   server attributes (the template's dialog).
 * - Settings: every tank's alarm thresholds, the tanks and how each is set
 *   up, and the data keys. A tank's own thresholds are set in its panel's
 *   Settings tab — they are the server attributes the device profile's alarm
 *   rules read.
 *
 * Where each value lives is set by {@link AsphaltDashboardSettings} (widget
 * settings override).
 */
@Component({
  selector: "tb-asphalt-dashboard",
  templateUrl: "./asphalt-dashboard.component.html",
  styleUrls: ["./asphalt-dashboard.component.scss"],
  standalone: true,
  imports: [
    CommonModule,
    SharedModule,
    SegmentedControlComponent,
    AlarmListComponent,
    AlarmPanelComponent,
    AsphaltSettingsComponent,
    CheckFilterComponent,
    DataTableCellDirective,
    DataTableComponent,
    DeviceSettingsCardComponent,
    EntityDetailPanelComponent,
    FilterListComponent,
    FilterSectionComponent,
    FilterSectionsComponent,
    MetricChartCardComponent,
    DashboardLoadingComponent,
    NavRailComponent,
    SectionNavComponent,
    SidebarLayoutComponent,
    StateTimelineComponent,
    StatusPillComponent,
    SearchBoxComponent,
    SummaryCardsComponent,
    TankFormComponent,
    ToastsComponent,
    FeedbackDialogComponent,
    CountMarkComponent,
    TableLinksComponent,
  ],
})
export class AsphaltDashboardComponent implements OnInit, OnDestroy, NestedDashboard {
  @Input() ctx: WidgetContext;
  /** Opened inside the Home dashboard (one of its apps): no rail of its own, Home's theme (nested-dashboard.ts). */
  @Input() host: DashboardHost | null = null;

  settings: AsphaltDashboardSettings = asphaltDashboardDefaultSettings;
  /** The light / dark theme: the user's pick, or the system's (shared with the other dashboards). */
  theme!: DashboardTheme;
  get darkMode(): boolean {
    return !!this.theme?.dark;
  }

  // -- layout -----------------------------------------------------------------

  readonly pages: NavRailItem[] = [
    { id: "tanks", label: "Tanks", icon: "oil_barrel" },
    { id: "burners", label: "Burners", icon: "local_fire_department" },
    { id: "settings", label: "Settings", icon: "settings" },
  ];
  page: DashboardPage = "tanks";
  view: DashboardView = "tanks";
  sidebarOpen = true;
  private pageView: Record<DashboardPage, DashboardView> = { tanks: "tanks", burners: "burners", settings: "settings" };

  // -- burners ------------------------------------------------------------------

  /** Every burner. */
  burners: BurnerRow[] = [];
  burnersLoading = true;
  /** The Burners table: its name (with its profile's icon), then each state (the shared status pills — green OK, red fault), then its alarms. */
  burnerColumns: DataTableColumn[] = [];
  /** The burner panel (opens from a Burners row): its state timelines, alarms and identity settings. */
  selectedBurner: BurnerRow | null = null;
  burnerOpen = false;
  /** Active alarms of the selected burner (its panel's Alarms tab). */
  burnerAlarms: AlarmListItem[] = [];
  /** The panel's state timelines (always the last day). */
  burnerTimelines: { key: string; title: string; states: StateTimelineState[] }[] = [];
  /** Map a raw boolean value ("true", true, "False", …) to a timeline state id. */
  readonly burnerStateId = (raw: string): string | null => {
    const v = String(raw).trim().toLowerCase();
    return v === "true" || v === "false" ? v : null;
  };

  // -- settings page ------------------------------------------------------------

  readonly settingsSections = ASPHALT_SETTINGS_SECTIONS;
  settingsSection = "thresholds";

  // -- tanks + filters ----------------------------------------------------------

  /** Every tank, unfiltered. */
  tanks: TankRow[] = [];
  tanksLoading = true;
  /** The tanks in the Status / Products filters. */
  visibleTanks: TankRow[] = [];
  /** The table's search — the sidebar box's chips and text, and both together for the table. */
  tankSearchTerms: string[] = [];
  tankSearchText = "";
  tankSearch: string[] = [];
  /** The Status filter: the conditions shown (none checked = all), with counts. */
  selectedConditions: TankCondition[] = [];
  conditionOptions: FilterListOption[] = [];
  /** The Products filter (none checked = all), with counts. */
  selectedProducts: string[] = [];
  productOptions: FilterListOption[] = [];
  /** The summary cards over the table: the tanks in the filter. */
  tankSummary: SummaryCard[] = [];
  /** The Tanks table; its name column shows the tank's profile icon. */
  readonly tankColumns: DataTableColumn[] = [
    { key: "name", header: "Tank", iconOf: (r) => this.deviceIcon(r["type"]) },
    { key: "product", header: "Product" },
    { key: "level", header: "Level" },
    { key: "temperature", header: "Temperature" },
    { key: "tonnage", header: "Tonnage" },
    { key: "alarms", header: "Alarms" },
  ];
  readonly statusMeta = TANK_STATUS_META;

  // -- alarms -----------------------------------------------------------------

  alarmsLoading = false;
  alarmPanelOpen = false;
  /** Active alarms of the visible tanks (rail badge + alarms panel). */
  panelAlarms: AlarmListItem[] = [];
  /** Active alarms of the selected tank (its panel's Alarms tab). */
  detailAlarms: AlarmListItem[] = [];
  /** Active alarms per tank, by device id (the table's Alarms column). */
  alarmCounts = new Map<string, number>();

  // -- tank detail panel -----------------------------------------------------------

  selectedTank: TankRow | null = null;
  detailOpen = false;
  /** Tab the tank panel opens on — Insights, or Settings from the Settings page. */
  detailOpenTab = "insights";
  detailTab = "insights";
  insightsTimeframe = "1D";
  metricsCharts: MetricChartSection[] = [];
  /** The Settings tab's form value (rebuilt when the tank opens or reloads, so the form only resets then). */
  editValue: TankFormValue | null = null;
  editResetKey = 0;
  /** The Settings tab's set-up cards have edits / can be saved (the shared card's Apply). */
  setupDirty = false;
  setupValid = true;
  /** The Settings tab's "Alarm thresholds" card (the shared settings card's object card). */
  thresholdCards: DeviceSettingObjectCard[] = [];
  /** The Settings tab's "Product" card (the shared settings card's attribute select, second after the identity). */
  productSelects: AttributeSelect[] = [];
  productValues: Record<string, string> = {};
  /** Its values: the selected tank's thresholds (the rules' defaults where unset). */
  thresholdValues: Record<string, unknown> = {};
  /** A device write (add / edit) is in flight. */
  saving = false;

  // -- add-tank panel -------------------------------------------------------------

  addOpen = false;
  addResetKey = 0;
  readonly addTabs: SegmentOption[] = [{ id: "add", label: "Add tank", icon: "oil_barrel" }];

  @ViewChild("tankPanel") private tankPanel?: EntityDetailPanelComponent;
  /** The Settings tab's set-up cards (saved by the shared settings card's Apply). */
  @ViewChild("tankEditForm") private tankEditForm?: TankFormComponent;
  /** The last Apply also saved the set-up cards (their save shows the toast). */
  private setupIncludedInApply = false;
  @ViewChild("toasts", { static: true }) private toasts!: ToastsComponent;
  private alarmService: AlarmService;
  /** All active alarms of every tank, unscoped. */
  private allAlarms: AlarmListItem[] = [];
  private alarmsSubscription: any;
  private tanksSubscription: any;
  private tanksRefreshTimer?: any;
  private burnersSubscription: any;
  private burnersRefreshTimer?: any;

  /** The device profiles' icons (shared, one per widget) — set in ngOnInit. */
  private icons!: ProfileIcons;

  constructor(private cd: ChangeDetectorRef, private destroyRef: DestroyRef) {}

  // -- view getters -------------------------------------------------------------

  /** A tank's or a burner's icon: its profile's (its `type` names it) — the devices' default until it's known. */
  deviceIcon(type: string | null | undefined): string {
    return this.icons.of("device", type);
  }

  /** A tank's icon, for the Settings page's tables (one function, so the input never changes). */
  readonly tankIcon = (t: TankRow): string => this.deviceIcon(t.type);

  /** Rail foot: the alarms (badge = the active alarms in scope), then the light/dark toggle. */
  get railBottomItems(): NavRailItem[] {
    return dashboardRailItems(this.darkMode, this.panelAlarms.length, { themeToggle: isTenantAdmin(this.ctx) });
  }

  onRailBottomClick(id: string): void {
    if (id === "alarms") {
      this.alarmPanelOpen = true;
    } else if (id === FEEDBACK_RAIL_ID) {
      feedbackOf(this.ctx).show("Asphalt");
    } else if (id === "theme") {
      this.toggleTheme();
    }
  }

  get detailTabs(): SegmentOption[] {
    return [
      { id: "insights", label: "Insights", icon: "bar_chart", tooltip: "Insights" },
      alarmsTab(this.detailAlarms),
      { id: "settings", label: "Settings", icon: "settings", tooltip: "Settings" },
    ];
  }

  get burnerTabs(): SegmentOption[] {
    return [
      { id: "insights", label: "Insights", icon: "bar_chart", tooltip: "Insights" },
      alarmsTab(this.burnerAlarms),
      { id: "settings", label: "Settings", icon: "settings", tooltip: "Settings" },
    ];
  }

  /** The Burners row to highlight: the selected burner while its panel is showing. */
  get highlightedBurnerId(): string | null {
    return this.selectedBurner && this.burnerOpen ? this.selectedBurner.deviceId : null;
  }

  /** A state's value for its timeline's "current" (null before it's reported). */
  burnerCurrent(b: BurnerRow, key: string): string | null {
    const s = this.settings;
    const state = key === s.burnerLowTemperatureKey ? b.lowTemperature : b.powerPhases[s.burnerPowerPhaseKeys.indexOf(key)];
    return state && state.fault !== null ? state.label.toLowerCase() : null;
  }

  /** "Updated 5m ago" under each timeline. */
  burnerNote(b: BurnerRow): string {
    return b.lastUpdateTs ? `Updated ${relativeTime(b.lastUpdateTs)}` : "No readings yet";
  }

  /** The Tanks row to highlight: the selected tank while its panel is showing. */
  get highlightedTankId(): string | null {
    return this.selectedTank && this.detailOpen ? this.selectedTank.deviceId : null;
  }

  get tankSubtitle(): string {
    const t = this.selectedTank;
    return t?.product ?? "";
  }

  /** "1,240 / 5,000 L" — the product volume against the capacity, for the level card's foot. */
  levelVolumeText(t: TankRow): string {
    if (t.volume === null && t.capacity === null) {
      return "";
    }
    return `${fmtNumber(t.volume, 0)} / ${fmtNumber(t.capacity, 0)} ${t.capacityUnits}`.trim();
  }

  updatedAgo(t: TankRow): string {
    return relativeTime(t.lastUpdateTs);
  }

  /** "62% (1.24 m)" — the level with the sensor's reading. */
  levelText(t: TankRow): string {
    if (t.levelPercent === null) {
      return "—";
    }
    const reading = t.level === null ? "" : ` (${fmtNumber(t.level, 2)} ${t.sensorUnits})`;
    return `${fmtNumber(t.levelPercent, 0)}%${reading}`;
  }

  fmt(v: number | null, decimals = 0): string {
    return fmtNumber(v, decimals);
  }

  /** A tank's active alarms (the table's Alarms cell, as on the QC Lab dashboard). */
  alarmCount(row: { deviceId: string }): number {
    return this.alarmCounts.get(row.deviceId) ?? 0;
  }

  // -- lifecycle ----------------------------------------------------------------

  /** The loading page while the dashboard first loads (tb-dashboard-loading) — a later reload never brings it back. */
  private readonly firstLoad = new FirstLoad();
  get pageLoading(): boolean {
    return this.firstLoad.pending(this.tanksLoading, this.burnersLoading);
  }

  ngOnInit(): void {
    if (!this.host) {
      this.ctx.$scope.asphaltDashboardComponent = this;
    }
    this.theme = this.host?.theme ?? new DashboardTheme(this.ctx, this.destroyRef, () => this.cd.detectChanges());
    this.settings = { ...asphaltDashboardDefaultSettings, ...dashboardWidgetSettings<AsphaltDashboardSettings>(this.ctx, this.host) };
    injectCss("tb-ext-material-symbols-rounded", "https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200");
    this.alarmService = this.ctx.$injector.get(this.ctx.servicesMap.get("alarmService")) as AlarmService;
    // The profiles' icons coming in: the tables' rows (the Settings page's too) and the panels' headers show them.
    this.icons = profileIconsOf(this.ctx);
    this.icons.changes.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (this.tankSummary.length) {
        this.buildSummary(); // the Tank summary's count row (once the tanks are in)
      }
      this.cd.detectChanges();
    });
    this.buildPanelConfig();
    this.applyFilters(); // the filters' options before the tanks arrive
    this.loadUserPreferences();

    this.loadTanks();
    this.subscribeTanks(); // live refresh on attribute / telemetry changes
    this.loadBurners();
    this.subscribeBurners();
    this.subscribeAlarms();
    this.host?.attach(this);
  }

  ngOnDestroy(): void {
    this.host?.attach(null);
    removeSubscriptions(this.ctx, this.alarmsSubscription, this.tanksSubscription, this.burnersSubscription);
    clearTimeout(this.tanksRefreshTimer);
    clearTimeout(this.burnersRefreshTimer);
  }

  /** ThingsBoard hook — data comes from the custom subscriptions; just re-render. */
  onDataUpdated(): void {
    this.ctx.detectChanges();
  }

  onResize(): void {
    this.cd.detectChanges();
  }

  // -- header / sidebar ---------------------------------------------------------

  // -- nested in the Home dashboard: Tanks | Burners as the sidebar's button group (its Settings only on its own) --

  readonly viewOptions: SegmentOption[] = [
    { id: "tanks", label: "Tanks", icon: "oil_barrel", tooltip: "Tanks" },
    { id: "burners", label: "Burners", icon: "local_fire_department", tooltip: "Burners" },
  ];

  get railActive(): string {
    return this.page;
  }

  selectRailPage(id: string): void {
    this.selectPage(id);
    this.cd.detectChanges();
  }

  /**
   * A rail page: back to the view it last showed. An id that isn't one of its pages (Home's, an old link's) opens Tanks —
   * else the page has no view, and its sidebar nothing to show.
   */
  selectPage(id: string): void {
    this.page = id in this.pageView ? (id as DashboardPage) : "tanks";
    this.selectView(this.pageView[this.page]);
  }

  /** A view of the current page (one it doesn't have: Tanks). */
  selectView(id: string): void {
    this.view = id in this.pageView ? (id as DashboardView) : "tanks";
    this.pageView[this.page] = this.view;
  }

  toggleTheme(): void {
    this.theme.toggle();
  }

  onConditionsChange(ids: string[]): void {
    this.selectedConditions = ids as TankCondition[];
    this.applyFilters();
  }

  onProductsChange(ids: string[]): void {
    this.selectedProducts = ids;
    this.applyFilters();
  }

  // -- tanks table + detail panel -----------------------------------------------

  /** A Tanks row: open that tank's panel — or close it when it's the tank already open. */
  onTankRowClick(row: Record<string, any>): void {
    const tank = row as TankRow;
    if (this.detailOpen && this.selectedTank?.deviceId === tank.deviceId) {
      this.closeDetail();
      return;
    }
    this.openTank(tank, "insights");
  }

  /** The Settings page's Tanks table: that tank's panel, on its Settings tab. */
  onSettingsTank(tank: TankRow): void {
    this.openTank(tank, "settings");
  }

  /** Show a tank in the panel; `tab` null keeps the open panel's current tab. */
  private openTank(tank: TankRow, tab: string | null): void {
    this.closeBurner();
    this.selectedTank = tank;
    this.editValue = this.toFormValue(tank);
    this.editResetKey++;
    this.thresholdValues = this.toThresholdValues(tank);
    this.applyProduct(tank);
    if (tab) {
      this.detailOpenTab = tab; // used when the panel opens (or reopens)
      if (this.detailOpen) {
        this.tankPanel?.selectTab(tab); // already open — switch now
      }
    }
    this.detailOpen = true;
    this.applyAlarmScope();
  }

  /** A Burners row: open that burner's panel — or close it when it's the burner already open. */
  onBurnerRowClick(row: Record<string, any>): void {
    const burner = row as BurnerRow;
    if (this.burnerOpen && this.selectedBurner?.deviceId === burner.deviceId) {
      this.closeBurner();
      return;
    }
    this.closeDetail();
    this.selectedBurner = burner;
    this.burnerOpen = true;
    this.applyAlarmScope();
  }

  /** The burner's settings card saved (label, note): reload the burners. */
  onBurnerSaved(burner: BurnerRow): void {
    this.toasts.success(`${burner.name} saved`);
    this.loadBurners();
  }

  closeBurner(): void {
    this.burnerOpen = false;
    this.selectedBurner = null;
    this.burnerAlarms = [];
  }

  /** Close the tank panel (its row highlight follows — see {@link highlightedTankId}). */
  closeDetail(): void {
    this.detailOpen = false;
    this.selectedTank = null;
    this.editValue = null;
    this.detailAlarms = [];
  }

  /**
   * Close the tank panel on a click outside it — anywhere but the panel itself,
   * a clickable tank row (that switches the panel) or an overlay; see
   * {@link keepsSidePanelOpen}. Ignored while the add panel or a dialog is open.
   */
  @HostListener("document:pointerdown", ["$event"])
  onDocumentPointerDown(event: Event): void {
    if ((!this.detailOpen && !this.burnerOpen) || this.addOpen || keepsSidePanelOpen(event.target)) {
      return;
    }
    this.closeDetail();
    this.closeBurner();
    this.cd.detectChanges();
  }

  // -- add / edit -------------------------------------------------------------------

  openAdd(): void {
    this.closeDetail();
    this.addResetKey++;
    this.addOpen = true;
  }

  closeAdd(): void {
    this.addOpen = false;
  }

  /**
   * The add form's submit: a new device of the configured profile, then its
   * set-up as server attributes. If the attributes can't be written the device
   * is deleted again, so no half-made tank is left behind.
   */
  onAddSubmit(v: TankFormValue): void {
    if (this.tanks.some((t) => t.deviceName.toLowerCase() === v.name.toLowerCase())) {
      this.toasts.warn(`A tank with the serial number ${v.name} already exists.`);
      return;
    }
    const cfg = QUIET_REQUEST;
    const device = { name: v.name, label: v.label, type: this.settings.newTankDeviceType } as Device;
    this.saving = true;
    this.ctx.deviceService
      .saveDevice(device, cfg)
      .pipe(
        switchMap((saved) =>
          this.saveTankAttributes(saved.id.id, v.details).pipe(
            map(() => saved),
            // The attributes failed: undo the device, then surface the error.
            catchError((err) =>
              this.ctx.deviceService.deleteDevice(saved.id.id, cfg).pipe(
                catchError(() => of(null)),
                switchMap(() => throwError(() => err))
              )
            )
          )
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: () => {
          this.saving = false;
          this.toasts.success(`Tank ${v.label} added`);
          this.closeAdd();
          this.scheduleTanksRefresh();
          this.cd.detectChanges();
        },
        error: (err) => {
          this.saving = false;
          const msg = apiMessage(err);
          this.toasts.error(/already exists/i.test(msg) ? `A device named ${v.name} already exists.` : `Couldn't add the tank${msg}`);
          this.cd.detectChanges();
        },
      });
  }

  /** The Settings tab's submit: the device's label, then its attributes. */
  /**
   * The Settings tab's floating Apply: the shared settings card saves its own
   * cards (label, note, alarm thresholds) and asks for the set-up cards here.
   */
  onSettingsApply(): void {
    if (this.setupDirty) {
      this.setupIncludedInApply = true;
      this.tankEditForm?.submit();
    }
  }

  /** The Settings tab's Cancel: the set-up cards back to the tank's values. */
  onSettingsCancel(): void {
    this.editResetKey++;
  }

  /** The shared settings card saved (label, note, thresholds): reload the tanks. */
  onSettingsSaved(tank: TankRow): void {
    if (!this.setupIncludedInApply) {
      this.toasts.success(`${tank.name} saved`);
    }
    this.setupIncludedInApply = false;
    this.loadTanks();
  }

  /** The set-up cards' save: the tank's set-up attributes (the settings card saves its label). */
  onEditSubmit(tank: TankRow, v: TankFormValue): void {
    this.saving = true;
    this.saveTankAttributes(tank.deviceId, v.details)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving = false;
          this.setupIncludedInApply = false;
          // Back to pristine on the values just saved (the reload brings the same).
          this.editValue = { ...(this.editValue ?? this.toFormValue(tank)), details: v.details };
          this.editResetKey++;
          this.toasts.success(`${tank.name} saved`);
          this.scheduleTanksRefresh();
          this.cd.detectChanges();
        },
        error: (err) => {
          this.saving = false;
          this.setupIncludedInApply = false;
          this.toasts.error(`Couldn't save ${tank.name}'s set-up${apiMessage(err)}`);
          this.cd.detectChanges();
        },
      });
  }

  /** The tank's set-up as its server attributes (null values are left out). */
  private saveTankAttributes(deviceId: string, details: TankDetails): Observable<unknown> {
    const attributes = TANK_DETAIL_KEYS.filter((k) => details[k] !== null && details[k] !== undefined && details[k] !== "").map((k) => ({
      key: k,
      value: details[k],
    }));
    return this.ctx.attributeService.saveEntityAttributes({ entityType: EntityType.DEVICE, id: deviceId }, AttributeScope.SERVER_SCOPE, attributes, {
      ignoreLoading: true,
      ignoreErrors: true,
    });
  }

  // -- alarms -------------------------------------------------------------------

  clearAlarm(alarm: AlarmListItem): void {
    const refresh = () => {
      this.applyAlarmConditions();
      this.applyFilters();
      this.refreshSelectedTank();
    };
    clearDashboardAlarm(this.alarmService, this.destroyRef, alarm, {
      // The list items are copies of the subscription's alarms: mark the source too.
      also: [this.allAlarms.find((a) => a.id === alarm.id)],
      onError: () => {
        refresh();
        this.cd.detectChanges();
      },
    });
    refresh();
  }

  // -- data: tanks ----------------------------------------------------------------

  /** Load every tank (entity query) and rebuild all derived views. */
  loadTanks(): void {
    const s = this.settings;
    const server = (key: string) => ({ type: EntityKeyType.SERVER_ATTRIBUTE, key });
    const series = (key: string) => ({ type: EntityKeyType.TIME_SERIES, key });
    const query: EntityDataQuery = {
      entityFilter: this.tankFilter,
      pageLink: byNamePageLink(),
      entityFields: [
        { type: EntityKeyType.ENTITY_FIELD, key: "name" },
        { type: EntityKeyType.ENTITY_FIELD, key: "label" },
        { type: EntityKeyType.ENTITY_FIELD, key: "type" },
        { type: EntityKeyType.ENTITY_FIELD, key: "additionalInfo" },
        ...OWNER_ENTITY_FIELDS,
      ],
      latestValues: [
        // ThingsBoard's device-state `active` flag → Online / Offline.
        server("active"),
        server(s.liquidTypeKey),
        server(s.capacityKey),
        server(s.capacityUnitsKey),
        server(s.sensorUnitsKey),
        server(s.minLevelThresholdKey),
        server(s.maxLevelThresholdKey),
        server(s.maxTemperatureThresholdKey),
        // The rest of the tank form.
        server("tankMeasurementSystem"),
        server("tankDimensionUnits"),
        server("sizeMeasure"),
        server("levelMeasurement"),
        server("sensorGap"),
        server("sensorMeasurementSystem"),
        series(s.levelPercentKey),
        series(s.levelKey),
        series(s.temperatureKey),
        series(s.tonnageKey),
        series(s.batteryKey),
      ],
    };
    this.ctx.entityService
      .findEntityDataByQuery(query, QUIET_REQUEST)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this.tanks = page.data.map((d) => this.toTankRow(d)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
          this.tanksLoading = false;
          this.applyAlarmConditions();
          this.applyFilters();
          this.refreshSelectedTank();
          this.cd.detectChanges();
        },
        error: () => {
          this.tanksLoading = false;
          this.cd.detectChanges();
        },
      });
  }

  private toTankRow(d: any): TankRow {
    const s = this.settings;
    const fields = d.latest?.[EntityKeyType.ENTITY_FIELD] ?? {};
    const server = d.latest?.[EntityKeyType.SERVER_ATTRIBUTE] ?? {};
    const ts = d.latest?.[EntityKeyType.TIME_SERIES] ?? {};
    const attr = (key: string) => server[key]?.value;
    const num = (key: string) => parseNumber(ts[key]?.value);
    const deviceName = fields["name"]?.value ?? "";
    const deviceLabel = fields["label"]?.value ?? "";
    // `active` is absent when device-state tracking is off — treat as online.
    const status: TankStatus = String(attr("active") ?? "") === "false" ? "offline" : "online";
    const capacity = parseNumber(attr(s.capacityKey));
    const levelPercent = num(s.levelPercentKey);
    const sizeMeasure = parseObject(attr("sizeMeasure"));
    const details: TankDetails = {
      ...emptyTankDetails,
      liquidType: String(attr(s.liquidTypeKey) ?? ""),
      tankShape: TANK_SHAPE, // every tank is a vertical cylinder
      tankMeasurementSystem: attr("tankMeasurementSystem") === "Imperial" ? "Imperial" : "Metric",
      tankDimensionUnits: String(attr("tankDimensionUnits") ?? emptyTankDetails.tankDimensionUnits),
      sizeMeasure: {
        height: parseNumber(sizeMeasure["height"]),
        diameter: parseNumber(sizeMeasure["diameter"]),
      },
      tankCapacityOutput: String(attr(s.capacityUnitsKey) ?? emptyTankDetails.tankCapacityOutput),
      tankCapacity: capacity,
      levelMeasurement: (attr("levelMeasurement") ?? "") as TankDetails["levelMeasurement"],
      sensorGap: parseNumber(attr("sensorGap")),
      sensorMeasurementSystem: attr("sensorMeasurementSystem") === "Imperial" ? "Imperial" : "Metric",
      sensorDimensionUnits: String(attr(s.sensorUnitsKey) ?? emptyTankDetails.sensorDimensionUnits),
    };
    const lastUpdateTs = [s.levelPercentKey, s.levelKey, s.temperatureKey, s.tonnageKey].map((k) => Number(ts[k]?.ts) || 0).reduce((a, b) => Math.max(a, b), 0) || null;
    const base = {
      deviceId: d.entityId.id,
      name: deviceLabel || deviceName || "Unknown tank",
      deviceName,
      deviceLabel,
      description: parseDescription(fields["additionalInfo"]?.value),
      type: fields["type"]?.value ?? "",
      owner: ownerCustomer(fields),
      product: details.liquidType,
      capacity,
      capacityUnits: details.tankCapacityOutput,
      sensorUnits: details.sensorDimensionUnits,
      levelPercent,
      level: num(s.levelKey),
      volume: capacity !== null && levelPercent !== null ? (capacity * levelPercent) / 100 : null,
      temperature: num(s.temperatureKey),
      tonnage: num(s.tonnageKey),
      battery: num(s.batteryKey),
      minLevelThreshold: parseNumber(attr(s.minLevelThresholdKey)),
      maxLevelThreshold: parseNumber(attr(s.maxLevelThresholdKey)),
      maxTemperatureThreshold: parseNumber(attr(s.maxTemperatureThresholdKey)),
      status,
      // The alarm conditions come from the tank's active alarms (applyAlarmConditions).
      highLevel: false,
      lowBattery: false,
      lowTemperature: false,
      highTemperature: false,
      lastUpdateTs,
      lastUpdate: formatWhen(lastUpdateTs),
      details,
    };
    const conditions = tankConditions(base);
    return { ...base, conditions, inAlarm: false };
  }

  private get tankFilter(): EntityFilter {
    return { type: AliasFilterType.deviceType, deviceTypes: this.settings.tankDeviceTypes, deviceNameFilter: "" };
  }

  /**
   * Live subscription over the tanks' attributes and telemetry; any change
   * reloads the tanks (debounced). The initial emission is skipped — ngOnInit's
   * loadTanks covers the first render.
   */
  private subscribeTanks(): void {
    const s = this.settings;
    subscribeLatestChanges(
      this.ctx,
      this.destroyRef,
      {
        entityFilter: this.tankFilter,
        attributes: ["active", s.liquidTypeKey, s.capacityKey, s.maxLevelThresholdKey, s.maxTemperatureThresholdKey],
        timeseries: [s.levelPercentKey, s.levelKey, s.temperatureKey, s.tonnageKey, s.batteryKey],
      },
      () => this.scheduleTanksRefresh(),
      (subscription) => (this.tanksSubscription = subscription)
    );
  }

  // -- data: burners -----------------------------------------------------------------

  /** Load every burner (entity query): its identity and its state time series. */
  loadBurners(): void {
    const s = this.settings;
    const query: EntityDataQuery = {
      entityFilter: this.burnerFilter,
      pageLink: byNamePageLink(),
      entityFields: [
        { type: EntityKeyType.ENTITY_FIELD, key: "name" },
        { type: EntityKeyType.ENTITY_FIELD, key: "label" },
        { type: EntityKeyType.ENTITY_FIELD, key: "type" },
        { type: EntityKeyType.ENTITY_FIELD, key: "additionalInfo" },
        ...OWNER_ENTITY_FIELDS,
      ],
      latestValues: [{ type: EntityKeyType.SERVER_ATTRIBUTE, key: "active" }, ...[s.burnerLowTemperatureKey, ...s.burnerPowerPhaseKeys].map((key) => ({ type: EntityKeyType.TIME_SERIES, key }))],
    };
    this.ctx.entityService
      .findEntityDataByQuery(query, QUIET_REQUEST)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this.burners = page.data.map((d) => this.toBurnerRow(d)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
          this.burnersLoading = false;
          // The open panel follows the reloaded burner (and closes if it's gone).
          if (this.selectedBurner) {
            this.selectedBurner = this.burners.find((b) => b.deviceId === this.selectedBurner!.deviceId) ?? null;
            this.burnerOpen = this.burnerOpen && !!this.selectedBurner;
          }
          this.applyAlarmScope();
          this.cd.detectChanges();
        },
        error: () => {
          this.burnersLoading = false;
          this.cd.detectChanges();
        },
      });
  }

  private toBurnerRow(d: any): BurnerRow {
    const s = this.settings;
    const fields = d.latest?.[EntityKeyType.ENTITY_FIELD] ?? {};
    const server = d.latest?.[EntityKeyType.SERVER_ATTRIBUTE] ?? {};
    const ts = d.latest?.[EntityKeyType.TIME_SERIES] ?? {};
    const deviceName = fields["name"]?.value ?? "";
    const deviceLabel = fields["label"]?.value ?? "";
    const keys = [s.burnerLowTemperatureKey, ...s.burnerPowerPhaseKeys];
    const lastUpdateTs = keys.map((k) => Number(ts[k]?.ts) || 0).reduce((a, b) => Math.max(a, b), 0) || null;
    return {
      deviceId: d.entityId.id,
      name: deviceLabel || deviceName || "Unknown burner",
      deviceName,
      deviceLabel,
      description: parseDescription(fields["additionalInfo"]?.value),
      type: fields["type"]?.value ?? "",
      owner: ownerCustomer(fields),
      // `active` is absent when device-state tracking is off — treat as online.
      status: String(server["active"]?.value ?? "") === "false" ? "offline" : "online",
      // A low temperature is the fault; a power phase is a fault while it's off.
      lowTemperature: burnerState(ts[s.burnerLowTemperatureKey]?.value, true),
      powerPhases: s.burnerPowerPhaseKeys.map((k) => burnerState(ts[k]?.value, false)),
      lastUpdateTs,
    };
  }

  private get burnerFilter(): EntityFilter {
    return { type: AliasFilterType.deviceType, deviceTypes: this.settings.burnerDeviceTypes, deviceNameFilter: "" };
  }

  /** Live subscription over the burners' states; a change reloads them (debounced). The first emission is skipped. */
  private subscribeBurners(): void {
    const s = this.settings;
    subscribeLatestChanges(
      this.ctx,
      this.destroyRef,
      { entityFilter: this.burnerFilter, attributes: ["active"], timeseries: [s.burnerLowTemperatureKey, ...s.burnerPowerPhaseKeys] },
      () => {
        clearTimeout(this.burnersRefreshTimer);
        this.burnersRefreshTimer = setTimeout(() => this.loadBurners(), 300);
      },
      (subscription) => (this.burnersSubscription = subscription)
    );
  }

  private scheduleTanksRefresh(): void {
    clearTimeout(this.tanksRefreshTimer);
    this.tanksRefreshTimer = setTimeout(() => this.loadTanks(), 300);
  }

  /** Keep the open panel on the reloaded tank (and its form on the reloaded values). */
  private refreshSelectedTank(): void {
    if (!this.selectedTank) {
      return;
    }
    const fresh = this.tankById(this.selectedTank.deviceId);
    if (fresh) {
      this.selectedTank = fresh;
      // Neither form is reset while it has edits (each holds a new value until then).
      this.editValue = this.toFormValue(fresh);
      this.thresholdValues = this.toThresholdValues(fresh);
      this.applyProduct(fresh);
    } else {
      this.closeDetail();
    }
  }

  private tankById(id: string): TankRow | null {
    return this.tanks.find((t) => t.deviceId === id) ?? null;
  }

  private toFormValue(t: TankRow): TankFormValue {
    return { name: t.deviceName, label: t.deviceLabel || t.name, details: { ...t.details, sizeMeasure: { ...t.details.sizeMeasure } } };
  }

  // -- filters, summary -------------------------------------------------------------

  /** The Status / Products filters over the tanks; then the options' counts, the summary cards and the alarms. */
  private applyFilters(): void {
    const conditions = new Set(this.selectedConditions);
    const products = new Set(this.selectedProducts);
    const byCondition = (t: TankRow) => !conditions.size || t.conditions.some((c) => conditions.has(c));
    const byProduct = (t: TankRow) => !products.size || products.has(t.product || "");
    this.visibleTanks = this.tanks.filter((t) => byCondition(t) && byProduct(t));

    // Each filter's counts are taken over the other filter's result, so a count says what checking it would add.
    const forConditions = this.tanks.filter(byProduct);
    this.conditionOptions = TANK_CONDITIONS.map((c) => ({
      id: c.id,
      label: c.label,
      count: forConditions.filter((t) => t.conditions.includes(c.id)).length,
    }));
    const forProducts = this.tanks.filter(byCondition);
    const names = [...new Set(this.tanks.map((t) => t.product || ""))].sort((a, b) => a.localeCompare(b));
    this.productOptions = names.map((p) => ({ id: p, label: p || "No product", count: forProducts.filter((t) => (t.product || "") === p).length }));

    this.buildSummary();
    this.applyAlarmScope();
  }

  private buildSummary(): void {
    const tanks = this.visibleTanks;
    const n = tanks.length;
    const pct = (k: number) => (n ? ` (${Math.round((k / n) * 100)}%)` : "");
    const online = tanks.filter((t) => t.status === "online").length;
    const inAlarm = tanks.filter((t) => t.inAlarm).length;
    const withLevel = tanks.filter((t) => t.levelPercent !== null);
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
    const lowest = withLevel.reduce<TankRow | null>((m, t) => (!m || t.levelPercent! < m.levelPercent! ? t : m), null);
    const highest = withLevel.reduce<TankRow | null>((m, t) => (!m || t.levelPercent! > m.levelPercent! ? t : m), null);
    const tonnage = tanks.filter((t) => t.tonnage !== null).map((t) => t.tonnage!);
    this.tankSummary = [
      {
        id: "fleet",
        title: "Tank summary",
        rows: [
          // The tanks by their profile's icon (the first tank profile's).
          { label: "Tanks", icon: this.deviceIcon(this.settings.tankDeviceTypes[0]), value: String(n) },
          { label: "Online", mark: "success", value: `${online}${pct(online)}` },
          { label: "Offline", mark: "neutral", value: `${n - online}${pct(n - online)}` },
          { label: "In alarm", mark: inAlarm ? "error" : "success", value: `${inAlarm}${pct(inAlarm)}` },
        ],
      },
      {
        id: "levels",
        title: "Levels",
        rows: [
          { label: "Average level", icon: "water_drop", value: fmtNumber(avg(withLevel.map((t) => t.levelPercent!)), 0), unit: "%" },
          { label: lowest ? `Lowest · ${lowest.name}` : "Lowest", icon: "arrow_downward", value: fmtNumber(lowest?.levelPercent ?? null, 0), unit: lowest ? "%" : "" },
          { label: highest ? `Highest · ${highest.name}` : "Highest", icon: "arrow_upward", value: fmtNumber(highest?.levelPercent ?? null, 0), unit: highest ? "%" : "" },
          { label: "Product on hand", icon: "weight", value: fmtNumber(tonnage.length ? tonnage.reduce((a, b) => a + b, 0) : null, 1), unit: tonnage.length ? "t" : "" },
        ],
      },
      {
        id: "products",
        title: "By product",
        rows: this.productBreakdown(tanks),
      },
    ];
  }

  /**
   * The "By product" card (as the fuel Reports page's "By fuel type"): each
   * product's tonnage on hand and its share, largest first, swatched in the
   * chart palette's fixed order. Tonnage is comparable across tanks whatever
   * their volume units. The palette has five colours, so a sixth product on
   * folds into "Other".
   */
  private productBreakdown(tanks: TankRow[]): SummaryRow[] {
    const byProduct = new Map<string, number>();
    for (const t of tanks) {
      const name = t.product || "No product";
      byProduct.set(name, (byProduct.get(name) ?? 0) + (t.tonnage ?? 0));
    }
    let entries = [...byProduct.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (entries.length > PRODUCT_SWATCHES.length) {
      const kept = entries.slice(0, PRODUCT_SWATCHES.length - 1);
      const other = entries.slice(PRODUCT_SWATCHES.length - 1).reduce((n, [, t]) => n + t, 0);
      entries = [...kept, ["Other", other]];
    }
    if (!entries.length) {
      return [{ label: "No tanks", value: "—" }];
    }
    const total = entries.reduce((n, [, t]) => n + t, 0);
    return entries.map(([name, t], i) => ({
      label: name,
      swatch: PRODUCT_SWATCHES[i],
      value: fmtNumber(t, 1),
      unit: total ? `t · ${Math.round((t / total) * 100)}%` : "t",
    }));
  }

  private buildPanelConfig(): void {
    const s = this.settings;
    this.burnerColumns = [
      { key: "name", header: "Burner", iconOf: (r) => this.deviceIcon(r["type"]) },
      { key: "lowTemperature", header: "Low temperature" },
      // One cell template per phase in the table (phase0 … phase2): the burners report three.
      ...s.burnerPowerPhaseKeys.slice(0, 3).map((_, i) => ({ key: `phase${i}`, header: `Power phase ${i + 1}` })),
      { key: "alarms", header: "Alarms" },
    ];
    // The burner panel's state timelines: one per state, drawn green while OK and red on a fault (as the table's pills).
    const ok = "var(--c-bg-success-normal)";
    const fault = "var(--c-bg-error-normal)";
    this.burnerTimelines = [
      {
        key: s.burnerLowTemperatureKey,
        title: "Low Temperature",
        states: [
          { id: "false", label: "False", color: ok },
          { id: "true", label: "True", color: fault },
        ],
      },
      ...s.burnerPowerPhaseKeys.map((key, i) => ({
        key,
        title: `Power Phase ${i + 1}`,
        states: [
          { id: "true", label: "True", color: ok },
          { id: "false", label: "False", color: fault },
        ],
      })),
    ];
    this.metricsCharts = [
      { chartTitle: "Level", unit: "%", yMin: 0, yMax: 100, keys: [{ name: s.levelPercentKey, label: "Level", color: "var(--c-chart-1)" }] },
      { chartTitle: "Temperature", unit: "°C", keys: [{ name: s.temperatureKey, label: "Temperature", color: "var(--c-chart-2)" }] },
      { chartTitle: "Tonnage", unit: "t", keys: [{ name: s.tonnageKey, label: "Tonnage", color: "var(--c-chart-3)" }] },
    ];
    // The tank's own alarm thresholds: flat SERVER attributes (no JSON object — `targets: []`)
    // that the profile's "High Level" / "High Temperature" alarm rules compare against.
    this.thresholdCards = [
      {
        title: "Alarm thresholds",
        flatFields: true,
        groups: [
          {
            objects: [
              {
                key: "tankAlarmThresholds",
                label: "",
                scope: "server",
                targets: [],
                fields: [
                  {
                    kind: "slider",
                    key: "maxLevel",
                    flatKey: s.maxLevelThresholdKey,
                    label: "High level",
                    min: 0,
                    max: 100,
                    step: 1,
                    unit: "%",
                    info: "Raises a High level alarm when the tank fills past this share of its capacity.",
                  },
                  {
                    kind: "slider",
                    key: "maxTemperature",
                    flatKey: s.maxTemperatureThresholdKey,
                    label: "High temperature",
                    min: 0,
                    max: 250,
                    step: 1,
                    unit: "°C",
                    info: "Raises a High temperature alarm when the product reaches this temperature.",
                  },
                ],
              },
            ],
          },
        ],
      },
    ];
  }

  /**
   * The Product card: the products to pick from (plus the tank's own when it
   * isn't one of them, so it still shows) and the tank's current one. Saved by
   * the shared settings card as the tank's server attribute.
   */
  private applyProduct(t: TankRow): void {
    const key = this.settings.liquidTypeKey;
    const products = t.product && !LIQUID_TYPES.includes(t.product) ? [t.product, ...LIQUID_TYPES] : LIQUID_TYPES;
    if (this.productSelects[0]?.options.length !== products.length || this.productSelects[0]?.key !== key) {
      this.productSelects = [{ key, label: "Liquid type", options: products.map((p) => ({ value: p, label: p })) }];
    }
    if (this.productValues[key] !== t.product) {
      this.productValues = { [key]: t.product };
    }
  }

  /** The threshold card's values: the tank's attributes, the rules' defaults where unset. */
  private toThresholdValues(t: TankRow): Record<string, unknown> {
    const s = this.settings;
    return {
      [s.maxLevelThresholdKey]: t.maxLevelThreshold ?? s.defaultMaxLevelThreshold,
      [s.maxTemperatureThresholdKey]: t.maxTemperatureThreshold ?? s.defaultMaxTemperatureThreshold,
    };
  }

  // -- data: alarms ---------------------------------------------------------------------

  /**
   * Live alarm subscription over the tanks (active alarms only). A REALTIME
   * window keeps it streaming; the wide interval surfaces alarms of any age.
   */
  private subscribeAlarms(): void {
    this.alarmsLoading = true;
    subscribeActiveAlarms(this.ctx, this.destroyRef, {
      // The tanks' and the burners' alarms.
      entityFilter: {
        type: AliasFilterType.deviceType,
        deviceTypes: [...this.settings.tankDeviceTypes, ...this.settings.burnerDeviceTypes],
        deviceNameFilter: "",
      },
      onSubscribed: (subscription) => (this.alarmsSubscription = subscription),
      onUpdated: (alarms) => this.onAlarmsUpdated(alarms),
    });
  }

  private onAlarmsUpdated(alarms: DashboardAlarm[]): void {
    this.allAlarms = alarms;
    this.alarmsLoading = false;
    this.applyAlarmConditions();
    this.applyFilters(); // the conditions changed: filters, summary and alarm scope
    this.refreshSelectedTank();
    this.cd.detectChanges();
  }

  /**
   * Each tank's alarm conditions (high level, low battery, low / high
   * temperature) from the types of its ACTIVE alarms — the same alarms the
   * table's Alarms column counts. See {@link withAlarmConditions}.
   */
  private applyAlarmConditions(): void {
    const types = new Map<string, Set<string>>();
    for (const a of this.allAlarms) {
      if (!a.cleared) {
        const set = types.get(a.originatorId) ?? new Set<string>();
        set.add(a.type);
        types.set(a.originatorId, set);
      }
    }
    this.tanks = this.tanks.map((t) => withAlarmConditions(t, types.get(t.deviceId) ?? new Set<string>(), this.settings));
  }

  /** Alarms of the visible tanks and the burners (named by display name over their customer), and of the selected tank / burner. */
  private applyAlarmScope(): void {
    const names = new Map([...this.visibleTanks, ...this.burners].map((d) => [d.deviceId, { name: d.name, owner: d.owner }]));
    const named = (a: AlarmListItem) => {
      const d = names.get(a.originatorId);
      return { ...a, originatorName: d?.name ?? a.originatorName };
    };
    this.panelAlarms = this.allAlarms.filter((a) => names.has(a.originatorId)).map(named);
    const id = this.selectedTank?.deviceId;
    this.detailAlarms = id ? this.allAlarms.filter((a) => a.originatorId === id) : [];
    const burnerId = this.selectedBurner?.deviceId;
    this.burnerAlarms = burnerId ? this.allAlarms.filter((a) => a.originatorId === burnerId) : [];
    this.alarmCounts = countAlarmsByOriginator(this.allAlarms);
  }

  // -- misc ------------------------------------------------------------------------------

  private loadUserPreferences(): void {
    readUserSettings(this.ctx, this.destroyRef, (settings) => {
      this.theme.restore(settings);
      this.cd.detectChanges();
    });
  }

}
