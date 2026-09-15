# Using Design

Start with a page, flow, or local path and describe what you want to improve. Cursor and Codex can select Design automatically for web UI tasks. Use `/design` in Cursor or `$design` in Codex to select it explicitly. Backend-only tasks and general code reviews do not call for Design; an explicit choice of another skill takes precedence.

See the [complete command reference](commands.md) for every bundled Impeccable design command, arguments, aliases, and live-mode prerequisites.


| Goal | Agent Plugins v1 skill identity | Cursor invocation | Codex invocation |
| --- | --- | --- | --- |
| Design or improve an interface | `design` | `/design <request>` | `$design <request>` |
| Scan explicit local paths | `design` | `/design detect -- <target> [target…]` | `$design detect -- <target> [target…]` |
| Review a Git change's interface impact | `design` | `/design review [quick\|full] [target]` | `$design review [quick\|full] [target]` |
| Prepare a stakeholder questionnaire | `design` | `/design questionnaire [topic]` | `$design questionnaire [topic]` |
| Check the project setup | `design` | `/design status` | `$design status` |
| Prepare project integration | `design` | `/design setup` | `$design setup` |
| Diagnose conflicts | `design` | `/design diagnose` | `$design diagnose` |
| Use Impeccable directly | `impeccable` | `/impeccable <request>` | `$impeccable <request>` |

The Agent Plugins column identifies the declared skill, not a universal user-facing command. A compatible client decides how users or models discover and load that skill.

For example:

```text
/design critique this dashboard and prioritize the highest-impact improvements
$design detect -- src/components app/dashboard
$design review quick branch
$design questionnaire checkout approval
$design polish this checkout flow without changing its information architecture
```

For an explicitly requested Design operation using its command syntax, Design selects a bundled capability from the leading command. Ordinary UI requests go unchanged to Impeccable, including “Review this checkout page”; they do not become a Git change review merely because they start with “review”. Impeccable is loaded through Design or an explicit Impeccable invocation.

`design diagnose` reads Design integration status and reports conflicts. It is read-only; its CLI accepts host selection and `--json` and returns exit 0 on success. `design doctor` forwards to Impeccable's project-context diagnosis, just like direct `impeccable doctor`. Use the appropriate host prefix for both. Lifecycle commands match only at the start of the request, so words such as "setup" inside a design task do not select integration work.

`design detect` is a read-only scan of one or more explicitly named local files or directories. It always uses the bundled Impeccable detector, works independently of hook activation, and returns a structured result without installing, updating, or fixing anything. A no-findings result means only that the detector returned no findings; it is not a complete interface-quality verdict.

`design questionnaire` prepares a focused questionnaire for one recipient or homogeneous audience. It reuses facts already present in the request and canonical project context, asks only for missing decision-critical information, and previews the complete Markdown before any write. A file is created only after the preview is followed by an exact `.md` destination; an existing destination requires a separate overwrite confirmation. The operation sends nothing, imports no answers, and does not change Design context or configuration.

`design review` is a read-only, change-scoped interface review. It defaults to `quick`, resolves working, staged, branch, pull-request, ref, and exact Git-range targets without switching the active checkout, and keeps its findings in the current task. A separately approved `/design polish ...` or `$design polish ...` follow-up routes those findings to bundled Impeccable.

## Controlled by default

Automatic skill selection covers only the requested interface work. It never authorizes project setup, hook activation, context migrations, installation, updates, deployment, or publication. Setup shows its proposed changes and waits for confirmation. Optional UI checks stay silent until the effective `hook.enabled` value is true. `.impeccable/config.local.json` overrides `.impeccable/config.json`. Explicit on/off updates the main setting and any existing local `hook.enabled` override while preserving other settings; it never creates a local config. Setup previews all affected files, then reports the reread effective state.

Cursor can stop a proposed UI write when it finds a known issue. Codex checks after the edit and requests a correction without rolling the change back. The Agent Plugins target reports hooks as unavailable and uses bundled degraded role instructions instead of pretending native agents exist. Infrastructure failures remain visible but never block edits.

See [installation](installation.md) for activation and [the development guide](development.md) for package details and runtime verification.
