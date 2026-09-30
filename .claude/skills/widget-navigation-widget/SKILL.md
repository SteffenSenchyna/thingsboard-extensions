---
name: widget-navigation-widget
description: "Renderable TB JSON template for the navigationWidget widget. Pulled on-demand by dashboard-generator. Placeholders: <Tab label, e.g. Overview>, <Tab label>, <stateId>, <fresh-uuid>."
user-invocable: false
---

# navigationWidget widget

Tab button that switches the `subStateId` param. One per sibling state in a `switcherDetail`.
`stateId` is the target sibling state id (e.g. `"sensor-overview"`).

**The only widget allowed to switch sub-states inside a `switcherDetail`** — see the **State switching mechanism** section above. Sub-state changes from any other widget class are a hard error.

**REQUIRED PAIR — a navigationWidget is useless without a `stateSwitcher`.** The nav tabs only set the `subStateId` param; the `stateSwitcher` is the one widget that actually *renders* the selected sub-state. When you add navigationWidgets to a `switcherDetail`, you MUST also add **exactly one** `stateSwitcher` to the same state (pull `widget-state-switcher`, position `{ row: 1, col: 0, sizeX: 24, sizeY: 14 }`, `defaultSubStateId` = the first nav tab's `stateId`). Omit it and the tabs change the param but nothing on screen changes — the tabs look broken. Adding nav tabs and the stateSwitcher is one step, not two.

```json
{
  "id": "<widgetUuid>",
  "type": "latest",
  "typeFullFqn": "system.action_button",
  "sizeX": <N>, "sizeY": <N>, "row": <N>, "col": <N>,
  "config": {
    "configMode": "basic",
    "title": "<Tab label, e.g. Overview>",
    "dropShadow": false,
    "borderRadius": "8px",
    "widgetStyle": {},
    "enableFullscreen": false,
    "enableDataExport": false,
    "showTitle": false,
    "padding": "0px",
    "backgroundColor": "#FFFFFF00",
    "datasources": [],
    "settings": {
      "appearance": {
        "type": "outlined",
        "showLabel": true,
        "label": "<Tab label>",
        "showIcon": false,
        "icon": "",
        "mainColor": "var(--tb-primary-500)",
        "backgroundColor": "#FFFFFF00",
        "customStyle": {}
      },
      "activatedState": {
        "action": "GET_DASHBOARD_STATE_OBJECT",
        "defaultValue": false,
        "dataToValue": {
          "type": "FUNCTION",
          "compareToValue": true,
          "dataToValueFunction": "return data.params.subStateId === \"<stateId>\";"
        }
      },
      "disabledState": { "action": "DO_NOTHING" }
    },
    "actions": {
      "click": [{
        "type": "custom",
        "id": "<fresh-uuid>",
        "name": "Navigate",
        "icon": "edit",
        "customFunction": "let params = widgetContext.stateController.getStateParams();\n\nparams.subStateId = \"<stateId>\";\n\nwidgetContext.stateController.updateState(widgetContext.stateController.getStateId(), params);\nwidgetContext.updateAliases();"
      }]
    }
  }
}
```

---
