#!/usr/bin/env node
import { createHash } from "node:crypto";
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
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildPluginTargets,
  createTargetBuildWorkspace,
  removeTargetBuildWorkspace,
} from "./build-plugin-targets.mjs";

export const PLUGIN_NAME = "geldmacher-design";
export const RELEASE_HOSTS = Object.freeze(["cursor", "codex"]);
const scriptPath = fileURLToPath(import.meta.url);
export const defaultRoot = dirname(dirname(scriptPath));
const fixedArchiveTime = "1980-01-01T00:00:00Z";
const developmentRoots = new Set([
  ".agents", ".build", ".cursor", ".git", "node_modules", "overlays", "test", "tests", "upstream",
]);
const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /\bgh[opusr]_[A-Za-z0-9]{20,}\b/,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
];

function slash(path) {
  return path.split(sep).join("/");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fileSha256(path) {
  return sha256(readFileSync(path));
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
  }
  return value;
}

export function canonicalJson(value) {
  return `${JSON.stringify(canonicalValue(value), null, 2)}\n`;
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, canonicalJson(value));
}

function asText(value) {
  return Buffer.isBuffer(value) ? value.toString("utf8") : String(value ?? "");
}

function asBuffer(value) {
  return Buffer.isBuffer(value) ? value : Buffer.from(String(value ?? ""), "utf8");
}

export function defaultRunner(command, args, options = {}) {
  const binary = options.encoding === null;
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    input: options.input,
    encoding: binary ? null : "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? (binary ? Buffer.alloc(0) : ""),
    stderr: result.stderr ?? (binary ? Buffer.alloc(0) : ""),
    error: result.error ?? null,
  };
}

function runChecked(runner, command, args, options = {}, label = `${command} ${args.join(" ")}`) {
  const result = runner(command, args, options);
  if (result.status !== 0) {
    const detail = asText(result.stderr || result.stdout).trim();
    throw new Error(`${label} failed${detail ? `: ${detail}` : ""}`);
  }
  return options.encoding === null ? asBuffer(result.stdout) : asText(result.stdout).trim();
}

function git(root, args, runner) {
  return runChecked(runner, "git", args, { cwd: root }, `git ${args.join(" ")}`);
}

function gitBuffer(root, args, runner) {
  return runChecked(runner, "git", args, { cwd: root, encoding: null }, `git ${args.join(" ")}`);
}

function optionalGit(root, args, runner) {
  const result = runner("git", args, { cwd: root });
  return result.status === 0 ? asText(result.stdout).trim() : null;
}

