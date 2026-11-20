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

import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostBinding,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";
import { CollapsibleCardComponent } from "../../../components/shared/collapsible-card/collapsible-card.component";
import { TipDirective } from "../../../components/shared/tip/tip.directive";
import { PanZoom } from "../../../components/shared/pan-zoom/pan-zoom";
import { EsfComponentFactory } from "../../models/esf-security.models";
import { esfServiceIcon, esfServiceName } from "../../models/esf.models";
import { esfFactoryName } from "../../models/esf-cloud.models";
import {
  addEsfWire,
  EsfWireGraph,
  layoutWireGraph,
  moveEsfWireComponent,
  removeEsfWire,
  WireLayout,
  wireLayoutToGraph,
  WireNode,
  WirePath,
  WirePort,
  wirePaths,
  wireRoute,
  WIRE_DRAG_TYPE,
  esfWireIcon,
  WIRE_GRID,
  WIRE_HEAD,
  WIRE_PORT_RADIUS,
  WIRE_WIDTH,
  WIRE_NODE_SIZE,
} from "../../models/esf-wires.models";

let instances = 0;

/** A press moves this far (px on the page) before it's a drag (a box's, the canvas' pan), not a click. */
const DRAG_START = 4;
/** A wire being drawn: its end pulled onto an input port this near the pointer (the drawing's units), as ESF's composer's. */
const PORT_PULL = 22;

/** A wire being drawn: from this output port, its start in the drawing. */
interface Wiring {
  pid: string;
  port: number;
  x: number;
  y: number;
}

/**
 * An ESF unit's Wire graph (the Wire Graph Service's one setting — `esf-wires.models.ts`) as a drawing: each Wire component a box
 * where ESF's Wires composer placed it — its icon by its factory, its name, its factory's name under it — its input ports on its
 * left side, its output ports on its right (a port's name beside it, where it has one), and each wire from an output port to an
 * input port as ESF's composer draws it — out straight, at 45°, in straight, its bends rounded, as thick as ESF's, in a neutral
 * slate with a dark arrowhead (`wireRoute`). On the map canvas the code's Assignment tree uses (the
 * shared `PanZoom`): a drag of the canvas pans, the wheel, a pinch or a double click zoom, its controls show it all and zoom;
 * fitted in when a graph is shown, until the viewer moves it or edits it. A box's click picks it (`componentOpen`).
 *
 * Editable (`editable`, the Wire graph view's when the gateway's ESF user may edit it), as ESF's composer: a box dragged moves in
 * steps of the canvas' grid (on its dots — ESF's composer's 20, enlarged: `WIRE_GRID`); a drag from an output port to another box's input port draws a wire
 * (snapped to the grid, pulled onto an input port near it, the targets lit; let go elsewhere, or Escape, drops it); a wire's click
 * picks it. What's picked — a box, a wire — the view's "Delete component" deletes (Delete / Backspace too:
 * `componentDelete`, a wire taken out here); a click on the canvas itself lets it go. Each edit is a new graph (`graphChange`): the view
 * keeps the draft. Its own actions go in its title row (`[wg-actions]`), its form's buttons at its foot (`[wg-foot]`).
 */
