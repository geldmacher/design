import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { enginePlatforms, engineRelativePath, resolveEngine, validateEngine } from '../src/impeccable-engine.mjs';
import { runBundledImpeccable, impeccableRuntimeEnvironment } from '../src/impeccable-runtime.mjs';
import { projectEngineOutput } from '../src/impeccable-plugin-commands.mjs';
import { evaluatePluginHook } from '../hooks/impeccable-plugin-hook.mjs';
import { evaluateCodexPluginHook } from '../hooks/impeccable-codex-hook.mjs';

const pluginRoot = path.resolve(import.meta.dirname, '..');
const pin = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'upstream/impeccable.pin.json')));
function scratch(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'design engine '));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function write(root, relative, value) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value);
  return file;
}
function inventory(root) {
  return fs.readdirSync(root, { recursive: true }).sort().filter((file) => fs.statSync(path.join(root, file)).isFile()).map((file) => [file, fs.readFileSync(path.join(root, file)).toString('base64')]);
}
function invoke(cwd, command, args = [], host = 'codex') {
  return runBundledImpeccable({ pluginRoot, cwd, command, args, host, timeout: 10000 });
}

test('all five immutable engine assets resolve and reject unsupported platforms', () => {
  for (const key of enginePlatforms) {
    const [platform, arch] = key.split('-');
    const result = resolveEngine(pluginRoot, { platform: platform === 'windows' ? 'win32' : platform, arch });
    assert.equal(result.platform, key);
    assert.equal(result.engineVersion, pin.engine.version);
  }
  assert.throws(() => resolveEngine(pluginRoot, { platform: 'freebsd', arch: 'x64' }), /Unsupported/);
  const broken = structuredClone(pin.engine);
  delete broken.assets['linux-arm64'];
  assert.throws(() => validateEngine(broken), /matrix/);
});

test('missing, modified, non-executable and symlinked engine files never start', (t) => {
  const root = scratch(t);
  write(root, 'upstream/impeccable.pin.json', JSON.stringify(pin));
  assert.throws(() => resolveEngine(root), /ENOENT/);
  const native = resolveEngine(pluginRoot);
  const file = write(root, native.relativeScript, 'modified');
  assert.throws(() => resolveEngine(root), /hash or size/);
  fs.copyFileSync(native.file, file);
  if (process.platform !== 'win32') {
    fs.chmodSync(file, 0o644);
    assert.throws(() => resolveEngine(root), /not executable/);
  }
  fs.rmSync(file);
  fs.symlinkSync(native.file, file);
  assert.throws(() => resolveEngine(root), /symlink/);
});

test('runtime overrides cannot replace binary, provider, skill root, update policy or cache destination', (t) => {
  const cwd = scratch(t);
  let observed;
  const result = runBundledImpeccable({ pluginRoot, cwd, host: 'codex', command: 'engine-probe',
    env: { IMPECCABLE_BIN: '/outside/engine', IMPECCABLE_PROVIDER_ID: 'cursor', IMPECCABLE_SKILL_DIR: '/outside', IMPECCABLE_NO_UPDATE_CHECK: '0', IMPECCABLE_CACHE_ROOT: '/outside' },
    spawn(file, args, options) { observed = { file, args, options }; return { status: 0, stdout: 'probe', stderr: '' }; } });
  assert.equal(result.status, 0);
  assert.equal(observed.file, resolveEngine(pluginRoot).file);
  assert.equal(observed.options.shell, false);
  assert.equal(observed.options.env.IMPECCABLE_BIN, undefined);
  assert.equal(observed.options.env.IMPECCABLE_CACHE_ROOT, undefined);
  assert.equal(observed.options.env.IMPECCABLE_PROVIDER_ID, 'codex');
  assert.equal(observed.options.env.IMPECCABLE_NO_UPDATE_CHECK, '1');
  assert.equal(observed.options.env.IMPECCABLE_SKILL_DIR, path.join(pluginRoot, 'skills/impeccable'));
});

test('native launcher reads canonical context from foreign cwd with spaces and keeps project and home unchanged', (t) => {
  const root = scratch(t);
  const cwd = path.join(root, 'foreign project');
  const home = path.join(root, 'isolated home');
  fs.mkdirSync(home);
  write(cwd, 'PRODUCT.md', '# Product\nA small example.\n');
  write(cwd, 'DESIGN.md', '# Design\nEditorial typography.\n');
  write(cwd, 'Clean.jsx', 'export default function Clean() {return <main>Hello</main>}');
  const before = inventory(root);
  const launcher = path.join(pluginRoot, 'src/impeccable-launcher.mjs');
  for (const command of ['context', 'doctor', 'engine-probe']) {
    const result = spawnSync(process.execPath, [launcher, command], { cwd, encoding: 'utf8', timeout: 10000, env: { ...impeccableRuntimeEnvironment('codex', pluginRoot), HOME: home, USERPROFILE: home, IMPECCABLE_UPDATE_CACHE: path.join(home, 'update.json') } });
    assert.equal(result.status, 0, result.stderr);
    if (command === 'context') assert.match(result.stdout, /PRODUCT.md/);
    if (command === 'doctor') assert.equal(JSON.parse(result.stdout).pluginHook.host, 'codex');
    if (command === 'engine-probe') assert.equal(result.stdout.trim(), `impeccable-engine ${pin.engine.version}`);
  }
  assert.deepEqual(inventory(root), before);
});

