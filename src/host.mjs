import fs from 'node:fs';
import path from 'node:path';

export const HOST_IDS = Object.freeze(['agent-plugin', 'cursor', 'codex', 'opencode']);

export function resolveHost(explicit, env = process.env) {
  const candidate = typeof explicit === 'string' && explicit.trim()
    ? explicit.trim().toLowerCase()
    : typeof env.IMPECCABLE_HOST === 'string' && env.IMPECCABLE_HOST.trim()
      ? env.IMPECCABLE_HOST.trim().toLowerCase()
      : env.CURSOR_PLUGIN_ROOT
        ? 'cursor'
        : env.PLUGIN_ROOT
          ? 'codex'
          : null;

  if (!candidate) {
    throw new Error('Plugin host is unknown. Pass --host agent-plugin, cursor, codex, or opencode.');
  }
  if (!HOST_IDS.includes(candidate)) {
    throw new Error(`Unsupported plugin host: ${candidate}. Expected agent-plugin, cursor, codex, or opencode.`);
  }
  return candidate;
}

export function hostInvocation(host, skill) {
  const resolved = resolveHost(host, {});
  if (resolved === 'cursor' || resolved === 'opencode') return `/${skill}`;
  if (resolved === 'codex') return `$${skill}`;
  return skill;
}

// The canonical portable manifest is explicit package identity, not a guessed host.
export function resolvePluginHost(explicit, pluginRoot, env = process.env) {
  if (explicit?.trim() || env.IMPECCABLE_HOST?.trim() || env.CURSOR_PLUGIN_ROOT || env.PLUGIN_ROOT) return resolveHost(explicit, env);
  const file = path.join(pluginRoot, 'plugin.json');
  if (fs.existsSync(file) && fs.lstatSync(file).isFile()) {
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (manifest.$schema === 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json') return 'agent-plugin';
  }
  const present = (relative) => {
    const candidate = path.join(pluginRoot, relative);
    return fs.existsSync(candidate) && fs.lstatSync(candidate).isFile();
  };
  // A source checkout contains every host manifest. Only the OpenCode package has this manifest alone.
  if (present('.opencode-plugin/plugin.json') && !present('.cursor-plugin/plugin.json') && !present('.codex-plugin/plugin.json')) return 'opencode';
  return resolveHost(explicit, env);
}
