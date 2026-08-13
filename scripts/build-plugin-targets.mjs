#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import YAML from "yaml";
import { readPin } from "./lib/impeccable-maintenance.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const impeccablePin = readPin(root);
const plugin = "geldmacher-design";
const nativeShared = [
  "agents",
  "assets",
  "LICENSE",
  "modules",
  "scripts/design-cli.mjs",
  "skills/design",
  "skills/impeccable",
  "src",
  "THIRD_PARTY_NOTICES.md",
];
const allowed = {
  cursor: [
    ".cursor-plugin",
    ...nativeShared,
    "hooks/cursor-hooks.json",
    "hooks/impeccable-plugin-hook.mjs",
  ],
  codex: [
    ".codex-plugin",
    ...nativeShared,
    "hooks/hooks.json",
    "hooks/impeccable-codex-hook.mjs",
  ],
  "agent-plugin": [
    "LICENSE",
    "modules",
    "skills/design",
    "skills/impeccable",
    "src",
    "THIRD_PARTY_NOTICES.md",
  ],
};
const developmentRoots = [".agents", ".build", ".cursor", ".git", "node_modules", "test", "tests", "upstream", "overlays"];
const repositoryOutput = join(root, ".build", "plugins");
const temporaryOutputs = new Map();

function inside(base, path) {
  const item = relative(resolve(base), resolve(path));
  return item === "" || (item !== ".." && !item.startsWith(`..${sep}`) && !item.startsWith(sep));
}

function lstatExists(path) {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function rejectExistingSymlinkSegments(anchor, candidate) {
  let cursor = resolve(anchor);
  for (const part of relative(cursor, resolve(candidate)).split(sep).filter(Boolean)) {
    cursor = join(cursor, part);
    if (!lstatExists(cursor)) break;
    if (lstatSync(cursor).isSymbolicLink()) throw new Error(`target output crosses a symlink: ${cursor}`);
  }
}

function assertSafeBuildOutput(outputRoot) {
  const output = resolve(outputRoot);
  if (output === resolve(repositoryOutput)) {
    rejectExistingSymlinkSegments(root, output);
    const existingAncestor = lstatExists(output) ? output : lstatExists(dirname(output)) ? dirname(output) : root;
    if (!inside(realpathSync(root), realpathSync(existingAncestor))) throw new Error("repository target output escapes its canonical root");
    return output;
  }

  const workspace = temporaryOutputs.get(output);
  if (!workspace) {
    throw new Error("target output must be the repository .build/plugins path or an owned build workspace targets path");
  }
  const temporaryRoot = resolve(tmpdir());
  if (!inside(temporaryRoot, workspace) || dirname(workspace) !== temporaryRoot || !/^geldmacher-design-build-[A-Za-z0-9_-]+$/.test(relative(temporaryRoot, workspace))) {
    throw new Error("temporary target workspace is not a direct owned child of the operating-system temp directory");
  }
  if (output !== join(workspace, "targets")) throw new Error("temporary target output must be the owned workspace targets directory");
  if (!lstatExists(workspace) || !lstatSync(workspace).isDirectory() || lstatSync(workspace).isSymbolicLink()) {
    throw new Error("temporary target workspace must remain a physical directory");
  }
  if (!inside(realpathSync(temporaryRoot), realpathSync(workspace))) throw new Error("temporary target workspace escapes the operating-system temp directory");
  rejectExistingSymlinkSegments(workspace, output);
  return output;
}

export function createTargetBuildWorkspace() {
  const workspace = mkdtempSync(join(tmpdir(), "geldmacher-design-build-"));
  const targets = join(workspace, "targets");
  temporaryOutputs.set(resolve(targets), resolve(workspace));
  return { workspace, targets };
}

export function removeTargetBuildWorkspace(buildWorkspace) {
  const workspace = resolve(buildWorkspace?.workspace || "");
  const targets = resolve(buildWorkspace?.targets || "");
  if (temporaryOutputs.get(targets) !== workspace || targets !== join(workspace, "targets")) {
    throw new Error("refusing to remove an unowned build workspace");
  }
  temporaryOutputs.delete(targets);
  if (!lstatExists(workspace) || lstatSync(workspace).isSymbolicLink() || !lstatSync(workspace).isDirectory()) {
    throw new Error("refusing to remove a missing or non-physical build workspace");
  }
  rmSync(workspace, { recursive: true, force: true });
}

function copyRegular(source, destination) {
  const stat = lstatSync(source);
  if (stat.isSymbolicLink()) throw new Error(`target source may not be a symlink: ${relative(root, source)}`);
  if (stat.isDirectory()) {
    mkdirSync(destination, { recursive: true, mode: stat.mode & 0o777 });
    for (const entry of readdirSync(source).sort()) copyRegular(join(source, entry), join(destination, entry));
    return;
  }
  if (!stat.isFile()) throw new Error(`target source must be a regular file: ${relative(root, source)}`);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, readFileSync(source), { mode: stat.mode & 0o777 });
  chmodSync(destination, stat.mode & 0o777);
}

