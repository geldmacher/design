import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import YAML from "yaml";
import { installRelease, parseInstallArguments, REPOSITORY, validateRelease } from "../scripts/install-release-from-repo.mjs";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const plugin = "geldmacher-design";
const manifests = ["package.json", ".cursor-plugin/plugin.json", ".codex-plugin/plugin.json", "manifests/agent-plugin.json"];

function json(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function command(binary, args, { cwd, env = process.env } = {}) {
  const result = spawnSync(binary, args, { cwd, env, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${binary} ${args.join(" ")}: ${result.stderr}\n${result.stdout}`);
  return result.stdout.trim();
}

function release(version = "1.0.0") {
  return { id: 1, tag_name: `v${version}`, draft: false, prerelease: false, published_at: "2026-09-08T08:00:00Z", html_url: `https://github.com/geldmacher/design/releases/tag/v${version}` };
}

// Real builder boundary with tiny deterministic payloads; deployed by the production installer.
const builder = `
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = fileURLToPath(import.meta.url);
const root = dirname(dirname(here));
export function createTargetBuildWorkspace() {
  const owned = mkdtempSync(join(tmpdir(), 'design-install-builder-'));
  return { owned, targets: join(owned, 'targets') };
}
export function removeTargetBuildWorkspace(workspace) { rmSync(workspace.owned, { recursive: true }); }
export function buildPluginTargets(output = join(root, '.build', 'plugins')) {
  return Object.fromEntries(['cursor', 'codex'].map(host => {
    const path = join(output, host, 'geldmacher-design');
    const manifest = '.' + host + '-plugin';
    mkdirSync(path, { recursive: true });
    cpSync(join(root, manifest), join(path, manifest), { recursive: true });
    cpSync(join(root, 'payload.txt'), join(path, 'payload.txt'));
    return [host, { path }];
  }));
}
if (process.argv[1] && resolve(process.argv[1]) === here) buildPluginTargets();
`;

const codexCli = `#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
const args = process.argv.slice(2);
if (args.includes('--help')) { console.log('Usage: codex plugin add --json'); process.exit(0); }
const statePath = process.env.INSTALL_TEST_STATE;
const state = JSON.parse(readFileSync(statePath, 'utf8'));
const save = () => writeFileSync(statePath, JSON.stringify(state));
const cache = version => join(process.env.CODEX_HOME, 'plugins', 'cache', 'personal', 'geldmacher-design', version);
const action = args[1];
if (action === 'list') { console.log(JSON.stringify({ installed: state.installed ? [state.installed] : [] })); process.exit(0); }
if (action === 'add') {
  const source = join(process.env.HOME, '.codex', 'plugins', 'geldmacher-design');
  const manifest = JSON.parse(readFileSync(join(source, '.codex-plugin', 'plugin.json'), 'utf8'));
  state.installed = { pluginId: 'geldmacher-design@personal', name: 'geldmacher-design', marketplaceName: 'personal', enabled: true, version: manifest.version, source: { source: 'local', path: source } };
  const target = join(cache(manifest.version), '.codex-plugin', 'plugin.json');
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(manifest));
  state.adds++;
  const fail = state.failNextAdd;
  state.failNextAdd = false;
  save();
  if (fail) { console.error('simulated add failure after cache write'); process.exit(1); }
} else if (action === 'remove') {
  if (state.installed && existsSync(cache(state.installed.version))) rmSync(cache(state.installed.version), { recursive: true });
  state.installed = null;
  save();
} else { throw new Error('Unexpected fixture command: ' + args.join(' ')); }
console.log('{}');
`;

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "design-release-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const root = join(directory, "repository");
  const home = join(directory, "home");
  const statePath = join(directory, "codex-state.json");
  const codex = join(directory, "codex.mjs");
  writeFileSync(codex, codexCli, { mode: 0o755 });
  json(statePath, { installed: null, adds: 0 });
  const env = { ...process.env, CODEX_BIN: codex, CODEX_HOME: join(home, ".codex"), INSTALL_TEST_STATE: statePath, npm_config_cache: join(directory, "npm-cache") };
  mkdirSync(root);
  command("git", ["init", "--quiet", root], { env });
  command("git", ["config", "user.name", "Install Test"], { cwd: root, env });
  command("git", ["config", "user.email", "install@example.invalid"], { cwd: root, env });
  command("git", ["config", "commit.gpgsign", "false"], { cwd: root, env });
  command("git", ["remote", "add", "origin", REPOSITORY], { cwd: root, env });
  writeFileSync(join(root, ".gitignore"), "node_modules/\n.build/\n");
  mkdirSync(join(root, "scripts"));
  writeFileSync(join(root, "scripts", "build-plugin-targets.mjs"), builder);
  const item = { directory, root, home, env, statePath, calls: [], events: [] };
  item.cut = (version, payload = version) => {
    for (const path of manifests) json(join(root, path), { name: plugin, version, type: "module", scripts: { "deploy:prepare": "node scripts/build-plugin-targets.mjs" } });
    json(join(root, "package-lock.json"), { name: plugin, version, lockfileVersion: 3, packages: { "": { name: plugin, version } } });
    writeFileSync(join(root, "payload.txt"), payload);
    command("git", ["add", "."], { cwd: root, env });
    command("git", ["commit", "--quiet", "-m", `Release ${version}`], { cwd: root, env });
    command("git", ["tag", `v${version}`], { cwd: root, env });
    return command("git", ["rev-parse", "HEAD"], { cwd: root, env });
  };
  item.commit = item.cut("1.0.0");
  item.execute = (binary, args, options) => {
    item.calls.push({ binary, args: [...args], cwd: options?.cwd });
    if (binary === "cursor") return "fixture cursor";
    // Substitute only the network transport, keeping a real tag fetch and detached checkout.
    if (binary === "git" && args[0] === "fetch") args = args.map(arg => arg === "origin" ? root : arg);
    return command(binary, args, options);
  };
  item.options = { root, home, env, temporaryRoot: directory, execute: item.execute, resolveRelease: async () => release(), report: value => item.events.push(value) };
  return item;
}

function target(item, host, file = "payload.txt") {
  return join(item.home, host === "cursor" ? ".cursor/plugins/local" : ".codex/plugins", plugin, file);
}

function retained(item) {
  return readdirSync(item.directory).filter(name => name.startsWith("design-release-install-")).map(name => join(item.directory, name));
}

test("CLI requires exactly one explicit supported host", () => {
  assert.deepEqual(parseInstallArguments(["--codex-only", "--dry-run"]), { host: "codex", dryRun: true });
  assert.deepEqual(parseInstallArguments(["--cursor-only"]), { host: "cursor", dryRun: false });
  for (const args of [[], ["--both"], ["--codex-only", "--cursor-only"], ["--cursor-only", "--version", "main"]]) assert.throws(() => parseInstallArguments(args));
});

test("release selection rejects missing, draft, prerelease and unrelated release metadata", () => {
  assert.equal(validateRelease(release()).version, "1.0.0");
  for (const value of [null, {}, { ...release(), draft: true }, { ...release(), prerelease: true }, { ...release(), tag_name: "main" }, { ...release(), tag_name: "v1.0.0-beta" }, { ...release(), html_url: "https://github.com/other/design/releases/tag/v1.0.0" }, { ...release(), published_at: null }]) assert.throws(() => validateRelease(value));
});

test("first installation pins the tag and preserves staged, unstaged and untracked source work", async t => {
  const item = fixture(t);
  writeFileSync(join(item.root, "payload.txt"), "staged local work");
  command("git", ["add", "payload.txt"], { cwd: item.root });
  writeFileSync(join(item.root, "payload.txt"), "unstaged local work");
  writeFileSync(join(item.root, "notes.txt"), "untracked");
  const before = command("git", ["status", "--porcelain=v1"], { cwd: item.root });
  const result = await installRelease({ ...item.options, host: "cursor" });
  assert.equal(result.release.commit, item.commit);
  assert.equal(result.installed.no_op, false);
  assert.equal(result.verification.current, true);
  assert.equal(readFileSync(target(item, "cursor"), "utf8"), "1.0.0");
  assert.equal(command("git", ["status", "--porcelain=v1"], { cwd: item.root }), before);
  assert.equal(command("git", ["show", ":payload.txt"], { cwd: item.root }), "staged local work");
  assert.equal(readFileSync(join(item.root, "payload.txt"), "utf8"), "unstaged local work");
  assert.equal(existsSync(join(item.home, ".codex")), false);
  assert.deepEqual(retained(item), []);
});

for (const host of ["cursor", "codex"]) {
  test(`${host}: preview, install, no-op, update and cache verification`, async t => {
    const item = fixture(t);
    const preview = await installRelease({ ...item.options, host, dryRun: true });
    assert.equal(preview.preview.targets[host].change, true);
    assert.equal(existsSync(item.home), false);
    assert.deepEqual(retained(item), []);
    const installed = await installRelease({ ...item.options, host });
    assert.equal(installed.verification.current, true);
    const receiptBefore = readFileSync(target(item, host, ".local-deploy.json"), "utf8");
    const same = await installRelease({ ...item.options, host });
    assert.equal(same.installed.no_op, true);
    assert.equal(same.next_action, "none");
    assert.equal(readFileSync(target(item, host, ".local-deploy.json"), "utf8"), receiptBefore);
    item.cut("1.1.0");
    const update = await installRelease({ ...item.options, host, resolveRelease: async () => release("1.1.0") });
    assert.equal(update.installed.product_version, "1.1.0");
    assert.equal(update.installed.no_op, false);
    assert.equal(update.verification.current, true);
    assert.equal(readFileSync(target(item, host), "utf8"), "1.1.0");
    assert.equal(existsSync(target(item, host === "codex" ? "cursor" : "codex")), false);
    if (host === "codex") {
      assert.equal(update.verification.codex.current, true);
      assert.equal(JSON.parse(readFileSync(item.statePath, "utf8")).adds, 2);
    }
    assert.deepEqual(retained(item), []);
  });
}

test("Codex failure after mutation restores the previous source and cache and retains evidence", async t => {
  const item = fixture(t);
  await installRelease({ ...item.options, host: "codex" });
  const oldReceipt = readFileSync(target(item, "codex", ".local-deploy.json"), "utf8");
  const oldState = JSON.parse(readFileSync(item.statePath, "utf8"));
  item.cut("1.1.0");
  json(item.statePath, { ...oldState, failNextAdd: true });
  await assert.rejects(installRelease({ ...item.options, host: "codex", resolveRelease: async () => release("1.1.0") }), /rolled back.*simulated add failure/s);
  assert.equal(readFileSync(target(item, "codex", ".local-deploy.json"), "utf8"), oldReceipt);
  assert.deepEqual(JSON.parse(readFileSync(item.statePath, "utf8")).installed, oldState.installed);
  const [workspace] = retained(item);
  const evidence = JSON.parse(readFileSync(join(workspace, "installation.json"), "utf8"));
  assert.equal(evidence.phase, "install");
  assert.match(evidence.error, /rolled back/);
  assert.equal(existsSync(join(workspace, "source")), true);
});

test("lookup, missing tag and version mismatch fail without host changes", async t => {
  const item = fixture(t);
  await assert.rejects(installRelease({ ...item.options, host: "cursor", resolveRelease: async () => { throw new Error("lookup unavailable"); } }), /lookup unavailable/);
  assert.deepEqual(retained(item), []);
  await assert.rejects(installRelease({ ...item.options, host: "cursor", resolveRelease: async () => release("9.0.0") }), /fetch/);
  command("git", ["tag", "v2.0.0"], { cwd: item.root });
  await assert.rejects(installRelease({ ...item.options, host: "cursor", resolveRelease: async () => release("2.0.0") }), /release version/);
  assert.equal(existsSync(item.home), false);
});

test("build failure and preparation drift stop before the deployment boundary", async t => {
  const item = fixture(t);
  for (const drift of [false, true]) {
    const execute = (binary, args, options) => {
      if (binary === "npm" && args[0] === "run") {
        if (!drift) throw new Error("build validation failed");
        item.execute(binary, args, options);
        writeFileSync(join(options.cwd, "payload.txt"), "changed after build");
        return "";
      }
      return item.execute(binary, args, options);
    };
    await assert.rejects(installRelease({ ...item.options, host: "cursor", execute }), drift ? /changed the pinned source/ : /build validation failed/);
  }
  assert.equal(existsSync(item.home), false);
});

test("bundle drift after preview stops before host writes", async t => {
  const item = fixture(t);
  await assert.rejects(installRelease({ ...item.options, host: "cursor", report: value => {
    if (value.phase === "preview") writeFileSync(join(value.source_path, ".build/plugins/cursor", plugin, "payload.txt"), "unexpected");
  } }), /bundle changed after preview/);
  assert.equal(existsSync(item.home), false);
});

test("failed post-install verification retains the installed result without claiming success", async t => {
  const item = fixture(t);
  await assert.rejects(installRelease({ ...item.options, host: "cursor", status: async () => ({ current: false }) }), /could not be verified/);
  const receipt = JSON.parse(readFileSync(join(retained(item)[0], "installation.json"), "utf8"));
  assert.equal(receipt.phase, "verify");
  assert.equal(receipt.installed.no_op, false);
  assert.equal(existsSync(target(item, "cursor")), true);
});

test("source-only entrypoints have explicit discovery and valid references", () => {
  const folder = join(repositoryRoot, ".agents/skills/install-new-release-from-repo");
  const skill = readFileSync(join(folder, "SKILL.md"), "utf8");
  const frontmatter = YAML.parse(skill.split("---")[1]);
  assert.equal(frontmatter.name, "install-new-release-from-repo");
  const metadata = YAML.parse(readFileSync(join(folder, "agents/openai.yaml"), "utf8"));
  assert.equal(metadata.policy.allow_implicit_invocation, false);
  for (const match of skill.matchAll(/\]\(([^)]+)\)/g)) assert.ok(existsSync(resolve(folder, match[1])));
  const cursor = readFileSync(join(repositoryRoot, ".cursor/commands/install-new-release-from-repo.md"), "utf8");
  assert.ok(cursor.includes("../../.agents/skills/install-new-release-from-repo/SKILL.md"));
});

