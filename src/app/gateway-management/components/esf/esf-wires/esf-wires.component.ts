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

import {
  ChangeDetectorRef,
  Component,
  DestroyRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  QueryList,
  SimpleChanges,
  TemplateRef,
  ViewChild,
  ViewChildren,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormBuilder, FormsModule } from "@angular/forms";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { forkJoin, from, Observable, of, Subscription } from "rxjs";
import { catchError, concatMap, filter, finalize, map, switchMap, take, tap, toArray } from "rxjs/operators";
import { SharedModule } from "@shared/public-api";
import { CalloutComponent } from "../../../../components/shared/callout/callout.component";
import { CollapsibleCardComponent } from "../../../../components/shared/collapsible-card/collapsible-card.component";
import { downloadJson } from "../../../../components/shared/csv";
import { SkeletonCardComponent } from "../../../../components/shared/skeleton-card/skeleton-card.component";
import { TableLinkComponent, TableLinksComponent } from "../../../../components/shared/table-links/table-links.component";
import { SelectComponent, TbSelectOption } from "../../../../components/shared/select/select.component";
import { ToastTone } from "../../../../components/shared/toasts/toasts.component";
import { registerUnsaved } from "../../../../components/shared/dashboard/unsaved-changes";
import { ESF_CONFIG_API, ESF_RPC, EsfCallError, EsfComponentConfig, EsfProperty, esfServiceIcon, esfUpdateManyRequest, parseEsfConfigs, parseEsfPids } from "../../../models/esf.models";
import { EsfForm } from "../../../models/esf-form.models";
import { EsfReceivedProperties } from "../../../models/esf-regex.models";
import { EsfClient, EsfConfirm, esfReason, esfSubscribe, parseEsfChannels } from "../../../models/esf-api.models";
import { ESF_ASSET_READ_MAX_CHANNELS, esfAssetChannels, esfDriverTypeName, isEsfAssetFactory, isEsfDriverFactory } from "../../../models/esf-drivers.models";
import { EsfComponentFactory } from "../../../models/esf-security.models";
import {
  addEsfWireComponent,
  esfAssetEmits,
  ESF_WIRE_GRAPH_PID,
  ESF_WIRE_GRAPH_SETTING,
  ESF_WIRE_PID,
  ESF_WIRE_ROLE_ICONS,
  EsfWireFactory,
  EsfWireGraph,
  esfWireKey,
  esfWireKindName,
  esfNewWireConfig,
  WIRE_DRAG_TYPE,
  esfWireRole,
  EsfWireRole,
  esfWirePropertiesInto,
  esfWireUpdateBody,
  parseEsfWireFactories,
  parseEsfWireGraph,
  removeEsfWire,
  removeEsfWireComponent,
  serializeEsfWireGraph,
} from "../../../models/esf-wires.models";
import { EsfWireGraphComponent } from "../../esf-wire-graph/esf-wire-graph.component";
import { EsfSettingsComponent } from "../../esf-settings/esf-settings.component";
import { EsfAssetEditorComponent } from "../../esf-asset-editor/esf-asset-editor.component";

/** The kinds' definitions are read this many at a time (each a few KB, with its settings): no reply near the MQTT limit. */
const DEFINITIONS_BATCH = 6;
/** A component added to the graph goes this far right of the rightmost one (the composer's units: its 120-wide boxes, on its 20 grid). */
const NEW_COMPONENT_STEP = 180;

/** A palette entry: a kind to make a component of, or an asset already on the unit to put in the graph. */
/** An asset's editor's inputs (`tb-gm-esf-asset-editor`), read as it's picked. */
interface AssetEditorInputs {
  pid: string;
  driverType: string;
  templates: string[];
  tooManyChannels: number | null;
}

interface PaletteItem {
  key: string;
  label: string;
  icon: string;
  /** A kind: a new component of it (named first). */
  factory?: EsfWireFactory;
  /** An asset already on the unit, not in the graph. */
  asset?: string;
}

const ROLE_HEADINGS: Record<EsfWireRole, string> = { emitter: "Emitters", receiver: "Receivers", both: "Emitters and receivers" };

/**
 * The ESF unit's Wire graph (its own entry under ESF): the graph drawn (`tb-gm-esf-wire-graph` — the Wire Graph Service's one
 * setting, Configuration v2), and under it, as ESF's console shows them, the settings of the component picked in it (a box's
 * click: its form, `tb-gm-esf-settings` fixed on it, its own Apply).
 *
 * Edited as ESF's Wires composer does, when the gateway's ESF user may (`rest.wires.admin`: the kinds' metadata read, else the
 * graph stays read only and says why): the palette beside the graph lists the kinds by their ports — Emitters, Receivers,
 * Emitters and receivers, named and marked as ESF's composer marks them — and the unit's assets not in the graph; a kind picked
 * asks for the component's name (a WireAsset its driver too), then puts it in the graph. On the graph, boxes move, wires are drawn from an output port to an input port and deleted; a component picked can be
 * deleted. Every edit is a draft: "Apply changes" puts the whole graph to the unit in one call (WIRE-V1, all or nothing — the
 * topology and each new component by its factory, ESF making it with its defaults; ESF deletes a component the graph no longer
 * holds — but an asset, which stays in Drivers and assets — so Apply names those and asks first), Cancel goes back to the unit's. Refresh reads
 * it again, Download saves the graph and its components' settings as JSON (ESF's Download's shape, passwords as ESF gives them:
 * "placeholder"), Delete graph (confirmed) empties it. The graph's components are left out of Configuration.
 */
