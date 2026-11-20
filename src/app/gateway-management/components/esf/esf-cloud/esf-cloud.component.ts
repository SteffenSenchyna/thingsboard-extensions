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

import { ChangeDetectorRef, Component, DestroyRef, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewChild } from "@angular/core";
import { CommonModule } from "@angular/common";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { Subject, Subscription, of } from "rxjs";
import { catchError, concatMap, first, map, switchMap } from "rxjs/operators";
import { CalloutComponent } from "../../../../components/shared/callout/callout.component";
import { DataTableCellDirective, DataTableColumn, DataTableComponent } from "../../../../components/shared/data-table/data-table.component";
import { TableManage } from "../../../../components/shared/data-table/table-manage";
import { StatusPillComponent } from "../../../../components/shared/status-pill/status-pill.component";
import { TableLinkComponent, TableLinksComponent } from "../../../../components/shared/table-links/table-links.component";
import { ToastTone } from "../../../../components/shared/toasts/toasts.component";
import { EsfClient, EsfConfirm, esfReason, esfSubscribe, parseEsfCloudInstances } from "../../../models/esf-api.models";
import { EsfCloudFactory, esfCloudRows, esfFactoryName, EsfCloudRow, EsfPubSubFactory, esfStackTab, parseEsfCloudFactories, parseEsfStackPids } from "../../../models/esf-cloud.models";
import { EsfComponentConfig, parseEsfConfigs } from "../../../models/esf.models";
import { EsfCloudOpen } from "../../esf-cloud-panel/esf-cloud-panel.component";

/**
 * The ESF unit's cloud connections, as ESF's console's Cloud Connections page (Cloud Connection v1, `rest.cloudconnection`): one
 * table — each connection, then its publishers and subscribers, each marked by its type's icon (a cloud, an arrow up, an arrow
 * down) — its Service PID, Type, Status (a connection ESF connects: Connected / Disconnected) and Factory PID. A row opens its
 * settings in the dashboard's side panel (`cloudOpen`: a connection's a tab a stack component — CloudService, DataService,
 * MqttDataTransport, … — its Manage card's Connect / Disconnect and Delete; a publisher's / subscriber's its own, its Delete);
 * "Create new" a new connection or publisher / subscriber there, from the unit's factories; Manage's "Delete (n)" deletes
 * (confirmed). Each connection's stack components are read ahead, so its panel opens at once.
 */
@Component({
  selector: "tb-gm-esf-cloud",
  templateUrl: "./esf-cloud.component.html",
  styleUrls: ["./esf-cloud.component.scss"],
  standalone: true,
  imports: [CommonModule, CalloutComponent, DataTableComponent, DataTableCellDirective, StatusPillComponent, TableLinkComponent, TableLinksComponent],
})
export class EsfCloudComponent implements OnChanges {
  @Input() client: EsfClient | null = null;
  @Output() notify = new EventEmitter<{ tone: ToastTone; message: string }>();
  @Output() confirm = new EventEmitter<EsfConfirm>();
  /** A row's settings, or "Create new", for the dashboard's side panel. */
  @Output() cloudOpen = new EventEmitter<EsfCloudOpen>();

  @ViewChild("table") table?: DataTableComponent;
  readonly manage = new TableManage(() => this.table, () => this.rows.length);

  readonly columns: DataTableColumn[] = [
    { key: "pid", phone: "title", header: "Service PID", emphasis: "strong", iconOf: (row) => row["icon"] },
    { key: "type", phone: "sub", header: "Type", emphasis: "muted", nowrap: true },
    { key: "status", phone: "trail", header: "Status" },
    // Its factory by name, the PID in its bubble (the user's pick: no PID line in the table); sorted by the PID.
    { key: "factoryPid", phone: "sub", header: "Factory", emphasis: "muted", tooltipOf: (row) => row["factoryPid"] },
  ];
  /** A factory PID's name (over the PID in the Factory column). */
  readonly factoryName = esfFactoryName;
  rows: EsfCloudRow[] = [];
  connectionFactories: EsfCloudFactory[] = [];
  pubSubFactories: EsfPubSubFactory[] = [];
  loading = false;
  error = "";
  /** A delete running: its progress. */
  deleting: { done: number; total: number } | null = null;
  /** The row whose settings are open in the side panel (lit); "" none. */
  openKey = "";
  /** Each connection's stack components (read ahead). */
  private stacks = new Map<string, string[]>();
  /**
   * Every component's settings, read ahead on page load — one at a time, only while nothing else waits on the unit — so a row's
   * panel opens on them at once (`EsfCloudOpen.configs`); read again after a refresh or a change (the table read again).
   */
  private configs = new Map<string, EsfComponentConfig>();
  /** The components waiting to be read ahead (each once), and the queue reading them. */
  private aheadQueued = new Set<string>();
  private readonly ahead = new Subject<string>();
  private aheadSub: Subscription | null = null;

