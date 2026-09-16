import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { root, hash, prepare, apply, project, check, validateInstalled, destinations } from '../scripts/lib/motion-vendor.mjs';

const commit = '1140efe9ad5e03c689ea6bb19d9d3850a4dae5f7';
const inputs = JSON.parse(fs.readFileSync(new URL('./fixtures/motion-upstream.json', import.meta.url)));
function fixture(t, modify = files => files) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'motion-maintenance-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const base = path.join(temp, 'design');
  fs.mkdirSync(base);
  for (const rel of ['scripts/lib/motion-vendor.mjs', 'overlays/skills/motion']) {
    fs.mkdirSync(path.dirname(path.join(base, rel)), { recursive: true });
    fs.cpSync(path.join(root, rel), path.join(base, rel), { recursive: true });
  }
  const source = path.join(temp, `ai-kit-${commit}`);
  for (const [relative, bytes] of Object.entries(modify(structuredClone(inputs)))) {
    fs.mkdirSync(path.dirname(path.join(source, relative)), { recursive: true });
    fs.writeFileSync(path.join(source, relative), bytes);
  }
  const archive = path.join(temp, 'upstream.zip');
  execFileSync('zip', ['-qr', archive, `ai-kit-${commit}`], { cwd: temp });
  return { base, archive, commit, source, temp, expectedHash: hash(fs.readFileSync(archive)) };
}
function owned(base) {
  const result = {};
  function visit(p) {
    if (!fs.existsSync(path.join(base, p))) return;
    if (fs.statSync(path.join(base, p)).isDirectory()) for (const n of fs.readdirSync(path.join(base, p)).sort()) visit(`${p}/${n}`);
    else result[p] = fs.readFileSync(path.join(base, p)).toString('base64');
  }
  destinations.forEach(visit);
  return result;
}

test('Motion import prepares, reviews, applies and reprojects identical pinned files offline', t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.base, 'unrelated.txt'), 'keep');
  const before = owned(f.base);
  const candidate = prepare(f);
  assert.deepEqual(owned(f.base), before);
  assert.ok(fs.readFileSync(path.join(candidate.directory, 'repository.patch'), 'utf8').includes('skills/motion/SKILL.md'));
  assert.equal(apply({ base: f.base, id: candidate.id }).state, 'candidate-applied');
  assert.equal(validateInstalled(f.base).commit, commit);
  const first = owned(f.base);
  const again = prepare(f);
  apply({ base: f.base, id: again.id });
  assert.deepEqual(owned(f.base), first);
  assert.equal(fs.readFileSync(path.join(f.base, 'unrelated.txt'), 'utf8'), 'keep');
  assert.deepEqual(project(f).files, project(f).files);
});

test('Motion rejects corrupt archive, source mismatch and unknown replacement inputs before writes', t => {
  const f = fixture(t);
  assert.throws(() => prepare({ ...f, expectedHash: '0'.repeat(64) }), /hash mismatch/);
  fs.appendFileSync(path.join(f.source, 'plugins/motion/skills/motion/SKILL.md'), 'changed');
  assert.throws(() => prepare(f), /checkout\/archive mismatch/);
  assert.deepEqual(owned(f.base), {});
  const unknown = fixture(t, files => { files['plugins/motion/skills/motion/SKILL.md'] += 'new directive'; return files; });
  assert.throws(() => prepare(unknown), /Unknown Motion replacement input/);
  const added = fixture(t, files => { files['plugins/motion/skills/motion/unexpected.md'] = 'unexpected'; return files; });
  assert.throws(() => prepare(added), /inventory/);
});

test('Motion detects baseline, recipe, candidate and projection drift without losing work', t => {
  for (const kind of ['baseline', 'recipe', 'candidate', 'projection', 'archive', 'patch']) {
    const f = fixture(t);
    const c = prepare(f);
    if (kind === 'baseline') { fs.mkdirSync(path.join(f.base, 'skills/motion'), { recursive: true }); fs.writeFileSync(path.join(f.base, 'skills/motion/local.md'), 'owned local work'); }
    if (kind === 'recipe') fs.appendFileSync(path.join(f.base, 'overlays/skills/motion/SKILL.md'), 'changed');
    if (kind === 'candidate') fs.appendFileSync(path.join(c.directory, 'candidate.json'), 'invalid');
    if (kind === 'projection') fs.appendFileSync(path.join(c.directory, 'projection/skills/motion/SKILL.md'), 'changed');
    if (kind === 'archive') fs.appendFileSync(path.join(c.directory, 'upstream.zip'), 'changed');
    if (kind === 'patch') fs.appendFileSync(path.join(c.directory, 'repository.patch'), 'misleading review');
    const before = owned(f.base);
    assert.throws(() => apply({ base: f.base, id: c.id }));
    assert.deepEqual(owned(f.base), before);
  }
});

test('Motion preparation reuses identical candidates but rejects changed review artifacts', t => {
  const f = fixture(t), c = prepare(f);
  assert.equal(prepare(f).id, c.id);
  fs.appendFileSync(path.join(c.directory, 'repository.patch'), 'changed review');
  assert.throws(() => prepare(f), /review patch drift/);
});

test('Motion refuses a changed upstream license inventory', t => {
  const f = fixture(t, files => { files.LICENSE = 'new license terms'; return files; });
  assert.throws(() => prepare(f), /license inventory changed/);
  assert.deepEqual(owned(f.base), {});
});

test('Motion rejects destination symlinks and restores bytes after a failed write', t => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.base, 'skills/motion'), { recursive: true });
  fs.writeFileSync(path.join(f.base, 'skills/motion/local.md'), 'retain');
  const before = owned(f.base), c = prepare(f);
  assert.throws(() => apply({ base: f.base, id: c.id, failAfter: 2 }), /prior files restored/);
  assert.deepEqual(owned(f.base), before);
  fs.symlinkSync(f.source, path.join(f.base, 'skills/motion/link'));
  assert.throws(() => prepare(f), /symlink/);
});

test('Motion upstream check distinguishes current, update and missing evidence', async t => {
  const f = fixture(t), c = prepare(f);
  apply({ base: f.base, id: c.id });
  const response = sha => async () => ({ ok: true, json: async () => ({ sha }) });
  assert.equal((await check({ base: f.base, fetchImpl: response(commit) })).state, 'current');
  assert.equal((await check({ base: f.base, fetchImpl: response('a'.repeat(40)) })).state, 'update-available');
  assert.equal((await check({ base: f.base, fetchImpl: async () => { throw new Error('offline'); } })).state, 'unverifiable');
  assert.equal((await check({ base: f.base, fetchImpl: response('main') })).state, 'unverifiable');
});

test('Motion installed validation rejects undeclared files and manual output edits', t => {
  const f = fixture(t), c = prepare(f);
  apply({ base: f.base, id: c.id });
  fs.appendFileSync(path.join(f.base, 'skills/motion/best-practices/index.md'), 'changed');
  assert.throws(() => validateInstalled(f.base), /output drift/);
});
