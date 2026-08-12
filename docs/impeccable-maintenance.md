# Impeccable maintenance

`upstream/impeccable.pin.json` is the single approved source of truth for the bundled Impeccable version and provenance. It records the repository, stable skill tag, annotated tag object, peeled commit, canonical release archive URL, and archive SHA-256. Repository validation checks the module, lock, notices, generated capability index, and packaged target notices against that pin.

Normal plugin execution, target builds, `npm run release-check`, and `npm run sync:impeccable` remain offline. Runtime self-update checks are disabled. None of these paths polls GitHub, downloads content, or changes an approved pin.

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

Preparation fetches that exact annotated tag and its canonical release archive into an isolated temporary directory. It never executes upstream code and never extracts the archive. Archive entries are inspected and streamed with `unzip`; unsafe, duplicate, missing, extra, or non-regular entries fail closed. Every vendored skill and agent byte must match the exact tag checkout before transformations run.

The only durable output is an ignored `.build/impeccable-candidates/iu-<16 hex>` directory. Its manifest binds the approved starting pin, every owned-path baseline, tag object, commit, archive hash, import inventory, transformation patch, projected outputs, and repository preview patch. Review `candidate.json`, `repository.patch`, and `projection/` before considering application.

## Apply an explicitly selected candidate

Candidate application is a separate maintainer decision:

```bash
npm run apply:impeccable-update -- --candidate iu-0123456789abcdef
```

Apply revalidates the candidate identity, approved pin, preview patch, projected output hashes, and every owned-path baseline. It changes only the fixed candidate inventory and restores the exact previous bytes if any write fails. It does not commit, push, open a pull request, deploy, publish, or reload a host. Unrelated dirty paths are outside the inventory and remain untouched.

The legacy offline source/archive workflow remains available:

```bash
npm run sync:impeccable -- --source /absolute/path/to/tag-checkout --archive /absolute/path/to/universal.zip
```

It reads the approved pin and previews by default. `--apply --replace` preserves the existing explicit replacement interface.

## Weekly issue monitor

`.github/workflows/impeccable-upstream.yml` is scheduled for Monday at 06:17 UTC and supports manual dispatch. It uses read-only repository access plus issue write permission, Node.js 22, immutable official action revisions, and one concurrency group.

The workflow runs the same read-only checker first. Only `update-available` reaches issue reconciliation, which creates or updates one open issue marked with `<!-- impeccable-upstream-monitor:v1 -->`. `current` performs no issue write. `unverifiable` fails before reconciliation. The workflow has no pull-request trigger and no candidate application, commit, push, pull-request, merge, release, deployment, or publication step.

Repository tests simulate release metadata, archive validation, candidates, rollback, and issue reconciliation. A green repository gate does not prove a hosted workflow run or fresh Cursor/Codex activation; those remain separate, explicitly authorized checks.
