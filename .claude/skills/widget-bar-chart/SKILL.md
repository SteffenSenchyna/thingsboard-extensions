---
name: widget-bar-chart
description: "Renderable TB JSON template for the barChart widget. Pulled on-demand by dashboard-generator. Placeholders: <chart title>, <aliasUuid — must be multi-entity alias (assetType, deviceType, etc.)>, <revenue>."
user-invocable: false
---

# barChart (latest values, multiple entities, one key) widget

`dataKeys` has exactly one entry with `type: "timeseries"`.

```json
{
  "id": "<widgetUuid>",
  "type": "latest",
  "typeFullFqn": "system.bars",
  "sizeX": <N>, "sizeY": <N>, "row": <N>, "col": <N>,
  "config": {
    "configMode": "basic",
    "title": "<chart title>",
    "dropShadow": false,
    "borderRadius": "8px",
    "widgetStyle": { "box-shadow": "0px 2px 4px 0px #00000024;" },
    "titleFont": { "size": 21, "sizeUnit": "px", "weight": "500", "lineHeight": "22px" },
    "enableFullscreen": false,
    "enableDataExport": false,
    "showTitle": true,
    "padding": "0px",
    "margin": "0px",
    "datasources": [{
      "type": "entity",
      "entityAliasId": "<aliasUuid — must be multi-entity alias (assetType, deviceType, etc.)>",
      "dataKeys": [{
        "name": "<revenue>",
        "label": "${entityName}",
        "type": "timeseries",
        "color": "var(--tb-primary-500)",
        "settings": {}
      }]
    }],
    "settings": {
      "dataZoom": false,
      "showLegend": false,
      "xAxis": { "show": true, "position": "bottom" },
      "yAxis": { "show": true, "position": "left" },
      "yAxes": {},
      "layout": "with_total"
    },
    "actions": {}
  }
}
```

---
