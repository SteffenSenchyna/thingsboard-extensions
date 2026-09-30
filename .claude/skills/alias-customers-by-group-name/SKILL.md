---
name: alias-customers-by-group-name
description: "customersByGroupName entity alias — a renderable TB JSON template pulled on-demand by dashboard-generator that resolves all customers belonging to a named customer group."
user-invocable: false
---

### customersByGroupName

Customers do **not** have a profile concept in ThingsBoard — they belong to **customer groups** identified by name. Use this alias whenever a widget needs a multi-customer datasource. `entityGroupNameFilter` is the literal customer-group name created by `entities-generator` (it matches the `Name` of each `### Customer Groups` row in `architecture-overview.md` — that name becomes the group's name on save).

```json
{
  "id": "<aliasUuid>",
  "alias": "<Human Name>",
  "filter": {
    "type": "entitiesByGroupName",
    "resolveMultiple": true,
    "groupStateEntity": false,
    "groupType": "CUSTOMER",
    "entityGroupNameFilter": "<CustomerGroupName>"
  }
}
```
