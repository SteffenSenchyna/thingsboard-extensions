---
name: widget-alarm-table
description: "Renderable TB JSON template for the alarmTable widget. Pulled on-demand by dashboard-generator. Placeholders: <aliasUuid>."
user-invocable: false
---

# alarmTable widget

Fixed 5-column alarm data structure. Alarm source uses `alarmSource` (not `datasources`).
`config.actions` same slots as entityTable.

```json
{
  "id": "<widgetUuid>",
  "type": "alarm",
  "typeFullFqn": "system.alarm_widgets.alarms_table",
  "sizeX": <N>, "sizeY": <N>, "row": <N>, "col": <N>,
  "config": {
    "configMode": "basic",
    "title": "Alarms",
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
    "enableFullscreen": true,
    "enableDataExport": true,
    "showTitle": true,
    "padding": "4px",
    "datasources": [],
    "alarmSource": {
      "type": "entity",
      "name": "alarms",
      "entityAliasId": "<aliasUuid>",
      "dataKeys": [
        { "name": "createdTime",   "label": "Created Time", "type": "alarm", "color": "var(--tb-primary-500)", "settings": {} },
        { "name": "originator",    "label": "Originator",   "type": "alarm", "color": "var(--tb-primary-500)", "settings": {} },
        { "name": "type",     "label": "Type",         "type": "alarm", "color": "var(--tb-primary-500)", "settings": {} },
        { "name": "severity", "label": "Severity",     "type": "alarm", "color": "var(--tb-primary-500)", "settings": {} },
        { "name": "status",   "label": "Status",       "type": "alarm", "color": "var(--tb-primary-500)", "settings": {} }
      ]
    },
    "alarmFilterConfig": {
      "statusList": ["ACTIVE"],
      "severityList": ["CRITICAL", "MAJOR", "MINOR", "WARNING", "INDETERMINATE"],
      "typeList": [],
      "searchPropagatedAlarms": true
    },
    "settings": {
      "alarmsTitle": "Alarms",
      "enableSelection": true,
      "enableSearch": true
    },
    "actions": {}
  }
}
```

---
