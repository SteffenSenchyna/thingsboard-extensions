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

import { ChangeDetectorRef, Component, DestroyRef, EventEmitter, HostBinding, Input, OnChanges, OnDestroy, Output, SimpleChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { WidgetSubscriptionOptions } from "@core/public-api";
import {
  AggregationType,
  AliasFilterType,
  DataKeyType,
  Datasource,
  DatasourceType,
  EntityFilter,
  EntityType,
  RealtimeWindowType,
  SharedModule,
  Timewindow,
  TimewindowType,
  widgetType,
} from "@shared/public-api";
import { WidgetContext } from "@home/models/widget-component.models";
import { TimeframePickerComponent } from "../timeframe-picker/timeframe-picker.component";
import { InfoIconComponent } from "../info-icon/info-icon.component";
import { formatClockTime, formatDuration, formatShortDate } from "../time-format";
import { removeSubscriptions } from "../dashboard/dashboard-subscriptions";
import { RecentReads } from "../recent-reads";

/** A device's reports of a state key over a window, as last read — kept a couple of minutes across the cards (a panel opened again). */
const STATE_READS = new RecentReads<{ points: { ts: number; state: string }[]; start: number; end: number }>();

/** One value the state key can take, with its label and colour. */
export interface StateTimelineState {
  id: string;
  label: string;
  /** Fill colour of this state's segments — a `--c-*` token, e.g. `var(--c-bg-success-normal)`. */
  color: string;
}

/** A run of equal state along the track. */
interface StateSegment {
  state: StateTimelineState;
  start: number;
  end: number;
  /** Position along the track, in % of the window. */
  left: number;
  width: number;
  /** How long it lasted ("1h 23m"): its bubble's, after its state. */
  duration: string;
}

/**
 * State timeline card (Grafana-style): one horizontal track over the selected
 * window — 1D | 1W | 1M — split into runs of equal state, each in that
 * state's colour, with a hover tooltip naming the state, a time axis and a legend.
 * Styled like the battery card: title + current state, track, foot line.
 *
 * ```html
 * <tb-state-timeline [ctx]="ctx" [deviceId]="id" key="state" [states]="states" [(timeframe)]="tf"></tb-state-timeline>
 * ```
 */
@Component({
  selector: "tb-state-timeline",
  templateUrl: "./state-timeline.component.html",
  styleUrls: ["./state-timeline.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, TimeframePickerComponent, InfoIconComponent],
})
export class StateTimelineComponent implements OnChanges, OnDestroy {
  /** Never let the browser's native tooltip show on the host. */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;

  @Input() ctx!: WidgetContext;
  @Input() deviceId: string | null = null;
  @Input() title = "State";
  /** Short hint behind an info icon next to the title (what the state means / where it comes from). */
  @Input() titleInfo = "";
  /** Telemetry key holding the state (a string value). */
  @Input() key = "state";
  @Input() states: StateTimelineState[] = [];
  /** The latest state (shown top-right); from the host's live row, so it needs no history. */
  @Input() current: string | null = null;
  /** Shown in the foot line ("Updated 5s ago"). */
  @Input() note = "";
  @Input() timeframe = "1D";
  @Output() timeframeChange = new EventEmitter<string>();
  /** Hide the 1D | 1W | 1M picker (the window is then fixed by `timeframe`). */
  @Input() showTimeframePicker = true;
  /** Hide the legend under the track (when the colours are already explained elsewhere, e.g. by status pills). */
  @Input() showLegend = true;
  /** Show the state's label on hovering a run (off when the colours need no naming, e.g. a plain OK / fault track). */
  @Input() showSegmentTips = true;
  /** Map a raw telemetry value to a state id — for keys stored as labels, codes or mixed. Identity by default. */
  @Input() resolve: (raw: string) => string | null = (raw) => raw;
  /**
   * How long a report is trusted: a state lasts until the next report or this
   * long after it, whichever comes first, so a device that goes silent (or has
   * stopped reporting) shows a gap rather than its last state stretched to now.
   */
  @Input() staleAfterMs = 60 * 60 * 1000;

  segments: StateSegment[] = [];
  /** Axis labels under the track, on round hours / days; `bold` marks a day change. */
  ticks: { left: number; label: string; bold: boolean }[] = [];
  windowStart = 0;
  windowEnd = 0;
  loading = false;
  hovered: StateSegment | null = null;

  private subscription?: any;
  private appliedTimeframe = "";
  private readonly windowByTf: Record<string, number> = {
    "1D": 24 * 60 * 60 * 1000,
    "1W": 7 * 24 * 60 * 60 * 1000,
    "1M": 30 * 24 * 60 * 60 * 1000,
  };

  constructor(private cd: ChangeDetectorRef, private destroyRef: DestroyRef) {}

  get currentState(): StateTimelineState | null {
    return this.states.find((s) => s.id === this.current) ?? null;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["timeframe"] && !changes["timeframe"].firstChange && !changes["deviceId"]) {
      this.applyTimeframe();
    }
    if (changes["deviceId"]) {
      if (this.deviceId) {
        this.open(this.deviceId);
      } else {
        this.teardown();
      }
    }
  }

  ngOnDestroy(): void {
    this.teardown();
  }

  setTimeframe(tf: string): void {
    if (this.timeframe === tf) {
      return;
    }
    this.timeframe = tf;
    this.applyTimeframe();
    this.timeframeChange.emit(tf);
  }

  trackBySegment(_: number, seg: StateSegment): number {
    return seg.start;
  }

  private applyTimeframe(): void {
    if (this.appliedTimeframe === this.timeframe) {
      return;
    }
    this.appliedTimeframe = this.timeframe;
    this.setComputedWindow();
    this.segments = [];
    this.loading = true;
    this.showRecent();
    if (this.subscription) {
      this.subscription.updateTimewindowConfig(this.buildTimewindow());
    }
  }

  /** What its reads are kept under: the device, the key and the window. */
  private get readKey(): string {
    return `${this.deviceId}:${this.key}:${this.timeframe}`;
  }

  /** This device's reports over the window as read in the last couple of minutes: their runs at once (the subscription follows). */
  private showRecent(): void {
    const recent = this.deviceId ? STATE_READS.get(this.readKey) : undefined;
    if (recent) {
      this.windowStart = recent.start;
      this.windowEnd = recent.end;
      this.buildRuns(recent.points);
    }
  }

  private open(deviceId: string): void {
    this.appliedTimeframe = this.timeframe;
    this.setComputedWindow();
    this.segments = [];
    this.loading = true;
    this.removeSubscription();
    this.showRecent();
    const datasources: Datasource[] = [
      {
        type: DatasourceType.entity,
        name: "state-timeline",
        entityFilter: { type: AliasFilterType.singleEntity, singleEntity: { entityType: EntityType.DEVICE, id: deviceId } } as EntityFilter,
        dataKeys: [{ name: this.key, label: this.key, type: DataKeyType.timeseries, settings: {} }],
      },
    ];
    const options: WidgetSubscriptionOptions = {
      type: widgetType.timeseries,
      datasources,
      singleEntity: true,
      useDashboardTimewindow: false,
      timeWindowConfig: this.buildTimewindow(),
      ignoreDataUpdateOnIntervalTick: true,
      callbacks: { onDataUpdated: (subscription) => this.onUpdated(subscription) },
    };
    this.ctx.subscriptionApi
      .createSubscription(options, true)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((subscription) => (this.subscription = subscription));
  }

  /** Collapse the raw points into runs of equal state across the window. */
  private onUpdated(subscription: any): void {
    const data: any[] = subscription?.data ?? [];
    const points: { ts: number; state: string }[] = ((data.find((d) => d.dataKey?.name === this.key)?.data as any[]) || [])
      .map((p: any[]) => ({ ts: Number(p[0]), state: String(p[1]) }))
      .filter((p) => isFinite(p.ts))
      .sort((a, b) => a.ts - b.ts);
    const tw = subscription?.timeWindow;
    if (tw?.minTime && tw?.maxTime) {
      this.windowStart = tw.minTime;
      this.windowEnd = tw.maxTime;
    } else {
      this.setComputedWindow();
    }
    if (!points.length) {
      return; // first (empty) emission — keep waiting for data
    }
    STATE_READS.set(this.readKey, { points, start: this.windowStart, end: this.windowEnd });
    this.buildRuns(points);
    this.cd.detectChanges();
  }

  /** The runs of equal state across the window from its reports (sorted by time), the axis' ticks — loaded. */
  private buildRuns(points: readonly { ts: number; state: string }[]): void {
    const span = Math.max(1, this.windowEnd - this.windowStart);
    const runs: StateSegment[] = [];
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const id = this.resolve(p.state);
      const state = id == null ? undefined : this.states.find((s) => s.id === id);
      if (!state) {
        continue; // unknown values leave a gap
      }
      // A run lasts until the next point (or "now" for the last one), but no
      // longer than `staleAfterMs` — silence beyond that is a gap.
      const next = i + 1 < points.length ? points[i + 1].ts : this.windowEnd;
      const end = Math.min(next, p.ts + this.staleAfterMs);
      const last = runs[runs.length - 1];
      if (last && last.state === state && last.end === p.ts) {
        last.end = end; // same state continues — extend the run
      } else {
        runs.push({ state, start: Math.max(p.ts, this.windowStart), end, left: 0, width: 0, duration: "" });
      }
    }
    for (const r of runs) {
      r.duration = formatDuration(r.end - r.start);
      r.left = ((r.start - this.windowStart) / span) * 100;
      r.width = Math.max(0.15, ((r.end - r.start) / span) * 100);
    }
    this.segments = runs;
    this.ticks = this.buildTicks();
    this.loading = false;
  }

  /**
   * Axis ticks on round local times, Home Assistant style: every 4 h on the
   * hour for a day (midnight shown as the bold date), every day for a week,
   * every 5 days for a month. Ticks hugging the window edges are dropped.
   */
  private buildTicks(): { left: number; label: string; bold: boolean }[] {
    const span = this.windowEnd - this.windowStart;
    if (span <= 0) {
      return [];
    }
    const hour = 60 * 60 * 1000;
    const day = 24 * hour;
    const hourly = span <= day + 1000;
    const stepHours = hourly ? 4 : span <= 7 * day + 1000 ? 24 : 24 * 5;
    const ticks: { left: number; label: string; bold: boolean }[] = [];
    // Walk from the first local midnight before the window in `stepHours` steps
    // (built from the date so DST changes don't drift the hour).
    const start = new Date(this.windowStart);
    start.setHours(0, 0, 0, 0);
    for (let i = 0; ; i++) {
      const t = new Date(start);
      t.setHours(i * stepHours);
      const ts = t.getTime();
      if (ts > this.windowEnd) {
        break;
      }
      const left = ((ts - this.windowStart) / span) * 100;
      if (left < 3 || left > 97) {
        continue; // too close to an edge to label cleanly
      }
      const midnight = t.getHours() === 0;
      ticks.push({ left, label: hourly && !midnight ? formatClockTime(ts, true) : formatShortDate(ts), bold: midnight });
    }
    return ticks;
  }

  private setComputedWindow(): void {
    const windowMs = this.windowByTf[this.timeframe] ?? this.windowByTf["1W"];
    this.windowEnd = Date.now();
    this.windowStart = this.windowEnd - windowMs;
    this.ticks = this.buildTicks();
  }

  private buildTimewindow(): Timewindow {
    const windowMs = this.windowByTf[this.timeframe] ?? this.windowByTf["1W"];
    return {
      selectedTab: TimewindowType.REALTIME,
      realtime: { realtimeType: RealtimeWindowType.LAST_INTERVAL, timewindowMs: windowMs },
      aggregation: { type: AggregationType.NONE, limit: 50000 },
    };
  }

  private removeSubscription(): void {
    removeSubscriptions(this.ctx, this.subscription);
    this.subscription = undefined;
  }

  private teardown(): void {
    this.removeSubscription();
    this.segments = [];
    this.loading = false;
  }
}