test("wrong origin and unavailable Codex prerequisites stop before release resolution", async t => {
  const item = fixture(t);
  let lookups = 0;
  const resolveRelease = async () => { lookups++; return release(); };
  command("git", ["remote", "set-url", "origin", "https://github.com/other/design.git"], { cwd: item.root });
  await assert.rejects(installRelease({ ...item.options, host: "codex", resolveRelease }), /origin must be/);
  command("git", ["remote", "set-url", "origin", REPOSITORY], { cwd: item.root });
  await assert.rejects(installRelease({ ...item.options, host: "codex", resolveRelease, execute: (binary, args, options) => {
    if (binary === item.env.CODEX_BIN) throw new Error("Codex CLI unavailable");
    return item.execute(binary, args, options);
  } }), /Codex CLI unavailable/);
  assert.equal(lookups, 0);
  assert.deepEqual(retained(item), []);
});

test("failed first Codex install restores absence and preserves unrelated Marketplace entries", async t => {
  const item = fixture(t);
  const marketplacePath = join(item.home, ".agents/plugins/marketplace.json");
  const marketplace = { name: "personal", plugins: [{ name: "unrelated", source: { source: "local", path: "./other" } }] };
  json(marketplacePath, marketplace);
  const original = readFileSync(marketplacePath, "utf8");
  json(item.statePath, { installed: null, adds: 0, failNextAdd: true });
  await assert.rejects(installRelease({ ...item.options, host: "codex" }), /rolled back/);
  assert.equal(existsSync(target(item, "codex")), false);
  assert.equal(readFileSync(marketplacePath, "utf8"), original);
  assert.equal(JSON.parse(readFileSync(item.statePath, "utf8")).installed, null);
});

