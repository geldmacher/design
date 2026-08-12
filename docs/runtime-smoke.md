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
5. Run `/design status`; confirm plugin `0.3.0`, the Impeccable version from `upstream/impeccable.pin.json`, disabled hook, and the project context state.
6. Confirm the command succeeds while cwd is the disposable project rather than the plugin root.
7. Resolve each agent: `impeccable-asset-producer`, `impeccable-documenter`, `impeccable-finish-reviewer`, and `impeccable-manual-edit-applier`. Do not infer agent discovery from files alone.

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
