# Impeccable maintenance

`upstream/impeccable.pin.json` is the single approved source of truth for the bundled Impeccable version and provenance. Schema 2 records the repository, stable skill tag, annotated tag object, peeled commit, canonical release archive URL, archive SHA-256, and the engine release identity with all five asset URLs, IDs, sizes and SHA-256 hashes. The engine version comes from the selected skill release, never from an independent latest-engine lookup. Repository validation checks the module, lock, notices, generated capability index, and packaged target notices against that pin.

Normal plugin execution, target builds, `npm run release-check`, and `npm run sync:impeccable` remain offline. Runtime self-update checks are disabled. None of these paths polls GitHub, downloads content, or changes an approved pin.

## Update through one explicit skill invocation

From the Design source checkout, invoke `$update-impeccable` in Codex or `/update-impeccable` in Cursor. The repository-local [Update Impeccable skill](../.agents/skills/update-impeccable/SKILL.md) uses the existing check, prepare, and apply commands below. It is not shipped in the Agent Plugins, Cursor, or Codex packages and is not a Design router capability.

The invocation authorizes the complete repository update without another confirmation: choose the latest stable skill release, prepare its exact candidate, adapt first-party compatibility code required by that release, review the provenance and projected changes, apply that candidate, and run `npm run release-check` plus `git diff --check`. The agent performs compatibility maintenance and candidate review within this authorization; the manual commands below retain their separate preparation and application steps. No version is hard-coded in the skill.

The skill requires Node.js 22+, Git, `unzip`, and installed project dependencies. It checks the source checkout and records local changes within the candidate's replacement paths, including staged, untracked and ignored files. Existing uncommitted update work can continue: the skill checks the working-tree pin first and validates an already-current repository without requiring a clean tree. For a newer release it uses `--from-working-tree` after inspecting local work. Unrelated working-tree changes and the index are preserved. Missing verified inputs and unresolved conflicts with unrelated work remain visible blockers; incompatible transformations are repaired within the same invocation without weakening provenance or drift checks.

An already-current pin skips application but still runs both gates. After a successful application, a failed gate means **applied, validation failed** until its cause is repaired and both gates pass. The apply command's rollback covers write failures, not later gate failures. The report includes the starting and final pin, selected tag, candidate when present, changed scope, compatibility repairs, and gate results. Local plugin installation, host reload, commits, pushes, issue changes, and publication are outside this invocation.

Missing transformation anchors or changed upstream layout trigger inspection of the exact selected tag, a scoped repair to the owning transformation, overlay or host integration, and focused regression coverage. Preparation then runs again for the same tag; the new candidate receives a full review. Unknown content never becomes an unchecked pass. If the pin is already applied and a locked output needs regeneration, the skill may use the verified offline sync documented below for that same pin and exact archive, after retaining current bytes, reviewing the preview and rechecking local state. This recovery does not authorize bypassing provenance failures or unexplained candidate drift. Ordinary compatibility repairs do not require another invocation.

## Check for a stable release

Run the read-only check explicitly:

```bash
npm run check:impeccable-upstream -- --json
```

The schema-1 result is exactly one of:

- `current`: the approved pin is the latest returned stable `skill-vX.Y.Z` release;
- `update-available`: a newer stable skill release with `universal.zip` exists;
- `unverifiable`: metadata is missing, malformed, rate-limited, unreachable, inconsistent, or cannot establish the approved pin.

`current` and `update-available` exit with status 0. `unverifiable` exits with status 2 and is never treated as current. `GITHUB_TOKEN` or `GH_TOKEN` is optional for this read-only call. The command does not write repository or issue state.

## Prepare a candidate

After reviewing an `update-available` result, prepare a specific stable tag:

```bash
npm run prepare:impeccable-update -- --to skill-vX.Y.Z
```

Manual preparation rejects dirty update destinations by default. To prepare against inspected local work, append `--from-working-tree`. The candidate uses the actual working-tree bytes as its baseline, retains a complete copy under `before/`, and previews changes relative to that baseline. Review local additions and deletions as well as modified files before applying. Update-generated changes may be superseded when their intent is preserved by the projection; unrelated content must not be discarded merely because it has a backup. The skill invocation authorizes this review and application of a compatible candidate without requiring a commit or stash. An unresolved loss of local work requires a specific user decision.

Preparation fetches that exact annotated tag and its canonical release archive into an isolated temporary directory. It never extracts the archive. After verification it builds all three host projections and executes their packaged launchers, Design detector and native host adapters in isolated projects before reporting candidate-ready. Missing integration files, invalid output, unavailable entrypoints and invalid platform assets stop preparation and application. The portable launcher must work from its canonical manifest without host environment variables. Archive entries are inspected and streamed with `unzip`; unsafe, duplicate, missing, unknown extra, or non-regular entries fail closed. The one recognized packaging artifact, an empty generated `.cursor/skills/impeccable/scripts/.impeccable/hook.cache.json`, is accepted only with its exact canonical bytes and is excluded from the vendored scope. Every vendored skill and agent byte must match the exact tag checkout before transformations run.

