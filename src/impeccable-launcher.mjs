import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBundledImpeccable } from './impeccable-runtime.mjs';
import { impeccableRuntimeEnvironment } from './impeccable-runtime.mjs';
import { resolveEngine } from './impeccable-engine.mjs';
import { projectEngineOutput } from './impeccable-plugin-commands.mjs';
import { resolvePluginHost } from './host.mjs';
import { spawn } from 'node:child_process';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [command = '--help', ...args] = process.argv.slice(2);
const managed = ['context', 'doctor', 'ignore', 'ignores', 'hooks', 'hook-admin', 'skills', 'help', 'install', 'link', 'update', 'check', 'pin', 'unpin', 'hook', 'hook-before-edit'];
if (!managed.includes(command)) {
  // Long-running live and image commands must expose readiness/progress while
  // running. Keep the bounded synchronous facade for detector and hook callers.
  try {
    const runtime = resolveEngine(pluginRoot);
    const host = resolvePluginHost(undefined, pluginRoot);
    const child = spawn(runtime.file, [command, ...args], { cwd: process.cwd(), shell: false, env: impeccableRuntimeEnvironment(host, pluginRoot), stdio: ['inherit', 'pipe', 'inherit'] });
    let pending = '';
    let failed = false;
    const emit = (line) => {
      try { process.stdout.write(projectEngineOutput({ command, stdout: line, host, cwd: process.cwd() })); }
      catch (error) { failed = true; process.stderr.write(`[geldmacher-design] ${error.message}\n`); child.kill(); }
    };
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      pending += chunk;
      let end;
      while ((end = pending.indexOf('\n')) >= 0) { emit(pending.slice(0, end + 1)); pending = pending.slice(end + 1); }
    });
    const forward = (signal) => child.kill(signal);
    const handlers = Object.fromEntries(['SIGINT', 'SIGTERM'].map((signal) => [signal, () => forward(signal)]));
    for (const [signal, handler] of Object.entries(handlers)) process.on(signal, handler);
    child.on('error', (error) => { failed = true; process.stderr.write(`${error.message}\n`); });
    child.on('close', (code, signal) => {
      if (pending) emit(pending);
      for (const [name, handler] of Object.entries(handlers)) process.removeListener(name, handler);
      if (signal && !failed) process.kill(process.pid, signal);
      else process.exitCode = failed ? 1 : code ?? 1;
    });
  } catch (error) { process.stderr.write(`[geldmacher-design] ${error.message}\n`); process.exitCode = 1; }
} else {
const chunks = [];
if (['hook', 'hook-before-edit'].includes(command)) for await (const chunk of process.stdin) chunks.push(chunk);
const result = runBundledImpeccable({ pluginRoot, command, args, input: chunks.length ? Buffer.concat(chunks) : undefined });
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
if (result.error) process.stderr.write(`[geldmacher-design] ${result.error}\n`);
if (result.signal) process.kill(process.pid, result.signal);
else process.exitCode = result.status ?? 1;
}
