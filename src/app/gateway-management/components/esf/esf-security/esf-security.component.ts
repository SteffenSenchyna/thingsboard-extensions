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

import { ChangeDetectorRef, Component, DestroyRef, EventEmitter, Input, OnChanges, Output, QueryList, SimpleChanges, ViewChildren } from "@angular/core";
import { forkJoin, of } from "rxjs";
import { catchError, map, switchMap } from "rxjs/operators";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { CommonModule } from "@angular/common";
import { CalloutComponent } from "../../../../components/shared/callout/callout.component";
import { DataTableColumn, DataTableComponent } from "../../../../components/shared/data-table/data-table.component";
import { SegmentOption } from "../../../../components/shared/segmented-control/segmented-control.component";
import { TimeframePickerComponent } from "../../../../components/shared/timeframe-picker/timeframe-picker.component";
import { SkeletonCardComponent } from "../../../../components/shared/skeleton-card/skeleton-card.component";
import { TableLinkComponent, TableLinksComponent } from "../../../../components/shared/table-links/table-links.component";
import { formatDateTime } from "../../../../components/shared/time-format";
import { ToastTone } from "../../../../components/shared/toasts/toasts.component";
import { EsfClient, EsfConfirm, esfReason, esfSubscribe } from "../../../models/esf-api.models";
import { TableManage } from "../../../../components/shared/data-table/table-manage";
import { TbSelectOption } from "../../../../components/shared/select/select.component";
import { ESF_CONFIG_API } from "../../../models/esf.models";
import {
  EsfCertificate,
  esfDeleteInstancesRequest,
  ESF_SECURITY_TABS,
  esfSecuritySections,
  EsfSecuritySection,
  EsfSecurityTab,
  parseEsfComponentFactories,
  parseEsfKeystoreEntries,
} from "../../../models/esf-security.models";
import { esfList } from "../../../models/esf.models";
import { EsfSettingsComponent } from "../../esf-settings/esf-settings.component";
import { esfServiceIcon, esfServiceName } from "../../../models/esf.models";

/** ESF's own keystore (its device certificates — not a factory instance, so not in the components' list). */
const CRYPTO_SERVICE = "org.eclipse.kura.crypto.CryptoService";

/** A component opened in the side panel (an SSL manager's, a keystore's row — or "Create new"): its settings form, or a new one's. */
export interface EsfComponentOpen {
  client: EsfClient;
  mode: "settings" | "create";
  /** The component (settings); "" for a new one. */
  pid: string;
  factoryPid: string;
  /** Its settings form's set: the one component (an array made once, so the form isn't reset each check). */
  pids: string[];
  icon: string;
  /** What one is called ("SSL manager", "keystore") — a new one's panel. */
  noun: string;
  /** A new one's factories (the unit's that make them), by name over the PID; and the PIDs taken. */
  factories?: TbSelectOption[];
  existing?: string[];
  /** A new one made: the view reads again and opens its settings. */
  created?: (pid: string, factoryPid: string) => void;
  /** A new one's drivers (the Drivers and assets view's "Create new" — it then makes a driver or an asset): an asset's driver pick. */
  drivers?: TbSelectOption[];
  /** The factory a new asset is made from (`org.eclipse.kura.wire.WireAsset`). */
  assetFactory?: string;
  /** The panel closed (the row no longer lit). */
  closed: () => void;
  /** Close the panel (the dashboard sets it as it opens: an instance deleted while its panel shows). */
  close?: () => void;
}

/**
 * The unit's security settings, as ESF's console's Security page: a tab group across the top — Certificates (every keystore's
 * certificates and keys, read only; the Keystores v1 REST API, which needs `rest.keystores` on the gateway's ESF user), then SSL,
 * Keystores, HTTP service, Web console, Network threats and Tamper detection, each its components' settings (the shared settings
 * form, `tb-gm-esf-settings picker="fixed"`: several in one form, a card each, one Apply). The tabs are always these seven,
 * shown at once (`ESF_SECURITY_TABS`); what each holds is the unit's (`esfComponentFactories` — wireframed until it's in; a tab
 * whose components the unit lacks says so). Each is made when first opened and kept.
 */
