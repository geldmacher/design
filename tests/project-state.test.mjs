import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { detectProjectConflicts, diagnoseProject, inspectProject, setProjectHook, setupProject } from '../src/project-state.mjs';

function project() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'geldmacher-design-project-'));
}

test('setup writes nothing without explicit apply', (t) => {
  const root = project();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const before = fs.readdirSync(root);
  const result = setupProject(root, { host: 'cursor' });
  assert.equal(result.applied, false);
  assert.deepEqual(fs.readdirSync(root), before);
});

test('activation is strict opt-in and never creates a project hook manifest', (t) => {
  const root = project();
  const otherRoot = project();
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(otherRoot, { recursive: true, force: true });
  });
  assert.equal(inspectProject(root, { host: 'cursor' }).hook.enabled, false);
  const applied = setupProject(root, { host: 'cursor', apply: true });
  assert.equal(applied.applied, true);
  assert.equal(inspectProject(root, { host: 'cursor' }).hook.enabled, true);
  assert.equal(inspectProject(otherRoot, { host: 'cursor' }).hook.enabled, false);
  assert.equal(fs.existsSync(path.join(root, '.cursor', 'hooks.json')), false);
  setProjectHook(root, false, { host: 'cursor' });
  setProjectHook(root, true, { host: 'cursor' });
  assert.equal(fs.existsSync(path.join(root, '.cursor', 'hooks.json')), false);
});

test('direct Impeccable installations and duplicate hooks are detected and not overwritten', (t) => {
  const root = project();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.cursor', 'skills', 'impeccable'), { recursive: true });
  fs.writeFileSync(path.join(root, '.cursor', 'skills', 'impeccable', 'SKILL.md'), 'shadow');
  fs.writeFileSync(path.join(root, '.cursor', 'hooks.json'), JSON.stringify({ hooks: { preToolUse: [{ command: 'node .cursor/skills/impeccable/scripts/hook-before-edit.mjs' }] } }));
  assert.deepEqual(detectProjectConflicts(root, { host: 'cursor' }).map((finding) => finding.id).sort(), ['direct-impeccable-installation', 'duplicate-impeccable-hook']);
  const setup = setupProject(root, { host: 'cursor', apply: true });
  assert.equal(setup.blocked, true);
  assert.equal(fs.existsSync(path.join(root, '.impeccable')), false);
});

test('malformed config and missing Node produce honest non-blocking diagnostics', (t) => {
  const root = project();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.impeccable'), { recursive: true });
  fs.writeFileSync(path.join(root, '.impeccable', 'config.json'), '{broken');
  const report = diagnoseProject(root, { host: 'cursor', nodeAvailable: false });
  assert.equal(report.hook.enabled, false);
  assert.ok(report.findings.some((finding) => finding.id === 'malformed-impeccable-config'));
  assert.ok(report.findings.some((finding) => finding.id === 'node-missing'));
  assert.equal(setupProject(root, { host: 'cursor', apply: true }).blocked, true);
});

test('Codex uses the same strict opt-in without creating project hook manifests', (t) => {
  const root = project();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const initial = inspectProject(root, { host: 'codex' });
  assert.equal(initial.host, 'codex');
  assert.equal(initial.hook.enabled, false);
  assert.equal(initial.hook.mode, 'post-write-stop');

  const preview = setupProject(root, { host: 'codex' });
  assert.equal(preview.applied, false);
  assert.match(preview.plan.offers[0], /\$impeccable init/);
  const applied = setupProject(root, { host: 'codex', apply: true });
  assert.equal(applied.applied, true);
  assert.equal(inspectProject(root, { host: 'codex' }).hook.enabled, true);
  assert.equal(fs.existsSync(path.join(root, '.codex', 'hooks.json')), false);
});

test('Codex detects repository skills and project hooks without touching them', (t) => {
  const root = project();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.agents', 'skills', 'impeccable'), { recursive: true });
  fs.writeFileSync(path.join(root, '.agents', 'skills', 'impeccable', 'SKILL.md'), 'duplicate');
  fs.mkdirSync(path.join(root, '.codex'), { recursive: true });
  fs.writeFileSync(path.join(root, '.codex', 'hooks.json'), JSON.stringify({ hooks: { PostToolUse: [{ hooks: [{ command: 'node .agents/skills/impeccable/scripts/hook.mjs' }] }] } }));

  assert.deepEqual(detectProjectConflicts(root, { host: 'codex' }).map((finding) => finding.id).sort(), ['direct-impeccable-installation', 'duplicate-impeccable-hook']);
  assert.equal(setupProject(root, { host: 'codex', apply: true }).blocked, true);
  assert.equal(fs.existsSync(path.join(root, '.impeccable')), false);
});

