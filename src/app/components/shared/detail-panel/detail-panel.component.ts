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

import { ChangeDetectorRef, Component, EventEmitter, HostBinding, HostListener, Input, OnChanges, OnDestroy, Output, SimpleChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";

/**
 * Reusable right-side detail drawer. Slides in from the right edge when
 * {@link open} is set — and back out when it's cleared — with the shared expand timing
 * (`motion.$expand-duration`) as the collapsible cards and the filter sidebar; a header (title + close
 * button) and a scrolling body for projected content. Themed via the inherited
 * `--c-*` tokens.
 *
 * The panel stays rendered while it slides out, then emits {@link afterClosed}:
 * clear the content's data there (not on close) so it doesn't blank mid-slide.
 *
 * ```html
 * <tb-detail-panel [open]="open" [title]="name" (closed)="open = false">
 *   …detail content…
 * </tb-detail-panel>
 * ```
 */
@Component({
  selector: "tb-detail-panel",
  templateUrl: "./detail-panel.component.html",
  styleUrls: ["./detail-panel.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule],
})
export class DetailPanelComponent implements OnChanges, OnDestroy {
  /**
   * Strip the native `title` attribute off the host so the browser doesn't
   * render its own tooltip from the `title` @Input.
   */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;

  /** Whether the panel is shown (slid in). */
  @Input() open = false;
  /** Header title (e.g. the selected entity's name). */
  @Input() title = "";
  /** Show a click-to-dismiss backdrop behind the panel (closes on click-off). */
  @Input() dismissible = false;
  /** Drop the body's top padding so content starts flush under the header
   *  (level with the dashboard navbar's divider line). */
  @Input() flushBody = false;

  /** Emitted when the user closes the panel (close button, Escape, or backdrop). */
  @Output() closed = new EventEmitter<void>();
  /** Emitted once a close has finished sliding out (the panel is gone). */
  @Output() afterClosed = new EventEmitter<void>();

  /** In the DOM — from the moment it opens until its slide-out ends. */
  rendered = false;
  /** Slid in (drives the CSS transition); false while sliding in / out. */
  shown = false;
  private frame?: number;
  private closeTimer?: ReturnType<typeof setTimeout>;

  constructor(private cd: ChangeDetectorRef) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes["open"]) {
      return;
    }
    cancelAnimationFrame(this.frame ?? 0);
    clearTimeout(this.closeTimer);
    if (this.open) {
      // Render off-screen first, then flip to shown on a later frame so the
      // browser has a start state to transition from.
      this.rendered = true;
      this.frame = requestAnimationFrame(() => {
        this.frame = requestAnimationFrame(() => {
          this.shown = true;
          this.cd.detectChanges();
        });
      });
    } else if (this.rendered) {
      this.shown = false;
      // Fallback in case transitionend doesn't fire (e.g. hidden tab) — a
      // little longer than motion.$expand-duration (0.25s).
      this.closeTimer = setTimeout(() => this.finishClose(), 350);
    }
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.frame ?? 0);
    clearTimeout(this.closeTimer);
  }

  /** The panel's slide ended — after a close, take it out of the DOM. */
  onPanelTransitionEnd(event: TransitionEvent): void {
    if (event.target === event.currentTarget && event.propertyName === "transform" && !this.open) {
      this.finishClose();
    }
  }

  private finishClose(): void {
    clearTimeout(this.closeTimer);
    if (this.open || !this.rendered) {
      return;
    }
    this.rendered = false;
    this.cd.detectChanges();
    this.afterClosed.emit();
  }

  /**
   * Close on Escape from anywhere in the document — the panel is usually opened
   * by a click elsewhere (e.g. a table row), so it never holds focus and a
   * panel-local keydown handler wouldn't fire. `preventDefault` marks the event
   * handled so a single press doesn't close several stacked panels at once.
   */
  @HostListener("document:keydown.escape", ["$event"])
  onDocumentEscape(event: KeyboardEvent): void {
    if (!this.open || event.defaultPrevented) {
      return;
    }
    event.preventDefault();
    this.closed.emit();
  }
}
