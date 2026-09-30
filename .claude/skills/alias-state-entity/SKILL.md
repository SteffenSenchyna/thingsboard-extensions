---
name: alias-state-entity
description: "stateEntity entity alias — a renderable TB JSON template pulled on-demand by dashboard-generator that resolves a single entity from the current dashboard state parameter."
user-invocable: false
---

### stateEntity
```json
{
  "id": "<aliasUuid>",
  "alias": "<Human Name>",
  "filter": {
    "type": "stateEntity",
    "resolveMultiple": false,
    "stateEntityParamName": "<rootStateEntity value, e.g. selectedBuilding>",
    "defaultStateEntity": null
  }
}
```
