import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  contentHash,
  deployPreparedTargets,
  deploymentPaths,
  deploymentReceipt,
  isInside,
  localVersion,
  updateMarketplaceDocument,
  validateBundle,
} from "../scripts/local-plugin-deploy.mjs";

const plugin = "geldmacher-test";
const baseVersion = "1.2.3";
const gitHead = "0123456789abcdef0123456789abcdef01234567";

function json(path, value) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "local-plugin-deploy-test-"));
  const repository = join(root, "repository");
  const home = join(root, "home");
  const sentinel = join(root, "outside-host-sentinel.txt");
  writeFileSync(sentinel, "unchanged\n");
  for (const host of ["cursor", "codex"]) {
    const bundle = join(repository, ".build", "plugins", host, plugin);
    const manifestDir = host === "cursor" ? ".cursor-plugin" : ".codex-plugin";
    json(join(bundle, manifestDir, "plugin.json"), { name: plugin, version: baseVersion });
    writeFileSync(join(bundle, "payload.txt"), "first\n");
    mkdirSync(join(bundle, "hooks"));
    writeFileSync(join(bundle, "hooks", `${host}.json`), `${host}-hook\n`);
  }
  const marketplace = deploymentPaths(home, plugin).marketplace;
  json(marketplace, {
    name: "personal",
    plugins: [
      { name: "unrelated", source: { source: "local", path: "./other" } },
      { name: plugin, source: { source: "local", path: "./legacy" }, policy: { installation: "AVAILABLE" } },
    ],
  });
  return { root, repository, home, marketplace, sentinel };
}

function deploymentTemporaryArtifacts(directory) {
  if (!existsSync(directory)) return [];
  const result = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.name.includes(".deploy-") || entry.name.includes(".backup-") || entry.name.endsWith(".tmp")) result.push(path);
    if (entry.isDirectory()) result.push(...deploymentTemporaryArtifacts(path));
  }
  return result.sort();
}

function metadata(root) {
  return {
    root,
    plugin,
    baseVersion,
    gitHead,
    gitDirty: true,
  };
}

function fixtureEnv(item) {
  return {
    ...process.env,
    HOME: item.home,
    CODEX_HOME: join(item.home, "codex-state"),
    LOCAL_PLUGIN_HOME: item.home,
    XDG_CONFIG_HOME: join(item.home, "xdg", "config"),
    XDG_CACHE_HOME: join(item.home, "xdg", "cache"),
    XDG_DATA_HOME: join(item.home, "xdg", "data"),
    XDG_STATE_HOME: join(item.home, "xdg", "state"),
    IMPECCABLE_UPDATE_CACHE: join(item.home, "impeccable", "update-check.json"),
  };
}

