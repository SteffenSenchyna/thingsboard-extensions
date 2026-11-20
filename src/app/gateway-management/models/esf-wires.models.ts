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

// An ESF unit's Wire graph (Kura Wires): what flows from which component to which. The Wire Graph Service
// (`org.eclipse.kura.wire.graph.WireGraphService`) keeps it as one setting, `WireGraph`, a JSON text (Kura's
// `WireGraphJsonMarshallUnmarshallImpl`):
//
//   { "components": [{ "pid", "inputPortCount", "outputPortCount",
//                      "renderingProperties": { "position": { "x", "y" }, "inputPortNames": { "0": "…" }, "outputPortNames": { … } } }],
//     "wires": [{ "emitter": <pid>, "emitterPort": 0, "receiver": <pid>, "receiverPort": 0 }] }
//
// Each component is a factory's instance (a Timer, a Wire asset, a Logger, a publisher, …) with its own settings; its position
// is where ESF's Wires composer placed it. Data flows from an emitter's output port to a receiver's input port.

import { EsfComponentConfig, EsfDefinition, esfObject, EsfProperty, parseEsfDefinition } from "./esf.models";
import { isEsfAssetFactory } from "./esf-drivers.models";
import { EsfReceivedProperties } from "./esf-regex.models";

/** The Wire Graph Service, and its one setting: the graph as a JSON text. */
export const ESF_WIRE_GRAPH_PID = "org.eclipse.kura.wire.graph.WireGraphService";
export const ESF_WIRE_GRAPH_SETTING = "WireGraph";

export interface EsfWireComponent {
  pid: string;
  inputs: number;
  outputs: number;
  /** Where the Wires composer placed it (its canvas' units). */
  x: number;
  y: number;
  /** A port's name, by its index, where it has one (a Conditional's "then" / "else"). */
  inputNames: Record<number, string>;
  outputNames: Record<number, string>;
}

export interface EsfWire {
  emitter: string;
  emitterPort: number;
  receiver: string;
  receiverPort: number;
}

export interface EsfWireGraph {
  components: EsfWireComponent[];
  wires: EsfWire[];
}

const num = (v: unknown, fallback = 0): number => (typeof v === "number" && isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && isFinite(+v) ? +v : fallback);
const obj = (v: unknown): Record<string, any> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, any>) : {});

function portNames(v: unknown): Record<number, string> {
  const out: Record<number, string> = {};
  for (const [k, name] of Object.entries(obj(v))) {
    if (typeof name === "string" && name.trim() && isFinite(+k)) {
      out[+k] = name.trim();
    }
  }
  return out;
}

