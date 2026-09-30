---
name: widget-pie-chart
description: "Renderable TB JSON template for the pieChart widget. Pulled on-demand by dashboard-generator. Placeholders: <chart title>, <aliasUuid>, <countOfAmericano>, <Americano>, <countOfEspresso>, <Espresso>, <Count>, <chart title, e.g. Revenue Share by Shop>, <aliasUuid — must be a multi-entity alias (assetType, deviceType, assetSearchQuery, …)>, <dailyRevenue>, <Revenue>."
user-invocable: false
---

# pieChart (proportional distribution) widget

Two patterns — never mix them:
- **Single entity, multiple keys**: one datasource, multiple entries in `dataKeys`. Each slice = one key on the same entity. The key's `label` is the slice label.
- **Multiple entities, one key**: one multi-entity datasource (`assetType`, `deviceType`, `assetSearchQuery`, `deviceSearchQuery`, etc.), one entry in `dataKeys`. Each slice = one entity contributing its value for that key. The dataKey's `label` **must be `"${entityName}"`** — the placeholder is resolved per-entity at render time, so each slice is labeled with that entity's name. Hard-coding a single string here would give every slice the same label.

`dataKeys` entries have `type: "timeseries"` and `settings: {"yAxis": "<axisId>"}`.

**Pattern 1 — Single entity, multiple keys** (e.g. one coffee machine's daily brew breakdown):

```json
{
  "id": "<widgetUuid>",
  "type": "latest",
  "typeFullFqn": "system.horizontal_doughnut",
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
      "entityAliasId": "<aliasUuid>",
      "dataKeys": [
        { "name": "<countOfAmericano>", "label": "<Americano>", "type": "timeseries", "color": "var(--tb-primary-500)", "settings": { "yAxis": "default" } },
        { "name": "<countOfEspresso>",  "label": "<Espresso>",  "type": "timeseries", "color": "#4CAF50",              "settings": { "yAxis": "default" } }
      ]
    }],
    "settings": {
      "dataZoom": false,
      "showLegend": true,
      "legendConfig": { "position": "top", "sortDataKeys": false, "showMin": false, "showMax": false, "showAvg": true, "showTotal": false, "showLatest": false },
      "xAxis": { "show": true, "position": "bottom" },
      "yAxis": { "show": true, "position": "left" },
      "yAxes": {
        "default": { "id": "default", "label": "<Count>", "position": "left", "units": "", "decimals": 0, "order": 0 }
      },
      "layout": "with_total"
    },
    "actions": {}
  }
}
```

**Pattern 2 — Multiple entities, one key** (e.g. share of total daily revenue per shop). Use `${entityName}` as the `label` so each slice is labeled with the contributing entity's name:

```json
{
  "id": "<widgetUuid>",
  "type": "latest",
  "typeFullFqn": "system.horizontal_doughnut",
  "sizeX": <N>, "sizeY": <N>, "row": <N>, "col": <N>,
  "config": {
    "configMode": "basic",
    "title": "<chart title, e.g. Revenue Share by Shop>",
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
      "entityAliasId": "<aliasUuid — must be a multi-entity alias (assetType, deviceType, assetSearchQuery, …)>",
      "dataKeys": [
        { "name": "<dailyRevenue>", "label": "${entityName}", "type": "timeseries", "color": "var(--tb-primary-500)", "settings": { "yAxis": "default" }, "units": "$", "decimals": 0 }
      ]
    }],
    "settings": {
      "dataZoom": false,
      "showLegend": true,
      "legendConfig": { "position": "top", "sortDataKeys": false, "showMin": false, "showMax": false, "showAvg": true, "showTotal": false, "showLatest": false },
      "xAxis": { "show": true, "position": "bottom" },
      "yAxis": { "show": true, "position": "left" },
      "yAxes": {
        "default": { "id": "default", "label": "<Revenue>", "position": "left", "units": "$", "decimals": 0, "order": 0 }
      },
      "layout": "with_total"
    },
    "actions": {}
  }
}
```

---
