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

import { ChangeDetectorRef, Component, HostBinding, Input, forwardRef } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from "@angular/forms";
import { SharedModule } from "@shared/public-api";

/**
 * Themed secret box — a text field for a token or a password: the text inputs'
 * box, in the copy box's monospace, its value hidden as dots until the eye
 * shows it, and a copy button at the end (the copy box's: the icon turns into
 * a green ✓ for a moment). A ControlValueAccessor: works with
 * `formControlName` / `[(ngModel)]`, the value a string.
 *
 * ```html
 * <tb-secret-box inputId="gc-token" placeholder="The device's access token" formControlName="accessToken"></tb-secret-box>
 * ```
 */
@Component({
  selector: "tb-secret-box",
  templateUrl: "./secret-box.component.html",
  styleUrls: ["./secret-box.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SecretBoxComponent), multi: true }],
})
export class SecretBoxComponent implements ControlValueAccessor {
  @Input() placeholder = "";
  /** The inner input's id, for a `<label for>`. */
  @Input() inputId = "";
  @Input() ariaLabel = "";
  /** Shown, never typed in (a fuel code's digits): still hidden until the eye shows them, and copied. */
  @Input() readonly = false;
  /** The error border (the form's hint says why). */
  @Input() @HostBinding("class.sb-invalid") invalid = false;
  /** Milliseconds the ✓ confirmation stays visible. */
  @Input() copiedDuration = 1500;

  value = "";
  disabled = false;
  /** The value shown in clear (the eye toggles it; hidden again when the value changes from outside). */
  revealed = false;
  copied = false;

  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor(private readonly cd: ChangeDetectorRef) {}

  onInput(value: string): void {
    this.value = value;
    this.onChange(value);
  }

  onBlur(): void {
    this.onTouched();
  }

  toggleReveal(): void {
    this.revealed = !this.revealed;
  }

  copy(): void {
    if (!this.value || !navigator?.clipboard || this.copied) {
      return;
    }
    navigator.clipboard.writeText(this.value).then(() => {
      this.copied = true;
      this.cd.markForCheck();
      setTimeout(() => {
        this.copied = false;
        this.cd.markForCheck();
      }, this.copiedDuration);
    });
  }

  // -- ControlValueAccessor ---------------------------------------------------
  writeValue(value: string | null): void {
    this.value = value ?? "";
    this.revealed = false;
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
