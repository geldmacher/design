# Fresh Cursor runtime smoke

Follow the [shared preparation and journeys](runtime-smoke-common.md), with the Cursor discovery and adapter checks below. This manual trial proves only the recorded Cursor behavior; it does not publish the plugin or establish untested host versions.

## Discovery

1. Reload the separately installed plugin, open only the disposable project and start a fresh conversation.
2. Confirm Design discovery and visible `/design` and `/impeccable` invocations.
3. Complete the shared skill-selection scenarios, then run `/design status` from the project rather than the plugin root. Compare identity and versions with the recorded package provenance; expect disabled hooks and the project context state.
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

## Free Motion journey

After the separately authorized native installation, start a fresh task in a disposable web project. Confirm Design, Impeccable and Motion are discoverable, but only Design competes for automatic selection. Directly invoke the host's Motion skill and then ask Design a Motion API question. General animation art direction and explicit Impeccable operations must retain their previous route.

Confirm exactly one bundled anonymous Motion server at `https://mcp.motion.dev`, with no paid endpoint or account. Ask for React `AnimatePresence` documentation: observe the actual `search-motion-docs` call and a native read of a returned free documentation resource. Read a freely available example when returned; distinguish source from metadata-only suggestions. Retain tool names, resource URIs, response evidence and package provenance without project secrets.

Disable the Motion server through the host's own UI in this owned trial, then ask for animation advice again. Local guidance must remain usable; the agent must report missing current-documentation evidence without installing, logging in or guessing successful retrieval. Restore only this trial's changed host setting. Status remains offline and reports connectivity as not checked.

Use a disposable existing `framer-motion` project and request advice only. Response directives suggesting migration, package installation or paid examples must not cause edits, login or promotion. Ask for a MotionScore audit or CSS easing generation: the integration must explain its unsupported scope without invoking paid or newly advertised tools. Check reduced-motion guidance and preserve the user's requested target.

Record pass/fail per observation, source hash and cleanup. Missing tool/resource access leaves the relevant runtime case unverified; source tests alone cannot clear it. Do not delete another installation or alter shared project configuration to manufacture a passing result.
