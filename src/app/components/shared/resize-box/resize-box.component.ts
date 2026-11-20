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

import { Component, ElementRef, HostBinding, Input, OnChanges, OnDestroy, SimpleChanges } from "@angular/core";

/** The grip's height under the box — keep in step with `$grip-height` in the SCSS. */
const GRIP_HEIGHT_PX = 10;
/** How far an arrow key moves the grip. */
const KEY_STEP_PX = 24;
/** The grip dragged this near the bottom (or top) of what scrolls round it: that scrolls, the box following — as fast as it's near. */
const EDGE_PX = 40;
const MAX_SCROLL_PX = 18;

/**
 * A box whose height the user can drag — around a control that is cramped at
 * the height its form gives it (a JSON editor in a side panel): a grip under
 * the box drags its bottom edge down (and back up, never under
 * {@link minHeight}); the form around it grows and its panel scrolls. A double
 * click on the grip — or dragging back — returns the box to the height the
 * form gives it. With the grip focused, the up / down arrows move it too.
 *
 * It sits in a flex column, taking the spare height like the control it wraps
 * (`flex: 1 1 auto`); the control fills it — give the control
 * `flex: 1 1 auto; min-height: 0`.
 *
 * ```html
 * <tb-resize-box>
 *   <tb-json-content … [fillHeight]="true"></tb-json-content>
 * </tb-resize-box>
 * ```
 */
@Component({
  selector: "tb-resize-box",
  templateUrl: "./resize-box.component.html",
  styleUrls: ["./resize-box.component.scss"],
  standalone: true,
})
export class ResizeBoxComponent implements OnChanges, OnDestroy {
  /** Never let the browser's native tooltip show on the host. */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;

  /** The box's least height, in px: what it has until its container gives it more, and as far up as it drags. */
  @Input() minHeight = 160;
  /**
   * The height it starts at, in px (grip aside), when more than its least (a script editor: tall to start, still shrunk as far as
   * `minHeight`); a double click on the grip comes back to it. null: the container's.
   */
  @Input() startHeight: number | null = null;

  /** The height it was dragged to, grip included (null: not dragged — the container's). */
  @HostBinding("style.height.px") height: number | null = null;

  @HostBinding("style.min-height.px") get hostMinHeight(): number {
    return this.minHeight + GRIP_HEIGHT_PX;
  }

  /** The grip is being dragged (it stays highlighted while the pointer is off it). */
  dragging = false;
  private startY = 0;
  private dragFrom = 0;
  /** What scrolls round the box (the page's column, a panel's body), where it was as the drag began, and the pointer's last place. */
  private scroller: HTMLElement | null = null;
  private startScroll = 0;
  private lastY = 0;
  private frame = 0;

  constructor(private host: ElementRef<HTMLElement>) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["startHeight"] && this.height === null && this.startHeight !== null) {
      this.reset();
    }
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.frame);
  }

  onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.dragging = true;
    this.startY = this.lastY = event.clientY;
    this.dragFrom = this.currentHeight;
    this.scroller = this.scrollerOf(this.host.nativeElement);
    this.startScroll = this.scroller?.scrollTop ?? 0;
  }

  onPointerMove(event: PointerEvent): void {
    if (this.dragging) {
      this.lastY = event.clientY;
      this.follow();
      this.autoScroll();
    }
  }

  onPointerUp(event: PointerEvent): void {
    if (!this.dragging) {
      return;
    }
    this.dragging = false;
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    const grip = event.currentTarget as HTMLElement;
    if (grip.hasPointerCapture(event.pointerId)) {
      grip.releasePointerCapture(event.pointerId);
    }
  }

  /** The arrow keys, with the grip focused: a step down (taller) or up. */
  nudge(direction: 1 | -1, event: Event): void {
    event.preventDefault();
    this.setHeight(this.currentHeight + direction * KEY_STEP_PX);
  }

  /** Back to the height it starts at (`startHeight`), else the one the container gives it. */
  reset(): void {
    this.height = this.startHeight !== null ? Math.max(this.hostMinHeight, this.startHeight + GRIP_HEIGHT_PX) : null;
  }

  /** The box's height from the pointer's move — and from what's scrolled meanwhile, the grip staying under the pointer. */
  private follow(): void {
    const scrolled = (this.scroller?.scrollTop ?? 0) - this.startScroll;
    this.setHeight(this.dragFrom + this.lastY - this.startY + scrolled);
  }

  /**
   * The grip held near the bottom (or top) of what scrolls round it — of the window, where that's lower: it scrolls on, a frame at a
   * time, faster the nearer the edge, the box growing (or shrinking) with it — so a box at the page's foot still drags taller.
   */
  private autoScroll(): void {
    const scroller = this.scroller;
    if (!scroller || this.frame) {
      return;
    }
    const step = () => {
      this.frame = 0;
      if (!this.dragging) {
        return;
      }
      const box = scroller.getBoundingClientRect();
      const bottom = Math.min(box.bottom, window.innerHeight);
      const top = Math.max(box.top, 0);
      const down = this.lastY > bottom - EDGE_PX && this.lastY >= this.startY;
      const up = this.lastY < top + EDGE_PX && this.lastY < this.startY;
      if (!down && !up) {
        return;
      }
      const near = down ? this.lastY - (bottom - EDGE_PX) : top + EDGE_PX - this.lastY;
      const by = Math.ceil(Math.min(1, near / EDGE_PX) * MAX_SCROLL_PX) * (down ? 1 : -1);
      const before = scroller.scrollTop;
      scroller.scrollTop = before + by;
      this.follow();
      if (scroller.scrollTop !== before || down) {
        this.frame = requestAnimationFrame(step);
      }
    };
    this.frame = requestAnimationFrame(step);
  }

  /** The nearest box round it that scrolls up and down (the page's column, a panel's body); the document's, else. */
  private scrollerOf(el: HTMLElement): HTMLElement | null {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const overflow = getComputedStyle(p).overflowY;
      if (overflow === "auto" || overflow === "scroll") {
        return p;
      }
    }
    return (document.scrollingElement as HTMLElement | null) ?? null;
  }

  /** The box as it stands now (dragged or not), grip included. */
  private get currentHeight(): number {
    return this.host.nativeElement.getBoundingClientRect().height;
  }

  private setHeight(px: number): void {
    this.height = Math.max(this.hostMinHeight, Math.round(px));
  }
}