function copyAllowed(destination, item) {
  const source = resolve(root, item);
  const output = resolve(destination, item);
  if (!inside(root, source) || !inside(destination, output)) throw new Error(`target path escapes its root: ${item}`);
  if (!existsSync(source)) throw new Error(`target source is missing: ${item}`);
  copyRegular(source, output);
}

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`built target contains a symlink: ${relative(directory, path)}`);
    return entry.isDirectory() ? files(path) : [path];
  }).sort();
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function packageThirdPartyProvenance(destination) {
  const licensePath = join(destination, "licenses", "impeccable-apache-2.0.txt");
  copyRegular(join(root, "upstream", "LICENSE"), licensePath);
  writeFileSync(join(destination, "THIRD_PARTY_NOTICES.md"), [
    "# Third-party notices",
    "",
    "## Impeccable",
    "",
    "- Project: Impeccable",
    `- Source: ${impeccablePin.repository}`,
    `- Pinned release: \`${impeccablePin.tag}\``,
    "- License: Apache License 2.0",
    "- Packaged license: `licenses/impeccable-apache-2.0.txt`",
    "",
    "The packaged `modules/impeccable.json` records the pinned archive SHA-256 used by runtime status and diagnostics. The source repository retains the complete imported-file inventory, closed transformation list, generated patch, and validation schema; those development-only records are not runtime package dependencies.",
    "",
    "The MIT license at the package root applies to the Geldmacher wrapper only. It does not replace Impeccable's Apache-2.0 terms.",
    "",
  ].join("\n"));
}

function narrowModules(destination, host) {
  const designPath = join(destination, "modules", "design-core.json");
  const design = JSON.parse(readFileSync(designPath, "utf8"));
  const impeccablePath = join(destination, "modules", "impeccable.json");
  const impeccable = JSON.parse(readFileSync(impeccablePath, "utf8"));
  if (host === "agent-plugin") {
    design.contributes.hooks = [];
    design.contributes.scripts = [
      "skills/design/scripts/design-cli.mjs",
      "skills/design/scripts/review-scope.mjs",
    ];
    impeccable.contributes.agents = [];
  } else {
    design.contributes.hooks = [host === "cursor" ? "hooks/cursor-hooks.json" : "hooks/hooks.json"];
    design.contributes.scripts = [
      "skills/design/scripts/design-cli.mjs",
      "skills/design/scripts/review-scope.mjs",
      "scripts/design-cli.mjs",
      host === "cursor" ? "hooks/impeccable-plugin-hook.mjs" : "hooks/impeccable-codex-hook.mjs",
    ];
  }
  writeJson(designPath, design);
  writeJson(impeccablePath, impeccable);
}

function replaceRequired(source, search, replacement, label) {
  if (source.split(search).length !== 2) throw new Error(`portable skill projection anchor must occur exactly once: ${label}`);
  return source.replace(search, replacement);
}

