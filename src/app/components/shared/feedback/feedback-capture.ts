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

import { getFontEmbedCSS, toCanvas } from "html-to-image";

/**
 * A bug's screenshot: the dashboard as the user sees it, drawn by the browser
 * from a copy of its page (html-to-image — its patch keeps scrolled panes
 * where they are), held as a canvas; at send time made a WebP (a JPEG where
 * the browser can't) within the room the user's record leaves
 * ({@link encodeShot}: ThingsBoard refuses a user whose additional info is
 * past {@link RECORD_MAX_CHARS} characters).
 */
export const RECORD_MAX_CHARS = 98_000;
/** The widths tried, widest first, and at each the qualities, best first: the first that fits is sent. */
const WIDTHS = [1600, 1366, 1152, 960, 800, 640];
const QUALITIES = [0.8, 0.66, 0.52, 0.4];
/** Less room than this: no screenshot (it would be too small to read). */
const MIN_SHOT_CHARS = 12_000;

/**
 * The icons' font (Material Symbols Rounded — every dashboard's, `injectCss`): embedded as its fill axis alone (its default weight,
 * size and grade — an icon filled or not as on the page), ~0.5 MB where the page's whole variable font is ~5.4 MB, most of what a
 * phone took seconds to fetch, embed and draw. (Not Google's `icon_names` cut-down: it's served as a download, which Safari's
 * fetch refuses.)
 */
const ICON_FAMILY = /material symbols/i;
const ICON_FONT_CSS = "https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:FILL@0..1";
/** The icons left blank when their font can't be had: unembedded, their ligatures would show as words ("notifications"). */
const ICONS_BLANK_CSS =
  "mat-icon, .mat-icon, .material-symbols-rounded, .material-symbols-outlined" +
  " { color: transparent !important; -webkit-text-fill-color: transparent !important; }";

/** The text fonts (every family the page draws with but the icons'), embedded once a set of families: later screenshots reuse them. */
const textFontCss = new Map<string, Promise<string>>();
/** The icons' font, embedded once. */
let iconFontCss: Promise<string> | null = null;

/** What `root` draws its text with (the families, the icons' left out) and the icons it shows (their names). */
function fontsUsed(root: HTMLElement): { families: string[]; icons: string[] } {
  const families = new Set<string>();
  const icons = new Set<string>();
  const visit = (el: Element): void => {
    const family = getComputedStyle(el).fontFamily;
    if (ICON_FAMILY.test(family)) {
      const name = el.textContent?.trim() ?? "";
      if (/^[a-z0-9_]+$/.test(name)) {
        icons.add(name);
      }
      return;
    }
    family
      .split(",")
      .map((f) => f.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean)
      .forEach((f) => families.add(f));
    Array.from(el.children).forEach(visit);
  };
  visit(root);
  return { families: [...families].sort(), icons: [...icons].sort() };
}

/**
 * The text fonts' CSS, embedded: html-to-image's, asked of a probe drawn in those families alone (never the icons' whole font) —
 * of a family served in parts by alphabet (Google's Inter: Latin, Latin Extended, Cyrillic, Greek, Vietnamese), the Latin part.
 */
function textFonts(families: string[]): Promise<string> {
  const key = families.join("|");
  let css = textFontCss.get(key);
  if (!css) {
    css = (async () => {
      const probe = document.createElement("div");
      probe.style.cssText = "position: fixed; left: -10000px; top: 0; visibility: hidden; font-family: sans-serif";
      for (const f of families) {
        const span = document.createElement("span");
        span.style.fontFamily = JSON.stringify(f);
        span.textContent = "a";
        probe.appendChild(span);
      }
      document.body.appendChild(probe);
      try {
        return latinOnly(await getFontEmbedCSS(probe));
      } finally {
        probe.remove();
      }
    })().catch(() => {
      textFontCss.delete(key);
      return "";
    });
    textFontCss.set(key, css);
  }
  return css;
}

/** Its `@font-face` rules but those for another alphabet's part of a family (a `unicode-range` without Latin's U+0000–00FF). */
function latinOnly(css: string): string {
  return (css.match(/@font-face\s*{[^}]*}/g) ?? [])
    .filter((rule) => !/unicode-range/i.test(rule) || /unicode-range\s*:[^;}]*\bU\+0+-0*FF\b/i.test(rule))
    .join("\n");
}

