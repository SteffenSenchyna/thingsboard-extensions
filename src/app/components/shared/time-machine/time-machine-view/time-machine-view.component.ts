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

import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  QueryList,
  SimpleChanges,
  ViewChild,
  ViewChildren,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { SharedModule } from "@shared/public-api";
import { WidgetContext } from "@home/models/widget-component.models";
import { DashboardAlarm, alarmSeverityRank } from "../../dashboard/dashboard-alarms";
import type { MetricChartSection } from "../../metric-chart-card/metric-chart-card.component";
import { TimeMachineComponent } from "../time-machine.component";
import { TimeMachineCardComponent } from "../time-machine-card/time-machine-card.component";
import { TimeMachineDevice, TimeMachineEvents, alarmLinesTip, alarmsActiveAt } from "../time-machine-events";
import { TimeMachineState } from "../time-machine-state";

/** Each view's cards share one hover group of their own. */
let viewSeq = 0;

/** The alarms active at the picked time, by device — and what they were worked out from. */
interface AlarmsAt {
  time: number | null;
  live: readonly DashboardAlarm[];
  read: readonly DashboardAlarm[];
  byDevice: Map<string, DashboardAlarm[]>;
  tips: Map<string, string>;
}

/**
 * A page's Time Machine view (as UniFi's), in its list's place while its "Time Machine" switch is on (`TimeMachineState`): the
 * timeline (`tb-time-machine`) at its left, on the page's canvas, spanning the window — and a card a device (`tb-time-machine-card`:
 * its name opening its panel, `deviceOpen`; its detail and site; its alarms at the picked time; its charts over the window, made as
 * it scrolls into view, every card's one hover group, `[inlineReadout]`, not hoverable — the timeline alone scrubs them). "Large
 * charts": two cards a row (one when narrower than two 360px cards), their charts 320px. "Alarms on top": the devices with alarms
 * active at the picked time first, worst first. It reads its devices' events itself (`TimeMachineEvents`: their alarms in the window
 * and their offline stretches, again every few minutes; the alarms raised meanwhile from the page's live subscription, `alarms`) —
 * `[offlineSpans]="false"`: an offline stretch its "Offline" mark alone, no hatched run on the track (Aria's belt scales).
 *
 * ```html
 * <tb-time-machine-view *ngIf="tm.on && !phone" [machine]="tm" [ctx]="ctx" [devices]="tmDevices" [alarms]="alarms" [loading]="loading"
 *                       [dark]="darkMode" emptyIcon="device_thermostat" emptyText="No temperature probes found"
 *                       (deviceOpen)="openDevice($event)"></tb-time-machine-view>
 * ```
 */