@Component({
  selector: "tb-gm-esf-security",
  templateUrl: "./esf-security.component.html",
  styleUrls: ["./esf-security.component.scss"],
  standalone: true,
  imports: [CommonModule, CalloutComponent, DataTableComponent, EsfSettingsComponent, SkeletonCardComponent, TimeframePickerComponent, TableLinkComponent, TableLinksComponent],
})
export class EsfSecurityComponent implements OnChanges {
  @Input() client: EsfClient | null = null;
  @Input() gatewayName = "";
  @Output() notify = new EventEmitter<{ tone: ToastTone; message: string }>();
  /** An instance's row (SSL, Keystores): its settings in the dashboard's side panel — or "Create new": a new one's form there. */
  @Output() componentOpen = new EventEmitter<EsfComponentOpen>();
  /** A delete to confirm (the dashboard's dialog). */
  @Output() confirm = new EventEmitter<EsfConfirm>();

  @ViewChildren(DataTableComponent) private tables?: QueryList<DataTableComponent>;
  /** Each instances table's Manage (rows checked to delete), by tab. */
  manages: Partial<Record<EsfSecurityTab, TableManage>> = {};
  /** A delete running: its progress (the table's "Deleting… n / m"). */
  deleting: { done: number; total: number } | null = null;
  /** The panel last opened from here (closed when its instance is deleted). */
  private lastOpen: EsfComponentOpen | null = null;

  readonly configApi = ESF_CONFIG_API;
  /** An instances table's columns (SSL, Keystores — ESF's): its service PID, its factory by name (the PID in its bubble). */
  readonly instanceColumns: DataTableColumn[] = [
    { key: "pid", phone: "title", header: "Service PID", emphasis: "strong", iconOf: (r) => r["icon"] },
    { key: "factory", phone: "sub", header: "Factory", emphasis: "muted", tooltipOf: (r) => r["factoryPid"] },
  ];
  /** Each instances tab's rows, made with its tabs. */
  instanceRows: Partial<Record<EsfSecurityTab, { key: string; pid: string; factoryPid: string; factory: string; icon: string }[]>> = {};
  /** The row whose settings are open in the side panel (lit); "" none. */
  openPid = "";
  /** Each tab's components on the unit (none until read — `sectionsLoaded`). */
  sections: EsfSecuritySection[] = esfSecuritySections([]);
  /** The tabs: always these seven, nothing read for them. */
  readonly tabOptions: SegmentOption[] = ESF_SECURITY_TABS;
  /** The unit's components read (or refused): the tabs' content can show. */
  sectionsLoaded = false;
  /** Why they couldn't be read ("" none). */
  sectionsError = "";
  tab: EsfSecurityTab = "certificates";
  /** The tabs made so far (each kept once made). */
  made = new Set<EsfSecurityTab>(["certificates"]);

  /**
   * As ESF's console spaces them: the distinguished name the widest, the alias and keystore next, the type and the dates narrow —
   * every value wrapping in its column ("Trusted / Certificate", a date over two lines), never cut. The keystore by its name — a
   * class-named one's words ("org.eclipse.kura.crypto.CryptoService" → "Crypto Service"), its PID in the bubble (and searched);
   * one named by hand ("SSLKeystore") as it is.
   */
  readonly certificateColumns: DataTableColumn[] = [
    { key: "alias", phone: "title", header: "Alias", emphasis: "strong", width: "14%" },
    { key: "subject", phone: "note", header: "Distinguished name", emphasis: "muted", width: "38%" },
    { key: "type", phone: "sub", header: "Type", width: "9%" },
    { key: "keystoreName", phone: "sub", header: "Keystore", emphasis: "muted", width: "15%", tooltipKey: "keystorePid" },
    { key: "from", phone: "hide", header: "Valid from", emphasis: "muted", width: "12%", sortValue: (r) => r["validFrom"] ?? 0 },
    { key: "to", phone: "meta", header: "Valid to", emphasis: "muted", width: "12%", sortValue: (r) => r["validTo"] ?? 0 },
  ];
  certificates: (EsfCertificate & { from: string; to: string; keystoreName: string; keystorePid: string })[] = [];
  certificatesLoading = false;
  certificatesError = "";
  /** The gateway's ESF user lacks `rest.keystores` (ESF answered 403). */
  certificatesForbidden = false;
  /** The keystores whose certificates couldn't be read (the others listed): each with ESF's reason. */
  keystoreErrors: { pid: string; reason: string }[] = [];

  get keystoreErrorTitle(): string {
    const n = this.keystoreErrors.length;
    return n === 1 ? `Couldn't read the keystore ${this.keystoreErrors[0].pid}` : `Couldn't read ${n} keystores`;
  }

