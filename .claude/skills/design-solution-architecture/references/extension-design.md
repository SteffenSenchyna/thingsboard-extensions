# Extension design

Loaded by `design-solution-architecture` when `extension-enabled=true`. After writing the overview, design the extension surface inline and write `<workdir>/design/extension-design.json` (the extension contract). Using the interview context (what the user said when opting into extensions) plus the overview:

```json
{
  "endpoints": [
    {"path": "/api/extension/<feature>", "method": "POST", "purpose": "<one sentence>", "auth": "jwt", "request": {"field": "type"}, "response": {"field": "type"}, "security": "TENANT_ADMIN"}
  ],
  "scheduledTasks": [],
  "entityDependencies": {"customRoles": ["..."], "dashboardsReferencedByName": ["..."]}
}
```

Reference TB entities **by name** (or stable slug), never by UUID — `tb push` is multi-target. Then fold every `entityDependencies.customRoles` entry into the overview's **User Groups and Roles** table as a first-class role (permission `RU` unless the name implies admin/view-only), so the roles the extension needs exist in the design. Emit narration: `▸ extension design written`.
