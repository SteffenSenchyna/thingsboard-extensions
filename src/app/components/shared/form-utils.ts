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

import { AbstractControl, ValidationErrors, ValidatorFn, Validators } from "@angular/forms";

/** A name: no leading or trailing spaces, single spaces between words. */
export const NO_LEAD_TRAIL_SPACES = /^\S+(?: \S+)*$/;

/** A name another item has already (case and outer spaces aside) — the form's `duplicate` error. */
export function uniqueNameValidator(existing: () => string[]): ValidatorFn {
  return (c: AbstractControl): ValidationErrors | null => {
    const name = String(c.value ?? "")
      .trim()
      .toLowerCase();
    return name && existing().some((n) => n.toLowerCase() === name) ? { duplicate: true } : null;
  };
}

/** A form's name control's validators: required, tidy spaces, unique among `existing`. */
export function nameValidators(existing: () => string[]): ValidatorFn[] {
  return [Validators.required, Validators.pattern(NO_LEAD_TRAIL_SPACES), uniqueNameValidator(existing)];
}

/** A name control's error in words (null: none, or not touched yet) — `duplicate`: what to say when the name is taken. */
export function nameErrorOf(c: AbstractControl, duplicate: string): string | null {
  if (!c.touched) {
    return null;
  }
  if (c.hasError("required")) {
    return "A name is required.";
  }
  if (c.hasError("pattern")) {
    return "No leading or trailing spaces.";
  }
  return c.hasError("duplicate") ? duplicate : null;
}
