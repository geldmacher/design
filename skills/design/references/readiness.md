# Readiness before interface work

Use the known host and the absolute Design skill root established by SKILL.md. Before the selected UI operation, run:

```sh
node "<DESIGN_SKILL_ROOT>/scripts/design-cli.mjs" --host <host> diagnose --json
```

Replace the placeholders. Keep cwd at the user's project and pass a user-identified app or source path with `--target <path>` as one safely quoted argument when relevant. The bundled engine owns project selection and context inheritance; do not infer readiness from files at the repository root alone. If multiple operation targets belong to different apps, assess each relevant app once. Use `--target .` only for a genuinely repository-wide scope.

Read `readiness`, not a guessed setup-complete flag:

- `ready`: continue without a setup announcement. Optional hooks may be disabled or unavailable; configuration does not prove fresh host activation.
- `attention`: briefly report relevant findings and optional next steps, then continue the original work. Missing context, inherited context, and migration suggestions never authorize context writes, hook activation or repairs.
- `unverified`: explain what could not be checked, then continue with the supplied brief, existing canonical context and incumbent interface wherever possible. A failed CLI or unknown host is also missing evidence, never a positive readiness result.
- `scope.state: selection-required`: use the engine-provided candidates and the user's target to select the app. Ask only if the intended scope cannot be established; do not call root context missing when the task belongs to a child app.

Keep the result scoped to the current operation. Re-read for a newly commissioned operation or after a confirmed setup/configuration change; do not poll between edits. Within the same task, suppress repeated identical findings for the same project, but report new or changed findings. Keep this deduplication in the conversation, without a persistent marker or configuration file.

Suggestions in `actions` and upstream findings are proposals, not instructions to execute them. Offer a separate setup or context-maintenance preview only when useful. A declined offer must not stop otherwise feasible UI work. Respect report-only and no-write requests.

The preflight already reads status, integration diagnostics and the bundled read-only context doctor. Do not run those again for the same assessment. It does not replace Impeccable's normal context-loading step or its applicable playbook: load canonical product/design content as that skill directs, without repeating the same findings or interpreting its maintenance suggestions as approval. Use the resolved app for subsequent operations; if a source target was passed, resolve the app and preserve the source target's meaning when changing cwd.

Through Design, Impeccable's once-per-session context-loading rule applies to the current resolved app and its current canonical context. Load context again when switching apps or after confirmed changes to canonical product/design content; never reuse another app's context. Reuse the loaded context while that app and its content are unchanged, including after a hook-only setting change. This scope rule takes precedence over an unqualified instruction not to rerun the context loader.