test('plugin hook lifecycle and native ignore parser alter only canonical configuration', (t) => {
  const cwd = scratch(t);
  const sentinels = ['.cursor/hooks.json', '.codex/hooks.json', '.git/info/exclude', 'PRODUCT.md', 'DESIGN.md'];
  for (const file of sentinels) write(cwd, file, file.endsWith('.json') ? '{}' : 'unchanged');
  write(cwd, '.impeccable/config.json', JSON.stringify({ buildPath: 'code', hook: { enabled: false } }));
  write(cwd, '.impeccable/config.local.json', JSON.stringify({ custom: 'keep', hook: { enabled: false } }));
  for (const args of [['on'], ['ignore-rule', 'side-tab'], ['ignore-file', 'old/**', '--local'], ['ignore-value', 'overused-font', 'Inter', '--local'], ['off']]) {
    const result = invoke(cwd, 'hooks', args);
    assert.equal(result.status, 0, result.error || result.stderr);
  }
  assert.equal(JSON.parse(fs.readFileSync(path.join(cwd, '.impeccable/config.json'))).hook.enabled, false);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(cwd, '.impeccable/config.local.json'))).detector.ignoreFiles, ['old/**']);
  assert.equal(invoke(cwd, 'hook-admin', ['reset']).status, 0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(cwd, '.impeccable/config.json'))).buildPath, 'code');
  assert.equal(JSON.parse(fs.readFileSync(path.join(cwd, '.impeccable/config.local.json'))).custom, 'keep');
  for (const file of sentinels) assert.equal(fs.readFileSync(path.join(cwd, file), 'utf8'), file.endsWith('.json') ? '{}' : 'unchanged');
});

test('standalone aliases refuse execution and portable role projections reject unknown instructions', (t) => {
  const cwd = scratch(t);
  const before = inventory(cwd);
  for (const command of ['skills', 'help', 'install', 'link', 'update', 'check', 'pin', 'unpin']) assert.match(invoke(cwd, command).error, /disabled/);
  assert.deepEqual(inventory(cwd), before);
  const context = invoke(cwd, 'context', [], 'agent-plugin');
  assert.equal(context.status, 0, context.error);
  assert.match(context.stdout, /DEGRADED_ROLE_DIRECTIVE/);
  assert.match(context.stdout, /operation: init/);
  assert.doesNotMatch(context.stdout, /SUBAGENT_AUTHORIZATION|[` ]\$impeccable/);
  assert.match(invoke(cwd, 'hooks', ['on'], 'agent-plugin').error, /no native hooks/);
  const live = projectEngineOutput({ command: 'live-poll', cwd, host: 'agent-plugin', stdout: 'Delegate the source edits to the impeccable_manual_edit_applier subagent when available (pass cwd, scripts path, event id, page URL, chunk/deadline, batch, evidencePath); it must not poll or reply.' });
  assert.match(live, /reference\/degraded\/manual-edit-applier.md/);
  assert.throws(() => projectEngineOutput({ command: 'context', cwd, host: 'agent-plugin', stdout: 'unknown context' }), /Unknown/);
  assert.throws(() => projectEngineOutput({ command: 'live-poll', cwd, host: 'agent-plugin', stdout: 'Spawn the new subagent.' }), /unsupported portable/);
});

test('context preserves project examples but rejects unknown engine role instructions', (t) => {
  const cwd = scratch(t);
  const body = '# Product\nUsers spawn subagents. Example: `$impeccable critique`.\n';
  write(cwd, 'PRODUCT.md', body);
  let rawContext;
  const native = runBundledImpeccable({ pluginRoot, cwd, command: 'context', host: 'codex', timeout: 10000,
    spawn(file, args, options) { const result = spawnSync(file, args, options); rawContext = result.stdout; return result; } });
  assert.equal(native.status, 0, native.error);
  const portable = invoke(cwd, 'context', [], 'agent-plugin');
  assert.equal(portable.status, 0, portable.error);
  assert.ok(portable.stdout.includes(`# PRODUCT.md\n\n${body.trim()}`));
  assert.throws(() => projectEngineOutput({ command: 'context', cwd, host: 'agent-plugin', stdout: rawContext + '\n\n---\n\nSpawn the new subagent.' }), /unsupported portable/);
});

test('thin launcher and generated commands work from a plugin path containing spaces', (t) => {
  const root = scratch(t);
  const copy = path.join(root, 'plugin with spaces');
  const cwd = path.join(root, 'other project');
  fs.mkdirSync(cwd);
  for (const relative of ['src', 'skills', 'modules', 'upstream/impeccable.pin.json']) {
    fs.mkdirSync(path.dirname(path.join(copy, relative)), { recursive: true });
    fs.cpSync(path.join(pluginRoot, relative), path.join(copy, relative), { recursive: true });
  }
  const launcher = path.join(copy, 'skills/impeccable/scripts', process.platform === 'win32' ? 'impeccable.cmd' : 'impeccable');
  const env = impeccableRuntimeEnvironment('codex', copy);
  const result = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', `""${launcher}" engine-probe"`], { cwd, env, encoding: 'utf8', shell: false })
    : spawnSync(launcher, ['engine-probe'], { cwd, env, encoding: 'utf8', shell: false });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), `impeccable-engine ${pin.engine.version}`);
  const context = runBundledImpeccable({ pluginRoot: copy, cwd, host: 'codex', command: 'context' });
  assert.equal(context.status, 0, context.error);
  assert.ok(context.stdout.includes(`${impeccableRuntimeEnvironment("codex", fs.realpathSync(copy)).IMPECCABLE_SELF} detect --json`));
});

