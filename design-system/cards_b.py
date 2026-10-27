# Component cards, part B: filters, data, layout and overlays.
from cards_a import card, I

SEV = lambda cls, n: '<span class="al-severity %s">%s</span>' % (cls, "".join('<span class="seg%s"></span>' % (" on" if i < n else "") for i in range(4)))

card("FilterSection", "Filters", 150, """
# FilterSection
The frame around any sidebar filter: a divider on top (`c-border-neutral-light`, dark `c-border-neutral-normal`) with 8px above and 4px below it, a 24px heading row with the 11/600 title at the 8px filter inset and a 24px collapse chevron on the right, then the body 2px below. Collapsing hides the body (`display: none`) without destroying it, so the filter keeps its state. The first section can drop the divider; `grow` lets a section take the spare height when its filter list is expanded.

**Use it** around every sidebar filter so the sidebar reads as one column of aligned groups. **Inputs:** `heading`, `open` (two-way), `divider`, `grow`.
""", f"""
<div class="pv" style="width:300px;flex-direction:column;gap:0">
  <div class="tbfs"><div class="tbfs-header"><span class="tbfs-heading">Type</span><button class="tbfs-toggle" type="button">{I("expand_less")}</button></div>
    <div class="tbfs-body"><div class="tbcf-list"><button class="cb checked" type="button"><span class="cb-box">{I("check","cb-check")}</span><span class="cb-label">Temperature (18)</span></button><button class="cb" type="button"><span class="cb-box">{I("check","cb-check")}</span><span class="cb-label">Ambience (6)</span></button></div></div></div>
  <div class="tbfs tbfs-divider" style="margin-top:8px"><div class="tbfs-header"><span class="tbfs-heading">Markets</span><button class="tbfs-toggle" type="button">{I("expand_more")}</button></div><div class="tbfs-body tbfs-collapsed"></div></div>
</div>
""")

card("CheckFilter", "Filters", 150, """
# CheckFilter
A short checkbox group inside a `FilterSection`: rows of 16px checkbox + 13px/20px label at the 8px inset, 8px apart, the count in the label ("Online (21)"). It ends flush at its last row; the next section's divider sets the space.

**Use it** for three to eight fixed options (type, status, severity). Longer or searchable sets use `FilterList`. **Inputs:** `heading`, `divider`, `options: FilterListOption[]`, `selected: string[]`; `selectedChange`.
""", f"""
<div class="pv" style="width:300px"><div class="tbfs"><div class="tbfs-header"><span class="tbfs-heading">Status</span><button class="tbfs-toggle" type="button">{I("expand_less")}</button></div>
  <div class="tbfs-body"><div class="tbcf-list">
    <button class="cb checked" type="button"><span class="cb-box">{I("check","cb-check")}</span><span class="cb-label">Online (21)</span></button>
    <button class="cb checked" type="button"><span class="cb-box">{I("check","cb-check")}</span><span class="cb-label">Offline (3)</span></button>
    <button class="cb" type="button"><span class="cb-box">{I("check","cb-check")}</span><span class="cb-label">Alarming (2)</span></button>
    <button class="cb" type="button" disabled><span class="cb-box">{I("check","cb-check")}</span><span class="cb-label">Decommissioned (0)</span></button>
  </div></div></div></div>
""")

card("FilterList", "Filters", 330, """
# FilterList
The searchable sidebar filter: an outlined, transparent card (`c-border-neutral-light`, 8px corners) with a 32px search bar on top, an optional "Selected (n)" row that unfolds the selection as removable 26px chips, the option list (max 280px, scrolling) and a 32px footer with "Select all" / "Reset" links and a 24px expand box that lets the list take the sidebar's spare height. Multi-select rows are checkboxes; `multiple=false` turns them into 16px radios with a brand dot. Options with `children` form a tree: a 22px twisty chevron, hairline stems and elbows in `c-border-neutral-normal`, a tri-state parent box.

**Use it** for customers, sites, groups: anything long enough to search. **Inputs:** `heading`, `options`, `selected`, `searchPlaceholder`, `emptyText`, `multiple`, `expanded` (two-way); `selectedChange`.
""", f"""
<div class="pv" style="width:300px"><div class="tbfl"><div class="tbfl-heading">Customers</div><section class="tbfl-card">
  <label class="tbfl-search">{I("search")}<input placeholder="Search"></label>
  <div class="tbfl-selected"><button class="tbfl-selected-toggle open" type="button"><span>Selected (2)</span>{I("expand_more")}</button>
    <div class="tbfl-chips"><span class="tbfl-chip"><span class="tbfl-chip-label">Northgate Dairy</span><button class="tbfl-chip-remove" type="button">{I("close")}</button></span><span class="tbfl-chip"><span class="tbfl-chip-label">Site B</span><button class="tbfl-chip-remove" type="button">{I("close")}</button></span></div></div>
  <div class="tbfl-list">
    <div class="tbfl-option tbfl-stem"><button class="tbfl-twisty open" type="button">{I("chevron_right")}</button><button class="cb indeterminate" type="button"><span class="cb-box">{I("remove","cb-check")}</span><span class="cb-label">Northgate Dairy (4)</span></button></div>
    <div class="tbfl-option tbfl-child"><button class="cb checked" type="button"><span class="cb-box">{I("check","cb-check")}</span><span class="cb-label">Site A (2)</span></button></div>
    <div class="tbfl-option tbfl-child tbfl-last"><button class="cb" type="button"><span class="cb-box">{I("check","cb-check")}</span><span class="cb-label">Site B (2)</span></button></div>
    <div class="tbfl-option"><span class="tbfl-twisty-spacer"></span><button class="cb" type="button"><span class="cb-box">{I("check","cb-check")}</span><span class="cb-label">Riverside Labs (3)</span></button></div>
  </div>
  <div class="tbfl-footer"><div class="tbfl-links"><button class="tb-link" type="button">Select all</button><button class="tb-link" type="button">Reset</button></div><button class="tbfl-expand" type="button">{I("unfold_more")}</button></div>
</section></div></div>
""")

