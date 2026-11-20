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
import { forkJoin } from "rxjs";
import { SharedModule } from "@shared/public-api";
import { CalloutComponent } from "../../../components/shared/callout/callout.component";
import { CheckboxComponent } from "../../../components/shared/checkbox/checkbox.component";
import { CollapsibleCardComponent } from "../../../components/shared/collapsible-card/collapsible-card.component";
import { DataTableCellDirective, DataTableColumn, DataTableComponent } from "../../../components/shared/data-table/data-table.component";
import { FoldComponent } from "../../../components/shared/fold/fold.component";
import { SETTING_PIECES } from "../../../components/shared/setting-object/setting-object.component";
import { FormActionsComponent } from "../../../components/shared/form-actions/form-actions.component";
import { SegmentOption } from "../../../components/shared/segmented-control/segmented-control.component";
import { SkeletonCardComponent } from "../../../components/shared/skeleton-card/skeleton-card.component";
import { TableLinkComponent, TableLinksComponent } from "../../../components/shared/table-links/table-links.component";
import { TimeframePickerComponent } from "../../../components/shared/timeframe-picker/timeframe-picker.component";
import { TipDirective } from "../../../components/shared/tip/tip.directive";
import { ToastTone } from "../../../components/shared/toasts/toasts.component";
import { EsfClient, esfSubscribe } from "../../models/esf-api.models";
import {
  EsfAssetChannel,
  esfAssetChannels,
  esfChannelLabel,
  esfChannelNameError,
  ESF_ASSET_READ_MAX_CHANNELS,
} from "../../models/esf-drivers.models";
import { EsfField, EsfForm } from "../../models/esf-form.models";
import { EsfComponentFactory } from "../../models/esf-security.models";
import { EsfAttribute, EsfComponentConfig, EsfProperty, esfUpdateRequest, ESF_CONFIG_API, parseEsfConfigs } from "../../models/esf.models";
import { EsfAssetDataComponent } from "../esf-asset-data/esf-asset-data.component";
import { EsfCellComponent } from "../esf-cell/esf-cell.component";
import { EsfFieldComponent } from "../esf-field/esf-field.component";

/** The asset's card's picker, in its right corner. */
const TABS: SegmentOption[] = [
  { id: "configuration", label: "Configuration" },
  { id: "data", label: "Data" },
];

/** Channel settings the grid leaves out to start (as ESF's console shows fewer): scale, offset, unit, a listen's details. */
const DEFAULT_HIDDEN = new Set([
  "+scaleoffset.type",
  "+scale",
  "+offset",
  "+unit",
  "listen.sampling.interval",
  "listen.queue.size",
  "listen.discard.oldest",
  "listen.subscribe.to.children",
]);

/** A cell's side padding in a table of controls (`tb-data-table [controlCells]`: 6px a side) — part of a column's least width. */
const CELL_PADDING = 12;
/** The table's first and last columns' outer side is the table's edge (16px, not 6px). */
const EDGE_EXTRA = 10;
/** A channel's Enabled: the grid's first column (as ESF's console). */
const ENABLED_KEY = "+enabled";
/** A text setting's box, and a new channel's name's. */
const TEXT_BOX_WIDTH = 150;
const NAME_BOX_WIDTH = 130;
/** The controls' text (the shared select's, number box's and text box's) and the table's column headers'. */
const CONTROL_FONT = '13px Roboto, "Helvetica Neue", sans-serif';
const HEADER_FONT = '500 12px Roboto, "Helvetica Neue", sans-serif';

let measurer: CanvasRenderingContext2D | null = null;
/** A text's width in a font, measured (a canvas — nothing laid out). */
function textWidth(text: string, font: string): number {
  measurer ??= document.createElement("canvas").getContext("2d");
  if (!measurer) {
    return text.length * 8;
  }
  measurer.font = font;
  return measurer.measureText(text).width;
}

