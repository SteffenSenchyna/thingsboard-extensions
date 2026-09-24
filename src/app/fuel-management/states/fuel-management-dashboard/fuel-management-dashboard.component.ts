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
import { Observable, forkJoin, of } from "rxjs";
import { catchError, map, switchMap } from "rxjs/operators";
import { WidgetSubscriptionOptions } from "@core/public-api";
import type { AlarmService } from "@core/http/alarm.service";
import {
  AlarmSearchStatus,
  AliasFilterType,
  AttributeScope,
  DataKeyType,
  Datasource,
  DatasourceType,
  Direction,
  EntityDataQuery,
  EntityFilter,
  EntityKeyType,
  EntitySearchDirection,
  EntityType,
  RealtimeWindowType,
  SharedModule,
  TimewindowType,
  widgetType,
} from "@shared/public-api";
import { WidgetContext } from "@home/models/widget-component.models";
import { injectCss } from "../../../components/shared/cdn-loader";
import { AlarmListComponent, AlarmListItem } from "../../../components/shared/alarm-list/alarm-list.component";
import { CopyBoxComponent } from "../../../components/shared/copy-box/copy-box.component";
import {
  DataTableAction,
  DataTableCellDirective,
  DataTableColumn,
  DataTableComponent,
} from "../../../components/shared/data-table/data-table.component";
import {
  AttributeSelect,
  DeviceSettingControl,
  DeviceSettingsCardComponent,
} from "../../../components/shared/device-settings-card/device-settings-card.component";
import { EntityDetailPanelComponent } from "../../../components/shared/entity-detail-panel/entity-detail-panel.component";
import { FilterChipOption, FilterChipsComponent } from "../../../components/shared/filter-chips/filter-chips.component";
import { FilterListComponent, FilterListOption } from "../../../components/shared/filter-list/filter-list.component";
import { HeaderIconButtonComponent } from "../../../components/shared/header-icon-button/header-icon-button.component";
import { MetricChartCardComponent, MetricChartSection } from "../../../components/shared/metric-chart-card/metric-chart-card.component";
import { SegmentOption, SegmentedControlComponent } from "../../../components/shared/segmented-control/segmented-control.component";
import { SidebarLayoutComponent } from "../../../components/shared/sidebar-layout/sidebar-layout.component";
import { SplitToggleComponent } from "../../../components/shared/split-toggle/split-toggle.component";
import { StatusPillComponent } from "../../../components/shared/status-pill/status-pill.component";
import { ThemeToggleComponent } from "../../../components/shared/theme-toggle/theme-toggle.component";
import { TimeframeSelectorComponent } from "../../../components/shared/timeframe-selector/timeframe-selector.component";
import { AssignCodeFormComponent } from "../../components/assign-code-form/assign-code-form.component";
import { PumpAccessCodesComponent } from "../../components/pump-access-codes/pump-access-codes.component";
import {
  ACTIVITY_FILTERS,
  ACTIVITY_TIMEFRAMES,
  AccessCode,
  AccessCodeRow,
  ActivityRow,
  AssignCodeRequest,
  CODE_KINDS,
  CodeKind,
  EVENT_META,
  FuelDashboardSettings,
  MarketNode,
  PUMP_STATUS_META,
  PumpEvent,
  PumpLocation,
  PumpRow,
  PumpStatus,
  codeKindLabel,
  formatWhen,
  fuelDashboardDefaultSettings,
  parseAccessCodes,
  parseBool,
  parsePumpEvent,
  shortPumpName,
  toAccessCodeRow,
} from "../../models/fuel-management.models";

type DashboardView = "pumps" | "codes" | "activity";

