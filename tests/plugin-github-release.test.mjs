import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  changedRepositoryPaths,
  completeRelease,
  createReleaseCut,
  defaultRunner,
  inspectReleaseTarget,
  normalizeRepository,
  prepareRelease,
  receiptForProvenance,
  releaseFailureReport,
  releaseNotesFromChangelog,
  verifyPreparedRelease,
} from "../scripts/plugin-github-release.mjs";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const gate = Object.freeze({ commands: ["npm run release-check", "git diff --check"], result: "passed" });

function command(commandName, args, cwd, options = {}) {
  const result = spawnSync(commandName, args, {
    cwd,
    encoding: options.encoding ?? "utf8",
    env: options.env,
    input: options.input,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`${commandName} ${args.join(" ")} failed: ${String(result.stderr || result.stdout).trim()}`);
  }
  return options.encoding === null ? result.stdout : String(result.stdout).trim();
}

function git(root, ...args) {
  return command("git", args, root);
}

function json(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function fixtureManifest(version) {
  return {
    name: "geldmacher-design",
    version,
    repository: "https://github.com/geldmacher/design",
  };
}

function initializeRepository(root, remote) {
  git(root, "init", "--quiet", "--initial-branch=main");
  git(root, "config", "user.name", "Design Release Fixture");
  git(root, "config", "user.email", "design-release@example.test");
  git(root, "add", "--all");
  git(root, "commit", "--quiet", "-m", "Fixture baseline");
  command("git", ["init", "--bare", "--quiet", remote], dirname(remote));
  git(root, "remote", "add", "origin", remote);
  git(root, "push", "--quiet", "-u", "origin", "main");
  command("git", ["--git-dir", remote, "symbolic-ref", "HEAD", "refs/heads/main"], dirname(remote));
  git(root, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
}

function createFixture(t, { full = false, releaseReady = false } = {}) {
  const temporary = mkdtempSync(join(tmpdir(), "design-release-test-"));
  const root = join(temporary, "repository");
  const remote = join(temporary, "origin.git");
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  if (full) {
    const excluded = new Set([".git", ".build", ".tests", "node_modules"]);
    cpSync(repositoryRoot, root, {
      recursive: true,
      filter(source) {
        const item = relative(repositoryRoot, source).split(sep)[0];
        return !excluded.has(item);
      },
    });
    for (const path of ["package.json", ".cursor-plugin/plugin.json", ".codex-plugin/plugin.json", "manifests/agent-plugin.json"]) {
      const document = JSON.parse(readFileSync(join(root, path), "utf8"));
      document.version = "0.7.0";
      json(join(root, path), document);
    }
  } else {
    mkdirSync(root, { recursive: true });
    json(join(root, "package.json"), {
      name: "geldmacher-design",
      version: "0.7.0",
      repository: { type: "git", url: "https://github.com/geldmacher/design.git" },
    });
    json(join(root, ".cursor-plugin/plugin.json"), fixtureManifest("0.7.0"));
    json(join(root, ".codex-plugin/plugin.json"), fixtureManifest("0.7.0"));
    json(join(root, "manifests/agent-plugin.json"), fixtureManifest("0.7.0"));
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "docs", "installation.md"), "# Install Design\n");
    writeFileSync(join(root, ".gitignore"), ".build/\n");
  }
  const changelog = [
    "# Changelog",
    "",
    "## Unreleased",
    "",
    "- Add the release fixture.",
    "",
    "## 0.6.0 - 2026-08-14",
    "",
    "- Previous release.",
    "",
  ].join("\n");
  writeFileSync(join(root, "CHANGELOG.md"), releaseReady ? createReleaseCut(changelog, "0.7.0") : changelog);
  initializeRepository(root, remote);
  return { root, remote, temporary };
}

function fakeTargetBuilder(outputRoot, sourceRoot) {
  const version = JSON.parse(readFileSync(join(sourceRoot, "package.json"), "utf8")).version;
  const result = { version };
  for (const host of ["cursor", "codex"]) {
    const target = join(outputRoot, host, "geldmacher-design");
    const manifest = host === "cursor" ? ".cursor-plugin/plugin.json" : ".codex-plugin/plugin.json";
    json(join(target, manifest), fixtureManifest(version));
    mkdirSync(join(target, "docs"), { recursive: true });
    writeFileSync(join(target, "README.md"), `# Design for ${host}\n`);
    writeFileSync(join(target, "docs", "installation.md"), readFileSync(join(sourceRoot, "docs", "installation.md")));
    writeFileSync(join(target, "content.txt"), `version=${version}\nhost=${host}\n`);
    result[host] = { path: target, hash: "fixture", files: 4 };
  }
  return result;
}

