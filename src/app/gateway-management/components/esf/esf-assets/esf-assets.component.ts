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
import { forkJoin, of } from "rxjs";
import { catchError, concatMap, map, switchMap, toArray } from "rxjs/operators";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { CalloutComponent } from "../../../../components/shared/callout/callout.component";
import { DataTableColumn, DataTableComponent } from "../../../../components/shared/data-table/data-table.component";
import { TableManage } from "../../../../components/shared/data-table/table-manage";
import { TableLinkComponent, TableLinksComponent } from "../../../../components/shared/table-links/table-links.component";
import { ToastTone } from "../../../../components/shared/toasts/toasts.component";
import { EsfClient, EsfConfirm, esfReason, esfSubscribe, parseEsfChannels } from "../../../models/esf-api.models";
import {
  EsfAssetSummary,
  esfAssetChannels,
  ESF_DRIVER_ICON,
  esfDriverAssetRows,
  EsfDriverAssetRow,
  esfDriverTypeName,
  ESF_ASSET_READ_MAX_CHANNELS,
  isEsfAssetFactory,
  isEsfDriverFactory,
} from "../../../models/esf-drivers.models";
import { EsfComponentFactory, esfDeleteInstancesRequest } from "../../../models/esf-security.models";
import { esfList, ESF_CONFIG_API, parseEsfConfigs } from "../../../models/esf.models";
import { EsfComponentOpen } from "../esf-security/esf-security.component";
import { EsfAssetEditorComponent } from "../../esf-asset-editor/esf-asset-editor.component";
import { EsfSettingsComponent } from "../../esf-settings/esf-settings.component";

/** The row picked, as shown under the table. */
interface PickedRow {
  row: EsfDriverAssetRow;
  /** Its settings form's set (a driver's): itself. */
  pids: string[];
  /** What it is, beside its name ("Modbus driver", "Modbus asset of modbus"). */
  heading: string;
  /** An asset's driver's kind. */
  driverType: string;
  /** An asset's new channel's shape, while it has none: other assets of a driver of the same kind. */
  templates: string[];
  /** An asset's channels' count, when too many to read its settings; null — read them. */
  tooManyChannels: number | null;
}

/**
 * The unit's drivers and assets, as ESF's console's "Drivers and Assets" page (Configuration v2, `rest.configuration`): one table,
 * each driver (its kind — Modbus, OPC UA …) with its assets under it (each its channels' count and description; an asset whose
 * driver the unit hasn't at the top, "Asset · no driver"). A row picked shows it under the table, as ESF's page does: a driver its
 * settings (the shared form); an asset its Configuration — its channels an editable grid, its own settings — and Data
 * (`tb-gm-esf-asset-editor`). "Create new" — a driver of a kind, or an asset of a driver, in the side panel (`componentOpen`), the
 * new one then picked — "Manage" — "Delete (n)", confirmed (a driver's assets named: they stop working) — and "Refresh". The
 * Configuration view leaves them out (`esfDriverAssetPids`).
 */
@Component({
  selector: "tb-gm-esf-assets",
  templateUrl: "./esf-assets.component.html",
  styleUrls: ["./esf-assets.component.scss"],
  standalone: true,
  imports: [CommonModule, CalloutComponent, DataTableComponent, EsfAssetEditorComponent, EsfSettingsComponent, TableLinkComponent, TableLinksComponent],
})
export class EsfAssetsComponent implements OnChanges {
  @Input() client: EsfClient | null = null;
  @Input() gatewayName = "";
  @Output() notify = new EventEmitter<{ tone: ToastTone; message: string }>();
  /** "Create new" (a driver or an asset), in the side panel. */
  @Output() componentOpen = new EventEmitter<EsfComponentOpen>();
  /** A delete to confirm (the dashboard's dialog). */
  @Output() confirm = new EventEmitter<EsfConfirm>();

  @ViewChild(DataTableComponent) private table?: DataTableComponent;

  readonly columns: DataTableColumn[] = [
    { key: "pid", phone: "title", header: "Name", emphasis: "strong", iconOf: (r) => r["icon"] },
    { key: "type", phone: "sub", header: "Type", emphasis: "muted", nowrap: true, tooltipKey: "factoryPid" },
    { key: "channels", phone: "trail", header: "Channels", nowrap: true },
    { key: "description", phone: "note", header: "Description", emphasis: "muted" },
  ];
  rows: EsfDriverAssetRow[] = [];
  loading = false;
  error = "";
  /** The row picked (lit): shown under the table; "" none. */
  openPid = "";
  /** The row picked, as shown under the table (made once a pick — its arrays never fresh each check); null none. */
  picked: PickedRow | null = null;
  readonly configApi = ESF_CONFIG_API;
  readonly manage = new TableManage(
    () => this.table,
    () => this.rows.length
  );
  deleting: { done: number; total: number } | null = null;

