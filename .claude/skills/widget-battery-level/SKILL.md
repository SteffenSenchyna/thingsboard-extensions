---
name: widget-battery-level
description: "Renderable TB JSON template for the batteryLevel widget. Pulled on-demand by dashboard-generator. Placeholders: <aliasUuid>, <batteryLevel>, <Battery Level>."
user-invocable: false
---

# batteryLevel widget

```json
{
  "id": "<widgetUuid>",
  "type": "latest",
  "typeFullFqn": "system.battery_level",
  "sizeX": <N>, "sizeY": <N>, "row": <N>, "col": <N>,
  "config": {
    "configMode": "basic",
    "title": "Battery",
    "dropShadow": false,
    "borderRadius": "8px",
    "widgetStyle": { "box-shadow": "0px 2px 4px 0px #00000024;" },
    "titleFont": { "size": 21, "sizeUnit": "px", "weight": "500", "lineHeight": "22px" },
    "enableFullscreen": false,
    "enableDataExport": false,
    "showTitle": false,
    "units": "%",
    "decimals": 0,
    "datasources": [{
      "type": "entity",
      "entityAliasId": "<aliasUuid>",
      "dataKeys": [{
        "name": "<batteryLevel>",
        "label": "<Battery Level>",
        "type": "timeseries",
        "color": "var(--tb-primary-500)",
        "settings": {}
      }]
    }],
    "settings": {
      "layout": "horizontal_solid",
      "batteryLevelColor": {
        "type": "range",
        "color": "rgb(224, 224, 224)",
        "rangeList": {
          "advancedMode": false,
          "range": [
            { "from": null, "to": 25,   "color": "rgba(227, 71, 71, 1)" },
            { "from": 25,   "to": 50,   "color": "rgba(246, 206, 67, 1)" },
            { "from": 50,   "to": null, "color": "rgba(92, 223, 144, 1)" }
          ]
        }
      },
      "batteryShapeColor": {
        "type": "range",
        "color": "rgba(224, 224, 224, 0.32)",
        "rangeList": {
          "advancedMode": false,
          "range": [
            { "from": null, "to": 25,   "color": "rgba(227, 71, 71, 0.32)" },
            { "from": 25,   "to": 50,   "color": "rgba(246, 206, 67, 0.32)" },
            { "from": 50,   "to": null, "color": "rgba(92, 223, 144, 0.32)" }
          ]
        }
      }
    },
    "actions": {}
  }
}
```

---
