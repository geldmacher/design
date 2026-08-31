# Design

**Ship interfaces that feel intentional.**

> [Install Design for Cursor or Codex](docs/installation.md) · [Latest GitHub Release](https://github.com/geldmacher/design/releases/latest)

Design turns Agent Plugins clients, Cursor, and Codex into a focused UI design partner for websites and web apps. It combines the reproducibly pinned [Impeccable](https://github.com/pbakaus/impeccable) toolkit with clear routing, project-aware guidance, diagnostics, and optional native quality checks.

## Why Design?

- **One clear entry point** for planning, building, critiquing, and polishing interfaces.
- **Better project context** through the existing `PRODUCT.md`, `DESIGN.md`, and `.impeccable/` files.
- **Stakeholder-ready discovery** through previewed questionnaires that write only after an approved destination.
- **Specialized design roles** through native host agents or bundled portable role instructions.
- **Guardrails you control**: skills run only when invoked, and UI checks remain off until you enable them.

## Package targets

One source checkout produces three deterministic packages:

| Target | Package | Portable or native behavior |
| --- | --- | --- |
| Agent Plugins v1 | `.build/plugins/agent-plugin/geldmacher-design` | Standard `plugin.json` plus the `design` and `impeccable` skills; no MCP, registered/native hook integration, or native agents |
| Cursor | `.build/plugins/cursor/geldmacher-design` | `/design`, `/impeccable`, pre-write hook, and native agents |
| Codex | `.build/plugins/codex/geldmacher-design` | `$design`, `$impeccable`, PostToolUse/Stop hook, and inherited generic subagents |

Run `npm run build:targets` to materialize all three. The Agent Plugins package follows v1.0.0 and declares the skill identities `design` and `impeccable`. Discovery, presentation, and invocation syntax remain client-specific because the standard does not define distribution, permissions, hooks, native agents, commands, or client UX. See [the Agent Plugins target guide](docs/agent-plugin-target.md).

## Install Design

Design supports two GitHub distribution paths for Cursor and Codex. A host can import the repository through its Git or Marketplace source, or you can install a checksummed host-specific ZIP from a [GitHub Release](https://github.com/geldmacher/design/releases/latest). The release path provides immutable versioned bytes for controlled update and rollback; the repository path follows the selected branch, tag, or commit.

Use the [complete installation guide](docs/installation.md) for source import, archive verification, Cursor and Codex destinations, cache behavior, reload, Hook Trust, new-task activation, update, and rollback. Installation and publication are separate: the repository currently contains the distribution contracts and release harness, but this implementation does not submit a Marketplace entry, deploy a host copy, restart a host, or publish a GitHub Release.

### Local maintainer deployment

Keep a Git checkout as the canonical source and deploy generated host copies from it. Do not clone directly into `~/.cursor/plugins/local` or `~/.codex/plugins`; those directories contain managed deployment copies and are atomically replaced.

#### Requirements and clone

Install Git, Node.js 22 or newer, and npm. The selected host must also be installed: Cursor for a Cursor deployment, or the Codex CLI with plugin support for a Codex deployment.

```bash
mkdir -p ~/src/geldmacher-plugins
git clone https://github.com/geldmacher/design.git ~/src/geldmacher-plugins/design
cd ~/src/geldmacher-plugins/design
npm ci
```

If you already have a checkout, use it instead and run `npm ci` from its repository root.

#### Preview and install

Choose one host or deploy both:

| Target | Preview without changing host state | Install or update |
| --- | --- | --- |
| Cursor only | `npm run deploy:local -- --dry-run --cursor-only` | `npm run deploy:local -- --cursor-only` |
| Codex only | `npm run deploy:local -- --dry-run --codex-only` | `npm run deploy:local -- --codex-only` |
| Cursor and Codex | `npm run deploy:local -- --dry-run` | `npm run deploy:local` |

Append `--full` to an install command to run the complete repository `release-check` before deployment. Inspect the current installed state with `npm run deploy:status`; add `--cursor-only` or `--codex-only` to limit that check to one host.

The deploy command builds and validates all three packages, but deploys only the native bundles under `.build/plugins/{cursor,codex}/geldmacher-design`. It then atomically replaces only the selected physical host copies:

- Cursor: `~/.cursor/plugins/local/geldmacher-design`
- Codex source: `~/.codex/plugins/geldmacher-design`

Every installed copy contains a `.local-deploy.json` receipt with its content-derived local version, Git revision, dirty status, source path, and deployment time. Dirty checkouts are allowed and explicitly recorded. For Codex, the command also creates or updates only this plugin's entry in the `personal` Marketplace and refreshes the verified Codex cache with `codex plugin add geldmacher-design@personal --json`. Do not delete Codex caches manually.

After installation or an update, reload Cursor before testing its plugin surface and start a new Codex task before testing Codex discovery. Review changed hooks manually before granting trust. The deploy command does not restart either host or grant hook trust. See the [Cursor plugin documentation](https://cursor.com/docs/plugins) and OpenAI's [local plugin documentation](https://developers.openai.com/plugins/build/plugins).

#### Update from the origin repository

First protect any local work, then fast-forward the checkout and redeploy:

```bash
cd ~/src/geldmacher-plugins/design
git status --short
git fetch origin
git pull --ff-only
npm ci
npm run deploy:local -- --dry-run
npm run deploy:local
npm run deploy:status
```

Inspect a dirty status before pulling; commit or stash intentional local changes rather than discarding them. `git pull --ff-only` refuses a divergent history instead of creating an implicit merge. `npm ci` synchronizes dependencies with the updated lockfile. The last three commands above update both hosts; use the matching `--cursor-only` or `--codex-only` flag when only one host is installed. An unchanged bundle is a verified no-op; changed content receives a new host-specific local version and replaces the previous copy transactionally.

## Use it

| Goal | Agent Plugins v1 skill identity | Cursor invocation | Codex invocation |
| --- | --- | --- | --- |
| Design or improve an interface | `design` | `/design <request>` | `$design <request>` |
| Scan explicit local paths | `design` | `/design detect -- <target> [target…]` | `$design detect -- <target> [target…]` |
| Review a Git change's interface impact | `design` | `/design review [quick\|full] [target]` | `$design review [quick\|full] [target]` |
| Prepare a stakeholder questionnaire | `design` | `/design questionnaire [topic]` | `$design questionnaire [topic]` |
| Check the project setup | `design` | `/design status` | `$design status` |
| Prepare project integration | `design` | `/design setup` | `$design setup` |
| Diagnose conflicts | `design` | `/design doctor` | `$design doctor` |
| Use Impeccable directly | `impeccable` | `/impeccable <request>` | `$impeccable <request>` |

The Agent Plugins column identifies the declared skill, not a universal user-facing command. A compatible client decides how users or models discover and load that skill.

For example:

```text
/design critique this dashboard and prioritize the highest-impact improvements
$design detect -- src/components app/dashboard
$design review quick branch
$design questionnaire checkout approval
$design polish this checkout flow without changing its information architecture
```

Design chooses the most specific bundled capability for the request and falls back to Impeccable for general design work.

`design detect` is a read-only scan of one or more explicitly named local files or directories. It always uses the bundled Impeccable detector, works independently of hook activation, and returns a structured result without installing, updating, or fixing anything. A no-findings result means only that the detector returned no findings; it is not a complete interface-quality verdict.

`design questionnaire` prepares a focused questionnaire for one recipient or homogeneous audience. It reuses facts already present in the request and canonical project context, asks only for missing decision-critical information, and previews the complete Markdown before any write. A file is created only after the preview is followed by an exact `.md` destination; an existing destination requires a separate overwrite confirmation. The operation sends nothing, imports no answers, and does not change Design context or configuration.

`design review` is a read-only, change-scoped interface review. It defaults to `quick`, resolves working, staged, branch, pull-request, ref, and exact Git-range targets without switching the active checkout, and keeps its findings in the current task. A separately approved `/design polish ...` or `$design polish ...` follow-up routes those findings to bundled Impeccable. The scope and reporting method was independently implemented with inspiration from [`jakubkrehel/skills` at `c25a8437`](https://github.com/jakubkrehel/skills/tree/c25a8437afc6fecf277158f7c6e2f9aa45f4993d); no files from that repository are packaged and it is not a runtime dependency.

## Controlled by default

Design never activates itself. Setup shows its proposed changes and waits for confirmation. Optional UI checks stay silent until `.impeccable/config.json` contains `hook.enabled: true`.

Cursor can stop a proposed UI write when it finds a known issue. Codex checks after the edit and requests a correction without rolling the change back. The Agent Plugins target reports hooks as unavailable and uses bundled degraded role instructions instead of pretending native agents exist. Infrastructure failures remain visible but never block edits.

## Development

Repository agents share the concise development contract in [AGENTS.md](AGENTS.md). It guides repository work and is not a plugin runtime component in any target.

```bash
npm ci
npm run release-check
git diff --check
```

Impeccable is reproducibly pinned; see [upstream provenance](upstream/README.md) and the [maintainer workflow](docs/impeccable-maintenance.md). Runtime verification is documented separately for [Cursor](docs/runtime-smoke.md) and [Codex](docs/codex-runtime-smoke.md). Repository checks and isolated target simulations do not prove real client discovery, hook trust, Marketplace behavior, or publication.

The source-only `$release-plugin`, `/release-plugin`, and `npm run release:plugin` surfaces provide one explicit validated GitHub Release lifecycle. They use the already declared version, may create one release commit plus lightweight tag, atomically push `main` and the tag, publish separate Cursor and Codex archives, and verify downloaded bytes. They never select or bump a version, deploy locally, restart a host, submit a Marketplace entry, overwrite a release, or repair mixed remote state. See [GitHub Release validation](docs/release-validation.md).
