import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadModules } from './registry.mjs';

const DEFAULT_PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMPECCABLE_MARKERS = [
  'skills/impeccable/scripts/hook-before-edit.mjs',
  'skills/impeccable/scripts/hook.mjs',
];

function safeJson(filePath) {
  if (!fs.existsSync(filePath)) return { exists: false, malformed: false, value: null };
  try {
    return { exists: true, malformed: false, value: JSON.parse(fs.readFileSync(filePath, 'utf8')) };
  } catch (error) {
    return { exists: true, malformed: true, value: null, error: error.message };
  }
}

function valueContainsMarker(value) {
  if (typeof value === 'string') return IMPECCABLE_MARKERS.some((marker) => value.includes(marker));
  if (Array.isArray(value)) return value.some(valueContainsMarker);
  if (value && typeof value === 'object') return Object.values(value).some(valueContainsMarker);
  return false;
}

export function readHookActivation(projectRoot) {
  const configPath = path.join(projectRoot, '.impeccable', 'config.json');
  const localPath = path.join(projectRoot, '.impeccable', 'config.local.json');
  const configs = [safeJson(configPath), safeJson(localPath)];
  let enabled = false;
  let explicit = false;
  for (const [index, info] of configs.entries()) {
    const currentPath = index === 0 ? configPath : localPath;
    if (info.malformed) return { state: 'malformed', enabled: false, explicit: false, path: currentPath, error: info.error };
    if (!info.exists) continue;
    const hook = info.value?.hook;
    if (hook !== undefined && (!hook || typeof hook !== 'object' || Array.isArray(hook))) {
      return { state: 'malformed', enabled: false, explicit: false, path: currentPath, error: 'hook must be an object' };
    }
    if (Object.hasOwn(hook || {}, 'enabled')) {
      if (typeof hook.enabled !== 'boolean') {
        return { state: 'malformed', enabled: false, explicit: false, path: currentPath, error: 'hook.enabled must be a boolean' };
      }
      explicit = true;
      enabled = hook.enabled;
    }
  }
  return { state: enabled ? 'enabled' : 'disabled', enabled, explicit, path: configPath };
}

export function detectProjectConflicts(projectRoot) {
  const conflicts = [];
  const directSkill = path.join(projectRoot, '.cursor', 'skills', 'impeccable');
  if (fs.existsSync(directSkill)) {
    conflicts.push({
      id: 'direct-impeccable-installation',
      severity: 'conflict',
      path: path.relative(projectRoot, directSkill),
      message: 'A project-local Impeccable skill can shadow the plugin copy.',
    });
  }

  const hooksPath = path.join(projectRoot, '.cursor', 'hooks.json');
  const hooks = safeJson(hooksPath);
  if (hooks.malformed) {
    conflicts.push({
      id: 'malformed-cursor-hooks',
      severity: 'diagnostic',
      path: path.relative(projectRoot, hooksPath),
      message: 'The project Cursor hook manifest is malformed; it was not changed.',
    });
  } else if (hooks.value?.hooks && valueContainsMarker(hooks.value.hooks)) {
    conflicts.push({
      id: 'duplicate-impeccable-hook',
      severity: 'conflict',
      path: path.relative(projectRoot, hooksPath),
      message: 'A project-local Impeccable hook would run beside the plugin hook.',
    });
  }
  return conflicts;
}

export function projectRootFromEvent(event, fallback = process.cwd()) {
  const candidates = [
    event?.workspace_root,
    event?.project_root,
    event?.cwd,
    event?.tool_input?.cwd,
    fallback,
  ];
  const selected = candidates.find((candidate) => typeof candidate === 'string' && candidate.trim());
  return path.resolve(selected || fallback);
}

export function inspectProject(projectRoot = process.cwd(), options = {}) {
  const pluginRoot = path.resolve(options.pluginRoot || DEFAULT_PLUGIN_ROOT);
  const root = path.resolve(projectRoot);
  const manifest = JSON.parse(fs.readFileSync(path.join(pluginRoot, '.cursor-plugin', 'plugin.json'), 'utf8'));
  const modules = loadModules(pluginRoot);
  const upstreamLock = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'upstream', 'impeccable.lock.json'), 'utf8'));
  const skillText = fs.readFileSync(path.join(pluginRoot, 'skills', 'impeccable', 'SKILL.md'), 'utf8');
  const skillVersion = skillText.match(/^version:\s*([^\s]+)\s*$/m)?.[1] || null;
  const impeccableModule = modules.find((module) => module.id === 'impeccable');
  const hook = readHookActivation(root);
  const conflicts = detectProjectConflicts(root);
  const context = {
    product: fs.existsSync(path.join(root, 'PRODUCT.md')),
    design: fs.existsSync(path.join(root, 'DESIGN.md')),
    impeccableDirectory: fs.existsSync(path.join(root, '.impeccable')),
  };
  return {
    projectRoot: root,
    plugin: { name: manifest.name, version: manifest.version },
    upstream: {
      name: upstreamLock.upstream.name,
      version: impeccableModule?.version || null,
      skillVersion,
      tag: upstreamLock.upstream.tag,
      commit: upstreamLock.upstream.commit,
      archiveSha256: upstreamLock.upstream.archive.sha256,
    },
    modules: modules.map((module) => ({ id: module.id, version: module.version, license: module.license })),
    hook,
    conflicts,
    context,
  };
}

