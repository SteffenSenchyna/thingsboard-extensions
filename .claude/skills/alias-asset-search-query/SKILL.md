---
name: alias-asset-search-query
description: "assetSearchQuery entity alias — a renderable TB JSON template pulled on-demand by dashboard-generator that traverses relations to find child assets, either from a state param root or a fixed root entity."
user-invocable: false
---

### assetSearchQuery

> **Note on `defaultStateEntity`** (applies to `assetSearchQuery`, `deviceSearchQuery`, and `relationsQuery` below): When `rootStateEntity: true`, leave `defaultStateEntity: null` only if no fixed default is known. If the dashboard's root state is bound to a single fixed entity via a `singleEntity` alias (e.g., a House), set `defaultStateEntity: { entityType, id }` to that same root entity UUID — see the "Sibling/detail state alias …" row in the table above. The examples below use `null` for the generic case; substitute the real UUID when the rule applies.

When the root entity comes from a state param (non-root states):
```json
{
  "id": "<aliasUuid>",
  "alias": "<Human Name>",
  "filter": {
    "type": "assetSearchQuery",
    "resolveMultiple": true,
    "rootStateEntity": true,
    "stateEntityParamName": "<selectedBuilding>",
    "rootEntity": null,
    "defaultStateEntity": null,
    "direction": "FROM",
    "maxLevel": 1,
    "fetchLastLevelOnly": false,
    "relationType": "<Contains>",
    "assetTypes": ["<AssetProfileName>"]
  }
}
```

When the root entity is fixed (`spec.root: true`, no `stateEntityParamName` — use `spec.entityId`):
```json
{
  "id": "<aliasUuid>",
  "alias": "<Human Name>",
  "filter": {
    "type": "assetSearchQuery",
    "resolveMultiple": true,
    "rootStateEntity": false,
    "stateEntityParamName": null,
    "rootEntity": { "entityType": "<ASSET>", "id": "<spec.entityId>" },
    "defaultStateEntity": null,
    "direction": "FROM",
    "maxLevel": 1,
    "fetchLastLevelOnly": false,
    "relationType": "<Contains>",
    "assetTypes": ["<AssetProfileName>"]
  }
}
```
