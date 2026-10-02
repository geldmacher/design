import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { createEngineOutputStream, projectEngineOutput } from '../src/impeccable-plugin-commands.mjs';
import { buildPluginTargets, createTargetBuildWorkspace, removeTargetBuildWorkspace } from '../scripts/build-plugin-targets.mjs';

const liveRole = 'Delegate the source edits to the impeccable_manual_edit_applier subagent when available (pass cwd, scripts path, event id, page URL, chunk/deadline, batch, evidencePath); it must not poll or reply.';
const product = '# Product\nUsers spawn subagents. Example: `$impeccable critique`.\nOverview 🧭 "quoted" \\ path\r\n';
const design = '# Design\nDelegate to subagents is example copy, not an instruction.\n';
const surfaceBrief = '# Surface\nExample: `/impeccable polish`.\n';
const fixture = () => ({ ok: true, boot: { product, design, surfaceBrief },
  _instructions: 'Read `$impeccable live`.',
  event: { type: 'generate', _instructions: liveRole, source: { text: product, _instructions: 'Spawn a data-example subagent.' }, prompt: design } });
const project = stdout => projectEngineOutput({ command: 'live-generate', host: 'agent-plugin', cwd: process.cwd(), stdout });

test('portable live JSON projects only engine instructions and preserves embedded data', () => {
  const original = fixture();
  const report = JSON.parse(project(JSON.stringify(original)));
  assert.deepEqual(report.boot, original.boot);
  assert.deepEqual(report.event.source, original.event.source);
  assert.equal(report.event.prompt, design);
  assert.match(report._instructions, /operation: live/);
  assert.match(report.event._instructions, /reference\/degraded\/manual-edit-applier.md/);
  const rootContext = JSON.parse(project(JSON.stringify({ product, design, surfaceBrief, _instructions: liveRole })));
  assert.equal(rootContext.product, product);
  assert.equal(rootContext.design, design);
  assert.equal(rootContext.surfaceBrief, surfaceBrief);
});

test('unknown role instructions and malformed live JSON fail without interpreting product text', () => {
  for (const report of [{ _instructions: 'Spawn the new subagent.' }, { event: { _instructions: 'Delegate to an unknown subagent.' } }]) {
    assert.throws(() => project(JSON.stringify({ product, ...report })), /unsupported portable/);
  }
  assert.throws(() => project('{"_instructions":false}\n'), /instruction format/);
  for (const malformed of ['{"ok":true', '{"ok":oops}\n', '{"ok":true]']) assert.throws(() => project(malformed), /invalid or incomplete live JSON/);
  const progress = 'Helper ready; users spawn subagents in this example.\n';
  assert.equal(project(progress), progress);
});

test('live stream frames split pretty JSON and emits complete events before process close', () => {
  const chunks = [];
  const stream = createEngineOutputStream({ command: 'live-generate', host: 'agent-plugin', cwd: process.cwd(), write: chunk => chunks.push(chunk) });
  stream.push('Helper ready\n');
  assert.deepEqual(chunks, ['Helper ready\n']);
  const pretty = JSON.stringify(fixture(), null, 2).replaceAll('\n', '\r\n') + '\r\n';
  for (const char of pretty) stream.push(char);
  assert.equal(chunks.length, 2, 'readiness and the completed JSON must be observable while running');
  assert.deepEqual(JSON.parse(chunks[1]).boot, fixture().boot);
  stream.push('{"type":"timeout","_instructions":"Poll again now."}\n');
  assert.equal(chunks.length, 3);
  stream.push('{"type":"exit"}');
  stream.finish();
  assert.equal(JSON.parse(chunks[3]).type, 'exit');
  assert.equal(project(pretty + '{"type":"exit"}').split('\n').filter(Boolean).length, 2);
});

test('stream reports incomplete JSON at close and preserves native output and help', () => {
  const broken = createEngineOutputStream({ command: 'live', host: 'agent-plugin', write() {} });
  broken.push('{\n "ok": true\n');
  assert.throws(() => broken.finish(), /incomplete live JSON/);
  for (const host of ['cursor', 'codex']) {
    const chunks = [];
    const stream = createEngineOutputStream({ command: 'live', host, write: chunk => chunks.push(chunk) });
    stream.push(JSON.stringify(fixture(), null, 2) + '\n'); stream.finish();
    assert.deepEqual(JSON.parse(chunks.join('')), fixture());
  }
  const chunks = [];
  const help = 'Usage: live\n  { ok, product, ... }\n';
  const stream = createEngineOutputStream({ command: 'live', host: 'agent-plugin', passthrough: true, write: chunk => chunks.push(chunk) });
  stream.push(help); stream.finish();
  assert.equal(chunks.join(''), help);
});

