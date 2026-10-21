#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse as parseJsonc } from "jsonc-parser";

export const RECEIPT_NAME = ".local-deploy.json";
export const HOSTS = ["cursor", "codex", "opencode"];
export const OPENCODE_SHARED_CONFIG_RULE = "OpenCode config (opencode.json, commands/) is shared with Workflow and Efficiency: merge only, always write a persistent backup before changing anything, touch only your own entries, rollback/uninstall removes only your own entries.";
const DEVELOPMENT_ROOTS = new Set([".agents", ".build", ".cursor", ".git", "node_modules", "test", "tests"]);
const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = dirname(dirname(scriptPath));

function slash(path) {
  return path.split(sep).join("/");
}

export function isInside(base, candidate) {
  const item = relative(resolve(base), resolve(candidate));
  return item === "" || (item !== ".." && !item.startsWith(`..${sep}`) && !item.startsWith(sep));
}

function manifestRelative(host) {
  if (host === "cursor") return ".cursor-plugin/plugin.json";
  if (host === "codex") return ".codex-plugin/plugin.json";
  if (host === "opencode") return ".opencode-plugin/plugin.json";
  throw new Error(`unsupported plugin host: ${host}`);
}

function repositoryCodexManifestPath(root) {
  const direct = join(root, ".codex-plugin", "plugin.json");
  return existsSync(direct) ? direct : join(root, "targets", "codex", ".codex-plugin", "plugin.json");
}

function walk(directory, base = directory) {
  const result = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(directory, entry.name);
    const relativePath = slash(relative(base, path));
    if (entry.isSymbolicLink()) throw new Error(`plugin bundle contains a symlink: ${relativePath}`);
    if (entry.isDirectory()) result.push(...walk(path, base));
    else if (entry.isFile()) result.push({ path, relativePath });
    else throw new Error(`plugin bundle contains a non-regular entry: ${relativePath}`);
  }
  return result;
}

function stableManifestBytes(path, baseVersion) {
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  manifest.version = baseVersion;
  return Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
}

export function contentHash(directory, { host, baseVersion }) {
  const root = resolve(directory);
  const manifestPath = manifestRelative(host);
  const digest = createHash("sha256");
  for (const entry of walk(root)) {
    if (entry.relativePath === RECEIPT_NAME) continue;
    const bytes = entry.relativePath === manifestPath
      ? stableManifestBytes(entry.path, baseVersion)
      : readFileSync(entry.path);
    const fileHash = createHash("sha256").update(bytes).digest("hex");
    digest.update(`${entry.relativePath}\0${fileHash}\n`);
  }
  return digest.digest("hex");
}

export function localVersion(baseVersion, host, hash) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(baseVersion)) throw new Error(`product version is not supported: ${baseVersion}`);
  if (!HOSTS.includes(host)) throw new Error(`unsupported plugin host: ${host}`);
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error("content hash must be a SHA-256 digest");
  return `${baseVersion}+local.${host}.${hash.slice(0, 12)}`;
}

export function deploymentReceipt({ plugin, host, baseVersion, hash, gitHead, gitDirty, sourceRoot, deployedAt }) {
  return {
    schema: 1,
    plugin,
    host,
    product_version: baseVersion,
    local_version: localVersion(baseVersion, host, hash),
    content_sha256: hash,
    git_head: gitHead,
    git_dirty: Boolean(gitDirty),
    source_path: resolve(sourceRoot),
    deployed_at: deployedAt,
  };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function copyTree(source, destination) {
  const sourceRoot = resolve(source);
  mkdirSync(destination, { recursive: true });
  for (const entry of walk(sourceRoot)) {
    const output = resolve(destination, entry.relativePath);
    if (!isInside(destination, output)) throw new Error(`copy destination escapes bundle root: ${entry.relativePath}`);
    mkdirSync(dirname(output), { recursive: true });
    copyFileSync(entry.path, output);
    chmodSync(output, statSync(entry.path).mode & 0o777);
  }
}

export function validateBundle(directory, { plugin, host, allowedVersions }) {
  const root = resolve(directory);
  const rootStat = lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error(`plugin bundle must be a physical directory: ${root}`);
  for (const name of readdirSync(root)) {
    if (DEVELOPMENT_ROOTS.has(name)) throw new Error(`development surface is not deployable: ${name}`);
  }
  walk(root);
  const manifestPath = join(root, manifestRelative(host));
  if (!existsSync(manifestPath)) throw new Error(`${host} target is missing ${manifestRelative(host)}`);
  const manifest = readJson(manifestPath);
  if (manifest.name !== plugin) throw new Error(`unexpected ${host} plugin manifest: ${manifest.name || "<missing>"}`);
  if (allowedVersions && !allowedVersions.includes(manifest.version)) {
    throw new Error(`unexpected ${host} plugin version: ${manifest.version || "<missing>"}`);
  }
  return manifest;
}

function patchStagedBundle(directory, metadata) {
  const manifestPath = join(directory, manifestRelative(metadata.host));
  const manifest = readJson(manifestPath);
  manifest.version = metadata.localVersion;
  writeJson(manifestPath, manifest);
  writeJson(join(directory, RECEIPT_NAME), metadata.receipt);
  validateBundle(directory, {
    plugin: metadata.plugin,
    host: metadata.host,
    allowedVersions: [metadata.localVersion],
  });
  const verifiedHash = contentHash(directory, { host: metadata.host, baseVersion: metadata.baseVersion });
  if (verifiedHash !== metadata.hash) throw new Error(`${metadata.host} staged content hash changed during versioning`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env || process.env,
    encoding: "utf8",
    stdio: options.inherit ? "inherit" : ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
    throw new Error(`${command} ${args.join(" ")} failed (${result.status})${detail ? `: ${detail}` : ""}`);
  }
  return result.stdout || "";
}

function runJson(command, args, options = {}) {
  const stdout = run(command, args, options);
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`${command} ${args.join(" ")} did not return JSON: ${error.message}`);
  }
}

export function repositoryState(root = repositoryRoot) {
  const gitHead = run("git", ["rev-parse", "HEAD"], { cwd: root }).trim();
  const gitDirty = run("git", ["status", "--porcelain", "--untracked-files=normal"], { cwd: root }).trim().length > 0;
  return { gitHead, gitDirty };
}

export function deploymentPaths(home, plugin) {
  const resolvedHome = resolve(home);
  return {
    home: resolvedHome,
    cursor: join(resolvedHome, ".cursor", "plugins", "local", plugin),
    codex: join(resolvedHome, ".codex", "plugins", plugin),
    codexHome: join(resolvedHome, ".codex"),
    marketplace: join(resolvedHome, ".agents", "plugins", "marketplace.json"),
    marketplaceSource: `./.codex/plugins/${plugin}`,
    opencode: join(resolvedHome, ".config", "opencode", plugin),
    opencodeConfig: join(resolvedHome, ".config", "opencode", "opencode.json"),
    opencodeConfigComments: join(resolvedHome, ".config", "opencode", "opencode.jsonc"),
    opencodeCommands: join(resolvedHome, ".config", "opencode", "commands"),
    opencodeBackups: join(resolvedHome, ".config", "opencode", ".local-deploy-backups", plugin),
  };
}

