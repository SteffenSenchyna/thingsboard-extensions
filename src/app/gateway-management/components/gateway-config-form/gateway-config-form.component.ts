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
import { AbstractControl, FormArray, FormBuilder, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from "@angular/forms";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { SharedModule } from "@shared/public-api";
import { CheckboxComponent } from "../../../components/shared/checkbox/checkbox.component";
import { CollapsibleCardComponent } from "../../../components/shared/collapsible-card/collapsible-card.component";
import { FoldComponent } from "../../../components/shared/fold/fold.component";
import { NumberBoxComponent } from "../../../components/shared/number-box/number-box.component";
import { SecretBoxComponent } from "../../../components/shared/secret-box/secret-box.component";
import { SelectComponent, TbSelectOption } from "../../../components/shared/select/select.component";
import { SwitchComponent } from "../../../components/shared/switch/switch.component";
import {
  defaultGatewayConfig,
  defaultLocalLogConfig,
  GATEWAY_LOG_LEVELS,
  GatewayConfigCommand,
  GatewayConfigValue,
  GatewayVersion,
  LOCAL_LOGGERS,
  LOG_SAVING_PERIOD_OPTIONS,
  NO_LEAD_TRAIL_SPACES,
  parseVersion,
  REPORT_PERIOD_DEFAULT,
  REPORT_STRATEGY_OPTIONS,
  ReportStrategyType,
  SECURITY_TYPE_OPTIONS,
  SecurityType,
  STORAGE_TYPE_OPTIONS,
  StorageType,
} from "../../models/gateway-management.models";

const num = (min: number) => [Validators.required, Validators.min(min)];

/** One card of the configuration form (the panel's section picker shows them one at a time). */
export type GatewayConfigSection = "general" | "remote" | "statistics" | "activity" | "sending" | "reportStrategy" | "storage" | "grpc" | "logs";

/**
 * The form's cards, in order, with the icon a section picker shows for each.
 * The `inGeneral` ones are part of the General section (shown under the
 * Connection card, folded), not pickers' own entries.
 */
export const GATEWAY_CONFIG_SECTIONS: { id: GatewayConfigSection; label: string; icon: string; inGeneral?: boolean }[] = [
  { id: "general", label: "General", icon: "tune" },
  { id: "remote", label: "Remote access", icon: "terminal", inGeneral: true },
  { id: "statistics", label: "Statistics", icon: "monitoring", inGeneral: true },
  { id: "activity", label: "Device activity", icon: "sensors", inGeneral: true },
  { id: "sending", label: "Sending", icon: "send", inGeneral: true },
  { id: "reportStrategy", label: "Report strategy", icon: "schedule", inGeneral: true },
  { id: "storage", label: "Storage", icon: "database" },
  { id: "grpc", label: "gRPC server", icon: "dns" },
  { id: "logs", label: "Logs", icon: "receipt_long" },
];

/** The cards the General section holds besides the Connection card. */
const GENERAL_SECTIONS = new Set<GatewayConfigSection>(GATEWAY_CONFIG_SECTIONS.filter((x) => x.inGeneral).map((x) => x.id));

/**
 * The gateway's configuration — what the ThingsBoard gateway widgets' "General
 * configuration" edits, as cards: the platform connection (host, port, QoS,
 * the credentials the gateway connects with), remote access (shell, remote
 * configuration, the connectors' check period), statistics (the periodic
 * reports and the custom commands), device activity, packing, the
 * gateway-wide report strategy, the storage, the gRPC server and the logs
 * (the remote level and the local log files). Hosted inside the gateway's
 * device-settings card: it has no buttons of its own — it reports
 * {@link dirtyChange} / {@link validChange}, and the card's floating Cancel /
 * Apply call {@link submit} or bump {@link resetKey}. {@link sections} names
 * one section to show (a gateway's panel, with its section picker): General
 * is the Connection card over the remote access, statistics, device
 * activity, sending and report strategy cards (all open, each folding); any
 * other is its card alone, open and not collapsible. The rest keep their
 * values and are saved with it.
 */
@Component({
  selector: "tb-gm-config-form",
  templateUrl: "./gateway-config-form.component.html",
  styleUrls: ["./gateway-config-form.component.scss"],
  standalone: true,
  imports: [
    CommonModule,
    SharedModule,
    ReactiveFormsModule,
    CheckboxComponent,
    CollapsibleCardComponent,
    FoldComponent,
    NumberBoxComponent,
    SecretBoxComponent,
    SelectComponent,
    SwitchComponent,
  ],
})
export class GatewayConfigFormComponent implements OnInit, OnChanges {
  /** The gateway's configuration (null = the defaults). A new value while the form has edits is held until the next reset. */
  @Input() value: GatewayConfigValue | null = null;
  @Input() gatewayVersion = "";
  /** Which cards show: all of them (collapsible), General (the Connection card over its folded cards), or one alone, open. */
  @Input() sections: "all" | GatewayConfigSection = "all";
  /** Bumped to reset the form (on every open, and to discard edits). */
  @Input() resetKey = 0;
  @Input() saving = false;
  @Output() submitted = new EventEmitter<GatewayConfigValue>();
  @Output() dirtyChange = new EventEmitter<boolean>();
  @Output() validChange = new EventEmitter<boolean>();
  /** Remote configuration was switched off — the dashboard asks to confirm (see {@link keepRemoteConfiguration}). */
  @Output() remoteConfigurationOff = new EventEmitter<void>();

  readonly securityOptions: TbSelectOption[] = SECURITY_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }));
  readonly storageOptions: TbSelectOption[] = STORAGE_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }));
  readonly strategyOptions: TbSelectOption[] = REPORT_STRATEGY_OPTIONS.map((o) => ({ value: o.value, label: o.label }));
  readonly logLevelOptions: TbSelectOption[] = GATEWAY_LOG_LEVELS.map((l) => ({ value: l, label: l }));
  readonly periodOptions: TbSelectOption[] = LOG_SAVING_PERIOD_OPTIONS.map((o) => ({ value: o.value, label: o.label }));
  readonly qosOptions: TbSelectOption[] = [
    { value: "0", label: "0 — at most once" },
    { value: "1", label: "1 — at least once" },
  ];
  readonly loggers = LOCAL_LOGGERS;
  readonly SecurityType = SecurityType;
  readonly StorageType = StorageType;

  form!: FormGroup;

  constructor(
    private fb: FormBuilder,
    private cd: ChangeDetectorRef,
    private destroyRef: DestroyRef
  ) {}

  ngOnInit(): void {
    this.form = this.buildForm();
    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.emitState());
    this.form
      .get("thingsboard.remoteConfiguration")!
      .valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((on: boolean) => {
        if (!on) {
          this.remoteConfigurationOff.emit();
        }
      });
    this.reset();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.form) {
      return;
    }
    if (changes["resetKey"] || (changes["value"] && !this.form.dirty)) {
      this.reset();
    }
  }

  // -- template helpers -----------------------------------------------------------

  get thingsboard(): FormGroup {
    return this.form.get("thingsboard") as FormGroup;
  }

  get security(): FormGroup {
    return this.thingsboard.get("security") as FormGroup;
  }

  get statistics(): FormGroup {
    return this.thingsboard.get("statistics") as FormGroup;
  }

  get commands(): FormArray {
    return this.statistics.get("commands") as FormArray;
  }

  get activity(): FormGroup {
    return this.thingsboard.get("checkingDeviceActivity") as FormGroup;
  }

  get storage(): FormGroup {
    return this.form.get("storage") as FormGroup;
  }

  get grpc(): FormGroup {
    return this.form.get("grpc") as FormGroup;
  }

  get logs(): FormGroup {
    return this.form.get("logs") as FormGroup;
  }

  get securityType(): SecurityType {
    return this.security.controls["type"].value as SecurityType;
  }

  get storageType(): StorageType {
    return this.storage.controls["type"].value as StorageType;
  }

  /** Custom statistics (their own period and commands) arrived in 3.7.3; an unknown version shows them. */
  get hasCustomStatistics(): boolean {
    return !this.gatewayVersion || parseVersion(this.gatewayVersion) >= parseVersion(GatewayVersion.v3_7_3);
  }

  /** The gateway-wide report strategy arrived in 3.6; an unknown version shows it. */
  /** Whether a card shows: every one, the one picked, or — General picked — the Connection card and General's own. */
  shows(section: GatewayConfigSection): boolean {
    return this.sections === "all" || this.sections === section || (this.sections === "general" && GENERAL_SECTIONS.has(section));
  }

  /** A card folds when every card shows, or when it's one of General's under the Connection card; alone, it's open and fixed. Every card starts open. */
  cardCollapsible(section: GatewayConfigSection): boolean {
    return this.sections === "all" || (this.sections === "general" && section !== "general");
  }

  get hasReportStrategy(): boolean {
    return !this.gatewayVersion || parseVersion(this.gatewayVersion) >= parseVersion(GatewayVersion.v3_6_0);
  }

  get strategyNeedsPeriod(): boolean {
    const t = this.thingsboard.controls["strategyType"].value;
    return t !== ReportStrategyType.OnChange && t !== ReportStrategyType.OnReceived;
  }

  get dirty(): boolean {
    return !!this.form?.dirty;
  }

  get valid(): boolean {
    return !!this.form?.valid;
  }

  /** The given control's first error, as a short line under the field. */
  error(path: string, label = "This field"): string | null {
    const c = this.form.get(path);
    if (!c || !c.touched || c.valid) {
      return null;
    }
    if (c.hasError("required")) {
      return `${label} is required.`;
    }
    if (c.hasError("min")) {
      return `${label} must be at least ${c.getError("min").min}.`;
    }
    if (c.hasError("max")) {
      return `${label} must be at most ${c.getError("max").max}.`;
    }
    if (c.hasError("pattern")) {
      return `${label} has leading or trailing spaces.`;
    }
    if (c.hasError("duplicate")) {
      return `${label} is already used.`;
    }
    return `${label} is invalid.`;
  }

  // -- commands ---------------------------------------------------------------------

  addCommand(command?: GatewayConfigCommand): void {
    this.commands.push(this.commandGroup(command));
    this.form.markAsDirty();
    this.emitState();
  }

  removeCommand(index: number): void {
    this.commands.removeAt(index);
    this.form.markAsDirty();
    this.emitState();
  }

  // -- the dashboard's hooks -----------------------------------------------------------

  /** The confirmation to turn remote configuration off was declined: back on. */
  keepRemoteConfiguration(): void {
    this.thingsboard.controls["remoteConfiguration"].setValue(true, { emitEvent: false });
    this.cd.markForCheck();
  }

  /** The settings card's Apply: the configuration from the form's values. */
  submit(): void {
    if (!this.form.valid) {
      this.form.markAllAsTouched();
      this.cd.markForCheck();
      return;
    }
    this.submitted.emit(this.toValue());
  }

  // -- form ---------------------------------------------------------------------------

  private buildForm(): FormGroup {
    const local: Record<string, FormGroup> = {};
    for (const l of LOCAL_LOGGERS) {
      local[l.id] = this.fb.group({
        logLevel: ["INFO", Validators.required],
        filePath: ["./logs", Validators.required],
        backupCount: [7, num(0)],
        savingTime: [3, num(1)],
        savingPeriod: ["D", Validators.required],
      });
    }
    return this.fb.group({
      thingsboard: this.fb.group({
        host: ["", [Validators.required, Validators.pattern(/^\S+$/)]],
        port: [1883, [Validators.required, Validators.min(1), Validators.max(65535)]],
        qos: ["1", Validators.required],
        security: this.fb.group({
          type: [SecurityType.ACCESS_TOKEN, Validators.required],
          accessToken: [""],
          clientId: [""],
          username: [""],
          password: [""],
          caCert: [""],
          cert: [""],
          privateKey: [""],
        }),
        remoteShell: [false],
        remoteConfiguration: [true],
        checkConnectorsConfigurationInSeconds: [60, num(1)],
        handleDeviceRenaming: [true],
        statistics: this.fb.group({
          enable: [true],
          enableCustom: [false],
          statsSendPeriodInSeconds: [3600, num(60)],
          customStatsSendPeriodInSeconds: [3600, num(60)],
          commands: this.fb.array([]),
        }),
        checkingDeviceActivity: this.fb.group({
          checkDeviceInactivity: [false],
          inactivityTimeoutSeconds: [300, num(1)],
          inactivityCheckPeriodSeconds: [10, num(1)],
        }),
        maxPayloadSizeBytes: [8196, num(100)],
        minPackSendDelayMS: [50, num(10)],
        minPackSizeToSend: [500, num(100)],
        strategyEnabled: [true],
        strategyType: [ReportStrategyType.OnReportPeriod],
        reportPeriod: [REPORT_PERIOD_DEFAULT.gateway, [Validators.min(100)]],
      }),
      storage: this.fb.group({
        type: [StorageType.MEMORY, Validators.required],
        read_records_count: [100, num(1)],
        max_records_count: [100000, num(1)],
        data_folder_path: ["./data/", Validators.required],
        max_file_count: [10, num(1)],
        max_read_records_count: [10, num(1)],
        max_records_per_file: [10000, num(1)],
        data_file_path: ["./data/", Validators.required],
        messages_ttl_check_in_hours: [1, num(1)],
        messages_ttl_in_days: [7, num(1)],
        size_limit: [1024, num(1)],
        max_db_amount: [10, num(1)],
        oversize_check_period: [1, num(1)],
        writing_batch_size: [1000, num(1)],
      }),
      grpc: this.fb.group({
        enabled: [false],
        serverPort: [9595, [Validators.required, Validators.min(1), Validators.max(65535)]],
        keepAliveTimeMs: [10000, num(1)],
        keepAliveTimeoutMs: [5000, num(1)],
        keepalivePermitWithoutCalls: [true],
        maxPingsWithoutData: [0, num(0)],
        minTimeBetweenPingsMs: [10000, num(1)],
        minPingIntervalWithoutDataMs: [5000, num(1)],
      }),
      logs: this.fb.group({
        logLevel: ["INFO", Validators.required],
        dateFormat: ["", [Validators.required, Validators.pattern(/^\S.*\S$|^\S$/)]],
        logFormat: ["", [Validators.required, Validators.pattern(/^\S.*\S$|^\S$/)]],
        local: this.fb.group(local),
      }),
    });
  }

  private commandGroup(command?: GatewayConfigCommand): FormGroup {
    return this.fb.group({
      attributeOnGateway: [command?.attributeOnGateway ?? "", [Validators.required, Validators.pattern(NO_LEAD_TRAIL_SPACES), (c: AbstractControl) => this.uniqueCommandName(c)]],
      command: [command?.command ?? "", [Validators.required, Validators.pattern(/^(?=\S).*\S$/)]],
      timeout: [command?.timeout ?? 10, num(1)],
      installCmd: [command?.installCmd ?? "", Validators.pattern(/^$|^\S(?:.*\S)?$/)],
    });
  }

  private uniqueCommandName(c: AbstractControl): ValidationErrors | null {
    const name = String(c.value ?? "")
      .trim()
      .toLowerCase();
    if (!name || !this.form) {
      return null;
    }
    const same = this.commands.controls.filter((g) => String(g.get("attributeOnGateway")?.value ?? "").trim().toLowerCase() === name);
    return same.length > 1 ? { duplicate: true } : null;
  }

  /** The form's values back to the gateway's configuration (or the defaults). */
  private reset(): void {
    const v = this.value ?? defaultGatewayConfig(window.location.hostname);
    const tb = v.thingsboard;
    const strategy = tb.reportStrategy;
    const strategyOn = !!strategy && strategy.type !== ReportStrategyType.Disabled;
    this.commands.clear({ emitEvent: false });
    for (const c of tb.statistics?.commands ?? []) {
      this.commands.push(this.commandGroup(c), { emitEvent: false });
    }
    const local: Record<string, unknown> = {};
    for (const l of LOCAL_LOGGERS) {
      local[l.id] = { ...defaultLocalLogConfig(), ...(v.logs?.local?.[l.id] ?? {}) };
    }
    this.form.reset(
      {
        thingsboard: {
          host: tb.host ?? "",
          port: tb.port ?? 1883,
          qos: String(tb.qos ?? 1),
          security: {
            type: tb.security?.type ?? SecurityType.ACCESS_TOKEN,
            accessToken: tb.security?.accessToken ?? "",
            clientId: tb.security?.clientId ?? "",
            username: tb.security?.username ?? "",
            password: tb.security?.password ?? "",
            caCert: tb.security?.caCert ?? "",
            cert: tb.security?.cert ?? "",
            privateKey: tb.security?.privateKey ?? "",
          },
          remoteShell: !!tb.remoteShell,
          remoteConfiguration: tb.remoteConfiguration !== false,
          checkConnectorsConfigurationInSeconds: tb.checkConnectorsConfigurationInSeconds ?? 60,
          handleDeviceRenaming: tb.handleDeviceRenaming !== false,
          statistics: {
            enable: tb.statistics?.enable !== false,
            enableCustom: !!tb.statistics?.enableCustom,
            statsSendPeriodInSeconds: tb.statistics?.statsSendPeriodInSeconds ?? 3600,
            customStatsSendPeriodInSeconds: tb.statistics?.customStatsSendPeriodInSeconds ?? 3600,
            commands: (tb.statistics?.commands ?? []).map((c) => ({ attributeOnGateway: c.attributeOnGateway, command: c.command, timeout: c.timeout ?? 10, installCmd: c.installCmd ?? "" })),
          },
          checkingDeviceActivity: {
            checkDeviceInactivity: !!tb.checkingDeviceActivity?.checkDeviceInactivity,
            inactivityTimeoutSeconds: tb.checkingDeviceActivity?.inactivityTimeoutSeconds ?? 300,
            inactivityCheckPeriodSeconds: tb.checkingDeviceActivity?.inactivityCheckPeriodSeconds ?? 10,
          },
          maxPayloadSizeBytes: tb.maxPayloadSizeBytes ?? 8196,
          minPackSendDelayMS: tb.minPackSendDelayMS ?? 50,
          minPackSizeToSend: tb.minPackSizeToSend ?? 500,
          strategyEnabled: strategyOn,
          strategyType: strategyOn ? strategy!.type : ReportStrategyType.OnReportPeriod,
          reportPeriod: strategy?.reportPeriod ?? REPORT_PERIOD_DEFAULT.gateway,
        },
        storage: { ...defaultGatewayConfig("").storage, ...(v.storage ?? {}) },
        grpc: { ...defaultGatewayConfig("").grpc, ...(v.grpc ?? {}) },
        logs: {
          logLevel: v.logs?.logLevel ?? "INFO",
          dateFormat: v.logs?.dateFormat ?? "",
          logFormat: v.logs?.logFormat ?? "",
          local,
        },
      },
      { emitEvent: false }
    );
    this.form.markAsPristine();
    this.emitState();
    this.cd.markForCheck();
  }

  /** The configuration from the form: only the fields that apply (the selected security / storage type's). */
  private toValue(): GatewayConfigValue {
    const raw = this.form.getRawValue();
    const tb = raw.thingsboard;
    const sec = tb.security;
    const type = sec.type as SecurityType;
    const security: GatewayConfigValue["thingsboard"]["security"] = { type };
    if (type === SecurityType.ACCESS_TOKEN || type === SecurityType.TLS_ACCESS_TOKEN) {
      security.accessToken = String(sec.accessToken ?? "").trim();
    }
    if (type === SecurityType.USERNAME_PASSWORD) {
      security.clientId = String(sec.clientId ?? "").trim();
      security.username = String(sec.username ?? "").trim();
      security.password = String(sec.password ?? "");
    }
    if (type === SecurityType.TLS_ACCESS_TOKEN || type === SecurityType.TLS_PRIVATE_KEY) {
      security.caCert = String(sec.caCert ?? "").trim();
    }
    if (type === SecurityType.TLS_PRIVATE_KEY) {
      security.cert = String(sec.cert ?? "").trim();
      security.privateKey = String(sec.privateKey ?? "").trim();
    }
    const commands: GatewayConfigCommand[] = (tb.statistics.commands as any[]).map((c) => ({
      attributeOnGateway: String(c.attributeOnGateway).trim(),
      command: String(c.command).trim(),
      timeout: Number(c.timeout),
      ...(String(c.installCmd ?? "").trim() ? { installCmd: String(c.installCmd).trim() } : {}),
    }));
    const st = raw.storage;
    const storageType = st.type as StorageType;
    let storage: GatewayConfigValue["storage"];
    if (storageType === StorageType.FILE) {
      storage = { type: storageType, data_folder_path: st.data_folder_path, max_file_count: st.max_file_count, max_read_records_count: st.max_read_records_count, max_records_per_file: st.max_records_per_file };
    } else if (storageType === StorageType.SQLITE) {
      storage = {
        type: storageType,
        data_file_path: st.data_file_path,
        messages_ttl_check_in_hours: st.messages_ttl_check_in_hours,
        messages_ttl_in_days: st.messages_ttl_in_days,
        size_limit: st.size_limit,
        max_db_amount: st.max_db_amount,
        oversize_check_period: st.oversize_check_period,
        writing_batch_size: st.writing_batch_size,
      };
    } else {
      storage = { type: StorageType.MEMORY, read_records_count: st.read_records_count, max_records_count: st.max_records_count };
    }
    return {
      thingsboard: {
        host: String(tb.host).trim(),
        port: Number(tb.port),
        qos: Number(tb.qos),
        security,
        remoteShell: !!tb.remoteShell,
        remoteConfiguration: !!tb.remoteConfiguration,
        checkConnectorsConfigurationInSeconds: Number(tb.checkConnectorsConfigurationInSeconds),
        handleDeviceRenaming: !!tb.handleDeviceRenaming,
        statistics: {
          enable: !!tb.statistics.enable,
          ...(this.hasCustomStatistics ? { enableCustom: !!tb.statistics.enable && !!tb.statistics.enableCustom } : {}),
          statsSendPeriodInSeconds: Number(tb.statistics.statsSendPeriodInSeconds),
          customStatsSendPeriodInSeconds: Number(tb.statistics.customStatsSendPeriodInSeconds),
          commands,
        },
        checkingDeviceActivity: tb.checkingDeviceActivity.checkDeviceInactivity
          ? {
              checkDeviceInactivity: true,
              inactivityTimeoutSeconds: Number(tb.checkingDeviceActivity.inactivityTimeoutSeconds),
              inactivityCheckPeriodSeconds: Number(tb.checkingDeviceActivity.inactivityCheckPeriodSeconds),
            }
          : { checkDeviceInactivity: false },
        maxPayloadSizeBytes: Number(tb.maxPayloadSizeBytes),
        minPackSendDelayMS: Number(tb.minPackSendDelayMS),
        minPackSizeToSend: Number(tb.minPackSizeToSend),
        reportStrategy: this.hasReportStrategy
          ? tb.strategyEnabled
            ? { type: tb.strategyType, ...(this.strategyNeedsPeriod ? { reportPeriod: Number(tb.reportPeriod) } : {}) }
            : { type: ReportStrategyType.Disabled }
          : undefined,
      },
      storage,
      grpc: {
        enabled: !!raw.grpc.enabled,
        serverPort: Number(raw.grpc.serverPort),
        keepAliveTimeMs: Number(raw.grpc.keepAliveTimeMs),
        keepAliveTimeoutMs: Number(raw.grpc.keepAliveTimeoutMs),
        keepalivePermitWithoutCalls: !!raw.grpc.keepalivePermitWithoutCalls,
        maxPingsWithoutData: Number(raw.grpc.maxPingsWithoutData),
        minTimeBetweenPingsMs: Number(raw.grpc.minTimeBetweenPingsMs),
        minPingIntervalWithoutDataMs: Number(raw.grpc.minPingIntervalWithoutDataMs),
      },
      logs: {
        logLevel: raw.logs.logLevel,
        dateFormat: String(raw.logs.dateFormat).trim(),
        logFormat: String(raw.logs.logFormat).trim(),
        local: raw.logs.local,
      },
    };
  }

  private emitState(): void {
    this.dirtyChange.emit(this.form.dirty);
    this.validChange.emit(this.form.valid);
  }
}
