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

import { AfterViewInit, Component, ElementRef, EventEmitter, HostBinding, Input, OnChanges, OnDestroy, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";
import { DonutChartComponent, DonutSlice } from "../donut-chart/donut-chart.component";
import { InfoIconComponent } from "../info-icon/info-icon.component";

/** A card's narrowest: room for a doughnut beside its lines (the ring and four lines of label and figure). */
const CARD_MIN_WIDTH = 300;

/**
 * The columns for `count` cards in `width`: the most that fit (each at least
 * {@link CARD_MIN_WIDTH}) with every row full — 4 cards: 4, else 2 by 2, else
 * one a row — so a card never wraps on its own under a row of tall ones; a
 * count no column number divides wraps as many as fit.
 */
function balancedColumns(width: number, count: number, gap: number): number {
  const fit = Math.max(1, Math.min(count, Math.floor((width + gap) / (CARD_MIN_WIDTH + gap))));
  for (let c = fit; c > 1; c--) {
    if (count % c === 0) {
      return c;
    }
  }
  return fit;
}

/** A row's status mark: the shared status scale (as in the pills), or neutral grey. */
export type SummaryMarkTone = "success" | "warning" | "major" | "error" | "neutral";

/** Colour of a row's value and its icon: the shared status scale (as a table's count marks), or the brand's. */
export type SummaryValueTone = "default" | "brand" | "success" | "warning" | "error";

/** One line of a {@link SummaryCard}: a label on the left, its value on the right. */
export interface SummaryRow {
  label: string;
  /** Preformatted value ("12,480", "3 (75%)", "4m ago"). */
  value: string;
  /** Unit after the value, muted ("L"). */
  unit?: string;
  /** Material icon before the label… */
  icon?: string;
  /** …or a small status mark (a coloured square) instead… */
  mark?: SummaryMarkTone;
  /** …or a series swatch: the row names a chart series — its colour, e.g. `var(--c-chart-1)`. */
  swatch?: string;
  tone?: SummaryValueTone;
}

/** A doughnut beside a {@link SummaryCard}'s rows: one whole split into parts, the rows as its legend. */
export interface SummaryDonut {
  /** The parts, in the rows' order — each row carries its part's colour as its `swatch`. */
  slices: DonutSlice[];
  /** The figure in the ring's centre — the whole ("66") — and the word under it ("gateways"). */
  centerValue?: string;
  centerLabel?: string;
}

/** One card of a {@link SummaryCardsComponent}. */
export interface SummaryCard {
  /** Emitted by {@link SummaryCardsComponent.linkClick}. */
  id: string;
  title: string;
  /** Info-icon tooltip after the title. */
  info?: string;
  /** A link in the card's corner ("See more"). */
  link?: string;
  /**
   * A doughnut left of the rows (as tall as four of them): the rows name its
   * parts, each with its figure — a row whose label is a part's name is that
   * part's legend entry (a click switches it off and on).
   */
  donut?: SummaryDonut;
  rows: SummaryRow[];
}

/**
 * A row of summary cards for the top of a page (UniFi style): each card a
 * title — with an optional "See more" link in its corner — over a short list
 * of label / value lines; a label can carry an icon or a status mark (the
 * shared status scale, as in the pills). A card can show a doughnut beside
 * its lines ({@link SummaryCard.donut}) — a whole split into parts, the lines
 * as its legend (centred over them when the card is too narrow for both).
 * The cards share the width equally, all as tall as the tallest; on narrower
 * widths they wrap into full rows — four go 2 by 2, never 3 and 1
 * ({@link balancedColumns}).
 *
 * ```html
 * <tb-summary-cards [cards]="cards" (linkClick)="onSummaryLink($event)"></tb-summary-cards>
 * ```
 */
@Component({
  selector: "tb-summary-cards",
  templateUrl: "./summary-cards.component.html",
  styleUrls: ["./summary-cards.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, DonutChartComponent, InfoIconComponent],
})
export class SummaryCardsComponent implements AfterViewInit, OnChanges, OnDestroy {
  /** Never let the browser's native tooltip show on the host. */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;

  private resizeObserver?: ResizeObserver;
  /** The columns last set (0: none yet). */
  private columns = 0;

  constructor(private host: ElementRef<HTMLElement>) {}

  @Input() cards: SummaryCard[] = [];
  /** Active theme — a card's doughnut is redrawn in its colours when it's toggled. */
  @Input() dark = false;
  /** A card's link was clicked: its {@link SummaryCard.id}. */
  @Output() linkClick = new EventEmitter<string>();

  /** Each card's doughnut parts switched off from its legend lines, by card id (a new array on every toggle). */
  hiddenParts: Record<string, string[]> = {};
  /** No part switched off (one array, so the ring doesn't see a change on every check). */
  readonly noParts: string[] = [];

  ngAfterViewInit(): void {
    if ("ResizeObserver" in window) {
      this.resizeObserver = new ResizeObserver(() => this.layout());
      this.resizeObserver.observe(this.host.nativeElement);
    }
    this.layout();
  }

  ngOnChanges(): void {
    this.layout();
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  /** The grid's columns for the host's width and the cards' count — set on the host directly (no change detection for a resize). */
  private layout(): void {
    const el = this.host.nativeElement;
    const width = el.clientWidth;
    if (!width) {
      return;
    }
    const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
    const columns = balancedColumns(width, this.cards.length, gap);
    if (columns !== this.columns) {
      this.columns = columns;
      el.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
    }
  }

  /** The line names one of its card's doughnut parts: it is that part's legend entry. */
  isPart(c: SummaryCard, r: SummaryRow): boolean {
    return !!c.donut?.slices.some((s) => s.name === r.label);
  }

  /** The line's part is switched off. */
  isOff(c: SummaryCard, r: SummaryRow): boolean {
    return !!this.hiddenParts[c.id]?.includes(r.label);
  }

  /** A legend line clicked (or Enter / Space on it): its part switched off, or back on. */
  togglePart(c: SummaryCard, r: SummaryRow, event?: Event): void {
    if (!this.isPart(c, r)) {
      return;
    }
    event?.preventDefault();
    const off = this.hiddenParts[c.id] ?? [];
    this.hiddenParts = { ...this.hiddenParts, [c.id]: off.includes(r.label) ? off.filter((n) => n !== r.label) : [...off, r.label] };
  }

  trackById(_: number, c: SummaryCard): string {
    return c.id;
  }

  trackByLabel(_: number, r: SummaryRow): string {
    return r.label;
  }
}
