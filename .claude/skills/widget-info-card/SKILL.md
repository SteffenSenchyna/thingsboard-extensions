---
name: widget-info-card
description: "Renderable TB JSON template for the infoCard widget. Pulled on-demand by dashboard-generator. Placeholders: <aliasUuid>, <key>, <Label>, <entityField|attribute|timeseries>, <key2>, <Label2>."
user-invocable: false
---

# infoCard widget

Multi-key labeled summary panel. `dataKeys` lists every key referenced in the rendered content (4–5 max).

`infoCard` content has two mutually exclusive modes — `useMarkdownTextFunction` picks between them. Pick **pattern** by default; use **function** only when you need conditional formatting that pure substitution can't express.

**Mode A — Markdown/HTML pattern** (`useMarkdownTextFunction: false`)

`markdownTextPattern` is a string of markdown or HTML with `${...}` substitutions. Each placeholder resolves at render time:

- `${entityName}` → the datasource entity's name (always available, no `dataKeys` entry needed).
- `${<KeyLabel>}` or `${<keyName>}` → the latest value of a key listed in `dataKeys`. Match the `label` (or the `name` when label is omitted) exactly — placeholders that don't match a declared key render empty.
- Use `\n\n` to separate paragraphs in markdown; use `<br/>` inside a paragraph.

Example pattern: `"**Location**: ${location}\n\n**Model**: ${model}"`.

**Mode B — Markdown/HTML value function** (`useMarkdownTextFunction: true`)

`markdownTextFunction` is the **body** of a JS function with signature `(data, ctx) => string`. It must `return` a markdown or HTML string.

- `data: FormattedData[]` — one entry per resolved datasource entity. Each entry exposes basic entity properties (`entityId`, `entityName`) plus every key declared in `dataKeys` (by both its `name` and its `label`, e.g. `data[0]['First name']` and `data[0].firstName` both work).
- `ctx: WidgetContext` — the widget context, with access to dashboard state, timewindow, services, etc.

Example function body: `"return '# Some title\\n - Entity name: ' + data[0]['entityName'];"`.

Use a function over a pattern when you need branching (e.g. show a different label depending on a status value, or fall back to a second key when the first is empty).

**Settings fields** (all four can appear in the same `settings` object; the inactive mode's field is ignored but doesn't have to be removed):

```json
"settings": {
  "useMarkdownTextFunction": false,
  "markdownTextPattern": "**Location**: ${location}\n\n**Model**: ${model}",
  "markdownTextFunction": "return '# Some title\\n - Entity name: ' + data[0]['entityName'];",
  "applyDefaultMarkdownStyle": true,
  "markdownCss": ".m { color: red; }"
}
```

- `applyDefaultMarkdownStyle: true` — applies the built-in markdown stylesheet (paragraph spacing, font sizes). Keep `true` unless `markdownCss` fully styles the content.
- `markdownCss` — extra CSS rules layered on top. Selectors are scoped to the widget's markdown container. Omit (or empty string) when no custom styling is needed.

Full widget body:

```json
{
  "id": "<widgetUuid>",
  "type": "latest",
  "typeFullFqn": "system.cards.markdown_card",
  "sizeX": <N>, "sizeY": <N>, "row": <N>, "col": <N>,
  "config": {
    "configMode": "basic",
    "title": "",
    "dropShadow": false,
    "borderRadius": "8px",
    "widgetStyle": { "box-shadow": "0px 2px 4px 0px #00000024;" },
    "enableFullscreen": false,
    "enableDataExport": false,
    "showTitle": false,
    "padding": "10px",
    "datasources": [{
      "type": "entity",
      "entityAliasId": "<aliasUuid>",
      "dataKeys": [
        { "name": "<key>", "label": "<Label>", "type": "<entityField|attribute|timeseries>", "color": "#4caf50", "settings": {} }
      ]
    }],
    "settings": {
      "useMarkdownTextFunction": false,
      "markdownTextPattern": "**<Label>**: ${<key>}\n\n**<Label2>**: ${<key2>}",
      "applyDefaultMarkdownStyle": true
    },
    "actions": {}
  }
}
```

---
