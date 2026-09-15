import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const configNames = ['config.json', 'config.local.json'];

export function configPath(root, name) {
  if (!configNames.includes(name) && !['hook.cache.json', 'hook.pending.json'].includes(name)) throw new Error('Unknown Impeccable configuration file.');
  const directory = path.join(root, '.impeccable');
  for (const file of [directory, path.join(directory, name)]) {
    let stat;
    try { stat = fs.lstatSync(file); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    if (stat.isSymbolicLink()) throw new Error('Refusing symlinked Impeccable configuration.');
    if (file === directory ? !stat.isDirectory() : !stat.isFile()) throw new Error('Invalid Impeccable configuration path.');
  }
  return path.join(directory, name);
}

export function readConfig(root, name) {
  const file = configPath(root, name);
  if (!fs.existsSync(file)) return null;
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Impeccable configuration must be an object.');
  if (value.hook !== undefined && (!value.hook || typeof value.hook !== 'object' || Array.isArray(value.hook))) throw new Error('hook must be an object');
  if (Object.hasOwn(value.hook || {}, 'enabled') && typeof value.hook.enabled !== 'boolean') throw new Error('hook.enabled must be a boolean');
  return value;
}

export function writeConfig(root, name, value) {
  const file = configPath(root, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
    fs.renameSync(temporary, file);
  } finally { fs.rmSync(temporary, { force: true }); }
}

export function readHookActivation(root) {
  let enabled = false;
  let explicit = false;
  for (const name of configNames) {
    try {
      const value = readConfig(root, name);
      if (Object.hasOwn(value?.hook || {}, 'enabled')) { enabled = value.hook.enabled; explicit = true; }
    } catch (error) {
      return { state: 'malformed', enabled: false, explicit: false, path: path.join(root, '.impeccable', name), error: error.message };
    }
  }
  return { state: enabled ? 'enabled' : 'disabled', enabled, explicit, path: path.join(root, '.impeccable/config.json') };
}

export function planHookActivation(root, enabled) {
  if (typeof enabled !== 'boolean') throw new Error('Hook activation must be a boolean.');
  // Read both files before preparing any write, including a malformed local override.
  return configNames.map(name => ({ name, value: readConfig(root, name) }))
    .filter(({ name, value }) => name === 'config.json' || Object.hasOwn(value?.hook || {}, 'enabled'))
    .filter(({ value }) => value?.hook?.enabled !== enabled)
    .map(({ name, value }) => ({ name, value: { ...value, hook: { ...value?.hook, enabled } } }));
}

export function applyHookActivation(root, enabled) {
  const changes = planHookActivation(root, enabled);
  const written = [];
  try {
    for (const { name, value } of changes) {
      writeConfig(root, name, value);
      written.push(`.impeccable/${name}`);
    }
    const state = readHookActivation(root);
    if (state.state === 'malformed' || state.enabled !== enabled) throw new Error('Hook activation did not reach the requested state.');
    return written;
  } catch (error) {
    throw new Error(`Hook change failed after writing ${written.join(', ') || 'no files'}; effective state: ${readHookActivation(root).state}. ${error.message}`, { cause: error });
  }
}