let dialogs = 0;

@Component({
  selector: "tb-gm-esf-wires",
  templateUrl: "./esf-wires.component.html",
  styleUrls: ["./esf-wires.component.scss"],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    SharedModule,
    CalloutComponent,
    CollapsibleCardComponent,
    SelectComponent,
    SkeletonCardComponent,
    TableLinkComponent,
    TableLinksComponent,
    EsfWireGraphComponent,
    EsfSettingsComponent,
    EsfAssetEditorComponent,
  ],
})
export class EsfWiresComponent implements OnChanges {
  @Input() client: EsfClient | null = null;
  @Input() gatewayName = "";
  @Output() notify = new EventEmitter<{ tone: ToastTone; message: string }>();
  @Output() confirm = new EventEmitter<EsfConfirm>();

  readonly configApi = ESF_CONFIG_API;
  /** The graph as the unit has it, and the draft edited from it (the same until something's edited). */
  saved: EsfWireGraph | null = null;
  draft: EsfWireGraph | null = null;
  /** The components added in the draft, by their factory: made on the unit when the graph is applied (a new map each change). */
  created = new Map<string, string>();
  /** A new component's settings besides its factory and its form (a new asset's driver), sent with it. */
  createdSettings = new Map<string, Record<string, unknown>>();
  /**
   * A new component's settings, before the graph is applied: its configuration made from its kind's definition (each setting at
   * its default) and its form, shown as any component's under the graph — what's changed is sent with it (as ESF's composer).
   */
  newForms = new Map<string, { config: EsfComponentConfig; form: EsfForm }>();
  /** Bumped when another graph is shown: laid out and fitted afresh. */
  layoutKey = 0;
  factories: EsfComponentFactory[] = [];
  loading = false;
  error = "";
  /** The kinds of Wire component (the palette); null not read. */
  kinds: EsfWireFactory[] | null = null;
  /** Why the graph can't be edited ("" it can — or the kinds aren't read yet). */
  editNote = "";
  /** The component picked ("" none), and it as the settings form's one component (kept: a new array would reload it). */
  selected = "";
  selectedPids: string[] = [];
  selectedWire = "";
  /** A kind picked in the palette: its new component's name asked first, in the dashboard's dialog (`newDialog`). */
  adding: EsfWireFactory | null = null;
  /** The dialog's content: the new component's name (a WireAsset's driver too) — rendered in the page's dialog. */
  @ViewChild("newDialog", { static: true }) private newDialog?: TemplateRef<unknown>;
  /** The dialog asked for (it closes itself on Enter: `closed`). */
  private addDialog: EsfConfirm | null = null;
  /** Where a kind dropped on the canvas goes (the composer's units), once it's named; null — right of the rightmost box. */
  private dropAt: { x: number; y: number } | null = null;
  /**
   * The components on the unit picked so far: each one's settings' form, read as it's first picked and kept as another is picked
   * — their edits applied with the graph's one Cancel | Apply (as ESF's composer applies a graph and its components together);
   * why one couldn't be read. Forgotten once applied, or read again (Refresh).
   */
  unitForms = new Map<string, { config: EsfComponentConfig; form: EsfForm }>();
  unitErrors = new Map<string, string>();
  /**
   * The assets on the unit picked so far: each one's editor's inputs (its driver's kind, the assets a new channel takes its shape
   * from while it has none, its channels' count when too many to read) — its editor kept, hidden while another is picked, its edits
   * applied with the graph's.
   */
  openedAssets: AssetEditorInputs[] = [];
  /**
   * The graph's assets' channels as the unit has them (the Assets REST API, read with each asset's editor): what their records carry
   * (`esfAssetEmits`), for a Regex Filter wired from one (`receivesOf`).
   */
  private assetChannels = new Map<string, EsfReceivedProperties>();
  @ViewChildren(EsfAssetEditorComponent) private assetEditors?: QueryList<EsfAssetEditorComponent>;
  /** The components whose settings are being read (or wait their turn): a box picked meanwhile shows its placeholder. */
  private reading = new Set<string>();
  /** Every component's settings read as the graph is shown, one at a time. */
  private preloadSub: Subscription | null = null;
  readonly trackAsset = (_: number, a: AssetEditorInputs) => a.pid;
  /** The name box's id (page-wide). */
  readonly newNameId = `ew-new-name-${++dialogs}`;
  newName = "";
  /** A new WireAsset's driver (its pid). */
  newDriver = "";
  /** The unit's drivers (a new WireAsset's picks). */
  driverOptions: TbSelectOption[] = [];
  nameTouched = false;
  applying = false;
  deleting = false;
  downloading = false;
  palette: { heading: string; items: PaletteItem[] }[] = [];

