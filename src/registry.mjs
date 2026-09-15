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

export function flattenCapabilities(modules) {
  return modules.flatMap((module) => (module.capabilities || []).map((capability) => ({
    module: module.id,
    ...capability,
  })));
}
