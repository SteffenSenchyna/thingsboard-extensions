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
import { CalloutComponent } from "../../../../components/shared/callout/callout.component";
import { CollapsibleCardComponent } from "../../../../components/shared/collapsible-card/collapsible-card.component";
import { DetailBlockComponent, DetailRowComponent, DetailRowsComponent } from "../../../../components/shared/detail-rows/detail-rows.component";
import { SkeletonCardComponent } from "../../../../components/shared/skeleton-card/skeleton-card.component";
import { StatusPillComponent } from "../../../../components/shared/status-pill/status-pill.component";
import { formatDateTime } from "../../../../components/shared/time-format";
import { ToastTone } from "../../../../components/shared/toasts/toasts.component";
import { fmtNumber } from "../../../../components/shared/value-utils";
import {
  EsfClient,
  EsfConfirm,
  EsfInterface,
  EsfPosition,
  esfReason,
  esfSubscribe,
  EsfTamperService,
  parseEsfCloudInstances,
  parseEsfInterfaces,
  parseEsfLocked,
  parseEsfPosition,
  parseEsfProperties,
  parseEsfTamperList,
  parseEsfTamperStatus,
} from "../../../models/esf-api.models";
import { ESF_CLOUD_MANAGER, parseEsfStackPids } from "../../../models/esf-cloud.models";
import { prefixToMask } from "../../../models/esf-interface-form.models";
import { ESF_NETWORK_SERVICE } from "../../../models/esf-interface.models";
import { EsfCallError, EsfComponentConfig, ESF_NETWORK_CONFIG_API, parseEsfConfigs } from "../../../models/esf.models";

/**
 * A gateway whose ESF has no tamper detection service (its `tamper/v1/list` answers 404 — dev-inf-gw-01 and dev-nb-gw-03 have none,
 * agg-3a12-gw-01 has one), kept in this browser by the gateway's device id: the Status view stops asking at every load (each
 * refusal is an ERROR line in the gateway's log), its card says so, and "Check again" asks anew.
 */
const NO_TAMPER_KEY = "tb.esf.noTamper.";

function remembersNoTamper(gatewayId: string): boolean {
  try {
    return localStorage.getItem(NO_TAMPER_KEY + gatewayId) === "1";
  } catch {
    return false;
  }
}

function rememberNoTamper(gatewayId: string, none: boolean): void {
  try {
    if (none) {
      localStorage.setItem(NO_TAMPER_KEY + gatewayId, "1");
    } else {
      localStorage.removeItem(NO_TAMPER_KEY + gatewayId);
    }
  } catch {
    // No storage (a private window): it's asked again next time.
  }
}

/** A Cloud Services block: a connection ESF connects, its rows (its transport's settings and its state). */
interface CloudStatus {
  pid: string;
  connected: boolean;
  rows: { label: string; value: string }[];
}

/** A network settings card (Cellular, Ethernet, Wireless) and its interfaces, each a block of label / value rows. */
interface NetworkCard {
  title: string;
  interfaces: { name: string; rows: { label: string; value: string }[] }[];
}

interface TamperRow extends EsfTamperService {
  tampered: boolean | null;
  since: string;
}

const IP4_MODE: Record<string, string> = {
  netIPv4StatusEnabledLAN: "LAN",
  netIPv4StatusEnabledWAN: "WAN",
  netIPv4StatusL2Only: "Layer 2 Only",
  netIPv4StatusUnmanaged: "Not Managed",
};
const IP6_MODE: Record<string, string> = { netIPv6StatusEnabledLAN: "LAN", netIPv6StatusEnabledWAN: "WAN" };

/**
 * The ESF unit's status, as ESF's console's Status page: Cloud Services (each connection ESF connects: its status, name, broker
 * URL, account, client ID and user name — its transport's settings, Cloud Connection v1), the Cellular, Ethernet and Wireless
 * Settings (each interface's IPv4 — address, mask, mode, how it's acquired, router mode; a modem's APN and interface — and IPv6,
 * from the network configuration and status), the Position Status (Position v1) and the Tamper Detection Status (a service
 * tampered can be reset, confirmed). Read when it opens; Refresh reads it all again.
 */
