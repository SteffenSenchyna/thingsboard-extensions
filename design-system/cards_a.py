# Component cards, part A: surfaces, actions, navigation, forms.
I = lambda n, c="": f'<i class="mi{(" " + c) if c else ""}">{n}</i>'

CARDS = {}
FONTS = ("https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;600;700"
         "&family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap")


def write_cards(root):
    """Write components/<Comp>/README.md and preview.html for every registered card."""
    import pathlib
    root = pathlib.Path(root)
    for name, c in CARDS.items():
        d = root / name
        d.mkdir(parents=True, exist_ok=True)
        marker = f'<!-- @dsCard group="{c["group"]}" height={c["height"]}' + (f' width={c["width"]}' if c["width"] else "") + " -->"
        html = f"""{marker}
<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="{FONTS}">
<link rel="stylesheet" href="../../components/bundle.css">
</head>
<body>
{c["body"]}
</body>
</html>
"""
        (d / "preview.html").write_text(html)
        (d / "README.md").write_text(c["readme"])

def card(name, group, height, readme, body, width=None):
    CARDS[name] = dict(group=group, height=height, readme=readme.strip() + "\n", body=body.strip(), width=width)


card("Card", "Surfaces", 150, """
# Card
The plain card shell every surface shares: a `c-bg-neutral-extralight` fill, a 1px `c-border-neutral-light` border, 8px corners and 16px padding. `<tb-card>` projects its content; the same shell is `card.tb-card-shell($padding)` in SCSS for tables, charts, maps and dialogs that lay out their own insides (they pass `0` and keep their inner elements on the 16px gutter).

**Use it** for any block of content that should read as one unit on the page. **Don't** nest cards, add shadows, or change the radius or padding locally: `card.$card-radius` and `card.$card-padding` are the only values.

**The consumer provides** the content. Stack several cards `card.$card-stack-gap` (10px) apart.
""", f"""
<div class="pv">
  <div class="tb-card" style="width:300px">
    <div class="pv-label">Battery</div>
    <div style="margin-top:6px;font-size:14px;font-weight:700">Cold room 2</div>
    <div style="margin-top:4px;font-size:13px;color:var(--c-text-neutral-light)">3.57 V · 92 %</div>
  </div>
  <div class="tb-card tb-card--flush" style="width:260px">
    <div style="padding:16px;font-size:14px;font-weight:700">Flush card</div>
    <div style="padding:0 16px 16px;font-size:13px;color:var(--c-text-neutral-light)">Padding 0: the inner elements carry the 16px gutter.</div>
  </div>
</div>
""")

card("CollapsibleCard", "Surfaces", 230, """
# CollapsibleCard
A card whose body folds under a bold 14px title row. The header is the whole-width button: optional 18px icon in `c-icon-neutral-normal`, the title in `card-title`, an optional info icon with a hover tooltip, and a 20px chevron in `c-icon-neutral-light` that rotates 180° when collapsed. The body animates `grid-template-rows` 0fr → 1fr over `motion.$expand-duration` (0.25s ease); the content stays mounted.

**Use it** for the sections of a settings panel ("Sensor channels", "Calibration", "Alarms") and for metric cards. **Don't** put a widget header inside it, or fold a table (tables use `tb-data-table`'s compact header).

**Inputs:** `title`, `icon`, `info`, `expanded` (two-way), `overflowVisible` once a dropdown inside must escape the clip. The native `title` attribute is stripped from the host.
""", f"""
<div class="pv">
  <section class="cc-card" style="width:320px">
    <button class="cc-header" type="button">{I("thermostat","cc-icon")}<span class="cc-title">Calibration</span>
      <span class="ii">{I("info")}<span class="ii-tip">Offsets applied to the raw reading.</span></span>
      <span class="cc-spacer"></span>{I("expand_less","cc-chevron")}</button>
    <div class="cc-body-wrap expanded"><div class="cc-body">
      <div class="ds-form"><div class="ds-field"><span class="ds-label">Temperature offset</span><input class="ds-input" value="-0.4"></div></div>
    </div></div>
  </section>
  <section class="cc-card" style="width:320px">
    <button class="cc-header" type="button"><span class="cc-title">Alarms</span><span class="cc-spacer"></span>{I("expand_less","cc-chevron collapsed")}</button>
    <div class="cc-body-wrap"><div class="cc-body">hidden</div></div>
  </section>
</div>
""")

