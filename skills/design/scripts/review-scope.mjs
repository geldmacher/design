#!/usr/bin/env node
import { existsSync, realpathSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const EXCLUDED_DIRECTORY_NAMES = new Set([
  '.build',
  '.cache',
  '.next',
  '.nuxt',
  '.output',
  '.svelte-kit',
  '.turbo',
  '__fixtures__',
  '__snapshots__',
  'build',
  'coverage',
  'dist',
  'fixtures',
  'generated',
  'node_modules',
  'out',
  'playwright-report',
  'storybook-static',
  'target',
  'test-results',
  'third_party',
  'vendor',
]);

const LOCKFILE_NAMES = new Set([
  'bun.lock',
  'bun.lockb',
  'cargo.lock',
  'composer.lock',
  'gemfile.lock',
  'package-lock.json',
  'pnpm-lock.yaml',
  'poetry.lock',
  'uv.lock',
  'yarn.lock',
]);

const BINARY_EXTENSIONS = new Set([
  '.avif', '.eot', '.gif', '.ico', '.jpeg', '.jpg', '.mov', '.mp4', '.otf',
  '.pdf', '.png', '.ttf', '.webm', '.webp', '.woff', '.woff2', '.zip',
]);

const REFERENCEABLE_ASSET_EXTENSIONS = new Set([
  '.avif', '.eot', '.gif', '.jpeg', '.jpg', '.otf', '.png', '.ttf', '.webp', '.woff', '.woff2',
]);

class ScopeFailure extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function normalizePath(value) {
  return String(value).replaceAll('\\', '/');
}

function executableResult(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  return {
    status: Number.isInteger(result.status) ? result.status : 127,
    stdout: result.stdout || '',
    stderr: result.stderr || result.error?.message || '',
  };
}

function baseResult(mode, requestedTarget) {
  return {
    schemaVersion: 1,
    status: 'blocked',
    mode,
    target: {
      requested: requestedTarget || null,
      resolved: null,
      kind: null,
    },
    projectRoot: null,
    base: null,
    head: null,
    intent: null,
    counts: {
      commits: 0,
      uncommittedFiles: 0,
      filesInScope: 0,
      excludedFiles: 0,
    },
    files: [],
    excluded: [],
    patchCommands: [],
    operations: [],
    warnings: [],
    noChange: null,
    blocked: null,
  };
}

function parseNameStatus(output, source) {
  const fields = String(output).split('\0');
  if (fields.at(-1) === '') fields.pop();
  const entries = [];
  for (let index = 0; index < fields.length;) {
    const status = fields[index++];
    if (!status) continue;
    if (/^[RC][0-9]+$/.test(status)) {
      const previousPath = fields[index++];
      const path = fields[index++];
      if (!previousPath || !path) throw new ScopeFailure('malformed-diff', 'Git returned an incomplete rename or copy record.');
      entries.push({ status, path: normalizePath(path), previousPath: normalizePath(previousPath), sources: [source] });
    } else {
      const path = fields[index++];
      if (!path) throw new ScopeFailure('malformed-diff', `Git returned an incomplete ${status} record.`);
      entries.push({ status, path: normalizePath(path), sources: [source] });
    }
  }
  return entries;
}

function parseUntracked(output) {
  return String(output)
    .split('\0')
    .filter(Boolean)
    .map((path) => ({ status: '??', path: normalizePath(path), sources: ['untracked'] }));
}

function mergeEntries(groups) {
  const merged = new Map();
  for (const entries of groups) {
    for (const entry of entries) {
      const current = merged.get(entry.path);
      if (!current) {
        merged.set(entry.path, { ...entry, sources: [...entry.sources] });
        continue;
      }
      current.status = entry.status;
      current.previousPath = entry.previousPath || current.previousPath;
      current.sources = [...new Set([...current.sources, ...entry.sources])];
    }
  }
  return [...merged.values()].sort((left, right) => left.path.localeCompare(right.path));
}

function extensionOf(path) {
  const name = path.split('/').at(-1)?.toLowerCase() || '';
  const index = name.lastIndexOf('.');
  return index === -1 ? '' : name.slice(index);
}

function exclusionFor(path) {
  const normalized = normalizePath(path);
  const lower = normalized.toLowerCase();
  const name = lower.split('/').at(-1) || '';
  const segments = lower.split('/');
  const extension = extensionOf(lower);

  if (LOCKFILE_NAMES.has(name)) return { reason: 'lockfile', followReferences: false };
  if (segments.some((segment) => EXCLUDED_DIRECTORY_NAMES.has(segment))) {
    const snapshot = segments.includes('__snapshots__') || name.endsWith('.snap');
    return { reason: snapshot ? 'snapshot-or-fixture' : 'generated-or-vendored-directory', followReferences: false };
  }
  if (name.endsWith('.snap') || name.includes('.approved.')) return { reason: 'snapshot-or-fixture', followReferences: false };
  if (name.endsWith('.min.js') || name.endsWith('.min.css') || name.endsWith('.map')) {
    return { reason: 'generated-output', followReferences: false };
  }
  if (/\.gen\.[^.]+$/.test(name) || name.includes('.generated.') || name.endsWith('.d.ts')) {
    return { reason: 'generated-source', followReferences: false };
  }
  if (BINARY_EXTENSIONS.has(extension)) {
    return { reason: 'binary-or-media', followReferences: REFERENCEABLE_ASSET_EXTENSIONS.has(extension) };
  }
  return null;
}

function parseRange(target) {
  const match = String(target).match(/^(.+?)(\.\.\.?)(.+)$/);
  if (!match) return null;
  return { left: match[1], dots: match[2], right: match[3] };
}

function parsePrTarget(target) {
  const match = String(target).match(/^pr\s+(\d+)$/i);
  if (!match) return null;
  const number = Number.parseInt(match[1], 10);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

export function parseReviewArgs(argv = process.argv.slice(2)) {
  let mode = 'quick';
  let modeWasExplicit = false;
  let target = null;
  const positionals = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--json') continue;
    if (argument === '--mode') {
      mode = argv[++index];
      modeWasExplicit = true;
      if (!mode) throw new ScopeFailure('invalid-arguments', '--mode requires quick or full.');
    } else if (argument.startsWith('--mode=')) {
      mode = argument.slice('--mode='.length);
      modeWasExplicit = true;
    } else if (argument === '--target') {
      target = argv[++index];
      if (!target) throw new ScopeFailure('invalid-arguments', '--target requires a review target.');
    } else if (argument.startsWith('--target=')) {
      target = argument.slice('--target='.length);
    } else if (argument.startsWith('--')) {
      throw new ScopeFailure('invalid-arguments', `Unknown option: ${argument}`);
    } else {
      positionals.push(argument);
    }
  }
  if (!modeWasExplicit && ['quick', 'full'].includes(String(positionals[0] || '').toLowerCase())) {
    mode = positionals.shift().toLowerCase();
  }
  if (target && positionals.length > 0) throw new ScopeFailure('invalid-arguments', 'Use either --target or a positional target, not both.');
  if (!target && positionals.length > 0) target = positionals.join(' ');
  mode = String(mode || '').trim().toLowerCase();
  if (!['quick', 'full'].includes(mode)) throw new ScopeFailure('invalid-mode', `Unsupported review mode: ${mode || '(empty)'}.`);
  target = target ? String(target).trim() : null;
  return { mode, target: target || null };
}

export function resolveReviewScope(options = {}) {
  const mode = String(options.mode || 'quick').trim().toLowerCase();
  const requestedTarget = options.target ? String(options.target).trim() : null;
  const result = baseResult(mode, requestedTarget);
  const cwd = resolve(options.cwd || process.cwd());
  const runner = options.runner || ((request) => executableResult(request.command, request.args, request.cwd));
  let projectRoot = cwd;

  function run(command, args, operation = {}) {
    const response = runner({ command, args, cwd: projectRoot });
    const status = Number.isInteger(response?.status) ? response.status : 127;
    result.operations.push({
      command,
      args: [...args],
      purpose: operation.purpose || null,
      writesGit: operation.writesGit === true,
      exitCode: status,
    });
    return { status, stdout: response?.stdout || '', stderr: response?.stderr || '' };
  }

  function git(args, operation = {}) {
    return run('git', args, operation);
  }

  function requiredGit(args, code, message, operation = {}) {
    const response = git(args, operation);
    if (response.status !== 0) throw new ScopeFailure(code, `${message}${response.stderr.trim() ? ` ${response.stderr.trim()}` : ''}`);
    return response.stdout;
  }

  function resolveCommit(ref, allowRemoteFetch = false) {
    let response = git(['rev-parse', '--verify', `${ref}^{commit}`], { purpose: `Resolve ${ref}.` });
    if (response.status === 0) return response.stdout.trim();
    const remoteMatch = allowRemoteFetch
      ? String(ref).match(/^(?:refs\/remotes\/)?origin\/(.+)$/)
      : null;
    if (remoteMatch) {
      git(
        ['fetch', 'origin', `refs/heads/${remoteMatch[1]}:refs/remotes/origin/${remoteMatch[1]}`, '--no-tags'],
        { purpose: `Fetch explicitly requested remote ref ${ref}.`, writesGit: true },
      );
      response = git(['rev-parse', '--verify', `${ref}^{commit}`], { purpose: `Resolve fetched ${ref}.` });
    }
    if (response.status !== 0) throw new ScopeFailure('unresolvable-ref', `Cannot resolve Git ref ${ref}.`);
    return response.stdout.trim();
  }

  function isShallow() {
    const response = git(['rev-parse', '--is-shallow-repository'], { purpose: 'Detect a shallow repository.' });
    return response.status === 0 && response.stdout.trim() === 'true';
  }

  function mergeBase(left, right, allowDeepen) {
    let response = git(['merge-base', left, right], { purpose: `Resolve the merge base of ${left} and ${right}.` });
    if (response.status === 0 && response.stdout.trim()) return response.stdout.trim();
    if (allowDeepen && isShallow()) {
      for (const depth of [50, 200]) {
        git(['fetch', `--deepen=${depth}`, 'origin', '--no-tags'], {
          purpose: `Deepen the explicitly requested shallow review by ${depth} commits.`,
          writesGit: true,
        });
        response = git(['merge-base', left, right], { purpose: `Retry the merge base after deepening by ${depth}.` });
        if (response.status === 0 && response.stdout.trim()) return response.stdout.trim();
      }
    }
    throw new ScopeFailure('unresolvable-base', `Cannot resolve a merge base between ${left} and ${right}.`);
  }

  function defaultBaseRef() {
    const remoteHead = git(['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], { purpose: 'Resolve the configured default remote branch.' });
    if (remoteHead.status === 0 && remoteHead.stdout.trim()) return remoteHead.stdout.trim();
    for (const ref of ['origin/main', 'origin/master']) {
      if (git(['show-ref', '--verify', '--quiet', `refs/remotes/${ref}`], { purpose: `Check ${ref}.` }).status === 0) return ref;
    }
    const configured = git(['config', '--get', 'init.defaultBranch'], { purpose: 'Read the configured default branch.' });
    const candidates = [configured.stdout.trim(), 'main', 'master'].filter(Boolean);
    for (const ref of [...new Set(candidates)]) {
      if (git(['show-ref', '--verify', '--quiet', `refs/heads/${ref}`], { purpose: `Check local ${ref}.` }).status === 0) return ref;
    }
    throw new ScopeFailure('missing-default-branch', 'Cannot identify a default branch from local Git metadata.');
  }

  function detectInProgressState() {
    for (const marker of ['rebase-merge', 'rebase-apply', 'MERGE_HEAD', 'CHERRY_PICK_HEAD']) {
      const response = git(['rev-parse', '--git-path', marker], { purpose: `Check Git operation marker ${marker}.` });
      if (response.status !== 0) continue;
      const markerPath = response.stdout.trim();
      const absoluteMarker = isAbsolute(markerPath) ? markerPath : resolve(projectRoot, markerPath);
      if (existsSync(absoluteMarker)) throw new ScopeFailure('git-operation-in-progress', `Review is blocked while ${marker} is in progress.`);
    }
  }

  function diffEntries(args, source, purpose) {
    const output = requiredGit(
      ['diff', '--find-renames=40%', '--name-status', '-z', ...args],
      'diff-failed',
      `Cannot resolve ${source} files.`,
      { purpose },
    );
    return parseNameStatus(output, source);
  }

  function untrackedEntries() {
    const output = requiredGit(
      ['ls-files', '--others', '--exclude-standard', '-z'],
      'untracked-failed',
      'Cannot resolve untracked files.',
      { purpose: 'List untracked files for the requested worktree scope.' },
    );
    return parseUntracked(output);
  }

  function revCount(expression) {
    const output = requiredGit(
      ['rev-list', '--count', expression],
      'commit-count-failed',
      `Cannot count commits in ${expression}.`,
      { purpose: `Count commits in ${expression}.` },
    );
    return Number.parseInt(output.trim(), 10) || 0;
  }

  function addPatchCommand(args, purpose) {
    result.patchCommands.push({ command: 'git', args, purpose });
  }

  function workingScope() {
    const working = diffEntries(['HEAD'], 'working', 'Resolve tracked working-tree changes against HEAD.');
    const untracked = untrackedEntries();
    addPatchCommand(['diff', '--find-renames=40%', 'HEAD', '--'], 'Read tracked working-tree patch content.');
    result.counts.uncommittedFiles = mergeEntries([working, untracked]).length;
    result.target.kind = 'working';
    result.target.resolved = 'working';
    result.base = { ref: 'HEAD', sha: headSha, comparisonSha: headSha };
    result.head = { ref: 'WORKTREE', sha: headSha };
    return [working, untracked];
  }

  function stagedScope() {
    const staged = diffEntries(['--cached'], 'staged', 'Resolve staged changes against HEAD.');
    addPatchCommand(['diff', '--find-renames=40%', '--cached', '--'], 'Read staged patch content.');
    result.counts.uncommittedFiles = staged.length;
    result.target.kind = 'staged';
    result.target.resolved = 'staged';
    result.base = { ref: 'HEAD', sha: headSha, comparisonSha: headSha };
    result.head = { ref: 'INDEX', sha: headSha };
    return [staged];
  }

  function branchScope(explicit) {
    const baseRef = defaultBaseRef();
    const baseSha = resolveCommit(baseRef);
    const comparisonSha = mergeBase(baseRef, 'HEAD', explicit);
    const commits = revCount(`${comparisonSha}..HEAD`);
    const committed = commits > 0
      ? diffEntries([`${comparisonSha}...HEAD`], 'committed', `Resolve branch changes from ${comparisonSha} to HEAD.`)
      : [];
    const working = diffEntries(['HEAD'], 'working', 'Resolve tracked working-tree changes against HEAD.');
    const untracked = untrackedEntries();
    if (commits > 0) addPatchCommand(['diff', '--find-renames=40%', `${comparisonSha}...HEAD`, '--'], 'Read committed branch patch content.');
    addPatchCommand(['diff', '--find-renames=40%', 'HEAD', '--'], 'Read tracked working-tree patch content.');
    result.counts.commits = commits;
    result.counts.uncommittedFiles = mergeEntries([working, untracked]).length;
    result.target.kind = commits > 0 || explicit ? 'branch' : 'working';
    result.target.resolved = commits > 0 || explicit ? 'branch' : 'working';
    result.base = commits > 0 || explicit
      ? { ref: baseRef, sha: baseSha, comparisonSha }
      : { ref: 'HEAD', sha: headSha, comparisonSha: headSha };
    result.head = { ref: commits > 0 || explicit ? 'HEAD' : 'WORKTREE', sha: headSha };
    if (commits > 0 || explicit) {
      result.warnings.push(`Base ref ${baseRef} was resolved from local metadata; freshness was not network-verified.`);
    }
    return commits > 0 || explicit ? [committed, working, untracked] : [working, untracked];
  }

  let headSha = null;
  try {
    if (!['quick', 'full'].includes(mode)) throw new ScopeFailure('invalid-mode', `Unsupported review mode: ${mode}.`);
    const rootResponse = run('git', ['rev-parse', '--show-toplevel'], { purpose: 'Resolve the repository root.' });
    if (rootResponse.status !== 0 || !rootResponse.stdout.trim()) throw new ScopeFailure('not-a-git-repository', 'The current directory is not inside a Git repository.');
    projectRoot = resolve(rootResponse.stdout.trim());
    result.projectRoot = projectRoot;
    headSha = resolveCommit('HEAD');
    detectInProgressState();

    const target = requestedTarget?.toLowerCase() || null;
    let entryGroups;

    if (!target) {
      entryGroups = branchScope(false);
    } else if (target === 'working') {
      entryGroups = workingScope();
    } else if (target === 'staged') {
      entryGroups = stagedScope();
    } else if (target === 'branch') {
      entryGroups = branchScope(true);
    } else {
      const prNumber = parsePrTarget(requestedTarget);
      const range = parseRange(requestedTarget);
      if (prNumber) {
        const metadataResponse = run('gh', ['pr', 'view', String(prNumber), '--json', 'title,body,headRefName,headRefOid,baseRefName'], {
          purpose: `Read pull request ${prNumber} metadata.`,
        });
        if (metadataResponse.status !== 0) throw new ScopeFailure('pr-metadata-unavailable', `Cannot read pull request ${prNumber} metadata. ${metadataResponse.stderr.trim()}`.trim());
        let metadata;
        try {
          metadata = JSON.parse(metadataResponse.stdout);
        } catch {
          throw new ScopeFailure('pr-metadata-invalid', `Pull request ${prNumber} returned invalid metadata.`);
        }
        if (!metadata?.baseRefName) throw new ScopeFailure('pr-metadata-invalid', `Pull request ${prNumber} has no base branch metadata.`);
        const baseRef = `origin/${metadata.baseRefName}`;
        const headRef = `refs/remotes/pr/${prNumber}`;
        const baseFetch = git(
          ['fetch', 'origin', `refs/heads/${metadata.baseRefName}:refs/remotes/origin/${metadata.baseRefName}`, '--no-tags'],
          { purpose: `Fetch pull request ${prNumber} base branch.`, writesGit: true },
        );
        if (baseFetch.status !== 0) throw new ScopeFailure('pr-fetch-failed', `Cannot fetch pull request ${prNumber} base branch.`);
        const headFetch = git(
          ['fetch', 'origin', `pull/${prNumber}/head:${headRef}`, '--no-tags'],
          { purpose: `Fetch pull request ${prNumber} head without checkout.`, writesGit: true },
        );
        if (headFetch.status !== 0) throw new ScopeFailure('pr-fetch-failed', `Cannot fetch pull request ${prNumber} head.`);
        const baseSha = resolveCommit(baseRef);
        const resolvedHeadSha = resolveCommit(headRef);
        const comparisonSha = mergeBase(baseRef, headRef, true);
        const expression = `${comparisonSha}...${headRef}`;
        const committed = diffEntries([expression], 'committed', `Resolve pull request ${prNumber} files.`);
        addPatchCommand(['diff', '--find-renames=40%', expression, '--'], `Read pull request ${prNumber} patch content.`);
        result.target = { requested: requestedTarget, resolved: `pr ${prNumber}`, kind: 'pr' };
        result.base = { ref: baseRef, sha: baseSha, comparisonSha };
        result.head = { ref: headRef, sha: resolvedHeadSha };
        result.intent = {
          title: metadata.title || null,
          body: metadata.body || null,
          headRefName: metadata.headRefName || null,
          headRefOid: metadata.headRefOid || resolvedHeadSha,
        };
        result.counts.commits = revCount(`${comparisonSha}..${headRef}`);
        entryGroups = [committed];
      } else if (range) {
        const leftSha = resolveCommit(range.left, true);
        const rightSha = resolveCommit(range.right, true);
        const comparisonSha = range.dots === '...' ? mergeBase(range.left, range.right, true) : leftSha;
        const expression = `${range.left}${range.dots}${range.right}`;
        const committed = diffEntries([expression], 'committed', `Resolve explicit range ${expression}.`);
        addPatchCommand(['diff', '--find-renames=40%', expression, '--'], `Read explicit range ${expression}.`);
        result.target = { requested: requestedTarget, resolved: expression, kind: 'range' };
        result.base = { ref: range.left, sha: leftSha, comparisonSha };
        result.head = { ref: range.right, sha: rightSha };
        result.counts.commits = revCount(`${comparisonSha}..${range.right}`);
        entryGroups = [committed];
      } else {
        const refSha = resolveCommit(requestedTarget, true);
        const comparisonSha = mergeBase(requestedTarget, 'HEAD', true);
        const expression = `${comparisonSha}...HEAD`;
        const committed = diffEntries([expression], 'committed', `Resolve changes from ${requestedTarget} to HEAD.`);
        addPatchCommand(['diff', '--find-renames=40%', expression, '--'], `Read changes from ${requestedTarget} to HEAD.`);
        result.target = { requested: requestedTarget, resolved: requestedTarget, kind: 'ref' };
        result.base = { ref: requestedTarget, sha: refSha, comparisonSha };
        result.head = { ref: 'HEAD', sha: headSha };
        result.counts.commits = revCount(`${comparisonSha}..HEAD`);
        entryGroups = [committed];
      }
    }

    const allFiles = mergeEntries(entryGroups);
    const included = [];
    const excluded = [];
    for (const file of allFiles) {
      const exclusion = exclusionFor(file.path);
      if (exclusion) excluded.push({ ...file, ...exclusion });
      else included.push(file);
    }
    result.files = included;
    result.excluded = excluded;
    result.counts.filesInScope = included.length;
    result.counts.excludedFiles = excluded.length;
    result.status = included.length > 0 ? 'ready' : 'empty';

    if (result.status === 'empty') {
      const branch = git(['symbolic-ref', '--quiet', '--short', 'HEAD'], { purpose: 'Name the current branch for an empty review scope.' });
      const last = git(['log', '-1', '--format=%h%x09%s'], { purpose: 'Name the last commit for an empty review scope.' });
      const [lastSha, ...subjectParts] = last.stdout.trim().split('\t');
      result.noChange = {
        branch: branch.status === 0 ? branch.stdout.trim() : 'HEAD',
        clean: allFiles.length === 0,
        allFilesExcluded: allFiles.length > 0 && included.length === 0,
        lastCommit: last.status === 0 ? { sha: lastSha || null, subject: subjectParts.join('\t') || null } : null,
      };
    }
    return result;
  } catch (error) {
    result.status = 'blocked';
    result.blocked = {
      code: error instanceof ScopeFailure ? error.code : 'unexpected-error',
      message: error.message,
    };
    return result;
  }
}

export function runReviewScopeCli(argv = process.argv.slice(2), options = {}) {
  let parsed;
  try {
    parsed = parseReviewArgs(argv);
  } catch (error) {
    const result = baseResult('quick', null);
    result.blocked = {
      code: error instanceof ScopeFailure ? error.code : 'invalid-arguments',
      message: error.message,
    };
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 3;
  }
  const result = resolveReviewScope({ ...options, ...parsed });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result.status === 'ready' ? 0 : result.status === 'empty' ? 2 : 3;
}

const direct = process.argv[1]
  && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
if (direct) process.exitCode = runReviewScopeCli();
