---
name: verify-impeccable-engine
description: Verify the pinned Impeccable engine, Design detector, hook adapters and package boundaries in isolated local projects.
---

# Verify Impeccable engine

Run from the Design source repository with Node.js 22+, Git, unzip and installed project dependencies. Read the [feature index](features/README.md) for coverage and expected observations.

Run `npm run verify:impeccable-engine`. The helper creates its own temporary project and home directories, uses the pinned local engine, and runs the actual Design CLI and adapters through the repository tests. It never installs the plugin, activates an editor, downloads an engine, or publishes anything. All five artifacts are verified; only the current operating system and architecture are executed.

Read the printed evidence directory. `transcript.tap` contains test actions, failures and results; `result.json` binds the result to the platform, pin and source hashes. Nonzero exit or a failed required case means validation failed. Diagnose the first failing assertion and its actual output; do not relax its expected outcome. An unavailable platform remains unexecuted.

The helper cleans only its own temporary home after success or failure and checks that evidence survives. Keep the evidence directory for review; remove it only when its owner no longer needs it. For a read-only Review, this helper keeps all transient outputs outside the repository.

These are repository integration checks. Fresh Cursor and Codex tasks, Hook Trust and live editor behavior require the separately commissioned [Cursor smoke](../../../docs/runtime-smoke.md) and [Codex smoke](../../../docs/codex-runtime-smoke.md).