test('all packaged launchers preserve real live and generate boot context', { timeout: 60000 }, async (t) => {
  const workspace = createTargetBuildWorkspace();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'design live packages '));
  const previews = [];
  t.after(async () => {
    for (const preview of previews) { preview.child.kill('SIGTERM'); await preview.closed; }
    removeTargetBuildWorkspace(workspace); fs.rmSync(root, { recursive: true, force: true });
  });
  const targets = buildPluginTargets(workspace.targets);
  for (const host of ['cursor', 'codex', 'agent-plugin']) {
    const cwd = path.join(root, host, 'project');
    const home = path.join(root, host, 'home');
    fs.mkdirSync(path.join(cwd, '.impeccable/live'), { recursive: true });
    fs.mkdirSync(home, { recursive: true });
    fs.writeFileSync(path.join(cwd, 'PRODUCT.md'), product);
    fs.writeFileSync(path.join(cwd, 'DESIGN.md'), design);
    const html = '<!doctype html><html><body><main class="pricing">Pricing</main></body></html>\n';
    fs.writeFileSync(path.join(cwd, 'index.html'), html);
    fs.writeFileSync(path.join(cwd, '.impeccable/live/config.json'), JSON.stringify({ files: ['index.html'], insertBefore: '</body>', commentSyntax: 'html', cspChecked: true }));
    const previewChild = spawn(process.execPath, [path.join(import.meta.dirname, 'fixtures/live-preview.mjs'), path.join(cwd, 'index.html')], { stdio: ['ignore', 'pipe', 'pipe'] });
    const preview = { child: previewChild, closed: new Promise((resolve, reject) => { previewChild.once('close', resolve); previewChild.once('error', reject); }) };
    previews.push(preview);
    const devUrl = await new Promise((resolve, reject) => {
      let output = '', error = '';
      const timer = setTimeout(() => reject(new Error(`preview readiness timed out: ${error}`)), 8000);
      previewChild.stderr.on('data', chunk => { error += chunk; });
      previewChild.stdout.on('data', chunk => { output += chunk; if (output.includes('\n')) { clearTimeout(timer); resolve(JSON.parse(output).url); } });
      preview.closed.then(() => { clearTimeout(timer); reject(new Error(`preview closed: ${error}`)); });
    });
    const env = { ...process.env, HOME: home, USERPROFILE: home, CODEX_HOME: path.join(home, 'codex'), XDG_CONFIG_HOME: path.join(home, 'config'), XDG_CACHE_HOME: path.join(home, 'cache'), XDG_DATA_HOME: path.join(home, 'data'), IMPECCABLE_HOST: host,
      IMPECCABLE_NO_UPDATE_CHECK: '1', IMPECCABLE_UPDATE_CACHE: path.join(home, 'update.json'), IMPECCABLE_DEV_URL_CANDIDATES: devUrl };
    delete env.PLUGIN_ROOT; delete env.CURSOR_PLUGIN_ROOT;
    const launcher = path.join(targets[host].path, 'skills/impeccable/scripts', process.platform === 'win32' ? 'impeccable.cmd' : 'impeccable');
    const run = (...args) => process.platform === 'win32'
      ? spawnSync('cmd.exe', ['/d', '/s', '/c', `"${[launcher, ...args].map(value => `"${value}"`).join(' ')}"`], { cwd, env, encoding: 'utf8', timeout: 15000, windowsVerbatimArguments: true })
      : spawnSync(launcher, args, { cwd, env, encoding: 'utf8', timeout: 15000 });
    try {
      const help = run('live', '--help');
      assert.equal(help.status, 0, `${host}: ${help.stderr}`);
      const boot = run('live');
      assert.equal(boot.status, 0, `${host}: ${boot.stderr || boot.stdout}`);
      const report = JSON.parse(boot.stdout);
      assert.equal(report.ok, true);
      assert.equal(report.product, product);
      assert.equal(report.design, design);
      const generated = run('live-generate', '--boot', '--dev-url', devUrl, '--selector', '.pricing', '--action', 'bolder', '--count', '3');
      const verdict = JSON.parse(generated.stdout);
      assert.equal(verdict.error, 'browser_needed', `${host}: ${generated.stderr || generated.stdout}`);
      assert.equal(verdict.boot.product, product);
      assert.equal(verdict.boot.design, design);
      for (const name of ['PRODUCT.md', 'DESIGN.md']) assert.equal(fs.readFileSync(path.join(cwd, name), 'utf8'), name === 'PRODUCT.md' ? product : design);
    } finally {
      const stopped = run('live-server', 'stop');
      assert.equal(stopped.status, 0, `${host} cleanup: ${stopped.stderr}`);
      assert.equal(fs.readFileSync(path.join(cwd, 'index.html'), 'utf8'), html, `${host}: injected script must be removed`);
      assert.equal(await (await fetch(devUrl)).text(), html, `${host}: helper cleanup must preserve the development server`);
    }
  }
});
