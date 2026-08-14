#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function walk(relative = '.') {
  const out = [];
  for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
    if (['.build', '.git', 'node_modules', '.tests'].includes(entry.name)) continue;
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) out.push(...walk(child));
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(child);
  }
  return out;
}

const failures = [];
let checked = 0;
for (const file of walk()) {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  const links = text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g);
  for (const match of links) {
    let target = match[1].trim().replace(/^<|>$/g, '');
    if (!target || /^(?:https?:|mailto:|#)/i.test(target) || target.includes('${')) continue;
    target = decodeURIComponent(target.split('#')[0]);
    const absolute = path.resolve(path.dirname(path.join(root, file)), target);
    checked += 1;
    if (!fs.existsSync(absolute)) failures.push(`${file}: ${match[1]}`);
  }
}

if (failures.length > 0) {
  process.stderr.write(`Broken local links:\n${failures.map((failure) => `- ${failure}`).join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Local link check passed (${checked} links).\n`);
}