card("WidgetHeader", "Surfaces", 110, """
# WidgetHeader
The titled header row of a widget: a 32px brand icon badge (`c-bg-brand-semilight` / `c-bg-brand-normal` in light, `c-bg-neutral-light` / `c-icon-brand-light` in dark) with an 18px filled icon, the title in `widget-title` (16/600), an optional 13px muted subtitle, and a row of 32px circular icon buttons on the right (`icon-button.tb-icon-button`). Padding 16px all round.

**Use it** at the top of a data table, trend chart or map card. **Don't** reuse it inside a collapsible card or a detail panel, which have their own header styles.

**Inputs:** `icon` (default `table_rows`), `title`, `subtitle`, `actions: WidgetHeaderAction[]` (`id`, `icon`, `tooltip`, `active`); `actionClick` emits the id. Extra controls project into `[widget-header-actions]`.
""", f"""
<div class="pv"><div class="tb-card tb-card--flush" style="width:460px">
  <header class="wh-head">
    <div class="wh-left"><span class="wh-icon-badge">{I("sensors")}</span>
      <div class="wh-titles"><span class="wh-title">Devices</span><span class="wh-subtitle">12 online · 2 alarms</span></div></div>
    <span class="wh-actions">
      <button class="tb-icon-btn active" type="button">{I("filter_list")}</button>
      <button class="tb-icon-btn" type="button">{I("search")}</button>
      <button class="tb-icon-btn" type="button">{I("refresh")}</button>
    </span>
  </header>
</div></div>
""")

card("Button", "Actions", 120, """
# Button
Text buttons from `styles/_button.scss`: `tb-button-primary` is the filled brand action (white on `c-bg-brand-normal`, hover `c-bg-brand-normal-hover`), `tb-button-ghost` the outlined secondary (page-white in light, `c-bg-neutral-light` in dark, border `c-border-neutral-light` / `c-border-neutral-normal`), and `tb-button-danger-colors` layers error red (`c-bg-error-normal`) over the primary shape. All are 13/600 Roboto with an 18px line, 8px 14px padding, 8px corners, 6px gap to a 16px icon, flat with no shadow; disabled fades to 0.6.

Text links (`tb-link`, "Select all", clickable counts) are bare 13px `c-bg-brand-normal` text hovering to `button.$link-hover-color`.

**Use** one primary per footer, paired with a ghost "Cancel" on its left; danger only for a destructive confirm. **Don't** add icons to both, or use a ghost button alone as the only action.
""", f"""
<div class="pv pv-row">
  <button class="tb-btn tb-btn--ghost" type="button">Cancel</button>
  <button class="tb-btn tb-btn--primary" type="button">Apply changes</button>
  <button class="tb-btn tb-btn--primary" type="button">{I("download")}Export</button>
  <button class="tb-btn tb-btn--danger" type="button">Clear alarm</button>
  <button class="tb-btn tb-btn--primary" type="button" disabled>Saving…</button>
  <button class="tb-link" type="button">Select all</button>
  <button class="tb-link" type="button" disabled>Reset</button>
</div>
""")

card("IconButton", "Actions", 90, """
# IconButton
`icon-button.tb-icon-button($icon-size: 20px)`: the one 32px circular action button for headers and table rows. Transparent at rest with the icon in `c-icon-neutral-light`; hover fills `c-bg-hover-control`; `.active` tints brand (`c-bg-brand-semilight` + `c-bg-brand-normal` light, `c-bg-neutral-light` + `c-icon-brand-light` dark) and skips the hover fill; `:disabled` fades to 0.4 unless active (an acknowledged alarm stays visible).

**Use it** for every icon action in a widget header, table row or panel header. **Don't** give it a border or a square shape: the bordered 40px square is `HeaderIconButton`, for the dashboard top bar only.
""", f"""
<div class="pv pv-row">
  <button class="tb-icon-btn" type="button">{I("search")}</button>
  <button class="tb-icon-btn" type="button" style="background:var(--c-bg-hover-control)">{I("refresh")}</button>
  <button class="tb-icon-btn active" type="button">{I("filter_list")}</button>
  <button class="tb-icon-btn" type="button" disabled>{I("clear")}</button>
  <button class="tb-icon-btn active" type="button" disabled>{I("done")}</button>
</div>
""")

