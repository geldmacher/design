# GitHub Release validation

Design exposes exactly one repository-local release action: explicit `$release-plugin` in Codex, explicit `/release-plugin` in Cursor, or the underlying no-argument `npm run release:plugin`. These Maintainer interfaces are source-only and are absent from Cursor and Codex release packages.

The harness first proves reachable authenticated GitHub access, a configured Git commit identity, the expected `geldmacher/design` origin, synchronized `main`, consistent predeclared versions, a release-ready changelog, safe NUL-delimited candidate paths, and the complete `npm run release-check` plus `git diff --check` gate. It never chooses or increments a version.

When tracked changes remain, the harness creates one `Release v<version>` commit object, binds its parent, tree, and identity to a repository retry ref, and only then advances local `main`. It builds both native packages from an exactly materialized copy of that commit. The current checkout, `.build`, ignored files, and untracked files cannot supply release bytes.

The Cursor and Codex archives are deterministic and contain one `geldmacher-design/` root. Provenance binds the commit, Git tree, gate, exact target content and file counts, archive hashes, release notes, published inventory, and canonical receipt. Existing prepared directories are accepted only when every byte matches; a different directory is retained and blocks the run.

The harness accepts only a lightweight tag that resolves to the release commit. It updates `main` and the tag through one atomic push, stops on mixed remote state, creates a GitHub Release without overwrite or `--clobber`, downloads every published asset, and verifies its metadata and bytes. Exact matching remote releases are `current`. Failures leave observable local or remote state intact for an explicit, state-bound retry; the harness never force-pushes, resets, deletes, or repairs ambiguous state.

Fixture tests run entirely against temporary local Git repositories and local GitHub substitutes. They do not create a real repository commit, tag, push, or release.
