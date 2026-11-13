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

import { Component, EventEmitter, HostBinding, Input, OnChanges, OnInit, Output, SimpleChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";
import { InfoIconComponent } from "../info-icon/info-icon.component";

/**
 * Reusable collapsible card: a header (optional icon + title + chevron) that
 * toggles a projected body open/closed. Themed via the dashboard `--c-*` tokens.
 *
 * ```html
 * <tb-collapsible-card title="Key Metrics">
 *   …body…
 * </tb-collapsible-card>
 * ```
 */
@Component({
  selector: "tb-collapsible-card",
  templateUrl: "./collapsible-card.component.html",
  styleUrls: ["./collapsible-card.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, InfoIconComponent],
})
export class CollapsibleCardComponent implements OnChanges, OnInit {
  /**
   * Strip the native `title` attribute off the host: the `title` @Input is set
   * via `title="…"`, but `title` is also a global HTML attribute, so the browser
   * would otherwise render its own tooltip with that text.
   */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;

  @Input() title = "";
  /** Optional leading Material icon. */
  @Input() icon = "";
  /** Optional info-icon tooltip shown next to the title. */
  @Input() info = "";
  /** How many things it holds, muted after the title ("Days 6" — a report's folded sections); null: none. */
  @Input() count: number | null = null;
  /** Whether the body is expanded. */
  @Input() expanded = true;
  /** `false` makes the header a plain caption: no chevron, no toggle, the body always open. */
  @Input() collapsible = true;
  /**
   * Fill the host's height — a card stretched in a grid or flex row (the two
   * cards of the gateway overview) takes the whole cell, its body the rest
   * under the header. The body is then a column, so projected content can sit
   * at its bottom (`margin-top: auto`).
   */
  @Input() @HostBinding("class.cc-fill") fill = false;
  /**
   * Flat: a section of a form that already sits in a card — no shell, a
   * divider above instead, the header and body at the card's own edges.
   */
  @Input() @HostBinding("class.cc-flat") flat = false;

  /** Emits the new expanded state when toggled. */
  @Output() expandedChange = new EventEmitter<boolean>();

  /**
   * Whether the body may overflow the card. Kept `false` while collapsed and
   * during the open/close animation (so the body is clipped as it grows), then
   * flipped `true` once fully expanded — otherwise overflowing children like a
   * `tb-select` dropdown panel would be cut off by the card's clip.
   */
  overflowVisible = false;

  /**
   * The open / close motion is on only once the card has been toggled (or its
   * `expanded` changed after it rendered): a card that renders open simply
   * appears. Without this a card inserted beside others — a tab's stack of
   * cards — could play its opening on first render: a layout read elsewhere in
   * the same pass lets the browser see it closed before it's marked expanded.
   */
  animated = false;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["expanded"] && !changes["expanded"].firstChange) {
      this.animated = true;
    }
  }

  ngOnInit(): void {
    this.overflowVisible = this.expanded;
  }

  toggle(): void {
    if (!this.collapsible) {
      return;
    }
    this.animated = true;
    this.expanded = !this.expanded;
    // Re-clip immediately when collapsing; the open transition lifts the clip
    // on transitionend (see onBodyTransitionEnd).
    if (!this.expanded) {
      this.overflowVisible = false;
    }
    this.expandedChange.emit(this.expanded);
  }

  /** Lift the clip once the open animation finishes (so dropdowns can escape). */
  onBodyTransitionEnd(): void {
    if (this.expanded) {
      this.overflowVisible = true;
    }
  }
}