card("HeaderIconButton", "Actions", 130, """
# HeaderIconButton
The 40px bordered square button of the dashboard top bar: `c-text-neutral-min` fill with a `c-border-neutral-light` border in light, `c-bg-neutral-light` and `c-border-neutral-normal` in dark, 8px corners, a 20px icon in `c-text-neutral-heavy`. Hover fills `c-bg-neutral-light` (dark: `c-bg-neutral-extralight-hover`); `active` tints brand. An optional red count badge (`c-bg-error-normal`, 10/700 white, 16px pill) sits on the icon's top-right corner, and a navy tooltip pill opens 10px below with a caret.

**Use it** for Filters, Alarms, Settings and similar top-bar toggles. **Don't** put it inside a card.

**Inputs:** `icon`, `tooltip`, `badge: number | null`, `active`, `pressable`.
""", f"""
<div class="pv pv-row" style="padding-bottom:56px">
  <span class="hib tb-tip-host"><button class="hib-btn" type="button">{I("tune")}</button><span class="tb-tip tb-tip--below">Filters</span></span>
  <span class="hib tb-tip-host"><button class="hib-btn active" type="button"><span class="hib-icon-wrap">{I("notifications")}<span class="hib-badge">3</span></span></button><span class="tb-tip tb-tip--below shown">Alarms</span></span>
  <span class="hib tb-tip-host"><button class="hib-btn" type="button">{I("settings")}</button><span class="tb-tip tb-tip--below">Settings</span></span>
</div>
""")

card("ThemeToggle", "Actions", 130, """
# ThemeToggle
A `HeaderIconButton` that flips the dashboard between light and dark: `light_mode` or `dark_mode` as the icon and "Light mode" / "Dark mode" in a tooltip pill that opens below, right-aligned to the button with its caret 14px from the right edge.

**Use** exactly one, last in the top bar. The host flips the root's `.dark` class on `toggled`. **Inputs:** `dark`.
""", f"""
<div class="pv pv-row" style="padding-bottom:56px">
  <span class="theme-toggle tb-tip-host"><button class="theme-toggle-btn" type="button">{I("light_mode")}</button><span class="tb-tip tb-tip--below shown">Light mode</span></span>
  <span class="theme-toggle tb-tip-host"><button class="theme-toggle-btn" type="button">{I("dark_mode")}</button><span class="tb-tip tb-tip--below">Dark mode</span></span>
</div>
""")

card("Tooltip", "Actions", 150, """
# Tooltip
Every hover tooltip in every dashboard is the same navy pill: `c-bg-neutral-heavy` with `c-text-neutral-min` text in light, `c-bg-neutral-bold` with `c-text-neutral-heavy` in dark; 13/500, 8px 14px padding, 10px corners, `shadow-box-modal-normal`, a 6px caret on the edge facing its control, 10px away from it. Info tooltips (`InfoIcon`, chart captions) are the same pill at 12px regular, 1.4 line height, up to 220 to 240px wide.

They show instantly with the shared pop (`tooltip.tb-tooltip-pop(origin)` hidden, `tooltip.tb-tooltip-shown` on hover: scale 0.9 → 1 over 0.16s with a slight overshoot) and fade out in 0.1s. `matTooltip` gets the same 0ms delay from `provideTbTooltipDefaults()`.

**Don't** set `matTooltipShowDelay` per usage, and never let a native `title` attribute reach the DOM.
""", f"""
<div class="pv pv-row" style="padding:56px 24px">
  <span class="tb-tip-host"><button class="seg-btn active" style="height:32px" type="button">Above</button><span class="tb-tip tb-tip--above shown">Last 24 hours</span></span>
  <span class="tb-tip-host" style="margin-left:40px"><button class="seg-btn active" style="height:32px" type="button">Below</button><span class="tb-tip tb-tip--below shown">Dark mode</span></span>
  <span class="ii" style="margin-left:60px">{I("info")}<span class="ii-tip shown">Received signal strength (dBm). Closer to 0 is stronger.</span></span>
</div>
""")

