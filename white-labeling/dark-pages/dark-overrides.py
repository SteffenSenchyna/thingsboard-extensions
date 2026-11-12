#!/usr/bin/env python3
"""ThingsBoard's own colours, re-mapped to the dashboards' dark tokens.

ThingsBoard has one light theme. Material's controls take the dark theme from `white-labeling/_dark.scss`, but
ThingsBoard's own stylesheets colour much of its UI themselves — white panels, grey rows and chips, black text at
Material's text alphas, faint black lines. This turns every such declaration into the dark token for its role:

    white / near-white surfaces   → the card surface        (--c-bg-neutral-extralight)
    light grey fills              → the raised fills        (--c-bg-neutral-extralight-hover, --c-bg-neutral-light)
    black tints (hover, selected) → the same tint of the text colour
    grey / black text             → the text ramp, by strength (heavy, bold, semilight, light)
    ThingsBoard's link blues      → the brand accent
    faint black and light lines   → the border ramp

Coloured (status) text and fills are left alone. ThingsBoard's own colour variables (`--tb-hover-color`, read as
`var(--tb-hover-color, #f4f4f4)`) are set on the scope itself, their role taken from where they're read (else from
their name). Input: the rules collected on ThingsBoard's pages by
`dark-harvest.js` (`dark-harvest.json`, beside this — collect again after a ThingsBoard upgrade).
Output: `_dark-generated.scss` (beside it), one rule a token, its selectors in an `:is()` list (ThingsBoard's
component scoping resolved to the component's tag), included on the dark pages' scope by `_dark.scss`.

    python3 white-labeling/dark-pages/dark-overrides.py
"""
import json
import re
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
HARVEST = HERE / "dark-harvest.json"
OUT = HERE / "_dark-generated.scss"

# Selectors that aren't ThingsBoard's pages: its dark panels, dashboards and widgets (they keep their own colours),
# the side nav, top bar and login page (themed elsewhere), the page itself and scrollbars. (Brand-coloured surfaces —
# `.mat-primary` — aren't grey, so the mapping leaves them alone.)
SKIP = re.compile(
    r"\.tb-dark\b|\.ace_dark\b|tb-dashboard|gridster|\.tb-widget\b|tb-widget\b|::-webkit-scrollbar|tb-login|"
    r"(^|[\s>+~(,])(body|html)\b|:root|\.tb-site-sidenav|tb-side-menu|tb-menu-link|tb-menu-toggle|"
    r"\.tb-nav-header|\.tb-goto-menu|\.tb-primary-toolbar|tb-breadcrumb|tb-user-menu|\.tb-popover\.tb-menu|"
    r"(?<!:not\()\.tb-primary-fill|\.tb-primary-panels|"
    # jQuery Terminal (dark already).
    r"\.cmd\b|\.terminal\b"
)
PSEUDO_ELEMENT = re.compile(r"::?(before|after|placeholder|selection|first-line|first-letter|marker|-webkit-[a-z-]+|-moz-[a-z-]+)\b")


def parse_colour(value):
    v = value.strip().lower()
    if v == "white":
        return 255, 255, 255, 1.0
    if v == "black":
        return 0, 0, 0, 1.0
    m = re.fullmatch(r"#([0-9a-f]{3,8})", v)
    if m:
        h = m.group(1)
        if len(h) in (3, 4):
            h = "".join(c * 2 for c in h)
        r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
        a = int(h[6:8], 16) / 255 if len(h) == 8 else 1.0
        return r, g, b, a
    m = re.fullmatch(r"rgba?\(([^)]+)\)", v)
    if m:
        parts = [p for p in re.split(r"[\s,/]+", m.group(1)) if p]
        try:
            nums = [float(p.rstrip("%")) / (100 if p.endswith("%") else 1) for p in parts]
        except ValueError:
            return None
        r, g, b = nums[:3]
        a = nums[3] if len(nums) > 3 else 1.0
        return r, g, b, a
    return None


def tint(token, alpha):
    return f"color-mix(in srgb, var({token}) {round(alpha * 100)}%, transparent)"


