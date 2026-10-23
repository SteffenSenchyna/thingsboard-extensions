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

/**
 * Whether a pointer-down should leave an open side panel alone instead of
 * closing it: clicks inside a panel, on a clickable table row (that switches the
 * panel to the row instead), in the themed confirm dialog, or in a Material
 * overlay (tooltips, menus, selects). Anything else — blank table space, column
 * headers, the paginator, non-clickable rows, the rest of the dashboard — is an
 * outside click that closes the panel. Shared so every dashboard behaves alike.
 */
export function keepsSidePanelOpen(target: EventTarget | null): boolean {
  const el = target instanceof Element ? target : null;
  return !!el?.closest(
    "tb-entity-detail-panel, tb-detail-panel, tr.dt-row-clickable, tb-ext-confirm-dialog, tb-date-range-picker, .cdk-overlay-container"
  );
}
