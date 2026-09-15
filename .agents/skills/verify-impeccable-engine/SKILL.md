---
name: verify-impeccable-engine
description: Validate changes to the pinned Impeccable engine, Design detector, host adapters, or plugin packages in this source repository. Runs isolated integration tests; excludes application UI reviews and live editor activation.
---

# Verify Impeccable engine

Run from the Design source repository with Node.js 22+, Git, unzip and installed project dependencies. Read the [feature index](features/README.md) for coverage and expected observations.

Run `npm run verify:impeccable-engine` for the focused engine and adapter suite, or `npm run verify:impeccable-engine -- --all` for every discovered `tests/**/*.test.mjs` file exactly once. `release-check` uses the complete suite. `npm test` remains independently usable. Unknown arguments fail. The helper creates its own temporary project and home directories, uses the pinned local engine, and runs the actual Design CLI and adapters through the repository tests. It never installs the plugin, activates an editor, downloads an engine, or publishes anything. All five artifacts are verified; only the current operating system and architecture are executed.

Read the printed evidence directory. `transcript.tap` contains test actions, failures and results; `result.json` records the exact test selection and mode, platform, pin, source hashes, process result and cleanup. Added, removed or changed source files fail the trial. Nonzero exit or a failed required case means validation failed. Diagnose the first failing assertion and its actual output; do not relax its expected outcome. An unavailable platform remains unexecuted.

The helper isolates the test process from any parent Node test context and cleans only its own temporary home after success or failure and checks that evidence survives. Keep the evidence directory for review; remove it only when its owner no longer needs it. For a read-only Review, this helper keeps all transient outputs outside the repository.

These are repository integration checks. Fresh Cursor and Codex tasks, Hook Trust and live editor behavior require the separately commissioned [Cursor smoke](../../../docs/runtime-smoke.md) and [Codex smoke](../../../docs/codex-runtime-smoke.md).
