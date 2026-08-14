# Changelog

## 0.5.0 - 2026-08-14

- Added explicit `/design detect -- <target...>` and `$design detect -- <target...>` read-only scans over the bundled Impeccable detector.
- Added a versioned Design JSON envelope with exact provenance, primary/advisory counts, normalized findings, honest blocked states, and stable exit codes.
- Added canonical project containment, required local targets, symlink-escape rejection, and no URL, stdin, package-installation, runtime-download, or automatic-fix path.
- Centralized bundled Impeccable path resolution, host environment, update suppression, and subprocess failures while preserving separate Cursor and Codex hook protocols.
- Routed change-scoped review detector evidence through the same Design-owned scan surface and kept direct Impeccable behavior upstream-owned.

## 0.4.0 - 2026-08-13

- Added `/design review` and `$design review` as a first-party, change-scoped interface review backed by bundled Impeccable context and detector evidence.
- Added deterministic quick/full mode contracts, task-local findings, explicit severity and change classifications, bounded rendering, and approved follow-up routing through Design to Impeccable.
- Added a self-contained JSON Git scope resolver for working, staged, branch, pull-request, ref, and exact range targets without switching the active checkout.
- Added real-repository fixtures for branch-plus-dirty work, untracked files, exclusions, ranges, renames, PR fetches, shallow history, detached HEAD, empty scopes, and in-progress Git operations.
- Preserved exactly two packaged skills, direct Impeccable invocation, opt-in host hooks, and the reproducibly pinned Impeccable upstream.

## 0.3.0 - 2026-08-11

- Added a deterministic Agent Plugins v1.0.0 package alongside the native Cursor and Codex packages.
- Added the canonical root manifest, vendored schema provenance, and Agent Skills frontmatter validation without adding runtime dependencies.
- Added an explicit portable provider with bare skill names, unavailable hook state, and bundled degraded-role fallbacks.
- Kept Cursor pre-write hooks, Codex PostToolUse/Stop hooks, native invocations, and role contracts separate and unchanged.
- Made every generated package self-contained by moving runtime Impeccable provenance into the packaged module.
- Added isolated lifecycle, provider, hook, path-containment, and deterministic package simulations for all three targets.
- Projected every portable Impeccable role path and live/context directive to its bundled degraded contract while preserving native package bytes.
- Restricted destructive target cleanup to the canonical repository output or a process-owned temporary build workspace with symlink checks.
- Made Codex deployment rollback remove partial activation, restore source and Marketplace state, reactivate the prior version when present, verify cache identity, and aggregate incomplete rollback errors.
- Isolated runtime and deployment simulations behind fixture-only home, Codex, XDG, and update-cache paths with escape sentinels.
- Clarified that Agent Plugins declares skill identities while discovery presentation and invocation syntax remain client-specific.
- Added one validated Impeccable pin manifest, an honest read-only upstream checker, reviewable prepare/apply candidates with drift detection and rollback, and a least-privilege issue-only weekly monitor while keeping runtime and release checks offline.

## 0.2.0 - 2026-08-03

- Added a Codex plugin package and repository-local Marketplace entry while preserving the Cursor package.
- Added explicit `$design` and `$impeccable` activation metadata for Codex.
- Made routing, project-state diagnostics, CLI invocation, and Impeccable provider output host-aware.
- Added an opt-in Codex PostToolUse and Stop adapter with fail-open diagnostics and no project hook installation.
- Preserved the four canonical roles for Cursor-native agents and documented the Codex generic-subagent contract without a model override.
- Converted vendored Impeccable host neutralization into reproducible sync transformations with updated hashes and patch evidence.
- Expanded validation and contract tests for both manifests, hosts, hooks, invocation prefixes, and role resolution.

## 0.1.0 - 2026-08-03

- Initial Cursor plugin with `/design` and direct `/impeccable` entry points.
- Impeccable 4.0.4 as a reproducibly pinned upstream core.
- Project-scoped, opt-in Cursor hook that fails open on infrastructure errors.
- Curated module registry, capability index, diagnostics, validator, and contract tests.
