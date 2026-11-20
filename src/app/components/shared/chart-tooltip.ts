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

/**
 * The hover tooltip every chart shares (line, bar, trend and donut charts, and the calendar heatmap's) — the Fuel Reports page's:
 * a surface a step above the card it pops out of (`--c-tooltip-rich-bg` / `-text`, `styles/_theme.scss` — white on light, a navy
 * step over the navy card on dark), a hairline round it (`--c-tooltip-rich-border`), 6px corners, compact regular-weight 12px text,
 * the modal shadow; its content laid out by {@link chartTooltipHtml}. Spread into an ECharts `tooltip` option; `styles` =
 * getComputedStyle of the chart element (where the theme tokens are set — resolved here, so the tooltip keeps its theme anywhere).
 *
 * Drawn on the page (`appendTo: "body"`), never inside the chart's own box: a side panel, a card or a table that clips its overflow
 * can't cut it off. Where a chart keeps it over its plot (`confine`), it still flips to stay inside the chart.
 */
export function chartTooltipStyle(styles: CSSStyleDeclaration): Record<string, unknown> {
  const cssVar = (name: string) => styles.getPropertyValue(name).trim();
  const text = cssVar("--c-tooltip-rich-text");
  return {
    appendTo: "body",
    // Kept with the pointer as it moves (ECharts eases the box to each new place over 0.4 s: it trails, then jumps).
    transitionDuration: 0,
    backgroundColor: cssVar("--c-tooltip-rich-bg"),
    borderColor: cssVar("--c-tooltip-rich-border") || hexToRgba(text, 0.14),
    borderWidth: 1,
    padding: [6, 10],
    textStyle: { color: text, fontSize: 12, fontWeight: 400, lineHeight: 16, fontFamily: styles.fontFamily || "Roboto, \"Helvetica Neue\", sans-serif" },
    extraCssText: `border-radius: 6px; box-shadow: ${cssVar("--shadow-box-modal-normal") || "0 4px 35px 0 rgba(0, 0, 0, 0.25)"};`,
  };
}

/**
 * A chart's tooltip hidden as the pointer leaves the chart: ECharts hides it on its own "globalout", which a quick exit — over the
 * tooltip itself, a small chart's tooltip drawn past its box (the doughnut's) — can miss, leaving it up with nothing hovered.
 * A finger never leaves (a phone): a touch anywhere else hides it too, and so does the chart going out of sight — hidden (its
 * tab switched), or, after a touch, scrolled away — since the tooltip, drawn on the page, would stay up over whatever comes. (A
 * mouse's click elsewhere, or a chart merely scrolled off, keeps what it shows: a time picked elsewhere — the Time Machine's —
 * stays on it.) Listened to on the chart's element (gone with it) and the page (let go once the chart is gone or disposed);
 * never `off` ECharts' own events.
 */
export function hideChartTooltipOnLeave(
  chart: { dispatchAction: (action: Record<string, unknown>) => void; isDisposed?: () => boolean },
  el: HTMLElement
): void {
  let io: IntersectionObserver | null = null;
  /** The last press on the page was a touch (a finger, a pen): the chart's tooltip may be up with nothing to take it down. */
  let touched = false;
  const gone = () => !el.isConnected || !!chart.isDisposed?.();
  const release = () => {
    document.removeEventListener("pointerdown", onDown, true);
    io?.disconnect();
  };
  const hide = () => {
    if (gone()) {
      release();
      return;
    }
    chart.dispatchAction({ type: "hideTip" });
  };
  const onDown = (e: PointerEvent) => {
    if (gone()) {
      release();
      return;
    }
    touched = e.pointerType !== "mouse";
    if (touched && !el.contains(e.target as Node | null)) {
      hide();
    }
  };
  el.addEventListener("mouseleave", hide);
  document.addEventListener("pointerdown", onDown, true);
  if (typeof IntersectionObserver !== "undefined") {
    io = new IntersectionObserver((entries) => {
      const out = entries.find((entry) => !entry.isIntersecting);
      if (out && (touched || !out.boundingClientRect.width || !out.boundingClientRect.height)) {
        hide();
      }
    });
    io.observe(el);
  }
}

/**
 * The same tooltip as CSS, for one drawn outside ECharts (the calendar
 * heatmap's): an `[ngStyle]` map — so every chart's tooltip has one look.
 */
