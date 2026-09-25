import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadModules } from '../src/registry.mjs';
import { renderCapabilityIndex } from '../scripts/build-capability-index.mjs';

const modules = loadModules();

test('the actual skill loads a current index with every leading command and the Impeccable default', () => {
  const rendered = renderCapabilityIndex(modules);
  assert.equal(readFileSync(new URL('../skills/design/references/capabilities.md', import.meta.url), 'utf8'), rendered);
  const rows = [...rendered.matchAll(/^\| `([^`]+)` \| ([^ |]+) /gm)].map(([, command, capability]) => [command, capability]);
  assert.deepEqual(rows, [
    ['setup', 'design-core:project-integration'], ['status', 'design-core:project-integration'],
    ['diagnose', 'design-core:project-integration'], ['detect', 'design-core:detector-scan'],
    ['questionnaire', 'design-core:stakeholder-questionnaire'], ['review', 'design-core:change-interface-review'],
    ['motion', 'motion:animation-implementation'],
  ]);
  for (const module of modules) for (const capability of module.capabilities.filter(entry => !entry.fallback)) {
    for (const description of Object.values(capability.intents)) assert.ok(rendered.includes(description));
  }
  assert.match(rendered, /Review this checkout page/);
  assert.match(rendered, /every other in-scope web-interface request, including a leading `doctor`/);
  assert.match(rendered, /Do not load it for work outside website and web-app interface scope/);
  assert.match(rendered, /impeccable:general-web-design/);
  assert.match(rendered, /explicitly addressed to Impeccable bypasses Design/);
  const skill = readFileSync(new URL('../skills/design/SKILL.md', import.meta.url), 'utf8');
  assert.match(skill, /\[references\/capabilities.md\]\(references\/capabilities.md\)/);
  assert.match(rendered, /\]\(\.\.\/\.\.\/impeccable\/SKILL\.md\)/);
  assert.doesNotMatch(skill, /specificity|combinableWith|routeRequest/);
});

test('semantic operation descriptions track registry updates and reject missing or stale entries', () => {
  const changed = structuredClone(modules);
  const capability = changed.find(module => module.id === 'design-core').capabilities.find(entry => entry.id === 'stakeholder-questionnaire');
  capability.intents.questionnaire = 'Prepare a decision questionnaire for one audience.';
  assert.ok(renderCapabilityIndex(changed).includes(capability.intents.questionnaire));
  capability.triggers = ['interview'];
  assert.throws(() => renderCapabilityIndex(changed), /one current, single-line intent/);
  capability.intents = { interview: 'Prepare an interview.' };
  const rendered = renderCapabilityIndex(changed);
  assert.match(rendered, /\| `interview` \|/);
  assert.doesNotMatch(rendered, /\| `questionnaire` \|/);
  capability.intents.interview = '';
  assert.throws(() => renderCapabilityIndex(changed), /one current, single-line intent/);
});

test('index generation rejects ambiguous commands and defaults without a second routing implementation', () => {
  const duplicate = structuredClone(modules);
  duplicate[0].capabilities[1].triggers = ['setup'];
  assert.throws(() => renderCapabilityIndex(duplicate), /duplicate leading command/);
  assert.throws(() => renderCapabilityIndex(modules.filter(module => module.id !== 'impeccable')), /Exactly one Impeccable default/);
  const changed = modules.map(module => ({ ...module, source: { url: 'https://example.invalid' } }));
  assert.equal(renderCapabilityIndex(changed), renderCapabilityIndex(modules));
});
