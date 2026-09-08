import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import YAML from 'yaml';
import { parseDesignMd } from '../skills/impeccable/scripts/lib/design-parser.mjs';
import { parseFrontmatter, normalizeDesignSystem, isAllowedColorRaw, isAllowedFontSizeRaw } from '../skills/impeccable/scripts/detector/design-system.mjs';

const document = readFileSync(new URL('../skills/impeccable/reference/document.md', import.meta.url), 'utf8');
const critique = readFileSync(new URL('../skills/impeccable/reference/critique.md', import.meta.url), 'utf8');
const example = document.match(/```yaml\n([\s\S]*?)```/)[1];
const sidecar = JSON.parse(document.match(/```json\n([\s\S]*?)```/)[1]);

test('document example agrees across YAML, panel parser, and detector reader', () => {
  const expected = YAML.parse(example.replace(/^---\n/, '').replace(/\n---\s*$/, ''));
  const panel = parseDesignMd(example).frontmatter;
  const detector = parseFrontmatter(example);
  assert.deepEqual(panel, expected);
  assert.deepEqual(detector, expected);
  assert.equal(panel.typography.display.fontSize, 'clamp(2.5rem, 7vw, 4.5rem)');
  assert.equal(panel.typography.display.letterSpacing, 'normal');
  assert.equal(panel.components['button-primary'].padding, '16px 48px');
  const checkRefs = (value) => {
    if (value && typeof value === 'object') return Object.values(value).forEach(checkRefs);
    if (typeof value !== 'string') return;
    for (const [, token] of value.matchAll(/\{([^}]+)\}/g)) {
      assert.notEqual(token.split('.').reduce((node, key) => node?.[key], panel), undefined, token);
    }
  };
  checkRefs(panel);
  const system = normalizeDesignSystem({ frontmatter: detector });
  assert.equal(isAllowedColorRaw('#b8422e', system), true);
  assert.equal(isAllowedColorRaw('#8b3020', system), true);
  assert.ok(system.allowedFontSizes.some((size) => size.fluid && size.px === 40));
  assert.ok(system.allowedFontSizes.some((size) => size.fluid && size.px === 72));
  const fluidOnly = normalizeDesignSystem({ frontmatter: { typography: { display: detector.typography.display } } });
  assert.equal(fluidOnly.hasFontSizes, false);
  assert.equal(isAllowedFontSizeRaw('53px', fluidOnly), true);
});

test('seed and sidecar preserve separate responsibilities', () => {
  const seed = '---\nname: Example\ndescription: A chosen direction\n---\n\n## Overview\nA provisional visual world.\n';
  const parsed = parseDesignMd(seed);
  assert.deepEqual(parsed.frontmatter, { name: 'Example', description: 'A chosen direction' });
  assert.deepEqual(parseFrontmatter(seed), parsed.frontmatter);
  const system = normalizeDesignSystem({ frontmatter: parsed.frontmatter });
  assert.equal(system.hasColors, false);
  assert.equal(system.hasFontSizes, false);
  assert.equal(sidecar.schemaVersion, 2);
  const frontmatter = parseDesignMd(example).frontmatter;
  for (const key of Object.keys(sidecar.extensions.colorMeta)) assert.ok(frontmatter.colors[key], key);
  for (const key of Object.keys(sidecar.extensions.typographyMeta)) assert.ok(frontmatter.typography[key], key);
  for (const component of sidecar.components) assert.ok(frontmatter.components[component.refersTo], component.refersTo);
  for (const key of ['colors', 'typography', 'rounded', 'spacing', 'tokens']) assert.equal(Object.hasOwn(sidecar, key), false);
  for (const key of ['shadows', 'motion', 'breakpoints']) {
    assert.equal(Object.hasOwn(frontmatter, key), false);
    assert.ok(Array.isArray(sidecar.extensions[key]));
  }
  assert.match(document, /do not author arrays, anchors, aliases, tags, multiline scalars, or duplicate keys/);
  assert.match(document, /Skip the `.impeccable\/design.json` sidecar in seed mode/);
});

test('usability criteria keep evidence and both memory calibration cases', () => {
  const criteria = critique.split('#### Ten Usability Criteria\n')[1].split('#### Score Summary')[0];
  assert.deepEqual([...criteria.matchAll(/^##### (\d+)\. /gm)].map((match) => Number(match[1])), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.match(critique, /twelve clearly labeled, grouped links is not a finding/);
  assert.match(critique, /only two choices can still impose substantial burden/);
  assert.match(critique, /severity from the consequence and recoverability/);
  assert.match(critique, /Do not predict abandonment or mistakes from option count alone/);
  assert.doesNotMatch(critique, /Nielsen|Miller|Cowan|[>≤][45]|5–7 items|8\+ items|10\+ choices|Count the failed items/);
  assert.doesNotMatch(document, /Stitch|Material-derived|official.*spec/);
});
