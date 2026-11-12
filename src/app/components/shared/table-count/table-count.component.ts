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

import { Component, EventEmitter, HostBinding, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";

/**
 * A count in a table cell (as UniFi's): its icon and the number — a group's
 * members, a role's groups and members, an Organization item's users. With
 * a click to answer ({@link open} bound), a link to what it counts — brand
 * blue while there's any, the links' hover colour — that opens it (a
 * panel's tab) without the row's own click; without one, a plain count.
 * Unknown yet (null): "…".
 *
 * ```html
 * <ng-template tbDataTableCell="members" let-row>
 *   <tb-table-count [value]="row.members" label="members" [disabled]="managing" (open)="openMembers(row)"></tb-table-count>
 * </ng-template>
 * ```
 */
@Component({
  selector: "tb-table-count",
  templateUrl: "./table-count.component.html",
  styleUrls: ["./table-count.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule],
})
export class TableCountComponent {
  /** No native tooltip (a `title` attribute set on it by mistake). */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;
  /** The count (null: not known yet — "…"). */
  @Input() value: number | null | undefined = null;
  /** What it counts, as its icon (Material). */
  @Input() icon = "person";
  /** What it counts, in words, plural ("members"): the link's name for assistive tech — "3 members". */
  @Input() label = "";
  /** A link not to follow now (a table being managed). */
  @Input() disabled = false;
  /** A click on the count (a link only while it's bound). */
  @Output() open = new EventEmitter<void>();

  /** A link: someone answers its click. */
  get linked(): boolean {
    return this.open.observed;
  }

  get ariaLabel(): string | null {
    return this.label ? `${this.value ?? 0} ${this.label}` : null;
  }

  follow(event: Event): void {
    event.stopPropagation();
    this.open.emit();
  }
}