card("TabBar", "Navigation", 90, """
# TabBar
Top-level view tabs: 14/500 labels with an 18px icon, 18px 16px padding, `c-text-neutral-semilight` at rest, `c-text-neutral-heavy` on hover with a `c-bg-neutral-light` fill, and a 3px underline that grows from the centre: grey (`c-border-neutral-light`) on hover, brand (`c-text-brand-normal`) and solid on the active tab. The bar sits on a `c-border-neutral-light` rule so the underline lands on it.

**Use it** for the dashboard's main views. Inside a panel use `SegmentedControl` instead. **Inputs:** `tabs: TabItem[]` (`id`, `label`, `icon`), `active`; `activeChange` emits the id.
""", f"""
<div class="pv" style="padding:0 16px"><div class="tb-tabs">
  <button class="tb-tab active" type="button">{I("grid_view")}<span>Overview</span></button>
  <button class="tb-tab" type="button">{I("notifications")}<span>Alarms</span></button>
  <button class="tb-tab" type="button">{I("map")}<span>Map</span></button>
</div></div>
""")

card("SegmentedControl", "Navigation", 160, """
# SegmentedControl
A 40px track (`c-bg-neutral-light`, 1px border, 8px corners, 4px padding) of pill options 2px apart. Options are 14/500 `c-text-neutral-light`; hover gives a bordered pill, the selected one is a filled pill (`c-text-neutral-min` light, `c-bg-neutral-min` dark) with the track's border colour and a 1px/3px shadow. Icon options are 20px glyphs with 12px padding and may carry a red count badge; a hover tooltip pill opens above (or below with `tooltipPosition="below"`). In view-switcher mode (`showActiveLabel`) the selected option shows icon + label and takes the spare width; with two options both are labelled and split the width.

**Use it** to switch views inside a panel (Insights / Alarms / Settings) or a card. **Don't** use it for form values (that is `ButtonGroup`) or for time windows (`TimeframePicker`).

**Inputs:** `options: SegmentOption[]` (`id`, `label`, `icon`, `tooltip`, `badge`), `selected`, `showActiveLabel`, `tooltipPosition`, `fullWidth`; `selectedChange`, `optionClick`.
""", f"""
<div class="pv pv-col">
  <div class="seg-group">
    <button class="seg-btn active" type="button">Day</button><button class="seg-btn" type="button">Week</button><button class="seg-btn" type="button">Month</button>
  </div>
  <div class="seg-group seg-active-label" style="width:386px">
    <button class="seg-btn seg-icon-btn active" type="button">{I("insights")}<span class="seg-inline-label">Insights</span></button>
    <button class="seg-btn seg-icon-btn" type="button"><span class="seg-icon-wrap">{I("notifications")}<span class="seg-badge">2</span></span></button>
    <button class="seg-btn seg-icon-btn" type="button">{I("settings")}</button>
  </div>
</div>
""")

