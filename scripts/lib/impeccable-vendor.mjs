import { verifyCandidateRuntime } from "./impeccable-candidate-runtime.mjs";
import { prepareEngine } from "./impeccable-engine-import.mjs";
import { enginePlatforms, engineRelativePath, resolveEngine } from "../../src/impeccable-engine.mjs";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { renderCapabilityIndex } from "../build-capability-index.mjs";
import { canonicalJson, compareVersions, parseSkillTag, pluginRoot, readPin, sha256Bytes, sha256File, validatePin } from "./impeccable-maintenance.mjs";

export const transformations = Object.freeze([
  "native-engine-launcher",
  "plugin-project-maintenance",
  "agent-skills-frontmatter",
  "portable-dual-host-script-paths",
  "dual-host-provider-routing",
  "codex-generic-subagent-contract",
  "agent-plugin-provider-routing",
  "replace-project-hook-installation-with-plugin-hook",
  "disable-runtime-self-update",
  "redirect-standalone-installer",
  "recognize-plugin-hook",
  "inline-design-document-format",
  "evidence-based-usability-guidance",
]);

export const agentNames = Object.freeze([
  "impeccable-asset-producer.md",
  "impeccable-documenter.md",
  "impeccable-finish-reviewer.md",
  "impeccable-manual-edit-applier.md",
]);

export const releaseArchiveExclusions = Object.freeze({
  ".cursor/skills/impeccable/scripts/.impeccable/hook.cache.json": sha256Bytes('{"version":1,"sessions":{}}'),
});

function inside(base, candidate) {
  const item = relative(resolve(base), resolve(candidate));
  return item === "" || (item !== ".." && !item.startsWith(`..${sep}`) && !item.startsWith(sep));
}

function lstatExists(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export function walkRegularFiles(root) {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = join(root, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symlinks are not allowed in Impeccable input: ${absolute}`);
    if (entry.isDirectory()) files.push(...walkRegularFiles(absolute));
    else if (entry.isFile()) files.push(absolute);
    else throw new Error(`Non-regular Impeccable input is not allowed: ${absolute}`);
  }
  return files;
}

export function hashPath(path) {
  const stat = lstatExists(path);
  if (!stat) return null;
  if (stat.isSymbolicLink()) throw new Error(`Refusing to hash symlink: ${path}`);
  if (stat.isFile()) return sha256File(path);
  if (!stat.isDirectory()) throw new Error(`Refusing to hash non-regular path: ${path}`);
  const digest = [];
  for (const file of walkRegularFiles(path)) {
    digest.push(`${relative(path, file).split(sep).join("/")}\0${sha256File(file)}`);
  }
  return sha256Bytes(`${digest.join("\n")}\n`);
}

function git(source, args) {
  return String(commandOutput(execFileSync, "git", ["-C", source, ...args])).trim();
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label} mismatch: expected ${expected}, received ${actual}`);
}

function mustReplace(text, search, replacement, label) {
  if (!text.includes(search)) throw new Error(`Upstream structure drift: missing patch anchor ${label}`);
  return text.replace(search, replacement);
}

function replaceSection(text, start, end, replacement, label) {
  const startIndex = text.indexOf(start);
  const endIndex = text.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) throw new Error(`Upstream structure drift: missing section ${label}`);
  return `${text.slice(0, startIndex)}${replacement}${text.slice(endIndex)}`;
}

function portableMarkdown(text) {
  return text
    .replace(/node \.cursor\/skills\/impeccable\/([A-Za-z0-9_./-]+\.(?:mjs|js|json))/g, 'node "<IMPECCABLE_SKILL_ROOT>/$1"')
    .replace(/\.cursor\/skills\/impeccable/g, "<IMPECCABLE_SKILL_ROOT>");
}

