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

import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostBinding,
  HostListener,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";
import { ROW_HOVER_CLASS, clickableRowUnder } from "./side-panel-outside-click";

/**
 * The panels whose `open` changed in one change-detection pass, settled
 * together once it ends: a panel closing as another opens is a swap — the new
 * one takes the old one's place at once, with no slide (only the first panel
 * slides in, and the last one out).
 */
const moving = new Set<DetailPanelComponent>();

function queueMove(panel: DetailPanelComponent): void {
  if (!moving.size) {
    Promise.resolve().then(() => {
      const panels = [...moving];
      moving.clear();
      const swap = panels.some((p) => p.open) && panels.some((p) => !p.open);
      panels.forEach((p) => p.move(swap));
    });
  }
  moving.add(panel);
}

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
 * A panel opening as another closes takes its place at once (no slide) — the
 * panels of a trail (`tb-panel-trail`) swap so. A {@link dismissible} panel's
 * scrim passes a click on a clickable table row on to the row, which then
 * opens in the panel's place; any other click-off closes the panel.
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
  /** Its last move was a swap with another panel: no transition. */
  instant = false;
  private frame?: number;
  private closeTimer?: ReturnType<typeof setTimeout>;
  private destroyed = false;
  /** The table row marked as hovered through the scrim. */
  private hoverRow: Element | null = null;
  private hoverFrame = 0;
  private readonly onPointerMove = (event: MouseEvent) => this.trackRow(event);
  private readonly onPointerOut = (event: MouseEvent) => {
    if ((event.target as Element | null)?.classList?.contains("dp-backdrop")) {
      this.markRow(null, event.target as HTMLElement);
    }
  };

  constructor(
    private cd: ChangeDetectorRef,
    private zone: NgZone,
    private host: ElementRef<HTMLElement>
  ) {
    // The pointer over the scrim, watched outside Angular (no change detection a move).
    this.zone.runOutsideAngular(() => {
      this.host.nativeElement.addEventListener("mousemove", this.onPointerMove);
      this.host.nativeElement.addEventListener("mouseout", this.onPointerOut);
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes["open"]) {
      return;
    }
    cancelAnimationFrame(this.frame ?? 0);
    clearTimeout(this.closeTimer);
    if (this.open) {
      // In the DOM now, still off-screen.
      this.rendered = true;
    } else if (!this.rendered) {
      return;
    }
    // Slide or swap: decided once every panel of this pass is known.
    queueMove(this);
  }

  /**
   * The panel's move after its `open` changed: `instant` — it swaps with
   * another panel — at once; else it slides in (shown on a later frame, so
   * the browser has a start state to transition from) or out.
   */
  move(instant: boolean): void {
    if (this.destroyed) {
      return;
    }
    cancelAnimationFrame(this.frame ?? 0);
    clearTimeout(this.closeTimer);
    this.instant = instant;
    if (this.open) {
      if (instant) {
        this.shown = true;
        this.cd.detectChanges();
        return;
      }
      this.frame = requestAnimationFrame(() => {
        this.frame = requestAnimationFrame(() => {
          this.shown = true;
          this.cd.detectChanges();
        });
      });
    } else if (this.rendered) {
      this.shown = false;
      this.markRow(null, null);
      if (instant) {
        this.finishClose();
        return;
      }
      this.cd.detectChanges();
      // Fallback in case transitionend doesn't fire (e.g. hidden tab) — a
      // little longer than motion.$expand-duration (0.25s).
      this.closeTimer = setTimeout(() => this.finishClose(), 350);
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    moving.delete(this);
    cancelAnimationFrame(this.frame ?? 0);
    cancelAnimationFrame(this.hoverFrame);
    clearTimeout(this.closeTimer);
    this.markRow(null, null);
    this.host.nativeElement.removeEventListener("mousemove", this.onPointerMove);
    this.host.nativeElement.removeEventListener("mouseout", this.onPointerOut);
  }

  /**
   * A click on the scrim: on a clickable table row under it, the row's own
   * (it opens in the panel's place); anywhere else, the panel closes.
   */
  onBackdropClick(event: MouseEvent): void {
    const under = clickableRowUnder(event.clientX, event.clientY);
    if (!under) {
      this.closed.emit();
      return;
    }
    under.target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window, clientX: event.clientX, clientY: event.clientY }));
  }

  /** The pointer over the scrim: the clickable row under it looks hovered, the pointer a hand (once a frame). */
  private trackRow(event: MouseEvent): void {
    const backdrop = event.target as HTMLElement | null;
    if (!backdrop?.classList?.contains("dp-backdrop") || this.hoverFrame) {
      return;
    }
    const { clientX, clientY } = event;
    this.hoverFrame = requestAnimationFrame(() => {
      this.hoverFrame = 0;
      this.markRow(this.shown ? (clickableRowUnder(clientX, clientY)?.row ?? null) : null, backdrop);
    });
  }

  private markRow(row: Element | null, backdrop: HTMLElement | null): void {
    if (backdrop) {
      backdrop.style.cursor = row ? "pointer" : "";
    }
    if (row === this.hoverRow) {
      return;
    }
    this.hoverRow?.classList.remove(ROW_HOVER_CLASS);
    row?.classList.add(ROW_HOVER_CLASS);
    this.hoverRow = row;
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
