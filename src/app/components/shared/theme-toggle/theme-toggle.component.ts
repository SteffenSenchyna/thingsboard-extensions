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

import { Component, EventEmitter, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";

/**
 * Light/dark theme toggle — a TTS-style outlined icon button (sun / moon) with a
 * dark tooltip. Presentational only: it reflects {@link dark} and emits
 * {@link toggle}; persistence is the host's responsibility.
 */
@Component({
  selector: "tb-theme-toggle",
  templateUrl: "./theme-toggle.component.html",
  styleUrls: ["./theme-toggle.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule],
})
export class ThemeToggleComponent {
  @Input() dark = false;
  @Output() toggled = new EventEmitter<void>();
}
