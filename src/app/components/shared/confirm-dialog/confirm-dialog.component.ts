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

import { AfterViewChecked, Component, DestroyRef, ElementRef, EventEmitter, Input, Output, ViewChild, inject } from "@angular/core";
import { CommonModule } from "@angular/common";

/**
 * Themed confirmation dialog rendered inside the dashboard (so it takes the
 * dashboard's light/dark `--c-*` theme, unlike ThingsBoard's overlay dialogs):
 * a dimmed backdrop over the dashboard root and a centred card with a title,
 * message and Cancel / confirm buttons. Escape or a backdrop click cancels.
 * The host's positioned ancestor (the dashboard root) is what it covers.
 *
 * ```html
 * <tb-ext-confirm-dialog [open]="!!confirm" [heading]="confirm?.heading" [message]="confirm?.message"
 *                    confirmLabel="Revoke" [danger]="true"
 *                    (confirmed)="…" (cancelled)="…"></tb-ext-confirm-dialog>
 * ```
 */
@Component({
  selector: "tb-ext-confirm-dialog",
  templateUrl: "./confirm-dialog.component.html",
  styleUrls: ["./confirm-dialog.component.scss"],
  standalone: true,
  imports: [CommonModule],
})
export class ConfirmDialogComponent implements AfterViewChecked {
  @Input() open = false;
  /** Heading (named `heading` rather than `title` so no native tooltip appears). */
  @Input() heading = "";
  @Input() message = "";
  @Input() confirmLabel = "Confirm";
  @Input() cancelLabel = "Cancel";
  /** Destructive action — the confirm button is red. */
  @Input() danger = false;
  @Output() confirmed = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  @ViewChild("cancelBtn") private cancelBtn?: ElementRef<HTMLButtonElement>;
  private focused = false;

  constructor() {
    // Capture phase, so Escape reaches the dialog before the side panels' own
    // document Escape handlers — `preventDefault` then tells them it's handled
    // and only the dialog closes.
    const onKeydown = (event: KeyboardEvent): void => {
      if (this.open && event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        this.cancelled.emit();
      }
    };
    document.addEventListener("keydown", onKeydown, true);
    inject(DestroyRef).onDestroy(() => document.removeEventListener("keydown", onKeydown, true));
  }

  /** Focus Cancel once each time the dialog opens (Enter never confirms by accident). */
  ngAfterViewChecked(): void {
    if (this.open && !this.focused && this.cancelBtn) {
      this.focused = true;
      this.cancelBtn.nativeElement.focus();
    } else if (!this.open) {
      this.focused = false;
    }
  }
}
