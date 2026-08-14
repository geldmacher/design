import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { runDetectorScan } from '../src/detector-scan.mjs';
import {
  impeccableRuntimeEnvironment,
  resolveBundledImpeccableScript,
  runBundledImpeccable,
} from '../src/impeccable-runtime.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const designCli = path.join(pluginRoot, 'skills', 'design', 'scripts', 'design-cli.mjs');
const impeccablePin = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'upstream', 'impeccable.pin.json'), 'utf8'));

function temporaryProject(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'geldmacher-design-detect-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function write(root, relative, content) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  return target;
}

function runCli(root, args, host = 'codex') {
  const result = spawnSync(process.execPath, [designCli, '--host', host, 'detect', '--json', ...args], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.ok(result.stdout, result.stderr);
  return { ...result, envelope: JSON.parse(result.stdout) };
}

function findingFixture() {
  return '<style>.card { border-left: 4px solid #7c3aed; border-radius: 16px; }</style><div class="card">Hello</div>\n';
}

test('runtime facade resolves only physical bundled scripts and sets one explicit host', (t) => {
  const resolved = resolveBundledImpeccableScript(pluginRoot, 'detect');
  assert.equal(resolved.relativeScript, 'skills/impeccable/scripts/detect.mjs');
  assert.ok(resolved.scriptPath.startsWith(`${fs.realpathSync(pluginRoot)}${path.sep}`));

  const codexEnv = impeccableRuntimeEnvironment('codex', pluginRoot, {
    CURSOR_PLUGIN_ROOT: '/stale-cursor',
    PLUGIN_ROOT: '/stale-codex',
  });
  assert.equal(codexEnv.IMPECCABLE_HOST, 'codex');
  assert.equal(codexEnv.PLUGIN_ROOT, pluginRoot);
  assert.equal(codexEnv.CURSOR_PLUGIN_ROOT, undefined);
  assert.equal(codexEnv.IMPECCABLE_NO_UPDATE_CHECK, '1');

  let observed;
  const child = runBundledImpeccable({
    scriptId: 'detect',
    host: 'agent-plugin',
    pluginRoot,
    cwd: pluginRoot,
    args: ['--json', '.'],
    timeout: 1234,
    spawn(command, args, options) {
      observed = { command, args, options };
      return { status: 0, stdout: '[]\n', stderr: '', signal: null };
    },
  });
  assert.equal(child.started, true);
  assert.equal(observed.command, process.execPath);
  assert.equal(observed.options.shell, false);
  assert.equal(observed.options.timeout, 1234);
  assert.equal(observed.options.env.IMPECCABLE_HOST, 'agent-plugin');
  assert.equal(observed.options.env.CURSOR_PLUGIN_ROOT, undefined);
  assert.equal(observed.options.env.PLUGIN_ROOT, undefined);

  const fakeRoot = temporaryProject(t);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'geldmacher-design-runtime-outside-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.mkdirSync(path.join(outside, 'impeccable', 'scripts'), { recursive: true });
  write(outside, 'impeccable/scripts/detect.mjs', '');
  fs.mkdirSync(path.join(fakeRoot, 'skills'), { recursive: true });
  fs.symlinkSync(path.join(outside, 'impeccable'), path.join(fakeRoot, 'skills', 'impeccable'));
  assert.throws(() => resolveBundledImpeccableScript(fakeRoot, 'detect'), /crosses a symlink/);
});

test('design detect reports no findings, primary findings, advisory-only findings, and exact provenance', (t) => {
  const root = temporaryProject(t);
  write(root, 'src/Clean.jsx', 'export default function Clean() { return <main>Hello</main>; }\n');
  write(root, 'src/Card.html', findingFixture());
  write(root, 'src/Advisory.html', '<!doctype html><html><body><main><p>One—two—three—four—five—six—seven—eight—nine</p></main></body></html>\n');

  const clean = runCli(root, ['--', 'src/Clean.jsx']);
  assert.equal(clean.status, 0, clean.stderr);
  assert.equal(clean.envelope.status, 'no-findings');
  assert.deepEqual(clean.envelope.counts, { primary: 0, advisory: 0, total: 0 });
  assert.equal(clean.envelope.detector.source, 'bundled-impeccable');
  assert.equal(clean.envelope.detector.skillVersion, impeccablePin.version);
  assert.equal(clean.envelope.detector.tag, impeccablePin.tag);

  const finding = runCli(root, ['--', 'src/Card.html']);
  assert.equal(finding.status, 2, finding.stderr);
  assert.equal(finding.envelope.status, 'findings');
  assert.ok(finding.envelope.counts.primary > 0);
  assert.ok(finding.envelope.findings.some((item) => item.ruleId === 'side-tab' && item.file === 'src/Card.html'));
  assert.equal(finding.envelope.findings.every((item) => typeof item.description === 'string'), true);

  const advisory = runCli(root, ['--', 'src/Advisory.html']);
  assert.equal(advisory.status, 0, advisory.stderr);
  assert.equal(advisory.envelope.status, 'advisory-only');
  assert.equal(advisory.envelope.counts.primary, 0);
  assert.ok(advisory.envelope.findings.some((item) => item.ruleId === 'em-dash-overuse' && item.advisory));
});

test('design detect requires explicit contained local targets and deduplicates canonical paths', (t) => {
  const fixtureRoot = temporaryProject(t);
  const root = path.join(fixtureRoot, 'project');
  const outside = write(fixtureRoot, 'outside.jsx', 'export default function Outside() { return <main/>; }\n');
  fs.mkdirSync(root, { recursive: true });
  const cleanPath = write(root, 'src/Clean.jsx', 'export default function Clean() { return <main>Hello</main>; }\n');
  write(root, '-', 'export default function StdinSentinel() { return <main/>; }\n');
  fs.symlinkSync(cleanPath, path.join(root, 'src', 'Alias.jsx'));
  fs.symlinkSync(outside, path.join(root, 'src', 'OutsideAlias.jsx'));

  const missingSeparator = runCli(root, []);
  assert.equal(missingSeparator.status, 1);
  assert.equal(missingSeparator.envelope.status, 'blocked');
  assert.equal(missingSeparator.envelope.diagnostics[0].code, 'target-separator-required');

  const missingTarget = runCli(root, ['--']);
  assert.equal(missingTarget.status, 1);
  assert.equal(missingTarget.envelope.diagnostics[0].code, 'target-required');

  const emptyTarget = runCli(root, ['--', '']);
  assert.equal(emptyTarget.status, 1);
  assert.equal(emptyTarget.envelope.diagnostics[0].code, 'target-empty');

  const stdinTarget = runCli(root, ['--', '-']);
  assert.equal(stdinTarget.status, 1);
  assert.equal(stdinTarget.envelope.diagnostics[0].code, 'stdin-unsupported');

  const upstreamFlag = runCli(root, ['--no-config', '--', 'src/Clean.jsx']);
  assert.equal(upstreamFlag.status, 1);
  assert.equal(upstreamFlag.envelope.diagnostics[0].code, 'unsupported-option');

  for (const [target, code] of [
    ['https://example.com', 'unsupported-target'],
    ['src/Missing.jsx', 'target-missing'],
    ['../outside.jsx', 'target-outside-project'],
    ['src/OutsideAlias.jsx', 'target-outside-project'],
  ]) {
    const result = runCli(root, ['--', target]);
    assert.equal(result.status, 1, `${target}: ${result.stderr}`);
    assert.equal(result.envelope.status, 'blocked');
    assert.equal(result.envelope.diagnostics[0].code, code);
  }

  let nestedRuntimeInvoked = false;
  const nestedEscape = runDetectorScan({
    projectRoot: root,
    targets: ['src'],
    pluginRoot,
    host: 'codex',
    runtime: () => {
      nestedRuntimeInvoked = true;
      return { started: true, status: 0, stdout: '[]', stderr: '', error: null, timedOut: false };
    },
  });
  assert.equal(nestedEscape.exitCode, 1);
  assert.equal(nestedEscape.envelope.diagnostics[0].code, 'target-symlink-outside-project');
  assert.equal(nestedEscape.envelope.diagnostics[0].target, 'src/OutsideAlias.jsx');
  assert.equal(nestedRuntimeInvoked, false);

  const deduplicated = runCli(root, ['--', 'src/Clean.jsx', 'src/Alias.jsx']);
  assert.equal(deduplicated.status, 0, deduplicated.stderr);
  assert.deepEqual(deduplicated.envelope.targets, ['src/Clean.jsx']);

  fs.unlinkSync(path.join(root, 'src', 'OutsideAlias.jsx'));
  const explicitRoot = runCli(root, ['--', '.']);
  assert.ok([0, 2].includes(explicitRoot.status), explicitRoot.stderr);
  assert.deepEqual(explicitRoot.envelope.targets, ['.']);
});

test('finding normalization resolves physical files and blocks symlink escapes', (t) => {
  const fixtureRoot = temporaryProject(t);
  const root = path.join(fixtureRoot, 'project');
  const outside = write(fixtureRoot, 'outside.html', findingFixture());
  const clean = write(root, 'src/Clean.jsx', 'export default function Clean() { return <main>Hello</main>; }\n');
  fs.symlinkSync(outside, path.join(root, 'src', 'Reported.html'));

  const result = runDetectorScan({
    projectRoot: root,
    targets: [clean],
    pluginRoot,
    host: 'cursor',
    runtime: () => ({
      started: true,
      status: 2,
      stderr: '',
      error: null,
      timedOut: false,
      stdout: JSON.stringify([{
        antipattern: 'side-tab',
        name: 'Side tab',
        description: 'Finding',
        severity: 'warning',
        category: 'quality',
        file: path.join(root, 'src/Reported.html'),
        line: 1,
        snippet: 'fixture',
      }]),
    }),
  });

  assert.equal(result.exitCode, 1);
  assert.equal(result.envelope.status, 'blocked');
  assert.equal(result.envelope.diagnostics[0].code, 'invalid-detector-finding');
  assert.match(result.envelope.diagnostics[0].message, /outside the project root/);
});

test('design detect respects project and inline waivers, ignores hook state, and never writes project state', (t) => {
  const plain = temporaryProject(t);
  write(plain, 'src/Card.html', findingFixture());
  const before = fs.readdirSync(plain);
  const plainResult = runCli(plain, ['--', 'src/Card.html']);
  assert.equal(plainResult.status, 2, plainResult.stderr);
  assert.deepEqual(fs.readdirSync(plain), before);
  assert.equal(fs.existsSync(path.join(plain, '.impeccable')), false);

  const configured = temporaryProject(t);
  write(configured, 'src/Card.html', findingFixture());
  write(configured, '.impeccable/config.json', `${JSON.stringify({ hook: { enabled: false }, detector: { ignoreRules: ['side-tab'] } }, null, 2)}\n`);
  write(configured, '.agents/skills/impeccable/SKILL.md', 'duplicate project skill\n');
  const configuredResult = runCli(configured, ['--', 'src/Card.html']);
  assert.equal(configuredResult.status, 0, configuredResult.stderr);
  assert.equal(configuredResult.envelope.status, 'no-findings');
  assert.equal(configuredResult.envelope.detector.source, 'bundled-impeccable');

  const inline = temporaryProject(t);
  write(inline, 'src/Card.html', `<!-- impeccable-disable side-tab: intentional legacy card -->\n${findingFixture()}`);
  const inlineResult = runCli(inline, ['--', 'src/Card.html']);
  assert.equal(inlineResult.status, 0, inlineResult.stderr);
  assert.equal(inlineResult.envelope.findings.some((item) => item.ruleId === 'side-tab'), false);
});

test('detector transport and schema failures are blocked and never become no-findings', (t) => {
  const root = temporaryProject(t);
  write(root, 'src/Clean.jsx', 'export default function Clean() { return <main>Hello</main>; }\n');

  const cases = [
    {
      code: 'detector-failed',
      runtime: () => ({ started: false, status: null, stdout: '', stderr: '', error: 'Bundled runtime is missing.', timedOut: false }),
    },
    {
      code: 'detector-timeout',
      runtime: () => ({ started: false, status: null, stdout: '', stderr: '', error: 'timed out', timedOut: true }),
    },
    {
      code: 'invalid-detector-json',
      runtime: () => ({ started: true, status: 0, stdout: '{broken', stderr: '', error: null, timedOut: false }),
    },
    {
      code: 'detector-exit-mismatch',
      runtime: () => ({
        started: true,
        status: 0,
        stderr: '',
        error: null,
        timedOut: false,
        stdout: JSON.stringify([{
          antipattern: 'side-tab',
          name: 'Side tab',
          description: 'Finding',
          severity: 'warning',
          category: 'quality',
          file: path.join(fs.realpathSync(root), 'src/Clean.jsx'),
          line: 1,
          snippet: 'fixture',
        }]),
      }),
    },
  ];

  for (const fixture of cases) {
    const result = runDetectorScan({
      projectRoot: root,
      targets: ['src/Clean.jsx'],
      pluginRoot,
      host: 'cursor',
      runtime: fixture.runtime,
    });
    assert.equal(result.exitCode, 1);
    assert.equal(result.envelope.status, 'blocked');
    assert.equal(result.envelope.counts.total, 0);
    assert.equal(result.envelope.findings.length, 0);
    assert.equal(result.envelope.diagnostics[0].code, fixture.code);
  }
});
