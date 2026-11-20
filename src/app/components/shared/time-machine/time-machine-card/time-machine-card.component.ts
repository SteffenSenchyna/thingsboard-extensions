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

import { ChangeDetectorRef, Component, DestroyRef, EventEmitter, HostBinding, Input, OnChanges, Output, SimpleChanges, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { WidgetContext } from "@home/models/widget-component.models";
import { CountMarkComponent } from "../../count-mark/count-mark.component";
import { MetricChartCardComponent, MetricChartSection } from "../../metric-chart-card/metric-chart-card.component";
import { TipDirective } from "../../tip/tip.directive";
import { StatusPillComponent } from "../../status-pill/status-pill.component";
import { ChartStripRun, stripRunAt } from "../../line-chart/chart-strip";
import type { TimeMachineDevice, TimeMachineStatus } from "../time-machine-events";

/** A chart's title row over its plot (px): a placeholder's height is the chart's and this. */
const CHART_TITLE_PX = 24;

/**
 * A device's card in a Time Machine view (`tb-time-machine-view`): its name — a click opens its panel (`deviceOpen`) — over its detail and
 * its site ("Richmond Lab (4R20)"), its alarm count at the picked time (its `tbTip` an alarm a line), then its charts over the window
 * (`tb-metric-chart-card [shell]="false"`: its readings in each chart's title row, `[inlineReadout]`; the view's cards one
 * `syncGroup`; the picked time their pointer). Its charts are made once it's `mounted` (scrolled into view — the view watches); till
 * then, and as a `wireframe` (a list still read), their places.
 */
@Component({
  selector: "tb-time-machine-card",
  templateUrl: "./time-machine-card.component.html",
  styleUrls: ["./time-machine-card.component.scss"],
  standalone: true,
  imports: [CommonModule, CountMarkComponent, MetricChartCardComponent, TipDirective, StatusPillComponent],
})
export class TimeMachineCardComponent implements OnChanges {
  @Input() ctx!: WidgetContext;
  @Input() device: TimeMachineDevice | null = null;
  /** Its charts (the view keeps the same array while their content holds — a new one redraws them). */
  @Input() charts: MetricChartSection[] = [];
  /** Its charts made (it has come into view): their reads start then. */
  @Input() mounted = false;
  /** A placeholder card (the list still read): its parts' places. */
  @Input() wireframe = false;
  /** The window: its charts' (`tb-metric-chart-card`'s timeframe, and a custom range read as history). */
  @Input() timeframe = "1D";
  @Input() range: { start: number; end: number } | null = null;
  @Input() chartHeight = "200px";
  /** The view's cards' hover group. */
  @Input() syncGroup = "";
  /** The picked time — its charts' pointer; null: live. */
  @Input() time: number | null = null;
  /** `false`: hovering its charts moves nothing — the timeline alone scrubs them (the Time Machine open). */
  @Input() hoverable = false;
  @Input() dark = false;
  /** Its alarms active at the picked time (live: now), and its bubble naming them, a line each. */
  @Input() alarmCount = 0;
  @Input() alarmTip = "";
  /** Its name clicked: its panel. */
  @Output() deviceOpen = new EventEmitter<TimeMachineDevice>();

  /**
   * The pill beside its name: its state — live, the device's own (`TimeMachineDevice.status`, its list's pill); at a picked time,
   * its charts' state bar's state then (its run there; past the bar's last read, the live one). None: no pill.
   */
  status: TimeMachineStatus | null = null;
  /** Its charts' state bar's runs, as read (`tb-metric-chart-card (stateRunsChange)`). */
  private stateRuns: ChartStripRun[] | null = null;
  private destroyed = false;
  private readonly cd = inject(ChangeDetectorRef);

  constructor() {
    inject(DestroyRef).onDestroy(() => (this.destroyed = true));
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["device"] || changes["time"]) {
      this.status = this.statusAt(this.time);
    }
  }

  /** The bar's runs read: the pill follows — after this check (they arrive while its charts are checked). */
  onStateRuns(runs: ChartStripRun[] | null): void {
    queueMicrotask(() => {
      if (this.destroyed) {
        return;
      }
      this.stateRuns = runs;
      this.status = this.statusAt(this.time);
      this.cd.detectChanges();
    });
  }

  private statusAt(time: number | null): TimeMachineStatus | null {
    const live = this.device?.status ?? null;
    if (time == null || !this.stateRuns?.length) {
      return time == null ? live : null;
    }
    const run = stripRunAt(this.stateRuns, time);
    if (run) {
      return run.label === this.status?.label && run.tone === this.status?.tone ? this.status : { label: run.label, tone: run.tone, icon: run.icon };
    }
    // Past the bar's last read (its last few minutes): the state now.
    return time >= this.stateRuns[this.stateRuns.length - 1].end ? live : null;
  }

  /** A placeholder: its parts closer, hidden from assistive tech. */
  @HostBinding("class.tmc-wireframe")
  @HostBinding("attr.aria-hidden")
  get placeholder(): boolean | null {
    return this.wireframe || !this.device ? true : null;
  }

  /** A placeholder's height: a chart's title row and its plot. */
  get plotHeight(): string {
    return `calc(${this.chartHeight} + ${CHART_TITLE_PX}px)`;
  }

  /** Its detail shown — not when it's its name. */
  get detail(): string {
    const d = this.device;
    return d?.detail && d.detail !== d.name ? d.detail : "";
  }

  /** One placeholder a chart (one while a wireframe). */
  get plots(): unknown[] {
    return this.wireframe ? [0] : this.charts;
  }
}
