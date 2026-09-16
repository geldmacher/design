import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const repository = 'https://github.com/motiondivision/ai-kit';
export const endpoint = 'https://mcp.motion.dev';
export const destinations = ['skills/motion', 'modules/motion.json', 'upstream/motion.pin.json', 'upstream/motion.lock.json', 'upstream/motion-license.json', 'upstream/patches/motion-plugin.patch'];
const skillPrefix = 'plugins/motion/skills/motion/';
const expectedFiles = ['SKILL.md', 'best-practices/base-ui.md', 'best-practices/index.md', 'best-practices/motion.md', 'best-practices/react.md', 'best-practices/vue.md', 'codex/index.md', 'css-spring/index.md', 'performance-audit/index.md', 'transition-preview/index.md'];
const replacedContracts = {
  'SKILL.md': 'e9e9b884afe14b07c3c71fe707a5fa2407b2d645c75686402927496dd7e596f3',
  'codex/index.md': '590c1d3891019a501b77389dde78d9cb259e66bcb87746e5c7d06d8414fccaf6',
};
export const hash = value => createHash('sha256').update(value).digest('hex');
const json = value => `${JSON.stringify(value, null, 2)}\n`;
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const sorted = value => Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const revision = value => { if (!/^[a-f0-9]{40}$/.test(value || '')) throw new Error('Motion requires an exact 40-character commit.'); return value; };

function safePath(base, relative) {
  if (!relative || relative.startsWith('/') || relative.split('/').some(p => !p || p === '.' || p === '..') || relative.includes('\\')) throw new Error('Unsafe Motion path.');
  let current = base;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    if (fs.existsSync(current) || (() => { try { fs.lstatSync(current); return true; } catch { return false; } })()) {
      if (fs.lstatSync(current).isSymbolicLink()) throw new Error(`Motion path crosses symlink: ${relative}`);
    }
  }
  return current;
}
function tree(base, relatives) {
  const output = {};
  function visit(relative) {
    const file = safePath(base, relative);
    if (!fs.existsSync(file)) return;
    const stat = fs.lstatSync(file);
    if (stat.isDirectory()) for (const name of fs.readdirSync(file).sort()) visit(`${relative}/${name}`);
    else if (stat.isFile()) output[relative] = fs.readFileSync(file).toString('base64');
    else throw new Error(`Unsupported Motion file: ${relative}`);
  }
  relatives.forEach(visit);
  return sorted(output);
}
function writeTree(base, files) {
  for (const [relative, content] of Object.entries(files)) {
    const file = safePath(base, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(content, 'base64'));
  }
}
const encode = files => sorted(Object.fromEntries(Object.entries(files).map(([p, data]) => [p, Buffer.from(data).toString('base64')])));
function recipe(base) { return hash(json(tree(base, ['scripts/lib/motion-vendor.mjs', 'overlays/skills/motion']))); }

export function validatePin(pin) {
  if (pin?.schemaVersion !== 1 || pin.repository !== repository || pin.branch !== 'main' || pin.license !== 'MIT') throw new Error('Invalid Motion pin identity.');
  revision(pin.commit);
  if (!/^\d+\.\d+\.\d+$/.test(pin.version) || !/^[a-f0-9]{64}$/.test(pin.archive?.sha256 || '') || pin.archive.url !== `https://codeload.github.com/motiondivision/ai-kit/zip/${pin.commit}`) throw new Error('Invalid Motion pin provenance.');
  return pin;
}