card("StatusPill", "Data", 130, """
# StatusPill
`tb-status-pill`: the one way to show a status word. 12/600 text, a 14px icon, a 1px border and a tinted fill. Tones take their text from the shared status scale: `success` (`c-bg-success-normal`), `warning`, `major`, `error`; `neutral` uses `c-text-pill-neutral` on `c-bg-neutral-light` (dark `c-bg-neutral-extralight-hover`); `brand` uses `c-text-brand-normal` on `c-bg-brand-light`. Variant `pill` is fully round (sm: 2px 10px 2px 7px, md: 4px 11px 4px 8px; even padding when text-only); `tag` is a 6px-cornered 500-weight label.

**Use it** for Online / Offline / Alarm / Syncing in tables, panel headers and card corners. Set the tone colours once in `status-pill.component.scss`, never per usage. **Inputs:** `tone`, `icon`, `variant`, `size`.
""", f"""
<div class="pv pv-col">
  <div class="pv-row">
    <span class="tbsp tbsp--success tbsp--pill tbsp--sm">{I("check_circle")}Online</span>
    <span class="tbsp tbsp--warning tbsp--pill tbsp--sm">{I("schedule")}Stale</span>
    <span class="tbsp tbsp--major tbsp--pill tbsp--sm">{I("warning")}Major</span>
    <span class="tbsp tbsp--error tbsp--pill tbsp--sm">{I("error")}Alarm</span>
    <span class="tbsp tbsp--neutral tbsp--pill tbsp--sm tbsp--text-only">Offline</span>
    <span class="tbsp tbsp--brand tbsp--pill tbsp--sm">{I("sync")}Syncing</span>
  </div>
  <div class="pv-row">
    <span class="tbsp tbsp--success tbsp--pill tbsp--md">{I("check_circle")}Online</span>
    <span class="tbsp tbsp--error tbsp--pill tbsp--md tbsp--text-only">2 alarms</span>
    <span class="tbsp tbsp--neutral tbsp--tag">TS302</span>
    <span class="tbsp tbsp--brand tbsp--tag">Shared</span>
    <span class="tbsp tbsp--warning tbsp--tag">Queued</span>
  </div>
</div>
""")

card("DataTable", "Data", 330, """
# DataTable
`tb-data-table`: every table in every dashboard. A flush card with a `WidgetHeader` (or a compact 14/700 title, or none), an optional search bar that pops under the header, a sticky header row of 12/500 uppercase letter-spaced `c-text-neutral-light` labels on a `c-border-neutral-light` rule, rows at least 40px (`$row-height`) with 6px/16px cell padding and 13px (`table.$table-text-size`) `c-text-neutral-heavy` text, and a 44px paginator. Rows wash `c-bg-hover-row` on hover; a selected row holds `c-bg-brand-light` (dark `c-bg-neutral-light`). Sortable headers show an arrow at 0.5 opacity on hover and solid on the sorted column. `multiSelect` adds a 20px brand checkbox column with select-all; `insetRowDivider` turns dividers into 16px-inset hairlines for single-column lists.

Built-in cells: plain text, `truncate`, two-line `subtitleKey`, `chip` (neutral or green-active), `copyable` (a `CopyBox`); custom cells via `<ng-template tbDataTableCell="key">`.

**Don't** add a per-table row height or text size; change `$row-height`, `$cell-padding-y` or `table.$table-text-size` for everyone. **Inputs:** `title`, `icon`, `columns: DataTableColumn[]`, `rows`, `loading`, `emptyText`, `emptyIcon`, `searchEnabled`, `showHeader`, `compactHeader`, `showColumnHeaders`, `insetRowDivider`, `rowHover`, `actions`, `pageSize`, `paginated`, `fitPageSize`, `selectable`, `selectedKey`, `multiSelect`, `fillHeight`, `fixedLayout`, `sortable`; `actionClick`, `rowClick`, `selectionChange`.
""", f"""
<div class="pv"><div class="dt-card" style="width:640px">
  <header class="wh-head"><div class="wh-left"><span class="wh-icon-badge">{I("sensors")}</span><div class="wh-titles"><span class="wh-title">Devices</span></div></div>
    <span class="wh-actions"><span class="tbtf"><span class="seg-group"><button class="seg-btn active" type="button">1D</button><button class="seg-btn" type="button">1W</button><button class="seg-btn" type="button">1M</button></span></span><button class="tb-icon-btn" type="button">{I("filter_list")}</button><button class="tb-icon-btn active" type="button">{I("search")}</button></span></header>
  <div class="dt-search">{I("search")}<input placeholder="Search" value="cold"><button class="tb-icon-btn" style="width:22px;height:22px" type="button">{I("close")}</button></div>
  <table class="dt-table">
    <tr><th class="dt-select-cell"><button class="dt-checkbox indeterminate" type="button">{I("remove")}</button></th><th><button class="dt-sort dt-sort--active" type="button"><span>Device</span>{I("arrow_upward","dt-sort-icon")}</button></th><th>Status</th><th>EUI</th><th class="dt-align-right"><button class="dt-sort" type="button"><span>Temp</span>{I("arrow_upward","dt-sort-icon")}</button></th><th></th></tr>
    <tr class="dt-row dt-row-clickable dt-row-selected"><td class="dt-select-cell"><button class="dt-checkbox checked" type="button">{I("check")}</button></td><td><div class="dt-primary"><div class="dt-primary-title">Cold room 2</div><div class="dt-primary-sub">Northgate Dairy</div></div></td><td><span class="tbsp tbsp--success tbsp--pill tbsp--sm">{I("check_circle")}Online</span></td><td><button class="tb-copy-box" type="button"><span class="tb-copy-text">a81758fffe0a1b2c</span><span class="tb-copy-btn">{I("content_copy")}</span></button></td><td class="dt-align-right">4.2 °C</td><td><button class="tb-icon-btn" type="button">{I("more_vert")}</button></td></tr>
    <tr class="dt-row dt-row-clickable"><td class="dt-select-cell"><button class="dt-checkbox" type="button">{I("check")}</button></td><td><div class="dt-primary"><div class="dt-primary-title">Cold room 3</div><div class="dt-primary-sub">Northgate Dairy</div></div></td><td><span class="tbsp tbsp--error tbsp--pill tbsp--sm">{I("error")}Alarm</span></td><td><button class="tb-copy-box" type="button"><span class="tb-copy-text">a81758fffe0a1b2d</span><span class="tb-copy-btn">{I("content_copy")}</span></button></td><td class="dt-align-right" style="color:var(--c-bg-error-normal)">11.8 °C</td><td><button class="tb-icon-btn" type="button">{I("more_vert")}</button></td></tr>
    <tr class="dt-row dt-row-clickable"><td class="dt-select-cell"><button class="dt-checkbox" type="button">{I("check")}</button></td><td><div class="dt-primary"><div class="dt-primary-title">Freezer A</div><div class="dt-primary-sub">Riverside Labs</div></div></td><td><span class="tbsp tbsp--neutral tbsp--pill tbsp--sm tbsp--text-only">Offline</span></td><td><button class="tb-copy-box" type="button"><span class="tb-copy-text">a81758fffe0a1c01</span><span class="tb-copy-btn">{I("content_copy")}</span></button></td><td class="dt-align-right" style="color:var(--c-text-neutral-semilight)">—</td><td><button class="tb-icon-btn" type="button">{I("more_vert")}</button></td></tr>
  </table>
  <div class="dt-paginator"><span class="dt-range">1 – 3 of 24</span><button class="tb-icon-btn" type="button" disabled>{I("first_page")}</button><button class="tb-icon-btn" type="button" disabled>{I("chevron_left")}</button><button class="tb-icon-btn" type="button">{I("chevron_right")}</button><button class="tb-icon-btn" type="button">{I("last_page")}</button></div>
</div></div>
""", width=680)

