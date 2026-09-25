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

Use Design for requested web-interface tasks and clear requests for its project operations, including natural-language requests without a command name. Respect an explicit choice of another skill. Ordinary UI work authorizes a read-only readiness check, not project setup, hook activation, context migrations, installation, updates, deployment, or publication.

Read [references/capabilities.md](references/capabilities.md) and use it as the sole routing authority. Its command names identify operations after the client loads this skill, not universal client invocation syntax.

- For `design-core:project-integration` or `design-core:detector-scan`, read and follow [references/lifecycle.md](references/lifecycle.md). Detect accepts explicit `detect -- <target> [target...]` and stays read-only. Load that reference only for those operations.
- For `design-core:stakeholder-questionnaire`, read and follow [references/questionnaire.md](references/questionnaire.md).
- For `design-core:change-interface-review`, read and follow [references/change-review.md](references/change-review.md). The review is read-only and task-local.
- For `motion:animation-implementation`, load the bundled [Motion skill](../motion/SKILL.md). Reuse this operation's readiness result. Keep Impeccable as the art-direction authority and use Motion only for the requested technical work.
- When the index selects Impeccable, load the bundled [impeccable skill](../impeccable/SKILL.md) and follow the index's selection procedure: honor an explicit operation, otherwise choose from the loaded skill's current descriptions and playbooks. Keep the user's request unchanged and state an inferred choice briefly before proceeding.

Do not download skills, resolve dynamic URLs, install packages, or invent a module at runtime.

## Shared readiness preflight

Before commissioned UI planning, implementation, or evaluation, including explicit or inferred Impeccable operations and Design review/detect, follow [references/readiness.md](references/readiness.md). Reuse a readiness result within the task while its app, configuration, and integration are unchanged; run it again when any of those change, not between ordinary edits. Setup, status and diagnose already perform this assessment and must not recurse. Questionnaire reads available canonical context without a setup prerequisite. Advice-only requests and bare menus do not start this preflight.

## Safety boundary

- Optional checks stay disabled until explicitly enabled in canonical configuration. An existing `hook.enabled` in `.impeccable/config.local.json` overrides `.impeccable/config.json`.
- An explicit Detect operation remains available when checks are disabled and never enables them.
- Missing runtime files, malformed configuration or hook input, and detector failures remain visible diagnostics and allow the edit.
- Non-UI files remain unaffected by Impeccable's detector.
