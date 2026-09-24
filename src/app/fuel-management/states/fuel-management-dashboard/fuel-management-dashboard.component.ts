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

import { ChangeDetectorRef, Component, DestroyRef, HostListener, Input, OnDestroy, OnInit } from "@angular/core";
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
  EVENT_META,
  FuelDashboardSettings,
  PUMP_STATUS_META,
  PumpEvent,
  PumpRow,
  PumpStatus,
  formatExpiry,
  formatWhen,
  fuelDashboardDefaultSettings,
  holderTypeLabel,
  parseAccessCodes,
  parseBool,
  parsePumpEvent,
  shortPumpName,
} from "../../models/fuel-management.models";

type DashboardView = "pumps" | "codes" | "activity";

/** Owner label for pumps the tenant hasn't assigned to a customer. */
const UNASSIGNED = "Unassigned";

/**
 * Fuel management dashboard: fuel pumps (devices of the configured profiles)
 * and the keypad access codes assigned to them.
 *
 * - Left sidebar: Pumps / Access codes / Activity view switcher and a customer
 *   filter — the customers of the "Fuel Management" customer group(s), at any
 *   level of the customer hierarchy — that scopes every view, the alarms and
 *   the counts (a pump belongs to the customer that owns it).
 * - Pumps: status, codes and last dispense per pump; a row opens the pump panel
 *   (Insights / Access codes / Alarms / Settings).
 * - Access codes: every code aggregated across the pumps it opens.
 * - Activity: the pumps' event time series (dispenses, denials, code changes,
 *   status), filterable by group and time window, exportable as CSV.
 *
 * Codes live on each pump as a SHARED JSON attribute so the pump controller
 * receives them; assigning/revoking also writes an activity event. Where each
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
    { id: "pumps", label: "Pumps", icon: "local_gas_station" },
    { id: "codes", label: "Access codes", icon: "key" },
    { id: "activity", label: "Activity", icon: "history" },
  ];
  view: DashboardView = "pumps";
  sidebarOpen = true;

  // -- pumps + customer filter ------------------------------------------------

  /** Every pump, unfiltered. */
  pumps: PumpRow[] = [];
  pumpsLoading = false;
  /** Pumps owned by the selected customers (all when none selected). */
  visiblePumps: PumpRow[] = [];
  customerOptions: FilterListOption[] = [];
  selectedCustomers: string[] = [];
  readonly pumpColumns: DataTableColumn[] = [
    { key: "name", header: "Pump" },
    { key: "site", header: "Site" },
    { key: "fuelType", header: "Fuel" },
    { key: "codeCount", header: "Codes" },
    { key: "status", header: "Status" },
    { key: "lastDispense", header: "Last dispense" },
  ];

  // -- access codes -----------------------------------------------------------

  codeRows: AccessCodeRow[] = [];
  /** Every code in use on any pump — generated codes never collide with these. */
  takenCodes: string[] = [];
  readonly codeColumns: DataTableColumn[] = [
    { key: "code", header: "Code", copyable: true },
    { key: "holder", header: "Holder" },
    { key: "holderType", header: "Type" },
    { key: "pumps", header: "Pumps" },
    { key: "expires", header: "Expires" },
  ];
  readonly codeActions: DataTableAction[] = [{ id: "add", icon: "add", tooltip: "New access code" }];

  // -- activity ---------------------------------------------------------------

  readonly activityTimeframes = ACTIVITY_TIMEFRAMES;
  activityTimeframe = "7D";
  activityFilter = "all";
  activityChips: FilterChipOption[] = [];
  /** Events in view (customer filter + chip filter). */
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
  detailTab = "codes";
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
  assignPumpIds: string[] = [];
  /** Bumped on every open so the form resets. */
  assignResetKey = 0;
  readonly assignTabs: SegmentOption[] = [{ id: "assign", label: "Assign code", icon: "key" }];
  /** Re-open the pump panel when the assign panel closes (it was opened from there). */
  private assignFromDetail = false;

  /**
   * Titles of the customers in the configured customer group(s), or null when
   * no group is configured/found (the filter then lists the pumps' owners).
   */
  private groupCustomers: string[] | null = null;
  private readonly themeSettingKey = "darkMode";
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
    if (this.assignPumpIds.length === 1) {
      const p = this.pumps.find((x) => x.pumpId === this.assignPumpIds[0]);
      return p ? [p.name, p.site].filter(Boolean).join(" · ") : "";
    }
    return "Choose the pumps it opens";
  }

  get alarmSubtitle(): string {
    return this.selectedCustomers.length ? this.selectedCustomers.join(", ") : "All pumps";
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
    this.loadUserPreferences();

    this.loadCustomerGroup();
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

  onCustomersChange(ids: string[]): void {
    this.selectedCustomers = ids;
    this.applyFilters();
  }

  // -- pumps table + detail panel -----------------------------------------------

  onPumpRowClick(row: Record<string, any>): void {
    this.selectedPump = row as PumpRow;
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

  onRequireCodeChange(pump: PumpRow, value: boolean): void {
    const previous = pump.requireCode;
    this.patchPump(pump.pumpId, { requireCode: value });
    this.saving = true;
    this.saveShared(pump.pumpId, [{ key: this.settings.requireCodeKey, value }]).subscribe({
      next: () => {
        this.saving = false;
        this.cd.detectChanges();
      },
      error: () => {
        this.saving = false;
        this.patchPump(pump.pumpId, { requireCode: previous });
        this.ctx.showErrorToast("Couldn't update the access-code requirement.");
        this.cd.detectChanges();
      },
    });
  }

  /** Revoke one code from the selected pump (after confirmation). */
  onRevoke(pump: PumpRow, code: AccessCode): void {
    this.ctx.dialogs
      .confirm("Revoke access code?", `Code ${code.code} (${code.holder || "no holder"}) will stop working on ${pump.name}.`, "Cancel", "Revoke")
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((ok) => {
        if (!ok) {
          return;
        }
        const next = pump.accessCodes.filter((c) => c.code !== code.code);
        this.saving = true;
        forkJoin([
          this.saveShared(pump.pumpId, [{ key: this.settings.accessCodesKey, value: next }]),
          this.logEvent(pump.pumpId, { type: "code_revoked", code: code.code, holder: code.holder }),
        ]).subscribe({
          next: () => {
            this.saving = false;
            this.patchPump(pump.pumpId, { accessCodes: next, codeCount: next.length });
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
      this.openAssign([]);
    }
  }

  /** Open the assign panel, pre-checking {@link pumpIds}. From the pump panel it
   *  replaces that panel and returns to it on close. */
  openAssign(pumpIds: string[], fromDetail = false): void {
    this.assignPumpIds = pumpIds;
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
      this.detailOpen = true;
    }
    this.assignFromDetail = false;
  }

  /** Add the code to each chosen pump's access-codes attribute (replacing an
   *  existing entry with the same code) and log a "code assigned" event. */
  onAssign(req: AssignCodeRequest): void {
    const entry: AccessCode = {
      code: req.code,
      holder: req.holder,
      holderType: req.holderType,
      expiresAt: req.expiresAt,
      createdAt: Date.now(),
    };
    const updates = req.pumpIds
      .map((id) => this.pumps.find((p) => p.pumpId === id))
      .filter((p): p is PumpRow => !!p)
      .map((p) => ({ pump: p, codes: [...p.accessCodes.filter((c) => c.code !== entry.code), entry] }));
    if (!updates.length) {
      return;
    }
    this.saving = true;
    forkJoin(
      updates.flatMap(({ pump, codes }) => [
        this.saveShared(pump.pumpId, [{ key: this.settings.accessCodesKey, value: codes }]),
        this.logEvent(pump.pumpId, { type: "code_assigned", code: entry.code, holder: entry.holder }),
      ])
    ).subscribe({
      next: () => {
        this.saving = false;
        updates.forEach(({ pump, codes }) => this.patchPump(pump.pumpId, { accessCodes: codes, codeCount: codes.length }));
        this.ctx.showSuccessToast(`Code ${entry.code} assigned to ${updates.length} pump${updates.length === 1 ? "" : "s"}`);
        this.closeAssign();
        this.scheduleActivityRefresh();
        this.cd.detectChanges();
      },
      error: () => {
        this.saving = false;
        this.ctx.showErrorToast("Couldn't assign the code to every pump — check the pumps' codes.");
        this.loadPumps();
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
        // Owning customer — drives the customer filter.
        { type: EntityKeyType.ENTITY_FIELD, key: "ownerName" },
        { type: EntityKeyType.ENTITY_FIELD, key: "ownerType" },
      ],
      latestValues: [
        // ThingsBoard's device-state `active` flag → Online / Offline.
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: "active" },
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: s.siteKey },
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: s.fuelTypeKey },
        { type: EntityKeyType.SHARED_ATTRIBUTE, key: s.accessCodesKey },
        { type: EntityKeyType.SHARED_ATTRIBUTE, key: s.requireCodeKey },
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
    const accessCodes = parseAccessCodes(shared[s.accessCodesKey]?.value);
    const dispenseTs = Number(ts[s.dispenseVolumeKey]?.ts) || null;
    return {
      pumpId: d.entityId.id,
      name,
      shortName: shortPumpName(name),
      deviceName,
      deviceLabel,
      description: this.parseDescription(fields["additionalInfo"]?.value),
      type: fields["type"]?.value ?? "",
      site: server[s.siteKey]?.value ?? "",
      fuelType: server[s.fuelTypeKey]?.value ?? "",
      customer: fields["ownerType"]?.value === "CUSTOMER" ? fields["ownerName"]?.value || UNASSIGNED : UNASSIGNED,
      status: offline ? "offline" : locked ? "locked" : "online",
      locked,
      requireCode: parseBool(shared[s.requireCodeKey]?.value, true),
      accessCodes,
      codeCount: accessCodes.length,
      lastDispenseTs: dispenseTs,
      lastDispense: formatWhen(dispenseTs),
    };
  }

  /** Scope pumps, codes, activity and alarms to the selected customers. */
  private applyFilters(): void {
    const sel = this.selectedCustomers;
    this.visiblePumps = sel.length ? this.pumps.filter((p) => sel.includes(p.customer)) : this.pumps;
    this.codeRows = this.buildCodeRows(this.visiblePumps);
    this.takenCodes = [...new Set(this.pumps.flatMap((p) => p.accessCodes.map((c) => c.code)))];
    this.customerOptions = this.buildCustomerOptions();
    this.applyActivityFilter();
    this.applyAlarmScope();
  }

  /**
   * Customer options with pump counts: the customer group's members (all
   * selectable, even with no pumps yet), else the pumps' owners.
   */
  private buildCustomerOptions(): FilterListOption[] {
    const counts = new Map<string, number>();
    this.pumps.forEach((p) => counts.set(p.customer, (counts.get(p.customer) ?? 0) + 1));
    const names = this.groupCustomers ?? [...counts.keys()];
    return names
      .map((name) => ({ id: name, label: name, count: counts.get(name) ?? 0 }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }

  /**
   * Load the customers of every CUSTOMER entity group named
   * {@link FuelDashboardSettings.customerGroupName} that the user can read — the
   * `entityGroupName` query is permission-scoped rather than owner-scoped, so it
   * finds the group whether the tenant or any customer in the hierarchy owns
   * it — then each group's members (`entityGroup` query). Both filter types are
   * ThingsBoard PE; on CE, or when no such group exists, the filter falls back
   * to listing the pumps' owners.
   */
  private loadCustomerGroup(): void {
    const groupName = (this.settings.customerGroupName ?? "").trim();
    if (!groupName) {
      return;
    }
    const cfg = { ignoreLoading: true, ignoreErrors: true };
    // PE-only filter types — not part of the CE EntityFilter typings.
    const groupsQuery: EntityDataQuery = {
      entityFilter: { type: "entityGroupName", groupType: EntityType.CUSTOMER, entityGroupNameFilter: groupName } as unknown as EntityFilter,
      entityFields: [{ type: EntityKeyType.ENTITY_FIELD, key: "name" }],
      pageLink: { pageSize: 1024, page: 0 },
    };
    const membersQuery = (groupId: string): EntityDataQuery => ({
      entityFilter: { type: "entityGroup", groupType: EntityType.CUSTOMER, entityGroup: groupId } as unknown as EntityFilter,
      entityFields: [{ type: EntityKeyType.ENTITY_FIELD, key: "title" }],
      pageLink: { pageSize: 1024, page: 0 },
    });
    this.ctx.entityService
      .findEntityDataByQuery(groupsQuery, cfg)
      .pipe(
        // The name filter is a prefix match — keep exact (case-insensitive) names only.
        map((page) =>
          page.data
            .filter((g) => String(g.latest?.[EntityKeyType.ENTITY_FIELD]?.["name"]?.value ?? "").trim().toLowerCase() === groupName.toLowerCase())
            .map((g) => g.entityId.id)
        ),
        switchMap((groupIds) =>
          groupIds.length
            ? forkJoin(
                groupIds.map((id) =>
                  this.ctx.entityService.findEntityDataByQuery(membersQuery(id), cfg).pipe(
                    map((page) => page.data.map((c) => String(c.latest?.[EntityKeyType.ENTITY_FIELD]?.["title"]?.value ?? "")).filter(Boolean)),
                    catchError(() => of([] as string[]))
                  )
                )
              ).pipe(map((lists) => [...new Set(lists.flat())]))
            : of(null)
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (titles) => {
          if (titles === null) {
            console.warn(`[fuel-management] No customer group named "${groupName}" found — listing pump owners instead.`);
          }
          this.groupCustomers = titles;
          this.applyFilters();
          this.cd.detectChanges();
        },
        error: () => {
          console.warn(`[fuel-management] Couldn't load customer group "${groupName}" — listing pump owners instead.`);
        },
      });
  }

  /** One row per code (+holder), listing every visible pump it's assigned to. */
  private buildCodeRows(pumps: PumpRow[]): AccessCodeRow[] {
    const rows = new Map<string, AccessCodeRow>();
    for (const p of pumps) {
      for (const c of p.accessCodes) {
        const key = `${c.code}|${c.holder}`;
        let row = rows.get(key);
        if (!row) {
          row = {
            key,
            code: c.code,
            holder: c.holder || "—",
            holderType: holderTypeLabel(c.holderType),
            pumpIds: [],
            pumps: [],
            expiresAt: c.expiresAt,
            expires: formatExpiry(c.expiresAt),
          };
          rows.set(key, row);
        }
        row.pumpIds.push(p.pumpId);
        row.pumps.push(p.shortName);
      }
    }
    return [...rows.values()].sort((a, b) => a.holder.localeCompare(b.holder));
  }

  /** Patch one pump in place (optimistic update) and rebuild the derived views. */
  private patchPump(pumpId: string, patch: Partial<PumpRow>): void {
    this.pumps = this.pumps.map((p) => (p.pumpId === pumpId ? { ...p, ...patch } : p));
    this.applyFilters();
    this.refreshSelectedPump();
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
          attr(s.accessCodesKey),
          attr(s.requireCodeKey),
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

  /** Load every pump's events for the selected window (newest first). */
  private loadActivity(): void {
    const tf = ACTIVITY_TIMEFRAMES.find((t) => t.id === this.activityTimeframe) ?? ACTIVITY_TIMEFRAMES[1];
    const end = Date.now();
    const start = end - tf.ms;
    const pumps = this.pumps;
    this.activityLoading = true;
    this.activityLoaded = true;
    const cfg = { ignoreLoading: true, ignoreErrors: true };
    const calls: Observable<ActivityRow[]>[] = pumps.map((p) =>
      this.ctx.attributeService
        .getEntityTimeseries({ entityType: EntityType.DEVICE, id: p.pumpId }, [this.settings.eventKey], start, end, 500, undefined, undefined, undefined, undefined, cfg)
        .pipe(
          map((data: any) => (data?.[this.settings.eventKey] ?? []).map((pt: any) => this.toActivityRow(p, pt.ts, pt.value)).filter(Boolean) as ActivityRow[]),
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

  private toActivityRow(pump: PumpRow, ts: number, raw: unknown): ActivityRow | null {
    const e = parsePumpEvent(raw);
    if (!e) {
      return null;
    }
    const meta = EVENT_META[e.type];
    const volume = Number(e.volume);
    return {
      id: `${pump.pumpId}-${ts}`,
      ts,
      time: formatWhen(ts),
      type: e.type,
      label: meta.label,
      icon: meta.icon,
      tone: meta.tone,
      group: meta.group,
      pumpId: pump.pumpId,
      pump: pump.shortName,
      holder: e.holder || "—",
      code: e.code ?? "",
      volume: e.volume != null && isFinite(volume) ? `${volume.toFixed(1)} L` : "—",
    };
  }

  /** Customer-scope the events, count them per chip, then apply the chip filter. */
  private applyActivityFilter(): void {
    const ids = new Set(this.visiblePumps.map((p) => p.pumpId));
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

  private saveShared(pumpId: string, attributes: { key: string; value: unknown }[]): Observable<any> {
    return this.ctx.attributeService.saveEntityAttributes(
      { entityType: EntityType.DEVICE, id: pumpId },
      AttributeScope.SHARED_SCOPE,
      attributes as any,
      { ignoreLoading: true }
    );
  }

  /** Write an activity event; failures (e.g. no telemetry permission) never block the change itself. */
  private logEvent(pumpId: string, event: PumpEvent): Observable<any> {
    return this.ctx.attributeService
      .saveEntityTimeseries({ entityType: EntityType.DEVICE, id: pumpId }, "ANY", [{ key: this.settings.eventKey, value: JSON.stringify(event) }] as any, {
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
