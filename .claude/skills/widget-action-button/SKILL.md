---
name: widget-action-button
description: "Renderable TB JSON template for the actionButton widget. Pulled on-demand by dashboard-generator. Placeholders: <label>, <aliasUuid>."
user-invocable: false
---

# actionButton widget

Trigger button for CRUD dialogs. All actions go to the `click` slot.

```json
{
  "id": "<widgetUuid>",
  "type": "latest",
  "typeFullFqn": "system.action_button",
  "sizeX": <N>, "sizeY": <N>, "row": <N>, "col": <N>,
  "config": {
    "configMode": "basic",
    "title": "<label>",
    "dropShadow": false,
    "borderRadius": "8px",
    "widgetStyle": {},
    "enableFullscreen": false,
    "enableDataExport": false,
    "showTitle": false,
    "padding": "0px",
    "datasources": [{
      "type": "entity",
      "entityAliasId": "<aliasUuid>",
      "dataKeys": [{ "name": "name", "label": "Name", "type": "entityField", "color": "var(--tb-primary-500)", "settings": {}}]
    }],
    "settings": {
      "appearance": {
        "type": "filled",
        "showLabel": false,
        "label": "<label>",
        "showIcon": true,
        "icon": "settings",
        "mainColor": "var(--tb-primary-500)",
        "backgroundColor": "#FFFFFF",
        "customStyle": {}
      },
      "activatedState": { "action": "DO_NOTHING", "defaultValue": false },
      "disabledState":  { "action": "DO_NOTHING", "defaultValue": false }
    },
    "actions": {
      "click": [ <action body> ]
    }
  }
}
```

---