card("TimeframePicker", "Navigation", 90, """
# TimeframePicker
The "1D | 1W | 1M" picker for every chart and table: a `SegmentedControl` restyled as a compact outlined box (page fill, `c-border-neutral-normal`, 3px padding) with 12px labels, hairline dividers between segments, text-only hover and the selected label in `c-bg-brand-normal`. `customRange` adds a calendar segment that emits `customClick` with its button, the anchor for a `DateRangePicker`; set `selected` to `TB_CUSTOM_TIMEFRAME` once a range is applied. `fullWidth` stretches the segments.

**Use it** under a metric card's title or in a table's header slot, and keep sibling cards' windows in sync by binding the same value. **Inputs:** `options` (default `TB_TIMEFRAME_OPTIONS`), `selected` (default `1D`), `customRange`, `fullWidth`.
""", f"""
<div class="pv pv-row">
  <span class="tbtf"><span class="seg-group"><button class="seg-btn active" type="button">1D</button><button class="seg-btn" type="button">1W</button><button class="seg-btn" type="button">1M</button></span></span>
  <span class="tbtf"><span class="seg-group"><button class="seg-btn" type="button">1D</button><button class="seg-btn" type="button">1W</button><button class="seg-btn" type="button">1M</button><button class="seg-btn seg-icon-btn active" type="button">{I("calendar_month")}</button></span></span>
  <span class="tbtf tbtf-full" style="width:220px"><span class="seg-group"><button class="seg-btn" type="button">1D</button><button class="seg-btn active" type="button">1W</button><button class="seg-btn" type="button">1M</button></span></span>
</div>
""")

card("TimeframeSelector", "Navigation", 230, """
# TimeframeSelector
A 40px top-bar button (calendar icon, 14/500 label, chevron) that opens a dropdown menu 8px below, right-aligned: 12px corners, 8px padding, `c-border-neutral-light` border, the card fill in light and `c-bg-neutral-light` in dark, a soft `shadow-menu`, and a 0.16s pop-in. Options are 40px rows with an 18px icon; the selected one keeps a `c-bg-neutral-light` highlight and a brand check.

**Use it** when one window applies to the whole dashboard. For a single chart or table use `TimeframePicker`. **Inputs:** `options: TimeframeOption[]` (`id`, `label`, `icon`), `selected`.
""", f"""
<div class="pv" style="padding-bottom:140px">
  <div class="timeframe"><button class="timeframe-btn active" type="button">{I("calendar_today","timeframe-icon")}<span class="timeframe-label">Last 7 days</span>{I("expand_less","timeframe-caret")}</button>
    <ul class="timeframe-menu">
      <li><button class="timeframe-option" type="button">{I("today")}<span class="timeframe-option-label">Last 24 hours</span></button></li>
      <li><button class="timeframe-option selected" type="button">{I("date_range")}<span class="timeframe-option-label">Last 7 days</span>{I("check","timeframe-option-check")}</button></li>
      <li><button class="timeframe-option" type="button">{I("calendar_month")}<span class="timeframe-option-label">Last 30 days</span></button></li>
    </ul></div>
</div>
""")

card("SplitToggle", "Navigation", 80, """
# SplitToggle
A 32px outlined box split by 16px hairlines into equal text options, 14px `c-text-neutral-semilight`, hover `c-text-neutral-heavy`, the active option in `c-bg-brand-normal` with no fill change. A radiogroup for two or three short words.

**Use it** for a binary mode in a sidebar ("List / Tree", "°C / °F"). **Inputs:** `options: SplitToggleOption[]`, `selected`; `selectedChange`.
""", f"""
<div class="pv pv-row">
  <div class="tbst" style="width:200px"><button class="tbst-option active" type="button">List</button><span class="tbst-divider"></span><button class="tbst-option" type="button">Tree</button></div>
  <div class="tbst" style="width:240px"><button class="tbst-option" type="button">All</button><span class="tbst-divider"></span><button class="tbst-option active" type="button">Online</button><span class="tbst-divider"></span><button class="tbst-option" type="button">Offline</button></div>
</div>
""")

card("FilterChips", "Navigation", 80, """
# FilterChips
A wrapping row of 28px pills, 6px apart, for a single-choice quick filter: `c-border-neutral-light` outline, 12/500 `c-text-neutral-semilight`, an optional 14px icon and a muted count. The active chip gets a 30 % brand border, `c-bg-brand-light` fill and `c-text-info-bold` text (dark: `c-bg-brand-extralight` and `c-icon-brand-light`).

**Use it** above a table as a status or type filter when the sidebar is closed or the choices are few. **Inputs:** `options: FilterChipOption[]` (`id`, `label`, `icon`, `count`), `selected`.
""", f"""
<div class="pv"><div class="tbfc">
  <button class="tbfc-chip active" type="button">All <span class="tbfc-count">24</span></button>
  <button class="tbfc-chip" type="button">{I("wifi")}Online <span class="tbfc-count">21</span></button>
  <button class="tbfc-chip" type="button">{I("wifi_off")}Offline <span class="tbfc-count">3</span></button>
  <button class="tbfc-chip" type="button">{I("notifications")}Alarming <span class="tbfc-count">2</span></button>
</div></div>
""")

