---
name: widget-outdoor-map
description: "Renderable TB JSON template for the outdoorMap widget. Pulled on-demand by dashboard-generator. Placeholders: <aliasUuid>, <name>, <marker layer>, <polygon layer>, <placeMapItem action body>, <drillDown action body with name='view-details'>."
user-invocable: false
---

# outdoorMap widget

Each layer in `markers`, `polygons`, `circles` is built per the rules below.
`fitMapBounds` is `true` unless any layer has `allowRepositioning: true`.

**Never save the map with empty layers.** `markers: []` AND `polygons: []` (and `circles: []`) means a blank map — the most common map bug. A map widget must have at least one populated `markers` layer (with `xKey`/`yKey`) or `polygons` layer (with `polygonKey`). Build the layers from the worked example below before saving; the placeholders `<marker layer>` / `<polygon layer>` in the template are not literal — fill them.

## Worked example — markers + polygons (copy this, then adapt)

A complete, render-verified `settings` block: status-colored device markers **plus** an area-polygon overlay. Replace the alias UUIDs, key names, and colors with the dashboard's own; keep the structure. (This is the shape that fixes the "nothing on the map" bug — both layers are non-empty.)

```json
"settings": {
  "mapType": "geoMap",
  "layers": [
    { "label": "{i18n:widgets.maps.layer.roadmap}",  "provider": "openstreet", "layerType": "Esri.WorldStreetMap", "referenceLayer": null },
    { "label": "{i18n:widgets.maps.layer.satellite}", "provider": "openstreet", "layerType": "Esri.WorldImagery" },
    { "label": "{i18n:widgets.maps.layer.hybrid}",   "provider": "openstreet", "layerType": "Esri.WorldImagery", "referenceLayer": "openstreetmap_hybrid" }
  ],
  "markers": [
    {
      "dsType": "entity",
      "dsEntityAliasId": "<sensorsAliasUuid>",
      "xKey": { "name": "latitude",  "label": "Latitude",  "type": "timeseries", "color": "var(--tb-primary-500)", "settings": {} },
      "yKey": { "name": "longitude", "label": "Longitude", "type": "timeseries", "color": "var(--tb-primary-500)", "settings": {} },
      "additionalDataKeys": [
        { "name": "lampStatus",   "label": "Lamp Status", "type": "timeseries", "color": "var(--tb-primary-500)", "settings": {} },
        { "name": "batteryLevel", "label": "Battery",     "type": "timeseries", "color": "#3b82f6", "settings": {} }
      ],
      "markerType": "icon",
      "markerIcon": {
        "icon": "lightbulb",
        "color": {
          "type": "function",
          "colorFunction": "if (data['Lamp Status'] === 'ON') { return '#10b981'; } else if (data['Lamp Status'] === 'OFF') { return '#6b7280'; } return '#ef4444';"
        }
      },
      "tooltip": {
        "show": true,
        "trigger": "click",
        "type": "pattern",
        "pattern": "<b>${entityName}</b><br/><b>Status:</b> ${Lamp Status}<br/><b>Battery:</b> ${Battery}%<br/><link-act name='view-details'>View details</link-act>",
        "tagActions": [ <drillDown action body with name='view-details'> ]
      },
      "label": { "show": false, "type": "pattern", "pattern": "${entityName}" }
    }
  ],
  "polygons": [
    {
      "dsType": "entity",
      "dsEntityAliasId": "<areasAliasUuid>",
      "polygonKey": { "name": "perimeter", "label": "Perimeter", "type": "attribute", "color": "var(--tb-primary-500)", "settings": {} },
      "additionalDataKeys": [
        { "name": "<name>", "label": "Area Name", "type": "entityField", "color": "var(--tb-primary-500)", "settings": {} }
      ],
      "fillType": "color",
      "fillColor": "rgba(13, 148, 136, 0)",
      "strokeColor": "#0d9488",
      "strokeWeight": 2,
      "tooltip": {
        "show": true,
        "trigger": "click",
        "type": "pattern",
        "pattern": "<b>${Area Name}</b><br/><link-act name='view-area'>View area</link-act>",
        "tagActions": [ <drillDown action body with name='view-area'> ]
      }
    }
  ],
  "circles": [],
  "fitMapBounds": true,
  "mapActionButtons": []
}
```

