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

import { Component, ElementRef, HostBinding, Input } from "@angular/core";

/** The grip's height under the box — keep in step with `$grip-height` in the SCSS. */
const GRIP_HEIGHT_PX = 10;
/** How far an arrow key moves the grip. */
const KEY_STEP_PX = 24;

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
export class ResizeBoxComponent {
  /** Never let the browser's native tooltip show on the host. */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;

  /** The box's least height, in px: what it has until its container gives it more, and as far up as it drags. */
  @Input() minHeight = 160;

  /** The height it was dragged to, grip included (null: not dragged — the container's). */
  @HostBinding("style.height.px") height: number | null = null;

  @HostBinding("style.min-height.px") get hostMinHeight(): number {
    return this.minHeight + GRIP_HEIGHT_PX;
  }

  /** The grip is being dragged (it stays highlighted while the pointer is off it). */
  dragging = false;
  private startY = 0;
  private startHeight = 0;

  constructor(private host: ElementRef<HTMLElement>) {}

  onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.dragging = true;
    this.startY = event.clientY;
    this.startHeight = this.currentHeight;
  }

  onPointerMove(event: PointerEvent): void {
    if (this.dragging) {
      this.setHeight(this.startHeight + event.clientY - this.startY);
    }
  }

  onPointerUp(event: PointerEvent): void {
    if (!this.dragging) {
      return;
    }
    this.dragging = false;
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

  /** Back to the height the container gives it. */
  reset(): void {
    this.height = null;
  }

  /** The box as it stands now (dragged or not), grip included. */
  private get currentHeight(): number {
    return this.host.nativeElement.getBoundingClientRect().height;
  }

  private setHeight(px: number): void {
    this.height = Math.max(this.hostMinHeight, Math.round(px));
  }
}
