#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skippedDirectories = new Set([
  '.agents',
  '.build',
  '.cursor',
  '.git',
  '.tests',
  'node_modules',
  'agents',
  'skills/impeccable',
  'upstream/patches',
]);
const skippedFiles = new Set(['scripts/check-english.mjs', 'upstream/LICENSE']);
const textExtensions = new Set(['.json', '.md', '.mjs', '.js', '.svg']);
const textNames = new Set(['.gitattributes', '.gitignore', '.npmignore', 'LICENSE', 'NOTICE']);
const germanSignals = /[\u00c4\u00d6\u00dc\u00e4\u00f6\u00fc\u00df]|\b(?:fuer|ueber|zurueck|waehlen|faehigkeit|faehigkeiten|bestaetigung|ausdruecklich|veroeffentlichung|pruefen|prueft|projektbezogen|designarbeit|allgemeine|einstieg|entwicklung|grenzen|keine|bleibt|wird|werden|ausgefuehrt|bewusst|vorhanden|mehrere|passen|anfrage)\b/i;

function walk(relative = '.') {
  const files = [];
  for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
    const child = path.join(relative, entry.name).replace(/^\.\//, '').split(path.sep).join('/');
    if (entry.isDirectory()) {
      if (!skippedDirectories.has(child)) files.push(...walk(child));
    } else if (entry.isFile() && (textExtensions.has(path.extname(entry.name)) || textNames.has(entry.name)) && !skippedFiles.has(child)) {
      files.push(child);
    }
  }
  return files;
}

const findings = [];
for (const relative of walk()) {
  const lines = fs.readFileSync(path.join(root, relative), 'utf8').split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    const match = line.match(germanSignals);
    if (match) findings.push(`${relative}:${index + 1}: ${match[0]}`);
  }
}

if (findings.length > 0) {
  process.stderr.write(`First-party German text detected:\n${findings.map((finding) => `- ${finding}`).join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('First-party English-language check passed.\n');
}
