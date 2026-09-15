---
name: design
description: Plan, build, critique, or refine website and web-app interfaces, including layout, accessibility, responsive behavior, and UI copy. Use for web UI tasks, not backend-only work or general code reviews. Also handles explicitly requested Design project operations.
license: MIT
compatibility: Requires Node.js 22 or newer.
---

# Design router

This is the stable Geldmacher Design router for websites and web apps. It adds integration and routing only. `PRODUCT.md`, `DESIGN.md`, and `.impeccable/` remain the sole shared project context.

<!-- design-host:start -->
## Host contract

Use the known active host, including when Design was selected automatically: Cursor uses `cursor`; Codex uses `codex`. Set `<host>` accordingly; an invocation prefix is not required. Keep the bundled launcher's `IMPECCABLE_HOST` consistent with that host. If the host is unknown, report it before running host-dependent commands rather than guessing. On Cursor, configured checks may deny a proposed UI write; Codex reports findings after an edit and through the deduplicated Stop pass. Configuration does not prove fresh host activation. Resolve the skill from its supplied absolute path or the active host's plugin root (`${CURSOR_PLUGIN_ROOT}` on Cursor, `${PLUGIN_ROOT}` on Codex); never use the foreign project cwd as the plugin root.

A project-local Impeccable skill or hook manifest may conflict with the plugin. Report conflicts and preserve those files; setup must never remove or overwrite them. Specialized roles and their invocation follow the bundled Impeccable host contract.
<!-- design-host:end -->

Resolve `<DESIGN_SKILL_ROOT>` to the absolute directory containing this `SKILL.md`. Replace all script placeholders before execution and keep cwd at the user's project. Never execute an unresolved placeholder.

## Routing

Use Design automatically only for a requested web-interface task. Respect an explicit choice of another skill. Selection authorizes work within the user's task, not project setup, hook activation, context migrations, installation, updates, deployment, or publication.

Read [references/capabilities.md](references/capabilities.md) and use it as the sole routing authority. Its command names identify operations after the client loads this skill, not universal client invocation syntax.

- For `design-core:project-integration`, follow the matching lifecycle operation below.
- For `design-core:detector-scan`, follow the Detect operation below.
- For `design-core:stakeholder-questionnaire`, read and follow [references/questionnaire.md](references/questionnaire.md).
- For `design-core:change-interface-review`, read and follow [references/change-review.md](references/change-review.md). The review is read-only and task-local.
- When the index selects Impeccable, load the bundled [impeccable skill](../impeccable/SKILL.md) with the user's request unchanged.

Do not download skills, resolve dynamic URLs, install packages, or invent a module at runtime.

## Lifecycle

All commands keep the cwd at the user's project.

### Setup

1. Run `node "<DESIGN_SKILL_ROOT>/scripts/design-cli.mjs" --host <host> setup --json` after replacing both placeholders.
2. Report conflicts and the exact proposed writes, including any existing local hook override. Preserve all unrelated settings.
3. Ask for explicit confirmation before applying. Without a clear yes, stop with no writes.
4. After confirmation only, run `node "<DESIGN_SKILL_ROOT>/scripts/design-cli.mjs" --host <host> setup --apply --json` after replacing both placeholders. When the host reports hooks as unavailable, this completes without enabling or emulating a hook.
5. If `PRODUCT.md` is missing, offer the loaded Impeccable skill’s `init` operation reported by setup; do not create it implicitly. If an incumbent design should be captured and `DESIGN.md` is missing, offer its `document` operation.

### Status

Run `node "<DESIGN_SKILL_ROOT>/scripts/design-cli.mjs" --host <host> status --json` after replacing both placeholders, then report plugin/module versions, hook availability, conflicts, and existing canonical context. This command is read-only.

### Diagnose

Run `node "<DESIGN_SKILL_ROOT>/scripts/design-cli.mjs" --host <host> diagnose --json` after replacing both placeholders. Read Design integration status and report conflicts. This command is read-only.

### Detect

1. Accept only `detect -- <target> [target...]` addressed explicitly to Design. Require at least one target after the `--` separator; do not infer a default target.
2. Run `node "<DESIGN_SKILL_ROOT>/scripts/design-cli.mjs" --host <host> detect --json -- <target> [target...]` after replacing both placeholders and passing every target as a separate, safely quoted argument.
3. Treat exit `0` as `no-findings` or `advisory-only`, exit `2` as primary findings, and exit `1` as `blocked`. Exit `2` is detector evidence, not an infrastructure failure.
4. Report the requested targets and detector provenance. Group findings by file, separate primary and advisory findings, and preserve each rule ID, line, snippet, and description.
5. Say `The detector returned no findings` for `no-findings`; never call the interface clean, correct, complete, or approved from detector output alone.
6. Keep the operation read-only. Do not edit source, configuration, ignores, or hooks. After findings, you may name the loaded Impeccable skill’s `polish <target>` operation as a separate optional next action, but never run it within `detect`.

## Safety boundary

- Optional checks stay disabled until explicitly enabled in canonical configuration. An existing `hook.enabled` in `.impeccable/config.local.json` overrides `.impeccable/config.json`.
- An explicit Detect operation remains available when checks are disabled and never enables them.
- Missing runtime files, malformed configuration or hook input, and detector failures remain visible diagnostics and allow the edit.
- Non-UI files remain unaffected by Impeccable's detector.
