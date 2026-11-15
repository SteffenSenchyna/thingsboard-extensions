#!/usr/bin/env node
// A relation diagram from a JSON spec, in the look of the ThingsBoard Extensions' "Help with drawings" (the
// ThingsBoard docs' diagrams in the dashboards' colours). No dependencies: Node 18+.
//
//   node render.mjs spec.json -o drawing.html      a standalone page (the drawing, or its text beside it)
//   node render.mjs spec.json -o drawing.svg       a standalone SVG file (styles and canvas inside)
//   node render.mjs spec.json --format fragment    <div class="dg-canvas"><svg …></div> on stdout, for a page that
//                                                  already holds assets/docs-diagram.css and the fonts link
//
// The spec is laid out on the drawings' grid: rows top to bottom, items in a row on three columns (col 0, 1, 2 —
// fractions between them allowed), every size measured from the content. See SKILL.md for the spec reference.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { textWidth } from "./inter-metrics.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CSS_PATH = path.join(HERE, "..", "assets", "docs-diagram.css");
export const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Inter:wght@500;600&family=Roboto:wght@400;500;700" +
  "&family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20,400,0,0&display=block";

// The drawings' units (a 720-wide canvas), as the dashboard's hand-placed drawings use them.
const W = 720;
const PAD = 24; // canvas edge → content
const COL0 = 108.4; // col 0's centre (a 168.8-wide group 24 from the left edge)
const COL_STEP = 251.6; // col 0 → col 1 (the centre, 360) → col 2 (611.6)
const ROW_GAP = 44;
const CARD_W = 144;
const CARD_H = 55;
const CARD_GAP_X = 16;
const CARD_GAP_Y = 12;
const LINKED_GAP_X = 40; // two cards side by side with a link between them
const LINKED_GAP_Y = 22;
const GROUP_PAD = 12.4;
const GROUP_MIN_W = 168.8;
const CHIP_H = 23.04;
const CHIP_PAD_X = 9;
const CHIP_GAP = 8;
const NOTE_GAP = 10; // a card → the chip under it
const TAG_H = 15.5;
const TAG_PAD_X = 7;
const LABEL_MAX_W = CARD_W - 50.35 - 9; // a card label's room right of its tile
const CORNER = 12; // a connector's corner radius
const ARROW = 4.5; // a chevron's arm
const INSET = 14; // how close to a box's corner a connector may attach
const PORT_STEP = 24; // between two connectors on one side of a box
const PORT_MIN_SEP = 20;

const COLORS = new Set(["c1", "c2", "c3", "c4", "c5", "neutral"]);

const f = (v) => String(Math.round(v * 100) / 100);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
const tagWidth = (text) => textWidth(text, 7.5, 600) + 2 * TAG_PAD_X;
const chipWidth = (text) => textWidth(text, 8, 500) + 2 * CHIP_PAD_X;

