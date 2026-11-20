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

import { Component, ElementRef, EventEmitter, HostBinding, Input, NgZone, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild } from "@angular/core";
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";
import { TipDirective } from "../../../components/shared/tip/tip.directive";
import { CardComponent } from "../../../components/shared/card/card.component";
import { PanZoom } from "../../../components/shared/pan-zoom/pan-zoom";
import { CodeMap, CodeMapMarket, CodeMapSite } from "../../models/fuel-management.models";

const SVG = "http://www.w3.org/2000/svg";
/**
 * The connectors' look, set on each element drawn: elements made in code get none of the component's (encapsulated) styles — a
 * class alone leaves SVG's defaults, a black fill. Dots: a dash a hair long, its round caps the dot, one pattern along each path.
 */
const ACCENT = "var(--c-brand-accent)";
/** Into a full station (the code left out): red, the status scale's error — with a ✕ on it, its badge the canvas' surface. */
const ERROR = "var(--c-bg-error-normal)";
const SURFACE = "var(--c-bg-neutral-min)";
const LINE_STYLE = { fill: "none", stroke: ACCENT, strokeWidth: "2", strokeDasharray: "0.1 5", strokeLinecap: "round" };
const DIM_OPACITY = "0.35";
/** A connector's corner radius, and its gaps: after the parent's box, before the child's head (the arrowhead's tip). */
const CORNER = 10;
const FROM_GAP = 2;
const TO_GAP = 4;
/**
 * The arrowhead's length (its marker's 8 viewBox units at 0.8). The line ends at the head's base and the head runs on to the tip: a
 * line drawn to the tip would show past it — a dot where the triangle narrows to less than the line's width.
 */
const HEAD = 6.4;
/** How far past the parent's box its children's crossbar runs: near the parent, leaving each branch room for a ✕ by its arrowhead. */
const BAR = 12;
/** The ✕ badge: its radius, its centre this far back from the arrowhead's tip (clear of the head). */
const MARK_R = 7;
const MARK_LIFT = 16;
/** A child this close in line with its parent (measured centres round apart by a pixel or two): one straight line, no jog. */
const IN_LINE = 5;

/** The dots' flow along an arrow that reaches (toward its head): one pattern's length (0.1 + 5) a beat. */
const FLOW_PERIOD = 5.1;
const FLOW_MS = 600;
/** Where a still arrow is masked out under a flowing one (a stem they share): this wide round the flowing one. */
const FLOW_MASK_WIDTH = "6";

let instances = 0;

/**
 * Where a code is assigned, as a tree (the code panel's dialog, "View where it's assigned" / its Assigned count): the code › each of
 * its markets › a layer of the market's sites (those the code works at lit, the rest dimmed) › each lit site's stations — every
 * node a dashed box named over it (a market's and a site's with an info icon whose bubble says how the code reaches it, the code's
 * own places tagged "Assigned"). Top down, or left to right (the flip). The boxes are laid out by CSS; the dotted arrows from each
 * node to its children are drawn in one SVG layer from the boxes' measured places — rounded elbows, one dash pattern along each, an
 * arrowhead at each child — again whenever the tree changes size. A station that has the code in the brand accent, one whose list
 * is full (the code left out) in red, one whose table doesn't hold it yet (still loading) grey — the legend under the tree says
 * which (no bubble on a station).
 *
 * On a canvas moved as a map's (the shared `PanZoom`): a drag pans it, the wheel, a pinch or a double click zoom about the pointer;
 * its controls (top left) flip the layout, show the whole tree, zoom in and out. Shown, the whole tree is fitted in (never past
 * 1:1), and fitted again as it changes until the viewer moves it. The view is a transform on the laid-out tree (its offsets, which
 * the drawing measures, stay as laid out); the dots move and scale with it.
 */
