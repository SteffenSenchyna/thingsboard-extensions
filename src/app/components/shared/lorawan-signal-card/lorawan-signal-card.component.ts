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

import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { WidgetContext } from "@home/models/widget-component.models";
import {
  MetricChartCardComponent,
  MetricChartSection,
} from "../metric-chart-card/metric-chart-card.component";

/** The LoRaWAN signal's telemetry keys: RSSI and SNR averages per window, and their raw readings (a device without the averages). */
export interface LorawanSignalKeys {
  rssiKeys: Record<string, string>;
  rssiRawKey: string;
  snrKeys: Record<string, string>;
  snrRawKey: string;
}

/** The averages the "Chirpstack Signal Stats" chain keeps (1-hour for 1D, 6-hour for 1W, 1-day for 1M) and the raw readings. */
export const LORAWAN_SIGNAL_KEYS: LorawanSignalKeys = {
  rssiKeys: { "1D": "rssiAvg1h", "1W": "rssiAvg6h", "1M": "rssiAvg1d" },
  rssiRawKey: "rssi",
  snrKeys: { "1D": "snrAvg1h", "1W": "snrAvg6h", "1M": "snrAvg1d" },
  snrRawKey: "snr",
};

/**
 * The signal's charts — RSSI over SNR, both filled, no legend, with their
 * explanations — for a `tb-metric-chart-card` of their own (this card) or
 * under a device's other charts in one card (QC Lab's Metrics: one window).
 */
export function lorawanSignalCharts(keys: LorawanSignalKeys = LORAWAN_SIGNAL_KEYS): MetricChartSection[] {
  return [
    {
      chartTitle: "RSSI",
      info: "Received signal strength (dBm). Closer to 0 is stronger.",
      unit: "dBm",
      showLegend: false,
      fill: true,
      keys: [{ name: keys.rssiKeys["1D"], nameByTimeframe: keys.rssiKeys, fallbackName: keys.rssiRawKey, label: "RSSI", color: "var(--c-chart-1)" }],
    },
    {
      chartTitle: "SNR",
      info: "Signal-to-noise ratio (dB). Higher is better.",
      unit: "dB",
      showLegend: false,
      fill: true,
      keys: [{ name: keys.snrKeys["1D"], nameByTimeframe: keys.snrKeys, fallbackName: keys.snrRawKey, label: "SNR", color: "var(--c-chart-2)" }],
    },
  ];
}

/**
 * Standalone, reusable LoRaWAN "Signal" widget: a card stacking RSSI and SNR
 * charts (sharing one time window) for a given device. Drop it into any
 * dashboard with a device id:
 *
 * ```html
 * <tb-lorawan-signal-card [ctx]="ctx" [deviceId]="device.id" [dark]="dark"></tb-lorawan-signal-card>
 * ```
 */
@Component({
  selector: "tb-lorawan-signal-card",
  template: `<tb-metric-chart-card [ctx]="ctx" [deviceId]="deviceId" [dark]="dark" title="Signal"
                                   [timeframe]="timeframe" (timeframeChange)="onTimeframeChange($event)"
                                   [charts]="charts"></tb-metric-chart-card>`,
  standalone: true,
  imports: [CommonModule, MetricChartCardComponent],
})
export class LorawanSignalCardComponent implements OnChanges {
  /** Widget context (used to create the subscription). */
  @Input() ctx!: WidgetContext;
  /** Device to show the signal metrics for. */
  @Input() deviceId: string | null = null;
  /** Active theme. */
  @Input() dark = false;
  /**
   * Telemetry keys for RSSI and SNR per window (override if your device uses
   * other keys): 1-hour averages for 1D, 6-hour for 1W, 1-day for 1M — plus the
   * raw readings as a fallback for devices that don't report the averages.
   */
  @Input() rssiKeys: Record<string, string> = LORAWAN_SIGNAL_KEYS.rssiKeys;
  @Input() rssiRawKey = LORAWAN_SIGNAL_KEYS.rssiRawKey;
  @Input() snrKeys: Record<string, string> = LORAWAN_SIGNAL_KEYS.snrKeys;
  @Input() snrRawKey = LORAWAN_SIGNAL_KEYS.snrRawKey;
  /** Selected window, two-way bindable as `[(timeframe)]` — passed straight
   *  through to the inner chart card so this card can mirror its siblings. */
  @Input() timeframe = "1D";
  @Output() timeframeChange = new EventEmitter<string>();

  /**
   * RSSI on top, SNR below — both filled, no legend, with LoRaWAN explanations.
   * Held as a stable reference (rebuilt only when the keys change) so ambient
   * change detection doesn't recreate the charts and cause flicker.
   */
  charts: MetricChartSection[] = [];

  /** Relay the inner card's picker up to the host (keeping our own copy in sync
   *  in case the host doesn't two-way bind). */
  onTimeframeChange(tf: string): void {
    this.timeframe = tf;
    this.timeframeChange.emit(tf);
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Rebuild only when the keys change (or on first init) — keeps the array
    // reference stable across ambient change detection so charts don't flicker.
    const keyInputs = ["rssiKeys", "rssiRawKey", "snrKeys", "snrRawKey"];
    if (this.charts.length && !keyInputs.some((k) => changes[k])) {
      return;
    }
    this.charts = lorawanSignalCharts({ rssiKeys: this.rssiKeys, rssiRawKey: this.rssiRawKey, snrKeys: this.snrKeys, snrRawKey: this.snrRawKey });
  }
}
