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

import { Component, EventEmitter, HostBinding, Input, Output } from "@angular/core";

/**
 * A panel form's buttons, under its last card (held at the panel's bottom on
 * a long form): Cancel and the submit ("Create", "Apply changes" — the
 * form's `(ngSubmit)`). Shown by the form while there's something to
 * submit: always for a new item, once changed for an existing one.
 *
 * ```html
 * <form [formGroup]="form" (ngSubmit)="submit()">
 *   …
 *   <tb-form-actions *ngIf="creating || dirty" [submitLabel]="submitLabel" [disabled]="!canSubmit" (cancelled)="cancel()"></tb-form-actions>
 * </form>
 * ```
 */
@Component({
  selector: "tb-form-actions",
  template: `<button type="button" class="fa-cancel" [disabled]="cancelDisabled" (click)="cancelled.emit()">Cancel</button>
    <button [attr.type]="submits ? 'submit' : 'button'" class="fa-submit" [disabled]="disabled" (click)="submitted.emit()">{{ submitLabel }}</button>`,
  styleUrls: ["./form-actions.component.scss"],
  standalone: true,
})
export class FormActionsComponent {
  @HostBinding("attr.title") readonly hostTitle: string | null = null;
  @Input() submitLabel = "Apply changes";
  /** The submit is off (nothing to save, invalid, saving). */
  @Input() disabled = false;
  @Input() cancelDisabled = false;
  /** The submit button submits its form (off: outside a form — answer {@link submitted}). */
  @Input() submits = true;
  @Output() cancelled = new EventEmitter<void>();
  @Output() submitted = new EventEmitter<void>();
}
