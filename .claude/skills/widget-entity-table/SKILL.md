---
name: widget-entity-table
description: "Renderable TB JSON template for the entityTable widget. Pulled on-demand by dashboard-generator. Placeholders: <table title>, <aliasUuid>, <address>, <occupancy>."
user-invocable: false
---

# entityTable widget

`dataKeys` columns: `type` is `"entityField"`, `"attribute"`, or `"timeseries"`.
`config.actions` slots: `rowClick` for `drillDown`, `headerButton` for create, `actionCellButton` for edit/delete.

**Customer rows — `name` is `title`, not `"name"`:**

```json
{ "label": "Customer", "name": "title", "type": "entityField" }
```

A CUSTOMER row column with `"name": "name"` renders blank — `title` is the customer's display field.

```json
{
  "id": "<widgetUuid>",
  "type": "latest",
  "typeFullFqn": "system.cards.entities_table",
  "sizeX": <N>, "sizeY": <N>, "row": <N>, "col": <N>,
  "config": {
    "configMode": "basic",
    "title": "<table title>",
    "dropShadow": false,
    "borderRadius": "8px",
    "widgetStyle": { "box-shadow": "0px 2px 4px 0px #00000024;" },
    "titleFont": { "size": 21, "sizeUnit": "px", "weight": "500", "lineHeight": "22px" },
    "enableFullscreen": false,
    "enableDataExport": false,
    "showTitle": true,
    "padding": "4px",
    "datasources": [{
      "type": "entity",
      "entityAliasId": "<aliasUuid>",
      "dataKeys": [
        { "name": "name",        "label": "Name",        "type": "entityField", "color": "var(--tb-primary-500)", "settings": {} },
        { "name": "<address>",   "label": "Address",     "type": "attribute",   "color": "var(--tb-primary-500)", "settings": {} },
        { "name": "<occupancy>", "label": "Occupancy",   "type": "timeseries",  "color": "var(--tb-primary-500)", "settings": {}, "units": "%", "decimals": 0 }
      ]
    }],
    "settings": {
      "entitiesTitle": "<table title>",
      "displayEntityName": false,
      "displayEntityType": false
    },
    "actions": {
      "rowClick":         [ <drillDown action body> ],
      "headerButton":     [ <createEntityDialog action body> ],
      "actionCellButton": [ <editEntityDialog body>, <deleteEntityDialog body> ]
    }
  }
}
```

Only include slots that have actions. Empty slot arrays can be omitted.

**Customer datasources — display-name column.** When the datasource alias resolves to `CUSTOMER` entities (e.g. `customersByGroupName`), the entity-display column **must** use `{ "name": "title", "label": "Name", "type": "entityField" }` — customers store their display name in `title`, not `name`. Emitting `"name": "name"` produces an empty column. The same rule applies to any widget that surfaces a customer's display name through an `entityField` key — `headerCard`, `infoCard`, `actionButton`, `stateSwitcher`, etc.

Column `settings` for styled cells (e.g. status badge):
```json
"settings": {
  "useCellContentFunction": true,
  "useCellContentFunctionOnExport": true,
  "cellContentFunction": "let color = '#757575'; let backColor = '#F5F5F5'; let text = 'Inactive'; if (value == 'true') { text = 'Active'; color = '#E8EAF6'; backColor = '#303F9F'; } return `<span style=\"font-size:14px;color:${color};background:${backColor};padding:8px;border-radius:6px;\">${text}</span>`;"
}
```

---