function createGitHubRunner(state = {}) {
  const releaseState = {
    release: state.release ?? null,
    assets: state.assets ?? new Map(),
    createCalls: 0,
    downloadCalls: 0,
    failAuth: state.failAuth ?? false,
    failApi: state.failApi ?? false,
    failCreate: state.failCreate ?? false,
    failDownloadOnce: state.failDownloadOnce ?? false,
    corruptDownloads: state.corruptDownloads ?? false,
    failPushOnce: state.failPushOnce ?? false,
    failCommitOnce: state.failCommitOnce ?? false,
  };
  const runner = (commandName, args, options = {}) => {
    if (commandName === "git" && args.join(" ") === "remote get-url origin") {
      return { status: 0, stdout: "https://github.com/geldmacher/design.git\n", stderr: "" };
    }
    if (commandName === "git" && args[0] === "commit-tree" && releaseState.failCommitOnce) {
      releaseState.failCommitOnce = false;
      return { status: 1, stdout: "", stderr: "simulated commit failure" };
    }
    if (commandName === "git" && args[0] === "push" && args.includes("--atomic") && releaseState.failPushOnce) {
      releaseState.failPushOnce = false;
      return { status: 1, stdout: "", stderr: "simulated atomic push failure" };
    }
    if (commandName !== "gh") return defaultRunner(commandName, args, options);
    if (args[0] === "auth") {
      return releaseState.failAuth
        ? { status: 1, stdout: "", stderr: "not authenticated" }
        : { status: 0, stdout: "", stderr: "" };
    }
    if (args[0] === "api") {
      return releaseState.failApi
        ? { status: 1, stdout: "", stderr: "network unreachable" }
        : { status: 0, stdout: "", stderr: "" };
    }
    if (args[0] === "release" && args[1] === "view") {
      if (!releaseState.release) return { status: 1, stdout: "", stderr: "release not found" };
      return { status: 0, stdout: `${JSON.stringify(releaseState.release)}\n`, stderr: "" };
    }
    if (args[0] === "release" && args[1] === "create") {
      releaseState.createCalls += 1;
      if (releaseState.failCreate) return { status: 1, stdout: "", stderr: "simulated publish failure" };
      const repoIndex = args.indexOf("--repo");
      const titleIndex = args.indexOf("--title");
      const notesIndex = args.indexOf("--notes-file");
      const assetPaths = args.slice(3, repoIndex);
      releaseState.assets = new Map(assetPaths.map((path) => [basename(path), readFileSync(path)]));
      releaseState.release = {
        tagName: args[2],
        isDraft: false,
        isPrerelease: args.includes("--prerelease"),
        name: args[titleIndex + 1],
        body: readFileSync(args[notesIndex + 1], "utf8"),
        assets: [...releaseState.assets].map(([name]) => ({ name })),
        url: `https://github.com/geldmacher/design/releases/tag/${args[2]}`,
      };
      return { status: 0, stdout: `${releaseState.release.url}\n`, stderr: "" };
    }
    if (args[0] === "release" && args[1] === "download") {
      releaseState.downloadCalls += 1;
      if (releaseState.failDownloadOnce) {
        releaseState.failDownloadOnce = false;
        return { status: 1, stdout: "", stderr: "simulated download failure" };
      }
      const directory = args[args.indexOf("--dir") + 1];
      mkdirSync(directory, { recursive: true });
      for (const [name, bytes] of releaseState.assets) {
        writeFileSync(join(directory, name), releaseState.corruptDownloads && name.endsWith(".zip") ? Buffer.from("corrupt") : bytes);
      }
      return { status: 0, stdout: "", stderr: "" };
    }
    return { status: 1, stdout: "", stderr: `unexpected gh command: ${args.join(" ")}` };
  };
  return { runner, state: releaseState };
}

function releaseOptions(fixture, github, overrides = {}) {
  return {
    root: fixture.root,
    releaseRoot: join(fixture.root, ".build", "releases"),
    runner: github.runner,
    targetBuilder: fakeTargetBuilder,
    releaseGate: () => gate,
    ...overrides,
  };
}