card("AlarmList", "Data", 300, """
# AlarmList
A severity filter row and a flush, header-less `DataTable` of alarms with inset dividers and no row hover. The filter is four equal outlined boxes, each a 1 to 4 segment severity bar with a tooltip pill below; hover and active borders turn `c-bg-brand-normal`. Each row is the alarm type (13px/20px), then a muted line with its severity bar, the time in `TB_DATE_AT_TIME` format and any details after a hairline, and a 32px clear icon button on the right (disabled once cleared). `grouped` renders one compact-titled card per originator.

The severity bar is the shared status scale: critical fills 4 red segments (`status.$error`), major 3 orange (`status.$major`), minor 2 yellow (`status.$warning`), warning 1 green (`status.$success`); empty segments are `c-border-neutral-normal`.

**Inputs:** `alarms: AlarmListItem[]`, `loading`, `grouped`; `clear` emits the alarm.
""", f"""
<div class="pv" style="padding-top:60px"><div class="al" style="width:420px">
  <div class="al-filter">
    <span class="al-filter-box tb-tip-host active">{SEV("critical",4)}<span class="tb-tip tb-tip--below shown">Critical</span></span>
    <span class="al-filter-box tb-tip-host">{SEV("major",3)}<span class="tb-tip tb-tip--below">Major</span></span>
    <span class="al-filter-box tb-tip-host">{SEV("minor",2)}<span class="tb-tip tb-tip--below">Minor</span></span>
    <span class="al-filter-box tb-tip-host">{SEV("warning",1)}<span class="tb-tip tb-tip--below">Warning</span></span>
  </div>
  <div class="dt-card dt-inset-divider" style="padding:10px 0"><table class="dt-table">
    <tr class="dt-row"><td><div class="al-cell"><div class="al-main"><div class="al-title">High temperature</div><div class="al-meta">{SEV("critical",4)}<span>Oct 27 at 9:14 AM</span><span class="al-divider"></span><span class="al-data">12.1 °C</span></div></div><button class="tb-icon-btn" type="button">{I("clear")}</button></div></td></tr>
    <tr class="dt-row"><td><div class="al-cell"><div class="al-main"><div class="al-title">Door open</div><div class="al-meta">{SEV("minor",2)}<span>Oct 27 at 8:02 AM</span></div></div><button class="tb-icon-btn" type="button">{I("clear")}</button></div></td></tr>
    <tr class="dt-row"><td><div class="al-cell"><div class="al-main"><div class="al-title">Low battery</div><div class="al-meta">{SEV("warning",1)}<span>Oct 26 at 11:40 PM</span><span class="al-divider"></span><span class="al-data">3.1 V</span></div></div><button class="tb-icon-btn" type="button" disabled>{I("clear")}</button></div></td></tr>
  </table></div>
</div></div>
""")

LINE_SVG = """<svg class="lc-chart" viewBox="0 0 560 200" preserveAspectRatio="none" aria-hidden="true">
  <line class="lc-grid" x1="40" x2="550" y1="30" y2="30"/><line class="lc-grid" x1="40" x2="550" y1="75" y2="75"/><line class="lc-grid" x1="40" x2="550" y1="120" y2="120"/><line class="lc-axisline" x1="40" x2="550" y1="165" y2="165"/>
  <text class="lc-axis" x="34" y="34" text-anchor="end">8</text><text class="lc-axis" x="34" y="79" text-anchor="end">6</text><text class="lc-axis" x="34" y="124" text-anchor="end">4</text><text class="lc-axis" x="34" y="169" text-anchor="end">2</text>
  <text class="lc-axis" x="40" y="186">00:00</text><text class="lc-axis" x="295" y="186" text-anchor="middle">12:00</text><text class="lc-axis" x="550" y="186" text-anchor="end">now</text>
  <line class="lc-threshold" x1="40" x2="550" y1="52" y2="52"/>
  <path class="lc-area--brand" d="M40,120 C90,110 120,135 170,118 S250,95 300,100 S380,70 430,80 S500,110 550,92 L550,165 L40,165 Z"/>
  <path class="lc-line lc-line--brand" d="M40,120 C90,110 120,135 170,118 S250,95 300,100 S380,70 430,80 S500,110 550,92"/>
  <path class="lc-line lc-line--purple" d="M40,140 C90,138 130,150 180,142 S260,120 310,128 S390,105 440,112 S500,130 550,118"/>
</svg>"""

