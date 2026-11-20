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
  OnDestroy,
  Output,
  SimpleChanges,
  inject,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { SharedModule } from "@shared/public-api";
import { ROW_HOVER_CLASS, clickableRowUnder, scrollBoxUnder } from "./side-panel-outside-click";
import { DashboardRootDirective, PHONE_CLASS, markSheetOpen } from "../dashboard/dashboard-root.directive";
import { DASHBOARD_PAGE_MOVES } from "../dashboard/page-moves";

/** A phone's panel (from the right edge): a drag rightwards past this share of its width closes it… */
const SWIPE_CLOSE_SHARE = 0.25;
/** …as does a flick (px / ms) past a few pixels. */
const SWIPE_CLOSE_SPEED = 0.5;
const SWIPE_CLOSE_MIN_PX = 24;
/**
 * What takes a finger's sideways move itself (a phone's panel): the charts and the heat maps — the move scrubs them (their
 * time, their readings) — the sliders (`tb-slider-stepper`'s range, a `mat-slider`) — the move slides them — and anything
 * marked `data-tb-own-swipe`: a swipe right from there never closes the panel.
 */
const OWN_SWIPE = [
  "tb-line-chart",
  "tb-bar-chart",
  "tb-trend-chart",
  "tb-donut-chart",
  "tb-hour-heatmap",
  "tb-calendar-heatmap",
  'input[type="range"]',
  "mat-slider",
  "[data-tb-own-swipe]",
].join(", ");

