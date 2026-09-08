#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deployPreparedTargets, deploymentStatus, prepareMetadata } from "./local-plugin-deploy.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = dirname(dirname(scriptPath));
export const REPOSITORY = "https://github.com/geldmacher/design.git";
const RELEASE_API = "https://api.github.com/repos/geldmacher/design/releases/latest";
const PLUGIN = "geldmacher-design";
const stableTag = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function parseInstallArguments(args) {
  const allowed = new Set(["--cursor-only", "--codex-only", "--dry-run"]);
  for (const arg of args) {
    if (!allowed.has(arg)) throw new Error(`Unsupported argument: ${arg}`);
  }
  const hosts = ["cursor", "codex"].filter((host) => args.includes(`--${host}-only`));
  if (hosts.length !== 1) throw new Error("Select exactly one host with --cursor-only or --codex-only.");
  return { host: hosts[0], dryRun: args.includes("--dry-run") };
}

export function validateRelease(release) {
  if (!release || release.draft !== false || release.prerelease !== false
    || !stableTag.test(release.tag_name) || !Number.isSafeInteger(release.id) || release.id <= 0
    || !release.published_at || !Number.isFinite(Date.parse(release.published_at))
    || release.html_url !== `https://github.com/geldmacher/design/releases/tag/${release.tag_name}`) {
    throw new Error("GitHub did not return a published stable Design release with a vMAJOR.MINOR.PATCH tag.");
  }
  return {
    id: release.id,
    tag: release.tag_name,
    version: release.tag_name.slice(1),
    url: release.html_url,
    published_at: release.published_at,
  };
}

async function latestRelease() {
  const response = await fetch(RELEASE_API, {
    headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    signal: AbortSignal.timeout(30000),
    redirect: "error",
  });
  if (response.status === 404) throw new Error("No published stable Design release is available.");
  if (!response.ok) throw new Error(`GitHub release lookup failed (HTTP ${response.status}). Check network access and GitHub rate limits.`);
  return response.json();
}

