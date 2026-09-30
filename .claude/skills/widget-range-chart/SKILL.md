---
name: widget-range-chart
description: "Renderable TB JSON template for the rangeChart widget. Pulled on-demand by dashboard-generator. Placeholders: <Temperature>, <rangeColors>."
user-invocable: false
---

# rangeChart (time-series with color bands) widget

Base config: see the widget-chart skill; this entry overrides settings only.

Same structure as `chart` but adds `rangeColors` in settings. Each range entry: `{ "from": N|null, "to": N|null, "color": "<hex>" }`.

```json
{
  "id": "<widgetUuid>",
  "type": "timeseries",
  "typeFullFqn": "system.range_chart",
  "sizeX": <N>, "sizeY": <N>, "row": <N>, "col": <N>,
  "config": {
    ...same as chart up to settings...,
    "settings": {
      "dataZoom": false,
      "showLegend": false,
      "legendConfig": { "position": "top", "sortDataKeys": false, "showMin": false, "showMax": false, "showAvg": true, "showTotal": false, "showLatest": false },
      "xAxis": { "show": true, "position": "bottom" },
      "yAxis": { "show": true, "position": "left" },
      "yAxes": {
        "default": { "id": "default", "label": "<Temperature>", "position": "left", "units": "°C", "decimals": 1, "order": 0 }
      },
      "rangeColors": [
        { "from": null, "to": 18,  "color": "#2196F3" },
        { "from": 18,   "to": 26,  "color": "#4CAF50" },
        { "from": 26,   "to": null,"color": "#F44336" }
      ]
    }
  }
}
```

---
