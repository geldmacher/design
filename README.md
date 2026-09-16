<img src="assets/logo.svg" alt="Design" width="64" height="64">

# Design

**Build clearer, more consistent websites and web apps with Cursor or Codex.**

Design helps your AI assistant plan new pages, improve existing interfaces, and spot usability problems. It works with your product goals, components, and visual style so changes fit your project.

- **Build with direction:** turn an idea into a page or flow that fits your product.
- **Improve what you have:** refine layouts, mobile behavior, accessibility, and UI text.
- **Know what to fix first:** review a page or a branch's interface changes and get prioritized findings.

## Install from a release

Use the [latest stable GitHub Release](https://github.com/geldmacher/design/releases/latest) for Cursor or Codex. Design requires **Node.js 22+**.

### Manually

1. Download the ZIP for your editor, `SHA256SUMS`, and `provenance.json` from the release page.
2. Follow the [release ZIP instructions](docs/installation.md#install-from-a-github-release) to verify the files and install the complete package.
3. Reload Cursor or refresh the Codex Marketplace installation and start a new task. Review changed hook permissions when prompted.

### Ask your agent

Copy this prompt into Cursor or Codex on macOS or Linux:

```text
Install the latest stable GitHub Release of geldmacher/design for this editor.
Read https://github.com/geldmacher/design/blob/main/docs/installation.md and follow
its release installer instructions. Prepare a source checkout if needed and use
the install-new-release-from-repo skill. Report the installed version, verification
result, and any reload or new-task steps I need to complete.
```

The agent-assisted installer needs Git, Node.js 22+, npm, and [the matching editor prerequisites](docs/installation.md#1-check-the-prerequisites). The checkout provides the installer; the installed plugin is built from the selected release. Automatic UI checks stay off until you enable them in a project.

## Update from a release

**Manually:** download and verify the latest release ZIP, then [replace the installed version](docs/installation.md#update-an-existing-installation) and repeat the editor activation steps.

**Through your agent:** use this prompt:

```text
Update Design to the latest stable GitHub Release for this editor.
Use the install-new-release-from-repo skill from the geldmacher/design source
checkout. If it is not available, follow
https://github.com/geldmacher/design/blob/main/docs/installation.md to prepare it.
Report whether anything changed, the installed version, and any remaining activation steps.
```

With the source checkout open, invoke `/install-new-release-from-repo` in Cursor or `$install-new-release-from-repo` in Codex directly. The same skill handles installation and updates; it is not bundled with the installed plugin. See [updates and recovery](docs/installation.md#update-an-existing-installation).

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