function mutatingCodexFixture(item, options = {}) {
  const env = fixtureEnv(item);
  const state = {
    installed: options.installed || null,
    calls: { snapshot: 0, install: 0, remove: 0, restore: 0, verify: 0 },
  };
  const cacheFor = (version) => join(env.CODEX_HOME, "plugins", "cache", "personal", plugin, version);
  const writeCache = (version) => json(join(cacheFor(version), ".codex-plugin", "plugin.json"), { name: plugin, version });
  const snapshot = ({ version, source }) => {
    state.calls.snapshot += 1;
    const expectedCache = cacheFor(version);
    const expectedManifestPath = join(expectedCache, ".codex-plugin", "plugin.json");
    const cacheManifest = existsSync(expectedManifestPath) ? JSON.parse(readFileSync(expectedManifestPath, "utf8")) : null;
    const installedCachePath = state.installed ? cacheFor(state.installed.version) : null;
    const installedManifestPath = installedCachePath ? join(installedCachePath, ".codex-plugin", "plugin.json") : null;
    const installedCacheManifest = installedManifestPath && existsSync(installedManifestPath)
      ? JSON.parse(readFileSync(installedManifestPath, "utf8"))
      : null;
    return {
      current: state.installed?.version === version
        && resolve(state.installed?.source?.path || "/") === resolve(source)
        && cacheManifest?.name === plugin
        && cacheManifest?.version === version,
      installed: state.installed ? structuredClone(state.installed) : null,
      installedCachePath,
      installedCacheManifest,
      cachePath: expectedCache,
      cacheManifest,
      codexHome: env.CODEX_HOME,
    };
  };
  const lifecycle = {
    snapshot,
    install({ version, source, cache }) {
      state.calls.install += 1;
      state.installed = {
        pluginId: `${plugin}@personal`,
        name: plugin,
        marketplaceName: "personal",
        version,
        enabled: true,
        source: { source: "local", path: source },
      };
      writeCache(version);
      if (options.installError) throw new Error(options.installError);
      return snapshot({ version, source, cache });
    },
    remove({ version, cache }) {
      state.calls.remove += 1;
      state.installed = null;
      rmSync(cacheFor(version), { recursive: true, force: true });
      assert.equal(resolve(cache), resolve(cacheFor(version)));
      if (options.removeError) throw new Error(options.removeError);
    },
    restore({ before }) {
      state.calls.restore += 1;
      if (before.installed) {
        state.installed = structuredClone(before.installed);
        writeCache(before.installed.version);
      }
      if (options.restoreError) throw new Error(options.restoreError);
    },
    verify({ version, source, cache, before = null }) {
      state.calls.verify += 1;
      if (before === null) {
        const current = snapshot({ version, source, cache });
        if (!current.current) throw new Error("fixture Codex activation verification failed");
        return current;
      }
      if (options.rollbackVerifyError) throw new Error(options.rollbackVerifyError);
      if (!before.installed) {
        if (state.installed || existsSync(cacheFor(version))) throw new Error("fixture Codex absence was not restored");
        return snapshot({ version, source, cache });
      }
      const restored = snapshot({ version: before.installed.version, source: before.installed.source.path });
      if (!restored.current || restored.installed?.pluginId !== before.installed.pluginId) throw new Error("fixture prior Codex installation was not restored");
      return restored;
    },
  };
  return { lifecycle, state, env };
}

function executableCodexFixture(item, initial = {}) {
  const binary = join(item.root, "codex-fixture.mjs");
  const statePath = join(item.root, "codex-fixture-state.json");
  json(statePath, { installed: null, failNextAdd: false, events: [], ...initial });
  writeFileSync(binary, [
    "#!/usr/bin/env node",
    'import fs from "node:fs";',
    'import path from "node:path";',
    "const statePath = process.env.FIXTURE_CODEX_STATE;",
    'const state = JSON.parse(fs.readFileSync(statePath, "utf8"));',
    "const save = () => fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + \"\\n\");",
    "const reply = (value) => process.stdout.write(JSON.stringify(value) + \"\\n\");",
    "const [group, action, pluginId] = process.argv.slice(2);",
    'if (group !== "plugin") throw new Error("fixture supports plugin commands only");',
    'if (action === "list") { reply({ installed: state.installed ? [state.installed] : [] }); process.exit(0); }',
    'const plugin = String(pluginId || "").split("@")[0];',
    'if (!plugin) throw new Error("fixture plugin id is missing");',
    'const source = path.join(process.env.HOME, ".codex", "plugins", plugin);',
    'if (action === "add") {',
    '  const manifest = JSON.parse(fs.readFileSync(path.join(source, ".codex-plugin", "plugin.json"), "utf8"));',
    '  const cache = path.join(process.env.CODEX_HOME, "plugins", "cache", "personal", plugin, manifest.version);',
    '  const fail = Boolean(state.failNextAdd);',
    '  state.failNextAdd = false;',
    '  state.installed = { pluginId: plugin + "@personal", name: plugin, marketplaceName: "personal", version: manifest.version, enabled: true, source: { source: "local", path: source } };',
    '  state.events.push({ action: "add", version: manifest.version });',
    "  save();",
    '  fs.mkdirSync(path.join(cache, ".codex-plugin"), { recursive: true });',
    '  fs.writeFileSync(path.join(cache, ".codex-plugin", "plugin.json"), JSON.stringify({ name: plugin, version: manifest.version }, null, 2) + "\\n");',
    '  if (fail) { process.stderr.write("fixture activation failed after mutation\\n"); process.exit(17); }',
    "  reply({ installed: true });",
    "  process.exit(0);",
    "}",
    'if (action === "remove") {',
    '  state.events.push({ action: "remove", version: state.installed?.version || null });',
    "  state.installed = null;",
    "  save();",
    "  reply({ removed: true });",
    "  process.exit(0);",
    "}",
    'throw new Error("unsupported fixture action: " + action);',
    "",
  ].join("\n"));
  chmodSync(binary, 0o755);
  return {
    binary,
    statePath,
    env: { ...fixtureEnv(item), FIXTURE_CODEX_STATE: statePath },
    readState: () => JSON.parse(readFileSync(statePath, "utf8")),
  };
}

