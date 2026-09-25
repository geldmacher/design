# Design lifecycle

Load this reference only for `design-core:project-integration` or `design-core:detector-scan`. Ordinary UI editing does not need it.

All commands keep the cwd at the user's project. If the user identified an app or file target, append `--target <path>` as one safely quoted argument to setup, status or diagnose; the engine resolves its project and inherited context. Preserve that target for preview, confirmed apply and readback. A repository-wide request can use `--target .`. When `readiness.scope.state` is `selection-required`, show the supplied candidates and ask for the relevant app or repository scope before setup. An unverified scope blocks setup writes, not otherwise permitted UI work.

## Setup

1. Run `node "<DESIGN_SKILL_ROOT>/scripts/design-cli.mjs" --host <host> setup --json` after replacing both placeholders.
2. Report conflicts and the exact proposed writes, including any existing local hook override. Preserve all unrelated settings.
3. Ask for explicit confirmation before applying. Without a clear yes, do not apply setup; continue any separately requested UI work using available context.
4. After confirmation only, run `node "<DESIGN_SKILL_ROOT>/scripts/design-cli.mjs" --host <host> setup --apply --json` after replacing both placeholders. When the host reports hooks as unavailable, this completes without enabling or emulating a hook.
5. If `PRODUCT.md` is missing, offer the loaded Impeccable skill’s `init` operation reported by setup; do not create it implicitly. If an incumbent design should be captured and `DESIGN.md` is missing, offer its `document` operation.

## Status

Run `node "<DESIGN_SKILL_ROOT>/scripts/design-cli.mjs" --host <host> status --json` after replacing both placeholders, then report plugin/module versions, effective hook availability, canonical context (including inheritance), and the shared `readiness` assessment. Disabled hooks are a valid choice, not incomplete setup. This command is read-only.

## Diagnose

Run `node "<DESIGN_SKILL_ROOT>/scripts/design-cli.mjs" --host <host> diagnose --json` after replacing both placeholders. Report the shared `readiness` assessment and findings, including available Impeccable maintenance evidence. Proposed repairs require a separate confirmed preview. This command is read-only; do not chain status, setup or another doctor call for the same assessment.

## Detect

1. Accept explicit `detect -- <target> [target...]` or a clear request to scan named local files with the detector. Require at least one explicitly supplied target; ask if missing. Always pass the targets after the CLI's `--` separator and never infer a default target.
2. Run `node "<DESIGN_SKILL_ROOT>/scripts/design-cli.mjs" --host <host> detect --json -- <target> [target...]` after replacing both placeholders and passing every target as a separate, safely quoted argument.
3. Treat exit `0` as `no-findings` or `advisory-only`, exit `2` as primary findings, and exit `1` as `blocked`. Exit `2` is detector evidence, not an infrastructure failure.
4. Report the requested targets and detector provenance. Group findings by file, separate primary and advisory findings, and preserve each rule ID, line, snippet, and description.
5. Say `The detector returned no findings` for `no-findings`; never call the interface clean, correct, complete, or approved from detector output alone.
6. Keep the operation read-only. Do not edit source, configuration, ignores, or hooks. After findings, you may name the loaded Impeccable skill’s `polish <target>` operation as a separate optional next action, but never run it within `detect`.
