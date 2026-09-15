# Engine and package boundaries

Use the verifier after changing the pin, importer, launcher or package builder. The setup is the source checkout with Node.js 22+, Git, unzip and `npm ci` already completed. No service or credentials are required.

`npm run verify:impeccable-engine` checks all five pinned file hashes, sizes and executable permissions, then invokes the native engine handshake. It exercises missing and altered files, unsupported platforms, symlink escape and ignored external runtime overrides. Each failure must remain a diagnostic; no binary is searched for or downloaded.

The package tests build all three targets in owned temporary directories, compare their inventories and provenance, and run self-contained CLI journeys. They check Design's automatic-selection metadata, Impeccable's explicit-only metadata, native host instructions, and exclusion of Cursor-only fields from Codex and portable skills. Shared instructions outside the intended host projection must remain identical. Maintainer files remain excluded. The complete `--all` suite also checks all seven source skills and the four explicit maintainer policies. These checks do not exercise model selection; use the separately commissioned host-smoke scenarios linked from the skill for that evidence.

The maintenance fixtures recheck release selection, archives, candidate drift and transactional write rollback. A successful write rollback is not a rollback of failed post-apply validation.

Candidate readiness also executes each package's thin launcher, Design detector and native adapters. The portable package runs without host environment variables and must identify its canonical manifest. Negative copies omit the shared runtime or emit invalid context output; readiness must reject both even while the pinned binary remains valid.

Inspect `transcript.tap` and `result.json` in the printed evidence directory. The result states the executed native platform and the other, unexecuted platforms. The helper removes its temporary home and each test removes its owned projects and package builds. Evidence stays outside those directories.
