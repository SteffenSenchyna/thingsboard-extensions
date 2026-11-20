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

import { DestroyRef, Directive, ElementRef, inject } from "@angular/core";
import { Subject } from "rxjs";

/** A dashboard narrower than this (px) is laid out for a phone (see {@link DashboardRootDirective})… */
export const PHONE_MAX_WIDTH = 600;
/** …as is one narrower than this and shorter than {@link PHONE_LANDSCAPE_MAX_HEIGHT}: a phone turned on its side. */
export const PHONE_LANDSCAPE_MAX_WIDTH = 960;
export const PHONE_LANDSCAPE_MAX_HEIGHT = 480;
/** The class a dashboard root carries while it's laid out for a phone — what the shared pieces' phone styles key on. */
export const PHONE_CLASS = "tb-phone";

/**
 * A dashboard's root (the element the shared frame styles, carrying `dark`): while it's narrower than {@link PHONE_MAX_WIDTH} —
 * a phone, or a window that narrow — or a phone on its side (narrower than {@link PHONE_LANDSCAPE_MAX_WIDTH}, shorter than
 * {@link PHONE_LANDSCAPE_MAX_HEIGHT}), it carries {@link PHONE_CLASS}, and the shared frame lays out for a phone: the rail a
 * navbar card floating at the foot, an app's pages and "…" in its popup (`tb-nav-rail`), no filter sidebar
 * (`tb-sidebar-layout`), a table that scrolls in its card one endless list (`tb-data-table`), the side panels the dashboard's
 * width but a sliver (`tb-detail-panel`, the panels' trail in the sliver), the alarms a sheet from the bottom (`tb-alarm-panel`,
 * `tb-bottom-sheet`), the toasts across the top and the
 * calendar one month. Measured on the root itself (the widget's size, not the window's), so a nested app (Home's) goes by its
 * own. Its pieces style themselves with `:host-context(.tb-phone)`; one that acts on it injects the directive (its `phone`,
 * `changes`) or reads {@link isPhoneLayout}.
 *
 * ```html
 * <div tbDashboardRoot [class.dark]="darkMode" class="qc-dashboard">…</div>
 * ```
 */
@Directive({
  selector: "[tbDashboardRoot]",
  standalone: true,
})
export class DashboardRootDirective {
  /** Laid out for a phone now. */
  phone = false;
  /** {@link phone} changed (as the root's class does, before the next paint) — a piece that binds to it redraws on it. */
  readonly changes = new Subject<boolean>();

  constructor() {
    const el = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    // Nested in another dashboard's root (an app in Home's): that root marked while this one is there — its page scrolls in
    // this root's main column, not in its own (`HAS_NESTED_CLASS`). Found once it's on the page (the first resize).
    let outer: Element | null | undefined;
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => outer && markNested(outer, false));
    // Set on the element itself (not a host binding): it lands with the resize, whatever the dashboard's change detection does.
    const observer = new ResizeObserver(([entry]) => {
      if (outer === undefined) {
        outer = el.parentElement?.closest("[tbdashboardroot]") ?? null;
        if (outer) {
          markNested(outer, true);
        }
      }
      const { width, height } = entry.contentRect;
      const phone = width > 0 && (width < PHONE_MAX_WIDTH || (width < PHONE_LANDSCAPE_MAX_WIDTH && height < PHONE_LANDSCAPE_MAX_HEIGHT));
      if (phone !== this.phone) {
        this.phone = phone;
        el.classList.toggle(PHONE_CLASS, phone);
        if (phone) {
          holdFieldZoom();
        }
        this.changes.next(phone);
      }
    });
    observer.observe(el);
    destroyRef.onDestroy(() => observer.disconnect());
  }
}

/**
 * iOS zooms the page in as a field takes the focus when its text is under 16px (and leaves it zoomed): on an iPhone or iPad the
 * page's viewport gets `maximum-scale=1`, which holds that zoom off — iOS still lets a pinch zoom (it ignores the limit for the
 * user's own gestures) — so a phone's fields keep the dashboards' own text size. Elsewhere (Android: nothing zooms on a focus,
 * and the limit would stop a pinch) the viewport stays as ThingsBoard set it.
 */
function holdFieldZoom(): void {
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (ios && meta && !/maximum-scale/.test(meta.content)) {
    meta.content = `${meta.content}, maximum-scale=1`;
  }
}

/**
 * The class a dashboard root carries while another dashboard's root is nested in it (Home's, with an app open): on a phone the
 * page scrolls in the nested app's main column — this root's own main column stays put around it.
 */
export const HAS_NESTED_CLASS = "tb-has-nested";

/** Each root's nested roots: the class on while there's any. */
const nestedCount = new WeakMap<Element, number>();

function markNested(outer: Element, nested: boolean): void {
  const count = Math.max(0, (nestedCount.get(outer) ?? 0) + (nested ? 1 : -1));
  nestedCount.set(outer, count);
  outer.classList.toggle(HAS_NESTED_CLASS, count > 0);
}

/** The element is in a dashboard laid out for a phone (its root, or a nested app's, carries {@link PHONE_CLASS}). */
export function isPhoneLayout(el: Element | null | undefined): boolean {
  return !!el?.closest(`.${PHONE_CLASS}`);
}

/**
 * The class a phone's dashboard root carries while a sheet over it is open (a detail panel's, the alarms', the filters') — and
 * every root it's nested in (an app's in Home's): the navbar and the filters button step aside under it, so a sheet is never cut
 * off by the bar (a nested app's sheet can't rise over Home's bar, which is outside its stacking).
 */
export const SHEET_OPEN_CLASS = "tb-sheet-open";

/** Each root's open sheets (their owners): the class on while there's any. */
const openSheets = new WeakMap<Element, Set<object>>();

/**
 * A sheet's owner opened (`open`) or closed its sheet over `el`'s dashboard roots: {@link SHEET_OPEN_CLASS} on every phone root
 * `el` is in while any sheet is open there. Returns the roots marked, to unmark the same ones later (`markSheetOpen(owner, el, false, roots)`).
 */
export function markSheetOpen(owner: object, el: Element, open: boolean, roots?: Element[]): Element[] {
  const list = roots ?? [];
  if (!roots) {
    for (let root = el.closest(`.${PHONE_CLASS}`); root; root = root.parentElement?.closest(`.${PHONE_CLASS}`) ?? null) {
      list.push(root);
    }
  }
  for (const root of list) {
    const owners = openSheets.get(root) ?? new Set<object>();
    if (open) {
      owners.add(owner);
    } else {
      owners.delete(owner);
    }
    openSheets.set(root, owners);
    root.classList.toggle(SHEET_OPEN_CLASS, owners.size > 0);
  }
  return list;
}
