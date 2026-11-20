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

import { AfterViewInit, ChangeDetectorRef, Component, DestroyRef, ElementRef, EventEmitter, HostBinding, Input, OnChanges, Output, SimpleChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormBuilder, FormsModule, ReactiveFormsModule } from "@angular/forms";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { Observable, Subscription, forkJoin, of } from "rxjs";
import { catchError, map, switchMap } from "rxjs/operators";
import { SharedModule } from "@shared/public-api";
import { CalloutComponent } from "../../../components/shared/callout/callout.component";
import { CardComponent } from "../../../components/shared/card/card.component";
import { SearchBoxComponent } from "../../../components/shared/search-box/search-box.component";
import { SectionNavComponent, SectionNavItem } from "../../../components/shared/section-nav/section-nav.component";
import { CollapsibleCardComponent } from "../../../components/shared/collapsible-card/collapsible-card.component";
import { FormActionsComponent } from "../../../components/shared/form-actions/form-actions.component";
import { SelectComponent, TbSelectOption } from "../../../components/shared/select/select.component";
import { SkeletonCardComponent } from "../../../components/shared/skeleton-card/skeleton-card.component";
import { SegmentOption } from "../../../components/shared/segmented-control/segmented-control.component";
import { ToastTone } from "../../../components/shared/toasts/toasts.component";
import { ESF_CONTAINER_INSTANCE_FACTORY, EsfClient, esfReason, parseEsfCloudInstances } from "../../models/esf-api.models";
import { parseEsfStackPids } from "../../models/esf-cloud.models";
import { EsfComponentFactory, esfSecurityPids, parseEsfComponentFactories } from "../../models/esf-security.models";
import { esfDriverAssetPids } from "../../models/esf-drivers.models";
import { esfFirewallSettingOf, EsfFirewallSection } from "../../models/esf-firewall.models";
import { EsfField, EsfForm, EsfFormCard, EsfFormRow } from "../../models/esf-form.models";
import { FoldComponent } from "../../../components/shared/fold/fold.component";
import { InfoIconComponent } from "../../../components/shared/info-icon/info-icon.component";
import { NumberBoxComponent } from "../../../components/shared/number-box/number-box.component";
import { SwitchComponent } from "../../../components/shared/switch/switch.component";
import { EsfFieldComponent } from "../esf-field/esf-field.component";
import { EsfFirewallComponent } from "../esf-firewall/esf-firewall.component";
import { EsfFirewallRuleOpen } from "../esf-firewall-rule/esf-firewall-rule.component";
import { EsfWireGraphComponent } from "../esf-wire-graph/esf-wire-graph.component";
import { ESF_WIRE_GRAPH_PID, ESF_WIRE_GRAPH_SETTING, EsfWireGraph, parseEsfWireGraph } from "../../models/esf-wires.models";
import {
  EsfComponentConfig,
  EsfConfigApi,
  ESF_CONFIG_API,
  ESF_NETWORK_CONFIG_API,
  esfComponentLabel,
  EsfDefinition,
  esfShortName,
  esfUpdateRequest,
  parseEsfConfigs,
  parseEsfPids,
  esfServiceIcon,
  esfServiceLogo,
  esfServiceName,
  esfUpdateManyRequest,
} from "../../models/esf.models";

/**
 * An ESF configuration API's editor (the ESF section's Configuration view — Configuration v2 — and its Network view — Network
 * Configuration v1, the same shapes): one of the unit's components picked, then that component's settings as a form built from
 * ESF's own definition — each setting by its type (a checkbox, a select of its options, a number in its bounds, text, a masked
 * password, a list as comma-separated values), its description in the label's info bubble — and "Apply changes" (shown while
 * something changed) sending only the changed settings, ESF taking a snapshot after (the Snapshots view lists them). Every call
 * goes through the gateway's ESF connector (`EsfClient`); a unit that can't be reached says so.
 */
