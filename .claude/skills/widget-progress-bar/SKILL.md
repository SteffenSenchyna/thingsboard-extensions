---
name: widget-progress-bar
description: "Renderable TB JSON template for the progressBar widget. Pulled on-demand by dashboard-generator. Placeholders: <metric label>, <aliasUuid>, <fillLevel>, <Fill Level>."
user-invocable: false
---

# progressBar widget

```json
{
  "id": "<widgetUuid>",
  "type": "latest",
  "typeFullFqn": "system.progress_bar",
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
    "showTitle": true,
    "titleColor": "#000000DE",
    "units": "%",
    "decimals": 0,
    "datasources": [{
      "type": "entity",
      "entityAliasId": "<aliasUuid>",
      "dataKeys": [{
        "name": "<fillLevel>",
        "label": "<Fill Level>",
        "type": "timeseries",
        "color": "var(--tb-primary-500)",
        "settings": {}
      }]
    }],
    "settings": {
      "layout": "simplified",
      "tickMin": 0,
      "tickMax": 100,
      "autoScale": true,
      "showTicks": false
    },
    "actions": {}
  }
}
```

---
