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

import { DestroyRef } from "@angular/core";
import { Subject } from "rxjs";
import { WidgetContext } from "@home/models/widget-component.models";
import { saveUserSettings } from "../dashboard/dashboard-preferences";
import { TbDateRange } from "../date-range-picker/date-range-picker.component";
import { findDatePickerHost } from "../date-field/date-picker-host.component";
import { TB_CUSTOM_TIMEFRAME, TB_WINDOW_TIMEFRAMES, TB_WINDOW_TIMEFRAME_OPTIONS } from "../timeframe-picker/timeframe-picker.component";

const DAY = 24 * 3600 * 1000;
/** The windows' lengths by id (1D | 3D | 1W | 2W | 1M). */
const WINDOWS: Record<string, number> = Object.fromEntries(TB_WINDOW_TIMEFRAMES.map((t) => [t.id, t.ms]));
/** The cards' charts' height: as a panel's (200px), or large ("Large charts"). */
const CHART_HEIGHT = "200px";
const LARGE_CHART_HEIGHT = "320px";

/** How a page keeps its Time Machine view. */
export interface TimeMachineStateOptions {
  /**
   * The user settings' keys' prefix: "Large charts" kept as `<prefix>LargeCharts`, "Alarms on top" as `<prefix>AlarmsFirst`, the
   * window as `<prefix>Timeframe` (and a custom range as `<prefix>Range`) — QC Lab's "qcLab". The "Time Machine" switch itself is
   * never kept.
   */
  settingsPrefix: string;
  /** Something changed outside the page's own events (a range picked in the dashboard's calendar): the page's change detection. */
  changed?: () => void;
}

/**
 * A page's Time Machine view (`tb-time-machine-view`): its "Time Machine" switch, "Large charts", "Alarms on top", the window (1D |
 * 3D | 1W | 2W | 1M, or a custom range from the picker's calendar) and the picked time — what the view's timeline, its cards and
 * their charts and the page's device panel follow. The switch is never saved: off on every load (a reload, a new visit, an app opened
 * from Home) — the user turns it on each time; "Large charts", "Alarms on top" and the window are kept in the user's settings
 * (`restore` from the page's `readUserSettings`).
 *
 * ```ts
 * this.tm = new TimeMachineState(this.ctx, this.destroyRef, { settingsPrefix: "qcLab", changed: () => this.cd.detectChanges() });
 * readUserSettings(this.ctx, this.destroyRef, (settings) => { this.tm.restore(settings); … });
 * ```
 * ```html
 * <tb-time-machine-picker [machine]="tm"></tb-time-machine-picker>       <!-- under its search -->
 * <tb-time-machine-switches [machine]="tm"></tb-time-machine-switches>   <!-- under the picker, over the filters -->
 * <tb-time-machine-view *ngIf="tm.on && !phone" [machine]="tm" [ctx]="ctx" [devices]="tmDevices" [alarms]="alarms"
 *                       (deviceOpen)="openDevice($event)"></tb-time-machine-view>             <!-- in the list's place -->
 * ```
 */
export class TimeMachineState {
  /** The "Time Machine" switch: the view (a card a device and the timeline) in the page's list's place. Never saved. */
  on = false;
  /** "Large charts": two cards a row, their charts taller. */
  largeCharts = false;
  /** "Alarms on top": the devices with alarms active at the picked time (live: now) first, worst first. */
  alarmsFirst = false;
  /** The window: 1D | 3D | 1W | 2W | 1M, or "custom" ({@link range}). */
  timeframe = "1D";
  /** A custom range (the picker's calendar) — null unless {@link timeframe} is "custom". */
  range: TbDateRange | null = null;
  /** The timeline's picked time — every chart's pointer there (the cards', the page's device panel's); null: live. */
  time: number | null = null;
  readonly timeframeOptions = TB_WINDOW_TIMEFRAME_OPTIONS;
  /** The window changed (picked, or the user's settings restored): the view reads it afresh. */
  readonly windowChanges = new Subject<void>();

  /** The window or a view switch picked before the user's settings came in: theirs then doesn't overwrite them. */
  private picked = false;