/** A column header's width: uppercase, letter-spaced 0.06em (`table.tb-column-header`). */
function headerWidth(header: string): number {
  return textWidth(header.toUpperCase(), HEADER_FONT) + header.length * 0.72;
}

/**
 * A cell control's width for its content: a select — its longest option and its list's room around it (its tick, gap and
 * padding — a little more than the box's own padding and chevron); a number box — five digits (its bounds' own, if longer), its padding (18), chevrons (20) and border, and its unit; a
 * text box; a checkbox nothing (its box).
 */
function controlWidth(f: EsfField): number {
  switch (f.kind) {
    case "boolean":
      return 0;
    case "select":
      // Its list (floating, the box's width) the wider need: an option's tick (18), gap (8) and padding (20), the list's padding
      // (12) and border (2) — 60, against the box's own 56.
      return Math.max(0, ...f.options.map((o) => textWidth(o.label, CONTROL_FONT))) + 60;
    case "integer":
    case "decimal": {
      // Five digits (a Modbus address runs to 65535), or its bounds' own if longer.
      const digits = Math.max(5, String(f.max ?? "").length, String(f.min ?? "").length);
      return textWidth("0".repeat(digits), CONTROL_FONT) + 44 + (f.unit ? textWidth(f.unit, CONTROL_FONT) + 12 : 0);
    }
    default:
      return TEXT_BOX_WIDTH;
  }
}

/** The columns hidden, by driver kind ("Modbus"), as picked this session — another asset of the kind opens the same way. */
const HIDDEN_BY_KIND = new Map<string, Set<string>>();

/** A new channel, not yet applied: its name (editable until then) and its settings, from ESF's defaults. */
interface DraftChannel {
  id: number;
  name: string;
  form: EsfForm;
  /** Its fields by their own part ("+enabled", "unit.id"). */
  fields: Map<string, EsfField>;
}

/** A row of the grid: a channel the asset has (its settings' prefix), or a new one. */
interface GridRow {
  key: string;
  channel: string;
  name: string;
  draft: DraftChannel | null;
}

/**
 * An asset, as ESF's console's Drivers and Assets page shows one under its table (the Drivers and assets view's selected asset):
 * its channels' table or its values', Configuration | Data in the table's header (`dt-header-actions`). Configuration: its
 * channels in the shared table (`tb-data-table`, its "*" cell rendering every setting column — they're the run time's) — a row a
 * channel, a column a setting (`<channel>#<setting>` — the ones its driver gives its channels, so they change with the driver),
 * each cell its control (checkbox, floating select, number, text — `tb-gm-esf-cell`), fewer columns to start, "Columns (n/m)"
 * picking them (kept by driver kind this session) —
 * "Create new" adding a row (its name, its settings from ESF's defaults, their shape an existing channel's: this asset's or, it has
 * none, another asset's of a driver of the same kind — `templates`); then its own settings (the laid-out form: Asset, Emitting);
 * one "Apply changes" for all of it (one update, a snapshot — the new channels sent whole). Data: its values and a write
 * (`tb-gm-esf-asset-data`). An asset past `ESF_ASSET_READ_MAX_CHANNELS` isn't read (its settings wouldn't fit one reply).
 */
