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
import { SkeletonCardComponent } from "../skeleton-card/skeleton-card.component";

/** The longest the loading page waits: past it, the dashboard shows whatever has loaded (a source that never answers can't hold it). */
export const DASHBOARD_LOADING_MAX_MS = 20000;
/** The fade-out — the shared expand timing (styles/_motion.scss `$expand-duration`). */
const FADE_MS = 250;

/**
 * The launch — the first loading page of a widget's dashboards in this window (Home's, or a standalone app's) — is it over, and
 * how many dashboards' loading pages are alive (none left: the next one is a new widget's launch). Module-wide: Home's and the
 * app it opens on share one.
 */
let launched = false;
let rootPages = 0;
/**
 * The loading pages loading now (their `loading` on), and the launch's pages, told when one stops: the launch waits on every
 * loading page of the first view — a section's too (Home opening on its Entities or Settings page) — so the page under it comes
 * in whole, never its wireframes and its rail first.
 */
const loadingNow = new Set<DashboardLoadingComponent>();
const launches = new Set<DashboardLoadingComponent>();

function loadingChanged(): void {
  launches.forEach((page) => page.settle());
}

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
 * The loading page every dashboard shows while it first loads — an app's
 * first load, the only place the logo spins. The launch (a widget's first —
 * Home's and the app the URL opens it on, one page: Home waits on the app's
 * first load) covers the whole dashboard, its rail too, the logo at once at
 * the widget's centre, where ThingsBoard's own loading logo just was — one
 * steady logo from ThingsBoard's start to the first page, which then comes in
 * whole. After it (an app opened from the rail), it covers the app's area
 * under the rail (usable, its tooltips steady), the logo fading in. The app's
 * logo as its spinner (`tb-logo-spinner`) — no text — while `loading` is
 * true — then it fades away (and shows again if it
 * turns true again: which loads count is the caller's {@link FirstLoad}).
 * Placed last in the dashboard's root (positioned, by the shared frame),
 * which it covers; `section`: a section's within the app, over its own
 * component (positioned, and its own stacking context — `isolation: isolate`
 * — so it covers the tables' sticky headers and bubbles yet stays under the
 * dashboard's panels) — its content's wireframe (`wireframe`: its table, or
 * its form's cards), not the logo:
 *
 * ```html
 * <tb-dashboard-loading [loading]="pageLoading"></tb-dashboard-loading>
 * <tb-dashboard-loading [section]="true" [loading]="firstLoads.pending(section, sectionLoading)"></tb-dashboard-loading>   (firstLoads = firstLoadsOf(store))
 * ```
 */
@Component({
  selector: "tb-dashboard-loading",
  template: `<div *ngIf="shown && !(section && wireframe === 'none')" class="dl" [class.dl-leaving]="leaving" [class.dl-pop]="!section && !launch" role="status" aria-live="polite"
    [attr.aria-label]="section ? label : null">
    <tb-logo-spinner *ngIf="!section; else wireframeView" [label]="label"></tb-logo-spinner>
    <ng-template #wireframeView>
      <tb-skeleton-card *ngIf="wireframe === 'table'; else formWireframe" kind="table" [rows]="20" [fill]="true"></tb-skeleton-card>
      <ng-template #formWireframe>
        <div class="dl-form">
          <tb-skeleton-card kind="figures" [rows]="2"></tb-skeleton-card>
          <tb-skeleton-card kind="figures" [rows]="3"></tb-skeleton-card>
          <tb-skeleton-card kind="list" [rows]="3"></tb-skeleton-card>
        </div>
      </ng-template>
    </ng-template>
  </div>`,
  styleUrls: ["./dashboard-loading.component.scss"],
  standalone: true,
  imports: [CommonModule, LogoSpinnerComponent, SkeletonCardComponent],
})
export class DashboardLoadingComponent implements OnInit, OnChanges, OnDestroy {
  /** Never let the browser's native tooltip show on the host. */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;

  /** Still loading: the page shows; false: it fades away. */
  @Input() loading = true;
  /** What it says to assistive tech (nothing shows it: the logo is the page). */
  @Input() label = "Loading";
  /**
   * A section's within an app (a Settings section, an Entities page — over its component, under the dashboard's panels) rather
   * than the whole dashboard's: its content's wireframe, never the logo — the logo spinner is only an app's first load.
   */
  @Input() @HostBinding("class.dl-section") section = false;
  /**
   * A section's wireframe: its table (a card filling it — column headings, rows), its form's cards (a narrow column), or `none`
   * — the section draws its own in place (its table's rows, its filters: the Entities pages, Access › Health), this only telling
   * the launch it's still loading (nothing drawn).
   */
  @Input() wireframe: "table" | "form" | "none" = "table";

  /**
   * The launch's (a widget's first loading page — set as it starts): over everything, its rail too, so nothing pops in beside
   * the logo — which shows at once, where ThingsBoard's own loading logo was (the widget's centre), carrying it on. Later (an
   * app opened from the rail): over the app's area, under the rail, its logo fading in.
   */
  @HostBinding("class.dl-launch") launch = false;

  shown = true;
  leaving = false;
  private initialized = false;
  private destroyed = false;
  private fadeTimer: ReturnType<typeof setTimeout> | undefined;
  private maxTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private cd: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.initialized = true;
    if (!this.section) {
      rootPages++;
      this.launch = !launched;
    }
    if (this.launch) {
      // Up from the first frame (ThingsBoard's own loader just went), then settled once the view's other loading pages — its
      // sections' — have registered: it waits on them too.
      launches.add(this);
      this.shown = true;
      this.armMax();
      setTimeout(() => this.settle());
    } else {
      this.shown = this.loading; // loaded before it ever showed: never shows
      if (this.loading) {
        this.armMax();
      }
    }
    this.track();
  }

  ngOnChanges(): void {
    if (!this.initialized) {
      return; // ngOnInit takes the first value
    }
    this.track();
    if (this.launch && launches.has(this)) {
      this.settle();
    } else if (this.loading) {
      this.show();
    } else {
      this.leave();
    }
  }

  /** The launch: up while it or any other loading page of the view is loading; else it fades — the page comes in whole. */
  settle(): void {
    if (this.destroyed || !launches.has(this)) {
      return;
    }
    const waiting = this.loading || [...loadingNow].some((page) => page !== this);
    if (waiting) {
      this.show();
    } else {
      this.leave();
    }
    // Told from another loading page's change (mid check): drawn once that check is through.
    queueMicrotask(() => !this.destroyed && this.cd.detectChanges());
  }

  /** This page's loading, for the launch's wait. */
  private track(): void {
    const was = loadingNow.has(this);
    if (this.loading) {
      loadingNow.add(this);
    } else {
      loadingNow.delete(this);
    }
    if (was !== this.loading) {
      loadingChanged();
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    clearTimeout(this.fadeTimer);
    clearTimeout(this.maxTimer);
    launches.delete(this);
    if (loadingNow.delete(this)) {
      loadingChanged();
    }
    if (!this.section) {
      rootPages = Math.max(0, rootPages - 1);
      if (!rootPages) {
        launched = false; // its widget gone: the next one launches anew
      }
    }
  }

  /** Loading again (the next section's first load): back at once — the launch's only while it's still on. */
  private show(): void {
    if (this.shown && !this.leaving) {
      return;
    }
    clearTimeout(this.fadeTimer);
    if (!this.section) {
      this.launch = !launched;
    }
    this.shown = true;
    this.leaving = false;
    this.armMax();
  }

  /** The longest wait: past it, whatever has loaded shows. */
  private armMax(): void {
    clearTimeout(this.maxTimer);
    this.maxTimer = setTimeout(() => {
      launches.delete(this); // the launch given up: whatever has loaded shows, and it doesn't come back
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
      if (this.launch) {
        launched = true; // the launch is over: later loading pages are the logo over an app's area, under the rail
        launches.delete(this);
      }
      this.cd.markForCheck();
      this.cd.detectChanges();
    }, FADE_MS);
  }
}