card("LineChart", "Data", 290, """
# LineChart
`tb-line-chart`: the multi-series ECharts line chart behind every metric. A 12/500 caption with an optional info icon, then the plot: 1.5px lines in the series' colours (the brand blue first), optional area fills, dashed `c-border-neutral-light` split lines, `c-text-neutral-light` axis labels, dashed amber threshold lines (`#f59e0b` default), a bottom legend, and a frosted tooltip (page fill at 72 %, 8px blur, 8px corners). Loading shows a brand ring over a 60 % wash; empty shows "No data". Charts in a `syncGroup` share their crosshair.

**Inputs:** `series: LineChartSeries[]` (`name`, `color`, `data: TrendPoint[]`), `unit`, `loading`, `dark`, `height` (220px), `title`, `titleInfo`, `averageWindow`, `maxPoints`, `smooth`, `animated`, `showLegend`, `area`, `yDecimals`, `tooltipDateOnly`, `syncGroup`, `xMin`/`xMax`, `yMin`/`yMax`, `thresholds`, `emptyText`. The preview is a static drawing of the chart's styling.
""", f"""
<div class="pv"><div style="width:560px">
  <div class="lc-title"><span>Temperature</span><span class="ii">{I("info")}<span class="ii-tip">Probe reading, °C.</span></span></div>
  <div class="lc-plot">{LINE_SVG}</div>
  <div class="lc-legend"><span class="brand">Channel 1</span><span class="purple">Channel 2</span></div>
  <div style="margin-top:8px"><span class="lc-tooltip">Oct 27 at 9:00 AM &nbsp; <b>4.2 °C</b></span></div>
</div></div>
""")

card("TrendChart", "Data", 200, """
# TrendChart
A card-sized sparkline: a `WidgetHeader` (icon, title, and the current value as subtitle) floating over a full-bleed smooth ECharts area pinned to the card's bottom edge, clipped to the 8px corners, at least 168px tall. The line is the brand blue; `valueMode` shows the last point or the sum, `cumulative` accumulates, `chartType="bar"` switches to bars.

**Use it** for one headline quantity per card (consumption, flow, level). **Inputs:** `icon`, `title`, `unit`, `data: TrendPoint[]`, `loading`, `dark`, `valueMode`, `cumulative`, `chartType`.
""", f"""
<div class="pv"><section class="tc-card" style="width:360px;height:168px">
  <svg class="tc-chart" viewBox="0 0 360 168" preserveAspectRatio="none" aria-hidden="true">
    <path class="lc-area--brand" d="M0,120 C40,110 70,130 110,112 S180,85 220,95 S290,60 330,75 L360,70 L360,168 L0,168 Z"/>
    <path class="lc-line lc-line--brand" d="M0,120 C40,110 70,130 110,112 S180,85 220,95 S290,60 330,75 L360,70"/>
  </svg>
  <header class="wh-head tc-header"><div class="wh-left"><span class="wh-icon-badge">{I("water_drop")}</span><div class="wh-titles"><span class="wh-title">Consumption</span><span class="wh-subtitle">1 284 L today</span></div></div></header>
</section></div>
""")

card("MetricChartCard", "Data", 330, """
# MetricChartCard
A `CollapsibleCard` holding a `TimeframePicker` (1D | 1W | 1M, 12px under the title) and one or more `LineChart`s stacked with a 16px hairline between them, all 200px tall, smooth, sharing one crosshair group. It subscribes to the device's telemetry keys itself (`ctx`, `deviceId`), picks hourly or daily averages by window, and times out to the empty state after `loadTimeoutMs`.

**Use it** in the detail panel's Insights view, one card per metric family. **Inputs:** `ctx`, `deviceId`, `title` ("Metrics"), `dark`, `charts: MetricChartSection[]` (`chartTitle`, `info`, `unit`, `keys`, `showLegend`, `fill`, `yMin`/`yMax`, `thresholds`), `loadTimeoutMs`, `timeframe` (two-way).
""", f"""
<div class="pv"><section class="cc-card" style="width:386px">
  <button class="cc-header" type="button"><span class="cc-title">Metrics</span><span class="cc-spacer"></span>{I("expand_less","cc-chevron")}</button>
  <div class="cc-body-wrap expanded"><div class="cc-body">
    <span class="tbtf mcc-tf"><span class="seg-group"><button class="seg-btn active" type="button">1D</button><button class="seg-btn" type="button">1W</button><button class="seg-btn" type="button">1M</button></span></span>
    <div class="lc-title"><span>Temperature</span><span class="ii">{I("info")}<span class="ii-tip">Probe reading, °C.</span></span></div>
    <div class="lc-plot"><svg class="lc-chart" viewBox="0 0 354 120" preserveAspectRatio="none" aria-hidden="true"><line class="lc-grid" x1="30" x2="354" y1="20" y2="20"/><line class="lc-grid" x1="30" x2="354" y1="60" y2="60"/><line class="lc-axisline" x1="30" x2="354" y1="100" y2="100"/><text class="lc-axis" x="26" y="24" text-anchor="end">8</text><text class="lc-axis" x="26" y="104" text-anchor="end">2</text><path class="lc-area--brand" d="M30,70 C80,60 110,85 160,68 S240,45 290,52 S330,40 354,46 L354,100 L30,100 Z"/><path class="lc-line lc-line--brand" d="M30,70 C80,60 110,85 160,68 S240,45 290,52 S330,40 354,46"/></svg></div>
    <div class="mcc-divider"></div>
    <div class="lc-title"><span>Humidity</span></div>
    <div class="lc-plot"><svg class="lc-chart" viewBox="0 0 354 90" preserveAspectRatio="none" aria-hidden="true"><line class="lc-grid" x1="30" x2="354" y1="15" y2="15"/><line class="lc-axisline" x1="30" x2="354" y1="75" y2="75"/><text class="lc-axis" x="26" y="19" text-anchor="end">80</text><text class="lc-axis" x="26" y="79" text-anchor="end">40</text><path class="lc-line lc-line--brand" d="M30,40 C80,45 120,30 170,38 S250,55 300,48 S340,35 354,38"/></svg></div>
  </div></div>
</section></div>
""")

