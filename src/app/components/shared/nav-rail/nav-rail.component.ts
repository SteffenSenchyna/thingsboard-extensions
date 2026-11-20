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

import { guardLeave } from "../dashboard/unsaved-changes";
import { FEEDBACK_RAIL_ID } from "../feedback/feedback.models";
import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  EventEmitter,
  HostBinding,
  HostListener,
  Input,
  NgZone,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
  inject,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { SharedModule } from "@shared/public-api";
import { PHONE_TITLE_ACTIONS, PhoneTitleAction } from "../dashboard/phone-title-actions";
import { WidgetContext } from "@home/models/widget-component.models";
import { DashboardRootDirective } from "../dashboard/dashboard-root.directive";
import { DASHBOARD_PAGE_MOVES } from "../dashboard/page-moves";
import { sectionNavLogoUrl } from "../section-nav/section-nav.component";

/** One entry of a {@link NavRailComponent}. */
export interface NavRailItem {
  id: string;
  /** Material Symbols icon name. */
  icon: string;
  /**
   * A logo in the icon's place (an app's own mark — Aria's): an SVG's markup, drawn in the icon's colour (its shape alone — a
   * mask, as `SectionNavItem.logo`), so it's muted, hovered and lit as an icon is, in both themes. {@link icon} still names it
   * where only an icon will do.
   */
  logo?: string;
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
  /** On a phone: a button of its own in the page's title bar (its icon, its count — the alarms) in place of its drawer entry. */
  phoneTitleButton?: boolean;
  /** Not on a phone (its drawer leaves it out): the development switch and the theme toggle — a tenant administrator's, for a wider screen. */
  phoneHidden?: boolean;
}

/** A phone's drawer: a drag leftwards past this share of its width closes it, as does a flick (px / ms) past a few pixels. */
const DRAWER_CLOSE_SHARE = 0.25;
const DRAWER_CLOSE_SPEED = 0.5;
const DRAWER_CLOSE_MIN_PX = 24;
/** A move this far (px), leftwards and more across than up or down, is a drag of the drawer — less is still a tap. */
const DRAWER_SWIPE_START_PX = 6;

/** The expand / collapse toggle at the rail's foot: its icon and name what a click does. */
const RAIL_EXPAND: NavRailItem = { id: "nr-expand", icon: "left_panel_open", label: "Expand" };
const RAIL_COLLAPSE: NavRailItem = { id: "nr-expand", icon: "left_panel_close", label: "Collapse" };

/** A title bar button's entry (a phone's): a click is the rail's `bottomClick` (`bottom`: the second group's, the foot's). */
interface RailEntry {
  item: NavRailItem;
  bottom: boolean;
}

/**
 * The rail expanded (a list: each entry's icon and name) or collapsed (its icons): the user's pick, the same on every dashboard —
 * kept in their settings, and in this browser (local storage) so a dashboard starts as last shown, before the settings arrive.
 */
export const RAIL_EXPANDED_SETTING = "navRailExpanded";
/** The rail's width, collapsed and expanded (keep in step with `rail.$width` / `$expanded-width`): marked on the dashboard root. */
const RAIL_COLLAPSED_PX = 50;
const RAIL_EXPANDED_PX = 212;
const RAIL_EXPANDED_CACHE_KEY = "tb-ext-rail-expanded";
/** Collapsing, the list look ends with the width's ease (`motion.$expand-duration`, 0.25s) — or after this, should none run. */
const RAIL_EASE_FALLBACK_MS = 400;
/** The divider over the foot (expanded): its room — the line and its margin under it (keep with the stylesheet's `.nr-divider`). */
const FOOT_DIVIDER_ROOM_PX = 17;

function cachedRailExpanded(): boolean {
  try {
    return window.localStorage.getItem(RAIL_EXPANDED_CACHE_KEY) === "1";
  } catch {
    return false; // storage blocked: collapsed, until the settings arrive
  }
}