@Component({
  selector: "tb-time-machine-view",
  templateUrl: "./time-machine-view.component.html",
  styleUrls: ["./time-machine-view.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, TimeMachineComponent, TimeMachineCardComponent],
})
export class TimeMachineViewComponent implements OnInit, OnChanges, AfterViewInit, OnDestroy {
  @Input() ctx!: WidgetContext;
  /** The page's switch, window, view switches and picked time. */
  @Input() machine!: TimeMachineState;
  /** The devices shown — a card each, in this order — and whose events the timeline shows. */
  @Input() devices: readonly TimeMachineDevice[] = [];
  /** The page's live alarm subscription's (active now): the cards' counts now, and those raised since the window was read. */
  @Input() alarms: readonly DashboardAlarm[] = [];
  /** The devices are still read: placeholder cards, the timeline wireframed — its reads wait for them. */
  @Input() loading = false;
  @Input() dark = false;
  /** No device shown: the list's empty look. */
  @Input() emptyIcon = "sensors";
  @Input() emptyText = "No devices found";
  /** The devices' offline stretches as hatched runs on the timeline's track too (their "Offline" marks always); false — the marks alone. */
  @Input() offlineSpans = true;
  /** A card's name clicked: its device's panel. */
  @Output() deviceOpen = new EventEmitter<TimeMachineDevice>();

  /** The devices' events (the timeline's marks). */
  reader!: TimeMachineEvents;
  /** Placeholder cards while the devices are read: a few. */
  readonly wireframes = [0, 1, 2, 3];
  readonly syncGroup = `tmv-cards-${++viewSeq}`;

  @ViewChild("cardsBox", { static: true }) private cardsBox!: ElementRef<HTMLElement>;
  @ViewChildren(TimeMachineCardComponent, { read: ElementRef }) private cardEls?: QueryList<ElementRef<HTMLElement>>;
  /** The cards whose charts are made: scrolled into view once (their reads start then), kept while the view shows. */
  private readonly mounted = new Set<string>();
  private observer?: IntersectionObserver;
  private started = false;
  /** Each device's charts, kept while their content holds (a new array redraws them). */
  private charts = new Map<string, { source: MetricChartSection[]; key: string; charts: MetricChartSection[] }>();
  private alarmsMemo: AlarmsAt | null = null;
  private orderMemo: { devices: readonly TimeMachineDevice[]; byDevice: Map<string, DashboardAlarm[]> | null; shown: readonly TimeMachineDevice[] } | null =
    null;

  constructor(
    private readonly cd: ChangeDetectorRef,
    private readonly destroyRef: DestroyRef
  ) {}

  ngOnInit(): void {
    this.reader = new TimeMachineEvents(this.ctx, this.destroyRef, () => this.cd.detectChanges());
    this.reader.setOfflineSpans(this.offlineSpans);
    // A new window (picked, or the user's settings restored): read afresh.
    this.machine.windowChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (this.started) {
        this.reader.setWindow(this.machine.span, this.machine.end);
      }
    });
    this.sync();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["devices"]) {
      this.keepCharts();
    }
    if (this.reader && changes["offlineSpans"]) {
      this.reader.setOfflineSpans(this.offlineSpans);
    }
    if (this.reader) {
      this.sync();
    }
  }

  ngAfterViewInit(): void {
    if (typeof IntersectionObserver !== "undefined") {
      this.observer = new IntersectionObserver((entries) => this.onInView(entries), { root: this.cardsBox.nativeElement, rootMargin: "240px 0px" });
      this.observeCards();
    }
    // The cards come and go with the page's filters: each new one watched for coming into view.
    this.cardEls?.changes.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.observeCards());
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.reader?.stop();
    // The view gone (its switch off, a phone): every chart back to live — the page's device panel's too.
    this.machine?.pick(null);
  }

  /** The cards in their order: the page's — "Alarms on top", those with alarms active at the picked time first, worst first. */
  get shownDevices(): readonly TimeMachineDevice[] {
    const byDevice = this.machine.alarmsFirst ? this.alarmsAt.byDevice : null;
    const memo = this.orderMemo;
    if (memo && memo.devices === this.devices && memo.byDevice === byDevice) {
      return memo.shown;
    }
    const shown = byDevice ? alarmsFirst(this.devices, byDevice) : this.devices;
    this.orderMemo = { devices: this.devices, byDevice, shown };
    return shown;
  }

  /** A card's charts: the same array while their content holds. */
  chartsOf(device: TimeMachineDevice): MetricChartSection[] {
    return this.charts.get(device.id)?.charts ?? device.charts;
  }

  /** A card's charts are made (it has come into view — or nothing can tell). */
  isMounted(device: TimeMachineDevice): boolean {
    return !this.observer || this.mounted.has(device.id);
  }

  /** A card's alarm count: those active at the picked time — live, now's. */
  alarmCount(device: TimeMachineDevice): number {
    return this.alarmsAt.byDevice.get(device.id)?.length ?? 0;
  }

  /** Its alarm icon's bubble: each of those alarms on a line — "Channel 1 Temperature Alarm · Critical · Today 9:42 AM". */
  alarmTip(device: TimeMachineDevice): string {
    return this.alarmsAt.tips.get(device.id) ?? "";
  }

  trackById(_: number, device: TimeMachineDevice): string {
    return device.id;
  }

  /** Each device's alarms active at the picked time, worked out again when the time, the live alarms or the window's read change. */
  private get alarmsAt(): AlarmsAt {
    const time = this.machine.time;
    const live = this.alarms;
    const read = this.reader?.windowAlarms ?? [];
    const memo = this.alarmsMemo;
    if (memo && memo.time === time && memo.live === live && memo.read === read) {
      return memo;
    }
    const byDevice = alarmsActiveAt(read, live, time);
    const tips = new Map<string, string>();
    byDevice.forEach((list, id) => tips.set(id, alarmLinesTip(list)));
    this.alarmsMemo = { time, live, read, byDevice, tips };
    return this.alarmsMemo;
  }

  /** The devices and the live alarms to the reader — once the devices are in; the first time, its window too (its reads start). */
  private sync(): void {
    if (this.loading) {
      return;
    }
    this.reader.setDevices(this.devices, this.alarms);
    if (!this.started) {
      this.started = true;
      this.reader.setWindow(this.machine.span, this.machine.end);
    }
  }

  /** Each device's charts: kept while their content is the same (a page may build them afresh on every change). */
  private keepCharts(): void {
    const next = new Map<string, { source: MetricChartSection[]; key: string; charts: MetricChartSection[] }>();
    for (const d of this.devices) {
      const kept = this.charts.get(d.id);
      if (kept?.source === d.charts) {
        next.set(d.id, kept);
        continue;
      }
      const key = JSON.stringify(d.charts);
      next.set(d.id, { source: d.charts, key, charts: kept?.key === key ? kept.charts : d.charts });
    }
    this.charts = next;
  }

  /** Watch the cards there now: a card's charts are made as it comes into view. */
  private observeCards(): void {
    const observer = this.observer;
    if (!observer) {
      return;
    }
    observer.disconnect();
    this.cardEls?.forEach((ref) => observer.observe(ref.nativeElement));
  }

  private onInView(entries: IntersectionObserverEntry[]): void {
    let added = false;
    for (const entry of entries) {
      const id = (entry.target as HTMLElement).dataset["device"];
      if (entry.isIntersecting && id && !this.mounted.has(id)) {
        this.mounted.add(id);
        added = true;
      }
    }
    if (added) {
      this.cd.detectChanges();
    }
  }
}

/** The devices with active alarms first — the worst severity first, then the most alarms — the rest in their order. */
function alarmsFirst(devices: readonly TimeMachineDevice[], byDevice: Map<string, DashboardAlarm[]>): readonly TimeMachineDevice[] {
  const worst = (d: TimeMachineDevice) => {
    const list = byDevice.get(d.id);
    return list?.length ? alarmSeverityRank(list[0].severity) + 1 : 0;
  };
  return devices
    .map((d, i) => ({ d, i, worst: worst(d), count: byDevice.get(d.id)?.length ?? 0 }))
    .sort((a, b) => b.worst - a.worst || b.count - a.count || a.i - b.i)
    .map((x) => x.d);
}
