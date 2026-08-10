#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { detectProjectConflicts, projectRootFromEvent, readHookActivation } from '../src/project-state.mjs';

function allow(message = null) {
  return message ? { permission: 'allow', agent_message: message } : { permission: 'allow' };
}

function diagnostic(message) {
  return `[geldmacher-design] ${message}`;
}

export function evaluatePluginHook({ event = {}, projectRoot, pluginRoot, nodePath = process.execPath, detectorPath } = {}) {
  const root = path.resolve(projectRoot || projectRootFromEvent(event));
  const activation = readHookActivation(root);
  if (activation.state === 'malformed') {
    return { payload: allow(diagnostic(`Malformed .impeccable/config.json; hook skipped: ${activation.error}`)), diagnostic: true };
  }
  if (!activation.enabled) return { payload: allow(), diagnostic: false };

  const conflicts = detectProjectConflicts(root, { host: 'cursor' }).filter((finding) => finding.id === 'direct-impeccable-installation' || finding.id === 'duplicate-impeccable-hook');
  if (conflicts.length > 0) {
    return {
      payload: allow(diagnostic(`Hook skipped to avoid double execution: ${conflicts.map((finding) => finding.id).join(', ')}`)),
      diagnostic: true,
    };
  }

  const resolvedPluginRoot = path.resolve(pluginRoot || process.env.CURSOR_PLUGIN_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
  const resolvedDetector = detectorPath || path.join(resolvedPluginRoot, 'skills', 'impeccable', 'scripts', 'hook-before-edit.mjs');
  if (!nodePath || !fs.existsSync(resolvedDetector)) {
    return { payload: allow(diagnostic('Detector runtime is unavailable; edit allowed. Run /design doctor.')), diagnostic: true };
  }

  const child = spawnSync(nodePath, [resolvedDetector], {
    cwd: root,
    input: JSON.stringify(event),
    encoding: 'utf8',
    timeout: 7000,
    env: {
      ...process.env,
      CURSOR_PLUGIN_ROOT: resolvedPluginRoot,
      GELDMACHER_DESIGN_PLUGIN_ROOT: resolvedPluginRoot,
      IMPECCABLE_NO_UPDATE_CHECK: '1',
    },
  });

  if (child.error || child.status !== 0) {
    const reason = child.error?.message || child.stderr?.trim() || `exit ${child.status}`;
    return { payload: allow(diagnostic(`Detector failed non-blocking: ${reason}`)), diagnostic: true };
  }
  try {
    const payload = JSON.parse(child.stdout || '{}');
    if (payload.permission === 'allow' || payload.permission === 'deny') return { payload, diagnostic: false };
  } catch {
    // Handled by the non-blocking diagnostic below.
  }
  return { payload: allow(diagnostic('Detector returned an invalid response; edit allowed. Run /design doctor.')), diagnostic: true };
}

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  let event = {};
  try {
    event = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    process.stdout.write(JSON.stringify(allow(diagnostic('Malformed Cursor hook input; edit allowed.'))));
    return;
  }
  const result = evaluatePluginHook({ event });
  if (result.diagnostic && result.payload.agent_message) process.stderr.write(`${result.payload.agent_message}\n`);
  process.stdout.write(JSON.stringify(result.payload));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${diagnostic(`Unexpected hook failure: ${error.message}`)}\n`);
    process.stdout.write(JSON.stringify(allow(diagnostic('Unexpected hook failure; edit allowed. Run /design doctor.'))));
  });
}
