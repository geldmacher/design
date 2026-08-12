# Agent Plugins v1 target

Geldmacher Design produces a portable Agent Plugins v1.0.0 package at:

```text
.build/plugins/agent-plugin/geldmacher-design
```

Build it together with the native packages:

```bash
npm run build:targets
```

The source repository is a multi-target build workspace, not an Agent Plugin package itself. The build copies `manifests/agent-plugin.json` to the package root as `plugin.json`.

## Portable contract

The package contains:

- the canonical Agent Plugins v1.0.0 `plugin.json`;
- immediate `skills/design/SKILL.md` and `skills/impeccable/SKILL.md` components;
- package-contained runtime and pinned provenance used by those skills;
- the MIT wrapper license and Apache-2.0 third-party notice.

It intentionally contains no `mcp.json`, extension namespace, Cursor/Codex manifest, Marketplace metadata, hook adapter, root agent prompt, or client-specific skill metadata. No MCP server exists in this product, so an empty placeholder would misrepresent the package.

Both skills use Agent Skills frontmatter and declare the identities `design` and `impeccable`. The package makes those skills discoverable; each compatible client decides how a user or model sees and loads them. Agent Plugins v1 does not define a universal slash, dollar, or bare-text command syntax.

The Design lifecycle remains available after a client loads the skill, but its hook state is `unavailable` and hook mutation is refused. Impeccable follows the matching bundled `reference/degraded/` role contract inline for asset production, documentation, finish review, and live manual apply because Agent Plugins v1 does not standardize native subagents.

## Native compatibility layers

| Capability | Agent Plugins v1 | Cursor | Codex |
| --- | --- | --- | --- |
| Skills | Identities `design`, `impeccable`; client-specific exposure | `/design`, `/impeccable` | `$design`, `$impeccable` |
| Hook | Unavailable | Pre-write | PostToolUse and Stop |
| Specialized roles | Bundled degraded instructions | Native agents | Generic inherited subagents |
| Local deployment helper | No | Yes | Yes |

The native packages remain separate compatibility layers. They are not embedded as client-specific extensions in the standard package.

## Validation and evidence

`npm run check:targets` validates the locked v1.0.0 schema, closed manifest fields, immediate skill directories, Agent Skills frontmatter, safe output boundaries, target-specific inventories, and deterministic digests. The portable validator scans every delivered Markdown and JavaScript resource for native role aliases and authorization directives. `tests/portable-runtime.test.mjs` runs status, doctor, setup, provider, context, live-event, and hook behavior from generated packages with fixture-only home, host, XDG, and update-cache paths.

These repository checks prove package shape and simulated behavior only. They do not prove discovery, permissions, trust, fresh-task activation, distribution, or publication in a real client. Importing the generated package is client-specific and requires a separate human-authorized live gate.