function assertOpenCodeConfigDirectory(home, env) {
  const supported = resolve(home, ".config", "opencode");
  const configured = resolve(env.OPENCODE_CONFIG_DIR ?? join(env.XDG_CONFIG_HOME || join(resolve(home), ".config"), "opencode"));
  if (configured !== supported) {
    const variable = env.OPENCODE_CONFIG_DIR !== undefined ? "OPENCODE_CONFIG_DIR" : "XDG_CONFIG_HOME";
    throw new Error(`unsupported OpenCode configuration directory from ${variable}: ${configured}; local deployment supports ${supported}`);
  }
}

function expandOpenCodePath(entry, home) {
  const text = String(entry).replaceAll("\\", "/");
  if (text.startsWith("~/")) return slash(resolve(home, text.slice(2)));
  return slash(resolve(text));
}

export function openCodeSkillsPath(home, plugin) {
  return slash(resolve(deploymentPaths(home, plugin).opencode, "skills"));
}

export function openCodeSkillRegistered(document, skillsPath, home) {
  return Array.isArray(document?.skills) && document.skills.some((entry) => typeof entry === "string" && expandOpenCodePath(entry, home) === skillsPath);
}

export function updateOpenCodeDocument(document, skillsPath, home = undefined) {
  if (document !== null && (typeof document !== "object" || Array.isArray(document))) {
    throw new Error("OpenCode config must be a JSON object");
  }
  const next = document === null ? { $schema: "https://opencode.ai/config.json" } : structuredClone(document);
  if (next.skills === undefined) next.skills = [];
  if (!Array.isArray(next.skills) || next.skills.some((entry) => typeof entry !== "string")) {
    throw new Error("OpenCode skills entries must be strings");
  }
  const present = next.skills.some((entry) => entry === skillsPath || (home !== undefined && expandOpenCodePath(entry, home) === skillsPath));
  if (!present) next.skills = [...next.skills, skillsPath];
  return next;
}

function designCommand(name, text) {
  return text.includes(`Load the \`${name.slice(0, -3)}\` skill and apply it to the current request.`);
}

function openCodeCommandPlan(packageRoot, commandsDir) {
  const sourceDir = join(packageRoot, "commands");
  if (!existsSync(sourceDir)) throw new Error("OpenCode package is missing commands");
  const names = readdirSync(sourceDir).filter((name) => name.endsWith(".md")).sort();
  if (names.length === 0) throw new Error("OpenCode package is missing commands");
  const files = names.map((name) => {
    const source = readFileSync(join(sourceDir, name), "utf8");
    const destination = join(commandsDir, name);
    if (lstatExists(destination)) {
      const stat = lstatSync(destination);
      if (stat.isSymbolicLink()) throw new Error(`OpenCode command is a symlink: ${destination}`);
      if (!stat.isFile()) throw new Error(`OpenCode command is not a file: ${destination}`);
    }
    const current = lstatExists(destination) ? readFileSync(destination, "utf8") : null;
    if (current !== null && current !== source && !designCommand(name, current)) {
      throw new Error(`OpenCode command ${name} already exists and is not a Design command. ${OPENCODE_SHARED_CONFIG_RULE}`);
    }
    return { name, destination, source, current, change: current !== source };
  });
  return { files, change: files.some((file) => file.change) };
}

function readOpenCodeConfigFiles(paths) {
  for (const path of [paths.opencodeConfig, paths.opencodeConfigComments]) {
    if (lstatExists(path) && lstatSync(path).isSymbolicLink()) throw new Error(`OpenCode config escaped through a symlink: ${path}`);
  }
  const jsonPresent = lstatExists(paths.opencodeConfig);
  const original = jsonPresent ? readFileSync(paths.opencodeConfig) : null;
  const json = original === null ? null : JSON.parse(original.toString("utf8"));
  let jsonc = null;
  if (lstatExists(paths.opencodeConfigComments)) {
    const errors = [];
    jsonc = parseJsonc(readFileSync(paths.opencodeConfigComments, "utf8"), errors, { allowTrailingComma: true });
    if (errors.length) throw new Error(`invalid OpenCode JSONC: ${paths.opencodeConfigComments}`);
    if (jsonc === null || typeof jsonc !== "object" || Array.isArray(jsonc)) throw new Error(`OpenCode config must be a JSON object: ${paths.opencodeConfigComments}`);
  }
  return { json, jsonc, original };
}

function openCodeConfigPlan(paths, home) {
  const skillsPath = openCodeSkillsPath(home, basename(paths.opencode));
  const { json, jsonc, original } = readOpenCodeConfigFiles(paths);
  const registered = openCodeSkillRegistered(json, skillsPath, home) || openCodeSkillRegistered(jsonc, skillsPath, home);
  const bytes = registered ? null : Buffer.from(`${JSON.stringify(updateOpenCodeDocument(json, skillsPath, home), null, 2)}\n`);
  return { skillsPath, registered, bytes, original };
}

function openCodeBackupFiles(paths, config, commands) {
  const files = [];
  if (!config.registered) {
    files.push({
      kind: "opencode-config",
      path: paths.opencodeConfig,
      existed: config.original !== null,
      bytes: config.original,
      backup: "opencode.json",
    });
  }
  for (const file of commands.files.filter((item) => item.change)) {
    files.push({
      kind: "opencode-command",
      path: file.destination,
      existed: file.current !== null,
      bytes: file.current === null ? null : readFileSync(file.destination),
      backup: `commands/${file.name}`,
    });
  }
  return files;
}

function assertOpenCodePath(path, home) {
  assertDestination(path, path, home);
}

function backupStamp(createdAt) {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) throw new Error("OpenCode backup timestamp is invalid");
  return `${date.toISOString().replaceAll(":", "-")}-${randomUUID()}`;
}

function safeBackupName(name) {
  if (typeof name !== "string" || name === "" || name.startsWith("/") || name.startsWith("\\") || name.split(/[\\/]/).includes("..")) {
    throw new Error(`OpenCode backup name is not safe: ${name}`);
  }
  return name;
}

