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

import { ChangeDetectorRef, Component, DestroyRef, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { ContentType, SharedModule } from "@shared/public-api";
import { CardComponent } from "../../../components/shared/card/card.component";
import { JsonEditorDirective } from "../../../components/shared/code-editor/json-editor.directive";
import { jsonObjectValidator } from "../../../components/shared/code-editor/json-validators";
import { FoldComponent } from "../../../components/shared/fold/fold.component";
import { NumberBoxComponent } from "../../../components/shared/number-box/number-box.component";
import { SelectComponent, TbSelectOption } from "../../../components/shared/select/select.component";
import { SwitchComponent } from "../../../components/shared/switch/switch.component";
import { TimeframePickerComponent } from "../../../components/shared/timeframe-picker/timeframe-picker.component";
import { TemplateDevicesAdded, TemplateDevicesComponent } from "../template-devices/template-devices.component";
import {
  CONNECTOR_VIEW_DEFAULT,
  CONNECTOR_VIEW_OPTIONS,
  ConnectorRow,
  ConnectorView,
  DeviceTemplate,
  DeviceTemplateSource,
  GATEWAY_LOG_LEVELS,
  GatewayConnector,
  GatewayLogLevel,
  REPORT_PERIOD_DEFAULT,
  REPORT_STRATEGY_OPTIONS,
  ReportStrategyType,
  withReportStrategy,
} from "../../models/gateway-management.models";

/** What the form applies: the connector as edited, whether it's enabled on the gateway, and the applications of the templates devices were added from. */
export interface ConnectorQuickEdit {
  connector: GatewayConnector;
  enabled: boolean;
  /** The applications (ids) the gateway is tagged with once the edit is saved. */
  templateApplications: string[];
}

/** The form's state for the dialog's buttons: changed from the saved connector, and what's wrong with it (null: nothing). */
export interface ConnectorQuickState {
  dirty: boolean;
  error: string | null;
}

/**
 * A connector's quick edit — the body of the gateway panel's connector
 * dialog, in two panes: on the left its settings, the title's switch picking
 * the view — its protocol configuration as JSON (the view it opens on), the
 * whole height, or its general settings in a card: whether it's enabled, its
 * remote logging and its report strategy, each a switch heading the fields it
 * reveals, and devices from a template; on the right the projected content
 * (the connector's logs), the whole height. It has no buttons of its own: it reports
 * whether it differs from the saved connector and what's wrong with it
 * ({@link stateChange}), and {@link submit} emits the edit for the dashboard
 * to save. A connector reloading under edits in hand keeps the edits.
 */
@Component({
  selector: "tb-gm-connector-quick-form",
  templateUrl: "./connector-quick-form.component.html",
  styleUrls: ["./connector-quick-form.component.scss"],
  standalone: true,
  imports: [
    CommonModule,
    SharedModule,
    ReactiveFormsModule,
    CardComponent,
    FoldComponent,
    JsonEditorDirective,
    NumberBoxComponent,
    SelectComponent,
    SwitchComponent,
    TemplateDevicesComponent,
    TimeframePickerComponent,
  ],
})
export class ConnectorQuickFormComponent implements OnInit, OnChanges {
  /** The connector edited (with whether it's enabled); null while its gateway's connectors load. */
  @Input() row: ConnectorRow | null = null;
  /** The gateway's version: whether its connectors have a report strategy (a connector's own configuration version wins). */
  @Input() gatewayVersion = "";
  /** The tenant's device templates (those of the connector's type can add devices to its configuration). */
  @Input() templates: DeviceTemplate[] = [];
  /** Bumped to put the form back to the connector (after a save). */
  @Input() resetKey = 0;
  @Input() saving = false;
  @Output() submitted = new EventEmitter<ConnectorQuickEdit>();
  @Output() stateChange = new EventEmitter<ConnectorQuickState>();

  readonly ContentType = ContentType;
  readonly logLevelOptions: TbSelectOption[] = GATEWAY_LOG_LEVELS.map((l) => ({ value: l, label: l }));
  readonly strategyOptions: TbSelectOption[] = REPORT_STRATEGY_OPTIONS.map((o) => ({ value: o.value, label: o.label }));
  form!: FormGroup;
  /** The Settings pane's view: the configuration's JSON to begin with, or the general settings; a reset leaves it as it is. */
  view: ConnectorView = CONNECTOR_VIEW_DEFAULT;
  readonly viewOptions = CONNECTOR_VIEW_OPTIONS;
  /** The saved connector's values, as a snapshot: what "changed" is measured against. */
  private baseline = "";
  /** Bumped when the form resets: the devices-from-a-template block folds and clears. */
  devicesResetKey = 0;
  /** The applications of the templates devices were added from since the form was last reset. */
  private readonly usedTemplateApplications = new Set<string>();

  constructor(
    private fb: FormBuilder,
    private cd: ChangeDetectorRef,
    private destroyRef: DestroyRef
  ) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      enabled: [false],
      enableRemoteLogging: [false],
      logLevel: [GatewayLogLevel.INFO, Validators.required],
      strategyEnabled: [false],
      strategyType: [ReportStrategyType.OnReportPeriod],
      reportPeriod: [REPORT_PERIOD_DEFAULT.connector, [Validators.min(100)]],
      configurationJson: ["{}", jsonObjectValidator],
    });
    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.emitState());
    this.reset();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.form) {
      return;
    }
    const row = changes["row"];
    const another = !!row && (row.previousValue as ConnectorRow | null)?.key !== this.row?.key;
    if (changes["resetKey"] || another || (row && !this.dirty)) {
      this.reset();
    } else if (row) {
      // The connector reloaded under edits in hand: they stay, measured against what was just loaded.
      this.baseline = this.snapshot(this.valuesOf(this.row));
      this.emitState();
    }
  }

  /** Report strategies exist from gateway 3.6 (Modbus: 3.5.2) — by the connector's own configuration version, else the gateway's. */
  get withStrategy(): boolean {
    const c = this.row?.connector;
    return !!c && withReportStrategy(c.configVersion || this.gatewayVersion, c.type);
  }

  get loggingOn(): boolean {
    return !!this.form.controls["enableRemoteLogging"].value;
  }

  get strategyOn(): boolean {
    return !!this.form.controls["strategyEnabled"].value;
  }

  get strategyNeedsPeriod(): boolean {
    const t = this.form.controls["strategyType"].value;
    return t !== ReportStrategyType.OnChange && t !== ReportStrategyType.OnReceived;
  }

  /** The form differs from the saved connector (formatting the JSON alone isn't a change). */
  get dirty(): boolean {
    return !!this.form && !!this.row && this.snapshot(this.form.getRawValue()) !== this.baseline;
  }

  /** What stops the edit from being applied (null: nothing). */
  get error(): string | null {
    const json = this.form.controls["configurationJson"];
    if (json.hasError("required")) {
      return "The configuration is required.";
    }
    if (json.hasError("contentBody")) {
      return "The configuration isn't valid JSON.";
    }
    if (json.hasError("json")) {
      return "The configuration must be a JSON object.";
    }
    if (this.periodInvalid) {
      return "The report period must be at least 100 ms.";
    }
    return null;
  }

  /** The report period is in use (a strategy with one, switched on) and under its minimum. */
  get periodInvalid(): boolean {
    return this.withStrategy && !!this.form.controls["strategyEnabled"].value && this.strategyNeedsPeriod && this.form.controls["reportPeriod"].invalid;
  }

  get jsonInvalid(): boolean {
    return this.form.controls["configurationJson"].invalid;
  }

  /** The connector as it stands in the form — its type and the configuration as edited — to save one of its devices as a template (null while the JSON isn't an object). */
  get templateSource(): DeviceTemplateSource | null {
    const type = this.row?.connector.type;
    if (!type) {
      return null;
    }
    try {
      const parsed = JSON.parse(String(this.form.controls["configurationJson"].value ?? ""));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? { type, config: parsed } : null;
    } catch {
      return null;
    }
  }

  /** Apply: the connector with the edits (the dashboard saves it, and enables / disables it). */
  submit(): void {
    const row = this.row;
    if (!row || !this.dirty || this.error || this.saving) {
      return;
    }
    const v = this.form.getRawValue();
    const connector: GatewayConnector = {
      ...row.connector,
      logLevel: v.logLevel,
      enableRemoteLogging: !!v.enableRemoteLogging,
      configurationJson: JSON.parse(String(v.configurationJson)),
    };
    if (this.withStrategy) {
      connector.reportStrategy = v.strategyEnabled ? { type: v.strategyType, ...(this.strategyNeedsPeriod ? { reportPeriod: Number(v.reportPeriod) } : {}) } : undefined;
    }
    this.submitted.emit({ connector, enabled: !!v.enabled, templateApplications: [...this.usedTemplateApplications] });
  }

  selectView(id: string): void {
    this.view = id as ConnectorView;
  }

  /** The block added devices: the configuration's new JSON into the box (an edit, applied with the rest) and its view shown, its template's applications kept for the save. */
  onDevicesAdded(event: TemplateDevicesAdded): void {
    const control = this.form.controls["configurationJson"];
    control.markAsDirty();
    control.setValue(event.json);
    this.view = "config";
    for (const id of event.template.applications ?? []) {
      this.usedTemplateApplications.add(id);
    }
    this.cd.markForCheck();
  }

  /** The form back to the connector as saved. */
  private reset(): void {
    const values = this.valuesOf(this.row);
    this.form.reset(values, { emitEvent: false });
    this.form.markAsPristine();
    this.devicesResetKey++;
    this.usedTemplateApplications.clear();
    this.baseline = this.snapshot(values);
    this.emitState();
    this.cd.markForCheck();
  }

  /** The form's values for a connector (none yet: a blank one). */
  private valuesOf(row: ConnectorRow | null): Record<string, any> {
    const c = row?.connector;
    const strategy = c?.reportStrategy ?? (c?.configurationJson?.["reportStrategy"] as GatewayConnector["reportStrategy"] | undefined);
    return {
      enabled: !!row?.enabled,
      enableRemoteLogging: !!c?.enableRemoteLogging,
      logLevel: c?.logLevel ?? GatewayLogLevel.INFO,
      strategyEnabled: !!strategy && strategy.type !== ReportStrategyType.Disabled,
      strategyType: strategy?.type && strategy.type !== ReportStrategyType.Disabled ? strategy.type : ReportStrategyType.OnReportPeriod,
      reportPeriod: strategy?.reportPeriod ?? REPORT_PERIOD_DEFAULT.connector,
      configurationJson: JSON.stringify(c?.configurationJson ?? {}, null, 2),
    };
  }

  /** The values that count, comparably: the switches, the fields their switches reveal, and the JSON compacted (its formatting aside). */
  private snapshot(v: Record<string, any>): string {
    let json: string;
    try {
      json = JSON.stringify(JSON.parse(String(v["configurationJson"])));
    } catch {
      json = `!${v["configurationJson"]}`;
    }
    const needsPeriod = v["strategyType"] !== ReportStrategyType.OnChange && v["strategyType"] !== ReportStrategyType.OnReceived;
    return JSON.stringify({
      enabled: !!v["enabled"],
      logging: !!v["enableRemoteLogging"],
      level: v["logLevel"],
      strategy: this.withStrategy && v["strategyEnabled"] ? [v["strategyType"], needsPeriod ? Number(v["reportPeriod"]) : null] : null,
      json,
    });
  }

  private emitState(): void {
    this.stateChange.emit({ dirty: this.dirty, error: this.row ? this.error : null });
  }
}
