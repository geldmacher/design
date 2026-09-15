import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { buildCommandReference, renderCommandReference } from '../scripts/build-command-reference.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'design-command-reference-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const skillRoot = join(root, 'skills/impeccable');
  const write = (name, value) => {
    const file = join(root, name);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, value);
  };
  for (const name of ['polish', 'doctor', 'hooks']) write(`skills/impeccable/reference/${name}.md`, `# ${name}\n`);
  const skill = '---\nname: impeccable\nmetadata:\n  version: "4.3.1"\n---\n\n## Commands\n\n| Command | Category | Description | Reference |\n|---|---|---|---|\n| `polish [target]` | Refine | Finish the interface | [reference/polish.md](reference/polish.md) |\n\nRouting:\nOther instructions.\n';
  const metadata = { polish: { description: 'Polish the interface', argumentHint: '[target]' } };
  write('skills/impeccable/SKILL.md', skill);
  write('skills/impeccable/scripts/command-metadata.json', JSON.stringify(metadata));
  write('upstream/impeccable.pin.json', JSON.stringify({ version: '4.3.1' }));
  return { root, skillRoot, write, skill, metadata, render: () => renderCommandReference({ skillRoot, version: '4.3.1' }) };
}

test('reference generation is deterministic, includes invocation and helpers, and check never writes', t => {
  const f = fixture(t);
  const expected = f.render();
  assert.match(expected, /Bundled Impeccable \*\*4\.3\.1\*\*/);
  assert.match(expected, /`polish \[target\]` \| Refine \| Finish the interface/);
  assert.match(expected, /\.\.\/skills\/impeccable\/reference\/polish.md/);
  for (const text of ['/design doctor', '/impeccable doctor', '`diagnose`', '`teach`', '`craft`', 'local checkout']) assert.ok(expected.includes(text), text);
  assert.equal(f.render(), expected);
  assert.throws(() => buildCommandReference({ root: f.root, check: true }), /stale/);
  buildCommandReference({ root: f.root });
  assert.equal(buildCommandReference({ root: f.root, check: true }), expected);
  f.write('docs/commands.md', 'old content\n');
  assert.throws(() => buildCommandReference({ root: f.root, check: true }), /stale/);
  assert.equal(readFileSync(join(f.root, 'docs/commands.md'), 'utf8'), 'old content\n');
});

test('added, removed, renamed and changed commands follow the source table', t => {
  const f = fixture(t);
  const added = '| `refine [page]` | Fix | Refine a page | [reference/polish.md](reference/polish.md) |';
  f.write('skills/impeccable/SKILL.md', f.skill.replace('\n\nRouting:', `\n${added}\n\nRouting:`));
  assert.throws(f.render, /metadata for refine/);
  f.write('skills/impeccable/scripts/command-metadata.json', JSON.stringify({ ...f.metadata, refine: { description: 'Refine', argumentHint: '[page]' } }));
  assert.match(f.render(), /`refine \[page\]` \| Fix \| Refine a page/);
  f.write('skills/impeccable/SKILL.md', f.skill.replace('`polish [target]` | Refine | Finish the interface', '`refine [page]` | Fix | New purpose'));
  assert.throws(f.render, /inventor.*differ/);
  f.write('skills/impeccable/scripts/command-metadata.json', JSON.stringify({ refine: { description: 'Refine', argumentHint: '[page]' } }));
  const renamed = f.render();
  assert.match(renamed, /`refine \[page\]` \| Fix \| New purpose/);
  assert.doesNotMatch(renamed, /\| `polish \[target\]`/);
});

test('version drift, malformed tables, duplicate commands and missing references fail visibly', t => {
  const f = fixture(t);
  assert.throws(() => renderCommandReference({ skillRoot: f.skillRoot, version: '4.3.2' }), /version differs/);
  f.write('skills/impeccable/SKILL.md', f.skill.replace('4.3.1', '4.3.2'));
  assert.match(renderCommandReference({ skillRoot: f.skillRoot, version: '4.3.2' }), /\*\*4\.3\.2\*\*/);
  for (const [skill, error] of [
    [f.skill.replace('## Commands', '## Operations'), /Commands section/],
    [f.skill.replace('| Category |', '| Kind |'), /table format/],
    [f.skill.replace('`polish [target]`', 'polish'), /command row/],
    [f.skill.replace('(reference/polish.md)', '(reference/missing.md)'), /missing or unsupported reference/],
    [f.skill.replace('\n\nRouting:', '\n' + f.skill.split('\n').find(line => line.startsWith('| `polish')) + '\n\nRouting:'), /duplicate command/],
  ]) {
    f.write('skills/impeccable/SKILL.md', skill);
    assert.throws(f.render, error);
  }
});
