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


import { ChangeDetectorRef, Component, ElementRef, HostBinding, Input, NgZone, OnDestroy, ViewChild, forwardRef, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { HttpClient } from "@angular/common/http";
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from "@angular/forms";
import { Observable, of } from "rxjs";
import { catchError, map, shareReplay } from "rxjs/operators";
import { SharedModule } from "@shared/public-api";
import { defaultHttpOptionsFromConfig } from "@core/public-api";
import { IconBadgeComponent } from "../icon-badge/icon-badge.component";
import { SELECT_EMPTY } from "../select/select.component";
import { TipDirective } from "../tip/tip.directive";
import { QUIET_REQUEST } from "../value-utils";
import { MATERIAL_SYMBOLS_ROUNDED } from "./material-symbols";

/** One icon of the picker: its Material Symbols Rounded name, its name in words, the words it's found by. */
export interface PickerIcon {
  name: string;
  label: string;
  tags: string[];
}

/**
 * The icons' search words: ThingsBoard's own list, which every instance serves. Its names are the older Material Icons
 * set (2 161): the picker's icons are {@link MATERIAL_SYMBOLS_ROUNDED}, a newer one found by its name alone.
 */
const ICON_METADATA_PATH = "/assets/metadata/material-icons.json";

/** The grid draws this many icons, then as many more each time it's scrolled near its end. */
const ICON_PAGE = 120;
/** A cell's pitch (its 36px and the 4px gap) — keep in step with the SCSS: the arrow keys move a row by it. */
const CELL_PITCH_PX = 40;

/** An icon's name in words: "local_gas_station" → "Local gas station". */
export function iconLabel(name: string): string {
  const words = name.replace(/[_-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "";
}

/** The icon list, made once for every picker. */
let iconList$: Observable<PickerIcon[]> | null = null;

/**
 * The icons: every Material Symbols Rounded icon (the list bundled — the font the dashboards load draws each), with
 * ThingsBoard's search words where its list has the icon. Its list unread: the icons by their names alone.
 */
function loadIcons(http: HttpClient): Observable<PickerIcon[]> {
  iconList$ ??= http.get<{ name: string; tags?: string[] }[]>(ICON_METADATA_PATH, defaultHttpOptionsFromConfig(QUIET_REQUEST)).pipe(
    catchError(() => of([] as { name: string; tags?: string[] }[])),
    map((list) => {
      const tags = new Map((list ?? []).map((i) => [i.name, (i.tags ?? []).map((t) => t.toLowerCase())]));
      return MATERIAL_SYMBOLS_ROUNDED.split(" ").map((name) => ({ name, label: iconLabel(name), tags: tags.get(name) ?? [] }));
    }),
    shareReplay(1)
  );
  return iconList$;
}

/**
 * A field picking a Material Symbols Rounded icon (a profile's — what the
 * dashboards show a device or an asset by), laid out as the scope forms'
 * pickers: the icon picked on its tile (`tb-icon-badge`, "sm"), then a box
 * like a select's (its name; its border, its chevron). Opened, the box is a
 * search field ("Search") over a grid of icons — just the icons, each named
 * in the bubble on hover, found by their name or ThingsBoard's words for
 * them, drawn as the grid scrolls. With a {@link defaultIcon}, "Default"
 * comes first: the value "", that icon on the tile. The arrow keys move
 * through the grid, Enter takes the one marked, Escape closes.
 * ControlValueAccessor: `formControlName` / `[(ngModel)]` (a name; "" none).
 */
@Component({
  selector: "tb-icon-picker",
  templateUrl: "./icon-picker.component.html",
  styleUrls: ["./icon-picker.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, IconBadgeComponent, TipDirective],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => IconPickerComponent), multi: true }],
})
export class IconPickerComponent implements ControlValueAccessor, OnDestroy {
  /** The open picker (one at a time, app-wide). */
  private static openInstance: IconPickerComponent | null = null;
  private static nextId = 0;

  /** No native tooltip (a `title` set on it). */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;

  /** The icon shown when none is picked — "Default" first in the panel (none: no such choice). */
  @Input() defaultIcon = "";

  readonly panelId = `tbip-panel-${IconPickerComponent.nextId++}`;

  value = "";
  disabled = false;
  open = false;
  loading = false;
  search = "";
  /** The icons the search leaves, and the ones drawn (the first of them). */
  shown: PickerIcon[] = [];
  visible: PickerIcon[] = [];
  /** The cell the arrow keys (or the pointer) are on: its index in {@link visible}; -1 none. */
  activeIndex = -1;

  @ViewChild("field") private field?: ElementRef<HTMLInputElement>;
  @ViewChild("panel") private panel?: ElementRef<HTMLElement>;

  private icons: PickerIcon[] = [];
  private limit = ICON_PAGE;
  private destroyed = false;
  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly zone = inject(NgZone);
  private readonly cd = inject(ChangeDetectorRef);
  private readonly http = inject(HttpClient);

  constructor() {
    // Capture phase, outside Angular: a press anywhere outside closes it (a bubbling stopPropagation can't swallow it).
    this.zone.runOutsideAngular(() => document.addEventListener("pointerdown", this.onDocumentPointerDown, true));
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    document.removeEventListener("pointerdown", this.onDocumentPointerDown, true);
    if (IconPickerComponent.openInstance === this) {
      IconPickerComponent.openInstance = null;
    }
  }

  /** The tile's icon: the one picked, else the default. */
  get tileIcon(): string {
    return this.value || this.defaultIcon;
  }

  /** The box's text — closed, the picked icon's name in words ("Default" for none); open, what's typed. */
  get fieldText(): string {
    if (this.open) {
      return this.search;
    }
    return this.value ? this.labelOf(this.value) : this.defaultIcon ? "Default" : "";
  }

  /** Open: "Search"; closed with nothing picked and no default: nothing, as every empty select. */
  get fieldPlaceholder(): string {
    return this.open ? "Search" : SELECT_EMPTY;
  }

  /** "Default" shows above the grid (the search empty). */
  get showsDefault(): boolean {
    return !!this.defaultIcon && !this.search.trim();
  }

  openPanel(): void {
    if (this.disabled || this.open) {
      return;
    }
    IconPickerComponent.openInstance?.close();
    IconPickerComponent.openInstance = this;
    this.open = true;
    this.search = "";
    this.limit = ICON_PAGE;
    this.applySearch();
    this.activeIndex = this.visible.findIndex((i) => i.name === this.value);
    this.ensureIcons();
    this.field?.nativeElement.focus();
  }

  toggle(event: Event): void {
    event.stopPropagation();
    if (this.open) {
      this.close();
    } else {
      this.openPanel();
    }
  }

  onSearch(text: string): void {
    this.search = text;
    this.limit = ICON_PAGE;
    this.applySearch();
    this.activeIndex = this.visible.length ? 0 : -1;
    if (this.panel) {
      this.panel.nativeElement.scrollTop = 0;
    }
  }

  /** Near the grid's end: the next icons drawn. */
  onScroll(): void {
    const el = this.panel?.nativeElement;
    if (!el || this.visible.length >= this.shown.length) {
      return;
    }
    if (el.scrollTop + el.clientHeight > el.scrollHeight - 3 * CELL_PITCH_PX) {
      this.limit += ICON_PAGE;
      this.visible = this.shown.slice(0, this.limit);
    }
  }

  /** The arrow keys move through the grid (a row: as many cells as fit across), Enter takes the marked icon, Escape / Tab close. */
  onKey(event: KeyboardEvent): void {
    if (event.key === "Escape" || event.key === "Tab") {
      this.close();
      return;
    }
    if (!this.open) {
      if (event.key === "ArrowDown" || event.key === "Enter") {
        event.preventDefault();
        this.openPanel();
      }
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const icon = this.visible[this.activeIndex];
      if (icon) {
        this.pick(icon.name);
      }
      return;
    }
    const across = Math.max(1, Math.floor((this.panel?.nativeElement.clientWidth ?? CELL_PITCH_PX) / CELL_PITCH_PX));
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: across, ArrowUp: -across }[event.key];
    if (!step || !this.visible.length) {
      return;
    }
    event.preventDefault();
    this.activeIndex = Math.min(this.visible.length - 1, Math.max(0, this.activeIndex < 0 ? 0 : this.activeIndex + step));
    if (this.activeIndex > this.visible.length - across * 2 && this.visible.length < this.shown.length) {
      this.limit += ICON_PAGE;
      this.visible = this.shown.slice(0, this.limit);
    }
    this.scrollActiveIntoView();
  }

  pick(name: string): void {
    this.value = name;
    this.onChange(name);
    this.onTouched();
    this.close();
    this.field?.nativeElement.blur();
  }

  trackByName(_: number, icon: PickerIcon): string {
    return icon.name;
  }

  private close(): void {
    this.open = false;
    this.search = "";
    this.activeIndex = -1;
    if (IconPickerComponent.openInstance === this) {
      IconPickerComponent.openInstance = null;
    }
  }

  private labelOf(name: string): string {
    return this.icons.find((i) => i.name === name)?.label ?? iconLabel(name);
  }

  private ensureIcons(): void {
    if (this.icons.length) {
      return;
    }
    this.loading = true;
    loadIcons(this.http).subscribe((icons) => {
      if (this.destroyed) {
        return;
      }
      this.icons = icons;
      this.loading = false;
      this.applySearch();
      this.activeIndex = this.open && this.search ? 0 : this.visible.findIndex((i) => i.name === this.value);
      this.cd.detectChanges();
    });
  }

  /** The icons every typed word finds (in the name, or starting one of its words) — those named by it first. */
  private applySearch(): void {
    const words = this.search.toLowerCase().split(/[\s_-]+/).filter(Boolean);
    if (!words.length) {
      this.shown = this.icons;
    } else {
      const rank = (i: PickerIcon): number => {
        let score = 0;
        for (const w of words) {
          if (i.name.includes(w)) {
            score += i.name.startsWith(w) ? 0 : 1;
          } else if (i.tags.some((t) => t.startsWith(w))) {
            score += 2;
          } else {
            return -1;
          }
        }
        return score;
      };
      this.shown = this.icons
        .map((icon) => ({ icon, score: rank(icon) }))
        .filter((r) => r.score >= 0)
        .sort((a, b) => a.score - b.score)
        .map((r) => r.icon);
    }
    this.visible = this.shown.slice(0, this.limit);
  }

  private scrollActiveIntoView(): void {
    const panel = this.panel?.nativeElement;
    const cell = panel?.querySelectorAll<HTMLElement>(".ip-cell")[this.activeIndex];
    if (!panel || !cell) {
      return;
    }
    const box = panel.getBoundingClientRect();
    const r = cell.getBoundingClientRect();
    if (r.top < box.top + 6) {
      panel.scrollTop -= box.top + 6 - r.top;
    } else if (r.bottom > box.bottom - 6) {
      panel.scrollTop += r.bottom - (box.bottom - 6);
    }
  }

  // -- ControlValueAccessor ---------------------------------------------------
  writeValue(value: string | null): void {
    this.value = value ?? "";
    this.cd.markForCheck();
  }
  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  private readonly onDocumentPointerDown = (event: Event): void => {
    if (this.open && !this.host.nativeElement.contains(event.target as Node)) {
      // A ThingsBoard widget is OnPush: back in Angular, this view repainted itself.
      this.zone.run(() => {
        this.close();
        this.cd.detectChanges();
      });
    }
  };
}