test("real Design source builds, validates and installs through the release path in an isolated host", async t => {
  const item = fixture(t);
  for (const entry of readdirSync(item.root)) {
    if (entry !== ".git") rmSync(join(item.root, entry), { recursive: true, force: true });
  }
  const files = command("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: repositoryRoot }).split("\0").filter(Boolean);
  for (const file of files) {
    if (!existsSync(join(repositoryRoot, file))) continue;
    mkdirSync(dirname(join(item.root, file)), { recursive: true });
    cpSync(join(repositoryRoot, file), join(item.root, file));
  }
  command("git", ["add", "-A"], { cwd: item.root });
  command("git", ["commit", "--quiet", "-m", "Real Design release fixture"], { cwd: item.root });
  const version = JSON.parse(readFileSync(join(item.root, "package.json"), "utf8")).version;
  command("git", ["tag", `v${version}`], { cwd: item.root });
  const result = await installRelease({ ...item.options, host: "cursor", resolveRelease: async () => release(version), execute: (binary, args, options) => {
    if (binary === "npm" && args[0] === "ci") {
      // Reuse installed locked dependencies; this test performs no registry or GitHub access.
      symlinkSync(join(repositoryRoot, "node_modules"), join(options.cwd, "node_modules"), "dir");
      // The release ignores a physical node_modules/; our test-only symlink needs its own exclude.
      writeFileSync(join(options.cwd, ".git/info/exclude"), "node_modules\n");
      return "";
    }
    return item.execute(binary, args, options);
  } });
  assert.equal(result.verification.current, true);
  assert.equal(existsSync(target(item, "cursor", "skills/design/SKILL.md")), true);
  assert.equal(existsSync(target(item, "cursor", "scripts/install-release-from-repo.mjs")), false);
  assert.equal(result.activation, "not-tested");
  assert.deepEqual(retained(item), []);
});
