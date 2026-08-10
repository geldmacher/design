export const HOST_IDS = Object.freeze(['cursor', 'codex']);

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
    throw new Error('Plugin host is unknown. Pass --host cursor or --host codex.');
  }
  if (!HOST_IDS.includes(candidate)) {
    throw new Error(`Unsupported plugin host: ${candidate}. Expected cursor or codex.`);
  }
  return candidate;
}

export function hostInvocation(host, skill) {
  const resolved = resolveHost(host, {});
  return `${resolved === 'cursor' ? '/' : '$'}${skill}`;
}
