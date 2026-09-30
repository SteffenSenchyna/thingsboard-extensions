---
name: action-change-state
description: "changeState widget action — a renderable TB JSON template pulled on-demand by dashboard-generator; slot actionCellButton, updates the active dashboard state without transferring an entity param."
user-invocable: false
---

### changeState (slot: `actionCellButton`)
```json
{
  "type": "updateDashboardState",
  "id": "<fresh-uuid>",
  "name": "<label>",
  "icon": "edit",
  "targetDashboardStateId": "<target-state-id>",
  "setEntityId": false,
  "stateEntityParamName": null
}
```
