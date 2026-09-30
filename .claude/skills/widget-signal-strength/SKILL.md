---
name: widget-signal-strength
description: "Renderable TB JSON template for the signalStrength widget. Pulled on-demand by dashboard-generator. Placeholders: <Signal Strength>, <aliasUuid>, <rssi>, <RSSI>."
user-invocable: false
---

# signalStrength widget

`layout` is `"wifi"` for WiFi/Bluetooth or `"cellular"` for mobile.

```json
{
  "id": "<widgetUuid>",
  "type": "latest",
  "typeFullFqn": "system.signal_strength",
  "sizeX": <N>, "sizeY": <N>, "row": <N>, "col": <N>,
  "config": {
    "configMode": "basic",
    "title": "<Signal Strength>",
    "dropShadow": false,
    "borderRadius": "8px",
    "widgetStyle": { "box-shadow": "0px 2px 4px 0px #00000024;" },
    "titleFont": { "size": 21, "sizeUnit": "px", "weight": "500", "lineHeight": "22px" },
    "enableFullscreen": false,
    "enableDataExport": false,
    "showTitle": true,
    "units": "dBm",
    "decimals": 0,
    "datasources": [{
      "type": "entity",
      "entityAliasId": "<aliasUuid>",
      "dataKeys": [{
        "name": "<rssi>",
        "label": "<RSSI>",
        "type": "timeseries",
        "color": "var(--tb-primary-500)",
        "settings": {}
      }]
    }],
    "settings": { "layout": "wifi" },
    "actions": {}
  }
}
```

---
