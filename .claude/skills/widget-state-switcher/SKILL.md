---
name: widget-state-switcher
description: "Renderable TB JSON template for the stateSwitcher widget. Pulled on-demand by dashboard-generator. Placeholders: <aliasUuid of stateEntity>, <defaultSubStateId>."
user-invocable: false
---

# stateSwitcher widget

Auto-injected in every `switcherDetail` state. Binds to the `stateEntity` alias and renders
the currently active sub-state. `defaultSubStateId` is the `stateId` of the first `navigationWidget`.
Position: `{ "row": 1, "col": 0, "sizeX": 24, "sizeY": 14 }`.

**Passive container — it never carries state-switching actions.** Its content updates because `subStateId` changed (driven by a sibling `navigationWidget`), not because anything was clicked on the container itself. `config.actions` MUST be `{}`. See the **State switching mechanism** section above.

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
      "entityAliasId": "<aliasUuid of stateEntity>",
      "dataKeys": [
        { "name": "name", "label": "Name", "type": "entityField", "color": "var(--tb-primary-500)", "settings": {} }
      ]
    }],
    "settings": {
      "useMarkdownTextFunction": true,
      "markdownTextFunction": "let subState = ctx.stateController.getStateParams().subStateId || \"<defaultSubStateId>\";\n\nreturn `<div tb-toast toastTarget=\"layout\" class=\"block\">\n            <tb-dashboard-state class=\"state\" [ctx]=\"ctx\" stateId=\"${subState}\" [syncParentStateParams]=\"true\"></tb-dashboard-state>\n        </div>`;",
      "applyDefaultMarkdownStyle": true,
      "markdownCss": ".block {\n    flex-grow: 1;\n    width: 100%;\n    height: 100%;\n    display: flex;\n    padding: 0;\n}\n\n.state {\n    flex-grow: 1;\n    padding: 0;\n    width: 100%;\n    height: 100%;\n}"
    },
    "actions": {}
  }
}
```

---
