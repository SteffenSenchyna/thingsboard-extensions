---
name: widget-header-card
description: "Renderable TB JSON template for the headerCard widget. Pulled on-demand by dashboard-generator. Placeholders: <aliasUuid of the stateEntity datasource>."
user-invocable: false
---

# headerCard widget

Shows the selected entity's name (and optionally address) as a page title banner.
`pattern` is a markdown string using `${entityName}` and optionally `${address}`.

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
    "widgetStyle": {},
    "enableFullscreen": false,
    "enableDataExport": false,
    "showTitle": false,
    "padding": "0px",
    "backgroundColor": "#FFFFFF00",
    "datasources": [{
      "type": "entity",
      "entityAliasId": "<aliasUuid of the stateEntity datasource>",
      "dataKeys": [
        { "name": "name", "label": "Name", "type": "entityField", "color": "var(--tb-primary-500)", "settings": {} }
      ]
    }],
    "settings": {
      "useMarkdownTextFunction": false,
      "markdownTextPattern": "**${Name}**",
      "applyDefaultMarkdownStyle": true,
      "markdownCss": ".tb-markdown-view p { display: flex; margin: 0; align-items: center; height: 100%; font-size: 28px; font-weight: 500; color: #212121; padding: 0; }"
    },
    "actions": {}
  }
}
```

---
