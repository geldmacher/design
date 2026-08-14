---
name: design
description: Use when the user explicitly invokes /design in Cursor or $design in Codex for project setup, status, diagnostics, stakeholder questionnaires, explicit local detector scans, change-scoped interface review, or curated website and web-app design work. Routes general design work to the bundled Impeccable skill and narrower work to registered curated modules.
license: MIT
compatibility: Requires Node.js 22 or newer.
---

# Design router

This is the stable Geldmacher Design router for websites and web apps. It adds integration and routing only. `PRODUCT.md`, `DESIGN.md`, and `.impeccable/` remain the sole shared project context.

## Host contract

Determine the active host from the invocation: Cursor uses `/design` and `/impeccable`; Codex uses `$design` and `$impeccable`; a generic Agent Plugins client loads the bare `design` and `impeccable` skill names. Resolve `<DESIGN_SKILL_ROOT>` to the absolute directory containing this `SKILL.md`, replace `<host>` with `cursor`, `codex`, or `agent-plugin`, and keep cwd at the user's project. Never execute an unresolved placeholder.

## First step

Read [references/capabilities.md](references/capabilities.md). It is generated from the curated module manifests and is the routing authority.

## Routing

1. An explicit `/impeccable ...` or `$impeccable ...` request is never intercepted. Load and follow the bundled [impeccable skill](../impeccable/SKILL.md) directly.
2. For `/design setup|status|doctor` or `$design setup|status|doctor`, follow the lifecycle flow below.
3. When `design-core:detector-scan` wins, follow the explicit detector flow below.
4. When `design-core:stakeholder-questionnaire` wins, read and follow [questionnaire.md](references/questionnaire.md).
5. When `design-core:change-interface-review` wins, read and follow [change-review.md](references/change-review.md). The review is read-only and task-local.
6. For any other request, choose the single highest-specificity matching capability from the capability index.
7. If nothing narrower matches, load and follow the bundled [impeccable skill](../impeccable/SKILL.md) with the user's request unchanged.
8. If equal-specificity capabilities match, ask one concise clarification question. Do not guess.
9. Combine capabilities only when every selected manifest explicitly lists every other capability in `combinableWith`.

Do not download skills, resolve dynamic URLs, install packages, or invent a module at runtime.

## Lifecycle

All commands keep the cwd at the user's project.

### `design setup`

1. Run `node "<DESIGN_SKILL_ROOT>/scripts/design-cli.mjs" --host <host> setup --json` after replacing both placeholders.
2. Report conflicts and the exact proposed writes. A host-local Impeccable skill or hook entry (`.cursor/...` on Cursor, `.agents/skills/...` or `.codex/hooks.json` on Codex) is a conflict; never remove or overwrite it.
3. Ask for explicit confirmation before applying. Without a clear yes, stop with no writes.
4. After confirmation only, run `node "<DESIGN_SKILL_ROOT>/scripts/design-cli.mjs" --host <host> setup --apply --json` after replacing both placeholders. In the generic Agent Plugins target this completes without enabling or emulating a hook.
5. If `PRODUCT.md` is missing, offer the host-native Impeccable `init` invocation reported by setup; do not create it implicitly. If an incumbent design should be captured and `DESIGN.md` is missing, offer the corresponding `document` invocation.

### `design status`

Run `node "<DESIGN_SKILL_ROOT>/scripts/design-cli.mjs" --host <host> status --json` after replacing both placeholders, then report plugin/module versions, hook availability, conflicts, and existing canonical context. This command is read-only.

### `design doctor`

Run `node "<DESIGN_SKILL_ROOT>/scripts/design-cli.mjs" --host <host> doctor --json` after replacing both placeholders. Diagnose only. Do not repair anything unless the user separately asks for an apply action.

### `design detect`

1. Accept only `detect -- <target> [target...]` addressed explicitly to Design. Require at least one target after the `--` separator; do not infer a default target.
2. Run `node "<DESIGN_SKILL_ROOT>/scripts/design-cli.mjs" --host <host> detect --json -- <target> [target...]` after replacing both placeholders and passing every target as a separate, safely quoted argument.
3. Treat exit `0` as `no-findings` or `advisory-only`, exit `2` as primary findings, and exit `1` as `blocked`. Exit `2` is detector evidence, not an infrastructure failure.
4. Report the requested targets and detector provenance. Group findings by file, separate primary and advisory findings, and preserve each rule ID, line, snippet, and description.
5. Say `The detector returned no findings` for `no-findings`; never call the interface clean, correct, complete, or approved from detector output alone.
6. Keep the operation read-only. Do not edit source, configuration, ignores, or hooks. After findings, you may name the host-native Impeccable `polish <target>` invocation as a separate optional next action, but never run it within `detect`.

## Safety boundary

- The plugin hook is inactive unless `.impeccable/config.json` parses and contains `hook.enabled: true`.
- An explicit `design detect` remains available when the hook is disabled and never enables it.
- On Cursor, a real Impeccable detector finding may deny a proposed UI write. On Codex, findings arrive after the edit and again through the deduplicated Stop deep pass.
- Agent Plugins v1 does not standardize hooks or native subagents. Its portable target reports hooks as unavailable and uses Impeccable's bundled degraded role instructions.
- Missing runtime files, malformed config, malformed hook input, or detector failure are visible diagnostics and allow the edit.
- Non-UI files remain unaffected by Impeccable's detector.
