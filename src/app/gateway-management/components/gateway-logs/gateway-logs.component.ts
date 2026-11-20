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

import { ChangeDetectorRef, Component, DestroyRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild, inject } from "@angular/core";
import { DashboardRootDirective } from "../../../components/shared/dashboard/dashboard-root.directive";
import { CommonModule } from "@angular/common";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { from, of } from "rxjs";
import { catchError, map, mergeMap, toArray } from "rxjs/operators";
import { AggregationType, DataSortOrder, EntityType, SharedModule, SubscriptionUpdate, TelemetrySubscriber, TimeseriesSubscriptionCmd } from "@shared/public-api";
import { WidgetContext } from "@home/models/widget-component.models";
import { DataTableCellDirective, DataTableColumn, DataTableComponent } from "../../../components/shared/data-table/data-table.component";
import { SegmentOption } from "../../../components/shared/segmented-control/segmented-control.component";
import { StatusPillComponent } from "../../../components/shared/status-pill/status-pill.component";
import type { TbDateRange } from "../../../components/shared/date-range-picker/date-range-picker.component";
import { TB_CUSTOM_TIMEFRAME, TimeframePickerComponent } from "../../../components/shared/timeframe-picker/timeframe-picker.component";
import { GATEWAY_LOG_SOURCES, GatewayLogRow, LOG_LEVEL_META, LOG_TIMEFRAMES, LogLevelName, logLevelFilterId, parseLogLine } from "../../models/gateway-management.models";
import { formatWhen } from "../../../components/shared/time-format";
import { QUIET_REQUEST } from "../../../components/shared/value-utils";

/** A gateway, as the views name it. */
export interface GatewayRef {
  id: string;
  name: string;
}

/** A log channel: the time-series key holding its lines, and how the Source column names it. */
export interface LogChannel {
  key: string;
  label: string;
}

/** A gateway whose logs are read, with the channels read on it (its own: the gateway's, and its own connectors'). */
export interface LogGateway extends GatewayRef {
  channels: LogChannel[];
}

/** How many lines each level / channel has in the window (the sidebar filters' counts). */
export interface LogCounts {
  levels: Record<string, number>;
  channels: Record<string, number>;
}

/** Lines read per channel per gateway and window. */
const LINES_PER_CHANNEL = 1000;
/** Gateways read at once. */
const CONCURRENCY = 6;
/** Lines pushed by the live feed are added to the table this often at most (a burst of them lands as one update). */
const PUSH_FLUSH_MS = 250;
/** Everything is reread this often regardless (a safety net: a websocket reconnect, or channels not pushed with many gateways). */
const REFRESH_INTERVAL_MS = 60000;
/** Up to this many gateways, every channel shown (connectors' and converters' too) is pushed live; past it, only the gateways' own. */
const WATCH_ALL_CHANNELS_UP_TO = 3;

/**
 * The gateways' remote logs for a window: each gateway's channels (`LOGS`,
 * `SERVICE_LOGS`, …, `<connector>_LOGS`, `<connector>_converter_LOGS`) read
 * over REST — a few gateways at a time, each only its own channels — every
 * line split into its level and message, newest first. Then a live feed: one
 * plain time-series websocket subscription per gateway on its channels (with
 * many gateways, their base channels), which ThingsBoard pushes every new
 * line to as it's saved; the lines go straight to the top of the table, no
 * read in between. Everything is reread once a minute regardless. (A widget
 * subscription would not do: a latest-value one reports only the newest line
 * per key, and a realtime time-series one makes ThingsBoard build an
 * aggregator per gateway and key, which froze the page with tens of
 * gateways. The plain subscription has neither.)
 *
 * Filtering by level and search happens here, on the loaded lines;
 * {@link countsChange} reports the lines per level / channel (for filters a
 * dashboard may show). `compact` is the side panels' narrower layout.
 */
