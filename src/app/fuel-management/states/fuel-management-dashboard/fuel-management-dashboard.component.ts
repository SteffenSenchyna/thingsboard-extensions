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
import { Observable, forkJoin, of, throwError } from "rxjs";
import { catchError, map, switchMap } from "rxjs/operators";
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
import { CheckFilterComponent } from "../../../components/shared/check-filter/check-filter.component";
import { FilterSectionComponent } from "../../../components/shared/filter-section/filter-section.component";
import { ConfirmDialogComponent } from "../../../components/shared/confirm-dialog/confirm-dialog.component";
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
import { keepsSidePanelOpen } from "../../../components/shared/detail-panel/side-panel-outside-click";
import { EntityDetailPanelComponent } from "../../../components/shared/entity-detail-panel/entity-detail-panel.component";
import { FilterChipOption, FilterChipsComponent } from "../../../components/shared/filter-chips/filter-chips.component";
import { FilterListComponent, FilterListOption } from "../../../components/shared/filter-list/filter-list.component";
import { HeaderIconButtonComponent } from "../../../components/shared/header-icon-button/header-icon-button.component";
import { MetricChartCardComponent, MetricChartSection } from "../../../components/shared/metric-chart-card/metric-chart-card.component";
import { SegmentOption, SegmentedControlComponent } from "../../../components/shared/segmented-control/segmented-control.component";
import { SidebarLayoutComponent } from "../../../components/shared/sidebar-layout/sidebar-layout.component";
import { StatusPillComponent } from "../../../components/shared/status-pill/status-pill.component";
import { ThemeToggleComponent } from "../../../components/shared/theme-toggle/theme-toggle.component";
import { TimeframePickerComponent } from "../../../components/shared/timeframe-picker/timeframe-picker.component";
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
  codeAssetConfig,
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
  parseCodeSlots,
  parsePumpEvent,
  shortPumpName,
  strictestCodeLimits,
  toAccessCodeRow,
  withCode,
  withoutCode,
} from "../../models/fuel-management.models";

type DashboardView = "pumps" | "codes" | "activity";

