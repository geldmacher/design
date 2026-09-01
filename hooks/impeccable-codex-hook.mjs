#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBundledImpeccable } from '../src/impeccable-runtime.mjs';
import { detectProjectConflicts, projectRootFromEvent, readHookActivation } from '../src/project-state.mjs';

function diagnostic(message) {
  return `[geldmacher-design] ${message}`;
}

function eventName(event) {
  return event?.hook_event_name === 'Stop' ? 'Stop' : 'PostToolUse';
}

function contextPayload(event, message) {
  return {
    hookSpecificOutput: {
      hookEventName: eventName(event),
      additionalContext: diagnostic(message),
    },
  };
}

function result(payload = null, diagnosticResult = false) {
  return {
    payload,
    stdout: payload ? JSON.stringify(payload) : '',
    diagnostic: diagnosticResult,
  };
}

export function evaluateCodexPluginHook({
  event = {},
  projectRoot,
  pluginRoot,
  nodePath = process.execPath,
  runtime = runBundledImpeccable,
} = {}) {
  const root = path.resolve(projectRoot || projectRootFromEvent(event));
  const activation = readHookActivation(root);
  if (activation.state === 'malformed') {
    return result(contextPayload(event, `Malformed .impeccable config; hook skipped: ${activation.error}`), true);
  }
  if (!activation.enabled) return result();

  const conflicts = detectProjectConflicts(root, { host: 'codex' })
    .filter((finding) => finding.id === 'direct-impeccable-installation' || finding.id === 'duplicate-impeccable-hook');
  if (conflicts.length > 0) {
    return result(contextPayload(event, `Hook skipped to avoid double execution: ${conflicts.map((finding) => finding.id).join(', ')}`), true);
  }

  const resolvedPluginRoot = path.resolve(
    pluginRoot
      || process.env.PLUGIN_ROOT
      || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'),
  );
  const child = runtime({
    scriptId: 'codex-hook',
    host: 'codex',
    pluginRoot: resolvedPluginRoot,
    cwd: root,
    input: JSON.stringify(event),
    timeout: eventName(event) === 'Stop' ? 28000 : 4500,
    nodePath,
    extraEnv: { IMPECCABLE_HOOK_HARNESS: 'codex' },
  });

  if (!child.started || child.status !== 0) {
    const reason = child.error || child.stderr?.trim() || `exit ${child.status}`;
    return result(contextPayload(event, `Detector failed non-blocking; edit retained: ${reason}`), true);
  }

  const stdout = child.stdout?.trim() || '';
  if (!stdout) return result();
  try {
    const payload = JSON.parse(stdout);
    const name = eventName(event);
    const output = payload?.hookSpecificOutput;
    // PostToolUse (and legacy Stop) use Claude-style additionalContext.
    if (output?.hookEventName === name && typeof output.additionalContext === 'string') {
      return result(payload);
    }
    // skill-v4.1.2+: Codex Stop rejects unknown fields; findings continue the
    // turn via a top-level blocking decision (StopCommandOutputWire).
    if (
      name === 'Stop'
      && payload?.decision === 'block'
      && typeof payload.reason === 'string'
      && payload.reason.trim()
    ) {
      return result(payload);
    }
  } catch {
    // Converted into a visible, non-blocking diagnostic below.
  }
  return result(contextPayload(event, 'Detector returned an invalid response; edit retained. Run $design doctor.'), true);
}

async function readEvent() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

async function main() {
  try {
    const event = await readEvent();
    process.stdout.write(evaluateCodexPluginHook({ event }).stdout);
  } catch (error) {
    process.stdout.write(JSON.stringify(contextPayload({}, `Malformed Codex hook input; edit retained: ${error.message}`)));
  }
}

if (process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    process.stdout.write(JSON.stringify(contextPayload({}, `Unexpected hook failure; edit retained: ${error.message}`)));
  });
}
