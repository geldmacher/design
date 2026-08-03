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
  const result = setupProject(root);
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
  assert.equal(inspectProject(root).hook.enabled, false);
  const applied = setupProject(root, { apply: true });
  assert.equal(applied.applied, true);
  assert.equal(inspectProject(root).hook.enabled, true);
  assert.equal(inspectProject(otherRoot).hook.enabled, false);
  assert.equal(fs.existsSync(path.join(root, '.cursor', 'hooks.json')), false);
  setProjectHook(root, false);
  setProjectHook(root, true);
  assert.equal(fs.existsSync(path.join(root, '.cursor', 'hooks.json')), false);
});

test('direct Impeccable installations and duplicate hooks are detected and not overwritten', (t) => {
  const root = project();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.cursor', 'skills', 'impeccable'), { recursive: true });
  fs.writeFileSync(path.join(root, '.cursor', 'skills', 'impeccable', 'SKILL.md'), 'shadow');
  fs.writeFileSync(path.join(root, '.cursor', 'hooks.json'), JSON.stringify({ hooks: { preToolUse: [{ command: 'node .cursor/skills/impeccable/scripts/hook-before-edit.mjs' }] } }));
  assert.deepEqual(detectProjectConflicts(root).map((finding) => finding.id).sort(), ['direct-impeccable-installation', 'duplicate-impeccable-hook']);
  const setup = setupProject(root, { apply: true });
  assert.equal(setup.blocked, true);
  assert.equal(fs.existsSync(path.join(root, '.impeccable')), false);
});

test('malformed config and missing Node produce honest non-blocking diagnostics', (t) => {
  const root = project();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.impeccable'), { recursive: true });
  fs.writeFileSync(path.join(root, '.impeccable', 'config.json'), '{broken');
  const report = diagnoseProject(root, { nodeAvailable: false });
  assert.equal(report.hook.enabled, false);
  assert.ok(report.findings.some((finding) => finding.id === 'malformed-impeccable-config'));
  assert.ok(report.findings.some((finding) => finding.id === 'node-missing'));
  assert.equal(setupProject(root, { apply: true }).blocked, true);
});
