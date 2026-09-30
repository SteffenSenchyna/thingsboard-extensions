---
name: action-drill-down
description: "drillDown widget action — a renderable TB JSON template pulled on-demand by dashboard-generator; slot rowClick for entity tables or tagActions for map widgets, navigates to a target dashboard state setting the entity param."
user-invocable: false
---

### drillDown (slot: `rowClick` for tables, `tagActions` for maps)
```json
{
  "type": "openDashboardState",
  "id": "<fresh-uuid>",
  "name": "<label or tag id — see note below>",
  "icon": "more_horiz",
  "targetDashboardStateId": "<target-state-id>",
  "setEntityId": true,
  "stateEntityParamName": "<targetStateEntity, e.g. selectedBuilding>"
}
```

**On the `name` field:**
- In `rowClick` (entityTable): `name` is the human-readable label shown in the row's drill-down hover (e.g. `"View Building Details"`).
- In `tagActions` (map widget tooltip): `name` is the machine identifier that the tooltip's `<link-act name='<id>'>...</link-act>` tag binds to. It must be a stable, link-safe string (e.g. `"view-details"`, `"navigate-to-building-details-from-map"`) and must match the `name` attribute in the corresponding `<link-act>` element exactly. The link text inside `<link-act>...</link-act>` is what the user sees.
