---
name: action-edit-entity-dialog
description: "editEntityDialog widget action — a renderable TB JSON template pulled on-demand by dashboard-generator; slot actionCellButton, opens a Thymeleaf-rendered dialog to edit an existing entity."
user-invocable: false
---

### editEntityDialog (slot: `actionCellButton`)

Same template as createEntityDialog but with `createEntity: false` and icon `edit`:
```json
{
  "type": "customPretty",
  "id": "<fresh-uuid>",
  "name": "<label, e.g. Edit Building>",
  "icon": "edit",
  "customFunction": "<rendered from entity-dialog.js>",
  "customHtml": "<rendered from entity-dialog.html>"
}
```
