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

import { Component } from "@angular/core";

/**
 * Plain content card — the shared card shell (background, border, card radius)
 * with the standard 16px padding. Wrap any content that should read as a card:
 *
 * ```html
 * <tb-card>…content…</tb-card>
 * ```
 *
 * Cards with their own internal chrome (collapsible header, table rows) use
 * the same shell via the `tb-card-shell` mixin instead, so a change to the
 * shell propagates to every card either way.
 */
@Component({
  selector: "tb-card",
  template: "<ng-content></ng-content>",
  styleUrls: ["./card.component.scss"],
  standalone: true,
})
export class CardComponent {}
