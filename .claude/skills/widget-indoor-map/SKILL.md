---
name: widget-indoor-map
description: "Renderable TB JSON template for the indoorMap widget. Pulled on-demand by dashboard-generator. Placeholders: <aliasUuid of parent entity that has the floor plan image attribute>, <floorPlan>, <aliasUuid of child entities>, <drillDown action body with name='view-details'>, <placeMapItem action body>."
user-invocable: false
---

# indoorMap widget

`aliasUuid` is the child entity alias (used for markers). `imageSourceAliasUuid` is the parent entity alias (used for the floor plan image source). Both must be present in the state spec for indoorMap widgets.

**Floor plan image source:** Check `spec.entityProfiles` for a key with `classifier: "image"` on the parent entity profile. If found, use that key name in `imageSource.entityKey`. If no such classifier exists in any profile but positioning keys (`classifier: "indoorLocationX"` / `classifier: "indoorLocationY"`) are present, read `@/Users/steffensenchyna/.thingsboard/resources/prompts/solutions/dashboard/resources/images.json` and pick the entry whose `type` best matches the solution domain. Use `fileName` as the static image reference in `imageSource`.

Same structure as `outdoorMap` but uses `xKey`/`yKey` from `xPos`/`yPos` attributes, and `settings.mapType: "image"` with an `imageSource`.

```json
{
  "id": "<widgetUuid>",
  "type": "latest",
  "typeFullFqn": "system.image_map",
  "sizeX": <N>, "sizeY": <N>, "row": <N>, "col": <N>,
  "config": {
    "configMode": "basic",
    "title": "",
    "dropShadow": false,
    "borderRadius": "8px",
    "widgetStyle": { "box-shadow": "0px 2px 4px 0px #00000024;" },
    "titleFont": { "size": 21, "sizeUnit": "px", "weight": "500", "lineHeight": "22px" },
    "enableFullscreen": false,
    "enableDataExport": false,
    "showTitle": false,
    "padding": "0px",
    "margin": "0px",
    "datasources": [],
    "settings": {
      "imageSource": {
        "entityAliasId": "<aliasUuid of parent entity that has the floor plan image attribute>",
        "sourceType": "entityKey",
        "entityKey": { "name": "<floorPlan>", "label": "Floor Plan", "type": "attribute", "color": "var(--tb-primary-500)", "settings": {} }
      },
      "mapType": "image",
      "markers": [{
        "dsType": "entity",
        "dsEntityAliasId": "<aliasUuid of child entities>",
        "xKey": { "name": "xPos", "label": "X", "type": "attribute", "color": "var(--tb-primary-500)", "settings": {} },
        "yKey": { "name": "yPos", "label": "Y", "type": "attribute", "color": "var(--tb-primary-500)", "settings": {} },
        "markerType": "icon",
        "markerIcon": { "icon": "sensors", "color": { "type": "constant", "color": "#2196F3" } },
        "tooltip": {
          "show": true,
          "trigger": "click",
          "type": "pattern",
          "pattern": "<b>${entityName}</b><br/><b>Status:</b> ${Status}<br/><link-act name='view-details'>View details</link-act>",
          "tagActions": [ <drillDown action body with name='view-details'> ]
        }
      }],
      "polygons": [],
      "circles": [],
      "fitMapBounds": true,
      "mapActionButtons": [<placeMapItem action body>]
    },
    "actions": {}
  }
}
```

If no parent-entity floor plan exists, omit `imageSource` entirely (the map renders as blank until a static image is configured in the UI).

If you add zone/room `polygons` (empty by default here), render them **outline-only** — solid `strokeColor` + `strokeWeight` with a fully transparent `fillColor` (alpha `0`), never a colored fill. See `widget-outdoor-map` for the polygon-layer shape.

---
