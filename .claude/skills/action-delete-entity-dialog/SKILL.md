---
name: action-delete-entity-dialog
description: "deleteEntityDialog widget action — a renderable TB JSON template pulled on-demand by dashboard-generator; slot actionCellButton, opens a confirmation dialog and deletes the entity using a rendered JS function."
user-invocable: false
---

### deleteEntityDialog (slot: `actionCellButton`)

Rendered from `delete-entity-function.js`. Variables: `deleteEntityTitle`, `deleteEntityPrompt`.
```json
{
  "type": "custom",
  "id": "<fresh-uuid>",
  "name": "<label, e.g. Delete Building>",
  "icon": "delete",
  "customFunction": "<rendered from delete-entity-function.js>"
}
```