function writeOpenCodeBackup({ home, plugin, root, createdAt, reason, files }) {
  assertOpenCodePath(join(root, "manifest.json"), home);
  mkdirSync(root, { recursive: true });
  const rootStat = lstatSync(root);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new Error(`OpenCode backup directory is not a physical directory: ${root}`);
  const directory = join(root, backupStamp(createdAt));
  if (lstatExists(directory)) throw new Error(`OpenCode backup already exists: ${directory}`);
  const stage = mkdtempSync(join(root, ".staging-"));
  try {
    const manifestFiles = [];
    for (const file of files) {
      const backup = safeBackupName(file.backup);
      const target = resolve(stage, backup);
      if (!isInside(stage, target)) throw new Error(`OpenCode backup escapes its directory: ${backup}`);
      assertOpenCodePath(file.path, home);
      if (file.existed) {
        if (file.bytes === null || file.bytes === undefined) throw new Error(`OpenCode backup is missing bytes for ${file.path}`);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, file.bytes);
      }
      manifestFiles.push({ kind: file.kind, path: file.path, existed: Boolean(file.existed), backup: file.existed ? backup : null });
    }
    writeJson(join(stage, "manifest.json"), {
      schema: 1,
      plugin,
      created_at: new Date(createdAt).toISOString(),
      reason,
      files: manifestFiles,
    });
    renameSync(stage, directory);
    return directory;
  } catch (error) {
    rmSync(stage, { recursive: true, force: true });
    throw error;
  }
}

function restoreOpenCodeBackup(directory, { plugin, home }) {
  const manifest = readJson(join(directory, "manifest.json"));
  if (manifest?.schema !== 1 || manifest.plugin !== plugin || !Array.isArray(manifest.files)) {
    throw new Error(`OpenCode backup is not usable: ${directory}`);
  }
  const configPath = join(resolve(home), ".config", "opencode", "opencode.json");
  const commandsRoot = join(resolve(home), ".config", "opencode", "commands");
  for (const file of manifest.files) {
    const target = resolve(file.path);
    if (target !== configPath && !isInside(commandsRoot, target)) throw new Error(`OpenCode backup restore target is outside the shared config: ${file.path}`);
    assertOpenCodePath(target, home);
    if (lstatExists(target) && lstatSync(target).isSymbolicLink()) throw new Error(`OpenCode restore target is a symlink: ${target}`);
    if (file.existed) {
      const backup = safeBackupName(file.backup);
      const source = resolve(directory, backup);
      if (!isInside(directory, source) || !lstatExists(source) || !lstatSync(source).isFile() || lstatSync(source).isSymbolicLink()) {
        throw new Error(`OpenCode backup file is missing: ${file.backup}`);
      }
      atomicWrite(target, readFileSync(source));
    } else if (lstatExists(target)) {
      rmSync(target, { force: true });
    }
  }
}

function ownedOpenCodeCommands(packageRoot, plugin) {
  if (!lstatExists(packageRoot)) return { present: false, names: [] };
  const stat = lstatSync(packageRoot);
  if (stat.isSymbolicLink()) throw new Error(`OpenCode package is a symlink: ${packageRoot}`);
  if (!stat.isDirectory()) throw new Error(`OpenCode package is not a directory: ${packageRoot}`);
  const manifestPath = join(packageRoot, ".opencode-plugin", "plugin.json");
  if (!existsSync(manifestPath)) throw new Error(`OpenCode package has no plugin manifest: ${packageRoot}`);
  const manifest = readJson(manifestPath);
  if (manifest.name !== plugin) throw new Error(`OpenCode package belongs to ${manifest.name || "<unknown>"}`);
  const sourceDir = join(packageRoot, "commands");
  if (!lstatExists(sourceDir)) return { present: true, names: [] };
  const commandStat = lstatSync(sourceDir);
  if (commandStat.isSymbolicLink() || !commandStat.isDirectory()) throw new Error(`OpenCode package commands are not a directory: ${sourceDir}`);
  const names = readdirSync(sourceDir).filter((name) => name.endsWith(".md")).sort();
  for (const name of names) {
    if (basename(name) !== name || name.includes("..")) throw new Error(`OpenCode command name is not safe: ${name}`);
  }
  return { present: true, names };
}

function planOpenCodeRemoval(paths, home, plugin, commandNames) {
  const skillsPath = openCodeSkillsPath(home, plugin);
  const { json, jsonc, original } = readOpenCodeConfigFiles(paths);
  const removed = [];
  let nextBytes = null;
  if (json !== null) {
    if (typeof json !== "object" || Array.isArray(json)) throw new Error("OpenCode config must be a JSON object");
    if (json.skills !== undefined && (!Array.isArray(json.skills) || json.skills.some((entry) => typeof entry !== "string"))) {
      throw new Error("OpenCode skills entries must be strings");
    }
    if (Array.isArray(json.skills)) {
      const skills = json.skills.filter((entry) => {
        const match = entry === skillsPath || expandOpenCodePath(entry, home) === skillsPath;
        if (match) removed.push(entry);
        return !match;
      });
      if (removed.length) {
        const next = structuredClone(json);
        next.skills = skills;
        nextBytes = Buffer.from(`${JSON.stringify(next, null, 2)}\n`);
      }
    }
  }
  const commands = [];
  for (const name of commandNames) {
    const destination = join(paths.opencodeCommands, name);
    if (!lstatExists(destination)) continue;
    const stat = lstatSync(destination);
    if (stat.isSymbolicLink()) throw new Error(`OpenCode command is a symlink: ${destination}`);
    if (!stat.isFile()) throw new Error(`OpenCode command is not a file: ${destination}`);
    if (!designCommand(name, readFileSync(destination, "utf8"))) continue;
    commands.push({ name, destination, bytes: readFileSync(destination) });
  }
  return { skillsPath, removed, nextBytes, original, commands, jsoncRegistered: openCodeSkillRegistered(jsonc, skillsPath, home), configChange: nextBytes !== null };
}

export function uninstallOpenCodeDeployment({ plugin, home, env = process.env, deployedAt = new Date().toISOString() } = {}) {
  if (!plugin || typeof plugin !== "string") throw new Error("OpenCode uninstall requires a plugin name");
  assertOpenCodeConfigDirectory(home, env);
  const paths = deploymentPaths(home, plugin);
  assertOpenCodePath(paths.opencodeConfig, paths.home);
  assertOpenCodePath(join(paths.opencodeCommands, "command.md"), paths.home);
  assertOpenCodePath(join(paths.opencodeBackups, "manifest.json"), paths.home);
  const owned = ownedOpenCodeCommands(paths.opencode, plugin);
  const plan = planOpenCodeRemoval(paths, paths.home, plugin, owned.names);
  const files = [];
  if (plan.configChange) {
    files.push({ kind: "opencode-config", path: paths.opencodeConfig, existed: true, bytes: plan.original, backup: "opencode.json" });
  }
  for (const file of plan.commands) {
    files.push({ kind: "opencode-command", path: file.destination, existed: true, bytes: file.bytes, backup: `commands/${file.name}` });
  }
  const result = {
    plugin,
    no_op: false,
    backup: null,
    opencode: {
      config: paths.opencodeConfig,
      skills: plan.skillsPath,
      skills_removed: plan.removed,
      commands_removed: plan.commands.map((file) => file.name),
      package_removed: owned.present,
      jsonc_registered: plan.jsoncRegistered,
      backup_root: paths.opencodeBackups,
      backup: null,
      rule: OPENCODE_SHARED_CONFIG_RULE,
    },
  };
  if (!files.length && !owned.present) return { ...result, no_op: true };
  const backup = files.length
    ? writeOpenCodeBackup({ home: paths.home, plugin, root: paths.opencodeBackups, createdAt: deployedAt, reason: "uninstall", files })
    : null;
  try {
    if (plan.configChange) atomicWrite(paths.opencodeConfig, plan.nextBytes);
    for (const file of plan.commands) rmSync(file.destination, { force: true });
    if (owned.present) rmSync(paths.opencode, { recursive: true, force: true });
    result.backup = backup;
    result.opencode.backup = backup;
    return result;
  } catch (error) {
    if (backup) restoreOpenCodeBackup(backup, { plugin, home: paths.home });
    throw new Error(`OpenCode uninstall rolled back: ${error.message}`, { cause: error });
  }
}

