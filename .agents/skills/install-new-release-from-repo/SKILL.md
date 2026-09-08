---
name: install-new-release-from-repo
description: Install or preview the latest published stable Design release for the selected Cursor or Codex harness from the open Design source repository. Use only when the user explicitly invokes $install-new-release-from-repo or its Cursor command.
---

# Install new Release from repo

Work from the open Design source repository. This source-only skill supports first installation and updates; it is not included in installed plugin packages. Follow the [installation guide](../../../docs/installation.md) for prerequisites and activation boundaries.

1. Confirm this checkout contains `package.json` and `scripts/install-release-from-repo.mjs`. Do not search sibling repositories or install another plugin.
2. An invocation without an action requests one installation of the latest published stable release. `preview` requests preparation and inspection only. Resolve the host independently: honor an explicit Cursor or Codex target; otherwise use the known active harness. The Cursor command identifies Cursor. If the active harness is unknown, ask which of the two hosts to use. Do not infer it from installed binaries or default to both hosts.
3. Run `npm run install:release -- --cursor-only` for Cursor or `npm run install:release -- --codex-only` for Codex. Append `--dry-run` for preview. The helper resolves the published release, prepares an isolated checkout at its tag's exact commit, installs locked build dependencies, validates the bundles, and shows the concrete installation before applying it. Preview may download and build temporary source, but does not change plugin installation state.
4. The explicit install invocation authorizes that one selected-host installation, including the helper's preview and apply. Do not ask for another approval for the same work; respect host sandbox permissions. Do not replace the helper with a pull, branch switch, manual file copy, direct Marketplace edit, cache deletion, upstream installer, or downloaded shell command.
5. Report the release tag and commit, installed local version, destination, verified status, no-op or changed result, and remaining activation work. Local versions have a content-derived `+local.<host>.<digest>` suffix: this is a build from released source, not a claim of byte identity with a GitHub ZIP. After actual changes, ask the user to reload Cursor or start a new Codex task and review changed hooks. A no-op requires no new activation action; it does not prove a previous activation happened.

Stop on missing prerequisites, an unavailable release, source/version mismatch, failed validation, installation, rollback, or cache verification. Report the failure and the retained `installation.json` path, including its phase and any completed changes. A retry requires a new explicit invocation; do not blindly retry an incomplete rollback. Never restart hosts, grant hook trust, enable Design project checks, commit, push, or publish.
