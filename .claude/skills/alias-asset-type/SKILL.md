---
name: alias-asset-type
description: "assetType entity alias — a renderable TB JSON template pulled on-demand by dashboard-generator that resolves all assets matching a given asset profile type."
user-invocable: false
---

### assetType
```json
{
  "id": "<aliasUuid>",
  "alias": "<Human Name>",
  "filter": {
    "type": "assetType",
    "resolveMultiple": true,
    "assetTypes": ["<AssetProfileName>"]
  }
}
```