const portableImpeccableTransforms = [
  {
    path: "reference/new-work.md",
    label: "new-work asset producer",
    search: "When the harness runs subagents in parallel, fan the set out as one agent per card: each spawn is the shipped asset producer with a single-sketch packet, that card's fields, PRODUCT.md, the shared frame, and the card's declared path, up to four in flight at once. A slot still empty when its agent returns is regenerated inline, and a slot still empty when the user answers is dropped without ceremony; no other supervision is owed. Without parallel subagents, generate in the main thread after serving, in the same reading order, and let the harness's own generation display carry the progress; the wait for the answer follows the last file.",
    replacement: "Generate every sketch inline after serving, in the same reading order. Load [degraded/asset-producer.md](degraded/asset-producer.md) and follow that bundled role contract for each card; the wait for the answer follows the last file. A slot still empty when the user answers is dropped without ceremony.",
  },
  {
    path: "reference/new-work.md",
    label: "new-work documenter declaration",
    search: "On a new or replacement world, DESIGN.md is written at finish, from the built world, by the shipped documenter (section 7);",
    replacement: "On a new or replacement world, DESIGN.md is written at finish, from the built world, by following the bundled [degraded/documenter.md](degraded/documenter.md) role contract inline (section 7);",
  },
  {
    path: "reference/new-work.md",
    label: "new-work finish reviewer",
    search: "Capture desktop and mobile screenshots to files, then spawn the shipped finish reviewer, `impeccable-finish-reviewer` (`impeccable_finish_reviewer` in codex; `/impeccable-finish-reviewer` in Cursor; on GitHub Copilot say \"Use the impeccable-finish-reviewer agent\"), with the original request, confirmed answers, the artifact path, the screenshot paths, its direction contract, existing hook findings, the QUALITY BAR card and approved comp paths, and the craft-floor reference path. The reviewer has no browser; screenshots you fail to pass are checks it cannot run. Verify its return carries the five contract sections; on an empty or thrashed return, respawn once with the same inputs before doing anything else. This review never runs inside the build thread and never inherits it: spawn the reviewer fresh, with no forked conversation history (`fork_turns: 0` in codex); a reviewer that inherits your transcript inherits your framing, your optimism, and your abstractions, and everything it needs travels in the inputs above. Only a harness whose tool surface has no subagent capability at all substitutes a fresh in-thread pass after stepping fully out of the build context, run from [degraded/finish-reviewer.md](degraded/finish-reviewer.md), and a substituted or failed-and-replaced review is disclosed in one line at finish, never silently.",
    replacement: "Capture desktop and mobile screenshots to files, then step fully out of the build context and run a fresh in-thread review by loading [degraded/finish-reviewer.md](degraded/finish-reviewer.md). Give that bundled role contract the original request, confirmed answers, artifact path, screenshot paths, direction contract, existing detector findings, QUALITY BAR card and approved comp paths, and the craft-floor reference path. Screenshots you fail to inspect are checks the review cannot run. Verify the result carries the five contract sections; on an empty result, repeat the fresh degraded pass once with the same inputs. Disclose this standard-target degradation in one line at finish.",
  },
  {
    path: "reference/new-work.md",
    label: "new-work documenter execution",
    search: "Then spawn the shipped documenter, `impeccable-documenter` (`impeccable_documenter` in codex), with the project root, the artifact path, the direction contract, PRODUCT.md, the [document.md](document.md) reference path, and the boundary to write at; it records DESIGN.md and the sidecar from the built world, ground truth over intention; without subagents the pass runs from [degraded/documenter.md](degraded/documenter.md).",
    replacement: "Then load [degraded/documenter.md](degraded/documenter.md) and follow that bundled role contract inline with the project root, artifact path, direction contract, PRODUCT.md, the [document.md](document.md) reference path, and the boundary to write at; it records DESIGN.md and the sidecar from the built world, ground truth over intention.",
  },
  {
    path: "reference/new-work.md",
    label: "new-work degraded verdict pass",
    search: "A recapture measures positions, loading, and overflow; it cannot measure whether a fix reached the quality the finding named, so send the recaptured screenshots back to the same reviewer for a verdict scoring every material fix resolved, partial, or unresolved (through the harness's agent continuation; without one, run the scoring fresh from [degraded/finish-reviewer.md](degraded/finish-reviewer.md)'s Verdict Pass).",
    replacement: "A recapture measures positions, loading, and overflow; it cannot measure whether a fix reached the quality the finding named, so load [degraded/finish-reviewer.md](degraded/finish-reviewer.md) again and run its Verdict Pass inline against the recaptured screenshots, scoring every material fix resolved, partial, or unresolved.",
  },
  {
    path: "reference/visualize.md",
    label: "visualize asset producer",
    search: "When clean raster ingredients are required and the harness runs subagents, use the shipped asset producer, `impeccable-asset-producer` (`impeccable_asset_producer` in codex; `/impeccable-asset-producer` in Cursor; on GitHub Copilot say \"Use the impeccable-asset-producer agent\"): give it the approved comp, output paths, required dimensions and formats, transparency needs, crop notes, and what must remain semantic code. Otherwise produce the minimum required assets in the current thread by the book: load [degraded/asset-producer.md](degraded/asset-producer.md) and follow it inline, with whatever generation exists, the native tool or generate-image.mjs.",
    replacement: "When clean raster ingredients are required, produce the minimum required assets in the current thread: load [degraded/asset-producer.md](degraded/asset-producer.md) and follow that bundled role contract inline with the approved comp, output paths, required dimensions and formats, transparency needs, crop notes, and what must remain semantic code. Use whatever generation exists, the native tool or generate-image.mjs.",
  },
  {
    path: "reference/live.md",
    label: "live manual edit applier",
    search: "When native subagents are available, delegate source edits to `impeccable_manual_edit_applier` / `impeccable-manual-edit-applier`. Pass cwd, scripts path, event id, page URL, chunk/deadline, `batch`, `evidencePath`, and the canonical JSON result schema. The subagent must not poll or reply. If unavailable, apply inline with the same contract.",
    replacement: "Load [degraded/manual-edit-applier.md](degraded/manual-edit-applier.md) and follow that bundled role contract inline. Supply cwd, scripts path, event id, page URL, chunk/deadline, `batch`, `evidencePath`, and the canonical JSON result schema. The inline role must not poll or reply.",
  },
  {
    path: "scripts/context.mjs",
    label: "runtime subagent authorization directive",
    search: `// Same class of harness default as the autonomy directive: some harnesses gate
// agent-tool use on an explicit user request, which silently disables every
// shipped subagent the skill's flows depend on (finish reviewer, asset
// producer, manual-edit applier, critique panels). Observed live: the model
// resolved the conflict against the skill without telling the user.
function appendSubagentAuthorizationDirective(parts) {
  parts.push([
    'SUBAGENT_AUTHORIZATION: If your harness gates subagent or agent-tool use on an explicit user request,',
    "the user's invocation of this skill is that request for the skill's shipped subagents;",
    'spawn them where a reference file directs, without re-asking.',
    'Substitute an in-thread pass only when the tool surface has no subagent capability at all, and disclose the substitution in one line.',
  ].join(' '));
}`,
    replacement: `// Agent Plugins v1 does not register native agents. Portable projections keep
// every role executable by pointing the active context at its bundled inline
// contract instead of authorizing a host-specific agent alias.
function appendSubagentAuthorizationDirective(parts) {
  parts.push([
    'DEGRADED_ROLE_DIRECTIVE: Native agent registration is unavailable in this Agent Plugins v1 package.',
    'When a flow needs a reviewer, documenter, asset producer, or manual edit applier,',
    'load the matching bundled reference/degraded role file and follow it inline in a fresh role context.',
    'Disclose the standard-target degradation in one line.',
  ].join(' '));
}`,
  },
  {
    path: "scripts/live/instructions.mjs",
    label: "runtime live manual edit applier",
    search: "Delegate the source edits to the impeccable_manual_edit_applier subagent when available (pass cwd, scripts path, event id, page URL, chunk/deadline, batch, evidencePath); it must not poll or reply.",
    replacement: "Load reference/degraded/manual-edit-applier.md and follow that bundled role contract inline (pass cwd, scripts path, event id, page URL, chunk/deadline, batch, evidencePath); the inline role must not poll or reply.",
  },
];

