# Impeccable upstream maintenance

Normal plugin use and `npm run release-check` are offline. They never install, download, or update Impeccable. `upstream/impeccable.pin.json` is the validated source of truth for the approved release and all current provenance projections.

To evaluate the approved pin offline, a maintainer separately obtains its exact tag checkout and `universal.zip`, then runs:

```bash
npm run sync:impeccable -- --source /absolute/path/to/tag-checkout --archive /absolute/path/to/universal.zip
```

That command reads the pin, verifies the annotated tag object, commit, archive SHA-256, and byte identity between the archive and tag checkout, performs all transformations in a temporary staging directory, and writes nothing. A known empty generated hook cache in the release archive is verified byte-for-byte and excluded; any other extra vendored-scope entry still fails closed. After reviewing the result, add `--apply`; use `--replace` only for an intentional replacement of an existing vendored copy.

Any missing patch anchor, new upstream layout, different tag/commit, or archive checksum aborts the sync. The command never contacts the network itself.

For explicit release detection and the reviewable candidate flow, see [Impeccable maintenance](../docs/impeccable-maintenance.md). Preparing a candidate writes only ignored staging content. Applying a selected candidate, committing, pushing, opening a pull request, deploying, publishing, and running hosted automation remain separate maintainer actions.

## Closed transformation list

1. Convert Impeccable's frontmatter to Agent Skills fields with SPDX licensing, Node compatibility, and string-valued `metadata.version`.
2. Replace generated project-local skill paths with `<IMPECCABLE_SKILL_ROOT>` and inject a host contract that resolves the actually loaded skill directory before command execution.
3. Add explicit provider routing: Cursor emits `/impeccable`, Codex emits `$impeccable`, the canonical Agent Plugins package emits bare `impeccable`, and unknown hosts fail diagnostically.
4. Preserve Cursor-native roles and add the Codex role contract: read the canonical prompt, start a fresh generic subagent without conversation fork or model override, or use the bundled degraded role in the standard package.
5. Keep native hook configuration management but bypass all project-local hook manifest installation; the plugin owns `hooks/cursor-hooks.json` for Cursor and `hooks/hooks.json` for Codex, while the Agent Plugins target reports hooks as unavailable.
6. Disable the runtime upstream update poll and redirect update/installer guidance to the plugin maintainer flow.
7. Disable project-local pinned shortcut generation.
8. Teach Impeccable context, doctor, pin, and staleness scripts to recognize native plugin hooks and the standard target's deliberate absence of hooks.

The complete generated patch and every before/after file hash are release artifacts, not narrative claims.
