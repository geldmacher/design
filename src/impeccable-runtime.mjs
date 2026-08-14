import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveHost } from './host.mjs';

const SCRIPT_PATHS = Object.freeze({
  detect: 'skills/impeccable/scripts/detect.mjs',
  'cursor-hook': 'skills/impeccable/scripts/hook-before-edit.mjs',
  'codex-hook': 'skills/impeccable/scripts/hook.mjs',
});

function inside(base, candidate) {
  const item = path.relative(path.resolve(base), path.resolve(candidate));
  return item === '' || (item !== '..' && !item.startsWith(`..${path.sep}`) && !path.isAbsolute(item));
}

function rejectSymlinkSegments(root, candidate) {
  let current = root;
  for (const segment of path.relative(root, candidate).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error(`Bundled runtime path crosses a symlink: ${current}`);
  }
}

export function resolveBundledImpeccableScript(pluginRoot, scriptId) {
  const relativeScript = SCRIPT_PATHS[scriptId];
  if (!relativeScript) throw new Error(`Unknown bundled Impeccable script: ${scriptId}`);
  if (typeof pluginRoot !== 'string' || !pluginRoot.trim()) throw new Error('Plugin root is required.');

  const requestedRoot = path.resolve(pluginRoot);
  const rootStat = fs.lstatSync(requestedRoot);
  if (!rootStat.isDirectory()) throw new Error(`Plugin root is not a directory: ${requestedRoot}`);
  const physicalRoot = fs.realpathSync(requestedRoot);
  const candidate = path.resolve(physicalRoot, relativeScript);
  if (!inside(physicalRoot, candidate)) throw new Error(`Bundled runtime path escapes the plugin root: ${relativeScript}`);
  rejectSymlinkSegments(physicalRoot, candidate);
  const candidateStat = fs.lstatSync(candidate);
  if (!candidateStat.isFile()) throw new Error(`Bundled runtime is not a regular file: ${relativeScript}`);
  const physicalCandidate = fs.realpathSync(candidate);
  if (!inside(physicalRoot, physicalCandidate)) throw new Error(`Bundled runtime resolves outside the plugin root: ${relativeScript}`);
  return { pluginRoot: physicalRoot, scriptPath: physicalCandidate, relativeScript };
}

export function impeccableRuntimeEnvironment(host, pluginRoot, env = process.env, extraEnv = {}) {
  const resolvedHost = resolveHost(host, env);
  const next = {
    ...env,
    ...extraEnv,
    IMPECCABLE_HOST: resolvedHost,
    GELDMACHER_DESIGN_PLUGIN_ROOT: pluginRoot,
    IMPECCABLE_NO_UPDATE_CHECK: '1',
  };
  if (resolvedHost === 'cursor') {
    next.CURSOR_PLUGIN_ROOT = pluginRoot;
    delete next.PLUGIN_ROOT;
  } else if (resolvedHost === 'codex') {
    next.PLUGIN_ROOT = pluginRoot;
    delete next.CURSOR_PLUGIN_ROOT;
  } else {
    delete next.CURSOR_PLUGIN_ROOT;
    delete next.PLUGIN_ROOT;
  }
  return next;
}

export function runBundledImpeccable({
  scriptId,
  host,
  pluginRoot,
  cwd,
  args = [],
  input,
  timeout,
  nodePath = process.execPath,
  env = process.env,
  extraEnv = {},
  spawn = spawnSync,
} = {}) {
  try {
    if (!nodePath) throw new Error('Node runtime is unavailable.');
    const runtime = resolveBundledImpeccableScript(pluginRoot, scriptId);
    const resolvedHost = resolveHost(host, env);
    const child = spawn(nodePath, [runtime.scriptPath, ...args], {
      cwd: path.resolve(cwd || process.cwd()),
      input,
      encoding: 'utf8',
      timeout,
      maxBuffer: 8 * 1024 * 1024,
      shell: false,
      env: impeccableRuntimeEnvironment(resolvedHost, runtime.pluginRoot, env, extraEnv),
    });
    return {
      started: !child.error && Number.isInteger(child.status),
      status: Number.isInteger(child.status) ? child.status : null,
      signal: child.signal || null,
      stdout: child.stdout || '',
      stderr: child.stderr || '',
      error: child.error?.message || null,
      timedOut: child.error?.code === 'ETIMEDOUT',
      runtime: {
        scriptId,
        relativeScript: runtime.relativeScript,
        pluginRoot: runtime.pluginRoot,
      },
    };
  } catch (error) {
    return {
      started: false,
      status: null,
      signal: null,
      stdout: '',
      stderr: '',
      error: error.message,
      timedOut: false,
      runtime: null,
    };
  }
}
