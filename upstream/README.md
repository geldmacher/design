# Impeccable upstream maintenance

Normal plugin use and `npm run release-check` are offline. They never install, download, or update Impeccable.

To evaluate the currently approved pin, a maintainer separately downloads the official `skill-v4.0.4` tag checkout and `universal.zip`, then runs:

```bash
npm run sync:impeccable -- --source /absolute/path/to/tag-checkout --archive /absolute/path/to/universal.zip
```

That command verifies the annotated tag object, commit, and archive SHA-256, performs all transformations in a temporary staging directory, and writes nothing. After reviewing the result, add `--apply`; use `--replace` only for an intentional replacement of an existing vendored copy.

Any missing patch anchor, new upstream layout, different tag/commit, or archive checksum aborts the sync. The command never contacts the network itself.

## Closed transformation list

1. Rewrite generated project-local Cursor skill command paths to `${CURSOR_PLUGIN_ROOT}/skills/impeccable/...`.
2. Keep hook configuration management but bypass all project-local hook manifest installation; Cursor uses `hooks/hooks.json` from the plugin.
3. Disable the runtime upstream update poll and redirect update/installer guidance to the plugin maintainer flow.
4. Disable project-local pinned shortcut generation.
5. Teach Impeccable context and doctor scripts that the registered plugin hook is the active Cursor integration.

The complete generated patch and every before/after file hash are release artifacts, not narrative claims.
