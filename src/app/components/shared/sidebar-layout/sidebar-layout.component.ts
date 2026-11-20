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
  DestroyRef,
  ElementRef,
  EventEmitter,
  HostBinding,
  HostListener,
  Input,
  NgZone,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
  inject,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { SharedModule } from "@shared/public-api";
import { BottomSheetComponent } from "../bottom-sheet/bottom-sheet.component";
import { DashboardRootDirective } from "../dashboard/dashboard-root.directive";
import { PHONE_TITLE_ACTIONS } from "../dashboard/phone-title-actions";

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
 *
 * On a phone (the dashboard root's `tb-phone`, `tbDashboardRoot`) the sidebar isn't beside the content — which takes the
 * screen's width — but in a sheet from the bottom (`tb-bottom-sheet`, {@link sheetTitle}): a round button floating over the
 * content's bottom-right corner, above the navbar, opens it (whatever `open` says — kept for a wider screen). What the sidebar
 * holds (the search, the filters, a page's view switch, a section menu) is all there, at the sheet's width; a pick that goes
 * somewhere (a section of a `tb-section-nav`, a view of the `tb-segmented-control` atop it) closes the sheet, a filter doesn't.
 */
@Component({
  selector: "tb-sidebar-layout",
  // The wrapper animates its width (and the gap after it) between the sidebar
  // width and 0; the inner panel keeps its full width, so the filters slide
  // out of view instead of reflowing. `inert` keeps a closed sidebar out of
  // the tab order.
  template: `<!-- The sidebar's content: beside the main area, or — a phone — in the sheet (one place at a time). -->
    <ng-template #side><ng-content select="[sidebar]"></ng-content></ng-template>
    <aside *ngIf="!phone" class="sl-sidebar-wrap" [class.sl-closed]="!shown" [class.sl-has-toggle]="collapseToggle && hasSidebar"
           [style.width.px]="shown ? width : 0" [attr.inert]="shown ? null : ''" [attr.aria-hidden]="!shown">
      <div class="sl-sidebar" [style.width.px]="width">
        <ng-container *ngTemplateOutlet="side"></ng-container>
      </div>
    </aside>
    <!-- One glyph, "|→" ("start"), mirrored to "←|" while open: the bar stays on the edge side. None on a phone (its sheet's button). -->
    <button *ngIf="collapseToggle && hasSidebar && !phone" type="button" class="sl-toggle" [class.sl-toggle--closed]="!open"
            [style.left]="open ? 'calc(' + width + 'px - 11px)' : null" [attr.aria-expanded]="open"
            [attr.aria-label]="open ? hideLabel : showLabel" (click)="toggle()">
      <mat-icon>start</mat-icon>
    </button>
    <div class="sl-main" [class.sl-main--toggle]="collapseToggle && hasSidebar && !open && !phone"><ng-content></ng-content></div>
    <!-- A phone: the sidebar in a panel from the right edge (swiped right to close), opened by its button in the title bar
         (\`PHONE_TITLE_ACTIONS\`). -->
    <ng-container *ngIf="phone">
      <tb-bottom-sheet from="right" [open]="sheetOpen && hasSidebar" icon="tune" [title]="sheetTitle" (closed)="sheetOpen = false">
        <div class="sl-sheet">
          <ng-container *ngTemplateOutlet="side"></ng-container>
        </div>
      </tb-bottom-sheet>
    </ng-container>`,
  styleUrls: ["./sidebar-layout.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, BottomSheetComponent],
})
export class SidebarLayoutComponent implements OnChanges, OnInit {
  @Input() open = true;
  /**
   * Whether the current view has a sidebar at all. `false` takes it away at
   * once (and hides the collapse tab) whatever {@link open} says — a page whose
   * open section has no filters — and the content takes the full width; `open`
   * is kept, so the sidebar comes back as it was for the next view that has
   * one. A page change just changes: only the open / close tab slides.
   */
  @Input() hasSidebar = true;
  /** Sidebar width in px (including its right padding). */
  @Input() width = 300;
  /** Show the open / close tab on the sidebar's edge (see the class docs). */
  @Input() collapseToggle = false;
  /** The button's accessible label while open / closed (no tooltip). */
  @Input() hideLabel = "Hide filters";
  @Input() showLabel = "Show filters";
  /** A phone's sheet (the sidebar there): its name. */
  @Input() sheetTitle = "Filters";
  /** A phone's sheet is open. */
  sheetOpen = false;
  /** The tab was clicked: the new open state. */
  @Output() openChange = new EventEmitter<boolean>();

  /**
   * A width change while open (a sidebar growing for a panel beside its
   * filters, e.g. a column picker) and a page with or without a sidebar
   * ({@link hasSidebar}) land at once: only opening and closing (the tab)
   * slide. Set for the frame the new layout paints in, which switches the
   * slide transitions off.
   */
  @HostBinding("class.sl-resizing") resizing = false;

  private readonly cd = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  /** The dashboard's root: whether it's laid out for a phone. */
  private readonly root = inject(DashboardRootDirective, { optional: true });

  private readonly zone = inject(NgZone);
  private readonly hostEl = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
  /** Its button in a phone's title bar (the filters' sheet), while it has one: what takes it out again. */
  private titleAction: (() => void) | null = null;

  constructor() {
    // A phone or not: the layout redrawn with the root's class (before the next paint).
    this.root?.changes.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.sheetOpen = false;
      this.syncTitleAction();
      this.cd.detectChanges();
    });
    this.destroyRef.onDestroy(() => this.setTitleAction(false));
  }

  /** On a phone with a sidebar: its sheet's button in the title bar, next to the alarms — else none. */
  private syncTitleAction(): void {
    this.setTitleAction(this.phone && this.hasSidebar);
  }

  private setTitleAction(on: boolean): void {
    if (on && !this.titleAction) {
      this.titleAction = PHONE_TITLE_ACTIONS.add({
        id: "filters",
        icon: "tune",
        label: this.sheetTitle,
        el: this.hostEl,
        run: () =>
          this.zone.run(() => {
            this.sheetOpen = true;
            this.cd.detectChanges();
          }),
      });
    } else if (!on && this.titleAction) {
      this.titleAction();
      this.titleAction = null;
    }
  }

  /** Laid out for a phone: the sidebar in a sheet. */
  get phone(): boolean {
    return !!this.root?.phone;
  }

  ngOnInit(): void {
    // Made on a phone already (a page opened there): its button from the start.
    this.syncTitleAction();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["hasSidebar"] && !changes["hasSidebar"].firstChange) {
      this.syncTitleAction();
    }
    const widthChanged = changes["width"] && !changes["width"].firstChange && !changes["open"];
    const sidebarChanged = changes["hasSidebar"] && !changes["hasSidebar"].firstChange;
    if (widthChanged || sidebarChanged) {
      this.resizing = true;
      // The first frame paints the new width without a transition; the next lets the slides back.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          this.resizing = false;
          this.cd.markForCheck();
        })
      );
    }
  }

  /** The sidebar is beside the content: the view has one, it's open, and it isn't a phone. */
  get shown(): boolean {
    return this.hasSidebar && this.open && !this.phone;
  }

  /** A tap in a phone's sheet: one that goes somewhere (a section of the menu, a view of the tab group) closes it — a filter doesn't. */
  @HostListener("click", ["$event"])
  onSheetClick(event: MouseEvent): void {
    const target = event.target as Element | null;
    if (this.sheetOpen && target?.closest(".sl-sheet") && target.closest("tb-section-nav button, tb-section-nav a, tb-segmented-control button")) {
      this.sheetOpen = false;
    }
  }

  toggle(): void {
    this.openChange.emit(!this.open);
  }
}
