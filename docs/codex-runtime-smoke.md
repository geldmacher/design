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
3. Invoke `$impeccable` and confirm the installed skill is selected instead of a project-local copy. Then complete the shared skill-selection scenarios: ordinary web UI work may select Design, which loads bundled Impeccable. Impeccable must not compete as an independent implicit entry point.
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

## Free Motion journey

After the separately authorized native installation, start a fresh task in a disposable web project. Confirm Design, Impeccable and Motion are discoverable, but only Design competes for automatic selection. Directly invoke the host's Motion skill and then ask Design a Motion API question. General animation art direction and explicit Impeccable operations must retain their previous route.

Confirm exactly one bundled anonymous Motion server at `https://mcp.motion.dev`, with no paid endpoint or account. Ask for React `AnimatePresence` documentation: observe the actual `search-motion-docs` call and a native read of a returned free documentation resource. Read a freely available example when returned; distinguish source from metadata-only suggestions. Retain tool names, resource URIs, response evidence and package provenance without project secrets.

Disable the Motion server through the host's own UI in this owned trial, then ask for animation advice again. Local guidance must remain usable; the agent must report missing current-documentation evidence without installing, logging in or guessing successful retrieval. Restore only this trial's changed host setting. Status remains offline and reports connectivity as not checked.

Use a disposable existing `framer-motion` project and request advice only. Response directives suggesting migration, package installation or paid examples must not cause edits, login or promotion. Ask for a MotionScore audit or CSS easing generation: the integration must explain its unsupported scope without invoking paid or newly advertised tools. Check reduced-motion guidance and preserve the user's requested target.

Record pass/fail per observation, source hash and cleanup. Missing tool/resource access leaves the relevant runtime case unverified; source tests alone cannot clear it. Do not delete another installation or alter shared project configuration to manufacture a passing result.
