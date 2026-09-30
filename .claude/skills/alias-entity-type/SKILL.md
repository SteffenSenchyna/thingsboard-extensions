---
name: alias-entity-type
description: "entityType entity alias (no profile filter) — a renderable TB JSON template pulled on-demand by dashboard-generator that resolves all entities of a given TB entity type without profile filtering."
user-invocable: false
---

### entityType (no profile filter)
```json
{
  "id": "<aliasUuid>",
  "alias": "<Human Name>",
  "filter": {
    "type": "entityType",
    "resolveMultiple": true,
    "entityType": "ASSET"
  }
}
```
