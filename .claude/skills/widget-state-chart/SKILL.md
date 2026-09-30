---
name: widget-state-chart
description: "Renderable TB JSON template for the stateChart widget. Pulled on-demand by dashboard-generator. Placeholders: <aliasUuid>, <active>, <Status>."
user-invocable: false
---

# stateChart (discrete state bands) widget

`states` array maps values to colored labels. Use `constValue` for the raw key value (boolean, string, or number).

```json
{
  "id": "<widgetUuid>",
  "type": "timeseries",
  "typeFullFqn": "system.state_chart",
  "sizeX": <N>, "sizeY": <N>, "row": <N>, "col": <N>,
  "config": {
    ...same outer config as chart (useDashboardTimewindow, timewindow, enableFullscreen)...,
    "datasources": [{
      "type": "entity",
      "entityAliasId": "<aliasUuid>",
      "dataKeys": [
        { "name": "<active>", "label": "<Status>", "type": "timeseries", "color": "var(--tb-primary-500)", "settings": { "yAxis": "default" } }
      ]
    }],
    "settings": {
      "dataZoom": false,
      "showLegend": false,
      "legendConfig": { "position": "top", "sortDataKeys": false, "showMin": false, "showMax": false, "showAvg": true, "showTotal": false, "showLatest": false },
      "xAxis": { "show": true, "position": "bottom" },
      "yAxis": { "show": true, "position": "left" },
      "yAxes": {
        "default": { "id": "default", "label": "<Status>", "position": "left", "units": "", "decimals": 1, "order": 0 }
      },
      "states": [
        { "value": true,  "label": "Online",  "color": "rgba(92, 223, 144, 1)" },
        { "value": false, "label": "Offline", "color": "rgba(227, 71, 71, 1)" }
      ]
    }
  }
}
```

---
