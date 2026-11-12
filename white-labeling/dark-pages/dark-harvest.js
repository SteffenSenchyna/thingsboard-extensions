// Collects ThingsBoard's own colour declarations for its dark theme (`scripts/dark-overrides.py`): its colours, the
// ones it reads through a variable with a fallback (`var(--tb-hover-color, #f4f4f4)`), and its variables holding colours.
//
// ThingsBoard loads a page's component styles only while the page shows (and drops them after), so run this on a
// tenant administrator's ThingsBoard page (not a dashboard) in the browser console: it opens each page of the side
// nav in turn, collecting the colour declarations of every stylesheet then loaded, and the tag of each component
// whose scoping attribute (`_nghost-…`) is on the page. When it's done it saves dark-harvest.json (for white-labeling/dark-pages/)
// (a download), merged with what earlier runs left in `window.__darkHarvest`. Open details panels and dialogs by hand
// and call `__darkHarvestNow()` to add theirs. (`window.__darkHarvestNoDownload = true` first: no download, the run's
// result left in `window.__darkHarvest` — `done` once it's through.)

(() => {
  const PROPS = ["background-color", "color", "border-color", "border-top-color", "border-right-color", "border-bottom-color",
    "border-left-color", "outline-color", "fill", "stroke", "caret-color"];
  const SHORTHANDS = [["background", "background-color"], ["border", "border-top-color"], ["border-top", "border-top-color"],
    ["border-bottom", "border-bottom-color"], ["border-left", "border-left-color"], ["border-right", "border-right-color"],
    ["outline", "outline-color"]];
  const state = (window.__darkHarvest = window.__darkHarvest || { rules: {}, hosts: {} });

  window.__darkHarvestNow = () => {
    for (const el of document.querySelectorAll("*")) {
      for (const at of el.getAttributeNames()) {
        const m = at.match(/^_nghost-(.+)$/);
        if (m) state.hosts[m[1]] = el.tagName.toLowerCase();
      }
    }
    const walk = (rules, media) => {
      for (const r of rules) {
        if (r.cssRules && !r.selectorText) {
          walk(r.cssRules, r.media ? r.media.mediaText : media);
          continue;
        }
        if (!r.selectorText || !r.style) continue;
        for (let i = 0; i < r.style.length; i++) {
          const p = r.style[i];
          const custom = p.startsWith("--");
          if (!custom && !PROPS.includes(p)) continue;
          const v = r.style.getPropertyValue(p).trim();
          // A colour; one read through a variable with a colour fallback; a variable (custom) holding a colour.
          const fallback = /^var\(\s*--[\w-]+\s*,\s*(#|rgb|white|black)/i.test(v);
          if (!v || (!fallback && /var\(|inherit|initial|transparent|currentcolor|unset/i.test(v))) continue;
          if (custom && !/^(#[0-9a-f]{3,8}|rgba?\(|white$|black$)/i.test(v)) continue;
          state.rules[[p, v, r.style.getPropertyPriority(p) || "", media || "", r.selectorText].join("\t")] = 1;
        }
        // A shorthand reading a variable leaves its longhands empty: its variables with a colour fallback.
        for (const [shorthand, longhand] of SHORTHANDS) {
          const v = r.style.getPropertyValue(shorthand);
          for (const m of v.matchAll(/var\(\s*(--[\w-]+)\s*,\s*(#[0-9a-f]{3,8}|rgba?\([^)]*\)|white|black)\s*\)/gi)) {
            state.rules[[longhand, `var(${m[1]}, ${m[2]})`, r.style.getPropertyPriority(shorthand) || "", media || "", r.selectorText].join("\t")] = 1;
          }
        }
      }
    };
    for (const sheet of document.styleSheets) {
      if (sheet.ownerNode && /custom-css/.test(sheet.ownerNode.id || "")) continue; // the white-labeling's own
      try {
        walk(sheet.cssRules, sheet.media && sheet.media.mediaText);
      } catch (e) {
        // a cross-origin sheet
      }
    }
    return Object.keys(state.rules).length;
  };

  const save = () => {
    state.done = true;
    if (window.__darkHarvestNoDownload) return; // a scripted run reads `window.__darkHarvest` itself
    const blob = new Blob([JSON.stringify({ rules: Object.keys(state.rules).sort(), hosts: state.hosts }, null, 0)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "dark-harvest.json";
    a.click();
  };

  const pages = [...new Set([...document.querySelectorAll("mat-sidenav.tb-site-sidenav a[href]")].map((a) => a.getAttribute("href")))]
    .filter((h) => !/^\/(home|usage)$/.test(h));
  let i = 0;
  const step = () => {
    window.__darkHarvestNow();
    if (i >= pages.length) {
      save();
      return;
    }
    const link = [...document.querySelectorAll("mat-sidenav.tb-site-sidenav a[href]")].find((a) => a.getAttribute("href") === pages[i]);
    i++;
    if (link) link.click();
    setTimeout(step, 3000);
  };
  step();
})();