@Component({
  selector: "tb-gm-esf-wire-graph",
  templateUrl: "./esf-wire-graph.component.html",
  styleUrls: ["./esf-wire-graph.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, CollapsibleCardComponent, TipDirective],
})
export class EsfWireGraphComponent implements OnChanges, OnDestroy {
  /** No native tooltip. */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;

  @Input() graph: EsfWireGraph | null = null;
  /** The unit's components with their factories (`pidsWithFactory`): what each box is. */
  @Input() factories: EsfComponentFactory[] = [];
  /** A component's factory where the unit doesn't know it yet (a component added, not applied). */
  @Input() pendingFactories = new Map<string, string>();
  /** The card's title. */
  @Input() heading = "Wire graph";
  /** The component picked (its box lit: its settings shown under the graph), "" none. */
  @Input() selected = "";
  /** The boxes move, the ports draw wires, a wire's click picks it. */
  @Input() editable = false;
  /** The wire picked (its key), "" none. */
  @Input() selectedWire = "";
  /** Bumped when another graph is shown (read from the unit, an edit cancelled): laid out and fitted afresh. */
  @Input() layoutKey = 0;
  /** A box clicked: that component (its pid). */
  @Output() componentOpen = new EventEmitter<string>();
  /** An edit: the graph it makes. */
  @Output() graphChange = new EventEmitter<EsfWireGraph>();
  /** A wire clicked ("" the canvas: none). */
  @Output() wireSelect = new EventEmitter<string>();
  /** The delete popping up over the box picked: that component (its pid). */
  @Output() componentDelete = new EventEmitter<string>();
  /**
   * A palette entry dragged onto the canvas and dropped (editable): its key (`WIRE_DRAG_TYPE`'s data) and where its box goes —
   * centred on the pointer, on the grid — in the composer's units.
   */
  @Output() componentDrop = new EventEmitter<{ key: string; x: number; y: number }>();

  layout: WireLayout | null = null;
  /** This instance's arrowhead marker ids (ids are page-wide). */
  readonly arrowId = `wg-arrow-${++instances}`;
  readonly arrowOnId = `wg-arrow-on-${instances}`;

  @ViewChild("viewport") set viewportRef(ref: ElementRef<HTMLElement> | undefined) {
    this.view.detach();
    this.drops?.abort();
    if (ref) {
      this.view.attach(ref.nativeElement, ".wg-layer");
      this.listenForDrops(ref.nativeElement);
      this.refit();
    }
  }
  /** The canvas' drop listeners (a palette entry dragged onto it). */
  private drops?: AbortController;
  /** The wire being drawn: routed from its output port to the pointer. */
  @ViewChild("draft") private draftRef?: ElementRef<SVGPathElement>;

  private readonly view: PanZoom;
  private factoryOf = new Map<string, string>();
  private frame = 0;
  /** A drag under way (a box's or a port's): its window listeners. */
  private drag?: AbortController;
  /** The box just dragged: its click (which follows the press) isn't a pick. */
  private dragged = false;
  /** The wire under the pointer (editable: its ✕ shown), "" none. */
  hoverWire = "";
  /** A wire being drawn (an output port clicked), null none. */
  wiring: Wiring | null = null;
  /** Where the last press on the canvas was: a click after a pan isn't a click off. */
  private downAt: { x: number; y: number } | null = null;
  readonly wireHead = WIRE_HEAD;
  /** The wires' thickness (ESF's 4, enlarged as the drawing is): the template sets it, the stylesheet can't read the model. */
  readonly wireWidth = WIRE_WIDTH;

  readonly trackNode = (_: number, n: WireNode) => n.pid;
  readonly trackPath = (_: number, p: WirePath) => p.key;
  readonly trackPort = (_: number, p: WirePort) => p.index;

  constructor(
    private readonly zone: NgZone,
    private readonly cd: ChangeDetectorRef
  ) {
    this.view = new PanZoom(zone, { ignore: ".wg-controls, .wg-node, .wg-hit, .wg-wire-x", grid: WIRE_GRID, buttonZoom: true, onResize: () => this.view.refit() });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["factories"] || changes["pendingFactories"]) {
      this.factoryOf = new Map([...this.factories.map((f): [string, string] => [f.pid, f.factoryPid]), ...this.pendingFactories]);
    }
    if (changes["editable"] && !this.editable) {
      this.stopWiring();
    }
    if (changes["graph"] || changes["layoutKey"]) {
      const fresh = !this.layout || !!changes["layoutKey"];
      const before = this.layout;
      this.layout = this.graph ? layoutWireGraph(this.graph) : null;
      if (fresh) {
        this.view.moved = false;
        this.refit();
      } else if (before && this.layout) {
        // An edit laid out with another origin (a box moved past the left or top edge): the view follows, nothing moves on screen.
        this.view.offset(this.layout.originX - before.originX, this.layout.originY - before.originY);
      }
    }
  }

  ngOnDestroy(): void {
    this.view.destroy();
    this.drops?.abort();
    this.wiring = null;
    this.drag?.abort();
    cancelAnimationFrame(this.frame);
  }

  nameOf(pid: string): string {
    return esfServiceName(pid);
  }

  /** What the component is: its factory's name ("Timer", "Wire Asset"); "" when its factory isn't known. */
  kindOf(pid: string): string {
    const factory = this.factoryOf.get(pid);
    return factory ? esfFactoryName(factory) : "";
  }

  /** A box's mark: its kind's, by what it does (`esfWireIcon`); else the service's. */
  iconOf(pid: string): string {
    const factory = this.factoryOf.get(pid) ?? pid;
    return esfWireIcon(factory) ?? esfServiceIcon(factory);
  }


  showAll(): void {
    this.view.showAll();
  }

  zoomIn(): void {
    this.view.zoomIn();
  }

  zoomOut(): void {
    this.view.zoomOut();
  }

  /** A box clicked (not dragged): picked — a wire being drawn dropped instead. */
  onNodeClick(n: WireNode): void {
    if (this.dragged) {
      this.dragged = false;
      return;
    }
    if (this.wiring) {
      this.stopWiring();
      return;
    }
    this.componentOpen.emit(n.pid);
  }

  /** A wire clicked: picked. */
  onWireClick(p: WirePath, e: MouseEvent): void {
    e.stopPropagation();
    if (this.wiring) {
      this.stopWiring();
      return;
    }
    this.wireSelect.emit(p.key);
  }

  /** A wire's ✕ (shown while it's hovered): the wire taken out of the draft, at once. */
  onWireDelete(p: WirePath, e: MouseEvent): void {
    e.stopPropagation();
    if (!this.graph) {
      return;
    }
    this.hoverWire = "";
    this.edited(removeEsfWire(this.graph, p.key));
    if (this.selectedWire === p.key) {
      this.wireSelect.emit("");
    }
  }

  /** A press on the canvas: where, so its click can tell a click off from the end of a pan. */
  onCanvasDown(e: PointerEvent): void {
    this.downAt = { x: e.clientX, y: e.clientY };
  }

  /** The canvas itself clicked (not a box, a wire, a pop-up or a control; not a pan's end): a wire being drawn dropped, else nothing picked. */
  onCanvasClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (target.closest(".wg-node, .wg-controls, .wg-hit, .wg-wire-x")) {
      return;
    }
    if (this.dragged) {
      this.dragged = false; // a wire's drag ended here
      return;
    }
    const down = this.downAt;
    this.downAt = null;
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) >= DRAG_START) {
      return;
    }
    if (this.wiring) {
      this.stopWiring();
      return;
    }
    if (this.selectedWire) {
      this.wireSelect.emit("");
    }
    if (this.selected) {
      this.componentOpen.emit("");
    }
  }

  /** Delete / Backspace on the canvas: what's picked taken out (a wire; a box, through the view). */
  onKey(e: KeyboardEvent): void {
    if (e.key !== "Delete" && e.key !== "Backspace") {
      return;
    }
    if (this.selectedWire) {
      e.preventDefault();
      this.deleteWire();
    } else if (this.selected && this.editable) {
      e.preventDefault();
      this.componentDelete.emit(this.selected);
    }
  }

  deleteWire(): void {
    if (this.graph && this.selectedWire) {
      this.edited(removeEsfWire(this.graph, this.selectedWire));
      this.wireSelect.emit("");
    }
  }

  /**
   * A box pressed (editable): followed as the pointer moves — once it's a drag — in steps of the canvas' grid (as ESF's composer's
   * boxes snap), and its place set where it's let go.
   */
  onNodeDown(e: PointerEvent, n: WireNode): void {
    if (!this.editable || e.button !== 0 || this.wiring || (e.target as HTMLElement).closest(".wg-port")) {
      return;
    }
    const start = { x: e.clientX, y: e.clientY, nx: n.x, ny: n.y };
    const grid = WIRE_GRID;
    let moving = false;
    this.dragged = false;
    this.follow(
      (m) => {
        if (!moving && Math.hypot(m.clientX - start.x, m.clientY - start.y) < DRAG_START) {
          return;
        }
        moving = true;
        const k = this.view.scale;
        const x = Math.round((start.nx + (m.clientX - start.x) / k) / grid) * grid;
        const y = Math.round((start.ny + (m.clientY - start.y) / k) / grid) * grid;
        if (x === n.x && y === n.y) {
          return; // still in the same grid step: nothing moves
        }
        n.x = x;
        n.y = y;
        if (this.layout && this.graph) {
          this.layout.paths = wirePaths(this.layout.nodes, this.graph.wires);
        }
        this.cd.detectChanges();
      },
      () => {
        if (moving && this.graph && this.layout) {
          this.dragged = true;
          const at = wireLayoutToGraph(this.layout, n.x, n.y);
          this.edited(moveEsfWireComponent(this.graph, n.pid, at.x, at.y));
        }
      }
    );
  }

  /**
   * An output port pressed (editable): a wire drawn from it as the pointer moves — snapped to the grid, pulled onto another box's input
   * port near it (that box's ports lit meanwhile) — and made where it's let go on (or near) one; let go elsewhere, or Escape, drops it.
   */
  onPortDown(e: PointerEvent, n: WireNode, port: WirePort): void {
    if (!this.editable || e.button !== 0) {
      return;
    }
    e.stopPropagation();
    e.preventDefault();
    const wiring: Wiring = { pid: n.pid, port: port.index, x: n.x + n.w + WIRE_PORT_RADIUS, y: n.y + port.y };
    this.wiring = wiring;
    const path = this.draftRef?.nativeElement;
    let moved = false;
    this.follow(
      (m) => {
        moved = true;
        const end = this.wireEnd(wiring, this.view.toLayer(m.clientX, m.clientY));
        path?.setAttribute("d", wireRoute(wiring.x, wiring.y, end.x, end.y));
        path?.style.setProperty("display", "inline");
      },
      (up) => {
        this.stopWiring();
        this.dragged = moved; // its click isn't a click off
        const target = this.nearestInput(wiring, this.view.toLayer(up.clientX, up.clientY));
        if (this.graph && target) {
          const next = addEsfWire(this.graph, { emitter: wiring.pid, emitterPort: wiring.port, receiver: target.pid, receiverPort: target.port });
          if (next) {
            this.edited(next);
          }
        }
      }
    );
    this.zone.runOutsideAngular(() =>
      window.addEventListener(
        "keydown",
        (k) => {
          if (k.key === "Escape") {
            k.preventDefault();
            this.zone.run(() => this.stopWiring());
          }
        },
        { signal: this.drag?.signal, capture: true }
      )
    );
  }

  /**
   * A palette entry dragged over the canvas (editable): the canvas lit while it's over it (`wg-drop`), its drop placing the new
   * box under the pointer — the view kept as it is (never fitted again around it). Outside Angular: a drag's moves change nothing
   * of the template; the drop's work inside it.
   */
  private listenForDrops(canvas: HTMLElement): void {
    const ac = (this.drops = new AbortController());
    const ours = (e: DragEvent) => this.editable && !!e.dataTransfer?.types.includes(WIRE_DRAG_TYPE);
    this.zone.runOutsideAngular(() => {
      canvas.addEventListener(
        "dragover",
        (e) => {
          if (ours(e)) {
            e.preventDefault(); // a drop allowed here
            e.dataTransfer!.dropEffect = "copy";
            canvas.classList.add("wg-drop");
          }
        },
        { signal: ac.signal }
      );
      canvas.addEventListener(
        "dragleave",
        (e) => {
          if (!canvas.contains(e.relatedTarget as Node | null)) {
            canvas.classList.remove("wg-drop");
          }
        },
        { signal: ac.signal }
      );
      canvas.addEventListener(
        "drop",
        (e) => {
          canvas.classList.remove("wg-drop");
          const key = e.dataTransfer?.getData(WIRE_DRAG_TYPE);
          if (!ours(e) || !key || !this.layout) {
            return;
          }
          e.preventDefault();
          const p = this.view.toLayer(e.clientX, e.clientY);
          const grid = WIRE_GRID;
          const x = Math.round((p.x - WIRE_NODE_SIZE.w / 2) / grid) * grid;
          const y = Math.round((p.y - WIRE_NODE_SIZE.h / 2) / grid) * grid;
          const at = wireLayoutToGraph(this.layout, x, y);
          this.view.moved = true;
          this.zone.run(() => this.componentDrop.emit({ key, x: at.x, y: at.y }));
        },
        { signal: ac.signal }
      );
    });
  }

  /** The wire being drawn dropped: its line hidden, its listeners off. */
  private stopWiring(): void {
    this.drag?.abort();
    this.wiring = null;
    this.draftRef?.nativeElement.style.setProperty("display", "none");
  }

  /** The input port of another box nearest the point, within reach (`PORT_PULL`): where a wire let go there goes; null none. */
  private nearestInput(wiring: Wiring, p: { x: number; y: number }): { pid: string; port: number; x: number; y: number } | null {
    let best: { pid: string; port: number; x: number; y: number } | null = null;
    let near = PORT_PULL;
    for (const n of this.layout?.nodes ?? []) {
      if (n.pid === wiring.pid) {
        continue;
      }
      for (const port of n.inputs) {
        const d = Math.hypot(p.x - n.x, p.y - (n.y + port.y));
        if (d < near) {
          near = d;
          best = { pid: n.pid, port: port.index, x: n.x - WIRE_PORT_RADIUS, y: n.y + port.y };
        }
      }
    }
    return best;
  }

  /** Where a wire being drawn ends: on an input port near the point (where a wire to it ends), else the grid's nearest point. */
  private wireEnd(wiring: Wiring, p: { x: number; y: number }): { x: number; y: number } {
    const port = this.nearestInput(wiring, p);
    const grid = WIRE_GRID;
    return port ?? { x: Math.round(p.x / grid) * grid, y: Math.round(p.y / grid) * grid };
  }


  /** A drag's moves and its end, on the window (outside Angular: nothing else changes as it moves); the end's work inside it. */
  private follow(move: (e: PointerEvent) => void, end: (e: PointerEvent) => void): void {
    this.drag?.abort();
    const ac = (this.drag = new AbortController());
    this.zone.runOutsideAngular(() => {
      window.addEventListener("pointermove", move, { signal: ac.signal });
      const done = (e: PointerEvent) => {
        ac.abort();
        this.zone.run(() => end(e));
      };
      window.addEventListener("pointerup", done, { signal: ac.signal });
      window.addEventListener("pointercancel", done, { signal: ac.signal });
    });
  }

  /** An edit: handed up; the view kept where the viewer has it (an edit never refits it). */
  private edited(graph: EsfWireGraph): void {
    this.view.moved = true;
    this.graphChange.emit(graph);
  }

  /** Fitted again on the next frame (once the boxes are on the page), unless the viewer has moved it. */
  private refit(): void {
    this.zone.runOutsideAngular(() => {
      cancelAnimationFrame(this.frame);
      this.frame = requestAnimationFrame(() => this.view.refit());
    });
  }
}