card("LorawanSignalCard", "Data", 300, """
# LorawanSignalCard
A preset `MetricChartCard` titled "Signal": RSSI on top (brand blue `#1e5dff`, dBm, "Received signal strength (dBm). Closer to 0 is stronger.") and SNR below (purple `#a855f7`, dB, "Signal-to-noise ratio (dB). Higher is better."), both filled, no legend, hourly averages for 1D / 1W and daily for 1M with the raw readings as fallback.

**Use it** on every LoRaWAN device's Insights view so signal reads the same across dashboards. **Inputs:** `ctx`, `deviceId`, `dark`, the six telemetry key overrides (`rssiKey`, `rssiDailyKey`, `rssiRawKey`, `snrKey`, `snrDailyKey`, `snrRawKey`), `timeframe` (two-way).
""", f"""
<div class="pv"><section class="cc-card" style="width:386px">
  <button class="cc-header" type="button"><span class="cc-title">Signal</span><span class="cc-spacer"></span>{I("expand_less","cc-chevron")}</button>
  <div class="cc-body-wrap expanded"><div class="cc-body">
    <span class="tbtf mcc-tf"><span class="seg-group"><button class="seg-btn active" type="button">1D</button><button class="seg-btn" type="button">1W</button><button class="seg-btn" type="button">1M</button></span></span>
    <div class="lc-title"><span>RSSI</span><span class="ii">{I("info")}<span class="ii-tip">Received signal strength (dBm). Closer to 0 is stronger.</span></span></div>
    <div class="lc-plot"><svg class="lc-chart" viewBox="0 0 354 100" preserveAspectRatio="none" aria-hidden="true"><line class="lc-grid" x1="34" x2="354" y1="15" y2="15"/><line class="lc-axisline" x1="34" x2="354" y1="80" y2="80"/><text class="lc-axis" x="30" y="19" text-anchor="end">-80</text><text class="lc-axis" x="30" y="84" text-anchor="end">-120</text><path class="lc-area--brand" d="M34,50 C80,45 120,60 170,48 S250,40 300,52 S340,44 354,46 L354,80 L34,80 Z"/><path class="lc-line lc-line--brand" d="M34,50 C80,45 120,60 170,48 S250,40 300,52 S340,44 354,46"/></svg></div>
    <div class="mcc-divider"></div>
    <div class="lc-title"><span>SNR</span><span class="ii">{I("info")}<span class="ii-tip">Signal-to-noise ratio (dB). Higher is better.</span></span></div>
    <div class="lc-plot"><svg class="lc-chart" viewBox="0 0 354 90" preserveAspectRatio="none" aria-hidden="true"><line class="lc-grid" x1="34" x2="354" y1="15" y2="15"/><line class="lc-axisline" x1="34" x2="354" y1="75" y2="75"/><text class="lc-axis" x="30" y="19" text-anchor="end">12</text><text class="lc-axis" x="30" y="79" text-anchor="end">-6</text><path class="lc-area--purple" d="M34,45 C80,50 120,35 170,42 S250,55 300,40 S340,38 354,44 L354,75 L34,75 Z"/><path class="lc-line lc-line--purple" d="M34,45 C80,50 120,35 170,42 S250,55 300,40 S340,38 354,44"/></svg></div>
  </div></div>
</section></div>
""")

card("MapCard", "Data", 300, """
# MapCard
A `WidgetHeader` over a Leaflet map clipped to the card. Controls are themed: the zoom pill (34px buttons, `c-bg-neutral-min`, 14px corners, `shadow-box-panel-normal`), a 34px circular layers button that opens a horizontal panel of 76×48 map-type thumbnails (Roadmap, Satellite, Hybrid, the selected one ringed `c-border-brand-normal`), and a recenter button. Markers are 26px brand circles with a white glyph; clusters a 28px brand circle with a count and a 25 % halo; labels a frosted pill. In dark mode the roadmap tiles are inverted and dimmed over `#0d2743`.

**Inputs:** `title` ("Map"), `icon`, `emptyText`, `markerIcon` (`water_drop`), `mapHeight` (320px), `locations: MapLocation[]`, `dark`, `mapType`, `headerActions`; `mapTypeChange`, `headerActionClick`. The preview stands in for the tiles.
""", f"""
<div class="pv"><section class="map-card" style="width:480px">
  <header class="wh-head"><div class="wh-left"><span class="wh-icon-badge">{I("location_on")}</span><div class="wh-titles"><span class="wh-title">Map</span></div></div><span class="wh-actions"><button class="tb-icon-btn" type="button">{I("fullscreen")}</button></span></header>
  <div class="map-body"><div class="map-canvas" style="height:220px;background:repeating-linear-gradient(0deg,transparent 0 39px,var(--c-border-neutral-light) 39px 40px),repeating-linear-gradient(90deg,transparent 0 39px,var(--c-border-neutral-light) 39px 40px),var(--c-bg-neutral-light)"></div>
    <div class="map-zoom"><button type="button">+</button><button type="button">−</button></div>
    <div class="map-layers"><div class="map-layers-control"><button class="map-ctrl-btn active" type="button">{I("layers")}</button>
      <div class="map-layers-panel"><button class="map-type selected" type="button"><span class="map-type-label">Roadmap</span></button><button class="map-type" type="button" style="background:#2f3b2d"><span class="map-type-label">Satellite</span></button><button class="map-type" type="button" style="background:#3a4a3a"><span class="map-type-label">Hybrid</span></button><button class="tb-icon-btn" style="width:24px;height:24px" type="button">{I("close")}</button></div></div>
      <button class="map-ctrl-btn" type="button">{I("recenter")}</button></div>
    <span class="tbm-marker-pin" style="left:300px;top:70px">{I("water_drop")}</span>
    <span class="tbm-tooltip" style="left:334px;top:72px">Cold room 2</span>
    <span class="tbm-cluster-inner" style="left:380px;top:150px">7</span>
  </div>
</section></div>
""")