/**
 * Fuel management dashboard: fuel pumps (devices of the configured profiles)
 * and the keypad access codes assigned to them.
 *
 * - Left sidebar: Pumps / Access codes / Activity view switcher and a location
 *   filter — a Market → Site tree of the fuel-management markets
 *   (`fuelManagement` = true) and their sites — that scopes every view, the
 *   alarms and the counts. A Market links to its Sites by a "FuelSite"
 *   relation and each Site to its pumps by "FuelPump" (both configurable).
 * - Pumps: status, codes and last dispense per pump; a row opens the pump panel
 *   (Insights / Access codes / Alarms / Settings).
 * - Access codes: one market at a time (single choice in the sidebar) and its
 *   Users | Vehicles codes, and every pump in the market holds them (hence the
 *   per-pump Codes count).
 * - Activity: the pumps' event time series (dispenses, denials, code changes,
 *   status), filterable by group and time window, exportable as CSV.
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
    CheckFilterComponent,
    ConfirmDialogComponent,
    CopyBoxComponent,
    DataTableCellDirective,
    DataTableComponent,
    DeviceSettingsCardComponent,
    EntityDetailPanelComponent,
    FilterChipsComponent,
    FilterListComponent,
    FilterSectionComponent,
    HeaderIconButtonComponent,
    MetricChartCardComponent,
    PumpAccessCodesComponent,
    SegmentedControlComponent,
    SidebarLayoutComponent,
    StatusPillComponent,
    ThemeToggleComponent,
    TimeframePickerComponent,
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
  /** The pumps have loaded at least once — their code limits size the markets' code lists. */
  private pumpsLoaded = false;
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

  /** Which list the pump panel's Codes tab shows. */
  codeKind: CodeKind = "users";
  /** Access codes view: the code types shown (none checked = both). */
  codeTypes: CodeKind[] = [];
  /** The sidebar's Type filter: Users / Vehicles with the selected market's counts. */
  codeTypeOptions: FilterListOption[] = [];
  /** The Markets list is stretched to the sidebar's full height (its expand button). */
  marketsListExpanded = false;
  /** The Sites tree (Pumps / Activity) is stretched to the sidebar's full height. */
  locationsListExpanded = false;
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

  activityTimeframe = "1W";
  activityFilter = "all";
  activityChips: FilterChipOption[] = [];
  /** Events in view (location filter + chip filter). */
  activityRows: ActivityRow[] = [];
  activityLoading = false;
  readonly activityColumns: DataTableColumn[] = [
    { key: "time", header: "Time" },
    { key: "event", header: "Event" },
    { key: "pump", header: "Entity" },
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

  /** The market the assign panel adds to (its codes + limits feed the form's cap check). */
  get assignMarket(): MarketNode | null {
    return this.markets.find((m) => m.id === this.assignMarketId) ?? null;
  }

  get assignSubtitle(): string {
    return this.assignMarket?.name ?? "";
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

  /** The pump panel's Codes tab toggle. */
  onCodeKindChange(kind: string): void {
    this.codeKind = kind as CodeKind;
  }

  /** The Access codes view's Type filter. */
  onCodeTypesChange(ids: string[]): void {
    this.codeTypes = ids as CodeKind[];
    this.applyCodes();
  }

  onCodesMarketChange(ids: string[]): void {
    this.codesMarketId = ids[0] ?? null;
    this.applyCodes();
  }

  // -- pumps table + detail panel -----------------------------------------------

  /** A Pumps row: open that pump's panel on Insights (an open panel keeps its tab). */
  onPumpRowClick(row: Record<string, any>): void {
    if (this.detailOpen && this.selectedPump?.pumpId === (row as PumpRow).pumpId) {
      this.closeDetail(); // the highlighted row again: close, like any click off the panel
      return;
    }
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
   * Close the pump panel on a click outside it — anywhere but the panel itself,
   * a clickable pump row (that switches the panel) or an overlay; see
   * {@link keepsSidePanelOpen}. Ignored while the assign panel is open.
   */
  @HostListener("document:pointerdown", ["$event"])
  onDocumentPointerDown(event: Event): void {
    if (!this.detailOpen || this.assignOpen || keepsSidePanelOpen(event.target)) {
      return;
    }
    this.closeDetail();
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
    if (!this.pumpsLoaded) {
      this.ctx.showWarnToast("Still loading the pumps — try again in a moment.");
      return;
    }
    const cfg = { ignoreLoading: true, ignoreErrors: true };
    this.saving = true;
    this.ctx.assetService
      .deleteAsset(code.assetId, cfg)
      .pipe(
        switchMap(() =>
          this.updateMarketList(market.id, kind, (raw) => withoutCode(raw, code.code, market.limits[kind])).pipe(
            map(() => true),
            catchError(() => of(false))
          )
        ),
        switchMap((listUpdated) =>
          this.logEvent(market.id, { type: "code_revoked", code: code.code, holder: code.name, kind }).pipe(map(() => listUpdated))
        )
      )
      .subscribe({
        next: (listUpdated) => {
          this.saving = false;
          this.patchMarketCodes(market.id, kind, market.codes[kind].filter((c) => c.assetId !== code.assetId));
          if (listUpdated) {
            this.ctx.showSuccessToast(`Code ${code.code} revoked`);
          } else {
            this.ctx.showWarnToast(`Code ${code.code} revoked, but ${market.name}'s code list couldn't be updated.`);
          }
          this.scheduleActivityRefresh();
          this.cd.detectChanges();
        },
        error: (err) => {
          this.saving = false;
          this.ctx.showErrorToast(`Couldn't delete the code asset${this.apiMessage(err)}`);
          this.cd.detectChanges();
        },
      });
    this.cd.detectChanges();
  }

  // -- assign-code panel --------------------------------------------------------

  onCodeAction(id: string): void {
    if (id === "add") {
      this.openAssign(this.codesMarket);
    }
  }

  /** Open the assign panel for a market (on the list currently shown). */
  openAssign(market: MarketNode | null): void {
    if (!market) {
      this.ctx.showWarnToast("Select a market first.");
      return;
    }
    this.assignMarketId = market.id;
    // Start on the filtered type when exactly one is checked.
    this.assignKind = this.codeTypes.length === 1 ? this.codeTypes[0] : "users";
    // Unique across every market and both kinds: a keypad code must identify one holder.
    this.takenCodes = this.markets.flatMap((m) => [...m.codes.users, ...m.codes.vehicles]).map((c) => c.code);
    this.assignResetKey++;
    this.assignOpen = true;
  }

  closeAssign(): void {
    this.assignOpen = false;
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
  onAssign(req: AssignCodeRequest): void {
    const market = this.markets.find((m) => m.id === this.assignMarketId);
    if (!market) {
      return;
    }
    if (!this.pumpsLoaded) {
      this.ctx.showWarnToast("Still loading the pumps — try again in a moment.");
      return;
    }
    const reason = codeLimitReason(market.codes, market.limits, req.kind);
    if (reason) {
      this.ctx.showWarnToast(reason);
      return;
    }
    const k = codeAssetConfig(this.settings, req.kind);
    const cfg = { ignoreLoading: true, ignoreErrors: true };
    this.saving = true;
    this.marketCustomerId(market.id)
      .pipe(
        switchMap((customerId) => {
          const asset = { name: `${k.prefix}${req.code}`, type: k.type, label: req.name } as Asset;
          if (customerId) {
            asset.customerId = { entityType: EntityType.CUSTOMER, id: customerId };
          }
          return this.ctx.assetService.saveAsset(asset, cfg).pipe(
            switchMap((saved) =>
              this.ensureCustomerOwner(saved, customerId).pipe(
                catchError((err) => this.deleteCreatedAsset(saved, err))
              )
            )
          );
        }),
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
        ),
        // Allowed codes: add the code to the market's list (a failure here doesn't undo the code).
        switchMap((saved) =>
          this.updateMarketList(market.id, req.kind, (raw) => withCode(raw, req.code, market.limits[req.kind])).pipe(
            map(() => true),
            catchError(() => of(false)),
            map((listUpdated) => ({ saved, listUpdated }))
          )
        ),
        switchMap((result) =>
          this.logEvent(market.id, { type: "code_assigned", code: req.code, holder: req.name, kind: req.kind }).pipe(map(() => result))
        )
      )
      .subscribe({
        next: ({ saved, listUpdated }) => {
          this.saving = false;
          const entry: AccessCode = { assetId: saved.id.id, code: req.code, name: req.name, createdAt: saved.createdTime || Date.now() };
          if (this.codeTypes.length && !this.codeTypes.includes(req.kind)) {
            this.codeTypes = [...this.codeTypes, req.kind]; // keep the new code in view
          }
          this.patchMarketCodes(market.id, req.kind, [...market.codes[req.kind], entry]);
          if (listUpdated) {
            this.ctx.showSuccessToast(`${codeKindLabel(req.kind, true)} code ${req.code} added to ${market.name}`);
          } else {
            this.ctx.showWarnToast(`Code ${req.code} created, but ${market.name}'s code list couldn't be updated.`);
          }
          this.closeAssign();
          this.scheduleActivityRefresh();
          this.cd.detectChanges();
        },
        error: (err) => {
          this.saving = false;
          const msg = this.apiMessage(err);
          this.ctx.showErrorToast(
            /already exists/i.test(msg) ? `Code ${req.code} is already in use — generate another.` : `Couldn't create the code${msg}`
          );
          this.cd.detectChanges();
        },
      });
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
        // The keypad's code limits (total / users / vehicles).
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: s.totalCodesLimitKey },
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: s.userCodesLimitKey },
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: s.vehicleCodesLimitKey },
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
          this.pumpsLoaded = true;
          this.applyMarketLimits();
          this.applyFilters();
          this.applyCodes();
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
      site: siteAttr,
      siteAttr,
      siteId: "",
      marketId: "",
      market: "",
      fuelType: server[s.fuelTypeKey]?.value ?? "",
      status: offline ? "offline" : locked ? "locked" : "online",
      locked,
      codeCount: 0, // from the pump's market — see locate()
      limits: parseCodeLimits(
        server[s.totalCodesLimitKey]?.value,
        server[s.userCodesLimitKey]?.value,
        server[s.vehicleCodesLimitKey]?.value,
        s.maxCodesPerPump
      ),
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
    const kinds: CodeKind[] = this.codeTypes.length ? this.codeTypes : CODE_KINDS.map((k) => k.id);
    const countOf = (m: MarketNode) => kinds.reduce((n, k) => n + m.codes[k].length, 0);
    this.marketOptions = markets.map((m) => ({ id: m.id, label: m.name, count: countOf(m) }));
    if (!markets.some((m) => m.id === this.codesMarketId)) {
      this.codesMarketId = markets[0]?.id ?? null;
    }
    this.codesMarketSelection = this.codesMarketId ? [this.codesMarketId] : [];
    const market = this.codesMarket;
    this.codeTypeOptions = CODE_KINDS.map((k) => ({ id: k.id, label: k.label, count: market?.codes[k.id].length ?? 0 }));
    // The market's users and vehicles in one table (per the Type filter), newest first.
    this.codeRows = kinds
      .flatMap((k) => (market?.codes[k] ?? []).map((c) => toAccessCodeRow(c, k)))
      .sort((a, b) => (b.source.createdAt || 0) - (a.source.createdAt || 0));
    // Auto-sized like the Pumps table: column widths follow their content.
    this.codeColumns = [
      { key: "code", header: "Code", copyable: true },
      { key: "name", header: "Holder" },
      { key: "type", header: "Type" },
      { key: "added", header: "Added" },
      { key: "actions", header: "", align: "right" },
    ];
  }

  /** Each market's limits: the strictest of the pumps located in it. */
  private applyMarketLimits(): void {
    const fallback = this.settings.maxCodesPerPump;
    this.markets = this.markets.map((m) => ({
      ...m,
      limits: strictestCodeLimits(
        this.pumps.filter((p) => p.marketId === m.id).map((p) => p.limits),
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
   * 2. per market, one relation query two levels deep — Market → asset over
   *    {@link FuelDashboardSettings.siteRelation} ("FuelSite") and asset → device
   *    over {@link FuelDashboardSettings.pumpRelation} ("FuelPump"), plus the
   *    market's code assets over the user / vehicle code relations ("FuelUser" /
   *    "FuelVehicle") — all in one call;
   * 3. the market's FuelSite assets are its sites — the relation alone decides
   *    (no asset-type or attribute check); one query fetches the sites' and
   *    code assets' names, labels and creation times;
   * 4. each site's FuelPump devices → the pump's location (pumps not of
   *    the pump profile never appear in the table, so they're ignored);
   * 5. each code asset → an {@link AccessCode} on its market's user / vehicle list.
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
    /** Market -FuelUser / FuelVehicle→ asset: one of the market's codes (null when it isn't one). */
    const codeKindOf = (r: EntityRelation, marketId: string): CodeKind | null =>
      r.from?.id !== marketId || r.to?.entityType !== EntityType.ASSET
        ? null
        : r.type === userCodes.relation
          ? "users"
          : r.type === vehicleCodes.relation
            ? "vehicles"
            : null;
    this.ctx.entityService
      .findEntityDataByQuery(marketsQuery, cfg)
      .pipe(
        map((page) => page.data.filter(flagOn).map((d) => ({ id: d.entityId.id, name: nameOf(d) }))),
        // Market -FuelSite→ site -FuelPump→ device relations, one call per market.
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
                        filters: [
                          { relationType: s.siteRelation, entityTypes: [EntityType.ASSET] },
                          { relationType: s.pumpRelation, entityTypes: [EntityType.DEVICE] },
                          { relationType: userCodes.relation, entityTypes: [EntityType.ASSET] },
                          { relationType: vehicleCodes.relation, entityTypes: [EntityType.ASSET] },
                        ],
                      },
                      cfg
                    )
                    .pipe(
                      map((relations) => ({ market, relations })),
                      catchError(() => of({ market, relations: [] as any[] }))
                    )
                )
              )
            : of([] as { market: Pick<MarketNode, "id" | "name">; relations: any[] }[])
        ),
        // Resolve the sites and code assets (name, label, created) in one query.
        switchMap((perMarket) => {
          const assetIds = [
            ...new Set(
              perMarket.flatMap(({ market, relations }) =>
                relations.filter((r) => isSiteLink(r, market.id) || codeKindOf(r, market.id)).map((r) => r.to.id as string)
              )
            ),
          ];
          if (!assetIds.length) {
            return of({ perMarket, assets: new Map<string, { name: string; label: string; createdTime: number }>() });
          }
          const assetsQuery: EntityDataQuery = {
            entityFilter: { type: AliasFilterType.entityList, entityType: EntityType.ASSET, entityList: assetIds },
            entityFields: [...assetFields, { type: EntityKeyType.ENTITY_FIELD, key: "createdTime" }],
            pageLink: { pageSize: Math.max(1024, assetIds.length), page: 0 },
          };
          return this.ctx.entityService.findEntityDataByQuery(assetsQuery, cfg).pipe(
            map((page) => ({
              perMarket,
              assets: new Map(
                page.data.map((d) => {
                  const f = d.latest?.[EntityKeyType.ENTITY_FIELD] ?? {};
                  const info = { name: String(f["name"]?.value ?? ""), label: String(f["label"]?.value ?? ""), createdTime: Number(f["createdTime"]?.value) || 0 };
                  return [d.entityId.id, info] as [string, typeof info];
                })
              ),
            }))
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: ({ perMarket, assets }) => {
          const locations = new Map<string, PumpLocation>();
          const sites = new Map([...assets].map(([id, a]) => [id, a.label || a.name] as [string, string]));
          this.markets = perMarket.map(({ market, relations }) => {
            const codes: MarketCodes = { users: [], vehicles: [] };
            for (const r of relations) {
              const kind = codeKindOf(r, market.id);
              const asset = kind ? assets.get(r.to.id) : undefined;
              if (kind && asset && !codes[kind].some((c) => c.assetId === r.to.id)) {
                codes[kind].push({
                  assetId: r.to.id,
                  code: codeFromAssetName(asset.name, codeAssetConfig(s, kind).prefix),
                  name: asset.label,
                  createdAt: asset.createdTime,
                });
              }
            }
            const siteIds = [
              ...new Set(relations.filter((r) => isSiteLink(r, market.id) && sites.has(r.to.id)).map((r) => r.to.id as string)),
            ];
            for (const r of relations) {
              // Site -FuelPump→ device: the device's location (first market/site wins).
              if (r.type === s.pumpRelation && siteIds.includes(r.from?.id) && r.to?.entityType === EntityType.DEVICE && !locations.has(r.to.id)) {
                locations.set(r.to.id, { siteId: r.from.id, siteName: sites.get(r.from.id)!, marketId: market.id, marketName: market.name });
              }
            }
            return {
              id: market.id,
              name: market.name,
              codes,
              sites: siteIds.map((id) => ({ id, name: sites.get(id)! })),
              limits: strictestCodeLimits([], s.maxCodesPerPump), // set from its pumps just below
            };
          });
          this.pumpLocations = locations;
          this.marketsLoading = false;
          this.pumps = this.pumps.map((p) => this.locate(p));
          this.applyMarketLimits();
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
          attr(s.totalCodesLimitKey),
          attr(s.userCodesLimitKey),
          attr(s.vehicleCodesLimitKey),
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
      ["Time", "Event", "Entity", "Holder", "Code", "Volume"].join(","),
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