/** Lay the spec out and draw it: { svgBody, height, warnings }. */
export function draw(spec) {
  const warnings = [];
  const warn = (msg) => warnings.push(msg);
  const rows = (spec.rows || []).map((row) => (Array.isArray(row) ? { items: row } : row));
  const links = (spec.links || []).filter((l) => l && l.from && l.to);
  const linked = (a, b) => links.find((l) => (l.from === a && l.to === b) || (l.from === b && l.to === a));
  const nodes = new Map();
  const colorOf = (c, fallback) => {
    const color = c || fallback;
    if (!COLORS.has(color)) {
      warn(`unknown color "${color}" (use c1…c5 or neutral)`);
      return "neutral";
    }
    return color;
  };
  let autoId = 0;
  const idOf = (id) => id || `_${++autoId}`;

  // 1. Measure every item (a group's size from its cards or chips, a card's from its note chip).
  const measureCard = (c) => ({ w: CARD_W, h: CARD_H + (c.chip ? NOTE_GAP + CHIP_H : 0) });
  const measured = rows.map((row) =>
    (row.items || []).map((item) => {
      if (item.group !== undefined) {
        const color = colorOf(item.color, "neutral");
        const name = item.name || "";
        let inner;
        let gaps = [];
        const cards = (item.cards || []).map((c) => ({ ...c, id: idOf(c.id), size: measureCard(c) }));
        const chips = item.chips || [];
        const column = item.layout === "column";
        if (cards.length) {
          gaps = cards.slice(1).map((c, i) => {
            const link = linked(cards[i].id, c.id);
            if (!link) return column ? CARD_GAP_Y : CARD_GAP_X;
            const room = link.label ? (column ? TAG_H + 16 : tagWidth(link.label) + 24) : 0;
            return Math.max(column ? LINKED_GAP_Y : LINKED_GAP_X, room);
          });
          const sum = (key) => cards.reduce((s, c) => s + c.size[key], 0) + gaps.reduce((s, g) => s + g, 0);
          const max = (key) => Math.max(...cards.map((c) => c.size[key]));
          inner = column ? { w: max("w"), h: sum("h") } : { w: sum("w"), h: max("h") };
        } else if (chips.length) {
          const cols = Math.max(1, Math.min(item.chipColumns || 2, chips.length));
          const cw = Math.max(...chips.map(chipWidth));
          const chipRows = Math.ceil(chips.length / cols);
          inner = { w: cols * cw + (cols - 1) * CHIP_GAP, h: chipRows * CHIP_H + (chipRows - 1) * CHIP_GAP, cols, cw };
        } else {
          inner = { w: CARD_W, h: CARD_H };
          warn(`group "${item.group}" has no cards or chips`);
        }
        const w = Math.max(GROUP_MIN_W, inner.w + 2 * GROUP_PAD, name ? tagWidth(name) + 16 : 0);
        return { kind: "group", spec: item, id: idOf(item.group), color, name, cards, chips, column, gaps, inner, w, h: inner.h + 2 * GROUP_PAD };
      }
      if (item.card !== undefined) {
        return { kind: "card", spec: item, id: idOf(item.card), color: colorOf(item.color, "neutral"), ...measureCard(item) };
      }
      warn(`row item without "group" or "card": ${JSON.stringify(item).slice(0, 60)}`);
      return null;
    }).filter(Boolean),
  );

  // 2. Place the rows top to bottom and each item on its column; items in a row centred on the row (or top-aligned).
  const rowTop = [];
  const rowBottom = [];
  let y = PAD;
  measured.forEach((items, r) => {
    if (r > 0) y += rows[r].gap ?? ROW_GAP;
    const height = Math.max(0, ...items.map((it) => it.h));
    rowTop[r] = y;
    rowBottom[r] = y + height;
    const n = items.length;
    items.forEach((it, i) => {
      const col = it.spec.col ?? (n === 1 ? 1 : n === 2 ? 0.5 + i : (2 * i) / (n - 1));
      it.x = clamp(COL0 + col * COL_STEP - it.w / 2, PAD, W - PAD - it.w);
      it.y = rows[r].align === "top" ? y : y + (height - it.h) / 2;
      it.row = r;
    });
    const sorted = [...items].sort((a, b) => a.x - b.x);
    sorted.slice(1).forEach((it, i) => {
      const prev = sorted[i];
      if (it.x < prev.x + prev.w + 8) warn(`row ${r + 1}: "${prev.id}" and "${it.id}" overlap — give them other cols`);
    });
    y += height;
  });
  const height = y + PAD;

  // 3. Register the boxes connectors attach to (cards without their note chip).
  const addNode = (node) => {
    if (nodes.has(node.id)) warn(`duplicate id "${node.id}"`);
    nodes.set(node.id, { ...node, cx: node.x + node.w / 2, cy: node.y + node.h / 2 });
  };
  const placedCards = [];
  const groups = [];
  for (const items of measured) {
    for (const it of items) {
      if (it.kind === "card") {
        const card = { ...it.spec, id: it.id, color: it.color, x: it.x, y: it.y, row: it.row, parent: null };
        placedCards.push(card);
        addNode({ id: it.id, kind: "card", x: it.x, y: it.y, w: CARD_W, h: CARD_H, color: it.color, row: it.row, filled: !!it.spec.filled });
        continue;
      }
      groups.push(it);
      const tagEnd = it.name ? it.x + 8 + tagWidth(it.name) + 8 : it.x;
      addNode({ id: it.id, kind: "group", x: it.x, y: it.y, w: it.w, h: it.h, color: it.color, row: it.row, tagEnd, children: it.cards.map((c) => c.id) });
      let cx = it.x + (it.w - it.inner.w) / 2;
      let cy = it.y + GROUP_PAD;
      it.cards.forEach((c, i) => {
        const card = { ...c, color: it.color, x: cx, y: cy, row: it.row, parent: it.id };
        placedCards.push(card);
        addNode({ id: c.id, kind: "card", x: cx, y: cy, w: CARD_W, h: CARD_H, color: it.color, row: it.row, parent: it.id, filled: !!c.filled });
        if (it.column) cy += c.size.h + (it.gaps[i] || 0);
        else cx += c.size.w + (it.gaps[i] || 0);
      });
    }
  }

  // 4. Route the connectors: straight where the smaller box's centre faces the other box (a card: its middle; a group:
  //    anywhere along it), else an elbow through the gap between the rows (vertical) or between the boxes
  //    (horizontal); the colour is where the connector comes from.
  // Where a connector may meet a box's top or bottom: clear of its corners, and of a group's name tag on its top.
  const sideRange = (node, side) => [
    Math.max(node.x + INSET, side === "top" && node.tagEnd ? node.tagEnd : -Infinity),
    node.x + node.w - INSET,
  ];
  const within = (v, [lo, hi]) => v >= lo && v <= hi;
  const straightAt = (a, b, axis, sideA, sideB) => {
    const [pos, size, centre] = axis === "x" ? ["x", "w", "cx"] : ["y", "h", "cy"];
    const narrower = a[size] <= b[size] ? a : b;
    const wider = narrower === a ? b : a;
    const t = narrower[centre];
    if (axis === "x") {
      const [nSide, wSide] = narrower === a ? [sideA, sideB] : [sideB, sideA];
      const wRange = wider.kind === "card" ? [wider.cx - 10, wider.cx + 10] : sideRange(wider, wSide);
      return within(t, sideRange(narrower, nSide)) && within(t, wRange) ? t : null;
    }
    const inset = wider.kind === "card" ? wider[size] / 2 - 10 : INSET;
    return t >= wider[pos] + inset && t <= wider[pos] + wider[size] - inset ? t : null;
  };
  const portX = (node, side) => {
    const [lo, hi] = sideRange(node, side);
    return lo <= hi ? clamp(node.cx, lo, hi) : node.cx;
  };
  const routes = [];
  for (const link of links) {
    const a = nodes.get(link.from);
    const b = nodes.get(link.to);
    if (!a || !b) {
      warn(`link ${link.from} → ${link.to}: unknown id "${!a ? link.from : link.to}"`);
      continue;
    }
    if (a.id === b.id || a.parent === b.id || b.parent === a.id) {
      warn(`link ${link.from} → ${link.to}: a box can't link to itself or its own group`);
      continue;
    }
    const xOverlap = a.x < b.x + b.w && b.x < a.x + a.w;
    const vertical = a.row !== b.row || xOverlap;
    const route = { link, a, b, vertical, color: a.color };
    if (vertical) {
      const down = a.row !== b.row ? a.row < b.row : a.cy < b.cy;
      route.down = down;
      route.y1 = down ? a.y + a.h : a.y;
      route.y2 = down ? b.y : b.y + b.h;
      const sideA = down ? "bottom" : "top";
      const sideB = down ? "top" : "bottom";
      const x = straightAt(a, b, "x", sideA, sideB);
      if (x !== null) {
        route.ends = [
          { node: a, side: sideA, x, fixed: true, departs: true, route },
          { node: b, side: sideB, x, fixed: true, departs: false, route },
        ];
      } else {
        route.elbow = true;
        if (a.row !== b.row) {
          const upper = Math.min(a.row, b.row);
          const lower = Math.max(a.row, b.row);
          const gapRow = lower - upper === 1 ? upper : down ? b.row - 1 : b.row;
          route.yc = (rowBottom[gapRow] + rowTop[gapRow + 1]) / 2;
        } else {
          route.yc = (route.y1 + route.y2) / 2;
        }
        route.ends = [
          { node: a, side: sideA, x: portX(a, sideA), fixed: false, departs: true, dir: sign(b.cx - a.cx), route },
          { node: b, side: sideB, x: portX(b, sideB), fixed: false, departs: false, dir: sign(a.cx - b.cx), route },
        ];
      }
    } else {
      const right = a.cx < b.cx;
      route.x1 = right ? a.x + a.w : a.x;
      route.x2 = right ? b.x : b.x + b.w;
      const yy = straightAt(a, b, "y");
      if (yy !== null) {
        route.y = yy;
      } else {
        route.elbow = true;
        route.xc = (route.x1 + route.x2) / 2;
        route.ya = a.cy;
        route.yb = b.cy;
      }
      route.ends = [];
    }
    routes.push(route);
  }

  // 5. Ports: where several connectors meet one side of a box. Straight ones keep their place; arrivals never share a
  //    point (each its own arrowhead — a group's cards' centres first); departures share a trunk unless one is labelled.
  const sides = new Map();
  for (const route of routes) {
    for (const end of route.ends) {
      const key = `${end.node.id}:${end.side}`;
      if (!sides.has(key)) sides.set(key, []);
      sides.get(key).push(end);
    }
  }
  for (const ends of sides.values()) {
    if (ends.length < 2) continue;
    const node = ends[0].node;
    const [lo, hi] = sideRange(node, ends[0].side);
    const straight = ends.filter((e) => e.fixed).map((e) => e.x);
    // a labelled straight connector keeps the others clear of its label
    const taken = ends
      .filter((e) => e.fixed)
      .map((e) => ({ x: e.x, sep: e.route.link.label ? tagWidth(e.route.link.label) / 2 + 8 : PORT_MIN_SEP }));
    const free = (x) => x >= lo && x <= hi && taken.every((t) => Math.abs(t.x - x) >= t.sep);
    // an elbow's run through the gap, from this port to the far box, must not cut a straight connector on this side
    const crosses = (end, x) => {
      const far = end.departs ? end.route.b.cx : end.route.a.cx;
      return straight.some((t) => t > Math.min(x, far) + 0.5 && t < Math.max(x, far) - 0.5);
    };
    const labelled = ends.some((e) => e.departs && e.route.link.label);
    const loose = ends.filter((e) => !e.fixed);
    loose.sort((p, q) => Math.abs(p.route.b.cx - p.route.a.cx) - Math.abs(q.route.b.cx - q.route.a.cx));
    for (const end of loose) {
      if (end.departs && !labelled) {
        continue; // a shared trunk: every unlabelled elbow leaves from the centre, branching in the gap
      }
      const dir = end.dir || 1;
      const candidates = [end.x];
      if (!end.departs && node.children) {
        const toward = (x) => sign(x - node.cx) === dir;
        const kids = node.children.map((id) => nodes.get(id).cx).filter(toward);
        kids.sort((p, q) => Math.abs(p - node.cx) - Math.abs(q - node.cx));
        candidates.push(...kids);
      }
      for (let k = 1; k <= 8; k++) candidates.push(end.x + dir * k * PORT_STEP);
      for (let k = 1; k <= 8; k++) candidates.push(end.x - dir * k * PORT_STEP);
      const x = candidates.find((c) => free(c) && !crosses(end, c)) ?? candidates.find(free) ?? end.x;
      end.x = x;
      taken.push({ x, sep: PORT_MIN_SEP });
    }
  }

  // 6. Draw the connectors, their chevrons and their labels' places.
  const lines = [];
  const tags = [];
  // every box a connector shouldn't cut through: groups, cards, the chips under cards
  const boxes = [
    ...nodes.values(),
    ...placedCards
      .filter((c) => c.chip)
      .map((c) => ({ id: `${c.id}'s chip`, x: c.x, y: c.y + CARD_H + NOTE_GAP, w: chipWidth(c.chip), h: CHIP_H, parent: c.parent })),
  ];
  const chevron = (x, y, dx, dy) =>
    `M${f(x - ARROW * dx - ARROW * dy)} ${f(y - ARROW * dy + ARROW * dx)} L${f(x)} ${f(y)} L${f(x - ARROW * dx + ARROW * dy)} ${f(y - ARROW * dy - ARROW * dx)}`;
  for (const route of routes) {
    const cls = `dg-line dg-${route.color}`;
    // the connector as a polyline (two or four corners), its last segment arriving at `b`
    let pts;
    if (route.vertical) {
      const [ea, eb] = route.ends;
      const { y1, y2 } = route;
      pts =
        !route.elbow || Math.abs(ea.x - eb.x) < 0.5
          ? [[ea.x, y1], [ea.x, y2]]
          : [[ea.x, y1], [ea.x, route.yc], [eb.x, route.yc], [eb.x, y2]];
    } else {
      const { x1, x2 } = route;
      pts = !route.elbow ? [[x1, route.y], [x2, route.y]] : [[x1, route.ya], [route.xc, route.ya], [route.xc, route.yb], [x2, route.yb]];
    }
    const segs = pts.slice(1).map((p, i) => {
      const q = pts[i];
      const len = Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]);
      return { from: q, to: p, len, dir: [sign(p[0] - q[0]), sign(p[1] - q[1])], vertical: q[0] === p[0] };
    });
    // a corner's radius: the full corner, at most half a middle segment, all of an end segment
    const radii = segs.slice(1).map((seg, i) => {
      const prev = segs[i];
      return Math.min(CORNER, prev.len * (i === 0 ? 1 : 0.5), seg.len * (i + 2 === segs.length ? 1 : 0.5));
    });
    let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
    radii.forEach((r, i) => {
      const [cx, cy] = pts[i + 1];
      const [px, py] = segs[i].dir;
      const [nx, ny] = segs[i + 1].dir;
      d += ` L${f(cx - px * r)} ${f(cy - py * r)} Q${f(cx)} ${f(cy)} ${f(cx + nx * r)} ${f(cy + ny * r)}`;
    });
    const last = pts[pts.length - 1];
    d += ` L${f(last[0])} ${f(last[1])}`;
    const [ax, ay] = segs[segs.length - 1].dir;
    lines.push(`<path class="${cls}" d="${d}"/>`, `<path class="${cls}" d="${chevron(last[0], last[1], ax, ay)}"/>`);

    // a connector that cuts through a box it doesn't join
    const skip = new Set([route.a.id, route.b.id, route.a.parent, route.b.parent].filter(Boolean));
    const crossed = [...boxes].filter((box) => {
      if (skip.has(box.id) || skip.has(box.parent)) return false;
      return segs.some(({ from: [x0, y0], to: [x1, y1] }) => {
        const [lx, hx, ly, hy] = [Math.min(x0, x1), Math.max(x0, x1), Math.min(y0, y1), Math.max(y0, y1)];
        return hx > box.x + 1 && lx < box.x + box.w - 1 && hy > box.y + 1 && ly < box.y + box.h - 1;
      });
    });
    const named = crossed.filter((box) => !crossed.some((o) => o.id === box.parent)).map((box) => `"${box.id}"`);
    if (named.length) {
      warn(`link ${route.link.from} → ${route.link.to} crosses ${named.join(", ")} — move a box, or link boxes in neighbouring rows`);
    }

    const label = route.link.label;
    if (label) {
      // on the middle segment, else the longest one with room for it
      const w = tagWidth(label);
      const room = (seg, i) => seg.len - (radii[i - 1] || 0) - (radii[i] || 0) - (seg.vertical ? TAG_H : w) - 8;
      const order = segs.map((seg, i) => i).sort((p, q) => (p === segs.length >> 1 ? -1 : q === segs.length >> 1 ? 1 : segs[q].len - segs[p].len));
      const pick = order.find((i) => room(segs[i], i) >= 0);
      if (pick === undefined) warn(`link ${route.link.from} → ${route.link.to}: no room for its label "${label}"`);
      const seg = segs[pick ?? segs.length >> 1];
      const at = { x: (seg.from[0] + seg.to[0]) / 2, y: (seg.from[1] + seg.to[1]) / 2 };
      tags.push(
        `<g class="dg-${route.color}"><rect class="dg-group-tag" x="${f(at.x - w / 2)}" y="${f(at.y - TAG_H / 2)}" ` +
          `width="${f(w)}" height="${TAG_H}" rx="1.75"/><text class="dg-group-name" x="${f(at.x)}" ` +
          `y="${f(at.y + 2.75)}" text-anchor="middle">${esc(label)}</text></g>`,
      );
    }
  }

  // 7. The boxes: groups under the connectors, cards and chips over them, the labels on top.
  const out = [];
  for (const g of groups) {
    const tag = g.name
      ? `<rect class="dg-group-tag" x="${f(g.x + 8)}" y="${f(g.y - TAG_H / 2)}" width="${f(tagWidth(g.name))}" ` +
        `height="${TAG_H}" rx="1.75"/><text class="dg-group-name" x="${f(g.x + 8 + TAG_PAD_X)}" y="${f(g.y + 2.75)}">${esc(g.name)}</text>`
      : "";
    out.push(
      `<g class="dg-group dg-${g.color}"><rect class="dg-group-box" x="${f(g.x)}" y="${f(g.y)}" width="${f(g.w)}" ` +
        `height="${f(g.h)}" rx="3.75"/>${tag}</g>`,
    );
  }
  out.push(...lines);
  const chip = (x, y, w, text, color) => {
    const hued = color && color !== "neutral" ? ` dg-chip-hued dg-${color}` : "";
    return (
      `<g class="dg-chip${hued}"><rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${CHIP_H}" rx="5.52"/>` +
      `<text x="${f(x + w / 2)}" y="${f(y + 14.6)}">${esc(text)}</text></g>`
    );
  };
  for (const g of groups) {
    if (!g.chips.length) continue;
    const { cols, cw } = g.inner;
    const x0 = g.x + (g.w - g.inner.w) / 2;
    g.chips.forEach((text, i) => {
      out.push(chip(x0 + (i % cols) * (cw + CHIP_GAP), g.y + GROUP_PAD + Math.floor(i / cols) * (CHIP_H + CHIP_GAP), cw, text, g.color));
    });
  }
  for (const c of placedCards) {
    const color = c.color;
    const flat = color === "neutral" || c.filled;
    const label = c.label || "";
    const words = label.split(/\s+/).filter(Boolean);
    let linesOf = [label];
    if (textWidth(label, 10.5, 600) > LABEL_MAX_W && words.length > 1) {
      // two lines, split where the longer line is shortest
      let best = null;
      for (let i = 1; i < words.length; i++) {
        const pair = [words.slice(0, i).join(" "), words.slice(i).join(" ")];
        const longest = Math.max(...pair.map((t) => textWidth(t, 10.5, 600)));
        if (!best || longest < best.longest) best = { pair, longest };
      }
      linesOf = best.pair;
    }
    if (Math.max(...linesOf.map((t) => textWidth(t, 10.5, 600))) > LABEL_MAX_W + 1) {
      warn(`card "${c.id}": label "${label}" is too long for a card — shorten it`);
    }
    const lx = c.x + 50.35;
    const ly = c.y + 31.3;
    const tspans = linesOf
      .map((t, i) => `<tspan x="${f(lx)}" y="${f(ly + (i - (linesOf.length - 1) / 2) * 12.6)}">${esc(t)}</tspan>`)
      .join("");
    if (!c.icon) warn(`card "${c.id}" has no icon`);
    out.push(
      `<g class="dg-card dg-${color}${c.filled ? " dg-filled" : ""}"><rect class="dg-card-box" x="${f(c.x)}" y="${f(c.y)}" ` +
        `width="${CARD_W}" height="${CARD_H}" rx="${flat ? 9.59 : 7.19}"/><rect class="dg-card-tile" x="${f(c.x + 12.15)}" ` +
        `y="${f(c.y + 12.15)}" width="30.7" height="30.7" rx="3.84"/><text class="dg-card-icon" x="${f(c.x + 27.5)}" ` +
        `y="${f(c.y + 27.5)}">${esc(c.icon || "category")}</text><text class="dg-card-label">${tspans}</text></g>`,
    );
    if (c.chip) {
      const w = chipWidth(c.chip);
      if (w > CARD_W + 16) warn(`card "${c.id}": its chip "${c.chip}" is wider than the card`);
      out.push(chip(c.x, c.y + CARD_H + NOTE_GAP, w, c.chip, color));
    }
  }
  out.push(...tags);
  return { svgBody: out.join(""), height, warnings };
}

