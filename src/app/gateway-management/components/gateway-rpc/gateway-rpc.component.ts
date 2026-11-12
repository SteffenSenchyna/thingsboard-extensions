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

import { ChangeDetectorRef, Component, DestroyRef, EventEmitter, Input, OnChanges, Output, SimpleChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from "@angular/forms";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { AttributeScope, ContentType, EntityType, SharedModule } from "@shared/public-api";
import { WidgetContext } from "@home/models/widget-component.models";
import { CardComponent } from "../../../components/shared/card/card.component";
import { CollapsibleCardComponent } from "../../../components/shared/collapsible-card/collapsible-card.component";
import { DataTableCellDirective, DataTableColumn, DataTableComponent } from "../../../components/shared/data-table/data-table.component";
import { JsonEditorDirective } from "../../../components/shared/code-editor/json-editor.directive";
import { jsonObjectValidator } from "../../../components/shared/code-editor/json-validators";
import { QUIET_REQUEST } from "../../../components/shared/value-utils";
import { NumberBoxComponent } from "../../../components/shared/number-box/number-box.component";
import { SelectComponent, TbSelectOption } from "../../../components/shared/select/select.component";
import { StatusPillComponent } from "../../../components/shared/status-pill/status-pill.component";
import { ToastTone } from "../../../components/shared/toasts/toasts.component";
import { formatDateTime } from "../../../components/shared/time-format";
import {
  connectorId,
  connectorRpcCommand,
  connectorRpcExample,
  ConnectorRow,
  connectorTypeLabel,
  GATEWAY_RPC_COMMANDS,
  NO_LEAD_TRAIL_SPACES,
  RpcTemplate,
} from "../../models/gateway-management.models";


/** A reply (or error) to a request: the method sent, when it came back, the body as JSON. */
export interface RpcResult {
  id: number;
  ok: boolean;
  method: string;
  time: string;
  text: string;
}

/**
 * The results per gateway / connector (`<gatewayId>|<connector key>`), newest
 * first, kept until the page reloads — the RPC view is rebuilt on every visit
 * to its section, so they live outside it.
 */
const rpcResults = new Map<string, RpcResult[]>();
let rpcResultSeq = 0;
const MAX_RESULTS = 50;

/**
 * RPC to a gateway: without a connector, the gateway's service commands
 * (`gateway_ping`, `gateway_stats`, `gateway_devices`, `gateway_update`,
 * `gateway_version`, `gateway_restart`, `gateway_reboot`); with one, a request
 * to that connector (`<type>_<command>`, the command read from the request's
 * parameters as the gateway expects per type, the connector's id added) —
 * with the request saved as a template (the gateway's `<type>_template`
 * server attribute) and reused. The reply (or the error) shows under the
 * form.
 */
@Component({
  selector: "tb-gm-rpc",
  templateUrl: "./gateway-rpc.component.html",
  styleUrls: ["./gateway-rpc.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, ReactiveFormsModule, CardComponent, CollapsibleCardComponent, DataTableCellDirective, DataTableComponent, JsonEditorDirective, NumberBoxComponent, SelectComponent, StatusPillComponent],
})
export class GatewayRpcComponent implements OnChanges {
  @Input() ctx!: WidgetContext;
  @Input() gatewayId = "";
  /** The connector the request goes to; null = the gateway's service commands. */
  @Input() connector: ConnectorRow | null = null;
  /** A toast for the dashboard to show. */
  @Output() notify = new EventEmitter<{ tone: ToastTone; message: string }>();

  readonly commandOptions: TbSelectOption[] = GATEWAY_RPC_COMMANDS.map((c) => ({ value: c.id, label: c.label }));
  readonly commands = GATEWAY_RPC_COMMANDS;
  readonly templateColumns: DataTableColumn[] = [
    { key: "name", header: "Template" },
    { key: "actions", header: "", align: "right" },
  ];
  form: FormGroup;
  sending = false;
  /** The replies (or errors) so far for this gateway / connector, newest first — kept until the page reloads. */
  results: RpcResult[] = [];
  templates: RpcTemplate[] = [];
  templatesLoading = false;
  /** The "Save as template" row (open with a name box). */
  savingTemplate = false;
  templateName = "";
  /** The result whose text was just copied (its check mark). */
  copiedId: number | null = null;

  constructor(
    private fb: FormBuilder,
    private cd: ChangeDetectorRef,
    private destroyRef: DestroyRef
  ) {
    this.form = this.fb.group({
      command: ["ping", Validators.required],
      timeout: [60, [Validators.required, Validators.min(1), Validators.max(3600)]],
      params: ["{}", jsonObjectValidator],
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["connector"] || changes["gatewayId"]) {
      this.results = rpcResults.get(this.resultsKey) ?? [];
      this.savingTemplate = false;
      this.templateName = "";
      if (this.connector) {
        this.form.patchValue({ params: JSON.stringify(connectorRpcExample(this.connector.connector.type), null, 2) }, { emitEvent: false });
        this.loadTemplates();
      } else {
        this.templates = [];
        this.form.patchValue({ command: "ping", params: "{}" }, { emitEvent: false });
      }
    }
  }

  get commandInfo(): string {
    const id = this.form.controls["command"].value;
    return GATEWAY_RPC_COMMANDS.find((c) => c.id === id)?.info ?? "";
  }

  get connectorTypeLabel(): string {
    return this.connector ? connectorTypeLabel(this.connector.connector.type) : "";
  }

  /** The connector's id on the gateway — assigned once the gateway runs it; a request needs it. */
  get connectorRpcId(): string {
    return this.connector ? connectorId(this.connector) : "";
  }

  /** What the request will be sent as (`mqtt_echo`, `gateway_ping`, …). */
  get methodPreview(): string {
    if (!this.connector) {
      return `gateway_${this.form.controls["command"].value}`;
    }
    const params = this.parsedParams();
    const command = params ? connectorRpcCommand(this.connector.connector.type, params) : "";
    return `${this.connector.connector.type}_${command || "…"}`;
  }

  readonly ContentType = ContentType;

  get paramsError(): string | null {
    const c = this.form.controls["params"];
    if (!this.connector || (!c.touched && !c.dirty)) {
      return null;
    }
    if (c.hasError("required")) {
      return "The request's parameters are required.";
    }
    if (c.hasError("contentBody")) {
      return "The parameters aren't valid JSON.";
    }
    if (c.hasError("json")) {
      return "The parameters must be a JSON object.";
    }
    return null;
  }

  get canSend(): boolean {
    if (this.sending || !this.gatewayId) {
      return false;
    }
    if (this.connector) {
      return this.form.controls["params"].valid && this.form.controls["timeout"].valid && !!this.connectorRpcId;
    }
    return this.form.valid;
  }

  send(): void {
    if (!this.canSend) {
      return;
    }
    const timeoutMs = Number(this.form.controls["timeout"].value) * 1000;
    let method: string;
    let params: Record<string, unknown> | undefined;
    if (this.connector) {
      const parsed = this.parsedParams() ?? {};
      const command = connectorRpcCommand(this.connector.connector.type, parsed);
      if (!command) {
        this.form.controls["params"].markAsTouched();
        this.notify.emit({ tone: "warning", message: "The parameters don't name the connector's command (e.g. methodFilter, method, methodRPC)." });
        return;
      }
      method = `${this.connector.connector.type}_${command}`;
      params = { ...parsed, connectorId: this.connectorRpcId };
    } else {
      method = `gateway_${this.form.controls["command"].value}`;
      // No params at all: the gateway calls its handler with arguments whenever params is anything
      // but null / "{}" — an empty object too — and a service command like stats takes none.
      params = undefined;
    }
    this.sending = true;
    const key = this.resultsKey;
    this.ctx.deviceService
      .sendTwoWayRpcCommand(this.gatewayId, { method, params, timeout: timeoutMs }, QUIET_REQUEST)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (reply) => {
          this.sending = false;
          this.addResult(key, { ok: true, method, text: this.pretty(reply) });
        },
        error: (err) => {
          this.sending = false;
          const body = err?.error ?? err?.message ?? err;
          this.addResult(key, { ok: false, method, text: this.pretty(body) });
        },
      });
  }

  /** The results list this gateway / connector keeps (see {@link rpcResults}). */
  private get resultsKey(): string {
    return `${this.gatewayId}|${this.connector?.key ?? ""}`;
  }

  /** A reply (or error) just in: on top of its gateway's / connector's list, which is kept across the page's sections. */
  private addResult(key: string, result: Omit<RpcResult, "id" | "time">): void {
    const list = [{ id: ++rpcResultSeq, time: formatDateTime(Date.now()), ...result }, ...(rpcResults.get(key) ?? [])].slice(0, MAX_RESULTS);
    rpcResults.set(key, list);
    if (key === this.resultsKey) {
      this.results = list;
    }
    this.cd.detectChanges();
  }

  /** A click on a result's box: its text to the clipboard (its mark turns to a check for a moment) — unless the click ended a text selection in it. */
  copyResult(result: RpcResult): void {
    if (window.getSelection()?.toString()) {
      return;
    }
    navigator.clipboard?.writeText(result.text).then(() => {
      this.copiedId = result.id;
      this.cd.detectChanges();
      setTimeout(() => {
        if (this.copiedId === result.id) {
          this.copiedId = null;
          this.cd.detectChanges();
        }
      }, 1500);
    });
  }

  trackByResult(_: number, r: RpcResult): number {
    return r.id;
  }

  // -- templates (connector requests) ----------------------------------------------

  startSaveTemplate(): void {
    this.savingTemplate = true;
    this.templateName = "";
  }

  cancelSaveTemplate(): void {
    this.savingTemplate = false;
  }

  get templateNameValid(): boolean {
    return NO_LEAD_TRAIL_SPACES.test(this.templateName);
  }

  saveTemplate(): void {
    const params = this.parsedParams();
    if (!this.connector || !params || !this.templateNameValid) {
      return;
    }
    const template: RpcTemplate = { name: this.templateName.trim(), type: this.connector.connector.type, config: params };
    const list = [...this.templates.filter((t) => t.name !== template.name), template];
    this.writeTemplates(list, `Template "${template.name}" saved`);
    this.savingTemplate = false;
  }

  useTemplate(row: Record<string, any>): void {
    const t = row["template"] as RpcTemplate;
    this.form.patchValue({ params: JSON.stringify(t.config, null, 2) });
    this.form.controls["params"].markAsTouched();
  }

  deleteTemplate(event: Event, row: Record<string, any>): void {
    event.stopPropagation();
    const t = row["template"] as RpcTemplate;
    this.writeTemplates(
      this.templates.filter((x) => x.name !== t.name),
      `Template "${t.name}" deleted`
    );
  }

  get templateRows(): Record<string, any>[] {
    return this.templates.map((t) => ({ name: t.name, template: t }));
  }

  private get templateKey(): string {
    return `${this.connector?.connector.type ?? ""}_template`;
  }

  private loadTemplates(): void {
    if (!this.connector || !this.gatewayId) {
      return;
    }
    this.templatesLoading = true;
    const key = this.templateKey;
    this.ctx.attributeService
      .getEntityAttributes({ entityType: EntityType.DEVICE, id: this.gatewayId }, AttributeScope.SERVER_SCOPE, [key], QUIET_REQUEST)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (attrs) => {
          const raw = attrs.find((a) => a.key === key)?.value;
          let list: unknown = raw;
          if (typeof raw === "string") {
            try {
              list = JSON.parse(raw);
            } catch {
              list = [];
            }
          }
          this.templates = Array.isArray(list) ? (list as RpcTemplate[]).filter((t) => t && t.name && t.config) : [];
          this.templatesLoading = false;
          this.cd.detectChanges();
        },
        error: () => {
          this.templatesLoading = false;
          this.cd.detectChanges();
        },
      });
  }

  private writeTemplates(list: RpcTemplate[], message: string): void {
    this.ctx.attributeService
      .saveEntityAttributes({ entityType: EntityType.DEVICE, id: this.gatewayId }, AttributeScope.SERVER_SCOPE, [{ key: this.templateKey, value: list }], QUIET_REQUEST)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.templates = list;
          this.notify.emit({ tone: "success", message });
          this.cd.detectChanges();
        },
        error: (err) => {
          this.notify.emit({ tone: "error", message: `Couldn't save the templates${this.apiMessage(err)}` });
        },
      });
  }

  private parsedParams(): Record<string, any> | null {
    try {
      const parsed = JSON.parse(String(this.form.controls["params"].value ?? ""));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private pretty(value: unknown): string {
    if (value === undefined || value === null) {
      return "null";
    }
    if (typeof value === "string") {
      try {
        return JSON.stringify(JSON.parse(value), null, 2);
      } catch {
        return value;
      }
    }
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  private apiMessage(err: any): string {
    const msg = err?.error?.message || err?.message;
    return msg ? `: ${msg}` : ".";
  }
}
