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
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { debounceTime, filter, Subscription, take } from "rxjs";
import { WidgetContext } from "@home/models/widget-component.models";
import { ToastTone } from "../../../../components/shared/toasts/toasts.component";
import { EsfComponentConfig, ESF_CONFIG_API, ESF_NETWORK_CONFIG_API } from "../../../models/esf.models";
import { EsfClient, EsfConfirm, EsfInterface } from "../../../models/esf-api.models";
import { ESF_NETWORK_SERVICE } from "../../../models/esf-interface.models";
import { ConnectorRow } from "../../../models/gateway-management.models";
import { EsfComponentOpen, EsfSecurityComponent } from "../esf-security/esf-security.component";
import { EsfSettingsComponent } from "../../esf-settings/esf-settings.component";
import { EsfFirewallRuleOpen } from "../../esf-firewall-rule/esf-firewall-rule.component";
import { EsfCloudOpen } from "../../esf-cloud-panel/esf-cloud-panel.component";
import { EsfUserOpen } from "../../esf-user/esf-user.component";
import { EsfAssetsComponent } from "../esf-assets/esf-assets.component";
import { EsfCloudComponent } from "../esf-cloud/esf-cloud.component";
import { EsfCommandComponent } from "../esf-command/esf-command.component";
import { EsfInterfaceRowOpen, EsfNetworkStatusComponent } from "../esf-network-status/esf-network-status.component";
import { EsfSnapshotsComponent } from "../esf-snapshots/esf-snapshots.component";
import { EsfSoftwareComponent } from "../esf-software/esf-software.component";
import { EsfStatusComponent } from "../esf-status/esf-status.component";
import { EsfSystemComponent } from "../esf-system/esf-system.component";
import { EsfUsersComponent } from "../esf-users/esf-users.component";
import { EsfWiresComponent } from "../esf-wires/esf-wires.component";

/** An ESF view (an entry under ESF in the gateway page's menu). */
export type EsfView = "configuration" | "security" | "snapshots" | "network" | "cloud" | "software" | "status" | "device" | "users" | "command" | "assets" | "wires";

/** The views, in the menu's order. */
export const ESF_VIEWS: { id: EsfView; label: string; icon: string }[] = [
  { id: "status", label: "Status", icon: "monitor_heart" },
  { id: "device", label: "Device", icon: "memory" },
  { id: "configuration", label: "Configuration", icon: "tune" },
  { id: "security", label: "Security", icon: "shield" },
  { id: "snapshots", label: "Snapshots", icon: "history" },
  { id: "network", label: "Network", icon: "lan" },
  { id: "cloud", label: "Cloud connections", icon: "cloud" },
  { id: "software", label: "Software", icon: "deployed_code" },
  { id: "users", label: "Users", icon: "group" },
  { id: "command", label: "Command", icon: "terminal" },
  { id: "assets", label: "Drivers and assets", icon: "settings_input_component" },
  { id: "wires", label: "Wire graph", icon: "account_tree" },
];

/** An interface opened in the Network view: its settings, in the dashboard's side panel (with the gateway's client). */
export interface EsfInterfaceOpen {
  client: EsfClient;
  iface: EsfInterface;
  /** The network configuration the interfaces' table read (the panel's form starts from it, nothing read again); null none. */
  config: EsfComponentConfig | null;
}

/** How long the unit has to be quiet (no call waiting) before the next view is read ahead. */
const READ_AHEAD_QUIET_MS = 600;

/**
 * The gateway page's ESF views (the gateway runs on the ESF unit), picked in the page's menu under ESF — Configuration (the
 * components' settings), Snapshots (take one, roll back to one), Network (its interfaces' status — a row opens its settings in
 * the dashboard's side panel — then the firewall), Cloud connections,
 * Software (packages, bundles, containers), Status (cloud services, network settings, position, tamper detection — ESF's Status
 * page), Device (its profile, properties and security — ESF's Device page), Users, Command, Assets, Wire graph (the graph drawn,
 * a component's settings under it) —
 * each made when it's first opened, or read ahead in the background (one at a time, while the unit is quiet), and kept: going
 * back to one shows it at once. One `EsfClient` for the gateway, handed to every view; their toasts and confirmations go up to
 * the dashboard (its toasts and themed dialog).
 */
