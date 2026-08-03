# Design

`geldmacher-design` is a Cursor plugin for website and web-app design work. It packages the pinned Impeccable Cursor skill and adds a stable router, project diagnostics, opt-in hook activation, and a curated module architecture.

## Entry points

- `/design <request>` routes to the narrowest curated capability; general design work falls back to Impeccable.
- `/design setup` checks the project state and writes only after explicit confirmation.
- `/design status` and `/design doctor` are read-only.
- `/impeccable` remains the direct upstream entry point.

Shared project context remains limited to `PRODUCT.md`, `DESIGN.md`, and `.impeccable/`. The plugin does not introduce a parallel context format.

## Version 0.1.0 boundaries

- Websites and web apps; native iOS and Android capabilities are not advertised.
- Impeccable `skill-v4.0.4` is vendored and pinned.
- No Emil skills, MCP servers, or dynamic runtime modules.
- No self-updates or network access during normal use or the release check.
- No automatic removal of project-local Impeccable installations or duplicate hooks.

## Development

Node 22 or newer is the development and hook baseline.

```bash
npm ci
npm run release-check
git diff --check
```

A maintainer sync is a separate, explicit operation. See [upstream/README.md](upstream/README.md). Repository gates do not replace the documented Cursor live smoke test.