Preparation also downloads all five engine assets and their checksum sidecars, verifies them against GitHub release digests and sizes, and includes them in the same lock and transactional skill inventory. Missing resources, commands, platform files or projection anchors stop preparation.

Verified provenance does not establish plugin runtime compatibility. Keep the packaged-entrypoint checks even when every upstream hash and the native engine handshake passes: a valid binary can still have a missing or incompatible integration layer. The candidate-readiness fixtures in `tests/impeccable-engine.test.mjs` cover these independent failure modes.

The only durable output is an ignored `.build/impeccable-candidates/iu-<16 hex>` directory. Its manifest binds the approved starting pin, every owned-path baseline, tag object, commit, archive hash, import inventory, transformation patch, projected outputs, and repository preview patch. Review `candidate.json`, `repository.patch`, and `projection/` before considering application.

## Apply an explicitly selected candidate

For manual maintenance, candidate application is a separate maintainer decision. The explicit update skill invocation above instead authorizes the agent to review and apply its selected candidate in one run:

```bash
npm run apply:impeccable-update -- --candidate iu-0123456789abcdef
```

Apply revalidates the candidate identity, approved pin, preview patch, projected output hashes, retained `before/` copy, and every owned-path baseline. It changes only the fixed candidate inventory and restores the exact previous bytes if any write fails. The retained baseline remains available after application; the Git index is not changed. It does not commit, push, open a pull request, deploy, publish, or reload a host. Unrelated dirty paths are outside the inventory and remain untouched.

The legacy offline source/archive workflow remains available:

```bash
npm run sync:impeccable -- --source /absolute/path/to/tag-checkout --archive /absolute/path/to/universal.zip
```

It reads the approved pin and previews by default. For native releases it verifies and reuses the five already pinned local engine files; it never downloads replacement binaries. `--apply --replace` preserves the existing explicit replacement interface.

## Weekly issue monitor

`.github/workflows/impeccable-upstream.yml` is scheduled for Monday at 06:17 UTC and supports manual dispatch. It uses read-only repository access plus issue write permission, Node.js 22, immutable official action revisions, and one concurrency group.

The workflow runs the same read-only checker first. Only `update-available` reaches issue reconciliation, which creates or updates one open issue marked with `<!-- impeccable-upstream-monitor:v1 -->`. `current` performs no issue write. `unverifiable` fails before reconciliation. The workflow has no pull-request trigger and no candidate application, commit, push, pull-request, merge, release, deployment, or publication step.

Repository tests simulate release metadata, archive validation, candidates, rollback, and issue reconciliation. A green repository gate does not prove a hosted workflow run or fresh Cursor/Codex activation; those remain separate, explicitly authorized checks.

## Native runtime and verification

The current import is skill 4.3.1 with engine 0.1.5. `src/impeccable-runtime.mjs` selects a physical in-package engine, verifies its hash and size, and invokes it without a shell. `overlays/skills/impeccable/scripts/impeccable` and `impeccable.cmd` are thin Node.js 22+ entrypoints. Native engines remain byte-identical to upstream; no Rust fork is shipped.

The package includes an exact copy of the source pin at `licenses/impeccable-pin.json`. This is packaged provenance, not a second configuration surface. POSIX execute permissions and the complete platform matrix are checked. Missing or unsupported engines remain visible diagnostics; there is no PATH, user-cache or external binary fallback.

Plugin hook administration changes only `.impeccable/`; the upstream ignore parser runs in an owned scratch project and only its canonical config changes are transferred back. Context staleness diagnostics remain enabled, using a disposable per-call notice cache instead of writing to the user's home. Self-update polling is disabled. Context and doctor distinguish configured adapters from proven editor activation. Portable role output uses inline contracts and rejects unknown role instructions.

Run `npm run verify:impeccable-engine` for the [repository verifier](../.agents/skills/verify-impeccable-engine/SKILL.md). It is included in `release-check`, stores evidence outside the checkout, and reports unexecuted platforms. CI exercises the native engine and adapters on five operating-system/architecture runners. Fresh Cursor/Codex smoke remains separately commissioned; neither CI nor local adapter fixtures prove editor activation.

The plugin projects known context variants, including monorepo target selection, and reads hook configuration from the engine-resolved project. Ignore aliases share the isolated canonical-config administration. Doctor remains read-only; its reports and loaded references require explicit authorization for project migration edits. These adaptations live in the shared integration and the `plugin-project-maintenance` transformation, never in hand-edited locked files.

When adapting engine output, distinguish engine instructions from embedded project data. Preserve PRODUCT.md, DESIGN.md and surface-brief text as emitted, including command examples, role terminology and Markdown separators. Apply host changes only to recognized instruction sections or structured instruction fields; unknown instruction formats remain diagnostics. The context regression fixtures in `tests/impeccable-engine.test.mjs` and the packaged launcher journeys in `tests/portable-runtime.test.mjs` protect this boundary. Resolve engine-reported context paths against the actual invocation working directory, including inherited files; repository root and selected app root are not interchangeable path bases.