@Component({
  selector: "tb-gm-esf-asset-editor",
  templateUrl: "./esf-asset-editor.component.html",
  styleUrls: ["./esf-asset-editor.component.scss"],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    SharedModule,
    CalloutComponent,
    CheckboxComponent,
    CollapsibleCardComponent,
    DataTableCellDirective,
    DataTableComponent,
    EsfAssetDataComponent,
    FoldComponent,
    ...SETTING_PIECES,
    EsfCellComponent,
    EsfFieldComponent,
    FormActionsComponent,
    SkeletonCardComponent,
    TableLinkComponent,
    TableLinksComponent,
    TimeframePickerComponent,
    TipDirective,
  ],
})
export class EsfAssetEditorComponent implements OnChanges {
  @HostBinding("attr.title") readonly hostTitle: string | null = null;
  @Input() client: EsfClient | null = null;
  /** The asset (its pid). */
  @Input() pid = "";
  /** Its driver's kind ("Modbus"): the grid's title. */
  @Input() driverType = "";
  /** Other assets of a driver of the same kind (by pid): a new channel's settings' shape while this asset has none. */
  @Input() templates: string[] = [];
  /** Its channels' count when too many to read its settings (`ESF_ASSET_READ_MAX_CHANNELS`); null — read them. */
  @Input() tooManyChannels: number | null = null;
  @Input() gatewayName = "";
  /**
   * Its edits applied by its host, with the host's own (the Wire graph view's one Cancel | Apply, as ESF's composer applies a graph
   * and its components together): no buttons of its own, Enter applies nothing — the host reads `dirty`, `invalid` and
   * `pendingProperties()`, sends them, then `load()`s it again; Cancel is its `reset()`.
   */
  @Input() embedded = false;
  @Output() notify = new EventEmitter<{ tone: ToastTone; message: string }>();

  readonly tabs = TABS;
  tab = "configuration";

  loading = false;
  error = "";
  saving = false;
  /** The asset's form: its own settings (`cards`) and every channel's (the grid's cells). */
  form: EsfForm | null = null;
  rows: GridRow[] = [];
  /** The grid's setting columns shown (own parts, the name aside). */
  shownKeys: string[] = [];
  /** The table's columns: the name, each setting shown (a least width for its control and header), and — while new rows exist — their Remove. */
  gridColumns: DataTableColumn[] = [];
  /** Every column a channel has (own parts, in the definition's order; the name aside). */
  columnKeys: string[] = [];
  /** The column picker folded open. */
  columnsOpen = false;
  /** A new channel's shape being read (from another asset). */
  adding = false;

  private config: EsfComponentConfig | null = null;
  private channels: EsfAssetChannel[] = [];
  private fieldById = new Map<string, EsfField>();
  private drafts: DraftChannel[] = [];
  /** The row picked (its key: "c:<channel>", "n:<id>"), "" none — what Delete takes out. */
  pickedKey = "";
  /** The channels the asset has, deleted in the draft: off the grid, each setting sent with a null value on Apply (ESF drops it). */
  private deleted = new Set<string>();
  private draftSeq = 0;
  /** A new channel's settings' shape (an existing channel's attributes), once known. */
  private shape: EsfAttribute[] | null = null;

