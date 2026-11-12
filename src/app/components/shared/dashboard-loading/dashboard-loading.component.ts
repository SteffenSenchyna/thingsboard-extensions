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


import { ChangeDetectorRef, Component, HostBinding, Input, OnChanges, OnDestroy, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { LogoSpinnerComponent } from "../logo-spinner/logo-spinner.component";

/** The longest the loading page waits: past it, the dashboard shows whatever has loaded (a source that never answers can't hold it). */
export const DASHBOARD_LOADING_MAX_MS = 20000;
/** The fade-out — the shared expand timing (styles/_motion.scss `$expand-duration`). */
const FADE_MS = 250;

/**
 * A dashboard's first load: loading until every part it waits on has loaded
 * once — a later reload (a refresh, a filter) never brings the loading page
 * back. `pending(...)` takes the parts' loading flags, each call:
 *
 * ```ts
 * private readonly firstLoad = new FirstLoad();
 * get pageLoading(): boolean { return this.firstLoad.pending(this.devicesLoading, this.alarmsLoading); }
 * ```
 */
export class FirstLoad {
  private ready = false;

  pending(...loading: boolean[]): boolean {
    if (!this.ready && loading.every((l) => !l)) {
      this.ready = true;
    }
    return !this.ready;
  }
}

/** {@link FirstLoad} for each of several parts shown one at a time — a Settings component's sections: each loading page once. */
export class FirstLoads {
  private readonly ready = new Set<string>();

  pending(key: string, ...loading: boolean[]): boolean {
    if (!this.ready.has(key) && loading.every((l) => !l)) {
      this.ready.add(key);
    }
    return !this.ready.has(key);
  }
}

const FIRST_LOADS = new WeakMap<object, FirstLoads>();

/**
 * The {@link FirstLoads} kept on something that outlives a component — a
 * Settings section's store (a section's component is made anew each time the
 * section shows), the widget context: each section's loading page once per
 * dashboard, not on every return to it.
 */
export function firstLoadsOf(owner: object): FirstLoads {
  let loads = FIRST_LOADS.get(owner);
  if (!loads) {
    loads = new FirstLoads();
    FIRST_LOADS.set(owner, loads);
  }
  return loads;
}

/**
 * The loading page every dashboard shows while it first loads: its own
 * background over the whole dashboard (its rail staying on top: usable, its
 * tooltips steady), the app's logo as its spinner (`tb-logo-spinner`) — no
 * text — while `loading` is true — then it fades away (and shows again if it
 * turns true again: which loads count is the caller's {@link FirstLoad}).
 * Placed last in the dashboard's root (positioned, by the shared frame),
 * which it covers; `section`: a Settings section's, over its own component
 * (positioned, and its own stacking context — `isolation: isolate` — so it
 * covers the tables' sticky headers and bubbles yet stays under the
 * dashboard's panels):
 *
 * ```html
 * <tb-dashboard-loading [loading]="pageLoading"></tb-dashboard-loading>
 * <tb-dashboard-loading [section]="true" [loading]="firstLoads.pending(section, sectionLoading)"></tb-dashboard-loading>   (firstLoads = firstLoadsOf(store))
 * ```
 */
@Component({
  selector: "tb-dashboard-loading",
  template: `<div *ngIf="shown" class="dl" [class.dl-leaving]="leaving" role="status" aria-live="polite">
    <tb-logo-spinner [label]="label"></tb-logo-spinner>
  </div>`,
  styleUrls: ["./dashboard-loading.component.scss"],
  standalone: true,
  imports: [CommonModule, LogoSpinnerComponent],
})
export class DashboardLoadingComponent implements OnInit, OnChanges, OnDestroy {
  /** Never let the browser's native tooltip show on the host. */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;

  /** Still loading: the page shows; false: it fades away. */
  @Input() loading = true;
  /** What it says to assistive tech (nothing shows it: the logo is the page). */
  @Input() label = "Loading";
  /** A Settings section's (over its component, under the dashboard's panels) rather than the whole dashboard's. */
  @Input() @HostBinding("class.dl-section") section = false;

  shown = true;
  leaving = false;
  private initialized = false;
  private fadeTimer: ReturnType<typeof setTimeout> | undefined;
  private maxTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private cd: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.initialized = true;
    this.shown = this.loading; // loaded before it ever showed: never shows
    if (this.loading) {
      this.armMax();
    }
  }

  ngOnChanges(): void {
    if (!this.initialized) {
      return; // ngOnInit takes the first value
    }
    if (this.loading) {
      this.show();
    } else {
      this.leave();
    }
  }

  ngOnDestroy(): void {
    clearTimeout(this.fadeTimer);
    clearTimeout(this.maxTimer);
  }

  /** Loading again (the next section's first load): back at once. */
  private show(): void {
    if (this.shown && !this.leaving) {
      return;
    }
    clearTimeout(this.fadeTimer);
    this.shown = true;
    this.leaving = false;
    this.armMax();
  }

  /** The longest wait: past it, whatever has loaded shows. */
  private armMax(): void {
    clearTimeout(this.maxTimer);
    this.maxTimer = setTimeout(() => {
      this.leave();
      this.cd.detectChanges();
    }, DASHBOARD_LOADING_MAX_MS);
  }

  /** Fade out, then go. */
  private leave(): void {
    if (this.leaving || !this.shown) {
      return;
    }
    clearTimeout(this.maxTimer);
    this.leaving = true;
    this.fadeTimer = setTimeout(() => {
      this.shown = false;
      this.cd.markForCheck();
      this.cd.detectChanges();
    }, FADE_MS);
  }
}
