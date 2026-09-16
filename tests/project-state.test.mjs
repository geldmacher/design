import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readProjectContext } from '../src/project-context.mjs';
import { detectProjectConflicts, diagnoseProject, inspectProject, setProjectHook, setupProject } from '../src/project-state.mjs';

function project() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'geldmacher-design-project-'));
}

const cli = fileURLToPath(new URL('../skills/design/scripts/design-cli.mjs', import.meta.url));
function fixture(t) {
  const root = project();
  const cwd = path.join(root, 'project with spaces'), home = path.join(root, 'home');
  fs.mkdirSync(cwd); fs.mkdirSync(home);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (relative, value) => { const file = path.join(cwd, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); };
  const run = (host, args, directory = cwd) => {
    const child = spawnSync(process.execPath, [cli, '--host', host, ...args, '--json'], { cwd: directory, encoding: 'utf8', timeout: 15000,
      env: { ...process.env, HOME: home, USERPROFILE: home, IMPECCABLE_UPDATE_CACHE: path.join(home, 'updates.json') } });
    assert.equal(child.status, 0, child.stderr);
    return JSON.parse(child.stdout);
  };
  return { root, cwd, home, write, run };
}
function snapshot(root) {
  return fs.readdirSync(root, { recursive: true }).sort().map(file => [file, fs.statSync(path.join(root, file)).isFile() ? fs.readFileSync(path.join(root, file)).toString('base64') : null]);
}
function canonical(f) {
  f.write('PRODUCT.md', '<!-- impeccable:product-schema 1 -->\n# Product\nAn editor.\n');
  f.write('DESIGN.md', '# Design\n## Colors\nText and background.\n## Typography\nSystem fonts.\n## Components\nButtons.\n');
}

for (const host of ['cursor', 'codex']) {
  test(`${host}: CLI status, diagnose and setup share fresh read-only readiness without requiring hooks`, t => {
    const f = fixture(t);
    let before = snapshot(f.root);
    const absent = f.run(host, ['status']);
    assert.equal(absent.readiness.state, 'attention');
    assert.equal(absent.readiness.configuration.state, 'absent');
    assert.deepEqual(absent.readiness.actions.map(action => action.operation), ['init', 'document']);
    assert.deepEqual(f.run(host, ['diagnose']).readiness, absent.readiness);
    assert.deepEqual(f.run(host, ['setup']).state.readiness, absent.readiness);
    assert.deepEqual(snapshot(f.root), before, 'read-only lifecycle changed project or home');

    canonical(f);
    const ready = f.run(host, ['status']);
    assert.equal(ready.readiness.state, 'ready');
    assert.equal(ready.hook.enabled, false);
    assert.equal(ready.readiness.configuration.state, 'absent');
    f.write('.impeccable/config.json', '{"detector":{"ignoreFiles":["legacy/**"]},"hook":{"enabled":true}}');
    f.write('.impeccable/config.local.json', '{"detector":{"ignoreFiles":["local/**"]},"hook":{"enabled":false}}');
    before = snapshot(f.root);
    const disabled = f.run(host, ['diagnose']);
    assert.equal(disabled.hook.enabled, false);
    assert.equal(disabled.hook.explicit, true);
    assert.equal(disabled.readiness.state, 'ready', JSON.stringify(disabled.findings));
    const preview = f.run(host, ['setup']);
    assert.deepEqual(preview.plan.writes, ['.impeccable/config.local.json: set hook.enabled=true']);
    assert.deepEqual(snapshot(f.root), before);
    const applied = f.run(host, ['setup', '--apply']);
    assert.equal(applied.applied, true);
    assert.equal(applied.state.hook.enabled, true);
    assert.deepEqual(applied.state.readiness, f.run(host, ['status']).readiness);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.cwd, '.impeccable/config.local.json'))).detector.ignoreFiles, ['local/**']);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.cwd, '.impeccable/config.json'))).detector.ignoreFiles, ['legacy/**']);
    assert.deepEqual(f.run(host, ['setup', '--apply']).written, []);

    f.write('.impeccable/config.local.json', '{broken');
    before = snapshot(f.root);
    const malformed = f.run(host, ['diagnose']);
    assert.equal(malformed.readiness.state, 'unverified');
    assert.equal(malformed.readiness.continueWork, true);
    assert.ok(malformed.findings.some(finding => finding.id === 'malformed-impeccable-config'));
    assert.equal(f.run(host, ['setup', '--apply']).blocked, true);
    assert.deepEqual(snapshot(f.root), before);
  });
}