@Component({
  selector: "tb-gm-esf-settings",
  templateUrl: "./esf-settings.component.html",
  styleUrls: ["./esf-settings.component.scss"],
  standalone: true,
  imports: [
    CommonModule,
    SharedModule,
    FormsModule,
    ReactiveFormsModule,
    CalloutComponent,
    CardComponent,
    CollapsibleCardComponent,
    EsfFieldComponent,
    EsfFirewallComponent,
    EsfWireGraphComponent,
    FoldComponent,
    FormActionsComponent,
    InfoIconComponent,
    NumberBoxComponent,
    SwitchComponent,
    SearchBoxComponent,
    SectionNavComponent,
    SelectComponent,
    SkeletonCardComponent,
  ],
})
export class EsfSettingsComponent implements OnChanges, AfterViewInit {
  /** The gateway's ESF calls. */
  @Input() client: EsfClient | null = null;
  /** The configuration API it edits (Configuration v2 by default). */
  @Input() api: EsfConfigApi = ESF_CONFIG_API;
  /** The gateway's name (the toasts name it). */
  @Input() gatewayName = "";
  /** The first card's title. */
  @Input() heading = "Configuration";
  /** A component to open once the list is in (another view's "Open in Configuration"). */
  @Input() openPid = "";
  /**
   * How a component is picked: a searchable select over its form (Configuration: dozens of them), or — Network's firewalls — one
   * firewall card, IPv4 | IPv6 in its title row beside its rules' picker (the first open to start).
   */
  @Input() picker: "select" | "buttons" | "fixed" = "select";
  /**
   * The components it edits ("fixed" — the Security view's tabs, the ESF component panel), in this order: no list read; several,
   * one form of them all (a card each, one Apply — {@link stack}).
   */
  @Input() components: string[] = [];
  /**
   * A fixed set across its container, not at the form width (the Drivers and assets view's driver: the view's blocks all span it,
   * the user's pick — room for an asset's channels' table).
   */
  @Input() @HostBinding("class.es-wide") wide = false;
  /**
   * A form its host holds (the Wire graph view's, for a Wire component — one added, its configuration made from its kind's
   * definition, or one on the unit, read by the view): shown as any component's — nothing read here, no Apply of its own (Enter
   * applies nothing): the host sends what's changed with its own Apply (the graph's one Cancel | Apply). Set, `components` is
   * left alone.
   */
  @Input() draft: { config: EsfComponentConfig; form: EsfForm } | null = null;
  /** Components left out (the Network view's firewall card: the NetworkConfigurationService, edited an interface at a time). */
  @Input() hidePids: string[] = [];
  /**
   * Leave out the components another ESF view shows (Configuration's list): the Network view's (the network configuration v1
   * API's — interfaces, firewalls), the Cloud connections view's (each connection, its stack, its publishers / subscribers), the
   * Security view's (SSL, keystores, HTTP service, web console, network threats, tamper detection — `esfSecurityPids`) and the
   * Drivers and assets view's (`esfDriverAssetPids`), read from the unit as the list is; a read refused, nothing of it left out.
   */
  @Input() hideShownElsewhere = false;
  @Output() notify = new EventEmitter<{ tone: ToastTone; message: string }>();
  /** A firewall rule to open in the side panel (the dashboard's). */
  @Output() ruleOpen = new EventEmitter<EsfFirewallRuleOpen>();

  pids: string[] = [];
  /** Every component the unit lists (the list's `pids` less those another view shows): "Open in Configuration" can open any. */
  private allPids: string[] = [];
  componentOptions: TbSelectOption[] = [];
  /** The services' list (the Configuration view's left column): each by its name and icon, the one picked lit. */
  services: SectionNavItem[] = [];
  /** Those the search leaves (all, with none typed). */
  shownServices: SectionNavItem[] = [];
  serviceTerms: string[] = [];
  serviceText = "";
  /**
   * A fixed set of several (a Security tab's — flooding protection and Fail2ban, the tamper detection services): one form, each
   * component's settings a card one under another, one Apply for all of them (one update, one snapshot).
   */
  stack: { pid: string; loading: boolean; error: string; config: EsfComponentConfig | null; form: EsfForm }[] = [];
  stackSaving = false;
  /** The firewall card's components (`picker` "buttons"): "IPv4", "IPv6". */
  componentButtons: SegmentOption[] = [];
  /** No firewall read yet (the card's table empty meanwhile). */
  readonly noKeys: Partial<Record<EsfFirewallSection, string>> = {};
  componentsLoading = false;
  /** Why the unit's components couldn't be read ("" none). */
  componentsError = "";