  /** The unit's driver factories (a new driver's kinds) and its asset factory. */
  private driverFactories: string[] = [];
  private assetFactory = "";
  private lastOpen: EsfComponentOpen | null = null;

  constructor(
    private cd: ChangeDetectorRef,
    private destroyRef: DestroyRef
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["client"]) {
      this.rows = [];
      this.openPid = "";
      this.picked = null;
      this.load();
    }
  }

  /**
   * The table (again): the unit's components with their factories and its factories, then each asset's settings — one at a time —
   * for its driver, channels and description.
   */
  load(then?: () => void): void {
    const client = this.client;
    this.error = "";
    if (!client) {
      return;
    }
    this.loading = true;
    client.forgetComponentFactories();
    forkJoin([client.componentFactories(), client.call("esfFactoryComponents").pipe(catchError(() => of(null)))])
      .pipe(
        switchMap(([components, factoryReply]) => {
          const factories = factoryReply ? esfList(factoryReply, "pids").map((p: unknown) => String(p ?? "")).filter(Boolean) : [];
          const assets = components.filter((c) => c.factoryPid && isEsfAssetFactory(c.factoryPid));
          // Each asset's channels counted first (the Assets REST API, a few bytes a channel); one with too many for its settings'
          // reply to fit ThingsBoard's MQTT limit not read (`ESF_ASSET_READ_MAX_CHANNELS`) — its count alone shown.
          const summaries$ = assets.length
            ? of(...assets).pipe(
                concatMap((a) =>
                  client.call("esfAssetChannels", undefined, { asset: a.pid }).pipe(
                    map((reply) => parseEsfChannels(reply).length as number | null),
                    catchError(() => of(null)),
                    switchMap((count) =>
                      count !== null && count > ESF_ASSET_READ_MAX_CHANNELS
                        ? of([a.pid, { driverPid: null, channels: count, description: "" } as EsfAssetSummary] as const)
                        : client.call(ESF_CONFIG_API.getConfig, { pids: [a.pid] }).pipe(
                            map((reply) => [a.pid, this.summaryOf(reply, a.pid)] as const),
                            catchError(() => of([a.pid, null] as const))
                          )
                    )
                  )
                ),
                toArray()
              )
            : of([] as (readonly [string, EsfAssetSummary | null])[]);
          return summaries$.pipe(map((summaries) => ({ components, factories, summaries })));
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: ({ components, factories, summaries }) => {
          if (client !== this.client) {
            return;
          }
          this.driverFactories = factories.filter(isEsfDriverFactory);
          this.assetFactory =
            factories.find((f) => isEsfAssetFactory(f)) ?? components.find((c) => c.factoryPid && isEsfAssetFactory(c.factoryPid))?.factoryPid ?? "";
          const read = new Map<string, EsfAssetSummary>();
          summaries.forEach(([pid, s]) => s && read.set(pid, s));
          this.rows = esfDriverAssetRows(components as EsfComponentFactory[], read);
          this.manage.keep(new Set(this.rows.map((r) => r.key)), "key");
          this.loading = false;
          this.repick();
          then?.();
          this.cd.markForCheck();
        },
        error: (err) => {
          if (client === this.client) {
            this.loading = false;
            this.error = esfReason(err);
            this.cd.markForCheck();
          }
        },
      });
  }

  /** An asset's driver, channels' count and description, from its settings. */
  private summaryOf(reply: unknown, pid: string): EsfAssetSummary | null {
    const config = parseEsfConfigs(reply).find((c) => c.pid === pid);
    if (!config) {
      return null;
    }
    const text = (key: string) => {
      const v = config.properties[key]?.value;
      return v === undefined || v === null ? "" : String(v);
    };
    return {
      driverPid: text("driver.pid"),
      channels: esfAssetChannels(config.definition?.attributes ?? []).length,
      description: text("asset.desc"),
    };
  }

  /** A row (not while managing): picked — a driver's settings, or an asset's configuration and data, under the table. */
  openRow(row: EsfDriverAssetRow): void {
    this.openPid = row.pid;
    const driver = this.rows.find((r) => r.kind === "driver" && r.pid === row.driverPid);
    // A new channel's shape, for an asset without one: another asset of a driver of the same kind (same factory).
    const sameKind = (a: EsfDriverAssetRow) => this.rows.find((r) => r.kind === "driver" && r.pid === a.driverPid)?.factoryPid === driver?.factoryPid;
    this.picked = {
      row,
      pids: [row.pid],
      heading: row.kind === "driver" ? `${row.type} driver` : driver ? `${driver.type} asset of ${driver.pid}` : "Asset",
      driverType: driver?.type ?? "",
      templates: driver
        ? this.rows
            .filter((r) => r.kind === "asset" && r.pid !== row.pid && typeof r.channels === "number" && r.channels > 0 && r.channels <= ESF_ASSET_READ_MAX_CHANNELS && sameKind(r))
            .map((r) => r.pid)
        : [],
      tooManyChannels: typeof row.channels === "number" && row.channels > ESF_ASSET_READ_MAX_CHANNELS ? row.channels : null,
    };
  }

  /** The picked row read again (its table row, after a Refresh): kept picked if it's still there. */
  private repick(): void {
    const row = this.picked && this.rows.find((r) => r.pid === this.picked!.row.pid);
    if (!row) {
      this.picked = null;
      this.openPid = "";
    } else if (row.type !== this.picked!.row.type || row.driverPid !== this.picked!.row.driverPid || row.channels !== this.picked!.row.channels) {
      this.openRow(row);
    }
  }

  /** "Create new": a driver (its kind) or an asset (its driver) — then its panel. */
  openCreate(): void {
    const client = this.client;
    if (!client) {
      return;
    }
    this.manage.end();
    this.openPid = "";
    const drivers = this.rows.filter((r) => r.kind === "driver");
    this.emitOpen({
      client,
      mode: "create",
      pid: "",
      factoryPid: "",
      pids: [],
      icon: ESF_DRIVER_ICON,
      noun: "driver",
      factories: this.driverFactories
        .map((f) => ({ value: f, label: esfDriverTypeName(f), note: f }))
        .sort((a, b) => a.label.localeCompare(b.label)),
      drivers: drivers.map((d) => ({ value: d.pid, label: d.pid, note: d.type })),
      assetFactory: this.assetFactory,
      existing: this.rows.map((r) => r.pid),
      // Made: the panel closes and the new one is picked under the table.
      created: (pid) => {
        this.lastOpen?.close?.();
        this.load(() => {
          const row = this.rows.find((r) => r.pid === pid);
          if (row) {
            this.openRow(row);
          }
        });
      },
      closed: () => undefined,
    });
  }

  /** Manage's "Delete (n)": the checked drivers and assets, confirmed — a driver's assets named (they stop working). */
  askDelete(): void {
    const rows = this.manage.selected as EsfDriverAssetRow[];
    if (!rows.length) {
      return;
    }
    const pids = rows.map((r) => r.pid);
    const orphans = this.rows.filter((r) => r.kind === "asset" && pids.includes(r.driverPid) && !pids.includes(r.pid)).map((r) => r.pid);
    const one = pids.length === 1;
    this.confirm.emit({
      heading: `Delete ${one ? pids[0] : `${pids.length} drivers and assets`}?`,
      message:
        `${one ? "It's" : "They're"} deleted from the unit with ${one ? "its" : "their"} settings; a snapshot is taken first.` +
        (orphans.length ? ` ${orphans.join(", ")} ${orphans.length === 1 ? "uses" : "use"} ${one ? "this driver" : "a driver deleted"} and stop${orphans.length === 1 ? "s" : ""} working.` : ""),
      confirmLabel: "Delete",
      danger: true,
      run: () => this.delete(pids),
    });
  }

  private delete(pids: string[]): void {
    const client = this.client;
    if (!client || this.deleting) {
      return;
    }
    this.deleting = { done: 0, total: pids.length };
    esfSubscribe(
      client.call("esfDeleteFactoryComponents", esfDeleteInstancesRequest(pids)),
      this.destroyRef,
      () => {
        this.deleting = null;
        this.notify.emit({ tone: "success", message: "Settings applied" });
        if (this.picked && pids.includes(this.picked.row.pid)) {
          this.picked = null;
          this.openPid = "";
        }
        this.manage.end();
        this.load();
      },
      (reason) => {
        this.deleting = null;
        this.notify.emit({ tone: "error", message: `Couldn't delete: ${reason}` });
        this.cd.markForCheck();
      }
    );
  }

  private emitOpen(open: EsfComponentOpen): void {
    this.lastOpen = open;
    this.componentOpen.emit(open);
  }

}