test('CLI readiness uses engine-selected app context and inheritance, and never applies ambiguous setup', t => {
  const f = fixture(t);
  canonical(f);
  fs.mkdirSync(path.join(f.cwd, '.git'));
  f.write('package.json', '{"private":true,"workspaces":["apps/*"]}');
  f.write('.impeccable/config.json', '{"hook":{"enabled":true}}');
  for (const name of ['one', 'two']) {
    f.write(`apps/${name}/package.json`, JSON.stringify({ name }));
    f.write(`apps/${name}/src/Card.jsx`, 'export default () => <main>Hello</main>');
    f.write(`apps/${name}/.impeccable/config.json`, '{"hook":{"enabled":false}}');
  }
  const before = snapshot(f.root);
  const root = f.run('codex', ['diagnose']);
  assert.equal(root.readiness.scope.state, 'selection-required');
  assert.deepEqual(root.readiness.scope.candidates.map(app => app.path), ['apps/one', 'apps/two']);
  const ambiguous = f.run('codex', ['setup', '--apply']);
  assert.equal(ambiguous.blocked, true);
  assert.deepEqual(ambiguous.plan.writes, []);
  assert.equal(f.run('codex', ['diagnose', '--target', '.']).readiness.scope.state, 'resolved');
  const targeted = f.run('codex', ['diagnose', '--target', 'apps/one/src/Card.jsx']);
  const child = f.run('codex', ['status'], path.join(f.cwd, 'apps/one'));
  assert.deepEqual(targeted.readiness, child.readiness);
  assert.equal(child.readiness.state, 'ready', JSON.stringify(child.readiness.findings));
  assert.equal(child.context.product, true);
  assert.equal(child.context.design, true);
  assert.equal(child.hook.enabled, false);
  assert.equal(child.readiness.context.product.inherited, true);
  assert.equal(child.readiness.context.product.path, fs.realpathSync(path.join(f.cwd, 'PRODUCT.md')));
  assert.equal(child.readiness.scope.projectRoot, fs.realpathSync(path.join(f.cwd, 'apps/one')));
  assert.deepEqual(snapshot(f.root), before);
  const applied = f.run('codex', ['setup', '--target', 'apps/one', '--apply']);
  assert.equal(applied.state.projectRoot, child.projectRoot);
  assert.equal(applied.state.hook.enabled, true);
  assert.deepEqual(applied.state.readiness, f.run('codex', ['status', '--target', 'apps/one']).readiness);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.cwd, 'apps/two/.impeccable/config.json'))).hook.enabled, false);
});

test('readiness keeps engine failure, invalid output and proposed migrations observable without writes', t => {
  const f = fixture(t);
  canonical(f);
  const before = snapshot(f.root);
  for (const runtime of [
    () => ({ started: false, status: null, error: 'missing engine' }),
    () => ({ started: true, status: 0, stdout: '{invalid' }),
    () => ({ started: true, status: 0, stdout: '{}' }),
  ]) {
    const contextReader = input => readProjectContext({ ...input, runtime });
    const report = diagnoseProject(f.cwd, { host: 'codex', contextReader });
    assert.equal(report.readiness.state, 'unverified');
    assert.equal(report.readiness.context.product.state, 'unverified');
    assert.equal(report.readiness.continueWork, true);
    assert.equal(setupProject(f.cwd, { host: 'codex', contextReader, apply: true }).blocked, true);
  }
  assert.deepEqual(snapshot(f.root), before);
  f.write('.impeccable-live.json', '{}');
  const driftBefore = snapshot(f.root);
  const report = f.run('codex', ['diagnose']);
  assert.ok(report.findings.some(finding => finding.id === 'legacy-live-state'));
  assert.ok(report.readiness.actions.some(action => action.findingId === 'legacy-live-state' && action.requiresConfirmation));
  assert.deepEqual(snapshot(f.root), driftBefore);
});

