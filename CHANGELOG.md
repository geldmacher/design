# Changelog

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
