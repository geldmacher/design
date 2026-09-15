# Fresh Codex runtime smoke

Follow the [shared preparation and journeys](runtime-smoke-common.md), with the Codex installation, discovery and adapter checks below. Repository validation alone does not prove plugin discovery, hook trust, skill injection or generic-subagent availability.

## Preview, installation and discovery

Preview the selected host without changing host state:

```bash
npm run deploy:local -- --dry-run --codex-only
```

Inspect source, destination, content hash, local version, Marketplace change and cache path. Applying the deployment requires separate human authorization. Only after it is given, run:

```bash
npm run deploy:local -- --codex-only
```

The helper deploys the generated Codex target and updates this plugin's entry in the personal Marketplace. The repository root is not a Marketplace source.

1. Confirm `geldmacher-design@personal` is installed and enabled at the content-addressed version reported by the preview.
2. Start a fresh task in the disposable project. Invoke `$design status`; compare versions with the recorded package provenance and expect disabled hooks and Codex-specific diagnostics.
3. Invoke `$impeccable` and confirm the installed skill is selected instead of a project-local copy. Ordinary UI work without invocation must not activate either skill implicitly.
4. Complete the shared detector, diagnosis, questionnaire and review journeys. Before enabling checks, write a UI file and confirm no plugin-hook output. Grant hook trust manually when Codex requests it, then complete the shared configuration journey.

## PostToolUse and Stop

1. Complete the [activation handoff](runtime-smoke-common.md#activation-handoff-to-host-adapter-checks) in this adapter test project, including confirmed setup and an enabled status read-back. Then exercise `Edit`, `Write` and `apply_patch`. Events must be silent or return valid PostToolUse `additionalContext`; they must never return a pre-write denial contract.
2. A clean edit must remain present. A low-contrast UI fixture must initially remain written while PostToolUse requests correction.
3. Write the [shared `side-tab` fixture](runtime-smoke-common.md#detector-and-native-engine) in a session with a stable session ID. Finish the task: Stop must report the deferred finding once. A repeated Stop must not repeat it.
4. Follow the shared handoff's deactivation step, verify disabled status in this same project, and confirm UI edits remain silent. Neither `.codex/hooks.json` nor `.agents/skills/impeccable` may have been created by setup.

## Roles, conflicts and infrastructure failures

Run a representative canonical role from `agents/` in a fresh generic subagent, with the inherited parent model and no conversation fork. If generic subagents are unavailable, the inline fallback must be visibly marked as degraded.

In disposable copies, add `.agents/skills/impeccable/SKILL.md`, then separately an Impeccable command in `.codex/hooks.json`. Status must report shadowing or a double-hook conflict; setup must not remove or overwrite either path.

For the shared malformed-config case or missing detector runtime, diagnostics must remain visible and follow the event contract without reverting or preventing product edits. Restore each trial copy and finish with the [shared closeout](runtime-smoke-common.md#closeout). Fresh local observations do not establish Marketplace certification or publication.
