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

import { AfterViewChecked, Component, DestroyRef, ElementRef, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewChild, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";

/**
 * Themed dialog card rendered inside the dashboard (so it takes the
 * dashboard's light/dark `--c-*` theme, unlike ThingsBoard's overlay dialogs):
 * a dimmed backdrop over the dashboard root and a large centred card — a
 * header (icon, heading, subtitle, a close button — with slots for controls
 * beside the title, `dialog-title`, and before the close button,
 * `dialog-header`) over the projected content,
 * which fills the card (lay it out as panes, a table, an editor…), and a footer
 * for actions marked `dialog-footer` (a hint, Cancel / Apply). Escape, the
 * close button or a backdrop click closes it. The host's positioned ancestor
 * (the dashboard root) is what it covers; for a question with Cancel / confirm
 * use `tb-ext-confirm-dialog` instead. Dialogs stack: one opened while another
 * is open sits over it (and its backdrop), and Escape closes the top one only.
 *
 * ```html
 * <tb-ext-dialog [open]="!!connector" icon="cable" [heading]="connector?.name" subtitle="Modbus" (closed)="connector = null">
 *   <div class="two-panes">…</div>
 *   <button dialog-footer type="button" (click)="connector = null">Cancel</button>
 *   <button dialog-footer type="button" (click)="apply()">Apply changes</button>
 * </tb-ext-dialog>
 * ```
 */
@Component({
  selector: "tb-ext-dialog",
  templateUrl: "./dialog.component.html",
  styleUrls: ["./dialog.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule],
})
export class DialogComponent implements AfterViewChecked, OnChanges {
  /** The open dialogs, in the order they opened (the last is on top). */
  private static stack: DialogComponent[] = [];

  @Input() open = false;
  /** Heading (named `heading` rather than `title` so no native tooltip appears). */
  @Input() heading = "";
  /** A muted line under the heading. */
  @Input() subtitle = "";
  /** A Material Symbols icon before the heading ("" for none). */
  @Input() icon = "";
  @Output() closed = new EventEmitter<void>();

  /** How many dialogs were open under this one when it opened: it stacks above them. */
  depth = 0;

  @ViewChild("closeBtn") private closeBtn?: ElementRef<HTMLButtonElement>;
  private focused = false;

  constructor() {
    // Capture phase, so Escape reaches the dialog before the side panels' own
    // document Escape handlers — `preventDefault` then tells them it's handled
    // and only the dialog closes (the confirm dialog's way).
    const onKeydown = (event: KeyboardEvent): void => {
      const top = DialogComponent.stack[DialogComponent.stack.length - 1];
      if (this.open && top === this && event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        this.closed.emit();
      }
    };
    document.addEventListener("keydown", onKeydown, true);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener("keydown", onKeydown, true);
      this.leaveStack();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes["open"]) {
      return;
    }
    this.leaveStack();
    if (this.open) {
      this.depth = DialogComponent.stack.length;
      DialogComponent.stack.push(this);
    }
  }

  private leaveStack(): void {
    DialogComponent.stack = DialogComponent.stack.filter((d) => d !== this);
  }

  /** Focus the close button once each time the dialog opens (the keyboard starts inside it). */
  ngAfterViewChecked(): void {
    if (this.open && !this.focused && this.closeBtn) {
      this.focused = true;
      this.closeBtn.nativeElement.focus();
    } else if (!this.open) {
      this.focused = false;
    }
  }
}