  pid = "";
  config: EsfComponentConfig | null = null;
  configLoading = false;
  configError = "";
  fields: EsfField[] = [];
  /** The fields the form lists (a firewall's rules aside: its card shows them). */
  formFields: EsfField[] = [];
  /** A firewall component's rule settings' controls (by setting), null for any other component. */
  firewallKeys: Partial<Record<EsfFirewallSection, string>> | null = null;
  /** The IPv6 firewall's. */
  firewallIpv6 = false;
  /** The Wire Graph Service's graph (its one setting, drawn — `tb-gm-esf-wire-graph`), null for any other component or one unread. */
  wireGraph: EsfWireGraph | null = null;
  /** The unit's components with their factories (what each of the graph's boxes is). */
  componentFactories: EsfComponentFactory[] = [];
  form: EsfForm;

  saving = false;

  private componentsSub: Subscription | null = null;
  private configSub: Subscription | null = null;

  constructor(
    private fb: FormBuilder,
    private cd: ChangeDetectorRef,
    private destroyRef: DestroyRef,
    private host: ElementRef<HTMLElement>
  ) {
    this.form = new EsfForm(this.fb, null, []);
  }

  /**
   * The services' list stays in sight while the settings scroll (sticky), as tall as the page's scrolling area shows: that area's
   * height, measured as it changes, the list's limit (`--es-nav-max`).
   */
  ngAfterViewInit(): void {
    let scroller = this.host.nativeElement.parentElement;
    while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) {
      scroller = scroller.parentElement;
    }
    if (!scroller || typeof ResizeObserver === "undefined") {
      return;
    }
    const area = scroller;
    const fit = () => this.host.nativeElement.style.setProperty("--es-nav-max", `${Math.max(240, area.clientHeight - 2)}px`);
    const observer = new ResizeObserver(fit);
    observer.observe(area);
    fit();
    this.destroyRef.onDestroy(() => observer.disconnect());
  }

  /** A fixed set (no list to read): one component its form; several, one form of them all ({@link stack}). */
  private loadFixed(): void {
    this.pids = [...this.components];
    this.allPids = this.pids;
    if (!this.client) {
      return;
    }
    if (this.pids.length > 1) {
      this.clearComponent();
      this.stack = this.pids.map((pid) => ({ pid, loading: true, error: "", config: null, form: new EsfForm(this.fb, null, []) }));
      this.stack.forEach((entry) => this.readStacked(entry));
      return;
    }
    this.stack = [];
    const keep = this.pids.includes(this.pid) ? this.pid : "";
    if (!keep) {
      this.clearComponent();
      if (this.pids.length) {
        this.selectComponent(this.pids[0]);
      }
    }
  }

  /** One of a stack's components read (again): its card's form. */
  private readStacked(entry: { pid: string; loading: boolean; error: string; config: EsfComponentConfig | null; form: EsfForm }): void {
    const client = this.client;
    if (!client) {
      return;
    }
    entry.loading = true;
    entry.error = "";
    forkJoin([client.call(this.api.getConfig, { pids: [entry.pid] }), client.componentFactories()])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ([reply, services]) => {
          if (client !== this.client) {
            return;
          }
          entry.loading = false;
          entry.config = parseEsfConfigs(reply).find((c) => c.pid === entry.pid) ?? null;
          entry.form = new EsfForm(this.fb, entry.config, entry.config?.definition?.attributes ?? [], services);
          if (!entry.config) {
            entry.error = "The unit returned no configuration for this component.";
          }
          this.cd.markForCheck();
        },
        error: (err) => {
          entry.loading = false;
          entry.error = esfReason(err);
          this.cd.markForCheck();
        },
      });
  }

  /** The stack's form: changed (any card), or something wrong in a changed card. */
  get stackDirty(): boolean {
    return this.stack.some((e) => e.form.dirty);
  }

  get stackInvalid(): boolean {
    return this.stack.some((e) => e.form.invalid);
  }

  /** Cancel: every card back as it was read. */
  resetStack(): void {
    this.stack.forEach((e) => e.form.reset());
  }

  /** "Apply changes": every changed card's settings in one update (a snapshot after); those read again once it's in. */
  applyStack(): void {
    const client = this.client;
    const changed = this.stack.filter((e) => e.form.dirty);
    if (!client || !changed.length || this.stackInvalid || this.stackSaving) {
      return;
    }
    this.stackSaving = true;
    const names = changed.map((e) => e.config?.definition?.name || esfServiceName(e.pid)).join(" and ");
    client
      .call(this.api.updateConfig, esfUpdateManyRequest(changed.map((e) => ({ pid: e.pid, properties: e.form.changes() }))))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.stackSaving = false;
          this.notify.emit({ tone: "success", message: "Settings applied" });
          changed.forEach((e) => this.readStacked(e));
        },
        error: (err) => {
          this.stackSaving = false;
          this.notify.emit({ tone: "error", message: `Couldn't save ${names}: ${esfReason(err)}` });
          this.cd.markForCheck();
        },
      });
  }

  trackStack(_: number, e: { pid: string }): string {
    return e.pid;
  }

  /** The services' search: every word in a service's name or its pid. */
  onServiceSearch(terms: string[]): void {
    const words = terms.map((t) => t.trim().toLowerCase()).filter(Boolean);
    this.shownServices = words.length ? this.services.filter((s) => words.every((w) => `${s.label} ${s.id}`.toLowerCase().includes(w))) : this.services;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.draft) {
      if (changes["draft"]) {
        this.showDraft(this.draft);
      }
      return;
    }
    if (this.picker === "fixed" && (changes["client"] || changes["components"])) {
      this.loadFixed();
      return;
    }
    if (changes["client"] || changes["api"]) {
      this.load();
    } else if (changes["openPid"] && this.openPid && this.allPids.includes(this.openPid)) {
      // Kept open (the ESF views stay made): another view's "Open in Configuration" opens its component now.
      this.selectComponent(this.openPid);
    }
  }

  get definition(): EsfDefinition | null {
    return this.config?.definition ?? null;
  }

  /** The component's card title: its button's name (a button group), else its definition's name, else its pid's short name. */
  get componentTitle(): string {
    return this.picker === "buttons" ? esfComponentLabel(this.pid) : this.definition?.name || esfShortName(this.pid);
  }

  /** The unit's components read afresh (a new gateway, or "Try again"). */
  load(): void {
    this.pids = [];
    this.allPids = [];
    this.componentOptions = [];
    this.componentButtons = [];
    this.componentsError = "";
    this.clearComponent();
    if (this.client) {
      this.loadComponents();
    }
  }

  selectComponent(pid: string): void {
    if (pid === this.pid) {
      return;
    }
    this.clearComponent();
    this.pid = pid;
    if (pid) {
      this.loadConfig();
    }
  }

  // ---- The form -------------------------------------------------------------------------------------------------------------

  get dirty(): boolean {
    return this.form.dirty;
  }

  get invalid(): boolean {
    return this.form.invalid;
  }

  /** Put the fields back as they were loaded. */
  reset(): void {
    this.form.reset();
  }

  /** "Apply changes": the changed settings to the unit, a snapshot taken after; the component read again once it's in. */
  apply(): void {
    if (this.draft || !this.dirty || this.invalid || this.saving || !this.client || !this.pid) {
      return;
    }
    this.saving = true;
    this.client.call(this.api.updateConfig, esfUpdateRequest(this.pid, this.form.changes()))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving = false;
          this.notify.emit({ tone: "success", message: "Settings applied" });
          this.loadConfig();
        },
        error: (err) => {
          this.saving = false;
          this.notify.emit({ tone: "error", message: `Couldn't save ${this.componentTitle}: ${esfReason(err)}` });
          this.cd.markForCheck();
        },
      });
  }

  trackCard(_: number, c: EsfFormCard): string {
    return c.title;
  }

  trackRow(_: number, r: EsfFormRow): string {
    return r.field.key;
  }

  trackField(_: number, f: EsfField): string {
    return f.key;
  }

  // ---- Reads ----------------------------------------------------------------------------------------------------------------

  private loadComponents(): void {
    this.componentsSub?.unsubscribe();
    this.componentsLoading = true;
    const client = this.client!;
    // With the unit's components and their factories (read once, shared): which ones are containers ESF runs (their logo).
    this.componentsSub = forkJoin([client.call(this.api.listComponents), this.shownElsewhere(client), client.componentFactories()])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ([reply, elsewhere, factories]) => {
          if (client !== this.client) {
            return;
          }
          this.componentsLoading = false;
          this.allPids = parseEsfPids(reply).filter((pid) => !this.hidePids.includes(pid));
          this.pids = this.allPids.filter((pid) => !elsewhere.has(pid));
          // Each service by its name, its pid under it in the select (a phone's); by name.
          this.componentOptions = this.pids
            .map((pid) => ({ value: pid, label: esfServiceName(pid), note: pid }))
            .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
          const containers = new Set(factories.filter((f) => f.factoryPid === ESF_CONTAINER_INSTANCE_FACTORY).map((f) => f.pid));
          this.services = this.componentOptions.map((o) => ({
            id: o.value,
            label: o.label,
            icon: esfServiceIcon(o.value),
            logo: esfServiceLogo(o.value, containers.has(o.value)),
          }));
          this.onServiceSearch(this.serviceTerms);
          this.componentButtons = this.pids.map((pid) => ({ id: pid, label: esfComponentLabel(pid).replace(/^Firewall /, "") }));
          // "Open in Configuration" (another view's) opens its component even if the list leaves it out.
          if (this.openPid && this.allPids.includes(this.openPid)) {
            this.selectComponent(this.openPid);
          } else if (this.picker === "buttons" && this.pids.length) {
            this.selectComponent(this.pids[0]);
          }
          this.cd.markForCheck();
        },
        error: (err) => {
          if (client !== this.client) {
            return;
          }
          this.componentsLoading = false;
          this.componentsError = esfReason(err);
          this.cd.markForCheck();
        },
      });
  }

  /**
   * The components another view shows ({@link hideShownElsewhere}): the network configuration API's, and every cloud connection's
   * stack and publisher / subscriber — none when not asked for, or when a read is refused (nothing then left out of the list).
   */
  private shownElsewhere(client: EsfClient): Observable<Set<string>> {
    if (!this.hideShownElsewhere) {
      return of(new Set<string>());
    }
    const network = client.call(ESF_NETWORK_CONFIG_API.listComponents).pipe(
      map((reply) => parseEsfPids(reply)),
      catchError(() => of([] as string[]))
    );
    const cloud = client.call("esfCloudInstances").pipe(
      switchMap((reply) => {
        const { endpoints, pubsub } = parseEsfCloudInstances(reply);
        const stacks = endpoints.map((e) =>
          client.call("esfCloudStackPids", { cloudConnectionFactoryPid: e.factoryPid, cloudEndpointPid: e.pid }).pipe(
            map((r) => parseEsfStackPids(r)),
            catchError(() => of([] as string[]))
          )
        );
        const own = [...endpoints.map((e) => e.pid), ...pubsub.map((p) => p.pid)];
        return stacks.length ? forkJoin(stacks).pipe(map((lists) => [...own, ...lists.flat()])) : of(own);
      }),
      catchError(() => of([] as string[]))
    );
    // The Security view's components, and the Drivers and assets view's drivers and assets.
    const security = client.call("esfComponentFactories").pipe(
      map((reply) => {
        const components = parseEsfComponentFactories(reply);
        return [...esfSecurityPids(components), ...esfDriverAssetPids(components)];
      }),
      catchError(() => of([] as string[]))
    );
    // The Wire graph view's: the Wire Graph Service and its graph's components (a graph that can't be read: the service stays,
    // its text the field to fix it in).
    const wires = client.call(this.api.getConfig, { pids: [ESF_WIRE_GRAPH_PID] }).pipe(
      map((reply) => {
        const config = parseEsfConfigs(reply).find((c) => c.pid === ESF_WIRE_GRAPH_PID);
        const graph = config ? parseEsfWireGraph(config.properties[ESF_WIRE_GRAPH_SETTING]?.value) : null;
        return graph ? [ESF_WIRE_GRAPH_PID, ...graph.components.map((c) => c.pid)] : [];
      }),
      catchError(() => of([] as string[]))
    );
    return forkJoin([network, cloud, security, wires]).pipe(map((lists) => new Set(lists.flat())));
  }

  private loadConfig(): void {
    this.configSub?.unsubscribe();
    this.configLoading = true;
    this.configError = "";
    const pid = this.pid;
    const client = this.client!;
    // With the unit's services (read once a gateway): a setting naming another service picks one of them.
    this.configSub = forkJoin([client.call(this.api.getConfig, { pids: [pid] }), client.componentFactories()])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ([reply, services]) => {
          if (pid !== this.pid) {
            return;
          }
          this.configLoading = false;
          const config = parseEsfConfigs(reply).find((c) => c.pid === pid) ?? null;
          if (!config) {
            this.configError = "The unit returned no configuration for this component.";
          }
          this.buildForm(config, services);
          this.cd.markForCheck();
        },
        error: (err) => {
          if (pid !== this.pid) {
            return;
          }
          this.configLoading = false;
          this.configError = esfReason(err);
          this.cd.markForCheck();
        },
      });
  }

  // ---- Helpers --------------------------------------------------------------------------------------------------------------

  /** A component not on the unit yet: its form as given (its fields kept as they're edited — the view owns it), nothing read. */
  private showDraft(d: { config: EsfComponentConfig; form: EsfForm }): void {
    this.clearComponent();
    this.stack = [];
    this.pid = d.config.pid;
    this.config = d.config;
    this.form = d.form;
    this.fields = d.form.fields;
    this.formFields = d.form.fields;
  }

  private clearComponent(): void {
    this.configSub?.unsubscribe();
    this.pid = "";
    this.config = null;
    this.configLoading = false;
    this.configError = "";
    this.fields = [];
    this.formFields = [];
    this.firewallKeys = null;
    this.wireGraph = null;
    this.form = new EsfForm(this.fb, null, []);
  }

  /** The component's fields: each setting its definition lists, in its order, with the value it has now. */
  private buildForm(config: EsfComponentConfig | null, services: EsfComponentFactory[] = []): void {
    this.config = config;
    this.componentFactories = services;
    this.form = new EsfForm(this.fb, config, config?.definition?.attributes ?? [], services);
    this.fields = this.form.fields;
    // The Wire Graph Service: its graph drawn, not its JSON text (a text that isn't a graph stays the field it is).
    this.wireGraph = config?.pid === ESF_WIRE_GRAPH_PID ? parseEsfWireGraph(config.properties[ESF_WIRE_GRAPH_SETTING]?.value) : null;
    // A firewall's rule settings (open ports, port forwarding, NAT): its card's table, not text fields.
    const firewall: Partial<Record<EsfFirewallSection, string>> = {};
    this.firewallIpv6 = false;
    this.formFields = this.fields.filter((f) => {
      if (this.wireGraph && f.attr.id === ESF_WIRE_GRAPH_SETTING) {
        return false;
      }
      const setting = f.kind === "text" || f.kind === "textarea" ? esfFirewallSettingOf(f.attr.id) : null;
      if (setting) {
        firewall[setting.section] = f.key;
        this.firewallIpv6 = setting.ipv6;
      }
      return !setting;
    });
    this.firewallKeys = Object.keys(firewall).length ? firewall : null;
  }
}