/** The graph from the `WireGraph` setting's value (its JSON text, or already parsed); null when it isn't one. */
export function parseEsfWireGraph(value: unknown): EsfWireGraph | null {
  let raw: unknown = value;
  if (typeof raw === "string") {
    if (!raw.trim()) {
      return { components: [], wires: [] };
    }
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const g = obj(raw);
  if (!Array.isArray(g["components"]) && !Array.isArray(g["wires"])) {
    return null;
  }
  const components: EsfWireComponent[] = (Array.isArray(g["components"]) ? g["components"] : [])
    .map((c: unknown) => {
      const o = obj(c);
      const r = obj(o["renderingProperties"]);
      const p = obj(r["position"]);
      return {
        pid: typeof o["pid"] === "string" ? o["pid"] : "",
        inputs: Math.max(0, Math.round(num(o["inputPortCount"]))),
        outputs: Math.max(0, Math.round(num(o["outputPortCount"]))),
        x: num(p["x"]),
        y: num(p["y"]),
        inputNames: portNames(r["inputPortNames"]),
        outputNames: portNames(r["outputPortNames"]),
      };
    })
    .filter((c) => !!c.pid);
  const wires: EsfWire[] = (Array.isArray(g["wires"]) ? g["wires"] : [])
    .map((w: unknown) => {
      const o = obj(w);
      return {
        emitter: typeof o["emitter"] === "string" ? o["emitter"] : "",
        emitterPort: Math.max(0, Math.round(num(o["emitterPort"]))),
        receiver: typeof o["receiver"] === "string" ? o["receiver"] : "",
        receiverPort: Math.max(0, Math.round(num(o["receiverPort"]))),
      };
    })
    .filter((w) => !!w.emitter && !!w.receiver);
  return { components, wires };
}

/** A wire's key: its two ends (a graph holds one wire between two ports). */
export function esfWireKey(w: EsfWire): string {
  return `${w.emitter}:${w.emitterPort}>${w.receiver}:${w.receiverPort}`;
}

// ---- Edited (WIRE-V1, `rest.wires.admin`) -----------------------------------------------------------------------------------

/** A Wire component's pid: what ESF's composer takes for a name — letters, digits, "_", "-", ".". */
export const ESF_WIRE_PID = /^[A-Za-z0-9_.-]+$/;

/** A kind of Wire component (a factory), as its definition says: its ports — how many, by default and at most — and their names. */
export interface EsfWireFactory {
  factoryPid: string;
  inputs: number;
  outputs: number;
  maxInputs: number;
  maxOutputs: number;
  inputNames: Record<number, string>;
  outputNames: Record<number, string>;
  /**
   * Its settings, from its definition's `componentOCD` (named as the palette names the kind; a WireAsset's by the asset
   * definition's id, so its layout lays it out): a new component's form before the graph is applied (`esfNewWireConfig`).
   */
  definition: EsfDefinition;
}

/** The definition id a WireAsset's settings go by on the unit (its layout's — `esf-layouts.models.ts`). */
const ASSET_DEFINITION_ID = "org.eclipse.kura.asset";

/** Where the palette lists a kind, as ESF's composer does: by whether it has inputs, outputs, or both. */
export type EsfWireRole = "emitter" | "receiver" | "both";

export function esfWireRole(f: EsfWireFactory): EsfWireRole {
  return f.maxInputs <= 0 ? "emitter" : f.maxOutputs <= 0 ? "receiver" : "both";
}

/** The kinds' names, as ESF's Wires composer lists them (its own words — the definitions carry none); another kind: its factory's class. */
const ESF_WIRE_KIND_NAMES: Record<string, string> = {
  "com.eurotech.framework.log.journald.wire.JournaldWireComponent": "Journald",
  "org.eclipse.kura.wire.CloudSubscriber": "Subscriber",
  "org.eclipse.kura.wire.Timer": "Timer",
  "org.eclipse.kura.wire.Logger": "Logger",
  "org.eclipse.kura.wire.CloudPublisher": "Publisher",
  "org.eclipse.kura.wire.DbWireRecordFilter": "DB Filter (Deprecated)",
  "org.eclipse.kura.wire.DbWireRecordStore": "DB Store (Deprecated)",
  "org.eclipse.kura.wire.Fifo": "Fifo",
  "org.eclipse.kura.wire.H2DbWireRecordFilter": "H2 DB Filter (Deprecated)",
  "org.eclipse.kura.wire.H2DbWireRecordStore": "H2 DB Store (Deprecated)",
  "org.eclipse.kura.wire.Join": "Join",
  "org.eclipse.kura.wire.RegexFilter": "Regex Filter",
  "org.eclipse.kura.wire.WireRecordQuery": "Wire Record Query",
  "org.eclipse.kura.wire.WireRecordStore": "Wire Record Store",
  "org.eclipse.kura.wire.WireAsset": "WireAsset",
  // The GraalVM™ scripted components (where the unit has them — an ESF add-on): their script an editor (`esf-script.models.ts`).
  "org.eclipse.kura.wire.script.tools.FilterComponent": "GraalVM Filter",
  "org.eclipse.kura.wire.script.tools.ConditionalComponent": "Conditional",
};

/**
 * A kind's mark on its box, by what it does (its factory's short name): the clock a Timer, the cloud's arrows a Publisher and a
 * Subscriber, a database a store, a search a query, the math components their operation's sign, `code` a GraalVM™ filter's script,
 * a fork a Conditional; a kind it doesn't know, the service's (`esfServiceIcon`).
 */
const WIRE_ICONS: Record<string, string> = {
  Timer: "timer",
  Logger: "receipt_long",
  JournaldWireComponent: "article",
  CloudPublisher: "cloud_upload",
  CloudSubscriber: "cloud_download",
  DbWireRecordStore: "database",
  H2DbWireRecordStore: "database",
  WireRecordStore: "database",
  DbWireRecordFilter: "manage_search",
  H2DbWireRecordFilter: "manage_search",
  WireRecordQuery: "manage_search",
  RegexFilter: "regular_expression",
  Fifo: "stacks",
  Join: "merge",
  WireAsset: "settings_input_component",
  FilterComponent: "code",
  ConditionalComponent: "alt_route",
  Average: "functions",
  GainOffset: "linear_scale",
  Maximum: "vertical_align_top",
  Minimum: "vertical_align_bottom",
  Median: "align_vertical_center",
  SquareRoot: "calculate",
  Variance: "stacked_line_chart",
};

export function esfWireIcon(factoryPid: string): string | null {
  return WIRE_ICONS[factoryPid.split(".").pop() ?? ""] ?? null;
}

export function esfWireKindName(factoryPid: string): string {
  return (
    ESF_WIRE_KIND_NAMES[factoryPid] ??
    (factoryPid.split(".").pop() ?? factoryPid)
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
  );
}

/** A role's mark in the palette, as ESF's composer's: an emitter's arrow out, a receiver's arrow in, both ways for both. */
export const ESF_WIRE_ROLE_ICONS: Record<EsfWireRole, string> = { emitter: "east", receiver: "west", both: "sync_alt" };

/** The kinds in a WIRE-V1 metadata reply (`wireComponentDefinitions`, each a factory's ports — its settings not needed here). */
export function parseEsfWireFactories(reply: unknown): EsfWireFactory[] {
  const defs = esfObject(reply)["wireComponentDefinitions"];
  return (Array.isArray(defs) ? defs : [])
    .map((d: unknown) => {
      const o = obj(d);
      const inputs = Math.max(0, Math.round(num(o["defaultInputPorts"], num(o["minInputPorts"]))));
      const outputs = Math.max(0, Math.round(num(o["defaultOutputPorts"], num(o["minOutputPorts"]))));
      const factoryPid = typeof o["factoryPid"] === "string" ? o["factoryPid"] : "";
      return {
        factoryPid,
        inputs,
        outputs,
        maxInputs: Math.max(inputs, Math.round(num(o["maxInputPorts"], inputs))),
        maxOutputs: Math.max(outputs, Math.round(num(o["maxOutputPorts"], outputs))),
        inputNames: portNames(o["inputPortNames"]),
        outputNames: portNames(o["outputPortNames"]),
        definition: parseEsfDefinition({
          id: isEsfAssetFactory(factoryPid) ? ASSET_DEFINITION_ID : factoryPid,
          name: esfWireKindName(factoryPid),
          ad: Array.isArray(o["componentOCD"]) ? o["componentOCD"] : [],
        }),
      };
    })
    .filter((f) => !!f.factoryPid);
}

/**
 * A component added, not yet on the unit: its configuration as its kind's definition gives it — each setting at its default — for
 * its form (edited before the graph is applied; what's changed is sent with it, `esfWireUpdateBody`'s settings).
 */
export function esfNewWireConfig(pid: string, kind: EsfWireFactory): EsfComponentConfig {
  const properties: Record<string, EsfProperty> = {};
  for (const a of kind.definition.attributes) {
    if (a.defaultValue !== null) {
      properties[a.id] = { type: a.type, value: a.defaultValue };
    }
  }
  return { pid, definition: kind.definition, properties };
}

/** The graph as Kura keeps it (the `WireGraph` setting's JSON). */
export function serializeEsfWireGraph(g: EsfWireGraph): Record<string, unknown> {
  const names = (n: Record<number, string>) => Object.fromEntries(Object.entries(n).map(([k, v]) => [k, v]));
  return {
    components: g.components.map((c) => ({
      pid: c.pid,
      inputPortCount: c.inputs,
      outputPortCount: c.outputs,
      renderingProperties: { position: { x: Math.round(c.x), y: Math.round(c.y) }, inputPortNames: names(c.inputNames), outputPortNames: names(c.outputNames) },
    })),
    wires: g.wires.map((w) => ({ emitter: w.emitter, emitterPort: w.emitterPort, receiver: w.receiver, receiverPort: w.receiverPort })),
  };
}

/**
 * The graph put to the unit (`PUT …/wire/v1/graph/snapshot`): the Wire Graph Service's graph, and each component new to the unit
 * by its factory — ESF makes it with its default settings. Components already there aren't sent: their settings are merged, never
 * replaced, so leaving them out leaves them as they are (and never writes back a password ESF only gave as "placeholder").
 */
export function esfWireUpdateBody(
  g: EsfWireGraph,
  created: Map<string, string>,
  /** A new component's settings besides its factory (a new asset's driver: `driver.pid`), each `{ type, value }`. */
  settings = new Map<string, Record<string, unknown>>()
): Record<string, unknown> {
  const fresh = g.components.filter((c) => created.has(c.pid));
  return {
    configs: [
      { pid: ESF_WIRE_GRAPH_PID, properties: { [ESF_WIRE_GRAPH_SETTING]: { type: "STRING", value: JSON.stringify(serializeEsfWireGraph(g)) } } },
      ...fresh.map((c) => ({
        pid: c.pid,
        properties: { "service.factoryPid": { type: "STRING", value: created.get(c.pid) }, ...(settings.get(c.pid) ?? {}) },
      })),
    ],
  };
}

/** A component added to the graph, where given (composer units). */
export function addEsfWireComponent(g: EsfWireGraph, c: EsfWireComponent): EsfWireGraph {
  return { components: [...g.components.filter((x) => x.pid !== c.pid), c], wires: g.wires };
}

/** A component taken out of the graph, with every wire to or from it. */
export function removeEsfWireComponent(g: EsfWireGraph, pid: string): EsfWireGraph {
  return { components: g.components.filter((c) => c.pid !== pid), wires: g.wires.filter((w) => w.emitter !== pid && w.receiver !== pid) };
}

export function moveEsfWireComponent(g: EsfWireGraph, pid: string, x: number, y: number): EsfWireGraph {
  return { components: g.components.map((c) => (c.pid === pid ? { ...c, x, y } : c)), wires: g.wires };
}

/** A wire added, when it's one: from an output port to an input port of another component, and not there already. */
export function addEsfWire(g: EsfWireGraph, w: EsfWire): EsfWireGraph | null {
  const from = g.components.find((c) => c.pid === w.emitter);
  const to = g.components.find((c) => c.pid === w.receiver);
  if (!from || !to || from === to || w.emitterPort >= from.outputs || w.receiverPort >= to.inputs) {
    return null;
  }
  if (g.wires.some((x) => esfWireKey(x) === esfWireKey(w))) {
    return null;
  }
  return { components: g.components, wires: [...g.wires, w] };
}

export function removeEsfWire(g: EsfWireGraph, key: string): EsfWireGraph {
  return { components: g.components, wires: g.wires.filter((w) => esfWireKey(w) !== key) };
}

// ---- Laid out for drawing --------------------------------------------------------------------------------------------------

/**
 * ESF's Wires composer (Kura's `wires_composer.js`): a box 120 × 40 at its place (its top left corner), its ports spread evenly down
 * its sides, every move snapped to a grid of 20. Ours is ESF's drawing at ESF's own size (`WIRE_SCALE` 1 — every size here
 * ESF's × it): the boxes, the places, the grid — the canvas' dots — the wires; fitted never past 1:1, as ESF's, a graph shows on its
 * canvas as ESF shows it, and a box snapped here lands on ESF's grid there.
 */
const ESF_NODE = { w: 120, h: 40 };
const ESF_GRID = 20;
export const WIRE_SCALE = 1;
const NODE_W = ESF_NODE.w * WIRE_SCALE;
const NODE_MIN_H = ESF_NODE.h * WIRE_SCALE;
/** The canvas' grid in the drawing (its dots, `PanZoom`'s `grid`): ESF's, enlarged — a dragged box snaps to it. */
export const WIRE_GRID = ESF_GRID * WIRE_SCALE;
/** A box's size before it's laid out (a component dropped on the canvas: centred on the pointer). */
export const WIRE_NODE_SIZE = { w: NODE_W, h: NODE_MIN_H };
/** What a palette entry carries as it's dragged onto the canvas (its key), as ThingsBoard's rule chain editor's nodes. */
export const WIRE_DRAG_TYPE = "application/x-tb-esf-wire";
/** The least room a port takes down a box's side (a box of many ports grows past ESF's height to keep it). */
const PORT_STEP = 20;
const MARGIN = 40;
/**
 * ESF's wire, measured on its composer (Kura's: the metro router, the rounded connector — ESF units, × `WIRE_SCALE` here): out of
 * the output port, its first bend 25 from the port's centre; into the input port, its last bend 29 from the port's centre (its
 * arrowhead's tip at the port's edge, 10 long); its bends rounded at 10; 4 thick. A port here is a smaller dot than ESF's (radius 5,
 * ESF's 9 drew large on our boxes), centred on its box's side: the wire runs from and to its edge, its bends where ESF's are.
 */
export const WIRE_PORT_RADIUS = 5 * WIRE_SCALE;
const START_STUB = 25 * WIRE_SCALE - WIRE_PORT_RADIUS;
const END_STUB = 29 * WIRE_SCALE - WIRE_PORT_RADIUS;
/** A wire's arrowhead: this long (the drawing's units) — the line stops at its base, so none of it shows through the head. */
export const WIRE_HEAD = 10 * WIRE_SCALE;
/** A wire's bends: rounded at this radius (ESF's composer's rounded connector). */
const WIRE_RADIUS = 10 * WIRE_SCALE;
/** A wire's thickness (its stroke, the drawing's units): ESF's 4, enlarged as all of it is. */
export const WIRE_WIDTH = 4 * WIRE_SCALE;
/** A wire going back (its receiver left of its emitter) past boxes on one row: its lane this far under the lower box. */
const WIRE_LANE_GAP = 28;
/**
 * The room a wire keeps from a box it passes (as the metro router steers round the composer's other components): within it, the
 * wire is taken round the box instead — along a lane this far past the boxes in its way (`WIRE_DETOUR`).
 */
const WIRE_CLEARANCE = 8 * WIRE_SCALE;
const WIRE_DETOUR = 20 * WIRE_SCALE;

export interface WirePort {
  /** Its index (the wires' `emitterPort` / `receiverPort`). */
  index: number;
  /** Down from the box's top. */
  y: number;
  name: string;
}

export interface WireNode {
  pid: string;
  x: number;
  y: number;
  w: number;
  h: number;
  inputs: WirePort[];
  outputs: WirePort[];
}

export interface WirePath {
  key: string;
  d: string;
  /** Its ports' names, where they have them ("then", "else"), for its bubble. */
  from: string;
  to: string;
  /** Halfway along it (the drawing's units): where its delete pops up when it's picked. */
  midX: number;
  midY: number;
}

export interface WireLayout {
  width: number;
  height: number;
  nodes: WireNode[];
  paths: WirePath[];
  /** Where the composer's origin is in the drawing: a box at (x, y) of the drawing is at ((x − originX) / `WIRE_SCALE`, …) in the composer's. */
  originX: number;
  originY: number;
}

/** A point of the drawing as a place in the composer's units (where a dragged box is put). */
export function wireLayoutToGraph(layout: WireLayout, x: number, y: number): { x: number; y: number } {
  return { x: (x - layout.originX) / WIRE_SCALE, y: (y - layout.originY) / WIRE_SCALE };
}

/** A side's ports, spread evenly down the box. */
function ports(count: number, h: number, names: Record<number, string>): WirePort[] {
  // As JointJS lays a side's ports out: each in the middle of its equal share of the side.
  return Array.from({ length: count }, (_, i) => ({ index: i, y: Math.round((h * (i + 0.5)) / count), name: names[i] ?? "" }));
}

/**
 * The graph laid out: each component's box where the composer placed it — its places spread apart (the same factor across and
 * down) until no two boxes come closer than the gaps (or as far as `keepSpread` says: the graph being edited), then moved so the
 * drawing starts at the margin — and each wire a curve from its emitter's output port out of the box's right side to its
 * receiver's input port on the left, ending at its arrowhead.
 */
export function layoutWireGraph(graph: EsfWireGraph): WireLayout {
  const comps = graph.components;
  const heights = comps.map((c) => Math.max(NODE_MIN_H, Math.max(c.inputs, c.outputs, 1) * PORT_STEP));
  const minX = Math.min(...comps.map((c) => c.x * WIRE_SCALE), 0);
  const minY = Math.min(...comps.map((c) => c.y * WIRE_SCALE), 0);
  // The composer's origin on the grid: an origin moved by an edit moves by whole grid steps, so the view's shift
  // (`PanZoom.offset`) keeps a box snapped to the grid on its dots.
  const originX = Math.round((MARGIN - minX) / WIRE_GRID) * WIRE_GRID;
  const originY = Math.round((MARGIN - minY) / WIRE_GRID) * WIRE_GRID;
  const nodes: WireNode[] = comps.map((c, i) => ({
    pid: c.pid,
    x: Math.round(c.x * WIRE_SCALE) + originX,
    y: Math.round(c.y * WIRE_SCALE) + originY,
    w: NODE_W,
    h: heights[i],
    inputs: ports(c.inputs, heights[i], c.inputNames),
    outputs: ports(c.outputs, heights[i], c.outputNames),
  }));
  const paths = wirePaths(nodes, graph.wires);
  const width = Math.max(MARGIN * 2, ...nodes.map((n) => n.x + n.w + MARGIN));
  const height = Math.max(MARGIN * 2, ...nodes.map((n) => n.y + n.h + MARGIN));
  return { width, height, nodes, paths, originX, originY };
}

/** Each wire from its emitter's output port (the box's right side) to its receiver's input port (its left), routed as ESF's composer routes it (`wireRoute`). */
export function wirePaths(nodes: WireNode[], wires: EsfWire[]): WirePath[] {
  const byPid = new Map(nodes.map((n) => [n.pid, n]));
  const paths: WirePath[] = [];
  wires.forEach((w) => {
    const from = byPid.get(w.emitter);
    const to = byPid.get(w.receiver);
    if (!from || !to) {
      return;
    }
    const out = from.outputs.find((p) => p.index === w.emitterPort) ?? from.outputs[0];
    const inp = to.inputs.find((p) => p.index === w.receiverPort) ?? to.inputs[0];
    const x1 = from.x + from.w + WIRE_PORT_RADIUS;
    const y1 = from.y + (out?.y ?? from.h / 2);
    const x2 = to.x - WIRE_PORT_RADIUS;
    const y2 = to.y + (inp?.y ?? to.h / 2);
    // Going back: between the two boxes when one is above the other, else under both.
    const lane =
      from.y + from.h <= to.y
        ? (from.y + from.h + to.y) / 2
        : to.y + to.h <= from.y
          ? (to.y + to.h + from.y) / 2
          : Math.max(from.y + from.h, to.y + to.h) + WIRE_LANE_GAP;
    const points = routeAround(wirePoints(x1, y1, x2, y2, lane), nodes, from, to);
    const mid = halfway(points);
    paths.push({
      key: esfWireKey(w),
      d: wirePathOf(points),
      from: out?.name ?? "",
      to: inp?.name ?? "",
      midX: mid[0],
      midY: mid[1],
    });
  });
  return paths;
}

/**
 * A wire's path, as ESF's Wires composer routes it (JointJS's metro router, rounded): straight out of its output port, then at 45°
 * to the receiver's row, then straight into its input port — past the room for that, at 45° to halfway, straight up or down, at
 * 45° again — each bend rounded; going back (the receiver left of the emitter), out, along a lane (`lane`: its y), back to the
 * receiver's row, in. Its last stretch is straight, so the arrowhead sits on it: the line stops `WIRE_HEAD` short of (x2, y2),
 * where the head's base is (its marker's `refX` 0), the head's tip on (x2, y2).
 */
export function wireRoute(x1: number, y1: number, x2: number, y2: number, lane = (y1 + y2) / 2): string {
  return wirePathOf(wirePoints(x1, y1, x2, y2, lane));
}

/** A wire's corners as its path: its last stretch stopped `WIRE_HEAD` short (the arrowhead's base), each bend rounded. */
function wirePathOf(corners: [number, number][]): string {
  const points = corners.map(([x, y]) => [x, y] as [number, number]);
  const [lx, ly] = points[points.length - 1];
  const [px, py] = points[points.length - 2];
  const run = Math.hypot(lx - px, ly - py) || 1;
  const cut = Math.min(WIRE_HEAD, run);
  points[points.length - 1] = [lx - ((lx - px) * cut) / run, ly - ((ly - py) * cut) / run];
  return roundedPath(points, WIRE_RADIUS);
}

/**
 * A wire's corners (before rounding), as ESF's metro router lays them (`wireRoute`): out of its port, at 45° — as far as the room
 * across allows — to the receiver's row; with less room across than down, at 45° across all of it, then straight up or down, then a
 * square turn into the receiver's port; going back, along its lane.
 */
function wirePoints(x1: number, y1: number, x2: number, y2: number, lane: number): [number, number][] {
  const ax = x1 + START_STUB;
  const bx = x2 - END_STUB;
  const dx = bx - ax;
  const dy = y2 - y1;
  const sy = Math.sign(dy);
  let points: [number, number][];
  if (dx >= Math.abs(dy)) {
    points = [[x1, y1], [ax, y1], [ax + Math.abs(dy), y2], [x2, y2]];
  } else if (dx >= 0) {
    points = [[x1, y1], [ax, y1], [bx, y1 + sy * dx], [bx, y2], [x2, y2]];
  } else {
    points = [[x1, y1], [ax, y1], [ax, lane], [bx, lane], [bx, y2], [x2, y2]];
  }
  return points;
}

/**
 * A wire's corners taken round the boxes in its way (JointJS's metro router, which ESF's composer uses, steers round the other
 * components): as laid (`wirePoints`) where no stretch comes within `WIRE_CLEARANCE` of a box — its own two aside, out of and into
 * their ports — else along a lane above or below what's in its way (`laneRoute`), the shorter that's clear; what a lane meets in
 * turn joins what it must pass, a few times over. None clear: as laid.
 */
function routeAround(points: [number, number][], boxes: WireNode[], from: WireNode, to: WireNode): [number, number][] {
  let blockers = boxesCrossed(points, boxes, from, to);
  if (!blockers.length) {
    return points;
  }
  const [x1, y1] = points[0];
  const [x2, y2] = points[points.length - 1];
  for (let tries = 0; tries < 4; tries++) {
    const above = Math.min(...blockers.map((b) => b.y)) - WIRE_DETOUR;
    const below = Math.max(...blockers.map((b) => b.y + b.h)) + WIRE_DETOUR;
    const tried = [above, below].map((lane) => {
      const route = laneRoute(x1, y1, x2, y2, lane);
      return { route, hits: boxesCrossed(route, boxes, from, to), length: polylineLength(route) };
    });
    const clear = tried.filter((t) => !t.hits.length).sort((a, b) => a.length - b.length);
    if (clear.length) {
      return clear[0].route;
    }
    blockers = [...new Set([...blockers, ...tried.flatMap((t) => t.hits)])];
  }
  return points;
}

/**
 * A wire along a lane (`lane`: its y), as the metro router takes one round what's in its way: out of its port, at 45° to the lane,
 * along it, at 45° to the receiver's row, into its port — square turns where there isn't the room across for both slopes, or going
 * back (the receiver left of the emitter).
 */
function laneRoute(x1: number, y1: number, x2: number, y2: number, lane: number): [number, number][] {
  const ax = x1 + START_STUB;
  const bx = x2 - END_STUB;
  const out = Math.abs(lane - y1);
  const back = Math.abs(y2 - lane);
  if (ax + out <= bx - back) {
    return [[x1, y1], [ax, y1], [ax + out, lane], [bx - back, lane], [bx, y2], [x2, y2]];
  }
  return [[x1, y1], [ax, y1], [ax, lane], [bx, lane], [bx, y2], [x2, y2]];
}

/**
 * The boxes a wire's stretches come within `WIRE_CLEARANCE` of — its emitter's box aside for its first stretch (out of its port),
 * its receiver's for its last (into one).
 */
function boxesCrossed(points: [number, number][], boxes: WireNode[], from: WireNode, to: WireNode): WireNode[] {
  const last = points.length - 2;
  return boxes.filter((b) =>
    points.slice(1).some((q, i) => {
      if ((i === 0 && b === from) || (i === last && b === to)) {
        return false;
      }
      return segmentMeetsBox(points[i], q, b, WIRE_CLEARANCE);
    })
  );
}

/** A straight stretch from `p` to `q` passes within `pad` of the box (Liang–Barsky's clip of the segment to the padded box). */
function segmentMeetsBox(p: [number, number], q: [number, number], box: WireNode, pad: number): boolean {
  const [x0, y0] = p;
  const dx = q[0] - x0;
  const dy = q[1] - y0;
  const left = box.x - pad;
  const right = box.x + box.w + pad;
  const top = box.y - pad;
  const bottom = box.y + box.h + pad;
  let t0 = 0;
  let t1 = 1;
  for (const [edge, along] of [
    [x0 - left, -dx],
    [right - x0, dx],
    [y0 - top, -dy],
    [bottom - y0, dy],
  ] as [number, number][]) {
    if (along === 0) {
      if (edge < 0) {
        return false;
      }
    } else {
      const t = edge / along;
      if (along < 0) {
        t0 = Math.max(t0, t);
      } else {
        t1 = Math.min(t1, t);
      }
      if (t0 > t1) {
        return false;
      }
    }
  }
  return true;
}

function polylineLength(points: [number, number][]): number {
  return points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - points[i][0], p[1] - points[i][1]), 0);
}

