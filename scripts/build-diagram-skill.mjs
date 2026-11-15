#!/usr/bin/env node
// `yarn build:diagram-skill` — regenerates the docs-diagram skill (.claude/skills/docs-diagram/) from the dashboards'
// own styles, so a design change in the dashboards flows into the skill. The repo's SCSS stays the one source:
//
//   assets/docs-diagram.css   the tb-docs-diagram mixin (styles/_diagram.scss) compiled to plain CSS, the help
//                             dialog's text-beside-drawing layout (organization-help.component.scss), a card shell and
//                             page frame — every --c-* token given its light and dark value (styles/_theme.scss) as a
//                             fallback, so it renders outside ThingsBoard
//   assets/examples/*.html    the Organization / Applications / Access help dialogs' drawings and text, standalone
//   dist/docs-diagram-skill.zip           the skill folder, for claude.ai › Settings › Capabilities › Skills
//   dist/docs-diagram-compare.html        every spec in assets/specs/ beside the dashboard drawing it reproduces
//
// Hand-written (not touched here): SKILL.md, README.md, scripts/render.mjs, scripts/inter-metrics.mjs, assets/specs/.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as sass from "sass";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STYLES = path.join(ROOT, "src/app/components/shared/styles");
const HELP_DIR = path.join(ROOT, "src/app/components/shared/organization/organization-help");
const SKILLS = path.join(ROOT, ".claude/skills");
const SKILL = path.join(SKILLS, "docs-diagram");
const DIST = path.join(ROOT, "dist");

const compile = (source, file) =>
  sass.compileString(source, { loadPaths: [STYLES], url: file && pathToFileURL(file), style: "expanded" }).css;
const compileFile = (file) => compile(fs.readFileSync(file, "utf8"), file);

/** Flat CSS → [{ selector, body }] (the compiled partials hold no at-rules). */
function rules(css) {
  const out = [];
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    out.push({ selector: m[1].trim().replace(/\s+/g, " "), body: m[2].trim() });
  }
  return out;
}

const declarations = (body) =>
  body
    .split(";")
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => [d.slice(0, d.indexOf(":")).trim(), d.slice(d.indexOf(":") + 1).trim()]);

const format = (list) =>
  list.map(({ selector, body }) => `${selector.replace(/, /g, ",\n")} {\n${declarations(body).map(([k, v]) => `  ${k}: ${v};`).join("\n")}\n}`).join("\n\n");

// 1. The drawing: the mixin as the dashboards include it.
const diagram = rules(compile('@use "diagram"; @include diagram.tb-docs-diagram();'));

// The canvas drawn inside a standalone .svg file (no CSS box to put a background on): the .dg-canvas rule's colours.
const canvas = Object.fromEntries(declarations(diagram.find((r) => r.selector === ".dg-canvas").body));
const borderWidth = /([\d.]+px)/.exec(canvas.border)?.[1] ?? "1px";
const borderColor = /(var\([^)]+\))/.exec(canvas.border)?.[1];
const dotColor = /radial-gradient\(\s*circle,\s*(var\([^)]+\))/.exec(canvas["background-image"])?.[1];
const svgCanvas = [
  { selector: ".dg-canvas-box", body: `fill: ${canvas["background-color"]}; stroke: ${borderColor}; stroke-width: ${borderWidth}` },
  { selector: ".dg-canvas-dot", body: `fill: ${dotColor}` },
];

// 2. The text beside the drawing, as the help dialogs lay it out (.oh-section / .oh-text / .oh-figure → .dg-*).
const help = rules(compileFile(path.join(HELP_DIR, "organization-help.component.scss")))
  .filter((r) => r.selector.split(", ").every((s) => s.startsWith(".oh-")))
  .map((r) => ({ ...r, selector: r.selector.replace(/\.oh-/g, ".dg-") }));

