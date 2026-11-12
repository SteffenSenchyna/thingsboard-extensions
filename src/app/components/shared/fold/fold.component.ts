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

import { Component, ElementRef, HostBinding, HostListener, Input, OnChanges, OnDestroy, SimpleChanges } from "@angular/core";

/** Opening without a transitionend (a hidden tab, reduced motion): release the clip after the expand duration anyway. */
const SETTLE_FALLBACK_MS = 350;

/**
 * The fields a switch (or a choice) reveals, folding open and closed with the
 * collapsible cards' motion instead of appearing and vanishing. Sits in a
 * form's field stack right after the control that opens it: closed, it takes
 * no height and pulls the stack's gap in with it; open, it is a field stack
 * of its own. Its content stays mounted (the form controls keep their state)
 * but is `inert` while closed.
 *
 * ```html
 * <tb-ext-switch label="Connector-wide strategy" formControlName="strategyEnabled"></tb-ext-switch>
 * <tb-fold [open]="form.controls['strategyEnabled'].value">
 *   <div class="cf-field">…</div>
 * </tb-fold>
 * ```
 */
@Component({
  selector: "tb-fold",
  templateUrl: "./fold.component.html",
  styleUrls: ["./fold.component.scss"],
  standalone: true,
})
export class FoldComponent implements OnChanges, OnDestroy {
  @Input() @HostBinding("class.tbf-open") open = false;

  /**
   * Fully open: the expand transition has finished, so the clip is lifted and
   * overflowing children (a `tb-select` dropdown) can escape — the collapsible
   * card's `overflowVisible`. Closing re-clips at once, for the animation.
   */
  @HostBinding("class.tbf-settled") settled = false;

  /**
   * The fold's motion is on only once `open` has changed after it rendered: a
   * fold that renders open simply appears (as the collapsible card — a fold
   * inserted with a tab's cards would otherwise play its opening).
   */
  @HostBinding("class.tbf-animated") animated = false;

  private settleTimer?: ReturnType<typeof setTimeout>;

  constructor(private el: ElementRef<HTMLElement>) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes["open"]) {
      return;
    }
    clearTimeout(this.settleTimer);
    if (!changes["open"].firstChange) {
      this.animated = true;
    }
    if (!this.open) {
      this.settled = false;
    } else if (changes["open"].firstChange) {
      this.settled = true; // rendered open: nothing animates
    } else {
      this.settleTimer = setTimeout(() => (this.settled = true), SETTLE_FALLBACK_MS);
    }
  }

  ngOnDestroy(): void {
    clearTimeout(this.settleTimer);
  }

  /** The host's own row transition (not a child's) finishing while open. */
  @HostListener("transitionend", ["$event"])
  onTransitionEnd(ev: TransitionEvent): void {
    if (ev.target !== this.el.nativeElement || ev.propertyName !== "grid-template-rows" || !this.open) {
      return;
    }
    clearTimeout(this.settleTimer);
    this.settled = true;
  }
}