const portableOperationNames = [
  "adapt",
  "animate",
  "audit",
  "bolder",
  "clarify",
  "colorize",
  "critique",
  "delight",
  "distill",
  "doctor",
  "document",
  "extract",
  "harden",
  "hooks",
  "init",
  "layout",
  "live",
  "onboard",
  "optimize",
  "overdrive",
  "polish",
  "quieter",
  "shape",
  "typeset",
];
const portableOperationAlternation = portableOperationNames.join("|");
const portableInvocationProjectionPaths = new Set([
  "SKILL.md",
  "reference/adapt.md",
  "reference/adapt.native.md",
  "reference/animate.md",
  "reference/audit.md",
  "reference/audit.native.md",
  "reference/bolder.md",
  "reference/clarify.md",
  "reference/colorize.md",
  "reference/critique.md",
  "reference/delight.md",
  "reference/distill.md",
  "reference/document.md",
  "reference/harden.md",
  "reference/hooks.md",
  "reference/init.md",
  "reference/layout.md",
  "reference/live-setup.md",
  "reference/onboard.md",
  "reference/optimize.md",
  "reference/quieter.md",
  "reference/routing.md",
  "reference/typeset.md",
]);
const quotedPortableInvocation = new RegExp(
  "`(?:/impeccable|\\$impeccable|impeccable)\\s+(" + portableOperationAlternation + ")([^`]*)`",
  "g",
);
const plainPortableInvocation = new RegExp(
  "(?<![\\w./:>-])(?:/impeccable|\\$impeccable|impeccable)\\s+(" + portableOperationAlternation + ")(?=\\s|`|[),.:]|$)",
  "g",
);
const nativeImpeccableIdentity = /(?<![\w./:>-])(?:\/impeccable|\$impeccable)(?![-\w])/g;