function assertDestination(path, expected, home) {
  if (resolve(path) !== resolve(expected)) throw new Error(`deployment target differs from the canonical path: ${path}`);
  const root = resolve(home);
  if (!isInside(root, path)) throw new Error(`deployment target is outside the selected home: ${path}`);
  let cursor = root;
  for (const part of relative(root, dirname(path)).split(sep).filter(Boolean)) {
    cursor = join(cursor, part);
    if (!lstatExists(cursor)) break;
    if (lstatSync(cursor).isSymbolicLink()) throw new Error(`deployment parent escaped through a symlink: ${cursor}`);
  }
}

function existingBundle(path, identity) {
  if (!existsSync(path) && !lstatExists(path)) return null;
  const stat = lstatSync(path);
  let target = path;
  if (stat.isSymbolicLink()) {
    target = realpathSync(path);
    if (!lstatSync(target).isDirectory()) throw new Error(`existing plugin symlink is not a directory: ${path}`);
  } else if (!stat.isDirectory()) {
    throw new Error(`existing plugin target is not a directory: ${path}`);
  }
  const manifest = validateExistingBundle(target, identity);
  return { path, target, manifest, symbolicLink: stat.isSymbolicLink(), link: stat.isSymbolicLink() ? readlinkSync(path) : null };
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

function assertPhysicalContainedDirectory(anchor, candidate, label) {
  const root = resolve(anchor);
  const target = resolve(candidate);
  if (!lstatExists(target)) return;
  if (!lstatExists(root)) throw new Error(`${label} exists without its declared root: ${target}`);
  const rootStat = lstatSync(root);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new Error(`${label} root must be a physical directory: ${root}`);
  let cursor = root;
  for (const part of relative(root, target).split(sep).filter(Boolean)) {
    cursor = join(cursor, part);
    if (!lstatExists(cursor)) break;
    const stat = lstatSync(cursor);
    if (stat.isSymbolicLink()) throw new Error(`${label} crosses a symlink: ${cursor}`);
  }
  if (!lstatSync(target).isDirectory()) throw new Error(`${label} must be a physical directory: ${target}`);
  if (!isInside(realpathSync(root), realpathSync(target))) throw new Error(`${label} escapes its canonical root: ${target}`);
}

function validateExistingBundle(directory, { plugin, host }) {
  const manifestPath = join(directory, manifestRelative(host));
  if (!existsSync(manifestPath)) throw new Error(`existing ${host} target has no plugin manifest: ${directory}`);
  const manifest = readJson(manifestPath);
  if (manifest.name !== plugin) throw new Error(`existing ${host} target belongs to ${manifest.name || "<unknown>"}`);
  return manifest;
}

export function updateMarketplaceDocument(document, plugin, sourcePath) {
  if (document === null) {
    document = {
      name: "personal",
      interface: { displayName: "Personal" },
      plugins: [],
    };
  }
  if (document?.name !== "personal" || !Array.isArray(document.plugins)) {
    throw new Error("personal Marketplace must be named personal and expose a plugins array");
  }
  const matches = document.plugins.filter((entry) => entry?.name === plugin);
  if (matches.length > 1) throw new Error(`personal Marketplace contains duplicate ${plugin} entries`);
  if (matches.length === 0) {
    document.plugins.push({
      name: plugin,
      source: { source: "local", path: sourcePath },
      policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
      category: "Developer Tools",
    });
    return document;
  }
  const entry = matches[0];
  if (entry.source?.source !== "local") throw new Error(`${plugin} Marketplace entry is not a local source`);
  entry.source.path = sourcePath;
  return document;
}

function atomicWrite(path, bytes, { simulateFailure } = {}) {
  let temp = null;
  try {
    mkdirSync(dirname(path), { recursive: true });
    temp = join(dirname(path), `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
    writeFileSync(temp, bytes);
    if (simulateFailure === "during-marketplace-write") throw new Error("simulated Marketplace write failure");
    if (simulateFailure === "during-marketplace-rename") throw new Error("simulated Marketplace rename failure");
    renameSync(temp, path);
  } catch (error) {
    try {
      if (temp && lstatExists(temp)) rmSync(temp, { force: true });
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        `atomic Marketplace write failed and temporary cleanup was incomplete: ${error.message}; cleanup failure: ${cleanupError.message}`,
        { cause: error },
      );
    }
    throw error;
  }
}

function readReceipt(path) {
  try {
    return readJson(join(path, RECEIPT_NAME));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function currentTarget(path, expected) {
  const existing = existingBundle(path, expected);
  if (!existing || existing.symbolicLink) return { current: false, receipt: null, manifest: existing?.manifest || null };
  const receipt = readReceipt(path);
  if (!receipt) return { current: false, receipt: null, manifest: existing.manifest };
  let hash;
  try {
    hash = contentHash(path, { host: expected.host, baseVersion: expected.baseVersion });
  } catch {
    return { current: false, receipt, manifest: existing.manifest };
  }
  const current = receipt.plugin === expected.plugin
    && receipt.host === expected.host
    && receipt.product_version === expected.baseVersion
    && receipt.local_version === expected.localVersion
    && receipt.content_sha256 === expected.hash
    && existing.manifest.version === expected.localVersion
    && hash === expected.hash;
  return { current, receipt, manifest: existing.manifest };
}

function hookHash(path) {
  const hooks = join(path, "hooks");
  if (!existsSync(hooks)) return null;
  const digest = createHash("sha256");
  for (const entry of walk(hooks)) digest.update(`${entry.relativePath}\0${createHash("sha256").update(readFileSync(entry.path)).digest("hex")}\n`);
  return digest.digest("hex");
}

function stageTarget(source, destination, metadata, { simulateFailure } = {}) {
  mkdirSync(dirname(destination), { recursive: true });
  const stageRoot = mkdtempSync(join(dirname(destination), `.${metadata.plugin}.${metadata.host}.deploy-`));
  const payload = join(stageRoot, "payload");
  try {
    copyTree(source, payload);
    if (simulateFailure === `during-${metadata.host}-stage-copy`) throw new Error(`simulated ${metadata.host} stage copy failure`);
    patchStagedBundle(payload, metadata);
    if (simulateFailure === `during-${metadata.host}-stage-patch`) throw new Error(`simulated ${metadata.host} stage patch failure`);
    return { stageRoot, payload };
  } catch (error) {
    try {
      if (lstatExists(stageRoot)) rmSync(stageRoot, { recursive: true, force: true });
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        `${metadata.host} staging failed and temporary cleanup was incomplete: ${error.message}; cleanup failure: ${cleanupError.message}`,
        { cause: error },
      );
    }
    throw error;
  }
}

function backupPath(destination) {
  return join(dirname(destination), `.${basename(destination)}.backup-${process.pid}-${randomUUID()}`);
}

function cachePath(codexHome, plugin, version) {
  return join(codexHome, "plugins", "cache", "personal", plugin, version);
}

export function codexInstallationState({ home, plugin, version, codexBinary = "codex", env = process.env }) {
  const snapshot = codexPluginSnapshot({ home, plugin, codexBinary, env });
  const expectedCache = cachePath(snapshot.codexHome, plugin, version);
  let expectedCacheManifest = null;
  try {
    expectedCacheManifest = readJson(join(expectedCache, ".codex-plugin", "plugin.json"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const expectedSource = join(resolve(home), ".codex", "plugins", plugin);
  const current = snapshot.installed?.version === version
    && resolve(snapshot.installed?.source?.path || "/") === expectedSource
    && expectedCacheManifest?.name === plugin
    && expectedCacheManifest?.version === version;
  return { ...snapshot, current, cachePath: expectedCache, cacheManifest: expectedCacheManifest };
}

export function codexPluginSnapshot({ home, plugin, codexBinary = "codex", env = process.env }) {
  let list;
  try {
    list = runJson(codexBinary, ["plugin", "list", "--json"], { env: { ...env, HOME: home } });
  } catch (error) {
    return { current: false, error: error.message, installed: null, installedCachePath: null, installedCacheManifest: null, codexHome: resolve(env.CODEX_HOME || join(home, ".codex")) };
  }
  const installed = list.installed?.find((entry) => entry.pluginId === `${plugin}@personal`) || null;
  const codexHome = resolve(env.CODEX_HOME || join(home, ".codex"));
  const installedCachePath = installed?.version ? cachePath(codexHome, plugin, installed.version) : null;
  let installedCacheManifest = null;
  if (installedCachePath) {
    try {
      installedCacheManifest = readJson(join(installedCachePath, ".codex-plugin", "plugin.json"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return { current: false, installed, installedCachePath, installedCacheManifest, codexHome };
}

function installCodexDefault({ home, plugin, version, codexBinary, env }) {
  run(codexBinary, ["plugin", "add", `${plugin}@personal`, "--json"], { env: { ...env, HOME: home } });
  const state = codexInstallationState({ home, plugin, version, codexBinary, env });
  if (!state.current) throw new Error(`Codex did not activate ${plugin} ${version} from its canonical source/cache`);
  return state;
}

function assertPluginCachePath(codexHome, plugin, version, path) {
  const root = resolve(codexHome);
  const expected = cachePath(root, plugin, version);
  if (resolve(path) !== expected || !isInside(root, expected)) throw new Error(`Codex cache path is outside the plugin-specific cache boundary: ${path}`);
  assertPhysicalContainedDirectory(root, expected, "Codex plugin cache");
  return expected;
}

function defaultCodexLifecycle({ codexBinary = "codex", env = process.env } = {}) {
  return {
    snapshot: ({ home, plugin, version }) => codexInstallationState({ home, plugin, version, codexBinary, env }),
    install: (options) => installCodexDefault({ ...options, codexBinary, env }),
    remove({ home, plugin, version, cache }) {
      let safeCache = assertPluginCachePath(resolve(env.CODEX_HOME || join(home, ".codex")), plugin, version, cache);
      const before = codexPluginSnapshot({ home, plugin, codexBinary, env });
      if (before.error) throw new Error(before.error);
      if (before.installed) run(codexBinary, ["plugin", "remove", `${plugin}@personal`, "--json"], { env: { ...env, HOME: home } });
      const codexHome = resolve(env.CODEX_HOME || join(home, ".codex"));
      safeCache = assertPluginCachePath(codexHome, plugin, version, safeCache);
      if (lstatExists(safeCache)) rmSync(safeCache, { recursive: true, force: true });
    },
    restore({ home, plugin, before }) {
      if (!before.installed) return;
      run(codexBinary, ["plugin", "add", `${plugin}@personal`, "--json"], { env: { ...env, HOME: home } });
    },
    verify({ home, plugin, version, source, cache, before = null }) {
      if (before === null) {
        const state = codexInstallationState({ home, plugin, version, codexBinary, env });
        if (!state.current) throw new Error(`Codex did not activate ${plugin} ${version} from its canonical source/cache`);
        return state;
      }
      const state = codexPluginSnapshot({ home, plugin, codexBinary, env });
      if (state.error) throw new Error(state.error);
      if (!before.installed) {
        if (state.installed) throw new Error(`Codex rollback left ${plugin}@personal installed`);
        assertPluginCachePath(state.codexHome, plugin, version, cache);
        if (lstatExists(cache)) throw new Error(`Codex rollback left the new ${plugin} cache behind`);
        return state;
      }
      const expectedSource = resolve(before.installed.source?.path || source);
      if (state.installed?.pluginId !== before.installed.pluginId
        || state.installed?.marketplaceName !== before.installed.marketplaceName
        || state.installed?.version !== before.installed.version
        || state.installed?.enabled !== before.installed.enabled
        || state.installed?.source?.source !== before.installed.source?.source
        || resolve(state.installed?.source?.path || "/") !== expectedSource
        || state.installedCacheManifest?.name !== plugin
        || state.installedCacheManifest?.version !== before.installed.version) {
        throw new Error(`Codex rollback did not restore ${plugin}@personal ${before.installed.version} and its cache manifest`);
      }
      return state;
    },
  };
}

export function prepareMetadata({ root, plugin, baseVersion, gitHead, gitDirty, deployedAt = new Date().toISOString() }) {
  const targets = {};
  for (const host of HOSTS) {
    const path = join(root, ".build", "plugins", host, plugin);
    validateBundle(path, { plugin, host, allowedVersions: [baseVersion] });
    const hash = contentHash(path, { host, baseVersion });
    const version = localVersion(baseVersion, host, hash);
    targets[host] = {
      plugin,
      host,
      path,
      baseVersion,
      hash,
      localVersion: version,
      receipt: deploymentReceipt({
        plugin,
        host,
        baseVersion,
        hash,
        gitHead,
        gitDirty,
        sourceRoot: root,
        deployedAt,
      }),
    };
  }
  return targets;
}

export function deployPreparedTargets({
  root,
  plugin,
  baseVersion,
  home,
  gitHead,
  gitDirty,
  dryRun = false,
  deployedAt,
  codexBinary = "codex",
  env = process.env,
  codexLifecycle = defaultCodexLifecycle({ codexBinary, env }),
  hosts = HOSTS,
  simulateFailure,
}) {
  const selectedHosts = [...new Set(hosts)];
  if (selectedHosts.length === 0 || selectedHosts.some((host) => !HOSTS.includes(host))) {
    throw new Error(`deployment hosts must be one or more of: ${HOSTS.join(", ")}`);
  }
  if (selectedHosts.includes("opencode")) assertOpenCodeConfigDirectory(home, env);
  const paths = deploymentPaths(home, plugin);
  for (const host of selectedHosts) assertDestination(paths[host], paths[host], paths.home);
  const metadata = prepareMetadata({ root, plugin, baseVersion, gitHead, gitDirty, deployedAt });
  const existing = Object.fromEntries(selectedHosts.map((host) => [host, currentTarget(paths[host], metadata[host])]));
  let marketplaceOriginal = null;
  let marketplaceBytes = null;
  let marketplaceChanged = false;
  let codexBefore = { current: true, skipped: true };
  let opencodeConfig = null;
  let opencodeCommands = null;
  if (selectedHosts.includes("opencode")) {
    assertDestination(paths.opencodeConfig, paths.opencodeConfig, paths.home);
    assertDestination(join(paths.opencodeCommands, "command.md"), join(paths.opencodeCommands, "command.md"), paths.home);
    opencodeConfig = openCodeConfigPlan(paths, home);
    opencodeCommands = openCodeCommandPlan(metadata.opencode.path, paths.opencodeCommands);
  }
  if (selectedHosts.includes("codex")) {
    marketplaceOriginal = lstatExists(paths.marketplace) ? readFileSync(paths.marketplace) : null;
    const marketplace = updateMarketplaceDocument(marketplaceOriginal ? JSON.parse(marketplaceOriginal) : null, plugin, paths.marketplaceSource);
    marketplaceBytes = Buffer.from(`${JSON.stringify(marketplace, null, 2)}\n`);
    marketplaceChanged = marketplaceOriginal === null || !marketplaceOriginal.equals(marketplaceBytes);
    codexBefore = codexLifecycle.snapshot({ home, plugin, version: metadata.codex.localVersion, source: paths.codex, codexBinary, env });
    if (codexBefore?.error) throw new Error(`Codex state snapshot failed before deployment: ${codexBefore.error}`);
  }
  const changedHosts = selectedHosts.filter((host) => !existing[host].current);
  const hooksChanged = Object.fromEntries(selectedHosts.map((host) => {
    const oldBundle = existingBundle(paths[host], { plugin, host });
    const oldHash = oldBundle ? hookHash(oldBundle.target) : null;
    return [host, oldHash !== hookHash(metadata[host].path)];
  }));
  const plan = {
    plugin,
    source_path: resolve(root),
    product_version: baseVersion,
    git_head: gitHead,
    git_dirty: Boolean(gitDirty),
    dry_run: Boolean(dryRun),
    selected_hosts: selectedHosts,
    targets: Object.fromEntries(selectedHosts.map((host) => [host, {
      destination: paths[host],
      local_version: metadata[host].localVersion,
      content_sha256: metadata[host].hash,
      change: changedHosts.includes(host),
      hooks_changed: hooksChanged[host],
    }])),
    marketplace: selectedHosts.includes("codex")
      ? { path: paths.marketplace, source: paths.marketplaceSource, change: marketplaceChanged }
      : null,
    codex: selectedHosts.includes("codex")
      ? { change: !codexBefore.current, cache_path: cachePath(resolve(env.CODEX_HOME || paths.codexHome), plugin, metadata.codex.localVersion) }
      : null,
    opencode: selectedHosts.includes("opencode")
      ? {
        config: paths.opencodeConfig,
        skills: opencodeConfig.skillsPath,
        config_change: !opencodeConfig.registered,
        commands: paths.opencodeCommands,
        command_change: opencodeCommands.change,
        backup_root: paths.opencodeBackups,
        backup: null,
        rule: OPENCODE_SHARED_CONFIG_RULE,
      }
      : null,
  };
  if (dryRun) return plan;
  const codexCurrent = !selectedHosts.includes("codex") || (!marketplaceChanged && codexBefore.current);
  const opencodeCurrent = !selectedHosts.includes("opencode") || (opencodeConfig.registered && !opencodeCommands.change);
  if (changedHosts.length === 0 && codexCurrent && opencodeCurrent) return { ...plan, no_op: true };

  const staged = {};
  const swapped = [];
  let marketplaceWritten = false;
  let opencodeBackup = null;
  let codexActivationAttempted = false;
  let deploymentResult = null;
  try {
    for (const host of changedHosts) staged[host] = stageTarget(metadata[host].path, paths[host], metadata[host], { simulateFailure });
    if (simulateFailure === "after-stage") throw new Error("simulated failure after stage");
    for (const host of changedHosts) {
      const destination = paths[host];
      const previous = existingBundle(destination, { plugin, host });
      const backup = previous ? backupPath(destination) : null;
      if (backup) renameSync(destination, backup);
      try {
        renameSync(staged[host].payload, destination);
      } catch (error) {
        if (backup && !lstatExists(destination)) renameSync(backup, destination);
        throw error;
      }
      swapped.push({ host, destination, backup });
      if (simulateFailure === `after-${host}-swap`) throw new Error(`simulated failure after ${host} swap`);
    }
    if (selectedHosts.includes("codex") && marketplaceChanged) {
      atomicWrite(paths.marketplace, marketplaceBytes, { simulateFailure });
      marketplaceWritten = true;
    }
    if (simulateFailure === "after-marketplace") throw new Error("simulated failure after Marketplace update");
    if (selectedHosts.includes("opencode")) {
      const files = openCodeBackupFiles(paths, opencodeConfig, opencodeCommands);
      if (files.length) {
        opencodeBackup = writeOpenCodeBackup({
          home: paths.home,
          plugin,
          root: paths.opencodeBackups,
          createdAt: deployedAt || new Date().toISOString(),
          reason: "deploy",
          files,
        });
      }
      if (!opencodeConfig.registered) atomicWrite(paths.opencodeConfig, opencodeConfig.bytes);
    }
    if (simulateFailure === "after-opencode-config") throw new Error("simulated failure after OpenCode config update");
    if (selectedHosts.includes("opencode")) {
      mkdirSync(paths.opencodeCommands, { recursive: true });
      for (const file of opencodeCommands.files.filter((item) => item.change)) atomicWrite(file.destination, file.source);
    }
    if (simulateFailure === "after-opencode-commands") throw new Error("simulated failure after OpenCode command update");
    let codex = null;
    if (selectedHosts.includes("codex")) {
      codexActivationAttempted = true;
      codexLifecycle.install({
        home,
        plugin,
        version: metadata.codex.localVersion,
        codexBinary,
        env,
        source: paths.codex,
        cache: cachePath(resolve(env.CODEX_HOME || paths.codexHome), plugin, metadata.codex.localVersion),
      });
      codex = codexLifecycle.verify({
        home,
        plugin,
        version: metadata.codex.localVersion,
        source: paths.codex,
        cache: cachePath(resolve(env.CODEX_HOME || paths.codexHome), plugin, metadata.codex.localVersion),
      });
    }
    if (simulateFailure === "after-codex-add") throw new Error("simulated failure after Codex add");
    for (const item of swapped) {
      const state = currentTarget(item.destination, metadata[item.host]);
      if (!state.current) throw new Error(`${item.host} target failed post-swap verification`);
    }
    if (selectedHosts.includes("opencode")) {
      const config = openCodeConfigPlan(paths, home);
      const commands = openCodeCommandPlan(paths.opencode, paths.opencodeCommands);
      if (!config.registered || commands.change) throw new Error("OpenCode registration failed post-deploy verification");
    }
    deploymentResult = {
      ...plan,
      no_op: false,
      codex,
      opencode: plan.opencode ? { ...plan.opencode, backup: opencodeBackup } : null,
    };
  } catch (error) {
    const rollbackErrors = [];
    const newCache = cachePath(resolve(env.CODEX_HOME || paths.codexHome), plugin, metadata.codex.localVersion);
    if (codexActivationAttempted) {
      try {
        codexLifecycle.remove({ home, plugin, version: metadata.codex.localVersion, source: paths.codex, cache: newCache });
      } catch (rollbackError) {
        rollbackErrors.push(new Error(`Codex remove failed: ${rollbackError.message}`, { cause: rollbackError }));
      }
    }
    for (const item of [...swapped].reverse()) {
      try {
        if (lstatExists(item.destination)) rmSync(item.destination, { recursive: true, force: true });
        if (item.backup && lstatExists(item.backup)) renameSync(item.backup, item.destination);
      } catch (rollbackError) {
        rollbackErrors.push(new Error(`${item.host} source restore failed: ${rollbackError.message}`, { cause: rollbackError }));
      }
    }
    if (marketplaceWritten) {
      try {
        if (marketplaceOriginal === null) rmSync(paths.marketplace, { force: true });
        else atomicWrite(paths.marketplace, marketplaceOriginal);
      } catch (rollbackError) {
        rollbackErrors.push(new Error(`Marketplace restore failed: ${rollbackError.message}`, { cause: rollbackError }));
      }
    }
    if (opencodeBackup) {
      try {
        restoreOpenCodeBackup(opencodeBackup, { plugin, home: paths.home });
      } catch (rollbackError) {
        rollbackErrors.push(new Error(`OpenCode shared config restore failed: ${rollbackError.message}`, { cause: rollbackError }));
      }
    }
    if (codexActivationAttempted) {
      try {
        codexLifecycle.restore({ home, plugin, version: metadata.codex.localVersion, source: paths.codex, cache: newCache, before: codexBefore });
      } catch (rollbackError) {
        rollbackErrors.push(new Error(`Codex prior installation restore failed: ${rollbackError.message}`, { cause: rollbackError }));
      }
      try {
        codexLifecycle.verify({ home, plugin, version: metadata.codex.localVersion, source: paths.codex, cache: newCache, before: codexBefore });
      } catch (rollbackError) {
        rollbackErrors.push(new Error(`Codex rollback verification failed: ${rollbackError.message}`, { cause: rollbackError }));
      }
    }
    if (rollbackErrors.length > 0) {
      throw new AggregateError(
        [error, ...rollbackErrors],
        `local plugin deployment failed and rollback was incomplete: original failure: ${error.message}; rollback failures: ${rollbackErrors.map((item) => item.message).join("; ")}`,
        { cause: error },
      );
    }
    throw new Error(`local plugin deployment rolled back: ${error.message}`, { cause: error });
  } finally {
    for (const stage of Object.values(staged)) if (lstatExists(stage.stageRoot)) rmSync(stage.stageRoot, { recursive: true, force: true });
  }

  const backupCleanupErrors = [];
  for (const item of swapped) {
    if (!item.backup) continue;
    try {
      if (simulateFailure === `during-${item.host}-backup-cleanup`) throw new Error(`simulated ${item.host} backup cleanup failure`);
      rmSync(item.backup, { recursive: true, force: true });
    } catch (cleanupError) {
      backupCleanupErrors.push(new Error(`${item.host} backup cleanup failed: ${cleanupError.message}`, { cause: cleanupError }));
    }
  }
  if (backupCleanupErrors.length > 0) {
    throw new AggregateError(
      backupCleanupErrors,
      `local plugin deployment committed but backup cleanup was incomplete: ${backupCleanupErrors.map((item) => item.message).join("; ")}`,
    );
  }
  return deploymentResult;
}

async function expectedTargetMetadata(root, plugin, baseVersion) {
  let buildWorkspace = null;
  let builderModule = null;
  try {
    builderModule = await import(`${pathToFileURL(join(root, "scripts", "build-plugin-targets.mjs")).href}?status=${Date.now()}`);
    if (typeof builderModule.buildPluginTargets !== "function") throw new Error("target builder does not export buildPluginTargets");
    if (typeof builderModule.createTargetBuildWorkspace !== "function" || typeof builderModule.removeTargetBuildWorkspace !== "function") {
      throw new Error("target builder does not export its owned workspace helpers");
    }
    buildWorkspace = builderModule.createTargetBuildWorkspace();
    const result = builderModule.buildPluginTargets(buildWorkspace.targets);
    return Object.fromEntries(HOSTS.map((host) => {
      const path = result[host]?.path || join(buildWorkspace.targets, host, plugin);
      validateBundle(path, { plugin, host, allowedVersions: [baseVersion] });
      const hash = contentHash(path, { host, baseVersion });
      const commandDirectory = join(path, "commands");
      const commands = host === "opencode" && existsSync(commandDirectory)
        ? Object.fromEntries(readdirSync(commandDirectory).filter((name) => name.endsWith(".md")).sort().map((name) => [name, readFileSync(join(commandDirectory, name), "utf8")]))
        : null;
      return [host, { hash, localVersion: localVersion(baseVersion, host, hash), commands }];
    }));
  } finally {
    if (buildWorkspace) builderModule.removeTargetBuildWorkspace(buildWorkspace);
  }
}

export async function deploymentStatus({ root = repositoryRoot, home = process.env.LOCAL_PLUGIN_HOME || homedir(), codexBinary = process.env.CODEX_BIN || "codex", env = process.env, hosts = HOSTS } = {}) {
  const selectedHosts = [...new Set(hosts)];
  if (selectedHosts.length === 0 || selectedHosts.some((host) => !HOSTS.includes(host))) {
    throw new Error(`status hosts must be one or more of: ${HOSTS.join(", ")}`);
  }
  if (selectedHosts.includes("opencode")) assertOpenCodeConfigDirectory(home, env);
  const packageManifest = readJson(join(root, "package.json"));
  const cursorManifest = readJson(join(root, ".cursor-plugin", "plugin.json"));
  const plugin = cursorManifest.name;
  const baseVersion = packageManifest.version;
  const expected = await expectedTargetMetadata(root, plugin, baseVersion);
  const paths = deploymentPaths(home, plugin);
  const targets = {};
  for (const host of selectedHosts) {
    const current = currentTarget(paths[host], { plugin, host, baseVersion, ...expected[host] });
    targets[host] = {
      destination: paths[host],
      expected_version: expected[host].localVersion,
      installed_version: current.manifest?.version || null,
      current: current.current,
      receipt: current.receipt,
    };
  }
  let marketplaceCurrent = true;
  let codex = null;
  if (selectedHosts.includes("codex")) {
    const marketplace = lstatExists(paths.marketplace) ? readJson(paths.marketplace) : null;
    const entries = marketplace?.plugins?.filter((entry) => entry?.name === plugin) || [];
    marketplaceCurrent = entries.length === 1 && entries[0].source?.source === "local" && entries[0].source.path === paths.marketplaceSource;
    codex = codexInstallationState({ home, plugin, version: expected.codex.localVersion, codexBinary, env });
  }
  let opencode = null;
  if (selectedHosts.includes("opencode")) {
    const plan = openCodeConfigPlan(paths, home);
    const commandsCurrent = expected.opencode.commands && Object.entries(expected.opencode.commands).every(([name, text]) => {
      const destination = join(paths.opencodeCommands, name);
      return lstatExists(destination) && !lstatSync(destination).isSymbolicLink() && readFileSync(destination, "utf8") === text;
    });
    opencode = {
      config: paths.opencodeConfig,
      skills: plan.skillsPath,
      registered: plan.registered,
      commands_current: commandsCurrent,
      backup_root: paths.opencodeBackups,
      commands: paths.opencodeCommands,
      rule: OPENCODE_SHARED_CONFIG_RULE,
    };
  }
  return {
    plugin,
    source_path: resolve(root),
    product_version: baseVersion,
    git: repositoryState(root),
    selected_hosts: selectedHosts,
    targets,
    marketplace: selectedHosts.includes("codex")
      ? { path: paths.marketplace, expected_source: paths.marketplaceSource, current: marketplaceCurrent }
      : null,
    codex,
    opencode,
    current: selectedHosts.every((host) => targets[host].current)
      && (!selectedHosts.includes("codex") || (marketplaceCurrent && codex.current))
      && (!selectedHosts.includes("opencode") || (opencode.registered && opencode.commands_current)),
  };
}

function npmScript(name, root) {
  run("npm", ["run", name], { cwd: root, inherit: true });
}

function selectedHostsFromArguments(args) {
  const selected = [["--cursor-only", "cursor"], ["--codex-only", "codex"], ["--opencode-only", "opencode"]].filter(([flag]) => args.includes(flag));
  if (selected.length > 1) throw new Error("--cursor-only, --codex-only, and --opencode-only are mutually exclusive");
  if (selected.length === 1) return [selected[0][1]];
  return HOSTS;
}

function parseDeployArguments(args) {
  const supported = new Set(["--dry-run", "--full", "--cursor-only", "--codex-only", "--opencode-only"]);
  for (const arg of args) if (!supported.has(arg)) throw new Error(`unsupported deploy argument: ${arg}`);
  return { dryRun: args.includes("--dry-run"), full: args.includes("--full"), hosts: selectedHostsFromArguments(args) };
}

function parseStatusArguments(args) {
  const supported = new Set(["--cursor-only", "--codex-only", "--opencode-only"]);
  for (const arg of args) if (!supported.has(arg)) throw new Error(`unsupported status argument: ${arg}`);
  return selectedHostsFromArguments(args);
}

function parseUninstallArguments(args) {
  const supported = new Set(["--cursor-only", "--codex-only", "--opencode-only"]);
  for (const arg of args) if (!supported.has(arg)) throw new Error(`unsupported uninstall argument: ${arg}`);
  if (args.includes("--cursor-only") || args.includes("--codex-only")) {
    throw new Error("uninstall removes only this plugin's OpenCode config entries, commands, and package; use --opencode-only");
  }
  const hosts = selectedHostsFromArguments(args);
  return hosts.includes("opencode") ? ["opencode"] : hosts;
}

async function main() {
  const [command = "deploy", ...args] = process.argv.slice(2);
  const home = process.env.LOCAL_PLUGIN_HOME || homedir();
  const codexBinary = process.env.CODEX_BIN || "codex";
  if (command === "status") {
    const hosts = parseStatusArguments(args);
    process.stdout.write(`${JSON.stringify(await deploymentStatus({ root: repositoryRoot, home, codexBinary, hosts }), null, 2)}\n`);
    return;
  }
  if (command === "uninstall") {
    parseUninstallArguments(args);
    assertOpenCodeConfigDirectory(home, process.env);
    const cursorManifest = readJson(join(repositoryRoot, ".cursor-plugin", "plugin.json"));
    const result = uninstallOpenCodeDeployment({ plugin: cursorManifest.name, home, env: process.env });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (command !== "deploy") throw new Error(`unsupported command: ${command}`);
  const { dryRun, full, hosts } = parseDeployArguments(args);
  const packageManifest = readJson(join(repositoryRoot, "package.json"));
  const cursorManifest = readJson(join(repositoryRoot, ".cursor-plugin", "plugin.json"));
  const codexManifest = readJson(repositoryCodexManifestPath(repositoryRoot));
  const opencodeManifest = readJson(join(repositoryRoot, ".opencode-plugin", "plugin.json"));
  if (cursorManifest.name !== codexManifest.name || cursorManifest.name !== opencodeManifest.name) {
    throw new Error("Cursor, Codex, and OpenCode plugin names differ");
  }
  if ([cursorManifest, codexManifest, opencodeManifest].some((manifest) => manifest.version !== packageManifest.version)) {
    throw new Error("repository manifests must keep the regular package product version");
  }
  if (full) {
    npmScript("deploy:build", repositoryRoot);
    npmScript("release-check", repositoryRoot);
  } else {
    npmScript("deploy:prepare", repositoryRoot);
  }
  const git = repositoryState(repositoryRoot);
  const result = deployPreparedTargets({
    root: repositoryRoot,
    plugin: cursorManifest.name,
    baseVersion: packageManifest.version,
    home,
    gitHead: git.gitHead,
    gitDirty: git.gitDirty,
    dryRun,
    codexBinary,
    hosts,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!dryRun) {
    const changedHooks = Object.keys(result.targets).filter((host) => result.targets[host].hooks_changed);
    if (changedHooks.length) process.stderr.write(`Manual hook trust review required for: ${changedHooks.join(", ")}\n`);
    const nextSteps = [];
    if (hosts.includes("cursor")) nextSteps.push("reload Cursor");
    if (hosts.includes("codex")) nextSteps.push("start a new Codex task");
    if (hosts.includes("opencode")) nextSteps.push("start a new OpenCode session");
    process.stderr.write(`${nextSteps.join(" and ")}; hosts were not restarted automatically.\n`);
  }
}

const direct = process.argv[1] && resolve(process.argv[1]) === scriptPath;
if (direct) main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
