# Install new Release from repo

Follow the repository-local [Install new Release from repo skill](../../.agents/skills/install-new-release-from-repo/SKILL.md). This command identifies the active harness as Cursor; honor an explicitly requested Codex target instead.

Run `npm run install:release -- --cursor-only` for the default installation. Append `--dry-run` for `preview`; use `--codex-only` instead when Codex was explicitly selected. The same prerequisite, release, validation, permission, failure, and activation boundaries apply.
