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

import { ChangeDetectorRef, Component, DestroyRef, EventEmitter, HostBinding, Input, OnChanges, Output, SimpleChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormBuilder, FormsModule, ReactiveFormsModule } from "@angular/forms";
import { ButtonGroupComponent, ButtonGroupOption } from "../../../components/shared/button-group/button-group.component";
import { CalloutComponent } from "../../../components/shared/callout/callout.component";
import { CollapsibleCardComponent } from "../../../components/shared/collapsible-card/collapsible-card.component";
import { FormActionsComponent } from "../../../components/shared/form-actions/form-actions.component";
import { ManageActionComponent, ManageCardComponent } from "../../../components/shared/manage-card/manage-card.component";
import { SelectComponent, TbSelectOption } from "../../../components/shared/select/select.component";
import { SkeletonCardComponent } from "../../../components/shared/skeleton-card/skeleton-card.component";
import { ToastTone } from "../../../components/shared/toasts/toasts.component";
import { EsfClient, EsfConfirm, esfSubscribe, parseEsfConnected } from "../../models/esf-api.models";
import { esfCloudPidError, EsfCloudFactory, EsfCloudRow, esfFactoryOptions, EsfPubSubFactory } from "../../models/esf-cloud.models";
import { EsfField, EsfForm } from "../../models/esf-form.models";
import { EsfComponentConfig, esfShortName, esfUpdateRequest, parseEsfConfigs } from "../../models/esf.models";
import { EsfComponentFactory } from "../../models/esf-security.models";
import { isEsfTarget } from "../../models/esf-targets.models";
import { EsfFieldComponent } from "../esf-field/esf-field.component";

/** A cloud component opened in the side panel (the Cloud connections view's row, or its "Create new"). */
export interface EsfCloudOpen {
  client: EsfClient;
  mode: "settings" | "create";
  /** The row opened (settings); null for a new one. */
  row: EsfCloudRow | null;
  /** The panel's tabs: a connection's stack components, a publisher's / subscriber's own — or "Create new". */
  tabs: { id: string; label: string; icon: string; tooltip: string }[];
  connectionFactories: EsfCloudFactory[];
  pubSubFactories: EsfPubSubFactory[];
  /** The connections (a new publisher / subscriber is made for one). */
  connections: EsfCloudRow[];
  /** Something changed on the unit: the table reads again. */
  changed: () => void;
  /**
   * The components' settings already read (the view reads them ahead on page load, one at a time): a tab shows its own at once,
   * read only when missing; each read here is kept there too.
   */
  configs: Map<string, EsfComponentConfig>;
  /** The panel closed (the row no longer lit). */
  closed: () => void;
}

/** A stack component's settings: read, its form. */
interface ComponentForm {
  pid: string;
  loading: boolean;
  error: string;
  config: EsfComponentConfig | null;
  form: EsfForm | null;
  saving: boolean;
}

const KINDS: ButtonGroupOption[] = [
  { value: "connection", label: "Cloud connection" },
  { value: "pubsub", label: "Publisher / Subscriber" },
];

/**
 * A cloud component in the side panel, as ESF's console's Cloud Connections page: a connection's settings a tab a stack component
 * (its CloudService, DataService, MqttDataTransport, …), a publisher's or subscriber's its own — each a form built from ESF's
 * definition, "Apply changes" sending the changed settings (Cloud Connection v1's configurations, a snapshot taken) — or, "Create
 * new", a new connection (its factory and Service PID) or publisher / subscriber (its factory, its connection, its PID), the
 * factory's suggested PID to start, checked against its pattern. Under the component's own settings (a connection's endpoint
 * tab), its Manage card: a connection's Connect / Disconnect (a disconnect confirmed), and Delete (confirmed) — a publisher's or
 * subscriber's Delete alone.
 */
