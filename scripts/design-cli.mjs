#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveHost } from '../src/host.mjs';
import { diagnoseProject, inspectProject, setProjectHook, setupProject } from '../src/project-state.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const flags = new Set();
  const positionals = [];
  let host = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--host') {
      host = argv[++index];
      if (!host) throw new Error('--host requires cursor or codex.');
    } else if (arg.startsWith('--host=')) {
      host = arg.slice('--host='.length);
    } else if (arg.startsWith('--')) {
      flags.add(arg);
    } else {
      positionals.push(arg);
    }
  }
  return { command: positionals[0] || 'status', action: positionals[1], flags, host: resolveHost(host) };
}

function print(value, json) {
  if (json) process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  else process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function main() {
  const { command, action, flags, host } = parseArgs(process.argv.slice(2));
  const projectRoot = process.cwd();
  const json = flags.has('--json');
  const options = { pluginRoot, host };
  if (command === 'status') return print(inspectProject(projectRoot, options), json);
  if (command === 'doctor') {
    const report = diagnoseProject(projectRoot, options);
    if (flags.has('--apply')) report.apply = { applied: false, message: 'No safe automatic repairs are registered in 0.2.0.' };
    return print(report, json);
  }
  if (command === 'setup') {
    return print(setupProject(projectRoot, { ...options, apply: flags.has('--apply'), enableHook: !flags.has('--without-hook') }), json);
  }
  if (command === 'hook' && ['on', 'off'].includes(action)) {
    return print({ written: setProjectHook(projectRoot, action === 'on', options), enabled: action === 'on', host }, json);
  }
  throw new Error(`Unknown command: ${command}${action ? ` ${action}` : ''}`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`Design CLI error: ${error.message}\n`);
  process.exitCode = 1;
}
