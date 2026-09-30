---
name: alias-device-search-query
description: "deviceSearchQuery entity alias — a renderable TB JSON template pulled on-demand by dashboard-generator that traverses relations to find child devices, either from a state param root or a fixed root entity."
user-invocable: false
---

### deviceSearchQuery

When the root entity comes from a state param:
```json
{
  "id": "<aliasUuid>",
  "alias": "<Human Name>",
  "filter": {
    "type": "deviceSearchQuery",
    "resolveMultiple": true,
    "rootStateEntity": true,
    "stateEntityParamName": "<selectedFloor>",
    "rootEntity": null,
    "defaultStateEntity": null,
    "direction": "FROM",
    "maxLevel": 1,
    "fetchLastLevelOnly": false,
    "relationType": "<Contains>",
    "deviceTypes": ["<DeviceProfileName>"]
  }
}
```

When the root entity is fixed (use `spec.entityId`):
```json
{
  "id": "<aliasUuid>",
  "alias": "<Human Name>",
  "filter": {
    "type": "deviceSearchQuery",
    "resolveMultiple": true,
    "rootStateEntity": false,
    "stateEntityParamName": null,
    "rootEntity": { "entityType": "<ASSET>", "id": "<spec.entityId>" },
    "defaultStateEntity": null,
    "direction": "FROM",
    "maxLevel": 1,
    "fetchLastLevelOnly": false,
    "relationType": "<Contains>",
    "deviceTypes": ["<DeviceProfileName>"]
  }
}
```
