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

import { NgZone } from "@angular/core";

/** Zoom: its bounds; a + / − step (a double click's too); a wheel's rate a pixel of its delta (a trackpad's pinch: Ctrl + wheel). */
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 1.25;
const WHEEL_RATE = 0.0015;
const PINCH_RATE = 0.01;
/** Showing the whole drawing: the room kept round it — at the left, the controls' column. Never past 1:1. */
const FIT_INSET = { left: 60, right: 24, top: 24, bottom: 24 };
/** The canvas' dots: their spacing at 1:1 (the help drawings'), halved or doubled as it zooms to stay between these. */
const DOT_GRID = 17;
const DOT_MIN = 10;
const DOT_MAX = 34;
/** A move made by a button (zoom, show all): it glides this long (none with reduced motion); a drag, the wheel or a pinch follow at once. */
const GLIDE_MS = 220;
/** The canvas' class while it's dragged (`diagram.tb-map-canvas`: the grabbing hand). */
const PANNING = "tb-panning";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export interface PanZoomOptions {
  /** A press on these (the controls) doesn't pan, nor a double click zoom. */
  ignore?: string;
  /** The canvas or the drawing changed size (it's drawn again, then `refit`). */
  onResize?: () => void;
  /**
   * The dots' spacing at 1:1, in the drawing's units (the help drawings' 17 when not given) — a drawing that snaps to a grid (the
   * Wire graph's boxes, on ESF's composer's 20) gives its own, so its boxes land on the dots at any zoom (halved or doubled).
   */
  grid?: number;
  /**
   * Zoomed by its buttons alone (a drawing in a page that scrolls — an ESF unit's Wire graph): the wheel scrolls the page past it,
   * a double click and a pinch (a trackpad's, two fingers') leave the zoom as it is; a drag still pans.
   */
  buttonZoom?: boolean;
}

/**
 * A drawing on a canvas moved as a map's (the fuel code's Assignment tree, an ESF unit's Wire graph): a drag pans it, the wheel, a
 * pinch or a double click zoom about the pointer (not where it zooms by its buttons alone, `buttonZoom`), and the buttons zoom
 * about the centre or show it all. Shown, the whole drawing
 * is fitted in (never past 1:1), and fitted again as it changes (`refit`) until the viewer moves it. The view is a transform on
 * the drawing's layer — its offsets, which a drawing may measure, stay as laid out — and the canvas' dots move and scale with it.
 * Everything runs outside Angular: nothing in a template changes as the view moves.
 *
 * The canvas: `diagram.tb-map-canvas`; the layer (absolute, at its top left, `transform-origin: 0 0`) hidden until first placed;
 * the controls: `diagram.tb-map-controls`.
 */
export class PanZoom {
  /** The viewer has moved the view: kept as the drawing changes (else it's fitted again). */
  moved = false;

  private viewport: HTMLElement | null = null;
  private layerSelector = "";
  private listeners?: AbortController;
  private observer?: ResizeObserver;
  private glideTimer?: ReturnType<typeof setTimeout>;
  /** The view: the layer's offset in the canvas, and its scale. */
  private x = 0;
  private y = 0;
  private k = 1;
  /** The canvas is on the page: shown again, the drawing is fitted afresh. */
  private shown = false;
  /** The pointers down on the canvas (a drag: one; a pinch: two), where each was last. */
  private readonly pointers = new Map<number, { x: number; y: number }>();

  constructor(
    private readonly zone: NgZone,
    private readonly options: PanZoomOptions = {}
  ) {}

  /** On this canvas, moving the layer it holds (by its selector): its handlers on, it and the layer watched for size changes. */
  attach(viewport: HTMLElement, layerSelector: string): void {
    this.detach();
    this.viewport = viewport;
    this.layerSelector = layerSelector;
    this.zone.runOutsideAngular(() => {
      const ac = (this.listeners = new AbortController());
      const on = { signal: ac.signal };
      viewport.addEventListener("pointerdown", (e) => this.onPointerDown(e), on);
      viewport.addEventListener("pointermove", (e) => this.onPointerMove(e), on);
      viewport.addEventListener("pointerup", (e) => this.onPointerUp(e), on);
      viewport.addEventListener("pointercancel", (e) => this.onPointerUp(e), on);
      if (!this.options.buttonZoom) {
        viewport.addEventListener("dblclick", (e) => this.onDoubleClick(e), on);
        viewport.addEventListener("wheel", (e) => this.onWheel(e), { signal: ac.signal, passive: false }); // it zooms: the page doesn't scroll
      }
      this.observer = new ResizeObserver(() => this.onResize());
      this.observer.observe(viewport);
      const layer = this.layer();
      if (layer) {
        this.observer.observe(layer);
      }
    });
  }

