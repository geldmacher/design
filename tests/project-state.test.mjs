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
