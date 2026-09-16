import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { resolveMarkdownLink } from '../scripts/lib/markdown-links.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

test('Motion overlay links resolve to shipped files under POSIX and Windows path rules', () => {
  for (const paths of [path.posix, path.win32]) {
    const base = paths === path.win32 ? 'C:\\design' : '/design';
    for (const relative of ['overlays/skills/motion/SKILL.md', 'overlays/skills/motion/codex/index.md']) {
      const file = paths.join(...relative.split('/'));
      const text = fs.readFileSync(path.join(root, relative), 'utf8');
      for (const [, target] of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
        const resolved = resolveMarkdownLink(base, file, target, paths);
        const shipped = paths.relative(base, resolved).split(paths.sep).join('/');
        assert.ok(shipped.startsWith('skills/'), shipped);
        assert.ok(fs.existsSync(path.join(root, shipped)), shipped);
      }
    }
    assert.equal(resolveMarkdownLink(base, paths.join('docs', 'installation.md'), '../README.md', paths), paths.join(base, 'README.md'));
    assert.equal(resolveMarkdownLink(base, paths.join('overlays', 'skills', 'motion-other', 'SKILL.md'), 'missing.md', paths), paths.join(base, 'overlays', 'skills', 'motion-other', 'missing.md'));
    const missing = resolveMarkdownLink(base, paths.join('overlays', 'skills', 'motion', 'SKILL.md'), 'missing.md', paths);
    assert.equal(fs.existsSync(path.join(root, paths.relative(base, missing).split(paths.sep).join('/'))), false);
  }
});

test('the repository link-check entrypoint validates the current overlay links', () => {
  const output = execFileSync(process.execPath, [path.join(root, 'scripts/check-links.mjs')], { encoding: 'utf8' });
  assert.match(output, /Local link check passed/);
});
