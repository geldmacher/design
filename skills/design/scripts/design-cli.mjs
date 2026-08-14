#!/usr/bin/env node
import path from 'node:path';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolveHost } from '../../../src/host.mjs';
import { blockedDetectionResult, runDetectorScan } from '../../../src/detector-scan.mjs';
import { diagnoseProject, inspectProject, setProjectHook, setupProject } from '../../../src/project-state.mjs';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function parseArgs(argv) {
  const flags = new Set();
  const positionals = [];
  const targets = [];
  let host = null;
  let afterSeparator = false;
  let parseError = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (afterSeparator) {
      targets.push(arg);
    } else if (arg === '--') {
      afterSeparator = true;
    } else if (arg === '--host') {
      host = argv[++index];
      if (!host) {
        parseError = '--host requires agent-plugin, cursor, or codex.';
        break;
      }
    } else if (arg.startsWith('--host=')) {
      host = arg.slice('--host='.length);
    } else if (arg.startsWith('--')) {
      flags.add(arg);
    } else {
      positionals.push(arg);
    }
  }
  return {
    command: positionals[0] || 'status',
    action: positionals[1],
    extraPositionals: positionals.slice(2),
    flags,
    host,
    targets,
    hasSeparator: afterSeparator,
    parseError,
  };
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function output(value, exitCode = 0) {
  print(value);
  return exitCode;
}

export function runDesignCli(argv = process.argv.slice(2), options = {}) {
  const { command, action, extraPositionals, flags, host: explicitHost, targets, hasSeparator, parseError } = parseArgs(argv);
  const projectRoot = process.cwd();
  if (command === 'detect') {
    const unsupportedFlags = [...flags].filter((flag) => flag !== '--json');
    if (parseError || !hasSeparator || action || extraPositionals.length > 0 || unsupportedFlags.length > 0) {
      const result = blockedDetectionResult({
        host: explicitHost,
        projectRoot,
        targets: [],
        pluginRoot,
        code: parseError ? 'invalid-option' : unsupportedFlags.length > 0 ? 'unsupported-option' : 'target-separator-required',
        message: parseError || (unsupportedFlags.length > 0
          ? `detect does not support option ${unsupportedFlags[0]}.`
          : 'Use detect -- <target> [target…]; targets must follow the explicit -- separator.'),
      });
      return output(result.envelope, result.exitCode);
    }
    const detectorRunner = options.detectorRunner || runDetectorScan;
    const result = detectorRunner({
      projectRoot,
      targets,
      pluginRoot,
      host: explicitHost,
      nodePath: options.nodePath,
      runtime: options.runtime,
    });
    return output(result.envelope, result.exitCode);
  }

  if (parseError) throw new Error(parseError);
  const host = resolveHost(explicitHost);
  const lifecycleOptions = { pluginRoot, host };
  if (command === 'status') return output(inspectProject(projectRoot, lifecycleOptions));
  if (command === 'doctor') {
    const report = diagnoseProject(projectRoot, lifecycleOptions);
    if (flags.has('--apply')) report.apply = { applied: false, message: 'No safe automatic repairs are registered in 0.6.0.' };
    return output(report);
  }
  if (command === 'setup') {
    return output(setupProject(projectRoot, { ...lifecycleOptions, apply: flags.has('--apply'), enableHook: !flags.has('--without-hook') }));
  }
  if (command === 'hook' && ['on', 'off'].includes(action)) {
    return output({ written: setProjectHook(projectRoot, action === 'on', lifecycleOptions), enabled: action === 'on', host });
  }
  throw new Error(`Unknown command: ${command}${action ? ` ${action}` : ''}`);
}

const direct = process.argv[1]
  && realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
if (direct) {
  try {
    process.exitCode = runDesignCli();
  } catch (error) {
    process.stderr.write(`Design CLI error: ${error.message}\n`);
    process.exitCode = 1;
  }
}
