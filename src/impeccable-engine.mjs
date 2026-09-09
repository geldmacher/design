import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const enginePlatforms = Object.freeze(['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64', 'windows-x64']);
export const engineFile = (platform) => `impeccable-${platform}${platform === 'windows-x64' ? '.exe' : ''}`;
export const engineRelativePath = (platform) => `skills/impeccable/scripts/bin/${platform}/${platform === 'windows-x64' ? 'impeccable.exe' : 'impeccable'}`;

export function validateEngine(engine) {
  const exact = (value, keys) => value && typeof value === 'object' && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
  if (!exact(engine, ['version', 'tag', 'tagObject', 'commit', 'releaseId', 'assets'])
    || !/^\d+\.\d+\.\d+$/.test(engine.version) || engine.tag !== `engine-v${engine.version}`
    || !/^[a-f0-9]{40}$/.test(engine.tagObject) || !/^[a-f0-9]{40}$/.test(engine.commit)
    || !Number.isSafeInteger(engine.releaseId) || engine.releaseId <= 0
    || !exact(engine.assets, enginePlatforms)) throw new Error('Invalid engine release provenance or platform matrix.');
  for (const platform of enginePlatforms) {
    const asset = engine.assets[platform];
    if (!exact(asset, ['id', 'url', 'sha256', 'size']) || !Number.isSafeInteger(asset.id) || asset.id <= 0
      || asset.url !== `https://github.com/pbakaus/impeccable/releases/download/${engine.tag}/${engineFile(platform)}`
      || !/^[a-f0-9]{64}$/.test(asset.sha256) || !Number.isSafeInteger(asset.size) || asset.size <= 0) {
      throw new Error(`Invalid engine asset provenance: ${platform}`);
    }
  }
  return engine;
}

export function physicalFile(root, relative) {
  if (!fs.lstatSync(root).isDirectory()) throw new Error('Plugin root must be a physical directory.');
  const base = fs.realpathSync(root);
  let current = base;
  if (path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) throw new Error('Engine path escapes plugin root.');
  for (const segment of relative.split('/')) {
    current = path.join(current, segment);
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error(`Bundled engine path crosses a symlink: ${relative}`);
  }
  if (!fs.lstatSync(current).isFile()) throw new Error(`Bundled engine path is not a regular file: ${relative}`);
  return current;
}

export function readEnginePin(root) {
  const relative = fs.existsSync(path.join(root, 'upstream/impeccable.pin.json'))
    ? 'upstream/impeccable.pin.json' : 'licenses/impeccable-pin.json';
  const pin = JSON.parse(fs.readFileSync(physicalFile(root, relative), 'utf8'));
  if (pin.schemaVersion !== 2) throw new Error('Native engine requires Impeccable pin schema 2.');
  validateEngine(pin.engine);
  return pin;
}

export function resolveEngine(root, { platform = process.platform, arch = process.arch } = {}) {
  const key = `${platform === 'win32' ? 'windows' : platform}-${arch}`;
  if (!enginePlatforms.includes(key)) throw new Error(`Unsupported Impeccable engine platform: ${key}`);
  const pin = readEnginePin(root);
  const relative = engineRelativePath(key);
  const file = physicalFile(root, relative);
  const bytes = fs.readFileSync(file);
  const asset = pin.engine.assets[key];
  if (bytes.length !== asset.size || createHash('sha256').update(bytes).digest('hex') !== asset.sha256) {
    throw new Error(`Bundled engine hash or size mismatch: ${key}`);
  }
  if (platform !== 'win32' && !(fs.statSync(file).mode & 0o111)) throw new Error(`Bundled engine is not executable: ${key}`);
  return { file, relativeScript: relative, engineVersion: pin.engine.version, platform: key, pluginRoot: fs.realpathSync(root) };
}
