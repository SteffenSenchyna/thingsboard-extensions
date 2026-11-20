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

import { Component, ComponentRef, Directive, ElementRef, HostBinding, Input, NgZone, OnDestroy, ViewContainerRef } from "@angular/core";
import { DomSanitizer, SafeHtml } from "@angular/platform-browser";
import { ChartTooltipRow, chartTooltipHtml } from "../chart-tooltip";

/** The gap between the bubble's caret and what it names. */
const GAP = 10;
/** A rich bubble's gap (it has no caret). */
const RICH_GAP = 8;
/** The bubble keeps this far from the window's edges. */
const MARGIN = 8;
/** A tap on one of these is the control's own (no bubble on a touch — see the directive's `touch`). */
const TOUCH_CONTROLS = "button, a[href], input, select, textarea, label, [role='button'], [role='tab'], [role='menuitem'], [role='option'], .dt-row-clickable";
/** How long a tapped bubble stays up with nothing touched. */
const TOUCH_SHOWN_MS = 4000;
/** The theme tokens the bubble takes from where its anchor sits (it's drawn outside the dashboard, where they aren't set). */
const TOKENS = ["--c-tooltip-bg", "--c-tooltip-text", "--c-tooltip-rich-bg", "--c-tooltip-rich-text", "--c-tooltip-rich-border", "--shadow-box-modal-normal"];

/**
 * A rich bubble's content — the charts' tooltip ({@link chartTooltipHtml}, the Fuel Reports page's look): what it's about as its
 * title (a Time Machine mark's device, "RMC Tank 10 · Richmond Lab (4R20)"; "": none), then a row an item — a bar in its colour
 * down its left, its name muted, its value on the right (none: its name alone). A row's swatch may be a theme token,
 * `var(--c-bg-major-normal)`: resolved where the element sits, as the bubble's theme.
 */
export interface TipRich {
  title: string;
  rows: ChartTooltipRow[];
}

/** A row's colours with their theme tokens resolved from where the anchor sits (the bubble, in the document's body, has none). */
function resolveTokens(value: string | undefined, style: CSSStyleDeclaration): string | undefined {
  return value?.replace(/var\((--[\w-]+)\)/g, (token, name: string) => style.getPropertyValue(name).trim() || token);
}

/**
 * A wrapped note's bubble shrunk to its widest line: CSS keeps a box that wraps at its max-width (320px) whatever its lines'
 * lengths, so the lines' ends would leave a blank strip on its right. Its line boxes measured (scaled back from its pop-in
 * transform), its width set to the widest plus its padding; a one-line label is left as it is.
 */
function fitToLines(bubble: HTMLElement): void {
  const range = document.createRange();
  range.selectNodeContents(bubble);
  const lines = Array.from(range.getClientRects()).filter((r) => r.width > 0);
  if (lines.length < 2) {
    return;
  }
  const scale = bubble.getBoundingClientRect().width / (bubble.offsetWidth || 1) || 1;
  const widest = Math.max(...lines.map((r) => r.width)) / scale;
  const style = getComputedStyle(bubble);
  const sides = ["paddingLeft", "paddingRight", "borderLeftWidth", "borderRightWidth"] as const;
  const extra = sides.reduce((sum, side) => sum + (parseFloat(style[side]) || 0), 0);
  // A pixel over, so rounding never wraps a line again.
  bubble.style.width = `${Math.ceil(widest + extra) + 1}px`;
}

/**
 * The part of an element in view: its box cut by every box around it that clips it (a scrolling column, a card) and by the window —
 * a tall section scrolled half out of view is named at the middle of what shows of it. None of it in view: its box.
 */
function visibleRect(el: HTMLElement): DOMRect {
  const box = el.getBoundingClientRect();
  let { left, top, right, bottom } = box;
  const clips = /auto|scroll|hidden|clip/;
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const style = getComputedStyle(p);
    const clipX = clips.test(style.overflowX);
    const clipY = clips.test(style.overflowY);
    if (clipX || clipY) {
      const r = p.getBoundingClientRect();
      if (clipX) {
        left = Math.max(left, r.left);
        right = Math.min(right, r.right);
      }
      if (clipY) {
        top = Math.max(top, r.top);
        bottom = Math.min(bottom, r.bottom);
      }
    }
  }
  left = Math.max(left, 0);
  top = Math.max(top, 0);
  right = Math.min(right, window.innerWidth);
  bottom = Math.min(bottom, window.innerHeight);
  return right > left && bottom > top ? new DOMRect(left, top, right - left, bottom - top) : box;
}

/**
 * The bubble {@link TipDirective} shows: the dashboards' tooltip look, drawn
 * at the top of the page — fixed, above everything — so nothing can cut it.
 */
