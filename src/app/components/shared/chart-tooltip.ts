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
 * The hover tooltip every chart shares (line, bar, trend and donut charts, and
 * the calendar heatmap's): the dashboards' tooltip bubble (`styles/_tooltip.scss`,
 * `tb-tooltip-surface`) — navy with white text on light, slate on dark
 * (`--c-tooltip-bg` / `-text`), 10px corners, 13px medium text, lifted by the
 * modal shadow. Spread into an ECharts `tooltip` option; `styles` =
 * getComputedStyle of the chart element (where the theme tokens are set).
 */
export function chartTooltipStyle(styles: CSSStyleDeclaration): Record<string, unknown> {
  const cssVar = (name: string) => styles.getPropertyValue(name).trim();
  const bg = cssVar("--c-tooltip-bg");
  return {
    backgroundColor: bg,
    borderColor: bg,
    borderWidth: 0,
    padding: [8, 14],
    textStyle: { color: cssVar("--c-tooltip-text"), fontSize: 13, fontWeight: 500, lineHeight: 18 },
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
    padding: number[];
    textStyle: { color: string; fontSize: number; fontWeight: number; lineHeight: number };
    extraCssText: string;
  };
  const css: Record<string, string> = {
    background: t.backgroundColor,
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
