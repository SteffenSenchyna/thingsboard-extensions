---
name: alias-customer-entities
description: "customerEntities entity alias — a renderable TB JSON template pulled on-demand by dashboard-generator that resolves assets/devices belonging to the currently selected customer state entity."
user-invocable: false
---

### customerEntities (assets/devices belonging to selected customer)
```json
{
  "id": "<aliasUuid>",
  "alias": "<Human Name>",
  "filter": {
    "type": "entitiesByGroupName",
    "resolveMultiple": true,
    "groupType": "ASSET",
    "entityGroupNameFilter": "<AssetProfileName or All>",
    "groupStateEntity": true,
    "stateEntityParamName": "<selectedCustomer>"
  }
}
```