export function transformSkillFile(relativePath, original, version) {
  let text = original;
  const operations = [];
  if (["scripts/impeccable", "scripts/impeccable.cmd"].includes(relativePath)) {
    return { text: readFileSync(join(pluginRoot, "overlays/skills/impeccable", relativePath), "utf8"), operations: ["native-engine-launcher"] };
  }
  if (relativePath === "reference/document.md") {
    text = mustReplace(
      text,
      "DESIGN.md follows the [official DESIGN.md format spec](https://raw.githubusercontent.com/google-labs-code/design.md/main/docs/spec.md):",
      "Use the DESIGN.md format defined below:",
      "self-contained DESIGN.md format",
    );
    const replacements = [
      ["Use the canonical headings below so the file remains portable across DESIGN.md-aware tools.", "Use the canonical headings below so the bundled readers can identify each section. This is the plugin's supported authoring format; other tools may accept a different subset."],
      ["The YAML frontmatter is the machine-readable layer. It's what Stitch's linter validates and what the live panel renders tiles from. Keep it tight; every entry should correspond to a token the project actually uses.", "The YAML frontmatter is the machine-readable layer consumed by the bundled parser, design-system panel, and detector. Keep it tight; every entry should correspond to a token the project actually uses."],
      ['  primary: "#b8422e"', '  primary: "#b8422e"\n  primary-deep: "#8b3020"'],
      ["  body:\n    # ...", '  body:\n    fontFamily: "Georgia, serif"\n    fontSize: "1rem"\n    fontWeight: 400\n    lineHeight: 1.5'],
      ["Rules that matter:", [
        "### Supported values and reader limits",
        "",
        "Frontmatter is optional. When present, open and close it with `---` on its own line, before the document body. Use two-space indentation, scalar values, and nested mappings. Quote CSS strings, token references, and strings containing punctuation. The bundled readers are limited YAML readers: do not author arrays, anchors, aliases, tags, multiline scalars, or duplicate keys. They are not validators for arbitrary YAML and may ignore unsupported content. Keep one canonical section of each kind; merge existing repeated sections only with the user's approval.",
        "",
        "| Field | Authoring contract |",
        "|---|---|",
        "| `name`, `description` | Project title and optional short description, as strings. A seed may contain only these fields. |",
        "| `colors` | Named primitive CSS color strings; keep the project's authoritative color space. |",
        "| `typography` | Named role mappings. `fontFamily`, `fontSize`, `letterSpacing`, `fontFeature`, and `fontVariation` are strings; `fontWeight` is numeric; `lineHeight` is a number or CSS string. Include only established properties. |",
        "| `rounded`, `spacing` | Named CSS length strings; spacing may also contain unitless numeric counts or ratios. |",
        "| `components` | Named variant mappings with the properties listed below. Values are CSS strings or references to existing primitive tokens; `typography` may reference a complete typography role. |",
        "",
        "Preserve valid project CSS expressions such as `clamp(2.5rem, 7vw, 4.5rem)`, `normal`, and multi-value padding. The parser retains these values; each consumer uses only the fields it supports. The detector understands colors, fonts, radii, and font-size evidence, not the complete document. A fully fluid type scale does not establish a discrete font-size allowlist. The panel shows colors, typography, radii, and sidecar component snippets; it is not a complete CSS or token-reference renderer. Neither consumer certifies external format compatibility.",
        "",
        "Every `{path.to.token}` must resolve to an existing field in the same frontmatter. Author primitive values directly, without aliases or reference cycles. Preserve unknown existing sections and fields when refreshing a document, but do not claim the bundled readers interpret them. Do not invent values merely to populate the schema.",
        "",
        "Rules that matter:",
      ].join("\n")],
      ["Components may reference primitives; primitives may not reference each other.", "Components may reference primitives or a complete typography role; primitives contain literal values."],
      ["Don't rename to Material defaults.", "Do not rename established tokens to generic role defaults."],
      ["Group into Primary / Secondary / Tertiary / Neutral (the Material-derived roles Stitch uses).", "Describe the actual semantic roles, such as primary, secondary, tertiary, or neutral."],
      ["Map observed sizes and weights to the Material hierarchy (display / headline / title / body / label).", "Describe observed sizes and weights by their actual roles, such as display, headline, title, body, or label, preserving established names."],
      ["This is the machine-readable layer: what the live panel and Stitch's linter consume.", "This is the machine-readable layer used by the bundled consumers described above."],
      ["If a variant needs a property Stitch's 8-prop set doesn't cover", "If a variant needs a property outside the eight component properties listed above"],
      ["carries **what Stitch's schema can't hold**", "carries **extensions outside the frontmatter token groups**"],
      ["Components still carry full HTML/CSS because Stitch's 8-prop set can't hold them.", "Components still carry self-contained HTML/CSS for the panel; frontmatter references alone do not render snippets."],
      ['"primary":        { "role": "primary",  "displayName": "Editorial Magenta", "canonical": "oklch(60% 0.25 350)", "tonalRamp": ["...", "...", "..."] },', '"primary": { "role": "primary", "displayName": "Primary accent" },'],
      ['"cool-paper": { "role": "neutral",  "displayName": "Cool Paper",    "canonical": "oklch(96% 0.005 230)", "tonalRamp": ["...", "...", "..."] }', '"neutral-bg": { "role": "neutral", "displayName": "Neutral background" }'],
      [".ds-btn-primary { background: #191c1d; color: #fff; padding: 16px 48px; letter-spacing: 0.05em; text-transform: uppercase; font-weight: 500; border: none; border-radius: 0; transition: background 0.2s, transform 0.2s; } .ds-btn-primary:hover { background: oklch(60% 0.25 350); transform: translateY(-2px); }", ".ds-btn-primary { background: #b8422e; color: #faf7f2; padding: 16px 48px; font-family: Georgia, serif; border: none; border-radius: 4px; } .ds-btn-primary:hover { background: #8b3020; } .ds-btn-primary:focus-visible { outline: 2px solid #b8422e; outline-offset: 3px; }"],
      ["- **Match the spec.** Use its eight canonical sections in order", "- **Follow the bundled format.** Use the eight canonical sections in order"],
      ["Stitch's own outputs use them heavily (\"The No-Line Rule\", \"The Ghost Border Fallback\"). Aim for 1-3 per section.", "Include a named rule only when it captures an established, reusable constraint; do not invent rules to fill a quota."],
      ["Primary / Secondary / Tertiary / Neutral is the spec ordering.", "Use the role names that fit the product; do not invent missing roles or impose a foreign palette."],
      ["Don't invent frontmatter token groups outside Stitch's schema (no `motion:`, `breakpoints:`, `shadows:` at the top level). Stitch's Zod schema only accepts `colors`, `typography`, `rounded`, `spacing`, `components`. Anything else belongs in the sidecar's `extensions`.", "Keep authored primitive token groups to `colors`, `typography`, `rounded`, `spacing`, and `components`. Motion, breakpoints, and shadows belong in the documented sidecar `extensions`, not new top-level token groups. Preserve unfamiliar existing content without promising that the plugin consumes it."],
    ];
    for (const [before, after] of replacements) text = mustReplace(text, before, after, `document guidance: ${before}`);
    operations.push("inline-design-document-format");
  }
  if (relativePath === "reference/critique.md") {
    const replacements = [
      ["**Nielsen heuristics**", "**Usability criteria**"],
      ["report checklist failures and decision points with >4 visible options.", "report evidence of avoidable remembering, unclear grouping, or difficult comparison in the user's task."],
      ["Presenting 10+ choices at once with no hierarchy.", "Presenting poorly distinguished choices with no hierarchy or meaningful grouping, making the relevant action hard to find."],
      ["Present the Nielsen's 10 heuristics scores as a table:", "Present the ten usability criteria scores as a table:"],
      ["Score each of Nielsen's 10 Usability Heuristics on a 0–4 scale.", "Score each of the ten usability criteria below on a 0–4 scale."],
      ["#### Nielsen's 10 Heuristics", "#### Ten Usability Criteria"],
      ["The sections below were previously separate reference files (`cognitive-load.md`, `heuristics-scoring.md`, `personas.md`). They live inline now so the critique flow has all its deep context in one place.", "Use the criteria below to assess cognitive effort, usability, and representative user situations. Each finding needs evidence from the reviewed task or interface."],
      ["Is information presented in digestible groups (≤4 items per group)?", "Are related items grouped meaningfully for this task and audience?"],
      ["Are decisions simplified (≤4 visible options at any decision point)?", "Are options distinguishable and easy to compare without hiding useful choices?"],
      ["**Scoring**: Count the failed items. 0–1 failures = low cognitive load (good). 2–3 = moderate (address soon). 4+ = high cognitive load (critical fix needed).", "**Assessment**: For each relevant item, record the task, observed burden, and available evidence. Determine severity from the consequence and recoverability of that burden, not the number of checklist failures. These checks guide judgment; they do not measure mental capacity."],
    ];
    for (const [before, after] of replacements) text = mustReplace(text, before, after, `critique guidance: ${before}`);
    text = replaceSection(text, "#### The Working Memory Rule", "#### Common Cognitive Load Violations", [
      "#### Remembering and comparing",
      "",
      "Distinguish information a person must remember from choices that remain visible and recognizable. Judge the task's complexity, familiarity, interruptions, comparison needs, and the user's experience. There is no universal maximum number of visible menu items, sibling links, or actions.",
      "",
      "Keep needed context visible or easy to retrieve. Group by meaning, label choices distinctly, preserve useful comparison views, and disclose advanced detail when it helps the current task. Do not bury frequent actions or force extra navigation just to reduce a count.",
      "",
      "Two calibration cases:",
      "- An index with twelve clearly labeled, grouped links is not a finding merely because twelve links are visible. Inspect whether users can find the needed destination.",
      "- A flow with only two choices can still impose substantial burden if users must remember amounts, restrictions, or earlier answers from another screen. Identify that missing context and its consequence.",
      "",
      "Treat likely confusion as a hypothesis until the interface, task evidence, or observed behavior supports it. Do not predict abandonment or mistakes from option count alone.",
      "",
      "---",
      "",
      "",
    ].join("\n"), "task-based memory assessment");
    operations.push("evidence-based-usability-guidance");
  }
  if (compareVersions(version, "4.2.2") >= 0 && ["reference/hooks.md", "reference/doctor.md"].includes(relativePath)) {
    const replacements = relativePath === "reference/hooks.md" ? [
  [
    "This command toggles the hook **per project** by editing `.impeccable/config.json` (the unified Impeccable config; hook runtime settings live under its `hook` key, and shared detector ignores live under `detector`). Per-developer overrides, including the install consent decision (`hook.consent`) the CLI records, live in the gitignored `.impeccable/config.local.json`. Set `hook.enabled: false` to turn the hook off, `hook.quiet: true` to silence the clean/pending acks, or `hook.auditLog` to a file path for an NDJSON log. The legacy `IMPECCABLE_HOOK_DISABLED`, `IMPECCABLE_HOOK_QUIET`, and `IMPECCABLE_HOOK_LOG` env vars are still honored and override these config values when set.",
    "This command toggles plugin hooks per project through `.impeccable/config.json`. `.impeccable/config.local.json` overrides shared values. Hook administration never writes host manifests or records standalone installation consent. `hook.enabled` must be explicitly true; malformed configuration produces a visible diagnostic and skips enforcement."
  ],
  [
    "Supported harnesses: Claude Code (`.claude/settings.local.json` in the project, which is gitignored so the hook stays machine-local; a hook you move into the shared `settings.json` is honored in place too), Codex (`.codex/hooks.json` in the project), Cursor (`.cursor/hooks.json` in the project), Grok Build (`.grok/hooks/impeccable.json` in the project; requires `/hooks-trust` or `--trust`), and GitHub Copilot (`.github/hooks/impeccable.json` in the project, a team-shared committed file that both the Copilot CLI and the cloud agent read). For the Copilot CLI, repo-level hooks fire once `.github/hooks/impeccable.json` is committed to the repository's default branch.",
    "Geldmacher Design provides Cursor pre-write and Codex post-write/Stop adapters registered by the plugin. Project-local Impeccable installations and hook manifests are conflicts to diagnose. Agent Plugins v1 has no native hook integration."
  ],
  [
    "| `on` | Set `enabled: true` in `.impeccable/config.json`, record local hook consent as accepted, and install/repair provider hook manifests when the skill is installed. |",
    "| `on` | Enable the already registered plugin adapter in canonical configuration; leave host manifests unchanged. |"
  ],
  [
    "| `reset` | Delete the project config, dedup cache, and Cursor pending queue, and remove the hook's entries from every provider manifest `on` installs, the committed Copilot file included (a team-shared `settings.json` that `on` never writes is never touched). |",
    "| `reset` | Remove hook settings, detector ignores, dedup cache and pending queue within `.impeccable/`; preserve other settings and every host manifest. |"
  ],
  [
    "- If `.impeccable/config.json` or `.impeccable/config.local.json` is unreadable or malformed, the hook ignores that file and uses the remaining valid config/defaults. `impeccable hooks status` will show malformed files as ignored.",
    "- Malformed shared or local configuration produces a visible diagnostic and skips enforcement. Repair requires a deliberate edit; valid defaults never hide the failure."
  ],
  [
    "- If the user asks to \"disable the hook\" globally, lead with `/impeccable hooks off` (persistent for this project; writes `hook.enabled: false` to config). The legacy `IMPECCABLE_HOOK_DISABLED=1` env var also works as a one-shot override that follows the shell.",
    "- Use `/impeccable hooks off` to disable plugin hooks for this project. The plugin uses canonical configuration and does not honor the standalone IMPECCABLE_HOOK_DISABLED override."
  ]
] : [
  [
    "Report and repair drift between this project's Impeccable artifacts and what the installed version reads: PRODUCT.md, DESIGN.md and its `.impeccable/design.json` sidecar, `.impeccable/config.json`, persisted surface briefs, and the design hook.",
    "Report drift in this project's canonical Impeccable context and propose bounded repairs. The plugin doctor is read-only; project migrations require explicit user authorization before edits."
  ],
  [
    "- **Tool version.** The installed skill is older than the published one. `impeccable context` reports that at boot as `UPDATE_AVAILABLE` and `npx impeccable update` fixes it. Not this command's job.",
    "- **Tool version.** The plugin bundles a pinned skill and engine. Runtime update checks and self-update are disabled. Updating the bundle is a separate Design maintainer task."
  ],
  [
    "- **Schema drift.** An artifact was written by an older Impeccable: fields nothing reads, fields now expected, files in retired locations. Mechanical, and this command repairs most of it.",
    "- **Schema drift.** Report fields and files from older versions, then describe proposed changes. Do not migrate project context automatically."
  ],
  [
    "- **`auto`** carries no decision. Run `.cursor/skills/impeccable/scripts/impeccable doctor --fix` once to apply these, then report what it moved in one line. Do not ask permission first, and do not ask about them afterward.",
    "- **`auto`** labels a proposed mechanical migration, not authorization. Explain the affected files and exact change, then obtain explicit user authorization before editing. Plugin doctor does not accept `--fix`."
  ],
  [
    "`impeccable context` reports the cheap subset of these findings at session start, throttled to once a week per project. Set `\"stalenessCheck\": false` in `.impeccable/config.json` to silence that, or `IMPECCABLE_NO_STALENESS_CHECK=1` for one session. This command still works with the check disabled, and that is the combination to suggest for a user who wants the report only when they ask for it.",
    "`impeccable context` reports the cheap subset at session start. Its notice cache is isolated per invocation and removed afterward; report findings once per task. Set `\"stalenessCheck\": false` in `.impeccable/config.json` or `IMPECCABLE_NO_STALENESS_CHECK=1` to disable that check. Explicit doctor remains available."
  ]
];
    for (const [before, after] of replacements) text = mustReplace(text, before, after, `plugin maintenance contract: ${before}`);
    text = text.replaceAll("npx impeccable detect", ".cursor/skills/impeccable/scripts/impeccable detect").replaceAll("npx impeccable ignores", ".cursor/skills/impeccable/scripts/impeccable ignores");
    operations.push("plugin-project-maintenance");
  }
  if (relativePath.endsWith(".md")) {
    if (relativePath === "SKILL.md") {
      text = mustReplace(
        text,
        `version: ${version}\nlicense: Apache 2.0`,
        `license: Apache-2.0\ncompatibility: Requires Node.js 22 or newer.\nmetadata:\n  version: "${version}"`,
        "Agent Skills frontmatter",
      );
      operations.push("agent-skills-frontmatter");
      text = mustReplace(text,
        "The launcher runs a self-contained binary that ships next to it or is downloaded once on first run; no Node or other runtime is required.",
        "The plugin launcher requires Node.js 22 or newer and runs only the verified platform engine bundled in this plugin. Missing binaries are diagnosed; runtime downloads and external binary overrides are disabled.",
        "native engine launcher contract");
      text = mustReplace(
        text,
        "This skill gives you the tools and permission to create design",
        [
          "## Geldmacher Design host contract",
          "",
          "This bundled skill targets Cursor, Codex, and Agent Plugins v1 clients. Cursor invokes it as `/impeccable`; Codex invokes it as `$impeccable`; a generic standard client loads the bare `impeccable` skill name. Before running any command, replace `<IMPECCABLE_SKILL_ROOT>` with the absolute directory containing this `SKILL.md`; never execute an unresolved placeholder. Runtime scripts derive the host from `IMPECCABLE_HOST`, then the native plugin-root variables, or the canonical Agent Plugins root manifest.",
          "",
          "Cursor resolves the four bundled files under `../../agents/` as native agents. On Codex, read the matching canonical role prompt and spawn a fresh generic subagent with no forked conversation history and no model override: [asset producer](../../agents/impeccable-asset-producer.md), [documenter](../../agents/impeccable-documenter.md), [finish reviewer](../../agents/impeccable-finish-reviewer.md), or [manual edit applier](../../agents/impeccable-manual-edit-applier.md). Pass only the role input contract and task evidence. Agent Plugins v1 does not standardize native agents; use the corresponding `reference/degraded/` fallback there. If any other host exposes no subagent capability, use the same fallback and disclose the degradation.",
          "",
          "This skill gives you the tools and permission to create design",
        ].join("\n"),
        "SKILL dual-host contract",
      );
      operations.push("dual-host-provider-routing", "codex-generic-subagent-contract", "agent-plugin-provider-routing");
      text = replaceSection(
        text,
        "**Pin / Unpin:**",
        "**Hooks:**",
        "**Pin / Unpin:** Standalone shortcut installation is disabled in Geldmacher Design. Use the host-native Design or Impeccable skill invocation; update the vendored skill only through the plugin maintainer sync.\n\n",
        "SKILL Pin / Unpin",
      );
      operations.push("redirect-standalone-installer");
    }
    if (relativePath === "reference/hooks.md") {
      text = mustReplace(
        text,
        "# /impeccable hooks\n",
        "# /impeccable hooks\n\n> Geldmacher Design integration: Cursor and Codex use plugin-registered host adapters. This command changes only `.impeccable/` config and never installs or edits a project-local hook manifest.\n",
        "hooks integration banner",
      );
      text = text.replace(
        "record local hook consent as accepted, and install/repair provider hook manifests when the skill is installed.",
        "record local hook consent as accepted, and use the already registered Geldmacher Design host adapter without writing provider hook manifests.",
      );
      text = text.replace(
        /- The hook is bundled with the Impeccable skill and installed through project-local manifests:[^\n]*\n/,
        "- In Geldmacher Design, the detector is bundled with the Impeccable skill and invoked through the active host adapter. Project-local hook manifests are diagnostics-only conflicts and are never installed, repaired, or removed.\n",
      );
      operations.push("replace-project-hook-installation-with-plugin-hook");
    }
    const updateRedirected = text.replaceAll("npx impeccable update", "the Design doctor command");
    if (updateRedirected !== text) operations.push("disable-runtime-self-update");
    text = updateRedirected;
    const portable = portableMarkdown(text);
    if (portable !== text) operations.push("portable-dual-host-script-paths");
    text = portable;
  }

  return { text, operations };
}