  constructor(
    private readonly ctx: WidgetContext,
    private readonly destroyRef: DestroyRef,
    private readonly options: TimeMachineStateOptions
  ) {}

  /** A custom range in use (the calendar's). */
  get custom(): boolean {
    return this.timeframe === TB_CUSTOM_TIMEFRAME && !!this.range;
  }

  /** How far back the window reaches (ms). */
  get span(): number {
    return this.custom ? this.range!.end - this.range!.start : WINDOWS[this.timeframe] ?? DAY;
  }

  /** A custom range's end at the timeline's top; null — now (live). */
  get end(): number | null {
    return this.custom ? this.range!.end : null;
  }

  /** The cards' charts' height: 320px with "Large charts", else 200px. */
  get chartHeight(): string {
    return this.largeCharts ? LARGE_CHART_HEIGHT : CHART_HEIGHT;
  }

  /** The switch flipped: on, the view; off, the page's list again — the charts back to live. Never saved. */
  setOn(on: boolean): void {
    this.on = on;
    if (!on) {
      this.time = null;
    }
  }

  /** "Large charts" — kept in the user's settings. */
  setLargeCharts(on: boolean): void {
    this.picked = true;
    this.largeCharts = on;
    this.save({ LargeCharts: on });
  }

  /** "Alarms on top" — kept in the user's settings. */
  setAlarmsFirst(on: boolean): void {
    this.picked = true;
    this.alarmsFirst = on;
    this.save({ AlarmsFirst: on });
  }

  /** A window picked (1D … 1M): the view on it, read afresh, back to live — kept in the user's settings. */
  setTimeframe(tf: string): void {
    if (tf === this.timeframe || !WINDOWS[tf]) {
      return;
    }
    this.picked = true;
    this.timeframe = tf;
    this.range = null;
    this.windowChanged();
    this.save({ Timeframe: tf });
  }

  /** The picker's calendar: the dashboard's (`tb-date-picker-host`) under it — its click again closes it. */
  openRange(anchor: HTMLElement): void {
    findDatePickerHost(anchor)?.toggle(this, {
      anchor,
      mode: "range",
      range: this.range,
      future: false,
      min: null,
      applied: (range) => this.setRange(range),
    });
  }

  /** A range picked: the view on it (read as history — nothing live), kept in the user's settings. */
  setRange(range: TbDateRange): void {
    this.picked = true;
    this.timeframe = TB_CUSTOM_TIMEFRAME;
    this.range = range;
    this.windowChanged();
    this.save({ Timeframe: TB_CUSTOM_TIMEFRAME, Range: range });
    this.options.changed?.();
  }

  /** The timeline's marker moved (null: back to live). */
  pick(time: number | null): void {
    this.time = time;
  }

  /** The user's settings in (the page's `readUserSettings`): the view switches and the window as they left them, unless picked meanwhile. */
  restore(settings: Record<string, any>): void {
    if (this.picked) {
      return;
    }
    const prefix = this.options.settingsPrefix;
    this.largeCharts = settings[`${prefix}LargeCharts`] === true;
    this.alarmsFirst = settings[`${prefix}AlarmsFirst`] === true;
    const saved = settings[`${prefix}Timeframe`];
    const range = settings[`${prefix}Range`] as TbDateRange | undefined;
    const savedRange = saved === TB_CUSTOM_TIMEFRAME && range && range.end > range.start ? range : null;
    const timeframe = savedRange ? TB_CUSTOM_TIMEFRAME : WINDOWS[saved] ? saved : "1D";
    if (timeframe !== this.timeframe || savedRange?.start !== this.range?.start || savedRange?.end !== this.range?.end) {
      this.timeframe = timeframe;
      this.range = savedRange;
      this.windowChanged();
    }
  }

  /** A new window: the picked time back to live, the view reads it afresh. */
  private windowChanged(): void {
    this.time = null;
    this.windowChanges.next();
  }

  private save(values: Record<string, unknown>): void {
    const prefix = this.options.settingsPrefix;
    saveUserSettings(this.ctx, this.destroyRef, Object.fromEntries(Object.entries(values).map(([k, v]) => [`${prefix}${k}`, v])));
  }
}
