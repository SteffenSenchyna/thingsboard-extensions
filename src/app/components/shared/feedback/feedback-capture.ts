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

/** The page's fonts, embedded once (the icons' font is large): every later screenshot reuses them. */
let fontCss: Promise<string> | null = null;

/** `root` drawn, leaving out what `skip` names (the feedback dialog itself) and what isn't shown. */
export async function captureScreen(root: HTMLElement, skip: (el: Element) => boolean): Promise<HTMLCanvasElement> {
  const filter = (node: HTMLElement): boolean => !(node instanceof Element) || (!skip(node) && shown(node));
  fontCss ??= getFontEmbedCSS(root, { filter }).catch(() => {
    fontCss = null;
    return "";
  });
  const fontEmbedCSS = await fontCss;
  return toCanvas(root, {
    filter,
    fontEmbedCSS,
    pixelRatio: 1,
    skipAutoScale: true,
    backgroundColor: surfaceOf(root),
    // A picture that can't be fetched (another site's, refused): left empty rather than failing the screenshot.
    imagePlaceholder: "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==",
  });
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
