---
name: action-change-owner-dialog
description: "changeOwnerDialog widget action — a renderable TB JSON template pulled on-demand by dashboard-generator; slot actionCellButton, opens the TB change-owner dialog to reassign an entity to a different customer."
user-invocable: false
---

### changeOwnerDialog (slot: `actionCellButton`)

```json
{
  "type": "customPretty",
  "id": "<fresh-uuid>",
  "name": "<label, e.g. Assign to Customer>",
  "icon": "transfer_within_a_station",
  "customFunction": "widgetContext.actionsApi.getEntityInfo(entityId).then(entity => { widgetContext.actionsApi.openChangeOwnerDialog(entityId, entity.entityType, entity.name); });"
}
```