card("SidebarLayout", "Layout", 240, """
# SidebarLayout
`tb-sidebar-layout`: a 300px filter sidebar (projected into `[sidebar]`) and a main column 16px apart. The sidebar stacks its children 10px apart, scrolls, and carries a hairline on its right edge; closing it animates its width to 0 and fades it over `motion.$expand-duration`. Both columns are flex columns with a 10px gap.

**Use it** as the body of every dashboard under the top bar. **Inputs:** `open` (default true), `width` (300).
""", f"""
<div class="pv"><div class="sl" style="width:600px;height:200px">
  <div class="sl-sidebar-wrap" style="width:220px"><div class="sl-sidebar">
    <div class="tbfs"><div class="tbfs-header"><span class="tbfs-heading">Type</span><button class="tbfs-toggle" type="button">{I("expand_less")}</button></div><div class="tbfs-body"><div class="tbcf-list"><button class="cb checked" type="button"><span class="cb-box">{I("check","cb-check")}</span><span class="cb-label">Temperature (18)</span></button><button class="cb" type="button"><span class="cb-box">{I("check","cb-check")}</span><span class="cb-label">Ambience (6)</span></button></div></div></div>
    <div class="tbfs tbfs-divider" style="margin-top:8px"><div class="tbfs-header"><span class="tbfs-heading">Customers</span><button class="tbfs-toggle" type="button">{I("expand_more")}</button></div></div>
  </div></div>
  <div class="sl-main"><div class="tb-card" style="flex:1 1 auto"><div class="pv-label">Main column</div></div><div class="tb-card" style="flex:1 1 auto"><div class="pv-label">Cards 10px apart</div></div></div>
</div></div>
""")

card("DetailPanel", "Layout", 300, """
# DetailPanel
A 386px drawer pinned to the dashboard root's right edge (so it fits the dashboard, not the viewport), page-coloured with a left hairline and `shadow-panel-light` / `shadow-panel-dark`, sliding in over 0.25s. Header: 14px 16px padding, a 16/600 title (or custom `[dp-title]` content), optional `[dp-header-actions]` such as a status pill, and a 32px close icon button. An optional non-scrolling `[dp-tabs]` region, then a scrolling body padded 10px 16px that stacks cards 10px apart (`flushBody` drops the top padding). `dismissible` adds a 25 % scrim that closes on click; Escape always closes.

**Inputs:** `open`, `title`, `dismissible`, `flushBody`; `closed`, `afterClosed`. The native `title` attribute is stripped.
""", f"""
<div class="pv" style="padding:0"><div class="pv-stage" style="width:620px;height:280px">
  <div style="padding:16px;color:var(--c-text-neutral-light);font-size:12px">Dashboard root</div>
  <div class="dp-backdrop"></div>
  <div class="dp-panel">
    <div class="dp-header"><div class="dp-title-area"><span class="dp-title">Edit 4 devices</span></div><span class="tbsp tbsp--brand tbsp--pill tbsp--sm tbsp--text-only">Bulk</span><button class="tb-icon-btn" type="button">{I("close")}</button></div>
    <div class="dp-body"><div class="tb-card"><div class="pv-label">Card</div></div><div class="tb-card"><div class="pv-label">Card</div></div></div>
  </div>
</div></div>
""", width=640)

card("EntityDetailPanel", "Layout", 320, """
# EntityDetailPanel
A `DetailPanel` for one entity: the header is a 40px brand icon badge (10px corners, 22px filled icon) beside the 15/600 name and a 12px muted subtitle (its id or type), with `[header-actions]` for a status pill. Below the header a full-width `SegmentedControl` switches Insights / Alarms / Settings (hidden when there is one tab); each view's content is projected into `[insights]`, `[alarms]`, `[settings]` or `[tab-content]` and kept mounted, with a muted placeholder ("Alarms coming soon") when nothing is projected.

**Inputs:** `open`, `icon` (`sensors`), `name`, `subtitle`, `tabs: SegmentOption[]`, `dismissible`, `flushBody`, `initialTab`; `closed`, `afterClosed`, `activeTabChange`.
""", f"""
<div class="pv" style="padding:0"><div class="pv-stage" style="width:620px;height:300px">
  <div class="dp-panel">
    <div class="dp-header"><div class="dp-title-area"><div class="edp-summary"><div class="edp-badge">{I("thermostat")}</div><div><div class="edp-name">Cold room 2</div><div class="edp-sub">TS302 · a81758fffe0a1b2c</div></div></div></div><span class="tbsp tbsp--success tbsp--pill tbsp--sm">{I("check_circle")}Online</span><button class="tb-icon-btn" type="button">{I("close")}</button></div>
    <div class="dp-tabs"><div class="seg-group seg-full"><button class="seg-btn seg-icon-btn active" type="button">{I("insights")}<span class="seg-inline-label">Insights</span></button><button class="seg-btn seg-icon-btn" type="button"><span class="seg-icon-wrap">{I("notifications")}<span class="seg-badge">1</span></span></button><button class="seg-btn seg-icon-btn" type="button">{I("settings")}</button></div></div>
    <div class="dp-body"><div class="tb-card"><div class="pv-label">Battery</div><div style="margin-top:6px;font-size:14px;font-weight:700">92 %</div></div><div class="cc-card"><button class="cc-header" type="button"><span class="cc-title">Metrics</span><span class="cc-spacer"></span>{I("expand_less","cc-chevron")}</button></div></div>
  </div>
</div></div>
""", width=640)