function canvasGeometry(css) {
  const rule = /\.dg-canvas\s*\{([^}]*)\}/.exec(css)?.[1] || "";
  const px = (re, fallback) => Number(re.exec(rule)?.[1] ?? fallback);
  const radius = px(/border-radius:\s*([\d.]+)px/, 8);
  const spacing = px(/background-size:\s*([\d.]+)px/, 17);
  const stops = /radial-gradient\([^,]+,[^)]*?([\d.]+)px,\s*transparent\s+([\d.]+)px/.exec(rule);
  const dot = stops ? (Number(stops[1]) + Number(stops[2])) / 2 : 1.2;
  return { radius, spacing, dot };
}

/** The <svg> element. `standalone`: an .svg file — its styles inside, the canvas drawn in it. */
export function svg(spec, { standalone = false, theme = null, css = fs.readFileSync(CSS_PATH, "utf8") } = {}) {
  const { svgBody, height, warnings } = draw(spec);
  const h = f(height);
  const label = esc(spec.alt || spec.title || "A relation diagram");
  if (!standalone) {
    return { markup: `<svg class="dg" viewBox="0 0 ${W} ${h}" role="img" aria-label="${label}">${svgBody}</svg>`, warnings };
  }
  const { radius, spacing, dot } = canvasGeometry(css);
  const ox = (W / 2 - spacing / 2) % spacing;
  const oy = (height / 2 - spacing / 2) % spacing;
  const style = `@import url("${FONTS_HREF}");\n${css}\n:root.dg { width: auto; height: auto; max-width: 100%; }\n`;
  const markup =
    `<svg xmlns="http://www.w3.org/2000/svg" class="dg"${theme ? ` data-theme="${theme}"` : ""} width="${W}" height="${h}" ` +
    `viewBox="0 0 ${W} ${h}" role="img" aria-label="${label}">` +
    `<style><![CDATA[\n${style.replace(/]]>/g, "]] >")}]]></style>` +
    `<defs><pattern id="dg-dots" patternUnits="userSpaceOnUse" x="${f(ox)}" y="${f(oy)}" width="${spacing}" height="${spacing}">` +
    `<circle class="dg-canvas-dot" cx="${spacing / 2}" cy="${spacing / 2}" r="${dot}"/></pattern></defs>` +
    `<rect class="dg-canvas-box" x="0.5" y="0.5" width="${W - 1}" height="${f(height - 1)}" rx="${radius}"/>` +
    `<rect x="0.5" y="0.5" width="${W - 1}" height="${f(height - 1)}" rx="${radius}" fill="url(#dg-dots)"/>` +
    `${svgBody}</svg>\n`;
  return { markup, warnings };
}

