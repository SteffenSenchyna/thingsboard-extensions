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

import { Component, EventEmitter, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";

/**
 * Two-pane layout: a fixed-width left sidebar (divided from the content by a
 * rule) and a flexible main area that fills the rest. {@link open} collapses the
 * sidebar so the content takes the full width — sliding closed / open with the
 * same shared expand timing as the collapsible cards. The sidebar stays mounted, so its
 * state (search text, scroll) survives a collapse.
 *
 * ```html
 * <tb-sidebar-layout [open]="sidebarOpen">
 *   <div sidebar>…filters…</div>
 *   …main content…
 * </tb-sidebar-layout>
 * ```
 *
 * {@link collapseToggle} adds the open / close control (UniFi style): a small
 * bordered button at the top of the sidebar's divider — "←|" — that, once
 * closed, sits at the layout's left edge — "|→" — in the 16px gutter the main
 * column frames the layout with, so the content takes the full width. Bind
 * `[(open)]`.
 */
@Component({
  selector: "tb-sidebar-layout",
  // The wrapper animates its width (and the gap after it) between the sidebar
  // width and 0; the inner panel keeps its full width, so the filters slide
  // out of view instead of reflowing. `inert` keeps a closed sidebar out of
  // the tab order.
  template: `<aside class="sl-sidebar-wrap" [class.sl-closed]="!open" [class.sl-has-toggle]="collapseToggle"
             [style.width.px]="open ? width : 0" [attr.inert]="open ? null : ''" [attr.aria-hidden]="!open">
      <div class="sl-sidebar" [style.width.px]="width">
        <ng-content select="[sidebar]"></ng-content>
      </div>
    </aside>
    <!-- One glyph, "|→" ("start"), mirrored to "←|" while open: the bar stays on the edge side. -->
    <button *ngIf="collapseToggle" type="button" class="sl-toggle" [class.sl-toggle--closed]="!open"
            [style.left]="open ? 'calc(' + width + 'px - 11px)' : null" [attr.aria-expanded]="open"
            [attr.aria-label]="open ? hideLabel : showLabel" (click)="toggle()">
      <mat-icon>start</mat-icon>
    </button>
    <div class="sl-main" [class.sl-main--toggle]="collapseToggle && !open"><ng-content></ng-content></div>`,
  styleUrls: ["./sidebar-layout.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule],
})
export class SidebarLayoutComponent {
  @Input() open = true;
  /** Sidebar width in px (including its right padding). */
  @Input() width = 300;
  /** Show the open / close tab on the sidebar's edge (see the class docs). */
  @Input() collapseToggle = false;
  /** The button's accessible label while open / closed (no tooltip). */
  @Input() hideLabel = "Hide filters";
  @Input() showLabel = "Show filters";
  /** The tab was clicked: the new open state. */
  @Output() openChange = new EventEmitter<boolean>();

  toggle(): void {
    this.openChange.emit(!this.open);
  }
}