def token_for(prop, value):
    c = parse_colour(value)
    if not c:
        return None
    r, g, b, a = c
    if a < 0.02:
        return None
    lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
    grey = max(r, g, b) - min(r, g, b) <= (40 if lum < 0.25 else 24)
    blue = b > r + 50 and b > g + 20

    if prop == "background-color":
        if not grey:
            return None
        if lum >= 0.6:
            if a < 0.95:
                return tint("--c-bg-neutral-extralight", a)
            if lum >= 0.97:
                return "var(--c-bg-neutral-extralight)"
            if lum >= 0.9:
                return "var(--c-bg-neutral-extralight-hover)"
            return "var(--c-bg-neutral-light)"
        # A faint black tint (hover, selected) as the same tint of the text colour; a scrim (a dialog's backdrop) stays.
        if lum < 0.2 and a <= 0.15:
            return tint("--c-text-neutral-heavy", a)
        return None

    if prop in ("color", "fill", "caret-color"):
        if blue and lum < 0.5:
            return "var(--c-brand-accent)"
        if not grey or lum >= 0.55:
            return None
        if lum >= 0.4:
            return "var(--c-text-neutral-light)"
        strength = a if lum < 0.15 else a * (1 - lum * 1.5)
        if strength >= 0.8:
            return "var(--c-text-neutral-heavy)"
        if strength >= 0.6:
            return "var(--c-text-neutral-bold)"
        if strength >= 0.45:
            return "var(--c-text-neutral-semilight)"
        return "var(--c-text-neutral-light)"

    # Lines: borders, outlines, strokes.
    if not grey:
        return None
    if lum < 0.4:
        if a <= 0.15:
            return "var(--c-border-neutral-light)"
        if a < 0.5:
            return "var(--c-border-neutral-normal)"
        return "var(--c-border-neutral-semibold)"
    if lum >= 0.75:
        return "var(--c-border-neutral-light)"
    return "var(--c-border-neutral-normal)"


VAR_USE = re.compile(r"^var\(\s*(--[\w-]+)\s*,\s*(.+)\)$")


def role_of_name(name):
    """A colour variable's role by its name, when nothing reads it: a fill, a line or a text colour."""
    words = set(name.lower().strip("-").split("-"))
    if words & {"bg", "background", "surface", "fill", "hover", "selected", "current", "container", "panel", "backdrop"}:
        return "background-color"
    if words & {"border", "line", "divider", "outline", "stroke"}:
        return "border-top-color"
    return "color"


def split_list(selector_text):
    out, depth, cur = [], 0, ""
    for ch in selector_text:
        if ch in "([":
            depth += 1
        elif ch in ")]":
            depth -= 1
        if ch == "," and depth == 0:
            out.append(cur.strip())
            cur = ""
        else:
            cur += ch
    if cur.strip():
        out.append(cur.strip())
    return out


HASHED_CLASS = re.compile(r"\.([A-Za-z][\w-]*?)-(\d{6,})\b")
# Where ThingsBoard declares its variables for the whole page (the theme's root): set on the dark scope instead.
PAGE_ROOT = {":root", ".tb-default", "body", "html"}
# ThingsBoard's palettes and the text on them (`--tb-primary-500`, `--tb-accent-contrast-50`): colours, not greys.
PALETTE_VAR = re.compile(r"^--tb-(login-)?(primary|accent)-(\d+|A\d+|contrast-[\w]+)$")


def resolve(sel, hosts):
    """ThingsBoard's component scoping as the component's tag; None for a selector not on its pages."""
    # A class named with a build's hash (`.entities-table-1465481295`), which changes with every build: by its name.
    sel = HASHED_CLASS.sub(lambda m: f'[class*="{m.group(1)}-"]', sel)
    if SKIP.search(sel):
        return None
    for host_id in re.findall(r"\[_nghost-([^\]]+)\]", sel):
        tag = hosts.get(host_id)
        if not tag:
            return None
        sel = sel.replace(f"[_nghost-{host_id}]", tag)
    content_ids = set(re.findall(r"\[_ngcontent-([^\]]+)\]", sel))
    sel = re.sub(r"\[_ngcontent-[^\]]+\]", "", sel)
    sel = re.sub(r"\.tb-default\b", "", sel)
    sel = re.sub(r"\s+", " ", sel).strip()
    for cid in content_ids:
        tag = hosts.get(cid)
        if not tag:
            return None
        if not re.search(rf"(^|[\s>+~(]){re.escape(tag)}\b", sel):
            sel = f"{tag} {sel}" if sel else tag
    if not sel or sel[0] in ">+~" or SKIP.search(sel):  # again, now its components are named
        return None
    return sel