  constructor(
    private cd: ChangeDetectorRef,
    private destroyRef: DestroyRef
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["client"]) {
      this.stacks.clear();
      this.startReadAhead();
      this.load();
    }
  }

  /** The read-ahead queue for this unit: a component at a time, each once the unit is quiet; a failed read left for its panel. */
  private startReadAhead(): void {
    this.aheadSub?.unsubscribe();
    this.aheadQueued.clear();
    this.configs = new Map();
    const client = this.client;
    if (!client) {
      return;
    }
    this.aheadSub = this.ahead
      .pipe(
        concatMap((pid) =>
          client.idle$.pipe(
            first((idle) => idle),
            switchMap(() => (this.configs.has(pid) ? of(null) : client.call("esfCloudGetConfigs", { pids: [pid] }))),
            catchError(() => of(null)),
            map((reply) => ({ pid, reply }))
          )
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(({ pid, reply }) => {
        this.aheadQueued.delete(pid);
        const config = reply ? parseEsfConfigs(reply).find((c) => c.pid === pid) : null;
        if (config && client === this.client) {
          this.configs.set(pid, config);
        }
      });
    // The unit's services too (one read, shared — `EsfClient.componentFactories`), once it's quiet: a panel's setting naming
    // another service (a transport's SSL manager) opens as a pick of them at once.
    client.idle$
      .pipe(
        first((idle) => idle),
        switchMap(() => client.componentFactories()),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe();
  }

  /** The components not yet read: each connection's stack and every publisher / subscriber, into the read-ahead queue. */
  private readAhead(): void {
    const pids = this.rows.flatMap((r) => (r.kind === "connection" ? (this.stacks.get(r.pid) ?? []) : [r.pid]));
    for (const pid of pids) {
      if (!this.configs.has(pid) && !this.aheadQueued.has(pid)) {
        this.aheadQueued.add(pid);
        this.ahead.next(pid);
      }
    }
  }

  /** The table read (again): the instances, then each connection's stack; the factories once. The settings read ahead go stale: read again. */
  load(): void {
    const client = this.client;
    this.error = "";
    this.configs.clear();
    if (!client) {
      return;
    }
    this.loading = true;
    esfSubscribe(
      client.call("esfCloudInstances"),
      this.destroyRef,
      (reply) => {
        if (client !== this.client) {
          return;
        }
        const instances = parseEsfCloudInstances(reply);
        this.rows = esfCloudRows(instances.endpoints, instances.pubsub);
        this.manage.keep(new Set(this.rows.map((r) => r.key)), "key");
        this.loading = false;
        this.rows.filter((r) => r.kind === "connection" && !this.stacks.has(r.pid)).forEach((r) => this.readStack(r));
        this.readAhead(); // the publishers / subscribers, and the stacks already known (the others once theirs are read)
        this.cd.markForCheck();
      },
      (reason) => {
        if (client === this.client) {
          this.loading = false;
          this.error = reason;
          this.cd.markForCheck();
        }
      }
    );
    if (!this.connectionFactories.length) {
      esfSubscribe(
        client.call("esfCloudFactories"),
        this.destroyRef,
        (reply) => {
          if (client === this.client) {
            const factories = parseEsfCloudFactories(reply);
            this.connectionFactories = factories.connections;
            this.pubSubFactories = factories.pubSubs;
            this.cd.markForCheck();
          }
        },
        () => undefined
      );
    }
  }

  /** A row: its settings in the side panel — a connection's stack components a tab each, a publisher's / subscriber's its own. */
  openRow(row: EsfCloudRow): void {
    const client = this.client;
    if (!client) {
      return;
    }
    const open = (pids: string[]) => {
      this.openKey = row.key;
      this.cloudOpen.emit(this.openFor("settings", row, pids.length ? pids : [row.pid]));
    };
    const stack = row.kind === "connection" ? this.stacks.get(row.pid) : [row.pid];
    if (stack) {
      open(stack);
      return;
    }
    // Not read ahead yet: its stack first.
    this.readStack(row, open);
  }

  /** "Create new": a connection or a publisher / subscriber, from the unit's factories, in the side panel. */
  openCreate(): void {
    if (!this.client) {
      return;
    }
    this.manage.end();
    this.openKey = "";
    this.cloudOpen.emit(this.openFor("create", null, []));
  }

  /** Manage's "Delete (n)": the checked connections and publishers / subscribers, confirmed — those under a connection first. */
  askDelete(): void {
    const picked = this.manage.selected as EsfCloudRow[];
    if (!picked.length) {
      return;
    }
    const connections = picked.filter((r) => r.kind === "connection").length;
    this.confirm.emit({
      heading: `Delete ${picked.length === 1 ? picked[0].pid : `${picked.length} cloud components`}?`,
      message:
        connections > 0
          ? "A deleted connection's stack (its CloudService, DataService, transport) is deleted with it. This can't be undone."
          : "The publishers and subscribers will be deleted from the unit. This can't be undone.",
      confirmLabel: "Delete",
      danger: true,
      run: () => this.deleteRows([...picked.filter((r) => r.kind === "pubsub"), ...picked.filter((r) => r.kind === "connection")]),
    });
  }

  trackRow(_: number, row: EsfCloudRow): string {
    return row.key;
  }

  // ---- Helpers ---------------------------------------------------------------------------------------------------------------

  private openFor(mode: "settings" | "create", row: EsfCloudRow | null, pids: string[]): EsfCloudOpen {
    return {
      client: this.client!,
      mode,
      row,
      tabs: mode === "create" ? [{ id: "create", label: "Create new", icon: "add", tooltip: "Create new" }] : pids.map(esfStackTab),
      connectionFactories: this.connectionFactories,
      pubSubFactories: this.pubSubFactories,
      connections: this.rows.filter((r) => r.kind === "connection"),
      changed: () => this.load(),
      configs: this.configs,
      closed: () => {
        this.openKey = "";
        this.cd.markForCheck();
      },
    };
  }

  private readStack(row: EsfCloudRow, then?: (pids: string[]) => void): void {
    const client = this.client;
    if (!client) {
      return;
    }
    esfSubscribe(
      client.call("esfCloudStackPids", { cloudConnectionFactoryPid: row.connectionFactoryPid, cloudEndpointPid: row.pid }),
      this.destroyRef,
      (reply) => {
        if (client === this.client) {
          const pids = parseEsfStackPids(reply);
          this.stacks.set(row.pid, pids);
          this.readAhead(); // its stack's settings
          then?.(pids);
        }
      },
      () => then?.([row.pid])
    );
  }

  /** The rows deleted one at a time ("Deleting… 2 / 4"), the table read again after; the first failure stops and says why. */
  private deleteRows(rows: EsfCloudRow[]): void {
    const client = this.client;
    if (!client || this.deleting) {
      return;
    }
    this.deleting = { done: 0, total: rows.length };
    const next = (i: number) => {
      if (i >= rows.length || client !== this.client) {
        this.deleting = null;
        this.manage.end();
        this.notify.emit({ tone: "success", message: "Settings applied" });
        this.load();
        return;
      }
      const row = rows[i];
      const call =
        row.kind === "connection"
          ? client.call("esfCloudDeleteEndpoint", { cloudConnectionFactoryPid: row.connectionFactoryPid, cloudEndpointPid: row.pid })
          : client.call("esfCloudDeletePubSub", { pid: row.pid });
      call.subscribe({
        next: () => {
          this.stacks.delete(row.pid);
          this.deleting = { done: i + 1, total: rows.length };
          this.cd.markForCheck();
          next(i + 1);
        },
        error: (err) => {
          this.deleting = null;
          this.notify.emit({ tone: "error", message: `Couldn't delete ${row.pid}: ${esfReason(err)}` });
          this.load();
        },
      });
    };
    next(0);
  }
}