  detach(): void {
    this.listeners?.abort();
    this.observer?.disconnect();
    this.pointers.clear();
    this.viewport = null;
  }

  destroy(): void {
    this.detach();
    clearTimeout(this.glideTimer);
  }

  /** Show the whole drawing (centred, never past 1:1): and keep it so as it changes, until it's moved again. */
  showAll(): void {
    this.moved = false;
    this.fit(true);
  }

  zoomIn(): void {
    this.zoomCentre(ZOOM_STEP);
  }

  zoomOut(): void {
    this.zoomCentre(1 / ZOOM_STEP);
  }

  /** The view's zoom (a drag's move on the page, divided by it, is its move on the drawing). */
  get scale(): number {
    return this.k;
  }

  /** A point of the page as a point of the drawing (its layer, as laid out: where a wire being drawn ends). */
  toLayer(clientX: number, clientY: number): { x: number; y: number } {
    if (!this.viewport) {
      return { x: 0, y: 0 };
    }
    const p = this.local(clientX, clientY);
    return { x: (p.x - this.x) / this.k, y: (p.y - this.y) / this.k };
  }

  /**
   * The drawing's own offsets moved by (dx, dy) of its units — laid out again with another origin (a box dragged past the drawing's
   * left or top edge, or the one there taken out): the view moves the other way, so nothing moves on the screen.
   */
  offset(dx: number, dy: number): void {
    if (!dx && !dy) {
      return;
    }
    this.x -= dx * this.k;
    this.y -= dy * this.k;
    this.glide(false);
    this.apply();
  }

  /** The drawing changed: fitted again, unless the viewer has moved the view. */
  refit(): void {
    if (!this.moved) {
      this.fit(false);
    }
  }

  private layer(): HTMLElement | null {
    return this.viewport?.querySelector<HTMLElement>(this.layerSelector) ?? null;
  }

  private zoomCentre(factor: number): void {
    const vp = this.viewport;
    if (!vp) {
      return;
    }
    this.glide(true);
    this.zoomAbout({ x: vp.clientWidth / 2, y: vp.clientHeight / 2 }, factor);
    this.moved = true;
    this.apply();
  }

  /** Zoom by `factor` about a point of the canvas (it stays where it is), within the bounds. */
  private zoomAbout(p: { x: number; y: number }, factor: number): void {
    const k = clamp(this.k * factor, MIN_ZOOM, MAX_ZOOM);
    this.x = p.x - ((p.x - this.x) * k) / this.k;
    this.y = p.y - ((p.y - this.y) * k) / this.k;
    this.k = k;
  }

  /** A point of the page as a point of the canvas (its padding box: where the layer is placed). */
  private local(clientX: number, clientY: number): { x: number; y: number } {
    const vp = this.viewport!;
    const r = vp.getBoundingClientRect();
    return { x: clientX - r.left - vp.clientLeft, y: clientY - r.top - vp.clientTop };
  }

  /** The canvas or the drawing changed size: off the page, nothing; back on it, fitted afresh; else drawn again. */
  private onResize(): void {
    if (!this.viewport?.clientWidth) {
      this.shown = false;
      return;
    }
    if (!this.shown) {
      this.shown = true;
      this.moved = false;
    }
    this.options.onResize?.();
  }

  private ignored(e: Event): boolean {
    return !!this.options.ignore && !!(e.target as HTMLElement).closest(this.options.ignore);
  }

