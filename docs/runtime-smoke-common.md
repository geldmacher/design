# Shared fresh-host smoke

Use this procedure together with the [Cursor entry](runtime-smoke.md) or [Codex entry](codex-runtime-smoke.md). These are separately commissioned manual trials; the repository gate does not install, activate, or exercise an editor.

## Preparation and evidence

Create a disposable project beneath the ignored `.tests/` workspace with a clean `src/Card.jsx`. Record the date, host/version, repository and installed plugin paths, test project path, `node --version`, fresh task identity, and all installation, activation, and hook-trust confirmations. Record initial project contents and the host hook manifest hash or absence. Use only disposable copies for failure cases.

Run `npm run verify:impeccable-engine` from the source checkout and retain its printed evidence directory. Compare the installed package identity with the deployment preview or release receipt. Read the product version from `package.json` and the skill/engine versions from `upstream/impeccable.pin.json`; local deployment versions include the host and content digest. The installed `licenses/impeccable-pin.json` and platform binary must match that provenance. Source checks do not prove editor activation.

Complete the host entry's discovery steps, then run the shared sections in order. Invoke commands explicitly in the host conversation:

| Host | Design invocation | Impeccable invocation | Host hook manifest |
| --- | --- | --- | --- |
| Cursor | `/design` | `/impeccable` | `.cursor/hooks.json` |
| Codex | `$design` | `$impeccable` | `.codex/hooks.json` |

Below, command suffixes such as `detect -- src/Card.jsx` follow the selected Design invocation. Keep hooks disabled until the configuration section. Record file contents before and after each read-only journey.

## Detector and native engine

1. Invoke `detect -- src/Card.jsx`. Expect `no-findings`, exit `0`, and bundled Impeccable provenance, including `engineVersion` and `platform`. This proves only the absence of deterministic findings.
2. Create `src/Bad.html` with the fixture below and invoke `detect -- src/Bad.html`. Expect `findings`, exit `2`, a positive primary count, and a normalized `side-tab` finding. The scan must leave its input unchanged.
3. Invoke `detect --` without a target, then try a URL and a path outside the disposable project. Each must return one `blocked` JSON envelope with exit `1` and must not invoke a remote or project-local detector.
4. Confirm scans never activate hooks, change ignores, or fix files. Refinement is a separate explicit invocation.
5. Resolve the installed Impeccable skill directory and run its `scripts/impeccable context` launcher (`impeccable.cmd` on Windows) from the disposable project. Context and Impeccable `doctor` must report configuration honestly without installing manifests or querying for an engine update. Missing, unsupported, or modified engines remain visible failures; no fallback or download is allowed.

```html
<style>.card { border-left: 4px solid #7c3aed; border-radius: 16px; }</style>
<div class="card">Hello</div>
```

## Read-only Design diagnosis

Invoke `diagnose --json`. Expect exit `0`, integration findings and status fields. Invoke an unknown option and an extra positional argument through the resolved Design CLI. Each must fail with exit `1` and a stderr message showing the accepted usage. Confirm that every diagnosis invocation leaves project files unchanged.

## Stakeholder questionnaire

Record hashes of `PRODUCT.md`, `DESIGN.md`, `.impeccable/` and the host hook manifest.

1. Distribute the topic, audience, decision need and answer use across the request and canonical context. Invoke `questionnaire checkout approval`. Known facts must not be asked again; only missing required facts are requested in one compact round.
2. Supply missing facts. Expect the complete Markdown questionnaire in the conversation, 5–10 prioritized atomic questions and no more than 12, covering every stated information need without a file write.
3. After the preview, provide the new path `docs/checkout-questionnaire.md`. Exactly one file must be created with the approved bytes; context and hook hashes must remain unchanged.
4. Repeat with an existing Markdown destination. A conflict or diff must precede any separately confirmed overwrite. The flow must send nothing, import no answers, and create no second file.

## Change review

Use disposable Git history with one committed UI change, one uncommitted UI file and one changed lockfile.

1. Invoke `review`. Expect quick mode, branch plus uncommitted changes, an explicitly excluded lockfile, at most five actionable findings and no file changes.
2. On a clean branch without commits ahead, invoke `review`. Expect the branch and last commit, an explicit-target or critique offer, and no automatic `HEAD~1..HEAD` review.
3. With a disposable preview running, invoke `review quick working`. It may reuse the preview but must start no server or worktree.
4. Stop the preview and invoke `review full branch`. At most one documented safe preview may start; verification must be recorded, the process stopped and the working tree preserved.
5. Review a disposable pull request only when remote access is part of the trial assignment. Fetch must preserve the active checkout, every `.git` write must be reported, temporary rendering worktrees must be removed, and unavailable rendering must be marked `Not verified`.
6. No `.impeccable/critique/` snapshot may be written. Separately invoke `polish` for an explicitly named surface using a review finding; bundled Impeccable must receive the refinement.

## Configuration, overrides and repetition

Record foreign configuration settings and host-manifest sentinels before each case. Run each case in its own disposable copy.

1. Without local configuration, invoke `setup`. Before confirmation, no bytes may change. Confirm the preview, then verify the main configuration enables the hook and no local file or host manifest was created.
2. Create main/local `.impeccable/config.json` and `.impeccable/config.local.json` with opposite `hook.enabled` values. Test both directions, plus both values initially false. `status` must follow the local override. `setup` must preview exactly the files that need changes before confirmation; afterward the main setting and existing local override must both be true, and the reported effective state must match a fresh `status`.
3. Exercise both the resolved Design CLI `hook off`/`hook on` and Impeccable `hooks off`/`hooks on`. Seed an opposite local override before each operation. Explicit on/off must reconcile both settings, preserve unrelated settings and report the reread effective state. It must not create an absent local file.
4. Repeat an already-applied operation. Expect no changed bytes and no duplicate host-hook registration. Restore disabled state in that case's disposable copy.
5. Malform either configuration file in a disposable copy. Setup must report the error and leave both files untouched; infrastructure failures must remain visible without preventing product edits. Observe actual host events using the host entry's contract.

## Activation handoff to host adapter checks

Return to the disposable project used for the host adapter trial, not a malformed-config or conflict copy. Keep this same project throughout the following sequence:

1. Invoke Impeccable `hooks off`, then Design `status`; confirm the effective hook state is disabled.
2. Invoke Design `setup`, inspect its preview and confirm activation. Read Design `status` again; proceed to the host entry's active adapter checks only when the effective hook state is enabled. A blocked setup or a disabled state leaves those checks unverified.
3. At the host entry's deactivation step, invoke Impeccable `hooks off` and read Design `status` again. Confirm the effective state is disabled before exercising the inactive adapter cases.

## Closeout

Retain installed package identity, task identity, explicit invocations, adapter outputs, file comparisons, omissions and cleanup receipts under `.tests/`; keep the verifier's external evidence directory. Stop only trial-owned processes and remove only trial-owned disposable resources. Installation removal is a separately authorized host action. State unexecuted cases explicitly. Repository checks, installation alignment, fresh host observations and publication are separate evidence.
