/**
 * @param {string} value
 * @returns {string}
 */
export function getLabel(value) {
  if (!value) return "";

  return `
    <span style="
      background: var(--tb-primary-100);
      border-radius: 16px;
      padding: 4px 8px;
      color: var(--tb-primary-500);
      white-space: nowrap;
      font-weight: 600;
    ">
      ${value}
    </span>
  `;
}

/**
 * @param {string} value
 * @param {string} entity
 * @returns {string}
 */
export function getProgressbar(value, entity) {
  if (value) {
    var minMoistureThreshold = entity["minMoistureThreshold"];
    var maxMoistureThreshold = entity["maxMoistureThreshold"];
    var background = "var(--tb-primary-100)";
    var fillBackground = "var(--tb-primary-200)";
    var textColor = "var(--tb-primary-500)";
    if (value < minMoistureThreshold || value > maxMoistureThreshold) {
      background = "#D1273014";
      fillBackground = "#D1273029";
      textColor = "#D12730";
    }
    var percent = value + "%";
    var percentText = value.toFixed(0) + "%";
    return (
      '<div style="width: 100%; max-width: 100px; height: 16px; background: linear-gradient(to right, ' +
      fillBackground +
      " " +
      percent +
      ", " +
      background +
      " " +
      percent +
      '); border-radius: 5px; line-height: normal; display: flex; align-items: center; justify-content: center;"><span style="font-weight: 600; font-size: 13px; color: ' +
      textColor +
      ';">' +
      percentText +
      "</span></div>"
    );
  } else {
    return "No data";
  }
}

export function renderProgressBar(value, opts) {
  if (value == null || isNaN(value)) return "";

  const {
    normalize = false,
    min = 0,
    max = 100,
    bg = "var(--tb-primary-100)",
    fill = "var(--tb-primary-200)",
    warnBg = "rgba(209,39,48,0.08)",
    warnFill = "rgba(209,39,48,0.16)",
    color = "var(--tb-primary-500)",
    warnColor = "#D12730",
    width = "100%",
    maxWidth = "100px",
    height = "16px",
    radius = "5px",
    fontSize = "13px",
  } = opts;

  const isWarn = value < min || value > max;

  // decide what percentage to use for the fill
  let pct = value;
  if (normalize) {
    const rawPct = ((value - min) / (max - min)) * 100;
    pct = Math.min(100, Math.max(0, rawPct));
  }

  const barBg = isWarn ? warnBg : bg;
  const barFill = isWarn ? warnFill : fill;
  const textCol = isWarn ? warnColor : color;

  // label shows the raw value; if you'd rather show normalized pct, switch to pct
  const label = `${value.toFixed(0)}%`;

  return `
    <div style="
      width: ${width};
      max-width: ${maxWidth};
      height: ${height};
      background: linear-gradient(
        to right,
        ${barFill} ${pct}%,
        ${barBg}   ${pct}%
      );
      border-radius: ${radius};
      display: flex;
      align-items: center;
      justify-content: center;
    ">
      <span style="
        font-weight: 600;
        font-size:   ${fontSize};
        color:       ${textCol};
      ">${label}</span>
    </div>
  `;
}
