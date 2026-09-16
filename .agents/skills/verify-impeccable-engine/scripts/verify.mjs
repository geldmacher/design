#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(import.meta.dirname, '../../../..');
const engineTests = ['impeccable-engine', 'detector-orchestration', 'hook', 'codex-hook', 'host', 'guidance-contract', 'portable-runtime', 'plugin-targets', 'impeccable-maintenance', 'project-state', 'motion-maintenance', 'motion-contract'];
const sourceDirectories = ['src', 'hooks', 'scripts', 'tests', 'upstream', 'overlays', 'skills', 'modules', 'manifests', 'schemas', 'assets', 'docs', '.agents', '.cursor', '.cursor-plugin', '.codex-plugin', '.github'];

export function selectTests(sourceRoot, all = false) {
  const tests = all
    ? fs.readdirSync(path.join(sourceRoot, 'tests'), { recursive: true, withFileTypes: true }).filter(entry => entry.isFile() && entry.name.endsWith('.test.mjs')).map(entry => path.relative(sourceRoot, path.join(entry.parentPath, entry.name)))
    : engineTests.map(name => `tests/${name}.test.mjs`);
  if (!tests.length || new Set(tests).size !== tests.length) throw new Error('Test selection must be nonempty and unique.');
  for (const file of tests) if (!fs.lstatSync(path.join(sourceRoot, file)).isFile()) throw new Error(`Invalid test file: ${file}`);
  return tests.sort();
}

function sourceHashes(sourceRoot) {
  const hashes = {};
  function visit(relative) {
    const file = path.join(sourceRoot, relative);
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) throw new Error(`Symlink in verifier source: ${relative}`);
    if (stat.isDirectory()) for (const name of fs.readdirSync(file).sort()) visit(path.join(relative, name));
    else if (stat.isFile()) hashes[relative] = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  }
  for (const directory of sourceDirectories) if (fs.existsSync(path.join(sourceRoot, directory))) visit(directory);
  for (const entry of fs.readdirSync(sourceRoot, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) if (entry.isFile()) visit(entry.name);
  return hashes;
}

export function verifyEngine({ sourceRoot = root, all = false, run = spawnSync } = {}) {
  const tests = selectTests(sourceRoot, all);
  const before = sourceHashes(sourceRoot);
  const pin = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'upstream/impeccable.pin.json')));
  const evidence = fs.mkdtempSync(path.join(os.tmpdir(), 'design-engine-evidence-'));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'design-engine-home-'));
  // A verifier may itself be exercised by node --test. Do not inherit its child-runner context.
  const environment = { ...process.env };
  delete environment.NODE_TEST_CONTEXT;
  let result, cleanupError = null;
  try {
    result = run(process.execPath, ['--test', '--test-reporter=tap', ...tests], {
      cwd: sourceRoot, encoding: 'utf8', timeout: 180000, maxBuffer: 16 * 1024 * 1024, shell: false,
      env: { ...environment, HOME: home, USERPROFILE: home, CODEX_HOME: path.join(home, 'codex'), XDG_CONFIG_HOME: path.join(home, 'config'), XDG_CACHE_HOME: path.join(home, 'cache'), XDG_DATA_HOME: path.join(home, 'data'), IMPECCABLE_NO_UPDATE_CHECK: '1', IMPECCABLE_UPDATE_CACHE: path.join(home, 'update.json') },
    });
  } catch (error) { result = { status: null, error }; }
  finally {
    try { fs.rmSync(home, { recursive: true, force: true }); } catch (error) { cleanupError = error.message; }
  }
  fs.writeFileSync(path.join(evidence, 'transcript.tap'), `${result.stdout || ''}\n${result.stderr || ''}\n${result.error?.message || ''}`);
  let changed = [], inspectionError = null;
  try {
    const after = sourceHashes(sourceRoot);
    changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(file => before[file] !== after[file]).sort();
  } catch (error) { inspectionError = error.message; }
  const platform = `${process.platform === 'win32' ? 'windows' : process.platform}-${process.arch}`;
  const cleanup = !fs.existsSync(home);
  const summary = {
    passed: result.status === 0 && !result.error && !changed.length && !inspectionError && cleanup && !cleanupError,
    exitCode: result.status, error: result.error?.message || inspectionError || cleanupError,
    mode: all ? 'all' : 'engine', tests, platform,
    unexecutedPlatforms: Object.keys(pin.engine.assets).filter(key => key !== platform), pin,
    motionPin: fs.existsSync(path.join(sourceRoot, 'upstream/motion.pin.json')) ? JSON.parse(fs.readFileSync(path.join(sourceRoot, 'upstream/motion.pin.json'))) : null,
    sourceHashes: before, changedDuringTrial: changed, cleanup, evidence,
  };
  fs.writeFileSync(path.join(evidence, 'result.json'), `${JSON.stringify(summary, null, 2)}\n`);
  if (!fs.existsSync(path.join(evidence, 'transcript.tap'))) throw new Error('Verifier evidence missing after cleanup.');
  return summary;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  try {
    const args = process.argv.slice(2);
    if (args.length && (args.length !== 1 || args[0] !== '--all')) throw new Error('Usage: verify.mjs [--all]');
    const summary = verifyEngine({ all: args[0] === '--all' });
    process.stdout.write(`${JSON.stringify({ passed: summary.passed, mode: summary.mode, testFiles: summary.tests.length, platform: summary.platform, unexecutedPlatforms: summary.unexecutedPlatforms, cleanup: summary.cleanup, evidence: summary.evidence }, null, 2)}\n`);
    if (!summary.passed) process.stderr.write(fs.readFileSync(path.join(summary.evidence, 'transcript.tap'), 'utf8') + `\n${summary.error || ''}\n`);
    process.exitCode = summary.passed ? 0 : 1;
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