/** The point halfway along a polyline. */
function halfway(points: [number, number][]): [number, number] {
  const lengths = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]));
  let left = lengths.reduce((a, b) => a + b, 0) / 2;
  for (let i = 0; i < lengths.length; i++) {
    if (left <= lengths[i] && lengths[i] > 0) {
      const t = left / lengths[i];
      return [points[i][0] + (points[i + 1][0] - points[i][0]) * t, points[i][1] + (points[i + 1][1] - points[i][1]) * t];
    }
    left -= lengths[i];
  }
  return points[points.length - 1];
}

/** A polyline (repeated and straight-through points dropped) with each bend rounded: a curve at most `r` along either side of it. */
function roundedPath(raw: [number, number][], r: number): string {
  const pts = raw.filter(([x, y], i) => i === 0 || x !== raw[i - 1][0] || y !== raw[i - 1][1]);
  const keep = pts.filter((p, i) => {
    if (i === 0 || i === pts.length - 1) {
      return true;
    }
    const [a, c] = [pts[i - 1], pts[i + 1]];
    return Math.abs((p[0] - a[0]) * (c[1] - p[1]) - (p[1] - a[1]) * (c[0] - p[0])) > 0.01;
  });
  const f = (n: number) => Math.round(n * 10) / 10;
  let d = `M ${f(keep[0][0])} ${f(keep[0][1])}`;
  for (let i = 1; i < keep.length - 1; i++) {
    const [a, b, c] = [keep[i - 1], keep[i], keep[i + 1]];
    const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const l2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
    // A corner may take half of a stretch it shares with the next one, all of an end's (the stretch out of a port, into one).
    const k = Math.min(r, i === 1 ? l1 : l1 / 2, i === keep.length - 2 ? l2 : l2 / 2);
    const s = [b[0] + ((a[0] - b[0]) * k) / l1, b[1] + ((a[1] - b[1]) * k) / l1];
    const e = [b[0] + ((c[0] - b[0]) * k) / l2, b[1] + ((c[1] - b[1]) * k) / l2];
    d += ` L ${f(s[0])} ${f(s[1])} Q ${f(b[0])} ${f(b[1])} ${f(e[0])} ${f(e[1])}`;
  }
  const last = keep[keep.length - 1];
  return `${d} L ${f(last[0])} ${f(last[1])}`;
}