function projectPortableInvocationSyntax(source) {
  return source
    .replace(quotedPortableInvocation, (_match, operation, suffix) => `\`operation: ${operation}${suffix}\``)
    .replace(plainPortableInvocation, (_match, operation) => `operation: ${operation}`)
    .replace(nativeImpeccableIdentity, "the loaded Impeccable skill")
    .replaceAll("Suggested command", "Suggested operation")
    .replaceAll("Which command", "Which operation")
    .replaceAll("Only recommend commands from", "Only recommend operations from")
    .replaceAll("most appropriate command", "most appropriate operation")
    .replaceAll("next commands", "next operations")
    .replaceAll("Commands table", "Operations table")
    .replaceAll("auto-run a command", "auto-run an operation");
}

function adaptAgentPluginSkills(destination) {
  const skillsRoot = join(destination, "skills");
  for (const skillName of ["design", "impeccable"]) rmSync(join(skillsRoot, skillName, "agents"), { recursive: true, force: true });

  const designPath = join(skillsRoot, "design", "SKILL.md");
  let design = readFileSync(designPath, "utf8");
  design = replaceRequired(
    design,
    "description: Use when the user explicitly invokes /design in Cursor or $design in Codex for project setup, status, diagnostics, change-scoped interface review, or curated website and web-app design work. Routes general design work to the bundled Impeccable skill and narrower work to registered curated modules.",
    "description: Use when a user loads the design skill for project setup, status, diagnostics, change-scoped interface review, or curated website and web-app design work. Routes general design work to the bundled Impeccable skill and narrower work to registered curated modules.",
    "design description",
  );
  design = replaceRequired(
    design,
    "Determine the active host from the invocation: Cursor uses `/design` and `/impeccable`; Codex uses `$design` and `$impeccable`; a generic Agent Plugins client loads the bare `design` and `impeccable` skill names.",
    "This standard package declares the bare `design` and `impeccable` skill names; the client decides how they are exposed or invoked.",
    "design host contract",
  );
  design = design
    .replace("An explicit `/impeccable ...` or `$impeccable ...` request", "A request explicitly addressed to the loaded Impeccable skill")
    .replace("For `/design setup|status|doctor` or `$design setup|status|doctor`", "For a `setup`, `status`, or `doctor` intent addressed to the loaded Design skill")
    .replace("replace `<host>` with `cursor`, `codex`, or `agent-plugin`", "replace `<host>` with `agent-plugin`")
    .replace(
      "2. Report conflicts and the exact proposed writes. A host-local Impeccable skill or hook entry (`.cursor/...` on Cursor, `.agents/skills/...` or `.codex/hooks.json` on Codex) is a conflict; never remove or overwrite it.",
      "2. Report the exact proposed writes. Standard mode does not inspect, remove, or overwrite client-local skill and hook paths.",
    )
    .replace("### `design setup`", "### Setup request")
    .replace("### `design status`", "### Status request")
    .replace("### `design doctor`", "### Doctor request")
    .replace("offer the host-native Impeccable `init` invocation", "offer the loaded Impeccable skill's `init` operation through the client")
    .replace("offer the corresponding `document` invocation", "offer the corresponding `document` operation")
    .replace(
      "- The plugin hook is inactive unless `.impeccable/config.json` parses and contains `hook.enabled: true`.\n- On Cursor, a real Impeccable detector finding may deny a proposed UI write. On Codex, findings arrive after the edit and again through the deduplicated Stop deep pass.\n- Agent Plugins v1 does not standardize hooks or native subagents. Its portable target reports hooks as unavailable and uses Impeccable's bundled degraded role instructions.",
      "- Agent Plugins v1 does not standardize hooks or native subagents. This target reports hooks as unavailable and uses Impeccable's bundled degraded role instructions.",
    );
  writeFileSync(designPath, design);

  const impeccablePath = join(skillsRoot, "impeccable", "SKILL.md");
  let impeccable = readFileSync(impeccablePath, "utf8");
  const start = "## Geldmacher Design host contract\n\n";
  const end = "\n\nThis skill gives you the tools and permission to create design";
  const startIndex = impeccable.indexOf(start);
  const endIndex = impeccable.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) throw new Error("portable Impeccable host contract anchors are missing");
  const portableContract = [
    "## Geldmacher Design host contract",
    "",
    "This Agent Plugins v1 package declares the bare `impeccable` skill name; the client decides how it is exposed or invoked. Within this projection, `operation: <name>` identifies an intent handled after the client loads the skill; it is documentation notation, not client command syntax. Resolve `<IMPECCABLE_SKILL_ROOT>` to the absolute directory containing this `SKILL.md` before running a bundled runtime script; never execute an unresolved placeholder. Runtime scripts recognize the canonical root `plugin.json` and use the explicit `agent-plugin` provider.",
    "",
    "Agent Plugins v1 does not standardize native subagents or hooks. Use the matching bundled `reference/degraded/` role instructions, disclose the degradation, and do not emulate or install hook integration.",
  ].join("\n");
  impeccable = `${impeccable.slice(0, startIndex)}${portableContract}${impeccable.slice(endIndex)}`;
  impeccable = impeccable.replace(
    /^\*\*Hooks:\*\*.*$/m,
    "**Hooks:** Hook management is unavailable in the Agent Plugins v1 target. Do not load the hooks playbook or write hook configuration from this package.",
  );
  impeccable = impeccable
    .replace("## Commands", "## Operations")
    .replace("| Command | Category | Description | Reference |", "| Operation | Category | Description | Reference |")
    .replace("**Explicit or clearly implied command:**", "**Explicit or clearly implied operation:**");
  writeFileSync(impeccablePath, impeccable);

  const impeccableRoot = join(skillsRoot, "impeccable");
  for (const relativePath of portableInvocationProjectionPaths) {
    const path = join(impeccableRoot, relativePath);
    if (!existsSync(path)) throw new Error(`portable invocation projection path is missing: ${relativePath}`);
    const source = readFileSync(path, "utf8");
    const projected = projectPortableInvocationSyntax(source);
    if (projected === source) throw new Error(`portable invocation projection anchor is missing: ${relativePath}`);
    writeFileSync(path, projected);
  }

  for (const transformation of portableImpeccableTransforms) {
    const path = join(impeccableRoot, transformation.path);
    const source = readFileSync(path, "utf8");
    writeFileSync(path, replaceRequired(source, transformation.search, transformation.replacement, transformation.label));
  }

  const providerPath = join(impeccableRoot, "scripts", "lib", "provider.mjs");
  const provider = readFileSync(providerPath, "utf8");
  writeFileSync(providerPath, replaceRequired(
    provider,
    `export const IMPECCABLE_COMMAND_PREFIX = IMPECCABLE_PROVIDER_ID === "cursor"\n  ? "/"\n  : IMPECCABLE_PROVIDER_ID === "codex"\n    ? "$"\n    : "";\nexport const IMPECCABLE_COMMAND = \`\${IMPECCABLE_COMMAND_PREFIX}impeccable\`;`,
    `export const IMPECCABLE_COMMAND_PREFIX = IMPECCABLE_PROVIDER_ID === "cursor"\n  ? "/"\n  : IMPECCABLE_PROVIDER_ID === "codex"\n    ? "$"\n    : "operation:";\nexport const IMPECCABLE_COMMAND = IMPECCABLE_PROVIDER_ID === "agent-plugin"\n  ? "operation:"\n  : \`\${IMPECCABLE_COMMAND_PREFIX}impeccable\`;`,
    "portable runtime operation notation",
  ));

  const liveBrowserPath = join(impeccableRoot, "scripts", "live-browser.js");
  const liveBrowser = readFileSync(liveBrowserPath, "utf8");
  writeFileSync(liveBrowserPath, replaceRequired(
    liveBrowser,
    "  const IMPECCABLE_COMMAND = (window.__IMPECCABLE_COMMAND_PREFIX__ || '/') + 'impeccable';",
    "  const IMPECCABLE_COMMAND = window.__IMPECCABLE_COMMAND_PREFIX__ === 'operation:'\n    ? 'operation:'\n    : (window.__IMPECCABLE_COMMAND_PREFIX__ || '/') + 'impeccable';",
    "portable live browser operation notation",
  ));

  const hostPath = join(destination, "src", "host.mjs");
  const host = readFileSync(hostPath, "utf8");
  writeFileSync(hostPath, replaceRequired(
    host,
    "  return skill;\n}",
    "  return `the loaded ${skill} skill's`;\n}",
    "portable lifecycle operation notation",
  ));
}

