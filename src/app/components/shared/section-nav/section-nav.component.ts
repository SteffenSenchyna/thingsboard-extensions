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
  /**
   * A logo in the icon's place (a platform's group — ThingsBoard, ESF): an SVG's markup, drawn in the icon's colour (its shape
   * alone — a mask), so it follows the theme and lights with its group.
   */
  logo?: string;
  /** Count badge after the label (an app's active alarms); hidden when 0 / unset. */
  badge?: number;
  /** The badge's colour: the status scale (default error). */
  badgeTone?: "error" | "major" | "warning";
  /** A group: its sections, folded under it (the group row opens / closes them; it's no section itself). */
  children?: SectionNavItem[];
  /**
   * A section shown on another's page — one of that page's lists, picked by
   * the button group atop its filters (Access › Users' Groups): no entry of
   * its own in the menu or the rail, that page's entry lit while it shows.
   * Its id stays a section the URL can name.
   */
  shownOn?: string;
}

/** The menu entry a section shows under: its own — or, a section shown on another's page ({@link SectionNavItem.shownOn}), that page's. */
export function sectionEntryOf(items: SectionNavItem[], id: string): string {
  for (const item of items) {
    const found = item.id === id ? item : item.children?.find((c) => c.id === id);
    if (found) {
      return found.shownOn ?? found.id;
    }
  }
  return id;
}

/** A logo's markup as the CSS `url()` its mask takes. */
export function sectionNavLogoUrl(svg: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** A group's entries in a menu: its sections but those shown on another's page. */
export function sectionEntries(children: SectionNavItem[] | undefined): SectionNavItem[] {
  return (children ?? []).filter((c) => !c.shownOn);
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

  /** The menu's rows: the items, a group's sections but those shown on another's page. */
  menu: SectionNavItem[] = [];
  /** Each logo's mask (by its markup), made once. */
  private logoUrls = new Map<string, string>();
  /** The entry lit: the active section's — or the page it shows on ({@link sectionEntryOf}). */
  activeEntry = "";

  /** The groups open (by id): each opens as it first appears; the active section's group opens on its own. */
  private expanded = new Set<string>();
  /** The groups already shown (by id) — a fold the user closed stays closed. */
  private seen = new Set<string>();

  ngOnChanges(): void {
    this.menu = this.items.map((item) => (item.children?.length ? { ...item, children: sectionEntries(item.children) } : item));
    this.activeEntry = sectionEntryOf(this.items, this.active);
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

  /** An item's logo as its mask's `url()` (null: no logo). */
  logoUrl(item: SectionNavItem): string | null {
    if (!item.logo) {
      return null;
    }
    let url = this.logoUrls.get(item.logo);
    if (!url) {
      url = sectionNavLogoUrl(item.logo);
      this.logoUrls.set(item.logo, url);
    }
    return url;
  }

  /** The group holds the active section. */
  hasActive(item: SectionNavItem): boolean {
    return !!item.children?.some((c) => c.id === this.activeEntry);
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

  /** An entry picked: its section — none when it's the one lit (a page showing another of its lists stays on it). */
  select(id: string): void {
    if (id !== this.activeEntry) {
      this.activeChange.emit(id);
    }
  }

  trackById(_: number, item: SectionNavItem): string {
    return item.id;
  }
}
