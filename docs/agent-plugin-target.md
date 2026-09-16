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
- immediate `skills/design/SKILL.md`, `skills/impeccable/SKILL.md` and `skills/motion/SKILL.md` components;
- package-contained runtime and pinned provenance used by those skills;
- the MIT wrapper license and third-party notices for Apache-2.0 Impeccable and MIT Motion.

It intentionally contains no `mcp.json`, extension namespace, Cursor/Codex manifest, Marketplace metadata, hook adapter, root agent prompt, or client-specific skill metadata. The native packages configure the free Motion MCP; the portable package supplies local Motion guidance only. A client may independently provide compatible search and resource-reading tools, but this package does not configure or emulate them.

All three skills use Agent Skills frontmatter and declare the identities `design`, `impeccable` and `motion`. The package makes those skills discoverable; each compatible client decides how a user or model sees and loads them. Agent Plugins v1 does not define a universal slash, dollar, or bare-text command syntax.

The Design lifecycle, stakeholder questionnaire, and read-only change review remain available after a client loads the skill, but its hook state is `unavailable` and hook mutation is refused. Questionnaire authoring uses host-neutral instructions and requires a post-preview destination through the loaded `design` skill without inventing a universal command syntax. Change review uses the bundled JSON scope resolver and follows the same invocation boundary. Impeccable follows the matching bundled `reference/degraded/` role contract inline for asset production, documentation, finish review, and live manual apply because Agent Plugins v1 does not standardize native subagents.

## Native compatibility layers

| Capability | Agent Plugins v1 | Cursor | Codex |
| --- | --- | --- | --- |
| Skills | Identities `design`, `impeccable`, `motion`; client-specific exposure | `/design`, `/impeccable`, `/motion` | `$design`, `$impeccable`, `$motion` |
| Motion through Design | Loaded `design` skill operation | `/design motion` | `$design motion` |
| Free Motion documentation MCP | Not configured; local guidance included | Bundled remote connection; host enablement and permissions apply | Bundled remote connection; host enablement and permissions apply |
| Stakeholder questionnaire | Loaded `design` skill operation | `/design questionnaire` | `$design questionnaire` |
| Change review | Loaded `design` skill operation | `/design review` | `$design review` |
| Hook | Unavailable | Pre-write | PostToolUse and Stop |
| Specialized roles | Bundled degraded instructions | Native agents | Generic inherited subagents |
| Local deployment helper | No | Yes | Yes |

The native packages remain separate compatibility layers. They are not embedded as client-specific extensions in the standard package.

## Validation and evidence

`npm run check:targets` validates the locked v1.0.0 schema, closed manifest fields, immediate skill directories, Agent Skills frontmatter, safe output boundaries, target-specific inventories, questionnaire contracts, and deterministic digests. The portable validator scans every delivered Markdown and JavaScript resource for native invocation syntax, role aliases, and authorization directives. `tests/portable-runtime.test.mjs` runs status, diagnose, setup, review-scope, provider, context, live-event, and hook behavior from generated packages with fixture-only home, host, XDG, and update-cache paths.

These repository checks prove package shape and simulated behavior only. They do not prove discovery, permissions, trust, fresh-task activation, distribution, or publication in a real client. Importing the generated package is client-specific and requires a separate human-authorized live gate.

## Shared source and package boundaries

Design uses the generated capability index in `skills/design/references/capabilities.md` for explicit commands and semantic selection. Motion API and implementation requests select Motion; general animation direction and Impeccable commands such as `doctor` remain with Impeccable. The builder projects the explicitly marked host section and portable description from the shared Design skill. It rejects missing or duplicate markers. Vendored Impeccable and Motion transformations remain separately controlled.

The module schema stays in the development checkout. Packaged module metadata omits its schema reference. Native branding is limited to `assets/logo.svg`; the portable target has no branding assets. `npm run release-check` runs the complete discovered test suite once through the isolated verifier; standalone `npm test` and the focused engine verifier remain available.
