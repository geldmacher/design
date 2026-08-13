# Change-scoped interface review

Review the interface impact of a Git change without editing it. Design owns scope and reporting; bundled Impeccable supplies canonical product context, design judgment, and deterministic detector evidence. Do not start Impeccable's persistent `critique` playbook from this flow.

## Contents

- [Invocation](#invocation)
- [Resolve the scope](#resolve-the-scope)
- [Gather evidence](#gather-evidence)
- [Review the affected interface](#review-the-affected-interface)
- [Rendered verification](#rendered-verification)
- [Report contract](#report-contract)
- [Handoff to Impeccable](#handoff-to-impeccable)

## Invocation

Parse the request as `review [quick|full] [target]`. The mode defaults to `quick`. Everything after the mode is the target.

Accepted targets are `working`, `staged`, `branch`, `pr <n>`, a Git ref, and an exact `<a>..<b>` or `<a>...<b>` range. With no target, resolve committed branch work plus uncommitted files first, then only working-tree changes.

| Mode | Coverage | Finding cap | Rendering |
|---|---|---:|---|
| `quick` | The affected primary interface path; omit P3 polish | 5 | Reuse an already reachable preview only |
| `full` | Every affected domain and present interface state | 15 | May start one safe documented preview and must stop it |

Keep cwd at the user's repository. Resolve `<DESIGN_SKILL_ROOT>` to the directory containing the parent `SKILL.md`, and resolve `<IMPECCABLE_SKILL_ROOT>` to its sibling `../impeccable` directory. Never execute either placeholder unresolved.

## Resolve the scope

Run exactly once:

```bash
node "<DESIGN_SKILL_ROOT>/scripts/review-scope.mjs" --mode <quick|full> [--target "<target>"] --json
```

Exit `0` means `ready`, `2` means `empty`, and `3` means `blocked`; always parse the JSON before responding.

- On `blocked`, report `blocked.code`, `blocked.message`, and the relevant operations. Stop. Never invent a base or silently narrow the request.
- On `empty`, report the branch facts and exclusions. Offer the named last commit, a target the user names, or a surface review through the host's Design invocation with `critique <surface>`. Wait for a choice; never fall back to `HEAD~1..HEAD`.
- On `ready`, use only the returned files, refs, comparison SHA, patch commands, and exclusions. Preserve the user's two-dot or three-dot range.

The resolver may fetch only when an explicit PR, remote ref, or shallow explicit target requires Git metadata. Every such operation has `writesGit: true`. Never run `checkout`, `switch`, or `stash`. Never read a fetched PR's working-tree counterpart as if it were the reviewed revision.

Run each returned `patchCommands` entry to inspect both added and removed lines. For untracked files, read the file directly. Read a committed non-worktree revision with `git show <head-ref>:<path>` and cite lines against the head ref named in the report.

## Gather evidence

1. Read the bundled Impeccable `SKILL.md` once for its core principles, product modes, and host contract. Do not enter its command routing or select an Impeccable playbook; this Design capability owns change scope, review caps, and reporting.

2. Run Impeccable's context loader once, targeting the most representative in-scope interface file:

   ```bash
   node "<IMPECCABLE_SKILL_ROOT>/scripts/context.mjs" --target "<path>"
   ```

   Use only the returned canonical `PRODUCT.md`, `DESIGN.md`, surface brief, and `.impeccable/` context. Missing context does not block a scoped review.

3. Read the pull-request title and body from `intent` when present. Otherwise read the in-scope commit subjects. Judge the interface against that stated intent without expanding into process or scope-creep commentary.

4. Inspect the changed implementation and its affected surfaces. Expand one consumer hop for ordinary components and two for design tokens, theme values, and shared primitives. Prefer route/layout entry points, then reach, then package proximity. Inspect at most five consumers and state how many were not expanded.

5. Inspect removed lines for lost accessible names, semantic elements, labels, focus treatment, keyboard reachability, reduced-motion handling, logical layout properties, language direction, wrapping behavior, color tokens, and user-facing information. A removed signal is a lead; report a regression only when the change has no equivalent replacement.

6. Run the bundled detector at most once when all selected files exist in the active worktree, the platform is web, and the input is within the detector's supported size. Pass only scannable UI files:

   ```bash
   node "<IMPECCABLE_SKILL_ROOT>/scripts/detect.mjs" --json <files>
   ```

   Treat detector output as evidence, verify every hit in context, and name false positives. For fetched refs, ranges whose head is not the active worktree, unsupported files, or unavailable runtime, mark the detector `Not verified`; do not substitute a different checkout or rerun it elsewhere in quick mode.

Do not invoke `critique-storage.mjs`, write `.impeccable/critique/`, or load the persistent Impeccable critique playbook. The review report lives only in the current task.

## Review the affected interface

Apply Impeccable's product mode, visual principles, and project-specific world while reviewing these domains in order:

1. Accessibility and interaction: semantics, names, keyboard, focus, zoom, motion, states.
2. Layout and responsiveness: hierarchy, grouping, overflow, breakpoints, directionality.
3. Copy and information architecture: labels, recovery, empty/error content, stated intent.
4. Typography: hierarchy, measure, wrapping, font behavior, localization pressure.
5. Color and theming: semantic tokens, rendered contrast, dark/light behavior.
6. Visual polish and motion: coherence, product specificity, icons, surfaces, purposeful motion.

Review interface quality only. If the evidence suggests a correctness, security, or general test problem, name the boundary once and direct it to the appropriate project review; do not include it in the interface verdict.

Classify actionable change findings as `Introduced` or `Regression`. A nearby issue that predates the change is `Pre-existing`, belongs in a separate section, and cannot affect the change verdict.

Use these severities:

- `P0`: blocks task completion, creates data-loss or severe accessibility risk, or makes a required control unreachable.
- `P1`: materially impairs a core path or violates a required accessibility behavior.
- `P2`: causes a meaningful but workable comprehension, consistency, adaptability, or efficiency problem.
- `P3`: isolated polish with limited user impact; full mode only.

Consolidate one root cause into one finding. Prioritize severity, then affected reach, then fix leverage. Do not pad the report to its cap.

## Rendered verification

In quick mode, inspect a preview only when it is already running or directly available in the task. Do not start a server, create a worktree, or install anything. Mark visual/runtime claims `Not verified` when no preview is available.

In full mode, prefer an existing preview. Otherwise inspect project documentation and package scripts for one unambiguous `dev`, `preview`, or Storybook command that does not install dependencies, generate tracked files, run migrations, or contact production. Start at most one background server, record its stop method, and stop it before reporting. If the command is ambiguous or unsafe, do not run it.

For a PR or head ref outside the active checkout, rendered verification is permitted only in a uniquely owned temporary directory created with `mktemp -d` and populated through `git worktree add --detach <temp> <head-ref>`. Stop the server, remove that worktree, and report both Git writes. If dependencies are absent or cleanup cannot be guaranteed, stay source-only and mark rendering `Not verified`.

Inspect representative desktop and mobile widths and only the states the reviewed scope can credibly reach. A screenshot is evidence for appearance, not source behavior; source is evidence for implementation, not rendered quality.

## Report contract

Write these sections in order:

1. **Scope and Coverage**: mode, requested/resolved target, base/head refs and SHAs, committed and uncommitted counts, included/excluded files, expanded surfaces, and explicit review boundaries.
2. **Domain Coverage**: one row for every domain above with evidence inspected and `Clear`, finding count, or `Not reviewed: <reason>`.
3. **Findings**: ordered table with `#`, `Severity`, `Domain`, `Status`, `Location`, `Evidence`, `Recommendation`, and `Impact`. Every location is exact and resolvable against the declared head.
4. **Considered but Rejected**: include only genuine candidates rejected because the implementation is permitted, evidence is insufficient, or a change would add cost without user benefit. Omit this section when none exists; never invent filler.
5. **Pre-existing**: at most three, highest severity first, plainly outside this change's responsibility. Omit when empty.
6. **Verification**: exact commands/interactions and results, detector and render status, every operation with `writesGit: true`, cleanup, and all `Not verified` gaps.
7. **Interface verdict**: exactly one of `Block`, `Needs changes`, or `Clear in reviewed scope`. P0 means `Block`; any remaining P1-P3 Introduced/Regression finding means `Needs changes`; otherwise use `Clear in reviewed scope`. This is an interface verdict, not merge, correctness, test, or security approval.
8. **Recommended Design actions**: only actions that address reported findings, using the current host's Design entry point.

Quick mode reports at most five Introduced/Regression findings and omits P3. Full mode reports at most 15. Pre-existing findings sit outside both caps and the verdict.

## Handoff to Impeccable

Do not edit after the report. Offer one or more scoped follow-ups such as:

```text
/design polish <surface> using review findings 1-3
$design adapt <surface> using review finding 2
```

Use the active host's syntax; for a generic Agent Plugins client, describe the equivalent operation through the loaded `design` skill rather than inventing command syntax. The Design router passes these non-review improvements unchanged to bundled Impeccable. Wait for a separate user instruction before applying any finding.