function cacheRailExpanded(expanded: boolean): void {
  try {
    window.localStorage.setItem(RAIL_EXPANDED_CACHE_KEY, expanded ? "1" : "0");
  } catch {
    // storage blocked: the next load starts collapsed until the settings arrive
  }
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
 * it or one of them is. Expanded (the toggle first at its foot — the user's pick, kept in their settings: {@link ctx}) it's a
 * list: each entry's icon and name, the page shown on the brand tint, an app's pages folding open under it (its own open to
 * start), no bubbles — its width easing open and shut, the list look kept until it has eased shut (nothing jumps). An entry
 * pressed puts its bubble down until the pointer leaves it. On a phone (the dashboard root's `tb-phone`, `tbDashboardRoot`) it's a title bar across the top — the
 * menu button, the page shown by name in its middle, the pieces' buttons (`PHONE_TITLE_ACTIONS`: the filters') and the
 * `phoneTitleButton` entries' (the alarms) at its end — and its list a drawer from the left over the page (its expanded look,
 * whatever the user's pick), swiped left or tapped beside to close. Replaces the
 * filter sidebar where a dashboard has nothing to filter:
 *
 * ```html
 * <tb-nav-rail [items]="views" [active]="view" (activeChange)="selectView($event)"
 *              [bottomItems]="[{ id: 'theme', icon: 'dark_mode', label: 'Dark mode' }]"
 *              (bottomClick)="toggleTheme()"></tb-nav-rail>
 * ```
 */
@Component({
  selector: "tb-nav-rail",
  template: `<!-- The rail's column — on a phone (the dashboard root's \`tb-phone\`), the drawer: from the left over the page, its list
       look, opened from the title bar's menu button, swiped left (or a tap beside it) to close. -->
  <div #column class="nr-column" [class.nr-open]="drawerOpen" [class.nr-dragging]="drawerDragging"
       [style.transform]="drawerDrag < 0 ? 'translateX(' + drawerDrag + 'px)' : null" [attr.inert]="phone && !drawerOpen ? '' : null">
    <!-- The pages and the second group: expanded, scrolling on their own when taller than the rail leaves them — the foot stays
         put under them (a divider over it while they scroll). -->
    <div #scroller class="nr-scroll">
      <div #scrollBody class="nr-scroll-body">
        <nav class="nr" aria-label="Views">
          <ng-container *ngFor="let item of pageItems; trackBy: trackById">
            <span *ngIf="item.divider" class="nr-divider" role="separator"></span>
            <ng-container *ngTemplateOutlet="railItem; context: { $implicit: item, current: isActive(item), bottom: false }"></ng-container>
          </ng-container>
        </nav>
        <!-- The second group (the alarms, Settings): right under the pages, after a divider. -->
        <span *ngIf="groupItems.length && pageItems.length" class="nr-divider" role="separator"></span>
        <div *ngIf="groupItems.length" class="nr nr-bottom">
          <ng-container *ngFor="let item of groupItems; trackBy: trackById">
            <ng-container *ngTemplateOutlet="railItem; context: { $implicit: item, current: active === item.id, bottom: true }"></ng-container>
          </ng-container>
        </div>
      </div>
    </div>
    <span class="nr-divider nr-foot-divider" role="separator"></span>
    <!-- At the rail's foot, apart from both groups: the expand / collapse toggle, the development switch, then the theme toggle,
         Send feedback, Account (\`foot\` ones). -->
    <div #foot class="nr nr-foot">
      <!-- The expand / collapse toggle: a wider screen's (a phone's drawer is the list). -->
      <ng-container *ngIf="!phone">
        <ng-container *ngTemplateOutlet="railItem; context: { $implicit: expandItem, current: false, bottom: true, toggle: true }"></ng-container>
      </ng-container>
      <ng-container *ngFor="let item of footList; trackBy: trackById">
        <ng-container *ngTemplateOutlet="railItem; context: { $implicit: item, current: active === item.id || !!item.on, bottom: true }"></ng-container>
      </ng-container>
    </div>
  </div>

  <!-- A phone: the drawer's scrim (a tap on it closes the drawer), and the title bar across the dashboard's top — the menu button
       (the drawer), the page shown by name in its middle (an app's page with its app muted after it), and its buttons at its end:
       the pieces' under it (the filters' sheet), then the alarms (their count). -->
  <div class="nr-scrim" aria-hidden="true" [class.nr-open]="drawerOpen" (click)="closeDrawer()"></div>
  <header class="nr-top">
    <span class="nr-top-start">
      <button type="button" class="nr-top-action" aria-label="Menu" aria-haspopup="dialog" [attr.aria-expanded]="drawerOpen" (click)="openDrawer()">
        <mat-icon>menu</mat-icon>
      </button>
    </span>
    <span class="nr-top-name">
      <h1 class="nr-top-title">{{ phoneTitle?.title }}</h1>
      <span *ngIf="phoneTitle?.sub" class="nr-top-sub">{{ phoneTitle?.sub }}</span>
    </span>
    <span class="nr-top-actions">
      <button *ngFor="let action of titleActions; trackBy: trackByAction" type="button" class="nr-top-action" [attr.aria-label]="action.label"
              aria-haspopup="dialog" (click)="action.run()">
        <mat-icon>{{ action.icon }}</mat-icon>
      </button>
      <button *ngFor="let entry of headerEntries; trackBy: trackByEntry" type="button" class="nr-top-action" [attr.aria-label]="entry.item.label"
              [class.active]="isCurrent(entry)" (click)="go(entry)">
        <span class="nr-icon-wrap">
          <mat-icon>{{ entry.item.logo ? "" : entry.item.icon }}<span *ngIf="entry.item.logo" class="nr-logo" [style.--nr-logo]="logoUrl(entry.item.logo)"></span></mat-icon>
          <span *ngIf="entry.item.badge" class="nr-badge">{{ entry.item.badge }}</span>
        </span>
      </button>
    </span>
  </header>

  <!-- An entry: its icon (its count on it) and — expanded — its name; collapsed, its name in a bubble beside it, an app's pages a
       menu there (its click: its first page). Expanded, an app's row — its chevron at its end — folds its pages open and shut
       under it, the page shown on the brand tint. -->
  <ng-template #railItem let-item let-current="current" let-bottom="bottom" let-toggle="toggle">
    <span class="nr-item">
      <button class="nr-btn" type="button" [class.active]="current" [class.nr-here]="current && !foldOpen(item)"
              [attr.aria-label]="item.label" [attr.aria-current]="current && item.on === undefined ? 'page' : null"
              [attr.aria-pressed]="item.on ?? null"
              [attr.aria-expanded]="toggle ? expanded : listPicked && item.children?.length ? foldOpen(item) : null"
              (click)="pickItem(item, bottom, toggle, $event)">
        <span class="nr-icon-wrap">
          <mat-icon>{{ item.logo ? "" : item.icon }}<span *ngIf="item.logo" class="nr-logo" [style.--nr-logo]="logoUrl(item.logo)"></span></mat-icon>
          <span *ngIf="item.badge" class="nr-badge">{{ item.badge }}</span>
        </span>
        <span class="nr-label">{{ item.label }}</span>
        <mat-icon *ngIf="item.children?.length" class="nr-chevron" [class.open]="foldOpen(item)" aria-hidden="true">expand_more</mat-icon>
      </button>
      <span *ngIf="!item.children?.length" class="nr-tooltip">{{ item.label }}</span>
      <!-- Its pages: a menu beside it (in the tooltip's place), the active one marked. -->
      <div *ngIf="item.children?.length" class="nr-flyout" role="menu" [attr.aria-label]="item.label">
        <span class="nr-flyout-title">{{ item.label }}</span>
        <button *ngFor="let child of item.children; trackBy: trackById" type="button" role="menuitem" class="nr-flyout-item"
                [class.active]="active === child.id" [attr.aria-current]="active === child.id ? 'page' : null" (click)="select(child.id)">
          <mat-icon>{{ child.logo ? "" : child.icon }}<span *ngIf="child.logo" class="nr-logo" [style.--nr-logo]="logoUrl(child.logo)"></span></mat-icon>
          <span>{{ child.label }}</span>
        </button>
      </div>
    </span>
    <!-- Expanded: its pages under it, folding open and shut with the collapsible cards' motion (kept in the DOM — collapsed
         too, shut and taking no room, so they fold open and shut in step with the rail's width; inert while shut), the page
         shown on the brand tint. -->
    <div *ngIf="item.children?.length" class="nr-pages-fold" [class.open]="foldOpen(item)" [attr.inert]="foldOpen(item) ? null : ''">
      <div class="nr-pages-clip">
        <div class="nr-pages" role="group" [attr.aria-label]="item.label">
          <button *ngFor="let child of item.children; trackBy: trackById" type="button" class="nr-page" [class.active]="active === child.id"
                  [attr.aria-current]="active === child.id ? 'page' : null" (click)="pickPage(child.id)">
            <mat-icon>{{ child.logo ? "" : child.icon }}<span *ngIf="child.logo" class="nr-logo" [style.--nr-logo]="logoUrl(child.logo)"></span></mat-icon>
            <span class="nr-page-label">{{ child.label }}</span>
            <span *ngIf="child.badge" class="nr-page-count">{{ child.badge }}</span>
          </button>
        </div>
      </div>
    </div>
  </ng-template>`,
  styleUrls: ["./nav-rail.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule],
})
export class NavRailComponent implements OnChanges, AfterViewInit {
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

  /** Expanded: a list (each entry's icon and name) — the user's pick ({@link toggleExpanded}), as last shown in this browser to start. */
  expanded = cachedRailExpanded();

  /** Its width: as wide as the list while expanded (`nr-wide` — easing open and shut; a phone's is the drawer's). */
  @HostBinding("class.nr-wide") get wide(): boolean {
    return this.expanded;
  }

  /**
   * Collapsing: the list look stays while the width eases shut — each icon where it stands, the names cut at the rail's edge, an
   * app's pages folding shut — and gives way to the collapsed look once it's in (its icons centred in the rail: switched while
   * the rail was still wide, they jumped to its middle and slid back). Ends with the width's ease, or {@link RAIL_EASE_FALLBACK_MS}.
   */
  private easingShut = false;
  private easeTimer: ReturnType<typeof setTimeout> | undefined;

  /** The list look shown: expanded, a phone's drawer (always a list there), or easing shut ({@link easingShut}). */
  @HostBinding("class.nr-expanded") get listView(): boolean {
    return this.listPicked || this.easingShut;
  }

  /** The list look as picked: expanded, or a phone's drawer — what an entry's click and an app's pages go by. */
  get listPicked(): boolean {
    return this.expanded || this.phone;
  }

  /**
   * The pages and the second group reach the foot — less room left between them than a divider takes, or past it (they scroll):
   * in the list look, a divider over the foot. Its class (`nr-crowded`) is set on the host straight from the size watch — a host
   * binding is refreshed with the dashboard's view, which a size change doesn't run (the divider showed only later).
   */
  private crowded = false;
  @ViewChild("scroller", { static: true }) private scroller!: ElementRef<HTMLElement>;
  @ViewChild("scrollBody", { static: true }) private scrollBody!: ElementRef<HTMLElement>;
  @ViewChild("foot", { static: true }) private foot!: ElementRef<HTMLElement>;

  /** The dashboard's widget context: the rail's expanded / collapsed read from the user's settings, and kept there as it's toggled. */
  @Input() set ctx(ctx: WidgetContext | null | undefined) {
    this.widgetCtx = ctx ?? null;
    if (!ctx || this.settingsRead) {
      return;
    }
    this.settingsRead = true;
    ctx.userSettingsService
      .loadUserSettings()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((settings: any) => {
        // Toggled meanwhile (a first load: no pick in this browser yet, the read slow): the user's click stands — a read that
        // lands after it would put the rail back.
        const saved = settings?.[RAIL_EXPANDED_SETTING];
        if (!this.toggled && typeof saved === "boolean" && saved !== this.expanded) {
          this.setExpanded(saved);
          this.cd.markForCheck();
        }
      });
  }

  private widgetCtx: WidgetContext | null = null;
  private settingsRead = false;
  /** The user has toggled the rail here: their pick stands over the settings' read. */
  private toggled = false;

  /** The toggle first at the rail's foot: its icon and name what it does. */
  get expandItem(): NavRailItem {
    return this.expanded ? RAIL_COLLAPSE : RAIL_EXPAND;
  }

  /** Expand / collapse: shown at once, kept in the user's settings (and this browser's, for the next start). */
  toggleExpanded(): void {
    this.toggled = true;
    this.setExpanded(!this.expanded);
    this.widgetCtx?.userSettingsService.putUserSettings({ [RAIL_EXPANDED_SETTING]: this.expanded } as any).subscribe({ error: () => undefined });
  }

  /** Expanded or collapsed (the toggle, the settings' read): its width easing — collapsing, the list look kept meanwhile ({@link easingShut}). */
  private setExpanded(expanded: boolean): void {
    this.expanded = expanded;
    cacheRailExpanded(expanded);
    this.markWidth();
    clearTimeout(this.easeTimer);
    this.easingShut = !expanded && !this.phone;
    if (this.easingShut) {
      this.easeTimer = setTimeout(() => this.endEase(), RAIL_EASE_FALLBACK_MS);
    }
  }

  /** The width has eased shut: the collapsed look. */
  private endEase(): void {
    clearTimeout(this.easeTimer);
    if (!this.easingShut) {
      return;
    }
    this.zone.run(() => {
      this.easingShut = false;
      this.cd.markForCheck();
    });
  }

  /**
   * An entry pressed: its bubble goes down and stays down until the pointer leaves it — collapsing brings the toggle back under
   * a pointer resting on its icon, and the hover alone would pop its bubble again.
   */
  private holdTipDown(event: MouseEvent | undefined): void {
    const entry = (event?.currentTarget as HTMLElement | null)?.closest<HTMLElement>(".nr-item");
    if (!entry || entry.classList.contains("nr-pressed")) {
      return;
    }
    entry.classList.add("nr-pressed");
    this.zone.runOutsideAngular(() => entry.addEventListener("mouseleave", () => entry.classList.remove("nr-pressed"), { once: true }));
  }

  /** Expanded: the apps whose pages the user folded open, and those they folded shut (the page shown's own starts open). */
  private readonly pagesOpened = new Set<string>();
  private readonly pagesFolded = new Set<string>();

  /** An app's pages show under it (expanded): folded open by the user, or its page is the one shown and they haven't shut it. */
  pagesShown(item: NavRailItem): boolean {
    if (!item.children?.length) {
      return false;
    }
    return this.pagesOpened.has(item.id) || (this.isActive(item) && !this.pagesFolded.has(item.id));
  }

  /** An app's pages folded open as shown: in the list look as picked (collapsing, they fold shut as the width eases). */
  foldOpen(item: NavRailItem): boolean {
    return this.listPicked && this.pagesShown(item);
  }

  /**
   * An entry's click: the toggle expands / collapses the rail; an app (with pages) folds them open or shut while expanded, and —
   * collapsed — opens its first page; any other a page selected, or the second group's / the foot's `bottomClick`. Its bubble
   * goes down ({@link holdTipDown}).
   */
  pickItem(item: NavRailItem, bottom: boolean, toggle: boolean, event?: MouseEvent): void {
    this.holdTipDown(event);
    if (toggle) {
      this.toggleExpanded();
      return;
    }
    if (item.children?.length) {
      if (this.listPicked) {
        this.togglePages(item);
      } else {
        this.select(item.children[0].id);
      }
      return;
    }
    // A phone's drawer closes as it goes somewhere (an app's pages only fold).
    this.closeDrawer();
    if (bottom) {
      this.bottomPick(item.id);
    } else {
      this.select(item.id);
    }
  }

  /** The rail's entries that open something over the page (a panel, a dialog) or flip the theme — the page stays: nothing to guard. */
  private static readonly STAYS = new Set(["alarms", "theme", FEEDBACK_RAIL_ID]);

  /** A second group's / the foot's entry: one that goes somewhere asks first with unapplied edits (`guardLeave`). */
  private bottomPick(id: string): void {
    if (NavRailComponent.STAYS.has(id)) {
      this.bottomClick.emit(id);
    } else {
      guardLeave(() => this.bottomClick.emit(id));
    }
  }


  /** An app's row (expanded): its pages folded open or shut (nothing opened). */
  togglePages(item: NavRailItem): void {
    if (this.pagesShown(item)) {
      this.pagesOpened.delete(item.id);
      this.pagesFolded.add(item.id);
    } else {
      this.pagesFolded.delete(item.id);
      this.pagesOpened.add(item.id);
    }
  }

  /**
   * In the list as shown: on a phone, the drawer leaves out what has a button of its own in the title bar (`phoneTitleButton`:
   * the alarms) and what isn't for a phone (`phoneHidden`: the development switch, the theme toggle).
   */
  private readonly listed = (i: NavRailItem): boolean => !this.phone || (!i.phoneHidden && !i.phoneTitleButton);

  /** The pages as shown (a phone's drawer: see {@link listed}). */
  get pageItems(): NavRailItem[] {
    return this.phone ? this.items.filter(this.listed) : this.items;
  }

  /** The second group as shown: the `bottomItems` that aren't `foot` ones (a phone's drawer: see {@link listed}). */
  get groupItems(): NavRailItem[] {
    return this.bottomItems.filter((i) => !i.foot && this.listed(i));
  }

  /** The rail's foot as shown: `footItems`, then the `foot` ones of `bottomItems` (the last at the bottom edge; a phone's: see {@link listed}). */
  get footList(): NavRailItem[] {
    return [...this.footItems, ...this.bottomItems.filter((i) => i.foot)].filter(this.listed);
  }

  // -- a phone: the title bar and the drawer ------------------------------------------

  /** The title bar's buttons on a phone (`phoneTitleButton`: the alarms), at its end. */
  headerEntries: RailEntry[] = [];
  /** The title bar's buttons the pieces under it put there (the filters' sheet, `PHONE_TITLE_ACTIONS`), before the alarms. */
  titleActions: PhoneTitleAction[] = [];
  /** A phone's drawer (the rail's column) is open; dragged leftwards this far (px, ≤ 0) — it follows the finger. */
  drawerOpen = false;
  drawerDrag = 0;
  drawerDragging = false;

  @ViewChild("column", { static: true }) private column!: ElementRef<HTMLElement>;
  private readonly host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
  private readonly cd = inject(ChangeDetectorRef);
  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);
  /** The dashboard's root: whether it's laid out for a phone (the title bar, the drawer). */
  private readonly root = inject(DashboardRootDirective, { optional: true });

  constructor() {
    // A phone or not: the drawer shut, the rail drawn again (before the next paint).
    this.root?.changes.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.drawerOpen = false;
      this.drawerDrag = 0;
      this.cd.detectChanges();
    });
  }

  /** Laid out for a phone: a title bar across the top, the rail a drawer from the left. */
  get phone(): boolean {
    return !!this.root?.phone;
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Another page lit (not the first one shown): the side panels open in this rail's dashboard close — told once this
    // check is through, as their owners change state when they close.
    const moved = changes["active"];
    if (moved && !moved.firstChange && moved.previousValue && moved.previousValue !== moved.currentValue) {
      const root = this.host.closest("[tbdashboardroot]") ?? this.host.parentElement;
      if (root) {
        void Promise.resolve().then(() => DASHBOARD_PAGE_MOVES.next(root));
      }
    }
    // Every entry, as given (the drawer's lists leave out the ones with a title-bar button).
    const entries: RailEntry[] = [
      ...this.items.map((item) => ({ item, bottom: false })),
      ...[...this.bottomItems, ...this.footItems].map((item) => ({ item, bottom: true })),
    ];
    this.headerEntries = entries.filter((e) => e.item.phoneTitleButton);
  }

  /** The rail's width on the dashboard root (`--tb-rail-width`): what's placed past the rail (the toasts) follows it. */
  private markWidth(): void {
    this.host.parentElement?.style.setProperty("--tb-rail-width", `${this.expanded ? RAIL_EXPANDED_PX : RAIL_COLLAPSED_PX}px`);
  }

  ngAfterViewInit(): void {
    // The pieces' title bar buttons inside this rail's dashboard root (an app nested in it too) — again as they come and go.
    const syncActions = () => {
      const next = PHONE_TITLE_ACTIONS.within(this.host.parentElement);
      if (next.length !== this.titleActions.length || next.some((a, i) => a !== this.titleActions[i])) {
        this.titleActions = next;
        this.cd.detectChanges();
      }
    };
    syncActions();
    const actionsSub = PHONE_TITLE_ACTIONS.changes.subscribe(() => syncActions());
    this.destroyRef.onDestroy(() => actionsSub.unsubscribe());
    this.markWidth();
    this.watchDrawerSwipe();
    // The width eased shut: the collapsed look (only the host's own width — its entries' transitions bubble here too; outside
    // Angular, so a hover's doesn't run change detection).
    const onEaseEnd = (e: TransitionEvent) => {
      if (e.target === this.host && e.propertyName === "width") {
        this.endEase();
      }
    };
    this.zone.runOutsideAngular(() => this.host.addEventListener("transitionend", onEaseEnd));
    this.destroyRef.onDestroy(() => {
      this.host.removeEventListener("transitionend", onEaseEnd);
      clearTimeout(this.easeTimer);
    });
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    // The rail's height, the scrolling part's and its content's (an app's pages folding open): whether it meets the foot.
    const scrollWatch = new ResizeObserver(() => this.checkCrowded());
    scrollWatch.observe(this.host);
    scrollWatch.observe(this.scroller.nativeElement);
    scrollWatch.observe(this.scrollBody.nativeElement);
    this.destroyRef.onDestroy(() => scrollWatch.disconnect());
  }

  /**
   * Whether the pages and the second group meet the foot: the room between the scrolling part's top and the foot's (a divider's
   * place, whether it shows or not — so showing it never changes the answer) less their content's height, under what a divider
   * takes. Marked on the host only as it changes.
   */
  private checkCrowded(): void {
    const scroller = this.scroller.nativeElement;
    if (!scroller.clientHeight) {
      return; // hidden (a phone's drawer, shut)
    }
    const free = this.foot.nativeElement.offsetTop - scroller.offsetTop - this.scrollBody.nativeElement.offsetHeight;
    const crowded = free < FOOT_DIVIDER_ROOM_PX;
    if (crowded !== this.crowded) {
      this.crowded = crowded;
      this.host.classList.toggle("nr-crowded", crowded);
    }
  }

  /** A phone's title bar: the page shown — an entry's page (an app's) with its entry after it; none while no entry is the page. */
  get phoneTitle(): { title: string; sub: string } | null {
    for (const item of this.items) {
      const page = item.children?.find((c) => c.id === this.active);
      if (page) {
        return { title: page.label, sub: item.label };
      }
      if (item.id === this.active) {
        return { title: item.label, sub: "" };
      }
    }
    const other = [...this.bottomItems, ...this.footItems].find((i) => i.id === this.active);
    return other ? { title: other.label, sub: "" } : null;
  }

  /** A title bar button lit: the page shown is it or one of its pages (a switch: while on). */
  isCurrent(entry: RailEntry): boolean {
    return entry.bottom ? this.active === entry.item.id || !!entry.item.on : this.isActive(entry.item);
  }

  /** A phone's drawer: open (the title bar's menu button). */
  openDrawer(): void {
    this.drawerDrag = 0;
    this.drawerOpen = true;
  }

  closeDrawer(): void {
    this.drawerOpen = false;
  }

  /** A page of an app (the list's, expanded or a phone's drawer): opened — the drawer closing. */
  pickPage(id: string): void {
    this.closeDrawer();
    this.select(id);
  }

  @HostListener("document:keydown.escape")
  onEscape(): void {
    this.closeDrawer();
  }

  /**
   * A phone's drawer swiped away: touch events on it — a move leftwards, more across than up or down (that's its list's scroll),
   * is the drawer's (a non-passive listener, so it can stop the scroll): it follows the finger, closing past a quarter of its
   * width or with a flick; a short drag springs back.
   */
  private watchDrawerSwipe(): void {
    const el = this.column.nativeElement;
    let drag: { startX: number; startY: number; lastX: number; lastT: number; speed: number; taken: boolean } | null = null;
    const start = (e: TouchEvent) => {
      drag = null;
      if (!this.phone || !this.drawerOpen || e.touches.length !== 1) {
        return;
      }
      const t = e.touches[0];
      drag = { startX: t.clientX, startY: t.clientY, lastX: t.clientX, lastT: e.timeStamp, speed: 0, taken: false };
    };
    const move = (e: TouchEvent) => {
      const d = drag;
      if (!d || e.touches.length !== 1) {
        return;
      }
      const t = e.touches[0];
      const dx = t.clientX - d.startX;
      const dy = t.clientY - d.startY;
      if (!d.taken) {
        if (Math.abs(dx) < DRAWER_SWIPE_START_PX && Math.abs(dy) < DRAWER_SWIPE_START_PX) {
          return;
        }
        if (dx >= 0 || Math.abs(dy) >= -dx) {
          drag = null;
          return;
        }
        d.taken = true;
      }
      if (e.cancelable) {
        e.preventDefault();
      }
      const dt = Math.max(1, e.timeStamp - d.lastT);
      d.speed = (t.clientX - d.lastX) / dt;
      d.lastX = t.clientX;
      d.lastT = e.timeStamp;
      this.zone.run(() => {
        this.drawerDragging = true;
        this.drawerDrag = Math.min(0, dx);
        this.cd.detectChanges();
      });
    };
    const end = () => {
      const d = drag;
      drag = null;
      if (!d?.taken || !this.drawerDragging) {
        return;
      }
      const width = el.offsetWidth || 1;
      const close = -this.drawerDrag > width * DRAWER_CLOSE_SHARE || (-this.drawerDrag > DRAWER_CLOSE_MIN_PX && d.speed < -DRAWER_CLOSE_SPEED);
      this.zone.run(() => {
        // Let go: it slides on out from where it is (closing), or springs back.
        this.drawerDragging = false;
        this.drawerDrag = 0;
        if (close) {
          this.drawerOpen = false;
        }
        this.cd.detectChanges();
      });
    };
    const listeners: [string, EventListener, AddEventListenerOptions][] = [
      ["touchstart", start as EventListener, { passive: true }],
      ["touchmove", move as EventListener, { passive: false }],
      ["touchend", end, { passive: true }],
      ["touchcancel", end, { passive: true }],
    ];
    this.zone.runOutsideAngular(() => listeners.forEach(([type, fn, opts]) => el.addEventListener(type, fn, opts)));
    this.destroyRef.onDestroy(() => listeners.forEach(([type, fn]) => el.removeEventListener(type, fn)));
  }

  /** A title bar button's own click: a page selected, or the second group's / the foot's `bottomClick`. */
  go(entry: RailEntry): void {
    if (entry.bottom) {
      this.bottomPick(entry.item.id);
    } else {
      this.select(entry.item.id);
    }
  }

  trackByAction(_: number, action: PhoneTitleAction): string {
    return action.id;
  }

  trackByEntry(_: number, entry: RailEntry): string {
    return entry.item.id;
  }

  /** A page picked: moved to — once a page with unapplied edits has been told to drop them (`guardLeave`). */
  select(id: string): void {
    if (id !== this.active) {
      guardLeave(() => this.activeChange.emit(id));
    }
  }

  /** An item is active while it, or one of its pages, is. */
  isActive(item: NavRailItem): boolean {
    return this.active === item.id || !!item.children?.some((c) => c.id === this.active);
  }

  trackById(_: number, item: NavRailItem): string {
    return item.id;
  }

  /** Each logo's mask (by its markup), made once. */
  private readonly logoUrls = new Map<string, string>();

  /** An entry's logo ({@link NavRailItem.logo}) as its mask's `url()`. */
  logoUrl(svg: string): string {
    let url = this.logoUrls.get(svg);
    if (!url) {
      url = sectionNavLogoUrl(svg);
      this.logoUrls.set(svg, url);
    }
    return url;
  }
}