function parseSkillFrontmatter(path, relativePath) {
  const text = readFileSync(path, "utf8");
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error(`Agent Skill frontmatter is missing: ${relativePath}`);
  const value = YAML.parse(match[1]);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Agent Skill frontmatter is invalid: ${relativePath}`);
  return { text, value };
}

function validateAgentSkill(path, name) {
  const relativePath = `skills/${name}/SKILL.md`;
  const { text, value } = parseSkillFrontmatter(path, relativePath);
  const allowedFields = new Set(["name", "description", "license", "compatibility", "metadata", "allowed-tools"]);
  for (const key of Object.keys(value)) if (!allowedFields.has(key)) throw new Error(`${relativePath} contains unsupported Agent Skills field ${key}`);
  if (value.name !== name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.name)) throw new Error(`${relativePath} name must match its directory`);
  if (typeof value.description !== "string" || !value.description.trim() || value.description.length > 1024) throw new Error(`${relativePath} description is invalid`);
  if (value.license !== undefined && typeof value.license !== "string") throw new Error(`${relativePath} license must be a string`);
  if (value.compatibility !== undefined && (typeof value.compatibility !== "string" || value.compatibility.length > 500)) throw new Error(`${relativePath} compatibility is invalid`);
  if (value.metadata !== undefined) {
    if (!value.metadata || typeof value.metadata !== "object" || Array.isArray(value.metadata)) throw new Error(`${relativePath} metadata must be an object`);
    for (const [key, metadataValue] of Object.entries(value.metadata)) {
      if (typeof key !== "string" || typeof metadataValue !== "string") throw new Error(`${relativePath} metadata values must be strings`);
    }
  }
  return text;
}

function digest(directory) {
  const hash = createHash("sha256");
  for (const path of files(directory)) hash.update(`${relative(directory, path).split(sep).join("/")}\0${createHash("sha256").update(readFileSync(path)).digest("hex")}\n`);
  return hash.digest("hex");
}

function validateNative(destination, host, version) {
  for (const name of developmentRoots) if (existsSync(join(destination, name))) throw new Error(`${host} target leaked ${name}`);
  const manifestPath = join(destination, host === "cursor" ? ".cursor-plugin/plugin.json" : ".codex-plugin/plugin.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.name !== plugin || manifest.version !== version) throw new Error(`${host} manifest identity or version drifted`);
  const otherManifest = host === "cursor" ? ".codex-plugin" : ".cursor-plugin";
  const otherHook = host === "cursor" ? "hooks/hooks.json" : "hooks/cursor-hooks.json";
  const otherAdapter = host === "cursor" ? "hooks/impeccable-codex-hook.mjs" : "hooks/impeccable-plugin-hook.mjs";
  if (existsSync(join(destination, otherManifest)) || existsSync(join(destination, otherHook)) || existsSync(join(destination, otherAdapter))) {
    throw new Error(`${host} target contains the other host's adapter`);
  }
  const module = JSON.parse(readFileSync(join(destination, "modules", "design-core.json"), "utf8"));
  const expectedHook = host === "cursor" ? "hooks/cursor-hooks.json" : "hooks/hooks.json";
  if (JSON.stringify(module.contributes.hooks) !== JSON.stringify([expectedHook])) throw new Error(`${host} target module hooks drifted`);
  files(destination);
}

