# Design

**Ship interfaces that feel intentional.**

Design turns Cursor and Codex into a focused UI design partner for websites and web apps. It combines the full [Impeccable](https://github.com/pbakaus/impeccable) 4.0.4 toolkit with clear routing, project-aware guidance, diagnostics, and optional quality checks.

## Why Design?

- **One clear entry point** for planning, building, critiquing, and polishing interfaces.
- **Better project context** through the existing `PRODUCT.md`, `DESIGN.md`, and `.impeccable/` files.
- **Specialized design roles** for research, architecture, visual direction, and asset production.
- **Guardrails you control**: skills run only when invoked, and UI checks remain off until you enable them.

## Install locally

Until Design is available in a plugin store, install it from the repository. Git and Node.js 22 or newer are required.

### Cursor

```bash
mkdir -p ~/.cursor/plugins/local
git clone https://github.com/geldmacher/design.git ~/.cursor/plugins/local/geldmacher-design
```

Restart Cursor, open a fresh conversation, and run:

```text
/design status
```

### Codex

Clone the repository to any local directory, then register its bundled local Marketplace:

```bash
git clone https://github.com/geldmacher/design.git
cd design
codex plugin marketplace add "$PWD"
codex plugin add geldmacher-design@geldmacher-design-local
```

Restart Codex, open a fresh task, and run:

```text
$design status
```

## Use it

| Goal | Cursor | Codex |
| --- | --- | --- |
| Design or improve an interface | `/design <request>` | `$design <request>` |
| Check the project setup | `/design status` | `$design status` |
| Prepare project integration | `/design setup` | `$design setup` |
| Diagnose conflicts | `/design doctor` | `$design doctor` |
| Use Impeccable directly | `/impeccable <request>` | `$impeccable <request>` |

For example:

```text
/design critique this dashboard and prioritize the highest-impact improvements
$design polish this checkout flow without changing its information architecture
```

Design chooses the most specific bundled capability for the request and falls back to Impeccable for general design work.

## Controlled by default

Design never activates itself. Setup shows its proposed changes and waits for confirmation. Optional UI checks stay silent until `.impeccable/config.json` contains `hook.enabled: true`.

Cursor can stop a proposed UI write when it finds a known issue. Codex checks after the edit and requests a correction without rolling the change back. Infrastructure failures remain visible but never block edits.

## Development

Repository agents share the concise development contract in [AGENTS.md](AGENTS.md). It guides Cursor and Codex during repository work and is not a plugin runtime component.

```bash
npm ci
npm run release-check
git diff --check
```

Impeccable is reproducibly pinned; see [upstream provenance](upstream/README.md). Runtime verification is documented separately for [Cursor](docs/runtime-smoke.md) and [Codex](docs/codex-runtime-smoke.md). Repository checks do not prove host discovery, hook trust, Marketplace behavior, or publication.