def main():
    data = json.loads(HARVEST.read_text())
    hosts = data["hosts"]
    groups = defaultdict(set)  # (prop, token, important) → selectors
    pseudo = defaultdict(set)
    sides = defaultdict(dict)  # (selector, important) → {side: token}: a border's four sides, one rule when they agree
    var_roles, var_fallbacks, var_decls = {}, {}, []
    for line in data["rules"]:
        prop, value, priority, media, selector_text = line.split("\t", 4)
        if media and media not in ("all", "screen"):
            continue
        if prop.startswith("--"):
            var_decls.append((prop, value, priority, selector_text))
            continue
        use = VAR_USE.match(value)
        if use:
            var_roles.setdefault(use.group(1), prop)
            var_fallbacks.setdefault(use.group(1), use.group(2).strip())
            continue
        if prop == "border-color":  # the browser lists a border's four sides too
            continue
        token = token_for("background-color" if prop == "background-color" else prop, value)
        if not token:
            continue
        for sel in split_list(selector_text):
            s = resolve(sel, hosts)
            if not s:
                continue
            if prop.startswith("border-"):
                sides[(s, priority == "important")][prop] = token
                continue
            key = (prop, token, priority == "important")
            (pseudo if PSEUDO_ELEMENT.search(s) else groups)[key].add(s)
    for (s, important), by_side in sides.items():
        same = len(by_side) == 4 and len(set(by_side.values())) == 1
        for prop, token in ({"border-color": next(iter(by_side.values()))} if same else by_side).items():
            (pseudo if PSEUDO_ELEMENT.search(s) else groups)[(prop, token, important)].add(s)

    # ThingsBoard's colour variables: on the scope, from the fallback it reads them with; where it sets one, there too.
    # Only ThingsBoard's own on the scope (`--tb-…`): Material's are the dark theme's (`_dark.scss`), and a third party's
    # generic names (`--color`) mean something else elsewhere.
    root_vars = {}
    for name, fallback in var_fallbacks.items():
        if not name.startswith("--tb-"):
            continue
        token = token_for(var_roles[name], fallback)
        if token:
            root_vars[name] = token
    var_groups = defaultdict(set)
    for name, value, priority, selector_text in var_decls:
        # Material's variables: set by the dark theme on Material's own classes; kept where ThingsBoard sets one of
        # them on a piece of its own (a `tb-` selector). ThingsBoard's palettes stay; its page-wide variables go on the
        # scope.
        if PALETTE_VAR.match(name):
            continue
        token = token_for(var_roles.get(name) or role_of_name(name), value)
        if not token:
            continue
        if selector_text.strip() in PAGE_ROOT:
            if name.startswith("--tb-"):
                root_vars.setdefault(name, token)
            continue
        for sel in split_list(selector_text):
            s = resolve(sel, hosts)
            # (a table's colours ThingsBoard writes at runtime, `.entities-table-<hash>`, are its own too)
            if s and not (name.startswith(("--mat-", "--mdc-")) and "tb-" not in s and '[class*="' not in s):
                var_groups[(name, token, priority == "important")].add(s)

    lines = [
        "// GENERATED by dark-overrides.py from dark-harvest.json (both beside this) — don't edit by hand.",
        "// ThingsBoard's own colours re-mapped to the dark tokens (see the script), included on the dark pages' scope.",
        "",
        "@mixin tb-dark-generated {",
    ]
    for name, token in sorted(root_vars.items()):
        lines.append(f"  {name}: {token};")
    if root_vars:
        lines.append("")
    count = 0
    for (name, token, important), sels in sorted(var_groups.items()):
        count += len(sels)
        body = ",\n      ".join(sorted(sels))
        lines += [f"  :is(\n      {body}\n  ) {{", f"    {name}: {token}{' !important' if important else ''};", "  }", ""]
    for (prop, token, important), sels in sorted(groups.items()):
        count += len(sels)
        body = ",\n      ".join(sorted(sels))
        lines += [f"  :is(\n      {body}\n  ) {{", f"    {prop}: {token}{' !important' if important else ''};", "  }", ""]
    for (prop, token, important), sels in sorted(pseudo.items()):
        for s in sorted(sels):
            count += 1
            lines += [f"  {s} {{", f"    {prop}: {token}{' !important' if important else ''};", "  }", ""]
    lines.append("}")
    OUT.write_text("\n".join(lines) + "\n")
    print(f"{len(root_vars)} variables; {count} selectors in {len(groups) + len(var_groups)} rules (+ {sum(len(v) for v in pseudo.values())} pseudo-element rules) → {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
