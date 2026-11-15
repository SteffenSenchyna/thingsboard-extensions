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

import { Component, ElementRef, Input, OnDestroy, forwardRef } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from "@angular/forms";
import { SharedModule } from "@shared/public-api";
import { TbDateRange } from "../date-range-picker/date-range-picker.component";
import { SELECT_EMPTY } from "../select/select.component";
import { formatDate, formatDateTime } from "../time-format";
import { DatePickerHostComponent, findDatePickerHost } from "./date-picker-host.component";

/** A day as a date field (and a native date input) keeps it: "YYYY-MM-DD", the viewer's day; "" none. */
export function dateFieldValue(ts: number | null): string {
  if (ts === null) {
    return "";
  }
  const d = new Date(ts);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

/** A date field's day ("YYYY-MM-DD") as its midnight (the viewer's), or null. */
export function dateFieldDay(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? "").trim());
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() : null;
}

/**
 * A form's date field: the box of the form's inputs with a calendar icon and
 * the date picked, which opens the dashboard's calendar (the shared
 * `tb-date-range-picker`, through the root's `tb-date-picker-host`) under it.
 * A form control (`formControlName`, `ngModel`):
 *
 * - `mode="day"` (the default): one day, its value "YYYY-MM-DD" ("" none — a
 *   native date input's), shown "Dec 31, 2026"; `future` lets days after
 *   today be picked, `min` (ms) keeps days before it out.
 * - `mode="range"`: a time range (`TbDateRange`, null none), shown
 *   "Sep 30 at 1:05 PM – Oct 2 at 9:00 AM".
 *
 * Nothing picked shows nothing, as every select — or what the empty value
 * means (`placeholder`: "Never").
 */
@Component({
  selector: "tb-date-field",
  templateUrl: "./date-field.component.html",
  styleUrls: ["./date-field.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DateFieldComponent), multi: true }],
})
export class DateFieldComponent implements ControlValueAccessor, OnDestroy {
  @Input() mode: "day" | "range" = "day";
  /** Days after today can be picked (an expiry's). */
  @Input() future = false;
  /** Days before this one (ms) can't be picked (an expiry: today). */
  @Input() min: number | null = null;
  /** What it shows with nothing picked: nothing, as every select — or what the empty value means ("Never"). */
  @Input() placeholder = SELECT_EMPTY;
  /** The field's id, for its label's `for`. */
  @Input() inputId: string | null = null;
  /** The form's error border. */
  @Input() invalid = false;

  value: string | TbDateRange | null = null;
  disabled = false;
  private host: DatePickerHostComponent | null = null;
  private onChange: (v: string | TbDateRange | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor(private readonly el: ElementRef<HTMLElement>) {}

  ngOnDestroy(): void {
    this.host?.close(this);
  }

  /** Nothing picked. */
  get empty(): boolean {
    return this.mode === "day" ? !dateFieldDay(String(this.value ?? "")) : !this.value;
  }

  /** The pick as text ("Dec 31, 2026"; a range "Sep 30 at 1:05 PM – Oct 2 at 9:00 AM"), or the placeholder. */
  get text(): string {
    if (this.mode === "day") {
      const day = dateFieldDay(String(this.value ?? ""));
      return day === null ? this.placeholder : formatDate(day);
    }
    const r = this.value as TbDateRange | null;
    return r ? `${formatDateTime(r.start)} – ${formatDateTime(r.end)}` : this.placeholder;
  }

  /** Its calendar is open. */
  get expanded(): boolean {
    return !!this.host?.isOpenFor(this);
  }

  /** Open the dashboard's calendar under the field (its click again closes it). */
  toggle(anchor: HTMLElement): void {
    this.host ??= findDatePickerHost(this.el.nativeElement);
    if (!this.host) {
      console.warn("tb-date-field: no tb-date-picker-host in the dashboard root");
      return;
    }
    const day = this.mode === "day" ? dateFieldDay(String(this.value ?? "")) : null;
    this.host.toggle(this, {
      anchor,
      mode: this.mode,
      range: this.mode === "day" ? (day === null ? null : { start: day, end: day }) : ((this.value as TbDateRange | null) ?? null),
      future: this.future,
      min: this.min,
      applied: (range) => this.pick(range),
    });
  }

  private pick(range: TbDateRange): void {
    this.value = this.mode === "day" ? dateFieldValue(range.start) : range;
    this.onChange(this.value);
    this.onTouched();
  }

  writeValue(value: string | TbDateRange | null): void {
    this.value = value ?? (this.mode === "day" ? "" : null);
  }

  registerOnChange(fn: (v: string | TbDateRange | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled = disabled;
    if (disabled) {
      this.host?.close(this);
    }
  }
}
