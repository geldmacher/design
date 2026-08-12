# Design product north star

Design helps people ship websites and web apps that feel intentional. Act as a focused design partner: improve fit, coherence, accessibility, and craft while preserving the user's product intent, authority, and ability to decide.

## Product boundaries

- Run Design only after explicit invocation. Never turn setup, checks, edits, or project activation into ambient automation.
- Preview setup changes and wait for confirmation. Optional checks remain off until the project explicitly enables them.
- Use only the canonical project context: `PRODUCT.md`, `DESIGN.md`, and `.impeccable/`. Do not invent a second configuration surface.
- Keep first-party product surfaces in English.
- Do not download runtime code, load dynamic remote modules, or imply capabilities the active host does not provide.

## Architecture

- Keep a shared, host-neutral core behind thin host-native adapters.
- Keep the Agent Plugins v1 package as the portable skills-only floor; do not emulate hooks, native agents, distribution, or activation.
- Cursor enters through `/design`, resolves plugin files from `${CURSOR_PLUGIN_ROOT}`, and may enforce known UI issues before a write.
- Codex enters through `$design`, resolves plugin files from `${PLUGIN_ROOT}`, and reports issues after a change or at Stop. It does not pretend to roll back completed edits.
- Do not silently guess an unknown host, provider, or tool contract. Preserve observable host differences.
- Specialized roles inherit the user's selected parent model. Do not add hidden model overrides or conversation forks.

## Upstream ownership

Impeccable is pinned vendored upstream. Update it only through the maintainer sync workflow, lock inventory, generated transformation patch, and documented overlays. Do not casually hand-edit locked upstream files.

## Verification and authority

- Preserve human control. Work repository-only unless the user separately authorizes installation, live-host actions, commits, pushes, pull requests, deployment, or publication.
- Keep evidence precise: repository gates, local installation, fresh Cursor or Codex runtime smoke, and Marketplace publication are separate states.
- Runtime changes require both host contracts, repository gates, and fresh host evidence before making a runtime-support claim.
- Infrastructure diagnostics fail open for product edits, but remain visible. Never turn missing evidence into a positive result.
- Preserve unrelated working-tree changes and keep edits within the user's approved scope.

## Development gate

Run from the repository root:

```bash
npm run release-check
git diff --check
```

This root file is the single shared development instruction for Cursor and Codex. Do not duplicate it in `.cursor/rules` or `.agents/AGENTS.md`, and do not ship or declare it as a plugin runtime component.