function validateAgentPlugin(destination, version) {
  for (const name of developmentRoots) if (existsSync(join(destination, name))) throw new Error(`agent-plugin target leaked ${name}`);
  for (const name of [".agents", ".cursor-plugin", ".codex-plugin", "agents", "assets", "hooks", "mcp.json", "scripts"]) {
    if (existsSync(join(destination, name))) throw new Error(`agent-plugin target contains host-only or unsupported root ${name}`);
  }
  const manifest = JSON.parse(readFileSync(join(destination, "plugin.json"), "utf8"));
  const schema = JSON.parse(readFileSync(join(root, "schemas", "agent-plugin", "1.0.0", "plugin.schema.json"), "utf8"));
  const validator = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  if (!validator(manifest)) throw new Error(`agent-plugin manifest is invalid: ${JSON.stringify(validator.errors)}`);
  if (manifest.name !== plugin || manifest.version !== version) throw new Error("agent-plugin manifest identity or version drifted");
  if (Object.hasOwn(manifest, "extensions")) throw new Error("agent-plugin manifest must not invent an extension namespace");
  const skillEntries = readdirSync(join(destination, "skills"), { withFileTypes: true });
  const skillNames = skillEntries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  if (JSON.stringify(skillNames) !== JSON.stringify(["design", "impeccable"])) throw new Error("agent-plugin target must contain exactly design and impeccable skills");
  for (const entry of skillEntries) if (!entry.isDirectory()) throw new Error(`agent-plugin skills root contains non-directory entry ${entry.name}`);
  const designText = validateAgentSkill(join(destination, "skills", "design", "SKILL.md"), "design");
  const impeccableText = validateAgentSkill(join(destination, "skills", "impeccable", "SKILL.md"), "impeccable");
  if (!designText.includes("bare `design` and `impeccable` skill names")) throw new Error("portable Design contract does not use bare skill names");
  if (/\b(?:Cursor|Codex)\b|\.cursor\/|\.codex\/|\.agents\//.test(designText)) throw new Error("portable Design contract contains native host guidance");
  if (impeccableText.includes("../../agents/")) throw new Error("portable Impeccable contract references native agents");
  if (!impeccableText.includes("reference/degraded/")) throw new Error("portable Impeccable contract omits degraded roles");
  if (/[/\$]impeccable/.test(impeccableText)) throw new Error("portable Impeccable contract contains native invocation syntax");
  if ([designText, impeccableText].some((text) => text.includes("${CURSOR_PLUGIN_ROOT}") || text.includes("${PLUGIN_ROOT}"))) {
    throw new Error("portable skill contract contains a native plugin-root placeholder");
  }
  const designModule = JSON.parse(readFileSync(join(destination, "modules", "design-core.json"), "utf8"));
  const impeccableModule = JSON.parse(readFileSync(join(destination, "modules", "impeccable.json"), "utf8"));
  if (
    designModule.contributes.hooks.length !== 0
    || JSON.stringify(designModule.contributes.scripts) !== JSON.stringify([
      "skills/design/scripts/design-cli.mjs",
      "skills/design/scripts/review-scope.mjs",
    ])
  ) {
    throw new Error("agent-plugin design module contains native contributions");
  }
  if (impeccableModule.contributes.agents.length !== 0) throw new Error("agent-plugin Impeccable module contains native agents");
  const portableResources = files(join(destination, "skills")).filter((path) => /\.(?:md|mjs|js)$/.test(path));
  const nativeInvocation = /(?<![\w./:>-])\/impeccable(?=(?:\s|`|[),.:]|$))|(?<![\w.>-])\$impeccable(?=(?:\s|`|[),.:]|$))/;
  const inventedPortableInvocation = new RegExp(
    "`(?:design\\s+(?:setup|status|doctor)|impeccable\\s+(?:" + portableOperationAlternation + "))(?:\\s+[^`]*)?`"
      + "|\\b(?:run|offer|invoke|recommend|use)\\s+(?:design\\s+(?:setup|status|doctor)|impeccable\\s+(?:" + portableOperationAlternation + "))(?=\\s|[),.:]|$)",
    "i",
  );
  const nativeRoleContract = /impeccable[-_](?:finish[-_]reviewer|documenter|asset[-_]producer|manual[-_]edit[-_]applier)|SUBAGENT_AUTHORIZATION|shipped (?:finish reviewer|documenter|asset producer|subagent)|agent continuation/i;
  for (const path of portableResources) {
    const resource = readFileSync(path, "utf8");
    if (path.endsWith(".md") && nativeInvocation.test(resource)) {
      throw new Error(`agent-plugin skill resource contains native invocation syntax: ${relative(destination, path)}`);
    }
    if (path.endsWith(".md") && inventedPortableInvocation.test(resource)) {
      throw new Error(`agent-plugin skill resource presents a bare operation as client command syntax: ${relative(destination, path)}`);
    }
    if (nativeRoleContract.test(resource)) throw new Error(`agent-plugin skill resource contains a native role contract: ${relative(destination, path)}`);
  }
  if (!existsSync(join(destination, "licenses", "impeccable-apache-2.0.txt"))) throw new Error("agent-plugin target omits the Impeccable license");
  const notices = readFileSync(join(destination, "THIRD_PARTY_NOTICES.md"), "utf8");
  if (notices.includes("`upstream/") || !notices.includes("`licenses/impeccable-apache-2.0.txt`")) {
    throw new Error("agent-plugin third-party notice contains an unpackaged provenance path");
  }
  files(destination);
}