function run(command, args, { cwd, env = process.env, inherit = false } = {}) {
  const result = spawnSync(command, args, {
    cwd, env, encoding: "utf8", timeout: 300000,
    maxBuffer: 8 * 1024 * 1024,
    stdio: inherit ? ["ignore", "inherit", "inherit"] : ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed (${result.status}): ${(result.stderr || "").trim()}`);
  }
  return (result.stdout || "").trim();
}

function json(root, file) {
  return JSON.parse(readFileSync(join(root, file), "utf8"));
}

function assertIdentity(root, version) {
  for (const file of ["package.json", ".cursor-plugin/plugin.json", ".codex-plugin/plugin.json", "manifests/agent-plugin.json"]) {
    const manifest = json(root, file);
    if (manifest.name !== PLUGIN || (version && manifest.version !== version)) {
      throw new Error(`Unexpected Design identity or release version in ${file}.`);
    }
  }
}

function preflight({ root, host, env, execute }) {
  if (Number(process.versions.node.split(".")[0]) < 22) throw new Error("Node.js 22 or newer is required.");
  if (!["darwin", "linux"].includes(process.platform)) {
    throw new Error("This repository installer supports macOS and Linux. Use docs/installation.md for other platforms.");
  }
  assertIdentity(root);
  const top = execute("git", ["rev-parse", "--show-toplevel"], { cwd: root, env });
  if (realpathSync(top) !== realpathSync(root)) throw new Error("Open the Design source repository root before installing.");
  const origin = execute("git", ["remote", "get-url", "origin"], { cwd: root, env });
  if (![REPOSITORY, REPOSITORY.slice(0, -4), "git@github.com:geldmacher/design.git", "ssh://git@github.com/geldmacher/design.git"].includes(origin)) {
    throw new Error("The source repository origin must be geldmacher/design on GitHub.");
  }
  execute("npm", ["--version"], { cwd: root, env });
  if (host === "codex") {
    const help = execute(env.CODEX_BIN || "codex", ["plugin", "add", "--help"], { cwd: root, env });
    if (!help.includes("--json")) throw new Error("The Codex CLI must support codex plugin add --json.");
  } else {
    const appAvailable = process.platform === "darwin" && ["/Applications/Cursor.app", join(homedir(), "Applications", "Cursor.app")].some(existsSync);
    if (!appAvailable) execute("cursor", ["--version"], { cwd: root, env });
  }
}

/** Prepare one pinned release; only the existing deployment helper mutates host state. */
export async function installRelease({
  root = repositoryRoot, host, dryRun = false,
  home = process.env.LOCAL_PLUGIN_HOME || homedir(), env = process.env,
  // Boundaries are injectable for isolated repository tests, never CLI switches.
  execute = run, resolveRelease = latestRelease, checkPrerequisites = preflight,
  deploy = deployPreparedTargets, status = deploymentStatus,
  temporaryRoot = tmpdir(), report = (value) => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`),
} = {}) {
  if (!["cursor", "codex"].includes(host)) throw new Error("Select a supported host: cursor or codex.");
  checkPrerequisites({ root, host, env, execute });
  const release = validateRelease(await resolveRelease());
  const workspace = mkdtempSync(join(temporaryRoot, "design-release-install-"));
  const source = join(workspace, "source");
  const receiptPath = join(workspace, "installation.json");
  const receipt = { release, host, dry_run: dryRun, phase: "prepare", source_path: source };
  const save = () => writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  save();
  try {
    report({ phase: "prepare", release, host, workspace });
    execute("git", ["init", "--quiet", source], { env });
    execute("git", ["remote", "add", "origin", REPOSITORY], { cwd: source, env });
    const ref = `refs/tags/${release.tag}`;
    execute("git", ["fetch", "--quiet", "--depth=1", "origin", `${ref}:${ref}`], { cwd: source, env });
    const commit = execute("git", ["rev-parse", "--verify", `${ref}^{commit}`], { cwd: source, env });
    if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error("The release tag did not resolve to a Git commit.");
    execute("git", ["checkout", "--quiet", "--detach", commit], { cwd: source, env });
    receipt.release.commit = commit;
    save();
    assertIdentity(source, release.version);
    if (!existsSync(join(source, "package-lock.json")) || !json(source, "package.json").scripts?.["deploy:prepare"]) {
      throw new Error("This release does not provide the required lockfile and deploy:prepare contract.");
    }
    execute("npm", ["ci", "--include=dev", "--no-audit", "--no-fund"], { cwd: source, env, inherit: true });
    execute("npm", ["run", "deploy:prepare"], { cwd: source, env, inherit: true });
    const assertSource = () => {
      assertIdentity(source, release.version);
      const head = execute("git", ["rev-parse", "HEAD"], { cwd: source, env });
      const changes = execute("git", ["status", "--porcelain", "--untracked-files=normal"], { cwd: source, env });
      if (head !== commit || changes !== "") {
        throw new Error(`Release preparation changed the pinned source; installation stopped. HEAD: ${head}; expected: ${commit}; changes: ${changes || "none"}`);
      }
    };
    assertSource();
    const options = {
      root: source, plugin: PLUGIN, baseVersion: release.version, home, env,
      gitHead: commit, gitDirty: false, hosts: [host], codexBinary: env.CODEX_BIN || "codex",
    };
    const preview = await deploy({ ...options, dryRun: true });
    receipt.preview = preview;
    receipt.phase = "preview";
    save();
    report({ phase: "preview", release, ...preview });
    if (dryRun) {
      rmSync(workspace, { recursive: true });
      return { release, preview, dry_run: true, workspace_removed: true };
    }
    assertSource();
    const prepared = prepareMetadata(options)[host];
    if (prepared.hash !== preview.targets[host].content_sha256) {
      throw new Error("Prepared bundle changed after preview; installation stopped.");
    }
    receipt.phase = "install";
    save();
    const installed = await deploy(options);
    receipt.installed = installed;
    receipt.phase = "verify";
    save();
    const verified = await status(options);
    receipt.verification = verified;
    if (!verified.current) throw new Error("Installation finished, but the installed source or Codex cache could not be verified. Inspect the retained receipt before retrying.");
    const result = {
      release, installed, verification: verified, dry_run: false,
      activation: "not-tested",
      next_action: installed.no_op ? "none" : host === "cursor" ? "Reload Cursor and review changed hook trust." : "Start a new Codex task and review changed hook trust.",
      workspace_removed: true,
    };
    rmSync(workspace, { recursive: true });
    report(result);
    return result;
  } catch (error) {
    receipt.error = error.message;
    try { save(); } catch (saveError) {
      throw new Error(`${error.message}\nCould not retain installation evidence at ${receiptPath}: ${saveError.message}`, { cause: error });
    }
    throw new Error(`${error.message}\nInstallation evidence retained at ${receiptPath}. No automatic retry was attempted.`, { cause: error });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  Promise.resolve().then(() => installRelease(parseInstallArguments(process.argv.slice(2)))).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
