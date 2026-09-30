---
name: widget-connect-real-devices
description: "Renderable TB JSON template for the connectRealDevices widget. Pulled on-demand by dashboard-generator. Placeholders: <fresh-uuid>, <connectDevicesUrl>."
user-invocable: false
---

# connectRealDevices widget

No datasource. `url` defaults to `https://thingsboard.io/docs/user-guide/connectivity-guide/`

```json
{
  "id": "<widgetUuid>",
  "type": "latest",
  "typeFullFqn": "system.action_button",
  "sizeX": <N>, "sizeY": <N>, "row": <N>, "col": <N>,
  "config": {
    "configMode": "basic",
    "title": "Connect Devices",
    "dropShadow": false,
    "borderRadius": "8px",
    "widgetStyle": {},
    "enableFullscreen": false,
    "enableDataExport": false,
    "showTitle": false,
    "padding": "0px",
    "backgroundColor": "#FFFFFF00",
    "datasources": [],
    "settings": {
      "appearance": {
        "type": "filled",
        "showLabel": true,
        "label": "How to connect real devices?",
        "showIcon": true,
        "icon": "help_outline",
        "mainColor": "var(--tb-primary-500)",
        "backgroundColor": "#FFFFFF",
        "customStyle": {}
      },
      "activatedState": { "action": "DO_NOTHING", "defaultValue": false },
      "disabledState":  { "action": "DO_NOTHING", "defaultValue": false }
    },
    "actions": {
      "click": [{
        "type": "openURL",
        "id": "<fresh-uuid>",
        "name": "Open Docs",
        "icon": "help_outline",
        "url": "<connectDevicesUrl>",
        "openNewBrowserTab": true
      }]
    }
  }
}
```

---
