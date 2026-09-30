---
name: widget-value-chart-card
description: "Renderable TB JSON template for the valueChartCard widget. Pulled on-demand by dashboard-generator. Placeholders: <metric label>, <°C>, <aliasUuid>, <temperature>, <Temperature>."
user-invocable: false
---

# valueChartCard widget

Latest value + sparkline trend. Datasource has both `dataKeys` and `latestDataKeys` pointing to the same key.

```json
{
  "id": "<widgetUuid>",
  "type": "timeseries",
  "typeFullFqn": "system.simple_value_and_chart_card",
  "sizeX": <N>, "sizeY": <N>, "row": <N>, "col": <N>,
  "config": {
    "configMode": "basic",
    "title": "<metric label>",
    "dropShadow": false,
    "borderRadius": "8px",
    "widgetStyle": { "box-shadow": "0px 2px 4px 0px #00000024;" },
    "titleFont": { "size": 21, "sizeUnit": "px", "weight": "500", "lineHeight": "22px" },
    "useDashboardTimewindow": true,
    "timewindow": {
      "selectedTab": 1,
      "history": { "historyType": 0, "timewindowMs": 604800000 },
      "aggregation": { "type": "NONE" }
    },
    "showTitle": true,
    "enableFullscreen": false,
    "enableDataExport": false,
    "units": "<°C>",
    "decimals": 1,
    "datasources": [{
      "type": "entity",
      "entityAliasId": "<aliasUuid>",
      "dataKeys": [{
        "name": "<temperature>",
        "label": "<Temperature>",
        "type": "timeseries",
        "color": "var(--tb-primary-500)",
        "settings": {}
      }],
      "latestDataKeys": [{
        "name": "<temperature>",
        "label": "<Temperature>",
        "type": "timeseries",
        "color": "var(--tb-primary-500)",
        "settings": {}
      }]
    }],
    "settings": {},
    "actions": {}
  }
}
```

---
