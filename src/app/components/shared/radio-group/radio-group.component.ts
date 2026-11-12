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


import { Component, ElementRef, EventEmitter, HostBinding, Input, Output, QueryList, ViewChildren, forwardRef } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from "@angular/forms";
import { InfoIconComponent } from "../info-icon/info-icon.component";

/** One choice of a {@link RadioGroupComponent}: its label and, optionally, an info tooltip explaining it. */
export interface RadioOption {
  id: string;
  label: string;
  /** What it means — an info icon after the label, its tooltip. */
  info?: string;
  disabled?: boolean;
}

/**
 * A row of round single-choice options (UniFi style): an empty ring, the
 * brand ring with its dot when picked, each with its label and, optionally,
 * an info icon whose tooltip explains it. Wraps onto more rows when narrow.
 * Arrow keys move the pick (one tab stop for the group). Bind
 * `[selected]` / `(selectedChange)`, or use it as a form control.
 *
 * ```html
 * <tb-radio-group [options]="levels" [selected]="level" (selectedChange)="level = $event" ariaLabel="Level"></tb-radio-group>
 * ```
 */
@Component({
  selector: "tb-radio-group",
  templateUrl: "./radio-group.component.html",
  styleUrls: ["./radio-group.component.scss"],
  standalone: true,
  imports: [CommonModule, InfoIconComponent],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => RadioGroupComponent), multi: true }],
})
export class RadioGroupComponent implements ControlValueAccessor {
  /** No native tooltip from a reflected `title`. */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;
  @Input() options: RadioOption[] = [];
  @Input() selected = "";
  /** The group's accessible name ("Scope", "Level"). */
  @Input() ariaLabel = "";
  @Output() selectedChange = new EventEmitter<string>();

  disabled = false;
  @ViewChildren("radio") private radios?: QueryList<ElementRef<HTMLButtonElement>>;

  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  /** The option that takes Tab: the picked one, else the first. */
  tabStop(index: number): number {
    const picked = this.options.findIndex((o) => o.id === this.selected);
    return index === (picked >= 0 ? picked : 0) ? 0 : -1;
  }

  pick(id: string): void {
    if (this.disabled || id === this.selected) {
      return;
    }
    this.selected = id;
    this.selectedChange.emit(id);
    this.onChange(id);
    this.onTouched();
  }

  /** Arrow keys: the next / previous enabled option is picked and takes the focus. */
  onKey(event: KeyboardEvent, index: number): void {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!step || !this.options.length) {
      return;
    }
    event.preventDefault();
    const n = this.options.length;
    for (let i = 1; i <= n; i++) {
      const next = (index + step * i + n) % n;
      if (!this.options[next].disabled) {
        this.pick(this.options[next].id);
        this.radios?.get(next)?.nativeElement.focus();
        return;
      }
    }
  }

  trackById(_: number, o: RadioOption): string {
    return o.id;
  }

  // -- ControlValueAccessor ---------------------------------------------------

  writeValue(value: string | null): void {
    this.selected = value ?? "";
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
}
