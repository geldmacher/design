# Design and hook journeys

Run `npm run verify:impeccable-engine` from the source root. The tests use foreign temporary working directories, including spaces, and isolated home/cache paths. They load PRODUCT.md and DESIGN.md, run context and doctor, and compare project and home contents before and after read-only commands.

A context query can write a staleness-notice cache even though it only reads project context. Keep home and cache isolation for direct engine probes as well as wrapper trials, and inspect their actual side effects. The wrapper's disposable notice cache must preserve diagnostics without leaving files in the user's home; the native-launcher fixture in `tests/impeccable-engine.test.mjs` checks unchanged project and home contents. Do not infer absence of writes from a command's read-only purpose.

The actual Design CLI scans a clean JSX fixture and a card with a colored left border. Expected outcomes are `no-findings` with exit 0 and the `side-tab` finding with exit 2. Advisory-only results keep exit 0. Missing targets and invalid output remain blocked with exit 1. Palette and fluid typography are exercised through the native reader.

The actual Cursor adapter denies the known card before writing. The Codex adapter emits PostToolUse context and a Stop blocking decision for deferred findings; repeating Stop in the same session is silent. Disabled hooks are silent where the host contract permits; malformed config, timeout and invalid output produce visible, non-blocking diagnostics.

Hook on/off/reset and ignore commands preserve unrelated configuration and host-manifest sentinels. Standalone install/update/pin aliases must refuse execution. Portable context uses inline role contracts; unknown role output is rejected rather than accepted as a supported native capability.

The built portable launcher preserves embedded project text verbatim, including ordinary product descriptions about subagents, literal native command examples, Markdown separators and example directive records. Host adaptation applies to engine instructions; a separate unknown engine role instruction must still fail visibly.

All three packaged launchers must load the same monorepo context from the app working directory and from the repository root with `--target`. Exercise both app-local overrides and inherited root files, preserving their embedded text. Engine-reported context paths are relative to the invocation working directory.

Monorepo trials retain the engine's app-selection response and resolve context/doctor hook state from the selected child, with opposite root and child settings. Direct `ignore` and `ignores` launcher calls must leave Git exclusions and other files outside `.impeccable/` unchanged. Doctor rejects `--fix`; generated context and packaged maintenance references must require authorization for migrations and avoid standalone downloads or manifest repair promises.

These local adapter events do not establish editor registration or activation. Browser/live-server and image-provider journeys are not exercised. On failure retain the TAP transcript and result, clean only the resources created by the failed exercise, and commission correction or missing host evidence separately.
