# Release plugin

Follow the repository-local [Release Plugin skill](../../.agents/skills/release-plugin/SKILL.md) for this explicit invocation, including automatic SemVer selection and preparation without another approval. Run the underlying no-argument `npm run release:plugin` after preparation. The same retry, validation, atomic publication, and read-back requirements apply. Never deploy, install, force-push, overwrite assets, or use `--clobber`.
