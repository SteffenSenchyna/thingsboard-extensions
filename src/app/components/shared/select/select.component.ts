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

import { ChangeDetectorRef, Component, ElementRef, forwardRef, HostBinding, Input, NgZone, OnChanges, OnDestroy, SimpleChanges, ViewChild } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from "@angular/forms";
import { SharedModule } from "@shared/public-api";

/** An option in a {@link SelectComponent}. */
export interface TbSelectOption {
  value: string;
  label: string;
  /**
   * A muted second line under the label in the list — the long id the label names (an ESF factory's PID under "Raw MQTT
   * Subscriber"): it wraps, never cut; the closed box shows the label alone; the search matches it too.
   */
  note?: string;
}

/**
 * Themed dropdown select that matches the dashboard `--c-*` tokens (the native
 * `<select>` popup can't be styled, and mat-select's overlay renders outside the
 * themed dashboard root). Implements ControlValueAccessor so it works with
 * `formControlName` / `[(ngModel)]`.
 *
 * `[searchable]="true"` (a long list — sites, say) makes the box a text field
 * while it's open: typing filters the options, the arrow keys move through
 * them (the one they're on is marked; the pointer moves it too), Enter takes
 * it and Escape closes; closed, it shows the selected option as ever.
 */
/** A select with nothing picked (or a bulk edit's "leave it as it is"): a blank box, the same in every select. */
export const SELECT_EMPTY = "";