  /** ESF's reason (each keystore's, several), then what it leaves out and the likely cause. */
  get keystoreErrorText(): string {
    const one = this.keystoreErrors.length === 1;
    const reasons = one ? this.keystoreErrors[0].reason : this.keystoreErrors.map((k) => `${k.pid}: ${k.reason}`).join("; ");
    return `${reasons}. ${one ? "Its" : "Their"} certificates aren't listed. A PKCS11 keystore whose library isn't on the unit fails this way.`;
  }

  constructor(
    private cd: ChangeDetectorRef,
    private destroyRef: DestroyRef
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["client"]) {
      this.tab = "certificates";
      this.made = new Set(["certificates"]);
      this.sections = esfSecuritySections([]);
      this.sectionsLoaded = false;
      this.sectionsError = "";
      this.loadSections();
      this.loadCertificates();
    }
  }

  selectTab(id: string): void {
    this.tab = id as EsfSecurityTab;
    this.made.add(this.tab);
  }

  /** The unit's components with their factories, and its factories: each tab's components and makers. */
  loadSections(then?: () => void): void {
    const client = this.client;
    if (!client) {
      return;
    }
    // The settings forms' service picks (a keystore, an SSL manager) read the components again after this.
    client.forgetComponentFactories();
    const factories = client.call("esfFactoryComponents").pipe(catchError(() => of(null)));
    esfSubscribe(
      forkJoin([client.call("esfComponentFactories"), factories]),
      this.destroyRef,
      ([reply, factoryReply]) => {
        if (client !== this.client) {
          return;
        }
        const makers = factoryReply ? esfList(factoryReply, "pids").map((p: unknown) => String(p ?? "")).filter(Boolean) : [];
        this.sections = esfSecuritySections(parseEsfComponentFactories(reply), makers);
        this.sectionsLoaded = true;
        this.sectionsError = "";
        this.instanceRows = {};
        for (const s of this.sections.filter((x) => x.instances)) {
          this.instanceRows[s.id] = s.components.map((c) => ({
            key: c.pid,
            pid: c.pid,
            factoryPid: c.factoryPid,
            factory: c.factoryPid ? esfServiceName(c.factoryPid) : "",
            icon: esfServiceIcon(c.pid),
          }));
          if (!this.manages[s.id]) {
            const label = s.label;
            const id = s.id;
            this.manages[id] = new TableManage(() => this.tables?.find((t) => t.title === label), () => this.instanceRows[id]?.length ?? 0);
          } else {
            this.manages[s.id]!.keep(new Set(s.pids), "key");
          }
        }
        then?.();
        this.cd.markForCheck();
      },
      (reason) => {
        if (client !== this.client) {
          return;
        }
        this.sectionsLoaded = true;
        this.sectionsError = reason;
        this.cd.markForCheck();
      }
    );
  }

  trackSection = (_: number, s: EsfSecuritySection): string => s.id;

  /** "Create new": a new instance's form in the side panel — its factory (the unit's that make them), its PID. */
  openCreate(s: EsfSecuritySection): void {
    const client = this.client;
    if (!client) {
      return;
    }
    this.manages[s.id]?.end();
    this.openPid = "";
    this.emitOpen({
      client,
      mode: "create",
      pid: "",
      factoryPid: "",
      pids: [],
      icon: s.id === "ssl" ? "lock" : "key",
      noun: s.noun,
      factories: s.factories.map((f) => ({ value: f, label: esfServiceName(f), note: f })),
      existing: this.sections.flatMap((x) => x.pids),
      created: (pid, factoryPid) => this.loadSections(() => this.openInstance({ pid, factoryPid, icon: esfServiceIcon(pid) }, s.noun)),
      closed: () => undefined,
    });
  }

  /** Manage's "Delete (n)": the checked instances, confirmed — ESF deletes them, a snapshot taken. */
  askDelete(s: EsfSecuritySection): void {
    const rows = (this.manages[s.id]?.selected ?? []) as { pid: string }[];
    if (!rows.length) {
      return;
    }
    const pids = rows.map((r) => r.pid);
    this.confirm.emit({
      heading: `Delete ${pids.length === 1 ? pids[0] : `${pids.length} ${s.noun}s`}?`,
      message: `${pids.length === 1 ? "It's" : "They're"} deleted from the unit with ${pids.length === 1 ? "its" : "their"} settings; a snapshot is taken first. Anything using ${pids.length === 1 ? "it" : "them"} stops working.`,
      confirmLabel: "Delete",
      danger: true,
      run: () => this.deleteInstances(s, pids),
    });
  }

  private deleteInstances(s: EsfSecuritySection, pids: string[]): void {
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
        if (this.lastOpen && pids.includes(this.lastOpen.pid)) {
          this.lastOpen.close?.();
        }
        this.manages[s.id]?.end();
        this.loadSections();
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

  /** An instance's row (a table's — not while managing): its settings in the side panel. */
  openInstance(row: { pid: string; factoryPid: string; icon: string }, noun = ""): void {
    const client = this.client;
    if (!client) {
      return;
    }
    this.openPid = row.pid;
    this.emitOpen({
      client,
      mode: "settings",
      pid: row.pid,
      factoryPid: row.factoryPid,
      pids: [row.pid],
      icon: row.icon,
      noun,
      closed: () => {
        this.openPid = "";
        this.cd.markForCheck();
      },
    });
  }

  /**
   * Every keystore's certificates and keys (again — the table's Refresh): one read of them all — or, when ESF fails it (one
   * keystore it can't open fails it for all: a PKCS11 module whose library isn't on the unit answers 500), each keystore read
   * apart (the unit's keystore instances, and ESF's own CryptoService), the ones that read listed and the others named in a note.
   */
  loadCertificates(): void {
    const client = this.client;
    if (!client) {
      return;
    }
    this.certificatesLoading = true;
    this.certificatesError = "";
    this.certificatesForbidden = false;
    this.keystoreErrors = [];
    esfSubscribe(
      client.call("esfKeystoreEntries"),
      this.destroyRef,
      (reply) => {
        if (client !== this.client) {
          return;
        }
        this.showCertificates(parseEsfKeystoreEntries(reply));
      },
      (reason) => {
        if (client !== this.client) {
          return;
        }
        if (/403|forbidden/i.test(reason)) {
          this.certificatesLoading = false;
          this.certificatesForbidden = true;
          this.certificatesError = reason;
          this.cd.markForCheck();
          return;
        }
        this.readEachKeystore(client, reason);
      }
    );
  }

  /** The certificates keystore by keystore (the whole read failed): those read, and the keystores that weren't. */
  private readEachKeystore(client: EsfClient, reason: string): void {
    client
      .componentFactories()
      .pipe(
        switchMap((components) => {
          const pids = [...components.filter((c) => /keystore/i.test(c.factoryPid)).map((c) => c.pid), CRYPTO_SERVICE];
          return forkJoin(
            pids.map((pid) =>
              client.call("esfKeystoreEntriesOf", undefined, { pid }).pipe(
                map((reply) => ({ pid, entries: parseEsfKeystoreEntries(reply), error: "" })),
                catchError((err) => of({ pid, entries: [] as EsfCertificate[], error: esfReason(err) }))
              )
            )
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((reads) => {
        if (client !== this.client) {
          return;
        }
        // ESF's own CryptoService unread says nothing (a unit may not have it); a keystore instance unread is named.
        const failed = reads.filter((r) => r.error && r.pid !== CRYPTO_SERVICE);
        if (reads.every((r) => r.error)) {
          this.certificatesLoading = false;
          this.certificatesError = reason;
          this.cd.markForCheck();
          return;
        }
        this.keystoreErrors = failed.map((r) => ({ pid: r.pid, reason: r.error }));
        this.showCertificates(
          reads
            .flatMap((r) => r.entries.map((e) => (e.keystore ? e : { ...e, keystore: r.pid, key: `${r.pid}|${e.alias}` })))
            .sort((a, b) => a.keystore.localeCompare(b.keystore) || a.alias.localeCompare(b.alias))
        );
      });
  }

  /** The table's rows: each certificate, its keystore by name (its PID in the bubble when that's not the name), its dates. */
  private showCertificates(entries: EsfCertificate[]): void {
    this.certificatesLoading = false;
    this.certificates = entries.map((c) => {
      const keystoreName = esfServiceName(c.keystore);
      return {
        ...c,
        from: c.validFrom ? formatDateTime(c.validFrom) : "",
        to: c.validTo ? formatDateTime(c.validTo) : "",
        keystoreName,
        keystorePid: keystoreName === c.keystore ? "" : c.keystore,
      };
    });
    this.cd.markForCheck();
  }

}