card("TextField", "Forms", 150, """
# TextField
The form field of the settings cards (`form.tb-field-label` + `form.tb-text-input`): a 13px `c-text-neutral-light` label with a 6px gap, then a 36px box with 12px side padding, `c-border-neutral-normal` border, page fill, 8px corners, 13px `c-text-neutral-heavy` text and `c-text-neutral-extralight` placeholder. Focus swaps the border to `c-icon-brand-light`, no outline. A textarea keeps the same box with 10px vertical padding and a 64px minimum.

Fields stack `form.$field-gap` (18px) apart. A label may carry an `InfoIcon` on the same line (`ds-label-row`).

**Use it** for every free-text or numeric value in a settings form. **Don't** use Material's `mat-form-field` in a dashboard; it ignores the tokens.
""", f"""
<div class="pv"><div class="ds-form" style="width:300px">
  <div class="ds-field"><span class="ds-label">Name (Label)</span><input class="ds-input" placeholder="Set a name"></div>
  <div class="ds-field"><span class="ds-label-row"><span class="ds-label">Reporting interval</span><span class="ii">{I("info")}<span class="ii-tip">Minutes between uplinks.</span></span></span><input class="ds-input" value="15" style="border-color:var(--c-icon-brand-light)"></div>
  <div class="ds-field"><span class="ds-label">Note</span><textarea class="ds-input ds-textarea" rows="2" placeholder="Add a note"></textarea></div>
</div></div>
""")

card("Checkbox", "Forms", 110, """
# Checkbox
`tb-ext-checkbox`: a 16px box with 4px corners, `c-border-neutral-normal` outline on the page fill; hover tints the outline `c-icon-brand-light`; checked fills `c-bg-brand-normal` with a white 14px check. Tri-state (`triState`, value `null`) shows a muted dash in an unfilled box, meaning "unchanged" in bulk editing. The 13px label sits 10px right; `heading` makes it 600 for a group's enable toggle; `info` adds an `InfoIcon` after the label.

**Use it** for booleans in forms and for rows in filters (the filter row variant uses an 8px gap). **Don't** use it for a setting that takes effect immediately; that is a `Switch`.

**Inputs:** `label`, `info`, `infoAlign`, `heading`, `triState`, `disabled`; a `ControlValueAccessor`.
""", f"""
<div class="pv pv-col">
  <div class="cb-wrap"><button class="cb" type="button"><span class="cb-box">{I("check","cb-check")}</span><span class="cb-label">Report battery</span></button></div>
  <div class="cb-wrap"><button class="cb checked" type="button"><span class="cb-box">{I("check","cb-check")}</span><span class="cb-label cb-label--heading">Enable alarms</span></button><span class="ii">{I("info")}<span class="ii-tip">Raise alarms from this device.</span></span></div>
  <div class="cb-wrap"><button class="cb indeterminate" type="button"><span class="cb-box">{I("remove","cb-check")}</span><span class="cb-label">Unchanged across 4 devices</span></button></div>
  <div class="cb-wrap"><button class="cb" type="button" disabled><span class="cb-box">{I("check","cb-check")}</span><span class="cb-label">Disabled</span></button></div>
</div>
""")

