---
name: create-extension
description: "Generate a backend extension feature (REST controller, scheduled task, or both) for behavior ThingsBoard can't express natively — user profiles with default dashboards, cross-customer aggregation, custom widget actions, custom validation on entity changes. Dispatches the extension-builder Sonnet agent against <project>/extension/."
user-invocable: true
---

# Create Extension Feature

Thin dispatcher. Delegates all code generation to the `extension-builder` agent (Sonnet). The skill owns three things only:

1. Ensure `<workdir>/extension/` exists (running `tb extension new` if not).
2. Resolve the edition (`PE` for self-hosted / `PaaS` for ThingsBoard Cloud) before dispatch — the agent does not ask the user about edition.
3. Surface the agent's structured return value verbatim.

## Inputs

| Arg | Type | Required | Meaning |
|-----|------|----------|---------|
| `workdir` | absolute path | yes | Project root (the `tb init`'d dir, NOT a solution dir). The skill operates on `<workdir>/extension/`. |
| `brief` | string \| absolute path | yes | Free-form natural-language ask, OR an absolute path to a JSON brief (e.g. `extension-design.json` from `/create-solution`). |
| `edition` | `PE` \| `PaaS` | no | PE = self-hosted ThingsBoard, PaaS = ThingsBoard Cloud. If omitted, resolved per the order below. |
| `invoked-by-create-solution` | bool | no | When `true`, skip the after-return dashboard-wiring offer (the orchestrator handles dashboards separately). |

### workdir verification (before anything else)

```bash
[[ "$workdir" = /* ]] || { echo "Error: workdir '$workdir' must be an absolute path"; exit 1; }
[ -d "$workdir" ] || { echo "Error: workdir not found: $workdir"; exit 1; }
[ -f "$workdir/thingsboard.json" ] || { echo "Error: $workdir/thingsboard.json missing — workdir must be a ThingsBoard project root (run \`tb init\`)"; exit 1; }
```

If `brief` looks like an absolute path (`/…`), verify it exists with `[ -f "$brief" ]` and read it; otherwise treat it as the natural-language string verbatim.

## Action

### Step 1 — Resolve edition

Resolution order (first match wins):

1. **Caller-supplied `edition` arg** → use it.
2. **Brief contains an explicit edition field** — when `brief` is a JSON path, parse it; if a top-level `edition` key is present with value `PE` / `PaaS`, use it.
3. **Existing extension dir** — if `<workdir>/extension/pom.xml` exists, derive the edition from its `<thingsboard-client.artifactId>` element:

   ```bash
   WORKDIR="$workdir" python3 -c "import os; from pathlib import Path; from thingsboard_cli.core.extension_starter_unpacker import parse_pom_artifact_id, edition_from_artifact_id; print(edition_from_artifact_id(parse_pom_artifact_id(Path(os.environ['WORKDIR']) / 'extension' / 'pom.xml')) or '')"
   ```

   (Passing `$workdir` through an env var avoids shell-quoting bugs when the path contains spaces or quotes.)

   If the existing dir's edition is well-defined, it **wins** — `tb extension new` was already run to establish it; do not second-guess.
4. **Fallback** — leave it unresolved and let `tb extension new` infer it from the active CLI profile URL (cloud → PaaS, else PE). The CLI prints the resolved edition in its output.

Print one line summarizing the resolved value, e.g.:

```
Edition: PE (from pom.xml)
```

### Step 2 — Ensure the extension dir exists

If `<workdir>/extension/pom.xml` does NOT exist, run from `$workdir`:

```bash
tb extension new --name <extension-name> --edition <RESOLVED_EDITION>
```

`<extension-name>` becomes the **local Docker image name** for the project's extension (e.g. `acme-telemetry-extension`). It is stored in `thingsboard.json` under `extension.name` and can be changed later with `tb extension rename <new-name>`. Derive a sensible default from the project directory basename (kebab-case, lowercase letters/digits/dashes only, must start with a letter or digit, 1–128 chars, no slashes) — `--name` is required in non-TTY contexts (this skill always runs as an agent, so the interactive prompt is not available).

Omit `--edition` if Step 1 reached the fallback (`tb extension new` will resolve it from the profile and print the result). Stream `tb extension new`'s output to the parent so the user sees the unpack progress.

If `tb extension new` fails, stop and surface its stderr verbatim. Do NOT try to fix the project layout.

### Step 3 — Dispatch the extension-builder agent

Use the `Agent` tool with `subagent_type=extension-builder` and `description="build extension"`. Pass exactly:

- `workdir`: `<workdir>/extension/` (absolute path; the agent operates on the unpacked extension dir).
- `brief`: when the input was a JSON path, pass the parsed JSON object; when it was a string, pass the string verbatim.
- `edition`: the resolved value from Step 1. If Step 1 hit the fallback, re-derive it from the now-existing `pom.xml` using the same env-var-safe one-liner above. **If re-derivation returns an empty string, stop and report — `tb extension new` should have produced a valid `pom.xml`; do not dispatch the agent with an empty edition.**

Print the agent's structured return block verbatim. The only thing you may append below it is the `Auth setup:` block(s) per the rubric — no other prose. On agent error, stop and surface the error verbatim — the caller depends on knowing whether the feature was generated.

Apply the rubric in "Auth requirements" → "Pattern decision rubric" against the brief BEFORE this step so you know which `Auth setup:` block(s) to emit after the agent's return prints. Do not feed the rubric result to the agent — the agent generates code from the brief and edition only; the auth surfacing is the skill's job, not the agent's.

### Step 4 — After-return offer (standalone only)

If `invoked-by-create-solution` is `true`, skip this step entirely.

Otherwise, after the agent returns successfully, emit exactly:

```
Want me to wire this to a dashboard? Reply with the dashboard name or `no`.
```

If the user replies with a dashboard name (anything other than `no` / `skip` / empty), dispatch the `design-dashboards` skill with `extension-only=true` and the chosen dashboard name. If the user declines, return silently.

## On error

- workdir invalid → stop with the one-line check error above; do not attempt to create the project.
- `tb extension new` fails → surface stderr, stop.
- Edition mismatch between resolved value and existing `pom.xml` → the agent's Gate 1 will catch it and return a one-line mismatch error; surface it verbatim.
- Agent exits with a compile failure → surface its `Compile failed after 3 attempts.` block (including the log path) verbatim.

## Auth requirements

Reference material the skill uses to surface auth-setup instructions to the user after the agent returns. The dispatched `extension-builder` agent generates code from the brief and edition only — it does not read this rubric. The orchestrator (this skill) applies the rubric to the brief, then appends the matching `Auth setup:` block(s) below the agent's return so the user sees the setup steps **before** they run `tb extension build`.

The auth contract depends on how the generated code calls ThingsBoard. The three patterns are mutually exclusive — pick one per feature from the brief.

### Pattern decision rubric

Apply in order. First match wins.

| Brief signal | Pattern | How `ThingsboardClient` is authenticated |
|---|---|---|
| "rule chain", "REST API Call node", "ENTITY_CREATED", "POST_TELEMETRY_REQUEST", "ALARM_CREATED", any rule-engine trigger | **API key (inbound)** | Controller takes a `ThingsboardClient` method parameter. The starter resolves it from the inbound `X-Authorization: ApiKey <key>` header. **No env vars on the extension side.** |
| "widget", "dashboard button", "on-click action", "widget callback", "from the dashboard" | **JWT (inbound)** | Controller takes a `ThingsboardClient` method parameter. The starter resolves it from the inbound `X-Authorization: Bearer <jwt>` header. ThingsBoard's widget runtime attaches the caller's JWT automatically — **no manual auth in the widget JS, no env vars on the extension side.** |
| "schedule", "every N minutes", "every hour", "periodic", "background job", "cron", "@Scheduled" | **Configured credentials (server-side)** | Scheduled component injects `ThingsboardClient` via constructor. There is no request context, so the bean is built from env vars (`TB_AUTH_API_KEY`, or `TB_AUTH_USERNAME` + `TB_AUTH_PASSWORD`) read at startup. **Required on the extension side.** |
| Pure utility endpoint with no `ThingsboardClient` use (e.g. a stateless calculator) | **None** | Controller has no `ThingsboardClient` parameter. Nothing to configure. |

If the brief mixes signals (e.g. a controller + a scheduled refresh job), record two patterns — one per component — and surface both `Auth setup:` blocks after the agent's return (see "Surfacing the auth setup block" below).

### Critical scheduled-task gotcha

The starter declares `@ConditionalOnBean(ThingsboardClient.class)` on every `@Scheduled` component (this is mandatory; see `extension-builder.md` Step 5).

- If `TB_AUTH_API_KEY` / `TB_AUTH_USERNAME` + `TB_AUTH_PASSWORD` are **not** set in `deploy/.env`, the `ThingsboardClient` bean is **absent**, the conditional skips the entire component, and the `@Scheduled` method **silently never runs**.
- The extension boots cleanly. The logs show nothing wrong. The user discovers the feature is dead only when they notice telemetry that should have arrived never did — often hours or days later.

This is the single most important thing to surface at generation time for scheduled features. Do not rely on the user to notice the silence.

### Surfacing the auth setup block

The skill — not the dispatched agent — emits the `Auth setup:` block. The agent's job is to generate code; the orchestrator (this skill) recognizes the pattern from the brief and appends the user-facing setup instructions after the agent's return.

Flow:

1. Apply the rubric above to the parsed brief BEFORE dispatching. Record the pattern(s) — `api-key` / `jwt` / `scheduled` / `none`. If the brief mixes signals (controller + scheduled job), record one pattern per component.
2. After Step 3 (dispatch the agent) succeeds and the agent's return has been printed, emit one `Auth setup:` block per recorded pattern using the canned wordings below. Match the order of components in the agent's return.
3. Skip the block entirely if the only pattern is `none`.

If you cannot confidently pick a pattern from the brief (signals are too vague), emit a one-line note instead: `Auth setup: review the auth pattern in the controller signature — see SKILL.md → Auth requirements rubric.` This punts to the user rather than guessing wrong.

Use these wordings (adapt the entity-specific bits, but keep the env-var names and header schemes exact):

**API-key pattern (rule-chain callback):**

```
Auth setup:
  Before this works, create an API key in ThingsBoard (Security → API Keys → Add new)
  and use it in the Rule Chain → REST API Call node's header:
    X-Authorization: ApiKey <your-key>
  (see ThingsBoard docs → Security → API Keys)
```

**JWT pattern (widget callback):**

```
Auth setup:
  Widgets use the caller's JWT automatically — no extra config in the widget JS.
  For ThingsBoard Cloud, set CORS_ALLOWED_ORIGINS in deploy/.env to your tenant
  origin or browser calls will be blocked by CORS. On-premise (same-origin via
  HAProxy) needs nothing.
```

**Scheduled pattern (background job):**

```
Auth setup:
  Before this runs, set credentials in deploy/.env (copy from deploy/.env.example):
    TB_AUTH_API_KEY=<api-key>                       # preferred
  — or —
    TB_AUTH_USERNAME=<email>
    TB_AUTH_PASSWORD=<password>
  Without creds, @ConditionalOnBean(ThingsboardClient.class) silently skips the
  bean and the @Scheduled method NEVER executes. The extension will boot cleanly
  and produce no errors — only silence.
  (see ThingsBoard docs → Security → API Keys for the API-key option)
```

**No-auth pattern (pure utility):**

```
Auth setup: none — this endpoint does not call ThingsBoard APIs.
```

If the feature has multiple components with different patterns, emit one `Auth setup:` sub-block per component, labeled by component name (e.g. `Auth setup (controller):` and `Auth setup (scheduled task):`).

### Env vars reference

All extension-side env vars are documented in `<workdir>/deploy/.env.example` (consolidated — one file for both on-premise and ThingsBoard Cloud). On the deploy host, the user copies it to `deploy/.env` and fills in the values. Keys relevant to auth:

| Var | Used by | Notes |
|---|---|---|
| `TB_AUTH_API_KEY` | scheduled tasks | Preferred. Create in TB UI → Security → API Keys. |
| `TB_AUTH_USERNAME` | scheduled tasks | Fallback. Use only if API keys are unavailable. |
| `TB_AUTH_PASSWORD` | scheduled tasks | Pairs with `TB_AUTH_USERNAME`. |
| `CORS_ALLOWED_ORIGINS` | widget-callback controllers (cross-origin only) | Required for ThingsBoard Cloud (browser → extension cross-origin). Leave blank for on-premise (same-origin via HAProxy). |

Neither the agent nor the skill writes to `deploy/.env` or modifies `deploy/.env.example`. Surfacing the requirement via the orchestrator's `Auth setup:` block is enough — the user owns the deploy host's environment.
