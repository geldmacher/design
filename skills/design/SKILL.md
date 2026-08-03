---
name: design
description: Use when the user invokes /design or asks for the Geldmacher Design router, project setup, status, diagnostics, or curated website and web-app design work. Routes general design work to the bundled Impeccable skill and narrower work to registered curated modules.
---

# /design

This is the stable Geldmacher Design router for websites and web apps. It adds integration and routing only. `PRODUCT.md`, `DESIGN.md`, and `.impeccable/` remain the sole shared project context.

## First step

Read [references/capabilities.md](references/capabilities.md). It is generated from the curated module manifests and is the routing authority.

## Routing

1. `/impeccable ...` is never intercepted. Load and follow the bundled `impeccable` skill directly.
2. For `/design setup`, `/design status`, or `/design doctor`, follow the lifecycle flow below.
3. For any other request, choose the single highest-specificity matching capability from the capability index.
4. If nothing narrower matches, load and follow `${CURSOR_PLUGIN_ROOT}/skills/impeccable/SKILL.md` with the user's request unchanged.
5. If equal-specificity capabilities match, ask one concise clarification question. Do not guess.
6. Combine capabilities only when every selected manifest explicitly lists every other capability in `combinableWith`.

Do not download skills, resolve dynamic URLs, install packages, or invent a module at runtime.

## Lifecycle

All commands keep the cwd at the user's project.

### `/design setup`

1. Run `node "${CURSOR_PLUGIN_ROOT}/scripts/design-cli.mjs" setup --json`.
2. Report conflicts and the exact proposed writes. A project-local `.cursor/skills/impeccable` or an Impeccable entry in `.cursor/hooks.json` is a conflict; never remove or overwrite it.
3. Ask for explicit confirmation before applying. Without a clear yes, stop with no writes.
4. After confirmation only, run `node "${CURSOR_PLUGIN_ROOT}/scripts/design-cli.mjs" setup --apply --json`.
5. If `PRODUCT.md` is missing, offer `/impeccable init`; do not create it implicitly. If an incumbent design should be captured and `DESIGN.md` is missing, offer `/impeccable document`.

### `/design status`

Run `node "${CURSOR_PLUGIN_ROOT}/scripts/design-cli.mjs" status --json` and report plugin/module versions, strict opt-in hook state, conflicts, and existing canonical context. This command is read-only.

### `/design doctor`

Run `node "${CURSOR_PLUGIN_ROOT}/scripts/design-cli.mjs" doctor --json`. Diagnose only. Do not repair anything unless the user separately asks for an apply action. Version 0.1.0 has no automatic repair that removes or rewrites project-local Impeccable installations or hook manifests.

## Safety boundary

- The plugin hook is inactive unless `.impeccable/config.json` parses and contains `hook.enabled: true`.
- A real Impeccable detector finding may deny a proposed UI write.
- Missing runtime files, malformed config, malformed hook input, or detector failure are visible diagnostics and allow the edit.
- Non-UI files remain unaffected by Impeccable's detector.