@Component({
  selector: "tb-gm-esf-status",
  templateUrl: "./esf-status.component.html",
  styleUrls: ["./esf-status.component.scss"],
  standalone: true,
  imports: [CommonModule, CalloutComponent, CollapsibleCardComponent, DetailBlockComponent, DetailRowComponent, DetailRowsComponent, SkeletonCardComponent, StatusPillComponent],
})
export class EsfStatusComponent implements OnChanges {
  @Input() client: EsfClient | null = null;
  @Output() notify = new EventEmitter<{ tone: ToastTone; message: string }>();
  @Output() confirm = new EventEmitter<EsfConfirm>();

  cloud: CloudStatus[] = [];
  cloudLoading = false;
  cloudError = "";
  network: NetworkCard[] = [];
  networkLoading = false;
  networkError = "";
  position: EsfPosition | null = null;
  locked: boolean | null = null;
  positionError = "";
  tamper: TamperRow[] = [];
  tamperLoading = false;
  tamperError = "";
  /** The unit has no tamper detection service (its list answered 404): the card says so, nothing asked at every load. */
  tamperNone = false;
  /** The action running ("" none). */
  busy = "";

  constructor(
    private cd: ChangeDetectorRef,
    private destroyRef: DestroyRef
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["client"]) {
      this.refresh();
    }
  }

  /** Everything read again (the page's Refresh). */
  refresh(): void {
    this.loadCloud();
    this.loadNetwork();
    this.loadPosition();
    this.loadTamper();
  }

  // ---- Cloud Services ---------------------------------------------------------------------------------------------------------

  /** Each connection ESF connects, its transport's settings: the instances, each one's stack, its transport's settings — all in. */
  loadCloud(): void {
    const client = this.client;
    if (!client) {
      return;
    }
    this.cloudLoading = true;
    this.cloudError = "";
    let mac = "";
    let managers: { pid: string; connected: boolean; transport: EsfComponentConfig | null }[] = [];
    // Two reads to wait for — the unit's MAC (the client ID unless one's set) and the connections with their transports.
    let waiting = 2;
    const done = () => {
      if (--waiting > 0 || client !== this.client) {
        return;
      }
      this.cloud = managers.map((m) => ({ pid: m.pid, connected: m.connected, rows: this.cloudRows(m.pid, m.transport, mac, m.connected) }));
      this.cloudLoading = false;
      this.cd.markForCheck();
    };
    esfSubscribe(
      client.call("esfFrameworkProperties"),
      this.destroyRef,
      (reply) => {
        mac = parseEsfProperties(reply).find((p) => p.key === "primaryMacAddress")?.value ?? "";
        done();
      },
      () => done()
    );
    esfSubscribe(
      client.call("esfCloudInstances"),
      this.destroyRef,
      (reply) => {
        const endpoints = parseEsfCloudInstances(reply).endpoints.filter((e) => e.type === ESF_CLOUD_MANAGER);
        managers = endpoints.map((e) => ({ pid: e.pid, connected: e.state.toUpperCase() === "CONNECTED", transport: null }));
        let left = endpoints.length;
        if (!left) {
          done();
          return;
        }
        const oneDone = () => {
          if (--left === 0) {
            done();
          }
        };
        endpoints.forEach((e, i) => {
          esfSubscribe(
            client.call("esfCloudStackPids", { cloudConnectionFactoryPid: e.factoryPid, cloudEndpointPid: e.pid }),
            this.destroyRef,
            (pidsReply) => {
              const transport = parseEsfStackPids(pidsReply).find((pid) => /Transport/i.test(pid));
              if (!transport) {
                oneDone();
                return;
              }
              esfSubscribe(
                client.call("esfCloudGetConfigs", { pids: [transport] }),
                this.destroyRef,
                (configReply) => {
                  managers[i].transport = parseEsfConfigs(configReply)[0] ?? null;
                  oneDone();
                },
                () => oneDone()
              );
            },
            () => oneDone()
          );
        });
      },
      (reason) => {
        if (client === this.client) {
          this.cloudError = reason;
        }
        done();
      }
    );
  }

  /**
   * A connection's rows (the user's order): its status, its name, the broker URL, the account, the client ID (the unit's MAC unless
   * set), then the user name — each only when it has a value.
   */
  private cloudRows(pid: string, transport: EsfComponentConfig | null, mac: string, connected: boolean): { label: string; value: string }[] {
    const prop = (key: string) => {
      const v = transport?.properties[key]?.value;
      return v === undefined || v === null ? "" : String(v);
    };
    return [
      { label: "Service Status", value: connected ? "CONNECTED" : "DISCONNECTED" },
      { label: "Connection Name", value: pid },
      { label: "Broker URL", value: prop("broker-url") },
      { label: "Account", value: prop("topic.context.account-name") },
      { label: "Client ID", value: prop("client-id") || mac },
      { label: "Username", value: prop("username") },
    ].filter((r) => r.value !== "");
  }

  // ---- Network settings -------------------------------------------------------------------------------------------------------

  /** The interfaces' status and the network configuration, together: the Cellular, Ethernet and Wireless cards once both are in. */
  loadNetwork(): void {
    const client = this.client;
    if (!client) {
      return;
    }
    this.networkLoading = true;
    this.networkError = "";
    let interfaces: EsfInterface[] = [];
    let config: EsfComponentConfig | null = null;
    let waiting = 2;
    const done = () => {
      if (--waiting > 0 || client !== this.client) {
        return;
      }
      this.network = this.networkCards(interfaces, config);
      this.networkLoading = false;
      this.cd.markForCheck();
    };
    esfSubscribe(
      client.call("esfNetStatus"),
      this.destroyRef,
      (reply) => {
        interfaces = parseEsfInterfaces(reply).interfaces;
        done();
      },
      (reason) => {
        if (client === this.client) {
          this.networkError = reason;
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

  /** The cards ESF's Status page shows — Cellular, Ethernet, Wireless — each interface of the kind with its IPv4 and IPv6. */
  private networkCards(interfaces: EsfInterface[], config: EsfComponentConfig | null): NetworkCard[] {
    const kinds: [string, string][] = [
      ["MODEM", "Cellular Settings"],
      ["ETHERNET", "Ethernet Settings"],
      ["WIFI", "Wireless Settings"],
    ];
    return kinds
      .map(([type, title]) => ({
        title,
        interfaces: interfaces
          .filter((i) => i.type.toUpperCase() === type)
          .map((i) => ({ name: i.name !== i.id ? `${i.id} (${i.name})` : i.id, rows: this.interfaceRows(i, config, type === "MODEM") })),
      }))
      .filter((card) => card.interfaces.length);
  }

  private interfaceRows(i: EsfInterface, config: EsfComponentConfig | null, modem: boolean): { label: string; value: string }[] {
    const get = (setting: string) => {
      const v = config?.properties[`net.interface.${i.id}.${setting}`]?.value;
      return v === undefined || v === null ? "" : String(v);
    };
    const ip4Status = get("config.ip4.status");
    const ip6Status = get("config.ip6.status");
    const rows: { label: string; value: string }[] = [];
    if (!ip4Status || ip4Status === "netIPv4StatusDisabled") {
      rows.push({ label: "IPv4", value: "Disabled" });
    } else {
      const dhcp = get("config.dhcpClient4.enabled") !== "false";
      const [address, prefix] = (i.ip4.split(",")[0] ?? "").trim().split("/");
      const dhcpServer = get("config.dhcpServer4.enabled") === "true";
      const nat = get("config.nat.enabled") === "true";
      rows.push(
        { label: "IPv4", value: address || get("config.ip4.address") },
        { label: "Subnet Mask", value: prefixToMask(prefix ?? get("config.ip4.prefix")) },
        { label: "Mode", value: IP4_MODE[ip4Status] ?? ip4Status },
        { label: "IP Acquisition", value: dhcp ? "DHCP" : "Manual" }
      );
      if (!modem && ip4Status === "netIPv4StatusEnabledLAN") {
        rows.push({ label: "Router Mode", value: dhcpServer && nat ? "DHCPD and NAT" : dhcpServer ? "DHCPD" : nat ? "NAT" : "" });
      }
      if (modem) {
        rows.push({ label: "APN", value: get("config.apn") }, { label: "Interface", value: i.name });
      }
    }
    const ip6 = IP6_MODE[ip6Status];
    rows.push({ label: "IPv6", value: ip6 ? [i.ip6.split(",")[0]?.trim(), ip6].filter(Boolean).join(" · ") : "Disabled" });
    return rows.filter((r) => r.value !== "");
  }

  // ---- Position, tamper detection ---------------------------------------------------------------------------------------------

  /**
   * The GNSS lock, then — only with a lock — the position: without one ESF answers the position with a 500, an ERROR line in the
   * gateway's log at every load (the card shows 0, as ESF's page does).
   */
  loadPosition(): void {
    const client = this.client;
    if (!client) {
      return;
    }
    this.positionError = "";
    esfSubscribe(
      client.call("esfPositionLocked"),
      this.destroyRef,
      (reply) => {
        if (client !== this.client) {
          return;
        }
        this.locked = parseEsfLocked(reply);
        if (this.locked) {
          this.readPosition(client);
        } else {
          this.position = null;
        }
        this.cd.markForCheck();
      },
      (reason) => {
        if (client === this.client) {
          this.positionError = reason;
          this.cd.markForCheck();
        }
      }
    );
  }

  private readPosition(client: EsfClient): void {
    esfSubscribe(
      client.call("esfPosition"),
      this.destroyRef,
      (reply) => {
        if (client === this.client) {
          this.position = parseEsfPosition(reply);
          this.cd.markForCheck();
        }
      },
      // ESF refused it (dev-nb-gw-03 answers 500 even with a lock): the figures show 0, as ESF's page does.
      () => undefined
    );
  }

  /** A position's figure, as ESF's Status page shows it (0.0 without a fix). */
  figure(value: number | null | undefined, unit = "", decimals = 1): string {
    return `${fmtNumber(value ?? 0, decimals)}${unit ? " " + unit : ""}`;
  }

  /**
   * The tamper detection services and their state — not asked when this browser knows the unit has none (`NO_TAMPER_KEY`), unless
   * `again` ("Check again"); a 404 is that: none, remembered, no error.
   */
  loadTamper(again = false): void {
    const client = this.client;
    if (!client) {
      return;
    }
    this.tamperError = "";
    if (!again && remembersNoTamper(client.gatewayId)) {
      this.tamper = [];
      this.tamperNone = true;
      return;
    }
    this.tamperLoading = true;
    this.tamperNone = false;
    client
      .call("esfTamperList")
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (reply) => {
          if (client !== this.client) {
            return;
          }
          rememberNoTamper(client.gatewayId, false);
          this.tamper = parseEsfTamperList(reply).map((t) => ({ ...t, tampered: null, since: "" }));
          this.tamperLoading = false;
          this.tamper.forEach((t) => this.readTamper(t.pid));
          this.cd.markForCheck();
        },
        error: (err) => {
          if (client !== this.client) {
            return;
          }
          this.tamperLoading = false;
          if (err instanceof EsfCallError && err.status === 404) {
            rememberNoTamper(client.gatewayId, true);
            this.tamper = [];
            this.tamperNone = true;
          } else {
            this.tamperError = esfReason(err);
          }
          this.cd.markForCheck();
        },
      });
  }

  askResetTamper(t: TamperRow): void {
    this.confirm.emit({
      heading: "Reset tamper status?",
      message: `${t.name} will report the device as not tampered until it detects tampering again.`,
      confirmLabel: "Reset",
      danger: true,
      run: () => this.resetTamper(t),
    });
  }

  trackName(_: number, x: { name?: string; pid?: string; title?: string }): string {
    return x.pid ?? x.name ?? x.title ?? "";
  }

  trackRow(_: number, r: { label: string }): string {
    return r.label;
  }

  private readTamper(pid: string): void {
    const client = this.client;
    if (!client) {
      return;
    }
    esfSubscribe(
      client.call("esfTamperStatus", undefined, { pid }),
      this.destroyRef,
      (reply) => {
        if (client === this.client) {
          const status = parseEsfTamperStatus(reply);
          this.tamper = this.tamper.map((t) =>
            t.pid === pid ? { ...t, tampered: status.tampered, since: status.tampered && status.timestamp ? formatDateTime(status.timestamp) : "" } : t
          );
          this.cd.markForCheck();
        }
      },
      () => undefined
    );
  }

  private resetTamper(t: TamperRow): void {
    const client = this.client;
    if (!client || this.busy) {
      return;
    }
    this.busy = t.pid;
    esfSubscribe(
      client.call("esfTamperReset", undefined, { pid: t.pid }),
      this.destroyRef,
      () => {
        this.busy = "";
        this.notify.emit({ tone: "success", message: "Settings applied" });
        this.readTamper(t.pid);
      },
      (reason) => {
        this.busy = "";
        this.notify.emit({ tone: "error", message: reason });
        this.cd.markForCheck();
      }
    );
  }
}
