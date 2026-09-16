# Curated extension architecture

Modules are repository-reviewed, bundled at release time, and represented by one `modules/<id>.json` manifest validated against `modules/module.schema.json`.

## Module contract

Each module declares:

- stable ID and version;
- first-party or vendored source URL plus an exact tag/commit and packaged archive hash when applicable;
- license;
- capabilities with skill owner, leading command triggers, and fallback status;
- every contributed skill, agent, rule, hook, script, or MCP configuration.

The generated `skills/design/references/capabilities.md` is the skill's only routing index. It combines leading commands (`setup`, `status`, `diagnose`, `detect`, `review`, `questionnaire`, and `motion`) with semantic capability descriptions. Motion API and implementation requests select Motion. General animation direction and explicit Impeccable commands such as `animate` or `doctor` remain with Impeccable. Mentions, negations and workflow-advice questions do not authorize execution.

`src/registry.mjs` loads module metadata for status and index generation. The schema is development-only; packaged module files omit `$schema` references.

## Admission rules

1. The module must improve website or web-app design work without introducing a competing project-context format.
2. `PRODUCT.md`, `DESIGN.md`, and `.impeccable/` remain canonical.
3. No runtime download, dynamic module URL, package installation, unpinned foreign skill, or hidden model/provider routing.
4. Every contribution must exist, be declared by the applicable Agent Plugins, Cursor, or Codex package contract where required, and be owned by exactly one curated module.
5. Vendored code needs source/license notices, a pin, hashes, an explicit transformation allowlist, tests, and a maintainer-only sync.
6. An MCP module must add the real MCP configuration and manifest entry together. Do not add empty MCP scaffolding.

Build projection narrows contributions per target. Cursor and Codex retain their host adapters, role contracts and the free Motion MCP configuration. The Agent Plugins v1 package contributes the three skills (`design`, `impeccable`, `motion`) and their generic runtime; native hooks, root agents and MCP configuration are removed from its projected module manifests.

## First-party change review

`design-core:change-interface-review` is a first-party capability inside the existing `design` skill. It owns Git scope resolution, change classification, finding caps, and the task-local report. Impeccable remains the fallback and supplies canonical context, design principles, detector evidence, and the separately approved refinement flow.

## First-party stakeholder questionnaire

`design-core:stakeholder-questionnaire` is a first-party capability inside the existing `design` skill. It owns only a leading `questionnaire` intent, reads the canonical Design context without changing it, previews the complete Markdown, and requires an exact post-preview `.md` destination before writing at most one file. It sends nothing and does not import or analyze completed answers.

## First-party detector orchestration

`design-core:detector-scan` owns the explicit `design detect -- <target...>` surface. It validates local project containment, invokes only the detector bundled with the approved Impeccable skill, and returns a versioned Design JSON envelope. The operation is read-only, works independently of hook activation, and does not expose upstream installation, update, URL, stdin, or automatic-fix paths.

The same first-party runtime facade resolves bundled scripts and host environment for manual scans and native hook adapters. Cursor and Codex retain their different hook protocols and fail-open behavior; the Agent Plugins package exposes only the manual scan because the standard does not define hooks.
