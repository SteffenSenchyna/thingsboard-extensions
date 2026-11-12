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

import { Component, EventEmitter, Input, OnChanges, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";

/** One entry of a {@link SectionNavComponent}. */
export interface SectionNavItem {
  id: string;
  label: string;
  /** Material icon before the label. */
  icon?: string;
  /** Count badge after the label (an app's active alarms); hidden when 0 / unset. */
  badge?: number;
  /** The badge's colour: the status scale (default error). */
  badgeTone?: "error" | "major" | "warning";
  /** A group: its sections, folded under it (the group row opens / closes them; it's no section itself). */
  children?: SectionNavItem[];
}

/**
 * A page's section menu for the sidebar (a settings page's sections): one
 * row per section, the active one tinted, the rows styled like the filters'
 * options so the sidebar reads as one piece. A group row (`children`) folds
 * its sections open / closed with a chevron; every group starts open, and
 * the active section's group opens when a section in it becomes active.
 *
 * ```html
 * <tb-section-nav [items]="sections" [active]="section" (activeChange)="section = $event"></tb-section-nav>
 * ```
 */
@Component({
  selector: "tb-section-nav",
  templateUrl: "./section-nav.component.html",
  styleUrls: ["./section-nav.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule],
})
export class SectionNavComponent implements OnChanges {
  @Input() items: SectionNavItem[] = [];
  @Input() active = "";
  @Output() activeChange = new EventEmitter<string>();

  /** The groups open (by id): each opens as it first appears; the active section's group opens on its own. */
  private expanded = new Set<string>();
  /** The groups already shown (by id) — a fold the user closed stays closed. */
  private seen = new Set<string>();

  ngOnChanges(): void {
    for (const item of this.items) {
      if (item.children?.length && !this.seen.has(item.id)) {
        this.seen.add(item.id);
        this.expanded.add(item.id);
      }
      if (this.hasActive(item)) {
        this.expanded.add(item.id);
      }
    }
  }

  /** The group holds the active section. */
  hasActive(item: SectionNavItem): boolean {
    return !!item.children?.some((c) => c.id === this.active);
  }

  isExpanded(item: SectionNavItem): boolean {
    return this.expanded.has(item.id);
  }

  toggleGroup(id: string): void {
    if (this.expanded.has(id)) {
      this.expanded.delete(id);
    } else {
      this.expanded.add(id);
    }
  }

  select(id: string): void {
    if (id !== this.active) {
      this.activeChange.emit(id);
    }
  }

  trackById(_: number, item: SectionNavItem): string {
    return item.id;
  }
}
