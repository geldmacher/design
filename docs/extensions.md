# Curated extension architecture

Modules are repository-reviewed, bundled at release time, and represented by one `modules/<id>.json` manifest validated against `modules/module.schema.json`.

## Module contract

Each module declares:

- stable ID and version;
- first-party or vendored source URL plus an exact tag/commit and packaged archive hash when applicable;
- license;
- capabilities with skill owner, triggers, supported scope, specificity, fallback status, and explicit combination allowlist;
- every contributed skill, agent, rule, hook, script, or MCP configuration.

The generated `skills/design/references/capabilities.md` is the runtime routing index. A more specific matching capability wins over the Impeccable fallback. Equal winners ask once. Composition is permitted only when every winner mutually lists the other capability as `<module>:<capability>` in `combinableWith`.

## Admission rules

1. The module must improve website or web-app design work without introducing a competing project-context format.
2. `PRODUCT.md`, `DESIGN.md`, and `.impeccable/` remain canonical.
3. No runtime download, dynamic module URL, package installation, unpinned foreign skill, or hidden model/provider routing.
4. Every contribution must exist, be declared by the applicable Agent Plugins, Cursor, or Codex package contract where required, and be owned by exactly one curated module.
5. Vendored code needs source/license notices, a pin, hashes, an explicit transformation allowlist, tests, and a maintainer-only sync.
6. An MCP module must add the real MCP configuration and manifest entry together. Do not add empty MCP scaffolding.

Build projection narrows contributions per target. Cursor and Codex retain their host adapters and role contracts. The Agent Plugins v1 package contributes only the two skills and their generic runtime; native hooks and root agents are removed from its projected module manifests.