/** The icons' font ({@link ICON_FONT_CSS}), its file inlined; "" when it can't be had (none shown: nothing fetched). */
function iconFonts(icons: string[]): Promise<string> {
  if (!icons.length) {
    return Promise.resolve("");
  }
  return (iconFontCss ??= fetch(ICON_FONT_CSS)
    .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`${r.status}`))))
    .then((css) => inlineUrls((css.match(/@font-face\s*{[^}]*}/g) ?? []).join("\n")))
    .catch(() => {
      iconFontCss = null;
      return "";
    }));
}

/** A stylesheet's `url(…)`s made data URLs (the screenshot is drawn from a copy that can't fetch anything). */
async function inlineUrls(css: string): Promise<string> {
  const urls = [...new Set([...css.matchAll(/url\((['"]?)([^)'"]+)\1\)/g)].map((m) => m[2]))];
  const inlined = await Promise.all(urls.map(async (url) => [url, await dataUrlOf(url)] as const));
  return inlined.reduce((text, [url, data]) => text.split(url).join(data), css);
}

function dataUrlOf(url: string): Promise<string> {
  return fetch(url)
    .then((r) => r.blob())
    .then(
      (blob) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        })
    );
}

/** The fonts `root` draws with, embedded: its text fonts, and the icons' font cut down to the icons on it (blank without it). */
async function fontsFor(root: HTMLElement): Promise<string> {
  const used = fontsUsed(root);
  const [text, icons] = await Promise.all([textFonts(used.families), iconFonts(used.icons)]);
  return [text, icons || (used.icons.length ? ICONS_BLANK_CSS : "")].filter(Boolean).join("\n");
}

/** The fonts fetched and embedded ahead, in the background (a phone's dialog, as it opens): the screenshot at send time needn't wait. */
export function prepareFonts(root: HTMLElement): void {
  void fontsFor(root);
}

/**
 * `root` drawn, leaving out what `skip` names (the feedback dialog itself), what isn't shown, and what's past the window's right
 * or bottom edge (rows scrolled out of view, a closed side panel or sheet): never drawn, and copying it is most of the time a
 * phone takes — what's left keeps its place (the copy holds every box's size).
 */
export async function captureScreen(root: HTMLElement, skip: (el: Element) => boolean): Promise<HTMLCanvasElement> {
  const right = window.innerWidth;
  const bottom = window.innerHeight;
  const filter = (node: HTMLElement): boolean => !(node instanceof Element) || (!skip(node) && shown(node) && !pastEdge(node, right, bottom));
  const fontEmbedCSS = await fontsFor(root);
  const options = {
    filter,
    fontEmbedCSS,
    pixelRatio: 1,
    skipAutoScale: true,
    backgroundColor: surfaceOf(root),
    // A picture that can't be fetched (another site's, refused): left empty rather than failing the screenshot.
    imagePlaceholder: "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==",
  };
  const unpaint = paintSvgShapes(root);
  try {
    // The first picture of a page can come out empty — the browser drew the copy before its embedded fonts were in — then once more.
    const canvas = await toCanvas(root, options);
    return blank(canvas) ? await toCanvas(root, options) : canvas;
  } finally {
    unpaint();
  }
}

/** The paint of an SVG shape, as CSS draws it (`fill: var(--c-chart-1)`, a class's stroke). */
const SVG_PAINT = [
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-dasharray",
  "stroke-dashoffset",
  "opacity",
  "vector-effect",
];
const SVG_SHAPES = ["path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text", "tspan", "use"].map((s) => `svg ${s}`).join(", ");

/**
 * Safari's copy keeps no CSS on SVG shapes (html-to-image copies the properties the browser lists for the page's root, and WebKit
 * lists no SVG paint): a shape coloured by its class draws black — a trend line's area a black block, its line a black shape. Each
 * shape's paint, as drawn, written onto it as attributes for the copy (which keeps them; on the page, CSS still rules over them);
 * the returned function takes them off again. One the shape has already (an ECharts chart's) stays as it is.
 */
function paintSvgShapes(root: HTMLElement): () => void {
  const added: [Element, string][] = [];
  root.querySelectorAll(SVG_SHAPES).forEach((el) => {
    const style = getComputedStyle(el);
    for (const name of SVG_PAINT) {
      const value = style.getPropertyValue(name);
      if (value && !el.hasAttribute(name)) {
        el.setAttribute(name, value);
        added.push([el, name]);
      }
    }
  });
  return () => added.forEach(([el, name]) => el.removeAttribute(name));
}

/** Nothing drawn but the background: a small copy's pixels all alike. */
function blank(canvas: HTMLCanvasElement): boolean {
  const small = document.createElement("canvas");
  small.width = 48;
  small.height = 48;
  const g = small.getContext("2d", { willReadFrequently: true });
  if (!g || !canvas.width || !canvas.height) {
    return false;
  }
  g.drawImage(canvas, 0, 0, small.width, small.height);
  const d = g.getImageData(0, 0, small.width, small.height).data;
  for (let i = 4; i < d.length; i += 4) {
    if (Math.abs(d[i] - d[0]) + Math.abs(d[i + 1] - d[1]) + Math.abs(d[i + 2] - d[2]) > 24) {
      return false;
    }
  }
  return true;
}

/**
 * Wholly past the window's right or bottom edge — or, laid out of the flow (fixed, absolute), past its left or top one (a closed
 * drawer): out of the picture. Leaving it out moves nothing that's in it (what's above or left of the picture stays, in the flow).
 */
function pastEdge(el: Element, right: number, bottom: number): boolean {
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) {
    return false; // `display: contents`, an empty box: its children decide
  }
  if (r.left >= right || r.top >= bottom) {
    return true;
  }
  if (r.right <= 0 || r.bottom <= 0) {
    const position = getComputedStyle(el).position;
    return position === "fixed" || position === "absolute";
  }
  return false;
}

/** Not drawn at all (display: none and its like): left out of the copy — a box with `display: contents` draws its children. */
function shown(el: Element): boolean {
  const check = (el as Element & { checkVisibility?: () => boolean }).checkVisibility;
  if (!check || check.call(el)) {
    return true;
  }
  return getComputedStyle(el).display === "contents";
}

/** The dashboard's own background (its root's, else the page's), under what's transparent. */
function surfaceOf(root: HTMLElement): string {
  for (let el: HTMLElement | null = root; el; el = el.parentElement) {
    const bg = getComputedStyle(el).backgroundColor;
    if (bg && bg !== "transparent" && !/rgba\(.*,\s*0\)$/.test(bg)) {
      return bg;
    }
  }
  return "#ffffff";
}

/**
 * The screenshot as a data URL of at most `maxChars` characters: the widest
 * of {@link WIDTHS} (none wider than the canvas) at the best of
 * {@link QUALITIES} that fits; null when even the smallest doesn't (or the
 * room is under {@link MIN_SHOT_CHARS}).
 */
export function encodeShot(canvas: HTMLCanvasElement, maxChars: number): string | null {
  if (maxChars < MIN_SHOT_CHARS) {
    return null;
  }
  const type = webpEncodes() ? "image/webp" : "image/jpeg";
  const widest = Math.min(canvas.width, WIDTHS[0]);
  for (const width of [widest, ...WIDTHS.filter((w) => w < widest)]) {
    const source = width < canvas.width ? scaled(canvas, width / canvas.width) : canvas;
    for (const quality of QUALITIES) {
      const url = source.toDataURL(type, quality);
      if (url.length <= maxChars) {
        return url;
      }
    }
  }
  return null;
}

/** The browser makes WebP pictures (Chrome, Edge, Firefox: smaller than JPEG at the same look); Safari makes PNG instead. */
let webp: boolean | null = null;
function webpEncodes(): boolean {
  if (webp === null) {
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    webp = c.toDataURL("image/webp").startsWith("data:image/webp");
  }
  return webp;
}

function scaled(canvas: HTMLCanvasElement, factor: number): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(canvas.width * factor));
  out.height = Math.max(1, Math.round(canvas.height * factor));
  const g = out.getContext("2d");
  if (g) {
    g.imageSmoothingQuality = "high";
    g.drawImage(canvas, 0, 0, out.width, out.height);
  }
  return out;
}
