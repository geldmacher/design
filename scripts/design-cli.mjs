#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { diagnoseProject, inspectProject, setProjectHook, setupProject } from '../src/project-state.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const flags = new Set(argv.filter((arg) => arg.startsWith('--')));
  const positionals = argv.filter((arg) => !arg.startsWith('--'));
  return { command: positionals[0] || 'status', action: positionals[1], flags };
}

function print(value, json) {
  if (json) process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  else process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function main() {
  const { command, action, flags } = parseArgs(process.argv.slice(2));
  const projectRoot = process.cwd();
  const json = flags.has('--json');
  if (command === 'status') return print(inspectProject(projectRoot, { pluginRoot }), json);
  if (command === 'doctor') {
    const report = diagnoseProject(projectRoot, { pluginRoot });
    if (flags.has('--apply')) report.apply = { applied: false, message: 'No safe automatic repairs are registered in 0.1.0.' };
    return print(report, json);
  }
  if (command === 'setup') {
    return print(setupProject(projectRoot, { pluginRoot, apply: flags.has('--apply'), enableHook: !flags.has('--without-hook') }), json);
  }
  if (command === 'hook' && ['on', 'off'].includes(action)) {
    return print({ written: setProjectHook(projectRoot, action === 'on', { pluginRoot }), enabled: action === 'on' }, json);
  }
  throw new Error(`Unknown command: ${command}${action ? ` ${action}` : ''}`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`Design CLI error: ${error.message}\n`);
  process.exitCode = 1;
}
