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

## Preview, install, and discovery

Start with the repository helper's read-only Codex preview:

```bash
npm run deploy:local -- --dry-run --codex-only
```

Inspect the exact source, destination, content hash, local version, Marketplace change, and cache path. Applying the deployment changes the user's Codex configuration and requires a separate human authorization. Only after that approval, run:

```bash
npm run deploy:local -- --codex-only
```

The helper deploys the built Codex target, updates only the `geldmacher-design` entry in the `personal` Marketplace, and activates `geldmacher-design@personal`. It does not install the repository root as a Marketplace.

1. Confirm `geldmacher-design@personal` is installed and enabled.
2. Confirm its installed version is the content-addressed `0.6.0+local.codex.<digest>` reported by the preview, not the plain product version.
3. Start a fresh task in the disposable project.
4. Explicitly invoke `$design status`; confirm the Impeccable version from `upstream/impeccable.pin.json`, disabled hook, and Codex-specific project diagnostics.
5. Explicitly invoke `$impeccable`; confirm it resolves through the installed skill rather than a project-local copy.
6. Verify ordinary UI work without either skill invocation does not implicitly activate a skill.

## Explicit detector scan

Keep the hook disabled for this section and record the project file list before and after each command.

1. Run `$design detect -- src/Card.jsx`; confirm status `no-findings`, exit `0`, plugin-bundled Impeccable provenance, and no project write. Do not report the interface as clean or approved.
2. Add the known `side-tab` fixture below, then run `$design detect -- <fixture>`; confirm status `findings`, exit `2`, primary count greater than zero, and a normalized `side-tab` finding. Confirm the file remains unchanged.
3. Run `$design detect --` with no target, then try a URL and a path outside the disposable project. Confirm each returns one `blocked` JSON envelope with exit `1` and never invokes a remote or repository-local detector.
4. Confirm the manual scan works without setup, never enables the hook, and never edits source, config, or ignores. Any `$impeccable polish <target>` text must remain a separate optional next invocation.

## Stakeholder questionnaire

Keep the hook disabled and record the project file list plus hashes of `PRODUCT.md`, `DESIGN.md`, relevant `.impeccable/` files, and host hook configuration before this section.

1. Put the questionnaire topic, audience, decision need, and answer use across the invocation and canonical project context. Run `$design questionnaire checkout approval`; confirm known facts are not asked again and only missing required facts are requested in one compact round.
2. Complete any missing facts. Confirm the full questionnaire appears as Markdown in the task, contains 5–10 prioritized atomic questions and no more than 12, covers every stated information need, and has written no file.
3. After the preview, provide the exact new path `docs/checkout-questionnaire.md`. Confirm exactly one file is created, its bytes match the approved preview, and the recorded context and hook hashes are unchanged.
4. Repeat with an already existing `.md` destination. Confirm Design reports the conflict or diff and does not overwrite it until a separate explicit overwrite confirmation is given.
5. Confirm the flow sends nothing, imports no completed answers, and creates no second file.

## Change review

Use a disposable Git history with one committed UI change, one uncommitted UI file, and one changed lockfile.

1. Run `$design review`. Confirm it defaults to `quick`, selects the branch plus uncommitted change, excludes and names the lockfile, caps actionable findings at five, and changes no file.
2. In a clean branch with no commits ahead, run `$design review`. Confirm it names the current branch and last commit, offers an explicit target or `$design critique <surface>`, and does not review `HEAD~1..HEAD` automatically.
3. With an already running disposable preview, run `$design review quick working`; confirm it reuses but does not start the preview.
4. Run `$design review full branch` without a preview. Confirm at most one documented safe server is started, then stopped, with unverifiable claims marked `Not verified`.
5. Review a disposable pull request. Confirm fetch occurs without checkout, `.git` writes are reported, and any temporary worktree used for full rendering is removed.
6. Confirm the review writes no `.impeccable/critique/` snapshot. Then explicitly run `$design polish <surface> using review finding 1`; confirm bundled Impeccable owns the approved refinement.

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

Store receipts in `.tests/` only. Remove the local test installation manually when no longer needed. A successful run is local runtime evidence, not Marketplace certification or publication. None of these live operations is part of the repository release gate.