export function diagnoseProject(projectRoot = process.cwd(), options = {}) {
  const state = inspectProject(projectRoot, options);
  const findings = [...state.conflicts];
  const tagVersion = state.upstream.tag.replace(/^skill-v/, '');
  if (new Set([state.upstream.version, state.upstream.skillVersion, tagVersion]).size !== 1) {
    findings.push({
      id: 'upstream-version-drift',
      severity: 'diagnostic',
      message: `Impeccable module=${state.upstream.version}, skill=${state.upstream.skillVersion}, tag=${state.upstream.tag}.`,
    });
  }
  if (state.hook.state === 'malformed') {
    findings.push({
      id: 'malformed-impeccable-config',
      severity: 'diagnostic',
      path: path.relative(state.projectRoot, state.hook.path),
      message: `Hook config is malformed and therefore treated as disabled: ${state.hook.error}`,
    });
  }
  const nodeAvailable = options.nodeAvailable ?? !!process.versions?.node;
  const nodeMajor = Number.parseInt(options.nodeVersion || process.versions?.node || '0', 10);
  if (!nodeAvailable) {
    findings.push({ id: 'node-missing', severity: 'diagnostic', message: 'Node is unavailable; the hook cannot run and must not block edits.' });
  } else if (nodeMajor < 22) {
    findings.push({ id: 'node-baseline', severity: 'diagnostic', message: `Node ${nodeMajor} is below the supported baseline 22.` });
  }
  return { ...state, findings, repairable: [] };
}

function writeHookEnabled(projectRoot, enabled) {
  const configPath = path.join(projectRoot, '.impeccable', 'config.json');
  const existing = safeJson(configPath);
  if (existing.malformed) throw new Error(`Refusing to overwrite malformed ${path.relative(projectRoot, configPath)}.`);
  const base = existing.value && typeof existing.value === 'object' && !Array.isArray(existing.value) ? existing.value : {};
  const hook = base.hook && typeof base.hook === 'object' && !Array.isArray(base.hook) ? base.hook : {};
  const next = { ...base, hook: { ...hook, enabled } };
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const temporary = path.join(path.dirname(configPath), `.config.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, { flag: 'wx' });
  fs.renameSync(temporary, configPath);
  return configPath;
}

export function setupProject(projectRoot = process.cwd(), options = {}) {
  const state = inspectProject(projectRoot, options);
  const enableHook = options.enableHook !== false;
  const plan = {
    writes: enableHook ? ['.impeccable/config.json: set hook.enabled=true'] : [],
    offers: [
      state.context.product ? 'PRODUCT.md already exists.' : 'Offer /impeccable init; do not create PRODUCT.md without confirmation.',
      state.context.design ? 'DESIGN.md already exists.' : 'Offer /impeccable document when an incumbent design should be captured.',
    ],
  };

  if (!options.apply) return { applied: false, state, plan };
  if (state.conflicts.some((finding) => finding.severity === 'conflict')) {
    return { applied: false, blocked: true, state, plan, reason: 'Resolve or explicitly retain the shadowing/double-hook conflict before activation.' };
  }
  if (state.hook.state === 'malformed') {
    return { applied: false, blocked: true, state, plan, reason: 'Malformed config is never overwritten by setup.' };
  }
  const written = enableHook ? [path.relative(state.projectRoot, writeHookEnabled(state.projectRoot, true))] : [];
  return { applied: true, state: inspectProject(projectRoot, options), plan, written };
}

export function setProjectHook(projectRoot, enabled, options = {}) {
  const state = inspectProject(projectRoot, options);
  if (state.hook.state === 'malformed') throw new Error('Malformed config requires a deliberate manual repair.');
  if (enabled && state.conflicts.some((finding) => finding.severity === 'conflict')) {
    throw new Error('Activation refused because a direct Impeccable installation or duplicate hook exists.');
  }
  return path.relative(state.projectRoot, writeHookEnabled(state.projectRoot, enabled));
}
