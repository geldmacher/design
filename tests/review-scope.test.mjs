import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { parseReviewArgs, resolveReviewScope } from '../skills/design/scripts/review-scope.mjs';

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const resolverScript = join(repositoryRoot, 'skills', 'design', 'scripts', 'review-scope.mjs');

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1' },
  });
}

function git(root, ...args) {
  const result = run('git', args, { cwd: root });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function write(root, relative, value) {
  const path = join(root, relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value);
}

function initializeRepository(t) {
  const root = mkdtempSync(join(tmpdir(), 'design-review-scope-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.name', 'Design Test');
  git(root, 'config', 'user.email', 'design@example.test');
  write(root, 'src/Card.tsx', 'export const Card = () => <button>Open</button>;\n');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'initial interface');
  return root;
}

function commit(root, message) {
  git(root, 'add', '.');
  git(root, 'commit', '-m', message);
  return git(root, 'rev-parse', 'HEAD');
}

function assertNoCheckoutOperations(result) {
  const forbidden = new Set(['checkout', 'switch', 'stash']);
  for (const operation of result.operations) {
    assert.equal(operation.command === 'git' && forbidden.has(operation.args[0]), false, JSON.stringify(operation));
  }
}

test('argument parsing defaults to quick and preserves multi-token targets', () => {
  assert.deepEqual(parseReviewArgs([]), { mode: 'quick', target: null });
  assert.deepEqual(parseReviewArgs(['full', 'pr', '42']), { mode: 'full', target: 'pr 42' });
  assert.deepEqual(parseReviewArgs(['--mode', 'full', '--target', 'pr 42', '--json']), { mode: 'full', target: 'pr 42' });
  assert.throws(() => parseReviewArgs(['--mode', 'deep']), /Unsupported review mode/);
});

test('CLI exit codes distinguish ready, empty, and blocked JSON results', (t) => {
  const root = initializeRepository(t);
  const empty = run(process.execPath, [resolverScript, '--target', 'working', '--json'], { cwd: root });
  assert.equal(empty.status, 2, empty.stderr);
  assert.equal(JSON.parse(empty.stdout).status, 'empty');

  write(root, 'src/Card.tsx', 'export const Card = () => <button aria-label="Open">Open</button>;\n');
  const ready = run(process.execPath, [resolverScript, '--target', 'working', '--json'], { cwd: root });
  assert.equal(ready.status, 0, ready.stderr);
  assert.equal(JSON.parse(ready.stdout).status, 'ready');

  const blocked = run(process.execPath, [resolverScript, '--mode', 'deep', '--json'], { cwd: root });
  assert.equal(blocked.status, 3, blocked.stderr);
  assert.equal(JSON.parse(blocked.stdout).status, 'blocked');
});

test('default scope prefers branch commits and includes dirty and untracked work', (t) => {
  const root = initializeRepository(t);
  git(root, 'switch', '-c', 'feature');
  write(root, 'src/Card.tsx', 'export const Card = () => <button aria-label="Open">Open</button>;\n');
  commit(root, 'improve card semantics');
  write(root, 'src/Panel.tsx', 'export const Panel = () => <aside>Panel</aside>;\n');
  write(root, 'package-lock.json', '{"lockfileVersion":3}\n');
  const before = git(root, 'status', '--porcelain=v1');

  const result = resolveReviewScope({ cwd: root });

  assert.equal(result.status, 'ready');
  assert.equal(result.mode, 'quick');
  assert.equal(result.target.resolved, 'branch');
  assert.equal(result.counts.commits, 1);
  assert.equal(result.counts.uncommittedFiles, 2);
  assert.deepEqual(result.files.map((file) => file.path), ['src/Card.tsx', 'src/Panel.tsx']);
  assert.deepEqual(result.excluded.map((file) => [file.path, file.reason]), [['package-lock.json', 'lockfile']]);
  assert.equal(git(root, 'status', '--porcelain=v1'), before);
  assertNoCheckoutOperations(result);
});

test('working and staged targets keep their boundaries and untracked behavior', (t) => {
  const root = initializeRepository(t);
  write(root, 'src/Card.tsx', 'export const Card = () => <button aria-label="Open">Open</button>;\n');
  git(root, 'add', 'src/Card.tsx');
  write(root, 'src/Untracked.tsx', 'export const Untracked = () => <div />;\n');

  const staged = resolveReviewScope({ cwd: root, target: 'staged' });
  const working = resolveReviewScope({ cwd: root, target: 'working' });

  assert.deepEqual(staged.files.map((file) => file.path), ['src/Card.tsx']);
  assert.deepEqual(working.files.map((file) => file.path), ['src/Card.tsx', 'src/Untracked.tsx']);
  assert.equal(staged.head.ref, 'INDEX');
  assert.equal(working.head.ref, 'WORKTREE');
});

test('explicit two-dot and three-dot ranges remain exact in patch commands', (t) => {
  const root = initializeRepository(t);
  const first = git(root, 'rev-parse', 'HEAD');
  write(root, 'src/Card.tsx', 'export const Card = () => <button aria-label="Open">Open</button>;\n');
  commit(root, 'label control');
  write(root, 'src/Panel.tsx', 'export const Panel = () => <aside>Panel</aside>;\n');
  const last = commit(root, 'add panel');

  for (const dots of ['..', '...']) {
    const expression = `${first}${dots}${last}`;
    const result = resolveReviewScope({ cwd: root, mode: 'full', target: expression });
    assert.equal(result.status, 'ready');
    assert.equal(result.target.resolved, expression);
    assert.equal(result.patchCommands[0].args.includes(expression), true);
    assert.equal(result.mode, 'full');
  }
});

test('renames retain the previous path', (t) => {
  const root = initializeRepository(t);
  git(root, 'mv', 'src/Card.tsx', 'src/ActionCard.tsx');
  const result = resolveReviewScope({ cwd: root, target: 'working' });
  assert.equal(result.status, 'ready');
  assert.equal(result.files[0].status.startsWith('R'), true);
  assert.equal(result.files[0].previousPath, 'src/Card.tsx');
  assert.equal(result.files[0].path, 'src/ActionCard.tsx');
});

test('empty and excluded-only scopes never invent a commit', (t) => {
  const root = initializeRepository(t);
  const clean = resolveReviewScope({ cwd: root });
  assert.equal(clean.status, 'empty');
  assert.equal(clean.noChange.clean, true);
  assert.match(clean.noChange.lastCommit.subject, /initial interface/);
  assert.equal(clean.patchCommands.some((entry) => entry.args.includes('HEAD~1..HEAD')), false);

  write(root, 'pnpm-lock.yaml', 'lockfileVersion: 9\n');
  write(root, 'dist/app.js', 'generated\n');
  write(root, 'src/__snapshots__/Card.snap', 'snapshot\n');
  write(root, 'vendor/widget.js', 'vendored\n');
  write(root, 'public/hero.png', 'binary fixture\n');
  const excluded = resolveReviewScope({ cwd: root, target: 'working' });
  assert.equal(excluded.status, 'empty');
  assert.equal(excluded.noChange.allFilesExcluded, true);
  assert.deepEqual(
    [...new Set(excluded.excluded.map((file) => file.reason))].sort(),
    ['binary-or-media', 'generated-or-vendored-directory', 'lockfile', 'snapshot-or-fixture'],
  );
  assert.equal(excluded.excluded.find((file) => file.path === 'public/hero.png').followReferences, true);
});

test('in-progress Git operations block before scope inspection', (t) => {
  const root = initializeRepository(t);
  writeFileSync(join(root, '.git', 'MERGE_HEAD'), `${git(root, 'rev-parse', 'HEAD')}\n`);
  const result = resolveReviewScope({ cwd: root, target: 'working' });
  assert.equal(result.status, 'blocked');
  assert.equal(result.blocked.code, 'git-operation-in-progress');
});

test('pull requests fetch refs without checking them out and record Git writes', (t) => {
  const source = initializeRepository(t);
  const bare = mkdtempSync(join(tmpdir(), 'design-review-remote-'));
  t.after(() => rmSync(bare, { recursive: true, force: true }));
  git(bare, 'init', '--bare');
  git(source, 'remote', 'add', 'origin', bare);
  git(source, 'push', '-u', 'origin', 'main');
  git(source, 'switch', '-c', 'feature');
  write(source, 'src/Card.tsx', 'export const Card = () => <button aria-label="Open">Open</button>;\n');
  const head = commit(source, 'reviewable feature');
  git(source, 'push', 'origin', 'HEAD:refs/pull/42/head');
  git(source, 'switch', 'main');

  const runner = ({ command, args, cwd }) => {
    if (command === 'gh') {
      return {
        status: 0,
        stdout: JSON.stringify({ title: 'Improve the card', body: 'Make the primary action clearer.', headRefName: 'feature', headRefOid: head, baseRefName: 'main' }),
        stderr: '',
      };
    }
    const result = run(command, args, { cwd });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  };

  const beforeBranch = git(source, 'branch', '--show-current');
  const result = resolveReviewScope({ cwd: source, target: 'pr 42', runner });

  assert.equal(result.status, 'ready');
  assert.equal(result.target.kind, 'pr');
  assert.equal(result.head.ref, 'refs/remotes/pr/42');
  assert.equal(result.intent.title, 'Improve the card');
  assert.equal(result.operations.filter((operation) => operation.writesGit).length, 2);
  assert.equal(git(source, 'branch', '--show-current'), beforeBranch);
  assertNoCheckoutOperations(result);
});

test('an explicit branch review can deepen shallow history without touching source files', (t) => {
  const source = initializeRepository(t);
  const bare = mkdtempSync(join(tmpdir(), 'design-review-shallow-remote-'));
  const clone = mkdtempSync(join(tmpdir(), 'design-review-shallow-clone-'));
  t.after(() => {
    rmSync(bare, { recursive: true, force: true });
    rmSync(clone, { recursive: true, force: true });
  });
  git(bare, 'init', '--bare');
  git(source, 'remote', 'add', 'origin', bare);
  git(source, 'push', 'origin', 'main');
  git(source, 'switch', '-c', 'feature');
  write(source, 'src/Card.tsx', 'export const Card = () => <button aria-label="Open">Open</button>;\n');
  commit(source, 'feature one');
  write(source, 'src/Panel.tsx', 'export const Panel = () => <aside>Panel</aside>;\n');
  commit(source, 'feature two');
  git(source, 'push', 'origin', 'feature');
  git(bare, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  rmSync(clone, { recursive: true, force: true });
  const cloneResult = run('git', ['clone', '--depth=1', '--branch', 'feature', `file://${bare}`, clone]);
  assert.equal(cloneResult.status, 0, cloneResult.stderr);
  git(clone, 'fetch', '--depth=1', 'origin', 'refs/heads/main:refs/remotes/origin/main', '--no-tags');
  git(clone, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
  const sourceBefore = readFileSync(join(clone, 'src/Card.tsx'), 'utf8');
  let forcedMissingMergeBase = false;
  const runner = ({ command, args, cwd }) => {
    if (command === 'git' && args[0] === 'merge-base' && !forcedMissingMergeBase) {
      forcedMissingMergeBase = true;
      return { status: 1, stdout: '', stderr: 'fixture: shallow merge base unavailable' };
    }
    if (command === 'git' && args[0] === 'rev-parse' && args[1] === '--is-shallow-repository') {
      return { status: 0, stdout: 'true\n', stderr: '' };
    }
    const response = run(command, args, { cwd });
    return { status: response.status, stdout: response.stdout, stderr: response.stderr };
  };

  const result = resolveReviewScope({ cwd: clone, target: 'branch', runner });

  assert.equal(result.status, 'ready');
  assert.equal(result.operations.some((operation) => operation.writesGit && operation.args.some((argument) => argument.startsWith('--deepen='))), true);
  assert.equal(readFileSync(join(clone, 'src/Card.tsx'), 'utf8'), sourceBefore);
  assertNoCheckoutOperations(result);
});

test('detached HEAD remains reviewable against the default branch', (t) => {
  const root = initializeRepository(t);
  git(root, 'switch', '-c', 'feature');
  write(root, 'src/Card.tsx', 'export const Card = () => <button aria-label="Open">Open</button>;\n');
  const head = commit(root, 'detached feature');
  git(root, 'switch', '--detach', head);
  const result = resolveReviewScope({ cwd: root, target: 'branch' });
  assert.equal(result.status, 'ready');
  assert.equal(result.head.sha, head);
});
