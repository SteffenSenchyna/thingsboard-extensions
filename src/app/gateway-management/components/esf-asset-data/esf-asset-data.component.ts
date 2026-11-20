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
import { FormsModule } from "@angular/forms";
import { CalloutComponent } from "../../../components/shared/callout/callout.component";
import { DataTableCellDirective, DataTableColumn, DataTableComponent } from "../../../components/shared/data-table/data-table.component";
import { TableLinkComponent, TableLinksComponent } from "../../../components/shared/table-links/table-links.component";
import { TipDirective } from "../../../components/shared/tip/tip.directive";
import { formatDateTime } from "../../../components/shared/time-format";
import { ToastTone } from "../../../components/shared/toasts/toasts.component";
import { EsfChannel, esfChannelValue, EsfClient, esfSubscribe, parseEsfChannelRecords, parseEsfChannels } from "../../models/esf-api.models";

interface ChannelValue extends EsfChannel {
  value: string;
  error: string;
  /** A writable channel (WRITE, READ_WRITE). */
  writable: boolean;
}

/**
 * An asset's values (its Data tab — the Assets REST API, `rest.assets`), as ESF's console's, in the shared table — each channel's name, mode,
 * value type and value as last read (read as the tab opens, and again with "Read", its time beside it), and for a writable one a
 * box to type a value into (of the channel's type — a wrong one red-edged). "Write" writes every value typed, in one request,
 * then reads them all again.
 */
@Component({
  selector: "tb-gm-esf-asset-data",
  templateUrl: "./esf-asset-data.component.html",
  styleUrls: ["./esf-asset-data.component.scss"],
  standalone: true,
  imports: [CommonModule, FormsModule, CalloutComponent, DataTableCellDirective, DataTableComponent, TableLinkComponent, TableLinksComponent, TipDirective],
})
export class EsfAssetDataComponent implements OnChanges {
  @HostBinding("attr.title") readonly hostTitle: string | null = null;
  @Input() client: EsfClient | null = null;
  /** The asset (its pid). */
  @Input() asset = "";
  @Output() notify = new EventEmitter<{ tone: ToastTone; message: string }>();

  readonly columns: DataTableColumn[] = [
    { key: "name", header: "Name", emphasis: "strong", nowrap: true, phone: "title" },
    { key: "mode", header: "Mode", emphasis: "muted", nowrap: true, phone: "sub" },
    { key: "valueType", header: "Value type", emphasis: "muted", nowrap: true, phone: "sub" },
    { key: "value", header: "Value", phone: "trail" },
  ];
  /** A writable channel among them: a box a writable row to type its value into. */
  readonly columnsWithWrite: DataTableColumn[] = [...this.columns, { key: "write", header: "Write", minWidth: "192px", phone: "hide" }];
  channels: ChannelValue[] = [];
  loading = false;
  error = "";
  reading = false;
  /** When the values were read ("" not yet). */
  readAt = "";

  /** The values typed to write, by channel. */
  writes: Record<string, string> = {};
  writing = false;

  constructor(
    private cd: ChangeDetectorRef,
    private destroyRef: DestroyRef
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["client"] || changes["asset"]) {
      this.channels = [];
      this.writes = {};
      this.readAt = "";
      this.load();
    }
  }

  /** The asset's channels (their mode and value type), then their values. */
  load(): void {
    const client = this.client;
    const asset = this.asset;
    this.error = "";
    if (!client || !asset) {
      return;
    }
    this.loading = true;
    esfSubscribe(
      client.call("esfAssetChannels", undefined, { asset }),
      this.destroyRef,
      (reply) => {
        if (client !== this.client || asset !== this.asset) {
          return;
        }
        this.channels = parseEsfChannels(reply).map((c) => ({ ...c, value: "", error: "", writable: c.mode.toUpperCase().includes("WRITE") }));
        this.loading = false;
        this.read();
        this.cd.markForCheck();
      },
      (reason) => {
        if (client === this.client && asset === this.asset) {
          this.loading = false;
          this.error = reason;
          this.cd.markForCheck();
        }
      }
    );
  }

  /** "Read": every channel's value now. */
  read(): void {
    const client = this.client;
    const asset = this.asset;
    if (!client || !asset || this.reading) {
      return;
    }
    this.reading = true;
    esfSubscribe(
      client.call("esfReadAsset", undefined, { asset }),
      this.destroyRef,
      (reply) => {
        this.reading = false;
        if (client !== this.client || asset !== this.asset) {
          return;
        }
        const records = new Map(parseEsfChannelRecords(reply).map((r) => [r.name, r]));
        this.channels = this.channels.map((c) => {
          const r = records.get(c.name);
          return r ? { ...c, value: r.value, error: r.error } : c;
        });
        this.readAt = formatDateTime(Date.now());
        this.cd.markForCheck();
      },
      (reason) => {
        this.reading = false;
        this.notify.emit({ tone: "error", message: `Couldn't read ${asset}: ${reason}` });
        this.cd.markForCheck();
      }
    );
  }

  trackChannel(_: number, c: ChannelValue): string {
    return c.name;
  }

  get anyWritable(): boolean {
    return this.channels.some((c) => c.writable);
  }

  /** What's wrong with a channel's typed value ("" nothing, or nothing typed). */
  writeError(c: ChannelValue): string {
    const typed = (this.writes[c.name] ?? "").trim();
    return typed !== "" && esfChannelValue(c.valueType, typed) === null ? `Not a ${c.valueType.toLowerCase()} value` : "";
  }

  /** The channels with a value typed to write. */
  private get typed(): ChannelValue[] {
    return this.channels.filter((c) => c.writable && (this.writes[c.name] ?? "").trim() !== "");
  }

  get canWrite(): boolean {
    const typed = this.typed;
    return typed.length > 0 && typed.every((c) => !this.writeError(c)) && !this.writing;
  }

  /** "Write": every value typed, in one request; then the values read again. */
  write(): void {
    const client = this.client;
    const asset = this.asset;
    const typed = this.typed;
    if (!client || !asset || !this.canWrite) {
      return;
    }
    const channels = typed.map((c) => ({ name: c.name, type: c.valueType, value: esfChannelValue(c.valueType, this.writes[c.name]) }));
    this.writing = true;
    esfSubscribe(
      client.call("esfWriteAsset", { channels }, { asset }),
      this.destroyRef,
      () => {
        this.writing = false;
        this.writes = {};
        this.notify.emit({ tone: "success", message: "Settings applied" });
        this.read();
      },
      (reason) => {
        this.writing = false;
        this.notify.emit({ tone: "error", message: `Couldn't write: ${reason}` });
        this.cd.markForCheck();
      }
    );
  }
}
