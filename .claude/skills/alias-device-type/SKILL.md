---
name: alias-device-type
description: "deviceType entity alias — a renderable TB JSON template pulled on-demand by dashboard-generator that resolves all devices matching a given device profile type."
user-invocable: false
---

### deviceType
```json
{
  "id": "<aliasUuid>",
  "alias": "<Human Name>",
  "filter": {
    "type": "deviceType",
    "resolveMultiple": true,
    "deviceTypes": ["<DeviceProfileName>"]
  }
}
```
