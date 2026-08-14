import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const designModule = JSON.parse(readFileSync(path.join(root, 'modules/design-core.json'), 'utf8'));
const designSkill = readFileSync(path.join(root, 'skills/design/SKILL.md'), 'utf8');
const questionnaire = readFileSync(path.join(root, 'skills/design/references/questionnaire.md'), 'utf8');
const openaiMetadata = YAML.parse(readFileSync(path.join(root, 'skills/design/agents/openai.yaml'), 'utf8'));

test('stakeholder questionnaire is an explicit first-party Design capability', () => {
  const capability = designModule.capabilities.find((entry) => entry.id === 'stakeholder-questionnaire');
  assert.deepEqual(capability, {
    id: 'stakeholder-questionnaire',
    title: 'Stakeholder decision questionnaire',
    skill: 'design',
    specificity: 100,
    fallback: false,
    triggers: ['questionnaire'],
    scope: ['website', 'web-app'],
    combinableWith: [],
  });
  assert.match(designSkill, /design-core:stakeholder-questionnaire/);
  assert.match(designSkill, /references\/questionnaire\.md/);
  assert.deepEqual(designModule.source, { type: 'first-party', url: 'urn:geldmacher:design' });
  assert.deepEqual(designModule.contributes.skills, ['skills/design']);
  assert.deepEqual(designModule.contributes.agents, []);
  assert.deepEqual(designModule.contributes.rules, []);
  assert.deepEqual(designModule.contributes.hooks, ['hooks/cursor-hooks.json', 'hooks/hooks.json']);
  assert.deepEqual(designModule.contributes.scripts, [
    'skills/design/scripts/design-cli.mjs',
    'skills/design/scripts/review-scope.mjs',
    'scripts/design-cli.mjs',
    'hooks/impeccable-plugin-hook.mjs',
    'hooks/impeccable-codex-hook.mjs',
  ]);
  assert.deepEqual(designModule.contributes.mcpServers, []);
});

test('questionnaire reference preserves canonical context, no-reask, and one-audience scope', () => {
  for (const required of [
    '`PRODUCT.md`',
    '`DESIGN.md`',
    'topic-relevant files under `.impeccable/`',
    'Do not ask for it again.',
    'one recipient or one audience with a shared role and knowledge level',
    'they need separate questionnaires',
    'Match both language and tone to the recipient',
    'use the language of the invocation',
    'never invent them',
  ]) {
    assert.ok(questionnaire.includes(required), `Questionnaire contract is missing: ${required}`);
  }
  assert.doesNotMatch(questionnaire, /\/(?:design|impeccable)\b|\$(?:design|impeccable)\b/);
});

test('Codex metadata demonstrates the leading questionnaire intent', () => {
  assert.equal(
    openaiMetadata.interface.default_prompt,
    'Use $design questionnaire [topic] to prepare a preview-first stakeholder questionnaire.',
  );
});

test('questionnaire reference enforces bounded authoring and preview-before-write', () => {
  for (const required of [
    'Create 5–10 questions by default and never exceed 12',
    'Cover every required decision or factual gap with at least one question.',
    'Keep each question atomic',
    'Show the complete candidate Markdown',
    'State that no file has been written.',
    'A destination supplied before the preview is not write approval',
    'When the destination already exists',
    'Require a new, explicit overwrite confirmation',
    'show the complete revised preview and reset write approval',
    'write exactly the previewed Markdown',
    'to exactly one file',
  ]) {
    assert.ok(questionnaire.includes(required), `Questionnaire write contract is missing: ${required}`);
  }
});

test('questionnaire reference excludes delivery, answer import, and context mutation', () => {
  for (const excludedAction of [
    'Do not send the questionnaire',
    'import or analyze answers',
    'modify `PRODUCT.md`, `DESIGN.md`, `.impeccable/`, hooks, or configuration',
    'write any second file',
    'canonical context remains unchanged',
  ]) {
    assert.ok(questionnaire.includes(excludedAction), `Questionnaire boundary is missing: ${excludedAction}`);
  }
});
