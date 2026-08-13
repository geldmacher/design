# Fresh Cursor runtime smoke

This smoke is intentionally manual because repository validation cannot prove Cursor discovery, runtime skill injection, agent resolution, or host enforcement of a hook denial.

## Prepare an isolated project

Create a disposable project beneath the ignored `.tests/` workspace, for example `.tests/runtime-project`, with one clean `src/Card.jsx`. Do not use a production repository.

Before the run, record:

- date and Cursor version;
- plugin path;
- test project path;
- `node --version`;
- initial project file list and `.cursor/hooks.json` hash or absence.

## Discovery and foreign-cwd resolution

1. Reload Cursor and open only the disposable project.
2. Start a fresh conversation.
3. Confirm `Design` is discovered as a local plugin.
4. Confirm `/design` and `/impeccable` are visible.
5. Run `/design status`; confirm plugin `0.4.0`, the Impeccable version from `upstream/impeccable.pin.json`, disabled hook, and the project context state.
6. Confirm the command succeeds while cwd is the disposable project rather than the plugin root.
7. Resolve each agent: `impeccable-asset-producer`, `impeccable-documenter`, `impeccable-finish-reviewer`, and `impeccable-manual-edit-applier`. Do not infer agent discovery from files alone.

## Change review

Use a disposable Git history with one committed UI change, one uncommitted UI file, and one changed lockfile.

1. Run `/design review`. Confirm it defaults to `quick`, selects the branch plus uncommitted change, excludes and names the lockfile, caps actionable findings at five, and changes no file.
2. In a clean branch with no commits ahead, run `/design review`. Confirm it names the current branch and last commit, offers an explicit target or `/design critique <surface>`, and does not review `HEAD~1..HEAD` automatically.
3. Start a disposable preview, then run `/design review quick working`. Confirm it may reuse the preview but starts no server and creates no worktree.
4. Stop the preview and run `/design review full branch`. Confirm it starts at most one documented safe preview, records verification, stops the process, and leaves the working tree unchanged.
5. Review a disposable pull request. Confirm the head is fetched into a remote-tracking ref, the active checkout does not change, every `.git` write is reported, and unavailable rendering is marked `Not verified`.
6. Confirm no `.impeccable/critique/` snapshot is written. Then explicitly run `/design polish <surface> using review finding 1`; confirm the router hands the approved refinement to bundled Impeccable.

## Strict activation and blocking

1. Run `/design setup`. Before confirmation, verify the disposable project has no new file.
2. Confirm activation. Verify only `.impeccable/config.json` is created or changed and it contains `hook.enabled: true`.
3. Verify no `.cursor/hooks.json` entry was created.
4. Write a clean UI component and confirm Cursor allows it.
5. Propose this known detector fixture in an HTML file and confirm Cursor denies the write before it lands:

   ```html
   <style>.card { border-left: 4px solid #7c3aed; border-radius: 16px; }</style>
   <div class="card">Hello</div>
   ```

6. Edit a non-UI file such as `README.md` and confirm it is unaffected.
7. Run `node "<DESIGN_SKILL_ROOT>/scripts/design-cli.mjs" --host cursor hook off` through `/design` after resolving the skill root, then confirm a UI write is no longer scanned.
8. Activate and deactivate once more. Confirm the original `.cursor/hooks.json` hash/absence is unchanged and no second entry exists.

## Conflict and failure diagnostics

In disposable copies only:

1. Add `.cursor/skills/impeccable/SKILL.md`; `/design status` must report shadowing and setup must not remove it.
2. Add a legacy Impeccable command to `.cursor/hooks.json`; status must report a double-hook conflict and setup must not overwrite it.
3. Malform `.impeccable/config.json`; the diagnostic must be visible and the edit must be allowed.
4. A missing/broken detector path or unavailable Node runtime must be reported as infrastructure failure and must not deny the edit.

Store receipts in `.tests/` only. A successful run may support a future minimum Cursor version; it does not publish the plugin.