function archiveFiles(archive, commit) {
  const prefix = `ai-kit-${revision(commit)}/`;
  const run = args => execFileSync('unzip', args, { maxBuffer: 32 * 1024 * 1024 });
  const names = run(['-Z1', archive]).toString().trim().split('\n');
  if (new Set(names).size !== names.length) throw new Error('Duplicate Motion archive entry.');
  for (const name of names) if (!name.startsWith(prefix) || name.includes('\\') || name.slice(0, -1).split('/').some(p => p === '..' || p === '.' || !p)) throw new Error(`Unsafe Motion archive entry: ${name}`);
  if (/^l/m.test(run(['-Z', '-l', archive]).toString())) throw new Error('Motion archive contains a symlink.');
  if (names.some(name => /\/(?:LICENSE|COPYING|NOTICE)(?:\.[^/]*)?$/i.test(name))) throw new Error('Motion license inventory changed. Review and retain the new notices before importing.');
  const skillFiles = names.filter(n => n.startsWith(prefix + skillPrefix) && !n.endsWith('/')).map(n => n.slice((prefix + skillPrefix).length)).sort();
  if (!equal(skillFiles, expectedFiles)) throw new Error('Unexpected Motion upstream skill inventory. Review the importer.');
  const result = {};
  for (const relative of [...expectedFiles.map(p => skillPrefix + p), 'plugins/motion/.cursor-plugin/plugin.json', 'packages/motion-ai/package.json']) {
    const name = prefix + relative;
    if (!names.includes(name)) throw new Error(`Missing Motion archive input: ${relative}`);
    result[relative] = run(['-p', archive, name]).toString('utf8');
  }
  return result;
}
function replaceOnce(text, from, to) {
  if (text.split(from).length !== 2) throw new Error(`Unknown Motion transformation anchor: ${from}`);
  return text.replace(from, to);
}
function patch(before, after, file) {
  if (before === after) return '';
  const a = before.trimEnd().split('\n'), b = after.trimEnd().split('\n');
  return `--- a/${file}\n+++ b/${file}\n@@ -1,${a.length} +1,${b.length} @@\n${a.map(s => '-' + s).join('\n')}\n${b.map(s => '+' + s).join('\n')}\n`;
}

export function project({ base = root, archive, commit, expectedHash, source } = {}) {
  revision(commit);
  const archiveHash = hash(fs.readFileSync(archive));
  if (expectedHash && archiveHash !== expectedHash) throw new Error('Motion archive hash mismatch.');
  const upstream = archiveFiles(archive, commit);
  if (source) for (const [relative, bytes] of Object.entries(upstream)) {
    if (fs.readFileSync(safePath(source, relative), 'utf8') !== bytes) throw new Error(`Motion checkout/archive mismatch: ${relative}`);
  }
  const manifest = JSON.parse(upstream['plugins/motion/.cursor-plugin/plugin.json']);
  const installer = JSON.parse(upstream['packages/motion-ai/package.json']);
  if (manifest.license !== 'MIT' || installer.license !== 'MIT' || manifest.name !== 'motion') throw new Error('Unverified Motion license or identity.');
  const pin = validatePin({ schemaVersion: 1, repository, branch: 'main', version: manifest.version, commit, license: 'MIT', archive: { url: `https://codeload.github.com/motiondivision/ai-kit/zip/${commit}`, sha256: archiveHash } });
  const outputs = {}, imports = [], patches = [];
  for (const relative of expectedFiles) {
    if (!relative.startsWith('best-practices/') && !Object.hasOwn(replacedContracts, relative)) continue;
    const original = upstream[skillPrefix + relative];
    let content = original;
    if (Object.hasOwn(replacedContracts, relative)) {
      if (hash(original) !== replacedContracts[relative]) throw new Error(`Unknown Motion replacement input: ${relative}. Review the upstream change first.`);
      content = fs.readFileSync(path.join(base, 'overlays/skills/motion', relative), 'utf8').replaceAll('@VERSION@', pin.version);
    } else if (relative === 'best-practices/react.md') {
      content = replaceOnce(content, '-   **Never** import from `framer-motion`.', '-   For projects already using Motion, use the imports below. Preserve compatible `framer-motion` imports in existing projects unless migration is explicitly requested.');
    } else if (relative === 'best-practices/motion.md') {
      content = replaceOnce(content, '-   Import from `motion`, never from `framer-motion`.', '-   For projects using Motion, import from `motion`. Preserve the existing animation stack; this guidance does not authorize installing or migrating packages.');
    }
    const destination = `skills/motion/${relative}`;
    outputs[destination] = content;
    imports.push({ source: skillPrefix + relative, destination, before: hash(original), after: hash(content) });
    patches.push(patch(original, content, destination));
  }
  outputs['skills/motion/agents/openai.yaml'] = fs.readFileSync(path.join(base, 'overlays/skills/motion/agents/openai.yaml'), 'utf8');
  outputs['modules/motion.json'] = json({ $schema: './module.schema.json', schemaVersion: 1, id: 'motion', version: pin.version, source: { type: 'vendored', url: repository, commit, archiveSha256: archiveHash }, license: 'MIT', capabilities: [{ id: 'animation-implementation', title: 'Motion implementation and free documentation', skill: 'motion', fallback: false, triggers: ['motion'], intents: { motion: 'Implement or explain Motion APIs and web animations using the existing stack, local best practices and free documentation; excludes paid tools, automatic installation and migrations.' } }], contributes: { skills: ['skills/motion'], agents: [], rules: [], hooks: [], scripts: [], mcpServers: ['mcp.json'] } });
  outputs['upstream/motion.pin.json'] = json(pin);
  outputs['upstream/motion-license.json'] = json({ repository, commit, license: 'MIT', author: manifest.author, evidence: ['plugins/motion/.cursor-plugin/plugin.json', 'packages/motion-ai/package.json'].map(p => ({ path: p, sha256: hash(upstream[p]), content: JSON.parse(upstream[p]) })), note: 'The upstream archive declares MIT in both manifests and contains no standalone license text. These original declarations are retained without inventing an upstream copyright notice.' });
  outputs['upstream/patches/motion-plugin.patch'] = patches.join('');
  outputs['upstream/motion.lock.json'] = json({ schemaVersion: 1, pin, transformations: ['free-skill-overlay', 'free-search-overlay', 'preserve-installed-stack'], imports, files: sorted(Object.fromEntries(Object.entries(outputs).map(([p, content]) => [p, hash(content)]))) });
  return { pin, files: encode(outputs) };
}

