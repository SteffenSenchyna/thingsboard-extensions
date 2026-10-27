#!/usr/bin/env python3
"""Build the ThingsBoard Extensions design system from this repository.

Writes a complete Design System artifact file tree to design-system/out/project/:
tokens.json (from the shared SCSS partials), tokens.css (compiled from it), the
brand book, bundle.css/js, one card per shared component and the index. Publish
the tree to the artifact with the /design-sync skill (.claude/skills/design-sync).

    python3 design-system/build.py            # build into design-system/out
    python3 design-system/build.py --out DIR  # build elsewhere
"""
import argparse
import datetime as dt
import json
import pathlib
import re
import shutil
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parent
sys.path.insert(0, str(HERE))

ARTIFACT_URL = "https://claude.ai/artifact/UQpiXTqaRqn1QSswnumCkd"
TITLE = "ThingsBoard Extensions"
NAMESPACE = "TbExtensions"
CREATED_ON_FILES = {"v": 1, "at": "2026-10-27T21:20:35Z"}  # when the system was first made; keep as is


def git(*args):
    try:
        return subprocess.run(["git", *args], cwd=REPO, capture_output=True, text=True, check=True).stdout.strip()
    except Exception:
        return ""


def css_name(name):
    return "--" + name.replace(".", "\\.")


def token_css_value(v):
    if isinstance(v, str) and v.startswith("{") and v.endswith("}"):
        return f"var(--{v[1:-1]})"
    return v


def compile_tokens_css(tokens):
    """tokens.css laid out as the page compiles it (format.md: 'tokens.css as compiled')."""
    themes = [t["id"] for t in tokens["color"]["themes"]]
    first = themes[0]
    out = [f"/* {TITLE} — generated from tokens.json */"]

    def theme_value(tok, theme):
        v = tok["value"]
        if isinstance(v, str):
            return v if theme == first else None
        return v.get(theme)

    # first theme: every colour and shadow
    lines = []
    for tok in tokens["color"]["tokens"]:
        lines.append(f"  {css_name(tok['name'])}: {token_css_value(theme_value(tok, first))};")
    for tok in tokens.get("shadow", {}).get("tokens", []):
        lines.append(f"  {css_name(tok['name'])}: {token_css_value(theme_value(tok, first))};")
    out.append(f':root, [data-theme="{first}"] {{\n' + "\n".join(lines) + "\n}")

    # further themes: overrides, aliases re-declared
    for theme in themes[1:]:
        lines = []
        for fam in ("color", "shadow"):
            for tok in tokens.get(fam, {}).get("tokens", []):
                v = theme_value(tok, theme)
                base = theme_value(tok, first)
                if v is None:
                    continue
                if v != base or (isinstance(v, str) and v.startswith("{")):
                    lines.append(f"  {css_name(tok['name'])}: {token_css_value(v)};")
        out.append(f'[data-theme="{theme}"] {{\n' + "\n".join(lines) + "\n}")

    # non-colour families and font stacks
    lines = []
    for fam, data in tokens.items():
        if fam in ("color", "shadow", "type", "name", "version", "meta") or not isinstance(data, dict):
            continue
        for tok in data.get("tokens", []):
            lines.append(f"  {css_name(tok['name'])}: {tok['value']};")
    for key, stack in tokens["type"]["families"].items():
        lines.append(f"  --font-{key}: {stack};")
    out.append(":root {\n" + "\n".join(lines) + "\n}")

    # type styles
    for group in tokens["type"]["groups"]:
        for st in group["styles"]:
            fam = st.get("family", group["family"])
            props = [f"font-family: var(--font-{fam})", f"font-size: {st['fontSize']}"]
            if "lineHeight" in st:
                props.append(f"line-height: {st['lineHeight']}")
            if "fontWeight" in st:
                props.append(f"font-weight: {st['fontWeight']}")
            if "letterSpacing" in st:
                props.append(f"letter-spacing: {st['letterSpacing']}")
            out.append(f".{st['name']} {{ " + "; ".join(props) + "; }")
    return "\n".join(out) + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(HERE / "out"))
    args = ap.parse_args()
    out = pathlib.Path(args.out).resolve()
    project = out / "project"
    if project.exists():
        shutil.rmtree(project)
    (project / "components").mkdir(parents=True)

    sha = git("rev-parse", "--short", "HEAD") or "unknown"
    branch = git("rev-parse", "--abbrev-ref", "HEAD") or "unknown"
    by = git("config", "user.name") or "Claude"
    now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    # 1. tokens.json from the SCSS partials, with provenance.
    import tokens as tokens_mod  # noqa: E402

    tokens = tokens_mod.build(REPO)
    tokens["meta"]["ref"] = f"{branch}@{sha}"
    tokens["meta"]["synced"] = now[:10]
    (project / "tokens.json").write_text(json.dumps(tokens, indent=2, ensure_ascii=False) + "\n")
    (project / "tokens.css").write_text(compile_tokens_css(tokens))

    # 2. Static sources: brand book, sections, bundle, cover.
    for name in ("README.md", "dashboard-layout.md"):
        shutil.copy(HERE / "src" / name, project / name)
    for name in ("bundle.css", "bundle.js"):
        shutil.copy(HERE / "src" / name, project / "components" / name)
    (project / "components" / "Cover").mkdir()
    shutil.copy(HERE / "src" / "Cover" / "preview.html", project / "components" / "Cover" / "preview.html")

    # 3. Component cards.
    import cards_a, cards_b  # noqa: E402,F401
    from cards_a import CARDS, write_cards  # noqa: E402

    write_cards(project / "components")

    # 4. The index: code-synced, read-only on the page.
    index = {
        "v": 3,
        "layout": "files",
        "createdOnFiles": CREATED_ON_FILES,
        "editing": "code",
        "title": TITLE,
        "namespace": NAMESPACE,
        "libraries": [],
        "sections": {},
        "groups": [],
        "assetGroups": {},
        "blobs": {},
        "docs": {"readme": "project/README.md", "sections": []},
        "lastChange": {
            "by": by,
            "at": now,
            "via": f"design-sync · thingsboard-extensions@{sha}",
            "note": f"Rebuilt from src/app/components/shared at {branch}@{sha}: "
                    f"{len(tokens['color']['tokens'])} colour tokens, {len(CARDS)} component cards",
        },
    }
    (project / "design-system.json").write_text(json.dumps(index, indent=2, ensure_ascii=False) + "\n")

    files = sorted(p.relative_to(out).as_posix() for p in project.rglob("*") if p.is_file())
    (out / "files.json").write_text(json.dumps({f: f for f in files if not f.endswith("design-system.json")}, indent=0) + "\n")
    print(f"{len(files)} files in {project}  ({branch}@{sha})")
    print(f"publish: url={ARTIFACT_URL} root={out} file_path={project / 'design-system.json'} files={out / 'files.json'}")


if __name__ == "__main__":
    main()
