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
- [ ] Root `AGENTS.md` remains the single shared development instruction, is excluded from package content, and is not declared by either plugin manifest or a module.
- [ ] No repository, homepage, minimum host version, MCP entry, app entry, or release claim has been added without real evidence.

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

## Codex live gate

Follow `docs/codex-runtime-smoke.md` after manually adding and installing the local Marketplace package. Record the date, Codex version, project path, plugin path, trust decisions, and observations in `.tests/`.

- [ ] The local Marketplace and plugin are visible, installed, and enabled.
- [ ] `$design status` and `$impeccable` resolve only after explicit invocation in a fresh task.
- [ ] The detector is silent before project activation.
- [ ] `$design setup` changes only `.impeccable/config.json` after explicit confirmation.
- [ ] `Edit`, `Write`, and `apply_patch` produce valid PostToolUse behavior.
- [ ] A bad UI edit remains written but produces correction context.
- [ ] Stop reports deferred findings once and then deduplicates them.
- [ ] A representative canonical role runs in a fresh generic subagent with inherited model and no conversation fork.
- [ ] No `.codex/hooks.json` or `.agents/skills/impeccable` path is created in the target project.

Until this section has fresh evidence, report these points as unverified, not failed and not passed.

## Publication gate

Committing, pushing, creating a repository, adding public URLs, setting host-version claims, and publishing to either Marketplace require separate human authorization and are not part of the repository gate.