function snapshot(base) { return tree(base, destinations); }
function candidateRoot(base) { return safePath(base, '.build/motion-updates'); }
function repositoryPatch(record) {
  return Object.keys({ ...record.before, ...record.projection }).sort().map(p => patch(Buffer.from(record.before[p] || '', 'base64').toString(), Buffer.from(record.projection[p] || '', 'base64').toString(), p)).join('');
}
function checkReviewFiles(directory, record) {
  for (const name of ['before', 'projection']) {
    const expected = sorted(Object.fromEntries(Object.entries(record[name]).map(([p, bytes]) => [`${name}/${p}`, bytes])));
    if (!equal(tree(directory, [name]), expected)) throw new Error(`Motion candidate ${name} drift.`);
  }
  if (fs.readFileSync(safePath(directory, 'repository.patch'), 'utf8') !== repositoryPatch(record)) throw new Error('Motion review patch drift.');
}
export function prepare({ base = root, archive, commit, expectedHash, source } = {}) {
  const projection = project({ base, archive, commit, expectedHash, source });
  const record = { schemaVersion: 1, pin: projection.pin, recipe: recipe(base), before: snapshot(base), projection: projection.files };
  const id = hash(json(record));
  const directory = safePath(base, `.build/motion-updates/${id}`);
  if (fs.existsSync(directory)) {
    if (!equal(readJson(safePath(directory, 'candidate.json')), record) || hash(fs.readFileSync(safePath(directory, 'upstream.zip'))) !== projection.pin.archive.sha256) throw new Error('Existing Motion candidate drift.');
    checkReviewFiles(directory, record);
    return { state: 'candidate-ready', id, directory, pin: projection.pin };
  }
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'candidate.json'), json(record));
  fs.copyFileSync(archive, path.join(directory, 'upstream.zip'));
  writeTree(directory, encode({ 'repository.patch': repositoryPatch(record) }));
  writeTree(path.join(directory, 'before'), record.before);
  writeTree(path.join(directory, 'projection'), record.projection);
  return { state: 'candidate-ready', id, directory, pin: projection.pin };
}
export function apply({ base = root, id, failAfter = Infinity } = {}) {
  if (!/^[a-f0-9]{64}$/.test(id || '')) throw new Error('Invalid Motion candidate ID.');
  candidateRoot(base);
  const directory = safePath(base, `.build/motion-updates/${id}`);
  const record = readJson(safePath(directory, 'candidate.json'));
  if (hash(json(record)) !== id || record.recipe !== recipe(base)) throw new Error('Motion candidate or importer drift.');
  checkReviewFiles(directory, record);
  if (!equal(record.before, snapshot(base))) throw new Error('Motion baseline drift. Prepare a new reviewed candidate.');
  const projected = project({ base, archive: safePath(directory, 'upstream.zip'), commit: record.pin.commit, expectedHash: record.pin.archive.sha256 });
  if (!equal(record.projection, projected.files) || !equal(tree(directory, ['projection']), sorted(Object.fromEntries(Object.entries(projected.files).map(([p, data]) => [`projection/${p}`, data]))))) throw new Error('Motion candidate projection drift.');
  if (!equal(record.before, snapshot(base))) throw new Error('Motion baseline changed during validation.');
  try {
    for (const relative of destinations) fs.rmSync(safePath(base, relative), { recursive: true, force: true });
    let count = 0;
    for (const [p, content] of Object.entries(projected.files)) {
      if (count++ >= failAfter) throw new Error('Injected Motion write failure.');
      writeTree(base, { [p]: content });
    }
  } catch (error) {
    for (const relative of destinations) fs.rmSync(safePath(base, relative), { recursive: true, force: true });
    writeTree(base, record.before);
    throw new Error(`Motion apply failed; prior files restored: ${error.message}`);
  }
  return { state: 'candidate-applied', id, pin: projected.pin };
}
export function validateInstalled(base = root) {
  const pin = validatePin(readJson(path.join(base, 'upstream/motion.pin.json')));
  const lock = readJson(path.join(base, 'upstream/motion.lock.json'));
  if (!equal(lock.pin, pin)) throw new Error('Motion pin/lock mismatch.');
  const current = snapshot(base);
  const expected = [...Object.keys(lock.files), 'upstream/motion.lock.json'].sort();
  if (!equal(Object.keys(current).sort(), expected)) throw new Error('Motion installed inventory drift.');
  for (const [p, digest] of Object.entries(lock.files)) if (hash(Buffer.from(current[p], 'base64')) !== digest) throw new Error(`Motion output drift: ${p}`);
  for (const relative of Object.keys(replacedContracts)) {
    const output = fs.readFileSync(path.join(base, 'skills/motion', relative), 'utf8');
    if (output !== fs.readFileSync(path.join(base, 'overlays/skills/motion', relative), 'utf8').replaceAll('@VERSION@', pin.version)) throw new Error(`Motion overlay drift: ${relative}`);
  }
  if (fs.readFileSync(path.join(base, 'skills/motion/agents/openai.yaml'), 'utf8') !== fs.readFileSync(path.join(base, 'overlays/skills/motion/agents/openai.yaml'), 'utf8')) throw new Error('Motion metadata overlay drift.');
  return pin;
}
async function get(url, fetchImpl) {
  const response = await fetchImpl(url, { headers: { 'User-Agent': 'geldmacher-design' }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Motion upstream HTTP ${response.status}`);
  return response;
}
export async function check({ base = root, fetchImpl = fetch } = {}) {
  try {
    const latest = revision((await (await get('https://api.github.com/repos/motiondivision/ai-kit/commits/main', fetchImpl)).json()).sha);
    const current = validatePin(readJson(path.join(base, 'upstream/motion.pin.json'))).commit;
    return { state: current === latest ? 'current' : 'update-available', current, latest };
  } catch (error) { return { state: 'unverifiable', reason: error.message }; }
}
export async function prepareRemote({ base = root, commit, fetchImpl = fetch } = {}) {
  revision(commit);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'design-motion-download-'));
  try {
    const archive = path.join(directory, 'upstream.zip');
    fs.writeFileSync(archive, Buffer.from(await (await get(`https://codeload.github.com/motiondivision/ai-kit/zip/${commit}`, fetchImpl)).arrayBuffer()));
    return prepare({ base, archive, commit });
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}