@Component({
  selector: "tb-tip-bubble",
  template: `@if (html) {<div [innerHTML]="html"></div>} @else {<ng-container>{{ text }}</ng-container>}`,
  styleUrls: ["./tip-bubble.component.scss"],
  standalone: true,
})
export class TipBubbleComponent {
  text = "";
  /** A rich bubble's content (the charts' tooltip, built escaped by {@link chartTooltipHtml}); null — the plain bubble's text. */
  html: SafeHtml | null = null;
  /** The charts' tooltip look (a {@link TipRich}): its surface, its hairline, no caret. */
  @HostBinding("class.tip-rich") rich = false;
  @HostBinding("attr.role") readonly role = "tooltip";
  @HostBinding("class.tip-shown") shown = false;
  /** Under its anchor (no room above it). */
  @HostBinding("class.tip-below") below = false;
  /** Beside its anchor, to its right — or its left, no room on its right (`tbTipPlacement="right"`). */
  @HostBinding("class.tip-right") right = false;
  @HostBinding("class.tip-left") left = false;
}

/**
 * A tooltip that is never cut off: the dashboards' bubble naming what it's
 * on, popping up centred above it — under it when there's no room above, or
 * when it prefers that side (`tbTipPlacement="below"`, room allowing) — and
 * kept inside the window, its caret still on the element — or beside it, to its right (`tbTipPlacement="right"`: the marks of a
 * narrow column, the Time Machine's — its left when there's no room), centred on it. It names the part of the element in view: a
 * tall one scrolled half out of its column, the middle of what shows — and, its column scrolled under the resting pointer (the Time
 * Machine scrubbed with the wheel), follows what still shows. A line break in its text is kept (a list: an item a line). The bubble is
 * drawn at the top of the page (in the document's body, fixed), not inside
 * the element's card or panel, so no clipping box around the element can cut
 * it; it takes the dashboard's theme from where the element sits.
 *
 * Given a {@link TipRich} instead of text, it's the charts' tooltip (a title, a row an item with its coloured bar — the Time
 * Machine's marks and runs), placed and kept up just the same.
 *
 * Every new tooltip on a button, a toggle or a mark uses it — never a bubble
 * of the component's own inside a box that may clip, and never Material's.
 *
 * ```html
 * <button tbTip="Export CSV" …><mat-icon>download</mat-icon></button>
 * <tb-round-toggle [tbTip]="'Email'" …></tb-round-toggle>
 * <!-- A value cut with "…": its full text, only while it's cut. -->
 * <span class="cut-on-one-line" [tbTip]="name" [tbTipIfCut]="true">{{ name }}</span>
 * <!-- Hovered anywhere on the line, the bubble over its bar: -->
 * <div [tbTip]="partsTip" tbTipAnchor=".bar">…<span class="bar"></span></div>
 * ```
 */
@Directive({
  selector: "[tbTip]",
  standalone: true,
})
export class TipDirective implements OnDestroy {
  /** What the bubble says ("": no bubble) — or, a {@link TipRich}, the charts' tooltip (no rows and no title: no bubble). */
  @Input("tbTip") text: string | TipRich | null | undefined = "";
  /**
   * Where the bubble sits, when not over the whole element: a CSS selector of one of its descendants (a ranked line's bar — the
   * line hovered anywhere, the bubble over its bar, its caret on it); none found — the element itself.
   */
  @Input() tbTipAnchor = "";
  /**
   * The side it prefers: above (the default), below (a control at the top of a widget) — the other side when there's no room — or
   * right (beside it, centred on it: a narrow column's marks, the Time Machine's) — its left when there's no room on its right.
   */
  @Input() tbTipPlacement: "above" | "below" | "right" = "above";
  /** Only while the element's own text is cut with "…" (a value on one line, too long for its room): its full text, else none. */
  @Input() tbTipIfCut = false;

