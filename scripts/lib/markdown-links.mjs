import path from 'node:path';

export function resolveMarkdownLink(root, file, target, paths = path) {
  // Overlay links refer to generated skill files, on both native path formats.
  const normalized = file.replaceAll('\\', '/');
  const source = normalized.startsWith('overlays/skills/motion/')
    ? normalized.slice('overlays/'.length) : normalized;
  return paths.resolve(paths.dirname(paths.join(root, source)), target);
}
