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
  ]);
  assert.match(rendered, /Match only the leading command/);
  assert.match(rendered, /A word inside a design task never selects a command/);
  assert.match(rendered, /Use the table only when the user explicitly requests a Design operation with its command syntax/);
  assert.match(rendered, /Review this checkout page/);
  assert.match(rendered, /An explicit Design invocation alone does not turn an ordinary UI request into an operation/);
  assert.match(rendered, /every other request, including a leading `doctor`/);
  assert.match(rendered, /impeccable:general-web-design/);
  assert.match(rendered, /explicitly addressed to Impeccable bypasses Design/);
  const skill = readFileSync(new URL('../skills/design/SKILL.md', import.meta.url), 'utf8');
  assert.match(skill, /\[references\/capabilities.md\]\(references\/capabilities.md\)/);
  assert.doesNotMatch(skill, /specificity|combinableWith|routeRequest/);
});

test('index generation rejects ambiguous commands and defaults without a second routing implementation', () => {
  const duplicate = structuredClone(modules);
  duplicate[0].capabilities[1].triggers = ['setup'];
  assert.throws(() => renderCapabilityIndex(duplicate), /duplicate leading command/);
  assert.throws(() => renderCapabilityIndex(modules.filter(module => module.id !== 'impeccable')), /Exactly one Impeccable default/);
  const changed = modules.map(module => ({ ...module, source: { url: 'https://example.invalid' } }));
  assert.equal(renderCapabilityIndex(changed), renderCapabilityIndex(modules));
});