@Component({
  selector: "tb-gm-logs",
  templateUrl: "./gateway-logs.component.html",
  styleUrls: ["./gateway-logs.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, DataTableCellDirective, DataTableComponent, StatusPillComponent, TimeframePickerComponent],
})
export class GatewayLogsComponent implements OnChanges, OnDestroy {
  @Input() ctx!: WidgetContext;
  @Input() gateways: LogGateway[] = [];
  /** The window ("1H" … "1W", see LOG_TIMEFRAMES) — or the picker's custom id while {@link range} is in use. */
  @Input() timeframe = "1H";
  /**
   * Offer a custom range: the picker gets its calendar segment, whose click is
   * passed on ({@link customClick}) for the dashboard to open its date-range
   * panel at; the range applied comes back as {@link range}, with the
   * {@link timeframe} set to the picker's custom id.
   */
  @Input() customRange = false;
  @Input() range: TbDateRange | null = null;
  /** The picker's calendar was clicked — emits that button (the date-range panel's anchor). */
  @Output() customClick = new EventEmitter<HTMLElement>();
  @Output() timeframeChange = new EventEmitter<string>();
  /** A window picker: above the table (the side panels), or in its header with {@link showHeader} (a page). */
  @Input() showTimeframePicker = false;
  /** The table's own header — its title and search (a page's table; the side panels' have none). */
  @Input() showHeader = false;
  /**
   * A title of its own over the table (a dialog's pane — "Logs"): the pickers
   * then sit in its row, at their own width at the right end, instead of
   * stretched above the table. Ignored with {@link showHeader}.
   */
  @Input() heading = "";
  /** The levels shown (filter ids: ERROR, WARNING, INFO, DEBUG; none = all) — a filter from outside; it overrides the level group's pick. */
  @Input() levels: LogLevelName[] = [];
  /** The level group above the table — "All | Error | Warning | Info | Debug", one level's lines alone (the window picker's look). */
  @Input() showLevelFilter = true;
  /** The table's search terms. */
  @Input() search: string[] = [];
  /** The header's own search box (off when a sidebar search feeds {@link search}). */
  @Input() searchEnabled = true;
  @Input() compact = false;
  /** The dashboard's root: on a phone the logs are the condensed list too (a line's level, time and source over its message). */
  private readonly root = inject(DashboardRootDirective, { optional: true });
  private readonly rootSub = this.root?.changes.subscribe(() => {
    this.columns = this.buildColumns();
    this.cd.markForCheck();
  });

  /** The condensed list: asked for ({@link compact}: a side panel's), or a phone's. */
  get narrow(): boolean {
    return this.compact || !!this.root?.phone;
  }
  @Input() fillHeight = true;
  @Output() countsChange = new EventEmitter<LogCounts>();

  readonly timeframeOptions: SegmentOption[] = LOG_TIMEFRAMES.map((t) => ({ id: t.id, label: t.id }));
  readonly levelMeta = LOG_LEVEL_META;
  /** The search keys: the message, the level and the source (and the gateway in the main view). */
  readonly searchKeys = ["message", "level", "source", "gatewayName"];
  columns: DataTableColumn[] = [];
  /** Every line in the window, newest first. */
  rows: GatewayLogRow[] = [];
  /** The lines in the Level filter. */
  visibleRows: GatewayLogRow[] = [];
  /** The level group: every line, or one level's (Error takes exceptions and criticals with it, Debug the traces). */
  readonly levelOptions: SegmentOption[] = [
    { id: "ALL", label: "All" },
    { id: "ERROR", label: "Error" },
    { id: "WARNING", label: "Warning" },
    { id: "INFO", label: "Info" },
    { id: "DEBUG", label: "Debug" },
  ];
  levelFilter = "ALL";
  loading = false;

  /** Each gateway's lines, by gateway id (a reread of one gateway replaces only its own). */
  private byGateway = new Map<string, GatewayLogRow[]>();
  private loadedSignature = "";
  private loadSeq = 0;
  /** The live feed: one push subscription per gateway on its channels. */
  private feeds: TelemetrySubscriber[] = [];
  private subscribedSignature = "";
  /** The newest line held per (gateway, key) — read or pushed: a pushed line not newer is one already shown. */
  private lastRead = new Map<string, number>();
  /** Lines pushed since the table last took them (it takes them every PUSH_FLUSH_MS at most). */
  private pending: GatewayLogRow[] = [];
  private flushTimer?: ReturnType<typeof setTimeout>;
  /** Tells pushed lines' row ids apart (two pushes can carry lines of the same time). */
  private pushSeq = 0;
  private intervalTimer?: any;

  constructor(
    private cd: ChangeDetectorRef,
    private destroyRef: DestroyRef
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["compact"] || changes["gateways"] || !this.columns.length) {
      this.columns = this.buildColumns();
    }
    if (changes["gateways"] || changes["timeframe"] || changes["range"] || changes["ctx"]) {
      this.reload();
      this.resubscribe();
    }
    if (changes["levels"]) {
      this.applyLevels();
    }
  }

  /** The table: its rows as searched (what {@link copyAll} copies). */
  @ViewChild(DataTableComponent) private table?: DataTableComponent;

  ngOnDestroy(): void {
    this.rootSub?.unsubscribe();
    clearTimeout(this.flushTimer);
    clearInterval(this.intervalTimer);
    clearTimeout(this.copiedTimer);
    clearTimeout(this.copiedAllTimer);
    this.removeFeeds();
  }

  /** The line just copied (its button shows a check mark and "Copied" for a moment). */
  copiedId: string | null = null;
  private copiedTimer?: ReturnType<typeof setTimeout>;

  /** A line's box clicked: the whole line to the clipboard — unless the click ended a text selection (a part of the message picked by hand). */
  copyLine(row: GatewayLogRow, event?: Event): void {
    event?.stopPropagation();
    if (window.getSelection()?.toString()) {
      return;
    }
    this.writeClipboard(row.raw || row.message, () => {
      this.copiedId = row.id;
      clearTimeout(this.copiedTimer);
      this.copiedTimer = setTimeout(() => {
        this.copiedId = null;
        this.cd.detectChanges();
      }, 1500);
      this.cd.detectChanges();
    });
  }

  /** Every line was just copied (the title row's copy button shows a check and "Copied" for a moment). */
  copiedAll = false;
  private copiedAllTimer?: ReturnType<typeof setTimeout>;

  /**
   * The title row's copy button: every line in the table — the level picked
   * and the search applied, all its pages, newest first — to the clipboard,
   * one per row, each as the gateway wrote it.
   */
  copyAll(): void {
    const rows = (this.table?.dataSource.filteredData as GatewayLogRow[] | undefined) ?? this.visibleRows;
    if (!rows.length) {
      return;
    }
    this.writeClipboard(rows.map((r) => r.raw || r.message).join("\n"), () => {
      this.copiedAll = true;
      clearTimeout(this.copiedAllTimer);
      this.copiedAllTimer = setTimeout(() => {
        this.copiedAll = false;
        this.cd.detectChanges();
      }, 1500);
      this.cd.detectChanges();
    });
  }

  /** Text to the clipboard, then `done` (the caller's "copied" mark). */
  private writeClipboard(text: string, done: () => void): void {
    const fallback = () => {
      // No clipboard API (an http origin): a hidden text area and the old copy command.
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand("copy");
        done();
      } finally {
        document.body.removeChild(area);
      }
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else {
      fallback();
    }
  }

  onTimeframe(id: string): void {
    this.timeframe = id;
    this.timeframeChange.emit(id);
    this.reload();
  }

  /** The custom range in use: the picker's custom id is selected and a range was applied. */
  private get customWindow(): TbDateRange | null {
    return this.timeframe === TB_CUSTOM_TIMEFRAME && this.range ? this.range : null;
  }

  private get windowMs(): number {
    return LOG_TIMEFRAMES.find((t) => t.id === this.timeframe)?.ms ?? LOG_TIMEFRAMES[0].ms;
  }

  private buildColumns(): DataTableColumn[] {
    if (this.narrow) {
      // A list (as the alarm list's): one cell per line — level, time and source over the wrapped message.
      return [{ key: "line", header: "" }];
    }
    const cols: DataTableColumn[] = [{ key: "time", header: "Time" }];
    if (this.gateways.length !== 1) {
      cols.push({ key: "gatewayName", header: "Gateway" });
    }
    cols.push({ key: "source", header: "Source" }, { key: "level", header: "Level" }, { key: "message", header: "Message", width: "100%" });
    return cols;
  }

  // -- reading ------------------------------------------------------------------------

  /** Reread everything when what's read changed (gateways, their channels, the window); a same list is left alone. */
  private reload(force = false): void {
    const window = this.customWindow ? `${this.customWindow.start}-${this.customWindow.end}` : this.timeframe;
    const signature = `${this.gateways.map((g) => `${g.id}:${g.channels.map((c) => c.key).join("+")}`).join(",")}|${window}`;
    if (!force && signature === this.loadedSignature) {
      return;
    }
    this.loadedSignature = signature;
    this.byGateway = new Map();
    this.lastRead = new Map();
    this.pending = [];
    clearTimeout(this.flushTimer);
    this.flushTimer = undefined;
    clearInterval(this.intervalTimer);
    if (!this.ctx || !this.gateways.length) {
      this.loading = false;
      this.publish();
      return;
    }
    this.intervalTimer = setInterval(() => this.read(this.gateways, false), REFRESH_INTERVAL_MS);
    this.read(this.gateways, true);
  }

  /** Read the given gateways' channels for the window (a few gateways at a time) and replace their lines. */
  private read(gateways: LogGateway[], showLoading: boolean): void {
    const seq = ++this.loadSeq;
    const signature = this.loadedSignature;
    // A custom range reads exactly that span; a window, the time up to now.
    const custom = this.customWindow;
    const end = custom ? custom.end : Date.now();
    const start = custom ? custom.start : end - this.windowMs;
    if (showLoading) {
      this.loading = true;
      this.cd.markForCheck();
    }
    from(gateways.filter((g) => g.channels.length))
      .pipe(
        mergeMap(
          (g) =>
            this.ctx.attributeService
              .getEntityTimeseries(
                { entityType: EntityType.DEVICE, id: g.id },
                g.channels.map((c) => c.key),
                start,
                end,
                LINES_PER_CHANNEL,
                AggregationType.NONE,
                undefined,
                DataSortOrder.DESC,
                true,
                QUIET_REQUEST
              )
              .pipe(
                map((data) => ({ gateway: g, data: (data ?? {}) as Record<string, { ts: number; value: unknown }[]> })),
                catchError(() => of({ gateway: g, data: {} as Record<string, { ts: number; value: unknown }[]> }))
              ),
          CONCURRENCY
        ),
        toArray(),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((results) => {
        if (seq !== this.loadSeq || signature !== this.loadedSignature) {
          return; // superseded by a newer read, or the scope changed meanwhile
        }
        this.takePending();
        for (const { gateway, data } of results) {
          // The read's lines, and those pushed while it was on its way that are newer than any it found.
          const newest = new Map(gateway.channels.map((c) => [c.key, (data[c.key] ?? []).reduce((max, p) => Math.max(max, Number(p.ts) || 0), 0)]));
          const later = (this.byGateway.get(gateway.id) ?? []).filter((r) => r.ts > (newest.get(r.key) ?? 0));
          this.byGateway.set(gateway.id, [...later, ...this.toRows(gateway, data)]);
          this.noteNewest(gateway, data);
        }
        this.loading = false;
        this.publish();
        this.cd.detectChanges();
      });
  }

  /** The newest line held on each of a gateway's channels: what the live feed's pushes are measured against. */
  private noteNewest(gateway: LogGateway, data: Record<string, { ts: number; value: unknown }[]>): void {
    for (const channel of gateway.channels) {
      const newest = (data[channel.key] ?? []).reduce((max, p) => Math.max(max, Number(p.ts) || 0), 0);
      const id = `${gateway.id}:${channel.key}`;
      if (newest > (this.lastRead.get(id) ?? 0)) {
        this.lastRead.set(id, newest);
      }
    }
  }

  /**
   * A push from a gateway's live feed: its lines newer than those already
   * held (the first push repeats each channel's newest line; a reconnect may
   * repeat more), queued for the table. A picked range is history — nothing
   * new lands in it.
   */
  private onPushed(gateway: LogGateway, update: SubscriptionUpdate): void {
    if (this.customWindow || !update?.data) {
      return;
    }
    const windowStart = Date.now() - this.windowMs;
    const fresh: Record<string, { ts: number; value: unknown }[]> = {};
    let hasNew = false;
    for (const c of gateway.channels) {
      const since = Math.max(this.lastRead.get(`${gateway.id}:${c.key}`) ?? 0, windowStart);
      const points = (update.data[c.key] ?? []).map((e) => ({ ts: Number(e[0]), value: e[1] as unknown })).filter((p) => p.ts > since);
      if (points.length) {
        fresh[c.key] = points;
        hasNew = true;
      }
    }
    if (!hasNew) {
      return;
    }
    this.noteNewest(gateway, fresh);
    this.pending.push(...this.toRows(gateway, fresh, `p${this.pushSeq++}-`));
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = undefined;
        if (this.takePending()) {
          this.publish();
          this.cd.detectChanges();
        }
      }, PUSH_FLUSH_MS);
    }
  }

  /** The pushed lines into their gateways' lines, at the top (those that have left the window drop off the bottom); whether there were any. */
  private takePending(): boolean {
    if (!this.pending.length) {
      return false;
    }
    const pushed = this.pending;
    this.pending = [];
    const windowStart = this.customWindow ? 0 : Date.now() - this.windowMs;
    const channels = new Map(this.gateways.map((g) => [g.id, g.channels.length]));
    for (const id of new Set(pushed.map((r) => r.gatewayId))) {
      const kept = (this.byGateway.get(id) ?? []).filter((r) => r.ts >= windowStart);
      const all = [...pushed.filter((r) => r.gatewayId === id), ...kept].sort((a, b) => b.ts - a.ts);
      this.byGateway.set(id, all.slice(0, LINES_PER_CHANNEL * (channels.get(id) ?? 1)));
    }
    return true;
  }

  /** A gateway's lines as table rows; `idTag` sets a push's apart from a read's. */
  private toRows(gateway: LogGateway, data: Record<string, { ts: number; value: unknown }[]>, idTag = ""): GatewayLogRow[] {
    const rows: GatewayLogRow[] = [];
    for (const channel of gateway.channels) {
      (data[channel.key] ?? []).forEach((p, i) => {
        const ts = Number(p.ts);
        const raw = String(p.value ?? "");
        if (!Number.isFinite(ts) || !raw) {
          return;
        }
        const { level, message } = parseLogLine(raw);
        rows.push({
          id: `${gateway.id}:${channel.key}:${ts}:${idTag}${i}`,
          ts,
          time: formatWhen(ts),
          gatewayId: gateway.id,
          gatewayName: gateway.name,
          key: channel.key,
          source: channel.label,
          level,
          message,
          raw,
        });
      });
    }
    return rows;
  }

  /** The table's rows from every gateway's lines, newest first; the counts to the dashboard. */
  private publish(): void {
    const rows: GatewayLogRow[] = [];
    for (const list of this.byGateway.values()) {
      rows.push(...list);
    }
    rows.sort((a, b) => b.ts - a.ts);
    this.rows = rows;
    this.applyLevels();
    this.emitCounts();
  }

  /** The level group's pick: that level's lines alone ("ALL": every line). */
  onLevelFilter(id: string): void {
    this.levelFilter = id;
    this.applyLevels();
  }

  private applyLevels(): void {
    const picked: string[] = this.levels.length ? this.levels : this.levelFilter === "ALL" ? [] : [this.levelFilter];
    const levels = new Set(picked);
    this.visibleRows = levels.size ? this.rows.filter((r) => levels.has(logLevelFilterId(r.level))) : this.rows;
  }

  /**
   * The lines per level / channel, for the dashboard's sidebar filters.
   * Emitted in a microtask: this runs from ngOnChanges too (a scope change
   * empties the rows), and the dashboard re-renders on the event — doing
   * that synchronously would re-enter the change detection that is still
   * setting this component's inputs.
   */
  private emitCounts(): void {
    const levels: Record<string, number> = {};
    const channels: Record<string, number> = {};
    for (const r of this.rows) {
      const l = logLevelFilterId(r.level);
      levels[l] = (levels[l] ?? 0) + 1;
      channels[r.key] = (channels[r.key] ?? 0) + 1;
    }
    Promise.resolve().then(() => this.countsChange.emit({ levels, channels }));
  }

  // -- live refresh ------------------------------------------------------------------------

  /**
   * The live feed: per gateway, a plain time-series websocket subscription on
   * its channels (with more than a few gateways, only their five base log keys
   * — not the connectors', whose number grows with the fleet). Without the
   * latest-telemetry scope ThingsBoard pushes every line saved on those keys,
   * not just the newest per key, with no aggregation on either side.
   */
  private resubscribe(): void {
    const baseKeys = new Set(GATEWAY_LOG_SOURCES.map((s) => s.key));
    const all = this.gateways.length <= WATCH_ALL_CHANNELS_UP_TO;
    const watched = this.gateways.map((g) => ({ gateway: g, keys: g.channels.map((c) => c.key).filter((k) => all || baseKeys.has(k)) })).filter((w) => w.keys.length);
    const signature = watched.map((w) => `${w.gateway.id}:${w.keys.join("+")}`).join(",");
    if (signature === this.subscribedSignature) {
      return;
    }
    this.subscribedSignature = signature;
    this.removeFeeds();
    if (!this.ctx?.telemetryWsService) {
      return;
    }
    for (const { gateway, keys } of watched) {
      const cmd = new TimeseriesSubscriptionCmd();
      cmd.entityType = EntityType.DEVICE;
      cmd.entityId = gateway.id;
      cmd.keys = keys.join(",");
      const feed = new TelemetrySubscriber(this.ctx.telemetryWsService, this.ctx.ngZone);
      feed.subscriptionCommands.push(cmd);
      feed.data$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((update) => this.onPushed(gateway, update));
      feed.subscribe();
      this.feeds.push(feed);
    }
  }

  private removeFeeds(): void {
    for (const feed of this.feeds) {
      feed.unsubscribe();
    }
    this.feeds = [];
  }
}
