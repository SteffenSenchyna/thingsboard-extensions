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
import { CalloutComponent } from "../../../../components/shared/callout/callout.component";
import { DataTableCellDirective, DataTableColumn, DataTableComponent } from "../../../../components/shared/data-table/data-table.component";
import { StatusPillComponent, StatusPillTone } from "../../../../components/shared/status-pill/status-pill.component";
import { EsfClient, EsfInterface, esfSubscribe, parseEsfInterfaces } from "../../../models/esf-api.models";
import { ESF_NETWORK_SERVICE } from "../../../models/esf-interface.models";
import { EsfComponentConfig, ESF_NETWORK_CONFIG_API, parseEsfConfigs } from "../../../models/esf.models";

/** An interface row opened: the interface, and the network configuration read with the status (its settings, every interface's). */
export interface EsfInterfaceRowOpen {
  iface: EsfInterface;
  config: EsfComponentConfig | null;
}

/** An interface ESF's console calls disabled: its IPv4 and its IPv6 both Disabled in the network configuration. */
function configuredOff(config: EsfComponentConfig | null, id: string): boolean {
  const value = (setting: string) => config?.properties[`net.interface.${id}.${setting}`]?.value;
  const ip4 = value("config.ip4.status");
  const ip6 = value("config.ip6.status");
  return ip4 === "netIPv4StatusDisabled" && (ip6 === undefined || ip6 === null || ip6 === "" || ip6 === "netIPv6StatusDisabled");
}

/** An interface's state as its pill's tone: ACTIVATED connected, FAILED an error, the steps on the way a warning, the rest neutral. */
function stateTone(state: string): StatusPillTone {
  const s = state.toUpperCase();
  if (s === "ACTIVATED") {
    return "success";
  }
  if (s === "FAILED") {
    return "error";
  }
  return ["PREPARE", "CONFIG", "NEED_AUTH", "IP_CONFIG", "IP_CHECK", "SECONDARIES", "DEACTIVATING"].includes(s) ? "warning" : "neutral";
}

/**
 * The ESF unit's network interfaces as it reports them (Network Status v1, `rest.network.status`): a row each — its name, type,
 * state, IPv4 addresses, gateway and MAC — the loopback last; the interfaces it couldn't read named under the table. Its state
 * "Disabled" where the network configuration (read with the status — Network Configuration v1) has it disabled, as ESF's console
 * says. A row opens the interface's settings (`open`: the dashboard's side panel, given the configuration read here).
 */
@Component({
  selector: "tb-gm-esf-network-status",
  templateUrl: "./esf-network-status.component.html",
  styleUrls: ["./esf-network-status.component.scss"],
  standalone: true,
  imports: [CommonModule, CalloutComponent, DataTableComponent, DataTableCellDirective, StatusPillComponent],
})
export class EsfNetworkStatusComponent implements OnChanges {
  @Input() client: EsfClient | null = null;
  /** The interface whose settings are open (its row lit); "" none. */
  @Input() openId = "";
  /** Changed: the status is read again (an interface's settings applied). */
  @Input() refreshKey = 0;
  /** A row clicked: that interface's settings. */
  @Output() open = new EventEmitter<EsfInterfaceRowOpen>();

  readonly columns: DataTableColumn[] = [
    { key: "name", phone: "title", header: "Interface", emphasis: "strong", nowrap: true },
    { key: "type", phone: "sub", header: "Type", emphasis: "muted", nowrap: true },
    { key: "state", phone: "trail", header: "State" },
    { key: "ip4", phone: "sub", header: "IPv4" },
    { key: "gateway", phone: "hide", header: "Gateway", emphasis: "muted" },
    { key: "mac", phone: "hide", header: "MAC", emphasis: "muted", nowrap: true },
  ];
  rows: Array<EsfInterface & { tone: StatusPillTone; stateLabel: string }> = [];
  /** The network configuration read with the status (null: not read — its interfaces' states as the status has them). */
  config: EsfComponentConfig | null = null;
  failures: string[] = [];
  loading = false;
  error = "";

  constructor(
    private cd: ChangeDetectorRef,
    private destroyRef: DestroyRef
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["client"] || (changes["refreshKey"] && !changes["refreshKey"].firstChange)) {
      this.load();
    }
  }

  /**
   * The status and the network configuration read (again), together: the rows show once both are in (a configuration that can't
   * be read leaves the states as the status has them).
   */
  load(): void {
    const client = this.client;
    this.error = "";
    if (!client) {
      return;
    }
    this.loading = true;
    let status: ReturnType<typeof parseEsfInterfaces> | null = null;
    let config: EsfComponentConfig | null = null;
    let waiting = 2;
    const done = () => {
      if (--waiting > 0 || client !== this.client) {
        return;
      }
      this.loading = false;
      this.config = config;
      if (status) {
        this.rows = status.interfaces.map((i) => {
          const off = configuredOff(config, i.id);
          return { ...i, tone: off ? "neutral" : stateTone(i.state), stateLabel: off ? "Disabled" : i.state || "Unknown" };
        });
        this.failures = status.failures;
      }
      this.cd.markForCheck();
    };
    esfSubscribe(
      client.call("esfNetStatus"),
      this.destroyRef,
      (reply) => {
        status = parseEsfInterfaces(reply);
        done();
      },
      (reason) => {
        if (client === this.client) {
          this.error = reason;
        }
        done();
      }
    );
    esfSubscribe(
      client.call(ESF_NETWORK_CONFIG_API.getConfig, { pids: [ESF_NETWORK_SERVICE] }),
      this.destroyRef,
      (reply) => {
        config = parseEsfConfigs(reply).find((c) => c.pid === ESF_NETWORK_SERVICE) ?? null;
        done();
      },
      () => done()
    );
  }

  openRow(row: EsfInterface): void {
    this.open.emit({ iface: row, config: this.config });
  }
}
