---
name: alias-single-entity
description: "singleEntity entity alias — a renderable TB JSON template pulled on-demand by dashboard-generator that resolves exactly one fixed entity by its UUID."
user-invocable: false
---

### singleEntity (single fixed entity, requires a real entity UUID)
```json
{
  "id": "<aliasUuid>",
  "alias": "<Human Name>",
  "filter": {
    "type": "singleEntity",
    "resolveMultiple": false,
    "singleEntity": { "entityType": "ASSET", "id": "<real-entity-uuid>" }
  }
}
```
