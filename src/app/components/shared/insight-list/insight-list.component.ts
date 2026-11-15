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


import { Component, EventEmitter, HostBinding, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";

/** How an insight reads: worth a look (warning, error), good news (success), or just so (info). */
export type InsightTone = "info" | "success" | "warning" | "error";

/** One insight: a short plain sentence about the data, its icon in its tone's colour — `target`, what a click opens. */
export interface Insight {
  id: string;
  /** Material Symbols Rounded icon. */
  icon: string;
  tone: InsightTone;
  /** The sentence ("Denials up 40% at Kent (4B05), mostly Unknown user"). */
  text: string;
  /** What a click opens — the page's to name (a section, a panel); none: it opens nothing. */
  target?: string;
}

/**
 * A report page's insights strip — ARIA's "insight assistant" look: a row of
 * small cards, each a short plain sentence about the data with its icon in
 * its tone's colour (the status scale: a warning yellow, an error red, good
 * news green; just so: the brand accent), the ones with a `target` a button
 * opening what they're about ({@link insightClick}: a section, a panel). The
 * cards share the row, wrapping on narrow widths. Worked out from what the
 * page has read with fixed rules (the page's own), never a model; a page with
 * nothing to say gives one card saying so, so the strip never pops in or out.
 * While its data is read, `wireframe`: placeholders in the cards' places.
 *
 * ```html
 * <tb-insight-list [insights]="report.insights" [wireframe]="loading" (insightClick)="open($event)"></tb-insight-list>
 * ```
 */
@Component({
  selector: "tb-insight-list",
  templateUrl: "./insight-list.component.html",
  styleUrls: ["./insight-list.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule],
})
export class InsightListComponent {
  /** Never let the browser's native tooltip show on the host. */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;

  @Input() insights: Insight[] = [];
  /** The data isn't in yet: placeholder cards in their places (as many as {@link placeholders}). */
  @Input() wireframe = false;
  @Input() placeholders = 3;
  /** An insight with a `target` was clicked. */
  @Output() insightClick = new EventEmitter<Insight>();

  /** The placeholder cards (one array per count: no fresh list on every check). */
  get placeholderCards(): number[] {
    if (this.placeholderList.length !== this.placeholders) {
      this.placeholderList = Array.from({ length: Math.max(1, this.placeholders) }, (_, i) => i);
    }
    return this.placeholderList;
  }
  private placeholderList: number[] = [];

  trackById(_: number, i: Insight): string {
    return i.id;
  }
}
