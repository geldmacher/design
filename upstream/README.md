# Impeccable upstream maintenance

Normal plugin use and `npm run release-check` are offline. They never install, download, or update Impeccable.

To evaluate the currently approved pin, a maintainer separately downloads the official `skill-v4.0.4` tag checkout and `universal.zip`, then runs:

```bash
npm run sync:impeccable -- --source /absolute/path/to/tag-checkout --archive /absolute/path/to/universal.zip
```

That command verifies the annotated tag object, commit, and archive SHA-256, performs all transformations in a temporary staging directory, and writes nothing. After reviewing the result, add `--apply`; use `--replace` only for an intentional replacement of an existing vendored copy.

Any missing patch anchor, new upstream layout, different tag/commit, or archive checksum aborts the sync. The command never contacts the network itself.

## Closed transformation list

1. Replace generated project-local skill paths with `<IMPECCABLE_SKILL_ROOT>` and inject a host contract that resolves the actually loaded skill directory before command execution.
2. Add host-aware provider routing: Cursor emits `/impeccable`; Codex emits `$impeccable`; unknown explicit hosts fail diagnostically.
3. Preserve Cursor-native roles and add the Codex role contract: read the canonical prompt, start a fresh generic subagent without conversation fork or model override, or mark the inline fallback as degraded.
4. Keep hook configuration management but bypass all project-local hook manifest installation; the plugin owns `hooks/cursor-hooks.json` for Cursor and `hooks/hooks.json` for Codex.
5. Disable the runtime upstream update poll and redirect update/installer guidance to the plugin maintainer flow.
6. Disable project-local pinned shortcut generation.
7. Teach Impeccable context, doctor, pin, and staleness scripts that the registered plugin hook is the active integration for either host.

The complete generated patch and every before/after file hash are release artifacts, not narrative claims.