export function transformAgentFile(original) {
  const text = portableMarkdown(original);
  return { text, operations: text === original ? [] : ["portable-dual-host-script-paths"] };
}

function normalizePatch(raw) {
  return raw
    .replaceAll("a/original-agents/", "a/agents/")
    .replaceAll("b/transformed-agents/", "b/agents/")
    .replaceAll("a/original-agents", "a/agents")
    .replaceAll("b/transformed-agents", "b/agents")
    .replaceAll("a/original/", "a/skills/impeccable/")
    .replaceAll("b/transformed/", "b/skills/impeccable/")
    .replaceAll("a/original", "a/skills/impeccable")
    .replaceAll("b/transformed", "b/skills/impeccable");
}

function diffDirectories(workspace) {
  const outputs = [
    spawnSync("git", ["diff", "--no-index", "--", "original", "transformed"], { cwd: workspace, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }),
    spawnSync("git", ["diff", "--no-index", "--", "original-agents", "transformed-agents"], { cwd: workspace, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }),
  ];
  for (const output of outputs) {
    if (![0, 1].includes(output.status) || output.error) throw output.error || new Error(output.stderr || "Unable to generate transformation patch.");
  }
  return normalizePatch(outputs.map((output) => output.stdout || "").join(""));
}

export function buildVendorProjection({ source, gitSource = source, requireHead = true, pin: pinInput, workspace }) {
  const pin = validatePin(pinInput);
  const sourceRoot = resolve(source);
  const gitRoot = resolve(gitSource);
  assertEqual(git(gitRoot, ["rev-parse", pin.tag]), pin.tagObject, "tag object");
  assertEqual(git(gitRoot, ["rev-parse", `${pin.tag}^{commit}`]), pin.commit, "commit");
  if (requireHead) assertEqual(git(gitRoot, ["rev-parse", "HEAD"]), pin.commit, "checked-out commit");
  assertEqual(git(gitRoot, ["cat-file", "-t", pin.tag]), "tag", "annotated tag type");

  const sourceSkill = join(sourceRoot, ".cursor", "skills", "impeccable");
  const sourceAgents = join(sourceRoot, ".cursor", "agents");
  if (!existsSync(sourceSkill) || !existsSync(sourceAgents)) throw new Error("Pinned Cursor build is missing the expected skill or agents directory.");
  for (const name of agentNames) if (!existsSync(join(sourceAgents, name))) throw new Error(`Pinned Cursor build is missing agent ${name}.`);

  const originalDir = join(workspace, "original");
  const transformedDir = join(workspace, "transformed");
  const originalAgentsDir = join(workspace, "original-agents");
  const transformedAgentsDir = join(workspace, "transformed-agents");
  cpSync(sourceSkill, originalDir, { recursive: true });
  cpSync(sourceSkill, transformedDir, { recursive: true });
  mkdirSync(originalAgentsDir, { recursive: true });
  mkdirSync(transformedAgentsDir, { recursive: true });
  for (const name of agentNames) {
    cpSync(join(sourceAgents, name), join(originalAgentsDir, name));
    cpSync(join(sourceAgents, name), join(transformedAgentsDir, name));
  }

  const changed = [];
  for (const file of walkRegularFiles(transformedDir)) {
    const relativePath = relative(transformedDir, file).split(sep).join("/");
    const originalPath = join(originalDir, relativePath);
    const before = readFileSync(originalPath, "utf8");
    const result = transformSkillFile(relativePath, before, pin.version);
    if (result.text !== before) {
      writeFileSync(file, result.text);
      changed.push({ path: `skills/impeccable/${relativePath}`, sourceSha256: sha256File(originalPath), vendoredSha256: sha256File(file), transformations: result.operations });
    }
  }
  for (const file of walkRegularFiles(transformedAgentsDir)) {
    const relativePath = relative(transformedAgentsDir, file).split(sep).join("/");
    const originalPath = join(originalAgentsDir, relativePath);
    const before = readFileSync(originalPath, "utf8");
    const result = transformAgentFile(before);
    if (result.text !== before) {
      writeFileSync(file, result.text);
      changed.push({ path: `agents/${relativePath}`, sourceSha256: sha256File(originalPath), vendoredSha256: sha256File(file), transformations: result.operations });
    }
  }

  const patchText = diffDirectories(workspace);
  const inventory = [];
  for (const file of walkRegularFiles(originalDir)) {
    const relativePath = relative(originalDir, file).split(sep).join("/");
    const target = join(transformedDir, relativePath);
    const transformation = changed.find((item) => item.path === `skills/impeccable/${relativePath}`);
    inventory.push({ source: `.cursor/skills/impeccable/${relativePath}`, destination: `skills/impeccable/${relativePath}`, sourceSha256: sha256File(file), vendoredSha256: sha256File(target), transformations: transformation?.transformations || [] });
  }
  for (const file of walkRegularFiles(originalAgentsDir)) {
    const relativePath = relative(originalAgentsDir, file).split(sep).join("/");
    const target = join(transformedAgentsDir, relativePath);
    const transformation = changed.find((item) => item.path === `agents/${relativePath}`);
    inventory.push({ source: `.cursor/agents/${relativePath}`, destination: `agents/${relativePath}`, sourceSha256: sha256File(file), vendoredSha256: sha256File(target), transformations: transformation?.transformations || [] });
  }
  const lock = {
    schemaVersion: 1,
    upstream: {
      name: pin.name,
      repository: pin.repository,
      tag: pin.tag,
      tagObject: pin.tagObject,
      commit: pin.commit,
      archive: { url: pin.archive.url, sha256: pin.archive.sha256 },
      license: { source: "LICENSE", destination: "upstream/LICENSE", sha256: sha256File(join(sourceRoot, "LICENSE")) },
    },
    import: {
      sourceDirectory: ".cursor/skills/impeccable",
      agentsDirectory: ".cursor/agents",
      transformations: [...transformations],
      patch: "upstream/patches/impeccable-plugin.patch",
      patchSha256: sha256Bytes(patchText),
      files: inventory.sort((a, b) => a.destination.localeCompare(b.destination)),
    },
  };
  return { originalDir, originalAgentsDir, transformedDir, transformedAgentsDir, patchText, lock, inventory: lock.import.files, changed, licensePath: join(sourceRoot, "LICENSE") };
}

