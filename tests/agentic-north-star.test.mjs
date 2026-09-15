import assert from 'node:assert/strict';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';
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
  assert.match(content, /explicit invocation/);
  assert.match(content, /automatically or by explicit invocation/);
  assert.match(content, /inherit the user's selected parent model/);
  assert.match(content, /npm run release-check/);
});

test('all seven skills have scoped metadata and matching native invocation policies', () => {
  const expected = [
    ['skills/design', true], ['skills/impeccable', false],
    ['.agents/skills/verify-impeccable-engine', true],
    ['.agents/skills/deploy-local-plugin', false],
    ['.agents/skills/install-new-release-from-repo', false],
    ['.agents/skills/release-plugin', false],
    ['.agents/skills/update-impeccable', false],
  ];
  const discovered = ['skills', '.agents/skills'].flatMap(directory =>
    readdirSync(path.join(root, directory)).filter(name => existsSync(path.join(root, directory, name, 'SKILL.md'))).map(name => `${directory}/${name}`));
  assert.deepEqual(discovered.sort(), expected.map(([directory]) => directory).sort());
  for (const [directory, implicit] of expected) {
    const text = readFileSync(path.join(root, directory, 'SKILL.md'), 'utf8');
    const metadata = YAML.parse(text.match(/^---\n([\s\S]*?)\n---\n/)[1]);
    assert.equal(metadata.name, path.basename(directory));
    assert.equal(typeof metadata.description, 'string');
    assert.ok(metadata.description.trim().length > 0 && metadata.description.length <= 1024);
    const uiPath = path.join(root, directory, 'agents/openai.yaml');
    const ui = existsSync(uiPath) ? YAML.parse(readFileSync(uiPath, 'utf8')) : {};
    assert.equal(ui.policy?.allow_implicit_invocation ?? true, implicit, directory);
    if (directory.startsWith('.agents/')) assert.equal(metadata['disable-model-invocation'] ?? false, !implicit, directory);
    else assert.equal(Object.hasOwn(metadata, 'disable-model-invocation'), false, 'shared runtime skills stay host-neutral');
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