  constructor(
    private fb: FormBuilder,
    private cd: ChangeDetectorRef,
    private destroyRef: DestroyRef
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["client"] || changes["pid"] || changes["tooManyChannels"]) {
      this.tab = "configuration";
      this.load();
    }
  }

  /** The asset's settings (again), with the unit's services (its driver a pick of the unit's drivers); new channels dropped. */
  load(): void {
    const client = this.client;
    const pid = this.pid;
    this.error = "";
    this.drafts = [];
    this.deleted = new Set();
    this.pickedKey = "";
    this.shape = null;
    if (!client || !pid || this.tooManyChannels !== null) {
      this.form = null;
      this.rows = [];
      return;
    }
    this.loading = true;
    esfSubscribe(
      forkJoin([client.call(ESF_CONFIG_API.getConfig, { pids: [pid] }), client.componentFactories()]),
      this.destroyRef,
      (reply) => {
        if (client !== this.client || pid !== this.pid) {
          return;
        }
        const [configReply, services] = reply as [unknown, EsfComponentFactory[]];
        this.loading = false;
        this.config = parseEsfConfigs(configReply).find((c) => c.pid === pid) ?? null;
        if (!this.config) {
          this.error = "The unit returned no settings for this asset.";
          this.form = null;
          this.rows = [];
          this.cd.markForCheck();
          return;
        }
        const attributes = this.config.definition?.attributes ?? [];
        this.form = new EsfForm(this.fb, this.config, attributes, services);
        this.fieldById = new Map(this.form.fields.map((f) => [f.attr.id, f]));
        this.channels = esfAssetChannels(attributes);
        this.shape = this.channels[0]?.attributes ?? null;
        this.columnKeys = this.keysOf(this.shape ?? []);
        this.updateColumns();
        this.updateRows();
        this.cd.markForCheck();
      },
      (reason) => {
        if (client === this.client && pid === this.pid) {
          this.loading = false;
          this.error = reason;
          this.cd.markForCheck();
        }
      }
    );
  }

  /** A channel's own parts, in order, its name aside (the name column's). */
  private keysOf(attributes: EsfAttribute[]): string[] {
    return attributes.map((a) => a.id.slice(a.id.indexOf("#") + 1)).filter((k) => k !== "+name");
  }

  /** The columns hidden: as picked for its driver's kind this session, else the default few. */
  private get hidden(): Set<string> {
    return HIDDEN_BY_KIND.get(this.driverType) ?? DEFAULT_HIDDEN;
  }

  private updateColumns(): void {
    const hidden = this.hidden;
    this.shownKeys = this.columnKeys.filter((k) => !hidden.has(k));
    // Enabled first (as ESF's console), then the name, then the other settings in the definition's order.
    const enabled = this.shownKeys.includes(ENABLED_KEY);
    const rest = this.shownKeys.filter((k) => k !== ENABLED_KEY);
    // The table's first and last columns: their outer side the table's edge (16px, not a control cell's 6px).
    const last = this.drafts.length ? -1 : rest.length - 1;
    const setting = (k: string, edge: boolean): DataTableColumn => {
      const header = this.headerOf(k);
      return { key: k, header, minWidth: `${this.leastWidth(header, this.sampleField(k)) + (edge ? EDGE_EXTRA : 0)}px`, phone: "hide" };
    };
    this.gridColumns = [
      ...(enabled ? [setting(ENABLED_KEY, true)] : []),
      // A new row's name is a text box: room for it while there is one.
      {
        key: "name",
        header: "Name",
        emphasis: "strong",
        nowrap: true,
        phone: "title",
        minWidth: this.drafts.length ? `${NAME_BOX_WIDTH + CELL_PADDING + (enabled ? 0 : EDGE_EXTRA)}px` : undefined,
      },
      ...rest.map((k, i) => setting(k, i === last)),
      ...(this.drafts.length ? [{ key: "remove", header: "", width: "1%", phone: "hide" } as DataTableColumn] : []),
    ];
  }

  /** A column's field on its first row (its kind, options and unit size the column). */
  private sampleField(key: string): EsfField | null {
    const first = this.channels[0];
    return (first ? this.fieldById.get(`${first.name}#${key}`) : undefined) ?? this.drafts[0]?.fields.get(key) ?? null;
  }

  /**
   * A setting column's least width (the cell's side padding included): its control's — a select its longest option, a number box
   * its digits and unit, a text box; a checkbox none — or its header's, whichever is wider. A control takes its cell's width, so
   * the column must be given one: the table, wider than its card, would otherwise squeeze a number box down to its chevrons.
   */
  private leastWidth(header: string, f: EsfField | null): number {
    return Math.ceil(Math.max(headerWidth(header), f ? controlWidth(f) : TEXT_BOX_WIDTH)) + CELL_PADDING;
  }

  isHidden(key: string): boolean {
    return this.hidden.has(key);
  }

  /** A column shown or hidden (the picker's box): kept for its driver's kind this session. */
  setColumn(key: string, shown: boolean): void {
    const hidden = new Set(this.hidden);
    if (shown) {
      hidden.delete(key);
    } else {
      hidden.add(key);
    }
    HIDDEN_BY_KIND.set(this.driverType, hidden);
    this.updateColumns();
  }

  /** "Default columns": the few hidden to start. */
  defaultColumns(): void {
    HIDDEN_BY_KIND.delete(this.driverType);
    this.updateColumns();
  }

  private updateRows(): void {
    this.rows = [
      ...this.channels
        .filter((c) => !this.deleted.has(c.name))
        .map((c) => ({ key: `c:${c.name}`, channel: c.name, name: this.valueOf(c.name, "+name") || c.name, draft: null })),
      ...this.drafts.map((d) => ({ key: `n:${d.id}`, channel: "", name: d.name, draft: d })),
    ];
  }

  private valueOf(channel: string, own: string): string {
    const v = this.config?.properties[`${channel}#${own}`]?.value;
    return v === undefined || v === null ? "" : String(v);
  }

  headerOf(key: string): string {
    return esfChannelLabel({ id: `#${key}` });
  }

  cellField(row: GridRow, key: string): EsfField | null {
    return row.draft ? (row.draft.fields.get(key) ?? null) : (this.fieldById.get(`${row.channel}#${key}`) ?? null);
  }

  cellForm(row: GridRow): EsfForm {
    return row.draft ? row.draft.form : this.form!;
  }

  trackRow(_: number, r: GridRow): string {
    return r.key;
  }

  trackKey(_: number, k: string): string {
    return k;
  }

  trackField(_: number, f: EsfField): string {
    return f.key;
  }

  // ---- New channels ------------------------------------------------------------------------------------------------------

  /** Why a channel can't be added ("" it can). */
  get createNote(): string {
    if (this.channels.length + this.drafts.length >= ESF_ASSET_READ_MAX_CHANNELS) {
      return `At ${ESF_ASSET_READ_MAX_CHANNELS} channels, another would make its settings too large to read in one reply`;
    }
    return !this.shape && !this.templates.length ? "No channel of this driver's kind to copy its settings from: make the first in ESF's console" : "";
  }

  /** The names taken (each channel's prefix and name, and the other new ones'). */
  private takenNames(except: DraftChannel | null): string[] {
    return [
      ...this.channels.flatMap((c) => [c.name, this.valueOf(c.name, "+name")]),
      ...this.drafts.filter((d) => d !== except).map((d) => d.name.trim()),
    ].filter(Boolean);
  }

  nameError(d: DraftChannel): string {
    return esfChannelNameError(d.name, this.takenNames(d));
  }

  /** "Create new": a row for a new channel — "Channel-<n>" to start — its settings from ESF's defaults (the shape read first if need be). */
  addChannel(): void {
    if (this.createNote || this.adding) {
      return;
    }
    if (this.shape) {
      this.pushDraft(this.shape);
      return;
    }
    const client = this.client;
    const template = this.templates[0];
    if (!client || !template) {
      return;
    }
    this.adding = true;
    esfSubscribe(
      client.call(ESF_CONFIG_API.getConfig, { pids: [template] }),
      this.destroyRef,
      (reply) => {
        this.adding = false;
        const config = parseEsfConfigs(reply).find((c) => c.pid === template);
        const first = esfAssetChannels(config?.definition?.attributes ?? [])[0];
        if (first) {
          this.shape = first.attributes;
          this.columnKeys = this.keysOf(this.shape);
          this.updateColumns();
          this.pushDraft(this.shape);
        } else {
          this.notify.emit({ tone: "warning", message: `${template} has no channel to copy the settings from` });
        }
        this.cd.markForCheck();
      },
      (reason) => {
        this.adding = false;
        this.notify.emit({ tone: "error", message: `Couldn't read ${template} for a channel's settings: ${reason}` });
        this.cd.markForCheck();
      }
    );
  }

  private pushDraft(shape: EsfAttribute[]): void {
    const attributes = shape.filter((a) => !a.id.endsWith("#+name"));
    const properties: EsfComponentConfig["properties"] = {};
    for (const a of attributes) {
      if (a.defaultValue !== null) {
        properties[a.id] = { type: a.type, value: a.defaultValue };
      }
    }
    const form = new EsfForm(this.fb, { pid: this.pid, definition: null, properties }, attributes, [], esfChannelLabel);
    const taken = this.takenNames(null).map((n) => n.toLowerCase());
    let n = this.channels.length + this.drafts.length + 1;
    while (taken.includes(`channel-${n}`)) {
      n++;
    }
    this.drafts = [
      ...this.drafts,
      { id: ++this.draftSeq, name: `Channel-${n}`, form, fields: new Map(form.fields.map((f) => [f.attr.id.slice(f.attr.id.indexOf("#") + 1), f])) },
    ];
    this.updateColumns();
    this.updateRows();
  }

  removeDraft(d: DraftChannel): void {
    this.drafts = this.drafts.filter((x) => x !== d);
    this.updateColumns();
    this.updateRows();
  }

  // ---- Apply ---------------------------------------------------------------------------------------------------------------

  get dirty(): boolean {
    return !!this.form?.dirty || this.drafts.length > 0 || this.deleted.size > 0;
  }

  /** A row clicked: picked (lit) — Delete, at the table's foot, takes it out. */
  pickRow(row: { key: string }): void {
    this.pickedKey = row.key;
  }

  /**
   * Delete (the table's foot, a row picked): a new channel dropped; one the asset has taken off the grid, deleted in the draft —
   * Apply sends each of its settings with a null value, which ESF's configuration update drops (Kura's `DTOUtil` → `null`, left out
   * of the configuration it writes); Cancel brings it back.
   */
  deletePicked(): void {
    const row = this.rows.find((r) => r.key === this.pickedKey);
    this.pickedKey = "";
    if (!row) {
      return;
    }
    if (row.draft) {
      this.removeDraft(row.draft);
      return;
    }
    this.deleted = new Set(this.deleted).add(row.channel);
    this.updateRows();
    this.cd.markForCheck();
  }

  get invalid(): boolean {
    return !!this.form?.invalid || this.drafts.some((d) => !!this.nameError(d) || d.form.anyInvalid);
  }

  /** Cancel: the settings as read, the new channels dropped. */
  reset(): void {
    this.form?.reset();
    this.drafts = [];
    this.deleted = new Set();
    this.pickedKey = "";
    this.updateColumns();
    this.updateRows();
  }

  /** What applying it sends: the changed settings and every new channel whole (under its name, its `+name` the name). */
  pendingProperties(): Record<string, EsfProperty> {
    const properties: Record<string, EsfProperty> = { ...(this.form?.changes() ?? {}) };
    // A channel deleted: each of its settings null — ESF drops a setting sent so.
    for (const c of this.channels.filter((x) => this.deleted.has(x.name))) {
      for (const a of c.attributes) {
        properties[a.id] = { type: a.type, value: null };
      }
    }
    for (const d of this.drafts) {
      const name = d.name.trim();
      properties[`${name}#+name`] = { type: "STRING", value: name };
      for (const [id, property] of Object.entries(d.form.values())) {
        properties[`${name}#${id.slice(id.indexOf("#") + 1)}`] = property;
      }
    }
    return properties;
  }

  /** "Apply changes": `pendingProperties()` — one update, a snapshot. Embedded, its host applies it. */
  apply(): void {
    const client = this.client;
    const pid = this.pid;
    if (this.embedded || !client || !pid || !this.form || this.saving || this.invalid || !this.dirty) {
      return;
    }
    const properties = this.pendingProperties();
    this.saving = true;
    esfSubscribe(
      client.call(ESF_CONFIG_API.updateConfig, esfUpdateRequest(pid, properties)),
      this.destroyRef,
      () => {
        this.saving = false;
        this.notify.emit({ tone: "success", message: "Settings applied" });
        this.load();
      },
      (reason) => {
        this.saving = false;
        this.notify.emit({ tone: "error", message: `Couldn't save ${pid}: ${reason}` });
        this.cd.markForCheck();
      }
    );
  }
}