for (const host of ['cursor', 'codex']) {
  test(`${host}: both hook entrypoints reconcile overrides, preserve settings and repeat without writes`, async (t) => {
    const { interceptPluginCommand } = await import('../src/impeccable-plugin-commands.mjs');
    const root = project();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const directory = path.join(root, '.impeccable');
    fs.mkdirSync(directory);
    const main = path.join(directory, 'config.json'), local = path.join(directory, 'config.local.json');
    fs.writeFileSync(main, JSON.stringify({ theme: 'keep', hook: { enabled: false, custom: 42 } }));
    fs.writeFileSync(local, JSON.stringify({ detector: { strict: true }, hook: { enabled: false, other: 'keep' } }));
    const before = [main, local].map(file => fs.readFileSync(file, 'utf8'));
    const preview = setupProject(root, { host });
    assert.equal(preview.plan.writes.length, 2);
    assert.deepEqual([main, local].map(file => fs.readFileSync(file, 'utf8')), before);
    const applied = setupProject(root, { host, apply: true });
    assert.equal(applied.state.hook.enabled, true);
    assert.deepEqual(applied.written, ['.impeccable/config.json', '.impeccable/config.local.json']);
    assert.deepEqual(setupProject(root, { host, apply: true }).written, []);
    for (const enabled of [false, true]) {
      const base = JSON.parse(fs.readFileSync(main));
      base.hook.enabled = enabled;
      fs.writeFileSync(main, JSON.stringify(base));
      const override = JSON.parse(fs.readFileSync(local));
      override.hook.enabled = !enabled;
      fs.writeFileSync(local, JSON.stringify(override));
      assert.equal(inspectProject(root, { host }).hook.enabled, !enabled);
      setProjectHook(root, enabled, { host });
      assert.equal(inspectProject(root, { host }).hook.enabled, enabled);
      interceptPluginCommand({ command: 'hooks', args: [enabled ? 'off' : 'on'], host, cwd: root });
      assert.equal(inspectProject(root, { host }).hook.enabled, !enabled);
    }
    assert.equal(JSON.parse(fs.readFileSync(main)).theme, 'keep');
    assert.equal(JSON.parse(fs.readFileSync(main)).hook.custom, 42);
    assert.deepEqual(JSON.parse(fs.readFileSync(local)).detector, { strict: true });
    assert.equal(JSON.parse(fs.readFileSync(local)).hook.other, 'keep');
    fs.unlinkSync(local);
    setProjectHook(root, true, { host });
    assert.equal(fs.existsSync(local), false);
    fs.writeFileSync(local, '{"other":"preserved byte for byte"}');
    setProjectHook(root, false, { host });
    assert.equal(fs.readFileSync(local, 'utf8'), '{"other":"preserved byte for byte"}');
  });
}

test('malformed and symlinked local configs block both writers before changing main config', async (t) => {
  const { interceptPluginCommand } = await import('../src/impeccable-plugin-commands.mjs');
  const root = project();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, '.impeccable');
  fs.mkdirSync(directory);
  const main = path.join(directory, 'config.json'), local = path.join(directory, 'config.local.json');
  const original = '{"hook":{"enabled":false}}';
  fs.writeFileSync(main, original);
  for (const invalid of ['{broken', 'null', '[]', '{"hook":{"enabled":"yes"}}']) {
    fs.writeFileSync(local, invalid);
    assert.equal(setupProject(root, { host: 'cursor', apply: true }).blocked, true);
    assert.throws(() => interceptPluginCommand({ command: 'hooks', args: ['on'], host: 'codex', cwd: root }), /Malformed/);
    assert.equal(fs.readFileSync(main, 'utf8'), original);
  }
  fs.unlinkSync(local);
  fs.symlinkSync(path.join(root, 'absent'), local);
  assert.equal(setupProject(root, { host: 'codex', apply: true }).blocked, true);
  assert.throws(() => setProjectHook(root, true, { host: 'cursor' }), /Malformed/);
  assert.equal(fs.readFileSync(main, 'utf8'), original);
});

test('partial atomic-write failure reports changed files and effective state, cleans temporary files', (t) => {
  const root = project();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, '.impeccable');
  fs.mkdirSync(directory);
  for (const name of ['config.json', 'config.local.json']) fs.writeFileSync(path.join(directory, name), '{"hook":{"enabled":false}}');
  const rename = fs.renameSync;
  t.mock.method(fs, 'renameSync', (from, to) => {
    if (to.endsWith('config.local.json')) throw new Error('simulated rename failure');
    return rename(from, to);
  });
  assert.throws(() => setupProject(root, { host: 'cursor', apply: true }), /after writing .impeccable\/config.json; effective state: disabled.*simulated rename failure/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'config.json'))).hook.enabled, true);
  assert.equal(inspectProject(root, { host: 'cursor' }).hook.enabled, false);
  assert.deepEqual(fs.readdirSync(directory).sort(), ['config.json', 'config.local.json']);
});

test('native CLI JSON reports the effective activation after updating a local override', async (t) => {
  const { spawnSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const cli = fileURLToPath(new URL('../skills/design/scripts/design-cli.mjs', import.meta.url));
  const root = project();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.impeccable'));
  const local = path.join(root, '.impeccable/config.local.json');
  for (const host of ['cursor', 'codex']) for (const enabled of [true, false]) {
    fs.writeFileSync(local, JSON.stringify({ hook: { enabled: !enabled } }));
    const child = spawnSync(process.execPath, [cli, '--host', host, 'hook', enabled ? 'on' : 'off', '--json'], { cwd: root, encoding: 'utf8' });
    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(JSON.parse(child.stdout), { written: '.impeccable/config.json', enabled, host });
    assert.equal(inspectProject(root, { host }).hook.enabled, enabled);
  }
});
