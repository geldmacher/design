import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runBundledImpeccable } from '../src/impeccable-runtime.mjs';
import test from 'node:test';
import YAML from 'yaml';

const document = readFileSync(new URL('../skills/impeccable/reference/document.md', import.meta.url), 'utf8');
const critique = readFileSync(new URL('../skills/impeccable/reference/critique.md', import.meta.url), 'utf8');
const example = document.match(/```yaml\n([\s\S]*?)```/)[1];
const sidecar = JSON.parse(document.match(/```json\n([\s\S]*?)```/)[1]);

test('document example has valid YAML and resolvable token references', () => {
  const expected = YAML.parse(example.replace(/^---\n/, '').replace(/\n---\s*$/, ''));
  const panel = expected;
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

});

test('seed and sidecar preserve separate responsibilities', () => {
  const seed = '---\nname: Example\ndescription: A chosen direction\n---\n\n## Overview\nA provisional visual world.\n';
  assert.deepEqual(YAML.parse(seed.split("---")[1]), { name: "Example", description: "A chosen direction" });
  assert.equal(sidecar.schemaVersion, 2);
  const frontmatter = YAML.parse(example.split("---")[1]);
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

test('native reader respects the documented palette and fluid-only typography', (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'design-native-reader-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  writeFileSync(join(cwd, 'DESIGN.md'), example);
  writeFileSync(join(cwd, 'sample.html'), '<p style="color:#b8422e;background:#8b3020;font-size:53px">Hello</p><p style="color:#123456">Other</p>');
  const scan = () => {
    const result = runBundledImpeccable({ pluginRoot: resolve('.'), cwd, host: 'codex', command: 'detect', args: ['--json', 'sample.html'] });
    assert.ok([0, 2].includes(result.status), result.error || result.stderr);
    return JSON.parse(result.stdout);
  };
  const findings = scan().filter((item) => item.antipattern === 'design-system-color');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].ignoreValue, 'rgb(18, 52, 86)');
  writeFileSync(join(cwd, 'DESIGN.md'), '---\nname: Fluid\ntypography:\n  display:\n    fontSize: "clamp(2.5rem, 7vw, 4.5rem)"\n---\n');
  assert.equal(scan().some((item) => item.antipattern === 'design-system-font-size'), false);
  writeFileSync(join(cwd, 'DESIGN.md'), '---\nname: Example\ndescription: A chosen direction\n---\n');
  assert.equal(scan().some((item) => item.antipattern.startsWith('design-system-')), false);
});
