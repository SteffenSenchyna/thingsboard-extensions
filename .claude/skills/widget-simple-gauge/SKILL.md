---
name: widget-simple-gauge
description: "Renderable TB JSON template for the simpleGauge widget. Pulled on-demand by dashboard-generator. Placeholders: <metric label>, <°C>, <aliasUuid>, <temperature>, <Temperature>."
user-invocable: false
---

# simpleGauge widget

`gaugeType` is `"donut"`, `"arc"`, `"horizontalBar"`, or `"verticalBar"`.

```json
{
  "id": "<widgetUuid>",
  "type": "latest",
  "typeFullFqn": "system.digital_gauges.simple_gauge_justgage",
  "sizeX": <N>, "sizeY": <N>, "row": <N>, "col": <N>,
  "config": {
    "configMode": "basic",
    "title": "<metric label>",
    "dropShadow": false,
    "borderRadius": "8px",
    "widgetStyle": { "box-shadow": "0px 2px 4px 0px #00000024;" },
    "titleFont": { "size": 21, "sizeUnit": "px", "weight": "500", "lineHeight": "22px" },
    "enableFullscreen": false,
    "enableDataExport": false,
    "showTitle": false,
    "units": "<°C>",
    "decimals": 1,
    "datasources": [{
      "type": "entity",
      "entityAliasId": "<aliasUuid>",
      "dataKeys": [{
        "name": "<temperature>",
        "label": "<Temperature>",
        "type": "timeseries",
        "color": "#000000DE",
        "settings": {}
      }]
    }],
    "settings": {
      "minValue": 0,
      "maxValue": 100,
      "gaugeType": "donut",
      "showTitle": true,
      "title": "<metric label>",
      "titleFont": { "color": "#000000DE" },
      "labelFont": {},
      "valueFont": {},
      "minMaxFont": {},
      "showMinMax": false,
      "showValue": true,
      "barColor": {
        "type": "constant",
        "color": "<#FFA726>",
        "gradient": {
          "advancedMode": false,
          "gradient": ["rgba(0, 255, 0, 1)", "rgba(255, 0, 0, 1)"],
          "gradientAdvanced": [
            { "source": { "type": "constant" }, "color": "rgba(0, 255, 0, 1)" },
            { "source": { "type": "constant" }, "color": "rgba(255, 0, 0, 1)" }
          ],
          "minValue": 0,
          "maxValue": 100
        }
      }
    },
    "actions": {}
  }
}
```

Omit `minValue`/`maxValue` from settings when the metric has no fixed bounds. `barColor` is required.

---