export function chartTooltipCss(styles: CSSStyleDeclaration): Record<string, string> {
  const t = chartTooltipStyle(styles) as {
    backgroundColor: string;
    borderColor: string;
    borderWidth: number;
    padding: number[];
    textStyle: { color: string; fontSize: number; fontWeight: number; lineHeight: number; fontFamily: string };
    extraCssText: string;
  };
  const css: Record<string, string> = {
    background: t.backgroundColor,
    border: t.borderWidth ? `${t.borderWidth}px solid ${t.borderColor}` : "none",
    padding: t.padding.map((p) => `${p}px`).join(" "),
    color: t.textStyle.color,
    "font-size": `${t.textStyle.fontSize}px`,
    "font-weight": String(t.textStyle.fontWeight),
    "line-height": `${t.textStyle.lineHeight}px`,
    "font-family": t.textStyle.fontFamily,
  };
  for (const declaration of t.extraCssText.split(";")) {
    const [property, ...value] = declaration.split(":");
    if (property.trim() && value.length) {
      css[property.trim()] = value.join(":").trim();
    }
  }
  return css;
}

/** A row of {@link chartTooltipHtml}: its swatch (a colour, or any CSS background — a pattern), its name and its value. */
export interface ChartTooltipRow {
  name: string;
  value: string;
  /** The swatch's fill: a colour or a CSS background ("repeating-linear-gradient(…)"); none: no swatch. */
  swatch?: string;
  /** A hairline round the swatch, in this colour (a pattern's edge). */
  swatchBorder?: string;
}

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

/**
 * The charts' tooltip content, the Fuel Reports page's layout (inside {@link chartTooltipStyle}'s surface): what's hovered as its
 * title ("Tue, Nov 10"), then a row a series — a bar in its colour down its left (one series: down the title and its row together),
 * its name muted, its value plain on the right in tabular figures — and, given a total, a hairline and the total. No title (""):
 * the rows alone; a row with no value: its name alone. Inline styles: ECharts draws the tooltip outside Angular's view, where no
 * component style reaches.
 */
export function chartTooltipHtml(title: string, rows: ChartTooltipRow[], total?: { label: string; value: string }): string {
  const bar = (row: number, span: number, fill?: string, edge?: string) =>
    fill
      ? `<span style="grid-column:1;grid-row:${row} / span ${span};align-self:stretch;width:3px;border-radius:2px;background:${fill};${edge ? `box-shadow:inset 0 0 0 1px ${edge};` : ""}"></span>`
      : "";
  const name = (row: number, text: string) => `<span style="grid-column:2;grid-row:${row};opacity:0.62">${escapeHtml(text)}</span>`;
  // No value: no cell (its padding would leave a blank strip on the right).
  const value = (row: number, text: string, weight = 400) =>
    text ? `<span style="grid-column:3;grid-row:${row};padding-left:16px;text-align:right;font-weight:${weight}">${escapeHtml(text)}</span>` : "";
  const head = title ? `<span style="grid-column:2 / -1;grid-row:1;font-weight:500">${escapeHtml(title)}</span>` : "";
  /** The first row's grid row: under the title — at the top without one. */
  const first = title ? 2 : 1;
  let cells: string;
  if (rows.length === 1 && !total && title) {
    // One series: its bar down the title and its row.
    const r = rows[0];
    cells = bar(1, 2, r.swatch, r.swatchBorder) + head + name(2, r.name) + value(2, r.value);
  } else {
    cells = head + rows.map((r, i) => bar(i + first, 1, r.swatch, r.swatchBorder) + name(i + first, r.name) + value(i + first, r.value)).join("");
    if (total) {
      const at = rows.length + first;
      cells +=
        `<span style="grid-column:2 / -1;grid-row:${at};height:1px;margin:2px 0;background:currentColor;opacity:0.18"></span>` +
        name(at + 1, total.label) +
        value(at + 1, total.value, 500);
    }
  }
  return `<div style="display:grid;grid-template-columns:3px 1fr auto;column-gap:8px;row-gap:2px;font-variant-numeric:tabular-nums">${cells}</div>`;
}

/** A #rgb / #rrggbb colour as rgba() with the given alpha (anything else passes through). */
export function hexToRgba(color: string, alpha: number): string {
  const hex = (color || "").trim().replace("#", "");
  const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    return color;
  }
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
