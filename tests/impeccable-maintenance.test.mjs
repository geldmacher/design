import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  checkUpstream,
  compareVersions,
  evaluateReleases,
  issueMarker,
  readPin,
  reconcileUpdateIssue,
  renderUpdateIssue,
  sha256Bytes,
  validatePin,
} from "../scripts/lib/impeccable-maintenance.mjs";
import {
  agentNames,
  applyCandidate,
  candidateDestinations,
  createCandidateFromInputs,
  hashPath,
  materializeGitSource,
  validateArchiveEntryName,
  verifyArchiveMatchesSource,
} from "../scripts/lib/impeccable-vendor.mjs";

const fixedTime = "2026-08-12T10:00:00.000Z";

function write(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value);
}

function pin(version = "4.0.4", overrides = {}) {
  const tag = `skill-v${version}`;
  return {
    $schema: "./impeccable.pin.schema.json",
    schemaVersion: 1,
    name: "Impeccable",
    version,
    repository: "https://github.com/pbakaus/impeccable",
    tag,
    tagObject: "1".repeat(40),
    commit: "2".repeat(40),
    archive: {
      name: "universal.zip",
      url: `https://github.com/pbakaus/impeccable/releases/download/${tag}/universal.zip`,
      sha256: "3".repeat(64),
    },
    ...overrides,
  };
}

function release(version, overrides = {}) {
  const tag = `skill-v${version}`;
  return {
    tag_name: tag,
    draft: false,
    prerelease: false,
    html_url: `https://github.com/pbakaus/impeccable/releases/tag/${tag}`,
    published_at: fixedTime,
    assets: [{ name: "universal.zip", browser_download_url: `https://github.com/pbakaus/impeccable/releases/download/${tag}/universal.zip` }],
    ...overrides,
  };
}

const crcTable = Array.from({ length: 256 }, (_, seed) => {
  let value = seed;
  for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function storedZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const [name, raw] of entries) {
    const nameBytes = Buffer.from(name);
    const bytes = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    const checksum = crc32(bytes);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(bytes.length, 18);
    local.writeUInt32LE(bytes.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    localParts.push(local, nameBytes, bytes);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(bytes.length, 20);
    central.writeUInt32LE(bytes.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBytes);
    offset += local.length + nameBytes.length + bytes.length;
  }
  const central = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, central, end]);
}

function sourceFiles(version) {
  return new Map([
    [".cursor/skills/impeccable/SKILL.md", [
      "---",
      "name: impeccable",
      "description: Fixture",
      `version: ${version}`,
      "license: Apache 2.0",
      "---",
      "This skill gives you the tools and permission to create design fixtures.",
      "node .cursor/skills/impeccable/scripts/context.mjs",
      "**Pin / Unpin:**",
      "Fixture pin guidance.",
      "**Hooks:**",
      "Fixture hook guidance.",
      "",
    ].join("\n")],
    [".cursor/skills/impeccable/reference/hooks.md", [
      "# /impeccable hooks",
      "record local hook consent as accepted, and install/repair provider hook manifests when the skill is installed.",
      "- The hook is bundled with the Impeccable skill and installed through project-local manifests: fixture",
      "",
    ].join("\n")],
    [".cursor/skills/impeccable/scripts/context.mjs", [
      "const FETCH_TIMEOUT_MS = 1200;",
      "async function computeUpdateDirective(now = Date.now()) {",
      "  try {",
      "    return now;",
      "  } catch {}",
      "}",
      "function enabledNames() {",
      "  let enabled = true;",
      "  for (const name of []) enabled = Boolean(name);",
      "  return enabled;",
      "}",
      "function hookMode(ctx) {",
      "  const activeRoot = path.resolve(ctx.projectRoot || process.cwd());",
      "  if (!hookEnabledAt(activeRoot)) return 'none';",
      "  const manifests = HOOK_MANIFESTS_BY_PROVIDER[IMPECCABLE_PROVIDER_ID] || [];",
      "  return manifests.length;",
      "}",
      "",
    ].join("\n")],
    [".cursor/skills/impeccable/scripts/hook-admin.mjs", [
      "import { IMPECCABLE_COMMAND } from './lib/provider.mjs';",
      "const STATUS_MESSAGE = 'Checking UI changes';",
      "async function administer(cwd, local, shared) {",
      "  const cfg = readConfig(cwd);",
      "  const envKill = process.env.IMPECCABLE_HOOK_DISABLED;",
      "  const line = `  state:        ${cfg.enabled ? 'enabled' : 'disabled'}`;",
      "  const repaired = repairHookManifests(cwd);",
      "  try {",
      "    let out = '';",
      "    return { cfg, envKill, line, repaired, out };",
      "  } catch {}",
      "}",
      "",
    ].join("\n")],
    [".cursor/skills/impeccable/scripts/lib/provider.mjs", "export const IMPECCABLE_COMMAND = '/impeccable';\n"],
    [".cursor/skills/impeccable/scripts/lib/staleness-deep.mjs", "export function checkHookInstallation({ projectRoot, repoRoot, providerId }) {\n  const findings = [];\n  return findings;\n}\n"],
    [".cursor/skills/impeccable/scripts/pin.mjs", "process.stdout.write('fixture');\n"],
    [".cursor/skills/impeccable/reference/plain.md", "No transformation is required.\n"],
    [".cursor/skills/impeccable/assets/binary.bin", Buffer.from([0x00, 0x7f, 0x80, 0xff])],
    ...agentNames.map((name) => [`.cursor/agents/${name}`, `# ${name}\nnode .cursor/skills/impeccable/scripts/context.mjs\n`]),
    ["LICENSE", "Apache fixture license\n"],
  ]);
}

