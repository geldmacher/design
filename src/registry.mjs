import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadModules(pluginRoot = DEFAULT_ROOT, moduleDir = 'modules') {
  const root = path.resolve(pluginRoot, moduleDir);
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json') && entry.name !== 'module.schema.json')
    .map((entry) => JSON.parse(fs.readFileSync(path.join(root, entry.name), 'utf8')))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function normalizeRequest(request) {
  return String(request || '').trim().toLowerCase().replace(/^[/$]design\b\s*/, '');
}

function triggerMatches(input, trigger) {
  const normalized = String(trigger).trim().toLowerCase();
  if (!normalized) return false;
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`(^|\\b)${escaped}(\\b|$)`, 'i').test(input);
}

function candidateKey(candidate) {
  return `${candidate.module.id}:${candidate.capability.id}`;
}

function canCombine(candidates) {
  return candidates.length > 1 && candidates.every((candidate) => {
    const allowed = new Set(candidate.capability.combinableWith || []);
    return candidates.every((other) => candidate === other || allowed.has(candidateKey(other)));
  });
}

export function routeRequest(request, modules) {
  const raw = String(request || '').trim();
  if (/^[/$]impeccable(?:\s|$)/i.test(raw)) {
    return {
      kind: 'direct',
      skill: 'impeccable',
      reason: 'Explicit Impeccable invocation bypasses the wrapper.',
    };
  }

  const input = normalizeRequest(raw);
  const candidates = [];
  const fallbacks = [];

  for (const module of modules) {
    for (const capability of module.capabilities || []) {
      const commandScopedInput = module.id === 'design-core' && capability.id === 'change-interface-review'
        ? (/^review(?:\s|$)/i.test(input) ? input : '')
        : input;
      const matches = (capability.triggers || []).filter((trigger) => triggerMatches(commandScopedInput, trigger));
      const candidate = { module, capability, matches };
      if (capability.fallback) fallbacks.push(candidate);
      if (matches.length > 0 && !capability.fallback) candidates.push(candidate);
    }
  }

  const pool = candidates.length > 0
    ? candidates
    : fallbacks.sort((a, b) => b.capability.specificity - a.capability.specificity);

  if (pool.length === 0) {
    throw new Error('No fallback capability is registered.');
  }

  const highest = Math.max(...pool.map((candidate) => candidate.capability.specificity));
  const winners = pool.filter((candidate) => candidate.capability.specificity === highest);

  if (winners.length === 1) {
    const winner = winners[0];
    return {
      kind: 'route',
      module: winner.module.id,
      capability: winner.capability.id,
      skill: winner.capability.skill,
      specificity: winner.capability.specificity,
      matchedTriggers: winner.matches,
    };
  }

  if (canCombine(winners)) {
    return {
      kind: 'combine',
      routes: winners.map((winner) => ({
        module: winner.module.id,
        capability: winner.capability.id,
        skill: winner.capability.skill,
      })),
    };
  }

  return {
    kind: 'clarify',
    reason: 'Multiple equally specific curated capabilities match.',
    options: winners.map((winner) => ({
      module: winner.module.id,
      capability: winner.capability.id,
      title: winner.capability.title,
      skill: winner.capability.skill,
    })),
  };
}

export function flattenCapabilities(modules) {
  return modules.flatMap((module) => (module.capabilities || []).map((capability) => ({
    module: module.id,
    moduleVersion: module.version,
    license: module.license,
    ...capability,
  })));
}