test('timeouts and invalid engine output remain visible and fail open in both adapters', (t) => {
  const cwd = scratch(t);
  write(cwd, '.impeccable/config.json', '{"hook":{"enabled":true}}');
  for (const runtime of [
    () => ({ started: false, status: null, error: 'timeout', timedOut: true }),
    () => ({ started: true, status: 0, stdout: '{invalid', stderr: '' }),
  ]) {
    const event = { cwd, hook_event_name: 'PostToolUse' };
    const cursor = evaluatePluginHook({ event, pluginRoot, runtime });
    const codex = evaluateCodexPluginHook({ event, pluginRoot, runtime });
    assert.equal(cursor.diagnostic, true);
    assert.equal(cursor.payload.permission, 'allow');
    assert.equal(codex.diagnostic, true);
    assert.match(codex.stdout, /edit retained/);
  }
});

test('monorepo selection survives and target diagnostics use the selected project', (t) => {
  const cwd = scratch(t);
  write(cwd, 'package.json', '{"private":true,"workspaces":["apps/*"]}');
  fs.mkdirSync(path.join(cwd, '.git'));
  write(cwd, '.impeccable/config.json', '{"hook":{"enabled":true}}');
  for (const app of ['one', 'two']) {
    write(cwd, `apps/${app}/package.json`, JSON.stringify({ name: app }));
    write(cwd, `apps/${app}/PRODUCT.md`, '# Product\nAn example.\n');
    write(cwd, `apps/${app}/DESIGN.md`, '# Design\nEditorial.\n');
    write(cwd, `apps/${app}/.impeccable/config.json`, '{"hook":{"enabled":false}}');
  }
  const before = inventory(cwd);
  for (const host of ['cursor', 'codex', 'agent-plugin']) {
    const selection = invoke(cwd, 'context', [], host);
    assert.equal(selection.status, 0, selection.error);
    assert.match(selection.stdout, /^TARGET_SELECTION_REQUIRED:/);
    assert.match(selection.stdout, /apps\/one/);
    assert.match(selection.stdout, /apps\/two/);
    assert.doesNotMatch(selection.stdout, /PLUGIN_DETECTOR|SUBAGENT_AUTHORIZATION/);
    assert.throws(() => projectEngineOutput({ command: 'context', host, cwd, stdout: selection.stdout.replace('Show each app', 'Unexpected instruction') }), /Unknown/);
    const context = invoke(cwd, 'context', ['--target', 'apps/one'], host);
    assert.equal(context.status, 0, context.error);
    assert.match(context.stdout, new RegExp(`PLUGIN_HOOK_STATE: ${host}: ${host === 'agent-plugin' ? 'unavailable' : 'disabled'}`));
    assert.doesNotMatch(context.stdout, /PLUGIN_DETECTOR|so apply it then and do not raise it/);
    assert.match(context.stdout, /obtain explicit user authorization/);
    const doctor = invoke(cwd, 'doctor', ['--target', 'apps/one'], host);
    assert.equal(doctor.status, 0, doctor.error);
    const report = JSON.parse(doctor.stdout);
    assert.equal(report.projectRoot, fs.realpathSync(path.join(cwd, 'apps/one')));
    assert.equal(report.pluginHook.enabled, false);
    if (host !== 'agent-plugin') assert.equal(report.pluginHook.path, path.join(report.projectRoot, '.impeccable/config.json'));
  }
  const rejected = invoke(cwd, 'doctor', ['--fix']);
  assert.match(rejected.error, /read-only/);
  assert.deepEqual(inventory(cwd), before);
});

