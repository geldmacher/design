<img src="assets/logo.svg" alt="Design" width="64" height="64">

# Design

**Ship interfaces that feel intentional.**

A design partner for Cursor and Codex. Plan, build, review, and refine websites and web apps around your product, your visual language, and your decisions.

[Install Design](#install-design) · [Try your first request](#your-first-request) · [Usage guide](docs/usage.md) · [Latest release](https://github.com/geldmacher/design/releases/latest)

## What would you like to improve?

| Your task | Start with a request like this |
| --- | --- |
| Find what needs attention | “Critique this dashboard and prioritize the three most useful improvements.” |
| Build a new interface | “Design a pricing page using our existing components and visual language.” |
| Refine an existing flow | “Polish this checkout flow without changing its information architecture.” |
| Review a code change | “Review the interface impact of this branch.” |
| Clarify stakeholder needs | “Prepare a questionnaire about checkout approval.” |

## Built around your project

**Keep the design coherent.** Design uses your existing `PRODUCT.md`, `DESIGN.md`, and `.impeccable/` context to guide work around the product and its visual language.

**Describe the task in your own words.** One entry point selects the relevant bundled capability, from design critique and polish to change reviews and stakeholder questionnaires.

**Choose when it acts.** Invoke Design when you need it. Project setup previews changes for approval, and optional UI checks stay off until you enable them.

Design combines the bundled [Impeccable](https://github.com/pbakaus/impeccable) toolkit with project integration, focused review and discovery workflows, and optional checks adapted to each host. See [upstream provenance](upstream/README.md) for the pinned version and maintained adaptations.

## Install Design

On macOS or Linux, install Git, Node.js 22+, and npm. You also need Cursor or the Codex CLI with plugin support. The release installer requires GitHub and npm registry access.

Clone this repository outside managed plugin directories, then open the checkout in Cursor or Codex:

```sh
git clone https://github.com/geldmacher/design.git ~/src/geldmacher-design
```

Run the command for your host in that checkout:

| Cursor | Codex |
| --- | --- |
| `/install-new-release-from-repo` | `$install-new-release-from-repo` |

This repository-local command installs the latest stable GitHub release. Add `preview` to inspect the planned installation without changing installed plugin state. The helper builds the released source in temporary storage and preserves your open checkout.

After installation, reload Cursor or start a new Codex task in your website or web-app project. Review changed hooks before granting trust; project checks remain off by default.

For exact host prerequisites, Git or Marketplace import, verified ZIP installation, Windows instructions, updates, and recovery, see the [installation guide](docs/installation.md). Maintainers can [deploy from a source checkout](docs/development.md#local-maintainer-deployment).

## Your first request

Open the project and identify the page or files you want Design to inspect. In Codex, start with:

```text
$design critique this dashboard and prioritize the three most useful improvements
```

In Cursor, use the same request with `/design`:

```text
/design critique this dashboard and prioritize the three most useful improvements
```

For a review of the current branch's interface changes, use `$design review quick branch` or `/design review quick branch`. This review is read-only and keeps its findings in the current task. Request a follow-up change when you are ready to apply an improvement.

To prepare project integration, invoke `$design setup` or `/design setup` and review the proposed changes. You can inspect existing setup with `design status` using your host's prefix.

See the [usage guide](docs/usage.md) for detector scans, questionnaires, diagnostics, and direct Impeccable access.

## Optional checks, under your control

When enabled, Cursor can stop a proposed UI write on a known detector issue. Codex reports findings after an edit or at Stop and requests correction. Infrastructure failures stay visible and allow edits to proceed. A detector result is one source of evidence, not a complete design or accessibility assessment.

A portable Agent Plugins v1 package also provides the `design` and `impeccable` skills. Invocation depends on the client; the portable package does not register hooks or native agents. See the [target guide](docs/agent-plugin-target.md).

## Documentation and development

- [Usage and commands](docs/usage.md)
- [Installation, updates, and rollback](docs/installation.md)
- [Development, package targets, and local deployment](docs/development.md)
- [Impeccable maintenance](docs/impeccable-maintenance.md)
- [Release validation](docs/release-validation.md)

Design is MIT licensed. See [LICENSE](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES.md).
