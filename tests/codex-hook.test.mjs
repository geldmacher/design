import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateCodexPluginHook } from '../hooks/impeccable-codex-hook.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function project(enabled = null) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'geldmacher-design-codex-hook-'));
  if (enabled !== null) {
    fs.mkdirSync(path.join(root, '.impeccable'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.impeccable', 'config.json'),
      `${JSON.stringify({ hook: { enabled } }, null, 2)}\n`,
    );
  }
  return root;
}

function writeFixture(root, file, content) {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  return target;
}

function postEvent(root, file, toolName = 'Write', sessionId = 'codex-test') {
  return {
    hook_event_name: 'PostToolUse',
    cwd: root,
    session_id: sessionId,
    tool_name: toolName,
    tool_input: toolName === 'apply_patch'
      ? { command: `*** Begin Patch\n*** Update File: ${file}\n*** End Patch` }
      : { file_path: path.join(root, file) },
  };
}

function assertContext(result, eventName) {
  assert.equal(result.payload?.hookSpecificOutput?.hookEventName, eventName);
  assert.equal(typeof result.payload?.hookSpecificOutput?.additionalContext, 'string');
  assert.doesNotMatch(result.stdout, /permission|deny/);
}

test('disabled Codex hook is completely silent', (t) => {
  const root = project(false);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const result = evaluateCodexPluginHook({
    event: postEvent(root, 'src/Card.html'),
    pluginRoot,
    nodePath: '',
  });
  assert.equal(result.payload, null);
  assert.equal(result.stdout, '');
  assert.equal(result.diagnostic, false);
});

test('Codex hook diagnostics are non-blocking and event-correct', (t) => {
  const malformed = project();
  const missing = project(true);
  const conflict = project(true);
  t.after(() => [malformed, missing, conflict].forEach((root) => fs.rmSync(root, { recursive: true, force: true })));
  fs.mkdirSync(path.join(malformed, '.impeccable'), { recursive: true });
  fs.writeFileSync(path.join(malformed, '.impeccable', 'config.json'), '{broken');
  fs.mkdirSync(path.join(conflict, '.agents', 'skills', 'impeccable'), { recursive: true });

  const results = [
    evaluateCodexPluginHook({ event: postEvent(malformed, 'src/x.html'), pluginRoot }),
    evaluateCodexPluginHook({ event: postEvent(missing, 'src/x.html'), pluginRoot, nodePath: '', detectorPath: '/missing' }),
    evaluateCodexPluginHook({ event: { hook_event_name: 'Stop', cwd: conflict }, pluginRoot }),
  ];

  assertContext(results[0], 'PostToolUse');
  assertContext(results[1], 'PostToolUse');
  assertContext(results[2], 'Stop');
  for (const result of results) assert.equal(result.diagnostic, true);
});

test('Codex PostToolUse handles apply_patch, clean passes and findings without blocking', (t) => {
  const root = project(true);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  writeFixture(root, 'src/Clean.jsx', 'export default function Clean() { return <main>Hello</main>; }');
  writeFixture(root, 'src/LowContrast.html', '<div style="color:#aaa;background:#fff">Hard to read</div>');

  const clean = evaluateCodexPluginHook({ event: postEvent(root, 'src/Clean.jsx'), pluginRoot });
  assert.ok(clean.payload === null || clean.payload.hookSpecificOutput?.hookEventName === 'PostToolUse');

  const finding = evaluateCodexPluginHook({
    event: postEvent(root, 'src/LowContrast.html', 'apply_patch'),
    pluginRoot,
  });
  assertContext(finding, 'PostToolUse');
  assert.match(finding.payload.hookSpecificOutput.additionalContext, /contrast/i);
});

test('Codex Stop reports deferred findings once and then deduplicates them', (t) => {
  const root = project(true);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  writeFixture(
    root,
    'src/Card.html',
    '<style>.card { border-left: 4px solid #7c3aed; border-radius: 16px; }</style><div class="card">Hello</div>',
  );

  const post = evaluateCodexPluginHook({
    event: postEvent(root, 'src/Card.html', 'apply_patch', 'codex-stop-test'),
    pluginRoot,
  });
  assertContext(post, 'PostToolUse');
  assert.doesNotMatch(post.payload.hookSpecificOutput.additionalContext, /side-tab/i);

  const stopEvent = { hook_event_name: 'Stop', cwd: root, session_id: 'codex-stop-test' };
  const firstStop = evaluateCodexPluginHook({ event: stopEvent, pluginRoot });
  // Upstream skill-v4.1.2 emits Codex Stop as decision:block (not additionalContext).
  assert.equal(firstStop.diagnostic, false);
  assert.equal(firstStop.payload?.decision, 'block');
  assert.match(firstStop.payload?.reason ?? '', /side-tab/i);
  assert.doesNotMatch(firstStop.stdout, /permission|deny/);

  const secondStop = evaluateCodexPluginHook({ event: stopEvent, pluginRoot });
  assert.equal(secondStop.payload, null);
  assert.equal(secondStop.stdout, '');
});