  readonly trackGroup = (_: number, g: { heading: string }) => g.heading;
  readonly trackItem = (_: number, i: PaletteItem) => i.key;

  constructor(
    private cd: ChangeDetectorRef,
    private destroyRef: DestroyRef,
    private fb: FormBuilder
  ) {
    // Unapplied edits (the graph, a component's settings): leaving the page asks first — the dashboard's dialog — and closing the
    // tab gets the browser's warning (`registerUnsaved`).
    const off = registerUnsaved({
      dirty: () => this.dirty,
      ask: (proceed) =>
        this.confirm.emit({
          heading: "Leave without applying?",
          message: `The Wire graph on ${this.gatewayName || "the gateway"} has changes not applied yet: leaving drops them.`,
          confirmLabel: "Leave",
          danger: true,
          run: proceed,
        }),
    });
    this.destroyRef.onDestroy(off);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["client"]) {
      this.saved = null;
      this.draft = null;
      this.kinds = null;
      this.editNote = "";
      this.forgetNew();
      this.select("");
      this.load();
    }
  }

  /** The graph can be edited: the kinds read (the gateway's ESF user has `rest.wires.admin`). */
  get editable(): boolean {
    return !!this.kinds && !this.editNote;
  }

  /** The graph itself edited (its components, places or wires). */
  get graphDirty(): boolean {
    return !!this.draft && !!this.saved && JSON.stringify(serializeEsfWireGraph(this.draft)) !== JSON.stringify(serializeEsfWireGraph(this.saved));
  }

  /** Something to apply: the graph, or a component's settings (on the unit: its form; an asset: its editor). */
  get dirty(): boolean {
    return this.graphDirty || [...this.unitForms.values()].some((u) => u.form.dirty) || !!this.assetEditors?.some((e) => e.dirty);
  }

  /** Something edited that ESF won't take: Apply waits (its form shows what's wrong). */
  get invalid(): boolean {
    return this.newInvalid || [...this.unitForms.values()].some((u) => u.form.invalid) || !!this.assetEditors?.some((e) => e.dirty && e.invalid);
  }

  get busy(): boolean {
    return this.applying || this.deleting;
  }

  /** The settings card's title, as ESF's console names it: "Timer · OPC_Timer" (its factory's name, then its pid). */
  get selectedHeading(): string {
    const factory = this.factoryOf(this.selected);
    return factory ? `${esfWireKindName(factory)} · ${this.selected}` : this.selected;
  }

  /** The component picked is new (added, not applied): it has no settings on the unit yet. */
  get selectedIsNew(): boolean {
    return this.created.has(this.selected);
  }

  /** The new component picked: its settings' form (its kind's defaults, edited before the graph is applied); null for another. */
  get selectedDraft(): { config: EsfComponentConfig; form: EsfForm } | null {
    return this.newForms.get(this.selected) ?? null;
  }

  /** A new component's settings changed to something ESF won't take: Apply waits (its form shows what's wrong). */
  get newInvalid(): boolean {
    return [...this.newForms.values()].some((d) => d.form.invalid);
  }

  /** The name asked for a new component: what's wrong with it, else "". */
  get nameError(): string {
    const name = this.newName.trim();
    if (!name) {
      return "A name";
    }
    if (!ESF_WIRE_PID.test(name)) {
      return "Letters, digits, '_', '-' or '.'";
    }
    if (this.draft?.components.some((c) => c.pid === name) || this.factories.some((f) => f.pid === name)) {
      return "The unit has a component of this name";
    }
    return "";
  }

  /** A kind's name ("Timer", "Cloud Publisher"). */
  kindName(kind: EsfWireFactory): string {
    return esfWireKindName(kind.factoryPid);
  }

  /** The kind being added is a WireAsset: its driver asked too. */
  get addingAsset(): boolean {
    return !!this.adding && isEsfAssetFactory(this.adding.factoryPid);
  }

  get driverError(): string {
    return this.addingAsset && !this.newDriver ? "A driver" : "";
  }

  /** A box clicked: its component's settings under the graph (a wire picked let go); "" — a click off: none. */
  select(pid: string): void {
    const again = pid === this.selected;
    this.selected = pid;
    this.selectedPids = pid ? [pid] : [];
    if (pid) {
      this.selectedWire = "";
    }
    if (!again) {
      this.readSelected();
    }
  }

  /**
   * The component picked: nothing read — its settings were read with the graph (`preloadSettings`); one that wasn't (or whose
   * read failed) read now.
   */
  private readSelected(): void {
    const pid = this.selected;
    if (!pid || this.selectedIsNew || this.reading.has(pid) || this.unitForms.has(pid) || this.selectedAssetOpen) {
      return;
    }
    this.reading.add(pid);
    this.readSettingsOf(pid).pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
  }

  /**
   * Every component of the graph the unit has: its settings read once as the graph is shown — one at a time (never one reply near
   * ThingsBoard's MQTT limit; the twin answers most at once), the one picked first — so a box's click shows its settings at once.
   */
  private preloadSettings(): void {
    this.preloadSub?.unsubscribe();
    const onUnit = new Set(this.factories.map((f) => f.pid));
    const open = new Set(this.openedAssets.map((a) => a.pid));
    // Those not read yet (all of them after a fresh read; after Apply, the ones new to the unit).
    const pids = (this.saved?.components ?? [])
      .map((c) => c.pid)
      .filter((pid) => onUnit.has(pid) && !this.unitForms.has(pid) && !open.has(pid));
    pids.sort((a, b) => (a === this.selected ? -1 : b === this.selected ? 1 : 0));
    this.reading = new Set(pids);
    this.preloadSub = from(pids)
      .pipe(
        concatMap((pid) => this.readSettingsOf(pid)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe();
  }

  /** A component's settings read: an asset's editor's inputs, any other's form; its read done (failed: why), its placeholder gone. */
  private readSettingsOf(pid: string): Observable<unknown> {
    const read$ = isEsfAssetFactory(this.factoryOf(pid)) ? this.readAssetEditor(pid) : this.readUnitForm(pid);
    return read$.pipe(
      finalize(() => {
        this.reading.delete(pid);
        this.cd.markForCheck();
      })
    );
  }

  /** The component picked's form (on the unit, not an asset); null while it's read. */
  get selectedUnitForm(): { config: EsfComponentConfig; form: EsfForm } | null {
    return this.unitForms.get(this.selected) ?? null;
  }

  get selectedUnitError(): string {
    return this.unitErrors.get(this.selected) ?? "";
  }

  /** The asset picked's editor is open (its inputs read). */
  get selectedAssetOpen(): boolean {
    return this.openedAssets.some((a) => a.pid === this.selected);
  }

  /** A component on the unit's settings (its definition with them), kept as its form, with the unit's services. */
  private readUnitForm(pid: string): Observable<unknown> {
    const client = this.client;
    if (!client) {
      return of(null);
    }
    return forkJoin([client.call(ESF_CONFIG_API.getConfig, { pids: [pid] }), client.componentFactories()]).pipe(
      tap(([reply, services]) => {
        const config = parseEsfConfigs(reply).find((c) => c.pid === pid);
        if (!config) {
          this.unitErrors = new Map(this.unitErrors).set(pid, "The unit returned no configuration for this component.");
          return;
        }
        const form = new EsfForm(this.fb, config, config.definition?.attributes ?? [], services);
        form.receives = this.receivesOf(pid);
        this.unitForms = new Map(this.unitForms).set(pid, { config, form });
        this.unitErrors.delete(pid);
      }),
      catchError((err) => {
        this.unitErrors = new Map(this.unitErrors).set(pid, esfReason(err));
        return of(null);
      })
    );
  }

  /** The settings edited, of the components on the unit still in the graph: their changes (an asset's, its editor's). */
  private settingsChanges(): { pid: string; properties: Record<string, EsfProperty> }[] {
    const kept = new Set(this.draft?.components.map((c) => c.pid) ?? []);
    const forms = [...this.unitForms.entries()].filter(([pid, u]) => kept.has(pid) && u.form.dirty).map(([pid, u]) => ({ pid, properties: u.form.changes() }));
    const assets = (this.assetEditors?.toArray() ?? []).filter((e) => kept.has(e.pid) && e.dirty).map((e) => ({ pid: e.pid, properties: e.pendingProperties() }));
    return [...forms, ...assets];
  }

  /** The components' settings read again (applied, refreshed): the forms and editors dropped, the one picked read afresh. */
  private forgetSettings(): void {
    this.preloadSub?.unsubscribe();
    this.reading = new Set();
    this.unitForms = new Map();
    this.unitErrors = new Map();
    this.openedAssets = [];
    this.assetChannels.clear();
  }

  /** The component picked is an asset the unit has: its channels' table and its settings (the Drivers and assets view's editor). */
  get selectedIsUnitAsset(): boolean {
    return !!this.selected && !this.selectedIsNew && isEsfAssetFactory(this.factoryOf(this.selected));
  }

  /**
   * The asset picked's editor, as the Drivers and assets view opens it: its channels counted (the Assets REST API) — past
   * `ESF_ASSET_READ_MAX_CHANNELS` its settings never read whole — then its settings for its driver (its kind, the grid's title);
   * with no channel yet, the unit's other assets of a driver of the same kind read one at a time, a new channel's shape.
   */
  private readAssetEditor(pid: string): Observable<unknown> {
    const client = this.client;
    if (!client) {
      return of(null);
    }
    const driverOf = (reply: unknown, of: string) => {
      const config = parseEsfConfigs(reply).find((c) => c.pid === of);
      const driver = String(config?.properties["driver.pid"]?.value ?? "");
      return { driver, factory: this.factories.find((f) => f.pid === driver)?.factoryPid ?? "", channels: esfAssetChannels(config?.definition?.attributes ?? []).length };
    };
    const inputs$: Observable<AssetEditorInputs> = client
      .call("esfAssetChannels", undefined, { asset: pid })
      .pipe(
        map((reply) => {
          const channels = parseEsfChannels(reply);
          this.assetChannels.set(pid, esfAssetEmits(channels));
          return channels.length as number | null;
        }),
        catchError(() => of(null)),
        switchMap((count): Observable<AssetEditorInputs> => {
          if (count !== null && count > ESF_ASSET_READ_MAX_CHANNELS) {
            return of({ pid, driverType: "", templates: [] as string[], tooManyChannels: count });
          }
          return client.call(ESF_CONFIG_API.getConfig, { pids: [pid] }).pipe(
            map((reply) => driverOf(reply, pid)),
            catchError(() => of({ driver: "", factory: "", channels: 0 })),
            switchMap((own) => {
              const others = own.channels || !own.factory ? [] : this.factories.filter((f) => f.pid !== pid && isEsfAssetFactory(f.factoryPid ?? ""));
              const templates$ = others.length
                ? of(...others).pipe(
                    concatMap((a) =>
                      client.call(ESF_CONFIG_API.getConfig, { pids: [a.pid] }).pipe(
                        map((reply) => ({ pid: a.pid, ...driverOf(reply, a.pid) })),
                        catchError(() => of(null))
                      )
                    ),
                    filter((t): t is { pid: string; driver: string; factory: string; channels: number } =>
                      !!t && t.factory === own.factory && t.channels > 0 && t.channels <= ESF_ASSET_READ_MAX_CHANNELS
                    ),
                    take(1),
                    map((t) => t.pid),
                    toArray()
                  )
                : of([] as string[]);
              return templates$.pipe(
                map((templates): AssetEditorInputs => ({ pid, driverType: own.factory ? esfDriverTypeName(own.factory) : "", templates, tooManyChannels: null }))
              );
            })
          );
        })
      );
    return inputs$.pipe(tap<AssetEditorInputs>((editor) => (this.openedAssets = [...this.openedAssets.filter((a) => a.pid !== pid), editor])));
  }

  /**
   * "Delete component" (the title row's, or the Delete key): the wire picked taken out of the draft at once; the component picked once
   * it's confirmed (the dashboard's dialog — what applying does to it: deleted from the unit, an asset only leaving the graph, a new
   * one never made), then `removeSelected`.
   */
  deleteSelected(): void {
    if (this.selectedWire && this.draft) {
      this.draft = removeEsfWire(this.draft, this.selectedWire);
      this.selectedWire = "";
      return;
    }
    const pid = this.selected;
    if (!pid) {
      return;
    }
    const isNew = this.created.has(pid);
    const asset = !isNew && isEsfAssetFactory(this.factoryOf(pid));
    this.confirm.emit({
      heading: `Delete ${pid}?`,
      message: isNew
        ? "It isn't on the unit yet: it's only taken out of the draft, with its wires."
        : asset
          ? "It leaves the graph with its wires when the graph is applied; the asset itself stays on the unit, in Drivers and assets."
          : "It leaves the graph with its wires now, and is deleted from the unit when the graph is applied.",
      confirmLabel: "Delete",
      danger: true,
      run: () => {
        if (this.selected === pid) {
          this.removeSelected();
        }
      },
    });
  }

  /** A wire clicked (picked: "Delete wire" in the title row): the box picked let go. */
  onWireSelect(key: string): void {
    this.selectedWire = key;
    if (key) {
      this.select("");
    }
  }

  onGraphChange(graph: EsfWireGraph): void {
    this.draft = graph;
  }

  /** A palette entry picked: an asset goes in the graph; a kind asks for its component's name. */
  pick(item: PaletteItem, at: { x: number; y: number } | null = null): void {
    if (item.asset) {
      this.place(item.asset, 1, 1, {}, {}, at);
      return;
    }
    if (item.factory && this.newDialog) {
      const kind = item.factory;
      this.dropAt = at;
      this.adding = kind;
      this.newName = "";
      this.newDriver = this.driverOptions.length === 1 ? String(this.driverOptions[0].value) : "";
      this.nameTouched = false;
      this.addDialog = {
        heading: `New ${this.kindName(kind)}`,
        message: "",
        confirmLabel: "Add",
        danger: false,
        form: true,
        content: this.newDialog,
        confirmDisabled: () => !!this.nameError || !!this.driverError,
        run: () => this.addNew(),
        cancel: () => this.cancelAdd(),
      };
      this.confirm.emit(this.addDialog);
      // Its name box takes the focus once the dialog is on the page.
      setTimeout(() => document.getElementById(this.newNameId)?.focus());
    }
  }

  cancelAdd(): void {
    this.adding = null;
    this.addDialog = null;
    this.dropAt = null;
  }

  /** A palette entry dragged (as ThingsBoard's rule chain editor's nodes): its key goes with it, for the canvas' drop. */
  onDragStart(e: DragEvent, item: PaletteItem): void {
    if (this.busy || !e.dataTransfer) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData(WIRE_DRAG_TYPE, item.key);
    e.dataTransfer.effectAllowed = "copy";
  }

  /** A palette entry dropped on the canvas: placed there — a kind once it's named (the dialog), an asset at once. */
  onDrop(drop: { key: string; x: number; y: number }): void {
    const item = this.palette.flatMap((g) => g.items).find((i) => i.key === drop.key);
    if (item && !this.busy) {
      this.pick(item, { x: drop.x, y: drop.y });
    }
  }

  /** Enter in the dialog's name box: added, as its "Add" — the dialog closed by the view (`closed`). */
  submitNew(): void {
    this.nameTouched = true;
    if (this.nameError || this.driverError || !this.addDialog) {
      return;
    }
    this.addDialog.closed = true;
    this.addNew();
  }

  /** The new component named: in the draft, its ports its kind's defaults; made on the unit when the graph is applied. */
  addNew(): void {
    this.nameTouched = true;
    const kind = this.adding;
    if (!kind || this.nameError || this.driverError) {
      return;
    }
    const pid = this.newName.trim();
    this.created = new Map(this.created).set(pid, kind.factoryPid);
    if (this.addingAsset) {
      this.createdSettings = new Map(this.createdSettings).set(pid, { "driver.pid": { type: "STRING", value: this.newDriver } });
    }
    const config = esfNewWireConfig(pid, kind);
    const form = new EsfForm(this.fb, config, kind.definition.attributes, this.factories);
    form.receives = this.receivesOf(pid);
    this.newForms = new Map(this.newForms).set(pid, { config, form });
    this.place(pid, kind.inputs, kind.outputs, kind.inputNames, kind.outputNames, this.dropAt);
    this.adding = null;
    this.addDialog = null;
    this.dropAt = null;
  }

  /** The components added in the draft forgotten (applied, cancelled, another gateway). */
  private forgetNew(): void {
    this.created = new Map();
    this.createdSettings = new Map();
    this.newForms = new Map();
  }

  /**
   * The component picked taken out of the draft (with its wires); a new one forgotten. ESF deletes a component the graph no longer
   * holds when the graph is applied (Apply names them first) — but an asset: it stays, in Drivers and assets (both tried on
   * dev-inf-gw-01, 18 November 2026).
   */
  removeSelected(): void {
    if (!this.draft || !this.selected) {
      return;
    }
    this.draft = removeEsfWireComponent(this.draft, this.selected);
    if (this.created.has(this.selected)) {
      const created = new Map(this.created);
      created.delete(this.selected);
      this.created = created;
      const settings = new Map(this.createdSettings);
      settings.delete(this.selected);
      this.createdSettings = settings;
      const forms = new Map(this.newForms);
      forms.delete(this.selected);
      this.newForms = forms;
    }
    this.select("");
    this.buildPalette();
  }

  /** The draft dropped: back to the graph the unit has. */
  cancel(): void {
    this.draft = this.saved;
    this.forgetNew();
    this.unitForms.forEach((u) => u.form.reset());
    this.assetEditors?.forEach((e) => e.reset());
    this.selectedWire = "";
    this.adding = null;
    if (this.selected && !this.saved?.components.some((c) => c.pid === this.selected)) {
      this.select("");
    }
    this.layoutKey++;
    this.buildPalette();
  }

  /**
   * Apply changes: put at once — a component taken out of the graph was confirmed as it was deleted ("Delete component"), so
   * applying asks nothing again.
   */
  apply(): void {
    if (this.invalid) {
      this.notify.emit({ tone: "warning", message: "A component's settings need a look first" });
      return;
    }
    this.put();
  }

  /**
   * Applied: what the forms hold is what the unit has — each applied form's values its new start (nothing reads as changed), each new
   * component's form now one of the unit's (a new asset's editor read once it's there).
   */
  private keepApplied(): void {
    const forms = new Map(this.unitForms);
    forms.forEach((u) => u.form.dirty && u.form.markSaved());
    for (const [pid, d] of this.newForms) {
      if (!isEsfAssetFactory(this.created.get(pid) ?? "")) {
        d.form.markSaved();
        forms.set(pid, d);
      }
    }
    this.unitForms = forms;
  }

  /** Each new component's settings: what its form changed from its kind's defaults, and its driver (a WireAsset's). */
  private newSettings(): Map<string, Record<string, unknown>> {
    const out = new Map<string, Record<string, unknown>>();
    for (const pid of this.created.keys()) {
      out.set(pid, { ...(this.newForms.get(pid)?.form.changes() ?? {}), ...(this.createdSettings.get(pid) ?? {}) });
    }
    return out;
  }

  /**
   * Everything applied: the graph put to the unit — in one call, all or nothing (its new components with their settings) — when
   * it's changed, then the components' settings edited under it (on the unit, still in the graph) in one update, a snapshot after;
   * read again after.
   */
  private put(): void {
    const client = this.client;
    if (!client || !this.draft || this.busy) {
      return;
    }
    this.applying = true;
    const settings = this.settingsChanges();
    // The assets whose edits go now: their editors read again once applied (their channels as the unit makes them).
    const appliedAssets = (this.assetEditors?.toArray() ?? []).filter((e) => e.dirty).map((e) => e.pid);
    const graph$ = this.graphDirty ? client.call("esfWireUpdate", esfWireUpdateBody(this.draft, this.created, this.newSettings())) : of(null);
    esfSubscribe(
      graph$.pipe(switchMap(() => (settings.length ? client.call(ESF_CONFIG_API.updateConfig, esfUpdateManyRequest(settings)) : of(null)))),
      this.destroyRef,
      () => {
        this.applying = false;
        this.keepApplied();
        client.forgetComponentFactories();
        this.notify.emit({ tone: "success", message: "Settings applied" });
        this.load({ keep: true, reloadAssets: appliedAssets });
      },
      (reason) => {
        this.applying = false;
        this.notify.emit({ tone: "error", message: `Couldn't apply the Wire graph: ${reason}` });
        this.cd.markForCheck();
      }
    );
  }

  /** Delete graph (confirmed): the unit's graph emptied — its components deleted with it. */
  askDeleteGraph(): void {
    this.confirm.emit({
      heading: "Delete the Wire graph?",
      message: `Every component in ${this.gatewayName || "the unit"}'s Wire graph and every wire between them are deleted from the unit.`,
      confirmLabel: "Delete graph",
      danger: true,
      run: () => this.deleteGraph(),
    });
  }

  /** Download: the graph and its components' settings, as ESF's Download gives them (`{ configs }`), one component read at a time. */
  download(): void {
    const client = this.client;
    const graph = this.saved;
    if (!client || !graph || this.downloading) {
      return;
    }
    this.downloading = true;
    const pids = [ESF_WIRE_GRAPH_PID, ...graph.components.map((c) => c.pid)];
    const reads: Observable<unknown>[] = pids.map((pid) =>
      client.call(ESF_RPC.getConfig, { pids: [pid] }).pipe(
        map((reply) => parseEsfConfigs(reply).find((c) => c.pid === pid) ?? null),
        map((c) => (c ? { pid: c.pid, properties: c.properties } : null)),
        catchError(() => of(null))
      )
    );
    esfSubscribe(
      forkJoin(reads),
      this.destroyRef,
      (configs) => {
        this.downloading = false;
        downloadJson(`${this.gatewayName || "esf"}-wire-graph`, { configs: (configs as unknown[]).filter((c) => !!c) });
        this.cd.markForCheck();
      },
      (reason) => {
        this.downloading = false;
        this.notify.emit({ tone: "error", message: `Couldn't download the Wire graph: ${reason}` });
        this.cd.markForCheck();
      }
    );
  }

  /** The graph read (again), with the components' factories, and — once — the kinds (the palette): the graph shown kept while it's read. */
  /**
   * The graph read (again). A first read, Refresh, another gateway: laid out and fitted afresh, every component's settings read
   * again. After Apply (`keep`): the view as the viewer has it (its place, its zoom, what's picked), the forms kept (what they hold is
   * applied), only what's missing read — the components new to the unit, and the assets whose edits went (`reloadAssets`: their
   * editors read again, their channels as the unit made them).
   */
  load(options: { keep?: boolean; reloadAssets?: string[] } = {}): void {
    const client = this.client;
    if (!client) {
      return;
    }
    this.loading = true;
    this.error = "";
    const kinds$ = this.kinds ? of(this.kinds) : this.readKinds(client);
    esfSubscribe(
      forkJoin([client.call(ESF_RPC.getConfig, { pids: [ESF_WIRE_GRAPH_PID] }), client.componentFactories(), kinds$]),
      this.destroyRef,
      (reply) => {
        if (client !== this.client) {
          return;
        }
        const [configs, factories, kinds] = reply as [unknown, EsfComponentFactory[], EsfWireFactory[] | string];
        const config = parseEsfConfigs(configs).find((c) => c.pid === ESF_WIRE_GRAPH_PID) ?? null;
        const graph = config ? parseEsfWireGraph(config.properties[ESF_WIRE_GRAPH_SETTING]?.value) : null;
        this.loading = false;
        this.factories = factories;
        if (typeof kinds === "string") {
          this.editNote = kinds;
        } else {
          this.kinds = kinds;
          this.editNote = "";
        }
        this.error = !config ? "The unit has no Wire Graph Service." : !graph ? "The Wire Graph Service's graph isn't one the dashboard can read." : "";
        this.saved = graph;
        this.draft = graph;
        this.forgetNew();
        const inGraph = new Set(graph?.components.map((c) => c.pid) ?? []);
        if (options.keep) {
          // The view kept (no fresh layout); a component no longer in the graph its settings dropped, the edited assets read again.
          this.unitForms = new Map([...this.unitForms].filter(([pid]) => inGraph.has(pid)));
          this.unitErrors = new Map([...this.unitErrors].filter(([pid]) => inGraph.has(pid)));
          this.openedAssets = this.openedAssets.filter((a) => inGraph.has(a.pid));
          this.assetEditors?.forEach((e) => options.reloadAssets?.includes(e.pid) && e.load());
          if (this.selectedWire && !graph?.wires.some((w) => esfWireKey(w) === this.selectedWire)) {
            this.selectedWire = "";
          }
        } else {
          this.selectedWire = "";
          this.layoutKey++;
          this.forgetSettings();
        }
        if (this.selected && !inGraph.has(this.selected)) {
          this.select("");
        }
        this.preloadSettings();
        this.buildPalette();
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
  }

  /** The kinds of Wire component: their factories, then their definitions a few at a time. Refused: why it can't be edited (a string). */
  private readKinds(client: EsfClient): Observable<EsfWireFactory[] | string> {
    return client.call("esfWireFactories").pipe(
      map((reply) => parseEsfPids(reply)),
      switchMap((pids) => {
        const batches: string[][] = [];
        for (let i = 0; i < pids.length; i += DEFINITIONS_BATCH) {
          batches.push(pids.slice(i, i + DEFINITIONS_BATCH));
        }
        return batches.length ? forkJoin(batches.map((b) => client.call("esfWireDefinitions", { pids: b }).pipe(map(parseEsfWireFactories)))) : of([]);
      }),
      map((lists) => lists.flat()),
      catchError((err) =>
        of(
          err instanceof EsfCallError && /403|forbidden/i.test(err.message)
            ? "Editing needs the gateway's ESF user to have the rest.wires.admin permission."
            : `The kinds of Wire component couldn't be read: ${esfReason(err)}`
        )
      )
    );
  }

  private deleteGraph(): void {
    const client = this.client;
    if (!client) {
      return;
    }
    this.deleting = true;
    esfSubscribe(
      client.call("esfWireDeleteGraph"),
      this.destroyRef,
      () => {
        this.deleting = false;
        client.forgetComponentFactories();
        this.notify.emit({ tone: "success", message: "Settings applied" });
        this.select("");
        this.load();
      },
      (reason) => {
        this.deleting = false;
        this.notify.emit({ tone: "error", message: `Couldn't delete the Wire graph: ${reason}` });
        this.cd.markForCheck();
      }
    );
  }

  /** A component into the draft, right of the rightmost one (the composer's units), picked. */
  private place(
    pid: string,
    inputs: number,
    outputs: number,
    inputNames: Record<number, string>,
    outputNames: Record<number, string>,
    at: { x: number; y: number } | null = null
  ): void {
    if (!this.draft) {
      return;
    }
    const comps = this.draft.components;
    const x = at ? at.x : comps.length ? Math.max(...comps.map((c) => c.x)) + NEW_COMPONENT_STEP : 0;
    const y = at ? at.y : comps.length ? Math.min(...comps.map((c) => c.y)) : 0;
    this.draft = addEsfWireComponent(this.draft, { pid, inputs, outputs, x, y, inputNames, outputNames });
    this.select(pid);
    this.buildPalette();
  }

  /** A component's factory: the unit's, else the one it's being made of (added, not applied). */
  /**
   * What reaches a component in the draft as it stands (`esfWirePropertiesInto` — its Regex Filter's warning): asked as its form is
   * shown, so a wire drawn or taken out, or an asset's channels read, counts at once.
   */
  private receivesOf(pid: string): () => EsfReceivedProperties | null {
    return () =>
      this.draft ? esfWirePropertiesInto(this.draft, pid, (p) => this.factoryOf(p), (p) => this.assetChannels.get(p) ?? null) : null;
  }

  private factoryOf(pid: string): string {
    return this.factories.find((f) => f.pid === pid)?.factoryPid ?? this.created.get(pid) ?? "";
  }

  /** The palette: the kinds by their ports (ESF's names and marks), then the unit's assets not in the graph; the drivers a new WireAsset picks from. */
  private buildPalette(): void {
    const groups: { heading: string; items: PaletteItem[] }[] = [];
    const kinds = this.kinds ?? [];
    for (const role of ["emitter", "receiver", "both"] as EsfWireRole[]) {
      const items = kinds
        .filter((k) => esfWireRole(k) === role)
        .map((k) => ({ key: k.factoryPid, label: esfWireKindName(k.factoryPid), icon: ESF_WIRE_ROLE_ICONS[role], factory: k }))
        .sort((a, b) => a.label.localeCompare(b.label));
      if (items.length) {
        groups.push({ heading: ROLE_HEADINGS[role], items });
      }
    }
    const inGraph = new Set(this.draft?.components.map((c) => c.pid) ?? []);
    const assets = this.factories
      .filter((f) => isEsfAssetFactory(f.factoryPid) && !inGraph.has(f.pid))
      .map((f) => ({ key: `asset:${f.pid}`, label: f.pid, icon: esfServiceIcon(f.factoryPid), asset: f.pid }))
      .sort((a, b) => a.label.localeCompare(b.label));
    if (assets.length) {
      groups.push({ heading: "Assets", items: assets });
    }
    this.palette = groups;
    this.driverOptions = this.factories
      .filter((f) => isEsfDriverFactory(f.factoryPid))
      .map((f) => ({ value: f.pid, label: f.pid }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }
}