test('CLI preserves partial doctor evidence without losing the resolved app or authorizing writes', t => {
  const f = fixture(t);
  canonical(f);
  fs.mkdirSync(path.join(f.cwd, '.git'));
  f.write('package.json', '{"private":true,"workspaces":["apps/*"]}');
  f.write('apps/shop/package.json', '{"name":"shop"}');
  f.write('apps/shop/.impeccable/config.json', '{"hook":{"enabled":false},"detector":{"ignoreFiles":["legacy/**"]}}');
  const run = (host, registry, args) => {
    // Exercise the CLI with real doctor output, changing only its availability signal.
    const script = `
      import { runDesignCli } from ${JSON.stringify(new URL('../skills/design/scripts/design-cli.mjs', import.meta.url).href)};
      import { readProjectContext } from ${JSON.stringify(new URL('../src/project-context.mjs', import.meta.url).href)};
      import { runBundledImpeccable } from ${JSON.stringify(new URL('../src/impeccable-runtime.mjs', import.meta.url).href)};
      process.exitCode = runDesignCli(${JSON.stringify(['--host', host, ...args, '--target', 'apps/shop', '--json'])}, {
        contextReader: input => readProjectContext({ ...input, runtime: options => {
          const result = runBundledImpeccable(options);
          const report = JSON.parse(result.stdout);
          report.ruleRegistryAvailable = ${JSON.stringify(registry) ?? 'undefined'};
          return { ...result, stdout: JSON.stringify(report) };
        } }),
      });`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: f.cwd, encoding: 'utf8', timeout: 15000,
      env: { ...process.env, HOME: f.home, USERPROFILE: f.home, IMPECCABLE_UPDATE_CACHE: path.join(f.home, 'updates.json') },
    });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  const before = snapshot(f.root);
  for (const host of ['cursor', 'codex']) for (const registry of [true, false, undefined, 'false']) {
    const status = run(host, registry, ['status']);
    assert.equal(status.readiness.state, registry === true ? 'ready' : 'unverified');
    assert.equal(status.readiness.continueWork, true);
    assert.equal(status.readiness.scope.state, 'resolved');
    assert.equal(status.projectRoot, fs.realpathSync(path.join(f.cwd, 'apps/shop')));
    assert.equal(status.readiness.context.product.state, 'present');
    assert.equal(status.readiness.context.product.inherited, true);
    assert.equal(status.hook.enabled, false);
    assert.equal(status.readiness.findings.some(item => item.id === 'rule-registry-unverified'), registry !== true);
    assert.deepEqual(run(host, registry, ['diagnose']).readiness, status.readiness);
    assert.deepEqual(run(host, registry, ['setup']).state.readiness, status.readiness);
    assert.deepEqual(snapshot(f.root), before);
  }
  const applied = run('codex', false, ['setup', '--apply']);
  assert.equal(applied.applied, true, 'partial rule validation must not discard the known app scope');
  assert.equal(applied.state.hook.enabled, true);
  assert.equal(applied.state.readiness.state, 'unverified');
  assert.deepEqual(applied.written, ['.impeccable/config.json']);
  assert.deepEqual(applied.state.readiness, run('codex', false, ['status']).readiness);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.cwd, 'apps/shop/.impeccable/config.json'))).detector.ignoreFiles, ['legacy/**']);
  assert.equal(fs.existsSync(path.join(f.cwd, '.impeccable')), false);
});

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

test('malformed config and unsupported Node versions produce honest non-blocking diagnostics', (t) => {
  const root = project();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.impeccable'), { recursive: true });
  fs.writeFileSync(path.join(root, '.impeccable', 'config.json'), '{broken');
  const report = diagnoseProject(root, { host: 'cursor', nodeVersion: '20.0.0' });
  assert.equal(report.hook.enabled, false);
  assert.ok(report.findings.some((finding) => finding.id === 'malformed-impeccable-config'));
  assert.ok(report.findings.some((finding) => finding.id === 'node-baseline'));
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