/** Kura's Timer: each tick a record of one property, `TIMER` (the time, in ms). */
export const ESF_WIRE_TIMER_FACTORY = "org.eclipse.kura.wire.Timer";
/** Kura's FIFO: what reaches it, passed on as it came. */
export const ESF_WIRE_FIFO_FACTORY = "org.eclipse.kura.wire.Fifo";

/**
 * What an asset's records carry (Kura's `WireAsset`, `RecordFillers`): each channel it reads (READ, READ_WRITE — a WRITE one only
 * written) by its name, with `<name>_timestamp` (timestamps per channel), `<name>_unit` (a unit set) and `<name>_error` (errors
 * emitted) — and `assetName`, and `assetTimestamp` (one timestamp for the record). Named: its channels and `assetName`.
 */
export function esfAssetEmits(channels: { name: string; mode: string }[]): EsfReceivedProperties {
  const read = channels.filter((c) => c.mode.toUpperCase() !== "WRITE").map((c) => c.name);
  return {
    names: [...read.flatMap((n) => [n, `${n}_timestamp`, `${n}_unit`, `${n}_error`]), "assetName", "assetTimestamp"],
    shown: [...read, "assetName"],
  };
}

/**
 * The properties reaching a component's inputs (a Regex Filter's: what its pattern can match), where every source wired into it is
 * known — a Timer's `TIMER`, an asset's (`assetOf`: its channels, once read), a FIFO's what reaches it; null when nothing is wired
 * into it or a source's records aren't known (a Subscriber's, a query's, a script's, another filter's, a loop's).
 */
export function esfWirePropertiesInto(
  graph: EsfWireGraph,
  pid: string,
  factoryOf: (pid: string) => string,
  assetOf: (pid: string) => EsfReceivedProperties | null,
  seen: ReadonlySet<string> = new Set()
): EsfReceivedProperties | null {
  const sources = [...new Set(graph.wires.filter((w) => w.receiver === pid).map((w) => w.emitter))];
  if (!sources.length || seen.has(pid)) {
    return null;
  }
  const path = new Set(seen).add(pid);
  const names = new Set<string>();
  const shown = new Set<string>();
  for (const source of sources) {
    const factory = factoryOf(source);
    const out =
      factory === ESF_WIRE_TIMER_FACTORY
        ? { names: ["TIMER"], shown: ["TIMER"] }
        : isEsfAssetFactory(factory)
          ? assetOf(source)
          : factory === ESF_WIRE_FIFO_FACTORY
            ? esfWirePropertiesInto(graph, source, factoryOf, assetOf, path)
            : null;
    if (!out) {
      return null;
    }
    out.names.forEach((n) => names.add(n));
    out.shown.forEach((n) => shown.add(n));
  }
  return { names: [...names], shown: [...shown] };
}
