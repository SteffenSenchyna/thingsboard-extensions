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

import { Component, Input, Optional, Self, OnInit } from "@angular/core";
import { ControlValueAccessor, FormsModule, NgControl, Validators } from "@angular/forms";
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";

@Component({
  selector: "tb-slider-input",
  templateUrl: "./slider-input.component.html",
  styleUrls: ["./slider-input.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, FormsModule]
})
export class SliderInputComponent implements ControlValueAccessor, OnInit {
  @Input() min = 1;
  @Input() max = 100;
  @Input() step = 1;
  @Input() placeholder = "Set";
  @Input() required = false;
  @Input() allowNegative = false;
  @Input() allowExponential = false;
  @Input() unit = "";

  value: number = this.min;
  disabled = false;

  constructor(@Optional() @Self() public ngControl: NgControl) {
    if (this.ngControl) {
      this.ngControl.valueAccessor = this;
    }
  }

  get hasError(): boolean {
    return !!(this.ngControl?.control?.invalid && this.ngControl?.control?.touched);
  }

  get errorMessage(): string {
    if (!this.ngControl?.control?.errors) {
      return "";
    }

    const errors = this.ngControl.control.errors;

    if (errors['required']) {
      return "This field is required";
    }
    if (errors['min']) {
      return `Value must be at least ${this.min}`;
    }
    if (errors['max']) {
      return `Value must not exceed ${this.max}`;
    }
    return "Invalid value";
  }

  ngOnInit(): void {
    this.setValidators();
  }

  writeValue(value: number): void {
    this.value = value || this.min;
  }

  registerOnChange(fn: (value: number) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  updateValue(event: Event): void {
    const input = event.target as HTMLInputElement;
    const newValue = parseInt(input.value, 10);
    this.value = newValue;
    this.onChange(newValue);
    this.onTouched();
  }

  preventInvalidNumberInput(event: KeyboardEvent): void {
    const input = event.target as HTMLInputElement;
    const key = event.key;

    // Prevent minus if negative numbers are not allowed
    if (key === '-' && !this.allowNegative) {
      event.preventDefault();
      return;
    }

    // Prevent e, E if exponential notation is not allowed
    if ((key === 'e' || key === 'E') && !this.allowExponential) {
      event.preventDefault();
      return;
    }

    // Prevent 0 when field is empty or all text is selected, and min is greater than 0
    if (key === '0' && this.min > 0) {
      if (!input.value || (input.selectionStart === 0 && input.selectionEnd === input.value.length)) {
        event.preventDefault();
      }
    }
  }

  clearZeroValue(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.value === '0' && this.min > 0) {
      input.value = '';
    }
  }

  protected onChange: (value: number) => void = () => {};

  protected onTouched: () => void = () => {};

  private setValidators(): void {
    if (!this.ngControl?.control) {
      return;
    }

    const validators = [];

    if (this.required) {
      validators.push(Validators.required);
    }

    validators.push(Validators.min(this.min));
    validators.push(Validators.max(this.max));

    this.ngControl.control.setValidators(validators);
    this.ngControl.control.updateValueAndValidity();
  }
}
