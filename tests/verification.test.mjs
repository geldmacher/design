import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { selectTests, verifyEngine } from '../.agents/skills/verify-impeccable-engine/scripts/verify.mjs';

function fixture(t, body = 'import test from "node:test"; test("fixture", () => {});') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'design-verifier-fixture-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'tests/nested'), { recursive: true });
  fs.mkdirSync(path.join(root, 'upstream'));
  fs.writeFileSync(path.join(root, 'tests/case.test.mjs'), body);
  fs.writeFileSync(path.join(root, 'tests/nested/other.test.mjs'), '');
  fs.writeFileSync(path.join(root, 'tests/helper.mjs'), 'throw new Error("must not run")');
  fs.writeFileSync(path.join(root, 'upstream/impeccable.pin.json'), JSON.stringify({ engine: { assets: {} } }));
  return root;
}

function checkEvidence(t, summary) {
  t.after(() => fs.rmSync(summary.evidence, { recursive: true, force: true }));
  assert.equal(summary.cleanup, true);
  assert.ok(fs.existsSync(path.join(summary.evidence, 'transcript.tap')));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(summary.evidence, 'result.json'))), summary);
}

test('all verifier discovers nested tests once and preserves results after isolated-home cleanup', t => {
  const sourceRoot = fixture(t, 'import assert from "node:assert/strict"; import fs from "node:fs"; fs.writeFileSync(process.env.HOME + "/sentinel", "isolated"); assert.ok(process.env.HOME.includes("design-engine-home-"));');
  assert.deepEqual(selectTests(sourceRoot, true), [path.join('tests', 'case.test.mjs'), path.join('tests', 'nested', 'other.test.mjs')]);
  const summary = verifyEngine({ sourceRoot, all: true });
  checkEvidence(t, summary);
  assert.equal(summary.passed, true);
  assert.equal(summary.mode, 'all');
  assert.equal(summary.tests.length, 2);
  assert.ok(summary.sourceHashes[path.join('tests', 'case.test.mjs')]);
});

test('verifier forwards real test failures and thrown process errors', t => {
  const sourceRoot = fixture(t, 'throw new Error("deliberate failure")');
  for (const extra of [{}, { run: () => { throw new Error('process unavailable'); } }]) {
    const summary = verifyEngine({ sourceRoot, all: true, ...extra });
    checkEvidence(t, summary);
    assert.equal(summary.passed, false);
    assert.match(fs.readFileSync(path.join(summary.evidence, 'transcript.tap'), 'utf8'), /deliberate failure|process unavailable/);
  }
});

test('verifier rejects source creation and deletion during an otherwise successful trial', t => {
  const sourceRoot = fixture(t);
  const summary = verifyEngine({ sourceRoot, all: true, run: () => {
    fs.unlinkSync(path.join(sourceRoot, 'tests/helper.mjs'));
    fs.writeFileSync(path.join(sourceRoot, 'tests/new.mjs'), '');
    return { status: 0, stdout: 'simulated trial' };
  } });
  checkEvidence(t, summary);
  assert.equal(summary.passed, false);
  assert.deepEqual(summary.changedDuringTrial, [path.join('tests', 'helper.mjs'), path.join('tests', 'new.mjs')]);
});
