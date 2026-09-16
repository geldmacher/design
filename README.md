<img src="assets/logo.svg" alt="Design" width="64" height="64">

# Design

**Build clearer, more consistent websites and web apps with Cursor or Codex.**

Design helps your AI assistant plan new pages, improve existing interfaces, and spot usability problems. It works with your product goals, components, and visual style so changes fit your project.

- **Build with direction:** turn an idea into a page or flow that fits your product.
- **Improve what you have:** refine layouts, mobile behavior, accessibility, and UI text.
- **Know what to fix first:** review a page or a branch's interface changes and get prioritized findings.

## Install

On **macOS or Linux**, you need Git, **Node.js 22+**, npm, and either Cursor or the Codex CLI with plugin support. The installer needs access to GitHub and the npm registry. See [exact prerequisites and Windows options](docs/installation.md).

In a terminal, clone the repository and enter it:

```sh
git clone https://github.com/geldmacher/design.git ~/src/geldmacher-design
cd ~/src/geldmacher-design
```

Then run **one** command for your editor:

| Cursor | Codex |
| --- | --- |
| `npm run install:release -- --cursor-only` | `npm run install:release -- --codex-only` |

This installs the latest stable release. You do not need to run `npm install` first. Add `--dry-run` to preview the installation.

Reload Cursor or start a new Codex task, then open your website or web-app project. Review any changed hook permissions when prompted; automatic UI checks stay off until you enable them.

Prefer installing through the assistant, a Marketplace source, or a release ZIP? See [installation, updates, and recovery](docs/installation.md).

## Try it

Point the assistant to a page or component, then ask:

```text
$design critique the checkout page and prioritize the three most useful improvements
```

In Cursor, replace `$design` with `/design`. Follow up with the change you want:

```text
$design polish the checkout form: improve spacing and error messages, keeping our existing components
```

You can also omit the command and describe what you want to achieve in your own language, including setup, status, diagnosis, or questionnaire requests. Design chooses a suitable command and briefly explains its choice. Explicit commands take precedence.

Design can also be selected automatically for matching interface requests. It uses existing `PRODUCT.md`, `DESIGN.md`, and `.impeccable/` context. Project setup previews changes for your approval; optional checks remain your choice.

Before interface work, Design checks the relevant project's context and configuration. It reports missing context or proposed adjustments and continues permitted work. Deliberately disabled checks are valid; no setup or migration happens without your confirmation.

## Learn more

- [Usage guide](docs/usage.md) — examples for building, refining, reviewing, and gathering stakeholder input.
- [Command reference](docs/commands.md) — all commands and when to use them.
- [Documentation](docs/README.md) — project setup, troubleshooting, and maintainer guides.

Design includes the [Impeccable](https://github.com/pbakaus/impeccable) design toolkit. See [upstream provenance](upstream/README.md), [LICENSE](LICENSE), and [third-party notices](THIRD_PARTY_NOTICES.md).
