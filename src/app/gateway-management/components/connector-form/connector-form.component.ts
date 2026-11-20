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

import { ChangeDetectorRef, Component, DestroyRef, EventEmitter, HostBinding, Input, OnChanges, OnInit, Output, SimpleChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from "@angular/forms";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { ContentType, SharedModule } from "@shared/public-api";
import { CardComponent } from "../../../components/shared/card/card.component";
import { CheckboxComponent } from "../../../components/shared/checkbox/checkbox.component";
import { CollapsibleCardComponent } from "../../../components/shared/collapsible-card/collapsible-card.component";
import { FoldComponent } from "../../../components/shared/fold/fold.component";
import { JsonEditorDirective } from "../../../components/shared/code-editor/json-editor.directive";
import { jsonObjectValidator } from "../../../components/shared/code-editor/json-validators";
import { NumberBoxComponent } from "../../../components/shared/number-box/number-box.component";
import { SelectComponent, TbSelectOption } from "../../../components/shared/select/select.component";
import { SwitchComponent } from "../../../components/shared/switch/switch.component";
import { TemplateDevicesAdded, TemplateDevicesComponent } from "../template-devices/template-devices.component";
import {
  CONNECTOR_HELP_LINKS,
  ConnectorType,
  ConnectorView,
  connectorTypeLabel,
  connectorTypesForVersion,
  defaultConnectorConfig,
  DeviceTemplate,
  getAtPath,
  setAtPath,
  GATEWAY_LOG_LEVELS,
  GatewayConnector,
  GatewayLogLevel,
  newConnector,
  NO_LEAD_TRAIL_SPACES,
  REPORT_PERIOD_DEFAULT,
  REPORT_STRATEGY_OPTIONS,
  ReportStrategyType,
  withReportStrategy,
} from "../../models/gateway-management.models";

/**
 * The connector form — "Add connector" (a new connector, from the type's
 * default configuration or an empty one) and a connector's configuration card
 * (the same fields, prefilled). Its cards: the connector (name, type — fixed
 * once created — and the gRPC key / custom class where they apply), logging
 * (its level) and the report strategy (gateways 3.6+; Modbus 3.5.2+), each
 * headed by its switch with its fields folding open while it's on, and the
 * protocol configuration as JSON
 * — the whole of what the gateway reads for the connector, as the ThingsBoard
 * gateway widgets' "Advanced" mode edits it.
 *
 * The Configuration section can add devices from a device template of the
 * connector's type (see {@link DeviceTemplate}): a name pattern — "[01-03]"
 * numbers them — and the fields that differ per device, appended to the
 * configuration's device list in the box.
 *
 * Both modes save through the floating Cancel / Apply: {@link submitted}
 * emits the connector with the form's values; the dashboard writes it to the
 * gateway.
 */
@Component({
  selector: "tb-gm-connector-form",
  templateUrl: "./connector-form.component.html",
  styleUrls: ["./connector-form.component.scss"],
  standalone: true,
  imports: [
    CommonModule,
    SharedModule,
    ReactiveFormsModule,
    CardComponent,
    CheckboxComponent,
    CollapsibleCardComponent,
    FoldComponent,
    JsonEditorDirective,
    NumberBoxComponent,
    SelectComponent,
    SwitchComponent,
    TemplateDevicesComponent,
  ],
})
export class ConnectorFormComponent implements OnInit, OnChanges {
  /** "add": a new connector (its type picked); "edit": an existing one (type fixed). */
  @Input() mode: "add" | "edit" = "add";
  /** Inside a card already (the Connectors section's configuration card): sections as plain blocks parted by dividers, not cards. */
  @Input() @HostBinding("class.cf-flat") flat = false;
  /**
   * Two columns (a dialog's width): the connector's own cards — its name and
   * type, its logging, its report strategy — on the left, its Configuration
   * (the JSON box) on the right, the whole height.
   */
  @Input() @HostBinding("class.cf-wide") wide = false;
  /** No buttons of its own: a dialog's footer has them, and calls {@link submit}. */
  @Input() hideActions = false;
  /**
   * What shows: "all" — the settings, then the configuration as the last,
   * titled section — or, in a card whose header switches them (the connector
   * page's), one view alone: the settings, or the configuration (its fields
   * straight in the card, the box the whole height). The other view stays
   * rendered, hidden, so switching keeps the editor as it is.
   */
  @Input() view: "all" | ConnectorView = "all";

  @HostBinding("class.cf-view-settings") get settingsView(): boolean {
    return this.view === "settings";
  }

  @HostBinding("class.cf-view-config") get configView(): boolean {
    return this.view === "config";
  }
  /** The connector being edited (ignored on "add"). A new value while the form has edits is held until the next reset. */
  @Input() value: GatewayConnector | null = null;
  /** On "add": a connector to start from instead of a type's defaults (the ESF section's "Add ESF connector"). */
  @Input() preset: GatewayConnector | null = null;
  /** The gateway's version (which connector types and formats it supports). */
  @Input() gatewayVersion = "";
  /** The gateway's other connectors — a name must be unique. */
  @Input() existingNames: string[] = [];
  /** Bumped to reset the form (on every open, and to discard edits). */
  @Input() resetKey = 0;
  @Input() saving = false;
  /** The tenant's device templates (those of the connector's type are offered in Configuration). */
  @Input() templates: DeviceTemplate[] = [];
  @Output() submitted = new EventEmitter<GatewayConnector>();
  @Output() cancelled = new EventEmitter<void>();
  @Output() dirtyChange = new EventEmitter<boolean>();

  readonly ConnectorType = ConnectorType;
  readonly logLevelOptions: TbSelectOption[] = GATEWAY_LOG_LEVELS.map((l) => ({ value: l, label: l }));
  readonly strategyOptions: TbSelectOption[] = REPORT_STRATEGY_OPTIONS.map((o) => ({ value: o.value, label: o.label }));
  typeOptions: TbSelectOption[] = [];
  form!: FormGroup;
  /** The configuration box was edited by hand (a type change no longer refills it). */
  private jsonTouched = false;

  // -- devices from a template (the Configuration section) ----------------------------------------

  /** Bumped when the form resets: the devices-from-a-template block folds and clears. */
  devicesResetKey = 0;
  /** The applications of the templates devices were added from since the form was last reset. */
  private readonly usedTemplateApplications = new Set<string>();
  /**
   * The devices added from templates since the form was last reset, by the
   * list they went into: their name field, their names and their blocks — so
   * "Default values", which rewrites the box, carries them over.
   */
  private readonly templateDevices = new Map<string, { listPath: string; nameKey: string; names: Set<string>; blocks: Record<string, any>[] }>();

  /**
   * The applications (ids) carried by the templates this form added devices
   * from: the dashboard tags the gateway with them once the connector is saved
   * (read with the `submitted` event; cleared when the form resets).
   */
  get templateApplications(): string[] {
    return [...this.usedTemplateApplications];
  }


  constructor(
    private fb: FormBuilder,
    private cd: ChangeDetectorRef,
    private destroyRef: DestroyRef
  ) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      name: ["", [Validators.required, Validators.pattern(NO_LEAD_TRAIL_SPACES), (c: AbstractControl) => this.uniqueName(c)]],
      type: [ConnectorType.MQTT, Validators.required],
      key: ["auto"],
      class: [""],
      enableRemoteLogging: [false],
      logLevel: [GatewayLogLevel.INFO, Validators.required],
      sendDataOnlyOnChange: [false],
      useDefaults: [true],
      strategyEnabled: [false],
      strategyType: [ReportStrategyType.OnReportPeriod],
      reportPeriod: [REPORT_PERIOD_DEFAULT.connector, [Validators.min(100)]],
      configurationJson: ["{}", jsonObjectValidator],
    });
    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.dirtyChange.emit(this.dirty));
    this.form.controls["type"].valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.onTypeChange());
    this.form.controls["useDefaults"].valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.fillDefaults());
    this.form.controls["configurationJson"].valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (this.form.controls["configurationJson"].dirty) {
        this.jsonTouched = true;
      }
    });
    this.reset();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.form) {
      return;
    }
    if (changes["gatewayVersion"]) {
      this.typeOptions = this.buildTypeOptions();
    }
    // A fresh value (the gateway reported the connector) never wipes edits in progress.
    if (changes["resetKey"] || changes["mode"] || changes["preset"] || (changes["value"] && !this.dirty)) {
      this.reset();
    }
  }

  /** The values as last reset: what "changed" is measured against. */
  private baseline = "";

  /** The form's values differ from the connector's (the Cancel / Apply buttons show, Apply enables). */
  get dirty(): boolean {
    return !!this.form && JSON.stringify(this.form.getRawValue()) !== this.baseline;
  }

  get type(): ConnectorType {
    return this.form.controls["type"].value as ConnectorType;
  }

  get typeLabel(): string {
    return connectorTypeLabel(this.type);
  }

  get helpLink(): string {
    return CONNECTOR_HELP_LINKS[this.type] ?? "";
  }

  /** The configuration version the connector is on (its own, else the gateway's). */
  get configVersion(): string {
    return (this.mode === "edit" && this.value?.configVersion) || this.gatewayVersion;
  }

  /** A new connector: the buttons always show (there's nothing to revert to) and Add enables as soon as the form is valid. */
  get creating(): boolean {
    return this.mode === "add";
  }

  /** The "start from the type's defaults" box: creating. */
  get showDefaults(): boolean {
    return this.creating;
  }

  get submitLabel(): string {
    if (this.saving) {
      return "Saving…";
    }
    return this.mode === "add" ? "Add connector" : "Apply changes";
  }

  get withReportStrategy(): boolean {
    return withReportStrategy(this.configVersion, this.type);
  }

  /** The strategy's period applies to all but "on value change" / "on received". */
  get strategyNeedsPeriod(): boolean {
    const t = this.form.controls["strategyType"].value;
    return t !== ReportStrategyType.OnChange && t !== ReportStrategyType.OnReceived;
  }

  get nameError(): string | null {
    const c = this.form.controls["name"];
    if (!c.touched) {
      return null;
    }
    if (c.hasError("required")) {
      return "A name is required.";
    }
    if (c.hasError("pattern")) {
      return "No leading or trailing spaces.";
    }
    if (c.hasError("duplicate")) {
      return "The gateway already has a connector with this name.";
    }
    return null;
  }

  readonly ContentType = ContentType;

  get jsonError(): string | null {
    const c = this.form.controls["configurationJson"];
    if (!c.touched && !c.dirty) {
      return null;
    }
    if (c.hasError("required")) {
      return "The configuration is required.";
    }
    if (c.hasError("contentBody")) {
      return "The configuration isn't valid JSON.";
    }
    if (c.hasError("json")) {
      return "The configuration must be a JSON object.";
    }
    return null;
  }

  get canSubmit(): boolean {
    return this.form.valid && !this.saving && (this.creating || this.dirty);
  }

  // -- devices from a template --------------------------------------------------------------------

  /** The templates of the connector's type. */
  get typeTemplates(): DeviceTemplate[] {
    return this.templates.filter((t) => t.type === this.type);
  }

  /** The block added devices: the configuration's new JSON into the box (an edit of the form), its template's applications kept for the save. */
  onDevicesAdded(event: TemplateDevicesAdded): void {
    const control = this.form.controls["configurationJson"];
    this.jsonTouched = true;
    control.markAsDirty();
    control.markAsTouched();
    control.setValue(event.json);
    for (const id of event.template.applications ?? []) {
      this.usedTemplateApplications.add(id);
    }
    // Remembered, so a "Default values" toggle doesn't lose them.
    const { listPath, nameKey } = event.template;
    const id = `${listPath}|${nameKey}`;
    const group = this.templateDevices.get(id) ?? { listPath, nameKey, names: new Set<string>(), blocks: [] };
    for (const device of event.devices) {
      group.names.add(String(getAtPath(device, nameKey) ?? ""));
      group.blocks.push(device);
    }
    this.templateDevices.set(id, group);
    this.cd.markForCheck();
  }

  /** Discard the edits: back to the connector's values. */
  cancel(): void {
    if (this.mode === "edit") {
      this.reset();
    } else {
      this.cancelled.emit();
    }
  }

  submit(): void {
    if (!this.canSubmit) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.value;
    const name = String(v.name).trim();
    const type = v.type as ConnectorType;
    const base: GatewayConnector = this.mode === "edit" && this.value ? { ...this.value } : newConnector(name, type, this.gatewayVersion, false);
    const connector: GatewayConnector = {
      ...base,
      name,
      type,
      logLevel: v.logLevel,
      enableRemoteLogging: !!v.enableRemoteLogging,
      configurationJson: JSON.parse(String(v.configurationJson)),
    };
    if (type === ConnectorType.GRPC) {
      connector.key = String(v.key ?? "auto").trim() || "auto";
    }
    if (type === ConnectorType.CUSTOM) {
      connector.class = String(v.class ?? "").trim();
    }
    if (this.withReportStrategy) {
      connector.reportStrategy = v.strategyEnabled
        ? { type: v.strategyType, ...(this.strategyNeedsPeriod ? { reportPeriod: Number(v.reportPeriod) } : {}) }
        : undefined;
    } else if (type === ConnectorType.MQTT) {
      connector.sendDataOnlyOnChange = !!v.sendDataOnlyOnChange;
    }
    this.submitted.emit(connector);
  }

  /** The form's values for a connector (none: a blank connector of the first type). */
  private valuesOf(c: GatewayConnector | null): Record<string, unknown> {
    const strategy = c?.reportStrategy ?? (c?.configurationJson?.["reportStrategy"] as GatewayConnector["reportStrategy"] | undefined);
    return {
      name: c?.name ?? "",
      type: c?.type ?? (this.typeOptions[0]?.value as ConnectorType) ?? ConnectorType.MQTT,
      key: c?.key ?? "auto",
      class: c?.class ?? "",
      enableRemoteLogging: !!c?.enableRemoteLogging,
      logLevel: c?.logLevel ?? GatewayLogLevel.INFO,
      sendDataOnlyOnChange: !!c?.sendDataOnlyOnChange,
      useDefaults: true,
      strategyEnabled: !!strategy && strategy.type !== ReportStrategyType.Disabled,
      strategyType: strategy?.type && strategy.type !== ReportStrategyType.Disabled ? strategy.type : ReportStrategyType.OnReportPeriod,
      reportPeriod: strategy?.reportPeriod ?? REPORT_PERIOD_DEFAULT.connector,
      configurationJson: c ? JSON.stringify(c.configurationJson ?? {}, null, 2) : "{}",
    };
  }

  /** The form's values back to the connector's (or a blank form on "add"); the devices block folded and cleared. */
  private reset(): void {
    this.typeOptions = this.buildTypeOptions();
    const c = this.mode === "edit" ? this.value : this.preset;
    this.form.reset(this.valuesOf(c), { emitEvent: false });
    this.jsonTouched = false;
    // Before the defaults fill the box: a reset form carries over nothing from the one before.
    this.usedTemplateApplications.clear();
    this.templateDevices.clear();
    if (this.creating && this.preset) {
      // Started from a preset: its configuration stays in the box (a type change doesn't swap in that type's defaults).
      this.form.controls["useDefaults"].setValue(false, { emitEvent: false });
      this.jsonTouched = true;
    } else if (this.creating) {
      this.fillDefaults();
    }
    this.form.markAsPristine();
    this.baseline = JSON.stringify(this.form.getRawValue());
    this.devicesResetKey++;
    this.dirtyChange.emit(false);
    this.cd.markForCheck();
  }

  private buildTypeOptions(): TbSelectOption[] {
    const types = this.mode === "edit" && this.value ? [this.value.type] : connectorTypesForVersion(this.gatewayVersion);
    return types.map((t) => ({ value: t, label: connectorTypeLabel(t) }));
  }

  /** A type change while creating: its defaults (unless the box was edited), the type's own fields, and its templates. */
  private onTypeChange(): void {
    if (!this.creating) {
      return;
    }
    const type = this.type;
    // gRPC and custom connectors have no default configuration to start from.
    const noDefaults = type === ConnectorType.GRPC || type === ConnectorType.CUSTOM;
    this.form.controls["useDefaults"].setValue(!noDefaults, { emitEvent: false });
    if (!this.jsonTouched) {
      this.fillDefaults();
    }
  }

  private fillDefaults(): void {
    if (!this.creating) {
      return;
    }
    const useDefaults = !!this.form.controls["useDefaults"].value;
    const config: Record<string, any> = useDefaults ? defaultConnectorConfig(this.type, this.gatewayVersion) : {};
    // The devices added from templates stay: the box is rewritten around them.
    const carried = this.carryTemplateDevices(config);
    this.form.controls["configurationJson"].setValue(JSON.stringify(config, null, 2), { emitEvent: false });
    // With devices carried over the box still holds work of the user's: a type change mustn't refill it.
    this.jsonTouched = carried;
  }

  /**
   * The devices added from templates into a fresh configuration's device
   * lists: as they stand in the box now — an edited one as edited, one removed
   * there left out — or, the box unreadable, as they were added. Returns
   * whether any were carried.
   */
  private carryTemplateDevices(target: Record<string, any>): boolean {
    if (!this.templateDevices.size) {
      return false;
    }
    let current: Record<string, any> | null = null;
    try {
      const parsed = JSON.parse(String(this.form.controls["configurationJson"].value ?? ""));
      current = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch {
      current = null;
    }
    let carried = false;
    for (const group of this.templateDevices.values()) {
      const now = current ? getAtPath(current, group.listPath) : null;
      const blocks: Record<string, any>[] = Array.isArray(now)
        ? now.filter((b) => b && typeof b === "object" && group.names.has(String(getAtPath(b, group.nameKey) ?? "")))
        : current
          ? []
          : group.blocks;
      if (!blocks.length) {
        continue;
      }
      const list = getAtPath(target, group.listPath);
      if (Array.isArray(list)) {
        list.push(...blocks);
      } else {
        setAtPath(target, group.listPath, [...blocks]);
      }
      carried = true;
    }
    return carried;
  }

  private uniqueName(c: AbstractControl): ValidationErrors | null {
    const name = String(c.value ?? "")
      .trim()
      .toLowerCase();
    if (!name) {
      return null;
    }
    const own = this.mode === "edit" ? (this.value?.name ?? "").toLowerCase() : "";
    const taken = this.existingNames.some((n) => n.toLowerCase() === name && n.toLowerCase() !== own);
    return taken ? { duplicate: true } : null;
  }
}