@Component({
  selector: "tb-gm-esf",
  templateUrl: "./esf-host.component.html",
  styleUrls: ["./esf-host.component.scss"],
  standalone: true,
  imports: [
    CommonModule,
    EsfSettingsComponent,
    EsfSecurityComponent,
    EsfAssetsComponent,
    EsfCloudComponent,
    EsfCommandComponent,
    EsfNetworkStatusComponent,
    EsfSnapshotsComponent,
    EsfSoftwareComponent,
    EsfStatusComponent,
    EsfSystemComponent,
    EsfUsersComponent,
    EsfWiresComponent,
  ],
})
export class EsfHostComponent implements OnChanges {
  @Input() ctx!: WidgetContext;
  /** The gateway's device (the calls go to it). */
  @Input() gatewayId = "";
  @Input() gatewayName = "";
  /** The gateway's ESF connector. */
  @Input() connector: ConnectorRow | null = null;
  /** The view shown (the page's menu picks it). */
  @Input() view: EsfView = "status";
  /** A view asks for another (Software's "Open in Configuration"): the page's menu follows. */
  @Output() viewChange = new EventEmitter<EsfView>();
  /** The interface whose settings the side panel shows (its row lit); "" none. */
  @Input() openInterface = "";
  /** Changed: the interfaces' status is read again (an interface's settings applied). */
  @Input() statusRefresh = 0;
  /** An interface row clicked: its settings, in the dashboard's side panel. */
  @Output() interfaceOpen = new EventEmitter<EsfInterfaceOpen>();
  /** A firewall rule to open in the dashboard's side panel (its form). */
  @Output() ruleOpen = new EventEmitter<EsfFirewallRuleOpen>();
  /** A cloud component (its settings, or "Create new") to open in the dashboard's side panel. */
  @Output() cloudOpen = new EventEmitter<EsfCloudOpen>();
  /** A user (or "Create new") to open in the dashboard's side panel. */
  @Output() userOpen = new EventEmitter<EsfUserOpen>();
  /** A component's row (the Security view's SSL managers, keystores): its settings in the dashboard's side panel. */
  @Output() componentOpen = new EventEmitter<EsfComponentOpen>();
  @Output() notify = new EventEmitter<{ tone: ToastTone; message: string }>();
  @Output() confirm = new EventEmitter<EsfConfirm>();

  readonly configApi = ESF_CONFIG_API;
  /** The Network view's firewall card leaves out the network configuration (edited an interface at a time, in the side panel). */
  readonly networkServicePids = [ESF_NETWORK_SERVICE];
  readonly networkApi = ESF_NETWORK_CONFIG_API;
  /** The component the Configuration view opens on (another view's "Open in Configuration"); "" none. */
  openPid = "";
  client: EsfClient | null = null;

  /** The views made so far (opened, or read ahead): kept, hidden while another shows. */
  kept = new Set<EsfView>();

  /** The gateway and its connector's calls the client is for: the dashboard rebuilds its connector rows often (their error counts). */
  private clientKey = "";
  private readAhead: Subscription | null = null;

  constructor(
    private cd: ChangeDetectorRef,
    private destroyRef: DestroyRef
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    // Away from Configuration: its "Open in Configuration" component is done with.
    if (changes["view"] && this.view !== "configuration") {
      this.openPid = "";
    }
    const key = `${this.gatewayId}|${JSON.stringify(this.connector?.connector.configurationJson?.["serverSideRpc"] ?? null)}`;
    if (key !== this.clientKey) {
      this.clientKey = key;
      // A new client (the views read again) only for another gateway, or a change to its connector's calls.
      this.client = this.gatewayId && this.ctx ? new EsfClient(this.ctx, this.gatewayId, this.connector) : null;
      this.kept = new Set();
    }
    this.kept.add(this.view);
    this.readNextAhead();
  }

  openInterfaceSettings(open: EsfInterfaceRowOpen): void {
    if (this.client) {
      this.interfaceOpen.emit({ client: this.client, iface: open.iface, config: open.config });
    }
  }

  /** Another view's "Open in Configuration": the Configuration view, on that component. */
  openComponent(pid: string): void {
    this.openPid = pid;
    this.viewChange.emit("configuration");
  }

  /**
   * The views not made yet, read ahead one at a time: once the unit has been quiet for a moment (the view shown, or the last
   * one read ahead, has its replies), the next in the menu's order is made — hidden — and reads as it would when opened.
   */
  private readNextAhead(): void {
    this.readAhead?.unsubscribe();
    const client = this.client;
    if (!client || ESF_VIEWS.every((v) => this.kept.has(v.id))) {
      return;
    }
    this.readAhead = client.idle$
      .pipe(debounceTime(READ_AHEAD_QUIET_MS), filter(Boolean), take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        const next = client === this.client ? ESF_VIEWS.find((v) => !this.kept.has(v.id)) : undefined;
        if (next) {
          this.kept.add(next.id);
          this.cd.markForCheck();
          this.readNextAhead();
        }
      });
  }
}