@Component({
  selector: "tb-fuel-code-map",
  templateUrl: "./code-map.component.html",
  styleUrls: ["./code-map.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, TipDirective, CardComponent],
})
export class CodeMapComponent implements OnChanges, OnDestroy {
  /** No native tooltip. */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;

  @Input() map: CodeMap | null = null;

  /** Left to right (the flip) instead of top down: the viewer's pick, kept in their settings by the dashboard. */
  @Input() horizontal = false;
  @Output() horizontalChange = new EventEmitter<boolean>();

  @ViewChild("lines") private linesRef?: ElementRef<SVGSVGElement>;
  @ViewChild("layout") private layoutRef?: ElementRef<HTMLElement>;

  /** The canvas (shown once there's a map): moved as a map's, and both it and the tree watched for size changes (drawn again). */
  @ViewChild("viewport") set viewportRef(ref: ElementRef<HTMLElement> | undefined) {
    this.view.detach();
    if (ref) {
      this.view.attach(ref.nativeElement, ".cm-layout");
      this.schedule();
    }
  }

  /** The view: pan, zoom, fit (the shared map canvas's). */
  private readonly view: PanZoom;
  private frame = 0;
  /** This instance's arrowhead marker id (one per tree: ids are page-wide). */
  private readonly arrowId = `cm-arrow-${++instances}`;

  readonly trackById = (_: number, x: { id: string }) => x.id;

  constructor(private readonly zone: NgZone) {
    this.view = new PanZoom(zone, { ignore: ".cm-controls", onResize: () => this.schedule() });
    document.fonts?.ready.then(() => this.schedule());
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["horizontal"] && !changes["horizontal"].firstChange) {
      this.view.moved = false; // laid out the other way: the whole tree shown again
    }
    this.schedule();
  }

  ngOnDestroy(): void {
    this.view.destroy();
    cancelAnimationFrame(this.frame);
  }

  marketTip(m: CodeMapMarket): string {
    return m.assigned
      ? `${m.code}: the code is assigned to this market, so it works at every site of it, sites added later too`
      : `${m.code}: the code is assigned to some of this market's sites`;
  }

  /** A site the code reaches: how (a dimmed site, one it doesn't, has no info icon). */
  siteTip(s: CodeMapSite, m: CodeMapMarket): string {
    return s.assigned ? `${s.name}: the code is assigned to this site` : `${s.name}: the code comes through its market, ${m.code}`;
  }

  /** The flip: top down ⇄ left to right — laid out again, then the whole tree shown; the pick handed up to be kept. */
  flip(): void {
    this.horizontal = !this.horizontal;
    this.view.moved = false;
    this.schedule();
    this.horizontalChange.emit(this.horizontal);
  }

  /** Show the whole tree (centred, never past 1:1): and keep it so as it changes, until it's moved again. */
  showAll(): void {
    this.view.showAll();
  }

  zoomIn(): void {
    this.view.zoomIn();
  }

  zoomOut(): void {
    this.view.zoomOut();
  }

  /** Draw the connectors on the next frame (after the boxes are laid out), outside Angular: nothing in the template changes. */
  private schedule(): void {
    this.zone.runOutsideAngular(() => {
      cancelAnimationFrame(this.frame);
      this.frame = requestAnimationFrame(() => {
        this.draw();
        this.view.refit();
      });
    });
  }

  /**
   * One path a parent and child: from the middle of the parent's box's far side (its foot, top down; its right, left to right) a
   * little way on, across to the child's middle, on to just before its head — rounded corners; a straight line when they're in
   * line (within {@link IN_LINE}: rounding never makes a jog). Measured as laid out (offsets within the layout, which the view's
   * transform doesn't move). Drawn in the layout's two axes: `m` along the tree (down, or right), `c` across it.
   */
  private draw(): void {
    const layout = this.layoutRef?.nativeElement;
    const svg = this.linesRef?.nativeElement;
    if (!layout || !svg) {
      return;
    }
    const place = (el: HTMLElement) => {
      let x = 0;
      let y = 0;
      for (let e: HTMLElement | null = el; e && e !== layout; e = e.offsetParent as HTMLElement | null) {
        x += e.offsetLeft;
        y += e.offsetTop;
      }
      return { x, y, w: el.offsetWidth, h: el.offsetHeight };
    };
    const across = this.horizontal;
    const pt = (m: number, c: number) => (across ? `${m} ${c}` : `${c} ${m}`);
    svg.replaceChildren();
    svg.setAttribute("width", String(layout.scrollWidth));
    svg.setAttribute("height", String(layout.scrollHeight));
    // Arrowheads: the accent's, and the red one into a full station.
    const defs = document.createElementNS(SVG, "defs");
    const arrow = (id: string, color: string) => {
      const marker = document.createElementNS(SVG, "marker");
      marker.setAttribute("id", id);
      marker.setAttribute("viewBox", "0 0 10 10");
      marker.setAttribute("refX", "1"); // its base at the line's end, the tip HEAD further on
      marker.setAttribute("refY", "5");
      marker.setAttribute("markerWidth", "8");
      marker.setAttribute("markerHeight", "8");
      marker.setAttribute("markerUnits", "userSpaceOnUse");
      marker.setAttribute("orient", "auto");
      const head = document.createElementNS(SVG, "path");
      head.setAttribute("d", "M1 1 L9 5 L1 9 Z");
      head.style.fill = color;
      marker.appendChild(head);
      defs.appendChild(marker);
    };
    arrow(this.arrowId, ACCENT);
    arrow(`${this.arrowId}-full`, ERROR);
    svg.appendChild(defs);
    // The arrows that reach (to a market, a site the code works at, a station holding it) flow — their dots moving on toward
    // their heads; the others are still (into a full station: red; a site it doesn't reach: dimmed; a station not loaded yet) and
    // drawn under them, masked out where a flowing one runs (a stem they share shows the flow alone, never two patterns).
    const still: SVGPathElement[] = [];
    const flowing: SVGPathElement[] = [];
    const marks: SVGGElement[] = [];

    layout.querySelectorAll<HTMLElement>(".cm-node[data-parent]").forEach((child) => {
      const parentBox = layout.querySelector<HTMLElement>(`.cm-box[data-box="${child.dataset["parent"]}"]`);
      const childHead = child.querySelector<HTMLElement>(":scope > .cm-head");
      const childBox = childHead?.querySelector<HTMLElement>(".cm-box");
      if (!parentBox || !childHead || !childBox) {
        return;
      }
      const p = place(parentBox);
      const c = place(childBox);
      // Top down: from the parent box's foot to over the child's label; left to right: from its right side to the child box's left.
      const c1 = Math.round(across ? p.y + p.h / 2 : p.x + p.w / 2);
      const m1 = (across ? p.x + p.w : p.y + p.h) + FROM_GAP;
      const c2 = Math.round(across ? c.y + c.h / 2 : c.x + c.w / 2);
      const tip = (across ? c.x : place(childHead).y) - TO_GAP;
      const m2 = tip - HEAD; // the line's end: the arrowhead's base
      const mid = m1 + Math.min(BAR, Math.round((m2 - m1) / 2));
      const dc = c2 - c1;
      let d: string;
      if (Math.abs(dc) < IN_LINE) {
        d = `M${pt(m1, c2)} L${pt(m2, c2)}`; // straight on to the child's middle
      } else {
        const dir = Math.sign(dc);
        const r = Math.min(CORNER, Math.abs(dc) / 2, mid - m1);
        d =
          `M${pt(m1, c1)} L${pt(mid - r, c1)} Q${pt(mid, c1)} ${pt(mid, c1 + dir * r)} ` +
          `L${pt(mid, c2 - dir * r)} Q${pt(mid, c2)} ${pt(mid + r, c2)} L${pt(m2, c2)}`;
      }
      // Into a full station (the code left out): red, its arrowhead too, a ✕ on its last stretch.
      const full = child.dataset["state"] === "full";
      const path = document.createElementNS(SVG, "path");
      path.setAttribute("d", d);
      Object.assign(path.style, LINE_STYLE, full ? { stroke: ERROR } : {});
      if (child.classList.contains("cm-dim")) {
        path.style.opacity = DIM_OPACITY; // a site the code doesn't reach: its arrowhead too
      }
      path.setAttribute("marker-end", `url(#${full ? `${this.arrowId}-full` : this.arrowId})`);
      const reaches = !full && !child.classList.contains("cm-dim") && child.dataset["state"] !== "pending";
      (reaches ? flowing : still).push(path);
      if (full) {
        const at = tip - MARK_LIFT;
        marks.push(this.crossMark(across ? at : c2, across ? c2 : at));
      }
    });
    // The still arrows under a mask of the flowing ones' tracks, the flowing ones over them, then the ✕ marks over all the lines.
    const stillLayer = document.createElementNS(SVG, "g");
    stillLayer.append(...still);
    if (still.length && flowing.length) {
      defs.appendChild(this.flowMask(flowing, layout.scrollWidth, layout.scrollHeight));
      stillLayer.setAttribute("mask", `url(#${this.arrowId}-flow)`);
    }
    svg.append(stillLayer, ...flowing, ...marks);
    this.flow(flowing);
  }

  /** A mask showing everything but the flowing arrows' tracks (black, a little wider than a dot): what a still arrow shows. */
  private flowMask(flowing: SVGPathElement[], width: number, height: number): SVGMaskElement {
    const mask = document.createElementNS(SVG, "mask");
    mask.setAttribute("id", `${this.arrowId}-flow`);
    mask.setAttribute("maskUnits", "userSpaceOnUse");
    for (const [k, v] of Object.entries({ x: 0, y: 0, width, height })) {
      mask.setAttribute(k, String(v));
    }
    const all = document.createElementNS(SVG, "rect");
    for (const [k, v] of Object.entries({ x: 0, y: 0, width, height })) {
      all.setAttribute(k, String(v));
    }
    all.style.fill = "white";
    mask.appendChild(all);
    for (const p of flowing) {
      const track = document.createElementNS(SVG, "path");
      track.setAttribute("d", p.getAttribute("d") ?? "");
      Object.assign(track.style, { fill: "none", stroke: "black", strokeWidth: FLOW_MASK_WIDTH, strokeLinecap: "round" });
      mask.appendChild(track);
    }
    return mask;
  }

  /**
   * The flow: each flowing arrow's dots moving on a pattern's length a beat, toward its head — all started together, so the stems
   * they share stay one pattern. None with reduced motion.
   */
  private flow(paths: SVGPathElement[]): void {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || typeof Element.prototype.animate !== "function") {
      return;
    }
    for (const p of paths) {
      p.animate([{ strokeDashoffset: "0" }, { strokeDashoffset: String(-FLOW_PERIOD) }], { duration: FLOW_MS, iterations: Infinity });
    }
  }

  /** A ✕ in a red ring on the canvas' surface (hiding the dotted line under it), centred at (cx, cy). */
  private crossMark(cx: number, cy: number): SVGGElement {
    const g = document.createElementNS(SVG, "g");
    const ring = document.createElementNS(SVG, "circle");
    ring.setAttribute("cx", String(cx));
    ring.setAttribute("cy", String(cy));
    ring.setAttribute("r", String(MARK_R));
    Object.assign(ring.style, { fill: SURFACE, stroke: ERROR, strokeWidth: "1.5" });
    const k = MARK_R * 0.4;
    const cross = document.createElementNS(SVG, "path");
    cross.setAttribute("d", `M${cx - k} ${cy - k} L${cx + k} ${cy + k} M${cx + k} ${cy - k} L${cx - k} ${cy + k}`);
    Object.assign(cross.style, { fill: "none", stroke: ERROR, strokeWidth: "1.75", strokeLinecap: "round" });
    g.append(ring, cross);
    return g;
  }
}
