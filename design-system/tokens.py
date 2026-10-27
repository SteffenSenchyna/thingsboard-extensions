"""Build tokens.json from the shared SCSS partials (exact values, source order)."""
import json, re, sys, pathlib


def build(repo):
    """Return the tokens object for the repository at `repo`."""
    repo = pathlib.Path(repo)
    theme = (repo / "src/app/components/shared/styles/_theme.scss").read_text()
    return _build(theme)


def _build(theme):


    def block(name):
        m = re.search(r"@mixin %s \{(.*?)\n\}" % name, theme, re.S)
        return m.group(1)


    def parse(body):
        res = {}
        order = []
        for line in body.splitlines():
            line = line.strip()
            m = re.match(r"(--[a-z0-9-]+):\s*(.+?);(?:\s*//\s*(.*))?$", line)
            if not m:
                continue
            name, value, comment = m.group(1)[2:], m.group(2).strip(), (m.group(3) or "").strip()
            res[name] = (value, comment)
            order.append(name)
        return res, order


    light, order = parse(block("tb-tts-light-tokens"))
    dark, _ = parse(block("tb-tts-dark-tokens"))

    # Hand-computed results of the two color-mix() expressions in the light theme
    # (the page cannot read color-mix); the dark theme uses plain aliases.
    computed_light = {
        "c-bg-hover-row": "#f7f9fb",  # color-mix(in srgb, #f3f5f8 50%, #fbfcfd)
        "c-bg-hover-control": "#eaedf1",  # color-mix(in srgb, #98a4b6 10%, #f3f5f8)
    }

    STEP_WORDS = {
        "min": "the lightest step (white in light, black in dark)",
        "extralight": "extra-light step",
        "extralight-hover": "extra-light hover step",
        "light": "light step",
        "semilight": "semi-light step",
        "normal": "normal step",
        "normal-hover": "hover state of the normal step",
        "normal-active": "active (pressed) state",
        "normal-disabled": "disabled state of the normal step",
        "semibold": "semi-bold step",
        "bold": "bold step",
        "heavy": "heaviest step",
        "heavy-hover": "hover state of the heaviest step",
    }

    # Where the shared components actually use a token (from the component SCSS).
    USAGE = {
        "c-bg-neutral-min": "Page background of every dashboard root, the fill of boxed controls (inputs, selects, button groups, copy boxes, filter boxes), the detail panel, the date-range picker and the confirm dialog.",
        "c-bg-neutral-extralight": "Card surface: `tb-card`, collapsible cards, data tables, trend and map cards, and table column headers; the timeframe menu fill in light mode.",
        "c-bg-neutral-extralight-hover": "Dark-mode row hover and control hover; light-mode fill of neutral chips (`dt-chip`, group chips). Hover fill of ghost buttons and segment buttons in dark mode.",
        "c-bg-neutral-light": "Light-mode hover fill of ghost buttons, header buttons, tabs, select options and paginator buttons; the segmented control track; dark-mode fill of ghost buttons, header buttons and the timeframe menu.",
        "c-bg-neutral-semilight": "Reserved TTS step; not used by a shared component yet.",
        "c-bg-neutral-normal": "Dark-mode hover of timeframe menu options; the 10 % ingredient of `c-bg-hover-control` in light mode.",
        "c-bg-neutral-semibold": "Reserved TTS step; not used by a shared component yet.",
        "c-bg-neutral-bold": "Dark-mode fill of every hover tooltip pill (the light-mode pill uses `c-bg-neutral-heavy`).",
        "c-bg-neutral-heavy": "Light-mode fill of every hover tooltip pill (info icon, header buttons, segmented control, button group, alarm severity filter); the cover's ink block.",
        "c-bg-neutral-heavy-hover": "Reserved TTS step; not used by a shared component yet.",
        "c-bg-hover-row": "Table row hover wash (`tb-data-table`). Lighter than `c-bg-hover-control` so a hovered icon button still reads over a hovered row. In the source this is `color-mix(in srgb, c-bg-neutral-light 50%, c-bg-neutral-extralight)`; the hex here is that mix.",
        "c-bg-hover-control": "Circular hover fill of icon buttons, filter twisties, chip remove buttons, calendar days and presets. In the source this is `color-mix(in srgb, c-bg-neutral-normal 10%, c-bg-neutral-light)`; the hex here is that mix.",
        "c-bg-brand-extralight": "Dark-mode fill of the brand status pill and the active filter chip.",
        "c-bg-brand-light": "Light-mode fill of the brand status pill, the active filter chip and the selected table row.",
        "c-bg-brand-semilight": "Light-mode fill of brand icon badges (widget header, entity panel), active header icon buttons, active map controls and the active tab's hover.",
        "c-bg-brand-normal": "The brand blue. Primary button fill, checked checkbox and switch border, slider fill, radio dot, calendar range edges, the selected timeframe label, info icon, filter links, map markers and clusters, the chart line.",
        "c-bg-brand-normal-hover": "Primary button hover fill and light-mode link hover colour.",
        "c-bg-brand-bold": "Reserved TTS step; not used by a shared component yet.",
        "c-bg-brand-heavy": "Reserved TTS step; not used by a shared component yet.",
        "c-bg-brand-normal-disabled": "Reserved for a disabled primary button (the shared button fades with opacity instead).",
        "c-bg-success-extralight": "Fill of the success status pill and the active table chip.",
        "c-bg-warning-extralight": "Fill of the warning status pill.",
        "c-bg-error-extralight": "Fill of the error status pill.",
        "c-bg-info-extralight": "Reserved info tint; no shared component paints info today.",
        "c-bg-success-normal": "`status.$success`: the one green for every status mark — success pills' text, warning-severity alarm segments, battery fill, the copied check in a copy box.",
        "c-bg-warning-normal": "`status.$warning`: the one yellow for every status mark — warning pills' text and minor-severity alarm segments.",
        "c-bg-error-normal": "`status.$error`: the one red for every status mark — error pills' text, critical alarm segments, the danger button, count badges, active-alarm counts.",
        "c-bg-error-normal-hover": "Danger button hover fill.",
        "c-bg-info-normal": "Reserved info blue; no shared component paints info today.",
        "c-bg-major-normal": "`status.$major`: the one orange for every status mark — major pills' text and major-severity alarm segments.",
        "c-bg-major-extralight": "Fill of the major status pill.",
        "c-text-neutral-min": "Light-mode ground of ghost buttons, header buttons, the segmented control's selected pill, tooltip text, map marker glyphs. (White in light, black in dark — it is the inverse of `c-text-neutral-heavy`.)",
        "c-text-neutral-extralight": "Placeholder text in inputs, selects and the table search.",
        "c-text-neutral-light": "Muted text: field labels, subtitles, table column headers, table empty states, chart axis labels, counts in filter chips, section titles, disabled filter links, `c-text-pill-neutral` in light mode. Only 3.6:1 on `c-bg-neutral-min` and 3.5:1 on the card in light (5.8:1 / 5.2:1 in dark), so never for a value a person must read, only for labels and metadata beside one.",
        "c-text-neutral-semilight": "Secondary text: dialog messages, tab labels, split-toggle options, filter chips, date-range nav arrows.",
        "c-text-pill-neutral": "Text of the neutral status pill (Offline, …): `c-text-neutral-light` in light mode, a step brighter (#94a3bd) in dark.",
        "c-text-neutral-bold": "Reserved TTS step; not used by a shared component yet.",
        "c-text-neutral-heavy": "Primary text on every surface: titles, table cells, control labels, input values, dialog headings; dark-mode tooltip text. 14.6:1 on `c-bg-neutral-min` in light, 18.1:1 in dark.",
        "c-bg-success-normal": "`status.$success`: the one green for every status mark — success pills' text, warning-severity alarm segments, battery fill, the copied check in a copy box. As pill text on `c-bg-success-extralight` it is only 2.0:1 in light (11.3:1 dark): the pill always carries a word.",
        "c-bg-warning-normal": "`status.$warning`: the one yellow for every status mark — warning pills' text and minor-severity alarm segments. As pill text on `c-bg-warning-extralight` it is 1.6:1 in light (13.1:1 dark): never the only carrier of meaning.",
        "c-bg-error-normal": "`status.$error`: the one red for every status mark — error pills' text, critical alarm segments, the danger button, count badges, active-alarm counts. White text on it is 3.5:1; pill text on `c-bg-error-extralight` is 3.3:1 light, 5.3:1 dark.",
        "c-bg-major-normal": "`status.$major`: the one orange for every status mark — major pills' text and major-severity alarm segments. As pill text on `c-bg-major-extralight` it is 2.8:1 light, 7.6:1 dark.",
        "c-text-brand-normal": "Brand text: the active tab underline, the select's check mark, days inside a calendar range, the timeframe menu check, the brand pill text in light mode.",
        "c-text-brand-normal-hover": "Hover colour for brand text links in ThingsBoard proper; the shared link hover uses `c-bg-brand-normal-hover` instead.",
        "c-text-brand-semilight": "Fill of a focused date segment in the date-range picker (white digits on it).",
        "c-text-brand-light": "Brand pill text in dark mode.",
        "c-text-info-bold": "Light-mode text of the active filter chip.",
        "c-text-success-normal": "Text of the active (green) table chip; same value as `c-bg-success-normal`.",
        "c-icon-neutral-normal": "Icons beside card titles (collapsible card icon), map zoom and control icons.",
        "c-icon-neutral-light": "Resting icon colour of every icon button, chevrons, search and close icons, the collapsed card chevron, the switch's off thumb, scrollbar thumb hover, the neutral alarm segment. Not used for empty-state icons (use `c-text-neutral-light`, which flips in dark).",
        "c-icon-neutral-extralight": "Disabled paginator arrows.",
        "c-icon-brand-light": "Hover and focus ring of boxed controls (input focus border, checkbox hover, select open border, calendar box focus); the switch's on thumb; dark-mode brand icon colour in badges, active header buttons and active filter chips.",
        "c-icon-brand-normal": "Reserved TTS brand icon colour; the shared components use `c-bg-brand-normal` / `c-icon-brand-light` instead.",
        "c-border-neutral-min": "Reserved TTS step; not used by a shared component yet.",
        "c-border-neutral-extralight": "Reserved TTS step; not used by a shared component yet.",
        "c-border-neutral-light": "Card border, table row dividers, column header rule, paginator rule, the filter list's search and footer rules, chart axis and split lines; light-mode border of ghost buttons, header buttons, segmented controls, filter chips, dividers and the sidebar edge.",
        "c-border-neutral-normal": "Border of boxed controls (inputs, selects, button groups, copy boxes, checkboxes, switches, filter boxes, date-range boxes, table search); dark-mode border of ghost buttons, header buttons, segmented controls and dividers; the scrollbar thumb; the empty alarm segment; tree connector lines.",
        "c-border-neutral-semibold": "Reserved TTS step; not used by a shared component yet.",
        "c-border-neutral-bold": "Reserved TTS step; not used by a shared component yet.",
        "c-border-brand-normal": "Border of the selected map type thumbnail.",
        "c-border-success-light": "Border of the success status pill.",
        "c-border-warning-light": "Border of the warning status pill.",
        "c-border-error-light": "Border of the error status pill.",
        "c-border-major-light": "Border of the major status pill.",
        "c-border-success-extralight": "Border of the active (green) table chip.",
        "c-gradient-neutral-light-01": "Light-mode hover fill of the map's zoom and control buttons.",
        "c-gradient-neutral-light-02": "Reserved TTS gradient stop; not used by a shared component yet.",
    }


    def generic_usage(name):
        parts = name.split("-")
        fam = parts[1] if len(parts) > 1 else name
        hue = parts[2] if len(parts) > 2 else ""
        step = "-".join(parts[3:])
        step_w = STEP_WORDS.get(step, step)
        fam_w = {"bg": "Background", "text": "Text", "icon": "Icon", "border": "Border", "gradient": "Gradient stop"}.get(fam, fam)
        if hue in ("success", "warning", "error", "info", "major"):
            return f"{fam_w} colour of the {hue} status ramp, {step_w}. From The Things Stack palette; reserved for status surfaces in that tone."
        return f"{fam_w} colour of the {hue} ramp, {step_w}. From The Things Stack palette."


    color_tokens = []
    shadow_tokens = []
    for name in order:
        lv, lc = light[name]
        dv = dark.get(name, (None, ""))[0]
        if name.startswith("shadow-"):
            shadow_tokens.append({"name": name, "value": lv, "usage": {
                "shadow-box-error-normal": "Error glow ring (TTS); reserved for invalid fields.",
                "shadow-box-warning-normal": "Warning glow ring (TTS); reserved.",
                "shadow-box-panel-normal": "Map zoom pill and map control buttons.",
                "shadow-box-button-normal": "TTS raised button shadow; the shared buttons are flat and do not use it.",
                "shadow-box-button-bold": "TTS raised button hover shadow; not used by a shared component.",
                "shadow-box-modal-normal": "Every hover tooltip pill, the select's open panel, the map layers panel, the date-range picker and the confirm dialog.",
            }[name]})
            continue

        def norm(v):
            if v is None:
                return None
            v = v.strip()
            if v.startswith("var(--") and v.endswith(")"):
                return "{" + v[6:-1] + "}"
            if v.startswith("#"):
                return v.lower()
            return None  # color-mix etc.

        lval = norm(lv)
        if lval is None:
            lval = computed_light[name]
        dval = norm(dv) if dv is not None else None
        value = {"light": lval}
        if dval is not None:
            value["dark"] = dval
        usage = USAGE.get(name) or generic_usage(name)
        if dv is None:
            usage += " Not redefined in the dark theme (same value in both)."
        if lc and name not in USAGE:
            usage += f" Source note: {lc}"
        color_tokens.append({"name": name, "value": value, "usage": usage})

    tokens = {
        "name": "ThingsBoard Extensions",
        "version": 1,
        "meta": {
            "source": "local",
            "repo": "SteffenSenchyna/thingsboard-extensions",
            "ref": "master@0b3be73",
            "package": "src/app/components/shared",
            "paths": {
                "tokens": [
                    "src/app/components/shared/styles/_theme.scss",
                    "src/app/components/shared/styles/_card.scss",
                    "src/app/components/shared/styles/_form.scss",
                    "src/app/components/shared/styles/_button.scss",
                    "src/app/components/shared/styles/_status.scss",
                    "src/app/components/shared/styles/_tooltip.scss",
                    "src/app/components/shared/styles/_motion.scss",
                    "src/app/components/shared/styles/_table.scss",
                    "src/app/components/shared/styles/_filter.scss",
                    "src/app/components/shared/styles/_icon-button.scss",
                ],
                "fonts": [],
                "assets": [],
                "docs": ["CLAUDE.md"],
            },
            "synced": "2026-10-27",
        },
        "color": {
            "themes": [{"id": "light", "name": "Light"}, {"id": "dark", "name": "Dark"}],
            "tokens": color_tokens,
        },
        "type": {
            "fonts": [],
            "families": {
                "sans": "Roboto, \"Helvetica Neue\", sans-serif",
                "mono": "ui-monospace, \"Roboto Mono\", \"SFMono-Regular\", Menlo, Consolas, monospace",
                "field": "Inter, Lato, Arial, sans-serif",
                "icons": "\"Material Symbols Rounded\"",
            },
            "groups": [
                {
                    "name": "Text",
                    "family": "sans",
                    "styles": [
                        {"name": "widget-title", "fontSize": "16px", "lineHeight": "20px", "fontWeight": 600, "sample": "Devices", "usage": "Widget header title, detail panel title, confirm dialog heading."},
                        {"name": "panel-name", "fontSize": "15px", "lineHeight": "20px", "fontWeight": 600, "sample": "TS302 · Cold room 2", "usage": "Entity name in the entity detail panel header."},
                        {"name": "card-title", "fontSize": "14px", "lineHeight": "20px", "fontWeight": 700, "sample": "Calibration", "usage": "Collapsible card title and the data table's compact header."},
                        {"name": "nav", "fontSize": "14px", "lineHeight": "20px", "fontWeight": 500, "sample": "Insights", "usage": "Tab bar tabs, segmented control segments, timeframe selector button and menu options."},
                        {"name": "body", "fontSize": "14px", "lineHeight": "20px", "fontWeight": 400, "sample": "Clear this alarm for all selected devices?", "usage": "Dialog messages and split-toggle options."},
                        {"name": "control", "fontSize": "13px", "lineHeight": "18px", "fontWeight": 400, "sample": "Set a name", "usage": "Every boxed control: inputs, selects, button groups, checkbox and switch labels, filter rows, calendar days, table cells (`table.$table-text-size`)."},
                        {"name": "label", "fontSize": "13px", "lineHeight": "18px", "fontWeight": 400, "sample": "Name (Label)", "usage": "Muted field label above a control, in `c-text-neutral-light` with a 6px gap below."},
                        {"name": "button", "fontSize": "13px", "lineHeight": "18px", "fontWeight": 600, "sample": "Apply changes", "usage": "Primary, ghost and danger buttons (`button.tb-button-base`)."},
                        {"name": "tooltip", "fontSize": "13px", "lineHeight": "18px", "fontWeight": 500, "sample": "Dark mode", "usage": "Hover tooltip pills under header buttons and segments; info tooltips use 12px / 1.4 regular."},
                        {"name": "table-header", "fontSize": "12px", "lineHeight": "16px", "fontWeight": 500, "letterSpacing": "0.06em", "sample": "LAST SEEN", "usage": "Data table column headers: uppercase, letter-spaced, `c-text-neutral-light`."},
                        {"name": "pill", "fontSize": "12px", "lineHeight": "16px", "fontWeight": 600, "sample": "Online", "usage": "Status pills, table chips, chart captions (500), subtitles under names (400)."},
                        {"name": "section-title", "fontSize": "12px", "lineHeight": "16px", "fontWeight": 700, "sample": "Channel 1", "usage": "Small grey heading between a card title and its gated groups (device settings card)."},
                        {"name": "filter-heading", "fontSize": "11px", "lineHeight": "16px", "fontWeight": 600, "sample": "Markets", "usage": "Sidebar filter group titles (`filter.tb-filter-heading`) and the date-range field labels."},
                        {"name": "badge", "fontSize": "10px", "lineHeight": "1", "fontWeight": 700, "sample": "3", "usage": "Count badges on icon buttons and segments: white on `c-bg-error-normal`."},
                    ],
                },
                {
                    "name": "Code",
                    "family": "mono",
                    "styles": [
                        {"name": "copy-value", "fontSize": "13px", "lineHeight": "18px", "fontWeight": 400, "sample": "a81758fffe0a1b2c", "usage": "Values in a copy box (device EUIs, hostnames, ids)."},
                    ],
                },
                {
                    "name": "Date fields",
                    "family": "field",
                    "styles": [
                        {"name": "date-segment", "fontSize": "13px", "lineHeight": "20px", "fontWeight": 400, "sample": "10 / 27 / 2026  09 : 30", "usage": "Only the date-range picker's start/end boxes: Inter with tabular digits, loaded by that component from Google Fonts."},
                    ],
                },
            ],
        },
        "spacing": {
            "note": "Named SCSS variables from components/shared/styles; every dashboard uses these, never its own.",
            "tokens": [
                {"name": "card-padding", "value": "16px", "usage": "`card.$card-padding`: inner gutter of every card, widget header, table cell row and panel body."},
                {"name": "card-stack-gap", "value": "10px", "usage": "`card.$card-stack-gap`: gap between cards stacked in a panel, sidebar or main column; also the detail panel body's vertical padding."},
                {"name": "page-gutter", "value": "24px", "usage": "Dashboard root side and bottom padding (16px on top)."},
                {"name": "sidebar-gap", "value": "16px", "usage": "Gap between the filter sidebar and the main column in `tb-sidebar-layout`."},
                {"name": "field-gap", "value": "18px", "usage": "`form.$field-gap`: vertical space between label+control blocks in a settings form."},
                {"name": "label-gap", "value": "6px", "usage": "Space between a field label and its control."},
                {"name": "control-height", "value": "36px", "usage": "`form.$control-height`: one height for every boxed form control (input, select, copy box in input mode, stepper box)."},
                {"name": "control-padding-x", "value": "12px", "usage": "Horizontal padding inside inputs and selects."},
                {"name": "button-padding", "value": "8px 14px", "usage": "Padding of primary / ghost / danger text buttons (34px tall)."},
                {"name": "small-control-height", "value": "32px", "usage": "Button group buttons, split toggle, icon buttons, the filter list's search and footer bars, date-range boxes."},
                {"name": "header-control-height", "value": "40px", "usage": "Header-row controls (header icon button, theme toggle, segmented control, timeframe selector): 2.5rem."},
                {"name": "icon-button-size", "value": "32px", "usage": "`icon-button.tb-icon-button`: circular action buttons in headers and table rows, 20px icon."},
                {"name": "table-row-height", "value": "40px", "usage": "`$row-height` in data-table.component.scss: minimum row height of every table."},
                {"name": "table-cell-padding-y", "value": "6px", "usage": "`$cell-padding-y`: vertical cell padding so a 28px pill or copy box fits a 40px row."},
                {"name": "filter-inset", "value": "8px", "usage": "`filter.$filter-inset`: left inset of sidebar section titles and option controls."},
                {"name": "filter-control-gap", "value": "8px", "usage": "`filter.$filter-control-gap`: checkbox/radio to label gap in filters."},
                {"name": "filter-button-size", "value": "24px", "usage": "`filter.$filter-button-size`: a section's collapse chevron and a filter list's expand box (16px icon)."},
                {"name": "filter-divider-space", "value": "8px", "usage": "`filter.$filter-divider-space`: space above a divider between sidebar sections."},
                {"name": "filter-heading-gap", "value": "4px", "usage": "`filter.$filter-heading-gap`: space below a section divider to the heading row."},
                {"name": "checkbox-size", "value": "16px", "usage": "Checkbox box and radio circle; the table's bulk-select box is 20px."},
                {"name": "switch-size", "value": "38px", "usage": "Switch track width (22px tall, 15px thumb travelling 16px)."},
                {"name": "detail-panel-width", "value": "386px", "usage": "Right-hand detail panel width (max 90vw)."},
                {"name": "sidebar-width", "value": "300px", "usage": "Default `tb-sidebar-layout` sidebar width."},
                {"name": "tooltip-offset", "value": "10px", "usage": "Gap between a control and its hover tooltip pill (8px for the info icon)."},
            ],
        },
        "radius": {
            "tokens": [
                {"name": "radius-card", "value": "8px", "usage": "`card.$card-radius`: cards, tables, charts, maps, the confirm dialog, the date-range picker."},
                {"name": "radius-control", "value": "8px", "usage": "Inputs, selects, buttons, button groups, split toggle, header buttons, segmented control track (0.5rem), table search, select options."},
                {"name": "radius-segment", "value": "6px", "usage": "Segment pills inside a segmented control (0.375rem), tags, filter chips in a list, the filter list's expand box, filter section toggles, date-range boxes, map type thumbnails, the bulk-select checkbox."},
                {"name": "radius-checkbox", "value": "4px", "usage": "Checkbox box, tree twisties, chip remove buttons."},
                {"name": "radius-tooltip", "value": "10px", "usage": "Hover tooltip pills, the select's open panel, the map layers panel, entity icon badge."},
                {"name": "radius-menu", "value": "12px", "usage": "Timeframe selector dropdown (0.75rem), table chips and group chips, collapsible card body clip."},
                {"name": "radius-pill", "value": "999px", "usage": "Status pills, filter chips, switch track, slider track, count badges, map zoom pill (14px)."},
                {"name": "radius-round", "value": "50%", "usage": "Icon buttons, radios, checkbox thumbs, calendar days, map control buttons, markers."},
            ],
        },
        "shadow": {
            "note": "The TTS `--shadow-box-*` custom properties, declared once (same in both themes). Light mode leans on shadows; dark mode leans on borders.",
            "tokens": shadow_tokens + [
                {"name": "shadow-panel-light", "value": "-8px 0 24px 0 rgba(0, 0, 0, 0.08)", "usage": "Detail panel's left elevation in light mode."},
                {"name": "shadow-panel-dark", "value": "-8px 0 28px 0 rgba(0, 0, 0, 0.22)", "usage": "Detail panel's left elevation in dark mode."},
                {"name": "shadow-segment-active", "value": "0 1px 3px rgba(0, 0, 0, 0.12)", "usage": "The selected pill of a segmented control."},
                {"name": "shadow-menu", "value": "0 3px 16px 0 rgba(0, 0, 0, 0.06)", "usage": "Timeframe selector dropdown; chart and map tooltips use 0 3px 16px rgba(0,0,0,0.12) with an 8px backdrop blur."},
            ],
        },
        "opacity": {
            "tokens": [
                {"name": "disabled", "value": "0.6", "usage": "Disabled buttons, checkboxes, switches, selects, sliders and filter rows."},
                {"name": "disabled-icon-button", "value": "0.4", "usage": "Disabled icon buttons (unless `.active`, e.g. an acknowledged alarm) and disabled stepper arrows."},
                {"name": "sort-hint", "value": "0.5", "usage": "The sort arrow on a hovered, unsorted table column."},
                {"name": "backdrop", "value": "0.25", "usage": "Scrim behind a dismissible detail panel (black); the confirm dialog uses 0.4."},
            ],
        },
    }

    return tokens


if __name__ == "__main__":
    t = build(sys.argv[1])
    print(len(t["color"]["tokens"]), "colors")
