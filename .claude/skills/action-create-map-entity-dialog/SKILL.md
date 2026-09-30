---
name: action-create-map-entity-dialog
description: "createMapEntityDialog widget action — a renderable TB JSON template pulled on-demand by dashboard-generator; slot headerButton on map widgets, opens a place-map-item dialog using entity-dialog templates with map_placement=true."
user-invocable: false
---

### createMapEntityDialog (slot: `headerButton` on map)
```json
{
  "type": "placeMapItem",
  "id": "<fresh-uuid>",
  "name": "<label>",
  "icon": "add",
  "mapItemType": "marker",
  "mapItemTooltips": {},
  "customFunction": "<rendered from entity-dialog.js with map_placement=true>",
  "customHtml": "<rendered from entity-dialog.html>"
}
```

**To render CRUD dialog templates**, read:
- `@/Users/steffensenchyna/.thingsboard/resources/templates/widget-action/entity-dialog.js`
- `@/Users/steffensenchyna/.thingsboard/resources/templates/widget-action/delete-entity-function.js`
- `@/Users/steffensenchyna/.thingsboard/resources/templates/widget-action/entity-dialog.html`

Substitute the template variables (Thymeleaf syntax) with the values from the action spec.
