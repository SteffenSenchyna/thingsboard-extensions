---
name: widget-chart
description: "Renderable TB JSON template for the chart widget. Pulled on-demand by dashboard-generator. Placeholders: <chart title>, <aliasUuid>, <temperature>, <Temperature>, <humidity>, <Humidity>."
user-invocable: false
---

# chart (time-series line chart) widget

Each series entry has `name` (key), `label`, `type: "timeseries"`, `color`, `settings: {"yAxis": "default"}`.
`yAxes` has one entry per axis; the default axis id is `"default"`.

```json
{
  "id": "<widgetUuid>",
  "type": "timeseries",
  "typeFullFqn": "system.time_series_chart",
  "sizeX": <N>, "sizeY": <N>, "row": <N>, "col": <N>,
  "config": {
    "configMode": "basic",
    "title": "<chart title>",
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
    "enableFullscreen": true,
    "enableDataExport": true,
    "padding": "0px",
    "margin": "0px",
    "datasources": [{
      "type": "entity",
      "entityAliasId": "<aliasUuid>",
      "dataKeys": [
        { "name": "<temperature>", "label": "<Temperature>", "type": "timeseries", "color": "var(--tb-primary-500)", "settings": { "yAxis": "default" }, "units": "°C", "decimals": 1 },
        { "name": "<humidity>",    "label": "<Humidity>",    "type": "timeseries", "color": "#4CAF50",              "settings": { "yAxis": "default" }, "units": "%",  "decimals": 0 }
      ]
    }],
    "settings": {
      "dataZoom": false,
      "showLegend": false,
      "legendConfig": { "position": "top", "sortDataKeys": false, "showMin": false, "showMax": false, "showAvg": true, "showTotal": false, "showLatest": false },
      "xAxis": { "show": true, "position": "bottom" },
      "yAxis": { "show": true, "position": "left" },
      "yAxes": {
        "default": { "id": "default", "label": "<Temperature>", "position": "left", "units": "°C", "decimals": 1, "order": 0 }
      }
    }
  }
}
```

---
