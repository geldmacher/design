import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { resolvePluginHost } from './host.mjs';
import { interceptPluginCommand, projectEngineOutput } from './impeccable-plugin-commands.mjs';
import { resolveEngine } from './impeccable-engine.mjs';

const ENGINE_COMMANDS = Object.freeze({ detect: 'detect', 'cursor-hook': 'hook-before-edit', 'codex-hook': 'hook' });

export function impeccableRuntimeEnvironment(host, pluginRoot, env = process.env, extraEnv = {}) {
  const resolvedHost = resolvePluginHost(host, pluginRoot, env);
  const launcher = path.join(pluginRoot, 'skills/impeccable/scripts', process.platform === 'win32' ? 'impeccable.cmd' : 'impeccable');
  const selfCommand = process.platform === 'win32' ? `"${launcher}"` : `'${launcher.replaceAll("'", "'\\''")}'`;
  const next = {
    ...env,
    ...extraEnv,
    IMPECCABLE_HOST: resolvedHost,
    GELDMACHER_DESIGN_PLUGIN_ROOT: pluginRoot,
    IMPECCABLE_NO_UPDATE_CHECK: '1',
    IMPECCABLE_PROVIDER_ID: resolvedHost,
    IMPECCABLE_SKILL_DIR: path.join(pluginRoot, 'skills/impeccable'),
    IMPECCABLE_SELF: selfCommand,
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
  delete next.IMPECCABLE_CACHE_ROOT;
  delete next.IMPECCABLE_HOOK_DISABLED;
  delete next.IMPECCABLE_BIN;
  delete next.IMPECCABLE_LAUNCHER_PROBE;
  return next;
}

export function runBundledImpeccable({
  scriptId,
  command,
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
  let noticeCache;
  try {
    if (!nodePath) throw new Error('Node runtime is unavailable.');
    const runtime = resolveEngine(pluginRoot);
    const verb = command || ENGINE_COMMANDS[scriptId];
    if (!verb) throw new Error(`Unknown engine command: ${scriptId}`);
    const resolvedHost = resolvePluginHost(host, pluginRoot, env);
    if (verb === 'context') noticeCache = fs.mkdtempSync(path.join(os.tmpdir(), 'design-context-'));
    const engineArgs = verb === 'doctor' && !args.includes('--json') ? [...args, '--json'] : args;
    const execute = (runCwd) => spawn(runtime.file, [verb, ...engineArgs], {
      cwd: runCwd,
      input,
      encoding: 'utf8',
      timeout,
      maxBuffer: 8 * 1024 * 1024,
      shell: false,
      env: { ...impeccableRuntimeEnvironment(resolvedHost, runtime.pluginRoot, env, extraEnv), ...(noticeCache ? { IMPECCABLE_STALENESS_CACHE: path.join(noticeCache, 'staleness.json') } : {}) },
    });
    const projectCwd = path.resolve(cwd || process.cwd());
    const child = interceptPluginCommand({ command: verb, args, host: resolvedHost, cwd: projectCwd, run: execute }) || execute(projectCwd);
    if (!child.error && child.status === 0 && !args.includes('--help') && !args.includes('-h')) child.stdout = projectEngineOutput({ command: verb, stdout: child.stdout || '', host: resolvedHost, cwd: projectCwd });
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
        engineVersion: runtime.engineVersion,
        platform: runtime.platform,
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
  } finally {
    if (noticeCache) fs.rmSync(noticeCache, { recursive: true, force: true });
  }
}
