# Design lifecycle

Load this reference only for `design-core:project-integration` or `design-core:detector-scan`. Ordinary UI editing does not need it.

All commands keep the cwd at the user's project. If the user identified an app or file target, append `--target <path>` as one safely quoted argument to status, diagnose, or checks; the engine resolves its project and inherited context. Preserve that target for preview, confirmed apply and readback. A repository-wide request can use `--target .`. When `readiness.scope.state` is `selection-required`, show the supplied candidates and ask for the relevant app or repository scope before any guided write or check apply. An unverified scope blocks those writes, not otherwise permitted UI work.

Resolve `<DESIGN_SKILL_ROOT>` to the directory containing the parent `SKILL.md`, and resolve `<IMPECCABLE_SKILL_ROOT>` to its sibling `../impeccable` directory. Never execute either placeholder unresolved.

The user command `setup` is the guide below. It reads status first and starts the check writer only in step 5, as a preview, until the separate confirmation in Checks. The user command `checks` is only the Checks section. `hooks on` and `hooks off` remain immediate toggles through the bundled skill.

## Setup

Follow this sequence. Name every follow-up the user can invoke through the active host's Design entry point, such as `/design init` or `$design init`. For a generic client, use the loaded `design` skill wording.

1. Read only. Run `node "<DESIGN_SKILL_ROOT>/scripts/design-cli.mjs" --host <host> status --json` after replacing both placeholders. Report versions, conflicts, canonical context, and whether checks are already enabled. When scope selection is required, stop and ask. Do not write.
2. If `PRODUCT.md` is missing, load and follow `<IMPECCABLE_SKILL_ROOT>/reference/init.md` through its completion gate, including its own build-path and live questions. Write only what that playbook confirms. Leave an existing `PRODUCT.md` unchanged. During that interview, do not offer `DESIGN.md`.
3. If an interface already exists and `DESIGN.md` is missing, offer `document` through the Design entry point and wait. Start the scan only after agreement. Leave an existing `DESIGN.md` unchanged.
4. If there is no interface yet and `DESIGN.md` is missing, ask once whether to lock a visual direction now. Ask only after step 2 has finished, and only in this case. Yes requires one named first surface, then follow the seed procedure in `<IMPECCABLE_SKILL_ROOT>/reference/document.md`. The user-facing form is `/design document --seed` or `$design document --seed`. No leaves `DESIGN.md` for the end of the first real build.
5. Offer optional checks by following Checks. That confirmation is separate from any earlier yes. Declining leaves the hook off. When the host reports hooks as unavailable, say so and do not emulate them.

## Checks

This section is the check writer. It changes only check configuration. It does not create or update `PRODUCT.md` or `DESIGN.md`.

1. Run `node "<DESIGN_SKILL_ROOT>/scripts/design-cli.mjs" --host <host> checks --json` after replacing both placeholders.
2. Report conflicts and the exact proposed writes, including any existing local hook override. Preserve all unrelated settings. Report the separation in the check-preview offers. If `PRODUCT.md` is missing, name init through the Design entry point in the offer as a separate confirmed step. Name document through that same entry point only when an incumbent interface should be captured, and skip it when the project has no interface yet. Do not run either operation from this preview. For a generic client, use the loaded `design` skill wording in the offer.
3. Ask for explicit confirmation before applying. Without a clear yes, do not apply; continue any separately requested UI work using available context.
4. After confirmation only, run `node "<DESIGN_SKILL_ROOT>/scripts/design-cli.mjs" --host <host> checks --apply --json` after replacing both placeholders. When the host reports hooks as unavailable, this completes without enabling or emulating a hook.

## Status

Run `node "<DESIGN_SKILL_ROOT>/scripts/design-cli.mjs" --host <host> status --json` after replacing both placeholders, then report plugin/module versions, effective hook availability, canonical context (including inheritance), and the shared `readiness` assessment. Disabled hooks are a valid choice, not incomplete setup. This command is read-only.

## Diagnose

Run `node "<DESIGN_SKILL_ROOT>/scripts/design-cli.mjs" --host <host> diagnose --json` after replacing both placeholders. Report the shared `readiness` assessment and findings, including available Impeccable maintenance evidence. Proposed repairs require a separate confirmed preview. This command is read-only; do not chain status, setup, checks, or another doctor call for the same assessment.

## Detect

1. Accept explicit `detect -- <target> [target...]` or a clear request to scan named local files with the detector. Require at least one explicitly supplied target; ask if missing. Always pass the targets after the CLI's `--` separator and never infer a default target.
2. Run `node "<DESIGN_SKILL_ROOT>/scripts/design-cli.mjs" --host <host> detect --json -- <target> [target...]` after replacing both placeholders and passing every target as a separate, safely quoted argument.
3. Treat exit `0` as `no-findings` or `advisory-only`, exit `2` as primary findings, and exit `1` as `blocked`. Exit `2` is detector evidence, not an infrastructure failure.
4. Report the requested targets and detector provenance. Group findings by file, separate primary and advisory findings, and preserve each rule ID, line, snippet, and description.
5. Say `The detector returned no findings` for `no-findings`; never call the interface clean, correct, complete, or approved from detector output alone.
6. Keep the operation read-only. Do not edit source, configuration, ignores, or hooks. After findings, you may name polish as a separate optional next action through the active host's Design entry point, for example `/design polish <target>` or `$design polish <target>`. For a generic client, describe it through the loaded `design` skill. Never run it within `detect`.
