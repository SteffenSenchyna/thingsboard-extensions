---
name: action-create-entity-dialog
description: "createEntityDialog widget action — a renderable TB JSON template pulled on-demand by dashboard-generator; slot headerButton, opens a Thymeleaf-rendered dialog to create a new entity."
user-invocable: false
---

### createEntityDialog (slot: `headerButton`)

This action renders a dialog form using Thymeleaf templates. The `customFunction` (JS) and
`customHtml` (HTML) are generated from templates in
`@/Users/steffensenchyna/.thingsboard/resources/templates/widget-action/`.

Read and render the templates to generate the content. Variables needed:
- `dialogTitle` — spec.dialogTitle
- `createEntity` — `true`
- `entityType` — e.g. `ASSET`
- `entitySubType` — profile name (e.g. `Building`)
- `entityOwner` — state entity param for owner (e.g. `selectedCustomer`), or empty
- `targetEntityGroups` — `["Building"]` (profile name list)
- `entityFieldsControls` — form controls for entity fields (name, label, etc.). **When `entityType` is `CUSTOMER`, the primary name field's `key` MUST be `title`, not `name`.** Example:

  ```json
  { "key": "title", "keyType": "entityField", "label": "Company Name", "type": "text", "required": true }
  ```

  A CUSTOMER createEntityDialog with `{ "key": "name", ... }` saves an empty title; every customer row in tables / dashboards / drill-down headers then renders blank.
- `attributesControls` — form controls for attribute fields
- `attributeKeys` — array of attribute key strings
- `hasProfile`, `hasAttributes`, `hasRelations` — boolean flags
- `profileFieldControl`, `relationFieldsControls` — if applicable
- `createRelations` — relations to create on save (e.g. `[{fromStateEntity, toStateEntity, type}]`)

```json
{
  "type": "customPretty",
  "id": "<fresh-uuid>",
  "name": "<label, e.g. Create Building>",
  "icon": "add",
  "customFunction": "<rendered from entity-dialog.js template>",
  "customHtml": "<rendered from entity-dialog.html template>"
}
```