export function buildPluginTargets(outputRoot) {
  const output = assertSafeBuildOutput(outputRoot);
  rmSync(output, { recursive: true, force: true });
  const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
  const result = { version };
  for (const host of ["agent-plugin", "cursor", "codex"]) {
    const destination = join(output, host, plugin);
    for (const item of allowed[host]) copyAllowed(destination, item);
    if (host === "agent-plugin") {
      copyRegular(join(root, "manifests", "agent-plugin.json"), join(destination, "plugin.json"));
      adaptAgentPluginSkills(destination);
    }
    packageThirdPartyProvenance(destination);
    narrowModules(destination, host);
    if (host === "agent-plugin") validateAgentPlugin(destination, version);
    else validateNative(destination, host, version);
    result[host] = { path: destination, hash: digest(destination), files: files(destination).length };
  }
  return result;
}

const direct = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) {
  const check = process.argv.includes("--check");
  const buildWorkspace = check ? createTargetBuildWorkspace() : null;
  const output = buildWorkspace ? buildWorkspace.targets : repositoryOutput;
  try {
    process.stdout.write(`${JSON.stringify(buildPluginTargets(output), null, 2)}\n`);
  } finally {
    if (buildWorkspace) removeTargetBuildWorkspace(buildWorkspace);
  }
}
