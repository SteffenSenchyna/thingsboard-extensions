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

import { Component, ElementRef, Input, ViewChild, forwardRef } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from "@angular/forms";
import { SharedModule } from "@shared/public-api";
import { SELECT_EMPTY } from "../select/select.component";

/** A file's size as a field shows it: "812 B", "64 KB", "1.2 MB". */
export function fileSizeText(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/**
 * A form's file field: the box of the form's inputs with a file icon, the
 * file picked and its size muted after it; a click (or Enter / Space) opens
 * the browser's file picker, and a file dropped on it is picked too (the
 * brand ring while one is dragged over it). A form control (`ngModel`,
 * `formControlName`), its value the `File` (null none) — never the browser's
 * own file input, whose look and "No file chosen" can't be themed.
 * Nothing picked shows nothing, as every select (`placeholder`).
 */
@Component({
  selector: "tb-file-field",
  templateUrl: "./file-field.component.html",
  styleUrls: ["./file-field.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => FileFieldComponent), multi: true }],
})
export class FileFieldComponent implements ControlValueAccessor {
  /** The kinds of file the picker offers (its `accept`: ".dp", "image/*"). */
  @Input() accept = "";
  /** What it shows with nothing picked: nothing, as every select. */
  @Input() placeholder = SELECT_EMPTY;
  /** The field's id, for its label's `for`. */
  @Input() inputId: string | null = null;
  /** The form's error border. */
  @Input() invalid = false;

  @ViewChild("picker", { static: true }) picker!: ElementRef<HTMLInputElement>;

  value: File | null = null;
  disabled = false;
  /** A file is dragged over it. */
  over = false;
  private onChange: (v: File | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  get size(): string {
    return this.value ? fileSizeText(this.value.size) : "";
  }

  /** The browser's file picker (its input emptied first, so the same file picked again still counts). */
  open(): void {
    if (this.disabled) {
      return;
    }
    this.picker.nativeElement.value = "";
    this.picker.nativeElement.click();
  }

  picked(input: HTMLInputElement): void {
    const file = input.files?.[0] ?? null;
    if (file) {
      this.pick(file);
    }
  }

  dragOver(event: DragEvent): void {
    if (this.disabled || !event.dataTransfer?.types.includes("Files")) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    this.over = true;
  }

  dragLeave(): void {
    this.over = false;
  }

  drop(event: DragEvent): void {
    this.over = false;
    const file = event.dataTransfer?.files?.[0];
    if (this.disabled || !file) {
      return;
    }
    event.preventDefault();
    this.pick(file);
  }

  private pick(file: File): void {
    this.value = file;
    this.onChange(file);
    this.onTouched();
  }

  writeValue(value: File | null): void {
    this.value = value ?? null;
  }

  registerOnChange(fn: (v: File | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled = disabled;
  }
}