function commandOutput(exec, file, args, options = {}) {
  try {
    const encoding = Object.hasOwn(options, "encoding") ? options.encoding : "utf8";
    return exec(file, args, { encoding, maxBuffer: options.maxBuffer ?? 32 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    if (error.code === "ENOENT") throw new Error(`${file} is required but was not found.`);
    throw new Error(`${file} ${args.join(" ")} failed: ${String(error.stderr || error.message).trim()}`);
  }
}

export function validateArchiveEntryName(name) {
  if (!name || name.includes("\\") || name.startsWith("/") || /^[A-Za-z]:/.test(name)) throw new Error(`Unsafe archive entry: ${name}`);
  const parts = name.split("/").filter(Boolean);
  if (parts.some((part) => part === "." || part === "..")) throw new Error(`Unsafe archive entry: ${name}`);
  return parts.join("/") + (name.endsWith("/") ? "/" : "");
}

export function verifyArchiveMatchesSource({ archive, source, exec = execFileSync }) {
  const listing = String(commandOutput(exec, "unzip", ["-Z1", archive]));
  const entries = listing.split(/\r?\n/).filter(Boolean).map(validateArchiveEntryName);
  if (new Set(entries).size !== entries.length) throw new Error("Archive contains duplicate normalized entries.");
  const modes = String(commandOutput(exec, "unzip", ["-Z", "-l", archive]));
  const relevantModes = new Map();
  for (const line of modes.split(/\r?\n/)) {
    const match = line.match(/^([dl-])[rwx-]{9}\s+.*?\s+(\.cursor\/(?:skills\/impeccable\/|agents\/)[^\s]+)$/);
    if (match) relevantModes.set(validateArchiveEntryName(match[2]), match[1]);
  }
  const sourceSkill = join(source, ".cursor", "skills", "impeccable");
  const expected = walkRegularFiles(sourceSkill).map((file) => `.cursor/skills/impeccable/${relative(sourceSkill, file).split(sep).join("/")}`);
  expected.push(...agentNames.map((name) => `.cursor/agents/${name}`));
  const archiveScope = entries.filter((entry) => !entry.endsWith("/") && (entry.startsWith(".cursor/skills/impeccable/") || agentNames.some((name) => entry === `.cursor/agents/${name}`)));
  const excluded = archiveScope.filter((entry) => Object.hasOwn(releaseArchiveExclusions, entry));
  const importableScope = archiveScope.filter((entry) => !Object.hasOwn(releaseArchiveExclusions, entry));
  if (JSON.stringify([...importableScope].sort()) !== JSON.stringify([...expected].sort())) throw new Error("Release archive vendored scope differs from the exact tag checkout.");
  for (const entry of excluded) {
    if (relevantModes.get(entry) !== "-") throw new Error(`Release archive exclusion is not a regular file: ${entry}`);
    const bytes = commandOutput(exec, "unzip", ["-p", archive, entry], { encoding: null, maxBuffer: 1024 * 1024 });
    if (sha256Bytes(bytes) !== releaseArchiveExclusions[entry]) throw new Error(`Release archive exclusion is not the known empty generated state: ${entry}`);
  }
  for (const entry of expected) {
    if (relevantModes.get(entry) !== "-") throw new Error(`Release archive entry is not a regular file: ${entry}`);
    const sourcePath = entry.startsWith(".cursor/skills/impeccable/")
      ? join(sourceSkill, entry.slice(".cursor/skills/impeccable/".length))
      : join(source, entry);
    const bytes = commandOutput(exec, "unzip", ["-p", archive, entry], { encoding: null, maxBuffer: 64 * 1024 * 1024 });
    if (sha256Bytes(bytes) !== sha256File(sourcePath)) throw new Error(`Release archive differs from tag checkout: ${entry}`);
  }
  return { files: expected.length, excluded: [...excluded].sort() };
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function renderNotice(pin) {
  return [
    "Geldmacher Design includes a modified, vendored Cursor build of Impeccable.",
    "",
    `Impeccable source: ${pin.repository}`,
    `Pinned tag: ${pin.tag}`,
    `Pinned commit: ${pin.commit}`,
    "License: Apache License 2.0 (see upstream/LICENSE)",
    "",
    "Modifications are limited to the closed technical transformation list in",
    "upstream/README.md. Exact hashes and the generated patch are recorded in",
    "upstream/impeccable.lock.json and upstream/patches/impeccable-plugin.patch.",
    "",
  ].join("\n");
}

function updateThirdPartyNotice(root, pin) {
  return readFileSync(join(root, "THIRD_PARTY_NOTICES.md"), "utf8")
    .replace(/- Source: https:\/\/github\.com\/pbakaus\/impeccable/, `- Source: ${pin.repository}`)
    .replace(/- Pinned release: `skill-v[^`]+`/, `- Pinned release: \`${pin.tag}\``);
}

function projectedModule(root, pin) {
  const module = JSON.parse(readFileSync(join(root, "modules", "impeccable.json"), "utf8"));
  module.version = pin.version;
  module.source.url = pin.repository;
  module.source.tag = pin.tag;
  module.source.commit = pin.commit;
  module.source.archiveSha256 = pin.archive.sha256;
  return module;
}

function projectionOutputs(root, projection, pin, vendor) {
  const overlay = join(root, "overlays", "skills", "impeccable");
  const skill = join(projection, "skills", "impeccable");
  const agents = join(projection, "agents");
  cpSync(vendor.transformedDir, skill, { recursive: true });
  cpSync(vendor.transformedAgentsDir, agents, { recursive: true });
  if (existsSync(overlay)) cpSync(overlay, skill, { recursive: true });
  mkdirSync(join(projection, "upstream", "patches"), { recursive: true });
  mkdirSync(join(projection, "modules"), { recursive: true });
  mkdirSync(join(projection, "skills", "design", "references"), { recursive: true });
  cpSync(vendor.licensePath, join(projection, "upstream", "LICENSE"));
  writeJson(join(projection, "upstream", "impeccable.lock.json"), vendor.lock);
  writeFileSync(join(projection, "upstream", "patches", "impeccable-plugin.patch"), vendor.patchText);
  writeJson(join(projection, "upstream", "impeccable.pin.json"), pin);
  writeFileSync(join(projection, "upstream", "NOTICE"), renderNotice(pin));
  writeFileSync(join(projection, "THIRD_PARTY_NOTICES.md"), updateThirdPartyNotice(root, pin));
  const module = projectedModule(root, pin);
  writeJson(join(projection, "modules", "impeccable.json"), module);
  const design = JSON.parse(readFileSync(join(root, "modules", "design-core.json"), "utf8"));
  writeFileSync(join(projection, "skills", "design", "references", "capabilities.md"), renderCapabilityIndex([design, module]));
}

export const candidateDestinations = Object.freeze([
  "THIRD_PARTY_NOTICES.md",
  ...agentNames.map((name) => `agents/${name}`),
  "modules/impeccable.json",
  "skills/design/references/capabilities.md",
  "skills/impeccable",
  "upstream/LICENSE",
  "upstream/NOTICE",
  "upstream/impeccable.lock.json",
  "upstream/impeccable.pin.json",
  "upstream/patches/impeccable-plugin.patch",
]);

function copyPath(source, destination) {
  const stat = lstatSync(source);
  if (stat.isSymbolicLink()) throw new Error(`Refusing to copy symlink: ${source}`);
  mkdirSync(dirname(destination), { recursive: true });
  if (stat.isDirectory()) cpSync(source, destination, { recursive: true });
  else if (stat.isFile()) {
    writeFileSync(destination, readFileSync(source), { mode: stat.mode & 0o777 });
    chmodSync(destination, stat.mode & 0o777);
  } else throw new Error(`Refusing to copy non-regular path: ${source}`);
}

function repositoryPatch(root, projection, workspace) {
  const before = join(workspace, "before");
  const after = join(workspace, "after");
  for (const destination of candidateDestinations) {
    const current = join(root, destination);
    const projected = join(projection, destination);
    if (existsSync(current)) copyPath(current, join(before, destination));
    copyPath(projected, join(after, destination));
  }
  const diff = spawnSync("git", ["diff", "--no-index", "--binary", "--", "before", "after"], { cwd: workspace, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (![0, 1].includes(diff.status) || diff.error) throw diff.error || new Error(diff.stderr || "Unable to generate candidate repository patch.");
  return String(diff.stdout || "")
    .replaceAll("a/before/", "a/")
    .replaceAll("b/after/", "b/")
    .replaceAll("a/before", "a")
    .replaceAll("b/after", "b");
}

export function createCandidateFromInputs({ root = pluginRoot, source, gitSource = source, requireHead = true, archive, pin: pinInput, engineDirectory, createdAt = new Date().toISOString(), exec = execFileSync }) {
  const pin = validatePin(pinInput);
  const approved = readPin(root);
  if (compareVersions(pin.version, approved.version) <= 0) throw new Error(`Candidate ${pin.tag} must be newer than approved pin ${approved.tag}.`);
  if (sha256File(archive) !== pin.archive.sha256) throw new Error("Release archive SHA-256 differs from candidate provenance.");
  verifyArchiveMatchesSource({ archive, source, exec });

  const candidatesRoot = join(root, ".build", "impeccable-candidates");
  mkdirSync(candidatesRoot, { recursive: true });
  const workspace = mkdtempSync(join(candidatesRoot, ".prepare-"));
  try {
    const vendorWorkspace = join(workspace, "vendor");
    mkdirSync(vendorWorkspace);
    const vendor = buildVendorProjection({ source, gitSource, requireHead, pin, workspace: vendorWorkspace });
    const projection = join(workspace, "projection");
    projectionOutputs(root, projection, pin, vendor);
    if (pin.schemaVersion === 2) {
      if (!engineDirectory) throw new Error("Engine inputs are required for a native candidate.");
      for (const platform of enginePlatforms) {
        const relative = engineRelativePath(platform);
        copyPath(join(engineDirectory, relative), join(projection, relative));
        const [os, arch] = platform.split("-");
        resolveEngine(projection, { platform: os === "windows" ? "win32" : os, arch });
      }
      for (const platform of enginePlatforms) {
        const asset = pin.engine.assets[platform];
        vendor.lock.import.files.push({ source: asset.url, destination: engineRelativePath(platform), sourceSha256: asset.sha256, vendoredSha256: asset.sha256, transformations: [] });
      }
      vendor.lock.import.files.sort((a, b) => a.destination.localeCompare(b.destination));
      writeJson(join(projection, "upstream/impeccable.lock.json"), vendor.lock);
      const declaredVersion = readFileSync(join(projection, "skills/impeccable/scripts/VERSION"), "utf8").trim();
      assertEqual(declaredVersion, pin.engine.version, "Skill engine VERSION");
      verifyCandidateRuntime(root, projection, candidateDestinations);
    }
    const baseline = Object.fromEntries(candidateDestinations.map((destination) => [destination, hashPath(join(root, destination))]));
    const outputs = Object.fromEntries(candidateDestinations.map((destination) => [destination, {
      type: statSync(join(projection, destination)).isDirectory() ? "directory" : "file",
      sha256: hashPath(join(projection, destination)),
    }]));
    const repositoryPatchText = repositoryPatch(root, projection, workspace);
    const identity = {
      schema: 1,
      basePinSha256: sha256File(join(root, "upstream", "impeccable.pin.json")),
      baseline,
      upstream: { version: pin.version, tag: pin.tag, tagObject: pin.tagObject, commit: pin.commit, archiveSha256: pin.archive.sha256 },
      inventorySha256: sha256Bytes(canonicalJson(vendor.inventory)),
      transformationPatchSha256: vendor.lock.import.patchSha256,
      repositoryPatchSha256: sha256Bytes(repositoryPatchText),
      outputs,
    };
    const candidateId = `iu-${sha256Bytes(canonicalJson(identity)).slice(0, 16)}`;
    const manifest = { schema: 1, kind: "impeccable-update-candidate", candidateId, createdAt, identity };
    writeJson(join(workspace, "candidate.json"), manifest);
    writeFileSync(join(workspace, "repository.patch"), repositoryPatchText);
    const destination = join(candidatesRoot, candidateId);
    if (existsSync(destination)) {
      const existing = JSON.parse(readFileSync(join(destination, "candidate.json"), "utf8"));
      if (existing.candidateId !== candidateId || canonicalJson(existing.identity) !== canonicalJson(identity)) throw new Error(`Candidate id collision at ${candidateId}.`);
      rmSync(workspace, { recursive: true, force: true });
      return { candidateId, path: destination, reused: true, files: vendor.inventory.length };
    }
    renameSync(workspace, destination);
    return { candidateId, path: destination, reused: false, files: vendor.inventory.length };
  } catch (error) {
    if (existsSync(workspace)) rmSync(workspace, { recursive: true, force: true });
    throw error;
  }
}

function validateCandidate(root, candidateId) {
  if (!/^iu-[0-9a-f]{16}$/.test(candidateId)) throw new Error("Candidate id must match iu-<16 lowercase hex>.");
  const candidatesRoot = join(root, ".build", "impeccable-candidates");
  const directory = resolve(candidatesRoot, candidateId);
  if (!inside(candidatesRoot, directory) || dirname(directory) !== resolve(candidatesRoot)) throw new Error("Candidate path escapes the candidate root.");
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Candidate must be a physical directory.");
  const manifest = JSON.parse(readFileSync(join(directory, "candidate.json"), "utf8"));
  if (manifest.schema !== 1 || manifest.kind !== "impeccable-update-candidate" || manifest.candidateId !== candidateId) throw new Error("Candidate manifest identity is invalid.");
  const recomputed = `iu-${sha256Bytes(canonicalJson(manifest.identity)).slice(0, 16)}`;
  if (recomputed !== candidateId) throw new Error("Candidate manifest hash does not match its id.");
  if (JSON.stringify(Object.keys(manifest.identity.outputs).sort()) !== JSON.stringify([...candidateDestinations].sort())) throw new Error("Candidate output inventory is incomplete.");
  return { directory, manifest };
}

export function applyCandidate({ root = pluginRoot, candidateId, failAfter = Number.POSITIVE_INFINITY } = {}) {
  const { directory, manifest } = validateCandidate(root, candidateId);
  const projection = join(directory, "projection");
  if (sha256File(join(root, "upstream", "impeccable.pin.json")) !== manifest.identity.basePinSha256) throw new Error("Approved pin drifted after candidate preparation.");
  for (const destination of candidateDestinations) {
    if (hashPath(join(root, destination)) !== manifest.identity.baseline[destination]) throw new Error(`Candidate baseline drift: ${destination}`);
    if (hashPath(join(projection, destination)) !== manifest.identity.outputs[destination].sha256) throw new Error(`Candidate projection drift: ${destination}`);
  }
  if (sha256File(join(directory, "repository.patch")) !== manifest.identity.repositoryPatchSha256) throw new Error("Candidate repository patch drifted.");
  for (const destination of candidateDestinations) {
    if (hashPath(join(directory, "before", destination)) !== manifest.identity.baseline[destination]) throw new Error(`Candidate backup drift: ${destination}`);
  }

  if (readPin(projection).schemaVersion === 2) verifyCandidateRuntime(root, projection, candidateDestinations);
  const transaction = mkdtempSync(join(directory, ".apply-"));
  const backup = join(transaction, "backup");
  const staged = join(transaction, "staged");
  const applied = [];
  try {
    for (const destination of candidateDestinations) {
      const current = join(root, destination);
      if (existsSync(current)) copyPath(current, join(backup, destination));
      copyPath(join(projection, destination), join(staged, destination));
    }
    for (const destination of candidateDestinations) {
      const current = join(root, destination);
      applied.push(destination);
      rmSync(current, { recursive: true, force: true });
      copyPath(join(staged, destination), current);
      if (applied.length >= failAfter) throw new Error("Injected candidate apply failure.");
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const destination of [...applied].reverse()) {
      try {
        const current = join(root, destination);
        rmSync(current, { recursive: true, force: true });
        const previous = join(backup, destination);
        if (existsSync(previous)) copyPath(previous, current);
      } catch (rollbackError) {
        rollbackErrors.push(`${destination}: ${rollbackError.message}`);
      }
    }
    rmSync(transaction, { recursive: true, force: true });
    if (rollbackErrors.length) throw new Error(`${error.message} Rollback failed: ${rollbackErrors.join("; ")}`);
    throw error;
  }
  rmSync(transaction, { recursive: true, force: true });
  return { candidateId, applied: [...candidateDestinations] };
}

export function syncPinned({ root = pluginRoot, source, archive, apply = false, replace = false } = {}) {
  const pin = readPin(root);
  assertEqual(sha256File(archive), pin.archive.sha256, "release archive SHA-256");
  verifyArchiveMatchesSource({ archive, source });
  const workspace = mkdtempSync(join(tmpdir(), "geldmacher-design-sync-"));
  try {
    const vendor = buildVendorProjection({ source, pin, workspace });
    if (pin.schemaVersion === 2) {
      for (const platform of enginePlatforms) {
        const [os, arch] = platform.split("-");
        const engine = resolveEngine(root, { platform: os === "windows" ? "win32" : os, arch });
        copyPath(engine.file, join(vendor.transformedDir, engineRelativePath(platform).slice("skills/impeccable/".length)));
        const asset = pin.engine.assets[platform];
        vendor.lock.import.files.push({ source: asset.url, destination: engineRelativePath(platform), sourceSha256: asset.sha256, vendoredSha256: asset.sha256, transformations: [] });
      }
      vendor.lock.import.files.sort((a, b) => a.destination.localeCompare(b.destination));
    }
    if (!apply) return { mode: "verified", pin, files: vendor.inventory.length, transformed: vendor.changed.length };
    const skillTarget = join(root, "skills", "impeccable");
    const agentsTarget = join(root, "agents");
    if ((existsSync(skillTarget) || existsSync(agentsTarget)) && !replace) throw new Error("Vendored targets already exist. Re-run with --replace after reviewing the generated upstream change.");
    if (replace) {
      rmSync(skillTarget, { recursive: true, force: true });
      for (const name of agentNames) rmSync(join(agentsTarget, name), { force: true });
    }
    cpSync(vendor.transformedDir, skillTarget, { recursive: true });
    cpSync(vendor.transformedAgentsDir, agentsTarget, { recursive: true });
    const overlay = join(root, "overlays", "skills", "impeccable");
    if (existsSync(overlay)) cpSync(overlay, skillTarget, { recursive: true });
    mkdirSync(join(root, "upstream", "patches"), { recursive: true });
    writeFileSync(join(root, "upstream", "patches", "impeccable-plugin.patch"), vendor.patchText);
    cpSync(vendor.licensePath, join(root, "upstream", "LICENSE"));
    writeJson(join(root, "upstream", "impeccable.lock.json"), vendor.lock);
    return { mode: "imported", pin, files: vendor.inventory.length, transformed: vendor.changed.length };
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

export function materializeGitSource(repository, commit, destination) {
  const requested = [
    ".cursor/skills/impeccable",
    ...agentNames.map((name) => `.cursor/agents/${name}`),
    "LICENSE",
  ];
  const listing = commandOutput(execFileSync, "git", ["-C", repository, "ls-tree", "-r", "-z", "--full-tree", commit, "--", ...requested], { encoding: null });
  const seen = new Set();
  for (const rawRecord of Buffer.from(listing).toString("utf8").split("\0").filter(Boolean)) {
    const tab = rawRecord.indexOf("\t");
    if (tab < 0) throw new Error("Unexpected Git tree record while materializing the candidate.");
    const [mode, type, object] = rawRecord.slice(0, tab).split(" ");
    const path = validateArchiveEntryName(rawRecord.slice(tab + 1));
    const allowed = path === "LICENSE"
      || path.startsWith(".cursor/skills/impeccable/")
      || agentNames.some((name) => path === `.cursor/agents/${name}`);
    if (!allowed || type !== "blob" || !["100644", "100755"].includes(mode)) throw new Error(`Unsupported Git tree entry in Impeccable candidate: ${path}`);
    if (seen.has(path)) throw new Error(`Duplicate Git tree entry in Impeccable candidate: ${path}`);
    seen.add(path);
    const bytes = commandOutput(execFileSync, "git", ["-C", repository, "cat-file", "blob", object], { encoding: null, maxBuffer: 64 * 1024 * 1024 });
    const output = join(destination, path);
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, bytes, { mode: mode === "100755" ? 0o755 : 0o644 });
  }
  for (const required of ["LICENSE", ".cursor/skills/impeccable/SKILL.md", ...agentNames.map((name) => `.cursor/agents/${name}`)]) {
    if (!seen.has(required)) throw new Error(`Pinned Git tree is missing required entry: ${required}`);
  }
}

export async function prepareCandidate({ root = pluginRoot, tag, fromWorkingTree = false, fetchImpl = globalThis.fetch, token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "" } = {}) {
  const parsed = parseSkillTag(tag);
  if (!parsed) throw new Error("--to must be a stable Impeccable skill tag.");
  const approved = readPin(root);
  const conflicts = commandOutput(execFileSync, "git", ["-C", root, "status", "--porcelain=v1", "-z", "--untracked-files=all", "--ignored", "--", ...candidateDestinations]);
  if (String(conflicts).trim() && !fromWorkingTree) throw new Error(`Local changes conflict with the update inventory: ${String(conflicts).split("\0").filter(Boolean).join("; ")}. Review local work and use --from-working-tree to prepare against its current bytes.`);
  if (compareVersions(parsed.version, approved.version) <= 0) throw new Error(`Target ${tag} must be newer than approved pin ${approved.tag}.`);
  if (typeof fetchImpl !== "function") throw new Error("Global fetch is unavailable.");
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "geldmacher-design-impeccable-maintainer/1", "X-GitHub-Api-Version": "2022-11-28" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const releaseResponse = await fetchImpl(`https://api.github.com/repos/pbakaus/impeccable/releases/tags/${encodeURIComponent(tag)}`, { headers });
  if (!releaseResponse?.ok) throw new Error(`GitHub release lookup failed with status ${releaseResponse?.status || "unknown"}.`);
  const release = await releaseResponse.json();
  if (release.draft || release.prerelease || release.tag_name !== tag) throw new Error("Target release is not the requested stable skill release.");
  const asset = release.assets?.find((item) => item?.name === approved.archive.name);
  const expectedArchiveUrl = `${approved.repository}/releases/download/${tag}/${approved.archive.name}`;
  if (asset?.browser_download_url !== expectedArchiveUrl) throw new Error("Target release has no canonical upstream archive.");

  const networkWorkspace = mkdtempSync(join(tmpdir(), "geldmacher-design-upstream-"));
  try {
    const repository = join(networkWorkspace, "repository.git");
    const source = join(networkWorkspace, "source");
    commandOutput(execFileSync, "git", ["-c", "init.templateDir=", "init", "--bare", "--quiet", repository]);
    commandOutput(execFileSync, "git", ["-C", repository, "remote", "add", "origin", approved.repository]);
    commandOutput(execFileSync, "git", ["-C", repository, "fetch", "--quiet", "--depth=1", "origin", `refs/tags/${tag}:refs/tags/${tag}`]);
    const tagType = git(repository, ["cat-file", "-t", tag]);
    if (tagType !== "tag") throw new Error(`Target ${tag} is not an annotated tag.`);
    const tagObject = git(repository, ["rev-parse", tag]);
    const commit = git(repository, ["rev-parse", `${tag}^{commit}`]);
    materializeGitSource(repository, commit, source);
    const archiveResponse = await fetchImpl(asset.browser_download_url, { headers: { "User-Agent": headers["User-Agent"] } });
    if (!archiveResponse?.ok) throw new Error(`Release archive download failed with status ${archiveResponse?.status || "unknown"}.`);
    const archive = join(networkWorkspace, approved.archive.name);
    writeFileSync(archive, Buffer.from(await archiveResponse.arrayBuffer()));
    const engineDirectory = join(networkWorkspace, "engine");
    const versionFile = join(source, ".cursor/skills/impeccable/scripts/VERSION");
    if (!existsSync(versionFile)) throw new Error("Upstream native engine VERSION is missing.");
    const engine = await prepareEngine({ version: readFileSync(versionFile, "utf8").trim(), repository, directory: engineDirectory, fetchImpl, headers });
    const pin = validatePin({
      ...approved,
      schemaVersion: 2,
      engine,
      version: parsed.version,
      tag,
      tagObject,
      commit,
      archive: { name: approved.archive.name, url: asset.browser_download_url, sha256: sha256File(archive) },
    });
    return createCandidateFromInputs({ root, source, gitSource: repository, requireHead: false, archive, pin, engineDirectory });
  } finally {
    rmSync(networkWorkspace, { recursive: true, force: true });
  }
}