  private ref?: ComponentRef<TipBubbleComponent>;
  /** What the open bubble names (the element, or its {@link tbTipAnchor}). */
  private anchor?: HTMLElement;
  /** What the open bubble says (its text, or a rich one's markup): the same again keeps it up. */
  private shownKey = "";
  private frame = 0;
  private moveFrame = 0;
  private removal?: ReturnType<typeof setTimeout>;
  /** Pressed: the bubble stays down until the pointer leaves — the focus a click gives the element doesn't bring it back. */
  private pressed = false;
  private readonly show = () => {
    if (!this.pressed) {
      this.open();
    }
  };
  private readonly hide = () => {
    if (!this.tapped) {
      this.close();
    }
  };
  private readonly click = () => {
    // A tap's own click: the bubble it opened stays (a touch elsewhere, or a moment, takes it down).
    if (!this.tapped) {
      this.close();
    }
  };
  private readonly press = (event: PointerEvent) => {
    this.pressed = true;
    if (event.pointerType === "touch") {
      this.touch();
      return;
    }
    this.close();
  };
  /** A touch elsewhere, while a tapped bubble is up: it goes. */
  private readonly touchAway = (event: Event) => {
    if (!this.el.nativeElement.contains(event.target as Node)) {
      this.endTouch();
      this.close();
    }
  };
  private touchTimer?: ReturnType<typeof setTimeout>;
  /** The bubble is up from a tap: the click that follows the tap leaves it. */
  private tapped = false;
  private readonly leave = () => {
    this.pressed = false;
    this.endTouch();
    this.close();
  };
  /**
   * Something scrolled while the bubble is up: still over the element (a column scrubbed with the wheel under a resting pointer),
   * the bubble follows what shows of it — a frame at a time; else it goes (it would be left behind).
   */
  private readonly onScroll = () => {
    if (!this.el.nativeElement.matches(":hover") || !this.anchor?.isConnected) {
      this.close();
      return;
    }
    cancelAnimationFrame(this.moveFrame);
    this.moveFrame = requestAnimationFrame(() => {
      if (this.ref && this.anchor) {
        this.place(this.ref, this.anchor);
      }
    });
  };

  constructor(
    private readonly el: ElementRef<HTMLElement>,
    private readonly views: ViewContainerRef,
    private readonly zone: NgZone,
    private readonly sanitizer: DomSanitizer
  ) {
    // Outside Angular: a pointer passing over it runs no change detection.
    this.zone.runOutsideAngular(() => {
      const host = this.el.nativeElement;
      host.addEventListener("mouseenter", this.show);
      host.addEventListener("focusin", this.show);
      host.addEventListener("mouseleave", this.leave);
      host.addEventListener("focusout", this.hide);
      // Pressed (before the focus the press gives it): down, and kept down while the pointer stays.
      host.addEventListener("pointerdown", this.press);
      host.addEventListener("click", this.click);
    });
  }

  ngOnDestroy(): void {
    const host = this.el.nativeElement;
    host.removeEventListener("mouseenter", this.show);
    host.removeEventListener("focusin", this.show);
    host.removeEventListener("mouseleave", this.leave);
    host.removeEventListener("focusout", this.hide);
    host.removeEventListener("pointerdown", this.press);
    host.removeEventListener("click", this.click);
    this.endTouch();
    this.stop();
    this.ref?.location.nativeElement.remove();
    this.ref?.destroy();
  }

  /**
   * A finger has no hover: a tap on something that only says what it is (an info icon, a mark, a value cut short) shows its bubble
   * — again, or a touch elsewhere, or a few seconds, takes it down. A tap on a control (a button, a link, a field, a table's
   * row) is the control's alone: no bubble (it would be left over what the tap opened).
   */
  private touch(): void {
    const host = this.el.nativeElement;
    const wasUp = this.tapped;
    this.endTouch();
    this.close();
    if (wasUp || host.closest(TOUCH_CONTROLS)) {
      return;
    }
    this.open();
    if (!this.ref) {
      return;
    }
    this.tapped = true;
    document.addEventListener("pointerdown", this.touchAway, true);
    this.touchTimer = setTimeout(() => {
      this.endTouch();
      this.close();
    }, TOUCH_SHOWN_MS);
  }

  private endTouch(): void {
    this.tapped = false;
    clearTimeout(this.touchTimer);
    document.removeEventListener("pointerdown", this.touchAway, true);
  }