@Component({
  selector: "tb-select",
  templateUrl: "./select.component.html",
  styleUrls: ["./select.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SelectComponent), multi: true }],
})
export class SelectComponent implements ControlValueAccessor, OnChanges, OnDestroy {
  /** The currently-open select (only one may be open at a time, app-wide). */
  private static openInstance: SelectComponent | null = null;
  private static nextId = 0;

  /** The options panel's id (the searchable field names it as the list it controls). */
  readonly panelId = `tbs-panel-${SelectComponent.nextId++}`;

  @Input() options: TbSelectOption[] = [];
  /** What it shows with nothing picked — nothing, as every select ({@link SELECT_EMPTY}). */
  @Input() placeholder = SELECT_EMPTY;
  /** The compact control height (a header's, beside the window picker) instead of a form input's. */
  @Input() @HostBinding("class.tbs-compact") compact = false;
  /** The box is a text field while open: what's typed filters the options. */
  @Input() searchable = false;
  @Input() emptyText = "No matches";
  /**
   * Its panel on the window (fixed), under the box — above it when there's no room below — the box's width: a select in
   * something that scrolls or clips (a table's cell — an ESF asset's channels grid), where the panel would be cut. Anything
   * scrolling, or the window resizing, closes it (it would no longer sit under its box).
   */
  @Input() floating = false;
  floatTop = 0;
  floatLeft = 0;
  floatWidth = 0;
  floatUp = false;
  @ViewChild("panelWrap") private panelWrap?: ElementRef<HTMLElement>;

  value: string | null = null;
  open = false;
  disabled = false;
  /** {@link searchable}: the text typed, and the options it leaves (all of them while it's empty). */
  filter = "";
  shown: TbSelectOption[] = [];
  /** {@link searchable}: the option the arrow keys (or the pointer) are on — its index in {@link shown}, -1 for none; Enter takes it. */
  activeIndex = -1;
  @ViewChild("filterInput") private filterInput?: ElementRef<HTMLInputElement>;

  private onChange: (value: string | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor(
    private host: ElementRef<HTMLElement>,
    private zone: NgZone,
    private cd: ChangeDetectorRef
  ) {
    // Capture-phase document listener: fires top-down, so it isn't swallowed by
    // a bubbling-phase stopPropagation() in the detail panel / dashboard. Closes
    // the panel on any pointerdown outside this component.
    this.zone.runOutsideAngular(() => {
      document.addEventListener("pointerdown", this.onDocumentPointerDown, true);
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["options"]) {
      this.applyFilter();
    }
  }

  ngOnDestroy(): void {
    document.removeEventListener("pointerdown", this.onDocumentPointerDown, true);
    document.removeEventListener("scroll", this.onFloatingScroll, true);
    window.removeEventListener("resize", this.onFloatingScroll);
  }

  /** Label of the currently selected option, or the placeholder. */
  get selectedLabel(): string {
    return this.options.find((o) => o.value === this.value)?.label ?? this.placeholder;
  }

  get hasValue(): boolean {
    return this.options.some((o) => o.value === this.value);
  }

  /**
   * It reads "nothing picked": no option picked, or one with no label (a bulk
   * edit's "leave it as it is") — shown as the empty box is.
   */
  get showsEmpty(): boolean {
    return !this.hasValue || this.selectedLabel === SELECT_EMPTY;
  }

  /** {@link searchable}: the field's text — what's typed while open, the selected option's label closed. */
  get fieldText(): string {
    return this.open ? this.filter : this.showsEmpty ? "" : this.selectedLabel;
  }

  /** {@link searchable}: the field's hint — open, the selected option (it stays in sight while typing) or "Search"; closed, the empty box's. */
  get fieldPlaceholder(): string {
    if (this.open) {
      return this.showsEmpty ? "Search" : this.selectedLabel;
    }
    return this.hasValue ? this.selectedLabel : this.placeholder;
  }

  /** {@link searchable}: the field focused or clicked — the panel opens on every option. */
  openSearch(): void {
    if (this.disabled || this.open) {
      return;
    }
    this.toggle();
  }

  /** Typing: the options it leaves, the first of them marked (Enter takes it). */
  onFilter(text: string): void {
    this.filter = text;
    this.applyFilter();
    this.activeIndex = this.shown.length ? 0 : -1;
    this.scrollActiveIntoView();
  }

  /** Arrow down / up in the field: the next / previous option, kept in sight (a closed panel opens first). */
  moveActive(step: 1 | -1, event: Event): void {
    event.preventDefault();
    if (!this.open) {
      this.openSearch();
      return;
    }
    const last = this.shown.length - 1;
    if (last < 0) {
      this.activeIndex = -1;
      return;
    }
    this.activeIndex = this.activeIndex < 0 ? (step > 0 ? 0 : last) : Math.min(last, Math.max(0, this.activeIndex + step));
    this.scrollActiveIntoView();
  }

  /** Enter in the field: the marked option takes it. */
  pickActive(event: Event): void {
    event.preventDefault();
    const option = this.open ? this.shown[this.activeIndex] : undefined;
    if (option) {
      this.select(option);
    }
  }

  /** The marked option into the panel's view — the panel's own scroll only (nothing around it moves). */
  private scrollActiveIntoView(): void {
    const panel = this.host.nativeElement.querySelector<HTMLElement>(".tbs-panel");
    if (!panel) {
      return;
    }
    if (this.activeIndex <= 0) {
      panel.scrollTop = 0;
      return;
    }
    const option = panel.querySelectorAll<HTMLElement>(".tbs-option")[this.activeIndex];
    if (!option) {
      return;
    }
    const box = panel.getBoundingClientRect();
    const row = option.getBoundingClientRect();
    const inset = 6; // the panel's padding
    if (row.top < box.top + inset) {
      panel.scrollTop -= box.top + inset - row.top;
    } else if (row.bottom > box.bottom - inset) {
      panel.scrollTop += row.bottom - (box.bottom - inset);
    }
  }

  /** Escape / Tab in the field: the panel closes, the selection as it was. */
  closeFromKey(): void {
    if (this.open) {
      this.close();
    }
  }

  trackByValue(_: number, o: TbSelectOption): string {
    return o.value;
  }

  toggle(): void {
    if (this.disabled) {
      return;
    }
    if (this.open) {
      this.close();
    } else {
      // Close any other open select so we never have overlapping panels.
      SelectComponent.openInstance?.close();
      this.filter = "";
      this.applyFilter();
      // The arrow keys start from the selected option (none: from the top).
      this.activeIndex = this.shown.findIndex((o) => o.value === this.value);
      this.open = true;
      SelectComponent.openInstance = this;
      if (this.floating) {
        this.placeFloating();
      }
      if (this.searchable) {
        this.filterInput?.nativeElement.focus();
        this.scrollActiveIntoView();
      }
    }
  }

  select(option: TbSelectOption): void {
    this.value = option.value;
    this.onChange(option.value);
    this.onTouched();
    this.close();
    this.filterInput?.nativeElement.blur();
  }

  /**
   * A floating panel's place: under the box, its width the box's (a select in a table's cell is sized for its longest option —
   * its column's least width), or above it when the window has
   * less room below than the panel's most (260px) and more above; set again once drawn, should an ancestor's transform shift it.
   * Anything scrolling (but the panel's own list) or the window resizing closes it.
   */
  private placeFloating(): void {
    const box = this.host.nativeElement.getBoundingClientRect();
    const PANEL_MAX = 272;
    this.floatUp = window.innerHeight - box.bottom < PANEL_MAX && box.top > window.innerHeight - box.bottom;
    this.floatTop = this.floatUp ? box.top - 6 : box.bottom + 6;
    this.floatLeft = Math.min(box.left, Math.max(0, window.innerWidth - box.width - 8));
    this.floatWidth = box.width;
    this.zone.runOutsideAngular(() => {
      document.addEventListener("scroll", this.onFloatingScroll, true);
      window.addEventListener("resize", this.onFloatingScroll);
      requestAnimationFrame(() => {
        const wrap = this.panelWrap?.nativeElement;
        if (!wrap || !this.open) {
          return;
        }
        // A transformed ancestor makes `fixed` relative to it: move by what's off.
        const drawn = wrap.getBoundingClientRect();
        const dx = drawn.left - this.floatLeft;
        const dy = (this.floatUp ? drawn.bottom : drawn.top) - this.floatTop;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
          this.zone.run(() => {
            this.floatLeft -= dx;
            this.floatTop -= dy;
            this.cd.detectChanges();
          });
        }
      });
    });
  }

  private readonly onFloatingScroll = (event: Event): void => {
    if (this.open && !(event.target instanceof Node && this.panelWrap?.nativeElement.contains(event.target))) {
      this.zone.run(() => {
        this.close();
        this.cd.detectChanges();
      });
    }
  };

  /** Close this select's panel (and clear the app-wide open reference); a typed filter goes with it. */
  private close(): void {
    document.removeEventListener("scroll", this.onFloatingScroll, true);
    window.removeEventListener("resize", this.onFloatingScroll);
    this.open = false;
    this.filter = "";
    this.activeIndex = -1;
    if (SelectComponent.openInstance === this) {
      SelectComponent.openInstance = null;
    }
  }

  /** The options the typed text leaves (label contains it, case ignored) — all of them while it's empty. */
  private applyFilter(): void {
    const text = this.filter.trim().toLowerCase();
    this.shown = text ? this.options.filter((o) => o.label.toLowerCase().includes(text) || !!o.note?.toLowerCase().includes(text)) : this.options;
  }

  // -- ControlValueAccessor ---------------------------------------------------
  writeValue(value: string | null): void {
    this.value = value;
  }
  registerOnChange(fn: (value: string | null) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  /** Close the panel when clicking anywhere outside the component. */
  private readonly onDocumentPointerDown = (event: Event): void => {
    if (this.open && !this.host.nativeElement.contains(event.target as Node)) {
      // The listener runs outside Angular, and a ThingsBoard widget is OnPush:
      // re-enter and repaint this view itself, whatever else the click did.
      this.zone.run(() => {
        this.close();
        this.cd.detectChanges();
      });
    }
  };
}