Notes on the worked example:
- **Polygons are outline-only — never fill them with color.** Draw the boundary as a line and leave the interior empty: keep a solid `strokeColor` + `strokeWeight`, and set `fillColor` to a fully **transparent** color (alpha `0`, e.g. `rgba(13, 148, 136, 0)`). Keep `fillType: "color"` — a transparent fill is how no-fill is expressed; there is no `fillType: "none"` for polygons. A filled interior obscures markers and basemap underneath and reads as a heavy blob; the outline alone shows the area cleanly. (Match the `strokeColor` to the area's status/accent color rather than tinting the inside.)
- **The marker and polygon layers usually bind to different aliases** — markers to the leaf entities (devices/sensors), polygons to the parent areas (assets). They are independent layers on one map; both render together.
- **`colorFunction` references the additionalDataKeys *label*, not the key name.** A label with a space needs bracket access: `data['Lamp Status']`, not `data.LampStatus`. A single-word label can use dot access (`data.Status`). The key must be declared in `xKey`/`yKey`/`additionalDataKeys` on the **same layer**.
- **Position keys must exist and be populated.** `latitude`/`longitude` are `timeseries` here (the profile's `classifier`); when they're attributes use `"type": "attribute"`. Either way the markers only appear once those keys actually have values — if they're TIMESERIES, an emulator/telemetry must populate them (and markers + their parent polygons must share a geographic region, or markers land outside/away from the polygons).
- `mapActionButtons` carries a `placeMapItem` action only for `CRUD`/`RU` roles per permission gating; `[]` for viewers.

```json
{
  "id": "<widgetUuid>",
  "type": "latest",
  "typeFullFqn": "system.map",
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
      "mapType": "geoMap",
      "layers": [
        { "label": "{i18n:widgets.maps.layer.roadmap}",  "provider": "openstreet", "layerType": "Esri.WorldStreetMap", "referenceLayer": null },
        { "label": "{i18n:widgets.maps.layer.satellite}", "provider": "openstreet", "layerType": "Esri.WorldImagery" },
        { "label": "{i18n:widgets.maps.layer.hybrid}",   "provider": "openstreet", "layerType": "Esri.WorldImagery", "referenceLayer": "openstreetmap_hybrid" }
      ],
      "markers": [ <marker layer> ],
      "polygons": [ <polygon layer> ],
      "circles":  [],
      "fitMapBounds": true,
      "mapActionButtons": [<placeMapItem action body>]
    },
    "actions": {}
  }
}
```

**Marker layer** (outdoor, `latitude`/`longitude` keys):
```json
{
  "dsType": "entity",
  "dsEntityAliasId": "<aliasUuid>",
  "xKey": { "name": "latitude",  "label": "Latitude",  "type": "attribute", "color": "var(--tb-primary-500)", "settings": {} },
  "yKey": { "name": "longitude", "label": "Longitude", "type": "attribute", "color": "var(--tb-primary-500)", "settings": {} },
  "additionalDataKeys": [
    { "name": "<name>", "label": "Name", "type": "entityField", "color": "var(--tb-primary-500)", "settings": {} }
  ],
  "markerType": "icon",
  "markerIcon": { "icon": "location_on", "color": { "type": "constant", "color": "#2196F3" } },
  "tooltip": {
    "show": true,
    "trigger": "click",
    "type": "pattern",
    "pattern": "<b>${entityName}</b><br/><b>Status:</b> ${Status}<br/><link-act name='view-details'>View details</link-act>",
    "tagActions": [ <drillDown action body with name='view-details'> ]
  },
  "label": { "show": true, "type": "pattern", "pattern": "${entityName}" }
}
```

**Tooltip pattern — never wire drill-down to the marker click itself.** Open a tooltip on click, then let the user follow a `<link-act>` link inside it to navigate. This lets the user read the entity's key values before deciding to drill down.

- `trigger: "click"` and `type: "pattern"` are always set as above.
- `pattern` is HTML (`<b>`, `<br/>` — not `\n`). Include the entity name and 1–3 of the most relevant keys (status, latest reading, occupancy, etc.) using `${KeyLabel}` substitutions. Every `${...}` placeholder must reference a key declared in `xKey`, `yKey`, or `additionalDataKeys` on the **same layer** — otherwise it renders empty. Pick the keys from `spec.entityProfiles` and add them to `additionalDataKeys` if not already there.
- End with one `<link-act name='<actionName>'>Label</link-act>` link. The `name` attribute **must match** the `name` field on the corresponding `tagActions` entry — that's how the click is routed.
- `tagActions` holds one drillDown action body per link in the pattern; set its `name` to the same string used inside `<link-act name='...'>`.

When `allowRepositioning` is true, add:
```json
"edit": { "enabledActions": ["add", "move", "remove"] }
```

**Marker icon** (`markerIcon` on any marker layer — shared by `outdoorMap` and `indoorMap`):

`icon` is a material-icon name from `icons.json`. `color` has two valid shapes — pick based on whether the marker color depends on live data:

1. **`constant`** — every marker on the layer uses the same color. Use this when there is no status/state key to drive coloring (e.g. a generic "device" pin).

   ```json
   "markerIcon": {
     "icon": "bolt",
     "color": { "type": "constant", "color": "#2196F3" }
   }
   ```

2. **`function`** — per-entity color computed at render time from that marker's live data. Use this when the entity has a status/state key whose value should change the pin color (open/closed, online/offline, severity tier, etc.).

   - `colorFunction` is a JS expression that **must return a hex color string**.
   - Reference live keys via `data.<KeyName>` (the key must be one of `xKey`, `yKey`, or an `additionalDataKeys` entry on the same layer — otherwise the value is undefined at evaluation time).
   - Always end with a default `return` so a marker with a missing/unexpected value still gets a fallback color.

   ```json
   "markerIcon": {
     "icon": "electric_meter",
     "color": {
       "type": "function",
       "colorFunction": "if (data.Status === 'closed') { return '#4CAF50'; } else if (data.Status === 'tripped') { return '#F44336'; } else if (data.Status === 'open') { return '#FF9800'; } return '#757575';"
     }
   }
   ```

Never mix the two shapes — `constant` has `color: "<hex>"`, `function` has `colorFunction: "<js>"`. Picking the wrong shape silently disables the other field.

**Polygon layer** (perimeter attribute):
```json
{
  "dsType": "entity",
  "dsEntityAliasId": "<aliasUuid>",
  "polygonKey": { "name": "perimeter", "label": "Perimeter", "type": "attribute", "color": "var(--tb-primary-500)", "settings": {} },
  "additionalDataKeys": [
    { "name": "<name>", "label": "Name", "type": "entityField", "color": "var(--tb-primary-500)", "settings": {} }
  ],
  "fillType": "color",
  "fillColor": "rgba(13, 148, 136, 0)",
  "strokeColor": "#0d9488",
  "strokeWeight": 3,
  "tooltip": {
    "show": true,
    "trigger": "click",
    "type": "pattern",
    "pattern": "<b>${entityName}</b><br/><link-act name='view-details'>View details</link-act>",
    "tagActions": [ <drillDown action body with name='view-details'> ]
  }
}
```

The same tooltip pattern rule from the marker layer applies — open the tooltip on click, embed a `<link-act>` link, and put the drillDown action body in `tagActions` with a matching `name`. The same convention applies to circle layers (when present).

---