card("Switch", "Forms", 90, """
# Switch
`tb-ext-switch`: a 38×22 pill track with a 15px thumb. Off: `c-border-neutral-normal` outline, page fill, `c-icon-neutral-light` thumb on the left. On: a 12 % brand wash, `c-bg-brand-normal` border, `c-icon-brand-light` thumb slid 16px right; both ease over 0.35s. Label 13px, `heading` makes it 600.

**Use it** as the gate of a settings object ("Threshold alarm" revealing its fields) or any on/off that applies by itself. **Inputs:** `label`, `heading`, `disabled`; a `ControlValueAccessor`.
""", f"""
<div class="pv pv-row" style="gap:28px">
  <button class="sw" type="button"><span class="sw-track"><span class="sw-thumb"></span></span><span class="sw-label">Off</span></button>
  <button class="sw checked" type="button"><span class="sw-track"><span class="sw-thumb"></span></span><span class="sw-label sw-label--heading">Threshold alarm</span></button>
  <button class="sw checked" type="button" disabled><span class="sw-track"><span class="sw-thumb"></span></span><span class="sw-label">Disabled</span></button>
</div>
""")

card("Select", "Forms", 250, """
# Select
`tb-select`: a 36px trigger shaped like a text field (`c-border-neutral-normal`, page fill, 8px corners, 13px) with a 20px chevron in `c-icon-neutral-light`. Open, the border and chevron turn `c-icon-brand-light` and the chevron flips; a panel drops 6px below with 10px corners, 6px padding, `shadow-box-modal-normal`, animating its grid track over 0.09s. Options are 13px rows with 8px corners; hover and selected fill `c-bg-neutral-light`, the selected one is 600 with a brand check.

**Use it** for enumerated settings (channel, unit, AM/PM). **Inputs:** `options: TbSelectOption[]` (`value`, `label`), `placeholder`, `disabled`; a `ControlValueAccessor`.
""", f"""
<div class="pv" style="align-items:flex-start">
  <div class="tbs" style="width:220px"><button class="tbs-trigger" type="button"><span class="tbs-value tbs-placeholder">Choose a channel</span>{I("expand_more","tbs-chevron")}</button></div>
  <div class="tbs" style="width:220px"><button class="tbs-trigger tbs-open" type="button"><span class="tbs-value">Temperature</span>{I("expand_more","tbs-chevron")}</button>
    <div class="tbs-panel">
      <button class="tbs-option tbs-selected" type="button">{I("check","tbs-check")}<span class="tbs-option-label">Temperature</span></button>
      <button class="tbs-option" type="button">{I("check","tbs-check")}<span class="tbs-option-label">Humidity</span></button>
      <button class="tbs-option" type="button">{I("check","tbs-check")}<span class="tbs-option-label">Pressure</span></button>
    </div></div>
</div>
""")

card("ButtonGroup", "Forms", 90, """
# ButtonGroup
A single-choice value picker: 32px outlined boxes (`c-border-neutral-normal`, page fill, 8px corners, 13px) wrapping 8px apart. Hover tints the outline `c-icon-brand-light`; the selected box gets a `c-bg-brand-normal` border and text. Options may carry a hover tooltip pill above.

**Use it** for two to five short values in a form ("°C | °F", "12h | 24h", sampling rates). For view switching use `SegmentedControl`. **Inputs:** `options: ButtonGroupOption[]` (`value`, `label`, `tooltip`), `disabled`; a `ControlValueAccessor`.
""", f"""
<div class="pv pv-row" style="gap:32px">
  <div class="bg-group"><button class="bg-btn active" type="button">°C</button><button class="bg-btn" type="button">°F</button></div>
  <div class="bg-group"><button class="bg-btn" type="button">5 min</button><button class="bg-btn active" type="button">15 min</button><button class="bg-btn" type="button">1 h</button><button class="bg-btn" type="button" disabled>6 h</button></div>
</div>
""")

card("SliderStepper", "Forms", 90, """
# SliderStepper
A range slider beside a number box. The 4px track fills `c-bg-brand-normal` up to a 16px white thumb (`c-border-neutral-normal` ring) and `c-border-neutral-light` after it (dark: `c-bg-neutral-light`). The 118px box is a text-field shape holding the value, a muted unit and stacked 16px up/down chevrons in `c-icon-neutral-light`.

**Use it** for bounded numeric settings with a unit (thresholds, intervals). **Inputs:** `min`, `max`, `step`, `unit`, `disabled`; a `ControlValueAccessor`.
""", f"""
<div class="pv"><div class="ss-row" style="width:380px">
  <input type="range" class="ss-slider" min="0" max="100" value="35" style="--ss-fill:35%">
  <div class="ss-box"><input class="ss-num" type="number" value="35"><span class="ss-unit">°C</span>
    <div class="ss-steppers"><button class="ss-step" type="button">{I("keyboard_arrow_up")}</button><button class="ss-step" type="button">{I("keyboard_arrow_down")}</button></div></div>
</div></div>
""")

