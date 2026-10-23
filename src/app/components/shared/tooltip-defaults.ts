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

import { Provider } from "@angular/core";
import { MAT_TOOLTIP_DEFAULT_OPTIONS, MatTooltipDefaultOptions } from "@angular/material/tooltip";

/**
 * Delay (ms) before any tooltip shows, across every dashboard in this bundle
 * (0 = instant; Material's tooltip already pops in with its own scale animation).
 * Keep in sync with `$tooltip-show-delay` in styles/_tooltip.scss (CSS tooltips).
 */
export const TB_TOOLTIP_SHOW_DELAY_MS = 0;

export const tbTooltipDefaults: MatTooltipDefaultOptions = {
  showDelay: TB_TOOLTIP_SHOW_DELAY_MS,
  hideDelay: 0,
  touchendHideDelay: 1500,
};

/**
 * matTooltip defaults for the extension. Registered once on the root
 * ThingsboardExtensionWidgetsModule: ThingsBoard compiles each widget as a
 * standalone component importing this bundle's modules, so the provider reaches
 * every widget (current and future) — without touching ThingsBoard's own UI.
 */
export function provideTbTooltipDefaults(): Provider {
  return { provide: MAT_TOOLTIP_DEFAULT_OPTIONS, useValue: tbTooltipDefaults };
}
