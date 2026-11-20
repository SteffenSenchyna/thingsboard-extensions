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

import { Component, ElementRef, EventEmitter, HostBinding, Input, Output, ViewChild } from "@angular/core";
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";

/** Characters a crowded chip keeps before it cuts to "…". */
const CHIP_MIN_CHARS = 6;
/** A chip's padding, gap and × button (keep in step with `.tbsb-chip` in the SCSS). */
const CHIP_CHROME_PX = 34;

/**
 * A page's search field for the sidebar (UniFi style): the shared text input
 * (as in every form) with a search icon — highlighted while it has focus.
 * Enter turns the text into a chip (brand-blue, with its own ×); more chips
 * narrow the search further (a row must match every one), Backspace in the
 * empty box removes the last, and "Reset" clears it all. Bind the chips and
 * the text two-way, and feed {@link searchChange} — the chips plus the text
 * being typed — to a table's `search`:
 *
 * ```html
 * <tb-search-box [(terms)]="terms" [(text)]="text"
 *                (searchChange)="search = $event"></tb-search-box>
 * <tb-data-table [showHeader]="false" [search]="search" …></tb-data-table>
 * ```
 */
@Component({
  selector: "tb-search-box",
  templateUrl: "./search-box.component.html",
  styleUrls: ["./search-box.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule],
})
export class SearchBoxComponent {
  /** The committed search terms (the chips). */
  @Input() terms: string[] = [];
  /** The text being typed (searched as you type, a chip on Enter). */
  @Input() text = "";
  @Input() placeholder = "Search";
  /** The compact control height (a table's title row, beside its window picker) instead of a form input's — as `tb-select`'s. */
  @Input() @HostBinding("class.tbsb-compact") compact = false;
  @Output() termsChange = new EventEmitter<string[]>();
  @Output() textChange = new EventEmitter<string>();
  /** The whole search — the chips plus the text being typed — on any change. */
  @Output() searchChange = new EventEmitter<string[]>();

  @ViewChild("input") private input?: ElementRef<HTMLInputElement>;
  @ViewChild("strip") private strip?: ElementRef<HTMLElement>;

  /**
   * A press on the box but not on its text field, a chip's × or "Reset" (on
   * the icon, the padding, the strip around the chips): the text field takes
   * the focus. Without it the browser gives the focus to the nearest
   * focusable element — ThingsBoard's dashboard behind — and the box needs a
   * second click.
   */
  focusText(event: MouseEvent): void {
    const input = this.input?.nativeElement;
    const target = event.target as HTMLElement | null;
    if (!input || target === input || target?.closest("button")) {
      return;
    }
    event.preventDefault();
    input.focus();
  }

  get hasSearch(): boolean {
    return this.terms.length > 0 || this.text.trim() !== "";
  }

  onInput(value: string): void {
    this.text = value;
    this.textChange.emit(value);
    this.emitSearch();
  }

  /** Enter: the text becomes a chip (unless empty or already one). */
  commit(): void {
    const term = this.text.trim();
    if (term && !this.terms.some((t) => t.toLowerCase() === term.toLowerCase())) {
      this.terms = [...this.terms, term];
      this.termsChange.emit(this.terms);
      // Keep the caret in view when the new chip crowds the strip.
      setTimeout(() => this.strip?.nativeElement.scrollTo({ left: this.strip.nativeElement.scrollWidth }));
    }
    this.onInput("");
  }

  /** Backspace in the empty box: drop the last chip. */
  onBackspace(): void {
    if (!this.text && this.terms.length) {
      this.remove(this.terms.length - 1);
    }
  }

  remove(index: number): void {
    this.terms = this.terms.filter((_, i) => i !== index);
    this.termsChange.emit(this.terms);
    this.emitSearch();
    this.input?.nativeElement.focus();
  }

  reset(): void {
    this.terms = [];
    this.termsChange.emit(this.terms);
    this.onInput("");
  }

  /**
   * A crowded chip shrinks ("…"), but never below its first
   * {@link CHIP_MIN_CHARS} characters (all of a shorter term) plus its padding
   * and × button — so short searches always read in full.
   */
  chipMinWidth(term: string): string {
    return `calc(${Math.min(term.length, CHIP_MIN_CHARS)}ch + ${CHIP_CHROME_PX}px)`;
  }

  trackByTerm(_: number, t: string): string {
    return t;
  }

  private emitSearch(): void {
    const text = this.text.trim();
    this.searchChange.emit(text ? [...this.terms, text] : [...this.terms]);
  }
}