card("SliderInput", "Forms", 90, """
# SliderInput
The older Material-based slider + number field (`tb-slider-input`) used by the TS302 sensor configuration widget: a `mat-slider` next to an outlined `mat-form-field` with a unit suffix and a warning icon tooltip on validation errors. It takes ThingsBoard's Material theme, not the `--c-*` tokens.

**Use** `SliderStepper` in any themed dashboard. Keep `SliderInput` only inside the legacy sensors widget, where Material styling is expected. **Inputs:** `min` (1), `max` (100), `step`, `placeholder` ("Set"), `required`, `allowNegative`, `allowExponential`, `unit`.

This card has no themed preview: the component renders with Angular Material inside ThingsBoard.
""", f"""
<div class="pv"><div class="ss-row" style="width:380px;opacity:.7">
  <input type="range" class="ss-slider" min="1" max="100" value="60" style="--ss-fill:60%">
  <div class="ss-box" style="width:106px"><input class="ss-num" type="number" value="60"><span class="ss-unit">%</span></div>
  <span style="font-size:12px;color:var(--c-text-neutral-light)">Material rendition in the host app</span>
</div></div>
""")

card("CopyBox", "Forms", 110, """
# CopyBox
A monospace value chip that is itself the copy button: 13px `mono` text in a `c-border-neutral-normal` box with page fill and 8px corners. A 28px slot on the right, split by a hairline, always reserves its width and fades in a 16px copy icon on hover; after copying it shows a green check (`c-bg-success-normal`) for `copiedDuration` (1.5s). `muted` greys the text (read-only ids), `inputSized` makes it 36px tall to line up with text fields, `fullWidth` stretches it, `copyValue` copies something other than the shown text.

**Use it** for device EUIs, hostnames, ids and anything a person will paste elsewhere, in tables (`copyable` column) and settings cards. **Don't** use it for editable values.
""", f"""
<div class="pv pv-col">
  <button class="tb-copy-box" type="button"><span class="tb-copy-text">a81758fffe0a1b2c</span><span class="tb-copy-btn">{I("content_copy")}</span></button>
  <button class="tb-copy-box" type="button"><span class="tb-copy-text">a81758fffe0a1b2c</span><span class="tb-copy-btn shown copied">{I("check")}</span></button>
  <button class="tb-copy-box tb-copy-box--full tb-copy-box--muted tb-copy-box--input" type="button" style="width:300px"><span class="tb-copy-text">ts302-cold-room-2.lab.local</span><span class="tb-copy-btn shown">{I("content_copy")}</span></button>
</div>
""")

card("InfoIcon", "Forms", 110, """
# InfoIcon
A 15px `info` glyph in `c-bg-brand-normal` with `cursor: help` that reveals a 12px tooltip pill above it on hover or focus, centred with a caret (`align="right"` anchors it to the icon's right edge for icons in a far-right column). Up to 220px wide, wrapping, `shadow-box-modal-normal`.

**Use it** beside a label, a card title or a chart caption to explain a value. **Don't** put essential instructions in it. **Inputs:** `text`, `align`.
""", f"""
<div class="pv pv-row" style="padding:64px 16px 16px 140px;gap:48px">
  <span style="font-size:13px;color:var(--c-text-neutral-light);display:inline-flex;gap:5px;align-items:center">Hysteresis <span class="ii">{I("info")}<span class="ii-tip shown">Degrees the reading must move back before the alarm clears.</span></span></span>
  <span style="font-size:13px;color:var(--c-text-neutral-light);display:inline-flex;gap:5px;align-items:center">Sampling <span class="ii">{I("info")}<span class="ii-tip">Minutes between readings.</span></span></span>
</div>
""")