/** `code` and **strong** in a line of text; the rest escaped. */
export function inline(text) {
  return esc(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

/**
 * A standalone page: the drawing on its canvas, or — with `items` (the bullets, as HTML) — a card titled `panel`
 * holding the text beside the drawing, as the dashboards' help dialogs show it. `heading` over it all.
 */
export function page({ title, heading, panel, items, svgMarkup, theme = null, css = fs.readFileSync(CSS_PATH, "utf8") }) {
  const figure = `<figure class="dg-figure"><div class="dg-canvas">${svgMarkup}</div></figure>`;
  const body = items?.length
    ? `<section class="dg-panel">${panel ? `<h2 class="dg-panel-title">${esc(panel)}</h2>` : ""}` +
      `<div class="dg-section"><div class="dg-text"><ul>\n${items.map((li) => `<li>${li}</li>`).join("\n")}\n</ul></div>` +
      `${figure}</div></section>`
    : figure;
  return `<!doctype html>
<html lang="en"${theme ? ` data-theme="${theme}"` : ""}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title || heading || "Diagram")}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS_HREF}">
<style>
${css}
</style>
<script>
  // ?theme=dark or ?theme=light forces a theme; otherwise the viewer's preference.
  try { const t = new URLSearchParams(location.search).get("theme"); if (t) document.documentElement.dataset.theme = t; } catch (e) {}
</script>
</head>
<body class="dg-page">
<main class="dg-main">
${heading ? `<h1 class="dg-page-title">${esc(heading)}</h1>\n` : ""}${body}
</main>
</body>
</html>
`;
}

/** The spec rendered in a format: "html", "svg" or "fragment"; `theme` "light" / "dark" pins one (else the viewer's). */
export function render(spec, format = "html", theme = null) {
  if (format === "svg") return svg(spec, { standalone: true, theme });
  const { markup, warnings } = svg(spec);
  if (format === "fragment") return { markup: `<div class="dg-canvas${theme ? ` dg-${theme}` : ""}">${markup}</div>\n`, warnings };
  const items = (spec.text || []).map(inline);
  return { markup: page({ title: spec.title, heading: spec.title, panel: spec.panel, items, svgMarkup: markup, theme }), warnings };
}

const USAGE = "usage: node render.mjs <spec.json | -> [-o out.html|out.svg] [--format html|svg|fragment] [--theme light|dark]\n";

function main(argv) {
  const args = argv.slice(2);
  let input = null;
  let out = null;
  let format = null;
  let theme = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "-o" || a === "--out") out = args[++i];
    else if (a === "--format") format = args[++i];
    else if (a === "--theme") theme = args[++i];
    else if (a === "-h" || a === "--help") {
      process.stdout.write(USAGE);
      process.exit(0);
    } else input = a;
  }
  if (!input || (theme && !["light", "dark"].includes(theme))) {
    process.stderr.write(USAGE);
    process.exit(2);
  }
  const spec = JSON.parse(fs.readFileSync(input === "-" ? 0 : input, "utf8"));
  format = format || (out && out.endsWith(".svg") ? "svg" : "html");
  if (!["html", "svg", "fragment"].includes(format)) {
    process.stderr.write(`unknown format "${format}"\n`);
    process.exit(2);
  }
  const { markup, warnings } = render(spec, format, theme);
  for (const w of warnings) process.stderr.write(`warning: ${w}\n`);
  if (out) {
    fs.writeFileSync(out, markup);
    process.stderr.write(`wrote ${out}\n`);
  } else {
    process.stdout.write(markup);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv);
}
