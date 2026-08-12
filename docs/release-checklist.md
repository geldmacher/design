# Release checklist

## Offline repository gate

- [ ] Node 22 or newer is active.
- [ ] `npm ci` completes from `package-lock.json`.
- [ ] `npm run release-check` passes without network access.
- [ ] `git diff --check` passes.
- [ ] Manifest and package versions match the intended release.
- [ ] `manifests/agent-plugin.json` validates against the locked Agent Plugins v1.0.0 schema.
- [ ] The Agent Plugins package contains exactly the two portable skills and no native manifest, Marketplace, hook, root agent, extension namespace, or placeholder MCP configuration.
- [ ] All three target inventories are deterministic and contain no symlink, path escape, development root, or source-only `upstream/` dependency.
- [ ] The builder accepts only repository `.build/plugins` or a newly owned `geldmacher-design-build-*/targets` workspace and rejects repository roots, protected ancestors, the temp root, foreign temp directories, and symlink segments before cleanup.
- [ ] Portable Markdown and runtime resources contain no native role aliases or `SUBAGENT_AUTHORIZATION`; context and live manual apply point to bundled degraded roles.
- [ ] Built-target simulations cover status, doctor, setup preview, generic hook refusal, portable context/live events, native fail-open adapters, and Impeccable provider selection without writing to real host state.
- [ ] Runtime subprocesses override home, Codex, local-plugin, XDG, and Impeccable update-cache paths with fixtures, and outside-project sentinels remain unchanged.
- [ ] Codex deployment fixtures mutate registry and versioned caches, restore prior or absent installation state after failure, and aggregate incomplete rollback errors.
- [ ] `upstream/impeccable.lock.json` inventories every vendored skill/agent file and all hashes match.
- [ ] `upstream/impeccable.pin.json` validates and matches the lock, module, notices, generated capability index, and packaged target provenance.
- [ ] Impeccable maintenance fixture tests cover honest release states, archive/tag equivalence, candidate drift and rollback, and marked issue reconciliation without network or tracked-file mutation.
- [ ] The generated transformation patch contains only the closed allowlist.
- [ ] Root MIT and separate Impeccable Apache-2.0 license/NOTICE remain present.
- [ ] Root `AGENTS.md` remains the single shared development instruction, is excluded from package content, and is not declared by either plugin manifest or a module.
- [ ] No repository, homepage, minimum host version, MCP entry, app entry, or release claim has been added without real evidence.

The optional upstream check is not part of the offline gate. If explicitly run, record `current`, `update-available`, or `unverifiable` exactly as returned. Candidate application and a hosted workflow dispatch require separate authorization; repository simulation is not evidence that either occurred.

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

## Agent Plugins client gate

Version 0.3.0 deliberately stops at the repository package and isolated simulations. A future real-client gate must start from a fresh supported Agent Plugins client, import only `.build/plugins/agent-plugin/geldmacher-design`, record the client/version and package digest, and verify both bare skills. It must also confirm that hooks and native subagents are reported as unavailable rather than emulated.

Until that separately authorized gate exists, report real Agent Plugins client discovery, permissions, and activation as unverified. Do not infer them from schema validation or from Cursor/Codex behavior.

## Codex live gate

Follow `docs/codex-runtime-smoke.md` after a read-only helper preview and separately authorized local deployment. Record the date, Codex version, project path, plugin path, trust decisions, and observations in `.tests/`.

- [ ] `geldmacher-design@personal` is visible, installed, and enabled at the previewed content-addressed local version.
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

Committing, pushing, creating a repository, adding public URLs, setting host-version claims, importing into a real Agent Plugins client, and publishing to any Marketplace require separate human authorization and are not part of the repository gate.
