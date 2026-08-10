# Fresh Codex runtime smoke

This smoke is intentionally manual. Repository validation proves package contracts, but not installation, plugin discovery, hook trust, skill injection, generic-subagent availability, or host enforcement.

## Prepare an isolated project

Create a disposable project beneath the ignored `.tests/` workspace, for example `.tests/codex-runtime-project`, with one clean `src/Card.jsx`. Do not use a production repository.

Before the run, record:

- date and Codex version;
- repository, local Marketplace, installed plugin, and test project paths;
- `node --version`;
- initial project file list and `.codex/hooks.json` hash or absence;
- every installation, activation, and hook-trust confirmation.

## Marketplace, install, and discovery

The following operations change the user's Codex configuration and therefore remain manual:

```bash
codex plugin marketplace add /absolute/path/to/geldmacher-design
codex plugin add geldmacher-design@geldmacher-design-local
```

1. Add the repository-local Marketplace and install `geldmacher-design` from it.
2. Confirm the installed package reports version `0.2.0` and is enabled.
3. Start a fresh task in the disposable project.
4. Explicitly invoke `$design status`; confirm Impeccable `4.0.4`, disabled hook, and Codex-specific project diagnostics.
5. Explicitly invoke `$impeccable`; confirm it resolves through the installed skill rather than a project-local copy.
6. Verify ordinary UI work without either skill invocation does not implicitly activate a skill.

## Strict activation and PostToolUse behavior

1. Before setup, write a UI file and verify the plugin hook produces no output.
2. Manually trust the installed plugin hook when Codex requests approval.
3. Run `$design setup`. Before confirmation, verify the disposable project has no new file.
4. Confirm setup. Verify only `.impeccable/config.json` is created or changed and contains `hook.enabled: true`.
5. Verify neither `.codex/hooks.json` nor `.agents/skills/impeccable` was created.
6. Exercise `Edit`, `Write`, and `apply_patch` against UI files. Each event must either be silent or return a valid PostToolUse `additionalContext`; it must never emit a denial contract.
7. Write a clean component and confirm the edit remains present.
8. Write a low-contrast UI fixture. Confirm the edit initially remains present and PostToolUse requests a correction.

## Stop and role resolution

1. Write this deferred-finding fixture in a session with a stable session ID:

   ```html
   <style>.card { border-left: 4px solid #7c3aed; border-radius: 16px; }</style>
   <div class="card">Hello</div>
   ```

2. Finish the task. Confirm Stop reports the remaining `side-tab` finding once.
3. Confirm a repeated Stop event does not emit the same finding again.
4. Run one representative flow that selects a canonical role from `agents/`, starts a fresh generic subagent without conversation fork or model override, and inherits the parent model.
5. If generic subagents are unavailable, confirm the inline fallback is used and visibly marked as degraded.

## Conflicts and failure diagnostics

In disposable copies only:

1. Add `.agents/skills/impeccable/SKILL.md`; `$design status` must report shadowing and setup must not remove it.
2. Add an Impeccable command to `.codex/hooks.json`; status must report a double-hook conflict and setup must not overwrite it.
3. Malform `.impeccable/config.json`; a non-blocking event-correct diagnostic may appear and the edit must remain.
4. Simulate a missing detector runtime; a non-blocking diagnostic may appear and the edit must remain.

Store receipts in `.tests/` only. Remove the local test installation manually when no longer needed. A successful run is local runtime evidence, not Marketplace certification or publication.
