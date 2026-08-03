# Design

`geldmacher-design` is a Cursor plugin for website and web-app design work. It packages the pinned Impeccable Cursor skill and adds a stable router, project diagnostics, opt-in hook activation, and a curated module architecture.

## Entry points

- `/design <request>` routes to the narrowest curated capability; general design work falls back to Impeccable.
- `/design setup` checks the project state and writes only after explicit confirmation.
- `/design status` and `/design doctor` are read-only.
- `/impeccable` remains the direct upstream entry point.

Shared project context remains limited to `PRODUCT.md`, `DESIGN.md`, and `.impeccable/`. The plugin does not introduce a parallel context format.

## Development

Node 22 or newer is the development and hook baseline.

```bash
npm ci
npm run release-check
git diff --check
```

A maintainer sync is a separate, explicit operation. See [upstream/README.md](upstream/README.md). Repository gates do not replace the documented Cursor live smoke test.