// 3. A card around it and the page under it: the shared card shell and the dashboards' page frame.
const frame = rules(
  compile(`
@use "card";
@use "dashboard";
// The page: the dashboard frame's root (its surface, text colour and face).
.dg-page { margin: 0; background: var(--c-bg-neutral-min); color: var(--c-text-neutral-heavy); font-family: Roboto, "Helvetica Neue", sans-serif; }
.dg-main { box-sizing: border-box; max-width: 1240px; margin: 0 auto; padding: dashboard.$frame-padding; display: flex; flex-direction: column; gap: card.$card-stack-gap; }
.dg-page-title { margin: 0; font-size: 16px; font-weight: 600; color: var(--c-text-neutral-heavy); }
// A card holding a titled section (the help dialog's tb-collapsible-card).
.dg-panel { @include card.tb-card-shell; }
.dg-panel-title { @include card.tb-figure-title; margin: 0 0 card.$card-padding; }
`),
).filter((r) => r.selector.split(", ").every((s) => s.startsWith(".dg")));

// 4. Token fallbacks: every --c-* the CSS reads, resolved to its light and dark value.
const themes = rules(compile('@use "theme"; .l { @include theme.tb-tts-light-tokens; } .d { @include theme.tb-tts-dark-tokens; }'));
const tokenMap = (sel) => new Map(declarations(themes.find((r) => r.selector === sel).body).filter(([k]) => k.startsWith("--c-")));
const light = tokenMap(".l");
const dark = tokenMap(".d");

const all = [...diagram, ...svgCanvas, ...help, ...frame];
const used = new Set();
for (const { body } of all) for (const m of body.matchAll(/var\(--c-([a-z0-9-]+)\)/g)) used.add(m[1]);

function resolve(name, map, seen = []) {
  const value = map.get(`--c-${name}`);
  if (value === undefined) throw new Error(`--c-${name} is not a theme token (styles/_theme.scss)`);
  if (seen.includes(name)) throw new Error(`--c-${name} refers to itself`);
  return value.replace(/var\(--c-([a-z0-9-]+)(?:,[^)]*)?\)/g, (_, n) => resolve(n, map, [...seen, name]));
}
const tokens = [...used].sort();
const block = (map) => tokens.map((t) => `  --dg-${t}: ${resolve(t, map)};`).join("\n");

const withFallbacks = (list) => list.map((r) => ({ ...r, body: r.body.replace(/var\(--c-([a-z0-9-]+)\)/g, "var(--c-$1, var(--dg-$1))") }));

