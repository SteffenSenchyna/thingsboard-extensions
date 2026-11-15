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

import { ChangeDetectorRef, Component, ElementRef, OnDestroy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { DateRangePickerComponent, TbDateRange } from "../date-range-picker/date-range-picker.component";

/** What a field asks the dashboard's calendar for. */
export interface DatePickRequest {
  /** The field: the calendar opens under it (and its own click closes it again). */
  anchor: HTMLElement;
  mode: "range" | "day";
  /** The range or day picked now (null: none — the calendar starts on its default). */
  range: TbDateRange | null;
  future: boolean;
  min: number | null;
  /** The pick, applied. */
  applied: (range: TbDateRange) => void;
}

/** Each host by its element, for the fields under its dashboard root to find. */
const HOSTS = new WeakMap<Element, DatePickerHostComponent>();

/**
 * The dashboard's one calendar for its form fields (`tb-date-field`): the
 * shared `tb-date-range-picker`, placed in the dashboard root — as the
 * confirm dialog and the toasts — so it takes the dashboard's theme and no
 * side panel or scrolling card clips it. A field finds the nearest one above
 * it (an app nested in Home: the app's own, else Home's) and opens it under
 * itself. Every dashboard with a date field places one:
 *
 * ```html
 * <tb-date-picker-host></tb-date-picker-host>
 * ```
 */
@Component({
  selector: "tb-date-picker-host",
  standalone: true,
  imports: [CommonModule, DateRangePickerComponent],
  template: `<tb-date-range-picker [open]="!!request" [anchor]="request?.anchor ?? null" [range]="request?.range ?? null" [mode]="request?.mode ?? 'range'"
                                   [future]="!!request?.future" [min]="request?.min ?? null" (applied)="onApplied($event)" (cancelled)="close()"></tb-date-range-picker>`,
  // Boxes nothing: the calendar positions against the dashboard root.
  styles: [":host { display: contents; }"],
})
export class DatePickerHostComponent implements OnDestroy {
  /** The field's ask while its calendar is open; null — closed. */
  request: DatePickRequest | null = null;
  private owner: object | null = null;

  constructor(
    private readonly el: ElementRef<HTMLElement>,
    private readonly cd: ChangeDetectorRef
  ) {
    HOSTS.set(el.nativeElement, this);
  }

  ngOnDestroy(): void {
    HOSTS.delete(this.el.nativeElement);
  }

  /** The calendar is open for this field. */
  isOpenFor(owner: object): boolean {
    return !!this.request && this.owner === owner;
  }

  /** Open the calendar for a field — or close it, when it's that field's already (its click toggles it). */
  toggle(owner: object, request: DatePickRequest): void {
    if (this.isOpenFor(owner)) {
      this.close();
      return;
    }
    // Another field's open: this one takes its place (the calendar opens again, under this field).
    this.request = null;
    this.cd.detectChanges();
    this.owner = owner;
    this.request = request;
    this.cd.detectChanges();
  }

  /** Close it — for this field only, when one is named (a field going away). */
  close(owner?: object): void {
    if (owner && this.owner !== owner) {
      return;
    }
    this.request = null;
    this.owner = null;
    this.cd.detectChanges();
  }

  onApplied(range: TbDateRange): void {
    const request = this.request;
    this.close();
    request?.applied(range);
  }
}

/** The nearest `tb-date-picker-host` above an element: a child of one of its ancestors (the dashboard root's). */
export function findDatePickerHost(from: HTMLElement): DatePickerHostComponent | null {
  for (let el = from.parentElement; el; el = el.parentElement) {
    for (const child of Array.from(el.children)) {
      const host = child.tagName === "TB-DATE-PICKER-HOST" ? HOSTS.get(child) : undefined;
      if (host) {
        return host;
      }
    }
  }
  return null;
}