function readJson(path, label = path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

export function normalizeRepository(value) {
  if (typeof value !== "string") throw new Error("repository URL is missing");
  const normalized = value.trim()
    .replace(/^git@github\.com:/, "https://github.com/")
    .replace(/^ssh:\/\/git@github\.com\//, "https://github.com/")
    // Managed auth helpers may rewrite origin to https://x-access-token:...@github.com/...
    .replace(/^https:\/\/[^/@]+@github\.com\//i, "https://github.com/")
    .replace(/\.git$/, "")
    .replace(/\/$/, "");
  const match = normalized.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)$/i);
  if (!match) throw new Error(`repository must identify one GitHub repository: ${value}`);
  return match[1];
}

function changelogSections(source) {
  const headings = [...source.matchAll(/^##[ \t]+(?:\[([^\]]+)\]|([^\s]+))(?:[ \t].*)?$/gm)];
  return headings.map((match, index) => ({
    name: match[1] ?? match[2],
    start: match.index,
    headingEnd: match.index + match[0].length,
    end: headings[index + 1]?.index ?? source.length,
    body: source.slice(match.index + match[0].length, headings[index + 1]?.index ?? source.length).trim(),
  }));
}

function releaseChangelogSections(source, version) {
  const sections = changelogSections(source);
  const unreleasedSections = sections.filter((section) => section.name.toLowerCase() === "unreleased");
  if (unreleasedSections.length !== 1) {
    throw new Error(`CHANGELOG.md must contain exactly one Unreleased section; found ${unreleasedSections.length}`);
  }
  const versionSections = sections.filter((section) => section.name === version);
  if (versionSections.length > 1) throw new Error(`CHANGELOG.md contains duplicate ${version} release sections`);
  const unreleased = unreleasedSections[0];
  if (sections[0] !== unreleased) throw new Error("CHANGELOG.md Unreleased must be the first release section");
  return { unreleased, released: versionSections[0] ?? null };
}

export function createReleaseCut(source, version) {
  const { unreleased, released } = releaseChangelogSections(source, version);
  if (unreleased.body === "") {
    if (!released || released.body === "") throw new Error(`CHANGELOG.md has no notes released as ${version}`);
    return source;
  }
  if (released) {
    throw new Error(`CHANGELOG.md already contains ${version}; choose and declare the next version before release`);
  }
  const suffix = unreleased.end < source.length ? "\n\n" : "\n";
  return `${source.slice(0, unreleased.headingEnd)}\n\n## ${version}\n\n${unreleased.body}${suffix}${source.slice(unreleased.end)}`;
}

export function releaseNotesFromChangelog(source, version) {
  const { unreleased, released } = releaseChangelogSections(source, version);
  if (unreleased.body !== "") throw new Error("CHANGELOG.md Unreleased must be empty before preparing a release");
  if (!released || released.body === "") throw new Error(`CHANGELOG.md has no non-empty ${version} release section`);
  return `# Design ${version}\n\n${released.body}\n`;
}

function semver(value) {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value ?? "");
}

function sourceState(root, runner, { requireClean = false, requireReleaseCut = false } = {}) {
  const packageJson = readJson(join(root, "package.json"), "package.json");
  const version = packageJson.version;
  if (!semver(version)) throw new Error(`package.json has an unsupported version: ${version ?? "missing"}`);
  const manifests = {
    cursor: readJson(join(root, ".cursor-plugin", "plugin.json"), "Cursor manifest"),
    codex: readJson(join(root, ".codex-plugin", "plugin.json"), "Codex manifest"),
    agent_plugins: readJson(join(root, "manifests", "agent-plugin.json"), "Agent Plugins manifest"),
  };
  for (const [target, manifest] of Object.entries(manifests)) {
    if (manifest.name !== PLUGIN_NAME) throw new Error(`${target} manifest name must be ${PLUGIN_NAME}`);
    if (manifest.version !== version) throw new Error(`${target} manifest version ${manifest.version ?? "missing"} differs from ${version}`);
  }
  const repository = normalizeRepository(manifests.cursor.repository);
  for (const [target, manifest] of Object.entries(manifests)) {
    if (normalizeRepository(manifest.repository) !== repository) throw new Error(`${target} manifest repository differs from ${repository}`);
  }
  const packageRepository = typeof packageJson.repository === "string" ? packageJson.repository : packageJson.repository?.url;
  if (normalizeRepository(packageRepository) !== repository) throw new Error(`package.json repository differs from ${repository}`);
  const commit = git(root, ["rev-parse", "HEAD"], runner);
  const tree = git(root, ["rev-parse", "HEAD^{tree}"], runner);
  const clean = gitBuffer(root, ["status", "--porcelain=v1", "-z", "--untracked-files=normal"], runner).length === 0;
  const origin = normalizeRepository(git(root, ["remote", "get-url", "origin"], runner));
  if (origin !== repository) throw new Error(`origin ${origin} differs from manifest repository ${repository}`);
  let notes = null;
  let changelogReady = false;
  try {
    notes = releaseNotesFromChangelog(readFileSync(join(root, "CHANGELOG.md"), "utf8"), version);
    changelogReady = true;
  } catch (error) {
    if (requireReleaseCut) throw error;
  }
  if (requireClean && !clean) throw new Error("repository must be clean");
  return { version, tag: `v${version}`, repository, commit, tree, clean, changelog_ready: changelogReady, notes };
}

function assertSameSource(first, second, context) {
  for (const field of ["version", "tag", "repository", "commit", "tree"]) {
    if (first[field] !== second[field]) throw new Error(`${context}: source ${field} changed`);
  }
}

function parseNulPaths(buffer, label) {
  const value = asBuffer(buffer);
  if (value.length === 0) return [];
  if (value[value.length - 1] !== 0) throw new Error(`${label} did not return a complete NUL-delimited path list`);
  return value.subarray(0, -1).toString("utf8").split("\0");
}

export function changedRepositoryPaths(root, runner = defaultRunner) {
  const values = [
    parseNulPaths(gitBuffer(root, ["diff", "--name-only", "-z"], runner), "working-tree diff"),
    parseNulPaths(gitBuffer(root, ["diff", "--cached", "--name-only", "-z"], runner), "staged diff"),
    parseNulPaths(gitBuffer(root, ["ls-files", "--others", "--exclude-standard", "-z"], runner), "untracked inventory"),
  ];
  return [...new Set(values.flat())].sort((left, right) => Buffer.from(left).compare(Buffer.from(right)));
}

function assertSafeCandidatePaths(root, paths) {
  const resolvedRoot = resolve(root);
  for (const relativePath of paths) {
    if (!relativePath || relativePath.startsWith("/") || relativePath.split("/").includes("..")) {
      throw new Error(`release candidate contains an unsafe path: ${JSON.stringify(relativePath)}`);
    }
    if (relativePath === ".gitmodules") throw new Error("release candidate may not add or change submodules");
    const absolute = resolve(resolvedRoot, relativePath);
    if (absolute !== resolvedRoot && !absolute.startsWith(`${resolvedRoot}${sep}`)) {
      throw new Error(`release candidate escapes the repository: ${JSON.stringify(relativePath)}`);
    }
    if (!existsSync(absolute)) continue;
    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink()) throw new Error(`release candidate contains a symlink: ${JSON.stringify(relativePath)}`);
    if (!stat.isFile()) throw new Error(`release candidate contains a non-regular entry: ${JSON.stringify(relativePath)}`);
    let parent = dirname(absolute);
    while (parent !== resolvedRoot) {
      if (existsSync(join(parent, ".git"))) throw new Error(`release candidate contains a nested repository: ${JSON.stringify(relativePath)}`);
      const next = dirname(parent);
      if (next === parent) break;
      parent = next;
    }
    const text = readFileSync(absolute).toString("utf8");
    if (secretPatterns.some((pattern) => pattern.test(text))) {
      throw new Error(`release candidate contains recognizable secret material: ${JSON.stringify(relativePath)}`);
    }
  }
}

function candidateFingerprint(root, paths) {
  const digest = createHash("sha256");
  for (const relativePath of paths) {
    const absolute = join(root, relativePath);
    digest.update(relativePath);
    digest.update("\0");
    if (!existsSync(absolute)) {
      digest.update("deleted\0");
      continue;
    }
    const stat = lstatSync(absolute);
    digest.update(`${stat.mode & 0o777}\0${fileSha256(absolute)}\0`);
  }
  return digest.digest("hex");
}

function atomicWriteText(path, source) {
  const temporary = mkdtempSync(join(dirname(path), ".release-cut-"));
  const staged = join(temporary, basename(path));
  try {
    writeFileSync(staged, source);
    chmodSync(staged, lstatSync(path).mode & 0o777);
    renameSync(staged, path);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

function preserveIndex(root, runner) {
  const raw = git(root, ["rev-parse", "--git-path", "index"], runner);
  const index = resolve(root, raw);
  const temporary = mkdtempSync(join(tmpdir(), "design-release-index-"));
  const backup = join(temporary, "index");
  const existed = existsSync(index);
  if (existed) copyFileSync(index, backup);
  return {
    restore() {
      if (existed) copyFileSync(backup, index);
      else rmSync(index, { force: true });
    },
    close() { rmSync(temporary, { recursive: true, force: true }); },
  };
}

function retryRef(version) {
  return `refs/geldmacher-design/release-retries/v${version}`;
}

function readRetryState(root, source, runner) {
  const ref = retryRef(source.version);
  const releaseCommit = optionalGit(root, ["rev-parse", "--verify", ref], runner);
  if (!releaseCommit) return null;
  const type = git(root, ["cat-file", "-t", releaseCommit], runner);
  if (type !== "commit") throw new Error(`release retry ref ${ref} does not identify a commit`);
  const baseCommit = git(root, ["rev-parse", `${releaseCommit}^`], runner);
  const tree = git(root, ["rev-parse", `${releaseCommit}^{tree}`], runner);
  const subject = git(root, ["show", "-s", "--format=%s", releaseCommit], runner);
  if (subject !== `Release ${source.tag}`) throw new Error(`release retry commit subject differs from Release ${source.tag}`);
  return { ref, base_commit: baseCommit, release_commit: releaseCommit, tree_sha: tree };
}

function bindRetryCommit(root, source, releaseCommit, runner) {
  const ref = retryRef(source.version);
  const existing = optionalGit(root, ["rev-parse", "--verify", ref], runner);
  if (existing && existing !== releaseCommit) throw new Error(`release retry ref ${ref} already identifies another commit`);
  if (!existing) git(root, ["update-ref", ref, releaseCommit, "0".repeat(releaseCommit.length)], runner);
  return readRetryState(root, source, runner);
}

function clearRetryCommit(root, source, runner) {
  const state = readRetryState(root, source, runner);
  if (state) git(root, ["update-ref", "-d", state.ref, state.release_commit], runner);
}

function assertCommitIdentity(root, runner) {
  const name = optionalGit(root, ["config", "--get", "user.name"], runner);
  const email = optionalGit(root, ["config", "--get", "user.email"], runner);
  if (!name || !email) throw new Error("Git commit identity requires configured user.name and user.email");
}

function ghResult(runner, args, root) {
  return runner("gh", args, { cwd: root });
}

function assertGitHubReady(root, runner) {
  const auth = ghResult(runner, ["auth", "status", "--hostname", "github.com"], root);
  // REST /user is unavailable to GitHub App installation tokens (Cursor cloud agents).
  // GraphQL viewer works for both classic PATs and App installation tokens.
  const api = ghResult(runner, [
    "api", "graphql",
    "--hostname", "github.com",
    "-f", "query=query { viewer { login } }",
  ], root);
  const apiMessage = `${asText(api.stderr)}\n${asText(api.stdout)}`.trim();
  if (api.status !== 0 && /connect|network|resolve|timed? out|unreachable/i.test(apiMessage)) {
    throw new Error(`GitHub is unreachable from this release environment: ${apiMessage}`);
  }
  if (auth.status !== 0) throw new Error(`GitHub authentication failed: ${asText(auth.stderr || auth.stdout).trim()}`);
  if (api.status !== 0) throw new Error(`GitHub API access failed: ${apiMessage}`);
}

function remoteBranchCommit(root, runner) {
  const output = runChecked(runner, "git", ["ls-remote", "--heads", "origin", "refs/heads/main"], {
    cwd: root,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  }, "remote branch lookup for main");
  const commit = output.split(/\r?\n/).filter(Boolean).map((line) => line.split(/\s+/, 2))
    .find(([, ref]) => ref === "refs/heads/main")?.[0];
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(commit ?? "")) throw new Error("remote branch origin/main does not identify a commit");
  return commit;
}

function remoteTagInfo(root, runner, tag) {
  const output = runChecked(runner, "git", ["ls-remote", "--tags", "origin", `refs/tags/${tag}`, `refs/tags/${tag}^{}`], {
    cwd: root,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  }, `remote tag lookup for ${tag}`);
  const lines = output.split(/\r?\n/).filter(Boolean).map((line) => line.split(/\s+/, 2));
  const direct = lines.find(([, ref]) => ref === `refs/tags/${tag}`)?.[0] ?? null;
  const peeled = lines.find(([, ref]) => ref === `refs/tags/${tag}^{}`)?.[0] ?? null;
  if (peeled) throw new Error(`remote tag ${tag} is annotated; a Lightweight tag is required`);
  if (direct && !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(direct)) throw new Error(`remote tag ${tag} is invalid`);
  return direct ? { commit: direct, lightweight: true } : null;
}

function localTagCommit(root, runner, tag) {
  const commit = optionalGit(root, ["rev-parse", "--verify", `refs/tags/${tag}`], runner);
  if (!commit) return null;
  const type = git(root, ["cat-file", "-t", `refs/tags/${tag}`], runner);
  if (type !== "commit") throw new Error(`local tag ${tag} is annotated; a Lightweight tag is required`);
  return commit;
}

function parseReleaseView(result, tag) {
  if (result.status !== 0) {
    const message = `${asText(result.stderr)}\n${asText(result.stdout)}`;
    if (/release not found|release does not exist|HTTP 404[^\n]*release/i.test(message)) return null;
    throw new Error(`GitHub release lookup failed: ${asText(result.stderr || result.stdout).trim()}`);
  }
  try {
    return JSON.parse(asText(result.stdout));
  } catch (error) {
    throw new Error(`GitHub release ${tag} returned invalid metadata: ${error.message}`);
  }
}

function initialReleaseView(root, runner, source) {
  return parseReleaseView(ghResult(runner, [
    "release", "view", source.tag,
    "--repo", source.repository,
    "--json", "tagName,isDraft,isPrerelease,name,body,assets,url",
  ], root), source.tag);
}

function materializeGitTree(root, commit, destination, runner) {
  mkdirSync(destination, { recursive: true });
  const indexPath = join(dirname(destination), "source.index");
  const env = { ...process.env, GIT_INDEX_FILE: indexPath, GIT_WORK_TREE: destination };
  const deterministic = ["-c", "core.autocrlf=false", "-c", "core.eol=lf"];
  try {
    runChecked(runner, "git", [...deterministic, "read-tree", commit], { cwd: root, env }, "Git source snapshot index");
    runChecked(runner, "git", [...deterministic, "checkout-index", "--all", "--force"], { cwd: root, env }, "Git source snapshot materialization");
  } finally {
    rmSync(indexPath, { force: true });
  }
}

function walk(directory, base = directory) {
  const result = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(directory, entry.name);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error(`release target contains a symlink: ${slash(relative(base, path))}`);
    if (stat.isDirectory()) result.push(...walk(path, base));
    else if (stat.isFile()) result.push({ path, relativePath: slash(relative(base, path)), mode: stat.mode & 0o777 });
    else throw new Error(`release target contains a non-regular entry: ${slash(relative(base, path))}`);
  }
  return result;
}

function targetManifest(host) {
  return host === "cursor" ? ".cursor-plugin/plugin.json" : ".codex-plugin/plugin.json";
}

export function inspectReleaseTarget(directory, host, version) {
  if (!RELEASE_HOSTS.includes(host)) throw new Error(`unsupported release host: ${host}`);
  const entries = walk(directory);
  for (const entry of entries) {
    if (developmentRoots.has(entry.relativePath.split("/", 1)[0])) {
      throw new Error(`${host} release target contains development path: ${entry.relativePath}`);
    }
    const text = readFileSync(entry.path).toString("utf8");
    if (secretPatterns.some((pattern) => pattern.test(text))) {
      throw new Error(`${host} release target contains recognizable secret material: ${entry.relativePath}`);
    }
  }
  const manifest = readJson(join(directory, targetManifest(host)), `${host} release manifest`);
  if (manifest.name !== PLUGIN_NAME || manifest.version !== version) {
    throw new Error(`${host} release manifest must identify ${PLUGIN_NAME} ${version}`);
  }
  for (const required of ["README.md", "docs/installation.md"]) {
    if (!existsSync(join(directory, required))) throw new Error(`${host} release target is missing ${required}`);
  }
  const digest = createHash("sha256");
  for (const entry of entries) {
    digest.update(`${entry.relativePath}\0${entry.mode.toString(8).padStart(3, "0")}\0${fileSha256(entry.path)}\n`);
  }
  return { content_sha256: digest.digest("hex"), file_count: entries.length };
}

function createDeterministicArchive(source, archive, runner) {
  const temporary = mkdtempSync(join(tmpdir(), "design-release-archive-"));
  const gitDirectory = join(temporary, "objects.git");
  try {
    runChecked(runner, "git", ["init", "--bare", "--quiet", gitDirectory], {}, "git archive staging init");
    runChecked(runner, "git", [
      `--git-dir=${gitDirectory}`, `--work-tree=${source}`, "-c", "core.autocrlf=false", "add", "--all", "--force",
    ], {}, "git archive staging add");
    const tree = runChecked(runner, "git", [`--git-dir=${gitDirectory}`, "write-tree"], {}, "git archive staging tree");
    runChecked(runner, "git", [
      `--git-dir=${gitDirectory}`, "archive", "--format=zip", `--prefix=${PLUGIN_NAME}/`,
      `--mtime=${fixedArchiveTime}`, `--output=${archive}`, tree,
    ], {}, "git archive");
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

function assetName(host, version) {
  return `${PLUGIN_NAME}-${host}-v${version}.zip`;
}

function receiptPayload(provenance) {
  const value = structuredClone(provenance);
  delete value.receipt_sha256;
  return value;
}

export function receiptForProvenance(provenance) {
  return sha256(canonicalJson(receiptPayload(provenance)));
}

function checksumDocument(directory, names) {
  return `${names.map((name) => `${fileSha256(join(directory, name))}  ${name}`).join("\n")}\n`;
}

function releaseDirectory(releaseRoot, version) {
  return join(resolve(releaseRoot), `v${version}`);
}

function releaseNames(provenance) {
  return [...provenance.published_assets].sort();
}

function verifyProvenance(provenance) {
  if (provenance?.schema !== 1 || provenance.kind !== "github-release-provenance" || provenance.plugin !== PLUGIN_NAME) {
    throw new Error("provenance.json identity is invalid");
  }
  if (!semver(provenance.version) || provenance.tag !== `v${provenance.version}`) throw new Error("provenance version and tag are inconsistent");
  if (provenance.repository !== "geldmacher/design") throw new Error("provenance repository is invalid");
  for (const [label, value] of [
    ["source commit", provenance.source?.commit_sha],
    ["source tree", provenance.source?.tree_sha],
  ]) {
    if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(value ?? "")) throw new Error(`provenance ${label} is invalid`);
  }
  if (provenance.source?.clean !== true) throw new Error("provenance source must be clean");
  if (!/^[0-9a-f]{64}$/.test(provenance.release_notes_sha256 ?? "")) throw new Error("provenance release notes hash is invalid");
  if (provenance.receipt_sha256 !== receiptForProvenance(provenance)) throw new Error("provenance receipt is invalid");
  if (provenance.release_gate?.result !== "passed"
    || JSON.stringify(provenance.release_gate.commands) !== JSON.stringify(["npm run release-check", "git diff --check"])) {
    throw new Error("provenance release gate is invalid");
  }
  for (const host of RELEASE_HOSTS) {
    const target = provenance.targets?.[host];
    if (target?.archive !== assetName(host, provenance.version)) throw new Error(`provenance ${host} archive name is invalid`);
    if (!/^[0-9a-f]{64}$/.test(target.archive_sha256 ?? "") || !/^[0-9a-f]{64}$/.test(target.content_sha256 ?? "")) {
      throw new Error(`provenance ${host} hashes are invalid`);
    }
    if (!Number.isSafeInteger(target.file_count) || target.file_count <= 0 || target.root_directory !== PLUGIN_NAME) {
      throw new Error(`provenance ${host} target identity is invalid`);
    }
  }
  const expected = [assetName("cursor", provenance.version), assetName("codex", provenance.version),
    "RELEASE_NOTES.md", "SHA256SUMS", "provenance.json"].sort();
  if (releaseNames(provenance).join("\n") !== expected.join("\n")) throw new Error("provenance published assets differ");
}

export function verifyPreparedRelease(directory, expectedReceipt = null) {
  const provenancePath = join(directory, "provenance.json");
  if (!existsSync(provenancePath)) throw new Error("prepared release is missing provenance.json");
  const provenance = readJson(provenancePath, "provenance.json");
  verifyProvenance(provenance);
  if (expectedReceipt && provenance.receipt_sha256 !== expectedReceipt) throw new Error("prepared release receipt differs");
  const actualNames = readdirSync(directory).sort();
  const expectedNames = releaseNames(provenance);
  if (actualNames.join("\n") !== expectedNames.join("\n")) throw new Error("prepared release file inventory differs");
  for (const host of RELEASE_HOSTS) {
    const target = provenance.targets[host];
    if (fileSha256(join(directory, target.archive)) !== target.archive_sha256) throw new Error(`${host} archive differs from provenance`);
  }
  if (fileSha256(join(directory, "RELEASE_NOTES.md")) !== provenance.release_notes_sha256) {
    throw new Error("RELEASE_NOTES.md differs from provenance");
  }
  const covered = [provenance.targets.cursor.archive, provenance.targets.codex.archive, "RELEASE_NOTES.md", "provenance.json"];
  if (readFileSync(join(directory, "SHA256SUMS"), "utf8") !== checksumDocument(directory, covered)) {
    throw new Error("SHA256SUMS differs from prepared release files");
  }
  return { provenance, receipt: provenance.receipt_sha256 };
}

function samePreparedSet(first, second) {
  if (!existsSync(first) || !existsSync(second)) return false;
  const firstNames = readdirSync(first).sort();
  const secondNames = readdirSync(second).sort();
  return firstNames.join("\n") === secondNames.join("\n")
    && firstNames.every((name) => fileSha256(join(first, name)) === fileSha256(join(second, name)));
}

function defaultReleaseGate(root, runner) {
  runChecked(runner, "npm", ["run", "release-check"], { cwd: root }, "npm run release-check");
  runChecked(runner, "git", ["diff", "--check"], { cwd: root }, "git diff --check");
  return { commands: ["npm run release-check", "git diff --check"], result: "passed" };
}

export function prepareRelease({
  root = defaultRoot,
  releaseRoot = join(root, ".build", "releases"),
  runner = defaultRunner,
  targetBuilder = buildPluginTargets,
  gateResult = null,
  releaseGate = defaultReleaseGate,
} = {}) {
  const source = sourceState(resolve(root), runner, { requireClean: true, requireReleaseCut: true });
  const gate = gateResult ?? releaseGate(resolve(root), runner);
  if (!gate || gate.result !== "passed") throw new Error("release gate did not return a passed result");
  const afterGate = sourceState(resolve(root), runner, { requireClean: true, requireReleaseCut: true });
  assertSameSource(source, afterGate, "release gate drifted from prepared source");

  mkdirSync(resolve(releaseRoot), { recursive: true });
  const stagingRoot = mkdtempSync(join(resolve(releaseRoot), ".prepare-"));
  const sourceRoot = mkdtempSync(join(tmpdir(), "design-release-source-"));
  const sourceSnapshot = join(sourceRoot, "source");
  const staged = join(stagingRoot, `v${source.version}`);
  const buildWorkspace = createTargetBuildWorkspace();
  mkdirSync(staged, { recursive: true });
  try {
    materializeGitTree(resolve(root), source.commit, sourceSnapshot, runner);
    const snapshotNotes = releaseNotesFromChangelog(readFileSync(join(sourceSnapshot, "CHANGELOG.md"), "utf8"), source.version);
    if (snapshotNotes !== source.notes) throw new Error("materialized Git source release notes differ from prepared source");
    const built = targetBuilder(buildWorkspace.targets, sourceSnapshot);
    if (built.version !== source.version) throw new Error(`target builder returned ${built.version}, expected ${source.version}`);
    const targets = {};
    for (const host of RELEASE_HOSTS) {
      const target = inspectReleaseTarget(built[host].path, host, source.version);
      const archive = assetName(host, source.version);
      createDeterministicArchive(built[host].path, join(staged, archive), runner);
      targets[host] = {
        archive,
        archive_sha256: fileSha256(join(staged, archive)),
        content_sha256: target.content_sha256,
        file_count: target.file_count,
        root_directory: PLUGIN_NAME,
      };
    }
    writeFileSync(join(staged, "RELEASE_NOTES.md"), snapshotNotes);
    const provenance = {
      schema: 1,
      kind: "github-release-provenance",
      plugin: PLUGIN_NAME,
      version: source.version,
      tag: source.tag,
      repository: source.repository,
      source: { commit_sha: source.commit, tree_sha: source.tree, clean: true },
      release_gate: gate,
      release_notes_sha256: fileSha256(join(staged, "RELEASE_NOTES.md")),
      targets,
      published_assets: [targets.cursor.archive, targets.codex.archive, "RELEASE_NOTES.md", "SHA256SUMS", "provenance.json"],
    };
    provenance.receipt_sha256 = receiptForProvenance(provenance);
    writeJson(join(staged, "provenance.json"), provenance);
    writeFileSync(join(staged, "SHA256SUMS"), checksumDocument(staged, [
      targets.cursor.archive, targets.codex.archive, "RELEASE_NOTES.md", "provenance.json",
    ]));
    verifyPreparedRelease(staged, provenance.receipt_sha256);
    const finalSource = sourceState(resolve(root), runner, { requireClean: true, requireReleaseCut: true });
    assertSameSource(source, finalSource, "repository drifted while building release assets");
    const destination = releaseDirectory(releaseRoot, source.version);
    if (existsSync(destination)) {
      if (!samePreparedSet(destination, staged)) throw new Error(`prepared release already exists with different bytes: ${destination}`);
      return { status: "current", directory: destination, provenance, receipt: provenance.receipt_sha256 };
    }
    renameSync(staged, destination);
    return { status: "prepared", directory: destination, provenance, receipt: provenance.receipt_sha256 };
  } finally {
    removeTargetBuildWorkspace(buildWorkspace);
    rmSync(stagingRoot, { recursive: true, force: true });
    rmSync(sourceRoot, { recursive: true, force: true });
  }
}

function expectedReleaseHashes(directory, provenance) {
  return Object.fromEntries(provenance.published_assets.map((name) => [name, fileSha256(join(directory, name))]));
}

function verifyReleaseMetadata(view, directory, provenance) {
  if (view.tagName !== provenance.tag || view.isDraft !== false) throw new Error("GitHub release identity or draft state differs");
  if (Boolean(view.isPrerelease) !== provenance.version.includes("-")) throw new Error("GitHub prerelease state differs");
  if (view.name !== `Design ${provenance.version}`) throw new Error("GitHub release title differs");
  if (view.body !== readFileSync(join(directory, "RELEASE_NOTES.md"), "utf8")) throw new Error("GitHub release notes differ");
  const actualAssets = (view.assets ?? []).map((asset) => asset.name).sort();
  if (actualAssets.join("\n") !== releaseNames(provenance).join("\n")) throw new Error("GitHub release asset inventory differs");
}

function verifyRemoteRelease(root, runner, directory, provenance) {
  const view = parseReleaseView(ghResult(runner, [
    "release", "view", provenance.tag,
    "--repo", provenance.repository,
    "--json", "tagName,isDraft,isPrerelease,name,body,assets,url",
  ], root), provenance.tag);
  if (!view) throw new Error(`GitHub release ${provenance.tag} is missing after publication`);
  verifyReleaseMetadata(view, directory, provenance);
  const download = mkdtempSync(join(tmpdir(), "design-release-download-"));
  try {
    const result = ghResult(runner, ["release", "download", provenance.tag, "--repo", provenance.repository, "--dir", download], root);
    if (result.status !== 0) throw new Error(`GitHub release download failed: ${asText(result.stderr || result.stdout).trim()}`);
    const names = readdirSync(download).sort();
    if (names.join("\n") !== releaseNames(provenance).join("\n")) throw new Error("downloaded release asset inventory differs");
    const expected = expectedReleaseHashes(directory, provenance);
    for (const name of names) if (fileSha256(join(download, name)) !== expected[name]) throw new Error(`downloaded asset differs: ${name}`);
    return view;
  } finally {
    rmSync(download, { recursive: true, force: true });
  }
}

export function publishRelease(receipt, {
  root = defaultRoot,
  releaseRoot = join(root, ".build", "releases"),
  runner = defaultRunner,
} = {}) {
  if (!/^[0-9a-f]{64}$/.test(receipt ?? "")) throw new Error("publish requires an exact provenance receipt");
  const source = sourceState(resolve(root), runner, { requireClean: true, requireReleaseCut: true });
  const directory = releaseDirectory(releaseRoot, source.version);
  const prepared = verifyPreparedRelease(directory, receipt);
  const provenance = prepared.provenance;
  if (provenance.source.commit_sha !== source.commit || provenance.source.tree_sha !== source.tree) {
    throw new Error("prepared release differs from current source commit");
  }
  const tag = remoteTagInfo(resolve(root), runner, provenance.tag);
  if (!tag || tag.commit !== provenance.source.commit_sha) throw new Error(`remote Lightweight tag ${provenance.tag} differs from release commit`);
  const initial = initialReleaseView(resolve(root), runner, source);
  if (initial) {
    verifyReleaseMetadata(initial, directory, provenance);
    const view = verifyRemoteRelease(resolve(root), runner, directory, provenance);
    return { status: "current", tag: provenance.tag, receipt, url: view.url ?? null };
  }
  const paths = provenance.published_assets.map((name) => join(directory, name));
  const args = [
    "release", "create", provenance.tag, ...paths,
    "--repo", provenance.repository,
    "--verify-tag",
    "--title", `Design ${provenance.version}`,
    "--notes-file", join(directory, "RELEASE_NOTES.md"),
  ];
  if (provenance.version.includes("-")) args.push("--prerelease");
  const created = ghResult(runner, args, resolve(root));
  if (created.status !== 0) throw new Error(`GitHub release creation failed without cleanup or overwrite: ${asText(created.stderr || created.stdout).trim()}`);
  try {
    const view = verifyRemoteRelease(resolve(root), runner, directory, provenance);
    return {
      status: "published",
      tag: provenance.tag,
      receipt,
      url: view.url ?? (asText(created.stdout).trim() || null),
    };
  } catch (error) {
    throw new Error(`GitHub release was created but read-back verification failed; remote state was left untouched: ${error.message}`);
  }
}

export function completeRelease({
  root = defaultRoot,
  releaseRoot = join(root, ".build", "releases"),
  runner = defaultRunner,
  targetBuilder = buildPluginTargets,
  releaseGate = defaultReleaseGate,
} = {}) {
  const resolvedRoot = resolve(root);
  let source = sourceState(resolvedRoot, runner);
  if (git(resolvedRoot, ["branch", "--show-current"], runner) !== "main") throw new Error("complete release requires the main branch");
  if (git(resolvedRoot, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], runner) !== "origin/main") {
    throw new Error("origin default branch must be main");
  }
  assertCommitIdentity(resolvedRoot, runner);
  assertGitHubReady(resolvedRoot, runner);
  runChecked(runner, "git", ["fetch", "--quiet", "origin", "main", "--tags"], {
    cwd: resolvedRoot,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  }, "fresh origin/main and tag fetch");

  source = sourceState(resolvedRoot, runner);
  const baseline = remoteBranchCommit(resolvedRoot, runner);
  let retry = readRetryState(resolvedRoot, source, runner);
  if (source.commit !== baseline) {
    if (!retry || retry.release_commit !== source.commit || retry.base_commit !== baseline || !source.clean || !source.changelog_ready) {
      throw new Error("local main differs from origin/main without an exact clean release retry state");
    }
  } else if (retry) {
    const commitObjectBoundBeforeMain = retry.base_commit === baseline && retry.release_commit !== baseline;
    const releaseCommitAlreadyRemote = retry.release_commit === baseline && source.clean && source.changelog_ready;
    if (!commitObjectBoundBeforeMain && !releaseCommitAlreadyRemote) {
      throw new Error("release retry state does not bind synchronized main or its pending release commit");
    }
  }

  const existingLocalTag = localTagCommit(resolvedRoot, runner, source.tag);
  const existingRemoteTag = remoteTagInfo(resolvedRoot, runner, source.tag);
  const existingRelease = initialReleaseView(resolvedRoot, runner, source);
  if ((!source.clean || !source.changelog_ready) && (existingLocalTag || existingRemoteTag || existingRelease)) {
    throw new Error(`${source.tag} already has tag or release state; dirty or uncut source cannot change it`);
  }
  if (existingLocalTag && existingLocalTag !== source.commit) throw new Error(`local tag ${source.tag} points to another commit`);
  if (existingRemoteTag && existingRemoteTag.commit !== source.commit) throw new Error(`remote tag ${source.tag} points to another commit`);
  if (existingRelease?.isDraft) throw new Error("GitHub release is a draft; complete release will not modify it");

  let originalChangelog = null;
  let releasedChangelog = null;
  let retryBound = Boolean(retry);
  let commitCreated = false;
  let commitResumed = false;
  let gate;
  try {
    if (source.commit === baseline && !source.changelog_ready) {
      const changelogPath = join(resolvedRoot, "CHANGELOG.md");
      originalChangelog = readFileSync(changelogPath, "utf8");
      releasedChangelog = createReleaseCut(originalChangelog, source.version);
      if (releasedChangelog !== originalChangelog) atomicWriteText(changelogPath, releasedChangelog);
      source = sourceState(resolvedRoot, runner);
      if (!source.changelog_ready) throw new Error("release cut did not produce release-ready changelog notes");
    }

    const candidate = sourceState(resolvedRoot, runner);
    if (!candidate.changelog_ready) throw new Error("final release candidate is missing release-ready changelog notes");
    const paths = changedRepositoryPaths(resolvedRoot, runner);
    assertSafeCandidatePaths(resolvedRoot, paths);
    const fingerprint = candidateFingerprint(resolvedRoot, paths);
    gate = releaseGate(resolvedRoot, runner);
    if (!gate || gate.result !== "passed") throw new Error("release gate did not return a passed result");
    const afterGate = sourceState(resolvedRoot, runner);
    assertSameSource(candidate, afterGate, "release gate drifted from final release candidate");
    if (git(resolvedRoot, ["branch", "--show-current"], runner) !== "main") {
      throw new Error("release gate changed the active main branch");
    }
    const afterPaths = changedRepositoryPaths(resolvedRoot, runner);
    if (afterPaths.join("\0") !== paths.join("\0") || candidateFingerprint(resolvedRoot, afterPaths) !== fingerprint) {
      throw new Error("release gate changed the final release candidate");
    }
    assertSafeCandidatePaths(resolvedRoot, afterPaths);

    if (source.commit === baseline && afterPaths.length > 0) {
      const index = preserveIndex(resolvedRoot, runner);
      let advanced = false;
      try {
        git(resolvedRoot, ["add", "--all", "--"], runner);
        const stagedPaths = parseNulPaths(gitBuffer(resolvedRoot, ["diff", "--cached", "--name-only", "-z"], runner), "staged release candidate");
        if (stagedPaths.sort().join("\0") !== afterPaths.slice().sort().join("\0")) throw new Error("staged release candidate differs from validated paths");
        const tree = git(resolvedRoot, ["write-tree"], runner);
        const headTree = git(resolvedRoot, ["rev-parse", "HEAD^{tree}"], runner);
        if (tree === headTree) throw new Error("validated release candidate produces the current HEAD tree; refusing an empty release commit");
        let releaseCommit;
        if (retry) {
          if (retry.tree_sha !== tree || retry.base_commit !== baseline) throw new Error("retained release retry state differs from staged candidate tree");
          releaseCommit = retry.release_commit;
          commitResumed = true;
        } else {
          releaseCommit = runChecked(runner, "git", ["commit-tree", tree, "-p", baseline], {
            cwd: resolvedRoot,
            input: `Release ${source.tag}\n`,
          }, "release commit object creation");
          if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(releaseCommit)) throw new Error("release commit object creation returned an invalid commit");
          retry = bindRetryCommit(resolvedRoot, source, releaseCommit, runner);
          retryBound = true;
          commitCreated = true;
        }
        git(resolvedRoot, ["update-ref", "refs/heads/main", releaseCommit, baseline], runner);
        advanced = true;
      } finally {
        if (!advanced) index.restore();
        index.close();
      }
      source = sourceState(resolvedRoot, runner, { requireClean: true, requireReleaseCut: true });
      if (source.commit !== retry.release_commit || source.tree !== retry.tree_sha) throw new Error("local main did not advance to exact retry-bound release commit");
    } else {
      source = sourceState(resolvedRoot, runner, { requireClean: true, requireReleaseCut: true });
    }
  } catch (error) {
    if (!retryBound && originalChangelog !== null && releasedChangelog !== null) {
      const changelogPath = join(resolvedRoot, "CHANGELOG.md");
      if (existsSync(changelogPath) && readFileSync(changelogPath, "utf8") === releasedChangelog) atomicWriteText(changelogPath, originalChangelog);
    }
    throw error;
  }

  const prepared = prepareRelease({
    root: resolvedRoot,
    releaseRoot,
    runner,
    targetBuilder,
    gateResult: gate ?? { commands: ["npm run release-check", "git diff --check"], result: "passed" },
  });
  source = sourceState(resolvedRoot, runner, { requireClean: true, requireReleaseCut: true });
  if (prepared.provenance.source.commit_sha !== source.commit || prepared.provenance.source.tree_sha !== source.tree) {
    throw new Error("prepared release differs from release commit");
  }

  const localTag = localTagCommit(resolvedRoot, runner, source.tag);
  if (localTag && localTag !== source.commit) throw new Error(`local tag ${source.tag} differs from release commit`);
  if (!localTag) git(resolvedRoot, ["tag", source.tag, source.commit], runner);

  const remoteMain = remoteBranchCommit(resolvedRoot, runner);
  const remoteTag = remoteTagInfo(resolvedRoot, runner, source.tag);
  const readyToPush = remoteMain === baseline && remoteTag === null;
  const alreadyPushed = remoteMain === source.commit && remoteTag?.commit === source.commit;
  if (!readyToPush && !alreadyPushed) {
    throw new Error("mixed or conflicting remote main/tag state; release workflow will not repair it");
  }
  if (readyToPush) {
    runChecked(runner, "git", [
      "push", "--atomic", "origin",
      "refs/heads/main:refs/heads/main",
      `refs/tags/${source.tag}:refs/tags/${source.tag}`,
    ], {
      cwd: resolvedRoot,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    }, "atomic main and release tag push");
  }
  const verifiedMain = remoteBranchCommit(resolvedRoot, runner);
  const verifiedTag = remoteTagInfo(resolvedRoot, runner, source.tag);
  if (verifiedMain !== source.commit || verifiedTag?.commit !== source.commit) throw new Error("remote main and Lightweight tag do not bind the release commit");
  const published = publishRelease(prepared.receipt, { root: resolvedRoot, releaseRoot, runner });
  clearRetryCommit(resolvedRoot, source, runner);
  return {
    action: "release",
    status: published.status,
    version: source.version,
    tag: source.tag,
    commit_sha: source.commit,
    commit_created: commitCreated,
    commit_resumed: commitResumed,
    pushed_atomically: readyToPush,
    directory: prepared.directory,
    receipt: prepared.receipt,
    provenance: prepared.provenance,
    github: { url: published.url, read_back_verified: true },
  };
}

