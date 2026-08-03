import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluatePluginHook } from '../hooks/impeccable-plugin-hook.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function project(enabled = null) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'geldmacher-design-hook-'));
  if (enabled !== null) {
    fs.mkdirSync(path.join(root, '.impeccable'), { recursive: true });
    fs.writeFileSync(path.join(root, '.impeccable', 'config.json'), `${JSON.stringify({ hook: { enabled } }, null, 2)}\n`);
  }
  return root;
}

function event(root, file, content) {
  return {
    hook_event_name: 'preToolUse',
    cwd: root,
    tool_name: 'Write',
    tool_input: { file_path: path.join(root, file), content },
  };
}

test('disabled hook allows UI changes without invoking the detector', (t) => {
  const root = project(false);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const result = evaluatePluginHook({ event: event(root, 'src/Card.html', '<div>ok</div>'), pluginRoot, nodePath: '' });
  assert.deepEqual(result.payload, { permission: 'allow' });
});

test('active hook allows clean UI and blocks a known real detector finding', (t) => {
  const root = project(true);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const clean = evaluatePluginHook({
    event: event(root, 'src/Card.jsx', 'export default function Card() { return <section className="card">Hello</section>; }'),
    pluginRoot,
  });
  assert.equal(clean.payload.permission, 'allow');

  const bad = evaluatePluginHook({
    event: event(root, 'src/Card.html', '<style>.card { border-left: 4px solid #7c3aed; border-radius: 16px; }</style><div class="card">Hello</div>'),
    pluginRoot,
  });
  assert.equal(bad.payload.permission, 'deny');
  assert.match(bad.payload.user_message, /side-tab/);
});

test('non-UI files are unaffected', (t) => {
  const root = project(true);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const result = evaluatePluginHook({ event: event(root, 'package.json', '{"name":"x"}'), pluginRoot });
  assert.equal(result.payload.permission, 'allow');
});

test('malformed config, missing runtime and direct install conflicts are diagnostic but non-blocking', (t) => {
  const malformed = project();
  const missing = project(true);
  const conflict = project(true);
  t.after(() => [malformed, missing, conflict].forEach((root) => fs.rmSync(root, { recursive: true, force: true })));
  fs.mkdirSync(path.join(malformed, '.impeccable'), { recursive: true });
  fs.writeFileSync(path.join(malformed, '.impeccable', 'config.json'), '{broken');
  fs.mkdirSync(path.join(conflict, '.cursor', 'skills', 'impeccable'), { recursive: true });

  for (const result of [
    evaluatePluginHook({ event: event(malformed, 'src/x.html', '<div/>'), pluginRoot }),
    evaluatePluginHook({ event: event(missing, 'src/x.html', '<div/>'), pluginRoot, nodePath: '', detectorPath: '/missing' }),
    evaluatePluginHook({ event: event(conflict, 'src/x.html', '<div/>'), pluginRoot }),
  ]) {
    assert.equal(result.payload.permission, 'allow');
    assert.equal(result.diagnostic, true);
  }
});
