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

import { Component, HostBinding, Input } from "@angular/core";

/**
 * The app's logo as a loading spinner: the circuit tree and its ring stay
 * still — the ring the spinner's track — and an arc in the brand accent
 * bounces between the two sides of the slit at the ring's foot (where the
 * trunk comes in): out of the left side it grows round the ring to the right
 * side and draws in to it, then grows back round to the left side and draws
 * in to that — picking up speed round the ring, slowing into the slit. The
 * loading page's mark
 * (`tb-dashboard-loading`); all of it the brand accent (the ring a faint
 * tint of it), 96px — a spinner too small to draw the tree in
 * (a table's, a link's) stays a plain ring.
 *
 * ```html
 * <tb-logo-spinner></tb-logo-spinner>
 * ```
 */
@Component({
  selector: "tb-logo-spinner",
  // The ring, twice: the track, and the arc drawn along it — from the slit's left side clockwise to its right.
  template: `<svg viewBox="0 0 200 200" aria-hidden="true" focusable="false">
      <path class="ls-track" d="M82.1 184.1A86 86 0 1 1 117.9 184.1" />
      <path class="ls-arc" d="M82.1 184.1A86 86 0 1 1 117.9 184.1" pathLength="100" />
      <path class="ls-tree" d="M100 194V72M100 150C100 112 64 118 62 92M100 150C100 112 136 118 138 92" />
      <circle class="ls-node" cx="100" cy="58" r="15" />
      <circle class="ls-node" cx="62" cy="80" r="14" />
      <circle class="ls-node" cx="138" cy="80" r="14" />
    </svg>`,
  styleUrls: ["./logo-spinner.component.scss"],
  standalone: true,
})
export class LogoSpinnerComponent {
  /** Never let the browser's native tooltip show on the host. */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;
  @HostBinding("attr.role") readonly role = "img";

  /** What it stands for, for assistive tech (beside a visible label, hide it instead: `aria-hidden="true"`). */
  @Input() @HostBinding("attr.aria-label") label = "Loading";
}
