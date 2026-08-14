import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const designSkill = readFileSync(join(root, 'skills', 'design', 'SKILL.md'), 'utf8');
const review = readFileSync(join(root, 'skills', 'design', 'references', 'change-review.md'), 'utf8');
const moduleDocument = JSON.parse(readFileSync(join(root, 'modules', 'design-core.json'), 'utf8'));

test('change review is a narrow first-party capability over the Impeccable fallback', () => {
  const capability = moduleDocument.capabilities.find((entry) => entry.id === 'change-interface-review');
  assert.deepEqual(capability, {
    id: 'change-interface-review',
    title: 'Change-scoped interface review',
    skill: 'design',
    specificity: 90,
    fallback: false,
    triggers: ['review'],
    scope: ['website', 'web-app'],
    combinableWith: [],
  });
  assert.match(designSkill, /change-interface-review/);
  assert.match(designSkill, /change-review\.md/);
  assert.match(designSkill, /request unchanged/);
});

test('review contract fixes modes, caps, classifications, and verdicts', () => {
  for (const required of [
    '`quick`',
    '`full`',
    'Finding cap',
    'P0',
    'P1',
    'P2',
    'P3',
    '`Introduced`',
    '`Regression`',
    '`Pre-existing`',
    '**Scope and Coverage**',
    '**Domain Coverage**',
    '**Findings**',
    '**Verification**',
    '`Block`',
    '`Needs changes`',
    '`Clear in reviewed scope`',
  ]) {
    assert.match(review, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), required);
  }
  assert.match(review, /quick mode reports at most five/i);
  assert.match(review, /Full mode reports at most 15/i);
  assert.match(review, /Quick mode.*omits P3/i);
  assert.match(review, /at most three/i);
});

test('review remains task-local, read-only, and hands approved work to Design', () => {
  assert.match(review, /Do not invoke `critique-storage\.mjs`/);
  assert.match(review, /The review report lives only in the current task/);
  assert.match(review, /Do not edit after the report/);
  assert.match(review, /Wait for a separate user instruction/);
  assert.match(review, /\/design polish <surface> using review findings 1-3/);
  assert.match(review, /\$design adapt <surface> using review finding 2/);
  assert.match(review, /Never run `checkout`, `switch`, or `stash`/);
  assert.match(review, /writesGit: true/);
  assert.match(review, /design-cli\.mjs" --host <host> detect --json -- <files>/);
  assert.doesNotMatch(review, /IMPECCABLE_SKILL_ROOT>\/scripts\/detect\.mjs/);
});

test('rendering policy is opportunistic for quick and bounded for full', () => {
  assert.match(review, /In quick mode.*already running or directly available/s);
  assert.match(review, /Do not start a server, create a worktree, or install anything/);
  assert.match(review, /In full mode, prefer an existing preview/);
  assert.match(review, /Start at most one background server/);
  assert.match(review, /git worktree add --detach/);
  assert.match(review, /stop it before reporting/i);
  assert.match(review, /`Not verified`/);
});
