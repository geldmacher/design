import assert from 'node:assert/strict';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function filesBelow(directory) {
  if (!existsSync(directory)) return [];

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(target) : [target];
  });
}

test('root AGENTS.md is the concise shared product contract', () => {
  const agentsPath = path.join(root, 'AGENTS.md');
  const metadata = lstatSync(agentsPath);
  const content = readFileSync(agentsPath, 'utf8');

  assert.equal(metadata.isFile(), true, 'AGENTS.md must be a regular file');
  assert.equal(metadata.isSymbolicLink(), false, 'AGENTS.md must not be a symlink');
  assert.ok(content.split('\n').length < 70, 'AGENTS.md should remain concise');

  for (const required of [
    '# Design product north star',
    '## Product boundaries',
    '## Architecture',
    '## Upstream ownership',
    '## Verification and authority',
    'explicit invocation',
    '`PRODUCT.md`, `DESIGN.md`, and `.impeccable/`',
    '${CURSOR_PLUGIN_ROOT}',
    '${PLUGIN_ROOT}',
    'inherit the user\'s selected parent model',
    'npm run release-check',
    'Marketplace publication',
  ]) {
    assert.ok(content.includes(required), `AGENTS.md is missing: ${required}`);
  }
});

test('the root contract has no duplicate repository instruction surface', () => {
  for (const duplicate of [
    '.agents/AGENTS.md',
    '.cursor/rules/agentic-delivery-north-star.mdc',
  ]) {
    assert.equal(existsSync(path.join(root, duplicate)), false, `${duplicate} duplicates root AGENTS.md`);
  }
});

test('AGENTS.md stays outside package and runtime declarations', () => {
  const npmignore = readFileSync(path.join(root, '.npmignore'), 'utf8');
  assert.match(npmignore, /^\/AGENTS\.md$/m, 'root AGENTS.md must be excluded from npm packages');

  const declarationFiles = [
    path.join(root, '.cursor-plugin/plugin.json'),
    path.join(root, '.codex-plugin/plugin.json'),
    path.join(root, 'manifests/agent-plugin.json'),
    path.join(root, '.agents/plugins/marketplace.json'),
    ...filesBelow(path.join(root, 'modules')).filter((file) => file.endsWith('.json')),
  ];

  for (const declarationFile of declarationFiles) {
    const declaration = JSON.stringify(JSON.parse(readFileSync(declarationFile, 'utf8')));
    assert.equal(
      declaration.includes('AGENTS.md'),
      false,
      `${path.relative(root, declarationFile)} must not declare AGENTS.md`,
    );
  }
});
