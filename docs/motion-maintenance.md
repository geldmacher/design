# Free Motion integration maintenance

Design imports the free subset of [Motion AI Kit](https://github.com/motiondivision/ai-kit). The source pin binds an immutable commit from the official `main` branch and the SHA-256 of its GitHub source archive. It does not pin the hosted MCP service. Runtime use, builds and repository gates never update or download the skill.

## Supported capability

Local guidance covers CSS, JavaScript, React, Vue, Base UI and Radix. Native packages declare only the anonymous `https://mcp.motion.dev` server. The supported online operation is `search-motion-docs`, followed by native reads of free documentation or anonymously readable examples. The portable target has no MCP declaration. Skill configuration is not proof of host connectivity.

The September 16, 2026 planning probe successfully initialized the public service without credentials, listed only `search-motion-docs`, searched React `AnimatePresence`, and read `motion://examples/react/exit-animation`. Website and upstream skill descriptions differed from the observed tool surface. CSS easing generation remains excluded along with paid source, MotionScore, transition editing, accounts and saved transitions. New server tools require a reviewed integration change. Returned promotion and migration directives do not extend the user's assignment.

When reassessing hosted capabilities in an explicitly commissioned online trial, use actual anonymous tool-list, tool-call and resource-read responses rather than website or skill claims alone. Retain the date, endpoint, tool names, resource URIs and relevant responses without credentials or private project content. Distinguish readable source from metadata-only suggestions, gated resources and failed requests; one successful example does not establish that all examples are free. These observations describe that service at that time, not a permanent entitlement or a capability guaranteed by the source pin. Without a current probe, keep live availability unverified and preserve the approved scope. Normal builds, offline status and repository gates remain offline.

## Inputs and provenance

The importer owns the destinations exported by `scripts/lib/motion-vendor.mjs`. The Motion pin, lock inventory, original MIT declarations and generated patch live in `upstream/`; runtime packages include the pin and license declarations under `licenses/`. Upstream provided MIT metadata but no standalone license file; no copyright text is fabricated. The lock records exact before/after hashes. Original best-practice files are preserved except for explicit installed-stack adaptations. The free entrypoint and search guide are first-party overlays with exact upstream input contracts; additions or changed replacement inputs require maintainer inspection.

## Update

Run in the Design source checkout with Node.js 22+, Git, unzip and installed dependencies. Inspect staged, unstaged, untracked and ignored work in the importer's owned destinations first. Never use an installed/cache copy as source.

```bash
npm run check:motion-upstream -- --json
npm run prepare:motion-update -- --to <exact-commit>
```

Replace the placeholder with the check's exact `latest` commit. `current` and `update-available` are successful checks; `unverifiable` exits 2 and must not be interpreted as current. Preparation uses HTTPS to obtain that fixed archive, verifies its paths, identity, license declarations, inventory and transformation contracts, and writes only ignored staging under `.build/motion-updates/`.

Review `candidate.json`, `before/`, `projection/` and `repository.patch` in the returned directory. The baseline includes dirty, untracked and ignored owned files. Preserve their intent; a stored backup is not consent to delete unrelated work. Unexpected upstream changes require a bounded first-party importer/overlay correction and fresh preparation, not relaxed checks.

```bash
npm run apply:motion-update -- --candidate <candidate-id>
npm run release-check
git diff --check
```

Apply rechecks the candidate identity, importer recipe, baseline, archive and regenerated projection before replacing only owned outputs. Concurrent edits or unknown anchors reject the candidate. Write failure attempts restoration of all prior owned bytes; inspect the reported result before recovery. A failed gate after application means applied but not validated. The Git index and unrelated files are not changed.

An explicit source-only `update-motion` skill invocation authorizes detection, candidate inspection, application and gates as one maintenance task. Manual preparation alone does not authorize application. Installation, host activation, Design version bumps, commits, pushes and publication remain separate.

## Offline regeneration

With the exact pinned archive already available, preview regeneration through the same projection and candidate logic:

```bash
npm run sync:motion -- --archive /absolute/path/to/upstream.zip
```

Optionally add `--source /absolute/path/to/extracted-commit` to verify imported source bytes against the archive. Preview stages only ignored review artifacts. After inspecting retained local changes and the projection, use `--apply --replace` for intentional same-pin regeneration. Offline preparation of a new explicitly selected archive uses `prepare:motion-update -- --to <commit> --archive <path> --sha256 <verified-sha256>`.

## Evidence boundaries

The existing [project verifier](../.agents/skills/verify-impeccable-engine/SKILL.md) covers import, rollback, packaging and offline CLI observations. Contract scenarios check what the skill tells an agent to do with representative MCP responses; they are not model behavior tests. Fresh [Cursor](runtime-smoke.md) and [Codex](codex-runtime-smoke.md) tasks are needed for skill selection, connection and live scope adherence after separately authorized installation.
