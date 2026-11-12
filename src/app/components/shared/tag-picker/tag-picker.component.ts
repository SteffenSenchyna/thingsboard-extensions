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

import { ChangeDetectorRef, Component, ElementRef, EventEmitter, HostListener, Input, NgZone, OnDestroy, Output, ViewChild } from "@angular/core";
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";
import { CheckboxComponent } from "../checkbox/checkbox.component";
import { SELECT_EMPTY } from "../select/select.component";

/** A tag the picker offers. */
export interface TagPickerOption {
  id: string;
  label: string;
  /** Its chip's text in the box (a product line's name where its row shows the lines above it); none — the label. */
  chipLabel?: string;
}

/**
 * A multi-pick field, as a select: the tags picked as chips in a box (each
 * with its ×) and a chevron; a click opens the picker under the field — a
 * search over every tag, a box per tag, Select all, and Cancel / Save, Save
 * putting the picks in the field ({@link selectedChange}; the card's own
 * Apply then saves them). Every list of picks (applications, groups,
 * profiles, dashboards) is one. The field holds the ids; the parent keeps the
 * value.
 *
 * ```html
 * <tb-tag-picker label="Applications" [options]="tags" [selected]="ids" (selectedChange)="ids = $event"></tb-tag-picker>
 * ```
 */
@Component({
  selector: "tb-tag-picker",
  templateUrl: "./tag-picker.component.html",
  styleUrls: ["./tag-picker.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, CheckboxComponent],
})
export class TagPickerComponent implements OnDestroy {
  /** The field's label above the box. */
  @Input() label = "";
  @Input() options: TagPickerOption[] = [];
  /** The tags picked (their ids). */
  @Input() selected: string[] = [];
  /** The box's text while nothing is picked. */
  @Input() placeholder = "None";
  @Input() searchPlaceholder = "Search";
  @Input() emptyText = "No matches";
  @Input() disabled = false;
  /** The dashes ("nothing picked"), spaced apart where they show. */
  readonly empty = SELECT_EMPTY;
  @Output() selectedChange = new EventEmitter<string[]>();
  @ViewChild("searchInput") private searchInput?: ElementRef<HTMLInputElement>;
  @ViewChild("panel") private panel?: ElementRef<HTMLElement>;

  open = false;
  query = "";
  /** The picks while the picker is open (Save hands them over, Cancel drops them). */
  private draft = new Set<string>();

  constructor(
    private host: ElementRef<HTMLElement>,
    private zone: NgZone,
    private cd: ChangeDetectorRef
  ) {
    // Capture-phase document listener (as the select's): closes the picker on any pointerdown outside the component.
    this.zone.runOutsideAngular(() => {
      document.addEventListener("pointerdown", this.onDocumentPointerDown, true);
    });
  }

  ngOnDestroy(): void {
    document.removeEventListener("pointerdown", this.onDocumentPointerDown, true);
  }

  /** The chips: the picked tags, in the options' order. */
  get selectedOptions(): TagPickerOption[] {
    return this.options.filter((o) => this.selected.includes(o.id));
  }

  /** The tags matching the search. */
  get filtered(): TagPickerOption[] {
    const q = this.query.trim().toLowerCase();
    return q ? this.options.filter((o) => o.label.toLowerCase().includes(q)) : this.options;
  }

  /** Every tag shown is picked (the Select all box). */
  get allChecked(): boolean {
    const shown = this.filtered;
    return shown.length > 0 && shown.every((o) => this.draft.has(o.id));
  }

  isChecked(id: string): boolean {
    return this.draft.has(id);
  }

  /**
   * Rows by id: a parent that builds its options on each change detection
   * would otherwise have every box (and its ngModel, whose write schedules a
   * microtask, and so another check) rebuilt on each — a loop that freezes the page.
   */
  trackById(_: number, option: TagPickerOption): string {
    return option.id;
  }

  setChecked(id: string, on: boolean): void {
    if (on) {
      this.draft.add(id);
    } else {
      this.draft.delete(id);
    }
  }

  /** Select all: the tags shown (all of them, or the search's matches). */
  setAll(on: boolean): void {
    for (const o of this.filtered) {
      this.setChecked(o.id, on);
    }
  }

  toggle(): void {
    if (this.open) {
      this.cancel();
    } else {
      this.openPicker();
    }
  }

  openPicker(): void {
    if (this.disabled) {
      return;
    }
    this.draft = new Set(this.selected);
    this.query = "";
    this.open = true;
    // The form scrolls the picker to the middle of its view; the search takes the focus (without a jump of its own).
    setTimeout(() => {
      this.searchInput?.nativeElement.focus({ preventScroll: true });
      this.panel?.nativeElement.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }

  /** A chip's ×: the tag out of the field at once. */
  remove(id: string, event: Event): void {
    event.stopPropagation();
    if (this.disabled) {
      return;
    }
    this.selectedChange.emit(this.selected.filter((x) => x !== id));
  }

  cancel(): void {
    this.open = false;
  }

  /** The picks into the field, in the options' order. */
  save(): void {
    this.open = false;
    this.selectedChange.emit(this.options.filter((o) => this.draft.has(o.id)).map((o) => o.id));
  }

  @HostListener("keydown.escape")
  onEscape(): void {
    if (this.open) {
      this.cancel();
    }
  }

  /** Close the picker when clicking anywhere outside the component (the picks are dropped, as Cancel). */
  private readonly onDocumentPointerDown = (event: Event): void => {
    if (this.open && !this.host.nativeElement.contains(event.target as Node)) {
      // The listener runs outside Angular, and a ThingsBoard widget is OnPush: re-enter and repaint this view itself.
      this.zone.run(() => {
        this.cancel();
        this.cd.detectChanges();
      });
    }
  };
}
