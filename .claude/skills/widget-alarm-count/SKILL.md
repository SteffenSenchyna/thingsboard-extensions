---
name: widget-alarm-count
description: "Renderable TB JSON template for the alarmCount widget. Pulled on-demand by dashboard-generator. Placeholders: <Total Alarms>, <aliasUuid>."
user-invocable: false
---

# alarmCount widget

```json
{
  "id": "<widgetUuid>",
  "type": "latest",
  "typeFullFqn": "system.alarm_count",
  "sizeX": <N>, "sizeY": <N>, "row": <N>, "col": <N>,
  "config": {
    "configMode": "basic",
    "title": "<Total Alarms>",
    "dropShadow": false,
    "borderRadius": "8px",
    "widgetStyle": { "box-shadow": "0px 2px 4px 0px #00000024;" },
    "titleFont": { "size": 21, "sizeUnit": "px", "weight": "500", "lineHeight": "22px" },
    "enableFullscreen": false,
    "enableDataExport": false,
    "showTitle": false,
    "datasources": [{
      "type": "alarmCount",
      "entityAliasId": "<aliasUuid>",
      "dataKeys": [{ "name": "count", "label": "count", "type": "count", "settings": {} }],
      "alarmFilterConfig": {
        "statusList": ["ACTIVE"],
        "severityList": ["CRITICAL", "MAJOR", "MINOR", "WARNING", "INDETERMINATE"],
        "typeList": [],
        "searchPropagatedAlarms": true
      }
    }],
    "settings": {
      "label": "<Total Alarms>",
      "showLabel": true,
      "layout": "column",
      "showIcon": true,
      "icon": "warning",
      "iconSize": 20,
      "iconSizeUnit": "px",
      "showIconBackground": true,
      "iconBackgroundSize": 36,
      "iconBackgroundSizeUnit": "px",
      "iconBackgroundColor": {
        "type": "range",
        "color": "rgba(0, 105, 92, 1)",
        "rangeList": {
          "advancedMode": false,
          "range": [
            { "from": 0, "to": 1, "color": "rgba(0, 105, 92, 1)" },
            { "from": 1, "to": null, "color": "rgba(209, 39, 48, 1)" }
          ]
        }
      }
    }
  }
}
```

---
