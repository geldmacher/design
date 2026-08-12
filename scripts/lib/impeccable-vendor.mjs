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
  "agent-skills-frontmatter",
  "portable-dual-host-script-paths",
  "dual-host-provider-routing",
  "codex-generic-subagent-contract",
  "agent-plugin-provider-routing",
  "replace-project-hook-installation-with-plugin-hook",
  "disable-runtime-self-update",
  "redirect-standalone-installer",
  "recognize-plugin-hook",
]);

export const agentNames = Object.freeze([
  "impeccable-asset-producer.md",
  "impeccable-documenter.md",
  "impeccable-finish-reviewer.md",
  "impeccable-manual-edit-applier.md",
]);

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
  if (relativePath.endsWith(".md")) {
    if (relativePath === "SKILL.md") {
      text = mustReplace(
        text,
        `version: ${version}\nlicense: Apache 2.0`,
        `license: Apache-2.0\ncompatibility: Requires Node.js 22 or newer.\nmetadata:\n  version: "${version}"`,
        "Agent Skills frontmatter",
      );
      operations.push("agent-skills-frontmatter");
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

  if (relativePath === "scripts/hook-admin.mjs") {
    text = mustReplace(text, "import { IMPECCABLE_COMMAND } from './lib/provider.mjs';", "import { IMPECCABLE_COMMAND, IMPECCABLE_PROVIDER_ID } from './lib/provider.mjs';", "hook admin provider identity");
    text = text.replaceAll(".cursor/skills/impeccable", "<IMPECCABLE_SKILL_ROOT>");
    text = mustReplace(text, "const STATUS_MESSAGE = 'Checking UI changes';", "const STATUS_MESSAGE = 'Checking UI changes';\nconst PLUGIN_MANAGED_HOOK = true;", "hook admin plugin constant");
    text = mustReplace(text, "  const cfg = readConfig(cwd);\n  const envKill = process.env.IMPECCABLE_HOOK_DISABLED;", "  const cfg = readConfig(cwd);\n  const explicitEnabled = hookSection(local.raw)?.enabled ?? hookSection(shared.raw)?.enabled ?? false;\n  const envKill = process.env.IMPECCABLE_HOOK_DISABLED;", "hook admin strict status");
    text = mustReplace(text, "`  state:        ${cfg.enabled ? 'enabled' : 'disabled'}`", "`  state:        ${explicitEnabled ? 'enabled' : 'disabled'}`", "hook admin state line");
    text = mustReplace(text, "  const repaired = repairHookManifests(cwd);", "  const repaired = PLUGIN_MANAGED_HOOK\n    ? { written: [], already: ['geldmacher-design plugin'], backups: [] }\n    : repairHookManifests(cwd);", "hook admin manifest bypass");
    text = mustReplace(text, "  try {\n    let out = '';", [
      "  try {",
      "    if (IMPECCABLE_PROVIDER_ID === 'agent-plugin') {",
      "      if (action === 'status') {",
      "        process.stdout.write('Hook management is unavailable because Agent Plugins v1 does not standardize plugin hooks.\\n');",
      "        return;",
      "      }",
      "      throw new Error('Hook management is unavailable because Agent Plugins v1 does not standardize plugin hooks.');",
      "    }",
      "    let out = '';",
    ].join("\n"), "standard target hook refusal");
    operations.push("replace-project-hook-installation-with-plugin-hook", "agent-plugin-provider-routing");
  }

  if (relativePath === "scripts/context.mjs") {
    text = mustReplace(text, "const FETCH_TIMEOUT_MS = 1200;", "const FETCH_TIMEOUT_MS = 1200;\nconst PLUGIN_MANAGED_UPDATES = true;\nconst PLUGIN_MANAGED_HOOK = true;", "context plugin guards");
    text = text.replaceAll("npx impeccable update", "the Design doctor command");
    text = mustReplace(text, "  const activeRoot = path.resolve(ctx.projectRoot || process.cwd());\n  if (!hookEnabledAt(activeRoot)) return 'none';", "  if (IMPECCABLE_PROVIDER_ID === 'agent-plugin') return 'none';\n  const activeRoot = path.resolve(ctx.projectRoot || process.cwd());\n  if (!hookEnabledAt(activeRoot)) return 'none';", "standard target hook absence");
    operations.push("agent-plugin-provider-routing");
    text = mustReplace(text, "async function computeUpdateDirective(now = Date.now()) {\n  try {", "async function computeUpdateDirective(now = Date.now()) {\n  try {\n    if (PLUGIN_MANAGED_UPDATES) return null;", "context update short circuit");
    text = mustReplace(text, "  let enabled = true;\n  for (const name of", "  let enabled = PLUGIN_MANAGED_HOOK ? false : true;\n  for (const name of", "strict plugin hook default");
    text = mustReplace(text, "  if (!hookEnabledAt(activeRoot)) return 'none';\n  const manifests = HOOK_MANIFESTS_BY_PROVIDER[IMPECCABLE_PROVIDER_ID] || [];", "  if (!hookEnabledAt(activeRoot)) return 'none';\n  if (PLUGIN_MANAGED_HOOK) return STOP_REVIEW_PROVIDERS.has(IMPECCABLE_PROVIDER_ID) ? 'stop' : 'per-edit';\n  const manifests = HOOK_MANIFESTS_BY_PROVIDER[IMPECCABLE_PROVIDER_ID] || [];", "plugin managed automatic hook mode");
    operations.push("disable-runtime-self-update", "recognize-plugin-hook");
  }

  if (relativePath === "scripts/lib/provider.mjs") {
    text = [
      'import fs from "node:fs";',
      'import path from "node:path";',
      'import { fileURLToPath } from "node:url";',
      "",
      'const AGENT_PLUGIN_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";',
      "",
      "function isAgentPluginPackage() {",
      '  const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");',
      '  const manifestPath = path.join(pluginRoot, "plugin.json");',
      "  if (!fs.existsSync(manifestPath)) return false;",
      "  try {",
      '    return JSON.parse(fs.readFileSync(manifestPath, "utf8")).$schema === AGENT_PLUGIN_SCHEMA;',
      "  } catch {",
      "    return false;",
      "  }",
      "}",
      "",
      "// Geldmacher Design resolves one explicit multi-target provider at runtime.",
      "export function resolveImpeccableProvider(env = process.env) {",
      '  const explicit = String(env.IMPECCABLE_HOST || "").trim().toLowerCase();',
      '  if (explicit && !["agent-plugin", "cursor", "codex"].includes(explicit)) {',
      "    throw new Error(`Unsupported IMPECCABLE_HOST: ${explicit}. Expected agent-plugin, cursor, or codex.`);",
      "  }",
      "  if (explicit) return explicit;",
      '  if (env.CURSOR_PLUGIN_ROOT) return "cursor";',
      '  if (env.PLUGIN_ROOT) return "codex";',
      '  if (isAgentPluginPackage()) return "agent-plugin";',
      '  throw new Error("Impeccable host is unknown. Set IMPECCABLE_HOST to agent-plugin, cursor, or codex.");',
      "}",
      "",
      "export const IMPECCABLE_PROVIDER_ID = resolveImpeccableProvider();",
      'export const IMPECCABLE_COMMAND_PREFIX = IMPECCABLE_PROVIDER_ID === "cursor"',
      '  ? "/"',
      '  : IMPECCABLE_PROVIDER_ID === "codex"',
      '    ? "$"',
      '    : "";',
      "export const IMPECCABLE_COMMAND = `${IMPECCABLE_COMMAND_PREFIX}impeccable`;",
      "",
    ].join("\n");
    operations.push("dual-host-provider-routing", "agent-plugin-provider-routing");
  }

  if (relativePath === "scripts/lib/staleness-deep.mjs") {
    text = mustReplace(text, "export function checkHookInstallation({ projectRoot, repoRoot, providerId }) {\n  const findings = [];", "export function checkHookInstallation({ projectRoot, repoRoot, providerId }) {\n  const findings = [];\n  if (['cursor', 'codex'].includes(providerId)) return findings;", "doctor plugin hook recognition");
    operations.push("recognize-plugin-hook");
  }

  if (relativePath === "scripts/pin.mjs") {
    text = "#!/usr/bin/env node\n/** Geldmacher Design owns skill packaging; project-local shortcut installation is intentionally disabled. */\nprocess.stdout.write('Geldmacher Design bundles Impeccable. Standalone shortcut installation is disabled; use the host-native Design or Impeccable invocation. Maintainers update the bundle through npm run sync:impeccable.\\n');\n";
    operations.push("redirect-standalone-installer");
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
  if (JSON.stringify([...archiveScope].sort()) !== JSON.stringify([...expected].sort())) throw new Error("Release archive vendored scope differs from the exact tag checkout.");
  for (const entry of expected) {
    if (relevantModes.get(entry) !== "-") throw new Error(`Release archive entry is not a regular file: ${entry}`);
    const sourcePath = entry.startsWith(".cursor/skills/impeccable/")
      ? join(sourceSkill, entry.slice(".cursor/skills/impeccable/".length))
      : join(source, entry);
    const bytes = commandOutput(exec, "unzip", ["-p", archive, entry], { encoding: null, maxBuffer: 64 * 1024 * 1024 });
    if (sha256Bytes(bytes) !== sha256File(sourcePath)) throw new Error(`Release archive differs from tag checkout: ${entry}`);
  }
  return { files: expected.length };
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
  const diff = spawnSync("git", ["diff", "--no-index", "--binary", "--", "before", "after"], { cwd: workspace, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (![0, 1].includes(diff.status) || diff.error) throw diff.error || new Error(diff.stderr || "Unable to generate candidate repository patch.");
  return String(diff.stdout || "")
    .replaceAll("a/before/", "a/")
    .replaceAll("b/after/", "b/")
    .replaceAll("a/before", "a")
    .replaceAll("b/after", "b");
}

export function createCandidateFromInputs({ root = pluginRoot, source, gitSource = source, requireHead = true, archive, pin: pinInput, createdAt = new Date().toISOString(), exec = execFileSync }) {
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
    if (!apply) return { mode: "verified", pin, files: vendor.inventory.length, transformed: vendor.changed.length };
    const skillTarget = join(root, "skills", "impeccable");
    const agentsTarget = join(root, "agents");
    if ((existsSync(skillTarget) || existsSync(agentsTarget)) && !replace) throw new Error("Vendored targets already exist. Re-run with --replace after reviewing the generated upstream change.");
    if (replace) {
      rmSync(skillTarget, { recursive: true, force: true });
      rmSync(agentsTarget, { recursive: true, force: true });
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

export async function prepareCandidate({ root = pluginRoot, tag, fetchImpl = globalThis.fetch, token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "" } = {}) {
  const parsed = parseSkillTag(tag);
  if (!parsed) throw new Error("--to must be a stable Impeccable skill tag.");
  const approved = readPin(root);
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
    const pin = validatePin({
      ...approved,
      version: parsed.version,
      tag,
      tagObject,
      commit,
      archive: { name: approved.archive.name, url: asset.browser_download_url, sha256: sha256File(archive) },
    });
    return createCandidateFromInputs({ root, source, gitSource: repository, requireHead: false, archive, pin });
  } finally {
    rmSync(networkWorkspace, { recursive: true, force: true });
  }
}
