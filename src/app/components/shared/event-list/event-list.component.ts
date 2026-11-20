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

import { Component, EventEmitter, HostBinding, Input, OnChanges, Output, SimpleChanges, ViewChild } from "@angular/core";
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";
import { DataTableCellDirective, DataTableColumn, DataTableComponent } from "../data-table/data-table.component";
import { StatusPillTone } from "../status-pill/status-pill.component";
import { TableLinkComponent } from "../table-links/table-links.component";
import { TipDirective } from "../tip/tip.directive";

/**
 * A value on a row's line with a bubble of its own: the longer name a short
 * one stands for (a market by its code, "GEA" — "Greater Edmonton Area").
 * A plain value's bubble is its own text, only while it's cut with "…".
 */
export interface EventListPart {
  text: string;
  tip?: string;
}

/** One happening of a list ({@link EventListComponent}). */
export interface EventListItem {
  id: string;
  /** What happened ("Dispense", "Code disabled") — the row's title. */
  title: string;
  /** Its mark before the time: an icon, in its status tone (the status marks' colours). */
  icon: string;
  tone: StatusPillTone;
  /** When, as shown ("Nov 10 12:46:36 PM"). */
  time: string;
  /**
   * What else it says, after the time — a rule before each ("PLC01 · P01", "65.4 L", "by Jane Doe"; a market by its code, its name
   * the bubble's — {@link EventListPart}); empty ones left out. The line never widens the list: its values are cut with "…" instead
   * (the longest most), each in full in the bubble while it's cut.
   */
  parts: (string | EventListPart)[];
  /**
   * Who, on a muted line of its own under the time's (a dispense's user and vehicle, by their holders' names) — a rule between two,
   * each cut with "…" and whole in the bubble while cut; empty ones left out, none: no line.
   */
  sub?: (string | EventListPart)[];
  /**
   * Its values move as one: all of them on a line of their own under the time when they don't fit beside it (a dispense's: its
   * pump, litres, user and vehicle); cut with "…" only past a whole line.
   */
  wrap?: boolean;
}

/**
 * A list of happenings in a panel (a fuel code's activity), as the alarm list
 * shows a device's alarms: one card — its title and the table's own search
 * (the header's search icon opens it, as the other tables') — of rows: what
 * happened over a muted line of its mark (an icon in its status tone), its
 * time and what else it says (the rows' look, `styles/_event-row.scss`,
 * the alarm list's own) — newest first as given, 20 a page. A short list of
 * the latest (the caller passes the first few, `[searchable]="false"`) ends
 * with a link to the whole list elsewhere ({@link moreLabel}: "View full
 * activity"), a table footer's link.
 *
 * ```html
 * <tb-event-list title="Activity" [items]="items" [loading]="loading" emptyText="No activity in this period" [resetKey]="codeId"></tb-event-list>
 * <tb-event-list title="Activity" [items]="latest" [searchable]="false" moreLabel="View full activity" (more)="openActivity()"></tb-event-list>
 * ```
 */
@Component({
  selector: "tb-event-list",
  templateUrl: "./event-list.component.html",
  styleUrls: ["./event-list.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, DataTableComponent, DataTableCellDirective, TableLinkComponent, TipDirective],
})
export class EventListComponent implements OnChanges {
  /** No native tooltip: the title is the card's. */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;
  /** The card's title, what its rows are ("Activity"); none — no header. */
  @Input() title = "";
  @Input() items: EventListItem[] = [];
  @Input() loading = false;
  @Input() loadingText = "Loading…";
  @Input() emptyText = "Nothing yet";
  @Input() emptyIcon = "history";
  /** The table's search in its header (a long list's). */
  @Input() searchable = true;
  /** Changed (another entity): the search empties. */
  @Input() resetKey: unknown = null;
  /** The link at the card's foot to the whole list elsewhere ("View full activity"); none — no link. */
  @Input() moreLabel = "";
  /** Its link was clicked. */
  @Output() more = new EventEmitter<void>();

  readonly columns: DataTableColumn[] = [{ key: "event", header: "Event" }];
  /** The searched text of each row: its title, time and parts. */
  readonly searchKeys = ["title", "time", "partsText"];
  rows: Record<string, unknown>[] = [];

  @ViewChild(DataTableComponent) private table?: DataTableComponent;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["items"]) {
      const clean = (list: (string | EventListPart)[] | undefined) =>
        (list ?? []).map((p): EventListPart => (typeof p === "string" ? { text: p } : p)).filter((p) => !!p.text);
      this.rows = this.items.map((e) => {
        const parts = clean(e.parts);
        const sub = clean(e.sub);
        // Searched by what shows and by the names in the bubbles ("Greater Edmonton Area" finds "GEA").
        return { ...e, parts, sub, partsText: [...parts, ...sub].map((p) => [p.text, p.tip].filter(Boolean).join(" ")).join(" ") };
      });
    }
    // Another entity's list: its search closes (and empties).
    if (changes["resetKey"] && !changes["resetKey"].firstChange && this.table?.searchOpen) {
      this.table.toggleSearch();
    }
  }
}