@Component({
  selector: "tb-gm-esf-cloud-panel",
  templateUrl: "./esf-cloud-panel.component.html",
  styleUrls: ["./esf-cloud-panel.component.scss"],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ButtonGroupComponent,
    CalloutComponent,
    CollapsibleCardComponent,
    EsfFieldComponent,
    FormActionsComponent,
    ManageActionComponent,
    ManageCardComponent,
    SelectComponent,
    SkeletonCardComponent,
  ],
})
export class EsfCloudPanelComponent implements OnChanges {
  @HostBinding("attr.title") readonly hostTitle: string | null = null;
  @Input() open: EsfCloudOpen | null = null;
  /** The panel's tab shown (a stack component's PID). */
  @Input() tab = "";
  @Output() notify = new EventEmitter<{ tone: ToastTone; message: string }>();
  /** A Disconnect or a Delete asks first (the dashboard's themed dialog). */
  @Output() confirm = new EventEmitter<EsfConfirm>();
  /** Done (created, deleted): the panel closes. */
  @Output() done = new EventEmitter<void>();

  /** A connection ESF connects: whether it's connected (null: not one, or not known). */
  connected: boolean | null = null;
  /** The Manage card's action running ("" none). */
  busy = "";

  /** Each tab's settings (by PID). */
  private forms = new Map<string, ComponentForm>();
  /**
   * The unit's services (`EsfClient.componentFactories`, read once a gateway — the Cloud connections view reads them ahead): a
   * setting naming another one (a transport's SSL manager) picks it. Not in yet, a tab shows at once, its form made again with
   * them as they come (unless it's been changed meanwhile).
   */
  private services: EsfComponentFactory[] = [];
  private servicesOf: EsfClient | null = null;

  // "Create new"
  readonly kinds = KINDS;
  kind = "connection";
  factory = "";
  connection = "";
  pid = "";
  factoryOptions: TbSelectOption[] = [];
  connectionOptions: TbSelectOption[] = [];
  creating = false;
  /** "Create" was pressed: every check shows. */
  tried = false;