card("DeviceSettingsCard", "Layout", 420, """
# DeviceSettingsCard
The Settings view of a device (or several, in bulk): a stack of cards 10px apart. An identity `Card` (hostname as a muted input-sized `CopyBox`, a label field, group chips, a note textarea), a `CollapsibleCard` per attribute select group, one for the shared-scope settings (checkbox toggles two-up, button groups on one row, selects, numbers, slider steppers), and one per JSON-object attribute (Calibration, Alarms): a 12/700 muted section title, then each object as a heading `Switch` gating its fields, which unfold behind a 1px left rule (7px in, 16px padding) with the shared 0.25s grid animation. Bulk editing swaps checkboxes to tri-state and adds a "Disable" box beside each gate. Once the form is dirty a floating Cancel / Apply changes pair appears bottom-right of the panel.

**Inputs:** `ctx`, `deviceId`, `hostname`, `label`, `description`, `attributeSelects`, `attributeCardTitle`, `attributeValues`, `deviceSettings: DeviceSettingControl[]`, `deviceSettingsTitle`, `deviceSettingsValues`, `syncStateKey`, `downlinkQueueKey`, `downlinkQueue`, `bulkDeviceIds`, `bulkDownlinkQueues`, `objectCards: DeviceSettingObjectCard[]`, `objectValues`.
""", f"""
<div class="pv"><div style="position:relative;width:386px"><div class="ds-cards">
  <div class="tb-card"><div class="ds-form">
    <div class="ds-field"><span class="ds-label">Name</span><button class="tb-copy-box tb-copy-box--full tb-copy-box--muted tb-copy-box--input" type="button"><span class="tb-copy-text">ts302-cold-room-2</span><span class="tb-copy-btn">{I("content_copy")}</span></button></div>
    <div class="ds-field"><span class="ds-label">Name (Label)</span><input class="ds-input" value="Cold room 2"></div>
    <div class="ds-field"><span class="ds-label">Groups</span><div class="ds-groups"><span class="ds-group-chip">Northgate Dairy</span><span class="ds-group-chip">Cold chain</span></div></div>
  </div></div>
  <section class="cc-card"><button class="cc-header" type="button"><span class="cc-title">Device settings</span><span class="cc-spacer"></span>{I("expand_less","cc-chevron")}</button>
    <div class="cc-body-wrap expanded"><div class="cc-body"><div class="ds-form">
      <div class="ds-toggle-grid"><button class="cb checked" type="button"><span class="cb-box">{I("check","cb-check")}</span><span class="cb-label">Report battery</span></button><button class="cb" type="button"><span class="cb-box">{I("check","cb-check")}</span><span class="cb-label">Confirmed uplinks</span></button></div>
      <div class="ds-segmented-row"><div class="ds-field"><span class="ds-label">Unit</span><div class="bg-group"><button class="bg-btn active" type="button">°C</button><button class="bg-btn" type="button">°F</button></div></div><div class="ds-field"><span class="ds-label">Time format</span><div class="bg-group"><button class="bg-btn" type="button">12h</button><button class="bg-btn active" type="button">24h</button></div></div></div>
    </div></div></div></section>
  <section class="cc-card"><button class="cc-header" type="button"><span class="cc-title">Alarms</span><span class="cc-spacer"></span>{I("expand_less","cc-chevron")}</button>
    <div class="cc-body-wrap expanded"><div class="cc-body"><div class="ds-form"><div class="ds-object-section"><span class="ds-section-title">Channel 1</span>
      <div class="ds-object"><div class="ds-gate-row"><button class="sw checked" type="button"><span class="sw-track"><span class="sw-thumb"></span></span><span class="sw-label sw-label--heading">Threshold alarm</span></button></div>
        <div class="ds-object-body"><div class="ds-field"><span class="ds-label">High threshold</span><div class="ss-row"><input type="range" class="ss-slider" min="-40" max="80" value="8" style="--ss-fill:40%"><div class="ss-box"><input class="ss-num" type="number" value="8"><span class="ss-unit">°C</span><div class="ss-steppers"><button class="ss-step" type="button">{I("keyboard_arrow_up")}</button><button class="ss-step" type="button">{I("keyboard_arrow_down")}</button></div></div></div></div></div></div>
      <div class="ds-object"><div class="ds-gate-row"><button class="sw" type="button"><span class="sw-track"><span class="sw-thumb"></span></span><span class="sw-label sw-label--heading">Mutation alarm</span></button></div></div>
    </div></div></div></div></section>
</div>
<div class="ds-actions" style="position:absolute;right:0;bottom:-44px"><button class="tb-btn tb-btn--ghost" type="button">Cancel</button><button class="tb-btn tb-btn--primary" type="button">Apply changes</button></div>
</div></div>
""")

