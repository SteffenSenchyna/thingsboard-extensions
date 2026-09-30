---
name: widget-horizontal-value-card
description: "Renderable TB JSON template for the horizontalValueCard widget. Pulled on-demand by dashboard-generator. Placeholders: <metric label>, <°C>, <aliasUuid>, <key>, <timeseries|attribute|entityField>, <material-icon-name, e.g. thermostat>."
user-invocable: false
---

# horizontalValueCard widget

Latest value strip card. `keyType` is `"timeseries"`, `"attribute"`, or `"entityField"`.

```json
{
  "id": "<widgetUuid>",
  "type": "latest",
  "typeFullFqn": "system.cards.horizontal_value_card",
  "sizeX": <N>, "sizeY": <N>, "row": <N>, "col": <N>,
  "config": {
    "configMode": "basic",
    "title": "<metric label>",
    "dropShadow": false,
    "borderRadius": "8px",
    "widgetStyle": { "box-shadow": "0px 2px 4px 0px #00000024;" },
    "enableFullscreen": false,
    "enableDataExport": false,
    "showTitle": false,
    "padding": "0px",
    "margin": "0px",
    "units": "<°C>",
    "decimals": 1,
    "widgetCss": "tb-icon { display: inline-flex; justify-content: center; align-items: center; border-radius: 50%; width: 40px!important; height: 40px!important; background-color: var(--tb-primary-50); }\n.tb-value-card-icon-row { width: 50%; justify-content: space-between; }",
    "datasources": [{
      "type": "entity",
      "entityAliasId": "<aliasUuid>",
      "dataKeys": [{
        "name": "<key>",
        "label": "<metric label>",
        "type": "<timeseries|attribute|entityField>",
        "color": "var(--tb-primary-500)",
        "units": "<°C>",
        "decimals": 1,
        "settings": {}
      }]
    }],
    "settings": {
      "layout": "horizontal",
      "showLabel": true,
      "labelColor": { "type": "constant", "color": "#000000DE" },
      "showIcon": true,
      "icon": "<material-icon-name, e.g. thermostat>",
      "iconColor": { "type": "constant", "color": "var(--tb-primary-500)" },
      "iconSize": 24,
      "iconSizeUnit": "px",
      "valueColor": { "type": "constant", "color": "#000000DE" },
      "valueFont": { "size": 30 },
      "labelFont": { "size": 20 },
      "showDate": false,
      "autoScale": true
    },
    "actions": {}
  }
}
```

Omit `units` and `decimals` from config and dataKey when they are not applicable.

---
