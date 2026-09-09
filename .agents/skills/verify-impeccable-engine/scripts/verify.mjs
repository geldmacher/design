#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '../../../..');
const evidence = fs.mkdtempSync(path.join(os.tmpdir(), 'design-engine-evidence-'));
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'design-engine-home-'));
const tests = ['impeccable-engine', 'detector-orchestration', 'hook', 'codex-hook', 'host', 'guidance-contract', 'portable-runtime', 'plugin-targets', 'impeccable-maintenance'].map((name) => `tests/${name}.test.mjs`);
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sourceHashes = {};
for (const directory of ['src', 'hooks', 'scripts', 'tests', 'upstream', 'overlays', 'skills', 'modules', '.agents/skills/verify-impeccable-engine']) {
  for (const file of fs.readdirSync(path.join(root, directory), { recursive: true })) {
    const relative = `${directory}/${file}`;
    if (fs.statSync(path.join(root, relative)).isFile()) sourceHashes[relative] = hash(path.join(root, relative));
  }
}
for (const file of ['package.json', 'package-lock.json', 'AGENTS.md']) sourceHashes[file] = hash(path.join(root, file));
let result;
try {
  result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...tests], {
    cwd: root, encoding: 'utf8', timeout: 180000, maxBuffer: 16 * 1024 * 1024, shell: false,
    env: { ...process.env, HOME: home, USERPROFILE: home, CODEX_HOME: path.join(home, 'codex'), XDG_CONFIG_HOME: path.join(home, 'config'), XDG_CACHE_HOME: path.join(home, 'cache'), XDG_DATA_HOME: path.join(home, 'data'), IMPECCABLE_NO_UPDATE_CHECK: '1', IMPECCABLE_UPDATE_CACHE: path.join(home, 'update.json') },
  });
  fs.writeFileSync(path.join(evidence, 'transcript.tap'), `${result.stdout || ''}\n${result.stderr || ''}`);
} finally { fs.rmSync(home, { recursive: true, force: true }); }
const changed = Object.entries(sourceHashes).filter(([file, expected]) => hash(path.join(root, file)) !== expected).map(([file]) => file);
const platform = `${process.platform === 'win32' ? 'windows' : process.platform}-${process.arch}`;
const pin = JSON.parse(fs.readFileSync(path.join(root, 'upstream/impeccable.pin.json')));
const summary = { passed: result.status === 0 && !changed.length, exitCode: result.status, error: result.error?.message || null, platform, unexecutedPlatforms: Object.keys(pin.engine.assets).filter((key) => key !== platform), pin, sourceHashes, changedDuringTrial: changed, cleanup: !fs.existsSync(home), evidence };
fs.writeFileSync(path.join(evidence, 'result.json'), `${JSON.stringify(summary, null, 2)}\n`);
if (!fs.existsSync(path.join(evidence, 'transcript.tap'))) throw new Error('Verifier evidence missing after cleanup.');
process.stdout.write(`${JSON.stringify({ passed: summary.passed, platform, unexecutedPlatforms: summary.unexecutedPlatforms, cleanup: summary.cleanup, evidence }, null, 2)}\n`);
if (!summary.passed) process.stderr.write(`${result.stdout || ''}\n${result.stderr || ''}`);
process.exitCode = summary.passed ? 0 : 1;