/**
 * Fuel management dashboard: fuel pumps (devices of the configured profiles)
 * and the keypad access codes assigned to them.
 *
 * - Left sidebar: Pumps / Access codes / Activity view switcher and a location
 *   filter — a Market → Site tree of the fuel-management markets and sites
 *   (`fuelManagement` = true) — that scopes every view, the alarms and the
 *   counts. A pump belongs to the Site that "Contains" it, and the site to the
 *   Market that "Contains" it.
 * - Pumps: status, codes and last dispense per pump; a row opens the pump panel
 *   (Insights / Access codes / Alarms / Settings).
 * - Access codes: one market at a time (single choice in the sidebar) and its
 *   Users | Vehicles code list — both lists are saved on the market asset, and
 *   every pump in the market holds them (hence the per-pump Codes count).
 * - Activity: the pumps' event time series (dispenses, denials, code changes,
 *   status), filterable by group and time window, exportable as CSV.
 *
 * Codes live on each market as two SERVER JSON attributes (users, vehicles);
 * assigning/revoking also writes an activity event on the market. Where each
 * value lives is set by {@link FuelDashboardSettings} (widget settings override).
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
    CopyBoxComponent,
    DataTableCellDirective,
    DataTableComponent,
    DeviceSettingsCardComponent,
    EntityDetailPanelComponent,
    FilterChipsComponent,
    FilterListComponent,
    HeaderIconButtonComponent,
    MetricChartCardComponent,
    PumpAccessCodesComponent,
    SegmentedControlComponent,
    SidebarLayoutComponent,
    SplitToggleComponent,
    StatusPillComponent,
    ThemeToggleComponent,
    TimeframeSelectorComponent,
  ],
})
export class FuelManagementDashboardComponent implements OnInit, OnDestroy {
  @Input() ctx: WidgetContext;

  settings: FuelDashboardSettings = fuelDashboardDefaultSettings;
  /** Light/dark theme (persisted per user, shared with the other dashboards). */
  darkMode = false;

  // -- layout -----------------------------------------------------------------

  readonly views: SegmentOption[] = [
    { id: "pumps", label: "Pumps", icon: "local_gas_station", tooltip: "Pumps" },
    { id: "codes", label: "Access codes", icon: "key", tooltip: "Access codes" },
    { id: "activity", label: "Activity", icon: "history", tooltip: "Activity" },
  ];
  view: DashboardView = "pumps";
  sidebarOpen = true;

  // -- pumps + location filter ------------------------------------------------

  /** Every pump, unfiltered. */
  pumps: PumpRow[] = [];
  pumpsLoading = false;
  /** Pumps under the selected sites / markets (all when none selected). */
  visiblePumps: PumpRow[] = [];
  /** Market → Site tree for the location filter. */
  locationOptions: FilterListOption[] = [];
  /** Selected site ids (plus market ids for markets without sites). */
  selectedLocations: string[] = [];
  readonly pumpColumns: DataTableColumn[] = [
    { key: "name", header: "Pump" },
    { key: "site", header: "Site" },
    { key: "fuelType", header: "Fuel" },
    { key: "codeCount", header: "Codes" },
    { key: "status", header: "Status" },
    { key: "lastDispense", header: "Last dispense" },
  ];

  // -- access codes -----------------------------------------------------------

  readonly codeKinds = CODE_KINDS;
  /** Which market list is shown (Access codes view + pump Codes tab). */
  codeKind: CodeKind = "users";
  /** Market whose codes the Access codes view shows (single choice in the sidebar). */
  codesMarketId: string | null = null;
  /** {@link codesMarketId} as the filter list's selection (stable array). */
  codesMarketSelection: string[] = [];
  /** Markets for the Access codes view's single-choice list (count = codes in the list shown). */
  marketOptions: FilterListOption[] = [];
  codeRows: AccessCodeRow[] = [];
  codeColumns: DataTableColumn[] = [];
  /** The markets (and their code lists) are still loading. */
  marketsLoading = true;
  /** Codes already in the assign panel's market — generated codes never collide with these. */
  takenCodes: string[] = [];
  readonly codeActions: DataTableAction[] = [{ id: "add", icon: "add", tooltip: "New access code" }];

  // -- activity ---------------------------------------------------------------

  readonly activityTimeframes = ACTIVITY_TIMEFRAMES;
  activityTimeframe = "7D";
  activityFilter = "all";
  activityChips: FilterChipOption[] = [];
  /** Events in view (location filter + chip filter). */
  activityRows: ActivityRow[] = [];
  activityLoading = false;
  readonly activityColumns: DataTableColumn[] = [
    { key: "time", header: "Time" },
    { key: "event", header: "Event" },
    { key: "pump", header: "Pump" },
    { key: "holder", header: "Holder" },
    { key: "code", header: "Code" },
    { key: "volume", header: "Volume", align: "right" },
  ];
  readonly activityActions: DataTableAction[] = [{ id: "export", icon: "download", tooltip: "Export CSV" }];

  // -- alarms -----------------------------------------------------------------

  alarmsLoading = false;
  alarmPanelOpen = false;
  /** Active alarms of the visible pumps (header badge + alarms panel). */
  panelAlarms: AlarmListItem[] = [];
  /** Active alarms of the selected pump (detail panel Alarms tab). */
  detailAlarms: AlarmListItem[] = [];
  readonly alarmPanelTabs: SegmentOption[] = [{ id: "alarms", label: "Alarms", icon: "notifications" }];

  // -- pump detail panel ------------------------------------------------------

  selectedPump: PumpRow | null = null;
  detailOpen = false;
  /** Tab the pump panel opens on — Insights, or Access codes from the Codes cell. */
  detailOpenTab = "insights";
  detailTab = "insights";
  /** A pump write (require-code / revoke / assign) is in flight. */
  saving = false;
  insightsTimeframe = "1D";
  metricsCharts: MetricChartSection[] = [];
  fuelTypeSelects: AttributeSelect[] = [];
  lockControls: DeviceSettingControl[] = [];
  /** Stable value maps for the Settings tab (rebuilt only when the pump refreshes). */
  fuelTypeValues: Record<string, string> = {};
  lockValues: Record<string, string | number | boolean> = {};

  // -- assign-code panel ------------------------------------------------------

  assignOpen = false;
  /** Market the assign panel adds to, the list it starts on, and whether that market is at the cap. */
  assignMarketId: string | null = null;
  assignKind: CodeKind = "users";
  assignFull = false;
  /** Bumped on every open so the form resets. */
  assignResetKey = 0;
  readonly assignTabs: SegmentOption[] = [{ id: "assign", label: "Assign code", icon: "key" }];
  /** Re-open the pump panel when the assign panel closes (it was opened from there). */
  private assignFromDetail = false;

  /** Fuel-management markets with their fuel-management sites and code lists. */
  private markets: MarketNode[] = [];
  /** Markets in the location filter's scope (their code-change events show in Activity). */
  private visibleMarketIds = new Set<string>();
  /** Each linked pump's Market → Site location, by pump id. */
  private pumpLocations = new Map<string, PumpLocation>();
  private readonly themeSettingKey = "darkMode";
  /** The pump panel, to switch its tab when it's already open. */
  @ViewChild("pumpPanel") private pumpPanel?: EntityDetailPanelComponent;
  private alarmService: AlarmService;
  /** All active alarms of every pump, unscoped. */
  private allAlarms: AlarmListItem[] = [];
  /** All loaded events of every pump, unfiltered. */
  private allEvents: ActivityRow[] = [];
  private activityLoaded = false;
  private alarmsSubscription: any;
  private pumpsSubscription: any;
  private pumpsRefreshTimer?: any;
  private activityRefreshTimer?: any;

  constructor(private cd: ChangeDetectorRef, private destroyRef: DestroyRef) {}

  // -- view getters -------------------------------------------------------------

  get detailTabs(): SegmentOption[] {
    return [
      { id: "insights", label: "Insights", icon: "bar_chart", tooltip: "Insights" },
      { id: "codes", label: "Access codes", icon: "key", tooltip: "Access codes" },
      { id: "alarms", label: "Alarms", icon: "notifications", tooltip: "Alarms", badge: this.detailAlarms.length },
      { id: "settings", label: "Settings", icon: "settings", tooltip: "Settings" },
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

  get assignSubtitle(): string {
    return this.markets.find((m) => m.id === this.assignMarketId)?.name ?? "";
  }

  /** The market shown in the Access codes view. */
  get codesMarket(): MarketNode | null {
    return this.markets.find((m) => m.id === this.codesMarketId) ?? null;
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
    this.subscribeAlarms();
  }

  ngOnDestroy(): void {
    if (this.alarmsSubscription) {
      this.ctx.subscriptionApi.removeSubscription(this.alarmsSubscription.id);
    }
    if (this.pumpsSubscription) {
      this.ctx.subscriptionApi.removeSubscription(this.pumpsSubscription.id);
    }
    clearTimeout(this.pumpsRefreshTimer);
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

  selectView(id: string): void {
    this.view = id as DashboardView;
    if (this.view === "activity" && !this.activityLoaded) {
      this.loadActivity();
    }
  }

  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
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

  onCodeKindChange(kind: string): void {
    this.codeKind = kind as CodeKind;
    this.applyCodes();
  }

  onCodesMarketChange(ids: string[]): void {
    this.codesMarketId = ids[0] ?? null;
    this.applyCodes();
  }

  // -- pumps table + detail panel -----------------------------------------------

  /** A Pumps row: open that pump's panel on Insights (an open panel keeps its tab). */
  onPumpRowClick(row: Record<string, any>): void {
    this.openPump(row as PumpRow, this.detailOpen ? null : "insights");
  }

  /** The Codes cell: open (or switch) the pump's panel straight to Access codes. */
  onCodesCellClick(event: Event, pump: PumpRow): void {
    event.stopPropagation(); // not a row click
    this.openPump(pump, "codes");
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
   * Close the pump panel on a click outside it. Clicks on a table switch the
   * selection instead, and clicks in overlays (tooltips, the revoke confirm
   * dialog) or while another panel is open are ignored.
   */
  @HostListener("document:pointerdown", ["$event"])
  onDocumentPointerDown(event: Event): void {
    if (!this.detailOpen || this.assignOpen) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target?.closest("tb-entity-detail-panel, tb-data-table, .cdk-overlay-container")) {
      return;
    }
    this.closeDetail();
    this.cd.detectChanges();
  }

  /** Revoke a code from a market's shown list (after confirmation). */
  onRevoke(market: MarketNode | null, code: AccessCode): void {
    if (!market) {
      return;
    }
    const kind = this.codeKind;
    this.ctx.dialogs
      .confirm(
        "Revoke access code?",
        `Code ${code.code} (${code.name || "no name"}) will stop working at every pump in ${market.name}.`,
        "Cancel",
        "Revoke"
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((ok) => {
        if (!ok) {
          return;
        }
        const next = market.codes[kind].filter((c) => c.code !== code.code);
        this.saving = true;
        forkJoin([
          this.saveMarketCodes(market.id, kind, next),
          this.logEvent(market.id, { type: "code_revoked", code: code.code, holder: code.name, kind }),
        ]).subscribe({
          next: () => {
            this.saving = false;
            this.patchMarketCodes(market.id, kind, next);
            this.ctx.showSuccessToast(`Code ${code.code} revoked`);
            this.scheduleActivityRefresh();
            this.cd.detectChanges();
          },
          error: () => {
            this.saving = false;
            this.ctx.showErrorToast("Couldn't revoke the code.");
            this.cd.detectChanges();
          },
        });
      });
  }

  // -- assign-code panel --------------------------------------------------------

  onCodeAction(id: string): void {
    if (id === "add") {
      this.openAssign(this.codesMarket);
    }
  }

  /** Open the assign panel for a market (on the list currently shown). From the
   *  pump panel it replaces that panel and returns to it on close. */
  openAssign(market: MarketNode | null, fromDetail = false): void {
    if (!market) {
      this.ctx.showWarnToast("Select a market first.");
      return;
    }
    const all = [...market.codes.users, ...market.codes.vehicles];
    this.assignMarketId = market.id;
    this.assignKind = this.codeKind;
    this.assignFull = all.length >= this.settings.maxCodesPerPump;
    this.takenCodes = all.map((c) => c.code);
    this.assignResetKey++;
    this.assignFromDetail = fromDetail;
    if (fromDetail) {
      this.detailOpen = false;
    }
    this.assignOpen = true;
  }

  closeAssign(): void {
    this.assignOpen = false;
    if (this.assignFromDetail && this.selectedPump) {
      this.detailOpenTab = "codes"; // back where the user came from
      this.detailOpen = true;
    }
    this.assignFromDetail = false;
  }

  /** Add the code to the market's user / vehicle list (replacing an entry with
   *  the same code) and log a "code assigned" event on the market. */
  onAssign(req: AssignCodeRequest): void {
    const market = this.markets.find((m) => m.id === this.assignMarketId);
    if (!market) {
      return;
    }
    const max = this.settings.maxCodesPerPump;
    const others = [...market.codes.users, ...market.codes.vehicles].filter((c) => c.code !== req.code);
    if (others.length >= max) {
      this.ctx.showWarnToast(`${market.name} already has the maximum of ${max} codes.`);
      return;
    }
    const entry: AccessCode = { code: req.code, name: req.name, createdAt: Date.now() };
    const next = [...market.codes[req.kind].filter((c) => c.code !== entry.code), entry];
    this.saving = true;
    forkJoin([
      this.saveMarketCodes(market.id, req.kind, next),
      this.logEvent(market.id, { type: "code_assigned", code: entry.code, holder: entry.name, kind: req.kind }),
    ]).subscribe({
      next: () => {
        this.saving = false;
        this.codeKind = req.kind; // show the list the code went into
        this.patchMarketCodes(market.id, req.kind, next);
        this.ctx.showSuccessToast(`${codeKindLabel(req.kind, true)} code ${entry.code} added to ${market.name}`);
        this.closeAssign();
        this.scheduleActivityRefresh();
        this.cd.detectChanges();
      },
      error: () => {
        this.saving = false;
        this.ctx.showErrorToast("Couldn't save the code to the market.");
        this.cd.detectChanges();
      },
    });
  }

  // -- activity -----------------------------------------------------------------

  onActivityTimeframe(id: string): void {
    this.activityTimeframe = id;
    this.loadActivity();
  }

  onActivityFilter(id: string): void {
    this.activityFilter = id;
    this.applyActivityFilter();
  }

  onActivityAction(id: string): void {
    if (id === "export") {
      this.exportActivityCsv();
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
      ],
      latestValues: [
        // ThingsBoard's device-state `active` flag → Online / Offline.
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: "active" },
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: s.siteKey },
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: s.fuelTypeKey },
        { type: EntityKeyType.SHARED_ATTRIBUTE, key: s.lockedKey },
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
          this.applyFilters();
          this.refreshSelectedPump();
          this.applyAlarmScope();
          if (!this.activityLoaded) {
            this.loadActivity();
          }
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
      site: siteAttr,
      siteAttr,
      siteId: "",
      marketId: "",
      market: "",
      fuelType: server[s.fuelTypeKey]?.value ?? "",
      status: offline ? "offline" : locked ? "locked" : "online",
      locked,
      codeCount: 0, // from the pump's market — see locate()
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

  /** Scope pumps, codes, activity and alarms to the selected sites / markets. */
  private applyFilters(): void {
    const sel = new Set(this.selectedLocations);
    this.visiblePumps = sel.size ? this.pumps.filter((p) => (!!p.siteId && sel.has(p.siteId)) || (!!p.marketId && sel.has(p.marketId))) : this.pumps;
    // Markets in scope for their own (code-change) activity events.
    this.visibleMarketIds = new Set(
      sel.size ? this.markets.filter((m) => sel.has(m.id) || m.sites.some((x) => sel.has(x.id))).map((m) => m.id) : this.markets.map((m) => m.id)
    );
    this.locationOptions = this.buildLocationOptions();
    this.applyActivityFilter();
    this.applyAlarmScope();
  }

  /**
   * The location filter tree: each fuel-management market (parent) with its
   * fuel-management sites (children), counted by the pumps they contain. A
   * market without sites is a selectable leaf of its own.
   */
  private buildLocationOptions(): FilterListOption[] {
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
   * The Access codes view: the market choices (count = codes in the list shown),
   * defaulting to the first market, and that market's user / vehicle list.
   */
  private applyCodes(): void {
    const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, undefined, { numeric: true });
    const markets = [...this.markets].sort(byName);
    this.marketOptions = markets.map((m) => ({ id: m.id, label: m.name, count: m.codes[this.codeKind].length }));
    if (!markets.some((m) => m.id === this.codesMarketId)) {
      this.codesMarketId = markets[0]?.id ?? null;
    }
    this.codesMarketSelection = this.codesMarketId ? [this.codesMarketId] : [];
    const market = this.codesMarket;
    this.codeRows = (market?.codes[this.codeKind] ?? []).map(toAccessCodeRow);
    // Fixed layout: the revoke button gets a fixed slot and Code / Holder / Added
    // split the rest evenly — the same whether the list is empty or filled.
    this.codeColumns = [
      { key: "code", header: "Code", copyable: true },
      { key: "name", header: "Holder" },
      { key: "added", header: "Added" },
      { key: "actions", header: "", align: "right", width: "64px" },
    ];
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
   *    `fuelManagement` server attribute is true, with their user / vehicle
   *    code lists;
   * 2. per market, one relation query two levels deep over "Contains" — Market →
   *    asset and asset → device relations in a single call;
   * 3. the market's child assets, kept when they are of the site type with
   *    `fuelManagement` true;
   * 4. each kept site's contained devices → the pump's location (pumps not of
   *    the pump profile never appear in the table, so they're ignored).
   * The flag is checked client-side so it matches whether stored as a boolean
   * or the string "true".
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
      latestValues: [
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: s.fuelManagementKey },
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: s.userCodesKey },
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: s.vehicleCodesKey },
      ],
      pageLink: { pageSize: 1024, page: 0 },
    };
    const codesOf = (d: any) => {
      const server = d.latest?.[EntityKeyType.SERVER_ATTRIBUTE] ?? {};
      return { users: parseAccessCodes(server[s.userCodesKey]?.value), vehicles: parseAccessCodes(server[s.vehicleCodesKey]?.value) };
    };
    this.ctx.entityService
      .findEntityDataByQuery(marketsQuery, cfg)
      .pipe(
        map((page) => page.data.filter(flagOn).map((d) => ({ id: d.entityId.id, name: nameOf(d), codes: codesOf(d) }))),
        // Market → site → device relations, one call per market.
        switchMap((markets) =>
          markets.length
            ? forkJoin(
                markets.map((market) =>
                  this.ctx.entityRelationService
                    .findByQuery(
                      {
                        parameters: {
                          rootId: market.id,
                          rootType: EntityType.ASSET,
                          direction: EntitySearchDirection.FROM,
                          maxLevel: 2,
                          fetchLastLevelOnly: false,
                        },
                        filters: [{ relationType: s.containsRelation, entityTypes: [EntityType.ASSET, EntityType.DEVICE] }],
                      },
                      cfg
                    )
                    .pipe(
                      map((relations) => ({ market, relations })),
                      catchError(() => of({ market, relations: [] as any[] }))
                    )
                )
              )
            : of([] as { market: Omit<MarketNode, "sites">; relations: any[] }[])
        ),
        // Resolve the candidate sites (type + fuelManagement flag + name).
        switchMap((perMarket) => {
          const candidateIds = [
            ...new Set(
              perMarket.flatMap(({ market, relations }) =>
                relations.filter((r) => r.from?.id === market.id && r.to?.entityType === EntityType.ASSET).map((r) => r.to.id as string)
              )
            ),
          ];
          if (!candidateIds.length) {
            return of({ perMarket, sites: new Map<string, string>() });
          }
          const sitesQuery: EntityDataQuery = {
            entityFilter: { type: AliasFilterType.entityList, entityType: EntityType.ASSET, entityList: candidateIds },
            entityFields: assetFields,
            latestValues: [{ type: EntityKeyType.SERVER_ATTRIBUTE, key: s.fuelManagementKey }],
            pageLink: { pageSize: Math.max(1024, candidateIds.length), page: 0 },
          };
          return this.ctx.entityService.findEntityDataByQuery(sitesQuery, cfg).pipe(
            map((page) => ({
              perMarket,
              sites: new Map(
                page.data
                  .filter((d) => d.latest?.[EntityKeyType.ENTITY_FIELD]?.["type"]?.value === s.siteAssetType && flagOn(d))
                  .map((d) => [d.entityId.id, nameOf(d)] as [string, string])
              ),
            }))
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: ({ perMarket, sites }) => {
          const locations = new Map<string, PumpLocation>();
          this.markets = perMarket.map(({ market, relations }) => {
            const siteIds = [
              ...new Set(relations.filter((r) => r.from?.id === market.id && sites.has(r.to?.id)).map((r) => r.to.id as string)),
            ];
            for (const r of relations) {
              // Site → device: the device's location (first market/site wins).
              if (siteIds.includes(r.from?.id) && r.to?.entityType === EntityType.DEVICE && !locations.has(r.to.id)) {
                locations.set(r.to.id, { siteId: r.from.id, siteName: sites.get(r.from.id)!, marketId: market.id, marketName: market.name });
              }
            }
            return { id: market.id, name: market.name, codes: market.codes, sites: siteIds.map((id) => ({ id, name: sites.get(id)! })) };
          });
          this.pumpLocations = locations;
          this.marketsLoading = false;
          this.pumps = this.pumps.map((p) => this.locate(p));
          this.applyFilters();
          this.applyCodes();
          this.refreshSelectedPump();
          if (this.activityLoaded) {
            this.scheduleActivityRefresh(); // pick up the markets' own events
          }
          this.cd.detectChanges();
        },
        error: () => {
          this.marketsLoading = false;
          console.warn("[fuel-management] Couldn't load the Market → Site hierarchy.");
          this.cd.detectChanges();
        },
      });
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
        keys: [{ name: s.dispenseVolumeKey, label: "Dispensed", color: "#1e5dff" }],
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
    const tf = ACTIVITY_TIMEFRAMES.find((t) => t.id === this.activityTimeframe) ?? ACTIVITY_TIMEFRAMES[1];
    const end = Date.now();
    const start = end - tf.ms;
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
        this.applyActivityFilter();
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
    const volume = Number(e.volume);
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
      holder: e.holder || "—",
      code: e.code ?? "",
      volume: e.volume != null && isFinite(volume) ? `${volume.toFixed(1)} L` : "—",
    };
  }

  /** Location-scope the events, count them per chip, then apply the chip filter. */
  private applyActivityFilter(): void {
    const ids = new Set([...this.visiblePumps.map((p) => p.pumpId), ...this.visibleMarketIds]);
    const scoped = this.allEvents.filter((e) => ids.has(e.pumpId));
    this.activityChips = ACTIVITY_FILTERS.map((f) => ({
      ...f,
      count: f.id === "all" ? scoped.length : scoped.filter((e) => e.group === f.id).length,
    }));
    this.activityRows = this.activityFilter === "all" ? scoped : scoped.filter((e) => e.group === this.activityFilter);
  }

  private scheduleActivityRefresh(): void {
    clearTimeout(this.activityRefreshTimer);
    this.activityRefreshTimer = setTimeout(() => this.loadActivity(), 1000);
  }

  /** Download the events in view as CSV. */
  private exportActivityCsv(): void {
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [
      ["Time", "Event", "Pump", "Holder", "Code", "Volume"].join(","),
      ...this.activityRows.map((r) =>
        [new Date(r.ts).toISOString(), r.label, r.pump, r.holder, r.code, r.volume].map((v) => esc(v)).join(",")
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fuel-activity-${new Date().toISOString().slice(0, 10)}.csv`;
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
      entityFilter: this.pumpFilter,
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

  /** Alarms of the visible pumps (named by pump display name) and of the selected pump. */
  private applyAlarmScope(): void {
    const byId = new Map(this.visiblePumps.map((p) => [p.pumpId, p]));
    this.panelAlarms = this.allAlarms
      .filter((a) => byId.has(a.originatorId))
      .map((a) => ({ ...a, originatorName: byId.get(a.originatorId)!.name }));
    const id = this.selectedPump?.pumpId;
    this.detailAlarms = id ? this.allAlarms.filter((a) => a.originatorId === id) : [];
  }

  // -- writes -------------------------------------------------------------------------

  /** Save one of a market's code lists (market asset SERVER attribute). */
  private saveMarketCodes(marketId: string, kind: CodeKind, list: AccessCode[]): Observable<any> {
    const key = kind === "users" ? this.settings.userCodesKey : this.settings.vehicleCodesKey;
    return this.ctx.attributeService.saveEntityAttributes(
      { entityType: EntityType.ASSET, id: marketId },
      AttributeScope.SERVER_SCOPE,
      [{ key, value: list }] as any,
      { ignoreLoading: true }
    );
  }

  /** Write a code-change activity event on a market; failures (e.g. no telemetry
   *  permission) never block the change itself. */
  private logEvent(marketId: string, event: PumpEvent): Observable<any> {
    return this.ctx.attributeService
      .saveEntityTimeseries({ entityType: EntityType.ASSET, id: marketId }, "ANY", [{ key: this.settings.eventKey, value: JSON.stringify(event) }] as any, {
        ignoreLoading: true,
        ignoreErrors: true,
      })
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