/** A move this far (px), rightwards and more across than up or down, is a drag of the panel — less is still a tap. */
const SWIPE_START_PX = 6;

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
 * On a phone (the dashboard root's `tb-phone`) it's a sheet from the bottom
 * instead — the dashboard's width, a strip of the page left showing above it
 * (the panels' trail in it), a grab handle on top — that rises over a scrim
 * and closes with a swipe down (from its header, or from its body scrolled to
 * the top: it follows the finger and closes past a quarter of its height, or a
 * flick; a short drag springs back), a tap on the scrim, the close button or
 * Escape.
 *
 * A panel opening as another closes takes its place at once (no slide) — the
 * panels of a trail (`tb-panel-trail`) swap so. A {@link dismissible} panel's
 * scrim passes a click on a clickable table row on to the row, which then
 * opens in the panel's place; any other click-off does nothing — the panel
 * stays open until its close button or Escape.
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
  /** Show a backdrop behind the panel: a click on a clickable table row under it opens that row; any other click-off leaves the panel open. */
  @Input() dismissible = false;
  /** Drop the body's top padding so content starts flush under the header
   *  (level with the dashboard navbar's divider line). */
  @Input() flushBody = false;

  /** Emitted when the user closes the panel (close button or Escape — never a click-off). */
  @Output() closed = new EventEmitter<void>();
  /** Emitted once a close has finished sliding out (the panel is gone). */
  @Output() afterClosed = new EventEmitter<void>();

  /** In the DOM — from the moment it opens until its slide-out ends. */
  rendered = false;
  /** Slid in (drives the CSS transition); false while sliding in / out. */
  shown = false;
  /** Its last move was a swap with another panel: no transition. */
  instant = false;
  /** A phone's panel dragged rightwards this far (px) — it follows the finger. */
  dragX = 0;
  /** Following the finger: no transition in the way. */
  dragging = false;
  /** The dashboard's root: on a phone the panel is a sheet from the bottom. */
  private readonly root = inject(DashboardRootDirective, { optional: true });
  private readonly rootSub = this.root?.changes.subscribe(() => {
    this.syncSheetMark();
    this.cd.markForCheck();
  });
  /** The dashboard roots marked while its sheet is up (a phone's): the navbar steps aside. */
  private sheetRoots: Element[] | null = null;

  /**
   * A phone's panel moved (dragged rightwards, sliding out — a swap's doesn't): the shift on its dashboard roots
   * (`--tb-panel-shift`, and `tb-panel-dragging` while it follows the finger), so the panels' trail on its edge moves with it —
   * one unit. Nothing on a wider screen.
   */
  /** How far the panel slides out (its own width — `translateX(100%)`): the trail goes as far, so the two stay one. */
  private slideOutShift(): string {
    const panel = this.host.nativeElement.querySelector<HTMLElement>(".dp-panel");
    return `${panel?.offsetWidth ?? window.innerWidth}px`;
  }

  private shiftTrail(shift: string, dragging: boolean): void {
    if (!this.phone) {
      return;
    }
    for (let root = this.host.nativeElement.closest(`.${PHONE_CLASS}`); root; root = root.parentElement?.closest(`.${PHONE_CLASS}`) ?? null) {
      (root as HTMLElement).style.setProperty("--tb-panel-shift", shift);
      root.classList.toggle("tb-panel-dragging", dragging);
    }
  }

  /** A phone's sheet shown: its dashboard roots marked (`tb-sheet-open` — the navbar steps aside); else unmarked. */
  private syncSheetMark(): void {
    const up = this.phone && this.shown && !this.destroyed;
    if (up && !this.sheetRoots) {
      this.sheetRoots = markSheetOpen(this, this.host.nativeElement, true);
    } else if (!up && this.sheetRoots) {
      markSheetOpen(this, this.host.nativeElement, false, this.sheetRoots);
      this.sheetRoots = null;
    }
  }
  /** The drag under way: where it started, its last move (for the flick's speed), and whether it's the sheet's yet. */
  private drag: { startX: number; startY: number; lastX: number; lastT: number; speed: number; target: EventTarget | null; taken: boolean } | null = null;
  private swipeTimer?: ReturnType<typeof setTimeout>;
  private readonly onTouchStart = (event: TouchEvent) => this.touchStart(event);
  private readonly onTouchMove = (event: TouchEvent) => this.touchMove(event);
  private readonly onTouchEnd = () => this.touchEnd();
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
    // Its dashboard moved to another page (the rail's lit entry changed): an open panel closes, as its close button does.
    DASHBOARD_PAGE_MOVES.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe((root) => {
      if (this.open && root.contains(this.host.nativeElement)) {
        this.closed.emit();
      }
    });
    // The pointer over the scrim, watched outside Angular (no change detection a move).
    this.zone.runOutsideAngular(() => {
      const el = this.host.nativeElement;
      el.addEventListener("mousemove", this.onPointerMove);
      el.addEventListener("mouseout", this.onPointerOut);
      // A phone's swipe down: touch events, not pointer ones — the body scrolls natively until it's at its top and the finger
      // moves down, then the sheet takes the move (a non-passive listener, so it can stop the scroll).
      el.addEventListener("touchstart", this.onTouchStart, { passive: true });
      el.addEventListener("touchmove", this.onTouchMove, { passive: false });
      el.addEventListener("touchend", this.onTouchEnd, { passive: true });
      el.addEventListener("touchcancel", this.onTouchEnd, { passive: true });
    });
  }

  /** Laid out for a phone: a sheet from the bottom. */
  get phone(): boolean {
    return !!this.root?.phone;
  }

  /** A touch on the sheet (a phone's, shown): a drag of it may start — from its header, or its body scrolled to the top. */
  private touchStart(event: TouchEvent): void {
    this.drag = null;
    const target = event.target as Element | null;
    if (!this.phone || !this.shown || event.touches.length !== 1 || !target?.closest(".dp-panel")) {
      return;
    }
    // On a chart (or a heat map): a finger moving across scrubs it — its time, its readings — never the panel's swipe.
    if (target.closest(OWN_SWIPE)) {
      return;
    }
    const t = event.touches[0];
    this.drag = { startX: t.clientX, startY: t.clientY, lastX: t.clientX, lastT: event.timeStamp, speed: 0, target, taken: false };
  }

  /** Anything between the touch and the panel scrolled sideways from its start (a wide table, a strip): a move across is its scroll. */
  private scrolledAcross(target: Element): boolean {
    for (let el: Element | null = target; el && !el.classList.contains("dp-panel"); el = el.parentElement) {
      if (el.scrollLeft > 0) {
        return true;
      }
    }
    return false;
  }

  private touchMove(event: TouchEvent): void {
    const d = this.drag;
    if (!d || event.touches.length !== 1) {
      return;
    }
    const t = event.touches[0];
    const dx = t.clientX - d.startX;
    const dy = t.clientY - d.startY;
    if (!d.taken) {
      if (Math.abs(dx) < SWIPE_START_PX && Math.abs(dy) < SWIPE_START_PX) {
        return;
      }
      // Leftwards, or more up and down than across (its body's scroll), or across something scrolled sideways (a wide table, a
      // chart's): not the panel's.
      if (dx <= 0 || Math.abs(dy) >= dx || this.scrolledAcross(d.target as Element)) {
        this.drag = null;
        return;
      }
      d.taken = true;
    }
    if (event.cancelable) {
      event.preventDefault();
    }
    const dt = Math.max(1, event.timeStamp - d.lastT);
    d.speed = (t.clientX - d.lastX) / dt;
    d.lastX = t.clientX;
    d.lastT = event.timeStamp;
    this.zone.run(() => {
      this.dragging = true;
      this.dragX = Math.max(0, dx);
      this.shiftTrail(`${this.dragX}px`, true);
      this.cd.detectChanges();
    });
  }

  /** Let go: past a quarter of its width (or a flick) it closes, sliding on out from where it is; else it springs back. */
  private touchEnd(): void {
    const d = this.drag;
    this.drag = null;
    if (!d?.taken || !this.dragging) {
      return;
    }
    const panel = this.host.nativeElement.querySelector<HTMLElement>(".dp-panel");
    const width = panel?.offsetWidth || 1;
    const close = this.dragX > width * SWIPE_CLOSE_SHARE || (this.dragX > SWIPE_CLOSE_MIN_PX && d.speed > SWIPE_CLOSE_SPEED);
    this.zone.run(() => {
      this.dragging = false;
      this.shiftTrail(close ? this.slideOutShift() : "0px", false);
      if (close) {
        // Held where it was let go until the close moves it (`move`) — so it slides on out from there, not back up first.
        clearTimeout(this.swipeTimer);
        this.swipeTimer = setTimeout(() => {
          this.dragX = 0;
          this.cd.detectChanges();
        }, 400);
        this.closed.emit();
      } else {
        this.dragX = 0;
      }
      this.cd.detectChanges();
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
      this.shiftTrail("0px", false);
      if (instant) {
        this.shown = true;
        this.syncSheetMark();
        this.cd.detectChanges();
        return;
      }
      this.frame = requestAnimationFrame(() => {
        this.frame = requestAnimationFrame(() => {
          this.shown = true;
          this.syncSheetMark();
          this.cd.detectChanges();
        });
      });
    } else if (this.rendered) {
      this.shown = false;
      this.syncSheetMark();
      if (!instant) {
        this.shiftTrail(this.slideOutShift(), false);
      }
      // A swipe's close: the sheet slides on out from where it was let go.
      clearTimeout(this.swipeTimer);
      this.dragX = 0;
      this.dragging = false;
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
    this.syncSheetMark();
    moving.delete(this);
    cancelAnimationFrame(this.frame ?? 0);
    cancelAnimationFrame(this.hoverFrame);
    clearTimeout(this.closeTimer);
    this.markRow(null, null);
    clearTimeout(this.swipeTimer);
    this.rootSub?.unsubscribe();
    const el = this.host.nativeElement;
    el.removeEventListener("mousemove", this.onPointerMove);
    el.removeEventListener("mouseout", this.onPointerOut);
    el.removeEventListener("touchstart", this.onTouchStart);
    el.removeEventListener("touchmove", this.onTouchMove);
    el.removeEventListener("touchend", this.onTouchEnd);
    el.removeEventListener("touchcancel", this.onTouchEnd);
  }

  /**
   * A click on the scrim: on a clickable table row under it, the row's own
   * (it opens in the panel's place); anywhere else, nothing — the panel stays
   * open (its close button or Escape closes it). On a phone (a sheet): it closes.
   */
  onBackdropClick(event: MouseEvent): void {
    // A phone's sheet: a tap off it closes it, as the phones' own sheets.
    if (this.phone) {
      this.closed.emit();
      return;
    }
    const under = clickableRowUnder(event.clientX, event.clientY);
    if (!under) {
      return;
    }
    under.target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window, clientX: event.clientX, clientY: event.clientY }));
  }

  /** The wheel over the scrim: what's under it scrolls — a table's rows, the page — as if the scrim weren't there. */
  onBackdropWheel(event: WheelEvent): void {
    const box = scrollBoxUnder(event.clientX, event.clientY, event.deltaX, event.deltaY);
    if (!box) {
      return;
    }
    event.preventDefault();
    // Lines (or pages) of wheel: in pixels, as the browser scrolls them.
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? box.clientHeight : 1;
    box.scrollBy({ left: event.deltaX * unit, top: event.deltaY * unit });
    this.trackRow(event); // the row now under the pointer looks hovered
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