  private onPointerDown(e: PointerEvent): void {
    // Zoomed by its buttons alone: a second finger makes no pinch, the first one's drag pans on.
    if (e.button !== 0 || this.ignored(e) || (this.options.buttonZoom && this.pointers.size)) {
      return;
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.viewport?.setPointerCapture(e.pointerId);
    this.viewport?.classList.add(PANNING);
    this.glide(false);
  }

  /** One pointer: a pan. Two: a pinch — zoomed by how far apart they've moved, about their midpoint, its own move a pan. */
  private onPointerMove(e: PointerEvent): void {
    const last = this.pointers.get(e.pointerId);
    if (!last) {
      return;
    }
    const other = [...this.pointers.entries()].find(([id]) => id !== e.pointerId)?.[1];
    if (e.clientX === last.x && e.clientY === last.y) {
      return; // a press that hasn't moved (a click): the view is still the fitted one
    }
    if (!other) {
      this.x += e.clientX - last.x;
      this.y += e.clientY - last.y;
    } else {
      const before = this.local((last.x + other.x) / 2, (last.y + other.y) / 2);
      const after = this.local((e.clientX + other.x) / 2, (e.clientY + other.y) / 2);
      this.x += after.x - before.x;
      this.y += after.y - before.y;
      const spanBefore = Math.hypot(last.x - other.x, last.y - other.y);
      if (spanBefore > 0) {
        this.zoomAbout(after, Math.hypot(e.clientX - other.x, e.clientY - other.y) / spanBefore);
      }
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.moved = true;
    this.apply();
  }

  private onPointerUp(e: PointerEvent): void {
    this.pointers.delete(e.pointerId);
    if (!this.pointers.size) {
      this.viewport?.classList.remove(PANNING);
    }
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1; // lines, pages → pixels
    this.glide(false);
    this.zoomAbout(this.local(e.clientX, e.clientY), Math.exp(-e.deltaY * unit * (e.ctrlKey ? PINCH_RATE : WHEEL_RATE)));
    this.moved = true;
    this.apply();
  }

  private onDoubleClick(e: MouseEvent): void {
    if (this.ignored(e)) {
      return;
    }
    this.glide(true);
    this.zoomAbout(this.local(e.clientX, e.clientY), ZOOM_STEP);
    this.moved = true;
    this.apply();
  }

  /** Fit the whole drawing in the canvas (centred in the room the controls leave, never past 1:1). */
  private fit(glide: boolean): void {
    const vp = this.viewport;
    const layer = this.layer();
    if (!vp?.clientWidth || !layer?.offsetWidth) {
      return;
    }
    const w = layer.offsetWidth;
    const h = layer.offsetHeight;
    const roomW = vp.clientWidth - FIT_INSET.left - FIT_INSET.right;
    const roomH = vp.clientHeight - FIT_INSET.top - FIT_INSET.bottom;
    this.k = clamp(Math.min(1, roomW / w, roomH / h), MIN_ZOOM, 1);
    this.x = Math.round(FIT_INSET.left + (roomW - w * this.k) / 2);
    this.y = Math.round(FIT_INSET.top + (roomH - h * this.k) / 2);
    this.glide(glide);
    this.apply();
  }

  /** The view onto the page: the layer's transform (shown from its first), the dots' spacing and offset with it. */
  private apply(): void {
    const vp = this.viewport;
    const layer = this.layer();
    if (!vp || !layer) {
      return;
    }
    layer.style.transform = `translate(${this.x}px, ${this.y}px) scale(${this.k})`;
    // What's drawn at the screen's own size whatever the zoom (the Wire graph's delete pop-up): `scale(calc(1 / var(--pz-scale)))`.
    layer.style.setProperty("--pz-scale", String(this.k));
    layer.style.visibility = "visible";
    let dot = (this.options.grid ?? DOT_GRID) * this.k;
    while (dot < DOT_MIN) {
      dot *= 2;
    }
    while (dot > DOT_MAX) {
      dot /= 2;
    }
    vp.style.backgroundSize = `${dot}px ${dot}px`;
    vp.style.backgroundPosition = `${this.x}px ${this.y}px`;
  }

  /** The next view change glides (a button's) or follows at once (a drag, the wheel). */
  private glide(on: boolean): void {
    const vp = this.viewport;
    const layer = this.layer();
    if (!vp || !layer) {
      return;
    }
    clearTimeout(this.glideTimer);
    const ms = on && !matchMedia("(prefers-reduced-motion: reduce)").matches ? GLIDE_MS : 0;
    layer.style.transition = ms ? `transform ${ms}ms ease` : "";
    vp.style.transition = ms ? `background-position ${ms}ms ease, background-size ${ms}ms ease` : "";
    if (ms) {
      this.zone.runOutsideAngular(() => (this.glideTimer = setTimeout(() => this.glide(false), ms + 20)));
    }
  }
}
