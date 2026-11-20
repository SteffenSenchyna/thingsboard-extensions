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


import { Component, Injectable } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { CheckboxComponent } from "../checkbox/checkbox.component";

/**
 * Whether a sidebar's filters hide their empty options —
 * {@link FilterSectionsComponent}'s, read by the `tb-check-filter`s and
 * `tb-filter-list`s inside it — and which of them have picks: a filter's
 * counts are its options' totals only while no other one has (each counts
 * under the others), so that's when it takes the snapshot of what's empty.
 * On to start; the last choice holds for the session (another page's sidebar
 * starts with it).
 */
@Injectable()
export class FilterSectionsState {
  private static last = true;
  hideEmpty = FilterSectionsState.last;
  /** Each filter inside: whether it has picks. */
  private picks = new Map<unknown, boolean>();

  set(hide: boolean): void {
    this.hideEmpty = hide;
    FilterSectionsState.last = hide;
  }

  /** A filter's picks changed (reported as they're made, before the others recount). */
  picked(filter: unknown, hasPicks: boolean): void {
    this.picks.set(filter, hasPicks);
  }

  forget(filter: unknown): void {
    this.picks.delete(filter);
  }

  /** Another filter has picks: this one's counts are narrowed by them (not its options' totals). */
  othersPicked(filter: unknown): boolean {
    for (const [f, hasPicks] of this.picks) {
      if (f !== filter && hasPicks) {
        return true;
      }
    }
    return false;
  }
}

/**
 * A sidebar's filter sections, with "Hide empty filters" at their top (on to
 * start): the `tb-check-filter`s and `tb-filter-list`s inside drop their
 * empty options — those with nothing in them at all, not picked: a snapshot
 * taken while no other filter has picks (the counts are then the totals; it
 * follows the data as it loads), held while one has — so picking filters only
 * greys options out at 0, never hides them; a check filter left with none
 * drops its section. It lays its content
 * out as the sidebar's own (no box of its own):
 *
 * ```html
 * <tb-search-box …></tb-search-box>
 * <tb-filter-sections>
 *   <tb-check-filter heading="Statuses" …></tb-check-filter>
 *   <tb-filter-section heading="Markets"><tb-filter-list …></tb-filter-list></tb-filter-section>
 * </tb-filter-sections>
 * ```
 */
@Component({
  selector: "tb-filter-sections",
  template: `<tb-ext-checkbox class="tbfss-hide-empty" label="Hide empty filters" [ngModel]="state.hideEmpty" (ngModelChange)="state.set($event)"></tb-ext-checkbox>
    <ng-content></ng-content>`,
  styleUrls: ["./filter-sections.component.scss"],
  standalone: true,
  imports: [FormsModule, CheckboxComponent],
  providers: [FilterSectionsState],
})
export class FilterSectionsComponent {
  constructor(readonly state: FilterSectionsState) {}
}
