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
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";

/** One entry of a {@link NavRailComponent}. */
export interface NavRailItem {
  id: string;
  /** Material Symbols icon name. */
  icon: string;
  /** Hover tooltip (and accessible label). */
  label: string;
  /** Count badge on the icon; hidden when 0 / unset. */
  badge?: number;
  /** A divider before it (a group of its own). */
  divider?: boolean;
  /** Its pages (an app's, in the Home dashboard's rail): a menu beside it on hover, in place of its tooltip — a page picked opens it. */
  children?: NavRailItem[];
  /** A switch (a `footItems` one — the Home dashboard's development version): marked as the active page while on. */
  on?: boolean;
  /** A `bottomItems` one shown at the rail's foot instead (the theme toggle, Send feedback, Account), after `footItems`. */
  foot?: boolean;
}

/**
 * Compact vertical icon rail for switching a dashboard's views (UniFi style):
 * one round icon button per view, the active one ringed in brand blue, each
 * with a navy tooltip to its right; a second group (`bottomItems`: the
 * alarms, Settings) right under the pages, after a short divider; the foot
 * at its bottom edge (`footItems`: the development switch — then the theme
 * toggle, Send feedback, Account: `foot` items, the last at the edge). An item may start a group of its own (`divider`: the Home
 * dashboard's apps) and carry pages of its own (`children`): hovered or
 * focused, they open as a menu beside it (the tooltip's navy, its name on
 * top) — the active one marked, a click opens it; the item is active while
 * it or one of them is. Replaces the filter sidebar where a dashboard has nothing
 * to filter:
 *
 * ```html
 * <tb-nav-rail [items]="views" [active]="view" (activeChange)="selectView($event)"
 *              [bottomItems]="[{ id: 'theme', icon: 'dark_mode', label: 'Dark mode' }]"
 *              (bottomClick)="toggleTheme()"></tb-nav-rail>
 * ```
 */
@Component({
  selector: "tb-nav-rail",
  template: `<nav class="nr" aria-label="Views">
    <ng-container *ngFor="let item of items; trackBy: trackById">
      <span *ngIf="item.divider" class="nr-divider" role="separator"></span>
      <ng-container *ngTemplateOutlet="railItem; context: { $implicit: item, current: isActive(item), bottom: false }"></ng-container>
    </ng-container>
  </nav>
  <!-- The second group (the alarms, Settings): right under the pages, after a divider. -->
  <span *ngIf="groupItems.length && items.length" class="nr-divider" role="separator"></span>
  <div *ngIf="groupItems.length" class="nr nr-bottom">
    <ng-container *ngFor="let item of groupItems; trackBy: trackById">
      <ng-container *ngTemplateOutlet="railItem; context: { $implicit: item, current: active === item.id, bottom: true }"></ng-container>
    </ng-container>
  </div>
  <!-- At the rail's foot, apart from both groups: the development switch, then the theme toggle, Send feedback, Account (\`foot\` ones). -->
  <div *ngIf="footList.length" class="nr nr-foot">
    <ng-container *ngFor="let item of footList; trackBy: trackById">
      <ng-container *ngTemplateOutlet="railItem; context: { $implicit: item, current: active === item.id || !!item.on, bottom: true }"></ng-container>
    </ng-container>
  </div>
  <ng-template #railItem let-item let-current="current" let-bottom="bottom">
    <span class="nr-item">
      <button class="nr-btn" type="button" [class.active]="current" [attr.aria-label]="item.label"
              [attr.aria-current]="current && item.on === undefined ? 'page' : null" [attr.aria-pressed]="item.on ?? null"
              (click)="bottom ? bottomClick.emit(item.id) : select(item.id)">
        <span class="nr-icon-wrap">
          <mat-icon>{{ item.icon }}</mat-icon>
          <span *ngIf="item.badge" class="nr-badge">{{ item.badge }}</span>
        </span>
      </button>
      <span *ngIf="!item.children?.length" class="nr-tooltip">{{ item.label }}</span>
      <!-- Its pages: a menu beside it (in the tooltip's place), the active one marked. -->
      <div *ngIf="item.children?.length" class="nr-flyout" role="menu" [attr.aria-label]="item.label">
        <span class="nr-flyout-title">{{ item.label }}</span>
        <button *ngFor="let child of item.children; trackBy: trackById" type="button" role="menuitem" class="nr-flyout-item"
                [class.active]="active === child.id" [attr.aria-current]="active === child.id ? 'page' : null" (click)="select(child.id)">
          <mat-icon>{{ child.icon }}</mat-icon>
          <span>{{ child.label }}</span>
        </button>
      </div>
    </span>
  </ng-template>`,
  styleUrls: ["./nav-rail.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule],
})
export class NavRailComponent {
  /** Never let the browser's native tooltip show on the host. */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;

  @Input() items: NavRailItem[] = [];
  @Input() active = "";
  @Output() activeChange = new EventEmitter<string>();
  /**
   * The second group — the alarms, Settings — under the pages, after a divider; clicks emit `bottomClick`. Its `foot`
   * ones (the theme toggle, Send feedback, Account) show at the rail's foot instead, after {@link footItems}.
   */
  @Input() bottomItems: NavRailItem[] = [];
  /** At the rail's foot, apart from both groups, before the `foot` ones — the Home dashboard's development switch; clicks emit `bottomClick` too. */
  @Input() footItems: NavRailItem[] = [];
  @Output() bottomClick = new EventEmitter<string>();

  /** The second group as shown: the `bottomItems` that aren't `foot` ones. */
  get groupItems(): NavRailItem[] {
    return this.bottomItems.filter((i) => !i.foot);
  }

  /** The rail's foot as shown: `footItems`, then the `foot` ones of `bottomItems` (the last at the bottom edge). */
  get footList(): NavRailItem[] {
    return [...this.footItems, ...this.bottomItems.filter((i) => i.foot)];
  }

  select(id: string): void {
    if (id !== this.active) {
      this.activeChange.emit(id);
    }
  }

  /** An item is active while it, or one of its pages, is. */
  isActive(item: NavRailItem): boolean {
    return this.active === item.id || !!item.children?.some((c) => c.id === this.active);
  }

  trackById(_: number, item: NavRailItem): string {
    return item.id;
  }
}