function zipFiles(path) {
  return command("unzip", ["-Z1", path], repositoryRoot).split("\n").filter((name) => name && !name.endsWith("/"));
}

test("release interfaces are explicit-only, no-argument, and source-only", () => {
  const skill = readFileSync(join(repositoryRoot, ".agents/skills/release-plugin/SKILL.md"), "utf8");
  const metadata = readFileSync(join(repositoryRoot, ".agents/skills/release-plugin/agents/openai.yaml"), "utf8");
  const commandText = readFileSync(join(repositoryRoot, ".cursor/commands/release-plugin.md"), "utf8");
  const packageJson = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8"));
  assert.match(skill, /explicitly invokes \$release-plugin/);
  assert.match(metadata, /allow_implicit_invocation: false/);
  assert.match(commandText, /npm run release:plugin/);
  assert.equal(packageJson.scripts["release:plugin"], "node scripts/plugin-github-release.mjs");
  assert.match(skill + commandText, /never choose or bump a version/i);
  assert.match(skill + commandText, /--clobber/);
  assert.match(skill + commandText, /force-push/);
});

test("repository normalization and changelog cutting never choose a version", () => {
  assert.equal(normalizeRepository("git@github.com:geldmacher/design.git"), "geldmacher/design");
  assert.equal(normalizeRepository("https://github.com/geldmacher/design/"), "geldmacher/design");
  assert.throws(() => normalizeRepository("https://example.test/geldmacher/design"), /GitHub repository/);
  const source = "# Changelog\n\n## Unreleased\n\n- New.\n\n## 0.6.0\n\n- Old.\n";
  const cut = createReleaseCut(source, "0.7.0");
  assert.match(cut, /## Unreleased\n\n## 0\.7\.0\n\n- New\./);
  assert.equal(releaseNotesFromChangelog(cut, "0.7.0"), "# Design 0.7.0\n\n- New.\n");
  assert.throws(() => createReleaseCut(source, "0.6.0"), /choose and declare the next version/);
  assert.throws(() => releaseNotesFromChangelog(source, "0.7.0"), /Unreleased must be empty/);
});

test("changed paths preserve Unicode, tabs, and newlines with NUL-safe Git output", (t) => {
  const fixture = createFixture(t, { releaseReady: true });
  const names = ["unicode-東京.txt", "tab\tname.txt", "line\nbreak.txt"];
  for (const name of names) writeFileSync(join(fixture.root, name), name);
  assert.deepEqual(new Set(changedRepositoryPaths(fixture.root)), new Set(names));
});

test("production targets and archives are deterministic and contain exact host inventories", (t) => {
  const fixture = createFixture(t, { full: true, releaseReady: true });
  mkdirSync(join(fixture.root, ".build"), { recursive: true });
  writeFileSync(join(fixture.root, ".build", "ignored-leak.txt"), "must not ship\n");
  const github = createGitHubRunner();
  const first = prepareRelease({
    root: fixture.root,
    releaseRoot: join(fixture.temporary, "release-a"),
    runner: github.runner,
    gateResult: gate,
  });
  const second = prepareRelease({
    root: fixture.root,
    releaseRoot: join(fixture.temporary, "release-b"),
    runner: github.runner,
    gateResult: gate,
  });
  for (const host of ["cursor", "codex"]) {
    const name = `geldmacher-design-${host}-v0.7.0.zip`;
    assert.deepEqual(readFileSync(join(first.directory, name)), readFileSync(join(second.directory, name)));
    const files = zipFiles(join(first.directory, name));
    assert.equal(files.length, first.provenance.targets[host].file_count);
    assert.ok(files.every((file) => file.startsWith("geldmacher-design/")));
    assert.ok(files.includes(`geldmacher-design/${host === "cursor" ? ".cursor-plugin" : ".codex-plugin"}/plugin.json`));
    assert.ok(files.includes("geldmacher-design/README.md"));
    assert.ok(files.includes("geldmacher-design/docs/installation.md"));
    assert.ok(!files.some((file) => /release-plugin|plugin-github-release|marketplace\.json/.test(file)));
    assert.ok(!files.includes("geldmacher-design/.build/ignored-leak.txt"));
  }
  assert.deepEqual(readdirSync(first.directory).sort(), [
    "RELEASE_NOTES.md",
    "SHA256SUMS",
    "geldmacher-design-codex-v0.7.0.zip",
    "geldmacher-design-cursor-v0.7.0.zip",
    "provenance.json",
  ]);
});

test("prepared releases are idempotent only for byte-identical assets", (t) => {
  const fixture = createFixture(t, { releaseReady: true });
  const github = createGitHubRunner();
  const options = {
    root: fixture.root,
    releaseRoot: join(fixture.root, ".build", "releases"),
    runner: github.runner,
    targetBuilder: fakeTargetBuilder,
    gateResult: gate,
  };
  const first = prepareRelease(options);
  assert.equal(first.status, "prepared");
  assert.equal(prepareRelease(options).status, "current");
  verifyPreparedRelease(first.directory, first.receipt);
  writeFileSync(join(first.directory, "RELEASE_NOTES.md"), "different\n");
  assert.throws(() => prepareRelease(options), /different bytes/);
});

test("canonical provenance cannot redirect or rename a published asset", (t) => {
  const fixture = createFixture(t, { releaseReady: true });
  const prepared = prepareRelease({
    root: fixture.root,
    releaseRoot: join(fixture.root, ".build", "releases"),
    runner: createGitHubRunner().runner,
    targetBuilder: fakeTargetBuilder,
    gateResult: gate,
  });
  const provenancePath = join(prepared.directory, "provenance.json");
  const provenance = JSON.parse(readFileSync(provenancePath, "utf8"));
  const original = provenance.targets.cursor.archive;
  provenance.targets.cursor.archive = "../redirected.zip";
  provenance.published_assets = provenance.published_assets.map((name) => name === original ? "../redirected.zip" : name);
  provenance.receipt_sha256 = receiptForProvenance(provenance);
  json(provenancePath, provenance);
  assert.throws(() => verifyPreparedRelease(prepared.directory, provenance.receipt_sha256), /archive name is invalid/);
});

test("preparation rejects dirty source, manifest drift, and a failed release gate", (t) => {
  const dirty = createFixture(t, { releaseReady: true });
  writeFileSync(join(dirty.root, "untracked.txt"), "dirty\n");
  assert.throws(() => prepareRelease({
    root: dirty.root,
    releaseRoot: join(dirty.root, ".build", "releases"),
    runner: createGitHubRunner().runner,
    targetBuilder: fakeTargetBuilder,
    gateResult: gate,
  }), /repository must be clean/);

  const drift = createFixture(t, { releaseReady: true });
  json(join(drift.root, ".codex-plugin", "plugin.json"), fixtureManifest("0.7.1"));
  assert.throws(() => prepareRelease({
    root: drift.root,
    releaseRoot: join(drift.root, ".build", "releases"),
    runner: createGitHubRunner().runner,
    targetBuilder: fakeTargetBuilder,
    gateResult: gate,
  }), /manifest version 0\.7\.1 differs from 0\.7\.0/);

  const failedGate = createFixture(t, { releaseReady: true });
  assert.throws(() => prepareRelease({
    root: failedGate.root,
    releaseRoot: join(failedGate.root, ".build", "releases"),
    runner: createGitHubRunner().runner,
    targetBuilder: fakeTargetBuilder,
    releaseGate: () => ({ commands: gate.commands, result: "failed" }),
  }), /release gate did not return a passed result/);
});

test("target inspection rejects secrets, symlinks, development roots, and manifest drift", (t) => {
  const fixture = createFixture(t, { releaseReady: true });
  const target = join(fixture.temporary, "target");
  fakeTargetBuilder(fixture.temporary, fixture.root);
  cpSync(join(fixture.temporary, "cursor", "geldmacher-design"), target, { recursive: true });
  assert.equal(inspectReleaseTarget(target, "cursor", "0.7.0").file_count, 4);
  mkdirSync(join(target, "tests"));
  writeFileSync(join(target, "tests", "fixture.txt"), "fixture\n");
  assert.throws(() => inspectReleaseTarget(target, "cursor", "0.7.0"), /development path/);
  rmSync(join(target, "tests"), { recursive: true });
  writeFileSync(join(target, "secret.txt"), "github_pat_abcdefghijklmnopqrstuvwxyz123456\n");
  assert.throws(() => inspectReleaseTarget(target, "cursor", "0.7.0"), /secret material/);
  rmSync(join(target, "secret.txt"));
  symlinkSync("README.md", join(target, "linked-readme"));
  assert.throws(() => inspectReleaseTarget(target, "cursor", "0.7.0"), /symlink/);
  rmSync(join(target, "linked-readme"));
  const manifestPath = join(target, ".cursor-plugin", "plugin.json");
  json(manifestPath, fixtureManifest("9.9.9"));
  assert.throws(() => inspectReleaseTarget(target, "cursor", "0.7.0"), /must identify/);
});

test("complete release binds one commit, lightweight tag, atomic push, assets, and read-back", (t) => {
  const fixture = createFixture(t);
  writeFileSync(join(fixture.root, "feature.txt"), "validated candidate\n");
  const github = createGitHubRunner();
  const result = completeRelease(releaseOptions(fixture, github));
  assert.equal(result.status, "published");
  assert.equal(result.commit_created, true);
  assert.equal(result.pushed_atomically, true);
  assert.equal(git(fixture.root, "show", "-s", "--format=%s", "HEAD"), "Release v0.7.0");
  assert.equal(git(fixture.root, "cat-file", "-t", "refs/tags/v0.7.0"), "commit");
  assert.equal(git(fixture.root, "rev-parse", "HEAD"), command("git", ["--git-dir", fixture.remote, "rev-parse", "refs/heads/main"], fixture.temporary));
  assert.equal(github.state.createCalls, 1);
  assert.equal(github.state.downloadCalls, 1);
  assert.equal(git(fixture.root, "status", "--porcelain"), "");
  assert.throws(() => git(fixture.root, "rev-parse", "--verify", "refs/geldmacher-design/release-retries/v0.7.0"), /failed/);
});

test("download failure retains exact retry state and a later explicit run verifies current bytes", (t) => {
  const fixture = createFixture(t);
  writeFileSync(join(fixture.root, "feature.txt"), "validated candidate\n");
  const github = createGitHubRunner({ failDownloadOnce: true });
  assert.throws(() => completeRelease(releaseOptions(fixture, github)), /read-back verification failed.*download failed/);
  const releaseCommit = git(fixture.root, "rev-parse", "HEAD");
  assert.equal(git(fixture.root, "rev-parse", "refs/geldmacher-design/release-retries/v0.7.0"), releaseCommit);
  const result = completeRelease(releaseOptions(fixture, github));
  assert.equal(result.status, "current");
  assert.equal(result.commit_created, false);
  assert.equal(github.state.createCalls, 1);
  assert.equal(github.state.downloadCalls, 2);
  assert.throws(() => git(fixture.root, "rev-parse", "--verify", "refs/geldmacher-design/release-retries/v0.7.0"), /failed/);
});

test("commit and atomic-push failures stop without hidden repair and allow exact retry", (t) => {
  const commitFixture = createFixture(t);
  writeFileSync(join(commitFixture.root, "feature.txt"), "candidate\n");
  const commitFailure = createGitHubRunner({ failCommitOnce: true });
  const baseline = git(commitFixture.root, "rev-parse", "HEAD");
  assert.throws(() => completeRelease(releaseOptions(commitFixture, commitFailure)), /commit failure/);
  assert.equal(git(commitFixture.root, "rev-parse", "HEAD"), baseline);
  assert.match(readFileSync(join(commitFixture.root, "CHANGELOG.md"), "utf8"), /## Unreleased\n\n- Add the release fixture/);

  const pushFixture = createFixture(t);
  writeFileSync(join(pushFixture.root, "feature.txt"), "candidate\n");
  const pushFailure = createGitHubRunner({ failPushOnce: true });
  assert.throws(() => completeRelease(releaseOptions(pushFixture, pushFailure)), /atomic push failure/);
  assert.equal(git(pushFixture.root, "rev-parse", "HEAD"), git(pushFixture.root, "rev-parse", "refs/geldmacher-design/release-retries/v0.7.0"));
  assert.equal(completeRelease(releaseOptions(pushFixture, pushFailure)).status, "published");
});

test("preflight rejects GitHub failures, unsafe candidates, and unsynchronized main", (t) => {
  for (const [contents, expected] of [
    ["github_pat_abcdefghijklmnopqrstuvwxyz123456\n", /secret material/],
    [null, /symlink/],
  ]) {
    const fixture = createFixture(t);
    if (contents === null) symlinkSync("CHANGELOG.md", join(fixture.root, "unsafe-link"));
    else writeFileSync(join(fixture.root, "unsafe.txt"), contents);
    assert.throws(() => completeRelease(releaseOptions(fixture, createGitHubRunner())), expected);
  }

  const nested = createFixture(t);
  mkdirSync(join(nested.root, "nested"));
  git(join(nested.root, "nested"), "init", "--quiet");
  writeFileSync(join(nested.root, "nested", "file.txt"), "nested\n");
  assert.throws(() => completeRelease(releaseOptions(nested, createGitHubRunner())), /nested repository|non-regular entry/);

  const authFixture = createFixture(t);
  assert.throws(() => completeRelease(releaseOptions(authFixture, createGitHubRunner({ failAuth: true }))), /authentication failed/);
  const apiFixture = createFixture(t);
  assert.throws(() => completeRelease(releaseOptions(apiFixture, createGitHubRunner({ failApi: true }))), /unreachable/);

  const driftFixture = createFixture(t);
  const clone = join(driftFixture.temporary, "other");
  command("git", ["clone", "--quiet", driftFixture.remote, clone], driftFixture.temporary);
  git(clone, "config", "user.name", "Remote Fixture");
  git(clone, "config", "user.email", "remote@example.test");
  writeFileSync(join(clone, "remote.txt"), "remote advance\n");
  git(clone, "add", "remote.txt");
  git(clone, "commit", "--quiet", "-m", "Advance remote");
  git(clone, "push", "--quiet", "origin", "main");
  assert.throws(() => completeRelease(releaseOptions(driftFixture, createGitHubRunner())), /differs from origin\/main/);
});

test("annotated or mixed remote tags block without repair", (t) => {
  const annotated = createFixture(t, { releaseReady: true });
  git(annotated.root, "tag", "-a", "v0.7.0", "-m", "annotated");
  assert.throws(() => completeRelease(releaseOptions(annotated, createGitHubRunner())), /annotated/);

  const mixed = createFixture(t);
  writeFileSync(join(mixed.root, "feature.txt"), "candidate\n");
  const github = createGitHubRunner({ failCreate: true });
  assert.throws(() => completeRelease(releaseOptions(mixed, github)), /publish failure/);
  const releaseCommit = git(mixed.root, "rev-parse", "HEAD");
  const baseCommit = git(mixed.root, "rev-parse", "HEAD^");
  command("git", ["--git-dir", mixed.remote, "update-ref", "refs/heads/main", baseCommit, releaseCommit], mixed.temporary);
  assert.throws(() => completeRelease(releaseOptions(mixed, github)), /mixed or conflicting remote/);
  assert.equal(command("git", ["--git-dir", mixed.remote, "rev-parse", "refs/heads/main"], mixed.temporary), baseCommit);
});

test("an existing release is current only after downloaded bytes match", (t) => {
  const fixture = createFixture(t);
  const github = createGitHubRunner();
  const first = completeRelease(releaseOptions(fixture, github));
  assert.equal(first.status, "published");
  const current = completeRelease(releaseOptions(fixture, github));
  assert.equal(current.status, "current");
  assert.equal(github.state.createCalls, 1);
  github.state.release.name = "Conflicting title";
  assert.throws(() => completeRelease(releaseOptions(fixture, github)), /title differs/);
  github.state.release.name = "Design 0.7.0";
  github.state.corruptDownloads = true;
  assert.throws(() => completeRelease(releaseOptions(fixture, github)), /downloaded asset differs/);
  assert.equal(github.state.createCalls, 1);
});

test("failure reports expose retained retry state and prepared directory", (t) => {
  const fixture = createFixture(t);
  const github = createGitHubRunner({ failCreate: true });
  assert.throws(() => completeRelease(releaseOptions(fixture, github)), /publish failure/);
  const report = releaseFailureReport(new Error("publish blocked"), {
    root: fixture.root,
    releaseRoot: join(fixture.root, ".build", "releases"),
    runner: github.runner,
  });
  assert.equal(report.status, "blocked");
  assert.equal(report.retained_retry_state.release_commit, git(fixture.root, "rev-parse", "HEAD"));
  assert.ok(report.prepared_directory.endsWith("/.build/releases/v0.7.0"));
  assert.ok(existsSync(report.prepared_directory));
  assert.equal(lstatSync(report.prepared_directory).isDirectory(), true);
});