card("ConfirmDialog", "Layout", 260, """
# ConfirmDialog
`tb-ext-confirm-dialog`: a 420px card (20px 24px padding, page fill, `shadow-box-modal-normal`) centred over a 40 % scrim that covers the dashboard root, above the side panels, scaling in from 0.97 over 0.14s. A 16/600 heading, a 14px/20px `c-text-neutral-semilight` message, and a right-aligned ghost Cancel beside a primary confirm, which turns danger red for destructive actions. Click-off and Escape cancel.

**Use it** for every confirmation; never `ctx.dialogs.confirm`, which opens outside the themed root. **Inputs:** `open`, `heading`, `message`, `confirmLabel` ("Confirm"), `cancelLabel` ("Cancel"), `danger`; `confirmed`, `cancelled`.
""", f"""
<div class="pv" style="padding:0"><div class="pv-stage" style="width:620px;height:240px">
  <div class="tbcd-backdrop"></div>
  <div class="tbcd-dialog"><h2 class="tbcd-heading">Clear alarm?</h2><p class="tbcd-message">The alarm will be cleared on the device and removed from the list. This cannot be undone.</p>
    <div class="tbcd-actions"><button class="tb-btn tb-btn--ghost" type="button">Cancel</button><button class="tb-btn tb-btn--danger" type="button">Clear alarm</button></div></div>
</div></div>
""", width=640)

def month(title, cells):
    out = f'<div class="tbdr-month"><div class="tbdr-month-title">{title}</div><div class="tbdr-grid">' + "".join(f'<span class="tbdr-weekday">{w}</span>' for w in "Su Mo Tu We Th Fr Sa".split())
    for c in cells:
        if c is None:
            out += '<span class="tbdr-cell"></span>'
        else:
            d, cls, dcls = c
            out += f'<span class="tbdr-cell {cls}"><button class="tbdr-day {dcls}" type="button">{d}</button></span>'
    return out + "</div></div>"

sep = [None]*3 + [(d, "", "") for d in range(1, 15)] + [(15, "range-start", "edge")] + [(d, "in-range", "in") for d in range(16, 31)]
octo = [None]*2 + [(d, "in-range", "in") for d in range(1, 12)] + [(12, "range-end", "edge")] + [(d, "", "") for d in range(13, 28)] + [(d, "", "disabled") for d in range(28, 32)]
octo_html = month("October 2026", octo).replace('class="tbdr-day disabled"', 'class="tbdr-day" disabled')

card("DateRangePicker", "Layout", 420, """
# DateRangePicker
The calendar behind a `TimeframePicker`'s custom segment, positioned against the dashboard root with its left edge at the anchor. A flush card with `shadow-box-modal-normal`: two months side by side (32px cells, 13px, 28px round day buttons; the range is a 22 % brand band with solid `c-bg-brand-normal` edge days and `c-text-brand-normal` days between; future days are disabled at 0.5), a column of quick ranges on the right behind a hairline, then "Starts at" / "Ends at" fields in 32px boxes with 6px corners set in Inter with tabular digits: MM / DD / YYYY segments and an hour : minute pair with stacked steppers and an AM/PM `Select`. A focused segment is a solid `c-text-brand-semilight` block with white digits. Ghost Cancel and primary Apply close it.

**Inputs:** `open`, `anchor: HTMLElement`, `range: TbDateRange` (`start`, `end` ms); `applied`, `cancelled`.
""", f"""
<div class="pv"><div class="tbdr">
  <div class="tbdr-main"><div class="tbdr-cal"><button class="tbdr-nav tbdr-prev" type="button">{I("chevron_left")}</button><button class="tbdr-nav tbdr-next" type="button" disabled>{I("chevron_right")}</button>
    {month("September 2026", sep)}{octo_html}
  </div>
  <div class="tbdr-presets"><button class="tbdr-preset" type="button">Last 24 hours</button><button class="tbdr-preset" type="button">Last 7 days</button><button class="tbdr-preset" type="button">Last 30 days</button><button class="tbdr-preset" type="button">This month</button></div></div>
  <div class="tbdr-fields">
    <div class="tbdr-field"><span class="tbdr-label">Starts at</span><label class="tbdr-box tbdr-date">{I("calendar_month")}<span class="tbdr-seg">09</span><span class="tbdr-sep">/</span><span class="tbdr-seg">15</span><span class="tbdr-sep">/</span><span class="tbdr-seg tbdr-seg-year">2026</span></label>
      <div class="tbdr-time"><label class="tbdr-box tbdr-stepper"><span class="tbdr-seg focus">09</span><span class="tbdr-steps"><button type="button">{I("expand_less")}</button><button type="button">{I("expand_more")}</button></span></label><span class="tbdr-colon">:</span><label class="tbdr-box tbdr-stepper"><span class="tbdr-seg">00</span><span class="tbdr-steps"><button type="button">{I("expand_less")}</button><button type="button">{I("expand_more")}</button></span></label><div class="tbs tbdr-meridiem"><button class="tbs-trigger" type="button"><span class="tbs-value">AM</span>{I("expand_more","tbs-chevron")}</button></div></div></div>
    <div class="tbdr-field"><span class="tbdr-label">Ends at</span><label class="tbdr-box tbdr-date">{I("calendar_month")}<span class="tbdr-seg">10</span><span class="tbdr-sep">/</span><span class="tbdr-seg">12</span><span class="tbdr-sep">/</span><span class="tbdr-seg tbdr-seg-year">2026</span></label>
      <div class="tbdr-time"><label class="tbdr-box tbdr-stepper"><span class="tbdr-seg">05</span><span class="tbdr-steps"><button type="button">{I("expand_less")}</button><button type="button">{I("expand_more")}</button></span></label><span class="tbdr-colon">:</span><label class="tbdr-box tbdr-stepper"><span class="tbdr-seg">30</span><span class="tbdr-steps"><button type="button">{I("expand_less")}</button><button type="button">{I("expand_more")}</button></span></label><div class="tbs tbdr-meridiem"><button class="tbs-trigger" type="button"><span class="tbs-value">PM</span>{I("expand_more","tbs-chevron")}</button></div></div></div>
  </div>
  <div class="tbdr-actions"><button class="tb-btn tb-btn--ghost" type="button">Cancel</button><button class="tb-btn tb-btn--primary" type="button">Apply</button></div>
</div></div>
""", width=820)
