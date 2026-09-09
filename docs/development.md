# Developing Design

Repository agents share the concise development contract in [AGENTS.md](../AGENTS.md). It guides repository work and is not a plugin runtime component in any target.

```bash
npm ci
npm run release-check
git diff --check
```

Impeccable is reproducibly pinned; see [upstream provenance](../upstream/README.md) and the [maintainer workflow](impeccable-maintenance.md). Runtime verification is documented separately for [Cursor](runtime-smoke.md) and [Codex](codex-runtime-smoke.md). Repository checks and isolated target simulations do not prove real client discovery, hook trust, Marketplace behavior, or publication.

In this source checkout, invoke `$update-impeccable` in Codex or `/update-impeccable` in Cursor to update the bundled skill to the latest stable Impeccable release. One invocation authorizes checking, preparing, reviewing, and applying a verified candidate without another confirmation, followed by the repository gates. This source-only maintainer skill preserves unrelated local changes and stops on conflicting update paths or failed verification. It does not install the plugin into a host, commit, push, or publish. See [Impeccable maintenance](impeccable-maintenance.md) for the complete flow and failure states.

The source-only `$release-plugin`, `/release-plugin`, and `npm run release:plugin` surfaces provide one explicit validated GitHub Release lifecycle. The skills select and prepare the appropriate semantic version from the actual changes; the underlying script uses that consistent declared version. They may create one release commit plus lightweight tag, atomically push `main` and the tag, publish separate Cursor and Codex archives, and verify downloaded bytes. They never deploy locally, restart a host, submit a Marketplace entry, overwrite a release, or repair mixed remote state. See [GitHub Release validation](release-validation.md).

## Bundled native Impeccable engine

Impeccable 4.3.1 uses pinned engine 0.1.5. All three plugin packages include macOS ARM64/x64, Linux ARM64/x64 and Windows x64 binaries. Node.js 22+ remains required by the Design integration. Execution uses only the verified in-package binary; no runtime installation or self-update occurs.

Maintainers run `npm run verify:impeccable-engine` for isolated engine, detector, hook and package checks. The [verifier](../.agents/skills/verify-impeccable-engine/SKILL.md) reports the native platform exercised and preserves evidence outside the repository. Fresh editor smoke is a separate acceptance step.

## Package targets

One source checkout produces three deterministic packages:

| Target | Package | Portable or native behavior |
| --- | --- | --- |
| Agent Plugins v1 | `.build/plugins/agent-plugin/geldmacher-design` | Standard `plugin.json` plus the `design` and `impeccable` skills; no MCP, registered/native hook integration, or native agents |
| Cursor | `.build/plugins/cursor/geldmacher-design` | `/design`, `/impeccable`, pre-write hook, and native agents |
| Codex | `.build/plugins/codex/geldmacher-design` | `$design`, `$impeccable`, PostToolUse/Stop hook, and inherited generic subagents |

Run `npm run build:targets` to materialize all three. The Agent Plugins package follows v1.0.0 and declares the skill identities `design` and `impeccable`. Discovery, presentation, and invocation syntax remain client-specific because the standard does not define distribution, permissions, hooks, native agents, commands, or client UX. See [the Agent Plugins target guide](agent-plugin-target.md).

## Local maintainer deployment

Keep a Git checkout as the canonical source and deploy generated host copies from it. Do not clone directly into `~/.cursor/plugins/local` or `~/.codex/plugins`; those directories contain managed deployment copies and are atomically replaced.

### Requirements and clone

Install Git, Node.js 22 or newer, and npm. The selected host must also be installed: Cursor for a Cursor deployment, or the Codex CLI with plugin support for a Codex deployment.

```bash
mkdir -p ~/src/geldmacher-plugins
git clone https://github.com/geldmacher/design.git ~/src/geldmacher-plugins/design
cd ~/src/geldmacher-plugins/design
npm ci
```

If you already have a checkout, use it instead and run `npm ci` from its repository root.

### Preview and install

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

### Update from the origin repository

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
