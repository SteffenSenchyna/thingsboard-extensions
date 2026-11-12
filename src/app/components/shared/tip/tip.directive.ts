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

/** The gap between the bubble's caret and what it names. */
const GAP = 10;
/** The bubble keeps this far from the window's edges. */
const MARGIN = 8;
/** The theme tokens the bubble takes from where its anchor sits (it's drawn outside the dashboard, where they aren't set). */
const TOKENS = ["--c-tooltip-bg", "--c-tooltip-text"];

/**
 * The bubble {@link TipDirective} shows: the dashboards' tooltip look, drawn
 * at the top of the page — fixed, above everything — so nothing can cut it.
 */
@Component({
  selector: "tb-tip-bubble",
  template: `{{ text }}`,
  styleUrls: ["./tip-bubble.component.scss"],
  standalone: true,
})
export class TipBubbleComponent {
  text = "";
  @HostBinding("attr.role") readonly role = "tooltip";
  @HostBinding("class.tip-shown") shown = false;
  /** Under its anchor (no room above it). */
  @HostBinding("class.tip-below") below = false;
}

/**
 * A tooltip that is never cut off: the dashboards' bubble naming what it's
 * on, popping up centred above it — under it when there's no room above —
 * and kept inside the window, its caret still on the element. The bubble is
 * drawn at the top of the page (in the document's body, fixed), not inside
 * the element's card or panel, so no clipping box around the element can cut
 * it; it takes the dashboard's theme from where the element sits.
 *
 * Every new tooltip on a button, a toggle or a mark uses it — never a bubble
 * of the component's own inside a box that may clip, and never Material's.
 *
 * ```html
 * <button tbTip="Export CSV" …><mat-icon>download</mat-icon></button>
 * <tb-round-toggle [tbTip]="'Email'" …></tb-round-toggle>
 * ```
 */
@Directive({
  selector: "[tbTip]",
  standalone: true,
})
export class TipDirective implements OnDestroy {
  /** What the bubble says ("": no bubble). */
  @Input("tbTip") text: string | null | undefined = "";

  private ref?: ComponentRef<TipBubbleComponent>;
  private frame = 0;
  private removal?: ReturnType<typeof setTimeout>;
  private readonly show = () => this.open();
  private readonly hide = () => this.close();

  constructor(
    private readonly el: ElementRef<HTMLElement>,
    private readonly views: ViewContainerRef,
    private readonly zone: NgZone
  ) {
    // Outside Angular: a pointer passing over it runs no change detection.
    this.zone.runOutsideAngular(() => {
      const host = this.el.nativeElement;
      host.addEventListener("mouseenter", this.show);
      host.addEventListener("focusin", this.show);
      host.addEventListener("mouseleave", this.hide);
      host.addEventListener("focusout", this.hide);
      host.addEventListener("click", this.hide);
    });
  }

  ngOnDestroy(): void {
    const host = this.el.nativeElement;
    host.removeEventListener("mouseenter", this.show);
    host.removeEventListener("focusin", this.show);
    host.removeEventListener("mouseleave", this.hide);
    host.removeEventListener("focusout", this.hide);
    host.removeEventListener("click", this.hide);
    this.stop();
    this.ref?.location.nativeElement.remove();
    this.ref?.destroy();
  }

  private open(): void {
    const text = (this.text ?? "").trim();
    const anchor = this.el.nativeElement;
    if (!text || !anchor.isConnected) {
      return;
    }
    this.stop();
    this.ref ??= this.views.createComponent(TipBubbleComponent);
    const bubble = this.ref.location.nativeElement as HTMLElement;
    // The dashboard's theme, as the anchor has it.
    const style = getComputedStyle(anchor);
    TOKENS.forEach((name) => bubble.style.setProperty(name, style.getPropertyValue(name)));
    bubble.style.colorScheme = style.colorScheme;
    this.ref.instance.text = text;
    this.ref.instance.shown = false;
    document.body.appendChild(bubble);
    this.ref.changeDetectorRef.detectChanges();
    // Centred over the anchor, inside the window; under it when there's no room above.
    const a = anchor.getBoundingClientRect();
    const width = bubble.offsetWidth;
    const height = bubble.offsetHeight;
    const centre = a.left + a.width / 2;
    const left = Math.max(MARGIN, Math.min(centre - width / 2, window.innerWidth - width - MARGIN));
    const below = a.top - GAP - height < MARGIN;
    bubble.style.left = `${left}px`;
    bubble.style.top = `${below ? a.bottom + GAP : a.top - GAP - height}px`;
    bubble.style.setProperty("--tip-caret", `${Math.max(12, Math.min(centre - left, width - 12))}px`);
    this.ref.instance.below = below;
    this.ref.changeDetectorRef.detectChanges();
    // Shown on the next frame, so it pops from its hidden state; gone with a scroll (it would be left behind).
    this.frame = requestAnimationFrame(() => {
      if (this.ref) {
        this.ref.instance.shown = true;
        this.ref.changeDetectorRef.detectChanges();
      }
    });
    window.addEventListener("scroll", this.hide, true);
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
    clearTimeout(this.removal);
    window.removeEventListener("scroll", this.hide, true);
  }
}
