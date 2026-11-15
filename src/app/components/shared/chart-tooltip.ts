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
 * A chart tooltip's look: the default (the bubble, a swatch a row), or "accent" — the Fuel Reports page's: a hairline round the
 * bubble, a bar in the series' colour down each row's left, the title over the rows, the names muted, the values plain.
 */
export type ChartTooltipLook = "default" | "accent";

/**
 * The hover tooltip every chart shares (line, bar, trend and donut charts, and
 * the calendar heatmap's) — a rich tooltip (a title, rows, a total), unlike a
 * plain one-line label: a surface a step above the card it pops out of, ringed
 * by a field's line (Supabase's popover) — white on light (the series' colours
 * read as on the chart), the selection's step over the card on dark
 * (`--c-tooltip-rich-bg` / `-text` / `-border`, `styles/_theme.scss`); 10px corners, 13px medium text, lifted by
 * the modal shadow. Spread into an ECharts `tooltip` option; `styles` =
 * getComputedStyle of the chart element (where the theme tokens are set).
 */
export function chartTooltipStyle(styles: CSSStyleDeclaration, look: ChartTooltipLook = "default"): Record<string, unknown> {
  const cssVar = (name: string) => styles.getPropertyValue(name).trim();
  const bg = cssVar("--c-tooltip-rich-bg");
  const text = cssVar("--c-tooltip-rich-text");
  const border = cssVar("--c-tooltip-rich-border");
  if (look === "accent") {
    // The accent look: the same fill, a hairline of its text colour round it, 8px corners, regular-weight text.
    return {
      backgroundColor: bg,
      borderColor: hexToRgba(text, 0.14),
      borderWidth: 1,
      padding: [10, 14],
      textStyle: { color: text, fontSize: 13, fontWeight: 400, lineHeight: 18 },
      extraCssText: `border-radius: 8px; box-shadow: ${cssVar("--shadow-box-modal-normal") || "0 4px 35px 0 rgba(0, 0, 0, 0.25)"};`,
    };
  }
  const hairline = !!border && border !== "transparent";
  return {
    backgroundColor: bg,
    borderColor: hairline ? border : bg,
    borderWidth: hairline ? 1 : 0,
    padding: [8, 14],
    textStyle: { color: text, fontSize: 13, fontWeight: 500, lineHeight: 18 },
    extraCssText: `border-radius: 10px; box-shadow: ${cssVar("--shadow-box-modal-normal") || "0 4px 35px 0 rgba(0, 0, 0, 0.25)"};`,
  };
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
    textStyle: { color: string; fontSize: number; fontWeight: number; lineHeight: number };
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
 * The charts' tooltip content laid out (inside {@link chartTooltipStyle}'s bubble): a muted header (what's hovered — "Tue, Nov 10"),
 * then a row a series — its swatch, its name on the left, its value right-aligned in tabular figures — and, given a total, a hairline
 * and the total in bold. Inline styles: ECharts draws the tooltip outside Angular's view, where no component style reaches.
 */
export function chartTooltipHtml(title: string, rows: ChartTooltipRow[], total?: { label: string; value: string }, look: ChartTooltipLook = "default"): string {
  if (look === "accent") {
    return accentTooltipHtml(title, rows, total);
  }
  const swatch = (r: ChartTooltipRow) =>
    r.swatch
      ? `<span style="width:10px;height:10px;border-radius:3px;background:${r.swatch};${r.swatchBorder ? `box-shadow:inset 0 0 0 1px ${r.swatchBorder};` : ""}"></span>`
      : "<span></span>";
  const cells = rows
    .map((r) => `${swatch(r)}<span>${escapeHtml(r.name)}</span><span style="padding-left:16px;text-align:right;font-weight:600">${escapeHtml(r.value)}</span>`)
    .join("");
  const totalRow = total
    ? `<span style="grid-column:1/-1;height:1px;margin:2px 0;background:currentColor;opacity:0.2"></span>` +
      `<span></span><span style="font-weight:700">${escapeHtml(total.label)}</span><span style="padding-left:16px;text-align:right;font-weight:700">${escapeHtml(total.value)}</span>`
    : "";
  return (
    `<div style="margin-bottom:6px;font-size:12px;opacity:0.7">${escapeHtml(title)}</div>` +
    `<div style="display:grid;grid-template-columns:auto 1fr auto;align-items:center;column-gap:8px;row-gap:4px;min-width:160px;font-variant-numeric:tabular-nums">${cells}${totalRow}</div>`
  );
}

/**
 * The accent look's content: a bar in its row's colour down the left (one series: down the title and its row together), the title
 * over the rows, each row's name muted on the left and its value plain on the right; a total under a hairline.
 */
function accentTooltipHtml(title: string, rows: ChartTooltipRow[], total?: { label: string; value: string }): string {
  const bar = (row: number, span: number, fill?: string, edge?: string) =>
    fill
      ? `<span style="grid-column:1;grid-row:${row} / span ${span};align-self:stretch;width:3px;border-radius:2px;background:${fill};${edge ? `box-shadow:inset 0 0 0 1px ${edge};` : ""}"></span>`
      : "";
  const name = (row: number, text: string) => `<span style="grid-column:2;grid-row:${row};opacity:0.62">${escapeHtml(text)}</span>`;
  const value = (row: number, text: string, weight = 400) =>
    `<span style="grid-column:3;grid-row:${row};padding-left:24px;text-align:right;font-weight:${weight}">${escapeHtml(text)}</span>`;
  const head = `<span style="grid-column:2 / -1;grid-row:1;font-weight:500">${escapeHtml(title)}</span>`;
  let cells: string;
  if (rows.length === 1 && !total) {
    // One series: its bar down the title and its row.
    const r = rows[0];
    cells = bar(1, 2, r.swatch, r.swatchBorder) + head + name(2, r.name) + value(2, r.value);
  } else {
    cells = head + rows.map((r, i) => bar(i + 2, 1, r.swatch, r.swatchBorder) + name(i + 2, r.name) + value(i + 2, r.value)).join("");
    if (total) {
      const at = rows.length + 2;
      cells +=
        `<span style="grid-column:2 / -1;grid-row:${at};height:1px;margin:2px 0;background:currentColor;opacity:0.18"></span>` +
        name(at + 1, total.label) +
        value(at + 1, total.value, 500);
    }
  }
  return `<div style="display:grid;grid-template-columns:3px 1fr auto;column-gap:10px;row-gap:4px;min-width:170px;font-variant-numeric:tabular-nums">${cells}</div>`;
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
