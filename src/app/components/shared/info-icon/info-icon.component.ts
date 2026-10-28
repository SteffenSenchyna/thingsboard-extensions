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

import { Component, ElementRef, HostBinding, Input, ViewChild } from "@angular/core";
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";

type InfoAlign = "center" | "left" | "right";

/**
 * Small brand-blue info icon with a themed hover tooltip (same pill style as the
 * chart info icons). The tooltip opens above the icon and, by default, places
 * itself on hover so it stays inside the nearest clipping container (a
 * scrolling panel body, a card with hidden overflow): it slides sideways when
 * an edge is near and flips below the icon when there is no room above.
 * `align` forces a horizontal placement instead ("center" extends equally
 * both ways, "left" extends right from the icon, "right" extends left).
 */
@Component({
  selector: "tb-info-icon",
  templateUrl: "./info-icon.component.html",
  styleUrls: ["./info-icon.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule],
})
export class InfoIconComponent {
  /** Strip the reflected native `title` so the browser shows no tooltip. */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;

  /** Tooltip text. */
  @Input() text = "";
  /** Horizontal placement; "auto" picks whichever keeps the tooltip inside its container. */
  @Input() align: "auto" | InfoAlign = "auto";

  @ViewChild("icon", { static: true }) private iconEl!: ElementRef<HTMLElement>;
  @ViewChild("tip", { static: true }) private tipEl!: ElementRef<HTMLElement>;

  /** The placement in use (set on hover / focus). */
  horizontal: InfoAlign = "center";
  below = false;

  /** Measure the room around the icon and pick where the tooltip opens. */
  place(): void {
    const icon = this.iconEl.nativeElement.getBoundingClientRect();
    const tip = this.tipEl.nativeElement;
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    const clip = this.clipRect(this.iconEl.nativeElement);
    const gap = 8 + 6; // offset from the icon + the caret
    const margin = 4;

    this.below = icon.top - clip.top < h + gap + margin && clip.bottom - icon.bottom >= h + gap + margin;

    if (this.align !== "auto") {
      this.horizontal = this.align;
      return;
    }
    const cx = icon.left + icon.width / 2;
    if (cx - w / 2 >= clip.left + margin && cx + w / 2 <= clip.right - margin) {
      this.horizontal = "center";
    } else if (icon.left - 10 + w <= clip.right - margin) {
      this.horizontal = "left"; // anchored at the icon's left edge, extends right
    } else {
      this.horizontal = "right"; // anchored at the icon's right edge, extends left
    }
  }

  /** The visible area the tooltip must stay in: the nearest clipping ancestor, within the viewport. */
  private clipRect(el: HTMLElement): { top: number; bottom: number; left: number; right: number } {
    let top = 0;
    let left = 0;
    let bottom = window.innerHeight;
    let right = window.innerWidth;
    for (let node = el.parentElement; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      const clips = (v: string) => v === "auto" || v === "scroll" || v === "hidden" || v === "clip";
      if (clips(style.overflowY) || clips(style.overflowX)) {
        const r = node.getBoundingClientRect();
        if (clips(style.overflowY)) {
          top = Math.max(top, r.top);
          bottom = Math.min(bottom, r.bottom);
        }
        if (clips(style.overflowX)) {
          left = Math.max(left, r.left);
          right = Math.min(right, r.right);
        }
      }
    }
    return { top, bottom, left, right };
  }
}
