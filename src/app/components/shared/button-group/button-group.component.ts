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

import { Component, Input, forwardRef } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from "@angular/forms";
import { SharedModule } from "@shared/public-api";

/** An option in a {@link ButtonGroupComponent}. */
export interface ButtonGroupOption {
  value: string;
  label: string;
  /** Optional hover tooltip. */
  tooltip?: string;
}

/** A button group's most options, and the longest label and the most characters in all that still fit a side panel's width. */
const BUTTONS_MAX = 4;
const BUTTON_LABEL_MAX = 14;
const BUTTON_LABELS_MAX = 36;

/**
 * Whether a single pick among fixed options shows as a button group rather than a select (the input guide, CLAUDE.md "Choosing a
 * control"): 2–4 options with short labels — all visible, one click; more, or longer labels, a select. A form whose fields are
 * built from a definition (ESF's) asks this per field.
 */
export function fitsButtonGroup(options: readonly { label: string }[] | null | undefined): boolean {
  const labels = (options ?? []).map((o) => o.label ?? "");
  return labels.length >= 2 && labels.length <= BUTTONS_MAX && labels.every((l) => l.length <= BUTTON_LABEL_MAX) && labels.join("").length <= BUTTON_LABELS_MAX;
}

/** How a single pick among fixed options shows (the input guide). */
export type PickControl = "radio" | "radio-column" | "buttons" | "select";

/**
 * The control for a pick built from a definition: 2–4 short options a button group ({@link fitsButtonGroup}) — explained or not (their
 * notes then the field's info icon, an option a line: {@link pickNote}); longer options that each carry a note — modes whose
 * consequences need a sentence (an ESF interface's Status, Privacy) — a radio group, an info icon an option, on one row where they fit
 * it, else one a line (never a wrapping row); else a select. Radios only where buttons won't do.
 */
export function pickControl(options: readonly { label: string; info?: string }[] | null | undefined, wide = false): PickControl {
  const list = options ?? [];
  if (fitsButtonGroup(list)) {
    return "buttons";
  }
  // A form across its page (`wide` — the ESF Drivers and assets view's): a few options too long for buttons, but one row of radios
  // fits its width — that row, explained or not, the room it has used.
  if (wide && fitsWideRadioRow(list)) {
    return "radio";
  }
  if (list.length >= 2 && list.length <= 6 && list.some((o) => !!o.info)) {
    return fitsRadioRow(list) ? "radio" : "radio-column";
  }
  return "select";
}

/**
 * A button group's options' notes as its field's note, an option a line ("EUI64: from the hardware address …"): a short pick's
 * explanations, where a radio group would put them on each option. "" when it isn't a button group or its options carry none.
 */
export function pickNote(options: readonly { label: string; info?: string }[] | null | undefined): string {
  const list = options ?? [];
  if (!fitsButtonGroup(list) || !list.some((o) => !!o.info)) {
    return "";
  }
  return list
    .filter((o) => !!o.info)
    .map((o) => `${o.label}: ${o.info!.charAt(0).toLowerCase()}${o.info!.slice(1).replace(/\.$/, "")}`)
    .join("\n");
}

/** A radio option's own room past its label (its ring, the gaps, its info icon), in characters of the label's type (~7px each). */
const RADIO_OPTION_CHARS = 9;
/** The characters a side panel's row holds (~310px). */
const RADIO_ROW_CHARS = 44;

/** The characters a wide form's row holds (a form across its page — ~840px, so a narrower window still keeps it on one row). */
const WIDE_RADIO_ROW_CHARS = 120;

/** Whether 2–5 radio options fit one row of a wide form (their labels and their rings, gaps and info icons). */
export function fitsWideRadioRow(options: readonly { label: string }[]): boolean {
  const labels = options.map((o) => o.label ?? "");
  return labels.length >= 2 && labels.length <= 5 && labels.join("").length + RADIO_OPTION_CHARS * labels.length <= WIDE_RADIO_ROW_CHARS;
}

/** Whether radio options, each with its info icon, fit one row of a side panel (2–4 of them, short enough): else one a line. */
export function fitsRadioRow(options: readonly { label: string }[]): boolean {
  const labels = options.map((o) => o.label ?? "");
  return labels.length >= 2 && labels.length <= 4 && labels.join("").length + RADIO_OPTION_CHARS * labels.length <= RADIO_ROW_CHARS;
}

/**
 * Themed single-select button group (a row of outlined boxes where the selected
 * one is highlighted with the brand-blue border / text — same look as the radio
 * "Channel Width" control). Implements ControlValueAccessor so it works with
 * `formControlName` / `[(ngModel)]`.
 */
@Component({
  selector: "tb-button-group",
  templateUrl: "./button-group.component.html",
  styleUrls: ["./button-group.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => ButtonGroupComponent), multi: true }],
})
export class ButtonGroupComponent implements ControlValueAccessor {
  @Input() options: ButtonGroupOption[] = [];

  value: string | null = null;
  disabled = false;

  private onChange: (value: string | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  select(option: ButtonGroupOption): void {
    if (this.disabled || option.value === this.value) {
      return;
    }
    this.value = option.value;
    this.onChange(option.value);
    this.onTouched();
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
}
