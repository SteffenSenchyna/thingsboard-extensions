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
 * closing it: clicks inside a panel (or on the panels' trail on its edge), on a clickable table row (that switches the
 * panel to the row instead), in the themed confirm dialog, or in a Material
 * overlay (tooltips, menus, selects). Anything else — blank table space, column
 * headers, the paginator, non-clickable rows, the rest of the dashboard — is an
 * outside click that closes the panel. Shared so every dashboard behaves alike.
 */
export function keepsSidePanelOpen(target: EventTarget | null): boolean {
  const el = target instanceof Element ? target : null;
  return !!el?.closest(
    "tb-entity-detail-panel, tb-detail-panel, tb-panel-trail, tr.dt-row-clickable, tb-ext-confirm-dialog, tb-date-range-picker, .cdk-overlay-container"
  );
}

/** The class a panel puts on the table row under the pointer while its scrim covers the table (the table styles it as `:hover`). */
export const ROW_HOVER_CLASS = "dt-row-hover";

/**
 * The clickable table row at a point of the screen under a panel's click-off
 * scrim, and the element of it there (what a click would land on — the row,
 * a count in it); null: no such row. A dismissible panel passes such a click
 * on to the row: the row opens in the panel's place (and, on the panels'
 * trail, as its next stop) instead of the click only closing the panel —
 * but a table in Manage (its rows are checked, not opened).
 */
export function clickableRowUnder(x: number, y: number): { row: Element; target: Element } | null {
  const target = document.elementsFromPoint(x, y).find((el) => !el.classList.contains("dp-backdrop"));
  const row = target?.closest("tr.dt-row-clickable");
  // Not a row being checked (a table in Manage, under its "Edit (n)" panel): there a click-off closes, as anywhere else.
  return target && row && !row.querySelector(".dt-select-cell") ? { row, target } : null;
}

/**
 * The box a wheel over a panel's scrim scrolls: the nearest box under the point that scrolls the wheel's way and still can (a
 * table's rows, a page's column); null — none can. The scrim passes the page its wheel, so what's under it still scrolls with a
 * panel open.
 */
export function scrollBoxUnder(x: number, y: number, dx: number, dy: number): Element | null {
  let el: Element | null = document.elementsFromPoint(x, y).find((e) => !e.classList.contains("dp-backdrop")) ?? null;
  const scrolls = (v: string) => v === "auto" || v === "scroll" || v === "overlay";
  for (; el; el = el.parentElement) {
    const cs = getComputedStyle(el);
    const canY = dy !== 0 && scrolls(cs.overflowY) && (dy > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0);
    const canX = dx !== 0 && scrolls(cs.overflowX) && (dx > 0 ? el.scrollLeft + el.clientWidth < el.scrollWidth - 1 : el.scrollLeft > 0);
    if (canY || canX) {
      return el;
    }
  }
  return null;
}
