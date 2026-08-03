# Release checklist

## Offline repository gate

- [ ] Node 22 or newer is active.
- [ ] `npm ci` completes from `package-lock.json`.
- [ ] `npm run release-check` passes without network access.
- [ ] `git diff --check` passes.
- [ ] Manifest and package versions match the intended release.
- [ ] `upstream/impeccable.lock.json` inventories every vendored skill/agent file and all hashes match.
- [ ] The generated transformation patch contains only the closed allowlist.
- [ ] Root MIT and separate Impeccable Apache-2.0 license/NOTICE remain present.
- [ ] No repository, homepage, minimum Cursor version, MCP entry, or release claim has been added without real evidence.

## Cursor live gate

Follow `docs/runtime-smoke.md` in a fresh Cursor window after reload. Record the date, Cursor version, project path, and observations in the unversioned `.tests/` workspace.

- [ ] Plugin discovery is visible.
- [ ] `/design` and `/impeccable` are visible in a fresh conversation.
- [ ] Plugin-relative scripts work from a foreign project cwd.
- [ ] All four Impeccable agents resolve.
- [ ] Strict project-local activation and deactivation behave as documented.
- [ ] A clean UI write is allowed and the known detector fixture is denied.
- [ ] No duplicate `.cursor/hooks.json` entry is created.

Until this section has fresh evidence, report these points as unverified, not failed and not passed.

## Publication gate

Committing, pushing, creating a repository, adding public URLs, setting `minClientVersions`, and publishing to the Cursor Marketplace require separate human authorization and are not part of the repository gate.