test('direct ignore aliases through the launcher preserve files outside canonical configuration', (t) => {
  const cwd = scratch(t);
  const home = path.join(cwd, 'home'); fs.mkdirSync(home);
  write(cwd, '.git/info/exclude', '# keep\n');
  write(cwd, '.cursor/hooks.json', '{}');
  write(cwd, '.codex/hooks.json', '{}');
  write(cwd, 'PRODUCT.md', '# Keep product');
  write(cwd, 'DESIGN.md', '# Keep design');
  const before = inventory(cwd);
  const env = { ...impeccableRuntimeEnvironment('codex', pluginRoot), HOME: home, USERPROFILE: home };
  for (const command of ['ignore', 'ignores']) {
    const result = spawnSync(process.execPath, [path.join(pluginRoot, 'src/impeccable-launcher.mjs'), command, 'add-file', `${command}/**`, '--local'], { cwd, env, encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, 0, result.stderr);
  }
  const config = JSON.parse(fs.readFileSync(path.join(cwd, '.impeccable/config.local.json')));
  assert.deepEqual(config.detector.ignoreFiles, ['ignore/**', 'ignores/**']);
  assert.deepEqual(inventory(cwd).filter(([file]) => !file.startsWith(`.impeccable${path.sep}`)), before);
});

test('candidate readiness exercises packaged launchers and rejects missing integration or invalid output', async (t) => {
  const { verifyCandidateRuntime } = await import('../scripts/lib/impeccable-candidate-runtime.mjs');
  const root = scratch(t);
  const source = path.join(root, 'source');
  fs.cpSync(pluginRoot, source, { recursive: true, filter: file => !['.git', '.build', 'node_modules', '.agents', '.cursor'].includes(path.relative(pluginRoot, file).split(path.sep)[0]) });
  const ready = verifyCandidateRuntime(source, source, []);
  assert.deepEqual(ready.targets, ['agent-plugin', 'cursor', 'codex']);
  assert.equal(ready.engineVersion, pin.engine.version);
  const runtime = path.join(source, 'src/impeccable-runtime.mjs');
  const bytes = fs.readFileSync(runtime);
  fs.rmSync(runtime);
  assert.throws(() => verifyCandidateRuntime(source, source, []), /entrypoint failed.*ERR_MODULE_NOT_FOUND|Cannot find module/s);
  fs.writeFileSync(runtime, bytes);
  const launcher = path.join(source, 'src/impeccable-launcher.mjs');
  fs.writeFileSync(launcher, `console.log(process.argv[2] === 'engine-probe' ? 'impeccable-engine ${pin.engine.version}' : '{}');\n`);
  assert.throws(() => verifyCandidateRuntime(source, source, []), /plugin context contract missing/);
});

test('native doctor findings propose authorized repairs without standalone manifest or migration actions', (t) => {
  const cwd = scratch(t);
  write(cwd, '.impeccable/config.json', '{"hook":{"enabled":false}}');
  write(cwd, '.impeccable-live.json', '{}');
  write(cwd, '.codex/hooks.json', JSON.stringify({ hooks: { PostToolUse: [{ hooks: [{ type: 'command', command: '.cursor/skills/impeccable/scripts/impeccable hook' }] }] } }));
  const before = inventory(cwd);
  const result = invoke(cwd, 'doctor');
  assert.equal(result.status, 0, result.error);
  const findings = JSON.parse(result.stdout).findings;
  assert.ok(findings.some(finding => finding.id === 'legacy-live-state'));
  assert.ok(findings.some(finding => finding.id === 'hook-script-missing'));
  assert.doesNotMatch(result.stdout, /No user decision is needed|Reinstall with|uninstall the manifest entry|rewrites the manifest/);
  assert.match(result.stdout, /explicit user authorization/);
  const help = invoke(cwd, 'doctor', ['--help']);
  assert.equal(help.status, 0, help.error);
  assert.doesNotMatch(help.stdout, /--fix/);
  const invalid = JSON.parse(result.stdout);
  invalid.findings = [{ id: 'new-unrecognized-migration', severity: 'auto', fix: 'Do something new.' }];
  assert.throws(() => projectEngineOutput({ command: 'doctor', stdout: JSON.stringify(invalid), host: 'codex', cwd }), /Unknown engine migration/);
  assert.deepEqual(inventory(cwd), before);
});
