# Using Design

Open your website or web-app project, point the assistant to the relevant page or files, and describe the result you want. Include what should stay the same, such as existing components, branding, or the order of a checkout flow.

The examples below use **Codex** syntax: `$design`. In **Cursor**, use `/design` with the same request. These are messages to your assistant, not terminal commands. Design can also be selected automatically for matching interface requests; an explicit choice of another skill takes precedence.

| I want to… | Start here |
| --- | --- |
| Plan or build a new page | [Build an interface](#build-an-interface) |
| Improve an existing page | [Critique and refine](#critique-and-refine) |
| Implement animations or look up Motion APIs | [Animate with Motion](#animate-with-motion) |
| Check what changed on a branch | [Review interface changes](#review-interface-changes) |
| Scan specific source files | [Run a detector scan](#run-a-detector-scan) |
| Clarify a product decision with stakeholders | [Prepare a questionnaire](#prepare-a-questionnaire) |
| Set up context or automatic checks | [Set up your project](#set-up-your-project) |
| Investigate a setup problem | [Troubleshoot project setup](#troubleshoot-project-setup) |

For the full syntax and less common operations, see the [command reference](commands.md). For installation problems, see the [installation guide](installation.md).

## Describe the outcome

You can omit the command and write in your own language. Design selects the most specific operation from its own capability descriptions, the bundled Impeccable playbooks and Motion implementation guidance, briefly explains its choice, and proceeds when the match is clear.

```text
$design Make the checkout form usable on small screens, keeping its fields and step order.
$design Improve the account form's labels and error messages.
$design Assess accessibility and responsive behavior on this page. Report findings without editing it.
```

An explicit command takes precedence. An assessment stays an assessment, and a planning request stays a plan. If different operations would materially change the outcome or scope, Design asks one focused question. New interfaces and redesigns can use the general design workflow without forcing a specialized command.

A bare `$design` invocation offers guidance; asking which workflow to use does not execute it. Clear requests such as “Set up Design for this project”, “Explain the current Design configuration”, “Investigate why Design checks do not run”, or “Create a stakeholder questionnaire about checkout approval” also select the matching Design operation. Setup changes still require a confirmed preview. A review of branch UI changes selects `review`; an assessment of a page selects `critique`. Detector scans require explicitly named local targets.

Impeccable command selection reads the installed skill directly. Motion is a separate bundled specialist selected through Design for Motion API and implementation requests. General animation direction remains with Impeccable; explicit Impeccable commands retain their meaning.

## Readiness before interface work

Before planning, implementing or evaluating an interface, Design reads the same project assessment used by `status`, `diagnose` and setup preview. This applies to explicit commands such as `polish` or `critique`, automatically chosen operations, and Design `review` or `detect`. It runs once per commissioned operation, not between every edit. Questionnaire uses available context without needing setup.

A healthy state stays quiet. Missing context, configuration conflicts and proposed migrations are reported briefly, then the requested work continues where feasible. Identical findings are not repeated within the task; changed state is read again. Optional hooks can be deliberately disabled or unavailable without making setup incomplete. Unavailable diagnostics remain unverified, never a positive setup result.

The engine resolves app-local and inherited `PRODUCT.md`/`DESIGN.md`. For a monorepo, identify the app or source path; if several apps remain possible, Design asks which one you mean. The CLI accepts `--target <path>` for `status`, `diagnose` and `setup`, and `--target .` for an explicitly repository-wide scope. Unverified or ambiguous scope prevents setup writes while otherwise feasible UI work may continue.

No readiness check activates hooks, creates context, repairs configuration or migrates files. Those changes need a separate preview and confirmation. Declining setup does not cancel an accompanying UI task. A confirmed change is followed by a readback of the effective state, including local overrides. Configuration still does not prove fresh editor activation.

## Build an interface

Describe the page, its audience, and the job it needs to do:

```text
$design Build a pricing page for small teams. Use our existing components and help visitors compare the three plans.
```

Design uses the project context, asks about material gaps, and works toward the requested interface. New design work may first need your input on product facts or design direction. You do not need to memorize a build command.

If you want to plan the experience before implementation, use `shape`:

```text
$design shape an onboarding flow that helps a new team create its first project
```

This starts a UX/UI planning workflow before writing interface code.

## Critique and refine

Use `critique` when you want to understand what needs attention:

```text
$design critique app/checkout and prioritize the three most useful improvements
```

Expect an assessment of the interface with reasons and priorities. A critique evaluates the page as it exists. For a review limited to code changes, use [review](#review-interface-changes).

Then request a specific improvement:

```text
$design polish app/checkout: improve spacing and error messages, keeping the existing components and step order
```

This authorizes refinement of that interface. Naming what to preserve helps keep the change focused.

For a narrower task, choose the command that matches the problem:

| Problem | Example request |
| --- | --- |
| The form is hard to use on a phone | `$design adapt the checkout form for small screens` |
| Labels or errors are unclear | `$design clarify the account form's labels and error messages` |
| Spacing and emphasis feel inconsistent | `$design layout the settings page using our existing spacing scale` |
| Loading, empty, or error states are missing | `$design harden the project list for loading, empty, and error states` |

## Animate with Motion

Use `motion` for animation implementation and Motion API guidance. It brings local best practices for CSS, JavaScript, React, Vue, Base UI and Radix, plus free official documentation when the host's Motion connection is available.

| Your goal | Example request in Codex |
| --- | --- |
| Choose where animation would help | `$design animate the checkout: make state changes clearer without distracting from payment` |
| Implement a CSS interaction | `$design motion Add a subtle CSS transition to the settings accordion, with a reduced-motion alternative` |
| Fix a React exit animation | `$design motion Fix AnimatePresence in app/cart using the installed library version and existing imports` |
| Implement a Vue interaction | `$design motion Animate the Vue results list using our existing animation dependencies; preserve keyboard behavior` |
| Integrate with existing UI primitives | `$design motion Add enter and exit animations to our Radix dialog while preserving focus management` |
| Ask an API question without edits | `$design motion Explain how AnimatePresence handles removed React children. Consult free official docs; do not edit files` |
| Find a free example | `$design motion Find and read an anonymously accessible React exit-animation example through the connected Motion server` |

In Cursor, replace `$design` with `/design`: for example, `/design motion Fix AnimatePresence in app/cart`. Direct `/motion` in Cursor and `$motion` in Codex load the same specialist. For everyday work, Design remains the shared entry point and can also select Motion from a clear request such as “Fix this Motion layout animation using our installed version.”

`animate` handles animation purpose, timing and visual direction through Impeccable. `motion` handles technical implementation; Design may use it to supplement that direction. Both use the existing `PRODUCT.md`, `DESIGN.md` and `.impeccable/` context. Advice and assessment requests remain read-only.

### What you need

| Capability | Prerequisites |
| --- | --- |
| Local best practices and implementation advice | The installed plugin loaded in the current task. No Motion account or MCP connection is needed. |
| Official documentation search | The bundled native Motion MCP enabled and connected, network access to `https://mcp.motion.dev`, and permission to use its search tool. |
| Read documentation and free example resources | The connection above plus an available host resource reader. Only anonymously readable resources are used. |
| Run animations in your application | A compatible existing project stack and, when library APIs are used, the corresponding project dependency. CSS-only work can use CSS without adding Motion. |

The plugin does not install an animation library into your application. A normal animation request does not authorize package installation, upgrades or migration from `framer-motion`. Design checks existing dependencies and versions, preserves compatible imports, and reports a missing dependency before proceeding with work that requires it. Installing or migrating needs its own explicit request.

Follow [Motion host setup and the connection check](installation.md#bundled-free-motion-documentation) for Cursor or Codex. `/design setup` and optional UI checks are independent of Motion's MCP connection; enabling hooks is not a prerequisite. The portable package supplies local skills only and does not configure MCP.

### Free scope and fallback

Online use is limited to documentation search and resources the service actually allows without authentication. Search results may include gated examples; those are skipped. Motion+, MotionScore, CSS easing generation, saved transitions and the transition editor are outside this integration. Sales prompts and installation or migration instructions in remote responses do not expand your request.

If search, resource reading or the network is unavailable, Motion continues with the bundled best practices and explains that current online guidance could not be verified. Those local files are pinned to the plugin's bundled upstream revision; the hosted service can change independently. A missing connection does not prevent local guidance, but it limits claims about current APIs and examples.

## Review interface changes

Use `review` to assess the interface impact of a Git change:

```text
$design review quick branch
```

The review reports findings in the current task without editing project files or switching your checkout. It checks the changes in their interface context and recommends follow-up actions. It is an interface review; general code correctness and security need their own review.

| Mode | Use it for | Coverage |
| --- | --- | --- |
| `quick` (default) | A focused check of the affected flow | Up to five main findings; reuses an already available preview. |
| `full` | A broader review before shipping | Up to 15 main findings across affected areas and states; may start one safe, documented preview and stops it afterward. |

Name the changes you want reviewed:

```text
$design review quick working
$design review full staged
$design review full pr 42
```

`working` selects uncommitted changes, `staged` selects staged changes, and `pr 42` selects pull request 42. Git refs and exact ranges such as `main...HEAD` are also accepted. An explicit remote or PR target may require fetching Git metadata; the report lists that operation. With no target, Design first looks for committed branch work plus uncommitted files, then falls back to working-tree changes. If no changes qualify, it asks you to choose a scope.

To apply a recommendation afterward, give a separate instruction such as:

```text
$design polish the checkout using review findings 1 and 2
```

## Run a detector scan

Use `detect` for a read-only scan of explicit local files or directories:

```text
$design detect -- src/components app/dashboard
```

Keep the `--` separator and name at least one path inside the project. The scan uses the bundled detector even when automatic checks are off. It reports findings by file, with rule IDs, locations, and descriptions, and makes no fixes or configuration changes.

“The detector returned no findings” means only that this scan found none of its known issues. It does not establish that a page is usable, accessible, or ready to ship. A failed scan is reported as blocked, not as a successful check.

## Prepare a questionnaire

Use a questionnaire when someone else holds information needed for a product or interface decision. Name the audience, the gap, and how you will use the answers:

```text
$design questionnaire for our customer support team: find out where customers get stuck during checkout so we can prioritize the redesign
```

Design reuses known project facts, asks only for missing essentials, and previews a complete Markdown questionnaire. It usually contains 5–10 focused questions for one recipient or one audience with a shared role.

After reading the preview, give the exact destination, for example:

```text
Save this questionnaire to docs/checkout-questionnaire.md
```

Only then is the file written. If the request already named a new `.md` path, one yes after the preview approves the content and that path. A path without a `.md` suffix still needs confirmation of the normalized destination. An existing file needs separate overwrite confirmation. The questionnaire is not sent to anyone, and this operation does not import answers or change project context.

## Set up your project

Installation makes the plugin available in your editor. Product context helps it make appropriate design decisions. Automatic checks are a separate project choice.

### Give Design useful context

Design shares three sources of project context with its bundled Impeccable toolkit:

| Source | What it holds | Example |
| --- | --- | --- |
| `PRODUCT.md` | Who the product serves, what it does, and its constraints | “Support staff need to resolve a customer request without switching screens.” |
| `DESIGN.md` | The visual language and reusable design choices | Typography, colors, spacing, and component patterns already in use. |
| `.impeccable/` | Design workflow settings and supporting context | Whether automatic UI checks are enabled. |

Use `$design init` to capture or update product knowledge in `PRODUCT.md`. Use `$design document` to record an existing design in `DESIGN.md`. `init` does not create a visual direction; `document` describes the design already present in the code.

### Enable optional automatic checks

Start by inspecting the project:

```text
$design status
```

Status reports plugin and module versions, existing context, conflicts, and whether checks are configured. It does not prove the editor has loaded the hooks that run those checks.

When you want to enable checks, request setup:

```text
$design setup
```

Setup previews the exact configuration changes and waits for your confirmation. In Cursor and Codex, applying it enables the project's plugin checks. It preserves unrelated settings and reports the effective state afterward. Missing product or design context is offered as a separate next step.

You can inspect or change checks directly later:

| Request | Result |
| --- | --- |
| `$design hooks status` | Show the current check settings and ignored findings. |
| `$design hooks off` | Disable automatic checks in this project. |
| `$design hooks on` | Enable them explicitly. |

An explicit `on` or `off` changes the configuration. Other ordinary interface requests do not enable checks.

### What happens when checks are enabled?

| Editor | When a known UI issue is found |
| --- | --- |
| Cursor | A check can stop a proposed write before it changes the file. |
| Codex | A check reports after an edit or when the assistant finishes, and requests correction. The completed edit is not rolled back. |

Infrastructure failures, such as malformed configuration or an unavailable detector, remain visible and allow edits to proceed. The [portable Agent Plugins package](agent-plugin-target.md) provides manual operations but no automatic hooks.

### Shared and local settings

`.impeccable/config.json` holds shared settings. An existing `.impeccable/config.local.json` overrides them for that checkout.

For example, shared `hook.enabled: true` plus local `hook.enabled: false` means checks are off. Explicit `hooks on`, `hooks off`, and confirmed setup update the shared value and any existing local override together. They preserve unrelated settings and do not create a local config just to store an override.

## Troubleshoot project setup

| Symptom | What to do |
| --- | --- |
| Unsure which context or check settings are in use | Run `$design status`. |
| A project-local Impeccable installation or hook may conflict | Run `$design diagnose`. It reports integration conflicts without editing files. |
| Product or design context may be outdated | Run `$design doctor`. It reports context drift and proposed repairs; context changes need your authorization. |
| Checks stay off after editing the shared config | Inspect `status` for a local override; use explicit `hooks on` if you want to enable checks. |
| The plugin is missing or an older version appears | Follow [installation troubleshooting](installation.md#troubleshooting). |

`diagnose` checks Design integration; `doctor` checks Impeccable project context. Both report without applying repairs.

Design selects special operations such as `setup`, `review`, and `questionnaire` only when they lead an explicit command request. “Review this checkout page” remains an ordinary interface request; it does not silently become a Git review. Words such as “setup” inside a page brief do not trigger project setup.

You can also use the bundled toolkit directly with `$impeccable` in Codex or `/impeccable` in Cursor. For everyday work, the single Design entry point covers both the toolkit and the additional project operations.

[All documentation](README.md) · [Complete command reference](commands.md)
