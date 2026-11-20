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
  OnDestroy,
  Output,
  ViewChild,
  inject,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";
import { IconBadgeComponent } from "../icon-badge/icon-badge.component";
import { markSheetOpen } from "../dashboard/dashboard-root.directive";

/** A drag down (from the right: rightwards) past this share of the sheet's height (width) closes it… */
const CLOSE_SHARE = 0.25;
/** …as does a flick (px / ms) past a few pixels. */
const CLOSE_SPEED = 0.5;
const CLOSE_MIN_PX = 24;
/** From the right: a move this far before it's told apart — across (the sheet's drag) or up and down (its content's scroll). */
const SWIPE_START_PX = 8;

/**
 * A phone's sheet from the bottom of the dashboard (as the phone apps' own): a grab handle, its header as a side panel's
 * (`tb-icon-badge`, its name and a muted line, the close button), its content scrolling under it. It rises over a scrim; a tap
 * on the scrim, the close button, Escape — or a drag down from its header, or from its content scrolled to the top (a list
 * scrolling inside it too) — closes
 * it (a short drag springs back). Placed in the dashboard root (positioned against it, as the side panels).
 *
 * `from="right"`: a panel from the screen's right edge instead (the alarm panel's, `tb-alarm-panel`, on a phone — as on a wider
 * screen): the window's height, its width but a sliver at the left, its left corners rounded, a grab handle on its left edge;
 * swiped right — anywhere on it, a move more across than up or down (that's its list's scroll) — it closes.
 *
 * ```html
 * <tb-bottom-sheet [open]="open" icon="notifications" title="Alarms" (closed)="open = false">…</tb-bottom-sheet>
 * ```
 */
@Component({
  selector: "tb-bottom-sheet",
  standalone: true,
  imports: [CommonModule, SharedModule, IconBadgeComponent],
  template: `<div class="bs-scrim" aria-hidden="true" [class.bs-shown]="open" (click)="closed.emit()"></div>
    <div #sheet class="bs-sheet" role="dialog" [attr.aria-label]="title" [attr.inert]="open ? null : ''" [class.bs-shown]="open"
         [class.bs-dragging]="dragging" [style.transform]="dragBy > 0 ? (fromRight ? 'translateX(' : 'translateY(') + dragBy + 'px)' : null">
      <!-- The grip: the handle and the header — dragged down, the sheet follows (and closes past a quarter of its height). -->
      <div #grip class="bs-grip">
        <span class="bs-handle"></span>
        <div class="bs-head">
          <tb-icon-badge *ngIf="icon" [icon]="icon"></tb-icon-badge>
          <div class="bs-id">
            <div class="bs-title">{{ title }}</div>
            <div *ngIf="subtitle" class="bs-sub">{{ subtitle }}</div>
          </div>
          <button type="button" class="bs-close" aria-label="Close" (click)="closed.emit()"><mat-icon>close</mat-icon></button>
        </div>
      </div>
      <div #body class="bs-body"><ng-content></ng-content></div>
    </div>`,
  styleUrls: ["./bottom-sheet.component.scss"],
})
export class BottomSheetComponent implements AfterViewInit, OnChanges, OnDestroy {
  /** Never let the browser's native tooltip show on the host. */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;

  @Input() open = false;
  /** The Material Symbols icon on its header's tile. */
  @Input() icon = "";
  @Input() title = "";
  /** The muted line under its name. */
  @Input() subtitle = "";
  /** Where it comes from: the bottom (a sheet), or the screen's right edge (a panel — the alarms'). */
  @Input() from: "bottom" | "right" = "bottom";
  /** Dismissed: a tap off it, its close button, Escape or a drag down (from the right: rightwards). */
  @Output() closed = new EventEmitter<void>();

  /** How far it's dragged — down, or from the right rightwards (px): it follows the finger, no transition. */
  dragBy = 0;
  dragging = false;

  @HostBinding("class.bs-right")
  get fromRight(): boolean {
    return this.from === "right";
  }

  @ViewChild("sheet", { static: true }) private sheet!: ElementRef<HTMLElement>;
  @ViewChild("grip", { static: true }) private grip!: ElementRef<HTMLElement>;
  @ViewChild("body", { static: true }) private body!: ElementRef<HTMLElement>;