export function releaseFailureReport(error, {
  root = defaultRoot,
  releaseRoot = join(root, ".build", "releases"),
  runner = defaultRunner,
} = {}) {
  const report = {
    action: "release",
    status: "blocked",
    blockers: [error instanceof Error ? error.message : String(error)],
    source: null,
    retained_retry_state: null,
    prepared_directory: null,
    next_action: "resolve-the-reported-blocker-and-explicitly-invoke-release-plugin-again",
  };
  try {
    const source = sourceState(resolve(root), runner);
    report.source = {
      version: source.version,
      tag: source.tag,
      commit_sha: source.commit,
      tree_sha: source.tree,
      clean: source.clean,
      changelog_ready: source.changelog_ready,
      local_tag_commit: localTagCommit(resolve(root), runner, source.tag),
    };
    try { report.retained_retry_state = readRetryState(resolve(root), source, runner); }
    catch (stateError) { report.blockers.push(stateError.message); }
    const directory = releaseDirectory(releaseRoot, source.version);
    if (existsSync(directory)) report.prepared_directory = directory;
  } catch (sourceError) {
    report.blockers.push(`release source could not be inspected after failure: ${sourceError.message}`);
  }
  return report;
}

function usage() {
  return "Usage: node scripts/plugin-github-release.mjs";
}

function runCli() {
  if (process.argv.slice(2).length !== 0) throw new Error(usage());
  process.stderr.write("Running the complete validated Design plugin release lifecycle.\n");
  process.stdout.write(`${JSON.stringify(completeRelease(), null, 2)}\n`);
}

const direct = process.argv[1] && resolve(process.argv[1]) === scriptPath;
if (direct) {
  try { runCli(); }
  catch (error) {
    process.stderr.write(`Release workflow failed:\n${JSON.stringify(releaseFailureReport(error), null, 2)}\n`);
    process.exitCode = 1;
  }
}