test("local versions are host-specific and content-addressed", () => {
  const hash = "a".repeat(64);
  assert.equal(localVersion("5.3.0", "cursor", hash), "5.3.0+local.cursor.aaaaaaaaaaaa");
  assert.equal(localVersion("5.3.0", "codex", hash), "5.3.0+local.codex.aaaaaaaaaaaa");
  assert.throws(() => localVersion("5.3", "cursor", hash), /product version/);
});

test("content hashes are stable across receipts and deployed manifest versions", () => {
  const item = fixture();
  try {
    const bundle = join(item.repository, ".build", "plugins", "cursor", plugin);
    const first = contentHash(bundle, { host: "cursor", baseVersion });
    json(join(bundle, ".cursor-plugin", "plugin.json"), { name: plugin, version: localVersion(baseVersion, "cursor", first) });
    json(join(bundle, ".local-deploy.json"), { deployed_at: "tomorrow", content_sha256: first });
    assert.equal(contentHash(bundle, { host: "cursor", baseVersion }), first);
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test("dirty provenance is explicit in deployment receipts", () => {
  const hash = "b".repeat(64);
  const receipt = deploymentReceipt({
    plugin,
    host: "codex",
    baseVersion,
    hash,
    gitHead,
    gitDirty: true,
    sourceRoot: "/tmp/source",
    deployedAt: "2026-08-10T12:00:00.000Z",
  });
  assert.equal(receipt.git_dirty, true);
  assert.equal(receipt.git_head, gitHead);
  assert.equal(receipt.local_version, "1.2.3+local.codex.bbbbbbbbbbbb");
  assert.equal(receipt.source_path, "/tmp/source");
});

test("path boundaries, symlinks, development roots, and wrong manifests fail closed", () => {
  const item = fixture();
  try {
    const cursor = join(item.repository, ".build", "plugins", "cursor", plugin);
    assert.equal(isInside(item.repository, cursor), true);
    assert.equal(isInside(item.repository, join(item.repository, "..", "escape")), false);
    json(join(cursor, ".cursor-plugin", "plugin.json"), { name: "wrong-plugin", version: baseVersion });
    assert.throws(() => validateBundle(cursor, { plugin, host: "cursor", allowedVersions: [baseVersion] }), /unexpected cursor plugin manifest/);
    json(join(cursor, ".cursor-plugin", "plugin.json"), { name: plugin, version: baseVersion });
    mkdirSync(join(cursor, "tests"));
    assert.throws(() => validateBundle(cursor, { plugin, host: "cursor", allowedVersions: [baseVersion] }), /development surface/);
    rmSync(join(cursor, "tests"), { recursive: true });
    symlinkSync("payload.txt", join(cursor, "payload-link"));
    assert.throws(() => validateBundle(cursor, { plugin, host: "cursor", allowedVersions: [baseVersion] }), /contains a symlink/);
    assert.equal(readlinkSync(join(cursor, "payload-link")), "payload.txt");
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test("Marketplace updates preserve every unrelated entry", () => {
  const document = {
    name: "personal",
    plugins: [
      { name: "alpha", source: { source: "local", path: "./alpha" } },
      { name: plugin, source: { source: "local", path: "./old" }, extra: "preserve" },
    ],
  };
  const result = updateMarketplaceDocument(document, plugin, `./.codex/plugins/${plugin}`);
  assert.equal(result.plugins[0].source.path, "./alpha");
  assert.equal(result.plugins[1].source.path, `./.codex/plugins/${plugin}`);
  assert.equal(result.plugins[1].extra, "preserve");
  const created = updateMarketplaceDocument(null, plugin, `./.codex/plugins/${plugin}`);
  assert.equal(created.name, "personal");
  assert.equal(created.plugins[0].name, plugin);
  assert.equal(created.plugins[0].source.path, `./.codex/plugins/${plugin}`);
  assert.throws(() => updateMarketplaceDocument({ name: "other", plugins: [] }, plugin, "./x"), /named personal/);
});

test("Cursor-only first install needs neither Codex nor a personal Marketplace", () => {
  const item = fixture();
  try {
    rmSync(item.marketplace, { force: true });
    const result = deployPreparedTargets({
      ...metadata(item.repository),
      home: item.home,
      hosts: ["cursor"],
      env: fixtureEnv(item),
      codexLifecycle: {
        snapshot() { throw new Error("Cursor-only deploy must not inspect Codex"); },
        install() { throw new Error("Cursor-only deploy must not install Codex"); },
        remove() { throw new Error("Cursor-only deploy must not remove Codex"); },
        restore() { throw new Error("Cursor-only deploy must not restore Codex"); },
        verify() { throw new Error("Cursor-only deploy must not verify Codex"); },
      },
    });
    const paths = deploymentPaths(item.home, plugin);
    assert.deepEqual(result.selected_hosts, ["cursor"]);
    assert.equal(result.marketplace, null);
    assert.equal(result.codex, null);
    assert.equal(readFileSync(join(paths.cursor, ".cursor-plugin", "plugin.json"), "utf8").includes("+local.cursor."), true);
    assert.equal(existsSync(paths.codex), false);
    assert.equal(existsSync(paths.marketplace), false);
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test("Codex-only first install creates its Marketplace entry without touching Cursor", () => {
  const item = fixture();
  try {
    rmSync(item.marketplace, { force: true });
    const codex = mutatingCodexFixture(item);
    const result = deployPreparedTargets({
      ...metadata(item.repository),
      home: item.home,
      hosts: ["codex"],
      env: codex.env,
      codexLifecycle: codex.lifecycle,
    });
    const paths = deploymentPaths(item.home, plugin);
    assert.deepEqual(result.selected_hosts, ["codex"]);
    assert.equal(existsSync(paths.cursor), false);
    assert.equal(readFileSync(join(paths.codex, ".codex-plugin", "plugin.json"), "utf8").includes("+local.codex."), true);
    const marketplace = JSON.parse(readFileSync(paths.marketplace, "utf8"));
    assert.equal(marketplace.name, "personal");
    assert.equal(marketplace.plugins[0].source.path, `./.codex/plugins/${plugin}`);
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test("first install is physical and a second identical deploy is a no-op", () => {
  const item = fixture();
  try {
    const codex = mutatingCodexFixture(item);
    const first = deployPreparedTargets({
      ...metadata(item.repository),
      home: item.home,
      deployedAt: "2026-08-10T12:00:00.000Z",
      env: codex.env,
      codexLifecycle: codex.lifecycle,
    });
    assert.equal(first.no_op, false);
    const paths = deploymentPaths(item.home, plugin);
    assert.equal(JSON.parse(readFileSync(join(paths.cursor, ".cursor-plugin", "plugin.json"))).version, first.targets.cursor.local_version);
    assert.equal(JSON.parse(readFileSync(join(paths.codex, ".codex-plugin", "plugin.json"))).version, first.targets.codex.local_version);
    assert.equal(JSON.parse(readFileSync(item.marketplace)).plugins[1].source.path, `./.codex/plugins/${plugin}`);
    const receiptBefore = readFileSync(join(paths.cursor, ".local-deploy.json"), "utf8");
    const second = deployPreparedTargets({
      ...metadata(item.repository),
      home: item.home,
      deployedAt: "2026-08-11T12:00:00.000Z",
      env: codex.env,
      codexLifecycle: codex.lifecycle,
    });
    assert.equal(second.no_op, true);
    assert.equal(codex.state.calls.install, 1);
    assert.equal(readFileSync(join(paths.cursor, ".local-deploy.json"), "utf8"), receiptBefore);
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test("changed bundles replace both targets", () => {
  const item = fixture();
  try {
    const codex = mutatingCodexFixture(item);
    const options = {
      ...metadata(item.repository),
      home: item.home,
      env: codex.env,
      codexLifecycle: codex.lifecycle,
    };
    const first = deployPreparedTargets({ ...options, deployedAt: "2026-08-10T12:00:00.000Z" });
    for (const host of ["cursor", "codex"]) {
      writeFileSync(join(item.repository, ".build", "plugins", host, plugin, "payload.txt"), "second\n");
    }
    const second = deployPreparedTargets({ ...options, deployedAt: "2026-08-10T12:01:00.000Z" });
    assert.notEqual(first.targets.cursor.content_sha256, second.targets.cursor.content_sha256);
    assert.equal(readFileSync(join(deploymentPaths(item.home, plugin).cursor, "payload.txt"), "utf8"), "second\n");
    assert.equal(readFileSync(join(deploymentPaths(item.home, plugin).codex, "payload.txt"), "utf8"), "second\n");
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test("a failure after both swaps restores both targets and Marketplace", () => {
  const item = fixture();
  try {
    const codex = mutatingCodexFixture(item);
    const options = {
      ...metadata(item.repository),
      home: item.home,
      env: codex.env,
      codexLifecycle: codex.lifecycle,
    };
    deployPreparedTargets({ ...options, deployedAt: "2026-08-10T12:00:00.000Z" });
    const paths = deploymentPaths(item.home, plugin);
    const oldCursor = readFileSync(join(paths.cursor, ".local-deploy.json"), "utf8");
    const oldCodex = readFileSync(join(paths.codex, ".local-deploy.json"), "utf8");
    const oldMarketplace = readFileSync(item.marketplace, "utf8");
    for (const host of ["cursor", "codex"]) {
      writeFileSync(join(item.repository, ".build", "plugins", host, plugin, "payload.txt"), "rollback-candidate\n");
    }
    assert.throws(() => deployPreparedTargets({
      ...options,
      deployedAt: "2026-08-10T12:02:00.000Z",
      simulateFailure: "after-codex-add",
    }), /deployment rolled back/);
    assert.equal(readFileSync(join(paths.cursor, ".local-deploy.json"), "utf8"), oldCursor);
    assert.equal(readFileSync(join(paths.codex, ".local-deploy.json"), "utf8"), oldCodex);
    assert.equal(readFileSync(item.marketplace, "utf8"), oldMarketplace);
    assert.equal(readFileSync(join(paths.cursor, "payload.txt"), "utf8"), "first\n");
    assert.equal(readFileSync(join(paths.codex, "payload.txt"), "utf8"), "first\n");
    assert.equal(codex.state.installed.version, JSON.parse(oldCodex).local_version);
    assert.equal(codex.state.calls.remove, 1);
    assert.equal(codex.state.calls.restore, 1);
    assert.equal(readFileSync(item.sentinel, "utf8"), "unchanged\n");
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test("post-commit backup cleanup failure preserves every verified destination", () => {
  const item = fixture();
  try {
    const codex = mutatingCodexFixture(item);
    const options = {
      ...metadata(item.repository),
      home: item.home,
      env: codex.env,
      codexLifecycle: codex.lifecycle,
    };
    deployPreparedTargets({ ...options, deployedAt: "2026-08-10T12:00:00.000Z" });
    for (const host of ["cursor", "codex"]) {
      writeFileSync(join(item.repository, ".build", "plugins", host, plugin, "payload.txt"), "committed-with-cleanup-error\n");
    }
    assert.throws(() => deployPreparedTargets({
      ...options,
      deployedAt: "2026-08-10T12:01:00.000Z",
      simulateFailure: "during-codex-backup-cleanup",
    }), (error) => {
      assert.equal(error instanceof AggregateError, true);
      assert.match(error.message, /deployment committed but backup cleanup was incomplete/);
      assert.doesNotMatch(error.message, /rolled back|rollback was incomplete/);
      return true;
    });
    const paths = deploymentPaths(item.home, plugin);
    assert.equal(readFileSync(join(paths.cursor, "payload.txt"), "utf8"), "committed-with-cleanup-error\n");
    assert.equal(readFileSync(join(paths.codex, "payload.txt"), "utf8"), "committed-with-cleanup-error\n");
    const currentCodexVersion = JSON.parse(readFileSync(join(paths.codex, ".codex-plugin", "plugin.json"))).version;
    assert.equal(codex.state.installed.version, currentCodexVersion);
    const backups = deploymentTemporaryArtifacts(item.home).filter((path) => path.includes(".backup-"));
    assert.equal(backups.length, 1);
    assert.match(backups[0], /\.codex\/plugins\/\.geldmacher-test\.backup-/);
    assert.equal(readFileSync(item.sentinel, "utf8"), "unchanged\n");
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test("staging and Marketplace helpers clean owned temporaries on internal failure", () => {
  for (const simulateFailure of [
    "during-cursor-stage-copy",
    "during-cursor-stage-patch",
    "during-marketplace-write",
    "during-marketplace-rename",
  ]) {
    const item = fixture();
    try {
      const marketplaceBefore = readFileSync(item.marketplace, "utf8");
      const codex = mutatingCodexFixture(item);
      assert.throws(() => deployPreparedTargets({
        ...metadata(item.repository),
        home: item.home,
        env: codex.env,
        codexLifecycle: codex.lifecycle,
        simulateFailure,
      }), /deployment rolled back: simulated/);
      const paths = deploymentPaths(item.home, plugin);
      assert.equal(existsSync(paths.cursor), false, `${simulateFailure} left a Cursor destination`);
      assert.equal(existsSync(paths.codex), false, `${simulateFailure} left a Codex destination`);
      assert.equal(readFileSync(item.marketplace, "utf8"), marketplaceBefore);
      assert.deepEqual(deploymentTemporaryArtifacts(item.home), [], `${simulateFailure} left an owned temporary artifact`);
      assert.equal(readFileSync(item.sentinel, "utf8"), "unchanged\n");
    } finally {
      rmSync(item.root, { recursive: true, force: true });
    }
  }
});

test("a partially mutating Codex install failure restores prior absence", () => {
  const item = fixture();
  try {
    const marketplaceBefore = readFileSync(item.marketplace, "utf8");
    const codex = mutatingCodexFixture(item, { installError: "activation exploded after mutation" });
    assert.throws(() => deployPreparedTargets({
      ...metadata(item.repository),
      home: item.home,
      hosts: ["codex"],
      env: codex.env,
      codexLifecycle: codex.lifecycle,
    }), /deployment rolled back: activation exploded after mutation/);
    const paths = deploymentPaths(item.home, plugin);
    assert.equal(existsSync(paths.codex), false);
    assert.equal(readFileSync(item.marketplace, "utf8"), marketplaceBefore);
    assert.equal(codex.state.installed, null);
    assert.equal(codex.state.calls.remove, 1);
    assert.equal(codex.state.calls.restore, 1);
    assert.equal(readFileSync(item.sentinel, "utf8"), "unchanged\n");
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test("Codex rollback failures are aggregated with the activation failure", () => {
  const item = fixture();
  try {
    const codex = mutatingCodexFixture(item, { restoreError: "restore exploded", rollbackVerifyError: "verification exploded" });
    assert.throws(() => deployPreparedTargets({
      ...metadata(item.repository),
      home: item.home,
      hosts: ["codex"],
      env: codex.env,
      codexLifecycle: codex.lifecycle,
      simulateFailure: "after-codex-add",
    }), (error) => {
      assert.equal(error instanceof AggregateError, true);
      assert.match(error.message, /rollback was incomplete/);
      assert.match(error.message, /simulated failure after Codex add/);
      assert.match(error.message, /restore exploded/);
      assert.match(error.message, /verification exploded/);
      return true;
    });
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test("the production Codex lifecycle restores prior absence after a mutating fixture failure", () => {
  const item = fixture();
  try {
    const codex = executableCodexFixture(item, { failNextAdd: true });
    const marketplaceBefore = readFileSync(item.marketplace, "utf8");
    assert.throws(() => deployPreparedTargets({
      ...metadata(item.repository),
      home: item.home,
      hosts: ["codex"],
      env: codex.env,
      codexBinary: codex.binary,
    }), /deployment rolled back: .*fixture activation failed after mutation/);
    const state = codex.readState();
    assert.equal(state.installed, null);
    assert.deepEqual(state.events.map((event) => event.action), ["add", "remove"]);
    assert.equal(existsSync(join(codex.env.CODEX_HOME, "plugins", "cache", "personal", plugin, state.events[0].version)), false);
    assert.equal(existsSync(deploymentPaths(item.home, plugin).codex), false);
    assert.equal(readFileSync(item.marketplace, "utf8"), marketplaceBefore);
    assert.equal(readFileSync(item.sentinel, "utf8"), "unchanged\n");
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test("the production Codex lifecycle restores a prior installation through a fixture executable", () => {
  const item = fixture();
  try {
    const codex = executableCodexFixture(item);
    const options = {
      ...metadata(item.repository),
      home: item.home,
      hosts: ["codex"],
      env: codex.env,
      codexBinary: codex.binary,
    };
    const first = deployPreparedTargets({ ...options, deployedAt: "2026-08-10T12:00:00.000Z" });
    const source = deploymentPaths(item.home, plugin).codex;
    const receiptBefore = readFileSync(join(source, ".local-deploy.json"), "utf8");
    const marketplaceBefore = readFileSync(item.marketplace, "utf8");
    writeFileSync(join(item.repository, ".build", "plugins", "codex", plugin, "payload.txt"), "production-rollback-candidate\n");
    assert.throws(() => deployPreparedTargets({
      ...options,
      deployedAt: "2026-08-10T12:01:00.000Z",
      simulateFailure: "after-codex-add",
    }), /deployment rolled back: simulated failure after Codex add/);
    const state = codex.readState();
    assert.equal(state.installed.version, first.targets.codex.local_version);
    assert.deepEqual(state.events.map((event) => event.action), ["add", "add", "remove", "add"]);
    assert.equal(state.events[0].version, state.events[3].version);
    assert.notEqual(state.events[1].version, state.events[0].version);
    assert.equal(existsSync(join(codex.env.CODEX_HOME, "plugins", "cache", "personal", plugin, state.events[1].version)), false);
    assert.equal(readFileSync(join(source, ".local-deploy.json"), "utf8"), receiptBefore);
    assert.equal(readFileSync(item.marketplace, "utf8"), marketplaceBefore);
    assert.equal(readFileSync(item.sentinel, "utf8"), "unchanged\n");
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});

test("the production Codex lifecycle rejects a symlinked cache ancestor before deletion", () => {
  const item = fixture();
  try {
    const codex = executableCodexFixture(item, { failNextAdd: true });
    const externalCache = join(item.root, "outside-codex-cache", plugin);
    const externalSentinel = join(externalCache, "sentinel.txt");
    mkdirSync(join(codex.env.CODEX_HOME, "plugins", "cache", "personal"), { recursive: true });
    mkdirSync(externalCache, { recursive: true });
    writeFileSync(externalSentinel, "unchanged\n");
    symlinkSync(externalCache, join(codex.env.CODEX_HOME, "plugins", "cache", "personal", plugin));
    assert.throws(() => deployPreparedTargets({
      ...metadata(item.repository),
      home: item.home,
      hosts: ["codex"],
      env: codex.env,
      codexBinary: codex.binary,
    }), (error) => {
      assert.equal(error instanceof AggregateError, true);
      assert.match(error.message, /rollback was incomplete/);
      assert.match(error.message, /Codex plugin cache crosses a symlink/);
      return true;
    });
    const state = codex.readState();
    assert.deepEqual(state.events.map((event) => event.action), ["add"]);
    assert.equal(readFileSync(externalSentinel, "utf8"), "unchanged\n");
    assert.equal(existsSync(join(externalCache, state.events[0].version, ".codex-plugin", "plugin.json")), true);
  } finally {
    rmSync(item.root, { recursive: true, force: true });
  }
});
