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

import { AbstractControl, ValidationErrors } from "@angular/forms";

/** A JSON editor's text must be a JSON object: `required` when empty, `json` when it isn't one (an array counts as not). */
export function jsonObjectValidator(control: AbstractControl): ValidationErrors | null {
  const text = String(control.value ?? "").trim();
  if (!text) {
    return { required: true };
  }
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? null : { json: true };
  } catch {
    return { json: true };
  }
}
