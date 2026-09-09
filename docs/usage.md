# Using Design

Start with a page, flow, or local path and describe what you want to improve. Use `/design` in Cursor or `$design` in Codex.


| Goal | Agent Plugins v1 skill identity | Cursor invocation | Codex invocation |
| --- | --- | --- | --- |
| Design or improve an interface | `design` | `/design <request>` | `$design <request>` |
| Scan explicit local paths | `design` | `/design detect -- <target> [target…]` | `$design detect -- <target> [target…]` |
| Review a Git change's interface impact | `design` | `/design review [quick\|full] [target]` | `$design review [quick\|full] [target]` |
| Prepare a stakeholder questionnaire | `design` | `/design questionnaire [topic]` | `$design questionnaire [topic]` |
| Check the project setup | `design` | `/design status` | `$design status` |
| Prepare project integration | `design` | `/design setup` | `$design setup` |
| Diagnose conflicts | `design` | `/design doctor` | `$design doctor` |
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

Design chooses the most specific bundled capability for the request and falls back to Impeccable for general design work.

`design detect` is a read-only scan of one or more explicitly named local files or directories. It always uses the bundled Impeccable detector, works independently of hook activation, and returns a structured result without installing, updating, or fixing anything. A no-findings result means only that the detector returned no findings; it is not a complete interface-quality verdict.

`design questionnaire` prepares a focused questionnaire for one recipient or homogeneous audience. It reuses facts already present in the request and canonical project context, asks only for missing decision-critical information, and previews the complete Markdown before any write. A file is created only after the preview is followed by an exact `.md` destination; an existing destination requires a separate overwrite confirmation. The operation sends nothing, imports no answers, and does not change Design context or configuration.

`design review` is a read-only, change-scoped interface review. It defaults to `quick`, resolves working, staged, branch, pull-request, ref, and exact Git-range targets without switching the active checkout, and keeps its findings in the current task. A separately approved `/design polish ...` or `$design polish ...` follow-up routes those findings to bundled Impeccable.

## Controlled by default

Design never activates itself. Setup shows its proposed changes and waits for confirmation. Optional UI checks stay silent until `.impeccable/config.json` contains `hook.enabled: true`.

Cursor can stop a proposed UI write when it finds a known issue. Codex checks after the edit and requests a correction without rolling the change back. The Agent Plugins target reports hooks as unavailable and uses bundled degraded role instructions instead of pretending native agents exist. Infrastructure failures remain visible but never block edits.

See [installation](installation.md) for activation and [the development guide](development.md) for package details and runtime verification.