  private open(): void {
    const content = this.text;
    const rich = content && typeof content === "object" && (content.title || content.rows?.length) ? content : null;
    const text = typeof content === "string" ? content.trim() : "";
    const host = this.el.nativeElement;
    const anchor = (this.tbTipAnchor ? host.querySelector<HTMLElement>(this.tbTipAnchor) : null) ?? host;
    if ((!text && !rich) || !anchor.isConnected || (this.tbTipIfCut && host.scrollWidth <= host.clientWidth + 1)) {
      return;
    }
    // The dashboard's theme, as the anchor has it — a rich bubble's colours too.
    const style = getComputedStyle(anchor);
    const html = rich
      ? chartTooltipHtml(
          rich.title,
          (rich.rows ?? []).map((row) => ({ ...row, swatch: resolveTokens(row.swatch, style), swatchBorder: resolveTokens(row.swatchBorder, style) }))
        )
      : "";
    const key = html || text;
    // Already up, saying the same (hovered, then focused): it stays — no pop again.
    const up = this.ref?.location.nativeElement as HTMLElement | undefined;
    if (this.ref?.instance.shown && up?.isConnected && this.shownKey === key && this.anchor === anchor) {
      return;
    }
    this.stop();
    this.anchor = anchor;
    this.shownKey = key;
    this.ref ??= this.views.createComponent(TipBubbleComponent);
    const bubble = this.ref.location.nativeElement as HTMLElement;
    TOKENS.forEach((name) => bubble.style.setProperty(name, style.getPropertyValue(name)));
    bubble.style.colorScheme = style.colorScheme;
    // A rich bubble in the dashboard's font, as the charts' tooltips are.
    bubble.style.fontFamily = rich ? style.fontFamily : "";
    this.ref.instance.text = text;
    // Built by chartTooltipHtml, every text in it escaped: trusted as it is (Angular's sanitizer would drop its inline styles).
    this.ref.instance.html = rich ? this.sanitizer.bypassSecurityTrustHtml(html) : null;
    this.ref.instance.rich = !!rich;
    this.ref.instance.shown = false;
    bubble.style.width = "";
    document.body.appendChild(bubble);
    this.ref.changeDetectorRef.detectChanges();
    if (!rich) {
      fitToLines(bubble);
    }
    this.place(this.ref, anchor);
    this.reveal();
  }

  /**
   * The bubble placed on the part of the anchor in view: centred over it, inside the window — under it when there's no room above
   * (or preferred, `below`) — or beside it (`right`).
   */
  private place(ref: ComponentRef<TipBubbleComponent>, anchor: HTMLElement): void {
    const bubble = ref.location.nativeElement as HTMLElement;
    const a = visibleRect(anchor);
    const width = bubble.offsetWidth;
    const height = bubble.offsetHeight;
    const gap = ref.instance.rich ? RICH_GAP : GAP;
    if (this.tbTipPlacement === "right") {
      this.placeBeside(ref, bubble, a, width, height, gap);
      return;
    }
    const centre = a.left + a.width / 2;
    const left = Math.max(MARGIN, Math.min(centre - width / 2, window.innerWidth - width - MARGIN));
    const roomAbove = a.top - gap - height >= MARGIN;
    const roomBelow = a.bottom + gap + height <= window.innerHeight - MARGIN;
    const below = this.tbTipPlacement === "below" ? roomBelow || !roomAbove : !roomAbove;
    bubble.style.left = `${left}px`;
    bubble.style.top = `${below ? a.bottom + gap : a.top - gap - height}px`;
    bubble.style.setProperty("--tip-caret", `${Math.max(12, Math.min(centre - left, width - 12))}px`);
    ref.instance.below = below;
    ref.instance.right = false;
    ref.instance.left = false;
    ref.changeDetectorRef.detectChanges();
  }

  /** `tbTipPlacement="right"`: beside the anchor, centred on the part of it in view, to its right — its left with no room there — inside the window. */
  private placeBeside(ref: ComponentRef<TipBubbleComponent>, bubble: HTMLElement, a: DOMRect, width: number, height: number, gap: number): void {
    const right = a.right + gap + width <= window.innerWidth - MARGIN || a.left - gap - width < MARGIN;
    const middle = a.top + a.height / 2;
    const top = Math.max(MARGIN, Math.min(middle - height / 2, window.innerHeight - height - MARGIN));
    bubble.style.left = `${right ? a.right + gap : a.left - gap - width}px`;
    bubble.style.top = `${top}px`;
    bubble.style.setProperty("--tip-caret", `${Math.max(10, Math.min(middle - top, height - 10))}px`);
    ref.instance.below = false;
    ref.instance.right = right;
    ref.instance.left = !right;
    ref.changeDetectorRef.detectChanges();
  }

  /** Shown on the next frame, so it pops from its hidden state; a scroll moves it with what shows of the element, or ends it. */
  private reveal(): void {
    this.frame = requestAnimationFrame(() => {
      if (this.ref) {
        this.ref.instance.shown = true;
        this.ref.changeDetectorRef.detectChanges();
      }
    });
    window.addEventListener("scroll", this.onScroll, true);
  }

  private close(): void {
    this.stop();
    const ref = this.ref;
    if (!ref || !ref.instance.shown) {
      ref?.location.nativeElement.remove();
      return;
    }
    ref.instance.shown = false;
    ref.changeDetectorRef.detectChanges();
    // Off the page once it has faded.
    this.removal = setTimeout(() => ref.location.nativeElement.remove(), 150);
  }

  private stop(): void {
    cancelAnimationFrame(this.frame);
    cancelAnimationFrame(this.moveFrame);
    clearTimeout(this.removal);
    window.removeEventListener("scroll", this.onScroll, true);
  }
}