  constructor(
    private fb: FormBuilder,
    private cd: ChangeDetectorRef,
    private destroyRef: DestroyRef
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["open"]) {
      this.forms.clear();
      this.readServices();
      const row = this.open?.row;
      this.connected = row?.manager ? row.status === "Connected" : null;
      this.busy = "";
      if (this.open?.mode === "create") {
        this.kind = "connection";
        this.tried = false;
        this.onKind();
      } else {
        // Every tab's settings: those read ahead shown at once, the rest read now (a few small reads), so switching tabs shows them.
        this.open?.tabs.forEach((t) => {
          const cached = this.open?.configs.get(t.id);
          if (cached) {
            this.show(t.id, cached);
          } else {
            this.read(t.id);
          }
        });
      }
    }
  }

  /** The tab shown's settings. */
  get current(): ComponentForm | null {
    return this.forms.get(this.tab) ?? null;
  }

  title(c: ComponentForm): string {
    return c.config?.definition?.name || esfShortName(c.pid);
  }

  /** A component's settings in its tab, its form built from them. */
  private show(pid: string, config: EsfComponentConfig): void {
    this.forms.set(pid, { pid, loading: false, error: "", config, form: this.formOf(config), saving: false });
  }

  private formOf(config: EsfComponentConfig): EsfForm {
    return new EsfForm(this.fb, config, config.definition?.attributes ?? [], this.services);
  }

  /** The unit's services, once a gateway; as they come, the forms naming another service made again (but one being changed). */
  private readServices(): void {
    const client = this.open?.client ?? null;
    if (!client || client === this.servicesOf) {
      return;
    }
    this.servicesOf = client;
    this.services = [];
    esfSubscribe(
      client.componentFactories(),
      this.destroyRef,
      (services) => {
        if (client !== this.open?.client) {
          return;
        }
        this.services = services as EsfComponentFactory[];
        for (const entry of this.forms.values()) {
          const config = entry.config;
          if (config && entry.form && !entry.form.dirty && (config.definition?.attributes ?? []).some(isEsfTarget)) {
            entry.form = this.formOf(config);
          }
        }
        this.cd.markForCheck();
      },
      () => undefined
    );
  }

  /** Read a component's settings (again) — kept in the view's settings read, so it opens at once next time. */
  read(pid: string): void {
    const client = this.open?.client;
    if (!client) {
      return;
    }
    const entry: ComponentForm = this.forms.get(pid) ?? { pid, loading: false, error: "", config: null, form: null, saving: false };
    this.forms.set(pid, entry);
    entry.loading = true;
    entry.error = "";
    esfSubscribe(
      client.call("esfCloudGetConfigs", { pids: [pid] }),
      this.destroyRef,
      (reply) => {
        if (client !== this.open?.client) {
          return;
        }
        entry.loading = false;
        entry.config = parseEsfConfigs(reply).find((c) => c.pid === pid) ?? null;
        if (entry.config) {
          this.open?.configs.set(pid, entry.config);
        }
        entry.form = entry.config ? this.formOf(entry.config) : null;
        if (!entry.config) {
          entry.error = "The unit returned no settings for this component.";
        }
        this.cd.markForCheck();
      },
      (reason) => {
        entry.loading = false;
        entry.error = reason;
        this.cd.markForCheck();
      }
    );
  }

  /** "Apply changes": the component's changed settings (a snapshot taken after); it's read again, the table too. */
  apply(c: ComponentForm): void {
    const client = this.open?.client;
    if (!client || !c.form || !c.form.dirty || c.form.invalid || c.saving) {
      return;
    }
    c.saving = true;
    esfSubscribe(
      client.call("esfCloudUpdateConfigs", esfUpdateRequest(c.pid, c.form.changes())),
      this.destroyRef,
      () => {
        c.saving = false;
        this.notify.emit({ tone: "success", message: "Settings applied" });
        this.read(c.pid);
        this.open?.changed();
      },
      (reason) => {
        c.saving = false;
        this.notify.emit({ tone: "error", message: `Couldn't save ${esfShortName(c.pid)}: ${reason}` });
        this.cd.markForCheck();
      }
    );
  }

  trackField(_: number, f: EsfField): string {
    return f.key;
  }

  // ---- Manage ----------------------------------------------------------------------------------------------------------------

  /** The tab its Manage card is under: the component's own (a connection's endpoint), else the first. */
  get manageTab(): string {
    const open = this.open;
    if (!open?.row) {
      return "";
    }
    return open.tabs.some((t) => t.id === open.row!.pid) ? open.row.pid : (open.tabs[0]?.id ?? "");
  }

  /** Connect, or (confirmed first) disconnect, the connection; its state read again after, the table too. */
  toggleConnection(): void {
    const open = this.open;
    const row = open?.row;
    if (!open || !row?.manager || this.busy) {
      return;
    }
    if (this.connected) {
      this.confirm.emit({
        heading: "Disconnect?",
        message: `${row.pid} will disconnect from its cloud until it's connected again.`,
        confirmLabel: "Disconnect",
        danger: true,
        run: () => this.setConnected(false),
      });
    } else {
      this.setConnected(true);
    }
  }

  /** Delete: confirmed first — a connection with its stack, or the publisher / subscriber; the panel closes, the table reads again. */
  askDelete(): void {
    const open = this.open;
    const row = open?.row;
    if (!open || !row || this.busy) {
      return;
    }
    this.confirm.emit({
      heading: `Delete ${row.pid}?`,
      message:
        row.kind === "connection"
          ? "The connection's stack (its CloudService, DataService, transport) is deleted with it. This can't be undone."
          : `The ${row.type.toLowerCase()} will be deleted from the unit. This can't be undone.`,
      confirmLabel: "Delete",
      danger: true,
      run: () => {
        this.busy = "delete";
        const call =
          row.kind === "connection"
            ? open.client.call("esfCloudDeleteEndpoint", { cloudConnectionFactoryPid: row.connectionFactoryPid, cloudEndpointPid: row.pid })
            : open.client.call("esfCloudDeletePubSub", { pid: row.pid });
        esfSubscribe(
          call,
          this.destroyRef,
          () => {
            this.busy = "";
            this.notify.emit({ tone: "success", message: "Settings applied" });
            open.changed();
            this.done.emit();
          },
          (reason) => {
            this.busy = "";
            this.notify.emit({ tone: "error", message: `Couldn't delete ${row.pid}: ${reason}` });
            this.cd.markForCheck();
          }
        );
      },
    });
  }

  private setConnected(connect: boolean): void {
    const open = this.open;
    const row = open?.row;
    if (!open || !row) {
      return;
    }
    this.busy = "connection";
    this.cd.markForCheck();
    esfSubscribe(
      open.client.call(connect ? "esfCloudConnect" : "esfCloudDisconnect", { cloudEndpointPid: row.pid }),
      this.destroyRef,
      () => {
        this.notify.emit({ tone: "success", message: "Settings applied" });
        open.changed();
        // Its state as ESF has it now.
        esfSubscribe(
          open.client.call("esfCloudIsConnected", { cloudEndpointPid: row.pid }),
          this.destroyRef,
          (reply) => {
            this.busy = "";
            this.connected = parseEsfConnected(reply);
            this.cd.markForCheck();
          },
          () => {
            this.busy = "";
            this.connected = connect;
            this.cd.markForCheck();
          }
        );
      },
      (reason) => {
        this.busy = "";
        this.notify.emit({ tone: "error", message: `Couldn't ${connect ? "connect" : "disconnect"} ${row.pid}: ${reason}` });
        this.cd.markForCheck();
      }
    );
  }

  // ---- Create new ------------------------------------------------------------------------------------------------------------

  /** The kind picked: its factories, the first picked. */
  onKind(): void {
    const open = this.open;
    this.factoryOptions =
      this.kind === "connection"
        ? esfFactoryOptions((open?.connectionFactories ?? []).map((f) => f.pid))
        : esfFactoryOptions((open?.pubSubFactories ?? []).map((f) => f.factoryPid));
    this.onFactory(this.factoryOptions[0]?.value ?? "");
  }

  /** A factory picked: its suggested PID, and (a publisher / subscriber) the connections it can serve. */
  onFactory(factory: string): void {
    this.factory = factory;
    const open = this.open;
    if (this.kind === "connection") {
      this.pid = open?.connectionFactories.find((f) => f.pid === factory)?.defaultPid ?? "";
      this.connectionOptions = [];
      this.connection = "";
    } else {
      const f = open?.pubSubFactories.find((x) => x.factoryPid === factory);
      this.pid = f?.defaultPid ?? "";
      this.connectionOptions = (open?.connections ?? [])
        .filter((c) => !f || !f.connectionFactoryPid || c.connectionFactoryPid === f.connectionFactoryPid)
        .map((c) => ({ value: c.pid, label: c.pid }));
      this.connection = this.connectionOptions[0]?.value ?? "";
    }
  }

  get pidError(): string {
    const open = this.open;
    const regex =
      this.kind === "connection"
        ? (open?.connectionFactories.find((f) => f.pid === this.factory)?.pidRegex ?? "")
        : (open?.pubSubFactories.find((f) => f.factoryPid === this.factory)?.pidRegex ?? "");
    return esfCloudPidError(this.pid, regex);
  }

  get createInvalid(): boolean {
    return !this.factory || !!this.pidError || (this.kind === "pubsub" && !this.connection);
  }

  /** "Create": the connection (its stack with it) or the publisher / subscriber, on the unit; the table read again. */
  create(): void {
    this.tried = true;
    const client = this.open?.client;
    if (!client || this.createInvalid || this.creating) {
      return;
    }
    const pid = this.pid.trim();
    const call =
      this.kind === "connection"
        ? client.call("esfCloudCreateEndpoint", { cloudConnectionFactoryPid: this.factory, cloudEndpointPid: pid })
        : client.call("esfCloudCreatePubSub", { pid, factoryPid: this.factory, cloudEndpointPid: this.connection });
    this.creating = true;
    esfSubscribe(
      call,
      this.destroyRef,
      () => {
        this.creating = false;
        this.notify.emit({ tone: "success", message: "Settings applied" });
        this.open?.changed();
        this.done.emit();
      },
      (reason) => {
        this.creating = false;
        this.notify.emit({ tone: "error", message: `Couldn't create ${pid}: ${reason}` });
        this.cd.markForCheck();
      }
    );
  }
}