  private readonly cd = inject(ChangeDetectorRef);
  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);
  /** The drag under way: where it started, and the last move (for the flick's speed). */
  private drag: {
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    lastT: number;
    speed: number;
    fromBody: boolean;
    target: EventTarget | null;
  } | null = null;

  private readonly host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
  /** The dashboard roots marked while it's open (`tb-sheet-open`): the navbar steps aside. */
  private sheetRoots: Element[] | null = null;

  ngOnChanges(): void {
    this.syncSheetMark();
  }

  ngOnDestroy(): void {
    this.syncSheetMark(true);
  }

  private syncSheetMark(gone = false): void {
    const up = this.open && !gone;
    if (up && !this.sheetRoots) {
      this.sheetRoots = markSheetOpen(this, this.host, true);
    } else if (!up && this.sheetRoots) {
      markSheetOpen(this, this.host, false, this.sheetRoots);
      this.sheetRoots = null;
    }
  }

  @HostListener("document:keydown.escape")
  onEscape(): void {
    if (this.open) {
      this.closed.emit();
    }
  }

  ngAfterViewInit(): void {
    // Touch events, not pointer ones: the content scrolls natively until it's at its top and the finger moves down — then the
    // sheet takes the move (a non-passive listener, so it can stop the scroll); the grip is the sheet's alone (touch-action: none).
    const grip = this.grip.nativeElement;
    const body = this.body.nativeElement;
    // Anything scrolled between the touch and the content's box (the content itself, or a list scrolling inside it — a sheet of
    // filters): the move is that scroll's, not a drag of the sheet.
    const scrolled = (target: EventTarget | null) => {
      for (let el = target as HTMLElement | null; el && el !== body.parentElement; el = el.parentElement) {
        if (el.scrollTop > 0) {
          return true;
        }
      }
      return false;
    };
    const start = (fromBody: boolean) => (e: TouchEvent) => {
      // From the bottom, the content's drag starts at its top only; from the right, any (a move across tells it apart).
      if (!this.open || e.touches.length !== 1 || (fromBody && !this.fromRight && scrolled(e.target))) {
        return;
      }
      const { clientX: x, clientY: y } = e.touches[0];
      this.drag = { startX: x, startY: y, lastX: x, lastY: y, lastT: e.timeStamp, speed: 0, fromBody, target: e.target };
    };
    const move = (e: TouchEvent) => {
      const d = this.drag;
      if (!d || e.touches.length !== 1) {
        return;
      }
      const { clientX: x, clientY: y } = e.touches[0];
      const dx = x - d.startX;
      const dy = y - d.startY;
      if (this.fromRight) {
        // From the right: rightwards, more across than up or down — the sheet's; any other move is its content's scroll.
        if (!this.dragging) {
          if (Math.abs(dx) < SWIPE_START_PX && Math.abs(dy) < SWIPE_START_PX) {
            return;
          }
          if (dx <= 0 || Math.abs(dx) <= Math.abs(dy)) {
            this.drag = null;
            return;
          }
        }
      } else if (d.fromBody && !this.dragging && (dy <= 0 || scrolled(d.target))) {
        // From the content: an upward move (or one while it has scrolled) is its scroll, not a drag.
        this.drag = null;
        return;
      }
      if (e.cancelable) {
        e.preventDefault();
      }
      const dt = Math.max(1, e.timeStamp - d.lastT);
      d.speed = (this.fromRight ? x - d.lastX : y - d.lastY) / dt;
      d.lastX = x;
      d.lastY = y;
      d.lastT = e.timeStamp;
      this.zone.run(() => {
        this.dragging = true;
        this.dragBy = Math.max(0, this.fromRight ? dx : dy);
        this.cd.detectChanges();
      });
    };
    const end = () => {
      const d = this.drag;
      this.drag = null;
      if (!d || !this.dragging) {
        return;
      }
      const sheet = this.sheet.nativeElement;
      const size = (this.fromRight ? sheet.offsetWidth : sheet.offsetHeight) || 1;
      const close = this.dragBy > size * CLOSE_SHARE || (this.dragBy > CLOSE_MIN_PX && d.speed > CLOSE_SPEED);
      this.zone.run(() => {
        // Let go: it slides on out from where it is (closing), or springs back.
        this.dragging = false;
        this.dragBy = 0;
        if (close) {
          this.closed.emit();
        }
        this.cd.detectChanges();
      });
    };
    const listeners: [HTMLElement, string, EventListener, AddEventListenerOptions][] = [
      [grip, "touchstart", start(false) as EventListener, { passive: true }],
      [body, "touchstart", start(true) as EventListener, { passive: true }],
      [grip, "touchmove", move as EventListener, { passive: false }],
      [body, "touchmove", move as EventListener, { passive: false }],
      [grip, "touchend", end, { passive: true }],
      [body, "touchend", end, { passive: true }],
      [grip, "touchcancel", end, { passive: true }],
      [body, "touchcancel", end, { passive: true }],
    ];
    this.zone.runOutsideAngular(() => listeners.forEach(([el, type, fn, opts]) => el.addEventListener(type, fn, opts)));
    this.destroyRef.onDestroy(() => listeners.forEach(([el, type, fn]) => el.removeEventListener(type, fn)));
  }
}
