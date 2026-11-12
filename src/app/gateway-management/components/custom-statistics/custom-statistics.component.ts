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

import { ChangeDetectorRef, Component, DestroyRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges } from "@angular/core";
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
import { CardComponent } from "../../../components/shared/card/card.component";
import { CollapsibleCardComponent } from "../../../components/shared/collapsible-card/collapsible-card.component";
import { CopyBoxComponent } from "../../../components/shared/copy-box/copy-box.component";
import { DataTableCellDirective, DataTableColumn, DataTableComponent } from "../../../components/shared/data-table/data-table.component";
import { LineChartComponent, LineChartSeries } from "../../../components/shared/line-chart/line-chart.component";
import { SegmentOption } from "../../../components/shared/segmented-control/segmented-control.component";
import { SelectComponent, TbSelectOption } from "../../../components/shared/select/select.component";
import { TimeframePickerComponent } from "../../../components/shared/timeframe-picker/timeframe-picker.component";
import { TrendPoint } from "../../../components/shared/trend-chart/trend-chart.component";
import { GatewayConfigCommand, STATS_TIMEFRAMES } from "../../models/gateway-management.models";
import { formatWhen } from "../../../components/shared/time-format";
import { removeSubscriptions } from "../../../components/shared/dashboard/dashboard-subscriptions";

/**
 * A gateway's custom statistics: the commands its configuration runs on a
 * schedule (`general_configuration.statistics.commands`), each reported as a
 * time series named by the command. Pick one to see its output over a window
 * — a chart when the values are numbers, a table otherwise. Commands are
 * added in the gateway's Settings tab (Statistics).
 */
@Component({
  selector: "tb-gm-custom-statistics",
  templateUrl: "./custom-statistics.component.html",
  styleUrls: ["./custom-statistics.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, CardComponent, CollapsibleCardComponent, CopyBoxComponent, DataTableCellDirective, DataTableComponent, LineChartComponent, SelectComponent, TimeframePickerComponent],
})
export class CustomStatisticsComponent implements OnChanges, OnDestroy {
  @Input() ctx!: WidgetContext;
  @Input() gatewayId = "";
  @Input() commands: GatewayConfigCommand[] = [];
  @Input() dark = false;
  /** "Go to Settings" (the dashboard opens the gateway's Settings tab). */
  @Output() configure = new EventEmitter<void>();

  readonly timeframeOptions: SegmentOption[] = STATS_TIMEFRAMES.map((t) => ({ id: t.id, label: t.id }));
  readonly valueColumns: DataTableColumn[] = [
    { key: "time", header: "Time" },
    { key: "value", header: "Value", truncate: true },
  ];
  commandOptions: TbSelectOption[] = [];
  /** The selected command's time-series key. */
  selected = "";
  timeframe = "1D";
  loading = false;
  numeric = true;
  series: LineChartSeries[] = [];
  valueRows: { id: string; time: string; value: string }[] = [];

  private subscription: any;
  private signature = "";

  constructor(private cd: ChangeDetectorRef, private destroyRef: DestroyRef) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["commands"] || changes["gatewayId"]) {
      this.commandOptions = this.commands.map((c) => ({ value: c.attributeOnGateway, label: c.attributeOnGateway }));
      if (!this.commands.some((c) => c.attributeOnGateway === this.selected)) {
        this.selected = this.commands[0]?.attributeOnGateway ?? "";
      }
    }
    this.resubscribe();
  }

  ngOnDestroy(): void {
    this.removeSubscription();
  }

  get command(): GatewayConfigCommand | null {
    return this.commands.find((c) => c.attributeOnGateway === this.selected) ?? null;
  }

  onSelect(key: string | null): void {
    this.selected = key ?? "";
    this.resubscribe();
  }

  onTimeframe(id: string): void {
    this.timeframe = id;
    this.resubscribe();
  }

  private resubscribe(): void {
    const signature = `${this.gatewayId}|${this.selected}|${this.timeframe}`;
    if (signature === this.signature) {
      return;
    }
    this.signature = signature;
    this.removeSubscription();
    this.series = [];
    this.valueRows = [];
    if (!this.ctx || !this.gatewayId || !this.selected) {
      this.loading = false;
      return;
    }
    this.loading = true;
    const key = this.selected;
    const datasources: Datasource[] = [
      {
        type: DatasourceType.entity,
        name: "gateway-custom-stats",
        entityFilter: { type: AliasFilterType.singleEntity, singleEntity: { entityType: EntityType.DEVICE, id: this.gatewayId } } as EntityFilter,
        dataKeys: [{ name: key, label: key, type: DataKeyType.timeseries, settings: {} }],
      },
    ];
    const windowMs = STATS_TIMEFRAMES.find((t) => t.id === this.timeframe)?.ms ?? STATS_TIMEFRAMES[0].ms;
    const timeWindowConfig: Timewindow = {
      selectedTab: TimewindowType.REALTIME,
      realtime: { realtimeType: RealtimeWindowType.LAST_INTERVAL, timewindowMs: windowMs },
      aggregation: { type: AggregationType.NONE, limit: 5000 },
    };
    const options: WidgetSubscriptionOptions = {
      type: widgetType.timeseries,
      datasources,
      singleEntity: true,
      useDashboardTimewindow: false,
      timeWindowConfig,
      ignoreDataUpdateOnIntervalTick: true,
      callbacks: { onDataUpdated: (subscription) => this.onUpdated(subscription, key) },
    };
    this.ctx.subscriptionApi
      .createSubscription(options, true)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((subscription) => (this.subscription = subscription));
  }

  private onUpdated(subscription: any, key: string): void {
    const data: any[] = subscription?.data ?? [];
    const points: [number, string][] = ((data.find((d) => d.dataKey?.name === key)?.data as any[]) || [])
      .map((p: any[]) => [Number(p[0]), String(p[1] ?? "")] as [number, string])
      .filter((p) => Number.isFinite(p[0]));
    this.numeric = points.length > 0 && points.every((p) => p[1].trim() !== "" && !isNaN(Number(p[1])));
    if (this.numeric) {
      const trend: TrendPoint[] = points.map((p) => ({ ts: p[0], value: Number(p[1]) })).sort((a, b) => a.ts - b.ts);
      this.series = [{ name: key, color: "var(--c-chart-1)", data: trend }];
      this.valueRows = [];
    } else {
      this.series = [];
      this.valueRows = points
        .sort((a, b) => b[0] - a[0])
        .map((p, i) => ({ id: `${p[0]}:${i}`, time: formatWhen(p[0]), value: p[1] }));
    }
    this.loading = false;
    this.cd.detectChanges();
  }

  private removeSubscription(): void {
    removeSubscriptions(this.ctx, this.subscription);
    this.subscription = undefined;
  }
}