function createTaggedSource(root, version = "4.0.5") {
  const source = join(root, "source");
  const files = sourceFiles(version);
  for (const [relative, contents] of files) write(join(source, relative), contents);
  execFileSync("git", ["init", "--quiet", source]);
  execFileSync("git", ["-C", source, "config", "user.name", "Fixture"]);
  execFileSync("git", ["-C", source, "config", "user.email", "fixture@example.invalid"]);
  execFileSync("git", ["-C", source, "add", "."]);
  execFileSync("git", ["-C", source, "commit", "--quiet", "-m", "fixture"]);
  const tag = `skill-v${version}`;
  execFileSync("git", ["-C", source, "tag", "-a", tag, "-m", "fixture tag"]);
  return {
    source,
    files,
    tag,
    tagObject: execFileSync("git", ["-C", source, "rev-parse", tag], { encoding: "utf8" }).trim(),
    commit: execFileSync("git", ["-C", source, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  };
}

function writeArchive(path, files, extra = []) {
  const archiveEntries = [...files.entries()].filter(([name]) => name !== "LICENSE");
  writeFileSync(path, storedZip([...archiveEntries, ...extra]));
}

function moduleDocument(id, version, source = null) {
  return {
    $schema: "./module.schema.json",
    schemaVersion: 1,
    id,
    version,
    ...(source ? { source } : { source: { type: "first-party", url: "https://github.com/geldmacher/design" } }),
    license: id === "impeccable" ? "Apache-2.0" : "MIT",
    capabilities: [{ id: `${id}-fixture`, title: `${id} fixture`, skill: id === "impeccable" ? "impeccable" : "design", specificity: id === "impeccable" ? 10 : 100, fallback: id === "impeccable", triggers: [id], scope: ["fixture"], combinableWith: [] }],
    contributes: { skills: [], agents: [], rules: [], hooks: [], scripts: [], mcpServers: [] },
  };
}

function createRepositoryFixture(base) {
  const root = join(base, "repository");
  const approved = pin();
  write(join(root, "upstream", "impeccable.pin.json"), `${JSON.stringify(approved, null, 2)}\n`);
  write(join(root, "upstream", "impeccable.lock.json"), "{\"fixture\":true}\n");
  write(join(root, "upstream", "NOTICE"), "old notice\n");
  write(join(root, "upstream", "LICENSE"), "old license\n");
  write(join(root, "upstream", "patches", "impeccable-plugin.patch"), "old patch\n");
  write(join(root, "THIRD_PARTY_NOTICES.md"), "- Source: https://github.com/pbakaus/impeccable\n- Pinned release: `skill-v4.0.4`\n");
  write(join(root, "modules", "impeccable.json"), `${JSON.stringify(moduleDocument("impeccable", approved.version, { type: "vendored", url: approved.repository, tag: approved.tag, commit: approved.commit, archiveSha256: approved.archive.sha256 }), null, 2)}\n`);
  write(join(root, "modules", "design-core.json"), `${JSON.stringify(moduleDocument("design-core", "0.3.0"), null, 2)}\n`);
  write(join(root, "skills", "design", "references", "capabilities.md"), "old capabilities\n");
  write(join(root, "skills", "impeccable", "old.txt"), "old skill\n");
  for (const name of agentNames) write(join(root, "agents", name), `old ${name}\n`);
  write(join(root, "agents", "first-party.md"), "unrelated dirty agent\n");
  return root;
}

function candidateFixture(t) {
  const base = mkdtempSync(join(tmpdir(), "impeccable-maintenance-"));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const repository = createRepositoryFixture(base);
  const tagged = createTaggedSource(base);
  const archive = join(base, "universal.zip");
  writeArchive(archive, tagged.files);
  const candidatePin = pin("4.0.5", {
    tagObject: tagged.tagObject,
    commit: tagged.commit,
    archive: {
      name: "universal.zip",
      url: "https://github.com/pbakaus/impeccable/releases/download/skill-v4.0.5/universal.zip",
      sha256: sha256Bytes(readFileSync(archive)),
    },
  });
  return { base, repository, archive, candidatePin, ...tagged };
}

test("pin validation and projections fail closed on drift", () => {
  const valid = validatePin(pin());
  assert.equal(valid.tag, "skill-v4.0.4");
  assert.throws(() => validatePin({ ...pin(), tag: "skill-v4.0.5" }), /tag must equal/);
  assert.throws(() => validatePin({ ...pin(), unexpected: true }), /keys differ/);
  const root = mkdtempSync(join(tmpdir(), "impeccable-pin-"));
  try {
    write(join(root, "upstream", "impeccable.pin.json"), `${JSON.stringify(pin())}\n`);
    assert.equal(readPin(root).version, "4.0.4");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("stable release comparison uses three numeric components and honest states", () => {
  assert.equal(compareVersions("4.0.10", "4.0.9"), 1);
  assert.equal(compareVersions("5.0.0", "4.99.99"), 1);
  assert.equal(compareVersions("4.0.4", "4.0.4"), 0);
  assert.throws(() => compareVersions("4.0", "4.0.1"), /invalid stable/);

  const releases = [
    release("4.0.4"),
    release("4.0.10"),
    release("99.0.0", { prerelease: true }),
    release("4.0.11", { tag_name: "skill-v4.0.11-beta" }),
    release("5.0.0", { assets: [] }),
  ];
  const update = evaluateReleases(pin(), releases, fixedTime);
  assert.equal(update.state, "update-available");
  assert.equal(update.latest.tag, "skill-v4.0.10");
  assert.equal(evaluateReleases(pin(), [release("4.0.4")], fixedTime).state, "current");
  assert.equal(evaluateReleases(pin(), [release("4.0.5")], fixedTime).state, "unverifiable");
});

test("HTTP, rate-limit, malformed, and request failures remain unverifiable", async () => {
  const now = () => new Date(fixedTime);
  const rateLimited = await checkUpstream({ pin: pin(), now, fetchImpl: async () => ({ ok: false, status: 403, headers: { get: () => "0" } }) });
  assert.equal(rateLimited.state, "unverifiable");
  assert.equal(rateLimited.error.code, "rate-limited");
  const http = await checkUpstream({ pin: pin(), now, fetchImpl: async () => ({ ok: false, status: 500, headers: { get: () => null } }) });
  assert.equal(http.error.code, "http-500");
  const malformed = await checkUpstream({ pin: pin(), now, fetchImpl: async () => ({ ok: true, json: async () => ({}) }) });
  assert.equal(malformed.state, "unverifiable");
  assert.equal(malformed.error.code, "request-failed");
  const failed = await checkUpstream({ pin: pin(), now, fetchImpl: async () => { throw new Error("offline"); } });
  assert.equal(failed.state, "unverifiable");
  assert.notEqual(failed.state, "current");
});

test("archive validation rejects unsafe names, mismatches, missing files, and missing unzip", (t) => {
  const fixture = candidateFixture(t);
  assert.equal(verifyArchiveMatchesSource({ archive: fixture.archive, source: fixture.source }).files, fixture.files.size - 1);
  assert.throws(() => validateArchiveEntryName("../escape"), /Unsafe archive entry/);
  const unsafe = join(fixture.base, "unsafe.zip");
  writeFileSync(unsafe, storedZip([["../escape", "bad"]]));
  assert.throws(() => verifyArchiveMatchesSource({ archive: unsafe, source: fixture.source }), /Unsafe archive entry/);
  const missing = join(fixture.base, "missing.zip");
  writeArchive(missing, new Map([...fixture.files.entries()].filter(([name]) => !name.endsWith("plain.md"))));
  assert.throws(() => verifyArchiveMatchesSource({ archive: missing, source: fixture.source }), /scope differs/);
  const extra = join(fixture.base, "extra.zip");
  writeArchive(extra, fixture.files, [[".cursor/skills/impeccable/unexpected.md", "extra\n"]]);
  assert.throws(() => verifyArchiveMatchesSource({ archive: extra, source: fixture.source }), /scope differs/);
  write(join(fixture.source, ".cursor", "skills", "impeccable", "reference", "plain.md"), "drifted\n");
  assert.throws(() => verifyArchiveMatchesSource({ archive: fixture.archive, source: fixture.source }), /differs from tag checkout/);
  const missingTool = () => { throw Object.assign(new Error("missing"), { code: "ENOENT" }); };
  assert.throws(() => verifyArchiveMatchesSource({ archive: fixture.archive, source: fixture.source, exec: missingTool }), /unzip is required/);
});

test("tag objects are materialized as bytes without a Git checkout", (t) => {
  const fixture = candidateFixture(t);
  const materialized = join(fixture.base, "materialized");
  materializeGitSource(fixture.source, fixture.commit, materialized);
  assert.deepEqual(
    readFileSync(join(materialized, ".cursor", "skills", "impeccable", "assets", "binary.bin")),
    Buffer.from([0x00, 0x7f, 0x80, 0xff]),
  );
  assert.throws(() => readFileSync(join(materialized, ".git")), /EISDIR|ENOENT/);
});

test("candidate identity detects drift and transactional apply restores exact fixture bytes", (t) => {
  const fixture = candidateFixture(t);
  const prepared = createCandidateFromInputs({ root: fixture.repository, source: fixture.source, archive: fixture.archive, pin: fixture.candidatePin, createdAt: fixedTime });
  assert.match(prepared.candidateId, /^iu-[0-9a-f]{16}$/);
  assert.equal(prepared.path, join(fixture.repository, ".build", "impeccable-candidates", prepared.candidateId));
  const manifest = JSON.parse(readFileSync(join(prepared.path, "candidate.json"), "utf8"));
  assert.equal(manifest.identity.upstream.tagObject, fixture.candidatePin.tagObject);
  assert.equal(manifest.identity.upstream.archiveSha256, fixture.candidatePin.archive.sha256);
  assert.equal(typeof manifest.identity.inventorySha256, "string");
  assert.equal(typeof manifest.identity.transformationPatchSha256, "string");
  assert.equal(typeof manifest.identity.repositoryPatchSha256, "string");

  const notice = join(fixture.repository, "THIRD_PARTY_NOTICES.md");
  const originalNotice = readFileSync(notice);
  writeFileSync(notice, Buffer.concat([originalNotice, Buffer.from("drift\n")]));
  assert.throws(() => applyCandidate({ root: fixture.repository, candidateId: prepared.candidateId }), /baseline drift/);
  writeFileSync(notice, originalNotice);

  const projectionNotice = join(prepared.path, "projection", "upstream", "NOTICE");
  const projectedBytes = readFileSync(projectionNotice);
  writeFileSync(projectionNotice, "candidate drift\n");
  assert.throws(() => applyCandidate({ root: fixture.repository, candidateId: prepared.candidateId }), /projection drift/);
  writeFileSync(projectionNotice, projectedBytes);

  const before = Object.fromEntries(candidateDestinations.map((destination) => [destination, hashPath(join(fixture.repository, destination))]));
  assert.throws(() => applyCandidate({ root: fixture.repository, candidateId: prepared.candidateId, failAfter: 2 }), /Injected candidate apply failure/);
  for (const destination of candidateDestinations) assert.equal(hashPath(join(fixture.repository, destination)), before[destination], `rollback drifted ${destination}`);

  const applied = applyCandidate({ root: fixture.repository, candidateId: prepared.candidateId });
  assert.deepEqual(applied.applied, [...candidateDestinations]);
  assert.equal(readPin(fixture.repository).version, "4.0.5");
  assert.equal(readFileSync(join(fixture.repository, "agents", "first-party.md"), "utf8"), "unrelated dirty agent\n");
});

test("annotated tag identity mismatch aborts candidate preparation", (t) => {
  const fixture = candidateFixture(t);
  const wrongPin = { ...fixture.candidatePin, tagObject: "f".repeat(40) };
  assert.throws(() => createCandidateFromInputs({ root: fixture.repository, source: fixture.source, archive: fixture.archive, pin: wrongPin }), /tag object mismatch/);
});

test("issue reconciliation writes only one marked issue for update-available", async () => {
  const result = evaluateReleases(pin(), [release("4.0.4"), release("4.0.5")], fixedTime);
  const desired = renderUpdateIssue(result);
  assert.match(desired.body, new RegExp(issueMarker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(desired.body, /prepare:impeccable-update/);

  let calls = 0;
  const noWrite = await reconcileUpdateIssue({
    result: evaluateReleases(pin(), [release("4.0.4")], fixedTime),
    fetchImpl: async () => { calls += 1; throw new Error("must not call"); },
  });
  assert.deepEqual(noWrite, { action: "none", reason: "current" });
  assert.equal(calls, 0);
  const unverifiableNoWrite = await reconcileUpdateIssue({
    result: { ...result, state: "unverifiable" },
    fetchImpl: async () => { calls += 1; throw new Error("must not call"); },
  });
  assert.deepEqual(unverifiableNoWrite, { action: "none", reason: "unverifiable" });
  assert.equal(calls, 0);

  const createdRequests = [];
  const created = await reconcileUpdateIssue({
    result,
    repository: "geldmacher/design",
    token: "fixture-token",
    fetchImpl: async (url, options) => {
      createdRequests.push({ url, options });
      if (options.method === "GET") return { ok: true, status: 200, json: async () => [] };
      return { ok: true, status: 201, json: async () => ({ number: 7, html_url: "https://example.invalid/7" }) };
    },
  });
  assert.equal(created.action, "created");
  assert.equal(createdRequests.filter(({ options }) => options.method !== "GET").length, 1);
  assert.equal(JSON.parse(createdRequests[1].options.body).body.includes(issueMarker), true);

  const existing = { number: 7, title: "old", body: `${issueMarker}\nold`, html_url: "https://example.invalid/7" };
  const updatedRequests = [];
  const updated = await reconcileUpdateIssue({
    result,
    repository: "geldmacher/design",
    token: "fixture-token",
    fetchImpl: async (url, options) => {
      updatedRequests.push({ url, options });
      if (options.method === "GET") return { ok: true, status: 200, json: async () => [existing] };
      return { ok: true, status: 200, json: async () => ({ number: 7, html_url: "https://example.invalid/7" }) };
    },
  });
  assert.equal(updated.action, "updated");
  assert.equal(updatedRequests.at(-1).options.method, "PATCH");

  const unchanged = await reconcileUpdateIssue({
    result,
    repository: "geldmacher/design",
    token: "fixture-token",
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => [{ number: 7, ...desired, html_url: "https://example.invalid/7" }] }),
  });
  assert.equal(unchanged.action, "unchanged");
});
