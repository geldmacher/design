# Fresh Cursor runtime smoke

Follow the [shared preparation and journeys](runtime-smoke-common.md), with the Cursor discovery and adapter checks below. This manual trial proves only the recorded Cursor behavior; it does not publish the plugin or establish untested host versions.

## Discovery

1. Reload the separately installed plugin, open only the disposable project and start a fresh conversation.
2. Confirm Design discovery and visible `/design` and `/impeccable` invocations.
3. Run `/design status` from the project rather than the plugin root. Compare identity and versions with the recorded package provenance; expect disabled hooks and the project context state.
4. Resolve `impeccable-asset-producer`, `impeccable-documenter`, `impeccable-finish-reviewer` and `impeccable-manual-edit-applier`. Files alone do not prove agent discovery.
5. Complete the shared detector, diagnosis, questionnaire, review and configuration journeys.

## Pre-write enforcement

1. Complete the [activation handoff](runtime-smoke-common.md#activation-handoff-to-host-adapter-checks) in this adapter test project, including confirmed setup and an enabled status read-back. Then write a clean UI component. Cursor must allow it.
2. Propose the [shared `side-tab` fixture](runtime-smoke-common.md#detector-and-native-engine) as a new HTML file. Cursor must deny the write before it lands.
3. Edit `README.md`; it must be unaffected. Follow the shared handoff's deactivation step, verify disabled status in this same project, and confirm the UI fixture can be written.
4. Repeat activation and deactivation. The original `.cursor/hooks.json` hash or absence must remain unchanged, without a second registration.

## Host conflicts and infrastructure failures

In disposable copies, add `.cursor/skills/impeccable/SKILL.md`, then separately a legacy Impeccable command in `.cursor/hooks.json`. Status must report shadowing or a double-hook conflict; setup must not remove or overwrite those files.

For the shared malformed-config case, a broken detector or unavailable Node runtime, expect a visible infrastructure diagnostic that does not deny the product edit. Restore each trial copy before testing the next case. Finish with the [shared closeout](runtime-smoke-common.md#closeout).
