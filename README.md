<img src="assets/logo.svg" alt="Design" width="64" height="64">

# Design

**Build clearer, more consistent websites and web apps with Cursor or Codex.**

Design helps your AI assistant plan new pages, improve existing interfaces, and spot usability problems. It works with your product goals, components, and visual style so changes fit your project.

- **Build with direction:** turn an idea into a page or flow that fits your product.
- **Improve what you have:** refine layouts, mobile behavior, accessibility, and UI text.
- **Know what to fix first:** review a page or a branch's interface changes and get prioritized findings.

## Quick start

With Design installed, open your website or web-app project and name the page or files you want to change. Replace `app/checkout` with your own target:

```text
$design Improve the labels and error messages in app/checkout so customers can complete the form. Keep the existing components, fields, and step order. Verify keyboard use and mobile error states.
```

In **Cursor**, replace `$design` with `/design`. Send this as a message to your assistant. Commands are optional: describe the outcome in your own language, including German, and Design selects a suitable operation. It can also be selected automatically for matching interface requests; an explicit choice of another skill takes precedence.

## Recommended workflows

| Your situation | Start here | Next step |
| --- | --- | --- |
| You know the problem | Request a specific change, as in the example above | Check the affected behavior and states |
| You are unsure what needs improvement | `$design critique app/checkout` | Choose the most useful findings, then request their implementation |
| A new flow needs a plan | `$design shape an onboarding flow for new teams` | Decide on the plan, then explicitly request the build |
| You want to check a branch's UI changes | `$design review quick branch` | Read the findings, then request any follow-up changes |

Critique and review report findings; shape produces a plan. Implementation needs an explicit request. See [worked examples](docs/usage.md#recommended-workflows) and [how to work efficiently](docs/usage.md#work-efficiently) for prompts, expected results, and focused checks.

Design uses existing `PRODUCT.md`, `DESIGN.md`, and `.impeccable/` context. Use [project setup](docs/usage.md#set-up-your-project) when you need to establish that context. Guided writes require confirmation; automatic checks stay off until you enable them. Missing context is reported and permitted interface work continues where feasible.

## Install from a release

Use the [latest stable GitHub Release](https://github.com/geldmacher/design/releases/latest) for Cursor or Codex. Design requires **Node.js 22+**.

- **Manually:** follow the [release ZIP instructions](docs/installation.md#install-from-a-github-release) to verify and install the complete package.
- **Through your agent:** copy the [installation prompt](docs/installation.md#ask-your-agent-to-install) and check the listed prerequisites. This route uses the source checkout's installer on macOS or Linux.

Complete the guide's activation steps: reload Cursor, or refresh the Codex Marketplace installation and start a new task. Review changed hook permissions or trust requests when prompted.

## Update from a release

Follow [updates and recovery](docs/installation.md#update-an-existing-installation) for manual updates or an agent-assisted update prompt.

## Learn more

- [Usage guide](docs/usage.md) — recommended workflows, efficient requests, and examples for each operation.
- [Motion examples](docs/usage.md#animate-with-motion) — animation direction, implementation, and free documentation prerequisites.
- [Command reference](docs/commands.md) — all commands and when to use them.
- [Documentation](docs/README.md) — project setup, troubleshooting, and maintainer guides.

Design includes the [Impeccable](https://github.com/pbakaus/impeccable) design toolkit. See [upstream provenance](upstream/README.md), [LICENSE](LICENSE), and [third-party notices](THIRD_PARTY_NOTICES.md).
