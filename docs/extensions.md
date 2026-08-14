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

## First-party change review

`design-core:change-interface-review` is a first-party capability inside the existing `design` skill, not a third skill or vendored module. It owns Git scope resolution, change classification, finding caps, and the task-local report. Impeccable remains the fallback and supplies canonical context, design principles, detector evidence, and the separately approved refinement flow.

The method was independently authored with inspiration from [`jakubkrehel/skills` commit `c25a8437`](https://github.com/jakubkrehel/skills/tree/c25a8437afc6fecf277158f7c6e2f9aa45f4993d). No upstream files, runtime imports, or sync relationship are included. Substantial future copying would require a separate vendored-module decision, exact provenance, the MIT notice, and the admission controls above.

## First-party detector orchestration

`design-core:detector-scan` owns the explicit `design detect -- <target...>` surface. It validates local project containment, invokes only the detector bundled with the approved Impeccable skill, and returns a versioned Design JSON envelope. The operation is read-only, works independently of hook activation, and does not expose upstream installation, update, URL, stdin, or automatic-fix paths.

The same first-party runtime facade resolves bundled scripts and host environment for manual scans and native hook adapters. Cursor and Codex retain their different hook protocols and fail-open behavior; the Agent Plugins package exposes only the manual scan because the standard does not define hooks.
