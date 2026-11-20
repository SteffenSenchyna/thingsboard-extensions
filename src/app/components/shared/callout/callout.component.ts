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
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";

/** A callout's kind: its colour, its icon and — with no title of its own — its title (Obsidian's callout types). */
export type CalloutType = "note" | "info" | "success" | "question" | "warning" | "error" | "quote";

const CALLOUTS: Record<CalloutType, { icon: string; title: string }> = {
  note: { icon: "edit", title: "Note" },
  info: { icon: "info", title: "Info" },
  success: { icon: "check", title: "Success" },
  question: { icon: "help", title: "Question" },
  warning: { icon: "warning", title: "Warning" },
  error: { icon: "error", title: "Error" },
  quote: { icon: "format_quote", title: "Quote" },
};

/**
 * A callout — a note set apart from what's around it, as in the Obsidian
 * notes this look comes from (the GitHub theme with its callout snippet): a
 * bar in the callout's colour down its left edge, that colour at 10% as its
 * background, a bold title in that colour after its icon, and the text under
 * it in the normal text colour. Its colour is the dashboards' own for the
 * kind: the brand accent (note, info), the status scale (success — green,
 * question and warning — orange, error — red: no yellow), grey (quote).
 *
 * ```html
 * <tb-callout type="warning" title="Membership follows the hierarchy only at a sync">
 *   A device added later reaches its groups at the next sync.
 * </tb-callout>
 * ```
 */
@Component({
  selector: "tb-callout",
  template: `<div class="co-title">
      <mat-icon>{{ icon }}</mat-icon>
      <span class="co-title-text">{{ title || defaultTitle }}</span>
    </div>
    <div class="co-content"><ng-content></ng-content></div>`,
  styleUrls: ["./callout.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule],
})
export class CalloutComponent {
  /** No native tooltip from the `title` input. */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;
  @Input() type: CalloutType = "note";
  /** Its title (none: the kind's name — "Warning"). */
  @Input() title = "";
  /** Its icon (Material), in place of the kind's. */
  @Input() iconName = "";

  @HostBinding("class") get kind(): string {
    return `co-${this.type}`;
  }

  get icon(): string {
    return this.iconName || (CALLOUTS[this.type] ?? CALLOUTS.note).icon;
  }

  get defaultTitle(): string {
    return (CALLOUTS[this.type] ?? CALLOUTS.note).title;
  }
}
