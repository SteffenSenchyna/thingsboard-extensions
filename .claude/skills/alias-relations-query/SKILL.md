---
name: alias-relations-query
description: "relationsQuery entity alias — a renderable TB JSON template pulled on-demand by dashboard-generator that traverses arbitrary relation types to find related entities, either from a state param root or a fixed root entity."
user-invocable: false
---

### relationsQuery

When the root entity comes from a state param:
```json
{
  "id": "<aliasUuid>",
  "alias": "<Human Name>",
  "filter": {
    "type": "relationsQuery",
    "resolveMultiple": true,
    "rootStateEntity": true,
    "stateEntityParamName": "<selectedZone>",
    "rootEntity": null,
    "defaultStateEntity": null,
    "direction": "FROM",
    "maxLevel": 1,
    "filters": [
      { "relationType": "<currentlyInside>", "entityTypes": ["DEVICE"] }
    ]
  }
}
```

When the root entity is fixed (use `spec.entityId`):
```json
{
  "id": "<aliasUuid>",
  "alias": "<Human Name>",
  "filter": {
    "type": "relationsQuery",
    "resolveMultiple": true,
    "rootStateEntity": false,
    "stateEntityParamName": null,
    "rootEntity": { "entityType": "<ASSET>", "id": "<spec.entityId>" },
    "defaultStateEntity": null,
    "direction": "FROM",
    "maxLevel": 1,
    "filters": [
      { "relationType": "<currentlyInside>", "entityTypes": ["DEVICE"] }
    ]
  }
}
```