const git = (args) => {
  try {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};

const css = `/*
 * docs-diagram.css — GENERATED by \`yarn build:diagram-skill\` (scripts/build-diagram-skill.mjs) in the ThingsBoard
 * Extensions repo; do not edit. From: styles/_diagram.scss (the tb-docs-diagram mixin), styles/_theme.scss (the token
 * values), organization-help.component.scss (text beside a drawing), styles/_card.scss and _dashboard.scss (a card,
 * the page).
 *
 * Every colour is a --c-* token with a fallback (--dg-*): a page that defines the tokens (ThingsBoard) uses its own,
 * anywhere else the fallbacks apply — light, or dark with the viewer's preference, forced by data-theme="light|dark"
 * on <html> (or the svg root), or by a .dg-light / .dg-dark class on any element around a drawing.
 */

:root {
  color-scheme: light;
${block(light)}
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
${block(dark).replace(/^/gm, "  ")}
  }
}

:root[data-theme="dark"],
.dg-dark {
  color-scheme: dark;
${block(dark)}
}

.dg-light {
  color-scheme: light;
${block(light)}
}

/* The drawing (tb-docs-diagram) */

${format(withFallbacks(diagram))}

/* The canvas inside a standalone .svg file (render.mjs --format svg): the .dg-canvas rule's surface, border and dots */

${format(withFallbacks(svgCanvas))}

/* Text beside a drawing (the help dialogs' section) */

${format(withFallbacks(help))}

/* A card, the page */

${format(withFallbacks(frame))}
`;
fs.mkdirSync(path.join(SKILL, "assets/examples"), { recursive: true });
fs.writeFileSync(path.join(SKILL, "assets/docs-diagram.css"), css);
console.log(`assets/docs-diagram.css: ${all.length} rules, ${tokens.length} tokens`);

// 5. The help dialogs' drawings as standalone pages (their heading, card title, bullets, drawing).
const { page, svg: renderSvg } = await import(pathToFileURL(path.join(SKILL, "scripts/render.mjs")).href);
const helpTs = fs.readFileSync(path.join(HELP_DIR, "organization-help.component.ts"), "utf8");
const headings = Object.fromEntries(
  [...(/const HELP[^{]*\{([\s\S]*?)\};/.exec(helpTs)?.[1] ?? "").matchAll(/(\w+):\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]),
);
const helpHtml = fs.readFileSync(path.join(HELP_DIR, "organization-help.component.html"), "utf8");
const drawings = {};
for (const m of helpHtml.matchAll(/<tb-collapsible-card \*ngIf="kind === '(\w+)'" title="([^"]*)"[^>]*>([\s\S]*?)<\/tb-collapsible-card>/g)) {
  const [, kind, panel, inner] = m;
  const heading = headings[kind] || kind;
  const slug = heading.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const items = [...(/<ul>([\s\S]*?)<\/ul>/.exec(inner)?.[1] ?? "").matchAll(/<li>([\s\S]*?)<\/li>/g)].map((li) => li[1].trim());
  const svgMarkup = /<svg[\s\S]*?<\/svg>/.exec(inner)?.[0];
  if (!svgMarkup) continue;
  drawings[slug] = svgMarkup;
  fs.writeFileSync(path.join(SKILL, "assets/examples", `${slug}.html`), page({ title: heading, heading, panel, items, svgMarkup, css }));
}
const slugs = Object.keys(drawings);
for (const file of fs.readdirSync(path.join(SKILL, "assets/examples"))) {
  if (file.endsWith(".html") && !slugs.includes(file.slice(0, -5))) fs.rmSync(path.join(SKILL, "assets/examples", file));
}
console.log(`assets/examples: ${slugs.map((s) => `${s}.html`).join(", ")}`);

// 6. The check: each spec that names the drawing it reproduces, beside that drawing, in light and dark.
fs.mkdirSync(DIST, { recursive: true });
const specDir = path.join(SKILL, "assets/specs");
const pairs = [];
for (const file of fs.existsSync(specDir) ? fs.readdirSync(specDir).filter((x) => x.endsWith(".json")).sort() : []) {
  const spec = JSON.parse(fs.readFileSync(path.join(specDir, file), "utf8"));
  const { markup, warnings } = renderSvg(spec, { css });
  for (const w of warnings) console.warn(`warning: ${file}: ${w}`);
  pairs.push({ file, original: drawings[spec.reproduces], generated: markup, name: spec.reproduces });
}
const cell = (title, markup) =>
  `<div class="cmp-cell"><div class="cmp-label">${title}</div>${markup ? `<div class="dg-canvas">${markup}</div>` : "<p>—</p>"}</div>`;
const compare = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Diagram check</title><link rel="stylesheet" href="${(await import(pathToFileURL(path.join(SKILL, "scripts/render.mjs")).href)).FONTS_HREF}">
<style>${css}
.cmp-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding: 16px; }
.cmp-label { font: 600 12px Inter, sans-serif; margin: 0 0 6px; color: var(--c-text-neutral-bold, var(--dg-text-neutral-bold)); }
h2 { font: 600 14px Inter, sans-serif; margin: 24px 16px 0; }
</style></head><body class="dg-page">
${pairs
  .map(
    (p) =>
      `<h2>${p.file}${p.name ? ` — reproduces ${p.name}` : ""}</h2>` +
      ["dg-light", "dg-dark"]
        .map((theme) => `<div class="cmp-row dg-page ${theme}">${cell("Dashboard", p.original)}${cell("Generated (render.mjs)", p.generated)}</div>`)
        .join(""),
  )
  .join("\n")}
</body></html>
`;
fs.writeFileSync(path.join(DIST, "docs-diagram-compare.html"), compare);
console.log(`dist/docs-diagram-compare.html: ${pairs.length} specs`);

// 7. The zip for claude.ai: the skill folder at its root.
const zip = path.join(DIST, "docs-diagram-skill.zip");
fs.rmSync(zip, { force: true });
execFileSync("zip", ["-r", "-X", "-q", zip, "docs-diagram", "-x", "*.DS_Store"], { cwd: SKILLS });
console.log(`dist/docs-diagram-skill.zip (${git(["rev-parse", "--short", "HEAD"]) || "no git"})`);
